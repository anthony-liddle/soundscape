@testable import Soundscape
import Testing

/// Distortion's parts, each against what the engine and Chromium do, where the
/// references alone would not say which part was wrong. ChainEndTests holds
/// where every render through it ends.
@Suite struct DistortionTests {
    /// The curve the engine makes, to the bit: its values at both ends, on
    /// either side of 0 and halfway, as Node computes them from
    /// makeDistortionCurve, at the full and a low amount.
    @Test(arguments: [
        (1.0, [-1, -0.9999986290931702, -0.001486787456087768, 0, 0.001486787456087768, 0.9704412817955017, 0.9999986290931702, 1]),
        (0.1, [-1, -0.9999891519546509, -0.00018968232325278223, 0, 0.00018968232325278223, 0.8070652484893799, 0.9999891519546509, 1]),
    ] as [(Double, [Float])])
    func makesTheEnginesCurve(_ amount: Double, _ values: [Float]) {
        let curve = distortionCurve(amount)
        #expect(curve.count == 44101)
        #expect([0, 1, 22049, 22050, 22051, 33075, 44099, 44100].map { curve[$0] } == values)
    }

    /// Oversampled 2x, the waveshaper's output is late by its resamplers'
    /// latency, 64 frames each way: on a curve that is nearly a straight line,
    /// a tone comes out as itself 128 frames on, within the filters' ripple,
    /// and not at 64 or 0.
    @Test func oversamplingDelaysByBothResamplersLatency() {
        var shaper = WaveShaper(curve: distortionCurve(1e-9), oversampling: true, sampleRate: 48000)
        #expect(shaper.latency == 128.0 / 48000)
        let tone = (0..<1280).map { Float(0.5 * FDLibm.sin(2 * Double.pi * 1000 * Double($0) / 48000)) }
        var out: [Float] = []
        for q in 0..<10 {
            var quantum = Array(tone[q * 128..<(q + 1) * 128])
            shaper.process(&quantum)
            out += quantum
        }
        let error = { (late: Int) in (256..<1280).map { abs(out[$0] - tone[$0 - late]) }.max()! }
        #expect(error(128) < 1e-3)
        #expect(error(64) > 0.1)
        #expect(error(0) > 0.1)
    }

    /// A curve that maps silence to silence has no tail, so the waveshaper
    /// goes quiet once its latency has passed; one that does not, never does.
    @Test func hasATailOnlyForACurveThatSoundsOnSilence() {
        #expect(WaveShaper(curve: distortionCurve(1), oversampling: true, sampleRate: 48000).tail == 0)
        #expect(WaveShaper(curve: [0.5, 0.5, 0.5], oversampling: true, sampleRate: 48000).tail == .infinity)
    }

    /// With no distortion a cue chain has no curve and does not oversample, as
    /// the engine builds it: its dry path passes the voice through untouched.
    @Test func passesTheVoiceThroughWithNoDistortion() throws {
        let text = Corpus.text(Corpus.directory + "/render/distortion.cues.json")
            .replacing(#""distortion": 0.1,"#, with: #""distortion": 0,"#)
            .replacing(#""delayTime": 0,"#, with: #""delayTime": 0.1,"#)
        let instrument = try CueDocument(parsing: text).instruments["sine-low"]!
        let chain = try #require(CueEffectsChain(instrument, sampleRate: 48000))
        let voice = (0..<1000).map { Float(FDLibm.sin(Double($0) / 10)) }
        let (from, out) = chain.render([(from: 0, samples: voice, quanta: 0..<8)], to: 1024)
        #expect(from == 0)
        #expect(Array(out[0..<1000]) == voice)
    }
}
