"""Role-aware failover across already configured Ely profiles.

Secrets stay in Profile objects in process memory. Only profile/model IDs and
validation timestamps are cached; no key or provider error body is persisted.
"""
from __future__ import annotations

import json
import threading
import time
from pathlib import Path
from typing import Any, Iterator

from . import llm
from .config import ConfigError, Profile, is_test_key, load_profiles

FAILOVER_STATUSES = {401, 403, 408, 429, 500, 502, 503, 504}
ROLE_BY_AGENT = {"photon": "planner", "dev": "coder", "review": "reviewer", "docs": "writer"}
CONFIGURABLE_ROLES = {"planner", "coder", "reviewer", "writer", "chat"}
_CACHE_TTL = 900
_LOCK = threading.RLock()
_VALIDATION: dict[tuple[str, str], dict[str, Any]] = {}
_COOLDOWN: dict[str, float] = {}
_INFLIGHT: dict[str, int] = {}
_ROTATION: dict[str, int] = {}


def role_for_agent(agent_id: str | None) -> str:
    return ROLE_BY_AGENT.get(str(agent_id or "").lower(), "chat")


def _profiles(root: Path) -> list[Profile]:
    try:
        return load_profiles(root)
    except ConfigError:
        return []


def _settings(root: Path) -> dict[str, Any]:
    path = root / ".ely" / "key-pool.json"
    try:
        data = json.loads(path.read_text(encoding="utf-8")) if path.is_file() else {}
        return data if isinstance(data, dict) else {}
    except (json.JSONDecodeError, OSError):
        return {}


def configure_roles(root: Path, roles: Any) -> dict[str, Any]:
    if not isinstance(roles, dict) or set(roles) - CONFIGURABLE_ROLES:
        raise ValueError("roles debe ser un objeto con planner, coder, reviewer, writer o chat")
    profiles = {p.id: p for p in _profiles(root)}
    clean: dict[str, list[str]] = {}
    for role, profile_ids in roles.items():
        if not isinstance(profile_ids, list) or len(profile_ids) > 12 or any(not isinstance(x, str) for x in profile_ids):
            raise ValueError(f"roles.{role} debe ser una lista de hasta 12 ids de perfil")
        ids = list(dict.fromkeys(profile_ids))
        for profile_id in ids:
            profile = profiles.get(profile_id)
            if not profile:
                raise ValueError(f"Perfil desconocido: {profile_id}")
            if not profile.has_key or is_test_key(profile.api_key):
                raise ValueError(f"El perfil {profile_id} no tiene una clave de producción configurada")
        clean[role] = ids
    path = root / ".ely" / "key-pool.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {"roles": clean}
    temp = path.with_suffix(".tmp")
    temp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    temp.replace(path)
    return {"roles": clean, "saved": True}


def configured_candidates(root: Path, primary: Profile, role: str) -> list[Profile]:
    profiles = {p.id: p for p in _profiles(root)}
    settings = _settings(root)
    primary_id = str(getattr(primary, "id", ""))
    roles = settings.get("roles") if isinstance(settings.get("roles"), dict) else {}
    preferred = roles.get(role, []) if isinstance(roles, dict) else []
    preferred = [str(x) for x in preferred if isinstance(x, str)] if isinstance(preferred, list) else []
    order = [primary_id] + [p for p in preferred if p != primary_id]
    if not preferred:
        order += [pid for pid in sorted(profiles) if pid != primary_id]
    # A non-empty role list is an allowlist; do not spill over to unrelated keys.
    candidates = [primary]
    for pid in order[1:]:
        profile = profiles.get(pid)
        if profile and profile.has_key and not is_test_key(profile.api_key) and profile.base_url:
            candidates.append(profile)
    return candidates


def _validated(profile: Profile, *, force: bool = False) -> tuple[bool, str]:
    key = (profile.id, profile.model)
    now = time.time()
    with _LOCK:
        cached = _VALIDATION.get(key)
        if not force and cached and now - cached["at"] < _CACHE_TTL:
            return bool(cached["ok"]), str(cached.get("reason", "cached"))
    result = llm.probe(profile, mode="models")
    models = result.get("models") or []
    ok = bool(result.get("ok")) and profile.model in models
    reason = "model-permission-confirmed" if ok else ("model-not-listed" if result.get("ok") else "models-endpoint-unavailable")
    with _LOCK:
        _VALIDATION[key] = {"ok": ok, "reason": reason, "at": now}
    return ok, reason


def validate_profile(root: Path, profile_id: str, *, force: bool = False) -> dict[str, Any]:
    profile = next((p for p in _profiles(root) if p.id == profile_id), None)
    if not profile:
        raise ValueError(f"Perfil '{profile_id}' no existe")
    if not profile.has_key or is_test_key(profile.api_key):
        return {"profile": profile.id, "model": profile.model, "ok": False,
                "reason": "no production API key configured"}
    ok, reason = _validated(profile, force=force)
    return {"profile": profile.id, "model": profile.model, "ok": ok, "reason": reason}


def status(root: Path, primary_id: str | None = None, role: str = "chat") -> dict[str, Any]:
    profiles = {p.id: p for p in _profiles(root)}
    primary = profiles.get(primary_id or "")
    if primary is None:
        primary = next(iter(profiles.values()), None)
    if primary is None:
        return {"enabled": False, "role": role, "profiles": []}
    rows = []
    for profile in configured_candidates(root, primary, role):
        cache = _VALIDATION.get((profile.id, profile.model))
        rows.append({"profile": profile.id, "model": profile.model,
                     "has_key": bool(profile.has_key and not is_test_key(profile.api_key)),
                     "primary": profile.id == primary.id,
                     "validated": bool(cache and cache.get("ok")),
                     "cooldown": max(0, int(_COOLDOWN.get(profile.id, 0) - time.time()))})
    return {"enabled": len(rows) > 1, "role": role, "primary": primary.id, "profiles": rows,
            "validation_cache_ttl_seconds": _CACHE_TTL}


def _profile_id(profile: Profile) -> str:
    return str(getattr(profile, "id", getattr(profile, "model", "primary")))


def _acquire(profile: Profile) -> None:
    pid = _profile_id(profile)
    with _LOCK:
        _INFLIGHT[pid] = _INFLIGHT.get(pid, 0) + 1


def _release(profile: Profile) -> None:
    pid = _profile_id(profile)
    with _LOCK:
        _INFLIGHT[pid] = max(0, _INFLIGHT.get(pid, 1) - 1)


def _mark_failure(profile: Profile, exc: llm.LLMError) -> None:
    if exc.status in FAILOVER_STATUSES or exc.status is None:
        pid = _profile_id(profile)
        with _LOCK:
            cooldown = 60 if exc.status in {401, 403} else 15
            _COOLDOWN[pid] = time.time() + cooldown
            _VALIDATION.pop((pid, profile.model), None)


def _backup_order(candidates: list[Profile], role: str) -> list[Profile]:
    backups = candidates[1:]
    if not backups:
        return []
    with _LOCK:
        start = _ROTATION.get(role, 0) % len(backups)
        _ROTATION[role] = start + 1
        rotated = backups[start:] + backups[:start]
        return sorted(rotated, key=lambda p: (_COOLDOWN.get(p.id, 0) > time.time(),
                                              _INFLIGHT.get(p.id, 0)))


def complete(root: Path, primary: Profile, role: str, messages: list[dict[str, Any]], **overrides: Any) -> tuple[Profile, llm.LLMResult]:
    """Use primary first; on transient/auth/model failure, prevalidate and fail over."""
    candidates = configured_candidates(root, primary, role)
    first_error: llm.LLMError | None = None
    _acquire(primary)
    try:
        return primary, llm.complete(primary, messages, **overrides)
    except llm.LLMError as exc:
        first_error = exc
        _mark_failure(primary, exc)
        if exc.status not in FAILOVER_STATUSES and exc.status is not None:
            raise
    finally:
        _release(primary)

    if first_error is None:
        raise llm.LLMError("Falló la llamada primaria sin detalle.")
    last_error = first_error
    for candidate in _backup_order(candidates, role):
        with _LOCK:
            if _COOLDOWN.get(candidate.id, 0) > time.time():
                continue
        ok, _reason = _validated(candidate)
        if not ok:
            continue
        _acquire(candidate)
        try:
            kwargs = dict(overrides)
            kwargs["model"] = candidate.model
            return candidate, llm.complete(candidate, messages, **kwargs)
        except llm.LLMError as exc:
            last_error = exc
            _mark_failure(candidate, exc)
        finally:
            _release(candidate)
    raise last_error


def stream(root: Path, primary: Profile, role: str, messages: list[dict[str, Any]], **overrides: Any) -> Iterator[tuple[Profile, dict[str, Any]]]:
    """Fail over only before any output has been emitted, avoiding duplicate text."""
    candidates = configured_candidates(root, primary, role)
    ordered = [primary, *_backup_order(candidates, role)]
    last_error: llm.LLMError | None = None
    for candidate in ordered:
        with _LOCK:
            if candidate.id != primary.id and _COOLDOWN.get(candidate.id, 0) > time.time():
                continue
        if candidate.id != primary.id:
            ok, _reason = _validated(candidate)
            if not ok:
                continue
        _acquire(candidate)
        emitted = False
        try:
            kwargs = dict(overrides)
            if candidate.id != primary.id:
                kwargs["model"] = candidate.model
            for event in llm.stream(candidate, messages, **kwargs):
                if event.get("type") in {"delta", "tool_calls"}:
                    emitted = True
                yield candidate, event
            return
        except llm.LLMError as exc:
            last_error = exc
            _mark_failure(candidate, exc)
            if emitted or (exc.status not in FAILOVER_STATUSES and exc.status is not None):
                raise
        finally:
            _release(candidate)
    if last_error:
        raise last_error
    raise llm.LLMError("No hay perfiles alternativos validados para este rol.")
