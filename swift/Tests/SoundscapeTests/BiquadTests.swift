@testable import Soundscape
import Testing

/// The biquad's coefficients at their edges, and its two realizations, as
/// Chromium's biquad.cc has them.
@Suite struct BiquadTests {
    static let wire = BiquadCoefficients(1, 0, 0, 1, 0, 0)
    static let silence = BiquadCoefficients(0, 0, 0, 1, 0, 0)

    @Test func meetsEachTypesEdgesAsChromiumDoes() {
        // A lowpass passes everything at Nyquist and nothing at 0
        #expect(BiquadCoefficients.of(.lowpass, frequency: 1, q: 20) == Self.wire)
        #expect(BiquadCoefficients.of(.lowpass, frequency: 0, q: 20) == Self.silence)
        #expect(BiquadCoefficients.of(.lowpass, frequency: -1, q: 20) == Self.silence)
        // A highpass the other way round
        #expect(BiquadCoefficients.of(.highpass, frequency: 1, q: 20) == Self.silence)
        #expect(BiquadCoefficients.of(.highpass, frequency: 0, q: 20) == Self.wire)
        // A bandpass passes nothing at either end, and everything at a Q of 0
        #expect(BiquadCoefficients.of(.bandpass, frequency: 0, q: 20) == Self.silence)
        #expect(BiquadCoefficients.of(.bandpass, frequency: 1, q: 20) == Self.silence)
        #expect(BiquadCoefficients.of(.bandpass, frequency: 0.5, q: 0) == Self.wire)
        // A notch passes everything at either end, and nothing at a Q of 0
        #expect(BiquadCoefficients.of(.notch, frequency: 0, q: 20) == Self.wire)
        #expect(BiquadCoefficients.of(.notch, frequency: 1, q: 20) == Self.wire)
        #expect(BiquadCoefficients.of(.notch, frequency: 0.5, q: 0) == Self.silence)
    }

    @Test func readsQInDecibelsForALowpassAndAsItIsForABandpass() {
        // At the cutoff, a lowpass's gain is its Q as a ratio: 20 dB is 10
        let lowpass = BiquadCoefficients.of(.lowpass, frequency: 0.25, q: 20)
        let bandpass = BiquadCoefficients.of(.bandpass, frequency: 0.25, q: 20)
        #expect(abs(gain(lowpass, at: 0.25) - 10) < 1e-6)
        // A bandpass's gain at its centre is 1, however narrow
        #expect(abs(gain(bandpass, at: 0.25) - 1) < 1e-9)
    }

    @Test func givesTailFramesAsChromiumDoes() {
        // A wire and silence both have a double pole at 0: Chromium counts two frames
        #expect(Self.wire.tailFrame(maxFrame: 1_440_000) == 2)
        #expect(Self.silence.tailFrame(maxFrame: 1_440_000) == 2)
        let resonant = BiquadCoefficients.of(.lowpass, frequency: 28.25 / 24000, q: 20)
        #expect(resonant.tailFrame(maxFrame: 1_440_000) > 25_000)
    }

    @Test func keepsItsMemoryInDoubleOnlyWhileItsCoefficientsAreFixed() {
        let c = BiquadCoefficients.of(.lowpass, frequency: 0.01, q: 10)
        let input: [Float] = [1] + [Float](repeating: 0, count: 127)
        var fixed = BiquadFilter()
        var varying = BiquadFilter()
        var a = [Float](repeating: 0, count: 128)
        var b = [Float](repeating: 0, count: 128)
        fixed.process(c, input, into: &a)
        varying.process([BiquadCoefficients](repeating: c, count: 128), input, into: &b)
        // vDSP_deq22D: every value in double, each output rounded as it leaves.
        // The per-frame loop: each output, and so the memory, a float.
        var (x1, x2, y1, y2) = (0.0, 0.0, 0.0, 0.0)
        var (u1, u2, v1, v2) = (0.0, 0.0, 0.0, 0.0)
        for k in 0..<128 {
            let x = Double(input[k])
            let y = c.b0 * x + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2
            #expect(a[k] == Float(y))
            (x2, x1, y2, y1) = (x1, x, y1, y)
            let v = Float(c.b0 * x + c.b1 * u1 + c.b2 * u2 - c.a1 * v1 - c.a2 * v2)
            #expect(b[k] == v)
            (u2, u1, v2, v1) = (u1, x, v1, Double(v))
        }
        #expect(a != b)
    }

    /// The filter's magnitude at a normalized frequency, from its z-transform.
    private func gain(_ c: BiquadCoefficients, at frequency: Double) -> Double {
        let w = Double.pi * frequency
        let (cr, ci) = (FDLibm.cos(w), -FDLibm.sin(w))
        let (c2r, c2i) = (cr * cr - ci * ci, 2 * cr * ci)
        let nr = c.b0 + c.b1 * cr + c.b2 * c2r
        let ni = c.b1 * ci + c.b2 * c2i
        let dr = 1 + c.a1 * cr + c.a2 * c2r
        let di = c.a1 * ci + c.a2 * c2i
        return ((nr * nr + ni * ni) / (dr * dr + di * di)).squareRoot()
    }
}
