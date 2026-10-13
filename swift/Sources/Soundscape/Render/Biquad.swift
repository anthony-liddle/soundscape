#if canImport(Darwin)
import Darwin
#elseif canImport(Glibc)
import Glibc
#endif

// The biquad follows Chromium's platform/audio/biquad.cc and
// modules/webaudio/biquad_filter_handler.cc, in third_party/blink at Chromium
// 935133e72a654887fb49ffbe65c8b762bdff821f: its coefficients, its tail time,
// and its two realizations on macOS, where the references are recorded. That
// code is BSD-licensed: see LICENSE-CHROMIUM at the repository root.

/// One frame's biquad coefficients, divided through by a0, in double:
/// y[n] = b0 x[n] + b1 x[n-1] + b2 x[n-2] - a1 y[n-1] - a2 y[n-2].
struct BiquadCoefficients: Equatable, Sendable {
    var b0: Double
    var b1: Double
    var b2: Double
    var a1: Double
    var a2: Double

    /// `SetNormalizedCoefficients`.
    init(_ b0: Double, _ b1: Double, _ b2: Double, _ a0: Double, _ a1: Double, _ a2: Double) {
        let a0Inverse = 1 / a0
        self.b0 = b0 * a0Inverse
        self.b1 = b1 * a0Inverse
        self.b2 = b2 * a0Inverse
        self.a1 = a1 * a0Inverse
        self.a2 = a2 * a0Inverse
    }

    /// A filter of `type` at `frequency`, normalized so Nyquist is 1, with the
    /// Q param's value, as the handler sets them: `frequency / nyquist` and Q
    /// both in double, Q in dB for a lowpass or highpass.
    static func of(_ type: CueInstrument.FilterType, frequency: Double, q: Double) -> BiquadCoefficients {
        switch type {
        case .lowpass: lowpass(frequency, q)
        case .highpass: highpass(frequency, q)
        case .bandpass: bandpass(frequency, q)
        case .notch: notch(frequency, q)
        case .none: BiquadCoefficients(1, 0, 0, 1, 0, 0)
        }
    }

    /// `pow10` in biquad.cc: 10^x by fdlibm's `expf`, so in float.
    private static func pow10(_ x: Double) -> Double {
        Double(FDLibm.expf(Float(x * 2.302585092994045684017991454684364208)))
    }

    private static func lowpass(_ cutoff: Double, _ resonance: Double) -> BiquadCoefficients {
        let cutoff = min(max(cutoff, 0), 1)
        if cutoff == 1 { return BiquadCoefficients(1, 0, 0, 1, 0, 0) }
        guard cutoff > 0 else { return BiquadCoefficients(0, 0, 0, 1, 0, 0) }
        let resonance = pow10(resonance / 20)
        let theta = Double.pi * cutoff
        let alpha = FDLibm.sin(theta) / (2 * resonance)
        let cosw = FDLibm.cos(theta)
        let beta = (1 - cosw) / 2
        return BiquadCoefficients(beta, 2 * beta, beta, 1 + alpha, -2 * cosw, 1 - alpha)
    }

    private static func highpass(_ cutoff: Double, _ resonance: Double) -> BiquadCoefficients {
        let cutoff = min(max(cutoff, 0), 1)
        if cutoff == 1 { return BiquadCoefficients(0, 0, 0, 1, 0, 0) }
        guard cutoff > 0 else { return BiquadCoefficients(1, 0, 0, 1, 0, 0) }
        let resonance = pow10(resonance / 20)
        let theta = Double.pi * cutoff
        let alpha = FDLibm.sin(theta) / (2 * resonance)
        let cosw = FDLibm.cos(theta)
        let beta = (1 + cosw) / 2
        return BiquadCoefficients(beta, -2 * beta, beta, 1 + alpha, -2 * cosw, 1 - alpha)
    }

    private static func bandpass(_ frequency: Double, _ q: Double) -> BiquadCoefficients {
        let frequency = max(0, frequency)
        let q = max(0, q)
        guard frequency > 0 && frequency < 1 else { return BiquadCoefficients(0, 0, 0, 1, 0, 0) }
        let w0 = Double.pi * frequency
        guard q > 0 else { return BiquadCoefficients(1, 0, 0, 1, 0, 0) }
        let alpha = FDLibm.sin(w0) / (2 * q)
        let k = FDLibm.cos(w0)
        return BiquadCoefficients(alpha, 0, -alpha, 1 + alpha, -2 * k, 1 - alpha)
    }

    private static func notch(_ frequency: Double, _ q: Double) -> BiquadCoefficients {
        let frequency = min(max(frequency, 0), 1)
        let q = max(0, q)
        guard frequency > 0 && frequency < 1 else { return BiquadCoefficients(1, 0, 0, 1, 0, 0) }
        guard q > 0 else { return BiquadCoefficients(0, 0, 0, 1, 0, 0) }
        let w0 = Double.pi * frequency
        let alpha = FDLibm.sin(w0) / (2 * q)
        let k = FDLibm.cos(w0)
        return BiquadCoefficients(1, -2 * k, 1, 1 + alpha, -2 * k, 1 - alpha)
    }

    /// `TailFrame`: the frame after which the filter's impulse response stays
    /// under 1/32768, worked out from its poles: real and distinct, complex,
    /// or repeated, where a root finder solves for it. Which case a filter is
    /// turns on the sign of the discriminant, which at a bandpass's or notch's
    /// least resonance is decided by the last bit of its coefficients.
    func tailFrame(maxFrame: Double) -> Double {
        let maxTailAmplitude = 1 / 32768.0
        guard a1.isFinite, a2.isFinite, b0.isFinite, b1.isFinite, b2.isFinite else { return 0 }
        let discriminant = a1 * a1 - 4 * a2
        if discriminant > 0 {
            let rootPlus = (-a1 + discriminant.squareRoot()) / 2
            let rootMinus = (-a1 - discriminant.squareRoot()) / 2
            let r1 = abs(rootPlus) >= abs(rootMinus) ? rootPlus : rootMinus
            let r2 = a2 / r1
            let c1 = (b0 * r1 * r1 + b1 * r1 + b2) / (r2 - r1)
            let c2 = (b0 * r2 * r2 + b1 * r2 + b2) / (r2 - r1)
            return max(0, 1 + FDLibm.log(maxTailAmplitude / (abs(c1) + abs(c2))) / FDLibm.log(abs(r1)))
        }
        if discriminant < 0 {
            let x = -a1 / 2
            let y = (-discriminant).squareRoot() / 2
            let r = hypot(x, y)
            if r == 1 { return maxFrame }
            // |(b0 r^2 + b1 r + b2) / (r2 - r1)| for r = r1 and r2, in complex
            // arithmetic as libc++ does it, where r2 - r1 = -2iy
            func residue(_ ry: Double) -> Double {
                let squareReal = (b0 * x) * x - (b0 * ry) * ry
                let squareImaginary = (b0 * x) * ry + (b0 * ry) * x
                let numeratorReal = squareReal + b1 * x + b2
                let numeratorImaginary = squareImaginary + b1 * ry
                let d = -2 * y
                let denominator = d * d
                return hypot(numeratorImaginary * d / denominator, -(numeratorReal * d) / denominator)
            }
            let c1 = residue(y)
            let c2 = residue(-y)
            if c1 == 0 && c2 == 0 { return 0 }
            return 1 + FDLibm.log(maxTailAmplitude / (c1 + c2)) / FDLibm.log(r)
        }
        // Repeated roots
        let r = -a1 / 2
        if r == 0 { return 2 }
        if abs(r) >= 1 { return .infinity }
        let c1 = (b0 * r * r + b1 * r + b2) / (r * r)
        let c2 = b1 * r + 2 * b2
        if c1 == 0 && c2 == 0 { return 0 }
        let logR = FDLibm.log(abs(r))
        let low = min(max(-(1 + logR) / logR, 1), maxFrame - 1)
        let high = maxFrame
        let logEps = FDLibm.log(maxTailAmplitude)
        func response(_ n: Double) -> Double {
            (n - 2) * FDLibm.log(abs(r)) + FDLibm.log(abs(c1 * (n + 1) * r * r + c2)) - logEps
        }
        let fLow = response(low)
        let fHigh = response(high)
        if fLow <= 0 { return 0 }
        if fHigh >= 0 { return high }
        return rootFinder(low: low, high: high, fLow: fLow, fHigh: fHigh, response)
    }

    /// `RootFinder`: regula falsi, the Illinois variant, to half a frame.
    private func rootFinder(
        low: Double, high: Double, fLow: Double, fHigh: Double, _ response: (Double) -> Double
    ) -> Double {
        var (low, high, fLow, fHigh) = (low, high, fLow, fHigh)
        var side = 0
        var root = 0.0
        for _ in 0..<10 {
            root = (fLow * high - fHigh * low) / (fLow - fHigh)
            if abs(high - low) < 0.5 * abs(high + low) { break }
            let fr = response(root)
            if fr * fHigh > 0 {
                high = root
                fHigh = fr
                side = -1
            } else if fLow * fr > 0 {
                low = root
                fLow = fr
                if side == 1 { fHigh /= 2 }
                side = 1
            } else {
                break
            }
        }
        return root
    }
}

/// A biquad's memory between render quanta, and its two realizations on
/// macOS: `vDSP_deq22D` while the coefficients are fixed, every value kept in
/// double, and a loop rounding each output to float while they change frame
/// by frame. Each picks up the other's memory as `Biquad::Process` hands it on.
struct BiquadFilter {
    private var x1 = 0.0
    private var x2 = 0.0
    private var y1 = 0.0
    private var y2 = 0.0

    /// Fixed coefficients: double throughout, each output rounded to float as it leaves.
    mutating func process(_ c: BiquadCoefficients, _ input: [Float], into output: inout [Float]) {
        for k in input.indices {
            let x = Double(input[k])
            let y = c.b0 * x + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2
            output[k] = Float(y)
            x2 = x1
            x1 = x
            y2 = y1
            y1 = y
        }
    }

    /// Coefficients for every frame: each output, and so the memory, a float;
    /// denormals in the memory flushed to zero at the quantum's end.
    mutating func process(_ cs: [BiquadCoefficients], _ input: [Float], into output: inout [Float]) {
        for k in input.indices {
            let c = cs[k]
            let x = input[k]
            let y = Float(c.b0 * Double(x) + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2)
            output[k] = y
            x2 = x1
            x1 = Double(x)
            y2 = y1
            y1 = Double(y)
        }
        func flush(_ v: Double) -> Double { abs(Float(v)) < Float.leastNormalMagnitude ? 0 : Double(Float(v)) }
        x1 = flush(x1)
        x2 = flush(x2)
        y1 = flush(y1)
        y2 = flush(y2)
    }
}
