@testable import Soundscape
import Testing

/// The renderer's own behaviour. Whether it sounds right is judge.mjs's to
/// say, against the browsers; these pin where samples start and stop, and what
/// it refuses.
@Suite struct CueRendererTests {
    static let peach = Corpus.caseText("peach-of-a-word")

    @Test func rendersEachCueFromItsStartThroughItsLastNote() throws {
        let renderer = try CueRenderer(parsing: Self.peach, sampleRate: 48000)
        // tick: 30 ms, a 10 ms release, and the oscillator stops 10 ms after
        let tick = try renderer.render("tick")
        #expect(tick.count == 2400)
        #expect(tick[0] == 0)  // the phase starts at 0
        #expect(tick[1] != 0)
        #expect(try renderer.render("edition").count == 77760)
    }

    @Test func keepsAStartsFractionOfAFrame() throws {
        let late = Double(3001 * 128) / 48000
        let at48 = try CueRenderer(parsing: Self.peach, sampleRate: 48000).render("tick", at: late)
        // On the frame grid at 48 kHz, so the same samples as a render from 0
        #expect(at48 == (try CueRenderer(parsing: Self.peach, sampleRate: 48000).render("tick")))
        // At 44.1 kHz the start is frame 352,917.6: the render begins on 352,917,
        // silent there, and the note's first frame, 352,918, is already 0.4 of
        // a frame into its waveform, so not 0
        let at44 = try CueRenderer(parsing: Self.peach, sampleRate: 44100).render("tick", at: late)
        #expect(CueRenderer.firstFrame(of: late, sampleRate: 44100) == 352_917)
        #expect(at44[0] == 0)
        #expect(at44[1] != 0)
    }

    @Test func buildsTablesOnlyForTheWaveformsTheDocumentUses() throws {
        let renderer = try CueRenderer(parsing: Self.peach, sampleRate: 44100)
        #expect(renderer.sampleRate == 44100)
        #expect(BandLimitedTables.size(sampleRate: 44100) == 4096)
        #expect(BandLimitedTables.size(sampleRate: 22050) == 2048)
        #expect(BandLimitedTables.size(sampleRate: 96000) == 16384)
    }

    @Test func refusesANameTheDocumentLacks() throws {
        let renderer = try CueRenderer(parsing: Self.peach, sampleRate: 48000)
        #expect(throws: CueRenderError.noCue("nope")) { try renderer.render("nope") }
        #expect(throws: CueRenderError.start(-1)) { try renderer.render("tick", at: -1) }
    }

    @Test func refusesARateNoContextCouldHave() {
        #expect(throws: CueRenderError.sampleRate(2000)) { try CueRenderer(parsing: Self.peach, sampleRate: 2000) }
    }

    @Test func givesTheValidatorsProblemsForAnInvalidDocument() {
        #expect(throws: CueDocumentError([CueProblem(path: "", message: "must be a JSON object")])) {
            try CueRenderer(parsing: "[]", sampleRate: 48000)
        }
    }

    @Test func refusesTheWholeDocumentForAFeatureItCannotRender() throws {
        let filtered = Self.peach.replacing(#""filterType": "none""#, with: #""filterType": "lowpass""#)
        #expect(throws: CueDocumentError.self) { try CueRenderer(parsing: filtered, sampleRate: 48000) }
        let problems = CueRenderer.unsupported(try CueDocument(parsing: filtered))
        #expect(problems.map(\.path) == ["instruments.sine.filterType", "instruments.square.filterType", "instruments.triangle.filterType"])
        #expect(problems.first?.message == "must be 'none': filters are not rendered yet")
    }

    @Test func rendersTheSameSamplesTwice() throws {
        let renderer = try CueRenderer(parsing: Self.peach, sampleRate: 48000)
        for name in renderer.document.cueNames {
            #expect(try renderer.render(name) == renderer.render(name), "\(name)")
        }
    }
}
