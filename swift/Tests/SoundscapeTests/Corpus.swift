#if canImport(Darwin)
import Darwin
#elseif canImport(Glibc)
import Glibc
#endif
import Soundscape

/// The shared corpus in conformance/cues, read with the C library rather
/// than Foundation, so nothing under swift/ imports Foundation, and its JSON
/// with this library's own reader.
enum Corpus {
    /// The repository's root, from this file's place in it.
    static let root: String = {
        var parts = String(#filePath).split(separator: "/", omittingEmptySubsequences: false)
        parts.removeLast(4)  // swift/Tests/SoundscapeTests/Corpus.swift
        return parts.joined(separator: "/")
    }()

    static let directory = root + "/conformance/cues"

    /// A file's text, read as UTF-8 bytes and decoded as Node decodes them.
    static func text(_ path: String) -> String {
        guard let file = fopen(path, "rb") else { fatalError("cannot open \(path)") }
        defer { fclose(file) }
        var bytes: [UInt8] = []
        var buffer = [UInt8](repeating: 0, count: 65536)
        while true {
            let n = fread(&buffer, 1, buffer.count, file)
            if n == 0 { break }
            bytes += buffer[0..<n]
        }
        return String(decoding: bytes, as: UTF8.self)
    }

    /// The names of the files in a directory.
    static func files(_ path: String) -> [String] {
        guard let dir = opendir(path) else { fatalError("cannot list \(path)") }
        defer { closedir(dir) }
        var names: [String] = []
        while let entry = readdir(dir) {
            let name = withUnsafeBytes(of: entry.pointee.d_name) { raw in
                String(decoding: raw.prefix { $0 != 0 }, as: UTF8.self)
            }
            if !name.hasPrefix(".") { names.append(name) }
        }
        return names.sorted()
    }

    /// The case names, sorted, as both suites list them.
    static let cases: [String] = files(directory + "/cases")
        .filter { $0.hasSuffix(".json") }
        .map { String($0.dropLast(".json".count)) }
        .sorted()

    static func caseText(_ name: String) -> String { text("\(directory)/cases/\(name).json") }

    /// What the engine answered for each case.
    static let expected: JSONValue = try! JSONValue(parsing: text(directory + "/expected.json"))

    /// The problems a case's recorded answer lists, or nil when it is accepted.
    static func expectedProblems(_ name: String) -> [CueProblem]? {
        let answer = expected[name]!
        if answer["ok"]?.bool == true { return nil }
        return answer["problems"]!.elements!.map {
            CueProblem(path: $0["path"]!.string!, message: $0["message"]!.string!)
        }
    }

    static let notJSON = "is not valid JSON"

    /// Whether `problems` is the recorded answer, by the corpus's rules: a text
    /// that is not JSON matches on the path "" and the prefix alone.
    static func matches(_ result: Result<CueDocument, CueDocumentError>, _ expected: [CueProblem]?) -> Bool {
        let problems: [CueProblem]
        switch result {
        case .success: problems = []
        case .failure(let error): problems = error.problems
        }
        guard let expected else { return problems.isEmpty }
        if expected.first?.message == notJSON {
            return problems.count == 1 && problems[0].path == "" && problems[0].message.hasPrefix(notJSON)
        }
        return problems == expected
    }
}
