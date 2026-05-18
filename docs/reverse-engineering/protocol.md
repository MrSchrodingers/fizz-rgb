# Redragon Fizz K617 — USB HID Protocol (observed)

**Device:** VID `0x258A` PID `0x0049` (BY Tech / Redragon Fizz K617, MCU Sinowealth SH68F90A / BYK916)
**Source:** USB captures from OpenRGB issue [#2172](https://gitlab.com/CalcProgrammer1/OpenRGB/-/issues/2172), extracted via `tools/extract-packets.py`
**Date analyzed:** 2026-05-18

## Transport

- HID **feature reports** sent as USB SET_REPORT (`bmRequestType=0x21`, `bRequest=0x09`).
- `wIndex = 0x0001` — interface 1 (vendor HID, not the boot keyboard at interface 0).
- Two report IDs in use:
  - **Report 0x05** — "handshake / lock". 6-byte payload. `wValue=0x0305`, `wLength=6`. Always `[0x05, 0x83, 0xb6, 0x00, 0x00, 0x00]`.
  - **Report 0x06** — "data block". 1032-byte payload. `wValue=0x0306`, `wLength=1032`. First byte is report ID (`0x06`).

## Burst structure for an effect change

To change to a firmware-native effect, the Redragon software sends a **burst** of 5 packets in order:

```
1× handshake  (6 bytes, report 0x05)
4× data block (1032 bytes each, report 0x06)
```

The captures show the burst repeated 2-3 times consecutively, followed by an additional 1032-byte "commit" packet. Replay tests against real hardware will determine if a single burst is enough; the safe pattern is to send the full burst at least once plus the final commit packet.

## Data block structure (report 0x06, 1032 bytes)

Each 1032-byte data block has a header at offsets 0-7 and a 1024-byte body afterwards. The header bytes vary per block index within the burst:

| Block (index in burst) | Bytes 0..7                          | Notes                                       |
| ---------------------- | ----------------------------------- | ------------------------------------------- |
| Block #1               | `06 08 b8 00 40 00 00 00`           | Carries **base color** at offsets 29,30,31  |
| Block #2               | `06 09 bc 00 40 00 00 00`           | (cursor `0xbc`)                             |
| Block #3               | `06 09 c0 00 40 00 00 00`           | (cursor `0xc0`)                             |
| Block #4               | `06 03 b6 00 00 00 00 00`           | Carries **effect mode** at byte [21] and **speed/brightness** at bytes [69, 71] |

The header pattern looks like `report_id, opcode, cursor_lo, cursor_hi, length (0x40=64), 0x00, 0x00, 0x00`. The `0x40 = 64` likely indicates the size of meaningful payload within each block. The remaining ~960 bytes are padded with 0x00 in the captures.

### Where parameters live within the blocks

| Parameter           | Block # | Byte offset           | Notes                                                  |
| ------------------- | ------- | --------------------- | ------------------------------------------------------ |
| Color R             | #1      | 29                    |                                                        |
| Color G             | #1      | 30                    |                                                        |
| Color B             | #1      | 31                    |                                                        |
| Effect mode         | #4      | 21                    | See table below                                        |
| Speed × brightness  | #4      | 69 (and mirror at 71) | Two nibbles per byte: high nibble = speed, low = brightness (each 1..4) |

### Effect mode bytes (verified by diff across captures)

| Effect               | Byte value | OpenRGB capture file       |
| -------------------- | ---------- | -------------------------- |
| `fw-static`          | `0x01`     | Static-Red.pcapng          |
| `fw-rainbow`         | `0x03`     | Rainbow.pcapng             |
| `fw-snake`           | `0x0a`     | RetroSnake.pcapng          |
| `fw-sine-wave`       | `0x0d`     | SineWaveRGB.pcapng         |
| `fw-star-twinkle`    | `0x08`     | StarTwinkle.pcapng         |
| `fw-rainbow-blossom` | `0x11`     | RainbowBlossom.pcapng      |
| `fw-waterfall`       | `0x10`     | Waterfall.pcapng           |
| `fw-wheel`           | `0x06`     | Wheel.pcapng               |

## Encoding strategy used in `@fizz/core/protocol.ts`

Given the protocol's complexity (1024-byte blocks with currently-opaque body content), we use a **template + patch** approach:

1. Store the **byte-for-byte captured packet sequence** for each effect as a constant baseline (color set to `00 00 00`).
2. For effects that accept a color, patch bytes [29, 30, 31] of block #1 with the requested RGB.
3. For effects that accept speed/brightness, patch byte [69] of block #4 (and mirror at [71]) with the two nibbles.
4. Emit the full sequence: handshake → 4 data blocks. The final "commit" packet is included in the captured template where present.

This is less elegant than a fully parsed protocol description, but it's reliable, immediately shippable, and matches what the official Redragon software does. Future iterations can decode the meaning of more of the 1024-byte body once we run wireshark on the real device.

## Open questions

- Do per-key direct colors live somewhere inside the 1024-byte body of block #4? The ~960 bytes we currently treat as padding are suspicious — they may carry a 61-LED RGB array for Phase 3 work.
- The handshake `83 b6` and block #4 opcode `03 b6` share the magic word `b6 00` — likely a sync marker / version tag.
- The captures repeat the burst 2-3 times. May be retry-for-reliability, or a multi-step commit (e.g., write to staging buffer, then atomic swap). Live replay will tell.
- Brightness nibble mapping: confirm the nibble interpretation by capturing a wider sweep on real hardware.
