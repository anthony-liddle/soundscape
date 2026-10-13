@testable import Soundscape
import Testing

/// The LFO and unison's parts, each against what Chromium's code does, where
/// the references alone would not say which part was wrong.
@Suite struct ModulationTests {
    static let sawtooth = BandLimitedTables(.sawtooth, sampleRate: 48000)
    static let instruments = try! CueDocument(parsing: Corpus.text(Corpus.directory + "/render/modulation.cues.json")).instruments

    /// Each of DoInterpolation's reads passes through the table's own values,
    /// and the Lagrange reads, which an LFO's slow sine takes, through a line.
    @Test(arguments: [Float(1), 0.2, 0.01])
    func everyReadPassesThroughTheTable(_ increment: Float) {
        let line = (0..<64).map { Float($0) }
        for j in [2, 17, 40] {
            #expect(interpolate(Double(j), increment: increment, higher: line, lower: line, blend: 0, mask: 63) == Float(j))
        }
        let between = interpolate(17.25, increment: increment, higher: line, lower: line, blend: 0.5, mask: 63)
        #expect(abs(between - 17.25) < 1e-6)
    }

    /// With the same detune at every frame, the a-rate path plays what the
    /// k-rate one does: both read the tables at a float index. Here they agree
    /// to the bit; the bound allows the two increments' roundings to differ.
    @Test func aConstantInputPlaysAsAFixedDetune() {
        var oscillator = BandLimitedOscillator(Self.sawtooth, frequency: 220, detune: 30, startOffset: 0)
        let fixed = (0..<4800).map { _ in oscillator.next() }
        let modulated = ModulatedOscillator(Self.sawtooth, frequency: 220, detune: 25)
            .render(from: 0, startOffset: 0, to: 4800) { _ in 5 }
        #expect(modulated.count == fixed.count)
        let gap = zip(modulated, fixed).map { abs($0 - $1) }.max()!
        #expect(gap < 1e-6)
    }

    /// The frequency the a-rate path scales a start's fraction by is 0, so a
    /// start between frames plays as one on a frame: Chromium drops the
    /// fraction, where WebKit keeps it.
    @Test func dropsTheStartsFraction() {
        let oscillator = ModulatedOscillator(Self.sawtooth, frequency: 220, detune: 0)
        let onFrame = oscillator.render(from: 100, startOffset: 0, to: 2000) { _ in 0 }
        let between = oscillator.render(from: 100, startOffset: -0.4, to: 2000) { _ in 0 }
        #expect(onFrame == between)
    }

    /// In the quantum it starts in, the a-rate path reads its increments from
    /// the quantum's first frame: a start at frame 64 plays frames 0 to 63's
    /// detune for its first 64 frames.
    @Test func readsTheStartQuantumsIncrementsFromItsFirstFrame() {
        let oscillator = ModulatedOscillator(Self.sawtooth, frequency: 220, detune: 0)
        let stepped = oscillator.render(from: 64, startOffset: 0, to: 256) { $0 < 64 ? 1200 : 0 }
        let octaveUp = oscillator.render(from: 64, startOffset: 0, to: 128) { _ in 1200 }
        #expect(Array(stepped[0..<64]) == octaveUp)
    }

    /// An LFO deeper than the cutoff swings a lowpass's frequency below 0,
    /// where the param clamps it, and a lowpass at 0 lets nothing through.
    @Test func closesALowpassAtTheBottomOfItsSwing() {
        let filter = VoiceFilter(Self.instruments["lfo-filter-fast"]!, sampleRate: 48000)
        let tone = [Float](repeating: 0.5, count: 1280)
        let closed = filter.render(tone, from: 0, oscillators: 0..<1280) { _ in -10_000 }
        #expect(closed.samples.allSatisfy { $0 == 0 })
    }

    /// An LFO that adds nothing leaves every quantum's frequencies the same,
    /// so the filter runs on fixed coefficients and plays as one without it.
    @Test func aSilentLFOLeavesTheFilterAsItWas() {
        let filter = VoiceFilter(Self.instruments["lfo-filter-fast"]!, sampleRate: 48000)
        var oscillator = BandLimitedOscillator(Self.sawtooth, frequency: 220, startOffset: 0)
        let tone = (0..<4800).map { _ in oscillator.next() * 0.3 }
        let without = filter.render(tone, from: 0, oscillators: 0..<4800)
        let silent = filter.render(tone, from: 0, oscillators: 0..<4800) { _ in 0 }
        #expect(silent.samples == without.samples)
        #expect(silent.end == without.end)
    }

    /// The LFO starts at the bottom of its sine's rise, 0, and swings to its
    /// depth: 4000 Hz on the filter at full depth, 100 cents on pitch.
    @Test(arguments: [("lfo-filter-fast", Float(4000)), ("lfo-pitch-fast", 100)])
    func swingsToItsDepth(_ name: String, _ depth: Float) {
        let lfo = LFO(Self.instruments[name]!, tables: BandLimitedTables(.sine, sampleRate: 48000), from: 0, startOffset: 0, to: 4800)
        #expect(lfo.at(0) == 0)
        #expect(lfo.at(-1) == 0)
        #expect(lfo.at(4800) == 0)
        let peak = lfo.values.map(abs).max()!
        #expect(abs(peak - depth) < depth * 1e-4)
    }
}
