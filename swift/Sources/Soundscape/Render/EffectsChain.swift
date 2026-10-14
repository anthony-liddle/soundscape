// A cue instrument's effects chain, as the engine's EffectsChain builds one
// for a cue: a waveshaper on the main path, a dry gain after it, and a delay
// send with feedback from the waveshaper's output, with no reverb. Each part
// follows Chromium, in third_party/blink at Chromium
// 935133e72a654887fb49ffbe65c8b762bdff821f:
//
// - the waveshaper, modules/webaudio/wave_shaper_handler.cc: the curve read
//   between its two nearest points, in float, as WaveShaperCurveValues reads
//   it on arm64; at twice the rate through Resampler.swift, oversampled as
//   its 2x path does, a render quantum at a time; and its latency, the two
//   resamplers' 128 frames, and its tail, 0 for a curve that maps 0 to 0;
// - the delay, platform/audio/delay.cc as platform/audio/cpu/arm/delay_neon.cc
//   computes it on arm64, where the references are recorded: each quantum's
//   input written first, then each frame's read position worked out in float
//   and read between two frames;
// - the feedback loop, modules/webaudio/audio_handler.cc and delay_handler.cc:
//   the delay is pulled, marks itself processed, and pulls the feedback gain,
//   which pulls the delay again and gets the output it made the quantum
//   before. So every pass round the loop takes a render quantum more than
//   the delay time;
// - which quanta each node processes, AudioHandler::PropagatesSilence, and
//   how a gain marks its output silent, modules/webaudio/gain_handler.cc and
//   platform/audio/audio_bus.cc: an input summed from silent inputs is
//   silent, a node with a silent input goes on processing for its latency
//   and its tail time, and a delay's read position depends on how far its
//   write index has come, which moves only in the quanta it processes;
// - the gains' values, each set twice as automation at time 0, read frame by
//   frame in the first two quanta and as the param's value after,
//   modules/webaudio/audio_param_handler.cc, where the timeline lives at this
//   revision;
// - each voice's biquad, which processes silence from the context's first
//   quantum for its tail time and marks the chain's input as sounding,
//   modules/webaudio/biquad_filter_handler.cc.
//
// That code is BSD-licensed: see LICENSE-CHROMIUM at the repository root.

#if canImport(Darwin)
import Darwin
#elseif canImport(Glibc)
import Glibc
#endif

/// The engine's own arithmetic for when a cue's effects chain has rung out,
/// from `delayTail` in EffectsChain.ts and `filterTail` in
/// VoiceSynthesizer.ts at 0.4.1: the deadline the engine would disconnect a
/// replaced document's chain at, and the end of every render through one.
enum EngineTails {
    /// RUNG_OUT, 2^-24.
    static let rungOut = 0x1p-24

    /// `delayTail`: seconds a chain sounds on once its input is silent, until
    /// every echo still to come is at most 2^-24 of one already heard.
    static func delay(_ instrument: CueInstrument, sampleRate: Double) -> Double {
        let quantum = 128 / sampleRate
        if instrument.delayMix == 0 { return quantum }
        let feedback = instrument.delayFeedback * 0.9
        let passes = max(1, (FDLibm.log(rungOut) / FDLibm.log(feedback)).rounded(.up))
        let pass = max(instrument.delayTime, quantum) + quantum + 1 / sampleRate
        return passes * pass + quantum
    }

    /// `filterTail`: seconds a voice's filter sounds on once its input stops,
    /// until its ring has fallen to 2^-24; 0 with no filter.
    static func filter(_ instrument: CueInstrument, sampleRate: Double) -> Double {
        if instrument.filterType == .none { return 0 }
        let cutoff = 20 * pow(20000.0 / 20, instrument.filterCutoff) / (sampleRate / 2)
        if !(cutoff > 0 && cutoff < 1) { return 0 }
        let w0 = Double.pi * cutoff
        let q = 0.5 + instrument.filterResonance * (20 - 0.5)
        let inDb = instrument.filterType == .lowpass || instrument.filterType == .highpass
        let alpha = FDLibm.sin(w0) / (2 * (inDb ? pow(10, q / 20) : q))
        let quantum = 128 / sampleRate
        if alpha < FDLibm.sin(w0) {
            let radius = ((1 - alpha) / (1 + alpha)).squareRoot()
            let theta = acos(min(1, FDLibm.cos(w0) / ((1 + alpha) * radius)))
            let cycle = (2 * Double.pi) / theta
            let fading = FDLibm.log(rungOut * FDLibm.cos(theta / 2)) / FDLibm.log(radius)
            if cycle < fading { return (fading + cycle).rounded(.up) / sampleRate + quantum }
            return growingRing(radius) / sampleRate + quantum
        }
        let sine = FDLibm.sin(w0)
        let largest = (abs(FDLibm.cos(w0)) + (alpha * alpha - sine * sine).squareRoot()) / (1 + alpha)
        return growingRing(largest) / sampleRate + quantum
    }

    /// `growingRing`: the fewest samples n with (2n + 1) r^n at most 2^-24.
    private static func growingRing(_ radius: Double) -> Double {
        var n = (FDLibm.log(rungOut) / FDLibm.log(radius)).rounded(.up)
        while true {
            let next = ((FDLibm.log(rungOut) - FDLibm.log(2 * n + 1)) / FDLibm.log(radius)).rounded(.up)
            if next <= n { return n }
            n = next
        }
    }
}

/// `makeDistortionCurve` in EffectsChain.ts: 44,101 points of
/// x(pi + k) / (pi + k|x|), k 100 times the amount, worked out in double and
/// stored as floats.
func distortionCurve(_ amount: Double) -> [Float] {
    let samples = 44101
    let k = amount * 100
    return (0..<samples).map { i in
        let x = Double(i * 2) / Double(samples - 1) - 1
        return Float((x * (Double.pi + k)) / (Double.pi + k * abs(x)))
    }
}

/// A WaveShaperNode as a cue chain has it: the engine's curve, oversampled
/// 2x, while it distorts, and no curve and no oversampling at 0, a straight
/// wire.
struct WaveShaper {
    private let curve: [Float]?
    private let oversampling: Bool
    private var up = UpSampler(blockSize: 128)
    private var down = DownSampler(blockSize: 256)
    private var doubled = [Float](repeating: 0, count: 256)
    /// Seconds, as `LatencyTime` has them: the resamplers' frames over the rate.
    let latency: Double
    /// Seconds, as `SetCurve` sets them: 0 for a curve that maps silence to
    /// silence, as the engine's always does, otherwise forever.
    let tail: Double

    init(curve: [Float]?, oversampling: Bool, sampleRate: Double) {
        self.curve = curve
        self.oversampling = oversampling && curve != nil
        latency = self.oversampling ? Double(up.latencyFrames + down.latencyFrames) / Double(Float(sampleRate)) : 0
        tail = curve.map { Self.valueAtZero($0) == 0 ? 0 : .infinity } ?? 0
    }

    /// `WaveShaperCurveValue` at 0, in double, as `SetCurve` reads it.
    private static func valueAtZero(_ curve: [Float]) -> Double {
        let index = 0.5 * (0 + 1) * Double(curve.count - 1)
        if index >= Double(curve.count - 1) { return Double(curve[curve.count - 1]) }
        let i1 = Int(index)
        let f = index - Double(i1)
        return (1 - f) * Double(curve[i1]) + f * Double(curve[i1 + 1])
    }

    /// `WaveShaperCurveValues`: each sample's place on the curve, in float,
    /// clipped to it, and read between its two nearest points.
    static func shape(_ samples: UnsafeMutableBufferPointer<Float>, _ curve: UnsafeBufferPointer<Float>) {
        let last = curve.count - 1
        let scale = Float(0.5 * Double(last))
        let lastF = Float(last)
        let points = curve.baseAddress!
        let frames = samples.baseAddress!
        var k = 0
        while k < samples.count {
            var index = (frames[k] + 1) * scale
            if !(index <= lastF) { index = lastF }
            if !(index >= 0) { index = 0 }
            var i1 = Int(index)
            if i1 > last { i1 = last }
            if i1 < 0 { i1 = 0 }
            let i2 = i1 < last ? i1 &+ 1 : last
            let f = index - Float(i1)
            frames[k] = f * (points[i2] - points[i1]) + points[i1]
            k &+= 1
        }
    }

    /// One render quantum, in place.
    mutating func process(_ quantum: inout [Float]) {
        guard let curve else { return }
        curve.withUnsafeBufferPointer { curve in
            quantum.withUnsafeMutableBufferPointer { quantum in
                guard oversampling else { return Self.shape(quantum, curve) }
                doubled.withUnsafeMutableBufferPointer { doubled in
                    up.process(UnsafeBufferPointer(quantum), into: doubled)
                    Self.shape(doubled, curve)
                    down.process(UnsafeBufferPointer(doubled), into: quantum)
                }
            }
        }
    }
}

/// A DelayNode's line, two seconds and a render quantum long, written a
/// quantum at a time.
struct DelayLine {
    private var buffer: [Float]
    private var writeIndex = 0
    /// The delay in frames as Chromium's arm64 kernel works it out: a float times a float.
    private let delayFrames: Float

    init(delayTime: Double, sampleRate: Double) {
        // BufferLengthForDelay: a render quantum and the longest delay, rounded up
        buffer = [Float](repeating: 0, count: 128 + frameRoundingUp(2.0, sampleRate: sampleRate))
        // The param's value, clamped to its range, 0 to 2 s
        delayFrames = min(max(Float(delayTime), 0), 2) * Float(sampleRate)
    }

    /// `ProcessARate` and `ProcessARateVector`: the quantum's input written
    /// first, then each frame read where the write index is less the delay,
    /// worked out in float, which on its own scale rounds differently as the
    /// index grows.
    mutating func process(_ input: [Float], into output: inout [Float]) {
        let length = buffer.count
        let lengthF = Float(length)
        let offset = lengthF - delayFrames
        let count = input.count
        let start = writeIndex
        // Raw pointers and a wrapped index, not buffer subscripts and a
        // remainder, which a debug build makes calls of at every frame
        buffer.withUnsafeMutableBufferPointer { bufferFrames in
            input.withUnsafeBufferPointer { inputFrames in
                output.withUnsafeMutableBufferPointer { outputFrames in
                    let buffer = bufferFrames.baseAddress!
                    let input = inputFrames.baseAddress!
                    let output = outputFrames.baseAddress!
                    var w = start
                    var k = 0
                    while k < count {
                        buffer[w] = input[k]
                        w &+= 1
                        if w == length { w = 0 }
                        k &+= 1
                    }
                    w = start
                    k = 0
                    while k < count {
                        var position = Float(w) + offset
                        if position >= lengthF { position -= lengthF }
                        var r1 = Int(position)
                        if r1 >= length { r1 -= length }
                        var r2 = r1 &+ 1
                        if r2 >= length { r2 -= length }
                        let f = position - Float(r1)
                        let s1 = buffer[r1]
                        output[k] = s1 + f * (buffer[r2] - s1)
                        w &+= 1
                        if w == length { w = 0 }
                        k &+= 1
                    }
                }
            }
        }
        writeIndex = (start + count) % length
    }

    /// For the knockout that leaves out the quantum every pass round the loop
    /// takes: each frame read before it is written, and fed back into the
    /// frame it was read on, as if the loop had no render quantum in it.
    mutating func process(_ input: [Float], feedingBack feedback: Float, into output: inout [Float]) {
        let length = buffer.count
        let lengthF = Float(length)
        let offset = lengthF - delayFrames
        let start = writeIndex
        buffer.withUnsafeMutableBufferPointer { buffer in
            for k in 0..<input.count {
                let w = (start + k) % length
                var position = Float(w) + offset
                if position >= lengthF { position -= lengthF }
                let r1 = Int(position) % length
                let r2 = (r1 + 1) % length
                let f = position - Float(r1)
                output[k] = buffer[r1] + f * (buffer[r2] - buffer[r1])
                buffer[w] = input[k] + output[k] * feedback
            }
        }
        writeIndex = (start + input.count) % length
    }
}

/// One cue instrument's effects chain, as `loadCues` builds it, run render
/// quantum by render quantum on the context's frame grid from its first, as
/// the engine's chain runs from the moment the document is loaded, until the
/// engine would disconnect it.
struct CueEffectsChain {
    let delayTime: Double
    /// The gains' values, floats.
    let feedbackGain: Float
    let dryGain: Float
    let wetGain: Float
    /// The waveshaper's curve, and whether it oversamples: only while it
    /// distorts, as a cue chain is built.
    let curve: [Float]?
    let sampleRate: Double
    let knockouts: Knockouts

    /// nil where the engine builds no chain: every effect exactly 0, `asksForNoEffect`.
    init?(_ instrument: CueInstrument, sampleRate: Double, knockouts: Knockouts = []) {
        let effects = [instrument.delayTime, instrument.delayFeedback, instrument.delayMix, instrument.distortion, instrument.reverbMix]
        if effects.allSatisfy({ $0 == 0 }) { return nil }
        delayTime = instrument.delayTime
        feedbackGain = Float(instrument.delayFeedback * 0.9)
        dryGain = knockouts.contains(.mixOnWetOnly) ? 1 : Float(1 - instrument.delayMix)
        wetGain = Float(instrument.delayMix)
        // Twice the amount is twice k, 100 times the amount
        let amount = instrument.distortion * (knockouts.contains(.distortionKDoubled) ? 2 : 1)
        curve = amount == 0 ? nil : distortionCurve(amount)
        self.sampleRate = sampleRate
        self.knockouts = knockouts
    }

    /// A voice into the chain: its samples from a frame, and the render quanta
    /// its output is not silent in.
    typealias Voice = (from: Int, samples: [Float], quanta: Range<Int>)

    /// The chain's output from the first quantum any voice sounds in to `cut`,
    /// the frame the engine would disconnect it on.
    ///
    /// - Parameter idle: the quanta, from the context's first, in which the
    ///   chain's input sounds before any note does: its voices' biquads
    ///   processing silence (``VoiceFilter/idleQuanta(_:sampleRate:)``).
    func render(_ voices: [Voice], idle: Int = 0, to cut: Int) -> (from: Int, samples: [Float]) {
        let quantum = 128
        // The context's time at a quantum's start: frames over the rate, a float
        let rate = Double(Float(sampleRate))
        let time = { (q: Int) in Double(q * quantum) / rate }
        let quanta = (cut + quantum - 1) / quantum
        let first = min(voices.map(\.quanta.lowerBound).min() ?? quanta, quanta)
        var samples = [Float](repeating: 0, count: max(0, cut - first * quantum))

        var shaper = WaveShaper(curve: curve, oversampling: !knockouts.contains(.noOversampling), sampleRate: sampleRate)
        var line = DelayLine(delayTime: delayTime, sampleRate: sampleRate)
        var shaped = [Float](repeating: 0, count: quantum)
        var delayed = [Float](repeating: 0, count: quantum)
        var delayInput = [Float](repeating: 0, count: quantum)
        // No node has heard anything yet, and every output starts silent
        var shaperLastSound = 0.0
        var delayLastSound = 0.0
        var delayedSilent = true
        // Each gain's value is set twice at time 0, by the engine's constructor
        // and then by loadCues. With two events HasSampleAccurateValues holds,
        // so the gain is read frame by frame, and a gain of 0 copies a sounding
        // input as zeros, not silence. In the second quantum the first event is
        // past and dropped, and from the third the one left, a SetValue in the
        // past, is the param's value: a gain of 0 is silence.
        let silencesAtZero = { (q: Int) in q > 1 }
        // The waveshaper, in place, a quantum: it processes while its input
        // sounds, and after for its latency and its tail
        func shape(_ q: Int) -> Bool {
            // The chain's input: every voice sounding in this quantum, summed
            let inputSilent = q >= idle && !voices.contains { $0.quanta.contains(q) }
            guard !(inputSilent && shaperLastSound + shaper.latency + shaper.tail < time(q)) else { return false }
            shaped.withUnsafeMutableBufferPointer { shapedFrames in
                let input = shapedFrames.baseAddress!
                var k = 0
                while k < quantum {
                    input[k] = 0
                    k &+= 1
                }
                for voice in voices where voice.quanta.contains(q) {
                    voice.samples.withUnsafeBufferPointer { voiceFrames in
                        // The frames of this quantum the voice has samples for
                        let offset = q * quantum - voice.from
                        var k = max(0, -offset)
                        let end = min(quantum, voiceFrames.count - offset)
                        guard k < end, let samples = voiceFrames.baseAddress else { return }
                        while k < end {
                            input[k] += samples[offset + k]
                            k &+= 1
                        }
                    }
                }
            }
            shaper.process(&shaped)
            if !inputSilent { shaperLastSound = time(q + 1) }
            return true
        }
        // For the knockout that takes the resamplers' latency back out: the
        // waveshaper a quantum ahead, so its 128 frames late come out on time
        let ahead = knockouts.contains(.oversamplingWithoutDelay) ? 1 : 0
        if ahead > 0 { _ = shape(0) }
        let loop = !knockouts.contains(.noExtraQuantum)
        for q in 0..<quanta {
            let shaperRuns = shape(q + ahead)

            // The feedback gain, on the delay's output from the quantum before
            let feedbackSilent = !loop || delayedSilent || (silencesAtZero(q) && feedbackGain == 0)
            let delayInputSilent = !shaperRuns && feedbackSilent
            // The delay's tail is its longest delay, 2 s
            if !loop {
                // The knockout's loop is inside the line, so it never falls silent
                for k in 0..<quantum { delayInput[k] = shaperRuns ? shaped[k] : 0 }
                line.process(delayInput, feedingBack: feedbackGain, into: &delayed)
                delayedSilent = false
            } else if !(delayInputSilent && delayLastSound + 2.0 < time(q)) {
                shaped.withUnsafeBufferPointer { shapedFrames in
                    delayed.withUnsafeBufferPointer { delayedFrames in
                        delayInput.withUnsafeMutableBufferPointer { inputFrames in
                            let shaped = shapedFrames.baseAddress!
                            let delayed = delayedFrames.baseAddress!
                            let input = inputFrames.baseAddress!
                            var k = 0
                            while k < quantum {
                                let fed: Float = feedbackSilent ? 0 : delayed[k] * feedbackGain
                                input[k] = shaperRuns ? (feedbackSilent ? shaped[k] : shaped[k] + fed) : fed
                                k &+= 1
                            }
                        }
                    }
                }
                line.process(delayInput, into: &delayed)
                delayedSilent = false
                if !delayInputSilent { delayLastSound = time(q + 1) }
            } else {
                delayedSilent = true
            }

            // The dry and wet gains, summed at the chain's output
            guard q >= first else { continue }
            let dry = shaperRuns && (!silencesAtZero(q) || dryGain != 0)
            let wet = !delayedSilent && (!silencesAtZero(q) || wetGain != 0)
            let frames = min(quantum, cut - q * quantum)
            let at = q * quantum - first * quantum
            samples.withUnsafeMutableBufferPointer { outputFrames in
                shaped.withUnsafeBufferPointer { shapedFrames in
                    delayed.withUnsafeBufferPointer { delayedFrames in
                        let output = outputFrames.baseAddress! + at
                        let shaped = shapedFrames.baseAddress!
                        let delayed = delayedFrames.baseAddress!
                        var k = 0
                        switch (dry, wet) {
                        case (true, true):
                            while k < frames {
                                output[k] = shaped[k] * dryGain + delayed[k] * wetGain
                                k &+= 1
                            }
                        case (true, false):
                            while k < frames {
                                output[k] = shaped[k] * dryGain
                                k &+= 1
                            }
                        case (false, true):
                            while k < frames {
                                output[k] = delayed[k] * wetGain
                                k &+= 1
                            }
                        case (false, false):
                            break
                        }
                    }
                }
            }
        }
        return (first * quantum, samples)
    }
}
