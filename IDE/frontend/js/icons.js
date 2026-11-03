/* Ely Cowork · iconos de archivos (Material Icon Theme) para el IDE.
 * Los SVG viven en /icons (descargados de material-extensions/vscode-material-icon-theme).
 * Expone window.Icons. Se carga en runtime desde app.js.
 */
(function () {
  "use strict";

  const EXT = {
    js: "javascript", mjs: "javascript", cjs: "javascript",
    ts: "typescript", tsx: "typescript",
    jsx: "react",
    py: "python",
    json: "json", jsonl: "json",
    html: "html", htm: "html",
    css: "css", scss: "css",
    md: "markdown", markdown: "markdown",
    pdf: "pdf",
    tex: "tex", latex: "tex",
    svg: "svg",
    png: "image", jpg: "image", jpeg: "image", gif: "image", webp: "image", bmp: "image", ico: "image", avif: "image",
    csv: "table", tsv: "table",
    yml: "yaml", yaml: "yaml",
    rs: "rust", go: "go", java: "java",
    c: "c", h: "c", cpp: "cpp", cc: "cpp", hpp: "cpp",
    php: "php", rb: "ruby",
    sh: "console", bash: "console", zsh: "console",
    sql: "database", db: "database", sqlite: "database",
    xml: "xml",
    gitignore: "git", gitattributes: "git",
    dockerfile: "docker",
    toml: "settings", ini: "settings", cfg: "settings", env: "lock",
    lock: "lock"
  };

  function baseName(name) { return String(name || "").split("/").pop().toLowerCase(); }

  function iconName(name) {
    const b = baseName(name);
    if (b === "readme.md" || b === "readme") return "readme";
    if (b === "dockerfile") return "docker";
    if (b === ".gitignore" || b === ".gitattributes") return "git";
    if (b === "package.json" || b === "package-lock.json") return "nodejs";
    const ext = b.includes(".") ? b.split(".").pop() : "";
    return EXT[ext] || "document";
  }

  const Icons = {
    fileUrl(name) { return "icons/" + iconName(name) + ".svg"; },
    folderUrl(open) { return "icons/" + (open ? "folder-open" : "folder") + ".svg"; },
    file(name, size) {
      const img = document.createElement("img");
      img.src = this.fileUrl(name);
      img.className = "file-icon";
      img.alt = "";
      img.style.width = (size || 16) + "px";
      img.style.height = (size || 16) + "px";
      return img;
    },
    folder(open, size) {
      const img = document.createElement("img");
      img.src = this.folderUrl(open);
      img.className = "file-icon";
      img.alt = "";
      img.style.width = (size || 16) + "px";
      img.style.height = (size || 16) + "px";
      return img;
    }
  };

  window.Icons = Icons;
})();
