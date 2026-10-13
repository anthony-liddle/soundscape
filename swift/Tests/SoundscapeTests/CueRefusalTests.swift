import Soundscape
import Testing

/// Distortion refused with its path at the edge where the engine starts
/// building it, and the values just short of that edge accepted, as is every
/// delay, filter, LFO and unison.
@Suite struct CueRefusalTests {
    /// Peach's tick: one square instrument, one note, every effect 0.
    static let tick = Corpus.caseText("test-valid")

    static func problems(_ change: (String) -> String) throws -> [CueProblem] {
        CueRenderer.unsupported(try CueDocument(parsing: change(tick)))
    }

    static func set(_ key: String, _ value: String) -> (String) -> String {
        { text in
            var out = text
            let start = text.firstRange(of: "\"\(key)\": ")!.upperBound
            let end = text[start...].firstIndex { $0 == "," || $0 == "\n" }!
            out.replaceSubrange(start..<end, with: value)
            return out
        }
    }

    static let refused: [(String, String, String, String)] = [
        // The smallest number above 0, at the edge where the engine builds its chain
        ("distortion", "5e-324", "instruments.square.distortion", "must be 0: distortion is not rendered yet"),
        // And a value that would sound
        ("distortion", "1", "instruments.square.distortion", "must be 0: distortion is not rendered yet"),
    ]

    @Test(arguments: refused)
    func refusesEachFeatureWithItsPath(_ key: String, _ value: String, _ path: String, _ message: String) throws {
        // The test document is valid with the change, so only the renderer objects
        #expect(try Self.problems(Self.set(key, value)) == [CueProblem(path: path, message: message)])
        #expect(throws: CueDocumentError([CueProblem(path: path, message: message)])) {
            try CueRenderer(parsing: Self.set(key, value)(Self.tick), sampleRate: 48000)
        }
    }

    static let accepted: [(String, String)] = [
        ("filterCutoff", "0.3"),  // with filterType 'none' the engine routes around the filter
        ("filterResonance", "1"),
        ("filterType", #""lowpass""#),  // every filter is rendered
        ("filterType", #""highpass""#),
        ("filterType", #""bandpass""#),
        ("filterType", #""notch""#),
        ("lfoRate", "1"),
        ("lfoDepth", "0.0001"),  // every LFO is rendered
        ("lfoDepth", "1"),
        ("unisonDetune", "0.0001"),  // and unison
        ("unisonDetune", "1"),
        ("delayTime", "5e-324"),  // every delay is rendered, from the smallest above 0
        ("delayFeedback", "5e-324"),
        ("delayMix", "5e-324"),
        ("delayTime", "0.25"),
        ("delayFeedback", "0.5"),
        ("delayMix", "0.35"),
        ("delayTime", "-0"),  // -0 is 0 to the engine's every value === 0
        ("delayFeedback", "-0"),
        ("delayMix", "-0"),
        ("distortion", "-0"),
        ("distortion", "0"),
    ]

    @Test(arguments: accepted)
    func acceptsWhatTheEngineBuildsNothingFor(_ key: String, _ value: String) throws {
        #expect(try Self.problems(Self.set(key, value)).isEmpty)
    }

    @Test func refusesAnInstrumentNoCueUses() throws {
        let unused = Self.tick.replacing(
            #""instruments": {"#,
            with: #""instruments": {"grit": {"waveform": "sawtooth", "pitchOffset": 0, "attack": 0, "decay": 0, "sustain": 0, "release": 0, "envelopeCurve": "linear", "filterType": "none", "filterCutoff": 1, "filterResonance": 0, "delayTime": 0, "delayFeedback": 0, "delayMix": 0, "distortion": 0.6, "reverbMix": 0, "lfoRate": 0, "lfoDepth": 0, "lfoTarget": "pitch", "unisonDetune": 0, "velocityResponse": 0},"#)
        #expect(try CueRenderer.unsupported(CueDocument(parsing: unused)).map(\.path) == ["instruments.grit.distortion"])
    }

    @Test func refusesTheDistortionAloneAmongEveryOtherField() throws {
        var text = Self.tick
        for (key, value) in [("distortion", "0.6"), ("delayMix", "0.2"), ("filterType", #""notch""#), ("lfoDepth", "0.5"), ("lfoTarget", #""pitch""#), ("unisonDetune", "0.3")] {
            text = Self.set(key, value)(text)
        }
        #expect(try CueRenderer.unsupported(CueDocument(parsing: text)).map(\.path) == ["instruments.square.distortion"])
    }
}
