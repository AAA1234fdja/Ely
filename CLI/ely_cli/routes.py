"""Navegación del IDE — fuente única para el nav y el router del frontend.

Los grupos, etiquetas y descripciones siguen la estructura de la referencia
visual. El servidor expone esta tabla en /api/routes y el cliente la consume;
el respaldo está en js/app.js.
"""
from __future__ import annotations

from typing import Any

NAV: list[dict[str, Any]] = [
    {"group": "Desarrollo", "items": [
        {"id": "ide", "label": "IDE", "desc": "Editor de código con IA",
         "icon": "⌘", "title": "IDE"},
    ]},
    {"group": "Orquestación", "items": [
        {"id": "dashboard", "label": "Dashboard", "desc": "Resumen de sesión y acciones",
         "icon": "◈", "title": "Dashboard"},
        {"id": "workflows", "label": "Workflows", "desc": "Define, edita y ejecuta flujos",
         "icon": "⚡", "title": "Workflows"},
        {"id": "agents", "label": "Agent Pool", "desc": "Reutiliza agentes y workflows",
         "icon": "✦", "title": "Agent Pool"},
        {"id": "canvas", "label": "Canvas", "desc": "Diseña y orquesta visualmente",
         "icon": "⬡", "title": "Canvas"},
        {"id": "teams", "label": "Agent Teams", "desc": "Coordina equipos y roles",
         "icon": "◎", "title": "Agent Teams"},
    ]},
    {"group": "Operaciones", "items": [
        {"id": "assets", "label": "Asset Browser", "desc": "Archivos y activos del workflow",
         "icon": "◫", "title": "Asset Browser"},
        {"id": "storage", "label": "Local Storage", "desc": "Archivos por perfil: generado y planeado",
         "icon": "▣", "title": "Local Storage"},
        {"id": "repos", "label": "Repositories", "desc": "Importa repositorios Git al workspace",
         "icon": "⎇", "title": "Repositories"},
        {"id": "skillslib", "label": "Skills Library", "desc": "Capacidades operativas",
         "icon": "✧", "title": "Skills Library"},
        {"id": "skills", "label": "Skills", "desc": "Edita y revisa skills",
         "icon": "✧", "title": "Skills"},
        {"id": "tools", "label": "Tools", "desc": "Herramientas y llamadas",
         "icon": "⚒", "title": "Tools"},
        {"id": "integrations", "label": "Integrations", "desc": "Conecta sistemas externos",
         "icon": "⇄", "title": "Integrations"},
        {"id": "jobs", "label": "Scheduled Jobs", "desc": "Tareas programadas",
         "icon": "◷", "title": "Scheduled Jobs"},
        {"id": "pairing", "label": "Pairing", "desc": "Vincula dispositivos",
         "icon": "◉", "title": "Pairing"},
        {"id": "config", "label": "Configuration", "desc": "Ajustes y políticas",
         "icon": "⚙", "title": "Configuration"},
    ]},
    {"group": "Inspección", "items": [
        {"id": "costs", "label": "Cost Tracker", "desc": "Gasto y eficiencia",
         "icon": "◐", "title": "Cost Tracker"},
        {"id": "memory", "label": "Memory", "desc": "Memoria y grafo de contexto",
         "icon": "▤", "title": "Memory"},
    ]},
]


def flat() -> list[dict[str, Any]]:
    return [item for group in NAV for item in group["items"]]
