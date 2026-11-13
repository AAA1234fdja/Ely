from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "CLI"))

from ely_cli import config, llm


def make_profile(profile_id: str, rpm: int = 60):
    return config.Profile(
        id=profile_id, label=profile_id, provider="openai", model="model",
        base_url="https://example.invalid/v1", key_var="TEST_KEY",
        requests_per_minute=rpm,
    )


class PerProfileRateLimitTest(unittest.TestCase):
    def setUp(self):
        with llm._PROFILE_LIMIT_LOCK:
            llm._PROFILE_REQUESTS.clear()

    def tearDown(self):
        with llm._PROFILE_LIMIT_LOCK:
            llm._PROFILE_REQUESTS.clear()

    def test_sliding_window_throttles_each_profile_independently(self):
        clock = [100.0]
        profile_a = make_profile("a", rpm=1)
        profile_b = make_profile("b", rpm=1)
        with patch("ely_cli.llm.time.monotonic", side_effect=lambda: clock[0]), \
             patch("ely_cli.llm.time.sleep", side_effect=lambda seconds: clock.__setitem__(0, clock[0] + seconds)):
            llm._acquire_profile_slot(profile_a)
            llm._acquire_profile_slot(profile_b)  # Another profile has its own budget.
            self.assertEqual(clock[0], 100.0)
            llm._acquire_profile_slot(profile_a)  # Same profile must wait for its window.
        self.assertGreaterEqual(clock[0], 160.0)

    def test_zero_disables_limit_and_bad_runtime_values_are_rejected(self):
        unlimited = make_profile("unlimited", rpm=0)
        llm._acquire_profile_slot(unlimited)
        self.assertNotIn("unlimited", llm._PROFILE_REQUESTS)
        with self.assertRaisesRegex(ValueError, "requests_per_minute"):
            llm._acquire_profile_slot(type("BadProfile", (), {"id": "bad", "requests_per_minute": True})())

    def test_profile_json_configures_and_exposes_limit(self):
        parsed = config._profile_from_dict({
            "id": "limited", "base_url": "https://example.invalid/v1",
            "requests_per_minute": 12,
        }, {}, "test.json")
        self.assertEqual(parsed.requests_per_minute, 12)
        self.assertEqual(parsed.public()["requests_per_minute"], 12)
        with self.assertRaisesRegex(config.ConfigError, "requests_per_minute"):
            config._profile_from_dict({"id": "bad", "requests_per_minute": -1}, {}, "test.json")

    def test_default_limit_is_sixty_requests_per_minute(self):
        parsed = config._profile_from_dict({"id": "default"}, {}, "test.json")
        self.assertEqual(parsed.requests_per_minute, 60)


if __name__ == "__main__":
    unittest.main()
