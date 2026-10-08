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

    @Test func rendersEveryReferenceCueTheSameEveryTime() throws {
        let hashes = try Self.hashes()
        let recordedPath = Corpus.directory + "/render/hashes.json"
        if let out = getenv("CUE_HASHES_OUT").map({ String(cString: $0) }) {
            let lines = hashes.map { "    \"\($0.0)\": \"\($0.1)\"" }.joined(separator: ",\n")
            let file = fopen(out, "wb")!
            fputs("{\n  \"renders\": {\n\(lines)\n  }\n}\n", file)
            fclose(file)
        }
        let recorded = try #require(JSONValue(parsing: Corpus.text(recordedPath))["renders"]?.members)
        let expected = Dictionary(uniqueKeysWithValues: recorded.map { ($0.key, $0.value.string!) })
        let matching = hashes.filter { expected[$0.0] == $0.1 }.count
        #if os(Linux)
        print("hashes: \(matching) of \(hashes.count) renders match macOS's")
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
