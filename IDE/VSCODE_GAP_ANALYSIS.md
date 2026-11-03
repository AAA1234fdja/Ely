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
| `tokenization`, `semanticTokens` | 🟡 | `syntax.js` resalta 41 lenguajes con regex; sin tokens semánticos | 🌐 limitado / ⛔ LSP |
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
  usar `shiki` desde npm). Hoy `syntax.js` usa regex propias para 41 lenguajes.
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
| — | **Consumido** | **≈ 3.917 / 10.000** | margen ≈ 6.000 |
| 3 | Editor: plegado de código, bracket matching, word highlight, sticky scroll, minimapa, buscar avanzado | ~1.200 | propuesto |
| 4 | Workbench: editor de atajos, modo Zen, snippets, Emmet, preview Markdown, multi-diff | ~1.300 | propuesto |
| 5 | Temas/gramáticas TextMate desde `extensions/` | ~600 | propuesto |

### Verificación de la fase 2 (no solo «está escrito»)

| Prueba | Resultado |
|---|---|
| `python3 -m unittest discover -s CLI/tests` | **93/93 OK** |
| Harness jsdom del chat contra el backend real | **36/36 OK** (una sola conversación, persistencia, borrado, proyectos) |
| Harness jsdom del IDE + accesibilidad | **63/63 OK** (bienvenida, New File, Untitled, lenguaje, roles ARIA, teclado, Alt+F2/F1, Ctrl+M, contraste) |
| Auditoría de idioma recorriendo **19 rutas** con `language=en` | **0 textos en español sin traducir** (antes: 117) |

La auditoría de idioma es un recorrido real: carga la app servida por `ely serve`
en un DOM, cambia el idioma y visita las 18 rutas del nav más el chat, revisando
nodos de texto y atributos `placeholder`, `title` y `aria-label`.

Lo que **no** entra en el presupuesto y se declara «próximamente» con motivo en la UI:
depurador con breakpoints (DAP), marketplace de extensiones, LSP/IntelliSense, notebooks con
kernel, remoto/túneles y voz.
