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

    // --- común
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

  window.I18N = I18N;
  window.t = (key) => I18N.t(key);
})();
