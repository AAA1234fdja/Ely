"""Los 14 idiomas de la interfaz: orden, paquetes, cobertura y fallback.

Comprobaciones estáticas (sin navegador) que complementan al harness jsdom
`i18n-locales.mjs`. Cubren:
  · el catálogo LANGS y el orden canónico del selector,
  · que cada paquete exista, registre su id y traduzca el núcleo completo,
  · que no haya claves duplicadas, vacías ni desconocidas,
  · la cadena de fallback paquete -> inglés -> español,
  · el aviso honesto de cobertura y de lengua experimental/construida,
  · el API `ely.l10n` de las extensiones con mapa por idioma,
  · los respaldos tipográficos por escritura en el CSS.
"""
from __future__ import annotations

import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
JS = ROOT / "IDE" / "frontend" / "js"
LOCALES = JS / "locales"
CSS = ROOT / "IDE" / "frontend" / "css"
CLI = ROOT / "CLI" / "ely_cli"

# Orden canónico: alfabético por autónimo, bloque latino y luego griego,
# cirílico, devanagari y CJK. No es el orden en que se pidieron los idiomas.
CANON = ["de", "en", "es", "fr", "it", "la", "pl", "pt", "vg", "el", "ru", "hi", "zh", "ja"]
PACK_IDS = [i for i in CANON if i not in ("es", "en")]

# Claves cuyo valor ES y EN coinciden: un paquete puede repetirlas tal cual.
TOP_KEY = re.compile(r'^    "([A-Za-z0-9_.]+)": (".*"),?$', re.M)
ANY_KEY = re.compile(r'^    "([A-Za-z0-9_.]+)":', re.M)


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def pack_entries(lang: str) -> dict[str, str]:
    """Pares clave->valor de primer nivel del paquete (ignora el mapa `extra`)."""
    out = {}
    for key, raw in TOP_KEY.findall(read(LOCALES / f"{lang}.js")):
        out[key] = json.loads(raw)
    return out


def base_entries() -> dict[str, list[str]]:
    """Diccionario base D de i18n.js: clave -> [es, en]."""
    src = read(JS / "i18n.js")
    start = src.index("const D = {")
    end = src.index("\n  };", start)
    body = src[start:end]
    # D mezcla sangrado de 2 y 4 espacios según el bloque histórico, y algunos
    # valores contienen corchetes literales ("Alt+]"), así que se parsean las
    # dos cadenas JSON en vez de buscar el corchete de cierre.
    pattern = re.compile(
        r'^ {2,4}"([A-Za-z0-9_.]+)": \[\s*("(?:[^"\\]|\\.)*")\s*,\s*("(?:[^"\\]|\\.)*")\s*\],?$',
        re.M,
    )
    out = {}
    for key, es, en in pattern.findall(body):
        out[key] = [json.loads(es), json.loads(en)]
    return out


class LanguageCatalogTest(unittest.TestCase):
    def setUp(self):
        self.src = read(JS / "i18n.js")

    def test_fourteen_languages_in_canonical_order(self):
        block = self.src[self.src.index("const LANGS = ["):]
        block = block[:block.index("\n  ];")]
        ids = re.findall(r'id:\s*"([a-z]{2})"', block)
        self.assertEqual(ids, CANON)
        self.assertEqual(len(ids), 14)

    def test_order_is_alphabetical_by_autonym_within_latin_block(self):
        block = self.src[self.src.index("const LANGS = ["):]
        block = block[:block.index("\n  ];")]
        names = re.findall(r'id:\s*"([a-z]{2})",\s*name:\s*"([^"]+)"', block)
        latin = [n for i, n in names if i in ("de", "en", "es", "fr", "it", "la", "pl", "pt", "vg")]
        self.assertEqual(latin, sorted(latin, key=str.lower))
        # y después de vg vienen el, ru, hi, zh, ja (griego, cirílico, devanagari, CJK)
        tail = [i for i, _ in names][-5:]
        self.assertEqual(tail, ["el", "ru", "hi", "zh", "ja"])

    def test_every_language_declares_autonym_english_and_html_lang(self):
        block = self.src[self.src.index("const LANGS = ["):]
        block = block[:block.index("\n  ];")]
        rows = re.findall(r"\{[^}]*\}", block)
        self.assertEqual(len(rows), 14)
        for row in rows:
            for field in ("id:", "name:", "en:", "htmlLang:", "script:"):
                self.assertIn(field, row, row)

    def test_vendergood_and_latin_are_flagged(self):
        self.assertIn('id: "vg"', self.src)
        self.assertIn('htmlLang: "art-x-vendergood"', self.src)
        self.assertIn('note: "constructed"', self.src)
        self.assertIn('note: "experimental"', self.src)
        self.assertIn('htmlLang: "zh-Hans"', self.src)

    def test_engine_api_is_multilingual(self):
        for name in ("register(id, dict)", "ensure(id)", "coverage(id)", "dict(id)",
                     "setLang(lang)", "phrasesFor(", "meta(id)", "has(id)"):
            self.assertIn(name, self.src, name)
        self.assertIn('el.src = "js/locales/" + target + ".js', self.src)
        self.assertIn("document.documentElement.lang", self.src)

    def test_fallback_chain_is_pack_then_english_then_spanish(self):
        body = self.src[self.src.index("    t(key) {"):]
        body = body[:body.index("\n    },")]
        self.assertIn("const pack = LOCALES[lang];", body)
        self.assertIn("if (pack && pack[key]) return pack[key];", body)
        self.assertIn("return entry[1] || entry[0];", body)

    def test_pattern_templates_carry_a_key(self):
        block = self.src[self.src.index("const PATTERNS = ["):]
        block = block[:block.index("\n  ];")]
        rows = [r for r in block.splitlines() if r.strip().startswith("[/")]
        self.assertGreaterEqual(len(rows), 37)
        for row in rows:
            self.assertRegex(row, r'"pat\.[A-Za-z]+"\]', row)

    def test_base_dictionary_includes_pattern_and_language_keys(self):
        base = base_entries()
        self.assertGreaterEqual(len(base), 740)
        for key in ("set.langCoverage", "set.langFallback",
                    "set.langNote.experimental", "set.langNote.constructed"):
            self.assertIn(key, base)
        pats = [k for k in base if k.startswith("pat.")]
        self.assertEqual(len(pats), 37)
        # las plantillas de patrón tienen texto español real, no el inglés
        for key in pats:
            es, en = base[key]
            self.assertTrue(es.strip(), key)
            self.assertTrue(en.strip(), key)


class LocalePackTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.base = base_entries()
        cls.core = json.loads(read(ROOT / "IDE" / "i18n-core.json"))["keys"]
        cls.pats = sorted(k for k in cls.base if k.startswith("pat."))

    def test_core_manifest_matches_the_dictionary(self):
        self.assertEqual(len(self.core), 415)
        self.assertEqual(len(set(self.core)), len(self.core))
        for key in self.core:
            self.assertTrue(key in self.base, key)

    def test_one_pack_per_language(self):
        files = sorted(p.stem for p in LOCALES.glob("*.js"))
        self.assertEqual(files, sorted(PACK_IDS))
        self.assertEqual(len(files), 12)

    def test_each_pack_registers_its_own_id(self):
        for lang in PACK_IDS:
            src = read(LOCALES / f"{lang}.js")
            self.assertIn(f'window.I18N.register("{lang}", {{', src, lang)
            self.assertIn("if (!window.I18N) return;", src, lang)
            self.assertIn('"use strict";', src, lang)

    def test_each_pack_translates_the_whole_core(self):
        for lang in PACK_IDS:
            entries = pack_entries(lang)
            missing = [k for k in self.core if not entries.get(k)]
            self.assertEqual(missing, [], f"{lang} no traduce: {missing[:8]}")

    def test_each_pack_translates_every_dynamic_pattern(self):
        for lang in PACK_IDS:
            entries = pack_entries(lang)
            missing = [k for k in self.pats if not entries.get(k)]
            self.assertEqual(missing, [], f"{lang} sin patrones: {missing}")

    def test_pattern_placeholders_survive_translation(self):
        for lang in PACK_IDS:
            entries = pack_entries(lang)
            for key in self.pats:
                want = sorted(set(re.findall(r"\$\d", self.base[key][1])))
                got = sorted(set(re.findall(r"\$\d", entries[key])))
                self.assertEqual(got, want, f"{lang}/{key}: {entries[key]!r}")

    def test_no_duplicate_keys(self):
        for lang in PACK_IDS:
            keys = ANY_KEY.findall(read(LOCALES / f"{lang}.js"))
            dupes = {k for k in keys if keys.count(k) > 1}
            self.assertEqual(dupes, set(), f"{lang} duplica {dupes}")

    def test_no_empty_values_and_no_unknown_keys(self):
        for lang in PACK_IDS:
            entries = pack_entries(lang)
            for key, value in entries.items():
                self.assertTrue(value.strip(), f"{lang}/{key} vacío")
                self.assertTrue(key in self.base, f"{lang}/{key} no existe en D")

    def test_coverage_is_the_same_core_for_every_language(self):
        sizes = {lang: len(pack_entries(lang)) for lang in PACK_IDS}
        self.assertEqual(len(set(sizes.values())), 1, sizes)
        self.assertEqual(next(iter(sizes.values())), len(self.core) + len(self.pats) + 4)

    def test_each_pack_ships_a_phrase_map_for_static_text(self):
        for lang in PACK_IDS:
            src = read(LOCALES / f"{lang}.js")
            self.assertIn('"extra": {', src, lang)
            block = src[src.index('"extra": {'):]
            pairs = re.findall(r'"([^"]+)":\s*"([^"]+)"', block)
            self.assertGreaterEqual(len(pairs), 40, lang)

    def test_non_latin_packs_really_use_their_script(self):
        ranges = {
            "el": r"[\u0370-\u03ff]", "ru": r"[\u0400-\u04ff]",
            "hi": r"[\u0900-\u097f]", "zh": r"[\u4e00-\u9fff]",
            "ja": r"[\u3040-\u30ff\u4e00-\u9fff]",
        }
        for lang, pattern in ranges.items():
            entries = pack_entries(lang)
            hits = sum(1 for v in entries.values() if re.search(pattern, v))
            self.assertGreater(hits, 300, f"{lang} sólo {hits} claves en su escritura")

    def test_latin_and_vendergood_packs_say_they_are_experimental(self):
        for lang in ("la", "vg"):
            src = read(LOCALES / f"{lang}.js")
            self.assertIn("EXPERIMENTAL", src.upper(), lang)
        vg = read(LOCALES / "vg.js")
        self.assertIn("NO ATESTIGUADO", vg.upper())
        self.assertIn("Sidis", vg)
        self.assertIn("APROXIMACIÓN", vg.upper())


class SettingsSelectorTest(unittest.TestCase):
    def setUp(self):
        self.src = read(JS / "settings.js")

    def test_selector_is_built_from_the_catalog(self):
        self.assertIn("I18N.langs.map(", self.src)
        self.assertNotIn('UI.el("option", { value: "es"', self.src)
        self.assertIn("I18N.setLang(id).then(", self.src)

    def test_selector_shows_autonym_and_english_name(self):
        self.assertIn('text: l.name + (l.name === l.en ? "" : " · " + l.en)', self.src)
        self.assertIn('"aria-label": t("set.language")', self.src)

    def test_panel_reports_real_coverage_and_notes(self):
        self.assertIn("I18N.coverage(id)", self.src)
        self.assertIn('t("set.langNote." + meta.note)', self.src)
        self.assertIn('t("set.langFallback")', self.src)
        self.assertIn("set-lang-info", self.src)
        self.assertIn("set-lang-note", self.src)

    def test_country_names_follow_the_interface_language(self):
        self.assertIn('I18N.lang() === "es" ? c.es : c.en', self.src)

    def test_app_waits_for_the_pack_before_first_paint(self):
        src = read(JS / "app.js")
        self.assertIn("await I18N.ensure(I18N.lang())", src)
        self.assertLess(src.index('loadScript("js/i18n.js")'),
                        src.index("await I18N.ensure(I18N.lang())"))


class StylesByScriptTest(unittest.TestCase):
    def setUp(self):
        self.src = read(CSS / "styles.css")

    def test_font_stack_covers_devanagari_and_cjk(self):
        for font in ("Noto Sans Devanagari", "Nirmala UI", "Noto Sans SC",
                     "Microsoft YaHei", "Hiragino Sans", "Yu Gothic", "Noto Sans JP"):
            self.assertIn(font, self.src, font)

    def test_monospace_stack_covers_cjk(self):
        self.assertIn("Noto Sans Mono CJK SC", self.src)

    def test_line_height_rules_for_devanagari_and_cjk(self):
        self.assertIn('html[lang="hi"]', self.src)
        self.assertIn('html[lang="zh-Hans"]', self.src)
        self.assertIn('html[lang="ja"]', self.src)

    def test_language_info_classes_exist(self):
        self.assertIn(".set-lang-info", self.src)
        self.assertIn(".set-lang-note", self.src)


class ExtensionLocalizationTest(unittest.TestCase):
    def setUp(self):
        self.src = read(CLI / "extensions.py")

    def test_l10n_accepts_a_language_map(self):
        self.assertIn("l10n: function (a, b) {", self.src)
        self.assertIn('if (typeof a[lang] === "string") return a[lang];', self.src)
        self.assertIn('if (typeof a.en === "string") return a.en;', self.src)
        self.assertIn('if (typeof a.es === "string") return a.es;', self.src)

    def test_l10n_keeps_the_two_argument_form(self):
        self.assertIn('if (lang === "es") return a;', self.src)
        self.assertIn('return typeof b === "string" ? b : a;', self.src)

    def test_record_exposes_the_full_l10n_map(self):
        self.assertIn('"l10n": manifest["l10n"],', self.src)
        # y mantiene nameEn/descriptionEn por compatibilidad
        self.assertIn('"nameEn":', self.src)
        self.assertIn('"descriptionEn":', self.src)

    def test_manifest_l10n_is_not_limited_to_two_languages(self):
        self.assertIn('"l10n": {str(k): v for k, v in l10n.items() if isinstance(v, dict)}', self.src)

    def test_host_localizes_names_in_the_active_language(self):
        src = read(JS / "ext-host.js")
        self.assertIn("const map = ext.l10n || {};", src)
        self.assertIn("const direct = (map[lang] || {})[field];", src)
        self.assertIn('if (lang === "es") return fallback;', src)
        self.assertIn('return en || (map.en || {})[field] || fallback;', src)

    def test_host_propagates_language_changes(self):
        src = read(JS / "ext-host.js")
        self.assertIn('window.addEventListener("ely:langchange"', src)
        self.assertIn('emit("language", { language: uiLanguage() })', src)


if __name__ == "__main__":
    unittest.main()
