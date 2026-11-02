/* Skills Library · vista registrada bajo demanda.
 *
 * El HTML base no declara este módulo y no se modifica. El router (app.js)
 * detecta la ruta "skillslib" y carga este archivo antes de pintar.
 */
(function () {
  "use strict";

  const CATEGORIES = ["Todas", "Narrativa", "Datos", "Infra"];

  function flags() {
    try {
      return JSON.parse(localStorage.getItem("ely.skillFlags") || "{}");
    } catch (e) {
      return {};
    }
  }

  function setFlag(id, enabled) {
    const current = flags();
    current[id] = enabled;
    try {
      localStorage.setItem("ely.skillFlags", JSON.stringify(current));
    } catch (e) { /* noop */ }
  }

  function view(viewRoot, App) {
    const root = UI.el("div", { class: "stack", style: { flex: "1", minHeight: 0 } });
    let skills = [];
    let filter = "Todas";
    let query = "";

    const search = UI.el("input", {
      type: "text",
      placeholder: "Buscar…",
      style: { maxWidth: "230px" },
      oninput: (event) => { query = event.target.value.toLowerCase(); paint(); }
    });

    root.appendChild(UI.head(
      "Skills Library",
      "Capacidades operativas",
      [search, UI.btn("Nueva skill", async () => {
        try {
          const skill = await API.addSkill({
            name: "skill-" + Date.now().toString(36),
            agent: App.agentId(),
            instruction: "",
            tags: []
          });
          UI.toast("ok", "Skill creada", skill.name + " — complétala en Skills");
          App.navigate("skills");
        } catch (err) {
          UI.toast("err", "No se creó", err.message);
        }
      }, { primary: true, icon: "＋" })]
    ));

    const tabs = UI.el("div", { class: "chips" });
    const grid = UI.el("div", { class: "grid auto" });
    root.appendChild(tabs);
    root.appendChild(grid);

    CATEGORIES.forEach((name) => {
      const chip = UI.el("button", {
        class: "chip" + (filter === name ? " on" : ""),
        text: name,
        onclick: () => {
          filter = name;
          Array.from(tabs.children).forEach((c) => c.classList.remove("on"));
          chip.classList.add("on");
          paint();
        }
      });
      tabs.appendChild(chip);
    });

    function matches(skill) {
      const tag = (skill.tags || [])[0] || "General";
      if (filter !== "Todas" && tag !== filter) return false;
      if (!query) return true;
      return (skill.name + " " + (skill.instruction || "") + " " + (skill.tags || []).join(" "))
        .toLowerCase().includes(query);
    }

    function paint() {
      UI.clear(grid);
      if (!skills.length) {
        grid.appendChild(UI.el("div", { class: "card" }, [
          UI.empty("✧", "La librería está vacía. Crea una skill para empezar."),
          UI.el("div", { class: "row", style: { justifyContent: "center" } }, [
            UI.btn("Ir a Skills", () => App.navigate("skills"), { small: true })
          ])
        ]));
        return;
      }
      const visible = skills.filter(matches);
      if (!visible.length) {
        grid.appendChild(UI.el("div", { class: "card" }, [UI.empty("⌕", "Ninguna skill coincide con el filtro.")]));
        return;
      }
      visible.forEach((skill) => {
        const enabled = flags()[skill.id] !== false;
        const card = UI.el("div", { class: "card", style: { padding: "11px 12px" } });
        const input = UI.el("input", {
          type: "checkbox",
          checked: enabled,
          onchange: (event) => {
            setFlag(skill.id, event.target.checked);
            UI.toast(event.target.checked ? "ok" : "warn",
              event.target.checked ? "Skill activada" : "Skill desactivada", skill.name);
            App.renderNav();
          }
        });
        card.appendChild(UI.el("div", { class: "row between", style: { alignItems: "flex-start" } }, [
          UI.el("div", { class: "row", style: { gap: "6px" } }, [
            UI.el("span", { class: "muted", text: "✧" }),
            UI.el("b", { style: { fontSize: "11.5px" }, text: skill.name })
          ]),
          UI.el("label", { class: "switch" }, [input, UI.el("span")])
        ]));
        card.appendChild(UI.el("p", {
          class: "muted",
          style: { fontSize: "10.5px", margin: "6px 0 9px", lineHeight: "1.45", minHeight: "28px" },
          text: skill.instruction || "Sin instrucción definida."
        }));
        card.appendChild(UI.el("div", { class: "row", style: { gap: "6px" } }, [
          UI.badge((skill.tags || [])[0] || "General"),
          UI.el("span", { class: "muted", style: { fontSize: "10px" }, text: (skill.runs || 0) + " usos" }),
          UI.el("span", { style: { flex: "1" } }),
          UI.btn("Abrir", () => App.navigate("skills"), { small: true, ghost: true })
        ]));
        grid.appendChild(card);
      });
    }

    API.skills().then((data) => {
      skills = data.skills || [];
      paint();
    }).catch((err) => {
      grid.appendChild(UI.errBox(err, () => App.render()));
    });

    return root;
  }

  window.Views = window.Views || {};
  window.Views.skillslib = view;
})();
