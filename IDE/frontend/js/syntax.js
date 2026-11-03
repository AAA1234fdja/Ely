/* Ely Cowork · resaltador de sintaxis ligero (colores tipo VS Code Dark+).
 * Sin dependencias: tokeniza por reglas y envuelve en spans con clases tok-*.
 * Expone window.Syntax.highlight(code, lang) -> HTML seguro.
 */
(function () {
  "use strict";

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  const KW = {
    js: "const let var function return if else for while do switch case break continue new class extends super this typeof instanceof in of try catch finally throw async await yield import export from default delete void static get set".split(" "),
    python: "def return if elif else for while break continue class import from as with try except finally raise lambda pass yield global nonlocal assert del in is not and or None True False async await".split(" "),
    rust: "fn let mut const static if else match loop while for in break continue return struct enum impl trait pub use mod crate self Self as where dyn move ref unsafe async await".split(" "),
    go: "func package import var const type struct interface map chan if else for range switch case default break continue return go defer select nil true false".split(" "),
    java: "public private protected class interface extends implements static final void int long double float boolean char String new return if else for while do switch case break continue try catch finally throw throws import package this super null true false".split(" "),
    c: "int long short char float double void unsigned signed struct union enum typedef static const if else for while do switch case break continue return sizeof include define NULL".split(" "),
    php: "function echo print return if else elseif foreach for while do switch case break continue class public private protected static new try catch finally throw use namespace null true false array".split(" "),
    ruby: "def end return if elsif else unless while until for in do break next class module require require_relative attr_accessor attr_reader attr_writer nil true false self yield begin rescue ensure".split(" "),
    sql: "SELECT FROM WHERE INSERT INTO VALUES UPDATE SET DELETE CREATE TABLE ALTER DROP INDEX JOIN LEFT RIGHT INNER OUTER ON GROUP BY ORDER HAVING LIMIT DISTINCT AS AND OR NOT NULL PRIMARY KEY FOREIGN REFERENCES COUNT SUM AVG MIN MAX".split(" ")
  };
  KW.javascript = KW.js; KW.typescript = KW.js; KW.jsx = KW.js; KW.tsx = KW.js;
  KW.cpp = KW.c; KW.shell = "if then else elif fi for while do done case esac function echo exit return local export set".split(" ");
  KW.bash = KW.shell; KW.sh = KW.shell;

  function rulesFor(lang) {
    const l = (lang || "").toLowerCase();
    const rules = [];
    if (l === "html" || l === "xml" || l === "svg") {
      rules.push(["com", /<!--[\s\S]*?-->/y]);
      rules.push(["tag", /<\/?[A-Za-z][\w-]*/y]);
      rules.push(["str", /"[^"]*"|'[^']*'/y]);
      rules.push(["attr", /[A-Za-z-]+(?==)/y]);
      rules.push(["punct", /[<>\/=]/y]);
      return rules;
    }
    if (l === "css" || l === "scss") {
      rules.push(["com", /\/\*[\s\S]*?\*\//y]);
      rules.push(["str", /"[^"]*"|'[^']*'/y]);
      rules.push(["num", /#[0-9a-fA-F]{3,8}\b|\b\d+(\.\d+)?(px|em|rem|%|vh|vw|s|ms)?\b/y]);
      rules.push(["attr", /[A-Za-z-]+(?=\s*:)/y]);
      rules.push(["tag", /[.#]?[A-Za-z][\w-]*(?=[^{}]*\{)/y]);
      return rules;
    }
    if (l === "json") {
      rules.push(["attr", /"[^"]*"(?=\s*:)/y]);
      rules.push(["str", /"[^"]*"/y]);
      rules.push(["num", /-?\b\d+(\.\d+)?\b/y]);
      rules.push(["bool", /\b(true|false|null)\b/y]);
      return rules;
    }
    if (l === "markdown" || l === "md") {
      rules.push(["kw", /^#{1,6}[^\n]*/my]);
      rules.push(["str", /`[^`]*`|\*\*[^*]+\*\*|\*[^*]+\*/y]);
      rules.push(["com", /^>[^\n]*/my]);
      rules.push(["fn", /\[[^\]]*\]\([^)]*\)/y]);
      return rules;
    }
    // Lenguajes de programación genéricos
    const hash = ["python", "shell", "bash", "sh", "ruby", "yaml", "yml", "toml"].includes(l);
    rules.push(["com", /\/\*[\s\S]*?\*\//y]);
    rules.push(["com", hash ? /#[^\n]*/y : /\/\/[^\n]*/y]);
    rules.push(["str", /"""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`/y]);
    rules.push(["num", /\b\d+(\.\d+)?\b/y]);
    rules.push(["bool", /\b(true|false|None|NULL|null|nil)\b/y]);
    const kws = KW[l] || KW.js;
    const kwRe = new RegExp("\\b(?:" + kws.join("|") + ")\\b", "y");
    rules.push(["kw", kwRe]);
    rules.push(["fn", /[A-Za-z_]\w*(?=\s*\()/y]);
    rules.push(["attr", /@[A-Za-z_]\w*/y]);
    return rules;
  }

  function highlight(code, lang) {
    const rules = rulesFor(lang);
    let out = "";
    let i = 0;
    const n = code.length;
    while (i < n) {
      let matched = false;
      for (const [cls, re] of rules) {
        re.lastIndex = i;
        const m = re.exec(code);
        if (m && m.index === i && m[0].length) {
          out += '<span class="tok-' + cls + '">' + esc(m[0]) + "</span>";
          i += m[0].length;
          matched = true;
          break;
        }
      }
      if (!matched) { out += esc(code[i]); i += 1; }
    }
    return out;
  }

  window.Syntax = { highlight };
})();
