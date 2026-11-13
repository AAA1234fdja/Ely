# Ely Cowork · Agent OS

Interfaz y CLI para trabajar con agentes de IA mediante **URL + API Key** reales.
El chat usa el proveedor elegido y puede invocar herramientas locales, corridas de
Harness-Candy, decisiones tipadas locales con Laya y servidores MCP configurados;
los resultados de cada herramienta vuelven al modelo antes de la respuesta final.

```
CLI/        código de la CLI y del servidor (Python, sin dependencias)
  ely_cli/  motor: perfiles, cliente HTTP, agentes, workflows, servidor del IDE
  bin/      lanzador Node.js (estático + proxy + pruebas de clave)
  tools/    proveedor local de verificación (mock_provider.py)
  tests/    15 pruebas del núcleo (unittest)
  rust/     cliente Rust de la API local (std only, sin crates)
IDE/        frontend (HTML/CSS/JS sin build, sin frameworks)
            index.html = el HTML base entregado, sin una sola etiqueta cambiada
Harness-Candy/  backend de orquestación opcional, invocable desde chat o API
MCPs/           manifiestos de servidores MCP; JSON-RPC stdio/Streamable HTTP
IDE/src/ y IDE/extensions/  componentes upstream/vendorados del fork de VS Code
laya-main/      motor de decisiones opcional para alternativas tipadas de los agentes
profiles/       11 perfiles (URL + modelo + nombre de la variable de la clave)
```

## Alcance real y trabajo pendiente

Ely Cowork hoy es la aplicación de `CLI/ely_cli` + `IDE/frontend`: conversa con
proveedores por HTTP, guarda sesiones, ejecuta workflows secuenciales y conecta
opcionalmente Harness-Candy, Laya y servidores MCP declarados. Las conexiones
son explícitas y opcionales; no hacen obligatorias todas las dependencias del
checkout ni convierten en capacidades de Ely el código upstream/vendorado de
`IDE/src/` y `IDE/extensions/`.

| Prioridad | Pendiente para competir en tareas de ingeniería | Estado verificable hoy |
|---|---|---|
| 1 | Bucle agéntico de herramientas: ejecutar, observar resultados y corregir sin abortar tareas largas. | Photon/Codey tienen tools locales y MCP configurado; Laya orienta al agente principal. Los presupuestos escalan por workspace/tests (5–12 rondas, 8–32 llamadas) y existe techo total por tarea (12 000 tokens por defecto); al agotarse se devuelve parcial. Photon puede delegar tareas acotadas a hijos tipados sin heredar el chat ni volver a delegar. Falta paralelismo seguro y memoria compartida por proyecto. |
| 2 | Edición y ejecución con límites de seguridad explícitos. | Las herramientas de chat ejecutan en snapshot aislado; el sandbox Linux crea namespaces de usuario/PID/red, instala Landlock y un filtro seccomp-BPF (bloquea, entre otras, `ptrace`, `mount`, `setns` y `unshare`) antes del comando, además de aislar la red. `/proc`, `/sys` y `/dev` quedan bloqueados; Landlock permite ejecutar solo el intérprete de la tarea y binarios de una allowlist del sistema, no ejecutables generados en el workspace. No ven `.ely`, secretos ni archivos privados, y devuelven diff sin aplicarlo. Si no hay aislamiento compatible, falla cerrado. Hay un perfil AppArmor opt-in en `CLI/security/` (requiere instalación administrativa); SELinux aún no está integrado. Las salidas de herramientas se etiquetan como no confiables y se escanean con heurísticas de inyección antes de volver al modelo (solo alerta, no bloquea ni garantiza detección). En la terminal hay modos Solo lectura, Workspace aislado y Acceso total; este último exige confirmación por comando. | |
| 3 | Cliente MCP funcional JSON-RPC (stdio/transportes soportados), con ciclo de vida y llamadas reales. | `mcp_client.py` inicia servidores stdio declarados y soporta Streamable HTTP; lista y ejecuta tools en el bucle de chat. El transporte SSE antiguo no está soportado; solo se conectan servidores explícitamente declarados y habilitados. |
| 4 | Integrar DAG, WEV y Harness² como ejecutor configurable del chat. | `harness.run`/`POST /api/cowork/run` invocan `CoworkRunner` con el perfil activo. Harness² prueba candidatos con WEV bajo un presupuesto global pequeño; puede ajustar `max_tokens` gradualmente y proponer cambios de prompt/skills/guardrails. Photon puede editar el objetivo de tokens entre 128 y 4096, con techo global; los permisos de seguridad no son adaptables. El chat normal sigue disponible. |
| 5 | Ejecutar y publicar resultados reproducibles de benchmarks externos con versiones, modelo, configuración y coste. | No se publican resultados de SWE-bench Verified ni Terminal-Bench para Ely. |

Los fixtures locales `Harness-Candy/benchmarks/mini_mmlu.json` (10 casos) y
`swe_mini.json` (4 tareas de código) son suites pequeñas para pruebas/demos.
Las cuatro tareas solo son **inspiradas en el estilo SWE-bench**: no son el
dataset SWE-bench Verified, no siguen su protocolo de evaluación y no permiten
inferir ni anunciar un score de SWE-bench. Tampoco son resultados de
Terminal-Bench ni una evaluación con un modelo frontier. No se deben sumar los
14 casos y presentarlos como un benchmark externo.

## Arranque rápido

```bash
# 1. IDE (frontend + API) en http://localhost:8765
./CLI/ely serve

# alternativa en Node (sirve el IDE y hace proxy al backend Python)
node CLI/bin/ely.js serve --port 8765

# 2. comprobar las 11 claves contra sus endpoints
./CLI/ely test
```

No hay instalación: solo Python 3.9+ (para la CLI) y Node 18+ (opcional).
Para instalar el comando `ely` globalmente: `pip install -e CLI`.

## Claves: fixtures y claves reales

El repositorio incluye **11 claves de prueba**, `APikeyexample-1` … `APikeyexample-11`,
una por perfil, en `profiles/test-keys.env`. No son credenciales válidas: sirven
para verificar que el sistema lee la clave, la envía en la cabecera correcta y
procesa la respuesta. Con ellas lo esperado es:

| Resultado | Significado |
|---|---|
| `✓ en línea` (HTTP 200) | URL, ruta, clave y modelo válidos (requiere clave real) |
| `✓ auth rechazada` (401/403) | el endpoint respondió: URL y cabecera correctas, clave no aceptada |
| `✗ sin respuesta` | no hubo HTTP: DNS, TLS o un proxy de salida bloquea el host |

Para claves reales, **fuera de git**:

```bash
# opción A — archivo local (ignorado por .gitignore)
printf 'OPENAI_API_KEY=sk-...\nGROQ_API_KEY=gsk_...\n' >> .ely/keys.env

# opción B — variables de entorno
export OPENAI_API_KEY=sk-...
```

Prioridad: `entorno` > `.ely/keys.env` > `profiles/test-keys.env`.
También puedes escribir la clave desde el IDE en **Integraciones → Guardar clave**,
que la guarda en `.ely/keys.env` con permisos `600`.

## Los 11 perfiles

| # | id | endpoint | variable |
|---|---|---|---|
| 1 | `openai` | `https://api.openai.com/v1` | `OPENAI_API_KEY` |
| 2 | `anthropic` | `https://api.anthropic.com/v1` | `ANTHROPIC_API_KEY` |
| 3 | `google` | `https://generativelanguage.googleapis.com/v1beta/openai` | `GOOGLE_API_KEY` |
| 4 | `groq` | `https://api.groq.com/openai/v1` | `GROQ_API_KEY` |
| 5 | `mistral` | `https://api.mistral.ai/v1` | `MISTRAL_API_KEY` |
| 6 | `together` | `https://api.together.xyz/v1` | `TOGETHER_API_KEY` |
| 7 | `openrouter` | `https://openrouter.ai/api/v1` | `OPENROUTER_API_KEY` |
| 8 | `deepseek` | `https://api.deepseek.com/v1` | `DEEPSEEK_API_KEY` |
| 9 | `deepinfra` | `https://api.deepinfra.com/v1/openai` | `DEEPINFRA_API_KEY` |
| 10 | `fireworks` | `https://api.fireworks.ai/inference/v1` | `FIREWORKS_API_KEY` |
| 11 | `local` | `{ELY_LOCAL_BASE_URL}` (Ollama, LM Studio, vLLM) | `ELY_LOCAL_API_KEY` |

Cada perfil es un JSON en `profiles/`. `base_url` puede ser la raíz del API o la
URL completa; el cliente añade `/chat/completions` (o `/messages` en Anthropic).
Los campos `{VARIABLE}` se sustituyen desde el entorno al cargar. Cada perfil limita
por defecto 60 peticiones por minuto dentro del proceso; se puede configurar
`"requests_per_minute": 12` en su JSON, o usar `0` para desactivar el límite local.
Cada perfil tiene su propio contador; el proveedor sigue siendo la autoridad sobre
sus cuotas reales.

## CLI

```bash
./CLI/ely serve                     # IDE en http://localhost:8765
./CLI/ely serve-node                # IDE con el lanzador Node (proxy incluido)
./CLI/ely routes                    # vistas que publica el backend
./CLI/ely test                      # prueba real de las 11 claves
./CLI/ely test -p groq -v           # un perfil, con detalle
./CLI/ely test -m models            # GET /models (metadatos)
./CLI/ely profiles                  # tabla de perfiles y claves enmascaradas
./CLI/ely ask "optimiza esto" -a dev# streaming en terminal
./CLI/ely chat                      # REPL (/agente, /perfil, /calidad, /salir)
./CLI/ely quality                   # nivel sugerido, criterios y tasa de primer intento
./CLI/ely quality Hight             # cambia el piso de calidad del workspace
./CLI/ely quality --test-command "python3 -m unittest discover -s tests -q"
./CLI/ely run feature "login con OAuth"
./CLI/ely workflows                 # rutinas disponibles
./CLI/ely stats --json              # telemetría real
./CLI/ely logs -n 40                # últimas llamadas
./CLI/ely mcp                       # estado del backend MCPs (solo lectura)
./CLI/ely memory --add "nota"       # memoria inyectable en el chat
./CLI/ely doctor                    # diagnóstico del entorno
```

### Piso de calidad del chat

El selector del chat flotante y `ely chat` → `/calidad [nivel]` controlan el
estándar verificable, no una instrucción para maximizar razonamiento. Los
niveles disponibles son `Xlow`, `Low`, `Mid`, `Hight`, `xHight`, `Uhight` e
`Isabel te extraño`. El servidor bloquea cambios mientras cualquier tarea de
ese workspace sigue activa; la selección queda en `.ely/quality-policy.json`.

El nivel acota iteraciones de reparación y presupuesto total; cuando Photon
edita archivos, Ely ejecuta comprobaciones sintácticas y los tests aplicables en
un snapshot aislado. Si falla, el resultado vuelve al modelo para reparar hasta
el límite del nivel. Si el criterio falla o no hay verificador, Ely devuelve el
mejor parcial como **no certificado** y explica la evidencia; nunca declara
aprobado lo que no pudo medir. La detección inicial sugiere `Mid` si encuentra
tests o `Low` en otro caso. Los criterios se pueden definir con, por ejemplo,
`ely quality --test-command "python3 -m unittest discover -s tests -q"` (se puede
repetir); se ejecutan aislados, sin red externa (solo loopback), y sin acceso a secretos. Las tasas de primer intento se registran
por modelo y nivel en `.ely/quality-history.json`.

El bucle solo certifica criterios ejecutables: no promete equivalencia de
razonamiento abierto ni garantiza calidad más allá de la evidencia mostrada.

Variables: `ELY_PROFILE` (perfil por defecto), `ELY_DEBUG=1` (traza de errores),
`ELY_HTTP_LOG=1` (log de peticiones), `PORT` (puerto del IDE).

## Paleta

Los colores están extraídos **píxel a píxel** de las capturas de referencia y viven
en un único sitio: el bloque `:root` de `IDE/frontend/css/styles.css`. No hay
ningún hex suelto fuera de ahí (ni en el CSS ni en el JS).

| token | valor | uso |
|---|---|---|
| `--bg` | `#07080c` | barra superior, franja de título, fondo global |
| `--bg-soft` | `#090b11` | canvas, nodos, controles de formulario |
| `--panel` | `#0d0f16` | sidebar, tarjetas, panel de detalle |
| `--panel-2` | `#11141d` | tarjeta elevada |
| `--panel-3` | `#151a29` | item de navegación activo |
| `--surface-hover` | `#151a2c` | nodo seleccionado |
| `--surface-press` | `#1c2340` | botón primario |
| `--surface-toggle` | `#1d2748` | interruptor encendido |
| `--border` / `--border-strong` | `#1f2431` / `#2a3040` | bordes |
| `--text` / `--text-dim` / `--muted` | `#d9dde8` / `#7b8397` / `#4d5465` | jerarquía de texto |
| `--accent` / `--accent-strong` | `#8b9cff` / `#5b6cff` | acento |
| `--green` / `--amber` / `--red` / `--blue` | `#34d399` / `#fbbf24` / `#f87171` / `#60a5fa` | estados |
| `--violet-bar` | `#6572b9` | barras de gráfica |

La CLI usa los mismos valores de estado convertidos a ANSI de 24 bits, y los
colores de agentes y perfiles del backend salen de esta misma escala.

## Sin datos de ejemplo

La interfaz arranca **vacía** y solo muestra lo que existe de verdad:

- `skills`, `memory` y `jobs` responden `[]` hasta que crees algo.
- `Cost Tracker` muestra llamadas y tokens reales; con el histórico limpio son 0.
- `Agent Pool` lista los 8 agentes definidos en el backend (son reales, con su
  system prompt), no entidades inventadas.
- Ninguna vista contiene nombres de workflow, importes ni métricas de ejemplo.

Para dejar el entorno a cero en cualquier momento:

```bash
rm -rf .ely/usage.jsonl .ely/sessions.json   # telemetría e historial de chat
```

## IDE (frontend)

`IDE/frontend/index.html` es **el HTML base original, byte a byte** (md5
`272bac542dd9a306b1f5c58f921873ea`). No se le añadió ni se le quitó nada: la app
se construye sobre las etiquetas que ya declara, y cada `<script>` tiene su
módulo real:

| módulo | responsabilidad |
|---|---|
| `js/store.js` | estado global, persistencia en localStorage |
| `js/ui.js` | DOM, formato, markdown, modales, toasts |
| `js/engine.js` | transporte HTTP (`window.API`) + caché de estado (`window.Engine`) |
| `js/llm.js` | capa de modelo: `complete`, `stream`, `probe`, workflows, skills |
| `js/settings.js` | ajustes (densidad, streaming, consumo, animaciones) y modal |
| `js/views/ide.js` | editor del workspace o de un repo importado + asistente con contexto |
| `js/views/*.js` | dashboard, workflows, agents, canvas, teams, assets, skillslib, skills, tools, integrations, jobs, pairing, config, costs, memory, repos |
| `js/chat.js` | chat con streaming SSE y sesiones |
| `js/app.js` | router, cabecera y arranque |

El HTML solo trae `<div id="modal">`; el contenedor de toasts (`#toasts`) lo crea
`ui.js` en tiempo de ejecución, sin tocar el documento original.


18 vistas sobre ese HTML, sin build ni dependencias de CDN:

- **Chat** — streaming SSE real, selección de agente/perfil, sesiones guardadas.
- **Panel** — estado del sistema, tokens, coste y actividad reciente.
- **IDE** — editor del workspace (árbol real, guardar, atajos) o de un repositorio
  importado (solo lectura), con asistente que recibe el archivo abierto como contexto.
- **Repositorios** — importación real de repos de GitHub y búsqueda de texto en ellos.
- **Canvas** — grafo de agentes y workflows (SVG) con inspector.
- **Workflows / Agentes / Equipos / Skills** — orquestación real contra el proveedor.
- **Herramientas** — catálogo y estado verdadero de `MCPs/`.
- **Memoria** — notas que se inyectan como mensaje `system`.
- **Jobs / Activos / Costes** — trazas, inventario y tarifas.
- **Integraciones** — URL, modelo, clave y botón «Probar» por perfil.
- **Pairing** — token de emparejamiento rotable.
- **Configuración** — entorno del servidor y comandos de la CLI.

El navegador **nunca** ve la API Key: llama a `/api/*` en el mismo origen y es el
servidor Python quien firma la petición al proveedor.

## Repositorios (contenido real)

El IDE puede trabajar sobre un repositorio real descargado de GitHub, no sobre
carpetas de ejemplo. La importación baja el **tarball** del commit (`main`, una
etiqueta o un SHA) a `.ely/repos/<slug>/` y lo deja navegable en el editor:

```bash
./CLI/ely repo add microsoft/vscode        # rama por defecto
./CLI/ely repo add microsoft/vscode-docs    # otra referencia
./CLI/ely repo list                         # slug, archivos, tamaño, fecha
./CLI/ely repo tree microsoft__vscode --depth 1
./CLI/ely repo search microsoft__vscode "createModel"
./CLI/ely repo serve microsoft__vscode --port 8790   # IDE sobre el repo
./CLI/ely repo remove microsoft__vscode
```

Origen del contenido, sin atajos: `https://codeload.github.com/<owner>/<repo>/tar.gz/<ref>`
con respaldo en `https://api.github.com/repos/<owner>/<repo>/tarball/<ref>`.
La extracción rechaza rutas absolutas, `..` y enlaces simbólicos, y omite
`node_modules`, `dist`, `out`, `.git` y demás artefactos de build.

Límites (ampliables por entorno):

| variable | por defecto | qué controla |
|---|---|---|
| `ELY_REPO_MAX_DOWNLOAD` | 600 MB | tamaño máximo del tarball |
| `ELY_REPO_MAX_BYTES` | 1.2 GB | total extraído |
| `ELY_REPO_MAX_FILES` | 60000 | número de archivos |
| `GITHUB_TOKEN` | — | usa la API autenticada (más cuota) |

En la UI: la vista **Repositories** (barra de importación, presets, progreso y
tarjetas con archivos/tamaño real) y el selector **Origen** del IDE, que alterna
`Workspace` / `Repo`; los archivos del repo se abren en **solo lectura** y el
asistente recibe su contenido como contexto.

## API

Todo bajo `/api` (JSON; SSE en `/api/chat/stream`):

```
GET  /health                  GET  /profiles          POST /profiles/test
POST /profiles/test-all       POST /profiles/default  POST /profiles/key
GET  /agents                  GET  /workflows         POST /workflows/run
POST /chat                    POST /chat/stream       GET /backends
GET  /key-pool                 POST /key-pool/validate  POST /key-pool/roles
GET/POST /harness/policy       POST /cowork/run
POST /terminal/exec (requires confirmed=true for full mode)  GET /sessions
POST /sessions                DELETE /sessions/:id    GET  /memory
POST /memory                  DELETE /memory/:id      GET  /skills  POST /skills
POST /skills/run              GET  /tools              GET  /mcp
GET  /stats                   GET  /calls              GET  /jobs
GET  /pairing                 POST /pairing/rotate     GET  /costs
GET  /workspace/tree          GET  /workspace/file     POST /workspace/file
GET  /repos                   POST /repos              DELETE /repos/:slug
GET  /repos/tree              GET  /repos/file         GET  /repos/search
GET  /assets                  GET  /config
```

## Verificación sin salida a internet

En redes que bloquean las APIs de los proveedores (CI, sandbox, proxy corporativo)
puedes validar el circuito completo con el proveedor local incluido, que es un
servidor HTTP real que exige `Authorization: Bearer APikeyexample-n`:

```bash
python3 CLI/tools/mock_provider.py --port 8799 &
# .ely/keys.env
#   ELY_LOCAL_BASE_URL=http://127.0.0.1:8799/v1
#   ELY_LOCAL_MODEL=ely-echo
./CLI/ely test -p local            # → ✓ en línea (HTTP 200)
./CLI/ely ask "hola" -p local      # respuesta real del servidor
node CLI/bin/ely.js probe local    # el mismo chequeo desde Node
```

El proveedor local exige `Authorization: Bearer APikeyexample-n` y responde 401
para cualquier otra clave, así que sirve también para probar el camino de error.

## Pruebas

```bash
python3 -m unittest discover -s CLI/tests -v    # 15 pruebas (HTTP real local)
node --check IDE/frontend/js/app.js             # sintaxis del frontend
cd CLI/rust && cargo run -- health              # cliente Rust (si hay cargo)
```

## Rust

`CLI/rust` contiene `ely-rs`, un cliente de la API local escrito solo con la
biblioteca estándar (sin crates): habla HTTP/1.1 directamente con `ely serve`.

```bash
cd CLI/rust
cargo run -- health
cargo run -- ask "resume el repositorio" dev local
cargo run -- get /api/stats
```

## Pool de perfiles LLM

El perfil seleccionado sigue siendo primario. Si falla por autenticación, permiso,
rate limit o error transitorio, Ely puede fallar a perfiles con clave real ya
configurados; valida el modelo del candidato mediante `/models` antes de enrutarlo.
La caché de validación es de proceso (15 min), con cooldown y orden por conexiones
activas. Config opcional ignorada por Git: `.ely/key-pool.json`, por ejemplo
`{"roles":{"coder":["deepseek","openrouter"],"reviewer":["groq"]}}`.
`GET /api/key-pool` muestra metadatos sin secretos, `POST /api/key-pool/roles`
guarda la lista de perfiles elegibles por rol y `POST /api/key-pool/validate`
valida un perfil explícitamente. El límite local de RPM es por perfil y no mide
la cuota real ni el coste de cada clave; los perfiles con claves de fixture se excluyen.

## Harness y MCPs: integración actual

- `MCPs/` — `mcp.py` descubre manifiestos y `mcp_client.py` implementa JSON-RPC
  stdio y Streamable HTTP para servidores explícitamente habilitados. La ruta
  `GET /api/tools` y los turnos de chat cargan el catálogo e inician servidores
  habilitados cuando hace falta. Los servidores que referencian variables ausentes
  se omiten y aparecen en `/api/backends` como bloqueados (sin revelar valores).
  No soporta el transporte SSE legado. Las firmas Ed25519 de manifiestos JSON
  son opt-in en `.ely/mcp-policy.json`; consulta `CLI/security/MCP-SIGNATURES.md`
  para instalar claves confiables y firmar manifiestos.
- `Harness-Candy/` — `CoworkRunner` se puede invocar desde el chat con `harness.run`
  o desde `POST /api/cowork/run`. Usa el perfil LLM actual, persiste trazas y
  reporta WEV/ELY. Harness² prueba cambios bajo un presupuesto pequeño y WEV;
  Photon puede ajustar `desired_tokens` (128–4096, limitado por techo global).
  No es el ejecutor por defecto de cada mensaje ni puede modificar permisos del SO.
- `laya-main/` — el chat conecta `laya.decide` para que Photon compare alternativas
  antes de propuestas y decisiones materiales en ejecución; Codey puede invocarlo
  excepcionalmente. La primera llamada puede requerir dependencias de inferencia y
  descargar pesos. Laya recomienda opciones, pero no autoriza acciones.
- `IDE/src/` y `IDE/extensions/` — código upstream/vendorado del fork de VS Code;
  su presencia no implica que Ely haya implementado ni verificado todas esas
  funciones. La app Ely descrita aquí vive principalmente en `IDE/frontend/`.

No se han publicado resultados de Ely en SWE-bench Verified o Terminal-Bench.
Las suites locales `mini_mmlu.json` (10 preguntas) y `swe_mini.json` (4 tareas)
son fixtures pequeños de desarrollo; «estilo SWE-bench» no significa el dataset
ni el protocolo oficial. No se deben presentar sus 14 casos agregados como un
score de SWE-bench, MMLU o Terminal-Bench.

---

Photon Labs · Ely Cowork v0.9.0 · MIT
