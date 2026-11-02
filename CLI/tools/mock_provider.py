#!/usr/bin/env python3
"""Proveedor local de verificación para Ely Cowork.

Servidor HTTP REAL (no simulado en la app) que implementa la superficie de
OpenAI Chat Completions. Su única finalidad es poder comprobar de punta a punta
que Ely: lee la clave, construye la URL, envía `Authorization: Bearer ...`,
parsea la respuesta y contabiliza tokens — incluso en entornos sin salida a
internet (CI, sandbox, red corporativa).

Reglas de autenticación (explícitas):
  * Sin cabecera Authorization        -> 401
  * Clave que no sea APikeyexample-n  -> 401 {"error": "invalid_api_key"}
  * Clave válida                      -> 200 con una respuesta real del servidor

Uso:
    python3 CLI/tools/mock_provider.py --port 8799
    ELY_LOCAL_BASE_URL=http://127.0.0.1:8799/v1 ELY_LOCAL_MODEL=ely-echo \\
        ./CLI/ely test -p local
"""
from __future__ import annotations

import argparse
import json
import re
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

KEY_PATTERN = re.compile(r"^APikeyexample-(\d+)$")

MODELS = [
    {"id": "ely-echo", "object": "model", "owned_by": "ely-local"},
    {"id": "ely-echo-mini", "object": "model", "owned_by": "ely-local"},
]


class ProviderHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "ElyLocalProvider/1.0"

    verbose = False

    def log_message(self, fmt, *args):  # noqa: D401
        if self.verbose:
            print(f"  [{time.strftime('%H:%M:%S')}] {self.address_string()} {fmt % args}")

    # ---------------------------------------------------------------- helpers
    def _json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _auth(self) -> tuple[bool, str, int | None]:
        header = self.headers.get("Authorization", "")
        if not header.startswith("Bearer "):
            return False, "missing_api_key", None
        token = header[7:].strip()
        match = KEY_PATTERN.match(token)
        if not match:
            return False, "invalid_api_key", None
        return True, token, int(match.group(1))

    # ---------------------------------------------------------------- verbos
    def do_GET(self) -> None:  # noqa: N802
        if self.path.rstrip("/").endswith("/models"):
            valid, _token, _n = self._auth()
            if not valid:
                return self._json(401, {"error": {
                    "message": "Invalid API key", "type": "invalid_request_error",
                    "code": "invalid_api_key"}})
            return self._json(200, {"object": "list", "data": MODELS})
        self._json(404, {"error": {"message": f"Ruta no encontrada: {self.path}"}})

    def do_POST(self) -> None:  # noqa: N802
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b"{}"
        try:
            payload = json.loads(raw or b"{}")
        except json.JSONDecodeError:
            return self._json(400, {"error": {"message": "JSON inválido"}})

        valid, token, number = self._auth()
        if not valid:
            return self._json(401, {"error": {
                "message": f"Invalid API key provided: {self.headers.get('Authorization', 'none')[:24]}",
                "type": "invalid_request_error",
                "code": "invalid_api_key",
            }})

        if not self.path.rstrip("/").endswith(("/chat/completions", "/messages")):
            return self._json(404, {"error": {"message": f"Ruta no encontrada: {self.path}"}})

        messages = payload.get("messages") or []
        last_user = next((m.get("content") for m in reversed(messages) if m.get("role") == "user"), "")
        model = payload.get("model") or "ely-echo"
        prompt_tokens = max(1, sum(len(str(m.get("content", ""))) for m in messages) // 4)
        max_tokens = int(payload.get("max_tokens") or 64)

        if payload.get("stream"):
            return self._stream(model, number, token, last_user, prompt_tokens)

        text = (
            f"[proveedor local · credencial {token} aceptada] "
            f"Recibí {len(messages)} mensaje(s) para el modelo «{model}». "
            f"Último mensaje del usuario: {str(last_user)[:160]!r}. "
            "Ely Cowork completó el ciclo URL + API Key + respuesta."
        )
        self._json(200, {
            "id": "chatcmpl-local-" + str(int(time.time() * 1000)),
            "object": "chat.completion",
            "created": int(time.time()),
            "model": model,
            "choices": [{
                "index": 0,
                "message": {"role": "assistant", "content": text},
                "finish_reason": "stop",
            }],
            "usage": {
                "prompt_tokens": prompt_tokens,
                "completion_tokens": min(max_tokens, max(8, len(text) // 4)),
                "total_tokens": prompt_tokens + min(max_tokens, max(8, len(text) // 4)),
            },
            "ely_local": {"credential_number": number, "authenticated": True},
        })

    def _stream(self, model: str, number: int | None, token: str, last_user: str, prompt_tokens: int) -> None:
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "keep-alive")
        self.end_headers()
        words = (
            f"[credencial {token} aceptada] El proveedor local respondió en streaming "
            f"al modelo «{model}». Recibido: {str(last_user)[:100]!r}"
        ).split(" ")
        try:
            for word in words:
                chunk = {
                    "id": "chatcmpl-local", "object": "chat.completion.chunk", "model": model,
                    "choices": [{"index": 0, "delta": {"content": word + " "}}],
                }
                self.wfile.write(f"data: {json.dumps(chunk)}\n\n".encode())
                self.wfile.flush()
                time.sleep(0.01)
            final = {
                "id": "chatcmpl-local", "object": "chat.completion.chunk", "model": model,
                "choices": [], "usage": {
                    "prompt_tokens": prompt_tokens,
                    "completion_tokens": len(words),
                    "total_tokens": prompt_tokens + len(words),
                },
            }
            self.wfile.write(f"data: {json.dumps(final)}\n\ndata: [DONE]\n\n".encode())
            self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            pass


def main() -> None:
    parser = argparse.ArgumentParser(description="Proveedor local de verificación para Ely Cowork")
    parser.add_argument("--port", type=int, default=8799)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args()
    ProviderHandler.verbose = args.verbose
    httpd = ThreadingHTTPServer((args.host, args.port), ProviderHandler)
    print(f"◆ Proveedor local Ely en http://{args.host}:{args.port}/v1")
    print("  Acepta claves APikeyexample-1..11 · cualquier otra devuelve 401")
    print(f"  Exporta: ELY_LOCAL_BASE_URL=http://{args.host}:{args.port}/v1 ELY_LOCAL_MODEL=ely-echo")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n· detenido")
    finally:
        httpd.server_close()


if __name__ == "__main__":
    main()
