"""Acceso real al workspace del proyecto para el IDE y la vista de activos.

Solo lectura/escritura dentro de la raíz del repo, con lista blanca de
extensiones de texto. Nada de contenido inventado: si el archivo no existe,
se informa del error.
"""
from __future__ import annotations

import fnmatch
from pathlib import Path
from typing import Any

SKIP_DIRS = {
    ".git", ".ely", "node_modules", "__pycache__", ".venv", "venv", "dist", "build",
    ".next", ".cache", "target", ".mypy_cache", ".pytest_cache", ".ruff_cache", "coverage",
}
TEXT_EXT = {
    ".py", ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".json", ".jsonl", ".md", ".txt",
    ".css", ".html", ".htm", ".yml", ".yaml", ".toml", ".ini", ".cfg", ".env", ".sh",
    ".rs", ".go", ".java", ".c", ".h", ".cpp", ".sql", ".svg", ".csv", ".lock", "",
}
MAX_FILE = 400_000
# El árbol del workspace ahora incluye IDE/ con el código de VS Code; con 900
# entradas el árbol se truncaba antes de llegar a IDE/frontend. 6000 cubre el
# repo completo a profundidad 5 (~3800 entradas) sin truncar.
MAX_ENTRIES = 6000


class WorkspaceError(RuntimeError):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status


def _safe(root: Path, rel: str) -> Path:
    if not rel:
        raise WorkspaceError(400, "Falta la ruta del archivo")
    target = (root / rel).resolve()
    if target != root and root not in target.parents:
        raise WorkspaceError(403, "Ruta fuera del workspace")
    return target


def tree(root: Path, depth: int = 3) -> dict[str, Any]:
    entries: list[dict[str, Any]] = []
    truncated = False

    def walk(directory: Path, level: int) -> None:
        nonlocal truncated
        if level > depth or truncated:
            return
        try:
            children = sorted(directory.iterdir(), key=lambda p: (p.is_file(), p.name.lower()))
        except OSError:
            return
        for child in children:
            if child.name in SKIP_DIRS or child.name.startswith("."):
                continue
            rel = str(child.relative_to(root))
            if child.is_dir():
                entries.append({"path": rel, "type": "dir", "size": 0, "ext": ""})
                walk(child, level + 1)
            else:
                try:
                    size = child.stat().st_size
                except OSError:
                    continue
                entries.append({
                    "path": rel, "type": "file", "size": size,
                    "ext": child.suffix.lower().lstrip("."),
                    "editable": child.suffix.lower() in TEXT_EXT or not child.suffix,
                })
            if len(entries) >= MAX_ENTRIES:
                truncated = True
                return

    walk(root, 1)
    counts = {"files": sum(1 for e in entries if e["type"] == "file"),
              "dirs": sum(1 for e in entries if e["type"] == "dir"),
              "bytes": sum(e["size"] for e in entries)}
    return {"root": str(root), "entries": entries, "counts": counts,
            "truncated": truncated, "depth": depth}


def read_file(root: Path, rel: str) -> dict[str, Any]:
    target = _safe(root, rel)
    if target.is_dir():
        raise WorkspaceError(400, "Es un directorio")
    if not target.is_file():
        raise WorkspaceError(404, f"No existe: {rel}")
    if target.suffix.lower() not in TEXT_EXT:
        raise WorkspaceError(415, f"Extensión no editable: {target.suffix or '(sin extensión)'}")
    size = target.stat().st_size
    raw = target.read_bytes()[:MAX_FILE]
    try:
        content = raw.decode("utf-8")
        encoding = "utf-8"
    except UnicodeDecodeError:
        content = raw.decode("latin-1")
        encoding = "latin-1"
    return {
        "path": rel, "content": content, "size": size, "encoding": encoding,
        "lines": content.count("\n") + 1, "truncated": size > MAX_FILE,
    }


def raw_file(root: Path, rel: str) -> tuple[bytes, str]:
    """Bytes + content-type de un archivo del workspace (para PDF/imágenes)."""
    import mimetypes
    target = _safe(root, rel)
    if not target.is_file():
        raise WorkspaceError(404, f"No existe: {rel}")
    if target.stat().st_size > 20_000_000:
        raise WorkspaceError(413, "Archivo demasiado grande para el visor")
    ctype = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
    if ctype.startswith("text/") or ctype in {"application/javascript", "application/json", "image/svg+xml"}:
        ctype += "; charset=utf-8"
    return target.read_bytes(), ctype


def write_file(root: Path, rel: str, content: str) -> dict[str, Any]:
    target = _safe(root, rel)
    if target.suffix.lower() not in TEXT_EXT:
        raise WorkspaceError(415, f"Extensión no editable: {target.suffix or '(sin extensión)'}")
    existed = target.is_file()
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")
    return {"path": rel, "size": target.stat().st_size, "created": not existed, "saved": True}


def create_project(root: Path, name: str, template: str = "blank") -> dict[str, Any]:
    """Crea una carpeta de proyecto con archivos iniciales en el workspace."""
    import re as _re
    clean = _re.sub(r"[^A-Za-z0-9._-]", "-", str(name or "").strip()).strip("-.")
    if not clean:
        raise WorkspaceError(400, "Nombre de proyecto inválido")
    target = _safe(root, clean)
    if target.exists():
        raise WorkspaceError(409, f"Ya existe: {clean}")
    target.mkdir(parents=True)
    files: dict[str, str] = {
        "README.md": f"# {clean}\n\nProyecto creado desde Ely Cowork.\n",
    }
    if template == "web":
        files["index.html"] = (
            "<!doctype html>\n<html lang=\"es\">\n<head>\n<meta charset=\"utf-8\">\n"
            f"<title>{clean}</title>\n<link rel=\"stylesheet\" href=\"style.css\">\n</head>\n"
            f"<body>\n<h1>{clean}</h1>\n<p>Hola desde Ely.</p>\n<script src=\"main.js\"></script>\n</body>\n</html>\n"
        )
        files["style.css"] = "body{font-family:system-ui,sans-serif;margin:2rem;}\n"
        files["main.js"] = "console.log(\"Hola desde " + clean + "\");\n"
    elif template == "python":
        files["main.py"] = "def main():\n    print(\"Hola desde " + clean + "\")\n\n\nif __name__ == \"__main__\":\n    main()\n"
    elif template == "node":
        files["package.json"] = "{\n  \"name\": \"" + clean + "\",\n  \"version\": \"0.1.0\",\n  \"main\": \"index.js\"\n}\n"
        files["index.js"] = "console.log(\"Hola desde " + clean + "\");\n"
    for rel, content in files.items():
        (target / rel).write_text(content, encoding="utf-8")
    return {"path": clean, "files": list(files), "created": True}


def upload(root: Path, rel: str, data: bytes) -> dict[str, Any]:
    """Guarda bytes (texto o binario) en el workspace, creando directorios."""
    target = _safe(root, rel)
    if len(data) > 20_000_000:
        raise WorkspaceError(413, "Archivo demasiado grande (máx. 20 MB)")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
    return {"path": rel, "size": len(data), "saved": True}


def run_command(root: Path, command: str, cwd: str = "", profile: str = "") -> dict[str, Any]:
    """Ejecuta una línea con el intérprete del perfil elegido (terminal del IDE)."""
    import subprocess

    from . import termops
    base = _safe(root, cwd) if cwd else root.resolve()
    if not base.is_dir():
        base = root.resolve()
    cmd = str(command or "").strip()
    if not cmd:
        return {"stdout": "", "stderr": "", "code": 0, "cwd": cwd}
    root = root.resolve()
    if cmd == "cd" or cmd.startswith("cd "):
        target = cmd[2:].strip().strip('"').strip("'")
        new = root if not target or target == "~" else (base / target).resolve()
        if new != root and root not in new.parents:
            return {"stdout": "", "stderr": "cd: fuera del workspace", "code": 1, "cwd": cwd, "profile": profile}
        rel = "" if new == root else str(new.relative_to(root))
        return {"stdout": "", "stderr": "", "code": 0, "cwd": rel}
    try:
        argv = termops.argv_for(profile, cmd)
    except WorkspaceError as exc:
        return {"stdout": "", "stderr": str(exc), "code": 1, "cwd": cwd, "profile": profile}
    try:
        proc = subprocess.run(argv, cwd=str(base), capture_output=True,
                              text=True, timeout=20)
        return {"stdout": proc.stdout[-20000:], "stderr": proc.stderr[-20000:],
                "code": proc.returncode, "cwd": cwd, "profile": profile}
    except subprocess.TimeoutExpired:
        return {"stdout": "", "stderr": "tiempo de espera agotado (20 s)", "code": 124, "cwd": cwd}
    except OSError as exc:
        return {"stdout": "", "stderr": str(exc), "code": 1, "cwd": cwd}


def search(root: Path, query: str, limit: int = 200) -> dict[str, Any]:
    """Búsqueda de texto en los archivos del workspace (case-insensitive)."""
    q = str(query or "").strip()
    if len(q) < 2:
        raise WorkspaceError(400, "Escribe al menos 2 caracteres")
    needle = q.lower()
    matches: list[dict[str, Any]] = []
    scanned = 0
    for path in sorted(root.rglob("*")):
        if len(matches) >= limit:
            break
        if not path.is_file():
            continue
        rel_parts = path.relative_to(root).parts
        if any(p in SKIP_DIRS or p.startswith(".") for p in rel_parts[:-1]):
            continue
        if path.suffix.lower() not in TEXT_EXT:
            continue
        try:
            if path.stat().st_size > MAX_FILE:
                continue
            text = path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        scanned += 1
        rel = str(path.relative_to(root))
        for i, line in enumerate(text.splitlines(), 1):
            if needle in line.lower():
                matches.append({"path": rel, "line": i, "text": line.strip()[:200]})
                if len(matches) >= limit:
                    break
    return {"query": q, "matches": matches, "scanned": scanned, "truncated": len(matches) >= limit}


def assets(root: Path) -> dict[str, Any]:
    """Inventario real del repositorio agrupado por carpeta de primer nivel."""
    groups: dict[str, dict[str, Any]] = {}
    total = 0
    for path in root.rglob("*"):
        rel_parts = path.relative_to(root).parts
        if any(part in SKIP_DIRS or part.startswith(".") for part in rel_parts):
            continue
        if not path.is_file():
            continue
        try:
            size = path.stat().st_size
        except OSError:
            continue
        group = rel_parts[0] if len(rel_parts) > 1 else "(raíz)"
        bucket = groups.setdefault(group, {"group": group, "files": 0, "bytes": 0, "exts": {}})
        bucket["files"] += 1
        bucket["bytes"] += size
        ext = path.suffix.lower() or "(sin ext)"
        bucket["exts"][ext] = bucket["exts"].get(ext, 0) + 1
        total += size
    for bucket in groups.values():
        bucket["exts"] = sorted(bucket["exts"].items(), key=lambda kv: -kv[1])[:6]
    ordered = sorted(groups.values(), key=lambda g: -g["bytes"])
    return {"groups": ordered, "total_bytes": total, "total_files": sum(g["files"] for g in groups.values())}
