/* Local Storage · archivos por perfil en dos categorías (generado / planeado).
 * Los archivos se abren con el visor multi-formato (PDF, HTML, LaTeX, etc.).
 * Se carga bajo demanda desde app.js (LAZY); el index.html no se toca.
 */
(function () {
  "use strict";

  window.Views = window.Views || {};

  window.Views.storage = function (viewRoot, App) {
    const root = UI.el("div", { class: "stack", style: { flex: "1", minHeight: "0" } });

    const profileSelect = UI.el("select", {
      style: { minWidth: "180px", width: "auto" },
      title: t("set.profile"),
      onchange: (event) => App.setProfile(event.target.value)
    }, (App.profiles || []).map((p) => UI.el("option", {
      value: p.id, selected: p.id === App.profileId(), text: p.label + "  ·  " + p.id
    })));

    const refreshBtn = UI.btn(t("ls.refresh"), () => load(), { small: true, ghost: true, icon: "↻" });
    const samplesBtn = UI.btn(t("ls.samples"), async () => {
      try {
        await API.post("/storage/samples", { profile: App.profileId() });
        UI.toast("ok", t("ls.samplesDone"));
        load();
      } catch (e) { UI.toast("err", t("ls.addFail"), e.message); }
    }, { small: true, ghost: true, icon: "✦" });

    root.appendChild(UI.head(t("ls.title"), t("ls.subtitle"), [profileSelect, samplesBtn, refreshBtn]));

    const pathLine = UI.el("div", { class: "mono muted", style: { fontSize: "11.5px", margin: "-4px 0 2px" } });
    root.appendChild(pathLine);

    const cols = UI.el("div", { class: "storage-cols" });
    const genCard = UI.el("div", { class: "card storage-card" });
    const planCard = UI.el("div", { class: "card storage-card" });
    cols.appendChild(genCard);
    cols.appendChild(planCard);
    root.appendChild(cols);

    let data = null;

    function openSession(session) {
      window.__elyWidgetHandoff = { messages: session.messages || [], sessionId: session.id };
      App.navigate("chat");
    }

    function appendFiles(card, files, kind, emptyText) {
      if (!files || !files.length) {
        card.appendChild(UI.el("p", { class: "muted storage-none", text: emptyText }));
        return;
      }
      const list = UI.el("div", { class: "storage-list" });
      files.forEach((file) => {
        const item = UI.el("div", {
          class: "storage-item click", title: file.name,
          onclick: () => FileViewer.openStorage(App.profileId(), kind, file.name)
        }, [
          UI.el("div", { class: "storage-item-main" }, [
            UI.el("div", { class: "storage-item-title mono trunc", text: file.name }),
            UI.el("div", { class: "storage-item-meta muted", text: UI.bytes(file.size) + " · " + UI.date(file.modified) })
          ]),
          UI.el("span", { class: "muted", text: "↗" })
        ]);
        list.appendChild(item);
      });
      card.appendChild(list);
    }

    function renderGenerated() {
      UI.clear(genCard);
      const gen = (data && data.generated) || { sessions: [], files: [] };
      genCard.appendChild(UI.el("h3", null, [
        UI.el("span", { text: "⚡ " + t("ls.generated") }),
        UI.el("span", { class: "hint", text: t("ls.quickAccess") })
      ]));

      genCard.appendChild(UI.el("div", { class: "storage-sub", text: t("ls.conversations") }));
      if (!gen.sessions.length) {
        genCard.appendChild(UI.el("p", { class: "muted storage-none", text: t("ls.noConvs") }));
      } else {
        const list = UI.el("div", { class: "storage-list" });
        gen.sessions.forEach((session) => {
          const count = (session.messages || []).length;
          const item = UI.el("div", { class: "storage-item click", title: t("ls.openChat"), onclick: () => openSession(session) }, [
            UI.el("div", { class: "storage-item-main" }, [
              UI.el("div", { class: "storage-item-title trunc", text: session.title || t("chat.untitled") }),
              UI.el("div", { class: "storage-item-meta muted", text: UI.date(session.updated_at) + " · " + count + " " + t("chat.msgs") })
            ]),
            UI.el("button", {
              class: "icon-btn", title: t("ls.deleteConv"), html: "✕",
              onclick: async (event) => {
                event.stopPropagation();
                try { await API.deleteSession(session.id, App.profileId()); UI.toast("ok", t("ls.convDeleted")); load(); }
                catch (e) { UI.toast("err", t("ls.deleteFail"), e.message); }
              }
            })
          ]);
          list.appendChild(item);
        });
        genCard.appendChild(list);
      }

      genCard.appendChild(UI.el("div", { class: "storage-sub", text: t("ls.files") }));
      appendFiles(genCard, gen.files, "generado", t("ls.noFilesGen"));
    }

    function renderPlanned() {
      UI.clear(planCard);
      const plan = (data && data.planned) || { items: [], files: [] };
      planCard.appendChild(UI.el("h3", null, [
        UI.el("span", { text: "🗒 " + t("ls.planned") }),
        UI.el("span", { class: "hint", text: t("ls.plannedHint") })
      ]));

      const titleInput = UI.el("input", { type: "text", placeholder: t("ls.titlePh"), maxlength: "120" });
      const noteInput = UI.el("textarea", { rows: 2, placeholder: t("ls.notePh"), style: { resize: "vertical" } });
      const addBtn = UI.btn(t("ls.add"), async () => {
        const title = (titleInput.value || "").trim();
        if (!title) { UI.toast("err", t("ls.missingTitle"), t("ls.missingTitleBody")); titleInput.focus(); return; }
        addBtn.disabled = true;
        try {
          await API.addPlanned({ profile: App.profileId(), title, note: noteInput.value || "" });
          titleInput.value = ""; noteInput.value = "";
          UI.toast("ok", t("ls.added"));
          load();
        } catch (e) { UI.toast("err", t("ls.addFail"), e.message); }
        addBtn.disabled = false;
      }, { small: true, primary: true, icon: "＋" });
      titleInput.addEventListener("keydown", (event) => { if (event.key === "Enter") addBtn.click(); });
      planCard.appendChild(UI.el("div", { class: "storage-form" }, [titleInput, noteInput, addBtn]));

      if (!plan.items.length) {
        planCard.appendChild(UI.el("p", { class: "muted storage-none", text: t("ls.noPlanned") }));
      } else {
        const list = UI.el("div", { class: "storage-list" });
        plan.items.forEach((item) => {
          list.appendChild(UI.el("div", { class: "storage-item" }, [
            UI.el("div", { class: "storage-item-main" }, [
              UI.el("div", { class: "storage-item-title", text: item.title }),
              item.note ? UI.el("div", { class: "storage-item-note muted", text: item.note }) : null,
              UI.el("div", { class: "storage-item-meta muted", text: UI.date(item.created_at) })
            ]),
            UI.el("button", {
              class: "icon-btn", title: t("common.delete"), html: "✕",
              onclick: async () => {
                try { await API.deletePlanned(item.id, App.profileId()); UI.toast("ok", t("ls.deleted")); load(); }
                catch (e) { UI.toast("err", t("ls.deleteFail"), e.message); }
              }
            })
          ]));
        });
        planCard.appendChild(list);
      }

      planCard.appendChild(UI.el("div", { class: "storage-sub", text: t("ls.files") }));
      appendFiles(planCard, plan.files, "planeado", t("ls.noFilesPlan"));
    }

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
