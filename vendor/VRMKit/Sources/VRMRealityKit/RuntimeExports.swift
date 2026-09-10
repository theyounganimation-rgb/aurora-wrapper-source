@_exported import VRMKitRuntime

#if canImport(RealityKit)
import RealityKit

// MARK: - BlendShapeBindings

typealias BlendShapeBinding = VRMKitRuntime.BlendShapeBinding<Entity>
typealias BlendShapeClip = VRMKitRuntime.BlendShapeClip<Entity>
typealias MaterialValueBinding = VRMKitRuntime.MaterialValueBinding

// MARK: - Humanoid

public typealias Humanoid = VRMKitRuntime.Humanoid<Entity>
#endif
