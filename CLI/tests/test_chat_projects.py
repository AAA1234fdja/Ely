"""Chats persistentes por proyecto: CLI ↔ web comparten el mismo almacén.

Cubre los cuatro bugs reportados:
  1. las conversaciones del CLI no se guardaban entre sesiones/proyectos,
  2. no existía «nuevo proyecto» (solo «nueva conversación»),
  3. la web mostraba dos chats simultáneos (vista + widget con estado propio),
  4. no había forma de eliminar conversaciones.
"""
from __future__ import annotations

import json
import shutil
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "CLI"))

from ely_cli import cli as cli_mod  # noqa: E402
from ely_cli.config import ConfigError  # noqa: E402
from ely_cli.engine import Engine  # noqa: E402
from ely_cli.server import ElyHandler  # noqa: E402
from ely_cli.storage import DEFAULT_PROJECT  # noqa: E402


class _TmpProfileCase(unittest.TestCase):
    """Root temporal con dos perfiles para no tocar los datos del repo."""

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="ely-chats-"))
        (self.tmp / "profiles").mkdir()
        for pid in ("alpha", "beta"):
            (self.tmp / "profiles" / f"{pid}.json").write_text(json.dumps({
                "id": pid, "label": pid.title(), "provider": "openai",
                "model": "gpt-4o-mini", "base_url": "http://localhost/v1",
                "key_var": f"{pid.upper()}_API_KEY",
            }), encoding="utf-8")
        self.engine = Engine(self.tmp)

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)


class ChatProjectsTest(_TmpProfileCase):
    def test_general_project_exists_by_default(self):
        rows = self.engine.chat_projects("alpha")
        self.assertEqual(rows[0]["id"], DEFAULT_PROJECT)

    def test_create_rename_delete_project(self):
        project = self.engine.create_chat_project("Página web", "", "alpha")
        self.assertEqual(project["id"], "p-gina-web")
        self.engine.rename_chat_project(project["id"], "Sitio", "alpha")
        names = {p["id"]: p["name"] for p in self.engine.chat_projects("alpha")}
        self.assertEqual(names[project["id"]], "Sitio")
        self.assertTrue(self.engine.delete_chat_project(project["id"], "alpha"))
        self.assertNotIn(project["id"], {p["id"] for p in self.engine.chat_projects("alpha")})

    def test_duplicate_and_empty_names_rejected(self):
        self.engine.create_chat_project("Web", "", "alpha")
        with self.assertRaises(ConfigError):
            self.engine.create_chat_project("Web", "", "alpha")
        with self.assertRaises(ConfigError):
            self.engine.create_chat_project("   ", "", "alpha")

    def test_general_project_cannot_be_deleted(self):
        with self.assertRaises(ConfigError):
            self.engine.delete_chat_project(DEFAULT_PROJECT, "alpha")

    def test_sessions_scoped_by_project(self):
        self.engine.create_chat_project("Web", "", "alpha")
        self.engine.save_session({"id": "s1", "title": "general", "messages": []}, "alpha")
        self.engine.save_session({"id": "s2", "project": "web", "title": "web", "messages": []}, "alpha")
        self.assertEqual([s["id"] for s in self.engine.sessions("alpha")], ["s2", "s1"])
        self.assertEqual([s["id"] for s in self.engine.sessions("alpha", "web")], ["s2"])
        self.assertEqual([s["id"] for s in self.engine.sessions("alpha", DEFAULT_PROJECT)], ["s1"])
        # Sin proyecto explícito, una sesión cae en General (historial antiguo).
        self.assertEqual(self.engine.sessions("alpha")[1]["project"], DEFAULT_PROJECT)

    def test_sessions_isolated_between_profiles(self):
        self.engine.save_session({"id": "a", "project": "web", "messages": []}, "alpha")
        self.assertEqual(self.engine.sessions("beta", "web"), [])

    def test_delete_and_clear_sessions(self):
        self.engine.create_chat_project("Web", "", "alpha")
        for sid, proj in (("s1", "general"), ("s2", "web"), ("s3", "web")):
            self.engine.save_session({"id": sid, "project": proj, "messages": []}, "alpha")
        self.assertTrue(self.engine.delete_session("s2", "alpha"))
        self.assertFalse(self.engine.delete_session("nope", "alpha"))
        self.assertEqual(self.engine.clear_sessions("alpha", "web"), 1)
        self.assertEqual([s["id"] for s in self.engine.sessions("alpha")], ["s1"])
        self.assertEqual(self.engine.clear_sessions("alpha"), 1)
        self.assertEqual(self.engine.sessions("alpha"), [])

    def test_deleting_project_deletes_its_chats_only(self):
        self.engine.create_chat_project("Web", "", "alpha")
        self.engine.save_session({"id": "s1", "messages": []}, "alpha")
        self.engine.save_session({"id": "s2", "project": "web", "messages": []}, "alpha")
        self.engine.delete_chat_project("web", "alpha")
        self.assertEqual([s["id"] for s in self.engine.sessions("alpha")], ["s1"])

    def test_round_trip_keeps_messages_and_timestamps(self):
        session = {"id": "s9", "project": "general", "title": "Hola",
                   "messages": [{"role": "user", "content": "hola", "sent_at": "2026-01-01T00:00:00Z"},
                                {"role": "assistant", "content": "qué tal", "meta": {"total_ms": 12}}]}
        self.engine.save_session(session, "alpha")
        again = Engine(self.tmp).sessions("alpha", "general")[0]
        self.assertEqual(again["messages"][1]["content"], "qué tal")
        self.assertEqual(again["messages"][0]["sent_at"], "2026-01-01T00:00:00Z")
        self.assertTrue(again["created_at"] and again["updated_at"])


class _FakeEngine(Engine):
    """Engine con respuesta simulada: el REPL no llama a la red en los tests."""

    def stream(self, prompt, **kwargs):
        yield {"type": "delta", "text": "eco: " + prompt}
        yield {"type": "done", "usage": {"total_tokens": 3}}

    def build_context(self):
        return None


class CliChatPersistenceTest(_TmpProfileCase):
    def _run_repl(self, lines, argv_extra=()):
        import argparse
        from unittest import mock

        parser_args = argparse.Namespace(
            agent="photon", profile="alpha", memory=False,
            project=None, session=None, new=False,
        )
        for key, value in dict(argv_extra).items():
            setattr(parser_args, key, value)
        inputs = iter(lines)

        def fake_input(_prompt=""):
            try:
                return next(inputs)
            except StopIteration:
                raise EOFError

        factory = lambda *a, **k: _FakeEngine(self.tmp)
        with mock.patch.object(cli_mod, "Engine", factory), \
             mock.patch("builtins.input", fake_input), \
             mock.patch.object(cli_mod, "banner", lambda *a, **k: None):
            return cli_mod.cmd_chat(parser_args)

    def test_cli_persists_and_resumes_conversation(self):
        self._run_repl(["hola mundo", "/salir"])
        rows = self.engine.sessions("alpha", DEFAULT_PROJECT)
        self.assertEqual(len(rows), 1)
        self.assertEqual([m["role"] for m in rows[0]["messages"]], ["user", "assistant"])
        self.assertEqual(rows[0]["title"], "hola mundo")
        session_id = rows[0]["id"]
        # Segunda arrancada: retoma la misma conversación, no crea otra.
        self._run_repl(["segundo mensaje", "/salir"])
        rows = self.engine.sessions("alpha", DEFAULT_PROJECT)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["id"], session_id)
        self.assertEqual(len(rows[0]["messages"]), 4)

    def test_cli_new_and_project_commands(self):
        self._run_repl(["uno", "/nuevo", "dos", "/proyecto web", "tres", "/salir"])
        self.assertEqual(len(self.engine.sessions("alpha", DEFAULT_PROJECT)), 2)
        web = self.engine.sessions("alpha", "web")
        self.assertEqual(len(web), 1)
        self.assertEqual(web[0]["messages"][0]["content"], "tres")
        self.assertIn("web", {p["id"] for p in self.engine.chat_projects("alpha")})

    def test_cli_delete_command(self):
        self._run_repl(["uno", "/salir"])
        sid = self.engine.sessions("alpha")[0]["id"]
        self._run_repl([f"/borrar {sid}", "/salir"], {"new": True})
        self.assertFalse(any(s["id"] == sid for s in self.engine.sessions("alpha")))

    def test_cli_chats_and_projects_commands(self):
        import argparse
        from unittest import mock

        self.engine.save_session({"id": "s1", "messages": []}, "alpha")
        factory = lambda *a, **k: Engine(self.tmp)
        with mock.patch.object(cli_mod, "Engine", factory):
            self.assertEqual(cli_mod.cmd_chats(argparse.Namespace(
                profile="alpha", project=None, delete=None, clear=False)), 0)
            self.assertEqual(cli_mod.cmd_projects(argparse.Namespace(
                profile="alpha", create="Web", delete=None)), 0)
            self.assertEqual(cli_mod.cmd_chats(argparse.Namespace(
                profile="alpha", project=None, delete=None, clear=True)), 0)
        self.assertEqual(self.engine.sessions("alpha"), [])
        self.assertIn("web", {p["id"] for p in self.engine.chat_projects("alpha")})

    def test_parser_exposes_project_session_new(self):
        parser = cli_mod.build_parser()
        args = parser.parse_args(["chat", "--project", "web", "--new"])
        self.assertEqual(args.project, "web")
        self.assertTrue(args.new)
        self.assertIsNone(args.session)
        self.assertEqual(parser.parse_args(["chats", "--delete", "s1"]).delete, "s1")
        self.assertEqual(parser.parse_args(["projects", "--create", "Web"]).create, "Web")


class ChatHttpTest(_TmpProfileCase):
    """Rutas nuevas del servidor usadas por chat-store.js."""

    def setUp(self):
        super().setUp()
        handler = type("Handler", (ElyHandler,), {
            "engine": self.engine, "frontend": ROOT / "IDE" / "frontend",
        })
        self.httpd = ThreadingHTTPServer(("127.0.0.1", 0), handler)
        self.httpd.daemon_threads = True
        self.thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)
        self.thread.start()
        self.base = f"http://127.0.0.1:{self.httpd.server_address[1]}/api"

    def tearDown(self):
        self.httpd.shutdown()
        self.httpd.server_close()
        self.thread.join(timeout=5)
        super().tearDown()

    def call(self, method, path, body=None):
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(self.base + path, data=data, method=method,
                                     headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=10) as res:
                return res.status, json.loads(res.read().decode() or "{}")
        except urllib.error.HTTPError as err:
            return err.code, json.loads(err.read().decode() or "{}")

    def test_projects_crud_over_http(self):
        status, data = self.call("GET", "/chat/projects?profile=alpha")
        self.assertEqual(status, 200)
        self.assertEqual(data["projects"][0]["id"], DEFAULT_PROJECT)
        status, data = self.call("POST", "/chat/projects", {"name": "Web", "profile": "alpha"})
        self.assertEqual(status, 200)
        pid = data["project"]["id"] if "project" in data else data["id"]
        status, _ = self.call("PATCH", "/chat/projects", {"id": pid, "name": "Sitio", "profile": "alpha"})
        self.assertEqual(status, 200)
        names = {p["id"]: p["name"] for p in self.call("GET", "/chat/projects?profile=alpha")[1]["projects"]}
        self.assertEqual(names[pid], "Sitio")
        self.assertEqual(self.call("DELETE", f"/chat/projects/{pid}?profile=alpha")[0], 200)

    def test_sessions_filter_and_clear_over_http(self):
        self.call("POST", "/chat/projects", {"name": "Web", "profile": "alpha"})
        self.call("POST", "/sessions", {"id": "s1", "profile": "alpha", "messages": []})
        self.call("POST", "/sessions", {"id": "s2", "profile": "alpha", "project": "web", "messages": []})
        status, data = self.call("GET", "/sessions?profile=alpha&project=web")
        self.assertEqual(status, 200)
        self.assertEqual([s["id"] for s in data["sessions"]], ["s2"])
        status, data = self.call("POST", "/sessions/clear", {"profile": "alpha", "project": "web"})
        self.assertEqual(status, 200)
        self.assertEqual(self.call("GET", "/sessions?profile=alpha&project=web")[1]["sessions"], [])
        self.assertEqual(len(self.call("GET", "/sessions?profile=alpha")[1]["sessions"]), 1)
        self.assertEqual(self.call("DELETE", "/sessions/s1?profile=alpha")[0], 200)
        self.assertEqual(self.call("GET", "/sessions?profile=alpha")[1]["sessions"], [])

    def test_cors_allows_patch_and_delete(self):
        req = urllib.request.Request(self.base + "/chat/projects", method="OPTIONS")
        with urllib.request.urlopen(req, timeout=10) as res:
            allow = res.headers.get("Access-Control-Allow-Methods", "")
        self.assertIn("PATCH", allow)
        self.assertIn("DELETE", allow)


class SingleChatStoreContractTest(unittest.TestCase):
    """La web debe tener UN solo almacén de conversación (bug del chat doble)."""

    JS = ROOT / "IDE" / "frontend" / "js"

    def test_widget_has_no_private_history(self):
        src = (self.JS / "chat-widget.js").read_text(encoding="utf-8")
        self.assertIn("ChatStore", src)
        self.assertNotIn("newSessionId", src)
        self.assertNotIn("state.messages =", src)
        self.assertNotIn("state.sessionId", src)
        self.assertNotIn("LLM.stream", src)

    def test_view_uses_store_and_offers_new_project(self):
        src = (self.JS / "chat.js").read_text(encoding="utf-8")
        self.assertIn("ChatStore", src)
        self.assertIn("chat.newProject", src)
        self.assertIn("deleteChatModal", src)
        self.assertIn("deleteAllModal", src)
        self.assertNotIn("LLM.stream", src)

    def test_store_is_loaded_before_views(self):
        src = (self.JS / "app.js").read_text(encoding="utf-8")
        self.assertIn('loadScript("js/chat-store.js")', src)
        self.assertLess(src.index("js/chat-store.js"), src.index("js/chat-widget.js"))

    def test_api_has_project_endpoints(self):
        src = (self.JS / "engine.js").read_text(encoding="utf-8")
        for name in ("chatProjects", "createChatProject", "renameChatProject",
                     "deleteChatProject", "clearSessions"):
            self.assertIn(name + ":", src)


if __name__ == "__main__":
    unittest.main(verbosity=2)
