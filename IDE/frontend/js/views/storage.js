/* Local Storage · archivos por perfil en dos categorías.
 *
 * Muestra la carpeta `Local Storage/<perfil>/` del perfil activo con sus dos
 * áreas:
 *   ⚡ Generado  → lo que ya se generó, para acceso rápido (conversaciones
 *                  guardadas + archivos producidos).
 *   🗒 Planeado  → lo que se planea tener (notas / borradores / planes).
 *
 * El selector de perfil cambia el perfil activo (App.setProfile), de modo que
 * cada perfil enseña únicamente sus propios archivos y conversaciones: lo del
 * perfil A no aparece en el perfil B.
 *
 * Se carga bajo demanda desde app.js (LAZY); el index.html original no se toca.
 */
(function () {
  "use strict";

  window.Views = window.Views || {};

  window.Views.storage = function (viewRoot, App) {
    const root = UI.el("div", { class: "stack", style: { flex: "1", minHeight: "0" } });

    /* ------------------------------------------------------ cabecera */
    const profileSelect = UI.el("select", {
      style: { minWidth: "180px", width: "auto" },
      title: "Perfil activo: cada perfil tiene su propia carpeta",
      onchange: (event) => App.setProfile(event.target.value)
    }, (App.profiles || []).map((p) => UI.el("option", {
      value: p.id, selected: p.id === App.profileId(),
      text: p.label + "  ·  " + p.id
    })));

    const refreshBtn = UI.btn("Actualizar", () => load(), { small: true, ghost: true, icon: "↻" });

    root.appendChild(UI.head(
      "Local Storage",
      "Archivos del perfil activo, en dos categorías: lo <b>generado</b> (acceso rápido) y lo <b>planeado</b>.",
      [profileSelect, refreshBtn]
    ));

    const pathLine = UI.el("div", { class: "mono muted", style: { fontSize: "11.5px", margin: "-4px 0 2px" } });
    root.appendChild(pathLine);

    /* ------------------------------------------------------ dos columnas */
    const cols = UI.el("div", { class: "storage-cols" });
    const genCard = UI.el("div", { class: "card storage-card" });
    const planCard = UI.el("div", { class: "card storage-card" });
    cols.appendChild(genCard);
    cols.appendChild(planCard);
    root.appendChild(cols);

    let data = null;

    /* ------------------------------------------------------ generado */
    function openSession(session) {
      /* Reutiliza el handoff del widget para llevar la conversación al chat. */
      window.__elyWidgetHandoff = {
        messages: session.messages || [],
        sessionId: session.id
      };
      App.navigate("chat");
    }

    function renderGenerated() {
      UI.clear(genCard);
      const gen = (data && data.generated) || { sessions: [], files: [] };
      genCard.appendChild(UI.el("h3", null, [
        UI.el("span", { text: "⚡ Generado" }),
        UI.el("span", { class: "hint", text: "acceso rápido · lo que ya se creó" })
      ]));

      /* Conversaciones guardadas */
      genCard.appendChild(UI.el("div", { class: "storage-sub", text: "Conversaciones" }));
      if (!gen.sessions.length) {
        genCard.appendChild(UI.el("p", { class: "muted storage-none", text: "Aún no hay conversaciones guardadas en este perfil. Se guardan solas al chatear." }));
      } else {
        const list = UI.el("div", { class: "storage-list" });
        gen.sessions.forEach((session) => {
          const count = (session.messages || []).length;
          const item = UI.el("div", {
            class: "storage-item click",
            title: "Abrir en el chat",
            onclick: () => openSession(session)
          }, [
            UI.el("div", { class: "storage-item-main" }, [
              UI.el("div", { class: "storage-item-title trunc", text: session.title || "Conversación" }),
              UI.el("div", { class: "storage-item-meta muted", text: UI.date(session.updated_at) + " · " + count + " mensajes" })
            ]),
            UI.el("button", {
              class: "icon-btn", title: "Eliminar conversación", html: "✕",
              onclick: async (event) => {
                event.stopPropagation();
                try {
                  await API.deleteSession(session.id, App.profileId());
                  UI.toast("ok", "Conversación eliminada");
                  load();
                } catch (e) { UI.toast("err", "No se pudo eliminar", e.message); }
              }
            })
          ]);
          list.appendChild(item);
        });
        genCard.appendChild(list);
      }

      /* Archivos producidos */
      genCard.appendChild(UI.el("div", { class: "storage-sub", text: "Archivos" }));
      appendFiles(genCard, gen.files, "Todavía no hay archivos generados. Puedes soltarlos en la carpeta generado/.");
    }

    /* ------------------------------------------------------ planeado */
    function renderPlanned() {
      UI.clear(planCard);
      const plan = (data && data.planned) || { items: [], files: [] };
      planCard.appendChild(UI.el("h3", null, [
        UI.el("span", { text: "🗒 Planeado" }),
        UI.el("span", { class: "hint", text: "lo que se planea tener" })
      ]));

      /* Formulario para añadir */
      const titleInput = UI.el("input", { type: "text", placeholder: "¿Qué planeas tener? (título)", maxlength: "120" });
      const noteInput = UI.el("textarea", { rows: 2, placeholder: "Detalle opcional…", style: { resize: "vertical" } });
      const addBtn = UI.btn("Añadir", async () => {
        const title = (titleInput.value || "").trim();
        if (!title) { UI.toast("err", "Falta el título", "Escribe qué planeas tener."); titleInput.focus(); return; }
        addBtn.disabled = true;
        try {
          await API.addPlanned({ profile: App.profileId(), title, note: noteInput.value || "" });
          titleInput.value = ""; noteInput.value = "";
          UI.toast("ok", "Añadido a Planeado");
          load();
        } catch (e) { UI.toast("err", "No se pudo añadir", e.message); }
        addBtn.disabled = false;
      }, { small: true, primary: true, icon: "＋" });
      titleInput.addEventListener("keydown", (event) => { if (event.key === "Enter") addBtn.click(); });

      planCard.appendChild(UI.el("div", { class: "storage-form" }, [titleInput, noteInput, addBtn]));

      /* Lista de elementos planeados */
      if (!plan.items.length) {
        planCard.appendChild(UI.el("p", { class: "muted storage-none", text: "Nada planeado todavía. Apunta aquí lo que quieres generar o conseguir." }));
      } else {
        const list = UI.el("div", { class: "storage-list" });
        plan.items.forEach((item) => {
          const node = UI.el("div", { class: "storage-item" }, [
            UI.el("div", { class: "storage-item-main" }, [
              UI.el("div", { class: "storage-item-title", text: item.title }),
              item.note ? UI.el("div", { class: "storage-item-note muted", text: item.note }) : null,
              UI.el("div", { class: "storage-item-meta muted", text: UI.date(item.created_at) })
            ]),
            UI.el("button", {
              class: "icon-btn", title: "Eliminar", html: "✕",
              onclick: async () => {
                try {
                  await API.deletePlanned(item.id, App.profileId());
                  UI.toast("ok", "Eliminado de Planeado");
                  load();
                } catch (e) { UI.toast("err", "No se pudo eliminar", e.message); }
              }
            })
          ]);
          list.appendChild(node);
        });
        planCard.appendChild(list);
      }

      /* Archivos en planeado/ */
      planCard.appendChild(UI.el("div", { class: "storage-sub", text: "Archivos" }));
      appendFiles(planCard, plan.files, "Sin archivos. Puedes soltar borradores en la carpeta planeado/.");
    }

    function appendFiles(card, files, emptyText) {
      if (!files || !files.length) {
        card.appendChild(UI.el("p", { class: "muted storage-none", text: emptyText }));
        return;
      }
      const list = UI.el("div", { class: "storage-list" });
      files.forEach((file) => {
        list.appendChild(UI.el("div", { class: "storage-item" }, [
          UI.el("div", { class: "storage-item-main" }, [
            UI.el("div", { class: "storage-item-title mono trunc", text: file.name }),
            UI.el("div", { class: "storage-item-meta muted", text: UI.bytes(file.size) + " · " + UI.date(file.modified) })
          ])
        ]));
      });
      card.appendChild(list);
    }

    /* ------------------------------------------------------ carga */
    async function load() {
      refreshBtn.disabled = true;
      try {
        data = await API.storage(App.profileId());
        pathLine.textContent = "📁 " + (data.path || "Local Storage") + "  ·  generado/ + planeado/";
        renderGenerated();
        renderPlanned();
      } catch (e) {
        UI.clear(cols);
        cols.appendChild(UI.errBox(e, () => load()));
      }
      refreshBtn.disabled = false;
    }

    load();
    return root;
  };
})();
