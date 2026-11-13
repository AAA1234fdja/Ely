"""Optional Ed25519 verification for MCP JSON manifests.

Trusted public keys live in .ely/mcp-trust/<key-id>.pub.pem. A local policy
file can require signatures; malformed or invalid signatures always fail closed.
"""
from __future__ import annotations

import base64
import hashlib
import json
import re
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any

_SIGNATURE_FIELD = "_ely_signature"
_KEY_ID = re.compile(r"^[A-Za-z0-9_.-]{1,64}$")
_SIGNATURE_MAX = 1024


def require_signatures(root: Path) -> bool:
    policy = root / ".ely" / "mcp-policy.json"
    if not policy.exists():
        return False
    try:
        data = json.loads(policy.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return True  # A broken security policy must not silently disable verification.
    return not isinstance(data, dict) or data.get("require_signatures") is not False


def canonical_manifest(data: dict[str, Any]) -> bytes:
    unsigned = {key: value for key, value in data.items() if key != _SIGNATURE_FIELD}
    return json.dumps(unsigned, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def verify_manifest(root: Path, data: dict[str, Any]) -> dict[str, Any]:
    """Verify the detached Ed25519 signature; unsigned manifests follow local policy."""
    required = require_signatures(root)
    signature = data.get(_SIGNATURE_FIELD)
    if signature is None:
        return {"valid": not required, "status": "required" if required else "unsigned",
                "required": required, "key_id": None}
    if not isinstance(signature, dict) or signature.get("algorithm") != "ed25519":
        return {"valid": False, "status": "malformed", "required": required, "key_id": None}
    key_id = signature.get("key_id")
    encoded = signature.get("value")
    if not isinstance(key_id, str) or not _KEY_ID.fullmatch(key_id) or not isinstance(encoded, str) or len(encoded) > _SIGNATURE_MAX:
        return {"valid": False, "status": "malformed", "required": required, "key_id": None}
    try:
        raw_signature = base64.b64decode(encoded, validate=True)
    except (ValueError, TypeError):
        return {"valid": False, "status": "malformed", "required": required, "key_id": key_id}
    trust_dir = root / ".ely" / "mcp-trust"
    public_key = trust_dir / f"{key_id}.pub.pem"
    try:
        if (trust_dir.is_symlink() or public_key.is_symlink() or not public_key.is_file()
                or public_key.stat().st_size > 64_000 or public_key.resolve().parent != trust_dir.resolve()):
            return {"valid": False, "status": "untrusted_key", "required": required, "key_id": key_id}
    except OSError:
        return {"valid": False, "status": "untrusted_key", "required": required, "key_id": key_id}
    openssl = shutil.which("openssl")
    if not openssl:
        return {"valid": False, "status": "openssl_unavailable", "required": required, "key_id": key_id}
    try:
        with tempfile.TemporaryDirectory(prefix="ely-mcp-signature-") as directory:
            payload_path = Path(directory) / "manifest.json"
            signature_path = Path(directory) / "manifest.sig"
            payload_path.write_bytes(canonical_manifest(data))
            signature_path.write_bytes(raw_signature)
            result = subprocess.run(
                [openssl, "pkeyutl", "-verify", "-pubin", "-inkey", str(public_key),
                 "-sigfile", str(signature_path), "-rawin", "-in", str(payload_path)],
                stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                timeout=5, check=False, env={"PATH": "/usr/bin:/bin", "LANG": "C"},
            )
    except (OSError, subprocess.TimeoutExpired):
        return {"valid": False, "status": "verification_error", "required": required, "key_id": key_id}
    valid = result.returncode == 0
    return {"valid": valid, "status": "verified" if valid else "invalid_signature",
            "required": required, "key_id": key_id,
            "manifest_sha256": hashlib.sha256(canonical_manifest(data)).hexdigest() if valid else None}
