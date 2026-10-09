#if canImport(AVFoundation)
extension CuePlayer {
    /// What the player did about its output or its session, for an app that
    /// wants to show it or log it. See ``CuePlayer/onEvent``.
    public enum Event: Equatable, Sendable, CustomStringConvertible {
        /// A cue started the engine: the first cue, or the first after a stop.
        case started(sampleRate: Double, channels: Int)
        /// A call, an alarm or Siri took the session, and the engine stopped.
        case interrupted
        /// The interruption is over and the system suggests resuming. The
        /// player tries to make the session active again, and the next cue
        /// starts the engine.
        case resumable
        /// The app went inactive, and the engine stopped.
        case wentInactive
        /// The output changed rate or channels: every cue renders again.
        case outputChanged
        /// The media services restarted: everything is built again.
        case mediaServicesReset
        /// A new engine is ready at the output's rate, with every cue rendered for it.
        case rebuilt(sampleRate: Double, channels: Int)
        /// Building again failed, with the reason; the next cue tries again.
        case rebuildFailed(String)

        public var description: String {
            switch self {
            case .started(let rate, let channels): "started at \(Int(rate)) Hz, \(channels) ch"
            case .interrupted: "interrupted, engine stopped"
            case .resumable: "interruption over, resuming"
            case .wentInactive: "app went inactive, engine stopped"
            case .outputChanged: "output changed, rendering every cue again"
            case .mediaServicesReset: "media services reset, building everything again"
            case .rebuilt(let rate, let channels): "rebuilt at \(Int(rate)) Hz, \(channels) ch"
            case .rebuildFailed(let reason): "rebuilding failed: \(reason)"
            }
        }
    }
}
#endif
