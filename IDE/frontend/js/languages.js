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
    ["objectivec", "Objective-C", "m", "m mm", "", "c"],
    ["objectivec", "Objective-C++", "mm", "mm", "", "c"],
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
    ["vtt", "WebVTT", "vtt", "vtt", "", "text"]
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
    bash: "shell", zsh: "shell", htm: "html", yml: "yaml", jpeg: "plaintext",
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
