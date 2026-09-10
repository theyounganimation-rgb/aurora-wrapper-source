import Foundation
import Observation
import SwiftUI
import UserNotifications

enum AuriRuntimeConfiguration {
    static let defaultChatProxyURLString = infoString("AURI_DEFAULT_CHAT_PROXY_URL")
    static let privacyPolicyURL = infoURL("AURI_PRIVACY_POLICY_URL")
    static let supportURL = infoURL("AURI_SUPPORT_URL")
    static let termsURL = infoURL("AURI_TERMS_URL")

    static var hasConfiguredChatProxy: Bool {
        !defaultChatProxyURLString.isEmpty
    }

    private static func infoString(_ key: String) -> String {
        guard let value = Bundle.main.object(forInfoDictionaryKey: key) as? String else {
            return ""
        }
        return value.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private static func infoURL(_ key: String) -> URL? {
        let value = infoString(key)
        guard !value.isEmpty else {
            return nil
        }
        return URL(string: value)
    }
}

enum AuriStage: String, Codable, CaseIterable, Sendable {
    case baby
    case kid
    case adult
    case old

    var title: String {
        switch self {
        case .baby:
            return "Baby"
        case .kid:
            return "Kid"
        case .adult:
            return "Adult"
        case .old:
            return "Old"
        }
    }
}

enum AuriMood: String, Codable, Sendable {
    case cozy
    case bright
    case needy
    case sleepy
    case fading
    case gone

    var title: String {
        switch self {
        case .cozy:
            return "Cozy"
        case .bright:
            return "Bright"
        case .needy:
            return "Needy"
        case .sleepy:
            return "Sleepy"
        case .fading:
            return "Fading"
        case .gone:
            return "Gone"
        }
    }

    var playerSummary: String {
        switch self {
        case .cozy:
            return "Auri is calm, stable, and idling comfortably."
        case .bright:
            return "Auri feels fully cared for. This is the strongest state for overall stability."
        case .needy:
            return "Care is slipping somewhere important. Food, water, cleanliness, medicine, or attention needs help."
        case .sleepy:
            return "Auri is low on energy or emotional warmth. Rest, affection, or play would help."
        case .fading:
            return "Auri is in serious trouble. Health or essentials are critically low."
        case .gone:
            return "Auri's life has ended."
        }
    }

    var tint: Color {
        switch self {
        case .cozy:
            return Color(red: 0.91, green: 0.88, blue: 0.98)
        case .bright:
            return Color(red: 0.99, green: 0.90, blue: 0.68)
        case .needy:
            return Color(red: 0.98, green: 0.80, blue: 0.66)
        case .sleepy:
            return Color(red: 0.83, green: 0.87, blue: 0.99)
        case .fading:
            return Color(red: 0.95, green: 0.74, blue: 0.72)
        case .gone:
            return Color(red: 0.78, green: 0.80, blue: 0.84)
        }
    }

    var symbolName: String {
        switch self {
        case .cozy:
            return "sparkles"
        case .bright:
            return "sun.max.fill"
        case .needy:
            return "bell.badge.fill"
        case .sleepy:
            return "moon.stars.fill"
        case .fading:
            return "heart.slash.fill"
        case .gone:
            return "leaf.fill"
        }
    }
}

enum AuriDeathCause: String, Codable, Sendable {
    case neglect
    case oldAge
}

enum AuriDisciplineReason: String, Codable, Sendable {
    case falseAlarm
    case refusesMeal
    case refusesPlay

    var title: String {
        switch self {
        case .falseAlarm:
            return "False Alarm"
        case .refusesMeal:
            return "Refusing Meals"
        case .refusesPlay:
            return "Refusing Play"
        }
    }

    var summary: String {
        switch self {
        case .falseAlarm:
            return "Auri is calling out even though it is full and comfortable."
        case .refusesMeal:
            return "Auri is refusing to eat while hungry."
        case .refusesPlay:
            return "Auri is refusing to play even though the mood needs help."
        }
    }
}

enum AuriEventKind: String, Sendable, Codable {
    case hatch
    case feed
    case water
    case play
    case affection
    case treat
    case lights
    case sleep
    case poop
    case clean
    case sickness
    case medicine
    case discipline
    case message
    case reply
    case evolve
    case death

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        let rawValue = try container.decode(String.self)

        switch rawValue {
        case "petting":
            self = .affection
        case "hatch", "feed", "water", "play", "affection", "treat", "lights", "sleep", "poop", "clean", "sickness", "medicine", "discipline", "message", "reply", "evolve", "death":
            guard let kind = AuriEventKind(rawValue: rawValue) else {
                throw DecodingError.dataCorruptedError(in: container, debugDescription: "Unsupported Auri event kind.")
            }
            self = kind
        default:
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Unsupported Auri event kind.")
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(rawValue)
    }
}

enum AuriEffectKind: String, Sendable, Codable {
    case hatch
    case feed
    case water
    case play
    case affection
    case treat
    case lights
    case sleep
    case clean
    case medicine
    case attention
    case discipline
    case message

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        let rawValue = try container.decode(String.self)

        switch rawValue {
        case "petting":
            self = .affection
        case "hatch", "feed", "water", "play", "affection", "treat", "lights", "sleep", "clean", "medicine", "attention", "discipline", "message":
            guard let kind = AuriEffectKind(rawValue: rawValue) else {
                throw DecodingError.dataCorruptedError(in: container, debugDescription: "Unsupported Auri effect kind.")
            }
            self = kind
        default:
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Unsupported Auri effect kind.")
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(rawValue)
    }

    var duration: TimeInterval {
        switch self {
        case .hatch:
            return 1.8
        case .feed:
            return 1.2
        case .water:
            return 1.3
        case .play:
            return 1.6
        case .affection:
            return 1.15
        case .treat:
            return 1.25
        case .lights:
            return 1.1
        case .sleep:
            return 1.8
        case .clean:
            return 1.35
        case .medicine:
            return 1.4
        case .attention:
            return 1.2
        case .discipline:
            return 1.3
        case .message:
            return 1.45
        }
    }
}

enum AuriFoodItem: String, CaseIterable, Identifiable, Sendable {
    case mealBowl
    case berryBits
    case soupCup
    case waterBottle
    case coffee

    var id: String { rawValue }

    var title: String {
        switch self {
        case .mealBowl:
            return "Burger"
        case .berryBits:
            return "Parfait"
        case .soupCup:
            return "Ramen"
        case .waterBottle:
            return "Water Bottle"
        case .coffee:
            return "Coffee"
        }
    }

    var subtitle: String {
        switch self {
        case .mealBowl:
            return "Big hunger boost"
        case .berryBits:
            return "Sweet creamy treat"
        case .soupCup:
            return "Warm and savory"
        case .waterBottle:
            return "Hydration first"
        case .coffee:
            return "Temporary energy boost"
        }
    }
}

enum AuriMedicineItem: String, CaseIterable, Identifiable, Sendable {
    case capsule
    case syrup
    case coolPatch

    var id: String { rawValue }

    var title: String {
        switch self {
        case .capsule:
            return "Painkillers"
        case .syrup:
            return "Gingerale"
        case .coolPatch:
            return "Cough Syrup"
        }
    }

    var subtitle: String {
        switch self {
        case .capsule:
            return "Pain relief support"
        case .syrup:
            return "Calming ginger fizz"
        case .coolPatch:
            return "Soothing cough relief"
        }
    }
}

enum AuriChatRole: String, Sendable, Codable {
    case user
    case auri

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        let rawValue = try container.decode(String.self)

        switch rawValue {
        case "user":
            self = .user
        case "auri", "assistant", "pet":
            self = .auri
        default:
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Unsupported Auri chat role.")
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(rawValue)
    }
}

struct AuriEvent: Codable, Identifiable, Hashable, Sendable {
    let id: UUID
    let kind: AuriEventKind
    let date: Date
    let summary: String
}

struct AuriChatLine: Codable, Identifiable, Hashable, Sendable {
    let id: UUID
    let role: AuriChatRole
    let text: String
    let date: Date
}

struct AuriEffectSnapshot: Sendable {
    let kind: AuriEffectKind
    let progress: Double
    let foodItem: AuriFoodItem?
    let medicineItem: AuriMedicineItem?
}

private struct AuriTimedEffect: Codable, Sendable {
    let kind: AuriEffectKind
    let startedAt: Date
}

private struct AuriSaveState: Codable {
    var name: String
    var humanName: String?
    var ownerProfile: AuriHumanProfile?
    var lifeID: String?
    var hasChosenName: Bool?
    var createdAt: Date
    var lastUpdatedAt: Date
    var hasHatched: Bool
    var stage: AuriStage
    var growth: Double
    var food: Double
    var water: Double
    var attention: Double
    var joy: Double
    var health: Double?
    var rest: Double?
    var discipline: Double?
    var weightOffset: Double?
    var poopCount: Int?
    var lightsOff: Bool?
    var isSleeping: Bool?
    var medicineDosesRemaining: Int?
    var caffeineUntil: Date?
    var disciplineReason: AuriDisciplineReason?
    var lastFedAt: Date
    var lastHydratedAt: Date
    var lastPlayedAt: Date
    var lastAttentionAt: Date
    var lastAffectionRewardAt: Date?
    var lastPoopedAt: Date?
    var lastPoopOpportunityAt: Date?
    var deathCause: AuriDeathCause?
    var diedAt: Date?
    var pendingDeathExplanation: String?
    var relationshipBond: Double?
    var relationshipRomance: Double?
    var relationshipStrain: Double?
    var proxyURLString: String
    var hasCustomizedProxy: Bool?
    var events: [AuriEvent]
    var conversation: [AuriChatLine]
}

struct AuriAvatarCatalogEntry: Identifiable, Hashable, Sendable {
    let id: String
    let title: String
    let subtitle: String
    let modelRelativePath: String
    let cost: Int
    let startingUnlocked: Bool
}

struct AuriOutfitCatalogEntry: Identifiable, Hashable, Sendable {
    let id: String
    let title: String
    let subtitle: String
    let modelRelativePath: String
    let cost: Int
    let startingUnlocked: Bool
}

struct AuriBirthday: Codable, Hashable, Sendable {
    var month: Int
    var day: Int
    var year: Int
}

struct AuriHumanProfile: Codable, Hashable, Sendable {
    var fullName: String
    var pronouns: String
    var birthday: AuriBirthday
    var coreValues: [String]
    var interests: [String]

    var firstName: String {
        fullName.split(separator: " ").first.map(String.init) ?? fullName
    }
}

enum AuriRelationshipKind: String, Codable, Sendable {
    case friendship
    case romance
    case negative

    var tint: Color {
        switch self {
        case .friendship:
            return Color(red: 0.43, green: 0.67, blue: 0.98)
        case .romance:
            return Color(red: 0.97, green: 0.54, blue: 0.77)
        case .negative:
            return Color(red: 0.92, green: 0.36, blue: 0.38)
        }
    }

    var title: String {
        switch self {
        case .friendship:
            return "Friendship"
        case .romance:
            return "Romance"
        case .negative:
            return "Strain"
        }
    }
}

struct AuriRelationshipState: Codable, Hashable, Sendable {
    let id: String
    let title: String
    let subtitle: String
    let kind: AuriRelationshipKind
    let progress: Double
    let bond: Double
    let romance: Double
    let strain: Double
}

struct AuriRelationshipCatalogEntry: Identifiable, Hashable, Sendable {
    let id: String
    let title: String
    let subtitle: String
    let promptDescription: String
    let cost: Int
    let startingUnlocked: Bool
}

private struct AuriPlayerProfileState: Codable {
    var coins: Int
    var ownedAvatarIDs: [String]
    var selectedAvatarID: String?
    var ownedOutfitIDs: [String]?
    var selectedOutfitID: String?
    var unlockedRelationshipIDs: [String]
    var selectedRelationshipID: String?
    var lastOnboardingProfile: AuriHumanProfile?
    var lastPassiveCoinGrantAt: Date?
}

private struct AuriProxyAuriState: Codable {
    let name: String
    let stage: String
    let mood: String
    let ageDays: Double
    let heightInches: Double
    let food: Double
    let water: Double
    let attention: Double
    let joy: Double
    let growth: Double
    let health: Double
    let discipline: Double
    let hunger: Double
    let tired: Double
    let wantsSleep: Bool
    let weightOunces: Double
    let dirtyLevel: Int
    let poopCount: Int
    let sleeping: Bool
    let lightsOff: Bool
    let sick: Bool
    let medicineDosesRemaining: Int
    let needsAttention: Bool
    let needsDiscipline: Bool
    let alive: Bool
}

private struct AuriProxyEvent: Codable {
    let kind: String
    let summary: String
    let date: Date
}

private struct AuriProxyMessage: Codable {
    let role: String
    let text: String
}

private struct AuriProxyRequest: Codable {
    let message: String
    let lifeID: String
    let humanName: String?
    let humanProfile: AuriHumanProfile?
    let relationshipStatus: AuriProxyRelationshipState
    let auriState: AuriProxyAuriState
    let recentEvents: [AuriProxyEvent]
    let conversation: [AuriProxyMessage]
}

private struct AuriProxyRelationshipState: Codable {
    let id: String
    let title: String
    let subtitle: String
    let kind: AuriRelationshipKind
    let progress: Double
    let friendship: Double
    let romance: Double
    let tension: Double
}

private struct AuriProxyResetRequest: Codable {
    let lifeID: String
}

private struct AuriProxyReplyEnvelope: Codable {
    let reply: String
    let model: String?
}

enum AuriRemoteChessColor: String, Codable, CaseIterable, Sendable {
    case white
    case black

    var title: String {
        switch self {
        case .white:
            return "White"
        case .black:
            return "Black"
        }
    }
}

enum AuriRemoteChessStatus: String, Codable, Sendable {
    case active
    case checkmate
    case stalemate
    case draw
    case resigned

    var title: String {
        switch self {
        case .active:
            return "In Progress"
        case .checkmate:
            return "Checkmate"
        case .stalemate:
            return "Stalemate"
        case .draw:
            return "Draw"
        case .resigned:
            return "Resigned"
        }
    }
}

enum AuriRemoteChessResult: String, Codable, Sendable {
    case humanWin = "human_win"
    case auriWin = "auri_win"
    case draw
}

struct AuriRemoteChessAnalysis: Codable, Hashable, Sendable {
    let depth: Int?
    let scoreCp: Int?
    let mate: Int?
    let bestMove: String?
    let ponder: String?
}

struct AuriRemoteChessPiece: Codable, Hashable, Identifiable, Sendable {
    let square: String
    let color: AuriRemoteChessColor
    let kind: String

    var id: String { square }
}

struct AuriRemoteChessLegalMove: Codable, Hashable, Identifiable, Sendable {
    let from: String
    let to: String
    let san: String
    let uci: String
    let promotion: String?

    var id: String { uci }
}

struct AuriRemoteChessRecentMove: Codable, Hashable, Identifiable, Sendable {
    let san: String
    let uci: String
    let by: String
    let color: AuriRemoteChessColor
    let moveNumber: Int

    var id: String { "\(moveNumber)-\(uci)" }
}

struct AuriRemoteChessGame: Codable, Sendable {
    let lifeID: String
    let status: AuriRemoteChessStatus
    let result: AuriRemoteChessResult?
    let playerColor: AuriRemoteChessColor
    let auriColor: AuriRemoteChessColor
    let turn: AuriRemoteChessColor
    let currentTurn: String
    let fen: String
    let pgn: String
    let inCheck: Bool
    let moveCount: Int
    let rewardPending: Bool
    let createdAt: Date
    let updatedAt: Date
    let finishedAt: Date?
    let lastMoveUCI: String?
    let lastMoveSAN: String?
    let analysis: AuriRemoteChessAnalysis?
    let board: [AuriRemoteChessPiece]
    let legalMoves: [AuriRemoteChessLegalMove]
    let recentMoves: [AuriRemoteChessRecentMove]

    var hasEnded: Bool {
        result != nil || status != .active
    }

    var outcomeTitle: String {
        switch result {
        case .humanWin:
            return "You beat Auri"
        case .auriWin:
            return status == .resigned ? "You resigned" : "Auri won"
        case .draw:
            return "Draw"
        case .none:
            return status.title
        }
    }
}

private struct AuriProxyChessRequest: Codable {
    let action: String
    let lifeID: String
    let playerColor: AuriRemoteChessColor?
    let from: String?
    let to: String?
    let promotion: String?
}

private struct AuriProxyChessEnvelope: Codable {
    let game: AuriRemoteChessGame?
}

enum AuriRemoteConnect4Status: String, Codable, Sendable {
    case active
    case connected
    case draw
    case resigned

    var title: String {
        switch self {
        case .active:
            return "In Progress"
        case .connected:
            return "Connect 4"
        case .draw:
            return "Draw"
        case .resigned:
            return "Resigned"
        }
    }
}

enum AuriRemoteConnect4Result: String, Codable, Sendable {
    case humanWin = "human_win"
    case auriWin = "auri_win"
    case draw
}

enum AuriRemoteConnect4Player: String, Codable, Sendable {
    case human
    case auri

    var title: String {
        switch self {
        case .human:
            return "You"
        case .auri:
            return "Auri"
        }
    }
}

struct AuriRemoteConnect4Token: Codable, Hashable, Identifiable, Sendable {
    let row: Int
    let column: Int
    let player: AuriRemoteConnect4Player

    var id: String { "\(row)-\(column)" }
}

struct AuriRemoteConnect4Cell: Codable, Hashable, Identifiable, Sendable {
    let row: Int
    let column: Int

    var id: String { "\(row)-\(column)" }
}

struct AuriRemoteConnect4RecentMove: Codable, Hashable, Identifiable, Sendable {
    let column: Int
    let row: Int
    let by: AuriRemoteConnect4Player
    let moveNumber: Int

    var id: String { "\(moveNumber)-\(column)-\(row)" }
}

struct AuriRemoteConnect4Game: Codable, Sendable {
    let lifeID: String
    let status: AuriRemoteConnect4Status
    let result: AuriRemoteConnect4Result?
    let currentTurn: AuriRemoteConnect4Player
    let humanStarts: Bool
    let rows: Int
    let columns: Int
    let moveCount: Int
    let rewardPending: Bool
    let createdAt: Date
    let updatedAt: Date
    let finishedAt: Date?
    let lastMoveColumn: Int?
    let lastMoveRow: Int?
    let board: [AuriRemoteConnect4Token]
    let legalColumns: [Int]
    let winningCells: [AuriRemoteConnect4Cell]
    let recentMoves: [AuriRemoteConnect4RecentMove]

    var hasEnded: Bool {
        result != nil || status != .active
    }

    var outcomeTitle: String {
        switch result {
        case .humanWin:
            return "You beat Auri"
        case .auriWin:
            return status == .resigned ? "You resigned" : "Auri won"
        case .draw:
            return "Draw"
        case .none:
            return status.title
        }
    }
}

private struct AuriProxyConnect4Request: Codable {
    let action: String
    let lifeID: String
    let humanStarts: Bool?
    let column: Int?
}

private struct AuriProxyConnect4Envelope: Codable {
    let game: AuriRemoteConnect4Game?
}

private enum AuriMiniGameFlowError: LocalizedError {
    case unavailable(String)

    var errorDescription: String? {
        switch self {
        case .unavailable(let message):
            return message
        }
    }
}

private struct AuriChatContext {
    let name: String
    let humanName: String?
    let ownerProfile: AuriHumanProfile?
    let lifeID: String
    let relationshipStatus: AuriProxyRelationshipState
    let stage: AuriStage
    let mood: AuriMood
    let ageDays: Double
    let heightInches: Double
    let food: Double
    let water: Double
    let attention: Double
    let joy: Double
    let growth: Double
    let health: Double
    let discipline: Double
    let hunger: Double
    let tired: Double
    let wantsSleep: Bool
    let weightOunces: Double
    let dirtyLevel: Int
    let isSleeping: Bool
    let lightsOff: Bool
    let medicineDosesRemaining: Int
    let needsAttention: Bool
    let needsDiscipline: Bool
    let isAlive: Bool
    let proxyURLString: String
    let recentEvents: [AuriEvent]
    let conversation: [AuriChatLine]
}

private enum AuriNotificationScheduler {
    static let attentionIdentifier = "auri.attention"
    static let criticalHealthIdentifier = "auri.critical-health"

    static func requestAuthorizationIfNeeded() async {
        let center = UNUserNotificationCenter.current()
        _ = await withCheckedContinuation { continuation in
            center.requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
                continuation.resume(returning: granted)
            }
        }
    }

    static func syncAttentionNotification(name: String, body: String?, after delay: TimeInterval?) async {
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: [attentionIdentifier])
        center.removeDeliveredNotifications(withIdentifiers: [attentionIdentifier])

        guard let body, let delay else {
            return
        }

        let content = UNMutableNotificationContent()
        content.title = "\(name) needs attention"
        content.body = body
        content.sound = .default

        let request = UNNotificationRequest(
            identifier: attentionIdentifier,
            content: content,
            trigger: UNTimeIntervalNotificationTrigger(timeInterval: max(5, delay), repeats: false)
        )

        await withCheckedContinuation { continuation in
            center.add(request) { _ in
                continuation.resume()
            }
        }
    }

    static func syncCriticalHealthNotification(name: String, body: String?, after delay: TimeInterval?) async {
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: [criticalHealthIdentifier])
        center.removeDeliveredNotifications(withIdentifiers: [criticalHealthIdentifier])

        guard let body, let delay else {
            return
        }

        let content = UNMutableNotificationContent()
        content.title = "\(name) is in danger"
        content.body = body
        content.sound = .default

        let request = UNNotificationRequest(
            identifier: criticalHealthIdentifier,
            content: content,
            trigger: UNTimeIntervalNotificationTrigger(timeInterval: max(5, delay), repeats: false)
        )

        await withCheckedContinuation { continuation in
            center.add(request) { _ in
                continuation.resume()
            }
        }
    }
}

@MainActor
@Observable
final class AuriStore {
    static let defaultProxyURLString = AuriRuntimeConfiguration.defaultChatProxyURLString
    static let eggIncubationDuration: TimeInterval = 180
    private static let clockSliceDuration: TimeInterval = 900
    private static let unifiedStage: AuriStage = .baby
    private static let startingCoins = 120
    private static let attentionDecayPerMinute = 0.005
    private static let awakeRestDrainPerHour = 0.058
    private static let lateNightRestDrainPerHour = 0.012
    private static let overtiredRestDrainPerHour = 0.004
    private static let brightRoomRestDrainPerHour = 0.014
    private static let darkSleepRecoveryPerHour = 0.15
    private static let litSleepRecoveryPerHour = 0.08
    private static let passiveStarsInterval: TimeInterval = 7_200
    private static let coffeeAlertnessDuration: TimeInterval = 5_400
    private static let coffeeMaxAlertnessBoost = 0.22
    private static let avatarCatalog: [AuriAvatarCatalogEntry] = [
        .init(
            id: "classic_auri",
            title: "Auri",
            subtitle: "The original Auri look.",
            modelRelativePath: "auri-avatar.vrm",
            cost: 0,
            startingUnlocked: true
        ),
        .init(
            id: "sofi",
            title: "Sofi",
            subtitle: "A bundled look with its own mood.",
            modelRelativePath: "avatars/sofi.vrm",
            cost: 0,
            startingUnlocked: true
        ),
        .init(
            id: "gari",
            title: "Gari",
            subtitle: "A warmer alternate style.",
            modelRelativePath: "avatars/gari.vrm",
            cost: 0,
            startingUnlocked: true
        ),
        .init(
            id: "gauri",
            title: "Gauri",
            subtitle: "A more dramatic alternate presence.",
            modelRelativePath: "avatars/gauri.vrm",
            cost: 0,
            startingUnlocked: true
        ),
        .init(
            id: "aori",
            title: "Aori",
            subtitle: "A polished alternate roster look.",
            modelRelativePath: "avatars/aori.vrm",
            cost: 0,
            startingUnlocked: true
        )
    ]
    private static let outfitCatalog: [AuriOutfitCatalogEntry] = [
        .init(
            id: "workout",
            title: "Workout",
            subtitle: "A sporty outfit swap for active days.",
            modelRelativePath: "avatars/auri-workout.vrm",
            cost: 140,
            startingUnlocked: false
        ),
        .init(
            id: "sleepwear",
            title: "Sleepwear",
            subtitle: "A softer late-night outfit for winding down.",
            modelRelativePath: "avatars/auri-sleepwear.vrm",
            cost: 120,
            startingUnlocked: false
        )
    ]
    private static let relationshipCatalog: [AuriRelationshipCatalogEntry] = [
        .init(
            id: "friend",
            title: "Friend",
            subtitle: "Warm, close, and easygoing.",
            promptDescription: "The human is framed as a trusted friend.",
            cost: 0,
            startingUnlocked: true
        ),
        .init(
            id: "bestfriend",
            title: "Best Friend",
            subtitle: "Extra close, playful, and deeply familiar.",
            promptDescription: "The human is framed as a best friend.",
            cost: 0,
            startingUnlocked: true
        ),
        .init(
            id: "mentor",
            title: "Mentor",
            subtitle: "Grounded, admiring, and guided.",
            promptDescription: "The human is framed as a mentor figure.",
            cost: 0,
            startingUnlocked: true
        ),
        .init(
            id: "girlfriend",
            title: "Girlfriend",
            subtitle: "Playful, affectionate, and romantic.",
            promptDescription: "The human is framed as a girlfriend.",
            cost: 0,
            startingUnlocked: true
        ),
        .init(
            id: "boyfriend",
            title: "Boyfriend",
            subtitle: "Playful, affectionate, and romantic.",
            promptDescription: "The human is framed as a boyfriend.",
            cost: 0,
            startingUnlocked: true
        ),
        .init(
            id: "wife",
            title: "Wife",
            subtitle: "Deeply committed and intimate.",
            promptDescription: "The human is framed as a wife.",
            cost: 0,
            startingUnlocked: true
        ),
        .init(
            id: "husband",
            title: "Husband",
            subtitle: "Deeply committed and intimate.",
            promptDescription: "The human is framed as a husband.",
            cost: 0,
            startingUnlocked: true
        )
    ]
    private static let romanticPhrases = [
        "love you", "date you", "kiss you", "kiss me", "cuddle", "romantic", "crush", "flirt", "girlfriend", "boyfriend",
        "wife", "husband", "babe", "baby", "beautiful", "pretty", "gorgeous", "hot", "sexy", "cutie"
    ]
    private static let supportivePhrases = [
        "thank you", "thanks", "missed you", "miss you", "proud of you", "appreciate you", "care about you", "glad to see you",
        "happy to see you", "wanted you", "here for you", "with you"
    ]
    private static let friendshipPhrases = [
        "friend", "friends", "best friend", "bestie", "buddy", "pal", "glad we're friends", "glad we are friends", "hang out",
        "lets hang", "let's hang", "lets play", "let's play", "good friend"
    ]
    private static let repairPhrases = [
        "i'm sorry", "im sorry", "sorry", "forgive me", "didn't mean", "didnt mean", "my bad", "i apologize", "apologize"
    ]
    private static let harshPhrases = [
        "hate you", "shut up", "leave me alone", "don't care about you", "dont care about you", "you're annoying", "youre annoying",
        "you are annoying", "stupid", "idiot", "dumb", "ugly", "worthless", "pathetic", "boring", "go away"
    ]

    var name: String
    var humanName: String?
    var ownerProfile: AuriHumanProfile?
    var lifeID: String
    var hasChosenName: Bool
    var createdAt: Date
    var lastUpdatedAt: Date
    var hasHatched: Bool
    var stage: AuriStage
    var growth: Double
    var food: Double
    var water: Double
    var attention: Double
    var joy: Double
    var health: Double
    var rest: Double
    var discipline: Double
    var weightOffset: Double
    var dirtyLevel: Int
    var lightsOff: Bool
    var isSleeping: Bool
    var medicineDosesRemaining: Int
    var caffeineUntil: Date?
    var disciplineReason: AuriDisciplineReason?
    var lastFedAt: Date
    var lastHydratedAt: Date
    var lastPlayedAt: Date
    var lastAttentionAt: Date
    var lastAffectionRewardAt: Date?
    var lastGotDirtyAt: Date
    var lastDirtyOpportunityAt: Date
    var deathCause: AuriDeathCause?
    var diedAt: Date?
    var pendingDeathExplanation: String?
    var proxyURLString: String
    var hasCustomizedProxy: Bool
    var events: [AuriEvent]
    var conversation: [AuriChatLine]
    var coins: Int
    var ownedAvatarIDs: Set<String>
    var selectedAvatarID: String
    var ownedOutfitIDs: Set<String>
    var selectedOutfitID: String?
    var unlockedRelationshipIDs: Set<String>
    var selectedRelationshipID: String
    var relationshipBond: Double
    var relationshipRomance: Double
    var relationshipStrain: Double
    var lastOnboardingProfile: AuriHumanProfile?
    var lastPassiveCoinGrantAt: Date
    var draftMessage = ""
    var errorMessage: String?
    var isSending = false
    var shouldPromptWakeForMessage = false

    private var activeTimedEffect: AuriTimedEffect?
    private var activeFoodEffectItem: AuriFoodItem?
    private var activeMedicineEffectItem: AuriMedicineItem?
    private var tickerTask: Task<Void, Never>?
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()
    private var hasRequestedNotificationAuthorization = false
    private var lastAttentionNotificationSignature: String?
    private var lastCriticalHealthNotificationSignature: String?

    init() {
        encoder.dateEncodingStrategy = .iso8601
        decoder.dateDecodingStrategy = .iso8601
        let launchDate = Date()
        let loadedProfile = Self.loadProfile(decoder: decoder)
        let normalizedOwnedAvatarIDs = Self.normalizedOwnedAvatarIDs(from: loadedProfile?.ownedAvatarIDs ?? [])
        let normalizedOwnedOutfitIDs = Self.normalizedOwnedOutfitIDs(from: loadedProfile?.ownedOutfitIDs ?? [])
        let normalizedUnlockedRelationshipIDs = Self.normalizedUnlockedRelationshipIDs(from: loadedProfile?.unlockedRelationshipIDs ?? [])
        let resolvedSelectedAvatarID = Self.resolvedSelectedAvatarID(
            requestedID: loadedProfile?.selectedAvatarID,
            ownedAvatarIDs: normalizedOwnedAvatarIDs
        )
        let resolvedSelectedOutfitID = Self.resolvedSelectedOutfitID(
            requestedID: loadedProfile?.selectedOutfitID,
            ownedOutfitIDs: normalizedOwnedOutfitIDs
        )
        let resolvedSelectedRelationshipID = Self.resolvedSelectedRelationshipID(
            requestedID: loadedProfile?.selectedRelationshipID,
            unlockedRelationshipIDs: normalizedUnlockedRelationshipIDs
        )
        let normalizedLastOnboardingProfile = Self.normalizedOwnerProfile(loadedProfile?.lastOnboardingProfile)

        if let saved = Self.load(decoder: decoder) {
            let savedHasChosenName = saved.hasChosenName ?? false
            let normalizedSavedOwnerProfile = Self.normalizedOwnerProfile(saved.ownerProfile) ?? (savedHasChosenName ? normalizedLastOnboardingProfile : nil)
            let resolvedHumanName = normalizedSavedOwnerProfile?.firstName
                ?? (saved.humanName?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false ? saved.humanName : nil)

            name = savedHasChosenName ? saved.name : ""
            ownerProfile = normalizedSavedOwnerProfile
            humanName = resolvedHumanName
            lifeID = saved.lifeID?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false ? saved.lifeID! : UUID().uuidString
            hasChosenName = savedHasChosenName
            createdAt = saved.createdAt
            lastUpdatedAt = saved.lastUpdatedAt
            hasHatched = true
            stage = Self.unifiedStage
            growth = saved.growth
            food = saved.food
            water = saved.water
            attention = saved.attention
            joy = saved.joy
            health = saved.health ?? 0.9
            rest = saved.rest ?? 0.82
            discipline = saved.discipline ?? (saved.hasHatched ? 0.12 : 0)
            weightOffset = saved.weightOffset ?? 0
            dirtyLevel = max(0, saved.poopCount ?? 0)
            lightsOff = saved.lightsOff ?? false
            isSleeping = saved.isSleeping ?? false
            medicineDosesRemaining = max(0, saved.medicineDosesRemaining ?? 0)
            caffeineUntil = saved.caffeineUntil
            disciplineReason = saved.disciplineReason
            lastFedAt = saved.lastFedAt
            lastHydratedAt = saved.lastHydratedAt
            lastPlayedAt = saved.lastPlayedAt
            lastAttentionAt = saved.lastAttentionAt
            lastAffectionRewardAt = saved.lastAffectionRewardAt
            lastGotDirtyAt = saved.lastPoopedAt ?? saved.lastUpdatedAt
            lastDirtyOpportunityAt = saved.lastPoopOpportunityAt ?? saved.lastPoopedAt ?? saved.lastUpdatedAt
            deathCause = saved.deathCause
            diedAt = saved.diedAt
            pendingDeathExplanation = saved.pendingDeathExplanation
            proxyURLString = Self.defaultProxyURLString
            hasCustomizedProxy = false
            events = saved.events
            conversation = saved.conversation
            coins = max(0, loadedProfile?.coins ?? Self.startingCoins)
            ownedAvatarIDs = normalizedOwnedAvatarIDs
            selectedAvatarID = resolvedSelectedAvatarID
            ownedOutfitIDs = normalizedOwnedOutfitIDs
            selectedOutfitID = resolvedSelectedOutfitID
            unlockedRelationshipIDs = normalizedUnlockedRelationshipIDs
            selectedRelationshipID = resolvedSelectedRelationshipID
            relationshipBond = min(max(saved.relationshipBond ?? 0.08, 0), 1)
            relationshipRomance = min(max(saved.relationshipRomance ?? 0, 0), 1)
            relationshipStrain = min(max(saved.relationshipStrain ?? 0, 0), 1)
            lastOnboardingProfile = normalizedLastOnboardingProfile
            lastPassiveCoinGrantAt = loadedProfile?.lastPassiveCoinGrantAt ?? launchDate
        } else {
            let now = Date()
            name = ""
            humanName = nil
            ownerProfile = nil
            lifeID = UUID().uuidString
            hasChosenName = false
            createdAt = now
            lastUpdatedAt = now
            hasHatched = true
            stage = Self.unifiedStage
            growth = 0
            food = 0.86
            water = 0.84
            attention = 0.78
            joy = 0.75
            health = 0.92
            rest = 0.82
            discipline = 0
            weightOffset = 0
            dirtyLevel = 0
            lightsOff = false
            isSleeping = false
            medicineDosesRemaining = 0
            caffeineUntil = nil
            disciplineReason = nil
            lastFedAt = now
            lastHydratedAt = now
            lastPlayedAt = now
            lastAttentionAt = now
            lastAffectionRewardAt = nil
            lastGotDirtyAt = now
            lastDirtyOpportunityAt = now
            deathCause = nil
            diedAt = nil
            pendingDeathExplanation = nil
            proxyURLString = Self.defaultProxyURLString
            hasCustomizedProxy = false
            events = []
            conversation = []
            coins = max(0, loadedProfile?.coins ?? Self.startingCoins)
            ownedAvatarIDs = normalizedOwnedAvatarIDs
            selectedAvatarID = resolvedSelectedAvatarID
            ownedOutfitIDs = normalizedOwnedOutfitIDs
            selectedOutfitID = resolvedSelectedOutfitID
            unlockedRelationshipIDs = normalizedUnlockedRelationshipIDs
            selectedRelationshipID = resolvedSelectedRelationshipID
            relationshipBond = 0.08
            relationshipRomance = 0
            relationshipStrain = 0
            lastOnboardingProfile = normalizedLastOnboardingProfile
            lastPassiveCoinGrantAt = loadedProfile?.lastPassiveCoinGrantAt ?? launchDate
        }

        advanceClock(to: Date())
        persist()
    }

    var isAlive: Bool {
        health > 0.0001 && deathCause == nil
    }

    var hasPendingDeathExplanation: Bool {
        pendingDeathExplanation?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false
    }

    var ageDays: Double {
        max(0, Date().timeIntervalSince(createdAt) / 86_400)
    }

    var eggIncubationProgress: Double {
        1
    }

    var eggCountdownLabel: String {
        "0:00"
    }

    var stageLabel: String {
        "Auri"
    }

    var displayName: String {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? "Auri" : trimmed
    }

    private static func newbornIntroduction(for auriName: String, humanFirstName: String?) -> String {
        if let humanFirstName, !humanFirstName.isEmpty {
            return "I think I was just born. I like how \(auriName) sounds already. Hi \(humanFirstName)."
        }

        return "I think I was just born. I like how \(auriName) sounds already."
    }

    var ageLabel: String {
        let days = max(1, Int(floor(ageDays)) + 1)
        return "Day \(days)"
    }

    var coinLabel: String {
        "\(coins)"
    }

    var coinBalanceLine: String {
        coins == 1 ? "1 Star" : "\(coins) Stars"
    }

    var wardrobeCatalog: [AuriAvatarCatalogEntry] {
        Self.avatarCatalog
    }

    var outfitCatalog: [AuriOutfitCatalogEntry] {
        Self.outfitCatalog
    }

    var relationshipCatalog: [AuriRelationshipCatalogEntry] {
        Self.relationshipCatalog
    }

    var ownedWardrobeEntries: [AuriAvatarCatalogEntry] {
        Self.avatarCatalog.filter { ownedAvatarIDs.contains($0.id) }
    }

    var selectedAvatarEntry: AuriAvatarCatalogEntry {
        Self.avatarEntry(for: selectedAvatarID) ?? Self.avatarCatalog[0]
    }

    var selectedBaseAvatarRelativePath: String {
        selectedAvatarEntry.modelRelativePath
    }

    var ownedOutfitEntries: [AuriOutfitCatalogEntry] {
        Self.outfitCatalog.filter { ownedOutfitIDs.contains($0.id) }
    }

    var selectedOutfitEntry: AuriOutfitCatalogEntry? {
        guard let selectedOutfitID else {
            return nil
        }
        return Self.outfitEntry(for: selectedOutfitID)
    }

    var selectedAvatarRelativePath: String {
        selectedOutfitEntry?.modelRelativePath ?? selectedBaseAvatarRelativePath
    }

    var activeLookTitle: String {
        selectedOutfitEntry?.title ?? selectedAvatarEntry.title
    }

    var currentRelationshipState: AuriRelationshipState {
        let bond = clamp(relationshipBond)
        let romance = clamp(relationshipRomance)
        let strain = clamp(relationshipStrain)

        if strain >= 0.68 || (strain >= 0.48 && strain > bond + 0.08) {
            switch strain {
            case ..<0.62:
                return AuriRelationshipState(
                    id: "negative-tense",
                    title: "Tense",
                    subtitle: "There is hurt building here, and Auri feels it.",
                    kind: .negative,
                    progress: clamp((strain - 0.25) / 0.43),
                    bond: bond,
                    romance: romance,
                    strain: strain
                )
            case ..<0.82:
                return AuriRelationshipState(
                    id: "negative-strained",
                    title: "Strained",
                    subtitle: "The connection feels bruised and needs gentleness to recover.",
                    kind: .negative,
                    progress: clamp((strain - 0.48) / 0.34),
                    bond: bond,
                    romance: romance,
                    strain: strain
                )
            default:
                return AuriRelationshipState(
                    id: "negative-hostile",
                    title: "Hostile",
                    subtitle: "Things feel actively hurtful right now, and repeated kindness is needed to repair them.",
                    kind: .negative,
                    progress: strain,
                    bond: bond,
                    romance: romance,
                    strain: strain
                )
            }
        }

        let romanticMomentum = clamp((bond * 0.45) + (romance * 0.55))
        if bond >= 0.58 && romance >= 0.12 {
            switch romance {
            case ..<0.24:
                return AuriRelationshipState(
                    id: "romance-crush",
                    title: "Crush",
                    subtitle: "The closeness is leaning romantic now.",
                    kind: .romance,
                    progress: max(romanticMomentum, 0.22),
                    bond: bond,
                    romance: romance,
                    strain: strain
                )
            case ..<0.42:
                return AuriRelationshipState(
                    id: "romance-flirting",
                    title: "Flirting",
                    subtitle: "There is playful romantic tension between you now.",
                    kind: .romance,
                    progress: max(romanticMomentum, 0.38),
                    bond: bond,
                    romance: romance,
                    strain: strain
                )
            case ..<0.62:
                return AuriRelationshipState(
                    id: "romance-dating",
                    title: "Dating",
                    subtitle: "This feels openly mutual and romantic.",
                    kind: .romance,
                    progress: max(romanticMomentum, 0.56),
                    bond: bond,
                    romance: romance,
                    strain: strain
                )
            case ..<0.82:
                return AuriRelationshipState(
                    id: "romance-committed",
                    title: "Committed",
                    subtitle: "The bond feels chosen, serious, and emotionally steady.",
                    kind: .romance,
                    progress: max(romanticMomentum, 0.76),
                    bond: bond,
                    romance: romance,
                    strain: strain
                )
            default:
                return AuriRelationshipState(
                    id: "romance-deep-bond",
                    title: "Deep Bond",
                    subtitle: "The connection is intensely close, trusting, and lasting.",
                    kind: .romance,
                    progress: max(romanticMomentum, 0.92),
                    bond: bond,
                    romance: romance,
                    strain: strain
                )
            }
        }

        switch bond {
        case ..<0.16:
            return AuriRelationshipState(
                id: "friendship-acquaintances",
                title: "Acquaintances",
                subtitle: "You are still learning each other.",
                kind: .friendship,
                progress: max(bond, 0.06),
                bond: bond,
                romance: romance,
                strain: strain
            )
        case ..<0.34:
            return AuriRelationshipState(
                id: "friendship-new-friend",
                title: "New Friend",
                subtitle: "The connection is warming up and starting to feel real.",
                kind: .friendship,
                progress: bond,
                bond: bond,
                romance: romance,
                strain: strain
            )
        case ..<0.58:
            return AuriRelationshipState(
                id: "friendship-friend",
                title: "Friend",
                subtitle: "Things feel comfortable, steady, and emotionally open.",
                kind: .friendship,
                progress: bond,
                bond: bond,
                romance: romance,
                strain: strain
            )
        case ..<0.78:
            return AuriRelationshipState(
                id: "friendship-good-friends",
                title: "Good Friends",
                subtitle: "There is real closeness here now, and it can grow in more than one direction.",
                kind: .friendship,
                progress: bond,
                bond: bond,
                romance: romance,
                strain: strain
            )
        default:
            return AuriRelationshipState(
                id: "friendship-best-friend",
                title: "Best Friend",
                subtitle: "The bond is deep, familiar, and quietly loyal.",
                kind: .friendship,
                progress: bond,
                bond: bond,
                romance: romance,
                strain: strain
            )
        }
    }

    private var currentRelationshipProxyState: AuriProxyRelationshipState {
        let relationship = currentRelationshipState
        return AuriProxyRelationshipState(
            id: relationship.id,
            title: relationship.title,
            subtitle: relationship.subtitle,
            kind: relationship.kind,
            progress: relationship.progress,
            friendship: relationship.bond,
            romance: relationship.romance,
            tension: relationship.strain
        )
    }

    var relationshipLabel: String {
        currentRelationshipState.title
    }

    var relationshipSubtitle: String {
        currentRelationshipState.subtitle
    }

    var hungerValue: Double {
        clamp(1 - food)
    }

    var fullnessValue: Double {
        food
    }

    var thirstValue: Double {
        clamp(1 - water)
    }

    var foodStatusLabel: String {
        switch food {
        case ..<0.08:
            return "Extremely Hungry"
        case ..<0.24:
            return "Very Hungry"
        case ..<0.42:
            return "Hungry"
        case ..<0.62:
            return "Getting Hungry"
        case ..<0.82:
            return "Satisfied"
        case ..<0.96:
            return "Comfortable"
        default:
            return "Full"
        }
    }

    var thirstStatusLabel: String {
        switch water {
        case ..<0.08:
            return "Severely Dehydrated"
        case ..<0.24:
            return "Very Thirsty"
        case ..<0.42:
            return "Thirsty"
        case ..<0.62:
            return "A Little Thirsty"
        case ..<0.82:
            return "Hydrated"
        case ..<0.96:
            return "Comfortable"
        default:
            return "Fully Hydrated"
        }
    }

    var happinessValue: Double {
        joy
    }

    var attentionLabel: String {
        "\(Int((attention * 100).rounded()))%"
    }

    private var rawTiredValue: Double {
        clamp(1 - rest)
    }

    var tiredValue: Double {
        tiredValue(at: Date())
    }

    var tiredLabel: String {
        "\(Int((tiredValue * 100).rounded()))%"
    }

    var needsMedicine: Bool {
        medicineDosesRemaining > 0
    }

    var needsDiscipline: Bool {
        disciplineReason != nil
    }

    var needsCleaning: Bool {
        dirtyLevel > 0
    }

    var wantsSleep: Bool {
        wantsSleep(at: Date())
    }

    var needsLightsOff: Bool {
        needsLightsOff(at: Date())
    }

    var needsLightsOn: Bool {
        needsLightsOn(at: Date())
    }

    var weightPounds: Double {
        max(96, 127 + (weightOffset * 10))
    }

    var heightInches: Double {
        54
    }

    var heightLabel: String {
        "4'6\""
    }

    var weightOunces: Double {
        weightPounds * 16
    }

    var weightLabel: String {
        String(format: "%.0f lbs", weightPounds)
    }

    var disciplineLabel: String {
        "\(Int((discipline * 100).rounded()))%"
    }

    var healthLabel: String {
        "\(Int((health * 100).rounded()))%"
    }

    var cleanlinessLabel: String {
        dirtyLevel == 0 ? "Clean" : dirtyStatusTitle
    }

    var dirtyStatusTitle: String {
        switch dirtyLevel {
        case 0:
            return "Clean"
        case 1:
            return "A Little Dirty"
        case 2:
            return "Dirty"
        case 3:
            return "Very Dirty"
        default:
            return "Filthy"
        }
    }

    var dirtyStatusSummary: String {
        switch dirtyLevel {
        case 0:
            return "\(displayName) is clean."
        case 1:
            return "\(displayName) is starting to get a little dirty. Cleaning it now will keep health and happiness steadier."
        case 2:
            return "\(displayName) is dirty and needs a cleanup. Leaving it this way drags down mood and health."
        case 3:
            return "\(displayName) is very dirty. The grime is starting to hurt everything else."
        default:
            return "\(displayName) is filthy and really needs to be cleaned right away."
        }
    }

    var attentionReasons: [String] {
        guard hasChosenName, isAlive else {
            return []
        }

        var reasons: [String] = []
        if food < 0.34 {
            reasons.append("\(displayName) is hungry.")
        }
        if water < 0.34 {
            reasons.append("\(displayName) needs water.")
        }
        if joy < 0.32 {
            reasons.append("\(displayName) needs happiness.")
        }
        if attention < 0.30 {
            reasons.append("\(displayName) wants attention. Playing together is the fastest fix.")
        }
        if needsCleaning {
            reasons.append("\(displayName) is dirty and needs to be cleaned.")
        }
        if needsMedicine {
            reasons.append("\(displayName) feels sick and needs medicine.")
        }
        if !isSleeping && tiredValue > 0.76 {
            reasons.append("\(displayName) is overtired and needs sleep soon.")
        }
        if needsLightsOff {
            reasons.append("\(displayName) is tired. Turning the lights off would help her fall asleep.")
        } else if needsLightsOn {
            reasons.append("\(displayName) is awake and wants the lights back on.")
        }
        if needsDiscipline, let disciplineReason {
            reasons.append("\(displayName) needs discipline for \(disciplineReason.title.lowercased()).")
        }
        if health < 0.42 {
            reasons.append("\(displayName)'s health is slipping.")
        }
        return reasons
    }

    var attentionHeadline: String? {
        attentionReasons.first
    }

    var needsAttention: Bool {
        !attentionReasons.isEmpty
    }

    var hasRenderableTimedEffect: Bool {
        guard let activeTimedEffect else {
            return false
        }

        return Date().timeIntervalSince(activeTimedEffect.startedAt) < activeTimedEffect.kind.duration
    }

    var mood: AuriMood {
        guard isAlive else {
            return .gone
        }

        let essentials = min(food, water)
        let warmth = (attention + joy + health) / 3

        if health < 0.18 || essentials < 0.14 {
            return .fading
        }
        if needsMedicine || needsCleaning || essentials < 0.30 || attention < 0.24 {
            return .needy
        }
        if wantsSleep || tiredValue > 0.66 || warmth < 0.42 {
            return .sleepy
        }
        if food > 0.74 && water > 0.74 && attention > 0.64 && joy > 0.62 && health > 0.74 {
            return .bright
        }
        return .cozy
    }

    var heroLine: String {
        if !hasChosenName {
            return "Give Auri a name first."
        }

        if let lastReply = conversation.last(where: { $0.role == .auri })?.text {
            return lastReply
        }

        if !isAlive {
            return "\(displayName)'s health reached zero. Start a new Auri when you're ready."
        }

        if isSleeping && lightsOff {
            return "\(displayName) is asleep. Let the room stay dark so the rest actually counts."
        }

        if isSleeping && !lightsOff {
            return "\(displayName) drifted off, but the room is still bright enough to keep the sleep light."
        }

        if needsLightsOff {
            return "\(displayName) is tired. If you darken the room, it is much more likely to settle into sleep."
        }

        if tiredValue > 0.76 {
            return "\(displayName) is overtired. A quiet stretch of sleep would help more than anything right now."
        }

        if needsCleaning {
            return dirtyStatusSummary
        }

        if needsMedicine {
            let doses = medicineDosesRemaining == 1 ? "1 dose" : "\(medicineDosesRemaining) doses"
            return "\(displayName) feels sick. It may still need \(doses) of medicine to recover."
        }

        if needsDiscipline, let disciplineReason {
            return "\(displayName) needs discipline. Ignoring \(disciplineReason.title.lowercased()) will make care harder to manage."
        }

        switch mood {
        case .bright:
            return "\(displayName) feels steady, clean, and well cared for."
        case .cozy:
            return "\(displayName) is calm and idling happily."
        case .sleepy:
            return "\(displayName) is fading a little. Rest, play, or affection would help."
        case .needy:
            return "\(displayName) is asking for care. Every missed need pulls down health and happiness."
        case .fading:
            return "\(displayName) is in trouble. Health is dropping and the routine needs help fast."
        case .gone:
            return "\(displayName) is gone."
        }
    }

    var nextStageLabel: String {
        "Auri"
    }

    var nextStage: AuriStage? {
        nil
    }

    var growthMeterValue: Double {
        0
    }

    func start() {
        guard tickerTask == nil else {
            return
        }

        if !hasRequestedNotificationAuthorization {
            hasRequestedNotificationAuthorization = true
            Task {
                await AuriNotificationScheduler.requestAuthorizationIfNeeded()
            }
        }

        advanceClock(to: Date())
        persist()

        tickerTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(60))
                guard let self else {
                    return
                }
                self.handleTick()
            }
        }
    }

    func stop() {
        tickerTask?.cancel()
        tickerTask = nil
        advanceClock(to: Date())
        persist()
    }

    func scenePhaseChanged(_ phase: ScenePhase) {
        switch phase {
        case .active:
            start()
            advanceClock(to: Date())
            persist()
        case .inactive, .background:
            advanceClock(to: Date())
            persist()
        @unknown default:
            advanceClock(to: Date())
            persist()
        }
    }

    func feed(_ item: AuriFoodItem = .mealBowl) {
        guard let now = beginCareInteraction(
            requiresAwake: true,
            asleepMessage: "\(displayName) has to be awake to eat."
        ) else {
            return
        }

        let requiresMealCompliance = item != .berryBits && item != .waterBottle && item != .coffee
        if requiresMealCompliance && shouldRefuseMeal() {
            joy = clamp(joy - 0.05)
            activeFoodEffectItem = nil
            activeMedicineEffectItem = nil
            activeTimedEffect = AuriTimedEffect(kind: .discipline, startedAt: now)
            triggerDisciplineNeed(.refusesMeal, summary: "\(displayName) refused \(item.title.lowercased()) even though it was hungry.")
            persist()
            return
        }

        activeMedicineEffectItem = nil
        switch item {
        case .mealBowl:
            earnCoins(6)
            food = clamp(food + 0.34)
            joy = clamp(joy + 0.08)
            attention = clamp(attention + 0.05)
            health = clamp(health + 0.03)
            applyRelationshipDelta(bond: 0.024, strain: -0.008)
            weightOffset = clamp(weightOffset + 0.03, lower: -0.35, upper: 0.45)
            lastFedAt = now
            lastAttentionAt = now
            activeFoodEffectItem = item
            activeTimedEffect = AuriTimedEffect(kind: .feed, startedAt: now)
            appendEvent(.feed, "You served \(displayName) a stacked burger.")
        case .berryBits:
            earnCoins(4)
            food = clamp(food + 0.14)
            joy = clamp(joy + 0.22)
            attention = clamp(attention + 0.08)
            health = clamp(health + 0.02)
            applyRelationshipDelta(
                bond: 0.03,
                romance: relationshipBond >= 0.58 ? 0.01 : 0,
                strain: -0.01
            )
            weightOffset = clamp(weightOffset + 0.04, lower: -0.35, upper: 0.45)
            lastFedAt = now
            lastAttentionAt = now
            activeFoodEffectItem = item
            activeTimedEffect = AuriTimedEffect(kind: .treat, startedAt: now)
            appendEvent(.treat, "You spoiled \(displayName) with a parfait.")
        case .soupCup:
            earnCoins(6)
            food = clamp(food + 0.22)
            water = clamp(water + 0.16)
            joy = clamp(joy + 0.12)
            attention = clamp(attention + 0.06)
            health = clamp(health + 0.05)
            applyRelationshipDelta(bond: 0.026, strain: -0.008)
            weightOffset = clamp(weightOffset + 0.02, lower: -0.35, upper: 0.45)
            lastFedAt = now
            lastHydratedAt = now
            lastAttentionAt = now
            activeFoodEffectItem = item
            activeTimedEffect = AuriTimedEffect(kind: .feed, startedAt: now)
            appendEvent(.feed, "You shared a warm cup of ramen with \(displayName).")
        case .waterBottle:
            earnCoins(4)
            water = clamp(water + 0.38)
            attention = clamp(attention + 0.04)
            joy = clamp(joy + 0.04)
            health = clamp(health + 0.04)
            applyRelationshipDelta(bond: 0.018, strain: -0.01)
            lastHydratedAt = now
            lastAttentionAt = now
            activeFoodEffectItem = item
            activeTimedEffect = AuriTimedEffect(kind: .water, startedAt: now)
            appendEvent(.water, "You gave \(displayName) a fresh water bottle.")
        case .coffee:
            earnCoins(5)
            water = clamp(water + 0.04)
            attention = clamp(attention + 0.08)
            joy = clamp(joy + 0.03)
            caffeineUntil = now.addingTimeInterval(Self.coffeeAlertnessDuration)
            applyRelationshipDelta(bond: 0.02, strain: -0.006)
            lastHydratedAt = now
            lastAttentionAt = now
            activeFoodEffectItem = item
            activeTimedEffect = AuriTimedEffect(kind: .feed, startedAt: now)
            appendEvent(.feed, "You brought \(displayName) an iced coffee. It perked her up, but it will not replace sleep.")
        }

        persist()
    }

    func giveWater() {
        feed(.waterBottle)
    }

    func beginPlayChallenge() -> Bool {
        guard let now = beginCareInteraction(requiresAwake: true) else {
            return false
        }

        if shouldRefusePlay() {
            joy = clamp(joy - 0.04)
            activeTimedEffect = AuriTimedEffect(kind: .discipline, startedAt: now)
            triggerDisciplineNeed(.refusesPlay, summary: "\(displayName) refused to play and needs discipline.")
            persist()
            return false
        }

        persist()
        return true
    }

    func prepareMiniGamesMenu() -> Bool {
        beginCareInteraction(requiresAwake: true) != nil
    }

    func resolvePlayChallenge(roundsWon: Int, totalRounds: Int) {
        guard hasChosenName, isAlive else {
            return
        }

        let now = Date()
        advanceClock(to: now)
        guard isAlive else {
            persist()
            return
        }

        let total = max(totalRounds, 1)
        let wins = max(0, min(roundsWon, total))
        let attentionGain: Double
        let joyDelta: Double
        let healthDelta: Double
        let summary: String

        switch wins {
        case total:
            earnCoins(18)
            attentionGain = 0.34
            joyDelta = 0.24
            healthDelta = 0.03
            summary = "You and \(displayName) nailed every round of the play game. It came away thrilled and fully engaged."
        case let wins where wins == max(0, total - 1):
            earnCoins(14)
            attentionGain = 0.28
            joyDelta = 0.16
            healthDelta = 0.02
            summary = "You played a tight game with \(displayName) and mostly won it over."
        case 1:
            earnCoins(8)
            attentionGain = 0.18
            joyDelta = -0.01
            healthDelta = 0
            summary = "You played with \(displayName), but the game got a little frustrating before it clicked."
        default:
            earnCoins(4)
            attentionGain = 0.12
            joyDelta = -0.06
            healthDelta = -0.01
            summary = "You tried to play with \(displayName), but it ended up more frustrated than delighted."
        }

        attention = clamp(attention + attentionGain)
        joy = clamp(joy + joyDelta)
        health = clamp(health + healthDelta)
        applyRelationshipDelta(
            bond: wins == total ? 0.07 : wins >= max(0, total - 1) ? 0.055 : wins == 1 ? 0.03 : 0.02,
            strain: wins == 0 ? 0.01 : -0.01
        )
        water = clamp(water - 0.03)
        rest = clamp(rest - 0.04)
        weightOffset = clamp(weightOffset - 0.04, lower: -0.35, upper: 0.45)
        lastPlayedAt = now
        lastAttentionAt = now
        activeTimedEffect = AuriTimedEffect(kind: .play, startedAt: now)
        appendEvent(.play, summary)
        errorMessage = nil
        persist()
    }

    func loadChessGame() async throws -> AuriRemoteChessGame? {
        guard hasChosenName, isAlive else {
            return nil
        }

        let game = try await AuriChessClient.fetchState(lifeID: lifeID, proxyURLString: proxyURLString)
        return try await finalizeChessRewardIfNeeded(for: game)
    }

    func startChessGame(as playerColor: AuriRemoteChessColor) async throws -> AuriRemoteChessGame {
        guard beginPlayChallenge() else {
            throw AuriMiniGameFlowError.unavailable(errorMessage ?? "Auri is not up for chess right now.")
        }

        let game = try await AuriChessClient.startGame(
            lifeID: lifeID,
            playerColor: playerColor,
            proxyURLString: proxyURLString
        )
        return try await finalizeChessRewardIfNeeded(for: game) ?? game
    }

    func submitChessMove(from: String, to: String, promotion: String? = "q") async throws -> AuriRemoteChessGame {
        let game = try await AuriChessClient.submitMove(
            lifeID: lifeID,
            from: from,
            to: to,
            promotion: promotion,
            proxyURLString: proxyURLString
        )
        return try await finalizeChessRewardIfNeeded(for: game) ?? game
    }

    func resignChessGame() async throws -> AuriRemoteChessGame {
        let game = try await AuriChessClient.resignGame(lifeID: lifeID, proxyURLString: proxyURLString)
        return try await finalizeChessRewardIfNeeded(for: game) ?? game
    }

    private func finalizeChessRewardIfNeeded(for game: AuriRemoteChessGame?) async throws -> AuriRemoteChessGame? {
        guard let game else {
            return nil
        }

        guard game.rewardPending else {
            return game
        }

        let claimedGame = try await AuriChessClient.claimReward(lifeID: lifeID, proxyURLString: proxyURLString)
        if game.rewardPending, claimedGame.rewardPending == false {
            resolveChessChallenge(result: claimedGame.result, status: claimedGame.status)
        }
        return claimedGame
    }

    private func resolveChessChallenge(result: AuriRemoteChessResult?, status: AuriRemoteChessStatus) {
        guard hasChosenName, isAlive, let result else {
            return
        }

        let now = Date()
        advanceClock(to: now)
        guard isAlive else {
            persist()
            return
        }

        let attentionGain: Double
        let joyDelta: Double
        let healthDelta: Double
        let starReward: Int
        let summary: String

        switch result {
        case .humanWin:
            starReward = 24
            attentionGain = 0.34
            joyDelta = 0.22
            healthDelta = 0.03
            summary = "You beat \(displayName) at chess. The match kept it locked in the whole time, and the attention really landed."
        case .draw:
            starReward = 16
            attentionGain = 0.26
            joyDelta = 0.14
            healthDelta = 0.02
            summary = "You and \(displayName) ground out a full chess draw. The focus still pulled it closer to you."
        case .auriWin:
            if status == .resigned {
                starReward = 8
                attentionGain = 0.14
                joyDelta = 0.01
                healthDelta = 0
                summary = "You started a chess game with \(displayName), but backed out before the finish. The attention still counted."
            } else {
                starReward = 10
                attentionGain = 0.18
                joyDelta = 0.06
                healthDelta = 0.01
                summary = "You finished a full chess game with \(displayName). Even with the loss, the time together kept it engaged."
            }
        }

        earnCoins(starReward)
        attention = clamp(attention + attentionGain)
        joy = clamp(joy + joyDelta)
        health = clamp(health + healthDelta)
        applyRelationshipDelta(
            bond: result == .humanWin ? 0.065 : result == .draw ? 0.055 : 0.04,
            strain: status == .resigned ? 0.006 : -0.008
        )
        water = clamp(water - 0.04)
        rest = clamp(rest - 0.05)
        weightOffset = clamp(weightOffset - 0.03, lower: -0.35, upper: 0.45)
        lastPlayedAt = now
        lastAttentionAt = now
        activeTimedEffect = AuriTimedEffect(kind: .play, startedAt: now)
        appendEvent(.play, summary)
        errorMessage = nil
        persist()
    }

    func loadConnect4Game() async throws -> AuriRemoteConnect4Game? {
        guard hasChosenName, isAlive else {
            return nil
        }

        let game = try await AuriConnect4Client.fetchState(lifeID: lifeID, proxyURLString: proxyURLString)
        return try await finalizeConnect4RewardIfNeeded(for: game)
    }

    func startConnect4Game(humanStarts: Bool) async throws -> AuriRemoteConnect4Game {
        guard beginPlayChallenge() else {
            throw AuriMiniGameFlowError.unavailable(errorMessage ?? "Auri is not up for Connect 4 right now.")
        }

        let game = try await AuriConnect4Client.startGame(
            lifeID: lifeID,
            humanStarts: humanStarts,
            proxyURLString: proxyURLString
        )
        return try await finalizeConnect4RewardIfNeeded(for: game) ?? game
    }

    func dropConnect4Disc(in column: Int) async throws -> AuriRemoteConnect4Game {
        let game = try await AuriConnect4Client.dropDisc(
            lifeID: lifeID,
            column: column,
            proxyURLString: proxyURLString
        )
        return try await finalizeConnect4RewardIfNeeded(for: game) ?? game
    }

    func resignConnect4Game() async throws -> AuriRemoteConnect4Game {
        let game = try await AuriConnect4Client.resignGame(lifeID: lifeID, proxyURLString: proxyURLString)
        return try await finalizeConnect4RewardIfNeeded(for: game) ?? game
    }

    private func finalizeConnect4RewardIfNeeded(for game: AuriRemoteConnect4Game?) async throws -> AuriRemoteConnect4Game? {
        guard let game else {
            return nil
        }

        guard game.rewardPending else {
            return game
        }

        let claimedGame = try await AuriConnect4Client.claimReward(lifeID: lifeID, proxyURLString: proxyURLString)
        if game.rewardPending, claimedGame.rewardPending == false {
            resolveConnect4Challenge(result: claimedGame.result, status: claimedGame.status)
        }
        return claimedGame
    }

    private func resolveConnect4Challenge(result: AuriRemoteConnect4Result?, status: AuriRemoteConnect4Status) {
        guard hasChosenName, isAlive, let result else {
            return
        }

        let now = Date()
        advanceClock(to: now)
        guard isAlive else {
            persist()
            return
        }

        let attentionGain: Double
        let joyDelta: Double
        let healthDelta: Double
        let starReward: Int
        let summary: String

        switch result {
        case .humanWin:
            starReward = 20
            attentionGain = 0.30
            joyDelta = 0.18
            healthDelta = 0.02
            summary = "You beat \(displayName) at Connect 4. The fast back-and-forth kept it focused on you the whole time."
        case .draw:
            starReward = 14
            attentionGain = 0.22
            joyDelta = 0.10
            healthDelta = 0.01
            summary = "You and \(displayName) fought Connect 4 to a draw. The match still landed as good attention."
        case .auriWin:
            if status == .resigned {
                starReward = 6
                attentionGain = 0.10
                joyDelta = 0
                healthDelta = 0
                summary = "You started a Connect 4 game with \(displayName), then backed out. The attention still counted."
            } else {
                starReward = 8
                attentionGain = 0.14
                joyDelta = 0.04
                healthDelta = 0.01
                summary = "You finished a full Connect 4 game with \(displayName). Even with the loss, the time together kept it engaged."
            }
        }

        earnCoins(starReward)
        attention = clamp(attention + attentionGain)
        joy = clamp(joy + joyDelta)
        health = clamp(health + healthDelta)
        applyRelationshipDelta(
            bond: result == .humanWin ? 0.055 : result == .draw ? 0.045 : 0.032,
            strain: status == .resigned ? 0.004 : -0.006
        )
        water = clamp(water - 0.03)
        rest = clamp(rest - 0.03)
        weightOffset = clamp(weightOffset - 0.02, lower: -0.35, upper: 0.45)
        lastPlayedAt = now
        lastAttentionAt = now
        activeTimedEffect = AuriTimedEffect(kind: .play, startedAt: now)
        appendEvent(.play, summary)
        errorMessage = nil
        persist()
    }

    func showAffection() {
        guard hasChosenName, isAlive else {
            return
        }

        let now = Date()
        advanceClock(to: now)
        activeTimedEffect = AuriTimedEffect(kind: .affection, startedAt: now)

        if canReceiveAffectionReward(at: now) {
            joy = clamp(joy + 0.05)
            applyRelationshipDelta(
                bond: 0.04,
                romance: relationshipBond >= 0.58 || relationshipRomance > 0.1 ? 0.02 : 0,
                strain: -0.012
            )
            lastAffectionRewardAt = now
            appendEvent(.affection, "You gave \(displayName) a little affection, and they leaned into it.")
        }

        persist()
    }

    func giveTreat() {
        feed(.berryBits)
    }

    func toggleLights() {
        guard hasChosenName else {
            errorMessage = "Name your Auri first."
            return
        }

        let now = Date()
        if isAlive {
            advanceClock(to: now)
        }
        errorMessage = nil

        lightsOff.toggle()
        activeTimedEffect = isAlive ? AuriTimedEffect(kind: .lights, startedAt: now) : nil

        if isAlive {
            if lightsOff {
                appendEvent(.lights, "You turned the lights off for \(displayName).")
            } else {
                appendEvent(.lights, "You turned the lights back on for \(displayName).")
                if isSleeping {
                    isSleeping = false
                    rest = clamp(rest - 0.04)
                    joy = clamp(joy - 0.03)
                }
            }
        }

        persist()
    }

    func cleanAuri() {
        guard let now = beginCareInteraction(
            requiresAwake: true,
            asleepMessage: "\(displayName) has to be awake to take medicine."
        ) else {
            return
        }
        guard dirtyLevel > 0 else {
            errorMessage = "\(displayName) is already clean."
            return
        }

        dirtyLevel = 0
        earnCoins(8)
        joy = clamp(joy + 0.10)
        health = clamp(health + 0.08)
        attention = clamp(attention + 0.04)
        applyRelationshipDelta(bond: 0.024, strain: -0.014)
        activeTimedEffect = AuriTimedEffect(kind: .clean, startedAt: now)
        appendEvent(.clean, "You cleaned \(displayName) up.")
        persist()
    }

    func cleanUpPoop() {
        cleanAuri()
    }

    func giveMedicine(_ item: AuriMedicineItem = .capsule) {
        guard let now = beginCareInteraction(requiresAwake: false) else {
            return
        }
        guard medicineDosesRemaining > 0 else {
            errorMessage = "\(displayName) does not need medicine right now."
            return
        }

        medicineDosesRemaining = max(0, medicineDosesRemaining - 1)
        switch item {
        case .capsule:
            earnCoins(6)
            health = clamp(health + 0.08)
            attention = clamp(attention + 0.04)
            joy = clamp(joy - 0.02)
        case .syrup:
            earnCoins(7)
            health = clamp(health + 0.10)
            attention = clamp(attention + 0.05)
            joy = clamp(joy - 0.03)
        case .coolPatch:
            earnCoins(6)
            health = clamp(health + 0.07)
            attention = clamp(attention + 0.06)
            joy = clamp(joy + 0.01)
        }
        applyRelationshipDelta(bond: 0.02, strain: -0.01)
        activeFoodEffectItem = nil
        activeMedicineEffectItem = item
        activeTimedEffect = AuriTimedEffect(kind: .medicine, startedAt: now)
        if medicineDosesRemaining == 0 {
            appendEvent(.medicine, "You applied the last \(item.title.lowercased()) for \(displayName).")
        } else {
            appendEvent(.medicine, "You gave \(displayName) \(item.title.lowercased()). \(medicineDosesRemaining) doses still needed.")
        }
        persist()
    }

    func disciplineAuri() {
        guard let now = beginCareInteraction(requiresAwake: false) else {
            return
        }
        guard let disciplineReason else {
            errorMessage = "\(displayName) is behaving right now."
            return
        }

        discipline = clamp(discipline + 0.24)
        attention = clamp(attention + 0.03)
        joy = clamp(joy - 0.01)
        applyRelationshipDelta(bond: -0.008, strain: 0.018)
        self.disciplineReason = nil
        activeTimedEffect = AuriTimedEffect(kind: .discipline, startedAt: now)
        appendEvent(.discipline, "You disciplined \(displayName) for \(disciplineReason.title.lowercased()).")
        persist()
    }

    func completeOnboarding(auriName rawAuriName: String, ownerProfile rawOwnerProfile: AuriHumanProfile) {
        guard
            let normalizedAuriName = Self.normalizedAuriName(rawAuriName),
            let normalizedOwnerProfile = Self.normalizedOwnerProfile(rawOwnerProfile)
        else {
            errorMessage = "Finish Auri's name and your details first."
            return
        }

        let now = Date()
        name = normalizedAuriName
        ownerProfile = normalizedOwnerProfile
        lastOnboardingProfile = normalizedOwnerProfile
        humanName = normalizedOwnerProfile.firstName
        hasChosenName = true
        hasHatched = true
        stage = Self.unifiedStage
        growth = 0
        createdAt = now
        lastUpdatedAt = now
        resetVitalsForNewAuri(at: now, newborn: false)
        deathCause = nil
        diedAt = nil
        pendingDeathExplanation = nil
        proxyURLString = Self.defaultProxyURLString
        hasCustomizedProxy = false
        lastPassiveCoinGrantAt = now
        events = []
        conversation = [
            AuriChatLine(
                id: UUID(),
                role: .auri,
                text: Self.newbornIntroduction(for: normalizedAuriName, humanFirstName: normalizedOwnerProfile.firstName),
                date: now
            )
        ]
        draftMessage = ""
        errorMessage = nil
        activeTimedEffect = nil
        activeFoodEffectItem = nil
        activeMedicineEffectItem = nil
        lastAttentionNotificationSignature = nil
        lastCriticalHealthNotificationSignature = nil
        persist()
    }

    func startNewAuri() {
        let previousLifeID = lifeID
        name = ""
        hasChosenName = false
        errorMessage = nil
        resetLife(generateNewLifeID: true)
        Task {
            await AuriChatClient.resetRemoteLife(id: previousLifeID, proxyURLString: Self.defaultProxyURLString)
        }
    }

    func startNewEgg() {
        startNewAuri()
    }

    func resetLife(generateNewLifeID: Bool = false) {
        let now = Date()
        if generateNewLifeID {
            lifeID = UUID().uuidString
        }
        hasHatched = true
        stage = Self.unifiedStage
        growth = 0
        createdAt = now
        lastUpdatedAt = now
        resetVitalsForNewAuri(at: now, newborn: false)
        deathCause = nil
        diedAt = nil
        pendingDeathExplanation = nil
        ownerProfile = nil
        humanName = nil
        proxyURLString = Self.defaultProxyURLString
        hasCustomizedProxy = false
        selectedOutfitID = nil
        lastPassiveCoinGrantAt = now
        events = []
        conversation = []
        draftMessage = ""
        errorMessage = nil
        activeTimedEffect = nil
        activeFoodEffectItem = nil
        activeMedicineEffectItem = nil
        lastAttentionNotificationSignature = nil
        lastCriticalHealthNotificationSignature = nil
        persist()
    }

    func activeEffect(at date: Date) -> AuriEffectSnapshot? {
        guard let activeTimedEffect else {
            return nil
        }

        let progress = date.timeIntervalSince(activeTimedEffect.startedAt) / activeTimedEffect.kind.duration
        if progress >= 1 {
            self.activeTimedEffect = nil
            activeFoodEffectItem = nil
            activeMedicineEffectItem = nil
            return nil
        }

        return AuriEffectSnapshot(
            kind: activeTimedEffect.kind,
            progress: max(0, progress),
            foodItem: activeFoodEffectItem,
            medicineItem: activeMedicineEffectItem
        )
    }

    private func resetVitalsForNewAuri(at now: Date, newborn: Bool) {
        let baseline = circadianBaselineForNewLife(at: now)
        lastAffectionRewardAt = nil
        food = 0.86
        water = 0.84
        attention = 0.78
        joy = 0.75
        health = 0.92
        rest = baseline.rest
        discipline = 0
        relationshipBond = 0.08
        relationshipRomance = 0
        relationshipStrain = 0

        weightOffset = 0
        dirtyLevel = 0
        lightsOff = baseline.lightsOff
        isSleeping = baseline.isSleeping
        medicineDosesRemaining = 0
        caffeineUntil = nil
        disciplineReason = nil
        lastFedAt = now
        lastHydratedAt = now
        lastPlayedAt = now
        lastAttentionAt = now
        lastGotDirtyAt = now
        lastDirtyOpportunityAt = now
    }

    private func circadianBaselineForNewLife(at now: Date) -> (rest: Double, lightsOff: Bool, isSleeping: Bool) {
        let calendar = Calendar.current
        let components = calendar.dateComponents([.hour, .minute], from: now)
        let hour = Double(components.hour ?? 0)
        let minute = Double(components.minute ?? 0)
        let currentHour = hour + (minute / 60)
        let bedtime = 23.0
        let wakeHour = 7.0
        let overnightDuration = (24 - bedtime) + wakeHour

        if currentHour >= bedtime || currentHour < wakeHour {
            let hoursIntoSleep = currentHour >= bedtime
                ? currentHour - bedtime
                : currentHour + (24 - bedtime)
            let sleepProgress = clamp(hoursIntoSleep / overnightDuration)
            let recoveredRest = clamp(0.08 + (sleepProgress * 0.90), lower: 0.08, upper: 0.98)
            return (rest: recoveredRest, lightsOff: true, isSleeping: true)
        }

        let awakeProgress = clamp((currentHour - wakeHour) / (bedtime - wakeHour))
        let daytimeRest = clamp(0.98 - (awakeProgress * 0.90), lower: 0.08, upper: 0.98)
        return (rest: daytimeRest, lightsOff: false, isSleeping: false)
    }

    private func applyRelationshipDelta(
        bond bondDelta: Double = 0,
        romance romanceDelta: Double = 0,
        strain strainDelta: Double = 0
    ) {
        relationshipBond = clamp(relationshipBond + bondDelta)
        relationshipRomance = clamp(relationshipRomance + romanceDelta)
        relationshipStrain = clamp(relationshipStrain + strainDelta)
        relationshipRomance = clamp(min(relationshipRomance, relationshipBond + 0.18))
    }

    private func reinforceRelationshipForCare(
        bond bondDelta: Double = 0,
        romance romanceDelta: Double = 0,
        strain strainDelta: Double = 0
    ) {
        applyRelationshipDelta(bond: bondDelta, romance: romanceDelta, strain: strainDelta)
    }

    private func normalizeRelationshipMessage(_ message: String) -> String {
        message
            .lowercased()
            .replacingOccurrences(of: "[^a-z0-9\\s']", with: " ", options: .regularExpression)
            .replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func relationshipEffect(for message: String) -> (bond: Double, romance: Double, strain: Double) {
        let normalized = normalizeRelationshipMessage(message)
        guard !normalized.isEmpty else {
            return (0, 0, 0)
        }

        var bondDelta = 0.018
        var romanceDelta = 0.0
        var strainDelta = 0.0

        if Self.supportivePhrases.contains(where: normalized.contains) {
            bondDelta += 0.026
            strainDelta -= 0.01
        }

        if Self.friendshipPhrases.contains(where: normalized.contains) {
            bondDelta += 0.04
            strainDelta -= 0.012
        }

        if Self.repairPhrases.contains(where: normalized.contains) {
            bondDelta += 0.018
            strainDelta -= 0.09
        }

        if Self.romanticPhrases.contains(where: normalized.contains) {
            romanceDelta += 0.09
            bondDelta += 0.012
        }

        if Self.harshPhrases.contains(where: normalized.contains) {
            bondDelta -= 0.14
            romanceDelta -= 0.12
            strainDelta += 0.18
        }

        return (bondDelta, romanceDelta, strainDelta)
    }

    func isAvatarOwned(_ avatarID: String) -> Bool {
        ownedAvatarIDs.contains(avatarID)
    }

    func isOutfitOwned(_ outfitID: String) -> Bool {
        ownedOutfitIDs.contains(outfitID)
    }

    func canAffordAvatar(_ avatarID: String) -> Bool {
        guard let entry = Self.avatarEntry(for: avatarID) else {
            return false
        }
        return entry.cost <= coins
    }

    func canAffordOutfit(_ outfitID: String) -> Bool {
        guard let entry = Self.outfitEntry(for: outfitID) else {
            return false
        }
        return entry.cost <= coins
    }

    func selectAvatar(_ avatarID: String) {
        guard Self.avatarEntry(for: avatarID) != nil else {
            errorMessage = "That look isn't available yet."
            return
        }

        selectedAvatarID = avatarID
        errorMessage = nil
        persist()
    }

    func purchaseAvatar(_ avatarID: String) {
        selectAvatar(avatarID)
    }

    func selectOutfit(_ outfitID: String?) {
        guard let outfitID else {
            selectedOutfitID = nil
            errorMessage = nil
            persist()
            return
        }

        guard let entry = Self.outfitEntry(for: outfitID) else {
            errorMessage = "That outfit isn't available yet."
            return
        }
        guard ownedOutfitIDs.contains(entry.id) else {
            errorMessage = "Buy \(entry.title) first."
            return
        }

        selectedOutfitID = entry.id
        errorMessage = nil
        persist()
    }

    func purchaseOutfit(_ outfitID: String) {
        guard let entry = Self.outfitEntry(for: outfitID) else {
            errorMessage = "That outfit isn't available yet."
            return
        }

        if !ownedOutfitIDs.contains(entry.id) {
            guard entry.cost <= coins else {
                errorMessage = "You need \(entry.cost - coins) more Stars for \(entry.title)."
                return
            }
            coins -= entry.cost
            ownedOutfitIDs.insert(entry.id)
        }

        selectedOutfitID = entry.id
        errorMessage = nil
        persist()
    }

    func isRelationshipUnlocked(_ relationshipID: String) -> Bool {
        unlockedRelationshipIDs.contains(relationshipID)
    }

    func selectRelationshipStatus(_ relationshipID: String) {
        guard let entry = Self.relationshipEntry(for: relationshipID) else {
            errorMessage = "That relationship isn't available yet."
            return
        }

        selectedRelationshipID = entry.id
        errorMessage = nil
        persist()
    }

    func purchaseRelationshipStatus(_ relationshipID: String) {
        selectRelationshipStatus(relationshipID)
    }

    private func earnCoins(_ amount: Int) {
        guard amount > 0 else {
            return
        }
        coins += amount
    }

    func persist() {
        let state = AuriSaveState(
            name: name,
            humanName: humanName,
            ownerProfile: ownerProfile,
            lifeID: lifeID,
            hasChosenName: hasChosenName,
            createdAt: createdAt,
            lastUpdatedAt: lastUpdatedAt,
            hasHatched: hasHatched,
            stage: stage,
            growth: growth,
            food: food,
            water: water,
            attention: attention,
            joy: joy,
            health: health,
            rest: rest,
            discipline: discipline,
            weightOffset: weightOffset,
            poopCount: dirtyLevel,
            lightsOff: lightsOff,
            isSleeping: isSleeping,
            medicineDosesRemaining: medicineDosesRemaining,
            caffeineUntil: caffeineUntil,
            disciplineReason: disciplineReason,
            lastFedAt: lastFedAt,
            lastHydratedAt: lastHydratedAt,
            lastPlayedAt: lastPlayedAt,
            lastAttentionAt: lastAttentionAt,
            lastAffectionRewardAt: lastAffectionRewardAt,
            lastPoopedAt: lastGotDirtyAt,
            lastPoopOpportunityAt: lastDirtyOpportunityAt,
            deathCause: deathCause,
            diedAt: diedAt,
            pendingDeathExplanation: pendingDeathExplanation,
            relationshipBond: relationshipBond,
            relationshipRomance: relationshipRomance,
            relationshipStrain: relationshipStrain,
            proxyURLString: Self.defaultProxyURLString,
            hasCustomizedProxy: false,
            events: Array(events.suffix(24)),
            conversation: Array(conversation.suffix(14))
        )

        do {
            let data = try encoder.encode(state)
            let url = try Self.persistenceURL()
            try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
            try data.write(to: url, options: .atomic)
            try persistProfile()
        } catch {
            errorMessage = "Couldn't save \(displayName)'s state locally."
        }

        syncAttentionNotificationIfNeeded()
        syncCriticalHealthNotificationIfNeeded()
    }

    func sendMessage() async {
        await sendMessage(allowWakeOverride: false)
    }

    func cancelWakeMessagePrompt() {
        shouldPromptWakeForMessage = false
    }

    func wakeUpAndSendPendingMessage() async {
        shouldPromptWakeForMessage = false

        guard hasChosenName, isAlive else {
            return
        }

        if isSleeping {
            isSleeping = false
            errorMessage = nil
            persist()
        }

        await sendMessage(allowWakeOverride: true)
    }

    private func sendMessage(allowWakeOverride: Bool) async {
        let trimmed = draftMessage.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            return
        }

        if !hasChosenName {
            errorMessage = "Pick a name before you talk."
            return
        }

        if !isAlive {
            errorMessage = "\(displayName)'s health reached zero. Start a new Auri to talk again."
            return
        }

        if isSleeping {
            if !allowWakeOverride, !lightsOff {
                errorMessage = nil
                shouldPromptWakeForMessage = true
            } else {
                errorMessage = "\(displayName) is asleep. Let her rest or turn the lights on first."
            }
            return
        }

        shouldPromptWakeForMessage = false
        let now = Date()
        advanceClock(to: now)
        attention = clamp(attention + 0.12)
        joy = clamp(joy + 0.05)
        let relationshipShift = relationshipEffect(for: trimmed)
        applyRelationshipDelta(
            bond: relationshipShift.bond,
            romance: relationshipShift.romance,
            strain: relationshipShift.strain
        )
        lastAttentionAt = now
        activeTimedEffect = AuriTimedEffect(kind: .message, startedAt: now)
        if let introducedHumanName = AuriChatClient.detectHumanName(from: trimmed, currentHumanName: humanName) {
            humanName = introducedHumanName
        }
        conversation.append(AuriChatLine(id: UUID(), role: .user, text: trimmed, date: now))
        appendEvent(.message, "You spoke to \(displayName).")
        draftMessage = ""
        errorMessage = nil
        isSending = true
        persist()

        let context = AuriChatContext(
            name: displayName,
            humanName: humanName,
            ownerProfile: ownerProfile,
            lifeID: lifeID,
            relationshipStatus: currentRelationshipProxyState,
            stage: stage,
            mood: mood,
            ageDays: ageDays,
            heightInches: heightInches,
            food: food,
            water: water,
            attention: attention,
            joy: joy,
            growth: growth,
            health: health,
            discipline: discipline,
            hunger: hungerValue,
            tired: tiredValue,
            wantsSleep: wantsSleep,
            weightOunces: weightOunces,
            dirtyLevel: dirtyLevel,
            isSleeping: isSleeping,
            lightsOff: lightsOff,
            medicineDosesRemaining: medicineDosesRemaining,
            needsAttention: needsAttention,
            needsDiscipline: needsDiscipline,
            isAlive: isAlive,
            proxyURLString: proxyURLString,
            recentEvents: Array(events.suffix(8)),
            conversation: Array(conversation.suffix(8))
        )

        do {
            let reply = try await AuriChatClient.reply(to: trimmed, context: context)
            conversation.append(AuriChatLine(id: UUID(), role: .auri, text: reply, date: Date()))
            appendEvent(.reply, "\(displayName) answered you.")
        } catch {
            if let chatError = error as? AuriChatClientError, chatError == .serviceNotConfigured {
                errorMessage = "Auri's cloud chat service isn't configured for this build yet."
            } else if (error as? URLError)?.code == .badURL {
                errorMessage = "Auri's chat service URL is invalid."
            } else {
                errorMessage = "Auri couldn't reach its chat service. Check your connection and cloud chat settings."
            }
        }

        isSending = false
        joy = clamp(joy + 0.06)
        lastAttentionAt = Date()
        persist()
    }

    private var canCare: Bool {
        hasChosenName && isAlive
    }

    private func handleTick() {
        advanceClock(to: Date())
        persist()
    }

    private func appendEvent(_ kind: AuriEventKind, _ summary: String) {
        events.append(AuriEvent(id: UUID(), kind: kind, date: Date(), summary: summary))
        if events.count > 24 {
            events.removeFirst(events.count - 24)
        }
    }

    private func advanceClock(to now: Date) {
        guard now > lastUpdatedAt else {
            return
        }

        if !hasChosenName {
            lastUpdatedAt = now
            lastPassiveCoinGrantAt = now
            return
        }

        var cursor = lastUpdatedAt
        while cursor < now, isAlive {
            let next = min(now, cursor.addingTimeInterval(Self.clockSliceDuration))
            advanceLifeSlice(from: cursor, to: next)
            grantPassiveStarsIfNeeded(at: next)
            cursor = next
        }

        if let caffeineUntil, caffeineUntil <= now {
            self.caffeineUntil = nil
        }
        lastUpdatedAt = now
    }

    private func caffeineAlertnessBoost(at now: Date) -> Double {
        guard let caffeineUntil else {
            return 0
        }

        let remaining = caffeineUntil.timeIntervalSince(now)
        guard remaining > 0 else {
            return 0
        }

        let normalizedRemaining = clamp(remaining / Self.coffeeAlertnessDuration)
        return Self.coffeeMaxAlertnessBoost * normalizedRemaining
    }

    private func tiredValue(at now: Date) -> Double {
        clamp(rawTiredValue - caffeineAlertnessBoost(at: now))
    }

    private func grantPassiveStarsIfNeeded(at now: Date) {
        guard hasChosenName, isAlive else {
            lastPassiveCoinGrantAt = now
            return
        }

        if now <= lastPassiveCoinGrantAt {
            lastPassiveCoinGrantAt = now
            return
        }

        let elapsed = now.timeIntervalSince(lastPassiveCoinGrantAt)
        guard elapsed >= Self.passiveStarsInterval else {
            return
        }

        let starsEarned = Int(elapsed / Self.passiveStarsInterval)
        guard starsEarned > 0 else {
            return
        }

        coins += starsEarned
        lastPassiveCoinGrantAt = lastPassiveCoinGrantAt.addingTimeInterval(Double(starsEarned) * Self.passiveStarsInterval)
    }

    private func advanceLifeSlice(from start: Date, to end: Date) {
        let elapsedHours = max(0, end.timeIntervalSince(start) / 3_600)
        guard elapsedHours > 0 else {
            return
        }
        let elapsedMinutes = max(0, end.timeIntervalSince(start) / 60)

        let evaluationDate = start.addingTimeInterval(end.timeIntervalSince(start) * 0.5)
        updateSleepState(after: elapsedHours, at: evaluationDate)

        let sleepingThisSlice = isSleeping
        let sleepingWithLightsOn = sleepingThisSlice && !lightsOff
        food = clamp(food - (elapsedMinutes / 300))
        water = clamp(water - (elapsedHours * 0.039))
        joy = clamp(joy - (elapsedHours * (sleepingThisSlice ? 0 : 0.018)))

        if sleepingThisSlice {
            let restRecovery = lightsOff ? Self.darkSleepRecoveryPerHour : Self.litSleepRecoveryPerHour
            rest = clamp(rest + (elapsedHours * restRecovery))
        } else {
            let lateNightDrain = isNight(at: evaluationDate) ? Self.lateNightRestDrainPerHour : 0
            let overtiredDrain = tiredValue(at: evaluationDate) > 0.84 ? Self.overtiredRestDrainPerHour : 0
            let roomPenalty = needsLightsOff(at: evaluationDate) ? Self.brightRoomRestDrainPerHour : 0
            rest = clamp(rest - (elapsedHours * (Self.awakeRestDrainPerHour + lateNightDrain + overtiredDrain + roomPenalty)))
        }

        weightOffset = clamp(weightOffset - (elapsedHours * (food < 0.22 ? 0.01 : 0.002)), lower: -0.35, upper: 0.45)

        if isAlive {
            generateDirtIfNeeded(at: end)
            updateSleepState(after: 0, at: end)
            maybeTriggerIllness(after: elapsedHours)
            maybeTriggerFalseAlarm(after: elapsedHours)

            if needsMedicine {
                if !sleepingThisSlice {
                    joy = clamp(joy - (elapsedHours * 0.014))
                }
                health = clamp(health - (elapsedHours * 0.03))
            }

            if needsLightsOff(at: evaluationDate) {
                if !sleepingThisSlice {
                    joy = clamp(joy - (elapsedHours * 0.02))
                }
                if !sleepingWithLightsOn {
                    health = clamp(health - (elapsedHours * 0.016))
                }
            }

            if isNight(at: evaluationDate) && !sleepingThisSlice {
                joy = clamp(joy - (elapsedHours * 0.009))
                if !lightsOff {
                    health = clamp(health - (elapsedHours * 0.006))
                }
            }

            if disciplineReason != nil {
                discipline = clamp(discipline - (elapsedHours * 0.02))
                if !sleepingThisSlice {
                    joy = clamp(joy - (elapsedHours * 0.01))
                }
            }

            if food < 0.28 || water < 0.28 {
                health = clamp(health - (elapsedHours * 0.028))
            } else if food > 0.56 && water > 0.60 && joy > 0.50 && !needsCleaning && !needsMedicine {
                let recoveryRate = sleepingThisSlice
                    ? (lightsOff ? 0.02 : 0)
                    : 0.008
                if recoveryRate > 0 {
                    health = clamp(health + (elapsedHours * recoveryRate))
                }
            }

            let weightPenalty = max(0, abs(weightOffset) - 0.16)
            if weightPenalty > 0 {
                health = clamp(health - (elapsedHours * weightPenalty * 0.06))
            }

            if sleepingWithLightsOn {
                // Sleeping under bright lights should always cost 1% health per 15 minutes.
                health = clamp(health - (elapsedMinutes / 1_500))
            }

            if health <= 0 {
                markDead(.neglect, at: end)
                return
            }

            // Sleeping should not silently drain attention into a joy/health death spiral
            // while the player is away. Sleep still carries its own food, water, illness,
            // and light-related consequences above.
            if !sleepingThisSlice {
                applyCriticalCareDecay(over: elapsedMinutes, at: end)
                if health <= 0 {
                    markDead(.neglect, at: end)
                    return
                }
            }
        }
    }

    private func applyCriticalCareDecay(over elapsedMinutes: Double, at now: Date) {
        guard elapsedMinutes > 0, isAlive else {
            return
        }

        var remainingMinutes = elapsedMinutes
        while remainingMinutes > 0, isAlive {
            let minuteStep = min(1, remainingMinutes)
            attention = clamp(attention - (Self.attentionDecayPerMinute * minuteStep))

            if dirtyLevel > 0 {
                joy = clamp(joy - (0.02 * minuteStep))
            }

            if attention < 0.30 {
                joy = clamp(joy - (minuteStep / 300))
            }

            if joy < 0.50 {
                health = clamp(health - (0.01 * minuteStep))
            }

            if health <= 0 {
                markDead(.neglect, at: now)
                return
            }
            remainingMinutes -= minuteStep
        }
    }

    private func markDead(_ cause: AuriDeathCause, at now: Date) {
        guard deathCause == nil else {
            return
        }

        let explanation = deathExplanation(for: cause)
        deathCause = cause
        diedAt = now
        pendingDeathExplanation = explanation
        isSleeping = false
        activeTimedEffect = nil
        joy = 0
        attention = 0
        health = 0
        appendEvent(.death, "\(displayName)'s health reached zero.")
        let currentLifeID = lifeID
        let currentProxyURLString = proxyURLString
        Task {
            await AuriChatClient.resetRemoteLife(id: currentLifeID, proxyURLString: currentProxyURLString)
        }
    }

    func acknowledgeDeathExplanation() {
        guard pendingDeathExplanation != nil else {
            return
        }

        pendingDeathExplanation = nil
        persist()
    }

    private func deathExplanation(for cause: AuriDeathCause) -> String {
        switch cause {
        case .oldAge:
            return "\(displayName)'s life came to a natural end with age."
        case .neglect:
            var reasons: [String] = []

            if isSleeping && !lightsOff {
                reasons.append("she was sleeping with the lights on for too long")
            }
            if needsMedicine {
                reasons.append("she was sick and needed medicine")
            }
            if food < 0.28 && water < 0.28 {
                reasons.append("she went too long without enough food and water")
            } else {
                if food < 0.28 {
                    reasons.append("she was too hungry for too long")
                }
                if water < 0.28 {
                    reasons.append("she was too dehydrated for too long")
                }
            }
            if !isSleeping && wantsSleep {
                reasons.append("she stayed up exhausted for too long")
            }
            if dirtyLevel > 0 {
                reasons.append("she was left too dirty for too long")
            }
            if attention < 0.30 && !isSleeping {
                reasons.append("she went too long without enough attention")
            }

            let uniqueReasons = Array(NSOrderedSet(array: reasons)) as? [String] ?? reasons

            guard let firstReason = uniqueReasons.first else {
                return "\(displayName)'s health reached zero after too much neglect at once."
            }

            if uniqueReasons.count == 1 {
                return "\(displayName)'s health reached zero because \(firstReason)."
            }

            if uniqueReasons.count == 2 {
                return "\(displayName)'s health reached zero because \(firstReason), and \(uniqueReasons[1])."
            }

            let leadingReasons = uniqueReasons.dropLast().joined(separator: ", ")
            return "\(displayName)'s health reached zero because \(leadingReasons), and \(uniqueReasons.last!)."
        }
    }

    private func ageDays(at now: Date) -> Double {
        max(0, now.timeIntervalSince(createdAt) / 86_400)
    }

    private func hoursSince(_ date: Date, at now: Date) -> Double {
        max(0, now.timeIntervalSince(date) / 3_600)
    }

    private func canReceiveAffectionReward(at now: Date) -> Bool {
        guard let lastAffectionRewardAt else {
            return true
        }

        return !Calendar.current.isDate(lastAffectionRewardAt, inSameDayAs: now)
    }

    private func beginCareInteraction(requiresAwake: Bool, asleepMessage: String? = nil) -> Date? {
        guard hasChosenName else {
            errorMessage = "Name your Auri first."
            return nil
        }
        guard isAlive else {
            errorMessage = "\(displayName)'s health reached zero. Start a new Auri to keep caring for it."
            return nil
        }

        let now = Date()
        advanceClock(to: now)

        if requiresAwake && isSleeping {
            errorMessage = asleepMessage ?? "\(displayName) is asleep. Use the light button if you want to wake her."
            return nil
        }

        errorMessage = nil
        return now
    }

    private func shouldRefuseMeal() -> Bool {
        guard discipline < 0.34, food < 0.44, disciplineReason == nil else {
            return false
        }
        return Double.random(in: 0 ... 1) < (0.12 + ((0.34 - discipline) * 0.55))
    }

    private func shouldRefusePlay() -> Bool {
        guard discipline < 0.38, joy < 0.52, disciplineReason == nil else {
            return false
        }
        return Double.random(in: 0 ... 1) < (0.10 + ((0.38 - discipline) * 0.5))
    }

    private func triggerDisciplineNeed(_ reason: AuriDisciplineReason, summary: String) {
        disciplineReason = reason
        appendEvent(.discipline, summary)
    }

    private func generateDirtIfNeeded(at now: Date) {
        let hoursSinceOpportunity = hoursSince(lastDirtyOpportunityAt, at: now)
        let hourlyRolls = Int(hoursSinceOpportunity.rounded(.down))
        guard hourlyRolls > 0 else {
            return
        }

        var rollCursor = lastDirtyOpportunityAt
        var generatedLevels = 0

        for _ in 0..<hourlyRolls {
            rollCursor = rollCursor.addingTimeInterval(3_600)
            guard dirtyLevel < 4 else {
                continue
            }

            if Double.random(in: 0 ... 1) < 0.4 {
                dirtyLevel += 1
                generatedLevels += 1
                lastGotDirtyAt = rollCursor
            }
        }

        lastDirtyOpportunityAt = rollCursor

        guard generatedLevels > 0 else {
            return
        }

        if generatedLevels == 1 {
            appendEvent(.poop, "\(displayName) got dirty.")
        } else {
            appendEvent(.poop, "\(displayName) got dirtier while you were away.")
        }
    }

    private func updateSleepState(after elapsedHours: Double, at now: Date) {
        guard hasChosenName, isAlive else {
            isSleeping = false
            return
        }

        let hour = Calendar.current.component(.hour, from: now)

        if isSleeping {
            let fullyRecovered = rest >= 0.995
            let preferredMorningWake = (6..<8).contains(hour) && rest >= 0.96
            let catchUpWake = hour >= 8 && rest >= 0.90
            let brightWake = !lightsOff && rest >= 0.82
            let lowPressureWake = hour >= 8 && sleepIntent(at: now) < 0.28 && rest >= 0.88

            if fullyRecovered || preferredMorningWake || catchUpWake || brightWake || lowPressureWake {
                isSleeping = false
            }
            return
        }

        let chance = sleepStartChance(after: elapsedHours, at: now)
        guard chance > 0, Double.random(in: 0 ... 1) < chance else {
            return
        }

        isSleeping = true
        activeTimedEffect = AuriTimedEffect(kind: .sleep, startedAt: now)
        appendEvent(.sleep, "\(displayName) curled up and went to sleep.")
    }

    private func isNight(at now: Date) -> Bool {
        let hour = Calendar.current.component(.hour, from: now)
        return hour >= 21 || hour < 7
    }

    private func sleepIntent(at now: Date) -> Double {
        var intent = tiredValue(at: now)
        if isNight(at: now) {
            intent += 0.10
        }
        if health < 0.55 {
            intent += 0.05
        }
        if joy < 0.40 {
            intent += 0.04
        }
        return clamp(intent)
    }

    private func sleepReadiness(at now: Date) -> Double {
        var readiness = sleepIntent(at: now)
        if lightsOff {
            readiness += 0.20
        }
        if needsMedicine {
            readiness += 0.04
        }
        return clamp(readiness)
    }

    private func wantsSleep(at now: Date) -> Bool {
        guard hasChosenName, isAlive else {
            return false
        }

        let tiredThreshold = isNight(at: now) ? 0.82 : 0.90
        let intentThreshold = isNight(at: now) ? 0.86 : 0.92
        return tiredValue(at: now) >= tiredThreshold || sleepIntent(at: now) >= intentThreshold
    }

    private func needsLightsOff(at now: Date) -> Bool {
        wantsSleep(at: now) && !lightsOff
    }

    private func needsLightsOn(at now: Date) -> Bool {
        lightsOff && !isSleeping && !wantsSleep(at: now)
    }

    private func sleepStartChance(after elapsedHours: Double, at now: Date) -> Double {
        let quietHours = isNight(at: now)
        let threshold = quietHours ? 0.84 : 0.92
        let readiness = sleepReadiness(at: now)
        guard elapsedHours > 0, readiness > threshold else {
            return 0
        }

        let readinessExcess = max(0, readiness - threshold)
        let tiredExcess = max(0, tiredValue - 0.82)
        let extremeTiredness = max(0, tiredValue - 0.96)

        var hourlyChance = quietHours ? 0.16 : 0.08
        hourlyChance += readinessExcess * (quietHours ? 1.70 : 0.95)
        hourlyChance += tiredExcess * (quietHours ? 1.25 : 0.70)

        if lightsOff {
            hourlyChance += quietHours ? 0.18 : 0.10
        }

        if wantsSleep(at: now) && lightsOff {
            hourlyChance += quietHours ? 0.08 : 0.04
        }

        hourlyChance += extremeTiredness * (quietHours ? 1.80 : 1.00)
        hourlyChance = min(0.94, hourlyChance)
        return 1 - pow(1 - hourlyChance, elapsedHours)
    }

    private func maybeTriggerIllness(after elapsedHours: Double) {
        guard !needsMedicine else {
            return
        }

        let veryDirty = dirtyLevel >= 3
        let runDown = health < 0.38 || rest < 0.26
        let dirtyAndRunDown = dirtyLevel >= 2 && runDown
        let severelyRunDown = health < 0.24 && rest < 0.18

        guard veryDirty || dirtyAndRunDown || severelyRunDown else {
            return
        }

        var risk = 0.0
        if veryDirty {
            // Dirt alone should not make illness feel constant until she's clearly unclean.
            risk += Double(dirtyLevel - 2) * 0.09
        }
        if dirtyAndRunDown {
            risk += max(0, 0.38 - health) * 0.45
            risk += max(0, 0.26 - rest) * 0.40
        }
        if severelyRunDown {
            risk += 0.08
        }

        let chance = min(0.14, (elapsedHours * 0.01) + (risk * 0.35))
        guard Double.random(in: 0 ... 1) < chance else {
            return
        }

        medicineDosesRemaining = Int.random(in: 2 ... 3)
        appendEvent(.sickness, "\(displayName) started feeling sick.")
    }

    private func maybeTriggerFalseAlarm(after elapsedHours: Double) {
        guard disciplineReason == nil,
              discipline < 0.55,
              food > 0.72,
              water > 0.72,
              joy > 0.66,
              attention > 0.62 else {
            return
        }

        let chance = min(0.22, elapsedHours * (0.03 + ((0.55 - discipline) * 0.06)))
        guard Double.random(in: 0 ... 1) < chance else {
            return
        }

        disciplineReason = .falseAlarm
        appendEvent(.discipline, "\(displayName) called out even though it was already fine.")
    }

    private func attentionNotificationPlan() -> (signature: String, body: String, delay: TimeInterval)? {
        guard hasChosenName, isAlive else {
            return nil
        }

        let body = "\(displayName) wants attention. Play with it or check in soon."
        if attention < 0.30 {
            return ("attention-now", body, 5)
        }

        let secondsUntilThreshold = max(0, (attention - 0.30) * 100 * 60)
        guard secondsUntilThreshold > 0 else {
            return nil
        }

        let roundedMinutes = max(1, Int(ceil(secondsUntilThreshold / 60)))
        return ("attention-threshold-\(roundedMinutes)m", body, secondsUntilThreshold)
    }

    private func criticalHealthNotificationPlan(at now: Date = Date()) -> (signature: String, body: String, delay: TimeInterval)? {
        guard hasChosenName, isAlive else {
            return nil
        }

        let evaluationDate = max(now, lastUpdatedAt)
        guard let prediction = imminentDeathPrediction(at: evaluationDate) else {
            return nil
        }

        let maximumHorizon: TimeInterval = 6 * 3_600
        guard prediction.secondsUntilDeath <= maximumHorizon else {
            return nil
        }

        let leadTime: TimeInterval = 2 * 3_600
        let delay = prediction.secondsUntilDeath <= leadTime
            ? 5
            : max(5, prediction.secondsUntilDeath - leadTime)
        let roundedMinutes = max(1, Int(ceil(prediction.secondsUntilDeath / 60)))
        let scheduleBucket = max(1, Int(ceil(delay / 60)))
        return (
            signature: "critical-\(prediction.signatureKey)-death-\(roundedMinutes)m-notify-\(scheduleBucket)m",
            body: prediction.body,
            delay: delay
        )
    }

    private func syncAttentionNotificationIfNeeded() {
        let plan = attentionNotificationPlan()
        let signature = plan?.signature
        guard signature != lastAttentionNotificationSignature else {
            return
        }

        lastAttentionNotificationSignature = signature
        let name = displayName
        Task {
            await AuriNotificationScheduler.syncAttentionNotification(name: name, body: plan?.body, after: plan?.delay)
        }
    }

    private func syncCriticalHealthNotificationIfNeeded() {
        let plan = criticalHealthNotificationPlan()
        let signature = plan?.signature
        guard signature != lastCriticalHealthNotificationSignature else {
            return
        }

        lastCriticalHealthNotificationSignature = signature
        let name = displayName
        Task {
            await AuriNotificationScheduler.syncCriticalHealthNotification(name: name, body: plan?.body, after: plan?.delay)
        }
    }

    private func imminentDeathPrediction(at now: Date) -> (secondsUntilDeath: TimeInterval, signatureKey: String, body: String)? {
        let sleepingWithLightsOn = isSleeping && !lightsOff
        var healthDrainPerHour = 0.0
        var joyDrainPerHour = 0.0
        var reasonFragments: [String] = []
        var reasonKeys: [String] = []

        if needsMedicine {
            healthDrainPerHour += 0.03
            if !isSleeping {
                joyDrainPerHour += 0.014
            }
            reasonFragments.append("She needs medicine right away")
            reasonKeys.append("medicine")
        }

        if needsLightsOff(at: now) {
            if !isSleeping {
                joyDrainPerHour += 0.02
            }
            if !sleepingWithLightsOn {
                healthDrainPerHour += 0.016
            }
            reasonFragments.append("she needs sleep and the lights off")
            reasonKeys.append("sleep")
        }

        if isNight(at: now) && !isSleeping {
            joyDrainPerHour += 0.009
            if !lightsOff {
                healthDrainPerHour += 0.006
            }
            reasonFragments.append("she has been up too late")
            reasonKeys.append("night")
        }

        if food < 0.28 {
            reasonFragments.append("she is too hungry")
            reasonKeys.append("food")
        }

        if water < 0.28 {
            reasonFragments.append("she is too dehydrated")
            reasonKeys.append("water")
        }

        if food < 0.28 || water < 0.28 {
            healthDrainPerHour += 0.028
        }

        let weightPenalty = max(0, abs(weightOffset) - 0.16)
        if weightPenalty > 0 {
            healthDrainPerHour += weightPenalty * 0.06
        }

        if sleepingWithLightsOn {
            healthDrainPerHour += 0.04
            reasonFragments.append("she is sleeping with the lights on")
            reasonKeys.append("lights")
        }

        if dirtyLevel > 0 {
            joyDrainPerHour += 0.02 * 60
            reasonFragments.append("she needs to be cleaned")
            reasonKeys.append("dirty")
        }

        if attention < 0.30 && !isSleeping {
            joyDrainPerHour += 60 / 300
            reasonFragments.append("she really needs attention")
            reasonKeys.append("attention")
        }

        var effectiveHealthDrainPerHour = healthDrainPerHour
        if !isSleeping && joy < 0.50 {
            effectiveHealthDrainPerHour += 0.01 * 60
            reasonFragments.append("she already feels too low")
            reasonKeys.append("joy")
        }

        var hoursUntilDeath: Double?
        if effectiveHealthDrainPerHour > 0 {
            hoursUntilDeath = health / effectiveHealthDrainPerHour
        }

        if !isSleeping, joy > 0.50, joyDrainPerHour > 0 {
            let hoursUntilJoyTurnsCritical = (joy - 0.50) / joyDrainPerHour
            if hoursUntilJoyTurnsCritical >= 0 {
                let healthAtCriticalJoy = health - (healthDrainPerHour * hoursUntilJoyTurnsCritical)
                if healthAtCriticalJoy <= 0, healthDrainPerHour > 0 {
                    let directHoursUntilDeath = health / healthDrainPerHour
                    hoursUntilDeath = min(hoursUntilDeath ?? directHoursUntilDeath, directHoursUntilDeath)
                } else {
                    let postThresholdDrain = healthDrainPerHour + (0.01 * 60)
                    if postThresholdDrain > 0 {
                        let candidateHours = hoursUntilJoyTurnsCritical + (healthAtCriticalJoy / postThresholdDrain)
                        hoursUntilDeath = min(hoursUntilDeath ?? candidateHours, candidateHours)
                    }
                }
            }
        }

        guard let hoursUntilDeath, hoursUntilDeath.isFinite, hoursUntilDeath > 0 else {
            return nil
        }

        let uniqueReasons = Array(NSOrderedSet(array: reasonFragments)) as? [String] ?? reasonFragments
        let uniqueKeys = Array(NSOrderedSet(array: reasonKeys)) as? [String] ?? reasonKeys
        let summary: String
        switch uniqueReasons.prefix(2).count {
        case 0:
            summary = "Her health is dropping fast."
        case 1:
            summary = "\(uniqueReasons[0].prefix(1).uppercased())\(uniqueReasons[0].dropFirst())."
        default:
            summary = "\(uniqueReasons[0].prefix(1).uppercased())\(uniqueReasons[0].dropFirst()), and \(uniqueReasons[1])."
        }

        let secondsUntilDeath = hoursUntilDeath * 3_600
        let urgency = secondsUntilDeath <= 30 * 60
            ? "Check on her now."
            : "Please check on her soon."
        let body = "\(displayName) could die soon. \(summary) \(urgency)"
        let rawSignatureKey = uniqueKeys.prefix(3).joined(separator: "-")
        let signatureKey = rawSignatureKey.isEmpty ? "critical" : rawSignatureKey
        return (secondsUntilDeath, signatureKey, body)
    }

    private static func avatarEntry(for id: String) -> AuriAvatarCatalogEntry? {
        avatarCatalog.first { $0.id == id }
    }

    private static func outfitEntry(for id: String) -> AuriOutfitCatalogEntry? {
        return outfitCatalog.first { $0.id == id }
    }

    private static func relationshipEntry(for id: String) -> AuriRelationshipCatalogEntry? {
        relationshipCatalog.first { $0.id == id }
    }

    private static func normalizedOwnedAvatarIDs(from requestedIDs: [String]) -> Set<String> {
        let validIDs = Set(avatarCatalog.map(\.id))
        return Set(requestedIDs.filter { validIDs.contains($0) }).union(validIDs)
    }

    private static func resolvedSelectedAvatarID(requestedID: String?, ownedAvatarIDs: Set<String>) -> String {
        if let requestedID, ownedAvatarIDs.contains(requestedID), avatarEntry(for: requestedID) != nil {
            return requestedID
        }

        if let starter = avatarCatalog.first(where: { ownedAvatarIDs.contains($0.id) }) {
            return starter.id
        }

        return avatarCatalog[0].id
    }

    private static func normalizedOwnedOutfitIDs(from requestedIDs: [String]) -> Set<String> {
        let validIDs = Set(outfitCatalog.map(\.id))
        let starterIDs = Set(outfitCatalog.filter(\.startingUnlocked).map(\.id))
        return Set(requestedIDs.filter { validIDs.contains($0) }).union(starterIDs)
    }

    private static func resolvedSelectedOutfitID(requestedID: String?, ownedOutfitIDs: Set<String>) -> String? {
        guard let requestedID, ownedOutfitIDs.contains(requestedID), outfitEntry(for: requestedID) != nil else {
            return nil
        }
        return requestedID
    }

    private static func normalizedUnlockedRelationshipIDs(from requestedIDs: [String]) -> Set<String> {
        let validIDs = Set(relationshipCatalog.map(\.id))
        let starterIDs = Set(relationshipCatalog.filter(\.startingUnlocked).map(\.id))
        return Set(requestedIDs.filter { validIDs.contains($0) }).union(starterIDs)
    }

    private static func resolvedSelectedRelationshipID(requestedID: String?, unlockedRelationshipIDs: Set<String>) -> String {
        if let requestedID, unlockedRelationshipIDs.contains(requestedID), relationshipEntry(for: requestedID) != nil {
            return requestedID
        }

        if let starter = relationshipCatalog.first(where: { unlockedRelationshipIDs.contains($0.id) }) {
            return starter.id
        }

        return relationshipCatalog[0].id
    }

    private static func normalizedAuriName(_ rawValue: String) -> String? {
        let condensed = rawValue.split(whereSeparator: \.isWhitespace).joined(separator: " ")
        let trimmed = condensed.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            return nil
        }

        return String(trimmed.prefix(24))
    }

    private static func normalizedOwnerProfile(_ requestedProfile: AuriHumanProfile?) -> AuriHumanProfile? {
        guard let requestedProfile else {
            return nil
        }

        let condensedName = requestedProfile.fullName.split(whereSeparator: \.isWhitespace).joined(separator: " ")
        let trimmedName = condensedName.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedPronouns = requestedProfile.pronouns.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedName.isEmpty, !trimmedPronouns.isEmpty else {
            return nil
        }

        let normalizedValues = Array(Set(requestedProfile.coreValues.map {
            $0.trimmingCharacters(in: .whitespacesAndNewlines)
        }.filter { !$0.isEmpty })).sorted()
        let normalizedInterests = Array(Set(requestedProfile.interests.map {
            $0.trimmingCharacters(in: .whitespacesAndNewlines)
        }.filter { !$0.isEmpty })).sorted()

        let normalizedBirthday = AuriBirthday(
            month: min(max(requestedProfile.birthday.month, 1), 12),
            day: min(max(requestedProfile.birthday.day, 1), 31),
            year: min(max(requestedProfile.birthday.year, 1900), 2100)
        )

        return AuriHumanProfile(
            fullName: String(trimmedName.prefix(60)),
            pronouns: String(trimmedPronouns.prefix(40)),
            birthday: normalizedBirthday,
            coreValues: normalizedValues,
            interests: normalizedInterests
        )
    }

    private func clamp(_ value: Double, lower: Double = 0, upper: Double = 1) -> Double {
        min(max(value, lower), upper)
    }

    private func persistProfile() throws {
        let profile = AuriPlayerProfileState(
            coins: coins,
            ownedAvatarIDs: Array(ownedAvatarIDs).sorted(),
            selectedAvatarID: selectedAvatarID,
            ownedOutfitIDs: Array(ownedOutfitIDs).sorted(),
            selectedOutfitID: selectedOutfitID,
            unlockedRelationshipIDs: Array(unlockedRelationshipIDs).sorted(),
            selectedRelationshipID: selectedRelationshipID,
            lastOnboardingProfile: lastOnboardingProfile,
            lastPassiveCoinGrantAt: lastPassiveCoinGrantAt
        )
        let data = try encoder.encode(profile)
        let url = try Self.profileURL()
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try data.write(to: url, options: .atomic)
    }

    private static func persistenceURL() throws -> URL {
        let root = try FileManager.default.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        )
        return root.appending(path: "Auri/state.json")
    }

    private static func profileURL() throws -> URL {
        let root = try FileManager.default.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        )
        return root.appending(path: "Auri/profile.json")
    }

    private static func load(decoder: JSONDecoder) -> AuriSaveState? {
        guard let url = try? persistenceURL(),
              let data = try? Data(contentsOf: url),
              let state = try? decoder.decode(AuriSaveState.self, from: data) else {
            return nil
        }
        return state
    }

    private static func loadProfile(decoder: JSONDecoder) -> AuriPlayerProfileState? {
        guard let url = try? profileURL(),
              let data = try? Data(contentsOf: url),
              let profile = try? decoder.decode(AuriPlayerProfileState.self, from: data) else {
            return nil
        }
        return profile
    }
}

private enum AuriChatClientError: Error {
    case serviceNotConfigured
}

private enum AuriChatClient {
    private static let defaultProxyURLString = AuriRuntimeConfiguration.defaultChatProxyURLString

    static func reply(to message: String, context: AuriChatContext) async throws -> String {
        let endpointSource = context.proxyURLString.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            ? defaultProxyURLString
            : context.proxyURLString
        let endpoints = endpointCandidates(from: endpointSource)
        guard !endpoints.isEmpty else {
            throw AuriChatClientError.serviceNotConfigured
        }

        let payload = AuriProxyRequest(
            message: message,
            lifeID: context.lifeID,
            humanName: context.humanName,
            humanProfile: context.ownerProfile,
            relationshipStatus: context.relationshipStatus,
            auriState: AuriProxyAuriState(
                name: context.name,
                stage: "Auri",
                mood: context.mood.title,
                ageDays: context.ageDays,
                heightInches: context.heightInches,
                food: context.food,
                water: context.water,
                attention: context.attention,
                joy: context.joy,
                growth: context.growth,
                health: context.health,
                discipline: context.discipline,
                hunger: context.hunger,
                tired: context.tired,
                wantsSleep: context.wantsSleep,
                weightOunces: context.weightOunces,
                dirtyLevel: context.dirtyLevel,
                poopCount: context.dirtyLevel,
                sleeping: context.isSleeping,
                lightsOff: context.lightsOff,
                sick: context.medicineDosesRemaining > 0,
                medicineDosesRemaining: context.medicineDosesRemaining,
                needsAttention: context.needsAttention,
                needsDiscipline: context.needsDiscipline,
                alive: context.isAlive
            ),
            recentEvents: context.recentEvents.map {
                AuriProxyEvent(kind: $0.kind.rawValue, summary: $0.summary, date: $0.date)
            },
            conversation: context.conversation.map {
                AuriProxyMessage(role: $0.role == .auri ? "assistant" : "user", text: $0.text)
            }
        )

        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let body = try encoder.encode(payload)
        var lastError: Error = URLError(.cannotFindHost)

        for endpoint in endpoints {
            do {
                var request = URLRequest(url: endpoint)
                request.httpMethod = "POST"
                request.timeoutInterval = 120
                request.setValue("application/json", forHTTPHeaderField: "Content-Type")
                request.httpBody = body

                let (data, response) = try await URLSession.shared.data(for: request)
                guard let http = response as? HTTPURLResponse, 200..<300 ~= http.statusCode else {
                    throw URLError(.badServerResponse)
                }

                let envelope = try JSONDecoder().decode(AuriProxyReplyEnvelope.self, from: data)
                let trimmed = envelope.reply.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !trimmed.isEmpty else {
                    throw URLError(.cannotParseResponse)
                }
                return trimmed
            } catch let urlError as URLError where shouldRetry(after: urlError) {
                print("[AURI_CHAT] retryable transport error", endpoint.absoluteString, urlError.code.rawValue, urlError.localizedDescription)
                lastError = urlError
                continue
            } catch {
                print("[AURI_CHAT] terminal request error", endpoint.absoluteString, String(describing: error))
                lastError = error
                break
            }
        }

        throw lastError
    }

    static func resetRemoteLife(id lifeID: String, proxyURLString: String) async {
        let endpointSource = proxyURLString.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            ? defaultProxyURLString
            : proxyURLString
        let trimmedLifeID = lifeID.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedLifeID.isEmpty else {
            return
        }

        let endpoints = resetEndpointCandidates(from: endpointSource)
        guard !endpoints.isEmpty else {
            return
        }

        do {
            let body = try JSONEncoder().encode(AuriProxyResetRequest(lifeID: trimmedLifeID))

            for endpoint in endpoints {
                do {
                    var request = URLRequest(url: endpoint)
                    request.httpMethod = "POST"
                    request.timeoutInterval = 10
                    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
                    request.httpBody = body
                    _ = try await URLSession.shared.data(for: request)
                    return
                } catch let urlError as URLError where shouldRetry(after: urlError) {
                    continue
                } catch {
                    return
                }
            }
        } catch {
            return
        }
    }

    static func detectHumanName(from rawMessage: String, currentHumanName: String?) -> String? {
        let trimmed = rawMessage.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            return nil
        }

        let explicitPatterns = [#"(?i)^\s*(?:my name is|i am|i'm|im|call me|this is|it's|its)\s+([A-Za-z][A-Za-z' -]{0,30})\s*[.!?]?\s*$"#]
        let fullRange = NSRange(trimmed.startIndex..<trimmed.endIndex, in: trimmed)

        for pattern in explicitPatterns {
            guard let regex = try? NSRegularExpression(pattern: pattern),
                  let match = regex.firstMatch(in: trimmed, range: fullRange),
                  match.numberOfRanges > 1,
                  let captureRange = Range(match.range(at: 1), in: trimmed),
                  let normalized = normalizedHumanName(String(trimmed[captureRange])) else {
                continue
            }

            if !normalized.isEmpty {
                return normalized
            }
        }

        let currentTrimmed = currentHumanName?.trimmingCharacters(in: .whitespacesAndNewlines)
        if currentTrimmed?.isEmpty != false,
           trimmed.range(of: #"^[A-Za-z][A-Za-z' -]{0,30}$"#, options: .regularExpression) != nil {
            return normalizedHumanName(trimmed)
        }

        return nil
    }

    private static func normalizedHumanName(_ rawValue: String) -> String? {
        let condensed = rawValue
            .split(whereSeparator: \.isWhitespace)
            .joined(separator: " ")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard !condensed.isEmpty else {
            return nil
        }

        let pieces = condensed.split(separator: " ")
        guard !pieces.isEmpty, pieces.count <= 3 else {
            return nil
        }

        let clipped = String(condensed.prefix(32))
        return clipped.capitalized
    }

    private static func normalizedEndpoint(from rawValue: String) -> URL? {
        let trimmed = rawValue.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            return nil
        }

        let candidate = trimmed.contains("://") ? trimmed : "http://\(trimmed)"
        guard var components = URLComponents(string: candidate) else {
            return nil
        }

        if components.path.isEmpty || components.path == "/" {
            components.path = "/api/auri/chat"
        }

        return components.url
    }

    private static func normalizedResetEndpoint(from rawValue: String) -> URL? {
        guard var endpoint = normalizedEndpoint(from: rawValue),
              var components = URLComponents(url: endpoint, resolvingAgainstBaseURL: false) else {
            return nil
        }

        let normalizedPath = components.path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        if normalizedPath == "api/auri/chat" {
            components.path = "/api/auri/chat/reset"
        } else if components.path.hasSuffix("/api/auri/chat") {
            components.path += "/reset"
        } else {
            components.path = "/api/auri/chat/reset"
        }

        endpoint = components.url ?? endpoint
        return endpoint
    }

    private static func endpointCandidates(from rawValue: String) -> [URL] {
        candidateProxyURLStrings(from: rawValue).compactMap(normalizedEndpoint(from:))
    }

    private static func resetEndpointCandidates(from rawValue: String) -> [URL] {
        candidateProxyURLStrings(from: rawValue).compactMap(normalizedResetEndpoint(from:))
    }

    private static func candidateProxyURLStrings(from rawValue: String) -> [String] {
        let primary = rawValue.trimmingCharacters(in: .whitespacesAndNewlines)
        var candidates: [String] = []
        var seen = Set<String>()

        for candidate in [primary, defaultProxyURLString] where !candidate.isEmpty {
            if seen.insert(candidate).inserted {
                candidates.append(candidate)
            }
        }

        return candidates
    }

    private static func shouldRetry(after error: URLError) -> Bool {
        switch error.code {
        case .cannotFindHost, .dnsLookupFailed, .cannotConnectToHost, .networkConnectionLost, .notConnectedToInternet, .timedOut, .appTransportSecurityRequiresSecureConnection:
            return true
        default:
            return false
        }
    }
}

private enum AuriChessClient {
    private static let defaultProxyURLString = AuriRuntimeConfiguration.defaultChatProxyURLString

    static func fetchState(lifeID: String, proxyURLString: String) async throws -> AuriRemoteChessGame? {
        try await perform(action: "state", lifeID: lifeID, proxyURLString: proxyURLString)
    }

    static func startGame(
        lifeID: String,
        playerColor: AuriRemoteChessColor,
        proxyURLString: String
    ) async throws -> AuriRemoteChessGame {
        guard let game = try await perform(
            action: "start",
            lifeID: lifeID,
            playerColor: playerColor,
            proxyURLString: proxyURLString
        ) else {
            throw URLError(.cannotParseResponse)
        }

        return game
    }

    static func submitMove(
        lifeID: String,
        from: String,
        to: String,
        promotion: String?,
        proxyURLString: String
    ) async throws -> AuriRemoteChessGame {
        guard let game = try await perform(
            action: "move",
            lifeID: lifeID,
            from: from,
            to: to,
            promotion: promotion,
            proxyURLString: proxyURLString
        ) else {
            throw URLError(.cannotParseResponse)
        }

        return game
    }

    static func resignGame(lifeID: String, proxyURLString: String) async throws -> AuriRemoteChessGame {
        guard let game = try await perform(action: "resign", lifeID: lifeID, proxyURLString: proxyURLString) else {
            throw URLError(.cannotParseResponse)
        }

        return game
    }

    static func claimReward(lifeID: String, proxyURLString: String) async throws -> AuriRemoteChessGame {
        guard let game = try await perform(action: "claim_reward", lifeID: lifeID, proxyURLString: proxyURLString) else {
            throw URLError(.cannotParseResponse)
        }

        return game
    }

    private static func perform(
        action: String,
        lifeID: String,
        playerColor: AuriRemoteChessColor? = nil,
        from: String? = nil,
        to: String? = nil,
        promotion: String? = nil,
        proxyURLString: String
    ) async throws -> AuriRemoteChessGame? {
        let endpointSource = proxyURLString.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            ? defaultProxyURLString
            : proxyURLString
        let endpoints = endpointCandidates(from: endpointSource)
        guard !endpoints.isEmpty else {
            throw URLError(.badURL)
        }

        let payload = AuriProxyChessRequest(
            action: action,
            lifeID: lifeID,
            playerColor: playerColor,
            from: from,
            to: to,
            promotion: promotion
        )

        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let body = try encoder.encode(payload)
        var lastError: Error = URLError(.cannotFindHost)

        for endpoint in endpoints {
            do {
                var request = URLRequest(url: endpoint)
                request.httpMethod = "POST"
                request.timeoutInterval = 20
                request.setValue("application/json", forHTTPHeaderField: "Content-Type")
                request.httpBody = body

                let (data, response) = try await URLSession.shared.data(for: request)
                guard let http = response as? HTTPURLResponse, 200..<300 ~= http.statusCode else {
                    throw URLError(.badServerResponse)
                }

                let decoder = JSONDecoder()
                decoder.dateDecodingStrategy = .iso8601
                let envelope = try decoder.decode(AuriProxyChessEnvelope.self, from: data)
                return envelope.game
            } catch let urlError as URLError where shouldRetry(after: urlError) {
                lastError = urlError
                continue
            } catch {
                lastError = error
                break
            }
        }

        throw lastError
    }

    private static func normalizedEndpoint(from rawValue: String) -> URL? {
        let trimmed = rawValue.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            return nil
        }

        let candidate = trimmed.contains("://") ? trimmed : "http://\(trimmed)"
        guard var components = URLComponents(string: candidate) else {
            return nil
        }

        let normalizedPath = components.path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        switch normalizedPath {
        case "", "/":
            components.path = "/api/auri/chess"
        case "api/auri/chat", "api/auri/chat/reset":
            components.path = "/api/auri/chess"
        case "api/auri/chess":
            break
        default:
            if components.path.hasSuffix("/api/auri/chat") || components.path.hasSuffix("/api/auri/chat/reset") {
                components.path = "/api/auri/chess"
            } else if !components.path.hasSuffix("/api/auri/chess") {
                components.path = "/api/auri/chess"
            }
        }

        return components.url
    }

    private static func endpointCandidates(from rawValue: String) -> [URL] {
        candidateProxyURLStrings(from: rawValue).compactMap(normalizedEndpoint(from:))
    }

    private static func candidateProxyURLStrings(from rawValue: String) -> [String] {
        let primary = rawValue.trimmingCharacters(in: .whitespacesAndNewlines)
        var candidates: [String] = []
        var seen = Set<String>()

        for candidate in [primary, defaultProxyURLString] where !candidate.isEmpty {
            if seen.insert(candidate).inserted {
                candidates.append(candidate)
            }
        }

        return candidates
    }

    private static func shouldRetry(after error: URLError) -> Bool {
        switch error.code {
        case .cannotFindHost, .dnsLookupFailed, .cannotConnectToHost, .networkConnectionLost, .notConnectedToInternet, .timedOut, .appTransportSecurityRequiresSecureConnection:
            return true
        default:
            return false
        }
    }
}

private enum AuriConnect4Client {
    private static let defaultProxyURLString = AuriRuntimeConfiguration.defaultChatProxyURLString

    static func fetchState(lifeID: String, proxyURLString: String) async throws -> AuriRemoteConnect4Game? {
        try await perform(action: "state", lifeID: lifeID, proxyURLString: proxyURLString)
    }

    static func startGame(
        lifeID: String,
        humanStarts: Bool,
        proxyURLString: String
    ) async throws -> AuriRemoteConnect4Game {
        guard let game = try await perform(
            action: "start",
            lifeID: lifeID,
            humanStarts: humanStarts,
            proxyURLString: proxyURLString
        ) else {
            throw URLError(.cannotParseResponse)
        }

        return game
    }

    static func dropDisc(
        lifeID: String,
        column: Int,
        proxyURLString: String
    ) async throws -> AuriRemoteConnect4Game {
        guard let game = try await perform(
            action: "drop",
            lifeID: lifeID,
            column: column,
            proxyURLString: proxyURLString
        ) else {
            throw URLError(.cannotParseResponse)
        }

        return game
    }

    static func resignGame(lifeID: String, proxyURLString: String) async throws -> AuriRemoteConnect4Game {
        guard let game = try await perform(action: "resign", lifeID: lifeID, proxyURLString: proxyURLString) else {
            throw URLError(.cannotParseResponse)
        }

        return game
    }

    static func claimReward(lifeID: String, proxyURLString: String) async throws -> AuriRemoteConnect4Game {
        guard let game = try await perform(action: "claim_reward", lifeID: lifeID, proxyURLString: proxyURLString) else {
            throw URLError(.cannotParseResponse)
        }

        return game
    }

    private static func perform(
        action: String,
        lifeID: String,
        humanStarts: Bool? = nil,
        column: Int? = nil,
        proxyURLString: String
    ) async throws -> AuriRemoteConnect4Game? {
        let endpointSource = proxyURLString.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            ? defaultProxyURLString
            : proxyURLString
        let endpoints = endpointCandidates(from: endpointSource)
        guard !endpoints.isEmpty else {
            throw URLError(.badURL)
        }

        let payload = AuriProxyConnect4Request(
            action: action,
            lifeID: lifeID,
            humanStarts: humanStarts,
            column: column
        )

        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let body = try encoder.encode(payload)
        var lastError: Error = URLError(.cannotFindHost)

        for endpoint in endpoints {
            do {
                var request = URLRequest(url: endpoint)
                request.httpMethod = "POST"
                request.timeoutInterval = 20
                request.setValue("application/json", forHTTPHeaderField: "Content-Type")
                request.httpBody = body

                let (data, response) = try await URLSession.shared.data(for: request)
                guard let http = response as? HTTPURLResponse, 200..<300 ~= http.statusCode else {
                    throw URLError(.badServerResponse)
                }

                let decoder = JSONDecoder()
                decoder.dateDecodingStrategy = .iso8601
                let envelope = try decoder.decode(AuriProxyConnect4Envelope.self, from: data)
                return envelope.game
            } catch let urlError as URLError where shouldRetry(after: urlError) {
                lastError = urlError
                continue
            } catch {
                lastError = error
                break
            }
        }

        throw lastError
    }

    private static func normalizedEndpoint(from rawValue: String) -> URL? {
        let trimmed = rawValue.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            return nil
        }

        let candidate = trimmed.contains("://") ? trimmed : "http://\(trimmed)"
        guard var components = URLComponents(string: candidate) else {
            return nil
        }

        let normalizedPath = components.path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        switch normalizedPath {
        case "", "/":
            components.path = "/api/auri/connect4"
        case "api/auri/chat", "api/auri/chat/reset", "api/auri/chess":
            components.path = "/api/auri/connect4"
        case "api/auri/connect4":
            break
        default:
            if components.path.hasSuffix("/api/auri/chat")
                || components.path.hasSuffix("/api/auri/chat/reset")
                || components.path.hasSuffix("/api/auri/chess") {
                components.path = "/api/auri/connect4"
            } else if !components.path.hasSuffix("/api/auri/connect4") {
                components.path = "/api/auri/connect4"
            }
        }

        return components.url
    }

    private static func endpointCandidates(from rawValue: String) -> [URL] {
        candidateProxyURLStrings(from: rawValue).compactMap(normalizedEndpoint(from:))
    }

    private static func candidateProxyURLStrings(from rawValue: String) -> [String] {
        let primary = rawValue.trimmingCharacters(in: .whitespacesAndNewlines)
        var candidates: [String] = []
        var seen = Set<String>()

        for candidate in [primary, defaultProxyURLString] where !candidate.isEmpty {
            if seen.insert(candidate).inserted {
                candidates.append(candidate)
            }
        }

        return candidates
    }

    private static func shouldRetry(after error: URLError) -> Bool {
        switch error.code {
        case .cannotFindHost, .dnsLookupFailed, .cannotConnectToHost, .networkConnectionLost, .notConnectedToInternet, .timedOut, .appTransportSecurityRequiresSecureConnection:
            return true
        default:
            return false
        }
    }
}

@main
struct AuriApp: App {
    @Environment(\.scenePhase) private var scenePhase
    @State private var store = AuriStore()

    var body: some Scene {
        WindowGroup {
            AuriRootView(store: store)
                .onAppear {
                    store.start()
                }
                .onChange(of: scenePhase) { _, newPhase in
                    store.scenePhaseChanged(newPhase)
                }
        }
    }
}
