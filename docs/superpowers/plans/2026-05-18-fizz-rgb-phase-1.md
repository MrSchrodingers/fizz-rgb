# Fizz RGB Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a working Linux daemon + CLI that controls the Redragon Fizz K617 keyboard's built-in firmware RGB effects (rainbow, snake, waterfall, etc.) via reverse-engineered USB HID protocol, with `fizz effect run fw-rainbow` ending up changing real LEDs on the keyboard.

**Architecture:** Node.js daemon (`fizzd`) holds the single HID handle, exposes a JSON-RPC API over a Unix domain socket. CLI (`fizz`) is a thin commander.js client. Shared `@fizz/core` package owns protocol encoders, types, color helpers, and the K617 key layout. systemd-user manages the daemon lifecycle. udev rule grants the unprivileged user read/write access to `/dev/hidraw*`.

**Tech Stack:** TypeScript (strict), Node.js 22+, npm workspaces, node-hid, Zod (validation), Pino (logging), commander.js (CLI), Vitest (testing), systemd --user, udev.

---

## File Structure

Files created in this plan (final layout for Phase 1):

```
fizz-rgb/
├── package.json                              # workspace root (T2)
├── tsconfig.base.json                        # shared TS config (T3)
├── .eslintrc.json, .prettierrc.json         # T4
├── vitest.config.ts                          # T5
├── packages/
│   ├── core/
│   │   ├── package.json                      # T2
│   │   ├── tsconfig.json                     # T3
│   │   ├── src/
│   │   │   ├── index.ts                      # T10
│   │   │   ├── color.ts                      # T10
│   │   │   ├── layout.ts                     # T11
│   │   │   ├── protocol.ts                   # T12, T13
│   │   │   └── ipc.ts                        # T14
│   │   └── test/
│   │       ├── color.test.ts                 # T10
│   │       ├── layout.test.ts                # T11
│   │       └── protocol.test.ts              # T13
│   ├── daemon/
│   │   ├── package.json                      # T2
│   │   ├── tsconfig.json                     # T3
│   │   ├── src/
│   │   │   ├── index.ts                      # T20
│   │   │   ├── hid.ts                        # T15
│   │   │   ├── hid-mock.ts                   # T16
│   │   │   ├── engine.ts                     # T17
│   │   │   ├── profiles.ts                   # T18
│   │   │   ├── ipc-server.ts                 # T19
│   │   │   └── log.ts                        # T15
│   │   ├── test/
│   │   │   ├── engine.test.ts                # T17
│   │   │   ├── profiles.test.ts              # T18
│   │   │   └── ipc-server.test.ts            # T19
│   │   └── systemd/
│   │       └── fizzd.service                 # T20
│   └── cli/
│       ├── package.json                      # T2
│       ├── tsconfig.json                     # T3
│       ├── src/
│       │   ├── index.ts                      # T22-T24
│       │   ├── ipc-client.ts                 # T21
│       │   └── cmd/
│       │       ├── status.ts                 # T22
│       │       ├── set.ts                    # T22
│       │       ├── effect.ts                 # T22
│       │       ├── profile.ts                # T23
│       │       └── daemon.ts                 # T24
│       └── test/
│           └── ipc-client.test.ts            # T21
├── docs/
│   └── reverse-engineering/
│       ├── protocol.md                       # T8
│       └── captures/                         # T6 (gitignored)
├── tools/
│   ├── install-udev.sh                       # T1
│   ├── install.sh                            # T25
│   ├── download-captures.sh                  # T6
│   ├── extract-packets.ts                    # T7
│   └── replay-packet.ts                      # T9
└── README.md                                 # T25
```

---

## Task Overview

| # | Task | Layer |
|---|---|---|
| T1 | Install system deps + udev rule | System |
| T2 | npm workspaces scaffold | Setup |
| T3 | TypeScript base configs | Setup |
| T4 | ESLint + Prettier | Setup |
| T5 | Vitest config + smoke test | Setup |
| T6 | Download captures from OpenRGB issue #2172 | RE |
| T7 | Packet extraction tool | RE |
| T8 | Document protocol observations | RE |
| T9 | Live replay sanity check | RE |
| T10 | Color types + conversions | core |
| T11 | K617 KeyLayout | core |
| T12 | Protocol frame types + skeleton | core |
| T13 | Firmware effect encoders | core |
| T14 | IPC message schemas (Zod) | core |
| T15 | HID wrapper with reconnect | daemon |
| T16 | Fake HID mock | daemon |
| T17 | EffectEngine (single-shot) | daemon |
| T18 | ProfileManager | daemon |
| T19 | IPC server (Unix socket + JSON-RPC) | daemon |
| T20 | Daemon entry + systemd unit | daemon |
| T21 | CLI IPC client | cli |
| T22 | CLI core commands (status, set, effect) | cli |
| T23 | CLI profile commands | cli |
| T24 | CLI daemon-control commands | cli |
| T25 | Install script + README | Integration |
| T26 | End-to-end smoke test | Integration |

---

## T1: Install system dependencies + udev rule

**Files:**
- Create: `tools/install-udev.sh`
- Create: `/etc/udev/rules.d/99-fizz-k617.rules` (system path, written by script)

- [ ] **Step 1: Install hidapi-devel and libusb-devel via dnf**

Run:
```bash
sudo dnf install -y hidapi-devel libusb1-devel
```

Expected: packages installed. node-hid will use these when building from source if no prebuilt binary exists for Fedora 43.

- [ ] **Step 2: Confirm node version is 22+ and node-hid will work**

Run:
```bash
node --version
which node
```

Expected: `v22.x` or newer. If older, install via `dnf install nodejs` or `nvm install 22`.

- [ ] **Step 3: Confirm user is in `plugdev` group (or create it)**

Run:
```bash
getent group plugdev || sudo groupadd plugdev
id -nG | tr ' ' '\n' | grep -q '^plugdev$' && echo "already in group" || (sudo usermod -aG plugdev $USER && echo "ADDED — log out and back in")
```

Expected: either "already in group" or "ADDED — log out and back in". If added, the user must log out and back in for the change to take effect before continuing later tasks.

- [ ] **Step 4: Write udev rule install script**

Create `tools/install-udev.sh`:

```bash
#!/usr/bin/env bash
# Install udev rule granting plugdev group r/w access to the Redragon Fizz K617.
set -euo pipefail

RULE_PATH="/etc/udev/rules.d/99-fizz-k617.rules"
RULE_CONTENT='# Redragon Fizz K617 (BY Tech) — grant plugdev access to all interfaces
SUBSYSTEM=="hidraw", ATTRS{idVendor}=="258a", ATTRS{idProduct}=="0049", MODE="0660", GROUP="plugdev", TAG+="uaccess"
SUBSYSTEM=="usb",    ATTRS{idVendor}=="258a", ATTRS{idProduct}=="0049", MODE="0660", GROUP="plugdev", TAG+="uaccess"
'

if [[ -f "$RULE_PATH" ]] && [[ "$(sudo cat "$RULE_PATH")" == "$RULE_CONTENT" ]]; then
  echo "udev rule already installed and up to date."
  exit 0
fi

echo "Installing udev rule to $RULE_PATH (requires sudo)..."
echo "$RULE_CONTENT" | sudo tee "$RULE_PATH" > /dev/null
sudo udevadm control --reload-rules
sudo udevadm trigger --subsystem-match=hidraw --action=change
echo "Done. Unplug and replug your keyboard for permissions to apply."
```

Make it executable:

```bash
chmod +x tools/install-udev.sh
```

- [ ] **Step 5: Run the install script and verify access**

Run:
```bash
./tools/install-udev.sh
# Unplug and replug the keyboard physically.
for f in /dev/hidraw*; do
  vid=$(udevadm info --query=property --name="$f" | grep ID_VENDOR_ID= | cut -d= -f2)
  pid=$(udevadm info --query=property --name="$f" | grep ID_MODEL_ID= | cut -d= -f2)
  if [[ "$vid" == "258a" && "$pid" == "0049" ]]; then
    echo "$f — VID:PID $vid:$pid — perms: $(stat -c '%a %G' "$f")"
  fi
done
```

Expected: Two or three lines showing `/dev/hidrawN — VID:PID 258a:0049 — perms: 660 plugdev`.

- [ ] **Step 6: Commit**

```bash
git add tools/install-udev.sh
git commit -m "feat(install): add udev rule installer for Redragon K617"
```

---

## T2: npm workspaces scaffold

**Files:**
- Create: `package.json` (workspace root)
- Create: `packages/core/package.json`
- Create: `packages/daemon/package.json`
- Create: `packages/cli/package.json`

- [ ] **Step 1: Write root `package.json`**

Create `package.json`:

```json
{
  "name": "fizz-rgb",
  "private": true,
  "version": "0.1.0",
  "description": "Linux RGB controller for the Redragon Fizz K617 keyboard",
  "license": "MIT",
  "workspaces": ["packages/*"],
  "scripts": {
    "build": "tsc -b",
    "lint": "eslint . --ext .ts",
    "format": "prettier --write .",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "@types/node": "^22.10.0",
    "@typescript-eslint/eslint-plugin": "^8.20.0",
    "@typescript-eslint/parser": "^8.20.0",
    "eslint": "^9.18.0",
    "prettier": "^3.4.0",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  },
  "engines": { "node": ">=22.0.0" }
}
```

- [ ] **Step 2: Write `packages/core/package.json`**

```json
{
  "name": "@fizz/core",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc",
    "test": "vitest run"
  },
  "dependencies": {
    "zod": "^3.24.0"
  }
}
```

- [ ] **Step 3: Write `packages/daemon/package.json`**

```json
{
  "name": "fizzd",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "bin": { "fizzd": "./dist/index.js" },
  "scripts": {
    "build": "tsc && chmod +x dist/index.js",
    "start": "node dist/index.js",
    "test": "vitest run"
  },
  "dependencies": {
    "@fizz/core": "*",
    "node-hid": "^3.1.2",
    "pino": "^9.6.0",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "@types/node-hid": "^1.3.4",
    "pino-pretty": "^11.0.0"
  }
}
```

- [ ] **Step 4: Write `packages/cli/package.json`**

```json
{
  "name": "fizz",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "bin": { "fizz": "./dist/index.js" },
  "scripts": {
    "build": "tsc && chmod +x dist/index.js",
    "test": "vitest run"
  },
  "dependencies": {
    "@fizz/core": "*",
    "commander": "^13.0.0",
    "zod": "^3.24.0"
  }
}
```

- [ ] **Step 5: Install all deps**

Run:
```bash
npm install
```

Expected: `node_modules/` populated at root; `npm ls --workspaces` shows the three packages.

- [ ] **Step 6: Commit**

```bash
git add package.json packages/*/package.json package-lock.json
git commit -m "feat: scaffold npm workspaces for core/daemon/cli"
```

---

## T3: TypeScript base configs

**Files:**
- Create: `tsconfig.base.json`
- Create: `tsconfig.json` (root, project references)
- Create: `packages/{core,daemon,cli}/tsconfig.json`

- [ ] **Step 1: Write `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2023"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "exactOptionalPropertyTypes": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "composite": true
  }
}
```

- [ ] **Step 2: Write `packages/core/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Write `packages/daemon/tsconfig.json` (identical for `packages/cli/tsconfig.json`)**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "types": ["node"]
  },
  "include": ["src/**/*"],
  "references": [{ "path": "../core" }]
}
```

Save this same content to both `packages/daemon/tsconfig.json` and `packages/cli/tsconfig.json`.

- [ ] **Step 4: Write root `tsconfig.json`**

```json
{
  "files": [],
  "references": [
    { "path": "./packages/core" },
    { "path": "./packages/daemon" },
    { "path": "./packages/cli" }
  ]
}
```

- [ ] **Step 5: Verify build works with stub entrypoints**

Run:
```bash
mkdir -p packages/core/src packages/daemon/src packages/cli/src
printf 'export {};\n' > packages/core/src/index.ts
printf 'export {};\n' > packages/daemon/src/index.ts
printf 'export {};\n' > packages/cli/src/index.ts
npx tsc -b
```

Expected: no errors. `dist/` dirs created in each package with `index.js`, `index.d.ts`.

- [ ] **Step 6: Commit**

```bash
git add tsconfig.base.json tsconfig.json packages/*/tsconfig.json packages/*/src/index.ts
git commit -m "feat: add TypeScript project references and strict configs"
```

---

## T4: ESLint + Prettier

**Files:**
- Create: `.eslintrc.json`, `.prettierrc.json`, `.eslintignore`, `.prettierignore`

- [ ] **Step 1: Write `.eslintrc.json`**

```json
{
  "root": true,
  "parser": "@typescript-eslint/parser",
  "parserOptions": {
    "ecmaVersion": 2023,
    "sourceType": "module",
    "project": ["./packages/*/tsconfig.json"]
  },
  "plugins": ["@typescript-eslint"],
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended-type-checked"
  ],
  "rules": {
    "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
    "@typescript-eslint/consistent-type-imports": "error",
    "@typescript-eslint/no-floating-promises": "error",
    "no-console": ["warn", { "allow": ["warn", "error"] }]
  }
}
```

- [ ] **Step 2: Write `.prettierrc.json`**

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "arrowParens": "always"
}
```

- [ ] **Step 3: Write ignores**

`.eslintignore`:
```
dist/
node_modules/
docs/
*.config.ts
```

`.prettierignore`:
```
dist/
node_modules/
docs/reverse-engineering/captures/
```

- [ ] **Step 4: Run linters to confirm clean baseline**

Run:
```bash
npm run lint
npm run format -- --check
```

Expected: both commands succeed (no errors).

- [ ] **Step 5: Commit**

```bash
git add .eslintrc.json .prettierrc.json .eslintignore .prettierignore
git commit -m "feat: configure ESLint and Prettier"
```

---

## T5: Vitest config + smoke test

**Files:**
- Create: `vitest.config.ts`
- Create: `packages/core/test/smoke.test.ts`

- [ ] **Step 1: Write `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['packages/**/test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['packages/*/src/**/*.ts'],
      exclude: ['**/index.ts'],
    },
  },
});
```

- [ ] **Step 2: Write smoke test**

Create `packages/core/test/smoke.test.ts`:

```ts
import { describe, it, expect } from 'vitest';

describe('vitest smoke', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 3: Run tests**

Run:
```bash
npm test
```

Expected: 1 passed.

- [ ] **Step 4: Commit**

```bash
git add vitest.config.ts packages/core/test/smoke.test.ts
git commit -m "feat: add vitest config and smoke test"
```

---

## T6: Download captures from OpenRGB issue #2172

**Files:**
- Create: `tools/download-captures.sh`
- Output: `docs/reverse-engineering/captures/*` (gitignored)

- [ ] **Step 1: Open the issue in a browser and identify attachments**

Visit https://gitlab.com/CalcProgrammer1/OpenRGB/-/issues/2172. Typical attached filenames: `Static-Red.pcapng`, `Static-Green.pcapng`, `Static-Blue.pcapng`, `Rainbow.pcapng`, `RetroSnake.pcapng`, `SineWaveRGB.pcapng`, `StarTwinkle.pcapng`, `RainbowBlossom.pcapng`, `Waterfall.pcapng`, `Wheel.pcapng`, plus `descriptor.txt` and `Cfg.ini`. Copy each attachment's direct download URL.

- [ ] **Step 2: Write `tools/download-captures.sh`**

```bash
#!/usr/bin/env bash
# Download Redragon Fizz K617 USB captures from OpenRGB issue #2172.
# Attachment URLs may rotate; if a download fails, retrieve manually from
# https://gitlab.com/CalcProgrammer1/OpenRGB/-/issues/2172 and drop the file in
# docs/reverse-engineering/captures/
set -euo pipefail

DEST="docs/reverse-engineering/captures"
mkdir -p "$DEST"

# Populate this array with the direct download URLs found in the issue.
# Format: "filename.pcapng=URL"
DOWNLOADS=(
  # "Static-Red.pcapng=https://gitlab.com/.../uploads/.../Static-Red.pcapng"
)

if [[ ${#DOWNLOADS[@]} -eq 0 ]]; then
  echo "No download URLs configured. Edit this script with attachment URLs from"
  echo "https://gitlab.com/CalcProgrammer1/OpenRGB/-/issues/2172"
  echo "or download the .pcapng files manually into $DEST/"
  exit 1
fi

for entry in "${DOWNLOADS[@]}"; do
  name="${entry%%=*}"
  url="${entry#*=}"
  if [[ -f "$DEST/$name" ]]; then
    echo "skip $name (exists)"
    continue
  fi
  echo "downloading $name..."
  curl -fLo "$DEST/$name" "$url"
done

echo "Captures in $DEST:"
ls -la "$DEST"
```

Make executable:
```bash
chmod +x tools/download-captures.sh
```

- [ ] **Step 3: Manually download (or run script after filling URLs)**

Download every `.pcapng` from the issue into `docs/reverse-engineering/captures/`. Also save `descriptor.txt` and `Cfg.ini` if present.

- [ ] **Step 4: Verify captures**

Run:
```bash
ls -la docs/reverse-engineering/captures/
file docs/reverse-engineering/captures/*.pcapng
```

Expected: each `.pcapng` reports as `pcapng capture file`.

- [ ] **Step 5: Commit the script (captures themselves are gitignored)**

```bash
git add tools/download-captures.sh
git commit -m "tools: add capture download helper for OpenRGB issue #2172"
```

---

## T7: Packet extraction tool

**Files:**
- Create: `tools/extract-packets.ts`

- [ ] **Step 1: Install tshark (Wireshark CLI)**

Run:
```bash
sudo dnf install -y wireshark-cli
which tshark && tshark --version | head -1
```

Expected: `tshark` resolves and reports its version.

- [ ] **Step 2: Write extraction script**

Create `tools/extract-packets.ts`:

```ts
#!/usr/bin/env -S node --experimental-strip-types
/**
 * Extract USB HID OUT packets from a .pcapng capture and print them as
 * structured JSON suitable for protocol analysis.
 *
 * Usage:
 *   ./tools/extract-packets.ts docs/reverse-engineering/captures/Rainbow.pcapng > out.json
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const file = process.argv[2];
if (!file || !existsSync(file)) {
  console.error('Usage: extract-packets.ts <capture.pcapng>');
  process.exit(2);
}

// Capture both control transfers (SET_REPORT for feature reports) and
// interrupt transfers, then we filter further downstream.
const tsharkArgs = [
  '-r', file,
  '-Y', 'usb.transfer_type == 0x02 || usb.transfer_type == 0x01',
  '-T', 'fields',
  '-e', 'frame.number',
  '-e', 'frame.time_relative',
  '-e', 'usb.transfer_type',
  '-e', 'usb.endpoint_address',
  '-e', 'usb.setup.bRequest',
  '-e', 'usb.setup.wValue',
  '-e', 'usb.setup.wIndex',
  '-e', 'usb.capdata',
  '-E', 'separator=|',
];

const out = execFileSync('tshark', tsharkArgs, { encoding: 'utf8' });

interface Packet {
  frame: number;
  timeRel: number;
  transferType: string;
  endpoint: string;
  bRequest: string;
  wValue: string;
  wIndex: string;
  data: string;
  dataBytes: number[];
}

const packets: Packet[] = [];
for (const line of out.split('\n')) {
  if (!line.trim()) continue;
  const [frame, timeRel, transferType, endpoint, bRequest, wValue, wIndex, data] = line.split('|');
  if (!data) continue;
  const clean = data.replace(/:/g, '');
  const dataBytes: number[] = [];
  for (let i = 0; i < clean.length; i += 2) {
    dataBytes.push(parseInt(clean.slice(i, i + 2), 16));
  }
  packets.push({
    frame: Number(frame),
    timeRel: Number(timeRel),
    transferType: transferType ?? '',
    endpoint: endpoint ?? '',
    bRequest: bRequest ?? '',
    wValue: wValue ?? '',
    wIndex: wIndex ?? '',
    data: clean,
    dataBytes,
  });
}

console.log(JSON.stringify(packets, null, 2));
```

Make executable:
```bash
chmod +x tools/extract-packets.ts
```

- [ ] **Step 3: Smoke-test extraction**

Run:
```bash
./tools/extract-packets.ts docs/reverse-engineering/captures/Rainbow.pcapng | head -50
```

Expected: JSON array of packets, each with a `dataBytes` array (typically 64 numbers for a HID feature report). If `dataBytes` is empty for every packet, open the capture in Wireshark GUI and adjust the tshark `-e` fields to the right names.

- [ ] **Step 4: Save extracted JSON for all captures**

Run:
```bash
mkdir -p docs/reverse-engineering/extracted
for f in docs/reverse-engineering/captures/*.pcapng; do
  base=$(basename "$f" .pcapng)
  echo "extracting $base..."
  ./tools/extract-packets.ts "$f" > "docs/reverse-engineering/extracted/$base.json"
done
ls docs/reverse-engineering/extracted/
```

Expected: one `.json` per capture.

- [ ] **Step 5: Add extracted/ to gitignore**

Edit `.gitignore`, append:
```
docs/reverse-engineering/extracted/
```

- [ ] **Step 6: Commit**

```bash
git add tools/extract-packets.ts .gitignore
git commit -m "tools: add tshark-based packet extractor"
```

---

## T8: Document protocol observations

**Files:**
- Create: `docs/reverse-engineering/protocol.md`

- [ ] **Step 1: Analyze the Static-Red extracted JSON**

Run:
```bash
jq '.[] | select(.bRequest == "0x09") | {frame, dataBytes}' docs/reverse-engineering/extracted/Static-Red.json | head -100
```

Identify in the first few SET_REPORT packets: report ID (byte 0), common header bytes, where the color bytes (red `0xFF`, green `0x00`, blue `0x00`) live, and whether the sequence is one packet or several.

- [ ] **Step 2: Compare Static-Red vs Static-Green vs Static-Blue**

Run:
```bash
for c in Red Green Blue; do
  echo "=== Static-$c ==="
  jq -r '.[] | select(.bRequest == "0x09") | .dataBytes[:16] | @json' "docs/reverse-engineering/extracted/Static-$c.json" | head -5
done
```

The bytes that change between captures are color bytes; the bytes that stay constant are header / opcode / structure.

- [ ] **Step 3: Compare effect-mode opcodes**

Run:
```bash
for c in Rainbow RetroSnake Waterfall; do
  echo "=== $c (first SET_REPORT) ==="
  jq -r '[.[] | select(.bRequest == "0x09")][0].dataBytes[:16] | @json' "docs/reverse-engineering/extracted/$c.json"
done
```

The byte(s) that differ identify the effect-mode opcode.

- [ ] **Step 4: Write `docs/reverse-engineering/protocol.md`**

Fill in actual hex values discovered above:

```markdown
# Redragon Fizz K617 — USB HID Protocol (observed)

**Device:** VID `0x258A` PID `0x0049` (BY Tech / Redragon)
**MCU:** Sinowealth SH68F90A / BYK916
**Source:** USB captures from OpenRGB issue #2172 (extracted via `tools/extract-packets.ts`)

## Transport

- All RGB commands are HID **feature reports** (`bRequest=0x09` SET_REPORT on control endpoint).
- Payload size: **64 bytes** per packet.
- `wValue` high byte = report type (0x03 = feature). Low byte = report ID.
- `wIndex` = interface number (NN — fill in observed).

## Packet structure (general)

Byte offset | Field | Notes
---|---|---
0 | Report ID | `0xNN` (fill in)
1 | Command opcode | See "Effect opcodes" below
2 | Sub-command / param | varies per effect
3 | Length / flags | varies
4..N | Payload | effect-specific
N..63 | Padding | `0x00`

## Effect opcodes (observed)

Effect | Opcode | Param bytes | Notes
---|---|---|---
fw-static | `0xNN` | R, G, B at offsets X, Y, Z | covers Static-Red/Green/Blue
fw-rainbow | `0xNN` | speed at offset W | …
fw-snake | `0xNN` | speed, color at offsets … | RetroSnake.pcapng
fw-sine-wave | `0xNN` | speed | SineWaveRGB.pcapng
fw-star-twinkle | `0xNN` | density, color, speed | StarTwinkle.pcapng
fw-rainbow-blossom | `0xNN` | speed | RainbowBlossom.pcapng
fw-waterfall | `0xNN` | color, speed | Waterfall.pcapng
fw-wheel | `0xNN` | speed, direction | Wheel.pcapng

## Sequence

Each effect change appears to be a **single packet** (single-shot). After the
packet is acknowledged by the device, the firmware takes over and animates
autonomously. To switch effects, send a new packet. (Update this paragraph if
some effect needs multiple packets in sequence.)

## Brightness / global controls

(Document if observed in any capture — likely a separate opcode or a byte in
common header. Fill in as discovered.)

## Open questions

- Is there an opcode for arbitrary RGB on `fw-static`? Captures only show pure
  red/green/blue, not arbitrary hex colors.
- Is the report ID stable across firmware revisions?
- Per-key direct (Phase 3) — not covered by these captures; requires deeper RE.
```

Replace each `0xNN` and `…` with the actual values observed.

- [ ] **Step 5: Commit**

```bash
git add docs/reverse-engineering/protocol.md
git commit -m "docs(re): document observed HID protocol for K617 firmware effects"
```

---

## T9: Live replay sanity check

**Files:**
- Create: `tools/replay-packet.ts`

- [ ] **Step 1: Write replay tool**

Create `tools/replay-packet.ts`:

```ts
#!/usr/bin/env -S node --experimental-strip-types
/**
 * Send a single HID feature report to the K617 keyboard.
 *
 * Usage:
 *   ./tools/replay-packet.ts <hex bytes>
 *
 * Or from a capture:
 *   jq -r '[.[] | select(.bRequest == "0x09")][0].data' \
 *     docs/reverse-engineering/extracted/Rainbow.json \
 *     | xargs ./tools/replay-packet.ts
 */
import HID from 'node-hid';

const VID = 0x258a;
const PID = 0x0049;

const hex = process.argv[2];
if (!hex) {
  console.error('Usage: replay-packet.ts <hex-bytes>');
  process.exit(2);
}

const cleaned = hex.replace(/[^0-9a-fA-F]/g, '');
if (cleaned.length % 2 !== 0) {
  console.error('Hex string must have even length');
  process.exit(2);
}
const bytes: number[] = [];
for (let i = 0; i < cleaned.length; i += 2) {
  bytes.push(parseInt(cleaned.slice(i, i + 2), 16));
}

const devices = HID.devices().filter((d) => d.vendorId === VID && d.productId === PID);
if (devices.length === 0) {
  console.error('K617 not found. Run lsusb to confirm; check udev rule.');
  process.exit(1);
}

// Try each interface — the RGB endpoint is usually the vendor-specific HID
// (not interface 0 which is the boot keyboard).
let sent = false;
for (const desc of devices) {
  if (!desc.path) continue;
  try {
    const dev = new HID.HID(desc.path);
    dev.sendFeatureReport(bytes);
    console.log(`sent ${bytes.length} bytes to ${desc.path} (interface ${desc.interface})`);
    dev.close();
    sent = true;
    break;
  } catch (err) {
    console.error(`failed on ${desc.path}: ${(err as Error).message}`);
  }
}

if (!sent) {
  console.error('Could not send to any interface. Check protocol.md for the right one.');
  process.exit(1);
}
```

Make executable:
```bash
chmod +x tools/replay-packet.ts
```

- [ ] **Step 2: Install node-hid at workspace root for the standalone tools**

Run:
```bash
npm install --no-save node-hid
```

Expected: node-hid installed at root `node_modules/` (without polluting the workspace `package.json`).

- [ ] **Step 3: Replay the first SET_REPORT from Static-Red**

Run:
```bash
HEX=$(jq -r '[.[] | select(.bRequest == "0x09")][0].data' docs/reverse-engineering/extracted/Static-Red.json)
echo "Sending: $HEX"
./tools/replay-packet.ts "$HEX"
```

Expected: the keyboard turns **solid red**. If not:
1. Iterate over all SET_REPORT packets (some effects need multiple in sequence).
2. Force a specific interface (modify the script).
3. Confirm `ls -la /dev/hidraw*` shows `plugdev` group.

- [ ] **Step 4: Replay Rainbow**

Run:
```bash
for HEX in $(jq -r '.[] | select(.bRequest == "0x09") | .data' docs/reverse-engineering/extracted/Rainbow.json); do
  ./tools/replay-packet.ts "$HEX"
  sleep 0.05
done
```

Expected: keyboard switches to rainbow.

- [ ] **Step 5: Update protocol.md**

Mark each successfully replayed effect with ✅ in the opcode table. Document any required multi-packet sequence or specific interface.

- [ ] **Step 6: Commit**

```bash
git add tools/replay-packet.ts docs/reverse-engineering/protocol.md
git commit -m "tools: add HID packet replay tool, validate protocol observations"
```

---

## T10: Color types and conversions

**Files:**
- Create: `packages/core/src/color.ts`
- Create: `packages/core/test/color.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/core/test/color.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { Color, parseHex, toHex, hsvToRgb } from '../src/color.ts';

describe('Color', () => {
  it('parseHex parses #RRGGBB', () => {
    expect(parseHex('#ff8800')).toEqual({ r: 255, g: 136, b: 0 });
  });

  it('parseHex parses without leading #', () => {
    expect(parseHex('ff8800')).toEqual({ r: 255, g: 136, b: 0 });
  });

  it('parseHex throws on invalid', () => {
    expect(() => parseHex('xyz')).toThrow();
  });

  it('toHex formats RGB to #RRGGBB', () => {
    expect(toHex({ r: 255, g: 136, b: 0 })).toBe('#ff8800');
  });

  it('toHex pads single hex digits', () => {
    expect(toHex({ r: 1, g: 2, b: 3 })).toBe('#010203');
  });

  it('hsvToRgb red', () => {
    expect(hsvToRgb(0, 1, 1)).toEqual({ r: 255, g: 0, b: 0 });
  });

  it('hsvToRgb black when value=0', () => {
    expect(hsvToRgb(120, 1, 0)).toEqual({ r: 0, g: 0, b: 0 });
  });

  it('Color.black is RGB 0,0,0', () => {
    expect(Color.black).toEqual({ r: 0, g: 0, b: 0 });
  });
});
```

- [ ] **Step 2: Run test, verify failure**

Run:
```bash
npx vitest run packages/core/test/color.test.ts
```

Expected: FAIL (module not found).

- [ ] **Step 3: Implement `color.ts`**

Create `packages/core/src/color.ts`:

```ts
export interface Color {
  r: number; // 0..255
  g: number;
  b: number;
}

export const Color = {
  black: { r: 0, g: 0, b: 0 } as Color,
  white: { r: 255, g: 255, b: 255 } as Color,
} as const;

const HEX_RE = /^#?([0-9a-fA-F]{6})$/;

export function parseHex(hex: string): Color {
  const m = HEX_RE.exec(hex);
  if (!m) throw new Error(`Invalid hex color: ${hex}`);
  const n = parseInt(m[1]!, 16);
  return {
    r: (n >> 16) & 0xff,
    g: (n >> 8) & 0xff,
    b: n & 0xff,
  };
}

export function toHex(c: Color): string {
  const n = ((c.r & 0xff) << 16) | ((c.g & 0xff) << 8) | (c.b & 0xff);
  return '#' + n.toString(16).padStart(6, '0');
}

/** HSV → RGB. h in [0, 360), s in [0, 1], v in [0, 1]. */
export function hsvToRgb(h: number, s: number, v: number): Color {
  const c = v * s;
  const hh = ((h % 360) + 360) % 360 / 60;
  const x = c * (1 - Math.abs((hh % 2) - 1));
  let r1 = 0, g1 = 0, b1 = 0;
  if (hh < 1)      { r1 = c; g1 = x; b1 = 0; }
  else if (hh < 2) { r1 = x; g1 = c; b1 = 0; }
  else if (hh < 3) { r1 = 0; g1 = c; b1 = x; }
  else if (hh < 4) { r1 = 0; g1 = x; b1 = c; }
  else if (hh < 5) { r1 = x; g1 = 0; b1 = c; }
  else             { r1 = c; g1 = 0; b1 = x; }
  const m = v - c;
  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
  };
}
```

- [ ] **Step 4: Run test, verify pass**

Run:
```bash
npx vitest run packages/core/test/color.test.ts
```

Expected: 8 passed.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/color.ts packages/core/test/color.test.ts
git commit -m "feat(core): add Color type, parseHex, toHex, hsvToRgb"
```

---

## T11: K617 KeyLayout

**Files:**
- Create: `packages/core/src/layout.ts`
- Create: `packages/core/test/layout.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/core/test/layout.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { K617_LAYOUT, keyByName, ledCount } from '../src/layout.ts';

describe('K617_LAYOUT', () => {
  it('has 61 keys', () => {
    expect(K617_LAYOUT.keys).toHaveLength(61);
    expect(ledCount).toBe(61);
  });

  it('every key has unique LED index 0..60', () => {
    const indices = K617_LAYOUT.keys.map((k) => k.ledIndex).sort((a, b) => a - b);
    expect(indices).toEqual([...Array(61).keys()]);
  });

  it('keyByName finds Escape', () => {
    const k = keyByName('Escape');
    expect(k).toBeDefined();
    expect(k!.row).toBe(0);
    expect(k!.col).toBe(0);
  });

  it('keyByName returns undefined for unknown', () => {
    expect(keyByName('NotAKey')).toBeUndefined();
  });

  it('rows 0..4', () => {
    const rows = new Set(K617_LAYOUT.keys.map((k) => k.row));
    expect([...rows].sort()).toEqual([0, 1, 2, 3, 4]);
  });
});
```

- [ ] **Step 2: Run, verify failure**

Run:
```bash
npx vitest run packages/core/test/layout.test.ts
```

Expected: FAIL (module not found).

- [ ] **Step 3: Implement `layout.ts`**

Create `packages/core/src/layout.ts`:

```ts
/**
 * Redragon Fizz K617 — 60% ANSI key layout (61 keys).
 *
 * `ledIndex` is a sequential 0..60. The actual firmware-side LED index
 * mapping for per-key control is TBD in Phase 3 (depends on reverse
 * engineering of the per-key direct-set opcode).
 */
export interface KeyDef {
  name: string;
  row: number;
  col: number;   // float; standard keycap = 1.0u
  width: number;
  ledIndex: number;
}

const ROW_0 = [
  { name: 'Escape', w: 1 }, { name: '1', w: 1 }, { name: '2', w: 1 }, { name: '3', w: 1 },
  { name: '4', w: 1 }, { name: '5', w: 1 }, { name: '6', w: 1 }, { name: '7', w: 1 },
  { name: '8', w: 1 }, { name: '9', w: 1 }, { name: '0', w: 1 }, { name: 'Minus', w: 1 },
  { name: 'Equal', w: 1 }, { name: 'Backspace', w: 2 },
];
const ROW_1 = [
  { name: 'Tab', w: 1.5 }, { name: 'Q', w: 1 }, { name: 'W', w: 1 }, { name: 'E', w: 1 },
  { name: 'R', w: 1 }, { name: 'T', w: 1 }, { name: 'Y', w: 1 }, { name: 'U', w: 1 },
  { name: 'I', w: 1 }, { name: 'O', w: 1 }, { name: 'P', w: 1 }, { name: 'LBracket', w: 1 },
  { name: 'RBracket', w: 1 }, { name: 'Backslash', w: 1.5 },
];
const ROW_2 = [
  { name: 'CapsLock', w: 1.75 }, { name: 'A', w: 1 }, { name: 'S', w: 1 }, { name: 'D', w: 1 },
  { name: 'F', w: 1 }, { name: 'G', w: 1 }, { name: 'H', w: 1 }, { name: 'J', w: 1 },
  { name: 'K', w: 1 }, { name: 'L', w: 1 }, { name: 'Semicolon', w: 1 }, { name: 'Quote', w: 1 },
  { name: 'Enter', w: 2.25 },
];
const ROW_3 = [
  { name: 'LShift', w: 2.25 }, { name: 'Z', w: 1 }, { name: 'X', w: 1 }, { name: 'C', w: 1 },
  { name: 'V', w: 1 }, { name: 'B', w: 1 }, { name: 'N', w: 1 }, { name: 'M', w: 1 },
  { name: 'Comma', w: 1 }, { name: 'Period', w: 1 }, { name: 'Slash', w: 1 }, { name: 'RShift', w: 2.75 },
];
const ROW_4 = [
  { name: 'LCtrl', w: 1.25 }, { name: 'LSuper', w: 1.25 }, { name: 'LAlt', w: 1.25 },
  { name: 'Space', w: 6.25 },
  { name: 'RAlt', w: 1.25 }, { name: 'Fn', w: 1.25 }, { name: 'Menu', w: 1.25 }, { name: 'RCtrl', w: 1.25 },
];

const ROWS = [ROW_0, ROW_1, ROW_2, ROW_3, ROW_4];

function buildKeys(): KeyDef[] {
  const result: KeyDef[] = [];
  let ledIndex = 0;
  for (let row = 0; row < ROWS.length; row++) {
    let col = 0;
    for (const k of ROWS[row]!) {
      result.push({ name: k.name, row, col, width: k.w, ledIndex });
      col += k.w;
      ledIndex++;
    }
  }
  return result;
}

const keys = buildKeys();

export const K617_LAYOUT = { rows: ROWS.length, keys } as const;
export const ledCount = keys.length;

const byName = new Map(keys.map((k) => [k.name, k]));
export function keyByName(name: string): KeyDef | undefined {
  return byName.get(name);
}
```

- [ ] **Step 4: Run tests, verify pass**

Run:
```bash
npx vitest run packages/core/test/layout.test.ts
```

Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/layout.ts packages/core/test/layout.test.ts
git commit -m "feat(core): add K617_LAYOUT with 61 keys mapped to LED indices"
```

---

## T12: Protocol frame types and skeleton

**Files:**
- Create: `packages/core/src/protocol.ts`

- [ ] **Step 1: Write `protocol.ts` types-only skeleton**

Create `packages/core/src/protocol.ts`:

```ts
import type { Color } from './color.ts';

/** A single 64-byte HID feature report ready to send via node-hid. */
export type ProtocolFrame = Buffer;

/** Firmware-native effect names (implemented by the keyboard itself). */
export type FirmwareEffectName =
  | 'fw-static'
  | 'fw-rainbow'
  | 'fw-snake'
  | 'fw-sine-wave'
  | 'fw-star-twinkle'
  | 'fw-rainbow-blossom'
  | 'fw-waterfall'
  | 'fw-wheel';

export interface FirmwareEffectParams {
  speed?: number;        // 0..255
  brightness?: number;   // 0..255
  direction?: 'forward' | 'reverse';
  color?: Color;
  density?: number;      // for star-twinkle
}

/** Length of each HID feature report packet (bytes). */
export const PACKET_SIZE = 64;

export function emptyPacket(): Buffer {
  return Buffer.alloc(PACKET_SIZE);
}

/**
 * Build the HID feature report(s) that activate a firmware-native effect.
 * Implementation arrives in T13 (depends on opcode constants from
 * docs/reverse-engineering/protocol.md).
 */
export function encodeFirmwareEffect(
  _name: FirmwareEffectName,
  _params: FirmwareEffectParams,
): ProtocolFrame[] {
  throw new Error('not implemented — see T13');
}
```

- [ ] **Step 2: Build core**

Run:
```bash
npx tsc -b packages/core
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/protocol.ts
git commit -m "feat(core): add protocol types and encoder skeleton"
```

---

## T13: Firmware effect encoders (validated against captures)

**Files:**
- Modify: `packages/core/src/protocol.ts`
- Create: `packages/core/test/protocol.test.ts`
- Create: `packages/core/test/fixtures/*.json`

Before this task, T9 MUST be complete (replay verified). Opcodes and offsets come from `docs/reverse-engineering/protocol.md`.

- [ ] **Step 1: Copy fixtures from extracted captures**

Run:
```bash
mkdir -p packages/core/test/fixtures
for c in Static-Red Static-Green Static-Blue Rainbow RetroSnake SineWaveRGB StarTwinkle RainbowBlossom Waterfall Wheel; do
  if [[ -f "docs/reverse-engineering/extracted/$c.json" ]]; then
    jq '[.[] | select(.bRequest == "0x09") | {data, dataBytes}]' \
      "docs/reverse-engineering/extracted/$c.json" \
      > "packages/core/test/fixtures/$c.json"
  fi
done
ls packages/core/test/fixtures/
```

Expected: one JSON file per effect, each containing the SET_REPORT packets only.

- [ ] **Step 2: Write encoder tests**

Create `packages/core/test/protocol.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { encodeFirmwareEffect } from '../src/protocol.ts';
import { parseHex } from '../src/color.ts';

interface Fixture { data: string; dataBytes: number[] }

function loadFixture(name: string): Fixture[] {
  const path = join(import.meta.dirname, 'fixtures', `${name}.json`);
  return JSON.parse(readFileSync(path, 'utf8'));
}

const toHex = (buf: Buffer) => buf.toString('hex');

describe('encodeFirmwareEffect', () => {
  it('Static red matches captured packet', () => {
    const captured = loadFixture('Static-Red')[0]!;
    const frames = encodeFirmwareEffect('fw-static', { color: { r: 255, g: 0, b: 0 } });
    expect(frames).toHaveLength(1);
    expect(toHex(frames[0]!)).toBe(captured.data);
  });

  it('Static green matches captured packet', () => {
    const captured = loadFixture('Static-Green')[0]!;
    const frames = encodeFirmwareEffect('fw-static', { color: { r: 0, g: 255, b: 0 } });
    expect(toHex(frames[0]!)).toBe(captured.data);
  });

  it('Static blue matches captured packet', () => {
    const captured = loadFixture('Static-Blue')[0]!;
    const frames = encodeFirmwareEffect('fw-static', { color: { r: 0, g: 0, b: 255 } });
    expect(toHex(frames[0]!)).toBe(captured.data);
  });

  it('Rainbow opcode matches capture', () => {
    const captured = loadFixture('Rainbow')[0]!;
    const frames = encodeFirmwareEffect('fw-rainbow', {});
    expect(frames[0]![1]).toBe(captured.dataBytes[1]);
  });

  it('Snake opcode matches capture', () => {
    const captured = loadFixture('RetroSnake')[0]!;
    const frames = encodeFirmwareEffect('fw-snake', { color: parseHex('#ff0000') });
    expect(frames[0]![1]).toBe(captured.dataBytes[1]);
  });

  it('Waterfall opcode matches capture', () => {
    const captured = loadFixture('Waterfall')[0]!;
    const frames = encodeFirmwareEffect('fw-waterfall', { color: parseHex('#ff0000') });
    expect(frames[0]![1]).toBe(captured.dataBytes[1]);
  });

  it('Wheel opcode matches capture', () => {
    const captured = loadFixture('Wheel')[0]!;
    const frames = encodeFirmwareEffect('fw-wheel', {});
    expect(frames[0]![1]).toBe(captured.dataBytes[1]);
  });

  it('Sine wave opcode matches capture', () => {
    const captured = loadFixture('SineWaveRGB')[0]!;
    const frames = encodeFirmwareEffect('fw-sine-wave', {});
    expect(frames[0]![1]).toBe(captured.dataBytes[1]);
  });

  it('Star twinkle opcode matches capture', () => {
    const captured = loadFixture('StarTwinkle')[0]!;
    const frames = encodeFirmwareEffect('fw-star-twinkle', {});
    expect(frames[0]![1]).toBe(captured.dataBytes[1]);
  });

  it('Rainbow blossom opcode matches capture', () => {
    const captured = loadFixture('RainbowBlossom')[0]!;
    const frames = encodeFirmwareEffect('fw-rainbow-blossom', {});
    expect(frames[0]![1]).toBe(captured.dataBytes[1]);
  });
});
```

- [ ] **Step 3: Run tests, verify failures**

Run:
```bash
npx vitest run packages/core/test/protocol.test.ts
```

Expected: 10 failures with "not implemented — see T13".

- [ ] **Step 4: Implement `encodeFirmwareEffect`**

Rewrite `packages/core/src/protocol.ts`. Replace the placeholder `REPORT_ID` and each `OPCODE` value with the real bytes from `docs/reverse-engineering/protocol.md`:

```ts
import type { Color } from './color.ts';

export type ProtocolFrame = Buffer;

export type FirmwareEffectName =
  | 'fw-static'
  | 'fw-rainbow'
  | 'fw-snake'
  | 'fw-sine-wave'
  | 'fw-star-twinkle'
  | 'fw-rainbow-blossom'
  | 'fw-waterfall'
  | 'fw-wheel';

export interface FirmwareEffectParams {
  speed?: number;
  brightness?: number;
  direction?: 'forward' | 'reverse';
  color?: Color;
  density?: number;
}

export const PACKET_SIZE = 64;

// === Constants discovered via reverse engineering (see protocol.md) ===
// IMPORTANT: replace each placeholder below with the actual values from your
// protocol.md before the tests will pass.
const REPORT_ID = 0x04;       // TODO from protocol.md

const OPCODE: Record<FirmwareEffectName, number> = {
  'fw-static': 0x00,           // TODO
  'fw-rainbow': 0x00,          // TODO
  'fw-snake': 0x00,            // TODO
  'fw-sine-wave': 0x00,        // TODO
  'fw-star-twinkle': 0x00,     // TODO
  'fw-rainbow-blossom': 0x00,  // TODO
  'fw-waterfall': 0x00,        // TODO
  'fw-wheel': 0x00,            // TODO
};

// Byte offsets within the 64-byte packet — adjust to what protocol.md observed.
const OFFSET = {
  reportId: 0,
  opcode: 1,
  speed: 2,
  brightness: 3,
  direction: 4,
  colorR: 5,
  colorG: 6,
  colorB: 7,
  density: 8,
} as const;

export function emptyPacket(): Buffer {
  return Buffer.alloc(PACKET_SIZE);
}

export function encodeFirmwareEffect(
  name: FirmwareEffectName,
  params: FirmwareEffectParams,
): ProtocolFrame[] {
  const packet = emptyPacket();
  packet[OFFSET.reportId] = REPORT_ID;
  packet[OFFSET.opcode] = OPCODE[name];

  if (params.speed !== undefined) packet[OFFSET.speed] = params.speed & 0xff;
  if (params.brightness !== undefined) packet[OFFSET.brightness] = params.brightness & 0xff;
  if (params.direction !== undefined) packet[OFFSET.direction] = params.direction === 'reverse' ? 1 : 0;
  if (params.density !== undefined) packet[OFFSET.density] = params.density & 0xff;

  if (params.color) {
    packet[OFFSET.colorR] = params.color.r;
    packet[OFFSET.colorG] = params.color.g;
    packet[OFFSET.colorB] = params.color.b;
  }

  return [packet];
}
```

If protocol.md indicates an effect requires multiple packets, extend `encodeFirmwareEffect` to return more than one frame for that case.

- [ ] **Step 5: Run tests, verify they pass**

Run:
```bash
npx vitest run packages/core/test/protocol.test.ts
```

Expected: 10 passed. If any fail, the captured bytes disagree with your constants — fix the constants until each effect's byte string round-trips.

- [ ] **Step 6: Add `index.ts` re-exports**

Edit `packages/core/src/index.ts`:

```ts
export * from './color.ts';
export * from './layout.ts';
export * from './protocol.ts';
```

- [ ] **Step 7: Build and commit**

Run:
```bash
npx tsc -b
```

Expected: no errors.

```bash
git add packages/core/src/protocol.ts packages/core/src/index.ts \
        packages/core/test/protocol.test.ts packages/core/test/fixtures/
git commit -m "feat(core): implement firmware effect encoders validated against captures"
```

---

## T14: IPC message schemas (Zod)

**Files:**
- Create: `packages/core/src/ipc.ts`

- [ ] **Step 1: Write `ipc.ts`**

Create `packages/core/src/ipc.ts`:

```ts
import { z } from 'zod';

// === Common types ===

export const HexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'expected #RRGGBB');

export const FirmwareEffectName = z.enum([
  'fw-static',
  'fw-rainbow',
  'fw-snake',
  'fw-sine-wave',
  'fw-star-twinkle',
  'fw-rainbow-blossom',
  'fw-waterfall',
  'fw-wheel',
]);

export const FirmwareEffectParams = z.object({
  speed: z.number().int().min(0).max(255).optional(),
  brightness: z.number().int().min(0).max(255).optional(),
  direction: z.enum(['forward', 'reverse']).optional(),
  color: HexColor.optional(),
  density: z.number().int().min(0).max(255).optional(),
});

export const EffectDescriptor = z.object({
  name: FirmwareEffectName,
  description: z.string(),
});

export const Profile = z.object({
  name: z.string().min(1).max(64),
  createdAt: z.string().datetime(),
  effect: z.object({
    name: FirmwareEffectName,
    params: FirmwareEffectParams,
  }),
});

export const DeviceStatus = z.object({
  connected: z.boolean(),
  vid: z.number().int(),
  pid: z.number().int(),
  serial: z.string().optional(),
  firmware: z.string().optional(),
});

// === RPC methods ===

export const RpcMethods = {
  'device.status': {
    params: z.object({}).strict(),
    result: DeviceStatus,
  },
  'effect.list': {
    params: z.object({}).strict(),
    result: z.array(EffectDescriptor),
  },
  'effect.run': {
    params: z.object({ name: FirmwareEffectName, params: FirmwareEffectParams.default({}) }),
    result: z.object({ ok: z.literal(true) }),
  },
  'effect.stop': {
    params: z.object({}).strict(),
    result: z.object({ ok: z.literal(true) }),
  },
  'effect.current': {
    params: z.object({}).strict(),
    result: z.object({
      name: FirmwareEffectName,
      params: FirmwareEffectParams,
      startedAt: z.string().datetime(),
    }).nullable(),
  },
  'solid.set': {
    params: z.object({ color: HexColor }),
    result: z.object({ ok: z.literal(true) }),
  },
  'profile.list': {
    params: z.object({}).strict(),
    result: z.array(Profile),
  },
  'profile.activate': {
    params: z.object({ name: z.string() }),
    result: z.object({ ok: z.literal(true) }),
  },
  'profile.save': {
    params: z.object({ name: z.string(), profile: Profile.omit({ createdAt: true }) }),
    result: z.object({ ok: z.literal(true) }),
  },
  'profile.delete': {
    params: z.object({ name: z.string() }),
    result: z.object({ ok: z.literal(true) }),
  },
  'daemon.version': {
    params: z.object({}).strict(),
    result: z.object({ version: z.string(), buildHash: z.string() }),
  },
  'daemon.shutdown': {
    params: z.object({}).strict(),
    result: z.object({ ok: z.literal(true) }),
  },
} as const;

export type RpcMethodName = keyof typeof RpcMethods;
export type RpcParams<M extends RpcMethodName> = z.infer<(typeof RpcMethods)[M]['params']>;
export type RpcResult<M extends RpcMethodName> = z.infer<(typeof RpcMethods)[M]['result']>;

// === JSON-RPC 2.0 envelope ===

export const RpcRequest = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.string(), z.number()]),
  method: z.string(),
  params: z.unknown().optional(),
});

export const RpcResponseSuccess = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.string(), z.number()]),
  result: z.unknown(),
});

export const RpcResponseError = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.string(), z.number()]).nullable(),
  error: z.object({
    code: z.number(),
    message: z.string(),
    data: z.unknown().optional(),
  }),
});

export const RpcResponse = z.union([RpcResponseSuccess, RpcResponseError]);

export const RpcNotification = z.object({
  jsonrpc: z.literal('2.0'),
  method: z.string(),
  params: z.unknown().optional(),
});

export const RPC_ERR = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
} as const;

export function socketPath(): string {
  const runtime = process.env.XDG_RUNTIME_DIR;
  if (runtime && runtime.length > 0) return `${runtime}/fizz.sock`;
  const uid = process.getuid ? process.getuid() : 1000;
  return `/run/user/${uid}/fizz.sock`;
}
```

- [ ] **Step 2: Re-export from index, build**

Edit `packages/core/src/index.ts`:

```ts
export * from './color.ts';
export * from './layout.ts';
export * from './protocol.ts';
export * from './ipc.ts';
```

Run:
```bash
npx tsc -b packages/core
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/ipc.ts packages/core/src/index.ts
git commit -m "feat(core): add Zod schemas for JSON-RPC IPC contract"
```

---

## T15: HID wrapper with reconnect

**Files:**
- Create: `packages/daemon/src/log.ts`
- Create: `packages/daemon/src/hid.ts`

- [ ] **Step 1: Write logger module**

Create `packages/daemon/src/log.ts`:

```ts
import pino from 'pino';

const level = process.env.FIZZ_LOG_LEVEL ?? 'info';

export const log = pino({
  level,
  transport:
    process.env.NODE_ENV === 'production'
      ? undefined
      : {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss.l' },
        },
});
```

- [ ] **Step 2: Write `HidController` interface and node-hid implementation**

Create `packages/daemon/src/hid.ts`:

```ts
import HID from 'node-hid';
import type { ProtocolFrame } from '@fizz/core';
import { log } from './log.ts';

const VID = 0x258a;
const PID = 0x0049;

export interface HidController {
  isConnected(): boolean;
  sendFeatureReport(frame: ProtocolFrame): Promise<void>;
  sendFrames(frames: ProtocolFrame[]): Promise<void>;
  close(): void;
  on(event: 'connect' | 'disconnect', handler: () => void): void;
}

type Listener = () => void;

export class NodeHidController implements HidController {
  private device: HID.HID | null = null;
  private retryTimer: NodeJS.Timeout | null = null;
  private listeners: Record<'connect' | 'disconnect', Listener[]> = { connect: [], disconnect: [] };

  constructor(private readonly retryMs = 2000) {
    this.tryOpen();
  }

  isConnected(): boolean { return this.device !== null; }

  on(event: 'connect' | 'disconnect', handler: Listener): void {
    this.listeners[event].push(handler);
  }

  private emit(event: 'connect' | 'disconnect') {
    for (const h of this.listeners[event]) h();
  }

  private tryOpen() {
    try {
      const descs = HID.devices().filter((d) => d.vendorId === VID && d.productId === PID);
      // Prefer higher-numbered interface (vendor HID, not interface 0 = boot kbd).
      descs.sort((a, b) => (b.interface ?? 0) - (a.interface ?? 0));
      const target = descs.find((d) => d.path);
      if (!target?.path) {
        this.scheduleRetry();
        return;
      }
      const dev = new HID.HID(target.path);
      this.device = dev;
      if (this.retryTimer) { clearTimeout(this.retryTimer); this.retryTimer = null; }
      log.info({ path: target.path, interface: target.interface }, 'HID device opened');
      this.emit('connect');
      dev.on('error', (err) => {
        log.warn({ err }, 'HID error, will reopen');
        this.handleDisconnect();
      });
    } catch (err) {
      log.debug({ err: (err as Error).message }, 'HID open failed, retrying');
      this.scheduleRetry();
    }
  }

  private handleDisconnect() {
    if (this.device) {
      try { this.device.close(); } catch { /* ignore */ }
      this.device = null;
      this.emit('disconnect');
    }
    this.scheduleRetry();
  }

  private scheduleRetry() {
    if (this.retryTimer) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.tryOpen();
    }, this.retryMs);
  }

  async sendFeatureReport(frame: ProtocolFrame): Promise<void> {
    if (!this.device) throw new Error('device not connected');
    this.device.sendFeatureReport(Array.from(frame));
  }

  async sendFrames(frames: ProtocolFrame[]): Promise<void> {
    for (const f of frames) await this.sendFeatureReport(f);
  }

  close(): void {
    if (this.retryTimer) { clearTimeout(this.retryTimer); this.retryTimer = null; }
    if (this.device) { try { this.device.close(); } catch { /* ignore */ } this.device = null; }
  }
}
```

- [ ] **Step 3: Build to verify types compile**

Run:
```bash
npx tsc -b packages/daemon
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/daemon/src/log.ts packages/daemon/src/hid.ts
git commit -m "feat(daemon): add HidController interface and node-hid implementation"
```

---

## T16: Fake HID mock

**Files:**
- Create: `packages/daemon/src/hid-mock.ts`
- Create: `packages/daemon/test/hid.test.ts`

- [ ] **Step 1: Implement `FakeHidController`**

Create `packages/daemon/src/hid-mock.ts`:

```ts
import type { ProtocolFrame } from '@fizz/core';
import type { HidController } from './hid.ts';

type Listener = () => void;

/** In-memory HID controller for tests; records every frame written. */
export class FakeHidController implements HidController {
  public readonly sentFrames: ProtocolFrame[] = [];
  private connected = true;
  private listeners: Record<'connect' | 'disconnect', Listener[]> = { connect: [], disconnect: [] };

  isConnected(): boolean { return this.connected; }

  on(event: 'connect' | 'disconnect', handler: Listener): void {
    this.listeners[event].push(handler);
  }

  private emit(event: 'connect' | 'disconnect') {
    for (const h of this.listeners[event]) h();
  }

  async sendFeatureReport(frame: ProtocolFrame): Promise<void> {
    if (!this.connected) throw new Error('device not connected');
    this.sentFrames.push(Buffer.from(frame));
  }

  async sendFrames(frames: ProtocolFrame[]): Promise<void> {
    for (const f of frames) await this.sendFeatureReport(f);
  }

  close(): void { this.connected = false; }

  simulateDisconnect() { this.connected = false; this.emit('disconnect'); }
  simulateReconnect()  { this.connected = true;  this.emit('connect'); }
  reset() { this.sentFrames.length = 0; this.connected = true; }
}
```

- [ ] **Step 2: Write tests**

Create `packages/daemon/test/hid.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { FakeHidController } from '../src/hid-mock.ts';

describe('FakeHidController', () => {
  it('records frames sent', async () => {
    const c = new FakeHidController();
    await c.sendFeatureReport(Buffer.from([0x01, 0x02, 0x03]));
    expect(c.sentFrames).toHaveLength(1);
    expect(c.sentFrames[0]).toEqual(Buffer.from([0x01, 0x02, 0x03]));
  });

  it('rejects writes when disconnected', async () => {
    const c = new FakeHidController();
    c.simulateDisconnect();
    await expect(c.sendFeatureReport(Buffer.from([0x01]))).rejects.toThrow('not connected');
  });

  it('emits connect/disconnect events', () => {
    const c = new FakeHidController();
    let disconnectCount = 0;
    let connectCount = 0;
    c.on('disconnect', () => disconnectCount++);
    c.on('connect', () => connectCount++);
    c.simulateDisconnect();
    c.simulateReconnect();
    expect(disconnectCount).toBe(1);
    expect(connectCount).toBe(1);
  });
});
```

- [ ] **Step 3: Run tests, verify pass**

Run:
```bash
npx vitest run packages/daemon/test/hid.test.ts
```

Expected: 3 passed.

- [ ] **Step 4: Commit**

```bash
git add packages/daemon/src/hid-mock.ts packages/daemon/test/hid.test.ts
git commit -m "feat(daemon): add FakeHidController and tests"
```

---

## T17: EffectEngine (single-shot mode)

**Files:**
- Create: `packages/daemon/src/engine.ts`
- Create: `packages/daemon/test/engine.test.ts`

For Phase 1 the engine only does **single-shot** mode: build the firmware-effect packet, send it, remember current state. There is no tick loop yet (Phase 3).

- [ ] **Step 1: Write failing tests**

Create `packages/daemon/test/engine.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { EffectEngine } from '../src/engine.ts';
import { FakeHidController } from '../src/hid-mock.ts';

describe('EffectEngine', () => {
  let hid: FakeHidController;
  let engine: EffectEngine;

  beforeEach(() => {
    hid = new FakeHidController();
    engine = new EffectEngine(hid);
  });

  it('current is null initially', () => {
    expect(engine.current()).toBeNull();
  });

  it('runEffect sends at least one frame', async () => {
    await engine.runEffect('fw-static', { color: { r: 255, g: 0, b: 0 } });
    expect(hid.sentFrames.length).toBeGreaterThanOrEqual(1);
  });

  it('current returns the active effect after run', async () => {
    await engine.runEffect('fw-rainbow', { speed: 128 });
    const c = engine.current();
    expect(c).not.toBeNull();
    expect(c!.name).toBe('fw-rainbow');
    expect(c!.params).toEqual({ speed: 128 });
  });

  it('stop clears current', async () => {
    await engine.runEffect('fw-rainbow', {});
    engine.stop();
    expect(engine.current()).toBeNull();
  });

  it('switching effects replaces previous', async () => {
    await engine.runEffect('fw-rainbow', {});
    hid.reset();
    await engine.runEffect('fw-waterfall', { color: { r: 0, g: 0, b: 255 } });
    expect(hid.sentFrames.length).toBeGreaterThanOrEqual(1);
    expect(engine.current()!.name).toBe('fw-waterfall');
  });

  it('rejects gracefully when device disconnected', async () => {
    hid.simulateDisconnect();
    await expect(engine.runEffect('fw-static', { color: { r: 1, g: 1, b: 1 } }))
      .rejects.toThrow(/not connected/);
  });
});
```

- [ ] **Step 2: Run, verify failure**

Run:
```bash
npx vitest run packages/daemon/test/engine.test.ts
```

Expected: failures (module missing).

- [ ] **Step 3: Implement `engine.ts`**

Create `packages/daemon/src/engine.ts`:

```ts
import { encodeFirmwareEffect } from '@fizz/core';
import type { FirmwareEffectName, FirmwareEffectParams } from '@fizz/core';
import type { HidController } from './hid.ts';
import { log } from './log.ts';

export interface CurrentEffect {
  name: FirmwareEffectName;
  params: FirmwareEffectParams;
  startedAt: string; // ISO
}

type Listener = (cur: CurrentEffect | null) => void;

export class EffectEngine {
  private state: CurrentEffect | null = null;
  private listeners: Listener[] = [];

  constructor(private readonly hid: HidController) {}

  current(): CurrentEffect | null { return this.state; }

  onChange(listener: Listener): void { this.listeners.push(listener); }

  async runEffect(name: FirmwareEffectName, params: FirmwareEffectParams): Promise<void> {
    const frames = encodeFirmwareEffect(name, params);
    await this.hid.sendFrames(frames);
    this.state = { name, params, startedAt: new Date().toISOString() };
    log.info({ name, params }, 'effect started');
    this.notify();
  }

  stop(): void {
    if (this.state) {
      log.info({ name: this.state.name }, 'effect stopped');
      this.state = null;
      this.notify();
    }
  }

  private notify() { for (const l of this.listeners) l(this.state); }
}
```

- [ ] **Step 4: Run tests, verify pass**

Run:
```bash
npx vitest run packages/daemon/test/engine.test.ts
```

Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add packages/daemon/src/engine.ts packages/daemon/test/engine.test.ts
git commit -m "feat(daemon): add EffectEngine in single-shot mode"
```

---

## T18: ProfileManager

**Files:**
- Create: `packages/daemon/src/profiles.ts`
- Create: `packages/daemon/test/profiles.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/daemon/test/profiles.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ProfileManager } from '../src/profiles.ts';

let dir: string;

beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'fizz-profiles-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe('ProfileManager', () => {
  it('returns empty list when file does not exist', async () => {
    const pm = new ProfileManager(join(dir, 'profiles.json'));
    await pm.load();
    expect(pm.list()).toEqual([]);
  });

  it('persists profiles atomically', async () => {
    const path = join(dir, 'profiles.json');
    const pm = new ProfileManager(path);
    await pm.load();
    await pm.save('gaming', {
      name: 'Gaming',
      effect: { name: 'fw-rainbow', params: { speed: 100 } },
    });
    const onDisk = JSON.parse(readFileSync(path, 'utf8'));
    expect(onDisk.profiles.gaming.name).toBe('Gaming');
    expect(onDisk.version).toBe(1);
  });

  it('activate sets active', async () => {
    const pm = new ProfileManager(join(dir, 'profiles.json'));
    await pm.load();
    await pm.save('a', { name: 'A', effect: { name: 'fw-static', params: { color: '#ff0000' } } });
    await pm.activate('a');
    expect(pm.active()).toBe('a');
  });

  it('delete removes profile', async () => {
    const pm = new ProfileManager(join(dir, 'profiles.json'));
    await pm.load();
    await pm.save('x', { name: 'X', effect: { name: 'fw-snake', params: {} } });
    await pm.delete('x');
    expect(pm.list().find((p) => p.name === 'X')).toBeUndefined();
  });

  it('rejects activate on unknown profile', async () => {
    const pm = new ProfileManager(join(dir, 'profiles.json'));
    await pm.load();
    await expect(pm.activate('nope')).rejects.toThrow(/not found/i);
  });

  it('recovers from corrupt JSON by backing up and starting empty', async () => {
    const path = join(dir, 'profiles.json');
    writeFileSync(path, '{ this is not json');
    const pm = new ProfileManager(path);
    await pm.load();
    expect(pm.list()).toEqual([]);
    expect(existsSync(path + '.bak')).toBe(true);
  });
});
```

- [ ] **Step 2: Run, verify failure**

Run:
```bash
npx vitest run packages/daemon/test/profiles.test.ts
```

Expected: failures (module missing).

- [ ] **Step 3: Implement `profiles.ts`**

Create `packages/daemon/src/profiles.ts`:

```ts
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { z } from 'zod';
import { Profile as ProfileSchema } from '@fizz/core';
import { log } from './log.ts';

export type Profile = z.infer<typeof ProfileSchema>;

const FileSchema = z.object({
  version: z.literal(1),
  active: z.string().nullable(),
  profiles: z.record(z.string(), ProfileSchema),
});
type FileShape = z.infer<typeof FileSchema>;

export class ProfileManager {
  private data: FileShape = { version: 1, active: null, profiles: {} };

  constructor(private readonly path: string) {}

  async load(): Promise<void> {
    if (!existsSync(this.path)) {
      this.data = { version: 1, active: null, profiles: {} };
      return;
    }
    const raw = readFileSync(this.path, 'utf8');
    try {
      this.data = FileSchema.parse(JSON.parse(raw));
    } catch (err) {
      log.warn({ err: (err as Error).message }, 'profiles.json invalid; backing up and starting empty');
      renameSync(this.path, this.path + '.bak');
      this.data = { version: 1, active: null, profiles: {} };
    }
  }

  list(): Profile[] { return Object.values(this.data.profiles); }
  active(): string | null { return this.data.active; }
  get(name: string): Profile | undefined { return this.data.profiles[name]; }

  async save(key: string, profile: Omit<Profile, 'createdAt'> & { createdAt?: string }): Promise<void> {
    const full: Profile = { ...profile, createdAt: profile.createdAt ?? new Date().toISOString() };
    ProfileSchema.parse(full);
    this.data.profiles[key] = full;
    await this.writeAtomic();
  }

  async activate(name: string): Promise<void> {
    if (!this.data.profiles[name]) throw new Error(`profile not found: ${name}`);
    this.data.active = name;
    await this.writeAtomic();
  }

  async delete(name: string): Promise<void> {
    delete this.data.profiles[name];
    if (this.data.active === name) this.data.active = null;
    await this.writeAtomic();
  }

  private async writeAtomic(): Promise<void> {
    const tmp = this.path + '.tmp';
    writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    renameSync(tmp, this.path);
  }
}
```

- [ ] **Step 4: Run tests, verify pass**

Run:
```bash
npx vitest run packages/daemon/test/profiles.test.ts
```

Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add packages/daemon/src/profiles.ts packages/daemon/test/profiles.test.ts
git commit -m "feat(daemon): add ProfileManager with atomic writes and corruption recovery"
```

---

## T19: IPC server (Unix socket + JSON-RPC)

**Files:**
- Create: `packages/daemon/src/ipc-server.ts`
- Create: `packages/daemon/test/ipc-server.test.ts`

- [ ] **Step 1: Write failing test for round-trip RPC over socket**

Create `packages/daemon/test/ipc-server.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createConnection } from 'node:net';
import { IpcServer } from '../src/ipc-server.ts';
import { EffectEngine } from '../src/engine.ts';
import { FakeHidController } from '../src/hid-mock.ts';
import { ProfileManager } from '../src/profiles.ts';

let dir: string;
let sockPath: string;
let server: IpcServer;
let hid: FakeHidController;
let engine: EffectEngine;
let pm: ProfileManager;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'fizz-ipc-'));
  sockPath = join(dir, 'fizz.sock');
  hid = new FakeHidController();
  engine = new EffectEngine(hid);
  pm = new ProfileManager(join(dir, 'profiles.json'));
  await pm.load();
  server = new IpcServer({ socketPath: sockPath, engine, profiles: pm, hid });
  await server.start();
});

afterEach(async () => {
  await server.stop();
  rmSync(dir, { recursive: true, force: true });
});

function call(method: string, params: unknown): Promise<any> {
  return new Promise((resolve, reject) => {
    const sock = createConnection(sockPath);
    let buf = '';
    sock.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      const nl = buf.indexOf('\n');
      if (nl >= 0) {
        const line = buf.slice(0, nl);
        sock.end();
        try { resolve(JSON.parse(line)); } catch (e) { reject(e); }
      }
    });
    sock.on('error', reject);
    sock.on('connect', () => {
      sock.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) + '\n');
    });
  });
}

describe('IpcServer', () => {
  it('device.status returns connected', async () => {
    const r = await call('device.status', {});
    expect(r.result.connected).toBe(true);
    expect(r.result.vid).toBe(0x258a);
  });

  it('effect.run starts effect', async () => {
    const r = await call('effect.run', { name: 'fw-rainbow', params: { speed: 100 } });
    expect(r.result.ok).toBe(true);
    expect(engine.current()!.name).toBe('fw-rainbow');
  });

  it('invalid params returns -32602', async () => {
    const r = await call('effect.run', { name: 'not-a-real-effect' });
    expect(r.error.code).toBe(-32602);
  });

  it('unknown method returns -32601', async () => {
    const r = await call('bogus.method', {});
    expect(r.error.code).toBe(-32601);
  });

  it('profile.list returns saved profiles', async () => {
    await pm.save('default', { name: 'Default', effect: { name: 'fw-static', params: { color: '#ff0000' } } });
    const r = await call('profile.list', {});
    expect(r.result.map((p: any) => p.name)).toContain('Default');
  });
});
```

- [ ] **Step 2: Run, verify failure**

Run:
```bash
npx vitest run packages/daemon/test/ipc-server.test.ts
```

Expected: failures (module missing).

- [ ] **Step 3: Implement `ipc-server.ts`**

Create `packages/daemon/src/ipc-server.ts`:

```ts
import { createServer, type Server, type Socket } from 'node:net';
import { existsSync, unlinkSync, chmodSync } from 'node:fs';
import {
  RpcMethods,
  RPC_ERR,
  type RpcMethodName,
  parseHex,
} from '@fizz/core';
import type { EffectEngine } from './engine.ts';
import type { ProfileManager } from './profiles.ts';
import type { HidController } from './hid.ts';
import { log } from './log.ts';

interface ServerOpts {
  socketPath: string;
  engine: EffectEngine;
  profiles: ProfileManager;
  hid: HidController;
}

export class IpcServer {
  private srv: Server | null = null;
  private clients = new Set<Socket>();

  constructor(private readonly opts: ServerOpts) {}

  async start(): Promise<void> {
    if (existsSync(this.opts.socketPath)) unlinkSync(this.opts.socketPath);
    this.srv = createServer((sock) => this.handleClient(sock));
    await new Promise<void>((resolve, reject) => {
      this.srv!.once('error', reject);
      this.srv!.listen(this.opts.socketPath, () => {
        chmodSync(this.opts.socketPath, 0o600);
        log.info({ path: this.opts.socketPath }, 'IPC server listening');
        resolve();
      });
    });
    this.opts.engine.onChange((cur) => this.broadcast('effect.changed', cur));
    this.opts.hid.on('connect', () => this.broadcast('device.changed', { connected: true }));
    this.opts.hid.on('disconnect', () => this.broadcast('device.changed', { connected: false }));
  }

  async stop(): Promise<void> {
    for (const c of this.clients) c.end();
    if (this.srv) {
      await new Promise<void>((resolve) => this.srv!.close(() => resolve()));
      this.srv = null;
    }
    if (existsSync(this.opts.socketPath)) {
      try { unlinkSync(this.opts.socketPath); } catch { /* ignore */ }
    }
  }

  private handleClient(sock: Socket) {
    this.clients.add(sock);
    let buf = '';
    sock.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      let nl: number;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        this.handleLine(sock, line).catch((err) => log.error({ err }, 'rpc handler error'));
      }
    });
    sock.on('close', () => this.clients.delete(sock));
    sock.on('error', (err) => { log.warn({ err }, 'client error'); this.clients.delete(sock); });
  }

  private async handleLine(sock: Socket, line: string): Promise<void> {
    if (!line.trim()) return;
    let req: { id?: unknown; method?: string; params?: unknown };
    try { req = JSON.parse(line); }
    catch { return this.writeError(sock, null, RPC_ERR.PARSE_ERROR, 'parse error'); }

    const id = (req.id ?? null) as string | number | null;
    const method = req.method;
    if (!method || typeof method !== 'string') {
      return this.writeError(sock, id, RPC_ERR.INVALID_REQUEST, 'missing method');
    }
    if (!(method in RpcMethods)) {
      return this.writeError(sock, id, RPC_ERR.METHOD_NOT_FOUND, `unknown method: ${method}`);
    }
    const spec = RpcMethods[method as RpcMethodName];
    const parsed = spec.params.safeParse(req.params ?? {});
    if (!parsed.success) {
      return this.writeError(sock, id, RPC_ERR.INVALID_PARAMS, parsed.error.message);
    }
    try {
      const result = await this.dispatch(method as RpcMethodName, parsed.data);
      this.writeResult(sock, id, result);
    } catch (err) {
      log.error({ err, method }, 'handler threw');
      this.writeError(sock, id, RPC_ERR.INTERNAL_ERROR, (err as Error).message);
    }
  }

  private async dispatch(method: RpcMethodName, params: unknown): Promise<unknown> {
    const { engine, profiles, hid } = this.opts;
    switch (method) {
      case 'device.status':
        return { connected: hid.isConnected(), vid: 0x258a, pid: 0x0049 };
      case 'effect.list':
        return ([
          ['fw-static', 'Solid firmware color (limited palette)'],
          ['fw-rainbow', 'Rainbow gradient (firmware)'],
          ['fw-snake', 'Snake (firmware)'],
          ['fw-sine-wave', 'Sine wave RGB (firmware)'],
          ['fw-star-twinkle', 'Star twinkle (firmware)'],
          ['fw-rainbow-blossom', 'Rainbow blossom (firmware)'],
          ['fw-waterfall', 'Waterfall (firmware)'],
          ['fw-wheel', 'Wheel (firmware)'],
        ]).map(([name, description]) => ({ name, description }));
      case 'effect.run': {
        const p = params as { name: any; params: any };
        const fxParams: any = { ...(p.params ?? {}) };
        if (typeof fxParams.color === 'string') fxParams.color = parseHex(fxParams.color);
        await engine.runEffect(p.name, fxParams);
        return { ok: true };
      }
      case 'effect.stop':
        engine.stop();
        return { ok: true };
      case 'effect.current':
        return engine.current();
      case 'solid.set': {
        const p = params as { color: string };
        await engine.runEffect('fw-static', { color: parseHex(p.color) });
        return { ok: true };
      }
      case 'profile.list':
        return profiles.list();
      case 'profile.activate': {
        const p = params as { name: string };
        await profiles.activate(p.name);
        const prof = profiles.get(p.name);
        if (prof) {
          const fxParams: any = { ...prof.effect.params };
          if (typeof fxParams.color === 'string') fxParams.color = parseHex(fxParams.color);
          await engine.runEffect(prof.effect.name, fxParams);
        }
        return { ok: true };
      }
      case 'profile.save': {
        const p = params as { name: string; profile: any };
        await profiles.save(p.name, p.profile);
        return { ok: true };
      }
      case 'profile.delete': {
        const p = params as { name: string };
        await profiles.delete(p.name);
        return { ok: true };
      }
      case 'daemon.version':
        return { version: '0.1.0', buildHash: process.env.FIZZ_BUILD_HASH ?? 'dev' };
      case 'daemon.shutdown':
        setTimeout(() => process.exit(0), 50);
        return { ok: true };
    }
  }

  private writeResult(sock: Socket, id: string | number | null, result: unknown) {
    sock.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
  }

  private writeError(sock: Socket, id: string | number | null, code: number, message: string) {
    sock.write(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }) + '\n');
  }

  private broadcast(method: string, params: unknown) {
    const line = JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n';
    for (const c of this.clients) { try { c.write(line); } catch { /* ignore */ } }
  }
}
```

- [ ] **Step 4: Run tests, verify pass**

Run:
```bash
npx vitest run packages/daemon/test/ipc-server.test.ts
```

Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add packages/daemon/src/ipc-server.ts packages/daemon/test/ipc-server.test.ts
git commit -m "feat(daemon): add IPC server (Unix socket + JSON-RPC)"
```

---

## T20: Daemon entry + systemd unit

**Files:**
- Create: `packages/daemon/src/index.ts`
- Create: `packages/daemon/systemd/fizzd.service`

- [ ] **Step 1: Implement daemon entry**

Create `packages/daemon/src/index.ts`:

```ts
#!/usr/bin/env node
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { homedir } from 'node:os';
import { socketPath, parseHex } from '@fizz/core';
import { NodeHidController } from './hid.ts';
import { FakeHidController } from './hid-mock.ts';
import { EffectEngine } from './engine.ts';
import { ProfileManager } from './profiles.ts';
import { IpcServer } from './ipc-server.ts';
import { log } from './log.ts';

const useFakeHid = process.argv.includes('--fake-hid');

async function main() {
  const profilesPath = `${homedir()}/.config/fizz/profiles.json`;
  mkdirSync(dirname(profilesPath), { recursive: true });

  const hid = useFakeHid ? new FakeHidController() : new NodeHidController();
  const engine = new EffectEngine(hid);
  const profiles = new ProfileManager(profilesPath);
  await profiles.load();

  const sock = socketPath();
  mkdirSync(dirname(sock), { recursive: true });
  const server = new IpcServer({ socketPath: sock, engine, profiles, hid });
  await server.start();

  // Restore last-active profile
  const active = profiles.active();
  if (active) {
    const prof = profiles.get(active);
    if (prof) {
      const fxParams: any = { ...prof.effect.params };
      if (typeof fxParams.color === 'string') fxParams.color = parseHex(fxParams.color);
      try { await engine.runEffect(prof.effect.name, fxParams); }
      catch (err) { log.warn({ err: (err as Error).message }, 'failed to restore profile on boot'); }
    }
  }

  const shutdown = async (sig: string) => {
    log.info({ sig }, 'shutting down');
    await server.stop();
    hid.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  log.info('fizzd ready');
}

main().catch((err) => { log.fatal({ err }, 'fizzd crashed'); process.exit(1); });
```

- [ ] **Step 2: Build and smoke-test the daemon with fake HID**

Run:
```bash
npm run build -w fizzd
node packages/daemon/dist/index.js --fake-hid &
DAEMON_PID=$!
sleep 1
echo '{"jsonrpc":"2.0","id":1,"method":"daemon.version","params":{}}' | nc -U "$XDG_RUNTIME_DIR/fizz.sock"
kill "$DAEMON_PID"
```

Expected: a JSON response line containing `"result":{"version":"0.1.0",...}`.

- [ ] **Step 3: Write systemd user unit**

Create `packages/daemon/systemd/fizzd.service`:

```ini
[Unit]
Description=Fizz RGB controller daemon for Redragon K617
After=graphical-session.target

[Service]
Type=simple
ExecStart=%h/.local/bin/fizzd
Restart=on-failure
RestartSec=2

# Hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=%h/.config/fizz %h/.cache/fizz %h/.local/state/fizz %t

[Install]
WantedBy=default.target
```

- [ ] **Step 4: Commit**

```bash
git add packages/daemon/src/index.ts packages/daemon/systemd/fizzd.service
git commit -m "feat(daemon): add entrypoint with profile restore and systemd unit"
```

---

## T21: CLI IPC client

**Files:**
- Create: `packages/cli/src/ipc-client.ts`
- Create: `packages/cli/test/ipc-client.test.ts`

- [ ] **Step 1: Write failing test**

Create `packages/cli/test/ipc-client.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { IpcClient } from '../src/ipc-client.ts';

let dir: string;
let sockPath: string;
let server: ReturnType<typeof createServer>;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'fizz-cli-'));
  sockPath = join(dir, 'fizz.sock');
  server = createServer((sock) => {
    sock.on('data', (chunk) => {
      const line = chunk.toString('utf8').trim();
      const req = JSON.parse(line);
      sock.write(JSON.stringify({ jsonrpc: '2.0', id: req.id, result: { echoed: req.method } }) + '\n');
    });
  });
  await new Promise<void>((resolve) => server.listen(sockPath, () => resolve()));
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  rmSync(dir, { recursive: true, force: true });
});

describe('IpcClient', () => {
  it('round-trips a request', async () => {
    const c = new IpcClient(sockPath);
    const r = await c.call('device.status', {});
    expect(r).toEqual({ echoed: 'device.status' });
    c.close();
  });

  it('rejects on connection failure', async () => {
    const c = new IpcClient('/nonexistent/socket');
    await expect(c.call('device.status', {})).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run, verify failure**

Run:
```bash
npx vitest run packages/cli/test/ipc-client.test.ts
```

Expected: failures (module missing).

- [ ] **Step 3: Implement `ipc-client.ts`**

Create `packages/cli/src/ipc-client.ts`:

```ts
import { createConnection, type Socket } from 'node:net';

export class IpcClient {
  private id = 0;
  private sock: Socket | null = null;
  private buf = '';
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private connectPromise: Promise<void> | null = null;

  constructor(private readonly socketPath: string) {}

  private async ensureConnected(): Promise<void> {
    if (this.sock && !this.sock.destroyed) return;
    if (this.connectPromise) return this.connectPromise;
    this.connectPromise = new Promise<void>((resolve, reject) => {
      const sock = createConnection(this.socketPath);
      sock.on('connect', () => {
        this.sock = sock;
        sock.on('data', (chunk) => this.onData(chunk.toString('utf8')));
        sock.on('close', () => this.failAll(new Error('socket closed')));
        sock.on('error', (err) => this.failAll(err));
        this.connectPromise = null;
        resolve();
      });
      sock.on('error', (err) => {
        this.connectPromise = null;
        reject(err);
      });
    });
    return this.connectPromise;
  }

  private onData(text: string) {
    this.buf += text;
    let nl: number;
    while ((nl = this.buf.indexOf('\n')) >= 0) {
      const line = this.buf.slice(0, nl);
      this.buf = this.buf.slice(nl + 1);
      if (!line.trim()) continue;
      let msg: any;
      try { msg = JSON.parse(line); } catch { continue; }
      if (msg.id === undefined) continue;     // notification: ignore here
      const p = this.pending.get(msg.id);
      if (!p) continue;
      this.pending.delete(msg.id);
      if (msg.error) p.reject(new Error(`${msg.error.code}: ${msg.error.message}`));
      else p.resolve(msg.result);
    }
  }

  private failAll(err: Error) {
    for (const p of this.pending.values()) p.reject(err);
    this.pending.clear();
    if (this.sock) { try { this.sock.destroy(); } catch { /* ignore */ } }
    this.sock = null;
  }

  async call(method: string, params: unknown): Promise<unknown> {
    await this.ensureConnected();
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.sock!.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  }

  close(): void { this.failAll(new Error('client closed')); }
}
```

- [ ] **Step 4: Run tests, verify pass**

Run:
```bash
npx vitest run packages/cli/test/ipc-client.test.ts
```

Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/ipc-client.ts packages/cli/test/ipc-client.test.ts
git commit -m "feat(cli): add IpcClient for talking to fizzd"
```

---

## T22: CLI core commands (status, set, effect)

**Files:**
- Create: `packages/cli/src/cmd/status.ts`, `set.ts`, `effect.ts`
- Create: `packages/cli/src/index.ts`

- [ ] **Step 1: Implement `status.ts`**

Create `packages/cli/src/cmd/status.ts`:

```ts
import { socketPath } from '@fizz/core';
import { IpcClient } from '../ipc-client.ts';

export async function statusCmd(): Promise<void> {
  const client = new IpcClient(socketPath());
  try {
    const status = await client.call('device.status', {}) as { connected: boolean; vid: number; pid: number };
    const cur = await client.call('effect.current', {}) as { name: string; params: any } | null;
    const ver = await client.call('daemon.version', {}) as { version: string };
    console.log(`device:  ${status.connected ? 'connected' : 'disconnected'} (${status.vid.toString(16)}:${status.pid.toString(16)})`);
    console.log(`effect:  ${cur ? cur.name : '(none)'}${cur ? ` ${JSON.stringify(cur.params)}` : ''}`);
    console.log(`daemon:  v${ver.version}`);
  } finally { client.close(); }
}
```

- [ ] **Step 2: Implement `set.ts`**

Create `packages/cli/src/cmd/set.ts`:

```ts
import { socketPath } from '@fizz/core';
import { IpcClient } from '../ipc-client.ts';

export async function setCmd(color: string): Promise<void> {
  let hex = color.trim();
  const named: Record<string, string> = {
    red: '#ff0000', green: '#00ff00', blue: '#0000ff',
    white: '#ffffff', black: '#000000', off: '#000000',
  };
  if (named[hex.toLowerCase()]) hex = named[hex.toLowerCase()]!;
  if (!/^#?[0-9a-fA-F]{6}$/.test(hex)) {
    console.error(`Invalid color: ${color}. Use #RRGGBB or one of: ${Object.keys(named).join(', ')}`);
    process.exit(2);
  }
  if (!hex.startsWith('#')) hex = '#' + hex;
  const client = new IpcClient(socketPath());
  try {
    await client.call('solid.set', { color: hex });
    console.log(`set ${hex}`);
  } finally { client.close(); }
}
```

- [ ] **Step 3: Implement `effect.ts`**

Create `packages/cli/src/cmd/effect.ts`:

```ts
import { socketPath } from '@fizz/core';
import { IpcClient } from '../ipc-client.ts';

export async function effectListCmd(): Promise<void> {
  const client = new IpcClient(socketPath());
  try {
    const effects = await client.call('effect.list', {}) as { name: string; description: string }[];
    for (const e of effects) console.log(`${e.name.padEnd(20)} ${e.description}`);
  } finally { client.close(); }
}

export async function effectRunCmd(name: string, opts: Record<string, string>): Promise<void> {
  const params: Record<string, unknown> = {};
  if (opts.color) params.color = opts.color.startsWith('#') ? opts.color : '#' + opts.color;
  if (opts.speed !== undefined) params.speed = parseInt(opts.speed, 10);
  if (opts.brightness !== undefined) params.brightness = parseInt(opts.brightness, 10);
  if (opts.direction) params.direction = opts.direction;
  if (opts.density !== undefined) params.density = parseInt(opts.density, 10);

  const client = new IpcClient(socketPath());
  try {
    await client.call('effect.run', { name, params });
    console.log(`effect ${name} started`);
  } finally { client.close(); }
}

export async function effectStopCmd(): Promise<void> {
  const client = new IpcClient(socketPath());
  try {
    await client.call('effect.stop', {});
    console.log('effect stopped');
  } finally { client.close(); }
}
```

- [ ] **Step 4: Wire up commander in `index.ts`**

Create `packages/cli/src/index.ts`:

```ts
#!/usr/bin/env node
import { Command } from 'commander';
import { statusCmd } from './cmd/status.ts';
import { setCmd } from './cmd/set.ts';
import { effectListCmd, effectRunCmd, effectStopCmd } from './cmd/effect.ts';

const program = new Command();
program.name('fizz').description('Redragon Fizz K617 RGB controller').version('0.1.0');

program.command('status').description('Show device/effect/daemon status').action(statusCmd);
program.command('set <color>').description('Set solid color (#RRGGBB or named)').action(setCmd);

const effect = program.command('effect').description('Manage effects');
effect.command('list').description('List available effects').action(effectListCmd);
effect.command('run <name>')
  .description('Run a firmware effect')
  .option('--color <hex>', 'Color for effects that take one')
  .option('--speed <n>', 'Speed 0..255')
  .option('--brightness <n>', 'Brightness 0..255')
  .option('--direction <forward|reverse>', 'Direction')
  .option('--density <n>', 'Density')
  .action(effectRunCmd);
effect.command('stop').description('Stop current effect').action(effectStopCmd);

await program.parseAsync(process.argv);
```

- [ ] **Step 5: Build and smoke-test against fake-hid daemon**

Run:
```bash
npm run build
node packages/daemon/dist/index.js --fake-hid &
DAEMON_PID=$!
sleep 1
node packages/cli/dist/index.js status
node packages/cli/dist/index.js set red
node packages/cli/dist/index.js effect list
node packages/cli/dist/index.js effect run fw-rainbow --speed 100
node packages/cli/dist/index.js effect stop
kill "$DAEMON_PID"
```

Expected: each command prints reasonable output without errors.

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/index.ts packages/cli/src/cmd/
git commit -m "feat(cli): add status, set, and effect commands"
```

---

## T23: CLI profile commands

**Files:**
- Create: `packages/cli/src/cmd/profile.ts`
- Modify: `packages/cli/src/index.ts`

- [ ] **Step 1: Implement `profile.ts`**

Create `packages/cli/src/cmd/profile.ts`:

```ts
import { socketPath } from '@fizz/core';
import { IpcClient } from '../ipc-client.ts';

export async function profileListCmd(): Promise<void> {
  const client = new IpcClient(socketPath());
  try {
    const profiles = await client.call('profile.list', {}) as { name: string; effect: { name: string } }[];
    if (profiles.length === 0) { console.log('(no profiles)'); return; }
    for (const p of profiles) console.log(`${p.name.padEnd(20)} ${p.effect.name}`);
  } finally { client.close(); }
}

export async function profileActivateCmd(name: string): Promise<void> {
  const client = new IpcClient(socketPath());
  try {
    await client.call('profile.activate', { name });
    console.log(`activated ${name}`);
  } finally { client.close(); }
}

export async function profileSaveCmd(
  key: string,
  opts: { name?: string; effect: string; color?: string; speed?: string; brightness?: string; direction?: string; density?: string },
): Promise<void> {
  const params: Record<string, unknown> = {};
  if (opts.color) params.color = opts.color.startsWith('#') ? opts.color : '#' + opts.color;
  if (opts.speed !== undefined) params.speed = parseInt(opts.speed, 10);
  if (opts.brightness !== undefined) params.brightness = parseInt(opts.brightness, 10);
  if (opts.direction) params.direction = opts.direction;
  if (opts.density !== undefined) params.density = parseInt(opts.density, 10);

  const profile = { name: opts.name ?? key, effect: { name: opts.effect, params } };

  const client = new IpcClient(socketPath());
  try {
    await client.call('profile.save', { name: key, profile });
    console.log(`saved profile "${key}"`);
  } finally { client.close(); }
}

export async function profileDeleteCmd(name: string): Promise<void> {
  const client = new IpcClient(socketPath());
  try {
    await client.call('profile.delete', { name });
    console.log(`deleted profile "${name}"`);
  } finally { client.close(); }
}
```

- [ ] **Step 2: Wire commands into `index.ts`**

In `packages/cli/src/index.ts`, add the imports and commands **before** the final `await program.parseAsync(process.argv);` line:

```ts
import { profileListCmd, profileActivateCmd, profileSaveCmd, profileDeleteCmd } from './cmd/profile.ts';

const profile = program.command('profile').description('Manage profiles');
profile.command('list').description('List saved profiles').action(profileListCmd);
profile.command('activate <name>').description('Activate a profile').action(profileActivateCmd);
profile.command('save <key>')
  .description('Save current settings as a profile')
  .requiredOption('--effect <name>', 'Firmware effect name (fw-rainbow, fw-snake, etc.)')
  .option('--name <displayName>', 'Human-readable name (defaults to key)')
  .option('--color <hex>')
  .option('--speed <n>')
  .option('--brightness <n>')
  .option('--direction <forward|reverse>')
  .option('--density <n>')
  .action(profileSaveCmd);
profile.command('delete <name>').description('Delete a profile').action(profileDeleteCmd);
```

- [ ] **Step 3: Build and smoke-test**

Run:
```bash
npm run build -w fizz
node packages/daemon/dist/index.js --fake-hid &
DAEMON_PID=$!
sleep 1
node packages/cli/dist/index.js profile save gaming --effect fw-rainbow --speed 80
node packages/cli/dist/index.js profile list
node packages/cli/dist/index.js profile activate gaming
node packages/cli/dist/index.js profile delete gaming
kill "$DAEMON_PID"
```

Expected: profile lifecycle works without errors.

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/cmd/profile.ts packages/cli/src/index.ts
git commit -m "feat(cli): add profile commands (list/activate/save/delete)"
```

---

## T24: CLI daemon-control commands

**Files:**
- Create: `packages/cli/src/cmd/daemon.ts`
- Modify: `packages/cli/src/index.ts`

- [ ] **Step 1: Implement daemon control via systemctl**

Create `packages/cli/src/cmd/daemon.ts`:

```ts
import { spawnSync } from 'node:child_process';

function systemctl(...args: string[]): number {
  const r = spawnSync('systemctl', ['--user', ...args], { stdio: 'inherit' });
  return r.status ?? 1;
}

export function daemonStartCmd():   void { process.exit(systemctl('start',   'fizzd')); }
export function daemonStopCmd():    void { process.exit(systemctl('stop',    'fizzd')); }
export function daemonRestartCmd(): void { process.exit(systemctl('restart', 'fizzd')); }
export function daemonEnableCmd():  void { process.exit(systemctl('enable',  '--now', 'fizzd')); }
export function daemonDisableCmd(): void { process.exit(systemctl('disable', '--now', 'fizzd')); }
export function daemonStatusCmd():  void { process.exit(systemctl('status',  'fizzd')); }
export function daemonLogsCmd():    void {
  const r = spawnSync('journalctl', ['--user', '-u', 'fizzd', '-f'], { stdio: 'inherit' });
  process.exit(r.status ?? 0);
}
```

- [ ] **Step 2: Wire into `index.ts`**

Add before the final `parseAsync`:

```ts
import {
  daemonStartCmd, daemonStopCmd, daemonRestartCmd,
  daemonEnableCmd, daemonDisableCmd, daemonStatusCmd, daemonLogsCmd,
} from './cmd/daemon.ts';

const daemon = program.command('daemon').description('Manage the fizzd systemd user service');
daemon.command('start').action(daemonStartCmd);
daemon.command('stop').action(daemonStopCmd);
daemon.command('restart').action(daemonRestartCmd);
daemon.command('enable').description('Enable + start (autostart on login)').action(daemonEnableCmd);
daemon.command('disable').description('Disable + stop').action(daemonDisableCmd);
daemon.command('status').action(daemonStatusCmd);
daemon.command('logs').description('Tail fizzd logs').action(daemonLogsCmd);
```

- [ ] **Step 3: Build**

Run:
```bash
npm run build -w fizz
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/cmd/daemon.ts packages/cli/src/index.ts
git commit -m "feat(cli): add daemon control commands (start/stop/enable/logs)"
```

---

## T25: Install script + README

**Files:**
- Create: `tools/install.sh`
- Create: `README.md`

- [ ] **Step 1: Write `tools/install.sh`**

```bash
#!/usr/bin/env bash
# Install fizz-rgb daemon, CLI, systemd unit, and udev rule on a Fedora system.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> Building all packages..."
cd "$ROOT"
npm install
npm run build

mkdir -p "$HOME/.local/bin"
mkdir -p "$HOME/.config/systemd/user"
mkdir -p "$HOME/.config/fizz"

echo "==> Linking binaries to ~/.local/bin..."
ln -sf "$ROOT/packages/daemon/dist/index.js" "$HOME/.local/bin/fizzd"
ln -sf "$ROOT/packages/cli/dist/index.js"   "$HOME/.local/bin/fizz"

echo "==> Installing systemd user unit..."
cp "$ROOT/packages/daemon/systemd/fizzd.service" "$HOME/.config/systemd/user/fizzd.service"
systemctl --user daemon-reload

echo "==> Installing udev rule (requires sudo)..."
"$ROOT/tools/install-udev.sh"

echo
echo "Done. Next steps:"
echo "  1. Make sure ~/.local/bin is on your PATH."
echo "  2. Unplug and replug your K617 if you haven't already."
echo "  3. Enable + start the daemon:  fizz daemon enable"
echo "  4. Sanity check:                fizz status"
echo "  5. Try an effect:               fizz effect run fw-rainbow"
```

Make executable:
```bash
chmod +x tools/install.sh
```

- [ ] **Step 2: Write `README.md`**

```markdown
# fizz-rgb

Linux RGB controller for the **Redragon Fizz K617** (60% wired mechanical keyboard).
Fills the gap left by the official Windows-only Redragon software.

## Status

**Phase 1** — daemon, CLI, and firmware-native effects working. GUI (Phase 2)
and per-key custom effects (Phase 3) coming later. See `docs/superpowers/specs/`
for the full design.

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
```

- [ ] **Step 3: Commit**

```bash
git add tools/install.sh README.md
git commit -m "docs: add install script and README"
```

---

## T26: End-to-end smoke test

**Files:**
- Create: `tools/e2e-smoke.sh`

Manual test against the real keyboard (not run in CI).

- [ ] **Step 1: Write smoke script**

Create `tools/e2e-smoke.sh`:

```bash
#!/usr/bin/env bash
# Phase 1 end-to-end smoke test against the real K617.
# Requires: fizz/fizzd installed (run tools/install.sh first), daemon running.
set -euo pipefail

assert_ok() {
  if ! "$@"; then
    echo "FAIL: $*"
    exit 1
  fi
}

echo "==> Ensuring daemon is running..."
fizz daemon start || true
sleep 1

echo "==> 1. Status check"
assert_ok fizz status

echo "==> 2. Set solid red — visually confirm LEDs turn red"
fizz set red
read -rp "    LEDs red? [y/N] " ans
[[ "${ans,,}" == y* ]] || { echo "FAIL: user did not confirm red"; exit 1; }

echo "==> 3. Run rainbow effect — visually confirm rainbow animates"
fizz effect run fw-rainbow --speed 128
read -rp "    Rainbow animating? [y/N] " ans
[[ "${ans,,}" == y* ]] || { echo "FAIL: user did not confirm rainbow"; exit 1; }

echo "==> 4. Run waterfall — visually confirm"
fizz effect run fw-waterfall --color "#00aaff" --speed 100
read -rp "    Waterfall animating? [y/N] " ans
[[ "${ans,,}" == y* ]] || { echo "FAIL: user did not confirm waterfall"; exit 1; }

echo "==> 5. Save profile, switch effect, restore profile"
fizz profile save smoke --effect fw-snake --color "#ff00ff" --speed 80
fizz effect run fw-static --color "#ffffff"
sleep 1
fizz profile activate smoke
read -rp "    Snake (magenta)? [y/N] " ans
[[ "${ans,,}" == y* ]] || { echo "FAIL: user did not confirm profile restored"; exit 1; }
fizz profile delete smoke

echo "==> 6. Restart daemon, confirm effect persists across restart"
fizz profile save persist --effect fw-rainbow-blossom --speed 100
fizz profile activate persist
fizz daemon restart
sleep 2
fizz status
read -rp "    Rainbow Blossom after restart? [y/N] " ans
[[ "${ans,,}" == y* ]] || { echo "FAIL: profile did not restore on restart"; exit 1; }
fizz profile delete persist

echo
echo "SMOKE TESTS PASSED."
```

Make executable:
```bash
chmod +x tools/e2e-smoke.sh
```

- [ ] **Step 2: Run smoke script against real hardware**

Run:
```bash
./tools/e2e-smoke.sh
```

Expected: each step prompts; user confirms LEDs behave correctly. Script ends with "SMOKE TESTS PASSED."

If any step fails: re-check `docs/reverse-engineering/protocol.md` and the encoder constants in `packages/core/src/protocol.ts`.

- [ ] **Step 3: Commit and tag Phase 1 release**

```bash
git add tools/e2e-smoke.sh
git commit -m "test: add Phase 1 end-to-end smoke test"
git tag -a v0.1.0 -m "Phase 1: daemon + CLI + firmware-native effects"
```

---

## Phase 1 Done When

- `fizz daemon enable` registers and starts the systemd user service
- `fizz status` reports the device connected
- `fizz set red` turns the keyboard red
- `fizz effect run fw-rainbow` triggers the rainbow firmware effect
- `fizz profile save … && fizz profile activate …` round-trips through JSON file
- Restarting the daemon restores the last-active profile
- All unit/integration tests pass (`npm test`)
- The end-to-end smoke test passes against the real keyboard

After Phase 1 ships, brainstorm Phase 2 (GUI Electron + 3D) based on real
learnings from this phase — the IPC surface area may evolve.
