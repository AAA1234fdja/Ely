/* Equipos: agrupaciones de agentes con objetivo, y ejecución en secuencia. */
(function () {
  "use strict";

  window.Views = window.Views || {};

  window.Views.teams = function (view, App) {
    const root = UI.el("div", { class: "stack" });
    let state = { teams: [], tasks: [] };

    root.appendChild(UI.head(
      "Agent Teams",
      "Coordina equipos y roles",
      [UI.btn("Nuevo equipo", () => teamModal(), { primary: true, icon: "＋" })]
    ));

    const grid = UI.el("div", { class: "grid auto" });
    root.appendChild(grid);

    function persistLocal() {
      try { localStorage.setItem("ely.teams", JSON.stringify(state.teams)); } catch (e) { /* noop */ }
    }

    function loadLocal() {
      try {
        const raw = JSON.parse(localStorage.getItem("ely.teams") || "[]");
        if (Array.isArray(raw) && raw.length) return raw;
      } catch (e) { /* noop */ }
      /* equipo inicial: derivado de los agentes reales del backend */
      const ids = (App.agents || []).map((a) => a.id);
      return [{
        id: "build",
        name: "Equipo de entrega",
        goal: "Especificar, implementar y revisar una feature de principio a fin.",
        members: ids.filter((id) => ["product", "dev", "review", "docs"].includes(id)),
        createdAt: new Date().toISOString()
      }];
    }

    function teamModal(team) {
      const name = UI.el("input", { type: "text", placeholder: "Nombre del equipo", value: team ? team.name : "" });
      const goal = UI.el("textarea", { rows: 2, placeholder: "Objetivo compartido", value: team ? team.goal : "" });
      const chosen = new Set(team ? team.members : ["photon"]);
      const chips = UI.el("div", { class: "chips" });
      (App.agents || []).forEach((agent) => {
        const chip = UI.el("button", {
          class: "chip" + (chosen.has(agent.id) ? " on" : ""),
          text: agent.icon + " " + agent.name,
          onclick: () => {
            if (chosen.has(agent.id)) chosen.delete(agent.id);
            else chosen.add(agent.id);
            chip.classList.toggle("on");
          }
        });
        chips.appendChild(chip);
      });

      const ref = UI.modal({
        title: team ? "Editar equipo" : "Nuevo equipo",
        body: UI.el("div", { class: "stack" }, [
          UI.el("label", { class: "field" }, [UI.el("span", { text: "Nombre" }), name]),
          UI.el("label", { class: "field" }, [UI.el("span", { text: "Objetivo" }), goal]),
          UI.el("label", { class: "field" }, [UI.el("span", { text: "Miembros (en orden de ejecución)" }), chips])
        ]),
        footer: [
          UI.btn("Cancelar", () => ref.close(), { ghost: true }),
          UI.btn(team ? "Guardar" : "Crear", () => {
            if (!name.value.trim()) { UI.toast("warn", "Falta el nombre"); return; }
            const members = Array.from(chosen).filter((id) => App.agents.some((a) => a.id === id));
            if (!members.length) { UI.toast("warn", "Elige al menos un agente"); return; }
            const next = {
              id: team ? team.id : "t_" + Date.now().toString(36),
              name: name.value.trim(),
              goal: goal.value.trim(),
              members,
              createdAt: team ? team.createdAt : new Date().toISOString()
            };
            state.teams = team
              ? state.teams.map((t) => (t.id === team.id ? next : t))
              : [next, ...state.teams];
            persistLocal();
            ref.close();
            render();
          }, { primary: true })
        ]
      });
    }

    async function runTeam(team) {
      const input = UI.el("textarea", { rows: 3, placeholder: "Describe la tarea para el equipo…" });
      const ref = UI.modal({
        title: "Ejecutar · " + team.name,
        subtitle: team.members.join(" → "),
        body: UI.el("div", { class: "stack" }, [
          UI.el("p", { class: "dim", style: { margin: 0, fontSize: "12.5px" }, text: team.goal || "Sin objetivo definido." }),
          input,
          UI.el("p", { class: "muted", style: { margin: 0, fontSize: "11.5px" },
            text: team.members.length + " llamadas al perfil " + (App.profile() ? App.profile().label : "—") })
        ]),
        footer: [UI.btn("Cancelar", () => ref.close(), { ghost: true }),
          UI.btn("Ejecutar", async () => {
            const text = input.value.trim();
            if (!text) { UI.toast("warn", "Falta la tarea"); return; }
            ref.close();
            const task = { id: "task_" + Date.now().toString(36), team: team.name, input: text, at: new Date().toISOString(), status: "running", steps: [] };
            state.tasks.unshift(task);
            render();
            const panel = document.getElementById("team-task-" + task.id);
            let previous = text;
            for (const agentId of team.members) {
              const agent = App.agents.find((a) => a.id === agentId);
              try {
                const result = await LLM.complete(
                  "Objetivo del equipo: " + (team.goal || "resolver la tarea") +
                    "\n\nTu papel: " + agent.name + " (" + agent.role + ").\n\n" +
                    "Contexto de la tarea:\n" + text + "\n\nTrabajo del paso anterior:\n" + previous,
                  { agent: agentId, profile: App.profileId(), useMemory: false }
                );
                task.steps.push({ agent: agentId, name: agent.name, text: result.text, usage: result.usage });
                previous = result.text;
                if (panel) paintTask(panel, task);
              } catch (err) {
                task.status = "error";
                task.error = err.message;
                if (panel) paintTask(panel, task);
                UI.toast("err", "Equipo detenido", err.message);
                return;
              }
            }
            task.status = "done";
            if (panel) paintTask(panel, task);
            UI.toast("ok", "Equipo completado", team.name + " · " + task.steps.length + " pasos");
          }, { primary: true })]
      });
      setTimeout(() => input.focus(), 40);
    }

    function paintTask(panel, task) {
      UI.clear(panel);
      panel.appendChild(UI.el("div", { class: "row between" }, [
        UI.el("div", { class: "row", style: { gap: "8px" } }, [
          UI.badge(task.status, task.status === "done" ? "ok" : task.status === "error" ? "err" : "warn"),
          UI.el("b", { text: task.team }),
          UI.el("span", { class: "muted", style: { fontSize: "11px" }, text: UI.date(task.at) })
        ]),
        UI.el("span", { class: "muted mono", style: { fontSize: "11px" }, text: task.steps.length + " pasos" })
      ]));
      task.steps.forEach((step) => {
        const bubble = UI.el("div", { class: "bubble", style: { marginTop: "8px" }, html: UI.md(step.text) });
        UI.bindCopy(bubble);
        panel.appendChild(UI.el("div", null, [
          UI.el("div", { class: "row", style: { gap: "6px", marginTop: "10px" } }, [
            UI.badge(step.name, "accent"),
            UI.el("span", { class: "muted", style: { fontSize: "11px" },
              text: step.usage ? step.usage.total_tokens + " tokens · " + UI.ms(step.usage.latency_ms) : "" })
          ]),
          bubble
        ]));
      });
      if (task.error) panel.appendChild(UI.el("p", { style: { color: "var(--red)", fontSize: "12px" }, text: task.error }));
    }

    function render() {
      UI.clear(grid);
      state.teams.forEach((team) => {
        const card = UI.el("div", { class: "card" });
        card.appendChild(UI.el("div", { class: "row between" }, [
          UI.el("div", null, [
            UI.el("div", { style: { fontWeight: 650 }, text: team.name }),
            UI.el("div", { class: "muted", style: { fontSize: "11px" }, text: team.members.length + " agentes" })
          ]),
          UI.el("div", { class: "row", style: { gap: "4px" } }, [
            UI.btn("Ejecutar", () => runTeam(team), { small: true, primary: true }),
            UI.btn("✎", () => teamModal(team), { small: true, ghost: true }),
            UI.btn("×", () => {
              state.teams = state.teams.filter((t) => t.id !== team.id);
              persistLocal();
              render();
            }, { small: true, ghost: true })
          ])
        ]));
        if (team.goal) card.appendChild(UI.el("p", { class: "dim", style: { fontSize: "12px", margin: "8px 0" }, text: team.goal }));
        card.appendChild(UI.el("div", { class: "pill-row" },
          team.members.map((id) => {
            const agent = (App.agents || []).find((a) => a.id === id);
            return UI.badge(agent ? agent.icon + " " + agent.name : id, "info");
          })
        ));
        grid.appendChild(card);
      });
      if (!state.teams.length) grid.appendChild(UI.empty("◎", "Sin equipos. Crea uno con «Nuevo equipo»."));

      if (state.tasks.length) {
        const tasksCard = UI.el("div", { class: "card", style: { marginTop: "4px" } });
        tasksCard.appendChild(UI.el("h3", { text: "Ejecuciones" }));
        state.tasks.slice(0, 6).forEach((task) => {
          const panel = UI.el("div", { id: "team-task-" + task.id, style: { marginBottom: "14px", borderBottom: "1px solid var(--border)", paddingBottom: "14px" } });
          tasksCard.appendChild(panel);
          paintTask(panel, task);
        });
        grid.appendChild(tasksCard);
      }
    }

    state.teams = loadLocal();
    render();
    return root;
  };
})();
