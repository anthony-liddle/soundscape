#if canImport(AVFoundation)
import AVFoundation
#if canImport(UIKit)
import UIKit
#endif

extension CuePlayer {
    /// How a device output's sound sits with the phone's: what silent mode
    /// does to the cues, and what they do to other apps' audio. On iOS it is
    /// the audio session's category and options. Elsewhere there is no
    /// session, and the two are the same.
    public enum Session: Sendable, Equatable {
        /// `.ambient`: silent mode silences the cues, and other apps' audio
        /// plays on under them. The default, and the only session before 0.3.0.
        case ambient
        /// `.playback` with `.mixWithOthers`: the cues play in silent mode,
        /// for a game whose own setting is what silences it, and other apps'
        /// audio plays on under them, neither paused nor lowered.
        case playbackMixingWithOthers
    }
}

#if os(iOS)
extension CuePlayer.Session {
    var category: AVAudioSession.Category {
        switch self {
        case .ambient: .ambient
        case .playbackMixingWithOthers: .playback
        }
    }

    var options: AVAudioSession.CategoryOptions {
        switch self {
        case .ambient: []
        case .playbackMixingWithOthers: [.mixWithOthers]
        }
    }
}
#endif

/// On iOS, the session's category and options are the player's ``CuePlayer/Session``,
/// and activating it is the first thing a device output does, before it reads
/// the rate, which the session decides. Set every time, not once, because a
/// media services reset puts the category back to its default. Elsewhere there
/// is no session.
@MainActor
func activateTheSession(_ wanted: CuePlayer.Session) throws {
    #if os(iOS)
    let session = AVAudioSession.sharedInstance()
    if session.category != wanted.category || session.categoryOptions != wanted.options {
        try session.setCategory(wanted.category, mode: .default, options: wanted.options)
    }
    try session.setActive(true)
    #endif
}

extension CuePlayer {
    /// What the player does when the app or the system takes its audio away.
    /// Each stops the engine, at most; the next cue starts it again, so a game
    /// resumes its sound when the player next does something, as it should.
    ///
    /// Route changes need nothing of their own. One that changes the output's
    /// rate or channels, such as headphones connecting, stops the engine with
    /// `AVAudioEngineConfigurationChange`, which ``outputChanged()`` answers.
    /// Apple's advice to pause when headphones go applies to music and
    /// speech, which would carry on aloud; a cue is over in under two seconds,
    /// and the next one follows the person's own action.
    func observeTheSession() {
        #if os(iOS)
        let session = AVAudioSession.sharedInstance()
        #if compiler(>=6.4)
        if #available(iOS 27, *) {
            observers.on(AVAudioSession.didBecomeInactiveNotification, session) { [weak self] in self?.interrupted() }
            observers.on(AVAudioSession.resumptionRecommendationNotification, session, read: { note in
                let context = note.userInfo?[AVAudioSession.resumptionContextKey] as? AVAudioSession.ResumptionContext
                return context?.recommendation == .shouldResume
            }) { [weak self] shouldResume in
                if shouldResume { self?.resumed() }
            }
        } else {
            observeInterruptionsBefore27(session)
        }
        #else
        observeInterruptionsBefore27(session)
        #endif
        observers.on(AVAudioSession.mediaServicesWereResetNotification, session) { [weak self] in
            self?.mediaServicesReset()
        }
        observers.on(UIApplication.willResignActiveNotification, nil) { [weak self] in self?.wentInactive() }
        #endif
    }

    #if os(iOS)
    /// iOS 17 to 26: one notification, for an interruption's start and end.
    @available(iOS, deprecated: 27)
    private func observeInterruptionsBefore27(_ session: AVAudioSession) {
        observers.on(AVAudioSession.interruptionNotification, session, read: { note in
            let type = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt
            let options = note.userInfo?[AVAudioSessionInterruptionOptionKey] as? UInt ?? 0
            return (type.flatMap(AVAudioSession.InterruptionType.init), options)
        }) { [weak self] type, options in
            switch type {
            case .began:
                self?.interrupted()
            case .ended:
                if AVAudioSession.InterruptionOptions(rawValue: options).contains(.shouldResume) { self?.resumed() }
            default:
                break
            }
        }
    }
    #endif

    /// A call, an alarm or Siri took the session: the system has stopped the
    /// engine, and the player stops it too, so that it knows. The next cue
    /// starts it again, or throws if the session still cannot be had.
    func interrupted() {
        stop()
        onEvent?(.interrupted)
    }

    /// The interruption is over and the system suggests resuming: the
    /// session is made active now, so that the next cue starts promptly. The
    /// engine waits for that cue.
    func resumed() {
        try? activateTheSession(session)
        onEvent?(.resumable)
    }

    /// The app went inactive: the engine stops, and the first cue after the
    /// app comes back starts it.
    func wentInactive() {
        stop()
        onEvent?(.wentInactive)
    }

    /// The media services restarted, and every audio object with them: build
    /// a new engine, set the category again, and render every cue again. The
    /// sound waits for the next cue, as Apple asks.
    func mediaServicesReset() {
        onEvent?(.mediaServicesReset)
        rebuild()
    }
}
#endif
