/* Ely Cowork · ajustes y preferencias del cliente.
 *
 * Persisten en localStorage (Store) y se aplican al documento. Todo lo que
 * toca al servidor (claves, perfil por defecto) se delega en la API.
 */
(function () {
  "use strict";

  const Settings = {
    defaults: {
      language: "es",           // es | en (idioma de la interfaz)
      tabCompletion: true,      // completar código con Tab (ACTIVADO por defecto)
      nationality: "CO",        // nacionalidad → zona horaria de las horas
      workLocation: "local",    // lugar de trabajo principal (local = Local Storage)
      density: "comfortable",   // comfortable | compact
      stream: true,             // streaming SSE en el chat
      sendOnEnter: true,
      showUsage: true,          // mostrar tokens/latencia bajo cada respuesta
      confirmClose: true,       // avisar al cerrar un archivo con cambios
      reducedMotion: false
    },

    key: "ely.settings.v09",

    get all() {
      let stored = {};
      try {
        stored = JSON.parse(localStorage.getItem(this.key) || "{}");
      } catch (e) {
        stored = {};
      }
      return Object.assign({}, this.defaults, stored);
    },

    get(name) {
      return this.all[name];
    },

    set(patch) {
      const next = Object.assign(this.all, patch);
      try {
        localStorage.setItem(this.key, JSON.stringify(next));
      } catch (e) { /* almacenamiento bloqueado */ }
      this.apply();
      Store.set({});  // notifica a los suscriptores
      if (patch.language && window.I18N) {
        window.dispatchEvent(new Event("ely:langchange"));
        if (I18N.apply) I18N.apply(document.body);
        /* Repintar la vista activa: los textos generados con t() se crearon
           en el idioma anterior y no los alcanza el traductor del DOM. */
        if (window.App && App.render) {
          try { App.renderNav(); App.renderHeader(); App.render(); } catch (e) { /* noop */ }
        }
      }
      return next;
    },

    reset() {
      try {
        localStorage.removeItem(this.key);
      } catch (e) { /* noop */ }
      this.apply();
      return this.all;
    },

    /** Aplica los ajustes visuales al documento. */
    apply() {
      const values = this.all;
      const root = document.documentElement;
      root.dataset.density = values.density;
      root.dataset.reducedMotion = values.reducedMotion ? "1" : "0";

      let style = document.getElementById("ely-settings-style");
      if (!style) {
        style = document.createElement("style");
        style.id = "ely-settings-style";
        document.head.appendChild(style);
      }
      style.textContent = [
        '[data-density="compact"] #view { padding: 14px; }',
        '[data-density="compact"] .card { padding: 12px; }',
        '[data-density="compact"] tbody td { padding: 6px 10px; }',
        '[data-density="compact"] .chat-log { gap: 10px; }',
        '[data-reduced-motion="1"] * { animation-duration: 0.001s !important; transition-duration: 0.001s !important; }'
      ].join("\n");
    },

    /** Panel de ajustes: preferencias locales + estado real del backend. */
    openModal(App) {
      let ref;
      const rebuild = () => {
        App.renderHeader();
        App.render();
        if (ref) {
          UI.clear(ref.content);
          ref.content.appendChild(this.panel(App, rebuild));
        }
      };
      ref = UI.modal({
        title: t("set.title"),
        subtitle: t("set.subtitle"),
        body: this.panel(App, rebuild),
        footer: [
          UI.btn(t("set.reset"), () => {
            this.reset();
            rebuild();
            UI.toast("ok", t("set.resetDone"));
          }, { ghost: true }),
          UI.btn(t("set.done"), () => ref.close(), { primary: true })
        ]
      });
      return ref;
    },

    panel(App, rebuild) {
      const values = this.all;
      const box = UI.el("div", { class: "stack" });

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
        box.appendChild(UI.el("div", {
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

      /* --- idioma (español / inglés), con efecto inmediato --- */
      const langSelect = UI.el("select", {
        style: { width: "150px" },
        onchange: (event) => {
          this.set({ language: event.target.value });
          if (rebuild) rebuild();
        }
      }, [
        UI.el("option", { value: "es", selected: values.language !== "en", text: "Español" }),
        UI.el("option", { value: "en", selected: values.language === "en", text: "English" })
      ]);
      box.appendChild(row(t("set.language"), t("set.languageHint"), langSelect));

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
        text: (I18N.lang() === "en" ? c.en : c.es) + " · " + c.tz.split("/").pop().replace(/_/g, " ")
      })));
      box.appendChild(row(t("set.nationality"), t("set.nationalityHint"), countrySelect));
      box.appendChild(row(t("set.timePreview"), "mes/día/año hora:minuto", preview));

      const density = UI.el("select", {
        style: { width: "150px" },
        onchange: (event) => this.set({ density: event.target.value })
      }, [
        UI.el("option", { value: "comfortable", selected: values.density === "comfortable", text: t("set.comfortable") }),
        UI.el("option", { value: "compact", selected: values.density === "compact", text: t("set.compact") })
      ]);

      box.appendChild(row(t("set.density"), t("set.densityHint"), density));

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
      box.appendChild(row(t("cmp.settingLabel"), t("cmp.settingHelp"),
        UI.el("label", { class: "switch" }, [tabInput, UI.el("span")])));
      box.appendChild(row(t("set.stream"), t("set.streamHint"), toggle("stream")));
      box.appendChild(row(t("set.enterSends"), t("set.enterSendsHint"), toggle("sendOnEnter")));
      box.appendChild(row(t("set.showUsage"), t("set.showUsageHint"), toggle("showUsage")));
      box.appendChild(row(t("set.confirmClose"), t("set.confirmCloseHint"), toggle("confirmClose")));
      box.appendChild(row(t("set.reducedMotion"), t("set.reducedMotionHint"), toggle("reducedMotion")));

      /* --- estado del backend, sin valores inventados --- */
      const summary = Engine.summary();
      box.appendChild(UI.el("div", { class: "divider" }));
      box.appendChild(UI.el("h3", { style: { marginTop: 0 }, text: t("set.connection") }));
      box.appendChild(UI.el("dl", { class: "kv", style: { fontSize: "12px" } }, [
        UI.el("dt", { text: t("set.server") }),
        UI.el("dd", null, [UI.badge(summary.connected ? t("set.online") : t("set.offline"), summary.connected ? "ok" : "err")]),
        UI.el("dt", { text: t("set.profile") }),
        UI.el("dd", { text: summary.profile ? summary.profile.label : "—" }),
        UI.el("dt", { text: t("set.model") }),
        UI.el("dd", { class: "mono", text: summary.model || "—" }),
        UI.el("dt", { text: t("set.key") }),
        UI.el("dd", { text: summary.keyState }),
        UI.el("dt", { text: t("set.endpoint") }),
        UI.el("dd", { class: "mono", style: { fontSize: "11px" }, text: summary.endpoint || "—" }),
        UI.el("dt", { text: t("set.mcps") }),
        UI.el("dd", { text: Engine.mcp ? Engine.mcp.status : "—" })
      ]));
      box.appendChild(UI.el("div", { class: "row", style: { marginTop: "10px" } }, [
        UI.btn(t("set.integrations"), () => { App.navigate("integrations"); }, { small: true, ghost: true }),
        UI.btn(t("set.config"), () => { App.navigate("config"); }, { small: true, ghost: true })
      ]));

      return box;
    }
  };

  Settings.apply();
  window.Settings = Settings;
})();
