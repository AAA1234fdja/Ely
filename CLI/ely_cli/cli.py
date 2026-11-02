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

from . import __version__, llm, mcp, repos
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
    if args.json or args.no_stream:
        result = engine.ask(
            prompt, profile_id=args.profile, agent_id=agent.id,
            max_tokens=args.max_tokens, temperature=args.temperature,
            context=engine.build_context() if args.memory else None,
        )
        if args.json:
            print(json.dumps(result, indent=2, ensure_ascii=False))
        else:
            print(result["text"])
        return 0
    if not args.quiet:
        print(dim(f"  {agent.name} · perfil {args.profile or 'default'} · streaming\n"))
    for event in engine.stream(
        prompt, profile_id=args.profile, agent_id=agent.id,
        context=engine.build_context() if args.memory else None,
    ):
        if event["type"] == "delta":
            sys.stdout.write(event["text"])
            sys.stdout.flush()
        elif event["type"] == "done":
            usage = event.get("usage") or {}
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


def cmd_chat(args: argparse.Namespace) -> int:
    engine = Engine()
    agent = get_agent(args.agent)
    history: list[dict[str, str]] = []
    banner()
    print(f"  Agente: {bold(agent.name)} · perfil: {bold(args.profile or 'default')}")
    print(dim("  /agente <id>  /perfil <id>  /limpiar  /salir\n"))
    agent_id = agent.id
    profile_id = args.profile
    while True:
        try:
            line = input(violet("  ❯ ") if not NO_COLOR else "❯ ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            return 0
        if not line:
            continue
        if line in ("/salir", "/exit", "/quit"):
            return 0
        if line == "/limpiar":
            history.clear()
            print(dim("  historial borrado"))
            continue
        if line.startswith("/agente "):
            agent_id = line.split(" ", 1)[1].strip()
            print(dim(f"  agente → {agent_id}"))
            continue
        if line.startswith("/perfil "):
            profile_id = line.split(" ", 1)[1].strip()
            print(dim(f"  perfil → {profile_id}"))
            continue
        print()
        answer: list[str] = []
        try:
            for event in engine.stream(
                line, profile_id=profile_id, agent_id=agent_id, history=history[-12:],
                context=engine.build_context() if args.memory else None,
            ):
                if event["type"] == "delta":
                    answer.append(event["text"])
                    sys.stdout.write(event["text"])
                    sys.stdout.flush()
                elif event["type"] == "error":
                    print(bad(event["message"]))
                    if event.get("detail"):
                        print(dim(str(event["detail"])[:400]))
                    break
                elif event["type"] == "done":
                    usage = event.get("usage") or {}
                    print(dim(f"\n  [{usage.get('total_tokens', 0)} tokens]"))
        except KeyboardInterrupt:
            print(dim("\n  cancelado"))
            continue
        text = "".join(answer)
        if text:
            history.append({"role": "user", "content": line})
            history.append({"role": "assistant", "content": text})
        print()


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
    p.add_argument("--memory", action="store_true", help="incluir memoria del proyecto")
    p.add_argument("--no-stream", action="store_true")
    p.add_argument("--quiet", action="store_true")
    p.add_argument("--json", action="store_true")
    p.set_defaults(func=cmd_ask)

    p = sub.add_parser("chat", help="REPL interactivo")
    p.add_argument("-a", "--agent", default="photon")
    p.add_argument("-p", "--profile")
    p.add_argument("--memory", action="store_true")
    p.set_defaults(func=cmd_chat)

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
