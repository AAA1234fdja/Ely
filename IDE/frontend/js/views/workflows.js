/* Workflows: cadenas multi-agente ejecutadas de verdad contra el proveedor. */
(function () {
  "use strict";

  window.Views = window.Views || {};

  window.Views.workflows = function (view, App) {
    const root = UI.el("div", { class: "stack" });
    let flows = [];
    let lastRun = null;

    root.appendChild(UI.head(
      "Workflows",
      "Define, edita y ejecuta flujos" +
      "Todas las llamadas son HTTP reales contra el perfil activo.",
      []
    ));

    const grid = UI.el("div", { class: "grid cols-2" });
    const output = UI.el("div", { class: "card", hidden: true });
    root.appendChild(grid);
    root.appendChild(output);

    function runFlow(flow) {
      const input = UI.el("textarea", {
        placeholder: "Describe el objetivo con el detalle suficiente…",
        rows: 4
      });
      const start = UI.btn("Ejecutar", async () => {
        const value = input.value.trim();
        if (!value) { UI.toast("warn", "Falta el objetivo"); return; }
        ref.close();
        await execute(flow, value);
      }, { primary: true, icon: "⚡" });
      const ref = UI.modal({
        title: flow.icon + " " + flow.name,
        subtitle: flow.agents.join(" → "),
        body: UI.el("div", { class: "stack" }, [
          UI.el("p", { class: "dim", style: { margin: 0, fontSize: "12.5px" }, text: flow.desc }),
          input,
          UI.el("p", { class: "muted", style: { margin: 0, fontSize: "11.5px" },
            text: "Perfil: " + (App.profile() ? App.profile().label : "—") + " · " + flow.chain.length + " llamadas secuenciales" })
        ]),
        footer: [UI.btn("Cancelar", () => ref.close(), { ghost: true }), start]
      });
      setTimeout(() => input.focus(), 50);
    }

    async function execute(flow, value) {
      output.hidden = false;
      UI.clear(output);
      output.appendChild(UI.el("h3", null, [
        UI.el("span", { text: flow.icon + " " + flow.name }),
        UI.el("span", { class: "hint", text: "en ejecución" })
      ]));
      const body = UI.el("div", { class: "stack" });
      output.appendChild(body);
      body.appendChild(UI.loading("Llamando a " + flow.agents[0] + "…"));

      const started = Date.now();
      try {
        const result = await API.runWorkflow(flow.id, value);
        lastRun = result;
        UI.clear(output);
        output.appendChild(UI.el("h3", null, [
          UI.el("span", { text: flow.icon + " " + flow.name }),
          UI.el("span", { class: "hint", text: (result.steps || []).length + " pasos · " + UI.ms(Date.now() - started) })
        ]));
        const stepsBox = UI.el("div", { class: "stack" });
        (result.steps || []).forEach((step) => {
          const card = UI.el("div", { class: "card", style: { background: "var(--bg-soft)" } });
          card.appendChild(UI.el("div", { class: "row between" }, [
            UI.el("div", { class: "row", style: { gap: "8px" } }, [
              UI.badge(String(step.index) + "/" + result.steps.length, "accent"),
              UI.el("b", { text: step.agent_name }),
              UI.el("span", { class: "muted mono", style: { fontSize: "11px" }, text: step.agent })
            ]),
            UI.el("span", { class: "muted mono", style: { fontSize: "11px" },
              text: (step.usage && step.usage.total_tokens ? step.usage.total_tokens + " tok · " : "") + (step.usage ? UI.ms(step.usage.latency_ms) : "") })
          ]));
          const bubble = UI.el("div", { class: "bubble", style: { marginTop: "10px" }, html: UI.md(step.text) });
          UI.bindCopy(bubble);
          card.appendChild(bubble);
          stepsBox.appendChild(card);
        });
        output.appendChild(stepsBox);
        output.appendChild(UI.el("div", { class: "row", style: { marginTop: "12px" } }, [
          UI.btn("Copiar resultado", () => UI.copy(result.output || ""), { small: true, ghost: true }),
          UI.btn("Repetir", () => runFlow(flow), { small: true })
        ]));
        UI.toast("ok", "Workflow completado", flow.name + " · " + (result.steps || []).length + " pasos");
      } catch (err) {
        UI.clear(output);
        output.appendChild(UI.errBox(err, () => execute(flow, value)));
        UI.toast("err", "Workflow interrumpido", err.message);
      }
    }

    API.workflows().then((data) => {
      flows = data.workflows || [];
      UI.clear(grid);
      flows.forEach((flow) => {
        const card = UI.el("div", { class: "card" });
        card.appendChild(UI.el("div", { class: "row between" }, [
          UI.el("div", { class: "row", style: { gap: "10px" } }, [
            UI.el("div", {
              style: { width: "32px", height: "32px", borderRadius: "9px", display: "grid", placeItems: "center",
                background: flow.color + "22", color: flow.color, border: "1px solid " + flow.color + "55" },
              text: flow.icon
            }),
            UI.el("div", null, [
              UI.el("div", { style: { fontWeight: 650 }, text: flow.name }),
              UI.el("div", { class: "muted", style: { fontSize: "11px" }, text: flow.chain.length + " pasos" })
            ])
          ]),
          UI.btn("Ejecutar", () => runFlow(flow), { small: true, primary: true })
        ]));
        card.appendChild(UI.el("p", { class: "dim", style: { margin: "10px 0", fontSize: "12.5px" }, text: flow.desc }));
        card.appendChild(UI.el("div", { class: "row", style: { gap: "5px" } },
          flow.agents.map((id, i) => UI.el("span", { class: "row", style: { gap: "5px", fontSize: "11px" } }, [
            UI.el("span", { class: "badge", text: id }),
            i < flow.agents.length - 1 ? UI.el("span", { class: "muted", text: "→" }) : null
          ]))
        ));
        grid.appendChild(card);
      });
      if (!flows.length) grid.appendChild(UI.empty("⚡", "No hay workflows definidos"));
    }).catch((err) => grid.appendChild(UI.errBox(err, () => App.render())));

    return root;
  };
})();
