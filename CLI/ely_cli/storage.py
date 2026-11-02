"""Local Storage — archivos por perfil, en dos categorías.

Cada perfil (la configuración de usuario que se desea usar) tiene su propia
carpeta dentro de ``Local Storage/`` en la raíz del repo, con dos áreas:

    Local Storage/
    └── <perfil>/
        ├── generado/   → lo que ya se generó, para acceso rápido
        │                 (conversaciones guardadas y archivos producidos)
        └── planeado/   → lo que se planea tener (notas, borradores, planes)

El aislamiento por perfil garantiza que la conversación del perfil A no
aparezca en el perfil B: cada perfil lee y escribe únicamente en su carpeta.
"""
from __future__ import annotations

import json
import re
import time
import uuid
from pathlib import Path
from typing import Any

from .config import ConfigError, get_profile

STORAGE_DIR = "Local Storage"
GENERATED = "generado"
PLANNED = "planeado"
MAX_SESSIONS = 100
MAX_PLANNED = 200
# Archivos de índice que no se listan como "archivos sueltos".
_INDEX_FILES = {"sessions.json", "items.json"}


def _now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def safe_profile_id(profile_id: str) -> str:
    """Sanea el id de perfil para usarlo como nombre de carpeta.

    Solo permite letras, números, guion y guion bajo; evita path traversal
    (``..`` / barras) y nombres vacíos.
    """
    cleaned = re.sub(r"[^A-Za-z0-9_-]", "_", str(profile_id or "").strip())
    if not cleaned or cleaned in {".", ".."}:
        raise ConfigError("Identificador de perfil inválido para Local Storage.")
    return cleaned


class ProfileStorage:
    """Administra la carpeta ``Local Storage`` de un perfil concreto."""

    def __init__(self, root: Path, profile_id: str | None = None):
        self.root = root
        self.profile = get_profile(profile_id, root)  # valida que el perfil exista
        self.base = root / STORAGE_DIR / safe_profile_id(self.profile.id)
        self.generated = self.base / GENERATED
        self.planned = self.base / PLANNED
        self.generated.mkdir(parents=True, exist_ok=True)
        self.planned.mkdir(parents=True, exist_ok=True)

    # ------------------------------------------------------------ JSON atómico
    def _read(self, path: Path, default: Any) -> Any:
        if not path.is_file():
            return default
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            return default

    def _write(self, path: Path, data: Any) -> None:
        tmp = path.with_suffix(".tmp")
        tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        tmp.replace(path)

    # ------------------------------------------------------------ generado: sesiones
    @property
    def sessions_path(self) -> Path:
        return self.generated / "sessions.json"

    def sessions(self) -> list[dict[str, Any]]:
        data = self._read(self.sessions_path, [])
        return data if isinstance(data, list) else []

    def save_session(self, session: dict[str, Any]) -> dict[str, Any]:
        sessions = [s for s in self.sessions() if s.get("id") != session.get("id")]
        session["profile"] = self.profile.id
        session["updated_at"] = _now()
        sessions.insert(0, session)
        self._write(self.sessions_path, sessions[:MAX_SESSIONS])
        return session

    def delete_session(self, session_id: str) -> bool:
        sessions = self.sessions()
        kept = [s for s in sessions if s.get("id") != session_id]
        self._write(self.sessions_path, kept)
        return len(kept) != len(sessions)

    def migrate_legacy(self, legacy_path: Path) -> int:
        """Mueve sesiones globales antiguas (.ely/sessions.json) a este perfil.

        Solo actúa si este perfil aún no tiene sesiones y el archivo legado
        existe. Devuelve cuántas sesiones se adoptaron.
        """
        if self.sessions_path.is_file() or not legacy_path.is_file():
            return 0
        data = self._read(legacy_path, [])
        if isinstance(data, list) and data:
            self._write(self.sessions_path, data[:MAX_SESSIONS])
            return len(data[:MAX_SESSIONS])
        return 0

    # ------------------------------------------------------------ planeado
    @property
    def planned_path(self) -> Path:
        return self.planned / "items.json"

    def planned_items(self) -> list[dict[str, Any]]:
        data = self._read(self.planned_path, [])
        return data if isinstance(data, list) else []

    def add_planned(self, title: str, note: str = "") -> dict[str, Any]:
        title = str(title or "").strip()
        if not title:
            raise ConfigError("El elemento planeado necesita un título.")
        item = {
            "id": "p_" + uuid.uuid4().hex[:12],
            "title": title[:120],
            "note": str(note or "").strip()[:2000],
            "created_at": _now(),
        }
        items = self.planned_items()
        items.insert(0, item)
        self._write(self.planned_path, items[:MAX_PLANNED])
        return item

    def delete_planned(self, item_id: str) -> bool:
        items = self.planned_items()
        kept = [i for i in items if i.get("id") != item_id]
        self._write(self.planned_path, kept)
        return len(kept) != len(items)

    # ------------------------------------------------------------ archivos sueltos
    def _files(self, folder: Path) -> list[dict[str, Any]]:
        out: list[dict[str, Any]] = []
        for path in sorted(folder.iterdir()):
            if not path.is_file() or path.suffix == ".tmp" or path.name in _INDEX_FILES:
                continue
            stat = path.stat()
            out.append({
                "name": path.name,
                "size": stat.st_size,
                "modified": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(stat.st_mtime)),
            })
        return out

    # ------------------------------------------------------------ archivos: lectura
    def _resolve(self, kind: str, name: str) -> Path:
        folder = self.generated if kind == GENERATED else self.planned if kind == PLANNED else None
        if folder is None:
            raise ConfigError("Categoría inválida: usa 'generado' o 'planeado'.")
        clean = Path(str(name or "")).name  # solo el basename, sin rutas
        if not clean or clean != str(name) or clean in {".", ".."}:
            raise ConfigError("Nombre de archivo inválido.")
        target = (folder / clean).resolve()
        if folder.resolve() not in target.parents:
            raise ConfigError("Ruta fuera de Local Storage.")
        if not target.is_file():
            raise ConfigError(f"No existe el archivo: {clean}")
        return target

    def read_file(self, kind: str, name: str) -> dict[str, Any]:
        target = self._resolve(kind, name)
        raw = target.read_bytes()
        ext = target.suffix.lower().lstrip(".")
        try:
            content = raw.decode("utf-8")
            encoding = "utf-8"
        except UnicodeDecodeError:
            content = None
            encoding = "binary"
        return {
            "name": target.name, "kind": kind, "ext": ext,
            "size": len(raw), "encoding": encoding,
            "content": content, "binary": content is None,
        }

    def raw_file(self, kind: str, name: str) -> tuple[bytes, str]:
        import mimetypes
        target = self._resolve(kind, name)
        ctype = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        if target.suffix.lower() in {".tex", ".latex", ".md", ".csv", ".json", ".txt"}:
            ctype = "text/plain; charset=utf-8"
        elif ctype.startswith("text/") or ctype in {"application/javascript", "application/json", "image/svg+xml"}:
            ctype += "; charset=utf-8"
        return target.read_bytes(), ctype

    # ------------------------------------------------------------ árbol (IDE)
    def tree(self) -> dict[str, Any]:
        entries: list[dict[str, Any]] = []
        for kind, folder in ((GENERATED, self.generated), (PLANNED, self.planned)):
            entries.append({"path": kind, "type": "dir", "size": 0, "ext": ""})
            for path in sorted(folder.iterdir()):
                if not path.is_file() or path.suffix == ".tmp" or path.name in _INDEX_FILES:
                    continue
                entries.append({
                    "path": f"{kind}/{path.name}", "type": "file",
                    "size": path.stat().st_size, "ext": path.suffix.lower().lstrip("."),
                    "kind": kind, "name": path.name,
                })
        return {"profile": self.profile.id, "entries": entries,
                "counts": {"files": sum(1 for e in entries if e["type"] == "file")}}

    # ------------------------------------------------------------ muestras
    def ensure_samples(self) -> list[str]:
        """Crea archivos de ejemplo (tex, pdf, html, md, csv, json, svg) si faltan."""
        created: list[str] = []
        for name, data in _samples().items():
            target = self.generated / name
            if target.is_file():
                continue
            payload = data.encode("utf-8") if isinstance(data, str) else data
            target.write_bytes(payload)
            created.append(name)
        return created

    # ------------------------------------------------------------ resumen
    def overview(self) -> dict[str, Any]:
        self.ensure_samples()  # archivos de ejemplo para probar el visor
        try:
            rel = str(self.base.relative_to(self.root))
        except ValueError:
            rel = str(self.base)
        return {
            "profile": self.profile.id,
            "profile_label": self.profile.label,
            "path": rel,
            "generated": {
                "sessions": self.sessions(),
                "files": self._files(self.generated),
            },
            "planned": {
                "items": self.planned_items(),
                "files": self._files(self.planned),
            },
        }


# ---------------------------------------------------------------------------
# Archivos de ejemplo para probar el visor (LaTeX, PDF, HTML, MD, CSV, JSON, SVG)
# ---------------------------------------------------------------------------
def _pdf_bytes(title: str, lines: list[str]) -> bytes:
    """PDF mínimo válido (una página, fuente Helvetica) sin dependencias."""
    def esc(s: str) -> str:
        return s.replace("\\", r"\\").replace("(", r"\(").replace(")", r"\)")

    content = ["BT", "/F1 18 Tf", "50 760 Td", f"({esc(title)}) Tj", "/F1 11 Tf"]
    for line in lines:
        content += ["0 -22 Td", f"({esc(line)}) Tj"]
    content.append("ET")
    stream = "\n".join(content).encode("latin-1", "replace")

    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
        b"/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
        b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    out = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for i, obj in enumerate(objects, start=1):
        offsets.append(len(out))
        out += f"{i} 0 obj\n".encode() + obj + b"\nendobj\n"
    xref_pos = len(out)
    out += f"xref\n0 {len(objects) + 1}\n".encode()
    out += b"0000000000 65535 f \n"
    for off in offsets[1:]:
        out += f"{off:010d} 00000 n \n".encode()
    out += (f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\n"
            f"startxref\n{xref_pos}\n%%EOF\n").encode()
    return bytes(out)


def _samples() -> dict[str, Any]:
    html = """<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<title>Ely · ejemplo HTML</title>
<style>
 body{font-family:system-ui,sans-serif;margin:0;background:#0f1117;color:#e8eaf2;
      display:flex;min-height:100vh;align-items:center;justify-content:center}
 .card{max-width:520px;padding:32px;border:1px solid #2a2f45;border-radius:16px;
       background:#161a26}
 h1{margin:0 0 8px;font-size:22px}
 p{color:#9aa3c0;line-height:1.6}
 .tag{display:inline-block;padding:4px 10px;border-radius:999px;background:#232a44;
      color:#8b9cff;font-size:12px;margin-top:12px}
</style></head>
<body><div class="card">
<h1>Hola desde Ely 👋</h1>
<p>Este es un archivo HTML de ejemplo guardado en <b>Local Storage</b>.
El visor lo renderiza en un iframe aislado (sandbox).</p>
<span class="tag">generado / ejemplo.html</span>
</div></body></html>
"""
    tex = r"""\documentclass{article}
\usepackage[utf8]{inputenc}
\title{Ejemplo de \LaTeX{} en Ely}
\author{Ely Cowork}
\date{\today}
\begin{document}
\maketitle
\section{Introducción}
Este es un documento \textbf{LaTeX} de ejemplo guardado en Local Storage.
El visor convierte lo básico a HTML: \textit{cursivas}, \textbf{negritas} y listas.
\section{Matemáticas}
La identidad de Euler: $e^{i\pi} + 1 = 0$.
Una fracción: $\frac{a}{b}$.
\section{Lista}
\begin{itemize}
  \item Abrir archivos de distintos formatos.
  \item Guardarlos por perfil en Local Storage.
  \item Verlos en el IDE y en el chat.
\end{itemize}
\end{document}
"""
    md = """# Ejemplo Markdown

Este archivo vive en **Local Storage** del perfil activo.

## Características
- Se abre en el visor con formato.
- Soporta `código`, **negrita** y *cursiva*.

> Ely Cowork · acceso rápido a lo generado.

```python
print("Hola desde Ely")
```
"""
    csv = "nombre,formato,uso\nejemplo.html,HTML,visor sandbox\nejemplo.pdf,PDF,visor nativo\nejemplo.tex,LaTeX,render básico\nejemplo.md,Markdown,formato\nejemplo.csv,CSV,tabla\nejemplo.json,JSON,árbol\nejemplo.svg,SVG,imagen\n"
    json_sample = '{\n  "app": "Ely Cowork",\n  "storage": "Local Storage",\n  "categorias": ["generado", "planeado"],\n  "ejemplo": true,\n  "version": 1\n}\n'
    svg = """<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180">
<rect width="320" height="180" rx="16" fill="#161a26"/>
<circle cx="70" cy="90" r="34" fill="#22c55e"/>
<text x="120" y="80" fill="#e8eaf2" font-family="system-ui" font-size="20" font-weight="700">Ely</text>
<text x="120" y="108" fill="#9aa3c0" font-family="system-ui" font-size="13">Local Storage · SVG</text>
</svg>
"""
    pdf = _pdf_bytes("Ely · ejemplo PDF", [
        "Este es un archivo PDF de ejemplo guardado en Local Storage.",
        "Se abre con el visor de PDF nativo del navegador.",
        "",
        "Categorias por perfil:",
        "  - generado/  (acceso rapido a lo ya creado)",
        "  - planeado/  (lo que se planea tener)",
        "",
        "Ely Cowork - Local Storage",
    ])
    return {
        "ejemplo.html": html,
        "ejemplo.tex": tex,
        "ejemplo.md": md,
        "ejemplo.csv": csv,
        "ejemplo.json": json_sample,
        "ejemplo.svg": svg,
        "ejemplo.pdf": pdf,
    }
