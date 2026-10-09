#if canImport(AVFoundation)
import AVFoundation
import Soundscape
@testable import SoundscapePlayer
import Testing

/// The output's rate changes, as a device's does when headphones with
/// another rate connect: the engine posts `AVAudioEngineConfigurationChange`,
/// and the player builds a new engine and renders every cue again at the new
/// rate. A manual output changes rate when told to, and the notification is
/// posted for it as the system would post it.
@MainActor
@Suite(.timeLimit(.minutes(5))) struct RateChangeTests {
    /// Posts the change for the player's engine and waits for the rebuild.
    static func change(_ player: CuePlayer, _ output: CuePlayer.ManualOutput, to rate: Double) async throws {
        let engine = try #require(player.graph?.engine)
        output.sampleRate = rate
        NotificationCenter.default.post(name: .AVAudioEngineConfigurationChange, object: engine)
        while player.rebuilding == nil && player.sampleRate != rate { await Task.yield() }
        await player.settled()
    }

    @Test func rendersEveryCueAgainAtTheNewRate() async throws {
        let (player, output) = try await manualPlayer(rate: 48000)
        let at48 = Peach.renders(at: 48000)
        let at44 = Peach.renders(at: 44100)

        // Before: the 48 kHz render
        try player.play("found-5-rare", at: 0.1)
        var before = [Float](repeating: 0, count: 48000)
        lay(at48["found-5-rare"]!, into: &before, at: 4800)
        #expect(firstDifference(try player.renderOffline(48000)[0], before) == nil)

        try await Self.change(player, output, to: 44100)
        #expect(player.sampleRate == 44100)
        #expect(player.graph?.engine.manualRenderingFormat.sampleRate == 44100)

        // After: the 44.1 kHz render, sample for sample, of every cue
        let spacing = 88200
        var after = [Float](repeating: 0, count: spacing * at44.count)
        var out: [Float] = []
        for (i, name) in player.cueNames.enumerated() {
            let frame = 4410 + i * spacing
            try player.play(name, at: Double(frame) / 44100)
            lay(at44[name]!, into: &after, at: frame)
            out += try player.renderOffline(spacing)[0]
        }
        let difference = firstDifference(out, after)
        #expect(difference == nil, "\(difference ?? "")")
    }

    /// The player says what it did: started, saw the output change, rebuilt
    /// at the new rate, and started again for the next cue.
    @Test func reportsTheChangeAndTheRebuild() async throws {
        let (player, output) = try await manualPlayer(rate: 48000)
        let log = EventLog(player)
        #expect(player.outputChannelCount == 1)
        try player.play("tick")
        try await Self.change(player, output, to: 44100)
        try player.play("tick")
        #expect(log.events == [
            .started(sampleRate: 48000, channels: 1),
            .outputChanged,
            .rebuilt(sampleRate: 44100, channels: 1),
            .started(sampleRate: 44100, channels: 1),
        ])
    }

    /// A cue asked for while the cues are rendering again is skipped: there
    /// is nothing at the new rate to play yet, and the old engine is stopped.
    @Test func skipsACueWhileRenderingAgain() async throws {
        let (player, output) = try await manualPlayer(rate: 48000)
        let engine = try #require(player.graph?.engine)
        output.sampleRate = 44100
        NotificationCenter.default.post(name: .AVAudioEngineConfigurationChange, object: engine)
        while player.rebuilding == nil && player.sampleRate != 44100 { await Task.yield() }
        try player.play("tick")
        #expect(throws: CueRenderError.noCue("nope")) { try player.play("nope") }
        await player.settled()
        #expect(player.sampleRate == 44100)
        #expect(try player.renderOffline(48000)[0].allSatisfy { $0 == 0 })
    }

    /// Two changes close together: the later one's rate wins.
    @Test func theLastOfTwoChangesWins() async throws {
        let (player, output) = try await manualPlayer(rate: 48000)
        let first = try #require(player.graph?.engine)
        output.sampleRate = 96000
        NotificationCenter.default.post(name: .AVAudioEngineConfigurationChange, object: first)
        while player.rebuilding == nil { await Task.yield() }
        player.outputChanged()
        output.sampleRate = 44100
        player.outputChanged()
        await player.settled()
        #expect(player.sampleRate == 44100)
        try player.play("tick", at: 0.1)
        var expected = [Float](repeating: 0, count: 8820)
        lay(Peach.renders(at: 44100)["tick"]!, into: &expected, at: 4410)
        #expect(firstDifference(try player.renderOffline(8820)[0], expected) == nil)
    }

    /// A document loaded while the rate changes is rendered at the new rate.
    @Test func aLoadDuringAChangeRendersAtTheNewRate() async throws {
        let output = CuePlayer.ManualOutput(sampleRate: 48000)
        let player = CuePlayer(output: .manual(output))
        try player.build()
        output.sampleRate = 44100
        player.outputChanged()
        try await player.load(Peach.document)
        #expect(player.sampleRate == 44100)
        try player.play("tick", at: 0.1)
        var expected = [Float](repeating: 0, count: 8820)
        lay(Peach.renders(at: 44100)["tick"]!, into: &expected, at: 4410)
        #expect(firstDifference(try player.renderOffline(8820)[0], expected) == nil)
    }
}
#endif
