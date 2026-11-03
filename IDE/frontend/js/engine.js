/* Ely Cowork · motor del cliente.
 *
 * Transporte HTTP contra el backend (nunca contra los proveedores: la API Key
 * vive en el servidor) + caché de estado compartida por todas las vistas.
 * Expone `window.API` y `window.Engine`.
 */
(function () {
  "use strict";

  /* ======================================================================
     Errores y transporte
     ====================================================================== */
  class ApiError extends Error {
    constructor(message, status, detail) {
      super(message);
      this.name = "ApiError";
      this.status = status;
      this.detail = detail;
    }
  }

  function decodeUtf8(bytes) {
    /* Respaldo para entornos sin TextDecoder (SSR, pruebas). */
    let out = "";
    for (let i = 0; i < bytes.length; i += 1) {
      const byte = bytes[i];
      if (byte < 0x80) out += String.fromCharCode(byte);
      else if (byte >= 0xc0 && byte < 0xe0 && i + 1 < bytes.length) {
        out += String.fromCharCode(((byte & 0x1f) << 6) | (bytes[i + 1] & 0x3f));
        i += 1;
      } else if (byte >= 0xe0 && i + 2 < bytes.length) {
        out += String.fromCharCode(((byte & 0x0f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f));
        i += 2;
      }
    }
    return out;
  }

  async function request(path, options) {
    const opts = Object.assign({ headers: {} }, options || {});
    if (opts.body && typeof opts.body !== "string") {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(opts.body);
    }
    let response;
    try {
      response = await fetch("/api" + path, opts);
    } catch (err) {
      throw new ApiError(
        "No se pudo contactar con el servidor local. ¿Sigue ejecutándose `ely serve`?",
        0,
        String(err)
      );
    }
    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch (e) {
      data = { raw: text };
    }
    if (!response.ok) {
      const message = (data && (data.error || data.message)) || response.statusText;
      throw new ApiError(message, response.status, data && data.detail);
    }
    return data;
  }

  async function stream(path, body, handlers) {
    const h = handlers || {};
    const response = await fetch("/api" + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      let message = response.statusText;
      let detail = null;
      try {
        const data = await response.json();
        message = data.error || message;
        detail = data.detail;
      } catch (e) { /* cuerpo no JSON */ }
      throw new ApiError(message, response.status, detail);
    }
    if (!response.body) throw new ApiError("Este navegador no soporta streaming (ReadableStream)", 0);

    const reader = response.body.getReader();
    const decoder = typeof TextDecoder === "function" ? new TextDecoder() : null;
    let buffer = "";
    for (;;) {
      let chunk;
      try {
        chunk = await reader.read();
      } catch (err) {
        if (h.onError) h.onError(new ApiError("El flujo se interrumpió: " + err.message, 0));
        return;
      }
      if (chunk.done) break;
      buffer += decoder ? decoder.decode(chunk.value, { stream: true }) : decodeUtf8(chunk.value);
      const parts = buffer.split("\n\n");
      buffer = parts.pop();
      for (const part of parts) {
        const line = part.split("\n").find((l) => l.startsWith("data:"));
        if (!line) continue;
        let event;
        try {
          event = JSON.parse(line.slice(5).trim());
        } catch (e) {
          continue;
        }
        if (event.type === "delta") h.onDelta && h.onDelta(event.text);
        else if (event.type === "usage") h.onUsage && h.onUsage(event.usage);
        else if (event.type === "start") h.onStart && h.onStart(event);
        else if (event.type === "done") h.onDone && h.onDone(event);
        else if (event.type === "error") {
          h.onError && h.onError(new ApiError(event.message, event.status, event.detail));
          return;
        }
      }
    }
  }

  /* ======================================================================
     API: una función por endpoint del backend
     ====================================================================== */
  const API = {
    ApiError,
    request,
    stream,
    get: (path) => request(path),
    post: (path, body) => request(path, { method: "POST", body: body || {} }),
    del: (path) => request(path, { method: "DELETE" }),

    health: () => request("/health"),
    routes: () => request("/routes"),
    profiles: () => request("/profiles"),
    agents: () => request("/agents"),
    workflows: () => request("/workflows"),
    testProfile: (id, mode) => request("/profiles/test", { method: "POST", body: { id, mode: mode || "chat" } }),
    testAll: () => request("/profiles/test-all", { method: "POST", body: {} }),
    setDefaultProfile: (id) => request("/profiles/default", { method: "POST", body: { id } }),
    setKey: (id, apiKey) => request("/profiles/key", { method: "POST", body: { id, api_key: apiKey } }),
    resolveKey: (id) => request("/profiles/resolve?id=" + encodeURIComponent(id)),
    stats: () => request("/stats"),
    calls: (limit) => request("/calls?limit=" + (limit || 200)),
    tools: () => request("/tools"),
    mcp: () => request("/mcp"),
    sessions: (profile, project) => {
      const q = [];
      if (profile) q.push("profile=" + encodeURIComponent(profile));
      if (project) q.push("project=" + encodeURIComponent(project));
      return request("/sessions" + (q.length ? "?" + q.join("&") : ""));
    },
    saveSession: (session) => request("/sessions", { method: "POST", body: session }),
    clearSessions: (profile, project) => request("/sessions/clear", { method: "POST", body: { profile, project } }),
    chatProjects: (profile) => request("/chat/projects" + (profile ? "?profile=" + encodeURIComponent(profile) : "")),
    createChatProject: (name, root, profile) => request("/chat/projects", { method: "POST", body: { name, root, profile } }),
    renameChatProject: (id, name, profile) => request("/chat/projects", { method: "PATCH", body: { id, name, profile } }),
    deleteChatProject: (id, profile) => request("/chat/projects/" + encodeURIComponent(id) + (profile ? "?profile=" + encodeURIComponent(profile) : ""), { method: "DELETE" }),
    deleteSession: (id, profile) => request("/sessions/" + encodeURIComponent(id) + (profile ? "?profile=" + encodeURIComponent(profile) : ""), { method: "DELETE" }),
    storage: (profile) => request("/storage" + (profile ? "?profile=" + encodeURIComponent(profile) : "")),
    uploadStorage: (data) => request("/storage/upload", { method: "POST", body: data }),
    createProject: (name, template) => request("/workspace/project", { method: "POST", body: { name, template } }),
    searchWorkspace: (q) => request("/workspace/search?q=" + encodeURIComponent(q)),
    uploadWorkspace: (path, content_b64) => request("/workspace/upload", { method: "POST", body: { path, content_b64 } }),
    terminal: (command, cwd) => request("/terminal/exec", { method: "POST", body: { command, cwd } }),
    ide: (op, args) => request("/ide/call", { method: "POST", body: { op, args: args || {} } }),
    addPlanned: (data) => request("/storage/planned", { method: "POST", body: data }),
    deletePlanned: (id, profile) => request("/storage/planned/" + encodeURIComponent(id) + (profile ? "?profile=" + encodeURIComponent(profile) : ""), { method: "DELETE" }),
    memory: () => request("/memory"),
    addMemory: (text, tag) => request("/memory", { method: "POST", body: { text, tag } }),
    deleteMemory: (id) => request("/memory/" + encodeURIComponent(id), { method: "DELETE" }),
    runWorkflow: (id, input) => request("/workflows/run", { method: "POST", body: { id, input } }),
    tree: (depth) => request("/workspace/tree?depth=" + (depth || 3)),
    file: (path) => request("/workspace/file?path=" + encodeURIComponent(path)),
    saveFile: (path, content) => request("/workspace/file", { method: "POST", body: { path, content } }),
    assets: () => request("/assets"),
    skills: () => request("/skills"),
    addSkill: (data) => request("/skills", { method: "POST", body: data }),
    runSkill: (id, prompt) => request("/skills/run", { method: "POST", body: { id, prompt } }),
    deleteSkill: (id) => request("/skills/" + encodeURIComponent(id), { method: "DELETE" }),
    jobs: () => request("/jobs"),
    pairing: () => request("/pairing"),
    rotatePairing: () => request("/pairing/rotate", { method: "POST", body: {} }),
    costs: () => request("/costs"),
    config: () => request("/config"),

    /* --- repositorios --- */
    repos: () => request("/repos"),
    addRepo: (reference) => request("/repos", { method: "POST", body: { reference } }),
    repoTree: (slug, depth) => request("/repos/tree?slug=" + encodeURIComponent(slug) + "&depth=" + (depth || 3)),
    repoFile: (slug, path) => request("/repos/file?slug=" + encodeURIComponent(slug) + "&path=" + encodeURIComponent(path)),
    searchRepo: (slug, q) => request("/repos/search?slug=" + encodeURIComponent(slug) + "&q=" + encodeURIComponent(q)),
    removeRepo: (slug) => request("/repos/" + encodeURIComponent(slug), { method: "DELETE" })
  };

  /* ======================================================================
     Engine: estado compartido (una sola carga por sesión)
     ====================================================================== */
  const Engine = {
    profiles: [],
    agents: [],
    health: null,
    mcp: null,
    nav: null,
    loading: null,

    /** Carga (o reutiliza) los datos base del backend. */
    async load(force) {
      if (this.loading && !force) return this.loading;
      this.loading = (async () => {
        const results = await Promise.allSettled([
          API.health(), API.profiles(), API.agents(), API.mcp()
        ]);
        const [health, profiles, agents, mcp] = results;
        this.health = health.status === "fulfilled" ? health.value : null;
        this.profiles = profiles.status === "fulfilled" ? (profiles.value.profiles || []) : [];
        this.agents = agents.status === "fulfilled" ? (agents.value.agents || []) : [];
        this.mcp = mcp.status === "fulfilled" ? mcp.value : null;
        Store.cache.profiles = this.profiles;
        Store.cache.agents = this.agents;
        Store.cache.mcp = this.mcp;
        return {
          connected: health.status === "fulfilled",
          error: health.status === "rejected" ? health.reason : null
        };
      })();
      const result = await this.loading;
      this.loading = null;
      return result;
    },

    profile(id) {
      const wanted = id || Store.get("profile");
      return this.profiles.find((p) => p.id === wanted) || this.profiles[0] || null;
    },

    agent(id) {
      const wanted = id || Store.get("agent");
      return this.agents.find((a) => a.id === wanted) || this.agents[0] || null;
    },

    /** Resumen legible del estado actual, para la cabecera y los ajustes. */
    summary() {
      const profile = this.profile();
      const agent = this.agent();
      return {
        profile,
        agent,
        connected: Boolean(this.health && this.health.ok),
        keyState: !profile ? "sin perfil"
          : !profile.has_key ? "sin clave"
          : profile.is_test_key ? "clave de prueba" : "clave propia",
        endpoint: profile ? profile.base_url : null,
        model: profile ? profile.model : null
      };
    },

    async refreshProfile(id) {
      const data = await API.profiles();
      this.profiles = data.profiles || [];
      Store.cache.profiles = this.profiles;
      return this.profile(id);
    }
  };

  window.API = API;
  window.Engine = Engine;
  window.ElyApiError = ApiError;
})();
