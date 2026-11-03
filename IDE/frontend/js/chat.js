/* Vista de chat · diseño tipo Codex (sidebar + hero + composer inferior).
 *
 * - Cada conversación tiene su propia memoria (se guarda siempre, incluso si
 *   la respuesta falla) y se puede renombrar / eliminar desde Recientes.
 * - El asistente se muestra como «Ely» (nunca el nombre del modelo/agente).
 * - Cada mensaje muestra su hora: el usuario la de envío; Ely razonamiento,
 *   total y fecha/hora de fin (mes/día/año hora:minuto, según nacionalidad).
 * - Selector de API (perfil) y de lugar de trabajo (Local Storage).
 * - Botón «+» con menú de acciones; botón verde «−» para minimizar.
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
    customTitle: null,
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
    const derived = (first ? first.content : t("chat.untitled")).slice(0, 70);
    const session = {
      id: state.sessionId,
      profile: state.profile,
      title: state.customTitle || derived,
      messages: state.messages.map((m) => ({ role: m.role, content: m.content, meta: m.meta || null, error: m.error || null, sent_at: m.sent_at || null })),
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

    if (isUser) {
      /* Hora a la que el usuario envió el mensaje. */
      if (msg.sent_at) {
        body.appendChild(UI.el("div", { class: "chat-meta" }, [
          UI.el("span", { title: t("chat.sent"), text: "📤 " + t("chat.sent") + ": " + I18N.fmtDateTime(msg.sent_at) })
        ]));
      }
    } else if (msg.meta && (msg.meta.total_ms != null || msg.meta.completed_at)) {
      body.appendChild(UI.el("div", { class: "chat-meta" }, [
        msg.meta.reasoning_ms != null ? UI.el("span", { title: t("chat.reasoning"), text: "🧠 " + t("chat.reasoning") + ": " + I18N.fmtDuration(msg.meta.reasoning_ms) }) : null,
        msg.meta.total_ms != null ? UI.el("span", { title: t("chat.total"), text: "⏱ " + t("chat.total") + ": " + I18N.fmtDuration(msg.meta.total_ms) }) : null,
        msg.meta.completed_at ? UI.el("span", { title: t("chat.completed"), text: "📅 " + I18N.fmtDateTime(msg.meta.completed_at) }) : null
      ]));
    }

    const avatar = UI.el("div", { class: "avatar", text: isUser ? "TÚ" : "◈" });
    if (!isUser) avatar.classList.add("ely");
    return UI.el("div", { class: "msg " + (isUser ? "user" : "") + (msg.error ? " error" : "") }, [avatar, body]);
  }

  window.Views = window.Views || {};
  window.Views.chat = function (view, App) {
    const profile = App.profile();

    const currentProfile = App.profileId();
    if (state.profile !== currentProfile) {
      state.profile = currentProfile;
      state.messages = [];
      state.sessionId = newId();
      state.sessions = [];
      state.customTitle = null;
      state.lastUsage = null;
    }

    if (window.__elyWidgetHandoff) {
      state.messages = window.__elyWidgetHandoff.messages || [];
      state.sessionId = window.__elyWidgetHandoff.sessionId || newId();
      state.customTitle = null;
      window.__elyWidgetHandoff = null;
    }
    if (!state.sessionId) state.sessionId = newId();

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
      UI.el("button", { class: "icon-btn", html: "◧", title: t("chat.openStorage"), onclick: () => App.navigate("storage") })
    ]));

    const newBtn = UI.el("button", { class: "cs-new" }, [
      UI.el("span", { text: "✎" }), UI.el("span", { text: t("chat.new") })
    ]);
    newBtn.addEventListener("click", () => {
      if (state.busy) return;
      state.messages = [];
      state.sessionId = newId();
      state.customTitle = null;
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

    /* ---- renombrar / eliminar conversación ---- */
    function renameSession(session) {
      const input = UI.el("input", { type: "text", value: session.title || "", maxlength: "70" });
      const ref = UI.modal({
        title: t("chat.rename"),
        body: UI.el("div", { class: "stack" }, [input]),
        footer: [
          UI.btn(t("common.cancel"), () => ref.close(), { ghost: true }),
          UI.btn(t("common.save"), async () => {
            const title = input.value.trim();
            if (!title) return;
            if (session.id === state.sessionId) state.customTitle = title;
            try {
              await API.saveSession(Object.assign({}, session, { title, profile: state.profile }));
              state.sessions = (await API.sessions(state.profile)).sessions || [];
              UI.toast("ok", t("chat.renamed"));
            } catch (e) { UI.toast("err", t("ls.deleteFail"), e.message); }
            ref.close();
            renderRecents();
          }, { primary: true })
        ]
      });
      setTimeout(() => { input.focus(); input.select(); }, 60);
    }

    async function deleteSession(session) {
      await API.deleteSession(session.id, state.profile).catch(() => {});
      state.sessions = state.sessions.filter((s) => s.id !== session.id);
      if (session.id === state.sessionId) {
        state.messages = [];
        state.sessionId = newId();
        state.customTitle = null;
        renderContent();
      }
      renderRecents();
      UI.toast("ok", t("ls.convDeleted"));
    }

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
          active ? UI.el("span", { class: "cs-dot" }) : null,
          UI.el("button", {
            class: "icon-btn cs-act", html: "✎", title: t("chat.rename"),
            onclick: (e) => { e.stopPropagation(); renameSession(session); }
          }),
          UI.el("button", {
            class: "icon-btn cs-act", html: "✕", title: t("chat.delete"),
            onclick: (e) => { e.stopPropagation(); deleteSession(session); }
          })
        ]);
        item.addEventListener("click", () => {
          if (state.busy) return;
          state.sessionId = session.id;
          state.customTitle = session.title || null;
          state.messages = (session.messages || []).map((m) => ({ role: m.role, content: m.content, meta: m.meta, error: m.error, sent_at: m.sent_at }));
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

    /* ---------------------------------------------------------- composer */
    const composer = UI.el("div", { class: "chat-composer" });
    const ctxRow = UI.el("div", { class: "cc-context" });

    /* Selector de API (perfil). */
    const apiSelect = UI.el("select", {
      class: "cc-select", title: t("chat.api"),
      onchange: (e) => App.setProfile(e.target.value)
    }, (App.profiles || []).map((p) => UI.el("option", { value: p.id, selected: p.id === currentProfile, text: p.label })));
    ctxRow.appendChild(UI.el("span", { class: "cc-ctx" }, [
      UI.el("span", { text: "◈" }),
      UI.el("span", { class: "cc-ctx-label", text: t("chat.api") }),
      apiSelect
    ]));

    /* Lugar de trabajo (por ahora solo Local Storage). */
    const workSelect = UI.el("select", {
      class: "cc-select", title: t("chat.workLocation"),
      onchange: (e) => { if (window.Settings) Settings.set({ workLocation: e.target.value }); }
    }, [
      UI.el("option", { value: "local", selected: true, text: t("chat.openStorage") })
    ]);
    ctxRow.appendChild(UI.el("span", { class: "cc-ctx" }, [
      UI.el("span", { text: "🗀" }), workSelect, UI.el("span", { class: "muted", text: "⌄" })
    ]));
    composer.appendChild(ctxRow);

    const textarea = UI.el("textarea", { class: "cc-input", rows: 1, placeholder: t("chat.doAnything") });
    composer.appendChild(textarea);

    const bottomRow = UI.el("div", { class: "cc-bottom" });
    const attachBtn = UI.el("button", { class: "cc-plus", html: "＋", title: t("chat.attach") });
    const stopBtn = UI.el("button", { class: "cc-stop", text: t("chat.stop"), hidden: true, onclick: () => { state.abort = true; } });
    const micBtn = UI.el("button", { class: "cc-mic", html: "🎤", title: "—", disabled: true });
    const sendBtn = UI.el("button", { class: "cc-send", html: "↑", title: t("chat.send"), onclick: () => send() });
    bottomRow.appendChild(attachBtn);
    bottomRow.appendChild(UI.el("div", { style: { flex: "1" } }));
    bottomRow.appendChild(stopBtn);
    bottomRow.appendChild(micBtn);
    bottomRow.appendChild(sendBtn);
    composer.appendChild(bottomRow);

    /* ---- menú del botón «+» ---- */
    const plusMenu = buildPlusMenu();
    composer.appendChild(plusMenu);
    attachBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      plusMenu.classList.toggle("open");
    });
    document.addEventListener("pointerdown", (e) => {
      if (plusMenu.classList.contains("open") && !plusMenu.contains(e.target) && e.target !== attachBtn) {
        plusMenu.classList.remove("open");
      }
    });

    function plusItem(icon, title, desc, action) {
      const node = UI.el("button", { class: "cc-menu-item" }, [
        UI.el("span", { class: "cc-menu-icon", text: icon }),
        UI.el("span", { class: "cc-menu-text" }, [
          UI.el("b", { text: title }),
          UI.el("span", { class: "muted", text: desc })
        ])
      ]);
      node.addEventListener("click", () => { plusMenu.classList.remove("open"); action(); });
      return node;
    }

    function buildPlusMenu() {
      const menu = UI.el("div", { class: "cc-plusmenu" });
      const soon = () => UI.toast("warn", t("chat.soon"), t("chat.soonBody"));
      menu.appendChild(plusItem("📎", t("chat.menu.upload"), t("chat.menu.uploadDesc"), uploadFromComputer));
      menu.appendChild(plusItem("🗂", t("chat.menu.library"), t("chat.menu.libraryDesc"), () => FileViewer.browseStorage(state.profile)));
      menu.appendChild(plusItem("🖼", t("chat.menu.image"), t("chat.menu.imageDesc"), soon));
      menu.appendChild(plusItem("🌐", t("chat.menu.internet"), t("chat.menu.internetDesc"), soon));
      menu.appendChild(plusItem("🗀", t("chat.menu.project"), t("chat.menu.projectDesc"), () => App.navigate("ide")));
      menu.appendChild(plusItem("🔎", t("chat.menu.research"), t("chat.menu.researchDesc"), () => { textarea.value = t("chat.menu.research") + ": "; textarea.focus(); }));
      menu.appendChild(plusItem("✏", t("chat.menu.draw"), t("chat.menu.drawDesc"), soon));
      menu.appendChild(plusItem("🧠", t("chat.menu.reasoning"), t("chat.menu.reasoningDesc"), () => { textarea.value = t("chat.menu.reasoning") + ": "; textarea.focus(); }));
      menu.appendChild(plusItem("⚙", t("chat.menu.platform"), t("chat.menu.platformDesc"), () => App.navigate("integrations")));
      return menu;
    }

    function uploadFromComputer() {
      const input = UI.el("input", { type: "file", multiple: true, style: { display: "none" } });
      document.body.appendChild(input);
      input.addEventListener("change", async () => {
        const files = Array.from(input.files || []);
        for (const file of files) {
          try {
            const b64 = await new Promise((res, rej) => {
              const r = new FileReader();
              r.onload = () => res(String(r.result).split(",")[1] || "");
              r.onerror = rej;
              r.readAsDataURL(file);
            });
            await API.uploadStorage({ profile: state.profile, kind: "generado", name: file.name, content_b64: b64 });
            UI.toast("ok", t("chat.uploaded"), file.name);
          } catch (e) { UI.toast("err", t("ls.addFail"), e.message); }
        }
        input.remove();
      });
      input.click();
    }

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
        hero.appendChild(UI.el("div", { class: "ch-sugs" }, [
          suggestion("✉", t("chat.sug1"), () => { textarea.value = t("chat.sug1"); textarea.focus(); }),
          suggestion("🗀", t("chat.sug2"), () => FileViewer.browseStorage(state.profile)),
          suggestion("⌘", t("chat.sug3"), () => { textarea.value = t("chat.sug3"); textarea.focus(); })
        ]));
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

      const userMsg = { role: "user", content: text, sent_at: new Date().toISOString() };
      state.messages.push(userMsg);
      renderContent();
      const log = logEl();
      const history = conversationForApi().slice(0, -1);
      persist();  // guarda la conversación aunque la respuesta falle (memoria)

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
        await persist();
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
