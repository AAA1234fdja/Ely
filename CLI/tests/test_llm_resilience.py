from __future__ import annotations

import io
import json
import ssl
import sys
import unittest
import urllib.error
from pathlib import Path
from unittest.mock import MagicMock, patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "CLI"))

from ely_cli import llm
from ely_cli.config import Profile


class LLMRetryTest(unittest.TestCase):
    def profile(self):
        return Profile(id="retry", label="Retry", provider="openai", model="model-x",
                       base_url="https://provider.invalid/v1", key_var="RETRY_KEY", api_key="key",
                       timeout=2)

    def response(self):
        payload = json.dumps({"model": "model-x", "choices": [{"message": {
            "role": "assistant", "content": "ok"}, "finish_reason": "stop"}],
            "usage": {"prompt_tokens": 2, "completion_tokens": 1, "total_tokens": 3}}).encode()
        response = MagicMock()
        response.__enter__.return_value = response
        response.read.return_value = payload
        return response

    def test_retries_transient_502_then_succeeds(self):
        failure = urllib.error.HTTPError("https://provider.invalid", 502, "bad gateway",
                                         {"Retry-After": "0"}, io.BytesIO(b"temporary"))
        with patch("ely_cli.llm.urllib.request.urlopen", side_effect=[failure, self.response()]) as open_url, \
             patch("ely_cli.llm.time.sleep") as sleep:
            result = llm.complete(self.profile(), [{"role": "user", "content": "hello"}])
        self.assertEqual(result.text, "ok")
        self.assertEqual(open_url.call_count, 2)
        sleep.assert_called_once_with(0.0)

    def test_does_not_retry_auth_or_invalid_request(self):
        failure = urllib.error.HTTPError("https://provider.invalid", 403, "forbidden", {}, io.BytesIO(b"no"))
        with patch("ely_cli.llm.urllib.request.urlopen", side_effect=failure) as open_url, \
             patch("ely_cli.llm.time.sleep") as sleep:
            with self.assertRaises(llm.LLMError) as raised:
                llm.complete(self.profile(), [{"role": "user", "content": "hello"}])
        self.assertEqual(raised.exception.status, 403)
        open_url.assert_called_once()
        sleep.assert_not_called()

    def test_tls_error_gives_host_and_proxy_diagnostic_without_leaking_url(self):
        failure = urllib.error.URLError(ssl.SSLError("unexpected EOF"))
        with patch("ely_cli.llm.urllib.request.urlopen", side_effect=failure), \
             patch("ely_cli.llm.urllib.request.getproxies", return_value={"https": "configured"}), \
             patch("ely_cli.llm.time.sleep"):
            with self.assertRaises(llm.LLMError) as raised:
                llm.complete(self.profile(), [{"role": "user", "content": "hello"}])
        message = str(raised.exception)
        self.assertIn("provider.invalid", message)
        self.assertIn("proxy configurado", message)
        self.assertIn("no se llegó a una respuesta HTTP", message)
        self.assertNotIn("/v1/chat/completions", message)


if __name__ == "__main__":
    unittest.main()
