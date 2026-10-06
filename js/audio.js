/**
 * audio.js - Synthesized Web Audio API Sound Engine
 * No audio files required. All sfx and ambient drone are procedurally synthesized.
 * Safely handles autoplay policies, user gesture unlock, and polyphony limiting.
 */
import { GAME_CONFIG } from './config.js';

class AudioManager {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.sfxGain = null;
    this.ambienceGain = null;
    this.isMuted = false;
    this.volume = GAME_CONFIG.defaultVolume;
    this.activeVoices = 0;
    this.maxVoices = 12;

    // Ambience state
    this.ambienceOscs = [];
    this.ambienceFilter = null;
    this.ambienceLfo = null;
    this.isAmbiencePlaying = false;

    // Restore user preferences
    try {
      const savedMute = localStorage.getItem('handCatch.muted');
      if (savedMute !== null) this.isMuted = savedMute === 'true';
      const savedVol = localStorage.getItem('handCatch.volume');
      if (savedVol !== null) this.volume = parseFloat(savedVol) || GAME_CONFIG.defaultVolume;
    } catch (e) {
      console.warn('LocalStorage unavailable for audio settings', e);
    }
  }

  /**
   * Initializes or unlocks the AudioContext on first user gesture.
   */
  async init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) {
        console.warn('Web Audio API is not supported in this browser.');
        return false;
      }
      this.ctx = new AudioCtx();

      // Master output
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : this.volume, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);

      // SFX Bus
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.setValueAtTime(0.85, this.ctx.currentTime);
      this.sfxGain.connect(this.masterGain);

      // Ambience Bus
      this.ambienceGain = this.ctx.createGain();
      this.ambienceGain.gain.setValueAtTime(0, this.ctx.currentTime);
      this.ambienceGain.connect(this.masterGain);
    }

    if (this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch (err) {
        console.warn('Failed to resume AudioContext:', err);
      }
    }

    return true;
  }

  setMuted(muted) {
    this.isMuted = !!muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : this.volume, this.ctx.currentTime);
    }
    try {
      localStorage.setItem('handCatch.muted', this.isMuted ? 'true' : 'false');
    } catch (_) {}
  }

  toggleMute() {
    this.setMuted(!this.isMuted);
    return this.isMuted;
  }

  setVolume(vol) {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.masterGain && this.ctx && !this.isMuted) {
      this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
    }
    try {
      localStorage.setItem('handCatch.volume', this.volume.toString());
    } catch (_) {}
  }

  canPlayVoice() {
    return this.ctx && !this.isMuted && this.activeVoices < this.maxVoices;
  }

  registerVoice(duration) {
    this.activeVoices++;
    setTimeout(() => {
      this.activeVoices = Math.max(0, this.activeVoices - 1);
    }, duration * 1000 + 50);
  }

  /**
   * Catch Sound: Snappy, bright sine/triangle blip with pitch rising per combo semitone.
   */
  playCatch(combo = 1) {
    if (!this.canPlayVoice()) return;
    const now = this.ctx.currentTime;

    // Base A4 (440 Hz), stepped by semitones up to +14 semitones (~1000 Hz)
    const semitones = Math.min(combo, 14);
    const baseFreq = 440 * Math.pow(2, semitones / 12);

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(baseFreq * 1.25, now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq, now + 0.03);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.5, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 0.1);
    this.registerVoice(0.1);
  }

  /**
   * Gold Catch Sound: Shimmering dual harmonic chime
   */
  playGoldCatch() {
    if (!this.canPlayVoice()) return;
    const now = this.ctx.currentTime;
    const freqs = [880, 1108.73, 1318.51]; // A5 major triad

    freqs.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.02);

      gain.gain.setValueAtTime(0.001, now + idx * 0.02);
      gain.gain.linearRampToValueAtTime(0.35, now + idx * 0.02 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.02 + 0.32);

      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(now + idx * 0.02);
      osc.stop(now + idx * 0.02 + 0.35);
    });
    this.registerVoice(0.4);
  }

  /**
   * Heart Catch Sound: Warm uplifting two-tone chime
   */
  playHeartCatch() {
    if (!this.canPlayVoice()) return;
    const now = this.ctx.currentTime;
    const freqs = [587.33, 880]; // D5 -> A5

    freqs.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.06);

      gain.gain.setValueAtTime(0.001, now + idx * 0.06);
      gain.gain.linearRampToValueAtTime(0.4, now + idx * 0.06 + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.06 + 0.3);

      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(now + idx * 0.06);
      osc.stop(now + idx * 0.06 + 0.32);
    });
    this.registerVoice(0.4);
  }

  /**
   * Combo Milestone Sound: Quick 3-note arpeggio chord + shimmer
   */
  playComboMilestone(combo = 5) {
    if (!this.canPlayVoice()) return;
    const now = this.ctx.currentTime;
    const baseFreq = combo >= 10 ? 659.25 : 523.25; // C5 or E5
    const intervals = [1, 1.2599, 1.4983]; // Root, major third, fifth

    intervals.forEach((ratio, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(baseFreq * ratio, now + i * 0.045);

      gain.gain.setValueAtTime(0.001, now + i * 0.045);
      gain.gain.linearRampToValueAtTime(0.4, now + i * 0.045 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.045 + 0.28);

      osc.connect(gain);
      gain.connect(this.sfxGain);

      osc.start(now + i * 0.045);
      osc.stop(now + i * 0.045 + 0.3);
    });
    this.registerVoice(0.45);
  }

  /**
   * Miss Sound: Low square/saw thud with downward sweep + filtered noise burst
   */
  playMiss() {
    if (!this.canPlayVoice()) return;
    const now = this.ctx.currentTime;

    // 1. Tonal downward pitch drop
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(170, now);
    osc.frequency.exponentialRampToValueAtTime(45, now + 0.22);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(600, now);
    filter.frequency.linearRampToValueAtTime(120, now + 0.22);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.5, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 0.25);

    // 2. Synthesized noise impact buffer
    const bufferSize = Math.floor(this.ctx.sampleRate * 0.12);
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.35));
    }

    const whiteNoise = this.ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;

    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.setValueAtTime(260, now);
    noiseFilter.Q.setValueAtTime(1.5, now);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.35, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    whiteNoise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.sfxGain);

    whiteNoise.start(now);
    this.registerVoice(0.25);
  }

  /**
   * Countdown Tick: Crisp click or high chime for GO!
   */
  playTick(isGo = false) {
    if (!this.canPlayVoice()) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    if (isGo) {
      // High triumphant double-beep
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1046.5, now); // C6
      osc.frequency.exponentialRampToValueAtTime(1318.5, now + 0.15); // E6

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.65, now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(now);
      osc.stop(now + 0.25);
      this.registerVoice(0.25);
    } else {
      // Snappy woodblock / digital click
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(784, now); // G5

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.45, now + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(now);
      osc.stop(now + 0.07);
      this.registerVoice(0.07);
    }
  }

  /**
   * Hand Dwell Progress Tick: Subtle click during hand-hover button progress
   */
  playDwellTick() {
    if (!this.canPlayVoice()) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(987.77, now); // B5

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.12, now + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.025);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.03);
  }

  /**
   * Dwell Trigger: Celebratory confirmation click
   */
  playDwellTrigger() {
    if (!this.canPlayVoice()) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(1480, now + 0.08);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.5, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.15);
  }

  /**
   * Game Over: Descending 4-note motif with slow lowpass filter close
   */
  playGameOver() {
    if (!this.canPlayVoice()) return;
    const now = this.ctx.currentTime;
    const notes = [523.25, 466.16, 392.00, 311.13]; // C5, Bb4, G4, Eb4

    notes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now + idx * 0.16);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1200 - idx * 220, now + idx * 0.16);
      filter.frequency.exponentialRampToValueAtTime(180, now + idx * 0.16 + 0.35);

      gain.gain.setValueAtTime(0.001, now + idx * 0.16);
      gain.gain.linearRampToValueAtTime(0.4, now + idx * 0.16 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.16 + 0.36);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.sfxGain);

      osc.start(now + idx * 0.16);
      osc.stop(now + idx * 0.16 + 0.38);
    });
    this.registerVoice(1.0);
  }

  /**
   * Ambience: Low evolving sci-fi pad drone
   */
  startAmbience() {
    if (!this.ctx || this.isAmbiencePlaying) return;
    const now = this.ctx.currentTime;

    // Filter modulated by slow LFO
    this.ambienceFilter = this.ctx.createBiquadFilter();
    this.ambienceFilter.type = 'lowpass';
    this.ambienceFilter.frequency.setValueAtTime(320, now);

    this.ambienceLfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    this.ambienceLfo.frequency.setValueAtTime(0.12, now); // ~8s cycle
    lfoGain.gain.setValueAtTime(110, now);
    this.ambienceLfo.connect(this.ambienceFilter.frequency);

    // 2 Detuned oscillators for rich spatial chorus
    const freqs = [65.41, 65.85]; // Low C2 detuned by 0.4 Hz
    this.ambienceOscs = freqs.map((freq) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now);
      osc.connect(this.ambienceFilter);
      return osc;
    });

    this.ambienceFilter.connect(this.ambienceGain);

    // Fade in ambience smoothly
    this.ambienceGain.gain.setValueAtTime(0, now);
    this.ambienceGain.gain.linearRampToValueAtTime(0.12, now + 2.0);

    this.ambienceOscs.forEach(o => o.start(now));
    this.ambienceLfo.start(now);
    this.isAmbiencePlaying = true;
  }

  stopAmbience(fadeDurationSec = 1.2) {
    if (!this.ctx || !this.isAmbiencePlaying) return;
    const now = this.ctx.currentTime;

    this.ambienceGain.gain.cancelScheduledValues(now);
    this.ambienceGain.gain.setValueAtTime(this.ambienceGain.gain.value, now);
    this.ambienceGain.gain.linearRampToValueAtTime(0.0001, now + fadeDurationSec);

    setTimeout(() => {
      if (this.ambienceOscs) {
        this.ambienceOscs.forEach(o => {
          try { o.stop(); o.disconnect(); } catch (_) {}
        });
        this.ambienceOscs = [];
      }
      if (this.ambienceLfo) {
        try { this.ambienceLfo.stop(); this.ambienceLfo.disconnect(); } catch (_) {}
        this.ambienceLfo = null;
      }
      if (this.ambienceFilter) {
        try { this.ambienceFilter.disconnect(); } catch (_) {}
        this.ambienceFilter = null;
      }
      this.isAmbiencePlaying = false;
    }, fadeDurationSec * 1000 + 50);
  }
}

export const audio = new AudioManager();
