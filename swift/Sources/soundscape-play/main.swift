// Plays a cue file's cues through the Mac's speakers, to listen to what the
// player plays:
//
//     swift run soundscape-play conformance/cues/cases/peach-of-a-word.json
//     swift run soundscape-play <cue file> tick found-5-rare edition
//     swift run soundscape-play <cue file> --list
//
// With no names, every cue in the file plays, one after another, in the
// order the engine's getCueNames lists them; with names, those, in the order
// given. --gap sets the
// silence between cues, in seconds.
#if os(macOS)
import Foundation
import Soundscape
import SoundscapePlayer

func fail(_ message: String) -> Never {
    FileHandle.standardError.write(Data((message + "\n").utf8))
    exit(1)
}

var arguments = Array(CommandLine.arguments.dropFirst())
let usage = "usage: soundscape-play <cue file> [--list] [--gap <seconds>] [cue name ...]"
var gap = 0.4
if let at = arguments.firstIndex(of: "--gap") {
    guard at + 1 < arguments.count, let seconds = Double(arguments[at + 1]), seconds >= 0 else { fail(usage) }
    gap = seconds
    arguments.removeSubrange(at...(at + 1))
}
let list = arguments.contains("--list")
arguments.removeAll { $0 == "--list" }
guard let path = arguments.first else { fail(usage) }

let text: String
do {
    text = try String(contentsOfFile: path, encoding: .utf8)
} catch {
    fail("cannot read \(path): \(error.localizedDescription)")
}

let player = CuePlayer()
do {
    try await player.load(parsing: text)
} catch {
    fail("\(error)")
}
if list {
    print(player.cueNames.joined(separator: "\n"))
    exit(0)
}

let names = arguments.count > 1 ? Array(arguments.dropFirst()) : player.cueNames
if let unknown = names.first(where: { !player.cueNames.contains($0) }) {
    fail("\(CueRenderError.noCue(unknown))")
}
print("\(names.count) of \(player.cueNames.count) cues, at the output's \(Int(player.sampleRate)) Hz")
for name in names {
    do {
        try player.play(name)
    } catch {
        fail("\(error)")
    }
    let seconds = player.duration(of: name) ?? 0
    print(name, String(format: "%.2f s", seconds))
    try await Task.sleep(for: .seconds(seconds + gap))
}
player.stop()
#else
print("soundscape-play plays through AVFoundation, so on macOS alone.")
#endif
