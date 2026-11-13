"""Panel inferior del IDE estilo VS Code: terminal, salida, problemas y puertos.

Cubre las dos mitades:
  · backend real (`termops.py`): perfiles detectados, argv por intérprete,
    puertos en escucha, diagnóstico de sintaxis y tareas deducidas;
  · contratos del frontend: módulos nuevos, barra de acciones por pestaña,
    menú «+» con los items de VS Code, i18n completo y estilos.
"""
from __future__ import annotations

import json
import re
import shutil
import tempfile
import unittest
from pathlib import Path

from CLI.ely_cli import ideops, termops, workspace

ROOT = Path(__file__).resolve().parents[2]
FRONTEND = ROOT / "IDE" / "frontend"
JS = FRONTEND / "js"


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


class TerminalProfileTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def test_profiles_are_detected_not_invented(self):
        info = termops.profiles(self.root)
        self.assertTrue(info["profiles"])
        for row in info["profiles"]:
            self.assertTrue(Path(row["path"]).exists(), row)
            self.assertIn(row["kind"], ("shell", "repl"))

    def test_profile_payload_has_prompt_data(self):
        info = termops.profiles(self.root)
        for key in ("default", "platform", "sep", "user", "host", "home", "root", "rootName"):
            self.assertIn(key, info)
        self.assertIn(info["default"], [p["id"] for p in info["profiles"]])
        self.assertEqual(info["rootName"], self.root.name)

    def test_default_profile_can_be_forced_by_env(self):
        import os
        old = os.environ.get("ELY_TERMINAL_PROFILE")
        os.environ["ELY_TERMINAL_PROFILE"] = "sh"
        try:
            self.assertEqual(termops.profiles(self.root)["default"], "sh")
        finally:
            if old is None:
                os.environ.pop("ELY_TERMINAL_PROFILE", None)
            else:
                os.environ["ELY_TERMINAL_PROFILE"] = old

    def test_argv_per_interpreter(self):
        if shutil.which("bash"):
            argv = termops.argv_for("bash", "echo hi")
            self.assertEqual(argv[-2:], ["-c", "echo hi"])
        if shutil.which("python3") or shutil.which("python"):
            self.assertEqual(termops.argv_for("python", "print(1)")[-2:], ["-c", "print(1)"])
        if shutil.which("node"):
            self.assertEqual(termops.argv_for("node", "1+1")[-2:], ["-e", "1+1"])

    def test_empty_profile_falls_back_to_sh(self):
        self.assertEqual(termops.argv_for("", "x"), ["/bin/sh", "-c", "x"])

    def test_unknown_profile_is_rejected(self):
        with self.assertRaises(workspace.WorkspaceError) as ctx:
            termops.argv_for("no-existe", "x")
        self.assertEqual(ctx.exception.status, 400)

    def test_missing_interpreter_is_reported(self):
        original = termops.shutil.which
        termops.shutil.which = lambda _name: None
        try:
            with self.assertRaises(workspace.WorkspaceError) as ctx:
                termops.argv_for("pwsh", "dir")
            self.assertEqual(ctx.exception.status, 400)
            self.assertIn("no está instalado", str(ctx.exception))
        finally:
            termops.shutil.which = original

    def test_run_command_uses_the_profile(self):
        if not (shutil.which("python3") or shutil.which("python")):
            self.skipTest("sin python")
        r = workspace.run_command(self.root, "print(6*7)", "", "python")
        self.assertEqual(r["code"], 0)
        self.assertIn("42", r["stdout"])
        self.assertEqual(r["profile"], "python")

    def test_run_command_reports_bad_profile_without_crashing(self):
        r = workspace.run_command(self.root, "echo x", "", "fantasma")
        self.assertEqual(r["code"], 1)
        self.assertIn("desconocido", r["stderr"])

    def test_cd_cannot_escape_the_workspace(self):
        r = workspace.run_command(self.root, "cd ../../..", "", "bash")
        self.assertEqual(r["code"], 1)
        self.assertIn("fuera del workspace", r["stderr"])

    def test_cd_inside_workspace_returns_relative_cwd(self):
        (self.root / "sub").mkdir()
        r = workspace.run_command(self.root, "cd sub", "", "bash")
        self.assertEqual(r["code"], 0)
        self.assertEqual(r["cwd"], "sub")


class PortsAndDiagnosticsTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def test_ports_shape(self):
        data = termops.ports(self.root)
        self.assertIn("ports", data)
        self.assertIn("supported", data)
        for row in data["ports"]:
            self.assertIsInstance(row["port"], int)
            self.assertTrue(1 <= row["port"] <= 65535)
            self.assertIn("local", row)

    def test_ports_are_sorted_and_listening_only(self):
        rows = termops.ports(self.root)["ports"]
        self.assertEqual(rows, sorted(rows, key=lambda r: r["port"]))

    def test_python_syntax_error_is_reported_with_position(self):
        out = termops.diagnostics(self.root, "a.py", "def roto(:\n    pass\n")
        self.assertEqual(len(out["problems"]), 1)
        row = out["problems"][0]
        self.assertEqual(row["severity"], "error")
        self.assertEqual(row["source"], "Python")
        self.assertEqual(row["line"], 1)
        self.assertGreaterEqual(row["col"], 1)
        self.assertEqual(row["path"], "a.py")

    def test_valid_python_has_no_problems(self):
        self.assertEqual(termops.diagnostics(self.root, "a.py", "x = 1\n")["problems"], [])

    def test_json_error_is_reported(self):
        out = termops.diagnostics(self.root, "a.json", '{"a": }')
        self.assertEqual(out["problems"][0]["source"], "JSON")
        self.assertEqual(out["problems"][0]["severity"], "error")

    def test_diagnostics_reads_disk_when_no_buffer(self):
        (self.root / "b.py").write_text("def f(:\n", encoding="utf-8")
        out = termops.diagnostics(self.root, "b.py", "")
        self.assertTrue(out["problems"])

    def test_diagnostics_does_not_write_the_buffer(self):
        target = self.root / "c.py"
        target.write_text("x = 1\n", encoding="utf-8")
        termops.diagnostics(self.root, "c.py", "def roto(:\n")
        self.assertEqual(target.read_text(encoding="utf-8"), "x = 1\n")

    def test_unknown_extension_has_no_problems(self):
        self.assertEqual(termops.diagnostics(self.root, "a.xyz", "lo que sea")["problems"], [])

    def test_missing_file_is_not_an_error(self):
        self.assertEqual(termops.diagnostics(self.root, "nope.py", "")["problems"], [])


class TaskDetectionTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def test_npm_scripts_become_tasks(self):
        (self.root / "package.json").write_text(json.dumps({"scripts": {"test": "pytest", "build": "tsc"}}), encoding="utf-8")
        data = ideops.tasks_list(self.root)
        self.assertEqual(data["source"], "detected")
        labels = [t["label"] for t in data["tasks"]]
        self.assertIn("npm: test", labels)
        self.assertIn("npm: build", labels)

    def test_makefile_targets_become_tasks(self):
        (self.root / "Makefile").write_text("all:\n\techo ok\n.PHONY: all\nclean:\n\trm -rf out\n", encoding="utf-8")
        labels = [t["label"] for t in ideops.tasks_list(self.root)["tasks"]]
        self.assertIn("make all", labels)
        self.assertIn("make clean", labels)
        self.assertNotIn("make .PHONY", labels)

    def test_tasks_json_wins_over_detection(self):
        (self.root / "package.json").write_text(json.dumps({"scripts": {"test": "x"}}), encoding="utf-8")
        (self.root / ".ely").mkdir()
        (self.root / ".ely" / "tasks.json").write_text(json.dumps({"tasks": [{"label": "hola", "command": "echo hola"}]}), encoding="utf-8")
        data = ideops.tasks_list(self.root)
        self.assertEqual(data["source"], "file")
        self.assertEqual([t["label"] for t in data["tasks"]], ["hola"])

    def test_detected_task_runs_for_real(self):
        (self.root / "Makefile").write_text("hola:\n\techo hecho\n", encoding="utf-8")
        r = ideops.tasks_run(self.root, "make hola")
        self.assertEqual(r["code"], 0)
        self.assertIn("hecho", r["stdout"])

    def test_empty_project_has_no_tasks(self):
        self.assertEqual(ideops.tasks_list(self.root)["tasks"], [])


class IdeOpsDispatchTests(unittest.TestCase):
    def test_new_ops_are_dispatched(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            self.assertIn("profiles", ideops.call(root, "term_profiles", {}))
            self.assertIn("ports", ideops.call(root, "ports", {}))
            self.assertIn("problems", ideops.call(root, "diagnostics", {"path": "a.py", "content": "x=1"}))

    def test_unknown_op_still_fails(self):
        with tempfile.TemporaryDirectory() as d:
            with self.assertRaises(workspace.WorkspaceError):
                ideops.call(Path(d), "no_existe", {})


class FrontendPanelContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.term = read(JS / "terminal.js")
        cls.out = read(JS / "output.js")
        cls.glyphs = read(JS / "glyphs.js")
        cls.ide = read(JS / "views" / "ide.js")
        cls.css = read(FRONTEND / "css" / "styles.css")
        cls.i18n = read(JS / "i18n.js")
        cls.app = read(JS / "app.js")

    def test_modules_are_loaded_at_runtime(self):
        for mod in ("js/glyphs.js", "js/output.js", "js/terminal.js"):
            self.assertIn('loadScript("' + mod + '")', self.app)
        self.assertLess(self.app.index("js/glyphs.js"), self.app.index("js/terminal.js"))

    def test_terminal_public_api(self):
        for member in ("init(", "mount(", "toolbar", "create", "split", "kill", "killAll",
                       "runFile", "runTask", "configureTasks", "selectDefault", "newWindow"):
            self.assertIn(member, self.term, member)

    def test_terminal_keeps_state_across_views(self):
        self.assertIn("const S = {", self.term)
        self.assertIn("terms: []", self.term)

    def test_prompt_follows_the_interpreter(self):
        self.assertIn('if (p.id === "pwsh") return "PS "', self.term)
        self.assertIn('p.id === "python" ? ">>>" : ">"', self.term)
        self.assertIn('"@"', self.term)

    def test_new_terminal_menu_matches_vscode(self):
        block = self.term.split("function newMenu(node)")[1].split("function moreMenu")[0]
        for key in ("term.new", "term.newWindow", "term.split", "term.splitWith",
                    "term.settings", "term.selectDefault", "term.runTask", "term.configureTasks"):
            self.assertIn(key, block, key)
        self.assertIn('key: "Ctrl+Shift+Ñ"', block)
        self.assertIn('key: "Ctrl+Shift+5"', block)

    def test_split_is_limited(self):
        self.assertIn("MAX_PANES", self.term)
        self.assertIn("term.splitLimit", self.term)

    def test_terminal_commands_go_to_the_backend_with_profile(self):
        self.assertIn("API.terminal(text, p.cwd, p.profile, mode, mode === \"full\")", self.term)
        engine = read(JS / "engine.js")
        self.assertIn("terminal: (command, cwd, profile, mode, confirmed)", engine)

    def test_terminal_has_three_isolation_modes_and_explicit_full_confirmation(self):
        for mode in ("read_only", "workspace", "full"):
            self.assertIn(mode, self.term)
        self.assertIn("window.confirm(\"Acceso total", self.term)
        server = read(ROOT / "CLI" / "ely_cli" / "server.py")
        self.assertIn('body.get("confirmed") is not True', server)
        self.assertIn('raise ApiError(403, "El modo full requiere confirmación explícita', server)

    def test_clear_and_exit_are_local(self):
        self.assertIn('trimmed === "clear"', self.term)
        self.assertIn('trimmed === "exit"', self.term)

    def test_output_channels_are_real(self):
        self.assertIn('const CHANNELS = ["Tasks", "Ely", "Extension Host", "Git", "Terminal", "Window"]', self.out)

    def test_output_filter_supports_exclusion(self):
        self.assertIn('raw.startsWith("!")', self.out)
        self.assertIn("hasInclude", self.out)

    def test_output_is_fed_by_real_sources(self):
        self.assertIn('Output.log("Terminal"', self.term)
        self.assertIn('Output.log("Extension Host"', read(JS / "ext-host.js"))
        self.assertIn('Output.log("Git"', self.ide)
        self.assertIn('Output.log("Tasks"', self.term)
        self.assertIn('window.addEventListener("error"', self.out)

    def test_glyphs_cover_the_toolbar(self):
        for name in ("terminal", "plus", "chevronDown", "split", "trash", "ellipsis",
                     "maximize", "restore", "close", "clear", "lock", "play", "refresh"):
            self.assertIn(name + ":", self.glyphs, name)
        self.assertIn('setAttribute("aria-hidden", "true")', self.glyphs)

    def test_panel_has_five_tabs_and_per_tab_toolbar(self):
        self.assertIn('const PANEL_TABS = [["problems"', self.ide)
        self.assertIn("function fillPanelActions(box)", self.ide)
        for branch in ('state.panel.tab === "terminal"', 'state.panel.tab === "output"',
                       'state.panel.tab === "problems"', 'state.panel.tab === "ports"',
                       'state.panel.tab === "debug"'):
            self.assertIn(branch, self.ide, branch)

    def test_panel_maximize_hides_the_editor(self):
        self.assertIn('panel.classList.toggle("max"', self.ide)
        self.assertIn('editorPane.style.display = state.panel.open && state.panel.max ? "none" : ""', self.ide)

    def test_tablist_role_only_wraps_tabs(self):
        self.assertIn('class: "vsc-panel-tablist", role: "tablist"', self.ide)
        self.assertIn('panelActions = UI.el("div", { class: "vsc-panel-actions" })', self.ide)

    def test_problems_and_ports_use_the_backend(self):
        self.assertIn('API.ide("diagnostics"', self.ide)
        self.assertIn('API.ide("ports"', self.ide)

    def test_port_links_use_the_preview_host(self):
        block = self.ide.split("function previewUrl")[1].split("async function renderPortsBody")[0]
        self.assertIn("location.hostname", block)
        self.assertIn('port + "-" + m[2]', block)
        self.assertIn("http://localhost:", block)

    def test_editor_group_menu_matches_vscode(self):
        block = self.ide.split("function groupMenuItems()")[1].split("function renderBreadcrumb")[0]
        for key in ("editor.showOpened", "editor.closeAll", "editor.closeSaved",
                    "editor.previewEditors", "editor.maximizeGroup", "editor.lockGroup", "editor.configure"):
            self.assertIn(key, block, key)
        self.assertIn('key: "Ctrl+K W"', block)
        self.assertIn('key: "Ctrl+K U"', block)

    def test_run_button_uses_the_terminal(self):
        self.assertIn("Terminal.runFile(state.active)", self.ide)
        self.assertIn('Glyph.button("play"', self.ide)

    def test_preview_editors_are_real(self):
        self.assertIn("state.previewPath", self.ide)
        self.assertIn("openFile(full, false, true)", self.ide)
        self.assertIn('" preview"', self.ide)

    def test_context_menu_supports_keys_and_submenus(self):
        self.assertIn("vsc-menu-key", self.ide)
        self.assertIn("it.submenu", self.ide)
        self.assertIn("vsc-menu-arrow", self.ide)

    def test_terminal_shortcuts(self):
        self.assertIn('e.shiftKey && (k === "ñ"', self.ide)
        self.assertIn('e.shiftKey && (k === "5"', self.ide)
        self.assertIn("Terminal.newWindow()", self.ide)

    def test_new_terminal_window_opens_maximized(self):
        self.assertIn("/[?&]terminal=1/.test(location.search)", self.ide)
        self.assertIn("state.panel.max = true", self.ide)

    def test_styles_exist_for_the_new_panel(self):
        for cls in (".vsc-panel-tablist", ".vsc-panel-actions", ".vsc-tb-btn", ".vsc-term-panes",
                    ".vsc-term-pane", ".vsc-term-deco", ".vsc-term-tabs", ".vsc-term-tab",
                    ".vsc-out-filter", ".vsc-out-select", ".vsc-prob-row", ".vsc-ports-row",
                    ".vsc-editor-actions", ".vsc-tab.preview", ".vsc-menu-key"):
            self.assertIn(cls, self.css, cls)

    def test_panel_tabs_are_not_uppercase_anymore(self):
        line = next(l for l in self.css.splitlines() if l.startswith(".vsc-panel-tab {"))
        self.assertNotIn("uppercase", line)

    def test_every_new_key_is_translated(self):
        have = set(re.findall(r'^\s*"([a-zA-Z0-9_.]+)":\s*\[', self.i18n, re.M))
        used = set()
        for src in (self.term, self.out, self.ide):
            used |= set(re.findall(r'\bT\("([a-zA-Z0-9_.]+)"\)', src))
        self.assertEqual(sorted(used - have), [])

    def test_new_keys_have_both_languages(self):
        for key in ("term.new", "term.newWindow", "term.splitWith", "out.filterPlaceholder",
                    "panel.maximize", "prob.none", "ports.listening", "editor.closeSaved", "debug.none"):
            m = re.search(r'"' + re.escape(key) + r'": \["((?:[^"\\]|\\.)+)", "((?:[^"\\]|\\.)+)"\]', self.i18n)
            self.assertIsNotNone(m, key)
            self.assertTrue(m.group(1) and m.group(2))

    def test_terminal_view_is_exposed_to_screen_readers(self):
        self.assertIn("Terminal.text()", self.ide)
        self.assertIn('role: "log"', self.term)
        self.assertIn("A11y.tablist(list", self.term)


if __name__ == "__main__":
    unittest.main(verbosity=2)
