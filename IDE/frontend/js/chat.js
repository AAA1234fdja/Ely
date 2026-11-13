/* Vista de chat · usa ChatStore (una sola conversación compartida con el
 * widget flotante, persistida por perfil y proyecto).
 *
 * Cabecera de la barra lateral: «Nueva conversación» y «Nuevo proyecto».
 * Cada conversación se puede renombrar y eliminar; también hay borrado masivo.
 */
(function () {
  "use strict";

  window.Views = window.Views || {};

  window.Views.chat = function (view, App) {
    const S = ChatStore;
    const st = S.state;
    let unsub = null;
    let qualityUpdating = false;
    let selectorMenu = null;
    let selectorButton = null;
    let apiToggle = null;
    let apiOptions = null;
    let apiStatus = null;
    let qualityToggle = null;
    let qualityOptions = null;
    let apiOpen = false;
    let qualityOpen = false;

    const shell = UI.el("div", { class: "chat-shell" });
    const sidebar = UI.el("nav", { class: "chat-sidebar", "aria-label": t("chat.recents") });
    const main = UI.el("div", { class: "chat-main" });
    shell.appendChild(sidebar);
    shell.appendChild(main);
    let sidebarHidden = false;
    try {
      const savedSidebarState = localStorage.getItem("ely.cli.sidebarHidden");
      sidebarHidden = savedSidebarState === "1" || (savedSidebarState === null && window.innerWidth <= 760);
    } catch (e) { /* noop */ }
    const collapseButton = UI.el("button", {
      class: "icon-btn cs-collapse",
      type: "button",
      onclick: () => setSidebarHidden(!sidebarHidden)
    });
    function setSidebarHidden(hidden) {
      sidebarHidden = Boolean(hidden);
      shell.classList.toggle("cli-sidebar-hidden", sidebarHidden);
      const label = t(sidebarHidden ? "chat.expandSidebar" : "chat.collapseSidebar");
      collapseButton.textContent = sidebarHidden ? "›" : "‹";
      collapseButton.title = label;
      collapseButton.setAttribute("aria-label", label);
      collapseButton.setAttribute("aria-expanded", sidebarHidden ? "false" : "true");
      try { localStorage.setItem("ely.cli.sidebarHidden", sidebarHidden ? "1" : "0"); } catch (e) { /* noop */ }
    }
    shell.appendChild(collapseButton);
    setSidebarHidden(sidebarHidden);

    /* ---------------------------------------------------------- sidebar */
    const storageButton = UI.el("button", {
      class: "icon-btn cs-open-storage",
      type: "button",
      html: "◧",
      title: t("chat.openStorage"),
      "aria-label": t("chat.openStorage"),
      onclick: () => App.navigate("storage")
    });
    sidebar.appendChild(UI.el("div", { class: "cs-brand" }, [
      UI.el("span", { class: "cs-logo", "aria-hidden": "true", text: "◈" }),
      UI.el("span", { class: "cs-name", text: "Ely" }),
      UI.el("div", { class: "cs-brand-spacer", style: { flex: "1" } }),
      storageButton
    ]));

    /* Dos acciones arriba: nueva conversación y nuevo proyecto. */
    const newChatBtn = UI.el("button", { class: "cs-new", title: t("chat.new"), "aria-label": t("chat.new"), onclick: () => S.newChat() }, [
      UI.el("span", { "aria-hidden": "true", text: "✎" }), UI.el("span", { text: t("chat.new") })
    ]);
    const newProjBtn = UI.el("button", { class: "cs-new ghost", title: t("chat.newProject"), "aria-label": t("chat.newProject"), onclick: () => createProjectModal() }, [
      UI.el("span", { "aria-hidden": "true", text: "🗀" }), UI.el("span", { text: t("chat.newProject") })
    ]);
    sidebar.appendChild(UI.el("div", { class: "cs-actions" }, [newChatBtn, newProjBtn]));

    /* Selector de proyecto activo. */
    const projectSelect = UI.el("select", {
      class: "cs-project-select", "aria-label": t("chat.project"),
      onchange: (e) => S.setProject(e.target.value)
    });
    const projRow = UI.el("div", { class: "cs-project-row" }, [
      UI.el("span", { "aria-hidden": "true", text: "🗀" }),
      projectSelect,
      UI.el("button", { class: "icon-btn", html: "✎", title: t("chat.renameProject"), "aria-label": t("chat.renameProject"), onclick: renameProjectModal }),
      UI.el("button", { class: "icon-btn", html: "🗑", title: t("chat.deleteProject"), "aria-label": t("chat.deleteProject"), onclick: deleteProjectModal })
    ]);
    sidebar.appendChild(projRow);

    const recentsHead = UI.el("div", { class: "cs-head" }, [
      UI.el("span", { text: t("chat.recents") }),
      UI.el("div", { style: { flex: "1" } }),
      UI.el("button", { class: "cs-clear", text: t("chat.deleteAll"), onclick: deleteAllModal })
    ]);
    const recentsList = UI.el("div", { class: "cs-list", role: "list" });
    const showMore = UI.el("button", { class: "cs-more", text: t("chat.showMore") });
    let showAll = false;
    showMore.addEventListener("click", () => {
      showAll = !showAll;
      showMore.textContent = showAll ? t("chat.showLess") : t("chat.showMore");
      renderRecents();
    });
    sidebar.appendChild(recentsHead);
    sidebar.appendChild(recentsList);
    sidebar.appendChild(showMore);

    /* Ajustes propios de CLI, accesibles desde el pie de su barra lateral. */
    const cliSettingsLabel = t("set.title") + " · CLI";
    const cliSettingsButton = UI.el("button", {
      class: "sidebar-settings-button",
      type: "button",
      title: cliSettingsLabel,
      "aria-label": cliSettingsLabel
    }, [
      UI.el("span", { class: "vsc-codicon codicon-gear", "aria-hidden": "true" }),
      UI.el("span", { class: "sidebar-settings-label", text: cliSettingsLabel })
    ]);
    cliSettingsButton.addEventListener("click", () => Settings.openModal(App, "cli"));
    sidebar.appendChild(UI.el("div", { class: "cs-settings-footer" }, [cliSettingsButton]));

    /* ---------------------------------------------------------- modales */
    function createProjectModal() {
      const input = UI.el("input", { type: "text", placeholder: t("chat.projectNamePh"), "aria-label": t("chat.projectName") });
      const ref = UI.modal({
        title: t("chat.newProject"),
        body: UI.el("div", { class: "stack" }, [
          UI.el("p", { class: "muted", style: { fontSize: "12px" }, text: t("chat.newProjectHint") }), input
        ]),
        footer: [
          UI.btn(t("common.cancel"), () => ref.close(), { ghost: true }),
          UI.btn(t("ide.create"), async () => {
            const name = input.value.trim();
            if (!name) { UI.toast("warn", t("chat.missingName")); return; }
            try { await S.createProject(name); UI.toast("ok", t("chat.projectCreated"), name); }
            catch (e) { UI.toast("err", t("chat.projectFail"), e.message); }
            ref.close();
          }, { primary: true })
        ]
      });
      setTimeout(() => input.focus(), 60);
    }

    function renameProjectModal() {
      const current = st.projects.find((p) => p.id === st.project);
      if (!current) return;
      const input = UI.el("input", { type: "text", value: current.name || "", "aria-label": t("chat.projectName") });
      const ref = UI.modal({
        title: t("chat.renameProject"), body: input,
        footer: [
          UI.btn(t("common.cancel"), () => ref.close(), { ghost: true }),
          UI.btn(t("common.save"), async () => {
            const name = input.value.trim(); if (!name) return;
            try { await S.renameProject(current.id, name); UI.toast("ok", t("chat.renamed")); }
            catch (e) { UI.toast("err", t("chat.projectFail"), e.message); }
            ref.close();
          }, { primary: true })
        ]
      });
      setTimeout(() => { input.focus(); input.select(); }, 60);
    }

    function deleteProjectModal() {
      if (st.project === "general") { UI.toast("warn", t("chat.generalProtected")); return; }
      const ref = UI.modal({
        title: t("chat.deleteProject"),
        body: UI.el("p", { text: t("chat.deleteProjectBody") }),
        footer: [
          UI.btn(t("common.cancel"), () => ref.close(), { ghost: true }),
          UI.btn(t("common.delete"), async () => {
            try { await S.deleteProject(st.project); UI.toast("ok", t("chat.projectDeleted")); }
            catch (e) { UI.toast("err", t("chat.projectFail"), e.message); }
            ref.close();
          }, { danger: true })
        ]
      });
    }

    function renameChatModal(session) {
      const input = UI.el("input", { type: "text", value: session.title || "", maxlength: "70", "aria-label": t("chat.rename") });
      const ref = UI.modal({
        title: t("chat.rename"), body: input,
        footer: [
          UI.btn(t("common.cancel"), () => ref.close(), { ghost: true }),
          UI.btn(t("common.save"), async () => {
            const name = input.value.trim(); if (!name) return;
            await S.renameChat(session.id, name);
            UI.toast("ok", t("chat.renamed"));
            ref.close();
          }, { primary: true })
        ]
      });
      setTimeout(() => { input.focus(); input.select(); }, 60);
    }

    function deleteChatModal(session) {
      const ref = UI.modal({
        title: t("chat.delete"),
        body: UI.el("div", { class: "stack" }, [
          UI.el("p", { text: t("chat.deleteBody") }),
          UI.el("p", { class: "muted mono", style: { fontSize: "12px" }, text: session.title || session.id })
        ]),
        footer: [
          UI.btn(t("common.cancel"), () => ref.close(), { ghost: true }),
          UI.btn(t("common.delete"), async () => {
            await S.deleteChat(session.id);
            UI.toast("ok", t("ls.convDeleted"));
            ref.close();
          }, { danger: true })
        ]
      });
    }

    function deleteAllModal() {
      if (!st.sessions.length) { UI.toast("warn", t("chat.noRecents")); return; }
      const ref = UI.modal({
        title: t("chat.deleteAll"),
        body: UI.el("p", { text: t("chat.deleteAllBody").replace("{n}", String(st.sessions.length)) }),
        footer: [
          UI.btn(t("common.cancel"), () => ref.close(), { ghost: true }),
          UI.btn(t("chat.deleteAll"), async () => {
            await S.deleteAllChats();
            UI.toast("ok", t("chat.allDeleted"));
            ref.close();
          }, { danger: true })
        ]
      });
    }

    /* ---------------------------------------------------------- listas */
    function renderProjects() {
      UI.clear(projectSelect);
      const rows = st.projects.length ? st.projects : [{ id: "general", name: "General" }];
      rows.forEach((p) => projectSelect.appendChild(UI.el("option", {
        value: p.id, selected: p.id === st.project, text: p.name || p.id
      })));
    }

    function renderRecents() {
      UI.clear(recentsList);
      if (!st.sessions.length) {
        recentsList.appendChild(UI.el("div", { class: "cs-empty", text: t("chat.noRecents") }));
        showMore.style.display = "none";
        return;
      }
      const shown = showAll ? st.sessions : st.sessions.slice(0, 12);
      showMore.style.display = st.sessions.length > 12 ? "" : "none";
      shown.forEach((session) => {
        const active = session.id === st.sessionId;
        const item = UI.el("div", {
          class: "cs-item" + (active ? " on" : ""), role: "listitem",
          tabindex: "0", "aria-current": active ? "true" : null, title: session.title
        }, [
          UI.el("span", { class: "trunc", text: session.title || t("chat.untitled") }),
          UI.el("button", {
            class: "icon-btn cs-act", html: "✎", title: t("chat.rename"), "aria-label": t("chat.rename"),
            onclick: (e) => { e.stopPropagation(); renameChatModal(session); }
          }),
          UI.el("button", {
            class: "icon-btn cs-act danger", html: "🗑", title: t("chat.delete"), "aria-label": t("chat.delete"),
            onclick: (e) => { e.stopPropagation(); deleteChatModal(session); }
          })
        ]);
        item.addEventListener("click", () => S.openChat(session.id));
        item.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); S.openChat(session.id); }
          if (e.key === "Delete") { e.preventDefault(); deleteChatModal(session); }
        });
        recentsList.appendChild(item);
      });
    }

    /* ---------------------------------------------------------- mensajes */
    function messageNode(msg) {
      const isUser = msg.role === "user";
      const body = UI.el("div", { class: "body" }, [
        UI.el("div", { class: "who", text: isUser ? t("chat.you") : t("chat.ely") }),
        UI.el("div", { class: "bubble" })
      ]);
      const bubble = body.querySelector(".bubble");
      if (msg.streaming && !msg.content) {
        if (msg.meta && msg.meta.activeTool) {
          bubble.appendChild(UI.el("span", {
            class: "chat-tool-status",
            role: "status",
            text: t("chat.toolRunning") + " · " + msg.meta.activeTool
          }));
        } else {
          bubble.innerHTML = '<span class="typing" aria-label="' + UI.esc(t("chat.thinking")) + '"><i></i><i></i><i></i></span>';
        }
      } else {
        bubble.innerHTML = UI.md(msg.content || "");
        if (msg.streaming && msg.meta && msg.meta.activeTool) {
          bubble.appendChild(UI.el("div", {
            class: "chat-tool-status",
            role: "status",
            text: t("chat.toolRunning") + " · " + msg.meta.activeTool
          }));
        }
      }
      if (msg.error) {
        bubble.appendChild(UI.el("div", {
          class: "mono", role: "alert", style: { marginTop: "8px", color: "var(--red)", fontSize: "11px" },
          text: msg.error
        }));
      } else {
        UI.bindCopy(bubble);
      }
      if (!isUser && msg.meta && msg.meta.qualityReport) {
        const status = msg.meta.quality && msg.meta.quality.status;
        body.appendChild(UI.el("div", {
          class: "chat-quality-report chat-quality-" + (status || "unverified"),
          role: "status", text: msg.meta.qualityReport
        }));
      }
      if (isUser && msg.sent_at) {
        body.appendChild(UI.el("div", { class: "chat-meta" }, [
          UI.el("span", { text: "📤 " + t("chat.sent") + ": " + I18N.fmtDateTime(msg.sent_at) })
        ]));
      } else if (!isUser && msg.meta && (msg.meta.total_ms != null || msg.meta.completed_at)) {
        body.appendChild(UI.el("div", { class: "chat-meta" }, [
          msg.meta.reasoning_ms != null ? UI.el("span", { text: "🧠 " + t("chat.reasoning") + ": " + I18N.fmtDuration(msg.meta.reasoning_ms) }) : null,
          msg.meta.total_ms != null ? UI.el("span", { text: "⏱ " + t("chat.total") + ": " + I18N.fmtDuration(msg.meta.total_ms) }) : null,
          msg.meta.completed_at ? UI.el("span", { text: "📅 " + I18N.fmtDateTime(msg.meta.completed_at) }) : null
        ]));
      }
      const avatar = UI.el("div", { class: "avatar" + (isUser ? "" : " ely"), "aria-hidden": "true", text: isUser ? "TÚ" : "◈" });
      return UI.el("div", { class: "msg " + (isUser ? "user" : "") + (msg.error ? " error" : "") }, [avatar, body]);
    }

    /* ---------------------------------------------------------- main */
    main.appendChild(UI.el("div", { class: "chat-topbar" }, [
      UI.el("span", { class: "muted", style: { fontSize: "12px" }, text: t("chat.ely") }),
      UI.el("div", { style: { flex: "1" } }),
      UI.el("button", {
        class: "chat-minimize", html: "−", title: t("chat.minimize"), "aria-label": t("chat.minimize"),
        onclick: () => {
          App.navigate(App.routeBeforeChat && App.routeBeforeChat !== "chat" ? App.routeBeforeChat : "dashboard");
          /* Tras el render de la otra ruta: onRoute ya cerró el widget. */
          setTimeout(() => { if (window.ChatWidget) ChatWidget.open(); }, 0);
        }
      })
    ]));

    const content = UI.el("div", { class: "chat-content" });
    main.appendChild(content);

    /* ---------------------------------------------------------- composer */
    const composer = UI.el("div", { class: "chat-composer" });
    const autoOption = UI.el("button", {
      class: "cc-selector-choice cc-selector-auto active", type: "button", role: "menuitemradio", "aria-checked": "true",
      onclick: () => closeSelectorMenu()
    }, [
      UI.el("span", { class: "cc-selector-check", "aria-hidden": "true", text: "✓" }),
      UI.el("span", { class: "cc-selector-copy" }, [
        UI.el("span", { class: "cc-selector-title", text: "Automático" }),
        UI.el("span", { class: "cc-selector-subtitle", text: "Usa el modelo configurado para esta API" })
      ])
    ]);
    apiToggle = UI.el("button", {
      class: "cc-selector-choice", type: "button", "aria-expanded": "false", onclick: toggleApiMenu
    }, [
      UI.el("span", { class: "cc-selector-icon", "aria-hidden": "true", text: "◈" }),
      UI.el("span", { class: "cc-selector-copy" }, [
        UI.el("span", { class: "cc-selector-title", text: "API" }),
        UI.el("span", { class: "cc-selector-subtitle cc-api-current", text: "" })
      ]),
      UI.el("span", { class: "cc-selector-arrow", "aria-hidden": "true", text: "›" })
    ]);
    apiOptions = UI.el("div", { class: "cc-api-options", role: "group", "aria-label": "APIs disponibles" });
    apiStatus = UI.el("div", { class: "cc-selector-status", text: "" });
    qualityToggle = UI.el("button", {
      class: "cc-selector-choice", type: "button", "aria-expanded": "false", onclick: toggleQualityMenu
    }, [
      UI.el("span", { class: "cc-selector-icon", "aria-hidden": "true", text: "" }),
      UI.el("span", { class: "cc-selector-copy" }, [
        UI.el("span", { class: "cc-selector-title", text: "Nivel de calidad" }),
        UI.el("span", { class: "cc-selector-subtitle cc-quality-current", text: "Mid" })
      ]),
      UI.el("span", { class: "cc-selector-arrow", "aria-hidden": "true", text: "›" })
    ]);
    qualityOptions = UI.el("div", { class: "cc-quality-options", role: "group", "aria-label": "Opciones de nivel de calidad" });
    selectorButton = UI.el("button", {
      class: "cc-ely-selector", type: "button", "aria-haspopup": "menu", "aria-expanded": "false",
      onclick: toggleSelectorMenu
    }, ["Ely", UI.el("span", { class: "cc-selector-chevron", "aria-hidden": "true", text: "⌄" })]);
    selectorMenu = UI.el("div", { class: "cc-selector-menu", role: "menu", "aria-label": "Modelo, API y nivel de calidad" }, [
      autoOption,
      apiToggle,
      apiOptions,
      apiStatus,
      UI.el("div", { class: "cc-selector-divider", "aria-hidden": "true" }),
      qualityToggle,
      qualityOptions
    ]);
    const selectorWrap = UI.el("div", { class: "cc-selector-wrap" }, [selectorButton, selectorMenu]);

    renderSelector();

    const attachBtn = UI.el("button", { class: "cc-plus", html: "＋", title: t("chat.attach"), "aria-label": t("chat.attach"), "aria-haspopup": "menu" });
    const textarea = UI.el("textarea", { class: "cc-input", rows: 1, placeholder: t("chat.doAnything"), "aria-label": t("chat.doAnything") });
    const sendBtn = UI.el("button", {
      class: "cc-send", html: "↑", title: t("chat.send"), "aria-label": t("chat.send"),
      onclick: () => st.busy ? S.stop() : doSend()
    });
    composer.appendChild(attachBtn);
    composer.appendChild(textarea);
    composer.appendChild(selectorWrap);
    composer.appendChild(sendBtn);

    const plusMenu = buildPlusMenu();
    composer.appendChild(plusMenu);
    attachBtn.addEventListener("click", (e) => { e.stopPropagation(); plusMenu.classList.toggle("open"); });
    document.addEventListener("pointerdown", (e) => {
      if (!document.body.contains(shell)) return;
      if (plusMenu.classList.contains("open") && !plusMenu.contains(e.target) && e.target !== attachBtn) plusMenu.classList.remove("open");
      if (selectorMenu.classList.contains("open") && !selectorWrap.contains(e.target)) closeSelectorMenu();
    });
    document.addEventListener("keydown", (e) => {
      if (!document.body.contains(shell) || e.key !== "Escape" || !selectorMenu.classList.contains("open")) return;
      if (qualityOpen) { qualityOpen = false; renderSelector(); }
      else if (apiOpen) { apiOpen = false; renderSelector(); }
      else closeSelectorMenu();
    });

    function plusItem(icon, title, desc, action) {
      const node = UI.el("button", { class: "cc-menu-item", role: "menuitem" }, [
        UI.el("span", { class: "cc-menu-icon", "aria-hidden": "true", text: icon }),
        UI.el("span", { class: "cc-menu-text" }, [UI.el("b", { text: title }), UI.el("span", { class: "muted", text: desc })])
      ]);
      node.addEventListener("click", () => { plusMenu.classList.remove("open"); action(); });
      return node;
    }

    function buildPlusMenu() {
      const menu = UI.el("div", { class: "cc-plusmenu", role: "menu" });
      const soon = () => UI.toast("warn", t("chat.soon"), t("chat.soonBody"));
      menu.appendChild(plusItem("📎", t("chat.menu.upload"), t("chat.menu.uploadDesc"), uploadFromComputer));
      menu.appendChild(plusItem("🗂", t("chat.menu.library"), t("chat.menu.libraryDesc"), () => FileViewer.browseStorage(st.profile)));
      menu.appendChild(plusItem("🗀", t("chat.newProject"), t("chat.newProjectHint"), createProjectModal));
      menu.appendChild(plusItem("⌘", t("chat.menu.project"), t("chat.menu.projectDesc"), () => App.navigate("ide")));
      menu.appendChild(plusItem("🖼", t("chat.menu.image"), t("chat.menu.imageDesc"), soon));
      menu.appendChild(plusItem("🌐", t("chat.menu.internet"), t("chat.menu.internetDesc"), soon));
      menu.appendChild(plusItem("⚙", t("chat.menu.platform"), t("chat.menu.platformDesc"), () => App.navigate("integrations")));
      return menu;
    }

    function uploadFromComputer() {
      const input = UI.el("input", { type: "file", multiple: true, style: { display: "none" } });
      document.body.appendChild(input);
      input.addEventListener("change", async () => {
        for (const file of Array.from(input.files || [])) {
          try {
            const b64 = await new Promise((res, rej) => {
              const r = new FileReader();
              r.onload = () => res(String(r.result).split(",")[1] || "");
              r.onerror = rej; r.readAsDataURL(file);
            });
            await API.uploadStorage({ profile: st.profile, kind: "generado", name: file.name, content_b64: b64 });
            UI.toast("ok", t("chat.uploaded"), file.name);
          } catch (e) { UI.toast("err", t("ls.addFail"), e.message); }
        }
        input.remove();
      });
      input.click();
    }

    main.appendChild(composer);

    textarea.addEventListener("keydown", (event) => {
      const enterSends = !window.Settings || Settings.get("sendOnEnter");
      if (event.key === "Enter" && !event.shiftKey && enterSends) { event.preventDefault(); doSend(); }
    });
    textarea.addEventListener("input", () => {
      textarea.style.height = "auto";
      textarea.style.height = Math.min(190, textarea.scrollHeight) + "px";
    });

    /* ---------------------------------------------------------- render */
    function renderContent() {
      UI.clear(content);
      if (!st.messages.length) {
        content.appendChild(UI.el("div", { class: "chat-hero" }, [
          UI.el("div", { class: "ch-logo", "aria-hidden": "true", text: "◈" }),
          UI.el("h2", { class: "ch-title", text: t("chat.whatBuild") }),
          UI.el("div", { class: "ch-sugs" }, [
            suggestion("✉", t("chat.sug1"), () => { textarea.value = t("chat.sug1"); textarea.focus(); }),
            suggestion("🗀", t("chat.sug2"), () => FileViewer.browseStorage(st.profile)),
            suggestion("⌘", t("chat.sug3"), () => { textarea.value = t("chat.sug3"); textarea.focus(); })
          ])
        ]));
        return;
      }
      const log = UI.el("div", {
        class: "chat-log", id: "chat-log", role: "log",
        "aria-live": "polite", "aria-label": t("chat.recents")
      });
      st.messages.forEach((m) => log.appendChild(messageNode(m)));
      content.appendChild(log);
      log.scrollTop = log.scrollHeight;
    }

    function suggestion(icon, text, onClick) {
      const node = UI.el("button", { class: "ch-sug" }, [
        UI.el("span", { class: "ch-sug-icon", "aria-hidden": "true", text: icon }),
        UI.el("span", { class: "trunc", text })
      ]);
      node.addEventListener("click", onClick);
      return node;
    }

    function renderSelector() {
      if (!selectorMenu) return;
      const profile = App.profile() || {};
      const apiLabel = apiToggle && apiToggle.querySelector(".cc-api-current");
      if (apiLabel) apiLabel.textContent = profile.label || "Seleccionar API";
      if (apiToggle) apiToggle.setAttribute("aria-expanded", apiOpen ? "true" : "false");
      if (selectorButton) {
        selectorButton.textContent = "Ely";
        selectorButton.appendChild(UI.el("span", { class: "cc-selector-chevron", "aria-hidden": "true", text: "⌄" }));
        selectorButton.setAttribute("aria-expanded", selectorMenu.classList.contains("open") ? "true" : "false");
        selectorButton.title = profile.label || "Ely · Modelo automático";
      }
      UI.clear(apiOptions);
      apiOptions.classList.toggle("open", apiOpen);
      apiStatus.textContent = "";
      if (apiOpen) {
        const profiles = Array.isArray(App.profiles) ? App.profiles : [];
        if (!profiles.length) apiStatus.textContent = "No hay APIs configuradas.";
        profiles.forEach((item) => {
          const active = item.id === App.profileId();
          apiOptions.appendChild(UI.el("button", {
            class: "cc-api-option" + (active ? " active" : ""), type: "button", role: "menuitemradio",
            "aria-checked": active ? "true" : "false", disabled: !!st.busy,
            onclick: () => chooseProfile(item.id)
          }, [
            UI.el("span", { class: "cc-api-option-name", text: item.label || item.id }),
            UI.el("span", { class: "cc-api-option-check", "aria-hidden": "true", text: "✓" })
          ]));
        });
      }
      renderQuality();
    }

    function renderQuality() {
      if (!qualityOptions || !qualityToggle) return;
      const quality = st.quality || {};
      const levels = quality.levels || ["Xlow", "Low", "Mid", "Hight", "xHight", "Uhight", "Isabel te extraño"];
      const current = quality.level || "Mid";
      UI.clear(qualityOptions);
      levels.forEach((level) => {
        qualityOptions.appendChild(UI.el("button", {
          class: "cc-quality-option" + (level === current ? " active" : ""), type: "button", role: "menuitemradio",
          "aria-checked": level === current ? "true" : "false",
          disabled: !st.quality || st.busy || !!quality.active || qualityUpdating,
          onclick: () => changeQuality(level)
        }, [
          UI.el("span", { text: level }),
          UI.el("span", { class: "cc-api-option-check", "aria-hidden": "true", text: "✓" })
        ]));
      });
      const currentLabel = qualityToggle.querySelector(".cc-quality-current");
      if (currentLabel) currentLabel.textContent = current;
      qualityToggle.disabled = !st.quality || st.busy || !!quality.active || qualityUpdating;
      qualityToggle.setAttribute("aria-expanded", qualityOpen ? "true" : "false");
      qualityOptions.classList.toggle("open", qualityOpen);
    }

    function toggleSelectorMenu() {
      selectorMenu.classList.toggle("open");
      apiOpen = false;
      qualityOpen = false;
      renderSelector();
    }

    function closeSelectorMenu() {
      selectorMenu.classList.remove("open");
      apiOpen = false;
      qualityOpen = false;
      renderSelector();
    }

    function toggleApiMenu() {
      apiOpen = !apiOpen;
      qualityOpen = false;
      renderSelector();
    }

    function toggleQualityMenu() {
      qualityOpen = !qualityOpen;
      apiOpen = false;
      renderSelector();
    }

    function chooseProfile(profileId) {
      if (!profileId || st.busy) return;
      apiOpen = false;
      qualityOpen = false;
      if (profileId !== App.profileId()) App.setProfile(profileId);
      else renderSelector();
    }

    async function changeQuality(selectedLevel) {
      if (!st.quality || st.busy || qualityUpdating) return;
      qualityUpdating = true;
      qualityOpen = false;
      renderQuality();
      try { await S.setQuality(selectedLevel); }
      catch (err) {
        UI.toast("err", t("chat.apiError"), err.message || String(err));
      } finally {
        qualityUpdating = false;
        renderSelector();
      }
    }

    function renderBusy() {
      sendBtn.disabled = false;
      sendBtn.textContent = st.busy ? "■" : "↑";
      sendBtn.title = st.busy ? t("chat.stop") : t("chat.send");
      sendBtn.setAttribute("aria-label", sendBtn.title);
      sendBtn.classList.toggle("is-stop", !!st.busy);
      newChatBtn.disabled = st.busy;
      renderQuality();
    }

    async function doSend() {
      const text = (textarea.value || "").trim();
      if (!text || st.busy) return;
      if (!App.profile()) { UI.toast("err", t("chat.noProfileTitle"), t("chat.noProfileBody")); return; }
      textarea.value = "";
      textarea.style.height = "auto";
      renderBusy();
      renderContent();
      let queued = false;
      const result = await S.send(text, {
        agent: App.agentId(),
        onDelta: () => {
          /* Un solo repintado por frame: el texto ya vive en el store. */
          if (queued) return;
          queued = true;
          requestAnimationFrame(() => { queued = false; renderContent(); });
        }
      });
      if (!result.ok && result.message && result.message.error) UI.toast("err", t("chat.apiError"), result.message.error);
      renderBusy();
      renderContent();
      textarea.focus();
    }

    /* ---------------------------------------------------------- init */
    function renderAll() { renderProjects(); renderRecents(); renderContent(); renderBusy(); renderSelector(); }
    /* Se repinta mientras la vista siga en el documento (no depende de la
       ruta: el widget puede cambiar la conversación desde cualquier vista). */
    unsub = S.subscribe(() => { if (document.body.contains(shell)) renderAll(); });
    renderAll();
    S.init(App.profileId()).then(renderAll);
    setTimeout(() => textarea.focus(), 40);

    /* Limpia la suscripción al salir de la vista (evita renders fantasma). */
    const observer = new MutationObserver(() => {
      if (!document.body.contains(shell)) { if (unsub) unsub(); observer.disconnect(); }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    return shell;
  };
})();
