"""Carga de perfiles, claves y rutas del proyecto Ely.

Reglas:
  * Las API keys NUNCA se guardan en el repositorio. Se leen de variables de
    entorno (`{VAR}` en la URL, `{PROFILE_KEY_VAR}` para la clave) o del
    archivo `.ely/keys.env` (ignorado por git).
  * Los perfiles declaran el endpoint real (URL + modelo) y el nombre de la
    variable que contiene la clave. Así el mismo perfil funciona con una clave
    de prueba o con una clave de producción.
"""
from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

APP_DIR = ".ely"
DEFAULT_PROFILE = "openai"


def repo_root(start: Path | None = None) -> Path:
    """Raíz del repo: directorio que contiene CLI/ e IDE/ (o el cwd)."""
    here = (start or Path.cwd()).resolve()
    for candidate in [here, *here.parents]:
        if (candidate / "CLI").is_dir() and (candidate / "IDE").is_dir():
            return candidate
    # fallback: dos niveles arriba de este archivo (CLI/ely_cli/config.py)
    return Path(__file__).resolve().parents[2]


def profiles_dir(root: Path) -> Path:
    return root / "profiles"


def state_dir(root: Path) -> Path:
    path = root / APP_DIR
    path.mkdir(parents=True, exist_ok=True)
    return path


def _parse_env_file(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.is_file():
        return values
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        values[key.strip()] = val.strip().strip('"').strip("'")
    return values


def load_keys_with_origin(root: Path) -> dict[str, tuple[str, str]]:
    """Devuelve {NOMBRE: (valor, origen)} para auditar de dónde salió cada clave."""
    out: dict[str, tuple[str, str]] = {}
    for name, value in _parse_env_file(profiles_dir(root) / "test-keys.env").items():
        out[name] = (value, "profiles/test-keys.env")
    for name, value in _parse_env_file(root / APP_DIR / "keys.env").items():
        out[name] = (value, ".ely/keys.env")
    extra = os.environ.get("ELY_KEYS_FILE")
    if extra:
        for name, value in _parse_env_file(Path(extra).expanduser()).items():
            out[name] = (value, extra)
    for name, value in os.environ.items():
        if _looks_like_key_name(name):
            out[name] = (value, "environment")
    local = root / APP_DIR / "profiles.local.json"
    if local.is_file():
        try:
            for name, value in json.loads(local.read_text()).items():
                out[name] = (str(value), ".ely/profiles.local.json")
        except (json.JSONDecodeError, OSError):
            pass
    return out


def load_keys(root: Path) -> dict[str, str]:
    """Claves disponibles.

    Prioridad (de menor a mayor):
      profiles/test-keys.env  -> fixtures APikeyexample-n (repositorio)
      .ely/keys.env           -> claves reales locales (ignorado por git)
      variables de entorno    -> siempre ganan
    """
    return {name: value for name, (value, _origin) in load_keys_with_origin(root).items()}


def resolve_key(profile_id: str, root: Path | None = None) -> dict[str, Any]:
    """De dónde sale la clave de un perfil concreto (sin exponerla)."""
    root = root or repo_root()
    profiles = load_profiles(root)
    profile = next((p for p in profiles if p.id == profile_id), None)
    if profile is None:
        raise ConfigError(f"Perfil '{profile_id}' no existe")
    origin = load_keys_with_origin(root).get(profile.key_var, (None, "missing"))[1]
    return {
        "profile": profile.id,
        "key_var": profile.key_var,
        "has_key": profile.has_key,
        "masked_key": profile.masked_key,
        "origin": origin,
        "is_test_key": is_test_key(profile.api_key),
        "endpoint": profile.endpoint(),
    }


TEST_KEY_PATTERN = re.compile(r"^APikeyexample-\d+$")


def is_test_key(value: str | None) -> bool:
    """True si la clave es una fixture APikeyexample-n del repositorio."""
    return bool(value and TEST_KEY_PATTERN.match(value))


def _looks_like_key_name(name: str) -> bool:
    upper = name.upper()
    return upper.endswith(("_API_KEY", "_KEY", "_TOKEN")) or upper.startswith("ELY_")


@dataclass
class Profile:
    """Un perfil de conexión a un proveedor compatible con Chat Completions."""

    id: str
    label: str
    provider: str
    model: str
    base_url: str
    key_var: str
    api_key: str | None = None
    color: str = "#8b9cff"
    timeout: int = 60
    requests_per_minute: int = 60
    max_tokens: int = 1024
    temperature: float = 0.6
    headers: dict[str, str] = field(default_factory=dict)
    notes: str = ""
    source: str = ""
    extra: dict[str, Any] = field(default_factory=dict)

    @property
    def has_key(self) -> bool:
        return bool(self.api_key)

    @property
    def masked_key(self) -> str:
        if not self.api_key:
            return ""
        key = self.api_key
        return f"{key[:6]}…{key[-4:]}" if len(key) > 12 else "•" * len(key)

    def endpoint(self, suffix: str | None = None) -> str:
        """URL final de chat. `base_url` puede ser la raíz del API o la URL completa."""
        base = (self.base_url or "").rstrip("/")
        if not base:
            return ""
        terminal = ("/chat/completions", "/messages", "/responses")
        if base.endswith(terminal):
            return base
        if self.extra.get("chat_path"):
            return base + str(self.extra["chat_path"])
        if suffix is None:
            suffix = "/messages" if self.provider.lower() == "anthropic" else "/chat/completions"
        return base + suffix

    def public(self) -> dict[str, Any]:
        """Vista segura: sin la clave en claro."""
        return {
            "id": self.id,
            "label": self.label,
            "provider": self.provider,
            "model": self.model,
            "base_url": self.base_url,
            "endpoint": self.endpoint(),
            "key_var": self.key_var,
            "has_key": self.has_key,
            "masked_key": self.masked_key,
            "color": self.color,
            "timeout": self.timeout,
            "requests_per_minute": self.requests_per_minute,
            "max_tokens": self.max_tokens,
            "temperature": self.temperature,
            "notes": self.notes,
            "source": self.source,
            "extra": self.extra,
        }


def _profile_from_dict(raw: dict[str, Any], keys: dict[str, str], source: str) -> Profile:
    pid = str(raw.get("id") or "perfil")
    key_var = str(raw.get("key_var") or f"{pid.upper().replace('-', '_')}_API_KEY")
    api_key = keys.get(key_var)
    if api_key is None:
        api_key = raw.get("api_key")
    env: dict[str, str] = {}
    for k, v in os.environ.items():
        env[k.upper()] = v
    for k, v in keys.items():
        env.setdefault(k.upper(), v)
    base_url = str(raw.get("base_url") or "")
    rpm_raw = raw.get("requests_per_minute", 60)
    if isinstance(rpm_raw, bool) or not isinstance(rpm_raw, int) or not 0 <= rpm_raw <= 100_000:
        raise ConfigError(f"requests_per_minute inválido en perfil {pid}: usa un entero entre 0 y 100000")

    def fill(value: str) -> str:
        def repl(match: re.Match[str]) -> str:
            return env.get(match.group(1).upper(), "")

        return re.sub(r"\{([A-Za-z0-9_]+)\}", repl, value)

    return Profile(
        id=pid,
        label=str(raw.get("label") or pid),
        provider=str(raw.get("provider") or "openai"),
        model=fill(str(raw.get("model") or "gpt-4o-mini")),
        base_url=fill(base_url),
        key_var=key_var,
        api_key=api_key,
        color=str(raw.get("color") or "#8b9cff"),
        timeout=int(raw.get("timeout") or 60),
        requests_per_minute=rpm_raw,
        max_tokens=int(raw.get("max_tokens") or 1024),
        temperature=float(raw.get("temperature") if raw.get("temperature") is not None else 0.6),
        headers=dict(raw.get("headers") or {}),
        notes=str(raw.get("notes") or ""),
        source=source,
        extra={k: v for k, v in raw.items() if k not in _KNOWN_PROFILE_KEYS},
    )


_KNOWN_PROFILE_KEYS = {
    "id", "label", "provider", "model", "base_url", "key_var", "api_key", "color",
    "timeout", "requests_per_minute", "max_tokens", "temperature", "headers", "notes",
}


def load_profiles(root: Path | None = None) -> list[Profile]:
    root = root or repo_root()
    keys = load_keys(root)
    out: list[Profile] = []
    for path in sorted(profiles_dir(root).glob("*.json")):
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError) as exc:
            raise ConfigError(f"Perfil inválido {path.name}: {exc}") from exc
        if isinstance(raw, list):
            out.extend(_profile_from_dict(item, keys, path.name) for item in raw)
        else:
            out.append(_profile_from_dict(raw, keys, path.name))
    if not out:
        raise ConfigError(
            f"No hay perfiles en {profiles_dir(root)}. Añade un JSON con base_url, model y key_var."
        )
    # El perfil marcado como default va primero.
    default_id = os.environ.get("ELY_PROFILE") or read_default_id(root)
    if default_id:
        out.sort(key=lambda p: 0 if p.id == default_id else 1)
    return out


def read_default_id(root: Path) -> str | None:
    state = root / APP_DIR / "state.json"
    if state.is_file():
        try:
            return json.loads(state.read_text()).get("default_profile")
        except (json.JSONDecodeError, OSError):
            return None
    return None


def get_profile(profile_id: str | None, root: Path | None = None) -> Profile:
    profiles = load_profiles(root)
    if not profile_id:
        return profiles[0]
    for prof in profiles:
        if prof.id == profile_id:
            return prof
    available = ", ".join(p.id for p in profiles)
    raise ConfigError(f"Perfil '{profile_id}' no existe. Disponibles: {available}")


class ConfigError(RuntimeError):
    pass
