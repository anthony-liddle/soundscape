#if canImport(AVFoundation)
import AVFoundation
import Soundscape

/// Plays a cue document's cues on Apple platforms, as the engine's `loadCues`
/// and `playCue` play them in a browser.
///
/// Every cue is rendered to a buffer when the document loads, off the main
/// thread, at the rate the output runs at, and rendered again if that rate
/// changes. Each cue plays on a voice of its own, an `AVAudioPlayerNode` from
/// a pool, started on the cue's own frame, so cues overlap and sum exactly,
/// as they do in the engine.
///
/// | Engine | CuePlayer |
/// |---|---|
/// | `loadCues(document)` | ``load(_:)``, or ``load(parsing:)`` for text |
/// | `getCueNames()` | ``cueNames`` |
/// | `playCue(name, when)` | ``play(_:at:)`` |
/// | `setCueVolume(volume)` | ``setCueVolume(_:)``, read back as ``cueVolume`` |
/// | `setCuesMuted(muted)` | ``cuesMuted`` |
/// | `context.currentTime` | ``currentTime`` |
/// | `initialize()`, `resume()` | nothing: a load or a cue starts what it needs |
/// | `destroy()` | ``stop()``, which the next cue undoes |
@MainActor
public final class CuePlayer {
    /// Where the cues go.
    public enum Output {
        /// The device's audio output, at whatever rate it runs. On iOS the
        /// session's category is `.ambient`: the Ring/Silent switch silences
        /// the cues, and they mix with whatever else is playing.
        case device
        /// Rendered on demand with ``renderOffline(_:)``, with no device: for
        /// tests and for rendering a game's sound to a file.
        case manual(ManualOutput)
    }

    /// The rate and channels of a manual output. Changing the rate and posting
    /// `AVAudioEngineConfigurationChange` for the player's engine is how a test
    /// changes rate, as a device does when headphones with another rate connect.
    @MainActor
    public final class ManualOutput {
        public var sampleRate: Double
        public let channels: AVAudioChannelCount

        public init(sampleRate: Double, channels: AVAudioChannelCount = 1) {
            self.sampleRate = sampleRate
            self.channels = channels
        }
    }

    /// How many cues can sound at once. Typing as fast as anyone can in Peach
    /// of a Word, 20 presses a second, needs 6; holding Enter down, with key
    /// repeat at its fastest, needs 9. See `PoolSizeTests` for the measurement.
    public static let defaultVoices = 8

    public let voiceCount: Int
    public private(set) var document: CueDocument?
    public var cueNames: [String] { document?.cueNames ?? [] }
    /// The rate the cues are rendered at: the output's.
    public private(set) var sampleRate: Double = 0
    public private(set) var cueVolume: Float = 1
    /// Mutes or unmutes every cue, including any ringing now.
    public var cuesMuted = false {
        didSet { applyGain() }
    }

    let output: Output
    private(set) var graph: Graph?
    private var buffers: [String: AVAudioPCMBuffer] = [:]
    private var generation = 0
    private var loads = 0
    private(set) var rebuilding: Task<Void, Never>?
    let observers = Observers()

    /// - Parameter voices: how many cues can sound at once, ``defaultVoices``
    ///   unless given. When every voice is busy, the cue that ends soonest is
    ///   cut to make room.
    public init(output: Output = .device, voices: Int = CuePlayer.defaultVoices) {
        precondition(voices > 0, "a player needs a voice")
        self.output = output
        voiceCount = voices
    }

    // MARK: Loading

    /// `loadCues`: renders every cue of a document at the output's rate, off
    /// the main thread. Cues already ringing from the previous document play
    /// out.
    ///
    /// - Throws: `CueDocumentError` for a feature ``CueRenderer`` cannot
    ///   render yet, refusing the whole document and keeping the one loaded
    ///   before, as the engine's `loadCues` keeps it when it throws.
    public func load(_ document: CueDocument) async throws {
        let problems = CueRenderer.unsupported(document)
        guard problems.isEmpty else { throw CueDocumentError(problems) }
        loads += 1
        let mine = loads
        while true {
            await settled()
            if graph == nil { try build() }
            let rate = graph!.rate
            let rendered = try await Self.render(document, at: rate)
            // A later load wins, as the engine's last loadCues does
            guard mine == loads else { return }
            // The rate changed while rendering: render again at the new one
            guard rebuilding == nil, let graph, graph.rate == rate else { continue }
            self.document = document
            buffers = Self.buffers(rendered, format: graph.format)
            return
        }
    }

    /// Reads, validates and loads a document's JSON text.
    public func load(parsing text: String) async throws {
        try await load(CueDocument(parsing: text))
    }

    nonisolated static func render(_ document: CueDocument, at rate: Double) async throws -> [String: [Float]] {
        try await Task.detached(priority: .userInitiated) {
            let renderer = try CueRenderer(document, sampleRate: rate)
            var out: [String: [Float]] = [:]
            for name in document.cueNames { out[name] = try renderer.render(name) }
            return out
        }.value
    }

    static func buffers(_ rendered: [String: [Float]], format: AVAudioFormat) -> [String: AVAudioPCMBuffer] {
        rendered.mapValues { samples in
            let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(max(1, samples.count)))!
            buffer.frameLength = AVAudioFrameCount(samples.count)
            for channel in 0..<Int(format.channelCount) {
                buffer.floatChannelData![channel].update(from: samples, count: samples.count)
            }
            return buffer
        }
    }

    // MARK: Playing

    /// `playCue`: plays a cue from the loaded document, on a frame of its own.
    ///
    /// - Parameter time: seconds on the player's clock, ``currentTime``. As
    ///   in the engine, a time to come is kept to the frame, and a time gone,
    ///   or none, is now. A voice's start reaches a device's audio at its next
    ///   render cycle, so a cue whose frame comes sooner starts then, whole,
    ///   as Web Audio starts a source whose time has passed: on a Mac, within
    ///   512 frames, about 11 ms.
    /// - Throws: ``CuePlayerError/notLoaded`` before a document is loaded, and
    ///   `CueRenderError.noCue` for a name the document lacks, as the engine
    ///   throws. It also throws the engine's error if the engine cannot start,
    ///   as during a phone call; a game can ignore that one.
    ///
    /// While the player renders again for a new output rate, a cue asked for
    /// is skipped: there is nothing at the new rate to play yet.
    public func play(_ name: String, at time: Double? = nil) throws {
        guard let document else { throw CuePlayerError.notLoaded }
        guard document.cues[name] != nil else { throw CueRenderError.noCue(name) }
        guard rebuilding == nil else { return }
        guard let graph, let buffer = buffers[name] else {
            // The last rebuild failed, the output gone: try again
            outputChanged()
            return
        }
        try start(graph)

        let now = currentFrame(graph)
        let asked = time.map { AVAudioFramePosition(($0 * graph.rate).rounded()) }
        let starts = max(asked ?? now, now)
        // A voice whose cue has finished, or, when every voice has a cue still
        // to finish, the one that finishes soonest, cut now to make room
        let voice = graph.voices.first { $0.busyUntil <= now } ?? graph.voices.min { $0.busyUntil < $1.busyUntil }!
        try voice.play(buffer, at: starts, on: graph)
    }

    /// Seconds of output since the engine started, as the engine's
    /// `currentTime` counts them. It reads 0 while the engine is stopped, and
    /// counts from 0 again when the next cue starts it, after an interruption,
    /// a reset or the background, where a suspended `AudioContext` keeps its time.
    public var currentTime: Double {
        guard let graph else { return 0 }
        return Double(currentFrame(graph)) / graph.rate
    }

    private func currentFrame(_ graph: Graph) -> AVAudioFramePosition {
        guard graph.rendered, let rendered = graph.clock.lastRenderTime,
              let time = graph.clock.playerTime(forNodeTime: rendered)
        else { return 0 }
        return time.sampleTime
    }

    // MARK: Volume

    /// `setCueVolume`: the volume of every cue, as a linear gain. 1, the
    /// default, leaves each note at its level, and above 1 is allowed.
    public func setCueVolume(_ volume: Float) throws {
        guard volume.isFinite, volume >= 0 else { throw CuePlayerError.volume(volume) }
        cueVolume = volume
        applyGain()
    }

    private func applyGain() {
        graph?.mixer.outputVolume = cuesMuted ? 0 : cueVolume
    }

    // MARK: The engine

    /// Builds the engine at the output's rate, without starting it.
    func build() throws {
        install(try Graph(output: output, voices: voiceCount))
    }

    private func install(_ graph: Graph) {
        self.graph = graph
        sampleRate = graph.rate
        applyGain()
        observers.watch(graph.engine) { [weak self] in self?.outputChanged() }
    }

    /// Starts the engine if it is not running, after a stop, an interruption
    /// or the background. A player node left playing across a stop renders
    /// nothing new until it is stopped and played again, so the clock starts
    /// over, at 0 at the next render, as on the first start, and every voice
    /// waits for its next cue.
    func start(_ graph: Graph) throws {
        guard !graph.engine.isRunning else { return }
        if case .device = output { try activateTheSession() }
        try graph.engine.start()
        graph.clock.stop()
        try playNode(graph.clock)
        for voice in graph.voices {
            voice.node.stop()
            voice.busyUntil = 0
        }
    }

    /// The output changed rate or channels: build a new engine and render
    /// every cue again at the new rate. Called from a task, never inside the
    /// notification's handler, where releasing an engine can deadlock. A
    /// newer change outranks an older one still rendering.
    func outputChanged() {
        generation += 1
        let mine = generation
        let old = graph
        rebuilding = Task { @MainActor in
            defer { if mine == self.generation { self.rebuilding = nil } }
            old?.engine.stop()
            do {
                let next = try Graph(output: self.output, voices: self.voiceCount)
                var rendered: [String: AVAudioPCMBuffer] = [:]
                if let document = self.document {
                    let samples = try await Self.render(document, at: next.rate)
                    rendered = Self.buffers(samples, format: next.format)
                }
                guard mine == self.generation else { return }
                self.buffers = rendered
                self.install(next)
            } catch {
                // No output to build on, or a render refused: the next cue tries again
                guard mine == self.generation else { return }
                self.graph = nil
                self.buffers = [:]
            }
        }
    }

    /// Returns once any rebuild for a new rate has finished.
    public func settled() async {
        while let task = rebuilding { await task.value }
    }

    /// `destroy`: stops the engine. A later cue starts it again.
    public func stop() {
        graph?.engine.stop()
    }

    // MARK: Manual rendering

    /// Renders the next `frames` frames of a manual output, one array per channel.
    public func renderOffline(_ frames: Int) throws -> [[Float]] {
        guard case .manual = output else { throw CuePlayerError.notManual }
        if graph == nil { try build() }
        let graph = graph!
        try start(graph)
        let format = graph.engine.manualRenderingFormat
        let chunk = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 4096)!
        var out = [[Float]](repeating: [], count: Int(format.channelCount))
        var left = frames
        while left > 0 {
            let status = try graph.engine.renderOffline(AVAudioFrameCount(min(left, 4096)), to: chunk)
            guard status == .success else { throw CuePlayerError.renderFailed }
            for c in out.indices {
                out[c] += UnsafeBufferPointer(start: chunk.floatChannelData![c], count: Int(chunk.frameLength))
            }
            left -= Int(chunk.frameLength)
        }
        return out
    }
}

/// One voice of the pool, and the frame on the player's clock its cue ends.
@MainActor
final class Voice {
    let node = AVAudioPlayerNode()
    var busyUntil: AVAudioFramePosition = 0

    /// Plays a cue from frame `starts` of the clock, cutting whatever the
    /// voice was playing. A player node takes in a buffer scheduled while it
    /// plays on a thread of its own, and drops it if its time has passed by
    /// then: in manual mode under load, a few cues in 200 never sounded. A
    /// buffer scheduled before the node plays goes in with the play. So the
    /// voice stops, the cue goes on it at the start of its timeline, and the
    /// voice starts on the cue's own frame of the engine's: both explicit
    /// sample times.
    func play(_ buffer: AVAudioPCMBuffer, at starts: AVAudioFramePosition, on graph: Graph) throws {
        node.stop()
        node.scheduleBuffer(buffer, at: AVAudioTime(sampleTime: 0, atRate: graph.rate))
        try playNode(node, at: graph.nodeTime(starts))
        busyUntil = starts + AVAudioFramePosition(buffer.frameLength)
    }
}

/// One engine at one rate: the voices, a silent clock that plays while the
/// engine runs, which times are read against, and the cues' own mixer for
/// their volume.
@MainActor
final class Graph {
    let engine = AVAudioEngine()
    let clock = AVAudioPlayerNode()
    let mixer = AVAudioMixerNode()
    let voices: [Voice]
    let rate: Double
    let format: AVAudioFormat

    init(output: CuePlayer.Output, voices count: Int) throws {
        let channels: AVAudioChannelCount
        switch output {
        case .device:
            try activateTheSession()
            let hardware = engine.outputNode.outputFormat(forBus: 0)
            rate = hardware.sampleRate
            channels = hardware.channelCount
        case .manual(let manual):
            rate = manual.sampleRate
            channels = manual.channels
            guard rate > 0, let rendering = AVAudioFormat(standardFormatWithSampleRate: rate, channels: channels) else {
                throw CuePlayerError.noOutput
            }
            try engine.enableManualRenderingMode(.offline, format: rendering, maximumFrameCount: 4096)
        }
        // Mono to stereo as Web Audio mixes it, the cue in each channel at
        // full level, so the cues carry their channels: a mixer pans a mono
        // input, at 0.71 a side, and an output converts it to the left alone
        guard rate > 0, channels > 0,
              let format = AVAudioFormat(standardFormatWithSampleRate: rate, channels: min(channels, 2))
        else { throw CuePlayerError.noOutput }
        self.format = format
        voices = (0..<count).map { _ in Voice() }
        engine.attach(mixer)
        engine.attach(clock)
        // Connected at the output's own rate, so nothing is resampled: left
        // alone in manual mode, the main mixer runs at the device's rate
        try connectNode(engine, engine.mainMixerNode, to: engine.outputNode, format: format)
        try connectNode(engine, mixer, to: engine.mainMixerNode, format: format)
        try connectNode(engine, clock, to: mixer, format: format)
        for voice in voices {
            engine.attach(voice.node)
            try connectNode(engine, voice.node, to: mixer, format: format)
        }
    }

    /// A frame on the clock's timeline as the engine's time.
    func nodeTime(_ frame: AVAudioFramePosition) -> AVAudioTime {
        let onClock = AVAudioTime(sampleTime: frame, atRate: rate)
        guard rendered else { return onClock }
        return clock.nodeTime(forPlayerTime: onClock) ?? onClock
    }

    /// Whether the engine has rendered since it started. Until it has, the
    /// nodes' times are not valid, and converting them raises.
    var rendered: Bool { clock.lastRenderTime?.isSampleTimeValid == true }
}

/// Why a cue could not be played, beyond why it could not be rendered
/// (`CueRenderError`).
public enum CuePlayerError: Error, Equatable, Sendable, CustomStringConvertible {
    case notLoaded
    case volume(Float)
    case notManual
    case renderFailed
    case noOutput

    public var description: String {
        switch self {
        case .notLoaded: "No cue document is loaded. Call load first."
        case .volume(let v): "Cue volume must be a finite number, 0 or more; got \(v)"
        case .notManual: "Only a manual output renders offline."
        case .renderFailed: "The engine could not render offline."
        case .noOutput: "There is no audio output to play to."
        }
    }
}

// The 27 SDKs replace AVAudioEngine.connect and AVAudioPlayerNode.play with
// versions that throw, and deprecate the old ones. Peach's floor is iOS 17,
// and an older Xcode has neither, so each is chosen at run time and at
// compile time.

@MainActor
func connectNode(_ engine: AVAudioEngine, _ node: AVAudioNode, to next: AVAudioNode, format: AVAudioFormat) throws {
    #if compiler(>=6.4)
    if #available(iOS 27, macOS 27, *) {
        try engine.connectNode(node, to: next, format: format)
        return
    }
    #endif
    connectBefore27(engine, node, next, format)
}

@MainActor
func playNode(_ node: AVAudioPlayerNode, at time: AVAudioTime? = nil) throws {
    #if compiler(>=6.4)
    if #available(iOS 27, macOS 27, *) {
        try node.playAudio(at: time)
        return
    }
    #endif
    playBefore27(node, time)
}

@available(iOS, deprecated: 27)
@available(macOS, deprecated: 27)
@MainActor
private func connectBefore27(
    _ engine: AVAudioEngine, _ node: AVAudioNode, _ next: AVAudioNode, _ format: AVAudioFormat
) {
    engine.connect(node, to: next, format: format)
}

@available(iOS, deprecated: 27)
@available(macOS, deprecated: 27)
@MainActor
private func playBefore27(_ node: AVAudioPlayerNode, _ time: AVAudioTime?) {
    node.play(at: time)
}
#endif
