import Foundation

// https://github.com/KhronosGroup/glTF/blob/master/specification/2.0/README.md#texture

extension GLTF {
    public struct Texture: Codable {
        public let sampler: Int?
        public let source: Int
        public let name: String?
        public let extensions: CodableAny?
        public let extras: CodableAny?
    }
}
