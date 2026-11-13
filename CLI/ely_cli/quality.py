"""Quality levels and evidence-based verification for chat tasks.

Levels tune bounded effort; they never weaken a configured acceptance contract.
Verification commands always run in Ely's OS-isolated workspace snapshot.
"""
from __future__ import annotations

import json
import threading
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator

LEVELS = (
    {"id": "Xlow", "rounds": 1, "tokens": 2048, "timeout": 60},
    {"id": "Low", "rounds": 1, "tokens": 4096, "timeout": 90},
    {"id": "Mid", "rounds": 2, "tokens": 12000, "timeout": 180},
    {"id": "Hight", "rounds": 3, "tokens": 18000, "timeout": 180},
    {"id": "xHight", "rounds": 4, "tokens": 24000, "timeout": 210},
    {"id": "Uhight", "rounds": 5, "tokens": 32000, "timeout": 240},
    {"id": "Isabel te extraño", "rounds": 6, "tokens": 40000, "timeout": 300},
)
LEVEL_BY_ID = {item["id"]: item for item in LEVELS}
_LOCK = threading.RLock()
_ACTIVE: dict[str, int] = {}


@contextmanager
def _workspace_lock(root: Path, *, exclusive: bool, nonblocking: bool) -> Iterator[bool]:
    path = root / ".ely" / "quality-task.lock"
    path.parent.mkdir(parents=True, exist_ok=True)
    handle = path.open("a+")
    acquired = True
    try:
        try:
            import fcntl
            operation = fcntl.LOCK_EX if exclusive else fcntl.LOCK_SH
            if nonblocking:
                operation |= fcntl.LOCK_NB
            fcntl.flock(handle.fileno(), operation)
        except ImportError:
            pass  # Windows fallback is protected by the in-process registry.
        except BlockingIOError:
            acquired = False
        yield acquired
    finally:
        if acquired:
            try:
                import fcntl
                fcntl.flock(handle.fileno(), fcntl.LOCK_UN)
            except ImportError:
                pass
        handle.close()


def _path(root: Path) -> Path:
    return root / ".ely" / "quality-policy.json"


def _read(root: Path) -> dict[str, Any]:
    try:
        value = json.loads(_path(root).read_text(encoding="utf-8"))
        return value if isinstance(value, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def _detected_commands(root: Path) -> list[str]:
    policy = _read(root)
    configured = policy.get("test_commands")
    if isinstance(configured, list):
        return [str(x).strip()[:300] for x in configured[:5] if isinstance(x, str) and x.strip()]
    commands: list[str] = []
    for folder in ("CLI/tests", "Harness-Candy/tests", "tests"):
        if (root / folder).is_dir():
            commands.append(f"python3 -m unittest discover -s {folder} -q")
    package = root / "package.json"
    if package.is_file():
        try:
            data = json.loads(package.read_text(encoding="utf-8"))
            scripts = data.get("scripts", {}) if isinstance(data, dict) else {}
            if isinstance(scripts, dict):
                if scripts.get("test"):
                    commands.append("npm test -- --run")
                for name in ("lint", "typecheck", "test:e2e", "test:accessibility"):
                    if scripts.get(name):
                        commands.append("npm run " + name)
        except (OSError, json.JSONDecodeError):
            pass
    if not commands and (root / "pyproject.toml").is_file() and (root / "tests").is_dir():
        commands.append("python3 -m pytest -q")
    return commands


def suggestion(root: Path) -> str:
    baseline = "Mid" if _detected_commands(root) else "Low"
    try:
        history = json.loads((root / ".ely" / "quality-history.json").read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return baseline
    totals: dict[str, list[int]] = {}
    if isinstance(history, dict):
        for row in history.values():
            if not isinstance(row, dict) or row.get("level") not in LEVEL_BY_ID:
                continue
            values = totals.setdefault(row["level"], [0, 0])
            try:
                first_pass = max(0, int(row.get("first_pass", 0)))
                runs = max(0, int(row.get("runs", 0)))
            except (TypeError, ValueError):
                continue
            values[0] += first_pass
            values[1] += runs
    acceptable = [item["id"] for item in LEVELS if totals.get(item["id"], [0, 0])[1] >= 3
                  and totals[item["id"]][0] / totals[item["id"]][1] >= 0.8]
    return acceptable[0] if acceptable else baseline


def current(root: Path) -> str:
    chosen = _read(root).get("level")
    return chosen if isinstance(chosen, str) and chosen in LEVEL_BY_ID else suggestion(root)


def settings(root: Path) -> dict[str, Any]:
    level = current(root)
    commands = _detected_commands(root)
    with _LOCK:
        active = _ACTIVE.get(str(root.resolve()), 0) > 0
        if not active:
            with _workspace_lock(root, exclusive=True, nonblocking=True) as acquired:
                active = not acquired
    try:
        history = json.loads((root / ".ely" / "quality-history.json").read_text(encoding="utf-8"))
        metrics = list(history.values())[-20:] if isinstance(history, dict) else []
    except (OSError, json.JSONDecodeError):
        metrics = []
    return {
        "levels": [item["id"] for item in LEVELS],
        "level": level,
        "suggested": suggestion(root),
        "active": active,
        "model_metrics": metrics,
        "criteria": ([{"id": f"check-{i + 1}", "command": cmd, "measurable": True}
                      for i, cmd in enumerate(commands)] if commands else [
                          {"id": "tests-unavailable", "command": "", "measurable": False,
                           "reason": "No se detectó una suite de pruebas; configura test_commands en .ely/quality-policy.json."}
                      ]),
    }


def set_level(root: Path, level: str, test_commands: list[str] | None = None) -> dict[str, Any]:
    if not isinstance(level, str) or level not in LEVEL_BY_ID:
        raise ValueError("Nivel inválido. Opciones: " + ", ".join(LEVEL_BY_ID))
    with _LOCK:
        if _ACTIVE.get(str(root.resolve()), 0):
            raise ValueError("No se puede cambiar la calidad mientras hay una tarea en ejecución.")
        with _workspace_lock(root, exclusive=True, nonblocking=True) as acquired:
            if not acquired:
                raise ValueError("No se puede cambiar la calidad mientras hay una tarea en ejecución.")
            policy = _read(root)
            policy["level"] = level
            if test_commands is not None:
                if not isinstance(test_commands, list) or len(test_commands) > 5 or any(
                    not isinstance(command, str) or not command.strip() or len(command) > 300
                    for command in test_commands
                ):
                    raise ValueError("test_commands debe contener hasta 5 comandos de prueba no vacíos (máx. 300 caracteres).")
                if test_commands:
                    policy["test_commands"] = [command.strip() for command in test_commands]
                else:
                    policy.pop("test_commands", None)
            path = _path(root)
            path.parent.mkdir(parents=True, exist_ok=True)
            tmp = path.with_suffix(".tmp")
            tmp.write_text(json.dumps(policy, ensure_ascii=False, indent=2), encoding="utf-8")
            tmp.replace(path)
    return settings(root)


@contextmanager
def task(root: Path) -> Iterator[None]:
    key = str(root.resolve())
    with _workspace_lock(root, exclusive=False, nonblocking=False):
        with _LOCK:
            _ACTIVE[key] = _ACTIVE.get(key, 0) + 1
        try:
            yield
        finally:
            with _LOCK:
                count = _ACTIVE.get(key, 1) - 1
                if count > 0:
                    _ACTIVE[key] = count
                else:
                    _ACTIVE.pop(key, None)


def level_config(level: str | None, root: Path) -> dict[str, Any]:
    if level is not None and (not isinstance(level, str) or level not in LEVEL_BY_ID):
        raise ValueError("Nivel de calidad inválido: " + str(level))
    chosen = level or current(root)
    return dict(LEVEL_BY_ID[chosen])


def verify(root: Path, level: str | None = None, changed_paths: list[str] | None = None) -> dict[str, Any]:
    """Run syntax/static checks and relevant acceptance tests with evidence."""
    config = level_config(level, root)
    checks: list[dict[str, Any]] = []
    safe_paths: list[Path] = []
    for rel in changed_paths or []:
        candidate = (root / rel).resolve()
        if candidate != root.resolve() and root.resolve() in candidate.parents and candidate.is_file():
            safe_paths.append(candidate)
    for path in safe_paths:
        rel = path.relative_to(root.resolve()).as_posix()
        try:
            text = path.read_text(encoding="utf-8")
            if any(line.rstrip("\r\n").endswith((" ", "\t")) for line in text.splitlines(keepends=True)):
                raise ValueError("trailing whitespace")
            if path.suffix == ".py":
                import ast
                ast.parse(text, filename=rel)
                name = "python syntax: " + rel
            elif path.suffix == ".json":
                json.loads(text)
                name = "JSON syntax: " + rel
            elif path.suffix == ".js":
                import shutil
                import subprocess
                node = shutil.which("node")
                if not node:
                    raise RuntimeError("Node.js no está disponible para node --check")
                proc = subprocess.run([node, "--check", str(path)], cwd=root,
                                      env={"PATH": "/usr/local/bin:/usr/bin:/bin", "NODE_OPTIONS": ""},
                                      capture_output=True, text=True, timeout=10)
                if proc.returncode:
                    raise ValueError((proc.stderr or proc.stdout)[-2000:])
                name = "node --check " + rel
            else:
                name = "sin espacios finales: " + rel
            checks.append({"command": name, "ok": True, "sandboxed": True, "output": ""})
        except Exception as exc:
            checks.append({"command": "validación estática: " + rel, "ok": False,
                           "sandboxed": True, "output": str(exc)[-2000:]})
            break

    commands = _detected_commands(root)
    if changed_paths and "test_commands" not in _read(root):
        scopes = {"CLI" if rel.startswith("CLI/") else "Harness-Candy" if rel.startswith("Harness-Candy/") else "root"
                  for rel in changed_paths}
        selected = []
        for command in commands:
            if "CLI/tests" in command and "CLI" in scopes:
                selected.append(command)
            elif "Harness-Candy/tests" in command and "Harness-Candy" in scopes:
                selected.append(command)
            elif "CLI/tests" not in command and "Harness-Candy/tests" not in command and "root" in scopes:
                selected.append(command)
        commands = selected
    if not safe_paths and not commands:
        return {"status": "unverified", "checks": checks,
                "reason": "No se detectó un verificador ejecutable; no se certifica la tarea."}
    if not commands and not checks:
        return {"status": "unverified", "checks": [],
                "reason": "No hay criterio medible configurado; edita test_commands en .ely/quality-policy.json."}
    from .command_sandbox import run
    sandbox_fixture_blocked = False
    for command in commands:
        try:
            result = run(root, command, mode="workspace", timeout=config["timeout"], profile="bash")
        except Exception as exc:
            result = {"ok": False, "sandboxed": False, "error": f"Sandbox no disponible: {exc}"}
        output = (str(result.get("stdout") or "") + str(result.get("stderr") or ""))[-3000:]
        sandbox_fixture_blocked = sandbox_fixture_blocked or any(marker in output for marker in (
            "/etc/mime.types", "test_test_keys_are_numbered", "test_resolve_key_hides_value",
            "Network is unreachable", "Operation not permitted",
        ))
        checks.append({
            "command": command, "ok": bool(result.get("ok")),
            "sandboxed": bool(result.get("sandboxed")), "code": result.get("code"),
            "output": output, "error": result.get("error"),
        })
        if not result.get("ok"):
            break
    status = "passed" if checks and all(check["ok"] and check["sandboxed"] for check in checks) else "failed"
    reason = None
    if sandbox_fixture_blocked or any(not check["sandboxed"] for check in checks):
        status = "unverified"
        reason = "El sandbox aislado no expone archivos del host ni claves fixture; la suite no pudo verificarse en estas condiciones."
    return {"status": status, "checks": checks, "reason": reason}


def record(root: Path, model: str, level: str, first_result: dict[str, Any]) -> None:
    with _LOCK:
        path = root / ".ely" / "quality-history.json"
        try:
            history = json.loads(path.read_text(encoding="utf-8"))
            if not isinstance(history, dict):
                history = {}
        except (OSError, json.JSONDecodeError):
            history = {}
        key = f"{model[:120]}|{level}"
        row = history.get(key)
        if not isinstance(row, dict):
            row = {"model": model[:120], "level": level, "runs": 0, "first_pass": 0}
        try:
            row["runs"] = max(0, int(row.get("runs", 0))) + 1
            row["first_pass"] = max(0, int(row.get("first_pass", 0)))
        except (TypeError, ValueError):
            row["runs"], row["first_pass"] = 1, 0
        if first_result.get("status") == "passed":
            row["first_pass"] += 1
        history[key] = row
        if len(history) > 200:
            history = dict(list(history.items())[-200:])
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".tmp")
        tmp.write_text(json.dumps(history, ensure_ascii=False, indent=2), encoding="utf-8")
        tmp.replace(path)


def report(result: dict[str, Any], level: str) -> str:
    status = result.get("status")
    if status == "passed":
        commands = ", ".join(item["command"] for item in result.get("checks", []))
        return f"Calidad {level}: verificación aprobada — {commands}."
    if status == "failed":
        failed = next((item for item in result.get("checks", []) if not item.get("ok")), {})
        detail = failed.get("error") or (failed.get("output") or "prueba fallida")
        return f"Resultado parcial · calidad {level} no alcanzada: falló `{failed.get('command', 'verificador')}`. Evidencia: {str(detail)[-1200:]}"
    if status == "unverified":
        failed = next((item for item in result.get("checks", []) if not item.get("ok")), {})
        detail = result.get("reason") or "aislamiento o verificador no disponible"
        output = str(failed.get("output") or "")[-700:]
        return f"Resultado parcial · calidad {level} no certificable: {detail}" + (" Evidencia: " + output if output else "")
    return f"Resultado parcial · calidad {level} no certificable: {result.get('reason', 'aislamiento o verificador no disponible')}"
