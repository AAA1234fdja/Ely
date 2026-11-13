#!/usr/bin/env python3
"""Sign an MCP JSON manifest with an offline Ed25519 private key using OpenSSL."""
from __future__ import annotations

import argparse
import base64
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "CLI"))
from ely_cli.mcp_signatures import canonical_manifest  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path)
    parser.add_argument("--key-id", required=True)
    parser.add_argument("--private-key", required=True, type=Path)
    args = parser.parse_args()
    if not args.key_id or len(args.key_id) > 64 or not all(c.isalnum() or c in "_.-" for c in args.key_id):
        parser.error("--key-id solo acepta letras, números, punto, guion y guion bajo (máx. 64)")
    openssl = shutil.which("openssl")
    if not openssl:
        parser.error("OpenSSL no está instalado")
    try:
        data = json.loads(args.manifest.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            parser.error("el manifiesto JSON debe ser un objeto")
    except (OSError, json.JSONDecodeError) as exc:
        parser.error(f"manifiesto inválido: {exc}")
    data.pop("_ely_signature", None)
    with tempfile.TemporaryDirectory(prefix="ely-mcp-sign-") as directory:
        payload = Path(directory) / "payload.json"
        signature = Path(directory) / "payload.sig"
        payload.write_bytes(canonical_manifest(data))
        result = subprocess.run(
            [openssl, "pkeyutl", "-sign", "-inkey", str(args.private_key),
             "-rawin", "-in", str(payload), "-out", str(signature)],
            stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            timeout=10, check=False,
        )
        if result.returncode:
            print("OpenSSL no pudo firmar el manifiesto:", result.stderr.decode("utf-8", "replace")[-1000:], file=sys.stderr)
            return 1
        data["_ely_signature"] = {
            "algorithm": "ed25519", "key_id": args.key_id,
            "value": base64.b64encode(signature.read_bytes()).decode("ascii"),
        }
    temporary = args.manifest.with_suffix(args.manifest.suffix + ".tmp")
    temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(args.manifest)
    print(f"Firmado: {args.manifest} (key_id={args.key_id})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
