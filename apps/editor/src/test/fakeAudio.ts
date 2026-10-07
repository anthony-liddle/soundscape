import { vi } from 'vitest'

// Minimal Web Audio stubs: jsdom has no AudioContext. The engine only needs
// the node graph methods it calls to initialize, update, and play notes and cues.
function makeNode() {
  const param = {
    value: 0,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
    cancelAndHoldAtTime: vi.fn(),
  }
  return {
    connect: vi.fn(),
    disconnect: vi.fn(),
    gain: param,
    frequency: param,
    detune: param,
    Q: param,
    threshold: param,
    knee: param,
    ratio: param,
    attack: param,
    release: param,
    delayTime: param,
    curve: null,
    oversample: '',
    buffer: null,
    fftSize: 0,
    smoothingTimeConstant: 0,
    frequencyBinCount: 1024,
    start: vi.fn(),
    stop: vi.fn(),
    port: { onmessage: null, postMessage: vi.fn() },
  }
}

let liveContexts = 0

/** How many live contexts, not offline ones, have been made since the fake went in. */
export function liveAudioContextsMade(): number {
  return liveContexts
}

class FakeAudioContext {
  constructor() {
    if (new.target === FakeAudioContext) liveContexts++
  }
  currentTime = 0
  sampleRate = 44100
  state = 'running'
  destination = makeNode()
  audioWorklet = { addModule: vi.fn().mockResolvedValue(undefined) }
  createGain = vi.fn(() => makeNode())
  createDynamicsCompressor = vi.fn(() => makeNode())
  createAnalyser = vi.fn(() => makeNode())
  createBiquadFilter = vi.fn(() => makeNode())
  createOscillator = vi.fn(() => makeNode())
  createDelay = vi.fn(() => makeNode())
  createWaveShaper = vi.fn(() => makeNode())
  createConvolver = vi.fn(() => makeNode())
  createBuffer = vi.fn(() => ({ getChannelData: () => new Float32Array(8) }))
  resume = vi.fn().mockResolvedValue(undefined)
  close = vi.fn().mockResolvedValue(undefined)
}

/**
 * Renders silence with one sample at 0.5, so a drawn cue peaks at -6.02 dBFS
 * and lasts exactly as long as it was asked to.
 */
class FakeOfflineAudioContext extends FakeAudioContext {
  readonly length: number
  constructor(_channels: number, length: number, sampleRate: number) {
    super()
    this.length = length
    this.sampleRate = sampleRate
  }
  startRendering = vi.fn(() => {
    const data = new Float32Array(this.length)
    data[0] = 0.5
    return Promise.resolve({
      length: this.length,
      sampleRate: this.sampleRate,
      duration: this.length / this.sampleRate,
      numberOfChannels: 1,
      getChannelData: () => data,
    })
  })
}

/** Stand in for Web Audio and animation frames, so the real engine runs in jsdom. */
export function installFakeAudio() {
  liveContexts = 0
  vi.stubGlobal('AudioContext', FakeAudioContext)
  vi.stubGlobal('AudioWorkletNode', class { port = { onmessage: null }; connect() {}; disconnect() {} })
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0) as unknown as number)
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id))
}

/** Also stand in for OfflineAudioContext, so a cue can be rendered and drawn. */
export function installFakeOfflineAudio() {
  vi.stubGlobal('OfflineAudioContext', FakeOfflineAudioContext)
}
