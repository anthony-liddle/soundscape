#if canImport(Darwin)
import Darwin
#elseif canImport(Glibc)
import Glibc
#endif

/// An unnormalized inverse discrete Fourier transform of a power-of-two size,
/// `y[j] = sum over k of x[k] e^(2 pi i k j / n)`, by the iterative radix-2
/// algorithm, in double precision. What builds the band-limited tables, in
/// place of a direct sum that costs a thousand times as much.
struct InverseFFT {
    let size: Int
    private let cosines: [Double]
    private let sines: [Double]
    private let reversed: [Int]

    init(size: Int) {
        precondition(size > 1 && size & (size - 1) == 0, "the size must be a power of two")
        self.size = size
        let bits = size.trailingZeroBitCount
        cosines = (0..<size / 2).map { cos(2 * Double.pi * Double($0) / Double(size)) }
        sines = (0..<size / 2).map { sin(2 * Double.pi * Double($0) / Double(size)) }
        reversed = (0..<size).map { j in
            var r = 0
            for b in 0..<bits where j & (1 << b) != 0 { r |= 1 << (bits - 1 - b) }
            return r
        }
    }

    /// Transforms `real` and `imaginary` in place.
    func transform(_ real: inout [Double], _ imaginary: inout [Double]) {
        precondition(real.count == size && imaginary.count == size)
        for j in 0..<size where j < reversed[j] {
            real.swapAt(j, reversed[j])
            imaginary.swapAt(j, reversed[j])
        }
        var span = 2
        while span <= size {
            let half = span / 2
            let stride = size / span
            for start in Swift.stride(from: 0, to: size, by: span) {
                for k in 0..<half {
                    let wr = cosines[k * stride]
                    let wi = sines[k * stride]
                    let a = start + k
                    let b = a + half
                    let tr = wr * real[b] - wi * imaginary[b]
                    let ti = wr * imaginary[b] + wi * real[b]
                    real[b] = real[a] - tr
                    imaginary[b] = imaginary[a] - ti
                    real[a] += tr
                    imaginary[a] += ti
                }
            }
            span *= 2
        }
    }
}
