import Foundation

extension GLTF {
    public struct Matrix: Codable {
        public let values: [Float]

        public static var identity: Matrix {
            return .init(values: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])
        }
    }
}
