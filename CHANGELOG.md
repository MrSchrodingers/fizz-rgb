# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> 🇧🇷 Notas em português estão no final de cada release como bloco `### PT-BR notes`.

## [Unreleased]

_Nothing yet._

## [0.3.0] — 2026-05-20

The games drop. A wave of new host-streamed games and effects — most of them playable directly from the physical keyboard while you keep typing — bringing the catalogue to 40+ animations/games. Each engine renders on the real ragged key matrix (one key = one cell), is fuzz-tested for crash-freedom and valid LED output, and has a headless winnability/progression bot. Test suite grew 140 → 183.

### Added

#### Reactive effects (respond to your typing, no menu)

- **Ripple** — each keypress emits an expanding, fading ring of light from that key.
- **Spark** — the pressed key glows white-hot then cools through a fire palette, with a small bloom to its neighbours.
- **Binary clock** — wall-clock HH:MM:SS as six BCD bit-columns (hours red, minutes green, seconds azure).
- **Doom PSX fire** — the classic upward fire algorithm flickering from the bottom row.

#### Games on the physical keyboard

- **Whac-A-Mole**, **Bullet-hell** (WASD dodge), **Drag Race** (Space rev / Enter shift), **Frogger** (WASD cross the traffic) — arcade games with a difficulty menu (press 1-5).
- **Flappy Bird** — Space to flap; gentle physics tuned for the 5-row board.
- **Physical Wordle** — type 5-letter words; the letter keys light green / yellow / dark with the best-known status per letter. Backspace erases, Enter submits, six guesses.
- **Keyboard Crawl** — turn-based roguelite in a dungeon larger than the board, with a torch-lit camera, fog-of-war, enemies, items, stairs, permadeath, and a persistent +HP meta-bonus.
- **Cursed Keyboard** — a red contagion spreads key-to-key; press infected keys to cleanse before the board is overrun.
- **Idle Garden** — plots grow seed → sprout → mature in real time; tap to harvest or let it auto-harvest; currency auto-buys plots/growth. Persists across sessions.
- **Roguelite deck-builder** — a Slay-the-Spire-lite: hand on the home row (A-S-D-F-G), Space ends the turn, reward picks, bosses, and meta-progression.
- **Genius / Simon**, **Pacman**, **DOOM** raycaster FPS, **Space Invaders**, **Super Mario**, **Pong 2P**, interactive **Snake** / **Breakout** — playable from the physical keyboard via the evdev listener.

#### Engine & GUI

- Difficulty menus (1-5) shared across the menu games; editable palette slots for stateful presets; gentler Space Invaders descent; DOOM enemies in turret mode.
- New presets, animated thumbnails, and palette declarations for every new game/effect.
- Meta-progression for Keyboard Crawl / Idle Garden / Deck-builder persists to `~/.config/fizz-rgb/saves/` (ESM `node:fs`, best-effort — never crashes the daemon).

### Fixed

- All interactive games render on the **physical key matrix** instead of the old uniform grid, so nothing collapses onto the wide spacebar on the bottom rows.

## [0.2.0] — 2026-05-19

Massive UX + content drop. The headline: 22 new presets (including stateful day/night cycles + an interactive Pong game playable from the physical keyboard), a global tonality selector with vibrancy slider that reaches stateful daemon animations, animated thumbnails for every preset, drag-to-paint, undo/redo, live perkey state mirroring between GUI and daemon, and a polish pass on perf, IPC robustness, and accessibility.

### Added

#### Installer & autostart

- `./tools/install.sh --easy` one-shot mode: builds the AppImage, installs the application launcher + autostart `.desktop` (GUI starts hidden in the system tray on login), and enables the systemd-user unit. Plus `--with-gui`, `--autostart-gui`, `--no-enable` for granular control.
- Installer is no longer Fedora-specific. Works on any modern distro with systemd-user + npm + udev (Fedora 43+, Ubuntu 22.04+, Arch, openSUSE Tumbleweed).
- Multi-size hicolor icon set (16, 22, 24, 32, 48, 64, 96, 128, 192, 256, 384, 512 px) generated from `packages/gui/resources/icon.svg`, installed automatically.

#### GUI — Sprint 1 (UI foundation + interactions + layout)

- Design tokens + Button/IconButton primitives in `components/ui/`. Focus rings, WCAG AA contrast bumps, standardized disabled states across every component.
- ConnectionBanner exposes `role="alert"` + `aria-live="polite"`. `prefers-reduced-motion` honoured globally.
- Undo/redo with 50-step history (`historyStore`), wired to Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y. Snapshots fire on paint, paint-by-text, reset, preset apply, and drag-paint completion.
- Color history: last 8 brush colors persisted to localStorage. 15 curated palettes (RGB, Pride, Trans, Cyberpunk, Vaporwave, Synthwave, Aurora, Sunset, Forest, Ocean, Brazil, Halloween, Christmas, Pastel, Mono-fuchsia).
- Drag-to-paint mode: click + drag the 3D keys to paint, Alt-drag to erase. `tap-to-test` mode: click virtual key to briefly flash the corresponding physical key.
- Global keyboard shortcuts: Ctrl+Z/Y, Ctrl+A (select all in paint mode), Esc (clear selection). Input fields are excluded.
- Sidebars auto-collapse below 1400px (`useMediaQuery` + `uiStore`). Manual collapse persisted to localStorage.
- Footer `StatusBar`: daemon health dot, active effect or preset, history depth, clock.
- Profile search filter appears once there are more than 4 profiles.
- First-load help overlay over the 3D viewport.

#### GUI — Sprint 2 (live perkey mirroring)

- New IPC method `perkey.current` + broadcast `perkey.changed`. Daemon now publishes `effect.changed`, `device.changed`, AND `perkey.changed` so the GUI mirrors stateful animation state in real time.
- App boots by hydrating paintStore from `perkey.current`, then keeps it in sync via the subscription — so a pattern started via the CLI shows up correctly in the GUI.
- Fade-in pulse on viewport key changes (each Key stamps a `lastChangedAt` ref; emissiveIntensity gets a 1.0 → 0 decay over 300ms on top of the base).

#### Daemon — interactive Pong + evdev capture

- New `pong-interactive` animation type. Layout-aware K617 mapping:
  - Number row 1-4 = player score (red)
  - Number row 6-9 = AI score (blue)
  - Number row 5 = serve indicator
  - Tab / CapsLock / LShift / LCtrl = player paddle slots 0..3
  - Backslash / Enter / RShift / RCtrl = AI paddle slots
  - Rows 1..4 = ball play area (sparse: only lit keys get color)
- Player paddle has a ±1 row hit-detection radius (forgiving), AI uses strict equality. AI miss rate 50% with 4-tick re-target lag.
- 1-cell fading trail behind the ball for motion blur on the discrete grid.
- Ball speed driven by `pattern.animSpeed`.
- New IPC `perkey.gameInput({ paddleSlot })`. GUI click on Tab/Caps/LShift/LCtrl in the viewport forwards the slot.
- **Physical-keyboard input via evdev**: `KeyCapture` opens `/dev/input/event*` for the K617 (auto-discovered by VID/PID), parses raw input_event records, and forwards Tab/Caps/LShift/LCtrl keydowns to the engine — multiple concurrent readers are fine (the OS keeps receiving keys normally). udev rule extended to grant fizzd read access without privileged group membership.

#### Daemon — system integration

- New `minecraft-day` animation: 30-second day/night cycle with sky palette transitions (night → dawn → day → sunset → twilight), sun arc across columns during the day, moon arc + deterministic star twinkles at night, three white clouds drifting at different rows/speeds. Layout-aware: row 3 = grass (surface), row 4 = dirt (underground).
- New `aquarium` animation: depth gradient (surface → mid → floor → sand), six rising bubbles at staggered speeds, an orange fish slowly traversing the middle rows.
- New `cpu-thermal` animation: reads `/sys/class/thermal/thermal_zone*/temp` once per second, renders the keyboard as a vertical heat gauge (full intensity below the fill line, dim above). Palette: blue / cyan / green / yellow / orange / red.
- New `Scheduler` module: time-of-day rules in `~/.config/fizz/schedule.json` fire profile activations on the minute. Opt-in via the file.
- DBus notification flash (`NotifFlash`): listens on the session bus for `org.freedesktop.Notifications.Notify`, flashes white for 250ms. Lazy-loaded `dbus-next`; opt-in via `FIZZ_NOTIF_FLASH=1`.

#### Presets — 22 new built-ins

- **Themed cycles** (stateful, layout-aware): Minecraft Day/Night, Aquarium.
- **Cinematic / cultural**: Cyberpunk, Vaporwave, Synthwave, Tron Grid, Aurora, Forest Fire.
- **Brazil category**: Brazil Flag (with central blue circle inside the yellow losango), Carnival (chase along a samba snake-order), June Festival (flag-wave bonfire), Independence Day, Halloween (vertical gradient with wave drift).
- **Productivity category**: Vim Mode, WASD Gaming, VS Code shortcuts, Touch Typing rows.
- **Pattern visuals**: DNA Helix, Plasma Fluid, Heart Pulse (radial pink → red), "Hello" typewriter.
- **Games**: CPU Thermal, **Pong (you vs AI)** — interactive, physical-key driven.

#### Tonality system

- Global tonality selector at the top of the Preset sidebar with five style chips (Original / Vivid / Neon / Pastel / Mono) and a 0.4×–2.0× vibrancy slider. Persisted to localStorage. Each style auto-presets a vibrancy value so clicking a chip is immediately visible on stateful presets too.
- `pattern.vibrancy` field in the IPC schema. Daemon engines apply `applyVibrancyInPlace` over every rendered frame, so Minecraft / Aquarium / games / CPU Thermal all honour the slider.
- Direct RGB vibrancy transform on the client side: `v<1` dims linearly, `v>1` pushes the dominant channel toward 255 and pulls weak channels toward 0 (closer to pure-channel saturation at the maximum).
- Per-preset `PresetEditor` (Sliders icon on the active card): same style chips, vibrancy slider, plus a list of unique colors as editable swatches that re-apply live and can be saved as a user preset.

#### Animated thumbnails

- `lib/thumbnailRenderer.ts` + `useSharedClock`: one shared `requestAnimationFrame` loop throttled to 12fps drives every thumbnail in sync. Per-animType renderer produces bespoke 6×5 simulations for the 13 stateful animations (pong, snake, tetris, breakout, fireworks, dvd, heart-rate, equalizer, rule30, cpu-thermal, matrix-rain, minecraft-day, aquarium) plus modulated samples for color-bearing presets.

#### Performance + IPC robustness

- `computeFrameInto` — in-place variant of `computeFrame` that mutates a reused buffer. Daemon's 30fps stream now allocates ~0 frames/sec instead of ~30.
- Stream backpressure flag (`pendingSend`) skips a tick if the previous HID write hasn't completed, preventing unbounded frame queueing on USB stalls.
- Per-request 5s timeout via `Promise.race` in the IPC dispatcher.
- Slow-client disconnect: broadcast detects writableLength > 1MB and severs the client instead of bloating the kernel buffer silently.
- LedIndex range validation via Zod (`KeysSchema`): perkey.set / perkey.startPattern reject keys outside [0, 60].
- HID send retries (2× with 5ms gap) before declaring disconnect — survives transient USB stalls.
- Profile schema migrations framework: versioned + dangling-active-reference repair on load.
- Single source of truth for `AnimType` — derived from the Zod schema in `@fizz/core/ipc`.

#### Tests

- `perf.test.ts` — sustained 30fps blink stream over 60 frames with heap delta assertion. CPU thermal smoke test.
- `ipc-fuzz.test.ts` — malformed JSON, missing/unknown method, null id, out-of-range ledIndex, non-hex color, animSpeed > 1, large valid payload.

### Fixed

- AppImage build broken in npm workspaces — `electronVersion` pinned in the build config so electron-builder doesn't need to walk the hoisted node_modules.
- Window opened with the default Electron atom icon — `BrowserWindow({ icon })` + `app.setName('fizz-rgb')` matching the .desktop `StartupWMClass`.
- Speed slider was a no-op for stateful game presets (the `keyColors.size === 0` early-return swallowed every IPC call). Removed the gate.
- PresetGallery scroll was stuck — `h-full` on the wrapper/aside so the inner overflow-y-auto list has bounded height.
- Minecraft initially rendered dirt above grass + a double-green strip on row 2. Now row 3 = grass (single surface row), row 4 = dirt; row 2 stays pure sky.
- Active preset highlight in PresetGallery + auto-re-tint when brush color changes while tint mode is on.
- Daemon broadcast `perkey.changed` was missing for game-class animations.

### Changed

- 22 preset names standardized to English (Bandeira do Brasil → Brazil Flag, Carnaval → Carnival, Festa Junina → June Festival, 7 de Setembro → Independence Day, Aquário → Aquarium, plus a sweep across older presets).
- Saturated all new preset palettes — the K617's white keycaps swallow pastel colors. Wave intensity floor lifted from 0.3 → 0.55.
- udev rule covers input subsystem + event* nodes (MODE=0666) for the Pong evdev path.
- `tools/install.sh` header no longer claims Fedora-only.

### Deferred

See [`docs/roadmap/deferred-work.md`](docs/roadmap/deferred-work.md) for the items intentionally left as future work — plugin system for custom animations, cloud sync via GitHub Gist, audio visualizer (PipeWire), mobile companion app, reactive typing trails.

### PT-BR notes

Release massivo focado em UX e conteúdo. Destaques:

- **Pong jogável no teclado físico**: Tab/Caps/Shift/Ctrl mexem a barra vermelha, AI permissiva, placar até 4. Funciona sem precisar manter a GUI focada — daemon lê evdev em paralelo com o OS.
- **22 presets novos** incluindo Minecraft Day/Night (com sol arcando, nuvens, noite com lua/estrelas), Aquário (bolhas e peixinho), CPU Thermal heatmap em tempo real, e categorias Brasil + Productivity.
- **Tonalidade global** no topo da sidebar: cinco chips (Vivid/Neon/Pastel/Mono/Original) + slider de vibrância. Funciona em animações stateful (daemon aplica em cada frame).
- **Miniaturas animadas** que mostram o que cada preset realmente faz.
- **Drag-to-paint**, undo/redo, color history, sidebars colapsáveis, status bar no rodapé.
- **Live mirror** entre GUI e daemon — patterns trocadas via CLI aparecem corretamente na GUI 3D.

[Unreleased]: https://github.com/MrSchrodingers/fizz-rgb/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/MrSchrodingers/fizz-rgb/releases/tag/v0.2.0

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

[0.1.0]: https://github.com/MrSchrodingers/fizz-rgb/releases/tag/v0.1.0
