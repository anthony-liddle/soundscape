#if canImport(AVFoundation)
import AVFoundation

/// The notifications a player listens to, removed when it goes.
final class Observers {
    private var engine: NSObjectProtocol?
    private var session: [NSObjectProtocol] = []

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

    /// Calls `handle` on the main actor with what `read` takes from each
    /// notification named `name`. A notification is not `Sendable`, so what
    /// the handler needs is read from it before it crosses.
    @MainActor
    func on<Value: Sendable>(
        _ name: Notification.Name,
        _ object: Any?,
        read: @escaping @Sendable (Notification) -> Value,
        _ handle: @escaping @MainActor (Value) -> Void
    ) {
        session.append(
            NotificationCenter.default.addObserver(forName: name, object: object, queue: .main) { note in
                let value = read(note)
                MainActor.assumeIsolated { handle(value) }
            }
        )
    }

    @MainActor
    func on(_ name: Notification.Name, _ object: Any?, _ handle: @escaping @MainActor () -> Void) {
        on(name, object, read: { _ in () }, handle)
    }

    deinit {
        for token in session + [engine].compactMap(\.self) {
            NotificationCenter.default.removeObserver(token)
        }
    }
}
#endif
