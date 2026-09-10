import VRMKit
import SceneKit

@available(*, deprecated, message: "Deprecated. Use VRMRealityKit instead.")
extension SCNCamera {
    convenience init(camera: GLTF.Camera) throws {
        self.init()
        name = camera.name

        switch camera.type {
        case .perspective:
            let perspective = try camera.perspective ??? .keyNotFound("perspective")
            usesOrthographicProjection = false
            yFov = Double(perspective.yfov) * 180.0 / .pi
            if let aspectRatio = perspective.aspectRatio {
                xFov = yFov * Double(aspectRatio)
            }
            zNear = Double(perspective.znear)
            zFar = Double(perspective.zfar ?? .infinity)

        case .orthographic:
            let orthographic = try camera.orthographic ??? .keyNotFound("orthographic")
            usesOrthographicProjection = true
            orthographicScale = Double(orthographic.ymag)
            zNear = Double(orthographic.znear)
            zFar = Double(orthographic.zfar)
        }
    }
}
