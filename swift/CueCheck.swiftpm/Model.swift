import AVFoundation
import Observation
import Soundscape
import SoundscapePlayer
import SwiftUI

/// The player, the cues of the document it has loaded, what the output is
/// doing, and a log of every session event the player handles.
@MainActor
@Observable
final class Model {
    struct Entry: Identifiable {
        let id = UUID()
        let time = Date()
        let text: String
    }

    /// The documents the app plays: Peach's, as the game does, and every
    /// feature cue the Swift renderer is held to, to hear beside Safari.
    enum Document: String, CaseIterable, Identifiable {
        case peach = "Peach's cues"
        case everyFeature = "Every feature"

        var id: Self { self }

        /// Its file in the app's bundle, a copy of the repository's.
        var resource: String {
            switch self {
            case .peach: "peach-of-a-word"
            case .everyFeature: "every-feature.cues"
            }
        }
    }

    let player = CuePlayer()
    private(set) var document = Document.peach
    private(set) var loading = false
    private(set) var names: [String] = []
    /// How long the last load took, rendering every cue at the output's rate.
    private(set) var loadTime: Duration?
    /// Bytes the loaded document's renders hold: every frame of every cue, in
    /// every channel of the output, four bytes each, as the player keeps them.
    private(set) var held: Int?
    /// The app's whole memory footprint, as the system counts it against its limit.
    private(set) var footprint: UInt64?
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

    /// Peach's cues, the first time the app opens.
    func load() async {
        guard names.isEmpty else { return }
        await load(.peach)
    }

    /// Loads a document, rendering every cue, and times it.
    func load(_ next: Document) async {
        guard !loading else { return }
        loading = true
        defer { loading = false }
        guard let url = Bundle.main.url(forResource: next.resource, withExtension: "json") else {
            problem = "\(next.rawValue) are missing from the app."
            return
        }
        do {
            let text = try String(contentsOf: url, encoding: .utf8)
            let start = ContinuousClock.now
            try await player.load(parsing: text)
            loadTime = ContinuousClock.now - start
            document = next
            problem = nil
            names = player.cueNames
            held = names.reduce(0) { total, name in
                let frames = Int(((player.duration(of: name) ?? 0) * player.sampleRate).rounded())
                return total + max(1, frames) * player.outputChannelCount * MemoryLayout<Float>.size
            }
            note("loaded \(next.rawValue), \(names.count) cues, in \(loadText), holding \(heldText)")
        } catch {
            problem = "\(error)"
        }
        refreshOutput()
    }

    var loadText: String {
        guard let loadTime else { return "not yet" }
        let seconds = Double(loadTime.components.seconds) + Double(loadTime.components.attoseconds) / 1e18
        return "\(seconds.formatted(.number.precision(.fractionLength(2)))) s"
    }

    var heldText: String { held.map(Self.mebibytes) ?? "not yet" }

    var footprintText: String { footprint.map { Self.mebibytes(Int($0)) } ?? "unknown" }

    nonisolated static func mebibytes(_ bytes: Int) -> String {
        "\((Double(bytes) / 1_048_576).formatted(.number.precision(.fractionLength(1)))) MiB"
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
        footprint = Self.footprint()
    }

    /// The app's memory footprint, as Xcode's memory gauge and the system's
    /// limit count it.
    nonisolated static func footprint() -> UInt64? {
        var info = task_vm_info_data_t()
        var count = mach_msg_type_number_t(MemoryLayout<task_vm_info_data_t>.size / MemoryLayout<integer_t>.size)
        let result = withUnsafeMutablePointer(to: &info) {
            $0.withMemoryRebound(to: integer_t.self, capacity: Int(count)) {
                task_info(mach_task_self_, task_flavor_t(TASK_VM_INFO), $0, &count)
            }
        }
        return result == KERN_SUCCESS ? info.phys_footprint : nil
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
