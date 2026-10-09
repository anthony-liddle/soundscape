#if canImport(AVFoundation)
import AVFoundation

/// On iOS, the session's category is `.ambient`, and activating it is the
/// first thing a device output does, before it reads the rate, which the
/// session decides. Set every time, not once, because a media services reset
/// puts the category back to its default. Elsewhere there is no session.
@MainActor
func activateTheSession() throws {
    #if os(iOS)
    let session = AVAudioSession.sharedInstance()
    if session.category != .ambient { try session.setCategory(.ambient) }
    try session.setActive(true)
    #endif
}
#endif
