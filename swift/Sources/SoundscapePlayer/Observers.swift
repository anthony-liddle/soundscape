#if canImport(AVFoundation)
import AVFoundation

/// The notification a player listens to, its engine's, removed when it goes.
final class Observers {
    private var engine: NSObjectProtocol?

    /// Calls `changed` on the main actor when `engine`'s output changes rate
    /// or channels, in place of any engine watched before. The notification
    /// arrives on an internal queue, where the engine must not be released;
    /// the main queue receives it after.
    @MainActor
    func watch(_ engine: AVAudioEngine, _ changed: @escaping @MainActor () -> Void) {
        if let token = self.engine { NotificationCenter.default.removeObserver(token) }
        self.engine = NotificationCenter.default.addObserver(
            forName: .AVAudioEngineConfigurationChange,
            object: engine,
            queue: .main
        ) { _ in MainActor.assumeIsolated { changed() } }
    }

    deinit {
        if let engine { NotificationCenter.default.removeObserver(engine) }
    }
}
#endif
