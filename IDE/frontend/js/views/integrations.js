/* Integraciones: perfiles, URL y API Key con prueba REAL por perfil. */
(function () {
  "use strict";

  window.Views = window.Views || {};

  window.Views.integrations = function (view, App) {
    const root = UI.el("div", { class: "stack" });
    const probeState = {};

    root.appendChild(UI.head(
      "Integrations",
      "Conecta sistemas externos.<br>" +
      "«Probar» lanza una petición HTTP de verdad (max_tokens=1) y devuelve el código del proveedor.",
      [
        UI.btn("Probar todos", async (event) => {
          const btn = event.currentTarget;
          btn.disabled = true;
          btn.innerHTML = "";
          btn.appendChild(UI.spinner());
          btn.appendChild(UI.el("span", { text: " probando 11 perfiles…" }));
          try {
            const data = await API.testAll();
            (data.results || []).forEach((r) => { probeState[r.profile] = r; });
            renderCards();
            const reachable = (data.results || []).filter((r) => r.reachable).length;
            UI.toast(reachable ? "warn" : "err", "Prueba completada",
              reachable + " endpoint(s) respondieron · "
              + (data.results || []).filter((r) => r.ok).length + " con respuesta válida");
          } catch (err) {
            UI.toast("err", "Error en la prueba", err.message);
          }
          btn.disabled = false;
          UI.clear(btn);
          btn.appendChild(UI.el("span", { text: "▷ Probar todos" }));
        }, { primary: true }),
        UI.btn("Cómo añadir claves", () => {
          UI.modal({
            title: "Claves reales vs claves de prueba",
            body: UI.el("div", { class: "stack" }, [
              UI.el("p", { class: "dim", style: { margin: 0 }, text: "El repositorio incluye 11 fixtures APikeyexample-n (n = 1…11) para validar el flujo completo. No sirven para autenticar: el proveedor responde 401/403." }),
              UI.el("p", { class: "dim", style: { margin: 0 }, text: "Para usar credenciales reales, guárdalas fuera de git en .ely/keys.env con el nombre de variable de cada perfil. También puedes escribirlas desde cada tarjeta." }),
              UI.el("pre", { class: "mono", style: { background: "var(--bg)", padding: "12px", borderRadius: "10px", border: "1px solid var(--border)" },
                text: "# .ely/keys.env  (ignorado por git)\nOPENAI_API_KEY=sk-...\nANTHROPIC_API_KEY=sk-ant-...\nGROQ_API_KEY=gsk_...\n\n# o variable de entorno:\nexport OPENAI_API_KEY=sk-..." }),
              UI.el("p", { class: "muted", style: { margin: 0, fontSize: "12px" }, text: "Prioridad: entorno > .ely/keys.env > profiles/test-keys.env." })
            ])
          });
        }, { ghost: true })
      ]
    ));

    const grid = UI.el("div", { class: "grid auto" });
    root.appendChild(grid);

    const footer = UI.el("div", { class: "card", style: { marginTop: "4px" } }, [
      UI.el("h3", null, [UI.el("span", { text: "Diagnóstico de red" }),
        UI.el("span", { class: "hint", text: "qué significa cada resultado" })]),
      UI.el("dl", { class: "kv", style: { fontSize: "12px" } }, [
        UI.el("dt", { text: "✓ en línea" }),
        UI.el("dd", { text: "HTTP 200 del endpoint de chat: URL, ruta, clave y modelo son válidos." }),
        UI.el("dt", { text: "! auth rechazada" }),
        UI.el("dd", { text: "HTTP 401/403: el endpoint y la ruta existen y la cabecera llegó; la clave no es aceptada (lo esperado con APikeyexample-n)." }),
        UI.el("dt", { text: "✗ sin respuesta" }),
        UI.el("dd", { text: "No hubo respuesta HTTP: DNS, TLS o un proxy de salida bloquea el host. No es un problema de la clave." })
      ])
    ]);
    root.appendChild(footer);

    function renderCards() {
      UI.clear(grid);
      App.profiles.forEach((profile, index) => {
        const probe = probeState[profile.id];
        const card = UI.el("div", { class: "card", style: { borderTop: "2px solid " + (profile.color || "var(--accent)") } });

        const keyInput = UI.el("input", {
          type: "password",
          placeholder: profile.has_key ? profile.masked_key + " (oculta)" : "sin clave",
          autocomplete: "new-password"
        });

        card.appendChild(UI.el("div", { class: "row between", style: { marginBottom: "10px" } }, [
          UI.el("div", null, [
            UI.el("div", { style: { fontWeight: 650, fontSize: "14px" }, text: profile.label }),
            UI.el("div", { class: "muted mono", style: { fontSize: "10.5px" }, text: "#" + (index + 1) + " · " + profile.provider })
          ]),
          UI.badge(
            probe ? (probe.ok ? "en línea" : (probe.reachable ? "auth rechazada" : "sin respuesta")) : (profile.has_key ? "listo" : "sin clave"),
            probe ? (probe.ok ? "ok" : (probe.reachable ? "warn" : "err")) : (profile.has_key ? "info" : "err")
          )
        ]));

        card.appendChild(UI.el("dl", { class: "kv", style: { fontSize: "11.5px" } }, [
          UI.el("dt", { text: "modelo" }), UI.el("dd", { class: "mono", text: profile.model }),
          UI.el("dt", { text: "URL" }), UI.el("dd", { class: "mono", style: { fontSize: "10.5px" }, text: profile.base_url }),
          UI.el("dt", { text: "variable" }), UI.el("dd", { class: "mono", text: profile.key_var }),
          UI.el("dt", { text: "clave" }), UI.el("dd", { class: "mono", text: profile.masked_key || "—" }),
          UI.el("dt", { text: "origen" }), UI.el("dd", { class: "mono", style: { fontSize: "10.5px" }, text: profile.key_origin || "—" }),
          probe && probe.latency_ms !== undefined ? UI.el("dt", { text: "latencia" }) : null,
          probe && probe.latency_ms !== undefined ? UI.el("dd", { text: probe.latency_ms + " ms · HTTP " + (probe.status || "—") }) : null
        ]));

        if (probe && !probe.ok && probe.detail) {
          card.appendChild(UI.el("p", {
            style: { fontSize: "11.5px", margin: "10px 0 0", color: probe.reachable ? "var(--amber)" : "var(--red)" },
            text: probe.detail
          }));
        }

        card.appendChild(UI.el("div", { class: "divider" }));
        card.appendChild(keyInput);
        card.appendChild(UI.el("div", { class: "row", style: { marginTop: "8px" } }, [
          UI.btn("Guardar clave", async (event) => {
            const value = keyInput.value.trim();
            if (!value) { UI.toast("warn", "Escribe una clave", "No se guardó nada."); return; }
            const btn = event.currentTarget;
            btn.disabled = true;
            try {
              await API.setKey(profile.id, value);
              const fresh = await API.profiles();
              App.profiles = fresh.profiles || [];
              keyInput.value = "";
              UI.toast("ok", "Clave guardada", profile.key_var + " en .ely/keys.env");
              App.render();
            } catch (err) {
              UI.toast("err", "No se guardó", err.message);
            }
            btn.disabled = false;
          }, { small: true, primary: true }),
          UI.btn("Probar", async (event) => {
            const btn = event.currentTarget;
            btn.disabled = true;
            UI.clear(btn).appendChild(UI.spinner());
            try {
              probeState[profile.id] = await API.testProfile(profile.id, "chat");
            } catch (err) {
              probeState[profile.id] = { profile: profile.id, ok: false, reachable: false, detail: err.message };
            }
            renderCards();
          }, { small: true }),
          UI.btn("Usar", () => App.setProfile(profile.id), {
            small: true, ghost: true, disabled: profile.id === App.profileId()
          })
        ]));
        grid.appendChild(card);
      });
    }

    renderCards();
    return root;
  };
})();
