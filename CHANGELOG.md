# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> 🇧🇷 Notas em português estão no final de cada release como bloco `### PT-BR notes`.

## [Unreleased]

### Added

- _Nothing yet — propose a feature in the [issues](https://github.com/MrSchrodingers/fizz-rgb/issues)._

## [0.1.0] — 2026-05-18

First public release. Covers Phase 1 (reverse engineering + daemon + CLI), Phase 2 (Electron GUI with 3D keyboard model), and Phase 3 (per-key direct control + game animations).

### Added

#### Reverse engineering & protocol

- Full reverse engineering of the firmware-effect protocol from OpenRGB issue #2172 USB captures (8 firmware effects).
- Per-key direct protocol via the Sinodragon project — 382-byte single HID feature report with header `08 0A 7A 01` followed by 96 RGB triplets in column-major order. Anchor positions verified on hardware: `Esc=0`, `Tab=2`, `Caps=3`, `LShift=4`, `LCtrl=5`, `J=45`, `Space=35`, `Enter=81`.
- Wire-protocol notes in [`docs/reverse-engineering/protocol.md`](docs/reverse-engineering/protocol.md).

#### Daemon (`fizzd`)

- HID handle with automatic reconnect on USB events.
- `EffectEngine` supporting firmware effects, per-key static, and per-key streaming animations.
- `ProfileManager` with atomic JSON writes to `~/.config/fizz/profiles.json`.
- JSON-RPC 2.0 IPC server over Unix socket at `$XDG_RUNTIME_DIR/fizz.sock`.
- Auto-resume of the last pattern when the keyboard reconnects (`lastPattern`, `lastPerKeyColors`, `lastNamedEffect`).
- Stateful game engines for 12 animations running at 30 fps.
- Game grid helper: 14×5 with nearest-neighbour fallback for irregular K617 rows.
- Structured logging via Pino (`FIZZ_LOG_LEVEL` env var, pretty in dev).

#### CLI (`fizz`)

- `commander.js`-based command suite: `status`, `set`, `effect`, `profile`, `daemon`.
- Thin client over the IPC socket — no direct HID access.

#### GUI (`fizz-gui`)

- Electron 42 + Vite + React 19 + Tailwind 4 + Zustand.
- React Three Fiber 9 + drei 10 3D model of the K617 with `RoundedBox` keycaps and bloom post-processing.
- Per-key click selection, hover ring, text-to-paint mode.
- Animation toolbar with `solid`, `blink`, `chase`, `wave`, `typewriter`, `marquee`, `flag-wave`, speed slider.
- 22 built-in presets across word, shape, pattern, gradient, theme, and game categories.
- User-defined presets via in-app modal (replaces Electron-incompatible `window.prompt`).
- Auto-save current state every 500 ms to `localStorage`; auto-restore on boot.
- Portable `.fizzpattern.json` export/import for cross-machine transfer.
- System tray with show/hide/quit menu — closing the window hides it.
- Timeline editor for capturing frames and replaying at configurable FPS.
- `electron-builder` configuration for `linux/AppImage` target.

#### Installation & packaging

- npm workspaces monorepo: `@fizz/core`, `fizzd`, `fizz`, `fizz-gui`.
- `tools/install.sh` — one-shot install: build, symlink binaries to `~/.local/bin`, install systemd-user unit, install udev rule.
- `tools/install-udev.sh` — Fedora-compatible (`MODE=0666` + `TAG+="uaccess"`, no dependency on the `plugdev` group).
- systemd-user unit at `~/.config/systemd/user/fizzd.service`.
- 129/129 vitest tests across 12 test files.

#### Repository hygiene

- MIT license.
- Contributor Covenant 2.1 code of conduct.
- Bilingual (EN + PT-BR) README, CONTRIBUTING, SECURITY, CHANGELOG.
- GitHub Actions CI: build + test + lint + typecheck on Node 22 LTS.
- Issue and pull-request templates.
- Dependabot weekly updates for npm and GitHub Actions.

### Known limitations

- Custom per-key patterns and games **cannot persist on the keyboard NVRAM** — only firmware effects survive disconnect. Streaming requires the daemon to be running.
- `Menu` (pos 65) and `RCtrl` (pos 71) positions in `K617_TO_SINODRAGON_POS` are best-guess from the Sinodragon full-size layout and may need adjustment.
- `tools/install-udev.sh` uses `MODE=0666` (world-writable for the K617 HID interface) because Fedora has no `plugdev` group. Switch to `GROUP=input` for multi-user systems.
- Three.js prints `PCFSoftShadowMap` deprecation warnings every render — cosmetic, drei v10 internal.

### PT-BR notes

Primeira release pública. Cobre Fase 1 (RE + daemon + CLI), Fase 2 (GUI Electron com teclado 3D) e Fase 3 (controle per-key direto + games).

Pontos pra ficar de olho:

- Patterns customizadas per-key e games **não persistem na NVRAM** do teclado. Só efeitos firmware sobrevivem ao disconnect.
- A regra udev usa `MODE=0666` (mundo pode escrever na interface HID do K617) por falta do grupo `plugdev` no Fedora. Pra multi-usuário, troque pra `GROUP=input`.

[Unreleased]: https://github.com/MrSchrodingers/fizz-rgb/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/MrSchrodingers/fizz-rgb/releases/tag/v0.1.0
