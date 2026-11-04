/* Ely Cowork · Vista Extensiones: instalar, activar, permisos y red externa.
 *
 * Todo lo que se muestra es real: la lista viene del backend, los permisos son
 * los del manifiesto y la instalación descarga de GitHub/npm/URL o lee una
 * carpeta del ordenador. Las extensiones VSIX de VS Code NO son compatibles y
 * se dice explícitamente en la interfaz.
 */
(function () {
  "use strict";
  window.Views = window.Views || {};

  window.Views.extensions = function (viewRoot, App) {
    const T = (k) => window.t(k);
    const root = UI.el("div", { class: "stack ext-view" });

    const card = (title, body) => UI.el("div", { class: "card stack" }, [
      UI.el("div", { class: "row between" }, [UI.el("h3", { text: title })]),
      body
    ]);

    /* ------------------------------------------------------- comunicación */
    const hosts = UI.el("div", { class: "ext-hosts" });
    root.appendChild(UI.head(T("ext.title"), T("ext.subtitle"), [
      UI.btn(T("ext.reloadAll"), () => ExtHost && ExtHost.refresh(), { icon: "↻" })
    ]));
    root.appendChild(card(T("ext.netTitle"), UI.el("div", { class: "stack" }, [
      UI.el("p", { class: "dim", text: T("ext.netDesc") }),
      hosts
    ])));

    /* ----------------------------------------------------------- instalar */
    const source = UI.el("input", {
      type: "text", placeholder: T("ext.installPlaceholder"),
      "aria-label": T("ext.installPlaceholder"), style: { flex: "1", minWidth: "240px" }
    });
    const installBtn = UI.btn(T("ext.install"), async () => {
      const value = source.value.trim();
      if (!value) { UI.toast("warn", T("ext.needSource")); return; }
      installBtn.disabled = true;
      installBtn.textContent = T("ext.installing");
      try {
        const result = await ExtHost.install(value);
        UI.toast("ok", T("ext.installed"), (result.extension || {}).name || value);
        source.value = "";
        render();
      } catch (err) {
        UI.toast("err", T("ext.installFail"), err.message);
      }
      installBtn.disabled = false;
      installBtn.textContent = T("ext.install");
    }, { primary: true, icon: "＋" });
    source.addEventListener("keydown", (event) => { if (event.key === "Enter") installBtn.click(); });

    const folderInput = UI.el("input", { type: "file", webkitdirectory: "", multiple: true, style: { display: "none" } });
    root.appendChild(folderInput);
    const folderBtn = UI.btn(T("ext.fromFolder"), () => folderInput.click(), { icon: "📁" });
    folderInput.addEventListener("change", async () => {
      const files = Array.from(folderInput.files || []);
      if (!files.length) return;
      folderBtn.disabled = true;
      folderBtn.textContent = T("ext.installing");
      try {
        const payload = [];
        for (const file of files.slice(0, 200)) {
          const relative = file.webkitRelativePath || file.name;
          const path = relative.split("/").slice(1).join("/") || file.name;
          payload.push({ path: path, text: await file.text() });
        }
        const result = await API.extCall("install", { folder: payload });
        UI.toast("ok", T("ext.installed"), (result.extension || {}).name || "");
        render();
      } catch (err) {
        UI.toast("err", T("ext.installFail"), err.message);
      }
      folderBtn.disabled = false;
      folderBtn.textContent = T("ext.fromFolder");
      folderInput.value = "";
    });

    root.appendChild(card(T("ext.installTitle"), UI.el("div", { class: "stack" }, [
      UI.el("p", { class: "dim", text: T("ext.installDesc") }),
      UI.el("div", { class: "row" }, [source, installBtn, folderBtn]),
      UI.el("div", { class: "ext-vsix dim", text: T("ext.vsixNote") })
    ])));

    /* -------------------------------------------------------------- lista */
    const list = UI.el("div", { class: "stack", id: "ext-list" });
    const listCard = card(T("ext.installedTitle"), list);
    root.appendChild(listCard);

    /* ---------------------------------------------------------- crear una */
    root.appendChild(card(T("ext.createTitle"), UI.el("div", { class: "stack" }, [
      UI.el("p", { class: "dim", text: T("ext.createDesc") }),
      UI.el("div", { class: "row" }, [
        UI.btn(T("ext.viewManifest"), () => UI.modal({
          title: T("ext.viewManifest"), wide: true,
          body: UI.el("pre", { class: "mono ext-doc", "data-noi18n": "1", text: MANIFEST_SAMPLE })
        })),
        UI.btn(T("ext.viewApi"), () => UI.modal({
          title: T("ext.viewApi"), wide: true,
          body: UI.el("pre", { class: "mono ext-doc", "data-noi18n": "1", text: API_SAMPLE })
        }))
      ])
    ])));

    const MANIFEST_SAMPLE = [
      "{",
      '  "id": "mi.extension",',
      '  "name": "Mi extensión",',
      '  "version": "1.0.0",',
      '  "publisher": "tu-nombre",',
      '  "main": "main.js",',
      '  "permissions": ["editor", "ui", "commands", "completions", "network:api.github.com"],',
      '  "activationEvents": ["onStartup"],',
      '  "contributes": { "commands": [{ "id": "mi.comando", "title": "Mi comando" }] }',
      "}"
    ].join("\n");

    const API_SAMPLE = [
      "async function activate(ely) {",
      '  await ely.commands.register("mi.comando", "Mi comando", async () => {',
      "    const file = await ely.editor.getActiveFile();",
      '    await ely.window.showMessage("Archivo: " + (file && file.name));',
      "  });",
      "",
      "  // Autocompletado aceptado con Tab",
      '  await ely.languages.registerCompletionItemProvider(["python"], {',
      "    provideCompletionItems(ctx) {",
      "      return [{ label: 'hola', insertText: \"print('hola')\", detail: 'saludo' }];",
      "    }",
      "  });",
      "",
      "  // Comunicación externa: exige network:api.github.com en el manifiesto",
      '  const res = await ely.fetch("https://api.github.com/repos/microsoft/vscode");',
      "  if (res.ok) {",
      "    const repo = JSON.parse(res.text);",
      '    await ely.window.setStatusBar("stars", "★ " + repo.stargazers_count);',
      "  }",
      "}"
    ].join("\n");

    /* ------------------------------------------------------------ pintado */
    function permChips(perms) {
      const wrap = UI.el("div", { class: "ext-perms" });
      (perms || []).forEach((perm) => {
        const isNet = String(perm).indexOf("network:") === 0;
        wrap.appendChild(UI.el("span", {
          class: "ext-perm" + (isNet ? " net" : ""), text: perm,
          title: isNet ? T("ext.netPermHint") : T("ext.permHint")
        }));
      });
      if (!perms || !perms.length) wrap.appendChild(UI.el("span", { class: "ext-perm none", text: T("ext.noPerms") }));
      return wrap;
    }

    async function showReadme(ext) {
      try {
        const result = await API.extCall("readme", { id: ext.id });
        UI.modal({
          title: ExtHost.localized(ext).name, subtitle: ext.version + " · " + (ext.publisher || ""),
          wide: true, body: UI.md(result.text || T("ext.noReadme"))
        });
      } catch (err) { UI.toast("err", T("ext.fail"), err.message); }
    }

    function render() {
      if (!document.body.contains(root) && !document.body.contains(viewRoot)) return;
      UI.clear(list);
      UI.clear(hosts);
      if (!window.ExtHost) { list.appendChild(UI.empty("⧉", T("ext.hostMissing"))); return; }
      ((ExtHost.state.meta || {}).installHosts || []).forEach((host) => {
        hosts.appendChild(UI.el("span", { class: "ext-host", text: host }));
      });
      if (ExtHost.state.error) { list.appendChild(UI.errBox(new Error(ExtHost.state.error), () => ExtHost.refresh())); return; }
      const rows = ExtHost.state.extensions || [];
      if (!rows.length) { list.appendChild(UI.empty("⧉", T("ext.none"), UI.btn(T("ext.install"), () => source.focus()))); return; }
      rows.forEach((ext) => {
        const L = ExtHost.localized(ext);
        const stateChip = ext.activationError
          ? UI.el("span", { class: "ext-state err", text: T("ext.stateError") })
          : ext.enabled
            ? UI.el("span", { class: "ext-state on", text: ext.active ? T("ext.stateActive") : T("ext.stateEnabled") })
            : UI.el("span", { class: "ext-state", text: T("ext.stateDisabled") });
        const actions = UI.el("div", { class: "row ext-actions" }, [
          UI.btn(ext.enabled ? T("ext.disable") : T("ext.enable"), async () => {
            try { await ExtHost.setEnabled(ext.id, !ext.enabled); } catch (err) { UI.toast("err", T("ext.fail"), err.message); }
            render();
          }, { small: true }),
          ext.enabled ? UI.btn(T("ext.reload"), () => { ExtHost.reload(ext.id); UI.toast("ok", T("ext.reloaded"), L.name); }, { ghost: true, small: true }) : null,
          ext.readme ? UI.btn("README", () => showReadme(ext), { ghost: true, small: true }) : null,
          ext.builtin ? null : UI.btn(T("ext.uninstall"), async () => {
            if (!await UI.confirm(T("ext.uninstall"), L.name + " · " + ext.id)) return;
            try { await ExtHost.uninstall(ext.id); UI.toast("ok", T("ext.uninstalled"), L.name); }
            catch (err) { UI.toast("err", T("ext.fail"), err.message); }
            render();
          }, { danger: true, ghost: true, small: true })
        ]);
        list.appendChild(UI.el("div", { class: "ext-card" + (ext.enabled ? " on" : "") }, [
          UI.el("div", { class: "row ext-head" }, [
            UI.el("span", { class: "ext-icon", "aria-hidden": "true", text: ext.builtin ? "◈" : "⧉" }),
            UI.el("div", { class: "grow" }, [
              UI.el("div", { class: "ext-name", text: L.name }),
              UI.el("div", { class: "dim ext-meta", text: [ext.id, ext.version, ext.publisher, ext.builtin ? T("ext.builtin") : ""].filter(Boolean).join(" · ") })
            ]),
            stateChip
          ]),
          UI.el("p", { class: "dim ext-desc", text: L.description }),
          permChips(ext.permissions),
          ext.activationError ? UI.el("div", { class: "ext-error", text: ext.activationError }) : null,
          ext.lastMessage ? UI.el("div", { class: "dim ext-log", text: ext.lastMessage }) : null,
          actions
        ]));
      });
    }

    if (window.ExtHost) {
      const off = ExtHost.subscribe(() => {
        if (!document.body.contains(root)) { off(); return; }
        render();
      });
      list.appendChild(UI.loading(T("ext.loading")));
      ExtHost.refresh().then(render);
    } else render();

    return root;
  };
})();
