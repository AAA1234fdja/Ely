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


class FrontendContractTest(unittest.TestCase):
    """Regresiones del contrato frontend ↔ backend (vistas de IDE/frontend)."""

    def test_public_profile_includes_endpoint(self):
        # chat.js muestra profile.endpoint en el estado vacío del chat.
        data = get_profile("groq", ROOT).public()
        self.assertEqual(data["endpoint"], "https://api.groq.com/openai/v1/chat/completions")
        self.assertNotIn("api_key", data)

    def test_request_context_merges_client_and_memory(self):
        # ide.js envía el archivo abierto como `context`; el servidor debe
        # inyectarlo junto con la memoria, no descartarlo.
        engine = Engine(ROOT)
        only_client = engine.request_context("Archivo demo.py:\nprint('hola')", use_memory=False)
        self.assertIn("demo.py", only_client)
        self.assertIsNone(engine.request_context(None, use_memory=False))
        self.assertIsNone(engine.request_context("   ", use_memory=False))
        messages = engine.build_messages("revisa", context=only_client)
        self.assertTrue(any(m["role"] == "system" and "demo.py" in m["content"] for m in messages))

    def test_workspace_tree_reaches_frontend_js(self):
        # ide.js pide depth=5; el árbol debe llegar a IDE/frontend/js/views.
        data = workspace.tree(ROOT, depth=5)
        paths = {e["path"] for e in data["entries"]}
        self.assertIn("IDE/frontend/js/app.js", paths)
        self.assertIn("IDE/frontend/js/views/ide.js", paths)
        self.assertFalse(data["truncated"])

    def test_types_core_and_mcp_router(self):
        # MCPs/mcp_router.py importa types_core desde la raíz del repo.
        import importlib.util

        spec = importlib.util.spec_from_file_location("ely_mcp_router", ROOT / "MCPs" / "mcp_router.py")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        summary = module.mcp_router.get_capabilities_summary()
        self.assertIn("harnesses", summary)
        self.assertIn("mcp_servers", summary)
        from types_core import HarnessType, TaskStep

        step = TaskStep(title="Buscar en el repositorio", objective="git código", required_mcps=["github"])
        self.assertIsInstance(module.mcp_router.route_harness_for_task("terminal"), HarnessType)
        self.assertIsInstance(module.mcp_router.select_tools_for_step(step), list)


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


class LocalStorageTest(unittest.TestCase):
    """Local Storage por perfil: aislamiento, generado/planeado y migración.

    Usa un root temporal con dos perfiles (alpha, beta) para no tocar los datos
    reales del repo.
    """

    def setUp(self):
        import tempfile
        self.tmp = Path(tempfile.mkdtemp(prefix="ely-storage-"))
        (self.tmp / "profiles").mkdir()
        for pid in ("alpha", "beta"):
            (self.tmp / "profiles" / f"{pid}.json").write_text(json.dumps({
                "id": pid, "label": pid.title(), "provider": "openai",
                "model": "gpt-4o-mini", "base_url": "http://localhost/v1",
                "key_var": f"{pid.upper()}_API_KEY",
            }), encoding="utf-8")
        self.engine = Engine(self.tmp)

    def tearDown(self):
        import shutil
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_folders_created_per_profile(self):
        from ely_cli.storage import STORAGE_DIR, GENERATED, PLANNED
        self.engine.sessions("alpha")
        base = self.tmp / STORAGE_DIR / "alpha"
        self.assertTrue((base / GENERATED).is_dir())
        self.assertTrue((base / PLANNED).is_dir())

    def test_sessions_isolated_per_profile(self):
        self.engine.save_session({"id": "s1", "title": "Hola A", "messages": [{"role": "user", "content": "a"}]}, "alpha")
        self.engine.save_session({"id": "s2", "title": "Hola B", "messages": [{"role": "user", "content": "b"}]}, "beta")
        a = [s["id"] for s in self.engine.sessions("alpha")]
        b = [s["id"] for s in self.engine.sessions("beta")]
        self.assertEqual(a, ["s1"])
        self.assertEqual(b, ["s2"])
        self.assertNotIn("s2", a)  # lo de B no aparece en A

    def test_save_session_uses_session_profile(self):
        self.engine.save_session({"id": "s3", "profile": "beta", "title": "x", "messages": []})
        self.assertEqual([s["id"] for s in self.engine.sessions("beta")], ["s3"])
        self.assertEqual(self.engine.sessions("alpha"), [])

    def test_delete_session_per_profile(self):
        self.engine.save_session({"id": "s1", "messages": []}, "alpha")
        self.assertTrue(self.engine.delete_session("s1", "alpha"))
        self.assertEqual(self.engine.sessions("alpha"), [])
        self.assertFalse(self.engine.delete_session("nope", "alpha"))

    def test_planned_crud_and_isolation(self):
        item = self.engine.add_planned("Comprar GPU", "para entrenar", "alpha")
        self.assertEqual(item["title"], "Comprar GPU")
        self.assertEqual(len(self.engine.planned_items("alpha")), 1)
        self.assertEqual(self.engine.planned_items("beta"), [])
        self.assertTrue(self.engine.delete_planned(item["id"], "alpha"))
        self.assertEqual(self.engine.planned_items("alpha"), [])

    def test_planned_requires_title(self):
        from ely_cli.config import ConfigError
        with self.assertRaises(ConfigError):
            self.engine.add_planned("   ", "", "alpha")

    def test_overview_structure(self):
        self.engine.save_session({"id": "s1", "messages": []}, "alpha")
        self.engine.add_planned("Plan", "", "alpha")
        ov = self.engine.storage_overview("alpha")
        self.assertEqual(ov["profile"], "alpha")
        self.assertTrue(ov["path"].startswith("Local Storage"))
        self.assertEqual(len(ov["generated"]["sessions"]), 1)
        self.assertEqual(len(ov["planned"]["items"]), 1)
        self.assertIsInstance(ov["generated"]["files"], list)
        self.assertIsInstance(ov["planned"]["files"], list)

    def test_unknown_profile_rejected(self):
        from ely_cli.config import ConfigError
        with self.assertRaises(ConfigError):
            self.engine.sessions("no-existe")

    def test_path_traversal_sanitized(self):
        from ely_cli.storage import safe_profile_id
        from ely_cli.config import ConfigError
        self.assertEqual(safe_profile_id("a/b"), "a_b")
        self.assertEqual(safe_profile_id("../etc"), "___etc")
        self.assertEqual(safe_profile_id("openai"), "openai")
        with self.assertRaises(ConfigError):
            safe_profile_id("   ")

    def test_legacy_migration_to_default_only(self):
        self.engine.set_default_profile("alpha")
        legacy = self.tmp / ".ely" / "sessions.json"
        legacy.parent.mkdir(parents=True, exist_ok=True)
        legacy.write_text(json.dumps([{"id": "old", "messages": []}]), encoding="utf-8")
        self.assertEqual([s["id"] for s in self.engine.sessions("alpha")], ["old"])
        self.assertEqual(self.engine.sessions("beta"), [])  # beta no adopta lo legado

    def test_nav_includes_storage(self):
        from ely_cli import routes
        self.assertIn("storage", [item["id"] for item in routes.flat()])

    def test_samples_created_and_pdf_valid(self):
        created = self.engine.storage_samples("alpha")
        self.assertIn("ejemplo.pdf", created)
        self.assertIn("ejemplo.tex", created)
        self.assertIn("ejemplo.html", created)
        pdf = (self.tmp / "Local Storage" / "alpha" / "generado" / "ejemplo.pdf").read_bytes()
        self.assertTrue(pdf.startswith(b"%PDF-1.4"))
        self.assertIn(b"%%EOF", pdf)
        # idempotente: la segunda vez no recrea
        self.assertEqual(self.engine.storage_samples("alpha"), [])

    def test_storage_read_text_and_binary(self):
        self.engine.storage_samples("alpha")
        tex = self.engine.storage_read_file("generado", "ejemplo.tex", "alpha")
        self.assertFalse(tex["binary"])
        self.assertIn("documentclass", tex["content"])
        pdf = self.engine.storage_read_file("generado", "ejemplo.pdf", "alpha")
        self.assertTrue(pdf["binary"])

    def test_storage_raw_content_type(self):
        self.engine.storage_samples("alpha")
        data, ctype = self.engine.storage_raw_file("generado", "ejemplo.pdf", "alpha")
        self.assertEqual(ctype, "application/pdf")
        html, hctype = self.engine.storage_raw_file("generado", "ejemplo.html", "alpha")
        self.assertTrue(hctype.startswith("text/html"))

    def test_storage_tree(self):
        self.engine.storage_samples("alpha")
        tree = self.engine.storage_tree("alpha")
        dirs = [e["path"] for e in tree["entries"] if e["type"] == "dir"]
        self.assertEqual(dirs, ["generado", "planeado"])
        self.assertGreaterEqual(tree["counts"]["files"], 7)

    def test_storage_read_traversal_blocked(self):
        from ely_cli.config import ConfigError
        self.engine.storage_samples("alpha")
        with self.assertRaises(ConfigError):
            self.engine.storage_read_file("generado", "../planeado/items.json", "alpha")
        with self.assertRaises(ConfigError):
            self.engine.storage_read_file("generado", "no-existe.txt", "alpha")

    def test_storage_upload(self):
        from ely_cli.config import ConfigError
        result = self.engine.storage_upload("generado", "foto.png", b"\x89PNG\r\n", "alpha")
        self.assertTrue(result["saved"])
        self.assertEqual(result["size"], 6)
        saved = (self.tmp / "Local Storage" / "alpha" / "generado" / "foto.png").read_bytes()
        self.assertEqual(saved, b"\x89PNG\r\n")
        with self.assertRaises(ConfigError):
            self.engine.storage_upload("generado", "../evil.txt", b"x", "alpha")

    def test_create_project(self):
        from ely_cli.workspace import WorkspaceError
        result = self.engine.create_project("demo", "web")
        self.assertTrue(result["created"])
        self.assertIn("index.html", result["files"])
        self.assertTrue((self.tmp / "demo" / "index.html").exists())
        self.assertTrue((self.tmp / "demo" / "README.md").exists())
        with self.assertRaises(WorkspaceError):
            self.engine.create_project("demo", "web")  # ya existe

    def test_workspace_search(self):
        from ely_cli.workspace import WorkspaceError
        (self.tmp / "src").mkdir()
        (self.tmp / "src" / "app.py").write_text("def hola_mundo():\n    return 42\n", encoding="utf-8")
        result = self.engine.search_workspace("hola_mundo")
        self.assertEqual(len(result["matches"]), 1)
        self.assertEqual(result["matches"][0]["path"], "src/app.py")
        self.assertEqual(result["matches"][0]["line"], 1)
        with self.assertRaises(WorkspaceError):
            self.engine.search_workspace("x")  # menos de 2 caracteres


if __name__ == "__main__":
    unittest.main(verbosity=2)
