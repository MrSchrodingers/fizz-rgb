#!/usr/bin/env bash
# Install udev rule granting plugdev group r/w access to the Redragon Fizz K617.
set -euo pipefail

RULE_PATH="/etc/udev/rules.d/99-fizz-k617.rules"
RULE_CONTENT='# Redragon Fizz K617 (BY Tech) — grant plugdev access to all interfaces
SUBSYSTEM=="hidraw", ATTRS{idVendor}=="258a", ATTRS{idProduct}=="0049", MODE="0660", GROUP="plugdev", TAG+="uaccess"
SUBSYSTEM=="usb",    ATTRS{idVendor}=="258a", ATTRS{idProduct}=="0049", MODE="0660", GROUP="plugdev", TAG+="uaccess"
'

if [[ -f "$RULE_PATH" ]] && [[ "$(<"$RULE_PATH")" == "$RULE_CONTENT" ]]; then
  echo "udev rule already installed and up to date."
  exit 0
fi

echo "Installing udev rule to $RULE_PATH (requires sudo)..."
printf '%s' "$RULE_CONTENT" | sudo tee "$RULE_PATH" > /dev/null
sudo udevadm control --reload-rules
sudo udevadm trigger --subsystem-match=hidraw --action=change
echo "Done. Unplug and replug your keyboard for permissions to apply."
