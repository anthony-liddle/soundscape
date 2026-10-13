// The functions Chromium's biquad uses from its copy of fdlibm,
// third_party/fdlibm/ieee754.cc at Chromium
// 935133e72a654887fb49ffbe65c8b762bdff821f, V8's fork of fdlibm: sin, cos,
// log, exp and expf. Chromium calls them, not the platform's, so that its
// filters come out the same on every platform, and so must these: at a
// bandpass's or notch's least resonance, which branch Chromium's tail time
// takes turns on the last bit of a sine and a cosine. See LICENSE-CHROMIUM.
//
// ====================================================
// Copyright (C) 1993 by Sun Microsystems, Inc. All rights reserved.
//
// Developed at SunSoft, a Sun Microsystems, Inc. business.
// Permission to use, copy, modify, and distribute this
// software is freely granted, provided that this notice
// is preserved.
// ====================================================

enum FDLibm {
    private static func high(_ x: Double) -> Int32 { Int32(bitPattern: UInt32(truncatingIfNeeded: x.bitPattern >> 32)) }
    private static func low(_ x: Double) -> UInt32 { UInt32(truncatingIfNeeded: x.bitPattern) }
    private static func words(_ high: Int32, _ low: UInt32) -> Double {
        Double(bitPattern: UInt64(UInt32(bitPattern: high)) << 32 | UInt64(low))
    }
    private static func settingHigh(_ x: Double, _ high: Int32) -> Double { words(high, low(x)) }

    /// `__ieee754_rem_pio2`, for arguments up to 2^19 pi/2: the remainder of
    /// x by pi/2, in two parts, and the quotient.
    private static func remPio2(_ x: Double) -> (Int32, Double, Double) {
        let npio2HighWords: [Int32] = [
            0x3FF9_21FB, 0x4009_21FB, 0x4012_D97C, 0x4019_21FB, 0x401F_6A7A, 0x4022_D97C,
            0x4025_FDBB, 0x4029_21FB, 0x402C_463A, 0x402F_6A7A, 0x4031_475C, 0x4032_D97C,
            0x4034_6B9C, 0x4035_FDBB, 0x4037_8FDB, 0x4039_21FB, 0x403A_B41B, 0x403C_463A,
            0x403D_D85A, 0x403F_6A7A, 0x4040_7E4C, 0x4041_475C, 0x4042_106C, 0x4042_D97C,
            0x4043_A28C, 0x4044_6B9C, 0x4045_34AC, 0x4045_FDBB, 0x4046_C6CB, 0x4047_8FDB,
            0x4048_58EB, 0x4049_21FB,
        ]
        let half = 5.00000000000000000000e-01
        let invpio2 = 6.36619772367581382433e-01
        let pio21 = 1.57079632673412561417e+00
        let pio21t = 6.07710050650619224932e-11
        let pio22 = 6.07710050630396597660e-11
        let pio22t = 2.02226624879595063154e-21
        let pio23 = 2.02226624871116645580e-21
        let pio23t = 8.47842766036889956997e-32

        let hx = high(x)
        let ix = hx & 0x7FFF_FFFF
        if ix <= 0x3FE9_21FB { return (0, x, 0) }
        if ix < 0x4002_D97C {
            // |x| < 3 pi/4, with n = +-1
            if hx > 0 {
                var z = x - pio21
                if ix != 0x3FF9_21FB {
                    let y0 = z - pio21t
                    return (1, y0, (z - y0) - pio21t)
                }
                z -= pio22
                let y0 = z - pio22t
                return (1, y0, (z - y0) - pio22t)
            }
            var z = x + pio21
            if ix != 0x3FF9_21FB {
                let y0 = z + pio21t
                return (-1, y0, (z - y0) + pio21t)
            }
            z += pio22
            let y0 = z + pio22t
            return (-1, y0, (z - y0) + pio22t)
        }
        precondition(ix <= 0x4139_21FB, "fdlibm's reduction for arguments past 2^19 pi/2 is not ported")
        var t = abs(x)
        let n = Int32(t * invpio2 + half)
        let fn = Double(n)
        var r = t - fn * pio21
        var w = fn * pio21t
        var y0: Double
        if n < 32 && ix != npio2HighWords[Int(n) - 1] {
            y0 = r - w
        } else {
            let j = ix >> 20
            y0 = r - w
            var i = j - ((high(y0) >> 20) & 0x7FF)
            if i > 16 {
                t = r
                w = fn * pio22
                r = t - w
                w = fn * pio22t - ((t - r) - w)
                y0 = r - w
                i = j - ((high(y0) >> 20) & 0x7FF)
                if i > 49 {
                    t = r
                    w = fn * pio23
                    r = t - w
                    w = fn * pio23t - ((t - r) - w)
                    y0 = r - w
                }
            }
        }
        let y1 = (r - y0) - w
        return hx < 0 ? (-n, -y0, -y1) : (n, y0, y1)
    }

    private static func kernelCos(_ x: Double, _ y: Double) -> Double {
        let one = 1.00000000000000000000e+00
        let c1 = 4.16666666666666019037e-02
        let c2 = -1.38888888888741095749e-03
        let c3 = 2.48015872894767294178e-05
        let c4 = -2.75573143513906633035e-07
        let c5 = 2.08757232129817482790e-09
        let c6 = -1.13596475577881948265e-11
        let ix = high(x) & 0x7FFF_FFFF
        if ix < 0x3E40_0000 && Int(x) == 0 { return one }
        let z = x * x
        let r = z * (c1 + z * (c2 + z * (c3 + z * (c4 + z * (c5 + z * c6)))))
        if ix < 0x3FD3_3333 { return one - (0.5 * z - (z * r - x * y)) }
        let qx = ix > 0x3FE9_0000 ? 0.28125 : words(ix - 0x0020_0000, 0)
        let iz = 0.5 * z - qx
        let a = one - qx
        return a - (iz - (z * r - x * y))
    }

    private static func kernelSin(_ x: Double, _ y: Double, _ iy: Int) -> Double {
        let half = 5.00000000000000000000e-01
        let s1 = -1.66666666666666324348e-01
        let s2 = 8.33333333332248946124e-03
        let s3 = -1.98412698298579493134e-04
        let s4 = 2.75573137070700676789e-06
        let s5 = -2.50507602534068634195e-08
        let s6 = 1.58969099521155010221e-10
        let ix = high(x) & 0x7FFF_FFFF
        if ix < 0x3E40_0000 && Int(x) == 0 { return x }
        let z = x * x
        let v = z * x
        let r = s2 + z * (s3 + z * (s4 + z * (s5 + z * s6)))
        if iy == 0 { return x + v * (s1 + z * r) }
        return x - ((z * (half * y - v * r) - y) - v * s1)
    }

    static func sin(_ x: Double) -> Double {
        let ix = high(x) & 0x7FFF_FFFF
        if ix <= 0x3FE9_21FB { return kernelSin(x, 0, 0) }
        if ix >= 0x7FF0_0000 { return x - x }
        let (n, y0, y1) = remPio2(x)
        switch n & 3 {
        case 0: return kernelSin(y0, y1, 1)
        case 1: return kernelCos(y0, y1)
        case 2: return -kernelSin(y0, y1, 1)
        default: return -kernelCos(y0, y1)
        }
    }

    static func cos(_ x: Double) -> Double {
        let ix = high(x) & 0x7FFF_FFFF
        if ix <= 0x3FE9_21FB { return kernelCos(x, 0) }
        if ix >= 0x7FF0_0000 { return x - x }
        let (n, y0, y1) = remPio2(x)
        switch n & 3 {
        case 0: return kernelCos(y0, y1)
        case 1: return -kernelSin(y0, y1, 1)
        case 2: return -kernelCos(y0, y1)
        default: return kernelSin(y0, y1, 1)
        }
    }

    static func log(_ x: Double) -> Double {
        let ln2Hi = 6.93147180369123816490e-01
        let ln2Lo = 1.90821492927058770002e-10
        let two54 = 1.80143985094819840000e+16
        let lg1 = 6.666666666666735130e-01
        let lg2 = 3.999999999940941908e-01
        let lg3 = 2.857142874366239149e-01
        let lg4 = 2.222219843214978396e-01
        let lg5 = 1.818357216161805012e-01
        let lg6 = 1.531383769920937332e-01
        let lg7 = 1.479819860511658591e-01

        var x = x
        var hx = high(x)
        let lx = low(x)
        var k: Int32 = 0
        if hx < 0x0010_0000 {
            if (hx & 0x7FFF_FFFF) == 0 && lx == 0 { return -.infinity }
            if hx < 0 { return .signalingNaN }
            k -= 54
            x *= two54
            hx = high(x)
        }
        if hx >= 0x7FF0_0000 { return x + x }
        k += (hx >> 20) - 1023
        hx &= 0x000F_FFFF
        var i = (hx + 0x95F64) & 0x10_0000
        x = settingHigh(x, hx | (i ^ 0x3FF0_0000))
        k += i >> 20
        let f = x - 1.0
        if (0x000F_FFFF & (2 + hx)) < 3 {
            if f == 0 {
                if k == 0 { return 0 }
                let dk = Double(k)
                return dk * ln2Hi + dk * ln2Lo
            }
            let r = f * f * (0.5 - 0.33333333333333333 * f)
            if k == 0 { return f - r }
            let dk = Double(k)
            return dk * ln2Hi - ((r - dk * ln2Lo) - f)
        }
        let s = f / (2.0 + f)
        let dk = Double(k)
        let z = s * s
        i = hx - 0x6147A
        let w = z * z
        let j: Int32 = 0x6B851 - hx
        let t1 = w * (lg2 + w * (lg4 + w * lg6))
        let t2 = z * (lg1 + w * (lg3 + w * (lg5 + w * lg7)))
        i |= j
        let r = t2 + t1
        if i > 0 {
            let hfsq = 0.5 * f * f
            if k == 0 { return f - (hfsq - s * (hfsq + r)) }
            return dk * ln2Hi - ((hfsq - (s * (hfsq + r) + dk * ln2Lo)) - f)
        }
        if k == 0 { return f - s * (f - r) }
        return dk * ln2Hi - ((s * (f - r) - dk * ln2Lo) - f)
    }

    static func exp(_ x: Double) -> Double {
        let one = 1.0
        let halF = [0.5, -0.5]
        let oThreshold = 7.09782712893383973096e+02
        let uThreshold = -7.45133219101941108420e+02
        let ln2HI = [6.93147180369123816490e-01, -6.93147180369123816490e-01]
        let ln2LO = [1.90821492927058770002e-10, -1.90821492927058770002e-10]
        let invln2 = 1.44269504088896338700e+00
        let p1 = 1.66666666666666019037e-01
        let p2 = -2.77777777770155933842e-03
        let p3 = 6.61375632143793436117e-05
        let p4 = -1.65339022054652515390e-06
        let p5 = 4.13813679705723846039e-08
        let e = 2.718281828459045
        let huge = 1.0e+300
        let twom1000 = 9.33263618503218878990e-302
        let two1023 = 8.988465674311579539e307

        var x = x
        var hi = 0.0
        var lo = 0.0
        var k: Int32 = 0
        var hx = UInt32(bitPattern: high(x))
        let xsb = Int((hx >> 31) & 1)
        hx &= 0x7FFF_FFFF
        if hx >= 0x4086_2E42 {
            if hx >= 0x7FF0_0000 {
                if ((hx & 0xFFFFF) | low(x)) != 0 { return x + x }
                return xsb == 0 ? x : 0.0
            }
            if x > oThreshold { return huge * huge }
            if x < uThreshold { return twom1000 * twom1000 }
        }
        if hx > 0x3FD6_2E42 {
            if hx < 0x3FF0_A2B2 {
                if x == 1.0 { return e }
                hi = x - ln2HI[xsb]
                lo = ln2LO[xsb]
                k = Int32(1 - xsb - xsb)
            } else {
                k = Int32(invln2 * x + halF[xsb])
                let t = Double(k)
                hi = x - t * ln2HI[0]
                lo = t * ln2LO[0]
            }
            x = hi - lo
        } else if hx < 0x3E30_0000 {
            if huge + x > one { return one + x }
        } else {
            k = 0
        }
        let t = x * x
        let twopk = k >= -1021
            ? words(0x3FF0_0000 + Int32(bitPattern: UInt32(bitPattern: k) << 20), 0)
            : words(0x3FF0_0000 + Int32(bitPattern: UInt32(bitPattern: k + 1000) << 20), 0)
        let c = x - t * (p1 + t * (p2 + t * (p3 + t * (p4 + t * p5))))
        if k == 0 { return one - ((x * c) / (c - 2.0) - x) }
        let y = one - ((lo - (x * c) / (2.0 - c)) - hi)
        if k >= -1021 {
            if k == 1024 { return y * 2.0 * two1023 }
            return y * twopk
        }
        return y * twopk * twom1000
    }

    /// `expf`: `exp` in double, of a float, rounded to float.
    static func expf(_ x: Float) -> Float { Float(exp(Double(x))) }
}
