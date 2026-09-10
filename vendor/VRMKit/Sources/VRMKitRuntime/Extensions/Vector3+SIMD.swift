import VRMKit

package extension VRM0.Vector3 {
    var simd: SIMD3<Float> {
        SIMD3<Float>(x: Float(x), y: Float(y), z: Float(z))
    }
}
