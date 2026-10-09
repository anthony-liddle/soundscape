// swift-tools-version: 6.0
import PackageDescription

// Soundscape for Swift: the cue format, read and validated exactly as the
// TypeScript engine in packages/engine reads it, rendered as it renders it,
// and played. The package lives at the repository root because SwiftPM can
// only depend on a package by URL when its manifest is there; its sources are
// under swift/.
//
// Tools version 6.0, for Swift 6 language mode and its concurrency checking,
// now that the player hands work between threads. Platforms are Peach's floor.
//
// Soundscape reads and renders with the standard library and the C library
// alone, so it builds and tests on Linux. SoundscapePlayer is the AVFoundation
// part, in a target of its own, and builds to nothing where AVFoundation is
// missing. Both ship in the one Soundscape product.
let package = Package(
    name: "Soundscape",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [
        .library(name: "Soundscape", targets: ["Soundscape", "SoundscapePlayer"]),
    ],
    targets: [
        .target(name: "Soundscape", path: "swift/Sources/Soundscape"),
        .target(name: "SoundscapePlayer", dependencies: ["Soundscape"], path: "swift/Sources/SoundscapePlayer"),
        .executableTarget(
            name: "soundscape-play",
            dependencies: ["Soundscape", "SoundscapePlayer"],
            path: "swift/Sources/soundscape-play"
        ),
        .testTarget(
            name: "SoundscapeTests",
            dependencies: ["Soundscape"],
            path: "swift/Tests/SoundscapeTests"
        ),
        .testTarget(
            name: "SoundscapePlayerTests",
            dependencies: ["Soundscape", "SoundscapePlayer"],
            path: "swift/Tests/SoundscapePlayerTests"
        ),
    ]
)
