"""Versioned, validated contracts for subagent delegation and results."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

CONTRACT_VERSION = "1.0"
ROLE_TO_AGENT = {"coder": "dev", "reviewer": "review", "writer": "docs"}
ARTIFACT_TYPES = frozenset({"text", "diff", "file", "report"})


@dataclass(frozen=True)
class SubagentRequest:
    role: str
    task: str
    files: tuple[str, ...] = ()
    budget_tokens: int = 2048
    version: str = CONTRACT_VERSION

    def __post_init__(self) -> None:
        if self.version != CONTRACT_VERSION:
            raise ValueError("Versión de contrato de entrada no compatible")
        if not isinstance(self.role, str) or self.role not in ROLE_TO_AGENT:
            raise ValueError("role debe ser coder, reviewer o writer")
        if not isinstance(self.task, str) or not self.task.strip() or len(self.task) > 3000:
            raise ValueError("task debe tener entre 1 y 3000 caracteres")
        if not isinstance(self.files, tuple) or len(self.files) > 5 or any(
                not isinstance(x, str) or len(x) > 500 for x in self.files):
            raise ValueError("files debe ser una tupla de hasta 5 rutas de texto")
        if isinstance(self.budget_tokens, bool) or not isinstance(self.budget_tokens, int) or not 128 <= self.budget_tokens <= 4096:
            raise ValueError("budget_tokens debe estar entre 128 y 4096")

    @classmethod
    def parse(cls, value: Any) -> "SubagentRequest":
        if not isinstance(value, dict):
            raise ValueError("El contrato de subtarea debe ser un objeto")
        allowed = {"role", "task", "files", "budget_tokens", "contract_version"}
        if set(value) - allowed:
            raise ValueError("El contrato de subtarea contiene campos no permitidos")
        if value.get("contract_version", CONTRACT_VERSION) != CONTRACT_VERSION:
            raise ValueError("Versión del contrato de subtarea no compatible")
        role = value.get("role")
        task = value.get("task")
        files = value.get("files", [])
        budget = value.get("budget_tokens", 2048)
        if not isinstance(role, str) or role not in ROLE_TO_AGENT:
            raise ValueError("role debe ser coder, reviewer o writer")
        if not isinstance(task, str) or not task.strip() or len(task) > 3000:
            raise ValueError("task debe tener entre 1 y 3000 caracteres")
        if not isinstance(files, list) or len(files) > 5 or any(not isinstance(x, str) or len(x) > 500 for x in files):
            raise ValueError("files debe ser una lista de hasta 5 rutas de texto")
        if isinstance(budget, bool) or not isinstance(budget, int) or not 128 <= budget <= 4096:
            raise ValueError("budget_tokens debe estar entre 128 y 4096")
        return cls(role=role, task=task.strip(), files=tuple(files), budget_tokens=budget)

    def to_dict(self) -> dict[str, Any]:
        return {"contract_version": self.version, "role": self.role, "task": self.task,
                "files": list(self.files), "budget_tokens": self.budget_tokens}


@dataclass(frozen=True)
class SubagentArtifact:
    type: str
    content: str
    name: str | None = None

    def __post_init__(self) -> None:
        if self.type not in ARTIFACT_TYPES:
            raise ValueError("Tipo de artifact desconocido")
        if not isinstance(self.content, str) or len(self.content) > 8_000:
            raise ValueError("El contenido del artifact debe ser texto de hasta 8000 caracteres")
        if self.name is not None and (not isinstance(self.name, str) or len(self.name) > 200):
            raise ValueError("name debe ser texto de hasta 200 caracteres")

    def to_dict(self) -> dict[str, Any]:
        result = {"type": self.type, "content": self.content}
        if self.name:
            result["name"] = self.name
        return result


@dataclass(frozen=True)
class SubagentResult:
    role: str
    status: str
    summary: str
    artifacts: tuple[SubagentArtifact, ...] = ()
    usage: dict[str, int] = field(default_factory=dict)
    token_budget: int = 0
    profile: str | None = None
    model: str | None = None
    tools_used: tuple[str, ...] = ()
    version: str = CONTRACT_VERSION

    def __post_init__(self) -> None:
        if self.version != CONTRACT_VERSION:
            raise ValueError("Versión de contrato de salida no compatible")
        if self.role not in ROLE_TO_AGENT:
            raise ValueError("role de resultado inválido")
        if self.status not in {"completed", "partial", "failed"}:
            raise ValueError("status debe ser completed, partial o failed")
        if not isinstance(self.summary, str) or len(self.summary) > 1200:
            raise ValueError("summary debe ser texto de hasta 1200 caracteres")
        if len(self.artifacts) > 5 or any(not isinstance(a, SubagentArtifact) for a in self.artifacts):
            raise ValueError("artifacts admite hasta cinco SubagentArtifact")
        if any(not isinstance(k, str) or isinstance(v, bool) or not isinstance(v, int) or v < 0
               for k, v in self.usage.items()):
            raise ValueError("usage solo admite contadores enteros no negativos")
        if isinstance(self.token_budget, bool) or not isinstance(self.token_budget, int) or self.token_budget < 0:
            raise ValueError("token_budget debe ser entero no negativo")
        if any(value is not None and (not isinstance(value, str) or len(value) > 200)
               for value in (self.profile, self.model)):
            raise ValueError("profile y model deben ser texto opcional de hasta 200 caracteres")
        if not isinstance(self.tools_used, tuple) or len(self.tools_used) > 32 or any(
                not isinstance(x, str) or len(x) > 200 for x in self.tools_used):
            raise ValueError("tools_used inválido")

    def to_dict(self) -> dict[str, Any]:
        return {
            "contract_version": self.version,
            "status": self.status,
            "role": self.role,
            "summary": self.summary,
            "artifacts": [item.to_dict() for item in self.artifacts],
            "usage": dict(self.usage),
            "token_budget": self.token_budget,
            "profile": self.profile,
            "model": self.model,
            "tools_used": list(self.tools_used),
        }
