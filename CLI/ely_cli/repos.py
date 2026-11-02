"""Ingesta de repositorios Git en el espacio de trabajo de Ely.

Descarga el árbol de una rama/etiqueta/commit desde codeload.github.com (o la
API si hay token) y lo descomprime de forma segura en `.ely/repos/<slug>/`.

Reglas de seguridad y de disco:
  * extracción con lista blanca: solo ficheros regulares, sin rutas absolutas,
    sin `..`, sin enlaces simbólicos ni dispositivos;
  * límite de tamaño descargado, de ficheros extraídos y de bytes totales;
  * escritura en un directorio temporal y renombrado atómico al terminar;
  * `.ely/` está ignorado por git, así que el contenido no se versiona.

No hay contenido de ejemplo: si la descarga falla, se informa del error real
(HTTP, DNS, límite superado) y no se deja nada a medias.
"""
from __future__ import annotations

import json
import os
import re
import shutil
import tarfile
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Iterable

DEFAULT_MAX_DOWNLOAD = 600 * 1024 * 1024      # 600 MB comprimido
DEFAULT_MAX_BYTES = 1200 * 1024 * 1024        # 1,2 GB extraído
DEFAULT_MAX_FILES = 60_000
MAX_TEXT = 512 * 1024                          # bytes que se devuelven al cliente

SKIP_DIRS = {
    ".git", ".hg", ".svn", "node_modules", "__pycache__", ".venv", "venv",
    "dist", "out", "build", ".next", ".cache", "target", ".gradle", ".idea",
}
BINARY_EXT = {
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".bmp", ".tiff", ".avif",
    ".woff", ".woff2", ".ttf", ".otf", ".eot", ".pdf", ".zip", ".gz", ".tar",
    ".7z", ".rar", ".exe", ".dll", ".so", ".dylib", ".a", ".o", ".class",
    ".jar", ".wasm", ".mp3", ".mp4", ".mov", ".wav", ".sqlite", ".db",
}

SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9._-]*$")


class RepoError(RuntimeError):
    def __init__(self, message: str, status: int = 400, detail: Any = None):
        super().__init__(message)
        self.status = status
        self.detail = detail


@dataclass
class RepoRef:
    owner: str
    name: str
    ref: str | None = None
    subdir: str | None = None

    @property
    def slug(self) -> str:
        base = f"{self.owner}__{self.name}".lower()
        if self.ref:
            safe_ref = re.sub(r"[^a-z0-9._-]+", "-", self.ref.lower()).strip("-")
            base += "__" + safe_ref
        return re.sub(r"[^a-z0-9._-]+", "-", base)[:120]

    @property
    def label(self) -> str:
        return f"{self.owner}/{self.name}" + (f"@{self.ref}" if self.ref else "")


def parse_reference(value: str) -> RepoRef:
    """Acepta 'owner/repo', URL de GitHub, URL de /tree/<ref> o tarball directo."""
    raw = (value or "").strip()
    if not raw:
        raise RepoError("Indica un repositorio, por ejemplo: microsoft/vscode")

    if raw.startswith(("http://", "https://")):
        parsed = urllib.parse.urlparse(raw)
        host = parsed.netloc.lower()
        parts = [p for p in parsed.path.strip("/").split("/") if p]
        if host not in ("github.com", "www.github.com"):
            raise RepoError(
                f"Host no soportado: {host}. Usa github.com o la forma owner/repo.",
                400,
            )
        if len(parts) < 2:
            raise RepoError("La URL no incluye owner/repo")
        owner, name = parts[0], parts[1]
        ref = None
        subdir = None
        if len(parts) >= 4 and parts[2] in ("tree", "blob", "commits"):
            ref = parts[3]
            if len(parts) > 4:
                subdir = "/".join(parts[4:])
        name = name[:-4] if name.endswith(".git") else name
        return RepoRef(owner=owner, name=name, ref=ref, subdir=subdir)

    if "/" in raw:
        owner, _, rest = raw.partition("/")
        ref = None
        name = rest
        if "@" in rest:
            name, _, ref = rest.partition("@")
        return RepoRef(owner=owner.strip(), name=name.strip(), ref=ref or None)

    raise RepoError("Formato no reconocido. Usa owner/repo o una URL de GitHub.")


def store_dir(root: Path) -> Path:
    path = root / ".ely" / "repos"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _tarball_url(ref: RepoRef) -> tuple[str, dict[str, str]]:
    token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
    branch = ref.ref or "HEAD"
    if token:
        url = f"https://api.github.com/repos/{ref.owner}/{ref.name}/tarball/{branch}"
        return url, {
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "User-Agent": "ElyCowork-CLI/0.9.0",
        }
    if ref.ref:
        url = f"https://codeload.github.com/{ref.owner}/{ref.name}/tar.gz/refs/heads/{ref.ref}"
        # si la rama no existe se prueba como etiqueta/commit
        return url, {"User-Agent": "ElyCowork-CLI/0.9.0"}
    url = f"https://codeload.github.com/{ref.owner}/{ref.name}/tar.gz/HEAD"
    return url, {"User-Agent": "ElyCowork-CLI/0.9.0"}


def _fallback_urls(ref: RepoRef) -> list[str]:
    if ref.ref:
        return [
            f"https://codeload.github.com/{ref.owner}/{ref.name}/tar.gz/refs/heads/{ref.ref}",
            f"https://codeload.github.com/{ref.owner}/{ref.name}/tar.gz/refs/tags/{ref.ref}",
            f"https://codeload.github.com/{ref.owner}/{ref.name}/tar.gz/{ref.ref}",
        ]
    return [
        "https://codeload.github.com/{o}/{n}/tar.gz/HEAD".format(o=ref.owner, n=ref.name),
        "https://codeload.github.com/{o}/{n}/tar.gz/refs/heads/main".format(o=ref.owner, n=ref.name),
        "https://codeload.github.com/{o}/{n}/tar.gz/refs/heads/master".format(o=ref.owner, n=ref.name),
    ]


def _download(url: str, headers: dict[str, str], dest: Path, limit: int,
              progress: Callable[[int, int], None] | None = None) -> int:
    request = urllib.request.Request(url, headers=headers)
    written = 0
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            total = int(response.headers.get("Content-Length") or 0)
            with dest.open("wb") as handle:
                while True:
                    chunk = response.read(1024 * 512)
                    if not chunk:
                        break
                    written += len(chunk)
                    if written > limit:
                        raise RepoError(
                            f"La descarga supera el límite de {limit // (1024 * 1024)} MB. "
                            "Ajusta ELY_REPO_MAX_DOWNLOAD o usa un subdirectorio/tag más pequeño.",
                            413,
                        )
                    handle.write(chunk)
                    if progress:
                        progress(written, total)
    except urllib.error.HTTPError as exc:
        raise RepoError(
            f"HTTP {exc.code} al descargar {url}",
            502 if exc.code >= 500 else 404,
            exc.read()[:400].decode("utf-8", "replace"),
        ) from exc
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        raise RepoError(f"No se pudo descargar {url}: {exc}", 502) from exc
    return written


def _safe_members(archive: tarfile.TarFile, prefix_len: int) -> Iterable[tarfile.TarInfo]:
    for member in archive:
        name = member.name
        if not name or name.startswith("/") or ".." in Path(name).parts:
            continue
        if not member.isfile():
            continue
        parts = Path(name).parts[prefix_len:]
        if not parts:
            continue
        if any(part in SKIP_DIRS for part in parts):
            continue
        member.name = str(Path(*parts))
        yield member


def _dir_stats(path: Path, limit: int = 200_000) -> tuple[int, int]:
    files = 0
    total = 0
    for item in path.rglob("*"):
        if item.is_file():
            files += 1
            try:
                total += item.stat().st_size
            except OSError:
                pass
            if files >= limit:
                break
    return files, total


def add(
    root: Path,
    reference: str,
    *,
    progress: Callable[[int, int], None] | None = None,
    max_download: int | None = None,
    max_files: int | None = None,
    max_bytes: int | None = None,
) -> dict[str, Any]:
    """Descarga e indexa un repositorio. Devuelve el resumen real de la operación."""
    ref = parse_reference(reference)
    base = store_dir(root)
    target = base / ref.slug
    if target.is_dir() and (target / "_meta.json").is_file():
        raise RepoError(
            f"El repositorio {ref.label} ya está importado como «{ref.slug}». "
            "Elimínalo antes de volver a descargarlo.",
            409,
        )

    max_download = max_download or int(os.environ.get("ELY_REPO_MAX_DOWNLOAD") or DEFAULT_MAX_DOWNLOAD)
    max_files = max_files or int(os.environ.get("ELY_REPO_MAX_FILES") or DEFAULT_MAX_FILES)
    max_bytes = max_bytes or int(os.environ.get("ELY_REPO_MAX_BYTES") or DEFAULT_MAX_BYTES)

    workdir = Path(tempfile.mkdtemp(prefix="ely-repo-", dir=str(base)))
    archive_path = workdir / "source.tar.gz"
    extract_dir = workdir / "content"
    extract_dir.mkdir()

    try:
        url, headers = _tarball_url(ref)
        attempts = [url] + [u for u in _fallback_urls(ref) if u != url]
        if os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN"):
            attempts = [url]  # con token, la API resuelve cualquier ref

        last_error: RepoError | None = None
        downloaded = 0
        used_url = ""
        for candidate in attempts:
            try:
                downloaded = _download(candidate, headers, archive_path, max_download, progress)
                used_url = candidate
                break
            except RepoError as exc:
                last_error = exc
                if exc.status in (404,) and candidate != attempts[-1]:
                    continue
                raise
        if not used_url:
            raise last_error or RepoError("No se pudo descargar el repositorio", 502)

        try:
            archive = tarfile.open(archive_path, "r:gz")
        except (tarfile.TarError, OSError) as exc:
            raise RepoError(f"El archivo descargado no es un tar.gz válido: {exc}", 415) from exc

        with archive:
            prefix_len = 1  # codeload añade un directorio raíz "<repo>-<ref>/"
            extracted = 0
            total_bytes = 0
            for member in _safe_members(archive, prefix_len):
                if extracted >= max_files:
                    raise RepoError(
                        f"El repositorio supera el límite de {max_files} ficheros. "
                        "Ajusta ELY_REPO_MAX_FILES o importa una etiqueta concreta.",
                        413,
                    )
                total_bytes += max(member.size, 0)
                if total_bytes > max_bytes:
                    raise RepoError(
                        f"El contenido supera el límite de {max_bytes // (1024 * 1024)} MB extraídos.",
                        413,
                    )
                destination = extract_dir / member.name
                destination.parent.mkdir(parents=True, exist_ok=True)
                source = archive.extractfile(member)
                if source is None:
                    continue
                with source, destination.open("wb") as handle:
                    shutil.copyfileobj(source, handle, 1024 * 512)
                extracted += 1

        if ref.subdir:
            sub = extract_dir / ref.subdir
            if not sub.is_dir():
                raise RepoError(f"El subdirectorio «{ref.subdir}» no existe en {ref.label}", 404)

        files, size = _dir_stats(extract_dir)
        meta = {
            "slug": ref.slug,
            "label": ref.label,
            "owner": ref.owner,
            "name": ref.name,
            "ref": ref.ref or "HEAD",
            "subdir": ref.subdir,
            "url": used_url,
            "source": f"https://github.com/{ref.owner}/{ref.name}",
            "downloaded_bytes": downloaded,
            "files": files,
            "bytes": size,
            "added_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }

        # renombrado atómico: primero el contenido, luego el manifiesto
        final = base / ref.slug
        if final.exists():
            shutil.rmtree(final, ignore_errors=True)
        extract_dir.rename(final)
        (final / "_meta.json").write_text(json.dumps(meta, indent=2, ensure_ascii=False), encoding="utf-8")
        return meta
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


def list_repos(root: Path) -> list[dict[str, Any]]:
    base = store_dir(root)
    out: list[dict[str, Any]] = []
    for entry in sorted(base.iterdir()):
        if not entry.is_dir():
            continue
        meta_path = entry / "_meta.json"
        if not meta_path.is_file():
            continue
        try:
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            continue
        files, size = _dir_stats(entry)
        meta["files"] = files
        meta["bytes"] = size
        meta["path"] = str(entry.relative_to(root))
        out.append(meta)
    out.sort(key=lambda item: item.get("added_at") or "", reverse=True)
    return out


def get_repo(root: Path, slug: str) -> tuple[Path, dict[str, Any]]:
    if not SLUG_RE.match(slug or ""):
        raise RepoError("Identificador de repositorio inválido", 400)
    base = store_dir(root).resolve()
    target = (base / slug).resolve()
    if base not in target.parents and target != base:
        raise RepoError("Ruta fuera del almacén de repositorios", 403)
    meta_path = target / "_meta.json"
    if not meta_path.is_file():
        raise RepoError(f"El repositorio «{slug}» no está importado", 404)
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    return target, meta


def remove(root: Path, slug: str) -> dict[str, Any]:
    target, meta = get_repo(root, slug)
    shutil.rmtree(target)
    return {"slug": slug, "removed": True, "freed_bytes": meta.get("bytes", 0)}


def tree(root: Path, slug: str, depth: int = 3) -> dict[str, Any]:
    base, meta = get_repo(root, slug)
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
            if child.name in SKIP_DIRS:
                continue
            if child.name == "_meta.json":
                continue
            rel = str(child.relative_to(base))
            if child.is_dir():
                entries.append({"path": rel, "type": "dir", "size": 0, "ext": ""})
                walk(child, level + 1)
            else:
                try:
                    size = child.stat().st_size
                except OSError:
                    continue
                ext = child.suffix.lower()
                entries.append({
                    "path": rel, "type": "file", "size": size,
                    "ext": ext.lstrip("."),
                    "editable": ext not in BINARY_EXT,
                })
            if len(entries) >= 4000:
                truncated = True
                return

    walk(base, 1)
    return {
        "slug": slug, "meta": meta, "entries": entries, "truncated": truncated,
        "counts": {
            "files": sum(1 for e in entries if e["type"] == "file"),
            "dirs": sum(1 for e in entries if e["type"] == "dir"),
            "bytes": sum(e["size"] for e in entries),
        },
    }


def read_file(root: Path, slug: str, path: str, max_text: int = MAX_TEXT) -> dict[str, Any]:
    base, _meta = get_repo(root, slug)
    if not path:
        raise RepoError("Falta la ruta del archivo")
    target = (base / path).resolve()
    if base not in target.parents and target != base:
        raise RepoError("Ruta fuera del repositorio", 403)
    if target.is_dir():
        raise RepoError("Es un directorio", 400)
    if not target.is_file():
        raise RepoError(f"No existe: {path}", 404)
    if target.suffix.lower() in BINARY_EXT:
        raise RepoError(f"Archivo binario ({target.suffix}) — no editable como texto", 415)
    size = target.stat().st_size
    raw = target.read_bytes()[:max_text]
    if b"\x00" in raw[:4096]:
        raise RepoError("El archivo parece binario (contiene NUL)", 415)
    try:
        content = raw.decode("utf-8")
        encoding = "utf-8"
    except UnicodeDecodeError:
        content = raw.decode("latin-1")
        encoding = "latin-1"
    return {
        "slug": slug, "path": path, "content": content, "size": size,
        "encoding": encoding, "lines": content.count("\n") + 1,
        "truncated": size > max_text,
    }


def search(root: Path, slug: str, query: str, *, limit: int = 60,
           max_files: int = 6000, max_bytes_per_file: int = 256 * 1024) -> dict[str, Any]:
    base, _meta = get_repo(root, slug)
    needle = (query or "").strip()
    if len(needle) < 2:
        raise RepoError("La búsqueda necesita al menos 2 caracteres")
    lowered = needle.lower()
    hits: list[dict[str, Any]] = []
    scanned = 0
    truncated = False

    for path in base.rglob("*"):
        if truncated:
            break
        if not path.is_file() or path.name == "_meta.json":
            continue
        if any(part in SKIP_DIRS for part in path.relative_to(base).parts):
            continue
        if path.suffix.lower() in BINARY_EXT:
            continue
        scanned += 1
        if scanned > max_files:
            truncated = True
            break
        try:
            if path.stat().st_size > max_bytes_per_file * 8:
                continue
            text = path.read_text(encoding="utf-8", errors="ignore")[:max_bytes_per_file]
        except OSError:
            continue
        if lowered not in text.lower():
            continue
        rel = str(path.relative_to(base))
        for number, line in enumerate(text.splitlines(), start=1):
            if lowered in line.lower():
                hits.append({
                    "path": rel, "line": number,
                    "text": line.strip()[:220],
                })
                if len(hits) >= limit:
                    truncated = True
                    break
                break

    return {"slug": slug, "query": needle, "hits": hits, "scanned_files": scanned,
            "truncated": truncated}


def presets() -> list[dict[str, Any]]:
    """Repositorios sugeridos para el IDE (descarga real, sin contenido incluido)."""
    return [
        {"id": "vscode", "label": "VS Code · main", "reference": "microsoft/vscode",
         "note": "Fuente del IDE de referencia (~1,6 GB de historial; el tarball es solo el árbol)."},
        {"id": "vscode-docs", "label": "VS Code Docs", "reference": "microsoft/vscode-docs",
         "note": "Documentación oficial, útil para probar la búsqueda."},
        {"id": "monaco", "label": "Monaco Editor", "reference": "microsoft/monaco-editor",
         "note": "El editor que usa VS Code en el navegador."},
        {"id": "ely", "label": "Ely Cowork", "reference": "AAA1234fdja/Ely",
         "note": "Este mismo repositorio, para recorrerlo desde la interfaz."},
    ]
