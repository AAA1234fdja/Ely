/* Ely Cowork · estado global y persistencia local (sin datos simulados) */
(function () {
  "use strict";

  const LS = "ely.cowork.v09";

  const defaults = {
    route: "dashboard",
    agent: "photon",
    profile: null,          // se resuelve desde /api/profiles
    sidebar: false,
    memory: false,
    ideFile: "README.md",
    ideTabs: [],
    theme: "violet"
  };

  function load() {
    try {
      return Object.assign({}, defaults, JSON.parse(localStorage.getItem(LS) || "{}"));
    } catch (e) {
      return Object.assign({}, defaults);
    }
  }

  const listeners = new Set();

  const Store = {
    state: load(),

    get(key) {
      return this.state[key];
    },

    set(patch) {
      Object.assign(this.state, patch);
      try {
        localStorage.setItem(LS, JSON.stringify(this.state));
      } catch (e) { /* almacenamiento lleno o bloqueado */ }
      listeners.forEach((fn) => fn(this.state, patch));
    },

    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    /* estado remoto compartido entre vistas */
    cache: {
      profiles: null,
      agents: null,
      health: null,
      tools: null,
      mcp: null
    }
  };

  window.Store = Store;
})();
