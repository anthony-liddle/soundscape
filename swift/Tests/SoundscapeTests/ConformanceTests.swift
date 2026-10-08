@testable import Soundscape
import Testing

/// The Swift half of the shared corpus in conformance/cues: every case through
/// the Swift validator, held to the answer the engine recorded for it.
@Suite struct ConformanceTests {
    @Test func recordsAnAnswerForEveryCaseAndOnlyForCases() throws {
        let recorded = try #require(Corpus.expected.members).map(\.key).sorted()
        #expect(recorded == Corpus.cases)
        #expect(Corpus.cases.count > 50)
    }

    @Test(arguments: Corpus.cases)
    func answersAsTheEngineDoes(_ name: String) {
        let result = CueDocument.parse(Corpus.caseText(name))
        let expected = Corpus.expectedProblems(name)
        #expect(Corpus.matches(result, expected), "\(name): \(result)")
    }

    /// Every number literal in the corpus, Peach's file included: the reader's
    /// double and JavaScript's, bit for bit, and how each is written back.
    @Test func readsEveryCorpusNumberAsJavaScriptDoes() throws {
        let numbers = try #require(JSONValue(parsing: Corpus.text(Corpus.directory + "/numbers.json")).members)
        #expect(numbers.count > 50)
        for (literal, recorded) in numbers {
            let n = try #require(JSONValue(parsing: literal).number, "\(literal)")
            let bits = String(n.bitPattern, radix: 16)
            #expect(String(repeating: "0", count: 16 - bits.count) + bits == recorded["bits"]!.string!, "\(literal)")
            #expect(JavaScript.string(n) == recorded["string"]!.string!, "\(literal)")
        }
    }
}
