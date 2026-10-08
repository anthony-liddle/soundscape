#if canImport(Darwin)
import Darwin
#elseif canImport(Glibc)
import Glibc
#endif
import Soundscape
import Testing

/// Renders every reference cue, at every rate and start the references cover,
/// for conformance/cues/render/judge.mjs to measure and hold to the bar. Runs
/// when CUE_RENDER_OUT names a directory, as CI does, and is skipped otherwise.
@Suite struct ReferenceRenders {
    static let out: String? = getenv("CUE_RENDER_OUT").map { String(cString: $0) }

    /// The same sets, rates and starts as conformance/cues/render/conditions.mjs.
    static let sets = [
        ("peach", Corpus.directory + "/cases/peach-of-a-word.json"),
        ("features", Corpus.directory + "/render/features.cues.json"),
    ]
    static let rates: [Double] = [48000, 44100]
    static let starts: [(String, Double)] = [("0", 0), ("8.0027", Double(3001 * 128) / 48000)]

    @Test(.enabled(if: out != nil, "set CUE_RENDER_OUT to a directory for judge.mjs"))
    func writesEveryReferenceCue() throws {
        var written = 0
        for (set, path) in Self.sets {
            for rate in Self.rates {
                let renderer = try CueRenderer(parsing: Corpus.text(path), sampleRate: rate)
                for (label, start) in Self.starts {
                    let dir = "\(Self.out!)/\(set)-\(Int(rate))-\(label)"
                    Files.makeDirectory(dir)
                    for name in renderer.document.cueNames {
                        Files.write(try renderer.render(name, at: start), to: "\(dir)/\(name).f32")
                        written += 1
                    }
                }
            }
        }
        print("wrote \(written) renders to \(Self.out!)")
    }
}

/// Writing files with the C library, as Corpus reads them.
enum Files {
    static func makeDirectory(_ path: String) {
        var built = ""
        for part in path.split(separator: "/", omittingEmptySubsequences: false) {
            built += (built.isEmpty && part.isEmpty) ? "" : (built.isEmpty && !path.hasPrefix("/") ? "" : "/") + part
            if !built.isEmpty { mkdir(built, 0o755) }
        }
    }

    static func write(_ samples: [Float], to path: String) {
        guard let file = fopen(path, "wb") else { fatalError("cannot write \(path)") }
        defer { fclose(file) }
        samples.withUnsafeBufferPointer { _ = fwrite($0.baseAddress, MemoryLayout<Float>.size, $0.count, file) }
    }
}
