/* Costes: tokens reales (usage del proveedor) y tarifas declaradas por perfil. */
(function () {
  "use strict";

  window.Views = window.Views || {};

  window.Views.costs = function (view, App) {
    const root = UI.el("div", { class: "stack" });
    root.appendChild(UI.head(
      "Cost Tracker",
      "Gasto y eficiencia",
      [UI.btn("Integraciones", () => App.navigate("integrations"), { ghost: true, small: true })]
    ));

    const summary = UI.el("div", { class: "grid cols-4" });
    const tableCard = UI.el("div", { class: "card pad-0" });
    const note = UI.el("div", { class: "card" });
    root.appendChild(summary);
    root.appendChild(tableCard);
    root.appendChild(note);

    API.costs().then((data) => {
      UI.clear(summary);
      summary.appendChild(UI.metric("Coste total", UI.money(data.total_cost, data.currency),
        data.total_cost ? "según tarifas del perfil" : "sin tarifas declaradas"));
      summary.appendChild(UI.metric("Tokens", UI.num(data.total_tokens), "usage real"));
      summary.appendChild(UI.metric("Llamadas", UI.num(data.total_calls), "registradas"));
      const withRates = (data.rows || []).filter((r) => r.rate_configured).length;
      summary.appendChild(UI.metric("Con tarifas", withRates + " / " + (data.rows || []).length, "perfiles"));

      UI.clear(tableCard);
      const rows = data.rows || [];
      if (!rows.length) {
        tableCard.appendChild(UI.empty("◐", "Sin llamadas registradas todavía"));
      } else {
        const table = UI.el("table");
        table.appendChild(UI.el("thead", null, [UI.el("tr", null,
          ["Perfil", "Modelo", "Llamadas", "Tokens", "USD / Mtok in", "USD / Mtok out", "Coste", "Flujo"].map(
            (h) => UI.el("th", { class: h === "Perfil" || h === "Modelo" ? "" : "right", text: h })
          )
        )]));
        const body = UI.el("tbody");
        const maxTokens = Math.max.apply(null, rows.map((r) => r.tokens).concat([1]));
        rows.forEach((row) => {
          body.appendChild(UI.el("tr", null, [
            UI.el("td", null, [UI.badge(row.profile, row.rate_configured ? "accent" : "")]),
            UI.el("td", { class: "mono trunc", style: { maxWidth: "220px" }, text: row.model }),
            UI.el("td", { class: "right mono", text: UI.num(row.calls) }),
            UI.el("td", { class: "right mono", text: UI.num(row.tokens) }),
            UI.el("td", { class: "right mono", text: row.input_rate ? "$" + row.input_rate : "—" }),
            UI.el("td", { class: "right mono", text: row.output_rate ? "$" + row.output_rate : "—" }),
            UI.el("td", { class: "right mono", text: UI.money(row.cost) }),
            UI.el("td", { style: { width: "120px" } }, [
              UI.el("div", { class: "bar" }, [UI.el("i", { style: { width: Math.max(4, (row.tokens / maxTokens) * 100) + "%" } })])
            ])
          ]));
        });
        table.appendChild(body);
        const wrap = UI.el("div", { class: "table-wrap" });
        wrap.appendChild(table);
        tableCard.appendChild(wrap);
      }

      UI.clear(note);
      note.appendChild(UI.el("h3", { text: "Cómo declarar tarifas" }));
      note.appendChild(UI.el("p", { class: "dim", style: { fontSize: "12.5px", margin: "0 0 10px" }, text: data.note }));
      note.appendChild(UI.el("pre", {
        class: "mono",
        style: { margin: 0, background: "var(--bg)", padding: "12px", borderRadius: "10px", border: "1px solid var(--border)", fontSize: "11.5px" },
        text: '// profiles/openai.json\n{\n  "id": "openai",\n  "rates": { "input_per_mtok": 0.15, "output_per_mtok": 0.60 }\n}'
      }));
    }).catch((err) => {
      UI.clear(summary);
      summary.appendChild(UI.errBox(err, () => App.render()));
    });

    return root;
  };
})();
