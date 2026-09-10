import SceneKit

@available(*, deprecated, message: "Deprecated. Use VRMRealityKit instead.")
open class VRMScene: SCNScene {
    public let vrmNode: VRMNode

    init(node: VRMNode) {
        self.vrmNode = node
        super.init()
        rootNode.addChildNode(vrmNode)
    }

    required public init?(coder aDecoder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }
}
