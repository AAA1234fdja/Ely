import unittest
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "CLI"))

from ely_cli.subagent_contracts import SubagentArtifact, SubagentRequest, SubagentResult


class SubagentContractTest(unittest.TestCase):
    def test_request_round_trip_has_version_and_only_explicit_context(self):
        request = SubagentRequest.parse({"role": "coder", "task": "Fix the bug", "files": ["src/a.py"],
                                         "budget_tokens": 512})
        encoded = request.to_dict()
        self.assertEqual(encoded["contract_version"], "1.0")
        self.assertEqual(encoded["files"], ["src/a.py"])
        self.assertNotIn("history", encoded)
        self.assertEqual(SubagentRequest.parse({k: v for k, v in encoded.items() if k != "contract_version"}).task,
                         "Fix the bug")

    def test_request_rejects_unknown_fields_and_invalid_budget(self):
        for value in ({"role": "reviewer", "task": "review", "history": []},
                      {"role": "writer", "task": "write", "budget_tokens": True}):
            with self.subTest(value=value), self.assertRaises(ValueError):
                SubagentRequest.parse(value)

    def test_result_is_typed_and_serializable(self):
        result = SubagentResult(role="reviewer", status="completed", summary="Looks safe",
                                artifacts=(SubagentArtifact("report", "No findings"),),
                                usage={"total_tokens": 64}, token_budget=512)
        data = result.to_dict()
        self.assertEqual(data["contract_version"], "1.0")
        self.assertEqual(data["artifacts"][0]["type"], "report")
        self.assertEqual(data["usage"]["total_tokens"], 64)

    def test_result_rejects_bad_artifact_and_usage(self):
        with self.assertRaises(ValueError):
            SubagentArtifact("executable", "run this")
        with self.assertRaises(ValueError):
            SubagentResult(role="coder", status="completed", summary="ok", usage={"total_tokens": -1})


if __name__ == "__main__":
    unittest.main()
