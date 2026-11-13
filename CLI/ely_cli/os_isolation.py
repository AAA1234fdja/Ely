"""Linux Landlock filesystem and seccomp-BPF syscall confinement (fail closed)."""
from __future__ import annotations

import base64
import ctypes
import errno
import json
import os
import platform
import shutil
import subprocess
import sys
from pathlib import Path

# Landlock syscalls are numbered consistently across supported Linux arches.
_SYSCALL_CREATE = 444
_SYSCALL_ADD = 445
_SYSCALL_RESTRICT = 446
_VERSION = 1
_PATH_BENEATH = 1
_PR_SET_NO_NEW_PRIVS = 38
_PR_SET_SECCOMP = 22
_SECCOMP_MODE_FILTER = 2
_SECCOMP_RET_ALLOW = 0x7FFF0000
_SECCOMP_RET_ERRNO = 0x00050000
_BPF_LD_W_ABS = 0x20
_BPF_JMP_JEQ_K = 0x15
_BPF_JMP_JSET_K = 0x45
_BPF_RET_K = 0x06
_AUDIT_ARCH = {"x86_64": 0xC000003E, "aarch64": 0xC00000B7}

# Syscall numbers for the architectures supported by the fail-closed sandbox.
# This policy is intentionally deny-list based: common language runtimes and
# build tools continue to work, while operations that change namespaces,
# mount filesystems, inspect other processes, or load kernel functionality fail.
_BLOCKED_SYSCALLS = {
    "x86_64": {
        "ptrace": 101, "mount": 165, "umount2": 166, "pivot_root": 155,
        "setns": 308, "unshare": 272, "bpf": 321, "perf_event_open": 298,
        "keyctl": 250, "reboot": 169, "kexec_load": 246, "init_module": 175,
        "finit_module": 313, "delete_module": 176, "open_by_handle_at": 304,
        "userfaultfd": 323, "process_vm_readv": 310, "process_vm_writev": 311,
        "open_tree": 428, "move_mount": 429, "fsopen": 430, "fsconfig": 431,
        "fsmount": 432, "fspick": 433, "mount_setattr": 442,
    },
    "aarch64": {
        "ptrace": 117, "mount": 40, "umount2": 39, "pivot_root": 41,
        "setns": 268, "unshare": 97, "bpf": 280, "perf_event_open": 241,
        "keyctl": 219, "reboot": 142, "kexec_load": 104, "init_module": 105,
        "finit_module": 273, "delete_module": 106, "open_by_handle_at": 265,
        "userfaultfd": 282, "process_vm_readv": 270, "process_vm_writev": 271,
        "open_tree": 428, "move_mount": 429, "fsopen": 430, "fsconfig": 431,
        "fsmount": 432, "fspick": 433, "mount_setattr": 442,
    },
}

# Landlock access rights, ABI v1.
_EXECUTE = 1 << 0
_WRITE_FILE = 1 << 1
_READ_FILE = 1 << 2
_READ_DIR = 1 << 3
_REMOVE_DIR = 1 << 4
_REMOVE_FILE = 1 << 5
_MAKE_CHAR = 1 << 6
_MAKE_DIR = 1 << 7
_MAKE_REG = 1 << 8
_MAKE_SOCK = 1 << 9
_MAKE_FIFO = 1 << 10
_MAKE_BLOCK = 1 << 11
_MAKE_SYM = 1 << 12
_REFER = 1 << 13
_TRUNCATE = 1 << 14
_BASE_RIGHTS = (_EXECUTE | _WRITE_FILE | _READ_FILE | _READ_DIR | _REMOVE_DIR | _REMOVE_FILE |
                _MAKE_CHAR | _MAKE_DIR | _MAKE_REG | _MAKE_SOCK | _MAKE_FIFO | _MAKE_BLOCK | _MAKE_SYM)


def landlock_abi() -> int:
    if not sys_is_linux():
        return 0
    libc = ctypes.CDLL(None, use_errno=True)
    result = libc.syscall(_SYSCALL_CREATE, None, 0, _VERSION)
    return int(result) if result >= 1 else 0


def sys_is_linux() -> bool:
    return platform.system() == "Linux" and platform.machine() in {
        "x86_64", "aarch64", "armv7l", "riscv64", "i686", "i386",
    }


def blocked_syscall_numbers(machine: str | None = None) -> list[int]:
    """Return the deny-list supported by the current seccomp architecture."""
    architecture = (machine or platform.machine()).lower()
    if architecture not in _BLOCKED_SYSCALLS:
        raise RuntimeError(f"seccomp-bpf no tiene una política validada para {architecture}")
    return sorted(set(_BLOCKED_SYSCALLS[architecture].values()))


def seccomp_filter_program(machine: str | None = None) -> list[tuple[int, int, int, int]]:
    """Build classic BPF instructions; unsupported ABIs are rejected by the filter."""
    architecture = (machine or platform.machine()).lower()
    blocked = blocked_syscall_numbers(architecture)
    instructions = [
        (_BPF_LD_W_ABS, 0, 0, 4),  # seccomp_data.arch
        (_BPF_JMP_JEQ_K, 1, 0, _AUDIT_ARCH[architecture]),
        (_BPF_RET_K, 0, 0, _SECCOMP_RET_ERRNO | errno.EPERM),
        (_BPF_LD_W_ABS, 0, 0, 0),  # seccomp_data.nr
    ]
    if architecture == "x86_64":
        # x32 shares AUDIT_ARCH_X86_64 but uses a tagged syscall-number range.
        instructions.extend((
            (_BPF_JMP_JSET_K, 0, 1, 0x40000000),
            (_BPF_RET_K, 0, 0, _SECCOMP_RET_ERRNO | errno.EPERM),
        ))
    for syscall_number in blocked:
        instructions.extend((
            (_BPF_JMP_JEQ_K, 0, 1, syscall_number),
            (_BPF_RET_K, 0, 0, _SECCOMP_RET_ERRNO | errno.EPERM),
        ))
    instructions.append((_BPF_RET_K, 0, 0, _SECCOMP_RET_ALLOW))
    return instructions


def _raise_errno(label: str) -> None:
    err = ctypes.get_errno()
    raise OSError(err, f"{label}: {os.strerror(err)}")


def landlock_preexec(workspace: str, *, writable: bool, allowed_executables: list[str] | None = None) -> None:
    """Apply confinement in a child just before exec; raises to prevent fallback."""
    libc = ctypes.CDLL(None, use_errno=True)
    abi = landlock_abi()
    if abi < 1:
        raise OSError("Landlock filesystem isolation is unavailable")
    handled = _BASE_RIGHTS | (_REFER if abi >= 2 else 0) | (_TRUNCATE if abi >= 3 else 0)

    class RulesetAttr(ctypes.Structure):
        _fields_ = [("handled_access_fs", ctypes.c_uint64)]

    class PathBeneathAttr(ctypes.Structure):
        _fields_ = [("allowed_access", ctypes.c_uint64), ("parent_fd", ctypes.c_int32)]

    attr = RulesetAttr(handled)
    ruleset = libc.syscall(_SYSCALL_CREATE, ctypes.byref(attr), ctypes.sizeof(attr), 0)
    if ruleset < 0:
        _raise_errno("landlock_create_ruleset")

    def add(path: str, rights: int) -> None:
        resolved = Path(path).resolve(strict=True)
        fd = os.open(resolved, os.O_PATH | os.O_CLOEXEC)
        try:
            rule = PathBeneathAttr(rights & handled, fd)
            rc = libc.syscall(_SYSCALL_ADD, ruleset, _PATH_BENEATH, ctypes.byref(rule), 0)
            if rc < 0:
                _raise_errno("landlock_add_rule")
        finally:
            os.close(fd)

    read_rights = _READ_FILE | _READ_DIR
    # Deliberately do not grant procfs, sysfs, or device access to the child.
    for path in ("/usr", "/bin", "/sbin", "/lib", "/lib64"):
        if Path(path).exists():
            add(path, read_rights)
    for executable in allowed_executables or []:
        if Path(executable).is_file():
            add(executable, _EXECUTE)
    # Read/write access is confined to the task's temporary workspace.
    work_rights = read_rights
    if writable:
        work_rights |= (_WRITE_FILE | _REMOVE_DIR | _REMOVE_FILE | _MAKE_DIR | _MAKE_REG |
                        _MAKE_SOCK | _MAKE_FIFO | _MAKE_SYM | _REFER | _TRUNCATE)
    add(workspace, work_rights)
    # Permit directory traversal in /tmp without granting access to its contents.
    if Path("/tmp").exists():
        add("/tmp", _EXECUTE | _READ_DIR)

    if libc.prctl(_PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0) != 0:
        _raise_errno("PR_SET_NO_NEW_PRIVS")
    if libc.syscall(_SYSCALL_RESTRICT, ruleset, 0) != 0:
        _raise_errno("landlock_restrict_self")
    os.close(ruleset)


def available() -> bool:
    try:
        blocked_syscall_numbers()
    except RuntimeError:
        return False
    return landlock_abi() >= 1 and shutil.which("unshare") is not None


def run(command: list[str], *, cwd: str, timeout: int, writable: bool, workspace: str | None = None,
        allowed_executables: list[str] | None = None) -> subprocess.CompletedProcess:
    """Enter user/PID/network namespaces, then apply Landlock and seccomp."""
    if not available():
        raise RuntimeError("Landlock/unshare no está disponible; ejecución bloqueada")
    unshare = shutil.which("unshare")
    if allowed_executables is None:
        from .exec_policy import allowed_executable_paths
        allowed_executables = allowed_executable_paths(command)
    from .security_profiles import apparmor_exec_prefix
    apparmor_prefix = apparmor_exec_prefix()
    config = base64.b64encode(json.dumps({
        "command": command, "cwd": cwd, "workspace": workspace or cwd,
        "writable": writable, "ip": shutil.which("ip"),
        "seccomp_filter": seccomp_filter_program(),
        "allowed_executables": allowed_executables,
    }).encode()).decode()
    # This fixed bootstrap runs inside user, PID, and network namespaces. It
    # applies Landlock and seccomp before execve; command text remains data.
    bootstrap = r'''import base64,ctypes,json,os,sys,subprocess
c=json.loads(base64.b64decode(sys.argv[1])); libc=ctypes.CDLL(None,use_errno=True)
# Bring up only loopback inside the private network namespace for local test fixtures.
# No external interfaces/routes are created or shared with the host.
if c.get("ip"): subprocess.run([c["ip"],"link","set","lo","up"],check=False,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
abi=libc.syscall(444,None,0,1)
if abi < 1: raise SystemExit("Landlock no disponible")
base=sum(1<<n for n in range(13)); handled=base | ((1<<13) if abi>=2 else 0) | ((1<<14) if abi>=3 else 0)
class R(ctypes.Structure): _fields_=[("handled_access_fs",ctypes.c_uint64)]
class P(ctypes.Structure): _fields_=[("allowed_access",ctypes.c_uint64),("parent_fd",ctypes.c_int32)]
r=libc.syscall(444,ctypes.byref(R(handled)),ctypes.sizeof(R),0)
if r<0: raise OSError(ctypes.get_errno(),"landlock_create_ruleset")
def add(path,rights):
 fd=os.open(path,os.O_PATH|os.O_CLOEXEC)
 try:
  if libc.syscall(445,r,1,ctypes.byref(P(rights&handled,fd)),0)<0: raise OSError(ctypes.get_errno(),"landlock_add_rule")
 finally: os.close(fd)
read=(1<<2)|(1<<3)
# System trees are readable, but execution is granted only to allowlisted files.
# /proc, /sys, and /dev remain inaccessible.
for p in ("/usr","/bin","/sbin","/lib","/lib64"):
 if os.path.exists(p): add(p,read)
for executable in c["allowed_executables"]:
 if os.path.isfile(executable): add(executable,1<<0)
work=read
if c["writable"]: work|=sum(1<<n for n in (1,4,5,7,8,9,10,12,13,14) if (n<13 or abi>=2) and (n<14 or abi>=3))
add(c["workspace"],work)
if os.path.exists("/tmp"): add("/tmp",(1<<0)|(1<<3))
if libc.prctl(38,1,0,0,0)!=0: raise OSError(ctypes.get_errno(),"no_new_privs")
if libc.syscall(446,r,0)!=0: raise OSError(ctypes.get_errno(),"landlock_restrict_self")
os.close(r)
# Install a classic seccomp-BPF filter after namespace and Landlock setup.
# Unknown syscall architectures are denied instead of silently bypassing the policy.
class F(ctypes.Structure): _fields_=[("code",ctypes.c_ushort),("jt",ctypes.c_ubyte),("jf",ctypes.c_ubyte),("k",ctypes.c_uint32)]
class Prog(ctypes.Structure): _fields_=[("len",ctypes.c_ushort),("filter",ctypes.POINTER(F))]
ins=[F(*item) for item in c["seccomp_filter"]]
array=(F*len(ins))(*ins); prog=Prog(len(ins),array)
if libc.prctl(22,2,ctypes.byref(prog),0,0)!=0: raise OSError(ctypes.get_errno(),"seccomp_install")
cmd=c["command"]; os.execvpe(cmd[0],cmd,os.environ)
'''
    safe_env = {"PATH": "/usr/local/bin:/usr/bin:/bin", "HOME": cwd, "TMPDIR": cwd,
                "LANG": "C.UTF-8", "PYTHONDONTWRITEBYTECODE": "1"}
    wrapped = [
        unshare, "--user", "--map-root-user", "--pid", "--fork", "--net",
        "--kill-child", *apparmor_prefix, sys.executable, "-c", bootstrap, config,
    ]
    return subprocess.run(wrapped, cwd=cwd, env=safe_env, capture_output=True, text=True,
                          timeout=timeout)
