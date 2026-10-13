@testable import Soundscape
import Testing

/// The delay, to the frame. The bar allows a delay's last frame to move by
/// WebKit's 14 frames, so these hold the parts it cannot see: where every echo
/// lands, where the render ends, and that each chain ends on its own.
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
            #expect(abs(weight - (0..<pass).reduce(1.0) { r, _ in r * 0.9 }) < 1e-5)
        }
    }

    /// Every render through a delay ends on the frame the engine would
    /// disconnect its chain on, its deadline rounded up to a frame, as every
    /// browser's engine worked it out for the references; and last sounds on
    /// the frame Chromium's render last sounds on.
    @Test(arguments: [("delay", 76), ("echo", 4)])
    func endsWhereTheEngineAndChromiumEnd(_ set: String, _ count: Int) throws {
        let document = Corpus.text(Corpus.directory + "/render/\(set).cues.json")
        var checked = 0
        var wrong: [String] = []
        for rate in ReferenceRenders.rates {
            let references = try JSONValue(parsing: Corpus.text(Corpus.directory + "/render/references/\(set)-\(Int(rate)).json"))
            let renderer = try CueRenderer(parsing: document, sampleRate: rate)
            for (label, start) in ReferenceRenders.starts {
                for name in renderer.document.cueNames {
                    let samples = try renderer.render(name, at: start)
                    let last = samples.lastIndex { $0 != 0 } ?? -1
                    let cut = try #require(references["cutFrames"]?[name]?[label]?["chromium"]?.number)
                    let chromium = try #require(references["lastSoundFrames"]?[name]?[label]?["chromium"]?.number)
                    checked += 1
                    if Double(samples.count) != cut || Double(last) != chromium {
                        wrong.append("\(name) at \(Int(rate)) Hz from \(label) s: \(samples.count) long, last \(last); "
                            + "the cut is \(Int(cut)), Chromium's last \(Int(chromium))")
                    }
                }
            }
        }
        #expect(checked == count)
        #expect(wrong.isEmpty, "\(wrong.joined(separator: "; "))")
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
