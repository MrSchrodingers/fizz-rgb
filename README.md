# fizz-rgb

Linux RGB controller for the **Redragon Fizz K617** (60% wired mechanical keyboard).
Fills the gap left by the official Windows-only Redragon software.

## Status

**Phase 1** — daemon, CLI, and firmware-native effects working. GUI (Phase 2)
and per-key custom effects (Phase 3) coming later. See `docs/superpowers/specs/`
for the full design.

> **Note:** firmware-effect opcodes are pending USB capture analysis (see
> `docs/superpowers/plans/2026-05-18-fizz-rgb-phase-1.md` task T13). Until then
> `fizz effect run …` sends a stub packet (real LED changes require completing T13).

## Requirements

- Fedora 43+ (other distros likely work; tested on Fedora only)
- Node.js 22+
- Membership in the `plugdev` group (the installer offers to add you)
- A Redragon Fizz K617 (USB ID `258a:0049`)

## Install

```bash
git clone <repo-url> fizz-rgb
cd fizz-rgb
./tools/install.sh
fizz daemon enable
fizz status
fizz effect run fw-rainbow
```

## Commands

```
fizz status                      # device + effect + daemon
fizz set <color>                 # solid color (#RRGGBB or named: red/green/blue/white/off)
fizz effect list
fizz effect run <name> [opts]
fizz effect stop

fizz profile list
fizz profile save <key> --effect <name> [opts]
fizz profile activate <key>
fizz profile delete <key>

fizz daemon {start|stop|restart|enable|disable|status|logs}
```

## Available firmware effects (Phase 1)

| Effect | Options |
|---|---|
| `fw-static` | `--color` (limited palette) |
| `fw-rainbow` | `--speed`, `--brightness`, `--direction` |
| `fw-snake` | `--color`, `--speed` |
| `fw-sine-wave` | `--speed`, `--brightness` |
| `fw-star-twinkle` | `--color`, `--density`, `--speed` |
| `fw-rainbow-blossom` | `--speed` |
| `fw-waterfall` | `--color`, `--speed` |
| `fw-wheel` | `--speed`, `--direction` |

## Troubleshooting

**`fizz status` says daemon offline:**
- `fizz daemon start` or `systemctl --user start fizzd`
- Logs: `fizz daemon logs`

**Permission denied on /dev/hidraw*:**
- Confirm you ran `./tools/install-udev.sh` and that you logged out/in after
  being added to `plugdev`.
- Confirm: `ls -la /dev/hidraw*` shows `plugdev` group on the K617 entry.

**Daemon can't find device:**
- `lsusb | grep 258a` should show your K617.
- If another process holds the hidraw node: `lsof /dev/hidrawN`.

## License

MIT
