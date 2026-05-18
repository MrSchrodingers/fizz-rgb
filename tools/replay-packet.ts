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
