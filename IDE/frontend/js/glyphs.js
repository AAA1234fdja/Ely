/* Ely Cowork · glifos de la interfaz (SVG en línea, estilo codicon).
 *
 * Son los iconos de las barras de herramientas del IDE (panel, terminal,
 * editor): trazos de 16×16 que heredan el color del texto, igual que los
 * codicons de VS Code. Se dibujan en línea para no pedir un asset por botón.
 * Expone window.Glyph.
 */
(function () {
  "use strict";

  /* Trazos en un lienzo de 16×16. `fill` marks shapes drawn as polygons. */
  const P = {
    terminal: { d: "M1.5 2.5h13v11h-13z M3.5 6l2.5 2-2.5 2 M8 10.5h4", fill: false },
    plus: { d: "M8 3v10 M3 8h10", fill: false },
    chevronDown: { d: "M4 6l4 4 4-4", fill: false },
    chevronRight: { d: "M6 4l4 4-4 4", fill: false },
    split: { d: "M2.5 2.5h11v11h-11z M8 2.5v11", fill: false },
    trash: { d: "M3 4.5h10 M6.5 4.5V3h3v1.5 M4.5 4.5l.7 9h5.6l.7-9 M6.5 7v4 M9.5 7v4", fill: false },
    ellipsis: { d: "M3.2 8h.01 M8 8h.01 M12.8 8h.01", fill: false, round: true, width: 2 },
    maximize: { d: "M2.5 6V2.5H6 M10 2.5h3.5V6 M13.5 10v3.5H10 M6 13.5H2.5V10", fill: false },
    restore: { d: "M6 2.5h7.5V10 M2.5 6h7.5v7.5H2.5z", fill: false },
    close: { d: "M4 4l8 8 M12 4l-8 8", fill: false },
    clear: { d: "M2.5 3.5h11 M5 3.5V2h6v1.5 M9.5 6.5l4 4 M13.5 6.5l-4 4 M2.5 7.5h5 M2.5 10.5h4 M2.5 13.5h5", fill: false },
    lock: { d: "M4.5 7.5V5.5a3.5 3.5 0 017 0v2 M3.5 7.5h9v6h-9z", fill: false },
    unlock: { d: "M4.5 7.5V5.5a3.5 3.5 0 016.9-.8 M3.5 7.5h9v6h-9z", fill: false },
    play: { d: "M4 2.8l9 5.2-9 5.2z", fill: true },
    refresh: { d: "M13 8a5 5 0 11-1.6-3.7 M13 2.5V5h-2.5", fill: false },
    filter: { d: "M2.5 3.5h11l-4.3 5v4.2l-2.4 1.3V8.5z", fill: false },
    search: { d: "M10.5 10.5l3 3 M11 6.5a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0", fill: false },
    error: { d: "M8 1.6l6.4 12.8H1.6z M8 6v4 M8 12h.01", fill: false, round: true },
    warning: { d: "M8 1.6l6.4 12.8H1.6z M8 6v4 M8 12h.01", fill: false, round: true },
    info: { d: "M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13 M8 7v4.5 M8 4.5h.01", fill: false, round: true },
    debug: { d: "M8 4.5a3.5 3.5 0 013.5 3.5v2a3.5 3.5 0 11-7 0V8A3.5 3.5 0 018 4.5 M8 4.5V3 M5.5 3l1 1.5 M10.5 3l-1 1.5 M2 8h2.5 M11.5 8H14 M2.5 12l2-1 M13.5 12l-2-1", fill: false },
    port: { d: "M8 1.5v6 M5 4.5l3-3 3 3 M3 8.5h10v5H3z", fill: false },
    output: { d: "M2.5 2.5h11v11h-11z M5 6h6 M5 8.5h6 M5 11h3", fill: false },
    rename: { d: "M2.5 12.5h11 M4 10l6.5-6.5 2 2L6 12H4z", fill: false },
    copy: { d: "M5.5 5.5h8v8h-8z M10.5 5.5v-3h-8v8h3", fill: false },
    check: { d: "M3 8.5l3.5 3.5L13 5", fill: false },
    gear: { d: "M8 5.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5 M8 1.5v2 M8 12.5v2 M1.5 8h2 M12.5 8h2 M3.4 3.4l1.4 1.4 M11.2 11.2l1.4 1.4 M12.6 3.4l-1.4 1.4 M4.8 11.2l-1.4 1.4", fill: false },
    task: { d: "M3.5 2.5h9v11h-9z M5.5 6l1 1 2-2 M5.5 10l1 1 2-2 M10 6h1 M10 10h1", fill: false },
    kill: { d: "M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13 M5.5 5.5l5 5 M10.5 5.5l-5 5", fill: false },
    editors: { d: "M2.5 3.5h11v9h-11z M2.5 6.5h11 M5 3.5v3", fill: false }
  };

  function svg(name, size) {
    const spec = P[name] || P.info;
    const ns = "http://www.w3.org/2000/svg";
    const node = document.createElementNS(ns, "svg");
    node.setAttribute("viewBox", "0 0 16 16");
    node.setAttribute("width", String(size || 16));
    node.setAttribute("height", String(size || 16));
    node.setAttribute("aria-hidden", "true");
    node.setAttribute("focusable", "false");
    node.classList.add("vsc-glyph");
    const path = document.createElementNS(ns, "path");
    path.setAttribute("d", spec.d);
    if (spec.fill) {
      path.setAttribute("fill", "currentColor");
    } else {
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", "currentColor");
      path.setAttribute("stroke-width", String(spec.width || 1.1));
      path.setAttribute("stroke-linecap", spec.round ? "round" : "butt");
      path.setAttribute("stroke-linejoin", "round");
    }
    node.appendChild(path);
    return node;
  }

  /* Botón de barra de herramientas con el aspecto de VS Code. */
  function button(name, title, onclick, opts) {
    const o = opts || {};
    const b = document.createElement("button");
    b.type = "button";
    b.className = "vsc-tb-btn" + (o.cls ? " " + o.cls : "");
    b.title = title;
    b.setAttribute("aria-label", title);
    if (o.pressed !== undefined) b.setAttribute("aria-pressed", String(!!o.pressed));
    if (o.haspopup) b.setAttribute("aria-haspopup", "menu");
    b.appendChild(svg(name, o.size || 16));
    if (o.text) {
      const s = document.createElement("span");
      s.className = "vsc-tb-label";
      s.textContent = o.text;
      b.appendChild(s);
    }
    if (onclick) b.addEventListener("click", onclick);
    return b;
  }

  window.Glyph = { svg: svg, button: button, names: Object.keys(P) };
})();
