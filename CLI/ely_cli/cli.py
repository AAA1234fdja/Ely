"""CLI de Ely Cowork.

    ely ask "texto"      una pregunta al perfil activo (streaming)
    ely test             prueba REAL de URL + API Key en los 11 perfiles
    ely profiles         lista perfiles, endpoint, clave enmascarada y origen
    ely serve            arranca el IDE (frontend + API)
    ely agents           agentes disponibles
    ely run <workflow>   ejecuta una rutina multi-agente
    ely chat             REPL interactivo
    ely logs / stats     telemetría real de las llamadas
    ely doctor           diagnóstico del entorno
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any

from . import __version__, extensions, llm, mcp, repos, quality
from .agents import AGENTS, get_agent, workflows
from .config import ConfigError, load_profiles, repo_root, resolve_key
from .engine import Engine

# --------------------------------------------------------------------- colores
NO_COLOR = bool(os.environ.get("NO_COLOR")) or not sys.stdout.isatty()


def c(text: Any, code: str) -> str:
    return str(text) if NO_COLOR else f"\033[{code}m{text}\033[0m"


def bold(t: Any) -> str:
    return c(t, "1")


def dim(t: Any) -> str:
    return c(t, "38;2;123;131;151")


# Colores tomados de la misma paleta que la interfaz (#34d399, #f87171,
# #fbbf24, #60a5fa, #8b9cff) convertidos a ANSI de 24 bits.
def green(t: Any) -> str:
    return c(t, "38;2;52;211;153")


def red(t: Any) -> str:
    return c(t, "38;2;248;113;113")


def yellow(t: Any) -> str:
    return c(t, "38;2;251;191;36")


def cyan(t: Any) -> str:
    return c(t, "38;2;96;165;250")


def violet(t: Any) -> str:
    return c(t, "38;2;139;156;255")


def ok(t: Any) -> str:
    return green("✓") + " " + str(t)


def bad(t: Any) -> str:
    return red("✗") + " " + str(t)


def warn(t: Any) -> str:
    return yellow("!") + " " + str(t)


def fail(message: str) -> int:
    print(bad(message))
    return 1


# --------------------------------------------------------------------- banner
BANNER = r"""
  ███████╗██╗  ██╗   ██╗
  ██╔════╝██║  ╚██╗ ██╔╝
  █████╗  ██║   ╚████╔╝
  ██╔══╝  ██║    ╚██╔╝
  ███████╗███████╗██║
  ╚══════╝╚══════╝╚═╝"""


def banner() -> None:
    print(violet(BANNER))
    print(dim(f"  Cowork Agent OS · v{__version__} · Photon Labs\n"))


# --------------------------------------------------------------------- comandos
def cmd_profiles(args: argparse.Namespace) -> int:
    engine = Engine()
    profiles = load_profiles(engine.root)
    if args.json:
        print(json.dumps([{**p.public(), **resolve_key(p.id, engine.root)} for p in profiles],
                         indent=2, ensure_ascii=False))
        return 0
    print(bold(f"\n  {len(profiles)} perfiles · {engine.root / 'profiles'}\n"))
    header = f"  {'':2} {'ID':<12} {'MODELO':<34} {'CLAVE':<20} {'ORIGEN':<22} ENDPOINT"
    print(dim(header))
    for index, profile in enumerate(profiles, start=1):
        info = resolve_key(profile.id, engine.root)
        key_txt = profile.masked_key or dim("sin clave")
        if info["is_test_key"]:
            key_txt = yellow(key_txt) + dim(" test")
        print(f"  {index:>2} {bold(profile.id):<21} {profile.model[:33]:<34} {key_txt:<28}"
              f"{dim(info['origin']):<31} {dim(profile.endpoint())}")
    print()
    print(dim("  Las claves son fixtures APikeyexample-n si el origen es profiles/test-keys.env."))
    print(dim("  Para claves reales: .ely/keys.env o variable de entorno del nombre indicado.\n"))
    return 0


def cmd_agents(args: argparse.Namespace) -> int:
    mcp_status = mcp.discover(Engine().root)
    print(bold("\n  Agentes de Ely Cowork\n"))
    for agent in AGENTS:
        print(f"  {cyan(agent.icon)} {bold(agent.name):<22} {dim(agent.id):<10} {agent.role}")
    print(dim(f"\n  MCPs: {mcp_status['status']} — {mcp_status['hint']}\n"))
    return 0


def cmd_quality(args: argparse.Namespace) -> int:
    engine = Engine()
    try:
        if args.test_command is not None or args.clear_test_commands:
            state = quality.set_level(engine.root, args.level or quality.current(engine.root),
                                      [] if args.clear_test_commands else args.test_command)
        elif args.level:
            state = quality.set_level(engine.root, args.level)
        else:
            state = quality.settings(engine.root)
    except ValueError as exc:
        return fail(str(exc))
    print(bold(f"\n  Calidad activa: {state['level']} · sugerida: {state['suggested']}"))
    print(dim("  Niveles: " + " · ".join(state["levels"])))
    print(dim("  Criterios ejecutables detectados:"))
    for item in state["criteria"]:
        print(dim("   ✓ " + (item.get("command") or item.get("reason", "sin criterio medible"))))
    if state.get("model_metrics"):
        print(dim("  Cumplimiento de primer intento por modelo/nivel: " + json.dumps(state["model_metrics"], ensure_ascii=False)))
    print()
    return 0


def cmd_test(args: argparse.Namespace) -> int:
    engine = Engine()
    profiles = load_profiles(engine.root)
    wanted = args.profile or args.profile_pos
    args.profile = wanted
    if wanted:
        profiles = [p for p in profiles if p.id == wanted]
        if not profiles:
            return fail(f"Perfil '{args.profile}' no encontrado")
    mode = args.mode
    print(bold(f"\n  Prueba de conectividad ({mode}) · {len(profiles)} perfil(es)\n"))
    header = f"  {'ID':<12} {'ESTADO':<16} {'HTTP':<6} {'MS':<7} {'URL'}"
    print(dim(header))
    print(dim("  " + "─" * 96))
    failures = 0
    results: list[dict[str, Any]] = []
    for profile in profiles:
        result = llm.probe(profile, mode=mode)
        results.append(result)
        engine.log_call(
            profile, None, result.get("usage") or {}, "probe",
            ok=bool(result.get("ok")), error=result.get("detail") if not result.get("ok") else "",
            status=result.get("status"),
        )
        if result["ok"]:
            state = green("✓ en línea")
        elif result.get("reachable"):
            failures += 1
            state = yellow("✓ auth rechazada")
        elif result.get("status") in (404, 405):
            failures += 1
            state = red(f"✗ HTTP {result['status']}")
        else:
            failures += 1
            state = red("✗ sin respuesta")
        status = result.get("status") or "—"
        latency = f"{result['latency_ms']}ms" if result.get("latency_ms") is not None else "—"
        print(f"  {profile.id:<12} {state:<25} {str(status):<6} {latency:<7} {dim(result.get('url', ''))}")
    print()
    if args.verbose or failures:
        print(bold("  Detalle de fallos\n"))
        for result in results:
            if result["ok"]:
                continue
            print(f"  {bold(result['profile'])} → {result['detail']}")
            print(dim(f"    url   : {result.get('url')}"))
            print(dim(f"    clave : {result.get('credential') or 'sin clave'}"))
            if result.get("hint"):
                print(dim(f"    nota  : {result['hint']}"))
            print()
    if args.json:
        print(json.dumps(results, indent=2, ensure_ascii=False))
    online = sum(1 for r in results if r["ok"])
    print(ok(f"{online} con respuesta completa válida · {failures} sin conexión completa"))
    print(dim("  Con las claves de prueba APikeyexample-n lo esperado es «auth rechazada»:"))
    print(dim("  el endpoint respondió 401/403, es decir, la URL y la cabecera llegan bien."))
    print(dim("  Para un ✓ completo añade una clave real en .ely/keys.env\n"))
    return 0 if failures < len(results) else 2


def cmd_ask(args: argparse.Namespace) -> int:
    engine = Engine()
    prompt = " ".join(args.prompt).strip()
    if not prompt and not sys.stdin.isatty():
        prompt = sys.stdin.read().strip()
    if not prompt:
        return fail("Falta el texto. Uso: ely ask \"tu pregunta\"")
    agent = get_agent(args.agent)
    active_quality = getattr(args, "quality", None) or quality.current(engine.root)
    if args.json or args.no_stream:
        result = engine.ask(
            prompt, profile_id=args.profile, agent_id=agent.id,
            max_tokens=args.max_tokens, temperature=args.temperature,
            context=engine.build_context() if args.memory else None,
            quality_level=getattr(args, "quality", None),
        )
        if args.json:
            print(json.dumps(result, indent=2, ensure_ascii=False))
        else:
            print(result["text"])
            if result.get("quality_report"):
                print(dim("\n  " + result["quality_report"]))
        return 0
    if not args.quiet:
        print(dim(f"  {agent.name} · perfil {args.profile or 'default'} · calidad {active_quality} · streaming\n"))
    for event in engine.stream(
        prompt, profile_id=args.profile, agent_id=agent.id,
        context=engine.build_context() if args.memory else None,
        quality_level=getattr(args, "quality", None),
    ):
        if event["type"] == "delta":
            sys.stdout.write(event["text"])
            sys.stdout.flush()
        elif event["type"] == "done":
            usage = event.get("usage") or {}
            if event.get("quality_report"):
                print(dim("\n  " + event["quality_report"]))
            print()
            if not args.quiet:
                print(dim(f"\n  {usage.get('total_tokens', 0)} tokens · "
                          f"{usage.get('latency_ms', 0)} ms · {event['id']}"))
        elif event["type"] == "error":
            print()
            print(bad(event["message"]))
            if event.get("detail"):
                print(dim(f"  detalle: {str(event['detail'])[:400]}"))
            print(dim(f"  url: {event.get('url')}"))
            return 1
    return 0


def _chat_session_id() -> str:
    import time
    import uuid
    return "s_" + uuid.uuid4().hex[:8] + format(int(time.time() * 1000), "x")[-4:]


def cmd_chat(args: argparse.Namespace) -> int:
    """REPL con memoria real: la conversación se guarda en Local Storage.

    El historial se comparte con la interfaz web porque ambos usan el mismo
    almacén por perfil y proyecto (``Local Storage/<perfil>/generado``).
    """
    engine = Engine()
    agent = get_agent(args.agent)
    agent_id = agent.id
    profile_id = args.profile
    project = getattr(args, "project", None) or "general"
    quality_level = quality.current(engine.root)

    projects = {p["id"]: p for p in engine.chat_projects(profile_id)}
    if project not in projects:
        engine.create_chat_project(project, "", profile_id)
        projects = {p["id"]: p for p in engine.chat_projects(profile_id)}

    existing = engine.sessions(profile_id, project)
    session: dict[str, Any] | None = None
    wanted = getattr(args, "session", None)
    if wanted:
        session = next((s for s in existing if s.get("id") == wanted), None)
        if session is None:
            return fail(f"No existe la conversación '{wanted}' en el proyecto '{project}'")
    elif existing and not getattr(args, "new", False):
        session = existing[0]          # retoma la más reciente del proyecto
    if session is None:
        session = {"id": _chat_session_id(), "project": project,
                   "title": "Nueva conversación", "messages": []}

    messages: list[dict[str, Any]] = list(session.get("messages") or [])
    history: list[dict[str, str]] = [
        {"role": m["role"], "content": m.get("content", "")}
        for m in messages if m.get("role") in ("user", "assistant")
    ]

    def persist() -> None:
        first = next((m for m in messages if m.get("role") == "user"), None)
        session["title"] = session.get("title") if session.get("title") not in (
            None, "", "Nueva conversación") else (first or {}).get("content", "Nueva conversación")[:70]
        session["messages"] = messages
        session["project"] = project
        engine.save_session(session, profile_id)

    banner()
    print(f"  Agente: {bold(agent.name)} · perfil: {bold(profile_id or 'default')} · proyecto: {bold(project)}")
    print(dim(f"  conversación: {session['id']} · {len(messages)} mensajes previos · calidad: {quality_level}"))
    print(dim("  /nuevo  /chats  /borrar <id>  /proyecto <id>  /proyectos  /agente <id>  /perfil <id>  /calidad [nivel]  /salir\n"))
    while True:
        try:
            line = input(violet("  ❯ ") if not NO_COLOR else "❯ ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            return 0
        if not line:
            continue
        if line in ("/salir", "/exit", "/quit"):
            persist()
            print(dim(f"  conversación guardada: {session['id']}"))
            return 0
        if line in ("/nuevo", "/limpiar"):
            persist()
            session = {"id": _chat_session_id(), "project": project,
                       "title": "Nueva conversación", "messages": []}
            messages = []
            history = []
            print(dim(f"  conversación nueva: {session['id']}"))
            continue
        if line == "/chats":
            rows = engine.sessions(profile_id, project)
            if not rows:
                print(dim("  (sin conversaciones en este proyecto)"))
            for s in rows[:20]:
                mark = "❯" if s.get("id") == session["id"] else " "
                print(f"  {mark} {s.get('id')}  {len(s.get('messages') or [])} msj  {s.get('title', '')[:50]}")
            continue
        if line.startswith("/borrar "):
            target = line.split(" ", 1)[1].strip()
            ok = engine.delete_session(target, profile_id)
            print(dim(f"  {'borrada' if ok else 'no encontrada'}: {target}"))
            if ok and target == session["id"]:
                session = {"id": _chat_session_id(), "project": project,
                           "title": "Nueva conversación", "messages": []}
                messages = []
                history = []
            continue
        if line == "/proyectos":
            for p in engine.chat_projects(profile_id):
                mark = "❯" if p["id"] == project else " "
                print(f"  {mark} {p['id']}  {p.get('name', '')}")
            continue
        if line.startswith("/proyecto "):
            persist()
            target = line.split(" ", 1)[1].strip()
            known = {p["id"] for p in engine.chat_projects(profile_id)}
            if target not in known:
                engine.create_chat_project(target, "", profile_id)
            project = target
            rows = engine.sessions(profile_id, project)
            session = rows[0] if rows else {"id": _chat_session_id(), "project": project,
                                            "title": "Nueva conversación", "messages": []}
            messages = list(session.get("messages") or [])
            history = [{"role": m["role"], "content": m.get("content", "")}
                       for m in messages if m.get("role") in ("user", "assistant")]
            print(dim(f"  proyecto → {project} · conversación {session['id']}"))
            continue
        if line.startswith("/agente "):
            agent_id = line.split(" ", 1)[1].strip()
            print(dim(f"  agente → {agent_id}"))
            continue
        if line == "/calidad" or line.startswith("/calidad "):
            requested = line.partition(" ")[2].strip()
            if not requested:
                state = quality.settings(engine.root)
                print(dim("  Nivel: " + quality_level + " · sugerido: " + state["suggested"]))
                print(dim("  Opciones: " + " · ".join(state["levels"])))
                for criterion in state["criteria"]:
                    print(dim("  Criterio: " + (criterion.get("command") or criterion.get("reason", "sin criterio"))))
                continue
            try:
                state = quality.set_level(engine.root, requested)
                quality_level = state["level"]
                print(dim(f"  calidad → {quality_level}"))
            except ValueError as exc:
                print(bad(str(exc)))
            continue
        if line.startswith("/perfil "):
            profile_id = line.split(" ", 1)[1].strip()
            print(dim(f"  perfil → {profile_id}"))
            continue
        print()
        import time as _t
        user_msg = {"role": "user", "content": line,
                    "sent_at": _t.strftime("%Y-%m-%dT%H:%M:%SZ", _t.gmtime())}
        messages.append(user_msg)
        history.append({"role": "user", "content": line})
        persist()          # se guarda aunque la respuesta falle
        answer: list[str] = []
        error_msg = ""
        quality_result = None
        quality_report = ""
        try:
            for event in engine.stream(
                line, profile_id=profile_id, agent_id=agent_id, history=history[-13:-1],
                context=engine.build_context() if args.memory else None,
                quality_level=quality_level,
            ):
                if event["type"] == "delta":
                    answer.append(event["text"])
                    sys.stdout.write(event["text"])
                    sys.stdout.flush()
                elif event["type"] == "error":
                    error_msg = event["message"]
                    print(bad(event["message"]))
                    if event.get("detail"):
                        print(dim(str(event["detail"])[:400]))
                    break
                elif event["type"] == "done":
                    usage = event.get("usage") or {}
                    quality_result = event.get("quality")
                    quality_report = event.get("quality_report") or ""
                    if quality_report:
                        print(dim("\n  " + event["quality_report"]))
                    print(dim(f"\n  [{usage.get('total_tokens', 0)} tokens]"))
        except KeyboardInterrupt:
            print(dim("\n  cancelado"))
        text = "".join(answer)
        assistant_msg: dict[str, Any] = {"role": "assistant", "content": text,
                                         "meta": {"quality": {"status": quality_result.get("status")} if quality_result else None,
                                                  "qualityReport": quality_report}}
        if error_msg:
            assistant_msg["error"] = error_msg
        messages.append(assistant_msg)
        if text:
            history.append({"role": "assistant", "content": text})
        persist()
        print()


def cmd_chats(args: argparse.Namespace) -> int:
    """Lista o borra conversaciones guardadas (mismo almacén que la web)."""
    engine = Engine()
    if args.clear:
        n = engine.clear_sessions(args.profile, args.project)
        print(ok(f"{n} conversaciones borradas"))
        return 0
    if args.delete:
        deleted = engine.delete_session(args.delete, args.profile)
        return 0 if deleted else fail(f"No existe la conversación '{args.delete}'")
    rows = engine.sessions(args.profile, args.project)
    if not rows:
        print(dim("  (sin conversaciones guardadas)"))
        return 0
    print(bold(f"  {len(rows)} conversaciones" + (f" · proyecto {args.project}" if args.project else "")))
    for s in rows:
        print(f"  {s.get('id')}  [{s.get('project', 'general')}]  "
              f"{len(s.get('messages') or [])} msj  {s.get('title', '')[:60]}")
    print(dim("\n  ely chat --session <id>   retomar · ely chats --delete <id>   borrar"))
    return 0


def cmd_projects(args: argparse.Namespace) -> int:
    """Proyectos de chat: agrupan conversaciones y se comparten con la web."""
    engine = Engine()
    if args.create:
        p = engine.create_chat_project(args.create, "", args.profile)
        print(ok(f"proyecto creado: {p['id']}"))
        return 0
    if args.delete:
        return 0 if engine.delete_chat_project(args.delete, args.profile) else fail("Proyecto no encontrado")
    counts: dict[str, int] = {}
    for s in engine.sessions(args.profile):
        counts[s.get("project", "general")] = counts.get(s.get("project", "general"), 0) + 1
    for p in engine.chat_projects(args.profile):
        print(f"  {p['id']:<20} {counts.get(p['id'], 0):>3} chats  {p.get('name', '')}")
    return 0


def cmd_run(args: argparse.Namespace) -> int:
    engine = Engine()
    prompt = " ".join(args.prompt).strip()
    if not prompt:
        return fail("Falta el input del workflow")
    flow = next((w for w in workflows() if w["id"] == args.workflow), None)
    if flow is None:
        return fail(f"Workflow '{args.workflow}' no existe. Opciones: " +
                    ", ".join(w["id"] for w in workflows()))
    print(bold(f"\n  {flow['icon']} {flow['name']} · {len(flow['chain'])} pasos\n"))
    try:
        result = engine.run_workflow(args.workflow, prompt, args.profile)
    except llm.LLMError as exc:
        return fail(f"Falló el workflow: {exc}")
    for step in result["steps"]:
        print(f"  {cyan(str(step['index']) + '/')} {bold(step['agent_name'])} {dim(step['agent'])}")
        print("  " + step["text"].replace("\n", "\n  ").strip())
        print()
    return 0


def cmd_stats(args: argparse.Namespace) -> int:
    engine = Engine()
    stats = engine.stats()
    if args.json:
        print(json.dumps(stats, indent=2, ensure_ascii=False))
        return 0
    print(bold("\n  Telemetría de llamadas\n"))
    print(f"  llamadas      : {stats['total_calls']}")
    print(f"  tokens        : {stats['total_tokens']}")
    print(f"  fallos        : {stats['failures']}")
    print(f"  éxito         : {stats['success_rate'] if stats['success_rate'] is not None else '—'}%")
    print(f"  latencia media: {stats['avg_latency_ms'] or '—'} ms")
    if stats["by_profile"]:
        print(bold("\n  Por perfil\n"))
        for pid, bucket in stats["by_profile"].items():
            print(f"  {pid:<12} {bucket['calls']:>4} llamadas  {bucket['tokens']:>8} tokens  "
                  f"{bucket['failures']:>3} fallos")
    print()
    return 0


def cmd_logs(args: argparse.Namespace) -> int:
    for call in Engine().calls(args.limit):
        flag = green("ok  ") if call.get("ok") else red("fail")
        print(f"  {call['at']}  {flag}  {call['profile']:<12} {call['kind']:<16} "
              f"{str(call.get('model'))[:28]:<29} {dim(str(call.get('error') or ''))[:60]}")
    return 0


def cmd_workflows(args: argparse.Namespace) -> int:
    print(bold("\n  Workflows\n"))
    for flow in workflows():
        agents = " → ".join(flow["agents"])
        print(f"  {cyan(flow['icon'])} {bold(flow['id']):<10} {flow['name']:<24} {dim(agents)}")
        print(dim(f"     {flow['desc']}"))
    print()
    return 0


def cmd_mcp(args: argparse.Namespace) -> int:
    status = mcp.discover(Engine().root)
    print(bold("\n  Backend MCPs/\n"))
    print(f"  estado   : {status['status']}")
    print(f"  carpeta  : {status['dir'] or '(no existe)'}")
    print(f"  nota     : {status['hint']}")
    if status["manifests"]:
        print("\n  manifiestos:")
        for item in status["manifests"]:
            print(f"    · {item}")
    if status["servers"]:
        print("\n  servidores:")
        for server in status["servers"]:
            print(f"    · {server['id']:<16} {server['transport']:<6} {server['target']}")
    print()
    return 0


def cmd_memory(args: argparse.Namespace) -> int:
    engine = Engine()
    if args.add:
        item = engine.add_memory(" ".join(args.add), args.tag)
        print(ok(f"guardado [{item['tag']}] {item['text']}"))
        return 0
    if args.remove:
        print(ok("borrado") if engine.delete_memory(args.remove) else bad("no existe"))
        return 0
    items = engine.memories()
    if not items:
        print(dim("  (memoria vacía — usa `ely memory --add \"nota\"`)"))
        return 0
    print(bold(f"\n  {len(items)} notas\n"))
    for item in items:
        print(f"  {dim(item['at'])} {cyan(item['id'])} {dim('[' + item['tag'] + ']')} {item['text']}")
    print()
    return 0


def cmd_doctor(args: argparse.Namespace) -> int:
    root = repo_root()
    print(bold("\n  Diagnóstico de Ely Cowork\n"))
    checks: list[tuple[bool, str, str]] = []
    checks.append((True, f"Python {sys.version.split()[0]}", "requerido"))
    checks.append(((root / "CLI").is_dir(), "CLI/", "código de la CLI y del servidor"))
    checks.append(((root / "IDE" / "frontend" / "index.html").is_file(), "IDE/frontend/index.html",
                   "interfaz web"))
    harness_dir = next((root / name for name in ("Harness", "Harness-Candy") if (root / name).is_dir()), None)
    harness_label = (harness_dir.name + "/") if harness_dir else "Harness/"
    checks.append((harness_dir is not None, harness_label, "backend de rutinas (solo lectura)"))
    checks.append(((root / "MCPs").is_dir(), "MCPs/", "backend de herramientas (solo lectura)"))
    if harness_dir is not None and not any(harness_dir.iterdir()):
        checks[-2] = (True, harness_label, "existe pero vacío — Ely no lo simula")
    if (root / "MCPs").is_dir() and not any((root / "MCPs").iterdir()):
        checks[-1] = (True, "MCPs/", "existe pero vacío — Ely no lo simula")
    profiles = load_profiles(root)
    checks.append((len(profiles) == 11, f"profiles/ ({len(profiles)} perfiles)", "11 configurados"))
    with_key = [p for p in profiles if p.has_key]
    checks.append((len(with_key) == len(profiles), f"claves ({len(with_key)}/{len(profiles)})",
                   "fixtures APikeyexample-n"))
    for success, name, note in checks:
        print(f"  {(green('✓') if success else red('✗'))} {name:<32} {dim(note)}")
    print()
    print(dim("  Ejecuta `ely test` para verificar URL + API Key contra los proveedores reales.\n"))
    return 0


def cmd_extensions(args: argparse.Namespace) -> int:
    """Extensiones del IDE: instalar, activar y probar la salida de red."""
    root = Engine().root
    action = args.action
    try:
        if action == "list":
            items = extensions.list_extensions(root)
            if args.json:
                print(json.dumps(items, indent=2, ensure_ascii=False))
                return 0
            if not items:
                print(dim("  (no hay extensiones — usa `ely extensions install owner/repo`)"))
                return 0
            print(bold(f"\n  {len(items)} extensión(es)\n"))
            for item in items:
                mark = green("●") if item.get("enabled") else dim("○")
                origin = dim("incluida") if item.get("builtin") else dim("instalada")
                print(f"  {mark} {cyan(item['id']):<34} {item['version']:<9} {origin}  {dim(item.get('name') or '')}")
                perms = ", ".join(item.get("permissions") or []) or "sin permisos"
                print(dim(f"      permisos: {perms}"))
            print()
            return 0

        if action == "install":
            if not args.reference:
                return fail("Falta el origen: ely extensions install owner/repo | npm:paquete | URL | ruta")
            print(bold(f"\n  Instalando {args.reference}\n"))
            result = extensions.install(root, args.reference)
            ext = result.get("extension") or {}
            print(green(f"  ✓ {ext.get('name')} {ext.get('version')}"))
            print(dim(f"    id: {ext.get('id')}"))
            print(dim(f"    permisos: {', '.join(ext.get('permissions') or []) or 'ninguno'}"))
            print(dim(f"    archivos: {result.get('files', '—')}"))
            print()
            return 0

        if action in ("enable", "disable"):
            if not args.reference:
                return fail(f"Falta el id: ely extensions {action} mi.extension")
            result = extensions.set_enabled(root, args.reference, action == "enable")
            ext = result.get("extension") or {}
            print(green(f"  ✓ {ext.get('id')} · {'activada' if action == 'enable' else 'desactivada'}"))
            return 0

        if action == "uninstall":
            if not args.reference:
                return fail("Falta el id: ely extensions uninstall mi.extension")
            extensions.uninstall(root, args.reference)
            print(green(f"  ✓ desinstalada: {args.reference}"))
            return 0

        if action == "info":
            if not args.reference:
                return fail("Falta el id: ely extensions info mi.extension")
            folder, manifest = extensions.find(root, args.reference)
            if args.json:
                print(json.dumps(manifest, indent=2, ensure_ascii=False))
                return 0
            print(bold(f"\n  {manifest['name']} {manifest['version']}\n"))
            print(f"  id:        {manifest['id']}")
            print(f"  editor:    {manifest.get('publisher') or '—'}")
            print(f"  main:      {manifest.get('main') or '—'}")
            print(f"  carpeta:   {folder}")
            print(f"  permisos:  {', '.join(manifest.get('permissions') or []) or 'ninguno'}")
            hosts = sorted(extensions.network_hosts(manifest))
            print(f"  red:       {', '.join(hosts) if hosts else dim('sin salida de red')}")
            print(dim(f"\n  {manifest.get('description') or ''}\n"))
            return 0

        if action == "fetch":
            if not args.reference or not args.query:
                return fail("Uso: ely extensions fetch <id> <url>")
            result = extensions.fetch(root, args.reference, args.query)
            if args.json:
                print(json.dumps(result, indent=2, ensure_ascii=False))
                return 0
            status = result.get("status")
            print(bold(f"\n  HTTP {status} · {result.get('ms')} ms · {len(result.get('text') or '')} bytes\n"))
            print((result.get("text") or "")[:2000])
            print()
            return 0
    except extensions.ExtensionError as exc:
        print(bad(str(exc)))
        if exc.detail:
            print(dim(f"  detalle: {str(exc.detail)[:300]}"))
        return 1
    return fail(f"Acción desconocida: {action}")


def cmd_repo(args: argparse.Namespace) -> int:
    """Descarga un repositorio Git real para abrirlo en el IDE."""
    if args.action == "list":
        items = repos.list_repos(Engine().root)
        if args.json:
            print(json.dumps(items, indent=2, ensure_ascii=False))
            return 0
        if not items:
            print(dim("  (no hay repositorios importados — usa `ely repo add microsoft/vscode`)"))
            return 0
        print(bold(f"\n  {len(items)} repositorio(s) en .ely/repos\n"))
        for item in items:
            print(f"  {cyan(item['slug']):<40} {item['files']:>6} archivos  "
                  f"{dim(UI_bytes(item['bytes'])):>10}  {dim(item['label'])}")
        print()
        print(dim("  Abre cualquiera con: ely repo serve <slug> --port 8790"))
        print(dim("  …y en el IDE cambia «Workspace» a «Repo: <slug>» con la URL http://localhost:8790"))
        print()
        return 0

    if args.action == "add":
        if not args.reference:
            return fail("Falta la referencia: ely repo add microsoft/vscode")
        last = [0]

        def progress(done: int, total: int) -> None:
            step = 5 * 1024 * 1024
            if done - last[0] < step and (not total or done < total):
                return
            last[0] = done
            pct = f" ({done * 100 // total}%)" if total else ""
            sys.stderr.write(f"\r  descargando {UI_bytes(done)}{pct}" + " " * 12)
            sys.stderr.flush()

        print(bold(f"\n  Importando {args.reference}\n"))
        try:
            meta = repos.add(Engine().root, args.reference, progress=progress)
        except repos.RepoError as exc:
            sys.stderr.write("\r" + " " * 60 + "\r")
            print(bad(str(exc)))
            if exc.detail:
                print(dim(f"  detalle: {str(exc.detail)[:300]}"))
            if exc.status == 413:
                print(dim("  Sube el límite con ELY_REPO_MAX_DOWNLOAD / ELY_REPO_MAX_FILES / ELY_REPO_MAX_BYTES."))
            return 1
        sys.stderr.write("\r" + " " * 60 + "\r")
        print(ok(f"{meta['label']} → {meta['slug']}"))
        print(f"  archivos : {meta['files']}")
        print(f"  tamaño   : {UI_bytes(meta['bytes'])} (descargado {UI_bytes(meta['downloaded_bytes'])})")
        print(f"  url      : {dim(meta['url'])}")
        print()
        print(dim(f"  Ábrelo en el IDE con: ely repo serve {meta['slug']} --port 8790"))
        print()
        return 0

    if args.action == "remove":
        slug = args.reference or args.slug
        if not slug:
            return fail("Indica el slug: ely repo remove microsoft__vscode")
        try:
            result = repos.remove(Engine().root, slug)
        except repos.RepoError as exc:
            return fail(str(exc))
        return ok_logged(f"eliminado {slug} ({UI_bytes(result['freed_bytes'])} liberados)")

    if args.action == "tree":
        slug = args.reference or args.slug
        if not slug:
            return fail("Indica el slug")
        try:
            data = repos.tree(Engine().root, slug, depth=args.depth)
        except repos.RepoError as exc:
            return fail(str(exc))
        for entry in data["entries"][: args.limit]:
            depth = entry["path"].count("/")
            icon = "▸" if entry["type"] == "dir" else " "
            print("  " + "  " * depth + f"{icon} {entry['path'].split('/')[-1]}"
                  + ("" if entry["type"] == "dir" else dim(f"  {UI_bytes(entry['size'])}")))
        if data["truncated"]:
            print(dim("  … (árbol truncado)"))
        return 0

    if args.action == "search":
        slug, query = args.reference, args.slug
        if not slug or not query:
            return fail("Uso: ely repo search <slug> <texto>")
        try:
            data = repos.search(Engine().root, slug, query)
        except repos.RepoError as exc:
            return fail(str(exc))
        print(bold(f"\n  {len(data['hits'])} coincidencias de «{data['query']}» "
                   f"en {data['scanned_files']} archivos\n"))
        for hit in data["hits"]:
            print(f"  {cyan(hit['path'] + ':' + str(hit['line']))}")
            print(dim(f"    {hit['text']}"))
        print()
        return 0

    if args.action == "serve":
        import shutil
        import subprocess

        slug = args.reference or args.slug
        if not slug:
            return fail("Indica el slug del repositorio")
        try:
            base, meta = repos.get_repo(Engine().root, slug)
        except repos.RepoError as exc:
            return fail(str(exc))
        node = shutil.which("node")
        if not node:
            return fail("Node.js no está instalado (https://nodejs.org)")
        script = Path(__file__).resolve().parents[1] / "bin" / "ely.js"
        cmd = [node, str(script), "ide", str(base), "--port", str(args.port)]
        print(dim("  " + " ".join(cmd)))
        print(bold(f"  {meta['label']} — {meta['files']} archivos"))
        print(f"  Abre http://localhost:{args.port} y en el IDE elige «Repo: {slug}»")
        try:
            return subprocess.call(cmd)
        except KeyboardInterrupt:
            return 0

    return fail(f"Acción desconocida: {args.action}")


def UI_bytes(value: Any) -> str:
    size = float(value or 0)
    for unit in ("B", "KB", "MB", "GB"):
        if size < 1024 or unit == "GB":
            return f"{size:.1f} {unit}" if unit != "B" else f"{int(size)} B"
        size /= 1024
    return f"{size:.1f} GB"


def ok_logged(message: str) -> int:
    print(ok(message))
    return 0


def cmd_routes(args: argparse.Namespace) -> int:
    from . import routes

    if args.json:
        print(json.dumps(routes.NAV, indent=2, ensure_ascii=False))
        return 0
    for group in routes.NAV:
        print(bold(f"\n  {group['group']}"))
        for item in group["items"]:
            print(f"   {cyan(item.get('icon', '·'))} {item['label']:<18} {dim('#' + item['id']):<16} {item.get('desc', '')}")
    print()
    return 0


def cmd_serve_node(args: argparse.Namespace) -> int:
    """Delega en el lanzador Node (estático + proxy + backend Python)."""
    import shutil
    import subprocess

    node = shutil.which("node")
    if not node:
        return fail("Node.js no está instalado (https://nodejs.org)")
    script = Path(__file__).resolve().parents[1] / "bin" / "ely.js"
    if not script.is_file():
        return fail(f"No se encontró {script}")
    cmd = [node, str(script), "serve", "--port", str(args.port)]
    print(dim("  " + " ".join(cmd)))
    try:
        return subprocess.call(cmd)
    except KeyboardInterrupt:
        return 0


def cmd_serve(args: argparse.Namespace) -> int:
    from .server import serve

    serve(host=args.host, port=args.port, root=Engine().root)
    return 0


# --------------------------------------------------------------------- parser
def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="ely",
        description="Ely Cowork — Agent OS. CLI + IDE con API real por URL y API Key.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "ejemplos:\n"
            "  ely test                 prueba las 11 API keys contra sus endpoints\n"
            "  ely test -p groq -v      detalle de un perfil\n"
            "  ely ask \"refactoriza esto\" -a dev\n"
            "  ely serve --port 8765    abre el IDE\n"
        ),
    )
    parser.add_argument("-v", "--version", action="version", version=f"Ely Cowork {__version__}")
    parser.add_argument("--json", action="store_true", help="salida en JSON")
    sub = parser.add_subparsers(dest="command", metavar="comando")

    p = sub.add_parser("profiles", help="lista perfiles y claves enmascaradas")
    p.add_argument("--json", action="store_true")
    p.set_defaults(func=cmd_profiles)

    p = sub.add_parser("agents", help="lista agentes")
    p.set_defaults(func=cmd_agents)

    p = sub.add_parser("quality", help="consulta o cambia el nivel y sus verificadores")
    p.add_argument("level", nargs="?", choices=tuple(quality.LEVEL_BY_ID))
    p.add_argument("--test-command", action="append", help="añade comando de aceptación ejecutable en sandbox (repetible)")
    p.add_argument("--clear-test-commands", action="store_true", help="elimina comandos personalizados y vuelve a autodetectar")
    p.set_defaults(func=cmd_quality)

    p = sub.add_parser("test", help="prueba real de URL + API Key")
    p.add_argument("profile_pos", nargs="?", metavar="perfil", help="id del perfil")
    p.add_argument("-p", "--profile", help="id del perfil")
    p.add_argument("-m", "--mode", choices=("chat", "auth", "models"), default="chat")
    p.add_argument("-v", "--verbose", action="store_true")
    p.add_argument("--json", action="store_true")
    p.set_defaults(func=cmd_test)

    p = sub.add_parser("ask", help="pregunta al modelo (streaming)")
    p.add_argument("prompt", nargs="*")
    p.add_argument("-a", "--agent", default="photon")
    p.add_argument("-p", "--profile")
    p.add_argument("--max-tokens", type=int)
    p.add_argument("--temperature", type=float)
    p.add_argument("--quality", choices=tuple(quality.LEVEL_BY_ID), help="piso de calidad de esta tarea")
    p.add_argument("--memory", action="store_true", help="incluir memoria del proyecto")
    p.add_argument("--no-stream", action="store_true")
    p.add_argument("--quiet", action="store_true")
    p.add_argument("--json", action="store_true")
    p.set_defaults(func=cmd_ask)

    p = sub.add_parser("chat", help="REPL interactivo")
    p.add_argument("-a", "--agent", default="photon")
    p.add_argument("-p", "--profile")
    p.add_argument("--memory", action="store_true")
    p.add_argument("--project", help="proyecto de chat (comparte historial con la web)")
    p.add_argument("--session", help="id de conversación a retomar")
    p.add_argument("--new", action="store_true", help="empieza una conversación nueva")
    p.set_defaults(func=cmd_chat)

    p = sub.add_parser("chats", help="lista, abre o borra conversaciones guardadas")
    p.add_argument("-p", "--profile")
    p.add_argument("--project")
    p.add_argument("--delete", metavar="ID", help="borra la conversación indicada")
    p.add_argument("--clear", action="store_true", help="borra todas (o las del proyecto)")
    p.set_defaults(func=cmd_chats)

    p = sub.add_parser("projects", help="proyectos de chat (agrupan conversaciones)")
    p.add_argument("-p", "--profile")
    p.add_argument("--create", metavar="NOMBRE")
    p.add_argument("--delete", metavar="ID")
    p.set_defaults(func=cmd_projects)

    p = sub.add_parser("run", help="ejecuta un workflow multi-agente")
    p.add_argument("workflow")
    p.add_argument("prompt", nargs="*")
    p.add_argument("-p", "--profile")
    p.set_defaults(func=cmd_run)

    p = sub.add_parser("workflows", help="lista workflows")
    p.set_defaults(func=cmd_workflows)

    p = sub.add_parser("stats", help="telemetría agregada")
    p.add_argument("--json", action="store_true")
    p.set_defaults(func=cmd_stats)

    p = sub.add_parser("logs", help="últimas llamadas")
    p.add_argument("-n", "--limit", type=int, default=25)
    p.set_defaults(func=cmd_logs)

    p = sub.add_parser("mcp", help="estado del backend MCPs")
    p.set_defaults(func=cmd_mcp)

    p = sub.add_parser("memory", help="notas persistentes del proyecto")
    p.add_argument("--add", nargs="*")
    p.add_argument("--tag", default="general")
    p.add_argument("--remove")
    p.set_defaults(func=cmd_memory)

    p = sub.add_parser("doctor", help="diagnóstico del entorno")
    p.set_defaults(func=cmd_doctor)

    p = sub.add_parser("repo", help="repositorios Git para abrir en el IDE")
    p.add_argument("action", choices=("add", "list", "remove", "tree", "search", "serve"),
                   help="add | list | remove | tree | search | serve")
    p.add_argument("reference", nargs="?", help="owner/repo, URL o URL de /tree/<ref>")
    p.add_argument("slug", nargs="?", help="slug del repositorio importado")
    p.add_argument("query", nargs="?", help="texto a buscar")
    p.add_argument("--port", type=int, default=8790)
    p.add_argument("--depth", type=int, default=3)
    p.add_argument("--limit", type=int, default=400)
    p.add_argument("--json", action="store_true")
    p.set_defaults(func=cmd_repo)

    p = sub.add_parser("extensions", help="extensiones del IDE (instalar, activar, red)")
    p.add_argument("action", choices=("list", "install", "uninstall", "enable", "disable", "info", "fetch"),
                   help="list | install | uninstall | enable | disable | info | fetch")
    p.add_argument("reference", nargs="?", help="owner/repo, npm:paquete, URL, ruta local o id de extensión")
    p.add_argument("query", nargs="?", help="URL para la acción fetch")
    p.add_argument("--json", action="store_true")
    p.set_defaults(func=cmd_extensions)

    p = sub.add_parser("routes", help="vistas del IDE declaradas por el backend")
    p.add_argument("--json", action="store_true")
    p.set_defaults(func=cmd_routes)

    p = sub.add_parser("serve-node", help="arranca el IDE con el lanzador Node")
    p.add_argument("--port", type=int, default=int(os.environ.get("PORT", 8765)))
    p.set_defaults(func=cmd_serve_node)

    p = sub.add_parser("serve", help="arranca IDE + API")
    p.add_argument("--port", type=int, default=int(os.environ.get("PORT", 8765)))
    p.add_argument("--host", default="0.0.0.0")
    p.set_defaults(func=cmd_serve)
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    if not getattr(args, "command", None):
        banner()
        parser.print_help()
        return 0
    try:
        return int(args.func(args) or 0)
    except ConfigError as exc:
        return fail(str(exc))
    except llm.LLMError as exc:
        print(bad(str(exc)))
        if exc.detail:
            print(dim(f"  detalle: {str(exc.detail)[:600]}"))
        return 1
    except KeyboardInterrupt:
        print()
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
