import Soundscape
import Testing

@Suite struct CueFormatTests {
    @Test func namesTheFormatAndVersionTheEngineDoes() {
        #expect(CueFormat.name == "soundscape-cues")
        #expect(CueFormat.version == 1)
    }
}
