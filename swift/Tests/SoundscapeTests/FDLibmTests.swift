@testable import Soundscape
import Testing

/// The port of fdlibm gives Chromium's answers, bit for bit:
/// conformance/cues/render/fdlibm.txt holds what Chromium's own ieee754.cc
/// returns, built as Chromium builds it, among them the cutoff angles of the
/// reference filters. (Node's Math is no reference here: V8 takes its sine and
/// cosine from glibc, which differs from fdlibm in the last bit on 3 of these.)
@Suite struct FDLibmTests {
    @Test func givesChromiumsAnswersBitForBit() throws {
        let text = Corpus.text(Corpus.directory + "/render/fdlibm.txt")
        var checked = 0
        var wrong: [String] = []
        for line in text.split(separator: "\n") where !line.hasPrefix("#") {
            let fields = line.split(separator: " ")
            let x = Double(bitPattern: UInt64(fields[1], radix: 16)!)
            let want = UInt64(fields[2], radix: 16)!
            let got: Double = switch fields[0] {
            case "sin": FDLibm.sin(x)
            case "cos": FDLibm.cos(x)
            case "log": FDLibm.log(x)
            default: FDLibm.exp(x)
            }
            checked += 1
            if got.bitPattern != want { wrong.append("\(fields[0])(\(x)) = \(got), Chromium \(Double(bitPattern: want))") }
        }
        #expect(checked > 1800)
        #expect(wrong.isEmpty, "\(wrong.count) of \(checked) differ, first \(wrong.first ?? "")")
    }
}
