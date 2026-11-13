"""OS-isolated command execution for agent-issued workspace commands.

The workspace is copied without hidden/private/vendor paths, then exposed only
inside bubblewrap or Linux Landlock plus a network namespace. If the host cannot
provide real filesystem isolation, execution is rejected rather than falling
back to the Ely process' privileges.
"""
from __future__ import annotations

import difflib
import fnmatch
import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any

BLOCKED_DIRS = {
    ".git", ".ely", ".ssh", ".aws", ".config", ".cache", ".local",
    "node_modules", "__pycache__", ".venv", "venv", "dist", "build",
    "target", "coverage", "IDE/src", "laya-main",
}
BLOCKED_NAMES = {"keys.env", "test-keys.env", "credentials.json", "secrets.json", ".npmrc", ".pypirc", "id_rsa", "id_ed25519"}
MAX_FILES = 20_000
MAX_BYTES = 150_000_000

_BWRAP_SECCOMP_BOOTSTRAP = r'''import ctypes,json,os,shutil,subprocess,sys
c=json.loads(sys.argv[1]); ip=shutil.which("ip")
if ip: subprocess.run([ip,"link","set","lo","up"],check=False,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
libc=ctypes.CDLL(None,use_errno=True)
abi=libc.syscall(444,None,0,1)
if abi<1: raise SystemExit("Landlock no disponible")
base=sum(1<<n for n in range(13)); handled=base|((1<<13) if abi>=2 else 0)|((1<<14) if abi>=3 else 0)
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
for p in ("/usr","/bin","/sbin","/lib","/lib64"):
 if os.path.exists(p): add(p,read)
for executable in c["allowed_executables"]:
 if os.path.isfile(executable): add(executable,1<<0)
work=read
if c["mode"]=="workspace": work|=sum(1<<n for n in (1,4,5,7,8,9,10,12,13,14) if (n<13 or abi>=2) and (n<14 or abi>=3))
add("/workspace",work)
if os.path.exists("/tmp"): add("/tmp",read|(1<<1)|(1<<4)|(1<<5)|(1<<7)|(1<<8)|(1<<9)|(1<<10)|(1<<12))
if libc.prctl(38,1,0,0,0)!=0: raise OSError(ctypes.get_errno(),"no_new_privs")
if libc.syscall(446,r,0)!=0: raise OSError(ctypes.get_errno(),"landlock_restrict_self")
os.close(r)
class F(ctypes.Structure): _fields_=[("code",ctypes.c_ushort),("jt",ctypes.c_ubyte),("jf",ctypes.c_ubyte),("k",ctypes.c_uint32)]
class Prog(ctypes.Structure): _fields_=[("len",ctypes.c_ushort),("filter",ctypes.POINTER(F))]
ins=[F(*item) for item in c["seccomp_filter"]]
array=(F*len(ins))(*ins); prog=Prog(len(ins),array)
if libc.prctl(22,2,ctypes.byref(prog),0,0)!=0: raise OSError(ctypes.get_errno(),"seccomp_install")
cmd=c["command"]; os.execvpe(cmd[0],cmd,os.environ)
'''


def available() -> bool:
    from . import os_isolation
    return bool(shutil.which("bwrap")) or os_isolation.available()


def _copy_safe_workspace(source: Path, destination: Path) -> tuple[int, int]:
    files = size = 0
    source = source.resolve()
    for current, dirs, names in os.walk(source, followlinks=False):
        base = Path(current)
        rel_dir = base.relative_to(source).as_posix()
        dirs[:] = [name for name in dirs if not name.startswith(".")
                   and name not in BLOCKED_DIRS
                   and f"{rel_dir}/{name}" not in BLOCKED_DIRS
                   and not (base / name).is_symlink()]
        out_dir = destination / rel_dir if rel_dir != "." else destination
        out_dir.mkdir(parents=True, exist_ok=True)
        for name in names:
            src = base / name
            if src.is_symlink() or name.startswith(".") or name.lower() in BLOCKED_NAMES:
                continue
            low = name.lower()
            if low.startswith(".env") or low.endswith((".pem", ".p12", ".pfx", ".key")) or "credential" in low or "secret" in low:
                continue
            try:
                if not src.is_file():
                    continue
                nbytes = src.stat().st_size
            except OSError:
                continue
            if nbytes > 20_000_000:
                continue
            files += 1
            size += nbytes
            if files > MAX_FILES or size > MAX_BYTES:
                raise RuntimeError("El workspace excede el límite seguro de snapshot (20 000 archivos / 150 MB). Reduce el alcance y vuelve a intentarlo.")
            target = out_dir / name
            shutil.copyfile(src, target)
            try:
                target.chmod(src.stat().st_mode & 0o777)
            except OSError:
                pass
    return files, size


def _diff(source: Path, copy: Path, limit: int = 12_000) -> str:
    chunks: list[str] = []
    seen = 0
    for path in sorted(p for p in copy.rglob("*") if p.is_file()):
        rel = path.relative_to(copy)
        original = source / rel
        try:
            new_text = path.read_text(encoding="utf-8")
            old_text = original.read_text(encoding="utf-8") if original.is_file() else ""
        except (OSError, UnicodeDecodeError):
            continue
        if new_text == old_text:
            continue
        delta = difflib.unified_diff(old_text.splitlines(True), new_text.splitlines(True),
                                     fromfile=f"a/{rel}", tofile=f"b/{rel}")
        piece = "".join(delta)
        if piece:
            chunks.append(piece)
            seen += len(piece)
            if seen >= limit:
                chunks.append("\n[diff truncado]\n")
                break
    return "".join(chunks)[:limit]


def run(root: Path, command: str, cwd: str = "", *, mode: str = "workspace", timeout: int = 20, profile: str = "bash") -> dict[str, Any]:
    """Run in one of: read_only, workspace (copy + diff), or full.

    ``full`` is intentionally unavailable to agent tool calls. The interactive
    terminal is a separate, user-authored command surface.
    """
    if mode not in {"read_only", "workspace"}:
        raise ValueError("El agente solo puede usar los modos read_only o workspace; el modo full requiere una acción directa del usuario en la terminal.")
    bwrap = shutil.which("bwrap")
    from . import os_isolation
    try:
        seccomp_filter = os_isolation.seccomp_filter_program()
        from .security_profiles import apparmor_exec_prefix, apparmor_profile
        apparmor_prefix = apparmor_exec_prefix()
        apparmor_name = apparmor_profile()
    except (RuntimeError, ValueError) as exc:
        return {"ok": False, "error": f"Ejecución bloqueada: {exc}", "sandboxed": False, "mode": mode}
    if not bwrap and not os_isolation.available():
        return {"ok": False, "error": "Ejecución bloqueada: no hay un sandbox de sistema operativo disponible. Se requiere bubblewrap o Landlock + unshare.", "sandboxed": False, "mode": mode}
    root = root.resolve()
    if cwd:
        target = (root / cwd).resolve(strict=True)
        if target != root and root not in target.parents or not target.is_dir():
            raise ValueError("cwd debe ser un directorio del workspace")
        rel_cwd = target.relative_to(root).as_posix()
    else:
        rel_cwd = "."
    temp = Path(tempfile.mkdtemp(prefix="ely-agent-sandbox-"))
    snapshot = temp / "workspace"
    try:
        count, byte_count = _copy_safe_workspace(root, snapshot)
        from .termops import argv_for
        from .exec_policy import allowed_executable_paths
        command_argv = argv_for(profile, command)
        allowed_executables = allowed_executable_paths(command_argv)
        isolated_cwd = snapshot if rel_cwd == "." else snapshot / rel_cwd
        if not bwrap:
            try:
                proc = os_isolation.run(command_argv, cwd=str(isolated_cwd), workspace=str(snapshot),
                                        timeout=timeout, writable=(mode == "workspace"),
                                        allowed_executables=allowed_executables)
                code, stdout, stderr = proc.returncode, proc.stdout[-8_000:], proc.stderr[-8_000:]
            except subprocess.TimeoutExpired as exc:
                code = 124
                stdout = str(exc.stdout or "")[-8_000:]
                stderr = f"tiempo de espera agotado ({timeout} s)"
            except Exception as exc:
                return {"ok": False, "error": f"Ejecución bloqueada por el sandbox: {exc}",
                        "sandboxed": False, "mode": mode}
            result: dict[str, Any] = {"ok": code == 0, "code": code, "stdout": stdout,
                                      "stderr": stderr, "sandboxed": True, "mode": mode,
                                      "network_isolated": True, "pid_isolated": True,
                                      "user_isolated": True, "filesystem_isolated": True,
                                      "seccomp": True, "executable_allowlist": True,
                                      "isolation": "landlock+exec-allowlist+user/pid/network-namespaces+seccomp-bpf",
                                      "files_snapshot": count, "bytes_snapshot": byte_count}
            if apparmor_name:
                result["apparmor_profile"] = apparmor_name
            if mode == "workspace":
                result["diff"] = _diff(root, snapshot)
                result["changes_applied"] = False
            return result
        argv = [
            bwrap, "--unshare-all", "--die-with-parent", "--new-session",
            "--ro-bind", "/usr", "/usr",
        ]
        for path in ("/bin", "/sbin", "/lib", "/lib64"):
            if Path(path).exists():
                argv.extend(["--ro-bind", path, path])
        argv.extend(["--dir", "/etc"])
        # Keep these kernel/device pseudo-filesystems empty and inaccessible.
        # The sandbox gets anonymous pipes for stdio, so it needs no device nodes.
        for path in ("/proc", "/sys", "/dev"):
            argv.extend(["--dir", path, "--tmpfs", path])
        argv.extend(["--tmpfs", "/tmp"])
        if mode == "read_only":
            argv.extend(["--ro-bind", str(snapshot), "/workspace"])
        else:
            argv.extend(["--bind", str(snapshot), "/workspace"])
        run_cwd = "/workspace" if rel_cwd == "." else "/workspace/" + rel_cwd
        argv.extend(["--chdir", run_cwd, "--setenv", "HOME", "/tmp", "--setenv", "PATH", "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin", "--"])
        # Localhost-only service fixtures are useful for unit tests. Bring up
        # loopback inside this private net namespace before installing seccomp.
        # No host/external interface or route is shared with the sandbox.
        seccomp_config = {
            "command": command_argv, "seccomp_filter": seccomp_filter,
            "mode": mode, "allowed_executables": allowed_executables,
        }
        argv.extend([*apparmor_prefix, sys.executable, "-c", _BWRAP_SECCOMP_BOOTSTRAP,
                     json.dumps(seccomp_config)])
        try:
            proc = subprocess.run(argv, capture_output=True, text=True, timeout=timeout,
                                  env={"PATH": "/usr/bin:/bin", "LANG": "C.UTF-8"})
            code, stdout, stderr = proc.returncode, proc.stdout[-8_000:], proc.stderr[-8_000:]
        except subprocess.TimeoutExpired as exc:
            code, stdout = 124, str(exc.stdout or "")[-8_000:]
            stderr = f"tiempo de espera agotado ({timeout} s)"
        result: dict[str, Any] = {"ok": code == 0, "code": code, "stdout": stdout,
                                  "stderr": stderr, "sandboxed": True, "mode": mode,
                                  "network_isolated": True, "pid_isolated": True,
                                  "user_isolated": True, "seccomp": True,
                                  "executable_allowlist": True,
                                  "files_snapshot": count, "bytes_snapshot": byte_count}
        if apparmor_name:
            result["apparmor_profile"] = apparmor_name
        if mode == "workspace":
            result["diff"] = _diff(root, snapshot)
            result["changes_applied"] = False
        return result
    finally:
        shutil.rmtree(temp, ignore_errors=True)
