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
