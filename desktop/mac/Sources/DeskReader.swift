import CryptoTokenKit
import Foundation

/// The USB NFC reader, through macOS's own smart-card stack (CryptoTokenKit).
///
/// A line-for-line port of `packages/nfc-writer/desk-reader/desk_reader.py`,
/// answering the same four operations with the same JSON, so the web app's
/// `desk-reader` TagWriter cannot tell which one it is talking to. Every call
/// blocks; the bridge runs them one at a time on a background queue.
///
/// Any PC/SC reader works with the driver macOS ships: ACR122U and clones,
/// ACR1252, ACR1552, SCL3711, Identiv uTrust.
struct TagError: Error { let message: String }

final class DeskReader {
    typealias JSON = [String: Any]

    // MARK: - Operations

    func status() -> JSON {
        guard let manager = TKSmartCardSlotManager.default else {
            return ["reader": NSNull(), "tag": NSNull(), "hint": "This app cannot reach smart-card readers."]
        }
        guard let name = manager.slotNames.first, let slot = manager.slotNamed(name) else {
            return ["reader": NSNull(), "tag": NSNull(), "hint": "No NFC reader is plugged in."]
        }
        guard slot.state == .validCard, let card = slot.makeSmartCard() else {
            return ["reader": name, "tag": NSNull(), "hint": "Put a tag on the reader."]
        }
        do {
            let info = try Session(card).run { try identify($0) }
            return ["reader": name, "tag": ["uid": info.uid, "type": info.type], "hint": NSNull()]
        } catch let e as TagError {
            return ["reader": name, "tag": NSNull(), "hint": e.message]
        } catch {
            return ["reader": name, "tag": NSNull(), "hint": "\(error)"]
        }
    }

    func write(url: String, waitMs: Int) -> JSON {
        guard url.hasPrefix("https://") || url.hasPrefix("http://") else {
            return ["ok": false, "error": "A tag URL must be http or https."]
        }
        return result { try self.withTag(waitMs: waitMs, uid: nil) { s in
            let info = try identify(s)
            guard info.ndef else { throw TagError(message: "This is not an NTAG sticker the app can use. Use an NTAG213 tag.") }
            guard info.writable else { throw TagError(message: "This tag is locked and cannot be rewritten. Use a blank tag.") }
            let data = try ndefTLV(url)
            guard data.count <= info.capacity else {
                throw TagError(message: "The tag holds \(info.capacity) bytes and this needs \(data.count).")
            }
            for n in stride(from: 0, to: data.count, by: 4) {
                try writePage(s, 4 + n / 4, Array(data[n..<n + 4]))
            }
            var got: [UInt8] = []
            while got.count < data.count { got += try readPages(s, 4 + got.count / 4) }
            guard Array(got.prefix(data.count)) == data else {
                throw TagError(message: "The tag was written but did not read back the same. Try another tag.")
            }
            return ["ok": true, "uid": info.uid, "type": info.type]
        } }
    }

    func read(waitMs: Int, uid: String?) -> JSON {
        result { try self.withTag(waitMs: waitMs, uid: uid) { s in
            let info = try identify(s)
            guard info.ndef, let url = try readURL(s, info) else {
                return ["ok": false, "uid": info.uid, "error": "This tag is blank or not one of ours."]
            }
            return ["ok": true, "uid": info.uid, "type": info.type, "url": url]
        } }
    }

    /// Permanently read-only, in the NFC Forum order: CC, dynamic, then static.
    /// Every one of these bits is one-time programmable. There is no undo.
    func lock(uid: String?) -> JSON {
        do {
            return try withTag(waitMs: 2_000, uid: uid) { s in
                let info = try identify(s)
                guard let chip = chips[info.cc[2]], info.ndef else {
                    return ["locked": false, "unsupported": true,
                            "reason": "Locking is only supported on NTAG213/215/216; this is a \(info.type)."]
                }
                guard try readURL(s, info) != nil else { return ["locked": false, "reason": "Refusing to lock a blank tag."] }
                try writePage(s, 3, [info.cc[0], info.cc[1], info.cc[2], 0x0F])
                try writePage(s, chip.dynPage, chip.dynBits)
                try writePage(s, 2, [0x00, 0x00, 0xFF, 0xFF])
                let after = try identify(s)
                if after.cc[3] == 0x0F && after.staticLock == [0xFF, 0xFF] { return ["locked": true, "uid": info.uid] }
                return ["locked": false, "reason": "The lock bits did not all set. The tag works but may still be rewritable."]
            }
        } catch let e as TagError {
            return ["locked": false, "reason": e.message]
        } catch {
            return ["locked": false, "reason": "\(error)"]
        }
    }

    // MARK: - Finding the tag

    private func result(_ body: () throws -> JSON) -> JSON {
        do { return try body() } catch let e as TagError {
            return ["ok": false, "error": e.message]
        } catch {
            return ["ok": false, "error": "Desk reader error: \(error)"]
        }
    }

    private func withTag(waitMs: Int, uid: String?, _ op: (Session) throws -> JSON) throws -> JSON {
        guard let manager = TKSmartCardSlotManager.default else { throw TagError(message: "This app cannot reach smart-card readers.") }
        let deadline = Date().addingTimeInterval(Double(min(max(waitMs, 0), 60_000)) / 1000)
        while true {
            guard let name = manager.slotNames.first, let slot = manager.slotNamed(name) else {
                throw TagError(message: "No NFC reader is plugged in.")
            }
            if slot.state == .validCard, let card = slot.makeSmartCard() {
                return try Session(card).run { s in
                    if let uid, !uid.isEmpty {
                        let seen = try getUID(s)
                        if !seen.isEmpty && seen != uid {
                            throw TagError(message: "A different tag is on the reader now. Put the one just written back.")
                        }
                    }
                    return try op(s)
                }
            }
            if Date() >= deadline { throw TagError(message: "No tag on the reader. Put a tag flat on it and try again.") }
            Thread.sleep(forTimeInterval: 0.25)
        }
    }

    // MARK: - NTAG21x over the PC/SC storage-card APDUs

    struct Info {
        let uid: String, type: String, capacity: Int, ndef: Bool, writable: Bool
        let cc: [UInt8], staticLock: [UInt8]
    }

    /// CC byte 2 -> chip, and its dynamic lock bytes with every lock bit set and
    /// RFUI bits 0. NXP NTAG213/215/216 datasheet rev 3.2, section 8.5.3.
    private let chips: [UInt8: (name: String, dynPage: Int, dynBits: [UInt8])] = [
        0x12: ("NTAG213", 0x28, [0xFF, 0x0F, 0x3F, 0x00]),
        0x3E: ("NTAG215", 0x82, [0xFF, 0x00, 0x0F, 0x00]),
        0x6D: ("NTAG216", 0xE2, [0xFF, 0x3F, 0x7F, 0x00]),
    ]

    private func readPages(_ s: Session, _ page: Int) throws -> [UInt8] {
        let (data, sw) = try s.transmit([0xFF, 0xB0, 0x00, UInt8(page), 16])
        guard sw == 0x9000 else { throw TagError(message: String(format: "Could not read the tag (page %d, SW %04X).", page, sw)) }
        return data
    }

    private func writePage(_ s: Session, _ page: Int, _ four: [UInt8]) throws {
        let (_, sw) = try s.transmit([0xFF, 0xD6, 0x00, UInt8(page), 4] + four)
        guard sw == 0x9000 else { throw TagError(message: String(format: "The tag refused the write (page %d, SW %04X).", page, sw)) }
    }

    private func getUID(_ s: Session) throws -> String {
        let (data, sw) = try s.transmit([0xFF, 0xCA, 0x00, 0x00, 0x00])
        return sw == 0x9000 ? hex(data) : ""
    }

    private func identify(_ s: Session) throws -> Info {
        let head = try readPages(s, 0)
        let cc = Array(head[12..<16])
        let uid = try getUID(s)
        return Info(
            uid: uid.isEmpty ? hex(Array(head[0..<3]) + Array(head[4..<8])) : uid,
            type: chips[cc[2]]?.name ?? "\(Int(cc[2]) * 8)-byte tag",
            capacity: Int(cc[2]) * 8,
            ndef: cc[0] == 0xE1,
            writable: cc[3] == 0x00,
            cc: cc,
            staticLock: Array(head[10..<12]))
    }

    private func readURL(_ s: Session, _ info: Info) throws -> String? {
        var raw: [UInt8] = []
        let limit = min(info.capacity > 0 ? info.capacity : 64, 256)
        var page = 4
        while raw.count < limit {
            raw += try readPages(s, page)
            page += 4
            if let url = decodeURL(raw) { return url }
        }
        return nil
    }

    // MARK: - NDEF: one URI record in a TLV, from page 4

    private let prefixes: [(UInt8, String)] = [
        (0x01, "http://www."), (0x02, "https://www."), (0x03, "http://"), (0x04, "https://"),
        (0x05, "tel:"), (0x06, "mailto:"),
    ]

    func ndefTLV(_ url: String) throws -> [UInt8] {
        var code: UInt8 = 0, prefix = ""
        for (c, p) in prefixes where url.hasPrefix(p) && p.count > prefix.count { (code, prefix) = (c, p) }
        let payload = [code] + Array(url.dropFirst(prefix.count).utf8)
        guard payload.count <= 255 else { throw TagError(message: "That URL is too long for a tag.") }
        let record: [UInt8] = [0xD1, 0x01, UInt8(payload.count), 0x55] + payload
        var tlv: [UInt8] = record.count < 0xFF
            ? [0x03, UInt8(record.count)]
            : [0x03, 0xFF, UInt8(record.count >> 8), UInt8(record.count & 0xFF)]
        tlv += record + [0xFE]
        while tlv.count % 4 != 0 { tlv.append(0) }
        return tlv
    }

    func decodeURL(_ raw: [UInt8]) -> String? {
        var i = 0
        while i < raw.count {
            let t = raw[i]
            if t == 0x00 { i += 1; continue }
            if t == 0xFE || i + 1 >= raw.count { return nil }
            var length = Int(raw[i + 1]); i += 2
            if length == 0xFF {
                guard i + 2 <= raw.count else { return nil }
                length = Int(raw[i]) << 8 | Int(raw[i + 1]); i += 2
            }
            guard i + length <= raw.count else { return nil }   // truncated; read more
            let body = Array(raw[i..<i + length])
            if t == 0x03 {
                guard body.count >= 4, body[0] & 0x07 == 0x01, body[0] & 0x10 != 0 else { return nil }
                let typeLen = Int(body[1]), payLen = Int(body[2])
                guard body.count >= 3 + typeLen + payLen, typeLen == 1, body[3] == 0x55, payLen > 0 else { return nil }
                let payload = Array(body[(3 + typeLen)..<(3 + typeLen + payLen)])
                let prefix = prefixes.first { $0.0 == payload[0] }?.1 ?? ""
                return prefix + String(decoding: payload.dropFirst(), as: UTF8.self)
            }
            i += length
        }
        return nil
    }

    private func hex(_ bytes: [UInt8]) -> String { bytes.map { String(format: "%02X", $0) }.joined() }
}

/// One exclusive session with the card on the reader, driven synchronously.
final class Session {
    private let card: TKSmartCard
    init(_ card: TKSmartCard) { self.card = card }

    func run<T>(_ body: (Session) throws -> T) throws -> T {
        let sem = DispatchSemaphore(value: 0)
        var began = false, failure: Error?
        card.beginSession { ok, error in began = ok; failure = error; sem.signal() }
        sem.wait()
        guard began else {
            throw TagError(message: "Could not talk to the tag\(failure.map { ": \($0.localizedDescription)" } ?? ""). Move it and try again.")
        }
        defer { card.endSession() }
        return try body(self)
    }

    /// Send an APDU; returns the data and the status word.
    func transmit(_ apdu: [UInt8]) throws -> ([UInt8], Int) {
        let sem = DispatchSemaphore(value: 0)
        var reply: Data?, failure: Error?
        card.transmit(Data(apdu)) { data, error in reply = data; failure = error; sem.signal() }
        if sem.wait(timeout: .now() + 5) == .timedOut { throw TagError(message: "The reader stopped answering.") }
        guard let r = reply, r.count >= 2 else {
            throw TagError(message: "The tag was moved off the reader\(failure.map { " (\($0.localizedDescription))" } ?? "").")
        }
        let bytes = [UInt8](r)
        return (Array(bytes.dropLast(2)), Int(bytes[bytes.count - 2]) << 8 | Int(bytes[bytes.count - 1]))
    }
}
