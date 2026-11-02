/* Vista de chat: streaming SSE real contra /api/chat/stream */
(function () {
  "use strict";

  const state = {
    messages: [],
    sessionId: null,
    sessions: [],
    busy: false,
    lastUsage: null,
    title: "Nueva conversación"
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
      title: (first ? first.content : "Conversación").slice(0, 70),
      messages: state.messages.map((m) => ({ role: m.role, content: m.content, meta: m.meta || null, error: m.error || null })),
      updated_at: new Date().toISOString()
    };
    try {
      await API.saveSession(session);
      state.sessions = (await API.sessions()).sessions || [];
    } catch (e) { /* la sesión local sigue viva aunque falle el guardado */ }
  }

  function messageNode(msg, agent) {
    const isUser = msg.role === "user";
    const body = UI.el("div", { class: "body" }, [
      UI.el("div", { class: "who" }, [
        UI.el("span", { text: isUser ? "Tú" : (msg.agentName || (agent ? agent.name : "Asistente")) }),
        msg.meta && msg.meta.model ? UI.el("span", { class: "muted mono", text: msg.meta.model }) : null
      ]),
      UI.el("div", { class: "bubble" })
    ]);
    const bubble = body.querySelector(".bubble");
    if (msg.error) {
      bubble.innerHTML = UI.md(msg.content);
      bubble.appendChild(UI.el("div", {
        class: "mono",
        style: { marginTop: "8px", color: "#ffaab1", fontSize: "11px" },
        text: msg.error
      }));
    } else {
      bubble.innerHTML = UI.md(msg.content);
      UI.bindCopy(bubble);
    }
    if (msg.meta && (msg.meta.tokens || msg.meta.latency_ms) && (!window.Settings || Settings.get("showUsage"))) {
      const meta = UI.el("div", { class: "meta" }, [
        msg.meta.tokens ? UI.el("span", { text: UI.num(msg.meta.tokens) + " tokens" }) : null,
        msg.meta.latency_ms ? UI.el("span", { text: UI.ms(msg.meta.latency_ms) }) : null,
        msg.meta.profile ? UI.el("span", { class: "mono", text: msg.meta.profile }) : null,
        msg.meta.testKey ? UI.el("span", { class: "badge warn", text: "clave de prueba" }) : null
      ]);
      body.appendChild(meta);
    }
    const avatar = UI.el("div", { class: "avatar", text: isUser ? "TÚ" : (msg.icon || (agent ? agent.icon : "◈")) });
    if (!isUser && msg.agentColor) avatar.style.color = msg.agentColor;
    return UI.el("div", { class: "msg " + (isUser ? "user" : "") + (msg.error ? " error" : "") }, [avatar, body]);
  }

  window.Views = window.Views || {};
  window.Views.chat = function (view, App) {
    const agent = App.agent();
    const profile = App.profile();

    if (!state.sessionId) state.sessionId = newId();

    /* ------------------------------------------------------------ estructura */
    const wrap = UI.el("div", { class: "chat-wrap", style: { height: "100%" } });
    const col = UI.el("div", { class: "chat-col" });
    const side = UI.el("div", { class: "card chat-side", style: { display: "flex", flexDirection: "column", gap: "14px", overflow: "hidden" } });

    /* cabecera del chat */
    const agentSelect = UI.el("select", {
      style: { width: "auto", minWidth: "150px" },
      onchange: (event) => {
        Store.set({ agent: event.target.value });
        App.render();
      }
    }, App.agents.map((a) => UI.el("option", {
      value: a.id, selected: a.id === App.agentId(), text: a.icon + "  " + a.name + " · " + a.role
    })));

    const memoryToggle = UI.el("input", {
      type: "checkbox", checked: Store.get("memory"),
      onchange: (event) => Store.set({ memory: event.target.checked })
    });

    const head = UI.el("div", { class: "chat-head" }, [
      agentSelect,
      UI.el("label", { class: "check", title: "Inyecta las notas de Memoria como contexto" }, [
        UI.el("span", { class: "switch" }, [memoryToggle, UI.el("span")]),
        UI.el("span", { text: "memoria" })
      ]),
      UI.el("span", { class: "spacer", style: { flex: "1" } }),
      UI.btn("Nueva", () => {
        if (state.busy) return;
        state.messages = [];
        state.sessionId = newId();
        state.lastUsage = null;
        renderLog();
        renderSessions();
      }, { small: true, ghost: true, icon: "＋" }),
      UI.btn("Guardar", async () => { await persist(); UI.toast("ok", "Sesión guardada"); renderSessions(); }, { small: true })
    ]);

    /* log */
    const log = UI.el("div", { class: "chat-log", id: "chat-log" });
    const composer = UI.el("div", { class: "composer" });
    col.appendChild(head);
    col.appendChild(log);
    col.appendChild(composer);

    /* ------------------------------------------------------------ render */
    function renderLog() {
      UI.clear(log);
      if (!state.messages.length) {
        log.appendChild(UI.el("div", { class: "empty", style: { margin: "auto" } }, [
          UI.el("div", {
            class: "big",
            style: { fontSize: "34px", color: agent ? agent.color : "var(--accent)" },
            text: agent ? agent.icon : "◈"
          }),
          UI.el("div", { style: { fontSize: "15px", color: "var(--text)" }, text: agent ? agent.name : "Ely" }),
          UI.el("div", { text: agent ? agent.role : "" }),
          UI.el("div", {
            class: "dim",
            style: { marginTop: "8px", maxWidth: "420px" },
            text: agent && agent.starter ? agent.starter : "Escribe abajo para empezar."
          }),
          profile ? UI.el("div", {
            class: "mono",
            style: { marginTop: "14px", fontSize: "11px", color: "var(--muted)" },
            text: profile.endpoint + "  ·  " + (profile.masked_key || "sin clave")
          }) : null
        ]));
        return;
      }
      state.messages.forEach((msg) => log.appendChild(messageNode(msg, agent)));
      log.scrollTop = log.scrollHeight;
    }

    function renderSessions() {
      UI.clear(side);
      side.appendChild(UI.el("h3", null, [
        UI.el("span", { text: "Conversaciones" }),
        UI.el("span", { class: "hint", text: state.sessions.length + " guardadas" })
      ]));
      const list = UI.el("div", { class: "side-list", style: { overflowY: "auto", maxHeight: "46%" } });
      if (!state.sessions.length) {
        list.appendChild(UI.el("div", { class: "muted", style: { fontSize: "12px" }, text: "Aún no hay sesiones guardadas." }));
      }
      state.sessions.forEach((session) => {
        const item = UI.el("div", { class: "side-item" + (session.id === state.sessionId ? " on" : "") }, [
          UI.el("span", { class: "trunc", text: session.title || "Sin título" }),
          UI.el("small", { text: UI.date(session.updated_at) + " · " + (session.messages || []).length + " msj" })
        ]);
        item.addEventListener("click", () => {
          if (state.busy) return;
          state.sessionId = session.id;
          state.messages = (session.messages || []).map((m) => ({
            role: m.role, content: m.content, meta: m.meta, error: m.error,
            agentName: m.meta && m.meta.agentName, icon: m.meta && m.meta.icon, agentColor: m.meta && m.meta.color
          }));
          renderLog();
          renderSessions();
        });
        const del = UI.el("button", {
          class: "btn ghost sm", html: "×", title: "Eliminar",
          style: { marginLeft: "auto", padding: "0 6px" },
          onclick: async (event) => {
            event.stopPropagation();
            await API.deleteSession(session.id).catch(() => {});
            state.sessions = state.sessions.filter((s) => s.id !== session.id);
            if (session.id === state.sessionId) {
              state.messages = [];
              state.sessionId = newId();
              renderLog();
            }
            renderSessions();
          }
        });
        item.appendChild(del);
        list.appendChild(item);
      });
      side.appendChild(list);

      side.appendChild(UI.el("div", { class: "divider" }));
      side.appendChild(UI.el("h3", { text: "Atajos" }));
      side.appendChild(UI.el("div", { class: "chips" }, (App.agents || []).slice(0, 8).map((a) =>
        UI.el("button", {
          class: "chip" + (a.id === App.agentId() ? " on" : ""),
          text: a.icon + " " + a.name,
          onclick: () => { Store.set({ agent: a.id }); App.render(); }
        })
      )));

      side.appendChild(UI.el("div", { class: "divider" }));
      const info = UI.el("div", { class: "kv", style: { fontSize: "11.5px" } }, [
        UI.el("dt", { text: "perfil" }), UI.el("dd", { text: profile ? profile.label : "—" }),
        UI.el("dt", { text: "modelo" }), UI.el("dd", { class: "mono", text: profile ? profile.model : "—" }),
        UI.el("dt", { text: "clave" }), UI.el("dd", { class: "mono", text: profile ? (profile.masked_key || "sin clave") : "—" }),
        UI.el("dt", { text: "origen" }), UI.el("dd", { class: "mono", text: profile ? (profile.key_origin || "—") : "—" }),
        UI.el("dt", { text: "último uso" }), UI.el("dd", {
          text: state.lastUsage ? state.lastUsage.total_tokens + " tokens · " + UI.ms(state.lastUsage.latency_ms) : "—"
        })
      ]);
      side.appendChild(info);
      side.appendChild(UI.el("div", { class: "divider" }));
      side.appendChild(UI.el("p", {
        class: "muted",
        style: { fontSize: "11px", margin: 0, lineHeight: "1.5" },
        text: "La clave nunca sale del servidor local: el navegador llama a /api y Python firma la petición al proveedor."
      }));
    }

    /* ------------------------------------------------------------ envío */
    let textarea;
    function buildComposer() {
      UI.clear(composer);
      textarea = UI.el("textarea", {
        placeholder: "Escribe tu mensaje…  (Enter envía · Shift+Enter salto de línea)",
        rows: 1
      });
      textarea.addEventListener("keydown", (event) => {
        const enterSends = !window.Settings || Settings.get("sendOnEnter");
        if (event.key === "Enter" && !event.shiftKey && enterSends) {
          event.preventDefault();
          send();
        }
      });
      textarea.addEventListener("input", () => {
        textarea.style.height = "auto";
        textarea.style.height = Math.min(190, textarea.scrollHeight) + "px";
      });

      const sendBtn = UI.btn("Enviar", send, { primary: true, icon: "➤" });
      const stopBtn = UI.btn("Detener", () => { state.abort = true; }, { small: true, danger: true, ghost: true });
      stopBtn.hidden = true;

      composer.appendChild(UI.el("div", { class: "chips" }, [
        ...(agent && agent.starter ? [UI.el("button", {
          class: "chip", text: "▸ " + agent.starter,
          onclick: () => { textarea.value = agent.starter; textarea.focus(); }
        })] : []),
        UI.el("button", {
          class: "chip", text: "＋ resumen del proyecto",
          onclick: () => {
            textarea.value = "Resume el estado del repositorio Ely Cowork: carpetas, propósito de cada una y qué falta por implementar.";
            textarea.focus();
          }
        })
      ]));
      composer.appendChild(textarea);
      composer.appendChild(UI.el("div", { class: "row" }, [
        UI.el("span", { class: "muted", style: { fontSize: "11px" }, text: App.agent() ? App.agent().name + " · " + (profile ? profile.model : "sin modelo") : "" }),
        UI.el("div", { style: { flex: "1" } }),
        stopBtn,
        sendBtn
      ]));
      return { sendBtn, stopBtn };
    }

    let controls = buildComposer();

    async function send() {
      if (state.busy) return;
      const text = (textarea.value || "").trim();
      if (!text) return;
      if (!profile) {
        UI.toast("err", "Sin perfil", "Configura un perfil en Integraciones");
        return;
      }
      state.busy = true;
      state.abort = false;
      controls.sendBtn.disabled = true;
      controls.stopBtn.hidden = false;
      textarea.value = "";
      textarea.style.height = "auto";

      const currentAgent = App.agent();
      const userMsg = { role: "user", content: text };
      state.messages.push(userMsg);
      log.appendChild(messageNode(userMsg, currentAgent));
      const history = conversationForApi().slice(0, -1);

      /* placeholder del asistente */
      const assistantMsg = {
        role: "assistant",
        content: "",
        agentName: currentAgent ? currentAgent.name : "Asistente",
        icon: currentAgent ? currentAgent.icon : "◈",
        agentColor: currentAgent ? currentAgent.color : null,
        meta: {}
      };
      const holder = messageNode(assistantMsg, currentAgent);
      const bubble = holder.querySelector(".bubble");
      bubble.innerHTML = '<span class="typing"><i></i><i></i><i></i></span>';
      log.appendChild(holder);
      log.scrollTop = log.scrollHeight;

      let acc = "";
      let frame = null;
      const paint = () => {
        bubble.innerHTML = UI.md(acc);
        UI.bindCopy(bubble);
        log.scrollTop = log.scrollHeight;
        frame = null;
      };

      const useStream = !window.Settings || Settings.get("stream");
      if (!useStream) {
        try {
          const result = await LLM.complete(text, {
            agent: currentAgent ? currentAgent.id : "photon",
            profile: App.profileId(),
            history
          });
          assistantMsg.content = result.text || "";
          acc = assistantMsg.content;
          assistantMsg.meta = {
            profile: result.profile, model: result.model,
            tokens: result.usage ? result.usage.total_tokens : 0,
            latency_ms: result.usage ? result.usage.latency_ms : 0,
            id: result.id
          };
        } catch (err) {
          assistantMsg.error = LLM.explain(err);
          UI.toast("err", "Error de la API", err.message);
        }
        const nodeNoStream = messageNode(assistantMsg, currentAgent);
        log.replaceChild(nodeNoStream, holder);
        log.scrollTop = log.scrollHeight;
        state.messages.push(assistantMsg);
        state.busy = false;
        controls.sendBtn.disabled = false;
        controls.stopBtn.hidden = true;
        if (acc) await persist();
        renderSessions();
        textarea.focus();
        return;
      }

      try {
        await LLM.stream(text, {
          agent: currentAgent ? currentAgent.id : "photon",
          profile: App.profileId(),
          history
        }, {
          onStart: (event) => {
            assistantMsg.meta = { profile: event.profile, model: event.model, testKey: event.test_key };
          },
          onDelta: (chunk) => {
            if (state.abort) return;
            acc += chunk;
            if (!frame) frame = requestAnimationFrame(paint);
          },
          onUsage: (usage) => {
            state.lastUsage = usage;
            assistantMsg.meta.tokens = usage.total_tokens;
            assistantMsg.meta.latency_ms = usage.latency_ms;
          },
          onDone: (event) => {
            if (event.usage) {
              state.lastUsage = event.usage;
              assistantMsg.meta.tokens = event.usage.total_tokens;
              assistantMsg.meta.latency_ms = event.usage.latency_ms;
            }
            assistantMsg.meta.id = event.id;
          },
          onError: (err) => {
            assistantMsg.content = acc || "No se recibió respuesta del modelo.";
            assistantMsg.error = err.message + (err.detail ? "\n" + (typeof err.detail === "string" ? err.detail : JSON.stringify(err.detail)) : "");
          }
        });
      } catch (err) {
        assistantMsg.content = acc || "";
        assistantMsg.error = err.message;
        UI.toast("err", "Error de la API", err.message);
      }

      if (frame) { cancelAnimationFrame(frame); frame = null; }
      assistantMsg.content = acc;
      const finalNode = messageNode(assistantMsg, currentAgent);
      log.replaceChild(finalNode, holder);
      log.scrollTop = log.scrollHeight;
      state.messages.push(assistantMsg);
      state.busy = false;
      controls.sendBtn.disabled = false;
      controls.stopBtn.hidden = true;
      if (acc) await persist();
      renderSessions();
      textarea.focus();
    }

    /* ------------------------------------------------------------ init */
    renderLog();
    renderSessions();
    document.addEventListener("keydown", function focusHandler(event) {
      if (event.key === "/" && document.activeElement === document.body && App.route === "chat") {
        event.preventDefault();
        if (textarea) textarea.focus();
      }
    });
    setTimeout(() => textarea && textarea.focus(), 40);
    API.sessions().then((data) => {
      state.sessions = data.sessions || [];
      renderSessions();
    }).catch(() => {});

    wrap.appendChild(col);
    wrap.appendChild(side);
    return wrap;
  };
})();
