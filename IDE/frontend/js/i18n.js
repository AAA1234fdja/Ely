/* Ely Cowork · internacionalización (español / inglés) y zona horaria.
 *
 * El idioma y la nacionalidad se guardan en Settings. La nacionalidad determina
 * la zona horaria con la que se muestran las horas (p. ej. la hora de fin de una
 * respuesta del chat). El formato pedido es mes/día/año hora:minuto.
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
    "header.menu": ["Menú", "Menu"],
    "header.activeFlow": ["Workflow activo en esta sesión", "Active workflow in this session"],
    "header.trust": ["Trust verified", "Trust verified"],
    "header.serverDown": ["Servidor inactivo", "Server inactive"],
    "header.profile": ["perfil", "profile"],
    "header.noProfiles": ["sin perfiles", "no profiles"],
    "header.noProfile": ["sin perfil", "no profile"],
    "header.noKey": ["sin clave", "no key"],
    "header.testKey": ["clave de prueba", "test key"],
    "header.ownKey": ["clave propia", "own key"],
    "header.testConn": ["Probar conexión con el proveedor", "Test provider connection"],
    "header.settings": ["Ajustes", "Settings"],
    "header.calls": ["Historial de llamadas", "Call history"],
    "header.operator": ["Operador", "Operator"],
    "header.localSession": ["Sesión local", "Local session"],
    "conn.verified": ["Conexión verificada", "Connection verified"],
    "conn.reachable": ["Endpoint alcanzable · clave rechazada", "Endpoint reachable · key rejected"],
    "conn.noResponse": ["Sin respuesta del endpoint", "No response from endpoint"],
    "conn.failed": ["Prueba fallida", "Test failed"],

    // --- chat (vista tipo Codex)
    "chat.new": ["Nueva conversación", "New chat"],
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
    "chat.sug1": ["Resume el estado del proyecto", "Summarize the project status"],
    "chat.sug2": ["Abre un archivo de Local Storage", "Open a Local Storage file"],
    "chat.sug3": ["Explica el código seleccionado", "Explain the selected code"],
    "chat.openStorage": ["Local Storage", "Local Storage"],
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
    "set.languageHint": ["español o inglés en toda la interfaz", "Spanish or English across the interface"],
    "set.nationality": ["Nacionalidad", "Nationality"],
    "set.nationalityHint": ["zona horaria para las horas (fin de respuesta)", "time zone for timestamps (response completion)"],
    "set.timePreview": ["Hora local ahora", "Local time now"],
    "set.density": ["Densidad de la interfaz", "Interface density"],
    "set.densityHint": ["espaciado de tarjetas y tablas", "card and table spacing"],
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

    // --- común
    "common.refresh": ["Recargar", "Refresh"],
    "common.save": ["Guardar", "Save"],
    "common.cancel": ["Cancelar", "Cancel"],
    "common.close": ["Cerrar", "Close"],
    "common.delete": ["Eliminar", "Delete"],
    "common.retry": ["Reintentar", "Retry"],
    "common.loading": ["Cargando…", "Loading…"],
    "common.opFail": ["No se pudo completar la operación", "Could not complete the operation"]
  };

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

    lang() {
      const l = settings().language;
      return l === "en" ? "en" : "es";
    },

    idx() { return this.lang() === "en" ? 1 : 0; },

    t(key) {
      const entry = D[key];
      if (!entry) return key;
      return entry[this.idx()] || entry[0];
    },

    setLang(lang) {
      if (window.Settings) Settings.set({ language: lang === "en" ? "en" : "es" });
    },

    country() {
      const id = settings().nationality || "CO";
      return COUNTRIES.find((c) => c.id === id) || COUNTRIES[0];
    },

    tz() { return this.country().tz; },

    countryLabel() {
      const c = this.country();
      return this.lang() === "en" ? c.en : c.es;
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
    "Editor de código con IA": "AI code editor", "Ejecutar ·": "Run ·",
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

  const ORIG = new WeakMap();
  let applying = false;
  const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "TEXTAREA", "CODE", "PRE", "INPUT", "SELECT", "OPTION", "NOSCRIPT"]);
  const SKIP_SEL = ".bubble, .code-ta, .code-hl, .chat-log, .msg .body, .log, [data-noi18n]";

  function translateText(value) {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const hit = PHRASES[trimmed];
    if (!hit) return null;
    const lead = value.match(/^\s*/)[0];
    const tail = value.match(/\s*$/)[0];
    return lead + hit + tail;
  }

  function apply(root) {
    if (applying) return;
    applying = true;
    try {
      const target = root || document.body;
      const en = I18N.lang() === "en";
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
      target.querySelectorAll("[placeholder],[title]").forEach((elm) => {
        if (elm.closest(SKIP_SEL)) return;
        ["placeholder", "title"].forEach((attr) => {
          const val = elm.getAttribute(attr);
          if (!val) return;
          const key = "data-i18n-" + attr;
          if (en) {
            const hit = PHRASES[val.trim()];
            if (hit) { if (!elm.hasAttribute(key)) elm.setAttribute(key, val); elm.setAttribute(attr, hit); }
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
  window.addEventListener("ely:langchange", () => apply(document.body));

  window.I18N = I18N;
  window.t = (key) => I18N.t(key);
})();
