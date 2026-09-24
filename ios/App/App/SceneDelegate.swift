import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        let root = AppViewController()
        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = root
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)

        // Launched by tapping a tag while the app was closed.
        if let url = connectionOptions.userActivities.compactMap(Self.tagLink).first {
            DispatchQueue.main.async { root.open(url) }
        }
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)

        // Tapping a tag while the app is open or in the background.
        if let url = Self.tagLink(userActivity) {
            (window?.rootViewController as? AppViewController)?.open(url)
        }
    }

    /// The link a universal-link activity carries (a tag's URL), if that is what it is.
    private static func tagLink(_ activity: NSUserActivity) -> URL? {
        guard activity.activityType == NSUserActivityTypeBrowsingWeb else { return nil }
        return activity.webpageURL
    }
}
