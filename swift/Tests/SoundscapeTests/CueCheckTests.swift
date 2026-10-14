@testable import Soundscape
import Testing

/// Cue Check, the app in swift/CueCheck.swiftpm, carries its own copies of
/// the cue files it plays, since an app's resources must sit inside it. Each
/// copy is the repository's, byte for byte.
@Suite struct CueCheckTests {
    @Test func carriesPeachsCueFileAsTheCorpusHasIt() {
        let copy = Corpus.text(Corpus.root + "/swift/CueCheck.swiftpm/peach-of-a-word.json")
        #expect(copy == Corpus.caseText("peach-of-a-word"))
    }

    @Test func carriesTheFeatureDocumentAsTheExamplesHaveIt() {
        let copy = Corpus.text(Corpus.root + "/swift/CueCheck.swiftpm/every-feature.cues.json")
        #expect(copy == Corpus.text(Corpus.root + "/examples/cues/every-feature.cues.json"))
    }

    /// The feature document, which Cue Check and the web page's Safari check
    /// play side by side, is every reference set's document merged: each
    /// instrument and cue exactly as its set has it, and nothing more.
    /// every-feature.mjs writes it.
    @Test func mergesEveryReferenceFeatureDocument() throws {
        let merged = try JSONValue(parsing: Corpus.text(Corpus.root + "/examples/cues/every-feature.cues.json"))
        _ = try CueDocument(parsing: Corpus.text(Corpus.root + "/examples/cues/every-feature.cues.json"))
        var counts = (instruments: 0, cues: 0)
        for (set, path) in ReferenceRenders.sets where set != "peach" {
            let document = try JSONValue(parsing: Corpus.text(path))
            for kind in ["instruments", "cues"] {
                for (name, value) in try #require(document[kind]?.members) {
                    let copy = try #require(merged[kind]?[name], "\(set)'s \(kind) \(name) is missing")
                    #expect(JavaScript.stringify(copy) == JavaScript.stringify(value), "\(set)'s \(kind) \(name) differs")
                    if kind == "cues" { counts.cues += 1 } else { counts.instruments += 1 }
                }
            }
        }
        #expect(merged["instruments"]?.members?.count == counts.instruments)
        #expect(merged["cues"]?.members?.count == counts.cues)
        #expect(counts.cues == 55)
    }
}
