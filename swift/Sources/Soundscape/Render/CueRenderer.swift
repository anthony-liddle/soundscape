#if canImport(Darwin)
import Darwin
#elseif canImport(Glibc)
import Glibc
#endif

/// Renders a cue document's cues offline to samples, as the engine's
/// `playCue` sounds them in an `OfflineAudioContext`: each note one
/// oscillator, or two in unison, through its own gain envelope and, unless
/// its filter is `'none'`, a biquad, with an LFO on the oscillators' detune
/// or the filter's frequency; then, for an instrument with any effect, through
/// that instrument's effects chain, shared by all its notes; all summed at the
/// cue output with its volume at 1.
///
/// It renders everything a cue can ask for: every waveform, every envelope
/// shape, the pitch offset, every filter, the LFO on either target, unison,
/// the delay and distortion. A render through an effects chain runs until the
/// engine would disconnect the chain, by its own 2^-24 rule (`EngineTails`).
///
/// Its tables are built once, for the waveforms the document uses at its rate,
/// so a renderer, like a context, has one sample rate.
public struct CueRenderer: Sendable {
    public let document: CueDocument
    public let sampleRate: Double
    private let tables: [CueInstrument.Waveform: BandLimitedTables]
    /// Features knocked out on purpose, for the positive controls; none, in use.
    var knockouts: Knockouts = []

    /// The rates an `OfflineAudioContext` accepts.
    public static let sampleRates: ClosedRange<Double> = 3000...768_000

    /// Readies a validated document for rendering at `sampleRate`. Every field
    /// a valid document can hold renders, so no document is refused.
    ///
    /// - Throws: ``CueRenderError/sampleRate(_:)``.
    public init(_ document: CueDocument, sampleRate: Double) throws {
        guard Self.sampleRates.contains(sampleRate) else { throw CueRenderError.sampleRate(sampleRate) }
        self.document = document
        self.sampleRate = sampleRate
        // An LFO is a sine oscillator
        let lfos = document.instruments.values.contains { $0.lfoDepth > 0 }
        let waveforms = Set(document.instruments.values.map(\.waveform) + (lfos ? [.sine] : []))
        tables = Dictionary(uniqueKeysWithValues: waveforms.map { ($0, BandLimitedTables($0, sampleRate: sampleRate)) })
    }

    /// Reads, validates and readies a document in one step.
    ///
    /// - Throws: ``CueDocumentError`` with the validator's problems for an
    ///   invalid document, or ``CueRenderError/sampleRate(_:)``.
    public init(parsing text: String, sampleRate: Double) throws {
        try self.init(CueDocument(parsing: text), sampleRate: sampleRate)
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
    ///   sounds, a filter's ring included, or the frame before the engine
    ///   would disconnect an effects chain a note plays through, whichever is
    ///   later.
    /// - Throws: ``CueRenderError/noCue(_:)`` for a name the document lacks.
    public func render(_ name: String, at start: Double = 0) throws -> [Float] {
        guard let cue = document.cues[name] else { throw CueRenderError.noCue(name) }
        guard start.isFinite, start >= 0 else { throw CueRenderError.start(start) }
        let rate = sampleRate
        let first = Self.firstFrame(of: start, sampleRate: rate)

        // Each note's voice: its samples from a frame, the frame it ends on, and
        // the quanta its output sounds in; and the effects chain it plays
        // through, if any, with the time the engine would disconnect it
        var voices: [(from: Int, samples: [Float], end: Int, quanta: Range<Int>, chain: String?)] = []
        var chains: [String: (chain: CueEffectsChain, ringsUntil: Double)] = [:]
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
            // A start rounded to just before its time sounds from the frame after
            let sounding = offset > 0 ? startFrame + 1 : startFrame
            let lfo = instrument.lfoDepth > 0
                ? LFO(instrument, tables: tables[.sine]!, from: startFrame, startOffset: offset, to: endFrame, knockouts: knockouts)
                : nil

            // Unison's two oscillators, detuned half its spread each way, or one,
            // summed at the envelope's input and then through it
            let spread = instrument.unisonDetune * (knockouts.contains(.unisonHalfDetune) ? 25 : 50)
            let detunes: [Float] = spread > 0 ? [Float(-spread / 2), Float(spread / 2)] : [0]
            let table = tables[instrument.waveform]!
            var gained: [Float] = []
            gained.reserveCapacity(max(0, endFrame - sounding))
            if let lfo, instrument.lfoTarget == .pitch {
                // On an LFO's detune, each oscillator takes the a-rate path, quantum by quantum
                let rendered = detunes.map {
                    ModulatedOscillator(table, frequency: frequency, detune: $0)
                        .render(from: startFrame, startOffset: offset, to: endFrame, input: lfo.at)
                }
                for (i, sample) in rendered[0].enumerated() {
                    let summed = rendered.count > 1 ? sample + rendered[1][i] : sample
                    gained.append(summed * envelope.value(at: Double(sounding + i) / rate, start: startTime))
                }
            } else {
                // Frame by frame, the envelope in the same pass: its pow overlaps
                // the oscillators' reads, where a pass of its own made Peach's
                // renders a sixth slower
                var first = BandLimitedOscillator(table, frequency: frequency, detune: detunes[0], startOffset: offset)
                if detunes.count > 1 {
                    var second = BandLimitedOscillator(table, frequency: frequency, detune: detunes[1], startOffset: offset)
                    for k in sounding..<max(sounding, endFrame) {
                        gained.append((first.next() + second.next()) * envelope.value(at: Double(k) / rate, start: startTime))
                    }
                } else {
                    for k in sounding..<max(sounding, endFrame) {
                        gained.append(first.next() * envelope.value(at: Double(k) / rate, start: startTime))
                    }
                }
            }

            // A chain for every instrument with any effect, as loadCues builds
            // one, and the time the engine would disconnect it: once every
            // voice through it has stopped, and its filter rung out, and then
            // the chain's own tail
            if chains[note.instrument] == nil, let chain = CueEffectsChain(instrument, sampleRate: rate, knockouts: knockouts) {
                chains[note.instrument] = (chain, 0)
            }
            if let (chain, ringsUntil) = chains[note.instrument] {
                let silentAt = stopTime + EngineTails.filter(instrument, sampleRate: rate)
                chains[note.instrument] = (chain, max(ringsUntil, silentAt + EngineTails.delay(instrument, sampleRate: rate)))
            }
            let chain = chains[note.instrument] == nil ? nil : note.instrument

            if instrument.filterType == .none || knockouts.contains(.noFilter) {
                // The oscillators sound in every quantum their start and stop overlap
                let quanta = endFrame > startFrame ? startFrame / 128..<(endFrame + 127) / 128 : 0..<0
                voices.append((sounding, gained, endFrame, quanta, chain))
            } else {
                let filter = VoiceFilter(instrument, sampleRate: rate, knockouts: knockouts)
                let modulation = instrument.lfoTarget == .filter ? lfo?.at : nil
                let (from, samples, end) = filter.render(
                    gained, from: sounding, oscillators: startFrame..<endFrame, modulation: modulation)
                voices.append((from, samples, end, from / 128..<(end + 127) / 128, chain))
            }
        }

        // Each voice summed at the cue output, or through its chain, in the
        // order of each chain's first note, until the engine would disconnect it
        var outputs: [(from: Int, samples: [Float], end: Int)] = []
        var played = Set<String>()
        for voice in voices {
            guard let name = voice.chain else {
                outputs.append((voice.from, voice.samples, voice.end))
                continue
            }
            guard played.insert(name).inserted, let (chain, ringsUntil) = chains[name] else { continue }
            let cut = frameRoundingUp(ringsUntil, sampleRate: rate)
            let through = voices.filter { $0.chain == name }.map { (from: $0.from, samples: $0.samples, quanta: $0.quanta) }
            // Every voice's biquad wakes the chain's input in the context's first quanta
            let idle = cue.notes.filter { $0.instrument == name }
                .map { VoiceFilter.idleQuanta(document.instruments[$0.instrument]!, sampleRate: rate) }.max() ?? 0
            let (from, samples) = chain.render(through, idle: idle, to: cut)
            outputs.append((from, samples, cut))
        }

        let last = outputs.map(\.end).max() ?? first
        var out = [Float](repeating: 0, count: max(0, last - first))
        out.withUnsafeMutableBufferPointer { out in
            for output in outputs {
                for i in max(0, first - output.from)..<output.samples.count {
                    out[output.from + i - first] += output.samples[i]
                }
            }
        }
        return out
    }
}

/// A voice's biquad, run render quantum by render quantum on the context's
/// frame grid, as Chromium's `BiquadFilterHandler` runs it inside
/// `AudioHandler::ProcessIfNecessary`.
///
/// Its frequency and Q are param values, fixed for the note, so without an
/// LFO its coefficients and its tail time are worked out once. With an LFO
/// on its frequency, the param has an input, and every quantum the handler
/// works out the frequency at each frame, clamped to the param's range, 0 to
/// Nyquist, so an LFO deeper than the cutoff closes a lowpass at the bottom of
/// its swing. Then coefficients for each frame, run a frame at a time; or,
/// when the quantum's frequencies are all the same, as once the LFO has
/// stopped, the first frame's, run as fixed ones. The tail time is the last
/// frame's.
///
/// Its input is silent in any quantum where no oscillator sounds. Once a
/// quantum's input is silent, and the last quantum whose input was not ended
/// more than the tail time before this one starts,
/// `AudioHandler::PropagatesSilence` holds and the node stops processing, its
/// output silent: that is where Chromium and WebKit end a filter's ring, on a
/// quantum's edge, however loud the ring still is.
struct VoiceFilter {
    let type: CueInstrument.FilterType
    /// The frequency param's value, clamped to its range.
    let frequency: Float
    let q: Float
    /// The context's rate, a float.
    let rate: Double
    let nyquist: Double
    let knockouts: Knockouts

    init(_ instrument: CueInstrument, sampleRate: Double, knockouts: Knockouts = []) {
        self.knockouts = knockouts
        type = instrument.filterType
        rate = Double(Float(sampleRate))
        nyquist = 0.5 * rate
        // normalizedToFilterFreq and normalizedToQ, set as param values: a
        // float, and the frequency clamped to the param's range, 0 to Nyquist
        frequency = min(max(Float(20 * pow(1000, instrument.filterCutoff)), 0), Float(nyquist))
        q = Float(0.5 + instrument.filterResonance * 19.5)
    }

    /// How many render quanta, from the context's first, a voice's biquad
    /// processes before its note, hearing only silence: while its tail time
    /// has not passed since the context began, `PropagatesSilence` fails, so
    /// it processes and marks its output as sounding, zeros though it is.
    /// With no filter the engine routes around the biquad but leaves its
    /// output connected, and Chromium's default, a lowpass at 350 Hz with a Q
    /// of 1, does the same.
    static func idleQuanta(_ instrument: CueInstrument, sampleRate: Double) -> Int {
        let filter = VoiceFilter(instrument, sampleRate: sampleRate)
        let c = instrument.filterType == .none
            ? BiquadCoefficients.of(.lowpass, frequency: Double(Float(350)) / filter.nyquist, q: 1)
            : filter.coefficients(at: filter.frequency)
        let tail = filter.tailTime(c)
        var quanta = 0
        while !(0 + tail < Double(quanta * 128) / filter.rate) { quanta += 1 }
        return quanta
    }

    /// `NormalizeFrequency` and `SetBiquadParams`: a frequency over Nyquist, in double.
    private func coefficients(at frequency: Float) -> BiquadCoefficients {
        BiquadCoefficients.of(
            type, frequency: Double(frequency) / nyquist, q: Double(q),
            linearLowpassQ: knockouts.contains(.linearLowpassQ))
    }

    /// Seconds, as `BiquadFilterHandler` keeps it: `TailFrame` over the rate, at most 30.
    private func tailTime(_ c: BiquadCoefficients) -> Double {
        min(max(c.tailFrame(maxFrame: 30 * rate) / rate, 0), 30)
    }

    /// The voice's gain output, `gained` from frame `sounding`, through the
    /// filter, from the quantum the oscillators start in to the one the ring
    /// ends before.
    ///
    /// - Parameter modulation: what reaches the frequency param at a frame:
    ///   an LFO through its depth's gain, 0 where it is not playing.
    func render(
        _ gained: [Float], from sounding: Int, oscillators: Range<Int>, modulation: ((Int) -> Float)? = nil
    ) -> (from: Int, samples: [Float], end: Int) {
        let quantum = 128
        let firstQuantum = oscillators.lowerBound / quantum
        let fixed = coefficients(at: frequency)
        var tailTime = tailTime(fixed)
        var filter = BiquadFilter()
        var lastNonSilentTime = 0.0
        var samples: [Float] = []
        var input = [Float](repeating: 0, count: quantum)
        var output = [Float](repeating: 0, count: quantum)
        var frequencies = [Float](repeating: 0, count: quantum)
        // For the knockout that ends a ring at a level: its level when the input stopped
        let toLevel = knockouts.contains(.ringToLevel)
        var level: Float = 0
        var q = firstQuantum
        while true {
            let start = q * quantum
            let silent = oscillators.isEmpty || start >= oscillators.upperBound || start + quantum <= oscillators.lowerBound
            if !toLevel && silent && lastNonSilentTime + tailTime < Double(start) / rate { break }
            for k in 0..<quantum {
                let i = start + k - sounding
                input[k] = i >= 0 && i < gained.count ? gained[i] : 0
            }
            if let modulation {
                // CalculateFinalValues: the value plus the input, clamped
                for k in 0..<quantum {
                    frequencies[k] = min(max(frequency + modulation(start + k), 0), Float(nyquist))
                }
                if frequencies.allSatisfy({ $0 == frequencies[0] }) {
                    let c = coefficients(at: frequencies[0])
                    filter.process(c, input, into: &output)
                    tailTime = self.tailTime(c)
                } else {
                    let cs = frequencies.map(coefficients(at:))
                    filter.process(cs, input, into: &output)
                    tailTime = self.tailTime(cs[quantum - 1])
                }
            } else {
                filter.process(fixed, input, into: &output)
            }
            samples += output
            if !silent { lastNonSilentTime = Double(start + quantum) / rate }
            q += 1
            if toLevel {
                if !silent { level = output.map(abs).max()! }
                let rungOut = level * 0x1p-24
                if silent && (output.allSatisfy { abs($0) < rungOut } || Double(start) / rate > lastNonSilentTime + 30) {
                    // Cut after the last sample still above it, wherever that falls
                    let last = samples.lastIndex { abs($0) >= rungOut } ?? -1
                    samples.removeSubrange((last + 1)...)
                    return (firstQuantum * quantum, samples, firstQuantum * quantum + samples.count)
                }
            }
        }
        return (firstQuantum * quantum, samples, q * quantum)
    }
}

/// A voice's LFO, as the engine builds it: a sine oscillator at the rate,
/// started and stopped with the voice's oscillators, through a gain of the
/// depth, 4000 Hz at full depth on the filter's frequency or 100 cents on
/// the oscillators' detune.
struct LFO {
    /// The frame its first sample is on.
    let from: Int
    /// The gain's output, a float times a float.
    let values: [Float]

    init(
        _ instrument: CueInstrument, tables: BandLimitedTables, from startFrame: Int, startOffset: Double, to endFrame: Int,
        knockouts: Knockouts = []
    ) {
        // normalizedToLfoRate, normalizedToLfoFilterDepth and normalizedToLfoPitchDepth
        let rate = Float(0.1 * pow(20 / 0.1, instrument.lfoRate)) * (knockouts.contains(.lfoRateDoubled) ? 2 : 1)
        let depth = Float(instrument.lfoDepth * (instrument.lfoTarget == .filter ? 4000 : 100))
        var oscillator = BandLimitedOscillator(tables, frequency: rate, startOffset: startOffset)
        from = startOffset > 0 ? startFrame + 1 : startFrame
        values = oscillator.next(endFrame - from).map { $0 * depth }
    }

    /// What reaches the param it drives at a frame: 0 before it starts and after it stops.
    func at(_ frame: Int) -> Float {
        let i = frame - from
        return i >= 0 && i < values.count ? values[i] : 0
    }
}

/// Each feature filters, LFOs, unison, the delay and distortion bring,
/// knocked out, for the positive controls in ReferenceRenders: each must miss
/// the bar, or the bar cannot see that feature.
struct Knockouts: OptionSet, Sendable {
    let rawValue: Int
    /// Every filter left out of the voice's path, as for `'none'`.
    static let noFilter = Knockouts(rawValue: 1 << 0)
    /// A lowpass's Q read as a ratio, where the spec reads it in dB.
    static let linearLowpassQ = Knockouts(rawValue: 1 << 1)
    /// The LFO at twice its rate.
    static let lfoRateDoubled = Knockouts(rawValue: 1 << 2)
    /// Unison's oscillators detuned half as far.
    static let unisonHalfDetune = Knockouts(rawValue: 1 << 3)
    /// A filter's ring ended where it falls to the engine's RUNG_OUT, 2^-24, of
    /// its level when the input stopped, to the sample, rather than at the
    /// tail time Chromium and WebKit end it at, on a quantum's edge.
    static let ringToLevel = Knockouts(rawValue: 1 << 4)
    /// A delay with feedback whose every pass round the loop takes the delay
    /// time alone, without the render quantum Chromium and WebKit add.
    static let noExtraQuantum = Knockouts(rawValue: 1 << 5)
    /// Distortion's curve read at the context's rate, not oversampled 2x.
    static let noOversampling = Knockouts(rawValue: 1 << 6)
    /// Oversampled 2x, but with the resamplers' 128 frames of latency taken out.
    static let oversamplingWithoutDelay = Knockouts(rawValue: 1 << 7)
    /// Distortion's k, 100 times the amount, doubled.
    static let distortionKDoubled = Knockouts(rawValue: 1 << 8)
    /// The delay's mix applied to the wet path alone, the dry path left at 1.
    static let mixOnWetOnly = Knockouts(rawValue: 1 << 9)
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
