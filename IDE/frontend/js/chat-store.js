/* Ely Cowork · almacén ÚNICO de conversación.
 *
 * Antes la vista de chat y el widget flotante tenían cada uno su propio
 * `messages` + `sessionId`, así que se veían dos conversaciones distintas a la
 * vez y el widget nunca se guardaba. Aquí hay una sola conversación viva,
 * compartida por ambos, persistida en Local Storage por perfil y proyecto.
 *
 * Expone window.ChatStore. Se carga en runtime desde app.js.
 */
(function () {
  "use strict";

  const DEFAULT_PROJECT = "general";

  const state = {
    profile: null,
    project: localStorage.getItem("ely.chatProject") || DEFAULT_PROJECT,
    projects: [],
    sessions: [],
    sessionId: null,
    messages: [],
    customTitle: null,
    busy: false,
    abort: false,
    loaded: false
  };

  const listeners = new Set();
  function notify(reason) { listeners.forEach((fn) => { try { fn(state, reason); } catch (e) { /* noop */ } }); }

  function newId() {
    return "s_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  }

  function nowISO() { return new Date().toISOString(); }

  function title() {
    if (state.customTitle) return state.customTitle;
    const first = state.messages.find((m) => m.role === "user");
    return (first ? first.content : "Nueva conversación").slice(0, 70);
  }

  /* ---------------------------------------------------------- persistencia */
  async function persist() {
    if (!state.messages.length || !state.sessionId) return;
    const session = {
      id: state.sessionId,
      profile: state.profile,
      project: state.project,
      title: title(),
      messages: state.messages.map((m) => ({
        role: m.role, content: m.content, meta: m.meta || null,
        error: m.error || null, sent_at: m.sent_at || null
      })),
      updated_at: nowISO()
    };
    try {
      await API.saveSession(session);
      await refreshSessions();
    } catch (e) { /* la conversación sigue viva en memoria */ }
  }

  async function refreshSessions() {
    try {
      const data = await API.sessions(state.profile, state.project);
      state.sessions = data.sessions || [];
      notify("sessions");
    } catch (e) { /* sin conexión */ }
  }

  async function refreshProjects() {
    try {
      const data = await API.chatProjects(state.profile);
      state.projects = data.projects || [];
      if (!state.projects.some((p) => p.id === state.project)) {
        state.project = (state.projects[0] || { id: DEFAULT_PROJECT }).id;
        localStorage.setItem("ely.chatProject", state.project);
      }
      notify("projects");
    } catch (e) { /* sin conexión */ }
  }

  /* ---------------------------------------------------------- ciclo de vida */
  async function init(profile) {
    const changed = state.profile !== profile;
    state.profile = profile;
    if (changed) {
      state.messages = [];
      state.sessionId = null;
      state.customTitle = null;
      state.loaded = false;
    }
    await refreshProjects();
    await refreshSessions();
    if (!state.sessionId) {
      /* Retoma la conversación más reciente del proyecto (memoria real). */
      const last = state.sessions[0];
      if (last) adoptSession(last);
      else state.sessionId = newId();
    }
    state.loaded = true;
    notify("init");
  }

  function adoptSession(session) {
    state.sessionId = session.id;
    state.customTitle = session.title || null;
    state.messages = (session.messages || []).map((m) => ({
      role: m.role, content: m.content, meta: m.meta, error: m.error, sent_at: m.sent_at
    }));
    notify("open");
  }

  function openChat(id) {
    const session = state.sessions.find((s) => s.id === id);
    if (!session || state.busy) return;
    adoptSession(session);
  }

  function newChat() {
    if (state.busy) return;
    state.messages = [];
    state.sessionId = newId();
    state.customTitle = null;
    notify("new");
  }

  async function deleteChat(id) {
    try { await API.deleteSession(id, state.profile); } catch (e) { /* noop */ }
    state.sessions = state.sessions.filter((s) => s.id !== id);
    if (state.sessionId === id) {
      state.messages = [];
      state.sessionId = newId();
      state.customTitle = null;
    }
    notify("delete");
    await refreshSessions();
  }

  async function deleteAllChats() {
    try { await API.clearSessions(state.profile, state.project); } catch (e) { /* noop */ }
    state.sessions = [];
    state.messages = [];
    state.sessionId = newId();
    state.customTitle = null;
    notify("delete");
  }

  async function renameChat(id, name) {
    const session = state.sessions.find((s) => s.id === id);
    if (!session || !name) return;
    if (state.sessionId === id) state.customTitle = name;
    try {
      await API.saveSession(Object.assign({}, session, {
        title: name, profile: state.profile, project: state.project
      }));
    } catch (e) { /* noop */ }
    await refreshSessions();
  }

  /* ---------------------------------------------------------- proyectos */
  async function setProject(id) {
    if (state.busy || state.project === id) return;
    await persist();
    state.project = id;
    localStorage.setItem("ely.chatProject", id);
    state.messages = [];
    state.sessionId = null;
    state.customTitle = null;
    await refreshSessions();
    const last = state.sessions[0];
    if (last) adoptSession(last);
    else state.sessionId = newId();
    notify("project");
  }

  async function createProject(name) {
    const project = await API.createChatProject(name, "", state.profile);
    await refreshProjects();
    await setProject(project.id);
    return project;
  }

  async function renameProject(id, name) {
    await API.renameChatProject(id, name, state.profile);
    await refreshProjects();
  }

  async function deleteProject(id) {
    await API.deleteChatProject(id, state.profile);
    if (state.project === id) {
      state.project = DEFAULT_PROJECT;
      localStorage.setItem("ely.chatProject", DEFAULT_PROJECT);
      state.messages = [];
      state.sessionId = null;
    }
    await refreshProjects();
    await refreshSessions();
    notify("project");
  }

  /* ---------------------------------------------------------- envío */
  function history() {
    return state.messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .slice(-14)
      .map((m) => ({ role: m.role, content: m.content }));
  }

  /** Envía un mensaje. `onDelta(acc)` permite pintar streaming en cualquier UI. */
  async function send(text, opts) {
    opts = opts || {};
    const clean = String(text || "").trim();
    if (!clean || state.busy) return { ok: false, reason: "empty" };
    if (!state.sessionId) state.sessionId = newId();

    const hist = history();
    state.busy = true;
    state.abort = false;
    const userMsg = { role: "user", content: clean, sent_at: nowISO() };
    state.messages.push(userMsg);
    const assistantMsg = { role: "assistant", content: "", meta: {}, streaming: true };
    notify("send");
    persist();                              // memoria aunque la API falle
    /* La respuesta vive en el mismo array que el resto de mensajes: así
       cualquier UI (vista o widget) pinta el streaming sin estado propio. */
    state.messages.push(assistantMsg);
    if (window.A11y) A11y.signal("chatRequestSent");

    const t0 = performance.now();
    const markFirst = () => {
      if (assistantMsg.meta.reasoning_ms == null) assistantMsg.meta.reasoning_ms = performance.now() - t0;
    };
    let acc = "";
    const useStream = !window.Settings || Settings.get("stream");
    const profileId = state.profile;
    const agent = opts.agent || (window.App && App.agentId()) || "photon";

    try {
      if (!useStream) {
        const result = await LLM.complete(clean, { agent, profile: profileId, history: hist });
        acc = result.text || "";
        assistantMsg.content = acc;
        assistantMsg.meta.tokens = result.usage ? result.usage.total_tokens : 0;
        markFirst();
        if (opts.onDelta) opts.onDelta(acc, assistantMsg);
      } else {
        await LLM.stream(clean, { agent, profile: profileId, history: hist }, {
          onDelta: (chunk) => {
            if (state.abort) return;
            markFirst();
            acc += chunk;
            assistantMsg.content = acc;
            if (opts.onDelta) opts.onDelta(acc, assistantMsg);
          },
          onUsage: (usage) => { assistantMsg.meta.tokens = usage.total_tokens; },
          onTool: (event) => {
            assistantMsg.meta.activeTool = event.status === "running" ? String(event.name || "").slice(0, 80) : null;
            notify("tool");
          },
          onDone: (event) => { if (event.usage) assistantMsg.meta.tokens = event.usage.total_tokens; },
          onError: (err) => {
            markFirst();
            assistantMsg.error = err.message + (err.detail ? "\n" + (typeof err.detail === "string" ? err.detail : JSON.stringify(err.detail)) : "");
          }
        });
      }
    } catch (err) {
      markFirst();
      assistantMsg.error = err.message || String(err);
    }

    assistantMsg.content = acc || (assistantMsg.error ? "" : "(sin respuesta)");
    assistantMsg.streaming = false;
    assistantMsg.meta.total_ms = performance.now() - t0;
    if (assistantMsg.meta.reasoning_ms == null) assistantMsg.meta.reasoning_ms = assistantMsg.meta.total_ms;
    assistantMsg.meta.completed_at = nowISO();
    state.busy = false;
    if (window.A11y) {
      A11y.signal(assistantMsg.error ? "chatUserActionRequired" : "chatResponseReceived",
        assistantMsg.error || (assistantMsg.content || "").slice(0, 160));
    }
    notify("done");
    await persist();
    return { ok: !assistantMsg.error, message: assistantMsg };
  }

  function stop() { state.abort = true; }

  window.ChatStore = {
    state,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    init, openChat, newChat, deleteChat, deleteAllChats, renameChat,
    setProject, createProject, renameProject, deleteProject,
    send, stop, persist, refreshSessions, refreshProjects, title
  };
})();
