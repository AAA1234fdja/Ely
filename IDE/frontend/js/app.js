/* Ely Cowork · aplicación: navegación, cabecera y arranque. */
(function () {
  "use strict";

  /* Respaldo estático: el servidor publica la tabla real en /api/routes. */
  let NAV = [
    { group: "Trabajo", items: [
      { id: "chat", icon: "❯", label: "Chat" },
      { id: "dashboard", icon: "◈", label: "Panel" },
      { id: "ide", icon: "⌘", label: "IDE" },
      { id: "canvas", icon: "⬡", label: "Canvas" }
    ]},
    { group: "Orquestación", items: [
      { id: "workflows", icon: "⚡", label: "Workflows" },
      { id: "agents", icon: "✦", label: "Agentes" },
      { id: "teams", icon: "◎", label: "Equipos" },
      { id: "skills", icon: "✧", label: "Skills" },
      { id: "tools", icon: "⚒", label: "Herramientas" },
      { id: "memory", icon: "▤", label: "Memoria" },
      { id: "jobs", icon: "◷", label: "Jobs" }
    ]},
    { group: "Conexiones", items: [
      { id: "integrations", icon: "⇄", label: "Integraciones" },
      { id: "pairing", icon: "◉", label: "Pairing" }
    ]},
    { group: "Sistema", items: [
      { id: "assets", icon: "◫", label: "Activos" },
      { id: "costs", icon: "◐", label: "Costes" },
      { id: "config", icon: "⚙", label: "Configuración" }
    ]}
  ];

  let TITLES = {
    chat: ["Chat", "Conversación con el perfil activo, en streaming real"],
    dashboard: ["Panel", "Estado del sistema, telemetría y actividad reciente"],
    ide: ["IDE", "Editor de archivos del workspace con asistente integrado"],
    canvas: ["Canvas", "Mapa de orquestación de agentes y workflows"],
    workflows: ["Workflows", "Rutinas multi-agente ejecutadas contra el proveedor"],
    agents: ["Agentes", "System prompts reales y parámetros de generación"],
    teams: ["Equipos", "Cadenas de agentes coordinadas por objetivo"],
    skills: ["Skills", "Instrucciones reutilizables que se anteponen al prompt"],
    tools: ["Herramientas", "Catálogo de herramientas y estado del backend MCPs"],
    memory: ["Memoria", "Notas persistentes que se inyectan como contexto"],
    jobs: ["Jobs", "Historial de ejecuciones y llamadas"],
    integrations: ["Integraciones", "Perfiles, endpoints y API Keys"],
    pairing: ["Pairing", "Token de emparejamiento y endpoint de la API"],
    assets: ["Activos", "Inventario real del repositorio"],
    costs: ["Costes", "Tokens reales y tarifas por perfil"],
    config: ["Configuración", "Entorno, rutas y endpoints del servidor"]
  };

  const App = {
    profiles: [],
    agents: [],
    health: null,
    mcp: null,
    connected: false,
    route: "dashboard",

    profileId() {
      const saved = Store.get("profile");
      if (saved && this.profiles.some((p) => p.id === saved)) return saved;
      return this.profiles.length ? this.profiles[0].id : null;
    },

    profile() {
      const id = this.profileId();
      return this.profiles.find((p) => p.id === id) || null;
    },

    agentId() {
      const saved = Store.get("agent");
      return this.agents.some((a) => a.id === saved) ? saved : (this.agents[0] ? this.agents[0].id : "photon");
    },

    agent() {
      const id = this.agentId();
      return this.agents.find((a) => a.id === id) || null;
    },

    setProfile(id, persist) {
      Store.set({ profile: id });
      if (persist !== false) {
        API.setDefaultProfile(id).catch(() => { /* el server puede no persistir */ });
      }
      this.renderHeader();
      this.render();
    },

    navigate(route) {
      if (location.hash !== "#/" + route) location.hash = "#/" + route;
      else this.render();
    },

    async refresh() {
      const results = await Promise.allSettled([
        API.health(), API.profiles(), API.agents(), API.mcp()
      ]);
      const [health, profiles, agents, mcp] = results;
      if (health.status === "fulfilled") this.health = health.value;
      if (profiles.status === "fulfilled") {
        this.profiles = profiles.value.profiles || [];
        Store.cache.profiles = this.profiles;
      }
      if (agents.status === "fulfilled") {
        this.agents = agents.value.agents || [];
        Store.cache.agents = this.agents;
      }
      if (mcp.status === "fulfilled") {
        this.mcp = mcp.value;
        Store.cache.mcp = mcp.value;
      }
      this.connected = health.status === "fulfilled";
      if (!this.connected) {
        this.fatal(health.reason);
      }
      this.renderHeader();
      if (this.connected) this.render();
    },

    fatal(error) {
      const view = UI.$("#view");
      UI.clear(view);
      view.appendChild(UI.el("div", { class: "hero" }, [
        UI.el("h2", { text: "El servidor local no responde" }),
        UI.el("p", { text: "La interfaz necesita el backend de Ely Cowork para hablar con los proveedores. Inicia el servidor y vuelve a cargar." }),
        UI.el("pre", {
          class: "mono",
          style: { marginTop: "14px", background: "#0a0c12", padding: "12px 14px", borderRadius: "10px", border: "1px solid var(--border)" },
          text: "./CLI/ely serve --port 8765\n# o:\ncd CLI && python3 -m ely_cli serve"
        }),
        error ? UI.el("p", { class: "dim", style: { marginTop: "10px", fontSize: "12px" }, text: "Detalle: " + (error.message || error) }) : null,
        UI.el("div", { class: "row", style: { marginTop: "16px" } }, [
          UI.btn("Reintentar", () => this.refresh(), { primary: true })
        ])
      ]));
    },

    /* ---------------------------------------------------------- cabecera */
    renderHeader() {
      const header = UI.$("header.top");
      if (!header) return;
      UI.clear(header);
      const pair = TITLES[this.route] || ["Ely Cowork", ""];
      const dot = UI.el("span", { class: "dot" + (this.connected ? "" : " off") });

      const toggle = UI.el("button", {
        class: "btn ghost sm", id: "nav-toggle", html: "☰",
        onclick: () => document.body.classList.toggle("nav-open")
      });

      const profile = this.profile();
      const select = UI.el("select", {
        onchange: (event) => this.setProfile(event.target.value)
      }, this.profiles.map((p) => UI.el("option", {
        value: p.id, selected: profile && p.id === profile.id,
        text: p.label + (p.has_key ? "" : " · sin clave")
      })));
      if (!this.profiles.length) select.appendChild(UI.el("option", { text: "sin perfiles" }));

      const pill = UI.el("div", { class: "status-pill" }, [
        dot,
        UI.el("span", { class: "muted", text: "perfil" }),
        select
      ]);

      const kind = profile ? (profile.is_test_key ? "warn" : "ok") : "err";
      const keyBadge = UI.el("span", {
        class: "badge " + kind,
        text: profile ? (profile.has_key ? (profile.is_test_key ? "clave de prueba" : "clave propia") : "sin clave") : "—",
        title: profile ? profile.key_var + " · " + (profile.masked_key || "sin valor") : ""
      });

      const testBtn = UI.btn("Probar", async (event) => {
        const btn = event.currentTarget;
        btn.disabled = true;
        UI.clear(btn).appendChild(UI.spinner());
        btn.appendChild(UI.el("span", { text: "probando" }));
        try {
          const result = await API.testProfile(this.profileId(), "chat");
          if (result.ok) UI.toast("ok", "Conexión verificada", result.detail + " · " + result.latency_ms + " ms");
          else if (result.reachable) UI.toast("warn", "Endpoint alcanzable · clave rechazada", "HTTP " + result.status + " — " + result.detail);
          else UI.toast("err", "Sin respuesta del endpoint", result.detail);
        } catch (err) {
          UI.toast("err", "Prueba fallida", err.message);
        }
        btn.disabled = false;
        UI.clear(btn);
        btn.appendChild(UI.el("span", { text: "▷" }));
        btn.appendChild(UI.el("span", { text: "Probar" }));
        if (this.route === "integrations" || this.route === "dashboard") this.render();
      }, { small: true });

      header.appendChild(toggle);
      header.appendChild(UI.el("div", null, [
        UI.el("h1", { text: pair[0] }),
        UI.el("div", { class: "crumbs", text: pair[1] })
      ]));
      header.appendChild(UI.el("div", { class: "spacer" }));
      header.appendChild(keyBadge);
      header.appendChild(pill);
      header.appendChild(testBtn);
      header.appendChild(UI.btn("Abrir chat", () => this.navigate("chat"), { small: true, primary: true, icon: "❯" }));
    },

    /* ---------------------------------------------------------- navegación */
    renderNav() {
      const nav = UI.$("#nav");
      if (!nav) return;
      UI.clear(nav);
      NAV.forEach((group) => {
        nav.appendChild(UI.el("div", { class: "nav-group", text: group.group }));
        group.items.forEach((item) => {
          const link = UI.el("a", {
            class: item.id === this.route ? "active" : "",
            href: "#/" + item.id
          }, [
            UI.el("span", { class: "ico", text: item.icon }),
            UI.el("span", { class: "nav-label", text: item.label })
          ]);
          if (item.id === "tools" && this.mcp && this.mcp.status === "configured") {
            link.appendChild(UI.el("span", { class: "badge-dot", text: this.mcp.servers.length }));
          }
          if (item.id === "memory" && this.memoryCount) {
            link.appendChild(UI.el("span", { class: "badge-dot", text: this.memoryCount }));
          }
          nav.appendChild(link);
        });
      });
    },

    /* ---------------------------------------------------------- router */
    render() {
      this.renderNav();
      this.renderHeader();
      const view = UI.$("#view");
      if (!view || !this.connected) return;
      UI.clear(view);
      view.scrollTop = 0;
      const name = this.route;
      const factory = (window.Views || {})[name];
      if (!factory) {
        view.appendChild(UI.empty("∅", "Vista no encontrada: " + name));
        return;
      }
      try {
        const node = factory(view, this);
        if (node instanceof Node) view.appendChild(node);
      } catch (err) {
        view.appendChild(UI.errBox(err, () => this.render()));
      }
    },

    async boot() {
      try {
        const data = await API.get("/routes");
        if (data && Array.isArray(data.nav) && data.nav.length) {
          NAV = data.nav;
          TITLES = {};
          data.nav.forEach((group) => (group.items || []).forEach((item) => {
            TITLES[item.id] = [item.title || item.label, item.subtitle || ""];
          }));
        }
      } catch (e) { /* se mantiene la tabla de respaldo */ }
      const side = document.querySelector("aside");
      if (side) {
        side.querySelector(".collapse")?.addEventListener("click", () => {
          document.body.classList.toggle("collapsed");
        });
      }
      const chatBtn = document.querySelector(".agent .btn");
      if (chatBtn) chatBtn.addEventListener("click", () => this.navigate("chat"));

      this.route = (location.hash || "#/dashboard").replace("#/", "");
      window.addEventListener("hashchange", () => {
        this.route = (location.hash || "#/dashboard").replace("#/", "");
        document.body.classList.remove("nav-open");
        this.render();
      });
      await this.refresh();
      API.memory().then((data) => {
        this.memoryCount = (data.memories || []).length;
        this.renderNav();
      }).catch(() => {});

      // mantener el perfil activo sincronizado si cambia en servidor
      setInterval(() => {
        if (document.hidden) return;
        API.health().catch(() => {});
      }, 60000);
    }
  };

  UI.$("body > #view")?.setAttribute("data-ready", "1");
  window.App = App;
  document.addEventListener("DOMContentLoaded", () => App.boot());
})();
