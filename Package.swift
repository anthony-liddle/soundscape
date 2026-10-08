// swift-tools-version: 5.9
import PackageDescription

// Soundscape for Swift: the cue format, read and validated exactly as the
// TypeScript engine in packages/engine reads it. The package lives at the
// repository root because SwiftPM can only depend on a package by URL when its
// manifest is there; its sources are under swift/.
//
// 5.9 is the lowest tools version that can declare iOS 17 and macOS 14, Peach's
// floor, and both the Linux Swift in CI and the local Xcode read it.
let package = Package(
    name: "Soundscape",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [
        .library(name: "Soundscape", targets: ["Soundscape"]),
    ],
    targets: [
        .target(name: "Soundscape", path: "swift/Sources/Soundscape"),
        .testTarget(
            name: "SoundscapeTests",
            dependencies: ["Soundscape"],
            path: "swift/Tests/SoundscapeTests"
        ),
    ]
)
