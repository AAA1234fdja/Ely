/* Canvas: mapa de orquestación (agentes + workflows reales del backend). */
(function () {
  "use strict";

  window.Views = window.Views || {};

  window.Views.canvas = function (view, App) {
    const root = UI.el("div", { class: "stack", style: { height: "100%" } });
    const nodes = [];
    let selected = null;

    root.appendChild(UI.head(
      "Canvas",
      "Diseña y orquesta visualmente",
      [UI.btn("Reencuadrar", () => draw(), { small: true, ghost: true })]
    ));

    const wrap = UI.el("div", { class: "card pad-0", style: { flex: "1", minHeight: "440px", display: "flex" } });
    const canvas = UI.el("div", { class: "canvas", style: { flex: "1" } });
    const inspector = UI.el("div", {
      style: { width: "280px", flex: "0 0 280px", borderLeft: "1px solid var(--border)", padding: "14px", background: "var(--bg-soft)", overflowY: "auto" }
    });
    wrap.appendChild(canvas);
    wrap.appendChild(inspector);
    root.appendChild(wrap);

    function layout() {
      const width = Math.max(canvas.clientWidth || 900, 760);
      const height = 520;
      const cols = 4;
      const gapX = (width - 200) / cols;
      nodes.length = 0;

      (App.agents || []).forEach((agent, index) => {
        const row = index % 2;
        const col = Math.floor(index / 2) % cols;
        nodes.push({
          kind: "agent", id: agent.id, label: agent.name, sub: agent.role, color: agent.color,
          x: 70 + col * gapX, y: 70 + row * 150, data: agent
        });
      });

      return { width, height };
    }

    let workflows = [];
    function draw() {
      UI.clear(canvas);
      const size = layout();
      const ns = "http://www.w3.org/2000/svg";
      const svg = document.createElementNS(ns, "svg");
      svg.setAttribute("width", String(size.width));
      svg.setAttribute("height", String(Math.max(size.height, 620)));
      svg.setAttribute("viewBox", "0 0 " + size.width + " " + Math.max(size.height, 620));

      const defs = document.createElementNS(ns, "defs");
      defs.innerHTML = '<marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="rgba(255,255,255,0.35)"/></marker>';
      svg.appendChild(defs);

      /* aristas agente -> agente dentro de cada workflow */
      workflows.forEach((flow) => {
        const chain = flow.agents.map((id) => nodes.find((n) => n.kind === "agent" && n.id === id)).filter(Boolean);
        for (let i = 0; i < chain.length - 1; i += 1) {
          const a = chain[i];
          const b = chain[i + 1];
          const path = document.createElementNS(ns, "path");
          const mx = (a.x + b.x) / 2;
          const my = (a.y + b.y) / 2 - 40;
          path.setAttribute("d", "M" + (a.x + 80) + "," + (a.y + 26) + " Q" + mx + "," + my + " " + (b.x + 80) + "," + (b.y + 26));
          path.setAttribute("class", "edge" + (selected && (selected.id === a.id || selected.id === b.id) ? " flow" : ""));
          path.setAttribute("marker-end", "url(#arrow)");
          svg.appendChild(path);
        }
      });

      /* nodos */
      nodes.forEach((node) => {
        const group = document.createElementNS(ns, "g");
        group.setAttribute("class", "node" + (selected && selected.id === node.id ? " on" : ""));
        const rect = document.createElementNS(ns, "rect");
        rect.setAttribute("class", "box");
        rect.setAttribute("x", String(node.x));
        rect.setAttribute("y", String(node.y));
        rect.setAttribute("width", "160");
        rect.setAttribute("height", "54");
        rect.setAttribute("rx", "12");
        group.appendChild(rect);

        const accent = document.createElementNS(ns, "rect");
        accent.setAttribute("x", String(node.x));
        accent.setAttribute("y", String(node.y));
        accent.setAttribute("width", "4");
        accent.setAttribute("height", "54");
        accent.setAttribute("rx", "2");
        accent.setAttribute("fill", node.color);
        group.appendChild(accent);

        const title = document.createElementNS(ns, "text");
        title.setAttribute("x", String(node.x + 16));
        title.setAttribute("y", String(node.y + 22));
        title.textContent = node.label;
        group.appendChild(title);

        const sub = document.createElementNS(ns, "text");
        sub.setAttribute("class", "sub");
        sub.setAttribute("x", String(node.x + 16));
        sub.setAttribute("y", String(node.y + 38));
        sub.textContent = node.sub.length > 24 ? node.sub.slice(0, 23) + "…" : node.sub;
        group.appendChild(sub);

        group.addEventListener("click", () => {
          selected = node;
          draw();
          inspect(node);
        });
        svg.appendChild(group);
      });

      canvas.appendChild(svg);
      if (!selected) inspect(null);
    }

    function inspect(node) {
      UI.clear(inspector);
      if (!node) {
        inspector.appendChild(UI.el("h3", { text: "Inspector" }));
        inspector.appendChild(UI.el("p", { class: "muted", style: { fontSize: "12px" }, text: "Selecciona un nodo del mapa." }));
        inspector.appendChild(UI.el("div", { class: "divider" }));
        inspector.appendChild(UI.el("dl", { class: "kv", style: { fontSize: "11.5px" } }, [
          UI.el("dt", { text: "nodos" }), UI.el("dd", { text: String(nodes.length) }),
          UI.el("dt", { text: "workflows" }), UI.el("dd", { text: String(workflows.length) }),
          UI.el("dt", { text: "perfil" }), UI.el("dd", { text: App.profile() ? App.profile().label : "—" })
        ]));
        return;
      }
      const data = node.data;
      inspector.appendChild(UI.el("h3", null, [UI.el("span", { style: { color: node.color }, text: data.icon || "◈" }), UI.el("span", { text: node.label })]));
      inspector.appendChild(UI.el("div", { class: "pill-row" }, [
        UI.badge(node.kind, "accent"),
        UI.badge("temp " + data.temperature, "info"),
        UI.badge("max " + data.max_tokens, "info")
      ]));
      inspector.appendChild(UI.el("p", { class: "dim", style: { fontSize: "11.5px", margin: "12px 0" }, text: data.system }));
      inspector.appendChild(UI.el("div", { class: "divider" }));
      inspector.appendChild(UI.el("div", { class: "stack", style: { gap: "8px" } }, [
        UI.btn("Chatear con " + data.name, () => {
          Store.set({ agent: data.id });
          App.navigate("chat");
        }, { primary: true, small: true }),
        UI.btn("Ver en agentes", () => App.navigate("agents"), { ghost: true, small: true })
      ]));

      const related = workflows.filter((flow) => flow.agents.includes(data.id));
      if (related.length) {
        inspector.appendChild(UI.el("div", { class: "divider" }));
        inspector.appendChild(UI.el("h3", { text: "Workflows" }));
        related.forEach((flow) => {
          inspector.appendChild(UI.el("div", { class: "side-item", onclick: () => App.navigate("workflows") }, [
            UI.el("span", { text: flow.icon + " " + flow.name }),
            UI.el("small", { text: flow.agents.join(" → ") })
          ]));
        });
      }
    }

    API.workflows().then((data) => {
      workflows = data.workflows || [];
      draw();
    }).catch(() => draw());

    window.addEventListener("resize", () => {
      if (App.route === "canvas") draw();
    });

    draw();
    return root;
  };
})();
