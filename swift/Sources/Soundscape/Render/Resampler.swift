// The waveshaper's 2x oversampling follows Chromium's
// platform/audio/up_sampler.cc, down_sampler.cc and direct_convolver.cc, in
// third_party/blink at Chromium 935133e72a654887fb49ffbe65c8b762bdff821f: the
// same windowed-sinc kernels, built with Chromium's fdlibm, the same history
// buffers and the same latency. That code is BSD-licensed: see
// LICENSE-CHROMIUM at the repository root.
//
// One part does not follow it. Chromium convolves with vector_math::Conv,
// which on macOS is Accelerate's vDSP_conv, summing in an order of its own.
// Here each sum is taken in double, in order, and rounded once to float, so
// the package runs the same on every platform; it differs from Chromium by a
// float's rounding.

/// A FIR filter run on fixed-size blocks, `DirectConvolver`: each output is
/// the sum of the block's inputs, and the kernel's length less one before
/// them, under the kernel reversed.
struct DirectConvolver {
    private let kernel: [Float]
    private var buffer: [Float]
    private let blockSize: Int

    init(blockSize: Int, kernel: [Float]) {
        self.kernel = kernel
        self.blockSize = blockSize
        buffer = [Float](repeating: 0, count: kernel.count - 1 + blockSize)
    }

    var kernelSize: Int { kernel.count }

    mutating func process(_ source: UnsafeBufferPointer<Float>, into destination: UnsafeMutableBufferPointer<Float>) {
        let history = kernel.count - 1
        let size = kernel.count
        buffer.withUnsafeMutableBufferPointer { buffer in
            for i in 0..<blockSize { buffer[history + i] = source[i] }
            kernel.withUnsafeBufferPointer { kernel in
                // vDSP_conv with the filter read backwards: sum of A[n + p] F[P - 1 - p]
                for n in 0..<blockSize {
                    var sum = 0.0
                    for p in 0..<size { sum += Double(buffer[n + p]) * Double(kernel[size - 1 - p]) }
                    destination[n] = Float(sum)
                }
            }
            for i in 0..<history { buffer[i] = buffer[blockSize + i] }
        }
    }
}

/// The Blackman window's coefficients, as both resamplers use them.
private let blackman = (a0: 0.5 * (1.0 - 0.16), a1: 0.5, a2: 0.5 * 0.16)

/// `UpSampler`: doubles the rate. The even output frames are the input,
/// delayed by half the kernel; the odd ones, the input through a 128-point
/// windowed sinc half a frame off. Its latency is 64 frames.
struct UpSampler {
    static let kernelSize = 128
    private var convolver: DirectConvolver
    private var input: [Float]
    private let blockSize: Int

    init(blockSize: Int) {
        self.blockSize = blockSize
        input = [Float](repeating: 0, count: Self.kernelSize / 2 + blockSize)
        convolver = DirectConvolver(blockSize: blockSize, kernel: Self.makeKernel())
    }

    /// `MakeKernel`: a sinc offset by half a frame, under a Blackman window.
    static func makeKernel() -> [Float] {
        let n = kernelSize
        let half = n / 2
        let offset = -0.5
        return (0..<n).map { i in
            let s = Double.pi * (Double(i - half) - offset)
            let sinc = s == 0 ? 1.0 : FDLibm.sin(s) / s
            let x = (Double(i) - offset) / Double(n)
            let window = blackman.a0 - blackman.a1 * FDLibm.cos(2 * Double.pi * x)
                + blackman.a2 * FDLibm.cos(2 * Double.pi * 2.0 * x)
            return Float(sinc * window)
        }
    }

    var latencyFrames: Int { Self.kernelSize / 2 }

    mutating func process(_ source: UnsafeBufferPointer<Float>, into destination: UnsafeMutableBufferPointer<Float>) {
        let half = Self.kernelSize / 2
        let blockSize = blockSize
        input.withUnsafeMutableBufferPointer { input in
            for i in 0..<blockSize { input[half + i] = source[i] }
            for i in 0..<blockSize { destination[2 * i] = input[i] }
        }
        var odd = [Float](repeating: 0, count: blockSize)
        odd.withUnsafeMutableBufferPointer { odd in convolver.process(source, into: odd) }
        for i in 0..<blockSize { destination[2 * i + 1] = odd[i] }
        input.withUnsafeMutableBufferPointer { input in
            for i in 0..<half { input[i] = input[blockSize + i] }
        }
    }
}

/// `DownSampler`: halves the rate through a 256-point half-band windowed
/// sinc. Only its odd terms are convolved, a 128-point kernel; its centre
/// term, 0.5, is a delay line. Its latency is 64 frames at the lower rate.
struct DownSampler {
    static let kernelSize = 256
    private var convolver: DirectConvolver
    private var input: [Float]
    private let blockSize: Int

    /// - Parameter blockSize: frames in, at the higher rate.
    init(blockSize: Int) {
        self.blockSize = blockSize
        input = [Float](repeating: 0, count: Self.kernelSize / 2 + blockSize)
        convolver = DirectConvolver(blockSize: blockSize / 2, kernel: Self.makeReducedKernel())
    }

    /// `MakeReducedKernel`: the half-band sinc's odd terms.
    static func makeReducedKernel() -> [Float] {
        let n = kernelSize
        let half = n / 2
        var reduced = [Float](repeating: 0, count: n / 2)
        for i in stride(from: 1, to: n, by: 2) {
            let s = 0.5 * Double.pi * Double(i - half)
            var sinc = s == 0 ? 1.0 : FDLibm.sin(s) / s
            sinc *= 0.5
            let x = Double(i) / Double(n)
            let window = blackman.a0 - blackman.a1 * FDLibm.cos(2 * Double.pi * x)
                + blackman.a2 * FDLibm.cos(2 * Double.pi * 2.0 * x)
            reduced[(i - 1) / 2] = Float(sinc * window)
        }
        return reduced
    }

    /// The convolution kernel's length over two, as `LatencyFrames` counts it.
    var latencyFrames: Int { convolver.kernelSize / 2 }

    mutating func process(_ source: UnsafeBufferPointer<Float>, into destination: UnsafeMutableBufferPointer<Float>) {
        let half = Self.kernelSize / 2
        let out = blockSize / 2
        var odd = [Float](repeating: 0, count: out)
        input.withUnsafeMutableBufferPointer { input in
            for i in 0..<blockSize { input[half + i] = source[i] }
            // The odd frames, a frame late to match the reduced kernel
            for i in 0..<out { odd[i] = input[half - 1 + 2 * i] }
        }
        odd.withUnsafeBufferPointer { odd in convolver.process(odd, into: destination) }
        input.withUnsafeMutableBufferPointer { input in
            // The centre term: half the input, delayed by half the kernel
            for i in 0..<out { destination[i] += 0.5 * input[2 * i] }
            for i in 0..<half { input[i] = input[blockSize + i] }
        }
    }
}
