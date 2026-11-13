# Contratos de subagentes y control de ejecución Harness²

El runtime de chat delega subtareas mediante un contrato versionado (`1.0`) en
`ely_cli/subagent_contracts.py`. La petición valida rol, tarea, lista explícita
de hasta cinco archivos y presupuesto; no transmite historial. La respuesta
valida estado, resumen, artifacts, uso, perfil/modelo y herramientas utilizadas.
El hijo conserva sus capacidades propias, no puede volver a delegar y no recibe
el historial del padre.

## Calidad y parámetros de generación

`Harness2Runtime` consume `quality.LEVELS` en el orden declarado; compara por
índice, nunca ordena las etiquetas alfabéticamente. El controlador se aplica al
agente principal y a cada hijo, decide esfuerzo bajo/medio/alto, temperatura,
`max_tokens`, presupuesto total y límite aproximado de contexto. También añade
una instrucción breve ajustada al estado de calidad. Los hijos heredan el nivel
activo, pero su salida y presupuesto quedan acotados; el padre limita la
delegación al presupuesto restante. Una configuración explícita de temperatura
u output tokens se respeta dentro de los techos configurados.

Los niveles de calidad son crecientes y el presupuesto de tarea efectivo no
supera el del nivel seleccionado. La política `harness-policy.json` puede
restringirlo aún más. El objetivo global de tokens tiene techo configurable de
hasta 4096 por llamada; la herramienta de Harness puede cambiar el objetivo y
el nuevo valor entra en vigor en la siguiente ronda.

## Pruning de contexto

Antes de cada llamada, se estima el contexto a razón de cuatro caracteres por
token. Se conservan las instrucciones de sistema y el turno más reciente; se
eliminan primero turnos antiguos completos. Si una ronda de herramientas aún
supera el límite, se acortan los envelopes JSON marcados como no confiables y,
como último recurso, se recorta el contenido más voluminoso preservando sus
extremos y añadiendo un marcador. No se resumen instrucciones de sistema ni se
cambia su clasificación de confianza.

## Caché de prompts

No se persisten prompts ni respuestas en una caché local. Para Anthropic, Ely
marca el prefijo de instrucciones de sistema como `ephemeral`, si el perfil usa
ese proveedor. En APIs compatibles con OpenAI no añade parámetros propietarios:
los proveedores que implementan caché de prefijos pueden reutilizarla de forma
automática. La efectividad y el coste del caché dependen del proveedor/modelo.

Las pruebas asociadas son `CLI/tests/test_harness_runtime.py`,
`CLI/tests/test_subagent_contracts.py` y las pruebas del payload Anthropic en
`CLI/tests/test_agent_tools.py`.
