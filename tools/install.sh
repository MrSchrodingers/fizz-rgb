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
