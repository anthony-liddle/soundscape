#if canImport(Darwin)
import Darwin
#elseif canImport(Glibc)
import Glibc
#endif

/// A note's gain envelope, planned exactly as the engine's `noteEnvelope` and
/// `envelopeShapeOf` in `VoiceSynthesizer.ts` plan it, and evaluated as Web
/// Audio evaluates an automation timeline: each value a float32, each ramp the
/// spec's formula at the frame's time.
struct Envelope {
    enum Kind {
        case set
        case ramp
    }

    struct Event {
        let kind: Kind
        /// Seconds from the note's start.
        let at: Double
        let value: Float
    }

    let exponential: Bool
    /// Seconds from the release to the floor.
    let release: Double
    let events: [Event]

    /// - Parameters:
    ///   - level: the note's peak, as a linear gain.
    ///   - releaseAt: seconds from the note's start to its release.
    init(_ instrument: CueInstrument, level: Double, releaseAt: Double) {
        let attack = adsr(instrument.attack, .attack)
        let exponential = instrument.envelopeCurve == .exponential && level > 0
        self.exponential = exponential
        release = adsr(instrument.release, .release)
        let floor = exponential ? instrument.envelopeFloor! : 0
        let sustainLevel = instrument.sustain * level
        let sustain = exponential ? max(sustainLevel, floor) : sustainLevel
        let decay: Double
        let decayEnd: Double
        switch instrument.decay {
        case .fixed(let normalized):
            decay = adsr(normalized, .decay)
            decayEnd = attack + decay
        case .untilRelease:
            // Whatever of the note is left after the attack, ending at the release exactly
            decay = max(0, releaseAt - attack)
            decayEnd = releaseAt
        }

        /// `envelopeLevelAt`: the unreleased envelope's level `t` seconds in.
        func levelAt(_ t: Double) -> Double {
            func between(_ v0: Double, _ v1: Double, _ fraction: Double) -> Double {
                exponential ? v0 * pow(v1 / v0, fraction) : v0 + (v1 - v0) * fraction
            }
            if t <= 0 { return floor }
            if t < attack { return between(floor, level, t / attack) }
            let intoDecay = t - attack
            if intoDecay < decay { return between(level, sustain, intoDecay / decay) }
            return sustain
        }

        var plan = [Event(kind: .set, at: 0, value: Float(floor))]
        if releaseAt < attack {
            // Released during the attack: the attack ends there, at the level it reached
            plan.append(Event(kind: .ramp, at: releaseAt, value: Float(levelAt(releaseAt))))
        } else if releaseAt < decayEnd {
            // During the decay: the decay ends where the release begins
            plan.append(Event(kind: .ramp, at: attack, value: Float(level)))
            plan.append(Event(kind: .ramp, at: releaseAt, value: Float(levelAt(releaseAt))))
        } else {
            // After it: the sustain level holds until the release, which this anchors
            plan.append(Event(kind: .ramp, at: attack, value: Float(level)))
            plan.append(Event(kind: .ramp, at: decayEnd, value: Float(sustain)))
            plan.append(Event(kind: .set, at: releaseAt, value: Float(sustain)))
        }
        plan.append(Event(kind: .ramp, at: releaseAt + release, value: Float(floor)))
        events = plan
    }

    /// The gain at time `t` on the context's clock, for a note that starts at
    /// `start`: every event's time is the start plus its time within the note,
    /// as `playNote` schedules it. A ramp runs from the event before it, and
    /// after the last event the value holds.
    func value(at t: Double, start: Double) -> Float {
        guard let next = events.firstIndex(where: { start + $0.at > t }) else { return events.last!.value }
        guard next > 0 else { return 0 }
        let previous = events[next - 1]
        let target = events[next]
        guard target.kind == .ramp else { return previous.value }
        let v0 = Double(previous.value)
        let v1 = Double(target.value)
        let t0 = start + previous.at
        let fraction = (t - t0) / ((start + target.at) - t0)
        return Float(exponential ? v0 * pow(v1 / v0, fraction) : v0 + (v1 - v0) * fraction)
    }
}

enum Stage {
    case attack, decay, release
}

/// `normalizedToADSR` in the engine's `utils/time.ts`: a normalized value to seconds.
func adsr(_ normalized: Double, _ stage: Stage) -> Double {
    switch stage {
    case .attack: 0.001 + normalized * normalized * 1.999
    case .decay: 0.01 + normalized * normalized * 2.99
    case .release: 0.01 + normalized * normalized * 4.99
    }
}
