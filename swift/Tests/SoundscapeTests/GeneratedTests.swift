#if canImport(Darwin)
import Darwin
#elseif canImport(Glibc)
import Glibc
#endif
@testable import Soundscape
import Testing

/// The generator's cases: seeded random mutations of valid documents, each
/// with the engine's answer, written by conformance/cues/generate.mjs. This
/// runs when CUE_GENERATED names that file, as CI does, and is skipped
/// otherwise.
@Suite struct GeneratedTests {
    static let path: String? = getenv("CUE_GENERATED").map { String(cString: $0) }

    @Test(.enabled(if: path != nil, "set CUE_GENERATED to a file from generate.mjs"))
    func answersEveryGeneratedCaseAsTheEngineDoes() throws {
        let lines = Corpus.text(Self.path!).split(separator: "\n")
        #expect(!lines.isEmpty)
        var disagreements = 0
        for line in lines {
            let generated = try JSONValue(parsing: String(line))
            let text = generated["text"]!.string!
            let answer = generated["expected"]!
            let expected: [CueProblem]? =
                answer["ok"]?.bool == true
                ? nil
                : answer["problems"]!.elements!.map { CueProblem(path: $0["path"]!.string!, message: $0["message"]!.string!) }
            let result = CueDocument.parse(text)
            if !Corpus.matches(result, expected) {
                disagreements += 1
                let seed = JavaScript.string(generated["seed"]!.number!)
                let index = JavaScript.string(generated["index"]!.number!)
                Issue.record(
                    """
                    seed \(seed) case \(index) disagrees, after \(JavaScript.stringify(generated["mutations"]!))
                    text: \(text)
                    engine: \(JavaScript.stringify(answer))
                    swift: \(result)
                    again: node conformance/cues/generate.mjs --seed \(seed) --only \(index) --out <file>, then CUE_GENERATED=<file> swift test --filter GeneratedTests
                    """)
            }
        }
        print("generated: \(lines.count) cases, \(disagreements) disagreements")
    }
}
