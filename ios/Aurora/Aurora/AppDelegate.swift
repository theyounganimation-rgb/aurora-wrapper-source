import Foundation
import UIKit
import SwiftUI
import Capacitor
import UserNotifications

let auroraProactiveNotificationResponseName = Notification.Name("AuroraProactiveNotificationResponse")
let auroraPendingProactiveNotificationMessageIdStorageKey = "CapacitorStorage.aurora.pendingProactiveNotificationMessageId"

private let auroraProactiveNotificationIdentifier = "aurora.proactive.current"
private let auroraLastNotifiedProactiveMessageIdStorageKey =
    "CapacitorStorage.aurora.lastNotifiedProactiveNotificationMessageId"
private let auroraNotificationSessionId = "agent:main:main"
private let auroraNotificationSessionKey = "agent:aurora-mobile:owner:continuity"
private let auroraProactiveContactJobId = "1101ef6b-aab8-4822-ab4a-09472868754d"

func pendingAuroraProactiveNotificationMessageId() -> String? {
    let rawValue = UserDefaults.standard.string(forKey: auroraPendingProactiveNotificationMessageIdStorageKey) ?? ""
    let trimmedValue = rawValue.trimmingCharacters(in: .whitespacesAndNewlines)
    return trimmedValue.isEmpty ? nil : trimmedValue
}

@discardableResult
func consumePendingAuroraProactiveNotificationMessageId() -> String? {
    let pendingMessageId = pendingAuroraProactiveNotificationMessageId()
    if pendingMessageId != nil {
        UserDefaults.standard.removeObject(forKey: auroraPendingProactiveNotificationMessageIdStorageKey)
    }
    return pendingMessageId
}

func clearAuroraProactiveBridgeNotifications() {
    let center = UNUserNotificationCenter.current()
    center.removePendingNotificationRequests(withIdentifiers: [auroraProactiveNotificationIdentifier])
    center.removeDeliveredNotifications(withIdentifiers: [auroraProactiveNotificationIdentifier])
}

private func storePendingAuroraProactiveNotificationMessageId(_ messageId: String) {
    let trimmedMessageId = messageId.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmedMessageId.isEmpty else {
        return
    }

    UserDefaults.standard.set(trimmedMessageId, forKey: auroraPendingProactiveNotificationMessageIdStorageKey)
}

private struct AuroraNotificationCompanionConfig: Decodable {
    let apiBaseURL: String?

    private enum CodingKeys: String, CodingKey {
        case apiBaseURL = "apiBaseUrl"
    }
}

private struct AuroraNotificationHistoryPayload: Decodable {
    let messages: [AuroraNotificationHistoryMessage]?
}

private struct AuroraNotificationHistoryMessage: Decodable {
    let id: String?
    let role: String?
    let text: String?
    let createdAt: String?
    let jobId: String?
}

private func requestAuroraProactiveNotificationAuthorizationIfNeeded() {
    UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { _, _ in }
}

private func loadAuroraNotificationAPIBaseURL() -> URL? {
    let candidates: [URL?] = [
        Bundle.main.url(forResource: "native-companion-config", withExtension: "json"),
        Bundle.main.url(forResource: "native-companion-config", withExtension: "json", subdirectory: "public")
    ]

    for candidate in candidates {
        guard let candidate,
              let data = try? Data(contentsOf: candidate),
              let config = try? JSONDecoder().decode(AuroraNotificationCompanionConfig.self, from: data),
              let rawBaseURL = config.apiBaseURL,
              let normalized = normalizeAuroraNotificationAPIBaseURL(from: rawBaseURL) else {
            continue
        }

        return normalized
    }

    return nil
}

private func normalizeAuroraNotificationAPIBaseURL(from rawValue: String) -> URL? {
    let trimmed = rawValue.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty,
          var components = URLComponents(string: trimmed),
          let scheme = components.scheme,
          let host = components.host else {
        return nil
    }

    components.scheme = scheme.lowercased()
    components.host = host.lowercased()
    components.path = ""
    components.query = nil
    components.fragment = nil
    return components.url
}

private func latestPendingAuroraProactiveMessage(
    in messages: [AuroraNotificationHistoryMessage]
) -> AuroraNotificationHistoryMessage? {
    let normalized = messages.enumerated().compactMap { index, message -> (index: Int, message: AuroraNotificationHistoryMessage)? in
        let role = message.role?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let text = message.text?.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let role, let text, !text.isEmpty else {
            return nil
        }

        if role == "assistant" || role == "aurora" || role == "user" {
            return (index, message)
        }

        return nil
    }

    for candidate in normalized.reversed() {
        let role = candidate.message.role?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let jobId = candidate.message.jobId?.trimmingCharacters(in: .whitespacesAndNewlines)
        guard role == "aurora", jobId == auroraProactiveContactJobId else {
            continue
        }

        let hasUserReplyAfter =
            candidate.index + 1 < normalized.count &&
            normalized[(candidate.index + 1)...].contains {
                $0.message.role?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == "user"
            }

        if !hasUserReplyAfter {
            return candidate.message
        }
    }

    return nil
}

private func scheduleAuroraProactiveNotificationIfNeeded(
    for message: AuroraNotificationHistoryMessage,
    completion: @escaping (Bool) -> Void
) {
    let messageId = message.id?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    let body = message.text?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    guard !messageId.isEmpty, !body.isEmpty else {
        completion(false)
        return
    }

    let defaults = UserDefaults.standard
    if defaults.string(forKey: auroraLastNotifiedProactiveMessageIdStorageKey) == messageId {
        completion(false)
        return
    }

    clearAuroraProactiveBridgeNotifications()

    let content = UNMutableNotificationContent()
    content.title = "Aurora"
    content.body = body
    content.sound = .default
    content.userInfo = [
        "messageId": messageId,
        "createdAt": message.createdAt ?? ""
    ]

    let request = UNNotificationRequest(
        identifier: auroraProactiveNotificationIdentifier,
        content: content,
        trigger: UNTimeIntervalNotificationTrigger(timeInterval: 1, repeats: false)
    )

    UNUserNotificationCenter.current().add(request) { error in
        guard error == nil else {
            completion(false)
            return
        }

        defaults.set(messageId, forKey: auroraLastNotifiedProactiveMessageIdStorageKey)
        completion(true)
    }
}

private func performAuroraProactiveBackgroundFetch(completion: @escaping (UIBackgroundFetchResult) -> Void) {
    guard let baseURL = loadAuroraNotificationAPIBaseURL() else {
        completion(.failed)
        return
    }

    var components = URLComponents(
        url: baseURL
            .appendingPathComponent("api")
            .appendingPathComponent("openclaw")
            .appendingPathComponent("history"),
        resolvingAgainstBaseURL: false
    )
    components?.queryItems = [
        URLQueryItem(name: "sessionId", value: auroraNotificationSessionId),
        URLQueryItem(name: "sessionKey", value: auroraNotificationSessionKey)
    ]

    guard let url = components?.url else {
        completion(.failed)
        return
    }

    let configuration = URLSessionConfiguration.ephemeral
    configuration.requestCachePolicy = .reloadIgnoringLocalAndRemoteCacheData
    configuration.timeoutIntervalForRequest = 25
    configuration.timeoutIntervalForResource = 25

    var request = URLRequest(url: url)
    request.cachePolicy = .reloadIgnoringLocalAndRemoteCacheData
    request.timeoutInterval = 25

    let session = URLSession(configuration: configuration)
    session.dataTask(with: request) { data, response, error in
        guard error == nil,
              let data,
              let httpResponse = response as? HTTPURLResponse,
              (200 ..< 300).contains(httpResponse.statusCode),
              let payload = try? JSONDecoder().decode(AuroraNotificationHistoryPayload.self, from: data) else {
            completion(.failed)
            return
        }

        guard let pendingMessage = latestPendingAuroraProactiveMessage(in: payload.messages ?? []) else {
            clearAuroraProactiveBridgeNotifications()
            completion(.noData)
            return
        }

        scheduleAuroraProactiveNotificationIfNeeded(for: pendingMessage) { scheduled in
            completion(scheduled ? .newData : .noData)
        }
    }.resume()
}

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate, UNUserNotificationCenterDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        requestAuroraProactiveNotificationAuthorizationIfNeeded()
        application.setMinimumBackgroundFetchInterval(UIApplication.backgroundFetchIntervalMinimum)
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func application(
        _ application: UIApplication,
        performFetchWithCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void
    ) {
        performAuroraProactiveBackgroundFetch(completion: completionHandler)
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        if notification.request.identifier == auroraProactiveNotificationIdentifier {
            completionHandler([.banner, .sound])
            return
        }

        completionHandler([])
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        guard response.notification.request.identifier == auroraProactiveNotificationIdentifier else {
            completionHandler()
            return
        }

        let messageId = String(response.notification.request.content.userInfo["messageId"] as? String ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        if !messageId.isEmpty {
            storePendingAuroraProactiveNotificationMessageId(messageId)
            NotificationCenter.default.post(
                name: auroraProactiveNotificationResponseName,
                object: nil,
                userInfo: ["messageId": messageId]
            )
        }

        clearAuroraProactiveBridgeNotifications()
        completionHandler()
    }

}

final class AuroraBridgeViewController: UIViewController {
    private var hostingController: UIHostingController<NativeCompanionRootView>?

    override func viewDidLoad() {
        super.viewDidLoad()

        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleUserDefaultsDidChange),
            name: UserDefaults.didChangeNotification,
            object: nil
        )
        applyAppearanceTheme()

        let hostingController = UIHostingController(rootView: NativeCompanionRootView())
        hostingController.view.translatesAutoresizingMaskIntoConstraints = false
        hostingController.view.backgroundColor = .clear

        addChild(hostingController)
        view.addSubview(hostingController.view)

        NSLayoutConstraint.activate([
            hostingController.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            hostingController.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            hostingController.view.topAnchor.constraint(equalTo: view.topAnchor),
            hostingController.view.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])

        hostingController.didMove(toParent: self)
        self.hostingController = hostingController
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    override var preferredStatusBarStyle: UIStatusBarStyle {
        overrideUserInterfaceStyle == .dark ? .lightContent : .darkContent
    }

    @objc private func handleUserDefaultsDidChange() {
        applyAppearanceTheme()
        setNeedsStatusBarAppearanceUpdate()
    }

    private func applyAppearanceTheme() {
        let storedValue = UserDefaults.standard.string(forKey: auroraAppearanceThemeStorageKey) ?? ""
        let theme = CompanionAppearanceTheme(rawValue: storedValue) ?? .light
        overrideUserInterfaceStyle = theme == .dark ? .dark : .light
    }
}
