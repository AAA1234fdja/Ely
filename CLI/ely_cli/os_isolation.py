"""Linux Landlock filesystem confinement for subprocesses (fail closed)."""
from __future__ import annotations

import base64
import ctypes
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


def _raise_errno(label: str) -> None:
    err = ctypes.get_errno()
    raise OSError(err, f"{label}: {os.strerror(err)}")


def landlock_preexec(workspace: str, *, writable: bool) -> None:
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

    read_rights = _EXECUTE | _READ_FILE | _READ_DIR
    for path in ("/usr", "/proc", "/dev"):
        if Path(path).exists():
            add(path, read_rights)
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
    return landlock_abi() >= 1 and shutil.which("unshare") is not None


def run(command: list[str], *, cwd: str, timeout: int, writable: bool, workspace: str | None = None) -> subprocess.CompletedProcess:
    """Enter the network namespace first, then Landlock before user code runs."""
    if not available():
        raise RuntimeError("Landlock/unshare no está disponible; ejecución bloqueada")
    unshare = shutil.which("unshare")
    config = base64.b64encode(json.dumps({"command": command, "cwd": cwd, "workspace": workspace or cwd, "writable": writable, "ip": shutil.which("ip")}).encode()).decode()
    # This fixed bootstrap runs inside the isolated network namespace. It applies
    # Landlock before execve of the requested command; command text is only data.
    bootstrap = r'''import base64,ctypes,json,os,sys,subprocess
c=json.loads(base64.b64decode(sys.argv[1])); libc=ctypes.CDLL(None,use_errno=True)
# Bring up only loopback inside the private network namespace for local test fixtures.
# No external interfaces/routes are created or shared with the host.
if c.get("ip"): subprocess.run([c["ip"],"link","set","lo","up"],check=False,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
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
read=(1<<0)|(1<<2)|(1<<3)
for p in ("/usr","/proc","/dev"):
 if os.path.exists(p): add(p,read)
work=read
if c["writable"]: work|=sum(1<<n for n in (1,4,5,7,8,9,10,12,13,14) if (n<13 or abi>=2) and (n<14 or abi>=3))
add(c["workspace"],work)
if os.path.exists("/tmp"): add("/tmp",(1<<0)|(1<<3))
if libc.prctl(38,1,0,0,0)!=0: raise OSError(ctypes.get_errno(),"no_new_privs")
if libc.syscall(446,r,0)!=0: raise OSError(ctypes.get_errno(),"landlock_restrict_self")
os.close(r)
cmd=c["command"]; os.execvpe(cmd[0],cmd,os.environ)
'''
    safe_env = {"PATH": "/usr/local/bin:/usr/bin:/bin", "HOME": cwd, "TMPDIR": cwd,
                "LANG": "C.UTF-8", "PYTHONDONTWRITEBYTECODE": "1"}
    wrapped = [unshare, "-rn", "--kill-child", sys.executable, "-c", bootstrap, config]
    return subprocess.run(wrapped, cwd=cwd, env=safe_env, capture_output=True, text=True,
                          timeout=timeout)
