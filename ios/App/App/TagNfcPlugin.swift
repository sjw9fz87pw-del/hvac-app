import Foundation
import Capacitor
import CoreNFC

/**
 * Writes, reads and locks NFC tags on an iPhone, for the one thing Safari
 * cannot do. The web side is `src/lib/nfc/native-ios.ts`, which implements the
 * app's `TagWriter` on top of these four methods.
 *
 * One tap for the whole pairing. The flow is write, read back, verify on the
 * server, link, lock: three radio steps with network calls between them. Each
 * finished step keeps the reader sheet open for a few seconds with the tag
 * still connected, so the next step runs on the same tag without asking for a
 * second tap. If the phone has moved away by then, the sheet asks for the tag
 * again rather than failing.
 *
 * Everything runs on the main queue (the session's delegate queue too), so the
 * state below is never touched from two threads.
 */
@objc(TagNfcPlugin)
public class TagNfcPlugin: CAPPlugin, CAPBridgedPlugin, NFCNDEFReaderSessionDelegate {
    public let identifier = "TagNfcPlugin"
    public let jsName = "TagNfc"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "write", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "read", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "lock", returnType: CAPPluginReturnPromise),
    ]

    private enum Operation {
        case write(URL)
        case read
        case lock

        var prompt: String {
            switch self {
            case .write: return "Hold the top of the iPhone against the tag to write it."
            case .read: return "Hold the top of the iPhone against the tag."
            case .lock: return "Hold the iPhone against the tag to lock it."
            }
        }
    }

    private var session: NFCNDEFReaderSession?
    private var tag: NFCNDEFTag?
    private var pending: (operation: Operation, call: CAPPluginCall)?
    private var timeoutWork: DispatchWorkItem?
    private var lingerWork: DispatchWorkItem?
    /// Bumped per call, so a radio callback that outlives its call (after a
    /// timeout, say) cannot answer the next one.
    private var generation = 0

    /// How long the sheet stays open after a step, waiting for the next one.
    private let lingerAfterWrite: TimeInterval = 12
    private let lingerAfterRead: TimeInterval = 8

    // MARK: - Methods called from the web view

    @objc func isAvailable(_ call: CAPPluginCall) {
        call.resolve(["available": NFCNDEFReaderSession.readingAvailable])
    }

    @objc func write(_ call: CAPPluginCall) {
        guard let raw = call.getString("url"), let url = URL(string: raw), url.scheme == "https" else {
            call.reject("An https URL is required.", "INVALID_URL")
            return
        }
        start(.write(url), call)
    }

    @objc func read(_ call: CAPPluginCall) {
        start(.read, call)
    }

    @objc func lock(_ call: CAPPluginCall) {
        start(.lock, call)
    }

    // MARK: - Session handling

    private func start(_ operation: Operation, _ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard NFCNDEFReaderSession.readingAvailable else {
                call.reject("This iPhone cannot read NFC tags.", "UNAVAILABLE")
                return
            }
            guard self.pending == nil else {
                call.reject("Another tag operation is still running.", "BUSY")
                return
            }

            self.generation += 1
            self.pending = (operation, call)
            self.lingerWork?.cancel()
            self.lingerWork = nil
            self.scheduleTimeout(ms: call.getInt("timeoutMs") ?? 25_000)

            if let session = self.session, session.isReady {
                if let tag = self.tag, tag.isAvailable {
                    self.perform(operation, on: tag, in: session)
                } else {
                    session.alertMessage = operation.prompt
                    session.restartPolling()
                }
                return
            }

            let session = NFCNDEFReaderSession(delegate: self, queue: DispatchQueue.main, invalidateAfterFirstRead: false)
            session.alertMessage = operation.prompt
            self.session = session
            self.tag = nil
            session.begin()
        }
    }

    private func scheduleTimeout(ms: Int) {
        timeoutWork?.cancel()
        let work = DispatchWorkItem { [weak self] in
            self?.fail("TIMEOUT", "No tag detected. Hold the phone against the tag and try again.")
        }
        timeoutWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + .milliseconds(max(ms, 1_000)), execute: work)
    }

    private func perform(_ operation: Operation, on tag: NFCNDEFTag, in session: NFCNDEFReaderSession) {
        let generation = self.generation
        tag.queryNDEFStatus { [weak self] status, capacity, error in
            guard let self = self, self.isCurrent(generation) else { return }
            if let error = error {
                self.retry(session, "Could not read the tag (\(error.localizedDescription)). Try again.")
                return
            }

            switch operation {
            case .write(let url):
                guard status == .readWrite else {
                    self.fail(status == .readOnly ? "READ_ONLY" : "NOT_NDEF",
                              status == .readOnly
                                ? "This tag is locked and cannot be rewritten. Use a new tag."
                                : "This tag cannot hold a link. Use an NTAG213 tag.")
                    return
                }
                guard let payload = NFCNDEFPayload.wellKnownTypeURIPayload(url: url) else {
                    self.fail("INVALID_URL", "That link cannot be written to a tag.")
                    return
                }
                let message = NFCNDEFMessage(records: [payload])
                guard message.length <= capacity else {
                    self.fail("TOO_SMALL", "The link does not fit on this tag. Use an NTAG213 tag.")
                    return
                }
                tag.writeNDEF(message) { error in
                    guard self.isCurrent(generation) else { return }
                    if let error = error {
                        self.retry(session, "The write did not finish (\(error.localizedDescription)). Hold still and try again.")
                    } else {
                        self.succeed(["written": true], alert: "Written. Keep holding while it is checked.", linger: self.lingerAfterWrite)
                    }
                }

            case .read:
                guard status != .notSupported else {
                    self.fail("NOT_NDEF", "That tag is not one of ours.")
                    return
                }
                tag.readNDEF { message, error in
                    guard self.isCurrent(generation) else { return }
                    if let error = error {
                        self.retry(session, "Could not read the tag (\(error.localizedDescription)). Try again.")
                        return
                    }
                    guard let url = message.flatMap({ Self.firstUrl(in: $0) }) else {
                        self.fail("NO_URL", "That tag is not one of ours.")
                        return
                    }
                    self.succeed(["url": url], alert: "Tag read.", linger: self.lingerAfterRead)
                }

            case .lock:
                if status == .readOnly {
                    self.succeed(["locked": true], alert: "Tag is locked.", linger: nil)
                    return
                }
                guard status == .readWrite else {
                    self.fail("NOT_NDEF", "This tag cannot be locked.")
                    return
                }
                tag.writeLock { error in
                    guard self.isCurrent(generation) else { return }
                    if let error = error {
                        self.fail("LOCK_FAILED", "The tag could not be locked (\(error.localizedDescription)).")
                    } else {
                        self.succeed(["locked": true], alert: "Tag locked.", linger: nil)
                    }
                }
            }
        }
    }

    private func isCurrent(_ generation: Int) -> Bool {
        pending != nil && generation == self.generation
    }

    /// The first link on the tag, whether stored as a URI record or an absolute URL.
    private static func firstUrl(in message: NFCNDEFMessage) -> String? {
        for record in message.records {
            if let url = record.wellKnownTypeURIPayload() {
                return url.absoluteString
            }
            if record.typeNameFormat == .absoluteURI, let text = String(data: record.type, encoding: .utf8) {
                return text
            }
        }
        return nil
    }

    /// Resolve the waiting call, then either keep the sheet open for the next step or close it.
    private func succeed(_ data: [String: Any], alert: String, linger: TimeInterval?) {
        guard let call = pending?.call else { return }
        pending = nil
        timeoutWork?.cancel()
        timeoutWork = nil
        call.resolve(data)

        guard let session = session else { return }
        session.alertMessage = alert
        guard let linger = linger else {
            end(session)
            return
        }
        let work = DispatchWorkItem { [weak self] in
            guard let self = self, self.pending == nil, let session = self.session else { return }
            self.end(session)
        }
        lingerWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + linger, execute: work)
    }

    /// Reject the waiting call and close the sheet with the reason.
    private func fail(_ code: String, _ message: String) {
        let call = pending?.call
        pending = nil
        timeoutWork?.cancel()
        timeoutWork = nil
        lingerWork?.cancel()
        lingerWork = nil
        if let session = session {
            session.invalidate(errorMessage: message)
        }
        session = nil
        tag = nil
        call?.reject(message, code)
    }

    /// A transient radio error: say so on the sheet and wait for the tag again.
    /// The call's timeout still applies, so this cannot loop forever.
    private func retry(_ session: NFCNDEFReaderSession, _ message: String) {
        tag = nil
        session.alertMessage = message
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
            if self.session === session, session.isReady { session.restartPolling() }
        }
    }

    private func end(_ session: NFCNDEFReaderSession) {
        session.invalidate()
        if self.session === session {
            self.session = nil
            self.tag = nil
        }
    }

    // MARK: - NFCNDEFReaderSessionDelegate

    public func readerSession(_ session: NFCNDEFReaderSession, didDetectNDEFs messages: [NFCNDEFMessage]) {
        // Not called: implementing didDetect tags below replaces it. Required by the protocol.
    }

    public func readerSession(_ session: NFCNDEFReaderSession, didDetect tags: [NFCNDEFTag]) {
        guard session === self.session else { return }
        guard tags.count == 1, let detected = tags.first else {
            retry(session, "More than one tag is in range. Hold the phone to just one.")
            return
        }
        session.connect(to: detected) { [weak self] error in
            guard let self = self, session === self.session else { return }
            if let error = error {
                self.retry(session, "Lost the tag (\(error.localizedDescription)). Hold the phone still.")
                return
            }
            self.tag = detected
            // A tap during the pause between steps just keeps the tag ready.
            guard let operation = self.pending?.operation else { return }
            self.perform(operation, on: detected, in: session)
        }
    }

    public func readerSession(_ session: NFCNDEFReaderSession, didInvalidateWithError error: Error) {
        guard session === self.session || self.session == nil else { return }
        self.session = nil
        self.tag = nil
        lingerWork?.cancel()
        lingerWork = nil

        guard let call = pending?.call else { return }
        pending = nil
        timeoutWork?.cancel()
        timeoutWork = nil

        let code = (error as? NFCReaderError)?.code
        switch code {
        case .readerSessionInvalidationErrorUserCanceled:
            call.reject("Cancelled.", "CANCELLED")
        case .readerSessionInvalidationErrorSessionTimeout:
            call.reject("No tag detected. Hold the phone against the tag and try again.", "TIMEOUT")
        case .readerErrorUnsupportedFeature:
            call.reject("This iPhone cannot write NFC tags.", "UNAVAILABLE")
        default:
            call.reject(error.localizedDescription, "SESSION_ENDED")
        }
    }
}
