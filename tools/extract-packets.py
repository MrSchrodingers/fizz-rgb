#!/usr/bin/env python3
"""
Extract USB HID SET_REPORT data from a USBPcap .pcapng capture.

USBPcap (DLT=249) is Windows-only and used by the captures in OpenRGB issue
#2172. Each USB control transfer appears as 2-3 separate packets in the
capture: SETUP stage (carries the 8-byte setup packet), DATA stage (carries
the actual report payload), and optionally STATUS stage.

This tool finds SETUP packets with bRequest=0x09 (SET_REPORT) and pairs them
with the subsequent DATA packet from the same URB (matched by irpId).

Usage:
    ./tools/extract-packets.py docs/reverse-engineering/captures/Rainbow.pcapng > out.json
"""
import json
import struct
import sys
from pathlib import Path
from pcapng import FileScanner
from pcapng.blocks import EnhancedPacket, SimplePacket


# USBPCAP_BUFFER_PACKET_HEADER layout:
# offset | size | field
# 0      | 2    | headerLen (UINT16 LE) — total header length, including stage for CTRL
# 2      | 8    | irpId
# 10     | 4    | status
# 14     | 2    | function
# 16     | 1    | info
# 17     | 2    | bus
# 19     | 2    | device
# 21     | 1    | endpoint
# 22     | 1    | transfer (0=ISO, 1=INT, 2=CTRL, 3=BULK)
# 23     | 4    | dataLength
# 27     | 1    | stage (only present for CTRL: 0=SETUP, 1=DATA, 2=STATUS, 3=COMPLETE)


def parse_usbpcap(data: bytes):
    if len(data) < 27:
        return None
    header_len = struct.unpack("<H", data[0:2])[0]
    if len(data) < header_len:
        return None
    irp_id = struct.unpack("<Q", data[2:10])[0]
    transfer = data[22]
    data_length = struct.unpack("<I", data[23:27])[0]
    stage = data[27] if header_len >= 28 else None
    payload = data[header_len:header_len + data_length]
    return {
        "header_len": header_len,
        "irp_id": irp_id,
        "transfer": transfer,
        "data_length": data_length,
        "stage": stage,
        "endpoint": data[21],
        "payload": payload,
    }


def main(path: str):
    out = []
    frame_no = 0
    # Track open SET_REPORT transactions keyed by irp_id
    pending = {}  # irp_id -> {setup, frame}
    with open(path, "rb") as f:
        for block in FileScanner(f):
            if not isinstance(block, (EnhancedPacket, SimplePacket)):
                continue
            frame_no += 1
            usb = parse_usbpcap(block.packet_data)
            if usb is None or usb["transfer"] != 2:
                continue

            if usb["stage"] == 0:  # SETUP — 8 bytes
                if len(usb["payload"]) < 8:
                    continue
                setup = usb["payload"][:8]
                bm_request_type = setup[0]
                b_request = setup[1]
                if b_request != 0x09:  # only SET_REPORT
                    continue
                w_value = struct.unpack("<H", setup[2:4])[0]
                w_index = struct.unpack("<H", setup[4:6])[0]
                w_length = struct.unpack("<H", setup[6:8])[0]
                pending[usb["irp_id"]] = {
                    "frame": frame_no,
                    "bmRequestType": f"0x{bm_request_type:02x}",
                    "bRequest": f"0x{b_request:02x}",
                    "wValue": f"0x{w_value:04x}",
                    "wIndex": f"0x{w_index:04x}",
                    "wLength": w_length,
                }
                # Some captures put the report data in the same SETUP stage payload
                # right after the 8-byte setup. Check for that.
                if len(usb["payload"]) > 8:
                    data_bytes = list(usb["payload"][8:])
                    entry = pending.pop(usb["irp_id"])
                    entry["data"] = bytes(data_bytes).hex()
                    entry["dataBytes"] = data_bytes
                    out.append(entry)

            elif usb["stage"] == 1:  # DATA stage
                if usb["irp_id"] in pending:
                    entry = pending.pop(usb["irp_id"])
                    data_bytes = list(usb["payload"])
                    entry["data"] = bytes(data_bytes).hex()
                    entry["dataBytes"] = data_bytes
                    out.append(entry)

    print(json.dumps(out, indent=2))


if __name__ == "__main__":
    if len(sys.argv) != 2 or not Path(sys.argv[1]).exists():
        print("Usage: extract-packets.py <capture.pcapng>", file=sys.stderr)
        sys.exit(2)
    main(sys.argv[1])
