/* Ely Cowork · aplicación: navegación, cabecera y arranque. */
(function () {
  "use strict";

  /* Fallback seguro por si i18n.js aún no cargó (se sobrescribe al cargar). */
  if (!window.t) window.t = (key) => key;

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
      { id: "storage", label: "Local Storage", desc: "Archivos por perfil: generado y planeado" },
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
    storage: ["Local Storage", "Archivos por perfil: generado y planeado"],
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
    ide: ["IDE", "Editor de código con IA"],
    extensions: ["Extensiones", "Instala y activa extensiones con permisos"]
  };

  /* Vistas que ocupan la altura completa y no llevan contenedor con relleno. */
  const FULL_BLEED = { chat: true, ide: true };

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
      if (route === "chat" && this.route !== "chat") this.routeBeforeChat = this.route;
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

    /* Salud derivada del trabajo real asignado a cada perfil. Se conserva
       durante cinco horas; no dispara sondeos ajenos a la actividad. */
    recordApiWork(profileId, ok, apiName) {
      if (!profileId) return;
      let checks = {};
      try { checks = JSON.parse(localStorage.getItem("ely.apiWorkChecks") || "{}"); } catch (e) { /* estado corrupto */ }
      if (!checks[profileId] || typeof checks[profileId] !== "object" || Array.isArray(checks[profileId])) checks[profileId] = {};
      checks[profileId][apiName || "work"] = { ok: Boolean(ok), at: Date.now() };
      try { localStorage.setItem("ely.apiWorkChecks", JSON.stringify(checks)); } catch (e) { /* almacenamiento no disponible */ }
      this.apiWorkChecks = checks;
      this.renderHeader();
    },

    apiWorkHealth() {
      let checks = this.apiWorkChecks;
      if (!checks) {
        try { checks = JSON.parse(localStorage.getItem("ely.apiWorkChecks") || "{}"); } catch (e) { checks = {}; }
        this.apiWorkChecks = checks;
      }
      /* Usa exclusivamente el perfil activo configurado en Ely Cowork. */
      const profileChecks = checks[this.profileId()];
      const cutoff = Date.now() - 5 * 60 * 60 * 1000;
      const values = profileChecks && typeof profileChecks === "object"
        ? (typeof profileChecks.ok === "boolean" ? [profileChecks] : Object.values(profileChecks)) : [];
      const recent = values.filter((item) => item && item.at >= cutoff && typeof item.ok === "boolean");
      if (!recent.length) return { state: "idle", title: t("header.apiHealthIdle") };
      const passed = recent.filter((item) => item.ok).length;
      if (!passed) return { state: "down", title: t("header.apiHealthNone") };
      if (passed < recent.length) return { state: "partial", title: t("header.apiHealthSome") };
      return { state: "ok", title: t("header.apiHealthAll") };
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
      const pills = UI.el("div", { class: "row cowork-header-items", style: { gap: "8px", flexWrap: "nowrap" } });
      const flowPill = UI.el("button", { class: "status-pill click", type: "button", title: t("header.activeFlow"), onclick: () => this.navigate("workflows") }, [
        UI.el("span", { class: "muted", text: "⊟", "aria-hidden": "true" }),
        UI.el("span", { class: "trunc", style: { maxWidth: "200px" }, text: this.activeFlowLabel() })
      ]);
      pills.appendChild(flowPill);

      const health = this.apiWorkHealth();
      pills.appendChild(UI.el("div", {
        class: "status-pill api-work-health api-work-health-" + health.state,
        title: health.title,
        role: "status",
        "aria-label": t("header.testKey") + ": " + health.title
      }, [
        UI.el("span", { class: "api-work-health-dot", "aria-hidden": "true" }),
        UI.el("span", { text: t("header.testKey") })
      ]));

      pills.appendChild(UI.el("button", {
        class: "icon-btn", type: "button", html: "⚙", title: t("header.settings"),
        "aria-label": t("header.settings"), onclick: () => Settings.openModal(this, "cowork")
      }));

      pills.appendChild(UI.el("button", {
        class: "icon-btn", type: "button", html: "◔", title: t("header.scheduledJobs"),
        "aria-label": t("header.scheduledJobs"), onclick: () => this.navigate("jobs")
      }));
      header.appendChild(pills);
    },

    /* ---------------------------------------------------------- navegación */
    renderNav() {
      const nav = UI.$("#nav");
      if (!nav) return;
      UI.clear(nav);
      const groupKey = { "Desarrollo": "nav.desarrollo", "Orquestación": "nav.orquestacion", "Operaciones": "nav.operaciones", "Inspección": "nav.inspeccion" };
      const cliLink = UI.el("a", {
        class: "nav-cli" + (this.route === "chat" ? " active" : ""),
        href: "#/chat",
        title: "CLI",
        "aria-label": "CLI · chat",
        "data-nav-cli": ""
      }, [UI.el("span", { class: "nav-title", text: "CLI" })]);
      NAV.forEach((group) => {
        const gLabel = window.I18N ? t(groupKey[group.group] || group.group) : group.group;
        nav.appendChild(UI.el("div", { class: "nav-group" }, [UI.el("span", { text: gLabel })]));
        (group.items || []).forEach((item) => {
          const desc = window.I18N ? (t("navdesc." + item.id) !== "navdesc." + item.id ? t("navdesc." + item.id) : (item.desc || "")) : (item.desc || "");
          const link = UI.el("a", {
            class: item.id === this.route ? "active" : "",
            href: "#/" + item.id,
            title: item.label
          }, [
            UI.el("span", { class: "nav-title", text: item.label }),
            UI.el("span", { class: "nav-desc", text: desc })
          ]);
          if (item.id === "tools" && this.mcp && this.mcp.status === "configured") {
            link.appendChild(UI.el("span", { class: "badge-dot", text: this.mcp.servers.length }));
          }
          if (item.id === "memory" && this.memoryCount) {
            link.appendChild(UI.el("span", { class: "badge-dot", text: this.memoryCount }));
          }
          nav.appendChild(link);
          if (item.id === "ide") nav.appendChild(cliLink);
        });
      });

      /* Si otra vista de la aplicación está activa, conserva un tercer acceso
         al contraer el menú. CLI e IDE ya tienen su acceso fijo y no se duplican. */
      const currentNav = NAV.flatMap((group) => group.items || []).find((item) => item.id === this.route);
      if (currentNav && currentNav.id !== "ide") {
        nav.appendChild(UI.el("a", {
          class: "nav-current-view active",
          href: "#/" + currentNav.id,
          title: currentNav.label,
          "aria-label": currentNav.label,
          "aria-current": "page",
          "data-nav-current": ""
        }, [UI.el("span", { class: "nav-title nav-current-icon", text: currentNav.icon || currentNav.label.slice(0, 1) })]));
      }
      this.renderSidebarSettings();
    },

    renderSidebarSettings() {
      const footer = UI.$("#sidebar-settings");
      if (!footer) return;
      const isCli = this.route === "chat";
      footer.hidden = isCli;
      UI.clear(footer);
      if (isCli) return; // CLI tiene su propio pie en la barra lateral del chat.
      const scope = "cowork";
      const label = t("set.title") + " · Ely Cowork";
      const button = UI.el("button", {
        class: "sidebar-settings-button",
        type: "button",
        title: label,
        "aria-label": label
      }, [
        UI.el("span", { class: "vsc-codicon codicon-gear", "aria-hidden": "true" }),
        UI.el("span", { class: "sidebar-settings-label", text: label })
      ]);
      button.addEventListener("click", () => Settings.openModal(this, scope));
      footer.appendChild(button);
    },

    /* ---------------------------------------------------------- router */
    render() {
      if (window.Settings) Settings.apply();
      this.renderNav();
      this.renderHeader();
      /* El botón flotante sobra cuando ya estás en el chat. */
      if (this.chatFab) this.chatFab.style.display = this.route === "chat" ? "none" : "flex";
      if (window.ChatWidget) ChatWidget.onRoute(this.route);
      const view = UI.$("#view");
      if (!view || !this.connected) return;
      UI.clear(view);
      view.scrollTop = 0;

      /* Módulos que el HTML base no declara: se cargan bajo demanda, sin
         modificar el documento original. */
      const LAZY = {
        extensions: "js/views/extensions.js",
        skillslib: "js/views/skillslib.js",
        repos: "js/views/repos.js",
        storage: "js/views/storage.js"
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

      /* Módulos nuevos no declarados en el HTML base: i18n y visor de archivos.
         Se cargan antes del primer render para que t()/FileViewer existan. */
      const loadScript = (src) => new Promise((resolve) => {
        const el = document.createElement("script");
        el.src = src + "?v=" + Date.now();
        el.onload = resolve;
        el.onerror = resolve;
        document.head.appendChild(el);
      });
      await loadScript("js/i18n.js");
      /* El idioma activo puede ser un paquete externo (de, fr, ru, zh…):
         se carga antes del primer render para no pintar en el idioma viejo. */
      if (window.I18N && I18N.ensure) await I18N.ensure(I18N.lang());
      await loadScript("js/viewer.js");
      await loadScript("js/icons.js");
      await loadScript("js/syntax.js");
      /* Almacén único de conversación: debe existir antes de cualquier vista
         de chat y antes del widget flotante (compartido con el CLI). */
      await loadScript("js/chat-store.js");
      /* Accesibilidad: hoja + módulo (paridad con VS Code). Se inyectan en
         runtime para no tocar el index.html base. */
      if (!document.getElementById("ely-a11y-css")) {
        const link = document.createElement("link");
        link.id = "ely-a11y-css";
        link.rel = "stylesheet";
        link.href = "css/a11y.css?v=" + Date.now();
        document.head.appendChild(link);
      }
      await loadScript("js/a11y.js");
      if (window.A11y) A11y.init(this);
      /* Autocompletado con Tab (activado por defecto) y host de extensiones. */
      await loadScript("js/completion.js");
      /* Panel inferior estilo VS Code: glifos, canales de salida y terminal. */
      await loadScript("js/glyphs.js");
      await loadScript("js/output.js");
      await loadScript("js/terminal.js");
      if (window.Output) Output.init({});
      await loadScript("js/ext-host.js");
      if (window.ExtHost) ExtHost.init();

      const side = document.querySelector("aside");
      if (side) {
        const collapse = side.querySelector(".collapse");
        if (collapse) collapse.addEventListener("click", () => {
          document.body.classList.toggle("collapsed");
          if (window.Settings) Settings.apply();
        });
        side.appendChild(UI.el("div", { class: "sidebar-footer", id: "sidebar-settings" }));
      }
      let sidebarHidden = false;
      try { sidebarHidden = localStorage.getItem("ely.cowork.sidebarHidden") === "1"; } catch (e) { /* noop */ }
      const sidebarPeek = UI.el("button", {
        id: "sidebar-peek",
        class: "sidebar-peek",
        type: "button",
        onclick: () => {
          sidebarHidden = !sidebarHidden;
          document.body.classList.toggle("sidebar-hidden", sidebarHidden);
          if (sidebarHidden) document.body.classList.remove("nav-open");
          else if (window.innerWidth <= 880) document.body.classList.add("nav-open");
          try { localStorage.setItem("ely.cowork.sidebarHidden", sidebarHidden ? "1" : "0"); } catch (e) { /* noop */ }
          updateSidebarPeek();
          if (window.Settings) Settings.apply();
        }
      });
      const updateSidebarPeek = () => {
        sidebarPeek.textContent = sidebarHidden ? "›" : "‹";
        const label = t(sidebarHidden ? "app.showSidebar" : "app.hideSidebar");
        sidebarPeek.title = label;
        sidebarPeek.setAttribute("aria-label", label);
        sidebarPeek.setAttribute("aria-expanded", sidebarHidden ? "false" : "true");
      };
      document.body.classList.toggle("sidebar-hidden", sidebarHidden);
      document.body.appendChild(sidebarPeek);
      updateSidebarPeek();
      if (window.Settings) Settings.apply();
      /* El chat ya no se abre desde la tarjeta Photon de la barra lateral
         (oculta por CSS): botón flotante verde abajo a la derecha. Se crea
         en tiempo de ejecución, como #toasts, sin tocar el HTML base. */
      const fab = UI.el("button", {
        id: "chat-fab", title: "Abrir chat", "aria-label": "Abrir chat",
        onclick: () => { if (window.ChatWidget) ChatWidget.toggle(); else this.navigate("chat"); }
      }, [
        UI.el("span", { class: "fab-icon", text: "❯" }),
        UI.el("span", { text: "Chat" })
      ]);
      document.body.appendChild(fab);
      this.chatFab = fab;

      /* Widget de chat desplegable: módulo no declarado en el HTML base,
         se carga en tiempo de ejecución (como las vistas LAZY). */
      const ws = document.createElement("script");
      ws.src = "js/chat-widget.js?v=" + Date.now();
      ws.onload = () => { if (window.ChatWidget) ChatWidget.init(this, fab); };
      document.head.appendChild(ws);

      this.route = (location.hash || "#/dashboard").replace("#/", "");
      this.renderSidebarSettings();
      window.addEventListener("hashchange", () => {
        const next = (location.hash || "#/dashboard").replace("#/", "");
        if (next === "chat" && this.route !== "chat") this.routeBeforeChat = this.route;
        this.route = next;
        document.body.classList.remove("nav-open");
        this.render();
      });
      window.addEventListener("resize", () => { if (window.Settings) Settings.apply(); });
      document.addEventListener("keydown", (event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === ",") {
          event.preventDefault();
          const scope = this.route === "ide" ? "ide" : this.route === "chat" ? "cli" : "cowork";
          Settings.openModal(this, scope);
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
        this.renderHeader(); // expira el estado API al superar las cinco horas.
        API.health().catch(() => {});
      }, 60000);
    }
  };

  window.App = App;
  document.addEventListener("DOMContentLoaded", () => App.boot());
})();
