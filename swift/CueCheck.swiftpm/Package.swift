// swift-tools-version: 6.0

// Cue Check, an app to hear Soundscape's cue player on an iPhone. For
// testing only: it is never submitted and never shipped. Open this folder in
// Xcode, choose your team under Signing & Capabilities, and run it on your
// phone; see README.md. Choosing a team writes it into teamIdentifier below.
import AppleProductTypes
import PackageDescription

let package = Package(
    name: "Cue Check",
    platforms: [
        .iOS("17.0"),
    ],
    products: [
        .iOSApplication(
            name: "Cue Check",
            targets: ["AppModule"],
            bundleIdentifier: "com.anthonyliddle.soundscape.cuecheck",
            teamIdentifier: "",
            displayVersion: "1.0",
            bundleVersion: "1",
            appIcon: .placeholder(icon: .note),
            accentColor: .presetColor(.orange),
            supportedDeviceFamilies: [
                .phone,
                .pad,
            ],
            supportedInterfaceOrientations: [
                .portrait,
                .landscapeRight,
                .landscapeLeft,
                .portraitUpsideDown(.when(deviceFamilies: [.pad])),
            ],
            appCategory: .music
        ),
    ],
    dependencies: [
        // This repository's root, where Soundscape's Package.swift is
        .package(path: "../.."),
    ],
    targets: [
        .executableTarget(
            name: "AppModule",
            dependencies: [
                .product(name: "Soundscape", package: "soundscape"),
            ],
            path: ".",
            exclude: ["README.md"],
            resources: [
                // A copy of conformance/cues/cases/peach-of-a-word.json, held to it by a test
                .copy("peach-of-a-word.json"),
            ]
        ),
    ]
)
