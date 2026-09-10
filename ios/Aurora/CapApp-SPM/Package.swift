// swift-tools-version: 5.9
import PackageDescription

// DO NOT MODIFY THIS FILE - managed by scripts/isolate-ios-projects.mjs
let package = Package(
    name: "AuroraCapAppSPM",
    platforms: [.iOS(.v15)],
    products: [
        .library(
            name: "AuroraCapAppSPM",
            targets: ["AuroraCapAppSPM"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", exact: "8.3.0")
    ],
    targets: [
        .target(
            name: "AuroraCapAppSPM",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm")
            ],
            path: "Sources/CapApp-SPM")
    ]
)
