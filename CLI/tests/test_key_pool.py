from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "CLI"))

from ely_cli import key_pool, llm
from ely_cli.config import Profile


class KeyPoolTest(unittest.TestCase):
    def profile(self, name, model, key):
        return Profile(id=name, label=name, provider="openai", model=model,
                       base_url="https://example.invalid/v1", key_var=name.upper() + "_KEY",
                       api_key=key)

    def test_failover_after_rate_limit_requires_model_validation(self):
        root = Path(tempfile.mkdtemp(prefix="ely-keypool-"))
        primary = self.profile("primary", "model-a", "key-primary")
        backup = self.profile("backup", "model-b", "key-backup")
        response = llm.LLMResult(text="fallback", model="model-b")
        failure = llm.LLMError("rate limited", status=429)
        with (patch("ely_cli.key_pool.configured_candidates", return_value=[primary, backup]),
              patch("ely_cli.key_pool._validated", return_value=(True, "model-permission-confirmed")),
              patch("ely_cli.key_pool.llm.complete", side_effect=[failure, response]) as complete):
            selected, result = key_pool.complete(root, primary, "coder", [{"role": "user", "content": "x"}])
        self.assertEqual(selected.id, "backup")
        self.assertEqual(result.text, "fallback")
        self.assertEqual(complete.call_count, 2)
        self.assertEqual(complete.call_args.kwargs["model"], "model-b")

    def test_models_validation_checks_profile_model_and_caches_safe_status(self):
        profile = self.profile("profile", "model-wanted", "prod-secret")
        with patch("ely_cli.key_pool.llm.probe", return_value={"ok": True, "models": ["model-other"]}) as probe:
            ok, reason = key_pool._validated(profile, force=True)
        self.assertFalse(ok)
        self.assertEqual(reason, "model-not-listed")
        cache = key_pool._VALIDATION[(profile.id, profile.model)]
        self.assertNotIn("prod-secret", str(cache))
        probe.assert_called_once_with(profile, mode="models")

    def test_role_configuration_accepts_only_configured_real_profiles(self):
        root = Path(tempfile.mkdtemp(prefix="ely-keypool-"))
        primary = self.profile("primary", "model-a", "key-primary")
        with patch("ely_cli.key_pool._profiles", return_value=[primary]):
            saved = key_pool.configure_roles(root, {"coder": ["primary"]})
            self.assertEqual(saved["roles"]["coder"], ["primary"])
            with self.assertRaises(ValueError):
                key_pool.configure_roles(root, {"coder": ["missing"]})
            with self.assertRaises(ValueError):
                key_pool.configure_roles(root, {"unknown": ["primary"]})
        data = (root / ".ely" / "key-pool.json").read_text()
        self.assertNotIn("key-primary", data)

    def test_pool_status_never_serializes_keys(self):
        root = Path(tempfile.mkdtemp(prefix="ely-keypool-"))
        primary = self.profile("primary", "model-a", "key-primary")
        backup = self.profile("backup", "model-b", "key-secret-value")
        with (patch("ely_cli.key_pool.load_profiles", return_value=[primary, backup]),
              patch("ely_cli.key_pool.configured_candidates", return_value=[primary, backup])):
            status = key_pool.status(root, "primary", "reviewer")
        self.assertEqual(status["primary"], "primary")
        self.assertNotIn("key-secret-value", str(status))
        self.assertTrue(status["enabled"])


if __name__ == "__main__":
    unittest.main()
