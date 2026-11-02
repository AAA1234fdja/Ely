/* Configuración: entorno real del servidor, rutas y estado del sistema. */
(function () {
  "use strict";

  window.Views = window.Views || {};

  window.Views.config = function (view, App) {
    const root = UI.el("div", { class: "stack" });
    root.appendChild(UI.head(
      "Configuración",
      "Datos que reporta el proceso del servidor. Nada se inventa en el cliente: todo viene de <span class='mono'>GET /api/config</span>, <span class='mono'>/api/health</span> y <span class='mono'>/api/mcp</span>.",
      [UI.btn("Recargar", () => App.refresh(), { ghost: true, small: true, icon: "⟳" })]
    ));

    const grid = UI.el("div", { class: "grid cols-2" });
    root.appendChild(grid);

    const sys = UI.el("div", { class: "card" });
    const config = UI.el("div", { class: "card" });
    const backend = UI.el("div", { class: "card" });
    const cli = UI.el("div", { class: "card" });
    grid.appendChild(sys);
    grid.appendChild(config);
    grid.appendChild(backend);
    grid.appendChild(cli);

    API.config().then((data) => {
      UI.clear(sys);
      sys.appendChild(UI.el("h3", { text: "Proceso" }));
      sys.appendChild(UI.el("dl", { class: "kv" }, [
        UI.el("dt", { text: "versión" }), UI.el("dd", { class: "mono", text: data.version }),
        UI.el("dt", { text: "python" }), UI.el("dd", { class: "mono", text: data.python }),
        UI.el("dt", { text: "raíz" }), UI.el("dd", { class: "mono", text: data.root }),
        UI.el("dt", { text: "frontend" }), UI.el("dd", { class: "mono", text: data.frontend }),
        UI.el("dt", { text: "estado" }), UI.el("dd", { class: "mono", text: data.state_dir }),
        UI.el("dt", { text: "agentes" }), UI.el("dd", { text: String(data.agents) })
      ]));

      UI.clear(config);
      config.appendChild(UI.el("h3", null, [UI.el("span", { text: "Perfiles detectados" }), UI.badge(data.profiles.length + "", "accent")]));
      config.appendChild(UI.el("div", { class: "pill-row" }, data.profiles.map((id) =>
        UI.el("span", { class: "badge" + (id === App.profileId() ? " accent" : ""), text: id })
      )));
      config.appendChild(UI.el("div", { class: "divider" }));
      config.appendChild(UI.el("p", { class: "muted", style: { fontSize: "12px", margin: 0 },
        text: "Los perfiles se cargan de profiles/*.json y las claves de profiles/test-keys.env, .ely/keys.env o variables de entorno." }));
    }).catch((err) => {
      UI.clear(sys);
      sys.appendChild(UI.errBox(err, () => App.render()));
    });

    API.health().then((data) => {
      UI.clear(backend);
      backend.appendChild(UI.el("h3", { text: "Estado del backend" }));
      backend.appendChild(UI.el("dl", { class: "kv" }, [
        UI.el("dt", { text: "salud" }), UI.el("dd", null, [UI.badge(data.ok ? "ok" : "error", data.ok ? "ok" : "err")]),
        UI.el("dt", { text: "nombre" }), UI.el("dd", { text: data.name }),
        UI.el("dt", { text: "versión" }), UI.el("dd", { class: "mono", text: data.version }),
        UI.el("dt", { text: "origen" }), UI.el("dd", { class: "mono", text: location.origin }),
        UI.el("dt", { text: "MCPs" }), UI.el("dd", null, [
          UI.badge(App.mcp ? App.mcp.status : "—", App.mcp && App.mcp.status === "configured" ? "ok" : "warn")
        ]),
        UI.el("dt", { text: "Harness" }), UI.el("dd", null, [
          UI.badge("solo lectura", "info")
        ])
      ]));
      backend.appendChild(UI.el("p", {
        class: "muted",
        style: { fontSize: "11.5px", margin: "10px 0 0", lineHeight: "1.55" },
        text: "Harness/ y MCPs/ pertenecen a otros backends. Esta interfaz los consulta en modo lectura y nunca los modifica."
      }));
    }).catch(() => {});

    UI.clear(cli);
    cli.appendChild(UI.el("h3", { text: "CLI" }));
    cli.appendChild(UI.el("pre", {
      class: "mono",
      style: { margin: 0, background: "#0a0c12", padding: "12px", borderRadius: "10px", border: "1px solid var(--border)", fontSize: "11.5px", whiteSpace: "pre-wrap" },
      text: [
        "./CLI/ely serve --port 8765   # esta interfaz",
        "./CLI/ely test               # prueba real de las 11 claves",
        "./CLI/ely test -p groq -v    # un perfil con detalle",
        "./CLI/ely ask \"hola\" -a dev  # streaming en terminal",
        "./CLI/ely chat               # REPL interactivo",
        "./CLI/ely run feature \"...\"  # workflow multi-agente",
        "./CLI/ely stats --json       # telemetría",
        "./CLI/ely doctor             # diagnóstico"
      ].join("\n")
    }));

    return root;
  };
})();
