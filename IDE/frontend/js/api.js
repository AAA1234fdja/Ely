/* Cliente de la API real de Ely Cowork.
   Todas las llamadas van a /api/* en el mismo origen: el servidor Python es
   quien habla con los proveedores, de modo que la API Key nunca se expone. */
(function () {
  "use strict";

  class ApiError extends Error {
    constructor(message, status, detail) {
      super(message);
      this.name = "ApiError";
      this.status = status;
      this.detail = detail;
    }
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
    if (!response.body) throw new ApiError("El navegador no soporta streaming", 0);

    const reader = response.body.getReader();
    const decoder = typeof TextDecoder === "function" ? new TextDecoder() : null;
    let buffer = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder ? decoder.decode(value, { stream: true }) : decodeUtf8(value);
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
        if (event.type === "delta" && h.onDelta) h.onDelta(event.text);
        else if (event.type === "usage" && h.onUsage) h.onUsage(event.usage);
        else if (event.type === "start" && h.onStart) h.onStart(event);
        else if (event.type === "done" && h.onDone) h.onDone(event);
        else if (event.type === "error") {
          if (h.onError) h.onError(new ApiError(event.message, event.status, event.detail));
          return;
        }
      }
    }
  }

  /* Decodificador UTF-8 mínimo para entornos sin TextDecoder. */
  function decodeUtf8(bytes) {
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

  window.API = {
    ApiError,
    get: (path) => request(path),
    post: (path, body) => request(path, { method: "POST", body: body || {} }),
    del: (path) => request(path, { method: "DELETE" }),
    stream,

    health: () => request("/health"),
    routes: () => request("/routes"),
    profiles: () => request("/profiles"),
    agents: () => request("/agents"),
    workflows: () => request("/workflows"),
    testProfile: (id, mode) => request("/profiles/test", { method: "POST", body: { id, mode: mode || "chat" } }),
    testAll: () => request("/profiles/test-all", { method: "POST", body: {} }),
    setDefaultProfile: (id) => request("/profiles/default", { method: "POST", body: { id } }),
    setKey: (id, apiKey) => request("/profiles/key", { method: "POST", body: { id, api_key: apiKey } }),
    stats: () => request("/stats"),
    calls: (limit) => request("/calls?limit=" + (limit || 200)),
    tools: () => request("/tools"),
    mcp: () => request("/mcp"),
    sessions: () => request("/sessions"),
    saveSession: (session) => request("/sessions", { method: "POST", body: session }),
    deleteSession: (id) => request("/sessions/" + encodeURIComponent(id), { method: "DELETE" }),
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
    config: () => request("/config")
  };
})();
