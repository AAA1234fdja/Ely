"""Small allowlist of system executables available to agent shell commands.

Workspace executables are intentionally excluded. This limits accidental/tool
execution paths, but interpreters in the allowlist can still run arbitrary code
inside the surrounding Landlock, namespace, and seccomp restrictions.
"""
from __future__ import annotations

import shutil
import sys
from pathlib import Path

ALLOWED_BINARY_NAMES = frozenset({
    "awk", "basename", "bash", "black", "bun", "cat", "cargo", "cd", "chmod",
    "clang", "clang++", "cmake", "cp", "curl", "cut", "date", "diff", "dirname",
    "dotnet", "env", "false", "file", "find", "fish", "g++", "gcc", "git", "go",
    "grep", "gunzip", "gzip", "head", "isort", "java", "javac", "jq", "kill",
    "ln", "ls", "make", "mkdir", "mv", "node", "npm", "npx", "openssl", "patch",
    "perl", "php", "printf", "ps", "pwd", "pwsh", "python", "python3", "pytest",
    "readlink", "realpath", "rm", "rmdir", "rg", "rustc", "sed", "sh", "sleep",
    "sort", "sqlite3", "stat", "tail", "tar", "tee", "test", "timeout", "touch",
    "tr", "true", "uniq", "uname", "unzip", "wc", "wget", "which", "xargs", "yq",
    "zsh",
})


# Dynamic linkers are required by the kernel when launching allowlisted ELF binaries.
_LOADER_GLOBS = (
    "/lib/ld-linux*", "/lib64/ld-linux*", "/lib/*/ld-linux*",
    "/usr/lib/ld-linux*", "/usr/lib64/ld-linux*",
)


def allowed_executable_paths(command: list[str]) -> list[str]:
    """Resolve a deterministic list of host paths for Landlock's EXECUTE grants."""
    candidates: set[Path] = set()
    if command and command[0]:
        candidates.add(Path(command[0]))
    candidates.add(Path(sys.executable))
    for name in ALLOWED_BINARY_NAMES:
        found = shutil.which(name)
        if found:
            candidates.add(Path(found))
    for pattern in _LOADER_GLOBS:
        candidates.update(Path(path) for path in Path("/").glob(pattern.lstrip("/")))

    resolved: set[str] = set()
    for candidate in candidates:
        try:
            path = candidate.resolve(strict=True)
            if path.is_file() and (path.stat().st_mode & 0o111):
                resolved.add(str(path))
        except OSError:
            continue
    return sorted(resolved)
