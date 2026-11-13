import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
import sys
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "CLI"))

from ely_cli import agent_tools, integrations, llm
from ely_cli.engine import Engine


class WorkspaceToolsTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="ely-tools-"))
        (self.tmp / "src").mkdir()
        (self.tmp / "src" / "app.py").write_text("def hello():\n    return 'hello'\n", encoding="utf-8")
        (self.tmp / ".ely").mkdir()
        (self.tmp / ".ely" / "keys.env").write_text("TOKEN=secret", encoding="utf-8")
        (self.tmp / ".env").write_text("TOKEN=secret", encoding="utf-8")
        try:
            (self.tmp / "public.envlink").symlink_to(self.tmp / ".env")
        except OSError:
            pass
        (self.tmp / "IDE").mkdir()
        (self.tmp / "IDE" / "src").mkdir()
        (self.tmp / "IDE" / "src" / "vendor.js").write_text("vendor", encoding="utf-8")

    def tearDown(self):
        import shutil
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_read_and_search_visible_files(self):
        read = agent_tools.execute(self.tmp, "workspace.read_file", {"path": "src/app.py"})
        self.assertTrue(read["ok"])
        self.assertIn("def hello", read["content"])
        found = agent_tools.execute(self.tmp, "workspace.search", {"query": "hello"})
        self.assertTrue(found["ok"])
        self.assertEqual(found["matches"][0]["path"], "src/app.py")

    def test_rejects_traversal_secrets_and_vendor_code(self):
        for path in ("../outside.txt", ".env", ".ely/keys.env", "IDE/src/vendor.js", "public.envlink"):
            with self.subTest(path=path):
                result = agent_tools.execute(self.tmp, "workspace.read_file", {"path": path})
                self.assertFalse(result["ok"])

    def test_list_excludes_private_and_vendor_paths(self):
        result = agent_tools.execute(self.tmp, "workspace.list_files", {})
        self.assertEqual(result["files"], ["src/app.py"])

    def test_write_file_creates_and_keeps_previous_version(self):
        first = agent_tools.execute(self.tmp, "workspace.write_file", {
            "path": "src/new.py", "content": "print('one')\n"
        })
        self.assertTrue(first["ok"])
        self.assertTrue(first["created"])
        second = agent_tools.execute(self.tmp, "workspace.write_file", {
            "path": "src/new.py", "content": "print('two')\n"
        })
        self.assertTrue(second["ok"])
        self.assertTrue(second["backup_saved"])
        self.assertEqual((self.tmp / "src" / "new.py").read_text(encoding="utf-8"), "print('two')\n")
        backups = list((self.tmp / ".ely" / "history").glob("*"))
        self.assertEqual(len(backups), 1)
        self.assertEqual(backups[0].read_text(encoding="utf-8"), "print('one')\n")

    def test_write_file_rejects_sensitive_or_outside_paths(self):
        for path in ("../outside.py", ".env", "secrets.yaml", "IDE/src/vendor.py"):
            with self.subTest(path=path):
                result = agent_tools.execute(self.tmp, "workspace.write_file", {"path": path, "content": "x"})
                self.assertFalse(result["ok"])

    def test_run_command_uses_isolation_and_reports_diff_without_applying(self):
        (self.tmp / "src" / "nested").mkdir()
        isolated = {"ok": True, "code": 0, "stdout": "7 tests passed", "stderr": "",
                    "sandboxed": True, "mode": "workspace", "diff": "--- a/app.py", "changes_applied": False}
        with patch("ely_cli.command_sandbox.run", return_value=isolated) as runner:
            result = agent_tools.execute(self.tmp, "workspace.run_command", {
                "command": "python -m pytest", "cwd": "src/nested"
            })
        self.assertTrue(result["ok"])
        self.assertTrue(result["sandboxed"])
        self.assertFalse(result["changes_applied"])
        self.assertEqual(result["stdout"], "7 tests passed")
        runner.assert_called_once_with(self.tmp, "python -m pytest", "src/nested", mode="workspace", timeout=20)

    def test_run_command_fails_closed_when_os_sandbox_is_unavailable(self):
        from ely_cli.command_sandbox import run
        with (patch("ely_cli.command_sandbox.shutil.which", return_value=None),
              patch("ely_cli.os_isolation.available", return_value=False)):
            result = run(self.tmp, "cat /etc/passwd")
        self.assertFalse(result["ok"])
        self.assertFalse(result["sandboxed"])
        self.assertIn("bloqueada", result["error"])
        self.assertNotIn("root:", result.get("stdout", ""))

    def test_isolated_workspace_command_cannot_read_ely_secrets_and_returns_diff(self):
        from ely_cli.command_sandbox import run
        try:
            from ely_cli.os_isolation import available
            if not available():
                self.skipTest("Landlock + network namespace unavailable")
        except Exception:
            self.skipTest("OS isolation unavailable")
        secret = str(self.tmp / ".ely" / "keys.env")
        result = run(self.tmp, f"cat {secret}; echo changed >> src/app.py", mode="workspace")
        self.assertTrue(result["sandboxed"])
        self.assertNotIn("secret", result["stdout"])
        self.assertIn("Permission denied", result["stderr"])
        self.assertIn("diff", result)
        self.assertFalse(result["changes_applied"])
        self.assertNotIn("changed", (self.tmp / "src" / "app.py").read_text())

    def test_run_command_rejects_traversal_and_private_cwd(self):
        for cwd in ("../", ".ely", "IDE/src"):
            with self.subTest(cwd=cwd):
                result = agent_tools.execute(self.tmp, "workspace.run_command", {
                    "command": "python -m pytest", "cwd": cwd
                })
                self.assertFalse(result["ok"])

    def test_unknown_tool_is_never_executed(self):
        self.assertFalse(agent_tools.execute(self.tmp, "shell.exec", {"command": "id"})["ok"])

    def test_spawn_subagent_receives_only_explicit_context_and_budget(self):
        from unittest.mock import Mock
        profile = SimpleNamespace(id="active")
        child = {"text": "review summary", "usage": {"total_tokens": 128},
                 "partial": False, "profile": "active", "model": "m", "tools_used": ["workspace.read_file"]}
        engine = Mock()
        engine.ask.return_value = child
        result = agent_tools.execute(self.tmp, "agent.spawn_subagent", {
            "role": "reviewer", "task": "Review this module", "files": ["src/app.py"], "budget_tokens": 512
        }, profile=profile, engine=engine)
        self.assertTrue(result["ok"])
        self.assertEqual(result["status"], "completed")
        self.assertEqual(result["artifacts"][0]["content"], "review summary")
        kwargs = engine.ask.call_args.kwargs
        self.assertIsNone(kwargs["history"])
        self.assertIn("src/app.py", kwargs["context"])
        self.assertEqual(kwargs["max_tokens"], 512)
        self.assertEqual(kwargs["token_budget"], 512)
        self.assertNotIn("agent.spawn_subagent", __import__("ely_cli.agents", fromlist=["get_agent"]).get_agent("review").tools)

    def test_only_photon_can_adjust_bounded_token_target(self):
        from ely_cli.agents import get_agent
        photon = {x["function"]["name"] for x in agent_tools.schemas_for(get_agent("photon").tools)}
        codey = {x["function"]["name"] for x in agent_tools.schemas_for(get_agent("dev").tools)}
        self.assertIn("harness.set_token_target", photon)
        self.assertNotIn("harness.set_token_target", codey)
        result = agent_tools.execute(self.tmp, "harness.set_token_target", {"desired_tokens": 2048})
        self.assertTrue(result["ok"])
        policy = json.loads((self.tmp / ".ely" / "harness-policy.json").read_text())
        self.assertEqual(policy["desired_tokens"], 2048)
        invalid = agent_tools.execute(self.tmp, "harness.set_token_target", {"desired_tokens": 9999})
        self.assertFalse(invalid["ok"])

    def test_token_target_tool_applies_to_next_chat_round(self):
        engine = Engine(self.tmp)
        profile = SimpleNamespace(id="p", model="m", max_tokens=1024, api_key="", provider="test", endpoint=lambda: "")
        schema = agent_tools.schemas_for(["harness.set_token_target"])
        responses = [
            llm.LLMResult(text="", tool_calls=[{"id": "t", "name": "harness.set_token_target",
                                                   "arguments": {"desired_tokens": 2048}}]),
            llm.LLMResult(text="done", model="m"),
        ]
        seen = []
        def complete(_profile, _messages, **kwargs):
            seen.append(kwargs.get("max_tokens"))
            return responses.pop(0)
        with (patch.object(engine, "profile", return_value=profile),
              patch.object(engine, "_tool_specs", return_value=schema),
              patch("ely_cli.engine.llm.complete", side_effect=complete),
              patch("ely_cli.engine._task_tool_budget", return_value=(2, 4))):
            result = engine.ask("adjust tokens", agent_id="photon")
        self.assertEqual(result["text"], "done")
        self.assertEqual(seen, [1024, 2048])

    def test_total_token_budget_caps_each_round(self):
        engine = Engine(self.tmp)
        profile = SimpleNamespace(id="p", model="m", max_tokens=1024, api_key="", provider="test", endpoint=lambda: "")
        schema = [{"type": "function", "function": {"name": "workspace.list_files", "parameters": {"type": "object"}}}]
        responses = [
            llm.LLMResult(text="", tool_calls=[{"id": "t", "name": "workspace.list_files", "arguments": {}}],
                          usage=llm.Usage(prompt_tokens=64, completion_tokens=64, total_tokens=128)),
            llm.LLMResult(text="done", model="m", usage=llm.Usage(prompt_tokens=64, completion_tokens=64, total_tokens=128)),
        ]
        seen = []
        def complete(_profile, _messages, **kwargs):
            seen.append(kwargs["max_tokens"])
            return responses.pop(0)
        with (patch.object(engine, "profile", return_value=profile),
              patch.object(engine, "_tool_specs", return_value=schema),
              patch.object(engine, "_append_tool_turn", return_value=[("workspace.list_files", {})]),
              patch("ely_cli.engine.llm.complete", side_effect=complete),
              patch("ely_cli.engine._task_tool_budget", return_value=(2, 4))):
            result = engine.ask("inspect", agent_id="photon", token_budget=256)
        self.assertEqual(seen, [256, 128])
        self.assertEqual(result["token_budget"], 256)
        self.assertEqual(result["usage"]["total_tokens"], 256)

    def test_tool_budget_returns_partial_instead_of_aborting(self):
        engine = Engine(ROOT)
        tools = [{"type": "function", "function": {"name": "workspace.read_file", "parameters": {"type": "object"}}}]
        response = llm.LLMResult(text="", tool_calls=[
            {"id": "a", "name": "workspace.read_file", "arguments": {"path": "README.md"}},
            {"id": "b", "name": "workspace.read_file", "arguments": {"path": "README.md"}},
        ])
        with (patch("ely_cli.engine._task_tool_budget", return_value=(1, 1)),
              patch.object(engine, "_tool_specs", return_value=tools),
              patch("ely_cli.engine.llm.complete", return_value=response)):
            result = engine.ask("inspect", agent_id="photon")
        self.assertTrue(result["partial"])
        self.assertIn("Resultado parcial", result["text"])
        self.assertEqual(result["tool_budget"], {"rounds": 1, "calls": 1})


class ToolCallingProtocolTest(unittest.TestCase):
    def test_harness_retries_empty_truncated_completion_with_more_tokens(self):
        profile = SimpleNamespace(max_tokens=300, model="m", temperature=0.2)
        backend = integrations._ProfileBackend(profile, max_calls=4)
        seen = []
        responses = [
            llm.LLMResult(text="", finish_reason="length", usage=llm.Usage(completion_tokens=300)),
            llm.LLMResult(text='{"veredicto":"aprobado"}', finish_reason="stop", usage=llm.Usage(completion_tokens=40)),
        ]
        def fake_complete(_profile, _messages, **kwargs):
            seen.append(kwargs["max_tokens"])
            return responses.pop(0)
        with patch("ely_cli.integrations.llm.complete", side_effect=fake_complete):
            result = backend.complete("review this", system="reviewer")
        self.assertIn("veredicto", result)
        self.assertEqual(seen, [300, 600])
        self.assertEqual(backend.calls, 2)

    def test_extract_openai_and_anthropic_tool_calls(self):
        data = {"choices": [{"message": {"tool_calls": [{
            "id": "c1", "function": {"name": "workspace.list_files", "arguments": "{}"}
        }]}}]}
        self.assertEqual(llm._extract_tool_calls(data)[0]["arguments"], {})
        anthropic = {"content": [{"type": "tool_use", "id": "a1", "name": "workspace.search", "input": {"query": "foo"}}]}
        self.assertEqual(llm._extract_tool_calls(anthropic)[0]["id"], "a1")

    def test_laya_decision_selects_only_a_provided_option(self):
        class FakeRouter:
            def predict(self, state, questions, **kwargs):
                self.state = state
                self.questions = questions
                self.kwargs = kwargs
                return {"answers": {"choice": {
                    "choice": "inspect", "answer_confidence": 0.83,
                    "probabilities": {"inspect": 0.83, "edit": 0.17},
                }}, "routing": {"model": "typed-decisions"}}

        fake = FakeRouter()
        with patch("ely_cli.integrations._laya_router", return_value=fake):
            result = integrations.decide_with_laya(Path("."), "Choose safe next step", {
                "inspect": "Inspect and test before changes", "edit": "Change files immediately"
            })
        self.assertTrue(result["ok"])
        self.assertEqual(result["selected"], "inspect")
        self.assertEqual(fake.kwargs["task"], "typed_decisions")

    def test_laya_rejects_out_of_catalog_choice(self):
        class FakeRouter:
            def predict(self, *args, **kwargs):
                return {"answers": {"choice": {"choice": "invented"}}}

        with patch("ely_cli.integrations._laya_router", return_value=FakeRouter()):
            result = integrations.decide_with_laya(Path("."), "Pick one", {"a": "A", "b": "B"})
        self.assertFalse(result["ok"])

    def test_harness_candy_bridge_uses_ely_profile_for_planning_and_workers(self):
        with tempfile.TemporaryDirectory(prefix="ely-harness-bridge-") as directory:
            root = Path(directory)
            (root / "Harness-Candy").symlink_to(ROOT / "Harness-Candy", target_is_directory=True)
            profile = SimpleNamespace(model="selected-model", temperature=0.1, max_tokens=100, timeout=5)
            calls = []

            def fake_complete(_profile, messages, **kwargs):
                calls.append((messages, kwargs))
                system = messages[0]["content"] if messages and messages[0]["role"] == "system" else ""
                text = json.dumps({
                    "arquitectura": "single task", "requisitos": [], "hitos": [{
                        "task_id": "task-1", "kind": "execute", "instruction": "do the task",
                        "deps": [], "agent": "XEV"
                    }], "criterios": {"task-1": []}
                }) if "Eres ISA" in system else "agent artifact"
                return llm.LLMResult(text=text, model="selected-model")

            with patch("ely_cli.integrations.llm.complete", side_effect=fake_complete):
                result = integrations.run_harness_candy(root, profile, "Build a small plan", seed=2)
            self.assertEqual(result["tasks"][0]["artifact"], "agent artifact")
            self.assertGreaterEqual(result["model_calls"], 2)
            self.assertLessEqual(result["model_calls"], 64)
            self.assertTrue(all(call[1]["model"] == "selected-model" for call in calls))
            self.assertTrue(result["adaptation_budget"]["enabled"])
            self.assertEqual(result["adaptation_budget"]["token_target"], 128)
            self.assertLessEqual(result["adaptation_budget"]["probe_units_spent"], 9)

    def test_anthropic_payload_maps_calls_and_results(self):
        profile = SimpleNamespace(model="claude", temperature=0.2, max_tokens=100, provider="anthropic")
        messages = [
            {"role": "system", "content": "system"},
            {"role": "assistant", "content": None, "tool_calls": [{
                "id": "c1", "function": {"name": "workspace.list_files", "arguments": "{}"}
            }]},
            {"role": "tool", "tool_call_id": "c1", "content": '{"ok":true}'},
        ]
        payload = llm._anthropic_payload(profile, messages, False, tools=agent_tools.schemas_for(["workspace.list_files"]), tool_choice="auto")
        self.assertEqual(payload["system"], "system")
        self.assertEqual(payload["tools"][0]["name"], "workspace.list_files")
        self.assertEqual(payload["messages"][0]["content"][0]["type"], "tool_use")
        self.assertEqual(payload["messages"][1]["content"][0]["type"], "tool_result")

    def test_tool_turn_returns_observations_to_model(self):
        with tempfile.TemporaryDirectory(prefix="ely-engine-tools-") as directory:
            root = Path(directory)
            (root / "README.md").write_text("hello", encoding="utf-8")
            engine = Engine(root)
            messages = []
            observations = engine._append_tool_turn(messages, "", [{
                "id": "c1", "name": "workspace.read_file", "arguments": {"path": "README.md"}
            }])
            self.assertEqual(observations[0][0], "workspace.read_file")
            self.assertEqual(messages[-1]["role"], "tool")
            self.assertIn("hello", json.loads(messages[-1]["content"])["content"])

    def test_engine_rejects_tools_not_assigned_to_agent(self):
        with tempfile.TemporaryDirectory(prefix="ely-engine-allowlist-") as directory:
            root = Path(directory)
            engine = Engine(root)
            messages = []
            engine._append_tool_turn(messages, "", [{
                "id": "c1", "name": "workspace.write_file",
                "arguments": {"path": "should-not-exist.py", "content": "bad"}
            }], allowed_tools={"workspace.read_file"})
            result = json.loads(messages[-1]["content"])
            self.assertFalse(result["ok"])
            self.assertFalse((root / "should-not-exist.py").exists())

    def test_streaming_chat_completes_tool_loop(self):
        from ely_cli.agents import Agent
        profile = SimpleNamespace(id="test", provider="openai", model="test-model", endpoint=lambda: "http://test",
                                 masked_key="****", api_key="")
        agent = Agent(id="test", name="Test", role="test", icon="x", color="#000", system="test",
                      tools=["workspace.read_file"])
        with tempfile.TemporaryDirectory(prefix="ely-engine-stream-") as directory:
            root = Path(directory)
            (root / "README.md").write_text("hello", encoding="utf-8")
            engine = Engine(root)
            responses = [
                [{"type": "tool_calls", "tool_calls": [{
                    "id": "c1", "name": "workspace.read_file", "arguments": {"path": "README.md"}
                }]}, {"type": "usage", "usage": {"prompt_tokens": 2, "completion_tokens": 1, "total_tokens": 3}}],
                [{"type": "delta", "text": "The file says hello."},
                 {"type": "usage", "usage": {"prompt_tokens": 3, "completion_tokens": 4, "total_tokens": 7}}],
            ]
            with patch.object(engine, "profile", return_value=profile), \
                    patch("ely_cli.engine.get_agent", return_value=agent), \
                    patch("ely_cli.engine.llm.stream", side_effect=lambda *a, **k: iter(responses.pop(0))):
                events = list(engine.stream("inspect README", agent_id="test"))
            self.assertEqual([event["status"] for event in events if event["type"] == "tool"], ["running", "done"])
            done = next(event for event in events if event["type"] == "done")
            self.assertEqual(done["text"], "The file says hello.")
            self.assertEqual(done["tools_used"], ["workspace.read_file"])

    def test_non_streaming_chat_completes_tool_loop(self):
        from ely_cli.agents import Agent
        profile = SimpleNamespace(id="test", provider="openai", model="test-model")
        first = llm.LLMResult(
            text="", model="test-model", tool_calls=[{
                "id": "c1", "name": "workspace.read_file", "arguments": {"path": "README.md"}
            }]
        )
        second = llm.LLMResult(text="The file says hello.", model="test-model")
        with tempfile.TemporaryDirectory(prefix="ely-engine-loop-") as directory:
            root = Path(directory)
            (root / "README.md").write_text("hello", encoding="utf-8")
            engine = Engine(root)
            agent = Agent(id="test", name="Test", role="test", icon="x", color="#000", system="test",
                          tools=["workspace.read_file"])
            requests = []

            def complete(_profile, messages, **_kwargs):
                requests.append(messages)
                return first if len(requests) == 1 else second

            with patch.object(engine, "profile", return_value=profile), \
                    patch("ely_cli.engine.get_agent", return_value=agent), \
                    patch("ely_cli.engine.llm.complete", side_effect=complete):
                response = engine.ask("inspect README", agent_id="test")
            self.assertEqual(response["text"], "The file says hello.")
            self.assertEqual(response["tools_used"], ["workspace.read_file"])
            self.assertEqual(requests[1][-1]["role"], "tool")
            self.assertIn("hello", requests[1][-1]["content"])


if __name__ == "__main__":
    unittest.main()
