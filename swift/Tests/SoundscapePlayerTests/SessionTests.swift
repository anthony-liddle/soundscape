#if os(iOS)
import AVFoundation
@testable import SoundscapePlayer
import Testing
import UIKit

/// What a device output does when the app or the system takes its audio
/// away, in the iOS Simulator. Each notification is posted as the system
/// posts it; the session cannot be interrupted on demand. Whether the cue
/// that starts the engine again plays on time is `LifecycleTests`' to show,
/// in manual mode; these show the engine stopped and started.
@MainActor
@Suite(.serialized, .timeLimit(.minutes(5))) struct SessionTests {
    static let session = AVAudioSession.sharedInstance()

    static func devicePlayer() async throws -> (CuePlayer, AVAudioEngine) {
        let player = CuePlayer(output: .device)
        try await player.load(Peach.document)
        try player.play("tick")
        let engine = try #require(player.graph?.engine)
        #expect(engine.isRunning)
        return (player, engine)
    }

    /// iOS 27's notification on 27 and later, the older one before.
    static func interrupt() {
        #if compiler(>=6.4)
        if #available(iOS 27, *) {
            NotificationCenter.default.post(name: AVAudioSession.didBecomeInactiveNotification, object: session)
            return
        }
        #endif
        interruptBefore27()
    }

    @available(iOS, deprecated: 27)
    static func interruptBefore27() {
        NotificationCenter.default.post(
            name: AVAudioSession.interruptionNotification,
            object: session,
            userInfo: [AVAudioSessionInterruptionTypeKey: AVAudioSession.InterruptionType.began.rawValue]
        )
    }

    @Test func anInterruptionStopsTheEngineAndTheNextCueStartsIt() async throws {
        let (player, engine) = try await Self.devicePlayer()
        Self.interrupt()
        #expect(!engine.isRunning)
        try player.play("tick")
        #expect(engine.isRunning)
        player.stop()
    }

    @Test func goingInactiveStopsTheEngineAndTheNextCueStartsIt() async throws {
        let (player, engine) = try await Self.devicePlayer()
        NotificationCenter.default.post(name: UIApplication.willResignActiveNotification, object: nil)
        #expect(!engine.isRunning)
        // Coming back does nothing; the next cue does it
        NotificationCenter.default.post(name: UIApplication.didBecomeActiveNotification, object: nil)
        #expect(!engine.isRunning)
        try player.play("tick")
        #expect(engine.isRunning)
        player.stop()
    }

    /// A reset puts the category back to its default; the player builds a
    /// new engine and sets `.ambient` again, and waits for a cue to start it.
    @Test func aMediaServicesResetBuildsEverythingAgain() async throws {
        let (player, before) = try await Self.devicePlayer()
        try Self.session.setCategory(.soloAmbient)
        NotificationCenter.default.post(name: AVAudioSession.mediaServicesWereResetNotification, object: Self.session)
        await player.settled()
        let after = try #require(player.graph?.engine)
        #expect(after !== before)
        #expect(!before.isRunning)
        #expect(!after.isRunning)
        #expect(Self.session.category == .ambient)
        try player.play("tick")
        #expect(after.isRunning)
        player.stop()
    }

    /// The rate rendered at is the rate the output runs at.
    @Test func aDeviceOutputIsAmbientAtTheOutputsRate() async throws {
        let (player, engine) = try await Self.devicePlayer()
        #expect(Self.session.category == .ambient)
        #expect(player.sampleRate == Self.session.sampleRate)
        #expect(engine.outputNode.outputFormat(forBus: 0).sampleRate == player.sampleRate)
        player.stop()
    }

    /// A manual output has no session: an interruption leaves it running.
    @Test func aManualOutputIgnoresTheSession() async throws {
        let (player, _) = try await manualPlayer()
        _ = try player.renderOffline(512)
        let engine = try #require(player.graph?.engine)
        Self.interrupt()
        NotificationCenter.default.post(name: UIApplication.willResignActiveNotification, object: nil)
        #expect(engine.isRunning)
    }
}
#endif
