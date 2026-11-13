import json
import sys
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "CLI"))

from ely_cli import mcp, mcp_client


FAKE_SERVER = r'''
import json, sys
for line in sys.stdin:
    request = json.loads(line)
    method = request.get("method")
    if "id" not in request:
        continue
    if method == "initialize":
        result = {"protocolVersion": "2025-03-26", "capabilities": {"tools": {}},
                  "serverInfo": {"name": "test", "version": "1"}}
    elif method == "tools/list":
        result = {"tools": [{"name": "echo_text", "description": "Echo input text",
            "inputSchema": {"type": "object", "properties": {"text": {"type": "string"}},
                            "required": ["text"], "additionalProperties": False}}]}
    elif method == "tools/call":
        result = {"content": [{"type": "text", "text": "echo:" + request["params"]["arguments"]["text"]}]}
    else:
        result = {}
    print(json.dumps({"jsonrpc": "2.0", "id": request["id"], "result": result}), flush=True)
'''


class MCPClientTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="ely-mcp-test-"))
        (self.tmp / "MCPs").mkdir()
        (self.tmp / "MCPs" / "mcp.json").write_text(json.dumps({
            "mcpServers": {
                "unit-test": {"transport": "stdio", "command": sys.executable,
                               "args": ["-u", "-c", FAKE_SERVER], "enabled": True}
            }
        }), encoding="utf-8")
        self.client = mcp_client.MCPClient()

    def tearDown(self):
        self.client.close()
        import shutil
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_stdio_jsonrpc_catalog_and_tool_call(self):
        tools = self.client.tools_for(self.tmp)
        self.assertEqual(len(tools), 1)
        name = tools[0]["name"]
        self.assertTrue(name.startswith("mcp__unit-test_"))
        result = self.client.call_tool(self.tmp, name, {"text": "hello"})
        self.assertTrue(result["ok"])
        self.assertEqual(result["content"], "echo:hello")
        self.assertEqual(result["server"], "unit-test")

    def test_streamable_http_jsonrpc_initialize_catalog_and_call(self):
        seen = []

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *_args):
                pass

            def do_POST(self):
                body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", "0"))))
                method = body["method"]
                seen.append((method, self.headers.get("Mcp-Session-Id")))
                if method == "initialize":
                    response = {"jsonrpc": "2.0", "id": body["id"], "result": {
                        "protocolVersion": "2025-03-26", "capabilities": {"tools": {}},
                        "serverInfo": {"name": "http-test", "version": "1"}
                    }}
                    payload = json.dumps(response).encode()
                    self.send_response(200)
                    self.send_header("Content-Type", "application/json")
                    self.send_header("Mcp-Session-Id", "session-test")
                    self.send_header("Content-Length", str(len(payload)))
                    self.end_headers()
                    self.wfile.write(payload)
                elif method.startswith("notifications/"):
                    self.send_response(202)
                    self.send_header("Content-Length", "0")
                    self.end_headers()
                else:
                    if method == "tools/list":
                        result = {"tools": [{"name": "ping", "inputSchema": {"type": "object", "properties": {}}}]}
                    else:
                        result = {"content": [{"type": "text", "text": "pong"}]}
                    payload = json.dumps({"jsonrpc": "2.0", "id": body["id"], "result": result}).encode()
                    self.send_response(200)
                    self.send_header("Content-Type", "application/json")
                    self.send_header("Content-Length", str(len(payload)))
                    self.end_headers()
                    self.wfile.write(payload)

        server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            (self.tmp / "MCPs" / "mcp.json").write_text(json.dumps({
                "mcpServers": {"http-test": {"transport": "http", "url": f"http://127.0.0.1:{server.server_port}/mcp"}}
            }), encoding="utf-8")
            tools = self.client.tools_for(self.tmp)
            self.assertEqual(len(tools), 1)
            result = self.client.call_tool(self.tmp, tools[0]["name"], {})
            self.assertEqual(result["content"], "pong")
            self.assertIn(("initialize", None), seen)
            self.assertTrue(any(method == "tools/call" and session == "session-test" for method, session in seen))
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)

    def test_mcp_tools_are_added_to_chat_agent_and_dispatched(self):
        from ely_cli.agents import get_agent
        from ely_cli.engine import Engine
        from ely_cli import agent_tools

        with patch("ely_cli.mcp_client._CLIENT", self.client):
            schemas = Engine(self.tmp)._tool_specs(get_agent("photon"))
            remote = next(item["function"] for item in schemas
                          if item["function"]["name"].startswith("mcp__"))
            result = agent_tools.execute(self.tmp, remote["name"], {"text": "from-chat"})
        self.assertTrue(result["ok"])
        self.assertEqual(result["content"], "echo:from-chat")

    def test_server_status_does_not_start_server(self):
        status = self.client.status(self.tmp)
        self.assertEqual(status["configured_servers"], 1)
        self.assertEqual(status["active_processes"], 0)

    def test_manifest_redaction_hides_command_args_and_url_query_secrets(self):
        self.assertEqual(mcp._redact("/usr/local/bin/server --token do-not-show"), "server")
        redacted = mcp._redact("https://user:pass@example.invalid/mcp?api_key=secret&mode=tools")
        self.assertNotIn("user", redacted)
        self.assertNotIn("pass", redacted)
        self.assertNotIn("secret", redacted)
        self.assertIn("mode=tools", redacted)

    def test_missing_manifest_env_does_not_connect_or_expose_placeholders(self):
        (self.tmp / "MCPs" / "mcp.json").write_text(json.dumps({
            "mcpServers": {"remote": {
                "httpUrl": "https://mcp.example.invalid/",
                "headers": {"Authorization": "Bearer $ELY_TEST_MISSING_MCP_TOKEN"}
            }}
        }), encoding="utf-8")
        status = self.client.status(self.tmp)
        self.assertEqual(status["blocked_servers"], [{
            "id": "remote", "missing_env": ["ELY_TEST_MISSING_MCP_TOKEN"]
        }])
        self.assertEqual(self.client.tools_for(self.tmp), [])
        self.assertEqual(self.client._http_sessions, {})

    def test_public_tool_names_are_bounded_and_unique(self):
        a = mcp_client._rpc_name("very long/non unique server", "tool/a")
        b = mcp_client._rpc_name("very long/non unique server", "tool.a")
        self.assertLessEqual(len(a), 64)
        self.assertNotEqual(a, b)


if __name__ == "__main__":
    unittest.main()
