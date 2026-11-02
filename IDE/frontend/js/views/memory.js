/* Memoria: notas persistentes que el chat puede inyectar como contexto. */
(function () {
  "use strict";

  window.Views = window.Views || {};

  window.Views.memory = function (view, App) {
    const root = UI.el("div", { class: "stack" });
    const list = UI.el("div", { class: "stack" });

    root.appendChild(UI.head(
      "Memory",
      "Memoria y grafo de contexto",
      []
    ));

    const form = UI.el("div", { class: "card" });
    const text = UI.el("textarea", { rows: 2, placeholder: "ej. El backend expone /api/chat con streaming SSE; no usar fetch en el navegador para los proveedores." });
    const tag = UI.el("input", { type: "text", placeholder: "etiqueta", value: "general", style: { maxWidth: "180px" } });
    const add = UI.btn("Guardar nota", async () => {
      const value = text.value.trim();
      if (!value) { UI.toast("warn", "La nota está vacía"); return; }
      try {
        await API.addMemory(value, tag.value.trim() || "general");
        text.value = "";
        UI.toast("ok", "Nota guardada");
        load();
      } catch (err) {
        UI.toast("err", "No se guardó", err.message);
      }
    }, { primary: true, icon: "＋" });

    form.appendChild(UI.el("h3", { text: "Añadir nota" }));
    form.appendChild(text);
    form.appendChild(UI.el("div", { class: "row", style: { marginTop: "10px" } }, [
      tag, UI.el("div", { style: { flex: "1" } }), add
    ]));
    root.appendChild(form);
    root.appendChild(list);

    async function load() {
      UI.clear(list);
      list.appendChild(UI.loading("Leyendo memoria…"));
      try {
        const data = await API.memory();
        const items = data.memories || [];
        UI.clear(list);
        if (App) {
          App.memoryCount = items.length;
          App.renderNav();
        }
        if (!items.length) {
          list.appendChild(UI.el("div", { class: "card" }, [
            UI.empty("▤", "La memoria está vacía. Las notas se inyectan como contexto del proyecto.")
          ]));
          return;
        }
        const card = UI.el("div", { class: "card" });
        card.appendChild(UI.el("h3", null, [
          UI.el("span", { text: "Notas" }),
          UI.el("span", { class: "hint", text: items.length + " guardadas" })
        ]));
        items.forEach((item) => {
          card.appendChild(UI.el("div", { class: "row", style: { borderTop: "1px solid var(--border)", padding: "10px 0", alignItems: "flex-start", gap: "10px" } }, [
            UI.el("div", { class: "grow" }, [
              UI.el("div", { style: { fontSize: "12.5px" }, text: item.text }),
              UI.el("div", { class: "muted mono", style: { fontSize: "10.5px", marginTop: "3px" }, text: "#" + item.id + " · " + item.tag + " · " + UI.date(item.at) })
            ]),
            UI.btn("×", async () => {
              try {
                await API.deleteMemory(item.id);
                load();
              } catch (err) {
                UI.toast("err", "No se borró", err.message);
              }
            }, { small: true, ghost: true })
          ]));
        });
        list.appendChild(card);
      } catch (err) {
        UI.clear(list);
        list.appendChild(UI.errBox(err, load));
      }
    }

    load();
    return root;
  };
})();
