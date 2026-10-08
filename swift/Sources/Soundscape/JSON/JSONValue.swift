/// A JSON value exactly as JavaScript's `JSON.parse` gives it, so the cue
/// validator can make the same decisions the engine's does.
///
/// - An object's keys come back in JavaScript's property order: names that are
///   array indices (`"0"` to `"4294967294"`, written without a leading zero)
///   first, in numeric order, then every other name in the order it first
///   appears. A repeated key keeps its first place and its last value.
/// - A number is the double JavaScript reads, and one too large for a double
///   is infinite, as in JavaScript.
///
/// One exception, because a Swift `String` cannot hold it: a lone surrogate
/// escaped in a string (`"\ud800"`) reads as U+FFFD in the string's text. The
/// value keeps its original UTF-16 code units beside it, and keys, ids and
/// names are told apart by those, as JavaScript tells them apart: two
/// different lone surrogates are two keys, not a repeat. Only the text of a
/// path that held one differs from JavaScript's.
///
/// The value is stored flat, with no recursion in reading it or releasing it,
/// so nesting as deep as `JSON.parse` accepts cannot overflow the stack.
public struct JSONValue: @unchecked Sendable {
    let tree: JSONTree
    let index: Int

    /// Reads `text` as `JSON.parse` would, refusing everything it refuses.
    public init(parsing text: String) throws {
        self = try JSONReader.read(text).value
    }

    init(tree: JSONTree, index: Int) {
        self.tree = tree
        self.index = index
    }

    private var node: JSONTree.Node { tree.nodes[index] }

    public var isNull: Bool {
        if case .null = node { return true }
        return false
    }

    public var bool: Bool? {
        if case .bool(let b) = node { return b }
        return nil
    }

    public var number: Double? {
        if case .number(let n) = node { return n }
        return nil
    }

    public var string: String? {
        if case .string(let s, _) = node { return s }
        return nil
    }

    /// A string's UTF-16 code units as JavaScript holds them, lone surrogates
    /// included: what two strings are compared by.
    var codeUnits: [UInt16]? {
        if case .string(let s, let units) = node { return units ?? Array(s.utf16) }
        return nil
    }

    public var isArray: Bool { elements != nil }

    /// The elements of an array, or nil for any other value.
    public var elements: [JSONValue]? {
        if case .array(let children) = node { return children.map { JSONValue(tree: tree, index: $0) } }
        return nil
    }

    public var isObject: Bool {
        if case .object = node { return true }
        return false
    }

    /// The members of an object in JavaScript's property order, or nil for any other value.
    public var members: [(key: String, value: JSONValue)]? {
        if case .object(let members) = node {
            return members.map { ($0.key, JSONValue(tree: tree, index: $0.value)) }
        }
        return nil
    }

    /// The object's own member named `key`, as `Object.prototype.hasOwnProperty`
    /// would find it: nothing is inherited, so `"toString"` is never found
    /// unless the object has it.
    public subscript(key: String) -> JSONValue? {
        guard case .object(let members) = node, let member = members.first(where: { $0.key == key }) else {
            return nil
        }
        return JSONValue(tree: tree, index: member.value)
    }

    /// The object's own member whose name has exactly these code units.
    func member(codeUnits: [UInt16]) -> JSONValue? {
        guard case .object(let members) = node,
            let member = members.first(where: { ($0.keyUnits ?? Array($0.key.utf16)) == codeUnits })
        else { return nil }
        return JSONValue(tree: tree, index: member.value)
    }

    /// The members with each name's code units, for writing them back out.
    var membersWithCodeUnits: [(key: String, codeUnits: [UInt16], value: JSONValue)]? {
        if case .object(let members) = node {
            return members.map { ($0.key, $0.keyUnits ?? Array($0.key.utf16), JSONValue(tree: tree, index: $0.value)) }
        }
        return nil
    }
}

/// Every value of one parse, flat: containers hold the indices of their children.
final class JSONTree {
    enum Node {
        case null
        case bool(Bool)
        case number(Double)
        /// The text, and its code units only when the text could not hold them.
        case string(String, units: [UInt16]?)
        case array([Int])
        case object([Member])
    }

    struct Member {
        let key: String
        /// The name's code units, only when `key` could not hold them.
        let keyUnits: [UInt16]?
        let value: Int
    }

    var nodes: [Node] = []
}
