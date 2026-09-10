import Foundation
import SwiftUI
import UIKit

private let auroraDormantStatePollIntervalNs: UInt64 = 2_600_000_000
private let auroraActiveStatePollIntervalNs: UInt64 = 650_000_000
private let auroraHistoryPollIntervalNs: UInt64 = 5_000_000_000
private let auroraNetworkTimeout: TimeInterval = 90
private let auroraDuplicatePromptReplayWindow: TimeInterval = 5 * 60
private let auroraSessionIdStorageKey = "CapacitorStorage.aurora.sessionId"
private let auroraGatewaySessionKeyStorageKey = "CapacitorStorage.aurora.gatewaySessionKey"
private let auroraPreviousResponseIdStorageKey = "CapacitorStorage.aurora.previousResponseId"
private let auroraRelationshipColorProfilesStorageKey = "CapacitorStorage.aurora.relationshipColorProfiles"
private let auroraConversationColorResidueProfilesStorageKey = "CapacitorStorage.aurora.conversationColorResidueProfiles"
let auroraAppearanceThemeStorageKey = "CapacitorStorage.aurora.appearanceTheme"
private let composerFontSize: CGFloat = 18
private let composerVerticalInset: CGFloat = 0
private let composerSingleLineHeight: CGFloat = ceil(UIFont.systemFont(ofSize: composerFontSize, weight: .regular).lineHeight + (composerVerticalInset * 2))
private let auroraDefaultSessionId = "agent:main:main"
private let auroraOwnerDashboardSessionId = "agent:main:main"
private let auroraOwnerAppOpenResponsesSessionId = "agent:main:openresponses-user:\(auroraOwnerDashboardSessionId)"
private let auroraOwnerUnifiedContinuitySessionId = "agent:main:owner:continuity"
private let auroraHeartbeatMainGatewaySessionKey = auroraOwnerDashboardSessionId
private let auroraMobileGatewaySessionKey = "agent:aurora-mobile:owner:continuity"
private let auroraSendPath = "/api/openclaw/send"
private let auroraStatePath = "/api/aurora/state"
private let auroraHistoryPath = "/api/openclaw/history"
private let auroraFilesPath = "/api/aurora/files"
private let auroraCronHistorySource = "cron"
private let auroraProactiveContactHistoryCategory = "proactive_contact"

private let auroraDirectContinuitySessionIds = Set<String>([
    "agent:main:telegram:direct:0000000000"
])

private enum AuroraComposerButtonMode {
    case disabled
    case send
}

private enum AuroraSendStreamEvent: String {
    case reply
    case final
    case error
}

private enum AuroraPresencePhase {
    case dormant
    case thinking
    case inhabited

    var visualEnergy: Double {
        switch self {
        case .dormant:
            return 0.52
        case .thinking:
            return 0.88
        case .inhabited:
            return 0.68
        }
    }
}

private enum AuroraArchivePane: String, CaseIterable, Identifiable {
    case memory
    case history
    case files

    var id: String {
        rawValue
    }

    var title: String {
        switch self {
        case .memory:
            return "Memory"
        case .history:
            return "History"
        case .files:
            return "Files"
        }
    }
}

struct NativeCompanionRootView: View {
    @StateObject private var store = NativeAuroraStore()
    @State private var composerHeight: CGFloat = composerSingleLineHeight
    @State private var archivePresented = false
    @State private var selectedArchivePane: AuroraArchivePane = .memory
    @State private var composerPresented = false
    @State private var composerFocused = false

    private var composerButtonMode: AuroraComposerButtonMode {
        store.prompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? .disabled : .send
    }

    private var replyStageBottomInset: CGFloat {
        composerPresented ? 132 : 48
    }

    var body: some View {
        ZStack {
            AuroraLivingBackground(
                scene: store.emotionScene,
                phase: store.presencePhase,
                intensity: store.motionIntensity,
                motionEnvelope: store.motionEnvelope,
                thinkingAuraActive: store.thinkingAuraActive
            )

            AuroraReplyStage(
                reply: store.visibleReply,
                dismissalSequence: store.visibleReplyDismissalSequence,
                scene: store.emotionScene,
                phase: store.presencePhase,
                onCurrentReplyPresentationChange: { _ in }
            )
            .padding(.horizontal, 24)
            .padding(.top, 44)
            .padding(.bottom, replyStageBottomInset)
            .contentShape(Rectangle())
            .simultaneousGesture(
                LongPressGesture(minimumDuration: 0.9).onEnded { _ in
                    revealArchive(.memory)
                }
            )
            .simultaneousGesture(
                TapGesture().onEnded {
                    handleSurfaceTap()
                }
            )

            if archivePresented {
                AuroraArchiveOverlay(
                    state: store.state,
                    messages: store.messages,
                    files: store.internalFiles,
                    selectedPane: selectedArchivePane,
                    loading: store.archiveLoading,
                    errorMessage: store.archiveErrorMessage,
                    scene: store.emotionScene,
                    onSelectPane: { pane in
                        selectedArchivePane = pane
                    },
                    onRefresh: {
                        Task {
                            await store.refreshArchive()
                        }
                    },
                    onClose: {
                        dismissArchive()
                    }
                )
                .transition(.move(edge: .trailing).combined(with: .opacity))
                .zIndex(10)
            }

            HStack {
                Spacer()

                Color.clear
                    .frame(width: 30)
                    .contentShape(Rectangle())
                    .gesture(
                        DragGesture(minimumDistance: 12).onEnded { value in
                            guard value.translation.width < -20 else {
                                return
                            }
                            revealArchive(.memory)
                        }
                    )
            }
            .ignoresSafeArea()
        }
        .background(Color.black)
        .preferredColorScheme(.dark)
        .animation(.spring(response: 0.52, dampingFraction: 0.92), value: archivePresented)
        .task {
            store.start()
        }
        .onChange(of: archivePresented) { isPresented in
            guard isPresented else {
                return
            }

            Task {
                await store.refreshArchive()
            }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if composerPresented {
                AuroraComposerView(
                    prompt: $store.prompt,
                    promptHeight: $composerHeight,
                    resetToken: store.composerResetToken,
                    buttonMode: composerButtonMode,
                    placeholder: "Speak to Aurora",
                    errorMessage: store.errorMessage,
                    isFocused: composerFocused,
                    onPrimaryAction: {
                        dismissComposer()
                        Task {
                            await store.submitPrompt()
                        }
                    }
                )
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
    }

    private func revealArchive(_ pane: AuroraArchivePane) {
        dismissComposer(animated: false)
        selectedArchivePane = pane
        withAnimation(.spring(response: 0.52, dampingFraction: 0.92)) {
            archivePresented = true
        }
    }

    private func dismissArchive() {
        withAnimation(.spring(response: 0.42, dampingFraction: 0.94)) {
            archivePresented = false
        }
    }

    private func handleSurfaceTap() {
        guard !archivePresented else {
            return
        }

        if composerPresented {
            dismissComposer()
        } else {
            presentComposer()
        }
    }

    private func presentComposer() {
        withAnimation(.spring(response: 0.42, dampingFraction: 0.94)) {
            composerPresented = true
        }

        DispatchQueue.main.async {
            composerFocused = true
        }
    }

    private func dismissComposer(animated: Bool = true) {
        composerFocused = false
        hideKeyboard()

        let dismiss = {
            composerPresented = false
        }

        if animated {
            withAnimation(.spring(response: 0.36, dampingFraction: 0.96)) {
                dismiss()
            }
        } else {
            dismiss()
        }
    }
}

@MainActor
private final class NativeAuroraStore: ObservableObject {
    @Published var prompt = ""
    @Published private(set) var state = AuroraStateSnapshot.empty
    @Published private(set) var messages: [AuroraHistoryMessage] = []
    @Published private(set) var internalFiles: [AuroraInternalFile] = []
    @Published private(set) var visibleReply: AuroraVisibleReply?
    @Published private(set) var visibleReplyDismissalSequence = 0
    @Published private(set) var submitting = false
    @Published private(set) var loading = true
    @Published private(set) var archiveLoading = false
    @Published private(set) var errorMessage = ""
    @Published private(set) var archiveErrorMessage = ""
    @Published private(set) var composerResetToken = UUID()
    @Published private(set) var turnAccent = AuroraTurnAccent.inactive
    @Published private(set) var contextualAccent = AuroraTurnAccent.inactive
    @Published private(set) var motionEnvelope = 0.08
    @Published private(set) var relationshipColorProfile = AuroraRelationshipColorProfile.empty
    @Published private(set) var conversationColorResidueProfile = AuroraRelationshipColorProfile.empty

    private var stateLoopTask: Task<Void, Never>?
    private var historyLoopTask: Task<Void, Never>?
    private var turnAccentDecayTask: Task<Void, Never>?
    private var contextualAccentDecayTask: Task<Void, Never>?
    private var motionEnvelopeTask: Task<Void, Never>?
    private let session: URLSession
    private let decoder = JSONDecoder()
    private let encoder = JSONEncoder()
    private let bundledAPIBaseURL: URL?
    private let bundledDirectGatewayConfig: NativeCompanionDirectGatewayConfig?
    private var sessionId: String
    private var gatewaySessionKey: String
    private var previousResponseId: String?
    private var relationshipColorProfiles: [String: AuroraRelationshipColorProfile]
    private var conversationColorResidueProfiles: [String: AuroraRelationshipColorProfile]
    private var hasStarted = false
    private var pendingReplyProjectionEarliestAt: Date?
    private var pendingReplyProjectionBaselineSignature: String?
    private var lastRelationshipColorSampleAt: Date?
    private var lastRelationshipColorSampleConversationKey = ""
    private var pinnedPromptAccentFamily: AuroraEmotionFamily?
    private var pinnedPromptAccentUntil: Date?
    private var proactiveNotificationObserver: NSObjectProtocol?

    init() {
        let configuration = URLSessionConfiguration.default
        configuration.requestCachePolicy = .reloadIgnoringLocalAndRemoteCacheData
        configuration.timeoutIntervalForRequest = auroraNetworkTimeout
        configuration.timeoutIntervalForResource = auroraNetworkTimeout
        configuration.waitsForConnectivity = false
        configuration.networkServiceType = .responsiveData
        configuration.httpMaximumConnectionsPerHost = 6
        session = URLSession(configuration: configuration)

        let bundledConfig = NativeCompanionConfigLoader.loadConfig()
        bundledAPIBaseURL = bundledConfig.flatMap { normalizedCompanionAPIBaseURL(from: $0.apiBaseURL) }
        bundledDirectGatewayConfig = bundledConfig.flatMap { NativeCompanionDirectGatewayConfig(config: $0) }

        let defaults = UserDefaults.standard
        relationshipColorProfiles = Self.loadRelationshipColorProfiles(from: defaults)
        conversationColorResidueProfiles = Self.loadConversationColorResidueProfiles(from: defaults)
        let storedSessionId = defaults.string(forKey: auroraSessionIdStorageKey) ?? auroraDefaultSessionId
        sessionId = canonicalContinuitySessionId(storedSessionId)
        let storedGatewaySessionKey = defaults.string(forKey: auroraGatewaySessionKeyStorageKey) ?? auroraMobileGatewaySessionKey
        gatewaySessionKey = canonicalGatewaySessionKey(storedGatewaySessionKey)
        previousResponseId = defaults.string(forKey: auroraPreviousResponseIdStorageKey)?.nonEmptyTrimmed
        relationshipColorProfile = relationshipColorProfiles[activeRelationshipColorConversationKey()] ?? .empty
        conversationColorResidueProfile = conversationColorResidueProfiles[activeRelationshipColorConversationKey()] ?? .empty

        if bundledAPIBaseURL == nil {
            errorMessage = "Missing native Aurora API configuration."
        }
    }

    deinit {
        stateLoopTask?.cancel()
        historyLoopTask?.cancel()
        turnAccentDecayTask?.cancel()
        contextualAccentDecayTask?.cancel()
        motionEnvelopeTask?.cancel()
        if let proactiveNotificationObserver {
            NotificationCenter.default.removeObserver(proactiveNotificationObserver)
        }
    }

    var presencePhase: AuroraPresencePhase {
        if visibleReply != nil {
            return .inhabited
        }

        if submitting {
            return .thinking
        }

        return .dormant
    }

    var thinkingAuraActive: Bool {
        (submitting || pendingReplyProjectionEarliestAt != nil) && visibleReply == nil
    }

    var motionIntensity: Double {
        let base: Double
        switch presencePhase {
        case .dormant:
            base = 0.16
        case .thinking:
            base = 0.74
        case .inhabited:
            base = 0.54
        }

        return clamp(
            base
                + state.cognition.emotion.arousal * 0.16
                + min(0.14, Double(state.cognition.attention.queueDepth) * 0.012)
                + motionEnvelope * 0.18,
            min: 0.12,
            max: 1
        )
    }

    var emotionScene: AuroraEmotionScene {
        AuroraEmotionScene.derive(
            from: state,
            phase: presencePhase,
            intensity: motionIntensity,
            relationshipProfile: relationshipColorProfile,
            conversationResidueProfile: conversationColorResidueProfile,
            contextualAccent: contextualAccent,
            turnAccent: turnAccent,
            motionEnvelope: motionEnvelope
        )
    }

    func start() {
        guard !hasStarted else {
            return
        }

        hasStarted = true
        registerForProactiveNotificationResponses()

        Task {
            await refreshState()
            await refreshHistory(projectVisibleReply: false)
        }

        stateLoopTask = Task { [weak self] in
            while let self, !Task.isCancelled {
                try? await Task.sleep(nanoseconds: self.resolvedStatePollIntervalNanoseconds())
                await self.refreshState()
            }
        }

        historyLoopTask = Task { [weak self] in
            while let self, !Task.isCancelled {
                try? await Task.sleep(nanoseconds: auroraHistoryPollIntervalNs)
                await self.refreshHistory(projectVisibleReply: self.pendingReplyProjectionEarliestAt != nil)
            }
        }
    }

    func refreshArchive() async {
        archiveLoading = true
        defer {
            archiveLoading = false
        }

        await refreshHistory(projectVisibleReply: false)
        await refreshFiles()
    }

    func submitPrompt() async {
        guard !submitting else {
            return
        }

        let trimmedPrompt = prompt.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedPrompt.isEmpty else {
            return
        }

        if let duplicateReply = recentReplyForAnsweredDuplicatePrompt(trimmedPrompt) {
            prompt = ""
            composerResetToken = UUID()
            errorMessage = ""
            pendingReplyProjectionEarliestAt = nil
            pendingReplyProjectionBaselineSignature = nil
            setVisibleReply(duplicateReply.text, timestamp: duplicateReply.createdAt)
            return
        }

        primeTurnAccent(for: trimmedPrompt)
        beginSubmissionMotionEnvelope()
        submitting = true
        defer {
            submitting = false
        }

        let submissionStartedAt = Date()
        let latestKnownAuroraReply = messages.last(where: { $0.role == .aurora })
        let priorReply = visibleReply
        let submissionBaselineSignature =
            priorReply.map(Self.replyProjectionSignature(for:)) ??
            latestKnownAuroraReply.map(Self.replyProjectionSignature(for:))
        prompt = ""
        composerResetToken = UUID()
        if priorReply != nil {
            dismissVisibleReplyForFollowUp()
        }
        pendingReplyProjectionEarliestAt = submissionStartedAt
        pendingReplyProjectionBaselineSignature = submissionBaselineSignature
        errorMessage = ""

        do {
            let activeSessionId = canonicalContinuitySessionId(sessionId)
            let activeGatewaySessionKey = canonicalGatewaySessionKey(gatewaySessionKey)
            let response: AuroraSendResponse

            if let directGatewayConfig = activeDirectGatewayConfig {
                response = try await performDirectGatewaySendRequest(
                    config: directGatewayConfig,
                    prompt: trimmedPrompt,
                    sessionId: activeSessionId,
                    sessionKey: activeGatewaySessionKey,
                    previousResponseId: previousResponseId
                ) { [weak self] streamedReplyText in
                    guard let self else {
                        return
                    }

                    self.setVisibleReplyStreaming(streamedReplyText)
                }
            } else {
                let payload = AuroraSendRequest(
                    text: trimmedPrompt,
                    sessionId: activeSessionId,
                    sessionKey: activeGatewaySessionKey,
                    previousResponseId: previousResponseId
                )
                let encodedPayload = try encoder.encode(payload)
                response = try await performStreamingSendRequest(
                    path: auroraSendPath,
                    body: encodedPayload
                ) { [weak self] streamedReplyText in
                    guard let self else {
                        return
                    }

                    self.setVisibleReplyStreaming(streamedReplyText)
                }
            }

            if response.resetPreviousResponseId {
                previousResponseId = nil
                UserDefaults.standard.removeObject(forKey: auroraPreviousResponseIdStorageKey)
            }

            if let responseId = response.id.nonEmptyTrimmed {
                previousResponseId = responseId
                UserDefaults.standard.set(responseId, forKey: auroraPreviousResponseIdStorageKey)
            }

            if let responseSessionId = response.sessionId.nonEmptyTrimmed {
                sessionId = canonicalContinuitySessionId(responseSessionId)
                UserDefaults.standard.set(sessionId, forKey: auroraSessionIdStorageKey)
                synchronizeRelationshipColorProfile(resetSamplingWindow: true)
            }

            if let rawResponseGatewaySessionKey = response.resolvedSessionKey,
               let responseGatewaySessionKey = rawResponseGatewaySessionKey.nonEmptyTrimmed {
                gatewaySessionKey = canonicalGatewaySessionKey(responseGatewaySessionKey)
                UserDefaults.standard.set(gatewaySessionKey, forKey: auroraGatewaySessionKeyStorageKey)
                synchronizeRelationshipColorProfile(resetSamplingWindow: true)
            }

            let finalizedReplyText = response.outputText.nonEmptyTrimmed
            if let replyText = finalizedReplyText {
                setVisibleReplyStreaming(replyText, timestamp: currentAuroraTimestamp())
            }

            await refreshState()
            await refreshHistory(projectVisibleReply: finalizedReplyText == nil || visibleReply == nil)
            pendingReplyProjectionEarliestAt = nil
            pendingReplyProjectionBaselineSignature = nil
        } catch {
            let wrappedError = NativeAuroraError.wrap(error).localizedDescription
            await refreshHistory(projectVisibleReply: true)
            let recoveredReply = visibleReply
            pendingReplyProjectionEarliestAt = nil
            pendingReplyProjectionBaselineSignature = nil

            if let recoveredReply,
               Self.replyProjectionSignature(for: recoveredReply) != submissionBaselineSignature {
                errorMessage = ""
                await refreshState()
                return
            }

            errorMessage = wrappedError
            visibleReply = priorReply
            clearPinnedPromptAccent()
            scheduleContextualAccentTransition(after: 1_200_000_000, to: .inactive)
            settleMotionEnvelope(afterFailedSubmissionRestoringReply: priorReply != nil)
        }
    }

    private func refreshState() async {
        guard activeAPIBaseURL != nil else {
            loading = false
            return
        }

        do {
            let payload: AuroraStatePayload = try await performRequest(path: auroraStatePath)
            let nextState = AuroraStateSnapshot(payload)
            state = nextState
            captureRelationshipColorSample(from: nextState)
            reconcileTurnAccent(with: nextState)
            errorMessage = nextState.error.nonEmptyTrimmed ?? ""
        } catch {
            errorMessage = NativeAuroraError.wrap(error).localizedDescription
        }

        loading = false
    }

    private func resolvedStatePollIntervalNanoseconds() -> UInt64 {
        if submitting ||
            turnAccent.isActive ||
            motionEnvelope > 0.14 ||
            visibleReply != nil ||
            state.cognition.affective.conversationFreshness > 0.18 {
            return auroraActiveStatePollIntervalNs
        }

        return auroraDormantStatePollIntervalNs
    }

    private func refreshHistory(projectVisibleReply: Bool) async {
        guard activeAPIBaseURL != nil else {
            return
        }

        do {
            let activeSessionId = canonicalContinuitySessionId(sessionId)
            let activeGatewaySessionKey = canonicalGatewaySessionKey(gatewaySessionKey)
            let payload: AuroraHistoryResponsePayload = try await performRequest(
                path: auroraHistoryPath,
                queryItems: [
                    URLQueryItem(name: "sessionId", value: activeSessionId),
                    URLQueryItem(name: "sessionKey", value: activeGatewaySessionKey)
                ]
            )

            let nextMessages = (payload.messages ?? []).compactMap(AuroraHistoryMessage.init)
            let shouldReplaceMessages = !nextMessages.isEmpty || messages.isEmpty
            if shouldReplaceMessages {
                messages = nextMessages
            }
            archiveErrorMessage = ""

            let resolvedMessages = shouldReplaceMessages ? nextMessages : messages
            handlePendingProactiveBridgeMessagePresentation(
                with: resolvedMessages,
                preferredMessageId: pendingAuroraProactiveNotificationMessageId()
            )

            guard projectVisibleReply else {
                return
            }

            if let latestReply = nextMessages.last(where: { $0.role == .aurora }) {
                let latestReplySignature = Self.replyProjectionSignature(for: latestReply)

                if let earliestProjectionAt = pendingReplyProjectionEarliestAt {
                    let latestReplyDate = parseAuroraDate(latestReply.createdAt)
                    guard latestReplyDate != .distantPast, latestReplyDate >= earliestProjectionAt else {
                        return
                    }
                }

                if let baselineSignature = pendingReplyProjectionBaselineSignature,
                   latestReplySignature == baselineSignature {
                    return
                }

                if visibleReply?.text != latestReply.text || visibleReply?.timestamp != latestReply.createdAt {
                    setVisibleReply(latestReply.text, timestamp: latestReply.createdAt)
                }

                pendingReplyProjectionEarliestAt = nil
                pendingReplyProjectionBaselineSignature = nil
            }
        } catch {
            archiveErrorMessage = NativeAuroraError.wrap(error).localizedDescription
        }
    }

    private func refreshFiles() async {
        guard activeAPIBaseURL != nil else {
            return
        }

        do {
            let payload: AuroraFilesResponsePayload = try await performRequest(path: auroraFilesPath)
            internalFiles = (payload.files ?? []).map(AuroraInternalFile.init)
            archiveErrorMessage = ""
        } catch {
            archiveErrorMessage = NativeAuroraError.wrap(error).localizedDescription
        }
    }

    private func setVisibleReply(_ text: String?, timestamp: String? = nil) {
        guard let trimmed = text?.trimmingCharacters(in: .whitespacesAndNewlines), !trimmed.isEmpty else {
            visibleReply = nil
            return
        }

        if let currentVisibleReply = visibleReply, currentVisibleReply.text == trimmed {
            visibleReply = currentVisibleReply.updating(timestamp: timestamp)
            return
        }

        clearPinnedPromptAccent()
        sustainContextualAccentThroughReply()
        primeReplyAccent(for: trimmed)
        visibleReply = AuroraVisibleReply(text: trimmed, timestamp: timestamp)
        beginReplyMotionEnvelope()
    }

    private func setVisibleReplyStreaming(_ text: String?, timestamp: String? = nil) {
        guard let trimmed = text?.trimmingCharacters(in: .whitespacesAndNewlines), !trimmed.isEmpty else {
            return
        }

        if let currentVisibleReply = visibleReply {
            if currentVisibleReply.text == trimmed {
                visibleReply = currentVisibleReply.updating(timestamp: timestamp)
                return
            }

            visibleReply = currentVisibleReply.updating(text: trimmed, timestamp: timestamp)
            return
        }

        clearPinnedPromptAccent()
        sustainContextualAccentThroughReply()
        primeReplyAccent(for: trimmed)
        visibleReply = AuroraVisibleReply(text: trimmed, timestamp: timestamp)
        beginReplyMotionEnvelope()
    }

    private func dismissVisibleReplyForFollowUp() {
        guard visibleReply != nil else {
            return
        }

        visibleReplyDismissalSequence &+= 1
        visibleReply = nil
    }

    private func registerForProactiveNotificationResponses() {
        guard proactiveNotificationObserver == nil else {
            return
        }

        proactiveNotificationObserver = NotificationCenter.default.addObserver(
            forName: auroraProactiveNotificationResponseName,
            object: nil,
            queue: .main
        ) { [weak self] notification in
            guard let self else {
                return
            }

            let preferredMessageId = notification.userInfo?["messageId"] as? String
            Task {
                await self.refreshHistory(projectVisibleReply: false)
                self.handlePendingProactiveBridgeMessagePresentation(
                    with: self.messages,
                    preferredMessageId: preferredMessageId
                )
            }
        }
    }

    private func handlePendingProactiveBridgeMessagePresentation(
        with messages: [AuroraHistoryMessage],
        preferredMessageId: String? = nil
    ) {
        guard !submitting, pendingReplyProjectionEarliestAt == nil else {
            return
        }

        guard let pendingMessage = latestPendingProactiveBridgeMessage(
            in: messages,
            preferredMessageId: preferredMessageId
        ) else {
            if preferredMessageId == nil {
                clearAuroraProactiveBridgeNotifications()
            }
            return
        }

        if let preferredMessageId, pendingMessage.id == preferredMessageId {
            _ = consumePendingAuroraProactiveNotificationMessageId()
            clearAuroraProactiveBridgeNotifications()
        }

        if visibleReply == nil || preferredMessageId == pendingMessage.id {
            if visibleReply?.text != pendingMessage.text || visibleReply?.timestamp != pendingMessage.createdAt {
                setVisibleReply(pendingMessage.text, timestamp: pendingMessage.createdAt)
            }
        }
    }

    private func latestPendingProactiveBridgeMessage(
        in messages: [AuroraHistoryMessage],
        preferredMessageId: String? = nil
    ) -> AuroraHistoryMessage? {
        guard !messages.isEmpty else {
            return nil
        }

        if let preferredMessageId,
           let preferredIndex = messages.firstIndex(where: { $0.id == preferredMessageId && $0.isProactiveBridgeMessage }),
           !hasUserReply(after: preferredIndex, in: messages) {
            return messages[preferredIndex]
        }

        for index in messages.indices.reversed() {
            let message = messages[index]
            guard message.isProactiveBridgeMessage else {
                continue
            }

            if !hasUserReply(after: index, in: messages) {
                return message
            }
        }

        return nil
    }

    private func hasUserReply(after index: Int, in messages: [AuroraHistoryMessage]) -> Bool {
        guard index + 1 < messages.count else {
            return false
        }

        return messages[(index + 1)...].contains(where: { $0.role == .user })
    }

    private static func replyProjectionSignature(for reply: AuroraHistoryMessage) -> String {
        "\(reply.createdAt.trimmingCharacters(in: .whitespacesAndNewlines))\n\(reply.text.trimmingCharacters(in: .whitespacesAndNewlines))"
    }

    private static func replyProjectionSignature(for reply: AuroraVisibleReply) -> String {
        "\((reply.timestamp ?? "").trimmingCharacters(in: .whitespacesAndNewlines))\n\(reply.text.trimmingCharacters(in: .whitespacesAndNewlines))"
    }

    private func primeTurnAccent(for prompt: String) {
        if let promptAccent = AuroraTurnAccent.promptDriven(from: prompt) {
            pinPromptAccent(promptAccent)
            applyTurnAccent(promptAccent)
            applyContextualAccent(promptAccent.decayed(to: max(0.2, promptAccent.strength * 0.48)))
            captureConversationColorResidue(from: promptAccent, influence: 0.68)
            let decayDelay: UInt64 = promptAccent.family == .blue || promptAccent.family == .bluePurple ? 4_200_000_000 : 3_000_000_000
            let clearDelay: UInt64 = promptAccent.family == .blue || promptAccent.family == .bluePurple ? 8_200_000_000 : 5_600_000_000
            scheduleTurnAccentTransition(
                after: decayDelay,
                to: promptAccent.decayed(to: max(0.24, promptAccent.strength * 0.42)),
                clearAfter: clearDelay
            )
            return
        }

        clearPinnedPromptAccent()
        clearContextualAccent()
        guard let ambientAccent = AuroraTurnAccent.ambient(from: state) else {
            clearTurnAccent()
            return
        }

        applyTurnAccent(ambientAccent)
        scheduleTurnAccentTransition(
            after: 2_400_000_000,
            to: ambientAccent.decayed(to: max(0.16, ambientAccent.strength * 0.54)),
            clearAfter: 4_400_000_000
        )
    }

    private func primeReplyAccent(for reply: String) {
        clearPinnedPromptAccent()
        guard let replyAccent = AuroraTurnAccent.replyDriven(from: reply) else {
            return
        }

        captureConversationColorResidue(from: replyAccent, influence: 0.58)
        applyTurnAccent(replyAccent)
        scheduleTurnAccentTransition(
            after: 3_200_000_000,
            to: replyAccent.decayed(to: max(0.18, replyAccent.strength * 0.4)),
            clearAfter: 5_800_000_000
        )
    }

    private func reconcileTurnAccent(with nextState: AuroraStateSnapshot) {
        if shouldHoldPinnedPromptAccent() {
            return
        }

        guard turnAccent.isActive else {
            return
        }

        if let family = turnAccent.family,
           let sustainedAccent = AuroraTurnAccent.sustained(from: nextState, preferring: family) {
            applyTurnAccent(sustainedAccent)
            scheduleTurnAccentTransition(
                after: 3_600_000_000,
                to: sustainedAccent.decayed(to: max(0.1, sustainedAccent.strength * 0.28)),
                clearAfter: 5_200_000_000
            )
            return
        }

        if let ambientAccent = AuroraTurnAccent.ambient(from: nextState) {
            applyTurnAccent(ambientAccent)
            scheduleTurnAccentTransition(
                after: 2_600_000_000,
                to: ambientAccent.decayed(to: max(0.08, ambientAccent.strength * 0.24)),
                clearAfter: 4_000_000_000
            )
            return
        }

        scheduleTurnAccentTransition(after: 1_400_000_000, to: .inactive)
    }

    private func applyTurnAccent(_ accent: AuroraTurnAccent) {
        turnAccentDecayTask?.cancel()
        turnAccent = accent
    }

    private func clearTurnAccent() {
        turnAccentDecayTask?.cancel()
        turnAccent = .inactive
    }

    private func applyContextualAccent(_ accent: AuroraTurnAccent) {
        contextualAccentDecayTask?.cancel()
        contextualAccent = accent
    }

    private func clearContextualAccent() {
        contextualAccentDecayTask?.cancel()
        contextualAccent = .inactive
    }

    private func captureConversationColorResidue(from accent: AuroraTurnAccent, influence: Double) {
        guard accent.isActive,
              let family = accent.family else {
            return
        }

        let key = activeRelationshipColorConversationKey()
        let existingProfile = conversationColorResidueProfiles[key] ?? .empty
        let updatedProfile = existingProfile.updated(
            withResidueFrom: family,
            strength: accent.strength * influence,
            at: Date()
        )
        conversationColorResidueProfiles[key] = updatedProfile
        conversationColorResidueProfile = updatedProfile
        persistConversationColorResidueProfiles()
    }

    private func pinPromptAccent(_ accent: AuroraTurnAccent) {
        pinnedPromptAccentFamily = accent.family
        pinnedPromptAccentUntil = Date().addingTimeInterval(12)
    }

    private func clearPinnedPromptAccent() {
        pinnedPromptAccentFamily = nil
        pinnedPromptAccentUntil = nil
    }

    private func shouldHoldPinnedPromptAccent() -> Bool {
        guard submitting,
              let pinnedFamily = pinnedPromptAccentFamily,
              turnAccent.family == pinnedFamily,
              let pinnedUntil = pinnedPromptAccentUntil else {
            return false
        }

        if Date() <= pinnedUntil {
            return true
        }

        clearPinnedPromptAccent()
        return false
    }

    private func sustainContextualAccentThroughReply() {
        guard contextualAccent.isActive else {
            return
        }

        let sustainedStrength: Double
        switch contextualAccent.family {
        case .blue, .bluePurple:
            sustainedStrength = max(0.3, contextualAccent.strength * 0.98)
        case .pink, .redPurple:
            sustainedStrength = max(0.2, contextualAccent.strength * 0.82)
        default:
            sustainedStrength = max(0.16, contextualAccent.strength * 0.74)
        }

        applyContextualAccent(contextualAccent.decayed(to: sustainedStrength))
        scheduleContextualAccentTransition(
            after: 6_200_000_000,
            to: contextualAccent.decayed(to: max(0.08, sustainedStrength * 0.42)),
            clearAfter: 8_400_000_000
        )
    }

    private func scheduleTurnAccentTransition(
        after delayNanoseconds: UInt64,
        to nextAccent: AuroraTurnAccent,
        clearAfter clearDelayNanoseconds: UInt64? = nil
    ) {
        turnAccentDecayTask?.cancel()
        turnAccentDecayTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: delayNanoseconds)
            guard let self, !Task.isCancelled else {
                return
            }

            self.turnAccent = nextAccent

            guard let clearDelayNanoseconds, nextAccent.isActive else {
                return
            }

            try? await Task.sleep(nanoseconds: clearDelayNanoseconds)
            guard !Task.isCancelled else {
                return
            }

            self.clearPinnedPromptAccent()
            self.turnAccent = .inactive
        }
    }

    private func scheduleContextualAccentTransition(
        after delayNanoseconds: UInt64,
        to nextAccent: AuroraTurnAccent,
        clearAfter clearDelayNanoseconds: UInt64? = nil
    ) {
        contextualAccentDecayTask?.cancel()
        contextualAccentDecayTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: delayNanoseconds)
            guard let self, !Task.isCancelled else {
                return
            }

            self.contextualAccent = nextAccent

            guard let clearDelayNanoseconds, nextAccent.isActive else {
                return
            }

            try? await Task.sleep(nanoseconds: clearDelayNanoseconds)
            guard !Task.isCancelled else {
                return
            }

            self.contextualAccent = .inactive
        }
    }

    private func beginSubmissionMotionEnvelope() {
        animateMotionEnvelope(
            to: max(0.94, motionEnvelope),
            steps: [
                (1_400_000_000, 0.88),
                (1_800_000_000, 0.82)
            ]
        )
    }

    private func beginReplyMotionEnvelope() {
        animateMotionEnvelope(
            to: max(0.94, motionEnvelope),
            steps: [
                (1_400_000_000, 0.84),
                (2_300_000_000, 0.74),
                (3_200_000_000, 0.58),
                (4_300_000_000, 0.38),
                (5_600_000_000, 0.22)
            ]
        )
    }

    private func settleMotionEnvelope(afterFailedSubmissionRestoringReply restoredReply: Bool) {
        if restoredReply {
            animateMotionEnvelope(
                to: max(0.48, motionEnvelope * 0.72),
                steps: [
                    (2_200_000_000, 0.32),
                    (3_600_000_000, 0.12)
                ]
            )
            return
        }

        animateMotionEnvelope(
            to: max(0.26, motionEnvelope * 0.54),
            steps: [
                (1_800_000_000, 0.18),
                (3_000_000_000, 0.08)
            ]
        )
    }

    private func animateMotionEnvelope(to initialValue: Double, steps: [(UInt64, Double)]) {
        motionEnvelopeTask?.cancel()
        let clampedInitial = clamp(initialValue, min: 0.08, max: 1)
        withAnimation(.timingCurve(0.2, 0.82, 0.22, 1, duration: 0.9)) {
            motionEnvelope = clampedInitial
        }

        guard !steps.isEmpty else {
            return
        }

        motionEnvelopeTask = Task { [weak self] in
            var previousValue = clampedInitial
            for (delay, value) in steps {
                try? await Task.sleep(nanoseconds: delay)
                guard let self, !Task.isCancelled else {
                    return
                }

                let clampedValue = clamp(value, min: 0.08, max: 1)
                withAnimation(self.motionEnvelopeAnimation(forStepDelay: delay, from: previousValue, to: clampedValue)) {
                    self.motionEnvelope = clampedValue
                }
                previousValue = clampedValue
            }
        }
    }

    private func motionEnvelopeAnimation(forStepDelay delay: UInt64, from current: Double, to next: Double) -> Animation {
        let seconds = Double(delay) / 1_000_000_000
        let distance = abs(next - current)
        let duration = clamp(seconds * (0.52 + distance * 0.18), min: 0.68, max: 2.25)
        return .timingCurve(0.2, 0.82, 0.22, 1, duration: duration)
    }

    private func recentReplyForAnsweredDuplicatePrompt(_ prompt: String) -> AuroraHistoryMessage? {
        let trimmedPrompt = prompt.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedPrompt.isEmpty,
              let latestUserIndex = messages.lastIndex(where: { $0.role == .user }) else {
            return nil
        }

        let latestUser = messages[latestUserIndex]
        guard latestUser.text == trimmedPrompt else {
            return nil
        }

        let replies = messages.suffix(from: latestUserIndex + 1).filter { $0.role == .aurora }
        guard let latestReply = replies.last else {
            return nil
        }

        let latestReplyDate = parseAuroraDate(latestReply.createdAt)
        guard latestReplyDate != .distantPast,
              Date().timeIntervalSince(latestReplyDate) <= auroraDuplicatePromptReplayWindow else {
            return nil
        }

        let latestUserDate = parseAuroraDate(latestUser.createdAt)
        if latestUserDate != .distantPast, latestReplyDate < latestUserDate {
            return nil
        }

        return latestReply
    }

    private var activeAPIBaseURL: URL? {
        bundledAPIBaseURL
    }

    private var activeDirectGatewayConfig: NativeCompanionDirectGatewayConfig? {
        bundledDirectGatewayConfig
    }

    private func activeRelationshipColorConversationKey() -> String {
        let normalizedGatewaySessionKey = canonicalGatewaySessionKey(gatewaySessionKey)
        if isAgentSemanticSessionKey(normalizedGatewaySessionKey) {
            return normalizedGatewaySessionKey.lowercased()
        }

        return canonicalContinuitySessionId(sessionId).lowercased()
    }

    private func synchronizeRelationshipColorProfile(resetSamplingWindow: Bool = false) {
        let key = activeRelationshipColorConversationKey()
        let backendProfile = state.cognition.relationshipChromaticProfile
        if backendProfile.hasSignal {
            let existingProfile = relationshipColorProfiles[key] ?? .empty
            let displayedProfile: AuroraRelationshipColorProfile
            if resetSamplingWindow || !existingProfile.hasSignal {
                displayedProfile = backendProfile
            } else {
                displayedProfile = existingProfile.blended(
                    toward: backendProfile,
                    alpha: resolvedBackendRelationshipBlendAlpha(existing: existingProfile, incoming: backendProfile),
                    at: Date()
                )
            }

            relationshipColorProfile = displayedProfile
            if relationshipColorProfiles[key] != displayedProfile {
                relationshipColorProfiles[key] = displayedProfile
                persistRelationshipColorProfiles()
            }
        } else {
            relationshipColorProfile = relationshipColorProfiles[key] ?? .empty
        }

        conversationColorResidueProfile = conversationColorResidueProfiles[key] ?? .empty

        if resetSamplingWindow || key != lastRelationshipColorSampleConversationKey {
            lastRelationshipColorSampleConversationKey = key
            lastRelationshipColorSampleAt = nil
        }
    }

    private func captureRelationshipColorSample(from nextState: AuroraStateSnapshot) {
        guard nextState.available else {
            return
        }

        let conversationKey = activeRelationshipColorConversationKey()
        let backendProfile = nextState.cognition.relationshipChromaticProfile
        let now = Date()
        if backendProfile.hasSignal {
            let existingProfile = relationshipColorProfiles[conversationKey] ?? .empty
            let displayedProfile: AuroraRelationshipColorProfile
            if existingProfile.hasSignal {
                displayedProfile = existingProfile.blended(
                    toward: backendProfile,
                    alpha: resolvedBackendRelationshipBlendAlpha(existing: existingProfile, incoming: backendProfile),
                    at: now
                )
            } else {
                displayedProfile = backendProfile
            }

            if relationshipColorProfiles[conversationKey] != displayedProfile {
                relationshipColorProfiles[conversationKey] = displayedProfile
                persistRelationshipColorProfiles()
            }
            relationshipColorProfile = displayedProfile
            lastRelationshipColorSampleConversationKey = conversationKey
            let backendUpdatedAt = parseAuroraDate(backendProfile.lastUpdatedAt)
            lastRelationshipColorSampleAt = backendUpdatedAt == .distantPast ? now : backendUpdatedAt
            return
        }

        guard let sample = AuroraRelationshipColorSample.from(state: nextState) else {
            return
        }

        if conversationKey == lastRelationshipColorSampleConversationKey,
           let lastRelationshipColorSampleAt,
           now.timeIntervalSince(lastRelationshipColorSampleAt) < sample.sampleInterval {
            return
        }

        let existingProfile = relationshipColorProfiles[conversationKey] ?? .empty
        let blendAlpha = resolvedRelationshipColorBlendAlpha(existing: existingProfile, sample: sample)
        let updatedProfile = existingProfile.updated(with: sample, alpha: blendAlpha, at: now)
        relationshipColorProfiles[conversationKey] = updatedProfile
        relationshipColorProfile = updatedProfile
        lastRelationshipColorSampleConversationKey = conversationKey
        lastRelationshipColorSampleAt = now
        persistRelationshipColorProfiles()
    }

    private func resolvedRelationshipColorBlendAlpha(
        existing: AuroraRelationshipColorProfile,
        sample: AuroraRelationshipColorSample
    ) -> Double {
        var alpha = 0.1 + sample.freshness * 0.12 + sample.confidence * 0.14 + sample.energy * 0.08

        if existing.dominantFamily == sample.dominantFamily {
            alpha += 0.03
        } else if let dominantFamily = existing.dominantFamily {
            let previousDominantWeight = existing.normalizedWeights[dominantFamily] ?? 0
            let incomingDominantWeight = sample.weights[sample.dominantFamily] ?? 0
            if incomingDominantWeight > previousDominantWeight + 0.05 {
                alpha += 0.1
            } else if incomingDominantWeight > previousDominantWeight + 0.02 {
                alpha += 0.05
            }
        }

        return clamp(alpha, min: 0.1, max: 0.3)
    }

    private func resolvedBackendRelationshipBlendAlpha(
        existing: AuroraRelationshipColorProfile,
        incoming: AuroraRelationshipColorProfile
    ) -> Double {
        guard existing.hasSignal else {
            return 1
        }

        let existingWeights = existing.normalizedWeights
        let incomingWeights = incoming.normalizedWeights
        let existingDominant = existing.dominantFamily
        let incomingDominant = incoming.dominantFamily

        var alpha = 0.14
        if incoming.source == "conversation" {
            alpha += 0.12
        } else if incoming.source == "heartbeat" {
            alpha += 0.05
        }

        if existingDominant == incomingDominant {
            alpha += 0.05
        } else if let incomingDominant {
            let existingWeight = existingWeights[incomingDominant] ?? 0
            let incomingWeight = incomingWeights[incomingDominant] ?? 0
            if incomingWeight > existingWeight + 0.05 {
                alpha += 0.12
            } else if incomingWeight > existingWeight + 0.02 {
                alpha += 0.06
            }
        }

        if incoming.sampleCount > existing.sampleCount {
            alpha += 0.04
        }

        return clamp(alpha, min: 0.14, max: incoming.source == "conversation" ? 0.42 : 0.34)
    }

    private func persistRelationshipColorProfiles() {
        Self.persistRelationshipColorProfiles(relationshipColorProfiles)
    }

    private func persistConversationColorResidueProfiles() {
        Self.persistConversationColorResidueProfiles(conversationColorResidueProfiles)
    }

    private static func loadRelationshipColorProfiles(from defaults: UserDefaults) -> [String: AuroraRelationshipColorProfile] {
        guard let data = defaults.data(forKey: auroraRelationshipColorProfilesStorageKey) else {
            return [:]
        }

        let decoder = JSONDecoder()
        if let payload = try? decoder.decode(AuroraRelationshipColorProfileStore.self, from: data) {
            return payload.profiles
        }

        if let legacyProfiles = try? decoder.decode([String: AuroraRelationshipColorProfile].self, from: data) {
            return legacyProfiles
        }

        return [:]
    }

    private static func loadConversationColorResidueProfiles(from defaults: UserDefaults) -> [String: AuroraRelationshipColorProfile] {
        guard let data = defaults.data(forKey: auroraConversationColorResidueProfilesStorageKey) else {
            return [:]
        }

        let decoder = JSONDecoder()
        if let payload = try? decoder.decode(AuroraRelationshipColorProfileStore.self, from: data) {
            return payload.profiles
        }

        if let legacyProfiles = try? decoder.decode([String: AuroraRelationshipColorProfile].self, from: data) {
            return legacyProfiles
        }

        return [:]
    }

    private static func persistRelationshipColorProfiles(_ profiles: [String: AuroraRelationshipColorProfile]) {
        let defaults = UserDefaults.standard
        let encoder = JSONEncoder()
        let sortedProfiles = profiles.sorted {
            parseAuroraDate($0.value.lastUpdatedAt) > parseAuroraDate($1.value.lastUpdatedAt)
        }
        let prunedProfiles = Dictionary(uniqueKeysWithValues: Array(sortedProfiles.prefix(24)))

        guard let encoded = try? encoder.encode(AuroraRelationshipColorProfileStore(version: 1, profiles: prunedProfiles)) else {
            return
        }

        defaults.set(encoded, forKey: auroraRelationshipColorProfilesStorageKey)
    }

    private static func persistConversationColorResidueProfiles(_ profiles: [String: AuroraRelationshipColorProfile]) {
        let defaults = UserDefaults.standard
        let encoder = JSONEncoder()
        let sortedProfiles = profiles.sorted {
            parseAuroraDate($0.value.lastUpdatedAt) > parseAuroraDate($1.value.lastUpdatedAt)
        }
        let prunedProfiles = Dictionary(uniqueKeysWithValues: Array(sortedProfiles.prefix(24)))

        guard let encoded = try? encoder.encode(AuroraRelationshipColorProfileStore(version: 1, profiles: prunedProfiles)) else {
            return
        }

        defaults.set(encoded, forKey: auroraConversationColorResidueProfilesStorageKey)
    }

    private func performRequest<Response: Decodable>(
        path: String,
        method: String = "GET",
        queryItems: [URLQueryItem] = [],
        body: Data? = nil
    ) async throws -> Response {
        guard let apiBaseURL = activeAPIBaseURL,
              let baseRequestURL = URL(string: path, relativeTo: apiBaseURL)?.absoluteURL,
              var components = URLComponents(url: baseRequestURL, resolvingAgainstBaseURL: true) else {
            throw NativeAuroraError.message("Missing native Aurora API configuration.")
        }

        if !queryItems.isEmpty {
            components.queryItems = queryItems.filter { ($0.value ?? "").isEmpty == false }
        }

        guard let requestURL = components.url else {
            throw NativeAuroraError.message("Unable to construct Aurora request URL.")
        }

        var request = URLRequest(url: requestURL)
        request.httpMethod = method
        request.cachePolicy = .reloadIgnoringLocalAndRemoteCacheData
        request.timeoutInterval = auroraNetworkTimeout
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        if let body {
            request.httpBody = body
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }

        let (data, response) = try await session.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw NativeAuroraError.message("Aurora server returned an invalid response.")
        }

        guard (200..<300).contains(httpResponse.statusCode) else {
            let message = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            throw NativeAuroraError.message(
                message.isEmpty ? "Aurora request failed (\(httpResponse.statusCode))." : message
            )
        }

        do {
            return try decoder.decode(Response.self, from: data)
        } catch {
            let rawBody = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            let message = rawBody.isEmpty ? "Failed to decode Aurora response." : rawBody
            throw NativeAuroraError.message(message)
        }
    }

    private func performDirectGatewaySendRequest(
        config: NativeCompanionDirectGatewayConfig,
        prompt: String,
        sessionId: String,
        sessionKey: String,
        previousResponseId: String?,
        onReply: @MainActor @escaping (String) -> Void
    ) async throws -> AuroraSendResponse {
        guard let requestURL = URL(string: "/v1/responses", relativeTo: config.baseURL)?.absoluteURL else {
            throw NativeAuroraError.message("Missing native Aurora gateway configuration.")
        }

        let gatewayRequest = OpenClawResponsesRequest(
            model: config.model,
            input: prompt,
            stream: false,
            previousResponseId: previousResponseId?.hasPrefix("resp_") == true ? previousResponseId : nil
        )

        var request = URLRequest(url: requestURL)
        request.httpMethod = "POST"
        request.cachePolicy = .reloadIgnoringLocalAndRemoteCacheData
        request.timeoutInterval = auroraNetworkTimeout
        request.httpBody = try encoder.encode(gatewayRequest)
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(config.bearerToken)", forHTTPHeaderField: "Authorization")
        request.setValue(sessionKey, forHTTPHeaderField: "x-openclaw-session-key")

        let (data, response) = try await session.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw NativeAuroraError.message("Aurora gateway returned an invalid response.")
        }

        guard (200..<300).contains(httpResponse.statusCode) else {
            let trimmed = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            if let errorEnvelope = try? decoder.decode(OpenClawResponsesErrorEnvelope.self, from: data),
               let message = errorEnvelope.error?.message?.trimmingCharacters(in: .whitespacesAndNewlines),
               !message.isEmpty {
                throw NativeAuroraError.message(message)
            }

            throw NativeAuroraError.message(
                trimmed.isEmpty ? "Aurora request failed (\(httpResponse.statusCode))." : trimmed
            )
        }

        _ = onReply

        let responseEnvelope: OpenClawResponsesResponseEnvelope
        do {
            responseEnvelope = try decoder.decode(OpenClawResponsesResponseEnvelope.self, from: data)
        } catch {
            let rawBody = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            let message = rawBody.isEmpty ? "Failed to decode Aurora gateway response." : rawBody
            throw NativeAuroraError.message(message)
        }

        guard let finalizedResponseId = responseEnvelope.id?.nonEmptyTrimmed else {
            throw NativeAuroraError.message("Aurora gateway returned a response without an id.")
        }

        guard let finalizedReplyText = extractOpenClawResponseText(from: responseEnvelope)?.nonEmptyTrimmed else {
            throw NativeAuroraError.message("Aurora gateway returned a response without a final reply.")
        }

        return AuroraSendResponse(
            id: finalizedResponseId,
            outputText: finalizedReplyText,
            sessionId: sessionId,
            resolvedSessionKey: sessionKey,
            resetPreviousResponseId: false
        )
    }

    private func performStreamingSendRequest(
        path: String,
        body: Data,
        onReply: @MainActor @escaping (String) -> Void
    ) async throws -> AuroraSendResponse {
        guard let apiBaseURL = activeAPIBaseURL,
              let requestURL = URL(string: path, relativeTo: apiBaseURL)?.absoluteURL else {
            throw NativeAuroraError.message("Missing native Aurora API configuration.")
        }

        var request = URLRequest(url: requestURL)
        request.httpMethod = "POST"
        request.cachePolicy = .reloadIgnoringLocalAndRemoteCacheData
        request.timeoutInterval = auroraNetworkTimeout
        request.httpBody = body
        request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let (bytes, response) = try await session.bytes(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw NativeAuroraError.message("Aurora server returned an invalid response.")
        }

        guard (200..<300).contains(httpResponse.statusCode) else {
            var bodyText = ""
            for try await line in bytes.lines {
                bodyText.append(line)
                bodyText.append("\n")
            }

            let trimmed = bodyText.trimmingCharacters(in: .whitespacesAndNewlines)
            throw NativeAuroraError.message(
                trimmed.isEmpty ? "Aurora request failed (\(httpResponse.statusCode))." : trimmed
            )
        }

        var eventName = ""
        var dataLines: [String] = []
        var finalizedResponse: AuroraSendResponse?
        var streamedError: String?

        func consumeEvent() throws {
            guard !eventName.isEmpty, !dataLines.isEmpty else {
                eventName = ""
                dataLines.removeAll(keepingCapacity: true)
                return
            }

            let payloadData = Data(dataLines.joined(separator: "\n").utf8)
            guard let event = AuroraSendStreamEvent(rawValue: eventName) else {
                eventName = ""
                dataLines.removeAll(keepingCapacity: true)
                return
            }

            switch event {
            case .reply:
                let payload = try decoder.decode(AuroraStreamReplyPayload.self, from: payloadData)
                let replyText = payload.text.trimmingCharacters(in: .whitespacesAndNewlines)
                if !replyText.isEmpty {
                    Task { @MainActor in
                        onReply(replyText)
                    }
                }
            case .final:
                finalizedResponse = try decoder.decode(AuroraSendResponse.self, from: payloadData)
            case .error:
                streamedError = (try? decoder.decode(AuroraStreamErrorPayload.self, from: payloadData).error)?
                    .trimmingCharacters(in: .whitespacesAndNewlines)
            }

            eventName = ""
            dataLines.removeAll(keepingCapacity: true)
        }

        for try await line in bytes.lines {
            if line.isEmpty {
                try consumeEvent()
                continue
            }

            if line.hasPrefix("event:") {
                eventName = String(line.dropFirst(6)).trimmingCharacters(in: .whitespaces)
                continue
            }

            if line.hasPrefix("data:") {
                dataLines.append(String(line.dropFirst(5)).trimmingCharacters(in: .whitespaces))
            }
        }

        try consumeEvent()

        if let finalizedResponse {
            return finalizedResponse
        }

        if let streamedError, !streamedError.isEmpty {
            throw NativeAuroraError.message(streamedError)
        }

        throw NativeAuroraError.message("Aurora stream ended before a final reply was received.")
    }
}

private struct AuroraLivingBackground: View {
    let scene: AuroraEmotionScene
    let phase: AuroraPresencePhase
    let intensity: Double
    let motionEnvelope: Double
    let thinkingAuraActive: Bool
    @State private var activationProgress = 0.0
    @State private var thinkingAuraActivation: Double
    @State private var motionStartDate: Date
    @State private var wakeAnimationStarted = false
    @State private var visualSource: AuroraVisualTarget
    @State private var visualTarget: AuroraVisualTarget
    @State private var visualTransitionStartDate: Date
    @State private var visualTransitionDuration: TimeInterval

    init(
        scene: AuroraEmotionScene,
        phase: AuroraPresencePhase,
        intensity: Double,
        motionEnvelope: Double,
        thinkingAuraActive: Bool
    ) {
        self.scene = scene
        self.phase = phase
        self.intensity = intensity
        self.motionEnvelope = motionEnvelope
        self.thinkingAuraActive = thinkingAuraActive

        let now = Date()
        let initialTarget = AuroraVisualTarget(
            scene: AuroraSceneVector(scene),
            intensity: intensity,
            phaseEnergy: Self.resolvedPhaseEnergy(for: phase, motionEnvelope: motionEnvelope)
        )
        _visualSource = State(initialValue: initialTarget)
        _visualTarget = State(initialValue: initialTarget)
        _visualTransitionStartDate = State(initialValue: now)
        _visualTransitionDuration = State(initialValue: 2.2)
        _thinkingAuraActivation = State(initialValue: thinkingAuraActive ? 1 : 0)
        _motionStartDate = State(initialValue: now)
    }

    private var desiredVisualTarget: AuroraVisualTarget {
        AuroraVisualTarget(
            scene: AuroraSceneVector(scene),
            intensity: intensity,
            phaseEnergy: Self.resolvedPhaseEnergy(for: phase, motionEnvelope: motionEnvelope)
        )
    }

    var body: some View {
        TimelineView(.periodic(from: motionStartDate, by: 1.0 / 60.0)) { timeline in
            let currentVisual = interpolatedVisual(at: timeline.date)
            let motionTime = timeline.date.timeIntervalSince(motionStartDate)
            let thinkingAuraProgress =
                thinkingAuraActivation
                * smootherStep(
                    clamp(
                        0.48 + motionEnvelope * 0.42 + currentVisual.phaseEnergy * 0.1 + currentVisual.intensity * 0.08,
                        min: 0,
                        max: 1
                    )
                )

            ZStack {
                AuroraDormantField(scene: currentVisual.scene)
                    .opacity(max(0, 1 - activationProgress))

                AuroraFluidColorField(
                    scene: currentVisual.scene,
                    phaseEnergy: currentVisual.phaseEnergy,
                    intensity: currentVisual.intensity,
                    activationProgress: activationProgress
                )
                .opacity(max(0.001, activationProgress))

                if thinkingAuraProgress > 0.001 {
                    AuroraThinkingEdgeAura(
                        scene: currentVisual.scene,
                        phaseEnergy: currentVisual.phaseEnergy,
                        intensity: currentVisual.intensity,
                        time: motionTime,
                        activeAmount: thinkingAuraProgress
                    )
                    .opacity(max(0, thinkingAuraProgress) * (0.2 + activationProgress * 0.8))
                }
            }
            .ignoresSafeArea()
        }
        .task {
            guard !wakeAnimationStarted else {
                return
            }

            wakeAnimationStarted = true
            try? await Task.sleep(nanoseconds: 180_000_000)
            withAnimation(.timingCurve(0.18, 0.86, 0.2, 1, duration: 1.65)) {
                activationProgress = 1
            }
        }
        .onChange(of: desiredVisualTarget) { nextTarget in
            beginVisualTransition(to: nextTarget)
        }
        .onChange(of: thinkingAuraActive) { nextValue in
            withAnimation(
                .timingCurve(
                    0.16,
                    0.84,
                    0.2,
                    1,
                    duration: nextValue ? 0.24 : 0.12
                )
            ) {
                thinkingAuraActivation = nextValue ? 1 : 0
            }
        }
    }

    private func interpolatedVisual(at date: Date) -> AuroraVisualTarget {
        let progress = smoothedTransitionProgress(at: date)
        return visualSource.interpolated(to: visualTarget, progress: progress)
    }

    private func beginVisualTransition(to nextTarget: AuroraVisualTarget) {
        let now = Date()
        let current = interpolatedVisual(at: now)
        guard current.requiresRetargeting(to: nextTarget) else {
            return
        }
        visualSource = current
        visualTarget = nextTarget
        visualTransitionStartDate = now
        visualTransitionDuration = resolvedVisualTransitionDuration(from: current, to: nextTarget)
    }

    private func smoothedTransitionProgress(at date: Date) -> Double {
        let rawProgress = clamp(date.timeIntervalSince(visualTransitionStartDate) / visualTransitionDuration, min: 0, max: 1)
        return smootherStep(rawProgress)
    }

    private func resolvedVisualTransitionDuration(
        from current: AuroraVisualTarget,
        to next: AuroraVisualTarget
    ) -> TimeInterval {
        let speedDelta = next.scene.speed - current.scene.speed
        let intensityDelta = next.intensity - current.intensity
        let energyDelta = next.phaseEnergy - current.phaseEnergy

        if speedDelta > 0.08 || intensityDelta > 0.12 || energyDelta > 0.12 {
            return 3.5
        }

        if speedDelta < -0.06 || intensityDelta < -0.1 || energyDelta < -0.08 {
            return 4.8
        }

        return 3.05
    }

    private static func resolvedPhaseEnergy(for phase: AuroraPresencePhase, motionEnvelope: Double) -> Double {
        let phaseBoost: Double
        switch phase {
        case .dormant:
            phaseBoost = 0
        case .thinking:
            phaseBoost = 0.22
        case .inhabited:
            phaseBoost = 0.14
        }

        return clamp(phase.visualEnergy + phaseBoost + (motionEnvelope * 0.58), min: 0.5, max: 1.64)
    }
}

private struct AuroraThinkingEdgeAura: View {
    let scene: AuroraSceneVector
    let phaseEnergy: Double
    let intensity: Double
    let time: TimeInterval
    let activeAmount: Double

    var body: some View {
        let presence = smootherStep(clamp(activeAmount, min: 0, max: 1))

        GeometryReader { geometry in
            let size = geometry.size
            let presenceCGFloat = CGFloat(presence)
            let cornerRadius = resolvedScreenCornerRadius(for: size)
            let bandWidth: CGFloat = 3.8 + presenceCGFloat * 0.7 + CGFloat(phaseEnergy) * 0.06
            let glowBandWidth: CGFloat = bandWidth * 1.9
            let primaryRotation = Angle.degrees(time * 7.2)
            let secondaryRotation = Angle.degrees(-time * 4.8 + 118)
            let shimmerRotation = Angle.degrees(time * 3.1 + 244)
            let coreFrames = ribbonFrames(for: size, presence: presence, glow: false)
            let glowFrames = ribbonFrames(for: size, presence: presence, glow: true)
            let bandMask = AuroraScreenEdgeBandShape(cornerRadius: cornerRadius, bandWidth: bandWidth)
                .fill(style: FillStyle(eoFill: true))
            let glowMask = AuroraScreenEdgeBandShape(cornerRadius: cornerRadius, bandWidth: glowBandWidth)
                .fill(style: FillStyle(eoFill: true))

            ZStack {
                Rectangle()
                    .fill(
                        AngularGradient(
                            colors: spectralPalette,
                            center: .center,
                            angle: primaryRotation
                        )
                    )
                    .opacity(0.96)

                Rectangle()
                    .fill(
                        AngularGradient(
                            colors: highlightPalette,
                            center: .center,
                            angle: secondaryRotation
                        )
                    )
                    .blur(radius: 12)
                    .opacity(0.84)

                Rectangle()
                    .fill(
                        AngularGradient(
                            colors: shimmerPalette,
                            center: .center,
                            angle: shimmerRotation
                        )
                    )
                    .blur(radius: 20)
                    .opacity(0.38)

                ZStack {
                    ForEach(coreFrames) { frame in
                        Ellipse()
                            .fill(
                                LinearGradient(
                                    colors: frame.gradientColors,
                                    startPoint: .leading,
                                    endPoint: .trailing
                                )
                            )
                            .frame(width: frame.length, height: frame.thickness)
                            .rotationEffect(frame.angle)
                            .position(frame.center)
                            .blur(radius: frame.blur)
                            .opacity(frame.opacity)
                    }
                }
            }
            .mask(bandMask)
            .overlay {
                ZStack {
                    Rectangle()
                        .fill(
                            AngularGradient(
                                colors: glowPalette,
                                center: .center,
                                angle: secondaryRotation
                            )
                        )
                        .blur(radius: 18)
                        .opacity(0.42)

                    ForEach(glowFrames) { frame in
                        Ellipse()
                            .fill(
                                LinearGradient(
                                    colors: frame.gradientColors,
                                    startPoint: .leading,
                                    endPoint: .trailing
                                )
                            )
                            .frame(width: frame.length, height: frame.thickness)
                            .rotationEffect(frame.angle)
                            .position(frame.center)
                            .blur(radius: frame.blur)
                            .opacity(frame.opacity)
                    }
                }
                .mask(glowMask)
            }
            .blendMode(.plusLighter)
            .compositingGroup()
            .saturation(2.18)
            .brightness(0.13)
            .opacity(0.94 + presence * 0.04)
        }
        .allowsHitTesting(false)
    }

    private func resolvedScreenCornerRadius(for size: CGSize) -> CGFloat {
        let estimated = min(size.width, size.height) * 0.142
        return max(38, min(estimated, 64))
    }

    private func ribbonFrames(for size: CGSize, presence: Double, glow: Bool) -> [AuroraEdgeRibbonFrame] {
        let palette = spectralPaletteBase
        let count = glow ? 14 : 20
        let baseInset: CGFloat = glow ? 7.5 : 11.5
        let lengthBase: CGFloat = glow ? 196 : 158
        let thicknessBase: CGFloat = glow ? 94 : 70
        let blurBase: CGFloat = glow ? 30 : 18
        let opacityBase = glow ? 0.2 : 0.54
        let flowDuration = glow ? 24.0 : 19.0
        let rippleSpeed = glow ? 0.86 : 1.14
        let shimmerSpeed = glow ? 0.42 : 0.58

        return (0..<count).map { index in
            let normalizedIndex = Double(index) / Double(count)
            let ripple = sin((time * rippleSpeed) + normalizedIndex * .pi * 2)
            let shimmer = cos((time * shimmerSpeed) - normalizedIndex * .pi * 1.6)
            let flowProgress = normalizedIndex + time / flowDuration
            let localDrift = ripple * 0.010 + shimmer * 0.004
            let progress = positiveUnitProgress(flowProgress + localDrift)
            let sample = roundedRectSample(
                in: size,
                progress: progress,
                inset: baseInset + CGFloat((index % 3)) * 1.2
            )
            let paletteIndex = (index * 2) % palette.count
            let primary = palette[paletteIndex]
            let secondary = palette[(paletteIndex + 1) % palette.count]
            let tertiary = palette[(paletteIndex + 2) % palette.count]
            let presenceBoost = 0.92 + CGFloat(presence) * 0.16
            let tangentRadians = sample.tangent.radians
            let normalAngle = tangentRadians + (.pi / 2)
            let normalOffset = CGFloat(ripple) * (glow ? 3.0 : 1.65) + CGFloat(shimmer) * (glow ? 1.2 : 0.7)
            let shiftedCenter = CGPoint(
                x: sample.point.x + CGFloat(cos(normalAngle)) * normalOffset,
                y: sample.point.y + CGFloat(sin(normalAngle)) * normalOffset
            )
            let lengthScale = 1 + CGFloat(shimmer) * 0.09 + CGFloat(abs(ripple)) * 0.04
            let thicknessScale = 1 + CGFloat(abs(ripple)) * (glow ? 0.09 : 0.06)

            return AuroraEdgeRibbonFrame(
                id: glow ? index + 100 : index,
                center: shiftedCenter,
                angle: sample.tangent,
                length: (lengthBase + CGFloat(index % 4) * 18) * presenceBoost * lengthScale,
                thickness: (thicknessBase + CGFloat(index % 3) * 10) * thicknessScale,
                blur: blurBase + CGFloat(index % 2) * 4 + CGFloat(abs(shimmer)) * (glow ? 4.0 : 2.4),
                opacity: opacityBase + Double(index % 4) * 0.035 + presence * (glow ? 0.04 : 0.08) + abs(ripple) * (glow ? 0.05 : 0.08),
                gradientColors: [
                    primary.opacity(glow ? 0.08 : 0.02),
                    primary.opacity(glow ? 0.54 : 0.84),
                    secondary.opacity(glow ? 0.62 : 0.97),
                    tertiary.opacity(glow ? 0.3 : 0.58),
                    tertiary.opacity(0.02)
                ]
            )
        }
    }

    private func roundedRectSample(
        in size: CGSize,
        progress: Double,
        inset: CGFloat
    ) -> AuroraEdgePathSample {
        let rect = CGRect(
            x: inset,
            y: inset,
            width: max(1, size.width - inset * 2),
            height: max(1, size.height - inset * 2)
        )
        let radius = max(0, min(resolvedScreenCornerRadius(for: size) - inset, min(rect.width, rect.height) * 0.5))
        let topLength = max(0, rect.width - radius * 2)
        let sideLength = max(0, rect.height - radius * 2)
        let arcLength = radius * .pi * 0.5
        let totalLength = (topLength + sideLength) * 2 + arcLength * 4

        guard totalLength > 0 else {
            return AuroraEdgePathSample(point: CGPoint(x: rect.midX, y: rect.minY), tangent: .degrees(0))
        }

        var distance = positiveUnitProgress(progress) * totalLength

        if distance <= topLength {
            return AuroraEdgePathSample(
                point: CGPoint(x: rect.minX + radius + distance, y: rect.minY),
                tangent: .degrees(0)
            )
        }
        distance -= topLength

        if distance <= arcLength, radius > 0 {
            let theta = (-Double.pi / 2) + (distance / radius)
            let center = CGPoint(x: rect.maxX - radius, y: rect.minY + radius)
            return AuroraEdgePathSample(
                point: CGPoint(
                    x: center.x + CGFloat(cos(theta)) * radius,
                    y: center.y + CGFloat(sin(theta)) * radius
                ),
                tangent: .radians(theta + .pi / 2)
            )
        }
        distance -= arcLength

        if distance <= sideLength {
            return AuroraEdgePathSample(
                point: CGPoint(x: rect.maxX, y: rect.minY + radius + distance),
                tangent: .degrees(90)
            )
        }
        distance -= sideLength

        if distance <= arcLength, radius > 0 {
            let theta = distance / radius
            let center = CGPoint(x: rect.maxX - radius, y: rect.maxY - radius)
            return AuroraEdgePathSample(
                point: CGPoint(
                    x: center.x + CGFloat(cos(theta)) * radius,
                    y: center.y + CGFloat(sin(theta)) * radius
                ),
                tangent: .radians(theta + .pi / 2)
            )
        }
        distance -= arcLength

        if distance <= topLength {
            return AuroraEdgePathSample(
                point: CGPoint(x: rect.maxX - radius - distance, y: rect.maxY),
                tangent: .degrees(180)
            )
        }
        distance -= topLength

        if distance <= arcLength, radius > 0 {
            let theta = (Double.pi / 2) + (distance / radius)
            let center = CGPoint(x: rect.minX + radius, y: rect.maxY - radius)
            return AuroraEdgePathSample(
                point: CGPoint(
                    x: center.x + CGFloat(cos(theta)) * radius,
                    y: center.y + CGFloat(sin(theta)) * radius
                ),
                tangent: .radians(theta + .pi / 2)
            )
        }
        distance -= arcLength

        if distance <= sideLength {
            return AuroraEdgePathSample(
                point: CGPoint(x: rect.minX, y: rect.maxY - radius - distance),
                tangent: .degrees(-90)
            )
        }
        distance -= sideLength

        if radius > 0 {
            let theta = Double.pi + (distance / radius)
            let center = CGPoint(x: rect.minX + radius, y: rect.minY + radius)
            return AuroraEdgePathSample(
                point: CGPoint(
                    x: center.x + CGFloat(cos(theta)) * radius,
                    y: center.y + CGFloat(sin(theta)) * radius
                ),
                tangent: .radians(theta + .pi / 2)
            )
        }

        return AuroraEdgePathSample(
            point: CGPoint(x: rect.minX + radius, y: rect.minY),
            tangent: .degrees(0)
        )
    }

    private func positiveUnitProgress(_ value: Double) -> Double {
        let wrapped = value.truncatingRemainder(dividingBy: 1)
        return wrapped >= 0 ? wrapped : wrapped + 1
    }

    private var spectralPaletteBase: [Color] {
        [
            siriBlue,
            siriCyan,
            siriTeal,
            siriYellow,
            siriGold,
            siriOrange,
            siriPink,
            siriViolet,
            siriIndigo,
            siriBlue
        ]
    }

    private var spectralPalette: [Color] {
        spectralPaletteBase.map { $0.opacity(0.96) }
    }

    private var highlightPalette: [Color] {
        [
            siriIndigo.opacity(0.5),
            siriBlue.opacity(0.85),
            siriCyan.opacity(0.7),
            siriTeal.opacity(0.58),
            siriYellow.opacity(0.5),
            siriPink.opacity(0.74),
            siriViolet.opacity(0.64),
            siriIndigo.opacity(0.5)
        ]
    }

    private var shimmerPalette: [Color] {
        [
            .clear,
            siriBlue.opacity(0.22),
            siriCyan.opacity(0.34),
            siriPink.opacity(0.24),
            siriOrange.opacity(0.2),
            .clear
        ]
    }

    private var glowPalette: [Color] {
        [
            siriBlue.opacity(0.16),
            siriCyan.opacity(0.28),
            siriTeal.opacity(0.2),
            siriOrange.opacity(0.16),
            siriPink.opacity(0.24),
            siriViolet.opacity(0.18),
            siriBlue.opacity(0.16)
        ]
    }

    private struct AuroraEdgeRibbonFrame: Identifiable {
        let id: Int
        let center: CGPoint
        let angle: Angle
        let length: CGFloat
        let thickness: CGFloat
        let blur: CGFloat
        let opacity: Double
        let gradientColors: [Color]
    }

    private struct AuroraEdgePathSample {
        let point: CGPoint
        let tangent: Angle
    }
    
    private var siriBlue: Color { Color(red: 0.14, green: 0.7, blue: 1.0) }
    private var siriCyan: Color { Color(red: 0.18, green: 0.98, blue: 1.0) }
    private var siriTeal: Color { Color(red: 0.04, green: 0.96, blue: 0.78) }
    private var siriGold: Color { Color(red: 1.0, green: 0.88, blue: 0.14) }
    private var siriYellow: Color { Color(red: 1.0, green: 0.95, blue: 0.12) }
    private var siriOrange: Color { Color(red: 1.0, green: 0.48, blue: 0.08) }
    private var siriPink: Color { Color(red: 1.0, green: 0.12, blue: 0.7) }
    private var siriViolet: Color { Color(red: 0.62, green: 0.38, blue: 1.0) }
    private var siriIndigo: Color { Color(red: 0.35, green: 0.42, blue: 1.0) }
}

private struct AuroraScreenEdgeBandShape: Shape {
    let cornerRadius: CGFloat
    let bandWidth: CGFloat

    func path(in rect: CGRect) -> Path {
        let outerRect = rect
        let inset = min(bandWidth, min(rect.width, rect.height) * 0.48)
        let innerRect = rect.insetBy(dx: inset, dy: inset)
        let innerCornerRadius = max(0, cornerRadius - inset)

        var path = Path()
        path.addPath(
            RoundedRectangle(cornerRadius: cornerRadius, style: .continuous).path(in: outerRect)
        )
        path.addPath(
            RoundedRectangle(cornerRadius: innerCornerRadius, style: .continuous).path(in: innerRect)
        )
        return path
    }
}

private struct AuroraDormantField: View {
    let scene: AuroraSceneVector

    var body: some View {
        ZStack {
            Color.black

            RadialGradient(
                colors: [
                    scene.highlight.color.opacity(0.1),
                    scene.primary.color.opacity(0.14),
                    Color.black
                ],
                center: .center,
                startRadius: 14,
                endRadius: 360
            )
        }
    }
}

private struct AuroraPulseGlyph: InsettableShape {
    var insetAmount: CGFloat = 0

    func path(in rect: CGRect) -> Path {
        let drawRect = rect.insetBy(dx: insetAmount, dy: insetAmount)
        guard drawRect.width > 0.001, drawRect.height > 0.001 else {
            return Path()
        }

        let width = drawRect.width
        let height = drawRect.height
        let vertices = [
            CGPoint(x: drawRect.midX, y: drawRect.minY + height * 0.055),
            CGPoint(x: drawRect.maxX - width * 0.09, y: drawRect.maxY - height * 0.108),
            CGPoint(x: drawRect.minX + width * 0.09, y: drawRect.maxY - height * 0.108)
        ]
        let cornerInset = min(width, height) * 0.155
        let corners = vertices.indices.map { corner(at: $0, in: vertices, inset: cornerInset) }
        guard let first = corners.first else {
            return Path()
        }

        var path = Path()
        path.move(to: first.start)

        for index in corners.indices {
            let corner = corners[index]
            let next = corners[(index + 1) % corners.count]
            path.addQuadCurve(to: corner.end, control: corner.vertex)
            path.addLine(to: next.start)
        }

        path.closeSubpath()
        return path
    }

    func inset(by amount: CGFloat) -> some InsettableShape {
        var copy = self
        copy.insetAmount += amount
        return copy
    }

    private func corner(at index: Int, in vertices: [CGPoint], inset: CGFloat) -> RoundedCorner {
        let count = vertices.count
        let vertex = vertices[index]
        let previous = vertices[(index + count - 1) % count]
        let next = vertices[(index + 1) % count]
        let incomingLength = distance(from: vertex, to: previous)
        let outgoingLength = distance(from: vertex, to: next)
        let limitedInset = min(inset, min(incomingLength, outgoingLength) * 0.34)

        return RoundedCorner(
            vertex: vertex,
            start: point(from: vertex, toward: previous, distance: limitedInset),
            end: point(from: vertex, toward: next, distance: limitedInset)
        )
    }

    private func point(from start: CGPoint, toward end: CGPoint, distance: CGFloat) -> CGPoint {
        let dx = end.x - start.x
        let dy = end.y - start.y
        let length = max((dx * dx + dy * dy).squareRoot(), 0.001)
        let progress = distance / length
        return CGPoint(x: start.x + dx * progress, y: start.y + dy * progress)
    }

    private func distance(from start: CGPoint, to end: CGPoint) -> CGFloat {
        let dx = end.x - start.x
        let dy = end.y - start.y
        return (dx * dx + dy * dy).squareRoot()
    }

    private struct RoundedCorner {
        let vertex: CGPoint
        let start: CGPoint
        let end: CGPoint
    }
}

private struct AuroraCenterPulse: View {
    let scene: AuroraSceneVector
    let phaseEnergy: Double
    let time: TimeInterval

    var body: some View {
        let liveliness = clamp((phaseEnergy - 0.5) / 1.0, min: 0, max: 1)
        let respiration = 0.5 + 0.5 * sin(time * (0.24 + phaseEnergy * 0.06) + 0.4)
        let circulation = 0.5 + 0.5 * sin(time * (0.4 + phaseEnergy * 0.1) + 1.9)
        let shimmer = 0.5 + 0.5 * sin(time * (0.72 + phaseEnergy * 0.12) + 0.8)
        let hoverX =
            sin(time * 0.18 + 0.7) * (1.4 + liveliness * 1.6)
            + sin(time * 0.49 + 2.1) * (0.44 + liveliness * 0.4)
        let hoverY =
            cos(time * 0.15 + 1.2) * (1.9 + liveliness * 2.2)
            + sin(time * 0.34 + 0.9) * (0.62 + liveliness * 0.46)
        let driftX = hoverX * 0.24
        let driftY = hoverY * 0.24
        let auraDriftX = hoverX * 0.58
        let auraDriftY = hoverY * 0.58
        let tilt = sin(time * 0.14 + 1.1) * (1.4 + liveliness * 1.4) + sin(time * 0.42 + 0.3) * 0.34
        let coreDiameter = 126 + respiration * (4.2 + phaseEnergy * 4.8) + circulation * (1.8 + liveliness * 2.6) + liveliness * 8.5
        let ringDiameter = coreDiameter + 24 + circulation * (7 + liveliness * 4.8)
        let auraDiameter = coreDiameter * (1.58 + liveliness * 0.1) + shimmer * (4.5 + liveliness * 3.8)
        let logoWidthMultiplier = 1.18
        let coreScale = 0.994 + respiration * 0.012 + liveliness * 0.014
        let shellScale = 0.988 + circulation * 0.026 + liveliness * 0.018
        let auraScale = 0.98 + respiration * 0.04 + liveliness * 0.022
        let auraBlur = 16 + liveliness * 8 + shimmer * 4

        return ZStack {
            AuroraPulseGlyph()
                .fill(
                    RadialGradient(
                        colors: [
                            scene.highlight.color.opacity(0.18 + respiration * 0.09 + liveliness * 0.08),
                            scene.secondary.color.opacity(0.16 + liveliness * 0.06),
                            scene.primary.color.opacity(0.08 + liveliness * 0.03),
                            .clear
                        ],
                        center: .center,
                        startRadius: 2,
                        endRadius: auraDiameter * 0.44
                    )
                )
                .frame(width: auraDiameter * logoWidthMultiplier, height: auraDiameter)
                .scaleEffect(auraScale)
                .offset(x: auraDriftX, y: auraDriftY)
                .blur(radius: auraBlur)

            AuroraPulseGlyph()
                .stroke(
                    scene.highlight.color.opacity(0.18 + shimmer * 0.1 + liveliness * 0.06),
                    lineWidth: 1.5 + liveliness * 0.5
                )
                .frame(width: ringDiameter * logoWidthMultiplier, height: ringDiameter)
                .scaleEffect(shellScale)
                .offset(x: driftX, y: driftY)
                .rotationEffect(.degrees(tilt * 0.42))
                .blur(radius: 1.8)

            AuroraPulseGlyph()
                .stroke(
                    scene.secondary.color.opacity(0.11 + circulation * 0.08 + liveliness * 0.05),
                    lineWidth: 1
                )
                .frame(
                    width: (ringDiameter + 24) * logoWidthMultiplier,
                    height: ringDiameter + 24
                )
                .offset(x: -driftX * 0.58, y: -driftY * 0.52)
                .rotationEffect(.degrees(-tilt * 0.24))
                .blur(radius: 4.8)

            AuroraPulseGlyph()
                .fill(
                    LinearGradient(
                        colors: [
                            scene.highlight.color.opacity(0.15 + respiration * 0.05 + liveliness * 0.04),
                            scene.secondary.color.opacity(0.12 + shimmer * 0.05 + liveliness * 0.04),
                            scene.tertiary.color.opacity(0.08 + liveliness * 0.03)
                        ],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .frame(width: coreDiameter * logoWidthMultiplier, height: coreDiameter)
                .scaleEffect(coreScale)
                .offset(x: -driftX * 0.2, y: -driftY * 0.22)
                .rotationEffect(.degrees(tilt * 0.16))
                .blur(radius: phaseEnergy > 1.1 ? 8.5 : 11.5)
        }
        .compositingGroup()
        .scaleEffect(0.994 + liveliness * 0.02 + respiration * 0.01)
        .rotationEffect(.degrees(tilt))
        .offset(x: hoverX, y: hoverY)
        .shadow(color: scene.highlight.color.opacity(0.08 + liveliness * 0.08), radius: 30 + liveliness * 18)
        .opacity(0.86 + liveliness * 0.14)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .allowsHitTesting(false)
    }
}

private struct AuroraFluidColorField: View {
    let scene: AuroraSceneVector
    let phaseEnergy: Double
    let intensity: Double
    let activationProgress: Double

    var body: some View {
        Canvas(opaque: true, colorMode: .linear, rendersAsynchronously: true) { context, size in
            let rect = CGRect(origin: .zero, size: size)
            let liveliness = clamp((phaseEnergy - 0.52) / 0.94, min: 0, max: 1)
            let activationBlend = clamp(0.7 + activationProgress * 0.3 + intensity * 0.08, min: 0.72, max: 1)
            let diagonalLift = 0.08 + liveliness * 0.06

            context.fill(
                Path(rect),
                with: .linearGradient(
                    Gradient(stops: [
                        .init(color: scene.primary.color.opacity(0.985 * activationBlend), location: 0),
                        .init(color: scene.primary.color.opacity(0.968 * activationBlend), location: 0.24),
                        .init(color: scene.secondary.color.opacity(0.974 * activationBlend), location: 0.58),
                        .init(color: scene.tertiary.color.opacity(0.952 * activationBlend), location: 1)
                    ]),
                    startPoint: CGPoint(x: size.width * 0.16, y: 0),
                    endPoint: CGPoint(x: size.width * 0.84, y: size.height)
                )
            )

            context.fill(
                Path(rect),
                with: .linearGradient(
                    Gradient(colors: [
                        scene.highlight.color.opacity(diagonalLift),
                        scene.secondary.color.opacity(0.04 + activationProgress * 0.03),
                        .clear
                    ]),
                    startPoint: CGPoint(x: size.width * 0.08, y: size.height * 0.06),
                    endPoint: CGPoint(x: size.width * 0.62, y: size.height * 0.42)
                )
            )

            context.fill(
                Path(rect),
                with: .linearGradient(
                    Gradient(colors: [
                        scene.tertiary.color.opacity(0.09),
                        .clear,
                        scene.primary.color.opacity(0.07)
                    ]),
                    startPoint: CGPoint(x: 0, y: 0),
                    endPoint: CGPoint(x: 0, y: size.height)
                )
            )
        }
    }
}

private struct AuroraVisualTarget: Equatable {
    let scene: AuroraSceneVector
    let intensity: Double
    let phaseEnergy: Double

    func interpolated(to target: AuroraVisualTarget, progress: Double) -> AuroraVisualTarget {
        AuroraVisualTarget(
            scene: scene.interpolated(to: target.scene, progress: progress),
            intensity: intensity + ((target.intensity - intensity) * progress),
            phaseEnergy: phaseEnergy + ((target.phaseEnergy - phaseEnergy) * progress)
        )
    }

    func requiresRetargeting(to target: AuroraVisualTarget) -> Bool {
        scene.colorDistance(to: target.scene) > 0.03 ||
            scene.motionDistance(to: target.scene) > 0.034 ||
            abs(intensity - target.intensity) > 0.045 ||
            abs(phaseEnergy - target.phaseEnergy) > 0.055
    }
}

private struct AuroraSceneVector: Equatable {
    let primary: AuroraColorVector
    let secondary: AuroraColorVector
    let tertiary: AuroraColorVector
    let highlight: AuroraColorVector
    let speed: Double
    let amplitude: Double
    let inkOpacity: Double

    init(_ scene: AuroraEmotionScene) {
        primary = AuroraColorVector(scene.primary)
        secondary = AuroraColorVector(scene.secondary)
        tertiary = AuroraColorVector(scene.tertiary)
        highlight = AuroraColorVector(scene.highlight)
        speed = scene.speed
        amplitude = scene.amplitude
        inkOpacity = scene.inkOpacity
    }

    func interpolated(to target: AuroraSceneVector, progress: Double) -> AuroraSceneVector {
        AuroraSceneVector(
            primary: primary.interpolated(to: target.primary, progress: progress),
            secondary: secondary.interpolated(to: target.secondary, progress: progress),
            tertiary: tertiary.interpolated(to: target.tertiary, progress: progress),
            highlight: highlight.interpolated(to: target.highlight, progress: progress),
            speed: speed + ((target.speed - speed) * progress),
            amplitude: amplitude + ((target.amplitude - amplitude) * progress),
            inkOpacity: inkOpacity + ((target.inkOpacity - inkOpacity) * progress)
        )
    }

    func colorDistance(to target: AuroraSceneVector) -> Double {
        max(
            primary.distance(to: target.primary),
            secondary.distance(to: target.secondary),
            tertiary.distance(to: target.tertiary),
            highlight.distance(to: target.highlight)
        )
    }

    func motionDistance(to target: AuroraSceneVector) -> Double {
        max(
            abs(speed - target.speed),
            abs(amplitude - target.amplitude),
            abs(inkOpacity - target.inkOpacity)
        )
    }

    private init(
        primary: AuroraColorVector,
        secondary: AuroraColorVector,
        tertiary: AuroraColorVector,
        highlight: AuroraColorVector,
        speed: Double,
        amplitude: Double,
        inkOpacity: Double
    ) {
        self.primary = primary
        self.secondary = secondary
        self.tertiary = tertiary
        self.highlight = highlight
        self.speed = speed
        self.amplitude = amplitude
        self.inkOpacity = inkOpacity
    }
}

private struct AuroraColorVector: Equatable {
    let red: Double
    let green: Double
    let blue: Double
    let opacity: Double

    init(_ color: Color) {
        let uiColor = UIColor(color)
        var red = CGFloat.zero
        var green = CGFloat.zero
        var blue = CGFloat.zero
        var alpha = CGFloat.zero

        if uiColor.getRed(&red, green: &green, blue: &blue, alpha: &alpha) {
            self.red = red
            self.green = green
            self.blue = blue
            opacity = alpha
            return
        }

        var white = CGFloat.zero
        uiColor.getWhite(&white, alpha: &alpha)
        self.red = white
        self.green = white
        self.blue = white
        opacity = alpha
    }

    var color: Color {
        Color(.sRGB, red: red, green: green, blue: blue, opacity: opacity)
    }

    func interpolated(to target: AuroraColorVector, progress: Double) -> AuroraColorVector {
        AuroraColorVector(
            red: red + ((target.red - red) * progress),
            green: green + ((target.green - green) * progress),
            blue: blue + ((target.blue - blue) * progress),
            opacity: opacity + ((target.opacity - opacity) * progress)
        )
    }

    func distance(to target: AuroraColorVector) -> Double {
        max(
            abs(red - target.red),
            abs(green - target.green),
            abs(blue - target.blue),
            abs(opacity - target.opacity)
        )
    }

    private init(red: Double, green: Double, blue: Double, opacity: Double) {
        self.red = red
        self.green = green
        self.blue = blue
        self.opacity = opacity
    }
}

private struct AuroraReplyStage: View {
    let reply: AuroraVisibleReply?
    let dismissalSequence: Int
    let scene: AuroraEmotionScene
    let phase: AuroraPresencePhase
    let onCurrentReplyPresentationChange: (Bool) -> Void

    @State private var displayedReply: AuroraVisibleReply?
    @State private var queuedReply: AuroraVisibleReply?
    @State private var dismissingDisplayedReply = false
    @State private var replyDismissalTask: Task<Void, Never>?

    var body: some View {
        GeometryReader { geometry in
            ZStack {
                if let displayedReply {
                    AuroraManifestingText(
                        text: displayedReply.text,
                        scene: scene,
                        availableSize: geometry.size,
                        isDismissing: dismissingDisplayedReply
                    )
                    .id(displayedReply.id)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
                    .zIndex(1)
                } else {
                    Color.clear
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                }
            }
        }
        .onAppear {
            synchronizeDisplayedReply(with: reply)
        }
        .onChange(of: reply) { nextReply in
            synchronizeDisplayedReply(with: nextReply)
        }
        .onChange(of: dismissalSequence) { _ in
            beginDisplayedReplyDismissal()
        }
        .onDisappear {
            replyDismissalTask?.cancel()
            onCurrentReplyPresentationChange(false)
        }
    }

    private func synchronizeDisplayedReply(with nextReply: AuroraVisibleReply?) {
        guard let nextReply else {
            queuedReply = nil
            beginDisplayedReplyDismissal()
            synchronizePresentationState()
            return
        }

        if let displayedReply, displayedReply.id == nextReply.id {
            replyDismissalTask?.cancel()
            queuedReply = nil
            dismissingDisplayedReply = false
            self.displayedReply = nextReply
            synchronizePresentationState()
            return
        }

        guard displayedReply != nextReply else {
            queuedReply = nil
            synchronizePresentationState()
            return
        }

        if displayedReply == nil {
            replyDismissalTask?.cancel()
            queuedReply = nil
            dismissingDisplayedReply = false
            displayedReply = nextReply
            synchronizePresentationState()
            return
        }

        queuedReply = nextReply
        beginDisplayedReplyDismissal()
        synchronizePresentationState()
    }

    private func beginDisplayedReplyDismissal() {
        guard displayedReply != nil else {
            replyDismissalTask?.cancel()
            dismissingDisplayedReply = false
            if let queuedReply {
                displayedReply = queuedReply
                self.queuedReply = nil
            }
            synchronizePresentationState()
            return
        }

        guard !dismissingDisplayedReply else {
            synchronizePresentationState()
            return
        }

        replyDismissalTask?.cancel()
        dismissingDisplayedReply = true
        synchronizePresentationState()
        replyDismissalTask = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 920_000_000)
            guard !Task.isCancelled else {
                return
            }

            let nextReply = queuedReply
            queuedReply = nil
            displayedReply = nextReply
            dismissingDisplayedReply = false
            synchronizePresentationState()
        }
    }

    private func synchronizePresentationState() {
        let isCurrentReplyPresented: Bool
        if let reply {
            isCurrentReplyPresented = displayedReply?.id == reply.id && !dismissingDisplayedReply
        } else {
            isCurrentReplyPresented = false
        }

        onCurrentReplyPresentationChange(isCurrentReplyPresented)
    }
}

private struct AuroraManifestingText: View {
    let text: String
    let scene: AuroraEmotionScene
    let availableSize: CGSize
    let isDismissing: Bool

    @State private var revealProgress = 0.0

    private var styledReply: AuroraStyledReply {
        AuroraStyledReply(text)
    }

    private var layout: AuroraManifestLayout {
        AuroraManifestLayout.bestFit(
            for: styledReply.plainText,
            availableSize: availableSize
        )
    }

    var body: some View {
        ZStack {
            manifestText
                .opacity(0.78 + revealProgress * 0.22)

            manifestText
                .foregroundStyle(scene.highlight.opacity(0.72))
                .mask(
                    LinearGradient(
                        stops: [
                            .init(color: .clear, location: 0),
                            .init(color: .white.opacity(0.32 + revealProgress * 0.36), location: 0.28 + (1 - revealProgress) * 0.14),
                            .init(color: .white, location: 1)
                        ],
                        startPoint: .bottom,
                        endPoint: .top
                    )
                )
                .blendMode(.screen)
                .blur(radius: (1 - revealProgress) * 12)
                .opacity((1 - revealProgress) * 0.88)
        }
        .compositingGroup()
        .shadow(
            color: scene.textShadow.opacity(0.16 + (1 - revealProgress) * 0.18),
            radius: 14 + (1 - revealProgress) * 12,
            y: 8 + (1 - revealProgress) * 8
        )
        .scaleEffect(x: 0.99 + revealProgress * 0.01, y: 0.88 + revealProgress * 0.12, anchor: .center)
        .offset(y: (1 - revealProgress) * 22)
        .blur(radius: (1 - revealProgress) * 10)
        .opacity(0.16 + revealProgress * 0.84)
        .onAppear {
            revealText()
        }
        .onChange(of: isDismissing) { dismissing in
            if dismissing {
                dissipateText()
            } else {
                revealText()
            }
        }
    }

    private var manifestText: some View {
        styledReply.text()
            .font(.system(size: layout.fontSize, weight: .regular, design: .default))
            .tracking(-0.28)
            .lineSpacing(layout.lineSpacing)
            .multilineTextAlignment(.center)
            .lineLimit(nil)
            .fixedSize(horizontal: false, vertical: true)
            .allowsTightening(true)
            .minimumScaleFactor(0.72)
            .foregroundStyle(
                LinearGradient(
                    colors: [
                        scene.textPrimary,
                        scene.textAccent
                    ],
                    startPoint: .top,
                    endPoint: .bottom
                )
            )
            .frame(maxWidth: layout.width)
            .padding(.horizontal, 8)
            .padding(.vertical, 10)
    }

    private func revealText() {
        revealProgress = 0
        withAnimation(.timingCurve(0.18, 0.88, 0.22, 1, duration: 0.92)) {
            revealProgress = 1
        }
    }

    private func dissipateText() {
        withAnimation(.timingCurve(0.18, 0.88, 0.22, 1, duration: 0.92)) {
            revealProgress = 0
        }
    }
}

private struct AuroraStyledReply {
    private let segments: [AuroraStyledReplySegment]
    let plainText: String

    init(_ raw: String) {
        let parsed = Self.parse(raw)
        segments = parsed.segments
        plainText = parsed.plainText
    }

    func text() -> Text {
        guard !segments.isEmpty else {
            return Text("")
        }

        return segments.reduce(Text(""), { partial, segment in
            partial + segment.text
        })
    }

    private static func parse(_ raw: String) -> (segments: [AuroraStyledReplySegment], plainText: String) {
        guard !raw.isEmpty else {
            return ([], "")
        }

        var segments: [AuroraStyledReplySegment] = []
        var buffer = ""
        var plainText = ""
        var index = raw.startIndex

        func flushRegularBuffer() {
            guard !buffer.isEmpty else {
                return
            }

            segments.append(AuroraStyledReplySegment(content: buffer, style: .regular))
            plainText.append(buffer)
            buffer.removeAll(keepingCapacity: true)
        }

        while index < raw.endIndex {
            if raw[index...].hasPrefix("**"),
               let closing = raw[index...].dropFirst(2).range(of: "**"),
               closing.lowerBound > raw.index(index, offsetBy: 2) {
                flushRegularBuffer()
                let contentStart = raw.index(index, offsetBy: 2)
                let content = String(raw[contentStart..<closing.lowerBound])
                segments.append(AuroraStyledReplySegment(content: content, style: .strong))
                plainText.append(content)
                index = closing.upperBound
                continue
            }

            if raw[index] == "*",
               let closing = raw[raw.index(after: index)...].firstIndex(of: "*"),
               closing > raw.index(after: index) {
                flushRegularBuffer()
                let contentStart = raw.index(after: index)
                let content = String(raw[contentStart..<closing])
                segments.append(AuroraStyledReplySegment(content: content, style: .emphasis))
                plainText.append(content)
                index = raw.index(after: closing)
                continue
            }

            buffer.append(raw[index])
            index = raw.index(after: index)
        }

        flushRegularBuffer()
        return (segments, plainText)
    }
}

private struct AuroraStyledReplySegment {
    enum Style {
        case regular
        case emphasis
        case strong
    }

    let content: String
    let style: Style

    var text: Text {
        switch style {
        case .regular:
            return Text(content)
        case .emphasis:
            return Text(content).italic()
        case .strong:
            return Text(content).bold()
        }
    }
}

private struct AuroraManifestLayout {
    let fontSize: CGFloat
    let lineSpacing: CGFloat
    let width: CGFloat

    static func bestFit(for text: String, availableSize: CGSize) -> AuroraManifestLayout {
        let widthLimit = min(max(availableSize.width - 20, 220), 560)
        let heightLimit = max(availableSize.height - 24, 140)
        let maximumFont = preferredFontSize(for: text)
        let minimumFont: CGFloat = text.count > 460 ? 16 : 18

        var lowerBound = minimumFont
        var upperBound = maximumFont
        var bestFit = minimumFont

        for _ in 0..<11 {
            let candidate = (lowerBound + upperBound) * 0.5
            if fitsText(text, at: candidate, width: widthLimit, height: heightLimit) {
                bestFit = candidate
                lowerBound = candidate
            } else {
                upperBound = candidate
            }
        }

        return AuroraManifestLayout(
            fontSize: bestFit,
            lineSpacing: lineSpacing(for: bestFit),
            width: widthLimit
        )
    }

    private static func preferredFontSize(for text: String) -> CGFloat {
        switch text.count {
        case 0...48:
            return 38
        case 49...120:
            return 34
        case 121...220:
            return 30
        default:
            return 27
        }
    }

    private static func lineSpacing(for fontSize: CGFloat) -> CGFloat {
        max(4, fontSize * 0.18)
    }

    private static func fitsText(_ text: String, at fontSize: CGFloat, width: CGFloat, height: CGFloat) -> Bool {
        let paragraphStyle = NSMutableParagraphStyle()
        paragraphStyle.alignment = .center
        paragraphStyle.lineBreakMode = .byWordWrapping
        paragraphStyle.lineSpacing = lineSpacing(for: fontSize)

        let boundingRect = (text as NSString).boundingRect(
            with: CGSize(width: width, height: .greatestFiniteMagnitude),
            options: [.usesLineFragmentOrigin, .usesFontLeading],
            attributes: [
                .font: UIFont.systemFont(ofSize: fontSize, weight: .medium),
                .paragraphStyle: paragraphStyle
            ],
            context: nil
        )

        return ceil(boundingRect.height) <= height * 0.96
    }
}

private struct AuroraArchiveOverlay: View {
    let state: AuroraStateSnapshot
    let messages: [AuroraHistoryMessage]
    let files: [AuroraInternalFile]
    let selectedPane: AuroraArchivePane
    let loading: Bool
    let errorMessage: String
    let scene: AuroraEmotionScene
    let onSelectPane: (AuroraArchivePane) -> Void
    let onRefresh: () -> Void
    let onClose: () -> Void

    var body: some View {
        GeometryReader { geometry in
            ZStack(alignment: .trailing) {
                Color.black.opacity(0.32)
                    .ignoresSafeArea()
                    .onTapGesture {
                        onClose()
                    }

                VStack(alignment: .leading, spacing: 18) {
                    HStack(spacing: 12) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Continuity")
                                .font(.system(size: 26, weight: .semibold, design: .serif))
                                .foregroundStyle(Color.white.opacity(0.96))

                            Text("Presence first. Memory, history, and internals when you need them.")
                                .font(.system(size: 13, weight: .medium))
                                .foregroundStyle(Color.white.opacity(0.56))
                        }

                        Spacer(minLength: 0)

                        AuroraOverlayActionButton(title: "Refresh", scene: scene, action: onRefresh)
                        AuroraOverlayActionButton(title: "Done", scene: scene, action: onClose)
                    }

                    HStack(spacing: 10) {
                        ForEach(AuroraArchivePane.allCases) { pane in
                            Button {
                                onSelectPane(pane)
                            } label: {
                                Text(pane.title)
                                    .font(.system(size: 14, weight: .semibold))
                                    .foregroundStyle(Color.white.opacity(selectedPane == pane ? 0.96 : 0.64))
                                    .padding(.horizontal, 16)
                                    .padding(.vertical, 11)
                                    .frame(maxWidth: .infinity)
                            }
                            .buttonStyle(.plain)
                            .auroraPanelSurface(
                                cornerRadius: 18,
                                tint: selectedPane == pane ? scene.highlight.opacity(0.18) : Color.white.opacity(0.06),
                                interactive: true
                            )
                        }
                    }

                    if !errorMessage.isEmpty {
                        Text(errorMessage)
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(Color(red: 1, green: 0.66, blue: 0.7))
                    }

                    if loading {
                        HStack(spacing: 10) {
                            ProgressView()
                                .tint(Color.white.opacity(0.9))

                            Text("Refreshing continuity surfaces…")
                                .font(.system(size: 14, weight: .medium))
                                .foregroundStyle(Color.white.opacity(0.62))
                        }
                    }

                    ScrollView(showsIndicators: false) {
                        VStack(spacing: 14) {
                            switch selectedPane {
                            case .memory:
                                AuroraMemoryPane(state: state, scene: scene)
                            case .history:
                                AuroraHistoryPane(messages: messages, scene: scene)
                            case .files:
                                AuroraFilesPane(files: files, scene: scene)
                            }
                        }
                        .padding(.bottom, 12)
                    }
                }
                .padding(22)
                .frame(
                    width: min(geometry.size.width * 0.88, 440),
                    height: geometry.size.height - 18,
                    alignment: .topLeading
                )
                .auroraPanelSurface(
                    cornerRadius: 34,
                    tint: scene.highlight.opacity(0.12),
                    interactive: true
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 34, style: .continuous)
                        .stroke(scene.highlight.opacity(0.12), lineWidth: 1)
                )
                .shadow(color: scene.highlight.opacity(0.12), radius: 28, y: 14)
                .padding(.vertical, 9)
                .padding(.trailing, 9)
            }
        }
    }
}

private struct AuroraMemoryPane: View {
    let state: AuroraStateSnapshot
    let scene: AuroraEmotionScene

    var body: some View {
        VStack(spacing: 14) {
            AuroraArchiveCard(title: "Presence", scene: scene) {
                VStack(alignment: .leading, spacing: 10) {
                    AuroraMetadataLine(label: "Emotion", value: state.cognition.emotion.label.nonEmptyTrimmed ?? "Dormant")
                    AuroraMetadataLine(label: "Focus", value: state.cognition.workspace.focus.nonEmptyTrimmed ?? state.cognition.attention.currentFocus.nonEmptyTrimmed ?? "No active focus")
                    AuroraMetadataLine(label: "Mode", value: state.cognition.interaction.currentMode.nonEmptyTrimmed ?? "Idle")
                    AuroraMetadataLine(label: "Reason", value: state.cognition.interaction.currentReason.nonEmptyTrimmed ?? "No active conversational pressure")
                    AuroraMetadataLine(label: "Need", value: state.cognition.homeostatic.dominantNeed.nonEmptyTrimmed ?? "Unspecified")

                    if let lexicon = state.cognition.emotionLexicon.summary.nonEmptyTrimmed {
                        Text(lexicon)
                            .font(.system(size: 14, weight: .medium))
                            .foregroundStyle(Color.white.opacity(0.68))
                    }
                }
            }

            AuroraArchiveCard(title: "Heartbeat", scene: scene) {
                VStack(alignment: .leading, spacing: 10) {
                    AuroraMetadataLine(label: "Last pulse", value: formatAuroraRelativeDate(state.lastHeartbeat.timestamp) ?? "No heartbeat yet")
                    AuroraParagraph(label: "What Aurora did", value: state.lastHeartbeat.whatIDid.nonEmptyTrimmed ?? "No heartbeat yet.")
                    AuroraParagraph(label: "What Aurora learned", value: state.lastHeartbeat.whatILearned.nonEmptyTrimmed ?? "Nothing surfaced yet.")
                    AuroraParagraph(label: "What Aurora is curious about", value: state.lastHeartbeat.whatImCuriousAbout.nonEmptyTrimmed ?? "Curiosity is quiet.")

                    if let ambient = state.lastHeartbeat.ambientState.nonEmptyTrimmed {
                        AuroraParagraph(label: "Ambient state", value: ambient)
                    }

                    if let shift = state.lastHeartbeat.stateShift.nonEmptyTrimmed {
                        AuroraParagraph(label: "State shift", value: shift)
                    }

                    if let loop = state.lastHeartbeat.openLoop.nonEmptyTrimmed {
                        AuroraParagraph(label: "Open loop", value: loop)
                    }
                }
            }

            AuroraArchiveCard(title: "Memory Updates", scene: scene) {
                if state.lastHeartbeat.memoryUpdates.isEmpty {
                    Text("No new memory updates were surfaced in the last heartbeat.")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(Color.white.opacity(0.6))
                        .frame(maxWidth: .infinity, alignment: .leading)
                } else {
                    VStack(alignment: .leading, spacing: 9) {
                        ForEach(Array(state.lastHeartbeat.memoryUpdates.enumerated()), id: \.offset) { _, item in
                            Text(item)
                                .font(.system(size: 14, weight: .medium))
                                .foregroundStyle(Color.white.opacity(0.78))
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }
                }
            }

            AuroraArchiveCard(title: "Working Memory", scene: scene) {
                if state.cognition.memory.workingItems.isEmpty {
                    Text("Working memory is quiet right now.")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(Color.white.opacity(0.6))
                        .frame(maxWidth: .infinity, alignment: .leading)
                } else {
                    VStack(alignment: .leading, spacing: 10) {
                        ForEach(state.cognition.memory.workingItems) { item in
                            VStack(alignment: .leading, spacing: 5) {
                                Text(item.summary.nonEmptyTrimmed ?? item.kind.capitalized)
                                    .font(.system(size: 14, weight: .semibold))
                                    .foregroundStyle(Color.white.opacity(0.86))

                                Text("\(item.kind.capitalized) · salience \(formatCompactScore(item.salience)) · weight \(formatCompactScore(item.emotionalWeight))")
                                    .font(.system(size: 12, weight: .medium))
                                    .foregroundStyle(Color.white.opacity(0.48))
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }
                }
            }

            AuroraArchiveCard(title: "Narrative", scene: scene) {
                VStack(alignment: .leading, spacing: 10) {
                    AuroraParagraph(label: "Micro", value: state.cognition.memory.microNarrative.nonEmptyTrimmed ?? "No micro narrative available.")
                    AuroraParagraph(label: "Meso", value: state.cognition.memory.mesoNarrative.nonEmptyTrimmed ?? "No meso narrative available.")
                    AuroraParagraph(label: "Macro", value: state.cognition.memory.macroNarrative.nonEmptyTrimmed ?? "No macro narrative available.")
                }
            }
        }
    }
}

private struct AuroraHistoryPane: View {
    let messages: [AuroraHistoryMessage]
    let scene: AuroraEmotionScene

    var body: some View {
        if messages.isEmpty {
            AuroraArchiveCard(title: "Conversation", scene: scene) {
                Text("No visible conversation history yet.")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(Color.white.opacity(0.6))
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        } else {
            VStack(spacing: 12) {
                ForEach(Array(messages.reversed())) { message in
                    AuroraArchiveCard(title: message.role.title, scene: scene) {
                        VStack(alignment: .leading, spacing: 8) {
                            Text(formatAuroraTimestamp(message.createdAt))
                                .font(.system(size: 12, weight: .medium))
                                .foregroundStyle(Color.white.opacity(0.45))

                            AuroraStyledReply(message.text).text()
                                .font(.system(size: 15, weight: message.role == .aurora ? .medium : .regular, design: message.role == .aurora ? .serif : .default))
                                .lineSpacing(5)
                                .foregroundStyle(Color.white.opacity(0.84))
                                .textSelection(.enabled)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }
                }
            }
        }
    }
}

private struct AuroraFilesPane: View {
    let files: [AuroraInternalFile]
    let scene: AuroraEmotionScene

    @State private var expandedFileID: String?

    var body: some View {
        if files.isEmpty {
            AuroraArchiveCard(title: "Internal Files", scene: scene) {
                Text("No file surfaces are available yet.")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(Color.white.opacity(0.6))
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        } else {
            VStack(spacing: 12) {
                ForEach(files) { file in
                    Button {
                        withAnimation(.easeOut(duration: 0.24)) {
                            expandedFileID = expandedFileID == file.id ? nil : file.id
                        }
                    } label: {
                        AuroraArchiveCard(title: file.title, scene: scene) {
                            VStack(alignment: .leading, spacing: 8) {
                                AuroraMetadataLine(label: "Group", value: humanReadableFileGroup(file.group))
                                AuroraMetadataLine(label: "Path", value: file.path)
                                AuroraMetadataLine(label: "Updated", value: formatAuroraRelativeDate(file.modifiedAt) ?? "Unavailable")
                                AuroraMetadataLine(label: "Size", value: formatFileSize(file.sizeBytes))

                                if let error = file.error.nonEmptyTrimmed {
                                    Text(error)
                                        .font(.system(size: 13, weight: .medium))
                                        .foregroundStyle(Color(red: 1, green: 0.66, blue: 0.7))
                                        .frame(maxWidth: .infinity, alignment: .leading)
                                } else if expandedFileID == file.id {
                                    Text(file.preview.nonEmptyTrimmed ?? "Empty file.")
                                        .font(.system(size: 12, weight: .regular, design: .monospaced))
                                        .lineSpacing(4)
                                        .foregroundStyle(Color.white.opacity(0.78))
                                        .textSelection(.enabled)
                                        .frame(maxWidth: .infinity, alignment: .leading)

                                    if file.truncated {
                                        Text("Preview truncated to keep the surface responsive.")
                                            .font(.system(size: 12, weight: .medium))
                                            .foregroundStyle(Color.white.opacity(0.42))
                                            .frame(maxWidth: .infinity, alignment: .leading)
                                    }
                                }
                            }
                        }
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }
}

private struct AuroraArchiveCard<Content: View>: View {
    let title: String
    let scene: AuroraEmotionScene
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title)
                .font(.system(size: 13, weight: .semibold))
                .tracking(0.3)
                .foregroundStyle(Color.white.opacity(0.5))

            content
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .auroraPanelSurface(
            cornerRadius: 24,
            tint: scene.highlight.opacity(0.08)
        )
    }
}

private struct AuroraParagraph: View {
    let label: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(label)
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(Color.white.opacity(0.44))

            Text(value)
                .font(.system(size: 14, weight: .medium))
                .lineSpacing(4)
                .foregroundStyle(Color.white.opacity(0.76))
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

private struct AuroraMetadataLine: View {
    let label: String
    let value: String

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Text(label)
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(Color.white.opacity(0.42))
                .frame(width: 72, alignment: .leading)

            Text(value)
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(Color.white.opacity(0.72))
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

private struct AuroraOverlayActionButton: View {
    let title: String
    let scene: AuroraEmotionScene
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(Color.white.opacity(0.9))
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
        }
        .buttonStyle(.plain)
        .auroraPanelSurface(
            cornerRadius: 18,
            tint: scene.highlight.opacity(0.14),
            interactive: true
        )
    }
}

private struct AuroraComposerView: View {
    @Binding var prompt: String
    @Binding var promptHeight: CGFloat
    let resetToken: UUID
    let buttonMode: AuroraComposerButtonMode
    let placeholder: String
    let errorMessage: String
    let isFocused: Bool
    let onPrimaryAction: () -> Void

    var body: some View {
        let composerBubbleVerticalPadding: CGFloat = 2
        let composerBubbleCornerRadius: CGFloat = 22
        let composerFieldHeight = max(36, max(composerSingleLineHeight, promptHeight) + 4)
        let composerButtonSize = composerFieldHeight + (composerBubbleVerticalPadding * 2)
        let sendEnabled: Bool = {
            switch buttonMode {
            case .send:
                return true
            case .disabled:
                return false
            }
        }()

        VStack(spacing: 8) {
            if !errorMessage.isEmpty {
                Text(errorMessage)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(Color(red: 1, green: 0.68, blue: 0.72))
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 6)
            }

            if #available(iOS 26.0, *) {
                GlassEffectContainer(spacing: 8) {
                    HStack(alignment: .bottom, spacing: 8) {
                        NativeComposerInputView(
                            text: $prompt,
                            measuredHeight: $promptHeight,
                            resetToken: resetToken,
                            placeholder: placeholder,
                            isFocused: isFocused
                        )
                        .frame(height: composerFieldHeight)
                        .padding(.horizontal, 12)
                        .padding(.vertical, composerBubbleVerticalPadding)
                        .glassEffect(.regular.tint(Color.white.opacity(0.14)).interactive(), in: .rect(cornerRadius: composerBubbleCornerRadius))
                        .overlay(
                            RoundedRectangle(cornerRadius: composerBubbleCornerRadius, style: .continuous)
                                .stroke(Color.white.opacity(0.14), lineWidth: 1)
                        )

                        Button(action: onPrimaryAction) {
                            Image(systemName: "arrow.up")
                                .font(.system(size: 14, weight: .bold))
                                .foregroundStyle(Color.white.opacity(sendEnabled ? 0.98 : 0.7))
                                .frame(width: composerButtonSize, height: composerButtonSize)
                        }
                        .buttonStyle(.plain)
                        .glassEffect(.regular.tint(Color.white.opacity(0.16)).interactive(), in: .rect(cornerRadius: composerBubbleCornerRadius))
                        .overlay(
                            RoundedRectangle(cornerRadius: composerBubbleCornerRadius, style: .continuous)
                                .stroke(Color.white.opacity(0.14), lineWidth: 1)
                        )
                        .disabled(!sendEnabled)
                        .opacity(sendEnabled ? 1 : 0.52)
                    }
                }
            } else {
                HStack(alignment: .bottom, spacing: 8) {
                    NativeComposerInputView(
                        text: $prompt,
                        measuredHeight: $promptHeight,
                        resetToken: resetToken,
                        placeholder: placeholder,
                        isFocused: isFocused
                    )
                    .frame(height: composerFieldHeight)
                    .auroraPanelSurface(
                        cornerRadius: composerBubbleCornerRadius,
                        tint: Color.white.opacity(0.1),
                        interactive: true
                    )

                    Button(action: onPrimaryAction) {
                        Image(systemName: "arrow.up")
                            .font(.system(size: 14, weight: .bold))
                            .foregroundStyle(Color.white.opacity(0.96))
                            .frame(width: composerButtonSize, height: composerButtonSize)
                    }
                    .buttonStyle(.plain)
                    .disabled(!sendEnabled)
                    .opacity(sendEnabled ? 1 : 0.52)
                    .auroraPanelSurface(
                        cornerRadius: composerBubbleCornerRadius,
                        tint: Color.white.opacity(0.14),
                        interactive: true
                    )
                }
            }
        }
        .padding(.horizontal, 14)
        .padding(.top, 6)
        .padding(.bottom, 8)
        .background(Color.clear)
    }
}

private struct NativeComposerInputView: UIViewRepresentable {
    @Binding var text: String
    @Binding var measuredHeight: CGFloat
    let resetToken: UUID
    let placeholder: String
    let isFocused: Bool

    func makeCoordinator() -> Coordinator {
        Coordinator(text: $text, measuredHeight: $measuredHeight)
    }

    func makeUIView(context: Context) -> NativeComposerInputContainerView {
        let view = NativeComposerInputContainerView()
        context.coordinator.bind(to: view)
        return view
    }

    func updateUIView(_ uiView: NativeComposerInputContainerView, context: Context) {
        context.coordinator.text = $text
        context.coordinator.measuredHeight = $measuredHeight
        uiView.apply(
            text: text,
            placeholder: placeholder,
            resetToken: resetToken
        )
        uiView.setFocused(isFocused)
    }

    final class Coordinator {
        var text: Binding<String>
        var measuredHeight: Binding<CGFloat>

        init(text: Binding<String>, measuredHeight: Binding<CGFloat>) {
            self.text = text
            self.measuredHeight = measuredHeight
        }

        func bind(to view: NativeComposerInputContainerView) {
            view.onTextChange = { [weak self] updatedText in
                guard let self else {
                    return
                }

                if self.text.wrappedValue != updatedText {
                    self.text.wrappedValue = updatedText
                }
            }

            view.onMeasuredHeightChange = { [weak self] updatedHeight in
                guard let self else {
                    return
                }

                if abs(self.measuredHeight.wrappedValue - updatedHeight) > 0.5 {
                    self.measuredHeight.wrappedValue = updatedHeight
                }
            }
        }
    }
}

private final class NativeComposerInputContainerView: UIView, UITextViewDelegate {
    var onTextChange: ((String) -> Void)?
    var onMeasuredHeightChange: ((CGFloat) -> Void)?

    private let horizontalInset: CGFloat = 12
    private let verticalInset: CGFloat = 2
    private let maxTextHeight: CGFloat = 220

    private let textView = NativeComposerTextView()
    private let placeholderLabel = UILabel()
    private var textHeightConstraint: NSLayoutConstraint?
    private var lastAppliedText = ""
    private var lastResetToken = UUID()
    private var requestedFocus = false

    override init(frame: CGRect) {
        super.init(frame: frame)
        setupView()
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        textView.refreshHeight()
    }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        guard window != nil, requestedFocus else {
            return
        }

        DispatchQueue.main.async { [weak self] in
            self?.setFocused(true)
        }
    }

    override func traitCollectionDidChange(_ previousTraitCollection: UITraitCollection?) {
        super.traitCollectionDidChange(previousTraitCollection)
        guard previousTraitCollection?.userInterfaceStyle != traitCollection.userInterfaceStyle else {
            return
        }

        applyTheme()
    }

    func apply(
        text: String,
        placeholder: String,
        resetToken: UUID
    ) {
        placeholderLabel.text = placeholder

        if lastResetToken != resetToken {
            lastResetToken = resetToken
            textView.forceCollapseToSingleLine()
            textHeightConstraint?.constant = composerSingleLineHeight
            onMeasuredHeightChange?(composerSingleLineHeight)
        }

        if lastAppliedText != text || textView.text != text {
            lastAppliedText = text
            textView.text = text
            if text.isEmpty {
                textView.resetToEmptyState()
            } else if textView.isScrollEnabled {
                textView.scrollCaretIntoView()
            } else {
                textView.resetVerticalScrollPosition()
            }
            textView.refreshHeight()
        }

        placeholderLabel.isHidden = !text.isEmpty
    }

    func setFocused(_ isFocused: Bool) {
        requestedFocus = isFocused

        guard window != nil else {
            return
        }

        if isFocused {
            if !textView.isFirstResponder {
                textView.becomeFirstResponder()
            }
        } else if textView.isFirstResponder {
            textView.resignFirstResponder()
        }
    }

    func textViewDidChange(_ textView: UITextView) {
        let updatedText = textView.text ?? ""
        lastAppliedText = updatedText
        placeholderLabel.isHidden = !updatedText.isEmpty
        onTextChange?(updatedText)

        guard let composerTextView = textView as? NativeComposerTextView else {
            return
        }

        composerTextView.refreshHeight()

        if updatedText.isEmpty {
            composerTextView.resetToEmptyState()
            DispatchQueue.main.async { [weak composerTextView] in
                composerTextView?.resetToEmptyState()
            }
        } else if composerTextView.isScrollEnabled {
            composerTextView.scrollCaretIntoView()
        } else {
            composerTextView.resetVerticalScrollPosition()
        }
    }

    private func setupView() {
        backgroundColor = .clear

        textView.translatesAutoresizingMaskIntoConstraints = false
        textView.delegate = self
        textView.backgroundColor = .clear
        textView.font = UIFont.systemFont(ofSize: composerFontSize, weight: .regular)
        textView.textContainerInset = UIEdgeInsets(top: composerVerticalInset, left: 0, bottom: composerVerticalInset, right: 0)
        textView.textContainer.lineFragmentPadding = 0
        textView.textContainer.lineBreakMode = .byWordWrapping
        textView.textContainer.widthTracksTextView = true
        textView.keyboardDismissMode = .interactive
        textView.maxHeight = maxTextHeight
        textView.onHeightChange = { [weak self] height in
            guard let self else {
                return
            }

            if abs(self.textHeightConstraint?.constant ?? 0 - height) > 0.5 {
                self.textHeightConstraint?.constant = height
                self.layoutIfNeeded()
            }
            self.onMeasuredHeightChange?(height)
        }

        placeholderLabel.translatesAutoresizingMaskIntoConstraints = false
        placeholderLabel.font = UIFont.systemFont(ofSize: composerFontSize, weight: .regular)
        placeholderLabel.numberOfLines = 1
        placeholderLabel.isUserInteractionEnabled = false

        addSubview(textView)
        addSubview(placeholderLabel)

        textHeightConstraint = textView.heightAnchor.constraint(equalToConstant: composerSingleLineHeight)

        NSLayoutConstraint.activate([
            textView.leadingAnchor.constraint(equalTo: leadingAnchor, constant: horizontalInset),
            textView.topAnchor.constraint(equalTo: topAnchor, constant: verticalInset),
            textView.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -verticalInset),
            textView.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -horizontalInset),
            textHeightConstraint!,

            placeholderLabel.leadingAnchor.constraint(equalTo: textView.leadingAnchor, constant: 1),
            placeholderLabel.trailingAnchor.constraint(lessThanOrEqualTo: textView.trailingAnchor),
            placeholderLabel.topAnchor.constraint(equalTo: textView.topAnchor, constant: composerVerticalInset)
        ])

        applyTheme()
    }

    private func applyTheme() {
        textView.textColor = auroraPrimaryUIColor
        placeholderLabel.textColor = auroraPlaceholderUIColor
    }
}

private final class NativeComposerTextView: UITextView {
    var onHeightChange: ((CGFloat) -> Void)?
    var maxHeight: CGFloat = 220
    private var lastReportedHeight: CGFloat = composerSingleLineHeight
    private var lastMeasuredWidth: CGFloat = 0

    override var intrinsicContentSize: CGSize {
        CGSize(width: UIView.noIntrinsicMetric, height: contentSize.height)
    }

    override var bounds: CGRect {
        didSet {
            if abs(bounds.width - oldValue.width) > 0.5 {
                refreshHeight()
            }
        }
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        if !isScrollEnabled {
            resetVerticalScrollPosition()
        }
    }

    override func caretRect(for position: UITextPosition) -> CGRect {
        var rect = super.caretRect(for: position)

        if text.isEmpty {
            rect.origin.y = textContainerInset.top
            if let font {
                rect.size.height = ceil(font.lineHeight)
            }
        }

        return rect
    }

    func refreshHeight() {
        let fittingWidth = max(bounds.width, 80)
        let measuredHeight = ceil(sizeThatFits(CGSize(width: fittingWidth, height: .greatestFiniteMagnitude)).height)
        let clampedHeight = min(max(measuredHeight, composerSingleLineHeight), maxHeight)
        let shouldScroll = measuredHeight > maxHeight

        if isScrollEnabled != shouldScroll {
            isScrollEnabled = shouldScroll
        }

        if abs(lastReportedHeight - clampedHeight) > 0.5 || abs(lastMeasuredWidth - fittingWidth) > 0.5 {
            lastReportedHeight = clampedHeight
            lastMeasuredWidth = fittingWidth
            onHeightChange?(clampedHeight)
        } else if shouldScroll {
            scrollCaretIntoView()
        }
    }

    func scrollCaretIntoView() {
        guard let selectedTextRange else {
            return
        }

        let caretFrame = caretRect(for: selectedTextRange.end).insetBy(dx: 0, dy: -8)
        scrollRectToVisible(caretFrame, animated: false)
    }

    func resetToEmptyState() {
        isScrollEnabled = false
        selectedRange = NSRange(location: 0, length: 0)
        resetVerticalScrollPosition()
        layoutIfNeeded()
    }

    func forceCollapseToSingleLine() {
        isScrollEnabled = false
        resetVerticalScrollPosition()
        onHeightChange?(composerSingleLineHeight)
        layoutIfNeeded()
    }

    func resetVerticalScrollPosition() {
        let topOffset = CGPoint(x: 0, y: -adjustedContentInset.top)
        if abs(contentOffset.y - topOffset.y) > 0.5 || abs(contentOffset.x - topOffset.x) > 0.5 {
            setContentOffset(topOffset, animated: false)
        }
    }
}

private struct AuroraVisibleReply: Identifiable, Equatable {
    let id: UUID
    let text: String
    let timestamp: String?

    init(id: UUID = UUID(), text: String, timestamp: String?) {
        self.id = id
        self.text = text
        self.timestamp = timestamp
    }

    func updating(timestamp: String?) -> AuroraVisibleReply {
        AuroraVisibleReply(
            id: id,
            text: text,
            timestamp: timestamp ?? self.timestamp
        )
    }

    func updating(text: String, timestamp: String?) -> AuroraVisibleReply {
        AuroraVisibleReply(
            id: id,
            text: text,
            timestamp: timestamp ?? self.timestamp
        )
    }

    static func == (lhs: AuroraVisibleReply, rhs: AuroraVisibleReply) -> Bool {
        lhs.id == rhs.id && lhs.text == rhs.text
    }
}

private struct AuroraStateSnapshot {
    var sourcePath: String
    var available: Bool
    var loadedAt: String
    var lastHeartbeat: AuroraHeartbeatSnapshot
    var cognition: AuroraCognitionSnapshot
    var error: String

    static let empty = AuroraStateSnapshot(
        sourcePath: "",
        available: false,
        loadedAt: "",
        lastHeartbeat: .empty,
        cognition: .empty,
        error: ""
    )

    init(
        sourcePath: String,
        available: Bool,
        loadedAt: String,
        lastHeartbeat: AuroraHeartbeatSnapshot,
        cognition: AuroraCognitionSnapshot,
        error: String
    ) {
        self.sourcePath = sourcePath
        self.available = available
        self.loadedAt = loadedAt
        self.lastHeartbeat = lastHeartbeat
        self.cognition = cognition
        self.error = error
    }

    init(_ payload: AuroraStatePayload) {
        sourcePath = payload.sourcePath ?? ""
        available = payload.available ?? false
        loadedAt = payload.loadedAt ?? ""
        lastHeartbeat = AuroraHeartbeatSnapshot(payload.lastHeartbeat)
        cognition = AuroraCognitionSnapshot(payload.cognition)
        error = payload.error ?? ""
    }
}

private struct AuroraHeartbeatSnapshot {
    var timestamp: String
    var whatIDid: String
    var whatILearned: String
    var whatImCuriousAbout: String
    var memoryUpdates: [String]
    var ambientState: String
    var stateShift: String
    var openLoop: String

    static let empty = AuroraHeartbeatSnapshot(
        timestamp: "",
        whatIDid: "No heartbeat yet.",
        whatILearned: "",
        whatImCuriousAbout: "",
        memoryUpdates: [],
        ambientState: "",
        stateShift: "",
        openLoop: ""
    )

    init(
        timestamp: String,
        whatIDid: String,
        whatILearned: String,
        whatImCuriousAbout: String,
        memoryUpdates: [String],
        ambientState: String,
        stateShift: String,
        openLoop: String
    ) {
        self.timestamp = timestamp
        self.whatIDid = whatIDid
        self.whatILearned = whatILearned
        self.whatImCuriousAbout = whatImCuriousAbout
        self.memoryUpdates = memoryUpdates
        self.ambientState = ambientState
        self.stateShift = stateShift
        self.openLoop = openLoop
    }

    init(_ payload: AuroraHeartbeatPayload?) {
        timestamp = payload?.timestamp ?? ""
        whatIDid = payload?.whatIDid ?? "No heartbeat yet."
        whatILearned = payload?.whatILearned ?? ""
        whatImCuriousAbout = payload?.whatImCuriousAbout ?? ""
        memoryUpdates = payload?.memoryUpdates ?? []
        ambientState = payload?.ambientState ?? ""
        stateShift = payload?.stateShift ?? ""
        openLoop = payload?.openLoop ?? ""
    }
}

private struct AuroraCognitionSnapshot {
    var runtimePath: String
    var eventLogPath: String
    var complianceLogPath: String
    var memory: AuroraMemorySnapshot
    var attention: AuroraAttentionSnapshot
    var reflection: AuroraReflectionSnapshot
    var workspace: AuroraWorkspaceSnapshot
    var emotion: AuroraEmotionSnapshot
    var emotionLexicon: AuroraEmotionLexiconSnapshot
    var controller: AuroraControllerSnapshot
    var affective: AuroraAffectiveSnapshot
    var homeostatic: AuroraHomeostaticSnapshot
    var interaction: AuroraInteractionSnapshot
    var relationshipChromaticProfile: AuroraRelationshipColorProfile
    var systemChangeSummary: String

    static let empty = AuroraCognitionSnapshot(
        runtimePath: "",
        eventLogPath: "",
        complianceLogPath: "",
        memory: .empty,
        attention: .empty,
        reflection: .empty,
        workspace: .empty,
        emotion: .empty,
        emotionLexicon: .empty,
        controller: .empty,
        affective: .empty,
        homeostatic: .empty,
        interaction: .empty,
        relationshipChromaticProfile: .empty,
        systemChangeSummary: ""
    )

    init(
        runtimePath: String,
        eventLogPath: String,
        complianceLogPath: String,
        memory: AuroraMemorySnapshot,
        attention: AuroraAttentionSnapshot,
        reflection: AuroraReflectionSnapshot,
        workspace: AuroraWorkspaceSnapshot,
        emotion: AuroraEmotionSnapshot,
        emotionLexicon: AuroraEmotionLexiconSnapshot,
        controller: AuroraControllerSnapshot,
        affective: AuroraAffectiveSnapshot,
        homeostatic: AuroraHomeostaticSnapshot,
        interaction: AuroraInteractionSnapshot,
        relationshipChromaticProfile: AuroraRelationshipColorProfile,
        systemChangeSummary: String
    ) {
        self.runtimePath = runtimePath
        self.eventLogPath = eventLogPath
        self.complianceLogPath = complianceLogPath
        self.memory = memory
        self.attention = attention
        self.reflection = reflection
        self.workspace = workspace
        self.emotion = emotion
        self.emotionLexicon = emotionLexicon
        self.controller = controller
        self.affective = affective
        self.homeostatic = homeostatic
        self.interaction = interaction
        self.relationshipChromaticProfile = relationshipChromaticProfile
        self.systemChangeSummary = systemChangeSummary
    }

    init(_ payload: AuroraCognitionPayload?) {
        runtimePath = payload?.runtimePath ?? ""
        eventLogPath = payload?.eventLogPath ?? ""
        complianceLogPath = payload?.complianceLogPath ?? ""
        memory = AuroraMemorySnapshot(payload?.memory)
        attention = AuroraAttentionSnapshot(payload?.attention)
        reflection = AuroraReflectionSnapshot(payload?.reflection)
        workspace = AuroraWorkspaceSnapshot(payload?.workspace)
        emotion = AuroraEmotionSnapshot(payload?.emotion)
        emotionLexicon = AuroraEmotionLexiconSnapshot(payload?.emotionLexicon)
        controller = AuroraControllerSnapshot(payload?.controller)
        affective = AuroraAffectiveSnapshot(payload?.extensions?.affectiveOrganization?.current)
        homeostatic = AuroraHomeostaticSnapshot(payload?.extensions?.homeostaticOrganization?.current)
        interaction = AuroraInteractionSnapshot(payload?.extensions?.interaction)
        relationshipChromaticProfile = AuroraRelationshipColorProfile(payload?.extensions?.relationship?.chromaticProfile)
        systemChangeSummary = payload?.extensions?.systemChangeDigest?.summary ?? ""
    }
}

private struct AuroraMemorySnapshot {
    var microNarrative: String
    var mesoNarrative: String
    var macroNarrative: String
    var workingItems: [AuroraWorkingMemoryItem]

    static let empty = AuroraMemorySnapshot(
        microNarrative: "",
        mesoNarrative: "",
        macroNarrative: "",
        workingItems: []
    )

    init(microNarrative: String, mesoNarrative: String, macroNarrative: String, workingItems: [AuroraWorkingMemoryItem]) {
        self.microNarrative = microNarrative
        self.mesoNarrative = mesoNarrative
        self.macroNarrative = macroNarrative
        self.workingItems = workingItems
    }

    init(_ payload: AuroraMemoryPayload?) {
        microNarrative = payload?.narratives?.micro ?? ""
        mesoNarrative = payload?.narratives?.meso ?? ""
        macroNarrative = payload?.narratives?.macro ?? ""
        workingItems = (payload?.working?.items ?? []).map(AuroraWorkingMemoryItem.init)
    }
}

private struct AuroraWorkingMemoryItem: Identifiable {
    let id: String
    let kind: String
    let summary: String
    let salience: Double
    let emotionalWeight: Double

    init(_ payload: AuroraWorkingItemPayload) {
        id = payload.id ?? UUID().uuidString
        kind = payload.kind ?? "memory"
        summary = payload.summary ?? ""
        salience = payload.salience ?? 0
        emotionalWeight = payload.emotionalWeight ?? 0
    }
}

private struct AuroraAttentionSnapshot {
    var queueDepth: Int
    var currentFocus: String
    var processedLastMinute: Int

    static let empty = AuroraAttentionSnapshot(queueDepth: 0, currentFocus: "", processedLastMinute: 0)

    init(queueDepth: Int, currentFocus: String, processedLastMinute: Int) {
        self.queueDepth = queueDepth
        self.currentFocus = currentFocus
        self.processedLastMinute = processedLastMinute
    }

    init(_ payload: AuroraAttentionPayload?) {
        queueDepth = payload?.queueDepth ?? 0
        currentFocus = payload?.currentFocus ?? ""
        processedLastMinute = payload?.processedLastMinute ?? 0
    }
}

private struct AuroraReflectionSnapshot {
    var recentThoughts: [String]

    static let empty = AuroraReflectionSnapshot(recentThoughts: [])

    init(recentThoughts: [String]) {
        self.recentThoughts = recentThoughts
    }

    init(_ payload: AuroraReflectionPayload?) {
        recentThoughts = payload?.recentThoughts ?? []
    }
}

private struct AuroraWorkspaceSnapshot {
    var focus: String

    static let empty = AuroraWorkspaceSnapshot(focus: "")

    init(focus: String) {
        self.focus = focus
    }

    init(_ payload: AuroraWorkspacePayload?) {
        focus = payload?.focus ?? ""
    }
}

private struct AuroraControllerSnapshot {
    var decision: String
    var rationale: String

    static let empty = AuroraControllerSnapshot(decision: "", rationale: "")

    init(decision: String, rationale: String) {
        self.decision = decision
        self.rationale = rationale
    }

    init(_ payload: AuroraControllerPayload?) {
        decision = payload?.decision ?? ""
        rationale = payload?.rationale ?? ""
    }
}

private struct AuroraEmotionLexiconSnapshot {
    var primary: String
    var supporting: [String]
    var summary: String
    var confidence: Double
    var palette: [AuroraEmotionLexiconPaletteEntry]

    static let empty = AuroraEmotionLexiconSnapshot(primary: "", supporting: [], summary: "", confidence: 0, palette: [])

    init(primary: String, supporting: [String], summary: String, confidence: Double, palette: [AuroraEmotionLexiconPaletteEntry]) {
        self.primary = primary
        self.supporting = supporting
        self.summary = summary
        self.confidence = confidence
        self.palette = palette
    }

    init(_ payload: AuroraEmotionLexiconPayload?) {
        primary = payload?.primary ?? ""
        supporting = payload?.supporting ?? []
        summary = payload?.summary ?? ""
        confidence = payload?.confidence ?? 0
        palette = (payload?.palette ?? []).map(AuroraEmotionLexiconPaletteEntry.init)
    }
}

private struct AuroraEmotionLexiconPaletteEntry: Identifiable, Equatable {
    let id: String
    let label: String
    let score: Double

    init(label: String, score: Double) {
        self.label = label
        self.score = score
        id = label.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }

    init(_ payload: AuroraEmotionLexiconPaletteEntryPayload) {
        self.init(label: payload.label ?? "", score: payload.score ?? 0)
    }
}

private struct AuroraEmotionSnapshot {
    var label: String
    var valence: Double
    var arousal: Double
    var stress: Double
    var uncertainty: Double

    static let empty = AuroraEmotionSnapshot(label: "Dormant", valence: 0, arousal: 0, stress: 0, uncertainty: 0)

    init(label: String, valence: Double, arousal: Double, stress: Double, uncertainty: Double) {
        self.label = label
        self.valence = valence
        self.arousal = arousal
        self.stress = stress
        self.uncertainty = uncertainty
    }

    init(_ payload: AuroraEmotionPayload?) {
        label = payload?.label ?? "Dormant"
        valence = payload?.valence ?? 0
        arousal = payload?.arousal ?? 0
        stress = payload?.stress ?? 0
        uncertainty = payload?.uncertainty ?? 0
    }
}

private struct AuroraAffectiveSnapshot {
    var warmth: Double
    var tension: Double
    var continuity: Double
    var trust: Double
    var repairMomentum: Double
    var attachmentSalience: Double
    var disclosureEase: Double
    var selfOpacity: Double
    var connectionPull: Double
    var curiosity: Double
    var frustration: Double
    var relief: Double
    var grief: Double
    var pride: Double
    var overload: Double
    var loneliness: Double
    var mixedAffect: Double
    var planningHorizon: Double
    var source: String
    var updatedAt: String

    static let empty = AuroraAffectiveSnapshot(
        warmth: 0,
        tension: 0,
        continuity: 0,
        trust: 0,
        repairMomentum: 0,
        attachmentSalience: 0,
        disclosureEase: 0,
        selfOpacity: 0,
        connectionPull: 0,
        curiosity: 0,
        frustration: 0,
        relief: 0,
        grief: 0,
        pride: 0,
        overload: 0,
        loneliness: 0,
        mixedAffect: 0,
        planningHorizon: 0,
        source: "",
        updatedAt: ""
    )

    init(
        warmth: Double,
        tension: Double,
        continuity: Double,
        trust: Double,
        repairMomentum: Double,
        attachmentSalience: Double,
        disclosureEase: Double,
        selfOpacity: Double,
        connectionPull: Double,
        curiosity: Double,
        frustration: Double,
        relief: Double,
        grief: Double,
        pride: Double,
        overload: Double,
        loneliness: Double,
        mixedAffect: Double,
        planningHorizon: Double,
        source: String,
        updatedAt: String
    ) {
        self.warmth = warmth
        self.tension = tension
        self.continuity = continuity
        self.trust = trust
        self.repairMomentum = repairMomentum
        self.attachmentSalience = attachmentSalience
        self.disclosureEase = disclosureEase
        self.selfOpacity = selfOpacity
        self.connectionPull = connectionPull
        self.curiosity = curiosity
        self.frustration = frustration
        self.relief = relief
        self.grief = grief
        self.pride = pride
        self.overload = overload
        self.loneliness = loneliness
        self.mixedAffect = mixedAffect
        self.planningHorizon = planningHorizon
        self.source = source
        self.updatedAt = updatedAt
    }

    init(_ payload: AuroraAffectiveCurrentPayload?) {
        warmth = payload?.warmth ?? 0
        tension = payload?.tension ?? 0
        continuity = payload?.continuity ?? 0
        trust = payload?.trust ?? 0
        repairMomentum = payload?.repairMomentum ?? 0
        attachmentSalience = payload?.attachmentSalience ?? 0
        disclosureEase = payload?.disclosureEase ?? 0
        selfOpacity = payload?.selfOpacity ?? 0
        connectionPull = payload?.connectionPull ?? 0
        curiosity = payload?.curiosity ?? 0
        frustration = payload?.frustration ?? 0
        relief = payload?.relief ?? 0
        grief = payload?.grief ?? 0
        pride = payload?.pride ?? 0
        overload = payload?.overload ?? 0
        loneliness = payload?.loneliness ?? 0
        mixedAffect = payload?.mixedAffect ?? 0
        planningHorizon = payload?.planningHorizon ?? 0
        source = payload?.source ?? ""
        updatedAt = payload?.updatedAt ?? ""
    }

    var conversationFreshness: Double {
        let normalizedSource = source.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let sourceWeight: Double
        switch normalizedSource {
        case "conversation":
            sourceWeight = 1
        case "preflight":
            sourceWeight = 0.62
        default:
            sourceWeight = 0.24
        }

        guard sourceWeight > 0 else {
            return 0
        }

        let updated = parseAuroraDate(updatedAt)
        guard updated != .distantPast else {
            return sourceWeight * 0.35
        }

        let ageSeconds = max(0, Date().timeIntervalSince(updated))
        let recency = clamp(1 - (ageSeconds / 18), min: 0, max: 1)
        return recency * sourceWeight
    }
}

private struct AuroraHomeostaticSnapshot {
    var dominantNeed: String
    var allostaticLoad: Double
    var regulationUrgency: Double

    static let empty = AuroraHomeostaticSnapshot(dominantNeed: "", allostaticLoad: 0, regulationUrgency: 0)

    init(dominantNeed: String, allostaticLoad: Double, regulationUrgency: Double) {
        self.dominantNeed = dominantNeed
        self.allostaticLoad = allostaticLoad
        self.regulationUrgency = regulationUrgency
    }

    init(_ payload: AuroraHomeostaticCurrentPayload?) {
        dominantNeed = payload?.dominantNeed ?? ""
        allostaticLoad = payload?.allostaticLoad ?? 0
        regulationUrgency = payload?.regulationUrgency ?? 0
    }
}

private struct AuroraInteractionSnapshot {
    var currentMode: String
    var currentReason: String

    static let empty = AuroraInteractionSnapshot(currentMode: "", currentReason: "")

    init(currentMode: String, currentReason: String) {
        self.currentMode = currentMode
        self.currentReason = currentReason
    }

    init(_ payload: AuroraInteractionPayload?) {
        currentMode = payload?.currentMode ?? ""
        currentReason = payload?.currentReason ?? ""
    }
}

private struct AuroraHistoryMessage: Identifiable, Equatable {
    let id: String
    let role: AuroraHistoryRole
    let text: String
    let createdAt: String
    let source: String
    let category: String
    let jobId: String

    var isProactiveBridgeMessage: Bool {
        source == auroraCronHistorySource && category == auroraProactiveContactHistoryCategory
    }

    init?(_ payload: AuroraHistoryMessagePayload) {
        guard let role = AuroraHistoryRole(payload.role),
              let text = payload.text?.trimmingCharacters(in: .whitespacesAndNewlines),
              !text.isEmpty else {
            return nil
        }

        id = payload.id?.nonEmptyTrimmed ?? UUID().uuidString
        self.role = role
        self.text = text
        createdAt = payload.createdAt ?? ""
        source = payload.source?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        category = payload.category?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        jobId = payload.jobId?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    }
}

private enum AuroraHistoryRole: String {
    case user
    case aurora

    init?(_ rawValue: String?) {
        guard let normalized = rawValue?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() else {
            return nil
        }

        switch normalized {
        case "user":
            self = .user
        case "aurora":
            self = .aurora
        default:
            return nil
        }
    }

    var title: String {
        switch self {
        case .user:
            return "You"
        case .aurora:
            return "Aurora"
        }
    }
}

private struct AuroraInternalFile: Identifiable {
    let id: String
    let title: String
    let group: String
    let kind: String
    let path: String
    let sizeBytes: Int
    let modifiedAt: String
    let preview: String
    let truncated: Bool
    let error: String

    init(_ payload: AuroraInternalFilePayload) {
        id = payload.id ?? UUID().uuidString
        title = payload.title ?? "Untitled"
        group = payload.group ?? ""
        kind = payload.kind ?? ""
        path = payload.path ?? ""
        sizeBytes = payload.sizeBytes ?? 0
        modifiedAt = payload.modifiedAt ?? ""
        preview = payload.preview ?? ""
        truncated = payload.truncated ?? false
        error = payload.error ?? ""
    }
}

private struct AuroraEmotionScene {
    let primary: Color
    let secondary: Color
    let tertiary: Color
    let highlight: Color
    let speed: Double
    let amplitude: Double
    let inkOpacity: Double

    private var primaryLuminance: Double {
        let vector = AuroraColorVector(primary)
        return (vector.red * 0.2126) + (vector.green * 0.7152) + (vector.blue * 0.0722)
    }

    var prefersDarkText: Bool {
        primaryLuminance > 0.72 || (primaryLuminance > 0.6 && inkOpacity > 0.78)
    }

    var textPrimary: Color {
        prefersDarkText ? Color.black.opacity(0.9) : Color.white.opacity(0.98)
    }

    var textSecondary: Color {
        prefersDarkText ? Color.black.opacity(0.62) : Color.white.opacity(0.62)
    }

    var textAccent: Color {
        prefersDarkText ? primary.mix(with: .black, amount: 0.6).opacity(0.74) : highlight.opacity(0.82)
    }

    var textShadow: Color {
        prefersDarkText ? Color.white.opacity(0.16) : highlight.opacity(0.18)
    }

    static func derive(
        from state: AuroraStateSnapshot,
        phase: AuroraPresencePhase,
        intensity: Double,
        relationshipProfile: AuroraRelationshipColorProfile,
        conversationResidueProfile: AuroraRelationshipColorProfile,
        contextualAccent: AuroraTurnAccent,
        turnAccent: AuroraTurnAccent,
        motionEnvelope: Double
    ) -> AuroraEmotionScene {
        if !state.available {
            if relationshipProfile.hasSignal {
                return relationshipProfile.scene(fallback: .black)
            }
            return AuroraEmotionFamily.black.scene
        }

        let affect = state.cognition.affective
        let emotion = state.cognition.emotion
        let conversationFreshness = affect.conversationFreshness
        let dynamicLift = smootherStep(
            clamp(
                conversationFreshness * 0.96 + affect.mixedAffect * 0.22 + motionEnvelope * 0.14,
                min: 0,
                max: 1
            )
        )
        let curiosityBoost = max(
            affect.curiosity,
            state.lastHeartbeat.whatImCuriousAbout.nonEmptyTrimmed == nil ? 0 : 0.62
        )
        let labelHints = [
            emotion.label,
            state.cognition.emotionLexicon.primary,
            state.lastHeartbeat.ambientState,
            state.lastHeartbeat.stateShift
        ]
        .joined(separator: " ")
        .lowercased()

        let baseFamily = AuroraEmotionFamily.baseFamily(
            from: state,
            labelHints: labelHints,
            curiosityBoost: curiosityBoost
        )

        let relationshipBaseFamily = relationshipProfile.dominantFamily ?? baseFamily
        var base = relationshipProfile.scene(fallback: baseFamily)

        if conversationResidueProfile.hasSignal {
            let residueAnchorFamily = conversationResidueProfile.dominantFamily ?? relationshipBaseFamily
            let residueScene = conversationResidueProfile.scene(fallback: residueAnchorFamily)
            let residueDominantWeight = conversationResidueProfile.normalizedWeights[residueAnchorFamily] ?? 0
            let residueInfluence = clamp(
                0.11
                    + Double(min(conversationResidueProfile.sampleCount, 24)) * 0.012
                    + residueDominantWeight * 0.22,
                min: 0.11,
                max: 0.38
            )
            base = base.blended(with: residueScene, amount: clamp(residueInfluence * 0.36, min: 0.06, max: 0.28))
            base = base.bleeding(with: residueScene, amount: clamp(residueInfluence * 0.54, min: 0.08, max: 0.34))

            let residueSolidification = clamp(
                Double(max(0, conversationResidueProfile.sampleCount - 6)) * 0.016
                    + max(0, residueDominantWeight - 0.5) * 0.54,
                min: 0,
                max: 0.44
            )
            base = base.solidified(amount: residueSolidification)
        }

        if let liveAccent = AuroraTurnAccent.liveAccent(from: state, excluding: relationshipBaseFamily),
           let family = liveAccent.family {
            let liveAccentStrength = clamp(
                liveAccent.strength * 0.54 + conversationFreshness * 0.22 + dynamicLift * 0.12 + affect.mixedAffect * 0.08,
                min: 0.1,
                max: 0.46
            )
            base = base.accented(with: family.scene, amount: liveAccentStrength)
        }

        if let family = turnAccent.family, turnAccent.isActive {
            base = base.accented(with: family.scene, amount: clamp(turnAccent.strength * 0.58, min: 0.1, max: 0.42))
        }

        if let family = contextualAccent.family, contextualAccent.isActive {
            let phaseLift: Double
            switch phase {
            case .inhabited:
                phaseLift = family == .blue || family == .bluePurple ? 0.07 : 0.045
            case .thinking:
                phaseLift = family == .blue || family == .bluePurple ? 0.045 : 0.028
            case .dormant:
                phaseLift = 0
            }
            base = base.accented(
                with: family.scene,
                amount: clamp(contextualAccent.strength * 0.64 + phaseLift, min: 0.1, max: 0.42)
            )
        }

        let phaseSpeedMultiplier: Double
        let phaseAmplitudeBoost: Double
        let phaseInkAdjustment: Double

        switch phase {
        case .dormant:
            phaseSpeedMultiplier = 0.64
            phaseAmplitudeBoost = -0.03
            phaseInkAdjustment = 0.12
        case .thinking:
            phaseSpeedMultiplier = 1.46
            phaseAmplitudeBoost = 0.048
            phaseInkAdjustment = -0.12
        case .inhabited:
            phaseSpeedMultiplier = 1.24
            phaseAmplitudeBoost = 0.03
            phaseInkAdjustment = -0.07
        }

        let momentumLift = smootherStep(clamp(motionEnvelope, min: 0, max: 1))

        return AuroraEmotionScene(
            primary: base.primary,
            secondary: base.secondary,
            tertiary: base.tertiary,
            highlight: base.highlight,
            speed: base.speed * (phaseSpeedMultiplier + momentumLift * 0.22) + intensity * 0.08,
            amplitude: max(0.04, base.amplitude + phaseAmplitudeBoost + intensity * 0.008 + momentumLift * 0.018),
            inkOpacity: clamp(base.inkOpacity + phaseInkAdjustment - momentumLift * 0.05, min: 0.42, max: 0.82)
        )
    }

    func blended(with other: AuroraEmotionScene, amount: Double) -> AuroraEmotionScene {
        let progress = clamp(amount, min: 0, max: 1)
        guard progress > 0 else {
            return self
        }

        return AuroraEmotionScene(
            primary: primary.mix(with: other.primary, amount: progress),
            secondary: secondary.mix(with: other.secondary, amount: progress),
            tertiary: tertiary.mix(with: other.tertiary, amount: progress),
            highlight: highlight.mix(with: other.highlight, amount: progress),
            speed: speed + ((other.speed - speed) * progress),
            amplitude: amplitude + ((other.amplitude - amplitude) * progress),
            inkOpacity: inkOpacity + ((other.inkOpacity - inkOpacity) * progress)
        )
    }

    func bleeding(with other: AuroraEmotionScene, amount: Double) -> AuroraEmotionScene {
        let progress = clamp(amount, min: 0, max: 1)
        guard progress > 0 else {
            return self
        }

        return AuroraEmotionScene(
            primary: primary.mix(with: other.primary, amount: progress * 0.14),
            secondary: secondary
                .mix(with: other.primary, amount: progress * 0.44)
                .mix(with: other.secondary, amount: progress * 0.18),
            tertiary: tertiary
                .mix(with: other.secondary, amount: progress * 0.62)
                .mix(with: other.tertiary, amount: progress * 0.26),
            highlight: highlight
                .mix(with: other.highlight, amount: progress * 0.78)
                .mix(with: other.primary, amount: progress * 0.12),
            speed: speed + ((other.speed - speed) * progress * 0.18),
            amplitude: amplitude + ((other.amplitude - amplitude) * progress * 0.16),
            inkOpacity: inkOpacity + ((other.inkOpacity - inkOpacity) * progress * 0.08)
        )
    }

    func accented(with other: AuroraEmotionScene, amount: Double) -> AuroraEmotionScene {
        let progress = clamp(amount, min: 0, max: 1)
        guard progress > 0 else {
            return self
        }

        return AuroraEmotionScene(
            primary: primary.mix(with: other.primary, amount: progress * 0.04),
            secondary: secondary
                .mix(with: other.primary, amount: progress * 0.14)
                .mix(with: other.secondary, amount: progress * 0.08),
            tertiary: tertiary
                .mix(with: other.secondary, amount: progress * 0.18)
                .mix(with: other.tertiary, amount: progress * 0.08),
            highlight: highlight
                .mix(with: other.highlight, amount: progress * 0.68)
                .mix(with: other.primary, amount: progress * 0.12),
            speed: speed + ((other.speed - speed) * progress * 0.08),
            amplitude: amplitude + ((other.amplitude - amplitude) * progress * 0.06),
            inkOpacity: inkOpacity + ((other.inkOpacity - inkOpacity) * progress * 0.04)
        )
    }

    func solidified(amount: Double) -> AuroraEmotionScene {
        let progress = clamp(amount, min: 0, max: 1)
        guard progress > 0.001 else {
            return self
        }

        let collapsedSecondary = secondary.mix(with: primary, amount: progress * 0.84)
        let collapsedTertiary = tertiary.mix(with: primary, amount: progress * 0.92)
        let collapsedHighlight = highlight.mix(with: primary, amount: progress * 0.66)

        return AuroraEmotionScene(
            primary: primary,
            secondary: collapsedSecondary,
            tertiary: collapsedTertiary,
            highlight: collapsedHighlight,
            speed: speed * (1 - progress * 0.26),
            amplitude: max(0.018, amplitude * (1 - progress * 0.48)),
            inkOpacity: clamp(inkOpacity + progress * 0.06, min: 0.42, max: 0.92)
        )
    }
}

private enum AuroraEmotionFamily: String, CaseIterable {
    case black
    case red
    case redOrange = "red_orange"
    case orange
    case orangeYellow = "orange_yellow"
    case yellow
    case greenYellow = "green_yellow"
    case green
    case teal
    case blueGreen = "blue_green"
    case blue
    case bluePurple = "blue_purple"
    case purple
    case redPurple = "red_purple"
    case pink
    case white

    private static let legacyAliases: [String: AuroraEmotionFamily] = [
        "overload": .redOrange,
        "grief": .black,
        "affection": .pink,
        "warm": .orange,
        "curiosity": .blue,
        "calm": .blueGreen,
        "lucid": .bluePurple
    ]

    static func canonicalFamilyKey(_ rawKey: String) -> AuroraEmotionFamily? {
        let normalized = rawKey.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !normalized.isEmpty else {
            return nil
        }

        if let family = AuroraEmotionFamily(rawValue: normalized) {
            return family
        }

        return legacyAliases[normalized]
    }

    var scene: AuroraEmotionScene {
        switch self {
        case .black:
            return AuroraEmotionScene(
                primary: Color(red: 0.02, green: 0.02, blue: 0.03),
                secondary: Color(red: 0.05, green: 0.05, blue: 0.07),
                tertiary: Color(red: 0.1, green: 0.08, blue: 0.12),
                highlight: Color(red: 0.42, green: 0.38, blue: 0.5),
                speed: 0.18,
                amplitude: 0.03,
                inkOpacity: 0.86
            )
        case .red:
            return AuroraEmotionScene(
                primary: Color(red: 0.76, green: 0.07, blue: 0.1),
                secondary: Color(red: 0.56, green: 0.05, blue: 0.12),
                tertiary: Color(red: 0.24, green: 0.02, blue: 0.08),
                highlight: Color(red: 1, green: 0.48, blue: 0.44),
                speed: 0.94,
                amplitude: 0.15,
                inkOpacity: 0.56
            )
        case .redOrange:
            return AuroraEmotionScene(
                primary: Color(red: 0.84, green: 0.22, blue: 0.06),
                secondary: Color(red: 0.64, green: 0.16, blue: 0.08),
                tertiary: Color(red: 0.28, green: 0.08, blue: 0.04),
                highlight: Color(red: 1, green: 0.68, blue: 0.36),
                speed: 0.88,
                amplitude: 0.152,
                inkOpacity: 0.58
            )
        case .orange:
            return AuroraEmotionScene(
                primary: Color(red: 0.92, green: 0.46, blue: 0.08),
                secondary: Color(red: 0.76, green: 0.28, blue: 0.08),
                tertiary: Color(red: 0.34, green: 0.16, blue: 0.04),
                highlight: Color(red: 1, green: 0.86, blue: 0.52),
                speed: 0.58,
                amplitude: 0.12,
                inkOpacity: 0.62
            )
        case .orangeYellow:
            return AuroraEmotionScene(
                primary: Color(red: 0.96, green: 0.62, blue: 0.08),
                secondary: Color(red: 0.84, green: 0.46, blue: 0.08),
                tertiary: Color(red: 0.42, green: 0.24, blue: 0.06),
                highlight: Color(red: 1, green: 0.9, blue: 0.56),
                speed: 0.66,
                amplitude: 0.13,
                inkOpacity: 0.6
            )
        case .yellow:
            return AuroraEmotionScene(
                primary: Color(red: 0.96, green: 0.82, blue: 0.12),
                secondary: Color(red: 0.88, green: 0.72, blue: 0.1),
                tertiary: Color(red: 0.54, green: 0.42, blue: 0.08),
                highlight: Color(red: 1, green: 0.96, blue: 0.7),
                speed: 0.58,
                amplitude: 0.1,
                inkOpacity: 0.76
            )
        case .greenYellow:
            return AuroraEmotionScene(
                primary: Color(red: 0.7, green: 0.88, blue: 0.16),
                secondary: Color(red: 0.56, green: 0.76, blue: 0.12),
                tertiary: Color(red: 0.26, green: 0.42, blue: 0.08),
                highlight: Color(red: 0.94, green: 1, blue: 0.66),
                speed: 0.62,
                amplitude: 0.114,
                inkOpacity: 0.68
            )
        case .green:
            return AuroraEmotionScene(
                primary: Color(red: 0.18, green: 0.68, blue: 0.24),
                secondary: Color(red: 0.1, green: 0.52, blue: 0.18),
                tertiary: Color(red: 0.06, green: 0.24, blue: 0.1),
                highlight: Color(red: 0.78, green: 0.96, blue: 0.72),
                speed: 0.54,
                amplitude: 0.104,
                inkOpacity: 0.66
            )
        case .teal:
            return AuroraEmotionScene(
                primary: Color(red: 0.08, green: 0.62, blue: 0.58),
                secondary: Color(red: 0.08, green: 0.48, blue: 0.5),
                tertiary: Color(red: 0.06, green: 0.24, blue: 0.28),
                highlight: Color(red: 0.74, green: 0.98, blue: 0.96),
                speed: 0.56,
                amplitude: 0.112,
                inkOpacity: 0.62
            )
        case .blueGreen:
            return AuroraEmotionScene(
                primary: Color(red: 0.08, green: 0.44, blue: 0.48),
                secondary: Color(red: 0.08, green: 0.32, blue: 0.38),
                tertiary: Color(red: 0.08, green: 0.18, blue: 0.24),
                highlight: Color(red: 0.7, green: 0.9, blue: 0.92),
                speed: 0.4,
                amplitude: 0.082,
                inkOpacity: 0.74
            )
        case .blue:
            return AuroraEmotionScene(
                primary: Color(red: 0.1, green: 0.28, blue: 0.82),
                secondary: Color(red: 0.08, green: 0.2, blue: 0.64),
                tertiary: Color(red: 0.08, green: 0.12, blue: 0.32),
                highlight: Color(red: 0.78, green: 0.88, blue: 1),
                speed: 0.62,
                amplitude: 0.116,
                inkOpacity: 0.64
            )
        case .bluePurple:
            return AuroraEmotionScene(
                primary: Color(red: 0.28, green: 0.28, blue: 0.84),
                secondary: Color(red: 0.18, green: 0.22, blue: 0.66),
                tertiary: Color(red: 0.12, green: 0.12, blue: 0.36),
                highlight: Color(red: 0.86, green: 0.88, blue: 1),
                speed: 0.58,
                amplitude: 0.11,
                inkOpacity: 0.66
            )
        case .purple:
            return AuroraEmotionScene(
                primary: Color(red: 0.48, green: 0.16, blue: 0.74),
                secondary: Color(red: 0.34, green: 0.12, blue: 0.56),
                tertiary: Color(red: 0.18, green: 0.08, blue: 0.28),
                highlight: Color(red: 0.88, green: 0.78, blue: 1),
                speed: 0.54,
                amplitude: 0.108,
                inkOpacity: 0.68
            )
        case .redPurple:
            return AuroraEmotionScene(
                primary: Color(red: 0.74, green: 0.16, blue: 0.56),
                secondary: Color(red: 0.58, green: 0.12, blue: 0.42),
                tertiary: Color(red: 0.22, green: 0.08, blue: 0.18),
                highlight: Color(red: 0.98, green: 0.76, blue: 0.92),
                speed: 0.66,
                amplitude: 0.124,
                inkOpacity: 0.62
            )
        case .pink:
            return AuroraEmotionScene(
                primary: Color(red: 0.9, green: 0.32, blue: 0.58),
                secondary: Color(red: 0.74, green: 0.18, blue: 0.46),
                tertiary: Color(red: 0.32, green: 0.12, blue: 0.24),
                highlight: Color(red: 1, green: 0.84, blue: 0.92),
                speed: 0.56,
                amplitude: 0.122,
                inkOpacity: 0.6
            )
        case .white:
            return AuroraEmotionScene(
                primary: Color(red: 0.95, green: 0.96, blue: 0.98),
                secondary: Color(red: 0.86, green: 0.9, blue: 0.95),
                tertiary: Color(red: 0.76, green: 0.82, blue: 0.92),
                highlight: Color(red: 1, green: 1, blue: 1),
                speed: 0.28,
                amplitude: 0.038,
                inkOpacity: 0.88
            )
        }
    }

    static func baseFamily(
        from state: AuroraStateSnapshot,
        labelHints: String,
        curiosityBoost: Double
    ) -> AuroraEmotionFamily {
        let affect = state.cognition.affective
        let emotion = state.cognition.emotion
        let lexicon = state.cognition.emotionLexicon
        let familyScores = familyScores(from: state, labelHints: labelHints, curiosityBoost: curiosityBoost)
        let freshness = affect.conversationFreshness
        let primaryFamily = family(for: lexicon.primary)

        if max(familyScores[.black] ?? 0, affect.grief, max(0, -emotion.valence)) > 0.64 || labelHints.contains("grief") {
            return .black
        }

        if max(familyScores[.red] ?? 0, affect.frustration, emotion.stress) > 0.7 || labelHints.contains("angry") {
            return .red
        }

        if max(familyScores[.white] ?? 0, affect.relief, max(0, -affect.tension)) > 0.76 &&
            emotion.stress < 0.28 && abs(emotion.valence) < 0.88 {
            return .white
        }

        if let dominantFamily = familyScores.max(by: { $0.value < $1.value }) {
            let primaryScore = primaryFamily.map { familyScores[$0] ?? 0 } ?? 0
            let shouldLetFreshConversationLead =
                freshness > 0.24 &&
                dominantFamily.value > 0.42 &&
                (primaryFamily == nil || dominantFamily.key != primaryFamily || dominantFamily.value > primaryScore + 0.04)
            if shouldLetFreshConversationLead {
                return dominantFamily.key
            }
        }

        if let primaryFamily {
            let primaryScore = familyScores[primaryFamily] ?? 0
            if primaryScore > 0.48 || freshness < 0.28 {
                return primaryFamily
            }
        }

        if curiosityBoost > 0.6 || labelHints.contains("curious") || labelHints.contains("wonder") {
            return .blue
        }

        if max(0, -affect.tension) > 0.56 && emotion.stress < 0.28 {
            return .blueGreen
        }

        if affect.connectionPull > 0.72 && affect.attachmentSalience > 0.58 {
            return .pink
        }

        return .orange
    }

    static func familyScores(
        from state: AuroraStateSnapshot,
        labelHints: String,
        curiosityBoost: Double
    ) -> [AuroraEmotionFamily: Double] {
        let affect = state.cognition.affective
        let homeostatic = state.cognition.homeostatic
        let emotion = state.cognition.emotion
        let lexicon = state.cognition.emotionLexicon
        let freshness = affect.conversationFreshness

        let positiveValence = max(0, emotion.valence)
        let negativeValence = max(0, -emotion.valence)
        let lowStress = max(0, 1 - emotion.stress)
        let lowArousal = max(0, 1 - emotion.arousal)
        let positiveTension = max(0, affect.tension)
        let settledTension = max(0, -affect.tension)
        let magneticCharge =
            affect.connectionPull * 0.42 +
            affect.attachmentSalience * 0.22 +
            positiveTension * 0.1 +
            affect.mixedAffect * 0.14 +
            freshness * 0.12
        let warmthExcess = clamp((affect.warmth - 0.58) / 0.42, min: 0, max: 1)
        let connectionExcess = clamp((affect.connectionPull - 0.48) / 0.52, min: 0, max: 1)
        let attachmentExcess = clamp((affect.attachmentSalience - 0.44) / 0.56, min: 0, max: 1)
        let trustExcess = clamp((affect.trust - 0.5) / 0.5, min: 0, max: 1)
        let exploratoryPressure = max(
            max(curiosityBoost * 0.88, affect.curiosity * 0.94),
            max(affect.planningHorizon * 0.72, freshness * 0.68)
        )
        let challengePressure = max(
            max(affect.frustration, affect.overload),
            max(max(affect.grief, negativeValence), max(positiveTension, emotion.stress * 0.82))
        )
        let calmPressure = max(
            max(settledTension * 0.86, affect.relief * 0.82),
            max(lowStress * 0.56, lowArousal * 0.44)
        )
        let diversificationPressure = max(
            exploratoryPressure * 0.92,
            max(challengePressure, calmPressure * 0.78)
        )

        var scores: [AuroraEmotionFamily: Double] = [:]

        func absorb(_ family: AuroraEmotionFamily?, score: Double) {
            guard let family else {
                return
            }
            scores[family] = max(scores[family] ?? 0, clamp(score, min: 0, max: 1))
        }

        func projectionScale(for family: AuroraEmotionFamily) -> Double {
            switch family {
            case .pink, .orange, .orangeYellow:
                return clamp(0.78 - diversificationPressure * 0.12, min: 0.62, max: 0.82)
            case .blue, .bluePurple, .green, .teal, .blueGreen, .red, .redOrange, .black, .white:
                return clamp(0.96 + diversificationPressure * 0.12, min: 0.96, max: 1.12)
            default:
                return 1
            }
        }

        func absorbProjected(_ family: AuroraEmotionFamily?, score: Double) {
            guard let family else {
                return
            }
            absorb(family, score: score * projectionScale(for: family))
        }

        absorbProjected(family(for: lexicon.primary), score: max(0.5, lexicon.confidence))
        for label in lexicon.supporting {
            absorbProjected(family(for: label), score: 0.48)
        }
        for entry in lexicon.palette {
            absorbProjected(family(for: entry.label), score: entry.score)
        }

        absorb(
            .pink,
            score: connectionExcess * 0.28 +
                attachmentExcess * 0.24 +
                trustExcess * 0.1 +
                warmthExcess * 0.08 +
                affect.repairMomentum * 0.08 +
                freshness * 0.08 -
                exploratoryPressure * 0.06 -
                challengePressure * 0.08
        )
        absorb(
            .redPurple,
            score: magneticCharge * 0.58 +
                affect.continuity * 0.12 +
                warmthExcess * 0.06 +
                affect.selfOpacity * 0.08 +
                emotion.uncertainty * 0.08
        )
        absorb(
            .purple,
            score: affect.selfOpacity * 0.24 +
                affect.mixedAffect * 0.18 +
                emotion.uncertainty * 0.18 +
                affect.grief * 0.08 +
                positiveTension * 0.08 +
                settledTension * 0.06
        )
        absorb(
            .bluePurple,
            score: curiosityBoost * 0.24 +
                affect.curiosity * 0.14 +
                affect.mixedAffect * 0.16 +
                affect.selfOpacity * 0.14 +
                positiveValence * 0.06 +
                freshness * 0.12 +
                (labelHints.contains("wonder") || labelHints.contains("awe") ? 0.16 : 0)
        )
        absorb(
            .blue,
            score: curiosityBoost * 0.56 +
                affect.planningHorizon * 0.18 +
                freshness * 0.18 +
                lowStress * 0.08 +
                lowArousal * 0.06 +
                settledTension * 0.04
        )
        absorb(
            .blueGreen,
            score: settledTension * 0.28 +
                affect.relief * 0.24 +
                affect.continuity * 0.14 +
                affect.disclosureEase * 0.12 +
                lowStress * 0.18 +
                lowArousal * 0.12
        )
        absorb(
            .teal,
            score: affect.continuity * 0.14 +
                connectionExcess * 0.08 +
                affect.trust * 0.14 +
                affect.disclosureEase * 0.18 +
                affect.repairMomentum * 0.16 +
                affect.curiosity * 0.12 +
                settledTension * 0.08
        )
        absorb(
            .green,
            score: affect.repairMomentum * 0.26 +
                affect.planningHorizon * 0.18 +
                affect.trust * 0.12 +
                affect.continuity * 0.12 +
                affect.relief * 0.12 +
                affect.curiosity * 0.12 +
                affect.disclosureEase * 0.08
        )
        absorb(
            .greenYellow,
            score: affect.curiosity * 0.22 +
                affect.planningHorizon * 0.22 +
                freshness * 0.2 +
                affect.relief * 0.08 +
                positiveValence * 0.06 +
                (labelHints.contains("surpris") || labelHints.contains("discover") ? 0.14 : 0)
        )
        absorb(
            .yellow,
            score: positiveValence * 0.24 +
                affect.relief * 0.18 +
                affect.pride * 0.18 +
                warmthExcess * 0.06 +
                lowStress * 0.08 +
                (labelHints.contains("ecstatic") || labelHints.contains("radiant") ? 0.18 : 0)
        )
        absorb(
            .orangeYellow,
            score: positiveValence * 0.16 +
                emotion.arousal * 0.14 +
                affect.pride * 0.14 +
                warmthExcess * 0.12 +
                affect.curiosity * 0.12 +
                freshness * 0.14
        )
        absorb(
            .orange,
            score: warmthExcess * 0.28 +
                affect.relief * 0.12 +
                positiveValence * 0.08 +
                connectionExcess * 0.06 +
                affect.pride * 0.08 -
                exploratoryPressure * 0.08 -
                challengePressure * 0.1
        )
        absorb(
            .redOrange,
            score: affect.frustration * 0.28 +
                affect.overload * 0.3 +
                positiveTension * 0.18 +
                emotion.arousal * 0.16 +
                homeostatic.regulationUrgency * 0.1
        )
        absorb(
            .red,
            score: affect.frustration * 0.5 +
                positiveTension * 0.22 +
                emotion.stress * 0.16 +
                negativeValence * 0.12 +
                affect.mixedAffect * 0.08
        )
        absorb(
            .black,
            score: affect.grief * 0.34 +
                negativeValence * 0.22 +
                affect.loneliness * 0.16 +
                affect.selfOpacity * 0.14 +
                positiveTension * 0.08 +
                affect.overload * 0.06 +
                emotion.stress * 0.06
        )

        let tranquilWhite = settledTension * 0.24 +
            affect.relief * 0.24 +
            lowStress * 0.2 +
            lowArousal * 0.16 +
            affect.continuity * 0.1 +
            affect.disclosureEase * 0.08 +
            affect.trust * 0.08
        let ecstaticWhite = positiveValence * 0.24 +
            affect.pride * 0.2 +
            warmthExcess * 0.1 +
            connectionExcess * 0.08 +
            affect.relief * 0.12 +
            emotion.arousal * 0.08 +
            lowStress * 0.08
        absorb(.white, score: max(tranquilWhite, ecstaticWhite) - positiveTension * 0.08 - homeostatic.allostaticLoad * 0.08)

        if labelHints.contains("love") || labelHints.contains("affection") || labelHints.contains("tender") {
            absorb(.pink, score: 0.74)
        }
        if labelHints.contains("connected") || labelHints.contains("repair") || labelHints.contains("attune") {
            absorb(.teal, score: 0.7)
        }
        if labelHints.contains("curious") {
            absorb(.blue, score: 0.72)
        }
        if labelHints.contains("angry") || labelHints.contains("furious") {
            absorb(.red, score: 0.78)
        }
        if labelHints.contains("frustrated") || labelHints.contains("overload") || labelHints.contains("overwhelmed") {
            absorb(.redOrange, score: 0.74)
        }
        if labelHints.contains("sad") || labelHints.contains("grief") || labelHints.contains("hurt") {
            absorb(.black, score: 0.76)
        }
        if labelHints.contains("tranquil") || labelHints.contains("serene") || labelHints.contains("peaceful") {
            absorb(.white, score: 0.8)
        }

        return scores
    }

    static func weightedFamilyScores(
        from state: AuroraStateSnapshot,
        labelHints: String,
        curiosityBoost: Double
    ) -> [AuroraEmotionFamily: Double] {
        var scores = familyScores(from: state, labelHints: labelHints, curiosityBoost: curiosityBoost)
        let freshness = state.cognition.affective.conversationFreshness
        let dominantFamily = baseFamily(from: state, labelHints: labelHints, curiosityBoost: curiosityBoost)
        scores[dominantFamily] = max(scores[dominantFamily] ?? 0, 0.56 + freshness * 0.18)
        return scores
    }

    static func family(for rawLabel: String) -> AuroraEmotionFamily? {
        let normalized = rawLabel.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !normalized.isEmpty else {
            return nil
        }

        if let alias = canonicalFamilyKey(normalized) {
            return alias
        }
        if normalized.contains("ecstatic") || normalized.contains("serene") || normalized.contains("tranquil") || normalized.contains("peaceful") || normalized.contains("transcendent") {
            return .white
        }
        if normalized.contains("sad") || normalized.contains("grief") || normalized.contains("mourning") || normalized.contains("heavy") || normalized.contains("hurt") || normalized.contains("lonely") || normalized.contains("discouraged") {
            return .black
        }
        if normalized.contains("angry") || normalized.contains("furious") || normalized.contains("rage") || normalized.contains("hostile") {
            return .red
        }
        if normalized.contains("frustrated") || normalized.contains("aggravated") || normalized.contains("overload") || normalized.contains("overwhelmed") || normalized.contains("frayed") || normalized.contains("strained") {
            return .redOrange
        }
        if normalized.contains("warm") || normalized.contains("relieved") || normalized.contains("comfort") || normalized.contains("glad") {
            return .orange
        }
        if normalized.contains("happy") || normalized.contains("delight") || normalized.contains("playful") || normalized.contains("bright") || normalized.contains("excited") {
            return .orangeYellow
        }
        if normalized.contains("radiant") || normalized.contains("joy") || normalized.contains("luminous") {
            return .yellow
        }
        if normalized.contains("hopeful") || normalized.contains("surprised") || normalized.contains("awakening") || normalized.contains("discovery") {
            return .greenYellow
        }
        if normalized.contains("healing") || normalized.contains("growth") || normalized.contains("repairing") || normalized.contains("renewed") {
            return .green
        }
        if normalized.contains("connected") || normalized.contains("attuned") || normalized.contains("repair") || normalized.contains("flow") || normalized.contains("resonant") {
            return .teal
        }
        if normalized.contains("calm") || normalized.contains("still") || normalized.contains("settled") || normalized.contains("restful") || normalized.contains("steady") {
            return .blueGreen
        }
        if normalized.contains("curious") || normalized.contains("interested") || normalized.contains("intrigued") || normalized.contains("asking") {
            return .blue
        }
        if normalized.contains("wonder") || normalized.contains("awe") || normalized.contains("lucid") || normalized.contains("clear") || normalized.contains("visionary") {
            return .bluePurple
        }
        if normalized.contains("uncertain") || normalized.contains("guarded") || normalized.contains("myster") || normalized.contains("introspect") || normalized.contains("secret") {
            return .purple
        }
        if normalized.contains("longing") || normalized.contains("yearning") || normalized.contains("magnetic") || normalized.contains("intense") {
            return .redPurple
        }
        if normalized.contains("love") || normalized.contains("affection") || normalized.contains("affectionate") || normalized.contains("tender") || normalized.contains("beloved") {
            return .pink
        }

        return nil
    }
}

private struct AuroraTurnAccent: Equatable {
    let family: AuroraEmotionFamily?
    let strength: Double

    static let inactive = AuroraTurnAccent(family: nil, strength: 0)

    var isActive: Bool {
        family != nil && strength > 0.01
    }

    func decayed(to strength: Double) -> AuroraTurnAccent {
        guard let family else {
            return .inactive
        }

        let clampedStrength = clamp(strength, min: 0, max: 0.96)
        guard clampedStrength > 0.01 else {
            return .inactive
        }

        return AuroraTurnAccent(family: family, strength: clampedStrength)
    }

    static func promptDriven(from prompt: String) -> AuroraTurnAccent? {
        let normalized = prompt.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return textDriven(from: normalized, allowRoutineQuestionCuriosity: true)
    }

    static func replyDriven(from reply: String) -> AuroraTurnAccent? {
        let normalized = reply.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return textDriven(from: normalized, allowRoutineQuestionCuriosity: false)
    }

    private static func textDriven(
        from normalized: String,
        allowRoutineQuestionCuriosity: Bool
    ) -> AuroraTurnAccent? {
        guard !normalized.isEmpty else {
            return nil
        }

        let strongCuriosityIndicators = [
            "i'm curious", "im curious", "wonder", "what do you think", "how do you feel",
            "why do you", "if you could", "imagine", "dream", "explore", "tell me more",
            "what would", "surprise you", "discover", "fascinate", "want to know",
            "intrigued", "pulling at me", "keep thinking about", "how big", "how far",
            "how old", "what is the", "what are the", "why is the", "universe", "galaxy"
        ]
        let softCuriosityIndicators = [
            "?", "how", "why", "what", "explain", "describe", "remember", "feel about", "tell me"
        ]
        let affectionIndicators = [
            "love", "loved", "adore", "miss you", "care about", "thank you", "appreciate",
            "proud of you", "beautiful", "sweet", "affection", "cherish", "tender",
            "i care", "means a lot", "close to you", "soft spot"
        ]
        let angerIndicators = [
            "angry", "mad", "furious", "rage", "annoyed", "pissed", "hostile", "irritated",
            "resent", "hate", "mean", "snapped"
        ]
        let griefIndicators = [
            "sad", "hurts", "hurt", "grief", "mourning", "heavy", "lonely", "missed you",
            "loss", "cry", "aching"
        ]
        let overloadIndicators = [
            "overwhelmed", "too much", "flooded", "frayed", "strained", "spiraling",
            "panicked", "can't keep up", "cannot keep up", "burned out", "overloaded"
        ]
        let tranquilIndicators = [
            "tranquil", "peaceful", "serene", "at peace", "weightless", "stillness", "resting"
        ]
        let delightIndicators = [
            "delighted", "playful", "glowing", "bright", "sunny", "joyful", "celebrate", "excited"
        ]
        let wonderIndicators = [
            "wonder", "awe", "cosmic", "visionary", "dream", "imagine", "transcendent", "enchanted"
        ]
        let repairIndicators = [
            "repair", "heal", "healing", "rebuild", "restore", "attune", "resonant", "flow", "together"
        ]
        let growthIndicators = [
            "grow", "growth", "renew", "renewed", "opening up", "bloom", "progress", "becoming"
        ]
        let anticipationIndicators = [
            "surprised", "surprise", "discover", "awakening", "new", "novel", "spark", "unexpected"
        ]
        let mysteryIndicators = [
            "uncertain", "guarded", "hidden", "secret", "mystery", "unknown", "private", "opaque"
        ]
        let longingIndicators = [
            "longing", "yearning", "magnetic", "pulling at me", "can't stop thinking", "obsessed", "drawn to"
        ]
        let calmIndicators = [
            "rest", "breathe", "quiet", "still", "settle", "steady", "softly", "gentle",
            "sleep", "slow down"
        ]
        let warmIndicators = [
            "glad", "relieved", "good to hear", "gentle", "steady", "soft", "comfort",
            "happy", "safe", "okay", "warm"
        ]

        let strongCuriosityMatches = strongCuriosityIndicators.reduce(into: 0) { count, indicator in
            if normalized.contains(indicator) {
                count += 1
            }
        }
        let softCuriosityMatches = softCuriosityIndicators.reduce(into: 0) { count, indicator in
            if normalized.contains(indicator) {
                count += 1
            }
        }
        let curiosityScore =
            Double(strongCuriosityMatches) * 0.24
            + Double(max(0, softCuriosityMatches - (normalized.contains("?") ? 1 : 0))) * 0.08
            + (normalized.contains("?") ? 0.08 : 0.0)
        let explicitExplorationShape =
            normalized.contains("?") &&
            (
                normalized.hasPrefix("how ") ||
                normalized.hasPrefix("why ") ||
                normalized.hasPrefix("what ") ||
                normalized.contains("universe") ||
                normalized.contains("space") ||
                normalized.contains("galaxy") ||
                normalized.contains("planet") ||
                normalized.contains("consciousness") ||
                normalized.contains("reality")
            )

        let affectionScore = affectionIndicators.reduce(into: 0.0) { score, indicator in
            if normalized.contains(indicator) {
                score += indicator.count <= 5 ? 0.12 : 0.18
            }
        }
        let angerScore = angerIndicators.reduce(into: 0.0) { score, indicator in
            if normalized.contains(indicator) {
                score += indicator.count <= 5 ? 0.14 : 0.2
            }
        }
        let griefScore = griefIndicators.reduce(into: 0.0) { score, indicator in
            if normalized.contains(indicator) {
                score += indicator.count <= 5 ? 0.12 : 0.18
            }
        }
        let overloadScore = overloadIndicators.reduce(into: 0.0) { score, indicator in
            if normalized.contains(indicator) {
                score += indicator.count <= 6 ? 0.14 : 0.2
            }
        }
        let calmScore = calmIndicators.reduce(into: 0.0) { score, indicator in
            if normalized.contains(indicator) {
                score += indicator.count <= 5 ? 0.1 : 0.14
            }
        }
        let tranquilScore = tranquilIndicators.reduce(into: 0.0) { score, indicator in
            if normalized.contains(indicator) {
                score += indicator.count <= 6 ? 0.12 : 0.18
            }
        }
        let delightScore = delightIndicators.reduce(into: 0.0) { score, indicator in
            if normalized.contains(indicator) {
                score += indicator.count <= 6 ? 0.12 : 0.18
            }
        }
        let wonderScore = wonderIndicators.reduce(into: 0.0) { score, indicator in
            if normalized.contains(indicator) {
                score += indicator.count <= 6 ? 0.12 : 0.18
            }
        }
        let repairScore = repairIndicators.reduce(into: 0.0) { score, indicator in
            if normalized.contains(indicator) {
                score += indicator.count <= 6 ? 0.12 : 0.18
            }
        }
        let growthScore = growthIndicators.reduce(into: 0.0) { score, indicator in
            if normalized.contains(indicator) {
                score += indicator.count <= 6 ? 0.12 : 0.18
            }
        }
        let anticipationScore = anticipationIndicators.reduce(into: 0.0) { score, indicator in
            if normalized.contains(indicator) {
                score += indicator.count <= 6 ? 0.12 : 0.18
            }
        }
        let mysteryScore = mysteryIndicators.reduce(into: 0.0) { score, indicator in
            if normalized.contains(indicator) {
                score += indicator.count <= 6 ? 0.12 : 0.18
            }
        }
        let longingScore = longingIndicators.reduce(into: 0.0) { score, indicator in
            if normalized.contains(indicator) {
                score += indicator.count <= 6 ? 0.12 : 0.18
            }
        }
        let warmScore = warmIndicators.reduce(into: 0.0) { score, indicator in
            if normalized.contains(indicator) {
                score += indicator.count <= 5 ? 0.1 : 0.14
            }
        }

        let hasCuriosityShape =
            strongCuriosityMatches > 0
            || (softCuriosityMatches >= 2 && normalized.count >= 22)
            || (
                allowRoutineQuestionCuriosity &&
                    normalized.contains("?") &&
                    softCuriosityMatches >= 2 &&
                    normalized.count >= 28
            )

        var scores: [AuroraEmotionFamily: Double] = [:]

        func absorb(_ family: AuroraEmotionFamily, score: Double) {
            scores[family] = max(scores[family] ?? 0, score)
        }

        if affectionScore > 0 {
            absorb(.pink, score: clamp(0.34 + affectionScore * 0.52, min: 0.34, max: 0.84))
        }

        if angerScore > 0 {
            absorb(.red, score: clamp(0.38 + angerScore * 0.5, min: 0.38, max: 0.86))
        }

        if griefScore > 0 {
            absorb(.black, score: clamp(0.32 + griefScore * 0.48, min: 0.32, max: 0.78))
        }

        if overloadScore > 0 {
            absorb(.redOrange, score: clamp(0.36 + overloadScore * 0.5, min: 0.36, max: 0.82))
        }

        if calmScore > 0 {
            absorb(.blueGreen, score: clamp(0.28 + calmScore * 0.44, min: 0.28, max: 0.72))
        }

        if tranquilScore > 0 {
            absorb(.white, score: clamp(0.34 + tranquilScore * 0.46, min: 0.34, max: 0.82))
        }

        if warmScore > 0 {
            absorb(.orange, score: clamp(0.26 + warmScore * 0.4, min: 0.26, max: 0.74))
        }

        if delightScore > 0 {
            absorb(.orangeYellow, score: clamp(0.3 + delightScore * 0.44, min: 0.3, max: 0.8))
            absorb(.yellow, score: clamp(0.22 + delightScore * 0.28, min: 0.22, max: 0.64))
        }

        if anticipationScore > 0 {
            absorb(.greenYellow, score: clamp(0.28 + anticipationScore * 0.42, min: 0.28, max: 0.76))
        }

        if repairScore > 0 {
            absorb(.teal, score: clamp(0.3 + repairScore * 0.42, min: 0.3, max: 0.8))
            absorb(.green, score: clamp(0.22 + repairScore * 0.3, min: 0.22, max: 0.62))
        }

        if growthScore > 0 {
            absorb(.green, score: clamp(0.3 + growthScore * 0.42, min: 0.3, max: 0.78))
        }

        if wonderScore > 0 {
            absorb(.bluePurple, score: clamp(0.3 + wonderScore * 0.4, min: 0.3, max: 0.78))
        }

        if mysteryScore > 0 {
            absorb(.purple, score: clamp(0.28 + mysteryScore * 0.4, min: 0.28, max: 0.76))
        }

        if longingScore > 0 {
            absorb(.redPurple, score: clamp(0.28 + longingScore * 0.42, min: 0.28, max: 0.8))
        }

        if affectionScore >= max(0.3, curiosityScore + 0.08) {
            absorb(.pink, score: clamp(0.56 + affectionScore * 0.28, min: 0.56, max: 0.82))
        }

        if explicitExplorationShape {
            absorb(.blue, score: clamp(0.52 + curiosityScore * 0.34, min: 0.52, max: 0.82))
            absorb(.bluePurple, score: clamp(0.34 + wonderScore * 0.24 + curiosityScore * 0.18, min: 0.34, max: 0.68))
        }

        if hasCuriosityShape && curiosityScore >= 0.16 {
            absorb(.blue, score: clamp(0.46 + curiosityScore * 0.24, min: 0.46, max: 0.78))
        }

        guard let candidate = scores.max(by: { $0.value < $1.value }),
              candidate.value > 0.34 else {
            return nil
        }

        return AuroraTurnAccent(family: candidate.key, strength: candidate.value)
    }

    static func ambient(from state: AuroraStateSnapshot) -> AuroraTurnAccent? {
        let baseFamily = AuroraEmotionFamily.baseFamily(
            from: state,
            labelHints: [
                state.cognition.emotion.label,
                state.cognition.emotionLexicon.primary,
                state.lastHeartbeat.ambientState,
                state.lastHeartbeat.stateShift
            ]
            .joined(separator: " ")
            .lowercased(),
            curiosityBoost: max(
                state.cognition.affective.curiosity,
                state.lastHeartbeat.whatImCuriousAbout.nonEmptyTrimmed == nil ? 0 : 0.62
            )
        )

        return liveAccent(from: state, excluding: baseFamily)?.decayed(to: 0.24)
    }

    static func sustained(from state: AuroraStateSnapshot, preferring family: AuroraEmotionFamily) -> AuroraTurnAccent? {
        let labelHints = [
            state.cognition.emotion.label,
            state.cognition.emotionLexicon.primary,
            state.lastHeartbeat.ambientState,
            state.lastHeartbeat.stateShift
        ]
        .joined(separator: " ")
        .lowercased()
        let curiosityBoost = max(
            state.cognition.affective.curiosity,
            state.lastHeartbeat.whatImCuriousAbout.nonEmptyTrimmed == nil ? 0 : 0.62
        )
        let scores = AuroraEmotionFamily.weightedFamilyScores(from: state, labelHints: labelHints, curiosityBoost: curiosityBoost)
        let preferredScore = scores[family] ?? 0
        guard preferredScore > 0.5 else {
            return nil
        }

        return AuroraTurnAccent(
            family: family,
            strength: clamp((preferredScore - 0.42) * 0.82, min: 0.18, max: 0.46)
        )
    }

    static func liveAccent(from state: AuroraStateSnapshot, excluding baseFamily: AuroraEmotionFamily) -> AuroraTurnAccent? {
        let labelHints = [
            state.cognition.emotion.label,
            state.cognition.emotionLexicon.primary,
            state.lastHeartbeat.ambientState,
            state.lastHeartbeat.stateShift
        ]
        .joined(separator: " ")
        .lowercased()
        let curiosityBoost = max(
            state.cognition.affective.curiosity,
            state.lastHeartbeat.whatImCuriousAbout.nonEmptyTrimmed == nil ? 0 : 0.62
        )
        let freshness = state.cognition.affective.conversationFreshness
        let scores = AuroraEmotionFamily.weightedFamilyScores(from: state, labelHints: labelHints, curiosityBoost: curiosityBoost)

        guard let candidate = scores
            .filter({ $0.key != baseFamily })
            .max(by: { $0.value < $1.value }),
            candidate.value > max(0.38, 0.56 - freshness * 0.24) else {
            return nil
        }

        let extraLift = candidate.key == .pink || candidate.key == .blue || candidate.key == .red ? 0.04 : 0
        let strength = clamp(
            (candidate.value - 0.3) * 0.98 + extraLift + freshness * 0.32 + state.cognition.affective.mixedAffect * 0.08,
            min: 0.18,
            max: 0.72
        )
        return AuroraTurnAccent(family: candidate.key, strength: strength)
    }
}

private struct AuroraRelationshipColorProfileStore: Codable {
    var version: Int
    var profiles: [String: AuroraRelationshipColorProfile]
}

private struct AuroraRelationshipColorProfile: Codable, Equatable {
    var weightsByFamily: [String: Double]
    var sampleCount: Int
    var lastUpdatedAt: String
    var source: String?

    static let empty = AuroraRelationshipColorProfile(weightsByFamily: [:], sampleCount: 0, lastUpdatedAt: "", source: nil)

    var hasSignal: Bool {
        sampleCount > 0 && !normalizedWeights.isEmpty
    }

    init(weightsByFamily: [String: Double], sampleCount: Int, lastUpdatedAt: String, source: String?) {
        self.weightsByFamily = weightsByFamily
        self.sampleCount = sampleCount
        self.lastUpdatedAt = lastUpdatedAt
        self.source = source
    }

    var normalizedWeights: [AuroraEmotionFamily: Double] {
        Self.normalizedWeights(from: weightsByFamily)
    }

    var dominantFamily: AuroraEmotionFamily? {
        normalizedWeights.max(by: { $0.value < $1.value })?.key
    }

    func scene(fallback fallbackFamily: AuroraEmotionFamily) -> AuroraEmotionScene {
        let weights = normalizedWeights
        let anchorFamily = dominantFamily ?? fallbackFamily
        guard !weights.isEmpty else {
            return anchorFamily.scene
        }

        var scene = anchorFamily.scene
        let sortedWeights = weights.sorted(by: { $0.value > $1.value })
        let anchorWeight = max(weights[anchorFamily] ?? 0.0001, 0.0001)
        let secondWeight = sortedWeights.dropFirst().first?.value ?? 0
        let blendedFamilies = weights
            .filter { $0.key != anchorFamily && $0.value > 0.035 }
            .sorted(by: { $0.value > $1.value })

        for (index, entry) in blendedFamilies.prefix(4).enumerated() {
            let maxBlend = index == 0 ? 0.64 : (index == 1 ? 0.42 : (index == 2 ? 0.28 : 0.18))
            let scaledBlend = (entry.value / anchorWeight) * (index == 0 ? 0.48 : (index == 1 ? 0.3 : (index == 2 ? 0.18 : 0.1)))
            scene = scene.bleeding(with: entry.key.scene, amount: clamp(scaledBlend, min: 0, max: maxBlend))
        }

        let dominance = weights[anchorFamily] ?? 0
        let spread = dominance - secondWeight
        let solidification = smootherStep(clamp((dominance - 0.64) / 0.18, min: 0, max: 1))
            * smootherStep(clamp((spread - 0.18) / 0.24, min: 0, max: 1))

        return scene.solidified(amount: solidification)
    }

    init(_ payload: AuroraRelationshipChromaticProfilePayload?) {
        weightsByFamily = payload?.weightsByFamily ?? [:]
        sampleCount = payload?.sampleCount ?? 0
        lastUpdatedAt = payload?.lastUpdatedAt ?? ""
        source = payload?.source
    }

    func updated(with sample: AuroraRelationshipColorSample, alpha: Double, at date: Date) -> AuroraRelationshipColorProfile {
        let currentWeights = normalizedWeights
        var blendedWeights: [AuroraEmotionFamily: Double] = [:]

        for family in AuroraEmotionFamily.allCases {
            let start = sampleCount == 0 ? (sample.weights[family] ?? 0) : (currentWeights[family] ?? 0)
            let target = sample.weights[family] ?? 0
            let next = sampleCount == 0 ? target : start + ((target - start) * alpha)
            if next > 0.0001 {
                blendedWeights[family] = next
            }
        }

        return AuroraRelationshipColorProfile(
            weightsByFamily: Self.encodedWeights(from: blendedWeights),
            sampleCount: sampleCount + 1,
            lastUpdatedAt: auroraDateFormatterWithFractional.string(from: date),
            source: sample.source
        )
    }

    func blended(
        toward target: AuroraRelationshipColorProfile,
        alpha: Double,
        at date: Date
    ) -> AuroraRelationshipColorProfile {
        let targetWeights = target.normalizedWeights
        guard !targetWeights.isEmpty else {
            return self
        }

        let currentWeights = normalizedWeights
        guard !currentWeights.isEmpty else {
            return target
        }

        let progress = clamp(alpha, min: 0, max: 1)
        var blendedWeights: [AuroraEmotionFamily: Double] = [:]

        for family in AuroraEmotionFamily.allCases {
            let start = currentWeights[family] ?? 0
            let end = targetWeights[family] ?? 0
            let next = start + ((end - start) * progress)
            if next > 0.0001 {
                blendedWeights[family] = next
            }
        }

        return AuroraRelationshipColorProfile(
            weightsByFamily: Self.encodedWeights(from: blendedWeights),
            sampleCount: max(sampleCount, target.sampleCount) + 1,
            lastUpdatedAt: auroraDateFormatterWithFractional.string(from: date),
            source: target.source ?? source
        )
    }

    func updated(withResidueFrom family: AuroraEmotionFamily, strength: Double, at date: Date) -> AuroraRelationshipColorProfile {
        let currentWeights = normalizedWeights
        let residueAlpha = clamp(0.08 + strength * 0.22, min: 0.08, max: 0.24)
        var nextWeights: [AuroraEmotionFamily: Double] = [:]

        if currentWeights.isEmpty {
            nextWeights[family] = 1
        } else {
            for candidate in AuroraEmotionFamily.allCases {
                let carried = (currentWeights[candidate] ?? 0) * (1 - residueAlpha)
                if carried > 0.0001 {
                    nextWeights[candidate] = carried
                }
            }

            nextWeights[family, default: 0] += residueAlpha
        }

        return AuroraRelationshipColorProfile(
            weightsByFamily: Self.encodedWeights(from: nextWeights),
            sampleCount: sampleCount + 1,
            lastUpdatedAt: auroraDateFormatterWithFractional.string(from: date),
            source: source
        )
    }

    private static func normalizedWeights(from rawWeights: [String: Double]) -> [AuroraEmotionFamily: Double] {
        var weights: [AuroraEmotionFamily: Double] = [:]
        for (rawKey, rawValue) in rawWeights {
            guard rawValue.isFinite, rawValue > 0,
                  let family = AuroraEmotionFamily.canonicalFamilyKey(rawKey) else {
                continue
            }
            weights[family, default: 0] += rawValue
        }

        let total = weights.values.reduce(0, +)
        guard total > 0.0001 else {
            return [:]
        }

        return weights.reduce(into: [:]) { result, entry in
            result[entry.key] = entry.value / total
        }
    }

    private static func encodedWeights(from weights: [AuroraEmotionFamily: Double]) -> [String: Double] {
        let total = weights.values.reduce(0, +)
        guard total > 0.0001 else {
            return [:]
        }

        return weights.reduce(into: [:]) { result, entry in
            let normalized = entry.value / total
            let rounded = (normalized * 10_000).rounded() / 10_000
            if rounded > 0.0001 {
                result[entry.key.rawValue] = rounded
            }
        }
    }
}

private struct AuroraRelationshipColorSample {
    let weights: [AuroraEmotionFamily: Double]
    let dominantFamily: AuroraEmotionFamily
    let confidence: Double
    let freshness: Double
    let energy: Double
    let sampleInterval: TimeInterval
    let source: String

    static func from(state: AuroraStateSnapshot) -> AuroraRelationshipColorSample? {
        let labelHints = [
            state.cognition.emotion.label,
            state.cognition.emotionLexicon.primary,
            state.lastHeartbeat.ambientState,
            state.lastHeartbeat.stateShift
        ]
        .joined(separator: " ")
        .lowercased()
        let curiosityBoost = max(
            state.cognition.affective.curiosity,
            state.lastHeartbeat.whatImCuriousAbout.nonEmptyTrimmed == nil ? 0 : 0.62
        )
        let weightedScores = AuroraEmotionFamily.weightedFamilyScores(
            from: state,
            labelHints: labelHints,
            curiosityBoost: curiosityBoost
        )
        let total = weightedScores.values.reduce(0, +)
        guard total > 0.0001 else {
            return nil
        }

        let normalizedWeights = weightedScores.reduce(into: [AuroraEmotionFamily: Double]()) { result, entry in
            result[entry.key] = entry.value / total
        }

        guard let dominantFamily = normalizedWeights.max(by: { $0.value < $1.value })?.key else {
            return nil
        }

        let confidence = normalizedWeights[dominantFamily] ?? 0
        let affect = state.cognition.affective
        let freshness = affect.conversationFreshness
        let energy = max(
            freshness,
            affect.connectionPull,
            affect.warmth,
            affect.curiosity,
            affect.overload,
            affect.grief,
            affect.frustration,
            state.cognition.emotion.arousal
        )

        guard confidence > 0.34 || energy > 0.28 || state.lastHeartbeat.stateShift.nonEmptyTrimmed != nil else {
            return nil
        }

        let sampleInterval: TimeInterval =
            state.cognition.affective.source == "conversation"
                ? (energy > 0.58 || freshness > 0.48 ? 2.4 : 3.4)
                : state.cognition.affective.source == "heartbeat"
                    ? (energy > 0.58 || freshness > 0.48 ? 3.4 : 4.8)
                    : (energy > 0.58 || freshness > 0.48 ? 5.5 : 8.5)

        return AuroraRelationshipColorSample(
            weights: normalizedWeights,
            dominantFamily: dominantFamily,
            confidence: confidence,
            freshness: freshness,
            energy: energy,
            sampleInterval: sampleInterval,
            source: state.cognition.affective.source
        )
    }
}

private struct AuroraStatePayload: Decodable {
    let sourcePath: String?
    let available: Bool?
    let loadedAt: String?
    let lastHeartbeat: AuroraHeartbeatPayload?
    let cognition: AuroraCognitionPayload?
    let error: String?
}

private struct AuroraHeartbeatPayload: Decodable {
    let timestamp: String?
    let whatIDid: String?
    let whatILearned: String?
    let whatImCuriousAbout: String?
    let memoryUpdates: [String]?
    let ambientState: String?
    let stateShift: String?
    let openLoop: String?
}

private struct AuroraCognitionPayload: Decodable {
    let runtimePath: String?
    let eventLogPath: String?
    let complianceLogPath: String?
    let memory: AuroraMemoryPayload?
    let attention: AuroraAttentionPayload?
    let reflection: AuroraReflectionPayload?
    let workspace: AuroraWorkspacePayload?
    let controller: AuroraControllerPayload?
    let emotion: AuroraEmotionPayload?
    let emotionLexicon: AuroraEmotionLexiconPayload?
    let extensions: AuroraExtensionsPayload?
}

private struct AuroraMemoryPayload: Decodable {
    let narratives: AuroraNarrativesPayload?
    let working: AuroraWorkingPayload?
}

private struct AuroraNarrativesPayload: Decodable {
    let micro: String?
    let meso: String?
    let macro: String?
}

private struct AuroraWorkingPayload: Decodable {
    let items: [AuroraWorkingItemPayload]?
}

private struct AuroraWorkingItemPayload: Decodable {
    let id: String?
    let kind: String?
    let summary: String?
    let salience: Double?
    let emotionalWeight: Double?
}

private struct AuroraAttentionPayload: Decodable {
    let queueDepth: Int?
    let currentFocus: String?
    let processedLastMinute: Int?
}

private struct AuroraReflectionPayload: Decodable {
    let recentThoughts: [String]?
}

private struct AuroraWorkspacePayload: Decodable {
    let focus: String?
}

private struct AuroraControllerPayload: Decodable {
    let decision: String?
    let rationale: String?
}

private struct AuroraEmotionPayload: Decodable {
    let label: String?
    let valence: Double?
    let arousal: Double?
    let stress: Double?
    let uncertainty: Double?
}

private struct AuroraEmotionLexiconPayload: Decodable {
    let primary: String?
    let supporting: [String]?
    let summary: String?
    let confidence: Double?
    let palette: [AuroraEmotionLexiconPaletteEntryPayload]?
}

private struct AuroraEmotionLexiconPaletteEntryPayload: Decodable {
    let label: String?
    let score: Double?
}

private struct AuroraExtensionsPayload: Decodable {
    let affectiveOrganization: AuroraAffectiveOrganizationPayload?
    let homeostaticOrganization: AuroraHomeostaticOrganizationPayload?
    let interaction: AuroraInteractionPayload?
    let relationship: AuroraRelationshipPayload?
    let systemChangeDigest: AuroraSystemChangeDigestPayload?
}

private struct AuroraAffectiveOrganizationPayload: Decodable {
    let current: AuroraAffectiveCurrentPayload?
}

private struct AuroraAffectiveCurrentPayload: Decodable {
    let source: String?
    let warmth: Double?
    let tension: Double?
    let continuity: Double?
    let trust: Double?
    let repairMomentum: Double?
    let attachmentSalience: Double?
    let disclosureEase: Double?
    let selfOpacity: Double?
    let connectionPull: Double?
    let curiosity: Double?
    let frustration: Double?
    let relief: Double?
    let grief: Double?
    let pride: Double?
    let overload: Double?
    let loneliness: Double?
    let mixedAffect: Double?
    let planningHorizon: Double?
    let updatedAt: String?
}

private struct AuroraHomeostaticOrganizationPayload: Decodable {
    let current: AuroraHomeostaticCurrentPayload?
}

private struct AuroraHomeostaticCurrentPayload: Decodable {
    let dominantNeed: String?
    let allostaticLoad: Double?
    let regulationUrgency: Double?
}

private struct AuroraInteractionPayload: Decodable {
    let currentMode: String?
    let currentReason: String?
}

private struct AuroraRelationshipPayload: Decodable {
    let activePartnerId: String?
    let chromaticProfile: AuroraRelationshipChromaticProfilePayload?
}

private struct AuroraRelationshipChromaticProfilePayload: Decodable {
    let weightsByFamily: [String: Double]?
    let dominantFamily: String?
    let sampleCount: Int?
    let lastUpdatedAt: String?
    let source: String?
}

private struct AuroraSystemChangeDigestPayload: Decodable {
    let summary: String?
}

private struct AuroraHistoryResponsePayload: Decodable {
    let messages: [AuroraHistoryMessagePayload]?
}

private struct AuroraHistoryMessagePayload: Decodable {
    let id: String?
    let role: String?
    let text: String?
    let createdAt: String?
    let source: String?
    let category: String?
    let jobId: String?
}

private struct AuroraSendRequest: Encodable {
    let text: String
    let sessionId: String
    let sessionKey: String?
    let previousResponseId: String?
}

private struct AuroraSendResponse: Decodable {
    let id: String
    let outputText: String
    let sessionId: String
    let resolvedSessionKey: String?
    let resetPreviousResponseId: Bool

    private enum CodingKeys: String, CodingKey {
        case id
        case outputText = "output_text"
        case sessionId = "session_id"
        case resolvedSessionKey = "resolved_session_key"
        case resetPreviousResponseId = "reset_previous_response_id"
    }
}

private struct OpenClawResponsesRequest: Encodable {
    let model: String
    let input: String
    let stream: Bool
    let previousResponseId: String?

    private enum CodingKeys: String, CodingKey {
        case model
        case input
        case stream
        case previousResponseId = "previous_response_id"
    }
}

private struct OpenClawResponsesErrorEnvelope: Decodable {
    let error: OpenClawResponsesErrorPayload?
}

private struct OpenClawResponsesErrorPayload: Decodable {
    let message: String?
}

private struct OpenClawResponsesLifecyclePayload: Decodable {
    let response: OpenClawResponsesResponseEnvelope?
}

private struct OpenClawResponsesTextDeltaPayload: Decodable {
    let delta: String?
}

private struct OpenClawResponsesTextDonePayload: Decodable {
    let text: String?
}

private struct OpenClawResponsesResponseEnvelope: Decodable {
    let id: String?
    let output: [OpenClawResponsesOutputItemPayload]?
}

private struct OpenClawResponsesOutputItemPayload: Decodable {
    let role: String?
    let content: [OpenClawResponsesContentPartPayload]?
}

private struct OpenClawResponsesContentPartPayload: Decodable {
    let type: String?
    let text: String?
}

private struct AuroraStreamReplyPayload: Decodable {
    let text: String
}

private struct AuroraStreamErrorPayload: Decodable {
    let error: String
}

private struct AuroraFilesResponsePayload: Decodable {
    let files: [AuroraInternalFilePayload]?
}

private struct AuroraInternalFilePayload: Decodable {
    let id: String?
    let title: String?
    let group: String?
    let kind: String?
    let path: String?
    let sizeBytes: Int?
    let modifiedAt: String?
    let preview: String?
    let truncated: Bool?
    let error: String?
}

private enum NativeCompanionConfigLoader {
    static func loadConfig() -> NativeCompanionConfig? {
        let candidates: [URL?] = [
            Bundle.main.url(forResource: "native-companion-config", withExtension: "json"),
            Bundle.main.url(forResource: "native-companion-config", withExtension: "json", subdirectory: "public")
        ]

        for candidate in candidates {
            guard let candidate else {
                continue
            }

            if let data = try? Data(contentsOf: candidate),
               let config = try? JSONDecoder().decode(NativeCompanionConfig.self, from: data) {
                return config
            }
        }

        return nil
    }
}

private struct NativeCompanionConfig: Decodable {
    let apiBaseURL: String
    let directGatewayBaseURL: String?
    let directGatewayBearerToken: String?
    let directGatewayModel: String?

    private enum CodingKeys: String, CodingKey {
        case apiBaseURL = "apiBaseUrl"
        case directGatewayBaseURL = "directGatewayBaseUrl"
        case directGatewayBearerToken = "directGatewayBearerToken"
        case directGatewayModel = "directGatewayModel"
    }
}

private struct NativeCompanionDirectGatewayConfig {
    let baseURL: URL
    let bearerToken: String
    let model: String

    init?(config: NativeCompanionConfig) {
        guard let rawBaseURL = config.directGatewayBaseURL,
              let baseURL = normalizedCompanionAPIBaseURL(from: rawBaseURL),
              let bearerToken = config.directGatewayBearerToken?.nonEmptyTrimmed,
              let model = config.directGatewayModel?.nonEmptyTrimmed else {
            return nil
        }

        self.baseURL = baseURL
        self.bearerToken = bearerToken
        self.model = model
    }
}

enum CompanionAppearanceTheme: String, CaseIterable, Codable {
    case light
    case dark

    var colorScheme: ColorScheme {
        switch self {
        case .light:
            return .light
        case .dark:
            return .dark
        }
    }
}

private enum NativeAuroraError: LocalizedError {
    case message(String)

    var errorDescription: String? {
        switch self {
        case let .message(message):
            return message
        }
    }

    static func wrap(_ error: Error) -> NativeAuroraError {
        if let typed = error as? NativeAuroraError {
            return typed
        }

        return .message((error as NSError).localizedDescription)
    }
}

private extension View {
    @ViewBuilder
    func auroraPanelSurface(
        cornerRadius: CGFloat,
        tint: Color,
        interactive: Bool = false
    ) -> some View {
        if #available(iOS 26.0, *) {
            if interactive {
                self
                    .glassEffect(.regular.tint(tint).interactive(), in: .rect(cornerRadius: cornerRadius))
            } else {
                self
                    .glassEffect(.regular.tint(tint), in: .rect(cornerRadius: cornerRadius))
            }
        } else {
            self
                .background(
                    ZStack {
                        RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                            .fill(.ultraThinMaterial)

                        RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                            .fill(tint)
                    }
                )
                .overlay(
                    RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                        .stroke(Color.white.opacity(0.12), lineWidth: 1)
                )
        }
    }
}

private let auroraPrimaryUIColor = UIColor.white.withAlphaComponent(0.95)
private let auroraPlaceholderUIColor = UIColor.white.withAlphaComponent(0.36)

private func clamp(_ value: Double, min lowerBound: Double, max upperBound: Double) -> Double {
    Swift.min(Swift.max(value, lowerBound), upperBound)
}

private extension Color {
    func mix(with other: Color, amount: Double) -> Color {
        AuroraColorVector(self)
            .interpolated(to: AuroraColorVector(other), progress: clamp(amount, min: 0, max: 1))
            .color
    }
}

private func smootherStep(_ value: Double) -> Double {
    let x = clamp(value, min: 0, max: 1)
    return x * x * x * (x * ((x * 6) - 15) + 10)
}

private func smootherStepIntegral(_ value: Double) -> Double {
    let x = clamp(value, min: 0, max: 1)
    return (x * x * x * x) * ((x * x) - (3 * x) + 2.5)
}

private func isAgentSemanticSessionKey(_ value: String) -> Bool {
    guard let regex = try? NSRegularExpression(pattern: "^agent:[^:\\s]+:", options: [.caseInsensitive]) else {
        return false
    }

    let range = NSRange(location: 0, length: value.utf16.count)
    return regex.firstMatch(in: value.trimmingCharacters(in: .whitespacesAndNewlines), options: [], range: range) != nil
}

private func canonicalContinuitySessionId(_ rawValue: String) -> String {
    let normalized = rawValue.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !normalized.isEmpty else {
        return auroraOwnerUnifiedContinuitySessionId
    }

    let lower = normalized.lowercased()
    if lower == auroraOwnerDashboardSessionId ||
        lower == auroraOwnerAppOpenResponsesSessionId ||
        auroraDirectContinuitySessionIds.contains(lower) {
        return auroraOwnerUnifiedContinuitySessionId
    }

    return normalized
}

private func canonicalGatewaySessionKey(_ rawValue: String) -> String {
    let normalized = rawValue.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !normalized.isEmpty else {
        return auroraMobileGatewaySessionKey
    }

    let lower = normalized.lowercased()
    if lower == auroraHeartbeatMainGatewaySessionKey ||
        lower == auroraOwnerUnifiedContinuitySessionId ||
        lower == auroraOwnerAppOpenResponsesSessionId {
        return auroraMobileGatewaySessionKey
    }

    return normalized
}

private func normalizedCompanionAPIBaseURL(from rawValue: String) -> URL? {
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

private func extractOpenClawResponseText(from response: OpenClawResponsesResponseEnvelope?) -> String? {
    guard let response else {
        return nil
    }

    let assistantContent = response.output?
        .first(where: { $0.role?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == "assistant" })?
        .content ?? []

    let text = assistantContent
        .compactMap { part -> String? in
            guard part.type?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == "output_text" else {
                return nil
            }

            return part.text?.trimmingCharacters(in: .whitespacesAndNewlines)
        }
        .filter { !$0.isEmpty }
        .joined()
        .trimmingCharacters(in: .whitespacesAndNewlines)

    return text.isEmpty ? nil : text
}

private func currentAuroraTimestamp() -> String {
    auroraDateFormatterWithFractional.string(from: Date())
}

private func parseAuroraDate(_ iso: String) -> Date {
    if let date = auroraDateFormatterWithFractional.date(from: iso) {
        return date
    }

    if let date = auroraDateFormatter.date(from: iso) {
        return date
    }

    return Date.distantPast
}

private func formatAuroraTimestamp(_ iso: String) -> String {
    let date = parseAuroraDate(iso)
    guard date != .distantPast else {
        return iso
    }

    return auroraDisplayFormatter.string(from: date)
}

private func formatAuroraRelativeDate(_ iso: String) -> String? {
    let trimmed = iso.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else {
        return nil
    }

    let date = parseAuroraDate(trimmed)
    guard date != .distantPast else {
        return trimmed
    }

    return auroraRelativeFormatter.localizedString(for: date, relativeTo: Date())
}

private func formatCompactScore(_ value: Double) -> String {
    String(format: "%.2f", value)
}

private func formatFileSize(_ bytes: Int) -> String {
    guard bytes > 0 else {
        return "0 B"
    }

    let formatter = ByteCountFormatter()
    formatter.countStyle = .file
    return formatter.string(fromByteCount: Int64(bytes))
}

private func humanReadableFileGroup(_ group: String) -> String {
    switch group.lowercased() {
    case "state":
        return "State"
    case "runtime":
        return "Runtime"
    case "logs":
        return "Logs"
    default:
        return group.isEmpty ? "Internal" : group.capitalized
    }
}

private let auroraDateFormatterWithFractional: ISO8601DateFormatter = {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter
}()

private let auroraDateFormatter: ISO8601DateFormatter = {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime]
    return formatter
}()

private let auroraDisplayFormatter: DateFormatter = {
    let formatter = DateFormatter()
    formatter.dateFormat = "MMM d, h:mm a"
    return formatter
}()

private let auroraRelativeFormatter: RelativeDateTimeFormatter = {
    let formatter = RelativeDateTimeFormatter()
    formatter.unitsStyle = .full
    return formatter
}()

private extension String {
    var nonEmptyTrimmed: String? {
        let trimmed = trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}

private extension AnyTransition {
    static var auroraManifest: AnyTransition {
        .asymmetric(
            insertion: .opacity.combined(with: .scale(scale: 0.96)).combined(with: .offset(y: 18)),
            removal: .opacity.combined(with: .scale(scale: 1.03)).combined(with: .offset(y: -18))
        )
    }
}

private func hideKeyboard() {
    UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
}
