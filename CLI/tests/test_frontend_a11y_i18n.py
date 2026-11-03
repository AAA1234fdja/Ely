"""Contratos de accesibilidad, idioma y bienvenida del IDE.

Son comprobaciones estáticas del frontend (sin navegador): complementan a los
harness jsdom que recorren la app real. Cubren:
  · el módulo de accesibilidad y su cableado (roles ARIA, vista accesible, señales),
  · que el traductor cubra el diccionario completo y los textos del backend,
  · la bienvenida estilo VS Code y el flujo «New File» con archivos sin título.
"""
from __future__ import annotations

import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
JS = ROOT / "IDE" / "frontend" / "js"
CSS = ROOT / "IDE" / "frontend" / "css"


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


class AccessibilityModuleTest(unittest.TestCase):
    def setUp(self):
        self.src = read(JS / "a11y.js")

    def test_module_exposes_vscode_like_api(self):
        for name in ("announce", "signal", "registerView", "openView", "help",
                     "tree", "tablist", "menu", "trapFocus", "editor", "statusItem",
                     "panel", "nextRegion"):
            self.assertIn(name, self.src, name)
        self.assertIn("window.A11y = A11y;", self.src)

    def test_live_regions_and_skip_links(self):
        self.assertIn('aria-live", "polite"', self.src)
        self.assertIn('aria-live", "assertive"', self.src)
        self.assertIn("a11y-skip-link", self.src)
        self.assertIn("a11y-sr-only", self.src)

    def test_signals_match_vscode_names(self):
        for signal in ("save", "format", "taskCompleted", "taskFailed",
                       "terminalCommandSucceeded", "terminalCommandFailed",
                       "chatRequestSent", "chatResponseReceived", "lineHasError"):
            self.assertIn(signal + ":", self.src, signal)

    def test_keybindings_match_vscode(self):
        self.assertIn('key === "F2"', self.src)      # Alt+F2 vista accesible
        self.assertIn('key === "F1"', self.src)      # Alt+F1 ayuda
        self.assertIn('key === "]"', self.src)       # Alt+] siguiente
        self.assertIn('key === "F6"', self.src)      # siguiente región
        self.assertIn('"m" || key === "M"', self.src)  # Ctrl+M tab focus

    def test_screen_reader_detection_is_honest(self):
        # Los navegadores no exponen el lector de pantalla: se pregunta.
        self.assertIn("forced-colors", self.src)
        self.assertIn("maybePrompt", self.src)
        self.assertIn("promptShown", self.src)

    def test_stylesheet_covers_every_flag(self):
        css = read(CSS / "a11y.css")
        for flag in ("data-a11y-screen-reader", "data-a11y-contrast", "data-a11y-motion",
                     "data-a11y-links", "data-a11y-dim", "data-a11y-targets",
                     "data-a11y-font", "data-a11y-focus", "data-a11y-tab-focus"):
            self.assertIn(flag, css, flag)
        self.assertIn("forced-colors: active", css)
        self.assertIn("prefers-reduced-motion", css)

    def test_loaded_at_runtime_before_views(self):
        app = read(JS / "app.js")
        self.assertIn('loadScript("js/a11y.js")', app)
        self.assertIn("css/a11y.css", app)
        self.assertIn("A11y.init(this)", app)
        self.assertLess(app.index("js/a11y.js"), app.index("js/chat-widget.js"))


class IdeAccessibilityWiringTest(unittest.TestCase):
    def setUp(self):
        self.ide = read(JS / "views" / "ide.js")

    def test_tree_tabs_and_toolbar_have_roles(self):
        self.assertIn("A11y.tree(fileList", self.ide)
        self.assertIn("A11y.tablist(tabsBar", self.ide)
        self.assertIn("A11y.tablist(tabs", self.ide)
        self.assertIn('activity.setAttribute("role", "toolbar")', self.ide)
        self.assertIn('statusbar.setAttribute("role", "status")', self.ide)

    def test_tree_items_carry_data_for_keyboard_navigation(self):
        self.assertIn('"data-tree-item": "1"', self.ide)
        self.assertIn('"data-depth"', self.ide)
        self.assertIn('"data-open"', self.ide)

    def test_editor_is_labelled_and_announces_position(self):
        self.assertIn("A11y.editor(codeTA", self.ide)
        self.assertIn("onPosition", self.ide)

    def test_accessible_view_providers_registered(self):
        for provider in ("editor-line", "editor-file", "terminal", "explorer"):
            self.assertIn('registerView("' + provider + '"', self.ide, provider)

    def test_terminal_is_a_live_log_with_signals(self):
        self.assertIn('role: "log"', self.ide)
        self.assertIn("terminalCommandSucceeded", self.ide)
        self.assertIn("terminalCommandFailed", self.ide)

    def test_modal_traps_focus_and_restores_it(self):
        ui = read(JS / "ui.js")
        self.assertIn('role: "dialog", "aria-modal": "true"', ui)
        self.assertIn("A11y.trapFocus(sheet)", ui)
        self.assertIn("A11y.releaseFocus(returnFocus)", ui)

    def test_chat_uses_signals(self):
        store = read(JS / "chat-store.js")
        self.assertIn('A11y.signal("chatRequestSent")', store)
        self.assertIn("chatResponseReceived", store)


class LanguageCoverageTest(unittest.TestCase):
    """El cambio de idioma debe afectar a TODA la interfaz."""

    def setUp(self):
        self.src = read(JS / "i18n.js")

    def test_dictionary_is_reused_for_dom_translation(self):
        self.assertIn("Object.keys(D).forEach", self.src)
        self.assertIn("PHRASES[pair[0]] = pair[1]", self.src)
        self.assertIn("Object.keys(EXTRA).forEach", self.src)

    def test_dynamic_patterns_exist(self):
        self.assertIn("const PATTERNS", self.src)
        for pattern in ("hace (\\d+) min", "configurados", "% con éxito", "archivos"):
            self.assertIn(pattern, self.src, pattern)

    def test_accessible_attributes_are_translated(self):
        self.assertIn("[aria-label]", self.src)
        self.assertIn('"aria-label", "alt", "aria-placeholder"', self.src)

    def test_options_are_translated_but_user_input_is_not(self):
        self.assertNotIn('"OPTION"', self.src.split("const SKIP_TAGS")[1].split("\n")[0])
        self.assertIn('"TEXTAREA"', self.src.split("const SKIP_TAGS")[1].split("\n")[0])
        self.assertIn('"INPUT"', self.src.split("const SKIP_TAGS")[1].split("\n")[0])

    def test_language_change_repaints_the_view(self):
        settings = read(JS / "settings.js")
        self.assertIn("App.renderNav(); App.renderHeader(); App.render();", settings)

    def test_backend_strings_are_covered(self):
        for text in ("¿Qué quieres construir hoy?", "Agente orquestador", "Datos y análisis"):
            self.assertIn(text, self.src, text)

    def test_every_key_has_both_languages(self):
        pairs = re.findall(r'"([A-Za-z0-9_.]+)":\s*\["((?:[^"\\]|\\.)*)",\s*"((?:[^"\\]|\\.)*)"\]', self.src)
        self.assertGreater(len(pairs), 500)
        for key, es, en in pairs:
            self.assertTrue(es.strip(), key)
            self.assertTrue(en.strip(), key)

    def test_ide_and_a11y_keys_are_present(self):
        keys = set(re.findall(r'"([A-Za-z0-9_.]+)":\s*\[', self.src))
        ide = read(JS / "views" / "ide.js")
        used = set(re.findall(r'T\("([a-z0-9A-Z_.]+)"\)', ide))
        self.assertEqual(used - keys, set(), "claves de ide.js sin traducción")
        a11y = read(JS / "a11y.js")
        used_a11y = set(re.findall(r'"(a11y\.[A-Za-z0-9_.]+)"', a11y))
        self.assertEqual(used_a11y - keys, set(), "claves de a11y.js sin traducción")

    def test_model_prompts_are_marked_as_data(self):
        agents = read(JS / "views" / "agents.js")
        self.assertIn('"data-noi18n": "1"', agents)


class WelcomeAndNewFileTest(unittest.TestCase):
    def setUp(self):
        self.ide = read(JS / "views" / "ide.js")
        self.css = read(CSS / "styles.css")

    def test_welcome_matches_vscode_layout(self):
        for marker in ("wl-start", "wl-recent", "wl-walk", "vsc-wl-card", "vsc-wl-footer"):
            self.assertIn(marker, self.ide, marker)
        self.assertIn("ide.showWelcomeOnStartup", self.ide)
        self.assertIn("ide.tagline", self.ide)

    def test_walkthroughs_are_real_actions(self):
        self.assertIn("function walkthrough(", self.ide)
        self.assertIn("walkStartTitle", self.ide)
        self.assertIn("walkBasicsTitle", self.ide)

    def test_new_file_quick_pick(self):
        self.assertIn("function quickPick(", self.ide)
        self.assertIn("function newFileQuickPick()", self.ide)
        self.assertIn("ide.selectFileType", self.ide)
        self.assertIn('role: "listbox"', self.ide)
        self.assertIn('role: "combobox"', self.ide)
        self.assertIn("aria-activedescendant", self.ide)

    def test_notebook_is_declared_not_faked(self):
        self.assertIn("__notebook", self.ide)
        self.assertIn("soon: true, disabled: true", self.ide)

    def test_untitled_files_and_save_as(self):
        self.assertIn("function newUntitled(", self.ide)
        self.assertIn("untitled:", self.ide)
        self.assertIn("if (isUntitled(state.active)) { saveAs(); return; }", self.ide)
        self.assertIn("state.untitledCount", self.ide)

    def test_language_chord_and_placeholder(self):
        self.assertIn("Ctrl+K M", self.ide)
        self.assertIn("code-hint", self.ide)
        self.assertIn("ide.hintNever", self.ide)

    def test_styles_exist_for_new_components(self):
        for cls in (".vsc-qp-host", ".vsc-qp-item", ".vsc-wl", ".vsc-wl-card",
                    ".vsc-walk-step", ".code-hint", ".vsc-tab.untitled"):
            self.assertIn(cls, self.css, cls)


if __name__ == "__main__":
    unittest.main(verbosity=2)
