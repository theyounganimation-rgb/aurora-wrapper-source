import simd

package extension SIMD3 where Scalar == Float {
    var normalized: SIMD3 {
        simd_normalize(self)
    }

    var length: Scalar {
        simd_length(self)
    }

    var length_squared: Scalar {
        simd_length_squared(self)
    }

    mutating func normalize() {
        self = normalized
    }
}

package extension simd_quatf {
    static func * (_ left: simd_quatf, _ right: SIMD3<Float>) -> SIMD3<Float> {
        simd_act(left, right)
    }
}

package let quat_identity_float = simd_quatf(matrix_identity_float4x4)

package func cross(_ left: SIMD3<Float>, _ right: SIMD3<Float>) -> SIMD3<Float> {
    simd_cross(left, right)
}

package func normal(_ v0: SIMD3<Float>, _ v1: SIMD3<Float>, _ v2: SIMD3<Float>) -> SIMD3<Float> {
    let e1 = v1 - v0
    let e2 = v2 - v0
    return simd_normalize(simd_cross(e1, e2))
}

package extension simd_float4x4 {
    var translation: SIMD3<Float> {
        SIMD3<Float>(columns.3.x, columns.3.y, columns.3.z)
    }

    func multiplyPoint(_ v: SIMD3<Float>) -> SIMD3<Float> {
        let result = simd_mul(self, SIMD4<Float>(v.x, v.y, v.z, 1))
        guard result.w != 0 else {
            return SIMD3<Float>(result.x, result.y, result.z)
        }
        return SIMD3<Float>(result.x / result.w, result.y / result.w, result.z / result.w)
    }
}
