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
