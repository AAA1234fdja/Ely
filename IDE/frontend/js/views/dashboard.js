/* Panel: estado real del sistema, telemetría y actividad. */
(function () {
  "use strict";

  window.Views = window.Views || {};

  window.Views.dashboard = function (view, App) {
    const root = UI.el("div", { class: "stack" });
    const profile = App.profile();

    root.appendChild(UI.el("div", { class: "hero" }, [
      UI.el("h2", { text: "Ely Cowork" }),
      UI.el("p", {
        html: "Agent OS local. La interfaz habla con el servidor Python, que firma cada petición con la clave del perfil activo. " +
          "Sin respuestas simuladas: si el proveedor falla, lo verás aquí."
      }),
      UI.el("div", { class: "row" }, [
        UI.btn("Abrir chat", () => App.navigate("chat"), { primary: true, icon: "❯" }),
        UI.btn("Probar conexión", async (event) => {
          const btn = event.currentTarget;
          btn.disabled = true;
          try {
            const result = await API.testProfile(App.profileId(), "chat");
            showProbe(result);
          } catch (err) {
            UI.toast("err", "Prueba fallida", err.message);
          }
          btn.disabled = false;
        }, { icon: "▷" }),
        UI.btn("Integraciones", () => App.navigate("integrations"), { ghost: true })
      ])
    ]));

    const metrics = UI.el("div", { class: "grid cols-4" });
    const activity = UI.el("div", { class: "grid cols-2" });
    root.appendChild(metrics);
    root.appendChild(activity);

    function showProbe(result) {
      UI.modal({
        title: result.ok ? "Conexión verificada" : (result.reachable ? "Endpoint alcanzable" : "Sin respuesta"),
        subtitle: result.profile,
        body: UI.el("div", { class: "stack" }, [
          UI.el("div", { class: "row" }, [
            UI.badge(result.ok ? "200 OK" : "HTTP " + (result.status || "—"), result.ok ? "ok" : (result.reachable ? "warn" : "err")),
            UI.el("span", { class: "muted", text: result.latency_ms + " ms" }),
            result.is_test_key ? UI.badge("clave de prueba", "warn") : null
          ]),
          UI.el("dl", { class: "kv" }, [
            UI.el("dt", { text: "endpoint" }), UI.el("dd", { class: "mono", text: result.url }),
            UI.el("dt", { text: "credencial" }), UI.el("dd", { class: "mono", text: result.credential || "sin valor" }),
            UI.el("dt", { text: "detalle" }), UI.el("dd", { text: result.detail })
          ]),
          result.error_detail ? UI.el("pre", {
            class: "mono",
            style: { whiteSpace: "pre-wrap", background: "#0a0c12", padding: "10px", borderRadius: "9px", fontSize: "11px" },
            text: typeof result.error_detail === "string" ? result.error_detail : JSON.stringify(result.error_detail, null, 2)
          }) : null,
          result.hint ? UI.el("p", { class: "muted", style: { fontSize: "12px", margin: 0 }, text: result.hint }) : null
        ])
      });
    }

    /* ---------------------------------------------------------- datos reales */
    Promise.allSettled([API.stats(), API.calls(12), API.costs()]).then(([statsR, callsR, costsR]) => {
      const stats = statsR.status === "fulfilled" ? statsR.value : null;
      const calls = callsR.status === "fulfilled" ? callsR.value.calls || [] : [];
      const costs = costsR.status === "fulfilled" ? costsR.value : null;

      UI.clear(metrics);
      const keyKind = profile ? (profile.has_key ? (profile.is_test_key ? "warn" : "ok") : "err") : "err";
      metrics.appendChild(UI.el("div", { class: "card metric" }, [
        UI.el("span", { class: "label", text: "Perfil activo" }),
        UI.el("span", { class: "value", style: { fontSize: "19px" }, text: profile ? profile.label : "—" }),
        UI.el("span", { class: "sub row", style: { gap: "6px" } }, [
          UI.badge(profile ? (profile.is_test_key ? "clave de prueba" : "clave propia") : "sin perfil", keyKind),
          UI.el("span", { class: "mono trunc", style: { maxWidth: "140px" }, text: profile ? profile.model : "" })
        ])
      ]));
      metrics.appendChild(UI.metric(
        "Llamadas",
        UI.num(stats ? stats.total_calls : 0),
        stats && stats.success_rate !== null ? stats.success_rate + "% con éxito" : "sin historial"
      ));
      metrics.appendChild(UI.metric(
        "Tokens",
        UI.num(stats ? stats.total_tokens : 0),
        stats && stats.avg_latency_ms ? "latencia media " + UI.ms(stats.avg_latency_ms) : "según usage del proveedor"
      ));
      metrics.appendChild(UI.metric(
        "Coste estimado",
        costs ? UI.money(costs.total_cost) : "—",
        costs && costs.total_cost === 0 ? "define tarifas en el perfil" : "tarifas por perfil"
      ));

      /* tarjeta de perfiles */
      const profilesCard = UI.el("div", { class: "card" }, [
        UI.el("h3", null, [UI.el("span", { text: "Perfiles" }),
          UI.el("span", { class: "hint", text: App.profiles.length + " configurados" })]),
        UI.el("div", { class: "table-wrap", style: { maxHeight: "260px" } })
      ]);
      const table = UI.el("table");
      table.appendChild(UI.el("thead", null, [UI.el("tr", null, ["Perfil", "Endpoint", "Clave", ""].map(
        (h) => UI.el("th", { text: h })
      ))]));
      const tbody = UI.el("tbody");
      App.profiles.forEach((p) => {
        const tr = UI.el("tr", null, [
          UI.el("td", null, [
            UI.el("div", { style: { fontWeight: 600 }, text: p.label }),
            UI.el("div", { class: "muted mono", style: { fontSize: "10.5px" }, text: p.model })
          ]),
          UI.el("td", { class: "mono trunc", style: { maxWidth: "230px" }, title: p.base_url, text: p.base_url.replace(/^https?:\/\//, "") }),
          UI.el("td", null, [
            UI.badge(p.has_key ? p.masked_key : "sin clave", p.is_test_key ? "warn" : (p.has_key ? "ok" : "err"))
          ]),
          UI.el("td", { class: "right" }, [
            UI.btn("usar", (event) => {
              event.stopPropagation();
              App.setProfile(p.id);
            }, { small: true, ghost: true, disabled: p.id === App.profileId() })
          ])
        ]);
        tr.addEventListener("dblclick", () => App.setProfile(p.id));
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      profilesCard.querySelector(".table-wrap").appendChild(table);
      activity.appendChild(profilesCard);

      /* actividad */
      const actCard = UI.el("div", { class: "card" }, [
        UI.el("h3", null, [UI.el("span", { text: "Actividad reciente" }),
          UI.el("span", { class: "hint", text: "telemetría local" })])
      ]);
      if (!calls.length) {
        actCard.appendChild(UI.empty("◷", "Sin llamadas registradas. Abre el chat y envía un mensaje."));
      } else {
        const list = UI.el("div", { class: "side-list", style: { maxHeight: "300px", overflowY: "auto" } });
        calls.forEach((call) => {
          list.appendChild(UI.el("div", { class: "side-item" }, [
            UI.el("div", { class: "row between" }, [
              UI.el("span", { class: "mono", text: call.profile }),
              UI.badge(call.ok ? "ok" : "fallo", call.ok ? "ok" : "err")
            ]),
            UI.el("small", { text: [call.kind, call.model, (call.usage && call.usage.total_tokens ? call.usage.total_tokens + " tokens" : null), UI.date(call.at)].filter(Boolean).join(" · ") }),
            call.error ? UI.el("small", { style: { color: "#ffaab1" }, text: String(call.error).slice(0, 120) }) : null
          ]));
        });
        actCard.appendChild(list);
      }
      activity.appendChild(actCard);
    }).catch((err) => {
      UI.clear(metrics);
      metrics.appendChild(UI.errBox(err, () => App.render()));
    });

    return root;
  };
})();
