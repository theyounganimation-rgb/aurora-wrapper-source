import SwiftUI
import WebKit

struct CodiRootView: View {
    @Bindable var store: CodiStore

    var body: some View {
        ZStack {
            CodiBackdrop()
                .ignoresSafeArea()

            if let url = store.resolvedServerURL {
                CodiWebView(
                    url: url,
                    reloadToken: store.reloadToken,
                    onLoadingChange: { loading in
                        store.updateLoading(loading)
                    },
                    onNavigationUpdate: { currentURL, title in
                        store.updateNavigationState(currentURL: currentURL, title: title)
                    },
                    onFailure: { message in
                        store.reportFailure(message)
                    }
                )
                .ignoresSafeArea()
            } else {
                CodiEmptyStateCard(
                    title: "Enter your Mac address",
                    detail: "Add your Tailscale or local Mac URL in Settings so Codi can load the live mirror."
                )
                .padding(24)
            }
        }
        .safeAreaInset(edge: .top, spacing: 0) {
            CodiTopBar(store: store)
                .padding(.horizontal, 16)
                .padding(.top, 8)
                .padding(.bottom, 10)
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if !store.errorMessage.isEmpty {
                CodiErrorBanner(message: store.errorMessage)
                    .padding(.horizontal, 16)
                    .padding(.bottom, 12)
            }
        }
        .sheet(isPresented: $store.settingsPresented) {
            CodiSettingsSheet(store: store)
        }
    }
}

private struct CodiTopBar: View {
    @Bindable var store: CodiStore

    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                Text("Codi")
                    .font(.system(.headline, design: .rounded, weight: .bold))
                    .foregroundStyle(Color(red: 0.19, green: 0.14, blue: 0.10))

                Text(store.pageTitle)
                    .font(.system(.caption, design: .rounded, weight: .semibold))
                    .foregroundStyle(Color(red: 0.36, green: 0.29, blue: 0.21))
                    .lineLimit(1)
            }

            Spacer(minLength: 0)

            Text(store.hostLabel)
                .font(.system(.caption, design: .rounded, weight: .semibold))
                .foregroundStyle(Color(red: 0.40, green: 0.32, blue: 0.24))
                .padding(.horizontal, 10)
                .padding(.vertical, 7)
                .background(
                    Capsule()
                        .fill(Color.white.opacity(0.76))
                )

            Button {
                store.requestReload()
            } label: {
                Image(systemName: store.isRefreshing ? "arrow.clockwise.circle.fill" : "arrow.clockwise")
                    .font(.system(size: 17, weight: .bold))
                    .frame(width: 42, height: 42)
                    .foregroundStyle(Color(red: 0.19, green: 0.14, blue: 0.10))
                    .background(
                        Circle()
                            .fill(Color.white.opacity(0.82))
                    )
            }
            .buttonStyle(.plain)

            Button {
                store.settingsPresented = true
            } label: {
                Image(systemName: "gearshape.fill")
                    .font(.system(size: 17, weight: .bold))
                    .frame(width: 42, height: 42)
                    .foregroundStyle(Color(red: 0.19, green: 0.14, blue: 0.10))
                    .background(
                        Circle()
                            .fill(Color.white.opacity(0.82))
                    )
            }
            .buttonStyle(.plain)
        }
        .overlay(alignment: .bottomLeading) {
            if store.isLoading {
                ProgressView()
                    .tint(Color(red: 0.72, green: 0.33, blue: 0.16))
                    .padding(.top, 52)
            }
        }
    }
}

private struct CodiSettingsSheet: View {
    @Bindable var store: CodiStore
    @Environment(\.dismiss) private var dismiss
    @State private var draftURL = ""

    var body: some View {
        NavigationStack {
            Form {
                Section("Mac Mirror URL") {
                    TextField("http://your-mac.tailnet.ts.net:3000/codi", text: $draftURL, axis: .vertical)
                        .textInputAutocapitalization(.never)
                        .keyboardType(.URL)
                        .autocorrectionDisabled()

                    Text("Point this at the `/codi` route on your Mac. If you enter only the host, Codi appends `/codi` for you.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }

                Section("Current") {
                    LabeledContent("Host", value: store.hostLabel)
                    if let currentURL = store.currentURL?.absoluteString, !currentURL.isEmpty {
                        LabeledContent("Loaded", value: currentURL)
                    }
                }

                Section {
                    Button("Reset to Default") {
                        draftURL = CodiStore.defaultServerURLString
                        store.resetServerURL()
                        dismiss()
                    }
                    .foregroundStyle(Color(red: 0.66, green: 0.28, blue: 0.15))
                }
            }
            .navigationTitle("Codi Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") {
                        dismiss()
                    }
                }

                ToolbarItem(placement: .confirmationAction) {
                    Button("Apply") {
                        store.setServerURL(draftURL)
                        dismiss()
                    }
                }
            }
            .onAppear {
                draftURL = store.serverURLString
            }
        }
    }
}

private struct CodiErrorBanner: View {
    let message: String

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(Color(red: 0.73, green: 0.28, blue: 0.20))

            Text(message)
                .font(.system(.footnote, design: .rounded, weight: .medium))
                .foregroundStyle(Color(red: 0.39, green: 0.16, blue: 0.11))

            Spacer(minLength: 0)
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(Color(red: 1.0, green: 0.95, blue: 0.93).opacity(0.92))
        )
    }
}

private struct CodiEmptyStateCard: View {
    let title: String
    let detail: String

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title)
                .font(.system(size: 28, weight: .bold, design: .rounded))
                .foregroundStyle(Color(red: 0.19, green: 0.14, blue: 0.10))

            Text(detail)
                .font(.system(.body, design: .rounded, weight: .medium))
                .foregroundStyle(Color(red: 0.38, green: 0.30, blue: 0.23))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(24)
        .background(
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .fill(Color.white.opacity(0.84))
        )
    }
}

private struct CodiBackdrop: View {
    var body: some View {
        LinearGradient(
            colors: [
                Color(red: 0.97, green: 0.93, blue: 0.88),
                Color(red: 0.93, green: 0.88, blue: 0.80),
                Color(red: 0.90, green: 0.84, blue: 0.75)
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
        .overlay(
            RadialGradient(
                colors: [
                    Color(red: 0.97, green: 0.72, blue: 0.44).opacity(0.24),
                    .clear
                ],
                center: .topLeading,
                startRadius: 20,
                endRadius: 320
            )
        )
        .overlay(
            RadialGradient(
                colors: [
                    Color(red: 0.44, green: 0.60, blue: 0.77).opacity(0.22),
                    .clear
                ],
                center: .bottomTrailing,
                startRadius: 30,
                endRadius: 340
            )
        )
    }
}

private struct CodiWebView: UIViewRepresentable {
    let url: URL
    let reloadToken: UUID
    let onLoadingChange: @MainActor (Bool) -> Void
    let onNavigationUpdate: @MainActor (URL?, String?) -> Void
    let onFailure: @MainActor (String) -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(
            onLoadingChange: onLoadingChange,
            onNavigationUpdate: onNavigationUpdate,
            onFailure: onFailure
        )
    }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.defaultWebpagePreferences.preferredContentMode = .mobile
        configuration.allowsInlineMediaPlayback = true

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.customUserAgent = "CodiIOS/1"
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        context.coordinator.lastReloadToken = reloadToken
        context.coordinator.load(url: url, in: webView, forceReload: true)
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        let shouldForceReload = context.coordinator.lastReloadToken != reloadToken
        context.coordinator.lastReloadToken = reloadToken
        context.coordinator.load(url: url, in: webView, forceReload: shouldForceReload)
    }

    final class Coordinator: NSObject, WKNavigationDelegate {
        let onLoadingChange: @MainActor (Bool) -> Void
        let onNavigationUpdate: @MainActor (URL?, String?) -> Void
        let onFailure: @MainActor (String) -> Void
        var lastReloadToken: UUID?

        init(
            onLoadingChange: @escaping @MainActor (Bool) -> Void,
            onNavigationUpdate: @escaping @MainActor (URL?, String?) -> Void,
            onFailure: @escaping @MainActor (String) -> Void
        ) {
            self.onLoadingChange = onLoadingChange
            self.onNavigationUpdate = onNavigationUpdate
            self.onFailure = onFailure
        }

        func load(url: URL, in webView: WKWebView, forceReload: Bool) {
            let request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 60)
            if forceReload {
                webView.load(request)
                return
            }

            if webView.url?.absoluteString != url.absoluteString {
                webView.load(request)
            }
        }

        func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
            Task { @MainActor in
                onLoadingChange(true)
                onNavigationUpdate(webView.url, webView.title)
            }
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            Task { @MainActor in
                onLoadingChange(false)
                onNavigationUpdate(webView.url, webView.title)
            }
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            Task { @MainActor in
                onFailure(error.localizedDescription)
                onNavigationUpdate(webView.url, webView.title)
            }
        }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            Task { @MainActor in
                onFailure(error.localizedDescription)
                onNavigationUpdate(webView.url, webView.title)
            }
        }

        func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
            Task { @MainActor in
                onFailure("The Codi page was interrupted. Reload to reconnect.")
            }
        }
    }
}
