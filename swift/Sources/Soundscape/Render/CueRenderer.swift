#if canImport(Darwin)
import Darwin
#elseif canImport(Glibc)
import Glibc
#endif

/// Renders a cue document's cues offline to samples, as the engine's
/// `playCue` sounds them in an `OfflineAudioContext`: each note an oscillator
/// through its own gain envelope and, unless its filter is `'none'`, a biquad,
/// summed at the cue output with its volume at 1.
///
/// What it renders is the oscillator, envelope and filter path: every
/// waveform, every envelope shape, the pitch offset and every filter. A
/// document with any instrument that needs more is refused whole, as
/// `loadCues` refuses an invalid one, with a problem for each field at fault
/// (see ``unsupported(_:)``).
///
/// Its tables are built once, for the waveforms the document uses at its rate,
/// so a renderer, like a context, has one sample rate.
public struct CueRenderer: Sendable {
    public let document: CueDocument
    public let sampleRate: Double
    private let tables: [CueInstrument.Waveform: BandLimitedTables]

    /// The rates an `OfflineAudioContext` accepts.
    public static let sampleRates: ClosedRange<Double> = 3000...768_000

    /// Readies a validated document for rendering at `sampleRate`.
    ///
    /// - Throws: ``CueDocumentError`` listing every field this renderer cannot
    ///   play yet, or ``CueRenderError/sampleRate(_:)``.
    public init(_ document: CueDocument, sampleRate: Double) throws {
        guard Self.sampleRates.contains(sampleRate) else { throw CueRenderError.sampleRate(sampleRate) }
        let problems = Self.unsupported(document)
        guard problems.isEmpty else { throw CueDocumentError(problems) }
        self.document = document
        self.sampleRate = sampleRate
        let waveforms = Set(document.instruments.values.map(\.waveform))
        tables = Dictionary(uniqueKeysWithValues: waveforms.map { ($0, BandLimitedTables($0, sampleRate: sampleRate)) })
    }

    /// Reads, validates and readies a document in one step: the validator's
    /// problems if it is invalid, otherwise this renderer's if it is unsupported.
    public init(parsing text: String, sampleRate: Double) throws {
        try self.init(CueDocument(parsing: text), sampleRate: sampleRate)
    }

    /// Every field that needs more than the oscillator, envelope and filter
    /// path, in the document's instrument order and, within an instrument, in
    /// the order below. The line is the engine's own:
    ///
    /// - `lfoDepth` above 0: the engine builds an LFO only then, so any rate
    ///   and target are fine at depth 0.
    /// - `unisonDetune` above 0: the engine adds a second oscillator when
    ///   `unisonDetune * 50 > 0`.
    /// - `delayTime`, `delayFeedback`, `delayMix` or `distortion` other than
    ///   exactly 0: the engine builds an effects chain unless every effect is 0
    ///   (`asksForNoEffect`), so a delay time of 0.25 with a mix of 0, which
    ///   would be silent, is still refused. `-0` is 0.
    ///
    /// Every instrument is checked, used by a cue or not, as `loadCues` builds
    /// a chain for every instrument.
    public static func unsupported(_ document: CueDocument) -> [CueProblem] {
        var problems: [CueProblem] = []
        for name in document.instrumentNames {
            let i = document.instruments[name]!
            let base = "instruments.\(name)"
            if i.lfoDepth > 0 {
                problems.append(CueProblem(path: "\(base).lfoDepth", message: "must be 0: the LFO is not rendered yet"))
            }
            if i.unisonDetune * 50 > 0 {
                problems.append(CueProblem(path: "\(base).unisonDetune", message: "must be 0: unison is not rendered yet"))
            }
            for (key, value) in [("delayTime", i.delayTime), ("delayFeedback", i.delayFeedback), ("delayMix", i.delayMix)]
            where value != 0 {
                problems.append(CueProblem(path: "\(base).\(key)", message: "must be 0: delay is not rendered yet"))
            }
            if i.distortion != 0 {
                problems.append(CueProblem(path: "\(base).distortion", message: "must be 0: distortion is not rendered yet"))
            }
        }
        return problems
    }

    /// The frame a render starting at `start` begins on: the frame on or before it.
    public static func firstFrame(of start: Double, sampleRate: Double) -> Int {
        Int((start * sampleRate).rounded(.down))
    }

    /// Renders one cue, played at `start` seconds on a context's clock that
    /// began at 0, as `playCue(name, start)` would be.
    ///
    /// - Returns: mono float32 samples from the frame on or before `start`,
    ///   ``firstFrame(of:sampleRate:)``, through the last frame any note
    ///   sounds, a filter's ring included.
    /// - Throws: ``CueRenderError/noCue(_:)`` for a name the document lacks.
    public func render(_ name: String, at start: Double = 0) throws -> [Float] {
        guard let cue = document.cues[name] else { throw CueRenderError.noCue(name) }
        guard start.isFinite, start >= 0 else { throw CueRenderError.start(start) }
        let rate = sampleRate
        let first = Self.firstFrame(of: start, sampleRate: rate)

        // Each note's voice: its samples from a frame, and the frame it ends on
        var voices: [(from: Int, samples: [Float], end: Int)] = []
        for note in cue.notes {
            let instrument = document.instruments[note.instrument]!
            let envelope = Envelope(instrument, level: note.level, releaseAt: note.duration)
            // As playNote schedules it: the note's start, its frequency as a
            // float32 param value, and its oscillators' stop
            let startTime = start + note.start
            let stopTime = startTime + note.duration + envelope.release + 0.01
            let frequency = Float(440 * pow(2, (note.pitch + instrument.pitchOffset - 69) / 12))
            let startFrame = frameRoundingUp(startTime, sampleRate: rate)
            let endFrame = frameRoundingUp(stopTime, sampleRate: rate)
            let offset = startTime * rate - Double(startFrame)
            var oscillator = BandLimitedOscillator(tables[instrument.waveform]!, frequency: frequency, startOffset: offset)
            // A start rounded to just before its time sounds from the frame after
            let sounding = offset > 0 ? startFrame + 1 : startFrame
            var gained: [Float] = []
            if sounding < endFrame {
                gained.reserveCapacity(endFrame - sounding)
                for k in sounding..<endFrame {
                    gained.append(oscillator.next() * envelope.value(at: Double(k) / rate, start: startTime))
                }
            }
            if instrument.filterType == .none {
                voices.append((sounding, gained, endFrame))
            } else {
                let filter = VoiceFilter(instrument, sampleRate: rate)
                voices.append(filter.render(gained, from: sounding, oscillators: startFrame..<endFrame))
            }
        }

        let last = voices.map(\.end).max() ?? first
        var out = [Float](repeating: 0, count: max(0, last - first))
        for voice in voices {
            for (i, sample) in voice.samples.enumerated() where voice.from + i >= first {
                out[voice.from + i - first] += sample
            }
        }
        return out
    }
}

/// A voice's biquad, run render quantum by render quantum on the context's
/// frame grid, as Chromium's `BiquadFilterHandler` runs it inside
/// `AudioHandler::ProcessIfNecessary`.
///
/// Its frequency and Q are param values, fixed for the note, so its
/// coefficients and its tail time are worked out once. Its input is silent in
/// any quantum where no oscillator sounds. Once a quantum's input is silent,
/// and the last quantum whose input was not ended more than the tail time
/// before this one starts, `AudioHandler::PropagatesSilence` holds and the
/// node stops processing, its output silent: that is where Chromium and
/// WebKit end a filter's ring, on a quantum's edge, however loud the ring
/// still is.
struct VoiceFilter {
    let coefficients: BiquadCoefficients
    /// Seconds, as `BiquadFilterHandler` keeps it: `TailFrame` over the rate, at most 30.
    let tailTime: Double
    /// The context's rate, a float.
    let rate: Double

    init(_ instrument: CueInstrument, sampleRate: Double) {
        rate = Double(Float(sampleRate))
        let nyquist = 0.5 * rate
        // normalizedToFilterFreq and normalizedToQ, set as param values: a
        // float, and the frequency clamped to the param's range, 0 to Nyquist
        let frequency = min(max(Float(20 * pow(1000, instrument.filterCutoff)), 0), Float(sampleRate) / 2)
        let q = Float(0.5 + instrument.filterResonance * 19.5)
        coefficients = BiquadCoefficients.of(instrument.filterType, frequency: Double(frequency) / nyquist, q: Double(q))
        tailTime = min(max(coefficients.tailFrame(maxFrame: 30 * rate) / rate, 0), 30)
    }

    /// The voice's gain output, `gained` from frame `sounding`, through the
    /// filter, from the quantum the oscillators start in to the one the ring
    /// ends before.
    func render(_ gained: [Float], from sounding: Int, oscillators: Range<Int>) -> (from: Int, samples: [Float], end: Int) {
        let quantum = 128
        let firstQuantum = oscillators.lowerBound / quantum
        var filter = BiquadFilter()
        var lastNonSilentTime = 0.0
        var samples: [Float] = []
        var input = [Float](repeating: 0, count: quantum)
        var output = [Float](repeating: 0, count: quantum)
        var q = firstQuantum
        while true {
            let start = q * quantum
            let silent = oscillators.isEmpty || start >= oscillators.upperBound || start + quantum <= oscillators.lowerBound
            if silent && lastNonSilentTime + tailTime < Double(start) / rate { break }
            for k in 0..<quantum {
                let i = start + k - sounding
                input[k] = i >= 0 && i < gained.count ? gained[i] : 0
            }
            filter.process(coefficients, input, into: &output)
            samples += output
            if !silent { lastNonSilentTime = Double(start + quantum) / rate }
            q += 1
        }
        return (firstQuantum * quantum, samples, q * quantum)
    }
}

/// Why a cue could not be rendered, once its document was accepted.
public enum CueRenderError: Error, Equatable, Sendable, CustomStringConvertible {
    case noCue(String)
    case sampleRate(Double)
    case start(Double)

    public var description: String {
        switch self {
        case .noCue(let name): "No cue named \"\(name)\" in the loaded cue document."
        case .sampleRate(let rate): "A sample rate must be from 3000 to 768000 Hz; got \(rate)"
        case .start(let start): "A start must be a finite number of seconds, 0 or more; got \(start)"
        }
    }
}
