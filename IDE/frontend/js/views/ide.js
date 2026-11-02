/* IDE: editor real del workspace + asistente con contexto del archivo. */
(function () {
  "use strict";

  window.Views = window.Views || {};

  const LANG = {
    py: "Python", js: "JavaScript", mjs: "JavaScript", ts: "TypeScript", json: "JSON",
    md: "Markdown", css: "CSS", html: "HTML", sh: "Shell", yml: "YAML", yaml: "YAML",
    toml: "TOML", rs: "Rust", go: "Go", sql: "SQL", txt: "Texto", env: "Env"
  };

  window.Views.ide = function (view, App) {
    const state = {
      source: localStorage.getItem("ely.ideSource") === "repo" ? "repo" : "workspace",
      repo: localStorage.getItem("ely.ideRepo") || null,
      repos: [],
      repoTree: null,
      tree: null,
      tabs: (Store.get("ideTabs") || []).slice(0, 8),
      active: Store.get("ideFile") || "README.md",
      docs: {},
      dirty: {},
      chat: []
    };
    if (!state.tabs.length) state.tabs = ["README.md"];

    const wrapper = UI.el("div", { style: { display: "flex", flexDirection: "column", flex: "1", minHeight: 0 } });
    wrapper.appendChild(UI.head("IDE", "Editor de código con IA", []));
    const root = UI.el("div", { class: "ide", style: { flex: "1", minHeight: 0 } });
    wrapper.appendChild(root);
    const filesCol = UI.el("div", { class: "ide-files" });
    const mainCol = UI.el("div", { class: "ide-main" });
    const chatCol = UI.el("div", { class: "ide-chat" });
    root.appendChild(filesCol);
    root.appendChild(mainCol);
    root.appendChild(chatCol);

    /* ---------------------------------------------------------------- archivos */
    const sourceSelect = UI.el("select", {
      style: { height: "22px", minHeight: "22px", fontSize: "10px", padding: "0 4px", maxWidth: "128px" },
      title: "Origen de los archivos",
      onchange: (event) => {
        state.source = event.target.value;
        localStorage.setItem("ely.ideSource", state.source);
        renderTree();
      }
    }, [
      UI.el("option", { value: "workspace", selected: state.source === "workspace", text: "Workspace" }),
      UI.el("option", { value: "repo", selected: state.source === "repo", text: "Repo" })
    ]);

    const repoSelect = UI.el("select", {
      style: { height: "22px", minHeight: "22px", fontSize: "10px", padding: "0 4px", maxWidth: "128px" },
      title: "Repositorio importado",
      onchange: (event) => {
        state.repo = event.target.value || null;
        state.repoTree = null;
        localStorage.setItem("ely.ideRepo", state.repo || "");
        state.tabs = [];
        state.docs = {};
        state.active = null;
        renderTabs();
        renderActions();
        renderTree();
        loadRepoTree();
      }
    });

    const fileHead = UI.el("div", { class: "head", style: { flexWrap: "wrap", gap: "4px" } }, [
      sourceSelect,
      repoSelect,
      UI.el("button", {
        class: "btn ghost sm", style: { marginLeft: "auto", padding: "0 6px" },
        html: "⟳", title: "Recargar árbol",
        onclick: () => { if (state.source === "repo") loadRepoTree(); else loadTree(); }
      })
    ]);
    const fileList = UI.el("div", { class: "list" });
    filesCol.appendChild(fileHead);
    filesCol.appendChild(fileList);

    function renderRepoOptions() {
      UI.clear(repoSelect);
      if (!state.repos.length) {
        repoSelect.appendChild(UI.el("option", { value: "", text: "sin repos" }));
        repoSelect.disabled = true;
        return;
      }
      repoSelect.disabled = false;
      if (!state.repo || !state.repos.some((r) => r.slug === state.repo)) {
        state.repo = state.repos[0].slug;
        localStorage.setItem("ely.ideRepo", state.repo);
      }
      state.repos.forEach((repo) => {
        repoSelect.appendChild(UI.el("option", {
          value: repo.slug, selected: repo.slug === state.repo,
          text: repo.label
        }));
      });
    }

    async function loadRepos() {
      try {
        const data = await API.repos();
        state.repos = data.repos || [];
        renderRepoOptions();
        if (state.source === "repo") loadRepoTree();
      } catch (err) {
        state.repos = [];
        renderRepoOptions();
      }
    }

    async function loadRepoTree() {
      if (!state.repo) {
        state.repoTree = { entries: [] };
        renderTree();
        return;
      }
      try {
        const data = await API.repoTree(state.repo, 3);
        state.repoTree = data;
        renderTree();
      } catch (err) {
        UI.clear(fileList);
        fileList.appendChild(UI.errBox(err, loadRepoTree));
      }
    }

    function renderTree() {
      UI.clear(fileList);
      const tree = state.source === "repo" ? state.repoTree : state.tree;
      if (state.source === "repo" && !state.repos.length) {
        fileList.appendChild(UI.el("div", { class: "empty", style: { padding: "18px 10px" } }, [
          UI.el("div", { class: "big", text: "◫" }),
          UI.el("div", { text: "Sin repositorios importados" }),
          UI.btn("Importar uno", () => App.navigate("repos"), { small: true, primary: true })
        ]));
        return;
      }
      if (!tree) {
        fileList.appendChild(UI.loading("Leyendo…"));
        return;
      }
      const entries = tree.entries || [];

      /* Directorios desplegados por defecto según el origen. */
      const openDirs = state.source === "repo"
        ? new Set(["src", "src/vs", "src/vs/editor", "src/vs/workbench", "extensions", "cli"])
        : new Set(["CLI", "IDE", "IDE/frontend", "IDE/frontend/js", "IDE/frontend/js/views",
                   "profiles", "Harness", "MCPs"]);

      entries.forEach((entry) => {
        const depth = entry.path.split("/").length - 1;
        const parent = entry.path.split("/").slice(0, -1).join("/");
        if (depth > 0 && !openDirs.has(parent)) return;
        if (entry.type === "dir" && depth > (state.source === "repo" ? 2 : 2)) return;
        if (entry.type === "dir") {
          const node = UI.el("div", { class: "file-item" }, [
            UI.el("span", { style: { opacity: 0.6 }, text: "▸" }),
            UI.el("span", { text: entry.path.split("/").pop() })
          ]);
          node.style.paddingLeft = (6 + depth * 12) + "px";
          node.addEventListener("click", () => {
            if (openDirs.has(entry.path)) openDirs.delete(entry.path);
            else openDirs.add(entry.path);
            renderTree();
          });
          fileList.appendChild(node);
          return;
        }
        const ext = entry.ext || "txt";
        const node = UI.el("div", { class: "file-item" + (entry.path === state.active ? " on" : "") }, [
          UI.el("span", { class: "ext", text: (LANG[ext] || ext).slice(0, 3).toUpperCase() }),
          UI.el("span", { class: "trunc", text: entry.path.split("/").pop() }),
          state.dirty[entry.path] ? UI.el("span", { class: "dotm", style: { marginLeft: "auto" } }) : null
        ]);
        node.style.paddingLeft = (6 + depth * 12) + "px";
        node.title = entry.path + " · " + UI.bytes(entry.size);
        node.addEventListener("click", () => openFile(entry.path));
        fileList.appendChild(node);
      });
      if (!entries.length) fileList.appendChild(UI.empty("◫", "Workspace vacío"));
    }

    async function loadTree() {
      try {
        state.tree = await API.tree(3);
        renderTree();
        updateStatus();
      } catch (err) {
        UI.clear(fileList);
        fileList.appendChild(UI.errBox(err, loadTree));
      }
    }

    /* ---------------------------------------------------------------- editor */
    const tabsBar = UI.el("div", { class: "ide-tabs" });
    const editorWrap = UI.el("div", { class: "editor" });
    const gutter = UI.el("div", { class: "gutter", text: "1" });
    const area = UI.el("textarea", { spellcheck: "false", placeholder: "Abre un archivo del árbol…", wrap: "off" });
    editorWrap.appendChild(gutter);
    editorWrap.appendChild(area);
    const status = UI.el("div", { class: "ide-status" });
    const actions = UI.el("div", { class: "row", style: { padding: "8px 12px", borderBottom: "1px solid var(--border)" } });
    mainCol.appendChild(tabsBar);
    mainCol.appendChild(actions);
    mainCol.appendChild(editorWrap);
    mainCol.appendChild(status);

    function renderTabs() {
      UI.clear(tabsBar);
      state.tabs.forEach((path) => {
        const tab = UI.el("div", {
          class: "ide-tab" + (path === state.active ? " on" : ""),
          title: path
        }, [
          state.dirty[path] ? UI.el("span", { class: "dotm" }) : null,
          UI.el("span", { text: path.split("/").pop() })
        ]);
        tab.addEventListener("click", () => openFile(path));
        const close = UI.el("span", {
          class: "muted", style: { marginLeft: "4px", cursor: "pointer" }, text: "×",
          onclick: (event) => {
            event.stopPropagation();
            const askClose = !window.Settings || Settings.get("confirmClose");
            if (state.dirty[path] && askClose && !confirm("Hay cambios sin guardar en " + path + ". ¿Cerrar igualmente?")) return;
            state.tabs = state.tabs.filter((p) => p !== path);
            delete state.dirty[path];
            Store.set({ ideTabs: state.tabs });
            if (state.active === path) state.active = state.tabs[0] || null;
            if (state.active) openFile(state.active, true);
            else renderTabs();
          }
        });
        tab.appendChild(close);
        tabsBar.appendChild(tab);
      });
    }

    function renderActions() {
      UI.clear(actions);
      const active = state.active;
      actions.appendChild(UI.el("span", { class: "mono muted", style: { fontSize: "11.5px" }, text: active || "—" }));
      actions.appendChild(UI.el("div", { style: { flex: "1" } }));
      actions.appendChild(UI.btn("Guardar", save, { small: true, primary: true, disabled: !active }));
      actions.appendChild(UI.btn("Recargar", () => openFile(active, true), { small: true, ghost: true, disabled: !active }));
      actions.appendChild(UI.btn("Enviar a la IA", sendToAgent, { small: true, icon: "✦", disabled: !active }));
    }

    function updateGutter() {
      const lines = area.value.split("\n").length;
      if (gutter.dataset.lines == lines) return;
      gutter.dataset.lines = lines;
      gutter.textContent = Array.from({ length: lines }, (_, i) => i + 1).join("\n");
    }

    function updateStatus() {
      UI.clear(status);
      const doc = state.docs[state.active];
      const ext = (state.active || "").split(".").pop();
      status.appendChild(UI.el("span", { text: LANG[ext] || ext || "texto" }));
      status.appendChild(UI.el("span", { text: "UTF-8" }));
      if (doc) {
        status.appendChild(UI.el("span", { text: doc.lines + " líneas" }));
        status.appendChild(UI.el("span", { text: UI.bytes(doc.size) }));
      }
      status.appendChild(UI.el("span", { text: state.dirty[state.active] ? "sin guardar" : "guardado" }));
      const scopeLabel = state.source === "repo"
        ? (state.repo || "repositorio") + " · " + (state.tree ? state.tree.counts.files : 0) + " archivos"
        : "workspace real · " + (state.tree ? state.tree.counts.files : 0) + " archivos";
      status.appendChild(UI.el("span", { style: { marginLeft: "auto" }, text: scopeLabel }));
    }

    async function openFile(path, force) {
      if (!path) return;
      if (state.dirty[state.active] && state.active !== path && !force) {
        const askOpen = !window.Settings || Settings.get("confirmClose");
        if (askOpen && !confirm("Cambios sin guardar en " + state.active + ". ¿Descartar?")) return;
        delete state.dirty[state.active];
      }
      state.active = path;
      Store.set({ ideFile: path });
      if (!state.tabs.includes(path)) state.tabs = [path, ...state.tabs].slice(0, 8);
      Store.set({ ideTabs: state.tabs });
      renderTabs();
      renderActions();
      if (state.docs[path]) {
        area.value = state.docs[path].content;
        updateGutter();
        updateStatus();
        return;
      }
      area.value = "…";
      try {
        const doc = state.source === "repo"
          ? await API.repoFile(state.repo, path)
          : await API.file(path);
        state.docs[path] = doc;
        if (state.active === path) {
          area.value = doc.content;
          updateGutter();
          updateStatus();
        }
        renderTree();
      } catch (err) {
        area.value = "";
        area.placeholder = "No se pudo abrir " + path + ": " + err.message;
        UI.toast("err", "No se pudo abrir", err.message);
        if (err.status === 415 || err.status === 404) {
          state.tabs = state.tabs.filter((p) => p !== path);
          state.active = state.tabs[0] || null;
          renderTabs();
          renderActions();
        }
      }
    }

    async function save() {
      if (!state.active) return;
      if (state.source === "repo") {
        UI.toast("warn", "Repositorio de solo lectura",
          "Los repositorios importados se guardan en .ely/repos como referencia; edita el workspace local.");
        return;
      }
      UI.clear(status).appendChild(UI.el("span", { text: "guardando…" }));
      try {
        const result = await API.saveFile(state.active, area.value);
        state.docs[state.active].content = area.value;
        state.docs[state.active].size = result.size;
        delete state.dirty[state.active];
        updateStatus();
        renderTabs();
        renderTree();
        UI.toast("ok", "Guardado", state.active + " · " + UI.bytes(result.size));
      } catch (err) {
        updateStatus();
        UI.toast("err", "No se guardó", err.message);
      }
    }

    area.addEventListener("input", () => {
      if (!state.active) return;
      state.dirty[state.active] = true;
      updateGutter();
      updateStatus();
      renderTabs();
    });
    area.addEventListener("scroll", () => { gutter.scrollTop = area.scrollTop; });
    area.addEventListener("keydown", (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        save();
      }
      if (event.key === "Tab") {
        event.preventDefault();
        const start = area.selectionStart;
        area.setRangeText("  ", start, area.selectionEnd, "end");
        area.dispatchEvent(new Event("input"));
      }
    });

    /* ---------------------------------------------------------------- chat lateral */
    const chatHead = UI.el("div", { class: "chat-head", style: { padding: "10px 12px" } }, [
      UI.el("b", { style: { fontSize: "12.5px" }, text: "Asistente del archivo" }),
      UI.el("div", { style: { flex: "1" } }),
      App.agent() ? UI.badge(App.agent().name, "accent") : null
    ]);
    const chatLog = UI.el("div", { class: "log" });
    const chatForm = UI.el("div", { class: "composer", style: { padding: "8px" } });
    const chatInput = UI.el("textarea", { rows: 2, placeholder: "Pide un cambio sobre el archivo abierto…" });
    const chatSend = UI.btn("Enviar", sendToAgent, { small: true, primary: true });
    chatForm.appendChild(chatInput);
    chatForm.appendChild(UI.el("div", { class: "row" }, [
      UI.el("span", { class: "muted", style: { fontSize: "10.5px" }, text: "incluye el archivo como contexto" }),
      UI.el("div", { style: { flex: "1" } }),
      chatSend
    ]));
    chatCol.appendChild(chatHead);
    chatCol.appendChild(chatLog);
    chatCol.appendChild(chatForm);
    chatInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); sendToAgent(); }
    });

    function appendChat(role, content, meta) {
      const bubble = UI.el("div", { class: "bubble", html: UI.md(content) });
      UI.bindCopy(bubble);
      const node = UI.el("div", { class: "msg " + (role === "user" ? "user" : ""), style: { maxWidth: "100%" } }, [
        UI.el("div", { class: "avatar", style: { width: "24px", height: "24px", flex: "0 0 24px", fontSize: "11px" }, text: role === "user" ? "TÚ" : (App.agent() ? App.agent().icon : "◈") }),
        UI.el("div", { class: "body" }, [bubble, meta ? UI.el("div", { class: "meta", text: meta }) : null])
      ]);
      chatLog.appendChild(node);
      chatLog.scrollTop = chatLog.scrollHeight;
      return { bubble, node };
    }

    async function sendToAgent() {
      const question = (chatInput.value || "").trim();
      if (!state.active) {
        UI.toast("warn", "Abre un archivo primero");
        return;
      }
      const doc = state.docs[state.active];
      if (!doc) {
        UI.toast("warn", "El archivo aún se está cargando");
        return;
      }
      const prompt = question || "Revisa este archivo y propón mejoras concretas.";
      chatInput.value = "";
      appendChat("user", prompt + "\n\n_archivo: " + state.active + "_");
      const holder = appendChat("assistant", "");
      holder.bubble.innerHTML = '<span class="typing"><i></i><i></i><i></i></span>';
      let acc = "";
      try {
        const result = await LLM.complete(prompt, {
          agent: App.agentId(),
          profile: App.profileId(),
          context: "Archivo " + state.active + ":\n\n```\n" + area.value.slice(0, 12000) + "\n```",
          useMemory: false
        });
        acc = result.text || "(respuesta vacía)";
        holder.bubble.innerHTML = UI.md(acc);
        UI.bindCopy(holder.bubble);
        holder.node.appendChild(UI.el("div", {
          class: "meta",
          text: (result.usage ? result.usage.total_tokens + " tokens · " + UI.ms(result.usage.latency_ms) : "") + " · " + result.model
        }));
      } catch (err) {
        holder.node.classList.add("error");
        holder.bubble.innerHTML = UI.md("**Error:** " + err.message);
      }
      chatLog.scrollTop = chatLog.scrollHeight;
    }

    /* ---------------------------------------------------------------- init */
    renderTabs();
    renderActions();
    renderTree();
    updateGutter();
    updateStatus();
    loadTree();
    loadRepos().then(() => {
      /* archivo solicitado desde la vista de repositorios o búsqueda */
      const pending = localStorage.getItem("ely.ideOpenPath");
      if (pending) {
        localStorage.removeItem("ely.ideOpenPath");
        state.source = "repo";
        localStorage.setItem("ely.ideSource", "repo");
        sourceSelect.value = "repo";
        renderTree();
        openFile(pending.replace(/^\//, ""));
        return;
      }
      if (state.source === "repo" && state.repo) loadRepoTree();
      else if (state.active) openFile(state.active);
    });

    document.addEventListener("keydown", function shortcuts(event) {
      if (App.route !== "ide") return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        save();
      }
    });

    return wrapper;
  };
})();
