/* Agentes: definiciones reales del backend (system prompt + parámetros). */
(function () {
  "use strict";

  window.Views = window.Views || {};

  window.Views.agents = function (view, App) {
    const root = UI.el("div", { class: "stack" });
    root.appendChild(UI.head(
      "Agentes",
      "Ocho agentes con <i>system prompt</i> propio. Al chatear, el servidor envía ese prompt como mensaje <span class='mono'>system</span> real al proveedor.",
      [UI.btn("Chat", () => App.navigate("chat"), { primary: true, icon: "❯" })]
    ));

    const grid = UI.el("div", { class: "grid auto" });
    App.agents.forEach((agent) => {
      const card = UI.el("div", { class: "card", style: { borderLeft: "3px solid " + agent.color } });
      card.appendChild(UI.el("div", { class: "row between" }, [
        UI.el("div", { class: "row", style: { gap: "10px" } }, [
          UI.el("div", {
            style: {
              width: "34px", height: "34px", borderRadius: "10px", display: "grid", placeItems: "center",
              background: agent.color + "22", color: agent.color, border: "1px solid " + agent.color + "55",
              fontSize: "16px"
            },
            text: agent.icon
          }),
          UI.el("div", null, [
            UI.el("div", { style: { fontWeight: 650 }, text: agent.name }),
            UI.el("div", { class: "muted", style: { fontSize: "11px" }, text: agent.role })
          ])
        ]),
        agent.id === App.agentId() ? UI.badge("activo", "accent") : null
      ]));

      card.appendChild(UI.el("p", {
        class: "dim",
        style: { fontSize: "12px", margin: "12px 0", lineHeight: "1.55", maxHeight: "96px", overflow: "auto" },
        text: agent.system
      }));

      card.appendChild(UI.el("div", { class: "pill-row" }, [
        UI.badge("temp " + agent.temperature, "info"),
        UI.badge("max " + agent.max_tokens, "info"),
        agent.tool_count ? UI.badge(agent.tool_count + " tools", agent.tools_available ? "ok" : "warn") : null
      ]));

      card.appendChild(UI.el("div", { class: "row", style: { marginTop: "12px" } }, [
        UI.btn("Usar", () => { Store.set({ agent: agent.id }); App.navigate("chat"); }, {
          small: true, primary: agent.id !== App.agentId(), ghost: agent.id === App.agentId()
        }),
        UI.btn("Ver prompt", () => {
          UI.modal({
            title: agent.name + " · system prompt",
            subtitle: agent.id,
            wide: true,
            body: UI.el("pre", {
              class: "mono",
              style: { whiteSpace: "pre-wrap", lineHeight: 1.6, background: "#0a0c12", padding: "14px", borderRadius: "10px", border: "1px solid var(--border)", margin: 0 },
              text: agent.system
            }),
            footer: [UI.btn("Copiar", () => UI.copy(agent.system), { ghost: true })]
          });
        }, { small: true, ghost: true })
      ]));
      grid.appendChild(card);
    });

    root.appendChild(grid);

    if (App.mcp) {
      root.appendChild(UI.el("div", { class: "card" }, [
        UI.el("h3", null, [UI.el("span", { text: "Herramientas de los agentes" }),
          UI.badge(App.mcp.status, App.mcp.status === "configured" ? "ok" : "warn")]),
        UI.el("p", { class: "dim", style: { margin: 0, fontSize: "12.5px" }, text: App.mcp.hint }),
        UI.el("p", { class: "muted", style: { margin: "6px 0 0", fontSize: "11.5px" },
          text: "Carpeta MCPs/: " + (App.mcp.dir || "no encontrada") + ". Ely no arranca servidores MCP por su cuenta." })
      ]));
    }

    return root;
  };
})();
