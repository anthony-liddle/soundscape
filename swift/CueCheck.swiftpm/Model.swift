import AVFoundation
import Observation
import Soundscape
import SoundscapePlayer
import SwiftUI

/// The player, Peach's cues, what the output is doing, and a log of every
/// session event the player handles.
@MainActor
@Observable
final class Model {
    struct Entry: Identifiable {
        let id = UUID()
        let time = Date()
        let text: String
    }

    let player = CuePlayer()
    private(set) var names: [String] = []
    private(set) var problem: String?
    private(set) var log: [Entry] = []
    private(set) var asked = 0
    private(set) var volume: Float = 1
    private(set) var muted = false
    /// What the session says the output is now.
    private(set) var output = ""
    /// What the player read from the output, and renders at.
    private(set) var rendering = ""
    @ObservationIgnored private var routeObserver: NSObjectProtocol?

    init() {
        player.onEvent = { [weak self] event in
            self?.note("player: \(event)")
            self?.refreshOutput()
        }
        // Route changes are the system's, not the player's: shown beside its
        // events, because a new route is what makes the output change
        routeObserver = NotificationCenter.default.addObserver(
            forName: AVAudioSession.routeChangeNotification,
            object: nil,
            queue: .main
        ) { [weak self] note in
            let raw = note.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt ?? 0
            let reason = AVAudioSession.RouteChangeReason(rawValue: raw).map(Self.describe) ?? "unknown"
            MainActor.assumeIsolated {
                self?.note("route: \(reason)")
                self?.refreshOutput()
            }
        }
    }

    func load() async {
        guard names.isEmpty else { return }
        guard let url = Bundle.main.url(forResource: "peach-of-a-word", withExtension: "json") else {
            problem = "Peach's cue file is missing from the app."
            return
        }
        do {
            try await player.load(parsing: String(contentsOf: url, encoding: .utf8))
            names = player.cueNames
            note("loaded \(names.count) cues")
        } catch {
            problem = "\(error)"
        }
        refreshOutput()
    }

    func play(_ name: String) {
        do {
            try player.play(name)
            asked += 1
        } catch {
            note("could not play \(name): \(error)")
        }
    }

    /// A five-letter word typed at 20 presses a second, the fastest bursts
    /// of the fastest typists, then Enter: a tick on each press, then the
    /// found cue for a five-letter word.
    func typeFast() async {
        for _ in 0..<5 {
            play("tick")
            try? await Task.sleep(for: .milliseconds(50))
        }
        play("found-5-set")
    }

    func setVolume(_ volume: Float) {
        do {
            try player.setCueVolume(volume)
            self.volume = volume
        } catch {
            note("could not set the volume: \(error)")
        }
    }

    func setMuted(_ muted: Bool) {
        player.cuesMuted = muted
        self.muted = muted
    }

    func note(_ text: String) {
        log.append(Entry(text: text))
    }

    func refreshOutput() {
        let session = AVAudioSession.sharedInstance()
        let ports = session.currentRoute.outputs.map(\.portName).joined(separator: ", ")
        output = "\(Int(session.sampleRate)) Hz, \(session.outputNumberOfChannels) ch, \(ports)"
        rendering = player.sampleRate > 0
            ? "\(Int(player.sampleRate)) Hz, \(player.outputChannelCount) ch"
            : "not built yet"
    }

    nonisolated static func describe(_ reason: AVAudioSession.RouteChangeReason) -> String {
        switch reason {
        case .newDeviceAvailable: "new device"
        case .oldDeviceUnavailable: "device gone"
        case .categoryChange: "category changed"
        case .override: "override"
        case .wakeFromSleep: "wake from sleep"
        case .noSuitableRouteForCategory: "no route for the category"
        case .routeConfigurationChange: "configuration changed"
        case .unknown: "unknown"
        @unknown default: "reason \(reason.rawValue)"
        }
    }
}
