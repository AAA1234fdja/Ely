/* Jobs: historial real de ejecuciones (workflows) y llamadas individuales. */
(function () {
  "use strict";

  window.Views = window.Views || {};

  window.Views.jobs = function (view, App) {
    const root = UI.el("div", { class: "stack" });
    let filter = "all";

    root.appendChild(UI.head(
      "Jobs",
      "Trazas de ejecución registradas en <span class='mono'>.ely/usage.jsonl</span>. Cada fila es una llamada HTTP real con su resultado.",
      [UI.btn("Actualizar", () => load(), { ghost: true, small: true, icon: "⟳" })]
    ));

    const chips = UI.el("div", { class: "chips" });
    ["all", "ok", "fail", "workflow", "chat", "probe"].forEach((key) => {
      const chip = UI.el("button", {
        class: "chip" + (filter === key ? " on" : ""),
        text: key,
        onclick: () => {
          filter = key;
          Array.from(chips.children).forEach((c) => c.classList.remove("on"));
          chip.classList.add("on");
          render();
        }
      });
      chips.appendChild(chip);
    });
    root.appendChild(chips);

    const summary = UI.el("div", { class: "grid cols-4" });
    const tableCard = UI.el("div", { class: "card pad-0" });
    root.appendChild(summary);
    root.appendChild(tableCard);

    let calls = [];

    function render() {
      UI.clear(tableCard);
      const rows = calls.filter((call) => {
        if (filter === "all") return true;
        if (filter === "ok") return call.ok;
        if (filter === "fail") return !call.ok;
        return String(call.kind || "").startsWith(filter);
      });
      if (!rows.length) {
        tableCard.appendChild(UI.empty("◷", "Sin ejecuciones para este filtro"));
        return;
      }
      const table = UI.el("table");
      table.appendChild(UI.el("thead", null, [
        UI.el("tr", null, ["Hora", "Tipo", "Perfil", "Modelo", "Tokens", "Latencia", "Estado", "Detalle"].map((h) => UI.el("th", { text: h })))
      ]));
      const body = UI.el("tbody");
      rows.forEach((call) => {
        const usage = call.usage || {};
        body.appendChild(UI.el("tr", null, [
          UI.el("td", { class: "nowrap muted", text: UI.date(call.at) }),
          UI.el("td", null, [UI.badge(call.kind, String(call.kind).startsWith("workflow") ? "accent" : "")]),
          UI.el("td", { class: "mono", text: call.profile }),
          UI.el("td", { class: "mono trunc", style: { maxWidth: "200px" }, text: call.model || "—" }),
          UI.el("td", { class: "mono", text: usage.total_tokens ? UI.num(usage.total_tokens) : "—" }),
          UI.el("td", { class: "mono", text: usage.latency_ms ? UI.ms(usage.latency_ms) : "—" }),
          UI.el("td", null, [UI.badge(call.ok ? "ok" : "HTTP " + (call.status || "—"), call.ok ? "ok" : "err")]),
          UI.el("td", { class: "muted trunc", style: { maxWidth: "240px" }, title: call.error || "", text: call.error || (call.id || "") })
        ]));
      });
      table.appendChild(body);
      const wrap = UI.el("div", { class: "table-wrap", style: { maxHeight: "560px" } });
      wrap.appendChild(table);
      tableCard.appendChild(wrap);
    }

    async function load() {
      try {
        const data = await API.calls(300);
        calls = data.calls || [];
        UI.clear(summary);
        const okCount = calls.filter((c) => c.ok).length;
        const tokens = calls.reduce((sum, c) => sum + ((c.usage || {}).total_tokens || 0), 0);
        const latencies = calls.map((c) => (c.usage || {}).latency_ms).filter(Boolean);
        summary.appendChild(UI.metric("Registros", UI.num(calls.length), "en .ely/usage.jsonl"));
        summary.appendChild(UI.metric("Correctos", okCount + " / " + calls.length,
          calls.length ? Math.round((okCount / calls.length) * 100) + "%" : "—"));
        summary.appendChild(UI.metric("Tokens", UI.num(tokens), "reportados por el proveedor"));
        summary.appendChild(UI.metric("Latencia media",
          latencies.length ? UI.ms(latencies.reduce((a, b) => a + b, 0) / latencies.length) : "—", "por llamada HTTP"));
        render();
      } catch (err) {
        UI.clear(tableCard);
        tableCard.appendChild(UI.errBox(err, load));
      }
    }

    load();
    return root;
  };
})();
