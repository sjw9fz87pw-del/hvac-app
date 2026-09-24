import AppKit
import WebKit

/// Clearline for the office Mac: the live site in its own window, with the USB
/// NFC reader built in. No browser, nothing else to run.
///
/// Every screen is the site itself, so deploying the site updates the app.
/// The one thing the app adds is `window.webkit.messageHandlers.deskReader`,
/// which the site's `desk-reader` TagWriter uses when it finds it.

let defaultURL = URL(string: "https://clearline-equipment-care.netlify.app/admin/nfc")!

/// Where the app opens. Override for a preview or a local build with
/// `defaults write com.clearline.desk AppURL http://localhost:3000/admin/nfc`.
func appURL() -> URL {
    if let s = ProcessInfo.processInfo.environment["CLEARLINE_URL"] ?? UserDefaults.standard.string(forKey: "AppURL"),
       let u = URL(string: s) { return u }
    return defaultURL
}

/// Answers the page's reader requests, one at a time, off the main thread.
final class ReaderBridge: NSObject, WKScriptMessageHandlerWithReply {
    private let reader = DeskReader()
    private let queue = DispatchQueue(label: "clearline.desk-reader")
    /// Status checks never wait behind a write that is waiting for a tag.
    private let statusQueue = DispatchQueue(label: "clearline.desk-reader.status")
    private let allowedHost: String

    init(allowedHost: String) { self.allowedHost = allowedHost }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage,
                               replyHandler: @escaping (Any?, String?) -> Void) {
        // Only the app's own site may drive the reader, not a page it links to.
        let origin = message.frameInfo.securityOrigin.host
        guard origin == allowedHost || origin == "localhost" || origin == "127.0.0.1" else {
            replyHandler(nil, "This site may not use the reader."); return
        }
        guard let body = message.body as? [String: Any], let op = body["op"] as? String else {
            replyHandler(nil, "Bad request"); return
        }
        let wait = (body["waitMs"] as? NSNumber)?.intValue ?? 0
        let uid = body["uid"] as? String
        (op == "status" ? statusQueue : queue).async { [reader] in
            let result: [String: Any]
            switch op {
            case "status": result = reader.status()
            case "write": result = reader.write(url: body["url"] as? String ?? "", waitMs: wait)
            case "read": result = reader.read(waitMs: wait, uid: uid)
            case "lock": result = reader.lock(uid: uid)
            default: result = ["ok": false, "error": "Unknown operation \(op)"]
            }
            DispatchQueue.main.async { replyHandler(result, nil) }
        }
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate {
    var window: NSWindow!
    var web: WKWebView?
    let home = appURL()
    /// A page asked for through clearline:// before the window existed.
    var pending: URL?

    func applicationDidFinishLaunching(_ note: Notification) {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()          // stay signed in between launches
        config.userContentController.addScriptMessageHandler(
            ReaderBridge(allowedHost: home.host ?? ""), contentWorld: .page, name: "deskReader")
        config.applicationNameForUserAgent = "ClearlineDesk/1.0"

        let web = WKWebView(frame: .zero, configuration: config)
        self.web = web
        web.navigationDelegate = self
        web.uiDelegate = self
        web.allowsBackForwardNavigationGestures = true

        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1280, height: 860),
                          styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        window.title = "Clearline"
        window.contentView = web
        window.setFrameAutosaveName("ClearlineMain")
        if window.frame.origin == .zero { window.center() }
        window.makeKeyAndOrderFront(nil)

        buildMenu()
        web.load(URLRequest(url: pending ?? home))
        pending = nil
        NSApp.activate(ignoringOtherApps: true)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ app: NSApplication) -> Bool { true }

    /// clearline://open?path=/admin/nfc — only ever a page of the app's own site.
    func application(_ application: NSApplication, open urls: [URL]) {
        guard let url = urls.first(where: { $0.scheme == "clearline" }) else { return }
        let path = URLComponents(url: url, resolvingAgainstBaseURL: false)?
            .queryItems?.first(where: { $0.name == "path" })?.value ?? home.path
        var target = home
        if path.hasPrefix("/"), !path.hasPrefix("//"),
           let resolved = URL(string: path, relativeTo: home)?.absoluteURL, resolved.host == home.host {
            target = resolved
        }
        if let web {
            web.load(URLRequest(url: target))
            window.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps: true)
        } else {
            pending = target
        }
    }

    // Links to the site stay in the app; anything else opens in the default browser.
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url, action.navigationType == .linkActivated,
              url.host != nil, url.host != home.host, url.scheme?.hasPrefix("http") == true else {
            decisionHandler(.allow); return
        }
        NSWorkspace.shared.open(url)
        decisionHandler(.cancel)
    }

    // target=_blank and window.open
    func webView(_ webView: WKWebView, createWebViewWith config: WKWebViewConfiguration,
                 for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = action.request.url {
            if url.host == home.host { webView.load(action.request) } else { NSWorkspace.shared.open(url) }
        }
        return nil
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let alert = NSAlert(); alert.messageText = message
        alert.beginSheetModal(for: window) { _ in completionHandler() }
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let alert = NSAlert(); alert.messageText = message
        alert.addButton(withTitle: "OK"); alert.addButton(withTitle: "Cancel")
        alert.beginSheetModal(for: window) { completionHandler($0 == .alertFirstButtonReturn) }
    }

    // <input type="file">, for unit photos.
    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = parameters.allowsMultipleSelection
        panel.canChooseDirectories = false
        panel.beginSheetModal(for: window) { completionHandler($0 == .OK ? panel.urls : nil) }
    }

    @objc func goHome() { web?.load(URLRequest(url: home)) }
    @objc func reload() { web?.reload() }
    @objc func back() { web?.goBack() }
    @objc func forward() { web?.goForward() }

    private func buildMenu() {
        let main = NSMenu()
        func submenu(_ title: String, _ items: [NSMenuItem]) {
            let item = NSMenuItem(); let menu = NSMenu(title: title)
            items.forEach(menu.addItem); item.submenu = menu; main.addItem(item)
        }
        func item(_ title: String, _ action: Selector, _ key: String, target: AnyObject? = nil) -> NSMenuItem {
            let i = NSMenuItem(title: title, action: action, keyEquivalent: key); i.target = target; return i
        }
        submenu("Clearline", [
            item("Hide Clearline", #selector(NSApplication.hide(_:)), "h"),
            .separator(),
            item("Quit Clearline", #selector(NSApplication.terminate(_:)), "q"),
        ])
        // Without an Edit menu, Cmd-C / Cmd-V do nothing in a web view.
        submenu("Edit", [
            item("Undo", Selector(("undo:")), "z"),
            item("Redo", Selector(("redo:")), "Z"),
            .separator(),
            item("Cut", #selector(NSText.cut(_:)), "x"),
            item("Copy", #selector(NSText.copy(_:)), "c"),
            item("Paste", #selector(NSText.paste(_:)), "v"),
            item("Select All", #selector(NSText.selectAll(_:)), "a"),
        ])
        submenu("View", [
            item("Reload", #selector(reload), "r", target: self),
            item("Back", #selector(back), "[", target: self),
            item("Forward", #selector(forward), "]", target: self),
            item("NFC", #selector(goHome), "h", target: self).withModifiers([.command, .shift]),
        ])
        submenu("Window", [
            item("Minimize", #selector(NSWindow.performMiniaturize(_:)), "m"),
            item("Close", #selector(NSWindow.performClose(_:)), "w"),
        ])
        NSApp.mainMenu = main
    }
}

extension NSMenuItem {
    func withModifiers(_ mask: NSEvent.ModifierFlags) -> NSMenuItem { keyEquivalentModifierMask = mask; return self }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
