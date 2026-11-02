"""Servidor HTTP de Ely Cowork: sirve el frontend del IDE y expone la API real.

Solo librería estándar (http.server + ThreadingHTTPServer).
Endpoints bajo /api/*; todo lo demás se sirve desde IDE/frontend/.
Las llamadas al modelo las hace Python (no el navegador) para que la API Key
nunca llegue al cliente.
"""
from __future__ import annotations

import json
import mimetypes
import os
import socket
import sys
import urllib.parse
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Callable

from . import __version__, llm, mcp, routes, workspace
from .agents import AGENTS, AGENTS_BY_ID, get_agent, tools, workflows
from .config import (
    ConfigError,
    is_test_key,
    load_keys_with_origin,
    load_profiles,
    profiles_dir,
    repo_root,
    resolve_key,
)
from .engine import Engine

MAX_BODY = 2 * 1024 * 1024


class ApiError(Exception):
    def __init__(self, status: int, message: str, detail: Any = None):
        super().__init__(message)
        self.status = status
        self.detail = detail


class ElyHandler(BaseHTTPRequestHandler):
    server_version = f"ElyCowork/{__version__}"
    protocol_version = "HTTP/1.1"
    # Un proxy de preview reescribe Host/Origin con dominios propios.
    # Aceptarlos es seguro aquí: el servidor no usa el Host para enrutar.

    engine: Engine
    frontend: Path

    # ------------------------------------------------------------------ utilidades
    def log_message(self, fmt: str, *args: Any) -> None:  # silencia el ruido por petición
        if os.environ.get("ELY_HTTP_LOG"):
            sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    def _send(self, status: int, body: bytes, content_type: str, extra: dict[str, str] | None = None) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", self.origin_allow())
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header("Cache-Control", "no-store")
        for key, value in (extra or {}).items():
            self.send_header(key, value)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def origin_allow(self) -> str:
        """Refleja el origen de la petición (proxy de preview, túnel o LAN)."""
        return self.headers.get("Origin") or "*"

    def json(self, data: Any, status: int = 200) -> None:
        payload = json.dumps(data, ensure_ascii=False, default=str).encode("utf-8")
        self._send(status, payload, "application/json; charset=utf-8")

    def text(self, value: str, status: int = 200, content_type: str = "text/plain; charset=utf-8") -> None:
        self._send(status, value.encode("utf-8"), content_type)

    def read_json(self) -> dict[str, Any]:
        length = int(self.headers.get("Content-Length") or 0)
        if length > MAX_BODY:
            raise ApiError(413, "Cuerpo demasiado grande")
        if not length:
            return {}
        raw = self.rfile.read(length)
        try:
            data = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise ApiError(400, f"JSON inválido: {exc}") from exc
        if not isinstance(data, dict):
            raise ApiError(400, "Se esperaba un objeto JSON")
        return data

    def query(self) -> dict[str, str]:
        parsed = urllib.parse.urlparse(self.path)
        return {k: v[0] for k, v in urllib.parse.parse_qs(parsed.query).items()}

    def route_path(self) -> str:
        return urllib.parse.urlparse(self.path).path

    # ------------------------------------------------------------------ verbos
    def do_OPTIONS(self) -> None:  # noqa: N802
        self._send(204, b"", "text/plain")

    def do_GET(self) -> None:  # noqa: N802
        self._dispatch("GET")

    def do_POST(self) -> None:  # noqa: N802
        self._dispatch("POST")

    def do_DELETE(self) -> None:  # noqa: N802
        self._dispatch("DELETE")

    def do_HEAD(self) -> None:  # noqa: N802
        self._dispatch("GET")

    def _dispatch(self, method: str) -> None:
        path = self.route_path()
        try:
            if path.startswith("/api/"):
                self.handle_api(method, path)
            elif method == "GET":
                self.serve_static(path)
            else:
                raise ApiError(405, "Método no permitido")
        except ApiError as exc:
            self.json({"error": str(exc), "detail": exc.detail}, exc.status)
        except ConfigError as exc:
            self.json({"error": str(exc)}, 400)
        except llm.LLMError as exc:
            self.json({"error": str(exc), "status": exc.status, "detail": exc.detail}, 502)
        except BrokenPipeError:
            return
        except Exception as exc:  # noqa: BLE001 - se reporta el error real al cliente
            if os.environ.get("ELY_DEBUG"):
                import traceback

                traceback.print_exc()
            self.json({"error": f"{type(exc).__name__}: {exc}"}, 500)

    # ------------------------------------------------------------------ API
    def handle_api(self, method: str, path: str) -> None:
        engine = self.engine
        parts = [p for p in path.strip("/").split("/") if p]
        route = "/" + "/".join(parts[1:])

        if method == "GET" and route == "/health":
            return self.json({"ok": True, "version": __version__, "name": "Ely Cowork"})

        if method == "GET" and route == "/profiles":
            origin_map = load_keys_with_origin(engine.root)
            profiles = []
            for profile in load_profiles(engine.root):
                data = profile.public()
                data["key_origin"] = origin_map.get(profile.key_var, (None, "missing"))[1]
                data["is_test_key"] = is_test_key(profile.api_key)
                profiles.append(data)
            return self.json({
                "profiles": profiles,
                "default": profiles[0]["id"] if profiles else None,
                "dir": str(profiles_dir(engine.root).relative_to(engine.root)),
            })

        if method == "POST" and route == "/profiles/default":
            body = self.read_json()
            engine.set_default_profile(str(body.get("id") or ""))
            return self.json({"ok": True, "default": body.get("id")})

        if method == "POST" and route == "/profiles/key":
            body = self.read_json()
            profile_id = str(body.get("id") or "")
            key = str(body.get("api_key") or "")
            if not profile_id:
                raise ApiError(400, "Falta el id del perfil")
            path_env = engine.root / ".ely" / "keys.env"
            path_env.parent.mkdir(parents=True, exist_ok=True)
            try:
                info = resolve_key(profile_id, engine.root)
                var = info["key_var"]
            except ConfigError as exc:
                raise ApiError(404, str(exc)) from exc
            values = {}
            if path_env.is_file():
                for line in path_env.read_text().splitlines():
                    if "=" in line and not line.strip().startswith("#"):
                        k, _, v = line.partition("=")
                        values[k.strip()] = v.strip()
            if key:
                values[var] = key
            else:
                values.pop(var, None)
            path_env.write_text(
                "# Claves locales de Ely Cowork — NO subir a git\n"
                + "\n".join(f"{k}={v}" for k, v in sorted(values.items()))
                + "\n"
            )
            os.chmod(path_env, 0o600)
            return self.json({"ok": True, "id": profile_id, "has_key": bool(key)})

        if method == "GET" and route == "/profiles/resolve":
            q = self.query()
            try:
                return self.json(resolve_key(q.get("id", ""), engine.root))
            except ConfigError as exc:
                raise ApiError(404, str(exc)) from exc

        if method == "POST" and route == "/profiles/test":
            body = self.read_json()
            profile = engine.profile(body.get("id"))
            mode = str(body.get("mode") or "chat")
            result = llm.probe(profile, mode=mode)
            engine.log_call(
                profile, None, result.get("usage") or {}, "probe", ok=bool(result.get("ok")),
                error=result.get("detail") if not result.get("ok") else "",
                status=result.get("status"),
            )
            result["is_test_key"] = is_test_key(profile.api_key)
            result["key_origin"] = load_keys_with_origin(engine.root).get(profile.key_var, (None, "missing"))[1]
            return self.json(result)

        if method == "POST" and route == "/profiles/test-all":
            results = []
            for profile in load_profiles(engine.root):
                probe = llm.probe(profile, mode="auth")
                probe["is_test_key"] = is_test_key(profile.api_key)
                engine.log_call(profile, None, {}, "probe", ok=bool(probe.get("ok")),
                                error=probe.get("detail") if not probe.get("ok") else "",
                                status=probe.get("status"))
                results.append(probe)
            return self.json({"results": results})

        if method == "GET" and route == "/agents":
            tools_available = mcp.discover(engine.root)["status"] == "configured"
            return self.json({
                "agents": [agent.as_dict(tools_available) for agent in AGENTS],
                "default": "photon",
            })

        if method == "GET" and route == "/workflows":
            return self.json({"workflows": workflows()})

        if method == "POST" and route == "/workflows/run":
            body = self.read_json()
            flow = engine.run_workflow(
                str(body.get("id") or ""), str(body.get("input") or ""), body.get("profile")
            )
            return self.json(flow)

        if method == "GET" and route == "/tools":
            status = mcp.discover(engine.root)
            return self.json({
                "tools": tools(),
                "mcp": status,
                "available": status["status"] == "configured",
            })

        if method == "GET" and route == "/stats":
            return self.json(engine.stats())

        if method == "GET" and route == "/calls":
            return self.json({"calls": engine.calls(int(self.query().get("limit") or 200))})

        if method == "POST" and route == "/chat":
            body = self.read_json()
            prompt = str(body.get("prompt") or "").strip()
            if not prompt:
                raise ApiError(400, "El campo 'prompt' es obligatorio")
            history = body.get("history") if isinstance(body.get("history"), list) else []
            context = engine.build_context() if body.get("use_memory") else None
            return self.json(engine.ask(
                prompt,
                profile_id=body.get("profile"),
                agent_id=body.get("agent"),
                history=history,
                context=context,
                max_tokens=body.get("max_tokens"),
                temperature=body.get("temperature"),
            ))

        if method == "POST" and route == "/chat/stream":
            body = self.read_json()
            prompt = str(body.get("prompt") or "").strip()
            if not prompt:
                raise ApiError(400, "El campo 'prompt' es obligatorio")
            history = body.get("history") if isinstance(body.get("history"), list) else []
            context = engine.build_context() if body.get("use_memory") else None
            return self.sse(engine.stream(
                prompt,
                profile_id=body.get("profile"),
                agent_id=body.get("agent"),
                history=history,
                context=context,
            ))

        if method == "GET" and route == "/sessions":
            return self.json({"sessions": engine.sessions()})

        if method == "POST" and route == "/sessions":
            body = self.read_json()
            return self.json(engine.save_session(body))

        if method == "DELETE" and parts[:2] == ["api", "sessions"] and len(parts) == 3:
            return self.json({"ok": engine.delete_session(parts[2])})

        if method == "GET" and route == "/memory":
            return self.json({"memories": engine.memories()})

        if method == "POST" and route == "/memory":
            body = self.read_json()
            text = str(body.get("text") or "").strip()
            if not text:
                raise ApiError(400, "El campo 'text' es obligatorio")
            return self.json(engine.add_memory(text, str(body.get("tag") or "general")))

        if method == "DELETE" and parts[:2] == ["api", "memory"] and len(parts) == 3:
            return self.json({"ok": engine.delete_memory(parts[2])})

        if method == "GET" and route == "/mcp":
            return self.json(mcp.discover(engine.root))

        # ------------------------------------------------ workspace / activos
        if method == "GET" and route == "/workspace/tree":
            depth = int(self.query().get("depth") or 3)
            return self.json(workspace.tree(engine.root, max(1, min(depth, 6))))

        if method == "GET" and route == "/workspace/file":
            q = self.query()
            try:
                return self.json(workspace.read_file(engine.root, q.get("path", "")))
            except workspace.WorkspaceError as exc:
                raise ApiError(exc.status, str(exc)) from exc

        if method == "POST" and route == "/workspace/file":
            body = self.read_json()
            try:
                return self.json(workspace.write_file(
                    engine.root, str(body.get("path") or ""), str(body.get("content") or "")
                ))
            except workspace.WorkspaceError as exc:
                raise ApiError(exc.status, str(exc)) from exc

        if method == "GET" and route == "/assets":
            return self.json(workspace.assets(engine.root))

        # ------------------------------------------------ skills
        if method == "GET" and route == "/skills":
            return self.json({"skills": engine.skills()})

        if method == "POST" and route == "/skills":
            return self.json(engine.add_skill(self.read_json()))

        if method == "POST" and route == "/skills/run":
            body = self.read_json()
            prompt = str(body.get("prompt") or "").strip()
            if not prompt:
                raise ApiError(400, "El campo 'prompt' es obligatorio")
            return self.json(engine.use_skill(str(body.get("id") or ""), prompt, body.get("profile")))

        if method == "DELETE" and parts[:2] == ["api", "skills"] and len(parts) == 3:
            return self.json({"ok": engine.delete_skill(parts[2])})

        # ------------------------------------------------ jobs / pairing / costes
        if method == "GET" and route == "/jobs":
            return self.json({"jobs": engine.jobs(int(self.query().get("limit") or 100))})

        if method == "GET" and route == "/pairing":
            data = engine.pairing()
            return self.json({**data, "clients": data.get("clients", [])})

        if method == "POST" and route == "/pairing/rotate":
            return self.json(engine.rotate_pairing())

        if method == "GET" and route == "/costs":
            return self.json(engine.costs())

        if method == "GET" and route == "/routes":
            return self.json({"nav": routes.NAV})

        if method == "GET" and route == "/config":
            return self.json({
                "root": str(engine.root),
                "frontend": str(self.frontend),
                "python": sys.version.split()[0],
                "version": __version__,
                "agents": len(AGENTS),
                "profiles": [p.id for p in load_profiles(engine.root)],
                "state_dir": str(engine.state),
            })

        raise ApiError(404, f"Ruta de API desconocida: {path}")

    # ------------------------------------------------------------------ SSE
    def sse(self, events: Any) -> None:
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Cache-Control", "no-cache, no-transform")
        self.send_header("Connection", "keep-alive")
        self.send_header("X-Accel-Buffering", "no")
        self.send_header("Access-Control-Allow-Origin", self.origin_allow())
        self.end_headers()
        try:
            for event in events:
                chunk = f"data: {json.dumps(event, ensure_ascii=False, default=str)}\n\n".encode("utf-8")
                self.wfile.write(chunk)
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            return

    # ------------------------------------------------------------------ estáticos
    def serve_static(self, path: str) -> None:
        if path in ("/", ""):
            target = self.frontend / "index.html"
        else:
            rel = urllib.parse.unquote(path).lstrip("/")
            target = (self.frontend / rel).resolve()
            if not str(target).startswith(str(self.frontend.resolve())):
                raise ApiError(403, "Ruta fuera del frontend")
            if target.is_dir():
                target = target / "index.html"
        if not target.is_file():
            index = self.frontend / "index.html"
            if index.is_file() and "." not in Path(path).name:
                target = index
            else:
                raise ApiError(404, f"No encontrado: {path}")
        ctype = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        if ctype.startswith("text/") or ctype in ("application/javascript", "application/json"):
            ctype += "; charset=utf-8"
        self._send(200, target.read_bytes(), ctype)


def _local_ip() -> str:
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.connect(("8.8.8.8", 80))
        ip = sock.getsockname()[0]
        sock.close()
        return ip
    except OSError:
        return "127.0.0.1"


def serve(host: str = "0.0.0.0", port: int = 8765, root: Path | None = None) -> None:
    root = root or repo_root()
    frontend = root / "IDE" / "frontend"
    if not (frontend / "index.html").is_file():
        raise SystemExit(f"No se encontró el frontend en {frontend}")

    handler = type("Handler", (ElyHandler,), {"engine": Engine(root), "frontend": frontend})
    httpd = ThreadingHTTPServer((host, port), handler)
    httpd.daemon_threads = True
    shown = "localhost" if host in ("0.0.0.0", "::") else host
    print(f"◆ Ely Cowork {__version__} — IDE en http://{shown}:{port}")
    print(f"  frontend : {frontend}")
    print(f"  API      : http://{shown}:{port}/api/health")
    print(f"  perfiles : {profiles_dir(root)}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n· Servidor detenido")
    finally:
        httpd.server_close()
