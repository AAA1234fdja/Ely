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
MAX_ENTRIES = 900


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


def write_file(root: Path, rel: str, content: str) -> dict[str, Any]:
    target = _safe(root, rel)
    if target.suffix.lower() not in TEXT_EXT:
        raise WorkspaceError(415, f"Extensión no editable: {target.suffix or '(sin extensión)'}")
    existed = target.is_file()
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")
    return {"path": rel, "size": target.stat().st_size, "created": not existed, "saved": True}


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
