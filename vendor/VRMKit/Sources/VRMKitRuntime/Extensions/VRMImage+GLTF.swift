import Foundation
import VRMKit

package extension VRMImage {
    static func from(_ image: GLTF.Image,
                     relativeTo rootDirectory: URL?,
                     bufferView: (Int) throws -> Data) throws -> VRMImage {
        let data: Data
        if let uri = image.uri {
            data = try Data(gltfUrlString: uri, relativeTo: rootDirectory)
        } else if let bufferViewIndex = image.bufferView {
            data = try bufferView(bufferViewIndex)
        } else {
            throw VRMError._dataInconsistent("failed to load image: both uri and bufferView are nil")
        }

        return try VRMImage(data: data) ??? ._dataInconsistent("failed to create image from data")
    }
}
