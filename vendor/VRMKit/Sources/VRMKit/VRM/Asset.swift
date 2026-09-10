import Foundation

// https://github.com/KhronosGroup/glTF/blob/master/specification/2.0/README.md#asset-1

extension GLTF {
    public struct Asset: Codable {
        public let copyright: String?
        public let generator: String?
        public let version: String
        public let minVersion: String?
        public let extensions: CodableAny?
        public let extras: CodableAny?
    }
}
