from __future__ import annotations

import errno
import platform
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "CLI"))

from ely_cli import command_sandbox, exec_policy, os_isolation


class SeccompPolicyTest(unittest.TestCase):
    def test_supported_architecture_policy_contains_dangerous_syscalls(self):
        machine = platform.machine().lower()
        if machine == "x86_64":
            expected = {101, 165, 166, 155, 308, 272, 428, 429, 430, 442}
        elif machine == "aarch64":
            expected = {117, 40, 39, 41, 268, 97, 428, 429, 430, 442}
        else:
            self.skipTest(f"No hay política seccomp validada para {machine}")
        self.assertTrue(expected.issubset(set(os_isolation.blocked_syscall_numbers())))

    def test_bubblewrap_seccomp_bootstrap_is_valid_python(self):
        compile(command_sandbox._BWRAP_SECCOMP_BOOTSTRAP, "<bwrap-seccomp-bootstrap>", "exec")

    def test_filter_rejects_unknown_architectures_and_x32_abi(self):
        program = os_isolation.seccomp_filter_program("x86_64")
        self.assertIn((0x45, 0, 1, 0x40000000), program)
        self.assertEqual(program[-1], (0x06, 0, 0, 0x7FFF0000))
        with self.assertRaisesRegex(RuntimeError, "política validada"):
            os_isolation.seccomp_filter_program("unsupported-cpu")

    def test_allowlist_resolves_only_known_binary_names_plus_the_task_interpreter(self):
        import shutil
        paths = exec_policy.allowed_executable_paths([shutil.which("bash") or "/bin/sh"])
        resolved = {str(Path(path).resolve()) for path in paths}
        if shutil.which("bash"):
            self.assertIn(str(Path(shutil.which("bash")).resolve()), resolved)
        if shutil.which("id"):
            self.assertNotIn(str(Path(shutil.which("id")).resolve()), resolved)

    def test_exec_allowlist_allows_selected_tools_and_blocks_other_system_binaries(self):
        import shutil
        if not os_isolation.available() or not shutil.which("id") or not shutil.which("cat"):
            self.skipTest("Sandbox o los binarios de prueba no están disponibles")
        code = """import subprocess
try:
    subprocess.run([\"id\"], check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
except PermissionError:
    print(\"id-blocked\")
else:
    print(\"id-allowed\")
print(subprocess.check_output([\"cat\", \"note.txt\"], text=True).strip())
"""
        with tempfile.TemporaryDirectory(prefix="ely-exec-allowlist-") as td:
            Path(td, "note.txt").write_text("cat-allowed", encoding="utf-8")
            result = os_isolation.run(
                [sys.executable, "-c", code], cwd=td, workspace=td,
                timeout=10, writable=False,
            )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.splitlines(), ["id-blocked", "cat-allowed"])

    def test_proc_sys_and_dev_are_denied_inside_sandbox(self):
        if not os_isolation.available():
            self.skipTest("Landlock, seccomp-bpf o unshare no están disponibles")
        code = """import os
for path in (\"/proc/self/status\", \"/sys/kernel\", \"/dev/null\"):
    try:
        fd = os.open(path, os.O_RDONLY)
    except PermissionError:
        print(\"blocked\", path)
    else:
        os.close(fd)
        print(\"accessible\", path)
"""
        with tempfile.TemporaryDirectory(prefix="ely-pseudofs-") as td:
            result = os_isolation.run(
                [sys.executable, "-c", code], cwd=td, workspace=td,
                timeout=10, writable=False,
            )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.splitlines(), [
            "blocked /proc/self/status", "blocked /sys/kernel", "blocked /dev/null",
        ])

    def test_seccomp_blocks_ptrace_and_mount_in_isolated_process(self):
        if not os_isolation.available():
            self.skipTest("Landlock, seccomp-bpf o unshare no están disponibles")
        with tempfile.TemporaryDirectory(prefix="ely-seccomp-") as td:
            code = (
                "import ctypes, errno, os; libc=ctypes.CDLL(None,use_errno=True); "
                "ptrace=libc.syscall(101,0,0,0,0); ptrace_errno=ctypes.get_errno(); "
                "ctypes.set_errno(0); mount=libc.syscall(165,0,0,0,0,0); mount_errno=ctypes.get_errno(); "
                "print(ptrace_errno, mount_errno, os.getpid(), os.getuid())"
            )
            result = os_isolation.run(
                [sys.executable, "-c", code], cwd=td, workspace=td,
                timeout=10, writable=False,
            )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.strip(), f"{errno.EPERM} {errno.EPERM} 1 0")


if __name__ == "__main__":
    unittest.main()
