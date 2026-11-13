# Per-command Linux LSM hardening

Ely's OS sandbox already fails closed unless it can establish its namespace and
Landlock/seccomp controls. AppArmor is an additional, administrator-installed
layer and is **opt-in** because policy loading requires host configuration.

## AppArmor (experimental)

1. Copy `ely-agent-sandbox.apparmor` to `/etc/apparmor.d/ely-agent-sandbox`.
2. Review the rules for the distribution's Python and executable paths.
3. Load it as an administrator, for example:

   ```sh
   sudo apparmor_parser -r /etc/apparmor.d/ely-agent-sandbox
   ```

4. Start Ely with the profile enabled:

   ```sh
   ELY_SANDBOX_APPARMOR_PROFILE=ely-agent-sandbox ./CLI/ely serve
   ```

The sandbox invokes `aa-exec` around its bootstrap. If the variable is set but
`aa-exec` is unavailable, or the named profile is not loaded/usable, command
execution fails rather than silently dropping the requested LSM layer. Leave
the variable unset to use the existing namespace + Landlock + seccomp sandbox
without AppArmor.

The included profile is a starting policy, not a universally validated one.
It intentionally denies `/proc`, `/sys`, `/dev`, `.git`, and obvious local key
files, allows the private snapshot paths, and permits netlink only for loopback
setup. Distribution-specific path layouts and AppArmor parser versions may
require adjustments. Ely does not load the profile automatically or need root.

## SELinux

SELinux policy generation/loading and `runcon` integration are not implemented
yet. A working SELinux domain needs administrator-approved type transitions
and file labels; a generic policy shipped by Ely could grant broader access
than intended. Until that policy is reviewed and tested on a SELinux host, the
OS sandbox relies on namespaces, Landlock, and seccomp instead.
