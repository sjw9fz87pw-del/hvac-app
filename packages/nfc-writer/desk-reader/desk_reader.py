#!/usr/bin/env python3
"""Desk reader bridge: lets the app pair tags through a USB NFC reader.

A web page cannot reach a USB device, so this small service owns the reader
and answers on http://127.0.0.1:8766. The app's `desk-reader` TagWriter
(`../src/desk-reader.ts`) is its only client, and the pairing flow drives it
exactly as it drives a phone: write, read back, verify, link, then lock.

    python3 desk_reader.py              # start the bridge
    python3 desk_reader.py --probe      # what is plugged in, and does it work?

Nothing to install. It talks to macOS's built-in PCSC.framework through
ctypes, so any PC/SC reader works the moment it is plugged in: ACR122U and its
clones, ACR1252, ACR1552, SCL3711, Identiv uTrust. No driver, no pip.

Endpoints (JSON)
    GET  /status                         reader present? tag on it?
    POST /write {url, waitMs}            write one URL record, read it back
    GET  /read?waitMs=&uid=              the URL on the tag
    POST /lock  {uid}                    make the tag permanently read-only

Only this computer can reach it (bound to 127.0.0.1), only the app's origins
may call it (anything else gets a 403 before the reader is touched), and the
Host header must be loopback so a rebinding DNS name cannot reach it either.
"""

from __future__ import annotations

import argparse
import ctypes
import json
import os
import sys
import threading
import time
from ctypes import byref, c_int32, c_uint32, create_string_buffer
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

PORT = 8766

DEFAULT_ORIGINS = {
    "https://clearline-equipment-care.netlify.app",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
}


# --------------------------------------------------------------------------
# PC/SC, via ctypes. On macOS a DWORD is 32 bits and handles are int32.
# --------------------------------------------------------------------------

PCSC_PATH = "/System/Library/Frameworks/PCSC.framework/PCSC"
SCARD_SCOPE_SYSTEM = 2
SCARD_SHARE_SHARED = 2
SCARD_PROTOCOL_ANY = 1 | 2
SCARD_LEAVE_CARD = 0

NO_CARD = {0x8010000C, 0x80100066, 0x80100069, 0x80100016}
ERRORS = {
    0x8010002E: "no reader available",
    0x8010000C: "no tag on the reader",
    0x80100069: "the tag was moved off the reader",
    0x8010000F: "the reader is in use by another program",
    0x80100017: "the reader is unavailable",
    0x80100066: "no tag on the reader",
    0x80100016: "could not talk to the tag",
    0x8010001D: "the PC/SC service is not running",
}


class PCSCError(RuntimeError):
    def __init__(self, rv: int, what: str):
        self.rv = rv & 0xFFFFFFFF
        super().__init__(f"{what}: {ERRORS.get(self.rv, f'PC/SC error 0x{self.rv:08X}')}")


class PCSC:
    def __init__(self):
        self.lib = ctypes.CDLL(PCSC_PATH)
        self.ctx = c_int32(0)

    def __enter__(self):
        rv = self.lib.SCardEstablishContext(SCARD_SCOPE_SYSTEM, None, None, byref(self.ctx))
        if rv:
            raise PCSCError(rv, "establish context")
        return self

    def __exit__(self, *_):
        self.lib.SCardReleaseContext(self.ctx)

    def readers(self) -> list[str]:
        n = c_uint32(0)
        if self.lib.SCardListReaders(self.ctx, None, None, byref(n)) or not n.value:
            return []
        buf = create_string_buffer(n.value)
        if self.lib.SCardListReaders(self.ctx, None, buf, byref(n)):
            return []
        return [r.decode(errors="replace") for r in buf.raw[: n.value].split(b"\0") if r]

    def connect(self, reader: str) -> "Card":
        return Card(self.lib, self.ctx, reader)


class Card:
    """Whatever is sitting on the reader."""

    def __init__(self, lib, ctx, reader: str):
        self.lib, self.ctx, self.reader = lib, ctx, reader
        self.handle = c_int32(0)
        self.protocol = c_uint32(0)

    def __enter__(self):
        rv = self.lib.SCardConnect(self.ctx, self.reader.encode(), SCARD_SHARE_SHARED,
                                   SCARD_PROTOCOL_ANY, byref(self.handle), byref(self.protocol))
        if rv:
            raise PCSCError(rv, "connect")
        return self

    def __exit__(self, *_):
        self.lib.SCardDisconnect(self.handle, SCARD_LEAVE_CARD)

    def transmit(self, apdu: bytes) -> tuple[bytes, int, int]:
        io = (c_uint32 * 2)(self.protocol.value, 8)
        out = create_string_buffer(512)
        out_len = c_uint32(512)
        rv = self.lib.SCardTransmit(self.handle, byref(io), apdu, len(apdu), None, out, byref(out_len))
        if rv:
            raise PCSCError(rv, "transmit")
        resp = out.raw[: out_len.value]
        return (resp[:-2], resp[-2], resp[-1]) if len(resp) >= 2 else (resp, 0, 0)


# --------------------------------------------------------------------------
# NTAG21x over the PC/SC storage-card APDUs every ACR122-family reader speaks:
# FF B0 reads 16 bytes from a page, FF D6 writes one 4-byte page.
# --------------------------------------------------------------------------

class TagError(RuntimeError):
    """Something the person can act on; the message is shown as-is."""


def read_pages(card, page: int) -> bytes:
    data, sw1, sw2 = card.transmit(bytes([0xFF, 0xB0, 0x00, page, 16]))
    if (sw1, sw2) != (0x90, 0x00):
        raise TagError(f"Could not read the tag (page {page}, SW {sw1:02X}{sw2:02X}).")
    return data


def write_page(card, page: int, four: bytes) -> None:
    _, sw1, sw2 = card.transmit(bytes([0xFF, 0xD6, 0x00, page, 4]) + four)
    if (sw1, sw2) != (0x90, 0x00):
        raise TagError(f"The tag refused the write (page {page}, SW {sw1:02X}{sw2:02X}).")


def get_uid(card) -> str:
    data, sw1, sw2 = card.transmit(bytes([0xFF, 0xCA, 0x00, 0x00, 0x00]))
    return data.hex().upper() if (sw1, sw2) == (0x90, 0x00) else ""


# CC byte 2 (data area in 8-byte units) -> chip, and where its dynamic lock
# bytes live with the value that sets every lock bit and leaves RFUI bits 0.
# From the NXP NTAG213/215/216 datasheet rev 3.2, section 8.5.3, figs 10-12.
CHIPS = {
    0x12: ("NTAG213", 144, 0x28, bytes([0xFF, 0x0F, 0x3F, 0x00])),
    0x3E: ("NTAG215", 496, 0x82, bytes([0xFF, 0x00, 0x0F, 0x00])),
    0x6D: ("NTAG216", 872, 0xE2, bytes([0xFF, 0x3F, 0x7F, 0x00])),
}


def identify(card) -> dict:
    head = read_pages(card, 0)               # pages 0-3: uid, static lock, CC
    cc = head[12:16]
    chip = CHIPS.get(cc[2])
    return {
        "uid": get_uid(card) or head[0:3].hex().upper() + head[4:8].hex().upper(),
        "type": chip[0] if chip else f"{cc[2] * 8}-byte tag",
        "capacity": cc[2] * 8,
        "ndef": cc[0] == 0xE1,
        "writable": cc[3] == 0x00,
        "cc": cc,
        "static_lock": head[10:12],
    }


# --------------------------------------------------------------------------
# NDEF: one URI record in a TLV, starting at page 4.
# --------------------------------------------------------------------------

URI_PREFIXES = [
    (0x01, "http://www."), (0x02, "https://www."), (0x03, "http://"), (0x04, "https://"),
    (0x05, "tel:"), (0x06, "mailto:"),
]


def ndef_tlv(url: str) -> bytes:
    code, prefix = 0x00, ""
    for c, p in URI_PREFIXES:
        if url.startswith(p) and len(p) > len(prefix):
            code, prefix = c, p
    payload = bytes([code]) + url[len(prefix):].encode("utf-8")
    if len(payload) > 255:
        raise TagError("That URL is too long for a tag.")
    record = bytes([0xD1, 0x01, len(payload)]) + b"U" + payload
    tlv = (bytes([0x03, len(record)]) if len(record) < 0xFF
           else bytes([0x03, 0xFF]) + len(record).to_bytes(2, "big")) + record + b"\xFE"
    return tlv + b"\x00" * (-len(tlv) % 4)


def decode_url(raw: bytes) -> str | None:
    """The URL in the first NDEF message, skipping NULL and control TLVs."""
    prefixes = dict(URI_PREFIXES)
    i = 0
    while i < len(raw):
        t = raw[i]
        if t == 0x00:
            i += 1
            continue
        if t == 0xFE or i + 1 >= len(raw):
            return None
        length, i = raw[i + 1], i + 2
        if length == 0xFF:
            length, i = int.from_bytes(raw[i:i + 2], "big"), i + 2
        body = raw[i:i + length]
        if len(body) < length:
            return None                      # truncated; the caller reads more
        if t == 0x03:
            if len(body) < 4 or body[0] & 0x07 != 0x01 or not body[0] & 0x10:
                return None                  # not a short well-known record
            type_len, pay_len = body[1], body[2]
            if body[3:3 + type_len] != b"U":
                return None
            payload = body[3 + type_len:3 + type_len + pay_len]
            return prefixes.get(payload[0], "") + payload[1:].decode("utf-8", "replace") if payload else None
        i += length
    return None


def read_url(card, info: dict) -> str | None:
    raw = b""
    limit = min(info["capacity"] or 64, 256)
    page = 4
    while len(raw) < limit:
        raw += read_pages(card, page)
        page += 4
        url = decode_url(raw)
        if url is not None:
            return url
    return None


# --------------------------------------------------------------------------
# Operations. Each takes an open card; the HTTP layer finds the card.
# --------------------------------------------------------------------------

def do_write(card, url: str) -> dict:
    info = identify(card)
    if not info["ndef"]:
        raise TagError("This is not an NTAG sticker the app can use. Use an NTAG213 tag.")
    if not info["writable"]:
        raise TagError("This tag is locked and cannot be rewritten. Use a blank tag.")
    data = ndef_tlv(url)
    if len(data) > info["capacity"]:
        raise TagError(f"The tag holds {info['capacity']} bytes and this needs {len(data)}.")
    for n in range(0, len(data), 4):
        write_page(card, 4 + n // 4, data[n:n + 4])
    got = b""
    while len(got) < len(data):
        got += read_pages(card, 4 + len(got) // 4)
    if got[:len(data)] != data:
        raise TagError("The tag was written but did not read back the same. Try another tag.")
    return {"ok": True, "uid": info["uid"], "type": info["type"]}


def do_read(card) -> dict:
    info = identify(card)
    url = read_url(card, info) if info["ndef"] else None
    if not url:
        return {"ok": False, "uid": info["uid"], "error": "This tag is blank or not one of ours."}
    return {"ok": True, "uid": info["uid"], "type": info["type"], "url": url}


def do_lock(card) -> dict:
    """Permanently read-only, in the NFC Forum order: CC, dynamic, then static.

    Every one of these bits is one-time programmable. There is no undo.
    """
    info = identify(card)
    chip = CHIPS.get(info["cc"][2])
    if not chip or not info["ndef"]:
        return {"locked": False, "unsupported": True,
                "reason": f"Locking is only supported on NTAG213/215/216; this is a {info['type']}."}
    if not read_url(card, info):
        return {"locked": False, "reason": "Refusing to lock a blank tag."}

    _, _, dyn_page, dyn_bits = chip
    cc = info["cc"]
    write_page(card, 3, bytes([cc[0], cc[1], cc[2], 0x0F]))
    write_page(card, dyn_page, dyn_bits)
    write_page(card, 2, bytes([0x00, 0x00, 0xFF, 0xFF]))

    after = identify(card)
    if after["cc"][3] == 0x0F and after["static_lock"] == b"\xFF\xFF":
        return {"locked": True, "uid": info["uid"]}
    return {"locked": False, "reason": "The lock bits did not all set. The tag works but may still be rewritable."}


# --------------------------------------------------------------------------
# Finding the tag, waiting for one, and making sure it is the right one.
# --------------------------------------------------------------------------

reader_lock = threading.Lock()               # one reader, one operation at a time


def with_tag(op, wait_ms: int = 0, uid: str | None = None) -> dict:
    deadline = time.monotonic() + max(0, min(wait_ms, 60_000)) / 1000
    with reader_lock, PCSC() as pcsc:
        while True:
            readers = pcsc.readers()
            if not readers:
                raise TagError("No NFC reader is plugged in.")
            try:
                with pcsc.connect(readers[0]) as card:
                    if uid and get_uid(card) not in ("", uid):
                        raise TagError("A different tag is on the reader now. Put the one just written back.")
                    return op(card)
            except PCSCError as e:
                if e.rv not in NO_CARD:
                    raise TagError(str(e)) from e
                if time.monotonic() >= deadline:
                    raise TagError("No tag on the reader. Put a tag flat on it and try again.") from e
                time.sleep(0.25)


def status() -> dict:
    try:
        with reader_lock, PCSC() as pcsc:
            readers = pcsc.readers()
            if not readers:
                return {"reader": None, "tag": None, "hint": "No NFC reader is plugged in."}
            try:
                with pcsc.connect(readers[0]) as card:
                    info = identify(card)
                    return {"reader": readers[0], "tag": {"uid": info["uid"], "type": info["type"]}, "hint": None}
            except (PCSCError, TagError) as e:
                blank = isinstance(e, PCSCError) and e.rv in NO_CARD
                return {"reader": readers[0], "tag": None,
                        "hint": "Put a tag on the reader." if blank else str(e)}
    except Exception as e:                   # never throw from a status check
        return {"reader": None, "tag": None, "hint": str(e)}


# --------------------------------------------------------------------------
# HTTP
# --------------------------------------------------------------------------

class Handler(BaseHTTPRequestHandler):
    origins: set[str] = DEFAULT_ORIGINS
    port: int = PORT

    def _refuse_foreign(self) -> bool:
        host = (self.headers.get("Host") or "").lower()
        if host not in (f"127.0.0.1:{self.port}", f"localhost:{self.port}"):
            self._json({"error": "Wrong host."}, 403)
            return True
        origin = self.headers.get("Origin")
        if origin and origin not in self.origins:
            self._json({"error": "This site may not use the desk reader."}, 403)
            return True
        return False

    def _headers(self):
        origin = self.headers.get("Origin")
        if origin in self.origins:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            # Chrome's Private Network Access preflight, for the hosted app.
            if self.headers.get("Access-Control-Request-Private-Network"):
                self.send_header("Access-Control-Allow-Private-Network", "true")

    def _json(self, obj, code=200):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self._headers()
        self.end_headers()
        self.wfile.write(body)

    def _body(self) -> dict:
        n = int(self.headers.get("Content-Length") or 0)
        try:
            return json.loads(self.rfile.read(n) or b"{}")
        except ValueError:
            return {}

    def do_OPTIONS(self):
        if self._refuse_foreign():
            return
        self.send_response(204)
        self._headers()
        self.end_headers()

    def do_GET(self):
        if self._refuse_foreign():
            return
        u = urlparse(self.path)
        q = {k: v[0] for k, v in parse_qs(u.query).items()}
        if u.path == "/status":
            self._json(status())
        elif u.path == "/read":
            self._run(lambda: with_tag(do_read, int(q.get("waitMs") or 0), q.get("uid")))
        else:
            self._json({"error": "not found"}, 404)

    def do_POST(self):
        if self._refuse_foreign():
            return
        path, body = urlparse(self.path).path, self._body()
        if path == "/write":
            url = str(body.get("url") or "").strip()
            if not url.startswith(("https://", "http://")):
                self._json({"ok": False, "error": "A tag URL must be http or https."})
                return
            self._run(lambda: with_tag(lambda card: do_write(card, url), int(body.get("waitMs") or 0)))
        elif path == "/lock":
            try:
                self._json(with_tag(do_lock, 2_000, body.get("uid") or None))
            except Exception as e:
                self._json({"locked": False, "reason": str(e)})
        else:
            self._json({"error": "not found"}, 404)

    def _run(self, fn):
        try:
            self._json(fn())
        except TagError as e:
            self._json({"ok": False, "error": str(e)})
        except Exception as e:
            self._json({"ok": False, "error": f"Desk reader error: {e}"})

    def log_message(self, fmt, *args):
        sys.stderr.write(f"[desk-reader] {self.command} {self.path.split('?')[0]} {args[1] if len(args) > 1 else ''}\n")


def probe() -> int:
    st = status()
    print("\nDesk reader probe\n")
    if not st["reader"]:
        print(f"  ✗ {st['hint']}")
        return 1
    print(f"  ✓ Reader: {st['reader']}")
    if not st["tag"]:
        print(f"  · {st['hint']}")
        return 0
    print(f"  ✓ Tag:    {st['tag']['type']}  uid={st['tag']['uid']}")
    try:
        r = with_tag(do_read)
        print(f"  · Holds:  {r.get('url') or '(blank)'}")
    except TagError as e:
        print(f"  ✗ {e}")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--probe", action="store_true", help="report what is plugged in and exit")
    ap.add_argument("--port", type=int, default=PORT)
    ap.add_argument("--origin", action="append", default=[],
                    help="another app origin allowed to use the reader (repeatable)")
    args = ap.parse_args()
    if args.probe:
        return probe()

    extra = [o.strip() for o in os.environ.get("DESK_READER_ORIGINS", "").split(",") if o.strip()]
    Handler.origins = DEFAULT_ORIGINS | set(args.origin) | set(extra)
    Handler.port = args.port
    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print(f"[desk-reader] listening on http://127.0.0.1:{args.port} for {', '.join(sorted(Handler.origins))}")
    print(f"[desk-reader] {status()}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
