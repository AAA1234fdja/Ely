# Extensiones de Ely

Sistema de extensiones propio del IDE de Ely: **aisladas, con permisos declarados
y con salida a Internet controlada por el backend**.

> **No es el marketplace de VS Code.** Los `.vsix` de VS Code usan otra API
> (`require("vscode")`) y necesitan el host de extensiones de Node/Electron, que
> no existe en un navegador. Ely usa su propio formato, descrito aquí, y lo dice
> también en la interfaz. No se simula compatibilidad.

## Formato

Una carpeta con dos archivos:

```
mi-extension/
├── ely-extension.json
└── main.js
```

`ely-extension.json`:

```json
{
  "id": "mi.extension",
  "name": "Mi extensión",
  "version": "1.0.0",
  "publisher": "tu-nombre",
  "description": "Qué hace",
  "main": "main.js",
  "permissions": ["editor", "ui", "commands", "completions", "network:api.github.com"],
  "activationEvents": ["onStartup"],
  "contributes": { "commands": [{ "id": "mi.comando", "title": "Mi comando" }] }
}
```

`main.js` exporta una función `activate(ely)` (o `extension.activate`):

```js
async function activate(ely) {
  await ely.commands.register("mi.comando", "Mi comando", async () => {
    const file = await ely.editor.getActiveFile();
    await ely.window.showMessage("Archivo: " + (file && file.name));
  });
}
```

## Idioma de la extensión

La interfaz puede estar en español o en inglés y la extensión también:

- En el manifiesto, `l10n` traduce nombre y descripción:

  ```json
  "l10n": { "en": { "name": "Word count", "description": "Words and lines" } }
  ```

- En el código, `ely.env.language` y `ely.l10n(es, en)` eligen el texto, y el
  evento `language` avisa del cambio para volver a registrar comandos:

  ```js
  await ely.commands.register("mi.comando", ely.l10n("Mi comando", "My command"), fn);
  ely.on("language", () => registerCommands(ely));
  ```

## Permisos

| Permiso | Qué permite |
|---|---|
| `editor` | Leer el archivo activo, su texto y selección; insertar y reemplazar texto |
| `workspace:read` | Leer archivos, listar carpetas y buscar en el workspace |
| `workspace:write` | Escribir archivos del workspace |
| `ui` | Toasts, barra de estado, quick pick, input box y documentos en modal |
| `commands` | Registrar y ejecutar comandos (aparecen en la paleta) |
| `completions` | Registrar proveedores de autocompletado (se aceptan con **Tab**) |
| `chat` | Enviar mensajes al chat con el perfil activo |
| `network:<host>` | Salida a Internet **solo** a ese host, a través del proxy del backend |

Sin el permiso, la llamada falla con `Permiso no declarado: <permiso>`.

## Aislamiento

Cada extensión corre en `<iframe sandbox="allow-scripts">` **sin
`allow-same-origin`**: origen opaco, sin DOM de la aplicación, sin cookies, sin
`localStorage` y sin red propia. El único canal es `postMessage` con el host
(`js/ext-host.js`), que comprueba el origen del mensaje y los permisos.

## Comunicación externa

El iframe no puede hacer `fetch`. `ely.fetch(url, opts)` envía la petición al
backend (`POST /api/extensions/call` con `op:"fetch"`), que:

1. comprueba que la extensión está activada;
2. comprueba el permiso `network:<host>` del manifiesto;
3. valida el esquema (`https`/`http`) y el host;
4. hace la petición real y devuelve `{ok, status, text, headers, ms}`.

```js
const res = await ely.fetch("https://api.github.com/repos/microsoft/vscode");
if (res.ok) {
  const repo = JSON.parse(res.text);
  await ely.window.setStatusBar("stars", "★ " + repo.stargazers_count);
}
```

Hosts de red permitidos por defecto para `network:*`: `api.github.com`,
`github.com`, `codeload.github.com`, `registry.npmjs.org`, `pypi.org`,
`files.pythonhosted.org`. Se amplían con la variable de entorno
`ELY_EXT_ALLOW_HOSTS` (lista separada por comas).

## Instalación

Desde la vista **Extensiones** o desde el panel lateral del IDE:

| Origen | Ejemplo |
|---|---|
| GitHub | `owner/repo` o `https://github.com/owner/repo` |
| npm | `npm:paquete` |
| URL | `https://…/extension.tar.gz` o `https://…/ely-extension.json` |
| Carpeta local | ruta del servidor, o botón **Desde carpeta del ordenador** |

Hosts de descarga permitidos: `github.com`, `codeload.github.com`,
`api.github.com`, `registry.npmjs.org`, `pypi.org`, `files.pythonhosted.org`.
Límites: 8 MB por descarga, 400 archivos, sin enlaces simbólicos ni rutas que
escapen de la carpeta (`..`).

Las extensiones se instalan en `.ely/extensions/<id>/` y el índice vive en
`.ely/extensions/index.json`. Las incluidas con el IDE están en
`IDE/ely-extensions/` y no se pueden desinstalar, solo desactivar.

## API `ely.*`

- `commands.register(id, title, handler)` · `commands.execute(id, args)`
- `window.showMessage(text, kind)` · `window.setStatusBar(id, text, tooltip)`
- `window.showQuickPick(items, options)` · `window.showInputBox(options)`
- `window.showDocument(title, text)`
- `workspace.readFile(path)` · `workspace.writeFile(path, content)`
- `workspace.list(path)` · `workspace.search(q)`
- `editor.getActiveFile()` · `editor.getText()` · `editor.getSelection()`
- `editor.getLanguage()` · `editor.insertText(text)` · `editor.replaceSelection(text)`
- `languages.registerCompletionItemProvider(selector, provider, triggers)`
- `chat.send(text)`
- `fetch(url, options)`
- `on(event, handler)` · `log(text)`

Eventos: `activeEditor`, `changeText`, `saved`.

## Autocompletado con Tab

Un proveedor devuelve ítems `{label, insertText, detail, kind, replacePrefix}`:

```js
await ely.languages.registerCompletionItemProvider(["python"], {
  label: "Mis snippets",
  provideCompletionItems(ctx) {           // ctx: {text, prefix, language, position, lineIndex, lineText, indent}
    if (!"def".startsWith(ctx.prefix)) return [];
    return [{ label: "def", insertText: "def nombre(arg):\n    return arg\n", detail: "función" }];
  }
});
```

El motor de autocompletado (`js/completion.js`) está **activado por defecto** y
mezcla proveedores de extensiones, snippets del lenguaje, palabras clave y
palabras del propio archivo. Teclas: **Tab** acepta · **Esc** descarta ·
**Alt+]** / **Alt+[** cambian de candidato · **Ctrl+Espacio** fuerza la
sugerencia. Se desactiva en Ajustes → *Completar código con Tab*, en el menú Ver
o en el indicador `Tab ✓` de la barra de estado. Cuando el modo de accesibilidad
*Tab mueve el foco* (Ctrl+M) está activo, Tab vuelve a mover el foco.

## Extensiones incluidas

| Extensión | Qué hace | Permisos |
|---|---|---|
| `ely.word-count` | Palabras, líneas y caracteres en la barra de estado + comando | `editor`, `ui`, `commands` |
| `ely.python-snippets` | 17 snippets de Python aceptados con Tab | `completions`, `editor` |
| `ely.github-info` | Consulta real a `api.github.com` y muestra los datos del repo | `ui`, `commands`, `network:api.github.com` |

## Rutas HTTP

| Ruta | Uso |
|---|---|
| `GET /api/extensions` | Lista, permisos disponibles y hosts permitidos |
| `POST /api/extensions/call` | `{op, args}` con `list`, `install`, `uninstall`, `enable`, `manifest`, `fetch`, `readme` |
| `GET /api/extensions/runner?id=` | HTML del sandbox con `main.js` inline y el puente `postMessage` |
| `GET /api/extensions/asset?id=&path=` | Recursos estáticos de la extensión |

## CLI

```bash
ely extensions list
ely extensions install owner/repo
ely extensions install npm:paquete
ely extensions enable mi.extension --off
ely extensions uninstall mi.extension
```
