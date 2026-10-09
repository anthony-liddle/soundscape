#if canImport(AVFoundation)
@testable import SoundscapePlayer
import Testing

/// How many voices Peach of a Word needs: the most cues that sound at once
/// when someone plays as fast as they can.
///
/// Peach's rules, from `src/ui/useGame.ts`: every letter typed or tile tapped
/// plays `tick`; Enter plays exactly one cue, `invalid` for anything that is
/// not a new word (an empty stick included), else `edition` for the word that
/// completes the set, `source` for the source word, or `found-<length>-<rung>`.
/// A held key repeats, and Peach does not filter repeats.
///
/// A voice is busy from the press through the end of its cue's render.
@MainActor
@Suite struct PoolSizeTests {
    typealias Cue = (start: Double, length: Double)

    static let lengths: [String: Double] = Peach.renders(at: 48000).mapValues { Double($0.count) / 48000 }

    /// How long a cue holds a voice.
    static func held(_ name: String) -> Double { lengths[name]! }

    /// The longest found cue for a word of `letters` letters, of any rung.
    static func found(_ letters: Int) -> Double {
        lengths.keys.filter { $0.hasPrefix("found-\(min(max(letters, 3), 8))-") }.map(held).max()!
    }

    /// The most cues sounding at any one time.
    static func peak(_ cues: [Cue]) -> Int {
        cues.map { cue in cues.filter { $0.start <= cue.start && cue.start < $0.start + $0.length }.count }.max() ?? 0
    }

    /// Words of `letters` letters, each followed by Enter, at `rate` presses a
    /// second; the source word and the set's last word fall wherever they
    /// make the most cues sound at once.
    static func words(letters: Int, rate: Double, count: Int = 12) -> Int {
        var worst = 0
        for source in 0..<count {
            for edition in 0..<count where edition != source {
                var cues: [Cue] = []
                var press = 0
                for word in 0..<count {
                    for _ in 0..<letters {
                        cues.append((Double(press) / rate, held("tick")))
                        press += 1
                    }
                    let enter = word == edition ? held("edition") : word == source ? held("source") : found(letters)
                    cues.append((Double(press) / rate, enter))
                    press += 1
                }
                worst = max(worst, peak(cues))
            }
        }
        return worst
    }

    /// Enter pressed over and over, each press `invalid`.
    static func enters(rate: Double) -> Int {
        peak((0..<100).map { (Double($0) / rate, held("invalid")) })
    }

    /// A letter held down: a tick on every repeat.
    static func heldLetter(rate: Double) -> Int {
        peak((0..<100).map { (Double($0) / rate, held("tick")) })
    }

    /// Fast typists sustain about 12 presses a second (150 words a minute)
    /// and reach 15 to 20 in bursts. Key repeat on a Mac, at its fastest
    /// setting, is every 30 ms: 33 a second.
    static let typing: [Double] = [10, 15, 20]
    static let keyRepeat = 1000.0 / 30

    @Test func coversTheFastestTyping() {
        var report = ["cue lengths: " + ["tick", "invalid", "found-3-set", "source", "edition"]
            .map { "\($0) \(Int((Self.lengths[$0]! * 1000).rounded())) ms" }.joined(separator: ", ")]
        var needed = 0
        for rate in Self.typing {
            let byLength = (3...8).map { Self.words(letters: $0, rate: rate) }
            let spam = Self.enters(rate: rate)
            needed = max(needed, byLength.max()!, spam)
            report.append("\(Int(rate)) presses/s: words of 3...8 letters \(byLength), Enter alone \(spam)")
        }
        let repeatEnter = Self.enters(rate: Self.keyRepeat)
        let repeatLetter = Self.heldLetter(rate: Self.keyRepeat)
        report.append("key repeat at 33/s: Enter held \(repeatEnter), a letter held \(repeatLetter)")
        print(report.joined(separator: "\n"))

        #expect(CuePlayer.defaultVoices >= needed, "typing as fast as anyone can needs \(needed) voices")
        #expect(CuePlayer.defaultVoices >= needed + 2, "room to spare")
        // Holding Enter down is the one way to need more; then the cue that
        // ends soonest is cut, an invalid buzz among invalid buzzes
        #expect(repeatEnter > CuePlayer.defaultVoices)
    }

    /// Nine cues at once on eight voices: the one that ends soonest is cut,
    /// and the rest, the newcomer included, play whole.
    @Test func aFullPoolCutsTheCueThatEndsSoonest() async throws {
        let (player, _) = try await manualPlayer()
        let renders = Peach.renders(at: 48000)
        #expect(CuePlayer.defaultVoices == 8)
        // invalid ends first, though it starts later than edition
        let cues = [("edition", 4800), ("invalid", 5280)] + (2..<8).map { ("source", 4800 + 480 * $0) }
        var expected = [Float](repeating: 0, count: 96000)
        for (name, frame) in cues {
            try player.play(name, at: Double(frame) / 48000)
            if name != "invalid" { lay(renders[name]!, into: &expected, at: frame) }
        }
        try player.play("found-8-rare", at: 9600 / 48000)
        lay(renders["found-8-rare"]!, into: &expected, at: 9600)
        let out = try player.renderOffline(expected.count)[0]
        // Eight cues summed by the mixer, in its own order: equal to a float's rounding
        #expect(firstDifference(out, expected, tolerance: 1e-6) == nil)
    }

    /// The same while cues ring: the cut comes when the cue is asked for,
    /// and the newcomer starts on its frame.
    @Test func aCutComesWhenTheNewCueIsAskedFor() async throws {
        let (player, _) = try await manualPlayer()
        let renders = Peach.renders(at: 48000)
        let cues = [("edition", 4800), ("invalid", 5280)] + (2..<8).map { ("source", 4800 + 480 * $0) }
        var expected = [Float](repeating: 0, count: 96000)
        for (name, frame) in cues {
            try player.play(name, at: Double(frame) / 48000)
            if name != "invalid" { lay(renders[name]!, into: &expected, at: frame) }
        }
        let head = try player.renderOffline(9600)[0]
        // invalid has rung since 5280; the cut lands where the render stopped
        lay(Array(renders["invalid"]![..<(9600 - 5280)]), into: &expected, at: 5280)
        try player.play("found-8-rare")
        lay(renders["found-8-rare"]!, into: &expected, at: 9600)
        let out = head + (try player.renderOffline(expected.count - 9600)[0])
        #expect(firstDifference(out, expected, tolerance: 1e-6) == nil)
    }
}
#endif
