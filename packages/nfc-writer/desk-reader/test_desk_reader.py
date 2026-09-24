"""Tests for the desk reader bridge against a simulated NTAG on a simulated reader.

    python3 -m unittest discover packages/nfc-writer/desk-reader

The fake answers the same storage-card APDUs an ACR122U does, and models the
datasheet's one-time-programmable pages: writes to the static lock bytes, the
CC and the dynamic lock bytes are OR'ed in, and page 2 bytes 0-1 ignore writes.
"""
import unittest

import desk_reader as dr

LAYOUT = {  # CC byte 2 -> (pages, dynamic lock page)
    0x12: (45, 0x28),
    0x3E: (135, 0x82),
    0x6D: (231, 0xE2),
}


class FakeTag:
    def __init__(self, cc2=0x12, uid=bytes.fromhex("04A1B2C3D4E5F6"), cc3=0x00, fail_write_page=None):
        pages, self.dyn = LAYOUT.get(cc2, (16, None))
        self.mem = bytearray(pages * 4)
        self.mem[0:3], self.mem[4:8] = uid[0:3], uid[3:7]
        self.mem[12:16] = bytes([0xE1, 0x10, cc2, cc3])
        self.mem[16:20] = bytes([0x03, 0x00, 0xFE, 0x00])
        self.uid = uid
        self.fail_write_page = fail_write_page
        self.writes = []

    def transmit(self, apdu):
        if apdu[:2] == b"\xFF\xCA":
            return self.uid, 0x90, 0x00
        if apdu[:2] == b"\xFF\xB0":
            page = apdu[3]
            start = page * 4
            if start >= len(self.mem):
                return b"", 0x63, 0x00
            chunk = bytes(self.mem[start:start + 16])
            return chunk + b"\x00" * (16 - len(chunk)), 0x90, 0x00
        if apdu[:2] == b"\xFF\xD6":
            page, data = apdu[3], apdu[5:9]
            if page == self.fail_write_page or page < 2 or page * 4 >= len(self.mem):
                return b"", 0x63, 0x00
            if self.mem[15] == 0x0F and 4 <= page and page != self.dyn:
                return b"", 0x63, 0x00          # a locked tag refuses data writes
            self.writes.append(page)
            at = page * 4
            if page == 2:
                self.mem[at + 2] |= data[2]
                self.mem[at + 3] |= data[3]
            elif page == 3 or page == self.dyn:
                for i in range(4):
                    self.mem[at + i] |= data[i]
            else:
                self.mem[at:at + 4] = data
            return b"", 0x90, 0x00
        return b"", 0x6A, 0x81


URL = "https://clearline-equipment-care.netlify.app/t/v1.t5MADX.lfr6cqcEXy6GWvVnsBKoUA.MyrF1g-bxqocccBG"


class WriteAndRead(unittest.TestCase):
    def test_writes_then_reads_back_the_same_url(self):
        tag = FakeTag()
        out = dr.do_write(tag, URL)
        self.assertEqual(out["uid"], "04A1B2C3D4E5F6")
        self.assertEqual(out["type"], "NTAG213")
        self.assertEqual(dr.do_read(tag)["url"], URL)

    def test_record_bytes_match_the_ndef_spec(self):
        tlv = dr.ndef_tlv("https://a.co/t/x")
        # NDEF TLV, 13-byte record: MB|ME|SR well-known, type "U", 9-byte
        # payload of 0x04 ("https://") + the rest, then the terminator.
        self.assertEqual(tlv, bytes([0x03, 0x0D, 0xD1, 0x01, 0x09, 0x55, 0x04]) + b"a.co/t/x\xFE")

    def test_reads_past_a_lock_control_tlv(self):
        # NTAG213 ships with 01 03 A0 0C 34 before the NDEF TLV.
        raw = bytes([0x01, 0x03, 0xA0, 0x0C, 0x34]) + dr.ndef_tlv(URL)
        self.assertEqual(dr.decode_url(raw), URL)

    def test_a_truncated_read_is_not_a_short_url(self):
        self.assertIsNone(dr.decode_url(dr.ndef_tlv(URL)[:20]))

    def test_blank_tag_reads_as_not_ours(self):
        out = dr.do_read(FakeTag())
        self.assertFalse(out["ok"])

    def test_refuses_a_locked_tag(self):
        with self.assertRaisesRegex(dr.TagError, "locked"):
            dr.do_write(FakeTag(cc3=0x0F), URL)

    def test_refuses_a_url_bigger_than_the_tag(self):
        with self.assertRaisesRegex(dr.TagError, "holds"):
            dr.do_write(FakeTag(cc2=0x06), URL)

    def test_a_refused_page_write_is_an_error_not_a_success(self):
        with self.assertRaises(dr.TagError):
            dr.do_write(FakeTag(fail_write_page=7), URL)


class Lock(unittest.TestCase):
    def locked_bytes(self, cc2, dyn_expected):
        tag = FakeTag(cc2=cc2)
        dr.do_write(tag, URL)
        out = dr.do_lock(tag)
        self.assertTrue(out["locked"], out)
        self.assertEqual(tag.mem[15], 0x0F)                     # CC read-only
        self.assertEqual(bytes(tag.mem[10:12]), b"\xFF\xFF")    # static lock
        at = tag.dyn * 4
        self.assertEqual(bytes(tag.mem[at:at + 3]), dyn_expected)
        # NFC Forum order: CC, then dynamic, then static last.
        self.assertEqual(tag.writes[-3:], [3, tag.dyn, 2])
        return tag

    def test_ntag213(self):
        self.locked_bytes(0x12, bytes([0xFF, 0x0F, 0x3F]))

    def test_ntag215(self):
        self.locked_bytes(0x3E, bytes([0xFF, 0x00, 0x0F]))

    def test_ntag216(self):
        self.locked_bytes(0x6D, bytes([0xFF, 0x3F, 0x7F]))

    def test_locked_tag_can_no_longer_be_written(self):
        tag = self.locked_bytes(0x12, bytes([0xFF, 0x0F, 0x3F]))
        with self.assertRaisesRegex(dr.TagError, "locked"):
            dr.do_write(tag, URL)
        self.assertEqual(dr.do_read(tag)["url"], URL)

    def test_never_locks_a_blank_tag(self):
        tag = FakeTag()
        out = dr.do_lock(tag)
        self.assertFalse(out["locked"])
        self.assertEqual(tag.writes, [])

    def test_unknown_chip_is_reported_unsupported_and_untouched(self):
        tag = FakeTag(cc2=0x06)
        tag.mem[16:16 + 20] = dr.ndef_tlv("https://a.co/t/x")[:20]
        out = dr.do_lock(tag)
        self.assertEqual((out["locked"], out.get("unsupported")), (False, True))
        self.assertEqual(tag.writes, [])


class Http(unittest.TestCase):
    """The origin and host checks, without a reader."""

    def handler(self, headers):
        h = dr.Handler.__new__(dr.Handler)
        h.headers = headers
        h.sent = []
        h._json = lambda obj, code=200: h.sent.append((code, obj))
        return h

    def test_foreign_origin_is_refused_before_the_reader_is_touched(self):
        h = self.handler({"Host": "127.0.0.1:8766", "Origin": "https://evil.example"})
        self.assertTrue(h._refuse_foreign())
        self.assertEqual(h.sent[0][0], 403)

    def test_rebinding_host_is_refused(self):
        h = self.handler({"Host": "evil.example:8766", "Origin": "https://clearline-equipment-care.netlify.app"})
        self.assertTrue(h._refuse_foreign())

    def test_the_app_and_curl_are_allowed(self):
        self.assertFalse(self.handler({"Host": "127.0.0.1:8766", "Origin": "https://clearline-equipment-care.netlify.app"})._refuse_foreign())
        self.assertFalse(self.handler({"Host": "localhost:8766"})._refuse_foreign())


if __name__ == "__main__":
    unittest.main()
