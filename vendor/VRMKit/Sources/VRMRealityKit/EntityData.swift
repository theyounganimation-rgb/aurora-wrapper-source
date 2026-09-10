#if canImport(RealityKit)
import RealityKit
import VRMKit
#if !os(watchOS)
import QuartzCore
#endif

@available(iOS 18.0, macOS 15.0, visionOS 2.0, *)
final class EntityData {
    var entities: [VRMEntity?]
    var cameras: [Entity?]
    var nodes: [Entity?]
    var skins: [MeshResource.Skeleton?]
    var skinJointRemaps: [[Int]?]
#if !os(watchOS)
    var animationChannels: [[CAAnimation?]?]
    var animationSamplers: [[CAAnimation?]?]
#endif
    var meshes: [Entity?]
    var accessors: [Any?]
    var durations: [CFTimeInterval?]
    var bufferViews: [Data?] = []
    var buffers: [Data?] = []
    var materials: [Material?] = []
    var textures: [TextureResource?] = []
    var images: [VRMImage?] = []

    init(vrm: GLTF) {
        entities = Array(repeating: nil, count: vrm.scenes?.count ?? 0)
        cameras = Array(repeating: nil, count: vrm.cameras?.count ?? 0)
        nodes = Array(repeating: nil, count: vrm.nodes?.count ?? 0)
        skins = Array(repeating: nil, count: vrm.skins?.count ?? 0)
        skinJointRemaps = Array(repeating: nil, count: vrm.skins?.count ?? 0)
#if !os(watchOS)
        animationChannels = Array(repeating: nil, count: vrm.animations?.count ?? 0)
        animationSamplers = Array(repeating: nil, count: vrm.animations?.count ?? 0)
#endif
        meshes = Array(repeating: nil, count: vrm.meshes?.count ?? 0)
        accessors = Array(repeating: nil, count: vrm.accessors?.count ?? 0)
        durations = Array(repeating: nil, count: vrm.accessors?.count ?? 0)
        bufferViews = Array(repeating: nil, count: vrm.bufferViews?.count ?? 0)
        buffers = Array(repeating: nil, count: vrm.buffers?.count ?? 0)
        materials = Array(repeating: nil, count: vrm.materials?.count ?? 0)
        textures = Array(repeating: nil, count: vrm.textures?.count ?? 0)
        images = Array(repeating: nil, count: vrm.images?.count ?? 0)
    }

    enum EntityDataError: Error {
        case outOfRange(keyPath: String, index: Int, count: Int)
    }

    func load<T>(_ keyPath: KeyPath<EntityData, [T]>, index: Int) throws -> T {
        let values = self[keyPath: keyPath]
        guard values.indices.contains(index) else {
            throw EntityDataError.outOfRange(keyPath: String(describing: keyPath), index: index, count: values.count)
        }
        return values[index]
    }
}
#endif
