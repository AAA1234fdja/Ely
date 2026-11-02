/* Herramientas: catálogo del backend + estado REAL del backend MCPs/. */
(function () {
  "use strict";

  window.Views = window.Views || {};

  window.Views.tools = function (view, App) {
    const root = UI.el("div", { class: "stack" });
    root.appendChild(UI.head(
      "Herramientas",
      "Catálogo declarado por el servidor. El estado de MCPs se lee de la carpeta <span class='mono'>MCPs/</span>: si no hay manifiestos, Ely lo indica y no inventa servidores.",
      [UI.btn("Recargar", () => App.render(), { ghost: true, small: true })]
    ));

    const banner = UI.el("div", { class: "card" });
    const grid = UI.el("div", { class: "grid auto" });
    root.appendChild(banner);
    root.appendChild(grid);
    banner.appendChild(UI.loading("Consultando MCPs…"));

    API.tools().then((data) => {
      const mcp = data.mcp || {};
      UI.clear(banner);
      banner.appendChild(UI.el("div", { class: "row between" }, [
        UI.el("div", null, [
          UI.el("h3", { style: { margin: 0 }, text: "Backend MCPs" }),
          UI.el("p", { class: "dim", style: { margin: "4px 0 0", fontSize: "12.5px" }, text: mcp.hint || "" })
        ]),
        UI.badge(mcp.status || "desconocido", mcp.status === "configured" ? "ok" : "warn")
      ]));
      banner.appendChild(UI.el("dl", { class: "kv", style: { marginTop: "12px", fontSize: "12px" } }, [
        UI.el("dt", { text: "carpeta" }), UI.el("dd", { class: "mono", text: mcp.dir || "no existe" }),
        UI.el("dt", { text: "manifiestos" }), UI.el("dd", { class: "mono", text: (mcp.manifests || []).join(", ") || "—" }),
        UI.el("dt", { text: "servidores" }), UI.el("dd", { text: String((mcp.servers || []).length) })
      ]));
      if ((mcp.servers || []).length) {
        const list = UI.el("div", { class: "stack", style: { marginTop: "12px" } });
        mcp.servers.forEach((server) => {
          list.appendChild(UI.el("div", { class: "row between", style: { borderTop: "1px solid var(--border)", paddingTop: "8px" } }, [
            UI.el("div", null, [
              UI.el("b", { text: server.id }),
              UI.el("div", { class: "muted mono", style: { fontSize: "11px" }, text: server.transport + " · " + server.target })
            ]),
            UI.badge(server.enabled ? "activo" : "desactivado", server.enabled ? "ok" : "")
          ]));
        });
        banner.appendChild(list);
      }

      UI.clear(grid);
      (data.tools || []).forEach((tool) => {
        const card = UI.el("div", { class: "card" });
        card.appendChild(UI.el("div", { class: "row between" }, [
          UI.el("div", { class: "mono", style: { fontSize: "12px", fontWeight: 600 }, text: tool.id }),
          UI.badge(tool.danger ? "sensible" : "seguro", tool.danger ? "warn" : "ok")
        ]));
        card.appendChild(UI.el("div", { style: { fontWeight: 600, marginTop: "6px" }, text: tool.name }));
        card.appendChild(UI.el("p", { class: "dim", style: { fontSize: "11.5px", margin: "6px 0 0" }, text: tool.desc }));
        card.appendChild(UI.el("div", { class: "pill-row", style: { marginTop: "10px" } }, [
          UI.badge(tool.group, "info"),
          UI.badge(data.available ? "MCP conectado" : "sin MCP", data.available ? "ok" : "")
        ]));
      });
      if (!(data.tools || []).length) grid.appendChild(UI.empty("⚒", "El backend no declaró herramientas"));
    }).catch((err) => {
      UI.clear(banner);
      banner.appendChild(UI.errBox(err, () => App.render()));
    });

    return root;
  };
})();
