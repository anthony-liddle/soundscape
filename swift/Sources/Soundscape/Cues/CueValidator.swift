/// The engine's `validateCueDocument`, in `cues/validate.ts`, rule for rule:
/// the same checks in the same order, with the same paths and messages, so a
/// document is accepted or rejected here exactly as it is there. Where the
/// TypeScript reads a property, this reads the member of the same name, and a
/// missing member is JavaScript's `undefined`.
enum CueValidator {
    static func problems(_ value: JSONValue) -> [CueProblem] {
        var c = Checker()
        c.document(value)
        return c.problems
    }
}

private let topKeys = ["format", "version", "instruments", "cues"]
private let cueKeys = ["notes"]
private let noteKeys = ["id", "instrument", "start", "duration", "pitch", "level"]

/// Instrument fields mapped from 0 to 1 by the engine.
private let normalized = [
    "attack", "decay", "sustain", "release", "filterCutoff", "filterResonance", "delayTime", "delayFeedback",
    "delayMix", "distortion", "lfoRate", "lfoDepth", "unisonDetune",
]
/// Instrument fields a cue fixes at 0, and why.
private let fixedAtZero: [(String, String)] = [
    ("reverbMix", "must be 0: the reverb's impulse response is random, and a cue must sound the same every time"),
    ("velocityResponse", "must be 0: a cue note's level is its peak, and velocity plays no part"),
]
private let enums: [(String, [String])] = [
    ("waveform", ["sine", "square", "sawtooth", "triangle"]),
    ("filterType", ["lowpass", "highpass", "bandpass", "notch", "none"]),
    ("lfoTarget", ["filter", "pitch"]),
    ("envelopeCurve", ["linear", "exponential"]),
]
/// Every instrument key but the two that are sometimes left out.
private let instrumentKeys = ["waveform", "pitchOffset"] + normalized + fixedAtZero.map(\.0)
    + ["filterType", "lfoTarget", "envelopeCurve"]

private func join(_ base: String, _ key: String) -> String { base.isEmpty ? key : "\(base).\(key)" }

private struct Checker {
    var problems: [CueProblem] = []

    mutating func add(_ path: String, _ message: String) {
        problems.append(CueProblem(path: path, message: message))
    }

    /// Reject any key outside `allowed`, and require each of `required`.
    mutating func keys(_ value: JSONValue, _ base: String, _ allowed: [String], _ required: [String]? = nil) {
        for (key, _) in value.members ?? [] where !allowed.contains(key) {
            add(join(base, key), "is not a key a cue document can have")
        }
        for key in required ?? allowed where value[key] == nil {
            add(join(base, key), "is required")
        }
    }

    /// A finite number in range, or a problem. Returns it if usable.
    @discardableResult
    mutating func number(_ value: JSONValue, _ key: String, _ base: String, _ inRange: (Double) -> Bool, _ range: String) -> Double? {
        guard let member = value[key] else { return nil }
        guard let n = member.number else {
            add(join(base, key), "must be a number")
            return nil
        }
        guard n.isFinite, inRange(n) else {
            add(join(base, key), "must be \(range)")
            return nil
        }
        return n
    }

    /// Letters, digits, dash and underscore, starting with a letter or digit:
    /// `/^[A-Za-z0-9][A-Za-z0-9_-]*$/`.
    mutating func name(_ name: String, _ path: String) {
        let utf8 = Array(name.utf8)
        func alnum(_ b: UInt8) -> Bool { (0x30...0x39).contains(b) || (0x41...0x5A).contains(b) || (0x61...0x7A).contains(b) }
        let ok = !utf8.isEmpty && alnum(utf8[0]) && utf8.allSatisfy { alnum($0) || $0 == 0x5F || $0 == 0x2D }
        if !ok { add(path, "must be letters, digits, dash or underscore, starting with a letter or digit") }
    }

    mutating func document(_ value: JSONValue) {
        guard value.isObject else {
            add("", "must be a JSON object")
            return
        }
        keys(value, "", topKeys)
        if let format = value["format"], format.string != CueFormat.name {
            add("format", "must be '\(CueFormat.name)'")
        }
        if let version = value["version"], version.number != Double(CueFormat.version) {
            add("version", "\(JavaScript.stringify(version)) is not a version this engine reads; it reads \(CueFormat.version)")
        }

        var instruments: JSONValue?
        if let given = value["instruments"] {
            if let members = given.members {
                instruments = given
                for (name, instrument) in members {
                    self.name(name, join("instruments", name))
                    self.instrument(instrument, join("instruments", name))
                }
            } else {
                add("instruments", "must be an object of instruments by name")
            }
        }

        if let given = value["cues"] {
            guard let members = given.members else {
                add("cues", "must be an object of cues by name")
                return
            }
            var ids: [[UInt16]: String] = [:]
            for (name, cue) in members {
                let base = join("cues", name)
                self.name(name, base)
                guard cue.isObject else {
                    add(base, "must be an object")
                    continue
                }
                keys(cue, base, cueKeys)
                guard let notes = cue["notes"] else { continue }
                guard let elements = notes.elements else {
                    add(join(base, "notes"), "must be an array of notes")
                    continue
                }
                for (i, note) in elements.enumerated() {
                    self.note(note, "\(base).notes[\(i)]", instruments, &ids)
                }
            }
        }
    }

    mutating func instrument(_ value: JSONValue, _ base: String) {
        guard value.isObject else {
            add(base, "must be an object")
            return
        }
        // decay is required unless decayUntilRelease stands in for it, and
        // never beside it, where its value would go unread
        let untilRelease = value["decayUntilRelease"]?.bool == true
        keys(value, base, instrumentKeys + ["envelopeFloor", "decayUntilRelease"], instrumentKeys.filter { $0 != "decay" })
        if value["decayUntilRelease"] != nil && !untilRelease {
            add(join(base, "decayUntilRelease"), "must be true, or left out for a decay of fixed length")
        }
        if untilRelease && value["decay"] != nil {
            add(join(base, "decay"), "must be left out: decayUntilRelease makes the decay last until each note's release")
        } else if !untilRelease && value["decay"] == nil {
            add(join(base, "decay"), "is required, unless decayUntilRelease is true")
        }
        for (key, options) in enums {
            if let member = value[key], !options.contains(where: { $0 == member.string }) {
                add(join(base, key), "must be one of \(options.map { "'\($0)'" }.joined(separator: ", "))")
            }
        }
        number(value, "pitchOffset", base, { $0 >= -24 && $0 <= 24 }, "a number of semitones from -24 to 24")
        for key in normalized { number(value, key, base, { $0 >= 0 && $0 <= 1 }, "from 0 to 1") }
        for (key, why) in fixedAtZero {
            if let member = value[key], member.number != 0 { add(join(base, key), why) }
        }
        // The rules every instrument follows, shared with the state validator
        for (key, message) in envelopeAndFilterProblems(value) { add(join(base, key), message) }
    }

    /// `envelopeAndFilterProblems` in `utils/validation.ts`.
    func envelopeAndFilterProblems(_ params: JSONValue) -> [(String, String)] {
        var out: [(String, String)] = []
        let curve = params["envelopeCurve"]
        if let curve, !["linear", "exponential"].contains(where: { $0 == curve.string }) {
            out.append(("envelopeCurve", "must be 'linear' or 'exponential'"))
        }
        let floor = params["envelopeFloor"]
        if curve?.string == "exponential" {
            if !(floor?.number.map { $0.isFinite && $0 > 0 && $0 < 1 } ?? false) {
                out.append(("envelopeFloor", "an exponential envelope needs a floor between 0 and 1, exclusive"))
            }
        } else if floor != nil {
            out.append(("envelopeFloor", "applies only to an exponential envelope"))
        }
        // lfoTarget ?? 'filter': missing and null both mean the filter
        let target = params["lfoTarget"].flatMap { $0.isNull ? nil : $0 }
        let lfoOnFilter = target.map { $0.string == "filter" } ?? true
        let depth = params["lfoDepth"]?.number
        if params["filterType"]?.string == "none", let depth, depth.isFinite, depth > 0, lfoOnFilter {
            out.append(("lfoTarget", "an LFO aimed at the filter does nothing when filterType is 'none'"))
        }
        return out
    }

    mutating func note(_ value: JSONValue, _ base: String, _ instruments: JSONValue?, _ ids: inout [[UInt16]: String]) {
        guard value.isObject else {
            add(base, "must be an object")
            return
        }
        keys(value, base, noteKeys)

        if let id = value["id"] {
            if let text = id.string, let units = id.codeUnits {
                name(text, join(base, "id"))
                if let first = ids[units] {
                    add(join(base, "id"), "duplicates the id at \(first)")
                } else {
                    ids[units] = join(base, "id")
                }
            } else {
                add(join(base, "id"), "must be a string")
            }
        }

        // An own member only, so 'toString' is never found. Skipped when the
        // instruments themselves are missing, with nothing to check against.
        var instrument: JSONValue?
        if let name = value["instrument"], let instruments {
            if let units = name.codeUnits, let found = instruments.member(codeUnits: units) {
                if found.isObject { instrument = found }
            } else {
                add(join(base, "instrument"), "must name an instrument this document defines")
            }
        }

        number(value, "start", base, { $0 >= 0 }, "seconds, 0 or more")
        number(value, "duration", base, { $0 > 0 }, "seconds, more than 0")
        number(value, "pitch", base, { $0 >= 0 && $0 <= 127 }, "a MIDI pitch from 0 to 127")
        let level = number(value, "level", base, { $0 > 0 && $0 <= 1 }, "a linear gain above 0 and at most 1")

        if let level, instrument?["envelopeCurve"]?.string == "exponential", let floor = instrument?["envelopeFloor"]?.number,
            level <= floor
        {
            add(join(base, "level"), "must be above its instrument's envelopeFloor of \(JavaScript.string(floor))")
        }
    }
}
