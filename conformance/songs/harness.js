// Runs in the page. Plays a game's music through the engine at /engine.js, on
// an OfflineAudioContext, as the game's music manager plays it, and returns
// the render with what the engine did.
//
// Two ways to drive it:
// - 'lockstep': the render suspends at every scheduler tick, timer and game
//   action, and each runs there with currentTime reading that moment, as in a
//   browser playing the game. Chromium and WebKit: Firefox's
//   OfflineAudioContext has no suspend.
// - 'prescheduled': the same ticks, timers and actions run in time order on a
//   virtual clock before rendering, with currentTime reading the virtual time,
//   and the render runs once. Calls that act at once, stop() with no time and
//   disconnect(), are taken to that virtual time. It stands in for live play
//   only where no call depends on when it is made; Firefox is rendered so.
//
// Timers, the scheduler worklet's ticks, requestAnimationFrame and
// performance.now all run on the audio clock. The worklet's ticks come every
// 1024 frames from the quantum its node was made in, as the engine's processor
// posts them, every eighth render quantum.

const QUANTUM = 128;

/** mulberry32, for the draws a game makes from Math.random. */
function mulberry32(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Timers and animation frames keyed on audio frames. */
class Clock {
  constructor(rate) {
    this.rate = rate;
    this.frame = 0;
    this.timers = new Map();
    this.nextId = 1;
  }
  ms() {
    return (this.frame / this.rate) * 1000;
  }
  add(fn, ms, args, repeat) {
    const id = this.nextId++;
    const wait = Math.max(0, Number(ms) || 0);
    this.timers.set(id, { due: this.frame + (wait * this.rate) / 1000, fn, args, every: repeat ? Math.max(1, wait) : null });
    return id;
  }
  frameAt(fn) {
    const period = this.rate / 60;
    const id = this.nextId++;
    this.timers.set(id, { due: (Math.floor(this.frame / period) + 1) * period, fn: () => fn(this.ms()), args: [], every: null });
    return id;
  }
  clear(id) {
    this.timers.delete(id);
  }
  nextDue() {
    let due = Infinity;
    for (const t of this.timers.values()) due = Math.min(due, t.due);
    return due;
  }
  /** Fire every timer due by `frame`, earliest first, ties in the order set. */
  fireUpTo(frame) {
    for (;;) {
      let best = null;
      let bestId = 0;
      for (const [id, t] of this.timers) {
        if (t.due <= frame && (best === null || t.due < best.due || (t.due === best.due && id < bestId))) {
          best = t;
          bestId = id;
        }
      }
      if (best === null) return;
      if (best.every !== null) best.due += (best.every * this.rate) / 1000;
      else this.timers.delete(bestId);
      best.fn(...best.args);
    }
  }
}

function installClock(clock) {
  const saved = {
    setTimeout: window.setTimeout,
    clearTimeout: window.clearTimeout,
    setInterval: window.setInterval,
    clearInterval: window.clearInterval,
    requestAnimationFrame: window.requestAnimationFrame,
    cancelAnimationFrame: window.cancelAnimationFrame,
  };
  window.setTimeout = (fn, ms, ...args) => clock.add(fn, ms, args, false);
  window.clearTimeout = (id) => clock.clear(id);
  window.setInterval = (fn, ms, ...args) => clock.add(fn, ms, args, true);
  window.clearInterval = (id) => clock.clear(id);
  window.requestAnimationFrame = (fn) => clock.frameAt(fn);
  window.cancelAnimationFrame = (id) => clock.clear(id);
  Object.defineProperty(performance, 'now', { value: () => clock.ms(), configurable: true, writable: true });
  return () => {
    Object.assign(window, saved);
    delete performance.now;
  };
}

// ---- The games, as their music managers play them ----

// Rock Paper Scissors, src/engine/musicManager.ts: its tempo, layers and
// volumes for each tension, as written there.
const RPS_BPM = { CALM: 60, UNEASY: 78, IRRITATED: 100, UNSTABLE: 125, MELTDOWN: 150 };
const RPS_LAYERS = {
  CALM: ['keys', 'percussion'],
  UNEASY: ['keys', 'percussion', 'bass'],
  IRRITATED: ['keys', 'percussion', 'bass', 'pad'],
  UNSTABLE: ['keys', 'percussion', 'bass', 'pad', 'lead'],
  MELTDOWN: ['keys', 'percussion', 'bass', 'pad', 'lead', 'glitch', 'glitch-random'],
};
const RPS_VOLUMES = {
  pad: { CALM: 0.7, UNEASY: 0.55, IRRITATED: 0.45, UNSTABLE: 0.35, MELTDOWN: 0.25 },
  bass: { UNEASY: 0.55, IRRITATED: 0.65, UNSTABLE: 0.75, MELTDOWN: 0.85 },
  keys: { IRRITATED: 0.45, UNSTABLE: 0.5, MELTDOWN: 0.55 },
  percussion: { IRRITATED: 0.5, UNSTABLE: 0.65, MELTDOWN: 0.85 },
  lead: { UNSTABLE: 0.5, MELTDOWN: 0.7 },
  glitch: { MELTDOWN: 0.6 },
  'glitch-random': { MELTDOWN: 0.5 },
};

/**
 * Rock Paper Scissors' buildRandomGlitchTrack, as written there, which draws
 * its notes from Math.random and gets a new id from createTrack every
 * session. The caller fixes both: the draws come from mulberry32, and the id
 * is GLITCH_ID.
 */
export const GLITCH_ID = 'track-glitch-random';
function rpsGlitchTrack(lib) {
  const LOOP_LENGTH = 16;
  const track = lib.createTrack('Random Glitch', 'pluck');
  const notes = [];
  for (let i = 0; i < LOOP_LENGTH * 4; i++) {
    const time = i * 0.25;
    if (time >= LOOP_LENGTH) break;
    const pitch = 20 + Math.floor(Math.random() * 80);
    notes.push(lib.createNote(pitch, time, 0.05 + Math.random() * 0.1, 60 + Math.floor(Math.random() * 67)));
  }
  const clusterPitches = [41, 42, 47, 53, 54, 59, 65, 66, 71, 77, 78];
  for (let i = 0; i < 6; i++) {
    const time = Math.random() * (LOOP_LENGTH - 1);
    const pitch = clusterPitches[Math.floor(Math.random() * clusterPitches.length)];
    notes.push(lib.createNote(pitch, time, 0.5 + Math.random() * 1.5, 80 + Math.floor(Math.random() * 47)));
  }
  for (let i = 0; i < LOOP_LENGTH; i += 2) {
    notes.push(lib.createNote(24 + Math.floor(Math.random() * 8), i, 0.3, 110 + Math.floor(Math.random() * 17)));
  }
  track.notes = notes;
  track.paramOverrides = {
    distortion: 0.7,
    filterCutoff: 0.9,
    filterResonance: 0.6,
    attack: 0.001,
    decay: 0.1,
    sustain: 0.03,
    release: 0.05,
  };
  return { ...track, id: GLITCH_ID };
}

function rpsGame(lib, data, o, random) {
  const engine = new lib.AudioEngine();
  let entries = [];
  let tension = 'CALM';
  const mixerFor = (t) => {
    const tracks = {};
    for (const e of entries) {
      let volume = RPS_VOLUMES[e.name]?.[t] ?? 0.5;
      if (o.mistake?.track === e.track.id) volume *= o.mistake.factor;
      tracks[e.track.id] = { volume, mute: !RPS_LAYERS[t].includes(e.name), solo: e.name === o.solo };
    }
    return { tracks, masterVolume: 0.7 };
  };
  return {
    engine,
    async initialize() {
      await engine.initialize();
      entries = data.tracks.map((track) => ({ track, name: track.id.replace(/^track-/, '') }));
      random.use('glitch');
      entries.push({ track: rpsGlitchTrack(lib), name: 'glitch-random' });
      random.use('reverb');
      engine.updateState({
        metadata: {
          name: data.metadata.name,
          tempo: RPS_BPM.CALM,
          timeSignature: data.metadata.timeSignature,
          lengthBeats: data.metadata.lengthBeats,
        },
        tracks: entries.map((e) => e.track),
        presets: data.presets,
        mixer: mixerFor('CALM'),
      });
      engine.setLoop(true);
    },
    start() {
      // The game awaits engine.resume() first: a running context's no-op, and
      // one an offline context refuses before rendering.
      engine.play();
    },
    act({ tension: next }) {
      if (next === undefined || next === tension) return;
      tension = next;
      engine.setTempo(RPS_BPM[next]);
      engine.updateMixer(mixerFor(next));
    },
    trackNames: () => Object.fromEntries(entries.map((e) => [e.track.id, e.name])),
  };
}

// The Forgetting Machine, src/audio/musicManager.ts: the song with the
// engine's built-in presets, played once, and its fadeOut, one updateMixer a
// display frame over TIMING.MUSIC_FADE_OUT, 7 s, then stop.
function fmGame(lib, data, o, random, presets = lib.builtInPresets) {
  const engine = new lib.AudioEngine();
  const state = { ...data, presets };
  if (o.mistake) {
    const entry = state.mixer.tracks[o.mistake.track];
    state.mixer = { ...state.mixer, tracks: { ...state.mixer.tracks, [o.mistake.track]: { ...entry, volume: entry.volume * o.mistake.factor } } };
  }
  return {
    engine,
    async initialize() {
      await engine.initialize();
    },
    start() {
      random.use('reverb');
      engine.updateState(state);
      // A host that changes its state after handing it over: the engine reads
      // it as it schedules, past any check updateState makes
      for (const [id, params] of Object.entries(o.corrupt ?? {})) {
        const track = state.tracks.find((t) => t.id === id);
        track.paramOverrides = { ...(track.paramOverrides ?? {}) };
        Object.assign(track.paramOverrides, params);
      }
      engine.setLoop(false);
      engine.play();
    },
    act({ fadeOut }) {
      if (!fadeOut) return;
      const initial = state.mixer.masterVolume;
      const startTime = performance.now();
      const tick = () => {
        const progress = Math.min((performance.now() - startTime) / 7000, 1);
        engine.updateMixer({ ...state.mixer, masterVolume: initial * (1 - progress) });
        if (progress < 1) requestAnimationFrame(tick);
        else engine.stop();
      };
      requestAnimationFrame(tick);
    },
    trackNames: () => Object.fromEntries(data.tracks.map((t) => [t.id, t.presetId])),
  };
}

/**
 * One sustained note, alone: the smallest song that shows how a held note is
 * released. A sine held at 0.6 of its peak for 2 s at 120 bpm, released over
 * 0.46 s, with no effect.
 */
export const HELD = {
  metadata: { name: 'Held', tempo: 120, timeSignature: [4, 4], lengthBeats: 8 },
  presets: [
    {
      id: 'held',
      name: 'Held',
      isBuiltIn: false,
      params: {
        waveform: 'sine',
        pitchOffset: 0,
        attack: 0.1,
        decay: 0.2,
        sustain: 0.6,
        release: 0.3,
        filterType: 'lowpass',
        filterCutoff: 1,
        filterResonance: 0,
        delayTime: 0,
        delayFeedback: 0,
        delayMix: 0,
        distortion: 0,
        reverbMix: 0,
        velocityResponse: 0,
      },
    },
  ],
  tracks: [{ id: 'held', name: 'Held', presetId: 'held', notes: [{ id: 'held-0', pitch: 69, startTime: 0, duration: 4, velocity: 127 }] }],
  mixer: { tracks: { held: { volume: 1, mute: false, solo: false } }, masterVolume: 1 },
};

function heldGame(lib, data, o, random) {
  const game = fmGame(lib, data, o, random, data.presets);
  return { ...game, trackNames: () => ({ held: 'held' }) };
}

// ---- The render ----

function toBase64(f32) {
  const bytes = new Uint8Array(f32.buffer, f32.byteOffset, f32.byteLength);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/**
 * @param o.game       'rps', 'fm', or 'held'
 * @param o.mode       'lockstep' or 'prescheduled'
 * @param o.sampleRate 48000 unless given
 * @param o.seconds    the render's length
 * @param o.playAt     seconds at which the game starts the music, on a quantum
 * @param o.actions    [{ at: seconds after playAt, ...what the game does }]
 * @param o.seedReverb a seed for Math.random while the engine builds its
 *                     chains, or null for Math.random itself. An engine that
 *                     seeds its own reverb draws nothing from it.
 * @param o.glitchSeed the seed for Rock Paper Scissors' generated track, 2 unless given
 * @param o.leaveOut   { reverb, compressor }: either replaced by a plain gain
 * @param o.solo       a Rock Paper Scissors layer soloed in every mixer
 * @param o.mistake    { track, factor }: that track's volume times factor
 * @param o.overrides  { trackId: { param: value } } added to the song before
 *                     the game hands it over; 'NaN' is read as NaN
 * @param o.corrupt    the same, for The Forgetting Machine, added after
 *                     updateState has the song
 */
export async function renderSong(o) {
  const rate = o.sampleRate ?? 48000;
  const frames = Math.round(o.seconds * rate);
  const lib = await import('/engine.js');
  const read = (params) => Object.fromEntries(Object.entries(params).map(([k, v]) => [k, v === 'NaN' ? NaN : v]));
  const data = o.game === 'held' ? structuredClone(HELD) : await (await fetch(`/songs/${o.game}.json`)).json();
  for (const [id, params] of Object.entries(o.overrides ?? {})) {
    const track = data.tracks.find((t) => t.id === id);
    track.paramOverrides = { ...(track.paramOverrides ?? {}), ...read(params) };
  }
  if (o.corrupt) o = { ...o, corrupt: Object.fromEntries(Object.entries(o.corrupt).map(([id, p]) => [id, read(p)])) };

  const offline = new OfflineAudioContext(2, frames, rate);
  const clock = new Clock(rate);
  const virtual = o.mode === 'prescheduled';

  // Math.random's streams: the engine's chains, and the game's own draws
  const nativeRandom = Math.random;
  const streams = {
    reverb: o.seedReverb == null ? nativeRandom : mulberry32(o.seedReverb),
    glitch: mulberry32(o.glitchSeed ?? 2),
  };
  let stream = streams.reverb;
  const random = { use: (name) => (stream = streams[name]) };
  Math.random = () => stream();

  // What the engine sees as its context
  const leaveOut = o.leaveOut ?? {};
  const stubs = {
    createDynamicsCompressor() {
      const g = offline.createGain();
      const param = () => ({ value: 0, setValueAtTime() {} });
      return Object.assign(g, { threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() });
    },
    createConvolver() {
      const g = offline.createGain();
      g.gain.value = 0;
      let buffer = null;
      Object.defineProperty(g, 'buffer', { get: () => buffer, set: (b) => (buffer = b) });
      return g;
    },
  };
  const context = new Proxy(offline, {
    get(target, prop) {
      if (prop === 'currentTime' && virtual) return clock.frame / rate;
      if (prop === 'createDynamicsCompressor' && leaveOut.compressor) return stubs.createDynamicsCompressor;
      if (prop === 'createConvolver' && leaveOut.reverb) return stubs.createConvolver;
      const v = Reflect.get(target, prop, target);
      return typeof v === 'function' ? v.bind(target) : v;
    },
  });
  const savedAudioContext = window.AudioContext;
  window.AudioContext = class {
    constructor() {
      return context;
    }
  };

  // The scheduler worklet: its module loads, and its node is replaced by one
  // whose ticks the render delivers
  const tick = o.tickFrames ?? 1024;
  const worklets = [];
  const savedWorkletNode = window.AudioWorkletNode;
  window.AudioWorkletNode = class {
    constructor() {
      this.port = { onmessage: null, postMessage() {}, close() {} };
      this.made = clock.frame;
      worklets.push(this);
    }
    connect() {}
    disconnect() {}
  };

  // Calls that act at once, taken to the virtual time
  const proto = AudioScheduledSourceNode.prototype;
  const savedStop = proto.stop;
  const savedDisconnect = AudioNode.prototype.disconnect;
  if (virtual) {
    proto.stop = function (when) {
      return savedStop.call(this, when === undefined ? clock.frame / rate : when);
    };
    // A stopped source left connected sounds the same as one disconnected
    AudioNode.prototype.disconnect = function () {};
  }

  // What the engine does: every note it starts and releases, every voice it
  // steals, and anything it throws
  const notes = [];
  const steals = {};
  const thrown = [];
  const vs = lib.VoiceSynthesizer.prototype;
  const savedOn = vs.noteOn;
  const savedOff = vs.noteOff;
  const restore = installClock(clock);
  try {
    const game = { rps: rpsGame, fm: fmGame, held: heldGame }[o.game](lib, data, o, random);
    const engine = game.engine;
    const trackOf = (voice) => {
      for (const [id, ch] of engine.trackChannels) if (ch.voices.includes(voice)) return id;
      return 'preview';
    };
    vs.noteOn = function (params, t) {
      const entry = { track: trackOf(this), on: t, at: clock.frame, pitch: params.pitch, velocity: params.velocity, ok: false, voice: this };
      notes.push(entry);
      const result = savedOn.call(this, params, t);
      entry.ok = true;
      return result;
    };
    vs.noteOff = function (instrument, t) {
      const n = notes.findLast((x) => x.voice === this && x.ok && x.off === undefined);
      if (n && this.getIsPlaying()) {
        n.off = t;
        n.offAt = clock.frame;
      }
      return savedOff.call(this, instrument, t);
    };
    const savedAvailable = engine.getAvailableVoice;
    engine.getAvailableVoice = function (channel) {
      if (!channel.voices.some((v) => !v.getIsPlaying())) {
        for (const [id, ch] of engine.trackChannels) if (ch === channel) steals[id] = (steals[id] ?? 0) + 1;
      }
      return savedAvailable.call(this, channel);
    };

    await game.initialize();

    // Everything the game does, at the frame it does it
    const playFrame = Math.round((o.playAt * rate) / QUANTUM) * QUANTUM;
    const actions = [{ frame: playFrame, run: () => game.start() }];
    for (const a of o.actions ?? []) {
      actions.push({ frame: playFrame + Math.round((a.at * rate) / QUANTUM) * QUANTUM, run: () => game.act(a) });
    }
    actions.sort((a, b) => a.frame - b.frame);

    const nextFrame = (after) => {
      let next = Infinity;
      for (const a of actions) if (a.frame > after) next = Math.min(next, a.frame);
      for (const w of worklets) if (w.port.onmessage) next = Math.min(next, w.made + tick * (Math.floor((after - w.made) / tick) + 1));
      const due = clock.nextDue();
      if (due < Infinity) next = Math.min(next, Math.max(after + QUANTUM, Math.ceil(due / QUANTUM) * QUANTUM));
      return next;
    };
    // A throw from the engine is recorded and the render goes on, as a
    // browser's would: the throw ends that task, not the music
    const runAt = (frame) => {
      clock.frame = frame;
      const guard = (fn) => {
        try {
          fn();
        } catch (error) {
          thrown.push({ frame, error: String(error) });
        }
      };
      guard(() => clock.fireUpTo(frame));
      for (const w of worklets) {
        if (w.port.onmessage && frame > w.made && (frame - w.made) % tick === 0) guard(() => w.port.onmessage({ data: { type: 'tick' } }));
      }
      for (const a of actions) if (a.frame === frame) guard(a.run);
    };

    let buffer;
    if (virtual) {
      for (let f = actions[0].frame; f < frames; f = nextFrame(f)) runAt(f);
      clock.frame = 0;
      buffer = await offline.startRendering();
    } else {
      const step = (frame) => {
        runAt(frame);
        const next = nextFrame(frame);
        if (next < frames) offline.suspend(next / rate).then(() => step(next));
        offline.resume();
      };
      offline.suspend(actions[0].frame / rate).then(() => step(actions[0].frame));
      buffer = await offline.startRendering();
    }

    const played = {};
    for (const n of notes) if (n.ok) played[n.track] = (played[n.track] ?? 0) + 1;
    return {
      channels: [toBase64(buffer.getChannelData(0)), toBase64(buffer.getChannelData(1))],
      notes: notes.map(({ voice, ...n }) => n),
      played,
      steals,
      thrown,
      playFrame,
      trackNames: game.trackNames(),
      userAgent: navigator.userAgent,
    };
  } finally {
    vs.noteOn = savedOn;
    vs.noteOff = savedOff;
    restore();
    Math.random = nativeRandom;
    window.AudioContext = savedAudioContext;
    window.AudioWorkletNode = savedWorkletNode;
    proto.stop = savedStop;
    AudioNode.prototype.disconnect = savedDisconnect;
  }
}

window.renderSong = renderSong;
window.harnessReady = true;
