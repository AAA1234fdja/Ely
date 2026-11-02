"""Navegación del IDE — fuente única para el nav y el router del frontend.

El servidor expone esta tabla en /api/config para que el cliente no duplique
la lista de vistas (el HTML carga todos los módulos; el router solo usa estos).
"""
from __future__ import annotations

from typing import Any

NAV: list[dict[str, Any]] = [
    {"group": "Trabajo", "items": [
        {"id": "chat", "icon": "❯", "label": "Chat", "title": "Chat",
         "subtitle": "Conversación con el perfil activo, en streaming real"},
        {"id": "dashboard", "icon": "◈", "label": "Panel", "title": "Panel",
         "subtitle": "Estado del sistema, telemetría y actividad reciente"},
        {"id": "ide", "icon": "⌘", "label": "IDE", "title": "IDE",
         "subtitle": "Editor de archivos del workspace con asistente integrado"},
        {"id": "canvas", "icon": "⬡", "label": "Canvas", "title": "Canvas",
         "subtitle": "Mapa de orquestación de agentes y workflows"},
    ]},
    {"group": "Orquestación", "items": [
        {"id": "workflows", "icon": "⚡", "label": "Workflows", "title": "Workflows",
         "subtitle": "Rutinas multi-agente ejecutadas contra el proveedor"},
        {"id": "agents", "icon": "✦", "label": "Agentes", "title": "Agentes",
         "subtitle": "System prompts reales y parámetros de generación"},
        {"id": "teams", "icon": "◎", "label": "Equipos", "title": "Equipos",
         "subtitle": "Cadenas de agentes coordinadas por objetivo"},
        {"id": "skills", "icon": "✧", "label": "Skills", "title": "Skills",
         "subtitle": "Instrucciones reutilizables que se anteponen al prompt"},
        {"id": "tools", "icon": "⚒", "label": "Herramientas", "title": "Herramientas",
         "subtitle": "Catálogo de herramientas y estado del backend MCPs"},
        {"id": "memory", "icon": "▤", "label": "Memoria", "title": "Memoria",
         "subtitle": "Notas persistentes que se inyectan como contexto"},
        {"id": "jobs", "icon": "◷", "label": "Jobs", "title": "Jobs",
         "subtitle": "Historial de ejecuciones y llamadas"},
    ]},
    {"group": "Conexiones", "items": [
        {"id": "integrations", "icon": "⇄", "label": "Integraciones", "title": "Integraciones",
         "subtitle": "Perfiles, endpoints y API Keys"},
        {"id": "pairing", "icon": "◉", "label": "Pairing", "title": "Pairing",
         "subtitle": "Token de emparejamiento y endpoint de la API"},
    ]},
    {"group": "Sistema", "items": [
        {"id": "assets", "icon": "◫", "label": "Activos", "title": "Activos",
         "subtitle": "Inventario real del repositorio"},
        {"id": "costs", "icon": "◐", "label": "Costes", "title": "Costes",
         "subtitle": "Tokens reales y tarifas por perfil"},
        {"id": "config", "icon": "⚙", "label": "Configuración", "title": "Configuración",
         "subtitle": "Entorno, rutas y endpoints del servidor"},
    ]},
]


def flat() -> list[dict[str, Any]]:
    return [item for group in NAV for item in group["items"]]
