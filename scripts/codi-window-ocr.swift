#!/usr/bin/swift

import AppKit
import CoreGraphics
import Foundation
import Vision

struct WindowBounds: Codable {
    let x: Double
    let y: Double
    let width: Double
    let height: Double
}

struct Payload: Codable {
    let ok: Bool
    let windowId: Int?
    let ownerName: String?
    let title: String?
    let text: String?
    let error: String?
    let bounds: WindowBounds?
}

func encode(_ payload: Payload) {
    let encoder = JSONEncoder()
    encoder.outputFormatting = []
    guard let data = try? encoder.encode(payload),
          let text = String(data: data, encoding: .utf8) else {
        fputs("{\"ok\":false,\"error\":\"Failed to encode OCR payload.\"}\n", stderr)
        exit(1)
    }
    print(text)
}

func fail(_ message: String) -> Never {
    encode(Payload(ok: false, windowId: nil, ownerName: nil, title: nil, text: "", error: message, bounds: nil))
    exit(0)
}

func findCodexWindow() -> (windowId: Int, ownerName: String, title: String?, bounds: WindowBounds)? {
    guard let rawWindows = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] else {
        return nil
    }

    for info in rawWindows {
        let ownerName = (info[kCGWindowOwnerName as String] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard ownerName == "Codex" else {
            continue
        }

        let layer = info[kCGWindowLayer as String] as? Int ?? 0
        guard layer == 0 else {
            continue
        }

        let boundsRecord = info[kCGWindowBounds as String] as? [String: Any] ?? [:]
        let width = boundsRecord["Width"] as? Double ?? 0
        let height = boundsRecord["Height"] as? Double ?? 0
        guard width > 420, height > 320 else {
            continue
        }

        let x = boundsRecord["X"] as? Double ?? 0
        let y = boundsRecord["Y"] as? Double ?? 0
        let windowId = info[kCGWindowNumber as String] as? Int ?? 0
        let title = info[kCGWindowName as String] as? String
        return (
            windowId: windowId,
            ownerName: ownerName,
            title: title?.trimmingCharacters(in: .whitespacesAndNewlines),
            bounds: WindowBounds(x: x, y: y, width: width, height: height)
        )
    }

    return nil
}

func captureWindow(windowId: Int) throws -> URL {
    let url = URL(fileURLWithPath: NSTemporaryDirectory())
        .appendingPathComponent("codi-window-\(windowId)-\(UUID().uuidString).png")

    let process = Process()
    process.executableURL = URL(fileURLWithPath: "/usr/sbin/screencapture")
    process.arguments = ["-x", "-l", String(windowId), url.path]
    try process.run()
    process.waitUntilExit()

    guard process.terminationStatus == 0 else {
        throw NSError(domain: "codi-window-ocr", code: Int(process.terminationStatus), userInfo: [
            NSLocalizedDescriptionKey: "screencapture failed for window \(windowId)."
        ])
    }

    return url
}

func recognizeText(in imageURL: URL) throws -> String {
    guard let image = NSImage(contentsOf: imageURL),
          let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
        throw NSError(domain: "codi-window-ocr", code: 2, userInfo: [
            NSLocalizedDescriptionKey: "Failed to load the captured Codex window image."
        ])
    }

    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = true

    let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
    try handler.perform([request])

    let observations = (request.results ?? [])
        .compactMap { observation -> (String, CGRect)? in
            guard let candidate = observation.topCandidates(1).first else {
                return nil
            }

            let text = candidate.string.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !text.isEmpty else {
                return nil
            }

            return (text, observation.boundingBox)
        }
        .sorted { left, right in
            if abs(left.1.maxY - right.1.maxY) > 0.02 {
                return left.1.maxY > right.1.maxY
            }
            return left.1.minX < right.1.minX
        }

    return observations.map(\.0).joined(separator: "\n")
}

guard let window = findCodexWindow() else {
    fail("Codex window not found.")
}

do {
    let imageURL = try captureWindow(windowId: window.windowId)
    defer {
        try? FileManager.default.removeItem(at: imageURL)
    }

    let text = try recognizeText(in: imageURL)
    encode(
        Payload(
            ok: true,
            windowId: window.windowId,
            ownerName: window.ownerName,
            title: window.title,
            text: text,
            error: nil,
            bounds: window.bounds
        )
    )
} catch {
    fail(error.localizedDescription)
}
