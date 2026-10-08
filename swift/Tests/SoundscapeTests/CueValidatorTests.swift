@testable import Soundscape
import Testing

/// The validator against the engine's own `parseCueDocument`. Each text's
/// problems were taken from the engine, run in Node 24, not written by hand;
/// the shared corpus in conformance/cues holds the rest.
@Suite struct CueValidatorTests {
    static let cases: [(String, String, [(String, String)])] = [
        ("valid", "{\"format\":\"soundscape-cues\",\"version\":1,\"instruments\":{\"square\":{\"waveform\":\"square\",\"pitchOffset\":0,\"attack\":0.07418049,\"decay\":0.05172575,\"sustain\":0,\"release\":0,\"envelopeCurve\":\"exponential\",\"envelopeFloor\":0.000018,\"filterType\":\"none\",\"filterCutoff\":1,\"filterResonance\":0,\"delayTime\":0,\"delayFeedback\":0,\"delayMix\":0,\"distortion\":0,\"reverbMix\":0,\"lfoRate\":0,\"lfoDepth\":0,\"lfoTarget\":\"pitch\",\"unisonDetune\":0,\"velocityResponse\":0}},\"cues\":{\"tick\":{\"notes\":[{\"id\":\"tick-1\",\"instrument\":\"square\",\"start\":0,\"duration\":0.03,\"pitch\":81,\"level\":0.0216}]}}}", []),
        ("versionString", "{\"format\":\"soundscape-cues\",\"version\":\"2\",\"instruments\":{\"square\":{\"waveform\":\"square\",\"pitchOffset\":0,\"attack\":0.07418049,\"decay\":0.05172575,\"sustain\":0,\"release\":0,\"envelopeCurve\":\"exponential\",\"envelopeFloor\":0.000018,\"filterType\":\"none\",\"filterCutoff\":1,\"filterResonance\":0,\"delayTime\":0,\"delayFeedback\":0,\"delayMix\":0,\"distortion\":0,\"reverbMix\":0,\"lfoRate\":0,\"lfoDepth\":0,\"lfoTarget\":\"pitch\",\"unisonDetune\":0,\"velocityResponse\":0}},\"cues\":{\"tick\":{\"notes\":[{\"id\":\"tick-1\",\"instrument\":\"square\",\"start\":0,\"duration\":0.03,\"pitch\":81,\"level\":0.0216}]}}}", [("version", "\"2\" is not a version this engine reads; it reads 1")]),
        ("versionNested", "{\"format\":\"soundscape-cues\",\"version\":[1,{\"b\":-0,\"a\":1e400,\"1\":\"\\ud800\\n\"}],\"instruments\":{\"square\":{\"waveform\":\"square\",\"pitchOffset\":0,\"attack\":0.07418049,\"decay\":0.05172575,\"sustain\":0,\"release\":0,\"envelopeCurve\":\"exponential\",\"envelopeFloor\":0.000018,\"filterType\":\"none\",\"filterCutoff\":1,\"filterResonance\":0,\"delayTime\":0,\"delayFeedback\":0,\"delayMix\":0,\"distortion\":0,\"reverbMix\":0,\"lfoRate\":0,\"lfoDepth\":0,\"lfoTarget\":\"pitch\",\"unisonDetune\":0,\"velocityResponse\":0}},\"cues\":{\"tick\":{\"notes\":[{\"id\":\"tick-1\",\"instrument\":\"square\",\"start\":0,\"duration\":0.03,\"pitch\":81,\"level\":0.0216}]}}}", [("version", "[1,{\"1\":\"\\ud800\\n\",\"b\":0,\"a\":null}] is not a version this engine reads; it reads 1")]),
        ("levelAtFloor", "{\"format\":\"soundscape-cues\",\"version\":1,\"instruments\":{\"square\":{\"waveform\":\"square\",\"pitchOffset\":0,\"attack\":0.07418049,\"decay\":0.05172575,\"sustain\":0,\"release\":0,\"envelopeCurve\":\"exponential\",\"envelopeFloor\":0.000018,\"filterType\":\"none\",\"filterCutoff\":1,\"filterResonance\":0,\"delayTime\":0,\"delayFeedback\":0,\"delayMix\":0,\"distortion\":0,\"reverbMix\":0,\"lfoRate\":0,\"lfoDepth\":0,\"lfoTarget\":\"pitch\",\"unisonDetune\":0,\"velocityResponse\":0}},\"cues\":{\"tick\":{\"notes\":[{\"id\":\"tick-1\",\"instrument\":\"square\",\"start\":0,\"duration\":0.03,\"pitch\":81,\"level\":0.000018}]}}}", [("cues.tick.notes[0].level", "must be above its instrument's envelopeFloor of 0.000018")]),
        ("integerNames", "{\"format\":\"soundscape-cues\",\"version\":1,\"instruments\":{\"square\":{\"waveform\":\"square\",\"pitchOffset\":0,\"attack\":0.07418049,\"decay\":0.05172575,\"sustain\":0,\"release\":0,\"envelopeCurve\":\"exponential\",\"envelopeFloor\":0.000018,\"filterType\":\"none\",\"filterCutoff\":1,\"filterResonance\":0,\"delayTime\":0,\"delayFeedback\":0,\"delayMix\":0,\"distortion\":0,\"reverbMix\":0,\"lfoRate\":0,\"lfoDepth\":0,\"lfoTarget\":\"pitch\",\"unisonDetune\":0,\"velocityResponse\":0}},\"cues\":{\"b\":{\"notes\":[{}]},\"2\":{\"notes\":[{}]},\"tick\":{\"notes\":[{\"id\":\"tick-1\",\"instrument\":\"square\",\"start\":0,\"duration\":0.03,\"pitch\":81,\"level\":0.0216}]}}}", [("cues.2.notes[0].id", "is required"), ("cues.2.notes[0].instrument", "is required"), ("cues.2.notes[0].start", "is required"), ("cues.2.notes[0].duration", "is required"), ("cues.2.notes[0].pitch", "is required"), ("cues.2.notes[0].level", "is required"), ("cues.b.notes[0].id", "is required"), ("cues.b.notes[0].instrument", "is required"), ("cues.b.notes[0].start", "is required"), ("cues.b.notes[0].duration", "is required"), ("cues.b.notes[0].pitch", "is required"), ("cues.b.notes[0].level", "is required")]),
        ("topArray", "[]", [("", "must be a JSON object")]),
        ("idsBySurrogate", "{\"format\":\"soundscape-cues\",\"version\":1,\"instruments\":{\"square\":{\"waveform\":\"square\",\"pitchOffset\":0,\"attack\":0.07418049,\"decay\":0.05172575,\"sustain\":0,\"release\":0,\"envelopeCurve\":\"exponential\",\"envelopeFloor\":0.000018,\"filterType\":\"none\",\"filterCutoff\":1,\"filterResonance\":0,\"delayTime\":0,\"delayFeedback\":0,\"delayMix\":0,\"distortion\":0,\"reverbMix\":0,\"lfoRate\":0,\"lfoDepth\":0,\"lfoTarget\":\"pitch\",\"unisonDetune\":0,\"velocityResponse\":0}},\"cues\":{\"tick\":{\"notes\":[{\"id\":\"\\ud800\",\"instrument\":\"square\",\"start\":0,\"duration\":0.03,\"pitch\":81,\"level\":0.0216},{\"id\":\"\\udc00\",\"instrument\":\"square\",\"start\":0,\"duration\":0.03,\"pitch\":81,\"level\":0.0216},{\"id\":\"\\ud800\",\"instrument\":\"square\",\"start\":0,\"duration\":0.03,\"pitch\":81,\"level\":0.0216}]}}}", [("cues.tick.notes[0].id", "must be letters, digits, dash or underscore, starting with a letter or digit"), ("cues.tick.notes[1].id", "must be letters, digits, dash or underscore, starting with a letter or digit"), ("cues.tick.notes[2].id", "must be letters, digits, dash or underscore, starting with a letter or digit"), ("cues.tick.notes[2].id", "duplicates the id at cues.tick.notes[0].id")]),
        ("nullsAndFilter", "{\"format\":\"soundscape-cues\",\"version\":1,\"instruments\":{\"square\":{\"waveform\":\"square\",\"pitchOffset\":0,\"attack\":0.07418049,\"decay\":0.05172575,\"sustain\":0,\"release\":0,\"envelopeCurve\":null,\"envelopeFloor\":0.000018,\"filterType\":\"none\",\"filterCutoff\":1,\"filterResonance\":0,\"delayTime\":0,\"delayFeedback\":0,\"delayMix\":0,\"distortion\":0,\"reverbMix\":0,\"lfoRate\":0,\"lfoDepth\":0.5,\"lfoTarget\":null,\"unisonDetune\":0,\"velocityResponse\":0}},\"cues\":{\"tick\":{\"notes\":[{\"id\":\"tick-1\",\"instrument\":\"square\",\"start\":0,\"duration\":0.03,\"pitch\":81,\"level\":0.0216}]}}}", [("instruments.square.lfoTarget", "must be one of 'filter', 'pitch'"), ("instruments.square.envelopeCurve", "must be one of 'linear', 'exponential'"), ("instruments.square.envelopeCurve", "must be 'linear' or 'exponential'"), ("instruments.square.envelopeFloor", "applies only to an exponential envelope"), ("instruments.square.lfoTarget", "an LFO aimed at the filter does nothing when filterType is 'none'")]),
        ("untilReleaseOne", "{\"format\":\"soundscape-cues\",\"version\":1,\"instruments\":{\"square\":{\"waveform\":\"square\",\"pitchOffset\":0,\"attack\":0.07418049,\"decayUntilRelease\":1,\"sustain\":0,\"release\":0,\"envelopeCurve\":\"exponential\",\"envelopeFloor\":0.000018,\"filterType\":\"none\",\"filterCutoff\":1,\"filterResonance\":0,\"delayTime\":0,\"delayFeedback\":0,\"delayMix\":0,\"distortion\":0,\"reverbMix\":0,\"lfoRate\":0,\"lfoDepth\":0,\"lfoTarget\":\"pitch\",\"unisonDetune\":0,\"velocityResponse\":0}},\"cues\":{\"tick\":{\"notes\":[{\"id\":\"tick-1\",\"instrument\":\"square\",\"start\":0,\"duration\":0.03,\"pitch\":81,\"level\":0.0216}]}}}", [("instruments.square.decayUntilRelease", "must be true, or left out for a decay of fixed length"), ("instruments.square.decay", "is required, unless decayUntilRelease is true")]),
        ("repeated", "{\"format\":\"soundscape-cues\",\"version\":1,\"instruments\":{\"square\":{\"waveform\":\"square\",\"pitchOffset\":0,\"attack\":0.07418049,\"decay\":0.05172575,\"sustain\":0,\"release\":0,\"envelopeCurve\":\"exponential\",\"envelopeFloor\":0.000018,\"filterType\":\"none\",\"filterCutoff\":1,\"filterResonance\":0,\"delayTime\":0,\"delayFeedback\":0,\"delayMix\":0,\"distortion\":0,\"reverbMix\":0,\"lfoRate\":0,\"lfoDepth\":0,\"lfoTarget\":\"pitch\",\"unisonDetune\":0,\"velocityResponse\":0}},\"cues\":{\"tick\":{\"notes\":[{\"id\":\"tick-1\",\"instrument\":\"square\",\"start\":0,\"duration\":0.03,\"pitch\":81,\"level\":0.0216,\"level\":0.5}]}}}", [("cues.tick.notes[0].level", "appears more than once in its object; JSON would keep only the last")]),
        ("notJson", "{\"format\": ", [("", "is not valid JSON: Unexpected end of JSON input")]),
    ]

    @Test(arguments: cases.indices)
    func reportsWhatTheEngineReports(_ index: Int) {
        let (_, text, expected) = Self.cases[index]
        let problems: [CueProblem]
        switch CueDocument.parse(text) {
        case .success: problems = []
        case .failure(let error): problems = error.problems
        }
        let wanted = expected.map { CueProblem(path: $0.0, message: $0.1) }
        if wanted.first?.message.hasPrefix("is not valid JSON") == true {
            // Each JavaScript engine words its JSON.parse errors its own way
            #expect(problems.count == 1 && problems[0].path == "" && problems[0].message.hasPrefix("is not valid JSON"))
        } else {
            #expect(problems == wanted, "\(Self.cases[index].0)")
        }
    }

    @Test func buildsTheTypedDocument() throws {
        let text = Self.cases.first { $0.0 == "valid" }!.1
        let document = try CueDocument(parsing: text)
        #expect(document.cueNames == ["tick"])
        let square = try #require(document.instruments["square"])
        #expect(square.waveform == .square)
        #expect(square.decay == .fixed(0.05172575))
        #expect(square.envelopeFloor == 0.000018)
        let note = try #require(document.cues["tick"]?.notes.first)
        #expect(note.id == "tick-1" && note.instrument == "square")
        #expect(note.start == 0 && note.duration == 0.03 && note.pitch == 81 && note.level == 0.0216)
        let untilRelease = try CueDocument(parsing: text.replacing("\"decay\":0.05172575", with: "\"decayUntilRelease\":true"))
        #expect(untilRelease.instruments["square"]?.decay == .untilRelease)
    }

    @Test func listsCueNamesInTheDocumentsOrder() throws {
        let text = Self.cases.first { $0.0 == "valid" }!.1.replacing(
            "\"cues\":{", with: "\"cues\":{\"b\":{\"notes\":[]},\"7\":{\"notes\":[]},")
        #expect(try CueDocument(parsing: text).cueNames == ["7", "b", "tick"])
    }

    @Test func describesItsProblemsAsTheEnginesErrorDoes() {
        let error = CueDocumentError([CueProblem(path: "", message: "must be a JSON object"), CueProblem(path: "version", message: "x")])
        #expect(error.description == "Invalid cue document:\n  (document): must be a JSON object\n  version: x")
    }

    /// Each double and how JavaScript's String(x) writes it.
    static let numbers: [(Double, String)] = [
        (0, "0"), (-0.0, "0"), (1, "1"), (-1, "-1"), (0.5, "0.5"), (100, "100"), (1e21, "1e+21"),
        (1e20, "100000000000000000000"), (Double("123456789012345680000")!, "123456789012345680000"), (1e-6, "0.000001"),
        (1e-7, "1e-7"), (1.5e-7, "1.5e-7"), (0.0000015, "0.0000015"), (0.000018, "0.000018"),
        (Double.leastNonzeroMagnitude, "5e-324"), (1.7976931348623157e308, "1.7976931348623157e+308"),
        (0.30000000000000004, "0.30000000000000004"), (0.1, "0.1"), (1.0 / 3, "0.3333333333333333"),
        (2.0 / 3, "0.6666666666666666"), (123.456, "123.456"), (-123.456e-10, "-1.23456e-8"),
        (Double("9007199254740993")!, "9007199254740992"), (.infinity, "Infinity"), (-.infinity, "-Infinity"),
        (1e300, "1e+300"), (4.35, "4.35"), (0.07418053232275866, "0.07418053232275866"),
        (78.99998074500876, "78.99998074500876"), (Double("18446744073709551616")!, "18446744073709552000"),
        (1.0000000000000002, "1.0000000000000002"), (25, "25"), (127.5, "127.5"),
    ]

    @Test(arguments: numbers)
    func writesNumbersAsJavaScriptDoes(_ x: Double, _ written: String) {
        #expect(JavaScript.string(x) == written)
    }

    /// Each text and what JSON.stringify(JSON.parse(text)) gives.
    static let stringified: [(String, String)] = [
        ("[1,\"a\",null,true,{\"b\":[]}]", "[1,\"a\",null,true,{\"b\":[]}]"),
        ("{\"b\":1,\"2\":{\"x\":-0},\"1\":1e400}", "{\"1\":null,\"2\":{\"x\":0},\"b\":1}"),
        ("\"\\ud800\\u0001\\u001f\\b\\f\\n\\r\\t\\\\\\\"\\u007f\\u2028\\udc00\\ud83d\\ude00\"", "\"\\ud800\\u0001\\u001f\\b\\f\\n\\r\\t\\\\\\\"\u{7f}\u{2028}\\udc00\u{1f600}\""),
        ("2", "2"),
        ("\"2\"", "\"2\""),
        ("1.5", "1.5"),
        ("{}", "{}"),
        ("[]", "[]"),
    ]

    @Test(arguments: stringified)
    func stringifiesAsJavaScriptDoes(_ text: String, _ written: String) throws {
        #expect(JavaScript.stringify(try JSONValue(parsing: text)) == written)
    }
}
