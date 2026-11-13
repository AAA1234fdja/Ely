"""Cliente HTTP mínimo para endpoints compatibles con Chat Completions.

Soporta `stream=True` (SSE) y `stream=False`. No hay respuestas simuladas: si
no hay red o la clave no es válida, se lanza `LLMError` con el detalle real.
"""
from __future__ import annotations

import json
import random
import threading
from collections import deque
import socket
import ssl
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from typing import Any, Iterator

from .config import Profile

USER_AGENT = "ElyCowork-CLI/0.9.0"
MAX_RETRIES = 3
RETRYABLE_HTTP = {429, 500, 502, 503, 504}
_PROFILE_WINDOW_SECONDS = 60.0
_PROFILE_LIMIT_LOCK = threading.Lock()
_PROFILE_REQUESTS: dict[str, deque[float]] = {}


def _acquire_profile_slot(profile: Profile) -> None:
    """Apply a process-wide sliding-window request limit keyed by profile id."""
    limit = getattr(profile, "requests_per_minute", 60)
    if isinstance(limit, bool) or not isinstance(limit, int) or limit < 0:
        raise ValueError("requests_per_minute debe ser un entero no negativo")
    if limit == 0:
        return  # explícitamente ilimitado
    profile_id = str(getattr(profile, "id", "default"))
    while True:
        now = time.monotonic()
        with _PROFILE_LIMIT_LOCK:
            requests = _PROFILE_REQUESTS.setdefault(profile_id, deque())
            while requests and now - requests[0] >= _PROFILE_WINDOW_SECONDS:
                requests.popleft()
            if len(requests) < limit:
                requests.append(now)
                return
            delay = _PROFILE_WINDOW_SECONDS - (now - requests[0])
        time.sleep(max(0.001, delay))


def _open_with_retry(req: urllib.request.Request, timeout: int, profile: Profile | None = None):
    """Retry only transient connection/status failures, never auth or bad requests."""
    for attempt in range(MAX_RETRIES + 1):
        try:
            if profile is not None:
                _acquire_profile_slot(profile)
            return urllib.request.urlopen(req, timeout=timeout)
        except urllib.error.HTTPError as exc:
            if exc.code not in RETRYABLE_HTTP or attempt >= MAX_RETRIES:
                raise
            retry_after = exc.headers.get("Retry-After") if exc.headers else None
            try:
                delay = min(8.0, max(0.0, float(retry_after))) if retry_after else None
            except (TypeError, ValueError):
                delay = None
            if delay is None:
                delay = min(4.0, 0.35 * (2 ** attempt)) + random.uniform(0.0, 0.2)
            exc.close()
            time.sleep(delay)
        except (urllib.error.URLError, socket.timeout, TimeoutError) as exc:
            if attempt >= MAX_RETRIES:
                raise
            delay = min(4.0, 0.35 * (2 ** attempt)) + random.uniform(0.0, 0.2)
            time.sleep(delay)
    raise AssertionError("unreachable")


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
    tool_calls: list[dict[str, Any]] = field(default_factory=list)
    finish_reason: str = ""


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
    profile: Profile, messages: list[dict[str, Any]], stream: bool, **overrides: Any
) -> dict[str, Any]:
    """Adapta mensajes y herramientas al formato Messages API de Anthropic."""
    system = "\n".join(str(m["content"]) for m in messages if m.get("role") == "system")
    turns: list[dict[str, Any]] = []
    for message in messages:
        role = message.get("role")
        if role == "system":
            continue
        if role == "assistant" and message.get("tool_calls"):
            blocks: list[dict[str, Any]] = []
            content = message.get("content")
            if isinstance(content, str) and content:
                blocks.append({"type": "text", "text": content})
            for call in message.get("tool_calls") or []:
                function = call.get("function") or {}
                arguments = function.get("arguments", {})
                if isinstance(arguments, str):
                    try:
                        arguments = json.loads(arguments)
                    except json.JSONDecodeError:
                        arguments = {}
                blocks.append({
                    "type": "tool_use",
                    "id": call.get("id") or "toolu-ely",
                    "name": function.get("name", ""),
                    "input": arguments if isinstance(arguments, dict) else {},
                })
            turns.append({"role": "assistant", "content": blocks})
        elif role == "tool":
            block = {
                "type": "tool_result",
                "tool_use_id": message.get("tool_call_id", ""),
                "content": str(message.get("content", "")),
            }
            if turns and turns[-1].get("role") == "user" and isinstance(turns[-1].get("content"), list):
                turns[-1]["content"].append(block)
            else:
                turns.append({"role": "user", "content": [block]})
        else:
            turns.append({"role": role, "content": message.get("content", "")})

    openai_tools = overrides.pop("tools", None)
    if openai_tools:
        overrides["tools"] = [
            {
                "name": item.get("function", {}).get("name", ""),
                "description": item.get("function", {}).get("description", ""),
                "input_schema": item.get("function", {}).get("parameters", {"type": "object"}),
            }
            for item in openai_tools
            if item.get("type") == "function" and isinstance(item.get("function"), dict)
        ]
    choice = overrides.pop("tool_choice", None)
    if choice == "auto":
        overrides["tool_choice"] = {"type": "auto"}
    elif choice == "required":
        overrides["tool_choice"] = {"type": "any"}
    elif isinstance(choice, dict):
        function = choice.get("function") or {}
        if function.get("name"):
            overrides["tool_choice"] = {"type": "tool", "name": function["name"]}

    prompt_cache = bool(overrides.pop("prompt_cache", False))
    body: dict[str, Any] = {
        "model": overrides.pop("model", profile.model),
        "messages": turns,
        "stream": stream,
        "temperature": overrides.pop("temperature", profile.temperature),
        "max_tokens": overrides.pop("max_tokens", profile.max_tokens),
    }
    if system:
        body["system"] = ([{"type": "text", "text": system,
                            "cache_control": {"type": "ephemeral"}}] if prompt_cache else system)
    body.update(overrides)
    return body


def _payload(profile: Profile, messages: list[dict[str, Any]], stream: bool, **overrides: Any) -> dict[str, Any]:
    if profile.provider.lower() == "anthropic":
        return _anthropic_payload(profile, messages, stream, **overrides)
    # OpenAI-compatible providers generally cache reusable prefixes implicitly;
    # do not send a non-standard cache parameter on those APIs.
    overrides.pop("prompt_cache", None)
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


def _explain_network_error(exc: BaseException, url: str = "") -> LLMError:
    reason = getattr(exc, "reason", exc)
    hostname = None
    authority = "<host>"
    if url:
        try:
            parsed_url = urllib.parse.urlsplit(url)
            hostname = parsed_url.hostname
            if hostname:
                authority = f"[{hostname}]" if ":" in hostname else hostname
                if parsed_url.port:
                    authority += f":{parsed_url.port}"
        except ValueError:
            pass  # URL malformada: conserva el diagnóstico original sin filtrar datos.
    host_hint = f" ({hostname})" if hostname else ""
    if isinstance(reason, socket.gaierror):
        return LLMError(
            f"No se pudo resolver el host{host_hint} ({reason}). Revisa el DNS y la URL del perfil."
        )
    text = f"{type(reason).__name__}: {reason}"
    if isinstance(reason, ssl.SSLError) or "SSL" in text or "TLS" in text or "EOF" in text:
        proxy_configured = bool(urllib.request.getproxies())
        proxy_hint = (
            " Python tiene un proxy configurado; revisa HTTPS_PROXY/https_proxy y NO_PROXY/no_proxy."
            if proxy_configured else
            " Python no detecta un proxy configurado."
        )
        return LLMError(
            f"Falló el handshake TLS con el servidor{host_hint}; no se llegó a una respuesta HTTP, "
            "por lo que este fallo no valida ni implica un problema con la API key."
            f"{proxy_hint} Comprueba el mismo host con `curl -Iv https://{authority}`. "
            "Si curl también falla, revisa el proxy/firewall de salida, DNS y certificados; "
            "si curl funciona, compara la configuración de proxy y certificados usada por Python.",
            detail=text,
        )
    return LLMError(f"Error de red{host_hint}: {text}")


def complete(
    profile: Profile,
    messages: list[dict[str, Any]],
    **overrides: Any,
) -> LLMResult:
    """Llamada no streaming. Devuelve texto + uso real reportado por el proveedor."""
    payload = _payload(profile, messages, stream=False, **overrides)
    req = _request(profile, payload, "application/json")
    started = time.monotonic()
    try:
        with _open_with_retry(req, timeout=profile.timeout, profile=profile) as resp:
            raw = resp.read()
    except urllib.error.HTTPError as exc:
        raise _explain_http_error(exc, exc.read()) from exc
    except (urllib.error.URLError, socket.timeout, TimeoutError, OSError) as exc:
        raise _explain_network_error(exc, req.full_url) from exc

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
    return LLMResult(
        text=text,
        model=str(data.get("model") or payload["model"]),
        usage=usage,
        raw=data,
        tool_calls=_extract_tool_calls(data),
        finish_reason=str(((data.get("choices") or [{}])[0] or {}).get("finish_reason") or data.get("stop_reason") or ""),
    )


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


def _extract_tool_calls(data: dict[str, Any]) -> list[dict[str, Any]]:
    """Normaliza tool calls de Chat Completions y Anthropic Messages."""
    choices = data.get("choices")
    message = ((choices[0] or {}).get("message") or {}) if isinstance(choices, list) and choices else {}
    calls: list[dict[str, Any]] = []
    for index, call in enumerate(message.get("tool_calls") or []):
        function = call.get("function") or {}
        arguments: Any = function.get("arguments", "{}")
        if isinstance(arguments, str):
            try:
                arguments = json.loads(arguments)
            except json.JSONDecodeError:
                pass  # engine valida; preserva texto malformado para devolver observación al modelo.
        calls.append({
            "id": str(call.get("id") or f"call_{index}"),
            "name": str(function.get("name") or ""),
            "arguments": arguments,
        })
    for index, block in enumerate(data.get("content") or []):
        if not isinstance(block, dict) or block.get("type") != "tool_use":
            continue
        calls.append({
            "id": str(block.get("id") or f"toolu_{index}"),
            "name": str(block.get("name") or ""),
            "arguments": block.get("input") if isinstance(block.get("input"), dict) else {},
        })
    return calls


def stream(
    profile: Profile,
    messages: list[dict[str, Any]],
    **overrides: Any,
) -> Iterator[dict[str, Any]]:
    """SSE normalizado: deltas de texto, tool_calls, uso y fin."""
    payload = _payload(profile, messages, stream=True, **overrides)
    if profile.provider.lower() != "anthropic":
        payload.setdefault("stream_options", {"include_usage": True})
    req = _request(profile, payload, "text/event-stream")
    started = time.monotonic()
    usage = Usage()
    openai_calls: dict[int, dict[str, Any]] = {}
    anthropic_calls: dict[int, dict[str, Any]] = {}
    try:
        with _open_with_retry(req, timeout=profile.timeout, profile=profile) as resp:
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

                choices = data.get("choices") or []
                if choices:
                    delta = (choices[0] or {}).get("delta") or {}
                    for call in delta.get("tool_calls") or []:
                        index = int(call.get("index", 0))
                        entry = openai_calls.setdefault(index, {"id": "", "name": "", "arguments": ""})
                        entry["id"] = call.get("id") or entry["id"]
                        function = call.get("function") or {}
                        entry["name"] += function.get("name") or ""
                        entry["arguments"] += function.get("arguments") or ""

                kind = data.get("type")
                if kind == "content_block_start":
                    block = data.get("content_block") or {}
                    if block.get("type") == "tool_use":
                        anthropic_calls[int(data.get("index", 0))] = {
                            "id": block.get("id") or "",
                            "name": block.get("name") or "",
                            "arguments": block.get("input") if isinstance(block.get("input"), dict) else {},
                            "json_delta": "",
                        }
                elif kind == "content_block_delta" and (data.get("delta") or {}).get("type") == "input_json_delta":
                    entry = anthropic_calls.setdefault(int(data.get("index", 0)), {"id": "", "name": "", "arguments": {}, "json_delta": ""})
                    entry["json_delta"] += (data.get("delta") or {}).get("partial_json", "")

                piece = _delta_text(data)
                if piece:
                    yield {"type": "delta", "text": piece}
    except urllib.error.HTTPError as exc:
        raise _explain_http_error(exc, exc.read()) from exc
    except (urllib.error.URLError, socket.timeout, TimeoutError, OSError) as exc:
        raise _explain_network_error(exc, req.full_url) from exc

    calls: list[dict[str, Any]] = []
    for index, call in sorted(openai_calls.items()):
        arguments: Any = call["arguments"] or "{}"
        if isinstance(arguments, str):
            try:
                arguments = json.loads(arguments)
            except json.JSONDecodeError:
                pass
        calls.append({"id": call["id"] or f"call_{index}", "name": call["name"], "arguments": arguments})
    for index, call in sorted(anthropic_calls.items()):
        arguments = call["arguments"]
        if call["json_delta"]:
            try:
                arguments = json.loads(call["json_delta"])
            except json.JSONDecodeError:
                arguments = call["json_delta"]
        calls.append({"id": call["id"] or f"toolu_{index}", "name": call["name"], "arguments": arguments})
    if calls:
        yield {"type": "tool_calls", "tool_calls": calls}
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
            _acquire_profile_slot(profile)
            with urllib.request.urlopen(req, timeout=profile.timeout) as resp:
                body = json.loads(resp.read() or b"{}")
            rows = body.get("data") or body.get("models") or []
            model_ids = [m.get("id") if isinstance(m, dict) else str(m)
                         for m in rows if isinstance(m, (dict, str))]
            return {
                **base,
                "ok": True,
                "status": 200,
                "latency_ms": int((time.monotonic() - started) * 1000),
                "detail": f"{len(rows)} modelos disponibles",
                "models": model_ids[:200],
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
