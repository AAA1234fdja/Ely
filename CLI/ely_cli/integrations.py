"""Adapters that connect Ely's chat runtime with Harness-Candy and Laya.

Both integrations are lazy: importing the HTTP server does not import optional
model stacks, download checkpoints, or make provider calls.
"""
from __future__ import annotations

import importlib
import json
import os
import sys
import threading
from pathlib import Path
from typing import Any

from . import llm

_LAYA_LOCK = threading.Lock()
_LAYA_ROUTER: Any = None
_LAYA_ERROR = ""


class _ProfileBackend:
    """Harness-Candy LLMBackend adapter over the active Ely chat profile."""

    def __init__(self, profile: Any, *, max_calls: int = 12, on_call=None):
        self.profile = profile
        self.max_calls = max_calls
        self.calls = 0
        self.last_usage: dict[str, Any] = {}
        self.on_call = on_call

    def complete(self, prompt: str, *, system: str = "", model: str = "", seed: int = 0) -> str:
        self.calls += 1
        if self.calls > self.max_calls:
            raise RuntimeError(f"Harness-Candy alcanzó el límite de {self.max_calls} llamadas al modelo")
        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})
        try:
            result = llm.complete(
                self.profile,
                messages,
                model=self.profile.model,
                temperature=self.profile.temperature,
                max_tokens=min(self.profile.max_tokens, 3000),
            )
        except llm.LLMError as exc:
            if self.on_call:
                self.on_call(self.profile, None, {}, "harness-candy", ok=False,
                             prompt=prompt, error=str(exc), status=exc.status)
            raise
        self.last_usage = result.usage.as_dict()
        if self.on_call:
            self.on_call(self.profile, None, self.last_usage, "harness-candy", ok=True,
                         prompt=prompt, completion=result.text, model=result.model)
        if "Eres ISA" in system:
            try:
                plan = json.loads(result.text)
                milestones = plan.get("hitos", [])
                if not isinstance(milestones, list) or len(milestones) > 8:
                    raise RuntimeError("plan ISA excede el límite de 8 tareas; usaré el plan heurístico")
                if any(len(str(item.get("instruction", ""))) > 1500 for item in milestones if isinstance(item, dict)):
                    raise RuntimeError("una instrucción ISA excede 1500 caracteres")
            except json.JSONDecodeError:
                pass  # ISA aplica su fallback heurístico si la respuesta no es JSON.
        return result.text


def _harness_package(root: Path):
    source = root / "Harness-Candy" / "src"
    if not (source / "harness_candy" / "__init__.py").is_file():
        raise RuntimeError("No se encontró Harness-Candy/src/harness_candy en este workspace")
    source_text = str(source)
    if source_text not in sys.path:
        sys.path.insert(0, source_text)
    return importlib.import_module("harness_candy")


def run_harness_candy(root: Path, profile: Any, objective: str, seed: int = 0, *, on_call=None) -> dict[str, Any]:
    """Run a bounded CoworkRunner using Ely's currently selected LLM profile."""
    objective = str(objective or "").strip()
    if not objective or len(objective) > 1500:
        raise ValueError("objective debe tener entre 1 y 1500 caracteres")
    if isinstance(seed, bool) or not isinstance(seed, int) or not 0 <= seed <= 2**31 - 1:
        raise ValueError("seed debe ser un entero entre 0 y 2^31-1")

    package = _harness_package(root)
    from harness_candy.factory import build_runner
    from harness_candy.harness import Budget, HarnessStore

    state = root / ".ely" / "harness-candy"
    backend = _ProfileBackend(profile, on_call=on_call)
    runner = build_runner(
        trace_dir=state / "traces",
        backend=backend,
        backend_kind="scripted",  # the bridge above, not factory defaults, calls the active profile
        store=HarnessStore(path=state / "harness-store.json"),
        budget=Budget(total=0.0, beta=0.0),  # avoid unbounded adaptation/probe spend by default
        max_concurrency=2,
        use_security_scan_agent=False,
        isa_backend=backend,
    )
    result = runner.run(objective, inputs={"root": str(root.resolve())}, seed=seed)
    tasks = []
    for task_id, node_result in result.dag_results.items():
        artifact = node_result.artifact
        text = artifact.to_text() if artifact is not None and hasattr(artifact, "to_text") else ""
        tasks.append({
            "task_id": task_id,
            "status": node_result.status,
            "attempts": node_result.attempts,
            "error": node_result.error,
            "artifact": text[:5_000],
            "wev": node_result.wev.to_dict() if node_result.wev else None,
        })
    return {
        "run_id": result.run_id,
        "objective": result.objetivo,
        "plan": result.plan,
        "tasks": tasks[:8],
        "quality_scores": result.qs,
        "audit": result.ely_audit,
        "metrics": result.metrics,
        "duration_seconds": round(result.duracion, 3),
        "trace_path": result.trace_path,
        "model_calls": backend.calls,
        "adaptation_budget": "disabled by default; no adaptation probes were run",
    }


def _laya_router(root: Path):
    global _LAYA_ROUTER, _LAYA_ERROR
    with _LAYA_LOCK:
        if _LAYA_ROUTER is not None:
            return _LAYA_ROUTER
        if _LAYA_ERROR:
            raise RuntimeError(_LAYA_ERROR)
        local_source = root / "laya-main" / "laya-main"
        if (local_source / "laya" / "__init__.py").is_file():
            source_text = str(local_source)
            if source_text not in sys.path:
                sys.path.insert(0, source_text)
        try:
            from laya import Router

            device = os.environ.get("ELY_LAYA_DEVICE", "").strip() or None
            _LAYA_ROUTER = Router(device=device, max_loaded=1)
        except Exception as exc:
            _LAYA_ERROR = (
                "No se pudo inicializar Laya. Instala sus dependencias de inferencia "
                "y revisa ELY_LAYA_DEVICE; detalle: " + str(exc)[:300]
            )
            raise RuntimeError(_LAYA_ERROR) from exc
        return _LAYA_ROUTER


def laya_status(root: Path) -> dict[str, Any]:
    local_source = root / "laya-main" / "laya-main"
    source_present = (local_source / "laya" / "router.py").is_file()
    try:
        import importlib.util
        installed = importlib.util.find_spec("laya") is not None
        missing = [name for name in ("torch", "transformers", "safetensors", "huggingface_hub")
                   if importlib.util.find_spec(name) is None]
    except (ImportError, ValueError):
        installed, missing = False, ["laya runtime dependencies"]
    return {
        "source_present": source_present,
        "package_installed": installed,
        "missing_runtime_dependencies": missing,
        "dependencies_ready": not missing,
        "router_loaded": _LAYA_ROUTER is not None,
        "load_error": _LAYA_ERROR or None,
        "model": os.environ.get("ELY_LAYA_MODEL", "typed-decisions"),
        "device": os.environ.get("ELY_LAYA_DEVICE") or "auto",
        "note": "La primera decisión carga el modelo Laya y puede descargar pesos; la inferencia es opcional.",
    }


def decide_with_laya(root: Path, request: str, options: dict[str, str], *, profile: Any = None, on_call=None) -> dict[str, Any]:
    """Choose among explicit alternatives with Laya's typed-decision checkpoint."""
    request = str(request or "").strip()
    if not request or len(request) > 3000:
        raise ValueError("request debe tener entre 1 y 3000 caracteres")
    if not isinstance(options, dict) or not 2 <= len(options) <= 8:
        raise ValueError("options debe incluir entre 2 y 8 alternativas")
    normalized: dict[str, str] = {}
    for label, description in options.items():
        if not isinstance(label, str) or not label.strip() or len(label) > 80:
            raise ValueError("cada alternativa necesita una etiqueta de hasta 80 caracteres")
        if not isinstance(description, str) or len(description) > 400:
            raise ValueError("cada descripción debe ser texto de hasta 400 caracteres")
        normalized[label] = description
    router = _laya_router(root)
    state = {"request": request, "alternatives": json.dumps(normalized, ensure_ascii=False)}
    questions = {
        "choice": {
            "type": "choice",
            "instructions": (
                "Which listed alternative best addresses the request in `request`, "
                "respecting its constraints? Select only an option from `alternatives`."
            ),
            "criteria": normalized,
        }
    }
    output = router.predict(
        state,
        questions,
        task="typed_decisions",
        model=os.environ.get("ELY_LAYA_MODEL", "typed-decisions"),
    )
    answer = (output.get("answers") or {}).get("choice") or {}
    selected = answer.get("choice")
    if selected not in normalized:
        return {
            "ok": False,
            "error": "Laya no devolvió una de las alternativas permitidas; no se eligió por defecto.",
            "raw_choice": str(selected)[:100],
        }
    if on_call and profile is not None:
        on_call(profile, None, {}, "laya-decision", ok=True, prompt=request,
                completion=str(selected), model=str(output.get("model") or "typed-decisions"))
    return {
        "ok": True,
        "selected": selected,
        "description": normalized[selected],
        "confidence": answer.get("answer_confidence", answer.get("confidence")),
        "probabilities": answer.get("probabilities", {}),
        "routing": output.get("routing", {}),
        "role": "decision support only; the conversational agent must explain alternatives to the user",
    }


def backend_status(root: Path) -> dict[str, Any]:
    from .mcp_client import status as mcp_status
    return {
        "chat_llm": {"integrated": True, "provider_configured_per_profile": True},
        "harness_candy": {
            "integrated": (root / "Harness-Candy" / "src" / "harness_candy" / "__init__.py").is_file(),
            "mode": "lazy CoworkRunner bridge using the selected Ely profile",
        },
        "laya": laya_status(root),
        "mcp": mcp_status(root),
    }
