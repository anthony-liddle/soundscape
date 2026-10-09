import Testing

/// Cue Check, the app in swift/CueCheck.swiftpm, carries its own copy of
/// Peach's cue file, since an app's resources must sit inside it. The copy
/// is the corpus's, byte for byte.
@Suite struct CueCheckTests {
    @Test func carriesPeachsCueFileAsTheCorpusHasIt() {
        let copy = Corpus.text(Corpus.root + "/swift/CueCheck.swiftpm/peach-of-a-word.json")
        #expect(copy == Corpus.caseText("peach-of-a-word"))
    }
}
