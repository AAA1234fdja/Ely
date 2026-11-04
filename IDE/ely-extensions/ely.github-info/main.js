/* Info de GitHub · ejemplo de COMUNICACIÓN EXTERNA.
 *
 * El iframe no tiene salida a Internet: `ely.fetch` envía la petición al
 * backend, que comprueba el permiso "network:api.github.com" del manifiesto
 * antes de salir. Si el permiso no existe, el host devuelve 403. */
function fmt(ely, n) {
  return new Intl.NumberFormat(ely.env.language === "en" ? "en" : "es").format(Number(n) || 0);
}

async function lookup(ely, slug) {
  const clean = String(slug || "").trim().replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "");
  if (!/^[\w.-]+\/[\w.-]+$/.test(clean)) {
    await ely.window.showMessage(ely.l10n("Escribe un repositorio con formato owner/repo", "Type a repository as owner/repo"), "warn");
    return;
  }
  await ely.window.setStatusBar("githubInfo", ely.l10n("GitHub: consultando…", "GitHub: querying…"));
  try {
    const res = await ely.fetch("https://api.github.com/repos/" + clean, {
      headers: { Accept: "application/vnd.github+json" }
    });
    if (!res.ok) {
      await ely.window.setStatusBar("githubInfo", "");
      await ely.window.showMessage(ely.l10n(`GitHub respondió HTTP ${res.status}`, `GitHub replied HTTP ${res.status}`), "err");
      return;
    }
    const repo = JSON.parse(res.text);
    await ely.window.setStatusBar("githubInfo", `★ ${fmt(ely, repo.stargazers_count)}`);
    const L = (es, en) => ely.l10n(es, en);
    await ely.window.showDocument("GitHub · " + repo.full_name, [
      `${L("Nombre", "Name")}:        ${repo.full_name}`,
      `${L("Descripción", "Description")}:   ${repo.description || "—"}`,
      `${L("Lenguaje", "Language")}:      ${repo.language || "—"}`,
      `${L("Estrellas", "Stars")}:     ${fmt(ely, repo.stargazers_count)}`,
      `Forks:         ${fmt(ely, repo.forks_count)}`,
      `Issues:        ${fmt(ely, repo.open_issues_count)}`,
      `${L("Licencia", "License")}:      ${(repo.license && repo.license.name) || "—"}`,
      `${L("Actualizado", "Updated")}:   ${repo.updated_at}`,
      ``,
      L(`Consulta real a api.github.com en ${res.ms} ms a través del proxy del host.`,
        `Real request to api.github.com in ${res.ms} ms through the host proxy.`)
    ].join("\n"));
  } catch (err) {
    await ely.window.setStatusBar("githubInfo", "");
    await ely.window.showMessage(ely.l10n("Sin salida de red: ", "No network access: ") + err.message, "err");
  }
}

async function registerCommands(ely) {
  await ely.commands.register("ely.githubInfo.lookup",
    ely.l10n("GitHub: información de un repositorio", "GitHub: repository information"), async () => {
    const slug = await ely.window.showInputBox({
      title: ely.l10n("Repositorio de GitHub", "GitHub repository"),
      placeholder: ely.l10n("owner/repo · p. ej. microsoft/vscode", "owner/repo · e.g. microsoft/vscode"),
      value: "microsoft/vscode"
    });
    if (slug) await lookup(ely, slug);
  });
}

async function activate(ely) {
  await registerCommands(ely);
  ely.on("language", async () => {
    await registerCommands(ely);
    ely.log(ely.l10n("GitHub info listo", "GitHub info ready") + " (network:api.github.com)");
  });
  ely.log(ely.l10n("GitHub info listo", "GitHub info ready") + " (network:api.github.com)");
}
