import Soundscape
import Testing

/// Nothing a valid document can hold is refused: every effect, from the
/// smallest value above 0, where the engine starts building its chain, is
/// rendered, as is every filter, LFO and unison.
@Suite struct EveryFieldTests {
    /// Peach's tick: one square instrument, one note, every effect 0.
    static let tick = Corpus.caseText("test-valid")

    static func set(_ key: String, _ value: String) -> (String) -> String {
        { text in
            var out = text
            let start = text.firstRange(of: "\"\(key)\": ")!.upperBound
            let end = text[start...].firstIndex { $0 == "," || $0 == "\n" }!
            out.replaceSubrange(start..<end, with: value)
            return out
        }
    }

    static let rendered: [(String, String)] = [
        // The smallest number above 0, at the edge where the engine builds its chain
        ("delayTime", "5e-324"),
        ("delayFeedback", "5e-324"),
        ("delayMix", "5e-324"),
        ("distortion", "5e-324"),
        // And values that sound
        ("delayTime", "0.25"),
        ("delayFeedback", "0.5"),
        ("delayMix", "0.35"),
        ("distortion", "1"),
        ("delayTime", "-0"),  // -0 is 0 to the engine's every value === 0
        ("distortion", "-0"),
        ("filterCutoff", "0.3"),  // with filterType 'none' the engine routes around the filter
        ("filterResonance", "1"),
        ("filterType", #""lowpass""#),
        ("filterType", #""highpass""#),
        ("filterType", #""bandpass""#),
        ("filterType", #""notch""#),
        ("lfoRate", "1"),
        ("lfoDepth", "0.0001"),
        ("lfoDepth", "1"),
        ("unisonDetune", "0.0001"),
        ("unisonDetune", "1"),
    ]

    @Test(arguments: rendered)
    func rendersEveryField(_ key: String, _ value: String) throws {
        let text = Self.set(key, value)(Self.tick)
        let renderer = try CueRenderer(parsing: text, sampleRate: 48000)
        #expect(try renderer.render(renderer.document.cueNames[0]).contains { $0 != 0 })
    }
}
