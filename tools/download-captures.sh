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
