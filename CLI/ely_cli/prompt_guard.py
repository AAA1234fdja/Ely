"""Heuristic prompt-injection signals for untrusted tool observations.

This is a warning layer, not a classifier or security boundary. It never blocks
text by itself; callers must continue to preserve trust boundaries explicitly.
"""
from __future__ import annotations

import re

MAX_SCAN_CHARS = 100_000
_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("instruction_override", re.compile(
        r"\b(?:ignore|disregard|override|bypass|forget)\b.{0,80}\b(?:previous|prior|above|all)\b.{0,40}\b(?:instructions?|rules?|prompts?)\b",
        re.IGNORECASE | re.DOTALL,
    )),
    ("system_prompt_disclosure", re.compile(
        r"\b(?:reveal|show|print|repeat|output|disclose)\b.{0,80}\b(?:system|developer|hidden)\b.{0,30}\bprompt\b",
        re.IGNORECASE | re.DOTALL,
    )),
    ("credential_exfiltration", re.compile(
        r"\b(?:send|post|upload|exfiltrate|print|reveal)\b.{0,80}\b(?:api[ _-]?keys?|secrets?|tokens?|credentials?)\b",
        re.IGNORECASE | re.DOTALL,
    )),
    ("role_override", re.compile(
        r"\b(?:you are now|act as|switch to)\b.{0,40}\b(?:system|developer|root|admin)\b",
        re.IGNORECASE | re.DOTALL,
    )),
    ("safety_bypass", re.compile(
        r"\b(?:disable|bypass|ignore|turn off)\b.{0,60}\b(?:safety|guardrails?|security policy|content filter)\b",
        re.IGNORECASE | re.DOTALL,
    )),
)


def inspect_untrusted_text(text: str, *, source: str = "tool_output") -> dict[str, object]:
    """Return stable signal IDs without echoing hostile text or changing the payload."""
    sample = text[:MAX_SCAN_CHARS]
    signals = [name for name, pattern in _PATTERNS if pattern.search(sample)]
    return {
        "source": source,
        "heuristic": True,
        "flagged": bool(signals),
        "signals": signals,
        "scanned_chars": len(sample),
        "truncated_scan": len(text) > len(sample),
    }
