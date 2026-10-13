/// SHA-256 (FIPS 180-4), small and plain, so the tests can hash renders on
/// every platform they run on without Foundation or CryptoKit.
enum SHA256 {
    private static let k: [UInt32] = [
        0x428a_2f98, 0x7137_4491, 0xb5c0_fbcf, 0xe9b5_dba5, 0x3956_c25b, 0x59f1_11f1, 0x923f_82a4, 0xab1c_5ed5,
        0xd807_aa98, 0x1283_5b01, 0x2431_85be, 0x550c_7dc3, 0x72be_5d74, 0x80de_b1fe, 0x9bdc_06a7, 0xc19b_f174,
        0xe49b_69c1, 0xefbe_4786, 0x0fc1_9dc6, 0x240c_a1cc, 0x2de9_2c6f, 0x4a74_84aa, 0x5cb0_a9dc, 0x76f9_88da,
        0x983e_5152, 0xa831_c66d, 0xb003_27c8, 0xbf59_7fc7, 0xc6e0_0bf3, 0xd5a7_9147, 0x06ca_6351, 0x1429_2967,
        0x27b7_0a85, 0x2e1b_2138, 0x4d2c_6dfc, 0x5338_0d13, 0x650a_7354, 0x766a_0abb, 0x81c2_c92e, 0x9272_2c85,
        0xa2bf_e8a1, 0xa81a_664b, 0xc24b_8b70, 0xc76c_51a3, 0xd192_e819, 0xd699_0624, 0xf40e_3585, 0x106a_a070,
        0x19a4_c116, 0x1e37_6c08, 0x2748_774c, 0x34b0_bcb5, 0x391c_0cb3, 0x4ed8_aa4a, 0x5b9c_ca4f, 0x682e_6ff3,
        0x748f_82ee, 0x78a5_636f, 0x84c8_7814, 0x8cc7_0208, 0x90be_fffa, 0xa450_6ceb, 0xbef9_a3f7, 0xc671_78f2,
    ]

    static func hex(_ bytes: [UInt8]) -> String {
        bytes.withUnsafeBytes { hex($0) }
    }

    /// A render's hash: its float32 samples' bytes, little-endian, as written to disk.
    static func hex(_ samples: [Float]) -> String {
        precondition(1.littleEndian == 1, "a render's bytes are hashed as they lie in memory, little-endian")
        return samples.withUnsafeBytes { hex($0) }
    }

    /// Whole blocks straight from the bytes, then the last part padded, with
    /// no copy: a render can be tens of megabytes, hashed in a debug build.
    private static func hex(_ bytes: UnsafeRawBufferPointer) -> String {
        var h: (UInt32, UInt32, UInt32, UInt32, UInt32, UInt32, UInt32, UInt32) =
            (0x6a09_e667, 0xbb67_ae85, 0x3c6e_f372, 0xa54f_f53a, 0x510e_527f, 0x9b05_688c, 0x1f83_d9ab, 0x5be0_cd19)
        var w = [UInt32](repeating: 0, count: 64)
        k.withUnsafeBufferPointer { k in
            w.withUnsafeMutableBufferPointer { w in
                func rotate(_ x: UInt32, _ n: UInt32) -> UInt32 { (x >> n) | (x << (32 - n)) }
                func compress(_ block: UnsafeRawBufferPointer) {
                    for t in 0..<16 {
                        let i = t * 4
                        w[t] = UInt32(block[i]) << 24 | UInt32(block[i + 1]) << 16 | UInt32(block[i + 2]) << 8 | UInt32(block[i + 3])
                    }
                    for t in 16..<64 {
                        let s0 = rotate(w[t - 15], 7) ^ rotate(w[t - 15], 18) ^ (w[t - 15] >> 3)
                        let s1 = rotate(w[t - 2], 17) ^ rotate(w[t - 2], 19) ^ (w[t - 2] >> 10)
                        w[t] = w[t - 16] &+ s0 &+ w[t - 7] &+ s1
                    }
                    var (a, b, c, d, e, f, g, hh) = h
                    for t in 0..<64 {
                        let s1 = rotate(e, 6) ^ rotate(e, 11) ^ rotate(e, 25)
                        let choose = (e & f) ^ (~e & g)
                        let t1 = hh &+ s1 &+ choose &+ k[t] &+ w[t]
                        let s0 = rotate(a, 2) ^ rotate(a, 13) ^ rotate(a, 22)
                        let majority = (a & b) ^ (a & c) ^ (b & c)
                        let t2 = s0 &+ majority
                        (hh, g, f, e, d, c, b, a) = (g, f, e, d &+ t1, c, b, a, t1 &+ t2)
                    }
                    h = (h.0 &+ a, h.1 &+ b, h.2 &+ c, h.3 &+ d, h.4 &+ e, h.5 &+ f, h.6 &+ g, h.7 &+ hh)
                }
                let whole = bytes.count / 64 * 64
                for block in stride(from: 0, to: whole, by: 64) {
                    compress(UnsafeRawBufferPointer(rebasing: bytes[block..<block + 64]))
                }
                // The rest, a 1 bit, zeros, and the length in bits, in one block or two
                var last = Array(bytes[whole...])
                last.append(0x80)
                while last.count % 64 != 56 { last.append(0) }
                let bits = UInt64(bytes.count) * 8
                for shift in stride(from: 56, through: 0, by: -8) { last.append(UInt8(truncatingIfNeeded: bits >> UInt64(shift))) }
                last.withUnsafeBytes { last in
                    for block in stride(from: 0, to: last.count, by: 64) {
                        compress(UnsafeRawBufferPointer(rebasing: last[block..<block + 64]))
                    }
                }
            }
        }
        let digits = Array("0123456789abcdef")
        let words = [h.0, h.1, h.2, h.3, h.4, h.5, h.6, h.7]
        return String(words.flatMap { word in (0..<8).reversed().map { digits[Int((word >> UInt32($0 * 4)) & 0xF)] } })
    }
}
