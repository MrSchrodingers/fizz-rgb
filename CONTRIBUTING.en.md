# Contributing to fizz-rgb

> 🇧🇷 [Versão em português](CONTRIBUTING.md)

Thanks for your interest in contributing! This guide shows how to set up your environment, propose changes, and open a PR with a high chance of getting merged quickly.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Reporting bugs](#reporting-bugs)
- [Suggesting features](#suggesting-features)
- [Development setup](#development-setup)
- [Contribution workflow](#contribution-workflow)
- [Code standards](#code-standards)
- [Testing](#testing)
- [Adding a new animation](#adding-a-new-animation)
- [Adding a new game](#adding-a-new-game)
- [Commit messages](#commit-messages)

## Code of Conduct

This project follows the [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you agree to abide by it.

## Reporting bugs

1. Confirm you are on the latest version (`git pull` + `npm install`).
2. Check [existing issues](https://github.com/MrSchrodingers/fizz-rgb/issues) — it may already be reported.
3. Open a new issue using the **Bug Report** template, including:
   - Version of `fizz` and `fizzd` (`fizz --version`).
   - Distribution and kernel version (`uname -a`).
   - Output of `lsusb | grep 258a`.
   - Daemon logs (`fizz daemon logs --tail 100`).
   - Steps to reproduce.

## Suggesting features

Open an issue with the **Feature Request** template describing:

- The problem you are trying to solve (do not skip this).
- Proposed solution.
- Alternatives considered.
- Impact on compatibility / performance.

## Development setup

### Prerequisites

- Node.js 22+ (recommended via [nvm](https://github.com/nvm-sh/nvm) or [fnm](https://github.com/Schniz/fnm))
- npm 10+
- A Redragon Fizz K617 keyboard (optional — there is a HID mock for hardware-less development)
- Linux with udev (`hidraw` enabled, default on any mainstream distro)

### Clone and build

```bash
git clone https://github.com/MrSchrodingers/fizz-rgb.git
cd fizz-rgb
npm install
npm run build
npm test
```

### Running locally

Daemon (one terminal):

```bash
node packages/daemon/dist/index.js
```

CLI (another terminal):

```bash
node packages/cli/dist/index.js status
```

GUI in dev mode (Vite + Electron with hot reload):

```bash
npm run dev -w fizz-gui
```

### Without hardware

Set `FIZZ_MOCK_HID=1` before starting the daemon to use the internal mock. Effect commands will print the packets that would be sent to the keyboard.

```bash
FIZZ_MOCK_HID=1 node packages/daemon/dist/index.js
```

## Contribution workflow

1. Fork and create a branch from `main`:
   ```bash
   git checkout -b feat/short-descriptive-name
   ```
2. Make small, focused commits (see [Commit messages](#commit-messages)).
3. Ensure all tests pass and the build is clean:
   ```bash
   npm run build && npm test && npm run lint
   ```
4. Update `CHANGELOG.md` under `## [Unreleased]`.
5. Open a Pull Request filling out the template.
6. React to review comments — do not force-push unnecessarily; we prefer additional commits during review and squash on merge if needed.

## Code standards

- Strict TypeScript (`tsconfig.base.json` is the source of truth).
- ESLint + Prettier run on CI; execute `npm run lint` and `npm run format` before committing.
- No `any` except in justified cases with a `// eslint-disable-next-line` comment.
- Imports use `.js` extension (TS `Bundler` resolution).
- Never import `@fizz/core/encoder` from the renderer (Electron) — only from the daemon, since it uses `node:fs`.

## Testing

- Vitest everywhere. Tests live in `packages/<x>/test/`.
- Minimum expected coverage: new uncovered files will be flagged in PR.
- For USB protocol changes, add a fixture in `packages/core/test/fixtures/` with the expected packet.

```bash
npm test                  # run everything
npm test -w @fizz/core    # core only
npm run test:watch        # watch mode
```

## Adding a new animation

Stateless animations (no mutable state between frames) — requires 6 file edits:

1. `packages/core/src/animations.ts` — add to the `AnimType` union.
2. `packages/core/src/ipc.ts` — add to `AnimTypeSchema` (z.enum).
3. `packages/gui/src/stores/paintStore.ts` — add to `AnimType`.
4. `packages/gui/src/types/window.d.ts` — update `perkeyStartPattern`.
5. `packages/gui/src/components/PaintToolbar.tsx` — add to the `ANIM_TYPES` array.
6. `packages/gui/src/App.tsx` — add to `validAnimTypes`.

For an example, search the repo for `'chase'`.

## Adding a new game

Games have mutable state and run in the daemon at 30fps:

1. Copy the pattern from `PongEngine` or `SnakeEngine` in `packages/daemon/src/engine.ts`.
2. Implement `step()` and `render(): Map<number, Color>`.
3. Add a `case` in `EffectEngine.startPattern`.
4. Add a preset in `packages/core/src/presets.ts` with empty `keys:{}` and the new `animType`.
5. Add a test in `packages/daemon/test/engine.test.ts`.

## Commit messages

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<optional scope>): <short description>

[optional body explaining why]

[optional footer, e.g. Closes #123]
```

Types:

- `feat` — new feature
- `fix` — bug fix
- `refactor` — change that neither fixes a bug nor adds a feature
- `docs` — docs only
- `test` — adding or adjusting tests
- `chore` — maintenance, deps, build, CI
- `perf` — performance improvement

Examples from current history:

```
feat(gui): 3D polish — RoundedBox keycaps + bloom post-processing
fix(gui): allow saving game-animation presets even with empty keys map
docs(gui): clarify firmware-vs-PC persistence in sidebar labels
```

Please **do not** include `Co-Authored-By:` trailers from AI assistants — credits go in the PR description if relevant.
