// A cue instrument's effects chain, as the engine's EffectsChain builds one
// for a cue: a waveshaper on the main path, a dry gain after it, and a delay
// send with feedback from the waveshaper's output, with no reverb. Each part
// follows Chromium, in third_party/blink at Chromium
// 935133e72a654887fb49ffbe65c8b762bdff821f:
//
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
// - the gains' values, set as automation at time 0, are read frame by frame
//   in the first quantum and as the param's value after it,
//   modules/webaudio/audio_param_handler.cc.
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
        let start = writeIndex
        buffer.withUnsafeMutableBufferPointer { buffer in
            for k in 0..<input.count { buffer[(start + k) % length] = input[k] }
            for k in 0..<input.count {
                var position = Float((start + k) % length) + offset
                if position >= lengthF { position -= lengthF }
                var r1 = Int(position)
                if r1 >= length { r1 -= length }
                var r2 = r1 + 1
                if r2 >= length { r2 -= length }
                let f = position - Float(r1)
                let s1 = buffer[r1]
                output[k] = s1 + f * (buffer[r2] - s1)
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
    let sampleRate: Double

    /// nil where the engine builds no chain: every effect exactly 0, `asksForNoEffect`.
    init?(_ instrument: CueInstrument, sampleRate: Double) {
        let effects = [instrument.delayTime, instrument.delayFeedback, instrument.delayMix, instrument.distortion, instrument.reverbMix]
        if effects.allSatisfy({ $0 == 0 }) { return nil }
        delayTime = instrument.delayTime
        feedbackGain = Float(instrument.delayFeedback * 0.9)
        dryGain = Float(1 - instrument.delayMix)
        wetGain = Float(instrument.delayMix)
        self.sampleRate = sampleRate
    }

    /// A voice into the chain: its samples from a frame, and the render quanta
    /// its output is not silent in.
    typealias Voice = (from: Int, samples: [Float], quanta: Range<Int>)

    /// The chain's output from the first quantum any voice sounds in to `cut`,
    /// the frame the engine would disconnect it on.
    func render(_ voices: [Voice], to cut: Int) -> (from: Int, samples: [Float]) {
        let quantum = 128
        // The context's time at a quantum's start: frames over the rate, a float
        let rate = Double(Float(sampleRate))
        let time = { (q: Int) in Double(q * quantum) / rate }
        let quanta = (cut + quantum - 1) / quantum
        let first = min(voices.map(\.quanta.lowerBound).min() ?? quanta, quanta)
        var samples = [Float](repeating: 0, count: max(0, cut - first * quantum))

        var line = DelayLine(delayTime: delayTime, sampleRate: sampleRate)
        var shaped = [Float](repeating: 0, count: quantum)
        var delayed = [Float](repeating: 0, count: quantum)
        var delayInput = [Float](repeating: 0, count: quantum)
        // No node has heard anything yet, and every output starts silent
        var shaperLastSound = 0.0
        var delayLastSound = 0.0
        var delayedSilent = true
        for q in 0..<quanta {
            // The chain's input: every voice sounding in this quantum, summed
            let inputSilent = !voices.contains { $0.quanta.contains(q) }

            // The waveshaper, a straight wire with no curve: no latency and no
            // tail, so it processes while its input sounds and the quantum after
            let shaperRuns = !(inputSilent && shaperLastSound < time(q))
            if shaperRuns {
                for k in 0..<quantum { shaped[k] = 0 }
                for voice in voices where voice.quanta.contains(q) {
                    for k in 0..<quantum {
                        let i = q * quantum + k - voice.from
                        if i >= 0 && i < voice.samples.count { shaped[k] += voice.samples[i] }
                    }
                }
                if !inputSilent { shaperLastSound = time(q + 1) }
            }

            // The feedback gain, on the delay's output from the quantum before.
            // In the first quantum its value is read frame by frame and it is
            // silent only on silence; after, a gain of 0 is silence.
            let feedbackSilent = delayedSilent || (q > 0 && feedbackGain == 0)
            let delayInputSilent = !shaperRuns && feedbackSilent
            // The delay's tail is its longest delay, 2 s
            if !(delayInputSilent && delayLastSound + 2.0 < time(q)) {
                for k in 0..<quantum {
                    let fed: Float = feedbackSilent ? 0 : delayed[k] * feedbackGain
                    delayInput[k] = shaperRuns ? (feedbackSilent ? shaped[k] : shaped[k] + fed) : fed
                }
                line.process(delayInput, into: &delayed)
                delayedSilent = false
                if !delayInputSilent { delayLastSound = time(q + 1) }
            } else {
                delayedSilent = true
            }

            // The dry and wet gains, summed at the chain's output
            guard q >= first else { continue }
            let dry = shaperRuns && (q == 0 || dryGain != 0)
            let wet = !delayedSilent && (q == 0 || wetGain != 0)
            for k in 0..<min(quantum, cut - q * quantum) {
                let value: Float = switch (dry, wet) {
                case (true, true): shaped[k] * dryGain + delayed[k] * wetGain
                case (true, false): shaped[k] * dryGain
                case (false, true): delayed[k] * wetGain
                case (false, false): 0
                }
                samples[q * quantum + k - first * quantum] = value
            }
        }
        return (first * quantum, samples)
    }
}
