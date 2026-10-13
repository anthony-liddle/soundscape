import Soundscape
import Testing

/// Where a render through an effects chain ends, to the frame. Every
/// reference delay, echo and distortion cue, at both rates and both starts,
/// ends on the frame the engine would disconnect its chain on, its deadline
/// rounded up to a frame, as every browser's engine worked it out for the
/// references; and last sounds on the frame Chromium's render last sounds on.
///
/// measure() reads that last frame as `stop`, and the delay's bar allows
/// WebKit's too, up to 14 frames later where it reads the delay line in double.
@Suite struct ChainEndTests {
    @Test(arguments: [("delay", 76), ("echo", 4), ("distortion", 24)])
    func endsWhereTheEngineAndChromiumEnd(_ set: String, _ count: Int) throws {
        let document = Corpus.text(Corpus.directory + "/render/\(set).cues.json")
        var checked = 0
        var wrong: [String] = []
        for rate in ReferenceRenders.rates {
            let references = try JSONValue(parsing: Corpus.text(Corpus.directory + "/render/references/\(set)-\(Int(rate)).json"))
            let renderer = try CueRenderer(parsing: document, sampleRate: rate)
            for (label, start) in ReferenceRenders.starts {
                for name in renderer.document.cueNames {
                    let samples = try renderer.render(name, at: start)
                    let last = samples.lastIndex { $0 != 0 } ?? -1
                    let cut = try #require(references["cutFrames"]?[name]?[label]?["chromium"]?.number)
                    let chromium = try #require(references["lastSoundFrames"]?[name]?[label]?["chromium"]?.number)
                    checked += 1
                    if Double(samples.count) != cut || Double(last) != chromium {
                        wrong.append("\(name) at \(Int(rate)) Hz from \(label) s: \(samples.count) long, last \(last); "
                            + "the cut is \(Int(cut)), Chromium's last \(Int(chromium))")
                    }
                }
            }
        }
        #expect(checked == count)
        #expect(wrong.isEmpty, "\(wrong.joined(separator: "; "))")
    }
}
