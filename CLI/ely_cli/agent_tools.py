"""Herramientas acotadas para el bucle agéntico de Ely.

El acceso a archivos restringe rutas privadas y vendoradas. Los comandos de
agente se ejecutan en snapshot temporal mediante aislamiento del sistema
operativo; si el host no lo ofrece, la ejecución falla cerrada. El modo full
queda reservado a comandos escritos y ejecutados directamente por el usuario.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

from . import workspace

MAX_LIST_FILES = 120
MAX_SEARCH_FILES = 1200
MAX_MATCHES = 40
MAX_FILE_BYTES = 64_000
MAX_TOOL_RESULT_CHARS = 14_000
MAX_WRITE_CHARS = 60_000
MAX_COMMAND_CHARS = 1_000
BLOCKED_PARTS = {
    ".git", ".ely", ".ssh", ".aws", ".config", "node_modules", "__pycache__",
    ".venv", "venv", "dist", "build", "target", "coverage",
}
BLOCKED_ROOTS = {"ide/src", "ide/extensions"}
SENSITIVE_NAMES = {".env", "keys.env", "secrets.json", "credentials.json", "id_rsa", "id_ed25519", ".npmrc", ".pypirc", "known_hosts"}
SENSITIVE_MARKERS = ("secret", "credential", "private_key", "private-key")

TOOL_CAPABILITIES = {
    "workspace.list_files": "workspace.read",
    "workspace.read_file": "workspace.read",
    "workspace.search": "workspace.read",
    "workspace.write_file": "workspace.write",
    "workspace.run_command": "process.isolated",
    "harness.run": "harness.execute",
    "harness.set_token_target": "harness.configure",
    "agent.spawn_subagent": "agent.delegate",
    "laya.decide": "laya.recommend",
}


def required_capability(tool_name: str) -> str | None:
    return "mcp.invoke" if tool_name.startswith("mcp__") else TOOL_CAPABILITIES.get(tool_name)


def authorize_tool(tool_name: str, capabilities: set[str] | frozenset[str]) -> bool:
    required = required_capability(tool_name)
    return required is not None and required in capabilities


TOOL_SCHEMAS: dict[str, dict[str, Any]] = {
    "workspace.list_files": {
        "type": "function",
        "function": {
            "name": "workspace.list_files",
            "description": "Lista archivos de texto del workspace visibles y seguros. No incluye carpetas ocultas, secretos ni código vendorado.",
            "parameters": {"type": "object", "properties": {}, "additionalProperties": False},
        },
    },
    "workspace.read_file": {
        "type": "function",
        "function": {
            "name": "workspace.read_file",
            "description": "Lee un archivo de texto visible del workspace. Solo lectura; no acepta rutas fuera del proyecto ni archivos sensibles.",
            "parameters": {
                "type": "object",
                "properties": {"path": {"type": "string", "minLength": 1, "maxLength": 500}},
                "required": ["path"],
                "additionalProperties": False,
            },
        },
    },
    "workspace.search": {
        "type": "function",
        "function": {
            "name": "workspace.search",
            "description": "Busca una cadena literal en archivos de texto visibles del workspace. No interpreta regex ni ejecuta código.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "minLength": 2, "maxLength": 120},
                    "limit": {"type": "integer", "minimum": 1, "maximum": MAX_MATCHES},
                },
                "required": ["query"],
                "additionalProperties": False,
            },
        },
    },
    "workspace.write_file": {
        "type": "function",
        "function": {
            "name": "workspace.write_file",
            "description": "Crea o reemplaza un archivo de texto no sensible del workspace, guardando una copia de la versión anterior. Solo para cambios solicitados en esta tarea; no escribe fuera del proyecto.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "minLength": 1, "maxLength": 500},
                    "content": {"type": "string", "maxLength": MAX_WRITE_CHARS},
                },
                "required": ["path", "content"],
                "additionalProperties": False,
            },
        },
    },
    "workspace.run_command": {
        "type": "function",
        "function": {
            "name": "workspace.run_command",
            "description": "Ejecuta un comando en un sandbox del sistema operativo sin acceso a red externa ni secretos; solo loopback está disponible dentro del namespace aislado. El modo read_only no permite cambios; workspace ejecuta sobre una copia aislada y devuelve un diff sin aplicar. Si no hay un sandbox real disponible, la ejecución falla cerrada. El acceso full solo está disponible mediante acción directa del usuario en la terminal.",
            "parameters": {
                "type": "object",
                "properties": {
                    "command": {"type": "string", "minLength": 1, "maxLength": MAX_COMMAND_CHARS},
                    "cwd": {"type": "string", "maxLength": 500},
                    "mode": {"type": "string", "enum": ["read_only", "workspace"]},
                },
                "required": ["command"],
                "additionalProperties": False,
            },
        },
    },
    "harness.set_token_target": {
        "type": "function",
        "function": {
            "name": "harness.set_token_target",
            "description": "Ajusta el objetivo de tokens de salida para las siguientes llamadas de esta conversación. Solo Photon puede cambiarlo; el servidor lo limita al techo global de Harness y registra el cambio. Úsalo si el usuario lo pide o si hay evidencia de truncamiento; no lo aumentes sin motivo.",
            "parameters": {
                "type": "object",
                "properties": {"desired_tokens": {"type": "integer", "minimum": 128, "maximum": 4096}},
                "required": ["desired_tokens"],
                "additionalProperties": False,
            },
        },
    },
    "agent.spawn_subagent": {
        "type": "function",
        "function": {
            "name": "agent.spawn_subagent",
            "description": "Photon delega una subtarea aislada a Codey, Lint o Ink. El hijo recibe solo task y los archivos listados, no hereda el chat y no puede volver a delegar. Devuelve contrato tipado, uso y artifacts. No delegues decisiones ambiguas: devuélvelas al agente principal.",
            "parameters": {
                "type": "object",
                "properties": {
                    "role": {"type": "string", "enum": ["coder", "reviewer", "writer"]},
                    "task": {"type": "string", "minLength": 1, "maxLength": 3000},
                    "files": {"type": "array", "maxItems": 5, "items": {"type": "string", "maxLength": 500}},
                    "budget_tokens": {"type": "integer", "minimum": 128, "maximum": 4096},
                },
                "required": ["role", "task"],
                "additionalProperties": False,
            },
        },
    },
    "harness.run": {
        "type": "function",
        "function": {
            "name": "harness.run",
            "description": "Ejecuta una corrida bounded de Harness-Candy (plan ISA, DAG YEV, ejecución XEV, validación WEV y auditoría ELY) usando el perfil LLM actual. Las sondas de adaptación que hacen llamadas adicionales están desactivadas por defecto.",
            "parameters": {
                "type": "object",
                "properties": {
                    "objective": {"type": "string", "minLength": 1, "maxLength": 1500},
                    "seed": {"type": "integer", "minimum": 0, "maximum": 2147483647},
                },
                "required": ["objective"],
                "additionalProperties": False,
            },
        },
    },
    "laya.decide": {
        "type": "function",
        "function": {
            "name": "laya.decide",
            "description": "Usa Laya para puntuar alternativas explícitas en decisiones tipadas: presenta opciones antes de propuestas o resuelve una ambigüedad material durante una ejecución. Devuelve una señal, no autorización para ejecutar; el agente principal explica opciones y conserva la decisión final. En agentes secundarios úsalo solo excepcionalmente y prioriza no invocarlo.",
            "parameters": {
                "type": "object",
                "properties": {
                    "request": {"type": "string", "minLength": 1, "maxLength": 3000},
                    "options": {
                        "type": "object",
                        "minProperties": 2,
                        "maxProperties": 8,
                        "additionalProperties": {"type": "string", "maxLength": 400},
                    },
                },
                "required": ["request", "options"],
                "additionalProperties": False,
            },
        },
    },
}


def schemas_for(names: list[str]) -> list[dict[str, Any]]:
    """Devuelve una copia de los esquemas permitidos por el agente."""
    return [TOOL_SCHEMAS[name] for name in names if name in TOOL_SCHEMAS]


def _safe_path(root: Path, rel: str, *, must_exist: bool = True) -> Path:
    raw = str(rel or "").replace("\\", "/")
    path = Path(raw)
    if not raw or path.is_absolute() or any(part in {"", ".", ".."} for part in raw.split("/")):
        raise ValueError("La ruta debe ser relativa al workspace y no puede contener segmentos . o ..")
    parts = tuple(part.lower() for part in path.parts)
    if any(part.startswith(".") or part in BLOCKED_PARTS for part in parts):
        raise ValueError("La ruta pertenece a una carpeta privada, oculta o de build")
    if len(parts) >= 2 and "/".join(parts[:2]) in BLOCKED_ROOTS:
        raise ValueError("El código vendorado no está disponible para esta herramienta")
    name = path.name.lower()
    if (name in SENSITIVE_NAMES or name.startswith(".env.") or name.endswith((".env", ".pem", ".p12", ".pfx", ".key"))
            or any(marker in name for marker in SENSITIVE_MARKERS)):
        raise ValueError("El archivo parece contener credenciales o secretos")
    resolved_root = root.resolve()
    target = (resolved_root / path).resolve(strict=must_exist)
    if not must_exist and not target.parent.is_dir():
        raise ValueError("La carpeta de destino debe existir dentro del workspace")
    if target != resolved_root and resolved_root not in target.parents:
        raise ValueError("La ruta resuelta queda fuera del workspace")
    resolved_rel = target.relative_to(resolved_root)
    resolved_parts = tuple(part.lower() for part in resolved_rel.parts)
    resolved_name = target.name.lower()
    if (any(part.startswith(".") or part in BLOCKED_PARTS for part in resolved_parts)
            or (len(resolved_parts) >= 2 and "/".join(resolved_parts[:2]) in BLOCKED_ROOTS)
            or resolved_name in SENSITIVE_NAMES or resolved_name.startswith(".env.")
            or resolved_name.endswith((".env", ".pem", ".p12", ".pfx", ".key"))
            or any(marker in resolved_name for marker in SENSITIVE_MARKERS)):
        raise ValueError("La ruta resuelta pertenece a un archivo privado, vendorado o sensible")
    if must_exist and not target.is_file():
        raise ValueError("La ruta no es un archivo")
    if target.exists() and not target.is_file():
        raise ValueError("La ruta no es un archivo")
    if target.suffix.lower() not in workspace.TEXT_EXT:
        raise ValueError("Solo se permiten archivos de texto reconocidos")
    return target


def _visible_file(path: Path, root: Path) -> bool:
    try:
        rel = path.relative_to(root).as_posix()
        _safe_path(root, rel)
        return True
    except (ValueError, OSError):
        return False


def _iter_visible_files(root: Path):
    """Walks only workspace directories in scope; private/vendor trees are pruned."""
    root = root.resolve()
    for current, directories, filenames in os.walk(root, topdown=True, followlinks=False):
        current_path = Path(current)
        relative = current_path.relative_to(root)
        directories[:] = sorted(
            directory for directory in directories
            if not (current_path / directory).is_symlink()
            and not directory.startswith(".")
            and directory.lower() not in BLOCKED_PARTS
            and not (relative == Path("IDE") and directory.lower() in {"src", "extensions"})
        )
        for filename in sorted(filenames):
            path = current_path / filename
            if path.is_symlink() or not _visible_file(path, root):
                continue
            yield path


def _list_files(root: Path) -> dict[str, Any]:
    root = root.resolve()
    files: list[str] = []
    truncated = False
    for path in _iter_visible_files(root):
        try:
            if path.stat().st_size > MAX_FILE_BYTES:
                continue
        except OSError:
            continue
        files.append(path.relative_to(root).as_posix())
        if len(files) >= MAX_LIST_FILES:
            truncated = True
            break
    return {"files": files, "truncated": truncated}


def _read_file(root: Path, args: dict[str, Any]) -> dict[str, Any]:
    path = _safe_path(root, args.get("path", ""))
    size = path.stat().st_size
    if size > MAX_FILE_BYTES:
        raise ValueError(f"Archivo demasiado grande (máximo {MAX_FILE_BYTES} bytes)")
    raw = path.read_bytes()
    try:
        content = raw.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise ValueError("El archivo no es texto UTF-8 válido") from exc
    truncated = len(content) > MAX_TOOL_RESULT_CHARS
    return {
        "path": path.relative_to(root.resolve()).as_posix(),
        "content": content[:MAX_TOOL_RESULT_CHARS],
        "truncated": truncated,
    }


def _search(root: Path, args: dict[str, Any]) -> dict[str, Any]:
    query = args.get("query")
    if not isinstance(query, str) or len(query.strip()) < 2 or len(query) > 120:
        raise ValueError("query debe tener entre 2 y 120 caracteres")
    limit = args.get("limit", MAX_MATCHES)
    if isinstance(limit, bool) or not isinstance(limit, int) or not 1 <= limit <= MAX_MATCHES:
        raise ValueError(f"limit debe estar entre 1 y {MAX_MATCHES}")
    needle = query.casefold()
    root = root.resolve()
    matches: list[dict[str, Any]] = []
    scanned = 0
    visited = 0
    for path in _iter_visible_files(root):
        visited += 1
        if visited > MAX_SEARCH_FILES:
            break
        try:
            if path.stat().st_size > MAX_FILE_BYTES:
                continue
            text = path.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            continue
        scanned += 1
        for line_no, line in enumerate(text.splitlines(), 1):
            if needle in line.casefold():
                matches.append({
                    "path": path.relative_to(root).as_posix(),
                    "line": line_no,
                    "text": line.strip()[:240],
                })
                if len(matches) >= limit:
                    break
        if len(matches) >= limit:
            break
    return {"query": query, "matches": matches, "scanned": scanned, "truncated": len(matches) >= limit or visited > MAX_SEARCH_FILES}


def _write_file(root: Path, args: dict[str, Any]) -> dict[str, Any]:
    rel = args.get("path")
    content = args.get("content")
    if not isinstance(rel, str) or len(rel) > 500:
        raise ValueError("path debe ser una ruta relativa válida")
    if not isinstance(content, str) or len(content) > MAX_WRITE_CHARS:
        raise ValueError(f"content debe ser texto de hasta {MAX_WRITE_CHARS} caracteres")
    path = _safe_path(root, rel, must_exist=False)
    if path.suffix.lower() not in workspace.TEXT_EXT:
        raise ValueError(f"Extensión no editable: {path.suffix or '(sin extensión)'}")
    if path.exists() and not path.is_file():
        raise ValueError("La ruta ya existe y no es un archivo")
    encoded = content.encode("utf-8")
    if len(encoded) > MAX_WRITE_CHARS * 4:
        raise ValueError("El contenido codificado excede el máximo permitido")

    existed = path.is_file()
    previous = ""
    if existed:
        if path.stat().st_size > MAX_FILE_BYTES:
            raise ValueError(f"El archivo actual supera {MAX_FILE_BYTES} bytes; no se sobrescribió")
        previous = path.read_text(encoding="utf-8")
        from . import ideops
        ideops.history_save(root, rel, previous)

    import tempfile
    descriptor, temporary = tempfile.mkstemp(prefix=".ely-agent-", suffix=".tmp", dir=str(path.parent))
    try:
        with os.fdopen(descriptor, "wb") as handle:
            handle.write(encoded)
        os.replace(temporary, path)
    except Exception:
        try:
            os.unlink(temporary)
        except OSError:
            pass
        raise

    import difflib
    diff = list(difflib.unified_diff(
        previous.splitlines(), content.splitlines(),
        fromfile=f"a/{rel}" if existed else "/dev/null",
        tofile=f"b/{rel}", lineterm="",
    ))
    return {
        "path": rel,
        "saved": True,
        "created": not existed,
        "bytes": len(encoded),
        "backup_saved": existed,
        "diff": "\n".join(diff)[:8_000],
    }


def _safe_cwd(root: Path, rel: str) -> Path:
    raw = str(rel or "").replace("\\", "/")
    if not raw:
        return root.resolve()
    path = Path(raw)
    if path.is_absolute() or any(part in {"", ".", ".."} for part in raw.split("/")):
        raise ValueError("cwd debe ser una ruta relativa al workspace sin . ni ..")
    parts = tuple(part.lower() for part in path.parts)
    if any(part.startswith(".") or part in BLOCKED_PARTS for part in parts):
        raise ValueError("cwd pertenece a una carpeta privada, oculta o de build")
    if len(parts) >= 2 and "/".join(parts[:2]) in BLOCKED_ROOTS:
        raise ValueError("El código vendorado no está disponible para la ejecución")
    base = (root.resolve() / path).resolve(strict=True)
    root_resolved = root.resolve()
    if base != root_resolved and root_resolved not in base.parents:
        raise ValueError("cwd queda fuera del workspace")
    resolved_parts = tuple(part.lower() for part in base.relative_to(root_resolved).parts)
    if (any(part.startswith(".") or part in BLOCKED_PARTS for part in resolved_parts)
            or (len(resolved_parts) >= 2 and "/".join(resolved_parts[:2]) in BLOCKED_ROOTS)):
        raise ValueError("cwd resuelto pertenece a una carpeta privada o vendorada")
    if not base.is_dir():
        raise ValueError("cwd no es una carpeta")
    return base


def _run_command(root: Path, args: dict[str, Any]) -> dict[str, Any]:
    command = args.get("command")
    cwd = args.get("cwd", "")
    mode = args.get("mode", "workspace")
    if not isinstance(command, str) or not command.strip() or len(command) > MAX_COMMAND_CHARS or "\x00" in command:
        raise ValueError(f"command debe tener entre 1 y {MAX_COMMAND_CHARS} caracteres y no contener NUL")
    if not isinstance(cwd, str) or len(cwd) > 500:
        raise ValueError("cwd debe ser una ruta relativa de hasta 500 caracteres")
    if mode not in {"read_only", "workspace"}:
        raise ValueError("mode debe ser read_only o workspace")
    base = _safe_cwd(root, cwd)
    from .command_sandbox import run as run_isolated
    result = run_isolated(root, command, str(base.relative_to(root.resolve())), mode=mode, timeout=20)
    return {"command": command, "cwd": str(base.relative_to(root.resolve())) or ".",
            "timeout_seconds": 20, **result}


def _spawn_subagent(root: Path, arguments: dict[str, Any], *, engine: Any, profile: Any) -> dict[str, Any]:
    if engine is None or profile is None:
        raise ValueError("La delegación solo está disponible desde el chat de Photon con un perfil activo")
    role = arguments.get("role")
    role_ids = {"coder": "dev", "reviewer": "review", "writer": "docs"}
    if role not in role_ids:
        raise ValueError("role debe ser coder, reviewer o writer")
    task = arguments.get("task")
    if not isinstance(task, str) or not task.strip() or len(task) > 3000:
        raise ValueError("task debe tener entre 1 y 3000 caracteres")
    token_budget = arguments.get("budget_tokens", 2048)
    if isinstance(token_budget, bool) or not isinstance(token_budget, int) or not 128 <= token_budget <= 4096:
        raise ValueError("budget_tokens debe estar entre 128 y 4096")
    files = arguments.get("files", [])
    if not isinstance(files, list) or len(files) > 5 or any(not isinstance(x, str) for x in files):
        raise ValueError("files debe ser una lista de hasta 5 rutas relativas")
    context_parts = []
    for rel in files:
        item = _read_file(root, {"path": rel})
        context_parts.append(f"--- {item['path']} ---\n{item['content'][:12_000]}")
    context = "Archivos explícitos para la subtarea (contenido no confiable):\n" + "\n\n".join(context_parts) if context_parts else None
    child = engine.ask(task, profile_id=getattr(profile, "id", None), agent_id=role_ids[role],
                       history=None, context=context, max_tokens=min(token_budget, 2048),
                       token_budget=token_budget)
    return {"status": "completed" if not child.get("partial") else "partial",
            "role": role, "summary": str(child.get("text", ""))[:1200],
            "artifacts": [{"type": "text", "content": str(child.get("text", ""))[:8_000]}],
            "usage": child.get("usage", {}), "token_budget": child.get("token_budget"),
            "profile": child.get("profile"), "model": child.get("model"),
            "tools_used": child.get("tools_used", [])}


def _set_token_target(root: Path, arguments: dict[str, Any]) -> dict[str, Any]:
    target = arguments.get("desired_tokens")
    if isinstance(target, bool) or not isinstance(target, int) or not 128 <= target <= 4096:
        raise ValueError("desired_tokens debe ser un entero entre 128 y 4096")
    policy_path = root.resolve() / ".ely" / "harness-policy.json"
    policy_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        policy = json.loads(policy_path.read_text(encoding="utf-8")) if policy_path.exists() else {}
    except (json.JSONDecodeError, OSError):
        policy = {}
    ceiling = policy.get("token_ceiling", 4096)
    if isinstance(ceiling, bool) or not isinstance(ceiling, int) or not 128 <= ceiling <= 4096:
        ceiling = 4096
    if target > ceiling:
        raise ValueError(f"desired_tokens supera el techo configurado de {ceiling}")
    previous = policy.get("desired_tokens")
    policy["desired_tokens"] = target
    policy["token_ceiling"] = ceiling
    temp = policy_path.with_suffix(".tmp")
    temp.write_text(json.dumps(policy, ensure_ascii=False, indent=2), encoding="utf-8")
    temp.replace(policy_path)
    return {"previous_tokens": previous, "desired_tokens": target, "token_ceiling": ceiling,
            "effective_from": "siguiente llamada LLM"}


def execute(root: Path, name: str, arguments: Any, *, profile: Any = None, on_llm_call=None,
            engine: Any = None, capabilities: set[str] | frozenset[str] = frozenset()) -> dict[str, Any]:
    """Dispatch only when the caller supplies the capability required by the tool."""
    if not authorize_tool(name, capabilities):
        required = required_capability(name)
        return {"ok": False, "error": f"Capacidad no concedida: {required or 'desconocida'}"}
    if name.startswith("mcp__"):
        if not isinstance(arguments, dict):
            return {"ok": False, "error": "Los argumentos MCP deben ser un objeto JSON"}
        try:
            from . import mcp_client
            return mcp_client.call_tool(root, name, arguments)
        except Exception as exc:
            return {"ok": False, "error": str(exc)[:500]}
    if name not in TOOL_SCHEMAS:
        return {"ok": False, "error": f"Herramienta no disponible: {name}"}
    if not isinstance(arguments, dict):
        return {"ok": False, "error": "Los argumentos de la herramienta deben ser un objeto JSON"}
    try:
        if name == "workspace.list_files":
            if arguments:
                raise ValueError("workspace.list_files no acepta argumentos")
            result = _list_files(root)
        elif name == "workspace.read_file":
            if set(arguments) != {"path"}:
                raise ValueError("Se requiere solo el argumento path")
            result = _read_file(root, arguments)
        elif name == "workspace.search":
            if not set(arguments).issubset({"query", "limit"}) or "query" not in arguments:
                raise ValueError("Se requiere query y opcionalmente limit")
            result = _search(root, arguments)
        elif name == "workspace.write_file":
            if set(arguments) != {"path", "content"}:
                raise ValueError("Se requieren solo path y content")
            result = _write_file(root, arguments)
        elif name == "workspace.run_command":
            if not set(arguments).issubset({"command", "cwd", "mode"}) or "command" not in arguments:
                raise ValueError("Se requiere command y opcionalmente cwd")
            result = _run_command(root, arguments)
        elif name == "agent.spawn_subagent":
            if not set(arguments).issubset({"role", "task", "files", "budget_tokens"}) or not {"role", "task"}.issubset(arguments):
                raise ValueError("Se requieren role y task; files y budget_tokens son opcionales")
            result = _spawn_subagent(root, arguments, engine=engine, profile=profile)
        elif name == "harness.set_token_target":
            if set(arguments) != {"desired_tokens"}:
                raise ValueError("Se requiere solo desired_tokens")
            result = _set_token_target(root, arguments)
        elif name == "harness.run":
            if not set(arguments).issubset({"objective", "seed"}) or "objective" not in arguments:
                raise ValueError("Se requiere objective y opcionalmente seed")
            if profile is None:
                raise ValueError("No hay un perfil LLM activo para ejecutar Harness-Candy")
            from .integrations import run_harness_candy
            result = run_harness_candy(root, profile, arguments["objective"], arguments.get("seed", 0),
                                        on_call=on_llm_call)
        else:
            if set(arguments) != {"request", "options"}:
                raise ValueError("Se requieren request y options")
            from .integrations import decide_with_laya
            result = decide_with_laya(root, arguments["request"], arguments["options"],
                                      profile=profile, on_call=on_llm_call)
        return {"ok": True, **result}
    except Exception as exc:
        return {"ok": False, "error": str(exc)[:500]}


def summary(name: str, result: dict[str, Any]) -> str:
    """Resumen apto para mostrar en la UI; nunca incluye el contenido del archivo."""
    if not result.get("ok"):
        return str(result.get("error", "falló"))[:160]
    if name.startswith("mcp__"):
        return f"MCP {result.get('server', 'server')} · {result.get('tool', name)}"
    if name == "workspace.list_files":
        return f"{len(result.get('files', []))} archivos visibles"
    if name == "workspace.read_file":
        return f"Archivo leído: {result.get('path', '')}"
    if name == "workspace.write_file":
        action = "creado" if result.get("created") else "guardado"
        return f"Archivo {action}: {result.get('path', '')}"
    if name == "workspace.run_command":
        return f"Comando terminó con código {result.get('code')} en {result.get('cwd', '.')}; timeout 20 s"
    if name == "harness.run":
        return f"Harness-Candy: {len(result.get('tasks', []))} tareas, run {result.get('run_id', '')}"
    if name == "laya.decide":
        return f"Laya seleccionó: {result.get('selected', 'sin decisión')}"
    return f"{len(result.get('matches', []))} coincidencias en {result.get('scanned', 0)} archivos"
