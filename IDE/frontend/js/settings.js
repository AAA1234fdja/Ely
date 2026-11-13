/* Ely Cowork · ajustes y preferencias del cliente.
 *
 * Persisten en localStorage (Store) y se aplican al documento. Todo lo que
 * toca al servidor (claves, perfil por defecto) se delega en la API.
 */
(function () {
  "use strict";

  const Settings = {
    defaults: {
      language: "es",           // uno de los 14 idiomas de I18N.langs
      tabCompletion: true,      // completar código con Tab (ACTIVADO por defecto)
      nationality: "CO",        // nacionalidad → zona horaria de las horas
      workLocation: "local",    // CLI: lugar de trabajo principal (local = Local Storage)
      density: "comfortable",   // IDE: comfortable | compact
      viewScale: 1,             // Cowork: escala visual propia
      ideScale: 1,              // escala visual exclusiva de IDE
      cliScale: 1,              // escala visual exclusiva de CLI
      stream: true,             // streaming SSE en el chat
      sendOnEnter: true,
      showUsage: true,          // mostrar tokens/latencia bajo cada respuesta
      confirmClose: true,       // avisar al cerrar un archivo con cambios
      reducedMotion: false
    },

    key: "ely.settings.v09",
    scopeKeys: { ide: "ely.settings.ide.v1", cli: "ely.settings.cli.v1", cowork: "ely.settings.cowork.v1" },
    settingScopes: {
      tabCompletion: "ide", density: "ide", confirmClose: "ide", ideScale: "ide",
      stream: "cli", sendOnEnter: "cli", showUsage: "cli", workLocation: "cli", cliScale: "cli",
      language: "cowork", nationality: "cowork",
      viewScale: "cowork", reducedMotion: "cowork"
    },

    get all() {
      let legacy = {};
      try { legacy = JSON.parse(localStorage.getItem(this.key) || "{}"); } catch (e) { /* ignored */ }
      const merged = Object.assign({}, this.defaults);
      Object.keys(this.scopeKeys).forEach((scope) => {
        let saved = {};
        try { saved = JSON.parse(localStorage.getItem(this.scopeKeys[scope]) || "{}"); } catch (e) { /* ignored */ }
        Object.keys(this.settingScopes).forEach((name) => {
          if (this.settingScopes[name] === scope && Object.prototype.hasOwnProperty.call(legacy, name)) merged[name] = legacy[name];
        });
        Object.assign(merged, saved);
      });
      return merged;
    },

    get(name) { return this.all[name]; },

    set(patch) {
      const current = this.all;
      const groups = {};
      Object.keys(patch || {}).forEach((name) => {
        const scope = this.settingScopes[name] || "cowork";
        if (!groups[scope]) groups[scope] = {};
        groups[scope][name] = patch[name];
      });
      try {
        Object.keys(groups).forEach((scope) => {
          const scoped = {};
          Object.keys(this.settingScopes).forEach((name) => {
            if (this.settingScopes[name] === scope) scoped[name] = current[name];
          });
          Object.assign(scoped, groups[scope]);
          localStorage.setItem(this.scopeKeys[scope], JSON.stringify(scoped));
        });
      } catch (e) { /* almacenamiento bloqueado */ }
      this.apply();
      Store.set({});
      if (patch.language && window.I18N) {
        window.dispatchEvent(new Event("ely:langchange"));
        if (I18N.apply) I18N.apply(document.body);
        if (window.App && App.render) {
          try { App.renderNav(); App.renderHeader(); App.render(); } catch (e) { /* noop */ }
        }
      }
      return this.all;
    },

    reset(scope) {
      const scopes = scope && this.scopeKeys[scope] ? [scope] : Object.keys(this.scopeKeys);
      try {
        scopes.forEach((id) => localStorage.removeItem(this.scopeKeys[id]));
        let legacy = {};
        try { legacy = JSON.parse(localStorage.getItem(this.key) || "{}"); } catch (e) { /* ignored */ }
        Object.keys(this.settingScopes).forEach((name) => {
          if (scopes.includes(this.settingScopes[name])) delete legacy[name];
        });
        if (Object.keys(legacy).length) localStorage.setItem(this.key, JSON.stringify(legacy));
        else localStorage.removeItem(this.key);
      } catch (e) { /* noop */ }
      this.apply();
      if (scopes.includes("cowork") && window.I18N && I18N.setLang) I18N.setLang(this.all.language);
      return this.all;
    },

    /** Aplica cada preferencia únicamente cuando su entorno está activo. */
    apply() {
      const values = this.all;
      const root = document.documentElement;
      const body = document.body;
      const route = window.App && App.route;
      const activeScope = route === "ide" ? "ide" : route === "chat" ? "cli" : "cowork";
      body.dataset.settingsScope = activeScope;
      const ide = this.getScopeValues("ide", values);
      const cli = this.getScopeValues("cli", values);
      const cowork = this.getScopeValues("cowork", values);
      body.dataset.density = ide.density;
      body.dataset.reducedMotion = cowork.reducedMotion ? "1" : "0";
      const scaleOptions = [0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5];
      const validScale = (value) => scaleOptions.includes(Number(value)) ? Number(value) : 1;
      const coworkScale = validScale(cowork.viewScale);
      const activeScale = activeScope === "ide" ? validScale(ide.ideScale)
        : activeScope === "cli" ? validScale(cli.cliScale) : coworkScale;
      root.dataset.viewScale = String(Math.round(coworkScale * 100));
      const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
      const rawSidebarWidth = parseFloat(window.getComputedStyle(body).getPropertyValue("--sidebar"));
      const sidebarWidth = Number.isFinite(rawSidebarWidth) ? rawSidebarWidth : 268;
      const sidebarContentWidth = viewportWidth <= 880 ? 268 : sidebarWidth;
      const sidebarTrackWidth = viewportWidth <= 880 ? 0 : sidebarWidth * coworkScale;
      root.style.setProperty("--ely-cowork-scale", String(coworkScale));
      root.style.setProperty("--ely-active-scale", String(activeScale));
      root.style.setProperty("--ely-sidebar-track", sidebarTrackWidth + "px");
      root.style.setProperty("--ely-sidebar-edge", (sidebarContentWidth * coworkScale) + "px");
      root.style.setProperty("--ely-sidebar-content-width", sidebarContentWidth + "px");
      root.style.setProperty("--ely-sidebar-height", (viewportHeight / coworkScale) + "px");
      root.style.setProperty("--ely-main-width", (Math.max(0, viewportWidth - sidebarTrackWidth) / activeScale) + "px");
      root.style.setProperty("--ely-main-height", (viewportHeight / activeScale) + "px");

      let style = document.getElementById("ely-settings-style");
      if (!style) {
        style = document.createElement("style");
        style.id = "ely-settings-style";
        document.head.appendChild(style);
      }
      style.textContent = [
        'body[data-settings-scope="ide"][data-density="compact"] #view { padding: 14px; }',
        'body[data-settings-scope="ide"][data-density="compact"] .card { padding: 12px; }',
        'body[data-settings-scope="ide"][data-density="compact"] tbody td { padding: 6px 10px; }',
        'body[data-settings-scope="ide"][data-density="compact"] .chat-log { gap: 10px; }',
        'body { grid-template-columns: var(--ely-sidebar-track, var(--sidebar)) minmax(0, 1fr); }',
        'body aside { width: var(--ely-sidebar-content-width); height: var(--ely-sidebar-height); transform: scale(var(--ely-cowork-scale, 1)); transform-origin: top left; }',
        'body main { zoom: var(--ely-active-scale, 1); width: var(--ely-main-width); height: var(--ely-main-height); min-height: var(--ely-main-height); }',
        '@media (max-width: 880px) { body aside { transform: scale(var(--ely-cowork-scale, 1)) translateX(-100%); } body.nav-open aside { transform: scale(var(--ely-cowork-scale, 1)) translateX(0); } body.collapsed aside { transform: scale(var(--ely-cowork-scale, 1)) translateX(-100%); } }',
        'body[data-settings-scope="cowork"][data-reduced-motion="1"] * { animation-duration: 0.001s !important; transition-duration: 0.001s !important; }'
      ].join("\n");
    },

    getScopeValues(scope, values) {
      const result = {};
      Object.keys(this.settingScopes).forEach((name) => {
        if (this.settingScopes[name] === scope) result[name] = values[name];
      });
      return result;
    },

    /** Panel de ajustes: preferencias locales + estado real del backend. */
    openModal(App, initialScope) {
      let ref;
      let activeScope = ["ide", "cli", "cowork"].includes(initialScope) ? initialScope : "cowork";
      const buildPanel = () => this.panel(App, rebuild, activeScope, (scope) => { activeScope = scope; });
      const rebuild = () => {
        App.renderHeader();
        App.render();
        if (ref) {
          UI.clear(ref.content);
          ref.content.appendChild(buildPanel());
        }
      };
      ref = UI.modal({
        title: t("set.title"),
        subtitle: t("set.subtitle"),
        body: buildPanel(),
        footer: [
          UI.btn(t("set.reset"), () => {
            this.reset(activeScope);
            rebuild();
            UI.toast("ok", t("set.resetDone"));
          }, { ghost: true }),
          UI.btn(t("set.done"), () => ref.close(), { primary: true })
        ]
      });
      return ref;
    },

    panel(App, rebuild, initialScope, onScopeChange) {
      const values = this.all;
      const box = UI.el("div", { class: "stack settings-panel" });
      const scopeLabels = { ide: "IDE", cli: "CLI", cowork: "Ely Cowork" };
      const panes = {};
      const tabs = {};
      const scopeIds = Object.keys(scopeLabels);
      scopeIds.forEach((id) => {
        panes[id] = UI.el("section", {
          class: "settings-scope",
          role: "tabpanel",
          id: "settings-scope-" + id,
          "aria-label": scopeLabels[id],
          hidden: id !== initialScope
        });
      });
      const tablist = UI.el("div", {
        class: "settings-tabs", role: "tablist", "aria-label": t("set.title"),
        onkeydown: (event) => {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
          event.preventDefault();
          const current = scopeIds.findIndex((scope) => tabs[scope].getAttribute("aria-selected") === "true");
          const delta = event.key === "ArrowRight" ? 1 : -1;
          const next = scopeIds[(current + delta + scopeIds.length) % scopeIds.length];
          selectScope(next);
          tabs[next].focus();
        }
      }, scopeIds.map((id) => {
          tabs[id] = UI.el("button", {
            type: "button",
            class: "settings-tab" + (id === initialScope ? " active" : ""),
            role: "tab",
            id: "settings-tab-" + id,
            "aria-selected": id === initialScope ? "true" : "false",
            "aria-controls": "settings-scope-" + id,
            tabindex: id === initialScope ? "0" : "-1",
            text: scopeLabels[id],
            onclick: () => selectScope(id)
          });
          return tabs[id];
        }));
      box.appendChild(tablist);
      scopeIds.forEach((id) => box.appendChild(panes[id]));
      const inScope = (id, node) => panes[id].appendChild(node);
      const selectScope = (id) => {
        if (!panes[id]) return;
        scopeIds.forEach((scope) => {
          panes[scope].hidden = scope !== id;
          tabs[scope].classList.toggle("active", scope === id);
          tabs[scope].setAttribute("aria-selected", scope === id ? "true" : "false");
          tabs[scope].tabIndex = scope === id ? 0 : -1;
        });
        if (onScopeChange) onScopeChange(id);
      };

      const row = (label, hint, control) => UI.el("div", {
        class: "row between",
        style: { borderTop: "1px solid var(--border)", padding: "10px 0", gap: "14px" }
      }, [
        UI.el("div", { class: "grow" }, [
          UI.el("div", { style: { fontSize: "12.5px" }, text: label }),
          hint ? UI.el("div", { class: "muted", style: { fontSize: "11px" }, text: hint }) : null
        ]),
        control
      ]);

      const toggle = (name) => {
        const input = UI.el("input", {
          type: "checkbox",
          checked: values[name],
          onchange: (event) => this.set({ [name]: event.target.checked })
        });
        return UI.el("label", { class: "switch" }, [input, UI.el("span")]);
      };

      /* --- accesibilidad: panel completo del módulo a11y.js --- */
      if (window.A11y) {
        inScope("ide", UI.el("div", {
          class: "row between",
          style: { borderTop: "1px solid var(--border)", padding: "10px 0", gap: "14px" }
        }, [
          UI.el("div", { class: "grow" }, [
            UI.el("div", { style: { fontSize: "12.5px" }, text: t("a11y.settings") }),
            UI.el("div", { class: "muted", style: { fontSize: "11px" }, text: t("a11y.settingsSub") })
          ]),
          UI.btn(t("a11y.openSettings"), () => A11y.openSettings(), { small: true })
        ]));
      }

      /* --- idioma: 14 paquetes, orden alfabético por nombre nativo --- */
      const langInfo = UI.el("div", { class: "muted set-lang-info", style: { fontSize: "11px", marginTop: "4px" } });
      const paintLangInfo = () => {
        const id = I18N.lang();
        const meta = I18N.meta(id);
        const cov = I18N.coverage(id);
        UI.clear(langInfo);
        langInfo.appendChild(UI.el("span", {
          text: meta.name + " · " + cov.translated + "/" + cov.total + " (" + cov.pct + "%) " + t("set.langCoverage")
        }));
        if (meta.note) {
          langInfo.appendChild(UI.el("div", { class: "set-lang-note", style: { marginTop: "2px" }, text: t("set.langNote." + meta.note) }));
        }
        if (cov.pct < 100) {
          langInfo.appendChild(UI.el("div", { class: "set-lang-note", style: { marginTop: "2px" }, text: t("set.langFallback") }));
        }
      };
      /* Si el idioma cambia desde fuera del panel (paleta, API), la info se
       * repinta sola; el listener se retira cuando el panel sale del DOM. */
      const onLangChange = () => {
        if (!langInfo.isConnected) { window.removeEventListener("ely:langchange", onLangChange); return; }
        paintLangInfo();
      };
      window.addEventListener("ely:langchange", onLangChange);
      const langSelect = UI.el("select", {
        style: { width: "230px" },
        "aria-label": t("set.language"),
        onchange: (event) => {
          const id = event.target.value;
          /* Carga el paquete antes de aplicar el idioma: así no hay parpadeo. */
          I18N.setLang(id).then(() => { paintLangInfo(); if (rebuild) rebuild(); });
        }
      }, I18N.langs.map((l) => UI.el("option", {
        value: l.id, selected: values.language === l.id,
        text: l.name + (l.name === l.en ? "" : " · " + l.en)
      })));
      paintLangInfo();
      inScope("cowork", row(t("set.language"), t("set.languageHint"), UI.el("div", {}, [langSelect, langInfo])));

      /* El perfil configurado de Cowork queda visible al abrir esta pestaña. */
      const profileSelect = UI.el("select", {
        style: { width: "190px" },
        "aria-label": t("set.profile"),
        onchange: (event) => {
          App.setProfile(event.target.value);
          if (rebuild) rebuild();
        }
      }, (App.profiles || []).map((profile) => UI.el("option", {
        value: profile.id,
        selected: profile.id === App.profileId(),
        text: profile.label
      })));
      inScope("cowork", row(t("set.profile"), "", profileSelect));

      /* --- nacionalidad → zona horaria de las horas --- */
      const preview = UI.el("span", { class: "mono", style: { fontSize: "12px" }, text: I18N.fmtDateTime(new Date()) });
      const countrySelect = UI.el("select", {
        style: { width: "190px" },
        onchange: (event) => {
          this.set({ nationality: event.target.value });
          preview.textContent = I18N.fmtDateTime(new Date());
        }
      }, I18N.countries.map((c) => UI.el("option", {
        value: c.id, selected: values.nationality === c.id,
        text: (I18N.lang() === "es" ? c.es : c.en) + " · " + c.tz.split("/").pop().replace(/_/g, " ")
      })));
      inScope("cowork", row(t("set.nationality"), t("set.nationalityHint"), countrySelect));
      inScope("cowork", row(t("set.timePreview"), "mes/día/año hora:minuto", preview));

      const density = UI.el("select", {
        style: { width: "150px" },
        onchange: (event) => this.set({ density: event.target.value })
      }, [
        UI.el("option", { value: "comfortable", selected: values.density === "comfortable", text: t("set.comfortable") }),
        UI.el("option", { value: "compact", selected: values.density === "compact", text: t("set.compact") })
      ]);

      inScope("ide", row(t("set.density"), t("set.densityHint"), density));

      /* Escala independiente para cada entorno: no altera el zoom del navegador. */
      const scaleValues = [0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5];
      const scaleSelect = (name) => UI.el("select", {
        style: { width: "120px" },
        "aria-label": t("set.viewScale"),
        onchange: (event) => this.set({ [name]: Number(event.target.value) })
      }, scaleValues.map((scale) => UI.el("option", {
        value: String(scale), selected: Number(values[name]) === scale,
        text: Math.round(scale * 100) + " %"
      })));
      inScope("ide", row(t("set.viewScale"), t("set.viewScaleHint"), scaleSelect("ideScale")));
      inScope("cli", row(t("set.viewScale"), t("set.viewScaleHint"), scaleSelect("cliScale")));
      inScope("cowork", row(t("set.viewScale"), t("set.viewScaleHint"), scaleSelect("viewScale")));

      /* --- autocompletado con Tab: activado por defecto --- */
      const tabInput = UI.el("input", {
        type: "checkbox",
        checked: values.tabCompletion !== false,
        onchange: (event) => {
          if (window.Completion) Completion.setEnabled(event.target.checked);
          else this.set({ tabCompletion: event.target.checked });
          UI.toast("ok", event.target.checked ? t("cmp.on") : t("cmp.off"));
        }
      });
      document.addEventListener("completion:change", (event) => {
        tabInput.checked = !!(event.detail && event.detail.enabled);
      });
      inScope("ide", row(t("cmp.settingLabel"), t("cmp.settingHelp"),
        UI.el("label", { class: "switch" }, [tabInput, UI.el("span")])));
      inScope("cli", row(t("set.stream"), t("set.streamHint"), toggle("stream")));
      inScope("cli", row(t("set.enterSends"), t("set.enterSendsHint"), toggle("sendOnEnter")));
      inScope("cli", row(t("set.showUsage"), t("set.showUsageHint"), toggle("showUsage")));
      inScope("ide", row(t("set.confirmClose"), t("set.confirmCloseHint"), toggle("confirmClose")));
      inScope("cowork", row(t("set.reducedMotion"), t("set.reducedMotionHint"), toggle("reducedMotion")));

      /* --- estado del backend --- */
      const summary = Engine.summary();
      inScope("cowork", UI.el("div", { class: "divider" }));
      inScope("cowork", UI.el("h3", { style: { marginTop: 0 }, text: t("set.connection") }));
      inScope("cowork", UI.el("dl", { class: "kv", style: { fontSize: "12px" } }, [
        UI.el("dt", { text: t("set.server") }),
        UI.el("dd", null, [UI.badge(summary.connected ? t("set.online") : t("set.offline"), summary.connected ? "ok" : "err")]),
        UI.el("dt", { text: t("set.model") }),
        UI.el("dd", { class: "mono", text: summary.model || "—" }),
        UI.el("dt", { text: t("set.key") }),
        UI.el("dd", { text: summary.keyState }),
        UI.el("dt", { text: t("set.endpoint") }),
        UI.el("dd", { class: "mono", style: { fontSize: "11px" }, text: summary.endpoint || "—" }),
        UI.el("dt", { text: t("set.mcps") }),
        UI.el("dd", { text: Engine.mcp ? Engine.mcp.status : "—" })
      ]));
      inScope("cowork", UI.el("div", { class: "row", style: { marginTop: "10px" } }, [
        UI.btn(t("set.integrations"), () => { App.navigate("integrations"); }, { small: true, ghost: true }),
        UI.btn(t("set.config"), () => { App.navigate("config"); }, { small: true, ghost: true })
      ]));

      return box;
    }
  };

  Settings.apply();
  window.Settings = Settings;
})();
