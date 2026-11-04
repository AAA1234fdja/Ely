/* IDE · interfaz tipo VS Code (paridad con la barra de menús de las capturas):
 *  - Menús Archivo/Editar/Selección/Ver/Ir/Ejecutar con sus funciones.
 *  - «Abrir carpeta» abre el gestor de archivos del ordenador (webkitdirectory).
 *  - Carpetas plegadas por defecto, desplegables al clic.
 *  - Los archivos se abren a pantalla completa en el editor (no en modal).
 *  - Panel inferior (Problems/Output/Debug/Terminal/Puertos); Ctrl+J / Ctrl+Ñ
 *    abre la terminal, conectada a un backend real en el workspace.
 */
(function () {
  "use strict";
  window.Views = window.Views || {};

  const LANG = {
    py: "Python", js: "JavaScript", mjs: "JavaScript", ts: "TypeScript", json: "JSON",
    md: "Markdown", css: "CSS", html: "HTML", sh: "Shell", yml: "YAML", yaml: "YAML",
    toml: "TOML", rs: "Rust", go: "Go", sql: "SQL", txt: "Plain Text", env: "Env",
    csv: "CSV", svg: "SVG", xml: "XML", c: "C", cpp: "C++", java: "Java", rb: "Ruby", php: "PHP"
  };
  const PREVIEW = ["pdf", "png", "jpg", "jpeg", "gif", "webp", "bmp", "ico", "svg"];
  const enc = encodeURIComponent;

  /* Catálogo de lenguajes (como el selector de modo de lenguaje de VS Code). */
  /* Catálogo de lenguajes: js/languages.js (más de 140 modos, como VS Code). */
  const LANGS = (window.Languages && window.Languages.list) || [["plaintext", "Plain Text", "txt"]];
  const EXT2LANG = (window.Languages && window.Languages.byExt) || { txt: "plaintext" };

  /* El estado vive a nivel de módulo: cambiar de idioma o volver a la vista
     no cierra el proyecto ni las pestañas (como en VS Code). */
  let ideState = null;

  window.Views.ide = function (view, App) {
    const T = (k) => t(k);
    const state = ideState || (ideState = {
      source: "workspace", repo: localStorage.getItem("ely.ideRepo") || null,
      repos: [], repoTree: null,
      storageProfile: localStorage.getItem("ely.ideStorageProfile") || null,
      storageTree: null, tree: null,
      tabs: [], active: null, docs: {}, dirty: {},
      activity: "explorer", opened: false, projectRoot: null,
      openDirs: new Set(),
      rootOpen: true, selected: null,
      sections: { outline: false, timeline: false },
      sort: "name", hidden: false,
      langMode: {},
      panel: { open: false, tab: "terminal" },
      layout: { menubar: true, activity: true, sidebar: true, status: true },
      wordWrap: false, termCwd: "", history: [], histIdx: 0,
      untitledCount: 0, welcome: localStorage.getItem("ely.ideWelcome") !== "0",
      editorHint: localStorage.getItem("ely.ideEditorHint") !== "0"
    });
    const A = () => window.A11y || null;
    const say = (msg, opts) => { if (window.A11y) A11y.announce(msg, opts); };
    const sig = (name, detail) => { if (window.A11y) A11y.signal(name, detail); };
    const isUntitled = (path) => String(path || "").startsWith("untitled:");
    const docName = (path) => isUntitled(path) ? path.slice(9) : String(path || "").split("/").pop();
    const soon = () => UI.toast("warn", T("ide.soon"), T("ide.soonBody"));

    /* ---- modo de lenguaje (como VS Code) ---- */
    function langFor(path) {
      if (state.langMode[path]) return state.langMode[path];
      if (window.Languages) return window.Languages.forPath(path);
      const base = (path || "").split("/").pop().toLowerCase();
      const ext = base.includes(".") ? base.split(".").pop() : "";
      return EXT2LANG[ext] || "plaintext";
    }
    function langLabel(id) { const l = LANGS.find((x) => x[0] === id); return l ? l[1] : id; }
    function langExt(id) { const l = LANGS.find((x) => x[0] === id); return l ? l[2] : "txt"; }
    function iconPath(path) { return state.langMode[path] ? "file." + langExt(state.langMode[path]) : path; }

    /* ------------------------------------------------------------------ *
     * Quick pick estilo VS Code: caja arriba al centro, filtro y lista    *
     * navegable con teclado (↑ ↓ Enter Esc).                             *
     * ------------------------------------------------------------------ */
    function quickPick(opts) {
      const o = opts || {};
      const host = UI.el("div", { class: "vsc-qp-host", role: "dialog", "aria-modal": "true", "aria-label": o.title || o.placeholder || "" });
      const input = UI.el("input", {
        class: "vsc-qp-input", type: "text", placeholder: o.placeholder || "",
        role: "combobox", "aria-expanded": "true", "aria-autocomplete": "list",
        "aria-controls": "vsc-qp-list"
      });
      const list = UI.el("div", { class: "vsc-qp-list", id: "vsc-qp-list", role: "listbox" });
      host.appendChild(input); host.appendChild(list);
      const backdrop = UI.el("div", { class: "vsc-qp-backdrop" });
      document.body.appendChild(backdrop); document.body.appendChild(host);
      let items = [], index = 0, closed = false;

      const close = () => {
        if (closed) return;
        closed = true;
        host.remove(); backdrop.remove();
        document.removeEventListener("keydown", onKey, true);
        if (o.onClose) o.onClose();
      };
      const pick = (item) => {
        if (!item || item.disabled) return;
        close();
        if (item.soon) { soon(); return; }
        if (o.onPick) o.onPick(item);
      };
      const paint = () => {
        UI.clear(list);
        items.forEach((item, i) => {
          if (item.separator) {
            list.appendChild(UI.el("div", { class: "vsc-qp-sep", role: "separator", text: item.label }));
            return;
          }
          const row = UI.el("div", {
            class: "vsc-qp-item" + (i === index ? " on" : "") + (item.disabled ? " off" : ""),
            role: "option", id: "vsc-qp-opt-" + i, "aria-selected": i === index ? "true" : "false",
            "aria-disabled": item.disabled ? "true" : null
          }, [
            item.icon ? UI.el("span", { class: "vsc-qp-icon", "aria-hidden": "true" }, [item.icon]) : null,
            UI.el("span", { class: "vsc-qp-label", text: item.label }),
            item.description ? UI.el("span", { class: "vsc-qp-desc", text: item.description }) : null,
            UI.el("span", { style: { flex: "1" } }),
            item.detail ? UI.el("span", { class: "vsc-qp-detail", text: item.detail }) : null,
            item.keybinding ? UI.el("kbd", { class: "vsc-qp-kbd", text: item.keybinding }) : null
          ]);
          row.addEventListener("click", () => pick(item));
          row.addEventListener("mousemove", () => { if (index !== i) { index = i; highlight(); } });
          list.appendChild(row);
        });
        if (!items.length) list.appendChild(UI.el("div", { class: "vsc-qp-empty", text: T("ide.noResults") }));
        highlight();
      };
      const highlight = () => {
        Array.from(list.querySelectorAll(".vsc-qp-item")).forEach((node, i) => {
          node.classList.toggle("on", i === index);
          node.setAttribute("aria-selected", i === index ? "true" : "false");
          if (i === index) {
            input.setAttribute("aria-activedescendant", node.id);
            if (node.scrollIntoView) node.scrollIntoView({ block: "nearest" });
          }
        });
      };
      const selectable = () => items.filter((it) => !it.separator && !it.disabled);
      const filter = (q) => {
        const query = q.trim().toLowerCase();
        items = (o.items || []).filter((it) => it.separator || !query ||
          (it.label + " " + (it.description || "") + " " + (it.id || "")).toLowerCase().includes(query));
        index = 0;
        while (items[index] && items[index].separator) index += 1;
        paint();
      };
      function onKey(event) {
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); return; }
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          const rows = items.map((it, i) => [it, i]).filter(([it]) => !it.separator && !it.disabled);
          if (!rows.length) return;
          const at = rows.findIndex(([, i]) => i === index);
          const next = event.key === "ArrowDown" ? (at + 1) % rows.length : (at - 1 + rows.length) % rows.length;
          index = rows[next][1];
          highlight();
          return;
        }
        if (event.key === "Enter") {
          event.preventDefault();
          const item = items[index];
          if (o.onEnter && o.onEnter(input.value, item) === true) return;
          pick(item);
        }
      }
      input.addEventListener("input", () => { filter(input.value); if (o.onInput) o.onInput(input.value); });
      backdrop.addEventListener("click", close);
      document.addEventListener("keydown", onKey, true);
      filter("");
      setTimeout(() => input.focus(), 30);
      say(o.placeholder || o.title || "");
      return { close, input, list, get items() { return selectable(); } };
    }

    /* Selector de modo de lenguaje del archivo activo (clic en la barra de estado). */
    function selectLanguage() {
      if (!state.active) { UI.toast("warn", T("ide.openFirst")); return; }
      const current = langFor(state.active);
      quickPick({
        title: T("ide.selectLanguage"),
        placeholder: T("ide.selectLanguageMode"),
        items: LANGS.map((l) => ({
          id: l[0], label: l[1], description: "(" + l[0] + ")",
          detail: current === l[0] ? T("ide.currentLanguage") : "",
          icon: window.Icons ? Icons.file("file." + l[2], 15) : null
        })),
        onPick: (item) => {
          state.langMode[state.active] = item.id;
          renderEditor(); updateStatus(); renderTabs();
          say(T("ide.language") + ": " + item.label);
        }
      });
    }

    /* ---------------------------------------------------------- layout */
    const root = UI.el("div", { class: "vsc" });
    const menubar = UI.el("div", { class: "vsc-menubar" });
    const body = UI.el("div", { class: "vsc-body" });
    const activity = UI.el("div", { class: "vsc-activity" });
    const sidebar = UI.el("div", { class: "vsc-sidebar" });
    const editorArea = UI.el("div", { class: "vsc-editor-area" });
    const statusbar = UI.el("div", { class: "vsc-statusbar" });
    body.appendChild(activity); body.appendChild(sidebar); body.appendChild(editorArea);
    root.appendChild(menubar); root.appendChild(body); root.appendChild(statusbar);

    /* ---------------------------------------------------------- menubar */
    function closeAllMenus() { document.querySelectorAll(".vsc-dropdown.open").forEach((d) => d.classList.remove("open")); }
    function buildMenu(items) {
      const drop = UI.el("div", { class: "vsc-dropdown" });
      items.forEach((it) => {
        if (it === "-") { drop.appendChild(UI.el("div", { class: "vsc-sep" })); return; }
        if (it.sub) {
          const row = UI.el("div", { class: "vsc-dropdown-item vsc-sub" }, [
            UI.el("span", { text: it.label }), UI.el("span", { class: "vsc-key", text: "›" })
          ]);
          const sub = buildMenu(it.sub); sub.classList.add("vsc-submenu");
          row.appendChild(sub); drop.appendChild(row); return;
        }
        const row = UI.el("button", { class: "vsc-dropdown-item" + (it.disabled ? " disabled" : "") }, [
          UI.el("span", { text: it.label }), it.key ? UI.el("span", { class: "vsc-key", text: it.key }) : null
        ]);
        row.addEventListener("click", () => { closeAllMenus(); if (it.disabled) { soon(); return; } it.action && it.action(); });
        drop.appendChild(row);
      });
      return drop;
    }
    function menu(label, items) {
      const btn = UI.el("button", { class: "vsc-menu-btn", text: label });
      const drop = buildMenu(items);
      const wrap = UI.el("div", { class: "vsc-menu" }, [btn, drop]);
      btn.addEventListener("click", (e) => { e.stopPropagation(); const was = drop.classList.contains("open"); closeAllMenus(); if (!was) drop.classList.add("open"); });
      btn.addEventListener("mouseenter", () => { if (document.querySelector(".vsc-dropdown.open")) { closeAllMenus(); drop.classList.add("open"); } });
      return wrap;
    }
    document.addEventListener("pointerdown", (e) => {
      const target = e.target && e.target.closest ? e.target : null;
      if (!target || !target.closest(".vsc-menu")) closeAllMenus();
    });

    function recentProjects() { try { return JSON.parse(localStorage.getItem("ely.ideRecent") || "[]"); } catch (e) { return []; } }
    function pushRecent(name) {
      const list = [name, ...recentProjects().filter((x) => x !== name)].slice(0, 8);
      localStorage.setItem("ely.ideRecent", JSON.stringify(list));
    }

    function buildMenus() {
      UI.clear(menubar);
      menubar.appendChild(UI.el("span", { class: "vsc-logo", text: "◈" }));
      menubar.appendChild(menu(T("ide.file"), [
        { label: T("ide.newTextFile"), key: "Ctrl+N", action: () => newUntitled("plaintext") },
        { label: T("ide.newFile"), action: newFileQuickPick },
        { label: T("ide.newWindow"), action: () => window.open(location.href, "_blank") },
        "-",
        { label: T("ide.openFile"), key: "Ctrl+O", action: openFromComputer },
        { label: T("ide.openFolder"), key: "Ctrl+K Ctrl+O", action: openFolderFromComputer },
        { label: T("ide.openStorage"), action: openStorageModal },
        { label: T("ide.openRecent"), sub: recentProjects().length ? recentProjects().map((p) => ({ label: p, action: () => openProjectRoot(p) })) : [{ label: T("ide.noRecent"), disabled: true }] },
        "-",
        { label: T("ide.newProject"), action: createProjectModal },
        "-",
        { label: T("ide.save"), key: "Ctrl+S", action: save },
        { label: T("ide.saveAs"), key: "Ctrl+Shift+S", action: saveAs },
        { label: T("ide.saveAll"), action: saveAll },
        "-",
        { label: T("ide.localHistory"), action: showHistory },
        "-",
        { label: T("ide.closeEditor"), key: "Ctrl+F4", action: closeActiveTab },
        { label: T("ide.closeFolder"), action: closeProject }
      ]));
      menubar.appendChild(menu(T("ide.edit"), [
        { label: T("ide.undo"), key: "Ctrl+Z", action: () => editorCmd("undo") },
        { label: T("ide.redo"), key: "Ctrl+Y", action: () => editorCmd("redo") },
        "-",
        { label: T("ide.cut"), key: "Ctrl+X", action: () => editorCmd("cut") },
        { label: T("ide.copy"), key: "Ctrl+C", action: () => editorCmd("copy") },
        { label: T("ide.paste"), key: "Ctrl+V", action: pasteClip },
        "-",
        { label: T("ide.find"), key: "Ctrl+F", action: findInFile },
        { label: T("ide.replace"), key: "Ctrl+H", action: replaceInFile },
        { label: T("ide.findInFiles"), key: "Ctrl+Shift+F", action: () => setActivity("search") },
        "-",
        { label: T("ide.toggleComment"), key: "Ctrl+}", action: toggleComment },
        { label: T("ide.transform"), sub: [
          { label: T("ide.tUpper"), action: () => transform("upper") },
          { label: T("ide.tLower"), action: () => transform("lower") },
          { label: T("ide.tSort"), action: () => transform("sortLines") },
          { label: T("ide.tJoin"), action: () => transform("joinLines") },
          { label: T("ide.tTrim"), action: () => transform("trimTrailing") },
          { label: T("ide.tFinalNl"), action: () => transform("finalNewline") },
          { label: T("ide.tDedupe"), action: () => transform("dedupeLines") },
          { label: T("ide.tRemoveBlank"), action: () => transform("removeBlank") },
          { label: T("ide.tTabsSpaces"), action: () => transform("tabsToSpaces") },
          { label: T("ide.tSpacesTabs"), action: () => transform("spacesToTabs") },
          { label: T("ide.tDeleteLine"), action: () => transform("deleteLine") },
          { label: T("ide.tLineBefore"), action: () => transform("lineBefore") },
          { label: T("ide.tLineAfter"), action: () => transform("lineAfter") },
          { label: T("ide.tDelStart"), action: () => transform("delToStart") },
          { label: T("ide.tDelEnd"), action: () => transform("delToEnd") },
          { label: T("ide.tIndent"), action: () => transform("indent") },
          { label: T("ide.tOutdent"), action: () => transform("outdent") },
          { label: T("ide.tSelectWord"), action: () => transform("selectWord") },
          { label: T("ide.tSelectLine"), action: () => transform("selectLine") },
          { label: T("ide.tTranspose"), action: () => transform("transposeChars") }
        ] }
      ]));
      menubar.appendChild(menu(T("ide.selection"), [
        { label: T("ide.selectAll"), key: "Ctrl+A", action: () => codeTA && codeTA.select() },
        { label: T("ide.copyLineUp"), key: "Shift+Alt+↑", action: () => lineOp("copyUp") },
        { label: T("ide.copyLineDown"), key: "Shift+Alt+↓", action: () => lineOp("copyDown") },
        { label: T("ide.moveLineUp"), key: "Alt+↑", action: () => lineOp("moveUp") },
        { label: T("ide.moveLineDown"), key: "Alt+↓", action: () => lineOp("moveDown") },
        { label: T("ide.duplicateSel"), action: () => lineOp("dup") },
        "-",
        { label: T("ide.multiCursor"), disabled: true }
      ]));
      menubar.appendChild(menu(T("ide.view"), [
        { label: T("ide.commandPalette"), key: "Ctrl+Shift+P", action: commandPalette },
        "-",
        { label: T("ide.appearance"), sub: [
          { label: T("ide.menuBar"), action: () => toggleLayout("menubar") },
          { label: T("ide.activityBar"), action: () => toggleLayout("activity") },
          { label: T("ide.sideBar"), key: "Ctrl+B", action: () => toggleLayout("sidebar") },
          { label: T("ide.panel"), key: "Ctrl+J", action: () => togglePanel() },
          { label: T("ide.statusBar"), action: () => toggleLayout("status") }
        ] },
        "-",
        { label: T("ide.explorer"), key: "Ctrl+Shift+E", action: () => setActivity("explorer") },
        { label: T("ide.search"), key: "Ctrl+Shift+F", action: () => setActivity("search") },
        { label: T("ide.scm"), key: "Ctrl+Shift+G", action: () => setActivity("scm") },
        { label: T("ide.runDebug"), key: "Ctrl+Shift+D", action: () => setActivity("run") },
        { label: T("ide.extensions"), key: "Ctrl+Shift+X", action: () => setActivity("extensions") },
        "-",
        { label: T("ide.problems"), key: "Ctrl+Shift+M", action: () => openPanel("problems") },
        { label: T("ide.output"), key: "Ctrl+Shift+U", action: () => openPanel("output") },
        { label: T("ide.debugConsole"), action: () => openPanel("debug") },
        { label: T("ide.terminal"), key: "Ctrl+Ñ", action: () => openPanel("terminal") },
        "-",
        { label: T("ide.wordWrap"), key: "Alt+Z", action: toggleWrap },
        "-",
        { label: T("cmp.menu"), key: "Ctrl+Espacio", action: () => {
          if (!window.Completion) return;
          Completion.setEnabled(!Completion.enabled());
          updateStatus();
          UI.toast("ok", Completion.enabled() ? T("cmp.on") : T("cmp.off"));
        } },
        { label: T("ext.openManager"), action: () => App.navigate("extensions") }
      ]));
      menubar.appendChild(menu(T("ide.go"), [
        { label: T("ide.back"), key: "Alt+←", action: () => tabHistory(-1) },
        { label: T("ide.forward"), key: "Alt+→", action: () => tabHistory(1) },
        "-",
        { label: T("ide.goToFile"), key: "Ctrl+P", action: quickOpen },
        { label: T("ide.goToLine"), key: "Ctrl+G", action: goToLine },
        "-",
        { label: T("ide.goToDef"), key: "F12", disabled: true },
        { label: T("ide.goToRef"), key: "Shift+F12", disabled: true }
      ]));
      menubar.appendChild(menu(T("ide.run"), [
        { label: T("ide.startDebug"), key: "F5", action: runActive },
        { label: T("ide.runNoDebug"), key: "Ctrl+F5", action: runActive },
        { label: T("ide.stopDebug"), key: "Shift+F5", disabled: true },
        "-",
        { label: T("ide.toggleBreakpoint"), key: "F9", disabled: true },
        { label: T("ide.addConfig"), disabled: true }
      ]));
      menubar.appendChild(menu(T("ide.help"), [
        { label: T("ide.welcomeTab"), action: showWelcome },
        { label: T("ide.showAllCommands"), key: "Ctrl+Shift+P", action: commandPalette },
        "-",
        { label: T("ide.keyboardRef"), action: () => { if (window.A11y) A11y.openView("shortcuts"); } },
        { label: T("a11y.helpTitle"), key: "Alt+F1", action: () => { if (window.A11y) A11y.help(); } },
        "-",
        { label: T("ide.reportIssue"), disabled: true },
        { label: T("ide.about"), action: showAbout }
      ]));
      menubar.appendChild(UI.el("div", { style: { flex: "1" } }));
      menubar.appendChild(UI.el("button", { class: "vsc-menu-btn", html: "⌕", title: T("ide.search"), onclick: () => setActivity("search") }));
      menubar.appendChild(UI.el("button", { class: "vsc-menu-btn", html: "◧", title: T("ide.sideBar"), onclick: () => toggleLayout("sidebar") }));
      menubar.appendChild(UI.el("button", { class: "vsc-menu-btn", html: "▤", title: T("ide.panel"), onclick: () => togglePanel() }));
    }

    /* ---------------------------------------------------------- activity */
    const ACT = [
      ["explorer", "🗀", T("ide.explorer")], ["search", "⌕", T("ide.search")],
      ["scm", "⑂", T("ide.scm")], ["run", "▶", T("ide.runDebug")], ["extensions", "⧉", T("ide.extensions")]
    ];
    ACT.forEach(([id, icon, label]) => {
      const b = UI.el("button", {
        class: "vsc-act-btn" + (state.activity === id ? " on" : ""), title: label, html: icon,
        "aria-label": label, "aria-pressed": state.activity === id ? "true" : "false"
      });
      b.addEventListener("click", () => setActivity(id));
      activity.appendChild(b);
    });
    activity.appendChild(UI.el("div", { style: { flex: "1" } }));
    activity.appendChild(UI.el("button", { class: "vsc-act-btn", title: T("nav.settings"), "aria-label": T("nav.settings"), html: "⚙",
      onclick: () => Settings.openModal(App) }));
    function setActivity(id) {
      state.activity = id;
      activity.querySelectorAll(".vsc-act-btn").forEach((b, i) => {
        const on = ACT[i] && ACT[i][0] === id;
        b.classList.toggle("on", !!on);
        if (ACT[i]) b.setAttribute("aria-pressed", on ? "true" : "false");
      });
      renderSidebar();
      const found = ACT.find((a) => a[0] === id);
      if (found) say(found[2]);
    }

    /* ---------------------------------------------------------- sidebar */
    function renderSidebar() {
      UI.clear(sidebar);
      if (state.activity === "explorer") return renderExplorer();
      if (state.activity === "search") return renderSearch();
      if (state.activity === "scm") return renderSCM();
      if (state.activity === "run") return renderRun();
      sidebar.appendChild(UI.el("div", { class: "vsc-side-title", text: T("ide.extensions").toUpperCase() }));
      renderExtensionsPanel();
    }

    /* Panel real de extensiones: instalar, activar y ver permisos. */
    function renderExtensionsPanel() {
      const box = UI.el("div", { class: "vsc-ext" });
      const input = UI.el("input", {
        class: "vsc-search-input", placeholder: T("ext.installPlaceholder"),
        "aria-label": T("ext.installPlaceholder")
      });
      const installBtn = UI.el("button", { class: "vsc-side-btn", text: T("ext.install") });
      const doInstall = async () => {
        const source = input.value.trim();
        if (!source) return;
        installBtn.disabled = true;
        installBtn.textContent = T("ext.installing");
        try {
          const result = await ExtHost.install(source);
          UI.toast("ok", T("ext.installed"), (result.extension || {}).name || source);
          input.value = "";
        } catch (err) {
          UI.toast("err", T("ext.installFail"), err.message);
        }
        installBtn.disabled = false;
        installBtn.textContent = T("ext.install");
        renderSidebar();
      };
      installBtn.addEventListener("click", doInstall);
      input.addEventListener("keydown", (e) => { if (e.key === "Enter") doInstall(); });
      box.appendChild(input);
      box.appendChild(installBtn);
      box.appendChild(UI.el("button", {
        class: "vsc-side-btn ghost", text: T("ext.openManager"),
        onclick: () => App.navigate("extensions")
      }));

      if (!window.ExtHost) {
        box.appendChild(UI.el("div", { class: "vsc-side-empty", text: T("ext.hostMissing") }));
        sidebar.appendChild(box);
        return;
      }
      const list = UI.el("div", { class: "vsc-ext-list", role: "list" });
      const paint = () => {
        UI.clear(list);
        const rows = ExtHost.state.extensions || [];
        if (!rows.length) {
          list.appendChild(UI.el("div", { class: "vsc-side-empty", text: T("ext.none") }));
          return;
        }
        rows.forEach((ext) => {
          const L = ExtHost.localized(ext);
          const row = UI.el("div", { class: "vsc-ext-item", role: "listitem" }, [
            UI.el("div", { class: "grow" }, [
              UI.el("div", { class: "vsc-ext-name", text: L.name }),
              UI.el("div", { class: "vsc-ext-meta", text: ext.version + " · " + (ext.builtin ? T("ext.builtin") : T("ext.installedSource")) }),
              ext.activationError ? UI.el("div", { class: "vsc-ext-err", text: ext.activationError }) : null
            ]),
            UI.el("button", {
              class: "icon-btn", text: ext.enabled ? "◉" : "○",
              title: ext.enabled ? T("ext.disable") : T("ext.enable"),
              "aria-label": (ext.enabled ? T("ext.disable") : T("ext.enable")) + " " + L.name,
              "aria-pressed": ext.enabled ? "true" : "false",
              onclick: async () => {
                try { await ExtHost.setEnabled(ext.id, !ext.enabled); } catch (err) { UI.toast("err", T("ext.fail"), err.message); }
                renderSidebar();
              }
            })
          ]);
          list.appendChild(row);
        });
      };
      paint();
      const off = ExtHost.subscribe(() => { if (document.body.contains(list)) paint(); else off(); });
      box.appendChild(list);
      box.appendChild(UI.el("div", { class: "vsc-ext-note muted", text: T("ext.vsixNote") }));
      sidebar.appendChild(box);
      if (!ExtHost.state.loaded) ExtHost.refresh();
    }

    const sourceSelect = UI.el("select", { class: "vsc-select", onchange: (e) => { state.source = e.target.value; state.projectRoot = null; state.tabs = []; state.docs = {}; state.active = null; renderAll(); reloadSource(); } }, [
      UI.el("option", { value: "workspace", text: "Workspace" }),
      UI.el("option", { value: "repo", text: "Repo" }),
      UI.el("option", { value: "storage", text: "Local Storage" })
    ]);
    const storageSelect = UI.el("select", { class: "vsc-select" });
    storageSelect.addEventListener("change", (e) => { state.storageProfile = e.target.value || null; state.storageTree = null; state.tabs = []; state.active = null; renderAll(); loadStorageTree(); });
    const repoSelect = UI.el("select", { class: "vsc-select" });
    repoSelect.addEventListener("change", (e) => { state.repo = e.target.value || null; state.repoTree = null; state.tabs = []; state.active = null; renderAll(); loadRepoTree(); });
    const fileList = UI.el("div", { class: "vsc-tree" });

    function renderExplorer() {
      /* Cabecera del panel con el menú "⋯" (como VS Code). */
      sidebar.appendChild(UI.el("div", { class: "vsc-side-head" }, [
        UI.el("div", { class: "vsc-side-title", text: T("ide.explorer").toUpperCase() }),
        UI.el("button", {
          class: "vsc-icon-btn", html: "&#8943;", title: T("ide.moreActions"),
          "aria-label": T("ide.moreActions"), "aria-haspopup": "menu",
          onclick: (event) => {
            const r = event.currentTarget.getBoundingClientRect();
            ctxMenu(r.left, r.bottom, explorerViewOps());
          }
        })
      ]));
      if (!state.opened) {
        sidebar.appendChild(UI.el("div", { class: "vsc-nofolder" }, [
          UI.el("div", { class: "vsc-nofolder-title", text: T("ide.noFolder") }),
          UI.el("div", { class: "vsc-side-empty", text: T("ide.noFolderHint") }),
          UI.el("div", { class: "vsc-side-actions" }, [
            UI.el("button", { class: "vsc-side-btn", text: T("ide.openFolder"), onclick: openFolderFromComputer }),
            UI.el("button", { class: "vsc-side-btn ghost", text: T("ide.openStorage"), onclick: openStorageModal }),
            UI.el("button", { class: "vsc-side-btn ghost", text: T("ide.newProject"), onclick: createProjectModal })
          ])
        ]));
        return;
      }
      repoSelect.style.display = state.source === "repo" ? "" : "none";
      storageSelect.style.display = state.source === "storage" ? "" : "none";
      sourceSelect.style.display = state.projectRoot ? "none" : "";
      if (!state.projectRoot || state.source !== "workspace") {
        sidebar.appendChild(UI.el("div", { class: "vsc-side-controls" }, [sourceSelect, repoSelect, storageSelect]));
      }

      /* Fila de la carpeta raíz con las 4 acciones de VS Code. */
      const rootName = state.projectRoot
        ? state.projectRoot.split("/").filter(Boolean).pop()
        : state.source === "repo" ? (state.repo || "repo")
          : state.source === "storage" ? (state.storageProfile || "storage")
            : T("ide.workspace");
      const caret = UI.el("span", { class: "vsc-caret", text: state.rootOpen ? "▾" : "▸" });
      const toggle = UI.el("button", {
        class: "vsc-root-toggle", "aria-expanded": state.rootOpen ? "true" : "false",
        "aria-controls": "vsc-file-tree", title: rootName,
        onclick: () => {
          state.rootOpen = !state.rootOpen;
          caret.textContent = state.rootOpen ? "▾" : "▸";
          toggle.setAttribute("aria-expanded", state.rootOpen ? "true" : "false");
          fileList.style.display = state.rootOpen ? "" : "none";
          say(rootName + " · " + (state.rootOpen ? T("ide.expanded") : T("ide.collapsed")));
        }
      }, [caret, UI.el("span", { class: "vsc-root-name", text: String(rootName) })]);
      const action = (icon, label, fn) => UI.el("button", {
        class: "vsc-icon-btn", html: icon, title: label, "aria-label": label, onclick: fn
      });
      sidebar.appendChild(UI.el("div", { class: "vsc-root-row" }, [
        toggle,
        UI.el("div", { class: "vsc-root-actions" }, [
          action("&#128196;", T("ide.newFile"), () => inlineCreate("file")),
          action("&#128193;", T("ide.newFolder"), () => inlineCreate("dir")),
          action("&#8635;", T("common.refresh"), () => { reloadSource(); say(T("common.refresh")); }),
          action("&#8863;", T("ide.collapseAll"), collapseAll)
        ])
      ]));

      fileList.id = "vsc-file-tree";
      fileList.style.display = state.rootOpen ? "" : "none";
      sidebar.appendChild(fileList);
      renderTree();

      /* Secciones plegables: Outline y Timeline (datos reales). */
      const sections = UI.el("div", { class: "vsc-sections" });
      sections.appendChild(explorerSection("outline", T("ide.outline"), loadOutline));
      sections.appendChild(explorerSection("timeline", T("ide.timeline"), loadTimeline));
      sidebar.appendChild(sections);
    }

    /* Menú "⋯" de la cabecera del Explorer. */
    function explorerViewOps() {
      return [
        { label: T("ide.newFile"), action: () => inlineCreate("file") },
        { label: T("ide.newFolder"), action: () => inlineCreate("dir") },
        "-",
        { label: T("common.refresh"), action: reloadSource },
        { label: T("ide.collapseAll"), action: collapseAll },
        "-",
        { label: T("ide.sortName"), checked: state.sort === "name", action: () => { state.sort = "name"; renderTree(); } },
        { label: T("ide.sortType"), checked: state.sort === "type", action: () => { state.sort = "type"; renderTree(); } },
        { label: T("ide.sortSize"), checked: state.sort === "size", action: () => { state.sort = "size"; renderTree(); } },
        { label: T("ide.showHidden"), checked: state.hidden, action: () => { state.hidden = !state.hidden; renderTree(); } },
        "-",
        { label: T("ide.openFolder"), action: openFolderFromComputer },
        { label: T("ide.openFile"), action: openFromComputer }
      ];
    }

    function collapseAll() {
      state.openDirs.clear();
      renderTree();
      say(T("ide.collapseAll"));
    }

    /* Creation en línea dentro del árbol, como VS Code (sin prompt del navegador). */
    function inlineCreate(kind, dir) {
      if (!state.opened) { UI.toast("warn", T("ide.noFolder"), T("ide.noFolderHint")); return; }
      if (state.activity !== "explorer") setActivity("explorer");
      if (!state.rootOpen) {
        state.rootOpen = true;
        fileList.style.display = "";
        const caretNode = sidebar.querySelector(".vsc-root-toggle .vsc-caret");
        if (caretNode) caretNode.textContent = "▾";
      }
      const previous = fileList.querySelector(".vsc-inline-row");
      if (previous) previous.remove();

      const base = state.projectRoot ? state.projectRoot + "/" : "";
      let target = dir;
      if (target == null) {
        const sel = state.selected;
        target = sel ? (sel.isDir ? sel.path : sel.path.split("/").slice(0, -1).join("/")) : "";
      }
      if (base && target && target.startsWith(base)) target = target.slice(base.length);
      const prefix = (base + (target ? target.replace(/\/$/, "") + "/" : ""));
      const label = kind === "dir" ? T("ide.newFolder") : T("ide.newFile");
      const input = UI.el("input", {
        class: "vsc-inline-input", type: "text", placeholder: label,
        "aria-label": label + (target ? " · " + target : "")
      });
      const row = UI.el("div", { class: "vsc-inline-row" }, [
        UI.el("span", { class: "vsc-inline-icon", html: kind === "dir" ? "&#128193;" : "&#128196;" }),
        input
      ]);
      if (target) row.title = prefix;
      fileList.insertBefore(row, fileList.firstChild);
      input.focus();
      say(label + (target ? " · " + target : ""));

      let done = false;
      const finish = async (commit) => {
        if (done) return;
        done = true;
        const name = input.value.trim();
        row.remove();
        if (!commit || !name) return;
        const path = prefix + name;
        try {
          await API.ide(kind === "dir" ? "fs_mkdir" : "fs_create", { path: path });
          if (target) state.openDirs.add(target);
          await loadTree();
          if (kind === "dir") {
            UI.toast("ok", T("ide.folderCreated"), name);
            say(T("ide.folderCreated") + ": " + name);
          } else {
            await openFile(path);
            UI.toast("ok", T("ide.fileCreated"), name);
            say(T("ide.fileCreated") + ": " + name);
          }
        } catch (err) {
          UI.toast("err", T("ide.notSaved"), err.message);
        }
      };
      input.addEventListener("keydown", (event) => {
        event.stopPropagation();
        if (event.key === "Enter") { event.preventDefault(); finish(true); }
        else if (event.key === "Escape") { event.preventDefault(); finish(false); }
      });
      input.addEventListener("blur", () => setTimeout(() => finish(false), 80));
    }

    /* Sección plegable del Explorer (Outline / Timeline). */
    function explorerSection(id, label, load) {
      const open = !!state.sections[id];
      const body = UI.el("div", { class: "vsc-section-body", id: "vsc-sec-" + id });
      body.style.display = open ? "" : "none";
      const caret = UI.el("span", { class: "vsc-caret", text: open ? "▾" : "▸" });
      const head = UI.el("button", {
        class: "vsc-section-head", "aria-expanded": open ? "true" : "false", "aria-controls": "vsc-sec-" + id,
        onclick: () => {
          state.sections[id] = !state.sections[id];
          const now = state.sections[id];
          caret.textContent = now ? "▾" : "▸";
          head.setAttribute("aria-expanded", now ? "true" : "false");
          body.style.display = now ? "" : "none";
          if (now) load(body);
        }
      }, [caret, UI.el("span", { text: label.toUpperCase() })]);
      if (open) load(body);
      return UI.el("div", { class: "vsc-section" }, [head, body]);
    }

    async function loadOutline(body) {
      UI.clear(body);
      if (!state.active || isUntitled(state.active)) {
        body.appendChild(UI.el("div", { class: "vsc-side-empty", text: T("ide.outlineEmpty") }));
        return;
      }
      try {
        const result = await API.ide("symbols", { path: state.active });
        const rows = result.symbols || [];
        if (!rows.length) {
          body.appendChild(UI.el("div", { class: "vsc-side-empty", text: T("ide.noSymbols") }));
          return;
        }
        rows.forEach((sy) => {
          const node = UI.el("div", { class: "vsc-tree-item vsc-symbol", title: T("ide.line") + " " + sy.line }, [
            UI.el("span", { class: "vsc-symbol-kind", text: sy.kind === "heading" ? "#" : "◇" }),
            UI.el("span", { class: "trunc", text: sy.name })
          ]);
          node.addEventListener("click", () => gotoLine(sy.line));
          body.appendChild(node);
        });
      } catch (err) {
        body.appendChild(UI.el("div", { class: "vsc-side-empty", text: T("ide.noSymbols") }));
      }
    }

    async function loadTimeline(body) {
      UI.clear(body);
      if (!state.active || isUntitled(state.active)) {
        body.appendChild(UI.el("div", { class: "vsc-side-empty", text: T("ide.timelineEmpty") }));
        return;
      }
      try {
        const result = await API.ide("history_list", { path: state.active });
        const rows = result.history || [];
        if (!rows.length) {
          body.appendChild(UI.el("div", { class: "vsc-side-empty", text: T("ide.noHistory") }));
          return;
        }
        rows.forEach((version) => {
          const when = new Date(Number(version.id));
          const node = UI.el("div", {
            class: "vsc-tree-item vsc-timeline-item",
            title: when.toLocaleString() + " · " + UI.bytes(version.size)
          }, [
            UI.el("span", { class: "vsc-symbol-kind", text: "◷" }),
            UI.el("span", { class: "trunc", text: when.toLocaleString() }),
            UI.el("span", { class: "vsc-timeline-size", text: UI.bytes(version.size) })
          ]);
          node.addEventListener("click", async () => {
            try {
              const saved = await API.ide("history_read", { path: state.active, id: version.id });
              const current = (state.docs[state.active] || {}).content || "";
              const diff = await API.ide("diff", { a: saved.content, b: current, la: "historial", lb: "actual" });
              showDiff(diff.diff);
            } catch (err) { UI.toast("err", T("ide.noHistory"), err.message); }
          });
          body.appendChild(node);
        });
      } catch (err) {
        body.appendChild(UI.el("div", { class: "vsc-side-empty", text: T("ide.noHistory") }));
      }
    }

    function gotoLine(line) {
      const ta = document.querySelector(".code-ta");
      if (!ta) return;
      const lines = ta.value.split("\n");
      let pos = 0;
      for (let i = 0; i < Math.max(0, line - 1) && i < lines.length; i++) pos += lines[i].length + 1;
      ta.focus();
      ta.setSelectionRange(pos, pos + (lines[line - 1] || "").length);
      const style = window.getComputedStyle(ta);
      const lh = parseFloat(style.lineHeight) || 20;
      ta.scrollTop = Math.max(0, (line - 4) * lh);
      updateStatus();
      say(T("ide.line") + " " + line);
    }

    function renderSearch() {
      sidebar.appendChild(UI.el("div", { class: "vsc-side-title", text: T("ide.search").toUpperCase() }));
      const input = UI.el("input", { class: "vsc-search-input", placeholder: T("ide.searchPlaceholder") });
      const repl = UI.el("input", { class: "vsc-search-input", placeholder: T("ide.replace") });
      const inc = UI.el("input", { class: "vsc-search-input", placeholder: T("ide.includeGlob") });
      const exc = UI.el("input", { class: "vsc-search-input", placeholder: T("ide.excludeGlob") });
      const opt = { regex: false, case: false, whole: false };
      const tog = (key, label) => { const b = UI.el("button", { class: "vsc-opt", text: label, title: label }); b.addEventListener("click", () => { opt[key] = !opt[key]; b.classList.toggle("on", opt[key]); }); return b; };
      const results = UI.el("div", { class: "vsc-tree" });
      const doSearch = async () => {
        const q = input.value.trim(); UI.clear(results);
        if (q.length < 2) return;
        results.appendChild(UI.loading(T("common.loading")));
        try {
          const data = await API.ide("search", { q, include: inc.value, exclude: exc.value, regex: opt.regex, case: opt.case, whole: opt.whole });
          UI.clear(results);
          const hits = (data.matches || []).slice(0, 80);
          if (!hits.length) { results.appendChild(UI.el("div", { class: "vsc-side-empty", text: T("ide.noResults") })); return; }
          hits.forEach((h) => {
            const node = UI.el("div", { class: "vsc-tree-item", title: h.text }, [
              window.Icons ? Icons.file(h.path) : null,
              UI.el("span", { class: "trunc", text: h.path.split("/").pop() }),
              UI.el("span", { class: "muted", style: { fontSize: "10px", flex: "none" }, text: ":" + h.line })
            ]);
            node.addEventListener("click", () => { state.source = "workspace"; state.projectRoot = null; openFile(h.path); });
            results.appendChild(node);
          });
        } catch (e) { UI.clear(results); results.appendChild(UI.errBox(e)); }
      };
      const doReplace = async (preview) => {
        const q = input.value.trim(); if (q.length < 2) return;
        const r = await API.ide("replace", { q, repl: repl.value, include: inc.value, exclude: exc.value, preview });
        const n = (r.changed || []).reduce((s, c) => s + c.count, 0);
        UI.toast("ok", preview ? T("ide.previewReplace") : T("ide.replace"), n + " " + T("ide.matches"));
        if (!preview) { state.docs = {}; doSearch(); }
      };
      sidebar.appendChild(UI.el("div", { class: "vsc-search-box" }, [
        input, repl,
        UI.el("div", { class: "vsc-search-opts" }, [tog("case", "Aa"), tog("whole", "ab"), tog("regex", ".*"),
          UI.el("button", { class: "vsc-opt", text: "⯈", title: T("ide.previewReplace"), onclick: () => doReplace(true) }),
          UI.el("button", { class: "vsc-opt", text: "⇄", title: T("ide.replace"), onclick: () => doReplace(false) })]),
        inc, exc
      ]));
      sidebar.appendChild(results);
      let timer = null;
      input.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(doSearch, 300); });
    }

    /* ---------------------------------------------------------- SCM (Git real) */
    async function renderSCM() {
      sidebar.appendChild(UI.el("div", { class: "vsc-side-title", text: T("ide.scm").toUpperCase() }));
      const box = UI.el("div", { class: "vsc-scm" });
      sidebar.appendChild(box);
      let st;
      try { st = await API.ide("git_status"); } catch (e) { box.appendChild(UI.errBox(e)); return; }
      if (!st.git) { box.appendChild(UI.el("div", { class: "vsc-side-empty", text: T("ide.scmEmpty") })); return; }
      const msg = UI.el("input", { class: "vsc-search-input", placeholder: T("ide.commitMsg") });
      box.appendChild(msg);
      box.appendChild(UI.el("button", { class: "vsc-side-btn", text: "✓ " + T("ide.commit"), onclick: async () => {
        const r = await API.ide("git_commit", { message: msg.value || "commit" });
        UI.toast(r.ok ? "ok" : "err", T("ide.commit"), (r.output || "").slice(0, 120)); renderSCM();
      } }));
      box.appendChild(UI.el("div", { class: "vsc-scm-branch", text: "⑂ " + st.branch }));
      const changes = UI.el("div", { class: "vsc-tree" });
      box.appendChild(changes);
      if (!st.files.length) changes.appendChild(UI.el("div", { class: "vsc-side-empty", text: T("ide.noChanges") }));
      st.files.forEach((f) => {
        const row = UI.el("div", { class: "vsc-tree-item" }, [
          UI.el("span", { class: "vsc-scm-status", text: f.status }),
          UI.el("span", { class: "trunc", text: f.path }),
          UI.el("button", { class: "icon-btn", text: f.staged ? "−" : "+", title: f.staged ? T("ide.unstage") : T("ide.stage"), onclick: async () => { await API.ide(f.staged ? "git_unstage" : "git_stage", { paths: [f.path] }); renderSCM(); } }),
          UI.el("button", { class: "icon-btn", text: "↺", title: T("ide.discard"), onclick: async () => { await API.ide("git_discard", { paths: [f.path] }); renderSCM(); } }),
          UI.el("button", { class: "icon-btn", text: "Δ", title: T("ide.diff"), onclick: async () => { const d = await API.ide("git_diff", { path: f.path }); showDiff(d.diff || "(sin diff)"); } })
        ]);
        changes.appendChild(row);
      });
      const log = await API.ide("git_log", { limit: 8 });
      box.appendChild(UI.el("div", { class: "vsc-side-title", text: T("ide.history") }));
      (log.commits || []).forEach((cmt) => box.appendChild(UI.el("div", { class: "vsc-scm-log", text: cmt.hash + " · " + cmt.message })));
    }

    function showDiff(text) {
      UI.clear(editorPane);
      const pre = UI.el("pre", { class: "vsc-diff" });
      text.split("\n").forEach((line) => {
        const cls = line.startsWith("+") ? "add" : line.startsWith("-") ? "del" : line.startsWith("@") ? "hunk" : "";
        pre.appendChild(UI.el("div", { class: "vsc-diff-line " + cls, text: line }));
      });
      editorPane.appendChild(pre);
    }

    /* ---------------------------------------------------------- Run / tareas */
    async function renderRun() {
      sidebar.appendChild(UI.el("div", { class: "vsc-side-title", text: T("ide.runDebug").toUpperCase() }));
      const box = UI.el("div", { class: "vsc-scm" });
      sidebar.appendChild(box);
      box.appendChild(UI.el("button", { class: "vsc-side-btn", text: "▶ " + T("ide.runNoDebug"), onclick: runActive }));
      box.appendChild(UI.el("div", { class: "vsc-side-title", text: T("ide.tasks") }));
      try {
        const tl = await API.ide("tasks_list");
        if (!(tl.tasks || []).length) box.appendChild(UI.el("div", { class: "vsc-side-empty", text: T("ide.noTasks") }));
        (tl.tasks || []).forEach((task) => box.appendChild(UI.el("button", { class: "vsc-side-btn ghost", text: task.label, onclick: async () => {
          openPanel("output"); const r = await API.ide("tasks_run", { name: task.label });
          UI.toast(r.code === 0 ? "ok" : "err", task.label, (r.stdout + r.stderr).slice(0, 120));
        } })));
      } catch (e) { box.appendChild(UI.errBox(e)); }
    }

    /* ---------------------------------------------------------- menú contextual explorer */
    function ctxMenu(x, y, items) {
      document.querySelectorAll(".vsc-ctx").forEach((n) => n.remove());
      const m = UI.el("div", { class: "vsc-ctx", role: "menu" });
      m.style.left = x + "px"; m.style.top = y + "px";
      items.forEach((it) => {
        if (it === "-") { m.appendChild(UI.el("div", { class: "vsc-sep" })); return; }
        const b = UI.el("button", {
          class: "vsc-dropdown-item" + (it.checked ? " checked" : ""),
          role: "menuitem", "aria-checked": it.checked ? "true" : "false"
        }, [
          UI.el("span", { class: "vsc-check", text: it.checked ? "✓" : "" }),
          UI.el("span", { text: it.label })
        ]);
        b.addEventListener("click", () => { m.remove(); it.action(); });
        m.appendChild(b);
      });
      document.body.appendChild(m);
      setTimeout(() => document.addEventListener("pointerdown", function h(e) { if (!m.contains(e.target)) { m.remove(); document.removeEventListener("pointerdown", h); } }), 0);
    }
    function explorerOps(path, isDir) {
      return [
        { label: T("ide.newFile"), action: () => inlineCreate("file", isDir ? path : path.split("/").slice(0, -1).join("/")) },
        { label: T("ide.newFolder"), action: () => inlineCreate("dir", isDir ? path : path.split("/").slice(0, -1).join("/")) },
        "-",
        { label: T("ide.rename"), action: async () => { const n = prompt(T("ide.rename"), path); if (n && n !== path) { await API.ide("fs_rename", { path, new: n }); loadTree(); } } },
        { label: T("ide.copy"), action: async () => { const n = prompt(T("ide.copy") + " →", path + "-copia"); if (n) { await API.ide("fs_copy", { src: path, dst: n }); loadTree(); } } },
        { label: T("ide.move"), action: async () => { const n = prompt(T("ide.move") + " →", path); if (n && n !== path) { await API.ide("fs_move", { src: path, dst: n }); loadTree(); } } },
        "-",
        { label: T("common.delete"), action: async () => { await API.ide("fs_delete", { path }); loadTree(); } }
      ];
    }

    /* ---------------------------------------------------------- outline / historial */
    async function renderOutline(container) {
      /* Refresca las secciones abiertas del Explorer con el archivo activo. */
      const outlineBody = document.getElementById("vsc-sec-outline");
      if (outlineBody && state.sections.outline) loadOutline(outlineBody);
      const timelineBody = document.getElementById("vsc-sec-timeline");
      if (timelineBody && state.sections.timeline) loadTimeline(timelineBody);
      if (!state.active) return;
      try {
        const s = await API.ide("symbols", { path: state.active });
        if (!(s.symbols || []).length) return;
        container.appendChild(UI.el("div", { class: "vsc-side-title", text: T("ide.outline") }));
        s.symbols.forEach((sy) => container.appendChild(UI.el("div", { class: "vsc-tree-item", text: sy.name }, [])));
      } catch (e) { /* sin símbolos */ }
    }
    async function showHistory() {
      if (!state.active) return;
      const h = await API.ide("history_list", { path: state.active });
      const list = UI.el("div", { class: "vsc-tree" });
      (h.history || []).forEach((v) => {
        const n = UI.el("div", { class: "vsc-tree-item", text: new Date(Number(v.id)).toLocaleString() + " · " + UI.bytes(v.size) });
        n.addEventListener("click", async () => { const r = await API.ide("history_read", { path: state.active, id: v.id }); ref.close(); showDiff((await API.ide("diff", { a: r.content, b: (state.docs[state.active] || {}).content || "", la: "historial", lb: "actual" })).diff); });
        list.appendChild(n);
      });
      if (!(h.history || []).length) list.appendChild(UI.el("div", { class: "vsc-side-empty", text: T("ide.noHistory") }));
      const ref = UI.modal({ title: T("ide.localHistory"), wide: true, body: list });
    }

    /* ---------------------------------------------------------- árbol (carpetas plegadas) */
    function renderTree() {
      UI.clear(fileList);
      const tree = state.source === "repo" ? state.repoTree : state.source === "storage" ? state.storageTree : state.tree;
      if (!tree) { fileList.appendChild(UI.loading(T("common.loading"))); return; }
      let entries = tree.entries || [];
      const base = state.projectRoot ? state.projectRoot + "/" : "";
      if (base) entries = entries.filter((e) => e.path.startsWith(base)).map((e) => Object.assign({}, e, { path: e.path.slice(base.length) })).filter((e) => e.path);
      if (!state.hidden) entries = entries.filter((e) => !e.path.split("/").some((p) => p.startsWith(".")));
      entries = entries.slice().sort((a, b) => {
        if (state.sort === "type") return (a.type + a.path).localeCompare(b.type + b.path);
        if (state.sort === "size") return (b.size || 0) - (a.size || 0);
        return a.path.localeCompare(b.path);
      });
      entries.forEach((entry) => {
        const depth = entry.path.split("/").length - 1;
        const parent = entry.path.split("/").slice(0, -1).join("/");
        if (depth > 0 && !state.openDirs.has(parent)) return;   // plegado por defecto
        const full = base + entry.path;
        if (entry.type === "dir") {
          const open = state.openDirs.has(entry.path);
          const node = UI.el("div", {
            class: "vsc-tree-item", "data-tree-item": "1", "data-path": entry.path,
            "data-full": full, "data-type": "dir", "data-depth": String(depth), "data-open": open ? "1" : "0"
          }, [
            UI.el("span", { class: "vsc-caret", text: open ? "▾" : "▸" }),
            window.Icons ? Icons.folder(open) : null,
            UI.el("span", { class: "trunc", text: entry.path.split("/").pop() })
          ]);
          node.style.paddingLeft = (6 + depth * 12) + "px";
          node.addEventListener("click", () => {
            state.selected = { path: full, isDir: true };
            open ? state.openDirs.delete(entry.path) : state.openDirs.add(entry.path);
            renderTree();
          });
          node.addEventListener("contextmenu", (e) => { e.preventDefault(); ctxMenu(e.clientX, e.clientY, explorerOps(full, true)); });
          fileList.appendChild(node);
          return;
        }
        const node = UI.el("div", {
          class: "vsc-tree-item" + (full === state.active ? " on" : ""),
          "data-tree-item": "1", "data-path": entry.path, "data-full": full,
          "data-type": "file", "data-depth": String(depth)
        }, [
          window.Icons ? Icons.file(entry.path) : null,
          UI.el("span", { class: "trunc", text: entry.path.split("/").pop() }),
          state.dirty[full] ? UI.el("span", { class: "dotm" }) : null
        ]);
        node.style.paddingLeft = (6 + depth * 12) + "px";
        node.title = full;
        node.addEventListener("click", () => { state.selected = { path: full, isDir: false }; openFile(full); });
        node.addEventListener("contextmenu", (e) => { e.preventDefault(); ctxMenu(e.clientX, e.clientY, explorerOps(full, false)); });
        fileList.appendChild(node);
      });
      if (!entries.length) fileList.appendChild(UI.el("div", { class: "vsc-side-empty", text: T("ide.emptyWorkspace") }));
      if (window.A11y) {
        const keep = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.path : null;
        A11y.tree(fileList, {
          label: T("ide.explorer"),
          expandable: (node) => node.dataset.type === "dir",
          expanded: (node) => node.dataset.open === "1",
          onToggle: (node, open) => {
            if (open) state.openDirs.add(node.dataset.path); else state.openDirs.delete(node.dataset.path);
            renderTree();
            const again = fileList.querySelector('[data-path="' + CSS.escape(node.dataset.path) + '"]');
            if (again) { again.setAttribute("tabindex", "0"); again.focus(); }
            say(docName(node.dataset.path) + " " + (open ? T("ide.expanded") : T("ide.collapsed")));
          },
          onActivate: (node) => {
            if (node.dataset.type === "dir") {
              const open = !state.openDirs.has(node.dataset.path);
              if (open) state.openDirs.add(node.dataset.path); else state.openDirs.delete(node.dataset.path);
              renderTree();
              const again = fileList.querySelector('[data-path="' + CSS.escape(node.dataset.path) + '"]');
              if (again) { again.setAttribute("tabindex", "0"); again.focus(); }
            } else openFile(node.dataset.full);
          },
          labelOf: (node) => docName(node.dataset.path) + (node.dataset.type === "dir" ? ", " + T("ide.folder") : "")
        });
        if (keep) {
          const node = fileList.querySelector('[data-path="' + CSS.escape(keep) + '"]');
          if (node && fileList.contains(document.activeElement)) { node.setAttribute("tabindex", "0"); node.focus(); }
        }
      }
    }

    function reloadSource() { if (state.source === "repo") loadRepoTree(); else if (state.source === "storage") loadStorageTree(); else loadTree(); }
    async function loadTree() { try { state.tree = await API.tree(6); renderTree(); updateStatus(); } catch (e) { UI.clear(fileList); fileList.appendChild(UI.errBox(e, loadTree)); } }
    async function loadRepoTree() { if (!state.repo) { state.repoTree = { entries: [] }; renderTree(); return; } try { state.repoTree = await API.repoTree(state.repo, 3); renderTree(); } catch (e) { UI.clear(fileList); fileList.appendChild(UI.errBox(e, loadRepoTree)); } }
    async function loadStorageTree() {
      renderStorageOptions();
      if (!state.storageProfile) { state.storageTree = { entries: [] }; renderTree(); return; }
      try { state.storageTree = await API.request("/storage/tree?profile=" + enc(state.storageProfile)); renderTree(); } catch (e) { UI.clear(fileList); fileList.appendChild(UI.errBox(e, loadStorageTree)); }
    }
    function renderStorageOptions() {
      UI.clear(storageSelect); const profiles = App.profiles || [];
      if (!profiles.length) { storageSelect.appendChild(UI.el("option", { value: "", text: "—" })); storageSelect.disabled = true; return; }
      storageSelect.disabled = false;
      if (!state.storageProfile || !profiles.some((p) => p.id === state.storageProfile)) state.storageProfile = App.profileId() || profiles[0].id;
      profiles.forEach((p) => storageSelect.appendChild(UI.el("option", { value: p.id, selected: p.id === state.storageProfile, text: p.label })));
    }
    function renderRepoOptions() {
      UI.clear(repoSelect);
      if (!state.repos.length) { repoSelect.appendChild(UI.el("option", { value: "", text: "—" })); repoSelect.disabled = true; return; }
      repoSelect.disabled = false;
      if (!state.repo || !state.repos.some((r) => r.slug === state.repo)) state.repo = state.repos[0].slug;
      state.repos.forEach((r) => repoSelect.appendChild(UI.el("option", { value: r.slug, selected: r.slug === state.repo, text: r.label })));
    }
    async function loadRepos() { try { const d = await API.repos(); state.repos = d.repos || []; renderRepoOptions(); } catch (e) { state.repos = []; renderRepoOptions(); } }

    /* ---------------------------------------------------------- editor + panel */
    const tabsBar = UI.el("div", { class: "vsc-tabs" });
    const breadcrumb = UI.el("div", { class: "vsc-breadcrumb" });
    const editorPane = UI.el("div", { class: "vsc-editor-pane" });
    const panel = UI.el("div", { class: "vsc-panel" });
    editorArea.appendChild(tabsBar); editorArea.appendChild(breadcrumb);
    editorArea.appendChild(editorPane); editorArea.appendChild(panel);

    function renderTabs() {
      UI.clear(tabsBar);
      if (!state.active && state.welcome) {
        const wtab = UI.el("div", { class: "vsc-tab on", role: "tab", "aria-selected": "true", title: T("ide.welcomeTab") }, [
          UI.el("span", { "aria-hidden": "true", text: "◈" }),
          UI.el("span", { text: T("ide.welcomeTab") }),
          UI.el("button", {
            class: "vsc-tab-close", "aria-label": t("common.close"), text: "×",
            onclick: (e) => { e.stopPropagation(); state.welcome = false; localStorage.setItem("ely.ideWelcome", "0"); renderAll(); }
          })
        ]);
        tabsBar.appendChild(wtab);
      }
      state.tabs.forEach((path) => {
        const tab = UI.el("div", {
          class: "vsc-tab" + (path === state.active ? " on" : "") + (isUntitled(path) ? " untitled" : ""),
          title: path, "data-path": path
        }, [
          window.Icons ? Icons.file(iconPath(path), 14) : null,
          UI.el("span", { text: docName(path) }),
          state.dirty[path] ? UI.el("span", { class: "dotm", title: T("ide.unsaved") }) : null,
          UI.el("button", {
            class: "vsc-tab-close", "aria-label": t("common.close") + " " + docName(path), text: "×",
            onclick: (e) => { e.stopPropagation(); closeTab(path); }
          })
        ]);
        tab.addEventListener("click", () => openFile(path));
        tabsBar.appendChild(tab);
      });
      if (window.A11y) {
        A11y.tablist(tabsBar, {
          selector: ".vsc-tab", label: T("ide.openEditors"),
          onSelect: (node) => { if (node.dataset.path) openFile(node.dataset.path); },
          onClose: (node) => { if (node.dataset.path) closeTab(node.dataset.path); },
          labelOf: (node) => (node.dataset.path ? docName(node.dataset.path) : T("ide.welcomeTab")) +
            (state.dirty[node.dataset.path] ? " · " + T("ide.unsaved") : "")
        });
      }
    }
    function closeTab(path) {
      state.tabs = state.tabs.filter((p) => p !== path); delete state.dirty[path];
      if (state.active === path) state.active = state.tabs[0] || null;
      renderAll(); if (state.active) openFile(state.active, true);
    }
    function closeActiveTab() { if (state.active) closeTab(state.active); }

    function renderBreadcrumb() {
      UI.clear(breadcrumb);
      if (!state.active) return;
      state.active.split("/").forEach((p, i, arr) => {
        breadcrumb.appendChild(UI.el("span", { class: "vsc-crumb", text: p }));
        if (i < arr.length - 1) breadcrumb.appendChild(UI.el("span", { class: "vsc-crumb-sep", text: "›" }));
      });
    }

    let codeTA = null, codeHL = null, gutterInner = null;
    function rawUrl(path) {
      if (state.source === "storage") { const p = path.split("/"); return "/api/storage/raw?profile=" + enc(state.storageProfile) + "&kind=" + enc(p[0]) + "&name=" + enc(p.slice(1).join("/")); }
      if (state.source === "repo") return "/api/workspace/raw?path=" + enc(".ely/repos/" + state.repo + "/" + path);
      return "/api/workspace/raw?path=" + enc(path);
    }

    function renderEditor() {
      UI.clear(editorPane);
      codeTA = null;
      if (!state.active) { renderWelcome(); return; }
      const ext = (state.active.split(".").pop() || "").toLowerCase();
      if (PREVIEW.includes(ext)) { renderPreview(ext); return; }
      const lang = langFor(state.active);
      const doc = state.docs[state.active];
      const wrap = UI.el("div", { class: "code-wrap" + (state.wordWrap ? " wrap" : "") });
      const gutter = UI.el("div", { class: "code-gutter" });
      gutterInner = UI.el("div", { class: "code-gutter-inner", text: "1" });
      gutter.appendChild(gutterInner);
      const hl = UI.el("pre", { class: "code-hl" });
      codeHL = UI.el("code", { class: "code-hl-inner" });
      hl.appendChild(codeHL);
      codeTA = UI.el("textarea", { class: "code-ta", spellcheck: "false", wrap: state.wordWrap ? "soft" : "off" });
      codeTA.value = doc ? doc.content : "";
      wrap.appendChild(gutter); wrap.appendChild(hl); wrap.appendChild(codeTA);
      editorPane.appendChild(wrap);
      function paint() {
        const text = codeTA.value;
        codeHL.innerHTML = (window.Syntax ? Syntax.highlight(text, lang) : text.replace(/&/g, "&amp;").replace(/</g, "&lt;")) + "\n";
        gutterInner.textContent = Array.from({ length: text.split("\n").length }, (_, i) => i + 1).join("\n");
      }
      function sync() {
        codeHL.style.transform = "translate(" + (-codeTA.scrollLeft) + "px," + (-codeTA.scrollTop) + "px)";
        gutterInner.style.transform = "translateY(" + (-codeTA.scrollTop) + "px)";
      }
      codeTA.addEventListener("input", () => {
        if (!state.active) return;
        state.dirty[state.active] = true;
        paint(); updateStatus(); renderTabs();
        if (window.ExtHost) {
          clearTimeout(state.extChangeTimer);
          state.extChangeTimer = setTimeout(() => ExtHost.emit("changeText", {
            path: state.active, length: codeTA.value.length
          }), 350);
        }
      });
      codeTA.addEventListener("scroll", sync);
      codeTA.addEventListener("keydown", (e) => {
        if (e.key === "Tab") { e.preventDefault(); const s = codeTA.selectionStart; codeTA.setRangeText("  ", s, codeTA.selectionEnd, "end"); codeTA.dispatchEvent(new Event("input")); }
      });
      /* Pista dentro del editor vacío, como VS Code («select a language…»). */
      if (state.editorHint && !codeTA.value) {
        const hint = UI.el("div", { class: "code-hint", "aria-hidden": "true" }, [
          UI.el("span", { text: T("ide.hintWrite") + " " }),
          UI.el("button", { class: "code-hint-link", text: T("ide.hintLanguage"), onclick: selectLanguage }),
          UI.el("span", { text: " (Ctrl+K M). " + T("ide.hintDismiss") + " " }),
          UI.el("button", {
            class: "code-hint-link", text: T("ide.hintNever"),
            onclick: () => { state.editorHint = false; localStorage.setItem("ely.ideEditorHint", "0"); hint.remove(); }
          })
        ]);
        wrap.appendChild(hint);
        codeTA.addEventListener("input", () => { if (codeTA.value) hint.remove(); }, { once: false });
      }
      if (window.A11y) {
        A11y.editor(codeTA, {
          label: T("ide.editor") + ": " + docName(state.active) + " · " + langLabel(lang),
          lang: lang,
          onPosition: () => updateStatus()
        });
      }
      /* Autocompletado con Tab (activado por defecto). */
      if (window.Completion) {
        Completion.attach(codeTA, {
          language: lang,
          onAccept: () => { state.dirty[state.active] = true; updateStatus(); renderTabs(); }
        });
      }
      paint(); sync();
    }

    /* Vista previa a pantalla completa (no modal). */
    function renderPreview(ext) {
      const url = rawUrl(state.active);
      const box = UI.el("div", { class: "vsc-preview" });
      if (ext === "pdf") box.appendChild(UI.el("iframe", { src: url, class: "vsc-preview-frame" }));
      else box.appendChild(UI.el("img", { src: url, class: "vsc-preview-img", alt: state.active }));
      editorPane.appendChild(box);
    }

    /* Bienvenida con el aspecto de VS Code: Start · Recent · Walkthroughs. */
    function renderWelcome() {
      if (!state.welcome) {
        editorPane.appendChild(UI.el("div", { class: "vsc-welcome-empty" }, [
          UI.el("div", { class: "vsc-welcome-logo dim", "aria-hidden": "true", text: "◈" }),
          UI.el("p", { class: "muted", text: T("ide.emptyEditor") }),
          UI.el("button", { class: "vsc-welcome-btn", text: T("ide.showWelcome"), onclick: () => { state.welcome = true; localStorage.setItem("ely.ideWelcome", "1"); renderEditor(); } })
        ]));
        return;
      }
      const link = (icon, label, action, hint) => {
        const b = UI.el("button", { class: "vsc-wl-link", title: hint || label }, [
          UI.el("span", { class: "vsc-wl-icon", "aria-hidden": "true", text: icon }),
          UI.el("span", { text: label })
        ]);
        b.addEventListener("click", action);
        return b;
      };
      const recents = recentProjects();
      const start = UI.el("section", { class: "vsc-wl-col", "aria-labelledby": "wl-start" }, [
        UI.el("h3", { id: "wl-start", text: T("ide.start") }),
        link("🗋", T("ide.newFile"), newFileQuickPick),
        link("🗎", T("ide.openFile"), openFromComputer),
        link("🗀", T("ide.openFolder"), openFolderFromComputer),
        link("🗄", T("ide.openStorage"), openStorageModal),
        link("⌘", T("ide.newProject"), createProjectModal)
      ]);
      const recent = UI.el("section", { class: "vsc-wl-col", "aria-labelledby": "wl-recent" }, [
        UI.el("h3", { id: "wl-recent", text: T("ide.recent") })
      ]);
      if (recents.length) {
        recents.slice(0, 6).forEach((p) => recent.appendChild(link("🗀", p, () => openProjectRoot(p))));
        const clear = UI.el("button", { class: "vsc-wl-clear", text: T("ide.clearRecent") });
        clear.addEventListener("click", () => { localStorage.setItem("ely.ideRecent", "[]"); renderEditor(); });
        recent.appendChild(clear);
      } else {
        recent.appendChild(UI.el("p", { class: "muted vsc-wl-empty" }, [
          document.createTextNode(T("ide.noRecentFolders") + " "),
          UI.el("button", { class: "vsc-wl-inline", text: T("ide.openFolder"), onclick: openFolderFromComputer }),
          document.createTextNode(" " + T("ide.toStart"))
        ]));
      }
      const walk = UI.el("section", { class: "vsc-wl-col vsc-wl-right", "aria-labelledby": "wl-walk" }, [
        UI.el("h3", { id: "wl-walk", text: T("ide.walkthroughs") })
      ]);
      const card = (icon, title, desc, action) => {
        const node = UI.el("button", { class: "vsc-wl-card" }, [
          UI.el("span", { class: "vsc-wl-card-icon", "aria-hidden": "true", text: icon }),
          UI.el("span", { class: "vsc-wl-card-text" }, [
            UI.el("b", { text: title }),
            UI.el("span", { class: "muted", text: desc })
          ])
        ]);
        node.addEventListener("click", action);
        return node;
      };
      walk.appendChild(card("★", T("ide.walkStartTitle"), T("ide.walkStartDesc"), () => walkthrough("start")));
      walk.appendChild(card("💡", T("ide.walkBasicsTitle"), T("ide.walkBasicsDesc"), () => walkthrough("basics")));
      walk.appendChild(card("♿", T("ide.walkA11yTitle"), T("ide.walkA11yDesc"), () => { if (window.A11y) A11y.help(); }));

      const show = UI.el("input", { type: "checkbox", id: "wl-show", checked: state.welcome });
      show.addEventListener("change", () => {
        state.welcome = show.checked;
        localStorage.setItem("ely.ideWelcome", show.checked ? "1" : "0");
      });
      const footer = UI.el("div", { class: "vsc-wl-footer" }, [
        UI.el("label", { class: "vsc-wl-check", for: "wl-show" }, [show, UI.el("span", { text: T("ide.showWelcomeOnStartup") })])
      ]);

      editorPane.appendChild(UI.el("div", { class: "vsc-wl", role: "region", "aria-label": T("ide.welcomeTab") }, [
        UI.el("div", { class: "vsc-wl-head" }, [
          UI.el("h2", { text: "Ely IDE" }),
          UI.el("p", { class: "vsc-wl-tag", text: T("ide.tagline") })
        ]),
        UI.el("div", { class: "vsc-wl-grid" }, [
          UI.el("div", { class: "vsc-wl-left" }, [start, recent]), walk
        ]),
        footer
      ]));
    }

    /** Guías paso a paso (walkthroughs), como las de VS Code. */
    function walkthrough(kind) {
      const steps = kind === "basics" ? [
        [T("ide.walkB1"), T("ide.walkB1d"), () => { quickOpen(); }],
        [T("ide.walkB2"), T("ide.walkB2d"), () => { commandPalette(); }],
        [T("ide.walkB3"), T("ide.walkB3d"), () => { togglePanel("terminal"); }],
        [T("ide.walkB4"), T("ide.walkB4d"), () => { setActivity("search"); }],
        [T("ide.walkB5"), T("ide.walkB5d"), () => { setActivity("scm"); }]
      ] : [
        [T("ide.walkS1"), T("ide.walkS1d"), () => { openFolderFromComputer(); }],
        [T("ide.walkS2"), T("ide.walkS2d"), () => { newFileQuickPick(); }],
        [T("ide.walkS3"), T("ide.walkS3d"), () => { selectLanguage(); }],
        [T("ide.walkS4"), T("ide.walkS4d"), () => { if (window.A11y) A11y.openSettings(); }],
        [T("ide.walkS5"), T("ide.walkS5d"), () => { App.navigate("chat"); }]
      ];
      const box = UI.el("div", { class: "stack vsc-walk" });
      steps.forEach(([title, desc, action], i) => {
        const row = UI.el("div", { class: "vsc-walk-step" }, [
          UI.el("span", { class: "vsc-walk-num", "aria-hidden": "true", text: String(i + 1) }),
          UI.el("div", { class: "grow" }, [
            UI.el("b", { text: title }),
            UI.el("div", { class: "muted", style: { fontSize: "12px" }, text: desc })
          ]),
          UI.btn(T("ide.walkOpen"), () => { ref.close(); action(); }, { small: true })
        ]);
        box.appendChild(row);
      });
      const ref = UI.modal({
        title: kind === "basics" ? T("ide.walkBasicsTitle") : T("ide.walkStartTitle"),
        subtitle: T("ide.walkthroughs"), wide: true, body: box,
        footer: [UI.btn(t("common.close"), () => ref.close(), { primary: true })]
      });
    }

    /* ---------------------------------------------------------- panel inferior */
    const PANEL_TABS = [["problems", T("ide.problems")], ["output", T("ide.output")], ["debug", T("ide.debugConsole")], ["terminal", T("ide.terminal")], ["ports", T("ide.ports")]];
    let termOut = null, termInput = null;
    function renderPanel() {
      UI.clear(panel);
      panel.style.display = state.panel.open ? "" : "none";
      if (!state.panel.open) return;
      const tabs = UI.el("div", { class: "vsc-panel-tabs" });
      PANEL_TABS.forEach(([id, label]) => {
        const b = UI.el("button", {
          class: "vsc-panel-tab" + (state.panel.tab === id ? " on" : ""), text: label,
          role: "tab", "data-tab": id, "aria-selected": state.panel.tab === id ? "true" : "false",
          "aria-controls": "vsc-panel-body"
        });
        b.addEventListener("click", () => { state.panel.tab = id; renderPanel(); say(label); });
        tabs.appendChild(b);
      });
      tabs.appendChild(UI.el("div", { style: { flex: "1" } }));
      tabs.appendChild(UI.el("button", { class: "vsc-panel-x", text: "×", title: T("common.close"), "aria-label": T("common.close"), onclick: () => { state.panel.open = false; renderPanel(); } }));
      panel.appendChild(tabs);
      const pbody = UI.el("div", { class: "vsc-panel-body", id: "vsc-panel-body", role: "tabpanel", "aria-label": (PANEL_TABS.find((p) => p[0] === state.panel.tab) || ["", ""])[1] });
      panel.appendChild(pbody);
      panel.setAttribute("role", "region");
      panel.setAttribute("aria-label", T("ide.panel"));
      if (window.A11y) {
        A11y.tablist(tabs, {
          selector: ".vsc-panel-tab", label: T("ide.panel"),
          onSelect: (node) => { state.panel.tab = node.dataset.tab; renderPanel(); },
          selected: (node) => node.dataset.tab === state.panel.tab
        });
      }
      if (state.panel.tab === "terminal") renderTerminal(pbody);
      else pbody.appendChild(UI.el("div", { class: "vsc-side-empty", text: T("ide.panelEmpty") }));
    }
    function openPanel(tab) { state.panel.open = true; state.panel.tab = tab || state.panel.tab; renderPanel(); if (tab === "terminal" && termInput) termInput.focus(); }
    function togglePanel(tab) { if (state.panel.open && (!tab || state.panel.tab === tab)) state.panel.open = false; else { state.panel.open = true; if (tab) state.panel.tab = tab; } renderPanel(); if (state.panel.open && state.panel.tab === "terminal" && termInput) termInput.focus(); }

    function renderTerminal(pbody) {
      termOut = UI.el("div", {
        class: "vsc-term-out", role: "log", "aria-live": "polite",
        "aria-label": T("ide.terminalOutput"), tabindex: "0"
      });
      termOut.appendChild(UI.el("div", { class: "vsc-term-line muted", text: "Ely terminal · " + T("ide.termHint") }));
      const line = UI.el("div", { class: "vsc-term-line" });
      const prompt = UI.el("span", { class: "vsc-term-prompt", text: promptText() });
      termInput = UI.el("input", { class: "vsc-term-input", spellcheck: "false" });
      line.appendChild(prompt); line.appendChild(termInput);
      pbody.appendChild(termOut); pbody.appendChild(line);
      termInput.addEventListener("keydown", async (e) => {
        if (e.key === "Enter") {
          const cmd = termInput.value; termInput.value = "";
          state.history.push(cmd); state.histIdx = state.history.length;
          await runTerm(cmd, prompt);
        } else if (e.key === "ArrowUp") { e.preventDefault(); if (state.histIdx > 0) termInput.value = state.history[--state.histIdx] || ""; }
        else if (e.key === "ArrowDown") { e.preventDefault(); if (state.histIdx < state.history.length) termInput.value = state.history[++state.histIdx] || ""; }
      });
      pbody.addEventListener("click", () => termInput.focus());
      setTimeout(() => termInput.focus(), 30);
    }
    function promptText() { return (state.termCwd ? state.termCwd : "workspace") + " $"; }
    async function runTerm(cmd, promptEl) {
      termOut.appendChild(UI.el("div", { class: "vsc-term-line" }, [UI.el("span", { class: "vsc-term-prompt", text: promptEl.textContent }), UI.el("span", { text: " " + cmd })]));
      if (cmd.trim() === "clear") { UI.clear(termOut); return; }
      try {
        const r = await API.terminal(cmd, state.termCwd);
        state.termCwd = r.cwd || "";
        if (r.stdout) termOut.appendChild(UI.el("pre", { class: "vsc-term-pre", text: r.stdout }));
        if (r.stderr) termOut.appendChild(UI.el("pre", { class: "vsc-term-pre err", text: r.stderr }));
        const failed = r.exit_code != null && r.exit_code !== 0;
        sig(failed ? "terminalCommandFailed" : "terminalCommandSucceeded", cmd);
      } catch (e) {
        termOut.appendChild(UI.el("pre", { class: "vsc-term-pre err", text: e.message }));
        sig("terminalCommandFailed", e.message);
      }
      if (promptEl) promptEl.textContent = promptText();
      termOut.scrollTop = termOut.scrollHeight;
    }

    /* ---------------------------------------------------------- estado / layout */
    function updateStatus() {
      UI.clear(statusbar);
      const ext = (state.active || "").split(".").pop();
      const doc = state.docs[state.active];
      statusbar.appendChild(UI.el("span", { class: "vsc-sb-item", text: "⑂ " + (state.projectRoot || "main") }));
      statusbar.appendChild(UI.el("span", { class: "vsc-sb-item", text: "⊗ 0  ⚠ 0" }));
      statusbar.appendChild(UI.el("div", { style: { flex: "1" } }));
      if (doc) {
        statusbar.appendChild(UI.el("span", { class: "vsc-sb-item", text: "Ln " + (doc.lines || 1) + ", Col 1" }));
        statusbar.appendChild(UI.el("span", { class: "vsc-sb-item", text: T("ide.spaces") + ": 2" }));
        statusbar.appendChild(UI.el("span", { class: "vsc-sb-item", text: "UTF-8" }));
        statusbar.appendChild(UI.el("button", {
          class: "vsc-sb-item vsc-sb-lang",
          title: T("ide.selectLanguage") + " · " + LANGS.length + " " + T("ide.languageCount"),
          "aria-label": T("ide.selectLanguage") + ": " + langLabel(langFor(state.active)),
          text: "{} " + langLabel(langFor(state.active)), onclick: selectLanguage
        }));
      }
      statusbar.appendChild(UI.el("span", { class: "vsc-sb-item", text: state.dirty[state.active] ? "●" : "" }));
      /* Autocompletado con Tab: visible y conmutable, como el modo Tab de VS Code. */
      const tabOn = !window.Completion || Completion.enabled();
      statusbar.appendChild(UI.el("button", {
        class: "vsc-sb-item vsc-sb-tab" + (tabOn ? " on" : ""),
        text: "Tab " + (tabOn ? "✓" : "✕"),
        title: T("cmp.toggleHint"), "aria-label": T("cmp.toggleHint"),
        "aria-pressed": tabOn ? "true" : "false",
        onclick: () => {
          if (!window.Completion) return;
          Completion.setEnabled(!Completion.enabled());
          updateStatus();
          UI.toast("ok", Completion.enabled() ? T("cmp.on") : T("cmp.off"));
        }
      }));
      if (window.ExtHost) {
        ExtHost.statusItems().forEach((item) => {
          statusbar.appendChild(UI.el("button", {
            class: "vsc-sb-item vsc-sb-ext", text: item.text,
            title: item.tooltip || item.text, "aria-label": item.tooltip || item.text,
            onclick: () => { setActivity("extensions"); }
          }));
        });
      }
      if (window.A11y) statusbar.appendChild(A11y.statusItem());
      statusbar.setAttribute("role", "status");
      statusbar.setAttribute("aria-label", T("ide.statusBar"));
    }
    function toggleLayout(key) {
      state.layout[key] = !state.layout[key];
      menubar.style.display = state.layout.menubar ? "" : "none";
      activity.style.display = state.layout.activity ? "" : "none";
      sidebar.style.display = state.layout.sidebar ? "" : "none";
      statusbar.style.display = state.layout.status ? "" : "none";
    }
    function toggleWrap() { state.wordWrap = !state.wordWrap; renderEditor(); }

    /* ---------------------------------------------------------- abrir/guardar */
    async function openFile(path, force) {
      if (!path) return;
      if (isUntitled(path)) {
        state.active = path;
        if (!state.tabs.includes(path)) state.tabs = [path, ...state.tabs].slice(0, 12);
        renderTabs(); renderBreadcrumb(); renderEditor(); updateStatus();
        return;
      }
      const ext = (path.split(".").pop() || "").toLowerCase();
      state.active = path;
      if (!state.tabs.includes(path)) state.tabs = [path, ...state.tabs].slice(0, 10);
      state.histIdx = state.history.length;
      renderTabs(); renderBreadcrumb();
      if (PREVIEW.includes(ext)) { renderEditor(); updateStatus(); return; }
      if (state.docs[path]) { renderEditor(); updateStatus(); return; }
      try {
        let doc;
        if (state.source === "repo") doc = await API.repoFile(state.repo, path);
        else if (state.source === "storage") {
          const p = path.split("/");
          doc = await API.request("/storage/file?profile=" + enc(state.storageProfile) + "&kind=" + enc(p[0]) + "&name=" + enc(p.slice(1).join("/")));
          if (doc.binary) throw Object.assign(new Error("binario"), { status: 415 });
          if (!doc.lines) doc.lines = (doc.content || "").split("\n").length;
        } else doc = await API.file(path);
        state.docs[path] = doc;
        if (state.active === path) { renderEditor(); updateStatus(); }
        renderTree();
        if (window.ExtHost) ExtHost.emit("activeEditor", { path: path, language: langFor(path), name: docName(path) });
      } catch (err) {
        UI.toast("err", T("ide.cantOpen"), err.message);
        state.tabs = state.tabs.filter((p) => p !== path); state.active = state.tabs[0] || null;
        renderAll();
      }
    }

    async function save() {
      if (!state.active || !codeTA) return;
      if (isUntitled(state.active)) { saveAs(); return; }
      if (state.source !== "workspace") { UI.toast("warn", T("ide.readOnly")); return; }
      try {
        const result = await API.saveFile(state.active, codeTA.value);
        state.docs[state.active].content = codeTA.value; delete state.dirty[state.active];
        updateStatus(); renderTabs(); renderTree();
        UI.toast("ok", T("ide.saved"), state.active);
        sig("save", state.active);
        if (window.ExtHost) ExtHost.emit("saved", { path: state.active });
      } catch (err) { UI.toast("err", T("ide.notSaved"), err.message); sig("taskFailed", err.message); }
    }
    async function saveAll() { for (const p of Object.keys(state.dirty)) { state.active = p; renderEditor(); await save(); } }
    function saveAs() {
      if (!state.active || !codeTA) return;
      const untitled = isUntitled(state.active);
      const lang = langFor(state.active);
      const input = UI.el("input", {
        type: "text", "aria-label": T("ide.fileName"),
        value: untitled ? docName(state.active).toLowerCase() + "." + langExt(lang) : state.active
      });
      const langSel = UI.el("select", { class: "vsc-select", "aria-label": T("ide.language"), style: { width: "100%" } },
        LANGS.map((l) => UI.el("option", { value: l[0], selected: l[0] === lang, text: l[1] + " (" + l[0] + ")" })));
      const field = (label, control) => UI.el("label", { class: "stack", style: { gap: "4px" } }, [
        UI.el("span", { class: "muted", style: { fontSize: "11.5px" }, text: label }), control
      ]);
      const ref = UI.modal({
        title: T("ide.saveAs"),
        body: UI.el("div", { class: "stack" }, [field(T("ide.fileName"), input), field(T("ide.language"), langSel)]),
        footer: [
          UI.btn(t("common.cancel"), () => ref.close(), { ghost: true }),
          UI.btn(t("common.save"), async () => {
            let name = input.value.trim(); if (!name) return;
            if (!name.includes(".")) name += "." + langExt(langSel.value);
            try {
              await API.saveFile(name, codeTA.value);
              const old = state.active;
              state.langMode[name] = langSel.value;
              if (untitled) {
                state.tabs = state.tabs.map((p) => p === old ? name : p);
                delete state.docs[old]; delete state.dirty[old]; delete state.langMode[old];
              }
              delete state.dirty[name];
              ref.close();
              UI.toast("ok", T("ide.saved"), name);
              sig("save", name);
              state.active = null;
              await loadTree();
              openFile(name);
            } catch (err) { UI.toast("err", T("ide.notSaved"), err.message); }
          }, { primary: true })
        ]
      });
      setTimeout(() => { input.focus(); input.select(); }, 50);
    }
    /* «New File…» de VS Code: elegir tipo o escribir un nombre. */
    function newFileQuickPick() {
      const favs = ["plaintext", "python", "javascript", "typescript", "html", "css", "json", "markdown", "shell", "sql", "go", "rust", "java", "csharp", "cpp"];
      const items = [
        { id: "__text", label: T("ide.textFile"), description: T("ide.builtIn"), keybinding: "Ctrl+N", detail: T("ide.file"),
          icon: window.Icons ? Icons.file("file.txt", 15) : null },
        { id: "__notebook", label: T("ide.notebook"), description: T("ide.notebookSupport"), detail: T("ide.soon"), soon: true, disabled: true },
        { separator: true, label: T("ide.language") }
      ];
      favs.forEach((id) => {
        const l = LANGS.find((x) => x[0] === id);
        if (!l || id === "plaintext") return;
        items.push({ id: l[0], label: l[1], description: "(" + l[0] + ")", icon: window.Icons ? Icons.file("file." + l[2], 15) : null });
      });
      quickPick({
        title: T("ide.newFile"),
        placeholder: T("ide.selectFileType"),
        items,
        onEnter: (value, item) => {
          const name = value.trim();
          if (!name) return false;
          /* Con nombre escrito se crea el archivo real en el workspace. */
          if (item && item.id === name) return false;
          createNamedFile(name, item && !String(item.id).startsWith("__") ? item.id : null);
          return true;
        },
        onPick: (item) => {
          if (item.id === "__text") newUntitled("plaintext");
          else newUntitled(item.id);
        }
      });
    }

    /** Crea un archivo sin guardar (Untitled-N), como VS Code. */
    function newUntitled(lang) {
      state.untitledCount += 1;
      const name = "Untitled-" + state.untitledCount;
      const path = "untitled:" + name;
      state.docs[path] = { content: "", lines: 1, untitled: true, name: name };
      state.langMode[path] = lang || "plaintext";
      state.dirty[path] = true;
      state.tabs = [path, ...state.tabs].slice(0, 12);
      state.active = path;
      state.welcome = false;
      renderAll();
      if (codeTA) codeTA.focus();
      say(T("ide.untitledCreated") + " " + name + " · " + langLabel(state.langMode[path]));
    }

    /** Crea un archivo con nombre en el workspace (o sin título si no hay). */
    async function createNamedFile(name, lang) {
      const chosen = lang || EXT2LANG[(name.split(".").pop() || "").toLowerCase()] || "plaintext";
      if (state.source !== "workspace") { newUntitled(chosen); return; }
      let final = name;
      if (!final.includes(".")) final += "." + langExt(chosen);
      try {
        await API.saveFile(final, "");
        state.langMode[final] = chosen;
        state.opened = true;
        await loadTree();
        openFile(final);
        sig("open", final);
      } catch (err) { UI.toast("err", T("ide.notSaved"), err.message); }
    }

    function newFileModal(ext) {
      const input = UI.el("input", { type: "text", placeholder: "archivo" + (ext || "") });
      const langSel = UI.el("select", { class: "vsc-select", style: { width: "100%" } },
        LANGS.map((l) => UI.el("option", { value: l[0], text: l[1] + " (." + l[2] + ")" })));
      langSel.value = ext ? (EXT2LANG[ext.replace(".", "")] || "plaintext") : "plaintext";
      const field = (label, control) => UI.el("label", { class: "stack", style: { gap: "4px" } }, [
        UI.el("span", { class: "muted", style: { fontSize: "11.5px" }, text: label }), control
      ]);
      const ref = UI.modal({
        title: T("ide.newFile"),
        body: UI.el("div", { class: "stack" }, [field(T("ide.fileName"), input), field(T("ide.language"), langSel)]),
        footer: [
          UI.btn(t("common.cancel"), () => ref.close(), { ghost: true }),
          UI.btn(T("ide.create"), async () => {
            let name = input.value.trim(); if (!name) return;
            const lang = langSel.value;
            if (!name.includes(".")) name += "." + langExt(lang);
            await API.saveFile(name, "");
            state.langMode[name] = lang;
            ref.close(); state.opened = true; state.source = "workspace";
            await loadTree(); openFile(name);
          }, { primary: true })
        ]
      });
      setTimeout(() => input.focus(), 50);
    }

    /* ---------------------------------------------------------- editor cmds */
    function editorCmd(c) { if (!codeTA) return; codeTA.focus(); document.execCommand(c); codeTA.dispatchEvent(new Event("input")); }
    async function pasteClip() { if (!codeTA) return; try { const txt = await navigator.clipboard.readText(); const s = codeTA.selectionStart; codeTA.setRangeText(txt, s, codeTA.selectionEnd, "end"); codeTA.dispatchEvent(new Event("input")); } catch (e) { soon(); } }
    function findInFile() { if (!codeTA) return; const q = prompt(T("ide.find")); if (!q) return; const idx = codeTA.value.indexOf(q); if (idx >= 0) { codeTA.focus(); codeTA.setSelectionRange(idx, idx + q.length); } else UI.toast("warn", T("ide.noResults")); }
    function replaceInFile() { if (!codeTA) return; const q = prompt(T("ide.find")); if (!q) return; const r = prompt(T("ide.replace")); if (r == null) return; codeTA.value = codeTA.value.split(q).join(r); codeTA.dispatchEvent(new Event("input")); }
    function toggleComment() {
      if (!codeTA) return;
      const ext = (state.active.split(".").pop() || "").toLowerCase();
      const ch = ["py", "sh", "rb", "yaml", "yml"].includes(ext) ? "#" : "//";
      const s = codeTA.selectionStart, e = codeTA.selectionEnd;
      const start = codeTA.value.lastIndexOf("\n", s - 1) + 1;
      const end = codeTA.value.indexOf("\n", e); const stop = end === -1 ? codeTA.value.length : end;
      const block = codeTA.value.slice(start, stop);
      const lines = block.split("\n");
      const allCommented = lines.every((l) => l.trim().startsWith(ch) || !l.trim());
      const out = lines.map((l) => !l.trim() ? l : (allCommented ? l.replace(new RegExp("^(\\s*)" + ch + " ?"), "$1") : l.replace(/^(\s*)/, "$1" + ch + " "))).join("\n");
      codeTA.setRangeText(out, start, stop, "end"); codeTA.dispatchEvent(new Event("input"));
    }
    function lineOp(op) {
      if (!codeTA) return;
      const v = codeTA.value, s = codeTA.selectionStart;
      const ls = v.lastIndexOf("\n", s - 1) + 1; let le = v.indexOf("\n", s); if (le === -1) le = v.length;
      const line = v.slice(ls, le);
      if (op === "copyDown") codeTA.setRangeText(line + "\n" + line, ls, le, "end");
      else if (op === "copyUp") codeTA.setRangeText(line + "\n" + line, ls, le, "end");
      else if (op === "dup") codeTA.setRangeText(line + "\n" + line, ls, le, "end");
      else if (op === "moveUp" && ls > 0) { const ps = v.lastIndexOf("\n", ls - 2) + 1; const prev = v.slice(ps, ls - 1); codeTA.setRangeText(line + "\n" + prev, ps, le, "end"); }
      else if (op === "moveDown" && le < v.length) { const ns = le + 1; let ne = v.indexOf("\n", ns); if (ne === -1) ne = v.length; const next = v.slice(ns, ne); codeTA.setRangeText(next + "\n" + line, ls, ne, "end"); }
      codeTA.dispatchEvent(new Event("input"));
    }
    /* Transformaciones de texto (frontend puro, catálogo 075-100 / 301-320). */
    function transform(op) {
      if (!codeTA) return;
      const v = codeTA.value, s = codeTA.selectionStart, e = codeTA.selectionEnd;
      const hasSel = e > s;
      const ls = v.lastIndexOf("\n", s - 1) + 1; let le = v.indexOf("\n", e); if (le === -1) le = v.length;
      const sel = hasSel ? v.slice(s, e) : v.slice(ls, le);
      const put = (txt, a, b) => { codeTA.setRangeText(txt, a, b, "end"); codeTA.dispatchEvent(new Event("input")); };
      const lines = sel.split("\n");
      switch (op) {
        case "upper": put(sel.toUpperCase(), hasSel ? s : ls, hasSel ? e : le); break;
        case "lower": put(sel.toLowerCase(), hasSel ? s : ls, hasSel ? e : le); break;
        case "sortLines": put(lines.slice().sort().join("\n"), hasSel ? s : ls, hasSel ? e : le); break;
        case "joinLines": put(lines.map((l) => l.trim()).join(" "), hasSel ? s : ls, hasSel ? e : le); break;
        case "trimTrailing": put(v.split("\n").map((l) => l.replace(/\s+$/, "")).join("\n"), 0, v.length); break;
        case "finalNewline": if (!v.endsWith("\n")) put(v + "\n", 0, v.length); break;
        case "dedupeLines": put([...new Set(lines)].join("\n"), hasSel ? s : ls, hasSel ? e : le); break;
        case "removeBlank": put(lines.filter((l) => l.trim()).join("\n"), hasSel ? s : ls, hasSel ? e : le); break;
        case "tabsToSpaces": put(v.replace(/\t/g, "  "), 0, v.length); break;
        case "spacesToTabs": put(v.replace(/^ {2}/gm, "\t"), 0, v.length); break;
        case "deleteLine": put("", ls, Math.min(le + 1, v.length)); break;
        case "lineBefore": put("\n", ls, ls); break;
        case "lineAfter": put("\n", le, le); break;
        case "delToStart": put("", ls, s); break;
        case "delToEnd": put("", s, le); break;
        case "indent": put(lines.map((l) => "  " + l).join("\n"), hasSel ? s : ls, hasSel ? e : le); break;
        case "outdent": put(lines.map((l) => l.replace(/^ {2}/, "")).join("\n"), hasSel ? s : ls, hasSel ? e : le); break;
        case "selectWord": { const a = v.slice(0, s).search(/[\w$]*$/); const m = v.slice(s).match(/^[\w$]*/); codeTA.setSelectionRange(s - (v.slice(0, s).match(/[\w$]*$/) || [""])[0].length, s + (m ? m[0].length : 0)); break; }
        case "selectLine": codeTA.setSelectionRange(ls, le); break;
        case "transposeChars": if (s > 0) put(v[s] + v[s - 1], s - 1, s + 1); break;
        default: break;
      }
      codeTA.focus();
    }
    function goToLine() { if (!codeTA) return; const n = parseInt(prompt(T("ide.goToLine")), 10); if (!n) return; const lines = codeTA.value.split("\n"); let pos = 0; for (let i = 0; i < Math.min(n - 1, lines.length); i++) pos += lines[i].length + 1; codeTA.focus(); codeTA.setSelectionRange(pos, pos); }
    function tabHistory(dir) { const i = state.tabs.indexOf(state.active); const n = state.tabs[i + dir]; if (n) openFile(n); }

    /* ---------------------------------------------------------- paletas */
    function quickOpen() {
      const tree = state.tree; if (!tree) { soon(); return; }
      const files = (tree.entries || []).filter((e) => e.type === "file");
      const input = UI.el("input", { type: "text", placeholder: T("ide.goToFile") });
      const list = UI.el("div", { class: "vsc-tree", style: { maxHeight: "300px" } });
      const draw = (q) => { UI.clear(list); files.filter((f) => f.path.toLowerCase().includes(q.toLowerCase())).slice(0, 40).forEach((f) => { const n = UI.el("div", { class: "vsc-tree-item" }, [window.Icons ? Icons.file(f.path) : null, UI.el("span", { class: "trunc", text: f.path })]); n.addEventListener("click", () => { ref.close(); state.source = "workspace"; state.projectRoot = null; openFile(f.path); }); list.appendChild(n); }); };
      input.addEventListener("input", () => draw(input.value));
      const ref = UI.modal({ title: T("ide.goToFile"), body: UI.el("div", { class: "stack" }, [input, list]) });
      draw(""); setTimeout(() => input.focus(), 50);
    }
    /* Vuelve a mostrar la página de bienvenida sin cerrar las pestañas. */
    function showWelcome() {
      state.welcome = true;
      state.active = null;
      localStorage.setItem("ely.ideWelcome", "1");
      renderAll();
      say(T("ide.welcomeTab"));
    }

    function showAbout() {
      const summary = window.Engine ? Engine.summary() : {};
      UI.modal({
        title: T("ide.about"),
        subtitle: "Ely IDE",
        body: UI.el("dl", { class: "kv" }, [
          UI.el("dt", { text: T("ide.aboutVersion") }),
          UI.el("dd", { text: (window.App && App.version) || "0.9.0" }),
          UI.el("dt", { text: T("ide.aboutLanguages") }),
          UI.el("dd", { text: String(LANGS.length) }),
          UI.el("dt", { text: T("ide.aboutExtensions") }),
          UI.el("dd", { text: String((window.ExtHost && ExtHost.state.extensions || []).length) }),
          UI.el("dt", { text: T("set.profile") }),
          UI.el("dd", { text: summary.profile ? summary.profile.label : "—" }),
          UI.el("dt", { text: T("set.model") }),
          UI.el("dd", { class: "mono", text: summary.model || "—" })
        ])
      });
    }

    function commandPalette() {
      const cmds = [
        [T("ide.openFolder"), openFolderFromComputer], [T("ide.openFile"), openFromComputer],
        [T("ide.newProject"), createProjectModal], [T("ide.terminal"), () => openPanel("terminal")],
        [T("ide.search"), () => setActivity("search")], [T("ide.wordWrap"), toggleWrap],
        [T("ide.save"), save], [T("ide.goToFile"), quickOpen], [T("ide.selectLanguage"), selectLanguage],
        [T("cmp.toggleHint"), () => { if (window.Completion) { Completion.setEnabled(!Completion.enabled()); updateStatus(); UI.toast("ok", Completion.enabled() ? T("cmp.on") : T("cmp.off")); } }],
        [T("ext.openManager"), () => App.navigate("extensions")],
        [T("ide.welcomeTab"), showWelcome],
        [T("ide.about"), showAbout]
      ];
      /* Comandos aportados por extensiones (permiso "commands"). */
      if (window.ExtHost) {
        ExtHost.commandList().forEach((cmd) => {
          cmds.push([cmd.title + "  ·  " + cmd.source, () => ExtHost.execute(cmd.id)]);
        });
      }
      const list = UI.el("div", { class: "vsc-tree" });
      cmds.forEach(([label, fn]) => { const n = UI.el("div", { class: "vsc-tree-item", text: label }); n.addEventListener("click", () => { ref.close(); fn(); }); list.appendChild(n); });
      const ref = UI.modal({ title: T("ide.commandPalette"), body: list });
    }

    /* ---------------------------------------------------------- abrir desde ordenador */
    function readB64(file) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1] || ""); r.onerror = rej; r.readAsDataURL(file); }); }
    function openFromComputer() {
      const input = UI.el("input", { type: "file", multiple: true, style: { display: "none" } });
      document.body.appendChild(input);
      input.addEventListener("change", async () => {
        const files = Array.from(input.files || []); input.remove();
        if (!files.length) return;
        for (const f of files) { try { await API.uploadWorkspace(f.name, await readB64(f)); } catch (e) { UI.toast("err", T("ide.notSaved"), e.message); } }
        state.opened = true; state.source = "workspace"; state.projectRoot = null;
        renderAll(); await loadTree(); openFile(files[0].name);
      });
      input.click();
    }
    function openFolderFromComputer() {
      const input = UI.el("input", { type: "file", webkitdirectory: "", multiple: true, style: { display: "none" } });
      document.body.appendChild(input);
      input.addEventListener("change", async () => {
        let files = Array.from(input.files || []); input.remove();
        files = files.filter((f) => { const p = f.webkitRelativePath || f.name; return !/(^|\/)(node_modules|\.git|dist|build|__pycache__)\//.test(p); }).slice(0, 300);
        if (!files.length) return;
        const rootName = (files[0].webkitRelativePath || files[0].name).split("/")[0];
        UI.toast("ok", T("ide.loadingFolder"), rootName);
        for (const f of files) { const rel = f.webkitRelativePath || f.name; try { await API.uploadWorkspace(rel, await readB64(f)); } catch (e) { /* ignora archivo individual */ } }
        pushRecent(rootName);
        state.opened = true; state.source = "workspace"; state.projectRoot = rootName; state.openDirs = new Set();
        renderAll(); await loadTree();
      });
      input.click();
    }
    function openProjectRoot(name) { state.opened = true; state.source = "workspace"; state.projectRoot = name; state.openDirs = new Set(); renderAll(); loadTree(); }

    function openStorageModal() {
      const profile = state.storageProfile || App.profileId();
      const body = UI.el("div", { class: "stack" }); body.appendChild(UI.loading(T("common.loading")));
      const ref = UI.modal({ title: T("ide.openStorage"), wide: true, body, footer: [UI.btn(t("common.close"), () => ref.close(), { ghost: true })] });
      API.request("/storage/tree?profile=" + enc(profile)).then((tree) => {
        UI.clear(body);
        const entries = (tree.entries || []).filter((e) => e.type !== "dir");
        if (!entries.length) { body.appendChild(UI.el("div", { class: "muted", text: T("ide.emptyWorkspace") })); return; }
        const list = UI.el("div", { class: "vsc-tree" });
        entries.forEach((entry) => {
          const node = UI.el("div", { class: "vsc-tree-item" }, [window.Icons ? Icons.file(entry.path) : null, UI.el("span", { class: "trunc", text: entry.path }), UI.el("span", { class: "muted", style: { marginLeft: "auto", fontSize: "10px" }, text: UI.bytes(entry.size) })]);
          node.addEventListener("click", () => { ref.close(); state.opened = true; state.source = "storage"; state.storageProfile = profile; state.projectRoot = null; sourceSelect.value = "storage"; renderAll(); loadStorageTree(); openFile(entry.path); });
          list.appendChild(node);
        });
        body.appendChild(list);
      }).catch((e) => { UI.clear(body); body.appendChild(UI.errBox(e)); });
    }

    function createProjectModal() {
      const nameInput = UI.el("input", { type: "text", placeholder: "mi-proyecto" });
      const templateSelect = UI.el("select", {}, [UI.el("option", { value: "blank", text: T("ide.tplBlank") }), UI.el("option", { value: "web", text: T("ide.tplWeb") }), UI.el("option", { value: "python", text: T("ide.tplPython") }), UI.el("option", { value: "node", text: T("ide.tplNode") })]);
      const field = (label, control) => UI.el("label", { class: "stack", style: { gap: "4px" } }, [UI.el("span", { class: "muted", style: { fontSize: "11.5px" }, text: label }), control]);
      const ref = UI.modal({ title: T("ide.newProject"), body: UI.el("div", { class: "stack" }, [field(T("ide.projectName"), nameInput), field(T("ide.template"), templateSelect)]), footer: [
        UI.btn(t("common.cancel"), () => ref.close(), { ghost: true }),
        UI.btn(T("ide.create"), async () => {
          const name = nameInput.value.trim(); if (!name) return;
          try { const result = await API.createProject(name, templateSelect.value); ref.close(); UI.toast("ok", T("ide.projectCreated"), result.path); pushRecent(name); state.opened = true; state.source = "workspace"; state.projectRoot = name; renderAll(); await loadTree(); openFile(name + "/README.md"); }
          catch (e) { UI.toast("err", T("ide.notSaved"), e.message); }
        }, { primary: true })
      ] });
      setTimeout(() => nameInput.focus(), 60);
    }

    function closeProject() { state.opened = false; state.projectRoot = null; state.tabs = []; state.docs = {}; state.active = null; state.tree = null; renderAll(); }
    function runActive() {
      if (!state.active) { UI.toast("warn", T("ide.openFirst")); return; }
      const ext = (state.active.split(".").pop() || "").toLowerCase();
      const cmd = ext === "py" ? "python3 " + state.active : (ext === "js" ? "node " + state.active : null);
      openPanel("terminal");
      if (!cmd) { UI.toast("warn", T("ide.runSoon")); return; }
      setTimeout(() => runTerm(cmd, { textContent: promptText() }), 60);
    }

    function renderAll() { renderTabs(); renderBreadcrumb(); renderEditor(); updateStatus(); renderSidebar(); renderPanel(); }

    /* --------------------------------------------- extensiones: adaptador */
    if (window.ExtHost) {
      ExtHost.setEditor({
        getActiveFile: () => state.active ? {
          path: state.active, name: docName(state.active),
          language: langFor(state.active), untitled: isUntitled(state.active),
          dirty: !!state.dirty[state.active]
        } : null,
        getText: () => codeTA ? codeTA.value : ((state.docs[state.active] || {}).content || ""),
        getSelection: () => codeTA ? {
          start: codeTA.selectionStart, end: codeTA.selectionEnd,
          text: codeTA.value.slice(codeTA.selectionStart, codeTA.selectionEnd)
        } : null,
        insertText: (text) => {
          if (!codeTA) return;
          const pos = codeTA.selectionStart;
          codeTA.setRangeText(text, pos, codeTA.selectionEnd, "end");
          codeTA.dispatchEvent(new Event("input", { bubbles: true }));
        },
        replaceSelection: (text) => {
          if (!codeTA) return;
          codeTA.setRangeText(text, codeTA.selectionStart, codeTA.selectionEnd, "end");
          codeTA.dispatchEvent(new Event("input", { bubbles: true }));
        }
      });
      const offExt = ExtHost.subscribe((s, reason) => {
        if (!document.body.contains(root)) { offExt(); return; }
        if (reason === "status" || reason === "activated") updateStatus();
      });
    }

    /* ---------------------------------------------------------- accesibilidad */
    if (window.A11y) {
      activity.setAttribute("role", "toolbar");
      activity.setAttribute("aria-label", T("ide.activityBar"));
      activity.setAttribute("aria-orientation", "vertical");
      A11y.menu(activity, { selector: ".vsc-act-btn", role: "toolbar" });
      sidebar.setAttribute("role", "complementary");
      editorArea.setAttribute("role", "region");
      editorArea.setAttribute("aria-label", T("ide.editor"));
      editorPane.id = "a11y-editor";

      A11y.registerView("editor-line", {
        label: T("ide.currentLine"),
        available: () => !!codeTA,
        get: () => {
          const info = A11y.lineInfo(codeTA);
          return { title: T("ide.currentLine") + " " + info.line, text: info.text || T("ide.emptyLine") };
        }
      });
      A11y.registerView("editor-file", {
        label: T("ide.wholeFile"),
        available: () => !!state.active,
        get: () => ({
          title: docName(state.active) + " · " + langLabel(langFor(state.active)),
          text: codeTA ? codeTA.value : ((state.docs[state.active] || {}).content || "")
        })
      });
      A11y.registerView("terminal", {
        label: T("ide.terminalOutput"),
        available: () => !!(termOut && termOut.textContent.trim()),
        get: () => ({ title: T("ide.terminalOutput"), text: termOut.textContent })
      });
      A11y.registerView("explorer", {
        label: T("ide.explorer"),
        available: () => !!fileList.textContent.trim(),
        get: () => ({
          title: T("ide.explorer"),
          text: Array.from(fileList.querySelectorAll("[data-tree-item]")).map((n) =>
            "  ".repeat(Number(n.dataset.depth || 0)) + (n.dataset.type === "dir" ? "🗀 " : "") + docName(n.dataset.path)
          ).join("\n")
        })
      });
    }

    /* ---------------------------------------------------------- init + atajos */
    buildMenus();
    renderAll();
    loadRepos();
    document.addEventListener("keydown", function shortcuts(e) {
      if (App.route !== "ide") return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && (k === "j" || e.key === "ñ" || e.key === "Ñ")) { e.preventDefault(); togglePanel("terminal"); return; }
      if (mod && k === "s") { e.preventDefault(); save(); return; }
      if (mod && k === "p" && !e.shiftKey) { e.preventDefault(); quickOpen(); return; }
      if (mod && e.shiftKey && k === "p") { e.preventDefault(); commandPalette(); return; }
      if (mod && k === "b") { e.preventDefault(); toggleLayout("sidebar"); return; }
      if (mod && k === "o") { e.preventDefault(); openFromComputer(); return; }
      if (mod && k === "g") { e.preventDefault(); goToLine(); return; }
      if (e.altKey && k === "z") { e.preventDefault(); toggleWrap(); return; }
      if (mod && k === "n" && !e.shiftKey) { e.preventDefault(); newUntitled("plaintext"); return; }
      if (mod && e.shiftKey && k === "s") { e.preventDefault(); saveAs(); return; }
      if (mod && k === "i") { e.preventDefault(); if (window.ChatWidget) ChatWidget.open(); else App.navigate("chat"); return; }
      /* Ctrl+K M · seleccionar modo de lenguaje (acorde de VS Code). */
      if (mod && k === "k") {
        e.preventDefault();
        const once = (ev2) => {
          document.removeEventListener("keydown", once, true);
          if (ev2.key.toLowerCase() === "m") { ev2.preventDefault(); selectLanguage(); }
          if (ev2.key.toLowerCase() === "o") { ev2.preventDefault(); openFolderFromComputer(); }
        };
        document.addEventListener("keydown", once, true);
        setTimeout(() => document.removeEventListener("keydown", once, true), 1600);
        say(T("ide.chordWaiting"));
        return;
      }
    });

    return root;
  };
})();
