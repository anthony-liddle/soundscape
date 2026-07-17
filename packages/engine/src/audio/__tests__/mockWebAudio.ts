import { vi } from 'vitest';

/**
 * Recording mock of the Web Audio API for characterization tests.
 *
 * Every AudioParam records its scheduling calls, and every node records its
 * connections, so tests can assert on the exact graph shape and automation
 * timeline the code under test produces.
 */

export interface ParamCall {
  method: 'set' | 'ramp' | 'cancel';
  value?: number;
  time: number;
}

export interface MockParam {
  value: number;
  calls: ParamCall[];
  setValueAtTime: ReturnType<typeof vi.fn>;
  linearRampToValueAtTime: ReturnType<typeof vi.fn>;
  cancelScheduledValues: ReturnType<typeof vi.fn>;
}

export function createMockParam(initial = 0): MockParam {
  const calls: ParamCall[] = [];
  const param: MockParam = {
    value: initial,
    calls,
    setValueAtTime: vi.fn((value: number, time: number) => {
      calls.push({ method: 'set', value, time });
      param.value = value;
    }),
    linearRampToValueAtTime: vi.fn((value: number, time: number) => {
      calls.push({ method: 'ramp', value, time });
    }),
    cancelScheduledValues: vi.fn((time: number) => {
      calls.push({ method: 'cancel', time });
    }),
  };
  return param;
}

export interface MockNode {
  kind: string;
  connections: MockNode[];
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  // node-type specifics (present where relevant)
  gain: MockParam;
  frequency: MockParam;
  detune: MockParam;
  Q: MockParam;
  delayTime: MockParam;
  threshold: MockParam;
  knee: MockParam;
  ratio: MockParam;
  attack: MockParam;
  release: MockParam;
  fftSize: number;
  smoothingTimeConstant: number;
  type: string;
  curve: Float32Array | null;
  oversample: string;
  buffer: unknown;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  started: number[];
  stopped: number[];
}

function createMockNode(kind: string): MockNode {
  const node: MockNode = {
    kind,
    connections: [],
    connect: vi.fn((target: MockNode) => {
      node.connections.push(target);
    }),
    disconnect: vi.fn(),
    gain: createMockParam(1),
    frequency: createMockParam(350),
    detune: createMockParam(0),
    Q: createMockParam(1),
    delayTime: createMockParam(0),
    threshold: createMockParam(-24),
    knee: createMockParam(30),
    ratio: createMockParam(12),
    attack: createMockParam(0.003),
    release: createMockParam(0.25),
    fftSize: 2048,
    smoothingTimeConstant: 0.8,
    type: '',
    curve: null,
    oversample: '',
    buffer: null,
    started: [],
    stopped: [],
    start: vi.fn((time: number = 0) => {
      node.started.push(time);
    }),
    stop: vi.fn((time: number = 0) => {
      node.stopped.push(time);
    }),
  };
  return node;
}

export interface MockAudioContext {
  currentTime: number;
  sampleRate: number;
  state: string;
  destination: MockNode;
  createdNodes: MockNode[];
  createGain: () => MockNode;
  createBiquadFilter: () => MockNode;
  createOscillator: () => MockNode;
  createDelay: (maxDelay?: number) => MockNode;
  createWaveShaper: () => MockNode;
  createConvolver: () => MockNode;
  createDynamicsCompressor: () => MockNode;
  createAnalyser: () => MockNode;
  createBuffer: (channels: number, length: number, sampleRate: number) => {
    numberOfChannels: number;
    length: number;
    sampleRate: number;
    getChannelData: (i: number) => Float32Array;
  };
  resume: () => Promise<void>;
  close: () => Promise<void>;
}

export function createMockAudioContext(): MockAudioContext {
  const createdNodes: MockNode[] = [];
  const make = (kind: string) => {
    const node = createMockNode(kind);
    createdNodes.push(node);
    return node;
  };
  return {
    currentTime: 0,
    sampleRate: 44100,
    state: 'running',
    destination: createMockNode('destination'),
    createdNodes,
    createGain: () => make('gain'),
    createBiquadFilter: () => make('filter'),
    createOscillator: () => make('oscillator'),
    createDelay: () => make('delay'),
    createWaveShaper: () => make('waveshaper'),
    createConvolver: () => make('convolver'),
    createDynamicsCompressor: () => make('compressor'),
    createAnalyser: () => make('analyser'),
    createBuffer: (channels: number, length: number, sampleRate: number) => ({
      numberOfChannels: channels,
      length,
      sampleRate,
      getChannelData: () => new Float32Array(length),
    }),
    resume: () => Promise.resolve(),
    close: () => Promise.resolve(),
  };
}

/** True if `from` has a recorded connection to `to`. */
export function isConnected(from: MockNode, to: MockNode): boolean {
  return from.connections.includes(to);
}

/** Follow single connections from `start` collecting node kinds, for path assertions. */
export function pathKinds(start: MockNode, depth = 6): string[] {
  const kinds: string[] = [start.kind];
  let node = start;
  for (let i = 0; i < depth && node.connections.length > 0; i++) {
    node = node.connections[0]!;
    kinds.push(node.kind);
  }
  return kinds;
}
