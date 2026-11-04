/* Ely Cowork · assets de iconos del IDE (Material Icon Theme).
 *
 * Los SVG viven en /icons (345 archivos descargados de
 * material-extensions/vscode-material-icon-theme). Cada uno de los 261
 * lenguajes del catálogo tiene su icono, además de tipos de archivo no código
 * (imágenes, vídeo, audio, fuentes, comprimidos, ofimática, certificados) y
 * carpetas con nombre conocido (src, tests, docs, assets, node_modules…).
 *
 * Resolución: nombre de archivo exacto → extensión → lenguaje del catálogo →
 * documento genérico. Expone window.Icons.
 */
(function () {
  "use strict";

  const BY_LANG = {
    "abap": "abap", "actionscript": "actionscript", "ada": "ada", "angelscript": "cpp",
    "ansible": "yaml", "apache": "settings", "apex": "salesforce", "applescript": "applescript",
    "asciidoc": "asciidoc", "assembly": "assembly", "astro": "astro", "autohotkey": "autohotkey",
    "autoit": "autoit", "avro": "json", "awk": "console", "ballerina": "ballerina",
    "bat": "console", "bazel": "bazel", "beef": "csharp", "bibtex": "bibliography",
    "bicep": "bicep", "blade": "laravel", "blitzbasic": "blitz", "boo": "python",
    "brightscript": "console", "c": "c", "cairo": "cairo", "ceylon": "java",
    "chapel": "c", "circom": "c", "clojure": "clojure", "cmake": "cmake",
    "cobol": "cobol", "codeowners": "codeowners", "coffeescript": "coffee", "coldfusion": "coldfusion",
    "commonlisp": "lisp", "cpp": "cpp", "crystal": "crystal", "csharp": "csharp",
    "css": "css", "csv": "table", "cuda": "cuda", "cue": "cue",
    "cypher": "database", "cython": "python", "d": "d", "dafny": "csharp",
    "dart": "dart", "dhall": "dhall", "diff": "diff", "dockerfile": "docker",
    "dotenv": "tune", "eiffel": "ely-eiffel", "ejs": "ejs", "elixir": "elixir",
    "elm": "elm", "erb": "ruby", "erlang": "erlang", "fennel": "lisp",
    "fish": "console", "flow": "flow", "forth": "forth", "fortran": "fortran",
    "freemarker": "freemarker", "fsharp": "fsharp", "gams": "ely-gams", "gdscript": "godot",
    "gherkin": "cucumber", "gitignore": "git", "gleam": "gleam", "glsl": "shader",
    "gml": "gamemaker", "gnuplot": "gnuplot", "go": "go", "gradle": "gradle",
    "graphql": "graphql", "graphviz": "dotjs", "groovy": "groovy", "hack": "hack",
    "haml": "haml", "handlebars": "handlebars", "harbour": "ely-harbour", "haskell": "haskell",
    "haxe": "haxe", "hcl": "hcl", "helm": "helm", "hlsl": "shader",
    "html": "html", "http": "http", "hy": "lisp", "idris": "idris",
    "ini": "settings", "io": "ely-io", "ipynb": "jupyter", "janet": "lisp",
    "java": "java", "javascript": "javascript", "jinja": "jinja", "json": "json",
    "json5": "json", "jsonata": "json", "jsonc": "json", "jsonl": "json",
    "jsonnet": "json", "jsx": "react", "julia": "julia", "just": "just",
    "kotlin": "kotlin", "kubernetes": "kubernetes", "kusto": "kusto", "latex": "tex",
    "lean": "lean", "less": "less", "lfe": "lisp", "lilypond": "lilypond",
    "liquid": "liquid", "livescript": "livescript", "llvm": "assembly", "log": "log",
    "logtalk": "prolog", "lua": "lua", "makefile": "makefile", "maple": "matlab",
    "markdown": "markdown", "marko": "html", "matlab": "matlab", "mdx": "mdx",
    "mercury": "prolog", "mermaid": "mermaid", "meson": "meson", "metal": "shader",
    "modelica": "ely-modelica", "modula2": "pascal", "mojo": "mojo", "monkeyc": "java",
    "moonscript": "moonscript", "motoko": "ely-motoko", "move": "cadence", "mustache": "template",
    "mysql": "database", "nemerle": "csharp", "nextflow": "nextflow", "nginx": "nginx",
    "nim": "nim", "ninja": "makefile", "nix": "nix", "nunjucks": "nunjucks",
    "oberon": "pascal", "objectivec": "objective-c", "objectivecpp": "objective-c", "objectivej": "c",
    "ocaml": "ocaml", "octave": "matlab", "odin": "odin", "opencl": "cuda",
    "openedge": "ely-openedge", "org": "markdown", "pascal": "pascal", "pawn": "pawn",
    "perl": "perl", "pgsql": "database", "php": "php", "pike": "c",
    "pkl": "pkl", "plaintext": "document", "plantuml": "uml", "plsql": "database",
    "pony": "ely-pony", "postcss": "postcss", "powerbuilder": "ely-powerbuilder", "powershell": "powershell",
    "prisma": "prisma", "processing": "processing", "prolog": "prolog", "properties": "settings",
    "protobuf": "proto", "pug": "pug", "purebasic": "ely-purebasic", "purescript": "purescript",
    "python": "python", "q": "database", "qml": "ely-qml", "qsharp": "qsharp",
    "r": "r", "racket": "racket", "raku": "perl", "razor": "razor",
    "reason": "reason", "rebol": "red", "red": "red", "rego": "opa",
    "rescript": "rescript", "restructuredtext": "markdown", "ring": "ely-ring", "robot": "robot",
    "rpg": "cobol", "ruby": "ruby", "rust": "rust", "sas": "sas",
    "sass": "sass", "scala": "scala", "scheme": "scheme", "scilab": "matlab",
    "scss": "sass", "shaderlab": "shader", "shell": "console", "smali": "assembly",
    "smalltalk": "ely-smalltalk", "smarty": "smarty", "snakemake": "snakemake", "solidity": "solidity",
    "sourcepawn": "c", "spice": "settings", "sql": "database", "sqlite": "database",
    "squirrel": "ely-squirrel", "srt": "video", "stan": "stan", "stata": "sas",
    "stylus": "stylus", "supercollider": "audio", "svelte": "svelte", "svg": "svg",
    "swift": "swift", "systemverilog": "verilog", "tcl": "tcl", "terraform": "terraform",
    "thrift": "proto", "tla": "ely-tla", "toit": "ely-toit", "toml": "toml",
    "tsql": "database", "tsv": "table", "tsx": "react_ts", "twig": "twig",
    "typescript": "typescript", "typst": "typst", "v": "vlang", "vala": "vala",
    "vb": "visualstudio", "velocity": "velocity", "verilog": "verilog", "vhdl": "verilog",
    "vimscript": "vim", "vtt": "video", "vue": "vue", "vyper": "python",
    "wasm": "webassembly", "webidl": "ely-webidl", "wgsl": "shader", "wolfram": "mathematica",
    "wren": "ely-wren", "xml": "xml", "xpath": "xml", "xquery": "xml",
    "xtend": "java", "yaml": "yaml", "yara": "lock", "zephir": "php",
    "zig": "zig",
  };

  const BY_EXT = {
    "7z": "zip", "a": "assembly", "ai": "adobe-illustrator", "avi": "video",
    "avif": "image", "blend": "blender", "bmp": "image", "bz2": "zip",
    "class": "java", "crt": "certificate", "db": "database", "dll": "assembly",
    "doc": "word", "docx": "word", "eot": "font", "epub": "document",
    "exe": "console", "fig": "figma", "flac": "audio", "gif": "image",
    "gz": "zip", "ico": "favicon", "ipynb": "jupyter", "jar": "java",
    "jpeg": "image", "jpg": "image", "key": "key", "lock": "lock",
    "m4a": "audio", "mkv": "video", "mov": "video", "mp3": "audio",
    "mp4": "video", "npmrc": "nodejs", "nvmrc": "nodejs", "o": "assembly",
    "ogg": "audio", "otf": "font", "pdf": "pdf", "pem": "certificate",
    "png": "image", "ppt": "powerpoint", "pptx": "powerpoint", "psd": "adobe-photoshop",
    "pub": "key", "rar": "zip", "rmd": "r", "sig": "certificate",
    "sketch": "sketch", "so": "assembly", "sqlite3": "database", "tar": "zip",
    "tiff": "image", "ttf": "font", "war": "java", "wasm": "webassembly",
    "wav": "audio", "webm": "video", "webp": "image", "woff": "font",
    "woff2": "font", "xls": "table", "xlsx": "table", "xz": "zip",
    "zip": "zip",
  };

  const BY_NAME = {
    ".babelrc": "babel", ".bashrc": "console", ".dockerignore": "docker",
    ".editorconfig": "editorconfig", ".env": "tune", ".env.development": "tune",
    ".env.example": "tune", ".env.local": "tune", ".env.production": "tune",
    ".eslintignore": "eslint", ".eslintrc": "eslint", ".eslintrc.js": "eslint",
    ".eslintrc.json": "eslint", ".gitattributes": "git", ".gitignore": "git",
    ".gitlab-ci.yml": "gitlab", ".gitmodules": "git", ".htaccess": "settings",
    ".npmrc": "nodejs", ".nvmrc": "nodejs", ".prettierignore": "prettier",
    ".prettierrc": "prettier", ".profile": "console", ".terraform.lock.hcl": "terraform",
    ".vimrc": "vim", ".zshrc": "console", "_vimrc": "vim",
    "agents.md": "robot", "analysis_options.yaml": "dart", "angular.json": "angular",
    "astro.config.mjs": "astro-config", "authors": "authors", "babel.config.js": "babel",
    "build.gradle": "gradle", "build.ninja": "makefile", "build.sbt": "sbt",
    "bun.lockb": "bun", "cargo.lock": "rust", "cargo.toml": "rust",
    "changelog": "changelog", "changelog.md": "changelog", "chart.yaml": "helm",
    "claude.md": "claude", "cmakelists.txt": "cmake", "codeowners": "codeowners",
    "compose.yaml": "docker", "containerfile": "docker", "contributing": "contributing",
    "contributing.md": "contributing", "copying": "license", "cypress.config.js": "cypress",
    "docker-compose.yaml": "docker", "docker-compose.yml": "docker", "dockerfile": "docker",
    "eslint.config.js": "eslint", "gemfile": "ruby", "gemfile.lock": "ruby",
    "gnumakefile": "makefile", "go.mod": "go", "go.sum": "go",
    "gradlew": "gradle", "jenkinsfile": "jenkins", "jest.config.js": "jest",
    "jsconfig.json": "jsconfig", "justfile": "just", "licence": "license",
    "license": "license", "license.md": "license", "makefile": "makefile",
    "manage.py": "django", "meson.build": "meson", "mix.exs": "elixir",
    "nest-cli.json": "nest", "netlify.toml": "netlify", "next.config.js": "next",
    "nginx.conf": "nginx", "nuxt.config.ts": "nuxt", "package-lock.json": "nodejs",
    "package.json": "nodejs", "package.swift": "swift", "pipfile": "python",
    "playwright.config.ts": "playwright", "pnpm-lock.yaml": "pnpm", "podfile": "swift",
    "poetry.lock": "python", "pom.xml": "maven", "postcss.config.js": "postcss",
    "prettier.config.js": "prettier", "prisma/schema.prisma": "prisma", "procfile": "heroku",
    "project.clj": "clojure", "project.godot": "godot", "pubspec.yaml": "dart",
    "pyproject.toml": "python", "rakefile": "ruby", "readme": "readme",
    "readme.md": "readme", "requirements.txt": "python", "rollup.config.js": "rollup",
    "security.md": "lock", "settings.gradle": "gradle", "setup.py": "python",
    "skaffold.yaml": "kubernetes", "snakefile": "snakemake", "svelte.config.js": "svelte",
    "tailwind.config.js": "tailwindcss", "terraform.tf": "terraform", "todo": "todo",
    "todo.md": "todo", "tsconfig.json": "tsconfig", "values.yaml": "helm",
    "vercel.json": "vercel", "vite.config.js": "vite", "vite.config.ts": "vite",
    "vitest.config.ts": "vitest", "vue.config.js": "vue-config", "webpack.config.js": "webpack",
    "yarn.lock": "yarn",
  };

  const FOLDERS = {
    ".ely": "folder-config", ".git": "folder-git", ".github": "folder-github",
    ".gitlab": "folder-gitlab", ".idea": "folder-intellij", ".vscode": "folder-vscode",
    "__tests__": "folder-test", "admin": "folder-admin", "android": "folder-android",
    "ansible": "folder-ansible", "api": "folder-api", "app": "folder-app",
    "apps": "folder-app", "archive": "folder-archive", "assets": "folder-resource",
    "audio": "folder-audio", "backend": "folder-server", "backup": "folder-backup",
    "benchmark": "folder-benchmark", "benchmarks": "folder-benchmark", "bin": "folder-dist",
    "build": "folder-dist", "cache": "folder-temp", "certificates": "folder-keys",
    "ci": "folder-ci", "cli": "folder-command", "client": "folder-client",
    "command": "folder-command", "commands": "folder-command", "components": "folder-components",
    "config": "folder-config", "configs": "folder-config", "constants": "folder-constant",
    "context": "folder-context", "controllers": "folder-controller", "core": "folder-core",
    "coverage": "folder-coverage", "css": "folder-css", "dart": "folder-dart",
    "data": "folder-database", "database": "folder-database", "db": "folder-database",
    "debug": "folder-debug", "deps": "folder-packages", "desktop": "folder-desktop",
    "dist": "folder-dist", "doc": "folder-docs", "docker": "folder-docker",
    "docs": "folder-docs", "documentation": "folder-docs", "download": "folder-download",
    "e2e": "folder-test", "enums": "folder-enum", "error": "folder-error",
    "errors": "folder-error", "events": "folder-event", "example": "folder-examples",
    "examples": "folder-examples", "extensions": "folder-plugin", "fixtures": "folder-test",
    "fonts": "folder-font", "frontend": "folder-client", "functions": "folder-functions",
    "go": "folder-go", "graphql": "folder-graphql", "helm": "folder-helm",
    "helpers": "folder-helper", "home": "folder-home", "hooks": "folder-hook",
    "i18n": "folder-i18n", "icons": "folder-images", "images": "folder-images",
    "img": "folder-images", "include": "folder-include", "interfaces": "folder-interface",
    "ios": "folder-ios", "java": "folder-java", "jobs": "folder-job",
    "jupyter": "folder-jupyter", "k8s": "folder-kubernetes", "keys": "folder-keys",
    "kotlin": "folder-kotlin", "kubernetes": "folder-kubernetes", "lang": "folder-i18n",
    "layouts": "folder-layout", "less": "folder-less", "lib": "folder-lib",
    "libs": "folder-lib", "locales": "folder-i18n", "log": "folder-log",
    "logs": "folder-log", "lua": "folder-lua", "media": "folder-images",
    "middleware": "folder-middleware", "migrations": "folder-migrations", "mobile": "folder-mobile",
    "mock": "folder-mock", "mocks": "folder-mock", "models": "folder-database",
    "modules": "folder-packages", "nginx": "folder-nginx", "node_modules": "folder-node",
    "notebooks": "folder-jupyter", "out": "folder-dist", "packages": "folder-packages",
    "pages": "folder-views", "php": "folder-php", "plugins": "folder-plugin",
    "powershell": "folder-powershell", "prisma": "folder-prisma", "private": "folder-private",
    "project": "folder-project", "projects": "folder-project", "proto": "folder-proto",
    "public": "folder-public", "python": "folder-python", "queue": "folder-queue",
    "r": "folder-r", "review": "folder-review", "robot": "folder-robot",
    "routes": "folder-routes", "rust": "folder-rust", "samples": "folder-examples",
    "scala": "folder-scala", "screens": "folder-views", "scripts": "folder-scripts",
    "scss": "folder-sass", "security": "folder-keys", "server": "folder-server",
    "services": "folder-api", "settings": "folder-config", "shared": "folder-shared",
    "source": "folder-src", "spec": "folder-test", "src": "folder-src",
    "state": "folder-ngrx-store", "static": "folder-public", "store": "folder-ngrx-store",
    "styles": "folder-css", "target": "folder-target", "tasks": "folder-job",
    "temp": "folder-temp", "templates": "folder-template", "terraform": "folder-terraform",
    "test": "folder-test", "tests": "folder-test", "themes": "folder-theme",
    "tmp": "folder-temp", "tools": "folder-tools", "translations": "folder-i18n",
    "types": "folder-interface", "upload": "folder-upload", "utils": "folder-utils",
    "vendor": "folder-packages", "video": "folder-video", "views": "folder-views",
    "web": "folder-public",
  };

  const BY_ID = {};
  Object.keys(BY_LANG).forEach(function (id) { BY_ID[id] = BY_LANG[id]; });

  function baseName(name) { return String(name || "").split("/").pop().toLowerCase(); }

  /* Nombre de icono para una ruta de archivo. */
  function iconName(name) {
    const b = baseName(name);
    if (BY_NAME[b]) return BY_NAME[b];
    const ext = b.includes(".") ? b.split(".").pop() : "";
    if (BY_EXT[ext]) return BY_EXT[ext];
    if (window.Languages) {
      const lang = window.Languages.forPath(b);
      if (BY_LANG[lang]) return BY_LANG[lang];
    }
    return BY_EXT[ext] || "document";
  }

  /* Nombre de icono para una carpeta (con nombre conocido o genérico). */
  function folderIcon(name, open) {
    const b = baseName(name);
    const specific = FOLDERS[b];
    if (specific) return specific;
    return open ? "folder-open" : "folder";
  }

  function img(iconName, size, cls) {
    const node = document.createElement("img");
    node.src = "icons/" + iconName + ".svg";
    node.className = cls || "file-icon";
    node.alt = "";
    node.setAttribute("aria-hidden", "true");
    node.loading = "lazy";
    node.decoding = "async";
    node.style.width = (size || 16) + "px";
    node.style.height = (size || 16) + "px";
    /* Si un asset faltara, se ve el documento genérico en vez de un roto. */
    node.addEventListener("error", function () {
      if (node.dataset.fallback) return;
      node.dataset.fallback = "1";
      node.src = "icons/document.svg";
    });
    return node;
  }

  const Icons = {
    count: 345,
    languages: Object.keys(BY_LANG).length,
    /* Mapas expuestos para la galería de assets (icons.html) y los tests. */
    catalog: { byLang: BY_LANG, byExt: BY_EXT, byName: BY_NAME, folders: FOLDERS },
    forLanguage(id) { return BY_LANG[id] || "document"; },
    iconName: iconName,
    folderIcon: folderIcon,
    fileUrl(name) { return "icons/" + iconName(name) + ".svg"; },
    folderUrl(open, name) { return "icons/" + folderIcon(name, open) + ".svg"; },
    languageUrl(id) { return "icons/" + (BY_LANG[id] || "document") + ".svg"; },
    file(name, size) { return img(iconName(name), size); },
    language(id, size) { return img(BY_LANG[id] || "document", size); },
    folder(open, size, name) { return img(folderIcon(name, open), size); }
  };

  window.Icons = Icons;
})();
