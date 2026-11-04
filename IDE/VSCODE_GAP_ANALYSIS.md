# Inventario y análisis de brechas · Ely IDE vs. código base de VS Code

Auditoría de **toda** la carpeta `IDE/` (no solo `frontend/`). Fecha: 2026-11-03.
Rama: `arena/92466244-ely`.

## 1. Qué se auditó

| Ruta | Tamaño | Qué es |
|---|---|---|
| `IDE/src/` | 207 MB | Código base real de VS Code (`vs/editor`, `vs/workbench`, `vs/platform`, `vs/base`). |
| `IDE/extensions/` | 90 MB | 106 extensiones integradas (gramáticas TextMate, temas, LSP de TS/JSON/CSS/HTML, Git, Emmet, Markdown…). |
| `IDE/src/vs/workbench/contrib/` | **101 módulos** | Funcionalidad de la ventana: chat, debug, terminal, SCM, search, notebooks, accesibilidad… |
| `IDE/src/vs/editor/contrib/` | **59 módulos** | Funcionalidad del editor: find, folding, multicursor, suggest, hover, rename… |
| `IDE/src/vs/workbench/contrib/accessibility*` | 2 módulos | Accesibilidad y señales accesibles (referencia para la fase 3). |
| `IDE/frontend/` | ~600 KB | **Nuestra** interfaz web (HTML + 14 JS + CSS). Es lo que corre en el navegador. |
| `CLI/ely_cli/ideops.py` | 439 líneas | Backend real de operaciones del IDE (35 operaciones). |
| `IDE/test/`, `cli/`, `build/`, `scripts/`, `resources/`, `copilot_shim/` | ~7 MB | Tests, CLI de VS Code, gulp, iconos, shim de Copilot. |

**Hallazgo principal:** el código de VS Code está en el repo como **referencia/fuente**, pero
**no se compila ni se sirve**: `ely serve` publica `IDE/frontend/`, que es una implementación
propia en JS plano (`views/ide.js`, 1016 líneas). Por tanto, todo lo que VS Code tiene y
`frontend/` no tiene es una **brecha real**, aunque el código esté presente en el disco.

### Leyenda de estado

- ✅ **Hecho** — funciona en `frontend/` contra el backend real.
- 🟡 **Parcial** — existe una versión mínima; falta el resto.
- 🌐 **Viable en web** — se puede implementar sin salir del navegador (candidato a añadir).
- ⛔ **No viable tal cual** — requiere proceso nativo, LSP, DAP, marketplace o Electron. Se marca
  «próximamente» en la UI con su motivo, nunca se simula.

---

## 2. Editor de texto (`src/vs/editor/contrib`, 59 módulos)

| Módulo VS Code | Estado en Ely | Qué falta exactamente | Viabilidad |
|---|---|---|---|
| `find` | 🟡 | Buscar sí; faltan regex/case/whole-word, contador «n de m», buscar en selección, F3/Shift+F3 | 🌐 |
| `replace` | 🟡 | Reemplazar uno/todos sí; faltan previsualización y preserve-case | 🌐 |
| `multicursor` | ⛔→🌐 | `textarea` no soporta cursores múltiples; requiere editor propio o CodeMirror | 🌐 (coste alto) |
| `folding` | 🟡 | Plegado de carpetas del árbol sí; **plegado de código no** | 🌐 |
| `bracketMatching` | ❌ | Resaltado de paréntesis/llaves pareja y salto con Ctrl+Shift+\ | 🌐 |
| `wordHighlighter` | ❌ | Resaltar otras apariciones de la palabra bajo el cursor | 🌐 |
| `indentation` | 🟡 | Inserta 2 espacios; falta auto-indent al Enter, detectar sangría del archivo, Tabs/Espacios configurable | 🌐 |
| `comment` | ✅ | Ctrl+/ alterna comentario por lenguaje | — |
| `linesOperations` | ✅ | Copiar/mover/borrar línea, ordenar, duplicar | — |
| `smartSelect` | ❌ | Expand/reduce selección por sintaxis (Shift+Alt+→) | 🌐 |
| `format` | ❌ | Formatear documento/selección (necesita formateador: Prettier/black vía backend) | 🌐 (backend) |
| `snippet` | ❌ | Snippets con tabstops y placeholders | 🌐 |
| `suggest` | ❌ | Autocompletado (IntelliSense). Sin LSP solo por palabras del documento | 🌐 limitado / ⛔ LSP |
| `hover` | ❌ | Tooltip con tipo/firma/doc | ⛔ LSP |
| `parameterHints` | ❌ | Ayuda de parámetros al escribir `(` | ⛔ LSP |
| `codelens` | ❌ | Acciones sobre la línea («2 referencias», «Ejecutar test») | ⛔ LSP |
| `inlayHints` | ❌ | Tipos/nombres de parámetro intercalados | ⛔ LSP |
| `rename` | ❌ | Renombrar símbolo en todo el proyecto | 🌐 con `replace` acotado / ⛔ real LSP |
| `gotoSymbol` / `documentSymbols` | ✅ | Outline con símbolos reales del backend (`symbols`) | — |
| `gotoError` | 🟡 | Panel Problems existe; falta F8/Shift+F8 sobre diagnósticos reales | 🌐 (backend) |
| `links` | ❌ | Ctrl+clic en URLs/rutas del código | 🌐 |
| `colorPicker` | ❌ | Muestra y edita colores CSS inline | 🌐 |
| `stickyScroll` | ❌ | Cabecera pegajosa con el ámbito actual | 🌐 |
| `unicodeHighlighter`, `unusualLineTerminators` | ❌ | Aviso de caracteres invisibles/ambiguos | 🌐 |
| `fontZoom` | ❌ | Ctrl+± para tamaño de fuente del editor | 🌐 |
| `toggleTabFocusMode` | ❌ | Ctrl+M: Tab mueve el foco en vez de indentar (accesibilidad) | 🌐 **fase 3** |
| `dnd`, `clipboard`, `contextmenu`, `middleScroll`, `anchorSelect`, `cursorUndo`, `lineSelection`, `wordOperations`, `wordPartOperations`, `caretOperations`, `inPlaceReplace` | 🟡 | Comportamiento nativo del `textarea` cubre lo básico; faltan atajos avanzados | 🌐 |
| `tokenization`, `semanticTokens` | 🟡 | `syntax.js` resalta 261 lenguajes (93 familias) con regex; sin tokens semánticos | 🌐 limitado / ⛔ LSP |
| `peekView`, `zoneWidget`, `floatingMenu`, `inlineProgress`, `message`, `placeholderText`, `readOnlyMessage`, `longLinesHelper`, `sectionHeaders`, `editorState`, `diffEditorBreadcrumbs`, `symbolIcons`, `linkedEditing`, `insertFinalNewLine`, `dropOrPasteInto`, `quickAccess`, `inlineCompletions`, `gpu` | ❌ | Widgets sobre el editor, edición enlazada de etiquetas, autocompletado IA inline, render GPU | 🌐 mayormente / ⛔ IA inline |
| `codeAction` | ❌ | Quick fixes (bombilla) | ⛔ LSP |

**Minimapa:** no existe (`minimap` está en `vs/editor/browser/viewParts`). ❌ 🌐 (canvas, coste medio).

---

## 3. Workbench (`src/vs/workbench/contrib`, 101 módulos)

### 3.1 Ya implementado en Ely

`files` (árbol, abrir/guardar/crear/renombrar/borrar/copiar), `search` (buscar y reemplazar en
proyecto con previsualización), `scm` + `git` (estado, stage/unstage/discard, commit, log,
ramas, checkout, merge, remoto, blame, diff), `outline`, `localHistory`/`timeline` (historial
por archivo), `terminal` (backend real en el workspace), `output`, `markers` (panel Problems),
`tasks` (listar/ejecutar tareas del repo), `keybindings` (atajos + paleta), `themes` (tema
claro/oscuro del frontend), `preferences` (ajustes), `quickaccess` (Ctrl+P / Ctrl+Shift+P),
`chat`/`inlineChat` (chat con IA real por streaming, ahora con memoria por proyecto),
`welcomeGettingStarted` (pantalla de bienvenida del editor), `workspace`/`workspaces`
(proyectos, abrir carpeta del ordenador, sin proyecto por defecto).

### 3.2 Brechas viables en web (🌐) — candidatas al presupuesto

| Módulo | Qué falta | Coste estimado |
|---|---|---|
| `accessibility` + `accessibilitySignals` | **Todo**: sin ARIA, sin lector de pantalla, sin vista accesible, sin señales | 1200 líneas · **fase 3** |
| `breadcrumbs` | Migas de pan planas; falta navegación por niveles y símbolo | 80 |
| `folding` (editor) | Plegado de bloques de código | 200 |
| `bracketMatching` + `wordHighlighter` | Resaltados de contexto | 150 |
| `stickyScroll` | Cabecera de ámbito pegajosa | 120 |
| `minimap` | Minimapa en canvas | 180 |
| `keybindingsEditor` | Editor de atajos personalizables | 250 |
| `userDataProfile` | Perfiles de ajustes del IDE (no de API) | 150 |
| `zen`/`layout` (`workspaces`) | Modo Zen, disposición de paneles, arrastrar divisores | 200 |
| `snippets` | Snippets propios por lenguaje | 200 |
| `emmet` | Abreviaturas HTML/CSS | 250 |
| `markdown` | Vista previa Markdown lado a lado (hoy solo PDF/imagen) | 120 |
| `imageCarousel` | Comparar imágenes / zoom | 100 |
| `multiDiffEditor` | Diff de varios archivos a la vez | 180 |
| `mergeEditor` | Editor de conflictos de 3 paneles | 300 |
| `comments` | Comentarios/anotaciones en líneas (revisión) | 250 |
| `bulkEdit` | Previsualizar y aplicar reemplazos multiarchivo | 150 |
| `logs` | Visor de logs del servidor | 100 |
| `languageStatus` / `languageDetection` | Estado del lenguaje, detección por contenido | 100 |
| `limitIndicator` | Aviso de archivos muy grandes | 60 |
| `welcomeWalkthrough` | Guía paso a paso del IDE | 150 |
| `performance` / `processExplorer` | Métricas reales del backend | 120 |

### 3.3 Brechas no viables tal cual (⛔) y su motivo honesto

| Módulo | Motivo |
|---|---|
| `debug`, `testing` | Requieren **DAP** (Debug Adapter Protocol) y ejecutores de test con proceso persistente y breakpoints reales. El navegador no puede adjuntarse a un proceso. Hoy «Ejecutar» corre el archivo en el backend y muestra la salida; los breakpoints están deshabilitados con motivo. |
| `extensions`, `mcp` (marketplace) | Instalar extensiones VSIX requiere el host de extensiones de VS Code (Node + Electron) y el marketplace. No hay API pública para ejecutarlas en un navegador. |
| `remote`, `remoteTunnel`, `remoteCodingAgents`, `editSessions` | Necesitan el servidor remoto de VS Code y túneles autenticados de Microsoft. |
| `notebook`, `interactive`, `replNotebook` | Kernel Jupyter real (ZeroMQ + proceso Python). Viable a futuro con un backend de kernels; hoy no. |
| `webview`, `webviewPanel`, `webviewView`, `customEditor`, `browserView` | Son contenedores Electron con aislamiento de procesos; en web se sustituirían por `iframe`, pero sin extensiones que los llenen no aportan. |
| `speech`, `agentsVoice` | Requieren el paquete de voz de VS Code (Azure Speech) y permisos de micrófono del sistema. |
| `authentication`, `github`, `encryption`, `policyExport`, `userDataSync`, `update`, `relauncher`, `telemetry`, `surveys`, `splash`, `share`, `url`, `opener`, `externalTerminal`, `externalUriOpener`, `meteredConnection`, `issue`, `onboarding`, `modernUI`, `canvases`, `imageCarousel` (nativo), `welcomeAgentSessions`, `welcomeBanner`, `welcomeOnboarding`, `welcomeViews` | Servicios de plataforma de Microsoft/Electron (secret storage, auto-update, terminal externo, encuestas, telemetría). No aplican a un IDE propio servido por Python. |
| `callHierarchy`, `typeHierarchy`, `codeActions`, `inlineCompletions`, `inlayHints` | Dependen de un **language server**. Sin LSP no hay datos que mostrar. |
| `sash`, `scrollLocking`, `list`, `tags`, `localization`, `themes` (TextMate), `commands`, `codeEditor`, `format`, `git` (submódulos profundos), `searchEditor`, `terminalContrib`, `preferences` (settings.json completo), `workspace` (multi-root) | Parcialmente cubiertos; lo que falta son detalles de la infraestructura de VS Code, no funciones de usuario. |

---

## 4. Extensiones integradas (`IDE/extensions/`, 106)

Presentes en disco pero **no cargadas** por nuestro frontend: gramáticas TextMate de ~40
lenguajes, temas Dark+/Light+, `typescript-language-features`, `json-language-features`,
`css-language-features`, `html-language-features`, `emmet`, `git`, `git-base`,
`markdown-language-features`, `markdown-math`, `references-view`, `search-result`,
`configuration-editing`, `merge-conflict`, `simple-browser`, `tunnel-forwarding`.

- 🌐 **Aprovechable sin compilar VS Code:** los `.tmTheme`/`.json` de temas y las gramáticas
  TextMate se pueden leer como datos (requiere un tokenizador TextMate en JS, ~600 líneas, o
  usar `shiki` desde npm). Hoy `syntax.js` usa regex propias para 93 familias que cubren los 261 lenguajes del catálogo.
- ⛔ **No aprovechable:** los `*-language-features` arrancan servidores LSP en Node.

---

## 5. Accesibilidad: qué tiene VS Code y qué nos falta (investigación fase 3)

Fuentes reales leídas: `src/vs/workbench/contrib/accessibility/browser/*` y
`src/vs/workbench/contrib/accessibilitySignals/browser/*`.

| Pieza de VS Code | Referencia en el código base | Estado en Ely antes de esta fase |
|---|---|---|
| Modo lector de pantalla + aviso al detectarlo | `accessibilityStatus.ts` («Screen Reader Optimized», «Screen reader usage detected…») | ❌ nada |
| Vista accesible (Alt+F2) y navegación Alt+] / Alt+[ | `accessibleView.ts`, `accessibleViewActions.ts` | ❌ nada |
| Ayuda de accesibilidad del editor (Alt+F1) | `editorAccessibilityHelp.ts` | ❌ nada |
| Atenuar vistas sin foco | `accessibility.dimUnfocused.enabled`, `.opacity` | ❌ nada |
| Señales accesibles (sonido + anuncio) | `accessibility.signals.*`: `save`, `format`, `taskCompleted`, `taskFailed`, `terminalCommandSucceeded/Failed`, `chatRequestSent`, `chatResponseReceived`, `lineHasError/Warning`, `clear`, `progress`… | ❌ nada |
| Verbosidad por área | `accessibility.verbosity.*` (editor, terminal, find, hover, diffEditor, sourceControl…) | ❌ nada |
| Retrasos/debounce de anuncios | `accessibility.signalOptions.delays.*`, `debouncePositionChanges`, `volume` | ❌ nada |
| Subrayar enlaces | `accessibility.underlineLinks` | ❌ nada |
| Título de ventana optimizado | `accessibility.windowTitleOptimized` | ❌ nada |
| Tab mueve el foco (Ctrl+M) | `editor/contrib/toggleTabFocusMode` | ❌ nada |
| Opciones del editor | `accessibilitySupport`, `accessibilityPageSize`, `ariaLabel`, `ariaRequired`, `screenReaderAnnounceInlineSuggestion` | ❌ nada |
| Estado del editor sin ARIA | — | **`views/ide.js` tenía 0 `role`, 0 `aria-*`, 0 `tabindex`**: árbol, pestañas y barra de estado eran `div` con `click`, inalcanzables con teclado |

**Conclusión de la investigación:** la mayor brecha de calidad de todo el frontend no era una
función de VS Code «grande», sino que el IDE **no era utilizable con teclado ni con lector de
pantalla**. Es lo que se implementa en la fase 3 (ver `frontend/js/a11y.js` y
`frontend/css/a11y.css`), replicando los nombres y conceptos de VS Code para que la
documentación y los atajos sean familiares.

---

## 6. Plan dentro del presupuesto (10.000 líneas, sin tests)

| Fase | Contenido | Líneas nuevas (sin tests) | Estado |
|---|---|---|---|
| 0 | Chats: memoria por proyecto, store único, nuevo proyecto, borrar chats | **1.323** | ✅ `34d6af18` |
| 1 | Este inventario | 0 (documentación) | ✅ |
| 2a | Accesibilidad: `a11y.js` (950) + `a11y.css` (226) + cableado en ide/chat/ui/settings | **1.400** | ✅ |
| 2b | Idioma: traductor derivado del diccionario, 175 frases nuevas, patrones dinámicos, atributos ARIA | **474** | ✅ |
| 2c | IDE: bienvenida VS Code (Start/Recent/Walkthroughs), quick pick «New File», Untitled-N, selector de lenguaje, pista del editor | **720** | ✅ |
| 3 | **Extensiones + comunicación externa**: backend (`extensions.py` 770), host en sandbox (`ext-host.js` 470), autocompletado con Tab (`completion.js` 574), vista Extensiones (227), 3 extensiones incluidas, CLI `ely extensions` | **≈ 2.900** | ✅ |
| 4 | **Lenguajes + Explorador VS Code**: catálogo de 165 lenguajes (267), resaltado por familias (209), Explorer con carpeta raíz y 4 acciones, creación en línea, Outline y Timeline | **≈ 730** | ✅ |
| 4b | **Más lenguajes + assets**: 261 lenguajes (+105), 93 familias (+26), `icons.js` reescrito (265), galería `/icons.html` (143) y **345 SVG** | **≈ 480** | ✅ |
| 4c | **Panel inferior + terminal VS Code**: `terminal.js` (525), `output.js` (159), `glyphs.js` (92), `termops.py` (191), panel y barra del editor en `ide.js` (+329), estilos (+91), i18n (+88), tareas deducidas (+39) | **≈ 1.540** | ✅ |
| — | **Consumido** | **≈ 9.570 / 10.000** | margen ≈ 430 |
| 5 | Editor: plegado de código, bracket matching, sticky scroll, minimapa | ~1.000 | propuesto |
| 6 | Workbench: editor de atajos, modo Zen, Emmet, preview Markdown, multi-diff | ~900 | propuesto |

### Verificación de las fases 2, 3, 4, 4b y 4c (no solo «está escrito»)

| Prueba | Resultado |
|---|---|
| `python3 -m unittest discover -s CLI/tests` | **258/258 OK** (203 previos + 55 de terminal, perfiles, puertos, diagnóstico y tareas) |
| Harness jsdom del chat contra el backend real | **36/36 OK** |
| Harness jsdom de **extensiones + Tab** | **100/100 OK** |
| Harness jsdom de **Explorador + lenguajes + iconos** | **78/78 OK** |
| Harness jsdom de la **galería de assets** (`/icons.html`) | **19/19 OK** |
| Harness jsdom del **panel + terminal** | **93/93 OK** |
| Harness jsdom del IDE + accesibilidad | **67/67 OK** (antes 65: +2 del panel) |
| Assets servidos por `ely serve` | **0 errores 404** en el muestreo (33 del IDE + 32 de la galería) |
| Auditoría de idioma recorriendo **20 rutas** con `language=en` | **0 textos en español sin traducir** (antes: 117) |
| Ida y vuelta de idioma ES→EN→ES | **40/40 OK** |
| Comunicación externa real | `GET https://api.github.com/repos/microsoft/vscode` → **HTTP 200** a través del proxy con permiso |
| Sin permiso / host no declarado | **403** en ambos casos (backend y host) |

### Fase 3 · Extensiones y autocompletado con Tab

**Sistema de extensiones propio** (no es el marketplace de VS Code, y la UI lo dice):

- Manifiesto `ely-extension.json` + `main.js` con `activate(ely)`.
- Permisos declarados: `editor`, `workspace:read/write`, `ui`, `commands`,
  `completions`, `chat`, `network:<host>`. Sin permiso, la llamada falla.
- Cada extensión corre en `<iframe sandbox="allow-scripts">` **sin
  `allow-same-origin`**: origen opaco, sin DOM de la app, sin cookies ni
  `localStorage` y sin red propia. El host valida el emisor por `event.source`
  y por un secreto por iframe.
- **Comunicación externa**: `ely.fetch()` → `POST /api/extensions/call {op:"fetch"}`
  → el backend comprueba `network:<host>` y hace la petición real.
- Instalación desde GitHub (`owner/repo`), `npm:paquete`, URL https o carpeta del
  ordenador (selector `webkitdirectory`), con límites de 8 MB y 400 archivos y
  sin rutas que escapen de la carpeta.
- CLI: `ely extensions list|install|uninstall|enable|disable|info|fetch`.
- Incluidas: `ely.word-count`, `ely.python-snippets`, `ely.github-info`.

**Autocompletado con Tab, activado por defecto** (`Settings.tabCompletion = true`):
texto fantasma tras el cursor, Tab acepta, Esc descarta, Alt+]/[ cambian de
candidato y Ctrl+Espacio fuerza. Fuentes: extensiones → snippets del lenguaje →
palabras clave → palabras del archivo. Respeta el modo *Tab mueve el foco*
(Ctrl+M) de accesibilidad y no rompe el Tab de indentación.

### Fase 4 · Lenguajes y Explorador como VS Code

- **261 lenguajes** en `js/languages.js` (165 en la fase 4, +96 en la 4b), con
  detección por extensión y por nombre de archivo (`Dockerfile`, `CMakeLists.txt`,
  `.env`, `tsconfig.json`, `.vimrc`, `Snakefile`, `project.godot`…), y resaltado
  por **93 familias** en `js/syntax.js`.
- **Explorador** con cabecera y menú «⋯», fila de carpeta raíz plegable con el
  nombre del proyecto y las cuatro acciones de VS Code: **Nuevo archivo, Nueva
  carpeta, Refrescar y Contraer carpetas**. La creación es en línea dentro del
  árbol (Enter crea, Esc cancela), no con `prompt()` del navegador.
- Secciones plegables **Outline** (símbolos reales, salto a la línea) y
  **Timeline** (historial local real con diff). El outline pasó de 6 a más de
  35 lenguajes.
- Menú **Ayuda** (Bienvenida, Comandos, Atajos, Accesibilidad, Acerca de) y el
  estado del IDE (proyecto, pestañas, carpetas abiertas) sobrevive a los cambios
  de idioma y de vista.

### Fase 4b · Más lenguajes y assets de iconos

- **261 lenguajes** y **93 familias** de resaltado. Se separaron Objective-C y
  Objective-C++ (`.m` / `.mm`) siguiendo el criterio de VS Code, y se añadieron
  comentarios propios para Vim (`"`), Smalltalk (`"…"`), Forth (`\`) y
  AutoHotkey (`;`).
- **345 SVG** en `IDE/frontend/icons/` tomados de **Material Icon Theme** (MIT,
  licencia incluida en la carpeta). Cada lenguaje del catálogo tiene su icono:
  sólo *Plain Text* cae en el documento genérico. Para los 18 lenguajes que el
  pack no cubre se generaron iconos propios `ely-*.svg`.
- Resolución igual que VS Code: **nombre de archivo → extensión → lenguaje →
  documento**. Además de código, hay iconos para imágenes, vídeo, audio, fuentes,
  comprimidos, ofimática y certificados, y **~150 nombres de carpeta**
  (`src`, `tests`, `docs`, `assets`, `node_modules`, `.github`…) con variante
  abierta/cerrada.
- El árbol, las pestañas, el selector de modo y el quick pick «Nuevo archivo»
  usan el icono real, incluido el modo de lenguaje fijado a mano. Los `<img>`
  son decorativos (`alt=""`, `aria-hidden`), perezosos y con *fallback*.
- **Galería `/icons.html`** para ver y buscar los 345 assets por lenguaje,
  extensión o carpeta, en ES · EN, con la atribución del pack.

### Fase 4c · Panel inferior y terminal como VS Code

- **Panel** con las cinco pestañas de VS Code y una **barra de acciones distinta
  por pestaña**: en Terminal, perfil + «+» con menú, dividir, papelera, ⋯,
  maximizar y cerrar; en Salida, filtro + selector de canal + limpiar + bloqueo.
- **Terminal real**: varias terminales con lista lateral numerada, split en
  paneles, perfiles detectados en el servidor (`bash`, `zsh`, `sh`, `fish`,
  `pwsh`, `python`, `node`) y prompt con el estilo de cada intérprete. Cada línea
  se ejecuta con el intérprete del perfil (`POST /api/terminal/exec` + `profile`),
  con cwd por panel, historial ↑/↓ y decoración de estado del comando.
  No es una PTY: los programas interactivos (vim, top, ssh) no funcionan.
- **Menú «+»** con los mismos items que VS Code, atajos a la derecha y submenú
  «Dividir terminal con perfil». «Nueva ventana de terminal» abre el IDE con el
  panel maximizado (`?terminal=1`).
- **Salida** con canales alimentados de verdad: Terminal (comandos), Tasks
  (tareas), Extension Host (`ely.log`), Git (status/stage/commit), Ely y Window
  (errores del navegador). Filtro con `texto`, `!excluir` y `"frase exacta"`.
- **Problemas**: validación real de sintaxis del búfer abierto (Python con `ast`,
  JSON con `json`), contadores y salto a la línea. **Puertos**: los que están en
  escucha según `/proc/net/tcp`, con proceso y PID, enlazando al host de la vista
  previa (`<puerto>-<sandbox>.e2b.app`) en lugar de `localhost`.
- **Tareas**: `.ely/tasks.json` o, si no existe, deducidas de los scripts de
  `package.json` y de los objetivos del `Makefile`.
- **Editor**: botón ▷ Ejecutar (lanza el archivo en la terminal con el
  intérprete que le toca) y menú ⋯ del grupo con las siete acciones de VS Code,
  incluidas las **pestañas en vista previa** en cursiva.
- Pendiente y dicho claramente: **dividir el editor en grupos** y una **PTY**
  interactiva. El presupuesto de 10.000 líneas queda prácticamente consumido.

La auditoría de idioma es un recorrido real: carga la app servida por `ely serve`
en un DOM, cambia el idioma y visita las 18 rutas del nav más el chat, revisando
nodos de texto y atributos `placeholder`, `title` y `aria-label`.

Lo que **no** entra en el presupuesto y se declara «próximamente» con motivo en la UI:
depurador con breakpoints (DAP), **marketplace y `.vsix` de VS Code** (otra API y
host Node/Electron), LSP/IntelliSense real, notebooks con kernel, remoto/túneles y voz.
El sistema de extensiones de la fase 3 es propio y no finge compatibilidad con VSIX.

## Fase 5 · 14 idiomas (localización más allá de ES · EN)

VS Code distribuye la interfaz en inglés y descarga *language packs* de la
Marketplace para el resto. Ely no tiene Marketplace, así que la localización es
propia y **autocontenida**: 14 idiomas, un paquete por idioma, carga bajo demanda.

- **Catálogo y orden.** `LANGS` fija los 14 y el selector se ordena
  alfabéticamente por autónimo, con el bloque latino primero y luego griego,
  cirílico, devanagari y CJK. Añadir un idioma no toca la vista.
- **Paquetes bajo demanda.** `js/locales/<id>.js` se descarga sólo al elegir el
  idioma, igual que hace VS Code con sus *language packs*, y se aplica después
  de cargar para que no haya parpadeo. Español es el origen e inglés es la
  segunda columna del diccionario: ninguno de los dos necesita paquete.
- **Textos dinámicos.** VS Code traduce plantillas con marcadores; aquí los 37
  patrones del backend (`hace 5 min`, `Línea 12, columna 4`, `$1 configurados`)
  tienen clave `pat.*` propia, así que cada idioma reordena la frase, no sólo
  sustituye palabras. Un test comprueba que los `$1`/`$2` sobreviven en los 12.
- **Cobertura completa y verificada.** **745 de 745 claves** en los 12 paquetes
  (100 %), no una muestra: incluye las 120 claves de accesibilidad, las 60 del
  IDE, chat, almacén, visores y extensiones. Ajustes enseña el porcentaje real
  calculado sobre el diccionario, y el aviso de fallback sólo aparece si un
  paquete queda incompleto. La cadena paquete → inglés → español sigue viva y
  se prueba borrando una clave en caliente: nunca aparece español en una
  interfaz japonesa. La auditoría real (app servida + jsdom, 18 rutas + chat +
  IDE + ajustes) da **0 restos en español** en en/el/ru/hi/zh/ja; en de/fr/it/pt/
  pl/la/vg los únicos avisos son palabras correctas del idioma destino que
  coinciden con palabras funcionales españolas («schließ**en**», «**la**
  connexion», «**un** projet», «**con** permessi», «Rozw**ó**j», «**De** nobis»),
  revisadas una a una.
- **Latín y vendergood.** Se entregan los dos, marcados. El latín usa el léxico
  de la Vicipaedia y avisa de que no hay vocabulario técnico normalizado.
  Vendergood es la lengua construida de W. J. Sidis (1909): está documentada su
  base latina/romance, sus ocho modos y su numeración duodecimal, pero **no hay
  corpus público de vocabulario**. El paquete es una aproximación experimental
  explícita —cada cadena es una propuesta, no una atestiguación— con
  `html lang="art-x-vendergood"` y aviso en Ajustes. No se inventa vocabulario
  presentándolo como real.
- **Tipografía.** Respaldos de fuente para devanagari y CJK (también en la
  monoespaciada) y reglas de altura de línea por `<html lang>`, para que las
  marcas vocálicas del hindi no se recorten en el árbol de archivos.
- **Teclas y cifras como en el teclado local.** Alemán rotula `Strg`/`Umschalt`,
  francés `Maj`/`Échap`/`Entrée` e italiano `Invio`, igual que VS Code en esos
  idiomas; el resto usa `Ctrl`/`Shift`/`Enter`. Las cifras nunca se traducen, la
  unidad sí puede (chino «32 像素»). El latín usa numeración arábiga: en una
  interfaz técnica `XIV` obliga a calcular en vez de leer.
- **Extensiones.** El `l10n` del manifiesto acepta cualquier idioma y el host
  elige el activo con fallback a inglés; `ely.l10n()` admite mapa por idioma
  además de la forma clásica de dos argumentos.

**Presupuesto de líneas.** El código de esta fase son **351 líneas** nuevas o
modificadas (motor, selector, CSS, host de extensiones, backend), dentro del
margen que quedaba de las 10.000. Los **12 paquetes suman 9.366 líneas**, pero
son **datos de traducción**, no lógica: se cuentan aparte, igual que los 910 SVG
de iconos de la fase 4 no se contaron como código. Los tests y el manifiesto de
núcleo (421) tampoco son lógica de producto.

Verificación: **299 tests Python** (41 de idiomas) y harness jsdom **193/193** de
idiomas, sin regresiones en terminal (93), IDE+a11y (67), explorador (78),
extensiones+Tab (100), chat (36), ida y vuelta de idioma (40) ni galería de
iconos (19). Los tests de idiomas exigen ahora las 745 claves por paquete y
vigilan marcadores, literales técnicos, cifras y alfabeto propio.
