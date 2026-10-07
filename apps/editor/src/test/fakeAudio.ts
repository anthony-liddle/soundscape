import { vi } from 'vitest'

// Minimal Web Audio stubs — jsdom has no AudioContext. The engine only needs
// the node graph methods it calls during initialize/updateState.
function makeNode() {
  const param = {
    value: 0,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
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

class FakeAudioContext {
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

/** Stand in for Web Audio and animation frames, so the real engine runs in jsdom. */
export function installFakeAudio() {
  vi.stubGlobal('AudioContext', FakeAudioContext)
  vi.stubGlobal('AudioWorkletNode', class { port = { onmessage: null }; connect() {}; disconnect() {} })
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0) as unknown as number)
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id))
}
