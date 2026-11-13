from __future__ import annotations

import base64
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "CLI"))

from ely_cli import mcp_client, mcp_signatures


@unittest.skipUnless(shutil.which("openssl"), "OpenSSL no está instalado")
class MCPManifestSignatureTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="ely-mcp-signatures-")
        self.root = Path(self.temp.name)
        self.manifests = self.root / "MCPs"
        self.trust = self.root / ".ely" / "mcp-trust"
        self.manifests.mkdir()
        self.trust.mkdir(parents=True)
        self.private_key = self.root / "private.pem"
        self.public_key = self.trust / "test-key.pub.pem"
        subprocess.run([shutil.which("openssl"), "genpkey", "-algorithm", "ED25519",
                        "-out", str(self.private_key)], check=True, capture_output=True, timeout=5)
        subprocess.run([shutil.which("openssl"), "pkey", "-in", str(self.private_key),
                        "-pubout", "-out", str(self.public_key)], check=True,
                       capture_output=True, timeout=5)
        (self.root / ".ely" / "mcp-policy.json").write_text(
            json.dumps({"require_signatures": True}), encoding="utf-8")

    def tearDown(self):
        self.temp.cleanup()

    def signed_manifest(self, data: dict, *, key_id: str = "test-key") -> Path:
        payload = self.root / "payload.json"
        signature_path = self.root / "payload.sig"
        payload.write_bytes(mcp_signatures.canonical_manifest(data))
        subprocess.run([shutil.which("openssl"), "pkeyutl", "-sign", "-inkey", str(self.private_key),
                        "-rawin", "-in", str(payload), "-out", str(signature_path)],
                       check=True, capture_output=True, timeout=5)
        data["_ely_signature"] = {
            "algorithm": "ed25519", "key_id": key_id,
            "value": base64.b64encode(signature_path.read_bytes()).decode("ascii"),
        }
        path = self.manifests / "mcp.json"
        path.write_text(json.dumps(data), encoding="utf-8")
        return path

    def test_valid_signature_is_accepted_for_configured_mcp(self):
        self.signed_manifest({"mcpServers": {"signed": {
            "transport": "stdio", "command": sys.executable, "args": ["-c", "pass"]
        }}})
        entries = mcp_client._manifest_servers(self.root)
        self.assertEqual([server_id for _, server_id, _ in entries], ["signed"])
        self.assertTrue(entries[0][2]["_ely_signature_verified"])

    def test_tampering_after_signing_is_rejected(self):
        path = self.signed_manifest({"mcpServers": {"signed": {
            "transport": "stdio", "command": sys.executable, "args": ["-c", "pass"]
        }}})
        data = json.loads(path.read_text(encoding="utf-8"))
        data["mcpServers"]["signed"]["args"] = ["-c", "print('tampered')"]
        path.write_text(json.dumps(data), encoding="utf-8")
        self.assertEqual(mcp_client._manifest_servers(self.root), [])
        self.assertEqual(mcp_signatures.verify_manifest(self.root, data)["status"], "invalid_signature")

    def test_required_signature_rejects_unsigned_manifest(self):
        path = self.manifests / "mcp.json"
        path.write_text(json.dumps({"mcpServers": {"unsigned": {
            "transport": "stdio", "command": sys.executable,
        }}}), encoding="utf-8")
        self.assertEqual(mcp_client._manifest_servers(self.root), [])

    def test_invalid_signature_is_rejected_even_if_signatures_are_optional(self):
        (self.root / ".ely" / "mcp-policy.json").write_text(
            json.dumps({"require_signatures": False}), encoding="utf-8")
        path = self.signed_manifest({"mcpServers": {"signed": {
            "transport": "stdio", "command": sys.executable,
        }}})
        data = json.loads(path.read_text(encoding="utf-8"))
        data["_ely_signature"]["value"] = base64.b64encode(b"not-a-real-signature").decode("ascii")
        path.write_text(json.dumps(data), encoding="utf-8")
        self.assertEqual(mcp_client._manifest_servers(self.root), [])


if __name__ == "__main__":
    unittest.main()
