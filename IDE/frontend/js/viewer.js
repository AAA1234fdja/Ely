/* Ely Cowork · visor de archivos multi-formato.
 *
 * Abre un modal y renderiza según la extensión:
 *   pdf → visor nativo (iframe) · html → iframe sandbox · tex → LaTeX básico
 *   md → markdown · csv → tabla · json → árbol/pretty · svg/imágenes → img
 *   resto → código con números de línea.
 *
 * El descriptor lo arma quien llama (Local Storage o IDE):
 *   { name, ext, rawUrl, loadText(), onOpenIDE() }
 * Se carga en tiempo de ejecución desde app.js; el index.html no se toca.
 */
(function () {
  "use strict";

  const IMG_EXT = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "ico", "avif"];

  /* ---------------------------------------------------------- LaTeX básico */
  const GREEK = {
    alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε", zeta: "ζ", eta: "η",
    theta: "θ", iota: "ι", kappa: "κ", lambda: "λ", mu: "μ", nu: "ν", xi: "ξ", pi: "π",
    rho: "ρ", sigma: "σ", tau: "τ", upsilon: "υ", phi: "φ", chi: "χ", psi: "ψ", omega: "ω",
    Gamma: "Γ", Delta: "Δ", Theta: "Θ", Lambda: "Λ", Xi: "Ξ", Pi: "Π", Sigma: "Σ",
    Phi: "Φ", Psi: "Ψ", Omega: "Ω", infty: "∞", cdot: "·", times: "×", pm: "±",
    leq: "≤", geq: "≥", neq: "≠", sum: "∑", int: "∫", partial: "∂", nabla: "∇",
    rightarrow: "→", leftarrow: "←", Rightarrow: "⇒", in: "∈", forall: "∀", exists: "∃"
  };

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function mathToHtml(src) {
    let s = esc(src);
    s = s.replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, '<span class="lx-frac"><span>$1</span><span>$2</span></span>');
    s = s.replace(/\\sqrt\{([^{}]*)\}/g, "√<span class=\"lx-sqrt\">$1</span>");
    s = s.replace(/\\([A-Za-z]+)/g, (m, name) => GREEK[name] !== undefined ? GREEK[name] : m);
    s = s.replace(/\^\{([^{}]*)\}/g, "<sup>$1</sup>").replace(/\^(\w)/g, "<sup>$1</sup>");
    s = s.replace(/_\{([^{}]*)\}/g, "<sub>$1</sub>").replace(/_(\w)/g, "<sub>$1</sub>");
    s = s.replace(/[{}]/g, "");
    return '<span class="lx-math">' + s + "</span>";
  }

  function latexToHtml(tex) {
    let src = tex.replace(/%.*$/gm, "");                 // comentarios
    const grab = (cmd) => {
      const m = src.match(new RegExp("\\\\" + cmd + "\\{([^{}]*)\\}"));
      return m ? m[1] : "";
    };
    const title = grab("title"), author = grab("author"), date = grab("date");
    src = src.replace(/\\documentclass(\[[^\]]*\])?\{[^{}]*\}/g, "");
    src = src.replace(/\\usepackage(\[[^\]]*\])?\{[^{}]*\}/g, "");
    src = src.replace(/\\(title|author|date)\{[^{}]*\}/g, "");
    src = src.replace(/\\begin\{document\}/g, "").replace(/\\end\{document\}/g, "");
    src = src.replace(/\\maketitle/g, "@@MAKETITLE@@");
    src = src.replace(/\\LaTeX\{?\}?/g, "LaTeX").replace(/\\TeX\{?\}?/g, "TeX");
    src = src.replace(/\\today/g, new Date().toLocaleDateString());

    // listas
    src = src.replace(/\\begin\{itemize\}/g, "\n<ul>").replace(/\\end\{itemize\}/g, "</ul>\n");
    src = src.replace(/\\begin\{enumerate\}/g, "\n<ol>").replace(/\\end\{enumerate\}/g, "</ol>\n");
    src = src.replace(/\\item\s*/g, "\n<li>");
    src = src.replace(/<li>([\s\S]*?)(?=\n<li>|<\/ul>|<\/ol>)/g, (m, body) => "<li>" + body.trim() + "</li>");

    // matemáticas (display y en línea)
    src = src.replace(/\\\[([\s\S]*?)\\\]/g, (m, x) => "\n@@DISPLAY@@" + mathToHtml(x) + "@@ENDD@@\n");
    src = src.replace(/\$\$([\s\S]*?)\$\$/g, (m, x) => "\n@@DISPLAY@@" + mathToHtml(x) + "@@ENDD@@\n");
    src = src.replace(/\$([^$]+)\$/g, (m, x) => mathToHtml(x));

    // formato de texto
    src = src.replace(/\\textbf\{([^{}]*)\}/g, "<strong>$1</strong>");
    src = src.replace(/\\(textit|emph)\{([^{}]*)\}/g, "<em>$2</em>");
    src = src.replace(/\\section\*?\{([^{}]*)\}/g, "\n<h2>$1</h2>\n");
    src = src.replace(/\\subsection\*?\{([^{}]*)\}/g, "\n<h3>$1</h3>\n");

    // escapar el resto de HTML que no sean nuestras etiquetas
    const TAGS = /<\/?(ul|ol|li|h2|h3|strong|em|sup|sub|span)(\s[^>]*)?>/g;
    const kept = [];
    src = src.replace(TAGS, (m) => { kept.push(m); return "\u0000" + (kept.length - 1) + "\u0000"; });
    src = esc(src);
    src = src.replace(/\u0000(\d+)\u0000/g, (m, i) => kept[Number(i)]);

    // párrafos
    const blocks = src.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
    let html = blocks.map((b) => {
      if (/^@@DISPLAY@@/.test(b)) return '<div class="lx-display">' + b.replace(/^@@DISPLAY@@/, "").replace(/@@ENDD@@$/, "") + "</div>";
      if (/^<(ul|ol|h2|h3)/.test(b)) return b;
      if (/^@@MAKETITLE@@$/.test(b)) {
        return '<div class="lx-title"><h1>' + esc(title || "Documento") + "</h1>" +
          (author ? '<div class="lx-author">' + esc(author) + "</div>" : "") +
          (date ? '<div class="lx-date">' + esc(date) + "</div>" : "") + "</div>";
      }
      return "<p>" + b.replace(/\n/g, "<br>") + "</p>";
    }).join("\n");
    return html;
  }

  /* ---------------------------------------------------------- CSV */
  function csvToTable(text) {
    const rows = text.trim().split(/\r?\n/).map((line) => line.split(","));
    if (!rows.length) return UI.empty("∅", I18N.t("vw.empty"));
    const table = UI.el("table", { class: "vw-table" });
    const thead = UI.el("thead");
    const hr = UI.el("tr");
    rows[0].forEach((h) => hr.appendChild(UI.el("th", { text: h })));
    thead.appendChild(hr); table.appendChild(thead);
    const tbody = UI.el("tbody");
    rows.slice(1).forEach((r) => {
      const tr = UI.el("tr");
      r.forEach((c) => tr.appendChild(UI.el("td", { text: c })));
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    return table;
  }

  /* ---------------------------------------------------------- código */
  function codeBlock(text) {
    const lines = text.split("\n");
    const gutter = UI.el("div", { class: "vw-gutter", text: lines.map((_, i) => i + 1).join("\n") });
    const pre = UI.el("pre", { class: "vw-code", text: text });
    return UI.el("div", { class: "vw-codewrap" }, [gutter, pre]);
  }

  /* ---------------------------------------------------------- abrir */
  function open(desc) {
    const ext = (desc.ext || (desc.name || "").split(".").pop() || "").toLowerCase();
    const body = UI.el("div", { class: "vw-body" });
    const content = UI.el("div", { class: "vw-content" });
    body.appendChild(content);

    let mode = "render";
    let cachedText = null;

    const toolbar = UI.el("div", { class: "vw-toolbar" });
    function renderToolbar() {
      UI.clear(toolbar);
      toolbar.appendChild(UI.el("span", { class: "vw-name mono trunc", text: desc.name || "archivo" }));
      toolbar.appendChild(UI.badge(ext.toUpperCase() || "FILE", "accent"));
      toolbar.appendChild(UI.el("div", { style: { flex: "1" } }));
      const hasText = ["tex", "latex", "html", "htm", "md", "csv", "json", "txt", "js", "py", "css", "svg"].includes(ext) || desc.loadText;
      if (hasText && ["tex", "latex", "html", "htm", "md"].includes(ext)) {
        toolbar.appendChild(UI.btn(mode === "render" ? I18N.t("vw.source") : I18N.t("vw.render"), () => {
          mode = mode === "render" ? "source" : "render";
          renderToolbar(); paint();
        }, { small: true, ghost: true }));
      }
      if (desc.rawUrl) {
        toolbar.appendChild(UI.el("a", { class: "btn sm ghost", href: desc.rawUrl, download: desc.name || true, text: I18N.t("vw.download") }));
      }
      if (desc.onOpenIDE) {
        toolbar.appendChild(UI.btn(I18N.t("vw.openIDE"), desc.onOpenIDE, { small: true, ghost: true }));
      }
    }

    async function getText() {
      if (cachedText !== null) return cachedText;
      if (!desc.loadText) throw new Error("Sin contenido de texto");
      cachedText = await desc.loadText();
      return cachedText;
    }

    async function paint() {
      UI.clear(content);
      content.appendChild(UI.loading(I18N.t("vw.loading")));
      try {
        let node;
        if (ext === "pdf") {
          node = UI.el("iframe", { class: "vw-frame", src: desc.rawUrl, title: desc.name });
        } else if (IMG_EXT.includes(ext)) {
          node = UI.el("div", { class: "vw-imgwrap" }, [UI.el("img", { class: "vw-img", src: desc.rawUrl, alt: desc.name })]);
        } else if (ext === "svg") {
          node = UI.el("div", { class: "vw-imgwrap" }, [UI.el("img", { class: "vw-img", src: desc.rawUrl, alt: desc.name })]);
        } else if ((ext === "html" || ext === "htm") && mode === "render") {
          const text = await getText();
          node = UI.el("iframe", { class: "vw-frame", sandbox: "", srcdoc: text, title: desc.name });
        } else if ((ext === "tex" || ext === "latex") && mode === "render") {
          const text = await getText();
          const wrap = UI.el("div", { class: "vw-latex" });
          wrap.innerHTML = latexToHtml(text);
          node = UI.el("div", null, [wrap, UI.el("p", { class: "muted vw-note", text: I18N.t("vw.latexNote") })]);
        } else if (ext === "md" && mode === "render") {
          const text = await getText();
          const md = UI.el("div", { class: "vw-md", html: UI.md(text) });
          UI.bindCopy(md);
          node = md;
        } else if (ext === "csv") {
          node = csvToTable(await getText());
        } else if (ext === "json") {
          const text = await getText();
          let pretty = text;
          try { pretty = JSON.stringify(JSON.parse(text), null, 2); } catch (e) { /* dejar tal cual */ }
          node = codeBlock(pretty);
        } else {
          node = codeBlock(await getText());
        }
        UI.clear(content);
        content.appendChild(node);
      } catch (err) {
        UI.clear(content);
        content.appendChild(UI.errBox(err, paint));
      }
    }

    renderToolbar();
    body.insertBefore(toolbar, content);
    paint();

    return UI.modal({
      title: desc.name || I18N.t("ls.files"),
      subtitle: ext.toUpperCase(),
      wide: true,
      body
    });
  }

  /* Descriptores cómodos para Local Storage y workspace. */
  function openStorage(profile, kind, name) {
    const q = "profile=" + encodeURIComponent(profile) + "&kind=" + encodeURIComponent(kind) + "&name=" + encodeURIComponent(name);
    return open({
      name, ext: name.split(".").pop(),
      rawUrl: "/api/storage/raw?" + q,
      loadText: async () => {
        const data = await API.request("/storage/file?" + q);
        if (data.binary) throw new Error(I18N.t("vw.binary"));
        return data.content || "";
      }
    });
  }

  function openWorkspace(path) {
    return open({
      name: path.split("/").pop(), ext: path.split(".").pop(),
      rawUrl: "/api/workspace/raw?path=" + encodeURIComponent(path),
      loadText: async () => (await API.file(path)).content || ""
    });
  }

  /* Explorador de archivos de Local Storage (para adjuntar/abrir desde el chat). */
  async function browseStorage(profile) {
    const body = UI.el("div", { class: "stack" });
    const ref = UI.modal({ title: I18N.t("ls.title"), subtitle: profile, wide: false, body });
    body.appendChild(UI.loading(I18N.t("vw.loading")));
    try {
      const data = await API.storage(profile);
      UI.clear(body);
      const groups = [
        { label: "⚡ " + I18N.t("ls.generated"), kind: "generado", files: data.generated.files },
        { label: "🗒 " + I18N.t("ls.planned"), kind: "planeado", files: data.planned.files }
      ];
      groups.forEach((g) => {
        body.appendChild(UI.el("div", { class: "storage-sub", text: g.label }));
        if (!g.files.length) {
          body.appendChild(UI.el("p", { class: "muted storage-none", text: "—" }));
          return;
        }
        const list = UI.el("div", { class: "storage-list" });
        g.files.forEach((f) => {
          const item = UI.el("div", { class: "storage-item click", onclick: () => { ref.close(); openStorage(profile, g.kind, f.name); } }, [
            UI.el("div", { class: "storage-item-main" }, [
              UI.el("div", { class: "storage-item-title mono trunc", text: f.name }),
              UI.el("div", { class: "storage-item-meta muted", text: UI.bytes(f.size) })
            ]),
            UI.el("span", { class: "muted", text: "↗" })
          ]);
          list.appendChild(item);
        });
        body.appendChild(list);
      });
      body.appendChild(UI.btn(I18N.t("chat.openStorage"), () => { ref.close(); if (window.App) App.navigate("storage"); }, { small: true, ghost: true }));
    } catch (err) {
      UI.clear(body);
      body.appendChild(UI.errBox(err, () => { ref.close(); browseStorage(profile); }));
    }
    return ref;
  }

  window.FileViewer = { open, openStorage, openWorkspace, browseStorage, latexToHtml };
})();
