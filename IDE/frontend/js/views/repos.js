/* Repositorios: descarga real de árboles Git y apertura en el IDE.
 *
 * No hay repos de ejemplo: la lista empieza vacía y solo muestra lo que se
 * haya descargado de verdad (con su tamaño, número de ficheros y origen).
 */
(function () {
  "use strict";

  window.Views = window.Views || {};

  window.Views.repos = function (viewRoot, App) {
    const root = UI.el("div", { class: "stack", style: { flex: "1", minHeight: 0 } });
    let repos = [];
    let presets = [];

    const input = UI.el("input", {
      type: "text",
      placeholder: "owner/repo o URL de GitHub…",
      style: { minWidth: "260px", maxWidth: "340px" }
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") add(input.value);
    });

    root.appendChild(UI.head(
      "Repositories",
      "Descarga el árbol de un repositorio Git real en .ely/repos y ábrelo en el IDE",
      [
        input,
        UI.btn("Importar", () => add(input.value), { primary: true, icon: "＋" })
      ]
    ));

    const progress = UI.el("div", { class: "card", hidden: true });
    const presetsBox = UI.el("div", { class: "card" });
    const list = UI.el("div", { class: "grid auto" });
    root.appendChild(progress);
    root.appendChild(presetsBox);
    root.appendChild(list);

    function bytes(n) { return UI.bytes(n); }

    function renderPresets() {
      UI.clear(presetsBox);
      presetsBox.appendChild(UI.el("h3", null, [
        UI.el("span", { text: "Sugerencias" }),
        UI.el("span", { class: "hint", text: "se descargan de verdad al pulsar" })
      ]));
      const row = UI.el("div", { class: "row", style: { gap: "6px" } });
      presets.forEach((preset) => {
        const imported = repos.some((r) => r.slug === preset.reference.replace("/", "__").toLowerCase());
        row.appendChild(UI.el("button", {
          class: "chip" + (imported ? " on" : ""),
          title: preset.note,
          text: preset.label + (imported ? " ✓" : ""),
          onclick: () => { if (!imported) add(preset.reference); }
        }));
      });
      presetsBox.appendChild(row);
      presetsBox.appendChild(UI.el("p", {
        class: "muted",
        style: { fontSize: "10.5px", margin: "8px 0 0", lineHeight: "1.5" },
        text: "Los repositorios se guardan en .ely/repos (ignorado por git). " +
          "VS Code ocupa unos 300 MB extraídos; el límite se ajusta con ELY_REPO_MAX_* en el entorno del servidor."
      }));
    }

    async function add(reference) {
      const value = (reference || "").trim();
      if (!value) {
        UI.toast("warn", "Indica un repositorio", "Ejemplo: microsoft/vscode");
        return;
      }
      progress.hidden = false;
      UI.clear(progress);
      progress.appendChild(UI.el("div", { class: "row", style: { gap: "9px" } }, [
        UI.spinner(),
        UI.el("b", { text: "Descargando " + value }),
        UI.el("span", { class: "muted", style: { fontSize: "11px" },
          text: "el servidor está bajando el tarball y extrayéndolo; puede tardar" })
      ]));
      try {
        const meta = await API.addRepo(value);
        UI.toast("ok", "Repositorio importado", meta.label + " · " + UI.num(meta.files) + " archivos · " + bytes(meta.bytes));
        input.value = "";
        await load();
      } catch (err) {
        progress.hidden = false;
        UI.clear(progress);
        progress.appendChild(UI.errBox(err, () => add(value)));
      } finally {
        progress.hidden = true;
      }
    }

    function openInIde(repo) {
      localStorage.setItem("ely.ideSource", "repo");
      localStorage.setItem("ely.ideRepo", repo.slug);
      App.navigate("ide");
    }

    function askSearch(repo) {
      const field = UI.el("input", { type: "text", placeholder: "texto a buscar en el código…" });
      const results = UI.el("div", { style: { marginTop: "10px", maxHeight: "46vh", overflow: "auto" } });
      const run = async () => {
        const query = field.value.trim();
        if (query.length < 2) {
          UI.toast("warn", "Escribe al menos 2 caracteres");
          return;
        }
        UI.clear(results);
        results.appendChild(UI.loading("Buscando en " + UI.num(repo.files) + " archivos…"));
        try {
          const data = await API.searchRepo(repo.slug, query);
          UI.clear(results);
          if (!data.hits.length) {
            results.appendChild(UI.empty("⌕", "Sin coincidencias en " + UI.num(data.scanned_files) + " archivos"));
            return;
          }
          results.appendChild(UI.el("div", {
            class: "muted", style: { fontSize: "10.5px", marginBottom: "6px" },
            text: data.hits.length + (data.truncated ? "+" : "") + " coincidencias"
          }));
          data.hits.forEach((hit) => {
            const item = UI.el("div", { class: "side-item", style: { cursor: "pointer" } }, [
              UI.el("span", { class: "mono", style: { fontSize: "10.5px", color: "var(--accent)" }, text: hit.path + ":" + hit.line }),
              UI.el("small", { class: "mono", style: { fontSize: "10px" }, text: hit.text })
            ]);
            item.addEventListener("click", () => {
              localStorage.setItem("ely.ideSource", "repo");
              localStorage.setItem("ely.ideRepo", repo.slug);
              localStorage.setItem("ely.ideOpenPath", hit.path);
              App.navigate("ide");
            });
            results.appendChild(item);
          });
        } catch (err) {
          UI.clear(results);
          results.appendChild(UI.errBox(err, run));
        }
      };
      field.addEventListener("keydown", (event) => { if (event.key === "Enter") run(); });
      UI.modal({
        title: "Buscar · " + repo.label,
        subtitle: repo.slug,
        wide: true,
        body: UI.el("div", { class: "stack" }, [
          UI.el("div", { class: "row" }, [field, UI.btn("Buscar", run, { primary: true })]),
          results
        ]),
        footer: [UI.btn("Cerrar", () => document.querySelector("#modal .x").click(), { ghost: true })]
      });
      setTimeout(() => field.focus(), 40);
    }

    async function remove(repo) {
      UI.confirm("Eliminar repositorio", "Se borrarán " + UI.num(repo.files) + " archivos (" + bytes(repo.bytes) + ") de .ely/repos.", async () => {
        try {
          await API.removeRepo(repo.slug);
          UI.toast("ok", "Repositorio eliminado", repo.slug);
          load();
        } catch (err) {
          UI.toast("err", "No se eliminó", err.message);
        }
      }, "Eliminar");
    }

    function renderList() {
      UI.clear(list);
      if (!repos.length) {
        list.appendChild(UI.el("div", { class: "card" }, [
          UI.empty("◫", "Todavía no hay repositorios. Importa uno con la barra de arriba."),
          UI.el("p", {
            class: "muted",
            style: { textAlign: "center", fontSize: "10.5px", margin: 0 },
            text: "Sugerencia: empieza por un repo pequeño para probar y luego microsoft/vscode."
          })
        ]));
        return;
      }
      repos.forEach((repo) => {
        const card = UI.el("div", { class: "card" });
        card.appendChild(UI.el("div", { class: "row between", style: { alignItems: "flex-start" } }, [
          UI.el("div", { style: { minWidth: 0 } }, [
            UI.el("div", { style: { fontWeight: 600, fontSize: "12px" }, text: repo.label }),
            UI.el("div", { class: "muted mono", style: { fontSize: "10px" }, text: repo.slug })
          ]),
          UI.badge(repo.ref || "HEAD", "accent")
        ]));

        card.appendChild(UI.el("dl", { class: "kv", style: { fontSize: "11px", marginTop: "9px" } }, [
          UI.el("dt", { text: "archivos" }), UI.el("dd", { text: UI.num(repo.files) }),
          UI.el("dt", { text: "tamaño" }), UI.el("dd", { text: bytes(repo.bytes) }),
          UI.el("dt", { text: "descargado" }), UI.el("dd", { text: bytes(repo.downloaded_bytes) }),
          UI.el("dt", { text: "importado" }), UI.el("dd", { text: UI.date(repo.added_at) || "—" })
        ]));

        card.appendChild(UI.el("div", { class: "row", style: { marginTop: "10px" } }, [
          UI.btn("Abrir en IDE", () => openInIde(repo), { small: true, primary: true }),
          UI.btn("Buscar", () => askSearch(repo), { small: true }),
          UI.btn("×", () => remove(repo), { small: true, ghost: true, danger: true })
        ]));
        list.appendChild(card);
      });
    }

    async function load() {
      UI.clear(list);
      list.appendChild(UI.loading("Leyendo repositorios importados…"));
      try {
        const data = await API.repos();
        repos = data.repos || [];
        presets = data.presets || [];
        renderPresets();
        renderList();
      } catch (err) {
        UI.clear(list);
        list.appendChild(UI.errBox(err, load));
      }
    }

    load();
    return root;
  };
})();
