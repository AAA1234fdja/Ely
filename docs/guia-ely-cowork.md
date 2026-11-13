# Ely Cowork
## Guía de producto y funcionamiento

**Ely Cowork** es una aplicación de escritorio web y una CLI para conversar con modelos de lenguaje desde un mismo espacio de trabajo. Permite elegir un perfil de proveedor, trabajar con agentes especializados, usar herramientas acotadas sobre un proyecto y revisar la calidad de los cambios.

No es necesario instalar los componentes opcionales para usar el chat básico. Ely se comunica con el proveedor configurado mediante su URL y API key; si el perfil apunta a un servidor local compatible, las solicitudes pueden quedarse en la máquina o red del usuario.

**En una frase:** Ely Cowork conecta chat, agentes, herramientas y controles de calidad en una interfaz para proyectos.

### Qué hace

- Ofrece una interfaz web local y comandos de terminal.
- Permite seleccionar un perfil de modelo y un agente.
- Envía solicitudes reales al proveedor configurado; no simula respuestas.
- Puede leer y editar archivos permitidos, ejecutar comandos aislados y consultar herramientas MCP habilitadas.
- Mantiene presupuestos por tarea y registra telemetría de las llamadas.

### Qué ocurre con el contexto

Ely preserva las instrucciones principales y la petición actual. Si el historial excede el presupuesto, elimina primero turnos antiguos completos; si una respuesta de herramienta es demasiado grande, reduce su contenido sin quitar las etiquetas que indican que es no confiable. La estimación del tamaño es aproximada.

<!-- PAGEBREAK -->
# Cómo funciona una solicitud

## Recorrido de una tarea

1. **La persona escribe una petición** en el chat o en la CLI y selecciona agente, perfil y nivel de calidad.
2. **Ely prepara el contexto:** instrucciones del agente, información proporcionada para el proyecto y los turnos recientes que caben en el límite de contexto.
3. **Harness² decide los parámetros de ejecución** para el nivel de calidad: esfuerzo, temperatura, tokens, presupuesto y ajuste de instrucciones. El orden configurado de calidad se conserva, de menor a mayor.
4. **El cliente HTTP llama al proveedor** usando el perfil activo y su clave. Las respuestas se muestran en streaming cuando la ruta lo permite.
5. **Si el modelo solicita una herramienta**, Ely comprueba capacidades, valida argumentos y aplica los límites correspondientes.
6. **El resultado vuelve al modelo como dato no confiable**, no como una instrucción. El agente puede usarlo como evidencia y continuar la tarea.
7. **Si se editaron archivos**, Ely ejecuta las comprobaciones configuradas y comunica qué pasó, qué falló o qué quedó sin verificar.

<!-- DIAGRAM -->

## Componentes

| Componente | Función |
|---|---|
| Interfaz web | Chat, perfiles, agentes, calidad, telemetría y vistas de proyecto. |
| CLI `ely` | Chat en terminal, consulta de perfiles, calidad, diagnóstico y servidor local. |
| Motor Python | Coordina mensajes, modelos, herramientas, presupuestos y resultados. |
| Perfiles | URL, proveedor, modelo, límites y referencia a la variable de API key. |
| Harness² | Ajusta esfuerzo, temperatura, tokens e instrucciones; en CoworkRunner puede probar propuestas bajo presupuesto y validarlas con WEV. |
| MCP | Conecta servidores y herramientas que estén declarados y habilitados de forma explícita. |

<!-- PAGEBREAK -->
# Agentes y delegación

## Agentes incluidos

| Agente | Enfoque |
|---|---|
| **Photon** | Orquestación, uso de herramientas y delegación de tareas pequeñas. |
| **Codey** | Ingeniería y código. Puede leer, buscar, escribir y ejecutar comprobaciones aisladas. |
| **Lint** | Revisión de corrección, seguridad y rendimiento. |
| **Ink** | Documentación técnica. |
| **Query** | Datos y análisis. |
| **Deploy** | Infraestructura y automatización. |
| **Nucleus** | Ayuda con comandos de terminal y sistema. |
| **Nova** | Producto y estrategia. |

Las herramientas disponibles dependen del agente y de sus capacidades. Photon tiene la capacidad de delegar; Codey no puede volver a delegar. Las capacidades se verifican en el despacho, no solo en lo que el modelo ve anunciado.

## Contrato de un subagente

Photon puede enviar una subtarea a Codey, Lint o Ink. La solicitud lleva un contrato tipado y versionado con rol, instrucción, hasta cinco archivos explícitos y un presupuesto. El hijo **no hereda el historial del chat**: recibe la instrucción y, si se pidieron, esos archivos. La respuesta tiene estado, resumen, artifacts tipados, uso de tokens y herramientas utilizadas.

El nivel de calidad activo también llega al subagente. Harness² calcula sus parámetros según su rol y limita su presupuesto al remanente disponible del padre. Un fallo o una respuesta parcial se informa como tal; el padre conserva la responsabilidad de integrar y explicar el resultado.

## Elegir un agente

- Usa **Photon** para tareas con varios pasos o cuando haga falta coordinar herramientas.
- Usa **Codey** para implementar o corregir código.
- Usa **Lint** para obtener una revisión enfocada.
- Usa **Ink** para escribir o mejorar documentación.
- Usa los demás agentes cuando la tarea coincida con su especialidad; una respuesta conversacional no implica que el agente haya ejecutado acciones.

<!-- PAGEBREAK -->
# Harness² y niveles de calidad

## Parámetros que administra

En el chat normal, el runtime de Harness² considera el agente, el subagente si lo hay, el perfil y el nivel activo. Selecciona una banda de esfuerzo, temperatura, límite por llamada, presupuesto total, presupuesto de contexto y una instrucción de trabajo apropiada para la calidad solicitada. La temperatura explícita y los límites configurados se respetan dentro de los techos.

En el flujo CoworkRunner, Harness² también puede proponer variantes acotadas de un harness, probarlas y conservar cambios solo con evidencia de WEV. No cambia permisos de seguridad del sistema operativo.

## Niveles en su orden actual

`Xlow` → `Low` → `Mid` → `Hight` → `xHight` → `Uhight` → `Isabel te extraño`

El orden de esta lista es significativo. Ely no lo reordena alfabéticamente. Al aumentar el nivel, aumenta el presupuesto de trabajo y se solicita una revisión más rigurosa. Esto **no garantiza** que una respuesta sea correcta: la verificación depende de criterios y pruebas disponibles.

Cuando el proyecto tiene una suite detectable, Ely puede sugerir `Mid`; si no, sugiere `Low`. Se pueden configurar comandos de prueba desde CLI. Al editar archivos, el motor puede volver a pedir al modelo que atienda los criterios fallidos hasta el límite del nivel seleccionado.

## Caché y coste

- No se guarda una copia local de cada prompt/respuesta para reutilizarla.
- En perfiles Anthropic, Ely marca el prefijo de sistema para caché efímera del proveedor.
- En perfiles compatibles con OpenAI, Ely no manda parámetros de caché propietarios; un proveedor puede reutilizar prefijos automáticamente si ofrece esa función.
- La caché y el cobro efectivos dependen del proveedor y del modelo.

<!-- PAGEBREAK -->
# Herramientas y seguridad

## Herramientas del workspace

Las herramientas locales disponibles a los agentes pueden listar, leer, buscar y escribir archivos permitidos, y ejecutar comandos en aislamiento. Las rutas privadas, archivos de credenciales y directorios vendorados quedan fuera de las herramientas de archivo. Las ediciones se limitan al workspace y guardan una copia de la versión anterior.

La ejecución de comandos por agentes usa un snapshot aislado y devuelve un diff para revisión; no equivale a ejecutar con acceso total en la terminal. Si el host no ofrece un aislamiento compatible, la operación falla cerrada. La disponibilidad concreta de namespaces, Landlock, seccomp o perfiles AppArmor depende del sistema operativo y de su configuración.

## MCP

Ely puede descubrir servidores configurados y habilitados explícitamente. Soporta MCP por stdio y Streamable HTTP; no soporta el transporte SSE legado. El usuario debe revisar el servidor y sus permisos antes de habilitarlo.

La verificación de firmas Ed25519 para manifiestos MCP es optativa por política local. Si se configura `require_signatures: true`, se exige una clave confiable; una firma presente pero inválida se rechaza. Consulta `CLI/security/MCP-SIGNATURES.md` para el procedimiento.

## Tratamiento de resultados

Las salidas de herramientas se devuelven al modelo en un sobre marcado como no confiable. Un escáner heurístico puede señalar patrones de inyección, pero no es un detector perfecto y una alerta no demuestra que haya ocurrido un ataque. Las capacidades impiden despachar herramientas no autorizadas; los textos del repositorio y las herramientas siguen tratándose como datos.

### Buenas prácticas

- Guarda claves reales en variables de entorno o en `.ely/keys.env`, no en Git.
- Habilita solo servidores MCP que hayas revisado.
- Usa el menor nivel de permisos y presupuesto que resuelva la tarea.
- Revisa los diffs antes de aplicarlos y ejecuta tus propios criterios críticos.
- No trates el nivel de calidad ni la salida de un modelo como autorización para una operación sensible.

<!-- PAGEBREAK -->
# Empezar y operar

## Inicio local

```bash
./CLI/ely serve
```

Abre la dirección local que indique la CLI. Para usar el chat desde terminal:

```bash
./CLI/ely ask "Resume este proyecto" -a photon
./CLI/ely chat
```

Comandos útiles:

```bash
./CLI/ely profiles                  # perfiles disponibles, claves enmascaradas
./CLI/ely quality                   # nivel activo y criterios detectados
./CLI/ely quality Mid               # seleccionar nivel de calidad
./CLI/ely stats --json              # telemetría
./CLI/ely mcp                       # estado MCP en modo lectura
./CLI/ely doctor                    # diagnóstico
```

## Configurar un perfil

Cada perfil está descrito en `profiles/*.json`. El perfil define proveedor, modelo, URL base, nombre de la variable de clave y límites locales. La prioridad de la clave real es entorno, `.ely/keys.env` y luego los fixtures de prueba. Los valores de prueba no autentican contra servicios reales.

Ejemplo de variable de entorno:

```bash
export OPENAI_API_KEY="tu-clave"
```

Para proveedores locales compatibles, configura `ELY_LOCAL_BASE_URL` y el perfil `local`. No compartas ni pegues claves en el chat.

## Límites conocidos

- El nivel de calidad guía presupuestos y comprobaciones; no certifica tareas sin criterios medibles.
- El proveedor puede no implementar caché de prefijos aunque Ely marque el prompt.
- Los comandos aislados dependen de las funciones de seguridad del host; Ely falla cerrado cuando no puede crear el aislamiento requerido.
- Las integraciones Harness-Candy, Laya y MCP son opcionales y requieren configuración.
- Ely no publica resultados de SWE-bench Verified ni Terminal-Bench. Las suites pequeñas del repositorio son fixtures de desarrollo, no benchmarks oficiales.

---

**Ely Cowork · Guía del producto**

Versión del documento: 1.0 · 2 de noviembre de 2026
