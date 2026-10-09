#if canImport(AVFoundation)
import AVFoundation
import Soundscape
@testable import SoundscapePlayer
import Testing

/// Peach of a Word's cue file, from the shared corpus, and what the renderer
/// makes of it: what the player must play, sample for sample.
enum Peach {
    static let text: String = {
        var parts = String(#filePath).split(separator: "/", omittingEmptySubsequences: false)
        parts.removeLast(4)  // swift/Tests/SoundscapePlayerTests/Support.swift
        let path = parts.joined(separator: "/") + "/conformance/cues/cases/peach-of-a-word.json"
        return try! String(contentsOfFile: path, encoding: .utf8)
    }()

    static let document = try! CueDocument(parsing: text)

    static func renders(at rate: Double) -> [String: [Float]] {
        let renderer = try! CueRenderer(document, sampleRate: rate)
        var out: [String: [Float]] = [:]
        for name in document.cueNames { out[name] = try! renderer.render(name) }
        return out
    }
}

/// A player on a manual output, with Peach's cues loaded.
@MainActor
func manualPlayer(
    rate: Double = 48000,
    channels: AVAudioChannelCount = 1,
    voices: Int = CuePlayer.defaultVoices
) async throws -> (CuePlayer, CuePlayer.ManualOutput) {
    let output = CuePlayer.ManualOutput(sampleRate: rate, channels: channels)
    let player = CuePlayer(output: .manual(output), voices: voices)
    try await player.load(Peach.document)
    return (player, output)
}

/// `cue` laid into `into` from frame `at`, summed with what is there.
func lay(_ cue: [Float], into out: inout [Float], at: Int) {
    for (i, sample) in cue.enumerated() where at + i < out.count { out[at + i] += sample }
}

/// Where two signals first differ, for a failure that says where.
func firstDifference(_ a: [Float], _ b: [Float], tolerance: Float = 0) -> String? {
    guard a.count == b.count else { return "lengths \(a.count) and \(b.count)" }
    guard let i = a.indices.first(where: { abs(a[$0] - b[$0]) > tolerance }) else { return nil }
    return "frame \(i): \(a[i]) against \(b[i])"
}
#endif
