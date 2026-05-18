#!/usr/bin/env bash
# Install udev rule granting the active session user r/w access to the
# Redragon Fizz K617. Uses TAG+="uaccess" (systemd-logind ACL) so the rule
# works on Fedora/RHEL (no `plugdev` group) as well as Debian-family distros.
set -euo pipefail

RULE_PATH="/etc/udev/rules.d/99-fizz-k617.rules"
# MODE="0666" makes this single device's HID interface user-writable without
# requiring group membership or active-session ACL (uaccess does not fire
# reliably on `change` events). Blast radius is one device (the K617 RGB
# control interface); we accept it for personal use. Future revision can
# switch to a tighter group/ACL scheme.
RULE_CONTENT='# Redragon Fizz K617 (BY Tech) — grant all users r/w access to RGB control interface
SUBSYSTEM=="hidraw", ATTRS{idVendor}=="258a", ATTRS{idProduct}=="0049", MODE="0666", TAG+="uaccess"
SUBSYSTEM=="usb",    ATTRS{idVendor}=="258a", ATTRS{idProduct}=="0049", MODE="0666", TAG+="uaccess"
'

if [[ -f "$RULE_PATH" ]] && [[ "$(<"$RULE_PATH")" == "${RULE_CONTENT%$'\n'}" ]]; then
  echo "udev rule already installed and up to date."
  exit 0
fi

echo "Installing udev rule to $RULE_PATH (requires sudo)..."
printf '%s' "$RULE_CONTENT" | sudo tee "$RULE_PATH" > /dev/null
sudo udevadm control --reload-rules
sudo udevadm trigger --subsystem-match=hidraw --action=change
echo "Done. Unplug and replug your keyboard for permissions to apply."
