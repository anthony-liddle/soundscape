#if canImport(AVFoundation)
import AVFoundation
@testable import SoundscapePlayer
import Testing

/// What the player plays, heard without a speaker: AVAudioEngine's manual
/// rendering mode runs the same graph the device output does, the pool, the
/// cues' mixer and the main mixer, and hands back every sample.
@MainActor
@Suite struct ManualRenderingProofs {
    /// Every cue, one after another two seconds apart, on one output, each
    /// asked for 0.1 s ahead as the output runs.
    @Test(arguments: [(48000.0, 1), (44100.0, 1), (48000.0, 2)] as [(Double, AVAudioChannelCount)])
    func everyPeachCueComesOutAsItsRender(rate: Double, channels: AVAudioChannelCount) async throws {
        let (player, _) = try await manualPlayer(rate: rate, channels: channels)
        let renders = Peach.renders(at: rate)
        let spacing = Int(2 * rate)
        let first = Int(0.1 * rate)
        var expected = [Float](repeating: 0, count: spacing * renders.count)
        var out = [[Float]](repeating: [], count: Int(channels))
        for (i, name) in player.cueNames.enumerated() {
            let frame = first + i * spacing
            try player.play(name, at: Double(frame) / rate)
            lay(renders[name]!, into: &expected, at: frame)
            let rendered = try player.renderOffline(spacing)
            for c in out.indices { out[c] += rendered[c] }
        }
        for channel in out {
            let difference = firstDifference(channel, expected)
            #expect(difference == nil, "\(difference ?? "")")
        }
        #expect(player.cueNames.count == 34)
    }

    /// The engine's cues overlap and sum: so do the player's.
    @Test func twoOverlappingCuesComeOutAsTheSumOfTheirRenders() async throws {
        let (player, _) = try await manualPlayer()
        let renders = Peach.renders(at: 48000)
        var expected = [Float](repeating: 0, count: 96000)
        for (name, frame) in [("edition", 4800), ("found-5-rare", 24007)] {
            try player.play(name, at: Double(frame) / 48000)
            lay(renders[name]!, into: &expected, at: frame)
        }
        let out = try player.renderOffline(expected.count)[0]
        #expect(firstDifference(out, expected) == nil)
    }

    @Test func theSameCueTwiceOverlapsItself() async throws {
        let (player, _) = try await manualPlayer()
        let source = Peach.renders(at: 48000)["source"]!
        var expected = [Float](repeating: 0, count: 72000)
        for frame in [4800, 14400] {
            try player.play("source", at: Double(frame) / 48000)
            lay(source, into: &expected, at: frame)
        }
        #expect(firstDifference(try player.renderOffline(expected.count)[0], expected) == nil)
    }

    /// A time on the player's clock, a frame on the output, and nothing before it.
    @Test(arguments: [4800, 4801, 12345, 47999])
    func aCueAtATimeStartsOnTheFrameAskedFor(frame: Int) async throws {
        let (player, _) = try await manualPlayer()
        let tick = Peach.renders(at: 48000)["tick"]!
        try player.play("tick", at: Double(frame) / 48000)
        let out = try player.renderOffline(frame + tick.count + 100)[0]
        #expect(out[..<frame].allSatisfy { $0 == 0 })
        #expect(Array(out[frame..<(frame + tick.count)]) == tick)
        // The render's first sample is 0, its phase's start; its second is not
        #expect(out[frame + 1] != 0)
        #expect(out[(frame + tick.count)...].allSatisfy { $0 == 0 })
    }

    /// The same, asked for after the output has run a while, as a game asks.
    @Test func aCueAskedForWhileRunningStartsOnItsFrame() async throws {
        let (player, _) = try await manualPlayer()
        let tick = Peach.renders(at: 48000)["tick"]!
        _ = try player.renderOffline(48000)
        #expect(player.currentTime > 0.9)
        let frame = 48000 + 24000
        try player.play("tick", at: Double(frame) / 48000)
        let out = try player.renderOffline(48000)[0]
        let at = frame - 48000
        #expect(out[..<at].allSatisfy { $0 == 0 })
        #expect(Array(out[at..<(at + tick.count)]) == tick)
    }

    /// As the engine's playCue: a time to come is kept to the frame however
    /// near, and a time gone, or none, is now.
    @Test(arguments: [(nil, 0), (0.5, 0), (1.001, 48), (1.25, 12000)] as [(Double?, Int)])
    func aCueAskedForNowOrSoonStartsOnItsFrame(time: Double?, frame: Int) async throws {
        let (player, _) = try await manualPlayer()
        let invalid = Peach.renders(at: 48000)["invalid"]!
        _ = try player.renderOffline(48000)
        #expect(player.currentTime == 1)
        try player.play("invalid", at: time)
        var expected = [Float](repeating: 0, count: 24000)
        lay(invalid, into: &expected, at: frame)
        #expect(firstDifference(try player.renderOffline(24000)[0], expected) == nil)
    }

    /// Loading a document while cues ring leaves them ringing, to the end of
    /// their render, as the engine plays a replaced cue out, its effects'
    /// tail included (#123). A rendered buffer carries its whole tail.
    @Test func reloadingLeavesRingingCuesRinging() async throws {
        let (player, _) = try await manualPlayer()
        let edition = Peach.renders(at: 48000)["edition"]!
        try player.play("edition", at: 0.1)
        let head = try player.renderOffline(24000)[0]
        try await player.load(Peach.document)
        let tail = try player.renderOffline(96000)[0]
        var expected = [Float](repeating: 0, count: 120000)
        lay(edition, into: &expected, at: 4800)
        #expect(firstDifference(head + tail, expected) == nil)
    }
}
#endif
