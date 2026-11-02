/* Pairing: token de emparejamiento real emitido por el servidor. */
(function () {
  "use strict";

  window.Views = window.Views || {};

  window.Views.pairing = function (view, App) {
    const root = UI.el("div", { class: "stack" });
    let token = "";
    let tokenInput;

    root.appendChild(UI.head(
      "Pairing",
      "Token emitido por el servidor en <span class='mono'>.ely/pairing.json</span> y rotable. La API escucha en la misma URL del IDE; el token identifica la instalación en clientes externos.",
      []
    ));

    const card = UI.el("div", { class: "card" });
    const clientsCard = UI.el("div", { class: "card" });
    root.appendChild(card);
    root.appendChild(clientsCard);

    function renderCard(data) {
      token = data.token || "";
      UI.clear(card);
      card.appendChild(UI.el("h3", null, [
        UI.el("span", { text: "Token de emparejamiento" }),
        UI.badge(token ? "activo" : "sin token", token ? "ok" : "err")
      ]));
      tokenInput = UI.el("input", {
        type: "text", value: token, readOnly: true,
        class: "mono", style: { fontSize: "12px" }
      });
      card.appendChild(tokenInput);
      card.appendChild(UI.el("div", { class: "row", style: { marginTop: "10px" } }, [
        UI.btn("Copiar", () => UI.copy(token), { small: true, ghost: true }),
        UI.btn("Copiar endpoint", () => UI.copy(location.origin + "/api/health"), { small: true, ghost: true }),
        UI.el("div", { style: { flex: "1" } }),
        UI.btn("Rotar token", () => {
          UI.confirm("Rotar el token", "Las instalaciones ya emparejadas dejarán de ser válidas.", async () => {
            try {
              const fresh = await API.rotatePairing();
              renderCard(fresh);
              UI.toast("ok", "Token rotado");
            } catch (err) {
              UI.toast("err", "No se pudo rotar", err.message);
            }
          }, "Rotar");
        }, { small: true, danger: true })
      ]));
      card.appendChild(UI.el("div", { class: "divider" }));
      card.appendChild(UI.el("dl", { class: "kv", style: { fontSize: "12px" } }, [
        UI.el("dt", { text: "creado" }), UI.el("dd", { text: UI.date(data.created_at) }),
        UI.el("dt", { text: "endpoint" }), UI.el("dd", { class: "mono", text: location.origin + "/api/health" }),
        UI.el("dt", { text: "comandos" }),
        UI.el("dd", null, [
          UI.el("pre", {
            class: "mono",
            style: { margin: 0, whiteSpace: "pre-wrap", fontSize: "11px", background: "#0a0c12", padding: "10px", borderRadius: "8px", border: "1px solid var(--border)" },
            text: "# desde otro equipo de la red\nely serve --host 0.0.0.0 --port " + (data.port || 8765) + "\ncurl http://<host>:" + (data.port || 8765) + "/api/health\ncurl -H \"Authorization: Bearer " + (token ? token.slice(0, 8) + "…" : "…") + "\" http://<host>:" + (data.port || 8765) + "/api/profiles"
          })
        ])
      ]));

      UI.clear(clientsCard);
      clientsCard.appendChild(UI.el("h3", { text: "Clientes emparejados" }));
      const clients = data.clients || [];
      if (!clients.length) {
        clientsCard.appendChild(UI.el("p", { class: "muted", style: { fontSize: "12px", margin: 0 },
          text: "Ningún cliente externo ha usado el token todavía. El campo se rellena cuando un cliente se registra contra la API." }));
      } else {
        clients.forEach((client) => {
          clientsCard.appendChild(UI.el("div", { class: "row between", style: { borderTop: "1px solid var(--border)", padding: "8px 0" } }, [
            UI.el("span", { class: "mono", text: client.name || client.id || "cliente" }),
            UI.el("span", { class: "muted", text: UI.date(client.at) })
          ]));
        });
      }
    }

    API.pairing().then(renderCard).catch((err) => {
      UI.clear(card);
      card.appendChild(UI.errBox(err, () => App.render()));
    });

    return root;
  };
})();
