import Soundscape
import Testing

/// Where a filter's ring ends, to the frame. Chromium and WebKit stop
/// processing a biquad once its input has been silent for the tail time its
/// coefficients give, on a render quantum's edge, however loud the ring still
/// is. Every reference filter cue, at both rates and both starts, last sounds
/// on the frame Chromium's render last sounds on, as the references record it.
///
/// measure() reads that frame as `stop`, and the bar allows WebKit's too: at
/// a bandpass's or notch's least resonance, WebKit's tail time takes another
/// branch, 640 frames later at 44.1 kHz.
@Suite struct RingEndTests {
    @Test func endsEveryFiltersRingOnChromiumsFrame() throws {
        let document = Corpus.text(Corpus.directory + "/render/filters.cues.json")
        var checked = 0
        var wrong: [String] = []
        for rate in ReferenceRenders.rates {
            let path = Corpus.directory + "/render/references/filters-\(Int(rate)).json"
            let frames = try #require(JSONValue(parsing: Corpus.text(path))["lastSoundFrames"])
            let renderer = try CueRenderer(parsing: document, sampleRate: rate)
            for (label, start) in ReferenceRenders.starts {
                for name in renderer.document.cueNames {
                    let samples = try renderer.render(name, at: start)
                    let last = samples.lastIndex { $0 != 0 } ?? -1
                    let chromium = try #require(frames[name]?[label]?["chromium"]?.number)
                    checked += 1
                    if Double(last) != chromium {
                        wrong.append("\(name) at \(Int(rate)) Hz from \(label) s: \(last), Chromium \(Int(chromium))")
                    }
                }
            }
        }
        #expect(checked == 68)
        #expect(wrong.isEmpty, "\(wrong.joined(separator: "; "))")
    }
}
