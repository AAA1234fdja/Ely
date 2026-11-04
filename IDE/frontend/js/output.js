/* Ely Cowork · panel Salida (Output) con canales y filtro, como VS Code.
 *
 * Cada subsistema escribe en su canal real: Terminal, Tasks, Extension Host,
 * Git, Ely (backend) y Window (errores del navegador). El selector de canal y
 * el filtro (`texto`, `!excluido`) funcionan sobre el búfer de cada canal.
 * Expone window.Output.
 */
(function () {
  "use strict";

  const T = (k) => (window.t ? window.t(k) : k);
  const MAX = 2000;

  /* Canales con contenido real; el orden es el del desplegable de VS Code. */
  const CHANNELS = ["Tasks", "Ely", "Extension Host", "Git", "Terminal", "Window"];

  const S = {
    buffers: {}, channel: localStorage.getItem("ely.outputChannel") || "Tasks",
    filter: "", locked: false, stamps: true, host: null, hooks: {}
  };
  CHANNELS.forEach((c) => { S.buffers[c] = []; });
  if (!S.buffers[S.channel]) S.channel = "Tasks";

  function stamp() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds()) + "." + String(d.getMilliseconds()).padStart(3, "0");
  }

  function log(channel, text) {
    const name = S.buffers[channel] ? channel : "Ely";
    const buf = S.buffers[name];
    String(text == null ? "" : text).split("\n").forEach((line) => {
      buf.push({ at: stamp(), text: line });
    });
    if (buf.length > MAX) S.buffers[name] = buf.slice(-MAX);
    if (S.host && S.channel === name) paint();
  }

  function matches(line, filter) {
    if (!filter) return true;
    const tokens = filter.toLowerCase().match(/"[^"]*"|\S+/g) || [];
    let included = false, hasInclude = false;
    for (let raw of tokens) {
      const neg = raw.startsWith("!");
      if (neg) raw = raw.slice(1);
      const tok = raw.replace(/^"|"$/g, "");
      if (!tok) continue;
      const hit = line.toLowerCase().includes(tok);
      if (neg) { if (hit) return false; }
      else { hasInclude = true; if (hit) included = true; }
    }
    return !hasInclude || included;
  }

  function visible() {
    return (S.buffers[S.channel] || []).filter((l) => matches(l.text, S.filter));
  }

  function paint() {
    if (!S.host) return;
    const stick = !S.locked;
    UI.clear(S.host);
    S.host.classList.add("vsc-out-wrap");
    const pre = UI.el("div", {
      class: "vsc-out-body", role: "log", "aria-live": "polite",
      "aria-label": T("out.title") + " · " + S.channel, tabindex: "0"
    });
    const rows = visible();
    if (!rows.length) {
      pre.appendChild(UI.el("div", { class: "vsc-out-empty", text: S.filter ? T("out.noMatch") : T("out.empty") }));
    } else {
      rows.forEach((l) => pre.appendChild(UI.el("div", { class: "vsc-out-line" }, [
        S.stamps ? UI.el("span", { class: "vsc-out-at", text: "[" + l.at + "]" }) : null,
        UI.el("span", { class: "vsc-out-text", text: l.text })
      ])));
    }
    S.host.appendChild(pre);
    if (stick) pre.scrollTop = pre.scrollHeight;
    S._body = pre;
  }

  function setChannel(id) {
    if (!S.buffers[id]) return;
    S.channel = id;
    localStorage.setItem("ely.outputChannel", id);
    paint();
    if (S.hooks.refreshToolbar) S.hooks.refreshToolbar();
    if (window.A11y) A11y.announce(T("out.channel") + ": " + id);
  }

  function clear() {
    S.buffers[S.channel] = [];
    paint();
    if (window.A11y) A11y.announce(T("out.cleared"));
  }

  function copyAll() {
    const text = visible().map((l) => "[" + l.at + "] " + l.text).join("\n");
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => UI.toast("ok", T("out.copied")), () => {});
  }

  function toolbar() {
    const nodes = [];
    const filter = UI.el("input", {
      class: "vsc-out-filter", type: "search", value: S.filter,
      placeholder: T("out.filterPlaceholder"), "aria-label": T("out.filter")
    });
    filter.addEventListener("input", () => { S.filter = filter.value; paint(); });
    nodes.push(filter);
    const select = UI.el("select", { class: "vsc-out-select", "aria-label": T("out.channel") });
    CHANNELS.forEach((c) => {
      const opt = UI.el("option", { value: c, text: c + (S.buffers[c].length ? " (" + S.buffers[c].length + ")" : "") });
      if (c === S.channel) opt.selected = true;
      select.appendChild(opt);
    });
    select.addEventListener("change", () => setChannel(select.value));
    nodes.push(select);
    if (window.Glyph) {
      nodes.push(Glyph.button("clear", T("out.clear"), clear));
      nodes.push(Glyph.button(S.locked ? "lock" : "unlock", T("out.lock"), (e) => {
        S.locked = !S.locked;
        if (S.hooks.refreshToolbar) S.hooks.refreshToolbar();
        paint();
      }, { pressed: S.locked }));
      nodes.push(Glyph.button("ellipsis", T("out.more"), (e) => {
        const r = e.currentTarget.getBoundingClientRect();
        if (!S.hooks.menu) return;
        S.hooks.menu(r.left, r.bottom + 2, [
          { label: T("out.clear"), action: clear },
          { label: T("out.copy"), action: copyAll },
          { label: T("out.stamps"), checked: S.stamps, action: () => { S.stamps = !S.stamps; paint(); } },
          { label: T("out.lock"), checked: S.locked, action: () => { S.locked = !S.locked; paint(); if (S.hooks.refreshToolbar) S.hooks.refreshToolbar(); } }
        ]);
      }, { haspopup: true }));
    }
    return nodes;
  }

  window.Output = {
    init(hooks) {
      S.hooks = hooks || {};
      /* Errores reales del navegador al canal Window. */
      window.addEventListener("error", (e) => log("Window", (e.message || "error") + (e.filename ? " · " + e.filename + ":" + e.lineno : "")));
      window.addEventListener("unhandledrejection", (e) => log("Window", "Unhandled rejection: " + ((e.reason && e.reason.message) || e.reason || "")));
      log("Ely", T("out.started"));
      return this;
    },
    mount(host) { S.host = host; paint(); return host; },
    unmount() { S.host = null; },
    toolbar, log, clear, setChannel, copyAll,
    channel: () => S.channel,
    channels: () => CHANNELS.slice(),
    lines: (c) => (S.buffers[c || S.channel] || []).slice(),
    count: (c) => (S.buffers[c || S.channel] || []).length,
    filterValue: () => S.filter,
    matches
  };
})();
