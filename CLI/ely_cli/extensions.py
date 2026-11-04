"""Extensiones de Ely IDE · instalación y comunicación externa.

Modelo honesto y distinto del de VS Code:

* Una extensión es una carpeta con ``ely-extension.json`` + un ``main.js``.
* El código de la extensión **se ejecuta en el navegador, dentro de un iframe
  con sandbox** (sin mismo origen): no puede tocar el DOM, las cookies ni el
  almacenamiento de la aplicación. Solo habla con el host por mensajes.
* El host (``IDE/frontend/js/ext-host.js``) expone una API con permisos
  declarados en el manifiesto. Lo que necesita servidor pasa por aquí.
* La **comunicación externa** (fetch a Internet) se hace desde este backend,
  que comprueba el permiso ``network:<host>`` del manifiesto antes de salir.

Fuentes de instalación reales: carpeta local del workspace, GitHub
(``owner/repo`` o URL) y npm (``npm:paquete``). No se ejecuta nada en el
servidor: instalar solo copia archivos.

Las extensiones VSIX del marketplace de VS Code **no** son compatibles: usan
otra API y un host de extensiones Node/Electron que aquí no existe. Se declara
así en la interfaz en lugar de simularlo.
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
from pathlib import Path
from typing import Any

from . import workspace

MANIFEST = "ely-extension.json"
STORE = ".ely/extensions"
INDEX = "index.json"
MAX_DOWNLOAD = int(os.environ.get("ELY_EXT_MAX_DOWNLOAD", 8 * 1024 * 1024))
MAX_FILES = 400
MAX_TEXT = 512 * 1024
FETCH_LIMIT = int(os.environ.get("ELY_EXT_FETCH_LIMIT", 1024 * 1024))
FETCH_TIMEOUT = float(os.environ.get("ELY_EXT_FETCH_TIMEOUT", 20))

# Hosts permitidos para instalar (el sandbox solo tiene salida a estos).
INSTALL_HOSTS = {
    "github.com", "codeload.github.com", "api.github.com",
    "registry.npmjs.org", "files.pythonhosted.org", "pypi.org",
}
# Hosts que una extensión puede pedir por defecto si declara network:* .
DEFAULT_NETWORK_HOSTS = {"api.github.com", "registry.npmjs.org", "github.com", "pypi.org"}

PERMISSIONS = {
    "workspace:read": "Leer archivos del proyecto",
    "workspace:write": "Crear y modificar archivos del proyecto",
    "editor": "Leer el archivo abierto e insertar texto",
    "ui": "Mostrar mensajes, elementos en la barra de estado y menús",
    "commands": "Registrar comandos en la paleta",
    "completions": "Proveer autocompletado (Tab)",
    "chat": "Enviar mensajes al chat con IA",
}
ID_RE = re.compile(r"^[a-z0-9][a-z0-9._-]{1,60}$")
SKIP_DIRS = {".git", "node_modules", "__pycache__", ".venv"}


class ExtensionError(Exception):
    def __init__(self, message: str, status: int = 400, detail: Any = None):
        super().__init__(message)
        self.status = status
        self.detail = detail


# ---------------------------------------------------------------------- rutas
def store_dir(root: Path) -> Path:
    path = (root / STORE).resolve()
    path.mkdir(parents=True, exist_ok=True)
    return path


def builtin_dir(root: Path) -> Path:
    """Extensiones que vienen con el repo (IDE/ely-extensions)."""
    return (root / "IDE" / "ely-extensions").resolve()


def _index_path(root: Path) -> Path:
    return store_dir(root) / INDEX


def _read_index(root: Path) -> dict[str, Any]:
    path = _index_path(root)
    if not path.is_file():
        return {"enabled": {}, "installed": {}}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(data, dict):
            data.setdefault("enabled", {})
            data.setdefault("installed", {})
            return data
    except (OSError, ValueError):
        pass
    return {"enabled": {}, "installed": {}}


def _write_index(root: Path, data: dict[str, Any]) -> None:
    _index_path(root).write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


# ------------------------------------------------------------------ manifiesto
def validate_manifest(data: Any) -> dict[str, Any]:
    if not isinstance(data, dict):
        raise ExtensionError("El manifiesto debe ser un objeto JSON")
    ext_id = str(data.get("id") or "").strip().lower()
    if not ID_RE.match(ext_id):
        raise ExtensionError("id inválido: usa minúsculas, números, puntos, guiones (2-61 caracteres)")
    name = str(data.get("name") or "").strip()
    if not name:
        raise ExtensionError("Falta el campo 'name'")
    version = str(data.get("version") or "0.0.1").strip()
    main = str(data.get("main") or "").strip()
    if main and (main.startswith("/") or ".." in Path(main).parts):
        raise ExtensionError("'main' debe ser una ruta relativa dentro de la extensión")

    raw_perms = data.get("permissions") or []
    if not isinstance(raw_perms, list):
        raise ExtensionError("'permissions' debe ser una lista")
    perms: list[str] = []
    for perm in raw_perms:
        text = str(perm).strip()
        if text in PERMISSIONS or text.startswith("network:"):
            perms.append(text)
        else:
            raise ExtensionError(f"Permiso desconocido: {text}", 400,
                                 {"conocidos": sorted(PERMISSIONS) + ["network:<host>"]})
    contributes = data.get("contributes") or {}
    if not isinstance(contributes, dict):
        raise ExtensionError("'contributes' debe ser un objeto")
    l10n = data.get("l10n") or {}
    if not isinstance(l10n, dict):
        raise ExtensionError("'l10n' debe ser un objeto {idioma: {name, description}}")
    return {
        "id": ext_id,
        "name": name,
        "version": version,
        "publisher": str(data.get("publisher") or "local"),
        "description": str(data.get("description") or ""),
        "main": main,
        "permissions": perms,
        "contributes": contributes,
        "activationEvents": data.get("activationEvents") or ["onStartup"],
        "engines": {"ely": str((data.get("engines") or {}).get("ely") or ">=0.9")},
        "l10n": {str(k): v for k, v in l10n.items() if isinstance(v, dict)},
    }


def read_manifest(folder: Path) -> dict[str, Any]:
    path = folder / MANIFEST
    if not path.is_file():
        raise ExtensionError(f"No existe {MANIFEST} en {folder.name}", 404)
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except ValueError as exc:
        raise ExtensionError(f"{MANIFEST} no es JSON válido: {exc}") from exc
    manifest = validate_manifest(data)
    manifest["folder"] = folder.name
    return manifest


def network_hosts(manifest: dict[str, Any]) -> set[str]:
    hosts: set[str] = set()
    for perm in manifest.get("permissions", []):
        if not perm.startswith("network:"):
            continue
        target = perm.split(":", 1)[1].strip().lower()
        if target in ("*", "any"):
            hosts |= DEFAULT_NETWORK_HOSTS
        else:
            hosts.add(target)
    return hosts


def has_permission(manifest: dict[str, Any], perm: str) -> bool:
    return perm in (manifest.get("permissions") or [])


# -------------------------------------------------------------------- listado
def _permission_label(perm: str) -> str:
    """Etiqueta legible de un permiso (los de red llevan el host)."""
    if perm in PERMISSIONS:
        return PERMISSIONS[perm]
    if perm.startswith("network:"):
        return "Red: " + perm.split(":", 1)[1]
    return perm


def _entry(root: Path, folder: Path, source: str, index: dict[str, Any]) -> dict[str, Any] | None:
    try:
        manifest = read_manifest(folder)
    except ExtensionError:
        return None
    ext_id = manifest["id"]
    enabled = index["enabled"].get(ext_id)
    record = {
        "id": ext_id,
        "name": manifest["name"],
        "version": manifest["version"],
        "publisher": manifest["publisher"],
        "description": manifest["description"],
        "source": source,
        "folder": str(folder.relative_to(root)) if str(folder).startswith(str(root)) else folder.name,
        "builtin": source == "builtin",
        "enabled": True if enabled is None else bool(enabled),
        "permissions": manifest["permissions"],
        "permissionLabels": [_permission_label(p) for p in manifest["permissions"]],
        "nameEn": str((manifest["l10n"].get("en") or {}).get("name") or ""),
        "descriptionEn": str((manifest["l10n"].get("en") or {}).get("description") or ""),
        # Mapa completo {idioma: {name, description}} para los 14 idiomas de la UI.
        "l10n": manifest["l10n"],
        "readme": any((folder / name).is_file() for name in ("README.md", "readme.md", "README.txt")),
        "contributes": manifest["contributes"],
        "main": manifest["main"],
        "networkHosts": sorted(network_hosts(manifest)),
        "installedAt": (index["installed"].get(ext_id) or {}).get("installedAt"),
        "origin": (index["installed"].get(ext_id) or {}).get("origin", source),
    }
    return record


def list_extensions(root: Path) -> list[dict[str, Any]]:
    index = _read_index(root)
    rows: dict[str, dict[str, Any]] = {}
    built = builtin_dir(root)
    if built.is_dir():
        for folder in sorted(built.iterdir()):
            if folder.is_dir():
                entry = _entry(root, folder, "builtin", index)
                if entry:
                    rows[entry["id"]] = entry
    for folder in sorted(store_dir(root).iterdir()):
        if folder.is_dir():
            entry = _entry(root, folder, "installed", index)
            if entry:
                rows[entry["id"]] = entry      # instalada sobrescribe a la incluida
    return sorted(rows.values(), key=lambda e: (not e["builtin"], e["name"].lower()))


def find(root: Path, ext_id: str) -> tuple[Path, dict[str, Any]]:
    for row in list_extensions(root):
        if row["id"] == ext_id:
            folder = (root / row["folder"]).resolve()
            return folder, read_manifest(folder)
    raise ExtensionError(f"Extensión no encontrada: {ext_id}", 404)


def set_enabled(root: Path, ext_id: str, enabled: bool) -> dict[str, Any]:
    find(root, ext_id)
    index = _read_index(root)
    index["enabled"][ext_id] = bool(enabled)
    _write_index(root, index)
    row = next((r for r in list_extensions(root) if r["id"] == ext_id), None)
    return {"id": ext_id, "enabled": bool(enabled), "extension": row}


def uninstall(root: Path, ext_id: str) -> dict[str, Any]:
    folder, manifest = find(root, ext_id)
    if builtin_dir(root) in folder.parents:
        raise ExtensionError("Las extensiones incluidas no se desinstalan; desactívala.", 400)
    shutil.rmtree(folder, ignore_errors=True)
    index = _read_index(root)
    index["enabled"].pop(ext_id, None)
    index["installed"].pop(ext_id, None)
    _write_index(root, index)
    return {"id": manifest["id"], "uninstalled": True}


# ------------------------------------------------------------------ instalación
def _safe_extract(archive: tarfile.TarFile, dest: Path, prefix_len: int) -> int:
    count = 0
    for member in archive:
        name = member.name
        if not name or name.startswith("/") or ".." in Path(name).parts:
            continue
        if not member.isfile():
            continue
        parts = Path(name).parts[prefix_len:]
        if not parts or any(p in SKIP_DIRS for p in parts):
            continue
        rel = Path(*parts)
        target = (dest / rel).resolve()
        if not str(target).startswith(str(dest.resolve())):
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        with archive.extractfile(member) as src, target.open("wb") as out:  # type: ignore[union-attr]
            shutil.copyfileobj(src, out)
        count += 1
        if count > MAX_FILES:
            raise ExtensionError(f"La extensión supera {MAX_FILES} archivos", 413)
    return count


def _download(url: str, dest: Path) -> int:
    request = urllib.request.Request(url, headers={
        "User-Agent": "ElyCowork-Extensions/1.0",
        "Accept": "*/*",
    })
    written = 0
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            with dest.open("wb") as handle:
                while True:
                    chunk = response.read(256 * 1024)
                    if not chunk:
                        break
                    written += len(chunk)
                    if written > MAX_DOWNLOAD:
                        raise ExtensionError(
                            f"La descarga supera {MAX_DOWNLOAD // (1024 * 1024)} MB (ELY_EXT_MAX_DOWNLOAD)", 413)
                    handle.write(chunk)
    except urllib.error.HTTPError as exc:
        raise ExtensionError(f"HTTP {exc.code} al descargar {url}",
                             502 if exc.code >= 500 else 404,
                             exc.read()[:300].decode("utf-8", "replace")) from exc
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        raise ExtensionError(f"No se pudo descargar {url}: {exc}", 502) from exc
    return written


def _npm_tarball(package: str, version: str | None) -> tuple[str, str]:
    name = package.strip()
    meta_url = "https://registry.npmjs.org/" + urllib.parse.quote(name, safe="@")
    request = urllib.request.Request(meta_url, headers={"User-Agent": "ElyCowork-Extensions/1.0"})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            meta = json.loads(response.read(4 * 1024 * 1024).decode("utf-8"))
    except (urllib.error.URLError, ValueError, TimeoutError, OSError) as exc:
        raise ExtensionError(f"No se pudo leer el paquete npm '{name}': {exc}", 502) from exc
    wanted = version or (meta.get("dist-tags") or {}).get("latest")
    info = (meta.get("versions") or {}).get(wanted)
    if not info:
        raise ExtensionError(f"El paquete npm '{name}' no tiene la versión '{wanted}'", 404)
    tarball = ((info.get("dist") or {}).get("tarball") or "").strip()
    if not tarball:
        raise ExtensionError("El paquete npm no publica tarball", 502)
    return tarball, str(wanted)


def _source_urls(source: str) -> list[tuple[str, int]]:
    """Devuelve [(url, componentes_de_prefijo_a_quitar)] para una fuente."""
    text = source.strip()
    if text.startswith("npm:"):
        spec = text[4:]
        version = None
        if spec.count("@") >= 1 and not spec.startswith("@"):
            spec, version = spec.rsplit("@", 1)
        elif spec.startswith("@") and spec.count("@") > 1:
            spec, version = spec.rsplit("@", 1)
        url, _ = _npm_tarball(spec, version)
        return [(url, 1)]                       # npm empaqueta bajo "package/"
    if text.startswith(("http://", "https://")):
        parsed = urllib.parse.urlparse(text)
        if parsed.hostname not in INSTALL_HOSTS:
            raise ExtensionError(
                f"Host no permitido para instalar: {parsed.hostname}", 403,
                {"permitidos": sorted(INSTALL_HOSTS)})
        if parsed.hostname == "github.com":
            parts = [p for p in parsed.path.split("/") if p]
            if len(parts) >= 2:
                owner, repo = parts[0], parts[1].removesuffix(".git")
                ref = parts[3] if len(parts) > 3 and parts[2] in ("tree", "releases", "blob") else "HEAD"
                return [(f"https://codeload.github.com/{owner}/{repo}/tar.gz/{ref}", 1)]
        return [(text, 1), (text, 0)]
    if re.fullmatch(r"[\w.-]+/[\w.-]+(@[\w./-]+)?", text):
        slug, _, ref = text.partition("@")
        owner, repo = slug.split("/", 1)
        ref = ref or "HEAD"
        return [
            (f"https://codeload.github.com/{owner}/{repo}/tar.gz/{ref}", 1),
            (f"https://codeload.github.com/{owner}/{repo}/tar.gz/refs/heads/{ref}", 1),
        ]
    raise ExtensionError("Fuente no reconocida. Usa owner/repo, npm:paquete, una URL https o una carpeta del workspace.")


def _locate_manifest(folder: Path) -> Path:
    if (folder / MANIFEST).is_file():
        return folder
    for child in sorted(folder.iterdir()):
        if child.is_dir() and (child / MANIFEST).is_file():
            return child
    raise ExtensionError(
        f"El paquete no contiene {MANIFEST}. Las extensiones de VS Code (.vsix) no son compatibles: "
        "usa el formato de Ely (ver IDE/ely-extensions/README.md).", 415)


def _write_payload(dest: Path, files: list[Any]) -> Path:
    """Vuelca la carpeta elegida en el navegador a un directorio temporal.

    Solo texto, sin rutas absolutas ni '..' y con los límites de tamaño y
    número de archivos de cualquier otra instalación.
    """
    if not files:
        raise ExtensionError("La carpeta está vacía", 400)
    if len(files) > MAX_FILES:
        raise ExtensionError(f"Demasiados archivos (máximo {MAX_FILES})", 413)
    total = 0
    for item in files:
        if not isinstance(item, dict):
            raise ExtensionError("Cada archivo debe ser {path, text}", 400)
        rel = str(item.get("path") or "").replace("\\", "/").lstrip("/")
        parts = Path(rel).parts
        if not rel or ".." in parts or any(p in SKIP_DIRS for p in parts):
            raise ExtensionError(f"Ruta no permitida en la carpeta: {rel}", 400)
        content = str(item.get("text") or "")
        total += len(content.encode("utf-8"))
        if total > MAX_DOWNLOAD:
            raise ExtensionError("La carpeta supera el tamaño máximo", 413)
        target = dest / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
    return dest


def install(root: Path, source: str, folder: Any = None) -> dict[str, Any]:
    """Instala desde carpeta del navegador, carpeta del workspace, GitHub, npm o URL.

    `folder` puede ser una ruta dentro del workspace (str) o la lista de
    archivos {path, text} que envía el selector de carpetas del navegador.
    """
    text = str(source or "").strip()
    payload = folder if isinstance(folder, list) else None
    folder_name = folder if isinstance(folder, str) else None
    if not text and payload is None:
        raise ExtensionError("Falta la fuente de la extensión")

    # 1) carpeta local del workspace
    local = None
    if folder_name or not text.startswith(("http://", "https://", "npm:")) and "/" in text and not re.fullmatch(r"[\w.-]+/[\w.-]+(@[\w./-]+)?", text):
        try:
            info = workspace.read_file(root, folder_name or text)  # valida traversal
            local = None
        except workspace.WorkspaceError:
            candidate = (root / (folder_name or text)).resolve()
            if candidate.is_dir() and str(candidate).startswith(str(root.resolve())):
                local = candidate
    if local is None and folder_name:
        candidate = (root / folder_name).resolve()
        if candidate.is_dir() and str(candidate).startswith(str(root.resolve())):
            local = candidate

    tmp = Path(tempfile.mkdtemp(prefix="ely-ext-"))
    try:
        if payload is not None:
            local = _write_payload(tmp / "folder", payload)
        if local is not None:
            origin_folder = _locate_manifest(local)
            manifest = read_manifest(origin_folder)
            dest = store_dir(root) / manifest["id"]
            if dest.exists():
                shutil.rmtree(dest, ignore_errors=True)
            shutil.copytree(origin_folder, dest, ignore=shutil.ignore_patterns(*SKIP_DIRS))
            origin = str(local.relative_to(root)) if str(local).startswith(str(root)) else "carpeta del navegador"
        else:
            archive_path = tmp / "ext.tar.gz"
            last_error: Exception | None = None
            chosen = None
            for url, prefix in _source_urls(text):
                try:
                    _download(url, archive_path)
                    chosen = (url, prefix)
                    break
                except ExtensionError as exc:
                    last_error = exc
                    if exc.status in (403, 413):
                        raise
            if chosen is None:
                raise last_error or ExtensionError("No se pudo descargar la extensión", 502)
            unpacked = tmp / "unpacked"
            unpacked.mkdir()
            try:
                with tarfile.open(archive_path, "r:*") as archive:
                    _safe_extract(archive, unpacked, chosen[1])
            except tarfile.TarError as exc:
                raise ExtensionError(f"El archivo descargado no es un tar.gz válido: {exc}", 415) from exc
            origin_folder = _locate_manifest(unpacked)
            manifest = read_manifest(origin_folder)
            dest = store_dir(root) / manifest["id"]
            if dest.exists():
                shutil.rmtree(dest, ignore_errors=True)
            shutil.copytree(origin_folder, dest, ignore=shutil.ignore_patterns(*SKIP_DIRS))
            origin = chosen[0]

        # el main declarado debe existir
        if manifest["main"] and not (dest / manifest["main"]).is_file():
            shutil.rmtree(dest, ignore_errors=True)
            raise ExtensionError(f"El manifiesto declara main='{manifest['main']}' pero el archivo no existe", 415)

        index = _read_index(root)
        index["installed"][manifest["id"]] = {"origin": origin, "installedAt": int(time.time())}
        index["enabled"][manifest["id"]] = True
        _write_index(root, index)
        row = next((e for e in list_extensions(root) if e["id"] == manifest["id"]), None)
        return {"installed": True, "extension": row or manifest}
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


# --------------------------------------------------------- comunicación externa
def fetch(root: Path, ext_id: str, url: str, method: str = "GET",
          headers: dict[str, Any] | None = None, body: str | None = None) -> dict[str, Any]:
    """Fetch de una extensión, con permiso network:<host> del manifiesto.

    El navegador no puede salir a Internet desde el sandbox de la extensión;
    este proxy es la única salida y aplica la lista de hosts declarada.
    """
    _folder, manifest = find(root, ext_id)
    index = _read_index(root)
    if index["enabled"].get(ext_id) is False:
        raise ExtensionError(f"La extensión '{ext_id}' está desactivada", 403)
    parsed = urllib.parse.urlparse(str(url or ""))
    if parsed.scheme not in ("http", "https"):
        raise ExtensionError("Solo se permiten URLs http/https", 400)
    host = (parsed.hostname or "").lower()
    allowed = network_hosts(manifest)
    extra = {h.strip().lower() for h in os.environ.get("ELY_EXT_ALLOW_HOSTS", "").split(",") if h.strip()}
    if host not in allowed and host not in extra:
        raise ExtensionError(
            f"La extensión '{ext_id}' no tiene permiso de red para {host}", 403,
            {"declarados": sorted(allowed), "como_pedir": f"network:{host}"})
    verb = (method or "GET").upper()
    if verb not in ("GET", "POST", "HEAD"):
        raise ExtensionError("Método no permitido para extensiones (GET/POST/HEAD)", 405)
    safe_headers = {"User-Agent": f"ElyCowork-Extension/{manifest['id']}"}
    for key, value in (headers or {}).items():
        low = str(key).lower()
        if low in ("accept", "content-type", "authorization", "x-github-api-version"):
            safe_headers[str(key)] = str(value)[:2000]
    data = body.encode("utf-8") if body else None
    request = urllib.request.Request(url, data=data, headers=safe_headers, method=verb)
    started = time.time()
    try:
        with urllib.request.urlopen(request, timeout=FETCH_TIMEOUT) as response:
            raw = response.read(FETCH_LIMIT + 1)
            truncated = len(raw) > FETCH_LIMIT
            raw = raw[:FETCH_LIMIT]
            text = raw.decode("utf-8", "replace")
            return {
                "ok": 200 <= response.status < 300,
                "status": response.status,
                "url": response.geturl(),
                "headers": {k.lower(): v for k, v in response.headers.items()
                            if k.lower() in ("content-type", "etag", "last-modified", "x-ratelimit-remaining")},
                "text": text,
                "truncated": truncated,
                "ms": int((time.time() - started) * 1000),
                "host": host,
            }
    except urllib.error.HTTPError as exc:
        return {"ok": False, "status": exc.code, "url": url, "host": host,
                "text": exc.read(64 * 1024).decode("utf-8", "replace"),
                "headers": {}, "truncated": False, "ms": int((time.time() - started) * 1000)}
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        raise ExtensionError(f"Sin respuesta de {host}: {exc}", 502) from exc


# ------------------------------------------------------------------- archivos
def asset(root: Path, ext_id: str, rel: str) -> tuple[Path, str]:
    """Sirve un archivo de la extensión (main.js, css, README…)."""
    folder, _manifest = find(root, ext_id)
    clean = urllib.parse.unquote(rel or "").lstrip("/")
    target = (folder / clean).resolve()
    if not str(target).startswith(str(folder.resolve())):
        raise ExtensionError("Ruta fuera de la extensión", 403)
    if not target.is_file():
        raise ExtensionError(f"No existe: {clean}", 404)
    if target.stat().st_size > MAX_TEXT * 4:
        raise ExtensionError("Archivo demasiado grande para servirlo a la extensión", 413)
    import mimetypes
    ctype = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
    return target, ctype


def call(root: Path, op: str, args: dict[str, Any]) -> dict[str, Any]:
    """Punto de entrada único para /api/extensions/call."""
    args = args or {}
    if op == "list":
        return {"extensions": list_extensions(root), "permissions": PERMISSIONS,
                "installHosts": sorted(INSTALL_HOSTS),
                "vsixCompatible": False,
                "note": "Las extensiones VSIX de VS Code usan otra API y host Node; aquí se usa el formato Ely."}
    if op == "install":
        return install(root, str(args.get("source") or ""), args.get("folder"))
    if op == "uninstall":
        return uninstall(root, str(args.get("id") or ""))
    if op == "enable":
        return set_enabled(root, str(args.get("id") or ""), bool(args.get("enabled", True)))
    if op == "manifest":
        _folder, manifest = find(root, str(args.get("id") or ""))
        return {"manifest": manifest}
    if op == "fetch":
        return fetch(root, str(args.get("id") or ""), str(args.get("url") or ""),
                     str(args.get("method") or "GET"), args.get("headers"), args.get("body"))
    if op == "readme":
        folder, manifest = find(root, str(args.get("id") or ""))
        for name in ("README.md", "readme.md", "README.txt"):
            path = folder / name
            if path.is_file():
                return {"id": manifest["id"], "text": path.read_text(encoding="utf-8", errors="replace")[:MAX_TEXT]}
        return {"id": manifest["id"], "text": ""}
    raise ExtensionError(f"Operación desconocida: {op}", 404)


# --------------------------------------------------------------- runner (sandbox)
BRIDGE_JS = r"""
/* Puente Ely: la extensión vive en un iframe con sandbox (origen opaco).
 * No tiene DOM de la app, ni cookies, ni localStorage. Todo pasa por mensajes. */
(function () {
  var seq = 0, pending = {}, handlers = {}, listeners = {};
  function send(msg) {
    parent.postMessage(Object.assign({ __ely: 1, token: globalThis.__elyToken || null }, msg), "*");
  }
  function rpc(method, params) {
    return new Promise(function (resolve, reject) {
      var id = ++seq;
      pending[id] = { resolve: resolve, reject: reject };
      send({ kind: "rpc", id: id, method: method, params: params || {} });
      setTimeout(function () {
        if (pending[id]) { pending[id].reject(new Error("Tiempo de espera: " + method)); delete pending[id]; }
      }, 30000);
    });
  }
  function on(name, fn) {
    (listeners[name] = listeners[name] || []).push(fn);
    return { dispose: function () { listeners[name] = (listeners[name] || []).filter(function (f) { return f !== fn; }); } };
  }
  function emit(name, payload) {
    (listeners[name] || []).forEach(function (fn) { try { fn(payload); } catch (e) { report(e); } });
  }
  function report(err) {
    send({ kind: "log", level: "error", text: (err && err.message) || String(err) });
  }
  var ely = {
    version: "1.0",
    manifest: null,
    /* Idioma de la interfaz: el host lo envía al activar y al cambiarlo. */
    env: { language: "es", uiLanguage: "es" },
    /* l10n("Hola", "Hello")  -> forma clásica de dos argumentos.
     * l10n({es:"Hola", en:"Hello", de:"Hallo", ...}) -> mapa por idioma.
     * Si el idioma activo no está en el mapa, cae a inglés y luego a español. */
    l10n: function (a, b) {
      var lang = ely.env.language || "es";
      if (a && typeof a === "object") {
        if (typeof a[lang] === "string") return a[lang];
        if (typeof a.en === "string") return a.en;
        if (typeof a.es === "string") return a.es;
        return "";
      }
      if (lang === "es") return a;
      return typeof b === "string" ? b : a;
    },
    commands: {
      register: function (id, title, handler) {
        handlers["command:" + id] = handler;
        return rpc("commands.register", { id: id, title: title });
      },
      execute: function (id, args) { return rpc("commands.execute", { id: id, args: args }); }
    },
    window: {
      showMessage: function (text, kind) { return rpc("window.showMessage", { text: text, kind: kind || "info" }); },
      setStatusBar: function (id, text, tooltip) { return rpc("window.setStatusBar", { id: id, text: text, tooltip: tooltip }); },
      showQuickPick: function (items, options) { return rpc("window.showQuickPick", { items: items, options: options || {} }); },
      showInputBox: function (options) { return rpc("window.showInputBox", { options: options || {} }); },
      showDocument: function (title, text) { return rpc("window.showDocument", { title: title, text: text }); }
    },
    workspace: {
      readFile: function (path) { return rpc("workspace.readFile", { path: path }); },
      writeFile: function (path, content) { return rpc("workspace.writeFile", { path: path, content: content }); },
      list: function (path) { return rpc("workspace.list", { path: path || "" }); },
      search: function (query) { return rpc("workspace.search", { q: query }); }
    },
    editor: {
      getActiveFile: function () { return rpc("editor.getActiveFile", {}); },
      getText: function () { return rpc("editor.getText", {}); },
      getSelection: function () { return rpc("editor.getSelection", {}); },
      getLanguage: function () { return rpc("editor.getLanguage", {}); },
      insertText: function (text) { return rpc("editor.insertText", { text: text }); },
      replaceSelection: function (text) { return rpc("editor.replaceSelection", { text: text }); },
      onDidChangeActiveEditor: function (fn) { return on("activeEditor", fn); },
      onDidSaveTextDocument: function (fn) { return on("saved", fn); },
      onDidChangeText: function (fn) { return on("changeText", fn); }
    },
    languages: {
      /* Proveedor de autocompletado: el host lo invoca y acepta con Tab. */
      registerCompletionItemProvider: function (selector, provider, triggerCharacters) {
        handlers["completion"] = provider.provideCompletionItems || provider;
        return rpc("languages.registerCompletion", {
          selector: selector, triggers: triggerCharacters || [],
          label: (provider && provider.label) || "extensión"
        });
      },
      registerHoverProvider: function (selector, provider) {
        handlers["hover"] = provider.provideHover || provider;
        return rpc("languages.registerHover", { selector: selector });
      }
    },
    chat: {
      send: function (text) { return rpc("chat.send", { text: text }); }
    },
    /* Comunicación externa: sale por el backend, que aplica network:<host>. */
    fetch: function (url, options) { return rpc("net.fetch", { url: url, options: options || {} }); },
    on: on,
    log: function (text) { send({ kind: "log", level: "info", text: String(text) }); }
  };
  globalThis.ely = ely;
  globalThis.acquireElyApi = function () { return ely; };

  window.addEventListener("message", function (event) {
    var msg = event.data;
    if (!msg || msg.__ely !== 1) return;
    if (globalThis.__elyToken && msg.token && msg.token !== globalThis.__elyToken) return;
    if (msg.kind === "result") {
      var slot = pending[msg.id];
      if (!slot) return;
      delete pending[msg.id];
      msg.ok ? slot.resolve(msg.result) : slot.reject(new Error(msg.error || "error"));
      return;
    }
    if (msg.kind === "init") {
      ely.manifest = msg.manifest || null;
      ely.env.language = msg.language || "es";
      ely.env.uiLanguage = ely.env.language;
      Promise.resolve()
        .then(function () {
          if (typeof globalThis.activate === "function") return globalThis.activate(ely);
          if (globalThis.extension && typeof globalThis.extension.activate === "function") return globalThis.extension.activate(ely);
        })
        .then(function () { send({ kind: "activated" }); })
        .catch(function (err) { report(err); send({ kind: "failed", error: (err && err.message) || String(err) }); });
      return;
    }
    if (msg.kind === "invoke") {
      var fn = handlers[msg.method];
      if (!fn) { send({ kind: "invokeResult", id: msg.id, ok: false, error: "Sin manejador: " + msg.method }); return; }
      Promise.resolve()
        .then(function () { return fn(msg.params || {}); })
        .then(function (result) { send({ kind: "invokeResult", id: msg.id, ok: true, result: result === undefined ? null : result }); })
        .catch(function (err) { send({ kind: "invokeResult", id: msg.id, ok: false, error: (err && err.message) || String(err) }); });
      return;
    }
    if (msg.kind === "event") {
      if (msg.name === "language" && msg.payload) {
        ely.env.language = msg.payload.language || "es";
        ely.env.uiLanguage = ely.env.language;
      }
      emit(msg.name, msg.payload);
    }
  });
  window.addEventListener("error", function (e) { report(e.error || e.message); });
  send({ kind: "ready" });
})();
"""


def runner_html(root: Path, ext_id: str, token: str = "") -> str:
    """HTML que se carga en el iframe sandbox: puente + main.js inlineado.

    Se inlinea para que el iframe (origen opaco) no necesite ninguna petición
    de red: su único canal es postMessage con el host.
    """
    folder, manifest = find(root, ext_id)
    code = ""
    if manifest.get("main"):
        path = (folder / manifest["main"]).resolve()
        if not str(path).startswith(str(folder.resolve())) or not path.is_file():
            raise ExtensionError("main.js fuera de la extensión", 403)
        code = path.read_text(encoding="utf-8", errors="replace")
    contrib = json.dumps(manifest.get("contributes") or {}, ensure_ascii=False)
    safe_code = code.replace("</script", "<\\/script")
    return (
        "<!doctype html><html><head><meta charset=\"utf-8\"><title>" + manifest["name"] + "</title></head>"
        "<body><script>window.__elyToken=" + json.dumps(token) + ";</script>"
        "<script>" + BRIDGE_JS + "</script>"
        "<script>window.__elyContributions=" + contrib + ";</script>"
        "<script>\n" + safe_code + "\n</script></body></html>"
    )
