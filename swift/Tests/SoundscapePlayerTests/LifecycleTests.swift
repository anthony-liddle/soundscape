#if canImport(AVFoundation)
@testable import SoundscapePlayer
import Testing

/// The engine stops, for an interruption, the background or ``CuePlayer/stop()``,
/// and the next cue starts it again: on time, whole, and with every cue
/// ringing before the stop gone.
@MainActor
@Suite struct LifecycleTests {
    @Test func theNextCueAfterAStopStartsTheEngineAndPlaysOnTime() async throws {
        let (player, _) = try await manualPlayer()
        let tick = Peach.renders(at: 48000)["tick"]!
        try player.play("edition", at: 0.1)
        _ = try player.renderOffline(24000)
        let engine = try #require(player.graph?.engine)
        player.stop()
        #expect(!engine.isRunning)
        #expect(player.currentTime == 0)

        try player.play("tick", at: 0.2)
        #expect(engine.isRunning)
        var expected = [Float](repeating: 0, count: 48000)
        lay(tick, into: &expected, at: 9600)
        // The edition, cut by the stop, does not come back
        #expect(firstDifference(try player.renderOffline(48000)[0], expected) == nil)
    }

    @Test func aCueAskedForNowAfterAStopPlaysWhole() async throws {
        let (player, _) = try await manualPlayer()
        _ = try player.renderOffline(48000)
        player.stop()
        try player.play("found-3-set")
        let found = Peach.renders(at: 48000)["found-3-set"]!
        let out = try player.renderOffline(48000)[0]
        let start = try #require(out.firstIndex { $0 != 0 }) - 1
        #expect(Array(out[start..<(start + found.count)]) == found)
    }

    /// Stopping twice, or before anything has played, is harmless.
    @Test func stoppingIsAlwaysSafe() async throws {
        let (player, _) = try await manualPlayer()
        player.stop()
        player.stop()
        try player.play("tick", at: 0.1)
        var expected = [Float](repeating: 0, count: 9600)
        lay(Peach.renders(at: 48000)["tick"]!, into: &expected, at: 4800)
        #expect(firstDifference(try player.renderOffline(9600)[0], expected) == nil)
    }
}
#endif
