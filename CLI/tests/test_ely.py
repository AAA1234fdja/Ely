#!/usr/bin/env python3
"""Pruebas del núcleo de Ely Cowork (sin dependencias externas).

    python3 -m unittest discover -s CLI/tests -v

No requieren internet: los endpoints se sustituyen por un servidor HTTP local
real que implementa Chat Completions y valida la cabecera Authorization.
"""
from __future__ import annotations

import json
import sys
import threading
import unittest
from dataclasses import replace
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "CLI"))

from ely_cli import llm  # noqa: E402
from ely_cli.config import (  # noqa: E402
    get_profile,
    is_test_key,
    load_keys,
    load_profiles,
    resolve_key,
)
from ely_cli import mcp, workspace  # noqa: E402
from ely_cli.agents import AGENTS, workflows  # noqa: E402
from ely_cli.engine import Engine  # noqa: E402

VALID_KEY = "APikeyexample-1"


class _Provider(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    seen_auth: list[str] = []

    def log_message(self, *args):  # silencio
        pass

    def do_POST(self):  # noqa: N802
        length = int(self.headers.get("Content-Length") or 0)
        body = json.loads(self.rfile.read(length) or b"{}")
        auth = self.headers.get("Authorization", "")
        _Provider.seen_auth.append(auth)
        if auth != "Bearer " + VALID_KEY:
            payload = json.dumps({"error": {"message": "invalid key", "code": "invalid_api_key"}}).encode()
            self.send_response(401)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            return
        if body.get("stream"):
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.end_headers()
            for word in ["ok", " desde", " el", " stream"]:
                chunk = {"choices": [{"delta": {"content": word}}]}
                self.wfile.write(b"data: " + json.dumps(chunk).encode() + b"\n\n")
            usage = {"choices": [], "usage": {"prompt_tokens": 5, "completion_tokens": 4, "total_tokens": 9}}
            self.wfile.write(b"data: " + json.dumps(usage).encode() + b"\n\ndata: [DONE]\n\n")
            return
        payload = json.dumps({
            "model": body.get("model", "x"),
            "choices": [{"message": {"role": "assistant", "content": "respuesta real"}}],
            "usage": {"prompt_tokens": 3, "completion_tokens": 2, "total_tokens": 5},
        }).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):  # noqa: N802
        payload = json.dumps({"data": [{"id": "ely-echo"}]}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)


class ProviderTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.httpd = ThreadingHTTPServer(("127.0.0.1", 0), _Provider)
        cls.port = cls.httpd.server_address[1]
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()

    def profile(self, key=VALID_KEY):
        base = get_profile("local", ROOT)
        return replace(
            base,
            base_url=f"http://127.0.0.1:{self.port}/v1",
            model="ely-echo",
            api_key=key,
            timeout=10,
        )

    def test_complete_uses_bearer_token(self):
        result = llm.complete(self.profile(), [{"role": "user", "content": "hola"}])
        self.assertEqual(result.text, "respuesta real")
        self.assertEqual(result.usage.total_tokens, 5)
        self.assertEqual(_Provider.seen_auth[-1], "Bearer " + VALID_KEY)

    def test_invalid_key_raises_401(self):
        with self.assertRaises(llm.LLMError) as ctx:
            llm.complete(self.profile(key="otra-clave"), [{"role": "user", "content": "x"}])
        self.assertEqual(ctx.exception.status, 401)

    def test_stream_yields_deltas_and_usage(self):
        events = list(llm.stream(self.profile(), [{"role": "user", "content": "x"}]))
        text = "".join(e["text"] for e in events if e["type"] == "delta")
        self.assertEqual(text, "ok desde el stream")
        usage = next(e for e in events if e["type"] == "usage")["usage"]
        self.assertEqual(usage["total_tokens"], 9)
        self.assertEqual(events[-1]["type"], "done")

    def test_probe_ok_and_rejected(self):
        ok = llm.probe(self.profile())
        self.assertTrue(ok["ok"])
        self.assertEqual(ok["status"], 200)
        bad = llm.probe(self.profile(key="mala"))
        self.assertFalse(bad["ok"])
        self.assertTrue(bad["reachable"])
        self.assertFalse(bad["credential_valid"])

    def test_probe_unreachable_reports_no_http(self):
        profile = replace(self.profile(), base_url="http://127.0.0.1:9/v1", timeout=2)
        result = llm.probe(profile)
        self.assertFalse(result["ok"])
        self.assertFalse(result["reachable"])

    def test_engine_ask_and_telemetry(self):
        engine = Engine(ROOT)
        engine.root = ROOT
        profile = self.profile()
        result = llm.complete(profile, [{"role": "user", "content": "y"}])
        call_id = engine.log_call(profile, None, result.usage.as_dict(), "test", ok=True, prompt="y")
        calls = engine.calls(5)
        self.assertTrue(any(c["id"] == call_id for c in calls))
        self.assertIn("total_calls", engine.stats())


class ConfigTest(unittest.TestCase):
    def test_eleven_profiles_with_keys(self):
        profiles = load_profiles(ROOT)
        self.assertEqual(len(profiles), 11)
        ids = {p.id for p in profiles}
        self.assertIn("openai", ids)
        self.assertIn("local", ids)
        self.assertTrue(all(p.key_var for p in profiles))

    def test_test_keys_are_numbered(self):
        keys = load_keys(ROOT)
        numbered = sorted(
            int(value.split("-")[1]) for value in keys.values()
            if is_test_key(value)
        )
        self.assertEqual(numbered, list(range(1, 12)))

    def test_resolve_key_hides_value(self):
        info = resolve_key("groq", ROOT)
        self.assertNotIn("api_key", info)
        self.assertTrue(info["has_key"])
        self.assertTrue(info["masked_key"].startswith("APikey"))
        self.assertEqual(info["endpoint"], "https://api.groq.com/openai/v1/chat/completions")

    def test_placeholder_urls_resolve_from_env(self):
        import os

        os.environ["ELY_LOCAL_BASE_URL"] = "http://127.0.0.1:8799/v1"
        try:
            profile = get_profile("local", ROOT)
            self.assertEqual(profile.base_url, "http://127.0.0.1:8799/v1")
        finally:
            os.environ.pop("ELY_LOCAL_BASE_URL", None)


class AgentsTest(unittest.TestCase):
    def test_agents_have_real_prompts(self):
        self.assertEqual(len(AGENTS), 8)
        for agent in AGENTS:
            self.assertGreater(len(agent.system), 80, agent.id)
            self.assertTrue(0 <= agent.temperature <= 1)

    def test_workflows_reference_known_agents(self):
        ids = {a.id for a in AGENTS}
        for flow in workflows():
            for agent_id in flow["agents"]:
                self.assertIn(agent_id, ids)
            for agent_id, template in flow["chain"]:
                self.assertIn(agent_id, ids)
                self.assertIn("{", template)


class BackendDiscoveryTest(unittest.TestCase):
    def test_mcp_status_is_truthful(self):
        status = mcp.discover(ROOT)
        self.assertIn(status["status"], {"not-configured", "configured", "declared-empty"})
        if not status["servers"]:
            self.assertNotEqual(status["status"], "configured")

    def test_workspace_blocks_traversal(self):
        with self.assertRaises(workspace.WorkspaceError):
            workspace.read_file(ROOT, "../../etc/passwd")

    def test_workspace_reads_readme(self):
        doc = workspace.read_file(ROOT, "README.md")
        self.assertIn("Ely", doc["content"])
        self.assertEqual(doc["encoding"], "utf-8")


if __name__ == "__main__":
    unittest.main(verbosity=2)
