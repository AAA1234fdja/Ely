# Ely Cowork · Agent OS

Interfaz y CLI para trabajar con agentes de IA mediante **URL + API Key** reales.
Sin respuestas simuladas: cada mensaje que envías se convierte en una petición HTTP
al proveedor elegido, y lo que ves en pantalla es lo que devolvió el proveedor
(incluidos los errores).

```
CLI/        código de la CLI y del servidor (Python, sin dependencias)
  ely_cli/  motor: perfiles, cliente HTTP, agentes, workflows, servidor del IDE
  bin/      lanzador Node.js (estático + proxy + pruebas de clave)
  tools/    proveedor local de verificación (mock_provider.py)
  tests/    15 pruebas del núcleo (unittest)
  rust/     cliente Rust de la API local (std only, sin crates)
IDE/        frontend (HTML/CSS/JS sin build, sin frameworks)
            index.html = el HTML base entregado, sin una sola etiqueta cambiada
Harness/    backend de rutinas existente — solo lectura, no se modifica
MCPs/       backend de herramientas existente — solo lectura, no se modifica
profiles/   11 perfiles (URL + modelo + nombre de la variable de la clave)
```

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
Los campos `{VARIABLE}` se sustituyen desde el entorno al cargar.

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
./CLI/ely chat                      # REPL (/agente, /perfil, /limpiar, /salir)
./CLI/ely run feature "login con OAuth"
./CLI/ely workflows                 # rutinas disponibles
./CLI/ely stats --json              # telemetría real
./CLI/ely logs -n 40                # últimas llamadas
./CLI/ely mcp                       # estado del backend MCPs (solo lectura)
./CLI/ely memory --add "nota"       # memoria inyectable en el chat
./CLI/ely doctor                    # diagnóstico del entorno
```

Variables: `ELY_PROFILE` (perfil por defecto), `ELY_DEBUG=1` (traza de errores),
`ELY_HTTP_LOG=1` (log de peticiones), `PORT` (puerto del IDE).

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
| `js/views/ide.js` | editor del workspace + asistente con contexto del archivo |
| `js/views/*.js` | dashboard, workflows, agents, canvas, teams, assets, skills, tools, integrations, jobs, pairing, config, costs, memory |
| `js/chat.js` | chat con streaming SSE y sesiones |
| `js/app.js` | router, cabecera y arranque |

El HTML solo trae `<div id="modal">`; el contenedor de toasts (`#toasts`) lo crea
`ui.js` en tiempo de ejecución, sin tocar el documento original.


16 vistas sobre ese HTML, sin build ni dependencias de CDN:

- **Chat** — streaming SSE real, selección de agente/perfil, sesiones guardadas.
- **Panel** — estado del sistema, tokens, coste y actividad reciente.
- **IDE** — editor del workspace (árbol real, guardar, atajos) con asistente que
  recibe el archivo abierto como contexto.
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

## API

Todo bajo `/api` (JSON; SSE en `/api/chat/stream`):

```
GET  /health                  GET  /profiles          POST /profiles/test
POST /profiles/test-all       POST /profiles/default  POST /profiles/key
GET  /agents                  GET  /workflows         POST /workflows/run
POST /chat                    POST /chat/stream       GET  /sessions
POST /sessions                DELETE /sessions/:id    GET  /memory
POST /memory                  DELETE /memory/:id      GET  /skills  POST /skills
POST /skills/run              GET  /tools              GET  /mcp
GET  /stats                   GET  /calls              GET  /jobs
GET  /pairing                 POST /pairing/rotate     GET  /costs
GET  /workspace/tree          GET  /workspace/file     POST /workspace/file
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

## Harness y MCPs

No se han modificado. Ely los consulta en **modo lectura**:

- `MCPs/` — busca manifiestos (`mcpServers`, `servers`) y reporta lo que encuentra.
  Si está vacío, la interfaz dice `not-configured`; no inventa servidores.
- `Harness/` — backends de rutinas; la CLI y el IDE no escriben en esa carpeta.

---

Photon Labs · Ely Cowork v0.9.0 · MIT
