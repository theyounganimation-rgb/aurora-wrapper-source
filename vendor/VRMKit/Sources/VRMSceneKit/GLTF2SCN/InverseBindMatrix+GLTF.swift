import VRMKit
import SceneKit

typealias InverseBindMatrix = NSValue

@available(*, deprecated, message: "Deprecated. Use VRMRealityKit instead.")
extension Array where Element == InverseBindMatrix {
    init(accessor: GLTF.Accessor, loader: VRMSceneLoader) throws {
        let (componentsPerVector, bytesPerComponent, vectorSize) = accessor.components()

        guard let bufferViewIndex = accessor.bufferView, accessor.type == .MAT4, accessor.componentType == .float else {
            self = (0..<accessor.count).map { _ in InverseBindMatrix(scnMatrix4: SCNMatrix4Identity) }
            return
        }

        let (bufferView, bufferStride) = try loader.bufferView(withBufferViewIndex: bufferViewIndex)
        let stride = bufferStride ?? vectorSize
        var matrices: [InverseBindMatrix] = []
        matrices.reserveCapacity(accessor.count)

        try bufferView.withUnsafeBytes { rawPointer in
            guard let pointer = rawPointer.bindMemory(to: UInt8.self).baseAddress else { return }
            var ptr = pointer.advanced(by: accessor.byteOffset)
            for _ in 0..<accessor.count {
                let rawPtr = UnsafeRawPointer(ptr)
                let values = (0..<componentsPerVector)
                    .map { rawPtr.load(fromByteOffset: $0*bytesPerComponent, as: Float.self) }
                matrices.append(InverseBindMatrix(scnMatrix4: try SCNMatrix4(values)))
                ptr = ptr.advanced(by: stride)
            }
        }
        
        self = matrices
    }
}
