"""Motor de ejecución: perfiles + agentes + historial + telemetría real."""
from __future__ import annotations

import json
import time
import uuid
from pathlib import Path
from typing import Any, Iterator

from . import llm
from .agents import Agent, get_agent
from .config import ConfigError, Profile, get_profile, load_profiles, repo_root, state_dir
from .storage import ProfileStorage


def _now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


class Engine:
    def __init__(self, root: Path | None = None):
        self.root = root or repo_root()

    # ------------------------------------------------------------------ estado
    @property
    def state(self) -> Path:
        return state_dir(self.root)

    def _read_json(self, name: str, default: Any) -> Any:
        path = self.state / name
        if not path.is_file():
            return default
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            return default

    def _write_json(self, name: str, data: Any) -> None:
        path = self.state / name
        tmp = path.with_suffix(".tmp")
        tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        tmp.replace(path)

    # ------------------------------------------------------------------ perfiles
    def profile(self, profile_id: str | None = None) -> Profile:
        return get_profile(profile_id, self.root)

    def set_default_profile(self, profile_id: str) -> None:
        get_profile(profile_id, self.root)  # valida
        state = self._read_json("state.json", {})
        state["default_profile"] = profile_id
        self._write_json("state.json", state)

    # ------------------------------------------------------------------ chat
    def request_context(self, client_context: Any = None, use_memory: bool = False) -> str | None:
        """Combina el contexto que envía el frontend (p. ej. el archivo abierto
        en el IDE) con las notas de memoria. Antes el servidor descartaba el
        contexto del cliente; ahora ambos llegan al modelo como mensaje system.
        """
        parts: list[str] = []
        if isinstance(client_context, str) and client_context.strip():
            parts.append(client_context.strip())
        if use_memory:
            memory = self.build_context()
            if memory:
                parts.append(memory)
        return "\n\n".join(parts) or None

    def build_messages(
        self,
        prompt: str,
        *,
        agent: Agent | None = None,
        history: list[dict[str, str]] | None = None,
        context: str | None = None,
    ) -> list[dict[str, str]]:
        messages: list[dict[str, str]] = []
        if agent:
            messages.append({"role": "system", "content": agent.system})
        if context:
            messages.append({
                "role": "system",
                "content": "Contexto del proyecto proporcionado por el usuario:\n\n" + context,
            })
        for item in history or []:
            role = item.get("role")
            content = item.get("content")
            if role in ("user", "assistant", "system") and isinstance(content, str) and content.strip():
                messages.append({"role": role, "content": content})
        messages.append({"role": "user", "content": prompt})
        return messages

    def ask(
        self,
        prompt: str,
        *,
        profile_id: str | None = None,
        agent_id: str | None = None,
        history: list[dict[str, str]] | None = None,
        context: str | None = None,
        max_tokens: int | None = None,
        temperature: float | None = None,
    ) -> dict[str, Any]:
        profile = self.profile(profile_id)
        agent = get_agent(agent_id)
        overrides: dict[str, Any] = {}
        if max_tokens:
            overrides["max_tokens"] = max_tokens
        if temperature is not None:
            overrides["temperature"] = temperature
        messages = self.build_messages(prompt, agent=agent, history=history, context=context)
        result = llm.complete(profile, messages, **overrides)
        call_id = self.log_call(
            profile, agent, result.usage.as_dict(), "chat", ok=True, prompt=prompt,
            completion=result.text, model=result.model,
        )
        return {
            "id": call_id,
            "text": result.text,
            "model": result.model,
            "agent": agent.id,
            "profile": profile.id,
            "usage": result.usage.as_dict(),
            "created_at": _now(),
        }

    def stream(
        self,
        prompt: str,
        *,
        profile_id: str | None = None,
        agent_id: str | None = None,
        history: list[dict[str, str]] | None = None,
        context: str | None = None,
    ) -> Iterator[dict[str, Any]]:
        """Eventos: start | delta | usage | done | error."""
        profile = self.profile(profile_id)
        agent = get_agent(agent_id)
        messages = self.build_messages(prompt, agent=agent, history=history, context=context)
        yield {
            "type": "start",
            "profile": profile.id,
            "agent": agent.id,
            "model": profile.model,
            "endpoint": profile.endpoint(),
            "key": profile.masked_key,
            "test_key": bool(profile.api_key and profile.api_key.startswith("APikeyexample-")),
        }
        collected: list[str] = []
        usage: dict[str, int] = {}
        try:
            for event in llm.stream(profile, messages):
                if event["type"] == "delta":
                    collected.append(event["text"])
                    yield event
                elif event["type"] == "usage":
                    usage = event["usage"]
        except llm.LLMError as exc:
            self.log_call(
                profile, agent, {}, "chat", ok=False, prompt=prompt,
                error=str(exc), status=exc.status,
            )
            yield {
                "type": "error",
                "message": str(exc),
                "status": exc.status,
                "detail": exc.detail,
                "url": profile.endpoint(),
            }
            return
        text = "".join(collected)
        call_id = self.log_call(
            profile, agent, usage, "chat", ok=True, prompt=prompt, completion=text,
            model=profile.model,
        )
        yield {"type": "usage", "usage": usage}
        yield {"type": "done", "id": call_id, "text": text, "usage": usage}

    # ------------------------------------------------------------------ workflows
    def run_workflow(self, workflow_id: str, prompt: str, profile_id: str | None = None) -> dict[str, Any]:
        from .agents import workflows

        flow = next((w for w in workflows() if w["id"] == workflow_id), None)
        if flow is None:
            raise ConfigError(f"Workflow '{workflow_id}' no existe")
        profile = self.profile(profile_id)
        previous = ""
        steps: list[dict[str, Any]] = []
        for index, (agent_id, template) in enumerate(flow["chain"], start=1):
            agent = get_agent(agent_id)
            text = template.replace("{input}", prompt).replace("{prev}", previous or prompt)
            result = llm.complete(profile, self.build_messages(text, agent=agent))
            self.log_call(profile, agent, result.usage.as_dict(), f"workflow:{workflow_id}", ok=True,
                          prompt=text, completion=result.text, model=result.model)
            previous = result.text
            steps.append({
                "index": index,
                "agent": agent.id,
                "agent_name": agent.name,
                "text": result.text,
                "usage": result.usage.as_dict(),
            })
        return {"id": workflow_id, "name": flow["name"], "profile": profile.id, "steps": steps, "output": previous}

    # ------------------------------------------------------------------ telemetría
    def log_call(
        self,
        profile: Profile,
        agent: Agent | None,
        usage: dict[str, int],
        kind: str,
        *,
        ok: bool,
        prompt: str = "",
        completion: str = "",
        model: str | None = None,
        error: str = "",
        status: int | None = None,
    ) -> str:
        call_id = uuid.uuid4().hex[:12]
        entry = {
            "id": call_id,
            "at": _now(),
            "kind": kind,
            "profile": profile.id,
            "provider": profile.provider,
            "agent": agent.id if agent else None,
            "model": model or profile.model,
            "ok": ok,
            "status": status,
            "error": error,
            "usage": usage or {},
            "prompt_chars": len(prompt),
            "completion_chars": len(completion),
        }
        path = self.state / "usage.jsonl"
        with path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(entry, ensure_ascii=False) + "\n")
        return call_id

    def calls(self, limit: int = 200) -> list[dict[str, Any]]:
        path = self.state / "usage.jsonl"
        if not path.is_file():
            return []
        lines = path.read_text(encoding="utf-8").splitlines()[-limit:]
        out: list[dict[str, Any]] = []
        for line in lines:
            try:
                out.append(json.loads(line))
            except json.JSONDecodeError:
                continue
        return list(reversed(out))

    def stats(self) -> dict[str, Any]:
        calls = self.calls(limit=5000)
        by_profile: dict[str, dict[str, Any]] = {}
        total_tokens = 0
        failures = 0
        latencies: list[int] = []
        for call in calls:
            bucket = by_profile.setdefault(call.get("profile", "?"), {
                "calls": 0, "tokens": 0, "failures": 0, "last_at": None,
            })
            bucket["calls"] += 1
            tokens = int((call.get("usage") or {}).get("total_tokens") or 0)
            bucket["tokens"] += tokens
            total_tokens += tokens
            bucket["last_at"] = call.get("at")
            if not call.get("ok"):
                bucket["failures"] += 1
                failures += 1
            latency = int((call.get("usage") or {}).get("latency_ms") or 0)
            if latency:
                latencies.append(latency)
        return {
            "total_calls": len(calls),
            "total_tokens": total_tokens,
            "failures": failures,
            "success_rate": round((len(calls) - failures) / len(calls) * 100, 1) if calls else None,
            "avg_latency_ms": int(sum(latencies) / len(latencies)) if latencies else None,
            "by_profile": by_profile,
            "recent": calls[:25],
        }

    # ------------------------------------------------------------------ sesiones
    # Las conversaciones viven en `Local Storage/<perfil>/generado/`: cada perfil
    # (configuración de usuario) tiene su propia carpeta, de modo que lo que se
    # habla en el perfil A no aparece en el perfil B.
    def _storage(self, profile_id: str | None = None) -> ProfileStorage:
        return ProfileStorage(self.root, profile_id)

    def _adopt_legacy(self, storage: ProfileStorage) -> None:
        # Migra las sesiones globales antiguas solo al perfil por defecto.
        if storage.profile.id == self.profile().id:
            storage.migrate_legacy(self.state / "sessions.json")

    def sessions(self, profile_id: str | None = None) -> list[dict[str, Any]]:
        storage = self._storage(profile_id)
        self._adopt_legacy(storage)
        return storage.sessions()

    def save_session(self, session: dict[str, Any], profile_id: str | None = None) -> dict[str, Any]:
        pid = profile_id or session.get("profile")
        return self._storage(pid).save_session(session)

    def delete_session(self, session_id: str, profile_id: str | None = None) -> bool:
        return self._storage(profile_id).delete_session(session_id)

    # ------------------------------------------------------------------ local storage
    def storage_overview(self, profile_id: str | None = None) -> dict[str, Any]:
        storage = self._storage(profile_id)
        self._adopt_legacy(storage)
        return storage.overview()

    def planned_items(self, profile_id: str | None = None) -> list[dict[str, Any]]:
        return self._storage(profile_id).planned_items()

    def add_planned(self, title: str, note: str = "", profile_id: str | None = None) -> dict[str, Any]:
        return self._storage(profile_id).add_planned(title, note)

    def delete_planned(self, item_id: str, profile_id: str | None = None) -> bool:
        return self._storage(profile_id).delete_planned(item_id)

    # ------------------------------------------------------------------ memoria
    def memories(self) -> list[dict[str, Any]]:
        return self._read_json("memory.json", [])

    def build_context(self, limit: int = 20) -> str | None:
        """Contexto de proyecto a partir de la memoria persistente (vacío si no hay)."""
        items = self.memories()[:limit]
        if not items:
            return None
        lines = [f"- [{item.get('tag', 'general')}] {item.get('text', '')}" for item in items]
        return "Notas persistentes del proyecto:\n" + "\n".join(lines)

    def add_memory(self, text: str, tag: str = "general") -> dict[str, Any]:
        item = {"id": uuid.uuid4().hex[:8], "text": text.strip(), "tag": tag, "at": _now()}
        data = self.memories()
        data.insert(0, item)
        self._write_json("memory.json", data[:500])
        return item

    def delete_memory(self, memory_id: str) -> bool:
        data = self.memories()
        kept = [m for m in data if m.get("id") != memory_id]
        self._write_json("memory.json", kept)
        return len(kept) != len(data)

    # ------------------------------------------------------------------ skills
    def skills(self) -> list[dict[str, Any]]:
        return self._read_json("skills.json", [])

    def add_skill(self, data: dict[str, Any]) -> dict[str, Any]:
        name = str(data.get("name") or "").strip()
        if not name:
            raise ConfigError("La skill necesita un nombre")
        skill = {
            "id": uuid.uuid4().hex[:8],
            "name": name,
            "agent": str(data.get("agent") or "photon"),
            "instruction": str(data.get("instruction") or "").strip(),
            "tags": [t for t in (data.get("tags") or []) if isinstance(t, str)][:8],
            "workflow": data.get("workflow") or None,
            "scope": str(data.get("scope") or "proyecto"),
            "created_at": _now(),
            "runs": 0,
        }
        items = self.skills()
        items.insert(0, skill)
        self._write_json("skills.json", items[:200])
        return skill

    def delete_skill(self, skill_id: str) -> bool:
        items = self.skills()
        kept = [s for s in items if s.get("id") != skill_id]
        self._write_json("skills.json", kept)
        return len(kept) != len(items)

    def use_skill(self, skill_id: str, prompt: str, profile_id: str | None = None) -> dict[str, Any]:
        skill = next((s for s in self.skills() if s.get("id") == skill_id), None)
        if skill is None:
            raise ConfigError(f"Skill '{skill_id}' no existe")
        composed = (skill.get("instruction") or "").strip()
        full = f"{composed}\n\n---\n\n{prompt}" if composed else prompt
        result = self.ask(full, profile_id=profile_id, agent_id=skill.get("agent"))
        items = self.skills()
        for item in items:
            if item.get("id") == skill_id:
                item["runs"] = int(item.get("runs") or 0) + 1
                item["last_run"] = _now()
        self._write_json("skills.json", items)
        result["skill"] = skill_id
        return result

    # ------------------------------------------------------------------ jobs
    def jobs(self, limit: int = 100) -> list[dict[str, Any]]:
        out = []
        for call in self.calls(limit=1000):
            if str(call.get("kind", "")).startswith("workflow:"):
                out.append({
                    "id": call["id"],
                    "flow": str(call["kind"]).split(":", 1)[1],
                    "at": call["at"],
                    "profile": call.get("profile"),
                    "ok": call.get("ok"),
                    "tokens": int((call.get("usage") or {}).get("total_tokens") or 0),
                    "error": call.get("error"),
                })
            if len(out) >= limit:
                break
        return out

    # ------------------------------------------------------------------ pairing
    def pairing(self) -> dict[str, Any]:
        data = self._read_json("pairing.json", {})
        if not data.get("token"):
            data = self._new_pairing()
        return data

    def _new_pairing(self) -> dict[str, Any]:
        import secrets

        data = {
            "token": secrets.token_urlsafe(24),
            "created_at": _now(),
            "clients": self._read_json("pairing.json", {}).get("clients", []),
            "port": int(__import__("os").environ.get("PORT", 8765)),  # noqa: SIM108
        }
        self._write_json("pairing.json", data)
        return data

    def rotate_pairing(self) -> dict[str, Any]:
        current = self._read_json("pairing.json", {})
        data = self._new_pairing()
        data["clients"] = current.get("clients", [])
        self._write_json("pairing.json", data)
        return data

    # ------------------------------------------------------------------ costes
    def costs(self) -> dict[str, Any]:
        stats = self.stats()
        profiles = {p.id: p for p in load_profiles(self.root)}
        rows = []
        total_cost = 0.0
        for pid, bucket in stats["by_profile"].items():
            profile = profiles.get(pid)
            rates = (profile.extra.get("rates") if profile else None) or {}
            input_rate = float(rates.get("input_per_mtok", 0) or 0)
            output_rate = float(rates.get("output_per_mtok", 0) or 0)
            tokens = bucket["tokens"]
            # Reparto 70/30 si el proveedor no desglosa: se marca como estimación.
            cost = (tokens * 0.7 / 1_000_000) * input_rate + (tokens * 0.3 / 1_000_000) * output_rate
            total_cost += cost
            rows.append({
                "profile": pid,
                "provider": profile.provider if profile else "?",
                "model": profile.model if profile else "?",
                "calls": bucket["calls"],
                "tokens": tokens,
                "input_rate": input_rate,
                "output_rate": output_rate,
                "cost": round(cost, 6),
                "rate_configured": bool(rates),
            })
        rows.sort(key=lambda r: -r["cost"])
        return {
            "rows": rows,
            "total_cost": round(total_cost, 6),
            "currency": "USD",
            "total_tokens": stats["total_tokens"],
            "total_calls": stats["total_calls"],
            "note": "Los tokens son reales (usage del proveedor). El coste se calcula con "
                    "rates.input_per_mtok / rates.output_per_mtok de cada perfil; si no "
                    "están definidos el coste es 0.",
        }
