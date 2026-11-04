"""Catálogo de lenguajes del editor y assets de iconos del IDE.

Comprueba que el catálogo (`languages.js`), el resaltado (`syntax.js`) y los
assets (`icons.js` + `icons/*.svg`) son coherentes entre sí:

  · cada lenguaje del catálogo tiene icono propio (no el documento genérico),
  · todo icono referenciado existe en disco y ningún SVG queda huérfano,
  · los SVG son válidos (XML con viewBox) y ligeros,
  · la detección por extensión y por nombre de archivo sigue el criterio VS Code,
  · el Explorador y las pestañas usan los iconos de carpeta por nombre.
"""
from __future__ import annotations

import json
import re
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path

FRONTEND = Path(__file__).resolve().parents[2] / "IDE" / "frontend"
LANGS_JS = FRONTEND / "js" / "languages.js"
SYNTAX_JS = FRONTEND / "js" / "syntax.js"
ICONS_JS = FRONTEND / "js" / "icons.js"
IDE_JS = FRONTEND / "js" / "views" / "ide.js"
ICONS_DIR = FRONTEND / "icons"


def _js_object(src: str, name: str) -> dict:
    """Extrae `const NAME = { ... };` y lo devuelve como dict de str→str."""
    m = re.search(r"const " + name + r" = \{(.*?)\n  \};", src, re.S)
    if not m:
        raise AssertionError("no se encontró el mapa " + name)
    body = "{" + m.group(1).rstrip().rstrip(",") + "}"
    return json.loads(body)


def _lang_rows(src: str) -> list[list[str]]:
    """Filas del catálogo: [id, etiqueta, extIcono, exts, nombres, familia]."""
    rows = []
    for line in src.splitlines():
        line = line.strip()
        if not line.startswith("["):
            continue
        try:
            row = json.loads(line.rstrip(","))
        except json.JSONDecodeError:
            continue
        if isinstance(row, list) and len(row) == 6 and all(isinstance(x, str) for x in row):
            rows.append(row)
    return rows


class LanguageCatalogTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.src = LANGS_JS.read_text(encoding="utf-8")
        cls.rows = _lang_rows(cls.src)
        cls.ids = [r[0] for r in cls.rows]

    def test_catalog_has_at_least_260_languages(self):
        self.assertGreaterEqual(len(set(self.ids)), 260)

    def test_rows_are_well_formed(self):
        for row in self.rows:
            self.assertTrue(row[0] and row[1] and row[2], row)
            self.assertRegex(row[0], r"^[a-z0-9_+#.-]+$", row[0])
            self.assertNotIn(",", row[2], "la extensión de icono debe ser una sola")

    def test_ids_are_unique(self):
        dupes = {i for i in self.ids if self.ids.count(i) > 1}
        self.assertEqual(dupes, set(), "ids duplicados: " + ", ".join(sorted(dupes)))

    def test_every_language_has_a_family(self):
        families = set(re.findall(r"families|const FAMILY", SYNTAX_JS.read_text(encoding="utf-8")))
        self.assertTrue(families)
        for row in self.rows:
            self.assertTrue(row[5], "sin familia: " + row[0])

    def test_extension_and_name_indexes_exist(self):
        self.assertIn("const BY_EXT", self.src)
        self.assertIn("const BY_NAME", self.src)
        self.assertIn("function forPath(path)", self.src)

    def test_filename_wins_over_extension(self):
        self.assertIn("if (BY_NAME[base]) return BY_NAME[base];", self.src)

    def test_composite_blade_suffix(self):
        self.assertIn('base.endsWith(".blade.php")', self.src)

    def test_known_filenames_are_mapped(self):
        names = set()
        for row in self.rows:
            names.update(row[4].lower().split())
        names.update(re.findall(r'"([^"]+)":\s*"[a-z0-9_]+"', self.src.split("Object.assign(BY_NAME")[1]))
        for name in ("dockerfile", "makefile", ".vimrc", "snakefile", "project.godot",
                     ".gitignore", "cargo.toml", "tsconfig.json", ".env", "codeowners"):
            self.assertIn(name, names, "nombre de archivo sin mapping: " + name)

    def test_modern_and_niche_languages_present(self):
        for lang in ("mojo", "odin", "gleam", "nix", "gdscript", "rescript", "raku",
                     "smalltalk", "forth", "vimscript", "yara", "qml", "tla",
                     "snakemake", "nextflow", "coffeescript", "haxe", "vala"):
            self.assertIn(lang, self.ids, lang)


class SyntaxFamilyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.src = SYNTAX_JS.read_text(encoding="utf-8")

    def test_at_least_93_families(self):
        names = re.findall(r"^\s{4}([a-z0-9_]+):\s*\[", self.src, re.M)
        self.assertGreaterEqual(len(set(names)), 93, len(set(names)))

    def test_new_families_have_keywords(self):
        for family in ("coffee", "gdscript", "haxe", "nix", "vim", "smalltalk", "forth",
                       "autohotkey", "gnuplot", "rebol", "qml", "odin", "gleam", "yara"):
            self.assertRegex(self.src, r"\b" + family + r":\s*\[", "familia sin reglas: " + family)

    def test_line_comment_tokens_for_unusual_languages(self):
        self.assertIn("LINE_COMMENT", self.src)
        for family in ("vim", "smalltalk", "forth", "autohotkey"):
            self.assertIn("LINE_COMMENT." + family + " =", self.src, family)

    def test_public_api(self):
        export = self.src.split("window.Syntax = {")[1].split("};")[0]
        for member in ("highlight", "families", "familyOf", "keywords"):
            self.assertIn(member, export, "no exportado: " + member)


class IconAssetTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.src = ICONS_JS.read_text(encoding="utf-8")
        cls.by_lang = _js_object(cls.src, "BY_LANG")
        cls.by_ext = _js_object(cls.src, "BY_EXT")
        cls.by_name = _js_object(cls.src, "BY_NAME")
        cls.folders = _js_object(cls.src, "FOLDERS")
        cls.files = {p.stem: p for p in ICONS_DIR.glob("*.svg")}
        cls.referenced = (set(cls.by_lang.values()) | set(cls.by_ext.values())
                          | set(cls.by_name.values()) | set(cls.folders.values())
                          | {"document", "folder", "folder-open"})

    def test_asset_pack_is_substantial(self):
        self.assertGreaterEqual(len(self.files), 300)

    def test_every_language_has_an_icon(self):
        rows = _lang_rows(LANGS_JS.read_text(encoding="utf-8"))
        missing = [r[0] for r in rows if r[0] not in self.by_lang]
        self.assertEqual(missing, [], "lenguajes sin icono: " + ", ".join(missing))

    def test_only_plaintext_uses_the_generic_document(self):
        generic = sorted(k for k, v in self.by_lang.items() if v == "document")
        self.assertEqual(generic, ["plaintext"])

    def test_every_referenced_icon_exists(self):
        missing = sorted(self.referenced - set(self.files))
        self.assertEqual(missing, [], "assets que faltan: " + ", ".join(missing))

    def test_no_orphan_assets(self):
        orphans = sorted(set(self.files) - self.referenced)
        self.assertEqual(orphans, [], "SVG sin referencia: " + ", ".join(orphans))

    def test_svgs_are_valid_and_light(self):
        for name, path in self.files.items():
            raw = path.read_text(encoding="utf-8")
            self.assertTrue(raw.strip(), name)
            self.assertLess(path.stat().st_size, 60_000, name + " demasiado grande")
            try:
                root = ET.fromstring(raw)
            except ET.ParseError as exc:  # pragma: no cover - fallo explícito
                self.fail(name + " no es XML válido: " + str(exc))
            self.assertTrue(root.tag.endswith("svg"), name)
            self.assertIn("viewBox", root.attrib, name + " sin viewBox (no escala)")

    def test_total_weight_is_reasonable(self):
        total = sum(p.stat().st_size for p in self.files.values())
        self.assertLess(total, 4 * 1024 * 1024, "pack de iconos demasiado pesado")

    def test_own_icons_are_marked(self):
        own = [n for n in self.files if n.startswith("ely-")]
        self.assertGreaterEqual(len(own), 10)
        for name in own:
            self.assertIn("<text", self.files[name].read_text(encoding="utf-8"))

    def test_non_code_filetypes_have_icons(self):
        for ext, expected in (("jpg", "image"), ("png", "image"), ("mp4", "video"),
                              ("mp3", "audio"), ("woff2", "font"), ("zip", "zip"),
                              ("pdf", "pdf"), ("pem", "certificate")):
            self.assertEqual(self.by_ext.get(ext), expected, ext)

    def test_special_filenames_have_icons(self):
        for name in ("dockerfile", "package.json", "readme.md", "license", ".env",
                     ".gitignore", "makefile", "cargo.toml"):
            self.assertIn(name, self.by_name, name)

    def test_folder_icons_by_name(self):
        for folder in ("src", "test", "tests", "docs", "assets", "node_modules",
                       ".github", "components", "public", "styles"):
            self.assertIn(folder, self.folders, folder)

    def test_folder_icons_exist_as_assets(self):
        for icon in set(self.folders.values()):
            self.assertTrue(icon.startswith("folder-"), icon)
            self.assertIn(icon, self.files, icon)

    def test_icons_api_surface(self):
        for member in ("count", "languages", "forLanguage", "iconName", "folderIcon",
                       "fileUrl", "folderUrl", "languageUrl", "file(", "language(", "folder("):
            self.assertIn(member, self.src, member)

    def test_icons_are_accessible_and_lazy(self):
        self.assertIn('node.setAttribute("aria-hidden", "true")', self.src)
        self.assertIn('node.loading = "lazy"', self.src)
        self.assertIn('node.alt = ""', self.src)

    def test_missing_asset_falls_back_instead_of_breaking(self):
        self.assertIn('node.src = "icons/document.svg"', self.src)
        self.assertIn('node.dataset.fallback', self.src)

    def test_resolution_order_name_ext_language(self):
        body = self.src.split("function iconName(name)")[1].split("function folderIcon")[0]
        self.assertLess(body.index("BY_NAME[b]"), body.index("BY_EXT[ext]"))
        self.assertLess(body.index("BY_EXT[ext]"), body.index("window.Languages"))

    def test_folder_fallback_open_and_closed(self):
        self.assertIn('return open ? "folder-open" : "folder";', self.src)


class ExplorerIconWiringTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.src = IDE_JS.read_text(encoding="utf-8")

    def test_folder_rows_pass_the_folder_name(self):
        self.assertIn('Icons.folder(open, 16, entry.path.split("/").pop())', self.src)

    def test_file_rows_use_the_path(self):
        self.assertIn("Icons.file(entry.path)", self.src)

    def test_tabs_respect_the_manual_language_mode(self):
        self.assertIn("state.langMode[path] ? Icons.language(state.langMode[path], 14) : Icons.file(path, 14)", self.src)

    def test_language_picker_uses_language_icons(self):
        self.assertEqual(self.src.count("Icons.language(l[0], 15)"), 2)
        self.assertNotIn('Icons.file("file." + l[2]', self.src)

    def test_dead_helper_removed(self):
        self.assertNotIn("function iconPath(", self.src)


class IconGalleryTests(unittest.TestCase):
    """La galería /icons.html permite ver y buscar todos los assets."""

    @classmethod
    def setUpClass(cls):
        cls.html = (FRONTEND / "icons.html").read_text(encoding="utf-8")
        cls.readme = (ICONS_DIR / "README.md").read_text(encoding="utf-8")

    def test_gallery_loads_the_catalog_and_the_icons(self):
        self.assertIn('src="js/languages.js"', self.html)
        self.assertIn('src="js/icons.js"', self.html)

    def test_gallery_groups_and_search(self):
        for group in ("all", "lang", "file", "folder"):
            self.assertIn('data-group="' + group + '"', self.html)
        self.assertIn('type="search"', self.html)
        self.assertIn('id="empty"', self.html)

    def test_gallery_is_bilingual(self):
        self.assertIn('data-es="', self.html)
        self.assertIn('data-en="', self.html)
        self.assertIn("ely.settings.v09", self.html)
        self.assertIn("document.documentElement.lang = lang", self.html)

    def test_gallery_shows_attribution(self):
        self.assertIn("Material Icon Theme", self.html)
        self.assertIn("MIT", self.html)
        self.assertIn("ely-", self.html)

    def test_maps_are_exposed_for_the_gallery(self):
        self.assertIn("catalog: { byLang: BY_LANG, byExt: BY_EXT, byName: BY_NAME, folders: FOLDERS }",
                      ICONS_JS.read_text(encoding="utf-8"))

    def test_license_ships_with_the_assets(self):
        lic = (ICONS_DIR / "LICENSE-material-icon-theme.txt").read_text(encoding="utf-8")
        self.assertIn("MIT", lic)
        self.assertIn("Material Extensions", lic)

    def test_readme_documents_the_pack(self):
        for topic in ("Material Icon Theme", "ely-", "BY_NAME", "Icons.folder", "viewBox"):
            self.assertIn(topic, self.readme, topic)


if __name__ == "__main__":
    unittest.main(verbosity=2)
