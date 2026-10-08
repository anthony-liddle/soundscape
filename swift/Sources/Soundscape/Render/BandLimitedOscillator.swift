#if canImport(Darwin)
import Darwin
#elseif canImport(Glibc)
import Glibc
#endif

// The band-limited oscillator follows the design of Chromium's
// periodic_wave_handler.cc and oscillator_handler.cc, and the start and stop
// frames follow audio_scheduled_source_handler.cc and audio_utilities.cc, all
// in third_party/blink at Chromium 935133e72a654887fb49ffbe65c8b762bdff821f.
// That code is BSD-licensed: see LICENSE-CHROMIUM at the repository root.
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

    /// The table size Chromium uses at a rate: `PeriodicWaveSize()`.
    static func size(sampleRate: Double) -> Int {
        sampleRate <= 24000 ? 2048 : sampleRate <= 88200 ? 4096 : 16384
    }

    init(_ waveform: CueInstrument.Waveform, sampleRate: Double) {
        size = Self.size(sampleRate: sampleRate)
        let half = size / 2
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
}

/// One note's oscillator: Chromium's read of two neighbouring tables, linear
/// interpolation within each, and a blend between them by pitch.
struct BandLimitedOscillator {
    private let higher: [Float]
    private let lower: [Float]
    private let blend: Float
    private let increment: Float
    private let size: Int
    private var index: Double

    /// - Parameter startOffset: the start's distance into its first frame,
    ///   `startTime x rate - startFrame`, as Chromium computes it: 0 or less,
    ///   or a hair above 0 when rounding put the start frame just before the start.
    init(_ tables: BandLimitedTables, frequency: Float, startOffset: Double) {
        let ratio = frequency > 0 ? frequency / tables.lowestFundamental : 0.5
        let cents = log2f(ratio) * 1200
        let pitchRange = min(max(1 + cents / 400, 0), Float(tables.ranges - 1))
        let i1 = Int(pitchRange)
        let i2 = i1 < tables.ranges - 1 ? i1 + 1 : i1
        higher = tables.tables[i1]
        lower = tables.tables[i2]
        blend = pitchRange - Float(i1)
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

/// Chromium's `TimeToSampleFrame`, rounding up: round at 1024 times the rate,
/// so that `k / rate` comes back as frame `k`, then round up to a whole frame.
func frameRoundingUp(_ time: Double, sampleRate: Double) -> Int {
    Int(((time * sampleRate * 1024).rounded() / 1024).rounded(.up))
}
