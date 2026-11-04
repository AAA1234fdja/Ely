/* Ely Cowork · host de extensiones.
 *
 * Cada extensión corre en un <iframe sandbox="allow-scripts"> (origen opaco):
 * sin acceso al DOM de la app, sin cookies, sin localStorage y sin red propia.
 * El único canal es postMessage con este host, que aplica los permisos del
 * manifiesto y delega en el backend lo que necesita servidor.
 *
 * Comunicación externa: `ely.fetch` → POST /api/extensions/call {op:"fetch"} →
 * el backend comprueba `network:<host>` y hace la petición real.
 *
 * Expone window.ExtHost. Se carga en runtime desde app.js.
 */
(function () {
  "use strict";

  const state = {
    loaded: false,
    extensions: [],
    frames: new Map(),       // id → {iframe, ready, active, manifest}
    commands: new Map(),     // commandId → {title, extId}
    status: new Map(),       // itemId → {text, tooltip, extId}
    completions: [],         // {extId, selector, label}
    editor: null,            // adaptador que registra la vista IDE
    error: null
  };
  const listeners = new Set();
  const T = (k, fallback) => {
    try { const v = window.t ? t(k) : k; return v === k && fallback ? fallback : v; }
    catch (e) { return fallback || k; }
  };

  function notify(reason) {
    listeners.forEach((fn) => { try { fn(state, reason); } catch (e) { /* noop */ } });
    document.dispatchEvent(new CustomEvent("ext:change", { detail: { reason } }));
  }

  const byId = (id) => state.extensions.find((e) => e.id === id) || null;
  const can = (id, perm) => {
    const ext = byId(id);
    return !!(ext && (ext.permissions || []).includes(perm));
  };

  function log(extId, level, text) {
    if (level === "error") console.warn("[ext " + extId + "]", text);
    if (window.Output) Output.log("Extension Host", "[" + level + "] " + extId + ": " + text);
    const ext = byId(extId);
    if (ext) { ext.lastMessage = String(text).slice(0, 300); ext.lastLevel = level; }
    notify("log");
  }

  /* ------------------------------------------------------------ ciclo de vida */
  async function refresh() {
    try {
      const data = await API.extensions();
      state.extensions = data.extensions || [];
      state.meta = {
        permissions: data.permissions || {},
        installHosts: data.installHosts || [],
        vsixCompatible: !!data.vsixCompatible,
        note: data.note || ""
      };
      state.error = null;
      state.loaded = true;
      notify("list");
      sync();
    } catch (err) {
      state.error = err.message || String(err);
      state.loaded = true;
      notify("error");
    }
    return state.extensions;
  }

  function sync() {
    const wanted = new Set(state.extensions.filter((e) => e.enabled && e.main).map((e) => e.id));
    state.frames.forEach((entry, id) => { if (!wanted.has(id)) destroy(id); });
    /* Los registros de una extensión desactivada desaparecen. */
    Array.from(state.commands.keys()).forEach((key) => {
      if (!wanted.has(state.commands.get(key).extId)) state.commands.delete(key);
    });
    state.completions = state.completions.filter((c) => wanted.has(c.extId));
    Array.from(state.status.keys()).forEach((key) => {
      if (!wanted.has(state.status.get(key).extId)) state.status.delete(key);
    });
    wanted.forEach((id) => { if (!state.frames.has(id)) spawn(id); });
    notify("sync");
  }

  function destroy(id) {
    const entry = state.frames.get(id);
    if (entry && entry.iframe && entry.iframe.parentNode) entry.iframe.parentNode.removeChild(entry.iframe);
    state.frames.delete(id);
  }

  function spawn(id) {
    const ext = byId(id);
    if (!ext) return;
    const iframe = document.createElement("iframe");
    iframe.className = "ext-frame";
    iframe.setAttribute("sandbox", "allow-scripts");        // SIN allow-same-origin
    iframe.setAttribute("title", T("ext.frameTitle", "Extensión") + ": " + localized(ext).name);
    iframe.setAttribute("aria-hidden", "true");
    iframe.tabIndex = -1;
    const token = frameToken();
    iframe.src = API.extRunnerUrl(id, token);
    const entry = { iframe, token, ready: false, active: false, manifest: ext, seq: 0, pending: new Map() };
    state.frames.set(id, entry);
    iframe.addEventListener("load", () => { /* el puente avisa con "ready" */ });
    document.body.appendChild(iframe);
    /* Si en 8 s no activó, se marca el fallo (no se bloquea la interfaz). */
    setTimeout(() => {
      if (!entry.active && state.frames.has(id)) {
        ext.activationError = T("ext.activationTimeout", "La extensión no respondió al activarse");
        notify("timeout");
      }
    }, 8000);
  }

  /* Secreto por iframe: identifica al emisor aunque el entorno no exponga
     event.source (p. ej. algunos navegadores con origen opaco o jsdom). */
  function frameToken() {
    const bytes = new Uint8Array(16);
    if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(bytes);
    else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  function post(entry, msg) {
    try { entry.iframe.contentWindow.postMessage(Object.assign({ __ely: 1, token: entry.token }, msg), "*"); }
    catch (e) { /* iframe aún no listo */ }
  }

  function invoke(extId, method, params, timeout) {
    const entry = state.frames.get(extId);
    if (!entry || !entry.active) return Promise.resolve(null);
    return new Promise((resolve) => {
      const id = ++entry.seq;
      const timer = setTimeout(() => { entry.pending.delete(id); resolve(null); }, timeout || 1500);
      entry.pending.set(id, (msg) => {
        clearTimeout(timer);
        entry.pending.delete(id);
        resolve(msg.ok ? msg.result : null);
      });
      post(entry, { kind: "invoke", id, method, params: params || {} });
    });
  }

  function emit(name, payload) {
    state.frames.forEach((entry) => { if (entry.active) post(entry, { kind: "event", name, payload }); });
  }

  /* ------------------------------------------------------------------- RPC */
  function requirePerm(extId, perm) {
    if (!can(extId, perm)) {
      throw new Error(T("ext.noPermission", "Permiso no declarado") + ": " + perm);
    }
  }

  const RPC = {
    "commands.register": (extId, p) => {
      requirePerm(extId, "commands");
      state.commands.set(String(p.id), { title: String(p.title || p.id), extId });
      notify("commands");
      return { ok: true };
    },
    "commands.execute": async (extId, p) => {
      requirePerm(extId, "commands");
      return execute(String(p.id), p.args);
    },
    "window.showMessage": (extId, p) => {
      requirePerm(extId, "ui");
      const kind = p.kind === "err" || p.kind === "error" ? "err" : p.kind === "warn" ? "warn" : "ok";
      const ext = byId(extId);
      UI.toast(kind, ext ? ext.name : T("ext.title", "Extensión"), String(p.text || ""));
      if (window.A11y) A11y.announce(String(p.text || ""));
      return { ok: true };
    },
    "window.setStatusBar": (extId, p) => {
      requirePerm(extId, "ui");
      const id = String(p.id || extId);
      if (!p.text) state.status.delete(id);
      else state.status.set(id, { text: String(p.text), tooltip: String(p.tooltip || ""), extId });
      notify("status");
      return { ok: true };
    },
    "window.showQuickPick": (extId, p) => {
      requirePerm(extId, "ui");
      return new Promise((resolve) => {
        const items = Array.isArray(p.items) ? p.items : [];
        const list = UI.el("div", { class: "stack ext-pick", role: "listbox" });
        items.forEach((item) => {
          const label = typeof item === "string" ? item : (item.label || String(item));
          const row = UI.el("button", { class: "ext-pick-item", role: "option" }, [
            UI.el("span", { text: label }),
            typeof item === "object" && item.description ? UI.el("span", { class: "muted", text: item.description }) : null
          ]);
          row.addEventListener("click", () => { ref.close(); resolve(item); });
          list.appendChild(row);
        });
        const ref = UI.modal({
          title: (p.options && p.options.title) || T("ext.pickTitle", "Selecciona una opción"),
          body: list,
          footer: [UI.btn(T("common.cancel", "Cancelar"), () => { ref.close(); resolve(null); }, { ghost: true })],
          onClose: () => resolve(null)
        });
      });
    },
    "window.showInputBox": (extId, p) => {
      requirePerm(extId, "ui");
      return new Promise((resolve) => {
        const o = p.options || {};
        const input = UI.el("input", {
          type: "text", value: o.value || "", placeholder: o.placeholder || "",
          "aria-label": o.title || o.placeholder || ""
        });
        const done = (value) => { ref.close(); resolve(value); };
        const ref = UI.modal({
          title: o.title || T("ext.inputTitle", "Introduce un valor"),
          body: input,
          footer: [
            UI.btn(T("common.cancel", "Cancelar"), () => done(null), { ghost: true }),
            UI.btn(T("common.accept", "Aceptar"), () => done(input.value), { primary: true })
          ],
          onClose: () => resolve(null)
        });
        input.addEventListener("keydown", (e) => { if (e.key === "Enter") done(input.value); });
        setTimeout(() => { input.focus(); input.select(); }, 50);
      });
    },
    "window.showDocument": (extId, p) => {
      requirePerm(extId, "ui");
      const ext = byId(extId);
      UI.modal({
        title: String(p.title || (ext ? ext.name : "")),
        subtitle: ext ? ext.name + " · " + ext.version : "",
        wide: true,
        body: UI.el("pre", { class: "mono ext-doc", "data-noi18n": "1", text: String(p.text || "") })
      });
      return { ok: true };
    },
    "workspace.readFile": async (extId, p) => {
      requirePerm(extId, "workspace:read");
      return API.file(String(p.path || ""));
    },
    "workspace.writeFile": async (extId, p) => {
      requirePerm(extId, "workspace:write");
      const result = await API.saveFile(String(p.path || ""), String(p.content || ""));
      emit("saved", { path: String(p.path || "") });
      return result;
    },
    "workspace.list": async (extId, p) => {
      requirePerm(extId, "workspace:read");
      return API.ideCall("fs_list", { path: String(p.path || "") });
    },
    "workspace.search": async (extId, p) => {
      requirePerm(extId, "workspace:read");
      return API.searchWorkspace(String(p.q || ""));
    },
    "editor.getActiveFile": (extId) => {
      requirePerm(extId, "editor");
      return state.editor ? state.editor.getActiveFile() : null;
    },
    "editor.getText": (extId) => {
      requirePerm(extId, "editor");
      return state.editor ? state.editor.getText() : "";
    },
    "editor.getSelection": (extId) => {
      requirePerm(extId, "editor");
      return state.editor ? state.editor.getSelection() : null;
    },
    "editor.getLanguage": (extId) => {
      requirePerm(extId, "editor");
      const file = state.editor ? state.editor.getActiveFile() : null;
      return file ? file.language : "plaintext";
    },
    "editor.insertText": (extId, p) => {
      requirePerm(extId, "editor");
      if (state.editor) state.editor.insertText(String(p.text || ""));
      return { ok: true };
    },
    "editor.replaceSelection": (extId, p) => {
      requirePerm(extId, "editor");
      if (state.editor) state.editor.replaceSelection(String(p.text || ""));
      return { ok: true };
    },
    "languages.registerCompletion": (extId, p) => {
      requirePerm(extId, "completions");
      const selector = Array.isArray(p.selector) ? p.selector : [String(p.selector || "*")];
      state.completions = state.completions.filter((c) => c.extId !== extId);
      state.completions.push({ extId, selector, label: p.label || (byId(extId) || {}).name || extId });
      notify("completions");
      return { ok: true };
    },
    "languages.registerHover": (extId) => {
      requirePerm(extId, "completions");
      return { ok: false, error: T("ext.hoverSoon", "Los hovers llegarán próximamente") };
    },
    "chat.send": async (extId, p) => {
      requirePerm(extId, "chat");
      if (!window.ChatStore) throw new Error("Chat no disponible");
      const result = await ChatStore.send(String(p.text || ""));
      return { ok: !!(result && result.ok) };
    },
    "net.fetch": async (extId, p) => {
      /* El backend vuelve a comprobar el permiso network:<host>. */
      const options = p.options || {};
      return API.extCall("fetch", {
        id: extId, url: String(p.url || ""),
        method: options.method || "GET",
        headers: options.headers || {},
        body: options.body != null ? String(options.body) : null
      });
    }
  };

  function onMessage(event) {
    const msg = event.data;
    if (!msg || msg.__ely !== 1) return;
    let extId = null;
    state.frames.forEach((entry, id) => {
      if (event.source && entry.iframe.contentWindow === event.source) extId = id;
      else if (msg.token && msg.token === entry.token) extId = id;
    });
    if (!extId) return;                       // ni origen ni secreto: ignorado
    const entry = state.frames.get(extId);

    if (msg.kind === "ready") {
      entry.ready = true;
      post(entry, { kind: "init", manifest: byId(extId), language: uiLanguage() });
      return;
    }
    if (msg.kind === "activated") {
      entry.active = true;
      const ext = byId(extId);
      if (ext) { ext.active = true; ext.activationError = null; }
      notify("activated");
      /* Estado inicial del editor para que la extensión pueda pintarlo. */
      if (state.editor) emit("activeEditor", state.editor.getActiveFile());
      return;
    }
    if (msg.kind === "failed") {
      const ext = byId(extId);
      if (ext) ext.activationError = String(msg.error || "");
      log(extId, "error", msg.error);
      notify("failed");
      return;
    }
    if (msg.kind === "log") { log(extId, msg.level || "info", msg.text); return; }
    if (msg.kind === "invokeResult") {
      const slot = entry.pending.get(msg.id);
      if (slot) slot(msg);
      return;
    }
    if (msg.kind === "rpc") {
      const handler = RPC[msg.method];
      const reply = (ok, result, error) => post(entry, { kind: "result", id: msg.id, ok, result, error });
      if (!handler) { reply(false, null, "Método no soportado: " + msg.method); return; }
      Promise.resolve()
        .then(() => handler(extId, msg.params || {}))
        .then((result) => reply(true, result === undefined ? null : result))
        .catch((err) => {
          log(extId, "error", msg.method + ": " + (err.message || err));
          reply(false, null, err.message || String(err));
        });
    }
  }

  /* --------------------------------------------------------------- comandos */
  function commandList() {
    return Array.from(state.commands.entries()).map(([id, info]) => ({
      id, title: info.title, extId: info.extId,
      source: (byId(info.extId) || {}).name || info.extId
    }));
  }

  async function execute(id, args) {
    const info = state.commands.get(id);
    if (!info) { UI.toast("warn", T("ext.unknownCommand", "Comando no registrado"), id); return null; }
    const result = await invoke(info.extId, "command:" + id, args || {}, 30000);
    if (window.A11y) A11y.announce(info.title);
    return result;
  }

  /* ----------------------------------------------------------- autocompletado */
  async function completionsFor(ctx) {
    const language = (ctx && ctx.language) || "plaintext";
    const matching = state.completions.filter((c) =>
      c.selector.includes("*") || c.selector.includes(language));
    if (!matching.length) return [];
    const results = await Promise.all(matching.map(async (c) => {
      const items = await invoke(c.extId, "completion", ctx, 900);
      if (!Array.isArray(items)) return [];
      return items.filter((it) => it && (it.insertText || it.label)).map((it) => ({
        label: String(it.label || ""),
        insertText: String(it.insertText != null ? it.insertText : it.label || ""),
        detail: it.detail ? String(it.detail) : c.label,
        kind: it.kind || "extension",
        replacePrefix: it.replacePrefix !== false,
        source: c.label,
        extId: c.extId
      }));
    }));
    return results.flat();
  }

  function statusItems() {
    return Array.from(state.status.entries()).map(([id, info]) => Object.assign({ id }, info));
  }

  /* ------------------------------------------------------------ instalación */
  async function install(source) {
    const result = await API.extCall("install", { source });
    await refresh();
    return result;
  }
  async function uninstall(id) {
    const result = await API.extCall("uninstall", { id });
    destroy(id);
    await refresh();
    return result;
  }
  async function setEnabled(id, enabled) {
    const result = await API.extCall("enable", { id, enabled });
    await refresh();
    return result;
  }

  function setEditor(adapter) {
    state.editor = adapter || null;
    if (adapter) emit("activeEditor", adapter.getActiveFile());
  }

  function uiLanguage() {
    try { return (window.I18N && I18N.lang()) || (window.Settings && Settings.get("language")) || "es"; }
    catch (e) { return "es"; }
  }

  function init() {
    window.addEventListener("message", onMessage);
    /* El idioma de la interfaz también llega a las extensiones. */
    window.addEventListener("ely:langchange", () => {
      emit("language", { language: uiLanguage() });
      /* Los títulos accesibles de los iframe también cambian de idioma. */
      state.frames.forEach((entry, id) => {
        const ext = byId(id);
        if (ext) entry.iframe.setAttribute("title", T("ext.frameTitle", "Extensión") + ": " + localized(ext).name);
      });
    });
    refresh();
    return ExtHost;
  }

  /* Nombre y descripción en el idioma de la interfaz (manifiesto l10n).
   * Orden: idioma activo -> inglés -> español del manifiesto. */
  function localized(ext) {
    const lang = uiLanguage();
    const map = ext.l10n || {};
    const pick = (field, fallback) => {
      const direct = (map[lang] || {})[field];
      if (direct) return direct;
      if (lang === "es") return fallback;
      const en = field === "name" ? ext.nameEn : ext.descriptionEn;
      return en || (map.en || {})[field] || fallback;
    };
    return {
      name: pick("name", ext.name),
      description: pick("description", ext.description || "")
    };
  }

  const ExtHost = {
    state, init, refresh, sync, install, uninstall, setEnabled, localized,
    commandList, execute, completionsFor, statusItems, setEditor, emit,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    byId,
    reload(id) { destroy(id); spawn(id); }
  };

  window.ExtHost = ExtHost;
})();
