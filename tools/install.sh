#!/usr/bin/env bash
# Install fizz-rgb daemon, CLI, systemd unit, and udev rule on any modern
# Linux distro with systemd-user, npm, and udev (Fedora 43+, Ubuntu 22.04+,
# Arch, openSUSE Tumbleweed, etc.). The udev rule uses MODE=0666 which is
# distro-agnostic — no plugdev/input group membership required.
#
# Flags:
#   --easy            Full setup: build AppImage, install GUI app menu entry,
#                     install autostart entry (GUI launches hidden on login).
#                     Implies all other flags.
#   --with-gui        Build the Electron GUI AppImage and install the
#                     application menu launcher.
#   --autostart-gui   Drop a ~/.config/autostart/ entry so the GUI starts
#                     hidden in the tray on login. Requires --with-gui (or
#                     a previously built AppImage).
#   --no-enable       Skip auto-enable of the systemd-user fizzd service.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

WITH_GUI=0
AUTOSTART_GUI=0
AUTO_ENABLE=1
for arg in "$@"; do
  case "$arg" in
    --easy)          WITH_GUI=1; AUTOSTART_GUI=1; AUTO_ENABLE=1 ;;
    --with-gui)      WITH_GUI=1 ;;
    --autostart-gui) AUTOSTART_GUI=1 ;;
    --no-enable)     AUTO_ENABLE=0 ;;
    -h|--help)
      sed -n '2,13p' "$0"
      exit 0
      ;;
    *)
      echo "ERROR: unknown flag: $arg" >&2
      exit 2
      ;;
  esac
done

# Resolve node BEFORE building so the systemd unit gets an absolute path that
# survives the minimal PATH systemd-user uses.
NODE_BIN="$(command -v node || true)"
if [[ -z "$NODE_BIN" ]]; then
  echo "ERROR: 'node' not found in PATH. Install Node.js 22+ and retry." >&2
  exit 1
fi

echo "==> Using node: $NODE_BIN"

echo "==> Building all packages..."
cd "$ROOT"
npm install
npm run build

mkdir -p "$HOME/.local/bin"
mkdir -p "$HOME/.config/systemd/user"
# Three writable dirs the daemon needs (matches ReadWritePaths= in the unit).
# Without these, systemd's namespace setup fails before fizzd even starts.
mkdir -p "$HOME/.config/fizz"
mkdir -p "$HOME/.cache/fizz"
mkdir -p "$HOME/.local/state/fizz"

echo "==> Linking binaries to ~/.local/bin..."
ln -sf "$ROOT/packages/daemon/dist/index.js" "$HOME/.local/bin/fizzd"
ln -sf "$ROOT/packages/cli/dist/index.js"   "$HOME/.local/bin/fizz"

echo "==> Installing systemd user unit (with resolved node path)..."
sed "s|@NODE@|$NODE_BIN|g" \
  "$ROOT/packages/daemon/systemd/fizzd.service" \
  > "$HOME/.config/systemd/user/fizzd.service"
systemctl --user daemon-reload
systemctl --user reset-failed fizzd 2>/dev/null || true

echo "==> Installing udev rule (requires sudo)..."
"$ROOT/tools/install-udev.sh"

if [[ "$AUTO_ENABLE" == "1" ]]; then
  echo "==> Enabling fizzd.service for autostart on login..."
  systemctl --user enable --now fizzd.service
fi

APPIMAGE_DEST="$HOME/.local/bin/fizz-rgb.AppImage"

if [[ "$WITH_GUI" == "1" ]]; then
  # Regenerate raster icons from SVG when the toolchain is available, so any
  # icon.svg change propagates without committing 12 PNGs.
  if command -v rsvg-convert >/dev/null 2>&1 \
      && [[ -f "$ROOT/packages/gui/resources/icon.svg" ]]; then
    echo "==> Rendering icons from icon.svg..."
    for size in 16 22 24 32 48 64 96 128 192 256 384 512; do
      rsvg-convert -w "$size" -h "$size" \
        "$ROOT/packages/gui/resources/icon.svg" \
        -o "$ROOT/packages/gui/resources/icon-${size}.png"
    done
    cp "$ROOT/packages/gui/resources/icon-512.png" \
       "$ROOT/packages/gui/resources/icon.png"
  fi

  echo "==> Building Electron GUI AppImage (may take a couple of minutes)..."
  npm run build:appimage -w fizz-gui

  APPIMAGE_SRC="$(find "$ROOT/packages/gui/release" -maxdepth 1 -name '*.AppImage' -print -quit)"
  if [[ -z "$APPIMAGE_SRC" ]]; then
    echo "ERROR: AppImage not found in packages/gui/release/ after build." >&2
    exit 1
  fi

  echo "==> Installing AppImage to $APPIMAGE_DEST"
  install -m 755 "$APPIMAGE_SRC" "$APPIMAGE_DEST"

  echo "==> Installing icons across hicolor theme sizes..."
  # Ensure hicolor theme index exists so gtk-update-icon-cache can build a cache.
  if [[ ! -f "$HOME/.local/share/icons/hicolor/index.theme" && -f /usr/share/icons/hicolor/index.theme ]]; then
    mkdir -p "$HOME/.local/share/icons/hicolor"
    cp /usr/share/icons/hicolor/index.theme "$HOME/.local/share/icons/hicolor/index.theme"
  fi
  for size in 16 22 24 32 48 64 96 128 192 256 384 512; do
    src="$ROOT/packages/gui/resources/icon-${size}.png"
    [[ -f "$src" ]] || continue
    mkdir -p "$HOME/.local/share/icons/hicolor/${size}x${size}/apps"
    install -m 644 "$src" "$HOME/.local/share/icons/hicolor/${size}x${size}/apps/fizz-rgb.png"
  done

  echo "==> Installing application menu entry..."
  mkdir -p "$HOME/.local/share/applications"
  sed "s|@EXEC@|$APPIMAGE_DEST|g" \
    "$ROOT/packages/gui/resources/fizz-rgb.desktop" \
    > "$HOME/.local/share/applications/fizz-rgb.desktop"

  # Refresh icon/desktop caches when the tools are present (best-effort).
  command -v update-desktop-database >/dev/null 2>&1 && \
    update-desktop-database "$HOME/.local/share/applications" >/dev/null 2>&1 || true
  command -v gtk-update-icon-cache >/dev/null 2>&1 && \
    gtk-update-icon-cache "$HOME/.local/share/icons/hicolor" >/dev/null 2>&1 || true
fi

if [[ "$AUTOSTART_GUI" == "1" ]]; then
  if [[ ! -x "$APPIMAGE_DEST" ]]; then
    echo "ERROR: --autostart-gui requires --with-gui (no AppImage at $APPIMAGE_DEST)." >&2
    exit 1
  fi
  echo "==> Installing autostart entry (GUI launches hidden on login)..."
  mkdir -p "$HOME/.config/autostart"
  sed "s|@EXEC@|$APPIMAGE_DEST|g" \
    "$ROOT/packages/gui/resources/fizz-rgb-autostart.desktop" \
    > "$HOME/.config/autostart/fizz-rgb.desktop"
fi

echo
echo "Done. Summary:"
echo "  - Daemon:      $([[ $AUTO_ENABLE == 1 ]] && echo 'enabled (autostart on login)' || echo 'installed (not enabled)')"
echo "  - GUI build:   $([[ $WITH_GUI == 1 ]] && echo "AppImage at $APPIMAGE_DEST" || echo 'skipped (re-run with --with-gui)')"
echo "  - GUI autorun: $([[ $AUTOSTART_GUI == 1 ]] && echo 'enabled (hidden on login, lives in tray)' || echo 'skipped')"
echo
echo "Next steps:"
echo "  - Make sure ~/.local/bin is on your PATH."
echo "  - Unplug and replug your K617 if you haven't already."
echo "  - Sanity check: fizz status"
if [[ "$AUTO_ENABLE" == "0" ]]; then
  echo "  - Enable daemon: fizz daemon enable"
fi
if [[ "$WITH_GUI" == "1" ]]; then
  echo "  - Launch GUI:    $APPIMAGE_DEST  (or pick 'Fizz RGB' from your app menu)"
fi
