/* Ely Cowork · ajustes y preferencias del cliente.
 *
 * Persisten en localStorage (Store) y se aplican al documento. Todo lo que
 * toca al servidor (claves, perfil por defecto) se delega en la API.
 */
(function () {
  "use strict";

  const Settings = {
    defaults: {
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
      const ref = UI.modal({
        title: "Ajustes",
        subtitle: "preferencias del cliente",
        body: this.panel(App),
        footer: [
          UI.btn("Restablecer", () => {
            this.reset();
            ref.close();
            UI.toast("ok", "Ajustes restablecidos");
          }, { ghost: true }),
          UI.btn("Listo", () => ref.close(), { primary: true })
        ]
      });
      return ref;
    },

    panel(App) {
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

      const density = UI.el("select", {
        style: { width: "150px" },
        onchange: (event) => this.set({ density: event.target.value })
      }, [
        UI.el("option", { value: "comfortable", selected: values.density === "comfortable", text: "cómoda" }),
        UI.el("option", { value: "compact", selected: values.density === "compact", text: "compacta" })
      ]);

      box.appendChild(row("Densidad de la interfaz", "espaciado de tarjetas y tablas", density));
      box.appendChild(row("Streaming en el chat", "usa /api/chat/stream (SSE)", toggle("stream")));
      box.appendChild(row("Enter envía", "Shift+Enter hace salto de línea", toggle("sendOnEnter")));
      box.appendChild(row("Mostrar consumo", "tokens y latencia bajo cada respuesta", toggle("showUsage")));
      box.appendChild(row("Confirmar al cerrar", "archivos con cambios sin guardar", toggle("confirmClose")));
      box.appendChild(row("Reducir animaciones", "menos movimiento en la interfaz", toggle("reducedMotion")));

      /* --- estado del backend, sin valores inventados --- */
      const summary = Engine.summary();
      box.appendChild(UI.el("div", { class: "divider" }));
      box.appendChild(UI.el("h3", { style: { marginTop: 0 }, text: "Conexión activa" }));
      box.appendChild(UI.el("dl", { class: "kv", style: { fontSize: "12px" } }, [
        UI.el("dt", { text: "servidor" }),
        UI.el("dd", null, [UI.badge(summary.connected ? "en línea" : "sin respuesta", summary.connected ? "ok" : "err")]),
        UI.el("dt", { text: "perfil" }),
        UI.el("dd", { text: summary.profile ? summary.profile.label : "—" }),
        UI.el("dt", { text: "modelo" }),
        UI.el("dd", { class: "mono", text: summary.model || "—" }),
        UI.el("dt", { text: "clave" }),
        UI.el("dd", { text: summary.keyState }),
        UI.el("dt", { text: "endpoint" }),
        UI.el("dd", { class: "mono", style: { fontSize: "11px" }, text: summary.endpoint || "—" }),
        UI.el("dt", { text: "MCPs" }),
        UI.el("dd", { text: Engine.mcp ? Engine.mcp.status : "—" })
      ]));
      box.appendChild(UI.el("div", { class: "row", style: { marginTop: "10px" } }, [
        UI.btn("Integraciones", () => { App.navigate("integrations"); }, { small: true, ghost: true }),
        UI.btn("Configuración", () => { App.navigate("config"); }, { small: true, ghost: true })
      ]));

      return box;
    }
  };

  Settings.apply();
  window.Settings = Settings;
})();
