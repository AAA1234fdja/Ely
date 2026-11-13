from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from ely_cli import quality


class QualityLevelsTest(unittest.TestCase):
    def test_levels_are_explicit_and_workspace_policy_persists(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            self.assertEqual(quality.LEVELS[0]["id"], "Xlow")
            self.assertEqual(quality.LEVELS[-1]["id"], "Isabel te extraño")
            state = quality.set_level(root, "Hight")
            self.assertEqual(state["level"], "Hight")
            self.assertEqual(quality.current(root), "Hight")
            with self.assertRaises(ValueError):
                quality.set_level(root, "frontier")

    def test_level_cannot_change_while_task_is_active(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            with quality.task(root):
                self.assertTrue(quality.settings(root)["active"])
                with self.assertRaisesRegex(ValueError, "tarea en ejecución"):
                    quality.set_level(root, "Uhight")
            self.assertFalse(quality.settings(root)["active"])
            self.assertEqual(quality.set_level(root, "Uhight")["level"], "Uhight")

    def test_configured_acceptance_command_and_syntax_checks_have_evidence(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            (root / "sample.py").write_text("answer = 42\n", encoding="utf-8")
            quality.set_level(root, "Mid", ["python3 -m unittest discover -s tests -q"])
            with patch("ely_cli.command_sandbox.run", return_value={
                "ok": True, "sandboxed": True, "code": 0, "stdout": "Ran 1 test", "stderr": ""
            }) as run:
                result = quality.verify(root, "Mid", ["sample.py"])
            self.assertEqual(result["status"], "passed")
            self.assertEqual(len(result["checks"]), 2)
            self.assertEqual(run.call_args.kwargs["mode"], "workspace")

    def test_sandbox_fixture_restriction_is_unverified_not_a_code_failure(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            quality.set_level(root, "Mid", ["python3 -m unittest discover -s tests -q"])
            with patch("ely_cli.command_sandbox.run", return_value={
                "ok": False, "sandboxed": True, "code": 1,
                "stdout": "PermissionError: /etc/mime.types", "stderr": ""
            }):
                result = quality.verify(root, "Mid")
            self.assertEqual(result["status"], "unverified")
            self.assertIn("claves fixture", result["reason"])

    def test_no_verifier_is_reported_as_unverified_not_passed(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            (root / "notes.txt").write_text("hello\n", encoding="utf-8")
            result = quality.verify(root, "Low", ["notes.txt"])
            self.assertEqual(result["status"], "passed")  # whitespace is the only measurable criterion
            (root / ".ely").mkdir(parents=True, exist_ok=True)
            (root / ".ely" / "quality-policy.json").write_text('{"test_commands": []}', encoding="utf-8")
            result = quality.verify(root, "Low")
            self.assertEqual(result["status"], "unverified")
            self.assertIn("no se certifica", quality.report(result, "Low"))


if __name__ == "__main__":
    unittest.main()
