/// A cue document: short sound-effect recipes, each a handful of notes at exact
/// offsets in seconds. The Swift side of the engine's `CueDocument`, in
/// `cues/types.ts`, which is the format's single source of truth.
///
/// Made only by ``parse(_:)`` or ``validate(_:)``, so every document here is
/// one the engine's `validateCueDocument` accepts.
public struct CueDocument: Equatable, Sendable {
    /// The document's own instruments, by name.
    public let instruments: [String: CueInstrument]
    /// The cues, by name.
    public let cues: [String: Cue]
    /// The cue names in the document's order, as the engine's `getCueNames`
    /// gives them: names that are array indices first, then the rest as written.
    public let cueNames: [String]

    /// `parseCueDocument`: reads JSON text and validates it, reporting every
    /// problem, each with its path, in the order the engine reports them,
    /// including a key that appears twice in one object.
    public static func parse(_ text: String) -> Result<CueDocument, CueDocumentError> {
        let reading: JSONReading
        do {
            reading = try JSONReader.read(text)
        } catch {
            return .failure(CueDocumentError([CueProblem(path: "", message: "is not valid JSON: \(error)")]))
        }
        let repeats = reading.repeatedKeys.map {
            CueProblem(path: $0, message: "appears more than once in its object; JSON would keep only the last")
        }
        switch validate(reading.value) {
        case .success(let document) where repeats.isEmpty: return .success(document)
        case .success: return .failure(CueDocumentError(repeats))
        case .failure(let error): return .failure(CueDocumentError(repeats + error.problems))
        }
    }

    /// `validateCueDocument`: validates a value already read. A repeated key
    /// cannot be seen here, as `JSON.parse` cannot see one in JavaScript;
    /// ``parse(_:)`` catches those too.
    public static func validate(_ value: JSONValue) -> Result<CueDocument, CueDocumentError> {
        let problems = CueValidator.problems(value)
        guard problems.isEmpty else { return .failure(CueDocumentError(problems)) }
        return .success(CueDocument(valid: value))
    }

    /// Reads and validates, throwing a ``CueDocumentError`` listing every problem.
    public init(parsing text: String) throws {
        self = try Self.parse(text).get()
    }

    /// Builds the typed document from a value the validator has accepted, so
    /// every field is present and of its type.
    private init(valid value: JSONValue) {
        let instruments = value["instruments"]!.members!
        let cues = value["cues"]!.members!
        self.instruments = Dictionary(uniqueKeysWithValues: instruments.map { ($0.key, CueInstrument(valid: $0.value)) })
        self.cues = Dictionary(uniqueKeysWithValues: cues.map { ($0.key, Cue(valid: $0.value)) })
        cueNames = cues.map(\.key)
    }
}

/// An instrument spelled out in full, as the engine's `CueInstrument`. Every
/// field is required, so nothing falls back to a default.
public struct CueInstrument: Equatable, Sendable {
    public enum Waveform: String, Sendable { case sine, square, sawtooth, triangle }
    public enum FilterType: String, Sendable { case lowpass, highpass, bandpass, notch, none }
    public enum LFOTarget: String, Sendable { case filter, pitch }
    public enum EnvelopeCurve: String, Sendable { case linear, exponential }

    /// The engine's `decay` or `decayUntilRelease: true`: an instrument has exactly one.
    public enum Decay: Equatable, Sendable {
        /// A decay of fixed length, normalized from 0 to 1.
        case fixed(Double)
        /// A decay from the end of the attack to each note's release.
        case untilRelease
    }

    public let waveform: Waveform
    public let pitchOffset: Double
    public let attack: Double
    public let decay: Decay
    public let sustain: Double
    public let release: Double
    public let envelopeCurve: EnvelopeCurve
    /// Present exactly when the curve is exponential.
    public let envelopeFloor: Double?
    public let filterType: FilterType
    public let filterCutoff: Double
    public let filterResonance: Double
    public let delayTime: Double
    public let delayFeedback: Double
    public let delayMix: Double
    public let distortion: Double
    /// Always 0 in a cue: the reverb's impulse response is random.
    public let reverbMix: Double
    public let lfoRate: Double
    public let lfoDepth: Double
    public let lfoTarget: LFOTarget
    public let unisonDetune: Double
    /// Always 0 in a cue: a note's level is its peak.
    public let velocityResponse: Double

    init(valid v: JSONValue) {
        func number(_ key: String) -> Double { v[key]!.number! }
        waveform = Waveform(rawValue: v["waveform"]!.string!)!
        pitchOffset = number("pitchOffset")
        attack = number("attack")
        decay = v["decayUntilRelease"] != nil ? .untilRelease : .fixed(number("decay"))
        sustain = number("sustain")
        release = number("release")
        envelopeCurve = EnvelopeCurve(rawValue: v["envelopeCurve"]!.string!)!
        envelopeFloor = v["envelopeFloor"]?.number
        filterType = FilterType(rawValue: v["filterType"]!.string!)!
        filterCutoff = number("filterCutoff")
        filterResonance = number("filterResonance")
        delayTime = number("delayTime")
        delayFeedback = number("delayFeedback")
        delayMix = number("delayMix")
        distortion = number("distortion")
        reverbMix = number("reverbMix")
        lfoRate = number("lfoRate")
        lfoDepth = number("lfoDepth")
        lfoTarget = LFOTarget(rawValue: v["lfoTarget"]!.string!)!
        unisonDetune = number("unisonDetune")
        velocityResponse = number("velocityResponse")
    }
}

/// One cue: its notes, in the order the document gives them.
public struct Cue: Equatable, Sendable {
    public let notes: [CueNote]

    init(valid v: JSONValue) {
        notes = v["notes"]!.elements!.map(CueNote.init(valid:))
    }
}

/// One note of a cue, as the engine's `CueNote`.
public struct CueNote: Equatable, Sendable {
    /// Stable and unique across the whole document.
    public let id: String
    /// The name of an instrument in the same document.
    public let instrument: String
    /// Seconds from the moment the cue is played.
    public let start: Double
    /// Seconds until the note is released.
    public let duration: Double
    /// MIDI pitch, 0 to 127, fractional values exact.
    public let pitch: Double
    /// The envelope's peak, as a linear gain.
    public let level: Double

    init(valid v: JSONValue) {
        id = v["id"]!.string!
        instrument = v["instrument"]!.string!
        start = v["start"]!.number!
        duration = v["duration"]!.number!
        pitch = v["pitch"]!.number!
        level = v["level"]!.number!
    }
}

/// One reason a cue document was rejected, with the path to the bad value, as
/// the engine's `CueProblem`.
public struct CueProblem: Equatable, Sendable, CustomStringConvertible {
    /// Where, for example `cues.tick.notes[0].level`. Empty for the document itself.
    public let path: String
    public let message: String

    public init(path: String, message: String) {
        self.path = path
        self.message = message
    }

    public var description: String { "\(path.isEmpty ? "(document)" : path): \(message)" }
}

/// Every problem with a cue document, as the engine's `CueDocumentError`, whose
/// message this one's description matches.
public struct CueDocumentError: Error, Equatable, Sendable, CustomStringConvertible {
    public let problems: [CueProblem]

    public init(_ problems: [CueProblem]) {
        self.problems = problems
    }

    public var description: String {
        "Invalid cue document:\n" + problems.map { "  \($0)" }.joined(separator: "\n")
    }
}
