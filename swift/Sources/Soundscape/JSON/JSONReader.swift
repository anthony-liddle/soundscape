/// Why a text is not JSON, in this reader's words. JavaScript engines word
/// their own `JSON.parse` errors differently, so only the fact of the error is
/// held to theirs, never the message.
public struct JSONSyntaxError: Error, Equatable, CustomStringConvertible {
    public let message: String
    /// The UTF-16 offset where reading stopped, as JavaScript counts positions.
    public let position: Int

    public var description: String { "\(message) at position \(position)" }
}

/// A parse, and the paths of the keys that repeated within their object, in
/// the order the repeats appear in the text. A repeat's path is the path to the
/// key, written as `parseCueDocument` writes it: `cues.tick` or `[0].a`.
struct JSONReading {
    let value: JSONValue
    let repeatedKeys: [String]
}

/// JSON read by `JSON.parse`'s rules: RFC 8259 and nothing more. No trailing
/// commas, comments, single quotes, leading zeros, `NaN`, `Infinity` or byte
/// order mark; whitespace is space, tab, line feed and carriage return; any
/// value may stand at the top. Iterative, with an explicit stack, so no depth
/// of nesting can overflow the call stack.
///
/// Time and memory are linear in the text, plus the length of the repeated
/// keys' paths it reports: every repeat of one name in one object shares a
/// path, but a text that repeats many different names deep in a nest gets one
/// long path for each, where JavaScript's strings would share their prefix.
enum JSONReader {
    static func read(_ text: String) throws -> JSONReading {
        var parser = Parser(Array(text.utf16))
        return try parser.read()
    }
}

private struct Parser {
    let units: [UInt16]
    var i = 0
    let tree = JSONTree()
    var repeatedKeys: [String] = []

    /// Where each open container sits, as a chain back to the top: the path is
    /// only written out when a repeated key needs it, so deep nesting costs
    /// nothing in paths.
    struct Segment {
        enum Label {
            case top
            case key(String)
            case index(Int)
        }

        let parent: Int
        let label: Label
    }

    var segments: [Segment] = [Segment(parent: -1, label: .top)]

    /// An open array. A class, so its children grow in place: an enum payload
    /// rebound and stored back would copy them all on every element.
    final class ArrayFrame {
        let node: Int
        let segment: Int
        var children: [Int] = []

        init(node: Int, segment: Int) {
            self.node = node
            self.segment = segment
        }
    }

    /// An open object, the member whose value is being read, and what is
    /// needed to find a repeated key: each name's place, by its UTF-16 code
    /// units, and the object's path, written out once, the first time a key
    /// repeats. Every repeat of one name shares one path string.
    final class ObjectFrame {
        let node: Int
        let segment: Int
        var members: [JSONTree.Member] = []
        var places: [[UInt16]: Int] = [:]
        var key: [UInt16] = []
        var keyText = ""
        var path: String?
        var repeatPaths: [[UInt16]: String] = [:]

        init(node: Int, segment: Int) {
            self.node = node
            self.segment = segment
        }
    }

    enum Frame {
        case array(ArrayFrame)
        case object(ObjectFrame)
    }

    var stack: [Frame] = []

    init(_ units: [UInt16]) {
        self.units = units
    }

    mutating func read() throws -> JSONReading {
        var produced = try value()
        // Attach each finished value to the container it belongs to, closing
        // containers as their ends arrive, until the top value is done.
        while let top = stack.last {
            switch top {
            case .array(let frame):
                frame.children.append(produced)
                skipWhitespace()
                if peek(0x2C) {  // ,
                    i += 1
                    produced = try value()
                } else if peek(0x5D) {  // ]
                    i += 1
                    stack.removeLast()
                    tree.nodes[frame.node] = .array(frame.children)
                    produced = frame.node
                } else {
                    throw unexpected()
                }
            case .object(let frame):
                if let place = frame.places[frame.key] {
                    // JSON.parse keeps the first place and the last value
                    let kept = frame.members[place]
                    frame.members[place] = JSONTree.Member(key: kept.key, keyUnits: kept.keyUnits, value: produced)
                } else {
                    frame.places[frame.key] = frame.members.count
                    frame.members.append(JSONTree.Member(key: frame.keyText, keyUnits: lossy(frame.key), value: produced))
                }
                skipWhitespace()
                if peek(0x2C) {  // ,
                    i += 1
                    (frame.key, frame.keyText) = try memberName()
                    // A repeat is reported where its name stands in the text,
                    // before anything repeated inside its value
                    if frame.places[frame.key] != nil { repeatedKeys.append(repeatPath(frame)) }
                    produced = try value()
                } else if peek(0x7D) {  // }
                    i += 1
                    stack.removeLast()
                    tree.nodes[frame.node] = .object(inPropertyOrder(frame.members))
                    produced = frame.node
                } else {
                    throw unexpected()
                }
            }
        }
        skipWhitespace()
        if i < units.count { throw error("Unexpected non-whitespace character after JSON") }
        return JSONReading(value: JSONValue(tree: tree, index: produced), repeatedKeys: repeatedKeys)
    }

    /// The path of the key being read in `frame`, which has just repeated.
    func repeatPath(_ frame: ObjectFrame) -> String {
        if let known = frame.repeatPaths[frame.key] { return known }
        let base = frame.path ?? path(frame.segment)
        frame.path = base
        let written = join(base, frame.keyText)
        frame.repeatPaths[frame.key] = written
        return written
    }

    /// Reads the next complete value: a scalar or an empty container. Each
    /// non-empty container met on the way is opened and left on the stack, and
    /// reading carries on into its first member, in a loop rather than a call,
    /// so no depth of nesting grows the call stack.
    mutating func value() throws -> Int {
        while true {
            skipWhitespace()
            guard i < units.count else { throw error("Unexpected end of JSON input") }
            switch units[i] {
            case 0x7B:  // {
                i += 1
                let node = add(.object([]))
                let segment = childSegment()
                skipWhitespace()
                if peek(0x7D) {
                    i += 1
                    return node
                }
                let frame = ObjectFrame(node: node, segment: segment)
                (frame.key, frame.keyText) = try memberName()
                stack.append(.object(frame))
            case 0x5B:  // [
                i += 1
                let node = add(.array([]))
                let segment = childSegment()
                skipWhitespace()
                if peek(0x5D) {
                    i += 1
                    return node
                }
                stack.append(.array(ArrayFrame(node: node, segment: segment)))
            case 0x22:  // "
                let units = try string()
                return add(.string(String(decoding: units, as: UTF16.self), units: lossy(units)))
            case 0x74: return add(try literal("true", .bool(true)))
            case 0x66: return add(try literal("false", .bool(false)))
            case 0x6E: return add(try literal("null", .null))
            case 0x2D, 0x30...0x39: return add(.number(try number()))
            default: throw unexpected()
            }
        }
    }

    /// A member's name, then its colon.
    mutating func memberName() throws -> ([UInt16], String) {
        skipWhitespace()
        guard peek(0x22) else {
            throw i < units.count ? error("Expected double-quoted property name") : error("Unexpected end of JSON input")
        }
        let key = try string()
        skipWhitespace()
        guard peek(0x3A) else {  // :
            throw i < units.count ? error("Expected ':' after property name") : error("Unexpected end of JSON input")
        }
        i += 1
        return (key, String(decoding: key, as: UTF16.self))
    }

    /// The UTF-16 code units of a string, escapes resolved. A lone surrogate
    /// stays a lone code unit here, so keys compare as JavaScript compares them.
    mutating func string() throws -> [UInt16] {
        i += 1  // the opening quote
        var out: [UInt16] = []
        while i < units.count {
            let c = units[i]
            if c == 0x22 {
                i += 1
                return out
            }
            if c < 0x20 { throw error("Bad control character in string literal") }
            if c != 0x5C {
                out.append(c)
                i += 1
                continue
            }
            i += 1
            guard i < units.count else { break }
            switch units[i] {
            case 0x22: out.append(0x22)
            case 0x5C: out.append(0x5C)
            case 0x2F: out.append(0x2F)
            case 0x62: out.append(0x08)  // b
            case 0x66: out.append(0x0C)  // f
            case 0x6E: out.append(0x0A)  // n
            case 0x72: out.append(0x0D)  // r
            case 0x74: out.append(0x09)  // t
            case 0x75:  // u
                guard i + 4 < units.count else { throw error("Bad Unicode escape") }
                var code: UInt16 = 0
                for k in 1...4 {
                    guard let digit = hexValue(units[i + k]) else { throw error("Bad Unicode escape") }
                    code = code << 4 | digit
                }
                out.append(code)
                i += 4
            default:
                throw error("Bad escaped character")
            }
            i += 1
        }
        throw error("Unterminated string in JSON")
    }

    /// A number by JSON's grammar, read to the double JavaScript reads: the
    /// nearest, and infinite past the largest.
    mutating func number() throws -> Double {
        let start = i
        if peek(0x2D) { i += 1 }
        if peek(0x30) {
            i += 1
        } else if i < units.count, (0x31...0x39).contains(units[i]) {
            digits()
        } else {
            throw i < units.count ? error("No number after minus sign") : error("Unexpected end of JSON input")
        }
        if peek(0x2E) {  // .
            i += 1
            guard i < units.count, isDigit(units[i]) else {
                throw i < units.count ? error("Unterminated fractional number") : error("Unexpected end of JSON input")
            }
            digits()
        }
        if peek(0x65) || peek(0x45) {  // e E
            i += 1
            if peek(0x2B) || peek(0x2D) { i += 1 }
            guard i < units.count, isDigit(units[i]) else {
                throw i < units.count ? error("Exponent part is missing a number") : error("Unexpected end of JSON input")
            }
            digits()
        }
        let token = String(decoding: units[start..<i], as: UTF16.self)
        // Every token here is in the grammar, which Double reads correctly rounded
        guard let n = Double(token) else { throw JSONSyntaxError(message: "Unreadable number", position: start) }
        return n
    }

    mutating func literal(_ word: String, _ node: JSONTree.Node) throws -> JSONTree.Node {
        for unit in word.utf16 {
            guard i < units.count else { throw error("Unexpected end of JSON input") }
            guard units[i] == unit else { throw unexpected() }
            i += 1
        }
        return node
    }

    mutating func digits() {
        while i < units.count, isDigit(units[i]) { i += 1 }
    }

    mutating func skipWhitespace() {
        while i < units.count, units[i] == 0x20 || units[i] == 0x09 || units[i] == 0x0A || units[i] == 0x0D { i += 1 }
    }

    func peek(_ unit: UInt16) -> Bool { i < units.count && units[i] == unit }

    func isDigit(_ unit: UInt16) -> Bool { (0x30...0x39).contains(unit) }

    func hexValue(_ unit: UInt16) -> UInt16? {
        switch unit {
        case 0x30...0x39: unit - 0x30
        case 0x41...0x46: unit - 0x41 + 10
        case 0x61...0x66: unit - 0x61 + 10
        default: nil
        }
    }

    func add(_ node: JSONTree.Node) -> Int {
        tree.nodes.append(node)
        return tree.nodes.count - 1
    }

    /// The segment for a container just opened, inside whatever is on top of the stack.
    mutating func childSegment() -> Int {
        let label: Segment.Label
        let parent: Int
        switch stack.last {
        case nil:
            parent = 0
            label = .top
        case .array(let frame):
            parent = frame.segment
            label = .index(frame.children.count)
        case .object(let frame):
            parent = frame.segment
            label = .key(frame.keyText)
        }
        if case .top = label { return 0 }
        segments.append(Segment(parent: parent, label: label))
        return segments.count - 1
    }

    /// The path of a segment, as `parseCueDocument` writes paths.
    func path(_ segment: Int) -> String {
        var labels: [Segment.Label] = []
        var s = segment
        while s > 0 {
            labels.append(segments[s].label)
            s = segments[s].parent
        }
        var out = ""
        for label in labels.reversed() {
            switch label {
            case .top: break
            case .key(let key): out = join(out, key)
            case .index(let n): out += "[\(n)]"
            }
        }
        return out
    }

    func join(_ base: String, _ key: String) -> String { base.isEmpty ? key : "\(base).\(key)" }

    func unexpected() -> JSONSyntaxError {
        guard i < units.count else { return error("Unexpected end of JSON input") }
        return error("Unexpected token '\(String(decoding: [units[i]], as: UTF16.self))'")
    }

    func error(_ message: String) -> JSONSyntaxError { JSONSyntaxError(message: message, position: i) }
}

/// The code units, kept only when they hold a lone surrogate and so cannot
/// survive the trip into a Swift `String`.
func lossy(_ units: [UInt16]) -> [UInt16]? {
    var k = 0
    while k < units.count {
        let u = units[k]
        if (0xD800...0xDBFF).contains(u), k + 1 < units.count, (0xDC00...0xDFFF).contains(units[k + 1]) {
            k += 2
        } else if (0xD800...0xDFFF).contains(u) {
            return units
        } else {
            k += 1
        }
    }
    return nil
}

/// JavaScript's own-property order: array-index names first, ascending, then
/// the rest as they first appeared.
private func inPropertyOrder(_ members: [JSONTree.Member]) -> [JSONTree.Member] {
    var indexed: [(UInt32, JSONTree.Member)] = []
    var named: [JSONTree.Member] = []
    for member in members {
        if let n = arrayIndex(member.key) { indexed.append((n, member)) } else { named.append(member) }
    }
    guard !indexed.isEmpty else { return members }
    return indexed.sorted { $0.0 < $1.0 }.map(\.1) + named
}

/// The name as an array index, `"0"` to `"4294967294"` with no leading zero, or nil.
func arrayIndex(_ key: String) -> UInt32? {
    let utf8 = key.utf8
    guard let first = utf8.first, utf8.count <= 10, utf8.allSatisfy({ (0x30...0x39).contains($0) }) else { return nil }
    if first == 0x30 && utf8.count > 1 { return nil }
    guard let n = UInt64(key), n <= 4_294_967_294 else { return nil }
    return UInt32(n)
}
