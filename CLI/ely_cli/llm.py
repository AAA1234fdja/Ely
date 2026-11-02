"""Cliente HTTP mínimo para endpoints compatibles con Chat Completions.

Soporta `stream=True` (SSE) y `stream=False`. No hay respuestas simuladas: si
no hay red o la clave no es válida, se lanza `LLMError` con el detalle real.
"""
from __future__ import annotations

import json
import socket
import ssl
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from typing import Any, Iterator

from .config import Profile

USER_AGENT = "ElyCowork-CLI/0.9.0"


class LLMError(RuntimeError):
    def __init__(self, message: str, *, status: int | None = None, detail: Any = None):
        super().__init__(message)
        self.status = status
        self.detail = detail


@dataclass
class Usage:
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0
    latency_ms: int = 0

    def as_dict(self) -> dict[str, int]:
        return {
            "prompt_tokens": self.prompt_tokens,
            "completion_tokens": self.completion_tokens,
            "total_tokens": self.total_tokens,
            "latency_ms": self.latency_ms,
        }


@dataclass
class LLMResult:
    text: str = ""
    model: str = ""
    usage: Usage = field(default_factory=Usage)
    raw: dict[str, Any] | None = None


def _headers(profile: Profile) -> dict[str, str]:
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": USER_AGENT,
    }
    if profile.api_key:
        # Compatibilidad: Anthropic usa x-api-key, el resto Bearer.
        if profile.provider.lower() == "anthropic":
            headers["x-api-key"] = profile.api_key
            headers["anthropic-version"] = "2023-06-01"
        else:
            headers["Authorization"] = f"Bearer {profile.api_key}"
    headers.update({str(k): str(v) for k, v in profile.headers.items()})
    return headers


def _anthropic_payload(
    profile: Profile, messages: list[dict[str, str]], stream: bool, **overrides: Any
) -> dict[str, Any]:
    """Anthropic Messages API: el system prompt va aparte y max_tokens es obligatorio."""
    system = "\n".join(m["content"] for m in messages if m.get("role") == "system")
    turns = [m for m in messages if m.get("role") != "system"]
    body: dict[str, Any] = {
        "model": overrides.pop("model", profile.model),
        "messages": turns,
        "stream": stream,
        "temperature": overrides.pop("temperature", profile.temperature),
        "max_tokens": overrides.pop("max_tokens", profile.max_tokens),
    }
    if system:
        body["system"] = system
    body.update(overrides)
    return body


def _payload(profile: Profile, messages: list[dict[str, str]], stream: bool, **overrides: Any) -> dict[str, Any]:
    if profile.provider.lower() == "anthropic":
        return _anthropic_payload(profile, messages, stream, **overrides)
    body: dict[str, Any] = {
        "model": overrides.pop("model", profile.model),
        "messages": messages,
        "stream": stream,
        "temperature": overrides.pop("temperature", profile.temperature),
        "max_tokens": overrides.pop("max_tokens", profile.max_tokens),
    }
    body.update(overrides)
    return body


def _request(profile: Profile, payload: dict[str, Any], accept: str) -> urllib.request.Request:
    url = profile.endpoint()
    if not profile.base_url:
        raise LLMError(
            f"El perfil '{profile.id}' no tiene base_url. Configúralo en profiles/{profile.id}.json"
        )
    return urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={**_headers(profile), "Accept": accept},
        method="POST",
    )


def _explain_http_error(exc: urllib.error.HTTPError, body: bytes) -> LLMError:
    detail: Any = body.decode("utf-8", "replace")[:1200]
    try:
        parsed = json.loads(detail)
        detail = parsed.get("error", parsed)
    except json.JSONDecodeError:
        pass
    hint = {
        401: "La API Key fue rechazada (no autorizada).",
        403: "La clave es válida pero no tiene permisos para este modelo.",
        404: "El endpoint o el modelo no existen en ese proveedor.",
        429: "Límite de peticiones o cuota agotada.",
    }.get(exc.code, "")
    msg = f"HTTP {exc.code} {exc.reason}. {hint}".strip()
    return LLMError(msg, status=exc.code, detail=detail)


def _explain_network_error(exc: BaseException) -> LLMError:
    reason = getattr(exc, "reason", exc)
    if isinstance(reason, socket.gaierror):
        return LLMError(
            f"No se pudo resolver el host de la URL ({reason}). "
            "Revisa la conexión o el DNS."
        )
    text = f"{type(reason).__name__}: {reason}"
    if "SSL" in text or "EOF" in text or isinstance(reason, ssl.SSLError):
        return LLMError(
            "La conexión TLS se cerró durante el handshake. "
            "Causa típica: un proxy de salida (sandbox/egress) bloquea este host. "
            "Verifica con `curl -I <url>`; si también falla, no es la clave ni la URL.",
            detail=text,
        )
    return LLMError(f"Error de red: {text}")


def complete(
    profile: Profile,
    messages: list[dict[str, str]],
    **overrides: Any,
) -> LLMResult:
    """Llamada no streaming. Devuelve texto + uso real reportado por el proveedor."""
    payload = _payload(profile, messages, stream=False, **overrides)
    req = _request(profile, payload, "application/json")
    started = time.monotonic()
    try:
        with urllib.request.urlopen(req, timeout=profile.timeout) as resp:
            raw = resp.read()
    except urllib.error.HTTPError as exc:
        raise _explain_http_error(exc, exc.read()) from exc
    except (urllib.error.URLError, socket.timeout, TimeoutError, OSError) as exc:
        raise _explain_network_error(exc) from exc

    elapsed = int((time.monotonic() - started) * 1000)
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise LLMError("La respuesta no es JSON válido.", detail=raw[:500].decode("utf-8", "replace")) from exc

    text = _extract_text(data)
    usage_raw = data.get("usage") or {}
    usage = Usage(
        prompt_tokens=int(usage_raw.get("prompt_tokens") or usage_raw.get("input_tokens") or 0),
        completion_tokens=int(usage_raw.get("completion_tokens") or usage_raw.get("output_tokens") or 0),
        total_tokens=int(usage_raw.get("total_tokens") or 0),
        latency_ms=elapsed,
    )
    if not usage.total_tokens:
        usage.total_tokens = usage.prompt_tokens + usage.completion_tokens
    return LLMResult(text=text, model=str(data.get("model") or payload["model"]), usage=usage, raw=data)


def _extract_text(data: dict[str, Any]) -> str:
    """Acepta el formato OpenAI y el de Anthropic Messages."""
    choices = data.get("choices")
    if isinstance(choices, list) and choices:
        first = choices[0] or {}
        message = first.get("message") or {}
        if isinstance(message.get("content"), str):
            return message["content"]
        if isinstance(message.get("content"), list):
            return "".join(part.get("text", "") for part in message["content"] if isinstance(part, dict))
        if isinstance(first.get("text"), str):
            return first["text"]
    content = data.get("content")
    if isinstance(content, list):
        return "".join(part.get("text", "") for part in content if isinstance(part, dict))
    if isinstance(content, str):
        return content
    return ""


def stream(
    profile: Profile,
    messages: list[dict[str, str]],
    **overrides: Any,
) -> Iterator[dict[str, Any]]:
    """Generador SSE. Emite eventos: `delta`, `usage`, `done`, `error`."""
    payload = _payload(profile, messages, stream=True, **overrides)
    payload.setdefault("stream_options", {"include_usage": True})
    req = _request(profile, payload, "text/event-stream")
    started = time.monotonic()
    usage = Usage()
    try:
        with urllib.request.urlopen(req, timeout=profile.timeout) as resp:
            for raw_line in resp:
                line = raw_line.decode("utf-8", "replace").strip()
                if not line or line.startswith(":") or not line.startswith("data:"):
                    continue
                chunk = line[5:].strip()
                if chunk == "[DONE]":
                    break
                try:
                    data = json.loads(chunk)
                except json.JSONDecodeError:
                    continue
                if data.get("usage"):
                    u = data["usage"]
                    usage.prompt_tokens = int(u.get("prompt_tokens") or u.get("input_tokens") or 0)
                    usage.completion_tokens = int(u.get("completion_tokens") or u.get("output_tokens") or 0)
                    usage.total_tokens = int(u.get("total_tokens") or 0)
                piece = _delta_text(data)
                if piece:
                    yield {"type": "delta", "text": piece}
    except urllib.error.HTTPError as exc:
        raise _explain_http_error(exc, exc.read()) from exc
    except (urllib.error.URLError, socket.timeout, TimeoutError, OSError) as exc:
        raise _explain_network_error(exc) from exc

    usage.latency_ms = int((time.monotonic() - started) * 1000)
    if not usage.total_tokens:
        usage.total_tokens = usage.prompt_tokens + usage.completion_tokens
    yield {"type": "usage", "usage": usage.as_dict()}
    yield {"type": "done"}


def _delta_text(data: dict[str, Any]) -> str:
    choices = data.get("choices") or []
    if choices:
        delta = (choices[0] or {}).get("delta") or {}
        if isinstance(delta.get("content"), str):
            return delta["content"]
        if isinstance(delta.get("reasoning_content"), str):
            return ""  # razonamiento interno: no se muestra como respuesta
    if data.get("type") == "content_block_delta":
        return (data.get("delta") or {}).get("text", "")
    return ""


def probe(profile: Profile, *, mode: str = "chat") -> dict[str, Any]:
    """Prueba real de conectividad. `mode`: chat | auth | models.

    - chat : POST /chat/completions con 1 token. El camino completo.
    - models: GET {base_url}/models (endpoint de metadatos habitual).
    - auth : POST /chat/completions con max_tokens=1, sin reintentos.
    """
    started = time.monotonic()
    base = {"profile": profile.id, "model": profile.model, "url": "", "credential": profile.masked_key}
    try:
        if mode == "models":
            url = profile.base_url.rstrip("/") + "/models"
            base["url"] = url
            req = urllib.request.Request(url, headers={**_headers(profile), "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=profile.timeout) as resp:
                body = json.loads(resp.read() or b"{}")
            count = len(body.get("data") or body.get("models") or [])
            return {
                **base,
                "ok": True,
                "status": 200,
                "latency_ms": int((time.monotonic() - started) * 1000),
                "detail": f"{count} modelos disponibles",
                "models": [m.get("id") for m in (body.get("data") or []) if isinstance(m, dict)][:50],
            }

        result = complete(
            profile,
            [{"role": "user", "content": "ping"}],
            max_tokens=1,
            temperature=0,
        )
        return {
            **base,
            "url": profile.endpoint(),
            "ok": True,
            "status": 200,
            "latency_ms": result.usage.latency_ms,
            "detail": "Respuesta válida del proveedor",
            "usage": result.usage.as_dict(),
        }
    except LLMError as exc:
        status = exc.status
        base["url"] = base["url"] or profile.endpoint()
        reachable = status is not None
        return {
            **base,
            "ok": False,
            "status": status,
            "latency_ms": int((time.monotonic() - started) * 1000),
            "detail": str(exc),
            "error_detail": exc.detail,
            "reachable": reachable,
            "credential_valid": status not in (401, 403) if reachable else None,
            "hint": "El endpoint respondió: la URL y la ruta son correctas."
            if reachable
            else "Sin respuesta HTTP: revisa la URL, DNS o la red.",
        }
