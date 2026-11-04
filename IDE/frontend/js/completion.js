/* Ely Cowork · Autocompletado en línea aceptado con Tab.
 *
 * Activado POR DEFECTO (ajuste `tabCompletion`). Muestra el resto de la
 * sugerencia como texto fantasma detrás del cursor, igual que las inline
 * completions de VS Code, y se acepta con Tab.
 *
 * Fuentes de sugerencias, en este orden:
 *   1. Proveedores de EXTENSIONES (ExtHost, con permiso "completions").
 *   2. Snippets del lenguaje (tabla incluida).
 *   3. Palabras del propio archivo (por frecuencia).
 *   4. Palabras clave del lenguaje.
 *
 * Teclas: Tab acepta · Esc descarta · Alt+] / Alt+[ cambian de candidato ·
 * Ctrl+Espacio fuerza la sugerencia. Si el modo "Tab mueve el foco" (Ctrl+M)
 * está activo, la accesibilidad manda y Tab no acepta nada.
 *
 * Expone window.Completion.
 */
(function () {
  "use strict";

  const T = (k, fallback) => {
    try { const v = window.t ? t(k) : k; return v === k && fallback ? fallback : v; }
    catch (e) { return fallback || key0(k); }
  };
  function key0(k) { return k; }

  /* ------------------------------------------------------------- snippets */
  const SNIPPETS = {
    python: [
      ["def", "def nombre(arg):\n    return arg\n", "función"],
      ["class", "class Nombre:\n    def __init__(self):\n        pass\n", "clase"],
      ["ifmain", "if __name__ == \"__main__\":\n    main()\n", "entrada"],
      ["for", "for elemento in elementos:\n    print(elemento)\n", "bucle"],
      ["try", "try:\n    pass\nexcept Exception as exc:\n    print(exc)\n", "try/except"],
      ["with", "with open(ruta, \"r\", encoding=\"utf-8\") as fh:\n    data = fh.read()\n", "with"],
      ["lambda", "lambda x: x", "anónima"],
      ["dataclass", "from dataclasses import dataclass\n\n\n@dataclass\nclass Dato:\n    nombre: str\n", "dataclass"]
    ],
    javascript: [
      ["function", "function nombre(arg) {\n  return arg;\n}", "función"],
      ["const", "const nombre = ", "constante"],
      ["arrow", "const nombre = (arg) => {\n  return arg;\n};", "flecha"],
      ["forof", "for (const item of items) {\n  console.log(item);\n}", "for…of"],
      ["async", "async function nombre() {\n  await algo();\n}", "asíncrona"],
      ["try", "try {\n  \n} catch (err) {\n  console.error(err);\n}", "try/catch"],
      ["import", "import {  } from \"\";", "import"],
      ["cl", "console.log()", "console.log"],
      ["class", "class Nombre {\n  constructor() {}\n}", "clase"]
    ],
    typescript: [
      ["interface", "interface Nombre {\n  id: string;\n}", "interfaz"],
      ["type", "type Nombre = {\n  id: string;\n};", "tipo"],
      ["function", "function nombre(arg: string): string {\n  return arg;\n}", "función"],
      ["async", "async function nombre(): Promise<void> {\n  await algo();\n}", "asíncrona"]
    ],
    html: [
      ["html5", "<!doctype html>\n<html lang=\"es\">\n<head>\n  <meta charset=\"utf-8\">\n  <title>Documento</title>\n</head>\n<body>\n  \n</body>\n</html>", "plantilla"],
      ["div", "<div class=\"\"></div>", "div"],
      ["a", "<a href=\"\"></a>", "enlace"],
      ["img", "<img src=\"\" alt=\"\">", "imagen"],
      ["form", "<form method=\"post\">\n  <input type=\"text\" name=\"campo\">\n  <button type=\"submit\">Enviar</button>\n</form>", "formulario"]
    ],
    css: [
      ["flex", "display: flex;\nalign-items: center;\ngap: 8px;", "flex"],
      ["grid", "display: grid;\ngrid-template-columns: repeat(2, 1fr);\ngap: 12px;", "grid"],
      ["media", "@media (max-width: 768px) {\n  \n}", "media query"],
      ["var", "var(--nombre)", "variable"]
    ],
    go: [
      ["func", "func nombre(arg string) string {\n\treturn arg\n}", "función"],
      ["main", "package main\n\nimport \"fmt\"\n\nfunc main() {\n\tfmt.Println(\"hola\")\n}", "programa"],
      ["iferr", "if err != nil {\n\treturn err\n}", "error"]
    ],
    rust: [
      ["fn", "fn nombre(arg: &str) -> String {\n    arg.to_string()\n}", "función"],
      ["main", "fn main() {\n    println!(\"hola\");\n}", "programa"],
      ["struct", "#[derive(Debug)]\nstruct Nombre {\n    campo: String,\n}", "struct"]
    ],
    java: [
      ["class", "public class Nombre {\n    public Nombre() {}\n}", "clase"],
      ["main", "public static void main(String[] args) {\n    \n}", "main"],
      ["sout", "System.out.println();", "imprimir"]
    ],
    c: [["main", "int main(int argc, char **argv) {\n    return 0;\n}", "main"],
        ["include", "#include <stdio.h>", "include"]],
    cpp: [["main", "int main() {\n    return 0;\n}", "main"],
          ["cout", "std::cout <<  << std::endl;", "cout"]],
    csharp: [["class", "public class Nombre\n{\n    public Nombre() { }\n}", "clase"],
             ["cw", "Console.WriteLine();", "imprimir"]],
    shell: [["for", "for f in *; do\n  echo \"$f\"\ndone", "bucle"],
            ["if", "if [ -f \"$1\" ]; then\n  echo ok\nfi", "condicional"],
            ["shebang", "#!/usr/bin/env bash\nset -euo pipefail\n", "cabecera"]],
    sql: [["select", "SELECT *\nFROM tabla\nWHERE condicion;", "consulta"],
          ["join", "INNER JOIN otra ON otra.id = tabla.otra_id", "join"]],
    json: [["object", "{\n  \"clave\": \"valor\"\n}", "objeto"]],
    markdown: [["code", "```python\n\n```", "bloque de código"],
               ["table", "| Columna | Columna |\n|---|---|\n| dato | dato |", "tabla"]]
  };
  SNIPPETS.kotlin = [
    ["fun", "fun nombre(arg: String): String {\n    return arg\n}", "función"],
    ["main", "fun main() {\n    println(\"hola\")\n}", "programa"],
    ["class", "data class Nombre(val id: String)", "clase de datos"],
    ["when", "when (valor) {\n    1 -> println(1)\n    else -> println(0)\n}", "when"]
  ];
  SNIPPETS.swift = [
    ["func", "func nombre(arg: String) -> String {\n    return arg\n}", "función"],
    ["struct", "struct Nombre {\n    let id: String\n}", "struct"],
    ["guard", "guard let valor = opcional else { return }", "guard"],
    ["class", "class Nombre {\n    init() {}\n}", "clase"]
  ];
  SNIPPETS.dart = [
    ["widget", "class Nombre extends StatelessWidget {\n  const Nombre({super.key});\n\n  @override\n  Widget build(BuildContext context) {\n    return Container();\n  }\n}", "widget"],
    ["main", "void main() {\n  runApp(const MyApp());\n}", "programa"],
    ["future", "Future<void> nombre() async {\n  await algo();\n}", "asíncrona"]
  ];
  SNIPPETS.php = [
    ["function", "function nombre($arg) {\n    return $arg;\n}", "función"],
    ["class", "class Nombre\n{\n    public function __construct() {}\n}", "clase"],
    ["foreach", "foreach ($items as $item) {\n    echo $item;\n}", "bucle"]
  ];
  SNIPPETS.ruby = [
    ["def", "def nombre(arg)\n  arg\nend", "método"],
    ["class", "class Nombre\n  def initialize\n  end\nend", "clase"],
    ["each", "items.each do |item|\n  puts item\nend", "iterador"]
  ];
  SNIPPETS.lua = [
    ["function", "function nombre(arg)\n  return arg\nend", "función"],
    ["for", "for i = 1, 10 do\n  print(i)\nend", "bucle"],
    ["local", "local nombre = ", "variable local"]
  ];
  SNIPPETS.sql = [
    ["select", "SELECT *\nFROM tabla\nWHERE condicion;", "consulta"],
    ["join", "INNER JOIN otra ON otra.id = tabla.otra_id", "join"],
    ["create", "CREATE TABLE tabla (\n  id INTEGER PRIMARY KEY,\n  nombre TEXT NOT NULL\n);", "crear tabla"],
    ["insert", "INSERT INTO tabla (campo) VALUES (valor);", "insertar"]
  ];
  SNIPPETS.dockerfile = [
    ["from", "FROM python:3.12-slim", "imagen base"],
    ["run", "RUN apt-get update && apt-get install -y ", "comando"],
    ["copy", "COPY . /app", "copiar"],
    ["cmd", "CMD [\"python\", \"main.py\"]", "arranque"],
    ["workdir", "WORKDIR /app", "directorio"]
  ];
  SNIPPETS.terraform = [
    ["resource", "resource \"tipo\" \"nombre\" {\n  \n}", "recurso"],
    ["variable", "variable \"nombre\" {\n  type    = string\n  default = \"\"\n}", "variable"],
    ["output", "output \"nombre\" {\n  value = \n}", "salida"],
    ["module", "module \"nombre\" {\n  source = \"\"\n}", "módulo"]
  ];
  SNIPPETS.yaml = [
    ["service", "services:\n  app:\n    image: \n    ports:\n      - \"8080:8080\"", "servicio"],
    ["job", "jobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4", "job de CI"]
  ];
  SNIPPETS.solidity = [
    ["contract", "pragma solidity ^0.8.20;\n\ncontract Nombre {\n    \n}", "contrato"],
    ["function", "function nombre() public view returns (uint256) {\n    return 0;\n}", "función"],
    ["mapping", "mapping(address => uint256) public balances;", "mapping"],
    ["event", "event Transfer(address indexed from, address indexed to, uint256 value);", "evento"]
  ];
  SNIPPETS.elixir = [
    ["defmodule", "defmodule Nombre do\n  def nombre do\n    :ok\n  end\nend", "módulo"],
    ["def", "def nombre(arg) do\n  arg\nend", "función"],
    ["case", "case valor do\n  {:ok, v} -> v\n  _ -> :error\nend", "case"]
  ];
  SNIPPETS.haskell = [
    ["main", "main :: IO ()\nmain = putStrLn \"hola\"", "programa"],
    ["data", "data Nombre = Nombre { campo :: String }", "tipo"],
    ["fn", "nombre :: String -> String\nnombre x = x", "función"]
  ];
  SNIPPETS.scala = [
    ["object", "object Nombre extends App {\n  println(\"hola\")\n}", "objeto"],
    ["case", "case class Nombre(id: String)", "case class"],
    ["def", "def nombre(arg: String): String = arg", "función"]
  ];
  SNIPPETS.perl = [
    ["sub", "sub nombre {\n    my ($arg) = @_;\n    return $arg;\n}", "subrutina"],
    ["foreach", "foreach my $item (@items) {\n    print $item;\n}", "bucle"]
  ];
  SNIPPETS.r = [
    ["function", "nombre <- function(arg) {\n  arg\n}", "función"],
    ["library", "library(dplyr)", "cargar paquete"],
    ["readcsv", "datos <- read.csv(\"archivo.csv\")", "leer CSV"]
  ];
  SNIPPETS.julia = [
    ["function", "function nombre(arg)\n    return arg\nend", "función"],
    ["for", "for i in 1:10\n    println(i)\nend", "bucle"]
  ];
  SNIPPETS.latex = [
    ["document", "\\documentclass{article}\n\\begin{document}\n\n\\end{document}", "documento"],
    ["section", "\\section{Título}", "sección"],
    ["itemize", "\\begin{itemize}\n  \\item \n\\end{itemize}", "lista"]
  ];
  SNIPPETS.jsx = SNIPPETS.javascript;
  SNIPPETS.tsx = SNIPPETS.typescript;
  SNIPPETS.mjs = SNIPPETS.javascript;
  SNIPPETS.jsonc = SNIPPETS.json;
  SNIPPETS.json5 = SNIPPETS.json;
  SNIPPETS.mysql = SNIPPETS.sql;
  SNIPPETS.pgsql = SNIPPETS.sql;
  SNIPPETS.tsql = SNIPPETS.sql;
  SNIPPETS.plsql = SNIPPETS.sql;
  SNIPPETS.sqlite = SNIPPETS.sql;
  SNIPPETS.scss = SNIPPETS.css;
  SNIPPETS.less = SNIPPETS.css;
  SNIPPETS.sass = SNIPPETS.css;
  SNIPPETS.bash = SNIPPETS.shell;
  SNIPPETS.zsh = SNIPPETS.shell;
  SNIPPETS.fish = SNIPPETS.shell;
  SNIPPETS.hcl = SNIPPETS.terraform;
  SNIPPETS.bicep = SNIPPETS.terraform;
  SNIPPETS.objectivec = SNIPPETS.c;
  SNIPPETS.cuda = SNIPPETS.cpp;
  SNIPPETS.metal = SNIPPETS.cpp;
  SNIPPETS.vyper = SNIPPETS.python;
  SNIPPETS.cairo = SNIPPETS.rust;
  SNIPPETS.move = SNIPPETS.rust;
  SNIPPETS.gradle = SNIPPETS.groovy || SNIPPETS.java;
  SNIPPETS.groovy = SNIPPETS.java;
  SNIPPETS.vue = SNIPPETS.html;
  SNIPPETS.svelte = SNIPPETS.html;
  SNIPPETS.astro = SNIPPETS.html;
  SNIPPETS.mdx = SNIPPETS.markdown;

  const KEYWORDS = {
    python: "def class return import from as if elif else for while try except finally with lambda yield raise pass break continue global nonlocal assert async await None True False and or not in is".split(" "),
    javascript: "const let var function return if else for while do switch case break continue class extends new this typeof instanceof try catch finally throw async await yield import export from default null undefined true false".split(" "),
    typescript: "interface type enum implements readonly private public protected abstract namespace declare as keyof unknown never any string number boolean void".split(" "),
    go: "package import func var const type struct interface map chan go defer if else for range return switch case break continue nil true false".split(" "),
    rust: "fn let mut const struct enum impl trait pub use mod match if else for while loop return self Some None Ok Err".split(" "),
    java: "public private protected class interface extends implements static final void int String boolean new return if else for while try catch throw throws import package".split(" "),
    csharp: "public private protected internal class interface struct enum static readonly const void var new return if else foreach for while using namespace async await Task".split(" "),
    shell: "if then else elif fi for while do done case esac function return export local set echo read".split(" "),
    sql: "SELECT FROM WHERE INSERT INTO VALUES UPDATE SET DELETE JOIN INNER LEFT RIGHT OUTER ON GROUP BY ORDER HAVING LIMIT CREATE TABLE ALTER DROP INDEX".split(" ")
  };
  KEYWORDS.jsx = KEYWORDS.javascript;
  KEYWORDS.tsx = KEYWORDS.typescript;

  /* --------------------------------------------------------------- estado */
  const state = {
    ta: null, wrap: null, ghost: null, badge: null,
    language: "plaintext", items: [], index: 0,
    prefix: "", anchor: 0, visible: false, timer: null, seq: 0,
    onChange: null, enabled: true, lastAccepted: null
  };

  function enabled() {
    if (window.Settings && Settings.get) {
      const value = Settings.get("tabCompletion");
      if (value === false) return false;
    }
    return state.enabled !== false;
  }

  function setEnabled(value) {
    state.enabled = !!value;
    if (window.Settings && Settings.set) Settings.set({ tabCompletion: !!value });
    if (!value) dismiss();
    document.dispatchEvent(new CustomEvent("completion:change", { detail: { enabled: !!value } }));
  }

  /* -------------------------------------------------------------- utilidades */
  function prefixAt(text, pos) {
    const before = text.slice(0, pos);
    const match = before.match(/[A-Za-z_][A-Za-z0-9_]*$/);
    return match ? match[0] : "";
  }

  function lineIndentAt(text, pos) {
    const start = text.lastIndexOf("\n", pos - 1) + 1;
    const line = text.slice(start, pos);
    const match = line.match(/^[ \t]*/);
    return match ? match[0] : "";
  }

  function bufferWords(text, prefix) {
    const counts = new Map();
    const re = /[A-Za-z_][A-Za-z0-9_]{2,}/g;
    let m;
    while ((m = re.exec(text))) {
      const word = m[0];
      if (word === prefix || !word.toLowerCase().startsWith(prefix.toLowerCase())) continue;
      counts.set(word, (counts.get(word) || 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 6)
      .map(([word, count]) => ({
        label: word, insertText: word, detail: T("cmp.fromFile", "en este archivo") + " ×" + count,
        kind: "word", replacePrefix: true, source: T("cmp.buffer", "Archivo")
      }));
  }

  /* Palabras clave: tabla propia y, si no, la familia del resaltador
     (así los más de 160 modos tienen sugerencias sin duplicar tablas). */
  function keywordsFor(language) {
    if (KEYWORDS[language]) return KEYWORDS[language];
    if (window.Syntax && Syntax.keywords) {
      try { return window.Syntax.keywords(language); } catch (e) { return []; }
    }
    return [];
  }

  function localItems(text, prefix, language) {
    const out = [];
    const snippets = SNIPPETS[language] || [];
    snippets.forEach(([label, insertText, detail]) => {
      if (label.startsWith(prefix.toLowerCase()) && label !== prefix) {
        out.push({ label, insertText, detail, kind: "snippet", replacePrefix: true, source: T("cmp.snippet", "Snippet") });
      }
    });
    keywordsFor(language).forEach((word) => {
      if (word.length > 2 && word.toLowerCase().startsWith(prefix.toLowerCase()) && word !== prefix) {
        out.push({ label: word, insertText: word, detail: T("cmp.keyword", "palabra clave"), kind: "keyword", replacePrefix: true, source: T("cmp.language", "Lenguaje") });
      }
    });
    out.push.apply(out, bufferWords(text, prefix));
    return out;
  }

  /* ------------------------------------------------------------- posición */
  function caretCoords(ta) {
    const style = window.getComputedStyle(ta);
    const mirror = document.createElement("div");
    ["fontFamily", "fontSize", "fontWeight", "fontStyle", "letterSpacing", "wordSpacing",
      "lineHeight", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
      "borderWidth", "boxSizing", "tabSize"].forEach((prop) => { mirror.style[prop] = style[prop]; });
    mirror.style.position = "absolute";
    mirror.style.visibility = "hidden";
    mirror.style.whiteSpace = ta.wrap === "off" ? "pre" : "pre-wrap";
    mirror.style.wordBreak = ta.wrap === "off" ? "normal" : "break-word";
    mirror.style.width = (ta.clientWidth || 600) + "px";
    mirror.style.top = "0";
    mirror.style.left = "-9999px";
    mirror.textContent = ta.value.slice(0, ta.selectionStart);
    const marker = document.createElement("span");
    marker.textContent = "\u200b";
    mirror.appendChild(marker);
    document.body.appendChild(mirror);
    const base = mirror.getBoundingClientRect();
    const rect = marker.getBoundingClientRect();
    const lineHeight = parseFloat(style.lineHeight) || (parseFloat(style.fontSize) || 13) * 1.5;
    const coords = { x: rect.left - base.left, y: rect.top - base.top, lineHeight };
    mirror.remove();
    return coords;
  }

  /* --------------------------------------------------------------- pintado */
  function ensureGhost() {
    if (state.ghost && state.ghost.parentNode) return state.ghost;
    state.ghost = document.createElement("span");
    state.ghost.className = "code-ghost";
    state.ghost.setAttribute("aria-hidden", "true");
    state.badge = document.createElement("span");
    state.badge.className = "code-ghost-badge";
    state.badge.setAttribute("aria-hidden", "true");
    if (state.wrap) {
      state.wrap.appendChild(state.ghost);
      state.wrap.appendChild(state.badge);
    }
    return state.ghost;
  }

  function paint() {
    const item = state.items[state.index];
    if (!item || !state.ta || !state.wrap) { dismiss(); return; }
    ensureGhost();
    const rest = item.replacePrefix === false
      ? item.insertText
      : item.insertText.slice(state.prefix.length);
    if (!rest) { dismiss(); return; }
    const firstLine = rest.split("\n")[0];
    const multiline = rest.indexOf("\n") >= 0;
    state.ghost.textContent = firstLine + (multiline ? " ⏎" : "");
    const coords = caretCoords(state.ta);
    const gutter = 52;
    state.ghost.style.left = (gutter + coords.x - state.ta.scrollLeft) + "px";
    state.ghost.style.top = (coords.y - state.ta.scrollTop) + "px";
    state.ghost.style.lineHeight = coords.lineHeight + "px";
    state.badge.textContent = "Tab · " + (state.index + 1) + "/" + state.items.length +
      (item.detail ? " · " + item.detail : "");
    state.badge.style.left = (gutter + coords.x - state.ta.scrollLeft) + "px";
    state.badge.style.top = (coords.y - state.ta.scrollTop + coords.lineHeight) + "px";
    state.visible = true;
    state.ta.setAttribute("aria-describedby", "a11y-editor-hint cmp-live");
    announce(item);
  }

  let lastAnnounced = "";
  function announce(item) {
    if (!window.A11y || !A11y.isScreenReader()) return;
    const text = T("cmp.suggestion", "Sugerencia") + ": " + item.label + ". " + T("cmp.pressTab", "Tab para aceptar");
    if (text === lastAnnounced) return;
    lastAnnounced = text;
    A11y.announce(text);
  }

  function dismiss() {
    state.visible = false;
    state.items = [];
    state.index = 0;
    lastAnnounced = "";
    if (state.ghost) { state.ghost.textContent = ""; state.ghost.style.left = "-9999px"; }
    if (state.badge) { state.badge.textContent = ""; state.badge.style.left = "-9999px"; }
    if (state.ta) state.ta.setAttribute("aria-describedby", "a11y-editor-hint");
  }

  /* ------------------------------------------------------------- sugerencias */
  async function compute(force) {
    const ta = state.ta;
    if (!ta || !enabled()) { dismiss(); return; }
    if (window.A11y && A11y.get && A11y.get("tabFocusMode")) { dismiss(); return; }
    if (ta.selectionStart !== ta.selectionEnd) { dismiss(); return; }
    const pos = ta.selectionStart;
    const prefix = prefixAt(ta.value, pos);
    if (!prefix && !force) { dismiss(); return; }
    if (prefix.length < 1) { dismiss(); return; }
    const token = ++state.seq;
    const text = ta.value;
    const language = state.language;
    const indent = lineIndentAt(text, pos);
    const lineIndex = text.slice(0, pos).split("\n").length - 1;
    const lineText = text.slice(text.lastIndexOf("\n", pos - 1) + 1).split("\n")[0];

    let external = [];
    if (window.ExtHost) {
      try {
        external = await ExtHost.completionsFor({
          text, prefix, language, position: pos, lineIndex, lineText, indent
        });
      } catch (e) { external = []; }
    }
    if (token !== state.seq) return;                 // llegó tarde: descartada
    const local = localItems(text, prefix, language);
    const seen = new Set();
    const items = external.concat(local).filter((item) => {
      /* Una sola entrada por etiqueta: la primera fuente gana. */
      const key = String(item.label || "").toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return item.insertText && item.insertText !== prefix;
    }).slice(0, 12);
    if (!items.length) { dismiss(); return; }
    state.items = items;
    state.index = 0;
    state.prefix = prefix;
    state.anchor = pos;
    state.indent = indent;
    paint();
  }

  function schedule(force) {
    clearTimeout(state.timer);
    state.timer = setTimeout(() => compute(force), force ? 0 : 110);
  }

  /* ---------------------------------------------------------------- aceptar */
  function accept() {
    const item = state.items[state.index];
    if (!item || !state.ta) return false;
    const ta = state.ta;
    const pos = ta.selectionStart;
    const start = item.replacePrefix === false ? pos : pos - state.prefix.length;
    let insert = item.insertText;
    /* Las líneas siguientes heredan la sangría de la línea actual. */
    if (insert.indexOf("\n") >= 0 && state.indent) {
      insert = insert.split("\n").map((line, i) => (i === 0 ? line : state.indent + line)).join("\n");
    }
    ta.setRangeText(insert, start, pos, "end");
    /* Coloca el cursor en el primer hueco natural (nombre, comillas, paréntesis). */
    const hole = insert.indexOf("nombre") >= 0 ? insert.indexOf("nombre")
      : insert.indexOf("\"\"") >= 0 ? insert.indexOf("\"\"") + 1
        : insert.indexOf("()") >= 0 ? insert.indexOf("()") + 1 : -1;
    if (hole >= 0) {
      const caret = start + hole;
      const width = insert.indexOf("nombre") >= 0 ? 6 : 0;
      ta.setSelectionRange(caret, caret + width);
    }
    state.lastAccepted = item.label;
    dismiss();
    ta.dispatchEvent(new Event("input", { bubbles: true }));
    if (state.onAccept) state.onAccept(item);
    if (window.A11y) A11y.announce(T("cmp.accepted", "Sugerencia aceptada") + ": " + item.label);
    return true;
  }

  function cycle(step) {
    if (!state.visible || !state.items.length) return false;
    state.index = (state.index + step + state.items.length) % state.items.length;
    paint();
    return true;
  }

  /* ----------------------------------------------------------------- enlace */
  function onKeydown(event) {
    if (!state.ta || event.target !== state.ta) return;
    if (!enabled()) return;
    const tabFocus = window.A11y && A11y.get && A11y.get("tabFocusMode");
    if (event.key === "Tab" && !event.shiftKey && state.visible && !tabFocus) {
      event.preventDefault();
      event.stopPropagation();                 // gana al Tab de indentar
      accept();
      return;
    }
    if (event.key === "Escape" && state.visible) {
      event.preventDefault();
      event.stopPropagation();
      dismiss();
      return;
    }
    if (event.altKey && (event.key === "]" || event.key === "[") && state.visible) {
      event.preventDefault();
      event.stopPropagation();
      cycle(event.key === "]" ? 1 : -1);
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.code === "Space") {
      event.preventDefault();
      schedule(true);
      return;
    }
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"].includes(event.key)) {
      dismiss();
    }
  }

  function attach(textarea, opts) {
    const o = opts || {};
    detach();
    state.ta = textarea;
    state.wrap = textarea.closest(".code-wrap") || textarea.parentNode;
    state.language = o.language || "plaintext";
    state.onAccept = o.onAccept || null;
    state.enabled = o.enabled !== false;
    textarea.addEventListener("keydown", onKeydown, true);   // captura: antes del IDE
    textarea.addEventListener("input", () => schedule(false));
    textarea.addEventListener("click", () => dismiss());
    textarea.addEventListener("blur", () => setTimeout(dismiss, 120));
    textarea.addEventListener("scroll", () => { if (state.visible) paint(); });
    /* Región viva propia para lectores de pantalla. */
    if (!document.getElementById("cmp-live")) {
      const live = document.createElement("div");
      live.id = "cmp-live";
      live.className = "a11y-sr-only";
      live.setAttribute("aria-live", "polite");
      document.body.appendChild(live);
    }
    return Completion;
  }

  function detach() {
    if (state.ta) state.ta.removeEventListener("keydown", onKeydown, true);
    if (state.ghost && state.ghost.parentNode) state.ghost.parentNode.removeChild(state.ghost);
    if (state.badge && state.badge.parentNode) state.badge.parentNode.removeChild(state.badge);
    state.ghost = null; state.badge = null; state.ta = null; state.wrap = null;
    dismiss();
  }

  const Completion = {
    state, attach, detach, accept, dismiss, cycle,
    trigger: () => schedule(true),
    setLanguage(lang) { state.language = lang || "plaintext"; dismiss(); },
    enabled, setEnabled,
    isVisible: () => state.visible,
    items: () => state.items.slice(),
    current: () => state.items[state.index] || null,
    snippets: SNIPPETS,
    /* Para pruebas y para la vista de ajustes. */
    _localItems: localItems,
    _prefixAt: prefixAt
  };

  window.Completion = Completion;
})();
