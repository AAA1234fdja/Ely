/* Ely Cowork · widget de chat flotante (desplegable compacto).
 *
 * Se abre desde el botón verde (#chat-fab) como un panel pequeño anclado
 * abajo a la derecha, en lugar de saltar al chat de pantalla completa.
 * Cabecera:
 *   ✎ nueva      → empieza otra conversación dentro del mismo proyecto
 *   📌 fijar     → mantiene el panel abierto al navegar o hacer clic fuera
 *   ⤢ expandir  → lleva la conversación al chat completo (vista /chat)
 *   — minimizar → pliega el panel de vuelta al botón
 *
 * IMPORTANTE: el widget ya NO tiene conversación propia. Lee y escribe en
 * window.ChatStore, el mismo almacén que usa la vista /chat, que a su vez
 * persiste en Local Storage por perfil y proyecto (compartido con el CLI).
 * Antes cada uno guardaba su propio `messages`/`sessionId`, y por eso se
 * veían dos chats distintos a la vez que parecían cambiar solos.
 *
 * Se carga en tiempo de ejecución desde app.js: el index.html original
 * permanece byte a byte intacto (igual que #toasts y #chat-fab).
 */
(function () {
  "use strict";

  const state = { open: false, pinned: false };

  let App = null;
  let fab = null;
  let panel = null;
  let log = null;
  let textarea = null;
  let sendBtn = null;
  let pinBtn = null;
  let titleEl = null;
  let projectEl = null;
  let unsub = null;
  let frame = null;

  const S = () => window.ChatStore;
  const st = () => (window.ChatStore ? ChatStore.state : { messages: [], busy: false, projects: [], project: "general" });

  /* ------------------------------------------------------------- render */
  function msgNode(m) {
    const isUser = m.role === "user";
    const node = UI.el("div", { class: "cw-msg " + (isUser ? "user" : "bot") + (m.error ? " error" : "") }, [
      UI.el("div", { class: "cw-who", text: isUser ? t("chat.you") : t("chat.ely") }),
      UI.el("div", { class: "cw-text" })
    ]);
    const text = node.querySelector(".cw-text");
    if (m.streaming && !m.content) text.innerHTML = '<span class="typing"><i></i><i></i><i></i></span>';
    else text.innerHTML = UI.md(m.content || "");
    if (m.error) node.appendChild(UI.el("div", { class: "cw-err", role: "alert", text: m.error }));
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
    if (!log) return;
    const messages = st().messages;
    UI.clear(log);
    if (!messages.length) {
      log.appendChild(UI.el("div", { class: "cw-empty" }, [
        UI.el("div", { class: "cw-empty-icon", "aria-hidden": "true", text: "◈" }),
        UI.el("div", { text: t("chat.ely") }),
        UI.el("div", { class: "cw-empty-sub", text: t("cw.emptySub") })
      ]));
      return;
    }
    messages.forEach((m) => log.appendChild(msgNode(m)));
    log.scrollTop = log.scrollHeight;
  }

  function renderTitle() {
    if (!titleEl) return;
    const s = st();
    const project = (s.projects || []).find((p) => p.id === s.project);
    UI.clear(titleEl);
    titleEl.appendChild(UI.el("span", { class: "cw-title-icon", "aria-hidden": "true", text: "◈" }));
    titleEl.appendChild(UI.el("span", { class: "trunc", text: t("chat.ely") }));
    if (projectEl) projectEl.textContent = project ? project.name : (s.project || "general");
  }

  function renderBusy() {
    if (!sendBtn) return;
    sendBtn.disabled = !!st().busy;
    sendBtn.innerHTML = st().busy ? "■" : "➤";
    sendBtn.title = st().busy ? t("chat.stop") : t("chat.send");
  }

  function renderAll() { renderTitle(); renderLog(); renderBusy(); }

  /* ------------------------------------------------------- abrir / cerrar */
  function open() {
    state.open = true;
    panel.classList.add("open");
    if (fab) fab.classList.add("active");
    const store = S();
    if (store) {
      /* Una sola suscripción: si el perfil cambió, el store retoma la última
         conversación de ese perfil/proyecto en lugar de inventar otra. */
      if (!unsub) unsub = store.subscribe(() => { if (state.open) renderAll(); });
      store.init(App ? App.profileId() : null).then(renderAll);
    }
    renderAll();
    setTimeout(() => { if (textarea) textarea.focus(); }, 60);
  }

  function close() {
    state.open = false;
    if (panel) panel.classList.remove("open");
    if (fab) fab.classList.remove("active");
    const store = S();
    if (store && !st().busy) store.persist();
  }

  function toggle() { state.open ? close() : open(); }

  function togglePin() {
    state.pinned = !state.pinned;
    pinBtn.classList.toggle("on", state.pinned);
    pinBtn.title = state.pinned ? t("cw.unpin") : t("cw.pin");
    pinBtn.setAttribute("aria-pressed", state.pinned ? "true" : "false");
    panel.classList.toggle("pinned", state.pinned);
  }

  function expand() {
    /* No hay trasvase de mensajes: la vista completa lee el mismo store. */
    close();
    if (App) App.navigate("chat");
  }

  function newChat() {
    const store = S();
    if (!store || st().busy) return;
    store.newChat();
    renderAll();
    if (textarea) textarea.focus();
  }

  /* ------------------------------------------------------------- envío */
  async function send() {
    const store = S();
    const s = st();
    if (!store) return;
    if (s.busy) { store.stop(); return; }
    const text = (textarea.value || "").trim();
    if (!text) return;
    const profile = App ? App.profile() : null;
    if (!profile) {
      UI.toast("err", t("chat.noProfileTitle"), t("chat.noProfileBody"));
      return;
    }
    textarea.value = "";
    textarea.style.height = "auto";
    renderBusy();
    renderLog();

    await store.send(text, {
      agent: App && App.agent() ? App.agent().id : "photon",
      onDelta: () => {
        if (frame) return;
        frame = requestAnimationFrame(() => { frame = null; if (state.open) renderLog(); });
      }
    });
    if (frame) { cancelAnimationFrame(frame); frame = null; }
    renderAll();
    if (state.open && textarea) textarea.focus();
  }

  /* ------------------------------------------------------------- init */
  function init(app, fabEl) {
    App = app;
    fab = fabEl;

    panel = UI.el("div", { id: "chat-widget", role: "dialog", "aria-label": t("chat.ely") });

    titleEl = UI.el("div", { class: "cw-title" });
    const newBtn = UI.el("button", { class: "cw-act", html: "✎", title: t("chat.new"), "aria-label": t("chat.new"), onclick: newChat });
    pinBtn = UI.el("button", { class: "cw-act", html: "📌", title: t("cw.pin"), "aria-label": t("cw.pin"), "aria-pressed": "false", onclick: togglePin });
    const expandBtn = UI.el("button", { class: "cw-act", html: "⤢", title: t("cw.expand"), "aria-label": t("cw.expand"), onclick: expand });
    const minBtn = UI.el("button", { class: "cw-act", html: "—", title: t("cw.minimize"), "aria-label": t("cw.minimize"), onclick: close });
    const head = UI.el("div", { class: "cw-head" }, [
      titleEl,
      UI.el("div", { class: "cw-actions" }, [newBtn, pinBtn, expandBtn, minBtn])
    ]);
    projectEl = UI.el("span", { class: "cw-project-name", text: "general" });
    const projectRow = UI.el("button", {
      class: "cw-project", title: t("chat.project"), "aria-label": t("chat.project"),
      onclick: expand
    }, [UI.el("span", { "aria-hidden": "true", text: "🗀" }), projectEl]);

    log = UI.el("div", { class: "cw-log", role: "log", "aria-live": "polite", "aria-label": t("chat.ely") });

    textarea = UI.el("textarea", {
      rows: 1, placeholder: t("cw.placeholder"), "aria-label": t("cw.placeholder"),
      onkeydown: (e) => {
        const enterSends = !window.Settings || Settings.get("sendOnEnter");
        if (e.key === "Enter" && !e.shiftKey && enterSends) { e.preventDefault(); send(); }
      }
    });
    textarea.addEventListener("input", () => {
      textarea.style.height = "auto";
      textarea.style.height = Math.min(90, textarea.scrollHeight) + "px";
    });
    sendBtn = UI.el("button", { class: "cw-send", html: "➤", title: t("chat.send"), "aria-label": t("chat.send"), onclick: send });
    const composer = UI.el("div", { class: "cw-composer" }, [textarea, sendBtn]);

    panel.appendChild(head);
    panel.appendChild(projectRow);
    panel.appendChild(log);
    panel.appendChild(composer);
    document.body.appendChild(panel);

    /* Clic fuera: cierra si no está fijado. */
    document.addEventListener("pointerdown", (e) => {
      if (!state.open || state.pinned) return;
      if (panel.contains(e.target) || (fab && fab.contains(e.target))) return;
      close();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && state.open && !state.pinned) close();
    });

    renderAll();
  }

  /* App.render lo llama en cada cambio de ruta. En /chat el widget se cierra
     SIEMPRE (aunque esté fijado): así nunca hay dos chats en pantalla. */
  function onRoute(route) {
    if (route === "chat") {
      if (state.pinned) togglePin();
      close();
      const fabEl = document.getElementById("chat-fab");
      if (fabEl) fabEl.style.display = "none";
      return;
    }
    const fabEl = document.getElementById("chat-fab");
    if (fabEl) fabEl.style.display = "";
    if (state.open && !state.pinned) close();
    else if (state.open) renderAll();
  }

  /* Compatibilidad: antes recibía la conversación del chat completo. Ahora
     ambos comparten ChatStore, así que basta con abrir el panel. */
  function adopt() { open(); }

  window.ChatWidget = { init, toggle, open, close, expand, onRoute, adopt, newChat };
})();
