import UIKit
import Capacitor

/// The app's web view. Exists only to register the plugins that live in this
/// app rather than in an npm package.
class AppViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(TagNfcPlugin())
    }

    /// Open a tag link (https://<site>/t/...) inside the app, signed in, instead
    /// of in Safari. Links to any other host are ignored.
    func open(_ url: URL) {
        guard let webView = webView,
              let current = webView.url ?? bridge?.config.serverURL,
              url.host == current.host else { return }
        webView.load(URLRequest(url: url))
    }
}
