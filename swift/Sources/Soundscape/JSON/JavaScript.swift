/// Two things the engine's messages write with JavaScript, written here the
/// way JavaScript writes them, so the messages match character for character.
enum JavaScript {
    /// `String(x)`, ECMAScript's Number::toString: the shortest digits that
    /// read back as `x`, then plain notation from 1e-6 to below 1e21 and
    /// exponent notation outside it.
    static func string(_ x: Double) -> String {
        if x.isNaN { return "NaN" }
        if x == 0 { return "0" }  // -0 too
        if x.isInfinite { return x < 0 ? "-Infinity" : "Infinity" }
        // Swift's description already has the shortest round-trip digits; only
        // the layout differs (1.8e-05 where JavaScript writes 0.000018)
        let text = x.magnitude.description
        var mantissa = Substring(text)
        var exponent = 0
        if let e = text.firstIndex(where: { $0 == "e" || $0 == "E" }) {
            mantissa = text[..<e]
            exponent = Int(text[text.index(after: e)...])!
        }
        let parts = mantissa.split(separator: ".", omittingEmptySubsequences: false)
        var digits = String(parts[0]) + (parts.count > 1 ? String(parts[1]) : "")
        // x = 0.digits x 10^n
        var n = parts[0].count + exponent
        while digits.first == "0" {
            digits.removeFirst()
            n -= 1
        }
        while digits.last == "0" { digits.removeLast() }
        let k = digits.count
        let sign = x < 0 ? "-" : ""
        if k <= n && n <= 21 { return sign + digits + String(repeating: "0", count: n - k) }
        if 0 < n && n <= 21 { return sign + digits.prefix(n) + "." + digits.dropFirst(n) }
        if -6 < n && n <= 0 { return sign + "0." + String(repeating: "0", count: -n) + digits }
        let e = n - 1
        let head = k == 1 ? digits : digits.prefix(1) + "." + digits.dropFirst()
        return sign + head + "e" + (e < 0 ? "-" : "+") + String(e.magnitude)
    }

    /// `JSON.stringify(value)` for a value `JSON.parse` produced: no spaces,
    /// members in property order, a number that is not finite as `null`, and
    /// strings escaped as JSON.stringify escapes them, lone surrogates written
    /// back as `\ud800`. Iterative, so a deep value cannot overflow the stack,
    /// where V8 throws a RangeError past about 6,000 levels.
    static func stringify(_ value: JSONValue) -> String {
        enum Work {
            case value(JSONValue)
            case text(String)
        }
        var out = ""
        var work: [Work] = [.value(value)]
        while let next = work.popLast() {
            switch next {
            case .text(let t):
                out += t
            case .value(let v):
                if v.isNull {
                    out += "null"
                } else if let b = v.bool {
                    out += b ? "true" : "false"
                } else if let n = v.number {
                    out += n.isFinite ? string(n) : "null"
                } else if let units = v.codeUnits {
                    out += quote(units)
                } else if let elements = v.elements {
                    var parts: [Work] = [.text("[")]
                    for (k, e) in elements.enumerated() {
                        if k > 0 { parts.append(.text(",")) }
                        parts.append(.value(e))
                    }
                    parts.append(.text("]"))
                    work.append(contentsOf: parts.reversed())
                } else if let members = v.membersWithCodeUnits {
                    var parts: [Work] = [.text("{")]
                    for (k, m) in members.enumerated() {
                        parts.append(.text((k > 0 ? "," : "") + quote(m.codeUnits) + ":"))
                        parts.append(.value(m.value))
                    }
                    parts.append(.text("}"))
                    work.append(contentsOf: parts.reversed())
                }
            }
        }
        return out
    }

    /// A string as JSON.stringify quotes it.
    static func quote(_ units: [UInt16]) -> String {
        var out: [UInt16] = [0x22]
        var k = 0
        func escape(_ u: UInt16) {
            let hex = String(u, radix: 16)
            out += Array(("\\u" + String(repeating: "0", count: 4 - hex.count) + hex).utf16)
        }
        while k < units.count {
            let u = units[k]
            switch u {
            case 0x08: out += [0x5C, 0x62]
            case 0x09: out += [0x5C, 0x74]
            case 0x0A: out += [0x5C, 0x6E]
            case 0x0C: out += [0x5C, 0x66]
            case 0x0D: out += [0x5C, 0x72]
            case 0x22: out += [0x5C, 0x22]
            case 0x5C: out += [0x5C, 0x5C]
            case 0x00..<0x20: escape(u)
            case 0xD800...0xDBFF:
                if k + 1 < units.count, (0xDC00...0xDFFF).contains(units[k + 1]) {
                    out += [u, units[k + 1]]
                    k += 1
                } else {
                    escape(u)
                }
            case 0xDC00...0xDFFF: escape(u)
            default: out.append(u)
            }
            k += 1
        }
        out.append(0x22)
        return String(decoding: out, as: UTF16.self)
    }
}
