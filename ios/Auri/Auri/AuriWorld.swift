import Observation
import SwiftUI
import UIKit
import Combine
import WebKit

private enum AuriSheet: String, Identifiable {
    case chat
    case health
    case play
    case attention
    case shop

    var id: String { rawValue }
}

private enum AuriRootCoordinateSpace {
    static let name = "auri-root-coordinate-space"
}

private enum AuriAvatarDisplayMode {
    case compactSprite
    case stageAvatar
}

private enum AuriVRMPresentationMode: String, Encodable {
    case room
    case chat
    case onboarding
}

private struct AuriVRMStageState: Encodable, Equatable {
    let mood: String
    let isSleeping: Bool
    let lightsOff: Bool
    let wantsAttention: Bool
    let wantsSleep: Bool
    let needsMedicine: Bool
    let tired: Double
    let isPaused: Bool
    let modelURL: String
    let presentationMode: String
    let framingYOffset: Double

    init(
        mood: AuriMood,
        isSleeping: Bool,
        lightsOff: Bool,
        wantsAttention: Bool,
        wantsSleep: Bool,
        needsMedicine: Bool,
        tired: Double,
        isPaused: Bool,
        modelURL: String,
        presentationMode: AuriVRMPresentationMode,
        framingYOffset: Double = 0
    ) {
        self.mood = mood.rawValue
        self.isSleeping = isSleeping
        self.lightsOff = lightsOff
        self.wantsAttention = wantsAttention
        self.wantsSleep = wantsSleep
        self.needsMedicine = needsMedicine
        self.tired = tired
        self.isPaused = isPaused
        self.modelURL = modelURL
        self.presentationMode = presentationMode.rawValue
        self.framingYOffset = framingYOffset
    }

    var javascriptLiteral: String {
        let encoder = JSONEncoder()
        guard
            let data = try? encoder.encode(self),
            let string = String(data: data, encoding: .utf8)
        else {
            return #"{"mood":"cozy","isSleeping":false,"lightsOff":false,"wantsAttention":false,"wantsSleep":false,"needsMedicine":false,"tired":0,"isPaused":false,"modelURL":"auri-avatar://viewer/auri-avatar.vrm","presentationMode":"room","framingYOffset":0}"#
        }

        return string
    }
}

private struct AuriVRMCameraVector: Codable, Equatable {
    let x: Double
    let y: Double
    let z: Double

    init(x: Double, y: Double, z: Double) {
        self.x = x
        self.y = y
        self.z = z
    }

    init?(dictionary: [String: Any]) {
        guard
            let x = dictionary["x"] as? Double,
            let y = dictionary["y"] as? Double,
            let z = dictionary["z"] as? Double
        else {
            return nil
        }

        self.init(x: x, y: y, z: z)
    }
}

private struct AuriVRMCameraState: Codable, Equatable {
    let position: AuriVRMCameraVector
    let target: AuriVRMCameraVector

    init(position: AuriVRMCameraVector, target: AuriVRMCameraVector) {
        self.position = position
        self.target = target
    }

    init?(messageBody: Any) {
        guard
            let dictionary = messageBody as? [String: Any],
            let positionDictionary = dictionary["position"] as? [String: Any],
            let targetDictionary = dictionary["target"] as? [String: Any],
            let position = AuriVRMCameraVector(dictionary: positionDictionary),
            let target = AuriVRMCameraVector(dictionary: targetDictionary)
        else {
            return nil
        }

        self.init(position: position, target: target)
    }

    var javascriptLiteral: String {
        let encoder = JSONEncoder()
        guard
            let data = try? encoder.encode(self),
            let string = String(data: data, encoding: .utf8)
        else {
            return #"{"position":{"x":0,"y":0.86,"z":2.45},"target":{"x":0,"y":0.7,"z":0}}"#
        }

        return string
    }
}

private enum AuriVRMBundleResources {
    static let scheme = "auri-avatar"
    static let host = "viewer"
    static let folderName = "WebAvatar"
    static let indexName = "index"
    static let indexExtension = "html"

    static var folderURL: URL? {
        guard let bundleURL = Bundle.main.resourceURL else {
            return nil
        }

        let url = bundleURL.appendingPathComponent(folderName, isDirectory: true)
        return FileManager.default.fileExists(atPath: url.path) ? url : nil
    }

    static var indexURL: URL? {
        Bundle.main.url(
            forResource: indexName,
            withExtension: indexExtension,
            subdirectory: folderName
        )
    }

    static var viewerURL: URL? {
        URL(string: "\(scheme)://\(host)/\(indexName).\(indexExtension)")
    }

    static func assetURL(for relativePath: String) -> URL? {
        var components = URLComponents()
        components.scheme = scheme
        components.host = host
        components.path = "/" + relativePath
        return components.url
    }

    static var isAvailable: Bool {
        indexURL != nil && folderURL != nil
    }

    static func bundledFileURL(for requestURL: URL?) -> URL? {
        guard
            let requestURL,
            requestURL.scheme == scheme,
            requestURL.host == host,
            let folderURL
        else {
            return nil
        }

        let relativePath = requestURL.path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        let fileName = relativePath.isEmpty ? "\(indexName).\(indexExtension)" : relativePath
        let fileURL = folderURL.appendingPathComponent(fileName)

        guard FileManager.default.fileExists(atPath: fileURL.path) else {
            return nil
        }

        return fileURL
    }

    static func mimeType(for fileURL: URL) -> String {
        switch fileURL.pathExtension.lowercased() {
        case "html":
            return "text/html"
        case "js":
            return "application/javascript"
        case "css":
            return "text/css"
        case "json":
            return "application/json"
        case "png":
            return "image/png"
        case "jpg", "jpeg":
            return "image/jpeg"
        case "vrm", "glb", "vrma":
            return "model/gltf-binary"
        default:
            return "application/octet-stream"
        }
    }
}

private enum AuriCareMenuKind: String, Identifiable {
    case food
    case medicine

    var id: String { rawValue }

    func title(for name: String) -> String {
        switch self {
        case .food:
            return "Feed \(name)"
        case .medicine:
            return "Help \(name)"
        }
    }

    var dockTitle: String {
        switch self {
        case .food:
            return "Food"
        case .medicine:
            return "Medicine"
        }
    }

    var instruction: String {
        switch self {
        case .food:
            return "Press and hold an item, then drag it onto your Auri."
        case .medicine:
            return "Press and hold a remedy, then drop it onto your Auri."
        }
    }

    var tint: Color {
        switch self {
        case .food:
            return Color(red: 0.97, green: 0.84, blue: 0.66)
        case .medicine:
            return Color(red: 0.96, green: 0.76, blue: 0.74)
        }
    }
}

private enum AuriCareDragPayload: Hashable, Identifiable {
    case food(AuriFoodItem)
    case medicine(AuriMedicineItem)

    var id: String {
        switch self {
        case .food(let item):
            return "food-\(item.rawValue)"
        case .medicine(let item):
            return "medicine-\(item.rawValue)"
        }
    }

    var title: String {
        switch self {
        case .food(let item):
            return item.title
        case .medicine(let item):
            return item.title
        }
    }

    var subtitle: String {
        switch self {
        case .food(let item):
            return item.subtitle
        case .medicine(let item):
            return item.subtitle
        }
    }

    var tint: Color {
        switch self {
        case .food:
            return Color(red: 0.98, green: 0.84, blue: 0.66)
        case .medicine:
            return Color(red: 0.98, green: 0.74, blue: 0.74)
        }
    }

    static func items(for menu: AuriCareMenuKind) -> [AuriCareDragPayload] {
        switch menu {
        case .food:
            return AuriFoodItem.allCases.map(Self.food)
        case .medicine:
            return AuriMedicineItem.allCases.map(Self.medicine)
        }
    }

    @MainActor
    func apply(to store: AuriStore) {
        switch self {
        case .food(let item):
            store.feed(item)
        case .medicine(let item):
            store.giveMedicine(item)
        }
    }
}

private struct AuriActiveCareDrag {
    let payload: AuriCareDragPayload
    var location: CGPoint
}

private struct AuriAffectionZoneFramePreferenceKey: PreferenceKey {
    static var defaultValue: CGRect = .zero

    static func reduce(value: inout CGRect, nextValue: () -> CGRect) {
        let next = nextValue()
        if next != .zero {
            value = next
        }
    }
}

private struct AuriAffectionSession {
    let startedAt: Date
    var lastLocation: CGPoint
    var lastDirection: Int = 0
    var directionChanges = 0
    var horizontalTravel: CGFloat = 0
    var didTrigger = false
}

private enum AuriOnboardingField: Hashable {
    case auriName
    case firstName
    case lastName
    case pronouns
}

private enum AuriOnboardingStep: Int, CaseIterable, Identifiable {
    case avatar
    case auriName
    case humanName
    case pronouns
    case birthday
    case values
    case interests

    var id: Int { rawValue }

    var title: String {
        switch self {
        case .avatar:
            return "Choose Auri's look"
        case .auriName:
            return "Name your Auri"
        case .humanName:
            return "Tell Auri who you are"
        case .pronouns:
            return "Pronouns"
        case .birthday:
            return "Birthday"
        case .values:
            return "What matters most?"
        case .interests:
            return "Any other interests?"
        }
    }

    var subtitle: String {
        switch self {
        case .avatar:
            return "Pick the body and vibe you want to start this life with. The live preview behind this card updates as you switch."
        case .auriName:
            return "This is the name Auri will wake up with."
        case .humanName:
            return "Give Auri your first and last name before they wake up."
        case .pronouns:
            return "Tell Auri how to refer to you."
        case .birthday:
            return "A little personal context helps Auri understand you better."
        case .values:
            return "Highlight everything that genuinely matters to you."
        case .interests:
            return "Pick what interests you most."
        }
    }

    var buttonTitle: String {
        switch self {
        case .interests:
            return "Begin This Life"
        default:
            return "Continue"
        }
    }
}

private struct AuriOnboardingDraft {
    static let pronounSuggestions = [
        "she/her",
        "he/him",
        "they/them",
        "she/they",
        "he/they",
        "any pronouns"
    ]

    static let coreValueOptions = [
        "Career",
        "Education",
        "Love",
        "Family",
        "Friends",
        "Fitness",
        "Mental Health",
        "Money",
        "Creativity",
        "Learning",
        "Spirituality",
        "Rest",
        "Just vibing"
    ]

    static let interestOptions = [
        "Gaming",
        "Music",
        "Pets",
        "Podcasts",
        "Movies",
        "Nature",
        "Art",
        "Books",
        "Fashion",
        "Cooking",
        "Travel",
        "Anime",
        "Tech",
        "Photography",
        "Fitness",
        "Sports",
        "Coffee",
        "Writing"
    ]

    var auriName = ""
    var firstName = ""
    var lastName = ""
    var pronouns = ""
    var birthday = AuriBirthday(month: 1, day: 1, year: 2000)
    var coreValues: Set<String> = []
    var interests: Set<String> = []

    init(profile: AuriHumanProfile? = nil) {
        guard let profile else {
            return
        }

        let parts = profile.fullName.split(separator: " ").map(String.init)
        if let first = parts.first {
            firstName = first
        }
        if parts.count > 1 {
            lastName = parts.dropFirst().joined(separator: " ")
        }
        pronouns = profile.pronouns
        birthday = profile.birthday
        coreValues = Set(profile.coreValues)
        interests = Set(profile.interests)
    }

    var trimmedAuriName: String {
        auriName.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var trimmedFirstName: String {
        firstName.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var trimmedLastName: String {
        lastName.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var trimmedPronouns: String {
        pronouns.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var fullName: String {
        [trimmedFirstName, trimmedLastName].filter { !$0.isEmpty }.joined(separator: " ")
    }

    var ownerProfile: AuriHumanProfile? {
        guard !fullName.isEmpty, !trimmedPronouns.isEmpty else {
            return nil
        }

        return AuriHumanProfile(
            fullName: fullName,
            pronouns: trimmedPronouns,
            birthday: birthday,
            coreValues: Array(coreValues).sorted(),
            interests: Array(interests).sorted()
        )
    }
}

struct AuriRootView: View {
    @Bindable var store: AuriStore
    @FocusState private var onboardingFocusedField: AuriOnboardingField?
    @State private var onboardingStep: AuriOnboardingStep = .avatar
    @State private var onboardingDraft = AuriOnboardingDraft()
    @State private var pendingHealthSection: AuriHealthSection = .vitals
    @State private var activeSheet: AuriSheet?
    @State private var activeCareMenu: AuriCareMenuKind?
    @State private var activeCareDrag: AuriActiveCareDrag?
    @State private var affectionZoneFrame: CGRect = .zero
    @State private var affectionSession: AuriAffectionSession?
    @State private var pausedStageDate = Date()

    private var isChatOverlayPresented: Bool {
        activeSheet == .chat
    }

    private var isOverlayPresentationActive: Bool {
        activeSheet != nil && activeSheet != .chat
    }

    private var modalSheetBinding: Binding<AuriSheet?> {
        Binding(
            get: {
                guard let activeSheet, activeSheet != .chat else {
                    return nil
                }
                return activeSheet
            },
            set: { nextValue in
                activeSheet = nextValue
            }
        )
    }

    private var deathAlertIsPresented: Binding<Bool> {
        Binding(
            get: { store.hasPendingDeathExplanation },
            set: { isPresented in
                if !isPresented {
                    store.acknowledgeDeathExplanation()
                }
            }
        )
    }

    var body: some View {
        NavigationStack {
            ZStack {
                AuriBackdrop(dimmed: store.lightsOff)

                if !isOverlayPresentationActive {
                    auriStage
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .ignoresSafeArea()
                        .allowsHitTesting(store.hasChosenName || onboardingStep == .avatar)
                }

                if isChatOverlayPresented {
                    AuriChatOverlay(store: store)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                        .zIndex(10)
                }

                if store.hasChosenName {
                    if isChatOverlayPresented {
                        VStack {
                            HStack {
                                chatCloseButton
                                Spacer(minLength: 0)
                            }
                            .padding(.horizontal, 20)
                            .padding(.top, 14)
                            Spacer()
                        }
                        .zIndex(20)
                    } else {
                        VStack {
                            floatingTopBar
                                .padding(.horizontal, 20)
                                .padding(.top, 14)
                            Spacer()
                        }
                        .zIndex(20)
                    }

                    VStack(spacing: 14) {
                        Spacer()
                        if !isChatOverlayPresented {
                            auriStageControls
                            dockBar
                        }
                    }
                    .zIndex(15)
                }

                if activeCareMenu != nil && activeCareDrag == nil && !isChatOverlayPresented {
                    Color.black.opacity(0.001)
                        .ignoresSafeArea()
                        .onTapGesture {
                            dismissCareMenu()
                        }
                }

                VStack {
                    Spacer()

                    if let menu = activeCareMenu, !isChatOverlayPresented {
                        AuriCareMenuOverlay(
                            store: store,
                            menu: menu,
                            isHiddenForDrag: activeCareDrag != nil,
                            startDrag: startCareDrag(_:at:),
                            updateDrag: updateCareDrag(to:),
                            endDrag: finishCareDrag(at:)
                        )
                        .padding(.horizontal, 20)
                        .padding(.bottom, 108)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                    }
                }
                .animation(.spring(response: 0.28, dampingFraction: 0.9), value: activeCareMenu)
                .zIndex(18)

                if let drag = activeCareDrag {
                    AuriDraggedCareItem(payload: drag.payload, isHoveringAuri: isDraggingOverAuri)
                        .position(x: drag.location.x, y: drag.location.y - 54)
                        .allowsHitTesting(false)
                        .transition(.scale(scale: 0.9).combined(with: .opacity))
                        .zIndex(24)
                }

                if !store.hasChosenName {
                    onboardingOverlay
                        .zIndex(30)
                }
            }
            .coordinateSpace(name: AuriRootCoordinateSpace.name)
            .onPreferenceChange(AuriAffectionZoneFramePreferenceKey.self) { nextFrame in
                guard nextFrame != .zero else {
                    return
                }

                let movedEnough =
                    abs(nextFrame.midX - affectionZoneFrame.midX) > 1 ||
                    abs(nextFrame.midY - affectionZoneFrame.midY) > 1 ||
                    abs(nextFrame.width - affectionZoneFrame.width) > 1 ||
                    abs(nextFrame.height - affectionZoneFrame.height) > 1

                if movedEnough || affectionZoneFrame == .zero {
                    affectionZoneFrame = nextFrame
                }
            }
            .toolbar(.hidden, for: .navigationBar)
            .sheet(item: modalSheetBinding) { sheet in
                switch sheet {
                case .health:
                    AuriHealthSheet(store: store, initialSection: pendingHealthSection)
                case .play:
                    AuriPlaySheet(store: store)
                case .attention:
                    AuriAttentionSheet(store: store)
                case .shop:
                    AuriShopSheet(store: store)
                case .chat:
                    EmptyView()
                }
            }
            .task(id: store.hasChosenName) {
                guard !store.hasChosenName else {
                    return
                }
                configureOnboardingDraft()
            }
            .alert(store.displayName.isEmpty ? "Auri died" : "\(store.displayName) died", isPresented: deathAlertIsPresented) {
                Button("Start New Auri") {
                    store.acknowledgeDeathExplanation()
                    store.startNewAuri()
                }
                Button("OK", role: .cancel) {
                    store.acknowledgeDeathExplanation()
                }
            } message: {
                Text(store.pendingDeathExplanation ?? "Auri's health reached zero.")
            }
            .onChange(of: isOverlayPresentationActive) { _, isPresented in
                guard isPresented else {
                    return
                }

                pausedStageDate = Date()
            }
            .onChange(of: onboardingStep) { _, _ in
                focusOnboardingField()
            }
            .onChange(of: onboardingDraft.birthday.month) { _, _ in
                clampBirthdayDay()
            }
            .onChange(of: onboardingDraft.birthday.year) { _, _ in
                clampBirthdayDay()
            }
        }
    }

    private var floatingTopBar: some View {
        floatingTopBarContent
    }

    private var chatCloseButton: some View {
        Button {
            dismissCareMenu()
            activeSheet = nil
        } label: {
            Image(systemName: "xmark")
                .font(.system(size: 18, weight: .bold))
                .foregroundStyle(Color(red: 0.21, green: 0.25, blue: 0.29))
                .frame(width: 50, height: 50)
        }
        .buttonStyle(AuriFloatingOrbStyle(tint: Color(red: 0.88, green: 0.90, blue: 0.98)))
    }

    private var floatingTopBarContent: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .center, spacing: 12) {
                topBarIdentityCluster
                Spacer(minLength: 0)
                topBarActionCluster
            }

            if store.hasChosenName && store.isAlive {
                Button {
                    dismissCareMenu()
                    pendingHealthSection = .relationship
                    activeSheet = .health
                } label: {
                    AuriRelationshipBarPill(
                        state: store.currentRelationshipState,
                        prefersLightText: store.lightsOff
                    )
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .buttonStyle(.plain)
            }
        }
        .frame(maxWidth: .infinity, alignment: .top)
        .animation(.spring(response: 0.28, dampingFraction: 0.88), value: store.mood)
    }

    private var topBarIdentityCluster: some View {
        Button {
            dismissCareMenu()
            pendingHealthSection = .vitals
            activeSheet = .health
        } label: {
            AuriFloatingPill(tint: Color(red: 0.79, green: 0.90, blue: 0.96)) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(store.displayName)
                        .font(.system(.headline, design: .rounded, weight: .bold))
                        .lineLimit(1)
                    Text(profileLine)
                        .font(.system(.caption, design: .rounded, weight: .semibold))
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                        .fixedSize(horizontal: false, vertical: true)
                        .multilineTextAlignment(.leading)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .buttonStyle(.plain)
        .frame(maxWidth: .infinity, alignment: .leading)
        .layoutPriority(1)
    }

    private var topBarActionCluster: some View {
        HStack(alignment: .center, spacing: 12) {
            Button {
                dismissCareMenu()
                activeSheet = .shop
            } label: {
                AuriFloatingPill(
                    tint: Color(red: 0.99, green: 0.92, blue: 0.58),
                    horizontalPadding: 20,
                    verticalPadding: 13
                ) {
                    HStack(spacing: 9) {
                        Image(systemName: "sparkles")
                            .font(.system(size: 16, weight: .bold))
                        Text(store.coinLabel)
                            .font(.system(.subheadline, design: .rounded, weight: .bold))
                            .monospacedDigit()
                            .lineLimit(1)
                            .minimumScaleFactor(0.72)
                            .fixedSize(horizontal: true, vertical: false)
                    }
                    .foregroundStyle(Color(red: 0.21, green: 0.25, blue: 0.29))
                }
            }
            .buttonStyle(.plain)

            if store.needsAttention {
                Button {
                    dismissCareMenu()
                    activeSheet = .attention
                } label: {
                    Image(systemName: "bell.badge.fill")
                        .font(.system(size: 18, weight: .bold))
                        .foregroundStyle(store.lightsOff ? Color.white.opacity(0.96) : Color(red: 0.21, green: 0.25, blue: 0.29))
                        .frame(width: 50, height: 50)
                }
                .buttonStyle(AuriFloatingOrbStyle(tint: Color(red: 0.99, green: 0.82, blue: 0.39)))
            }
        }
        .fixedSize(horizontal: true, vertical: false)
    }

    private var auriStage: some View {
        let usesInteractiveStageAvatar = AuriVRMBundleResources.isAvailable

        return ZStack(alignment: .bottom) {
            if usesInteractiveStageAvatar {
                stageScene
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                stageScene
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .contentShape(Rectangle())
                    .onTapGesture {
                        if activeCareMenu != nil {
                            dismissCareMenu()
                            return
                        }
                        if store.hasChosenName && store.isAlive {
                            activeSheet = .chat
                        }
                    }
                    .simultaneousGesture(affectionGesture)
            }

        }
    }

    private var stageScene: some View {
        let usesInteractiveStageAvatar = AuriVRMBundleResources.isAvailable
        let vrmPresentationMode: AuriVRMPresentationMode = {
            if isChatOverlayPresented {
                return .chat
            }
            if !store.hasChosenName && onboardingStep == .avatar {
                return .onboarding
            }
            return .room
        }()

        return Group {
            if isOverlayPresentationActive {
                AuriCreatureStage(
                    store: store,
                    date: pausedStageDate,
                    dropHighlight: false,
                    isPaused: true,
                    vrmPresentationMode: vrmPresentationMode,
                    prefersChatRevealLayout: isChatOverlayPresented
                )
            } else if usesInteractiveStageAvatar {
                AuriInteractiveCreatureStage(
                    store: store,
                    dropHighlight: isDraggingOverAuri,
                    vrmPresentationMode: vrmPresentationMode,
                    prefersChatRevealLayout: isChatOverlayPresented
                )
            } else {
                TimelineView(.animation) { timeline in
                    AuriCreatureStage(
                        store: store,
                        date: timeline.date,
                        dropHighlight: isDraggingOverAuri,
                        isPaused: false,
                        vrmPresentationMode: vrmPresentationMode,
                        prefersChatRevealLayout: isChatOverlayPresented
                    )
                }
            }
        }
    }

    private var auriStageControls: some View {
        VStack(spacing: 12) {
            if !store.isAlive {
                Button("Start New Auri") {
                    store.startNewAuri()
                }
                .buttonStyle(.glassProminent)
            }

            if store.hasChosenName && store.isAlive {
                Button {
                    dismissCareMenu()
                    activeSheet = .chat
                } label: {
                    Label(store.isSending ? "Listening" : "Talk", systemImage: store.isSending ? "ellipsis.bubble.fill" : "bubble.left.and.text.bubble.right.fill")
                        .font(.system(.subheadline, design: .rounded, weight: .bold))
                }
                .buttonStyle(.glass)
            }
        }
        .padding(.horizontal, 20)
    }

    private var profileLine: String {
        if !store.hasChosenName {
            return "Name your Auri"
        }
        if !store.isAlive {
            return "Life ended"
        }
        if store.isSleeping {
            return store.lightsOff ? "Sleeping" : "Trying to sleep"
        }
        if store.needsMedicine {
            return "Needs medicine"
        }
        if store.needsCleaning {
            return store.dirtyStatusTitle
        }
        if store.wantsSleep {
            return store.lightsOff ? "Getting sleepy" : "Tired"
        }
        if store.needsAttention {
            return "Needs care"
        }
        return "\(store.mood.title) • \(store.ageLabel)"
    }

    private var dockBar: some View {
        let dockShape = RoundedRectangle(cornerRadius: 34, style: .continuous)

        return ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                AuriDockButton(
                    title: "Food",
                    systemImage: "fork.knife",
                    tint: Color(red: 0.96, green: 0.72, blue: 0.43),
                    highlighted: store.food < 0.34 || store.water < 0.34,
                    prefersLightText: store.lightsOff
                ) {
                    toggleCareMenu(.food)
                }
                AuriDockButton(
                    title: store.lightsOff ? "Lights On" : "Lights",
                    systemImage: store.lightsOff ? "lightbulb.max.fill" : "moon.fill",
                    tint: Color(red: 0.49, green: 0.55, blue: 0.88),
                    highlighted: store.needsLightsOff || store.needsLightsOn,
                    prefersLightText: store.lightsOff
                ) {
                    dismissCareMenu()
                    store.toggleLights()
                }
                AuriDockButton(
                    title: "Clean",
                    systemImage: "sparkles",
                    tint: Color(red: 0.58, green: 0.78, blue: 0.60),
                    highlighted: store.needsCleaning,
                    prefersLightText: store.lightsOff
                ) {
                    dismissCareMenu()
                    store.cleanAuri()
                }
                AuriDockButton(
                    title: "Play",
                    systemImage: "gamecontroller.fill",
                    tint: Color(red: 0.48, green: 0.66, blue: 0.97),
                    highlighted: store.joy < 0.40 || store.attention < 0.30,
                    prefersLightText: store.lightsOff
                ) {
                    dismissCareMenu()
                    if store.prepareMiniGamesMenu() {
                        activeSheet = .play
                    }
                }
                AuriDockButton(
                    title: "Medicine",
                    systemImage: "cross.case.fill",
                    tint: Color(red: 0.96, green: 0.52, blue: 0.45),
                    highlighted: store.needsMedicine,
                    prefersLightText: store.lightsOff
                ) {
                    toggleCareMenu(.medicine)
                }
                AuriDockButton(
                    title: "Discipline",
                    systemImage: "hand.raised.fill",
                    tint: Color(red: 0.85, green: 0.64, blue: 0.95),
                    highlighted: store.needsDiscipline,
                    prefersLightText: store.lightsOff
                ) {
                    dismissCareMenu()
                    store.disciplineAuri()
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
        }
        .clipShape(dockShape)
        .glassEffect(
            .regular.tint(
                Color(red: 0.93, green: 0.94, blue: 0.98)
                    .opacity(store.lightsOff ? 0.10 : 0.18)
            ),
            in: .rect(cornerRadius: 34)
        )
        .overlay(
            dockShape
                .stroke(.white.opacity(store.lightsOff ? 0.24 : 0.34), lineWidth: 1)
        )
        .clipShape(dockShape)
        .shadow(
            color: Color.black.opacity(store.lightsOff ? 0.18 : 0.08),
            radius: store.lightsOff ? 18 : 14,
            x: 0,
            y: 10
        )
        .padding(.horizontal, 16)
        .padding(.bottom, 10)
    }

    private var onboardingOverlay: some View {
        ZStack {
            LinearGradient(
                colors: [
                    Color.black.opacity(0.10),
                    Color.black.opacity(0.14),
                    Color.black.opacity(0.24)
                ],
                startPoint: .top,
                endPoint: .bottom
            )
            .ignoresSafeArea()
            .allowsHitTesting(false)

            if onboardingStep == .avatar {
                avatarOnboardingOverlay
            } else {
                standardOnboardingOverlay
            }
        }
        .transition(.opacity)
    }

    private var standardOnboardingOverlay: some View {
        AuriGlassPanel(tint: Color(red: 0.95, green: 0.93, blue: 0.98)) {
            VStack(alignment: .leading, spacing: 22) {
                onboardingHeader

                ScrollView(.vertical, showsIndicators: false) {
                    onboardingStepContent
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .scrollBounceBehavior(.basedOnSize)
                .frame(maxHeight: 430)

                if let errorMessage = store.errorMessage {
                    Text(errorMessage)
                        .font(.system(.caption, design: .rounded, weight: .bold))
                        .foregroundStyle(Color(red: 0.71, green: 0.34, blue: 0.32))
                        .fixedSize(horizontal: false, vertical: true)
                }

                HStack(spacing: 12) {
                    if onboardingStep != .avatar {
                        Button("Back") {
                            retreatOnboardingStep()
                        }
                        .buttonStyle(.glass)
                    }

                    Button {
                        advanceOnboardingStep()
                    } label: {
                        Text(onboardingStep.buttonTitle)
                            .frame(maxWidth: .infinity)
                    }
                    .disabled(!canAdvanceOnboardingStep)
                    .buttonStyle(.glassProminent)
                }
            }
        }
        .frame(maxWidth: 540)
        .padding(.horizontal, 20)
        .padding(.vertical, 24)
    }

    private var avatarOnboardingOverlay: some View {
        ZStack {
            TabView(selection: avatarSelectionBinding) {
                ForEach(store.wardrobeCatalog) { entry in
                    Color.clear
                        .tag(entry.id)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
            .ignoresSafeArea()
            .allowsHitTesting(false)

            VStack(spacing: 0) {
                HStack(alignment: .top, spacing: 16) {
                    Text("Choose Auri's look")
                        .font(.system(size: 30, weight: .bold, design: .rounded))
                        .foregroundStyle(.white)

                    Spacer(minLength: 0)

                    AuriMiniSliderPill(
                        progress: Double(selectedAvatarIndex + 1) / Double(max(store.wardrobeCatalog.count, 1)),
                        label: "\(selectedAvatarIndex + 1)/\(store.wardrobeCatalog.count)"
                    )
                }
                .padding(.horizontal, 20)
                .padding(.top, 18)

                Spacer()

                VStack(spacing: 14) {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 10) {
                            ForEach(store.wardrobeCatalog) { entry in
                                Button {
                                    withAnimation(.spring(response: 0.28, dampingFraction: 0.88)) {
                                        store.selectAvatar(entry.id)
                                    }
                                } label: {
                                    VStack(alignment: .leading, spacing: 4) {
                                        Text(entry.title)
                                            .font(.system(.subheadline, design: .rounded, weight: .bold))
                                            .lineLimit(1)
                                        Text(entry.subtitle)
                                            .font(.system(size: 11, weight: .semibold, design: .rounded))
                                            .lineLimit(1)
                                            .foregroundStyle(.secondary)
                                    }
                                    .foregroundStyle(Color(red: 0.16, green: 0.21, blue: 0.24))
                                    .padding(.horizontal, 14)
                                    .padding(.vertical, 12)
                                    .background(
                                        Capsule(style: .continuous)
                                            .fill(store.selectedAvatarID == entry.id ? onboardingTint(for: entry.id).opacity(0.95) : .white.opacity(0.58))
                                    )
                                    .overlay(
                                        Capsule(style: .continuous)
                                            .stroke(store.selectedAvatarID == entry.id ? onboardingTint(for: entry.id).opacity(0.96) : .white.opacity(0.3), lineWidth: store.selectedAvatarID == entry.id ? 2 : 1)
                                    )
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        .padding(.horizontal, 2)
                    }

                    Button {
                        advanceOnboardingStep()
                    } label: {
                        Text("Continue")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.glassProminent)
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 22)
            }
        }
    }

    private var onboardingHeader: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top) {
                Text(onboardingStep.title)
                    .font(.system(size: 29, weight: .bold, design: .rounded))
                    .foregroundStyle(Color(red: 0.16, green: 0.21, blue: 0.24))

                Spacer(minLength: 0)

                AuriMiniSliderPill(
                    progress: Double(onboardingStep.rawValue + 1) / Double(AuriOnboardingStep.allCases.count),
                    label: "\(onboardingStep.rawValue + 1)/\(AuriOnboardingStep.allCases.count)"
                )
            }

            Text(onboardingStep.subtitle)
                .font(.system(.subheadline, design: .rounded, weight: .medium))
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            HStack(spacing: 8) {
                ForEach(AuriOnboardingStep.allCases) { step in
                    Capsule(style: .continuous)
                        .fill(step.rawValue <= onboardingStep.rawValue ? Color(red: 0.48, green: 0.71, blue: 0.94) : Color.white.opacity(0.42))
                        .frame(height: 7)
                }
            }
        }
    }

    @ViewBuilder
    private var onboardingStepContent: some View {
        switch onboardingStep {
        case .avatar:
            VStack(alignment: .leading, spacing: 18) {
                HStack(spacing: 10) {
                    AuriChip(label: "Free")
                    AuriChip(label: "Live preview behind this card")
                }

                VStack(alignment: .leading, spacing: 6) {
                    Text(store.selectedAvatarEntry.title)
                        .font(.system(.title3, design: .rounded, weight: .bold))
                    Text(store.selectedAvatarEntry.subtitle)
                        .font(.system(.subheadline, design: .rounded, weight: .medium))
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(18)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(
                    RoundedRectangle(cornerRadius: 24, style: .continuous)
                        .fill(.white.opacity(0.56))
                )

                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 14) {
                        ForEach(store.wardrobeCatalog) { entry in
                            AuriOnboardingAvatarCard(
                                entry: entry,
                                isSelected: store.selectedAvatarID == entry.id
                            ) {
                                store.selectAvatar(entry.id)
                            }
                            .frame(width: 224)
                        }
                    }
                    .padding(.vertical, 2)
                }
            }

        case .auriName:
            VStack(alignment: .leading, spacing: 16) {
                Text("What should she be called?")
                    .font(.system(.headline, design: .rounded, weight: .bold))

                onboardingTextField(
                    title: "Auri's name",
                    text: $onboardingDraft.auriName,
                    prompt: "Enter a name"
                )
                .focused($onboardingFocusedField, equals: .auriName)
                .textInputAutocapitalization(.words)
                .disableAutocorrection(true)

                Text("This becomes her name for this entire life.")
                    .font(.system(.caption, design: .rounded, weight: .medium))
                    .foregroundStyle(.secondary)
            }

        case .humanName:
            VStack(alignment: .leading, spacing: 16) {
                Text("Give Auri your first and last name before they wake up.")
                    .font(.system(.headline, design: .rounded, weight: .bold))

                VStack(spacing: 12) {
                    onboardingTextField(
                        title: "First name",
                        text: $onboardingDraft.firstName,
                        prompt: "First name"
                    )
                    .focused($onboardingFocusedField, equals: .firstName)
                    .textInputAutocapitalization(.words)
                    .disableAutocorrection(true)

                    onboardingTextField(
                        title: "Last name",
                        text: $onboardingDraft.lastName,
                        prompt: "Last name"
                    )
                    .focused($onboardingFocusedField, equals: .lastName)
                    .textInputAutocapitalization(.words)
                    .disableAutocorrection(true)
                }
            }

        case .pronouns:
            VStack(alignment: .leading, spacing: 16) {
                Text("Pick one of these or type your own.")
                    .font(.system(.headline, design: .rounded, weight: .bold))

                AuriSelectionGrid(
                    labels: AuriOnboardingDraft.pronounSuggestions,
                    selectedLabels: Set(onboardingDraft.trimmedPronouns.isEmpty ? [] : [onboardingDraft.trimmedPronouns]),
                    tint: Color(red: 0.82, green: 0.88, blue: 0.99)
                ) { label in
                    onboardingDraft.pronouns = label
                }

                onboardingTextField(
                    title: "Pronouns",
                    text: $onboardingDraft.pronouns,
                    prompt: "she/her"
                )
                .focused($onboardingFocusedField, equals: .pronouns)
                .textInputAutocapitalization(.never)
                .disableAutocorrection(true)
            }

        case .birthday:
            VStack(alignment: .leading, spacing: 16) {
                Text("Choose your month, day, and year.")
                    .font(.system(.headline, design: .rounded, weight: .bold))

                HStack(spacing: 10) {
                    onboardingBirthdayPicker(title: "Month") {
                        Picker("Month", selection: $onboardingDraft.birthday.month) {
                            ForEach(Array(Calendar.current.monthSymbols.enumerated()), id: \.offset) { index, month in
                                Text(month).tag(index + 1)
                            }
                        }
                        .pickerStyle(.wheel)
                    }

                    onboardingBirthdayPicker(title: "Day") {
                        Picker("Day", selection: $onboardingDraft.birthday.day) {
                            ForEach(validBirthdayDays, id: \.self) { day in
                                Text("\(day)").tag(day)
                            }
                        }
                        .pickerStyle(.wheel)
                    }

                    onboardingBirthdayPicker(title: "Year") {
                        Picker("Year", selection: $onboardingDraft.birthday.year) {
                            ForEach(validBirthdayYears, id: \.self) { year in
                                Text("\(year)").tag(year)
                            }
                        }
                        .pickerStyle(.wheel)
                    }
                }
                .frame(height: 188)
            }

        case .values:
            VStack(alignment: .leading, spacing: 16) {
                Text("Choose every area that feels important to your real life.")
                    .font(.system(.headline, design: .rounded, weight: .bold))

                AuriSelectionGrid(
                    labels: AuriOnboardingDraft.coreValueOptions,
                    selectedLabels: onboardingDraft.coreValues,
                    tint: Color(red: 0.99, green: 0.89, blue: 0.76)
                ) { label in
                    if onboardingDraft.coreValues.contains(label) {
                        onboardingDraft.coreValues.remove(label)
                    } else {
                        onboardingDraft.coreValues.insert(label)
                    }
                }
            }

        case .interests:
            VStack(alignment: .leading, spacing: 16) {
                Text("Pick what interests you most.")
                    .font(.system(.headline, design: .rounded, weight: .bold))

                AuriSelectionGrid(
                    labels: AuriOnboardingDraft.interestOptions,
                    selectedLabels: onboardingDraft.interests,
                    tint: Color(red: 0.85, green: 0.93, blue: 0.86)
                ) { label in
                    if onboardingDraft.interests.contains(label) {
                        onboardingDraft.interests.remove(label)
                    } else {
                        onboardingDraft.interests.insert(label)
                    }
                }
            }
        }
    }

    private var canAdvanceOnboardingStep: Bool {
        switch onboardingStep {
        case .avatar:
            return true
        case .auriName:
            return !onboardingDraft.trimmedAuriName.isEmpty
        case .humanName:
            return !onboardingDraft.trimmedFirstName.isEmpty && !onboardingDraft.trimmedLastName.isEmpty
        case .pronouns:
            return !onboardingDraft.trimmedPronouns.isEmpty
        case .birthday:
            return true
        case .values:
            return !onboardingDraft.coreValues.isEmpty
        case .interests:
            return onboardingDraft.ownerProfile != nil
        }
    }

    private var avatarSelectionBinding: Binding<String> {
        Binding(
            get: { store.selectedAvatarID },
            set: { nextID in
                store.selectAvatar(nextID)
            }
        )
    }

    private var selectedAvatarIndex: Int {
        store.wardrobeCatalog.firstIndex(where: { $0.id == store.selectedAvatarID }) ?? 0
    }

    private var selectedAvatarTint: Color {
        onboardingTint(for: store.selectedAvatarID)
    }

    private func onboardingTint(for avatarID: String) -> Color {
        switch avatarID {
        case "classic_auri":
            return Color(red: 0.85, green: 0.92, blue: 0.98)
        case "sofi":
            return Color(red: 0.98, green: 0.90, blue: 0.92)
        case "gari":
            return Color(red: 0.91, green: 0.94, blue: 0.84)
        case "gauri":
            return Color(red: 0.89, green: 0.90, blue: 0.99)
        case "aori":
            return Color(red: 0.96, green: 0.88, blue: 0.82)
        default:
            return Color(red: 0.99, green: 0.90, blue: 0.84)
        }
    }

    private var validBirthdayDays: [Int] {
        let calendar = Calendar(identifier: .gregorian)
        let components = DateComponents(year: onboardingDraft.birthday.year, month: onboardingDraft.birthday.month)
        let date = calendar.date(from: components) ?? Date()
        let count = calendar.range(of: .day, in: .month, for: date)?.count ?? 31
        return Array(1...count)
    }

    private var validBirthdayYears: [Int] {
        let currentYear = Calendar(identifier: .gregorian).component(.year, from: Date())
        return Array((1900...currentYear).reversed())
    }

    private func configureOnboardingDraft() {
        onboardingStep = .avatar
        onboardingDraft = AuriOnboardingDraft(profile: store.lastOnboardingProfile)
        onboardingDraft.auriName = store.name
        store.errorMessage = nil
        focusOnboardingField()
    }

    private func focusOnboardingField() {
        switch onboardingStep {
        case .auriName:
            onboardingFocusedField = .auriName
        case .humanName:
            onboardingFocusedField = onboardingDraft.trimmedFirstName.isEmpty ? .firstName : .lastName
        case .pronouns:
            onboardingFocusedField = .pronouns
        default:
            onboardingFocusedField = nil
        }
    }

    private func clampBirthdayDay() {
        guard let lastDay = validBirthdayDays.last else {
            return
        }

        if onboardingDraft.birthday.day > lastDay {
            onboardingDraft.birthday.day = lastDay
        }
    }

    private func retreatOnboardingStep() {
        guard let previous = AuriOnboardingStep(rawValue: onboardingStep.rawValue - 1) else {
            return
        }

        store.errorMessage = nil
        withAnimation(.spring(response: 0.28, dampingFraction: 0.9)) {
            onboardingStep = previous
        }
    }

    private func advanceOnboardingStep() {
        guard canAdvanceOnboardingStep else {
            return
        }

        guard onboardingStep != .interests else {
            finishOnboarding()
            return
        }

        guard let next = AuriOnboardingStep(rawValue: onboardingStep.rawValue + 1) else {
            return
        }

        store.errorMessage = nil
        withAnimation(.spring(response: 0.28, dampingFraction: 0.9)) {
            onboardingStep = next
        }
    }

    private func finishOnboarding() {
        guard let ownerProfile = onboardingDraft.ownerProfile else {
            store.errorMessage = "Finish your details first."
            return
        }

        onboardingFocusedField = nil
        store.completeOnboarding(
            auriName: onboardingDraft.trimmedAuriName,
            ownerProfile: ownerProfile
        )
    }

    private func onboardingTextField(title: String, text: Binding<String>, prompt: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.system(.caption, design: .rounded, weight: .bold))
                .foregroundStyle(Color(red: 0.44, green: 0.43, blue: 0.58))

            TextField(prompt, text: text)
                .padding(.horizontal, 16)
                .padding(.vertical, 15)
                .background(
                    RoundedRectangle(cornerRadius: 22, style: .continuous)
                        .fill(.white.opacity(0.62))
                )
        }
    }

    private func onboardingBirthdayPicker<Content: View>(title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.system(.caption, design: .rounded, weight: .bold))
                .foregroundStyle(Color(red: 0.44, green: 0.43, blue: 0.58))

            content()
                .frame(maxWidth: .infinity)
                .clipped()
                .background(
                    RoundedRectangle(cornerRadius: 24, style: .continuous)
                        .fill(.white.opacity(0.56))
                )
        }
    }

    private var isDraggingOverAuri: Bool {
        guard let drag = activeCareDrag else {
            return false
        }

        return dropTargetContains(drag.location)
    }

    private var affectionGesture: some Gesture {
        DragGesture(minimumDistance: 0, coordinateSpace: .named(AuriRootCoordinateSpace.name))
            .onChanged(handleAffectionChanged(_:))
            .onEnded { _ in
                affectionSession = nil
            }
    }

    private func toggleCareMenu(_ menu: AuriCareMenuKind) {
        activeSheet = nil

        withAnimation(.spring(response: 0.28, dampingFraction: 0.9)) {
            if activeCareMenu == menu && activeCareDrag == nil {
                activeCareMenu = nil
            } else {
                activeCareMenu = menu
                activeCareDrag = nil
            }
        }
    }

    private func dismissCareMenu() {
        withAnimation(.spring(response: 0.24, dampingFraction: 0.92)) {
            activeCareMenu = nil
            activeCareDrag = nil
        }
    }

    private func startCareDrag(_ payload: AuriCareDragPayload, at location: CGPoint) {
        withAnimation(.spring(response: 0.22, dampingFraction: 0.92)) {
            activeCareDrag = AuriActiveCareDrag(payload: payload, location: location)
        }
    }

    private func updateCareDrag(to location: CGPoint) {
        activeCareDrag?.location = location
    }

    private func finishCareDrag(at location: CGPoint) {
        guard let drag = activeCareDrag else {
            dismissCareMenu()
            return
        }

        let shouldApply = dropTargetContains(location)
        let payload = drag.payload

        withAnimation(.spring(response: 0.24, dampingFraction: 0.92)) {
            activeCareDrag = nil
            activeCareMenu = nil
        }

        if shouldApply {
            payload.apply(to: store)
        }
    }

    private func dropTargetContains(_ location: CGPoint) -> Bool {
        guard affectionZoneFrame != .zero else {
            return false
        }

        return affectionZoneFrame.insetBy(dx: -28, dy: -28).contains(location)
    }

    private func handleAffectionChanged(_ value: DragGesture.Value) {
        guard activeCareDrag == nil, store.hasChosenName, store.isAlive else {
            affectionSession = nil
            return
        }

        let affectionFrame = affectionZoneFrame.insetBy(dx: -26, dy: -22)
        guard affectionFrame != .zero else {
            return
        }

        if affectionSession == nil {
            guard affectionFrame.contains(value.startLocation) else {
                return
            }

            affectionSession = AuriAffectionSession(
                startedAt: value.time,
                lastLocation: value.location
            )
            return
        }

        guard var session = affectionSession else {
            return
        }

        guard affectionFrame.contains(value.location) else {
            affectionSession = nil
            return
        }

        let deltaX = value.location.x - session.lastLocation.x
        if abs(deltaX) >= 4 {
            let direction = deltaX > 0 ? 1 : -1
            if session.lastDirection != 0, direction != session.lastDirection {
                session.directionChanges += 1
            }
            session.lastDirection = direction
            session.horizontalTravel += abs(deltaX)
        }
        session.lastLocation = value.location

        let heldLongEnough = value.time.timeIntervalSince(session.startedAt) >= 0.16
        let movedBackAndForth = session.directionChanges >= 2 && session.horizontalTravel >= 36
        if heldLongEnough, movedBackAndForth, !session.didTrigger {
            session.didTrigger = true
            store.showAffection()
        }

        affectionSession = session
    }
}

private struct AuriChatOverlay: View {
    @Bindable var store: AuriStore
    @FocusState private var composerFocused: Bool

    var body: some View {
        GeometryReader { proxy in
            let reservedLeftWidth = min(max(proxy.size.width * 0.24, 88), 132)
            let panelWidth = max(252, proxy.size.width - reservedLeftWidth - 22)
            let transcriptInset = min(max(panelWidth * 0.16, 24), 52)
            let bubbleMaxWidth = min(286, panelWidth - 56)

            ZStack(alignment: .bottomTrailing) {
                HStack(spacing: 0) {
                    Spacer(minLength: 0)

                    VStack(spacing: 0) {
                        AuriChatTranscript(
                            lines: store.conversation,
                            isTyping: store.isSending,
                            bubbleMaxWidth: bubbleMaxWidth,
                            oppositeInset: transcriptInset
                        )
                        .frame(width: panelWidth)
                        .frame(maxHeight: .infinity, alignment: .bottom)

                        VStack(alignment: .leading, spacing: 8) {
                            if let errorMessage = store.errorMessage {
                                Text(errorMessage)
                                    .font(.system(.caption, design: .rounded, weight: .bold))
                                    .foregroundStyle(.white.opacity(0.92))
                                    .padding(.horizontal, 14)
                                    .padding(.vertical, 10)
                                    .glassEffect(
                                        .regular.tint(Color(red: 0.85, green: 0.38, blue: 0.34).opacity(0.30)),
                                        in: .capsule
                                    )
                            }

                            GlassEffectContainer(spacing: 10) {
                                HStack(alignment: .bottom, spacing: 10) {
                                    TextField("Your message", text: $store.draftMessage, axis: .vertical)
                                        .textInputAutocapitalization(.sentences)
                                        .disableAutocorrection(false)
                                        .lineLimit(1...3)
                                        .focused($composerFocused)
                                        .font(.system(.body, design: .rounded, weight: .medium))
                                        .frame(maxWidth: .infinity, alignment: .leading)
                                        .padding(.horizontal, 16)
                                        .padding(.vertical, 10)

                                    Button {
                                        composerFocused = false
                                        Task {
                                            await store.sendMessage()
                                        }
                                    } label: {
                                        Image(systemName: store.isSending ? "ellipsis.bubble.fill" : "arrow.up.circle.fill")
                                            .font(.system(size: 24, weight: .bold))
                                    }
                                    .disabled(store.draftMessage.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !store.hasChosenName || !store.isAlive)
                                    .buttonStyle(.glassProminent)
                                }
                                .padding(.horizontal, 8)
                                .padding(.vertical, 6)
                            }
                            .glassEffect(
                                .regular.tint(Color(red: 0.83, green: 0.91, blue: 0.98).opacity(0.18)),
                                in: .rect(cornerRadius: 28)
                            )
                            .overlay(
                                RoundedRectangle(cornerRadius: 28, style: .continuous)
                                    .stroke(.white.opacity(0.28), lineWidth: 1)
                            )
                        }
                        .frame(width: panelWidth, alignment: .leading)
                        .padding(.bottom, 14)
                    }
                    .frame(width: panelWidth, alignment: .trailing)
                }
                .padding(.trailing, 14)
            }
        }
        .contentShape(Rectangle())
        .onTapGesture {
            composerFocused = false
        }
        .onAppear {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
                composerFocused = true
            }
        }
        .alert("\(store.displayName) is asleep", isPresented: $store.shouldPromptWakeForMessage) {
            Button("No", role: .cancel) {
                store.cancelWakeMessagePrompt()
            }
            Button("Yes") {
                composerFocused = false
                Task {
                    await store.wakeUpAndSendPendingMessage()
                }
            }
        } message: {
            Text("Do you want to wake her up?")
        }
    }
}

private struct AuriHealthSheet: View {
    @Bindable var store: AuriStore
    let initialSection: AuriHealthSection
    @Environment(\.dismiss) private var dismiss
    @State private var selectedSection: AuriHealthSection
    @Namespace private var sectionBubbleNamespace

    private let columns = [
        GridItem(.flexible(), spacing: 10),
        GridItem(.flexible(), spacing: 10)
    ]

    init(store: AuriStore, initialSection: AuriHealthSection = .vitals) {
        self.store = store
        self.initialSection = initialSection
        _selectedSection = State(initialValue: initialSection)
    }

    var body: some View {
        NavigationStack {
            ZStack {
                AuriMenuBackdrop(dimmed: store.lightsOff)

                ScrollView(.vertical, showsIndicators: false) {
                    VStack(spacing: 16) {
                        AuriMoodPanel(mood: store.mood)
                        activeSectionPanel
                    }
                    .padding(.horizontal, 20)
                    .padding(.vertical, 20)
                    .padding(.bottom, 84)
                }
            }
            .safeAreaInset(edge: .bottom) {
                AuriHealthSectionSlider(
                    selection: $selectedSection,
                    namespace: sectionBubbleNamespace,
                    prefersLightText: store.lightsOff
                )
                .frame(maxWidth: .infinity)
                .padding(.top, 6)
                .padding(.bottom, 8)
            }
            .navigationTitle("Auri Hub")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
        }
    }

    @ViewBuilder
    private var activeSectionPanel: some View {
        switch selectedSection {
        case .vitals:
            vitalsPanel
        case .profile:
            profilePanel
        case .outfits:
            outfitsPanel
        case .relationship:
            relationshipPanel
        case .settings:
            settingsPanel
        }
    }

    private var vitalsPanel: some View {
        AuriGlassPanel(tint: Color(red: 0.82, green: 0.90, blue: 0.78)) {
            VStack(alignment: .leading, spacing: 12) {
                Text("Vitals")
                    .font(.system(.headline, design: .rounded, weight: .bold))

                LazyVGrid(columns: columns, spacing: 10) {
                    AuriStatCard(title: "Health", value: store.health, accent: Color(red: 0.90, green: 0.51, blue: 0.56), systemImage: "heart.fill")
                    AuriStatCard(title: "Happiness", value: store.happinessValue, accent: Color(red: 0.99, green: 0.78, blue: 0.35), systemImage: "face.smiling.fill")
                    AuriStatCard(title: "Food", value: store.fullnessValue, accent: Color(red: 0.95, green: 0.67, blue: 0.39), systemImage: "fork.knife", detail: store.foodStatusLabel)
                    AuriStatCard(title: "Thirst", value: store.thirstValue, accent: Color(red: 0.41, green: 0.69, blue: 0.95), systemImage: "drop.fill", detail: store.thirstStatusLabel)
                    AuriStatCard(title: "Attention", value: store.attention, accent: Color(red: 0.98, green: 0.82, blue: 0.36), systemImage: "bell.badge.fill")
                    AuriStatCard(title: "Tired", value: store.tiredValue, accent: Color(red: 0.54, green: 0.62, blue: 0.93), systemImage: "bed.double.fill")
                    AuriStatCard(title: "Discipline", value: store.discipline, accent: Color(red: 0.72, green: 0.61, blue: 0.95), systemImage: "hand.raised.fill")
                }
            }
        }
        .transition(.asymmetric(insertion: .opacity.combined(with: .move(edge: .trailing)), removal: .opacity.combined(with: .move(edge: .leading))))
    }

    private var profilePanel: some View {
        AuriGlassPanel(tint: Color(red: 0.91, green: 0.88, blue: 0.98)) {
            VStack(alignment: .leading, spacing: 12) {
                Text("Profile")
                    .font(.system(.headline, design: .rounded, weight: .bold))
                AuriMetricRow(label: "Look", value: store.activeLookTitle)
                AuriMetricRow(label: "Base Avatar", value: store.selectedAvatarEntry.title)
                AuriMetricRow(label: "Outfit", value: store.selectedOutfitEntry?.title ?? "None")
                AuriMetricRow(label: "Mood", value: store.mood.title)
                AuriMetricRow(label: "Age", value: store.ageLabel)
                AuriMetricRow(label: "Height", value: store.heightLabel)
                AuriMetricRow(label: "Weight", value: store.weightLabel)
                AuriMetricRow(label: "Tired", value: store.tiredLabel)
                AuriMetricRow(label: "Cleanliness", value: store.cleanlinessLabel)
            }
        }
        .transition(.asymmetric(insertion: .opacity.combined(with: .move(edge: .trailing)), removal: .opacity.combined(with: .move(edge: .leading))))
    }

    private var outfitsPanel: some View {
        AuriGlassPanel(tint: Color(red: 0.98, green: 0.91, blue: 0.83)) {
            VStack(alignment: .leading, spacing: 14) {
                Text("Outfits")
                    .font(.system(.headline, design: .rounded, weight: .bold))

                Text("Switching outfits only changes how \(store.displayName) looks. Stats, memories, chat, and this life all stay exactly where they are.")
                    .font(.system(.subheadline, design: .rounded, weight: .medium))
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)

                AuriOwnedOutfitCard(
                    title: "Default",
                    subtitle: store.selectedAvatarEntry.title,
                    tint: outfitTint(for: nil),
                    isEquipped: store.selectedOutfitEntry == nil,
                    actionTitle: store.selectedOutfitEntry == nil ? "Equipped" : "Wear Base"
                ) {
                    store.selectOutfit(nil)
                }

                if store.ownedOutfitEntries.isEmpty {
                    Text("No outfits yet. Buy one in the Shop and it will appear here.")
                        .font(.system(.subheadline, design: .rounded, weight: .medium))
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                } else {
                    VStack(spacing: 12) {
                        ForEach(store.ownedOutfitEntries) { entry in
                            AuriOwnedOutfitCard(
                                title: entry.title,
                                subtitle: entry.subtitle,
                                tint: outfitTint(for: entry.id),
                                isEquipped: store.selectedOutfitID == entry.id,
                                actionTitle: store.selectedOutfitID == entry.id ? "Equipped" : "Wear Outfit"
                            ) {
                                store.selectOutfit(entry.id)
                            }
                        }
                    }
                }
            }
        }
        .transition(.asymmetric(insertion: .opacity.combined(with: .move(edge: .trailing)), removal: .opacity.combined(with: .move(edge: .leading))))
    }

    private var relationshipPanel: some View {
        let relationship = store.currentRelationshipState

        return AuriGlassPanel(tint: relationshipTint(for: relationship.kind)) {
            VStack(alignment: .leading, spacing: 14) {
                Text("Relationship")
                    .font(.system(.headline, design: .rounded, weight: .bold))

                VStack(alignment: .leading, spacing: 6) {
                    Text(relationship.title)
                        .font(.system(.title2, design: .rounded, weight: .bold))
                        .foregroundStyle(Color(red: 0.22, green: 0.25, blue: 0.30))
                    Text(relationship.subtitle)
                        .font(.system(.subheadline, design: .rounded, weight: .medium))
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }

                AuriRelationshipBarPill(state: relationship, prefersLightText: false)
                    .frame(maxWidth: .infinity, alignment: .center)

                AuriMetricRow(label: "Bond", value: percentageString(for: relationship.bond))
                AuriMetricRow(label: "Romance", value: percentageString(for: relationship.romance))
                AuriMetricRow(label: "Strain", value: percentageString(for: relationship.strain))

                if let ownerProfile = store.ownerProfile {
                    AuriMetricRow(label: "Person", value: ownerProfile.firstName)
                    AuriMetricRow(label: "Pronouns", value: ownerProfile.pronouns)
                } else if let humanName = store.humanName, !humanName.isEmpty {
                    AuriMetricRow(label: "Person", value: humanName)
                }

                Text("This changes dynamically based on warmth, time together, flirting, repair, or repeated harshness. It belongs to this Auri life and resets with a new one.")
                    .font(.system(.subheadline, design: .rounded, weight: .medium))
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .transition(.asymmetric(insertion: .opacity.combined(with: .move(edge: .trailing)), removal: .opacity.combined(with: .move(edge: .leading))))
    }

    private var settingsPanel: some View {
        VStack(spacing: 16) {
            AuriGlassPanel(tint: Color(red: 0.83, green: 0.90, blue: 0.95)) {
                VStack(alignment: .leading, spacing: 10) {
                    Text("Cloud Chat")
                        .font(.system(.headline, design: .rounded, weight: .bold))
                    Text(
                        AuriRuntimeConfiguration.hasConfiguredChatProxy
                            ? "This build is configured to send Auri chat to a cloud service. For App Store release, that service should be a public HTTPS backend running the pinned OpenAI path."
                            : "This build is not pointing at a cloud chat service yet. Auri chat will stay unavailable until you configure a public HTTPS backend."
                    )
                        .font(.system(.subheadline, design: .rounded, weight: .medium))
                        .foregroundStyle(.secondary)

                    if AuriRuntimeConfiguration.hasConfiguredChatProxy {
                        Text(AuriStore.defaultProxyURLString)
                            .font(.system(.footnote, design: .monospaced, weight: .medium))
                            .foregroundStyle(Color.primary.opacity(0.82))
                            .textSelection(.enabled)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 14)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(
                                RoundedRectangle(cornerRadius: 20, style: .continuous)
                                    .fill(.white.opacity(0.58))
                            )
                    } else {
                        Label("Cloud chat is not configured.", systemImage: "exclamationmark.triangle")
                            .font(.system(.subheadline, design: .rounded, weight: .semibold))
                            .foregroundStyle(Color.primary.opacity(0.82))
                            .padding(.horizontal, 16)
                            .padding(.vertical, 14)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(
                                RoundedRectangle(cornerRadius: 20, style: .continuous)
                                    .fill(.white.opacity(0.58))
                            )
                    }
                }
            }

            AuriGlassPanel(tint: Color(red: 0.96, green: 0.88, blue: 0.76)) {
                VStack(alignment: .leading, spacing: 10) {
                    Text("Privacy")
                        .font(.system(.headline, design: .rounded, weight: .bold))
                    Text("Food, water, health, and memory stay on the phone. If cloud chat is enabled, Auri sends your typed message, onboarding profile, relationship state, and a compact live care summary to the configured backend so she can reply in context.")
                        .font(.system(.subheadline, design: .rounded, weight: .medium))
                        .foregroundStyle(.secondary)
                }
            }

            AuriGlassPanel(tint: Color(red: 0.89, green: 0.92, blue: 0.86)) {
                VStack(alignment: .leading, spacing: 12) {
                    Text("Links")
                        .font(.system(.headline, design: .rounded, weight: .bold))

                    if let privacyPolicyURL = AuriRuntimeConfiguration.privacyPolicyURL {
                        Link("Privacy Policy", destination: privacyPolicyURL)
                            .buttonStyle(.glass)
                    }

                    if let supportURL = AuriRuntimeConfiguration.supportURL {
                        Link("Support", destination: supportURL)
                            .buttonStyle(.glass)
                    }

                    if let termsURL = AuriRuntimeConfiguration.termsURL {
                        Link("Terms", destination: termsURL)
                            .buttonStyle(.glass)
                    }

                    if AuriRuntimeConfiguration.privacyPolicyURL == nil,
                       AuriRuntimeConfiguration.supportURL == nil,
                       AuriRuntimeConfiguration.termsURL == nil {
                        Text("Add privacy-policy, support, and terms URLs to the release build before App Store submission.")
                            .font(.system(.subheadline, design: .rounded, weight: .medium))
                            .foregroundStyle(.secondary)
                    }
                }
            }

            AuriGlassPanel(tint: Color(red: 0.91, green: 0.82, blue: 0.82)) {
                VStack(alignment: .leading, spacing: 12) {
                    Text("Lifecycle")
                        .font(.system(.headline, design: .rounded, weight: .bold))
                    Text("Food, water, sleep, sickness, cleanliness, discipline, attention, and happiness all feed into \(store.displayName)'s health. Auri only dies if health reaches zero.")
                        .font(.system(.subheadline, design: .rounded, weight: .medium))
                        .foregroundStyle(.secondary)

                    Button("Start New Auri") {
                        store.startNewAuri()
                        dismiss()
                    }
                    .buttonStyle(.glassProminent)
                }
            }
        }
        .transition(.asymmetric(insertion: .opacity.combined(with: .move(edge: .trailing)), removal: .opacity.combined(with: .move(edge: .leading))))
    }

    private func outfitTint(for outfitID: String?) -> Color {
        switch outfitID {
        case "workout":
            return Color(red: 0.91, green: 0.96, blue: 0.82)
        case "sleepwear":
            return Color(red: 0.86, green: 0.89, blue: 0.99)
        default:
            return Color(red: 0.97, green: 0.93, blue: 0.86)
        }
    }

    private func relationshipTint(for kind: AuriRelationshipKind) -> Color {
        switch kind {
        case .friendship:
            return Color(red: 0.84, green: 0.91, blue: 0.99)
        case .romance:
            return Color(red: 0.99, green: 0.86, blue: 0.92)
        case .negative:
            return Color(red: 0.98, green: 0.83, blue: 0.83)
        }
    }

    private func percentageString(for value: Double) -> String {
        "\(Int((max(0, min(1, value)) * 100).rounded()))%"
    }
}

private enum AuriHealthSection: String, CaseIterable, Identifiable {
    case vitals
    case profile
    case outfits
    case relationship
    case settings

    var id: String { rawValue }

    var title: String {
        switch self {
        case .vitals:
            return "Vitals"
        case .profile:
            return "Profile"
        case .outfits:
            return "Outfits"
        case .relationship:
            return "Relationship"
        case .settings:
            return "Settings"
        }
    }

    var tint: Color {
        switch self {
        case .vitals:
            return Color(red: 0.82, green: 0.90, blue: 0.78)
        case .profile:
            return Color(red: 0.91, green: 0.88, blue: 0.98)
        case .outfits:
            return Color(red: 0.98, green: 0.91, blue: 0.83)
        case .relationship:
            return Color(red: 0.86, green: 0.91, blue: 0.98)
        case .settings:
            return Color(red: 0.88, green: 0.90, blue: 0.98)
        }
    }
}

private struct AuriHealthSectionSlider: View {
    @Binding var selection: AuriHealthSection
    let namespace: Namespace.ID
    var prefersLightText: Bool = false
    @State private var dragLocationX: CGFloat?

    private let capsuleHeight: CGFloat = 44
    private let controlWidth: CGFloat = 392

    private var labelColor: Color {
        prefersLightText ? Color.white.opacity(0.96) : Color(red: 0.17, green: 0.21, blue: 0.25)
    }

    var body: some View {
        GeometryReader { proxy in
            let sections = AuriHealthSection.allCases
            let segmentWidth = proxy.size.width / CGFloat(max(sections.count, 1))
            let bubbleWidth = segmentWidth
            let activeSection = hoveredSection(totalWidth: proxy.size.width)
            let bubbleCenterX = clampedBubbleCenter(totalWidth: proxy.size.width)
            let bubbleOffsetX = bubbleCenterX - (bubbleWidth / 2)

            ZStack(alignment: .leading) {
                HStack(spacing: 0) {
                    ForEach(sections) { section in
                        Text(section.title)
                            .font(.system(size: 11, weight: .bold, design: .rounded))
                            .lineLimit(1)
                            .minimumScaleFactor(0.7)
                            .foregroundStyle(labelColor.opacity(activeSection == section ? (prefersLightText ? 0.18 : 0.08) : (prefersLightText ? 0.98 : 0.86)))
                            .frame(maxWidth: .infinity)
                    }
                }

                ZStack {
                    Capsule(style: .continuous)
                        .fill(.clear)
                        .matchedGeometryEffect(id: "auri-health-section-bubble", in: namespace)
                        .frame(width: bubbleWidth, height: capsuleHeight)
                        .glassEffect(.regular.tint(Color.white.opacity(0.18)).interactive(), in: .capsule)
                        .overlay(
                            Capsule(style: .continuous)
                                .stroke(.white.opacity(0.38), lineWidth: 1)
                        )

                    Text(activeSection.title)
                        .font(.system(size: 11, weight: .bold, design: .rounded))
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                        .foregroundStyle(labelColor.opacity(prefersLightText ? 0.98 : 0.96))
                        .frame(width: bubbleWidth, height: capsuleHeight)
                }
                .frame(width: bubbleWidth, height: capsuleHeight)
                .offset(x: bubbleOffsetX, y: 0)
            }
            .frame(width: proxy.size.width, height: capsuleHeight)
            .contentShape(Capsule(style: .continuous))
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { value in
                        dragLocationX = value.location.x
                    }
                    .onEnded { value in
                        let nextSection = section(
                            for: value.location.x,
                            totalWidth: proxy.size.width
                        )
                        withAnimation(.spring(response: 0.30, dampingFraction: 0.84)) {
                            selection = nextSection
                            dragLocationX = nil
                        }
                    }
            )
        }
        .frame(width: controlWidth, height: capsuleHeight)
        .glassEffect(.regular.tint(Color.white.opacity(0.12)), in: .capsule)
        .overlay(
            Capsule(style: .continuous)
                .stroke(.white.opacity(0.30), lineWidth: 1)
        )
        .shadow(color: Color.black.opacity(0.08), radius: 14, x: 0, y: 8)
    }

    private func clampedBubbleCenter(totalWidth: CGFloat) -> CGFloat {
        let minCenter = (totalWidth / CGFloat(max(AuriHealthSection.allCases.count, 1))) / 2
        let maxCenter = totalWidth - minCenter
        let targetCenter = dragLocationX ?? centerX(for: selection, totalWidth: totalWidth)
        return min(max(targetCenter, minCenter), maxCenter)
    }

    private func hoveredSection(totalWidth: CGFloat) -> AuriHealthSection {
        section(for: dragLocationX ?? centerX(for: selection, totalWidth: totalWidth), totalWidth: totalWidth)
    }

    private func centerX(for section: AuriHealthSection, totalWidth: CGFloat) -> CGFloat {
        let sections = AuriHealthSection.allCases
        let segmentWidth = totalWidth / CGFloat(max(sections.count, 1))
        let index = CGFloat(sections.firstIndex(of: section) ?? 0)
        return (segmentWidth * index) + (segmentWidth / 2)
    }

    private func section(for locationX: CGFloat, totalWidth: CGFloat) -> AuriHealthSection {
        let sections = AuriHealthSection.allCases
        let segmentWidth = totalWidth / CGFloat(max(sections.count, 1))
        let normalized = min(max(locationX, 0), totalWidth - 0.001)
        let index = min(Int(normalized / max(segmentWidth, 1)), sections.count - 1)
        return sections[index]
    }
}

private struct AuriOwnedOutfitCard: View {
    let title: String
    let subtitle: String
    let tint: Color
    let isEquipped: Bool
    let actionTitle: String
    let action: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 12) {
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .fill(
                        LinearGradient(
                            colors: [
                                tint.opacity(0.98),
                                tint.opacity(0.74)
                            ],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: 72, height: 78)
                    .overlay(
                        Image(systemName: isEquipped ? "checkmark.seal.fill" : "sparkles")
                            .font(.system(size: 24, weight: .bold))
                            .foregroundStyle(Color(red: 0.23, green: 0.26, blue: 0.30))
                    )

                VStack(alignment: .leading, spacing: 5) {
                    Text(title)
                        .font(.system(.headline, design: .rounded, weight: .bold))
                    Text(subtitle)
                        .font(.system(.subheadline, design: .rounded, weight: .medium))
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }

                Spacer(minLength: 0)
            }

            if isEquipped {
                Button(actionTitle, action: action)
                    .buttonStyle(.glass)
                    .disabled(true)
            } else {
                Button(actionTitle, action: action)
                    .buttonStyle(.glassProminent)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 26, style: .continuous)
                .fill(.white.opacity(0.58))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 26, style: .continuous)
                .stroke(tint.opacity(isEquipped ? 0.96 : 0.42), lineWidth: isEquipped ? 2 : 1)
        )
    }
}

private struct AuriShopOutfitCard: View {
    @Bindable var store: AuriStore
    let entry: AuriOutfitCatalogEntry
    let tint: Color

    private var isOwned: Bool {
        store.isOutfitOwned(entry.id)
    }

    private var isEquipped: Bool {
        store.selectedOutfitID == entry.id
    }

    private var actionTitle: String {
        if isEquipped {
            return "Equipped"
        }
        if isOwned {
            return "Wear Outfit"
        }
        return "Buy for \(entry.cost)"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            ZStack(alignment: .topLeading) {
                RoundedRectangle(cornerRadius: 24, style: .continuous)
                    .fill(
                        LinearGradient(
                            colors: [
                                tint.opacity(0.98),
                                tint.opacity(0.76)
                            ],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )

                AuriShopOutfitPreview(modelRelativePath: entry.modelRelativePath)
                    .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))

                Text(isEquipped ? "Wearing now" : (isOwned ? "Owned" : "New outfit"))
                    .font(.system(.caption2, design: .rounded, weight: .bold))
                    .foregroundStyle(Color(red: 0.17, green: 0.22, blue: 0.26))
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(
                        Capsule(style: .continuous)
                            .fill(.white.opacity(0.72))
                    )
                    .padding(12)
            }
            .frame(height: 188)

            VStack(alignment: .leading, spacing: 6) {
                Text(entry.title)
                    .font(.system(.title3, design: .rounded, weight: .bold))
                Text(entry.subtitle)
                    .font(.system(.subheadline, design: .rounded, weight: .medium))
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            HStack(spacing: 10) {
                if !isOwned {
                    AuriChip(label: "\(entry.cost) Stars")
                }
                if isEquipped {
                    AuriChip(label: "Live now")
                }
            }

            if isEquipped {
                Button(actionTitle) { }
                    .buttonStyle(.glass)
                    .disabled(true)
            } else {
                Button(actionTitle) {
                    if isOwned {
                        store.selectOutfit(entry.id)
                    } else {
                        store.purchaseOutfit(entry.id)
                    }
                }
                .buttonStyle(.glassProminent)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .fill(.white.opacity(0.62))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .stroke(tint.opacity(isEquipped ? 0.96 : 0.38), lineWidth: isEquipped ? 2 : 1)
        )
    }
}

private struct AuriShopOutfitPreview: View {
    let modelRelativePath: String

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [
                    Color.white.opacity(0.18),
                    Color.white.opacity(0.04)
                ],
                startPoint: .top,
                endPoint: .bottom
            )

            AuriPixelAuri(
                stage: .baby,
                mood: .cozy,
                hasHatched: true,
                incubationProgress: 1,
                gaze: .center,
                animationTime: 0,
                isSleeping: false,
                lightsOff: false,
                wantsAttention: false,
                wantsSleep: false,
                needsMedicine: false,
                tired: 0,
                isPaused: true,
                avatarModelURL: AuriVRMBundleResources.assetURL(for: modelRelativePath)?.absoluteString
                    ?? "auri-avatar://viewer/auri-avatar.vrm",
                displayMode: .stageAvatar,
                vrmPresentationMode: .onboarding
            )
            .scaleEffect(1.18)
            .offset(y: 18)
            .allowsHitTesting(false)
        }
    }
}

private struct AuriAttentionSheet: View {
    @Bindable var store: AuriStore
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ZStack {
                AuriMenuBackdrop(dimmed: store.lightsOff)

                ScrollView(.vertical, showsIndicators: false) {
                    VStack(spacing: 16) {
                        AuriGlassPanel(tint: Color(red: 0.98, green: 0.89, blue: 0.67)) {
                            VStack(alignment: .leading, spacing: 12) {
                                Text("Needs Attention")
                                    .font(.system(.headline, design: .rounded, weight: .bold))

                                AuriMetricRow(label: "Attention", value: store.attentionLabel)

                                if store.attentionReasons.isEmpty {
                                    Text("\(store.displayName) is content right now.")
                                        .font(.system(.subheadline, design: .rounded, weight: .medium))
                                        .foregroundStyle(.secondary)
                                } else {
                                    ForEach(Array(store.attentionReasons.enumerated()), id: \.offset) { _, reason in
                                        Text(reason)
                                            .font(.system(.subheadline, design: .rounded, weight: .medium))
                                            .foregroundStyle(Color(red: 0.16, green: 0.22, blue: 0.26))
                                            .padding(.horizontal, 14)
                                            .padding(.vertical, 12)
                                            .frame(maxWidth: .infinity, alignment: .leading)
                                            .background(
                                                RoundedRectangle(cornerRadius: 18, style: .continuous)
                                                    .fill(.white.opacity(0.58))
                                            )
                                    }
                                }
                            }
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.vertical, 20)
                }
            }
            .navigationTitle("\(store.displayName) Needs")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
        }
    }
}

private struct AuriPlayRoundSpec {
    let targetCenter: Double
    let targetWidth: Double
    let speed: Double

    static func random(roundIndex: Int) -> Self {
        let difficulty = max(0, roundIndex)
        let width = max(0.16, 0.28 - (Double(difficulty) * 0.04) + Double.random(in: -0.01 ... 0.02))
        let margin = (width / 2) + 0.08
        return Self(
            targetCenter: Double.random(in: margin ... (1 - margin)),
            targetWidth: width,
            speed: 0.82 + (Double(difficulty) * 0.18) + Double.random(in: 0 ... 0.12)
        )
    }
}

private enum AuriMiniGameSection: String, CaseIterable, Identifiable {
    case pixelSprint
    case connect4
    case chess

    var id: String { rawValue }

    var title: String {
        switch self {
        case .pixelSprint:
            return "Pixel Sprint"
        case .connect4:
            return "Connect 4"
        case .chess:
            return "Chess"
        }
    }
}

private struct AuriMiniGameSectionSlider: View {
    @Binding var selection: AuriMiniGameSection
    let namespace: Namespace.ID
    var prefersLightText: Bool = false
    @State private var dragLocationX: CGFloat?

    private let capsuleHeight: CGFloat = 42

    private var labelColor: Color {
        prefersLightText ? Color.white.opacity(0.96) : Color(red: 0.17, green: 0.21, blue: 0.25)
    }

    var body: some View {
        GeometryReader { proxy in
            let sections = AuriMiniGameSection.allCases
            let segmentWidth = proxy.size.width / CGFloat(max(sections.count, 1))
            let bubbleWidth = segmentWidth
            let activeSection = hoveredSection(totalWidth: proxy.size.width)
            let bubbleCenterX = clampedBubbleCenter(totalWidth: proxy.size.width)
            let bubbleOffsetX = bubbleCenterX - (bubbleWidth / 2)

            ZStack(alignment: .leading) {
                HStack(spacing: 0) {
                    ForEach(sections) { section in
                        Text(section.title)
                            .font(.system(size: 11, weight: .bold, design: .rounded))
                            .lineLimit(1)
                            .minimumScaleFactor(0.72)
                            .foregroundStyle(labelColor.opacity(activeSection == section ? (prefersLightText ? 0.18 : 0.08) : (prefersLightText ? 0.98 : 0.86)))
                            .frame(maxWidth: .infinity)
                    }
                }

                ZStack {
                    Capsule(style: .continuous)
                        .fill(.clear)
                        .matchedGeometryEffect(id: "auri-mini-game-bubble", in: namespace)
                        .frame(width: bubbleWidth, height: capsuleHeight)
                        .glassEffect(.regular.tint(Color.white.opacity(0.18)).interactive(), in: .capsule)
                        .overlay(
                            Capsule(style: .continuous)
                                .stroke(.white.opacity(0.38), lineWidth: 1)
                        )

                    Text(activeSection.title)
                        .font(.system(size: 11, weight: .bold, design: .rounded))
                        .lineLimit(1)
                        .minimumScaleFactor(0.72)
                        .foregroundStyle(labelColor.opacity(prefersLightText ? 0.98 : 0.96))
                        .frame(width: bubbleWidth, height: capsuleHeight)
                }
                .frame(width: bubbleWidth, height: capsuleHeight)
                .offset(x: bubbleOffsetX, y: 0)
            }
            .frame(width: proxy.size.width, height: capsuleHeight)
            .contentShape(Capsule(style: .continuous))
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { value in
                        dragLocationX = value.location.x
                    }
                    .onEnded { value in
                        let nextSection = section(for: value.location.x, totalWidth: proxy.size.width)
                        withAnimation(.spring(response: 0.30, dampingFraction: 0.84)) {
                            selection = nextSection
                            dragLocationX = nil
                        }
                    }
            )
        }
        .frame(width: controlWidth, height: capsuleHeight)
        .glassEffect(.regular.tint(Color.white.opacity(0.12)), in: .capsule)
        .overlay(
            Capsule(style: .continuous)
                .stroke(.white.opacity(0.30), lineWidth: 1)
        )
        .shadow(color: Color.black.opacity(0.08), radius: 14, x: 0, y: 8)
    }

    private var controlWidth: CGFloat {
        max(244, CGFloat(AuriMiniGameSection.allCases.count) * 104)
    }

    private func clampedBubbleCenter(totalWidth: CGFloat) -> CGFloat {
        let minCenter = (totalWidth / CGFloat(max(AuriMiniGameSection.allCases.count, 1))) / 2
        let maxCenter = totalWidth - minCenter
        let targetCenter = dragLocationX ?? centerX(for: selection, totalWidth: totalWidth)
        return min(max(targetCenter, minCenter), maxCenter)
    }

    private func hoveredSection(totalWidth: CGFloat) -> AuriMiniGameSection {
        section(for: dragLocationX ?? centerX(for: selection, totalWidth: totalWidth), totalWidth: totalWidth)
    }

    private func centerX(for section: AuriMiniGameSection, totalWidth: CGFloat) -> CGFloat {
        let sections = AuriMiniGameSection.allCases
        let segmentWidth = totalWidth / CGFloat(max(sections.count, 1))
        let index = CGFloat(sections.firstIndex(of: section) ?? 0)
        return (segmentWidth * index) + (segmentWidth / 2)
    }

    private func section(for locationX: CGFloat, totalWidth: CGFloat) -> AuriMiniGameSection {
        let sections = AuriMiniGameSection.allCases
        let segmentWidth = totalWidth / CGFloat(max(sections.count, 1))
        let normalized = min(max(locationX, 0), totalWidth - 0.001)
        let index = min(Int(normalized / max(segmentWidth, 1)), sections.count - 1)
        return sections[index]
    }
}

private struct AuriPlaySheet: View {
    @Bindable var store: AuriStore
    @Environment(\.dismiss) private var dismiss

    @State private var section: AuriMiniGameSection = .pixelSprint
    @Namespace private var sliderNamespace

    var body: some View {
        NavigationStack {
            ZStack(alignment: .bottom) {
                AuriMenuBackdrop(dimmed: store.lightsOff)

                Group {
                    switch section {
                    case .pixelSprint:
                        AuriPixelSprintGameView(store: store)
                    case .connect4:
                        AuriConnect4GameView(store: store)
                    case .chess:
                        AuriChessGameView(store: store)
                    }
                }

                AuriMiniGameSectionSlider(
                    selection: $section,
                    namespace: sliderNamespace,
                    prefersLightText: store.lightsOff
                )
                    .padding(.bottom, 18)
            }
            .navigationTitle("\(store.displayName) Plays")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Close") {
                        dismiss()
                    }
                }
            }
        }
    }
}

private struct AuriPixelSprintGameView: View {
    @Bindable var store: AuriStore

    @State private var hasStarted = false
    @State private var roundIndex = 0
    @State private var roundsWon = 0
    @State private var roundSpec = AuriPlayRoundSpec.random(roundIndex: 0)
    @State private var roundStartedAt = Date()
    @State private var frozenMarkerPosition: Double?
    @State private var isResolvingRound = false
    @State private var gameFinished = false
    @State private var feedbackLine = "Catch the spark inside the bright window."
    @State private var resultTitle = ""
    @State private var resultBody = ""
    @State private var advanceTask: Task<Void, Never>?

    private let totalRounds = 3

    var body: some View {
        ScrollView(.vertical, showsIndicators: false) {
            VStack(spacing: 16) {
                AuriGlassPanel(tint: Color(red: 0.78, green: 0.88, blue: 0.99)) {
                    HStack(spacing: 16) {
                        TimelineView(.animation) { timeline in
                            AuriPixelAuri(
                                stage: store.stage,
                                mood: store.mood,
                                hasHatched: store.hasHatched,
                                incubationProgress: store.eggIncubationProgress,
                                gaze: currentGaze(at: timeline.date),
                                animationTime: timeline.date.timeIntervalSinceReferenceDate,
                                isSleeping: store.isSleeping,
                                lightsOff: store.lightsOff,
                                wantsAttention: store.attention < 0.30,
                                wantsSleep: store.wantsSleep,
                                needsMedicine: store.needsMedicine,
                                tired: store.tiredValue,
                                avatarModelURL: AuriVRMBundleResources.assetURL(for: store.selectedAvatarRelativePath)?.absoluteString
                                    ?? "auri-avatar://viewer/auri-avatar.vrm",
                                displayMode: .compactSprite
                            )
                            .frame(width: 86, height: 86)
                        }

                        VStack(alignment: .leading, spacing: 8) {
                            Text("Pixel Sprint")
                                .font(.system(.headline, design: .rounded, weight: .bold))
                            Text("Win 2 of 3 rounds to really lift \(store.displayName)'s mood. Lose too many and the attention still counts, but happiness can slip.")
                                .font(.system(.subheadline, design: .rounded, weight: .medium))
                                .foregroundStyle(.secondary)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }

                AuriGlassPanel(tint: Color(red: 0.92, green: 0.95, blue: 0.98)) {
                    VStack(alignment: .leading, spacing: 16) {
                        if !hasStarted {
                            Text("Ready to start?")
                                .font(.system(.title3, design: .rounded, weight: .bold))
                            Text("Pixel Sprint still uses the same reward curve as before, but now it waits for you to launch it from the mini-games menu.")
                                .font(.system(.subheadline, design: .rounded, weight: .medium))
                                .foregroundStyle(.secondary)
                                .fixedSize(horizontal: false, vertical: true)

                            Button("Start Sprint") {
                                guard store.beginPlayChallenge() else {
                                    return
                                }
                                hasStarted = true
                                startNewGame()
                            }
                            .buttonStyle(.glassProminent)
                        } else if gameFinished {
                            Text(resultTitle)
                                .font(.system(.title3, design: .rounded, weight: .bold))
                            Text(resultBody)
                                .font(.system(.subheadline, design: .rounded, weight: .medium))
                                .foregroundStyle(.secondary)
                                .fixedSize(horizontal: false, vertical: true)

                            HStack(spacing: 10) {
                                AuriChip(label: "Hits \(roundsWon)/\(totalRounds)")
                                AuriChip(label: "Attention \(store.attentionLabel)")
                                AuriChip(label: "Happiness \(Int((store.happinessValue * 100).rounded()))%")
                            }

                            Button("Play Again") {
                                guard store.beginPlayChallenge() else {
                                    return
                                }
                                startNewGame()
                            }
                            .buttonStyle(.glassProminent)
                        } else {
                            HStack {
                                Text("Round \(roundIndex + 1) of \(totalRounds)")
                                    .font(.system(.headline, design: .rounded, weight: .bold))
                                Spacer()
                                AuriChip(label: "Hits \(roundsWon)")
                            }

                            TimelineView(.animation) { timeline in
                                AuriPlayTrack(
                                    targetCenter: roundSpec.targetCenter,
                                    targetWidth: roundSpec.targetWidth,
                                    markerPosition: markerPosition(at: timeline.date)
                                )
                            }
                            .frame(height: 112)

                            Text(feedbackLine)
                                .font(.system(.subheadline, design: .rounded, weight: .medium))
                                .foregroundStyle(.secondary)
                                .fixedSize(horizontal: false, vertical: true)

                            Button(isResolvingRound ? "Locking In" : "Catch") {
                                lockCurrentRound()
                            }
                            .disabled(isResolvingRound)
                            .buttonStyle(.glassProminent)
                        }
                    }
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 20)
            .padding(.bottom, 94)
        }
        .onDisappear {
            advanceTask?.cancel()
            advanceTask = nil
        }
    }

    private func startNewGame() {
        advanceTask?.cancel()
        roundIndex = 0
        roundsWon = 0
        gameFinished = false
        resultTitle = ""
        resultBody = ""
        beginRound(index: 0)
    }

    private func beginRound(index: Int) {
        roundIndex = index
        roundSpec = .random(roundIndex: index)
        roundStartedAt = Date()
        frozenMarkerPosition = nil
        isResolvingRound = false
        feedbackLine = "Catch the spark inside the bright window."
    }

    private func lockCurrentRound() {
        guard hasStarted, !gameFinished, !isResolvingRound else {
            return
        }

        isResolvingRound = true
        let position = markerPosition(at: Date())
        frozenMarkerPosition = position

        let lowerBound = roundSpec.targetCenter - (roundSpec.targetWidth / 2)
        let upperBound = roundSpec.targetCenter + (roundSpec.targetWidth / 2)
        let didHit = (lowerBound ... upperBound).contains(position)

        if didHit {
            roundsWon += 1
            feedbackLine = "\(store.displayName) caught it. That round landed."
        } else {
            feedbackLine = "\(store.displayName) missed the timing and got a little frustrated."
        }

        advanceTask?.cancel()
        advanceTask = Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(850))
            guard !Task.isCancelled else {
                return
            }

            if roundIndex + 1 >= totalRounds {
                finishGame()
            } else {
                beginRound(index: roundIndex + 1)
            }
        }
    }

    private func finishGame() {
        gameFinished = true
        isResolvingRound = false
        store.resolvePlayChallenge(roundsWon: roundsWon, totalRounds: totalRounds)

        switch roundsWon {
        case totalRounds:
            resultTitle = "\(store.displayName) loved that"
            resultBody = "Perfect run. Attention jumped hard and happiness climbed with it."
        case 2:
            resultTitle = "\(store.displayName) is back with you"
            resultBody = "Solid win. Attention recovered well and the mood lift stuck."
        case 1:
            resultTitle = "\(store.displayName) noticed the effort"
            resultBody = "The time together still raised attention, but the shaky game barely helped happiness."
        default:
            resultTitle = "\(store.displayName) got frustrated"
            resultBody = "The attempt still counted as attention, but the loss cost happiness."
        }
    }

    private func markerPosition(at date: Date) -> Double {
        if let frozenMarkerPosition {
            return frozenMarkerPosition
        }

        let elapsed = max(0, date.timeIntervalSince(roundStartedAt))
        let cycle = (elapsed * roundSpec.speed).truncatingRemainder(dividingBy: 2)
        return cycle <= 1 ? cycle : (2 - cycle)
    }

    private func currentGaze(at date: Date) -> AuriEyeDirection {
        let position = markerPosition(at: date)
        if position < 0.40 {
            return .left
        }
        if position > 0.60 {
            return .right
        }
        return .center
    }
}

private struct AuriConnect4GameView: View {
    @Bindable var store: AuriStore

    @State private var game: AuriRemoteConnect4Game?
    @State private var isLoading = false
    @State private var loadError: String?

    private let boardMaxWidth: CGFloat = 372

    var body: some View {
        ScrollView(.vertical, showsIndicators: false) {
            VStack(spacing: 16) {
                AuriGlassPanel(tint: Color(red: 0.84, green: 0.90, blue: 0.99)) {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("Connect 4")
                            .font(.system(.headline, design: .rounded, weight: .bold))
                        Text("Fast enough to play in a minute, but still a real head-to-head. Drop four in a row before Auri does.")
                            .font(.system(.subheadline, design: .rounded, weight: .medium))
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }

                if let game {
                    connect4GamePanel(game)
                } else {
                    startPanel
                }

                if let loadError, !loadError.isEmpty {
                    Text(loadError)
                        .font(.system(.caption, design: .rounded, weight: .bold))
                        .foregroundStyle(Color(red: 0.71, green: 0.34, blue: 0.32))
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 20)
            .padding(.bottom, 94)
        }
        .task(id: store.lifeID) {
            await refreshGame()
        }
    }

    private var startPanel: some View {
        AuriGlassPanel(tint: Color(red: 0.95, green: 0.94, blue: 0.98)) {
            VStack(alignment: .leading, spacing: 16) {
                Text("Choose who drops first")
                    .font(.system(.title3, design: .rounded, weight: .bold))

                Text("Go first if you want the tempo. Let Auri open if you want to react.")
                    .font(.system(.subheadline, design: .rounded, weight: .medium))
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)

                HStack(spacing: 12) {
                    Button {
                        Task { await startGame(humanStarts: true) }
                    } label: {
                        Text("You First")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.glassProminent)
                    .disabled(isLoading)

                    Button {
                        Task { await startGame(humanStarts: false) }
                    } label: {
                        Text("Auri First")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.glass)
                    .disabled(isLoading)
                }

                if isLoading {
                    ProgressView("Starting Connect 4…")
                        .font(.system(.subheadline, design: .rounded, weight: .medium))
                }
            }
        }
    }

    private func connect4GamePanel(_ game: AuriRemoteConnect4Game) -> some View {
        VStack(spacing: 16) {
            AuriGlassPanel(tint: Color(red: 0.93, green: 0.95, blue: 0.98)) {
                VStack(alignment: .leading, spacing: 12) {
                    HStack(alignment: .top, spacing: 12) {
                        VStack(alignment: .leading, spacing: 6) {
                            Text(game.outcomeTitle)
                                .font(.system(.title3, design: .rounded, weight: .bold))
                            Text(statusLine(for: game))
                                .font(.system(.subheadline, design: .rounded, weight: .medium))
                                .foregroundStyle(.secondary)
                                .fixedSize(horizontal: false, vertical: true)
                        }

                        Spacer(minLength: 0)

                        VStack(alignment: .trailing, spacing: 6) {
                            AuriChip(label: game.currentTurn == .human ? "Your turn" : "Auri's turn")
                            AuriChip(label: "\(game.moveCount) drops")
                        }
                    }

                    AuriConnect4BoardView(
                        game: game,
                        isLoading: isLoading,
                        onDrop: handleColumnTap(_:)
                    )
                    .frame(maxWidth: boardMaxWidth)
                    .aspectRatio(CGFloat(game.columns) / CGFloat(game.rows + 1), contentMode: .fit)
                    .frame(maxWidth: .infinity)

                    HStack(spacing: 12) {
                        Button {
                            Task { await refreshGame() }
                        } label: {
                            Text("Refresh")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.glass)
                        .disabled(isLoading)

                        if game.status == .active {
                            Button(role: .destructive) {
                                Task { await resignCurrentGame() }
                            } label: {
                                Text("Resign")
                                    .frame(maxWidth: .infinity)
                            }
                            .buttonStyle(.glassProminent)
                            .disabled(isLoading)
                        } else {
                            Button {
                                Task { await startGame(humanStarts: game.humanStarts) }
                            } label: {
                                Text("Rematch")
                                    .frame(maxWidth: .infinity)
                            }
                            .buttonStyle(.glassProminent)
                            .disabled(isLoading)
                        }
                    }
                }
            }
        }
    }

    private func statusLine(for game: AuriRemoteConnect4Game) -> String {
        if let result = game.result {
            switch result {
            case .humanWin:
                return "You closed the line first."
            case .auriWin:
                return game.status == .resigned
                    ? "You backed out before the finish. Auri still gets the win."
                    : "Auri stacked the winning line first."
            case .draw:
                return "The board filled up without a four-in-a-row."
            }
        }

        return game.currentTurn == .human ? "Drop a disc into any open column." : "Auri is thinking."
    }

    private func handleColumnTap(_ column: Int) {
        guard let game, !isLoading, game.status == .active, game.currentTurn == .human else {
            return
        }
        guard game.legalColumns.contains(column) else {
            return
        }

        isLoading = true
        loadError = nil
        Task {
            do {
                self.game = try await store.dropConnect4Disc(in: column)
            } catch {
                loadError = error.localizedDescription
            }
            isLoading = false
        }
    }

    private func refreshGame() async {
        isLoading = true
        loadError = nil
        defer { isLoading = false }

        do {
            game = try await store.loadConnect4Game()
        } catch {
            loadError = error.localizedDescription
        }
    }

    private func startGame(humanStarts: Bool) async {
        isLoading = true
        loadError = nil
        defer { isLoading = false }

        do {
            game = try await store.startConnect4Game(humanStarts: humanStarts)
        } catch {
            loadError = error.localizedDescription
        }
    }

    private func resignCurrentGame() async {
        isLoading = true
        loadError = nil
        defer { isLoading = false }

        do {
            game = try await store.resignConnect4Game()
        } catch {
            loadError = error.localizedDescription
        }
    }
}

private struct AuriConnect4BoardView: View {
    let game: AuriRemoteConnect4Game
    let isLoading: Bool
    let onDrop: (Int) -> Void

    var body: some View {
        let tokenMap = Dictionary(uniqueKeysWithValues: game.board.map { ("\($0.row)-\($0.column)", $0) })
        let winningCells = Set(game.winningCells.map(\.id))
        let lastMoveID = game.lastMoveColumn.flatMap { column in
            game.lastMoveRow.map { row in "\(row)-\(column)" }
        }

        return GeometryReader { proxy in
            let totalSpacing = CGFloat(max(game.columns - 1, 0)) * 8
            let trayHorizontalPadding: CGFloat = 24
            let availableGridWidth = max(0, proxy.size.width - trayHorizontalPadding)
            let cellSize = min((availableGridWidth - totalSpacing) / CGFloat(max(game.columns, 1)), 48)
            let gridWidth = max(0, (cellSize * CGFloat(game.columns)) + totalSpacing)
            let trayWidth = gridWidth + trayHorizontalPadding

            VStack(spacing: 10) {
                HStack(spacing: 8) {
                    ForEach(0 ..< game.columns, id: \.self) { column in
                        Button {
                            onDrop(column)
                        } label: {
                            ZStack {
                                Circle()
                                    .fill(game.legalColumns.contains(column) && game.currentTurn == .human
                                        ? Color.white.opacity(0.30)
                                        : Color.white.opacity(0.12))
                                Image(systemName: "arrow.down")
                                    .font(.system(size: cellSize * 0.34, weight: .bold, design: .rounded))
                                    .foregroundStyle(Color.white.opacity(game.legalColumns.contains(column) ? 0.95 : 0.42))
                            }
                            .frame(width: cellSize, height: cellSize)
                        }
                        .buttonStyle(.plain)
                        .disabled(isLoading || game.currentTurn != .human || !game.legalColumns.contains(column))
                    }
                }
                .frame(width: gridWidth)

                VStack(spacing: 8) {
                    ForEach(0 ..< game.rows, id: \.self) { row in
                        HStack(spacing: 8) {
                            ForEach(0 ..< game.columns, id: \.self) { column in
                                let cellID = "\(row)-\(column)"
                                AuriConnect4CellView(
                                    token: tokenMap[cellID],
                                    isWinning: winningCells.contains(cellID),
                                    isLastMove: lastMoveID == cellID,
                                    size: cellSize
                                )
                            }
                        }
                    }
                }
                .padding(12)
                .frame(width: trayWidth)
                .background(
                    RoundedRectangle(cornerRadius: 28, style: .continuous)
                        .fill(
                            LinearGradient(
                                colors: [
                                    Color(red: 0.20, green: 0.42, blue: 0.89),
                                    Color(red: 0.16, green: 0.33, blue: 0.73)
                                ],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 28, style: .continuous)
                        .stroke(.white.opacity(0.28), lineWidth: 1)
                )
                .shadow(color: Color.black.opacity(0.12), radius: 18, x: 0, y: 10)
            }
            .frame(width: trayWidth)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        }
    }
}

private struct AuriConnect4CellView: View {
    let token: AuriRemoteConnect4Token?
    let isWinning: Bool
    let isLastMove: Bool
    let size: CGFloat

    var body: some View {
        ZStack {
            Circle()
                .fill(Color.black.opacity(0.16))
                .overlay(
                    Circle()
                        .stroke(Color.white.opacity(0.12), lineWidth: 1)
                )

            if let token {
                Circle()
                    .fill(tokenGradient(for: token.player))
                    .padding(3)
                    .overlay(
                        Circle()
                            .stroke(Color.white.opacity(isWinning ? 0.92 : (isLastMove ? 0.58 : 0.20)), lineWidth: isWinning ? 3 : 1)
                            .padding(3)
                    )
                    .shadow(color: shadowColor(for: token.player), radius: isWinning ? 14 : 8, x: 0, y: 4)
            }
        }
        .frame(width: size, height: size)
    }

    private func tokenGradient(for player: AuriRemoteConnect4Player) -> LinearGradient {
        switch player {
        case .human:
            return LinearGradient(
                colors: [
                    Color(red: 1.00, green: 0.47, blue: 0.38),
                    Color(red: 0.85, green: 0.20, blue: 0.18)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        case .auri:
            return LinearGradient(
                colors: [
                    Color(red: 1.00, green: 0.90, blue: 0.42),
                    Color(red: 0.95, green: 0.69, blue: 0.15)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        }
    }

    private func shadowColor(for player: AuriRemoteConnect4Player) -> Color {
        switch player {
        case .human:
            return Color(red: 0.85, green: 0.20, blue: 0.18).opacity(0.30)
        case .auri:
            return Color(red: 0.95, green: 0.69, blue: 0.15).opacity(0.30)
        }
    }
}

private struct AuriChessGameView: View {
    @Bindable var store: AuriStore

    @State private var game: AuriRemoteChessGame?
    @State private var selectedSquare: String?
    @State private var isLoading = false
    @State private var loadError: String?

    private let boardMaxSize: CGFloat = 356

    var body: some View {
        ScrollView(.vertical, showsIndicators: false) {
            VStack(spacing: 16) {
                AuriGlassPanel(tint: Color(red: 0.82, green: 0.90, blue: 0.98)) {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("Serious Chess")
                            .font(.system(.headline, design: .rounded, weight: .bold))
                        Text("This one is engine-backed. Auri gets the live board, move history, and result as real context while you play.")
                            .font(.system(.subheadline, design: .rounded, weight: .medium))
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }

                if let game {
                    chessGamePanel(game)
                } else {
                    startPanel
                }

                if let loadError, !loadError.isEmpty {
                    Text(loadError)
                        .font(.system(.caption, design: .rounded, weight: .bold))
                        .foregroundStyle(Color(red: 0.71, green: 0.34, blue: 0.32))
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 20)
            .padding(.bottom, 94)
        }
        .task(id: store.lifeID) {
            await refreshGame()
        }
    }

    private var startPanel: some View {
        AuriGlassPanel(tint: Color(red: 0.95, green: 0.94, blue: 0.98)) {
            VStack(alignment: .leading, spacing: 16) {
                Text("Choose your side")
                    .font(.system(.title3, design: .rounded, weight: .bold))

                Text("Start as White for the first move, or Black if you want Auri and the engine to open.")
                    .font(.system(.subheadline, design: .rounded, weight: .medium))
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)

                HStack(spacing: 12) {
                    Button {
                        Task { await startGame(as: .white) }
                    } label: {
                        Text("Play White")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.glassProminent)
                    .disabled(isLoading)

                    Button {
                        Task { await startGame(as: .black) }
                    } label: {
                        Text("Play Black")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.glass)
                    .disabled(isLoading)
                }

                if isLoading {
                    ProgressView("Starting chess…")
                        .font(.system(.subheadline, design: .rounded, weight: .medium))
                }
            }
        }
    }

    private func chessGamePanel(_ game: AuriRemoteChessGame) -> some View {
        return VStack(spacing: 16) {
            AuriGlassPanel(tint: Color(red: 0.93, green: 0.95, blue: 0.98)) {
                VStack(alignment: .leading, spacing: 12) {
                    HStack(alignment: .top, spacing: 12) {
                        VStack(alignment: .leading, spacing: 6) {
                            Text(game.outcomeTitle)
                                .font(.system(.title3, design: .rounded, weight: .bold))
                            Text(statusLine(for: game))
                                .font(.system(.subheadline, design: .rounded, weight: .medium))
                                .foregroundStyle(.secondary)
                                .fixedSize(horizontal: false, vertical: true)
                        }

                        Spacer(minLength: 0)

                        VStack(alignment: .trailing, spacing: 6) {
                            AuriChip(label: "You \(game.playerColor.title)")
                            if game.inCheck, game.status == .active {
                                AuriChip(label: "Check")
                            }
                        }
                    }

                    AuriChessBoardView(
                        game: game,
                        selectedSquare: selectedSquare,
                        destinationSquares: destinationSquares(for: game),
                        isLoading: isLoading,
                        onTap: handleSquareTap(_:)
                    )
                    .frame(maxWidth: boardMaxSize)
                    .aspectRatio(1, contentMode: .fit)
                    .frame(maxWidth: .infinity)

                    if let analysis = game.analysis {
                        Text(engineLine(for: analysis))
                            .font(.system(.caption, design: .rounded, weight: .medium))
                            .foregroundStyle(.secondary)
                    }

                    if !game.recentMoves.isEmpty {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 8) {
                                ForEach(game.recentMoves) { move in
                                    AuriChip(label: "\(move.moveNumber). \(move.san)")
                                }
                            }
                        }
                    }

                    HStack(spacing: 12) {
                        Button {
                            Task { await refreshGame() }
                        } label: {
                            Text("Refresh")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.glass)
                        .disabled(isLoading)

                        if game.status == .active {
                            Button(role: .destructive) {
                                Task { await resignCurrentGame() }
                            } label: {
                                Text("Resign")
                                    .frame(maxWidth: .infinity)
                            }
                            .buttonStyle(.glassProminent)
                            .disabled(isLoading)
                        } else {
                            Button {
                                Task { await startGame(as: game.playerColor) }
                            } label: {
                                Text("Rematch")
                                    .frame(maxWidth: .infinity)
                            }
                            .buttonStyle(.glassProminent)
                            .disabled(isLoading)
                        }
                    }
                }
            }
        }
    }

    private func statusLine(for game: AuriRemoteChessGame) -> String {
        if let result = game.result {
            switch result {
            case .humanWin:
                return "You finished the game on top. Auri should remember that result in chat too."
            case .auriWin:
                return game.status == .resigned
                    ? "You backed out before the finish. Auri still got the win."
                    : "Auri closed it out."
            case .draw:
                return "Neither side broke through."
            }
        }

        if game.currentTurn == "human" {
            return "Your move."
        }
        return "Auri is on move."
    }

    private func engineLine(for analysis: AuriRemoteChessAnalysis) -> String {
        let depth = analysis.depth.map { "Depth \($0)" } ?? "Depth --"
        if let mate = analysis.mate {
            return "\(depth) • Mate \(mate)"
        }
        if let scoreCp = analysis.scoreCp {
            let score = Double(scoreCp) / 100
            return "\(depth) • Eval \(score.formatted(.number.precision(.fractionLength(1))))"
        }
        return depth
    }

    private func destinationSquares(for game: AuriRemoteChessGame) -> Set<String> {
        guard let selectedSquare else {
            return []
        }
        return Set(game.legalMoves.filter { $0.from == selectedSquare }.map(\.to))
    }

    private func handleSquareTap(_ square: String) {
        guard let game, !isLoading, game.status == .active, game.currentTurn == "human" else {
            return
        }

        if let selectedSquare {
            if selectedSquare == square {
                self.selectedSquare = nil
                return
            }

            if let move = game.legalMoves.first(where: { $0.from == selectedSquare && $0.to == square }) {
                self.selectedSquare = nil
                isLoading = true
                loadError = nil
                Task {
                    do {
                        self.game = try await store.submitChessMove(
                            from: move.from,
                            to: move.to,
                            promotion: move.promotion ?? "q"
                        )
                    } catch {
                        loadError = error.localizedDescription
                    }
                    isLoading = false
                }
                return
            }
        }

        let ownPieceSquares = Set(game.board.filter { $0.color == game.playerColor }.map(\.square))
        if ownPieceSquares.contains(square),
           game.legalMoves.contains(where: { $0.from == square }) {
            selectedSquare = square
        } else {
            selectedSquare = nil
        }
    }

    private func refreshGame() async {
        isLoading = true
        loadError = nil
        defer { isLoading = false }

        do {
            game = try await store.loadChessGame()
        } catch {
            loadError = error.localizedDescription
        }
    }

    private func startGame(as color: AuriRemoteChessColor) async {
        isLoading = true
        selectedSquare = nil
        loadError = nil
        defer { isLoading = false }

        do {
            game = try await store.startChessGame(as: color)
        } catch {
            loadError = error.localizedDescription
        }
    }

    private func resignCurrentGame() async {
        isLoading = true
        selectedSquare = nil
        loadError = nil
        defer { isLoading = false }

        do {
            game = try await store.resignChessGame()
        } catch {
            loadError = error.localizedDescription
        }
    }
}

private struct AuriChessBoardView: View {
    let game: AuriRemoteChessGame
    let selectedSquare: String?
    let destinationSquares: Set<String>
    let isLoading: Bool
    let onTap: (String) -> Void

    var body: some View {
        let files = orderedFiles
        let ranks = orderedRanks
        let lastMoveSquares = Set([
            game.lastMoveUCI.map { String($0.prefix(2)) },
            game.lastMoveUCI.flatMap { $0.count >= 4 ? String($0.dropFirst(2).prefix(2)) : nil }
        ].compactMap { $0 })

        return GeometryReader { proxy in
            let side = min(proxy.size.width, proxy.size.height)

            VStack(spacing: 0) {
                ForEach(ranks, id: \.self) { rank in
                    HStack(spacing: 0) {
                        ForEach(files, id: \.self) { file in
                            let square = "\(file)\(rank)"
                            let piece = game.board.first(where: { $0.square == square })
                            AuriChessSquareCell(
                                square: square,
                                piece: piece,
                                isSelected: selectedSquare == square,
                                isDestination: destinationSquares.contains(square),
                                isLastMove: lastMoveSquares.contains(square),
                                isDisabled: isLoading
                            ) {
                                onTap(square)
                            }
                        }
                    }
                }
            }
            .frame(width: side, height: side)
            .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .stroke(.white.opacity(0.42), lineWidth: 1)
            )
            .shadow(color: Color.black.opacity(0.10), radius: 16, x: 0, y: 10)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    private var orderedFiles: [String] {
        game.playerColor == .white
            ? ["a", "b", "c", "d", "e", "f", "g", "h"]
            : ["h", "g", "f", "e", "d", "c", "b", "a"]
    }

    private var orderedRanks: [Int] {
        game.playerColor == .white
            ? [8, 7, 6, 5, 4, 3, 2, 1]
            : [1, 2, 3, 4, 5, 6, 7, 8]
    }
}

private struct AuriChessSquareCell: View {
    let square: String
    let piece: AuriRemoteChessPiece?
    let isSelected: Bool
    let isDestination: Bool
    let isLastMove: Bool
    let isDisabled: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            GeometryReader { proxy in
                let isDark = Self.isDarkSquare(square)
                let baseColor = isDark
                    ? Color(red: 0.53, green: 0.61, blue: 0.70)
                    : Color(red: 0.91, green: 0.90, blue: 0.83)

                ZStack {
                    Rectangle()
                        .fill(baseColor)

                    if isLastMove {
                        Rectangle()
                            .fill(Color(red: 0.97, green: 0.83, blue: 0.46).opacity(0.28))
                    }

                    if isSelected {
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .stroke(Color(red: 0.26, green: 0.46, blue: 0.87), lineWidth: 3)
                            .padding(3)
                    } else if isDestination {
                        Circle()
                            .fill(Color(red: 0.24, green: 0.56, blue: 0.33).opacity(0.78))
                            .frame(width: min(proxy.size.width, proxy.size.height) * 0.24)
                    }

                    if let piece {
                        Text(chessGlyph(for: piece))
                            .font(.system(size: min(proxy.size.width, proxy.size.height) * 0.70))
                            .foregroundStyle(piece.color == .white ? Color.white.opacity(0.98) : Color.black.opacity(0.88))
                            .shadow(color: piece.color == .white ? Color.black.opacity(0.22) : .clear, radius: 2, x: 0, y: 1)
                    }
                }
            }
        }
        .buttonStyle(.plain)
        .disabled(isDisabled)
    }

    private static func isDarkSquare(_ square: String) -> Bool {
        guard square.count == 2,
              let fileScalar = square.first?.unicodeScalars.first?.value,
              let rank = Int(String(square.last!)) else {
            return false
        }

        let fileIndex = Int(fileScalar) - Int(UnicodeScalar("a").value) + 1
        return (fileIndex + rank).isMultiple(of: 2)
    }

    private func chessGlyph(for piece: AuriRemoteChessPiece) -> String {
        switch (piece.kind, piece.color) {
        case ("k", .white): return "♔"
        case ("q", .white): return "♕"
        case ("r", .white): return "♖"
        case ("b", .white): return "♗"
        case ("n", .white): return "♘"
        case ("p", .white): return "♙"
        case ("k", .black): return "♚"
        case ("q", .black): return "♛"
        case ("r", .black): return "♜"
        case ("b", .black): return "♝"
        case ("n", .black): return "♞"
        default: return "♟"
        }
    }
}

private struct AuriPlayTrack: View {
    let targetCenter: Double
    let targetWidth: Double
    let markerPosition: Double

    var body: some View {
        GeometryReader { proxy in
            let inset: CGFloat = 16
            let usableWidth = max(140, proxy.size.width - (inset * 2))
            let trackHeight = min(56, max(44, proxy.size.height * 0.56))
            let zoneWidth = usableWidth * CGFloat(targetWidth)
            let zoneX = inset + (usableWidth * CGFloat(targetCenter)) - (zoneWidth / 2)
            let markerX = inset + (usableWidth * CGFloat(markerPosition))

            ZStack(alignment: .leading) {
                Rectangle()
                    .fill(Color(red: 0.17, green: 0.25, blue: 0.38).opacity(0.92))
                    .frame(height: trackHeight)
                    .overlay {
                        HStack(spacing: 6) {
                            ForEach(0..<14, id: \.self) { _ in
                                Rectangle()
                                    .fill(Color.white.opacity(0.08))
                            }
                        }
                        .padding(.horizontal, 10)
                        .padding(.vertical, 10)
                    }

                Rectangle()
                    .fill(Color(red: 0.98, green: 0.86, blue: 0.44).opacity(0.84))
                    .frame(width: zoneWidth, height: trackHeight - 14)
                    .offset(x: zoneX, y: 7)
                    .overlay(
                        Rectangle()
                            .stroke(Color.white.opacity(0.8), lineWidth: 2)
                            .frame(width: zoneWidth, height: trackHeight - 14)
                            .offset(x: zoneX, y: 7)
                    )

                AuriPlaySpark()
                    .frame(width: 28, height: 28)
                    .offset(x: markerX - 14, y: (trackHeight / 2) - 14)
                    .shadow(color: Color(red: 0.98, green: 0.84, blue: 0.40).opacity(0.5), radius: 8, x: 0, y: 0)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        }
    }
}

private struct AuriPlaySpark: View {
    private static let rows = [
        "..g..",
        ".ggg.",
        "ggggg",
        ".ggg.",
        "..g.."
    ]

    var body: some View {
        GeometryReader { proxy in
            let columns = Self.rows.map(\.count).max() ?? 1
            let pixel = max(floor(min(proxy.size.width / CGFloat(columns), proxy.size.height / CGFloat(Self.rows.count))), 1)

            AuriPixelGridLayer(columns: columns, rows: Self.rows.count, pixel: pixel) { column, row in
                let symbol = Array(Self.rows[row])[column]
                switch symbol {
                case "g":
                    return Color(red: 0.98, green: 0.90, blue: 0.42)
                default:
                    return .clear
                }
            }
            .frame(width: CGFloat(columns) * pixel, height: CGFloat(Self.rows.count) * pixel)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }
}

private struct AuriSettingsView: View {
    @Bindable var store: AuriStore
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ZStack {
                AuriMenuBackdrop(dimmed: store.lightsOff)

                ScrollView(.vertical, showsIndicators: false) {
                    VStack(spacing: 16) {
                        AuriGlassPanel(tint: Color(red: 0.83, green: 0.90, blue: 0.95)) {
                            VStack(alignment: .leading, spacing: 10) {
                                Text("Cloud Chat")
                                    .font(.system(.headline, design: .rounded, weight: .bold))
                                Text(
                                    AuriRuntimeConfiguration.hasConfiguredChatProxy
                                        ? "This build is configured to send Auri chat to a cloud service. For App Store release, that service should be a public HTTPS backend running the pinned OpenAI path."
                                        : "This build is not pointing at a cloud chat service yet. Auri chat will stay unavailable until you configure a public HTTPS backend."
                                )
                                    .font(.system(.subheadline, design: .rounded, weight: .medium))
                                    .foregroundStyle(.secondary)

                                if AuriRuntimeConfiguration.hasConfiguredChatProxy {
                                    Text(AuriStore.defaultProxyURLString)
                                        .font(.system(.footnote, design: .monospaced, weight: .medium))
                                        .foregroundStyle(Color.primary.opacity(0.82))
                                        .textSelection(.enabled)
                                        .padding(.horizontal, 16)
                                        .padding(.vertical, 14)
                                        .frame(maxWidth: .infinity, alignment: .leading)
                                        .background(
                                            RoundedRectangle(cornerRadius: 20, style: .continuous)
                                                .fill(.white.opacity(0.58))
                                        )
                                } else {
                                    Label("Cloud chat is not configured.", systemImage: "exclamationmark.triangle")
                                        .font(.system(.subheadline, design: .rounded, weight: .semibold))
                                        .foregroundStyle(Color.primary.opacity(0.82))
                                        .padding(.horizontal, 16)
                                        .padding(.vertical, 14)
                                        .frame(maxWidth: .infinity, alignment: .leading)
                                        .background(
                                            RoundedRectangle(cornerRadius: 20, style: .continuous)
                                                .fill(.white.opacity(0.58))
                                        )
                                }
                            }
                        }

                        AuriGlassPanel(tint: Color(red: 0.96, green: 0.88, blue: 0.76)) {
                            VStack(alignment: .leading, spacing: 10) {
                                Text("Privacy")
                                    .font(.system(.headline, design: .rounded, weight: .bold))
                                Text("Food, water, health, and memory stay on the phone. If cloud chat is enabled, Auri sends your typed message, onboarding profile, relationship state, and a compact live care summary to the configured backend so she can reply in context.")
                                    .font(.system(.subheadline, design: .rounded, weight: .medium))
                                    .foregroundStyle(.secondary)
                            }
                        }

                        AuriGlassPanel(tint: Color(red: 0.89, green: 0.92, blue: 0.86)) {
                            VStack(alignment: .leading, spacing: 12) {
                                Text("Links")
                                    .font(.system(.headline, design: .rounded, weight: .bold))

                                if let privacyPolicyURL = AuriRuntimeConfiguration.privacyPolicyURL {
                                    Link("Privacy Policy", destination: privacyPolicyURL)
                                        .buttonStyle(.glass)
                                }

                                if let supportURL = AuriRuntimeConfiguration.supportURL {
                                    Link("Support", destination: supportURL)
                                        .buttonStyle(.glass)
                                }

                                if let termsURL = AuriRuntimeConfiguration.termsURL {
                                    Link("Terms", destination: termsURL)
                                        .buttonStyle(.glass)
                                }

                                if AuriRuntimeConfiguration.privacyPolicyURL == nil,
                                   AuriRuntimeConfiguration.supportURL == nil,
                                   AuriRuntimeConfiguration.termsURL == nil {
                                    Text("Add privacy-policy, support, and terms URLs to the release build before App Store submission.")
                                        .font(.system(.subheadline, design: .rounded, weight: .medium))
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }

                        AuriGlassPanel(tint: Color(red: 0.91, green: 0.82, blue: 0.82)) {
                            VStack(alignment: .leading, spacing: 12) {
                                Text("Lifecycle")
                                    .font(.system(.headline, design: .rounded, weight: .bold))
                                Text("Food, water, sleep, sickness, cleanliness, discipline, attention, and happiness all feed into \(store.displayName)'s health. Auri only dies if health reaches zero.")
                                    .font(.system(.subheadline, design: .rounded, weight: .medium))
                                    .foregroundStyle(.secondary)

                                Button("Start New Auri") {
                                    store.startNewAuri()
                                    dismiss()
                                }
                                .buttonStyle(.glassProminent)
                            }
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.vertical, 20)
                }
            }
            .navigationTitle("Auri Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
        }
    }
}

private struct AuriShopSheet: View {
    @Bindable var store: AuriStore
    @Environment(\.dismiss) private var dismiss
    @State private var selectedSection: AuriShopSection = .outfits
    @Namespace private var sectionBubbleNamespace

    var body: some View {
        NavigationStack {
            ZStack {
                AuriMenuBackdrop(dimmed: store.lightsOff)

                ScrollView(.vertical, showsIndicators: false) {
                    VStack(spacing: 16) {
                        AuriGlassPanel(tint: Color(red: 0.99, green: 0.93, blue: 0.70)) {
                            VStack(alignment: .leading, spacing: 10) {
                                Text("Shop")
                                    .font(.system(.headline, design: .rounded, weight: .bold))
                                Text("These outfits only swap how Auri looks. Buying or equipping one never resets this life's stats, memories, or conversation.")
                                    .font(.system(.subheadline, design: .rounded, weight: .medium))
                                    .foregroundStyle(.secondary)
                                    .fixedSize(horizontal: false, vertical: true)
                                Text("Living Auri also earns 1 Star every 2 hours.")
                                    .font(.system(.caption, design: .rounded, weight: .bold))
                                    .foregroundStyle(Color(red: 0.55, green: 0.46, blue: 0.18))
                                HStack(spacing: 10) {
                                    Image(systemName: "sparkles")
                                    Text(store.coinBalanceLine)
                                        .font(.system(.title3, design: .rounded, weight: .bold))
                                }
                                .foregroundStyle(Color(red: 0.24, green: 0.25, blue: 0.28))

                                if let errorMessage = store.errorMessage {
                                    Text(errorMessage)
                                        .font(.system(.caption, design: .rounded, weight: .bold))
                                        .foregroundStyle(Color(red: 0.71, green: 0.34, blue: 0.32))
                                        .fixedSize(horizontal: false, vertical: true)
                                }
                            }
                        }

                        activeSectionPanel
                    }
                    .padding(.horizontal, 20)
                    .padding(.vertical, 20)
                    .padding(.bottom, 84)
                }
            }
            .safeAreaInset(edge: .bottom) {
                AuriShopSectionSlider(
                    selection: $selectedSection,
                    namespace: sectionBubbleNamespace,
                    prefersLightText: store.lightsOff
                )
                .frame(maxWidth: .infinity)
                .padding(.top, 6)
                .padding(.bottom, 8)
            }
            .navigationTitle("Shop")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
        }
    }

    @ViewBuilder
    private var activeSectionPanel: some View {
        switch selectedSection {
        case .outfits:
            LazyVStack(spacing: 14) {
                ForEach(store.outfitCatalog) { entry in
                    AuriShopOutfitCard(
                        store: store,
                        entry: entry,
                        tint: outfitTint(for: entry.id)
                    )
                }
            }

        case .comingSoon:
            AuriGlassPanel(tint: Color(red: 0.93, green: 0.88, blue: 0.96)) {
                VStack(alignment: .leading, spacing: 12) {
                    Text("Coming Soon")
                        .font(.system(.headline, design: .rounded, weight: .bold))
                    Text("Future shop categories will live here, like hair colors, themed looks, accessories, and other cosmetic drops.")
                        .font(.system(.subheadline, design: .rounded, weight: .medium))
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
    }

    private func outfitTint(for outfitID: String) -> Color {
        switch outfitID {
        case "workout":
            return Color(red: 0.91, green: 0.96, blue: 0.82)
        case "sleepwear":
            return Color(red: 0.86, green: 0.89, blue: 0.99)
        default:
            return Color(red: 0.97, green: 0.93, blue: 0.86)
        }
    }
}

private enum AuriShopSection: String, CaseIterable, Identifiable {
    case outfits
    case comingSoon

    var id: String { rawValue }

    var title: String {
        switch self {
        case .outfits:
            return "Outfits"
        case .comingSoon:
            return "Coming Soon"
        }
    }
}

private struct AuriShopSectionSlider: View {
    @Binding var selection: AuriShopSection
    let namespace: Namespace.ID
    var prefersLightText: Bool = false
    @State private var dragLocationX: CGFloat?

    private let capsuleHeight: CGFloat = 44
    private let controlWidth: CGFloat = 224

    private var labelColor: Color {
        prefersLightText ? Color.white.opacity(0.96) : Color(red: 0.17, green: 0.21, blue: 0.25)
    }

    var body: some View {
        GeometryReader { proxy in
            let sections = AuriShopSection.allCases
            let segmentWidth = proxy.size.width / CGFloat(max(sections.count, 1))
            let bubbleWidth = segmentWidth
            let activeSection = hoveredSection(totalWidth: proxy.size.width)
            let bubbleCenterX = clampedBubbleCenter(totalWidth: proxy.size.width)
            let bubbleOffsetX = bubbleCenterX - (bubbleWidth / 2)

            ZStack(alignment: .leading) {
                HStack(spacing: 0) {
                    ForEach(sections) { section in
                        Text(section.title)
                            .font(.system(size: 11, weight: .bold, design: .rounded))
                            .lineLimit(1)
                            .minimumScaleFactor(0.7)
                            .foregroundStyle(labelColor.opacity(activeSection == section ? (prefersLightText ? 0.18 : 0.08) : (prefersLightText ? 0.98 : 0.86)))
                            .frame(maxWidth: .infinity)
                    }
                }

                ZStack {
                    Capsule(style: .continuous)
                        .fill(.clear)
                        .matchedGeometryEffect(id: "auri-shop-section-bubble", in: namespace)
                        .frame(width: bubbleWidth, height: capsuleHeight)
                        .glassEffect(.regular.tint(Color.white.opacity(0.18)).interactive(), in: .capsule)
                        .overlay(
                            Capsule(style: .continuous)
                                .stroke(.white.opacity(0.38), lineWidth: 1)
                        )

                    Text(activeSection.title)
                        .font(.system(size: 11, weight: .bold, design: .rounded))
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                        .foregroundStyle(labelColor.opacity(prefersLightText ? 0.98 : 0.96))
                        .frame(width: bubbleWidth, height: capsuleHeight)
                }
                .frame(width: bubbleWidth, height: capsuleHeight)
                .offset(x: bubbleOffsetX, y: 0)
            }
            .frame(width: proxy.size.width, height: capsuleHeight)
            .contentShape(Capsule(style: .continuous))
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { value in
                        dragLocationX = value.location.x
                    }
                    .onEnded { value in
                        let nextSection = section(for: value.location.x, totalWidth: proxy.size.width)
                        withAnimation(.spring(response: 0.30, dampingFraction: 0.84)) {
                            selection = nextSection
                            dragLocationX = nil
                        }
                    }
            )
        }
        .frame(width: controlWidth, height: capsuleHeight)
        .glassEffect(.regular.tint(Color.white.opacity(0.12)), in: .capsule)
        .overlay(
            Capsule(style: .continuous)
                .stroke(.white.opacity(0.30), lineWidth: 1)
        )
        .shadow(color: Color.black.opacity(0.08), radius: 14, x: 0, y: 8)
    }

    private func clampedBubbleCenter(totalWidth: CGFloat) -> CGFloat {
        let minCenter = (totalWidth / CGFloat(max(AuriShopSection.allCases.count, 1))) / 2
        let maxCenter = totalWidth - minCenter
        let targetCenter = dragLocationX ?? centerX(for: selection, totalWidth: totalWidth)
        return min(max(targetCenter, minCenter), maxCenter)
    }

    private func hoveredSection(totalWidth: CGFloat) -> AuriShopSection {
        section(for: dragLocationX ?? centerX(for: selection, totalWidth: totalWidth), totalWidth: totalWidth)
    }

    private func centerX(for section: AuriShopSection, totalWidth: CGFloat) -> CGFloat {
        let sections = AuriShopSection.allCases
        let segmentWidth = totalWidth / CGFloat(max(sections.count, 1))
        let index = CGFloat(sections.firstIndex(of: section) ?? 0)
        return (segmentWidth * index) + (segmentWidth / 2)
    }

    private func section(for locationX: CGFloat, totalWidth: CGFloat) -> AuriShopSection {
        let sections = AuriShopSection.allCases
        let segmentWidth = totalWidth / CGFloat(max(sections.count, 1))
        let normalized = min(max(locationX, 0), totalWidth - 0.001)
        let index = min(Int(normalized / max(segmentWidth, 1)), sections.count - 1)
        return sections[index]
    }
}

private struct AuriOnboardingAvatarCard: View {
    let entry: AuriAvatarCatalogEntry
    let isSelected: Bool
    let action: () -> Void

    private var tint: Color {
        switch entry.id {
        case "classic_auri":
            return Color(red: 0.85, green: 0.92, blue: 0.98)
        case "sofi":
            return Color(red: 0.98, green: 0.90, blue: 0.92)
        case "gari":
            return Color(red: 0.91, green: 0.94, blue: 0.84)
        case "gauri":
            return Color(red: 0.89, green: 0.90, blue: 0.99)
        case "aori":
            return Color(red: 0.96, green: 0.88, blue: 0.82)
        default:
            return Color(red: 0.99, green: 0.90, blue: 0.84)
        }
    }

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 12) {
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .fill(
                        LinearGradient(
                            colors: [
                                tint.opacity(0.98),
                                tint.opacity(0.78)
                            ],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(height: 118)
                    .overlay(alignment: .topLeading) {
                        Text(isSelected ? "Selected" : "Tap to preview")
                            .font(.system(.caption2, design: .rounded, weight: .bold))
                            .foregroundStyle(Color(red: 0.18, green: 0.23, blue: 0.27))
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                            .background(
                                Capsule(style: .continuous)
                                    .fill(.white.opacity(0.72))
                            )
                            .padding(12)
                    }
                    .overlay(alignment: .bottomLeading) {
                        VStack(alignment: .leading, spacing: 5) {
                            Text(entry.title)
                                .font(.system(.headline, design: .rounded, weight: .bold))
                            Text("Beautiful from the very first minute.")
                                .font(.system(.caption, design: .rounded, weight: .semibold))
                                .foregroundStyle(Color(red: 0.18, green: 0.23, blue: 0.27).opacity(0.72))
                        }
                        .foregroundStyle(Color(red: 0.18, green: 0.23, blue: 0.27))
                        .padding(14)
                    }

                Text(entry.subtitle)
                    .font(.system(.caption, design: .rounded, weight: .medium))
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: 28, style: .continuous)
                    .fill(.white.opacity(0.64))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 28, style: .continuous)
                    .stroke(isSelected ? tint.opacity(0.94) : .white.opacity(0.38), lineWidth: isSelected ? 3 : 1.5)
            )
        }
        .buttonStyle(.plain)
    }
}

private struct AuriSelectionGrid: View {
    let labels: [String]
    let selectedLabels: Set<String>
    let tint: Color
    let action: (String) -> Void

    private let columns = [
        GridItem(.adaptive(minimum: 128, maximum: 220), spacing: 10)
    ]

    var body: some View {
        LazyVGrid(columns: columns, alignment: .leading, spacing: 10) {
            ForEach(labels, id: \.self) { label in
                Button {
                    action(label)
                } label: {
                    Text(label)
                        .font(.system(.subheadline, design: .rounded, weight: .bold))
                        .foregroundStyle(Color(red: 0.16, green: 0.21, blue: 0.24))
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 12)
                        .frame(maxWidth: .infinity)
                        .background(
                            Capsule(style: .continuous)
                                .fill(selectedLabels.contains(label) ? tint.opacity(0.98) : .white.opacity(0.58))
                        )
                        .overlay(
                            Capsule(style: .continuous)
                                .stroke(selectedLabels.contains(label) ? tint.opacity(0.98) : .white.opacity(0.35), lineWidth: selectedLabels.contains(label) ? 2 : 1)
                        )
                }
                .buttonStyle(.plain)
            }
        }
    }
}

private struct AuriMiniSliderPill: View {
    let progress: Double
    let label: String

    var body: some View {
        AuriFloatingPill(tint: Color.white.opacity(0.92), horizontalPadding: 12, verticalPadding: 10) {
            VStack(alignment: .leading, spacing: 7) {
                Text(label)
                    .font(.system(size: 10, weight: .bold, design: .rounded))
                    .foregroundStyle(Color(red: 0.18, green: 0.23, blue: 0.27).opacity(0.72))

                GeometryReader { proxy in
                    ZStack(alignment: .leading) {
                        Capsule(style: .continuous)
                            .fill(Color.white.opacity(0.42))

                        Capsule(style: .continuous)
                            .fill(
                                LinearGradient(
                                    colors: [
                                        Color(red: 0.56, green: 0.75, blue: 0.98),
                                        Color(red: 0.83, green: 0.67, blue: 0.97)
                                    ],
                                    startPoint: .leading,
                                    endPoint: .trailing
                                )
                            )
                            .frame(width: max(12, proxy.size.width * min(max(progress, 0), 1)))
                    }
                }
                .frame(width: 74, height: 8)
            }
        }
    }
}

private struct AuriBackdrop: View {
    var dimmed = false

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [
                    Color(red: 0.98, green: 0.96, blue: 0.90),
                    Color(red: 0.86, green: 0.93, blue: 0.96),
                    Color(red: 0.82, green: 0.88, blue: 0.87)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

            Circle()
                .fill(Color(red: 0.99, green: 0.82, blue: 0.73).opacity(0.36))
                .frame(width: 260, height: 260)
                .blur(radius: 20)
                .offset(x: -110, y: -250)

            Circle()
                .fill(Color(red: 0.60, green: 0.83, blue: 0.97).opacity(0.24))
                .frame(width: 300, height: 300)
                .blur(radius: 22)
                .offset(x: 120, y: -140)

            Circle()
                .fill(Color(red: 0.68, green: 0.86, blue: 0.72).opacity(0.22))
                .frame(width: 260, height: 260)
                .blur(radius: 18)
                .offset(x: 40, y: 260)

            if dimmed {
                LinearGradient(
                    colors: [
                        Color(red: 0.05, green: 0.07, blue: 0.13).opacity(0.70),
                        Color(red: 0.02, green: 0.03, blue: 0.07).opacity(0.84)
                    ],
                    startPoint: .top,
                    endPoint: .bottom
                )
                .ignoresSafeArea()

                ForEach(0..<8, id: \.self) { index in
                    Circle()
                        .fill(Color.white.opacity(0.26 - (Double(index) * 0.02)))
                        .frame(width: index.isMultiple(of: 3) ? 4 : 3, height: index.isMultiple(of: 3) ? 4 : 3)
                        .blur(radius: index.isMultiple(of: 2) ? 0.3 : 0)
                        .offset(
                            x: CGFloat(-150 + (index * 42)),
                            y: CGFloat(-330 + ((index % 3) * 36))
                        )
                }

                Rectangle()
                    .fill(Color.black.opacity(0.22))
                    .ignoresSafeArea()
            }
        }
    }
}

private struct AuriMenuBackdrop: View {
    var dimmed = false

    var body: some View {
        ZStack {
            LinearGradient(
                colors: dimmed
                    ? [
                        Color(red: 0.08, green: 0.10, blue: 0.16),
                        Color(red: 0.05, green: 0.07, blue: 0.12)
                    ]
                    : [
                        Color(red: 0.96, green: 0.98, blue: 1.00),
                        Color(red: 0.90, green: 0.94, blue: 0.99)
                    ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

            RadialGradient(
                colors: [
                    Color(red: 0.99, green: 0.88, blue: 0.78).opacity(dimmed ? 0.08 : 0.20),
                    .clear
                ],
                center: .topLeading,
                startRadius: 18,
                endRadius: 340
            )
            .offset(x: -40, y: -80)
            .ignoresSafeArea()

            RadialGradient(
                colors: [
                    Color(red: 0.69, green: 0.84, blue: 0.98).opacity(dimmed ? 0.07 : 0.16),
                    .clear
                ],
                center: .bottomTrailing,
                startRadius: 16,
                endRadius: 320
            )
            .offset(x: 40, y: 60)
            .ignoresSafeArea()

            if dimmed {
                LinearGradient(
                    colors: [
                        Color.black.opacity(0.10),
                        Color.black.opacity(0.24)
                    ],
                    startPoint: .top,
                    endPoint: .bottom
                )
                .ignoresSafeArea()
            }
        }
    }
}

private struct AuriGlassPanel<Content: View>: View {
    let tint: Color
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            content
        }
        .padding(20)
        .background(
            RoundedRectangle(cornerRadius: 30, style: .continuous)
                .fill(
                    LinearGradient(
                        colors: [
                            Color.white.opacity(0.82),
                            tint.opacity(0.18)
                        ],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
        )
        .overlay(
            RoundedRectangle(cornerRadius: 30, style: .continuous)
                .stroke(.white.opacity(0.38), lineWidth: 1)
        )
        .shadow(color: Color.black.opacity(0.05), radius: 12, x: 0, y: 8)
    }
}

private struct AuriChip: View {
    let label: String

    var body: some View {
        Text(label)
            .font(.system(.caption, design: .rounded, weight: .bold))
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(
                Capsule(style: .continuous)
                    .fill(.white.opacity(0.58))
            )
    }
}

private struct AuriMetricRow: View {
    let label: String
    let value: String

    var body: some View {
        HStack {
            Text(label)
                .font(.system(.subheadline, design: .rounded, weight: .bold))
            Spacer()
            Text(value)
                .font(.system(.subheadline, design: .rounded, weight: .semibold))
                .foregroundStyle(.secondary)
        }
    }
}

private struct AuriRelationshipBarPill: View {
    let state: AuriRelationshipState
    var prefersLightText: Bool

    private var tint: Color {
        switch state.kind {
        case .friendship:
            return Color(red: 0.42, green: 0.66, blue: 0.97)
        case .romance:
            return Color(red: 0.97, green: 0.52, blue: 0.73)
        case .negative:
            return Color(red: 0.93, green: 0.39, blue: 0.41)
        }
    }

    private var labelColor: Color {
        prefersLightText ? Color.white.opacity(0.96) : Color(red: 0.18, green: 0.21, blue: 0.25)
    }

    var body: some View {
        AuriFloatingPill(
            tint: tint.opacity(prefersLightText ? 0.54 : 0.30),
            horizontalPadding: 14,
            verticalPadding: 10
        ) {
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 7) {
                    Circle()
                        .fill(tint)
                        .frame(width: 8, height: 8)

                    Text(state.title)
                        .font(.system(.caption, design: .rounded, weight: .bold))
                        .foregroundStyle(labelColor)
                        .lineLimit(1)
                }

                GeometryReader { proxy in
                    ZStack(alignment: .leading) {
                        Capsule(style: .continuous)
                            .fill(labelColor.opacity(prefersLightText ? 0.18 : 0.12))

                        Capsule(style: .continuous)
                            .fill(
                                LinearGradient(
                                    colors: [
                                        tint.opacity(0.95),
                                        tint.opacity(0.72)
                                    ],
                                    startPoint: .leading,
                                    endPoint: .trailing
                                )
                            )
                            .frame(width: max(12, proxy.size.width * max(0.06, min(1, state.progress))))
                    }
                }
                .frame(height: 8)
            }
            .frame(width: 172, alignment: .leading)
        }
    }
}

private struct AuriMoodPanel: View {
    let mood: AuriMood

    var body: some View {
        AuriGlassPanel(tint: mood.tint) {
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 12) {
                    Image(systemName: mood.symbolName)
                        .font(.system(size: 20, weight: .bold))
                        .foregroundStyle(Color(red: 0.18, green: 0.23, blue: 0.27))
                        .frame(width: 42, height: 42)
                        .background(
                            Circle()
                                .fill(.white.opacity(0.62))
                        )

                    VStack(alignment: .leading, spacing: 2) {
                        Text("Current Mood")
                            .font(.system(.headline, design: .rounded, weight: .bold))
                        Text(mood.title)
                            .font(.system(.subheadline, design: .rounded, weight: .semibold))
                            .foregroundStyle(.secondary)
                    }

                    Spacer(minLength: 0)
                }

                Text(mood.playerSummary)
                    .font(.system(.subheadline, design: .rounded, weight: .medium))
                    .foregroundStyle(Color(red: 0.16, green: 0.22, blue: 0.26).opacity(0.82))
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

private struct AuriMoodBadge: View {
    let mood: AuriMood

    var body: some View {
        AuriFloatingPill(tint: mood.tint, horizontalPadding: 12, verticalPadding: 10) {
            HStack(spacing: 8) {
                Image(systemName: mood.symbolName)
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(Color(red: 0.18, green: 0.23, blue: 0.27))
                    .frame(width: 26, height: 26)
                    .background(
                        Circle()
                            .fill(.white.opacity(0.66))
                    )

                VStack(alignment: .leading, spacing: 0) {
                    Text("Mood")
                        .font(.system(size: 9, weight: .bold, design: .rounded))
                        .foregroundStyle(Color(red: 0.18, green: 0.23, blue: 0.27).opacity(0.66))
                        .lineLimit(1)
                    Text(mood.title)
                        .font(.system(.caption, design: .rounded, weight: .bold))
                        .foregroundStyle(Color(red: 0.18, green: 0.23, blue: 0.27))
                        .lineLimit(1)
                        .minimumScaleFactor(0.85)
                }
            }
        }
    }
}

private struct AuriFloatingPill<Content: View>: View {
    let tint: Color
    var horizontalPadding: CGFloat = 16
    var verticalPadding: CGFloat = 12
    @ViewBuilder var content: Content

    var body: some View {
        GlassEffectContainer(spacing: 0) {
            HStack(spacing: 10) {
                content
            }
            .padding(.horizontal, horizontalPadding)
            .padding(.vertical, verticalPadding)
        }
        .contentShape(Capsule(style: .continuous))
        .glassEffect(.regular.tint(tint.opacity(0.18)).interactive(), in: .capsule)
        .overlay(
            Capsule(style: .continuous)
                .stroke(.white.opacity(0.34), lineWidth: 1)
        )
    }
}

private struct AuriFloatingOrbStyle: ButtonStyle {
    let tint: Color

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .background(
                Circle()
                    .fill(tint.opacity(configuration.isPressed ? 0.88 : 0.98))
            )
            .glassEffect(.regular.tint(tint.opacity(0.16)).interactive(), in: .circle)
            .overlay(
                Circle()
                    .stroke(.white.opacity(0.34), lineWidth: 1)
            )
            .scaleEffect(configuration.isPressed ? 0.96 : 1)
            .shadow(color: tint.opacity(0.22), radius: configuration.isPressed ? 8 : 14, x: 0, y: 10)
            .animation(.easeOut(duration: 0.16), value: configuration.isPressed)
    }
}

private struct AuriDockButton: View {
    let title: String
    let systemImage: String
    let tint: Color
    let highlighted: Bool
    let prefersLightText: Bool
    let action: () -> Void

    private var labelColor: Color {
        prefersLightText ? Color.white.opacity(0.96) : Color(red: 0.17, green: 0.21, blue: 0.25)
    }

    private var iconColor: Color {
        highlighted ? Color.white.opacity(0.98) : labelColor
    }

    var body: some View {
        Button(action: action) {
            VStack(spacing: 7) {
                ZStack {
                    Circle()
                        .fill(
                            LinearGradient(
                                colors: [
                                    highlighted ? tint.opacity(0.82) : .white.opacity(prefersLightText ? 0.18 : 0.34),
                                    highlighted ? tint.opacity(0.62) : .white.opacity(prefersLightText ? 0.08 : 0.18)
                                ],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )

                    Image(systemName: systemImage)
                        .font(.system(size: 16, weight: .bold))
                        .foregroundStyle(iconColor)
                }
                .frame(width: 42, height: 42)
                .overlay(
                    Circle()
                        .stroke(
                            highlighted ? tint.opacity(0.46) : .white.opacity(prefersLightText ? 0.18 : 0.22),
                            lineWidth: highlighted ? 1.4 : 1
                        )
                )

                VStack(spacing: 3) {
                    Text(title)
                        .font(.system(size: 11, weight: .bold, design: .rounded))
                        .foregroundStyle(labelColor)
                        .lineLimit(1)
                        .minimumScaleFactor(0.78)

                    Capsule(style: .continuous)
                        .fill(highlighted ? tint.opacity(0.96) : labelColor.opacity(prefersLightText ? 0.18 : 0.12))
                        .frame(width: highlighted ? 22 : 14, height: highlighted ? 4 : 3)
                }
            }
            .frame(width: 60, height: 72)
            .contentShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
        }
        .buttonStyle(.plain)
        .scaleEffect(highlighted ? 1.015 : 1)
    }
}

private struct AuriCareMenuOverlay: View {
    let store: AuriStore
    let menu: AuriCareMenuKind
    let isHiddenForDrag: Bool
    let startDrag: (AuriCareDragPayload, CGPoint) -> Void
    let updateDrag: (CGPoint) -> Void
    let endDrag: (CGPoint) -> Void

    private let columns = [
        GridItem(.flexible(), spacing: 12),
        GridItem(.flexible(), spacing: 12)
    ]

    private var menuItems: [AuriCareDragPayload] {
        AuriCareDragPayload.items(for: menu)
    }

    var body: some View {
        AuriGlassPanel(tint: menu.tint) {
            VStack(alignment: .leading, spacing: 14) {
                HStack(alignment: .top, spacing: 12) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(menu.title(for: store.displayName))
                            .font(.system(.headline, design: .rounded, weight: .bold))
                        Text(menu.instruction)
                            .font(.system(.caption, design: .rounded, weight: .semibold))
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }

                    Spacer(minLength: 0)

                    if menu == .medicine && !store.needsMedicine {
                        AuriChip(label: "No meds needed")
                    }
                }

                if menu == .food {
                    LazyVGrid(columns: columns, spacing: 10) {
                        ForEach(menuItems) { payload in
                            AuriCareMenuItem(
                                payload: payload,
                                layout: .compactRow,
                                startDrag: startDrag,
                                updateDrag: updateDrag,
                                endDrag: endDrag
                            )
                        }
                    }
                } else {
                    LazyVGrid(columns: columns, spacing: 12) {
                        ForEach(menuItems) { payload in
                            AuriCareMenuItem(
                                payload: payload,
                                startDrag: startDrag,
                                updateDrag: updateDrag,
                                endDrag: endDrag
                            )
                        }
                    }
                }
            }
        }
        .frame(maxWidth: 360)
        .opacity(isHiddenForDrag ? 0 : 1)
        .scaleEffect(isHiddenForDrag ? 0.96 : 1, anchor: .bottom)
        .animation(.easeOut(duration: 0.16), value: isHiddenForDrag)
    }
}

private struct AuriCareMenuItem: View {
    enum Layout {
        case card
        case compactRow
    }

    let payload: AuriCareDragPayload
    var layout: Layout = .card
    let startDrag: (AuriCareDragPayload, CGPoint) -> Void
    let updateDrag: (CGPoint) -> Void
    let endDrag: (CGPoint) -> Void

    @State private var hasStartedDrag = false
    @State private var dragTouchStartTime: Date?
    @State private var dragTouchStartLocation: CGPoint?
    @State private var dragCancelledForScroll = false
    @GestureState private var isPressed = false

    private let dragActivationDelay: TimeInterval = 0.18
    private let scrollIntentThreshold: CGFloat = 8

    private var cardDragGesture: some Gesture {
        LongPressGesture(minimumDuration: 0.18)
            .sequenced(before: DragGesture(minimumDistance: 0, coordinateSpace: .named(AuriRootCoordinateSpace.name)))
            .updating($isPressed) { value, state, _ in
                switch value {
                case .first(true), .second(true, _):
                    state = true
                default:
                    break
                }
            }
            .onChanged { value in
                switch value {
                case .second(true, let drag?):
                    if !hasStartedDrag {
                        hasStartedDrag = true
                        startDrag(payload, drag.startLocation)
                    }
                    updateDrag(drag.location)
                default:
                    break
                }
            }
            .onEnded { value in
                defer {
                    hasStartedDrag = false
                }

                switch value {
                case .second(true, let drag?):
                    endDrag(drag.location)
                default:
                    break
                }
            }
    }

    private var compactRowDragGesture: some Gesture {
        DragGesture(minimumDistance: 0, coordinateSpace: .named(AuriRootCoordinateSpace.name))
            .updating($isPressed) { _, state, _ in
                state = true
            }
            .onChanged { value in
                if dragTouchStartTime == nil {
                    dragTouchStartTime = value.time
                    dragTouchStartLocation = value.startLocation
                    dragCancelledForScroll = false
                }

                guard let touchStartTime = dragTouchStartTime else {
                    return
                }

                if dragCancelledForScroll {
                    return
                }

                let startLocation = dragTouchStartLocation ?? value.startLocation
                let deltaX = value.location.x - startLocation.x
                let deltaY = value.location.y - startLocation.y
                let elapsed = value.time.timeIntervalSince(touchStartTime)

                if !hasStartedDrag,
                   elapsed < dragActivationDelay,
                   abs(deltaY) > scrollIntentThreshold,
                   abs(deltaY) > abs(deltaX) {
                    dragCancelledForScroll = true
                    return
                }

                guard elapsed >= dragActivationDelay else {
                    return
                }

                if !hasStartedDrag {
                    hasStartedDrag = true
                    startDrag(payload, startLocation)
                }

                updateDrag(value.location)
            }
            .onEnded { value in
                defer {
                    hasStartedDrag = false
                    dragTouchStartTime = nil
                    dragTouchStartLocation = nil
                    dragCancelledForScroll = false
                }

                guard hasStartedDrag, !dragCancelledForScroll else {
                    return
                }

                endDrag(value.location)
            }
    }

    var body: some View {
        Group {
            if layout == .compactRow {
                styledContent
                    .simultaneousGesture(compactRowDragGesture)
            } else {
                styledContent
                    .gesture(cardDragGesture)
            }
        }
    }

    private var styledContent: some View {
        content
            .padding(.horizontal, layout == .compactRow ? 14 : 14)
            .padding(.vertical, layout == .compactRow ? 10 : 10)
            .background(
                RoundedRectangle(cornerRadius: 24, style: .continuous)
                    .fill(
                        LinearGradient(
                            colors: [
                                payload.tint.opacity(isPressed ? 0.98 : 0.90),
                                payload.tint.opacity(isPressed ? 0.84 : 0.74)
                            ],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
            )
            .overlay(
                RoundedRectangle(cornerRadius: 24, style: .continuous)
                    .stroke(.white.opacity(0.36), lineWidth: 1)
            )
            .shadow(color: payload.tint.opacity(isPressed ? 0.30 : 0.18), radius: isPressed ? 10 : 16, x: 0, y: 8)
            .scaleEffect(isPressed ? 0.98 : 1)
            .contentShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
            .animation(.easeOut(duration: 0.14), value: isPressed)
    }

    @ViewBuilder
    private var content: some View {
        switch layout {
        case .card:
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    AuriCarePixelIcon(payload: payload)
                        .frame(width: 54, height: 54)

                    Spacer(minLength: 0)
                }

                textBlock
            }
            .frame(maxWidth: .infinity, minHeight: 112, alignment: .topLeading)

        case .compactRow:
            HStack(alignment: .top, spacing: 10) {
                AuriCarePixelIcon(payload: payload)
                    .frame(width: 62, height: 62)
                    .contentShape(RoundedRectangle(cornerRadius: 18, style: .continuous))

                textBlock
            }
            .frame(maxWidth: .infinity, minHeight: 88, alignment: .leading)
        }
    }

    private var textBlock: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(payload.title)
                .font(.system(layout == .compactRow ? .footnote : .subheadline, design: .rounded, weight: .bold))
                .foregroundStyle(Color(red: 0.16, green: 0.21, blue: 0.24))
                .lineLimit(layout == .compactRow ? 2 : 1)
                .minimumScaleFactor(layout == .compactRow ? 0.9 : 1)
                .fixedSize(horizontal: false, vertical: true)

            Text(payload.subtitle)
                .font(.system(layout == .compactRow ? .caption2 : .caption, design: .rounded, weight: .semibold))
                .foregroundStyle(Color(red: 0.16, green: 0.21, blue: 0.24).opacity(0.72))
                .lineLimit(layout == .compactRow ? 2 : 2)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct AuriDraggedCareItem: View {
    let payload: AuriCareDragPayload
    let isHoveringAuri: Bool

    var body: some View {
        VStack(spacing: 8) {
            AuriCarePixelIcon(payload: payload)
                .frame(width: 66, height: 66)
                .padding(10)
                .background(
                    RoundedRectangle(cornerRadius: 24, style: .continuous)
                        .fill(.white.opacity(0.96))
                )

            Text(isHoveringAuri ? "Drop on Auri" : payload.title)
                .font(.system(.caption, design: .rounded, weight: .bold))
                .foregroundStyle(.white)
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(
                    Capsule(style: .continuous)
                        .fill(isHoveringAuri ? Color(red: 0.34, green: 0.75, blue: 0.50) : Color.black.opacity(0.72))
                )
        }
        .scaleEffect(isHoveringAuri ? 1.06 : 1)
        .shadow(color: .black.opacity(0.18), radius: 18, x: 0, y: 12)
        .animation(.spring(response: 0.2, dampingFraction: 0.86), value: isHoveringAuri)
    }
}

private struct AuriCarePixelIcon: View {
    let payload: AuriCareDragPayload

    private var referenceAssetName: String? {
        switch payload {
        case .food(.mealBowl):
            return "BurgerReference"
        case .food(.berryBits):
            return "ParfaitReference"
        case .food(.soupCup):
            return "RamenReference"
        case .food(.waterBottle):
            return "WaterBottleReference"
        case .food(.coffee):
            return "CoffeeReference"
        case .medicine(.capsule):
            return "PainkillersReference"
        case .medicine(.syrup):
            return "GingeraleReference"
        case .medicine(.coolPatch):
            return "CoughSyrupReference"
        }
    }

    private var sprite: AuriCarePixelSprite {
        switch payload {
        case .food(.mealBowl):
            return .mealBowl
        case .food(.berryBits):
            return .berryBits
        case .food(.soupCup):
            return .soupCup
        case .food(.waterBottle):
            return .waterBottle
        case .food(.coffee):
            return .coffee
        case .medicine(.capsule):
            return .capsule
        case .medicine(.syrup):
            return .syrupBottle
        case .medicine(.coolPatch):
            return .coolPatch
        }
    }

    var body: some View {
        GeometryReader { proxy in
            if let referenceAssetName {
                Image(referenceAssetName)
                    .resizable()
                    .interpolation(.high)
                    .scaledToFit()
                    .frame(width: proxy.size.width, height: proxy.size.height)
            } else {
                let columns = max(sprite.rows.map(\.count).max() ?? 1, 1)
                let rows = max(sprite.rows.count, 1)
                let pixel = max(
                    floor(
                        min(
                            proxy.size.width / CGFloat(columns),
                            proxy.size.height / CGFloat(rows)
                        )
                    ),
                    1
                )

                let iconWidth = CGFloat(columns) * pixel
                let iconHeight = CGFloat(rows) * pixel

                AuriPixelGridLayer(columns: columns, rows: rows, pixel: pixel) { column, row in
                    let cells = paddedCells(for: sprite.rows[row], columns: columns)
                    let symbol = cells[column]
                    return sprite.palette[symbol] ?? .clear
                }
                .frame(width: iconWidth, height: iconHeight)
                .position(x: proxy.size.width / 2, y: proxy.size.height / 2)
            }
        }
    }

    private func paddedCells(for row: String, columns: Int) -> [Character] {
        let deficit = max(columns - row.count, 0)
        let leading = deficit / 2
        let trailing = deficit - leading
        let padded = String(repeating: ".", count: leading) + row + String(repeating: ".", count: trailing)
        return Array(padded)
    }
}

private struct AuriCarePixelSprite {
    let rows: [String]
    let palette: [Character: Color]

    static let mealBowl = AuriCarePixelSprite(
        rows: [
            "...yyyy...",
            "..yooooy..",
            ".yooooooy.",
            "..bbbbbb..",
            ".brrrrrrb.",
            ".brrrrrrb.",
            "..bbbbbb.."
        ],
        palette: [
            ".": .clear,
            "y": Color(red: 0.97, green: 0.78, blue: 0.36),
            "o": Color(red: 0.72, green: 0.48, blue: 0.22),
            "b": Color(red: 0.52, green: 0.31, blue: 0.17),
            "r": Color(red: 0.76, green: 0.45, blue: 0.25)
        ]
    )

    static let berryBits = AuriCarePixelSprite(
        rows: [
            "...gg....",
            "..grrg...",
            ".grrrrg..",
            ".grrrrg..",
            "..grrrg..",
            "...gg...."
        ],
        palette: [
            ".": .clear,
            "g": Color(red: 0.36, green: 0.66, blue: 0.32),
            "r": Color(red: 0.92, green: 0.26, blue: 0.45)
        ]
    )

    static let soupCup = AuriCarePixelSprite(
        rows: [
            "...wwww...",
            "..wyyyyw..",
            ".wyyyyyyw.",
            "..bbbbbb..",
            ".brrrrrrb.",
            "..bbbbbb.."
        ],
        palette: [
            ".": .clear,
            "w": Color(red: 0.98, green: 0.97, blue: 0.92),
            "y": Color(red: 0.99, green: 0.78, blue: 0.38),
            "b": Color(red: 0.63, green: 0.42, blue: 0.24),
            "r": Color(red: 0.87, green: 0.49, blue: 0.27)
        ]
    )

    static let waterBottle = AuriCarePixelSprite(
        rows: [
            "....ww....",
            "...wccw...",
            "...wccw...",
            "...wccw...",
            "..wccccw..",
            "..wccccw..",
            "...wwww..."
        ],
        palette: [
            ".": .clear,
            "w": Color(red: 0.97, green: 0.99, blue: 1.00),
            "c": Color(red: 0.44, green: 0.78, blue: 0.98)
        ]
    )

    static let coffee = AuriCarePixelSprite(
        rows: [
            "....gg....",
            "...wccw...",
            "..wccccw..",
            "..wccccw..",
            "..wccccw..",
            "...wccw...",
            "....ww...."
        ],
        palette: [
            ".": .clear,
            "g": Color(red: 0.18, green: 0.62, blue: 0.30),
            "w": Color(red: 0.94, green: 0.93, blue: 0.90),
            "c": Color(red: 0.34, green: 0.19, blue: 0.10)
        ]
    )

    static let capsule = AuriCarePixelSprite(
        rows: [
            "...rrrr...",
            "..rrrrrr..",
            ".rrrwwrrr.",
            ".rrwwwwrr.",
            "..wwwwww..",
            "...wwww..."
        ],
        palette: [
            ".": .clear,
            "r": Color(red: 0.95, green: 0.45, blue: 0.39),
            "w": Color(red: 0.98, green: 0.98, blue: 0.95)
        ]
    )

    static let syrupBottle = AuriCarePixelSprite(
        rows: [
            "....ww....",
            "...wppw...",
            "...wppw...",
            "..wppppw..",
            "..wprrpw..",
            "..wprrpw..",
            "...wwww..."
        ],
        palette: [
            ".": .clear,
            "w": Color(red: 0.99, green: 0.97, blue: 0.93),
            "p": Color(red: 0.86, green: 0.44, blue: 0.56),
            "r": Color(red: 0.98, green: 0.64, blue: 0.28)
        ]
    )

    static let coolPatch = AuriCarePixelSprite(
        rows: [
            "...wwww...",
            "..wbbbbw..",
            ".wbbggbbw.",
            ".wbbggbbw.",
            "..wbbbbw..",
            "...wwww..."
        ],
        palette: [
            ".": .clear,
            "w": Color(red: 0.98, green: 0.98, blue: 0.95),
            "b": Color(red: 0.76, green: 0.86, blue: 0.92),
            "g": Color(red: 0.55, green: 0.80, blue: 0.70)
        ]
    )
}

private struct AuriStatCard: View {
    let title: String
    let value: Double
    let accent: Color
    let systemImage: String
    let detail: String?

    init(title: String, value: Double, accent: Color, systemImage: String, detail: String? = nil) {
        self.title = title
        self.value = value
        self.accent = accent
        self.systemImage = systemImage
        self.detail = detail
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label(title, systemImage: systemImage)
                .font(.system(.subheadline, design: .rounded, weight: .bold))

            GeometryReader { proxy in
                let width = max(10, proxy.size.width * max(0.04, min(value, 1)))
                ZStack(alignment: .leading) {
                    Capsule(style: .continuous)
                        .fill(.white.opacity(0.4))
                    Capsule(style: .continuous)
                        .fill(
                            LinearGradient(colors: [accent.opacity(0.85), accent], startPoint: .leading, endPoint: .trailing)
                        )
                        .frame(width: width)
                }
            }
            .frame(height: 12)

            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text("\(Int((max(0, min(value, 1)) * 100).rounded()))%")
                    .font(.system(.caption, design: .rounded, weight: .semibold))
                    .foregroundStyle(.secondary)

                Spacer(minLength: 0)

                if let detail, !detail.isEmpty {
                    Text(detail)
                        .font(.system(.caption, design: .rounded, weight: .bold))
                        .foregroundStyle(Color(red: 0.18, green: 0.23, blue: 0.27).opacity(0.78))
                        .multilineTextAlignment(.trailing)
                }
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .fill(.white.opacity(0.38))
        )
    }
}

private struct AuriActionButton: View {
    let title: String
    let subtitle: String
    let symbol: String
    let tint: Color
    let enabled: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 8) {
                Image(systemName: symbol)
                    .font(.system(size: 22, weight: .bold))
                    .foregroundStyle(Color(red: 0.16, green: 0.21, blue: 0.24))
                Text(title)
                    .font(.system(.headline, design: .rounded, weight: .bold))
                    .foregroundStyle(Color(red: 0.16, green: 0.21, blue: 0.24))
                    .lineLimit(1)
                    .minimumScaleFactor(0.92)
                Text(subtitle)
                    .font(.system(.caption, design: .rounded, weight: .semibold))
                    .foregroundStyle(Color(red: 0.16, green: 0.21, blue: 0.24).opacity(0.74))
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, minHeight: 110, alignment: .topLeading)
        }
        .buttonStyle(AuriActionButtonStyle(tint: tint))
        .disabled(!enabled)
        .opacity(enabled ? 1 : 0.55)
    }
}

private struct AuriActionButtonStyle: ButtonStyle {
    let tint: Color

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .padding(.horizontal, 18)
            .padding(.vertical, 16)
            .background(
                RoundedRectangle(cornerRadius: 24, style: .continuous)
                    .fill(
                        LinearGradient(
                            colors: [
                                tint.opacity(configuration.isPressed ? 0.86 : 0.96),
                                tint.opacity(configuration.isPressed ? 0.70 : 0.82)
                            ],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
            )
            .overlay(
                RoundedRectangle(cornerRadius: 24, style: .continuous)
                    .stroke(.white.opacity(0.34), lineWidth: 1)
            )
            .overlay(alignment: .topLeading) {
                RoundedRectangle(cornerRadius: 24, style: .continuous)
                    .fill(
                        LinearGradient(
                            colors: [.white.opacity(0.28), .white.opacity(0.02)],
                            startPoint: .topLeading,
                            endPoint: .bottom
                        )
                    )
                    .padding(1)
            }
            .shadow(color: tint.opacity(0.22), radius: configuration.isPressed ? 8 : 14, x: 0, y: configuration.isPressed ? 4 : 10)
            .scaleEffect(configuration.isPressed ? 0.985 : 1)
            .animation(.easeOut(duration: 0.16), value: configuration.isPressed)
    }
}

private struct AuriChatTranscript: View {
    let lines: [AuriChatLine]
    let isTyping: Bool
    let bubbleMaxWidth: CGFloat
    let oppositeInset: CGFloat
    private let bottomAnchorID = "auri-chat-bottom-anchor"

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView(.vertical, showsIndicators: false) {
                LazyVStack(spacing: 12) {
                    Spacer(minLength: 104)

                    if lines.isEmpty {
                        emptyBubble
                    } else {
                        ForEach(lines) { line in
                            HStack(alignment: .bottom) {
                                if line.role == .auri {
                                    bubble(
                                        text: line.text,
                                        tint: Color(red: 0.98, green: 0.95, blue: 0.88),
                                        textColor: Color(red: 0.16, green: 0.21, blue: 0.24)
                                    )
                                    Spacer(minLength: oppositeInset)
                                } else {
                                    Spacer(minLength: oppositeInset)
                                    bubble(
                                        text: line.text,
                                        tint: Color(red: 0.78, green: 0.90, blue: 0.99),
                                        textColor: Color(red: 0.13, green: 0.20, blue: 0.27)
                                    )
                                }
                            }
                        }
                    }

                    if isTyping {
                        HStack(alignment: .bottom) {
                            AuriTypingBubble()
                            Spacer(minLength: oppositeInset)
                        }
                        .transition(.opacity.combined(with: .scale(scale: 0.96, anchor: .leading)))
                    }

                    Color.clear
                        .frame(height: 1)
                        .id(bottomAnchorID)
                }
            }
            .defaultScrollAnchor(.bottom)
            .scrollDismissesKeyboard(.interactively)
            .onAppear {
                scrollToBottom(using: proxy, animated: false)
            }
            .onChange(of: lines.count) { _, _ in
                scrollToBottom(using: proxy, animated: true)
            }
            .onChange(of: isTyping) { _, _ in
                scrollToBottom(using: proxy, animated: true)
            }
        }
    }

    private var emptyBubble: some View {
        bubble(
            text: "Say hi to Auri.",
            tint: Color.white.opacity(0.94),
            textColor: Color(red: 0.16, green: 0.21, blue: 0.24)
        )
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func bubble(text: String, tint: Color, textColor: Color) -> some View {
        GlassEffectContainer(spacing: 0) {
            Text(text)
                .font(.system(.subheadline, design: .rounded, weight: .medium))
                .foregroundStyle(textColor)
                .multilineTextAlignment(.leading)
                .padding(.horizontal, 15)
                .padding(.vertical, 12)
                .frame(maxWidth: bubbleMaxWidth, alignment: .leading)
        }
        .glassEffect(.regular.tint(tint.opacity(0.22)), in: .rect(cornerRadius: 22))
        .overlay(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .stroke(.white.opacity(0.28), lineWidth: 1)
        )
    }

    private func scrollToBottom(using proxy: ScrollViewProxy, animated: Bool) {
        let action = {
            proxy.scrollTo(bottomAnchorID, anchor: .bottom)
        }

        if animated {
            withAnimation(.easeOut(duration: 0.22)) {
                action()
            }
        } else {
            action()
        }
    }
}

private struct AuriTypingBubble: View {
    var body: some View {
        GlassEffectContainer(spacing: 0) {
            TimelineView(.animation(minimumInterval: 1.0 / 18.0)) { timeline in
                let time = timeline.date.timeIntervalSinceReferenceDate

                HStack(spacing: 7) {
                    ForEach(0..<3, id: \.self) { index in
                        let phase = time * 2.8 - (Double(index) * 0.18)
                        let lift = max(0, sin(phase)) * 4
                        let glow = 0.42 + (max(0, sin(phase)) * 0.46)

                        Circle()
                            .fill(Color(red: 0.28, green: 0.33, blue: 0.40).opacity(glow))
                            .frame(width: 8, height: 8)
                            .offset(y: -lift)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 15)
            }
        }
        .glassEffect(
            .regular.tint(Color(red: 0.98, green: 0.95, blue: 0.88).opacity(0.22)),
            in: .rect(cornerRadius: 22)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .stroke(.white.opacity(0.28), lineWidth: 1)
        )
    }
}

private struct AuriInteractiveCreatureStage: View {
    @Bindable var store: AuriStore
    let dropHighlight: Bool
    var vrmPresentationMode: AuriVRMPresentationMode = .room
    var prefersChatRevealLayout = false

    @State private var stageDate = Date()

    private var shouldAnimateStageClock: Bool {
        store.hasRenderableTimedEffect
    }

    var body: some View {
        AuriCreatureStage(
            store: store,
            date: stageDate,
            dropHighlight: dropHighlight,
            isPaused: false,
            vrmPresentationMode: vrmPresentationMode,
            prefersChatRevealLayout: prefersChatRevealLayout
        )
        .onAppear {
            stageDate = Date()
        }
        .onChange(of: shouldAnimateStageClock) { _, isAnimating in
            if !isAnimating {
                stageDate = Date()
            }
        }
        .task(id: shouldAnimateStageClock) {
            guard shouldAnimateStageClock else {
                stageDate = Date()
                return
            }

            while !Task.isCancelled && store.hasRenderableTimedEffect {
                stageDate = Date()
                try? await Task.sleep(for: .milliseconds(33))
            }

            stageDate = Date()
        }
    }
}

private struct AuriCreatureStage: View {
    @Bindable var store: AuriStore
    let date: Date
    let dropHighlight: Bool
    var isPaused = false
    var vrmPresentationMode: AuriVRMPresentationMode = .room
    var prefersChatRevealLayout = false

    var body: some View {
        GeometryReader { proxy in
            let scene = AuriStageSceneLayout(size: proxy.size)
            let effect = store.activeEffect(at: date)
            let time = date.timeIntervalSinceReferenceDate
            let usesVRMStageAvatar = AuriVRMBundleResources.isAvailable
            let canStageMove = store.isAlive && !store.isSleeping && store.health >= 0.30 && !usesVRMStageAvatar
            let activeAvatarRelativePath = vrmPresentationMode == .onboarding
                ? store.selectedBaseAvatarRelativePath
                : store.selectedAvatarRelativePath
            let auriFrameSize = usesVRMStageAvatar
                ? proxy.size
                : CGSize(width: 246, height: 246)
            let chatRevealWidth = min(max(proxy.size.width * 0.24, 88), 132)
            let vrmStageHorizontalOffset: CGFloat = (usesVRMStageAvatar && prefersChatRevealLayout)
                ? -(chatRevealWidth + 30)
                : 0
            let vrmStageChatVerticalOffset: CGFloat = (usesVRMStageAvatar && prefersChatRevealLayout) ? -52 : 0
            let vrmFramingYOffset = (usesVRMStageAvatar && prefersChatRevealLayout) ? 0.03 : 0.0
            let stageCenterX = scene.center.x + vrmStageHorizontalOffset
            let glow = store.lightsOff ? 0.06 : 0.14 + (store.isAlive ? ((sin(time * 1.4) + 1) * 0.03) : 0.02)
            let walkRange = scene.walkLeftBound...scene.walkRightBound
            let motion = motionSnapshot(
                at: time,
                in: walkRange,
                canMove: canStageMove
            )
            let wanderX = usesVRMStageAvatar ? 0 : motion.positionX
            let stepLift = canStageMove && !usesVRMStageAvatar
                ? abs(sin(time * motion.stepCadence)) * (5 + (motion.stepIntensity * 2.2))
                : 0
            let vrmStageVerticalOffset: CGFloat = usesVRMStageAvatar ? -72 : 0
            let effectOffset = effectAuriOffset(effect, time: time)
            let auriPoint = CGPoint(
                x: stageCenterX + wanderX + effectOffset.width,
                y: scene.auriCenterY + vrmStageVerticalOffset + vrmStageChatVerticalOffset - stepLift + effectOffset.height
            )
            let visualAuriPoint = usesVRMStageAvatar
                ? CGPoint(x: stageCenterX, y: scene.center.y + vrmStageChatVerticalOffset)
                : auriPoint
            let dropTargetPoint = usesVRMStageAvatar
                ? CGPoint(x: auriPoint.x, y: auriPoint.y + 18)
                : auriPoint
            let dropTargetSize = usesVRMStageAvatar
                ? CGSize(width: min(proxy.size.width * 0.46, 220), height: min(proxy.size.height * 0.56, 280))
                : auriFrameSize
            let groundedAuriOffset = CGSize(
                width: auriPoint.x - scene.center.x,
                height: auriPoint.y - scene.center.y
            )
            let shadowWidth: CGFloat = {
                if !store.isAlive && usesVRMStageAvatar {
                    return 178
                }
                return 102
            }()
            let shadowHeight: CGFloat = {
                if !store.isAlive && usesVRMStageAvatar {
                    return 28
                }
                return 20
            }()
            let shadowBlur: CGFloat = (!store.isAlive && usesVRMStageAvatar) ? 8 : 5
            let shadowY: CGFloat = {
                if !store.isAlive && usesVRMStageAvatar {
                    return scene.auriShadowY + 12
                }
                return scene.auriShadowY
            }()

            ZStack {
                Ellipse()
                    .fill(
                        LinearGradient(
                            colors: [
                                Color(red: 0.79, green: 0.90, blue: 0.79).opacity(store.lightsOff ? 0.10 : 0.28),
                                Color(red: 0.54, green: 0.76, blue: 0.63).opacity(store.lightsOff ? 0.06 : 0.20)
                            ],
                            startPoint: .top,
                            endPoint: .bottom
                        )
                    )
                    .frame(width: min(proxy.size.width * 0.90, 380), height: 132)
                    .blur(radius: 9)
                    .position(x: stageCenterX, y: scene.platformCenterY + 18)

                Ellipse()
                    .fill(Color.white.opacity(glow))
                    .frame(width: 232, height: 156)
                    .blur(radius: 34)
                    .position(x: visualAuriPoint.x, y: scene.platformTopY - 30)

                if !usesVRMStageAvatar {
                    Ellipse()
                        .fill(Color.black.opacity(store.lightsOff ? 0.22 : 0.12))
                        .frame(width: shadowWidth, height: shadowHeight)
                        .blur(radius: shadowBlur)
                        .position(x: visualAuriPoint.x, y: shadowY)
                }

                if dropHighlight {
                    RoundedRectangle(cornerRadius: 40, style: .continuous)
                        .fill(Color(red: 0.35, green: 0.77, blue: 0.52).opacity(0.12))
                        .overlay(
                            RoundedRectangle(cornerRadius: 40, style: .continuous)
                                .stroke(Color(red: 0.35, green: 0.77, blue: 0.52).opacity(0.92), lineWidth: 4)
                        )
                        .frame(width: 178, height: 178)
                        .position(dropTargetPoint)
                        .shadow(color: Color(red: 0.35, green: 0.77, blue: 0.52).opacity(0.18), radius: 18, x: 0, y: 0)
                }

                AuriPixelAuri(
                    stage: store.stage,
                    mood: store.mood,
                    hasHatched: store.hasHatched,
                    incubationProgress: store.eggIncubationProgress,
                    gaze: motion.gaze,
                    animationTime: time,
                    isSleeping: store.isSleeping,
                    lightsOff: store.lightsOff,
                    wantsAttention: store.attention < 0.30,
                    wantsSleep: store.wantsSleep,
                    needsMedicine: store.needsMedicine,
                    tired: store.tiredValue,
                    isPaused: isPaused,
                    avatarModelURL: AuriVRMBundleResources.assetURL(for: activeAvatarRelativePath)?.absoluteString
                        ?? "auri-avatar://viewer/auri-avatar.vrm",
                    displayMode: .stageAvatar,
                    vrmPresentationMode: vrmPresentationMode,
                    vrmFramingYOffset: vrmFramingYOffset
                )
                    .opacity(1)
                    .frame(width: auriFrameSize.width, height: auriFrameSize.height)
                    .scaleEffect(store.isAlive ? (store.isSleeping ? 0.98 : 1) : 0.94)
                    .position(visualAuriPoint)
                    .shadow(
                        color: usesVRMStageAvatar ? .clear : .black.opacity(0.12),
                        radius: usesVRMStageAvatar ? 0 : 18,
                        x: 0,
                        y: usesVRMStageAvatar ? 0 : 12
                    )

                Color.clear
                    .frame(width: dropTargetSize.width, height: dropTargetSize.height)
                    .background {
                        GeometryReader { geometry in
                            Color.clear.preference(
                                key: AuriAffectionZoneFramePreferenceKey.self,
                                value: geometry.frame(in: .named(AuriRootCoordinateSpace.name))
                            )
                        }
                    }
                    .position(dropTargetPoint)

                AuriAmbientStateOverlay(
                    store: store,
                    auriOffset: groundedAuriOffset,
                    date: date
                )
                    .allowsHitTesting(false)

                AuriActionOverlay(effect: effect, auriOffset: groundedAuriOffset)
                    .allowsHitTesting(false)
            }
            .frame(width: proxy.size.width, height: proxy.size.height)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func effectAuriOffset(_ effect: AuriEffectSnapshot?, time: Double) -> CGSize {
        guard let effect else {
            return .zero
        }

        switch effect.kind {
        case .feed:
            return CGSize(width: 0, height: sin(effect.progress * .pi * 3) * 4)
        case .water:
            return CGSize(width: 0, height: -sin(effect.progress * .pi) * 6)
        case .play:
            return CGSize(width: sin(time * 9) * 4, height: -abs(sin(effect.progress * .pi)) * 12)
        case .affection:
            return CGSize(width: sin(time * 10) * 1.6, height: -sin(effect.progress * .pi) * 3)
        case .treat:
            return CGSize(width: 0, height: -sin(effect.progress * .pi) * 8)
        case .lights:
            return CGSize(width: 0, height: 0)
        case .sleep:
            return CGSize(width: 0, height: 1.5)
        case .clean:
            return CGSize(width: 0, height: -2)
        case .medicine:
            return CGSize(width: 0, height: -4)
        case .attention:
            return CGSize(width: sin(time * 8) * 2, height: 0)
        case .discipline:
            return CGSize(width: sin(time * 14) * 2.5, height: 0)
        case .message:
            return CGSize(width: sin(time * 12) * 2.5, height: 0)
        case .hatch:
            return CGSize(width: sin(time * 18) * 3, height: 0)
        }
    }

    private func restingPosition(in range: ClosedRange<CGFloat>) -> CGFloat {
        if range.contains(0) {
            return 0
        }

        return (range.lowerBound + range.upperBound) / 2
    }

    private func motionSnapshot(
        at time: Double,
        in range: ClosedRange<CGFloat>,
        canMove: Bool
    ) -> AuriStageMotionSnapshot {
        guard canMove else {
            return AuriStageMotionSnapshot(
                positionX: restingPosition(in: range),
                stepIntensity: 0,
                stepCadence: 6,
                gaze: idleGaze(at: time)
            )
        }

        let segmentDuration = 3.6
        let segmentTime = time / segmentDuration
        let segment = Int(floor(segmentTime))
        let progress = segmentTime - floor(segmentTime)
        let holdProgress = 0.16 + (sampleUnit(for: segment, salt: 0.91) * 0.22)
        let travelProgress = max(0, min(1, (progress - holdProgress) / max(0.18, 1 - holdProgress)))
        let eased = travelProgress * travelProgress * (3 - (2 * travelProgress))
        let start = sampledWalkPosition(for: segment, in: range)
        let end = sampledWalkPosition(for: segment + 1, in: range)
        let position = start + ((end - start) * CGFloat(eased))
        let travelDistance = abs(end - start)
        let availableWidth = max(range.upperBound - range.lowerBound, 1)
        let stepIntensity = travelProgress > 0 && travelProgress < 1
            ? min(1, travelDistance / availableWidth * 2.8)
            : 0
        let stepCadence = 5.6 + (sampleUnit(for: segment, salt: 0.47) * 2.6)

        let gaze: AuriEyeDirection
        if travelDistance < 10 || stepIntensity < 0.12 {
            gaze = idleGaze(at: time)
        } else if end > start {
            gaze = sampleUnit(for: segment, salt: 0.37) > 0.82 ? .center : .right
        } else {
            gaze = sampleUnit(for: segment, salt: 0.37) > 0.82 ? .center : .left
        }

        return AuriStageMotionSnapshot(
            positionX: position,
            stepIntensity: stepIntensity,
            stepCadence: stepCadence,
            gaze: gaze
        )
    }

    private func sampledWalkPosition(for segment: Int, in range: ClosedRange<CGFloat>) -> CGFloat {
        let seed = sampleUnit(for: segment, salt: 0.19)
        let edgeBias = sampleUnit(for: segment, salt: 0.63)
        let normalized: Double

        if edgeBias < 0.24 {
            normalized = seed < 0.5 ? 0.16 : 0.84
        } else if edgeBias > 0.86 {
            normalized = 0.36 + (seed * 0.28)
        } else {
            normalized = 0.10 + (seed * 0.80)
        }

        return range.lowerBound + ((range.upperBound - range.lowerBound) * CGFloat(normalized))
    }

    private func sampleUnit(for segment: Int, salt: Double) -> Double {
        let raw = sin((Double(segment + 1) * (12.9898 + (salt * 3.71))) + (salt * 78.233)) * 43758.5453
        return raw - floor(raw)
    }

    private func idleGaze(at time: Double) -> AuriEyeDirection {
        let glanceSlot = Int(floor(time / 2.2))
        let selector = sampleUnit(for: glanceSlot, salt: 0.73)

        if selector < 0.30 {
            return .left
        }
        if selector > 0.70 {
            return .right
        }
        return .center
    }
}

private struct AuriStageSceneLayout {
    let size: CGSize

    var center: CGPoint {
        CGPoint(x: size.width / 2, y: size.height / 2)
    }

    var platformWidth: CGFloat {
        min(size.width * 0.76, 338)
    }

    var platformHeight: CGFloat {
        24
    }

    var platformCenterY: CGFloat {
        size.height * 0.72
    }

    var platformTopY: CGFloat {
        platformCenterY - (platformHeight / 2)
    }

    var auriCenterY: CGFloat {
        platformTopY - auriGroundClearance + auriGroundingAdjustment
    }

    var auriShadowY: CGFloat {
        platformTopY + 10
    }

    var walkLeftBound: CGFloat {
        -(platformWidth * 0.31)
    }

    var walkRightBound: CGFloat {
        platformWidth * 0.31
    }

    private var auriGroundClearance: CGFloat {
        min(max(size.height * 0.17, 66), 80)
    }

    private var auriGroundingAdjustment: CGFloat {
        40
    }
}

private struct AuriStageMotionSnapshot {
    let positionX: CGFloat
    let stepIntensity: Double
    let stepCadence: Double
    let gaze: AuriEyeDirection
}

private enum AuriEyeDirection {
    case left
    case center
    case right
}

private struct AuriStagePlatform: View {
    let width: CGFloat
    let lightsOff: Bool

    var body: some View {
        ZStack {
            Ellipse()
                .fill(Color.black.opacity(lightsOff ? 0.20 : 0.11))
                .frame(width: width * 0.82, height: 30)
                .blur(radius: 8)
                .offset(y: 12)

            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(
                    LinearGradient(
                        colors: [
                            Color(red: 0.95, green: 0.96, blue: 0.98).opacity(lightsOff ? 0.46 : 0.82),
                            Color(red: 0.80, green: 0.82, blue: 0.87).opacity(lightsOff ? 0.34 : 0.72)
                        ],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                )
                .frame(width: width, height: 24)
                .overlay(alignment: .top) {
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .fill(Color.white.opacity(lightsOff ? 0.14 : 0.34))
                        .frame(width: width * 0.88, height: 4)
                        .offset(y: 2)
                }
                .shadow(color: .black.opacity(lightsOff ? 0.12 : 0.08), radius: 8, x: 0, y: 6)
        }
        .frame(width: width, height: 60)
    }
}

private struct AuriAmbientStateOverlay: View {
    @Bindable var store: AuriStore
    let auriOffset: CGSize
    let date: Date

    var body: some View {
        GeometryReader { proxy in
            let time = date.timeIntervalSinceReferenceDate

            ZStack {
                if store.isAlive && store.isSleeping {
                    ForEach(0..<3, id: \.self) { index in
                        let phase = ((time * 0.55) + (Double(index) * 0.28)).truncatingRemainder(dividingBy: 1)
                        let lift = CGFloat(phase * 28)
                        let drift = CGFloat(phase * 10)
                        let opacity = 0.22 + (sin(phase * .pi) * 0.70)

                        Text(index == 2 ? "Z" : "z")
                            .font(.system(size: 20 + CGFloat(index * 2), weight: .bold, design: .rounded))
                            .foregroundStyle(.white.opacity(opacity))
                            .scaleEffect(0.88 + (phase * 0.34))
                            .offset(
                                x: auriOffset.width + 42 + CGFloat(index * 18) + drift,
                                y: auriOffset.height - 66 - CGFloat(index * 10) - lift
                            )
                    }
                }

                if store.needsCleaning {
                    let grimeOpacity = 0.08 + (Double(store.dirtyLevel) * 0.04)

                    ForEach(0..<6, id: \.self) { index in
                        let xOffsets: [CGFloat] = [-30, 18, -18, 34, 6, -4]
                        let yOffsets: [CGFloat] = [-8, 16, 34, -26, 52, -42]
                        let size: CGFloat = 10 + CGFloat((index % 3) * 4)

                        Circle()
                            .fill(Color(red: 0.70, green: 0.66, blue: 0.58).opacity(grimeOpacity))
                            .frame(width: size, height: size)
                            .blur(radius: 1.5)
                            .offset(
                                x: auriOffset.width + xOffsets[index],
                                y: auriOffset.height + yOffsets[index]
                            )
                    }
                }

                if store.needsMedicine && store.isAlive {
                    Image(systemName: "cross.case.fill")
                        .font(.system(size: 18, weight: .bold))
                        .foregroundStyle(Color(red: 0.98, green: 0.38, blue: 0.34))
                        .padding(10)
                        .background(
                            Circle()
                                .fill(.white.opacity(0.75))
                        )
                        .offset(x: auriOffset.width - 84, y: auriOffset.height - 88)
                }
            }
            .frame(width: proxy.size.width, height: proxy.size.height)
        }
    }
}

private struct AuriActionOverlay: View {
    let effect: AuriEffectSnapshot?
    let auriOffset: CGSize

    var body: some View {
        GeometryReader { proxy in
            if let effect {
                switch effect.kind {
                case .feed:
                    FeedOverlay(
                        progress: effect.progress,
                        foodItem: effect.foodItem,
                        size: proxy.size,
                        auriOffset: auriOffset
                    )
                case .water:
                    WaterOverlay(progress: effect.progress, size: proxy.size, auriOffset: auriOffset)
                case .play:
                    PlayOverlay(progress: effect.progress, size: proxy.size, auriOffset: auriOffset)
                case .affection:
                    AffectionOverlay(progress: effect.progress, size: proxy.size, auriOffset: auriOffset)
                case .treat:
                    TreatOverlay(
                        progress: effect.progress,
                        foodItem: effect.foodItem,
                        size: proxy.size,
                        auriOffset: auriOffset
                    )
                case .lights:
                    LightsOverlay(progress: effect.progress, size: proxy.size)
                case .sleep:
                    SleepOverlay(progress: effect.progress, size: proxy.size, auriOffset: auriOffset)
                case .clean:
                    CleanOverlay(progress: effect.progress, size: proxy.size, auriOffset: auriOffset)
                case .medicine:
                    MedicineOverlay(
                        progress: effect.progress,
                        medicineItem: effect.medicineItem,
                        size: proxy.size,
                        auriOffset: auriOffset
                    )
                case .attention:
                    AttentionOverlay(progress: effect.progress, size: proxy.size, auriOffset: auriOffset)
                case .discipline:
                    DisciplineOverlay(progress: effect.progress, size: proxy.size, auriOffset: auriOffset)
                case .message:
                    MessageOverlay(progress: effect.progress, size: proxy.size, auriOffset: auriOffset)
                case .hatch:
                    HatchOverlay(progress: effect.progress, size: proxy.size, auriOffset: auriOffset)
                }
            }
        }
    }
}

private struct FeedOverlay: View {
    let progress: Double
    let foodItem: AuriFoodItem?
    let size: CGSize
    let auriOffset: CGSize

    var body: some View {
        Group {
            if foodItem == .mealBowl {
                BurgerFeedOverlay(progress: progress, size: size, auriOffset: auriOffset)
            } else if foodItem == .soupCup {
                RamenFeedOverlay(progress: progress, size: size, auriOffset: auriOffset)
            } else if foodItem == .coffee {
                CoffeeFeedOverlay(progress: progress, size: size, auriOffset: auriOffset)
            } else {
                BowlFeedOverlay(progress: progress, size: size, auriOffset: auriOffset)
            }
        }
    }
}

private struct BowlFeedOverlay: View {
    let progress: Double
    let size: CGSize
    let auriOffset: CGSize

    var body: some View {
        ZStack {
            BowlShape()
                .stroke(Color(red: 0.59, green: 0.41, blue: 0.24), lineWidth: 4)
                .frame(width: 88, height: 34)
                .offset(x: 0, y: 82)

            ForEach(0..<5, id: \.self) { index in
                Circle()
                    .fill(Color(red: 0.95, green: 0.67, blue: 0.33))
                    .frame(width: 10, height: 10)
                    .offset(
                        x: CGFloat(index - 2) * 18,
                        y: CGFloat(-80 + (progress * 150) + Double(index * 4))
                    )
                    .opacity(1 - progress)
            }
        }
        .offset(x: auriOffset.width, y: auriOffset.height)
        .frame(width: size.width, height: size.height)
    }
}

private struct BurgerFeedOverlay: View {
    let progress: Double
    let size: CGSize
    let auriOffset: CGSize

    var body: some View {
        let flightProgress = min(progress / 0.6, 1)
        let easedFlight = eased(flightProgress)
        let settleProgress = max(0, min(1, (progress - 0.36) / 0.48))
        let biteBurst = max(0, 1 - abs(progress - 0.58) * 7.2)
        let burgerX = CGFloat(-108 + (easedFlight * 118))
        let burgerArcLift = sin(flightProgress * .pi) * 46
        let burgerY = CGFloat(88 - (easedFlight * 104) - burgerArcLift)
        let chewJitter = CGFloat(sin(progress * .pi * 18) * biteBurst * 1.8)
        let burgerScale = CGFloat(0.78 + (easedFlight * 0.40) - (settleProgress * 0.18))
        let burgerOpacity = progress > 0.92 ? max(0, 1 - ((progress - 0.92) / 0.08)) : 1
        let glowSize = CGFloat(34 + (biteBurst * 30))

        ZStack {
            Circle()
                .fill(Color(red: 1.00, green: 0.88, blue: 0.46).opacity(biteBurst * 0.32))
                .frame(width: glowSize, height: glowSize)
                .blur(radius: 14)
                .offset(x: 34, y: -12)

            Image("BurgerReference")
                .resizable()
                .interpolation(.high)
                .scaledToFit()
                .frame(width: 94, height: 94)
                .scaleEffect(burgerScale)
                .rotationEffect(.degrees(-16 + (easedFlight * 22) - (settleProgress * 8)))
                .offset(x: burgerX + chewJitter, y: burgerY)
                .shadow(color: .black.opacity(0.16), radius: 10, x: 0, y: 8)
                .opacity(burgerOpacity)

            ForEach(0..<5, id: \.self) { index in
                let spread = Double(index) - 2

                Circle()
                    .fill(index.isMultiple(of: 2) ? Color(red: 1.00, green: 0.88, blue: 0.46) : Color(red: 0.96, green: 0.40, blue: 0.24))
                    .frame(width: 8 - CGFloat(index), height: 8 - CGFloat(index))
                    .offset(
                        x: CGFloat(32 + (spread * 14)),
                        y: CGFloat(-12 - (biteBurst * 18) + (abs(spread) * 4))
                    )
                    .opacity(biteBurst * (0.95 - (Double(index) * 0.12)))
            }
        }
        .offset(x: auriOffset.width, y: auriOffset.height + 6)
        .frame(width: size.width, height: size.height)
    }

    private func eased(_ value: Double) -> Double {
        value * value * (3 - (2 * value))
    }
}

private struct RamenFeedOverlay: View {
    let progress: Double
    let size: CGSize
    let auriOffset: CGSize

    var body: some View {
        let flightProgress = min(progress / 0.64, 1)
        let easedFlight = eased(flightProgress)
        let settleProgress = max(0, min(1, (progress - 0.42) / 0.42))
        let steamBurst = max(0, 1 - abs(progress - 0.48) * 4.4)
        let cupX = CGFloat(-112 + (easedFlight * 122))
        let cupArcLift = sin(flightProgress * .pi) * 36
        let cupY = CGFloat(90 - (easedFlight * 112) - cupArcLift)
        let cupScale = CGFloat(0.74 + (easedFlight * 0.30) - (settleProgress * 0.10))
        let cupOpacity = progress > 0.94 ? max(0, 1 - ((progress - 0.94) / 0.06)) : 1
        let glowSize = CGFloat(44 + (steamBurst * 22))

        ZStack {
            Circle()
                .fill(Color(red: 1.00, green: 0.84, blue: 0.48).opacity(steamBurst * 0.20))
                .frame(width: glowSize, height: glowSize)
                .blur(radius: 16)
                .offset(x: 28, y: -44)

            Image("RamenReference")
                .resizable()
                .interpolation(.high)
                .scaledToFit()
                .frame(width: 108, height: 108)
                .scaleEffect(cupScale)
                .rotationEffect(.degrees(-14 + (easedFlight * 20) - (settleProgress * 6)))
                .offset(x: cupX, y: cupY)
                .shadow(color: .black.opacity(0.16), radius: 10, x: 0, y: 8)
                .opacity(cupOpacity)

            ForEach(0..<4, id: \.self) { index in
                Capsule()
                    .fill(Color.white.opacity(0.16 + (Double(index) * 0.06)))
                    .frame(width: 18 - CGFloat(index * 2), height: 8 - CGFloat(index))
                    .blur(radius: 6)
                    .offset(
                        x: CGFloat(20 + (index * 8)),
                        y: CGFloat(-58 - (steamBurst * 16) - Double(index * 8))
                    )
                    .opacity(steamBurst * (0.86 - (Double(index) * 0.12)))
            }
        }
        .offset(x: auriOffset.width, y: auriOffset.height + 4)
        .frame(width: size.width, height: size.height)
    }

    private func eased(_ value: Double) -> Double {
        value * value * (3 - (2 * value))
    }
}

private struct CoffeeFeedOverlay: View {
    let progress: Double
    let size: CGSize
    let auriOffset: CGSize

    var body: some View {
        let flightProgress = min(progress / 0.62, 1)
        let easedFlight = eased(flightProgress)
        let settleProgress = max(0, min(1, (progress - 0.40) / 0.38))
        let caffeineBurst = max(0, 1 - abs(progress - 0.52) * 4.8)
        let coffeeX = CGFloat(-106 + (easedFlight * 116))
        let coffeeArcLift = sin(flightProgress * .pi) * 34
        let coffeeY = CGFloat(92 - (easedFlight * 110) - coffeeArcLift)
        let coffeeScale = CGFloat(0.70 + (easedFlight * 0.28) - (settleProgress * 0.08))
        let coffeeOpacity = progress > 0.94 ? max(0, 1 - ((progress - 0.94) / 0.06)) : 1

        ZStack {
            Circle()
                .fill(Color(red: 0.40, green: 0.26, blue: 0.14).opacity(caffeineBurst * 0.20))
                .frame(width: 56 + (caffeineBurst * 18), height: 56 + (caffeineBurst * 18))
                .blur(radius: 18)
                .offset(x: 22, y: -24)

            Image("CoffeeReference")
                .resizable()
                .interpolation(.high)
                .scaledToFit()
                .frame(width: 108, height: 108)
                .scaleEffect(coffeeScale)
                .rotationEffect(.degrees(-12 + (easedFlight * 18) - (settleProgress * 5)))
                .offset(x: coffeeX, y: coffeeY)
                .shadow(color: .black.opacity(0.18), radius: 12, x: 0, y: 10)
                .opacity(coffeeOpacity)

            ForEach(0..<4, id: \.self) { index in
                Capsule()
                    .fill(Color.white.opacity(0.18 + (Double(index) * 0.06)))
                    .frame(width: 16 - CGFloat(index * 2), height: 7 - CGFloat(index))
                    .blur(radius: 5)
                    .offset(
                        x: CGFloat(18 + (index * 7)),
                        y: CGFloat(-54 - (caffeineBurst * 12) - Double(index * 8))
                    )
                    .opacity(caffeineBurst * (0.84 - (Double(index) * 0.12)))
            }
        }
        .offset(x: auriOffset.width, y: auriOffset.height + 4)
        .frame(width: size.width, height: size.height)
    }

    private func eased(_ value: Double) -> Double {
        value * value * (3 - (2 * value))
    }
}

private struct WaterOverlay: View {
    let progress: Double
    let size: CGSize
    let auriOffset: CGSize

    var body: some View {
        let bottleX = -92 + (min(progress, 0.74) / 0.74) * 42
        let bottleY = 34 - (sin(progress * .pi) * 8)
        let bottleRotation = -18 + (progress * 9)
        let streamProgress = max(0, min(1, (progress - 0.14) / 0.56))
        let streamOpacity = max(0, 1 - abs(progress - 0.46) * 3.6)

        ZStack {
            Image("WaterBottleReference")
                .resizable()
                .interpolation(.high)
                .scaledToFit()
                .frame(width: 64, height: 112)
                .rotationEffect(.degrees(bottleRotation))
                .offset(x: bottleX, y: bottleY)

            Path { path in
                let start = CGPoint(x: bottleX + 13, y: bottleY - 35)
                let end = CGPoint(x: 38, y: -14)
                let control = CGPoint(x: -2, y: -54 - (streamProgress * 8))
                path.move(to: start)
                path.addQuadCurve(to: end, control: control)
            }
            .trim(from: 0, to: streamProgress)
            .stroke(
                Color(red: 0.45, green: 0.80, blue: 0.99).opacity(streamOpacity),
                style: StrokeStyle(lineWidth: 6, lineCap: .round, lineJoin: .round)
            )

            Circle()
                .fill(Color(red: 0.62, green: 0.88, blue: 0.99).opacity(0.80))
                .frame(width: 18 + (streamProgress * 8), height: 10 + (streamProgress * 4))
                .offset(x: 40, y: -12)
                .opacity(streamOpacity)

            ForEach(0..<2, id: \.self) { index in
                WaterDrop()
                    .fill(Color.white.opacity(0.82 - (Double(index) * 0.16)))
                    .frame(width: 10 - CGFloat(index * 2), height: 14 - CGFloat(index * 2))
                    .offset(x: 48 + CGFloat(index * 8), y: -18 + CGFloat(index * 6))
                    .opacity(streamOpacity)
            }
        }
        .offset(x: auriOffset.width, y: auriOffset.height)
        .frame(width: size.width, height: size.height)
    }
}

private struct PlayOverlay: View {
    let progress: Double
    let size: CGSize
    let auriOffset: CGSize

    var body: some View {
        let x = -90 + (progress * 180)
        let y = -60 + abs(sin(progress * .pi * 2)) * -58

        return ZStack {
            Circle()
                .fill(Color(red: 0.99, green: 0.73, blue: 0.36))
                .frame(width: 30, height: 30)
                .overlay(Circle().stroke(.white.opacity(0.8), lineWidth: 2))
                .offset(x: x, y: y)

            ForEach(0..<3, id: \.self) { index in
                Circle()
                    .fill(Color.white.opacity(0.55 - (Double(index) * 0.12)))
                    .frame(width: 12 - CGFloat(index * 2), height: 12 - CGFloat(index * 2))
                    .offset(x: x - CGFloat((index + 1) * 18), y: y + CGFloat(index * 6))
            }
        }
        .offset(x: auriOffset.width, y: auriOffset.height)
        .frame(width: size.width, height: size.height)
    }
}

private struct AffectionOverlay: View {
    let progress: Double
    let size: CGSize
    let auriOffset: CGSize

    var body: some View {
        ZStack {
            ForEach(0..<4, id: \.self) { index in
                let lane = Double(index)
                PixelHeart()
                    .frame(width: 24, height: 24)
                    .offset(
                        x: CGFloat(-54 + (index * 34)) + CGFloat(sin((progress * .pi * 2) + lane) * 6),
                        y: CGFloat(-22 - (progress * 68) - (lane * 10))
                    )
                    .scaleEffect(0.86 + (progress * 0.22))
                    .opacity(max(0, 1 - (progress * 0.92) - (lane * 0.08)))
            }
        }
        .offset(x: auriOffset.width, y: auriOffset.height - 16)
        .frame(width: size.width, height: size.height)
    }
}

private struct TreatOverlay: View {
    let progress: Double
    let foodItem: AuriFoodItem?
    let size: CGSize
    let auriOffset: CGSize

    var body: some View {
        if foodItem == .berryBits {
            ParfaitTreatOverlay(progress: progress, size: size, auriOffset: auriOffset)
        } else {
            ZStack {
                ForEach(0..<6, id: \.self) { index in
                    Image(systemName: "sparkle")
                        .font(.system(size: 20, weight: .bold))
                        .foregroundStyle(Color(red: 0.98, green: 0.82, blue: 0.35))
                        .offset(
                            x: cos((Double(index) / 6) * (.pi * 2)) * (20 + (progress * 60)),
                            y: sin((Double(index) / 6) * (.pi * 2)) * (18 + (progress * 42))
                        )
                        .opacity(1 - progress)
                }
            }
            .offset(x: auriOffset.width, y: auriOffset.height)
            .frame(width: size.width, height: size.height)
        }
    }
}

private struct ParfaitTreatOverlay: View {
    let progress: Double
    let size: CGSize
    let auriOffset: CGSize

    var body: some View {
        let flightProgress = min(progress / 0.62, 1)
        let easedFlight = eased(flightProgress)
        let settleProgress = max(0, min(1, (progress - 0.40) / 0.40))
        let sparkleBurst = max(0, 1 - abs(progress - 0.54) * 4.2)
        let parfaitX = CGFloat(-98 + (easedFlight * 112))
        let parfaitArcLift = sin(flightProgress * .pi) * 34
        let parfaitY = CGFloat(86 - (easedFlight * 108) - parfaitArcLift)
        let parfaitScale = CGFloat(0.70 + (easedFlight * 0.30) - (settleProgress * 0.08))
        let parfaitOpacity = progress > 0.94 ? max(0, 1 - ((progress - 0.94) / 0.06)) : 1

        ZStack {
            Image("ParfaitReference")
                .resizable()
                .interpolation(.high)
                .scaledToFit()
                .frame(width: 98, height: 98)
                .scaleEffect(parfaitScale)
                .rotationEffect(.degrees(-12 + (easedFlight * 18) - (settleProgress * 5)))
                .offset(x: parfaitX, y: parfaitY)
                .shadow(color: .black.opacity(0.16), radius: 10, x: 0, y: 8)
                .opacity(parfaitOpacity)

            ForEach(0..<5, id: \.self) { index in
                Image(systemName: "sparkle")
                    .font(.system(size: 12 + CGFloat(index), weight: .bold))
                    .foregroundStyle(Color(red: 0.98, green: 0.82, blue: 0.35))
                    .offset(
                        x: CGFloat(26 + (index * 8)),
                        y: CGFloat(-18 - (sparkleBurst * 22) - Double(index * 7))
                    )
                    .opacity(sparkleBurst * (0.92 - (Double(index) * 0.14)))
            }
        }
        .offset(x: auriOffset.width, y: auriOffset.height + 4)
        .frame(width: size.width, height: size.height)
    }

    private func eased(_ value: Double) -> Double {
        value * value * (3 - (2 * value))
    }
}

private struct PixelHeart: View {
    private static let rows = [
        ".rr.rr.",
        "rrrrrrr",
        "rrrrrrr",
        ".rrrrr.",
        "..rrr..",
        "...r..."
    ]

    private static let palette: [Character: Color] = [
        ".": .clear,
        "r": Color(red: 0.98, green: 0.40, blue: 0.62)
    ]

    var body: some View {
        GeometryReader { proxy in
            let columns = Self.rows.map(\.count).max() ?? 1
            let pixel = max(
                floor(
                    min(
                        proxy.size.width / CGFloat(columns),
                        proxy.size.height / CGFloat(Self.rows.count)
                    )
                ),
                1
            )
            let width = CGFloat(columns) * pixel
            let height = CGFloat(Self.rows.count) * pixel

            AuriPixelGridLayer(columns: columns, rows: Self.rows.count, pixel: pixel) { column, row in
                let symbol = Array(Self.rows[row])[column]
                return Self.palette[symbol] ?? .clear
            }
            .frame(width: width, height: height)
            .position(x: proxy.size.width / 2, y: proxy.size.height / 2)
        }
    }
}

private struct LightsOverlay: View {
    let progress: Double
    let size: CGSize

    var body: some View {
        ZStack {
            Image(systemName: "moon.stars.fill")
                .font(.system(size: 34, weight: .semibold))
                .foregroundStyle(Color(red: 0.98, green: 0.96, blue: 0.84).opacity(0.84))
                .offset(x: 84, y: -106 + (progress * -6))
                .scaleEffect(0.88 + (progress * 0.12))
                .opacity(0.24 + (progress * 0.76))

            ForEach(0..<5, id: \.self) { index in
                Circle()
                    .fill(Color.white.opacity(0.75 - (Double(index) * 0.12)))
                    .frame(width: 6, height: 6)
                    .offset(
                        x: CGFloat(-92 + (index * 42)),
                        y: CGFloat(-98 + (index.isMultiple(of: 2) ? -8 : 10))
                    )
                    .opacity(progress)
            }
        }
        .frame(width: size.width, height: size.height)
    }
}

private struct SleepOverlay: View {
    let progress: Double
    let size: CGSize
    let auriOffset: CGSize

    var body: some View {
        VStack(spacing: 8) {
            Text("z")
                .offset(x: 0, y: -8)
            Text("z")
                .offset(x: 10, y: 0)
            Text("z")
                .offset(x: 22, y: 8)
        }
        .font(.system(size: 22, weight: .bold, design: .rounded))
        .foregroundStyle(.white.opacity(0.86))
        .offset(x: auriOffset.width + 58, y: auriOffset.height - 88 - (progress * 8))
        .opacity(1 - (progress * 0.24))
        .frame(width: size.width, height: size.height)
    }
}

private struct CleanOverlay: View {
    let progress: Double
    let size: CGSize
    let auriOffset: CGSize

    var body: some View {
        ZStack {
            ForEach(0..<8, id: \.self) { index in
                Image(systemName: "sparkle")
                    .font(.system(size: 18, weight: .bold))
                    .foregroundStyle(Color(red: 0.58, green: 0.88, blue: 0.68))
                    .offset(
                        x: cos((Double(index) / 8) * (.pi * 2)) * (18 + (progress * 54)),
                        y: 90 + sin((Double(index) / 8) * (.pi * 2)) * (10 + (progress * 24))
                    )
                    .opacity(1 - progress)
            }
        }
        .offset(x: auriOffset.width, y: auriOffset.height)
        .frame(width: size.width, height: size.height)
    }
}

private struct MedicineOverlay: View {
    let progress: Double
    let medicineItem: AuriMedicineItem?
    let size: CGSize
    let auriOffset: CGSize

    private var payload: AuriCareDragPayload {
        .medicine(medicineItem ?? .capsule)
    }

    private var iconFrame: CGSize {
        switch medicineItem ?? .capsule {
        case .capsule:
            return CGSize(width: 104, height: 104)
        case .syrup:
            return CGSize(width: 96, height: 132)
        case .coolPatch:
            return CGSize(width: 94, height: 132)
        }
    }

    private var accentColor: Color {
        switch medicineItem ?? .capsule {
        case .capsule:
            return Color(red: 0.95, green: 0.38, blue: 0.44)
        case .syrup:
            return Color(red: 0.40, green: 0.78, blue: 0.35)
        case .coolPatch:
            return Color(red: 0.82, green: 0.28, blue: 0.36)
        }
    }

    private var entranceRotation: Double {
        switch medicineItem ?? .capsule {
        case .capsule:
            return -18
        case .syrup:
            return -12
        case .coolPatch:
            return -10
        }
    }

    var body: some View {
        let flightProgress = min(progress / 0.62, 1)
        let easedFlight = eased(flightProgress)
        let settleProgress = max(0, min(1, (progress - 0.42) / 0.36))
        let reliefBurst = max(0, 1 - abs(progress - 0.56) * 4.8)
        let itemX = CGFloat(-102 + (easedFlight * 118))
        let itemArcLift = sin(flightProgress * .pi) * 34
        let itemY = CGFloat(92 - (easedFlight * 112) - itemArcLift)
        let itemScale = CGFloat(0.70 + (easedFlight * 0.34) - (settleProgress * 0.10))
        let itemOpacity = progress > 0.94 ? max(0, 1 - ((progress - 0.94) / 0.06)) : 1
        let glowSize = CGFloat(40 + (reliefBurst * 24))

        ZStack {
            Circle()
                .fill(accentColor.opacity(reliefBurst * 0.24))
                .frame(width: glowSize, height: glowSize)
                .blur(radius: 16)
                .offset(x: 26, y: -22)

            AuriCarePixelIcon(payload: payload)
                .frame(width: iconFrame.width, height: iconFrame.height)
                .scaleEffect(itemScale)
                .rotationEffect(.degrees(entranceRotation + (easedFlight * 18) - (settleProgress * 6)))
                .offset(x: itemX, y: itemY)
                .shadow(color: .black.opacity(0.18), radius: 10, x: 0, y: 8)
                .opacity(itemOpacity)

            ForEach(0..<4, id: \.self) { index in
                Image(systemName: index.isMultiple(of: 2) ? "sparkle" : "cross.fill")
                    .font(.system(size: 10 + CGFloat(index), weight: .bold))
                    .foregroundStyle(accentColor)
                    .offset(
                        x: CGFloat(22 + (index * 12)),
                        y: CGFloat(-18 - (reliefBurst * 24) - Double(index * 7))
                    )
                    .opacity(reliefBurst * (0.90 - (Double(index) * 0.14)))
            }
        }
        .offset(x: auriOffset.width, y: auriOffset.height + 2)
        .frame(width: size.width, height: size.height)
    }

    private func eased(_ value: Double) -> Double {
        value * value * (3 - (2 * value))
    }
}

private struct AttentionOverlay: View {
    let progress: Double
    let size: CGSize
    let auriOffset: CGSize

    var body: some View {
        ZStack {
            ForEach(0..<2, id: \.self) { index in
                Circle()
                    .stroke(Color(red: 0.99, green: 0.80, blue: 0.34).opacity(0.62 - (Double(index) * 0.12)), lineWidth: 3)
                    .frame(width: 24 + CGFloat(index * 16) + (progress * 24), height: 24 + CGFloat(index * 16) + (progress * 24))
                    .opacity(1 - progress)
            }

            Image(systemName: "bell.badge.fill")
                .font(.system(size: 22, weight: .bold))
                .foregroundStyle(Color(red: 0.99, green: 0.80, blue: 0.34))
                .offset(x: 0, y: 0)
                .opacity(1 - (progress * 0.2))
        }
        .offset(x: auriOffset.width + 84, y: auriOffset.height - 116)
        .frame(width: size.width, height: size.height)
    }
}

private struct DisciplineOverlay: View {
    let progress: Double
    let size: CGSize
    let auriOffset: CGSize

    var body: some View {
        ZStack {
            ForEach(0..<3, id: \.self) { index in
                Capsule(style: .continuous)
                    .fill(Color(red: 0.86, green: 0.62, blue: 0.96).opacity(0.88))
                    .frame(width: 10, height: 36)
                    .offset(x: CGFloat(-18 + (index * 18)), y: -100 + CGFloat(progress * 18))
                    .opacity(1 - progress)
            }

            Image(systemName: "exclamationmark.bubble.fill")
                .font(.system(size: 24, weight: .bold))
                .foregroundStyle(Color(red: 0.86, green: 0.62, blue: 0.96))
                .offset(y: -78)
                .opacity(1 - (progress * 0.3))
        }
        .offset(x: auriOffset.width, y: auriOffset.height)
        .frame(width: size.width, height: size.height)
    }
}

private struct MessageOverlay: View {
    let progress: Double
    let size: CGSize
    let auriOffset: CGSize

    var body: some View {
        VStack(spacing: 10) {
            HStack(spacing: 6) {
                ForEach(0..<3, id: \.self) { index in
                    Circle()
                        .fill(Color(red: 0.22, green: 0.31, blue: 0.37).opacity(0.76))
                        .frame(width: 8, height: 8)
                        .scaleEffect(0.75 + (sin((progress * .pi * 4) + Double(index)) * 0.12))
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .background(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .fill(.white.opacity(0.72))
            )
            .overlay(alignment: .bottomLeading) {
                TrianglePointer()
                    .fill(.white.opacity(0.72))
                    .frame(width: 16, height: 10)
                    .offset(x: 18, y: 8)
            }
        }
        .offset(x: auriOffset.width, y: auriOffset.height - 92 + (progress * -6))
        .opacity(1 - (progress * 0.2))
        .frame(width: size.width, height: size.height)
    }
}

private struct HatchOverlay: View {
    let progress: Double
    let size: CGSize
    let auriOffset: CGSize

    var body: some View {
        ZStack {
            ForEach(0..<8, id: \.self) { index in
                RoundedRectangle(cornerRadius: 4, style: .continuous)
                    .fill(Color.white.opacity(0.8))
                    .frame(width: 12, height: 20)
                    .rotationEffect(.degrees(Double(index) * 45))
                    .offset(
                        x: cos((Double(index) / 8) * (.pi * 2)) * (18 + (progress * 78)),
                        y: sin((Double(index) / 8) * (.pi * 2)) * (18 + (progress * 78))
                    )
                    .opacity(1 - progress)
            }
        }
        .offset(x: auriOffset.width, y: auriOffset.height)
        .frame(width: size.width, height: size.height)
    }
}

private struct AuriPixelAuri: View {
    let stage: AuriStage
    let mood: AuriMood
    let hasHatched: Bool
    let incubationProgress: Double
    let gaze: AuriEyeDirection
    let animationTime: TimeInterval
    let isSleeping: Bool
    let lightsOff: Bool
    let wantsAttention: Bool
    let wantsSleep: Bool
    let needsMedicine: Bool
    let tired: Double
    var isPaused = false
    let avatarModelURL: String
    let displayMode: AuriAvatarDisplayMode
    var vrmPresentationMode: AuriVRMPresentationMode = .room
    var vrmFramingYOffset: Double = 0

    private var shouldUseVRMStageAvatar: Bool {
        displayMode == .stageAvatar && AuriVRMBundleResources.isAvailable
    }

    var body: some View {
        GeometryReader { proxy in
            let size = min(proxy.size.width, proxy.size.height)
            let displaySize = shouldUseVRMStageAvatar
                ? CGSize(width: proxy.size.width, height: proxy.size.height)
                : CGSize(width: size, height: size)

            Group {
                if shouldUseVRMStageAvatar {
                    AuriVRMStageAvatar(
                        state: AuriVRMStageState(
                            mood: mood,
                            isSleeping: isSleeping,
                            lightsOff: lightsOff,
                            wantsAttention: wantsAttention,
                            wantsSleep: wantsSleep,
                            needsMedicine: needsMedicine,
                            tired: tired,
                            isPaused: isPaused,
                            modelURL: avatarModelURL,
                            presentationMode: vrmPresentationMode,
                            framingYOffset: vrmFramingYOffset
                        )
                    )
                } else if stage == .baby {
                    AuriReferenceBabySprite(
                        mood: mood,
                        animationTime: animationTime
                    )
                } else {
                    AuriRetroSpriteView(
                        sprite: AuriRetroSpriteBook.creature(stage: stage, mood: mood, gaze: gaze)
                    )
                }
            }
                .frame(width: displaySize.width, height: displaySize.height)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

}

private struct AuriVRMStageAvatar: UIViewRepresentable {
    let state: AuriVRMStageState

    private static let persistedCameraDefaultsKey = "auri.vrm.stage.camera.v6"

    func makeCoordinator() -> Coordinator {
        Coordinator()
    }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.defaultWebpagePreferences.preferredContentMode = .mobile
        configuration.allowsInlineMediaPlayback = true
        configuration.mediaTypesRequiringUserActionForPlayback = []
        configuration.userContentController.add(context.coordinator, name: Coordinator.statusHandlerName)
        configuration.userContentController.add(context.coordinator, name: Coordinator.cameraHandlerName)
        configuration.setURLSchemeHandler(context.coordinator, forURLScheme: AuriVRMBundleResources.scheme)

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear
        webView.scrollView.isScrollEnabled = false
        webView.scrollView.bounces = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.navigationDelegate = context.coordinator

        context.coordinator.attach(webView)
        context.coordinator.loadViewerIfNeeded(in: webView, forceReload: true)
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        context.coordinator.attach(webView)
        context.coordinator.apply(state: state, to: webView)
    }

    static func dismantleUIView(_ webView: WKWebView, coordinator: Coordinator) {
        coordinator.detach(webView)
    }

    final class Coordinator: NSObject, WKNavigationDelegate, WKScriptMessageHandler, WKURLSchemeHandler {
        static let statusHandlerName = "auriAvatarStatus"
        static let cameraHandlerName = "auriAvatarCamera"

        var lastKnownCameraState: AuriVRMCameraState?
        private weak var webView: WKWebView?
        private var pendingState: AuriVRMStageState?
        private var lastAppliedState: AuriVRMStageState?
        private var lastLoadedViewerURL: URL?
        private var isViewerReady = false

        override init() {
            self.lastKnownCameraState = Self.loadPersistedCameraState()
            super.init()
        }

        func attach(_ webView: WKWebView) {
            self.webView = webView
        }

        func detach(_ webView: WKWebView) {
            webView.stopLoading()
            webView.navigationDelegate = nil
            webView.configuration.userContentController.removeScriptMessageHandler(forName: Self.statusHandlerName)
            webView.configuration.userContentController.removeScriptMessageHandler(forName: Self.cameraHandlerName)
            webView.evaluateJavaScript("window.disposeAuriAvatar?.();", completionHandler: nil)
            self.webView = nil
            isViewerReady = false
            lastLoadedViewerURL = nil
        }

        func loadViewerIfNeeded(in webView: WKWebView, forceReload: Bool) {
            guard let viewerURL = AuriVRMBundleResources.viewerURL else {
                return
            }

            if forceReload || lastLoadedViewerURL?.absoluteString != viewerURL.absoluteString {
                lastLoadedViewerURL = viewerURL
                isViewerReady = false
                let request = URLRequest(
                    url: viewerURL,
                    cachePolicy: .reloadIgnoringLocalCacheData,
                    timeoutInterval: 60
                )
                webView.load(request)
            }
        }

        func apply(state: AuriVRMStageState, to webView: WKWebView) {
            pendingState = state
            loadViewerIfNeeded(in: webView, forceReload: false)
            pushPendingStateIfReady()
        }

        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            switch message.name {
            case Self.statusHandlerName:
                handleStatusMessage(message.body)
            case Self.cameraHandlerName:
                if let cameraState = AuriVRMCameraState(messageBody: message.body) {
                    persist(cameraState: cameraState)
                }
            default:
                break
            }
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            pushPendingStateIfReady()
        }

        func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
            isViewerReady = false
            pushPendingStateIfReady()
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            NSLog("[Auri Web VRM] navigation failed: %@", error.localizedDescription)
        }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            NSLog("[Auri Web VRM] provisional navigation failed: %@", error.localizedDescription)
        }

        func webView(_ webView: WKWebView, start urlSchemeTask: any WKURLSchemeTask) {
            guard
                let requestURL = urlSchemeTask.request.url,
                let fileURL = AuriVRMBundleResources.bundledFileURL(for: requestURL)
            else {
                let error = NSError(
                    domain: "AuriVRMSchemeHandler",
                    code: 404,
                    userInfo: [NSLocalizedDescriptionKey: "Missing bundled WebAvatar resource."]
                )
                urlSchemeTask.didFailWithError(error)
                return
            }

            do {
                let data = try Data(contentsOf: fileURL)
                let mimeType = AuriVRMBundleResources.mimeType(for: fileURL)
                let response = HTTPURLResponse(
                    url: requestURL,
                    statusCode: 200,
                    httpVersion: "HTTP/1.1",
                    headerFields: [
                        "Content-Type": mimeType,
                        "Access-Control-Allow-Origin": "*",
                        "Cache-Control": "no-cache"
                    ]
                )!
                urlSchemeTask.didReceive(response)
                urlSchemeTask.didReceive(data)
                urlSchemeTask.didFinish()
            } catch {
                urlSchemeTask.didFailWithError(error)
            }
        }

        func webView(_ webView: WKWebView, stop urlSchemeTask: any WKURLSchemeTask) {}

        func persist(cameraState: AuriVRMCameraState) {
            lastKnownCameraState = cameraState
            Self.persist(cameraState: cameraState)
        }

        private func handleStatusMessage(_ body: Any) {
            guard
                let payload = body as? [String: Any],
                let state = payload["state"] as? String
            else {
                return
            }

            if state == "ready" {
                isViewerReady = true
                pushPendingStateIfReady()
            } else if state == "error" {
                let message = (payload["message"] as? String) ?? "Unknown WebAvatar error."
                NSLog("[Auri Web VRM] viewer error: %@", message)
            }
        }

        private func pushPendingStateIfReady() {
            guard isViewerReady, let webView, let pendingState else {
                return
            }

            if lastAppliedState != pendingState {
                let script = "window.updateAuriAvatarState(\(pendingState.javascriptLiteral));"
                webView.evaluateJavaScript(script, completionHandler: nil)
                lastAppliedState = pendingState
            }

            if pendingState.presentationMode == AuriVRMPresentationMode.room.rawValue,
               let cameraState = lastKnownCameraState {
                let restoreScript = "window.restoreAuriAvatarCamera(\(cameraState.javascriptLiteral));"
                webView.evaluateJavaScript(restoreScript, completionHandler: nil)
            }
        }

        private static func persist(cameraState: AuriVRMCameraState) {
            let encoder = JSONEncoder()
            guard let data = try? encoder.encode(cameraState) else {
                return
            }

            UserDefaults.standard.set(data, forKey: AuriVRMStageAvatar.persistedCameraDefaultsKey)
        }

        private static func loadPersistedCameraState() -> AuriVRMCameraState? {
            guard
                let data = UserDefaults.standard.data(forKey: AuriVRMStageAvatar.persistedCameraDefaultsKey)
            else {
                return nil
            }

            return try? JSONDecoder().decode(AuriVRMCameraState.self, from: data)
        }
    }
}

private struct AuriReferenceBabySprite: View {
    let mood: AuriMood
    let animationTime: TimeInterval

    @State private var animationStartedAt: TimeInterval = 0

    private var activeAnimationKey: String? {
        switch mood {
        case .needy, .fading:
            return "sad_crossed_arms"
        default:
            return nil
        }
    }

    private var activeAnimation: AuriLoadedSpriteAnimation? {
        switch activeAnimationKey {
        case "sad_crossed_arms":
            return AuriBabySpriteAnimationBook.sadCrossedArms
        default:
            return nil
        }
    }

    var body: some View {
        GeometryReader { proxy in
            let size = min(proxy.size.width, proxy.size.height)
            let elapsed = max(0, animationTime - animationStartedAt)

            Group {
                if
                    let activeAnimation,
                    let frame = activeAnimation.frame(at: elapsed)
                {
                    Image(decorative: frame, scale: 1, orientation: .up)
                        .resizable()
                        .interpolation(.none)
                        .scaledToFit()
                        .frame(width: size, height: size)
                } else {
                    Image("BabyReference")
                        .resizable()
                        .interpolation(.none)
                        .scaledToFit()
                        .frame(width: size, height: size)
                }
            }
            .frame(width: size, height: size)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .onAppear {
                animationStartedAt = animationTime
            }
            .onChange(of: activeAnimationKey) { _, _ in
                animationStartedAt = animationTime
            }
        }
    }
}

private struct AuriSpriteSheetMetadata: Decodable {
    struct Frame: Decodable {
        let name: String
        let x: Int
        let y: Int
        let width: Int
        let height: Int
        let duration: TimeInterval
    }

    let name: String
    let sheetAssetName: String
    let frameWidth: Int
    let frameHeight: Int
    let loop: Bool
    let frames: [Frame]
}

private struct AuriLoadedSpriteFrame {
    let name: String
    let image: CGImage
    let duration: TimeInterval
}

private struct AuriLoadedSpriteAnimation {
    let name: String
    let frames: [AuriLoadedSpriteFrame]
    let loop: Bool

    private var totalDuration: TimeInterval {
        max(frames.reduce(0) { $0 + $1.duration }, 0)
    }

    func frame(at elapsed: TimeInterval) -> CGImage? {
        guard let first = frames.first else {
            return nil
        }

        guard totalDuration > 0 else {
            return first.image
        }

        let normalized = loop
            ? elapsed.truncatingRemainder(dividingBy: totalDuration)
            : min(elapsed, totalDuration)
        var cursor: TimeInterval = 0

        for frame in frames {
            cursor += frame.duration
            if normalized < cursor {
                return frame.image
            }
        }

        return frames.last?.image
    }
}

private enum AuriBabySpriteAnimationBook {
    static let sadCrossedArms = load(named: "SadCrossedArmsMetadata")

    private static func load(named dataAssetName: String) -> AuriLoadedSpriteAnimation? {
        guard
            let dataAsset = NSDataAsset(name: dataAssetName),
            let metadata = try? JSONDecoder().decode(AuriSpriteSheetMetadata.self, from: dataAsset.data),
            let sheetImage = UIImage(named: metadata.sheetAssetName)?.cgImage
        else {
            return nil
        }

        let frames = metadata.frames.compactMap { frame -> AuriLoadedSpriteFrame? in
            let rect = CGRect(
                x: frame.x,
                y: frame.y,
                width: frame.width,
                height: frame.height
            )

            guard let image = sheetImage.cropping(to: rect) else {
                return nil
            }

            return AuriLoadedSpriteFrame(
                name: frame.name,
                image: image,
                duration: frame.duration
            )
        }

        guard frames.count == metadata.frames.count else {
            return nil
        }

        return AuriLoadedSpriteAnimation(
            name: metadata.name,
            frames: frames,
            loop: metadata.loop
        )
    }
}

private struct AuriReferenceEggPixelArt: View {
    let progress: Double

    private let columns = 31
    private let rows = 35

    private let outline = Color(red: 0.15, green: 0.11, blue: 0.11)
    private let shellBody = Color(red: 0.94, green: 0.91, blue: 0.84)
    private let shellHighlight = Color(red: 0.99, green: 0.98, blue: 0.94)
    private let shellMidShade = Color(red: 0.82, green: 0.78, blue: 0.75)
    private let shellDeepShade = Color(red: 0.68, green: 0.64, blue: 0.62)
    private let mintLight = Color(red: 0.84, green: 0.95, blue: 0.90)
    private let mintDark = Color(red: 0.68, green: 0.84, blue: 0.79)
    private let crack = Color(red: 0.25, green: 0.18, blue: 0.16)

    var body: some View {
        GeometryReader { proxy in
            let pixel = max(
                floor(
                    min(
                        proxy.size.width / CGFloat(columns),
                        proxy.size.height / CGFloat(rows)
                    )
                ),
                1
            )
            let artWidth = CGFloat(columns) * pixel
            let artHeight = CGFloat(rows) * pixel

            AuriPixelGridLayer(columns: columns, rows: rows, pixel: pixel) { column, row in
                    eggColor(column: column, row: row)
                }
            .frame(width: artWidth, height: artHeight)
            .position(x: proxy.size.width / 2, y: proxy.size.height / 2)
        }
    }

    private func eggColor(column: Int, row: Int) -> Color? {
        let centerColumn = columns / 2
        let midX = Double(columns - 1) / 2
        let x = (Double(column) - midX) / 11.8
        let y = (Double(row) - 14.6) / 13.6
        let taper = max(0.68, 0.72 + ((y + 1) / 2) * 0.42)
        let shape = pow(x / taper, 2) + pow(y, 2)

        guard shape <= 1 else {
            return nil
        }

        if row == 1 && column == centerColumn {
            return nil
        }

        let outlineThreshold = 0.82 + max(0, y) * 0.05
        if shape > outlineThreshold {
            return outline
        }

        if let crackColor = crackColor(x: x, y: y) {
            return crackColor
        }

        let highlightDistance = pow((x + 0.20) / 0.50, 2) + pow((y + 0.10) / 0.58, 2)
        let capBoundary = -0.43
            + (cos((x + 0.08) * .pi * 2.3) * 0.06)
            + (sin((x - 0.12) * .pi * 3.1) * 0.03)
        let capMask = y < capBoundary && abs(x) < 0.84 && shape < 0.84
        let deepShadeMask = (x > 0.56 && y > -0.02) || y > (0.78 - (abs(x) * 0.08))
        let sideShadeMask = (x > 0.38 && y > -0.10) || (x < -0.56 && y > 0.18) || y > (0.60 - (abs(x) * 0.18))

        if capMask {
            if highlightDistance < 0.36 || (x < -0.02 && y < -0.28 && highlightDistance < 0.88) {
                return shellHighlight
            }
            return x > 0.16 || y < -0.58 ? mintDark : mintLight
        }

        if highlightDistance < 1.02 {
            return shellHighlight
        }

        if deepShadeMask {
            return shellDeepShade
        }

        if sideShadeMask {
            return shellMidShade
        }

        return shellBody
    }

    private func crackColor(x: Double, y: Double) -> Color? {
        let crackProgress = max(0, min(1, (progress - 0.58) / 0.42))
        guard crackProgress > 0 else {
            return nil
        }

        let segments: [((Double, Double), (Double, Double), Double)] = [
            ((-0.14, -0.24), (-0.05, -0.10), 0.10),
            ((-0.05, -0.10), (0.03, -0.20), 0.30),
            ((0.03, -0.20), (0.16, -0.04), 0.55),
            ((0.16, -0.04), (0.04, 0.10), 0.78)
        ]

        for (start, end, revealThreshold) in segments where crackProgress >= revealThreshold {
            if distanceToSegment(point: (x, y), start: start, end: end) < 0.040 {
                return crack
            }
        }

        return nil
    }

    private func distanceToSegment(
        point: (Double, Double),
        start: (Double, Double),
        end: (Double, Double)
    ) -> Double {
        let dx = end.0 - start.0
        let dy = end.1 - start.1
        let lengthSquared = (dx * dx) + (dy * dy)

        guard lengthSquared > 0 else {
            let px = point.0 - start.0
            let py = point.1 - start.1
            return sqrt((px * px) + (py * py))
        }

        let projection = max(
            0,
            min(
                1,
                ((point.0 - start.0) * dx + (point.1 - start.1) * dy) / lengthSquared
            )
        )
        let closestX = start.0 + (projection * dx)
        let closestY = start.1 + (projection * dy)
        let distanceX = point.0 - closestX
        let distanceY = point.1 - closestY
        return sqrt((distanceX * distanceX) + (distanceY * distanceY))
    }
}

private struct AuriPixelGridLayer: View {
    let columns: Int
    let rows: Int
    let pixel: CGFloat
    let colorAt: (Int, Int) -> Color?

    var body: some View {
        VStack(spacing: 0) {
            ForEach(0..<rows, id: \.self) { row in
                HStack(spacing: 0) {
                    ForEach(0..<columns, id: \.self) { column in
                        Rectangle()
                            .fill(colorAt(column, row) ?? .clear)
                            .frame(width: pixel, height: pixel)
                    }
                }
                .frame(height: pixel)
            }
        }
    }
}

private struct AuriRetroSprite {
    let rows: [String]
    let palette: AuriRetroPalette
}

private struct AuriRetroSpriteView: View {
    let sprite: AuriRetroSprite

    var body: some View {
        GeometryReader { proxy in
            let columnCount = max(sprite.rows.map(\.count).max() ?? 1, 1)
            let rowCount = max(sprite.rows.count, 1)
            let pixel = max(
                floor(
                    min(
                        proxy.size.width / CGFloat(columnCount),
                        proxy.size.height / CGFloat(rowCount)
                    )
                ),
                1
            )
            let spriteWidth = CGFloat(columnCount) * pixel
            let spriteHeight = CGFloat(rowCount) * pixel

            VStack(spacing: 0) {
                ForEach(Array(sprite.rows.enumerated()), id: \.offset) { index, row in
                    let cells = paddedCells(for: row, columns: columnCount)

                    HStack(spacing: 0) {
                        ForEach(Array(cells.enumerated()), id: \.offset) { cellIndex, symbol in
                            Rectangle()
                                .fill(sprite.palette.color(for: symbol))
                                .frame(width: pixel, height: pixel)
                        }
                    }
                    .frame(height: pixel)
                }
            }
            .frame(width: spriteWidth, height: spriteHeight)
            .position(x: proxy.size.width / 2, y: proxy.size.height / 2)
        }
    }

    private func paddedCells(for row: String, columns: Int) -> [Character] {
        let deficit = max(columns - row.count, 0)
        let leading = deficit / 2
        let trailing = deficit - leading
        let padded = String(repeating: ".", count: leading) + row + String(repeating: ".", count: trailing)
        return Array(padded)
    }
}

private struct AuriRetroPalette {
    let outline: Color
    let body: Color
    let highlight: Color
    let belly: Color
    let accent: Color
    let blush: Color
    let detail: Color
    let shellDot: Color
    let crack: Color

    static let egg = AuriRetroPalette(
        outline: Color(red: 0.14, green: 0.11, blue: 0.11),
        body: Color(red: 0.95, green: 0.91, blue: 0.82),
        highlight: Color(red: 0.99, green: 0.98, blue: 0.94),
        belly: Color(red: 0.80, green: 0.76, blue: 0.73),
        accent: Color(red: 0.77, green: 0.90, blue: 0.86),
        blush: Color(red: 0.61, green: 0.79, blue: 0.74),
        detail: Color(red: 0.18, green: 0.20, blue: 0.24),
        shellDot: Color(red: 0.64, green: 0.60, blue: 0.58),
        crack: Color(red: 0.29, green: 0.26, blue: 0.25)
    )

    static func creature(for stage: AuriStage) -> AuriRetroPalette {
        switch stage {
        case .baby:
            return AuriRetroPalette(
                outline: Color(red: 0.26, green: 0.28, blue: 0.34),
                body: Color(red: 0.95, green: 0.86, blue: 0.94),
                highlight: Color(red: 0.99, green: 0.96, blue: 0.99),
                belly: Color(red: 0.99, green: 0.95, blue: 0.92),
                accent: Color(red: 0.96, green: 0.73, blue: 0.82),
                blush: Color(red: 0.98, green: 0.72, blue: 0.78),
                detail: Color(red: 0.14, green: 0.16, blue: 0.20),
                shellDot: Color(red: 0.74, green: 0.84, blue: 0.98),
                crack: Color(red: 0.49, green: 0.54, blue: 0.61)
            )
        case .kid:
            return AuriRetroPalette(
                outline: Color(red: 0.24, green: 0.28, blue: 0.33),
                body: Color(red: 0.79, green: 0.92, blue: 0.98),
                highlight: Color(red: 0.95, green: 0.99, blue: 1.0),
                belly: Color(red: 0.95, green: 0.99, blue: 0.99),
                accent: Color(red: 0.55, green: 0.80, blue: 0.97),
                blush: Color(red: 0.98, green: 0.75, blue: 0.80),
                detail: Color(red: 0.12, green: 0.15, blue: 0.18),
                shellDot: Color(red: 0.96, green: 0.81, blue: 0.56),
                crack: Color(red: 0.49, green: 0.54, blue: 0.61)
            )
        case .adult:
            return AuriRetroPalette(
                outline: Color(red: 0.19, green: 0.23, blue: 0.27),
                body: Color(red: 0.67, green: 0.88, blue: 0.87),
                highlight: Color(red: 0.92, green: 0.98, blue: 0.96),
                belly: Color(red: 0.88, green: 0.96, blue: 0.93),
                accent: Color(red: 0.40, green: 0.69, blue: 0.77),
                blush: Color(red: 0.96, green: 0.72, blue: 0.79),
                detail: Color(red: 0.10, green: 0.13, blue: 0.16),
                shellDot: Color(red: 0.96, green: 0.79, blue: 0.56),
                crack: Color(red: 0.49, green: 0.54, blue: 0.61)
            )
        case .old:
            return AuriRetroPalette(
                outline: Color(red: 0.21, green: 0.23, blue: 0.28),
                body: Color(red: 0.85, green: 0.87, blue: 0.92),
                highlight: Color(red: 0.97, green: 0.97, blue: 0.99),
                belly: Color(red: 0.96, green: 0.94, blue: 0.97),
                accent: Color(red: 0.69, green: 0.73, blue: 0.82),
                blush: Color(red: 0.95, green: 0.76, blue: 0.80),
                detail: Color(red: 0.12, green: 0.13, blue: 0.16),
                shellDot: Color(red: 0.96, green: 0.77, blue: 0.62),
                crack: Color(red: 0.49, green: 0.54, blue: 0.61)
            )
        }
    }

    func color(for symbol: Character) -> Color {
        switch symbol {
        case ".":
            return .clear
        case "o", "f":
            return outline
        case "b":
            return body
        case "h":
            return highlight
        case "w":
            return belly
        case "a":
            return accent
        case "p":
            return blush
        case "e", "m", "g":
            return detail
        case "s":
            return shellDot
        case "d":
            return shellDot.opacity(0.92)
        case "c":
            return crack
        default:
            return .clear
        }
    }
}

private enum AuriRetroSpriteBook {
    static func egg(progress: Double) -> AuriRetroSprite {
        let rows: [String]

        switch progress {
        case ..<0.6:
            rows = [
                "............ooooo............",
                "..........ooaapppoo..........",
                ".........oaapahhappo.........",
                "........oaapabbbbappo........",
                ".......oaabbbbbbbbbbao.......",
                "......oabbbbhhhhhbbbbao......",
                ".....oabbbhhhhhhhhbbbbao.....",
                "....oabbbhhhhhhhhhhbbbbao....",
                "...oabbbhhhhhhhhhhhhbbbbao...",
                "...obbbwwhhhhhhhhhhwwbbbbo...",
                "..obbbbwwwbbbbhhhhwwwbbbbo..",
                "..obbbbwwdbbbbbbbbwwdbbbbo..",
                "...obbbbwwwbbbbbbwwwbbbbo...",
                "....oobbbbwwwwwwbbbboo....",
                "......ooobbbbbbbbbbooo......",
                "........ooooooooooooo........"
            ]
        case ..<0.88:
            rows = [
                "............ooooo............",
                "..........ooaapppoo..........",
                ".........oaapahhappo.........",
                "........oaapabbbbappo........",
                ".......oaabbbbbbbbbbao.......",
                "......oabbbbhhhhhbbbbao......",
                ".....oabbbhhhhchhhbbbbao.....",
                "....oabbbhhhccccchbbbbao....",
                "...oabbbhhhhcccchhhhbbbbao...",
                "...obbbwwhhhhccchhhwwbbbbo...",
                "..obbbbwwwbbbbhhhhwwwbbbbo..",
                "..obbbbwwdbbbbbbbbwwdbbbbo..",
                "...obbbbwwwbbbbbbwwwbbbbo...",
                "....oobbbbwwwwwwbbbboo....",
                "......ooobbbbbbbbbbooo......",
                "........ooooooooooooo........"
            ]
        default:
            rows = [
                "............ooooo............",
                "..........ooaapppoo..........",
                ".........oaapahhappo.........",
                "........oaapabcccappo........",
                ".......oaabbbccccbbbao.......",
                "......oabbbccccccccbbao......",
                ".....oabbbhhccccchbbbbao.....",
                "....oabbbhhccccccchbbbbao....",
                "...oabbbhhhhcccchhhhbbbbao...",
                "...obbbwwhhhhccchhhwwbbbbo...",
                "..obbbbwwwbbbbhhhhwwwbbbbo..",
                "..obbbbwwdbbbbbbbbwwdbbbbo..",
                "...obbbbwwwbbbbbbwwwbbbbo...",
                "....oobbbbwwwwwwbbbboo....",
                "......ooobbbbbbbbbbooo......",
                "........ooooooooooooo........"
            ]
        }

        return AuriRetroSprite(rows: rows, palette: .egg)
    }

    static func creature(stage: AuriStage, mood: AuriMood, gaze: AuriEyeDirection) -> AuriRetroSprite {
        let baseRows: [String]

        switch stage {
        case .baby:
            baseRows = [
                "..................",
                "........aa........",
                "......aobboa......",
                ".....obbbbbbo.....",
                "....obbhhhhbbbo....",
                "...obbbbbbbbbbo...",
                "...obbbbbbbbbbo...",
                "..obbbbbbbbbbbbbo..",
                "..obbbbpeepbbbbo..",
                "..obbbbwwmmwwbbbo..",
                "..obbbbbwwwwbbbbo..",
                "...obbbbbbbbbbo...",
                "...aobbbbbbbboa...",
                "....ooff..ffoo....",
                "......oo....oo......"
            ]
        case .kid:
            baseRows = [
                "....................",
                ".........aa.........",
                ".......aaobaa.......",
                "......obbbbbbo......",
                ".....obbhhhhbbbo.....",
                "...aobbbbbbbbbboa...",
                "...obbbbbbbbbbbbbo...",
                "..obbbbssbbssbbbbo..",
                "..obbbbpeepbbbbo..",
                "..obbbbwwmmwwbbbbo..",
                "..obbbbbwwwwbbbbbo..",
                "...obbbbbbbbbbbbo...",
                "...aobbbbbbbbboa...",
                "....ooff....ffoo....",
                "......oo......oo......"
            ]
        case .adult:
            baseRows = [
                "......................",
                "..........aa..........",
                "........aaobaa........",
                ".......aobbbbboa......",
                "......obbhhhhbbbo.....",
                "....aobbbbbbbbbboa....",
                "...obbbbbbbbbbbbbbo...",
                "..obbbbssbbssbbbbbo..",
                "..obbbbbpeepbbbbbbbo..",
                "..obbbbbwwmmwwbbbbbo..",
                "..obbbbbbwwwwbbbbbbbo..",
                "..obbbbsswwwwssbbbbo..",
                "...obbbbbbbbbbbbbbo...",
                "...aobbbbbbbbbbbboa...",
                "....oooff....ffooo....",
                "......ooo....ooo......"
            ]
        case .old:
            baseRows = [
                "......................",
                ".........gg...........",
                ".......goobboo........",
                "......oabbbbbao.......",
                ".....obbhhhhbbbo......",
                "...aobbbbbbbbbboa.....",
                "...obbbbbbbbbbbbbo....",
                "..obbbbssssssssbbbbo..",
                "..obbbbbpeepbbbbbbbo..",
                "..obbbbbwwmmwwbbbbbo..",
                "..obbbbbgwwwwgbbbbbo..",
                "..obbbbbssssssbbbbbo..",
                "...obbbbbbbbbbbbbo....",
                "...oosssssssssssoo....",
                "....ooff....ffoo.....",
                "......oo....oo......."
            ]
        }

        return AuriRetroSprite(
            rows: gazeAdjusted(expressionAdjusted(baseRows, mood: mood), mood: mood, gaze: gaze),
            palette: .creature(for: stage)
        )
    }

    private static func expressionAdjusted(_ rows: [String], mood: AuriMood) -> [String] {
        switch mood {
        case .cozy, .bright:
            return rows
        case .needy:
            return rows.map { $0.replacingOccurrences(of: "mm", with: "oo") }
        case .sleepy:
            return rows.map {
                $0.replacingOccurrences(of: "ee", with: "gg")
                    .replacingOccurrences(of: "mm", with: "gg")
            }
        case .fading, .gone:
            return rows.map {
                $0.replacingOccurrences(of: "ee", with: "gg")
                    .replacingOccurrences(of: "mm", with: "gg")
                    .replacingOccurrences(of: "p", with: ".")
            }
        }
    }

    private static func gazeAdjusted(_ rows: [String], mood: AuriMood, gaze: AuriEyeDirection) -> [String] {
        guard gaze != .center else {
            return rows
        }

        return rows.map { row in
            switch mood {
            case .sleepy:
                switch gaze {
                case .left:
                    return row.replacingOccurrences(of: "pggp", with: "ggpp")
                case .right:
                    return row.replacingOccurrences(of: "pggp", with: "ppgg")
                case .center:
                    return row
                }
            case .fading, .gone:
                return row
            case .cozy, .bright, .needy:
                switch gaze {
                case .left:
                    return row.replacingOccurrences(of: "peep", with: "eepp")
                case .right:
                    return row.replacingOccurrences(of: "peep", with: "ppee")
                case .center:
                    return row
                }
            }
        }
    }
}

private struct AuriEggArt: View {
    let progress: Double

    var body: some View {
        GeometryReader { proxy in
            let size = min(proxy.size.width, proxy.size.height)
            let crackProgress = max(0, min(1, (progress - 0.54) / 0.46))

            ZStack {
                Ellipse()
                    .fill(Color.black.opacity(0.12))
                    .frame(width: size * 0.34, height: size * 0.08)
                    .blur(radius: 4)
                    .offset(y: size * 0.24)

                Ellipse()
                    .fill(
                        LinearGradient(
                            colors: [
                                Color(red: 0.99, green: 0.97, blue: 0.93),
                                Color(red: 0.92, green: 0.89, blue: 0.82)
                            ],
                            startPoint: .top,
                            endPoint: .bottom
                        )
                    )
                    .frame(width: size * 0.44, height: size * 0.56)
                    .overlay(
                        Ellipse()
                            .stroke(Color(red: 0.45, green: 0.50, blue: 0.55), lineWidth: size * 0.018)
                    )

                Circle()
                    .fill(Color.white.opacity(0.55))
                    .frame(width: size * 0.16, height: size * 0.16)
                    .offset(x: -size * 0.09, y: -size * 0.12)
                    .blur(radius: 2)

                ForEach(0..<4, id: \.self) { index in
                    Circle()
                        .fill(index.isMultiple(of: 2) ? Color(red: 0.72, green: 0.84, blue: 0.97) : Color(red: 0.97, green: 0.76, blue: 0.80))
                        .frame(width: size * 0.055, height: size * 0.055)
                        .offset(
                            x: [-0.12, 0.11, -0.06, 0.07][index] * size,
                            y: [-0.06, -0.02, 0.10, 0.14][index] * size
                        )
                }

                EggCrackShape(jitter: progress)
                    .stroke(Color(red: 0.48, green: 0.53, blue: 0.58).opacity(crackProgress), style: StrokeStyle(lineWidth: size * 0.018, lineCap: .round, lineJoin: .round))
                    .frame(width: size * 0.30, height: size * 0.24)
                    .offset(y: size * 0.02)
            }
            .frame(width: size, height: size)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }
}

private struct AuriCreatureArt: View {
    let stage: AuriStage
    let mood: AuriMood

    var body: some View {
        GeometryReader { proxy in
            let size = min(proxy.size.width, proxy.size.height)
            let scale = size / 220
            let palette = AuriCreaturePalette.palette(for: stage)

            ZStack {
                if stage == .adult || stage == .old {
                    Ellipse()
                        .fill(palette.accent.opacity(0.70))
                        .frame(width: 36 * scale, height: 62 * scale)
                        .rotationEffect(.degrees(46))
                        .offset(x: 54 * scale, y: 28 * scale)
                }

                if stage == .kid || stage == .adult {
                    Capsule(style: .continuous)
                        .fill(palette.accent.opacity(0.72))
                        .frame(width: 22 * scale, height: 44 * scale)
                        .rotationEffect(.degrees(-42))
                        .offset(x: -58 * scale, y: -8 * scale)

                    Capsule(style: .continuous)
                        .fill(palette.accent.opacity(0.72))
                        .frame(width: 22 * scale, height: 44 * scale)
                        .rotationEffect(.degrees(42))
                        .offset(x: 58 * scale, y: -8 * scale)
                }

                if stage == .old {
                    Capsule(style: .continuous)
                        .fill(palette.accent.opacity(0.64))
                        .frame(width: 20 * scale, height: 38 * scale)
                        .rotationEffect(.degrees(-34))
                        .offset(x: -54 * scale, y: 8 * scale)

                    Capsule(style: .continuous)
                        .fill(palette.accent.opacity(0.64))
                        .frame(width: 20 * scale, height: 38 * scale)
                        .rotationEffect(.degrees(34))
                        .offset(x: 54 * scale, y: 8 * scale)
                }

                feet(scale: scale, palette: palette)
                bodyOutline(scale: scale, palette: palette)
                bodyFill(scale: scale, palette: palette)
                belly(scale: scale, palette: palette)
                accents(scale: scale, palette: palette)

                if stage == .old {
                    Capsule(style: .continuous)
                        .fill(palette.scarf.opacity(0.96))
                        .frame(width: 118 * scale, height: 24 * scale)
                        .offset(y: 42 * scale)
                        .overlay(
                            Capsule(style: .continuous)
                                .stroke(.white.opacity(0.26), lineWidth: 1.2)
                        )
                }

                AuriCreatureFace(mood: mood, stage: stage, palette: palette, scale: scale)
                    .offset(y: faceYOffset * scale)
            }
            .frame(width: size, height: size)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    private var faceYOffset: CGFloat {
        switch stage {
        case .baby:
            return -4
        case .kid:
            return -2
        case .adult:
            return -1
        case .old:
            return 2
        }
    }

    @ViewBuilder
    private func feet(scale: CGFloat, palette: AuriCreaturePalette) -> some View {
        HStack(spacing: 26 * scale) {
            Ellipse()
                .fill(palette.outline.opacity(0.85))
                .frame(width: 26 * scale, height: 14 * scale)
            Ellipse()
                .fill(palette.outline.opacity(0.85))
                .frame(width: 26 * scale, height: 14 * scale)
        }
        .offset(y: 78 * scale)
    }

    @ViewBuilder
    private func bodyOutline(scale: CGFloat, palette: AuriCreaturePalette) -> some View {
        bodyShell(stage: stage, fill: palette.outline, scale: scale, extra: 8)
    }

    @ViewBuilder
    private func bodyFill(scale: CGFloat, palette: AuriCreaturePalette) -> some View {
        ZStack {
            bodyShell(stage: stage, fill: palette.body, scale: scale, extra: 0)

            Circle()
                .fill(Color.white.opacity(0.20))
                .frame(width: 54 * scale, height: 54 * scale)
                .offset(x: -28 * scale, y: -42 * scale)

            if stage == .baby {
                Circle()
                    .fill(palette.accent.opacity(0.90))
                    .frame(width: 22 * scale, height: 22 * scale)
                    .offset(y: -58 * scale)
            } else if stage == .kid {
                Capsule(style: .continuous)
                    .fill(palette.accent.opacity(0.90))
                    .frame(width: 34 * scale, height: 16 * scale)
                    .offset(y: -62 * scale)
            } else if stage == .adult {
                RoundedRectangle(cornerRadius: 10 * scale, style: .continuous)
                    .fill(palette.accent.opacity(0.94))
                    .frame(width: 38 * scale, height: 20 * scale)
                    .offset(y: -66 * scale)
            } else {
                Circle()
                    .fill(palette.accent.opacity(0.90))
                    .frame(width: 22 * scale, height: 22 * scale)
                    .offset(x: -12 * scale, y: -60 * scale)

                Circle()
                    .fill(palette.accent.opacity(0.90))
                    .frame(width: 18 * scale, height: 18 * scale)
                    .offset(x: 8 * scale, y: -67 * scale)
            }
        }
    }

    @ViewBuilder
    private func belly(scale: CGFloat, palette: AuriCreaturePalette) -> some View {
        switch stage {
        case .baby:
            Ellipse()
                .fill(palette.belly.opacity(0.96))
                .frame(width: 70 * scale, height: 60 * scale)
                .offset(y: 18 * scale)
        case .kid:
            Ellipse()
                .fill(palette.belly.opacity(0.96))
                .frame(width: 76 * scale, height: 70 * scale)
                .offset(y: 20 * scale)
        case .adult:
            Ellipse()
                .fill(palette.belly.opacity(0.95))
                .frame(width: 82 * scale, height: 82 * scale)
                .offset(y: 22 * scale)
        case .old:
            Ellipse()
                .fill(palette.belly.opacity(0.93))
                .frame(width: 86 * scale, height: 76 * scale)
                .offset(y: 24 * scale)
        }
    }

    @ViewBuilder
    private func accents(scale: CGFloat, palette: AuriCreaturePalette) -> some View {
        if stage == .kid || stage == .adult {
            HStack(spacing: 84 * scale) {
                Circle()
                    .fill(palette.spot.opacity(0.92))
                    .frame(width: 14 * scale, height: 14 * scale)
                Circle()
                    .fill(palette.spot.opacity(0.92))
                    .frame(width: 14 * scale, height: 14 * scale)
            }
            .offset(y: 8 * scale)
        }

        if stage == .old {
            HStack(spacing: 78 * scale) {
                Circle()
                    .fill(palette.spot.opacity(0.62))
                    .frame(width: 12 * scale, height: 12 * scale)
                Circle()
                    .fill(palette.spot.opacity(0.62))
                    .frame(width: 12 * scale, height: 12 * scale)
            }
            .offset(y: 10 * scale)
        }
    }

    @ViewBuilder
    private func bodyShell(stage: AuriStage, fill: Color, scale: CGFloat, extra: CGFloat) -> some View {
        switch stage {
        case .baby:
            ZStack {
                Circle()
                    .fill(fill)
                    .frame(width: (92 + extra) * scale, height: (88 + extra) * scale)
                    .offset(y: 18 * scale)
                Circle()
                    .fill(fill)
                    .frame(width: (48 + extra) * scale, height: (48 + extra) * scale)
                    .offset(x: -22 * scale, y: -10 * scale)
                Circle()
                    .fill(fill)
                    .frame(width: (48 + extra) * scale, height: (48 + extra) * scale)
                    .offset(x: 22 * scale, y: -10 * scale)
            }
        case .kid:
            ZStack {
                Ellipse()
                    .fill(fill)
                    .frame(width: (104 + extra) * scale, height: (102 + extra) * scale)
                    .offset(y: 16 * scale)
                Circle()
                    .fill(fill)
                    .frame(width: (58 + extra) * scale, height: (58 + extra) * scale)
                    .offset(x: -24 * scale, y: -18 * scale)
                Circle()
                    .fill(fill)
                    .frame(width: (58 + extra) * scale, height: (58 + extra) * scale)
                    .offset(x: 24 * scale, y: -18 * scale)
            }
        case .adult:
            ZStack {
                Ellipse()
                    .fill(fill)
                    .frame(width: (112 + extra) * scale, height: (118 + extra) * scale)
                    .offset(y: 18 * scale)
                Circle()
                    .fill(fill)
                    .frame(width: (62 + extra) * scale, height: (62 + extra) * scale)
                    .offset(x: -24 * scale, y: -24 * scale)
                Circle()
                    .fill(fill)
                    .frame(width: (62 + extra) * scale, height: (62 + extra) * scale)
                    .offset(x: 24 * scale, y: -24 * scale)
                Circle()
                    .fill(fill)
                    .frame(width: (34 + extra) * scale, height: (34 + extra) * scale)
                    .offset(y: -54 * scale)
            }
        case .old:
            ZStack {
                Ellipse()
                    .fill(fill)
                    .frame(width: (114 + extra) * scale, height: (112 + extra) * scale)
                    .offset(y: 24 * scale)
                Circle()
                    .fill(fill)
                    .frame(width: (60 + extra) * scale, height: (60 + extra) * scale)
                    .offset(x: -24 * scale, y: -16 * scale)
                Circle()
                    .fill(fill)
                    .frame(width: (60 + extra) * scale, height: (60 + extra) * scale)
                    .offset(x: 24 * scale, y: -16 * scale)
                Circle()
                    .fill(fill)
                    .frame(width: (30 + extra) * scale, height: (30 + extra) * scale)
                    .offset(y: -44 * scale)
            }
        }
    }
}

private struct AuriCreaturePalette {
    let outline: Color
    let body: Color
    let belly: Color
    let accent: Color
    let blush: Color
    let detail: Color
    let spot: Color
    let scarf: Color

    static func palette(for stage: AuriStage) -> AuriCreaturePalette {
        switch stage {
        case .baby:
            return AuriCreaturePalette(
                outline: Color(red: 0.29, green: 0.31, blue: 0.37),
                body: Color(red: 0.95, green: 0.90, blue: 0.97),
                belly: Color(red: 0.99, green: 0.97, blue: 0.93),
                accent: Color(red: 0.96, green: 0.72, blue: 0.82),
                blush: Color(red: 0.98, green: 0.73, blue: 0.80),
                detail: Color(red: 0.15, green: 0.18, blue: 0.21),
                spot: Color(red: 0.78, green: 0.84, blue: 0.98),
                scarf: Color(red: 0.95, green: 0.77, blue: 0.61)
            )
        case .kid:
            return AuriCreaturePalette(
                outline: Color(red: 0.24, green: 0.29, blue: 0.34),
                body: Color(red: 0.82, green: 0.94, blue: 0.98),
                belly: Color(red: 0.96, green: 0.99, blue: 0.99),
                accent: Color(red: 0.58, green: 0.82, blue: 0.98),
                blush: Color(red: 0.98, green: 0.76, blue: 0.82),
                detail: Color(red: 0.13, green: 0.17, blue: 0.20),
                spot: Color(red: 0.96, green: 0.82, blue: 0.58),
                scarf: Color(red: 0.96, green: 0.77, blue: 0.62)
            )
        case .adult:
            return AuriCreaturePalette(
                outline: Color(red: 0.19, green: 0.23, blue: 0.28),
                body: Color(red: 0.72, green: 0.90, blue: 0.89),
                belly: Color(red: 0.89, green: 0.97, blue: 0.95),
                accent: Color(red: 0.43, green: 0.72, blue: 0.78),
                blush: Color(red: 0.96, green: 0.71, blue: 0.79),
                detail: Color(red: 0.10, green: 0.13, blue: 0.16),
                spot: Color(red: 0.95, green: 0.79, blue: 0.56),
                scarf: Color(red: 0.96, green: 0.77, blue: 0.62)
            )
        case .old:
            return AuriCreaturePalette(
                outline: Color(red: 0.21, green: 0.23, blue: 0.28),
                body: Color(red: 0.86, green: 0.88, blue: 0.92),
                belly: Color(red: 0.96, green: 0.95, blue: 0.97),
                accent: Color(red: 0.69, green: 0.73, blue: 0.82),
                blush: Color(red: 0.94, green: 0.76, blue: 0.80),
                detail: Color(red: 0.12, green: 0.13, blue: 0.16),
                spot: Color(red: 0.78, green: 0.81, blue: 0.88),
                scarf: Color(red: 0.96, green: 0.77, blue: 0.62)
            )
        }
    }
}

private struct AuriCreatureFace: View {
    let mood: AuriMood
    let stage: AuriStage
    let palette: AuriCreaturePalette
    let scale: CGFloat

    var body: some View {
        ZStack {
            if mood != .gone {
                HStack(spacing: 34 * scale) {
                    eye
                    eye
                }
                .offset(y: -4 * scale)

                if mood == .bright || mood == .cozy || stage == .baby {
                    HStack(spacing: 52 * scale) {
                        Circle()
                            .fill(palette.blush.opacity(0.64))
                            .frame(width: 18 * scale, height: 10 * scale)
                        Circle()
                            .fill(palette.blush.opacity(0.64))
                            .frame(width: 18 * scale, height: 10 * scale)
                    }
                    .offset(y: 8 * scale)
                }

                mouth
                    .offset(y: 18 * scale)

                if stage == .old {
                    HStack(spacing: 34 * scale) {
                        Capsule(style: .continuous)
                            .fill(palette.detail.opacity(0.68))
                            .frame(width: 18 * scale, height: 4 * scale)
                            .rotationEffect(.degrees(-12))
                        Capsule(style: .continuous)
                            .fill(palette.detail.opacity(0.68))
                            .frame(width: 18 * scale, height: 4 * scale)
                            .rotationEffect(.degrees(12))
                    }
                    .offset(y: -18 * scale)
                }
            }
        }
    }

    private var eye: some View {
        Group {
            switch mood {
            case .sleepy:
                Capsule(style: .continuous)
                    .fill(palette.detail)
                    .frame(width: 16 * scale, height: 5 * scale)
            case .fading, .gone:
                Circle()
                    .fill(palette.detail.opacity(0.72))
                    .frame(width: 8 * scale, height: 8 * scale)
            default:
                ZStack {
                    Ellipse()
                        .fill(palette.detail)
                        .frame(width: 14 * scale, height: 18 * scale)
                    Circle()
                        .fill(.white.opacity(0.92))
                        .frame(width: 4 * scale, height: 4 * scale)
                        .offset(x: -2 * scale, y: -3 * scale)
                }
            }
        }
    }

    private var mouth: some View {
        Group {
            switch mood {
            case .bright:
                AuriMouthShape(curve: 0.72)
                    .stroke(palette.detail, lineWidth: 4 * scale)
                    .frame(width: 28 * scale, height: 18 * scale)
            case .needy:
                Circle()
                    .stroke(palette.detail, lineWidth: 3 * scale)
                    .frame(width: 10 * scale, height: 10 * scale)
            case .sleepy:
                Capsule(style: .continuous)
                    .fill(palette.detail.opacity(0.84))
                    .frame(width: 16 * scale, height: 4 * scale)
            case .fading, .gone:
                AuriMouthShape(curve: -0.54)
                    .stroke(palette.detail.opacity(0.84), lineWidth: 3.5 * scale)
                    .frame(width: 24 * scale, height: 16 * scale)
            default:
                AuriMouthShape(curve: 0.32)
                    .stroke(palette.detail, lineWidth: 3.5 * scale)
                    .frame(width: 24 * scale, height: 16 * scale)
            }
        }
    }
}

private struct EggCrackShape: Shape {
    let jitter: Double

    func path(in rect: CGRect) -> Path {
        let wiggle = CGFloat(jitter * 2.2)
        var path = Path()
        path.move(to: CGPoint(x: rect.minX + rect.width * 0.10, y: rect.midY - 3))
        path.addLine(to: CGPoint(x: rect.minX + rect.width * 0.26, y: rect.midY - 18 - wiggle))
        path.addLine(to: CGPoint(x: rect.minX + rect.width * 0.44, y: rect.midY + 6))
        path.addLine(to: CGPoint(x: rect.minX + rect.width * 0.60, y: rect.midY - 12))
        path.addLine(to: CGPoint(x: rect.minX + rect.width * 0.78, y: rect.midY + 8 + wiggle))
        path.addLine(to: CGPoint(x: rect.maxX - rect.width * 0.10, y: rect.midY - 4))
        return path
    }
}

private struct AuriMouthShape: Shape {
    let curve: CGFloat

    func path(in rect: CGRect) -> Path {
        var path = Path()
        let start = CGPoint(x: rect.minX + 2, y: rect.midY)
        let end = CGPoint(x: rect.maxX - 2, y: rect.midY)
        let control = CGPoint(x: rect.midX, y: rect.midY + (curve * rect.height * 0.6))
        path.move(to: start)
        path.addQuadCurve(to: end, control: control)
        return path
    }
}

private struct BowlShape: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.move(to: CGPoint(x: rect.minX + 6, y: rect.minY + 4))
        path.addQuadCurve(
            to: CGPoint(x: rect.maxX - 6, y: rect.minY + 4),
            control: CGPoint(x: rect.midX, y: rect.maxY)
        )
        path.addLine(to: CGPoint(x: rect.maxX - 14, y: rect.maxY - 4))
        path.addLine(to: CGPoint(x: rect.minX + 14, y: rect.maxY - 4))
        path.closeSubpath()
        return path
    }
}

private struct WaterDrop: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.move(to: CGPoint(x: rect.midX, y: rect.minY))
        path.addQuadCurve(
            to: CGPoint(x: rect.maxX, y: rect.midY),
            control: CGPoint(x: rect.maxX, y: rect.minY + 6)
        )
        path.addQuadCurve(
            to: CGPoint(x: rect.midX, y: rect.maxY),
            control: CGPoint(x: rect.maxX, y: rect.maxY - 2)
        )
        path.addQuadCurve(
            to: CGPoint(x: rect.minX, y: rect.midY),
            control: CGPoint(x: rect.minX, y: rect.maxY - 2)
        )
        path.addQuadCurve(
            to: CGPoint(x: rect.midX, y: rect.minY),
            control: CGPoint(x: rect.minX, y: rect.minY + 6)
        )
        return path
    }
}

private struct TrianglePointer: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.move(to: CGPoint(x: rect.minX, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.minX + 3, y: rect.maxY))
        path.closeSubpath()
        return path
    }
}
