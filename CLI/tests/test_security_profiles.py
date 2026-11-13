from __future__ import annotations

import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "CLI"))

from ely_cli import security_profiles


class AppArmorOptInTest(unittest.TestCase):
    def test_unset_profile_leaves_lsm_optional(self):
        with patch.dict(os.environ, {}, clear=True):
            self.assertIsNone(security_profiles.apparmor_profile())
            self.assertEqual(security_profiles.apparmor_exec_prefix(), [])

    def test_profile_name_is_validated_and_wrapped_without_shell(self):
        with patch.dict(os.environ, {security_profiles.APPARMOR_ENV: "ely-agent-sandbox"}, clear=True), \
             patch("ely_cli.security_profiles.shutil.which", return_value="/usr/bin/aa-exec"):
            self.assertEqual(security_profiles.apparmor_exec_prefix(), [
                "/usr/bin/aa-exec", "-p", "ely-agent-sandbox", "--",
            ])

    def test_requested_profile_fails_closed_if_launcher_is_missing(self):
        with patch.dict(os.environ, {security_profiles.APPARMOR_ENV: "ely-agent-sandbox"}, clear=True), \
             patch("ely_cli.security_profiles.shutil.which", return_value=None):
            with self.assertRaisesRegex(RuntimeError, "aa-exec no está instalado"):
                security_profiles.apparmor_exec_prefix()

    def test_profile_name_rejects_shell_metacharacters(self):
        with patch.dict(os.environ, {security_profiles.APPARMOR_ENV: "profile;id"}, clear=True):
            with self.assertRaisesRegex(ValueError, "nombre de perfil inválido"):
                security_profiles.apparmor_exec_prefix()

    def test_policy_documents_restrict_kernel_devices_and_git(self):
        policy = (ROOT / "CLI" / "security" / "ely-agent-sandbox.apparmor").read_text(encoding="utf-8")
        for path in ("/proc/**", "/sys/**", "/dev/**", "/**/.git/**"):
            self.assertIn("deny " + path, policy)


if __name__ == "__main__":
    unittest.main()
