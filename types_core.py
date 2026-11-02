"""Tipos compartidos del workspace Ely Cowork.

`MCPs/mcp_router.py` importa este módulo desde la raíz del repo. Define las
estructuras mínimas que el enrutador necesita, solo con la biblioteca estándar
(sin dependencias), para que el descubrimiento de MCPs y la selección de
Harness funcionen sin instalar nada.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class HarnessType(Enum):
    """Frameworks de ejecución disponibles para una subtarea."""

    DSH = "dsh"            # DeepSeek Harness: terminal/shell, ejecución rápida
    ADK = "adk"            # Google Agent Development Kit: estado y sesiones
    HARNESS2 = "harness2"  # Harness²: meta-orquestación y evaluación recursiva


@dataclass
class MCPToolSchema:
    """Esquema de una herramienta expuesta por un servidor MCP."""

    name: str
    server_id: str
    description: str = ""
    parameters: dict[str, Any] = field(default_factory=dict)


@dataclass
class MCPServerConfig:
    """Configuración formal de un servidor MCP descubierto en MCPs/tools/."""

    server_id: str
    name: str
    entry_point: str
    server_type: str = "python"
    tools: list[MCPToolSchema] = field(default_factory=list)
    is_active: bool = True


@dataclass
class TaskStep:
    """Una subtarea del plan, con lo que necesita para ejecutarse."""

    title: str
    objective: str = ""
    required_mcps: list[str] = field(default_factory=list)
    harness: HarnessType | None = None
    metadata: dict[str, Any] = field(default_factory=dict)
