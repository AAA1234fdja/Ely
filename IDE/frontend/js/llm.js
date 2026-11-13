/* Ely Cowork · capa de modelo (LLM) del cliente.
 *
 * Envuelve los endpoints de generación del backend para que las vistas no
 * construyan cuerpos JSON a mano. Todo pasa por el servidor: aquí no hay
 * claves ni respuestas de relleno.
 */
(function () {
  "use strict";

  const LLM = {
    /** Prompt sin streaming. Devuelve {text, model, usage, ...}. */
    async complete(prompt, opts) {
      const o = opts || {};
      return API.post("/chat", {
        prompt,
        agent: o.agent || Store.get("agent"),
        profile: o.profile || Store.get("profile"),
        history: o.history || [],
        context: o.context || null,
        use_memory: o.useMemory === undefined ? Store.get("memory") : o.useMemory,
        quality_level: o.qualityLevel || null,
        model: o.model || null,
        max_tokens: o.maxTokens,
        temperature: o.temperature
      });
    },

    /** Prompt con streaming SSE. `handlers`: {onStart,onDelta,onUsage,onDone,onError}. */
    async stream(prompt, opts, handlers) {
      const o = opts || {};
      return API.stream("/chat/stream", {
        prompt,
        agent: o.agent || Store.get("agent"),
        profile: o.profile || Store.get("profile"),
        history: o.history || [],
        context: o.context || null,
        use_memory: o.useMemory === undefined ? Store.get("memory") : o.useMemory,
        quality_level: o.qualityLevel || null,
        model: o.model || null
      }, handlers || {});
    },

    /** Prueba real de URL + API Key de un perfil. */
    probe(profileId, mode) {
      return API.testProfile(profileId || Store.get("profile"), mode || "chat");
    },

    probeAll() {
      return API.testAll();
    },

    /** Guarda una clave en .ely/keys.env a través del servidor. */
    async setKey(profileId, apiKey) {
      const result = await API.setKey(profileId, apiKey);
      await Engine.refreshProfile(profileId);
      return result;
    },

    agents() {
      return Engine.agents.length ? Promise.resolve({ agents: Engine.agents }) : API.agents();
    },

    workflows() {
      return API.workflows();
    },

    runWorkflow(id, input) {
      return API.runWorkflow(id, input);
    },

    skills: {
      list: () => API.skills(),
      create: (data) => API.addSkill(data),
      run: (id, prompt) => API.runSkill(id, prompt),
      remove: (id) => API.deleteSkill(id)
    },

    memory: {
      list: () => API.memory(),
      add: (text, tag) => API.addMemory(text, tag),
      remove: (id) => API.deleteMemory(id)
    },

    /** Texto listo para mostrar: quién respondió y con qué perfil. */
    describe(result) {
      if (!result) return "";
      const usage = result.usage || {};
      const parts = [];
      if (result.model) parts.push(result.model);
      if (usage.total_tokens) parts.push(usage.total_tokens + " tokens");
      if (usage.latency_ms) parts.push(usage.latency_ms + " ms");
      if (result.profile) parts.push("perfil " + result.profile);
      return parts.join(" · ");
    },

    /** Motivo legible de un fallo del proveedor. */
    explain(error) {
      if (!error) return "Error desconocido";
      if (error.status === 401 || error.status === 403) {
        return (error.message || "Clave rechazada") + " — el endpoint respondió: URL y cabecera correctas.";
      }
      return error.message || String(error);
    }
  };

  window.LLM = LLM;
})();
