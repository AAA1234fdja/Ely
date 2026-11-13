"""Runtime policy for Harness² chat and delegated agents.

The ordered quality ladder is supplied by the caller; it is never sorted by
label, so levels such as ``Xlow`` and ``xHight`` keep their configured order.
This layer chooses bounded generation effort, temperature, token budgets and a
quality-specific prompt adjustment for both main and child agents.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Sequence


@dataclass(frozen=True)
class RuntimeDecision:
    quality_level: str
    quality_index: int
    effort: str
    temperature: float
    max_tokens: int
    task_token_budget: int
    context_token_budget: int
    prompt_adjustment: str


_QUALITY_ADJUSTMENTS = (
    "Esfuerzo mínimo: resuelve directamente lo pedido, prioriza claridad y no añadas trabajo no solicitado.",
    "Esfuerzo acotado: inspecciona lo necesario y entrega una respuesta concisa con comprobaciones básicas.",
    "Esfuerzo estándar: planifica brevemente, verifica los puntos importantes y atiende los criterios de aceptación.",
    "Esfuerzo alto: contrasta alternativas relevantes, revisa casos límite y verifica los cambios con evidencia.",
    "Esfuerzo muy alto: revisa riesgos, compatibilidad y regresiones; ejecuta verificaciones pertinentes sin ampliar el alcance.",
    "Esfuerzo máximo: realiza una revisión exhaustiva y varias verificaciones útiles; conserva los criterios y límites de seguridad.",
    "Esfuerzo máximo reforzado: prioriza robustez, casos límite y evidencia reproducible; no expongas razonamiento privado ni excedas el alcance.",
)


class Harness2Runtime:
    """Select per-agent generation settings from the ordered quality ladder."""

    def __init__(self, ordered_levels: Sequence[dict]):
        self.levels = tuple(dict(item) for item in ordered_levels)
        if not self.levels or any(not isinstance(x.get("id"), str) for x in self.levels):
            raise ValueError("Harness² requiere niveles de calidad ordenados con id")
        ids = [x["id"] for x in self.levels]
        if len(ids) != len(set(ids)):
            raise ValueError("Los ids de calidad deben ser únicos")
        self._by_id = {item["id"]: (i, item) for i, item in enumerate(self.levels)}

    def decide(
        self,
        *,
        quality_level: str,
        agent_id: str,
        base_temperature: float,
        base_tokens: int,
        token_ceiling: int,
        requested_max_tokens: int | None = None,
        requested_temperature: float | None = None,
        requested_task_budget: int | None = None,
        is_subagent: bool = False,
    ) -> RuntimeDecision:
        try:
            index, level = self._by_id[quality_level]
        except KeyError as exc:
            raise ValueError(f"Nivel de calidad desconocido: {quality_level}") from exc

        if index <= 1:
            effort, temperature_scale, token_scale = "low", 1.0, 0.75
        elif index <= 3:
            effort, temperature_scale, token_scale = "medium", 0.85, 1.25
        else:
            effort, temperature_scale, token_scale = "high", 0.65, 1.75

        # Keep each agent's style, but reduce sampling variance as requested
        # quality rises. Clamp all values because profiles may be user-defined.
        base_temperature = float(base_temperature)
        if not math.isfinite(base_temperature):
            raise ValueError("La temperatura base debe ser finita")
        base_temperature = min(1.0, max(0.0, base_temperature))
        if requested_temperature is not None:
            if isinstance(requested_temperature, bool) or not math.isfinite(float(requested_temperature)):
                raise ValueError("La temperatura solicitada debe ser finita")
            temperature = round(min(1.0, max(0.0, float(requested_temperature))), 3)
        else:
            temperature = round(min(1.0, max(0.0, base_temperature * temperature_scale)), 3)
        for value, name in ((token_ceiling, "token_ceiling"), (base_tokens, "base_tokens")):
            if isinstance(value, bool) or not isinstance(value, int):
                raise ValueError(f"{name} debe ser entero")
        ceiling = min(4096, max(128, token_ceiling))
        base_tokens = min(ceiling, max(128, base_tokens))
        chosen_tokens = min(ceiling, max(128, int(round(base_tokens * token_scale))))
        if requested_max_tokens is not None:
            if isinstance(requested_max_tokens, bool) or not isinstance(requested_max_tokens, int):
                raise ValueError("max_tokens debe ser entero")
            chosen_tokens = min(ceiling, max(128, requested_max_tokens))
        task_budget = max(128, int(level.get("tokens", 4096)))
        if requested_task_budget is not None:
            if isinstance(requested_task_budget, bool) or not isinstance(requested_task_budget, int):
                raise ValueError("task_token_budget debe ser entero")
            task_budget = min(task_budget, max(128, requested_task_budget))
        # Delegates get a narrower generation allowance; their total task
        # budget is subsequently capped by the parent's remaining budget.
        if is_subagent:
            chosen_tokens = min(chosen_tokens, 2048)
            task_budget = min(task_budget, 4096)
        chosen_tokens = min(chosen_tokens, task_budget)
        context_budget = min(32_000, max(1_024, task_budget))
        adjustment = _QUALITY_ADJUSTMENTS[min(index, len(_QUALITY_ADJUSTMENTS) - 1)]
        return RuntimeDecision(
            quality_level=quality_level,
            quality_index=index,
            effort=effort,
            temperature=temperature,
            max_tokens=chosen_tokens,
            task_token_budget=task_budget,
            context_token_budget=context_budget,
            prompt_adjustment=(f"Política Harness² ({effort}; agente {agent_id}; "
                               f"calidad {quality_level}, orden {index + 1}/{len(self.levels)}): {adjustment}"),
        )
