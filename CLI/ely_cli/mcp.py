"""Descubrimiento del backend MCPs/ — solo lectura, nunca simulado.

Ely no asume que existan servidores MCP. Busca manifiestos reales en MCPs/ y
reporta lo que encuentra. Si la carpeta está vacía, `status` = "not-configured"
y el frontend lo muestra así (sin datos inventados).

Formatos reconocidos (los habituales de MCP):
  * MCPs/*.json, MCPs/**/mcp.json, MCPs/.mcp.json  -> {"mcpServers": {...}}
  * MCPs/servers/*.json                            -> manifiesto suelto
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

ROOT_KEYS = ("mcpServers", "servers", "mcp_servers")


def _manifest_paths(root: Path) -> list[Path]:
    base = root / "MCPs"
    if not base.is_dir():
        return []
    seen: list[Path] = []
    for pattern in ("*.json", "**/*.json", "**/*.toml", "**/*.yaml", "**/*.yml"):
        for path in base.glob(pattern):
            if path not in seen and path.is_file():
                seen.append(path)
    return sorted(seen)


def discover(root: Path) -> dict[str, Any]:
    base = root / "MCPs"
    result: dict[str, Any] = {
        "dir": str(base.relative_to(root)) if base.is_dir() else None,
        "exists": base.is_dir(),
        "status": "not-configured",
        "servers": [],
        "manifests": [],
        "hint": "Añade MCPs/mcp.json con {\"mcpServers\": {...}} para habilitarlos.",
    }
    if not base.is_dir():
        return result

    servers: list[dict[str, Any]] = []
    for path in _manifest_paths(root):
        rel = str(path.relative_to(root))
        result["manifests"].append(rel)
        if path.suffix != ".json":
            continue
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            continue
        block = next((data[k] for k in ROOT_KEYS if isinstance(data.get(k), dict)), None)
        if block is None and isinstance(data.get("command"), str):
            block = {data.get("id") or path.stem: data}
        for name, cfg in (block or {}).items():
            if not isinstance(cfg, dict):
                continue
            cmd = cfg.get("command") or cfg.get("url") or ""
            servers.append({
                "id": name,
                "transport": cfg.get("transport") or ("http" if str(cmd).startswith("http") else "stdio"),
                "target": _redact(str(cmd)),
                "args": [str(a) for a in cfg.get("args", []) if not str(a).startswith("-")][:6],
                "manifest": rel,
                "enabled": bool(cfg.get("enabled", True)),
            })

    result["servers"] = servers
    if servers:
        result["status"] = "configured"
        result["hint"] = f"{len(servers)} servidor(es) MCP declarados. Ely no los arranca automáticamente."
    elif result["manifests"]:
        result["status"] = "declared-empty"
        result["hint"] = "Hay manifiestos en MCPs/ pero ninguno declara servidores."
    return result


def _redact(value: str) -> str:
    """Oculta tokens embebidos en URLs de servidores MCP."""
    if "://" not in value:
        return value
    head, _, tail = value.partition("://")
    if "@" in tail:
        tail = tail.split("@", 1)[1]
    return f"{head}://{tail}"
