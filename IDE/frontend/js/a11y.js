/* Ely Cowork · Accesibilidad (paridad con VS Code).
 *
 * Réplica web de las piezas que viven en
 *   IDE/src/vs/workbench/contrib/accessibility/browser/
 *   IDE/src/vs/workbench/contrib/accessibilitySignals/browser/
 *   IDE/src/vs/editor/contrib/toggleTabFocusMode/
 *
 *   · Modo lector de pantalla + aviso al detectarlo   (accessibilityStatus.ts)
 *   · Vista accesible Alt+F2, Alt+] / Alt+[           (accessibleView*.ts)
 *   · Ayuda de accesibilidad Alt+F1                   (editorAccessibilityHelp.ts)
 *   · Señales accesibles: anuncio + sonido            (accessibility.signals.*)
 *   · Verbosidad y debounce de anuncios               (accessibility.signalOptions.*)
 *   · Atenuar vistas sin foco                         (accessibility.dimUnfocused.*)
 *   · Subrayar enlaces                                (accessibility.underlineLinks)
 *   · Tab mueve el foco (Ctrl+M)                      (toggleTabFocusMode)
 *   · Navegación por teclado de árbol, pestañas, menús y modales.
 *
 * Se carga en tiempo de ejecución desde app.js: index.html queda intacto.
 * Expone window.A11y.
 */
(function () {
  "use strict";

  const KEY = "ely.a11y.v1";

  const DEFAULTS = {
    screenReader: false,        // optimiza el editor para lector de pantalla
    announcements: true,        // anuncios aria-live
    announcePosition: true,     // anuncia línea/columna al mover el cursor
    verbosity: "normal",        // normal | verbose (texto de la línea)
    announceDelay: 250,         // debounce de posición (signalOptions.delays)
    sounds: false,              // señales sonoras
    volume: 0.3,                // accessibility.signals.sounds.volume
    highContrast: false,
    reducedMotion: false,
    underlineLinks: true,       // accessibility.underlineLinks
    dimUnfocused: false,        // accessibility.dimUnfocused.enabled
    dimOpacity: 0.55,           // accessibility.dimUnfocused.opacity
    fontScale: 1,
    lineHeight: 1.5,
    letterSpacing: 0,
    wordSpacing: 0,
    dyslexiaFont: false,
    largeTargets: false,
    focusRing: true,
    tabFocusMode: false,        // Ctrl+M
    promptShown: false
  };

  let values = load();
  const providers = new Map();
  let providerOrder = [];
  let viewNode = null;
  let viewProvider = null;
  let lastFocused = null;
  let audio = null;
  let livePolite = null;
  let liveAssertive = null;
  let positionTimer = null;
  let lastPosition = "";
  let App = null;
  let styleEl = null;
  let inputKind = "pointer";

  const L = (key, fallback) => {
    try {
      const value = window.t ? window.t(key) : key;
      return value === key && fallback ? fallback : value;
    } catch (e) { return fallback || key; }
  };

  function load() {
    try {
      const stored = JSON.parse(localStorage.getItem(KEY) || "{}");
      return Object.assign({}, DEFAULTS, stored);
    } catch (e) { return Object.assign({}, DEFAULTS); }
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(values)); } catch (e) { /* bloqueado */ }
  }

  /* ====================================================================
     Regiones vivas y enlaces de salto
     ==================================================================== */
  function ensureRegions() {
    if (!livePolite) {
      livePolite = document.getElementById("a11y-live");
      if (!livePolite) {
        livePolite = document.createElement("div");
        livePolite.id = "a11y-live";
        livePolite.className = "a11y-sr-only";
        livePolite.setAttribute("aria-live", "polite");
        livePolite.setAttribute("aria-atomic", "true");
        livePolite.setAttribute("role", "status");
        document.body.appendChild(livePolite);
      }
    }
    if (!liveAssertive) {
      liveAssertive = document.getElementById("a11y-alert");
      if (!liveAssertive) {
        liveAssertive = document.createElement("div");
        liveAssertive.id = "a11y-alert";
        liveAssertive.className = "a11y-sr-only";
        liveAssertive.setAttribute("aria-live", "assertive");
        liveAssertive.setAttribute("aria-atomic", "true");
        liveAssertive.setAttribute("role", "alert");
        document.body.appendChild(liveAssertive);
      }
    }
    if (!document.getElementById("a11y-skip")) {
      const skip = document.createElement("nav");
      skip.id = "a11y-skip";
      skip.setAttribute("aria-label", L("a11y.skipNav", "Saltar navegación"));
      const link = (target, label) => {
        const a = document.createElement("a");
        a.className = "a11y-skip-link";
        a.href = "#" + target;
        a.textContent = label;
        a.addEventListener("click", (event) => {
          event.preventDefault();
          const node = document.getElementById(target);
          if (!node) return;
          if (!node.hasAttribute("tabindex")) node.setAttribute("tabindex", "-1");
          node.focus();
          announce(label);
        });
        return a;
      };
      skip.appendChild(link("a11y-main", L("a11y.skipContent", "Saltar al contenido")));
      skip.appendChild(link("a11y-editor", L("a11y.skipEditor", "Saltar al editor")));
      skip.appendChild(link("a11y-nav", L("a11y.skipMenu", "Saltar a la navegación")));
      const help = document.createElement("button");
      help.className = "a11y-skip-link";
      help.type = "button";
      help.textContent = L("a11y.help", "Ayuda de accesibilidad");
      help.addEventListener("click", () => A11y.help());
      skip.appendChild(help);
      document.body.insertBefore(skip, document.body.firstChild);
    }
    /* Puntos de referencia: el HTML base no los declara. */
    const view = document.getElementById("view");
    if (view && !view.id.match(/^a11y-/)) {
      if (!document.getElementById("a11y-main")) {
        view.setAttribute("id", "view");
        const anchor = document.createElement("span");
        anchor.id = "a11y-main";
        anchor.setAttribute("tabindex", "-1");
        anchor.className = "a11y-sr-only";
        view.parentNode.insertBefore(anchor, view);
      }
      view.setAttribute("role", "main");
      view.setAttribute("aria-label", L("a11y.mainRegion", "Contenido principal"));
    }
    const aside = document.querySelector("aside");
    if (aside && !document.getElementById("a11y-nav")) {
      aside.id = aside.id || "a11y-nav";
      aside.setAttribute("aria-label", L("a11y.navRegion", "Navegación"));
    }
  }

  /* ====================================================================
     Anuncios y señales
     ==================================================================== */
  function announce(text, opts) {
    const o = opts || {};
    if (!text) return;
    if (!values.announcements && !o.force) return;
    ensureRegions();
    const node = o.assertive ? liveAssertive : livePolite;
    if (!node) return;
    /* Vaciar y reescribir fuerza al lector a repetir mensajes iguales. */
    node.textContent = "";
    setTimeout(() => { node.textContent = String(text); }, 30);
  }

  const SIGNALS = {
    save: { tone: 880, key: "a11y.sig.save" },
    format: { tone: 760, key: "a11y.sig.format" },
    clear: { tone: 420, key: "a11y.sig.clear" },
    taskCompleted: { tone: 900, key: "a11y.sig.taskOk" },
    taskFailed: { tone: 240, key: "a11y.sig.taskFail", assertive: true },
    terminalCommandSucceeded: { tone: 900, key: "a11y.sig.cmdOk" },
    terminalCommandFailed: { tone: 240, key: "a11y.sig.cmdFail", assertive: true },
    terminalBell: { tone: 1000, key: "a11y.sig.bell" },
    chatRequestSent: { tone: 660, key: "a11y.sig.chatSent" },
    chatResponseReceived: { tone: 820, key: "a11y.sig.chatReply" },
    chatUserActionRequired: { tone: 520, key: "a11y.sig.chatAction", assertive: true },
    lineHasError: { tone: 240, key: "a11y.sig.error", assertive: true },
    lineHasWarning: { tone: 400, key: "a11y.sig.warning" },
    progress: { tone: 600, key: "a11y.sig.progress" },
    open: { tone: 700, key: "a11y.sig.open" },
    close: { tone: 500, key: "a11y.sig.close" },
    editsKept: { tone: 880, key: "a11y.sig.kept" },
    editsUndone: { tone: 480, key: "a11y.sig.undone" }
  };

  function beep(freq) {
    if (!values.sounds) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      audio = audio || new Ctx();
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.value = Math.max(0, Math.min(1, Number(values.volume) || 0)) * 0.12;
      osc.connect(gain); gain.connect(audio.destination);
      const now = audio.currentTime;
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
      osc.start(now); osc.stop(now + 0.17);
    } catch (e) { /* sin audio: el anuncio sigue funcionando */ }
  }

  /** Señal accesible: anuncio + sonido opcional (como accessibility.signals.*). */
  function signal(name, detail) {
    const spec = SIGNALS[name];
    if (!spec) return;
    const label = L(spec.key, name);
    announce(detail ? label + ": " + detail : label, { assertive: !!spec.assertive });
    beep(spec.tone);
  }

  /* ====================================================================
     Aplicación de preferencias al documento
     ==================================================================== */
  function apply() {
    const root = document.documentElement;
    const motionOff = values.reducedMotion ||
      (window.Settings && Settings.get && Settings.get("reducedMotion")) ||
      (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    root.dataset.a11yScreenReader = values.screenReader ? "1" : "0";
    root.dataset.a11yContrast = values.highContrast ? "high" : "normal";
    root.dataset.a11yMotion = motionOff ? "reduced" : "full";
    root.dataset.a11yLinks = values.underlineLinks ? "underline" : "auto";
    root.dataset.a11yDim = values.dimUnfocused ? "1" : "0";
    root.dataset.a11yTargets = values.largeTargets ? "large" : "normal";
    root.dataset.a11yFont = values.dyslexiaFont ? "dyslexia" : "default";
    root.dataset.a11yFocus = values.focusRing ? "ring" : "minimal";
    root.dataset.a11yInput = inputKind;
    root.dataset.a11yTabFocus = values.tabFocusMode ? "1" : "0";

    if (!styleEl) {
      styleEl = document.getElementById("a11y-style");
      if (!styleEl) {
        styleEl = document.createElement("style");
        styleEl.id = "a11y-style";
        document.head.appendChild(styleEl);
      }
    }
    styleEl.textContent = [
      ":root {",
      "  --a11y-font-scale: " + Number(values.fontScale || 1) + ";",
      "  --a11y-line-height: " + Number(values.lineHeight || 1.5) + ";",
      "  --a11y-letter-spacing: " + Number(values.letterSpacing || 0) + "px;",
      "  --a11y-word-spacing: " + Number(values.wordSpacing || 0) + "px;",
      "  --a11y-dim-opacity: " + Number(values.dimOpacity || 0.55) + ";",
      "}"
    ].join("\n");
  }

  function set(patch) {
    values = Object.assign({}, values, patch);
    save();
    apply();
    if (Object.prototype.hasOwnProperty.call(patch, "screenReader")) {
      announce(patch.screenReader ? L("a11y.srOn", "Modo lector de pantalla activado")
        : L("a11y.srOff", "Modo lector de pantalla desactivado"), { force: true });
    }
    if (Object.prototype.hasOwnProperty.call(patch, "tabFocusMode")) {
      announce(patch.tabFocusMode ? L("a11y.tabFocusOn", "Tab mueve el foco")
        : L("a11y.tabFocusOff", "Tab indenta en el editor"), { force: true });
    }
    document.dispatchEvent(new CustomEvent("a11y:change", { detail: values }));
    return values;
  }

  /* ====================================================================
     Detección de tecnología de apoyo
     ==================================================================== */
  function forcedColors() {
    return !!(window.matchMedia && window.matchMedia("(forced-colors: active)").matches);
  }

  /** Los navegadores NO exponen si hay un lector de pantalla activo.
   *  Se usan señales indirectas (colores forzados del sistema) y siempre se
   *  pregunta, igual que VS Code; nunca se afirma haberlo detectado. */
  function maybePrompt() {
    if (values.promptShown || values.screenReader) return;
    if (!forcedColors()) return;
    set({ promptShown: true });
    if (!window.UI) return;
    const yes = UI.btn(L("a11y.promptYes", "Sí, activar"), () => { set({ screenReader: true }); ref.close(); }, { primary: true, small: true });
    const no = UI.btn(L("a11y.promptNo", "No"), () => ref.close(), { ghost: true, small: true });
    const ref = UI.modal({
      title: L("a11y.promptTitle", "Optimizar para lector de pantalla"),
      body: UI.el("p", { text: L("a11y.promptBody", "El sistema usa colores de alto contraste. ¿Quieres activar el modo lector de pantalla del editor?") }),
      footer: [no, yes]
    });
  }

  /* ====================================================================
     Vista accesible (Alt+F2)
     ==================================================================== */
  function registerView(id, spec) {
    providers.set(id, spec);
    if (!providerOrder.includes(id)) providerOrder.push(id);
    return () => { providers.delete(id); providerOrder = providerOrder.filter((p) => p !== id); };
  }

  function viewContent(id) {
    const spec = providers.get(id);
    if (!spec) return null;
    try {
      const data = typeof spec.get === "function" ? spec.get() : null;
      if (data == null) return null;
      if (typeof data === "string") return { title: spec.label, text: data };
      return { title: data.title || spec.label, text: data.text || "" };
    } catch (e) { return { title: spec.label, text: String(e.message || e) }; }
  }

  function availableProviders() {
    return providerOrder.filter((id) => {
      const spec = providers.get(id);
      return spec && (!spec.available || spec.available());
    });
  }

  function openView(id) {
    const list = availableProviders();
    if (!list.length) { announce(L("a11y.viewEmpty", "No hay contenido para la vista accesible"), { force: true }); return; }
    const chosen = id && list.includes(id) ? id : (viewProvider && list.includes(viewProvider) ? viewProvider : list[0]);
    const data = viewContent(chosen);
    if (!data) { announce(L("a11y.viewEmpty", "No hay contenido para la vista accesible"), { force: true }); return; }
    viewProvider = chosen;
    lastFocused = document.activeElement;

    if (!viewNode) {
      viewNode = UI.el("div", {
        id: "a11y-view", role: "dialog", "aria-modal": "true",
        "aria-labelledby": "a11y-view-title"
      });
      document.body.appendChild(viewNode);
    }
    UI.clear(viewNode);
    const title = UI.el("h2", { id: "a11y-view-title", text: L("a11y.view", "Vista accesible") + " · " + data.title });
    const index = list.indexOf(chosen) + 1;
    const meta = UI.el("div", { class: "a11y-view-meta", text: index + " / " + list.length });
    const close = UI.el("button", { class: "a11y-view-x", html: "&times;", "aria-label": L("common.close", "Cerrar"), onclick: closeView });
    const head = UI.el("div", { class: "a11y-view-head" }, [title, meta, close]);
    const body = UI.el("pre", {
      class: "a11y-view-body", tabindex: "0", role: "document",
      "aria-label": data.title, text: data.text || L("a11y.viewNoText", "(vacío)")
    });
    const prev = UI.el("button", { class: "btn sm ghost", text: "Alt+[ " + L("a11y.viewPrev", "Anterior"), onclick: () => cycleView(-1) });
    const next = UI.el("button", { class: "btn sm ghost", text: L("a11y.viewNext", "Siguiente") + " Alt+]", onclick: () => cycleView(1) });
    const foot = UI.el("div", { class: "a11y-view-foot" }, [
      prev, next,
      UI.el("span", { class: "muted", text: L("a11y.viewHint", "Escape para volver al editor") })
    ]);
    viewNode.appendChild(head); viewNode.appendChild(body); viewNode.appendChild(foot);
    viewNode.classList.add("open");
    trapFocus(viewNode);
    setTimeout(() => body.focus(), 40);
    announce(data.title + ". " + (data.text || "").slice(0, 300), { force: true });
  }

  function cycleView(step) {
    const list = availableProviders();
    if (!list.length) return;
    const i = Math.max(0, list.indexOf(viewProvider));
    openView(list[(i + step + list.length) % list.length]);
  }

  function closeView() {
    if (!viewNode) return;
    viewNode.classList.remove("open");
    UI.clear(viewNode);
    releaseFocus();
    announce(L("a11y.viewClosed", "Vista accesible cerrada"));
  }

  /* ====================================================================
     Ayuda de accesibilidad (Alt+F1)
     ==================================================================== */
  const HELP_GROUPS = [
    ["a11y.helpEditor", [
      ["Alt+F2", "a11y.k.view"], ["Alt+] / Alt+[", "a11y.k.viewCycle"],
      ["Alt+F1", "a11y.k.help"], ["Ctrl+M", "a11y.k.tabFocus"],
      ["Ctrl+Shift+P", "a11y.k.palette"], ["Ctrl+P", "a11y.k.quickOpen"],
      ["Ctrl+G", "a11y.k.gotoLine"], ["Alt+Z", "a11y.k.wrap"]
    ]],
    ["a11y.helpNav", [
      ["↑ ↓", "a11y.k.treeMove"], ["→ ←", "a11y.k.treeFold"],
      ["Enter", "a11y.k.treeOpen"], ["Supr", "a11y.k.delete"],
      ["Inicio / Fin", "a11y.k.ends"], ["Ctrl+B", "a11y.k.sidebar"],
      ["Ctrl+J / Ctrl+Ñ", "a11y.k.terminal"], ["F6", "a11y.k.nextRegion"]
    ]],
    ["a11y.helpChat", [
      ["Enter", "a11y.k.send"], ["Shift+Enter", "a11y.k.newline"],
      ["Alt+F2", "a11y.k.readReply"], ["Escape", "a11y.k.closeWidget"]
    ]]
  ];

  function help() {
    const box = UI.el("div", { class: "stack a11y-help" });
    box.appendChild(UI.el("p", { class: "muted", text: L("a11y.helpIntro", "Atajos pensados para teclado y lector de pantalla.") }));
    HELP_GROUPS.forEach(([groupKey, rows]) => {
      box.appendChild(UI.el("h3", { text: L(groupKey, groupKey) }));
      const table = UI.el("table", { class: "a11y-help-table" });
      const caption = UI.el("caption", { class: "a11y-sr-only", text: L(groupKey, groupKey) });
      table.appendChild(caption);
      rows.forEach(([keys, labelKey]) => {
        table.appendChild(UI.el("tr", null, [
          UI.el("th", { scope: "row" }, [UI.el("kbd", { text: keys })]),
          UI.el("td", { text: L(labelKey, labelKey) })
        ]));
      });
      box.appendChild(table);
    });
    const ref = UI.modal({
      title: L("a11y.helpTitle", "Ayuda de accesibilidad del editor"),
      body: box, wide: true,
      footer: [
        UI.btn(L("a11y.openSettings", "Ajustes de accesibilidad"), () => { ref.close(); openSettings(); }, { ghost: true }),
        UI.btn(L("common.close", "Cerrar"), () => ref.close(), { primary: true })
      ]
    });
    announce(L("a11y.helpTitle", "Ayuda de accesibilidad del editor"));
    return ref;
  }

  /* ====================================================================
     Foco: trampas y restauración
     ==================================================================== */
  const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
  const traps = new Map();

  function focusables(node) {
    return Array.from(node.querySelectorAll(FOCUSABLE)).filter((el) => el.offsetParent !== null || el === document.activeElement || el.getClientRects().length);
  }

  function trapFocus(node) {
    if (!node || traps.has(node)) return;
    const handler = (event) => {
      if (event.key !== "Tab") return;
      const items = focusables(node);
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || !node.contains(document.activeElement))) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    };
    node.addEventListener("keydown", handler);
    traps.set(node, handler);
  }

  function releaseFocus(fallback) {
    const node = lastFocused || fallback || null;
    lastFocused = null;
    if (node && document.body.contains(node) && node.focus) setTimeout(() => node.focus(), 0);
  }

  /* ====================================================================
     Navegación por teclado: árbol, pestañas, menús
     ==================================================================== */
  function tree(container, opts) {
    if (!container) return;
    const o = opts || {};
    const selector = o.selector || "[data-tree-item]";
    container.setAttribute("role", "tree");
    if (o.label) container.setAttribute("aria-label", o.label);
    const items = Array.from(container.querySelectorAll(selector));
    items.forEach((node, i) => {
      node.setAttribute("role", "treeitem");
      node.setAttribute("tabindex", i === 0 ? "0" : "-1");
      node.setAttribute("aria-setsize", String(items.length));
      node.setAttribute("aria-posinset", String(i + 1));
      const level = o.level ? o.level(node) : Number(node.dataset.depth || 0) + 1;
      node.setAttribute("aria-level", String(level));
      if (o.expandable && o.expandable(node)) {
        node.setAttribute("aria-expanded", o.expanded && o.expanded(node) ? "true" : "false");
      } else {
        node.removeAttribute("aria-expanded");
      }
      const selected = o.selected ? o.selected(node) : node.classList.contains("on");
      node.setAttribute("aria-selected", selected ? "true" : "false");
      if (selected) node.setAttribute("tabindex", "0");
      if (o.labelOf) node.setAttribute("aria-label", o.labelOf(node));
    });
    /* Un solo tabstop: el que estaba seleccionado o el primero. */
    const roving = items.filter((n) => n.getAttribute("tabindex") === "0");
    roving.slice(1).forEach((n) => n.setAttribute("tabindex", "-1"));

    if (container.__a11yTree) container.removeEventListener("keydown", container.__a11yTree);
    let buffer = "", bufferTimer = null;
    const handler = (event) => {
      const nodes = Array.from(container.querySelectorAll(selector));
      if (!nodes.length) return;
      const current = event.target.closest(selector);
      if (!current) return;
      const i = nodes.indexOf(current);
      const focusAt = (index) => {
        const node = nodes[Math.max(0, Math.min(nodes.length - 1, index))];
        if (!node) return;
        nodes.forEach((n) => n.setAttribute("tabindex", "-1"));
        node.setAttribute("tabindex", "0");
        node.focus();
      };
      const key = event.key;
      if (key === "ArrowDown") { event.preventDefault(); focusAt(i + 1); }
      else if (key === "ArrowUp") { event.preventDefault(); focusAt(i - 1); }
      else if (key === "Home") { event.preventDefault(); focusAt(0); }
      else if (key === "End") { event.preventDefault(); focusAt(nodes.length - 1); }
      else if (key === "ArrowRight") {
        event.preventDefault();
        if (o.expandable && o.expandable(current) && !(o.expanded && o.expanded(current))) {
          if (o.onToggle) o.onToggle(current, true);
        } else focusAt(i + 1);
      } else if (key === "ArrowLeft") {
        event.preventDefault();
        if (o.expandable && o.expandable(current) && o.expanded && o.expanded(current)) {
          if (o.onToggle) o.onToggle(current, false);
        } else {
          const level = Number(current.getAttribute("aria-level") || 1);
          for (let j = i - 1; j >= 0; j -= 1) {
            if (Number(nodes[j].getAttribute("aria-level") || 1) < level) { focusAt(j); break; }
          }
        }
      } else if (key === "Enter" || key === " ") {
        event.preventDefault();
        if (o.onActivate) o.onActivate(current);
        else current.click();
      } else if (key === "Delete" && o.onDelete) {
        event.preventDefault(); o.onDelete(current);
      } else if (key === "*" && o.onToggle) {
        event.preventDefault();
        nodes.filter((n) => o.expandable && o.expandable(n)).forEach((n) => o.onToggle(n, true));
      } else if (key.length === 1 && /\S/.test(key) && !event.ctrlKey && !event.metaKey && !event.altKey) {
        /* Typeahead como el explorador de VS Code. */
        buffer += key.toLowerCase();
        clearTimeout(bufferTimer);
        bufferTimer = setTimeout(() => { buffer = ""; }, 700);
        const text = (n) => (o.textOf ? o.textOf(n) : n.textContent).trim().toLowerCase();
        const found = nodes.slice(i + 1).concat(nodes.slice(0, i + 1)).find((n) => text(n).startsWith(buffer));
        if (found) focusAt(nodes.indexOf(found));
      }
    };
    container.addEventListener("keydown", handler);
    container.__a11yTree = handler;
  }

  function tablist(container, opts) {
    if (!container) return;
    const o = opts || {};
    const selector = o.selector || "[role='tab']";
    container.setAttribute("role", "tablist");
    if (o.label) container.setAttribute("aria-label", o.label);
    container.setAttribute("aria-orientation", "horizontal");
    const items = Array.from(container.querySelectorAll(selector));
    items.forEach((node, i) => {
      node.setAttribute("role", "tab");
      const selected = o.selected ? o.selected(node) : node.classList.contains("on");
      node.setAttribute("aria-selected", selected ? "true" : "false");
      node.setAttribute("tabindex", selected || (!items.some((n) => n.classList.contains("on")) && i === 0) ? "0" : "-1");
      if (o.controls) node.setAttribute("aria-controls", o.controls(node));
      if (o.labelOf) node.setAttribute("aria-label", o.labelOf(node));
    });
    if (container.__a11yTabs) container.removeEventListener("keydown", container.__a11yTabs);
    const handler = (event) => {
      const nodes = Array.from(container.querySelectorAll(selector));
      const current = event.target.closest(selector);
      if (!current || !nodes.length) return;
      const i = nodes.indexOf(current);
      const focusAt = (index) => {
        const node = nodes[(index + nodes.length) % nodes.length];
        nodes.forEach((n) => n.setAttribute("tabindex", "-1"));
        node.setAttribute("tabindex", "0");
        node.focus();
        if (o.autoSelect && o.onSelect) o.onSelect(node);
      };
      if (event.key === "ArrowRight") { event.preventDefault(); focusAt(i + 1); }
      else if (event.key === "ArrowLeft") { event.preventDefault(); focusAt(i - 1); }
      else if (event.key === "Home") { event.preventDefault(); focusAt(0); }
      else if (event.key === "End") { event.preventDefault(); focusAt(nodes.length - 1); }
      else if (event.key === "Enter" || event.key === " ") {
        event.preventDefault(); if (o.onSelect) o.onSelect(current); else current.click();
      } else if ((event.key === "Delete" || (event.key === "w" && (event.ctrlKey || event.metaKey))) && o.onClose) {
        event.preventDefault(); o.onClose(current);
      }
    };
    container.addEventListener("keydown", handler);
    container.__a11yTabs = handler;
  }

  function menu(container, opts) {
    if (!container) return;
    const o = opts || {};
    const selector = o.selector || "button, [role='menuitem']";
    container.setAttribute("role", o.role || "menu");
    const items = Array.from(container.querySelectorAll(selector));
    items.forEach((node, i) => {
      node.setAttribute("role", o.role === "toolbar" ? "button" : "menuitem");
      node.setAttribute("tabindex", i === 0 ? "0" : "-1");
    });
    if (container.__a11yMenu) container.removeEventListener("keydown", container.__a11yMenu);
    const handler = (event) => {
      const nodes = Array.from(container.querySelectorAll(selector));
      const current = event.target.closest(selector);
      if (!current || !nodes.length) return;
      const i = nodes.indexOf(current);
      const vertical = o.role !== "toolbar";
      const next = vertical ? "ArrowDown" : "ArrowRight";
      const prev = vertical ? "ArrowUp" : "ArrowLeft";
      const focusAt = (index) => {
        const node = nodes[(index + nodes.length) % nodes.length];
        nodes.forEach((n) => n.setAttribute("tabindex", "-1"));
        node.setAttribute("tabindex", "0");
        node.focus();
      };
      if (event.key === next) { event.preventDefault(); focusAt(i + 1); }
      else if (event.key === prev) { event.preventDefault(); focusAt(i - 1); }
      else if (event.key === "Home") { event.preventDefault(); focusAt(0); }
      else if (event.key === "End") { event.preventDefault(); focusAt(nodes.length - 1); }
      else if (event.key === "Escape" && o.onEscape) { event.preventDefault(); o.onEscape(); }
    };
    container.addEventListener("keydown", handler);
    container.__a11yMenu = handler;
  }

  /* ====================================================================
     Soporte del editor (textarea)
     ==================================================================== */
  function lineInfo(textarea) {
    const value = textarea.value || "";
    const pos = textarea.selectionStart || 0;
    const before = value.slice(0, pos);
    const line = before.split("\n").length;
    const col = pos - before.lastIndexOf("\n");
    const text = (value.split("\n")[line - 1] || "").trim();
    return { line, col, text };
  }

  function editor(textarea, opts) {
    if (!textarea) return;
    const o = opts || {};
    textarea.setAttribute("aria-label", o.label || L("a11y.editorLabel", "Editor de código"));
    textarea.setAttribute("aria-multiline", "true");
    textarea.setAttribute("autocomplete", "off");
    textarea.setAttribute("autocorrect", "off");
    textarea.setAttribute("autocapitalize", "off");
    if (o.lang) textarea.setAttribute("data-lang", o.lang);
    ensureRegions();
    let hint = document.getElementById("a11y-editor-hint");
    if (!hint) {
      hint = UI.el("div", { id: "a11y-editor-hint", class: "a11y-sr-only", text: L("a11y.editorHint", "Ctrl+M alterna que Tab mueva el foco. Alt+F2 abre la vista accesible. Alt+F1 muestra la ayuda.") });
      document.body.appendChild(hint);
    }
    textarea.setAttribute("aria-describedby", "a11y-editor-hint");

    const report = () => {
      if (!values.announcePosition || !values.screenReader) return;
      const info = lineInfo(textarea);
      const signature = info.line + ":" + info.col;
      if (signature === lastPosition) return;
      lastPosition = signature;
      clearTimeout(positionTimer);
      positionTimer = setTimeout(() => {
        const base = L("a11y.line", "Línea") + " " + info.line + ", " + L("a11y.column", "columna") + " " + info.col;
        announce(values.verbosity === "verbose" && info.text ? base + ". " + info.text : base);
        if (o.onPosition) o.onPosition(info);
      }, Math.max(0, Number(values.announceDelay) || 0));
    };
    ["keyup", "click", "focus"].forEach((evt) => textarea.addEventListener(evt, (event) => {
      if (evt === "keyup" && ["Shift", "Control", "Alt", "Meta"].includes(event.key)) return;
      report();
    }));
    /* Ctrl+M: Tab deja de indentar y pasa a mover el foco (VS Code). */
    textarea.addEventListener("keydown", (event) => {
      if (event.key === "Tab" && values.tabFocusMode) {
        event.stopPropagation();               // el editor no lo captura
        return;                                // comportamiento nativo del foco
      }
      if (event.key === "Escape" && values.tabFocusMode) {
        set({ tabFocusMode: false });
      }
    }, true);
    return { report, lineInfo: () => lineInfo(textarea) };
  }

  /* ====================================================================
     Panel de ajustes de accesibilidad
     ==================================================================== */
  function row(label, hint, control, id) {
    const labelEl = UI.el("label", { class: "a11y-set-label", for: id, text: label });
    return UI.el("div", { class: "a11y-set-row" }, [
      UI.el("div", { class: "grow" }, [
        labelEl,
        hint ? UI.el("div", { class: "muted a11y-set-hint", text: hint }) : null
      ]),
      control
    ]);
  }

  function toggle(name, label, hint) {
    const id = "a11y-set-" + name;
    const input = UI.el("input", {
      type: "checkbox", id, checked: !!values[name],
      onchange: (e) => set({ [name]: e.target.checked })
    });
    return row(label, hint, UI.el("span", { class: "switch" }, [input, UI.el("span")]), id);
  }

  function range(name, label, hint, min, max, step, unit) {
    const id = "a11y-set-" + name;
    const out = UI.el("output", { class: "a11y-range-out", for: id, text: String(values[name]) + (unit || "") });
    const input = UI.el("input", {
      type: "range", id, min, max, step, value: values[name],
      "aria-label": label,
      oninput: (e) => {
        const value = Number(e.target.value);
        out.textContent = String(value) + (unit || "");
        set({ [name]: value });
      }
    });
    return row(label, hint, UI.el("span", { class: "a11y-range" }, [input, out]), id);
  }

  function select(name, label, hint, options) {
    const id = "a11y-set-" + name;
    const control = UI.el("select", {
      id, "aria-label": label,
      onchange: (e) => set({ [name]: e.target.value })
    }, options.map(([value, text]) => UI.el("option", { value, selected: values[name] === value, text })));
    return row(label, hint, control, id);
  }

  function panel() {
    const box = UI.el("div", { class: "stack a11y-settings" });
    const group = (titleKey, nodes) => {
      const section = UI.el("section", { class: "a11y-set-group", "aria-labelledby": "a11y-g-" + titleKey });
      section.appendChild(UI.el("h3", { id: "a11y-g-" + titleKey, text: L(titleKey, titleKey) }));
      nodes.forEach((n) => section.appendChild(n));
      box.appendChild(section);
    };

    group("a11y.groupReader", [
      toggle("screenReader", L("a11y.screenReader", "Modo lector de pantalla"), L("a11y.screenReaderHint", "Anuncia línea, columna y eventos del editor.")),
      toggle("announcements", L("a11y.announcements", "Anuncios"), L("a11y.announcementsHint", "Mensajes para el lector de pantalla (aria-live).")),
      toggle("announcePosition", L("a11y.announcePosition", "Anunciar posición del cursor"), null),
      select("verbosity", L("a11y.verbosity", "Verbosidad"), L("a11y.verbosityHint", "«Detallada» lee también el texto de la línea."),
        [["normal", L("a11y.verbosityNormal", "Normal")], ["verbose", L("a11y.verbosityVerbose", "Detallada")]]),
      range("announceDelay", L("a11y.announceDelay", "Retraso de anuncios"), null, 0, 1500, 50, " ms"),
      UI.el("div", { class: "a11y-set-row" }, [
        UI.el("div", { class: "grow" }, [UI.el("div", { text: L("a11y.view", "Vista accesible") }),
          UI.el("div", { class: "muted a11y-set-hint", text: L("a11y.viewHint2", "Lee el archivo, la línea o la salida como texto plano (Alt+F2).") })]),
        UI.btn(L("a11y.openView", "Abrir"), () => openView(), { small: true })
      ])
    ]);

    group("a11y.groupSignals", [
      toggle("sounds", L("a11y.sounds", "Señales sonoras"), L("a11y.soundsHint", "Un tono breve al guardar, terminar una tarea o recibir respuesta.")),
      range("volume", L("a11y.volume", "Volumen"), null, 0, 1, 0.05),
      UI.el("div", { class: "a11y-set-row" }, [
        UI.el("div", { class: "grow" }, [UI.el("div", { text: L("a11y.testSignal", "Probar señal") })]),
        UI.btn(L("a11y.test", "Probar"), () => { set({ sounds: true }); signal("taskCompleted"); }, { small: true, ghost: true })
      ])
    ]);

    group("a11y.groupVisual", [
      toggle("highContrast", L("a11y.highContrast", "Alto contraste"), L("a11y.highContrastHint", "Bordes y texto con contraste máximo.")),
      toggle("reducedMotion", L("a11y.reducedMotion", "Reducir animaciones"), null),
      toggle("underlineLinks", L("a11y.underlineLinks", "Subrayar enlaces"), null),
      toggle("focusRing", L("a11y.focusRing", "Resaltar el foco"), L("a11y.focusRingHint", "Anillo visible alrededor del elemento enfocado.")),
      toggle("largeTargets", L("a11y.largeTargets", "Controles más grandes"), L("a11y.largeTargetsHint", "Áreas de clic de al menos 32 px.")),
      toggle("dimUnfocused", L("a11y.dimUnfocused", "Atenuar paneles sin foco"), null),
      range("dimOpacity", L("a11y.dimOpacity", "Opacidad de lo atenuado"), null, 0.2, 1, 0.05)
    ]);

    group("a11y.groupText", [
      range("fontScale", L("a11y.fontScale", "Tamaño de letra"), null, 0.85, 1.6, 0.05, "×"),
      range("lineHeight", L("a11y.lineHeight", "Interlineado"), null, 1.2, 2.2, 0.1),
      range("letterSpacing", L("a11y.letterSpacing", "Espacio entre letras"), null, 0, 3, 0.1, " px"),
      range("wordSpacing", L("a11y.wordSpacing", "Espacio entre palabras"), null, 0, 8, 0.5, " px"),
      toggle("dyslexiaFont", L("a11y.dyslexiaFont", "Tipografía legible"), L("a11y.dyslexiaFontHint", "Prioriza fuentes de alta legibilidad instaladas en el sistema."))
    ]);

    group("a11y.groupKeyboard", [
      toggle("tabFocusMode", L("a11y.tabFocusMode", "Tab mueve el foco (Ctrl+M)"), L("a11y.tabFocusModeHint", "Desactivado: Tab indenta dentro del editor.")),
      UI.el("div", { class: "a11y-set-row" }, [
        UI.el("div", { class: "grow" }, [UI.el("div", { text: L("a11y.helpTitle", "Ayuda de accesibilidad del editor") })]),
        UI.btn("Alt+F1", () => help(), { small: true, ghost: true })
      ])
    ]);

    box.appendChild(UI.el("div", { class: "a11y-set-row" }, [
      UI.el("div", { class: "grow" }, [UI.el("div", { class: "muted a11y-set-hint", text: L("a11y.resetHint", "Vuelve a los valores recomendados.") })]),
      UI.btn(L("a11y.reset", "Restablecer"), () => {
        values = Object.assign({}, DEFAULTS);
        save(); apply();
        document.dispatchEvent(new CustomEvent("a11y:change", { detail: values }));
        announce(L("a11y.resetDone", "Ajustes de accesibilidad restablecidos"), { force: true });
      }, { small: true, ghost: true })
    ]));
    return box;
  }

  function openSettings() {
    const holder = UI.el("div");
    const render = () => { UI.clear(holder); holder.appendChild(panel()); };
    render();
    document.addEventListener("a11y:change", render);
    const ref = UI.modal({
      title: L("a11y.settings", "Accesibilidad"),
      subtitle: L("a11y.settingsSub", "Lector de pantalla, señales, contraste y teclado"),
      body: holder, wide: true,
      footer: [UI.btn(L("common.close", "Cerrar"), () => ref.close(), { primary: true })],
      onClose: () => document.removeEventListener("a11y:change", render)
    });
    return ref;
  }

  /** Elemento para la barra de estado del IDE (como VS Code). */
  function statusItem() {
    const button = UI.el("button", {
      class: "a11y-status", type: "button",
      title: L("a11y.settings", "Accesibilidad"),
      "aria-label": L("a11y.settings", "Accesibilidad"),
      onclick: openSettings
    });
    const paint = () => {
      button.textContent = values.screenReader
        ? "♿ " + L("a11y.srBadge", "Lector de pantalla")
        : "♿";
      button.classList.toggle("on", !!values.screenReader);
    };
    paint();
    document.addEventListener("a11y:change", paint);
    return button;
  }

  /* ====================================================================
     Atajos globales y arranque
     ==================================================================== */
  function nextRegion() {
    const regions = [
      document.getElementById("a11y-nav"),
      document.querySelector(".vsc-sidebar"),
      document.getElementById("a11y-editor") || document.querySelector(".code-ta"),
      document.querySelector(".vsc-panel"),
      document.getElementById("view")
    ].filter(Boolean);
    if (!regions.length) return;
    const active = document.activeElement;
    const index = regions.findIndex((r) => r.contains(active));
    const next = regions[(index + 1) % regions.length];
    const target = next.matches(FOCUSABLE) ? next : next.querySelector(FOCUSABLE) || next;
    if (!target.hasAttribute("tabindex") && !target.matches(FOCUSABLE)) target.setAttribute("tabindex", "-1");
    target.focus();
    announce(next.getAttribute("aria-label") || L("a11y.region", "Región"));
  }

  function onKeydown(event) {
    const key = event.key;
    if (key === "Tab" && inputKind !== "keyboard") { inputKind = "keyboard"; apply(); }
    if (event.altKey && key === "F2") { event.preventDefault(); viewNode && viewNode.classList.contains("open") ? closeView() : openView(); return; }
    if (event.altKey && key === "F1") { event.preventDefault(); help(); return; }
    if (event.altKey && (key === "]" || key === "[") && viewNode && viewNode.classList.contains("open")) {
      event.preventDefault(); cycleView(key === "]" ? 1 : -1); return;
    }
    if (key === "Escape" && viewNode && viewNode.classList.contains("open")) { event.preventDefault(); closeView(); return; }
    if (key === "F6" && !event.ctrlKey && !event.metaKey) { event.preventDefault(); nextRegion(); return; }
    if ((event.ctrlKey || event.metaKey) && (key === "m" || key === "M")) {
      event.preventDefault(); set({ tabFocusMode: !values.tabFocusMode }); return;
    }
  }

  function init(app) {
    App = app || window.App || null;
    ensureRegions();
    apply();
    document.addEventListener("keydown", onKeydown, true);
    document.addEventListener("pointerdown", () => {
      if (inputKind !== "pointer") { inputKind = "pointer"; apply(); }
    }, true);
    if (window.matchMedia) {
      const mq = window.matchMedia("(forced-colors: active)");
      if (mq.addEventListener) mq.addEventListener("change", () => { apply(); maybePrompt(); });
    }
    setTimeout(maybePrompt, 1200);

    /* Proveedores por defecto de la vista accesible. */
    registerView("chat", {
      label: L("a11y.providerChat", "Última respuesta del chat"),
      available: () => !!(window.ChatStore && ChatStore.state.messages.length),
      get: () => {
        const messages = ChatStore.state.messages.filter((m) => m.content || m.error);
        const last = messages.slice(-4);
        return {
          title: L("a11y.providerChat", "Última respuesta del chat"),
          text: last.map((m) => (m.role === "user" ? L("chat.you", "Tú") : "Ely") + ": " + (m.content || m.error)).join("\n\n")
        };
      }
    });
    registerView("shortcuts", {
      label: L("a11y.providerKeys", "Atajos de teclado"),
      get: () => ({
        title: L("a11y.providerKeys", "Atajos de teclado"),
        text: HELP_GROUPS.map(([group, rows]) => L(group, group) + "\n" +
          rows.map(([keys, label]) => "  " + keys + " — " + L(label, label)).join("\n")).join("\n\n")
      })
    });
    return A11y;
  }

  const A11y = {
    defaults: DEFAULTS,
    init,
    get: (name) => values[name],
    all: () => Object.assign({}, values),
    set,
    apply,
    announce,
    signal,
    registerView,
    openView,
    closeView,
    cycleView,
    help,
    openSettings,
    panel,
    statusItem,
    tree,
    tablist,
    menu,
    trapFocus,
    releaseFocus,
    editor,
    lineInfo,
    nextRegion,
    forcedColors,
    isScreenReader: () => !!values.screenReader
  };

  window.A11y = A11y;
})();
