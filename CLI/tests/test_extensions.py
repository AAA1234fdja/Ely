"""Extensiones de Ely: manifiesto, permisos, aislamiento y comunicación externa.

Cubre el sistema nuevo (CLI/ely_cli/extensions.py + rutas /api/extensions*):
  · validación del manifiesto y de los permisos declarados,
  · instalación desde carpeta local y rechazo de orígenes no permitidos,
  · proxy de red con permiso network:<host> (sin salir a Internet en los tests),
  · runner del sandbox con token por iframe y main.js inlineado,
  · rutas HTTP reales y operaciones de la API.
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

from ely_cli import extensions as ext  # noqa: E402
from ely_cli.engine import Engine  # noqa: E402
from ely_cli.server import ElyHandler  # noqa: E402


MANIFEST = {
    "id": "demo.test",
    "name": "Demo",
    "version": "1.0.0",
    "publisher": "ely",
    "description": "Extensión de prueba",
    "main": "main.js",
    "permissions": ["ui", "commands", "network:api.github.com"],
}


class _Case(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="ely-ext-"))
        self.engine = Engine(self.tmp)
        self.root = self.engine.root
        built = self.root / "IDE" / "ely-extensions"
        built.mkdir(parents=True, exist_ok=True)
        for folder in (ROOT / "IDE" / "ely-extensions").iterdir():
            if folder.is_dir():
                shutil.copytree(folder, built / folder.name)

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def make_ext(self, folder: Path, manifest=None, code="function activate(ely) { ely.log('hola'); }"):
        folder.mkdir(parents=True, exist_ok=True)
        (folder / "ely-extension.json").write_text(
            json.dumps(manifest or MANIFEST, ensure_ascii=False), encoding="utf-8")
        (folder / "main.js").write_text(code, encoding="utf-8")
        return folder


class ManifestTest(_Case):
    def test_valid_manifest(self):
        data = ext.validate_manifest(MANIFEST)
        self.assertEqual(data["id"], "demo.test")
        self.assertEqual(data["permissions"], ["ui", "commands", "network:api.github.com"])

    def test_id_is_normalized_to_lowercase(self):
        self.assertEqual(ext.validate_manifest(dict(MANIFEST, id="Demo.Test"))["id"], "demo.test")

    def test_invalid_id_rejected(self):
        with self.assertRaises(ext.ExtensionError):
            ext.validate_manifest(dict(MANIFEST, id="x"))

    def test_name_required(self):
        with self.assertRaises(ext.ExtensionError):
            ext.validate_manifest(dict(MANIFEST, name=""))

    def test_unknown_permission_rejected(self):
        with self.assertRaises(ext.ExtensionError) as ctx:
            ext.validate_manifest(dict(MANIFEST, permissions=["root:all"]))
        self.assertEqual(ctx.exception.status, 400)

    def test_main_cannot_escape(self):
        with self.assertRaises(ext.ExtensionError):
            ext.validate_manifest(dict(MANIFEST, main="../fuera.js"))

    def test_permissions_must_be_list(self):
        with self.assertRaises(ext.ExtensionError):
            ext.validate_manifest(dict(MANIFEST, permissions="ui"))

    def test_l10n_optional(self):
        data = ext.validate_manifest(dict(MANIFEST, l10n={"en": {"name": "Demo EN"}}))
        self.assertEqual(data["l10n"]["en"]["name"], "Demo EN")

    def test_network_hosts_from_permissions(self):
        data = ext.validate_manifest(MANIFEST)
        self.assertEqual(ext.network_hosts(data), {"api.github.com"})

    def test_network_wildcard_uses_defaults(self):
        data = ext.validate_manifest(dict(MANIFEST, permissions=["network:*"]))
        self.assertIn("api.github.com", ext.network_hosts(data))

    def test_has_permission(self):
        data = ext.validate_manifest(MANIFEST)
        self.assertTrue(ext.has_permission(data, "ui"))
        self.assertFalse(ext.has_permission(data, "workspace:write"))


class BuiltinTest(_Case):
    def test_three_builtins(self):
        rows = ext.list_extensions(self.root)
        ids = {r["id"] for r in rows}
        self.assertEqual(ids, {"ely.word-count", "ely.python-snippets", "ely.github-info"})

    def test_builtins_enabled_by_default(self):
        self.assertTrue(all(r["enabled"] for r in ext.list_extensions(self.root)))

    def test_builtin_flag_and_folder(self):
        row = next(r for r in ext.list_extensions(self.root) if r["id"] == "ely.word-count")
        self.assertTrue(row["builtin"])
        self.assertTrue((self.root / row["folder"]).is_dir())

    def test_english_names_published(self):
        rows = ext.list_extensions(self.root)
        self.assertTrue(all(r["nameEn"] for r in rows))

    def test_permission_labels(self):
        row = next(r for r in ext.list_extensions(self.root) if r["id"] == "ely.github-info")
        self.assertTrue(any("api.github.com" in label for label in row["permissionLabels"]))

    def test_find_builtin(self):
        folder, manifest = ext.find(self.root, "ely.python-snippets")
        self.assertTrue((folder / "main.js").is_file())
        self.assertIn("completions", manifest["permissions"])

    def test_find_unknown(self):
        with self.assertRaises(ext.ExtensionError) as ctx:
            ext.find(self.root, "no.existe")
        self.assertEqual(ctx.exception.status, 404)

    def test_disable_and_enable(self):
        ext.set_enabled(self.root, "ely.word-count", False)
        row = next(r for r in ext.list_extensions(self.root) if r["id"] == "ely.word-count")
        self.assertFalse(row["enabled"])
        result = ext.set_enabled(self.root, "ely.word-count", True)
        self.assertTrue(result["extension"]["enabled"])

    def test_builtin_cannot_be_uninstalled(self):
        with self.assertRaises(ext.ExtensionError):
            ext.uninstall(self.root, "ely.word-count")


class InstallTest(_Case):
    def test_install_from_local_folder(self):
        source = self.make_ext(self.tmp / "src" / "demo")
        result = ext.install(self.root, str(source))
        self.assertEqual(result["extension"]["id"], "demo.test")
        installed = ext.store_dir(self.root) / "demo.test"
        self.assertTrue((installed / "ely-extension.json").is_file())
        self.assertTrue((installed / "main.js").is_file())

    def test_installed_overrides_builtin(self):
        manifest = dict(MANIFEST, id="ely.word-count", name="Mi versión")
        source = self.make_ext(self.tmp / "src" / "wc", manifest)
        ext.install(self.root, str(source))
        row = next(r for r in ext.list_extensions(self.root) if r["id"] == "ely.word-count")
        self.assertEqual(row["name"], "Mi versión")
        self.assertFalse(row["builtin"])

    def test_uninstall_installed(self):
        source = self.make_ext(self.tmp / "src" / "demo")
        ext.install(self.root, str(source))
        ext.uninstall(self.root, "demo.test")
        self.assertFalse((ext.store_dir(self.root) / "demo.test").exists())

    def test_install_from_browser_folder_payload(self):
        payload = [
            {"path": "ely-extension.json", "text": json.dumps(MANIFEST)},
            {"path": "main.js", "text": "function activate(ely) {}"},
        ]
        result = ext.install(self.root, "", payload)
        self.assertEqual(result["extension"]["id"], "demo.test")

    def test_folder_payload_rejects_traversal(self):
        payload = [
            {"path": "ely-extension.json", "text": json.dumps(MANIFEST)},
            {"path": "../escape.js", "text": "mal"},
        ]
        with self.assertRaises(ext.ExtensionError):
            ext.install(self.root, "", payload)

    def test_unknown_host_rejected(self):
        with self.assertRaises(ext.ExtensionError):
            ext.install(self.root, "https://example.com/extension.tar.gz")

    def test_github_slug_builds_url(self):
        urls = ext._source_urls("microsoft/vscode")
        self.assertTrue(any("codeload.github.com" in url for url, _ in urls))

    def test_npm_prefix_builds_registry(self):
        urls = ext._source_urls("npm:left-pad")
        self.assertTrue(any("registry.npmjs.org" in url for url, _ in urls))

    def test_empty_source_rejected(self):
        with self.assertRaises(ext.ExtensionError):
            ext.install(self.root, "")


class NetworkPermissionTest(_Case):
    def test_fetch_without_permission(self):
        with self.assertRaises(ext.ExtensionError) as ctx:
            ext.fetch(self.root, "ely.word-count", "https://api.github.com/repos/a/b")
        self.assertEqual(ctx.exception.status, 403)

    def test_fetch_host_not_declared(self):
        with self.assertRaises(ext.ExtensionError) as ctx:
            ext.fetch(self.root, "ely.github-info", "https://example.com/")
        self.assertEqual(ctx.exception.status, 403)

    def test_fetch_disabled_extension(self):
        ext.set_enabled(self.root, "ely.github-info", False)
        with self.assertRaises(ext.ExtensionError):
            ext.fetch(self.root, "ely.github-info", "https://api.github.com/repos/a/b")

    def test_fetch_bad_scheme(self):
        with self.assertRaises(ext.ExtensionError):
            ext.fetch(self.root, "ely.github-info", "file:///etc/passwd")

    def test_fetch_unknown_extension(self):
        with self.assertRaises(ext.ExtensionError):
            ext.fetch(self.root, "no.existe", "https://api.github.com/")

    def test_fetch_success_with_stub(self):
        """La petición se delega en urllib: se sustituye para no salir a Internet."""
        class _Response:
            status = 200
            headers = {"Content-Type": "application/json"}

            def read(self, limit=-1):
                return b'{"full_name": "microsoft/vscode"}'

            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

            def geturl(self):
                return "https://api.github.com/repos/microsoft/vscode"

        original = ext.urllib.request.urlopen
        ext.urllib.request.urlopen = lambda *a, **k: _Response()
        try:
            result = ext.fetch(self.root, "ely.github-info", "https://api.github.com/repos/microsoft/vscode")
        finally:
            ext.urllib.request.urlopen = original
        self.assertTrue(result["ok"])
        self.assertEqual(result["status"], 200)
        self.assertIn("microsoft/vscode", result["text"])
        self.assertIsInstance(result["ms"], int)


class RunnerTest(_Case):
    def test_runner_inlines_main(self):
        html = ext.runner_html(self.root, "ely.python-snippets")
        self.assertIn("acquireElyApi", html)
        self.assertIn("registerCompletionItemProvider", html)

    def test_runner_has_bridge_api(self):
        html = ext.runner_html(self.root, "ely.github-info")
        for token in ("postMessage", "net.fetch", "commands.register", "setStatusBar"):
            self.assertIn(token, html)

    def test_runner_token(self):
        html = ext.runner_html(self.root, "ely.word-count", "abc123def456")
        self.assertIn("abc123def456", html)

    def test_runner_escapes_script_close(self):
        folder = self.make_ext(self.tmp / "src" / "demo", code="var s = '</script><b>x</b>';")
        ext.install(self.root, str(folder))
        html = ext.runner_html(self.root, "demo.test")
        self.assertNotIn("</script><b>", html)

    def test_runner_unknown_extension(self):
        with self.assertRaises(ext.ExtensionError):
            ext.runner_html(self.root, "no.existe")

    def test_asset_path_traversal(self):
        with self.assertRaises(ext.ExtensionError):
            ext.asset(self.root, "ely.word-count", "../../etc/passwd")

    def test_asset_reads_main(self):
        path, ctype = ext.asset(self.root, "ely.word-count", "main.js")
        self.assertTrue(path.is_file())
        self.assertIn("javascript", ctype)


class CallApiTest(_Case):
    def test_list_op(self):
        data = ext.call(self.root, "list", {})
        self.assertFalse(data["vsixCompatible"])
        self.assertIn("api.github.com", data["installHosts"])
        self.assertGreaterEqual(len(data["permissions"]), 7)

    def test_manifest_op(self):
        data = ext.call(self.root, "manifest", {"id": "ely.github-info"})
        self.assertIn("network:api.github.com", data["manifest"]["permissions"])

    def test_enable_op(self):
        data = ext.call(self.root, "enable", {"id": "ely.word-count", "enabled": False})
        self.assertFalse(data["enabled"])

    def test_readme_op_missing(self):
        data = ext.call(self.root, "readme", {"id": "ely.word-count"})
        self.assertEqual(data["text"], "")

    def test_unknown_op(self):
        with self.assertRaises(ext.ExtensionError) as ctx:
            ext.call(self.root, "nope", {})
        self.assertEqual(ctx.exception.status, 404)


class HttpRoutesTest(_Case):
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

    def request(self, method, path, body=None):
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(self.base + path, data=data, method=method,
                                     headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=10) as res:
                raw = res.read().decode()
                ctype = res.headers.get("Content-Type", "")
                csp = res.headers.get("Content-Security-Policy", "")
                payload = json.loads(raw) if "json" in ctype else raw
                return res.status, payload, csp
        except urllib.error.HTTPError as err:
            raw = err.read().decode()
            try:
                return err.code, json.loads(raw), ""
            except ValueError:
                return err.code, raw, ""

    def test_get_extensions(self):
        status, data, _ = self.request("GET", "/extensions")
        self.assertEqual(status, 200)
        self.assertEqual(len(data["extensions"]), 3)

    def test_runner_csp(self):
        status, html, csp = self.request("GET", "/extensions/runner?id=ely.word-count&token=abcdefgh12345678")
        self.assertEqual(status, 200)
        self.assertIn("default-src 'none'", csp)
        self.assertIn("abcdefgh12345678", html)

    def test_runner_rejects_bad_token(self):
        status, html, _ = self.request("GET", "/extensions/runner?id=ely.word-count&token=../../malo")
        self.assertEqual(status, 200)
        self.assertNotIn("../../malo", html)

    def test_runner_unknown_id(self):
        status, _, _ = self.request("GET", "/extensions/runner?id=no.existe")
        self.assertEqual(status, 404)

    def test_call_fetch_denied(self):
        status, data, _ = self.request("POST", "/extensions/call", {
            "op": "fetch", "args": {"id": "ely.word-count", "url": "https://api.github.com/"}
        })
        self.assertEqual(status, 403)

    def test_call_enable(self):
        status, data, _ = self.request("POST", "/extensions/call", {
            "op": "enable", "args": {"id": "ely.word-count", "enabled": False}
        })
        self.assertEqual(status, 200)
        self.assertFalse(data["enabled"])

    def test_asset_route(self):
        req = urllib.request.Request(self.base + "/extensions/asset?id=ely.word-count&path=main.js")
        with urllib.request.urlopen(req, timeout=10) as res:
            self.assertEqual(res.status, 200)
            self.assertIn("activate", res.read().decode())


class FrontendContractTest(unittest.TestCase):
    """Contratos estáticos del frontend (sin navegador)."""

    @classmethod
    def setUpClass(cls):
        cls.host = (ROOT / "IDE" / "frontend" / "js" / "ext-host.js").read_text(encoding="utf-8")
        cls.completion = (ROOT / "IDE" / "frontend" / "js" / "completion.js").read_text(encoding="utf-8")
        cls.languages = (ROOT / "IDE" / "frontend" / "js" / "languages.js").read_text(encoding="utf-8")
        cls.ide = (ROOT / "IDE" / "frontend" / "js" / "views" / "ide.js").read_text(encoding="utf-8")
        cls.settings = (ROOT / "IDE" / "frontend" / "js" / "settings.js").read_text(encoding="utf-8")
        cls.i18n = (ROOT / "IDE" / "frontend" / "js" / "i18n.js").read_text(encoding="utf-8")

    def test_sandbox_without_same_origin(self):
        self.assertIn('iframe.setAttribute("sandbox", "allow-scripts")', self.host)
        self.assertNotIn('allow-scripts allow-same-origin', self.host)

    def test_host_validates_source_or_token(self):
        self.assertIn("entry.iframe.contentWindow === event.source", self.host)
        self.assertIn("msg.token === entry.token", self.host)

    def test_host_checks_permissions(self):
        self.assertIn("function requirePerm", self.host)
        self.assertIn("ext.noPermission", self.host)

    def test_network_goes_through_backend(self):
        self.assertIn('API.extCall("fetch"', self.host)

    def test_tab_completion_default_on(self):
        self.assertIn("tabCompletion: true", self.settings)
        self.assertIn('Settings.get("tabCompletion")', self.completion)

    def test_tab_accepts_and_escape_dismisses(self):
        self.assertIn('event.key === "Tab"', self.completion)
        self.assertIn("event.stopPropagation()", self.completion)
        self.assertIn('event.key === "Escape"', self.completion)

    def test_tab_focus_mode_respected(self):
        self.assertIn('A11y.get("tabFocusMode")', self.completion)

    def test_completion_uses_extensions(self):
        self.assertIn("ExtHost.completionsFor", self.completion)

    def test_language_catalog_size(self):
        rows = self.languages.count('", "')
        self.assertGreater(rows, 300)          # ~165 lenguajes con varios campos

    def test_explorer_actions_present(self):
        for key in ("ide.newFile", "ide.newFolder", "common.refresh", "ide.collapseAll"):
            self.assertIn(key, self.ide)

    def test_explorer_inline_creation(self):
        self.assertIn("function inlineCreate", self.ide)
        self.assertIn("vsc-inline-input", self.ide)

    def test_explorer_sections(self):
        self.assertIn("explorerSection(\"outline\"", self.ide)
        self.assertIn("explorerSection(\"timeline\"", self.ide)

    def test_ide_state_survives_rerender(self):
        self.assertIn("let ideState = null", self.ide)

    def test_new_i18n_keys_exist(self):
        for key in ("ext.title", "ext.vsixNote", "cmp.settingLabel", "ide.collapseAll",
                    "ide.timeline", "ide.moreActions", "navdesc.extensions"):
            self.assertIn('"' + key + '"', self.i18n)


if __name__ == "__main__":
    unittest.main()
