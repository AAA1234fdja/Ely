/* Ely Cowork · terminal integrada con el aspecto y el manejo de VS Code.
 *
 * - Varias terminales con su lista lateral (como el panel de VS Code).
 * - Perfiles reales detectados en el backend (bash, zsh, sh, PowerShell,
 *   Python, Node): el prompt se dibuja con el estilo de cada intérprete.
 * - Split (varios paneles en la misma terminal), papelera, renombrar, limpiar.
 * - Menú «+» con Nueva terminal, Nueva ventana, Dividir, perfiles, Dividir con
 *   perfil, Configurar terminal, Perfil predeterminado, Ejecutar tarea…
 *
 * La ejecución es real: cada línea va a POST /api/terminal/exec con el perfil
 * elegido y el cwd del panel. No es un PTY: no hay comandos interactivos.
 * Expone window.Terminal.
 */
(function () {
  "use strict";

  const T = (k) => (window.t ? window.t(k) : k);
  const MAX_PANES = 3;
  const MAX_ROWS = 800;

  /* El estado vive a nivel de módulo: cambiar de vista no mata la terminal. */
  const S = {
    ready: false, loading: null, info: null, profiles: [], defaultId: "",
    terms: [], active: null, seq: 0, paneSeq: 0,
    hooks: {}, host: null, toolbarHost: null
  };

  const G = () => window.Glyph;
  function say(msg) { if (window.A11y) window.A11y.announce(msg); }
  function sig(name, detail) { if (window.A11y) window.A11y.signal(name, detail); }
  function toast(kind, msg) { if (window.UI) UI.toast(kind, msg); }
  function log(line) { if (window.Output) Output.log("Terminal", line); }

  /* ------------------------------------------------------------ modelo */
  function profile(id) {
    return S.profiles.find((p) => p.id === (id || S.defaultId)) || S.profiles[0] || { id: "sh", label: "sh", kind: "shell" };
  }
  function newPane(profileId) {
    S.paneSeq += 1;
    return { id: "p" + S.paneSeq, profile: profileId, cwd: "", rows: [], history: [], hidx: 0, busy: false, code: 0 };
  }
  function activeTerm() { return S.terms.find((t) => t.id === S.active) || null; }
  function activePane() {
    const t = activeTerm();
    if (!t) return null;
    return t.panes.find((p) => p.id === t.focus) || t.panes[0];
  }
  function isolationMode() {
    try {
      const saved = localStorage.getItem("ely.terminalIsolationMode");
      return ["read_only", "workspace", "full"].includes(saved) ? saved : "full";
    } catch (e) { return "full"; }
  }

  async function load() {
    if (S.ready) return S.info;
    if (S.loading) return S.loading;
    S.loading = (async () => {
      try {
        const info = await API.ide("term_profiles", {});
        S.info = info;
        S.profiles = info.profiles || [];
        const saved = localStorage.getItem("ely.termProfile");
        S.defaultId = (saved && S.profiles.some((p) => p.id === saved)) ? saved : info.default;
        S.ready = true;
        return info;
      } catch (e) {
        S.profiles = [{ id: "sh", label: "sh", kind: "shell" }];
        S.defaultId = "sh";
        S.info = { user: "ely", host: "workspace", home: "", root: "", rootName: "workspace", sep: "/" };
        S.ready = true;
        return S.info;
      } finally { S.loading = null; }
    })();
    return S.loading;
  }

  function create(profileId, opts) {
    const o = opts || {};
    const pid = (profileId || S.defaultId || "sh");
    S.seq += 1;
    const pane = newPane(pid);
    const term = {
      id: "t" + S.seq, n: S.seq, name: profile(pid).label,
      profile: pid, panes: [pane], focus: pane.id
    };
    S.terms.push(term);
    S.active = term.id;
    pane.rows.push({ kind: "info", text: banner(pid) });
    log("— " + T("term.new") + " #" + term.n + " (" + profile(pid).label + ")");
    if (!o.silent) { say(T("term.new") + ": " + term.name); }
    paint();
    return term;
  }

  function banner(pid) {
    const p = profile(pid);
    return "Ely · " + p.label + (p.path ? " (" + p.path + ")" : "") + " · " + T("term.hint");
  }

  function split(profileId) {
    const t = activeTerm();
    if (!t) return create(profileId);
    if (t.panes.length >= MAX_PANES) { toast("warn", T("term.splitLimit")); return null; }
    const pane = newPane(profileId || t.profile);
    pane.cwd = (activePane() || {}).cwd || "";
    pane.rows.push({ kind: "info", text: banner(pane.profile) });
    t.panes.push(pane);
    t.focus = pane.id;
    say(T("term.split"));
    paint();
    return pane;
  }

  function kill(id) {
    const term = S.terms.find((t) => t.id === (id || S.active));
    if (!term) return;
    S.terms = S.terms.filter((t) => t !== term);
    log("— " + T("term.killed") + " #" + term.n);
    if (S.active === term.id) S.active = (S.terms[S.terms.length - 1] || {}).id || null;
    say(T("term.killed") + ": " + term.name);
    sig("terminalCommandFailed", "kill " + term.name);
    paint();
  }

  function killAll() {
    const n = S.terms.length;
    S.terms = []; S.active = null;
    say(T("term.killAll") + " (" + n + ")");
    paint();
  }

  function clearActive() {
    const p = activePane();
    if (!p) return;
    p.rows = [];
    paint();
  }

  function rename() {
    const t = activeTerm();
    if (!t) return;
    if (S.hooks.pick) {
      S.hooks.pick({
        title: T("term.rename"), placeholder: t.name, value: t.name,
        items: [{ id: "name", label: t.name, detail: T("term.renameHint") }],
        onInput: (q, item) => { item.label = q || t.name; },
        onPick: (item) => { t.name = item.label || t.name; paint(); say(T("term.renamed") + ": " + t.name); }
      });
      return;
    }
    const n = prompt(T("term.rename"), t.name);
    if (n) { t.name = n; paint(); }
  }

  function setDefault(pid) {
    S.defaultId = pid;
    localStorage.setItem("ely.termProfile", pid);
    toast("ok", T("term.defaultIs") + " " + profile(pid).label);
    paint();
  }

  function selectDefault() {
    const items = S.profiles.map((p) => ({
      id: p.id, label: p.label, description: p.path || "",
      detail: p.id === S.defaultId ? T("term.defaultProfile") : ""
    }));
    if (S.hooks.pick) S.hooks.pick({ title: T("term.selectDefault"), placeholder: T("term.selectDefault"), items, onPick: (it) => setDefault(it.id) });
  }

  /* ------------------------------------------------------------ prompt */
  function cwdAbs(cwd) {
    const info = S.info || {};
    const root = info.root || "";
    const rel = String(cwd || "").replace(/^\/+/, "");
    if (!rel) return root || "~";
    return root ? root.replace(/\/+$/, "") + "/" + rel : rel;
  }
  function shortCwd(cwd) {
    const abs = cwdAbs(cwd);
    const home = (S.info || {}).home || "";
    return home && abs.startsWith(home) ? "~" + abs.slice(home.length) : abs;
  }
  function promptText(pane) {
    const p = profile(pane.profile);
    const info = S.info || {};
    if (p.id === "pwsh") return "PS " + shortCwd(pane.cwd) + ">";
    if (p.kind === "repl") return p.id === "python" ? ">>>" : ">";
    return (info.user || "ely") + "@" + (info.host || "ely") + ":" + (shortCwd(pane.cwd) || "~") + "$";
  }

  /* ------------------------------------------------------------ ejecución */
  async function run(cmd, pane) {
    const p = pane || activePane();
    if (!p) return;
    const text = String(cmd == null ? "" : cmd);
    const prompt = promptText(p);
    p.rows.push({ kind: "cmd", text: text, prompt: prompt });
    p.history.push(text); p.hidx = p.history.length;
    log(prompt + " " + text);
    const trimmed = text.trim();
    if (!trimmed) { paint(); return; }
    const mode = isolationMode();
    const isCd = /^(cd)(\s|$)/.test(trimmed);
    if (trimmed === "clear" || trimmed === "cls" || trimmed === "Clear-Host") { p.rows = []; paint(); return; }
    if (trimmed === "exit") {
      const t = activeTerm();
      if (t && t.panes.length > 1) { t.panes = t.panes.filter((x) => x !== p); t.focus = t.panes[0].id; paint(); }
      else kill();
      return;
    }
    if (mode === "full" && !isCd && !window.confirm("Acceso total: este comando puede leer o modificar archivos del usuario y usar la red. ¿Ejecutarlo ahora?")) {
      p.rows.push({ kind: "info", text: "Comando cancelado; no se ejecutó." });
      paint();
      return;
    }
    p.busy = true; paint();
    try {
      const r = await API.terminal(text, p.cwd, p.profile, mode, mode === "full");
      p.cwd = r.cwd || p.cwd;
      p.code = r.code == null ? 0 : r.code;
      if (r.stdout) { p.rows.push({ kind: "out", text: r.stdout.replace(/\n$/, "") }); log(r.stdout.replace(/\n$/, "")); }
      if (r.stderr) { p.rows.push({ kind: "err", text: r.stderr.replace(/\n$/, "") }); log("[stderr] " + r.stderr.replace(/\n$/, "")); }
      sig(p.code === 0 ? "terminalCommandSucceeded" : "terminalCommandFailed", text);
    } catch (e) {
      p.code = 1;
      p.rows.push({ kind: "err", text: e.message });
      log("[error] " + e.message);
      sig("terminalCommandFailed", e.message);
    }
    p.busy = false;
    if (p.rows.length > MAX_ROWS) p.rows = p.rows.slice(-MAX_ROWS);
    paint();
  }

  /* Ejecuta el archivo activo con el intérprete que le toca (botón ▷). */
  const RUNNERS = {
    py: "python3", js: "node", mjs: "node", cjs: "node", ts: "npx tsx",
    sh: "bash", bash: "bash", zsh: "zsh", ps1: "pwsh", rb: "ruby",
    php: "php", pl: "perl", lua: "lua", r: "Rscript", jl: "julia"
  };
  function runFile(path) {
    const ext = String(path || "").split(".").pop().toLowerCase();
    const bin = RUNNERS[ext];
    if (!bin) { toast("warn", T("term.noRunner") + " (." + ext + ")"); return null; }
    if (!S.terms.length) create();
    const cmd = bin + " " + JSON.stringify(String(path));
    return run(cmd);
  }

  /* ------------------------------------------------------------ tareas */
  async function taskItems() {
    try {
      const r = await API.ide("tasks_list", {});
      return (r.tasks || []).map((task) => ({
        id: task.label, label: task.label, description: task.command || "",
        detail: task.detail || ""
      }));
    } catch (e) { return []; }
  }
  async function runTask() {
    const items = await taskItems();
    if (!items.length) {
      toast("warn", T("term.noTasks"));
      configureTasks();
      return;
    }
    if (S.hooks.pick) {
      S.hooks.pick({
        title: T("term.runTask"), placeholder: T("term.runTask"), items,
        onPick: async (it) => {
          if (!S.terms.length) create();
          if (window.Output) Output.log("Tasks", "▶ " + it.label + " · " + it.description);
          await run(it.description || it.label);
          if (window.Output) Output.setChannel("Tasks");
        }
      });
    }
  }
  async function configureTasks() {
    const path = ".ely/tasks.json";
    try {
      await API.ide("fs_create", {
        path, content: JSON.stringify({
          version: "2.0.0",
          tasks: [{ label: "echo", command: "echo hola desde una tarea", detail: "Tarea de ejemplo" }]
        }, null, 2) + "\n"
      });
    } catch (e) { /* ya existe: se abre igual */ }
    if (S.hooks.openFile) S.hooks.openFile(path);
    say(T("term.configureTasks"));
  }

  /* ------------------------------------------------------------ menús */
  function menuAt(node, items) {
    const r = node.getBoundingClientRect();
    if (S.hooks.menu) S.hooks.menu(r.left, r.bottom + 2, items);
  }
  function profileItems(action) {
    return S.profiles.map((p) => ({ label: p.label, action: () => action(p.id) }));
  }
  function newMenu(node) {
    menuAt(node, [
      { label: T("term.new"), key: "Ctrl+Shift+Ñ", action: () => create() },
      { label: T("term.newWindow"), key: "Ctrl+Shift+Alt+Ñ", action: newWindow },
      { label: T("term.split"), key: "Ctrl+Shift+5", action: () => split() },
      "-",
      ...profileItems((pid) => create(pid)),
      { label: T("term.splitWith"), submenu: profileItems((pid) => split(pid)) },
      "-",
      { label: T("term.settings"), action: () => S.hooks.settings && S.hooks.settings("terminal") },
      { label: T("term.selectDefault"), action: selectDefault },
      "-",
      { label: T("term.runTask"), action: runTask },
      { label: T("term.configureTasks"), action: configureTasks }
    ]);
  }
  function moreMenu(node) {
    const t = activeTerm();
    menuAt(node, [
      { label: T("term.clear"), action: clearActive },
      { label: T("term.rename"), action: rename },
      { label: T("term.split"), key: "Ctrl+Shift+5", action: () => split() },
      "-",
      { label: T("term.copyAll"), action: copyAll },
      { label: T("term.selectAll"), action: selectAll },
      "-",
      { label: T("term.kill"), action: () => kill() },
      { label: T("term.killAll"), action: killAll },
      "-",
      { label: T("term.settings"), action: () => S.hooks.settings && S.hooks.settings("terminal") },
      { label: T("term.selectDefault"), action: selectDefault },
      { label: T("term.runTask"), action: runTask }
    ].filter((it) => it === "-" || !it.label || t || it.action === create));
  }
  function newWindow() {
    const url = location.pathname.replace(/[^/]*$/, "") + "index.html?terminal=1";
    window.open(url, "_blank", "noopener");
    say(T("term.newWindow"));
  }
  function paneText(p) {
    return p.rows.map((r) => (r.kind === "cmd" ? r.prompt + " " + r.text : r.text)).join("\n");
  }
  function copyAll() {
    const p = activePane();
    if (!p) return;
    const text = paneText(p);
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => toast("ok", T("term.copied")), () => {});
  }
  function selectAll() {
    const out = S.host && S.host.querySelector(".vsc-term-pane.on .vsc-term-out");
    if (!out) return;
    const range = document.createRange();
    range.selectNodeContents(out);
    const sel = window.getSelection();
    sel.removeAllRanges(); sel.addRange(range);
  }

  /* ------------------------------------------------------------ toolbar */
  function toolbar() {
    const nodes = [];
    if (!G()) return nodes;
    const t = activeTerm();
    const p = activePane();
    const prof = profile(p ? p.profile : S.defaultId);
    const label = G().button("terminal", T("term.profile") + ": " + prof.label, (e) => {
      menuAt(e.currentTarget, profileItems((pid) => {
        const pane = activePane();
        if (pane) { pane.profile = pid; pane.rows.push({ kind: "info", text: banner(pid) }); paint(); }
      }));
    }, { cls: "vsc-tb-profile", text: prof.label, haspopup: true });
    label.appendChild(G().svg("chevronDown", 12));
    nodes.push(label);
    const isolation = UI.el("select", {
      class: "vsc-tb-isolation",
      title: "Modo de aislamiento de comandos",
      "aria-label": "Modo de aislamiento de comandos",
      onchange: (e) => {
        try { localStorage.setItem("ely.terminalIsolationMode", e.target.value); } catch (err) { /* noop */ }
      }
    }, [
      UI.el("option", { value: "read_only", text: "Solo lectura" }),
      UI.el("option", { value: "workspace", text: "Workspace aislado" }),
      UI.el("option", { value: "full", text: "Acceso total" })
    ]);
    isolation.value = isolationMode();
    nodes.push(isolation);
    const group = UI.el("div", { class: "vsc-tb-group" });
    group.appendChild(G().button("plus", T("term.new") + " (Ctrl+Shift+Ñ)", () => create()));
    group.appendChild(G().button("chevronDown", T("term.newMenu"), (e) => newMenu(e.currentTarget), { haspopup: true, size: 12, cls: "vsc-tb-caret" }));
    nodes.push(group);
    nodes.push(G().button("split", T("term.split") + " (Ctrl+Shift+5)", () => split()));
    nodes.push(G().button("trash", T("term.kill"), () => kill()));
    nodes.push(G().button("ellipsis", T("term.more"), (e) => moreMenu(e.currentTarget), { haspopup: true }));
    return nodes;
  }

  /* ------------------------------------------------------------ render */
  function rowNode(row) {
    if (row.kind === "cmd") {
      return UI.el("div", { class: "vsc-term-row cmd" }, [
        UI.el("span", { class: "vsc-term-deco " + (row.code === 0 || row.code == null ? "" : "err"), "aria-hidden": "true" }),
        UI.el("span", { class: "vsc-term-prompt", text: row.prompt }),
        UI.el("span", { class: "vsc-term-cmd", text: " " + row.text })
      ]);
    }
    if (row.kind === "info") return UI.el("div", { class: "vsc-term-row info", text: row.text });
    return UI.el("pre", { class: "vsc-term-pre" + (row.kind === "err" ? " err" : ""), text: row.text });
  }

  function paneNode(term, pane) {
    const on = term.focus === pane.id;
    const box = UI.el("div", {
      class: "vsc-term-pane" + (on ? " on" : ""), "data-pane": pane.id,
      role: "group", "aria-label": T("term.pane") + " " + profile(pane.profile).label
    });
    const out = UI.el("div", {
      class: "vsc-term-out", role: "log", "aria-live": "polite",
      "aria-label": T("term.output"), tabindex: "0"
    });
    pane.rows.forEach((r) => out.appendChild(rowNode(r)));
    box.appendChild(out);
    const line = UI.el("div", { class: "vsc-term-row input" }, [
      UI.el("span", {
        class: "vsc-term-deco " + (pane.busy ? "run" : (pane.code ? "err" : "ok")),
        "aria-hidden": "true"
      }),
      UI.el("span", { class: "vsc-term-prompt", text: promptText(pane) })
    ]);
    const input = UI.el("input", {
      class: "vsc-term-input", spellcheck: "false", autocomplete: "off",
      "aria-label": T("term.input") + " · " + profile(pane.profile).label,
      disabled: pane.busy ? "true" : null
    });
    line.appendChild(input);
    box.appendChild(line);
    box.addEventListener("mousedown", () => {
      if (term.focus !== pane.id) { term.focus = pane.id; S.active = term.id; paint(); }
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); const v = input.value; input.value = ""; run(v, pane); }
      else if (e.key === "ArrowUp") { e.preventDefault(); if (pane.hidx > 0) input.value = pane.history[--pane.hidx] || ""; }
      else if (e.key === "ArrowDown") { e.preventDefault(); if (pane.hidx < pane.history.length) input.value = pane.history[++pane.hidx] || ""; }
      else if (e.key === "l" && e.ctrlKey) { e.preventDefault(); pane.rows = []; paint(); }
      else if (e.key === "Tab" && window.A11y && window.A11y.tabFocusMode && window.A11y.tabFocusMode()) { /* el Tab sale del panel */ }
    });
    pane._input = input;
    pane._out = out;
    return box;
  }

  function tabsNode() {
    const list = UI.el("div", { class: "vsc-term-tabs", role: "tablist", "aria-label": T("term.list") });
    S.terms.forEach((t) => {
      const on = t.id === S.active;
      const row = UI.el("div", {
        class: "vsc-term-tab" + (on ? " on" : ""), role: "tab", tabindex: on ? "0" : "-1",
        "aria-selected": on ? "true" : "false", "data-term": t.id,
        title: t.name + " · " + t.panes.map((p) => profile(p.profile).label).join(" | ")
      }, [
        G() ? G().svg("terminal", 14) : UI.el("span", { text: ">" }),
        UI.el("span", { class: "vsc-term-tab-name", text: t.n + ": " + t.name }),
        t.panes.length > 1 ? UI.el("span", { class: "vsc-term-tab-split", text: "⊟" }) : null,
        UI.el("button", {
          class: "vsc-term-tab-kill", "aria-label": T("term.kill") + " " + t.name, title: T("term.kill"),
          onclick: (e) => { e.stopPropagation(); kill(t.id); }
        }, [G() ? G().svg("close", 12) : "×"])
      ]);
      row.addEventListener("click", () => { S.active = t.id; paint(); });
      row.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        S.active = t.id; paint();
        if (S.hooks.menu) {
          S.hooks.menu(e.clientX, e.clientY, [
            { label: T("term.rename"), action: rename },
            { label: T("term.split"), action: () => split() },
            { label: T("term.clear"), action: clearActive },
            "-",
            { label: T("term.kill"), action: () => kill(t.id) }
          ]);
        }
      });
      list.appendChild(row);
    });
    if (window.A11y) {
      A11y.tablist(list, {
        selector: ".vsc-term-tab", label: T("term.list"),
        onSelect: (n) => { S.active = n.dataset.term; paint(); },
        selected: (n) => n.dataset.term === S.active,
        labelOf: (n) => n.textContent
      });
    }
    return list;
  }

  function paint() {
    if (!S.host) return;
    const focusId = document.activeElement && document.activeElement.classList &&
      document.activeElement.classList.contains("vsc-term-input") ? (activePane() || {}).id : null;
    UI.clear(S.host);
    S.host.classList.add("vsc-term-wrap");
    if (!S.terms.length) {
      const empty = UI.el("div", { class: "vsc-term-empty" }, [
        UI.el("div", { text: T("term.none") }),
        UI.el("button", { class: "vsc-btn-primary", text: T("term.new"), onclick: () => create() })
      ]);
      S.host.appendChild(empty);
      refreshToolbar();
      return;
    }
    const term = activeTerm();
    const panes = UI.el("div", { class: "vsc-term-panes" + (term.panes.length > 1 ? " split" : "") });
    term.panes.forEach((p) => panes.appendChild(paneNode(term, p)));
    S.host.appendChild(panes);
    if (S.terms.length > 1) S.host.appendChild(tabsNode());
    const pane = activePane();
    if (pane && pane._out) pane._out.scrollTop = pane._out.scrollHeight;
    if (focusId && pane && pane._input) pane._input.focus();
    refreshToolbar();
  }

  function refreshToolbar() {
    if (S.hooks.refreshToolbar) S.hooks.refreshToolbar();
  }

  /* ------------------------------------------------------------ API pública */
  window.Terminal = {
    init(hooks) { S.hooks = hooks || {}; return load(); },
    async mount(host) {
      S.host = host;
      await load();
      if (!S.terms.length) create(null, { silent: true });
      else paint();
      return host;
    },
    unmount() { S.host = null; },
    toolbar,
    create, split, kill, killAll, clear: clearActive, rename, run, runFile, runTask,
    configureTasks, selectDefault, setDefault, newWindow, newMenu,
    focus() { const p = activePane(); if (p && p._input) p._input.focus(); },
    count: () => S.terms.length,
    paneCount: () => (activeTerm() ? activeTerm().panes.length : 0),
    activeName() { const t = activeTerm(); return t ? t.n + ": " + t.name : ""; },
    activeProfile: () => profile((activePane() || {}).profile).id,
    profiles: () => S.profiles.slice(),
    defaultProfile: () => S.defaultId,
    prompt: () => promptText(activePane() || newPane(S.defaultId)),
    text: () => paneText(activePane() || newPane(S.defaultId)),
    terms: () => S.terms.map((t) => ({ id: t.id, name: t.name, n: t.n, panes: t.panes.length, profile: t.profile })),
    ready: () => S.ready
  };
})();
