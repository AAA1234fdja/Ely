/* IDE · interfaz tipo VS Code: barra de menús, activity bar, explorador con
 * iconos Material, pestañas, editor con resaltado de sintaxis y barra de estado.
 * File permite abrir desde el ordenador, desde Local Storage (modal centrado)
 * y crear proyectos. Conserva la lógica de orígenes workspace/repo/storage.
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
  const RICH_EXT = ["pdf", "html", "htm", "tex", "latex", "png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico", "md", "csv"];

  window.Views.ide = function (view, App) {
    const T = (k) => t(k);
    const state = {
      source: ["repo", "storage"].includes(localStorage.getItem("ely.ideSource")) ? localStorage.getItem("ely.ideSource") : "workspace",
      repo: localStorage.getItem("ely.ideRepo") || null,
      repos: [], repoTree: null,
      storageProfile: localStorage.getItem("ely.ideStorageProfile") || null,
      storageTree: null, tree: null,
      tabs: [],
      active: null,
      docs: {}, dirty: {},
      activity: "explorer",
      /* Sin proyecto predeterminado: hay que cargarlo explícitamente. */
      opened: false
    };

    /* Abre (carga) un proyecto/origen. Hasta que no se llama, el IDE muestra
       el estado «Ninguna carpeta abierta», como VS Code. */
    function loadProject(source) {
      state.opened = true;
      state.source = source;
      localStorage.setItem("ely.ideSource", source);
      sourceSelect.value = source;
      state.tabs = []; state.docs = {}; state.active = null;
      renderAll();
      reloadSource();
    }

    function closeProject() {
      state.opened = false;
      state.tabs = []; state.docs = {}; state.active = null;
      state.tree = null; state.repoTree = null; state.storageTree = null;
      Store.set({ ideTabs: [], ideFile: null });
      renderAll();
    }

    /* ---------------------------------------------------------- layout */
    const root = UI.el("div", { class: "vsc" });
    const menubar = UI.el("div", { class: "vsc-menubar" });
    const body = UI.el("div", { class: "vsc-body" });
    const activity = UI.el("div", { class: "vsc-activity" });
    const sidebar = UI.el("div", { class: "vsc-sidebar" });
    const editorArea = UI.el("div", { class: "vsc-editor-area" });
    const statusbar = UI.el("div", { class: "vsc-statusbar" });
    body.appendChild(activity);
    body.appendChild(sidebar);
    body.appendChild(editorArea);
    root.appendChild(menubar);
    root.appendChild(body);
    root.appendChild(statusbar);

    /* ---------------------------------------------------------- menubar */
    function menu(label, items) {
      const btn = UI.el("button", { class: "vsc-menu-btn", text: label });
      const drop = UI.el("div", { class: "vsc-dropdown" });
      items.forEach((it) => {
        if (it === "-") { drop.appendChild(UI.el("div", { class: "vsc-sep" })); return; }
        const row = UI.el("button", { class: "vsc-dropdown-item" }, [
          UI.el("span", { text: it.label }),
          it.key ? UI.el("span", { class: "vsc-key", text: it.key }) : null
        ]);
        row.addEventListener("click", () => { drop.classList.remove("open"); it.action(); });
        drop.appendChild(row);
      });
      const wrap = UI.el("div", { class: "vsc-menu" }, [btn, drop]);
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        document.querySelectorAll(".vsc-dropdown.open").forEach((d) => d.classList.remove("open"));
        drop.classList.toggle("open");
      });
      return wrap;
    }
    document.addEventListener("pointerdown", (e) => {
      if (!e.target.closest(".vsc-menu")) document.querySelectorAll(".vsc-dropdown.open").forEach((d) => d.classList.remove("open"));
    });

    menubar.appendChild(UI.el("span", { class: "vsc-logo", text: "◈" }));
    menubar.appendChild(menu(T("ide.file"), [
      { label: T("ide.openFolder"), action: () => loadProject("workspace") },
      { label: T("ide.openComputer"), action: openFromComputer },
      { label: T("ide.openStorage"), action: openStorageModal },
      "-",
      { label: T("ide.newProject"), action: createProjectModal },
      "-",
      { label: T("ide.save"), key: "Ctrl+S", action: save },
      "-",
      { label: T("ide.closeFolder"), action: closeProject },
      { label: T("ide.closeEditor"), action: () => { state.active = null; state.tabs = []; renderAll(); } }
    ]));
    menubar.appendChild(menu(T("ide.edit"), [
      { label: T("ide.undo"), key: "Ctrl+Z", action: () => document.execCommand("undo") },
      { label: T("ide.redo"), key: "Ctrl+Y", action: () => document.execCommand("redo") }
    ]));
    menubar.appendChild(menu(T("ide.view"), [
      { label: T("ide.explorer"), action: () => setActivity("explorer") },
      { label: T("ide.search"), action: () => setActivity("search") }
    ]));
    menubar.appendChild(menu(T("ide.run"), [
      { label: T("ide.runFile"), action: runActive }
    ]));

    /* ---------------------------------------------------------- activity bar */
    const ACT = [
      ["explorer", "🗀", T("ide.explorer")],
      ["search", "⌕", T("ide.search")],
      ["scm", "⑂", T("ide.scm")],
      ["run", "▶", T("ide.runDebug")],
      ["extensions", "⧉", T("ide.extensions")]
    ];
    ACT.forEach(([id, icon, label]) => {
      const b = UI.el("button", { class: "vsc-act-btn" + (state.activity === id ? " on" : ""), title: label, html: icon });
      b.addEventListener("click", () => setActivity(id));
      activity.appendChild(b);
    });
    activity.appendChild(UI.el("div", { style: { flex: "1" } }));
    activity.appendChild(UI.el("button", { class: "vsc-act-btn", title: T("nav.settings"), html: "⚙", onclick: () => App.navigate("settings") }));

    function setActivity(id) {
      state.activity = id;
      activity.querySelectorAll(".vsc-act-btn").forEach((b, i) => b.classList.toggle("on", ACT[i] && ACT[i][0] === id));
      renderSidebar();
    }

    /* ---------------------------------------------------------- sidebar */
    function renderSidebar() {
      UI.clear(sidebar);
      if (state.activity === "explorer") return renderExplorer();
      if (state.activity === "search") return renderSearch();
      const titles = { scm: T("ide.scm"), run: T("ide.runDebug"), extensions: T("ide.extensions") };
      sidebar.appendChild(UI.el("div", { class: "vsc-side-title", text: (titles[state.activity] || "").toUpperCase() }));
      const msgs = {
        scm: T("ide.scmEmpty"),
        run: T("ide.runEmpty"),
        extensions: T("ide.extEmpty")
      };
      sidebar.appendChild(UI.el("div", { class: "vsc-side-empty", text: msgs[state.activity] || "" }));
    }

    /* ---- Explorer ---- */
    const sourceSelect = UI.el("select", {
      class: "vsc-select",
      onchange: (e) => {
        state.source = e.target.value;
        localStorage.setItem("ely.ideSource", state.source);
        state.tabs = []; state.docs = {}; state.active = null;
        renderAll();
        if (state.source === "repo") loadRepoTree();
        else if (state.source === "storage") loadStorageTree();
        else loadTree();
      }
    }, [
      UI.el("option", { value: "workspace", selected: state.source === "workspace", text: "Workspace" }),
      UI.el("option", { value: "repo", selected: state.source === "repo", text: "Repo" }),
      UI.el("option", { value: "storage", selected: state.source === "storage", text: "Local Storage" })
    ]);
    const storageSelect = UI.el("select", { class: "vsc-select", style: { display: state.source === "storage" ? "" : "none" } });
    storageSelect.addEventListener("change", (e) => {
      state.storageProfile = e.target.value || null;
      localStorage.setItem("ely.ideStorageProfile", state.storageProfile || "");
      state.storageTree = null; state.tabs = []; state.docs = {}; state.active = null;
      renderAll(); loadStorageTree();
    });
    const repoSelect = UI.el("select", { class: "vsc-select", style: { display: state.source === "repo" ? "" : "none" } });
    repoSelect.addEventListener("change", (e) => {
      state.repo = e.target.value || null;
      localStorage.setItem("ely.ideRepo", state.repo || "");
      state.repoTree = null; state.tabs = []; state.docs = {}; state.active = null;
      renderAll(); loadRepoTree();
    });

    const fileList = UI.el("div", { class: "vsc-tree" });

    function renderExplorer() {
      sidebar.appendChild(UI.el("div", { class: "vsc-side-title", text: T("ide.explorer").toUpperCase() }));

      /* Sin proyecto cargado: estado «Ninguna carpeta abierta» (como VS Code). */
      if (!state.opened) {
        sidebar.appendChild(UI.el("div", { class: "vsc-nofolder" }, [
          UI.el("div", { class: "vsc-nofolder-title", text: T("ide.noFolder") }),
          UI.el("div", { class: "vsc-side-empty", text: T("ide.noFolderHint") }),
          UI.el("div", { class: "vsc-side-actions" }, [
            UI.el("button", { class: "vsc-side-btn", text: T("ide.openFolder"), onclick: () => loadProject("workspace") }),
            UI.el("button", { class: "vsc-side-btn ghost", text: T("ide.openStorage"), onclick: openStorageModal }),
            UI.el("button", { class: "vsc-side-btn ghost", text: T("ide.newProject"), onclick: createProjectModal })
          ])
        ]));
        return;
      }

      repoSelect.style.display = state.source === "repo" ? "" : "none";
      storageSelect.style.display = state.source === "storage" ? "" : "none";
      const controls = UI.el("div", { class: "vsc-side-controls" }, [
        sourceSelect, repoSelect, storageSelect,
        UI.el("button", { class: "icon-btn", html: "⟳", title: T("common.refresh"), onclick: () => reloadSource() })
      ]);
      sidebar.appendChild(controls);
      sidebar.appendChild(fileList);
      renderTree();
    }

    function renderSearch() {
      sidebar.appendChild(UI.el("div", { class: "vsc-side-title", text: T("ide.search").toUpperCase() }));
      const input = UI.el("input", { class: "vsc-search-input", placeholder: T("ide.searchPlaceholder") });
      const results = UI.el("div", { class: "vsc-tree" });
      sidebar.appendChild(UI.el("div", { style: { padding: "8px" } }, [input]));
      sidebar.appendChild(results);
      let timer = null;
      input.addEventListener("input", () => {
        clearTimeout(timer);
        timer = setTimeout(async () => {
          const q = input.value.trim();
          UI.clear(results);
          if (q.length < 2) return;
          results.appendChild(UI.loading(T("common.loading")));
          try {
            const data = await API.searchWorkspace(q);
            UI.clear(results);
            const hits = (data.matches || []).slice(0, 60);
            if (!hits.length) { results.appendChild(UI.el("div", { class: "vsc-side-empty", text: T("ide.noResults") })); return; }
            hits.forEach((h) => {
              const node = UI.el("div", { class: "vsc-tree-item", title: h.text }, [
                window.Icons ? Icons.file(h.path) : UI.el("span", { text: "•" }),
                UI.el("span", { class: "trunc", text: h.path.split("/").pop() }),
                UI.el("span", { class: "muted", style: { fontSize: "10px", flex: "none" }, text: ":" + h.line })
              ]);
              node.addEventListener("click", () => { state.source = "workspace"; sourceSelect.value = "workspace"; openFile(h.path); });
              results.appendChild(node);
            });
          } catch (e) { UI.clear(results); results.appendChild(UI.errBox(e)); }
        }, 300);
      });
    }

    /* ---------------------------------------------------------- árbol */
    function renderTree() {
      UI.clear(fileList);
      const tree = state.source === "repo" ? state.repoTree : state.source === "storage" ? state.storageTree : state.tree;
      if (!tree) { fileList.appendChild(UI.loading(T("common.loading"))); return; }
      const entries = tree.entries || [];
      const openDirs = state.source === "storage" ? new Set(["generado", "planeado"]) : new Set(["CLI", "IDE", "IDE/frontend", "IDE/frontend/js", "profiles"]);
      entries.forEach((entry) => {
        const depth = entry.path.split("/").length - 1;
        const parent = entry.path.split("/").slice(0, -1).join("/");
        if (depth > 0 && !openDirs.has(parent)) return;
        if (entry.type === "dir" && depth > 2) return;
        if (entry.type === "dir") {
          const node = UI.el("div", { class: "vsc-tree-item" }, [
            UI.el("span", { class: "vsc-caret", text: openDirs.has(entry.path) ? "▾" : "▸" }),
            window.Icons ? Icons.folder(openDirs.has(entry.path)) : null,
            UI.el("span", { class: "trunc", text: entry.path.split("/").pop() })
          ]);
          node.style.paddingLeft = (6 + depth * 12) + "px";
          node.addEventListener("click", () => { openDirs.has(entry.path) ? openDirs.delete(entry.path) : openDirs.add(entry.path); renderTree(); });
          fileList.appendChild(node);
          return;
        }
        const node = UI.el("div", { class: "vsc-tree-item" + (entry.path === state.active ? " on" : "") }, [
          window.Icons ? Icons.file(entry.path) : UI.el("span", { text: "•" }),
          UI.el("span", { class: "trunc", text: entry.path.split("/").pop() }),
          state.dirty[entry.path] ? UI.el("span", { class: "dotm" }) : null
        ]);
        node.style.paddingLeft = (6 + depth * 12) + "px";
        node.title = entry.path;
        node.addEventListener("click", () => openFile(entry.path));
        fileList.appendChild(node);
      });
      if (!entries.length) fileList.appendChild(UI.el("div", { class: "vsc-side-empty", text: T("ide.emptyWorkspace") }));
    }

    function reloadSource() {
      if (state.source === "repo") loadRepoTree();
      else if (state.source === "storage") loadStorageTree();
      else loadTree();
    }
    async function loadTree() { try { state.tree = await API.tree(5); renderTree(); updateStatus(); } catch (e) { UI.clear(fileList); fileList.appendChild(UI.errBox(e, loadTree)); } }
    async function loadRepoTree() {
      if (!state.repo) { state.repoTree = { entries: [] }; renderTree(); return; }
      try { state.repoTree = await API.repoTree(state.repo, 3); renderTree(); } catch (e) { UI.clear(fileList); fileList.appendChild(UI.errBox(e, loadRepoTree)); }
    }
    async function loadStorageTree() {
      renderStorageOptions();
      if (!state.storageProfile) { state.storageTree = { entries: [] }; renderTree(); return; }
      try { state.storageTree = await API.request("/storage/tree?profile=" + encodeURIComponent(state.storageProfile)); renderTree(); }
      catch (e) { UI.clear(fileList); fileList.appendChild(UI.errBox(e, loadStorageTree)); }
    }
    function renderStorageOptions() {
      UI.clear(storageSelect);
      const profiles = App.profiles || [];
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
    async function loadRepos() {
      /* Solo prepara la lista de repos; no abre ningún proyecto por defecto. */
      try { const d = await API.repos(); state.repos = d.repos || []; renderRepoOptions(); }
      catch (e) { state.repos = []; renderRepoOptions(); }
    }

    /* ---------------------------------------------------------- editor */
    const tabsBar = UI.el("div", { class: "vsc-tabs" });
    const breadcrumb = UI.el("div", { class: "vsc-breadcrumb" });
    const editorPane = UI.el("div", { class: "vsc-editor-pane" });
    editorArea.appendChild(tabsBar);
    editorArea.appendChild(breadcrumb);
    editorArea.appendChild(editorPane);

    function renderTabs() {
      UI.clear(tabsBar);
      state.tabs.forEach((path) => {
        const tab = UI.el("div", { class: "vsc-tab" + (path === state.active ? " on" : ""), title: path }, [
          window.Icons ? Icons.file(path, 14) : null,
          UI.el("span", { text: path.split("/").pop() }),
          state.dirty[path] ? UI.el("span", { class: "dotm" }) : null,
          UI.el("span", {
            class: "vsc-tab-close", text: "×",
            onclick: (e) => {
              e.stopPropagation();
              state.tabs = state.tabs.filter((p) => p !== path);
              delete state.dirty[path];
              Store.set({ ideTabs: state.tabs });
              if (state.active === path) state.active = state.tabs[0] || null;
              renderAll();
              if (state.active) openFile(state.active, true);
            }
          })
        ]);
        tab.addEventListener("click", () => openFile(path));
        tabsBar.appendChild(tab);
      });
    }

    function renderBreadcrumb() {
      UI.clear(breadcrumb);
      if (!state.active) return;
      const parts = state.active.split("/");
      parts.forEach((p, i) => {
        breadcrumb.appendChild(UI.el("span", { class: "vsc-crumb", text: p }));
        if (i < parts.length - 1) breadcrumb.appendChild(UI.el("span", { class: "vsc-crumb-sep", text: "›" }));
      });
    }

    /* Editor con resaltado: <pre> coloreado detrás de un textarea transparente. */
    let codeTA = null, codeHL = null, gutterInner = null;
    function renderEditor() {
      UI.clear(editorPane);
      if (!state.active) { renderWelcome(); return; }
      const doc = state.docs[state.active];
      const lang = (state.active.split(".").pop() || "").toLowerCase();

      const wrap = UI.el("div", { class: "code-wrap" });
      const gutter = UI.el("div", { class: "code-gutter" });
      gutterInner = UI.el("div", { class: "code-gutter-inner", text: "1" });
      gutter.appendChild(gutterInner);
      const hl = UI.el("pre", { class: "code-hl" });
      codeHL = UI.el("code", { class: "code-hl-inner" });
      hl.appendChild(codeHL);
      codeTA = UI.el("textarea", { class: "code-ta", spellcheck: "false", wrap: "off" });
      codeTA.value = doc ? doc.content : "";
      wrap.appendChild(gutter);
      wrap.appendChild(hl);
      wrap.appendChild(codeTA);
      editorPane.appendChild(wrap);

      function paint() {
        const text = codeTA.value;
        codeHL.innerHTML = (window.Syntax ? Syntax.highlight(text, lang) : text.replace(/&/g, "&amp;").replace(/</g, "&lt;")) + "\n";
        const lines = text.split("\n").length;
        gutterInner.textContent = Array.from({ length: lines }, (_, i) => i + 1).join("\n");
      }
      function sync() {
        const st = codeTA.scrollTop, sl = codeTA.scrollLeft;
        codeHL.style.transform = "translate(" + (-sl) + "px," + (-st) + "px)";
        gutterInner.style.transform = "translateY(" + (-st) + "px)";
      }
      codeTA.addEventListener("input", () => {
        if (!state.active) return;
        state.dirty[state.active] = true;
        paint(); updateStatus(); renderTabs();
      });
      codeTA.addEventListener("scroll", sync);
      codeTA.addEventListener("keydown", (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") { e.preventDefault(); save(); }
        if (e.key === "Tab") {
          e.preventDefault();
          const s = codeTA.selectionStart;
          codeTA.setRangeText("  ", s, codeTA.selectionEnd, "end");
          codeTA.dispatchEvent(new Event("input"));
        }
      });
      paint(); sync();
    }

    function renderWelcome() {
      const welcome = UI.el("div", { class: "vsc-welcome" }, [
        UI.el("div", { class: "vsc-welcome-logo", text: "◈" }),
        UI.el("h2", { text: "Ely IDE" }),
        UI.el("p", { class: "muted", text: T("ide.welcome") }),
        UI.el("div", { class: "vsc-welcome-actions" }, [
          UI.el("button", { class: "vsc-welcome-btn", text: T("ide.openFolder"), onclick: () => { loadProject("workspace"); setActivity("explorer"); } }),
          UI.el("button", { class: "vsc-welcome-btn", text: T("ide.openStorage"), onclick: openStorageModal }),
          UI.el("button", { class: "vsc-welcome-btn", text: T("ide.newProject"), onclick: createProjectModal })
        ])
      ]);
      editorPane.appendChild(welcome);
    }

    /* ---------------------------------------------------------- estado */
    function updateStatus() {
      UI.clear(statusbar);
      const ext = (state.active || "").split(".").pop();
      const doc = state.docs[state.active];
      statusbar.appendChild(UI.el("span", { class: "vsc-sb-item", text: "⑂ main" }));
      statusbar.appendChild(UI.el("span", { class: "vsc-sb-item", text: "⊗ 0  ⚠ 0" }));
      statusbar.appendChild(UI.el("div", { style: { flex: "1" } }));
      if (doc) {
        statusbar.appendChild(UI.el("span", { class: "vsc-sb-item", text: "Ln " + (doc.lines || 1) + ", Col 1" }));
        statusbar.appendChild(UI.el("span", { class: "vsc-sb-item", text: T("ide.spaces") + ": 2" }));
        statusbar.appendChild(UI.el("span", { class: "vsc-sb-item", text: "UTF-8" }));
        statusbar.appendChild(UI.el("span", { class: "vsc-sb-item", text: "LF" }));
        statusbar.appendChild(UI.el("span", { class: "vsc-sb-item", text: "{} " + (LANG[ext] || ext || "text") }));
      }
      statusbar.appendChild(UI.el("span", { class: "vsc-sb-item", text: state.dirty[state.active] ? "●" : "" }));
    }

    /* ---------------------------------------------------------- abrir/guardar */
    async function openFile(path, force) {
      if (!path) return;
      const ext = (path.split(".").pop() || "").toLowerCase();
      if (RICH_EXT.includes(ext) && window.FileViewer) {
        if (state.source === "storage") { const p = path.split("/"); FileViewer.openStorage(state.storageProfile, p[0], p.slice(1).join("/")); }
        else if (state.source === "repo") FileViewer.openWorkspace(".ely/repos/" + state.repo + "/" + path);
        else FileViewer.openWorkspace(path);
        return;
      }
      state.active = path;
      Store.set({ ideFile: path });
      if (!state.tabs.includes(path)) state.tabs = [path, ...state.tabs].slice(0, 8);
      Store.set({ ideTabs: state.tabs });
      renderTabs(); renderBreadcrumb();
      if (state.docs[path]) { renderEditor(); updateStatus(); return; }
      try {
        let doc;
        if (state.source === "repo") doc = await API.repoFile(state.repo, path);
        else if (state.source === "storage") {
          const p = path.split("/");
          doc = await API.request("/storage/file?profile=" + encodeURIComponent(state.storageProfile) + "&kind=" + encodeURIComponent(p[0]) + "&name=" + encodeURIComponent(p.slice(1).join("/")));
          if (doc.binary) throw Object.assign(new Error("binario"), { status: 415 });
          if (!doc.lines) doc.lines = (doc.content || "").split("\n").length;
        } else doc = await API.file(path);
        state.docs[path] = doc;
        if (state.active === path) { renderEditor(); updateStatus(); }
        renderTree();
      } catch (err) {
        UI.toast("err", T("ide.cantOpen"), err.message);
        state.tabs = state.tabs.filter((p) => p !== path);
        state.active = state.tabs[0] || null;
        renderAll();
      }
    }

    async function save() {
      if (!state.active || !codeTA) return;
      if (state.source !== "workspace") { UI.toast("warn", T("ide.readOnly")); return; }
      try {
        const result = await API.saveFile(state.active, codeTA.value);
        state.docs[state.active].content = codeTA.value;
        delete state.dirty[state.active];
        updateStatus(); renderTabs(); renderTree();
        UI.toast("ok", T("ide.saved"), state.active);
      } catch (err) { UI.toast("err", T("ide.notSaved"), err.message); }
    }

    function runActive() {
      if (!state.active) { UI.toast("warn", T("ide.openFirst")); return; }
      UI.toast("warn", T("ide.runSoon"));
    }

    /* ---------------------------------------------------------- File: acciones */
    function openFromComputer() {
      const input = UI.el("input", { type: "file", multiple: true, style: { display: "none" } });
      document.body.appendChild(input);
      input.addEventListener("change", async () => {
        const files = Array.from(input.files || []);
        for (const file of files) {
          try {
            const text = await file.text();
            await API.saveFile(file.name, text);
            UI.toast("ok", T("ide.uploaded"), file.name);
          } catch (e) { UI.toast("err", T("ide.notSaved"), e.message); }
        }
        input.remove();
        if (!files.length) return;
        state.opened = true;
        state.source = "workspace"; sourceSelect.value = "workspace";
        localStorage.setItem("ely.ideSource", "workspace");
        renderAll();
        loadTree();
      });
      input.click();
    }

    function openStorageModal() {
      const profile = state.storageProfile || App.profileId();
      const body = UI.el("div", { class: "stack" });
      body.appendChild(UI.loading(T("common.loading")));
      const ref = UI.modal({ title: T("ide.openStorage"), wide: true, body, footer: [UI.btn(t("common.close"), () => ref.close(), { ghost: true })] });
      API.request("/storage/tree?profile=" + encodeURIComponent(profile)).then((tree) => {
        UI.clear(body);
        const entries = (tree.entries || []).filter((e) => e.type !== "dir");
        if (!entries.length) { body.appendChild(UI.el("div", { class: "muted", text: T("ide.emptyWorkspace") })); return; }
        const list = UI.el("div", { class: "vsc-tree" });
        entries.forEach((entry) => {
          const node = UI.el("div", { class: "vsc-tree-item" }, [
            window.Icons ? Icons.file(entry.path) : null,
            UI.el("span", { class: "trunc", text: entry.path }),
            UI.el("span", { class: "muted", style: { marginLeft: "auto", fontSize: "10px" }, text: UI.bytes(entry.size) })
          ]);
          node.addEventListener("click", () => {
            ref.close();
            state.opened = true;
            state.source = "storage"; state.storageProfile = profile;
            sourceSelect.value = "storage";
            localStorage.setItem("ely.ideSource", "storage");
            renderAll();
            loadStorageTree();
            openFile(entry.path);
          });
          list.appendChild(node);
        });
        body.appendChild(list);
      }).catch((e) => { UI.clear(body); body.appendChild(UI.errBox(e)); });
    }

    function createProjectModal() {
      const nameInput = UI.el("input", { type: "text", placeholder: "mi-proyecto" });
      const templateSelect = UI.el("select", {}, [
        UI.el("option", { value: "blank", text: T("ide.tplBlank") }),
        UI.el("option", { value: "web", text: T("ide.tplWeb") }),
        UI.el("option", { value: "python", text: T("ide.tplPython") }),
        UI.el("option", { value: "node", text: T("ide.tplNode") })
      ]);
      const field = (label, control) => UI.el("label", { class: "stack", style: { gap: "4px" } }, [
        UI.el("span", { class: "muted", style: { fontSize: "11.5px" }, text: label }), control
      ]);
      const ref = UI.modal({
        title: T("ide.newProject"),
        body: UI.el("div", { class: "stack" }, [
          field(T("ide.projectName"), nameInput),
          field(T("ide.template"), templateSelect)
        ]),
        footer: [
          UI.btn(t("common.cancel"), () => ref.close(), { ghost: true }),
          UI.btn(T("ide.create"), async () => {
            const name = nameInput.value.trim();
            if (!name) return;
            try {
              const result = await API.createProject(name, templateSelect.value);
              ref.close();
              UI.toast("ok", T("ide.projectCreated"), result.path);
              state.opened = true;
              state.source = "workspace"; sourceSelect.value = "workspace";
              localStorage.setItem("ely.ideSource", "workspace");
              renderAll();
              await loadTree();
              openFile(result.path + "/README.md");
            } catch (e) { UI.toast("err", T("ide.notSaved"), e.message); }
          }, { primary: true })
        ]
      });
      setTimeout(() => nameInput.focus(), 60);
    }

    /* ---------------------------------------------------------- render all */
    function renderAll() { renderTabs(); renderBreadcrumb(); renderEditor(); updateStatus(); renderSidebar(); }

    /* ---------------------------------------------------------- init */
    /* No se carga ningún proyecto por defecto: el IDE arranca en el estado
       «Ninguna carpeta abierta» y hay que abrir/crear uno explícitamente. */
    renderAll();
    loadRepos().then(() => {
      /* Única excepción: un archivo pedido explícitamente desde Repos/Búsqueda
         (handoff). Eso sí cuenta como cargar un proyecto. */
      const pending = localStorage.getItem("ely.ideOpenPath");
      if (pending) {
        localStorage.removeItem("ely.ideOpenPath");
        state.opened = true;
        state.source = "repo"; localStorage.setItem("ely.ideSource", "repo");
        sourceSelect.value = "repo";
        renderAll();
        loadRepoTree();
        openFile(pending.replace(/^\//, ""));
      }
    });

    document.addEventListener("keydown", function shortcuts(e) {
      if (App.route !== "ide") return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") { e.preventDefault(); save(); }
    });

    return root;
  };
})();
