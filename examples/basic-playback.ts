/**
 * Basic Playback Example
 *
 * Demonstrates the simplest way to load and play an exported soundscape.
 * This is ideal for playing background music in a game or application.
 */

import { AudioEngine } from '../src/audio/AudioEngine';
import { builtInPresets } from '../src/presets';
import type { SoundscapeState } from '../src/types';

// Type for exported soundscape (without presets)
type ExportedSoundscape = Omit<SoundscapeState, 'presets'>;

class BasicMusicPlayer {
  private engine: AudioEngine;
  private isInitialized = false;

  constructor() {
    this.engine = new AudioEngine();
  }

  /**
   * Initialize the audio engine. Call this once at startup.
   */
  async init(): Promise<void> {
    await this.engine.initialize();
    this.isInitialized = true;
    console.log('Audio engine initialized');
  }

  /**
   * Load a soundscape from a URL.
   * The JSON file should be exported from the Soundscape editor.
   */
  async load(url: string): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('Call init() before loading');
    }

    const response = await fetch(url);
    const data: ExportedSoundscape = await response.json();

    // Add built-in presets since exports don't include them
    const fullState: SoundscapeState = {
      ...data,
      presets: builtInPresets,
    };

    this.engine.updateState(fullState);
    console.log(`Loaded: ${data.metadata.name}`);
  }

  /**
   * Start playback. Must be called after a user interaction.
   */
  async play(): Promise<void> {
    await this.engine.resume();
    this.engine.play();
    console.log('Playing');
  }

  /**
   * Stop playback.
   */
  stop(): void {
    this.engine.stop();
    console.log('Stopped');
  }

  /**
   * Enable or disable looping.
   */
  setLoop(enabled: boolean): void {
    this.engine.setLoop(enabled);
  }

  /**
   * Change the tempo (BPM).
   */
  setTempo(bpm: number): void {
    this.engine.setTempo(bpm);
  }

  /**
   * Subscribe to beat updates for synchronization.
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
// Usage Example
// ============================================

async function main() {
  const player = new BasicMusicPlayer();

  // Initialize the audio engine
  await player.init();

  // Load a soundscape
  await player.load('./sample-soundscape.json');

  // Enable looping
  player.setLoop(true);

  // Optional: Track beats for game synchronization
  player.onBeat((beat) => {
    console.log(`Beat: ${beat}`);
  });

  // Set up play button (audio must start from user interaction)
  const playButton = document.getElementById('play-button');
  playButton?.addEventListener('click', () => player.play());

  // Set up stop button
  const stopButton = document.getElementById('stop-button');
  stopButton?.addEventListener('click', () => player.stop());
}

// Run when DOM is ready
document.addEventListener('DOMContentLoaded', main);

export { BasicMusicPlayer };
