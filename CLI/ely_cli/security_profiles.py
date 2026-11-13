"""Opt-in Linux LSM profile selection for agent command sandboxes.

The policy must be installed and loaded by an administrator before enabling it.
If the user opts in and the launcher is unavailable, sandbox creation fails closed.
"""
from __future__ import annotations

import os
import re
import shutil

APPARMOR_ENV = "ELY_SANDBOX_APPARMOR_PROFILE"
_PROFILE_NAME = re.compile(r"^[A-Za-z0-9_.-]{1,64}$")


def apparmor_profile() -> str | None:
    """Return a validated opt-in profile name, or None when LSM confinement is off."""
    value = os.environ.get(APPARMOR_ENV, "").strip()
    if not value:
        return None
    if not _PROFILE_NAME.fullmatch(value):
        raise ValueError(f"{APPARMOR_ENV} contiene un nombre de perfil inválido")
    return value


def apparmor_exec_prefix() -> list[str]:
    """Return an aa-exec prefix; never silently ignore an explicitly requested profile."""
    profile = apparmor_profile()
    if profile is None:
        return []
    executable = shutil.which("aa-exec")
    if not executable:
        raise RuntimeError(f"{APPARMOR_ENV} está configurado pero aa-exec no está instalado")
    return [executable, "-p", profile, "--"]
