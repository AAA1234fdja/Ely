/* Helpers de UI: DOM, formato, markdown, modales y toasts. */
(function () {
  "use strict";

  const UI = {};

  /* ------------------------------------------------------------ DOM */
  UI.$ = (sel, root) => (root || document).querySelector(sel);
  UI.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  UI.el = function (tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach((key) => {
        const value = attrs[key];
        if (value === null || value === undefined || value === false) return;
        if (key === "class") node.className = value;
        else if (key === "html") node.innerHTML = value;
        else if (key === "text") node.textContent = value;
        else if (key === "dataset") Object.assign(node.dataset, value);
        else if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2), value);
        else if (key === "style" && typeof value === "object") Object.assign(node.style, value);
        else node.setAttribute(key, value === true ? "" : value);
      });
    }
    (Array.isArray(children) ? children : children != null ? [children] : []).forEach((child) => {
      if (child === null || child === undefined || child === false) return;
      node.appendChild(typeof child === "string" || typeof child === "number" ? document.createTextNode(String(child)) : child);
    });
    return node;
  };

  UI.esc = function (value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  };

  UI.clear = function (node) {
    while (node && node.firstChild) node.removeChild(node.firstChild);
    return node;
  };

  /* ------------------------------------------------------------ formato */
  UI.bytes = function (value) {
    const n = Number(value) || 0;
    if (n < 1024) return n + " B";
    const units = ["KB", "MB", "GB", "TB"];
    let index = -1;
    let size = n;
    do { size /= 1024; index += 1; } while (size >= 1024 && index < units.length - 1);
    return size.toFixed(size < 10 ? 1 : 0) + " " + units[index];
  };

  UI.num = function (value) {
    return new Intl.NumberFormat("es").format(Number(value) || 0);
  };

  UI.money = function (value, currency) {
    const n = Number(value) || 0;
    if (n === 0) return "—";
    return new Intl.NumberFormat("es", {
      style: "currency", currency: currency || "USD",
      minimumFractionDigits: n < 0.01 ? 4 : 2, maximumFractionDigits: 4
    }).format(n);
  };

  UI.ms = function (value) {
    const n = Number(value);
    if (!n && n !== 0) return "—";
    return n >= 1000 ? (n / 1000).toFixed(2) + " s" : Math.round(n) + " ms";
  };

  UI.date = function (iso) {
    if (!iso) return "—";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return String(iso);
    const diff = (Date.now() - date.getTime()) / 1000;
    if (diff < 60) return "hace " + Math.max(1, Math.round(diff)) + " s";
    if (diff < 3600) return "hace " + Math.round(diff / 60) + " min";
    if (diff < 86400) return "hace " + Math.round(diff / 3600) + " h";
    return date.toLocaleString("es", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  };

  UI.ago = UI.date;

  UI.ini = function (name) {
    return String(name || "?").trim().slice(0, 2).toUpperCase();
  };

  UI.copy = async function (text) {
    try {
      await navigator.clipboard.writeText(text);
      UI.toast("ok", "Copiado", text.length > 60 ? text.slice(0, 60) + "…" : text);
    } catch (e) {
      UI.toast("err", "No se pudo copiar", String(e));
    }
  };

  /* ------------------------------------------------------------ markdown mínimo y seguro */
  function escapeHtml(text) {
    return UI.esc(text);
  }

  function inline(text) {
    let out = escapeHtml(text);
    out = out.replace(/`([^`\n]+)`/g, "<code>$1</code>");
    out = out.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
    out = out.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
    out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    return out;
  }

  UI.md = function (src) {
    const text = String(src == null ? "" : src).replace(/\r\n/g, "\n");
    const lines = text.split("\n");
    const out = [];
    let inCode = false;
    let codeLang = "";
    let codeBuf = [];
    let listType = null;

    const closeList = () => {
      if (listType) { out.push(listType === "ol" ? "</ol>" : "</ul>"); listType = null; }
    };

    for (const raw of lines) {
      const fence = raw.match(/^\s*```(\w*)\s*$/);
      if (fence) {
        if (inCode) {
          out.push(
            '<pre><button class="copy-btn" data-code="1">copiar</button><code>' +
            escapeHtml(codeBuf.join("\n")) + "</code></pre>"
          );
          inCode = false; codeBuf = []; codeLang = "";
        } else {
          closeList();
          inCode = true;
          codeLang = fence[1] || "";
        }
        continue;
      }
      if (inCode) { codeBuf.push(raw); continue; }
      if (!raw.trim()) { closeList(); continue; }
      const heading = raw.match(/^(#{1,4})\s+(.*)$/);
      if (heading) {
        closeList();
        const level = Math.min(6, heading[1].length + 2);
        out.push("<h" + level + ">" + inline(heading[2]) + "</h" + level + ">");
        continue;
      }
      const ul = raw.match(/^\s*[-*•]\s+(.*)$/);
      if (ul) {
        if (listType !== "ul") { closeList(); out.push("<ul>"); listType = "ul"; }
        out.push("<li>" + inline(ul[1]) + "</li>");
        continue;
      }
      const ol = raw.match(/^\s*\d+[.)]\s+(.*)$/);
      if (ol) {
        if (listType !== "ol") { closeList(); out.push("<ol>"); listType = "ol"; }
        out.push("<li>" + inline(ol[1]) + "</li>");
        continue;
      }
      const quote = raw.match(/^>\s?(.*)$/);
      if (quote) {
        closeList();
        out.push('<blockquote style="border-left:2px solid var(--border-strong);margin:6px 0;padding-left:10px;color:var(--text-dim)">' +
          inline(quote[1]) + "</blockquote>");
        continue;
      }
      closeList();
      out.push("<p>" + inline(raw) + "</p>");
    }
    if (inCode) {
      out.push("<pre><code>" + escapeHtml(codeBuf.join("\n")) + "</code></pre>");
    }
    closeList();
    return out.join("");
  };

  UI.bindCopy = function (root) {
    UI.$$(".copy-btn[data-code]", root || document).forEach((btn) => {
      if (btn.dataset.bound) return;
      btn.dataset.bound = "1";
      btn.addEventListener("click", (event) => {
        event.stopPropagation();
        const code = btn.parentElement.querySelector("code");
        if (code) UI.copy(code.textContent);
      });
    });
  };

  /* ------------------------------------------------------------ toasts */
  UI.toast = function (kind, title, body) {
    let host = document.getElementById("toasts");
    if (!host) {
      /* El HTML base no trae contenedor de toasts: se crea una sola vez. */
      host = UI.el("div", { id: "toasts" });
      document.body.appendChild(host);
    }
    const node = UI.el("div", { class: "toast " + (kind || "") }, [
      UI.el("div", { class: "grow" }, [
        UI.el("div", { class: "t-title", text: title }),
        body ? UI.el("div", { class: "t-body", text: String(body) }) : null
      ])
    ]);
    host.appendChild(node);
    setTimeout(() => {
      node.classList.add("out");
      setTimeout(() => node.remove(), 300);
    }, kind === "err" ? 6500 : 3800);
  };

  /* ------------------------------------------------------------ modal */
  let modalKeyHandler = null;

  UI.modal = function (opts) {
    let host = document.getElementById("modal");
    if (!host) {
      /* Fallback por si la página se sirve sin el contenedor del HTML base. */
      host = UI.el("div", { id: "modal" });
      document.body.appendChild(host);
    }
    UI.clear(host);
    const close = () => {
      host.classList.remove("open");
      UI.clear(host);
      if (modalKeyHandler) document.removeEventListener("keydown", modalKeyHandler);
      modalKeyHandler = null;
      if (opts && opts.onClose) opts.onClose();
    };
    const sheet = UI.el("div", { class: "sheet" + (opts.wide ? " wide" : "") });
    const header = UI.el("header", null, [
      UI.el("h3", { text: opts.title || "" }),
      UI.el("button", { class: "x", html: "&times;", onclick: close, "aria-label": "Cerrar" })
    ]);
    if (opts.subtitle) header.appendChild(UI.el("span", { class: "muted", text: opts.subtitle }));
    sheet.appendChild(header);

    const content = UI.el("div", { class: "content" });
    if (opts.body instanceof Node) content.appendChild(opts.body);
    else if (typeof opts.body === "string") content.innerHTML = opts.body;
    sheet.appendChild(content);

    if (opts.footer) {
      const footer = UI.el("div", { class: "footer" });
      footer.style.cssText = "padding:14px 20px;border-top:1px solid var(--border);display:flex;gap:8px;justify-content:flex-end";
      (Array.isArray(opts.footer) ? opts.footer : [opts.footer]).forEach((node) => footer.appendChild(node));
      sheet.appendChild(footer);
    }

    const backdrop = UI.el("div", { class: "backdrop", onclick: close });
    host.appendChild(backdrop);
    host.appendChild(sheet);
    host.classList.add("open");
    modalKeyHandler = (event) => { if (event.key === "Escape") close(); };
    document.addEventListener("keydown", modalKeyHandler);
    return { close, content, sheet };
  };

  UI.confirm = function (title, message, onAccept, acceptLabel) {
    const cancel = UI.el("button", { class: "btn ghost", text: "Cancelar" });
    const accept = UI.el("button", { class: "btn danger", text: acceptLabel || "Confirmar" });
    const ref = UI.modal({
      title: title,
      body: UI.el("p", { class: "dim", text: message, style: { margin: "0" } }),
      footer: [cancel, accept]
    });
    cancel.addEventListener("click", ref.close);
    accept.addEventListener("click", () => { ref.close(); onAccept(); });
  };

  /* ------------------------------------------------------------ utilidades de vista */
  UI.head = function (title, subtitle, actions) {
    return UI.el("div", { class: "view-head" }, [
      UI.el("div", { class: "grow" }, [
        UI.el("h2", { text: title }),
        subtitle ? UI.el("p", { html: subtitle }) : null
      ]),
      actions && actions.length
        ? UI.el("div", { class: "actions" }, actions.filter(Boolean))
        : null
    ]);
  };

  UI.btn = function (label, onClick, opts) {
    const o = opts || {};
    const node = UI.el("button", {
      class: "btn" + (o.primary ? " primary" : "") + (o.ghost ? " ghost" : "") +
        (o.danger ? " danger" : "") + (o.small ? " sm" : ""),
      type: "button"
    }, [o.icon ? UI.el("span", { text: o.icon }) : null, UI.el("span", { text: label })]);
    if (onClick) node.addEventListener("click", onClick);
    if (o.disabled) node.disabled = true;
    return node;
  };

  UI.badge = function (text, kind) {
    return UI.el("span", { class: "badge " + (kind || ""), text });
  };

  UI.metric = function (label, value, sub) {
    return UI.el("div", { class: "card metric" }, [
      UI.el("span", { class: "label", text: label }),
      UI.el("span", { class: "value", text: value }),
      sub ? UI.el("span", { class: "sub", text: sub }) : null
    ]);
  };

  UI.empty = function (icon, text, action) {
    return UI.el("div", { class: "empty" }, [
      UI.el("div", { class: "big", text: icon || "∅" }),
      UI.el("div", { text: text || "Sin datos" }),
      action || null
    ]);
  };

  UI.spinner = () => UI.el("span", { class: "spinner" });
  UI.loading = (label) => UI.el("div", { class: "empty" }, [UI.spinner(), UI.el("div", { text: label || "Cargando…" })]);

  UI.errBox = function (error, retry) {
    const message = error && error.message ? error.message : String(error);
    const node = UI.el("div", { class: "card" }, [
      UI.el("div", { class: "row between" }, [
        UI.el("b", { text: "No se pudo completar la operación" }),
        retry ? UI.btn("Reintentar", retry, { small: true }) : null
      ]),
      UI.el("p", { class: "dim", style: { margin: "8px 0 0", fontSize: "12.5px" }, text: message }),
      error && error.detail
        ? UI.el("pre", {
            class: "mono",
            style: { margin: "10px 0 0", whiteSpace: "pre-wrap", color: "var(--muted)", fontSize: "11px" },
            text: typeof error.detail === "string" ? error.detail : JSON.stringify(error.detail, null, 2)
          })
        : null
    ]);
    return node;
  };

  window.UI = UI;
})();
