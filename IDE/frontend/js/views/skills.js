/* Skills: instrucciones persistentes guardadas por el servidor y ejecutables. */
(function () {
  "use strict";

  window.Views = window.Views || {};

  window.Views.skills = function (view, App) {
    const root = UI.el("div", { class: "stack" });
    const grid = UI.el("div", { class: "grid auto" });

    root.appendChild(UI.head(
      "Skills",
      "Edita y revisa skills",
      [UI.btn("Nueva skill", () => editor(), { primary: true, icon: "＋" })]
    ));
    root.appendChild(grid);

    function editor(skill) {
      const name = UI.el("input", { type: "text", placeholder: "ej. Revisor de PRs", value: skill ? skill.name : "" });
      const agent = UI.el("select", null, (App.agents || []).map((a) =>
        UI.el("option", { value: a.id, selected: skill && skill.agent === a.id, text: a.icon + " " + a.name + " — " + a.role })
      ));
      const instruction = UI.el("textarea", {
        rows: 6,
        placeholder: "Instrucción que se enviará como parte del prompt…",
        value: skill ? skill.instruction : ""
      });
      const tags = UI.el("input", { type: "text", placeholder: "revisión, seguridad (separadas por comas)", value: skill ? (skill.tags || []).join(", ") : "" });

      const ref = UI.modal({
        title: skill ? "Editar skill" : "Nueva skill",
        body: UI.el("div", { class: "stack" }, [
          UI.el("label", { class: "field" }, [UI.el("span", { text: "Nombre" }), name]),
          UI.el("label", { class: "field" }, [UI.el("span", { text: "Agente" }), agent]),
          UI.el("label", { class: "field" }, [UI.el("span", { text: "Instrucción" }), instruction]),
          UI.el("label", { class: "field" }, [UI.el("span", { text: "Etiquetas" }), tags])
        ]),
        footer: [
          UI.btn("Cancelar", () => ref.close(), { ghost: true }),
          UI.btn("Guardar", async () => {
            if (!name.value.trim()) { UI.toast("warn", "Falta el nombre"); return; }
            try {
              if (skill) await API.deleteSkill(skill.id);
              await API.addSkill({
                name: name.value.trim(),
                agent: agent.value,
                instruction: instruction.value.trim(),
                tags: tags.value.split(",").map((t) => t.trim()).filter(Boolean)
              });
              ref.close();
              load();
              UI.toast("ok", "Skill guardada");
            } catch (err) {
              UI.toast("err", "No se guardó", err.message);
            }
          }, { primary: true })
        ]
      });
      setTimeout(() => name.focus(), 40);
    }

    function runSkill(skill) {
      const input = UI.el("textarea", { rows: 3, placeholder: "Tarea concreta para esta skill…" });
      const output = UI.el("div", { class: "bubble", style: { marginTop: "12px", display: "none" } });
      const ref = UI.modal({
        title: skill.name,
        subtitle: skill.agent,
        wide: true,
        body: UI.el("div", { class: "stack" }, [
          UI.el("pre", {
            class: "mono",
            style: { whiteSpace: "pre-wrap", fontSize: "11.5px", background: "var(--bg)", padding: "10px", borderRadius: "8px", border: "1px solid var(--border)", margin: 0, maxHeight: "140px", overflow: "auto" },
            text: skill.instruction || "(sin instrucción)"
          }),
          input,
          output
        ]),
        footer: [
          UI.btn("Cerrar", () => ref.close(), { ghost: true }),
          UI.btn("Ejecutar", async (event) => {
            const btn = event.currentTarget;
            const text = input.value.trim() || skill.name;
            btn.disabled = true;
            output.style.display = "block";
            output.innerHTML = "";
            output.appendChild(UI.spinner());
            try {
              const result = await API.runSkill(skill.id, text);
              output.innerHTML = UI.md(result.text);
              UI.bindCopy(output);
              output.appendChild(UI.el("div", { class: "meta", style: { marginTop: "8px" },
                text: (result.usage ? result.usage.total_tokens + " tokens · " + UI.ms(result.usage.latency_ms) : "") + " · " + result.model }));
              load();
            } catch (err) {
              output.innerHTML = UI.md("**Error:** " + err.message);
            }
            btn.disabled = false;
          }, { primary: true })
        ]
      });
      setTimeout(() => input.focus(), 40);
    }

    async function load() {
      UI.clear(grid);
      grid.appendChild(UI.loading("Leyendo skills…"));
      try {
        const data = await API.skills();
        const skills = data.skills || [];
        UI.clear(grid);
        if (!skills.length) {
          grid.appendChild(UI.el("div", { class: "card" }, [
            UI.empty("✧", "Aún no hay skills. Crea la primera para reutilizar instrucciones."),
            UI.el("div", { class: "row", style: { justifyContent: "center" } }, [
              UI.btn("Crear skill de ejemplo", async () => {
                await API.addSkill({
                  name: "Revisión de seguridad",
                  agent: "review",
                  instruction: "Actúa como auditor de seguridad. Revisa el código adjunto y lista solo vulnerabilidades reales (inyección, secretos en claro, validación ausente) con severidad y parche propuesto.",
                  tags: ["seguridad", "revisión"]
                });
                load();
              }, { small: true })
            ])
          ]));
          return;
        }
        skills.forEach((skill) => {
          const agent = (App.agents || []).find((a) => a.id === skill.agent);
          const card = UI.el("div", { class: "card" });
          card.appendChild(UI.el("div", { class: "row between" }, [
            UI.el("div", null, [
              UI.el("div", { style: { fontWeight: 650 }, text: skill.name }),
              UI.el("div", { class: "muted", style: { fontSize: "11px" }, text: (agent ? agent.icon + " " + agent.name : skill.agent) })
            ]),
            UI.badge(skill.runs ? skill.runs + " usos" : "nueva", skill.runs ? "ok" : "info")
          ]));
          card.appendChild(UI.el("p", {
            class: "dim",
            style: { fontSize: "11.5px", margin: "10px 0", maxHeight: "80px", overflow: "auto" },
            text: skill.instruction || "(sin instrucción)"
          }));
          if ((skill.tags || []).length) {
            card.appendChild(UI.el("div", { class: "pill-row" }, skill.tags.map((tag) => UI.badge("#" + tag))));
          }
          card.appendChild(UI.el("div", { class: "row", style: { marginTop: "10px" } }, [
            UI.btn("Ejecutar", () => runSkill(skill), { small: true, primary: true }),
            UI.btn("Editar", () => editor(skill), { small: true, ghost: true }),
            UI.btn("Eliminar", async () => {
              try {
                await API.deleteSkill(skill.id);
                load();
              } catch (err) {
                UI.toast("err", "No se eliminó", err.message);
              }
            }, { small: true, ghost: true, danger: true })
          ]));
          grid.appendChild(card);
        });
      } catch (err) {
        UI.clear(grid);
        grid.appendChild(UI.errBox(err, load));
      }
    }

    load();
    return root;
  };
})();
