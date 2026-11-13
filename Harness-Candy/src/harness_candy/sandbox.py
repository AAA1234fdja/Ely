"""Fail-closed OS sandbox for Harness-Candy command execution.

Commands run in a temporary filesystem visible only through bubblewrap. The
workspace is not mounted; callers may provide narrowly scoped ``extra_files``.
When bubblewrap or its namespaces are unavailable, commands are not executed.
"""
from __future__ import annotations

import base64
import ctypes
import json
import os
import platform
import shutil
import subprocess
import sys
import tempfile
import time
from dataclasses import dataclass, field
from pathlib import Path


def _probe_unshare() -> bool:
    """True when Landlock and a network namespace can be created."""
    if platform.system() != "Linux" or platform.machine() not in {"x86_64", "aarch64", "armv7l", "riscv64", "i686", "i386"}:
        return False
    try:
        libc = ctypes.CDLL(None, use_errno=True)
        if libc.syscall(444, None, 0, 1) < 1:
            return False
        unshare = shutil.which("unshare")
        return bool(unshare and subprocess.run([unshare, "-rn", "true"], capture_output=True, timeout=5).returncode == 0)
    except Exception:
        return False


@dataclass
class SandboxResult:
    command: list[str]
    returncode: int
    stdout: str
    stderr: str
    timed_out: bool
    duration: float
    workdir: str
    network_isolated: bool
    extra: dict = field(default_factory=dict)

    @property
    def ok(self) -> bool:
        return self.returncode == 0 and not self.timed_out and bool(self.extra.get("filesystem_isolated"))

    def to_dict(self) -> dict:
        return {
            "command": self.command,
            "returncode": self.returncode,
            "stdout": self.stdout[-4000:],
            "stderr": self.stderr[-4000:],
            "timed_out": self.timed_out,
            "duration": round(self.duration, 3),
            "network_isolated": self.network_isolated,
            "filesystem_isolated": bool(self.extra.get("filesystem_isolated")),
        }


def run_sandboxed(
    command: list[str] | str,
    *,
    timeout: float = 30.0,
    allow_network: bool = False,
    env: dict | None = None,
    extra_files: dict[str, str] | None = None,
) -> SandboxResult:
    """Execute only with filesystem isolation; reject unsafe fallback paths."""
    cmd = [command] if isinstance(command, str) else list(command)
    started = time.monotonic()
    workdir = tempfile.mkdtemp(prefix="xev-sandbox-")
    if not _probe_unshare():
        shutil.rmtree(workdir, ignore_errors=True)
        return SandboxResult(cmd, 126, "", "Ejecución bloqueada: Landlock/unshare no está disponible; no se ejecutó el comando.",
                             False, time.monotonic() - started, workdir, False,
                             {"cwd_efimero": True, "filesystem_isolated": False, "blocked": True})
    try:
        if extra_files:
            for name, content in extra_files.items():
                rel = Path(name)
                if rel.is_absolute() or ".." in rel.parts or not rel.parts:
                    raise ValueError("extra_files solo acepta rutas relativas dentro del sandbox")
                target = Path(workdir) / rel
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text(content, encoding="utf-8")
        safe_env = {"PATH": "/usr/local/bin:/usr/bin:/bin", "HOME": workdir,
                    "TMPDIR": workdir, "LANG": "C.UTF-8", "PYTHONDONTWRITEBYTECODE": "1"}
        if env:
            for key, value in env.items():
                if not any(mark in str(key).upper() for mark in ("KEY", "TOKEN", "SECRET", "PASSWORD", "CREDENTIAL")):
                    safe_env[str(key)] = str(value)
        # Extra files are addressed inside the isolated temporary workspace.
        sandbox_cmd = [str(arg).replace("/workspace/", workdir.rstrip("/") + "/") for arg in cmd]
        config = base64.b64encode(json.dumps({"command": sandbox_cmd, "cwd": workdir,
                                              "allow_network": allow_network}).encode()).decode()
        bootstrap = r'''import base64,ctypes,json,os,sys
c=json.loads(base64.b64decode(sys.argv[1])); libc=ctypes.CDLL(None,use_errno=True)
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
work=read | sum(1<<n for n in (1,4,5,7,8,9,10,12,13,14) if (n<13 or abi>=2) and (n<14 or abi>=3))
add(c["cwd"],work)
if os.path.exists("/tmp"): add("/tmp",(1<<0)|(1<<3))
if libc.prctl(38,1,0,0,0)!=0: raise OSError(ctypes.get_errno(),"no_new_privs")
if libc.syscall(446,r,0)!=0: raise OSError(ctypes.get_errno(),"landlock_restrict_self")
os.close(r)
cmd=c["command"]; os.execvpe(cmd[0],cmd,os.environ)
'''
        unshare = shutil.which("unshare")
        flags = "-r" + ("" if allow_network else "n")
        wrapped = [unshare, flags, "--kill-child", sys.executable, "-c", bootstrap, config]
        proc = subprocess.run(wrapped, cwd=workdir, env=safe_env, capture_output=True,
                              text=True, timeout=timeout)
        return SandboxResult(cmd, proc.returncode, proc.stdout, proc.stderr, False,
                             time.monotonic() - started, workdir, not allow_network,
                             {"cwd_efimero": True, "filesystem_isolated": True, "isolation": "landlock+user-namespace"})
    except subprocess.TimeoutExpired as exc:
        stdout = exc.stdout.decode("utf-8", "replace") if isinstance(exc.stdout, bytes) else (exc.stdout or "")
        stderr = exc.stderr.decode("utf-8", "replace") if isinstance(exc.stderr, bytes) else (exc.stderr or "")
        return SandboxResult(cmd, 124, stdout, stderr + f"\n[timeout] comando excedio {timeout}s", True,
                             time.monotonic() - started, workdir, not allow_network,
                             {"cwd_efimero": True, "filesystem_isolated": True})
    except (OSError, subprocess.SubprocessError) as exc:
        return SandboxResult(cmd, 126, "", f"Ejecución bloqueada: no se pudo establecer el sandbox: {exc}",
                             False, time.monotonic() - started, workdir, False,
                             {"cwd_efimero": True, "filesystem_isolated": False, "blocked": True})
    finally:
        shutil.rmtree(workdir, ignore_errors=True)
