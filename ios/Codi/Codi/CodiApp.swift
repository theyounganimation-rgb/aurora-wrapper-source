import Foundation
import Observation
import SwiftUI

@main
struct CodiApp: App {
    @State private var store = CodiStore()

    var body: some Scene {
        WindowGroup {
            CodiRootView(store: store)
        }
    }
}

@MainActor
@Observable
final class CodiStore {
    static let serverURLStorageKey = "codi.serverURL"
    static let defaultServerURLString = "http://cades-mac-mini.tail1afb62.ts.net:3000/codi"

    var serverURLString: String
    var pageTitle = "Codi"
    var currentURL: URL?
    var isLoading = true
    var isRefreshing = false
    var errorMessage = ""
    var reloadToken = UUID()
    var settingsPresented = false

    init() {
        let stored = UserDefaults.standard.string(forKey: Self.serverURLStorageKey) ?? Self.defaultServerURLString
        serverURLString = Self.normalizedServerURLString(from: stored) ?? Self.defaultServerURLString
    }

    var resolvedServerURL: URL? {
        Self.normalizedServerURL(from: serverURLString)
    }

    var hostLabel: String {
        resolvedServerURL?.host ?? "Unavailable"
    }

    func setServerURL(_ rawValue: String) {
        guard let normalized = Self.normalizedServerURLString(from: rawValue) else {
            errorMessage = "Enter a valid Mac or Tailscale URL."
            return
        }

        serverURLString = normalized
        UserDefaults.standard.set(normalized, forKey: Self.serverURLStorageKey)
        errorMessage = ""
        requestReload()
    }

    func resetServerURL() {
        setServerURL(Self.defaultServerURLString)
    }

    func requestReload() {
        isRefreshing = true
        isLoading = true
        errorMessage = ""
        reloadToken = UUID()
    }

    func updateNavigationState(currentURL: URL?, title: String?) {
        self.currentURL = currentURL
        let nextTitle = title?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        pageTitle = nextTitle.isEmpty ? "Codi" : nextTitle
    }

    func updateLoading(_ loading: Bool) {
        isLoading = loading
        if !loading {
            isRefreshing = false
        }
    }

    func reportFailure(_ message: String) {
        errorMessage = message.trimmingCharacters(in: .whitespacesAndNewlines)
        isLoading = false
        isRefreshing = false
    }

    static func normalizedServerURL(from rawValue: String) -> URL? {
        let trimmed = rawValue.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            return nil
        }

        let withScheme = trimmed.contains("://") ? trimmed : "http://\(trimmed)"
        guard var components = URLComponents(string: withScheme),
              let scheme = components.scheme,
              let host = components.host else {
            return nil
        }

        components.scheme = scheme.lowercased()
        components.host = host.lowercased()

        if components.path.isEmpty || components.path == "/" {
            components.path = "/codi"
        }

        return components.url
    }

    static func normalizedServerURLString(from rawValue: String) -> String? {
        normalizedServerURL(from: rawValue)?.absoluteString
    }
}
