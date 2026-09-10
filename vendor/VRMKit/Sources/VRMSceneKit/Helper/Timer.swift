import Foundation

@available(*, deprecated, message: "Deprecated. Use VRMRealityKit instead.")
final class Timer {
    private var lastUpdateTime = TimeInterval()
    
    func deltaTime(updateAtTime time: TimeInterval) -> TimeInterval {
        if lastUpdateTime == 0 {
            lastUpdateTime = time
        }
        let deltaTime: TimeInterval = time - lastUpdateTime
        lastUpdateTime = time
        return deltaTime
    }
}
