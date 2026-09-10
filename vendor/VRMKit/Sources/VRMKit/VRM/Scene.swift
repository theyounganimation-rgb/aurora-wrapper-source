import Foundation

// https://github.com/KhronosGroup/glTF/blob/master/specification/2.0/README.md#scene

extension GLTF {
    public struct Scene: Codable {
        public let nodes: [Int]?
        public let name: String?
        public let extensions: CodableAny?
        public let extras: CodableAny?
    }
}
