/* Activos: inventario real del repositorio por carpeta. */
(function () {
  "use strict";

  window.Views = window.Views || {};

  window.Views.assets = function (view, App) {
    const root = UI.el("div", { class: "stack" });
    root.appendChild(UI.head(
      "Asset Browser",
      "Archivos y activos del workflow",
      [UI.btn("IDE", () => App.navigate("ide"), { ghost: true, small: true })]
    ));

    const summary = UI.el("div", { class: "grid cols-4" });
    const groups = UI.el("div", { class: "grid cols-2" });
    root.appendChild(summary);
    root.appendChild(groups);
    summary.appendChild(UI.loading("Inventariando…"));

    API.assets().then((data) => {
      UI.clear(summary);
      const listed = data.groups || [];
      summary.appendChild(UI.metric("Archivos", UI.num(data.total_files), "en el workspace"));
      summary.appendChild(UI.metric("Tamaño", UI.bytes(data.total_bytes), "sin .git ni node_modules"));
      summary.appendChild(UI.metric("Carpetas", UI.num(listed.length), "de primer nivel"));
      const biggest = listed.slice().sort((a, b) => b.files - a.files)[0];
      summary.appendChild(UI.metric("Más archivos", biggest ? biggest.group : "—", biggest ? biggest.files + " archivos" : ""));

      UI.clear(groups);
      listed.forEach((group) => {
        const card = UI.el("div", { class: "card" });
        card.appendChild(UI.el("div", { class: "row between" }, [
          UI.el("b", { text: group.group }),
          UI.el("span", { class: "muted mono", style: { fontSize: "11px" }, text: UI.bytes(group.bytes) })
        ]));
        card.appendChild(UI.el("div", { class: "row", style: { margin: "8px 0" } }, [
          UI.el("span", { class: "muted", style: { fontSize: "11.5px" }, text: group.files + " archivos" })
        ]));
        const max = Math.max.apply(null, group.exts.map((e) => e[1])) || 1;
        group.exts.forEach(([ext, count]) => {
          card.appendChild(UI.el("div", { class: "row", style: { gap: "8px", marginTop: "6px" } }, [
            UI.el("span", { class: "mono", style: { fontSize: "11px", width: "70px", color: "var(--text-dim)" }, text: ext }),
            UI.el("div", { class: "bar", style: { flex: "1" } }, [
              UI.el("i", { style: { width: Math.max(6, (count / max) * 100) + "%" } })
            ]),
            UI.el("span", { class: "muted mono", style: { fontSize: "11px", width: "34px", textAlign: "right" }, text: String(count) })
          ]));
        });
        groups.appendChild(card);
      });
    }).catch((err) => {
      UI.clear(summary);
      summary.appendChild(UI.errBox(err, () => App.render()));
    });

    return root;
  };
})();
