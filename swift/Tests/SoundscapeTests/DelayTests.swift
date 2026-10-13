@testable import Soundscape
import Testing

/// The delay, to the frame. The bar allows a delay's last frame to move by
/// WebKit's 14 frames, so these hold the parts it cannot see: where every echo
/// lands, and that each chain ends on its own. ChainEndTests holds where every
/// render through a chain ends.
@Suite struct DelayTests {
    /// A document of one instrument per name, a sine with the delay given,
    /// and one cue per instrument of one 30 ms note, `both` playing each
    /// instrument's note at once.
    static func document(_ delays: [(name: String, time: Double, feedback: Double, mix: Double)]) -> String {
        let instruments = delays.map { d in
            """
            "\(d.name)": {"waveform": "sine", "pitchOffset": 0, "attack": 0.07418049, "decay": 0.05172575,
              "sustain": 0, "release": 0, "envelopeCurve": "exponential", "envelopeFloor": 0.000018,
              "filterType": "none", "filterCutoff": 1, "filterResonance": 0, "delayTime": \(d.time),
              "delayFeedback": \(d.feedback), "delayMix": \(d.mix), "distortion": 0, "reverbMix": 0, "lfoRate": 0,
              "lfoDepth": 0, "lfoTarget": "pitch", "unisonDetune": 0, "velocityResponse": 0}
            """
        }
        let note = { (id: String, name: String) in
            #"{"id": "\#(id)", "instrument": "\#(name)", "start": 0, "duration": 0.03, "pitch": 67, "level": 0.3}"#
        }
        let cues = delays.map { #""\#($0.name)": {"notes": [\#(note($0.name, $0.name))]}"# }
            + [#""both": {"notes": [\#(delays.map { note("both-" + $0.name, $0.name) }.joined(separator: ", "))]}"#]
        return #"{"format": "soundscape-cues", "version": 1, "instruments": {\#(instruments.joined(separator: ", "))}, "#
            + #""cues": {\#(cues.joined(separator: ", "))}}"#
    }

    /// Every pass round the loop takes a render quantum more than the delay:
    /// the delay's output feeds back through a gain that reads what the delay
    /// made the quantum before. One impulse in, at 48 kHz, every echo's centre
    /// lands at d, then d + 128 further on each pass, for a delay under a
    /// quantum, over one, and between two frames.
    @Test(arguments: [48.0, 200, 1000.5])
    func everyPassTakesAQuantumMore(_ frames: Double) throws {
        let document = try CueDocument(parsing: Self.document([("d", frames / 48000, 1, 1)]))
        let chain = try #require(CueEffectsChain(document.instruments["d"]!, sampleRate: 48000))
        let (from, out) = chain.render([(from: 0, samples: [1], quanta: 0..<1)], to: 6000)
        #expect(from == 0)
        for pass in 0..<4 {
            let at = frames + Double(pass) * (frames + 128)
            let window = Int(at) - 8...Int(at) + 8
            let weight = window.map { Double(out[$0]) }.reduce(0, +)
            let centre = window.map { Double($0) * Double(out[$0]) }.reduce(0, +) / weight
            #expect(abs(centre - at) < 0.01, "pass \(pass): centred on \(centre), not \(at)")
            // Each pass scaled by the feedback gain, 0.9
            var scaled = 1.0
            for _ in 0..<pass { scaled *= 0.9 }
            #expect(abs(weight - scaled) < 1e-5)
        }
    }

    /// Before a cue played late, the delay processes while anything in its
    /// chain sounds: the gains, read frame by frame in the first two quanta,
    /// and each voice's biquad, which sounds silence for its tail time from
    /// the context's first quantum, in the voice's path or left connected
    /// when the engine routes around it. How far the write index has come
    /// decides each read's fraction, in float on arm64, at a delay between
    /// frames. Chromium's render, recorded by delay-wake.mjs where that shows:
    /// the delay matches it sample by sample, where a quantum off is up to
    /// 2.8e-4 off and measure() reads the cue the same.
    @Test(arguments: ["plain", "filtered"])
    func wakesAsChromiumsDelayDoesBeforeALateCue(_ cue: String) throws {
        let recorded = try JSONValue(parsing: Corpus.text(Corpus.directory + "/render/references/delay-wake-chromium.json"))
        let document = try CueDocument(parsing: JavaScript.stringify(#require(recorded["document"])))
        let rate = try #require(recorded["rate"]?.number)
        let start = try #require(recorded["start"]?.number)
        let window = try #require(recorded["window"]?.elements).map { Int($0.number!) }
        let chromium = try DistortionTests.floats(#require(recorded["windows"]?[cue]?.string))
        let samples = try CueRenderer(document, sampleRate: rate).render(cue, at: start)
        #expect(chromium.count == window[1] - window[0])
        let gap = zip(samples[window[0]..<window[1]], chromium).map { abs($0 - $1) }.max()!
        #expect(gap < 1e-6)
    }

    /// Each instrument's chain goes at its own deadline, as the engine retires
    /// each chain. Two in one cue: the short echo's chain still sounds, under
    /// 2^-24 of its echoes, at its deadline, and is silent from there, while
    /// the long one's runs on to its own.
    @Test func eachChainEndsAtItsOwnDeadline() throws {
        let renderer = try CueRenderer(
            parsing: Self.document([("short", 0.05, 1, 0.5), ("long", 0.2, 1, 0.5)]), sampleRate: 48000)
        let short = try renderer.render("short")
        let long = try renderer.render("long")
        let both = try renderer.render("both")
        #expect(short.count < long.count)
        #expect(short.last != 0)
        #expect(both.count == long.count)
        let summed = long.indices.map { ($0 < short.count ? short[$0] : 0) + long[$0] }
        #expect(both == summed)
    }
}
