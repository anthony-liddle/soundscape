#if canImport(AVFoundation)
import Soundscape
@testable import SoundscapePlayer
import Testing

/// The player's API, held to the engine's: the same names in, the same
/// errors out.
@MainActor
@Suite struct CuePlayerTests {
    @Test func listsTheLoadedDocumentsCuesAsTheEngineDoes() async throws {
        let player = CuePlayer(output: .manual(.init(sampleRate: 48000)))
        #expect(player.cueNames == [])
        try await player.load(parsing: Peach.text)
        #expect(player.cueNames == Peach.document.cueNames)
        #expect(player.cueNames.count == 34)
        #expect(player.sampleRate == 48000)
    }

    @Test func refusesACueBeforeADocumentIsLoaded() {
        let player = CuePlayer(output: .manual(.init(sampleRate: 48000)))
        #expect(throws: CuePlayerError.notLoaded) { try player.play("tick") }
        #expect(CuePlayerError.notLoaded.description == "No cue document is loaded. Call load first.")
    }

    @Test func refusesAnUnknownCueWithTheEnginesError() async throws {
        let (player, _) = try await manualPlayer()
        #expect(throws: CueRenderError.noCue("nope")) { try player.play("nope") }
        // packages/engine/src/audio/AudioEngine.ts, playCue
        #expect(CueRenderError.noCue("nope").description == #"No cue named "nope" in the loaded cue document."#)
    }

    @Test func refusesAnInvalidDocumentWithTheValidatorsProblems() async throws {
        let player = CuePlayer(output: .manual(.init(sampleRate: 48000)))
        await #expect(throws: CueDocumentError.self) { try await player.load(parsing: "[]") }
        #expect(player.document == nil)
    }

    @Test func refusesAVolumeTheEngineRefuses() async throws {
        let (player, _) = try await manualPlayer()
        for bad in [-1, .nan, .infinity] as [Float] {
            #expect(throws: CuePlayerError.self) { try player.setCueVolume(bad) }
        }
        #expect(player.cueVolume == 1)
        // The engine's RangeError, word for word but for the number's spelling
        #expect(CuePlayerError.volume(-1).description == "Cue volume must be a finite number, 0 or more; got -1.0")
        try player.setCueVolume(0)
        try player.setCueVolume(2.5)
        #expect(player.cueVolume == 2.5)
    }

    @Test func scalesEveryCueByTheVolume() async throws {
        let (player, _) = try await manualPlayer()
        try player.setCueVolume(0.5)
        try player.play("tick", at: 0.25)
        let out = try player.renderOffline(24000)[0]
        let tick = Peach.renders(at: 48000)["tick"]!
        var expected = [Float](repeating: 0, count: 24000)
        lay(tick.map { $0 * 0.5 }, into: &expected, at: 12000)
        #expect(firstDifference(out, expected) == nil)
    }

    @Test func mutesEveryCueIncludingOnesRingingNow() async throws {
        let (player, _) = try await manualPlayer()
        try player.play("edition", at: 0.25)
        let before = try player.renderOffline(24000)[0]
        player.cuesMuted = true
        // A mixer fades a change of volume in rather than stepping it, over
        // about 27 ms at small render cycles and one cycle at large ones, where
        // the engine's gain steps at the next 128-frame quantum
        let fade = try player.renderOffline(4096)[0]
        let during = try player.renderOffline(24000)[0]
        player.cuesMuted = false
        let after = try player.renderOffline(24000)[0]
        #expect(before.contains { $0 != 0 })
        #expect(fade.contains { $0 != 0 })
        #expect(during.allSatisfy { $0 == 0 })
        #expect(after.contains { $0 != 0 })
        #expect(player.cueVolume == 1)
    }
}
#endif
