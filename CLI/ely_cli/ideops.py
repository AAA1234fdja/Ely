"""Ely IDE · operaciones de backend que no son solo frontend.

Cubre: sistema de archivos (crear/renombrar/borrar/copiar/mover/listar),
Git/SCM real (status/stage/discard/diff/commit/log/ramas/merge/blame/remoto),
búsqueda y reemplazo global con glob, historial local + diff, símbolos/outline,
tareas, metadatos de codificación/EOL, diagnóstico y workspaces multi-raíz.
"""
from __future__ import annotations

import difflib
import fnmatch
import json
import os
import re
import shutil
import subprocess
import time
from pathlib import Path
from typing import Any

from .workspace import SKIP_DIRS, TEXT_EXT, WorkspaceError, _safe

MAX = 20_000_000


def _git(root: Path, *args: str, timeout: int = 30) -> subprocess.CompletedProcess:
    return subprocess.run(["git", *args], cwd=str(root), capture_output=True,
                          text=True, timeout=timeout)


def _is_git(root: Path) -> bool:
    return (root / ".git").exists() or _git(root, "rev-parse", "--is-inside-work-tree").returncode == 0


# ------------------------------------------------------------------ FS
def fs_list(root: Path, rel: str = "", show_hidden: bool = False, sort: str = "name") -> dict:
    base = _safe(root, rel) if rel else root.resolve()
    if not base.is_dir():
        raise WorkspaceError(400, "No es un directorio")
    entries = []
    for child in base.iterdir():
        if not show_hidden and child.name.startswith("."):
            continue
        if child.name in SKIP_DIRS:
            continue
        st = child.stat()
        entries.append({"name": child.name, "path": str(child.relative_to(root)),
                        "type": "dir" if child.is_dir() else "file",
                        "size": st.st_size, "mtime": st.st_mtime})
    key = {"name": lambda e: e["name"].lower(), "type": lambda e: (e["type"], e["name"]),
           "mtime": lambda e: -e["mtime"], "size": lambda e: -e["size"]}.get(sort, lambda e: e["name"].lower())
    entries.sort(key=key)
    return {"path": rel, "entries": entries}


def fs_mkdir(root: Path, rel: str) -> dict:
    t = _safe(root, rel); t.mkdir(parents=True, exist_ok=True)
    return {"path": rel, "created": True}


def fs_create(root: Path, rel: str, content: str = "") -> dict:
    t = _safe(root, rel); t.parent.mkdir(parents=True, exist_ok=True); t.write_text(content, encoding="utf-8")
    return {"path": rel, "created": True}


def fs_rename(root: Path, rel: str, new: str) -> dict:
    src = _safe(root, rel); dst = _safe(root, new)
    if dst.exists():
        raise WorkspaceError(409, "El destino ya existe")
    src.rename(dst)
    return {"path": new, "renamed": True}


def fs_delete(root: Path, rel: str) -> dict:
    t = _safe(root, rel)
    if t.is_dir():
        shutil.rmtree(t)
    else:
        t.unlink()
    return {"path": rel, "deleted": True}


def fs_copy(root: Path, src: str, dst: str) -> dict:
    s = _safe(root, src); d = _safe(root, dst)
    if s.is_dir():
        shutil.copytree(s, d)
    else:
        d.parent.mkdir(parents=True, exist_ok=True); shutil.copy2(s, d)
    return {"path": dst, "copied": True}


def fs_move(root: Path, src: str, dst: str) -> dict:
    s = _safe(root, src); d = _safe(root, dst)
    d.parent.mkdir(parents=True, exist_ok=True); shutil.move(str(s), str(d))
    return {"path": dst, "moved": True}


# ------------------------------------------------------------------ Git
def git_status(root: Path) -> dict:
    if not _is_git(root):
        return {"git": False, "branch": None, "files": []}
    branch = _git(root, "rev-parse", "--abbrev-ref", "HEAD").stdout.strip()
    files = []
    out = _git(root, "status", "--porcelain").stdout
    for line in out.splitlines():
        if not line.strip():
            continue
        xy, path = line[:2], line[3:].strip()
        files.append({"path": path, "staged": xy[0] not in (" ", "?"), "status": xy.strip() or "?"})
    return {"git": True, "branch": branch, "files": files}


def git_stage(root: Path, paths: list[str]) -> dict:
    _git(root, "add", "--", *paths)
    return git_status(root)


def git_unstage(root: Path, paths: list[str]) -> dict:
    _git(root, "reset", "HEAD", "--", *paths)
    return git_status(root)


def git_discard(root: Path, paths: list[str]) -> dict:
    _git(root, "checkout", "--", *paths)
    return git_status(root)


def git_diff(root: Path, path: str | None = None, staged: bool = False) -> dict:
    args = ["diff"]
    if staged:
        args.append("--cached")
    if path:
        args += ["--", path]
    return {"diff": _git(root, *args).stdout}


def git_commit(root: Path, message: str) -> dict:
    r = _git(root, "commit", "-m", message)
    return {"ok": r.returncode == 0, "output": r.stdout + r.stderr}


def git_log(root: Path, path: str | None = None, limit: int = 50) -> dict:
    args = ["log", f"-{limit}", "--pretty=%h|%an|%ad|%s", "--date=short"]
    if path:
        args += ["--", path]
    rows = []
    for line in _git(root, *args).stdout.splitlines():
        parts = line.split("|", 3)
        if len(parts) == 4:
            rows.append({"hash": parts[0], "author": parts[1], "date": parts[2], "message": parts[3]})
    return {"commits": rows}


def git_branches(root: Path) -> dict:
    out = _git(root, "branch", "--format=%(refname:short)|%(HEAD)").stdout
    rows = [{"name": l.split("|")[0], "current": l.split("|")[1] == "*"} for l in out.splitlines() if l.strip()]
    return {"branches": rows}


def git_checkout(root: Path, name: str, create: bool = False) -> dict:
    args = ["checkout", "-b", name] if create else ["checkout", name]
    r = _git(root, *args)
    return {"ok": r.returncode == 0, "output": r.stdout + r.stderr}


def git_merge(root: Path, name: str) -> dict:
    r = _git(root, "merge", name)
    return {"ok": r.returncode == 0, "output": r.stdout + r.stderr}


def git_remote(root: Path, op: str) -> dict:
    if op not in ("fetch", "pull", "push"):
        raise WorkspaceError(400, "op inválida")
    r = _git(root, op, timeout=60)
    return {"ok": r.returncode == 0, "output": r.stdout + r.stderr}


def git_blame(root: Path, path: str) -> dict:
    r = _git(root, "blame", "--line-porcelain", path)
    return {"blame": r.stdout}


# ------------------------------------------------------------------ búsqueda / reemplazo
def _match_globs(rel: str, include: str, exclude: str) -> bool:
    if include and not any(fnmatch.fnmatch(rel, p.strip()) for p in include.split(",") if p.strip()):
        return False
    if exclude and any(fnmatch.fnmatch(rel, p.strip()) for p in exclude.split(",") if p.strip()):
        return False
    return True


def _iter_text(root: Path, include: str, exclude: str):
    for p in sorted(root.rglob("*")):
        if not p.is_file() or p.suffix.lower() not in TEXT_EXT:
            continue
        rel = str(p.relative_to(root))
        if any(part in SKIP_DIRS or part.startswith(".") for part in p.relative_to(root).parts[:-1]):
            continue
        if not _match_globs(rel, include, exclude):
            continue
        try:
            if p.stat().st_size > 400_000:
                continue
            yield p, rel, p.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue


def search_advanced(root: Path, q: str, include: str = "", exclude: str = "",
                    regex: bool = False, case: bool = False, whole: bool = False, limit: int = 200) -> dict:
    if len(q) < 2:
        raise WorkspaceError(400, "Escribe al menos 2 caracteres")
    pat = q if regex else re.escape(q)
    if whole:
        pat = r"\b" + pat + r"\b"
    rx = re.compile(pat, 0 if case else re.IGNORECASE)
    matches = []
    for p, rel, text in _iter_text(root, include, exclude):
        for i, line in enumerate(text.splitlines(), 1):
            if rx.search(line):
                matches.append({"path": rel, "line": i, "text": line.strip()[:200]})
                if len(matches) >= limit:
                    return {"matches": matches, "truncated": True}
    return {"matches": matches, "truncated": False}


def replace_in_files(root: Path, q: str, repl: str, include: str = "", exclude: str = "",
                     preview: bool = False) -> dict:
    rx = re.compile(re.escape(q), re.IGNORECASE)
    changed = []
    for p, rel, text in _iter_text(root, include, exclude):
        new, n = rx.subn(repl, text)
        if n:
            changed.append({"path": rel, "count": n})
            if not preview:
                p.write_text(new, encoding="utf-8")
    return {"changed": changed, "preview": preview}


# ------------------------------------------------------------------ historial local / diff
def _hist_dir(root: Path) -> Path:
    d = root / ".ely" / "history"; d.mkdir(parents=True, exist_ok=True); return d


def history_save(root: Path, rel: str, content: str) -> dict:
    d = _hist_dir(root)
    stamp = str(int(time.time() * 1000))
    key = re.sub(r"[^A-Za-z0-9._-]", "_", rel)
    (d / f"{key}.{stamp}").write_text(content, encoding="utf-8")
    return {"id": stamp, "path": rel}


def history_list(root: Path, rel: str) -> dict:
    d = _hist_dir(root)
    key = re.sub(r"[^A-Za-z0-9._-]", "_", rel)
    rows = []
    for f in sorted(d.glob(key + ".*"), reverse=True):
        rows.append({"id": f.name.split(".")[-1], "size": f.stat().st_size})
    return {"history": rows[:50]}


def history_read(root: Path, rel: str, hid: str) -> dict:
    d = _hist_dir(root)
    key = re.sub(r"[^A-Za-z0-9._-]", "_", rel)
    f = d / f"{key}.{hid}"
    if not f.is_file():
        raise WorkspaceError(404, "Versión no encontrada")
    return {"content": f.read_text(encoding="utf-8")}


def diff_text(a: str, b: str, la: str = "a", lb: str = "b") -> dict:
    return {"diff": "".join(difflib.unified_diff(a.splitlines(True), b.splitlines(True), la, lb))}


# ------------------------------------------------------------------ símbolos / outline
_SYM = {
    "py": [r"^\s*(?:async\s+)?(?:def|class)\s+(\w+)"],
    "js": [r"^\s*(?:export\s+)?(?:async\s+)?(?:function|class)\s+(\w+)", r"^\s*(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|\w+)\s*=>"],
    "ts": [r"^\s*(?:export\s+)?(?:declare\s+)?(?:abstract\s+)?(?:function|class|interface|enum|type)\s+(\w+)"],
    "go": [r"^func\s+(?:\([^)]*\)\s*)?(\w+)", r"^type\s+(\w+)"],
    "rs": [r"^\s*(?:pub\s+)?(?:async\s+)?(?:fn|struct|enum|trait|impl|mod)\s+(\w+)"],
    "md": [r"^(#{1,6})\s+(.+)"],
    "java": [r"^\s*(?:public|private|protected)?\s*(?:static\s+)?(?:final\s+)?(?:class|interface|enum|record)\s+(\w+)", r"^\s*(?:public|private|protected)\s+[\w<>\[\],\s]+\s+(\w+)\s*\("],
    "kt": [r"^\s*(?:data\s+|sealed\s+|open\s+|abstract\s+)?(?:class|object|interface|fun)\s+(\w+)"],
    "swift": [r"^\s*(?:public\s+|private\s+|internal\s+)?(?:class|struct|enum|protocol|extension|func)\s+(\w+)"],
    "rb": [r"^\s*(?:def|class|module)\s+([\w.]+)"],
    "php": [r"^\s*(?:abstract\s+|final\s+)?(?:class|interface|trait|function)\s+(\w+)", r"^\s*(?:public|private|protected)\s+(?:static\s+)?function\s+(\w+)"],
    "c": [r"^[A-Za-z_][\w\s*]*\s+\*?(\w+)\s*\([^;]*$"],
    "cpp": [r"^\s*(?:class|struct|namespace|enum)\s+(\w+)", r"^[A-Za-z_][\w:\s*<>,]*\s+\*?(\w+)\s*\([^;]*$"],
    "cs": [r"^\s*(?:public|private|protected|internal)?\s*(?:static\s+|partial\s+|abstract\s+|sealed\s+)?(?:class|interface|struct|enum|record)\s+(\w+)", r"^\s*(?:public|private|protected|internal)\s+[\w<>\[\],\s]+\s+(\w+)\s*\("],
    "scala": [r"^\s*(?:case\s+)?(?:class|object|trait|def)\s+(\w+)"],
    "dart": [r"^\s*(?:abstract\s+)?class\s+(\w+)", r"^\s*(?:Future<[^>]*>|void|String|int|double|bool|Widget)\s+(\w+)\s*\("],
    "lua": [r"^\s*(?:local\s+)?function\s+([\w.:]+)"],
    "sh": [r"^\s*(?:function\s+)?(\w+)\s*\(\s*\)\s*\{"],
    "sql": [r"^\s*CREATE\s+(?:OR\s+REPLACE\s+)?(?:TABLE|VIEW|FUNCTION|PROCEDURE|INDEX)\s+(?:IF\s+NOT\s+EXISTS\s+)?([\w.\"`]+)"],
    "tf": [r"^\s*(?:resource|variable|output|module|data)\s+\"([^\"]+)\"(?:\s+\"([^\"]+)\")?"],
    "yml": [r"^([\w.-]+):\s*$"],
    "yaml": [r"^([\w.-]+):\s*$"],
    "ex": [r"^\s*(?:defmodule|def|defp)\s+([\w.]+)"],
    "hs": [r"^(\w+)\s*::", r"^(?:data|type|newtype|class)\s+(\w+)"],
    "sol": [r"^\s*(?:contract|interface|library|function|event|modifier)\s+(\w+)"],
    "proto": [r"^\s*(?:message|enum|service|rpc)\s+(\w+)"],
    "graphql": [r"^\s*(?:type|interface|enum|input|union|scalar)\s+(\w+)"],
    "tex": [r"^\\(?:section|subsection|chapter|subsubsection)\*?\{([^}]+)\}"],
    "rst": [r"^(.{3,})\n[=\-~^\"]{3,}\s*$"],
    "toml": [r"^\s*\[+([\w.-]+)\]+"],
    "ini": [r"^\s*\[([^\]]+)\]"],
    "dockerfile": [r"^\s*FROM\s+(\S+)(?:\s+AS\s+(\w+))?"],
    "vim": [r"^\s*(?:function!?|command!?)\s+([\w:]+)"],
    "ps1": [r"^\s*function\s+([\w-]+)"],
    "pl": [r"^\s*sub\s+(\w+)"],
    "r": [r"^(\w+)\s*<-\s*function"],
    "jl": [r"^\s*(?:function|struct|module|macro)\s+(\w+)"],
    "zig": [r"^\s*(?:pub\s+)?fn\s+(\w+)"],
    "nim": [r"^\s*(?:proc|func|type|template|macro)\s+(\w+)"],
    "clj": [r"^\s*\((?:defn|defmacro|def|ns|defrecord)\s+([\w.-]+)"],
    "v": [r"^\s*module\s+(\w+)", r"^\s*(?:input|output)\s+(?:wire|reg|logic)?\s*(\w+)"],
    "mk": [r"^([\w.-]+)\s*:(?!=)"],
    "cmake": [r"^\s*(?:function|macro)\s*\(\s*(\w+)", r"^\s*project\s*\(\s*(\w+)"],
}


def symbols(root: Path, rel: str) -> dict:
    t = _safe(root, rel)
    ext = t.suffix.lower().lstrip(".")
    base = t.name.lower()
    if base in ("dockerfile", "containerfile"):
        ext = "dockerfile"
    elif base in ("makefile", "gnumakefile"):
        ext = "mk"
    elif base == "cmakelists.txt":
        ext = "cmake"
    pats = _SYM.get(ext, _SYM["js"])
    out = []
    try:
        lines = t.read_text(encoding="utf-8", errors="ignore").splitlines()
    except OSError:
        return {"symbols": []}
    for i, line in enumerate(lines, 1):
        for pat in pats:
            m = re.match(pat, line)
            if m:
                groups = [g for g in m.groups() if g]
                name = " · ".join(groups) if ext in ("md", "tf", "dockerfile") else (groups[0] if groups else m.group(0).strip())
                out.append({"name": name, "line": i, "kind": "heading" if ext in ("md", "rst", "tex") else "symbol"})
                break
    return {"symbols": out}


# ------------------------------------------------------------------ tareas
def tasks_list(root: Path) -> dict:
    f = root / ".ely" / "tasks.json"
    if not f.is_file():
        f = root / "tasks.json"
    if not f.is_file():
        return {"tasks": []}
    try:
        return {"tasks": json.loads(f.read_text(encoding="utf-8")).get("tasks", [])}
    except (OSError, json.JSONDecodeError):
        return {"tasks": []}


def tasks_run(root: Path, name: str) -> dict:
    tasks = tasks_list(root)["tasks"]
    task = next((t for t in tasks if t.get("label") == name), None)
    if not task:
        raise WorkspaceError(404, "Tarea no encontrada")
    cmd = task.get("command", "")
    r = subprocess.run(cmd, shell=True, cwd=str(root), capture_output=True, text=True, timeout=60)
    return {"label": name, "stdout": r.stdout[-20000:], "stderr": r.stderr[-20000:], "code": r.returncode}


# ------------------------------------------------------------------ codificación / EOL
def file_meta(root: Path, rel: str) -> dict:
    t = _safe(root, rel)
    raw = t.read_bytes()[:100000]
    try:
        raw.decode("utf-8"); enc = "utf-8"
    except UnicodeDecodeError:
        enc = "latin-1"
    eol = "CRLF" if b"\r\n" in raw else "LF"
    return {"encoding": enc, "eol": eol, "size": t.stat().st_size}


# ------------------------------------------------------------------ diagnóstico
def stats(root: Path) -> dict:
    import resource
    ru = resource.getrusage(resource.RUSAGE_SELF)
    return {"cpu_user_s": ru.ru_utime, "cpu_sys_s": ru.ru_stime,
            "max_rss_kb": ru.ru_maxrss, "pid": os.getpid(),
            "files": sum(1 for _ in root.rglob("*") if _.is_file())}


# ------------------------------------------------------------------ workspaces
def workspace_save(root: Path, name: str, folders: list[str]) -> dict:
    d = root / ".ely" / "workspaces"; d.mkdir(parents=True, exist_ok=True)
    f = d / (re.sub(r"[^A-Za-z0-9._-]", "_", name) + ".json")
    f.write_text(json.dumps({"name": name, "folders": folders}, indent=2), encoding="utf-8")
    return {"name": name, "saved": True}


def workspace_list(root: Path) -> dict:
    d = root / ".ely" / "workspaces"
    rows = []
    if d.is_dir():
        for f in sorted(d.glob("*.json")):
            try:
                rows.append(json.loads(f.read_text(encoding="utf-8")))
            except (OSError, json.JSONDecodeError):
                continue
    return {"workspaces": rows}


# ------------------------------------------------------------------ dispatcher
def call(root: Path, op: str, a: dict[str, Any]) -> dict:
    """Despacha una operación de IDE con argumentos ya validados por ruta."""
    a = a or {}
    if op == "fs_list":
        return fs_list(root, a.get("path", ""), bool(a.get("hidden")), a.get("sort", "name"))
    if op == "fs_mkdir":
        return fs_mkdir(root, a["path"])
    if op == "fs_create":
        return fs_create(root, a["path"], a.get("content", ""))
    if op == "fs_rename":
        return fs_rename(root, a["path"], a["new"])
    if op == "fs_delete":
        return fs_delete(root, a["path"])
    if op == "fs_copy":
        return fs_copy(root, a["src"], a["dst"])
    if op == "fs_move":
        return fs_move(root, a["src"], a["dst"])
    if op == "git_status":
        return git_status(root)
    if op == "git_stage":
        return git_stage(root, a.get("paths", []))
    if op == "git_unstage":
        return git_unstage(root, a.get("paths", []))
    if op == "git_discard":
        return git_discard(root, a.get("paths", []))
    if op == "git_diff":
        return git_diff(root, a.get("path"), bool(a.get("staged")))
    if op == "git_commit":
        return git_commit(root, a.get("message", ""))
    if op == "git_log":
        return git_log(root, a.get("path"), int(a.get("limit", 50)))
    if op == "git_branches":
        return git_branches(root)
    if op == "git_checkout":
        return git_checkout(root, a["name"], bool(a.get("create")))
    if op == "git_merge":
        return git_merge(root, a["name"])
    if op == "git_remote":
        return git_remote(root, a.get("op", "fetch"))
    if op == "git_blame":
        return git_blame(root, a["path"])
    if op == "search":
        return search_advanced(root, a.get("q", ""), a.get("include", ""), a.get("exclude", ""),
                               bool(a.get("regex")), bool(a.get("case")), bool(a.get("whole")))
    if op == "replace":
        return replace_in_files(root, a.get("q", ""), a.get("repl", ""), a.get("include", ""),
                                a.get("exclude", ""), bool(a.get("preview")))
    if op == "history_save":
        return history_save(root, a["path"], a.get("content", ""))
    if op == "history_list":
        return history_list(root, a["path"])
    if op == "history_read":
        return history_read(root, a["path"], a["id"])
    if op == "diff":
        return diff_text(a.get("a", ""), a.get("b", ""), a.get("la", "a"), a.get("lb", "b"))
    if op == "symbols":
        return symbols(root, a["path"])
    if op == "tasks_list":
        return tasks_list(root)
    if op == "tasks_run":
        return tasks_run(root, a["name"])
    if op == "file_meta":
        return file_meta(root, a["path"])
    if op == "stats":
        return stats(root)
    if op == "workspace_save":
        return workspace_save(root, a["name"], a.get("folders", []))
    if op == "workspace_list":
        return workspace_list(root)
    raise WorkspaceError(400, f"Operación desconocida: {op}")
