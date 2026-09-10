import Foundation

public enum VRMError: Error {
    case notSupported(String)
    case notSupportedVersion(UInt32)
    case notSupportedChunkType(UInt32)
    case keyNotFound(String)
    case dataInconsistent(String)
    case thumbnailNotFound
}

package extension VRMError {
    static func _notSupported(_ message: @autoclosure () -> String,
                              file: StaticString = #file,
                              function: StaticString = #function,
                              line: UInt = #line) -> VRMError {
        .notSupported("\(function)@\(file)[\(line)]: \(message())")
    }

    static func _dataInconsistent(_ message: @autoclosure () -> String,
                                  file: StaticString = #file,
                                  function: StaticString = #function,
                                  line: UInt = #line) -> VRMError {
        .dataInconsistent("\(function)@\(file)[\(line)]: \(message())")
    }
}
