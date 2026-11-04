/* Ely Cowork · catálogo de lenguajes del editor.
 *
 * Fuente única para: selector de modo de lenguaje, detección por extensión y
 * por nombre de archivo, iconos, resaltado (syntax.js) y autocompletado
 * (completion.js). Formato de cada entrada:
 *   [id, etiqueta, extensiónDeIcono, extensiones, nombresDeArchivo, familia]
 *
 * La familia agrupa reglas de resaltado y snippets. Cuando dos lenguajes
 * comparten extensión se sigue el criterio de VS Code (p. ej. .m → Objective-C)
 * y el otro queda disponible en el selector manual.
 */
(function () {
  "use strict";

  const L = [
    /* --- texto y datos --- */
    ["plaintext", "Plain Text", "txt", "txt text", "", "text"],
    ["log", "Log", "log", "log", "", "log"],
    ["csv", "CSV", "csv", "csv", "", "csv"],
    ["tsv", "TSV", "tsv", "tsv tab", "", "csv"],
    ["json", "JSON", "json", "json map webmanifest", "package.json package-lock.json composer.json", "json"],
    ["jsonc", "JSON with Comments", "json", "jsonc", "tsconfig.json jsconfig.json .eslintrc.json settings.json", "json"],
    ["json5", "JSON5", "json", "json5", "", "json"],
    ["jsonl", "JSON Lines", "json", "jsonl ndjson", "", "json"],
    ["ipynb", "Jupyter Notebook", "ipynb", "ipynb", "", "json"],
    ["yaml", "YAML", "yml", "yml yaml", ".gitlab-ci.yml docker-compose.yml compose.yaml", "yaml"],
    ["toml", "TOML", "toml", "toml", "Pipfile poetry.lock Cargo.toml pyproject.toml", "toml"],
    ["ini", "Ini", "ini", "ini cfg conf", ".editorconfig .npmrc", "ini"],
    ["properties", "Java Properties", "properties", "properties", "", "ini"],
    ["dotenv", "Environment (.env)", "env", "env", ".env .env.local .env.production .env.example", "ini"],
    ["xml", "XML", "xml", "xml xsd xsl xslt plist rss atom csproj vbproj props targets", "", "markup"],
    ["svg", "SVG", "svg", "svg", "", "markup"],
    ["diff", "Diff / Patch", "diff", "diff patch", "", "diff"],
    ["http", "HTTP Requests", "http", "http rest", "", "http"],
    ["gitignore", "Git Ignore", "git", "ignore", ".gitignore .dockerignore .eslintignore .prettierignore", "ini"],
    ["codeowners", "CODEOWNERS", "txt", "", "CODEOWNERS", "ini"],

    /* --- web --- */
    ["html", "HTML", "html", "html htm xhtml", "", "markup"],
    ["css", "CSS", "css", "css", "", "css"],
    ["scss", "SCSS", "scss", "scss", "", "css"],
    ["sass", "Sass", "sass", "sass", "", "css"],
    ["less", "Less", "less", "less", "", "css"],
    ["stylus", "Stylus", "styl", "styl", "", "css"],
    ["postcss", "PostCSS", "css", "pcss", "", "css"],
    ["javascript", "JavaScript", "js", "js mjs cjs", "", "js"],
    ["jsx", "JavaScript JSX", "jsx", "jsx", "", "js"],
    ["typescript", "TypeScript", "ts", "ts mts cts", "", "ts"],
    ["tsx", "TypeScript JSX", "tsx", "tsx", "", "ts"],
    ["vue", "Vue", "vue", "vue", "", "vue"],
    ["svelte", "Svelte", "svelte", "svelte", "", "svelte"],
    ["astro", "Astro", "astro", "astro", "", "astro"],
    ["mdx", "MDX", "mdx", "mdx", "", "markdown"],
    ["handlebars", "Handlebars", "hbs", "hbs handlebars", "", "template"],
    ["mustache", "Mustache", "mustache", "mustache", "", "template"],
    ["ejs", "EJS", "ejs", "ejs", "", "template"],
    ["pug", "Pug", "pug", "pug jade", "", "template"],
    ["jinja", "Jinja", "jinja", "jinja jinja2 j2", "", "template"],
    ["twig", "Twig", "twig", "twig", "", "template"],
    ["blade", "Laravel Blade", "blade", "blade.php", "", "template"],
    ["razor", "Razor (cshtml)", "cshtml", "cshtml razor", "", "template"],
    ["erb", "Ruby ERB", "erb", "erb rhtml", "", "template"],
    ["haml", "Haml", "haml", "haml", "", "template"],
    ["liquid", "Liquid", "liquid", "liquid", "", "template"],
    ["nunjucks", "Nunjucks", "njk", "njk", "", "template"],
    ["graphql", "GraphQL", "graphql", "graphql gql", "", "graphql"],
    ["wasm", "WebAssembly Text", "wat", "wat wast", "", "wat"],

    /* --- sistemas --- */
    ["c", "C", "c", "c h", "", "c"],
    ["cpp", "C++", "cpp", "cpp cc cxx c++ hpp hh hxx inl ipp", "", "c"],
    ["csharp", "C#", "cs", "cs csx", "", "csharp"],
    ["objectivec", "Objective-C", "m", "m", "", "c"],
    ["objectivecpp", "Objective-C++", "mm", "mm", "", "c"],
    ["rust", "Rust", "rs", "rs", "", "rust"],
    ["go", "Go", "go", "go", "go.mod go.sum", "go"],
    ["zig", "Zig", "zig", "zig", "", "zig"],
    ["nim", "Nim", "nim", "nim nims", "", "nim"],
    ["d", "D", "d", "d di", "", "d"],
    ["v", "V", "v", "vsh", "", "v"],
    ["crystal", "Crystal", "cr", "cr", "", "crystal"],
    ["assembly", "Assembly (x86)", "asm", "asm s nasm", "", "asm"],
    ["llvm", "LLVM IR", "ll", "ll", "", "llvm"],
    ["cuda", "CUDA C++", "cu", "cu cuh", "", "c"],
    ["opencl", "OpenCL", "cl", "cl", "", "c"],
    ["glsl", "GLSL", "glsl", "glsl vert frag geom comp", "", "shader"],
    ["hlsl", "HLSL", "hlsl", "hlsl fx", "", "shader"],
    ["wgsl", "WGSL", "wgsl", "wgsl", "", "shader"],
    ["shaderlab", "ShaderLab (Unity)", "shader", "shader", "", "shader"],
    ["metal", "Metal", "metal", "metal", "", "c"],

    /* --- JVM y .NET --- */
    ["java", "Java", "java", "java", "", "java"],
    ["kotlin", "Kotlin", "kt", "kt kts", "", "kotlin"],
    ["scala", "Scala", "scala", "scala sc", "", "scala"],
    ["groovy", "Groovy", "groovy", "groovy gvy", "Jenkinsfile", "groovy"],
    ["clojure", "Clojure", "clj", "clj cljs cljc edn", "", "lisp"],
    ["gradle", "Gradle", "gradle", "gradle", "build.gradle settings.gradle", "groovy"],
    ["fsharp", "F#", "fs", "fs fsi fsx", "", "ml"],
    ["vb", "Visual Basic .NET", "vb", "vb", "", "basic"],

    /* --- scripting --- */
    ["python", "Python", "py", "py pyi pyw", "requirements.txt", "python"],
    ["ruby", "Ruby", "rb", "rb rake gemspec", "Gemfile Rakefile", "ruby"],
    ["php", "PHP", "php", "php php4 php5 phtml", "", "php"],
    ["perl", "Perl", "pl", "pl pm pod t", "", "perl"],
    ["lua", "Lua", "lua", "lua", "", "lua"],
    ["tcl", "Tcl", "tcl", "tcl", "", "tcl"],
    ["awk", "AWK", "awk", "awk", "", "awk"],
    ["r", "R", "r", "r rmd", "", "r"],
    ["julia", "Julia", "jl", "jl", "", "julia"],
    ["matlab", "MATLAB", "mat", "matlab mlx", "", "matlab"],
    ["octave", "Octave", "m", "octave", "", "matlab"],
    ["sas", "SAS", "sas", "sas", "", "sas"],
    ["stata", "Stata", "do", "do ado", "", "stata"],
    ["powershell", "PowerShell", "ps1", "ps1 psm1 psd1", "", "powershell"],
    ["shell", "Shell Script", "sh", "sh bash zsh ksh", ".bashrc .zshrc .profile", "shell"],
    ["fish", "Fish", "fish", "fish", "", "shell"],
    ["bat", "Batch", "bat", "bat cmd", "", "batch"],
    ["dart", "Dart", "dart", "dart", "pubspec.yaml", "dart"],
    ["swift", "Swift", "swift", "swift", "Package.swift", "swift"],

    /* --- funcional --- */
    ["haskell", "Haskell", "hs", "hs lhs", "", "haskell"],
    ["ocaml", "OCaml", "ml", "ml mli", "", "ml"],
    ["elm", "Elm", "elm", "elm", "", "haskell"],
    ["purescript", "PureScript", "purs", "purs", "", "haskell"],
    ["elixir", "Elixir", "ex", "ex exs", "mix.exs", "elixir"],
    ["erlang", "Erlang", "erl", "erl hrl", "", "erlang"],
    ["racket", "Racket", "rkt", "rkt", "", "lisp"],
    ["scheme", "Scheme", "scm", "scm ss", "", "lisp"],
    ["commonlisp", "Common Lisp", "lisp", "lisp lsp cl", "", "lisp"],
    ["prolog", "Prolog", "pro", "pro prolog", "", "prolog"],
    ["solidity", "Solidity", "sol", "sol", "", "solidity"],
    ["vyper", "Vyper", "vy", "vy", "", "python"],
    ["cairo", "Cairo", "cairo", "cairo", "", "rust"],
    ["move", "Move", "move", "move", "", "rust"],

    /* --- legacy y científicos --- */
    ["pascal", "Pascal / Delphi", "pas", "pas pp dpr", "", "pascal"],
    ["fortran", "Fortran", "f90", "f f77 f90 f95 for", "", "fortran"],
    ["cobol", "COBOL", "cbl", "cbl cob cpy", "", "cobol"],
    ["ada", "Ada", "adb", "adb ads", "", "ada"],
    ["abap", "ABAP", "abap", "abap", "", "abap"],
    ["verilog", "Verilog", "v", "v vh", "", "hdl"],
    ["systemverilog", "SystemVerilog", "sv", "sv svh", "", "hdl"],
    ["vhdl", "VHDL", "vhd", "vhd vhdl", "", "hdl"],
    ["spice", "SPICE Netlist", "cir", "cir spice", "", "ini"],
    ["qsharp", "Q#", "qs", "qs", "", "csharp"],
    ["wolfram", "Wolfram Language", "wl", "wl wls nb", "", "ml"],

    /* --- bases de datos --- */
    ["sql", "SQL", "sql", "sql", "", "sql"],
    ["plsql", "PL/SQL", "pls", "pls pks pkb", "", "sql"],
    ["tsql", "T-SQL", "sql", "tsql", "", "sql"],
    ["mysql", "MySQL", "sql", "mysql", "", "sql"],
    ["pgsql", "PostgreSQL", "sql", "pgsql psql", "", "sql"],
    ["sqlite", "SQLite", "sql", "sqlite sqlite3", "", "sql"],
    ["cypher", "Cypher", "cql", "cql cypher", "", "sql"],
    ["prisma", "Prisma", "prisma", "prisma", "", "graphql"],

    /* --- infraestructura --- */
    ["dockerfile", "Dockerfile", "dockerfile", "dockerfile containerfile", "Dockerfile Containerfile", "dockerfile"],
    ["makefile", "Makefile", "mk", "mk mak", "Makefile GNUmakefile makefile", "make"],
    ["cmake", "CMake", "cmake", "cmake", "CMakeLists.txt", "cmake"],
    ["just", "Justfile", "just", "just", "justfile Justfile", "make"],
    ["ninja", "Ninja", "ninja", "ninja", "build.ninja", "make"],
    ["meson", "Meson", "meson", "meson", "meson.build", "python"],
    ["bazel", "Bazel / Starlark", "bzl", "bzl bazel", "BUILD WORKSPACE", "python"],
    ["terraform", "Terraform (HCL)", "tf", "tf tfvars hcl", "", "hcl"],
    ["bicep", "Bicep", "bicep", "bicep", "", "hcl"],
    ["nginx", "NGINX", "conf", "nginx", "nginx.conf", "nginx"],
    ["apache", "Apache Config", "conf", "htaccess", ".htaccess", "ini"],
    ["kubernetes", "Kubernetes Manifest", "yml", "k8s.yaml", "", "yaml"],
    ["helm", "Helm Template", "tpl", "tpl", "", "template"],
    ["ansible", "Ansible Playbook", "yml", "ansible.yml", "playbook.yml", "yaml"],
    ["protobuf", "Protocol Buffers", "proto", "proto", "", "protobuf"],
    ["thrift", "Thrift", "thrift", "thrift", "", "protobuf"],
    ["avro", "Avro Schema", "avsc", "avsc", "", "json"],
    ["jsonnet", "Jsonnet", "jsonnet", "jsonnet libsonnet", "", "json"],
    ["cue", "CUE", "cue", "cue", "", "hcl"],
    ["dhall", "Dhall", "dhall", "dhall", "", "haskell"],
    ["rego", "Rego (OPA)", "rego", "rego", "", "rego"],
    ["hcl", "HCL", "hcl", "hcl", "", "hcl"],

    /* --- documentación y diagramas --- */
    ["markdown", "Markdown", "md", "md markdown mdown", "README.md", "markdown"],
    ["restructuredtext", "reStructuredText", "rst", "rst", "", "rst"],
    ["asciidoc", "AsciiDoc", "adoc", "adoc asciidoc", "", "asciidoc"],
    ["org", "Org Mode", "org", "org", "", "org"],
    ["latex", "LaTeX", "tex", "tex ltx sty cls", "", "latex"],
    ["bibtex", "BibTeX", "bib", "bib", "", "bibtex"],
    ["typst", "Typst", "typ", "typ", "", "latex"],
    ["mermaid", "Mermaid", "mmd", "mmd mermaid", "", "mermaid"],
    ["plantuml", "PlantUML", "puml", "puml plantuml iuml", "", "plantuml"],
    ["graphviz", "Graphviz DOT", "dot", "dot gv", "", "dot"],
    ["gherkin", "Gherkin (Cucumber)", "feature", "feature", "", "gherkin"],
    ["robot", "Robot Framework", "robot", "robot", "", "robot"],
    ["srt", "SubRip Subtitles", "srt", "srt", "", "text"],
    ["vtt", "WebVTT", "vtt", "vtt", "", "text"],

    /* --- ampliación: scripting y JVM --- */
    ["actionscript", "ActionScript", "as", "as", "", "js"],
    ["angelscript", "AngelScript", "as", "angelscript acs", "", "c"],
    ["apex", "Apex (Salesforce)", "cls", "cls trigger", "", "java"],
    ["applescript", "AppleScript", "applescript", "applescript scpt", "", "basic"],
    ["autohotkey", "AutoHotkey", "ahk", "ahk ahkl", "", "autohotkey"],
    ["autoit", "AutoIt", "au3", "au3", "", "basic"],
    ["ballerina", "Ballerina", "bal", "bal", "", "java"],
    ["beef", "Beef", "bf", "bf", "", "csharp"],
    ["blitzbasic", "BlitzBasic", "bb", "bb", "", "basic"],
    ["boo", "Boo", "boo", "boo", "", "python"],
    ["brightscript", "BrightScript", "brs", "brs", "", "basic"],
    ["ceylon", "Ceylon", "ceylon", "ceylon", "", "java"],
    ["chapel", "Chapel", "chpl", "chpl", "", "c"],
    ["circom", "Circom", "circom", "circom", "", "c"],
    ["coffeescript", "CoffeeScript", "coffee", "coffee litcoffee", "", "coffee"],
    ["coldfusion", "ColdFusion", "cfm", "cfm cfml cfc", "", "markup"],
    ["cython", "Cython", "pyx", "pyx pxd pxi", "", "python"],
    ["dafny", "Dafny", "dfy", "dfy", "", "csharp"],
    ["eiffel", "Eiffel", "e", "e", "", "ada"],
    ["fennel", "Fennel", "fnl", "fnl", "", "lisp"],
    ["flow", "Flow", "js", "flow", ".flowconfig", "js"],
    ["forth", "Forth", "fth", "fth 4th", "", "forth"],
    ["freemarker", "FreeMarker", "ftl", "ftl", "", "template"],
    ["gams", "GAMS", "gms", "gms", "", "text"],
    ["gdscript", "GDScript (Godot)", "gd", "gd", "project.godot", "gdscript"],
    ["gleam", "Gleam", "gleam", "gleam", "", "gleam"],
    ["gml", "GameMaker Language", "gml", "gml", "", "c"],
    ["gnuplot", "Gnuplot", "plt", "plt gnuplot", "", "gnuplot"],
    ["hack", "Hack", "hack", "hack hh", "", "php"],
    ["harbour", "Harbour", "prg", "prg ch", "", "basic"],
    ["haxe", "Haxe", "hx", "hx", "", "haxe"],
    ["hy", "Hy", "hy", "hy", "", "lisp"],
    ["idris", "Idris", "idr", "idr", "", "haskell"],
    ["io", "Io", "io", "io", "", "js"],
    ["janet", "Janet", "janet", "janet", "", "lisp"],
    ["jsonata", "JSONata", "jsonata", "jsonata", "", "js"],
    ["kusto", "Kusto (KQL)", "kql", "kql csl", "", "sql"],
    ["lean", "Lean", "lean", "lean", "", "ml"],
    ["lfe", "LFE", "lfe", "lfe", "", "lisp"],
    ["lilypond", "LilyPond", "ly", "ly ily", "", "text"],
    ["livescript", "LiveScript", "ls", "ls", "", "coffee"],
    ["logtalk", "Logtalk", "lgt", "lgt logtalk", "", "prolog"],
    ["maple", "Maple", "mpl", "mpl maple", "", "matlab"],
    ["marko", "Marko", "marko", "marko", "", "markup"],
    ["mercury", "Mercury", "m", "mercury", "", "prolog"],
    ["modelica", "Modelica", "mo", "mo", "", "c"],
    ["modula2", "Modula-2", "mod", "mod def", "", "pascal"],
    ["mojo", "Mojo", "mojo", "mojo", "", "python"],
    ["monkeyc", "Monkey C", "mc", "mc", "", "java"],
    ["moonscript", "MoonScript", "moon", "moon", "", "coffee"],
    ["motoko", "Motoko", "mo", "motoko", "", "js"],
    ["nemerle", "Nemerle", "n", "n", "", "csharp"],
    ["nextflow", "Nextflow", "nf", "nf", "nextflow.config", "groovy"],
    ["nix", "Nix", "nix", "nix", "", "nix"],
    ["oberon", "Oberon", "ob", "ob oberon", "", "pascal"],
    ["objectivej", "Objective-J", "j", "j", "", "c"],
    ["odin", "Odin", "odin", "odin", "", "odin"],
    ["openedge", "OpenEdge ABL", "p", "p i", "", "abap"],
    ["pawn", "Pawn", "pwn", "pwn", "", "c"],
    ["pike", "Pike", "pike", "pike", "", "c"],
    ["pkl", "Pkl", "pkl", "pkl", "", "hcl"],
    ["pony", "Pony", "pony", "pony", "", "python"],
    ["powerbuilder", "PowerBuilder", "srw", "srw sra", "", "basic"],
    ["processing", "Processing", "pde", "pde", "", "java"],
    ["purebasic", "PureBasic", "pb", "pb pbi", "", "basic"],
    ["q", "q (kdb+)", "q", "q", "", "sql"],
    ["qml", "QML", "qml", "qml", "", "qml"],
    ["raku", "Raku", "raku", "raku rakumod p6 pl6", "", "perl"],
    ["reason", "Reason", "re", "re rei", "", "ml"],
    ["rebol", "REBOL", "reb", "reb r3 r2", "", "rebol"],
    ["red", "Red", "red", "red reds", "", "rebol"],
    ["rescript", "ReScript", "res", "res resi", "", "ml"],
    ["ring", "Ring", "ring", "ring", "", "c"],
    ["rpg", "RPG (ILE)", "rpgle", "rpgle sqlrpgle rpg", "", "cobol"],
    ["scilab", "Scilab", "sci", "sci sce", "", "matlab"],
    ["smalltalk", "Smalltalk", "st", "st", "", "smalltalk"],
    ["smali", "Smali", "smali", "smali", "", "asm"],
    ["smarty", "Smarty", "tpl", "smarty", "", "template"],
    ["snakemake", "Snakemake", "smk", "smk", "Snakefile", "python"],
    ["sourcepawn", "SourcePawn", "sp", "sp", "", "c"],
    ["squirrel", "Squirrel", "nut", "nut", "", "js"],
    ["stan", "Stan", "stan", "stan", "", "c"],
    ["supercollider", "SuperCollider", "scd", "scd", "", "js"],
    ["tla", "TLA+", "tla", "tla", "", "ml"],
    ["toit", "Toit", "toit", "toit", "", "python"],
    ["vala", "Vala", "vala", "vala vapi", "", "csharp"],
    ["velocity", "Velocity (VTL)", "vm", "vm vtl", "", "template"],
    ["vimscript", "Vim Script", "vim", "vim vimrc", ".vimrc _vimrc", "vim"],
    ["webidl", "Web IDL", "idl", "idl webidl", "", "c"],
    ["wren", "Wren", "wren", "wren", "", "js"],
    ["xquery", "XQuery", "xq", "xq xquery xql", "", "sql"],
    ["xpath", "XPath", "xpath", "xpath", "", "text"],
    ["xtend", "Xtend", "xtend", "xtend", "", "java"],
    ["yara", "YARA", "yar", "yar yara", "", "yara"],
    ["zephir", "Zephir", "zep", "zep", "", "php"]
  ];

  /* Nombres de archivo con prioridad sobre la extensión. */
  const BY_NAME = {};
  const BY_EXT = {};
  const BY_ID = {};
  L.forEach((row) => {
    const [id, label, icon, exts, names, family] = row;
    if (!BY_ID[id]) BY_ID[id] = { id, label, icon, family };
    String(exts || "").split(/\s+/).filter(Boolean).forEach((ext) => {
      if (!BY_EXT[ext]) BY_EXT[ext] = id;          // la primera entrada gana
    });
    String(names || "").split(/\s+/).filter(Boolean).forEach((name) => {
      BY_NAME[name.toLowerCase()] = id;
    });
  });
  /* Alias habiticales que no deben perderse. */
  Object.assign(BY_EXT, {
    bash: "shell", zsh: "shell", htm: "html", yml: "yaml",
    h: "c", hpp: "cpp", cc: "cpp", mjs: "javascript", cjs: "javascript",
    mts: "typescript", cts: "typescript", jsx: "jsx", tsx: "tsx",
    py: "python", rb: "ruby", rs: "rust", kt: "kotlin", ts: "typescript"
  });
  Object.assign(BY_NAME, {
    "dockerfile": "dockerfile", "containerfile": "dockerfile", "makefile": "makefile",
    "gnumakefile": "makefile", "cmakelists.txt": "cmake", "jenkinsfile": "groovy",
    "gemfile": "ruby", "rakefile": "ruby", "pipfile": "toml", "poetry.lock": "toml",
    "cargo.toml": "toml", "pyproject.toml": "toml", "go.mod": "go", "go.sum": "go",
    ".gitignore": "gitignore", ".dockerignore": "gitignore", ".editorconfig": "ini",
    ".env": "dotenv", ".bashrc": "shell", ".zshrc": "shell", ".profile": "shell",
    "codeowners": "codeowners", "build": "bazel", "workspace": "bazel",
    "tsconfig.json": "jsonc", "jsconfig.json": "jsonc", ".eslintrc.json": "jsonc",
    "package.json": "json", "package-lock.json": "json", "justfile": "just",
    "meson.build": "meson", "nginx.conf": "nginx", ".htaccess": "apache",
    "pubspec.yaml": "dart", "mix.exs": "elixir", "package.swift": "swift",
    "requirements.txt": "python", "build.gradle": "gradle", "settings.gradle": "gradle",
    "build.ninja": "ninja", "playbook.yml": "ansible", "docker-compose.yml": "yaml",
    "compose.yaml": "yaml", ".gitlab-ci.yml": "yaml"
  });

  function forPath(path) {
    const base = String(path || "").split("/").pop().toLowerCase();
    if (BY_NAME[base]) return BY_NAME[base];
    /* Sufijos compuestos: blade.php, spec.ts, test.py… */
    if (base.endsWith(".blade.php")) return "blade";
    const ext = base.includes(".") ? base.split(".").pop() : "";
    return BY_EXT[ext] || "plaintext";
  }

  const list = L.map((row) => [row[0], row[1], row[2]]);
  /* Sin duplicados en el selector (Objective-C aparece una sola vez). */
  const seen = new Set();
  const unique = list.filter((row) => (seen.has(row[0]) ? false : seen.add(row[0])));
  unique.sort((a, b) => a[1].localeCompare(b[1], "es"));

  window.Languages = {
    raw: L,
    list: unique,
    byExt: BY_EXT,
    byName: BY_NAME,
    forPath,
    label(id) { const row = BY_ID[id]; return row ? row.label : id; },
    ext(id) { const row = BY_ID[id]; return row ? row.icon : "txt"; },
    family(id) { const row = BY_ID[id]; return row ? row.family : "text"; },
    count: unique.length
  };
})();
