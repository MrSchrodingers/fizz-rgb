# Deferred work

These items came out of the consolidated review session but were deliberately
deferred — each one is a full system with its own design surface, not a
slot-in change. Captured here so the design intent isn't lost.

## Plugin system for custom animations

**Goal:** a user drops `~/.config/fizz/animations/my-effect.js` into a watched
directory and the daemon hot-loads it as a new `AnimType`.

**Why deferred:** safe code loading inside a long-lived daemon needs a sandbox
(`vm` module or worker thread), a stable contract (`(t: number) => Map<number,
Color>`), and lifecycle hooks for state-bearing effects. The API needs to be
versioned from day one or every plugin breaks on the first daemon upgrade.

**Sketch:**

```
// API surface for plugins (v1 — frozen once shipped)
export interface FizzAnimation {
  name: string;            // unique, registered as AnimType extension
  version: 1;
  init?(): void;
  render(t: number, prev: Map<number, Color>): Map<number, Color>;
}
```

Watchdog: `chokidar` on the directory; lazy-load via `await import(file)` then
`vm.createContext` with a frozen `Color`/`Pattern` exposure surface. The daemon
rejects modules that throw on init or that don't respect the 30fps deadline
(measure render time, drop if > 16ms three times in a row).

## Cloud sync via GitHub Gist

**Goal:** `fizz sync push` writes profiles + user presets to a private Gist
under the user's GitHub account; `fizz sync pull` merges them back.

**Why deferred:** needs `gh` auth flow OR direct OAuth device-code flow, plus
conflict resolution semantics for the profile JSON (last-write-wins vs CRDT
merge). And we'd be exfiltrating user settings to a third party — that needs
opt-in plumbing and a clear privacy story.

**Sketch:**

- New CLI commands `fizz sync push|pull|status` reading `~/.config/fizz/sync.json`.
- Auth via `gh auth token` if the CLI is installed; fallback to OAuth device flow.
- Gist payload identical to the existing `fizz-profiles-*.fizzpattern.json`
  exports — just transit-layered, not a new schema.
- Three-way merge: gist + local + last-known-base. Conflicts surface as a
  prompt in the GUI's Profile sidebar.

## Audio visualiser (PipeWire / PulseAudio)

**Goal:** a new `audio-equalizer` `AnimType` that reads system audio in real
time and drives bar heights from FFT bins.

**Why deferred:** requires linking against `node-pulse-simple` or spawning
`parec` to capture monitor sources. Either path needs a permission grant
(PipeWire portal or PulseAudio access) and adds a native dependency that
breaks the "no external deps" property the daemon currently enjoys.

**Sketch:**

- `audio-source` daemon module spawning `parec --format=float32le
  --rate=22050 --channels=1` on the default monitor.
- 1024-sample windowing → real FFT via `fft-js` or `webfft` → 14 logarithmic
  bins matching the keyboard column count.
- Reuses the existing `EqualizerEngine` render path but with bar heights
  driven by FFT magnitudes instead of `Math.random`.

## Mobile companion app

**Goal:** Android/iOS app that controls the daemon over the LAN.

**Why deferred:** brand new project — needs networking transport (mDNS
discovery, TLS or shared secret), auth (pairing flow), and a separate UI
codebase. Out of scope for the desktop monorepo.

**Sketch:**

- Daemon publishes `_fizz-rgb._tcp` via Avahi/mDNS.
- New `tcp.json` transport mirroring the existing Unix-socket JSON-RPC,
  gated behind a per-machine token.
- Mobile app = React Native, reuses `@fizz/core` types verbatim.

## DBus notification flash

**Goal:** listen for `org.freedesktop.Notifications.Notify` signals on the
session bus and flash the keyboard white for 200ms when one arrives.

**Why partial:** doable in ~30 lines with `dbus-next`, but adds a runtime
dependency and a permission story (the daemon currently runs as a plain user
service with no DBus surface). When we do ship this:

- `dbus-next` dependency, lazy-required so it doesn't break boot if missing.
- New IPC method `notif.subscribe({ enabled: bool })` (opt-in).
- On `Notify(...)`: stash current effect, push white frame, schedule restore
  via `engine.runEffect(savedName, savedParams)` after 200ms.

## Reactive typing / keystroke heatmap

**Goal:** each physical keypress lights its key with a fade-out trail
(reactive), and a parallel counter accumulates a heatmap that brightens
frequently-used keys over the day.

**Why deferred:** Linux global key capture is privileged: needs either
`/dev/input/event*` access (root or `input` group) or a privileged helper
running under `evdev`. The current daemon runs unprivileged via udev rules
scoped to the K617 HID interface only — adding global key capture is a
meaningful security-model expansion.

**Sketch path:**

- Optional `fizzd-input` helper running as a small setuid binary or under
  `CAP_DAC_READ_SEARCH`, reading evdev events and forwarding them over a
  local socket to the unprivileged daemon.
- New `AnimType` `reactive` that overlays brush-color trails on top of a
  base pattern.
- Heatmap = persisted counter map + render that maps count → brightness.
