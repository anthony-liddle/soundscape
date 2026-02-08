/**
 * Adaptive Game Music Example
 *
 * A complete game music manager that responds to game events.
 * Demonstrates tempo changes, track muting, and sound effects.
 */

import { AudioEngine } from '../src/audio/AudioEngine';
import { builtInPresets } from '../src/presets';
import type { SoundscapeState, TrackMixerState } from '../src/types';

// ============================================
// Types
// ============================================

type GameState = 'explore' | 'combat' | 'boss' | 'victory' | 'gameover';

interface MusicLayer {
  trackId: string;
  enabledStates: GameState[];
}

// ============================================
// Game Music Manager
// ============================================

class GameMusicManager {
  private engine: AudioEngine;
  private baseState: SoundscapeState | null = null;
  private currentGameState: GameState = 'explore';
  private layers: MusicLayer[] = [];

  constructor() {
    this.engine = new AudioEngine();
  }

  /**
   * Initialize the music manager.
   */
  async init(): Promise<void> {
    await this.engine.initialize();
    console.log('[Music] Initialized');
  }

  /**
   * Load the base music from a soundscape file.
   */
  async loadMusic(url: string): Promise<void> {
    const response = await fetch(url);
    const data = await response.json();

    this.baseState = {
      ...data,
      presets: builtInPresets,
    };

    this.engine.updateState(this.baseState);
    this.engine.setLoop(true);

    // Define which tracks play in which game states
    // Customize this based on your track names
    this.layers = [
      { trackId: 'bass-track', enabledStates: ['explore', 'combat', 'boss'] },
      { trackId: 'lead-track', enabledStates: ['combat', 'boss', 'victory'] },
      { trackId: 'pad-track', enabledStates: ['explore', 'victory'] },
    ];

    console.log('[Music] Loaded:', data.metadata.name);
  }

  /**
   * Start playback. Call after user interaction.
   */
  async play(): Promise<void> {
    await this.engine.resume();
    this.engine.play();
    this.applyGameState(this.currentGameState);
    console.log('[Music] Playing');
  }

  /**
   * Stop playback.
   */
  stop(): void {
    this.engine.stop();
    console.log('[Music] Stopped');
  }

  /**
   * Change the game state and update music accordingly.
   */
  setGameState(state: GameState): void {
    if (state === this.currentGameState) return;

    console.log(`[Music] Game state: ${this.currentGameState} -> ${state}`);
    this.currentGameState = state;
    this.applyGameState(state);
  }

  /**
   * Apply music changes for a game state.
   */
  private applyGameState(state: GameState): void {
    if (!this.baseState) return;

    // Adjust tempo based on state
    const tempos: Record<GameState, number> = {
      explore: 90,
      combat: 130,
      boss: 150,
      victory: 100,
      gameover: 70,
    };
    this.engine.setTempo(tempos[state]);

    // Mute/unmute tracks based on state
    const newMixerTracks: Record<string, TrackMixerState> = {};

    for (const layer of this.layers) {
      const shouldPlay = layer.enabledStates.includes(state);
      const existingState = this.baseState.mixer.tracks[layer.trackId];

      if (existingState) {
        newMixerTracks[layer.trackId] = {
          ...existingState,
          mute: !shouldPlay,
        };
      }
    }

    // Update engine with new mixer state
    this.engine.updateState({
      ...this.baseState,
      mixer: {
        ...this.baseState.mixer,
        tracks: {
          ...this.baseState.mixer.tracks,
          ...newMixerTracks,
        },
      },
    });
  }

  /**
   * Play a one-shot sound effect.
   * Uses note preview to play sounds without affecting the composition.
   */
  playSoundEffect(type: 'collect' | 'hit' | 'jump' | 'powerup'): void {
    const effects: Record<string, { pitch: number; preset: string; velocity: number }> = {
      collect: { pitch: 84, preset: 'keys', velocity: 100 },
      hit: { pitch: 36, preset: 'percussion', velocity: 120 },
      jump: { pitch: 72, preset: 'pluck', velocity: 90 },
      powerup: { pitch: 60, preset: 'lead', velocity: 100 },
    };

    const effect = effects[type];
    if (effect) {
      this.engine.previewNote(effect.pitch, effect.velocity, effect.preset);
    }
  }

  /**
   * Play a musical note for item collection or achievements.
   * Creates a pleasing ascending arpeggio effect.
   */
  playCollectSequence(count: number = 1): void {
    const baseNotes = [60, 64, 67, 72, 76]; // C major arpeggio
    const noteIndex = Math.min(count - 1, baseNotes.length - 1);
    this.engine.previewNote(baseNotes[noteIndex], 100, 'keys');
  }

  /**
   * Fade master volume (useful for scene transitions).
   */
  setMasterVolume(volume: number): void {
    if (!this.baseState) return;

    this.engine.updateState({
      ...this.baseState,
      mixer: {
        ...this.baseState.mixer,
        masterVolume: Math.max(0, Math.min(1, volume)),
      },
    });
  }

  /**
   * Subscribe to beat updates for game synchronization.
   */
  onBeat(callback: (beat: number) => void): void {
    this.engine.onBeatUpdate(callback);
  }

  /**
   * Clean up resources.
   */
  destroy(): void {
    this.engine.destroy();
  }
}

// ============================================
// Usage Example - Simple Game Integration
// ============================================

async function main() {
  const music = new GameMusicManager();

  // Initialize
  await music.init();
  await music.loadMusic('./sample-soundscape.json');

  // Track beats for visual effects
  music.onBeat((beat) => {
    // Pulse UI elements on beat
    document.body.style.opacity = beat % 1 < 0.1 ? '0.95' : '1';
  });

  // Start music on first click
  document.addEventListener('click', () => music.play(), { once: true });

  // Keyboard controls for demo
  document.addEventListener('keydown', (e) => {
    switch (e.key) {
      case '1':
        music.setGameState('explore');
        break;
      case '2':
        music.setGameState('combat');
        break;
      case '3':
        music.setGameState('boss');
        break;
      case '4':
        music.setGameState('victory');
        break;
      case '5':
        music.setGameState('gameover');
        break;
      case 'c':
        music.playSoundEffect('collect');
        break;
      case 'h':
        music.playSoundEffect('hit');
        break;
      case 'j':
        music.playSoundEffect('jump');
        break;
      case 'p':
        music.playSoundEffect('powerup');
        break;
      case ' ':
        music.stop();
        break;
    }
  });

  console.log('Controls:');
  console.log('  1-5: Change game state (explore/combat/boss/victory/gameover)');
  console.log('  c/h/j/p: Sound effects (collect/hit/jump/powerup)');
  console.log('  Space: Stop music');
  console.log('  Click anywhere to start');
}

document.addEventListener('DOMContentLoaded', main);

export { GameMusicManager };
