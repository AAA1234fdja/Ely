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

    # ------------------------------------------------------------ resumen
    def overview(self) -> dict[str, Any]:
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
