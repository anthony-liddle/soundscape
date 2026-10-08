@testable import Soundscape
import Testing

/// The reader against JavaScript's own `JSON.parse`. Every expectation here was
/// taken from Node 24, not reasoned out.
@Suite struct JSONReaderTests {
    static let refused: [String] = [
        "", "  ", #"{"a": 1,}"#, "[1,]", "{,}", "[,1]", "01", "-01", "+1", ".5", "1.", "1e", "1e+", "-", "--1",
        "NaN", "Infinity", "-Infinity", "undefined", "'a'", "{a: 1}", #"{"a" 1}"#, #"{"a": 1 "b": 2}"#, "[1 2]",
        #""a"#, #""\x""#, #""\u12""#, #""\u12G4""#, "\"\t\"", "\"\n\"", "\u{FEFF}{}", "{} {}", "{}x", "tru", "nul",
        "True", "[1]]", #"{"a":1}}"#, "// c\n{}", "/* c */{}", "0x10", "1_000", "\u{00A0}{}", "\u{2028}[]",
    ]

    static let accepted: [String] = [
        "null", "1", "-0", #""x""#, "true", " \t\n\r[] ", #"{"a":{"b":[1,{"c":null}]}}"#, #""\ud800""#,
        #""éé""#, #""\/""#, "\"\u{2028}\"", "1E5", "1e-5", "-0.0e+0",
    ]

    @Test(arguments: refused)
    func refusesWhatJSONParseRefuses(_ text: String) {
        #expect(throws: JSONSyntaxError.self) { try JSONValue(parsing: text) }
    }

    @Test(arguments: accepted)
    func acceptsWhatJSONParseAccepts(_ text: String) throws {
        _ = try JSONValue(parsing: text)
    }

    @Test func givesKeysBackInJavaScriptsOrder() throws {
        let text = #"{"b":0,"4294967295":1,"4294967294":2,"01":3,"10":4,"2":5,"-1":6,"0":7}"#
        let keys = try #require(JSONValue(parsing: text).members).map(\.key)
        #expect(keys == ["0", "2", "10", "4294967294", "b", "4294967295", "01", "-1"])
    }

    @Test func aRepeatedKeyKeepsItsFirstPlaceAndItsLastValue() throws {
        let value = try JSONValue(parsing: #"{"a":1,"b":2,"a":3}"#)
        #expect(value.members?.map(\.key) == ["a", "b"])
        #expect(value["a"]?.number == 3)
    }

    @Test func findsARepeatAfterUnescaping() throws {
        let reading = try JSONReader.read(#"{"a":1,"a":2}"#)
        #expect(reading.value.members?.map(\.key) == ["a"])
        #expect(reading.value["a"]?.number == 2)
        #expect(reading.repeatedKeys == ["a"])
    }

    @Test func namesEachRepeatByItsPathInTheOrderTheyAppear() throws {
        let text = #"{"cues":{"tick":{},"tick":{"notes":[]}},"x":[{"a":1,"a":2},[{"b":1,"b":2}]],"x":0}"#
        #expect(try JSONReader.read(text).repeatedKeys == ["cues.tick", "x[0].a", "x[1][0].b", "x"])
    }

    /// Found by the generator: a repeat is reported where its name stands,
    /// before anything repeated inside its value, as the engine's scan of the
    /// text reports it.
    @Test func reportsARepeatBeforeTheRepeatsInsideItsValue() throws {
        let text = #"{"a":{"b":1,"b":2},"a":{"b":1,"b":2}}"#
        #expect(try JSONReader.read(text).repeatedKeys == ["a.b", "a", "a.b"])
    }

    /// Each literal and the bits of the double `JSON.parse` reads it as.
    static let numbers: [(String, UInt64)] = [
        ("0", 0x0000_0000_0000_0000), ("-0", 0x8000_0000_0000_0000), ("1", 0x3FF0_0000_0000_0000),
        ("-1", 0xBFF0_0000_0000_0000), ("0.1", 0x3FB9_9999_9999_999A), ("0.30000000000000004", 0x3FD3_3333_3333_3334),
        ("1e400", 0x7FF0_0000_0000_0000), ("-1e400", 0xFFF0_0000_0000_0000), ("1e-400", 0x0000_0000_0000_0000),
        ("5e-324", 0x0000_0000_0000_0001), ("2.4703282292062328e-324", 0x0000_0000_0000_0001),
        ("2.4703282292062327e-324", 0x0000_0000_0000_0000), ("1.7976931348623157e308", 0x7FEF_FFFF_FFFF_FFFF),
        ("1.7976931348623158e308", 0x7FEF_FFFF_FFFF_FFFF), ("1.7976931348623159e308", 0x7FF0_0000_0000_0000),
        ("9007199254740993", 0x4340_0000_0000_0000), ("0.000018", 0x3EF2_DFD6_94CC_AB3F), ("1.8e-5", 0x3EF2_DFD6_94CC_AB3F),
        ("1E+2", 0x4059_0000_0000_0000), ("1e-7", 0x3E7A_D7F2_9ABC_AF48), ("123456789012345680000", 0x441A_C53A_7E04_BCDA),
        ("0.07418053232275866", 0x3FB2_FD7E_D053_7C8F), ("78.99998074500876", 0x4053_BFFF_AF3D_1C4F),
        ("106.8631178836571", 0x405A_B73D_52CA_B999), ("4.9406564584124654e-324", 0x0000_0000_0000_0001),
        ("2.2250738585072011e-308", 0x000F_FFFF_FFFF_FFFF), ("2.2250738585072014e-308", 0x0010_0000_0000_0000),
        ("1e99999999999999999999", 0x7FF0_0000_0000_0000), ("1e-99999999999999999999", 0x0000_0000_0000_0000),
    ]

    @Test(arguments: numbers)
    func readsEachNumberAsJavaScriptDoes(_ literal: String, _ bits: UInt64) throws {
        let n = try #require(JSONValue(parsing: literal).number)
        #expect(n.bitPattern == bits)
    }

    @Test func readsADigitStringTooLongForADoubleAsInfinity() throws {
        #expect(try JSONValue(parsing: String(repeating: "9", count: 5000)).number == .infinity)
    }

    /// The documented exception: a Swift String cannot hold a lone surrogate.
    @Test func readsALoneSurrogateAsTheReplacementCharacter() throws {
        #expect(try JSONValue(parsing: #""\ud800""#).string == "\u{FFFD}")
    }

    @Test func tellsKeysApartByTheirCodeUnitsAsJavaScriptDoes() throws {
        let two = try JSONReader.read(#"{"\ud800":1,"\udc00":2}"#)
        #expect(two.value.members?.count == 2)
        #expect(two.repeatedKeys.isEmpty)
        let one = try JSONReader.read(#"{"\ud800":1,"\ud800":2}"#)
        #expect(one.value.members?.count == 1)
        #expect(one.repeatedKeys == ["\u{FFFD}"])
    }

    @Test func nestsAsDeepAsJSONParseDoesWithoutOverflowing() throws {
        let depth = 1_000_000
        let arrays = try JSONValue(parsing: String(repeating: "[", count: depth) + String(repeating: "]", count: depth))
        #expect(arrays.isArray)
        let objects = String(repeating: #"{"a":"#, count: 100_000) + "1" + String(repeating: "}", count: 100_000)
        #expect(try JSONValue(parsing: objects).isObject)
    }
}

extension JSONReaderTests {
    @Test func keepsTheCodeUnitsOfAStringThatHeldALoneSurrogate() throws {
        let value = try JSONValue(parsing: #"["\ud800", "\udc00", "😀", "plain"]"#)
        let units = try #require(value.elements).map(\.codeUnits)
        #expect(units == [[0xD800], [0xDC00], [0xD83D, 0xDE00], Array("plain".utf16)])
    }

    @Test func readsALargeObjectInTimeLinearInItsSize() throws {
        // 40,000 members once took ten seconds, each one copying all before it
        let text = "{" + (0..<40_000).map { "\"k\($0)\":1" }.joined(separator: ",") + "}"
        let clock = ContinuousClock()
        let took = try clock.measure { _ = try JSONValue(parsing: text) }
        #expect(took < .seconds(2))
    }
}
