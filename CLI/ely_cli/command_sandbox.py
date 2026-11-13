"""OS-isolated command execution for agent-issued workspace commands.

The workspace is copied without hidden/private/vendor paths, then exposed only
inside bubblewrap or Linux Landlock plus a network namespace. If the host cannot
provide real filesystem isolation, execution is rejected rather than falling
back to the Ely process' privileges.
"""
from __future__ import annotations

import difflib
import fnmatch
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
        command_argv = argv_for(profile, command)
        isolated_cwd = snapshot if rel_cwd == "." else snapshot / rel_cwd
        if not bwrap:
            try:
                proc = os_isolation.run(command_argv, cwd=str(isolated_cwd), workspace=str(snapshot),
                                        timeout=timeout, writable=(mode == "workspace"))
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
                                      "network_isolated": True, "filesystem_isolated": True,
                                      "isolation": "landlock+network-namespace",
                                      "files_snapshot": count, "bytes_snapshot": byte_count}
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
        argv.extend(["--proc", "/proc", "--dev", "/dev", "--tmpfs", "/tmp"])
        if mode == "read_only":
            argv.extend(["--ro-bind", str(snapshot), "/workspace"])
        else:
            argv.extend(["--bind", str(snapshot), "/workspace"])
        run_cwd = "/workspace" if rel_cwd == "." else "/workspace/" + rel_cwd
        argv.extend(["--chdir", run_cwd, "--setenv", "HOME", "/tmp", "--setenv", "PATH", "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin", "--"])
        # Localhost-only service fixtures are useful for unit tests. Bring up
        # loopback inside this private net namespace; no host/external interface
        # or route is shared. The wrapper then execs the requested command.
        bootstrap = ("import os,shutil,subprocess,sys; ip=shutil.which('ip'); "
                     "subprocess.run([ip,'link','set','lo','up'],stdout=subprocess.DEVNULL,"
                     "stderr=subprocess.DEVNULL) if ip else None; "
                     "os.execvpe(sys.argv[1],sys.argv[1:],os.environ)")
        argv.extend([sys.executable, "-c", bootstrap, *command_argv])
        try:
            proc = subprocess.run(argv, capture_output=True, text=True, timeout=timeout,
                                  env={"PATH": "/usr/bin:/bin", "LANG": "C.UTF-8"})
            code, stdout, stderr = proc.returncode, proc.stdout[-8_000:], proc.stderr[-8_000:]
        except subprocess.TimeoutExpired as exc:
            code, stdout = 124, str(exc.stdout or "")[-8_000:]
            stderr = f"tiempo de espera agotado ({timeout} s)"
        result: dict[str, Any] = {"ok": code == 0, "code": code, "stdout": stdout,
                                  "stderr": stderr, "sandboxed": True, "mode": mode,
                                  "network_isolated": True, "files_snapshot": count,
                                  "bytes_snapshot": byte_count}
        if mode == "workspace":
            result["diff"] = _diff(root, snapshot)
            result["changes_applied"] = False
        return result
    finally:
        shutil.rmtree(temp, ignore_errors=True)
