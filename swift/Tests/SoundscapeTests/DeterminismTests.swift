#if canImport(Darwin)
import Darwin
#elseif canImport(Glibc)
import Glibc
#endif
@testable import Soundscape
import Testing

/// A render matches itself exactly on one platform. Every reference cue, at
/// every rate and start, renders the same twice, and on Apple platforms hashes
/// as conformance/cues/render/hashes.json records, which was made on macOS.
/// Linux's C library computes sin, cos and pow differently from Darwin's, so
/// there the hashes are counted, not required: Linux is held to the bar.
@Suite struct DeterminismTests {
    /// Every reference render's hash, by condition and cue, as judge.mjs names them.
    static func hashes() throws -> [(String, String)] {
        var out: [(String, String)] = []
        for (set, path) in ReferenceRenders.sets {
            for rate in ReferenceRenders.rates {
                let renderer = try CueRenderer(parsing: Corpus.text(path), sampleRate: rate)
                for (label, start) in ReferenceRenders.starts {
                    for name in renderer.document.cueNames {
                        let first = try renderer.render(name, at: start)
                        let again = try renderer.render(name, at: start)
                        #expect(first == again, "\(name) at \(Int(rate)) Hz from \(label) s rendered differently twice")
                        out.append(("\(set)-\(Int(rate))-\(label)/\(name)", SHA256.hex(first)))
                    }
                }
            }
        }
        return out
    }

    /// hashes.json's text: what it says it is, the platform it was made on,
    /// and every render's hash, in the order rendered.
    static func written(about: String, platform: String, _ hashes: [(String, String)]) -> String {
        // A JSON string, as JSON.stringify writes one
        func quoted(_ text: String) -> String {
            var out = "\""
            for unit in text.unicodeScalars {
                switch unit {
                case "\"": out += "\\\""
                case "\\": out += "\\\\"
                case "\n": out += "\\n"
                case "\r": out += "\\r"
                case "\t": out += "\\t"
                case "\u{08}": out += "\\b"
                case "\u{0C}": out += "\\f"
                case _ where unit.value < 0x20:
                    let hex = String(unit.value, radix: 16)
                    out += "\\u" + String(repeating: "0", count: 4 - hex.count) + hex
                default: out.unicodeScalars.append(unit)
                }
            }
            return out + "\""
        }
        let lines = hashes.map { "    \(quoted($0.0)): \(quoted($0.1))" }.joined(separator: ",\n")
        return "{\n  \"about\": \(quoted(about)),\n  \"platform\": \(quoted(platform)),\n  \"renders\": {\n\(lines)\n  }\n}\n"
    }

    /// Writing the recorded hashes back out makes hashes.json again, to the
    /// byte, what it says it is and the platform it was made on kept.
    @Test func writesHashesJSONAsRecorded() throws {
        let text = Corpus.text(Corpus.directory + "/render/hashes.json")
        let recorded = try JSONValue(parsing: text)
        let about = try #require(recorded["about"]?.string)
        let platform = try #require(recorded["platform"]?.string)
        let renders = try #require(recorded["renders"]?.members).map { ($0.key, $0.value.string!) }
        #expect(Self.written(about: about, platform: platform, renders) == text)
    }

    @Test func rendersEveryReferenceCueTheSameEveryTime() throws {
        let hashes = try Self.hashes()
        let recordedPath = Corpus.directory + "/render/hashes.json"
        let recordedFile = try JSONValue(parsing: Corpus.text(recordedPath))
        if let out = getenv("CUE_HASHES_OUT").map({ String(cString: $0) }) {
            // What hashes.json says it is, and where it was made, kept as they are
            let about = try #require(recordedFile["about"]?.string)
            let platform = try #require(recordedFile["platform"]?.string)
            let file = fopen(out, "wb")!
            fputs(Self.written(about: about, platform: platform, hashes), file)
            fclose(file)
        }
        let recorded = try #require(recordedFile["renders"]?.members)
        let expected = Dictionary(uniqueKeysWithValues: recorded.map { ($0.key, $0.value.string!) })
        let matching = hashes.filter { expected[$0.0] == $0.1 }.count
        #if os(Linux)
        print("hashes: \(matching) of \(hashes.count) renders match macOS's")
        let differing = hashes.filter { expected[$0.0] != $0.1 }.map(\.0)
        if !differing.isEmpty { print("hashes: these differ from macOS's: \(differing.joined(separator: ", "))") }
        #else
        #expect(hashes.count == expected.count)
        #expect(matching == hashes.count, "\(hashes.count - matching) renders hash differently from hashes.json")
        print("hashes: all \(matching) of \(hashes.count) renders match hashes.json")
        #endif
    }

    @Test func hashesAsSHA256Should() {
        #expect(SHA256.hex(Array("abc".utf8)) == "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
        #expect(SHA256.hex([UInt8]()) == "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855")
    }
}
