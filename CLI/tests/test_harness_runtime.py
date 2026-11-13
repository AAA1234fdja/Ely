import unittest
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "CLI"))

from ely_cli import quality
from ely_cli.harness_runtime import Harness2Runtime
from ely_cli.engine import prune_context_messages


class HarnessRuntimeTest(unittest.TestCase):
    def setUp(self):
        self.runtime = Harness2Runtime(quality.LEVELS)

    def decide(self, level, **kwargs):
        defaults = dict(quality_level=level, agent_id="dev", base_temperature=0.7,
                        base_tokens=1024, token_ceiling=4096)
        defaults.update(kwargs)
        return self.runtime.decide(**defaults)

    def test_quality_order_is_respected_and_scales_effort_temperature_tokens(self):
        decisions = [self.decide(item["id"]) for item in quality.LEVELS]
        self.assertEqual([d.quality_index for d in decisions], list(range(len(quality.LEVELS))))
        self.assertEqual([d.quality_level for d in decisions], [q["id"] for q in quality.LEVELS])
        self.assertEqual([d.effort for d in decisions[:2]], ["low", "low"])
        self.assertEqual(decisions[2].effort, "medium")
        self.assertEqual(decisions[-1].effort, "high")
        self.assertLess(decisions[-1].temperature, decisions[0].temperature)
        self.assertGreater(decisions[-1].max_tokens, decisions[0].max_tokens)
        self.assertGreater(decisions[-1].task_token_budget, decisions[0].task_token_budget)
        self.assertIn("calidad Isabel te extraño", decisions[-1].prompt_adjustment)

    def test_subagent_and_user_overrides_remain_bounded(self):
        decision = self.decide("Uhight", agent_id="review", is_subagent=True,
                               requested_max_tokens=9000, requested_task_budget=9000)
        self.assertLessEqual(decision.max_tokens, 2048)
        self.assertLessEqual(decision.task_token_budget, 4096)
        user_choice = self.decide("Mid", requested_temperature=0.33, requested_max_tokens=7000)
        self.assertEqual(user_choice.temperature, 0.33)
        self.assertLessEqual(user_choice.max_tokens, 4096)

    def test_context_pruning_keeps_system_and_latest_turn(self):
        messages = [
            {"role": "system", "content": "agent rules"},
            {"role": "user", "content": "old" * 2000},
            {"role": "assistant", "content": "old answer" * 1000},
            {"role": "user", "content": "latest request"},
            {"role": "assistant", "content": "working"},
        ]
        pruned = prune_context_messages(messages, 2048)
        self.assertEqual(pruned[0]["content"], "agent rules")
        self.assertIn("latest request", [m.get("content") for m in pruned])
        self.assertNotIn("old" * 2000, [m.get("content") for m in pruned])

    def test_tool_envelope_is_shrunk_as_json_not_raw_text(self):
        import json
        envelope = {"_ely_trust": "untrusted", "_ely_source": {"name": "workspace.read_file"},
                    "_ely_security": {"flagged": False}, "result": {"content": "x" * 20_000}}
        pruned = prune_context_messages([
            {"role": "system", "content": "rules"},
            {"role": "user", "content": "do work"},
            {"role": "assistant", "content": None, "tool_calls": [{"id": "c", "type": "function"}]},
            {"role": "tool", "content": json.dumps(envelope), "tool_call_id": "c"},
        ], 2048)
        parsed = json.loads(pruned[-1]["content"])
        self.assertEqual(parsed["_ely_trust"], "untrusted")
        self.assertTrue(parsed["result"]["truncated"])


if __name__ == "__main__":
    unittest.main()
