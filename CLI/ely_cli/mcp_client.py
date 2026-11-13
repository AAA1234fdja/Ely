"""Small MCP JSON-RPC client for explicitly configured Ely MCP servers.

Supports stdio and Streamable HTTP. Servers are only launched from manifests
under MCPs/ and only when a chat asks for tools; nothing is auto-installed.
"""
from __future__ import annotations

import atexit
import hashlib
import json
import os
import queue
import re
import subprocess
import threading
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from . import mcp, mcp_signatures

PROTOCOL_VERSION = "2025-03-26"
MAX_TOOL_RESULT = 14_000
MAX_TOOLS_PER_SERVER = 80
MAX_MCP_SERVERS = 8
MAX_MCP_TOOLS_TOTAL = 120
MAX_PAGES = 5
RPC_TIMEOUT = 12.0


def _manifest_servers(root: Path) -> list[tuple[Path, str, dict[str, Any]]]:
    found: dict[tuple[str, str], tuple[Path, str, dict[str, Any]]] = {}
    base = root / "MCPs"
    if not base.is_dir():
        return []
    for path in mcp._manifest_paths(root):
        if path.suffix.lower() != ".json":
            continue
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if not isinstance(data, dict):
            continue
        signature_status = mcp_signatures.verify_manifest(root, data)
        if not signature_status["valid"]:
            continue
        block = next((data[k] for k in mcp.ROOT_KEYS if isinstance(data.get(k), dict)), None)
        if block is None and isinstance(data.get("command"), str):
            block = {data.get("id") or path.stem: data}
        for name, raw_cfg in (block or {}).items():
            if not isinstance(raw_cfg, dict) or not raw_cfg.get("enabled", True):
                continue
            cfg = dict(raw_cfg)
            cfg["_ely_signature_verified"] = True
            cfg["_ely_signature_status"] = signature_status["status"]
            # Third-party manifests use both MCP standard keys and editor-specific aliases.
            if not cfg.get("url") and isinstance(cfg.get("httpUrl"), str):
                cfg["url"] = cfg["httpUrl"]
            if not cfg.get("transport") and isinstance(cfg.get("type"), str):
                cfg["transport"] = cfg["type"]
            if not cfg.get("transport") and cfg.get("url"):
                cfg["transport"] = "http"
            identity = (str(name), str(cfg.get("url") or cfg.get("command") or "stdio"))
            candidate = (path, str(name), cfg)
            previous = found.get(identity)
            if previous is None or len(cfg.get("headers", {})) > len(previous[2].get("headers", {})):
                found[identity] = candidate
    return list(found.values())


def _missing_env(cfg: dict[str, Any]) -> list[str]:
    pattern = re.compile(r"\$\{?([A-Za-z_][A-Za-z0-9_]*)\}?")
    missing: set[str] = set()
    for section in ("headers", "env"):
        values = cfg.get(section, {})
        if not isinstance(values, dict):
            continue
        for value in values.values():
            if isinstance(value, str):
                for name in pattern.findall(value):
                    if name not in os.environ:
                        missing.add(name)
    return sorted(missing)


def _rpc_name(server_id: str, tool_name: str) -> str:
    safe_server = re.sub(r"[^A-Za-z0-9_-]", "_", server_id)[:12] or "server"
    safe_tool = re.sub(r"[^A-Za-z0-9_-]", "_", tool_name)[:26] or "tool"
    server_hash = hashlib.sha256(server_id.encode("utf-8")).hexdigest()[:6]
    tool_hash = hashlib.sha256(tool_name.encode("utf-8")).hexdigest()[:6]
    return f"mcp__{safe_server}_{server_hash}__{safe_tool}_{tool_hash}"


def _decode_sse(text: str) -> Any:
    for line in text.splitlines():
        if line.startswith("data:"):
            try:
                return json.loads(line[5:].strip())
            except json.JSONDecodeError:
                continue
    return json.loads(text)


@dataclass
class _StdioServer:
    process: subprocess.Popen
    responses: queue.Queue = field(default_factory=queue.Queue)
    lock: threading.Lock = field(default_factory=threading.Lock)
    request_id: int = 0
    initialized: bool = False

    def __post_init__(self):
        threading.Thread(target=self._read_stdout, daemon=True, name="ely-mcp-stdout").start()
        threading.Thread(target=self._drain_stderr, daemon=True, name="ely-mcp-stderr").start()

    def _read_stdout(self):
        try:
            assert self.process.stdout is not None
            for line in self.process.stdout:
                if len(line) > 1_000_000:
                    continue
                text = line.decode("utf-8", "replace").strip()
                if not text:
                    continue
                try:
                    self.responses.put(json.loads(text))
                except json.JSONDecodeError:
                    # MCP servers must reserve stdout for protocol frames.
                    continue
        finally:
            self.responses.put({"_eof": True})

    def _drain_stderr(self):
        try:
            assert self.process.stderr is not None
            for _ in self.process.stderr:
                pass
        except OSError:
            pass

    def rpc(self, method: str, params: dict[str, Any] | None = None) -> Any:
        with self.lock:
            if self.process.poll() is not None:
                raise RuntimeError(f"MCP stdio server terminó con código {self.process.returncode}")
            self.request_id += 1
            request_id = self.request_id
            payload = {"jsonrpc": "2.0", "id": request_id, "method": method, "params": params or {}}
            assert self.process.stdin is not None
            self.process.stdin.write((json.dumps(payload, ensure_ascii=False) + "\n").encode("utf-8"))
            self.process.stdin.flush()
            while True:
                try:
                    response = self.responses.get(timeout=RPC_TIMEOUT)
                except queue.Empty as exc:
                    self.close()
                    raise TimeoutError(f"MCP {method} agotó {RPC_TIMEOUT:g}s") from exc
                if response.get("_eof"):
                    raise RuntimeError("MCP stdio server cerró stdout")
                if response.get("id") != request_id:
                    continue
                if response.get("error"):
                    error = response["error"]
                    raise RuntimeError(f"MCP {method}: {str(error.get('message') or error)[:300]}")
                return response.get("result")

    def notify(self, method: str, params: dict[str, Any] | None = None):
        with self.lock:
            if self.process.poll() is not None:
                raise RuntimeError("MCP stdio server ya terminó")
            assert self.process.stdin is not None
            payload = {"jsonrpc": "2.0", "method": method, "params": params or {}}
            self.process.stdin.write((json.dumps(payload, ensure_ascii=False) + "\n").encode("utf-8"))
            self.process.stdin.flush()

    def close(self):
        if self.process.poll() is None:
            self.process.terminate()
            try:
                self.process.wait(timeout=2)
            except subprocess.TimeoutExpired:
                self.process.kill()
                try:
                    self.process.wait(timeout=1)
                except subprocess.TimeoutExpired:
                    pass
        for stream in (self.process.stdin, self.process.stdout, self.process.stderr):
            if stream is not None:
                try:
                    stream.close()
                except OSError:
                    pass


class MCPClient:
    def __init__(self):
        self._lock = threading.RLock()
        self._stdio: dict[tuple[str, str], _StdioServer] = {}
        self._http_sessions: dict[tuple[str, str], tuple[str, dict[str, str]]] = {}
        self._http_ids: dict[tuple[str, str], int] = {}
        self._catalog: dict[tuple[str, str], dict[str, Any]] = {}
        atexit.register(self.close)

    def close(self):
        for proc in list(self._stdio.values()):
            proc.close()
        self._stdio.clear()

    def _key(self, root: Path, path: Path, server_id: str) -> tuple[str, str]:
        return (str(root.resolve()), f"{path.resolve()}::{server_id}")

    def _start_stdio(self, root: Path, key: tuple[str, str], cfg: dict[str, Any]) -> _StdioServer:
        existing = self._stdio.get(key)
        if existing and existing.process.poll() is None:
            return existing
        command = cfg.get("command")
        args = cfg.get("args", [])
        if not isinstance(command, str) or not command.strip() or not isinstance(args, list):
            raise ValueError("MCP stdio requiere command y args[]")
        if len(args) > 64 or any(not isinstance(arg, str) or len(arg) > 2_000 for arg in args):
            raise ValueError("MCP args inválidos o demasiado largos")
        env = {
            "PATH": os.environ.get("PATH", "/usr/local/bin:/usr/bin:/bin"),
            "HOME": os.environ.get("HOME", str(root.resolve())),
            "LANG": os.environ.get("LANG", "C.UTF-8"),
        }
        if os.name == "nt" and os.environ.get("SYSTEMROOT"):
            env["SYSTEMROOT"] = os.environ["SYSTEMROOT"]
        provided_env = cfg.get("env", {})
        if isinstance(provided_env, dict):
            for name, value in provided_env.items():
                if isinstance(name, str) and re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", name):
                    if isinstance(value, str):
                        env[name] = os.path.expandvars(value)
        proc = subprocess.Popen(
            [command, *args],
            cwd=str(root.resolve()),
            env=env,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            bufsize=0,
        )
        server = _StdioServer(proc)
        self._stdio[key] = server
        try:
            server.rpc("initialize", {
                "protocolVersion": PROTOCOL_VERSION,
                "capabilities": {},
                "clientInfo": {"name": "Ely", "version": "0.1"},
            })
            server.notify("notifications/initialized")
            server.initialized = True
        except Exception:
            server.close()
            self._stdio.pop(key, None)
            raise
        return server

    def _http_headers(self, cfg: dict[str, Any], session: str = "") -> dict[str, str]:
        headers = {"Content-Type": "application/json", "Accept": "application/json, text/event-stream",
                   "MCP-Protocol-Version": PROTOCOL_VERSION}
        configured = cfg.get("headers", {})
        if isinstance(configured, dict):
            for name, value in configured.items():
                if isinstance(name, str) and isinstance(value, str) and "\n" not in name + value:
                    headers[name] = os.path.expandvars(value)
        if session:
            headers["Mcp-Session-Id"] = session
        return headers

    def _http_rpc(self, key: tuple[str, str], cfg: dict[str, Any], method: str,
                  params: dict[str, Any] | None = None) -> Any:
        url = cfg.get("url")
        if not isinstance(url, str) or not url.startswith(("http://", "https://")):
            raise ValueError("MCP HTTP requiere una URL http(s)")
        session, _ = self._http_sessions.get(key, ("", {}))
        notification = method.startswith("notifications/")
        request_id = None
        if not notification:
            request_id = self._http_ids.get(key, 0) + 1
            self._http_ids[key] = request_id
        payload = {"jsonrpc": "2.0", "method": method, "params": params or {}}
        if request_id is not None:
            payload["id"] = request_id
        request = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"),
                                         headers=self._http_headers(cfg, session), method="POST")
        try:
            with urllib.request.urlopen(request, timeout=RPC_TIMEOUT) as response:
                raw = response.read(1_000_000).decode("utf-8", "replace")
                new_session = response.headers.get("Mcp-Session-Id", session)
                ctype = response.headers.get("Content-Type", "")
        except urllib.error.HTTPError as exc:
            detail = exc.read(800).decode("utf-8", "replace")
            raise RuntimeError(f"MCP HTTP {exc.code}: {detail}") from exc
        if "text/event-stream" in ctype:
            response_data = _decode_sse(raw)
        else:
            response_data = json.loads(raw) if raw.strip() else {}
        if method == "initialize":
            self._http_sessions[key] = (new_session, cfg)
        if isinstance(response_data, list):
            response_data = next((item for item in response_data if request_id is not None and item.get("id") == request_id), {})
        if not isinstance(response_data, dict):
            return None
        if response_data.get("error"):
            error = response_data["error"]
            raise RuntimeError(f"MCP {method}: {str(error.get('message') or error)[:300]}")
        if not response_data:
            return None
        return response_data.get("result")

    def _rpc(self, root: Path, path: Path, server_id: str, cfg: dict[str, Any],
             method: str, params: dict[str, Any] | None = None) -> Any:
        key = self._key(root, path, server_id)
        transport = str(cfg.get("transport") or ("http" if cfg.get("url") else "stdio")).lower()
        if transport in {"http", "streamable-http", "sse"}:
            if transport == "sse":
                raise ValueError("MCP SSE antiguo no está soportado; configura transporte Streamable HTTP")
            with self._lock:
                if key not in self._http_sessions:
                    self._http_rpc(key, cfg, "initialize", {
                        "protocolVersion": PROTOCOL_VERSION,
                        "capabilities": {},
                        "clientInfo": {"name": "Ely", "version": "0.1"},
                    })
                    self._http_rpc(key, cfg, "notifications/initialized", {})
                return self._http_rpc(key, cfg, method, params)
        with self._lock:
            server = self._start_stdio(root, key, cfg)
        return server.rpc(method, params)

    def _load_tools(self, root: Path, path: Path, server_id: str, cfg: dict[str, Any]) -> list[dict[str, Any]]:
        key = self._key(root, path, server_id)
        if key in self._catalog:
            return self._catalog[key]["tools"]
        tools: list[dict[str, Any]] = []
        cursor = None
        for _ in range(MAX_PAGES):
            params = {"cursor": cursor} if cursor else {}
            data = self._rpc(root, path, server_id, cfg, "tools/list", params) or {}
            page = data.get("tools", []) if isinstance(data, dict) else []
            for tool in page:
                if not isinstance(tool, dict) or not isinstance(tool.get("name"), str):
                    continue
                schema = tool.get("inputSchema")
                if not isinstance(schema, dict) or schema.get("type") != "object":
                    schema = {"type": "object", "properties": {}, "additionalProperties": False}
                try:
                    if len(json.dumps(schema, ensure_ascii=False)) > 10_000:
                        schema = {"type": "object", "properties": {}, "additionalProperties": False}
                    properties = schema.get("properties", {})
                    if not isinstance(properties, dict) or len(properties) > 40:
                        schema = {"type": "object", "properties": {}, "additionalProperties": False}
                except (TypeError, ValueError):
                    schema = {"type": "object", "properties": {}, "additionalProperties": False}
                tools.append({
                    "remote_name": tool["name"],
                    "name": _rpc_name(server_id, tool["name"]),
                    "description": str(tool.get("description") or f"MCP tool {tool['name']}")[:500],
                    "parameters": schema,
                })
                if len(tools) >= MAX_TOOLS_PER_SERVER:
                    break
            cursor = data.get("nextCursor") if isinstance(data, dict) else None
            if not cursor or len(tools) >= MAX_TOOLS_PER_SERVER:
                break
        self._catalog[key] = {"server_id": server_id, "path": path, "cfg": cfg, "tools": tools}
        return tools

    def tools_for(self, root: Path) -> list[dict[str, Any]]:
        with self._lock:
            return self._tools_for_locked(root)

    def _tools_for_locked(self, root: Path) -> list[dict[str, Any]]:
        output = []
        for path, server_id, cfg in _manifest_servers(root)[:MAX_MCP_SERVERS]:
            if _missing_env(cfg):
                continue
            try:
                available = self._load_tools(root, path, server_id, cfg)
                output.extend(available[:max(0, MAX_MCP_TOOLS_TOTAL - len(output))])
                if len(output) >= MAX_MCP_TOOLS_TOTAL:
                    break
            except Exception:
                # A misconfigured optional server must not take chat down.
                continue
        return output

    def call_tool(self, root: Path, public_name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            return self._call_tool_locked(root, public_name, arguments)

    def _call_tool_locked(self, root: Path, public_name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        for path, server_id, cfg in _manifest_servers(root)[:MAX_MCP_SERVERS]:
            if _missing_env(cfg):
                continue
            try:
                tools = self._load_tools(root, path, server_id, cfg)
            except Exception:
                continue
            match = next((tool for tool in tools if tool["name"] == public_name), None)
            if not match:
                continue
            result = self._rpc(root, path, server_id, cfg, "tools/call", {
                "name": match["remote_name"], "arguments": arguments,
            }) or {}
            if not isinstance(result, dict):
                result = {"result": result}
            if result.get("isError"):
                return {"ok": False, "error": str(result.get("content", "MCP tool failed"))[:1000]}
            content = result.get("content", [])
            text_parts = [str(item.get("text", "")) for item in content
                          if isinstance(item, dict) and item.get("type") == "text"]
            structured = result.get("structuredContent")
            try:
                if len(json.dumps(structured, ensure_ascii=False)) > MAX_TOOL_RESULT:
                    structured = {"truncated": True, "preview": json.dumps(structured, ensure_ascii=False)[:MAX_TOOL_RESULT]}
            except (TypeError, ValueError):
                structured = None
            return {
                "ok": True,
                "server": server_id,
                "tool": match["remote_name"],
                "content": "\n".join(text_parts)[:MAX_TOOL_RESULT],
                "structuredContent": structured,
            }
        return {"ok": False, "error": f"No existe herramienta MCP configurada: {public_name}"}

    def status(self, root: Path) -> dict[str, Any]:
        discovery = mcp.discover(root)
        servers = _manifest_servers(root)
        blocked = [{"id": server_id, "missing_env": _missing_env(cfg)}
                   for _path, server_id, cfg in servers if _missing_env(cfg)]
        active = sum(1 for key, proc in self._stdio.items()
                     if key[0] == str(root.resolve()) and proc.process.poll() is None)
        return {
            **discovery,
            "client": "JSON-RPC (stdio / Streamable HTTP)",
            "configured_servers": len(servers),
            "blocked_servers": blocked,
            "catalogued_tools": sum(len(item.get("tools", [])) for key, item in self._catalog.items()
                                    if key[0] == str(root.resolve())),
            "active_processes": active,
        }


_CLIENT = MCPClient()


def tools_for(root: Path) -> list[dict[str, Any]]:
    return _CLIENT.tools_for(root)


def call_tool(root: Path, name: str, arguments: dict[str, Any]) -> dict[str, Any]:
    return _CLIENT.call_tool(root, name, arguments)


def status(root: Path) -> dict[str, Any]:
    return _CLIENT.status(root)
