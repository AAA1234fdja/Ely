/* Ely Cowork · widget de chat flotante (desplegable compacto).
 *
 * Se abre desde el botón verde (#chat-fab) como un panel pequeño anclado
 * abajo a la derecha, en lugar de saltar al chat de pantalla completa.
 * Cabecera con tres acciones:
 *   📌 fijar     → mantiene el panel abierto al navegar o hacer clic fuera
 *   ⤢ expandir  → lleva la conversación al chat completo (vista /chat)
 *   — minimizar → pliega el panel de vuelta al botón
 *
 * Se carga en tiempo de ejecución desde app.js: el index.html original
 * permanece byte a byte intacto (igual que #toasts y #chat-fab).
 */
(function () {
  "use strict";

  const state = {
    open: false,
    pinned: false,
    busy: false,
    messages: [],
    profile: null,
    sessionId: "w_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
  };

  function newSessionId() {
    return "w_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  }

  let App = null;
  let fab = null;
  let panel = null;
  let log = null;
  let textarea = null;
  let sendBtn = null;
  let pinBtn = null;
  let titleEl = null;

  /* ------------------------------------------------------------- render */
  function msgNode(m) {
    const isUser = m.role === "user";
    const node = UI.el("div", { class: "cw-msg " + (isUser ? "user" : "bot") + (m.error ? " error" : "") }, [
      UI.el("div", { class: "cw-who", text: isUser ? t("chat.you") : t("chat.ely") }),
      UI.el("div", { class: "cw-text" })
    ]);
    node.querySelector(".cw-text").innerHTML = UI.md(m.content || "");
    if (m.error) node.appendChild(UI.el("div", { class: "cw-err", text: m.error }));
    if (!isUser && m.meta && (m.meta.total_ms != null || m.meta.completed_at)) {
      node.appendChild(UI.el("div", { class: "cw-meta" }, [
        m.meta.reasoning_ms != null ? UI.el("span", { text: "🧠 " + I18N.fmtDuration(m.meta.reasoning_ms) }) : null,
        m.meta.total_ms != null ? UI.el("span", { text: "⏱ " + I18N.fmtDuration(m.meta.total_ms) }) : null,
        m.meta.completed_at ? UI.el("span", { text: "📅 " + I18N.fmtDateTime(m.meta.completed_at) }) : null
      ]));
    }
    return node;
  }

  function renderLog() {
    UI.clear(log);
    if (!state.messages.length) {
      const agent = App ? App.agent() : null;
      log.appendChild(UI.el("div", { class: "cw-empty" }, [
        UI.el("div", { class: "cw-empty-icon", text: "◈" }),
        UI.el("div", { text: t("chat.ely") }),
        UI.el("div", { class: "cw-empty-sub", text: t("cw.emptySub") })
      ]));
      return;
    }
    state.messages.forEach((m) => log.appendChild(msgNode(m)));
    log.scrollTop = log.scrollHeight;
  }

  function renderTitle() {
    const agent = App ? App.agent() : null;
    UI.clear(titleEl);
    titleEl.appendChild(UI.el("span", { class: "cw-title-icon", text: "◈" }));
    titleEl.appendChild(UI.el("span", { class: "trunc", text: t("chat.ely") }));
  }

  /* ------------------------------------------------------- abrir / cerrar */
  function open() {
    /* La conversación del widget es por perfil: si cambió el perfil activo,
       se empieza de cero para no mezclar lo hablado en otro perfil. */
    const currentProfile = App ? App.profileId() : null;
    if (state.profile !== currentProfile) {
      state.profile = currentProfile;
      if (!state.busy) {
        state.messages = [];
        state.sessionId = newSessionId();
      }
    }
    state.open = true;
    panel.classList.add("open");
    if (fab) fab.classList.add("active");
    renderTitle();
    renderLog();
    setTimeout(() => { if (textarea) textarea.focus(); }, 60);
  }

  function close() {
    state.open = false;
    if (panel) panel.classList.remove("open");
    if (fab) fab.classList.remove("active");
  }

  function toggle() { state.open ? close() : open(); }

  function togglePin() {
    state.pinned = !state.pinned;
    pinBtn.classList.toggle("on", state.pinned);
    pinBtn.title = state.pinned ? t("cw.unpin") : t("cw.pin");
    panel.classList.toggle("pinned", state.pinned);
  }

  function expand() {
    /* Pasa la conversación al chat completo solo si el widget tiene mensajes;
       si está vacío, abre el chat completo sin pisar lo que ya hubiera allí. */
    const msgs = state.messages.filter((m) => m.content || m.error);
    if (msgs.length) {
      window.__elyWidgetHandoff = { messages: msgs, sessionId: state.sessionId };
    }
    close();
    if (App) App.navigate("chat");
  }

  /* ------------------------------------------------------------- envío */
  async function send() {
    if (state.busy) return;
    const text = (textarea.value || "").trim();
    if (!text) return;
    const profile = App ? App.profile() : null;
    if (!profile) {
      UI.toast("err", t("chat.noProfileTitle"), t("chat.noProfileBody"));
      return;
    }
    /* Si el perfil cambió con el panel abierto (fijado), no arrastrar la
       conversación del perfil anterior. */
    if (state.profile !== profile.id) {
      state.profile = profile.id;
      state.messages = [];
      state.sessionId = newSessionId();
    }

    const agent = App.agent();
    const history = state.messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .slice(-14)
      .map((m) => ({ role: m.role, content: m.content }));

    state.busy = true;
    sendBtn.disabled = true;
    textarea.value = "";
    textarea.style.height = "auto";

    const t0 = performance.now();
    state.messages.push({ role: "user", content: text });
    const assistantMsg = { role: "assistant", content: "", meta: {} };
    state.messages.push(assistantMsg);
    renderLog();

    const bubble = log.querySelector(".cw-msg.bot:last-child .cw-text");
    if (bubble) bubble.innerHTML = '<span class="typing"><i></i><i></i><i></i></span>';

    let acc = "";
    let frame = null;
    const paint = () => {
      if (bubble) { bubble.innerHTML = UI.md(acc); log.scrollTop = log.scrollHeight; }
      frame = null;
    };

    try {
      await LLM.stream(text, {
        agent: agent ? agent.id : "photon",
        profile: App.profileId(),
        history
      }, {
        onStart: () => {},
        onDelta: (chunk) => {
          if (assistantMsg.meta.reasoning_ms == null) assistantMsg.meta.reasoning_ms = performance.now() - t0;
          acc += chunk; if (!frame) frame = requestAnimationFrame(paint);
        },
        onUsage: (u) => { assistantMsg.meta.tokens = u.total_tokens; },
        onDone: () => {},
        onError: (err) => { assistantMsg.error = err.message; }
      });
    } catch (err) {
      assistantMsg.error = err.message || String(err);
    }

    if (frame) { cancelAnimationFrame(frame); frame = null; }
    assistantMsg.content = acc;
    assistantMsg.meta.total_ms = performance.now() - t0;
    if (assistantMsg.meta.reasoning_ms == null) assistantMsg.meta.reasoning_ms = assistantMsg.meta.total_ms;
    assistantMsg.meta.completed_at = new Date().toISOString();
    if (!acc && !assistantMsg.error) assistantMsg.error = t("chat.noResponse");
    state.busy = false;
    sendBtn.disabled = false;
    renderLog();
    if (state.open && textarea) textarea.focus();
  }

  /* ------------------------------------------------------------- init */
  function init(app, fabEl) {
    App = app;
    fab = fabEl;

    panel = UI.el("div", { id: "chat-widget", role: "dialog", "aria-label": "Chat" });

    titleEl = UI.el("div", { class: "cw-title" });
    pinBtn = UI.el("button", { class: "cw-act", html: "📌", title: t("cw.pin"), onclick: togglePin });
    const expandBtn = UI.el("button", { class: "cw-act", html: "⤢", title: t("cw.expand"), onclick: expand });
    const minBtn = UI.el("button", { class: "cw-act", html: "—", title: t("cw.minimize"), onclick: close });
    const head = UI.el("div", { class: "cw-head" }, [
      titleEl,
      UI.el("div", { class: "cw-actions" }, [pinBtn, expandBtn, minBtn])
    ]);

    log = UI.el("div", { class: "cw-log" });

    textarea = UI.el("textarea", {
      rows: 1, placeholder: t("cw.placeholder"),
      onkeydown: (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }
    });
    textarea.addEventListener("input", () => {
      textarea.style.height = "auto";
      textarea.style.height = Math.min(90, textarea.scrollHeight) + "px";
    });
    sendBtn = UI.el("button", { class: "cw-send", html: "➤", title: "Enviar", onclick: send });
    const composer = UI.el("div", { class: "cw-composer" }, [textarea, sendBtn]);

    panel.appendChild(head);
    panel.appendChild(log);
    panel.appendChild(composer);
    document.body.appendChild(panel);

    /* Clic fuera: cierra si no está fijado. */
    document.addEventListener("pointerdown", (e) => {
      if (!state.open || state.pinned) return;
      if (panel.contains(e.target) || (fab && fab.contains(e.target))) return;
      close();
    });

    /* Esc cierra (si no está fijado). */
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && state.open && !state.pinned) close();
    });
  }

  /* App.render lo llama en cada cambio de ruta. */
  function onRoute(route) {
    if (route === "chat") { close(); return; }
    if (state.open && !state.pinned) close();
  }

  /* Recibe la conversación del chat completo al pulsar «minimizar». */
  function adopt(messages, sessionId, profile) {
    state.messages = (messages || []).map((m) => ({ role: m.role, content: m.content, meta: m.meta, error: m.error }));
    state.sessionId = sessionId || newSessionId();
    state.profile = profile != null ? profile : (App ? App.profileId() : null);
    open();
  }

  window.ChatWidget = { init, toggle, open, close, expand, onRoute, adopt };
})();
