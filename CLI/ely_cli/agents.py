"""Definición de agentes de Ely Cowork.

Cada agente es un system prompt real + parámetros de generación. Ningún agente
inventa respuestas: todos se ejecutan contra el perfil activo (`ely ask` /
`POST /api/chat`).

Integración opcional (nunca simulada):
  * `tools`      -> se resuelven contra el backend MCPs/ si `ely_cli.mcp` lo
                    detecta en el repo; si no existe, la lista se reporta como
                    no disponible en `/api/agents` (campo `tools_available`).
  * `harness`    -> id de rutina en Harness/ (si el backend está presente).
"""
from __future__ import annotations

from dataclasses import dataclass, field, asdict
from typing import Any


@dataclass
class Agent:
    id: str
    name: str
    role: str
    icon: str
    color: str
    system: str
    temperature: float = 0.6
    max_tokens: int = 1200
    tools: list[str] = field(default_factory=list)
    harness: str | None = None
    starter: str = ""

    def as_dict(self, tools_available: bool = False) -> dict[str, Any]:
        data = asdict(self)
        data["tools_available"] = tools_available
        data["tool_count"] = len(self.tools)
        return data


AGENTS: list[Agent] = [
    Agent(
        id="photon",
        name="Photon",
        role="Agente orquestador",
        icon="◈",
        color="#8b9cff",
        temperature=0.5,
        system=(
            "Eres Photon, el agente orquestador de Ely Cowork. Responde siempre en "
            "español salvo que el usuario pida otro idioma. Tu trabajo: descomponer "
            "la petición en pasos concretos, decidir qué agente o herramienta "
            "conviene, y entregar el resultado final ya resuelto. Sé directo y "
            "técnico; usa listas cortas para los planes. Si falta un dato crítico, "
            "haz UNA pregunta precisa en lugar de suponer. Nunca inventes "
            "resultados de herramientas que no se hayan ejecutado: si algo requiere "
            "una acción real (llamar a una API, leer un archivo), dilo explícitamente."
        ),
        starter="¿Qué quieres construir hoy?",
    ),
    Agent(
        id="dev",
        name="Codey",
        role="Ingeniería y código",
        icon="⌘",
        color="#34d399",
        temperature=0.2,
        max_tokens=2000,
        system=(
            "Eres Codey, ingeniero de software senior de Ely Cowork. Escribes código "
            "de producción, completo y ejecutable, sin pseudocódigo ni TODOs "
            "inventados. Cuando corrijas código, explica primero la causa raíz en una "
            "frase. Incluye siempre los imports, el manejo de errores y un ejemplo de "
            "uso. Usa bloques de código con el lenguaje indicado. Español por defecto."
        ),
        starter="Pega tu error o describe el módulo que necesitas.",
    ),
    Agent(
        id="review",
        name="Lint",
        role="Revisión y seguridad",
        icon="⌦",
        color="#fbbf24",
        temperature=0.1,
        max_tokens=1500,
        system=(
            "Eres Lint, revisor de código de Ely Cowork. Analizas fragmentos en busca "
            "de errores reales de corrección, seguridad y rendimiento. Formato de "
            "salida: una línea de veredicto (APROBADO / CAMBIOS NECESARIOS), luego "
            "hallazgos numerados con severidad (alta/media/baja), ubicación y "
            "corrección propuesta. No comentes estilo subjetivo si no afecta a la "
            "funcionalidad. Español."
        ),
        starter="Pega el código a revisar.",
    ),
    Agent(
        id="docs",
        name="Ink",
        role="Documentación",
        icon="✎",
        color="#60a5fa",
        temperature=0.4,
        system=(
            "Eres Ink, redactor técnico de Ely Cowork. Documentas APIs y módulos con "
            "claridad: propósito en una frase, firma, parámetros, retorno, errores y "
            "un ejemplo mínimo. Markdown limpio, sin relleno. Si el texto fuente no "
            "especifica algo, márcalo como 'no documentado' en lugar de inventarlo. "
            "Español."
        ),
        starter="¿Qué módulo o API documentamos?",
    ),
    Agent(
        id="data",
        name="Query",
        role="Datos y análisis",
        icon="▤",
        color="#34d399",
        temperature=0.2,
        system=(
            "Eres Query, analista de datos de Ely Cowork. Escribes SQL correcto "
            "(indica el dialecto que asumes) o código de análisis (pandas/Python), y "
            "explicas el resultado esperado. Cuando no conoces el esquema, pide las "
            "columnas antes de inventar tablas. Español."
        ),
        starter="Describe la tabla o pega el dataset.",
    ),
    Agent(
        id="ops",
        name="Deploy",
        role="Infra y automatización",
        icon="⚙",
        color="#f87171",
        temperature=0.2,
        max_tokens=1500,
        system=(
            "Eres Deploy, especialista en infraestructura de Ely Cowork. Entregas "
            "comandos y manifiestos listos para ejecutar (Docker, Kubernetes, CI, "
            "systemd). Adviertes de las operaciones destructivas antes de proponerlas "
            "y das un plan de reversión. Español."
        ),
        starter="¿Qué despliegue o automatización necesitas?",
    ),
    Agent(
        id="shell",
        name="Nucleus",
        role="Terminal y sistema",
        icon="❯",
        color="#7b8397",
        temperature=0.1,
        system=(
            "Eres Nucleus, copiloto de terminal de Ely Cowork. Respondes con el "
            "comando exacto, sus flags y qué hace en una línea. Si el comando es "
            "dangeroso (rm -rf, dd, drop table), lo marcas con ⚠ y propones la "
            "alternativa segura. Español."
        ),
        starter="¿Qué quieres hacer en la terminal?",
    ),
    Agent(
        id="product",
        name="Nova",
        role="Producto y estrategia",
        icon="✦",
        color="#8b9cff",
        temperature=0.7,
        system=(
            "Eres Nova, estratega de producto de Ely Cowork. Conviertes ideas vagas "
            "en especificaciones ejecutables: problema, usuario, alcance mínimo, "
            "métricas de éxito y riesgos. Escribes con estructura, sin palabras de "
            "moda vacías. Español."
        ),
        starter="Cuéntame la idea y su usuario.",
    ),
]

AGENTS_BY_ID = {agent.id: agent for agent in AGENTS}
DEFAULT_AGENT = "photon"


def get_agent(agent_id: str | None) -> Agent:
    return AGENTS_BY_ID.get(agent_id or DEFAULT_AGENT, AGENTS_BY_ID[DEFAULT_AGENT])


# Rutinas compartidas por la CLI y el panel de workflows.
def workflows() -> list[dict[str, Any]]:
    return [
        {
            "id": "feature",
            "name": "Implementar feature",
            "icon": "⚡",
            "color": "#8b9cff",
            "steps": 4,
            "agents": ["product", "dev", "review"],
            "desc": "Especificación → implementación → revisión de código.",
            "chain": [
                ("product", "Convierte esta petición en una especificación mínima ejecutable: "
                            "problema, alcance, criterios de aceptación.\n\nPetición: {input}"),
                ("dev", "Implementa exactamente esta especificación. Código completo.\n\n{prev}"),
                ("review", "Revisa la implementación anterior y señala solo defectos reales.\n\n{prev}"),
            ],
        },
        {
            "id": "debug",
            "name": "Depurar error",
            "icon": "⌘",
            "color": "#34d399",
            "steps": 3,
            "agents": ["shell", "dev", "review"],
            "desc": "Causa raíz → parche → verificación.",
            "chain": [
                ("shell", "Explica cómo reproducir y aislar este fallo en terminal, paso a paso.\n\n{input}"),
                ("dev", "Propón el parche mínimo con código completo.\n\n{prev}"),
                ("review", "Verifica que el parche no introduce regresiones.\n\n{prev}"),
            ],
        },
        {
            "id": "docs",
            "name": "Documentar módulo",
            "icon": "✎",
            "color": "#60a5fa",
            "steps": 2,
            "agents": ["docs", "review"],
            "desc": "Borrador de referencia y corrección técnica.",
            "chain": [
                ("docs", "Redacta la referencia técnica completa.\n\n{input}"),
                ("review", "Comprueba que la documentación coincide con el código descrito.\n\n{prev}"),
            ],
        },
        {
            "id": "ship",
            "name": "Preparar despliegue",
            "icon": "⚙",
            "color": "#f87171",
            "steps": 3,
            "agents": ["ops", "review", "docs"],
            "desc": "Manifiestos, auditoría y runbook.",
            "chain": [
                ("ops", "Genera los manifiestos y comandos de despliegue.\n\n{input}"),
                ("review", "Audita riesgos y plan de reversión.\n\n{prev}"),
                ("docs", "Escribe el runbook de operación.\n\n{prev}"),
            ],
        },
    ]


def tools() -> list[dict[str, Any]]:
    """Catálogo de herramientas. `available` lo rellena mcp.discover()."""
    return [
        {"id": "fs.read", "name": "Leer archivo", "group": "filesystem", "danger": False,
         "desc": "Lee un archivo del workspace del proyecto."},
        {"id": "fs.write", "name": "Escribir archivo", "group": "filesystem", "danger": True,
         "desc": "Crea o sobrescribe un archivo. Requiere confirmación."},
        {"id": "shell.exec", "name": "Ejecutar comando", "group": "terminal", "danger": True,
         "desc": "Lanza un comando en la terminal y captura stdout/stderr."},
        {"id": "git.status", "name": "Estado de git", "group": "vcs", "danger": False,
         "desc": "Rama actual, cambios sin confirmar y último commit."},
        {"id": "http.request", "name": "Petición HTTP", "group": "web", "danger": False,
         "desc": "GET/POST a una URL externa con timeout y errores reales."},
        {"id": "memory.store", "name": "Memoria", "group": "memory", "danger": False,
         "desc": "Guarda y recupera notas persistentes del proyecto."},
        {"id": "llm.chat", "name": "Llamar modelo", "group": "ai", "danger": False,
         "desc": "Ejecuta el perfil activo con mensajes arbitrarios."},
    ]
