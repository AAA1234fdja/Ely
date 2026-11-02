/* Vista de chat · diseño tipo Codex (sidebar + hero + composer inferior).
 *
 * - El asistente se muestra como «Ely» (nunca el nombre del modelo/agente).
 * - Cada respuesta muestra al final: tiempo de razonamiento, tiempo total y
 *   la fecha/hora de fin (mes/día/año hora:minuto, según la nacionalidad).
 * - Botón verde «−» arriba a la derecha para minimizar al widget flotante.
 * - Acceso a Local Storage para abrir archivos de distintos formatos.
 * Streaming SSE real contra /api/chat/stream.
 */
(function () {
  "use strict";

  const state = {
    messages: [],
    sessionId: null,
    sessions: [],
    busy: false,
    lastUsage: null,
    profile: null,
    showAllRecents: false
  };

  function newId() {
    return "s_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  }

  function conversationForApi() {
    return state.messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .slice(-14)
      .map((m) => ({ role: m.role, content: m.content }));
  }

  async function persist() {
    if (!state.messages.length) return;
    const first = state.messages.find((m) => m.role === "user");
    const session = {
      id: state.sessionId,
      profile: state.profile,
      title: (first ? first.content : "Conversación").slice(0, 70),
      messages: state.messages.map((m) => ({ role: m.role, content: m.content, meta: m.meta || null, error: m.error || null })),
      updated_at: new Date().toISOString()
    };
    try {
      await API.saveSession(session);
      state.sessions = (await API.sessions(state.profile)).sessions || [];
    } catch (e) { /* la sesión local sigue viva aunque falle el guardado */ }
  }

  /* ---------------------------------------------------------- mensaje */
  function messageNode(msg) {
    const isUser = msg.role === "user";
    const body = UI.el("div", { class: "body" }, [
      UI.el("div", { class: "who" }, [
        UI.el("span", { text: isUser ? t("chat.you") : t("chat.ely") })
      ]),
      UI.el("div", { class: "bubble" })
    ]);
    const bubble = body.querySelector(".bubble");
    bubble.innerHTML = UI.md(msg.content || "");
    if (msg.error) {
      bubble.appendChild(UI.el("div", {
        class: "mono", style: { marginTop: "8px", color: "var(--red)", fontSize: "11px" },
        text: msg.error
      }));
    } else {
      UI.bindCopy(bubble);
    }

    /* Pie con tiempos y fecha de fin (solo respuestas del asistente). */
    if (!isUser && msg.meta && (msg.meta.total_ms != null || msg.meta.completed_at)) {
      const meta = UI.el("div", { class: "chat-meta" }, [
        msg.meta.reasoning_ms != null ? UI.el("span", { title: t("chat.reasoning"), text: "🧠 " + t("chat.reasoning") + ": " + I18N.fmtDuration(msg.meta.reasoning_ms) }) : null,
        msg.meta.total_ms != null ? UI.el("span", { title: t("chat.total"), text: "⏱ " + t("chat.total") + ": " + I18N.fmtDuration(msg.meta.total_ms) }) : null,
        msg.meta.completed_at ? UI.el("span", { title: t("chat.completed"), text: "📅 " + I18N.fmtDateTime(msg.meta.completed_at) }) : null
      ]);
      body.appendChild(meta);
    }

    const avatar = UI.el("div", { class: "avatar", text: isUser ? "TÚ" : "◈" });
    if (!isUser) avatar.classList.add("ely");
    return UI.el("div", { class: "msg " + (isUser ? "user" : "") + (msg.error ? " error" : "") }, [avatar, body]);
  }

  window.Views = window.Views || {};
  window.Views.chat = function (view, App) {
    const profile = App.profile();

    /* Cada perfil tiene su propia conversación. */
    const currentProfile = App.profileId();
    if (state.profile !== currentProfile) {
      state.profile = currentProfile;
      state.messages = [];
      state.sessionId = newId();
      state.sessions = [];
      state.lastUsage = null;
    }

    /* Conversación que llega desde el widget al expandir. */
    if (window.__elyWidgetHandoff) {
      state.messages = window.__elyWidgetHandoff.messages || [];
      state.sessionId = window.__elyWidgetHandoff.sessionId || newId();
      window.__elyWidgetHandoff = null;
    }
    if (!state.sessionId) state.sessionId = newId();

    /* ------------------------------------------------------------ estructura */
    const shell = UI.el("div", { class: "chat-shell" });
    const sidebar = UI.el("div", { class: "chat-sidebar" });
    const main = UI.el("div", { class: "chat-main" });
    shell.appendChild(sidebar);
    shell.appendChild(main);

    /* ---------------------------------------------------------- sidebar */
    sidebar.appendChild(UI.el("div", { class: "cs-brand" }, [
      UI.el("span", { class: "cs-logo", text: "◈" }),
      UI.el("span", { class: "cs-name", text: "Ely" }),
      UI.el("span", { class: "muted", text: "⌄" }),
      UI.el("div", { style: { flex: "1" } }),
      UI.el("button", { class: "icon-btn", html: "⌕", title: t("chat.recents") }),
      UI.el("button", { class: "icon-btn", html: "◧", title: "Local Storage", onclick: () => App.navigate("storage") })
    ]));

    const newBtn = UI.el("button", { class: "cs-new" }, [
      UI.el("span", { text: "✎" }), UI.el("span", { text: t("chat.new") })
    ]);
    newBtn.addEventListener("click", () => {
      if (state.busy) return;
      state.messages = [];
      state.sessionId = newId();
      state.lastUsage = null;
      renderContent();
      renderRecents();
    });
    sidebar.appendChild(newBtn);

    const recentsHead = UI.el("div", { class: "cs-head", text: t("chat.recents") });
    const recentsList = UI.el("div", { class: "cs-list" });
    const showMore = UI.el("button", { class: "cs-more", text: t("chat.showMore") });
    showMore.addEventListener("click", () => {
      state.showAllRecents = !state.showAllRecents;
      showMore.textContent = state.showAllRecents ? t("chat.showLess") : t("chat.showMore");
      renderRecents();
    });
    sidebar.appendChild(recentsHead);
    sidebar.appendChild(recentsList);
    sidebar.appendChild(showMore);

    sidebar.appendChild(UI.el("div", { class: "cs-head", text: t("chat.projects") }));
    const projectsList = UI.el("div", { class: "cs-list" });
    sidebar.appendChild(projectsList);

    function renderRecents() {
      UI.clear(recentsList);
      if (!state.sessions.length) {
        recentsList.appendChild(UI.el("div", { class: "cs-empty", text: t("chat.noRecents") }));
        showMore.style.display = "none";
        return;
      }
      const shown = state.showAllRecents ? state.sessions : state.sessions.slice(0, 7);
      showMore.style.display = state.sessions.length > 7 ? "" : "none";
      shown.forEach((session) => {
        const active = session.id === state.sessionId;
        const item = UI.el("div", { class: "cs-item" + (active ? " on" : ""), title: session.title }, [
          UI.el("span", { class: "trunc", text: session.title || t("chat.untitled") }),
          UI.el("span", { class: "cs-tag", text: (session.messages || []).length + " " + t("chat.msgs") }),
          active ? UI.el("span", { class: "cs-dot" }) : null
        ]);
        item.addEventListener("click", () => {
          if (state.busy) return;
          state.sessionId = session.id;
          state.messages = (session.messages || []).map((m) => ({ role: m.role, content: m.content, meta: m.meta, error: m.error }));
          renderContent();
          renderRecents();
        });
        recentsList.appendChild(item);
      });
    }

    function renderProjects() {
      UI.clear(projectsList);
      const profiles = App.profiles || [];
      if (!profiles.length) {
        projectsList.appendChild(UI.el("div", { class: "cs-empty", text: t("chat.noProjects") }));
        return;
      }
      profiles.forEach((p) => {
        const item = UI.el("div", { class: "cs-item proj" + (p.id === state.profile ? " on" : "") }, [
          UI.el("span", { class: "cs-folder", text: "🗀" }),
          UI.el("span", { class: "trunc", text: p.label }),
          UI.el("button", {
            class: "icon-btn cs-open", html: "↗", title: t("chat.openStorage"),
            onclick: (e) => { e.stopPropagation(); App.setProfile(p.id); App.navigate("storage"); }
          })
        ]);
        item.addEventListener("click", () => { if (!state.busy) App.setProfile(p.id); });
        projectsList.appendChild(item);
      });
    }

    /* ---------------------------------------------------------- main */
    const topbar = UI.el("div", { class: "chat-topbar" }, [
      UI.el("span", { class: "muted", style: { fontSize: "12px" }, text: t("chat.ely") }),
      UI.el("div", { style: { flex: "1" } }),
      UI.el("button", {
        class: "chat-minimize", html: "−", title: t("chat.minimize"),
        onclick: () => {
          if (window.ChatWidget) ChatWidget.adopt(state.messages, state.sessionId, state.profile);
          App.navigate(App.routeBeforeChat || "dashboard");
        }
      })
    ]);
    main.appendChild(topbar);

    const content = UI.el("div", { class: "chat-content" });
    main.appendChild(content);

    /* composer */
    const composer = UI.el("div", { class: "chat-composer" });
    const ctxRow = UI.el("div", { class: "cc-context" });
    const profileSelect = UI.el("select", {
      class: "cc-select",
      onchange: (e) => App.setProfile(e.target.value)
    }, (App.profiles || []).map((p) => UI.el("option", { value: p.id, selected: p.id === currentProfile, text: p.label })));
    ctxRow.appendChild(UI.el("span", { class: "cc-ctx" }, [UI.el("span", { text: "◈" }), profileSelect]));
    ctxRow.appendChild(UI.el("button", {
      class: "cc-ctx cc-folder-btn", title: t("chat.openStorage"),
      onclick: () => FileViewer.browseStorage(state.profile)
    }, [UI.el("span", { text: "🗀" }), UI.el("span", { text: t("chat.openStorage") }), UI.el("span", { class: "muted", text: "⌄" })]));
    composer.appendChild(ctxRow);

    const textarea = UI.el("textarea", { class: "cc-input", rows: 1, placeholder: t("chat.doAnything") });
    composer.appendChild(textarea);

    const bottomRow = UI.el("div", { class: "cc-bottom" });
    const attachBtn = UI.el("button", { class: "cc-plus", html: "＋", title: t("chat.attach"), onclick: () => FileViewer.browseStorage(state.profile) });
    const stopBtn = UI.el("button", { class: "cc-stop", text: t("chat.stop"), hidden: true, onclick: () => { state.abort = true; } });
    const micBtn = UI.el("button", { class: "cc-mic", html: "🎤", title: "—", disabled: true });
    const sendBtn = UI.el("button", { class: "cc-send", html: "↑", title: t("chat.send"), onclick: () => send() });
    bottomRow.appendChild(attachBtn);
    bottomRow.appendChild(UI.el("div", { style: { flex: "1" } }));
    bottomRow.appendChild(stopBtn);
    bottomRow.appendChild(micBtn);
    bottomRow.appendChild(sendBtn);
    composer.appendChild(bottomRow);
    main.appendChild(composer);

    textarea.addEventListener("keydown", (event) => {
      const enterSends = !window.Settings || Settings.get("sendOnEnter");
      if (event.key === "Enter" && !event.shiftKey && enterSends) { event.preventDefault(); send(); }
    });
    textarea.addEventListener("input", () => {
      textarea.style.height = "auto";
      textarea.style.height = Math.min(190, textarea.scrollHeight) + "px";
    });

    /* ---------------------------------------------------------- contenido */
    function renderContent() {
      UI.clear(content);
      if (!state.messages.length) {
        const hero = UI.el("div", { class: "chat-hero" }, [
          UI.el("div", { class: "ch-logo", text: "◈" }),
          UI.el("h2", { class: "ch-title", text: t("chat.whatBuild") })
        ]);
        const sugs = UI.el("div", { class: "ch-sugs" }, [
          suggestion("✉", t("chat.sug1"), () => { textarea.value = t("chat.sug1"); textarea.focus(); }),
          suggestion("🗀", t("chat.sug2"), () => FileViewer.browseStorage(state.profile)),
          suggestion("⌘", t("chat.sug3"), () => { textarea.value = t("chat.sug3"); textarea.focus(); })
        ]);
        hero.appendChild(sugs);
        content.appendChild(hero);
        return;
      }
      const log = UI.el("div", { class: "chat-log", id: "chat-log" });
      state.messages.forEach((m) => log.appendChild(messageNode(m)));
      content.appendChild(log);
      log.scrollTop = log.scrollHeight;
    }

    function suggestion(icon, text, onClick) {
      const node = UI.el("button", { class: "ch-sug" }, [
        UI.el("span", { class: "ch-sug-icon", text: icon }),
        UI.el("span", { class: "trunc", text })
      ]);
      node.addEventListener("click", onClick);
      return node;
    }

    function logEl() { return content.querySelector("#chat-log"); }

    /* ---------------------------------------------------------- envío */
    async function send() {
      if (state.busy) return;
      const text = (textarea.value || "").trim();
      if (!text) return;
      if (!profile) { UI.toast("err", t("chat.noProfileTitle"), t("chat.noProfileBody")); return; }

      state.busy = true;
      state.abort = false;
      sendBtn.disabled = true;
      stopBtn.hidden = false;
      textarea.value = "";
      textarea.style.height = "auto";

      const userMsg = { role: "user", content: text };
      state.messages.push(userMsg);
      renderContent();              // muestra el log con el mensaje del usuario
      const log = logEl();
      const history = conversationForApi().slice(0, -1);

      const t0 = performance.now();
      const assistantMsg = { role: "assistant", content: "", meta: {} };
      const holder = messageNode(assistantMsg);
      const bubble = holder.querySelector(".bubble");
      bubble.innerHTML = '<span class="typing"><i></i><i></i><i></i></span>';
      log.appendChild(holder);
      log.scrollTop = log.scrollHeight;

      let acc = "";
      let frame = null;
      const paint = () => { bubble.innerHTML = UI.md(acc); UI.bindCopy(bubble); log.scrollTop = log.scrollHeight; frame = null; };
      const markFirst = () => { if (assistantMsg.meta.reasoning_ms == null) assistantMsg.meta.reasoning_ms = performance.now() - t0; };
      const finish = () => {
        assistantMsg.meta.total_ms = performance.now() - t0;
        if (assistantMsg.meta.reasoning_ms == null) assistantMsg.meta.reasoning_ms = assistantMsg.meta.total_ms;
        assistantMsg.meta.completed_at = new Date().toISOString();
      };

      const useStream = !window.Settings || Settings.get("stream");
      if (!useStream) {
        try {
          const result = await LLM.complete(text, { agent: App.agentId(), profile: App.profileId(), history });
          assistantMsg.content = result.text || "";
          acc = assistantMsg.content;
          assistantMsg.meta.tokens = result.usage ? result.usage.total_tokens : 0;
        } catch (err) {
          assistantMsg.error = LLM.explain(err);
          UI.toast("err", t("chat.apiError"), err.message);
        }
        finish();
        log.replaceChild(messageNode(assistantMsg), holder);
        state.messages.push(assistantMsg);
        endSend();
        return;
      }

      try {
        await LLM.stream(text, { agent: App.agentId(), profile: App.profileId(), history }, {
          onStart: () => {},
          onDelta: (chunk) => { if (state.abort) return; markFirst(); acc += chunk; if (!frame) frame = requestAnimationFrame(paint); },
          onUsage: (usage) => { state.lastUsage = usage; assistantMsg.meta.tokens = usage.total_tokens; },
          onDone: (event) => { if (event.usage) { state.lastUsage = event.usage; assistantMsg.meta.tokens = event.usage.total_tokens; } },
          onError: (err) => {
            markFirst();
            assistantMsg.content = acc || t("chat.noResponse");
            assistantMsg.error = err.message + (err.detail ? "\n" + (typeof err.detail === "string" ? err.detail : JSON.stringify(err.detail)) : "");
          }
        });
      } catch (err) {
        assistantMsg.content = acc || "";
        assistantMsg.error = err.message;
        UI.toast("err", t("chat.apiError"), err.message);
      }

      if (frame) { cancelAnimationFrame(frame); frame = null; }
      assistantMsg.content = acc;
      finish();
      log.replaceChild(messageNode(assistantMsg), holder);
      log.scrollTop = log.scrollHeight;
      state.messages.push(assistantMsg);
      endSend();

      async function endSend() {
        state.busy = false;
        sendBtn.disabled = false;
        stopBtn.hidden = true;
        if (acc) await persist();
        renderRecents();
        textarea.focus();
      }
    }

    /* ---------------------------------------------------------- init */
    renderContent();
    renderRecents();
    renderProjects();
    setTimeout(() => textarea && textarea.focus(), 40);
    API.sessions(state.profile).then((data) => {
      state.sessions = data.sessions || [];
      renderRecents();
    }).catch(() => {});

    return shell;
  };
})();
