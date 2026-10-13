#if canImport(Darwin)
import Darwin
#elseif canImport(Glibc)
import Glibc
#endif

// The band-limited oscillator follows the design of Chromium's
// periodic_wave_handler.cc and oscillator_handler.cc, and the start and stop
// frames follow audio_scheduled_source_handler.cc and audio_utilities.cc. An
// oscillator whose detune has an input follows the a-rate path of
// oscillator_handler.cc and its arm64 kernel, cpu/arm/oscillator_kernel_neon.cc,
// where the references are recorded. All are in third_party/blink at Chromium
// 935133e72a654887fb49ffbe65c8b762bdff821f. That code is BSD-licensed: see
// LICENSE-CHROMIUM at the repository root.
//
// Web Audio fixes each waveform's Fourier series and its normalization, and
// leaves band-limiting to the browser. Chromium and WebKit share this design,
// and Swift renders are held to them; summing every harmonic below Nyquist
// instead misses the bar on a square wave's peak by 0.45 dB.

/// One waveform's band-limited tables at one sample rate: three tables an
/// octave, each with the partials above its range culled, all scaled by one
/// factor taken from the table with the most partials.
struct BandLimitedTables: Sendable {
    let size: Int
    let rateScale: Float
    let lowestFundamental: Float
    let ranges: Int
    let tables: [[Float]]
    /// Half the context's rate, a float, which an oscillator's frequency is clamped to.
    let nyquist: Float

    /// The table size Chromium uses at a rate: `PeriodicWaveSize()`.
    static func size(sampleRate: Double) -> Int {
        sampleRate <= 24000 ? 2048 : sampleRate <= 88200 ? 4096 : 16384
    }

    init(_ waveform: CueInstrument.Waveform, sampleRate: Double) {
        size = Self.size(sampleRate: sampleRate)
        let half = size / 2
        nyquist = Float(sampleRate) / 2
        rateScale = Float(Double(size) / sampleRate)
        lowestFundamental = Float(0.5 * sampleRate) / Float(half)
        ranges = Int(0.5 + 3 * log2f(Float(size)))

        // The coefficients for sin(), computed in float as Chromium does
        let b: [Float] = (0..<half).map { n -> Float in
            guard n > 0 else { return 0 }
            let piFactor = 2 / (Float(n) * Float.pi)
            switch waveform {
            case .sine: return n == 1 ? 1 : 0
            case .square: return n & 1 == 1 ? 2 * piFactor : 0
            case .sawtooth: return piFactor * (n & 1 == 1 ? 1 : -1)
            case .triangle: return n & 1 == 1 ? 2 * (piFactor * piFactor) * (((n - 1) >> 1) & 1 == 1 ? -1 : 1) : 0
            }
        }

        let fft = InverseFFT(size: size)
        var scale: Float = 0.5
        var built: [[Float]] = []
        for range in 0..<ranges {
            // The fraction of the partials this range keeps: 2^(-cents / 1200)
            let centsToCull = Float(range) * 400
            let culling = Float(pow(2.0, Double(-centsToCull / 1200)))
            let partials = Int(culling * Float(half))
            // sum of b[n] sin(2 pi n j / size): the real part of the inverse
            // transform of -i b[n] at each kept partial
            var real = [Double](repeating: 0, count: size)
            var imaginary = [Double](repeating: 0, count: size)
            for n in Swift.stride(from: 1, to: min(half, partials + 1), by: 1) { imaginary[n] = -Double(b[n]) }
            fft.transform(&real, &imaginary)
            var table = real.map { Float($0) }
            if range == 0, let peak = table.lazy.map(\.magnitude).max(), peak > 0 { scale = 1 / peak }
            for j in table.indices { table[j] *= scale }
            built.append(table)
        }
        tables = built
    }

    /// `WaveDataForFundamentalFrequency`: the tables a frequency reads, the
    /// one with more partials first, by index, and the blend between them.
    func waveData(_ frequency: Float) -> (higher: Int, lower: Int, blend: Float) {
        let frequency = abs(frequency)
        let ratio = frequency > 0 ? frequency / lowestFundamental : 0.5
        let cents = log2f(ratio) * 1200
        let pitchRange = min(max(1 + cents / 400, 0), Float(ranges - 1))
        let i1 = Int(pitchRange)
        return (i1, i1 < ranges - 1 ? i1 + 1 : i1, pitchRange - Float(i1))
    }

    /// The same for one of four frequencies, as the NEON version computes it,
    /// multiplying by reciprocals where the one above divides.
    func waveDataByReciprocals(_ frequency: Float) -> (higher: Int, lower: Int, blend: Float) {
        let frequency = abs(frequency)
        let ratio = frequency > 0 ? frequency * (1 / lowestFundamental) : 0.5
        let cents = log2f(ratio) * 1200
        let pitchRange = min(max(1 + cents * (1 / Float(400)), 0), Float(ranges - 1))
        let i1 = Int(pitchRange)
        return (i1, min(i1 + 1, ranges - 1), pitchRange - Float(i1))
    }
}

/// `DoInterpolation`: a sample read between table entries, the read chosen by
/// how far the index moves each frame. Linear at 0.3 of an entry or more,
/// 3-point Lagrange at 0.16 or more, and 5-point Lagrange below that, as an
/// LFO's slow sine is read; each in double, the two tables then blended.
func interpolate(
    _ index: Double, increment: Float, higher: [Float], lower: [Float], blend: Float, mask: Int
) -> Float {
    let read0 = Int(index)
    var sampleHigher = 0.0
    var sampleLower = 0.0
    if increment >= 0.3 {
        let r0 = read0 & mask
        let r1 = (read0 + 1) & mask
        let f = Double(Float(index) - Float(r0))
        sampleHigher = (1 - f) * Double(higher[r0]) + f * Double(higher[r1])
        sampleLower = (1 - f) * Double(lower[r0]) + f * Double(lower[r1])
    } else if increment >= 0.16 {
        let t = index - Double(read0)
        let a0 = 0.5 * t * (t - 1)
        let a1 = 1 - t * t
        let a2 = 0.5 * t * (t + 1)
        for (k, a) in [a0, a1, a2].enumerated() {
            let r = (read0 + k - 1) & mask
            sampleLower += a * Double(lower[r])
            sampleHigher += a * Double(higher[r])
        }
    } else {
        let t = index - Double(read0)
        let t2 = t * t
        let a0 = t * (t2 - 1) * (t - 2) / 24
        let a1 = -t * (t - 1) * (t2 - 4) / 6
        let a2 = (t2 - 1) * (t2 - 4) / 4
        let a3 = -t * (t + 1) * (t2 - 4) / 6
        let a4 = t * (t2 - 1) * (t + 2) / 24
        for (k, a) in [a0, a1, a2, a3, a4].enumerated() {
            let r = (read0 + k - 2) & mask
            sampleLower += a * Double(lower[r])
            sampleHigher += a * Double(higher[r])
        }
    }
    return Float(Double(1 - blend) * sampleHigher + Double(blend) * sampleLower)
}

/// One oscillator whose frequency and detune are fixed, Chromium's k-rate
/// path: a read of two neighbouring tables, interpolated within each, and a
/// blend between them by pitch.
///
/// It reads as Chromium's scalar code does, `ProcessKRateScalar`, its index
/// kept in double from frame to frame. On arm64, where the
/// references are recorded, Chromium runs a NEON kernel instead, which keeps
/// the index in float within a quantum; the two differ within the bar.
struct BandLimitedOscillator {
    private let higher: [Float]
    private let lower: [Float]
    private let blend: Float
    private let increment: Float
    private let size: Int
    private var index: Double

    /// - Parameters:
    ///   - frequency: the frequency param's value.
    ///   - detune: the detune param's value, in cents: unison's spread.
    ///   - startOffset: the start's distance into its first frame,
    ///     `startTime x rate - startFrame`, as Chromium computes it: 0 or
    ///     less, or a hair above 0 when rounding put the start frame just
    ///     before the start.
    init(_ tables: BandLimitedTables, frequency: Float, detune: Float = 0, startOffset: Double) {
        // The frequency scaled by 2^(detune / 1200), in float, and clamped to Nyquist
        let frequency = min(max(frequency * exp2(detune / 1200), -tables.nyquist), tables.nyquist)
        let (i1, i2, blend) = tables.waveData(frequency)
        higher = tables.tables[i1]
        lower = tables.tables[i2]
        self.blend = blend
        increment = frequency * tables.rateScale
        size = tables.size
        index = 0
        if startOffset > 0 {
            index += (1 - startOffset) * Double(frequency) * Double(tables.rateScale)
        } else if startOffset < 0 {
            index = -startOffset * Double(frequency) * Double(tables.rateScale)
        }
    }

    mutating func next() -> Float {
        let mask = size - 1
        guard increment >= 0.3 else {
            // Slower than about 3 Hz, as an LFO is: read by DoInterpolation
            let sample = interpolate(index, increment: abs(increment), higher: higher, lower: lower, blend: blend, mask: mask)
            index += Double(increment)
            index -= (index / Double(size)).rounded(.down) * Double(size)
            return sample
        }
        let whole = Int(index)
        let i0 = whole & mask
        let i1 = (i0 + 1) & mask
        let fraction = Float(index) - Float(whole)
        let h = higher[i0] + fraction * (higher[i1] - higher[i0])
        let l = lower[i0] + fraction * (lower[i1] - lower[i0])
        index += Double(increment)
        index -= (index / Double(size)).rounded(.down) * Double(size)
        return h + blend * (l - h)
    }
}

/// One oscillator whose detune has an input, an LFO's: Chromium's a-rate
/// path, which works out an increment for every frame and reads the tables
/// for each one's pitch.
///
/// Where it follows Chromium rather than the spec: the frequency it scales
/// by is 0 when it places the start, so a start between frames begins at
/// the table's start, its fraction dropped, where WebKit keeps it; and in the
/// quantum it starts in, its increments are read from the quantum's first
/// frame, not its own.
struct ModulatedOscillator {
    private let tables: BandLimitedTables
    private let frequency: Float
    private let detune: Float

    /// - Parameters:
    ///   - frequency: the frequency param's value.
    ///   - detune: the detune param's own value, in cents, before its input.
    init(_ tables: BandLimitedTables, frequency: Float, detune: Float) {
        self.tables = tables
        self.frequency = frequency
        self.detune = detune
    }

    /// The oscillator's samples from the frame it sounds on, the one after
    /// `startFrame` if `startOffset` is above 0, to `endFrame`, quantum by
    /// quantum as `OscillatorHandler::Process` renders them.
    ///
    /// - Parameter input: what reaches the detune param at a frame: the LFO
    ///   through its depth's gain, 0 where it is not playing.
    func render(from startFrame: Int, startOffset: Double, to endFrame: Int, input: (Int) -> Float) -> [Float] {
        let quantum = 128
        let size = tables.size
        let mask = size - 1
        let inverseSize = 1.0 / Double(size)
        func wrap(_ x: Double) -> Double { x - (x * inverseSize).rounded(.down) * Double(size) }
        // WrapVirtualIndexVector, in float
        func wrap(_ x: Float) -> Float {
            let r = x * Float(inverseSize)
            var f = Int32(r)
            if r < Float(f) { f -= 1 }
            return x - Float(f) * Float(size)
        }
        // CalculateSampleAccuratePhaseIncrements: the rate scale times the frequency
        var finalScale = tables.rateScale
        finalScale *= frequency
        let centsToOctaves = Float(1.0 / 1200)
        let detuneLimit = 1200 * log2f(Float.greatestFiniteMagnitude)
        let inverseRateScale = 1 / tables.rateScale

        var samples: [Float] = []
        samples.reserveCapacity(max(0, endFrame - startFrame))
        var increments = [Float](repeating: 0, count: quantum)
        var lanes = [(higher: Int, lower: Int, blend: Float)](repeating: (0, 0, 0), count: 4)
        var sums = [Double](repeating: 0, count: 4)
        // The start's fraction moves the index by a frequency of 0: it starts at 0
        var index = 0.0
        var q = startFrame / quantum
        while q * quantum < endFrame {
            let start = q * quantum
            var n = min(endFrame, start + quantum) - max(startFrame, start)
            if start <= startFrame && startOffset > 0 { n -= 1 }
            q += 1
            guard n > 0 else { continue }
            // Each frame's increment, from the quantum's first frame on
            for j in 0..<n {
                let cents = min(max(detune + input(start + j), -detuneLimit), detuneLimit)
                let scale = min(max(exp2(cents * centsToOctaves), -tables.nyquist), tables.nyquist)
                increments[j] = scale * finalScale
            }
            // ProcessARateVector: four frames at a time
            var k = 0
            while k + 4 <= n {
                var big = true
                for m in 0..<4 {
                    big = big && abs(increments[k + m]) >= 0.3
                    lanes[m] = tables.waveDataByReciprocals(inverseRateScale * increments[k + m])
                }
                if big {
                    // ProcessARateVectorKernel on arm64: the index in double,
                    // each frame's read in float
                    sums[0] = Double(increments[k])
                    for m in 1..<4 { sums[m] = sums[m - 1] + Double(increments[k + m]) }
                    for m in 0..<4 {
                        let v = wrap(Float(wrap(m == 0 ? index : index + sums[m - 1])))
                        let r0 = Int(UInt32(v)) & mask
                        let r1 = (r0 + 1) & mask
                        let factor = v - Float(r0)
                        let higher = tables.tables[lanes[m].higher]
                        let lower = tables.tables[lanes[m].lower]
                        let sampleHigher = higher[r0] + factor * (higher[r1] - higher[r0])
                        let sampleLower = lower[r0] + factor * (lower[r1] - lower[r0])
                        samples.append(sampleHigher + lanes[m].blend * (sampleLower - sampleHigher))
                    }
                    index = wrap(index + sums[3])
                } else {
                    for m in 0..<4 {
                        let increment = increments[k + m]
                        samples.append(interpolate(
                            index, increment: abs(increment), higher: tables.tables[lanes[m].higher],
                            lower: tables.tables[lanes[m].lower], blend: lanes[m].blend, mask: mask))
                        index = wrap(index + Double(increment))
                    }
                }
                k += 4
            }
            // ProcessARateScalar: the rest
            for j in k..<n {
                let increment = increments[j]
                let (higher, lower, blend) = tables.waveData(inverseRateScale * increment)
                samples.append(interpolate(
                    index, increment: abs(increment), higher: tables.tables[higher],
                    lower: tables.tables[lower], blend: blend, mask: mask))
                index = wrap(index + Double(increment))
            }
        }
        return samples
    }
}

/// Chromium's `TimeToSampleFrame`, rounding up: round at 1024 times the rate,
/// so that `k / rate` comes back as frame `k`, then round up to a whole frame.
func frameRoundingUp(_ time: Double, sampleRate: Double) -> Int {
    Int(((time * sampleRate * 1024).rounded() / 1024).rounded(.up))
}
