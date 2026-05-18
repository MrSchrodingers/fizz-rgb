# fizz-rgb

> 🇧🇷 [Leia em português](README.pt-BR.md)

[![CI](https://github.com/MrSchrodingers/fizz-rgb/actions/workflows/ci.yml/badge.svg)](https://github.com/MrSchrodingers/fizz-rgb/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node 22+](https://img.shields.io/badge/node-%3E%3D22-339933?logo=node.js&logoColor=white)](package.json)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](tsconfig.base.json)
[![Tests: 129](https://img.shields.io/badge/tests-129%20passing-success)](packages)
[![Hardware: K617](https://img.shields.io/badge/hardware-Redragon%20Fizz%20K617-c4302b)](https://www.redragonzone.com/products/redragon-fizz-pro)

Linux RGB controller for the **Redragon Fizz K617** (60% wired mechanical keyboard, USB `258a:0049`, Sinowealth SH68F90A MCU). Fills the gap left by the Windows-only Redragon software.

## Highlights

- **Daemon + CLI + Electron GUI** with a 3D model of the keyboard.
- **8 firmware-native effects** reverse-engineered from USB captures (rainbow, snake, waterfall, sine wave, star twinkle, rainbow blossom, wheel, static).
- **Per-key direct control** via the Sinodragon protocol (382-byte HID feature report).
- **12 game animations** running on real hardware at 30 fps — Pong, Snake, Tetris (sideways), Matrix Rain, Breakout, Fireworks, DVD Bouncer, Heart Rate ECG, Equalizer, Rule 30, plus FPS Gamer and MMO Hotkeys presets.
- **22 built-in presets** (words, shapes, patterns, gradients, themes, games).
- **Persistence**: profiles in `~/.config/fizz/profiles.json`, per-key patterns in browser `localStorage`, portable export/import via `.fizzpattern.json`.
- **System tray**, auto-restore on boot, auto-resume on keyboard reconnect, AppImage build.
- **129/129 vitest tests** across daemon, CLI, core, and GUI.

## Architecture

```
┌─────────────┐ JSON-RPC 2.0  ┌────────────┐ HID feature reports  ┌──────────┐
│  fizz CLI   │ ───────────▶  │   fizzd    │ ────────────────────▶│  K617    │
└─────────────┘  Unix socket  │  (daemon)  │       58a:0049       │ keyboard │
┌─────────────┐               │            │                      └──────────┘
│  fizz-gui   │ ───────────▶  │ EffectEng. │
│ (Electron)  │               │ ProfileMgr │
└─────────────┘               └────────────┘
```

- `@fizz/core` — shared types, protocol encoders, presets, animations.
- `fizzd` — the only process that holds the HID handle; runs game engines.
- `fizz` — thin CLI client over the IPC socket.
- `fizz-gui` — Electron + React 19 + Three.js (R3F + drei) + Tailwind 4 + Zustand.

See [`docs/design/specs/2026-05-18-fizz-rgb-controller-design.md`](docs/design/specs/2026-05-18-fizz-rgb-controller-design.md) for the full design, and [`docs/reverse-engineering/protocol.md`](docs/reverse-engineering/protocol.md) for the wire protocol.

## Requirements

- Linux (tested on **Fedora 43**; other distros likely work).
- Node.js **22+** and npm 10+.
- A **Redragon Fizz K617** (USB `258a:0049`).
- `hidraw` kernel module (default on any mainstream distro).

## Install

```bash
git clone https://github.com/MrSchrodingers/fizz-rgb.git /var/www/fizz-rgb
cd /var/www/fizz-rgb
./tools/install.sh        # builds, links binaries, installs systemd unit + udev rule
fizz daemon enable        # autostart on login
fizz status               # sanity check
fizz effect run fw-rainbow
```

The installer:

1. Runs `npm install && npm run build`.
2. Symlinks `fizz` and `fizzd` into `~/.local/bin` (make sure it is on `$PATH`).
3. Installs the systemd-user unit to `~/.config/systemd/user/fizzd.service`.
4. Installs the udev rule (requires `sudo`) — see [SECURITY.md](SECURITY.md#threat-model-and-known-limitations) for the trade-offs.

Unplug and replug the keyboard once after install.

### GUI

```bash
npm run dev -w fizz-gui              # development with hot reload
npm run build:appimage -w fizz-gui   # produce a portable AppImage
```

## CLI cheatsheet

```bash
fizz status                            # device + active effect + daemon
fizz set <color>                       # solid color (#RRGGBB or named)
fizz effect list
fizz effect run <name> [--speed N] [--brightness N] [--color C] [--direction left|right]
fizz effect stop

fizz profile list
fizz profile save <key> --effect <name> [opts]
fizz profile activate <key>
fizz profile delete <key>

fizz daemon {start|stop|restart|enable|disable|status|logs}
```

## Firmware-native effects

| Effect                | Options                                        |
| --------------------- | ---------------------------------------------- |
| `fw-static`           | `--color` (limited palette)                    |
| `fw-rainbow`          | `--speed`, `--brightness`, `--direction`       |
| `fw-snake`            | `--color`, `--speed`                           |
| `fw-sine-wave`        | `--speed`, `--brightness`                      |
| `fw-star-twinkle`     | `--color`, `--density`, `--speed`              |
| `fw-rainbow-blossom`  | `--speed`                                      |
| `fw-waterfall`        | `--color`, `--speed`                           |
| `fw-wheel`            | `--speed`, `--direction`                       |

Firmware effects survive disconnect (the K617 has 8 factory-burned slots).

## Per-key & games (host-streamed)

Per-key custom patterns and the 12 game animations are computed on the host and streamed to the keyboard at 30 fps. They require `fizzd` to be running. They do **not** persist on the keyboard's NVRAM — when the daemon stops, the keyboard reverts to its last firmware effect.

Use the GUI to paint patterns, save user presets, record timelines, or pick from the preset gallery.

## Troubleshooting

| Symptom                                        | Try                                                                                            |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `fizz status` says daemon offline              | `fizz daemon start` (or `systemctl --user start fizzd`). Logs: `fizz daemon logs --tail 50`.   |
| Permission denied on `/dev/hidraw*`            | Re-run `./tools/install-udev.sh`, then unplug+replug the keyboard.                             |
| Daemon cannot find device                      | `lsusb \| grep 258a` should show your K617. If another process holds it: `lsof /dev/hidrawN`. |
| GUI shows "disconnected" banner                | Daemon not running, or socket path differs. Check `$XDG_RUNTIME_DIR/fizz.sock`.                |
| Three.js `PCFSoftShadowMap` warnings           | Cosmetic, drei v10 internal — safe to ignore until upstream fix.                               |

## Hardware compatibility

| Model               | USB ID      | Status            | Notes                                                       |
| ------------------- | ----------- | ----------------- | ----------------------------------------------------------- |
| Redragon Fizz K617  | `258a:0049` | ✅ Fully supported | 61 keys, all 8 firmware effects + per-key + games verified. |
| Other Redragon 60%  | —           | ❓ Unknown         | Same MCU family may work; PRs welcome.                      |

## Roadmap

- More presets (city skyline, traffic light, Pomodoro, typing heatmap, Tux, sports teams).
- More games (Frogger, Whack-a-mole, Simon Says, Asteroids, Pinball, Pacman).
- Graphics polish (motion blur, particle effects on click, better key fonts).
- Optional: PipeWire audio reactivity, per-app profile auto-switch, global hotkey to cycle profiles.
- Stretch: NVRAM persistence for custom per-key (requires firmware dump + Ghidra).

## Documentation

- [`docs/design/specs/`](docs/design/) — architecture and design decisions.
- [`docs/design/plans/`](docs/design/) — implementation plans (Phase 1, animations).
- [`docs/reverse-engineering/protocol.md`](docs/reverse-engineering/protocol.md) — USB wire protocol notes.

## Contributing

PRs welcome! Read [CONTRIBUTING.en.md](CONTRIBUTING.en.md) first.

By contributing you agree to license your work under MIT and abide by the [Code of Conduct](CODE_OF_CONDUCT.md).

## Security

To report a vulnerability, see [SECURITY.md](SECURITY.md). **Please do not file public issues for security bugs.**

## Acknowledgements

- [OpenRGB issue #2172](https://gitlab.com/CalcProgrammer1/OpenRGB/-/issues/2172) — initial USB captures for firmware effects.
- [EvanSunde/Sinodragon](https://github.com/EvanSunde/Sinodragon) — per-key protocol reference for the SH68F90A MCU family.
- [carlossless/sinowealth-kb-tool](https://github.com/carlossless/sinowealth-kb-tool) — firmware tooling.

## License

[MIT](LICENSE) © Matheus Munhoz and fizz-rgb contributors.
