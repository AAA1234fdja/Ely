/* Ely Cowork · aplicación: navegación, cabecera y arranque. */
(function () {
  "use strict";

  /* Respaldo estático: el servidor publica la tabla real en /api/routes.
     Estructura de navegación tomada de las capturas de referencia. */
  let NAV = [
    { group: "Desarrollo", items: [
      { id: "ide", label: "IDE", desc: "Editor de código con IA" }
    ]},
    { group: "Orquestación", items: [
      { id: "dashboard", label: "Dashboard", desc: "Resumen de sesión y acciones" },
      { id: "workflows", label: "Workflows", desc: "Define, edita y ejecuta flujos" },
      { id: "agents", label: "Agent Pool", desc: "Reutiliza agentes y workflows" },
      { id: "canvas", label: "Canvas", desc: "Diseña y orquesta visualmente" },
      { id: "teams", label: "Agent Teams", desc: "Coordina equipos y roles" }
    ]},
    { group: "Operaciones", items: [
      { id: "assets", label: "Asset Browser", desc: "Archivos y activos del workflow" },
      { id: "repos", label: "Repositories", desc: "Importa repositorios Git al workspace" },
      { id: "skillslib", label: "Skills Library", desc: "Capacidades operativas" },
      { id: "skills", label: "Skills", desc: "Edita y revisa skills" },
      { id: "tools", label: "Tools", desc: "Herramientas y llamadas" },
      { id: "integrations", label: "Integrations", desc: "Conecta sistemas externos" },
      { id: "jobs", label: "Scheduled Jobs", desc: "Tareas programadas" },
      { id: "pairing", label: "Pairing", desc: "Vincula dispositivos" },
      { id: "config", label: "Configuration", desc: "Ajustes y políticas" }
    ]},
    { group: "Inspección", items: [
      { id: "costs", label: "Cost Tracker", desc: "Gasto y eficiencia" },
      { id: "memory", label: "Memory", desc: "Memoria y grafo de contexto" }
    ]}
  ];

  let TITLES = {
    dashboard: ["Dashboard", "Resumen de sesión y acciones"],
    workflows: ["Workflows", "Define, edita y ejecuta flujos"],
    agents: ["Agent Pool", "Reutiliza agentes y workflows"],
    canvas: ["Canvas", "Diseña y orquesta visualmente"],
    teams: ["Agent Teams", "Coordina equipos y roles"],
    assets: ["Asset Browser", "Archivos y activos del workflow"],
    repos: ["Repositories", "Importa repositorios Git al workspace"],
    skillslib: ["Skills Library", "Capacidades operativas"],
    skills: ["Skills", "Edita y revisa skills"],
    tools: ["Tools", "Herramientas y llamadas"],
    integrations: ["Integrations", "Conecta sistemas externos"],
    jobs: ["Scheduled Jobs", "Tareas programadas"],
    pairing: ["Pairing", "Vincula dispositivos"],
    config: ["Configuration", "Ajustes y políticas"],
    costs: ["Cost Tracker", "Gasto y eficiencia"],
    memory: ["Memory", "Memoria y grafo de contexto"],
    chat: ["Chat", "Conversación con el perfil activo"],
    ide: ["IDE", "Editor de código con IA"]
  };

  /* Vistas que ocupan la altura completa y no llevan contenedor con relleno. */
  const FULL_BLEED = { chat: true };

  const App = {
    profiles: [],
    agents: [],
    health: null,
    mcp: null,
    connected: false,
    route: "dashboard",
    memoryCount: 0,

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
        API.setDefaultProfile(id).catch(() => { /* el servidor puede no persistir */ });
      }
      this.renderHeader();
      this.render();
    },

    navigate(route) {
      if (location.hash !== "#/" + route) location.hash = "#/" + route;
      else this.render();
    },

    /* Etiqueta del workflow activo (persistida por la vista de workflows). */
    activeFlowLabel() {
      try {
        return localStorage.getItem("ely.activeFlow") || "Sin workflow activo";
      } catch (e) {
        return "Sin workflow activo";
      }
    },

    setActiveFlow(label) {
      try {
        if (label) localStorage.setItem("ely.activeFlow", label);
        else localStorage.removeItem("ely.activeFlow");
      } catch (e) { /* noop */ }
      this.renderHeader();
    },

    /* ---------------------------------------------------------- datos */
    async refresh() {
      const state = await Engine.load(true);
      this.health = Engine.health;
      this.profiles = Engine.profiles;
      this.agents = Engine.agents;
      this.mcp = Engine.mcp;
      this.connected = state.connected;
      if (!this.connected) this.fatal(state.error);
      this.renderHeader();
      if (this.connected) this.render();
    },

    fatal(error) {
      const view = UI.$("#view");
      if (!view) return;
      UI.clear(view);
      view.appendChild(UI.el("div", { class: "view-body" }, [
        UI.el("div", { class: "hero" }, [
          UI.el("h2", { text: "El servidor local no responde" }),
          UI.el("p", {
            text: "La interfaz necesita el backend de Ely Cowork para hablar con los proveedores. " +
              "Inicia el servidor y vuelve a cargar."
          }),
          UI.el("pre", {
            class: "mono",
            style: { marginTop: "12px", background: "var(--bg)", padding: "11px 13px", borderRadius: "8px", border: "1px solid var(--border)", color: "var(--text-dim)" },
            text: "./CLI/ely serve --port 8765\n# o:\ncd CLI && python3 -m ely_cli serve"
          }),
          error
            ? UI.el("p", { class: "muted", style: { marginTop: "9px", fontSize: "11.5px" }, text: "Detalle: " + (error.message || error) })
            : null,
          UI.el("div", { class: "row", style: { marginTop: "14px" } }, [
            UI.btn("Reintentar", () => this.refresh(), { primary: true })
          ])
        ])
      ]));
    },

    /* ---------------------------------------------------------- cabecera */
    renderHeader() {
      const header = UI.$("header.top");
      if (!header) return;
      UI.clear(header);
      const entry = TITLES[this.route] || ["Ely Cowork", ""];
      const profile = this.profile();

      header.appendChild(UI.el("button", {
        class: "icon-btn", id: "nav-toggle", html: "☰", title: "Menú",
        onclick: () => document.body.classList.toggle("nav-open")
      }));

      header.appendChild(UI.el("div", { class: "page" }, [
        UI.el("div", {
          class: "crumbs",
          text: "ELY COWORK V" + (this.health ? this.health.version : "0.9.0") + " · PHOTON LABS"
        }),
        UI.el("h1", { text: entry[0] })
      ]));

      header.appendChild(UI.el("div", { class: "spacer" }));

      const pills = UI.el("div", { class: "row", style: { gap: "6px", flexWrap: "nowrap" } });

      /* workflow activo */
      const flowPill = UI.el("div", { class: "status-pill click", title: "Workflow activo en esta sesión" }, [
        UI.el("span", { class: "muted", text: "⊟" }),
        UI.el("span", { class: "trunc", style: { maxWidth: "148px" }, text: this.activeFlowLabel() })
      ]);
      flowPill.addEventListener("click", () => this.navigate("workflows"));
      pills.appendChild(flowPill);

      /* salud del backend */
      const connected = Boolean(this.health && this.health.ok);
      pills.appendChild(UI.el("div", { class: "status-pill" }, [
        UI.el("span", { class: "dot" + (connected ? "" : " off") }),
        UI.el("span", { text: connected ? "Trust verified" : "Servidor inactivo" })
      ]));

      /* perfil activo (real) */
      const select = UI.el("select", {
        onchange: (event) => this.setProfile(event.target.value)
      }, this.profiles.map((p) => UI.el("option", {
        value: p.id, selected: profile && p.id === profile.id,
        text: p.label + (p.has_key ? "" : " · sin clave")
      })));
      if (!this.profiles.length) select.appendChild(UI.el("option", { text: "sin perfiles" }));
      pills.appendChild(UI.el("div", { class: "status-pill" }, [
        UI.el("span", { class: "muted", text: "perfil" }),
        select
      ]));

      /* estado de la clave */
      const keyState = !profile ? "sin perfil"
        : !profile.has_key ? "sin clave"
        : profile.is_test_key ? "clave de prueba" : "clave propia";
      pills.appendChild(UI.el("div", {
        class: "status-pill",
        title: profile ? profile.key_var + " · " + (profile.masked_key || "sin valor") : ""
      }, [
        UI.el("span", { class: "dot" + (keyState === "sin clave" ? " off" : keyState === "clave de prueba" ? " warn" : "") }),
        UI.el("span", { text: keyState })
      ]));

      /* probar conexión */
      const testBtn = UI.el("button", { class: "icon-btn", html: "▷", title: "Probar conexión con el proveedor" });
      testBtn.addEventListener("click", async () => {
        testBtn.disabled = true;
        try {
          const result = await API.testProfile(this.profileId(), "chat");
          if (result.ok) UI.toast("ok", "Conexión verificada", result.detail + " · " + result.latency_ms + " ms");
          else if (result.reachable) UI.toast("warn", "Endpoint alcanzable · clave rechazada", "HTTP " + result.status + " — " + result.detail);
          else UI.toast("err", "Sin respuesta del endpoint", result.detail);
          if (this.route === "integrations" || this.route === "dashboard") this.render();
        } catch (err) {
          UI.toast("err", "Prueba fallida", err.message);
        }
        testBtn.disabled = false;
      });
      pills.appendChild(testBtn);

      pills.appendChild(UI.el("button", {
        class: "icon-btn", html: "⚙", title: "Ajustes",
        onclick: () => Settings.openModal(this)
      }));

      pills.appendChild(UI.el("button", {
        class: "icon-btn", html: "◔", title: "Historial de llamadas",
        onclick: () => this.navigate("jobs")
      }));

      pills.appendChild(UI.el("div", { class: "status-pill click", title: "Sesión local", onclick: () => this.navigate("config") }, [
        UI.el("span", { text: "Operador" })
      ]));

      header.appendChild(pills);
    },

    /* ---------------------------------------------------------- navegación */
    renderNav() {
      const nav = UI.$("#nav");
      if (!nav) return;
      UI.clear(nav);
      NAV.forEach((group) => {
        nav.appendChild(UI.el("div", { class: "nav-group" }, [UI.el("span", { text: group.group })]));
        (group.items || []).forEach((item) => {
          const link = UI.el("a", {
            class: item.id === this.route ? "active" : "",
            href: "#/" + item.id,
            title: item.label
          }, [
            UI.el("span", { class: "nav-title", text: item.label }),
            UI.el("span", { class: "nav-desc", text: item.desc || "" })
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
      /* El botón flotante sobra cuando ya estás en el chat. */
      if (this.chatFab) this.chatFab.style.display = this.route === "chat" ? "none" : "flex";
      const view = UI.$("#view");
      if (!view || !this.connected) return;
      UI.clear(view);
      view.scrollTop = 0;

      /* Módulos que el HTML base no declara: se cargan bajo demanda, sin
         modificar el documento original. */
      const LAZY = {
        skillslib: "js/views/skillslib.js",
        repos: "js/views/repos.js"
      };

      const factory = (window.Views || {})[this.route];
      if (!factory && LAZY[this.route]) {
        UI.clear(view);
        view.appendChild(UI.el("div", { class: "view-body" }, [UI.loading("Cargando vista…")]));
        const script = document.createElement("script");
        script.src = LAZY[this.route];
        script.onload = () => this.render();
        script.onerror = () => {
          UI.clear(view);
          view.appendChild(UI.el("div", { class: "view-body" }, [
            UI.errBox(new Error("No se pudo cargar " + LAZY[this.route]), () => this.render())
          ]));
        };
        document.head.appendChild(script);
        delete LAZY[this.route];
        return;
      }
      if (!factory) {
        view.appendChild(UI.el("div", { class: "view-body" }, [UI.empty("∅", "Vista no encontrada: " + this.route)]));
        return;
      }

      let node;
      try {
        node = factory(view, this);
      } catch (err) {
        view.appendChild(UI.el("div", { class: "view-body" }, [UI.errBox(err, () => this.render())]));
        return;
      }
      if (!(node instanceof Node)) return;

      if (FULL_BLEED[this.route]) {
        view.appendChild(node);
        return;
      }

      /* La franja de título va a sangre completa, como en la referencia;
         el resto del contenido queda dentro de un contenedor con relleno. */
      const head = node.querySelector ? node.querySelector(":scope > .view-head") : null;
      if (head && node.classList && node.classList.contains("stack")) {
        node.removeChild(head);
        view.appendChild(head);
      }
      const body = UI.el("div", { class: "view-body" });
      body.appendChild(node);
      view.appendChild(body);
    },

    /* ---------------------------------------------------------- arranque */
    async boot() {
      Settings.apply();

      const side = document.querySelector("aside");
      if (side) {
        const collapse = side.querySelector(".collapse");
        if (collapse) collapse.addEventListener("click", () => document.body.classList.toggle("collapsed"));
      }
      /* El chat ya no se abre desde la tarjeta Photon de la barra lateral
         (oculta por CSS): botón flotante verde abajo a la derecha. Se crea
         en tiempo de ejecución, como #toasts, sin tocar el HTML base. */
      const fab = UI.el("button", {
        id: "chat-fab", title: "Abrir chat (CLI)", "aria-label": "Abrir chat",
        onclick: () => this.navigate("chat")
      }, [
        UI.el("span", { class: "fab-icon", text: "❯" }),
        UI.el("span", { text: "Chat" })
      ]);
      document.body.appendChild(fab);
      this.chatFab = fab;

      this.route = (location.hash || "#/dashboard").replace("#/", "");
      window.addEventListener("hashchange", () => {
        this.route = (location.hash || "#/dashboard").replace("#/", "");
        document.body.classList.remove("nav-open");
        this.render();
      });
      document.addEventListener("keydown", (event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === ",") {
          event.preventDefault();
          Settings.openModal(this);
        }
      });

      /* tabla de navegación publicada por el backend */
      try {
        const data = await API.routes();
        if (data && Array.isArray(data.nav) && data.nav.length) {
          NAV = data.nav;
          /* Fusiona sin borrar: rutas fuera del nav (p. ej. "chat") conservan
             su título de respaldo. */
          data.nav.forEach((group) => (group.items || []).forEach((item) => {
            TITLES[item.id] = [item.label, item.desc || ""];
          }));
        }
      } catch (e) { /* se mantiene la tabla de respaldo */ }

      await this.refresh();

      API.memory().then((data) => {
        this.memoryCount = (data.memories || []).length;
        this.renderNav();
      }).catch(() => {});

      setInterval(() => {
        if (document.hidden) return;
        API.health().catch(() => {});
      }, 60000);
    }
  };

  window.App = App;
  document.addEventListener("DOMContentLoaded", () => App.boot());
})();
