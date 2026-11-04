/* Contador de palabras · extensión de ejemplo de Ely IDE.
 * Se ejecuta en un iframe con sandbox: solo usa la API `ely`.
 * Los textos siguen el idioma de la interfaz con ely.l10n(es, en). */
function stats(text) {
  const lines = text ? text.split("\n").length : 0;
  const words = (text.match(/[\p{L}\p{N}_'-]+/gu) || []).length;
  return { lines, words, chars: text.length };
}

async function refresh(ely) {
  const file = await ely.editor.getActiveFile();
  if (!file || !file.path) {
    await ely.window.setStatusBar("wordCount", "");
    return;
  }
  const text = (await ely.editor.getText()) || "";
  const s = stats(text);
  await ely.window.setStatusBar(
    "wordCount",
    `${s.words} ${ely.l10n("palabras", "words")}`,
    `${s.lines} ${ely.l10n("líneas", "lines")} · ${s.chars} ${ely.l10n("caracteres", "characters")} · ${file.path}`
  );
}

async function registerCommands(ely) {
  await ely.commands.register(
    "ely.wordCount.show",
    ely.l10n("Contador: mostrar detalle", "Word count: show detail"),
    async () => {
      const file = await ely.editor.getActiveFile();
      if (!file || !file.path) {
        await ely.window.showMessage(ely.l10n("Abre un archivo primero", "Open a file first"), "warn");
        return;
      }
      const s = stats((await ely.editor.getText()) || "");
      await ely.window.showDocument(ely.l10n("Contador · ", "Word count · ") + file.path, [
        `${ely.l10n("Archivo", "File")}: ${file.path}`,
        `${ely.l10n("Lenguaje", "Language")}: ${file.language}`,
        `${ely.l10n("Líneas", "Lines")}: ${s.lines}`,
        `${ely.l10n("Palabras", "Words")}: ${s.words}`,
        `${ely.l10n("Caracteres", "Characters")}: ${s.chars}`
      ].join("\n"));
    }
  );

}

async function activate(ely) {
  await registerCommands(ely);
  ely.editor.onDidChangeActiveEditor(() => refresh(ely));
  ely.editor.onDidChangeText(() => refresh(ely));
  ely.editor.onDidSaveTextDocument(() => refresh(ely));
  ely.on("language", async () => { await registerCommands(ely); await refresh(ely); });
  await refresh(ely);
  ely.log(ely.l10n("contador de palabras listo", "word count ready"));
}
