/* Ely Cowork · internacionalización (14 idiomas) y zona horaria.
 *
 * El idioma y la nacionalidad se guardan en Settings. La nacionalidad determina
 * la zona horaria con la que se muestran las horas (p. ej. la hora de fin de una
 * respuesta del chat). El formato pedido es mes/día/año hora:minuto.
 *
 * Español e inglés viven en el diccionario base `D` (pares [es, en]). El resto
 * de idiomas son paquetes que se cargan bajo demanda desde `js/locales/<id>.js`
 * y se registran con `I18N.register(id, dict)`. Lo que un paquete no traduce
 * cae a inglés y, en último término, a español: nunca se muestra una clave.
 *
 * Orden de la lista: alfabético por nombre nativo (autónimo), primero alfabeto
 * latino y después griego, cirílico, devanagari y CJK, como hacen los selectores
 * de idioma de Wikipedia o del propio sistema operativo.
 *
 * Se carga en tiempo de ejecución desde app.js (el index.html no se toca).
 * Expone `window.I18N` y un atajo `window.t`.
 */
(function () {
  "use strict";

  /* Cada clave: [español, inglés]. */
  const D = {
    // --- navegación / shell
    "nav.desarrollo": ["Desarrollo", "Development"],
    "nav.orquestacion": ["Orquestación", "Orchestration"],
    "nav.operaciones": ["Operaciones", "Operations"],
    "nav.inspeccion": ["Inspección", "Inspection"],
    "navdesc.ide": ["Editor de código con IA", "AI code editor"],
    "navdesc.dashboard": ["Resumen de sesión y acciones", "Session summary and actions"],
    "navdesc.workflows": ["Define, edita y ejecuta flujos", "Define, edit and run flows"],
    "navdesc.agents": ["Reutiliza agentes y workflows", "Reuse agents and workflows"],
    "navdesc.canvas": ["Diseña y orquesta visualmente", "Design and orchestrate visually"],
    "navdesc.teams": ["Coordina equipos y roles", "Coordinate teams and roles"],
    "navdesc.assets": ["Archivos y activos del workflow", "Workflow files and assets"],
    "navdesc.storage": ["Archivos por perfil: generado y planeado", "Per-profile files: generated and planned"],
    "navdesc.repos": ["Importa repositorios Git al workspace", "Import Git repos into the workspace"],
    "navdesc.skillslib": ["Capacidades operativas", "Operational capabilities"],
    "navdesc.skills": ["Edita y revisa skills", "Edit and review skills"],
    "navdesc.tools": ["Herramientas y llamadas", "Tools and calls"],
    "navdesc.integrations": ["Conecta sistemas externos", "Connect external systems"],
    "navdesc.jobs": ["Tareas programadas", "Scheduled tasks"],
    "navdesc.pairing": ["Vincula dispositivos", "Pair devices"],
    "navdesc.config": ["Ajustes y políticas", "Settings and policies"],
    "navdesc.costs": ["Gasto y eficiencia", "Spend and efficiency"],
    "navdesc.memory": ["Memoria y grafo de contexto", "Memory and context graph"],
    "navtitle.chat": ["Chat", "Chat"],
    "navdesc.chat": ["Conversación con el perfil activo", "Conversation with the active profile"],
    "app.subtitle": ["Configuración de usuario y archivos por perfil", "User settings and per-profile files"],
    "app.hideSidebar": ["Ocultar panel lateral", "Hide sidebar"],
    "app.showSidebar": ["Mostrar panel lateral", "Show sidebar"],
    "header.menu": ["Menú", "Menu"],
    "header.activeFlow": ["Workflow activo en esta sesión", "Active workflow in this session"],
    "header.trust": ["Trust verified", "Trust verified"],
    "header.serverDown": ["Servidor inactivo", "Server inactive"],
    "header.profile": ["perfil", "profile"],
    "header.noProfiles": ["sin perfiles", "no profiles"],
    "header.noProfile": ["sin perfil", "no profile"],
    "header.noKey": ["sin clave", "no key"],
    "header.testKey": ["clave de prueba", "test key"],
    "header.apiHealthIdle": ["Sin comprobación en las últimas 5 h", "No check in the last 5 hours"],
    "header.apiHealthAll": ["Todas las API funcionan", "All APIs are working"],
    "header.apiHealthSome": ["Algunas API fallan", "Some APIs are failing"],
    "header.apiHealthNone": ["Ninguna API funciona", "No APIs are working"],
    "header.ownKey": ["clave propia", "own key"],
    "header.testConn": ["Probar conexión con el proveedor", "Test provider connection"],
    "header.settings": ["Ajustes", "Settings"],
    "header.calls": ["Historial de llamadas", "Call history"],
    "header.scheduledJobs": ["Tareas programadas", "Scheduled Jobs"],
    "header.operator": ["Operador", "Operator"],
    "header.localSession": ["Sesión local", "Local session"],
    "conn.verified": ["Conexión verificada", "Connection verified"],
    "conn.reachable": ["Endpoint alcanzable · clave rechazada", "Endpoint reachable · key rejected"],
    "conn.noResponse": ["Sin respuesta del endpoint", "No response from endpoint"],
    "conn.failed": ["Prueba fallida", "Test failed"],

    // --- chat (vista tipo Codex)
    "chat.new": ["Nueva conversación", "New chat"],

    "ide.welcomeTab": ["Bienvenida", "Welcome"],
    "ide.tagline": ["La edición, evolucionada", "Editing evolved"],
    "ide.start": ["Inicio", "Start"],
    "ide.recent": ["Reciente", "Recent"],
    "ide.walkthroughs": ["Guías", "Walkthroughs"],
    "ide.showWelcomeOnStartup": ["Mostrar la bienvenida al iniciar", "Show welcome page on startup"],
    "ide.showWelcome": ["Mostrar la bienvenida", "Show welcome page"],
    "ide.emptyEditor": ["No hay ningún editor abierto.", "No editor is open."],
    "ide.noRecentFolders": ["No tienes carpetas recientes,", "You have no recent folders,"],
    "ide.toStart": ["para empezar.", "to start."],
    "ide.clearRecent": ["Limpiar recientes", "Clear recently opened"],
    "ide.selectFileType": ["Selecciona el tipo de archivo o escribe un nombre…", "Select File Type or Enter File Name…"],
    "ide.textFile": ["Archivo de texto", "Text File"],
    "ide.builtIn": ["Integrado", "Built-In"],
    "ide.notebook": ["Notebook de Jupyter", "Jupyter Notebook"],
    "ide.notebookSupport": ["Soporte .ipynb", ".ipynb Support"],
    "ide.selectLanguageMode": ["Seleccionar modo de lenguaje", "Select Language Mode"],
    "ide.currentLanguage": ["lenguaje actual", "current language"],
    "ide.untitledCreated": ["Archivo sin título creado:", "Untitled file created:"],
    "ide.unsaved": ["sin guardar", "unsaved"],
    "ide.openEditors": ["Editores abiertos", "Open editors"],
    "ide.hintWrite": ["Escribe para empezar, o", "Start typing, or"],
    "ide.hintLanguage": ["elige un lenguaje", "select a language"],
    "ide.hintDismiss": ["Empieza a escribir para descartar el aviso o", "Start typing to dismiss or"],
    "ide.hintNever": ["no volver a mostrar", "don't show this again"],
    "ide.editor": ["Editor", "Editor"],
    "ide.currentLine": ["Línea actual", "Current line"],
    "ide.wholeFile": ["Archivo completo", "Whole file"],
    "ide.emptyLine": ["(línea vacía)", "(empty line)"],
    "ide.terminalOutput": ["Salida de la terminal", "Terminal output"],
    "ide.expanded": ["desplegada", "expanded"],
    "ide.collapsed": ["plegada", "collapsed"],
    "ide.folder": ["carpeta", "folder"],
    "ide.chordWaiting": ["Esperando la segunda tecla…", "Waiting for second key…"],
    "ide.walkStartTitle": ["Empezar con Ely IDE", "Get started with Ely IDE"],
    "ide.walkStartDesc": ["Abre un proyecto, crea archivos y aprende lo básico", "Open a project, create files and learn the basics"],
    "ide.walkBasicsTitle": ["Aprender lo fundamental", "Learn the Fundamentals"],
    "ide.walkBasicsDesc": ["Archivos, paleta de comandos, terminal, búsqueda y Git", "Files, command palette, terminal, search and Git"],
    "ide.walkA11yTitle": ["Accesibilidad", "Accessibility"],
    "ide.walkA11yDesc": ["Lector de pantalla, teclado y alto contraste", "Screen reader, keyboard and high contrast"],
    "ide.walkOpen": ["Abrir", "Open"],
    "ide.walkS1": ["Abre una carpeta", "Open a folder"],
    "ide.walkS1d": ["Carga un proyecto real desde tu ordenador o desde Local Storage.", "Load a real project from your computer or from Local Storage."],
    "ide.walkS2": ["Crea un archivo", "Create a file"],
    "ide.walkS2d": ["Elige el tipo o escribe un nombre; se abre como Untitled-1.", "Pick a type or type a name; it opens as Untitled-1."],
    "ide.walkS3": ["Elige el lenguaje", "Choose the language"],
    "ide.walkS3d": ["Ctrl+K M o clic en el lenguaje de la barra de estado.", "Ctrl+K M or click the language in the status bar."],
    "ide.walkS4": ["Ajusta la accesibilidad", "Adjust accessibility"],
    "ide.walkS4d": ["Lector de pantalla, señales, contraste y tamaño de letra.", "Screen reader, signals, contrast and font size."],
    "ide.walkS5": ["Habla con la IA", "Talk to the AI"],
    "ide.walkS5d": ["El chat comparte conversación entre proyectos y con la CLI.", "The chat shares conversations across projects and with the CLI."],
    "ide.walkB1": ["Ir a un archivo", "Go to a file"],
    "ide.walkB1d": ["Ctrl+P abre el buscador rápido de archivos.", "Ctrl+P opens the quick file finder."],
    "ide.walkB2": ["Paleta de comandos", "Command palette"],
    "ide.walkB2d": ["Ctrl+Shift+P lista todas las acciones disponibles.", "Ctrl+Shift+P lists every available action."],
    "ide.walkB3": ["Terminal integrada", "Integrated terminal"],
    "ide.walkB3d": ["Ctrl+J o Ctrl+Ñ abre una terminal real del workspace.", "Ctrl+J or Ctrl+Ñ opens a real workspace terminal."],
    "ide.walkB4": ["Buscar en el proyecto", "Search in the project"],
    "ide.walkB4d": ["Búsqueda y reemplazo con previsualización en todos los archivos.", "Search and replace with preview across all files."],
    "ide.walkB5": ["Control de código", "Source control"],
    "ide.walkB5d": ["Estado real de Git: stage, commit, ramas y diff.", "Real Git status: stage, commit, branches and diff."],

    "nav.settings": ["Ajustes", "Settings"],
    "ide.help": ["Ayuda", "Help"],
  "ide.showAllCommands": ["Mostrar todos los comandos", "Show All Commands"],
  "ide.keyboardRef": ["Referencia de atajos de teclado", "Keyboard Shortcuts Reference"],
  "ide.reportIssue": ["Informar de un problema (próximamente)", "Report Issue (coming soon)"],
  "ide.about": ["Acerca de", "About"],
  "ide.aboutVersion": ["Versión", "Version"],
  "ide.aboutLanguages": ["Lenguajes disponibles", "Languages available"],
  "ide.aboutExtensions": ["Extensiones instaladas", "Installed extensions"],

  /* ---- Explorer estilo VS Code ---- */
  "ide.moreActions": ["Más acciones…", "More actions…"],
  "ide.collapseAll": ["Contraer carpetas en el Explorador", "Collapse Folders in Explorer"],
  "ide.folderCreated": ["Carpeta creada", "Folder created"],
  "ide.fileCreated": ["Archivo creado", "File created"],
  "ide.timeline": ["Línea de tiempo", "Timeline"],
  "ide.timelineEmpty": ["Abre un archivo para ver su historial local", "Open a file to see its local history"],
  "ide.outlineEmpty": ["Abre un archivo para ver sus símbolos", "Open a file to see its symbols"],
  "ide.noSymbols": ["Este archivo no tiene símbolos detectables", "No detectable symbols in this file"],
  "ide.line": ["Línea", "Line"],
  "ide.workspace": ["Workspace", "Workspace"],
  "ide.languageCount": ["lenguajes disponibles", "languages available"],

  /* ---- Extensiones y comunicación externa (fase 3) ---- */
  "ext.title": ["Extensiones", "Extensions"],
  "ext.subtitle": ["Instala extensiones reales con permisos declarados y salida de red controlada", "Install real extensions with declared permissions and controlled network access"],
  "ext.netTitle": ["Comunicación externa", "External communication"],
  "ext.netDesc": ["Las extensiones se ejecutan en un iframe aislado sin red propia. Cuando declaran network:<host> en su manifiesto, el backend hace la petición por ellas y devuelve el resultado. Hosts de instalación permitidos:", "Extensions run in an isolated iframe with no network of their own. When they declare network:<host> in their manifest, the backend performs the request for them and returns the result. Allowed install hosts:"],
  "ext.installTitle": ["Instalar una extensión", "Install an extension"],
  "ext.installDesc": ["Acepta una carpeta local, owner/repo de GitHub, npm:paquete o una URL https a un tarball o a un ely-extension.json.", "Accepts a local folder, a GitHub owner/repo, npm:package or an https URL to a tarball or to an ely-extension.json."],
  "ext.installPlaceholder": ["owner/repo · npm:paquete · https://… · ruta local", "owner/repo · npm:package · https://… · local path"],
  "ext.install": ["Instalar", "Install"],
  "ext.installing": ["Instalando…", "Installing…"],
  "ext.installed": ["Extensión instalada", "Extension installed"],
  "ext.installFail": ["No se pudo instalar", "Could not install"],
  "ext.needSource": ["Escribe el origen de la extensión", "Type the extension source"],
  "ext.fromFolder": ["Desde carpeta del ordenador", "From a folder on your computer"],
  "ext.installedTitle": ["Extensiones instaladas", "Installed extensions"],
  "ext.installedSource": ["instalada", "installed"],
  "ext.builtin": ["incluida", "built-in"],
  "ext.enable": ["Activar", "Enable"],
  "ext.disable": ["Desactivar", "Disable"],
  "ext.uninstall": ["Desinstalar", "Uninstall"],
  "ext.uninstalled": ["Extensión desinstalada", "Extension uninstalled"],
  "ext.reload": ["Recargar", "Reload"],
  "ext.reloaded": ["Extensión recargada", "Extension reloaded"],
  "ext.reloadAll": ["Actualizar lista", "Refresh list"],
  "ext.openManager": ["Abrir gestor de extensiones", "Open extensions manager"],
  "ext.none": ["Todavía no hay extensiones", "No extensions yet"],
  "ext.noneHint": ["Instala una desde GitHub, npm, una URL o una carpeta de tu ordenador.", "Install one from GitHub, npm, a URL or a folder on your computer."],
  "ext.loading": ["Leyendo extensiones…", "Reading extensions…"],
  "ext.fail": ["Error de extensiones", "Extensions error"],
  "ext.hostMissing": ["El host de extensiones no está cargado", "The extension host is not loaded"],
  "ext.stateActive": ["Activa", "Active"],
  "ext.stateEnabled": ["Activada", "Enabled"],
  "ext.stateDisabled": ["Desactivada", "Disabled"],
  "ext.stateError": ["Error al activar", "Activation error"],
  "ext.activationTimeout": ["La extensión no respondió al activarse", "The extension did not respond when activating"],
  "ext.noPermission": ["Permiso no declarado", "Permission not declared"],
  "ext.permHint": ["Permiso declarado en el manifiesto", "Permission declared in the manifest"],
  "ext.netPermHint": ["Salida de red permitida solo a este host", "Network access allowed only to this host"],
  "ext.noPerms": ["Sin permisos", "No permissions"],
  "ext.vsixNote": ["Las extensiones .vsix de VS Code no son compatibles: usan otra API y necesitan el host de extensiones de Node/Electron. Aquí se usa el formato Ely (ely-extension.json + main.js) con aislamiento y permisos.", "VS Code .vsix extensions are not compatible: they use a different API and need the Node/Electron extension host. Ely uses its own format (ely-extension.json + main.js) with isolation and permissions."],
  "ext.createTitle": ["Crear una extensión", "Create an extension"],
  "ext.createDesc": ["Una carpeta con ely-extension.json y main.js basta. La función activate(ely) recibe la API con permisos.", "A folder with ely-extension.json and main.js is enough. The activate(ely) function receives the permissioned API."],
  "ext.viewManifest": ["Ver manifiesto de ejemplo", "View sample manifest"],
  "ext.viewApi": ["Ver API de ejemplo", "View sample API"],
  "ext.noReadme": ["Esta extensión no incluye README.", "This extension does not include a README."],
  "ext.frameTitle": ["Extensión", "Extension"],
  "ext.pickTitle": ["Selecciona una opción", "Select an option"],
  "ext.inputTitle": ["Introduce un valor", "Enter a value"],
  "ext.hoverSoon": ["Los hovers llegarán próximamente", "Hovers are coming soon"],
  "ext.unknownCommand": ["Comando no registrado", "Command not registered"],
  "nav.extensions": ["Extensiones", "Extensions"],
  "navdesc.extensions": ["Instala y activa extensiones con permisos", "Install and enable extensions with permissions"],

  /* ---- Autocompletado con Tab ---- */
  "cmp.on": ["Autocompletado con Tab activado", "Tab completion enabled"],
  "cmp.off": ["Autocompletado con Tab desactivado", "Tab completion disabled"],
  "cmp.toggleHint": ["Autocompletado con Tab", "Tab completion"],
  "cmp.menu": ["Activar/desactivar autocompletado con Tab", "Toggle Tab completion"],
  "cmp.settingLabel": ["Completar código con Tab", "Complete code with Tab"],
  "cmp.settingHelp": ["Muestra la sugerencia como texto fantasma y la acepta con Tab. Esc la descarta, Alt+] y Alt+[ cambian de candidato y Ctrl+Espacio la fuerza. Activado por defecto.", "Shows the suggestion as ghost text and accepts it with Tab. Esc dismisses it, Alt+] and Alt+[ change candidate and Ctrl+Space forces it. Enabled by default."],
  "cmp.suggestion": ["Sugerencia", "Suggestion"],
  "cmp.pressTab": ["Tab para aceptar", "Tab to accept"],
  "cmp.accepted": ["Sugerencia aceptada", "Suggestion accepted"],
  "cmp.fromFile": ["en este archivo", "in this file"],
  "cmp.buffer": ["Archivo", "File"],
  "cmp.snippet": ["Snippet", "Snippet"],
  "cmp.keyword": ["palabra clave", "keyword"],
  "cmp.language": ["Lenguaje", "Language"],

  "ls.deleteConv": ["Eliminar conversación", "Delete conversation"],

    /* Accesibilidad (a11y.js) */
    "a11y.promptAsIs": ["El prompt se envía tal cual al modelo (no se traduce).", "The prompt is sent to the model as-is (not translated)."],
    "a11y.settings": ["Accesibilidad", "Accessibility"],
    "a11y.settingsSub": ["Lector de pantalla, señales, contraste y teclado", "Screen reader, signals, contrast and keyboard"],
    "a11y.help": ["Ayuda de accesibilidad", "Accessibility help"],
    "a11y.helpTitle": ["Ayuda de accesibilidad del editor", "Editor accessibility help"],
    "a11y.helpIntro": ["Atajos pensados para teclado y lector de pantalla.", "Shortcuts designed for keyboard and screen reader use."],
    "a11y.helpEditor": ["Editor", "Editor"],
    "a11y.helpNav": ["Navegación", "Navigation"],
    "a11y.helpChat": ["Chat", "Chat"],
    "a11y.openSettings": ["Ajustes de accesibilidad", "Accessibility settings"],
    "a11y.skipNav": ["Saltar navegación", "Skip navigation"],
    "a11y.skipContent": ["Saltar al contenido", "Skip to content"],
    "a11y.skipEditor": ["Saltar al editor", "Skip to editor"],
    "a11y.skipMenu": ["Saltar a la navegación", "Skip to navigation"],
    "a11y.mainRegion": ["Contenido principal", "Main content"],
    "a11y.navRegion": ["Navegación", "Navigation"],
    "a11y.region": ["Región", "Region"],
    "a11y.screenReader": ["Modo lector de pantalla", "Screen reader mode"],
    "a11y.screenReaderHint": ["Anuncia línea, columna y eventos del editor.", "Announces line, column and editor events."],
    "a11y.srBadge": ["Lector de pantalla", "Screen reader"],
    "a11y.srOn": ["Modo lector de pantalla activado", "Screen reader mode enabled"],
    "a11y.srOff": ["Modo lector de pantalla desactivado", "Screen reader mode disabled"],
    "a11y.announcements": ["Anuncios", "Announcements"],
    "a11y.announcementsHint": ["Mensajes para el lector de pantalla (aria-live).", "Messages for the screen reader (aria-live)."],
    "a11y.announcePosition": ["Anunciar posición del cursor", "Announce cursor position"],
    "a11y.announceDelay": ["Retraso de anuncios", "Announcement delay"],
    "a11y.verbosity": ["Verbosidad", "Verbosity"],
    "a11y.verbosityHint": ["«Detallada» lee también el texto de la línea.", "'Verbose' also reads the text of the line."],
    "a11y.verbosityNormal": ["Normal", "Normal"],
    "a11y.verbosityVerbose": ["Detallada", "Verbose"],
    "a11y.line": ["Línea", "Line"],
    "a11y.column": ["columna", "column"],
    "a11y.editorLabel": ["Editor de código", "Code editor"],
    "a11y.editorHint": ["Ctrl+M alterna que Tab mueva el foco. Alt+F2 abre la vista accesible. Alt+F1 muestra la ayuda.", "Ctrl+M toggles whether Tab moves focus. Alt+F2 opens the accessible view. Alt+F1 shows help."],
    "a11y.sounds": ["Señales sonoras", "Sound signals"],
    "a11y.soundsHint": ["Un tono breve al guardar, terminar una tarea o recibir respuesta.", "A short tone when saving, finishing a task or receiving a reply."],
    "a11y.volume": ["Volumen", "Volume"],
    "a11y.testSignal": ["Probar señal", "Test signal"],
    "a11y.test": ["Probar", "Test"],
    "a11y.highContrast": ["Alto contraste", "High contrast"],
    "a11y.highContrastHint": ["Bordes y texto con contraste máximo.", "Maximum contrast for text and borders."],
    "a11y.reducedMotion": ["Reducir animaciones", "Reduce motion"],
    "a11y.underlineLinks": ["Subrayar enlaces", "Underline links"],
    "a11y.focusRing": ["Resaltar el foco", "Highlight focus"],
    "a11y.focusRingHint": ["Anillo visible alrededor del elemento enfocado.", "Visible ring around the focused element."],
    "a11y.largeTargets": ["Controles más grandes", "Larger controls"],
    "a11y.largeTargetsHint": ["Áreas de clic de al menos 32 px.", "Click targets of at least 32 px."],
    "a11y.dimUnfocused": ["Atenuar paneles sin foco", "Dim unfocused panels"],
    "a11y.dimOpacity": ["Opacidad de lo atenuado", "Dimmed opacity"],
    "a11y.fontScale": ["Tamaño de letra", "Font size"],
    "a11y.lineHeight": ["Interlineado", "Line height"],
    "a11y.letterSpacing": ["Espacio entre letras", "Letter spacing"],
    "a11y.wordSpacing": ["Espacio entre palabras", "Word spacing"],
    "a11y.dyslexiaFont": ["Tipografía legible", "Readable font"],
    "a11y.dyslexiaFontHint": ["Prioriza fuentes de alta legibilidad instaladas en el sistema.", "Prefers high-legibility fonts installed on the system."],
    "a11y.tabFocusMode": ["Tab mueve el foco (Ctrl+M)", "Tab moves focus (Ctrl+M)"],
    "a11y.tabFocusModeHint": ["Desactivado: Tab indenta dentro del editor.", "Off: Tab indents inside the editor."],
    "a11y.tabFocusOn": ["Tab mueve el foco", "Tab moves focus"],
    "a11y.tabFocusOff": ["Tab indenta en el editor", "Tab indents in the editor"],
    "a11y.groupReader": ["Lector de pantalla", "Screen reader"],
    "a11y.groupSignals": ["Señales", "Signals"],
    "a11y.groupVisual": ["Visual", "Visual"],
    "a11y.groupText": ["Texto", "Text"],
    "a11y.groupKeyboard": ["Teclado", "Keyboard"],
    "a11y.reset": ["Restablecer", "Reset"],
    "a11y.resetHint": ["Vuelve a los valores recomendados.", "Back to the recommended values."],
    "a11y.resetDone": ["Ajustes de accesibilidad restablecidos", "Accessibility settings reset"],
    "a11y.view": ["Vista accesible", "Accessible view"],
    "a11y.viewHint": ["Escape para volver al editor", "Escape to return to the editor"],
    "a11y.viewHint2": ["Lee el archivo, la línea o la salida como texto plano (Alt+F2).", "Reads the file, the line or the output as plain text (Alt+F2)."],
    "a11y.viewPrev": ["Anterior", "Previous"],
    "a11y.viewNext": ["Siguiente", "Next"],
    "a11y.viewEmpty": ["No hay contenido para la vista accesible", "There is no content for the accessible view"],
    "a11y.viewNoText": ["(vacío)", "(empty)"],
    "a11y.viewClosed": ["Vista accesible cerrada", "Accessible view closed"],
    "a11y.openView": ["Abrir", "Open"],
    "a11y.providerChat": ["Última respuesta del chat", "Latest chat reply"],
    "a11y.providerKeys": ["Atajos de teclado", "Keyboard shortcuts"],
    "a11y.promptTitle": ["Optimizar para lector de pantalla", "Optimize for screen reader"],
    "a11y.promptBody": ["El sistema usa colores de alto contraste. ¿Quieres activar el modo lector de pantalla del editor?", "Your system uses high contrast colors. Do you want to enable the editor's screen reader mode?"],
    "a11y.promptYes": ["Sí, activar", "Yes, enable"],
    "a11y.promptNo": ["No", "No"],
    "a11y.sig.save": ["Archivo guardado", "File saved"],
    "a11y.sig.format": ["Documento formateado", "Document formatted"],
    "a11y.sig.clear": ["Contenido limpiado", "Content cleared"],
    "a11y.sig.taskOk": ["Tarea completada", "Task completed"],
    "a11y.sig.taskFail": ["La tarea falló", "Task failed"],
    "a11y.sig.cmdOk": ["Comando terminado", "Command finished"],
    "a11y.sig.cmdFail": ["El comando falló", "Command failed"],
    "a11y.sig.bell": ["Timbre de terminal", "Terminal bell"],
    "a11y.sig.chatSent": ["Mensaje enviado", "Message sent"],
    "a11y.sig.chatReply": ["Respuesta recibida", "Reply received"],
    "a11y.sig.chatAction": ["El chat necesita una acción", "The chat needs an action"],
    "a11y.sig.error": ["Error", "Error"],
    "a11y.sig.warning": ["Advertencia", "Warning"],
    "a11y.sig.progress": ["En progreso", "In progress"],
    "a11y.sig.open": ["Archivo abierto", "File opened"],
    "a11y.sig.close": ["Editor cerrado", "Editor closed"],
    "a11y.sig.kept": ["Cambios conservados", "Changes kept"],
    "a11y.sig.undone": ["Cambios deshechos", "Changes undone"],
    "a11y.k.view": ["Abrir la vista accesible", "Open the accessible view"],
    "a11y.k.viewCycle": ["Cambiar de contenido en la vista accesible", "Switch content in the accessible view"],
    "a11y.k.help": ["Esta ayuda", "This help"],
    "a11y.k.tabFocus": ["Tab mueve el foco en vez de indentar", "Tab moves focus instead of indenting"],
    "a11y.k.palette": ["Paleta de comandos", "Command palette"],
    "a11y.k.quickOpen": ["Ir al archivo", "Go to file"],
    "a11y.k.gotoLine": ["Ir a la línea", "Go to line"],
    "a11y.k.wrap": ["Ajuste de línea", "Word wrap"],
    "a11y.k.treeMove": ["Moverse por el árbol de archivos", "Move through the file tree"],
    "a11y.k.treeFold": ["Desplegar o plegar la carpeta", "Expand or collapse the folder"],
    "a11y.k.treeOpen": ["Abrir el archivo o la carpeta", "Open the file or folder"],
    "a11y.k.delete": ["Eliminar el elemento seleccionado", "Delete the selected item"],
    "a11y.k.ends": ["Primero o último de la lista", "First or last of the list"],
    "a11y.k.sidebar": ["Mostrar u ocultar la barra lateral", "Show or hide the side bar"],
    "a11y.k.terminal": ["Abrir la terminal", "Open the terminal"],
    "a11y.k.nextRegion": ["Ir a la siguiente región", "Go to the next region"],
    "a11y.k.send": ["Enviar el mensaje", "Send the message"],
    "a11y.k.newline": ["Salto de línea", "New line"],
    "a11y.k.readReply": ["Leer la última respuesta", "Read the latest reply"],
    "a11y.k.closeWidget": ["Cerrar el panel", "Close the panel"],
    "chat.newProject": ["Nuevo proyecto", "New project"],
    "chat.newProjectHint": ["Agrupa las conversaciones de un mismo trabajo.", "Groups the chats of one piece of work."],
    "chat.project": ["Proyecto", "Project"],
    "chat.projectName": ["Nombre del proyecto", "Project name"],
    "chat.projectNamePh": ["p. ej. Página web", "e.g. Website"],
    "chat.projectCreated": ["Proyecto creado", "Project created"],
    "chat.projectDeleted": ["Proyecto eliminado", "Project deleted"],
    "chat.projectFail": ["No se pudo guardar el proyecto", "Could not save the project"],
    "chat.renameProject": ["Renombrar proyecto", "Rename project"],
    "chat.deleteProject": ["Eliminar proyecto", "Delete project"],
    "chat.deleteProjectBody": ["Se elimina el proyecto y todas sus conversaciones. Esta acción no se puede deshacer.", "The project and all of its chats will be deleted. This cannot be undone."],
    "chat.generalProtected": ["El proyecto General no se puede eliminar", "The General project cannot be deleted"],
    "chat.missingName": ["Escribe un nombre", "Type a name"],
    "chat.deleteAll": ["Eliminar todas", "Delete all"],
    "chat.deleteAllBody": ["Se eliminarán {n} conversaciones de este proyecto. Esta acción no se puede deshacer.", "{n} chats of this project will be deleted. This cannot be undone."],
    "chat.allDeleted": ["Conversaciones eliminadas", "Chats deleted"],
    "chat.deleteBody": ["Esta conversación se eliminará de forma permanente.", "This chat will be permanently deleted."],
    "chat.thinking": ["Ely está escribiendo", "Ely is typing"],
    "chat.recents": ["Recientes", "Recents"],
    "chat.projects": ["Proyectos", "Projects"],
    "chat.showMore": ["Mostrar más", "Show more"],
    "chat.showLess": ["Mostrar menos", "Show less"],
    "chat.whatBuild": ["¿Qué construimos?", "What should we build?"],
    "chat.doAnything": ["Haz lo que quieras…", "Do anything…"],
    "chat.minimize": ["Minimizar chat", "Minimize chat"],
    "chat.attach": ["Abrir archivo de Local Storage", "Open a Local Storage file"],
    "chat.send": ["Enviar", "Send"],
    "chat.stop": ["Detener", "Stop"],
    "chat.you": ["Tú", "You"],
    "chat.ely": ["Ely", "Ely"],
    "chat.reasoning": ["Razonamiento", "Reasoning"],
    "chat.total": ["Total", "Total"],
    "chat.completed": ["Finalizado", "Completed"],
    "chat.noRecents": ["Aún no hay conversaciones.", "No conversations yet."],
    "chat.noProjects": ["Sin proyectos todavía.", "No projects yet."],
    "chat.saved": ["Sesión guardada", "Session saved"],
    "chat.deleteConv": ["Eliminar conversación", "Delete conversation"],
    "chat.untitled": ["Sin título", "Untitled"],
    "chat.msgs": ["msj", "msgs"],
    "chat.context": ["Contexto", "Context"],
    "chat.noProfileTitle": ["Sin perfil", "No profile"],
    "chat.noProfileBody": ["Configura un perfil en Integraciones", "Set up a profile in Integrations"],
    "chat.apiError": ["Error de la API", "API error"],
    "chat.noResponse": ["No se recibió respuesta del modelo.", "No response received from the model."],
    "chat.toolRunning": ["Consultando el workspace", "Inspecting the workspace"],
    "chat.sug1": ["Resume el estado del proyecto", "Summarize the project status"],
    "chat.sug2": ["Abre un archivo de Local Storage", "Open a Local Storage file"],
    "chat.sug3": ["Explica el código seleccionado", "Explain the selected code"],
    "chat.openStorage": ["Local Storage", "Local Storage"],
    "chat.collapseSidebar": ["Contraer barra lateral CLI", "Collapse CLI sidebar"],
    "chat.expandSidebar": ["Expandir barra lateral CLI", "Expand CLI sidebar"],
    "chat.files": ["Archivos", "Files"],
    "chat.sent": ["Enviado", "Sent"],
    "chat.rename": ["Renombrar conversación", "Rename conversation"],
    "chat.renamed": ["Conversación renombrada", "Conversation renamed"],
    "chat.delete": ["Eliminar conversación", "Delete conversation"],
    "chat.api": ["API", "API"],
    "chat.workLocation": ["Lugar de trabajo", "Work location"],
    "chat.soon": ["Próximamente", "Coming soon"],
    "chat.soonBody": ["Esta función aún no está disponible.", "This feature is not available yet."],
    "chat.uploaded": ["Archivo subido a Local Storage", "File uploaded to Local Storage"],
    "chat.menu.upload": ["Añadir fotos y archivos", "Add photos and files"],
    "chat.menu.uploadDesc": ["Subir desde el ordenador", "Upload from your computer"],
    "chat.menu.library": ["Añadir desde la biblioteca", "Add from library"],
    "chat.menu.libraryDesc": ["Explora y busca tus archivos", "Browse and search your files"],
    "chat.menu.image": ["Crea una imagen", "Create an image"],
    "chat.menu.imageDesc": ["Visualiza cualquier cosa", "Visualize anything"],
    "chat.menu.internet": ["Búsqueda en Internet", "Internet search"],
    "chat.menu.internetDesc": ["Noticias e información en tiempo real", "Real-time news and information"],
    "chat.menu.project": ["Trabajar en un proyecto", "Work in a project"],
    "chat.menu.projectDesc": ["Abre el IDE en un proyecto", "Open the IDE in a project"],
    "chat.menu.research": ["Investigación avanzada", "Advanced research"],
    "chat.menu.researchDesc": ["Obtén un informe detallado", "Get a detailed report"],
    "chat.menu.draw": ["Dibujar", "Draw"],
    "chat.menu.drawDesc": ["Dibuja y adjunta una imagen", "Draw and attach an image"],
    "chat.menu.reasoning": ["Razonamiento", "Reasoning"],
    "chat.menu.reasoningDesc": ["Para respuestas detalladas", "For detailed answers"],
    "chat.menu.platform": ["Gestionar APIs", "Manage APIs"],
    "chat.menu.platformDesc": ["Configura tus claves y proveedores", "Set up your keys and providers"],

    // --- ajustes
    "set.title": ["Ajustes", "Settings"],
    "set.subtitle": ["preferencias del cliente", "client preferences"],
    "set.language": ["Idioma", "Language"],
    "set.languageHint": ["14 idiomas en toda la interfaz", "14 languages across the interface"],
    "set.langCoverage": ["de las frases traducidas", "of the phrases translated"],
    "set.langFallback": ["Lo que falte se muestra en inglés.", "Anything missing is shown in English."],
    "set.langNote.experimental": ["Traducción experimental: el latín no tiene vocabulario técnico normalizado.", "Experimental translation: Latin has no standardised technical vocabulary."],
    "set.langNote.constructed": ["Vendergood (W. J. Sidis, 1909): lengua construida con corpus público mínimo; paquete experimental con respaldo en inglés.", "Vendergood (W. J. Sidis, 1909): a constructed language with a tiny public corpus; experimental pack backed by English."],
    "set.nationality": ["Nacionalidad", "Nationality"],
    "set.nationalityHint": ["zona horaria para las horas (fin de respuesta)", "time zone for timestamps (response completion)"],
    "set.timePreview": ["Hora local ahora", "Local time now"],
    "set.density": ["Densidad de la interfaz", "Interface density"],
    "set.densityHint": ["espaciado de tarjetas y tablas", "card and table spacing"],
    "set.viewScale": ["Escala de interfaz", "Interface scale"],
    "set.viewScaleHint": ["Tamaño visual de Ely; no cambia el zoom del navegador", "Visual size of Ely; does not change browser zoom"],
    "set.comfortable": ["cómoda", "comfortable"],
    "set.compact": ["compacta", "compact"],
    "set.stream": ["Streaming en el chat", "Chat streaming"],
    "set.streamHint": ["usa /api/chat/stream (SSE)", "uses /api/chat/stream (SSE)"],
    "set.enterSends": ["Enter envía", "Enter sends"],
    "set.enterSendsHint": ["Shift+Enter hace salto de línea", "Shift+Enter inserts a newline"],
    "set.showUsage": ["Mostrar consumo", "Show usage"],
    "set.showUsageHint": ["tokens y latencia bajo cada respuesta", "tokens and latency under each reply"],
    "set.confirmClose": ["Confirmar al cerrar", "Confirm on close"],
    "set.confirmCloseHint": ["archivos con cambios sin guardar", "files with unsaved changes"],
    "set.reducedMotion": ["Reducir animaciones", "Reduce motion"],
    "set.reducedMotionHint": ["menos movimiento en la interfaz", "less movement in the interface"],
    "set.reset": ["Restablecer", "Reset"],
    "set.resetDone": ["Ajustes restablecidos", "Settings reset"],
    "set.done": ["Listo", "Done"],
    "set.connection": ["Conexión activa", "Active connection"],
    "set.server": ["servidor", "server"],
    "set.online": ["en línea", "online"],
    "set.offline": ["sin respuesta", "no response"],
    "set.profile": ["perfil", "profile"],
    "set.model": ["modelo", "model"],
    "set.key": ["clave", "key"],
    "set.endpoint": ["endpoint", "endpoint"],
    "set.mcps": ["MCPs", "MCPs"],
    "set.integrations": ["Integraciones", "Integrations"],
    "set.config": ["Configuración", "Configuration"],

    // --- local storage
    "ls.title": ["Local Storage", "Local Storage"],
    "ls.subtitle": ["Archivos del perfil activo, en dos categorías: lo <b>generado</b> (acceso rápido) y lo <b>planeado</b>.", "Files of the active profile, in two categories: <b>generated</b> (quick access) and <b>planned</b>."],
    "ls.generated": ["Generado", "Generated"],
    "ls.quickAccess": ["acceso rápido · lo que ya se creó", "quick access · what was already created"],
    "ls.planned": ["Planeado", "Planned"],
    "ls.plannedHint": ["lo que se planea tener", "what you plan to have"],
    "ls.conversations": ["Conversaciones", "Conversations"],
    "ls.files": ["Archivos", "Files"],
    "ls.noConvs": ["Aún no hay conversaciones guardadas en este perfil. Se guardan solas al chatear.", "No saved conversations in this profile yet. They are saved automatically as you chat."],
    "ls.noFilesGen": ["Todavía no hay archivos generados.", "No generated files yet."],
    "ls.noFilesPlan": ["Sin archivos. Puedes soltar borradores en la carpeta planeado/.", "No files. You can drop drafts into the planeado/ folder."],
    "ls.noPlanned": ["Nada planeado todavía. Apunta aquí lo que quieres generar o conseguir.", "Nothing planned yet. Note here what you want to generate or get."],
    "ls.add": ["Añadir", "Add"],
    "ls.titlePh": ["¿Qué planeas tener? (título)", "What do you plan to have? (title)"],
    "ls.notePh": ["Detalle opcional…", "Optional detail…"],
    "ls.missingTitle": ["Falta el título", "Missing title"],
    "ls.missingTitleBody": ["Escribe qué planeas tener.", "Write what you plan to have."],
    "ls.added": ["Añadido a Planeado", "Added to Planned"],
    "ls.addFail": ["No se pudo añadir", "Could not add"],
    "ls.deleted": ["Eliminado de Planeado", "Removed from Planned"],
    "ls.convDeleted": ["Conversación eliminada", "Conversation deleted"],
    "ls.deleteFail": ["No se pudo eliminar", "Could not delete"],
    "ls.refresh": ["Actualizar", "Refresh"],
    "ls.openChat": ["Abrir en el chat", "Open in chat"],
    "ls.samples": ["Crear ejemplos", "Create samples"],
    "ls.samplesDone": ["Archivos de ejemplo creados", "Sample files created"],

    // --- visor de archivos
    "vw.source": ["Fuente", "Source"],
    "vw.render": ["Vista", "Preview"],
    "vw.download": ["Descargar", "Download"],
    "vw.openIDE": ["Abrir en IDE", "Open in IDE"],
    "vw.loading": ["Abriendo archivo…", "Opening file…"],
    "vw.error": ["No se pudo abrir el archivo", "Could not open the file"],
    "vw.binary": ["Archivo binario", "Binary file"],
    "vw.empty": ["Archivo vacío", "Empty file"],
    "vw.latexNote": ["Render LaTeX básico (subconjunto). Usa «Fuente» para ver el .tex completo.", "Basic LaTeX render (subset). Use “Source” to see the full .tex."],

    // --- widget
    "cw.pin": ["Fijar (mantener abierto)", "Pin (keep open)"],
    "cw.unpin": ["Soltar (se cerrará al navegar)", "Unpin (closes on navigate)"],
    "cw.expand": ["Expandir al chat completo", "Expand to full chat"],
    "cw.minimize": ["Minimizar", "Minimize"],
    "cw.emptySub": ["Escribe abajo para empezar.", "Type below to start."],
    "cw.placeholder": ["Escribe tu mensaje…", "Type your message…"],

    // --- IDE (tipo VS Code)
    "ide.file": ["Archivo", "File"],
    "ide.edit": ["Editar", "Edit"],
    "ide.view": ["Ver", "View"],
    "ide.run": ["Ejecutar", "Run"],
    "ide.openComputer": ["Abrir desde el ordenador…", "Open from computer…"],
    "ide.openStorage": ["Abrir desde Local Storage…", "Open from Local Storage…"],
    "ide.newProject": ["Crear proyecto…", "Create project…"],
    "ide.save": ["Guardar", "Save"],
    "ide.closeEditor": ["Cerrar editor", "Close editor"],
    "ide.undo": ["Deshacer", "Undo"],
    "ide.redo": ["Rehacer", "Redo"],
    "ide.explorer": ["Explorador", "Explorer"],
    "ide.search": ["Buscar", "Search"],
    "ide.scm": ["Control de código", "Source Control"],
    "ide.runDebug": ["Ejecutar y depurar", "Run and Debug"],
    "ide.extensions": ["Extensiones", "Extensions"],
    "ide.scmEmpty": ["El workspace no es un repositorio Git. Inicializa uno para ver los cambios aquí.", "The workspace is not a Git repository. Initialize one to see changes here."],
    "ide.runEmpty": ["Abre un archivo y usa Ejecutar › Ejecutar archivo para lanzarlo.", "Open a file and use Run › Run File to launch it."],
    "ide.extEmpty": ["Las extensiones estarán disponibles próximamente.", "Extensions will be available soon."],
    "ide.openFolder": ["Abrir carpeta", "Open Folder"],
    "ide.noFolder": ["Ninguna carpeta abierta", "No Folder Opened"],
    "ide.noFolderHint": ["Aún no has cargado un proyecto. Abre una carpeta, un archivo de Local Storage o crea un proyecto.", "You have not opened a folder yet. Open a folder, a Local Storage file, or create a project."],
    "ide.closeFolder": ["Cerrar carpeta", "Close Folder"],
    "ide.searchPlaceholder": ["Buscar en el workspace…", "Search the workspace…"],
    "ide.noResults": ["Sin resultados.", "No results."],
    "ide.emptyWorkspace": ["Carpeta vacía.", "Empty folder."],
    "ide.welcome": ["Abre una carpeta, un archivo de Local Storage o crea un proyecto para empezar.", "Open a folder, a Local Storage file, or create a project to get started."],
    "ide.spaces": ["Espacios", "Spaces"],
    "ide.cantOpen": ["No se pudo abrir", "Could not open"],
    "ide.readOnly": ["Origen de solo lectura", "Read-only source"],
    "ide.saved": ["Guardado", "Saved"],
    "ide.notSaved": ["No se guardó", "Not saved"],
    "ide.openFirst": ["Abre un archivo primero", "Open a file first"],
    "ide.runSoon": ["La ejecución de archivos llegará próximamente.", "File execution is coming soon."],
    "ide.runFile": ["Ejecutar archivo", "Run File"],
    "ide.uploaded": ["Archivo abierto en el workspace", "File opened in the workspace"],
    "ide.projectName": ["Nombre del proyecto", "Project name"],
    "ide.template": ["Plantilla", "Template"],
    "ide.create": ["Crear", "Create"],
    "ide.tplBlank": ["En blanco", "Blank"],
    "ide.tplWeb": ["Web (HTML/CSS/JS)", "Web (HTML/CSS/JS)"],
    "ide.tplPython": ["Python", "Python"],
    "ide.tplNode": ["Node.js", "Node.js"],
    "ide.projectCreated": ["Proyecto creado", "Project created"],
    "ide.soon": ["Próximamente", "Coming soon"],
    "ide.soonBody": ["Esta función del IDE aún no está disponible en la web.", "This IDE feature is not available on the web yet."],
    "ide.newTextFile": ["Nuevo archivo de texto", "New Text File"],
    "ide.newFile": ["Nuevo archivo…", "New File…"],
    "ide.newWindow": ["Nueva ventana", "New Window"],
    "ide.openFile": ["Abrir archivo…", "Open File…"],
    "ide.openRecent": ["Abrir reciente", "Open Recent"],
    "ide.noRecent": ["Sin recientes", "No recent"],
    "ide.saveAs": ["Guardar como…", "Save As…"],
    "ide.saveAll": ["Guardar todo", "Save All"],
    "ide.cut": ["Cortar", "Cut"],
    "ide.copy": ["Copiar", "Copy"],
    "ide.paste": ["Pegar", "Paste"],
    "ide.find": ["Buscar", "Find"],
    "ide.replace": ["Reemplazar", "Replace"],
    "ide.findInFiles": ["Buscar en archivos", "Find in Files"],
    "ide.toggleComment": ["Alternar comentario de línea", "Toggle Line Comment"],
    "ide.selection": ["Selección", "Selection"],
    "ide.selectAll": ["Seleccionar todo", "Select All"],
    "ide.copyLineUp": ["Copiar línea arriba", "Copy Line Up"],
    "ide.copyLineDown": ["Copiar línea abajo", "Copy Line Down"],
    "ide.moveLineUp": ["Mover línea arriba", "Move Line Up"],
    "ide.moveLineDown": ["Mover línea abajo", "Move Line Down"],
    "ide.duplicateSel": ["Duplicar selección", "Duplicate Selection"],
    "ide.multiCursor": ["Multi-cursor", "Multi-cursor"],
    "ide.commandPalette": ["Paleta de comandos…", "Command Palette…"],
    "ide.appearance": ["Apariencia", "Appearance"],
    "ide.menuBar": ["Barra de menús", "Menu Bar"],
    "ide.activityBar": ["Barra de actividad", "Activity Bar"],
    "ide.sideBar": ["Barra lateral", "Side Bar"],
    "ide.panel": ["Panel", "Panel"],
    "ide.statusBar": ["Barra de estado", "Status Bar"],
    // --- panel inferior: terminal, salida, problemas y puertos (VS Code)
    "term.new": ["Nueva terminal", "New Terminal"],
    "term.newWindow": ["Nueva ventana de terminal", "New Terminal Window"],
    "term.newMenu": ["Crear terminal con perfil", "Create terminal with profile"],
    "term.split": ["Dividir terminal", "Split Terminal"],
    "term.splitWith": ["Dividir terminal con perfil", "Split Terminal with Profile"],
    "term.splitLimit": ["Máximo de paneles por terminal alcanzado", "Maximum panes per terminal reached"],
    "term.kill": ["Terminar terminal", "Kill Terminal"],
    "term.killAll": ["Terminar todas las terminales", "Kill All Terminals"],
    "term.killed": ["Terminal terminada", "Terminal killed"],
    "term.clear": ["Limpiar terminal", "Clear Terminal"],
    "term.rename": ["Cambiar nombre de la terminal", "Rename Terminal"],
    "term.renameHint": ["Escribe el nuevo nombre", "Type the new name"],
    "term.renamed": ["Terminal renombrada", "Terminal renamed"],
    "term.settings": ["Configurar ajustes de terminal", "Configure Terminal Settings"],
    "term.selectDefault": ["Seleccionar perfil predeterminado", "Select Default Profile"],
    "term.defaultProfile": ["Perfil predeterminado", "Default profile"],
    "term.defaultIs": ["Perfil predeterminado:", "Default profile:"],
    "term.profile": ["Perfil de terminal", "Terminal profile"],
    "term.runTask": ["Ejecutar tarea…", "Run Task…"],
    "term.configureTasks": ["Configurar tareas…", "Configure Tasks…"],
    "term.noTasks": ["No hay tareas: se abre tasks.json para crearlas", "No tasks: opening tasks.json to create them"],
    "term.noRunner": ["No sé cómo ejecutar este tipo de archivo", "I don't know how to run this file type"],
    "term.copyAll": ["Copiar todo", "Copy All"],
    "term.selectAll": ["Seleccionar todo", "Select All"],
    "term.copied": ["Salida copiada", "Output copied"],
    "term.more": ["Más acciones de terminal", "More terminal actions"],
    "term.list": ["Lista de terminales", "Terminal list"],
    "term.pane": ["Panel de terminal", "Terminal pane"],
    "term.output": ["Salida de la terminal", "Terminal output"],
    "term.input": ["Línea de comandos", "Command line"],
    "term.none": ["No hay terminales abiertas.", "No terminals open."],
    "term.hint": ["escribe un comando y pulsa Enter. ↑/↓ historial · Ctrl+L limpiar", "type a command and press Enter. ↑/↓ history · Ctrl+L clear"],
    "out.title": ["Salida", "Output"],
    "out.channel": ["Canal de salida", "Output channel"],
    "out.filter": ["Filtrar salida", "Filter output"],
    "out.filterPlaceholder": ["Filtrar (p. ej. texto, !excluir, \"frase exacta\")", "Filter (e.g. text, !excludeText, \"exact phrase\")"],
    "out.clear": ["Limpiar salida", "Clear Output"],
    "out.cleared": ["Salida limpiada", "Output cleared"],
    "out.lock": ["Bloquear desplazamiento", "Lock Scrolling"],
    "out.more": ["Más acciones de salida", "More output actions"],
    "out.copy": ["Copiar todo", "Copy All"],
    "out.copied": ["Salida copiada", "Output copied"],
    "out.stamps": ["Mostrar marcas de tiempo", "Show Timestamps"],
    "out.empty": ["Este canal todavía no tiene mensajes.", "This channel has no messages yet."],
    "out.noMatch": ["Ninguna línea coincide con el filtro.", "No lines match the filter."],
    "out.started": ["Ely IDE iniciado.", "Ely IDE started."],
    "panel.maximize": ["Maximizar panel", "Maximize Panel"],
    "panel.restore": ["Restaurar tamaño del panel", "Restore Panel Size"],
    "panel.maximized": ["Panel maximizado", "Panel maximized"],
    "panel.restored": ["Panel restaurado", "Panel restored"],
    "panel.hide": ["Ocultar panel", "Hide Panel"],
    "prob.filter": ["Filtrar problemas", "Filter problems"],
    "prob.filterPlaceholder": ["Filtrar (p. ej. texto, !excluir)", "Filter (e.g. text, !excludeText)"],
    "prob.refresh": ["Volver a comprobar", "Re-check"],
    "prob.more": ["Más acciones de problemas", "More problems actions"],
    "prob.errors": ["Mostrar errores", "Show Errors"],
    "prob.warnings": ["Mostrar avisos", "Show Warnings"],
    "prob.copy": ["Copiar problemas", "Copy Problems"],
    "prob.none": ["No se han detectado problemas en los archivos abiertos.", "No problems detected in the open files."],
    "prob.noFiles": ["Abre un archivo para comprobar su sintaxis.", "Open a file to check its syntax."],
    "ports.add": ["Reenviar un puerto", "Forward a Port"],
    "ports.addHint": ["Número de puerto (1-65535)", "Port number (1-65535)"],
    "ports.invalid": ["Puerto no válido", "Invalid port"],
    "ports.refresh": ["Actualizar puertos", "Refresh Ports"],
    "ports.port": ["Puerto", "Port"],
    "ports.process": ["Proceso", "Process"],
    "ports.address": ["Dirección reenviada", "Forwarded Address"],
    "ports.state": ["Estado", "State"],
    "ports.listening": ["En escucha", "Listening"],
    "ports.none": ["Ningún puerto en escucha.", "No ports listening."],
    "ports.unsupported": ["Este sistema no expone /proc/net/tcp: no se pueden listar los puertos.", "This system does not expose /proc/net/tcp: ports cannot be listed."],
    "debug.none": ["No hay ninguna sesión de depuración activa. Puedes ejecutar el archivo en la terminal.", "There is no active debug session. You can run the file in the terminal."],
    "editor.runMenu": ["Opciones de ejecución", "Run Options"],
    "editor.runFile": ["Ejecutar archivo", "Run File"],
    "editor.more": ["Más acciones del grupo de editores", "More editor group actions"],
    "editor.showOpened": ["Mostrar editores abiertos", "Show Opened Editors"],
    "editor.closeAll": ["Cerrar todo", "Close All"],
    "editor.closeSaved": ["Cerrar guardados", "Close Saved"],
    "editor.previewEditors": ["Habilitar editores de vista previa", "Enable Preview Editors"],
    "editor.maximizeGroup": ["Maximizar grupo", "Maximize Group"],
    "editor.lockGroup": ["Bloquear grupo", "Lock Group"],
    "editor.locked": ["Grupo bloqueado", "Group locked"],
    "editor.unlocked": ["Grupo desbloqueado", "Group unlocked"],
    "editor.configure": ["Configurar editores", "Configure Editors"],
    "editor.unsavedLeft": ["Hay archivos sin guardar: guárdalos o ciérralos uno a uno", "There are unsaved files: save them or close them one by one"],
    "editor.groupMaximized": ["Grupo de editores maximizado", "Editor group maximized"],
    "editor.groupRestored": ["Grupo de editores restaurado", "Editor group restored"],
    "ide.problems": ["Problemas", "Problems"],
    "ide.output": ["Salida", "Output"],
    "ide.debugConsole": ["Consola de depuración", "Debug Console"],
    "ide.terminal": ["Terminal", "Terminal"],
    "ide.wordWrap": ["Ajuste de línea", "Word Wrap"],
    "ide.go": ["Ir", "Go"],
    "ide.back": ["Atrás", "Back"],
    "ide.forward": ["Adelante", "Forward"],
    "ide.goToFile": ["Ir a archivo…", "Go to File…"],
    "ide.goToLine": ["Ir a línea/columna…", "Go to Line/Column…"],
    "ide.goToDef": ["Ir a definición", "Go to Definition"],
    "ide.goToRef": ["Ir a referencias", "Go to References"],
    "ide.startDebug": ["Iniciar depuración", "Start Debugging"],
    "ide.runNoDebug": ["Ejecutar sin depurar", "Run Without Debugging"],
    "ide.stopDebug": ["Detener depuración", "Stop Debugging"],
    "ide.toggleBreakpoint": ["Alternar punto de interrupción", "Toggle Breakpoint"],
    "ide.addConfig": ["Añadir configuración…", "Add Configuration…"],
    "ide.ports": ["Puertos", "Ports"],
    "ide.panelEmpty": ["Sin contenido todavía.", "No content yet."],
    "ide.termHint": ["escribe un comando (cd, ls, python3, git…). Ctrl+J / Ctrl+Ñ para abrir/cerrar.", "type a command (cd, ls, python3, git…). Ctrl+J / Ctrl+Ñ to toggle."],
    "ide.loadingFolder": ["Cargando carpeta del ordenador", "Loading folder from computer"],
    "ide.commitMsg": ["Mensaje de commit", "Commit message"],
    "ide.commit": ["Commit", "Commit"],
    "ide.stage": ["Preparar", "Stage"],
    "ide.unstage": ["Quitar de preparación", "Unstage"],
    "ide.discard": ["Descartar cambios", "Discard changes"],
    "ide.diff": ["Ver diff", "View diff"],
    "ide.history": ["Historial", "History"],
    "ide.noChanges": ["Sin cambios.", "No changes."],
    "ide.tasks": ["Tareas", "Tasks"],
    "ide.noTasks": ["Sin tareas. Crea .ely/tasks.json.", "No tasks. Create .ely/tasks.json."],
    "ide.newFolder": ["Nueva carpeta", "New Folder"],
    "ide.rename": ["Renombrar", "Rename"],
    "ide.move": ["Mover", "Move"],
    "ide.sortName": ["Nombre", "Name"],
    "ide.sortType": ["Tipo", "Type"],
    "ide.sortSize": ["Tamaño", "Size"],
    "ide.showHidden": ["Mostrar ocultos", "Show hidden"],
    "ide.outline": ["Esquema", "Outline"],
    "ide.noHistory": ["Sin historial local.", "No local history."],
    "ide.localHistory": ["Historial local", "Local History"],
    "ide.includeGlob": ["Incluir (glob, ej. *.py)", "Include (glob, e.g. *.py)"],
    "ide.excludeGlob": ["Excluir (glob)", "Exclude (glob)"],
    "ide.previewReplace": ["Vista previa de reemplazo", "Preview replace"],
    "ide.matches": ["coincidencias", "matches"],
    "ide.transform": ["Transformar texto", "Transform text"],
    "ide.tUpper": ["MAYÚSCULAS", "UPPERCASE"],
    "ide.tLower": ["minúsculas", "lowercase"],
    "ide.tSort": ["Ordenar líneas", "Sort lines"],
    "ide.tJoin": ["Unir líneas", "Join lines"],
    "ide.tTrim": ["Eliminar espacios finales", "Trim trailing whitespace"],
    "ide.tFinalNl": ["Salto de línea final", "Final newline"],
    "ide.tDedupe": ["Eliminar líneas duplicadas", "Remove duplicate lines"],
    "ide.tRemoveBlank": ["Eliminar líneas en blanco", "Remove blank lines"],
    "ide.tTabsSpaces": ["Tabulaciones → espacios", "Tabs → spaces"],
    "ide.tSpacesTabs": ["Espacios → tabulaciones", "Spaces → tabs"],
    "ide.tDeleteLine": ["Eliminar línea", "Delete line"],
    "ide.tLineBefore": ["Insertar línea antes", "Insert line before"],
    "ide.tLineAfter": ["Insertar línea después", "Insert line after"],
    "ide.tDelStart": ["Borrar hasta inicio de línea", "Delete to line start"],
    "ide.tDelEnd": ["Borrar hasta fin de línea", "Delete to line end"],
    "ide.tIndent": ["Indentar selección", "Indent selection"],
    "ide.tOutdent": ["Desindentar selección", "Outdent selection"],
    "ide.tSelectWord": ["Seleccionar palabra", "Select word"],
    "ide.tSelectLine": ["Seleccionar línea", "Select line"],
    "ide.tTranspose": ["Transponer caracteres", "Transpose characters"],
    "ide.fileName": ["Nombre del archivo", "File name"],
    "ide.language": ["Lenguaje", "Language"],
    "ide.selectLanguage": ["Seleccionar modo de lenguaje", "Select Language Mode"],

    // --- común
    "common.refresh": ["Recargar", "Refresh"],
    "common.save": ["Guardar", "Save"],
    "common.cancel": ["Cancelar", "Cancel"],
    "common.close": ["Cerrar", "Close"],
    "common.delete": ["Eliminar", "Delete"],
    "common.retry": ["Reintentar", "Retry"],
    "common.loading": ["Cargando…", "Loading…"],
    "common.opFail": ["No se pudo completar la operación", "Could not complete the operation"],

    // --- plantillas dinámicas (los paquetes traducen pat.* con $1, $2…)
    "pat.agoS": ["hace $1 s", "$1 s ago"],
    "pat.agoMin": ["hace $1 min", "$1 min ago"],
    "pat.agoH": ["hace $1 h", "$1 h ago"],
    "pat.justNow": ["hace un momento", "just now"],
    "pat.configured": ["$1 configurados", "$1 configured"],
    "pat.meanLatency": ["latencia media $1", "mean latency $1"],
    "pat.success": ["$1% con éxito", "$1% success"],
    "pat.calls": ["$1 llamadas", "$1 calls"],
    "pat.files": ["$1 archivos", "$1 files"],
    "pat.steps": ["$1 pasos", "$1 steps"],
    "pat.saved": ["$1 guardadas", "$1 saved"],
    "pat.chats": ["$1 conversaciones", "$1 chats"],
    "pat.profiles": ["$1 perfiles", "$1 profiles"],
    "pat.testing": ["probando $1 perfiles…", "testing $1 profiles…"],
    "pat.endpoints": ["$1 endpoint(s) respondieron · $2", "$1 endpoint(s) replied · $2"],
    "pat.lineCol": ["Línea $1, columna $2", "Line $1, column $2"],
    "pat.spaces": ["Espacios: $1", "Spaces: $1"],
    "pat.chars": ["$1 caracteres", "$1 characters"],
    "pat.words": ["$1 palabras", "$1 words"],
    "pat.matches": ["$1 coincidencias", "$1 matches"],
    "pat.results": ["$1 resultados", "$1 results"],
    "pat.selected": ["$1 seleccionados", "$1 selected"],
    "pat.updated": ["Actualizado $1", "Updated $1"],
    "pat.created": ["Creado $1", "Created $1"],
    "pat.agents": ["$1 agentes", "$1 agents"],
    "pat.mcp": ["$1 servidor(es) MCP declarados. Ely no los arranca automáticamente.", "$1 MCP server(s) declared. Ely does not start them automatically."],
    "pat.hidden": ["$1 (oculta)", "$1 (hidden)"],
    "pat.skills": ["$1 skills", "$1 skills"],
    "pat.repos": ["$1 repositorios", "$1 repositories"],
    "pat.notes": ["$1 notas", "$1 notes"],
    "pat.tools": ["$1 herramientas", "$1 tools"],
    "pat.flows": ["$1 flujos", "$1 flows"],
    "pat.teams": ["$1 equipos", "$1 teams"],
    "pat.jobs": ["$1 trabajos", "$1 jobs"],
    "pat.devices": ["$1 dispositivos", "$1 devices"],
    "pat.tls": ["La conexión TLS se cerró durante el handshake. Causa típica: un proxy de salida (sandbox/egress) bloquea este host.$1", "The TLS connection closed during the handshake. Typical cause: an egress proxy (sandbox) blocks this host.$1"],
    "pat.noHttp": ["No hubo respuesta HTTP: DNS, TLS o un proxy de salida bloquea el host.$1", "No HTTP reply: DNS, TLS or an egress proxy blocks the host.$1"]
  };

  /* ------------------------------------------------------------------ *
   * Idiomas disponibles. `id` es el valor que se guarda en Settings;    *
   * `htmlLang` es la etiqueta BCP-47 que se pone en <html lang>.        *
   * `note` marca los paquetes experimentales (latín y vendergood).      *
   * ------------------------------------------------------------------ */
  const LANGS = [
    { id: "de", name: "Deutsch", en: "German", es: "Alemán", htmlLang: "de", script: "latin" },
    { id: "en", name: "English", en: "English", es: "Inglés", htmlLang: "en", script: "latin" },
    { id: "es", name: "Español", en: "Spanish", es: "Español", htmlLang: "es", script: "latin" },
    { id: "fr", name: "Français", en: "French", es: "Francés", htmlLang: "fr", script: "latin" },
    { id: "it", name: "Italiano", en: "Italian", es: "Italiano", htmlLang: "it", script: "latin" },
    { id: "la", name: "Latine", en: "Latin", es: "Latín", htmlLang: "la", script: "latin", note: "experimental" },
    { id: "pl", name: "Polski", en: "Polish", es: "Polaco", htmlLang: "pl", script: "latin" },
    { id: "pt", name: "Português", en: "Portuguese", es: "Portugués", htmlLang: "pt", script: "latin" },
    { id: "vg", name: "Vendergood", en: "Vendergood", es: "Vendergood", htmlLang: "art-x-vendergood", script: "latin", note: "constructed" },
    { id: "el", name: "Ελληνικά", en: "Greek", es: "Griego", htmlLang: "el", script: "greek" },
    { id: "ru", name: "Русский", en: "Russian", es: "Ruso", htmlLang: "ru", script: "cyrillic" },
    { id: "hi", name: "हिन्दी", en: "Hindi", es: "Hindi", htmlLang: "hi", script: "devanagari" },
    { id: "zh", name: "中文（简体）", en: "Chinese (Simplified)", es: "Chino (mandarín)", htmlLang: "zh-Hans", script: "cjk" },
    { id: "ja", name: "日本語", en: "Japanese", es: "Japonés", htmlLang: "ja", script: "cjk" }
  ];
  const LANG_IDS = LANGS.map((l) => l.id);
  /* Paquetes cargados: id → { key: texto } (+ opcional `extra` y `phrases`). */
  const LOCALES = { es: null, en: null };
  const PHRASE_CACHE = {};
  const loading = {};

  /* Nacionalidad → zona horaria IANA + locale. */
  const COUNTRIES = [
    { id: "CO", es: "Colombia", en: "Colombia", tz: "America/Bogota", locale: "es-CO" },
    { id: "MX", es: "México", en: "Mexico", tz: "America/Mexico_City", locale: "es-MX" },
    { id: "AR", es: "Argentina", en: "Argentina", tz: "America/Argentina/Buenos_Aires", locale: "es-AR" },
    { id: "CL", es: "Chile", en: "Chile", tz: "America/Santiago", locale: "es-CL" },
    { id: "PE", es: "Perú", en: "Peru", tz: "America/Lima", locale: "es-PE" },
    { id: "EC", es: "Ecuador", en: "Ecuador", tz: "America/Guayaquil", locale: "es-EC" },
    { id: "VE", es: "Venezuela", en: "Venezuela", tz: "America/Caracas", locale: "es-VE" },
    { id: "ES", es: "España", en: "Spain", tz: "Europe/Madrid", locale: "es-ES" },
    { id: "US", es: "Estados Unidos", en: "United States", tz: "America/New_York", locale: "en-US" },
    { id: "CA", es: "Canadá", en: "Canada", tz: "America/Toronto", locale: "en-CA" },
    { id: "GB", es: "Reino Unido", en: "United Kingdom", tz: "Europe/London", locale: "en-GB" },
    { id: "BR", es: "Brasil", en: "Brazil", tz: "America/Sao_Paulo", locale: "pt-BR" },
    { id: "DE", es: "Alemania", en: "Germany", tz: "Europe/Berlin", locale: "de-DE" },
    { id: "FR", es: "Francia", en: "France", tz: "Europe/Paris", locale: "fr-FR" },
    { id: "JP", es: "Japón", en: "Japan", tz: "Asia/Tokyo", locale: "ja-JP" },
    { id: "CN", es: "China", en: "China", tz: "Asia/Shanghai", locale: "zh-CN" },
    { id: "IN", es: "India", en: "India", tz: "Asia/Kolkata", locale: "en-IN" },
    { id: "AU", es: "Australia", en: "Australia", tz: "Australia/Sydney", locale: "en-AU" }
  ];

  function settings() { return window.Settings ? window.Settings.all : {}; }

  const I18N = {
    countries: COUNTRIES,
    langs: LANGS,
    base: D,

    lang() {
      const l = settings().language;
      return LANG_IDS.indexOf(l) >= 0 ? l : "es";
    },

    meta(id) {
      const want = id || this.lang();
      return LANGS.find((l) => l.id === want) || LANGS[2];
    },

    /* 0 = español (origen), 1 = cualquier otro idioma (se traduce el DOM). */
    idx() { return this.lang() === "es" ? 0 : 1; },

    has(id) { return id === "es" || id === "en" || !!LOCALES[id]; },

    /** Registra un paquete de idioma (lo llaman js/locales/<id>.js). */
    register(id, dict) {
      if (LANG_IDS.indexOf(id) < 0 || !dict) return false;
      LOCALES[id] = dict;
      delete PHRASE_CACHE[id];
      if (this.lang() === id) {
        document.documentElement.lang = this.meta(id).htmlLang;
        window.dispatchEvent(new CustomEvent("ely:langchange", { detail: { language: id } }));
      }
      return true;
    },

    /** Carga el paquete si hace falta. Español e inglés ya están dentro. */
    ensure(id) {
      const target = LANG_IDS.indexOf(id) >= 0 ? id : "es";
      if (this.has(target)) return Promise.resolve(target);
      if (loading[target]) return loading[target];
      loading[target] = new Promise((resolve) => {
        const el = document.createElement("script");
        el.src = "js/locales/" + target + ".js?v=" + (window.APP_VERSION || "1");
        el.onload = () => { delete loading[target]; resolve(target); };
        el.onerror = () => { delete loading[target]; resolve("en"); };
        document.head.appendChild(el);
      });
      return loading[target];
    },

    t(key) {
      const entry = D[key];
      const lang = this.lang();
      if (lang === "es") return entry ? entry[0] : key;
      if (lang !== "en") {
        const pack = LOCALES[lang];
        if (pack && pack[key]) return pack[key];
      }
      if (!entry) return key;
      return entry[1] || entry[0];
    },

    /** Paquete registrado (o null). Útil para tests y para el panel de Ajustes. */
    dict(id) { return LOCALES[id || this.lang()] || null; },

    /** Cobertura real del paquete: cuántas claves del base están traducidas. */
    coverage(id) {
      const target = id || this.lang();
      const total = Object.keys(D).length;
      if (target === "es" || target === "en") return { translated: total, total: total, pct: 100 };
      const pack = LOCALES[target] || {};
      const done = Object.keys(D).filter((k) => !!pack[k]).length;
      return { translated: done, total: total, pct: Math.round((done / total) * 100) };
    },

    setLang(lang) {
      const target = LANG_IDS.indexOf(lang) >= 0 ? lang : "es";
      return this.ensure(target).then(() => {
        if (window.Settings) Settings.set({ language: target });
        document.documentElement.lang = this.meta(target).htmlLang;
        return target;
      });
    },

    country() {
      const id = settings().nationality || "CO";
      return COUNTRIES.find((c) => c.id === id) || COUNTRIES[0];
    },

    tz() { return this.country().tz; },

    countryLabel() {
      const c = this.country();
      return this.lang() === "es" ? c.es : c.en;
    },

    /** mes/día/año hora:minuto en la zona horaria de la nacionalidad. */
    fmtDateTime(iso) {
      if (!iso) return "—";
      const date = iso instanceof Date ? iso : new Date(iso);
      if (Number.isNaN(date.getTime())) return String(iso);
      try {
        const parts = new Intl.DateTimeFormat("en-US", {
          timeZone: this.tz(), year: "numeric", month: "2-digit", day: "2-digit",
          hour: "2-digit", minute: "2-digit", hour12: false
        }).formatToParts(date);
        const get = (type) => (parts.find((p) => p.type === type) || {}).value || "";
        let hour = get("hour");
        if (hour === "24") hour = "00";
        return get("month") + "/" + get("day") + "/" + get("year") + " " + hour + ":" + get("minute");
      } catch (e) {
        return date.toLocaleString();
      }
    },

    /** Duración legible: 1.2 s / 350 ms / 1 min 05 s. */
    fmtDuration(ms) {
      const n = Number(ms);
      if (!n && n !== 0) return "—";
      if (n < 1000) return Math.round(n) + " ms";
      if (n < 60000) return (n / 1000).toFixed(1) + " s";
      const m = Math.floor(n / 60000);
      const s = Math.round((n % 60000) / 1000);
      return m + " min " + String(s).padStart(2, "0") + " s";
    }
  };

  /* ------------------------------------------------------------------ *
   * Traductor global de DOM (es → en). Cubre los textos estáticos de     *
   * TODAS las vistas sin refactorizarlas: recorre nodos de texto y los    *
   * atributos placeholder/title y traduce coincidencias exactas. No toca  *
   * código, contenido del usuario ni burbujas de chat.                    *
   * ------------------------------------------------------------------ */
  const PHRASES = {
    "Dashboard": "Dashboard", "Perfil activo": "Active profile", "Perfiles": "Profiles",
    "Perfil": "Profile", "Actividad reciente": "Recent activity", "telemetría local": "local telemetry",
    "endpoint": "endpoint", "credencial": "credential", "detalle": "detail",
    "Agent Pool": "Agent Pool", "Agent Teams": "Agent Teams", "Asset Browser": "Asset Browser",
    "Backend MCPs": "Backend MCPs", "Cost Tracker": "Cost Tracker", "Skills Library": "Skills Library",
    "Scheduled Jobs": "Scheduled Jobs", "Ely Cowork": "Ely Cowork",
    "Orquestación": "Orchestration", "Inspección": "Inspection", "Desarrollo": "Development", "Operaciones": "Operations",
    "Abrir chat": "Open chat", "Ajustes y políticas": "Settings and policies",
    "Archivos por perfil: generado y planeado": "Per-profile files: generated and planned",
    "Archivos y activos del workflow": "Workflow files and assets",
    "Buscando en": "Searching in", "Buscar ·": "Search ·", "Capacidades operativas": "Operational capabilities",
    "Cargando vista…": "Loading view…", "Claves reales vs claves de prueba": "Real keys vs test keys",
    "Clientes emparejados": "Paired clients", "Con tarifas": "With rates", "Conecta sistemas externos": "Connect external systems",
    "Conexión verificada": "Connection verified", "Consultando MCPs…": "Querying MCPs…",
    "Conversación con el perfil activo": "Conversation with the active profile",
    "Coordina equipos y roles": "Coordinate teams and roles", "Copiar endpoint": "Copy endpoint",
    "Copiar resultado": "Copy result", "Coste estimado": "Estimated cost", "Coste total": "Total cost",
    "Cómo añadir claves": "How to add keys", "Cómo declarar tarifas": "How to declare rates",
    "Define, edita y ejecuta flujos": "Define, edit and run flows",
    "Describe el objetivo con el detalle suficiente…": "Describe the goal in enough detail…",
    "Describe la tarea para el equipo…": "Describe the task for the team…",
    "Diagnóstico de red": "Network diagnostics", "Diseña y orquesta visualmente": "Design and orchestrate visually",
    "Edita y revisa skills": "Edit and review skills", "Editar equipo": "Edit team",
    "Editor de código con IA": "AI code editor",
    "Instala y activa extensiones con permisos": "Install and enable extensions with permissions", "Ejecutar ·": "Run ·",
    "El servidor local no responde": "The local server is not responding",
    "Elige al menos un agente": "Choose at least one agent", "Eliminar repositorio": "Delete repository",
    "Endpoint alcanzable": "Endpoint reachable", "Equipo completado": "Team completed",
    "Equipo de entrega": "Delivery team", "Equipo detenido": "Team stopped",
    "Error en la prueba": "Test error", "Escribe al menos 2 caracteres": "Type at least 2 characters",
    "Escribe una clave": "Enter a key", "Estado del backend": "Backend status",
    "Falta el nombre": "Missing name", "Falta el objetivo": "Missing goal", "Falta la tarea": "Missing task",
    "Gasto y eficiencia": "Spend and efficiency", "Guardar clave": "Save key",
    "Herramientas de los agentes": "Agent tools", "Herramientas y llamadas": "Tools and calls",
    "Importa repositorios Git al workspace": "Import Git repos into the workspace",
    "La nota está vacía": "The note is empty", "Leyendo memoria…": "Reading memory…",
    "Leyendo repositorios importados…": "Reading imported repositories…", "Leyendo skills…": "Reading skills…",
    "Llamando a": "Calling", "Local Storage": "Local Storage",
    "Memoria y grafo de contexto": "Memory and context graph",
    "Miembros (en orden de ejecución)": "Members (in execution order)", "Más archivos": "More files",
    "No se borró": "Not deleted", "No se eliminó": "Not removed", "No se guardó": "Not saved",
    "No se guardó nada.": "Nothing was saved.", "No se pudo cargar": "Could not load",
    "No se pudo rotar": "Could not rotate", "Nombre del equipo": "Team name",
    "Nueva skill": "New skill", "Nuevo equipo": "New team", "Objetivo del equipo:": "Team goal:",
    "Perfiles detectados": "Detected profiles", "Prueba completada": "Test completed",
    "Prueba fallida": "Test failed", "Repositorio eliminado": "Repository deleted",
    "Repositorio importado": "Repository imported", "Resumen de sesión y acciones": "Session summary and actions",
    "Reutiliza agentes y workflows": "Reuse agents and workflows", "Revisión de seguridad": "Security review",
    "Se borrarán": "Will be deleted", "Sin respuesta": "No response", "Sin workflow activo": "No active workflow",
    "Skill activada": "Skill enabled", "Skill desactivada": "Skill disabled", "Skill guardada": "Skill saved",
    "Tamaño": "Size", "tamaño": "size", "Tarea concreta para esta skill…": "Specific task for this skill…",
    "Tareas programadas": "Scheduled tasks", "Token rotado": "Token rotated",
    "Ver en agentes": "View in agents", "Ver prompt": "View prompt", "Vincula dispositivos": "Pair devices",
    "Workflow interrumpido": "Workflow interrupted", "archivos ·": "files ·", "auth rechazada": "auth rejected",
    "con respuesta válida": "with valid response", "de primer nivel": "top-level",
    "ej. Revisor de PRs": "e.g. PR reviewer", "en el workspace": "in the workspace", "en línea": "online",
    "latencia media": "average latency", "owner/repo o URL de GitHub…": "owner/repo or GitHub URL…",
    "probando 11 perfiles…": "testing 11 profiles…", "qué significa cada resultado": "what each result means",
    "raíz": "root", "resolver la tarea": "solve the task", "se descargan de verdad al pulsar": "really downloaded on click",
    "según tarifas del perfil": "per profile rates", "según usage del proveedor": "per provider usage",
    "sin .git ni node_modules": "without .git or node_modules", "sin clave": "no key",
    "sin historial": "no history", "sin respuesta": "no response", "sin tarifas declaradas": "no declared rates",
    "sin valor": "no value", "texto a buscar en el código…": "text to search in code…",
    "usage real": "real usage", "versión": "version", "· system prompt": "· system prompt",
    "▷ Probar todos": "▷ Test all", "✓ en línea": "✓ online", "⑂ main": "⑂ main",
    "Guardar": "Save", "Cancelar": "Cancel", "Cerrar": "Close", "Eliminar": "Delete",
    "Reintentar": "Retry", "Cargando…": "Loading…", "Añadir": "Add", "Actualizar": "Refresh",
    "Generado": "Generated", "Planeado": "Planned", "Conversaciones": "Conversations", "Archivos": "Files",
    "Crear ejemplos": "Create samples", "Abrir en el chat": "Open in chat",
    "Idioma": "Language", "Nacionalidad": "Nationality", "Ajustes": "Settings",
    "Español": "Spanish", "Inglés": "English", "Guardar cambios": "Save changes",
    "Nombre": "Name", "Descripción": "Description", "Estado": "Status", "Acciones": "Actions",
    "Tipo": "Type", "Fecha": "Date", "Modelo": "Model", "Proveedor": "Provider",
    "Clave": "Key", "Conexión": "Connection", "Probar": "Test", "Importar": "Import",
    "Exportar": "Export", "Descargar": "Download", "Subir": "Upload", "Buscar": "Search",
    "Filtrar": "Filter", "Ordenar": "Sort", "Seleccionar": "Select", "Confirmar": "Confirm",
    "Sí": "Yes", "No": "No", "Aceptar": "Accept", "Aplicar": "Apply", "Restablecer": "Reset",
    "Ejecutar": "Run", "Detener": "Stop", "Pausar": "Pause", "Reanudar": "Resume",
    "Completado": "Completed", "Pendiente": "Pending", "En curso": "In progress", "Error": "Error",
    "Éxito": "Success", "Advertencia": "Warning", "Información": "Information",
    "Sin resultados": "No results", "Vacío": "Empty", "Cargando": "Loading",
    "Workspace": "Workspace", "Repositorio": "Repository", "Repositorios": "Repositories",
    "Agentes": "Agents", "Agente": "Agent", "Equipos": "Teams", "Equipo": "Team",
    "Flujos": "Flows", "Flujo": "Flow", "Herramientas": "Tools", "Herramienta": "Tool",
    "Memoria": "Memory", "Costes": "Costs", "Costo": "Cost", "Integraciones": "Integrations",
    "Configuración": "Configuration", "Dispositivos": "Devices", "Trabajos": "Jobs",
    "Activos": "Assets", "Activo": "Asset", "Habilidades": "Skills", "Biblioteca": "Library",
    "Lienzo": "Canvas", "Editor": "Editor", "Vista previa": "Preview", "Fuente": "Source",
    "Abrir": "Open", "Nuevo": "New", "Nueva": "New", "Crear": "Create", "Editar": "Edit",
    "Borrar": "Delete", "Copiar": "Copy", "Pegar": "Paste", "Deshacer": "Undo", "Rehacer": "Redo"
  };

  /* Frases que no pasan por t(): HTML estático, textos que devuelve el
   * backend (agentes, navegación, errores) y literales sueltos de las vistas.
   * Auditadas recorriendo todas las rutas con el idioma en inglés. */
  const EXTRA = {
    "por Photon Labs": "by Photon Labs",
    "Un agente local que orquesta workflows, herramientas y rutinas en tus proyectos.": "A local agent that orchestrates workflows, tools and routines in your projects.",
    "Contraer menú": "Collapse menu",
    "Llamadas": "Calls",
    "Tokens": "Tokens",
    "Probar conexión": "Test connection",
    "Probar todos": "Test all",
    "Sin llamadas registradas. Abre el chat y envía un mensaje.": "No calls recorded. Open the chat and send a message.",
    "Sin respuestas simuladas: si el proveedor falla, lo verás aquí.": "No simulated replies: if the provider fails, you will see it here.",
    "Agent OS local. La interfaz habla con el servidor Python, que firma cada petición con la clave del perfil activo.": "Local Agent OS. The UI talks to the Python server, which signs every request with the active profile key.",
    "define tarifas en el perfil": "set rates in the profile",
    "tarifas por perfil": "rates per profile",
    "clave de prueba": "test key",
    "clave propia": "own key",
    "reportados por el proveedor": "reported by the provider",
    "llamadas al perfil": "calls to the profile",
    "Endpoint": "Endpoint",
    "Todas las llamadas son HTTP reales contra el perfil activo.": "Every call is real HTTP against the active profile.",
    "HTTP 200 del endpoint de chat: URL, ruta, clave y modelo son válidos.": "HTTP 200 from the chat endpoint: URL, path, key and model are valid.",
    "No hubo respuesta HTTP: DNS, TLS o un proxy de salida bloquea el host. No es un problema de la clave.": "No HTTP reply: DNS, TLS or an egress proxy blocks the host. This is not a key problem.",
    "Clave guardada": "Key saved",
    "Clave rechazada": "Key rejected",
    "Error desconocido": "Unknown error",
    "Sin datos": "No data",
    "No se pudo copiar": "Could not copy",
    "No se pudo contactar con el servidor local. ¿Sigue ejecutándose `ely serve`?": "Could not reach the local server. Is `ely serve` still running?",
    "Inicia el servidor y vuelve a cargar.": "Start the server and reload.",
    "La interfaz necesita el backend de Ely Cowork para hablar con los proveedores.": "The UI needs the Ely Cowork backend to talk to the providers.",
    "Vista no encontrada": "View not found",
    "No se pudo completar la operación": "The operation could not be completed",
    "Copiado": "Copied",
    "Agente orquestador": "Orchestrator agent",
    "Datos y análisis": "Data and analysis",
    "Documentación": "Documentation",
    "Infra y automatización": "Infra and automation",
    "Ingeniería y código": "Engineering and code",
    "Producto y estrategia": "Product and strategy",
    "Revisión y seguridad": "Review and security",
    "Terminal y sistema": "Terminal and system",
    "¿Qué quieres construir hoy?": "What do you want to build today?",
    "¿Qué quieres hacer en la terminal?": "What do you want to do in the terminal?",
    "¿Qué módulo o API documentamos?": "Which module or API shall we document?",
    "¿Qué despliegue o automatización necesitas?": "Which deployment or automation do you need?",
    "Cuéntame la idea y su usuario.": "Tell me the idea and its user.",
    "Describe la tabla o pega el dataset.": "Describe the table or paste the dataset.",
    "Pega el código a revisar.": "Paste the code to review.",
    "Pega tu error o describe el módulo que necesitas.": "Paste your error or describe the module you need.",
    "Especificación → implementación → revisión de código.": "Spec → implementation → code review.",
    "Causa raíz → parche → verificación.": "Root cause → patch → verification.",
    "Borrador de referencia y corrección técnica.": "Reference draft and technical correctness.",
    "Manifiestos, auditoría y runbook.": "Manifests, audit and runbook.",
    "Especificar, implementar y revisar una feature de principio a fin.": "Specify, implement and review a feature end to end.",
    "El flujo se interrumpió:": "The flow was interrupted:",
    "sin MCP": "no MCP",
    "sin token": "no token",
    "en ejecución": "running",
    "revisión": "review",
    "no existe": "does not exist",
    "no encontrada": "not found",
    "solo lectura": "read only",
    "Sin contenido de texto": "No text content",
    "Añadir nota": "Add note",
    "Guardar nota": "Save note",
    "Instrucción": "Instruction",
    "Instrucción que se enviará como parte del prompt…": "Instruction sent as part of the prompt…",
    "Sin instrucción definida.": "No instruction defined.",
    "— complétala en Skills": "— complete it in Skills",
    "Crear skill de ejemplo": "Create sample skill",
    "Editar skill": "Edit skill",
    "Skill creada": "Skill created",
    "Ir a Skills": "Go to Skills",
    "Chatear con": "Chat with",
    "Indica un repositorio": "Enter a repository",
    "Token de emparejamiento": "Pairing token",
    "Rotar el token": "Rotate the token",
    "Las instalaciones ya emparejadas dejarán de ser válidas.": "Installations already paired will stop being valid.",
    "Ningún cliente externo ha usado el token todavía. El campo se rellena cuando un cliente se registra contra la API.": "No external client has used the token yet. The field fills in when a client registers against the API.",
    "Añadido a Planeado": "Added to Planned",
    "No se creó": "Was not created",
    "Archivo vacío": "Empty file",
    "Archivo binario": "Binary file",
    "Archivos de ejemplo creados": "Sample files created",
    "Archivo subido a Local Storage": "File uploaded to Local Storage",
    "Archivo abierto en el workspace": "File opened in the workspace",
    "Ely terminal ·": "Ely terminal ·",
    "✗ sin respuesta": "✗ no reply",
    "! auth rechazada": "! auth rejected",
    "— el endpoint respondió: URL y cabecera correctas.": "— the endpoint replied: URL and header are correct.",
    "Abrir carpeta": "Open folder",
    "Abrir archivo…": "Open file…",
    "Abrir desde el ordenador…": "Open from computer…",
    "Abrir desde Local Storage…": "Open from Local Storage…",
    "Abrir archivo de Local Storage": "Open file from Local Storage",
    "Abre un archivo de Local Storage": "Open a file from Local Storage",
    "Abre el IDE en un proyecto": "Open the IDE in a project",
    "Abre un archivo primero": "Open a file first",
    "Abre un archivo y usa Ejecutar › Ejecutar archivo para lanzarlo.": "Open a file and use Run › Run File to launch it.",
    "Abre una carpeta, un archivo de Local Storage o crea un proyecto para empezar.": "Open a folder, a Local Storage file or create a project to start.",
    "Aún no has cargado un proyecto. Abre una carpeta, un archivo de Local Storage o crea un proyecto.": "You have not loaded a project yet. Open a folder, a Local Storage file or create a project.",
    "Abriendo archivo…": "Opening file…",
    "Abrir en IDE": "Open in IDE",
    "Abrir reciente": "Open recent",
    "Barra de actividad": "Activity Bar",
    "Barra de estado": "Status Bar",
    "Barra de menús": "Menu Bar",
    "Alternar comentario de línea": "Toggle line comment",
    "Alternar punto de interrupción": "Toggle breakpoint",
    "Borrar hasta fin de línea": "Delete to end of line",
    "Añadir configuración…": "Add Configuration…",
    "Añadir desde la biblioteca": "Add from library",
    "Añadir fotos y archivos": "Add photos and files",
    "Ajustes restablecidos": "Settings reset",
    "Aún no hay conversaciones.": "There are no chats yet.",
    "Aún no hay conversaciones guardadas en este perfil. Se guardan solas al chatear.": "No chats saved in this profile yet. They are saved automatically as you chat.",
    "Espacios": "Spaces",
    "Tabulación": "Tab Size",
    "Sin archivo abierto": "No file open",
    "Selecciona un archivo": "Select a file",
    "Agent OS local. La interfaz habla con el servidor Python, que firma cada petición con la clave del perfil activo. Sin respuestas simuladas: si el proveedor falla, lo verás aquí.": "Local Agent OS. The UI talks to the Python server, which signs every request with the active profile key. No simulated replies: if the provider fails, you will see it here.",
    "La conexión TLS se cerró durante el handshake. Causa típica: un proxy de salida (sandbox/egress) bloquea este host. Verifica con `curl -I <url>`; si también falla, no es la clave ni la URL.": "The TLS connection closed during the handshake. Typical cause: an egress proxy (sandbox) blocks this host. Check with `curl -I <url>`; if that also fails, it is neither the key nor the URL.",
    "Los repositorios se guardan en .ely/repos (ignorado por git). VS Code ocupa unos 300 MB extraídos; el límite se ajusta con ELY_REPO_MAX_* en el entorno del servidor.": "Repositories are stored in .ely/repos (git-ignored). VS Code takes about 300 MB unpacked; the limit is set with ELY_REPO_MAX_* in the server environment.",
    "HTTP 401/403: el endpoint y la ruta existen y la cabecera llegó; la clave no es aceptada (lo esperado con APikeyexample-n).": "HTTP 401/403: the endpoint and path exist and the header arrived; the key is not accepted (expected with APikeyexample-n).",
    "Los perfiles se cargan de profiles/*.json y las claves de profiles/test-keys.env, .ely/keys.env o variables de entorno.": "Profiles are loaded from profiles/*.json and keys from profiles/test-keys.env, .ely/keys.env or environment variables.",
    "Los tokens son reales (usage del proveedor). El coste se calcula con rates.input_per_mtok / rates.output_per_mtok de cada perfil; si no están definidos el coste es 0.": "Tokens are real (provider usage). Cost is computed with rates.input_per_mtok / rates.output_per_mtok of each profile; if they are not set the cost is 0.",
    "ej. El backend expone /api/chat con streaming SSE; no usar fetch en el navegador para los proveedores.": "e.g. The backend exposes /api/chat with SSE streaming; do not use fetch in the browser for providers.",
    "Define, edita y ejecuta flujos.": "Define, edit and run flows.",
    "Implementar feature": "Implement feature",
    "Documentar módulo": "Document module",
    "Carpeta MCPs/: MCPs. Ely no arranca servidores MCP por su cuenta.": "MCPs/ folder: MCPs. Ely does not start MCP servers on its own.",
    "Selecciona un nodo del mapa.": "Select a node on the map.",
    "Harness/ y MCPs/ pertenecen a otros backends. Esta interfaz los consulta en modo lectura y nunca los modifica.": "Harness/ and MCPs/ belong to other backends. This UI reads them in read-only mode and never modifies them.",
    "(raíz)": "(root)", "Carpetas": "Folders", "sin .git ni node_modules": "without .git or node_modules",
    "Descarga el árbol de un repositorio Git real en .ely/repos y ábrelo en el IDE": "Download the tree of a real Git repository into .ely/repos and open it in the IDE",
    "Todavía no hay repositorios. Importa uno con la barra de arriba.": "No repositories yet. Import one with the bar above.",
    "Sugerencia: empieza por un repo pequeño para probar y luego microsoft/vscode.": "Tip: start with a small repo to test and then microsoft/vscode.",
    "Fuente del IDE de referencia (~1,6 GB de historial; el tarball es solo el árbol).": "Source of the reference IDE (~1.6 GB of history; the tarball is only the tree).",
    "Documentación oficial, útil para probar la búsqueda.": "Official documentation, useful to test search.",
    "El editor que usa VS Code en el navegador.": "The editor VS Code uses in the browser.",
    "Este mismo repositorio, para recorrerlo desde la interfaz.": "This very repository, to browse it from the UI.",
    "La librería está vacía. Crea una skill para empezar.": "The library is empty. Create a skill to get started.",
    "Aún no hay skills. Crea la primera para reutilizar instrucciones.": "No skills yet. Create the first one to reuse instructions.",
    "Buscar…": "Search…",
    "Leer archivo": "Read file",
    "Lee un archivo del workspace del proyecto.": "Reads a file from the project workspace.",
    "Escribir archivo": "Write file",
    "Crea o sobrescribe un archivo. Requiere confirmación.": "Creates or overwrites a file. Requires confirmation.",
    "Ejecutar comando": "Run command",
    "Lanza un comando en la terminal y captura stdout/stderr.": "Runs a command in the terminal and captures stdout/stderr.",
    "Estado de git": "Git status",
    "Rama actual, cambios sin confirmar y último commit.": "Current branch, uncommitted changes and last commit.",
    "Petición HTTP": "HTTP request",
    "GET/POST a una URL externa con timeout y errores reales.": "GET/POST to an external URL with timeout and real errors.",
    "Guarda y recupera notas persistentes del proyecto.": "Stores and retrieves persistent project notes.",
    "Llamar modelo": "Call model",
    "Ejecuta el perfil activo con mensajes arbitrarios.": "Runs the active profile with arbitrary messages.",
    "«Probar» lanza una petición HTTP de verdad (max_tokens=1) y devuelve el código del proveedor.": "'Test' sends a real HTTP request (max_tokens=1) and returns the provider's code.",
    "Usar": "Use",
    "usar": "use",
    "fallo": "failed",
    "activo": "active",
    "estado": "status",
    "agentes": "agents",
    "nombre": "name",
    "carpeta": "folder",
    "registradas": "recorded",
    "perfiles": "profiles",
    "Coste": "Cost",
    "Rotar token": "Rotate token",
    "en .ely/usage.jsonl": "in .ely/usage.jsonl",
    "Latencia media": "Mean latency",
    "por llamada HTTP": "per HTTP call",
    "Hora": "Time",
    "Latencia": "Latency",
    "Detalle": "Detail",
    "La memoria está vacía. Las notas se inyectan como contexto del proyecto.": "Memory is empty. Notes are injected as project context.",
    "El prompt se envía tal cual al modelo (no se traduce).": "The prompt is sent to the model as-is (not translated).",
  };

  /* El diccionario D ya contiene los pares es→en de toda la interfaz: se
   * reutilizan para traducir cualquier nodo del DOM, no solo los que usan t().
   * Así, cambiar de idioma afecta también a lo ya renderizado. */
  Object.keys(D).forEach((key) => {
    const pair = D[key];
    if (!pair || !pair[0] || !pair[1] || pair[0] === pair[1]) return;
    if (!Object.prototype.hasOwnProperty.call(PHRASES, pair[0])) PHRASES[pair[0]] = pair[1];
  });
  Object.keys(EXTRA).forEach((es) => { PHRASES[es] = EXTRA[es]; });

  /** Mapa es→idioma activo para el traductor de DOM (con caché por idioma). */
  function phrasesFor(lang) {
    if (lang === "es") return null;
    if (lang === "en") return PHRASES;
    if (PHRASE_CACHE[lang]) return PHRASE_CACHE[lang];
    const pack = LOCALES[lang] || {};
    const extra = pack.extra || {};
    const own = pack.phrases || {};
    const map = {};
    /* Primera traducción que llega gana; nunca se mapea un texto a sí mismo. */
    const put = (es, target) => {
      if (!es || !target || target === es) return;
      if (!Object.prototype.hasOwnProperty.call(map, es)) map[es] = target;
    };
    /* 1. Frases que el paquete traduce explícitamente. */
    Object.keys(own).forEach((es) => put(es, own[es]));
    Object.keys(extra).forEach((es) => put(es, extra[es]));
    /* 2. Diccionario base: traducción del idioma o, si no la hay, inglés. */
    Object.keys(D).forEach((key) => {
      const pair = D[key];
      if (!pair || !pair[0]) return;
      put(pair[0], pack[key] || pair[1]);
    });
    /* 3. Textos estáticos del DOM. PHRASES es el diccionario grande es→en y
     *    también sirve de respaldo para el resto de idiomas: sin él, las
     *    frases que sólo viven ahí se quedaban en español. */
    Object.keys(EXTRA).forEach((es) => put(es, extra[es] || EXTRA[es]));
    Object.keys(PHRASES).forEach((es) => put(es, extra[es] || own[es] || PHRASES[es]));
    PHRASE_CACHE[lang] = map;
    return map;
  }

  function patternTemplate(pair) {
    const lang = I18N.lang();
    if (lang === "en" || !pair[2]) return pair[1];
    const pack = LOCALES[lang];
    return (pack && pack[pair[2]]) || pair[1];
  }

  /* Textos dinámicos con números: "hace 5 min", "11 configurados"…
   * Cada patrón tiene una clave `pat.*` para que los paquetes de idioma
   * puedan traducir la plantilla; si no la traen, se usa la inglesa. */
  const PATTERNS = [
    [/^hace (\d+) s$/, "$1 s ago", "pat.agoS"],
    [/^hace (\d+) min$/, "$1 min ago", "pat.agoMin"],
    [/^hace (\d+) h$/, "$1 h ago", "pat.agoH"],
    [/^hace un momento$/, "just now", "pat.justNow"],
    [/^(\d+) configurados$/, "$1 configured", "pat.configured"],
    [/^latencia media (.+)$/, "mean latency $1", "pat.meanLatency"],
    [/^([\d.,]+)% con éxito$/, "$1% success", "pat.success"],
    [/^(\d+) llamadas$/, "$1 calls", "pat.calls"],
    [/^(\d+) archivos$/, "$1 files", "pat.files"],
    [/^(\d+) pasos$/, "$1 steps", "pat.steps"],
    [/^(\d+) guardadas$/, "$1 saved", "pat.saved"],
    [/^(\d+) conversaciones$/, "$1 chats", "pat.chats"],
    [/^(\d+) perfiles$/, "$1 profiles", "pat.profiles"],
    [/^probando (\d+) perfiles…$/, "testing $1 profiles…", "pat.testing"],
    [/^(\d+) endpoint\(s\) respondieron · (.+)$/, "$1 endpoint(s) replied · $2", "pat.endpoints"],
    [/^Línea (\d+), columna (\d+)$/, "Line $1, column $2", "pat.lineCol"],
    [/^Espacios: (\d+)$/, "Spaces: $1", "pat.spaces"],
    [/^(\d+) caracteres$/, "$1 characters", "pat.chars"],
    [/^(\d+) palabras$/, "$1 words", "pat.words"],
    [/^(\d+) coincidencias$/, "$1 matches", "pat.matches"],
    [/^(\d+) resultados$/, "$1 results", "pat.results"],
    [/^(\d+) seleccionados$/, "$1 selected", "pat.selected"],
    [/^Actualizado (.+)$/, "Updated $1", "pat.updated"],
    [/^Creado (.+)$/, "Created $1", "pat.created"],
    [/^(\d+) agentes$/, "$1 agents", "pat.agents"],
    [/^(\d+) servidor\(es\) MCP declarados\. Ely no los arranca automáticamente\.$/, "$1 MCP server(s) declared. Ely does not start them automatically.", "pat.mcp"],
    [/^(\S+) \(oculta\)$/, "$1 (hidden)", "pat.hidden"],
    [/^(\d+) skills$/, "$1 skills", "pat.skills"],
    [/^(\d+) repositorios$/, "$1 repositories", "pat.repos"],
    [/^(\d+) notas$/, "$1 notes", "pat.notes"],
    [/^(\d+) herramientas$/, "$1 tools", "pat.tools"],
    [/^(\d+) flujos$/, "$1 flows", "pat.flows"],
    [/^(\d+) equipos$/, "$1 teams", "pat.teams"],
    [/^(\d+) trabajos$/, "$1 jobs", "pat.jobs"],
    [/^(\d+) dispositivos$/, "$1 devices", "pat.devices"],
    [/^La conexión TLS se cerró durante el handshake\. Causa típica: un proxy de salida \(sandbox\/egress\) bloquea este host\.(.*)$/, "The TLS connection closed during the handshake. Typical cause: an egress proxy (sandbox) blocks this host.$1", "pat.tls"],
    [/^No hubo respuesta HTTP: DNS, TLS o un proxy de salida bloquea el host\.(.*)$/, "No HTTP reply: DNS, TLS or an egress proxy blocks the host.$1", "pat.noHttp"],
  ];

  /** Traduce un texto suelto (frase exacta o patrón con números). */
  function tr(text) {
    const map = phrasesFor(I18N.lang());
    if (!map || text == null) return text;
    const value = String(text);
    const trimmed = value.trim();
    const hit = map[trimmed];
    if (hit) return value.replace(trimmed, hit);
    for (const pair of PATTERNS) {
      if (pair[0].test(trimmed)) return value.replace(trimmed, trimmed.replace(pair[0], patternTemplate(pair)));
    }
    return text;
  }

  const ORIG = new WeakMap();
  let applying = false;
  const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "TEXTAREA", "CODE", "PRE", "INPUT", "NOSCRIPT"]);
  const SKIP_SEL = ".bubble, .code-ta, .code-hl, .chat-log, .msg .body, .log, [data-noi18n]";

  function translateText(value) {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const lead = value.match(/^\s*/)[0];
    const tail = value.match(/\s*$/)[0];
    const map = phrasesFor(I18N.lang());
    if (!map) return null;
    const hit = map[trimmed];
    if (hit) return lead + hit + tail;
    for (const pair of PATTERNS) {
      if (pair[0].test(trimmed)) return lead + trimmed.replace(pair[0], patternTemplate(pair)) + tail;
    }
    return null;
  }

  function apply(root) {
    if (applying) return;
    applying = true;
    try {
      const target = root || document.body;
      const en = I18N.lang() !== "es";   /* cualquier idioma distinto del origen */
      const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          const p = node.parentElement;
          if (!p || SKIP_TAGS.has(p.tagName) || p.closest(SKIP_SEL)) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      });
      let node;
      while ((node = walker.nextNode())) {
        if (en) {
          const translated = translateText(node.nodeValue);
          if (translated != null && translated !== node.nodeValue) {
            if (!ORIG.has(node)) ORIG.set(node, node.nodeValue);
            node.nodeValue = translated;
          }
        } else if (ORIG.has(node)) {
          node.nodeValue = ORIG.get(node);
          ORIG.delete(node);
        }
      }
      target.querySelectorAll("[placeholder],[title],[aria-label],[alt],[aria-placeholder]").forEach((elm) => {
        if (elm.closest(SKIP_SEL)) return;
        ["placeholder", "title", "aria-label", "alt", "aria-placeholder"].forEach((attr) => {
          const val = elm.getAttribute(attr);
          if (!val) return;
          const key = "data-i18n-" + attr;
          if (en) {
            const hit = tr(val.trim());
            if (hit && hit !== val.trim()) { if (!elm.hasAttribute(key)) elm.setAttribute(key, val); elm.setAttribute(attr, hit); }
          } else if (elm.hasAttribute(key)) {
            elm.setAttribute(attr, elm.getAttribute(key));
            elm.removeAttribute(key);
          }
        });
      });
    } finally { applying = false; }
  }

  I18N.apply = apply;
  I18N.phrases = PHRASES;
  I18N.phrasesFor = phrasesFor;
  I18N.tr = tr;
  I18N.extra = EXTRA;
  I18N.patterns = PATTERNS;
  document.documentElement.lang = I18N.meta().htmlLang;

  /* Re-aplica tras renders dinámicos y al cambiar de idioma. */
  let pending = null;
  function schedule() {
    if (pending) return;
    pending = setTimeout(() => { pending = null; apply(document.body); }, 60);
  }
  if (typeof MutationObserver !== "undefined") {
    const obs = new MutationObserver((muts) => {
      if (applying) return;
      if (muts.some((m) => m.addedNodes.length || m.type === "characterData")) schedule();
    });
    if (document.body) obs.observe(document.body, { childList: true, subtree: true, characterData: true });
    else document.addEventListener("DOMContentLoaded", () => obs.observe(document.body, { childList: true, subtree: true, characterData: true }));
  }
  /* Un único punto que mantiene <html lang> sincronizado, venga el cambio de
   * Ajustes, de setLang() o de la carga de un paquete. Lo usan las reglas CSS
   * por escritura (devanagari, CJK) y los lectores de pantalla. */
  window.addEventListener("ely:langchange", () => {
    document.documentElement.lang = I18N.meta().htmlLang;
    apply(document.body);
  });

  window.I18N = I18N;
  window.t = (key) => I18N.t(key);
})();
