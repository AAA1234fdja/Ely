"""Ely IDE · terminal integrada: perfiles reales, puertos y diagnóstico.

La terminal del IDE no es un PTY completo: ejecuta cada línea con el intérprete
del perfil elegido (bash, zsh, sh, PowerShell, Python, Node…) y devuelve su
salida. Aquí se detecta qué intérpretes existen de verdad en la máquina, se
resuelven los puertos en escucha y se valida la sintaxis de los documentos
abiertos para el panel de Problemas.
"""
from __future__ import annotations

import ast
import json
import os
import platform
import shutil
import socket
from pathlib import Path
from typing import Any

from .workspace import WorkspaceError

# Perfiles candidatos, en el orden en que se listan en el menú «+».
# kind: shell (prompt de sistema) | repl (intérprete interactivo).
CANDIDATES: list[tuple[str, str, tuple[str, ...], str]] = [
    ("pwsh", "PowerShell", ("pwsh", "powershell"), "shell"),
    ("bash", "Bash", ("bash",), "shell"),
    ("zsh", "Zsh", ("zsh",), "shell"),
    ("fish", "Fish", ("fish",), "shell"),
    ("sh", "Shell (sh)", ("sh",), "shell"),
    ("python", "Python", ("python3", "python"), "repl"),
    ("node", "Node.js", ("node",), "repl"),
]

# Cómo se le pasa un comando a cada intérprete.
FLAGS: dict[str, list[str]] = {
    "pwsh": ["-NoLogo", "-NonInteractive", "-Command"],
    "bash": ["-c"], "zsh": ["-c"], "fish": ["-c"], "sh": ["-c"],
    "python": ["-c"], "node": ["-e"],
}


def profiles(root: Path) -> dict[str, Any]:
    """Intérpretes disponibles de verdad + datos para dibujar el prompt."""
    found = []
    for pid, label, bins, kind in CANDIDATES:
        exe = next((shutil.which(b) for b in bins if shutil.which(b)), None)
        if not exe:
            continue
        found.append({"id": pid, "label": label, "path": exe, "kind": kind})
    if not found:  # pragma: no cover - siempre hay /bin/sh en POSIX
        raise WorkspaceError(500, "No hay ningún intérprete disponible")
    preferred = os.environ.get("ELY_TERMINAL_PROFILE", "")
    ids = [p["id"] for p in found]
    default = preferred if preferred in ids else ("pwsh" if "pwsh" in ids else ids[0])
    home = str(Path.home())
    return {
        "profiles": found, "default": default,
        "platform": platform.system().lower(), "sep": os.sep,
        "user": os.environ.get("USER") or os.environ.get("USERNAME") or "ely",
        "host": socket.gethostname().split(".")[0], "home": home,
        "root": str(Path(root).resolve()), "rootName": Path(root).resolve().name,
    }


def argv_for(profile: str, command: str) -> list[str]:
    """argv real del perfil; rechaza perfiles inexistentes (nada de inventar)."""
    pid = str(profile or "").strip().lower()
    if not pid:
        return ["/bin/sh", "-c", command]
    row = next((c for c in CANDIDATES if c[0] == pid), None)
    if row is None:
        raise WorkspaceError(400, f"Perfil de terminal desconocido: {pid}")
    exe = next((shutil.which(b) for b in row[2] if shutil.which(b)), None)
    if not exe:
        raise WorkspaceError(400, f"El perfil {row[1]} no está instalado")
    return [exe, *FLAGS[pid], command]


# ------------------------------------------------------------------ puertos
def _listen_inodes() -> dict[str, dict]:
    """Puertos TCP en escucha leídos de /proc (Linux)."""
    out: dict[str, dict] = {}
    for name, fam in (("tcp", "IPv4"), ("tcp6", "IPv6")):
        path = Path("/proc/net") / name
        if not path.is_file():
            continue
        try:
            lines = path.read_text(encoding="utf-8").splitlines()[1:]
        except OSError:  # pragma: no cover
            continue
        for line in lines:
            cols = line.split()
            if len(cols) < 10 or cols[3] != "0A":  # 0A = LISTEN
                continue
            try:
                port = int(cols[1].split(":")[1], 16)
            except (ValueError, IndexError):  # pragma: no cover
                continue
            out[cols[9]] = {"port": port, "family": fam, "inode": cols[9], "pid": None, "process": ""}
    return out


def _pid_names(inodes: dict[str, dict]) -> None:
    """Asocia inode→proceso sólo para los PID visibles del usuario actual."""
    if not inodes:
        return
    mine = set(inodes)
    seen = 0
    for proc in Path("/proc").iterdir():
        if not proc.name.isdigit() or seen > 400:
            continue
        seen += 1
        fd_dir = proc / "fd"
        try:
            for fd in fd_dir.iterdir():
                try:
                    target = os.readlink(fd)
                except OSError:
                    continue
                if not target.startswith("socket:["):
                    continue
                inode = target[8:-1]
                if inode in mine:
                    row = inodes[inode]
                    row["pid"] = int(proc.name)
                    try:
                        row["process"] = (proc / "comm").read_text(encoding="utf-8").strip()
                    except OSError:  # pragma: no cover
                        row["process"] = ""
                    mine.discard(inode)
        except OSError:
            continue
        if not mine:
            break


def ports(root: Path) -> dict[str, Any]:
    """Panel Puertos: lo que hay escuchando de verdad, sin inventar nada."""
    inodes = _listen_inodes()
    _pid_names(inodes)
    rows = sorted(inodes.values(), key=lambda r: r["port"])
    for row in rows:
        row["local"] = f"http://localhost:{row['port']}"
        row["forwarded"] = False
    return {"ports": rows, "supported": Path("/proc/net/tcp").is_file()}


# ------------------------------------------------------------------ problemas
def _py_problems(text: str) -> list[dict]:
    try:
        ast.parse(text)
    except SyntaxError as exc:
        return [{"line": exc.lineno or 1, "col": exc.offset or 1, "severity": "error",
                 "message": exc.msg, "source": "Python"}]
    return []


def _json_problems(text: str) -> list[dict]:
    try:
        json.loads(text)
    except json.JSONDecodeError as exc:
        return [{"line": exc.lineno, "col": exc.colno, "severity": "error",
                 "message": exc.msg, "source": "JSON"}]
    return []


def diagnostics(root: Path, path: str, content: str = "") -> dict[str, Any]:
    """Validación real del documento abierto (sin escribir nada en disco)."""
    text = content
    if not text:
        from .workspace import _safe
        target = _safe(root, path)
        if not target.is_file():
            return {"problems": [], "path": path}
        text = target.read_text(encoding="utf-8", errors="replace")[:400_000]
    ext = str(path).rsplit(".", 1)[-1].lower() if "." in str(path) else ""
    if ext in ("py", "pyi", "pyw"):
        problems = _py_problems(text)
    elif ext in ("json", "jsonl", "ipynb"):
        problems = _json_problems(text) if ext != "jsonl" else []
    else:
        problems = []
    # Avisos de estilo que VS Code también señala en el editor.
    for n, line in enumerate(text.splitlines()[:5000], start=1):
        if line.startswith("\t") and any(l.startswith("    ") for l in text.splitlines()[:200]):
            problems.append({"line": n, "col": 1, "severity": "warning",
                             "message": "Mezcla de tabuladores y espacios", "source": "Ely"})
            break
    for row in problems:
        row["path"] = path
    return {"problems": problems[:200], "path": path}
