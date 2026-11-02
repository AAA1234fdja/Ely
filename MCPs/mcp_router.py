# MCPs/mcp_router.py
# ==============================================================================
# ELY COWORK: ENRUTADOR DINAMICO DE MCPs Y HARNESSES
# Enruta herramientas, servidores MCP y determina el framework de ejecucion optimo
# ==============================================================================

from __future__ import annotations
import os
import sys
import json
from pathlib import Path
from typing import Dict, List, Optional, Any, Tuple
import logging

# Incorporar ruta raiz al sys.path para importar types_core
current_dir = Path(__file__).resolve().parent
workspace_root = current_dir.parent
if str(workspace_root) not in sys.path:
    sys.path.insert(0, str(workspace_root))

from types_core import HarnessType, MCPServerConfig, MCPToolSchema, TaskStep

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] [MCPRouter] %(message)s")
logger = logging.getLogger("MCPRouter")


class MCPRouter:
    """
    Enrutador central para descubrir servidores MCP locales en tools/
    y seleccionar dinamicamente el Harness de ejecucion mas eficiente.
    """

    def __init__(self, tools_dir: Optional[str] = None):
        self.workspace_root = workspace_root
        self.tools_dir = Path(tools_dir) if tools_dir else current_dir / "tools"
        self.servers: Dict[str, MCPServerConfig] = {}
        self.tool_registry: Dict[str, Tuple[str, MCPToolSchema]] = {} # tool_name -> (server_id, schema)
        self.harness_registry: Dict[HarnessType, Dict[str, Any]] = {
            HarnessType.DSH: {
                "name": "DeepSeek Harness (dsh)",
                "path": str(self.workspace_root / "Harness" / "dsh"),
                "specialization": ["terminal", "shell", "git", "bash", "filesystem", "scripts", "rapid_cli"],
                "description": "Ejecucion ultrarrapida en terminal y shell de comandos nativos."
            },
            HarnessType.ADK: {
                "name": "Google Agent Development Kit (adk)",
                "path": str(self.workspace_root / "Harness" / "adk"),
                "specialization": ["state_machine", "memory", "session", "multi_turn", "structured_agents"],
                "description": "Gestion de estado robusta, ciclo de vida de agentes y flujos complejos."
            },
            HarnessType.HARNESS2: {
                "name": "Harness2 Meta-Orchestrator",
                "path": str(self.workspace_root / "Harness" / "harness2"),
                "specialization": ["meta_orchestration", "self_improvement", "recursion", "evaluation", "refactor"],
                "description": "Meta-orquestacion, evaluacion recursiva y auto-mejora de codigo y prompts."
            }
        }
        self.discover_local_mcps()

    def discover_local_mcps(self) -> None:
        """Escanea la subcarpeta tools/ e inicializa los servidores MCP encontrados."""
        if not self.tools_dir.exists():
            logger.warning(f"Directorio de herramientas no encontrado: {self.tools_dir}")
            return

        for item in self.tools_dir.iterdir():
            if item.is_dir():
                server_id = item.name.lower()
                config = self._inspect_mcp_directory(server_id, item)
                self.servers[server_id] = config
                for tool in config.tools:
                    self.tool_registry[tool.name] = (server_id, tool)
                logger.info(f"Servidor MCP registrado: '{server_id}' con {len(config.tools)} herramientas.")

    def _inspect_mcp_directory(self, server_id: str, path: Path) -> MCPServerConfig:
        """Inspecciona una carpeta de herramienta MCP y genera su configuracion formal."""
        tools: List[MCPToolSchema] = []

        if "github" in server_id:
            tools = [
                MCPToolSchema(
                    name="github_get_repo_tree",
                    server_id=server_id,
                    description="Obtiene el arbol de archivos y directorios de un repositorio local o remoto",
                    parameters={"type": "object", "properties": {"path": {"type": "string"}}}
                ),
                MCPToolSchema(
                    name="github_search_code",
                    server_id=server_id,
                    description="Busca patrones, simbolos o funciones en los archivos de codigo",
                    parameters={"type": "object", "properties": {"query": {"type": "string"}, "file_extension": {"type": "string"}}}
                ),
                MCPToolSchema(
                    name="github_create_pull_request",
                    server_id=server_id,
                    description="Prepara y formatea un PR o diff de cambios para revision",
                    parameters={"type": "object", "properties": {"title": {"type": "string"}, "diff": {"type": "string"}}}
                )
            ]
        elif "youtube" in server_id:
            tools = [
                MCPToolSchema(
                    name="youtube_get_transcript",
                    server_id=server_id,
                    description="Extrae la transcripcion de video para analisis de conocimiento o documentacion",
                    parameters={"type": "object", "properties": {"video_url": {"type": "string"}, "language": {"type": "string", "default": "es"}}}
                )
            ]
        elif "awesome" in server_id:
            tools = [
                MCPToolSchema(
                    name="awesome_mcp_catalog_search",
                    server_id=server_id,
                    description="Consulta el catalogo de servidores y capacidades MCP de la comunidad",
                    parameters={"type": "object", "properties": {"category": {"type": "string"}}}
                )
            ]
        else:
            # Herramienta generica por defecto
            tools = [
                MCPToolSchema(
                    name=f"{server_id}_execute",
                    server_id=server_id,
                    description=f"Ejecuta una accion en el servidor MCP {server_id}",
                    parameters={"type": "object", "properties": {"action": {"type": "string"}, "payload": {"type": "object"}}}
                )
            ]

        return MCPServerConfig(
            server_id=server_id,
            name=path.name,
            entry_point=str(path),
            server_type="python" if any(path.glob("*.py")) else "node",
            tools=tools,
            is_active=True
        )

    def route_harness_for_task(self, task_description: str, metadata: Optional[Dict[str, Any]] = None) -> HarnessType:
        """
        Determina deterministicamente el Harness ideal segun las palabras clave,
        complejidad y contexto de la subtarea.
        """
        text = (task_description + " " + json.dumps(metadata or {})).lower()

        # 1. Reglas para Harness2 (Meta-orquestacion, recursividad, auto-mejora)
        harness2_keywords = ["meta", "orquest", "recursiv", "self-improv", "auto-mejora", "evalua", "benchmark", "refactor global"]
        if any(kw in text for kw in harness2_keywords):
            return HarnessType.HARNESS2

        # 2. Reglas para ADK (Estado, memoria, sesion estructurada)
        adk_keywords = ["estado", "state", "sesion", "session", "memoria", "multi-turn", "conversacion", "contexto"]
        if any(kw in text for kw in adk_keywords):
            return HarnessType.ADK

        # 3. Reglas para DSH (Shell, terminal, scripts, git, ejecucion rapida)
        # Default por excelencia para velocidad y scripting nativo
        return HarnessType.DSH

    def select_tools_for_step(self, step: TaskStep) -> List[MCPToolSchema]:
        """Selecciona las herramientas MCP pertinentes para un TaskStep."""
        selected: List[MCPToolSchema] = []
        text = (step.title + " " + step.objective).lower()

        for s_id in step.required_mcps:
            clean_id = s_id.lower().replace("-", "_")
            for server_id, server in self.servers.items():
                if clean_id in server_id.replace("-", "_"):
                    selected.extend(server.tools)

        # Si no se especificaron explicitamente, autodescubrir por heuristica
        if not selected:
            if "git" in text or "repositorio" in text or "codigo" in text:
                if "github-mcp-server" in self.servers:
                    selected.extend(self.servers["github-mcp-server"].tools)
            if "video" in text or "audio" in text or "youtube" in text or "transcrip" in text:
                if "mcp-server-youtube-transcript" in self.servers:
                    selected.extend(self.servers["mcp-server-youtube-transcript"].tools)
            if "catalogo" in text or "mcp" in text:
                if "awesome-mcp-servers" in self.servers:
                    selected.extend(self.servers["awesome-mcp-servers"].tools)

        return selected

    def get_capabilities_summary(self) -> Dict[str, Any]:
        """Genera un resumen json-friendly de todos los Harnesses y MCPs disponibles."""
        return {
            "harnesses": {
                h_type.value: info for h_type, info in self.harness_registry.items()
            },
            "mcp_servers": {
                s_id: {
                    "name": s.name,
                    "tools": [t.name for t in s.tools],
                    "entry_point": s.entry_point
                }
                for s_id, s in self.servers.items()
            }
        }


# Instancia singleton predeterminada
mcp_router = MCPRouter()

if __name__ == "__main__":
    router = MCPRouter()
    print("Capacidades registradas:")
    print(json.dumps(router.get_capabilities_summary(), indent=2))
    
    test_task = "Compilar y ejecutar script en terminal"
    chosen = router.route_harness_for_task(test_task)
    print(f"\nTarea: '{test_task}' -> Harness asignado: {chosen.value}")
