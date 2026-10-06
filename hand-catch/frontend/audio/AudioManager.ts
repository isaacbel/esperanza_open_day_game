/**
 * AudioManager.ts - Web Audio API Life-Cycle Manager & Ambience Engine
 * Manages audio graph, polyphony limits, autoplay unlock, and ambient space drone.
 */
import { SoundEffects } from './SoundEffects';

export class AudioManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private ambienceGain: GainNode | null = null;

  public isMuted: boolean = false;
  public volume: number = 0.75;
  private activeVoices: number = 0;
  private maxVoices: number = 12;

  // Ambience oscillators
  private ambienceOscs: OscillatorNode[] = [];
  private ambienceFilter: BiquadFilterNode | null = null;
  private ambienceLfo: OscillatorNode | null = null;
  private isAmbiencePlaying: boolean = false;

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        const savedMute = localStorage.getItem('handCatch.muted');
        if (savedMute !== null) this.isMuted = savedMute === 'true' || savedMute === '1';
        const savedVol = localStorage.getItem('handCatch.volume');
        if (savedVol !== null) this.volume = parseFloat(savedVol) || 0.75;
      } catch (_) {}
    }
  }

  public async init(): Promise<boolean> {
    if (typeof window === 'undefined') return false;

    if (!this.ctx) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return false;

      this.ctx = new AudioCtx();

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : this.volume, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.setValueAtTime(0.85, this.ctx.currentTime);
      this.sfxGain.connect(this.masterGain);

      this.ambienceGain = this.ctx.createGain();
      this.ambienceGain.gain.setValueAtTime(0, this.ctx.currentTime);
      this.ambienceGain.connect(this.masterGain);
    }

    if (this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch (e) {
        console.warn('Failed to resume AudioContext:', e);
      }
    }

    return true;
  }

  public setMuted(muted: boolean): void {
    this.isMuted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : this.volume, this.ctx.currentTime);
    }
    try {
      localStorage.setItem('handCatch.muted', this.isMuted ? 'true' : 'false');
    } catch (_) {}
  }

  public toggleMute(): boolean {
    this.setMuted(!this.isMuted);
    return this.isMuted;
  }

  public setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.masterGain && this.ctx && !this.isMuted) {
      this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
    }
    try {
      localStorage.setItem('handCatch.volume', this.volume.toString());
    } catch (_) {}
  }

  private canPlay(): boolean {
    return !!this.ctx && !this.isMuted && this.activeVoices < this.maxVoices;
  }

  private registerVoice(durationSec: number): void {
    this.activeVoices++;
    setTimeout(() => {
      this.activeVoices = Math.max(0, this.activeVoices - 1);
    }, durationSec * 1000 + 40);
  }

  public playCatch(combo: number = 1, handSpeed: number = 0): void {
    if (!this.canPlay() || !this.ctx || !this.sfxGain) return;
    SoundEffects.playCatch(this.ctx, this.sfxGain, combo, handSpeed);
    this.registerVoice(0.12);
  }

  public playGold(): void {
    if (!this.canPlay() || !this.ctx || !this.sfxGain) return;
    SoundEffects.playGold(this.ctx, this.sfxGain);
    this.registerVoice(0.35);
  }

  public playHeart(): void {
    if (!this.canPlay() || !this.ctx || !this.sfxGain) return;
    SoundEffects.playHeart(this.ctx, this.sfxGain);
    this.registerVoice(0.35);
  }

  public playMultiplier(): void {
    if (!this.canPlay() || !this.ctx || !this.sfxGain) return;
    SoundEffects.playMultiplier(this.ctx, this.sfxGain);
    this.registerVoice(0.3);
  }

  public playFast(): void {
    if (!this.canPlay() || !this.ctx || !this.sfxGain) return;
    SoundEffects.playFast(this.ctx, this.sfxGain);
    this.registerVoice(0.15);
  }

  public playComboMilestone(combo: number): void {
    if (!this.canPlay() || !this.ctx || !this.sfxGain) return;
    SoundEffects.playComboMilestone(this.ctx, this.sfxGain, combo);
    this.registerVoice(0.35);
  }

  public playMiss(): void {
    if (!this.canPlay() || !this.ctx || !this.sfxGain) return;
    SoundEffects.playMiss(this.ctx, this.sfxGain);
    this.registerVoice(0.25);
  }

  public playTick(isGo: boolean = false): void {
    if (!this.canPlay() || !this.ctx || !this.sfxGain) return;
    SoundEffects.playTick(this.ctx, this.sfxGain, isGo);
    this.registerVoice(0.2);
  }

  public playGameOver(): void {
    if (!this.canPlay() || !this.ctx || !this.sfxGain) return;
    SoundEffects.playGameOver(this.ctx, this.sfxGain);
    this.registerVoice(1.0);
  }

  public playDwellTick(): void {
    if (!this.canPlay() || !this.ctx || !this.sfxGain) return;
    SoundEffects.playDwellTick(this.ctx, this.sfxGain);
  }

  public playDwellTrigger(): void {
    if (!this.canPlay() || !this.ctx || !this.sfxGain) return;
    SoundEffects.playDwellTrigger(this.ctx, this.sfxGain);
  }

  public startAmbience(): void {
    if (!this.ctx || this.isAmbiencePlaying || !this.ambienceGain) return;
    const now = this.ctx.currentTime;

    this.ambienceFilter = this.ctx.createBiquadFilter();
    this.ambienceFilter.type = 'lowpass';
    this.ambienceFilter.frequency.setValueAtTime(320, now);

    this.ambienceLfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    this.ambienceLfo.frequency.setValueAtTime(0.12, now);
    lfoGain.gain.setValueAtTime(110, now);
    this.ambienceLfo.connect(this.ambienceFilter.frequency);

    const freqs = [65.41, 65.85]; // Low C2 detuned pair
    this.ambienceOscs = freqs.map(freq => {
      const osc = this.ctx!.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now);
      osc.connect(this.ambienceFilter!);
      return osc;
    });

    this.ambienceFilter.connect(this.ambienceGain);

    this.ambienceGain.gain.setValueAtTime(0, now);
    this.ambienceGain.gain.linearRampToValueAtTime(0.12, now + 2.0);

    this.ambienceOscs.forEach(o => o.start(now));
    this.ambienceLfo.start(now);
    this.isAmbiencePlaying = true;
  }

  public stopAmbience(fadeDurationSec: number = 1.0): void {
    if (!this.ctx || !this.isAmbiencePlaying || !this.ambienceGain) return;
    const now = this.ctx.currentTime;

    this.ambienceGain.gain.cancelScheduledValues(now);
    this.ambienceGain.gain.setValueAtTime(this.ambienceGain.gain.value, now);
    this.ambienceGain.gain.linearRampToValueAtTime(0.0001, now + fadeDurationSec);

    setTimeout(() => {
      this.ambienceOscs.forEach(o => {
        try { o.stop(); o.disconnect(); } catch (_) {}
      });
      this.ambienceOscs = [];
      if (this.ambienceLfo) {
        try { this.ambienceLfo.stop(); this.ambienceLfo.disconnect(); } catch (_) {}
        this.ambienceLfo = null;
      }
      if (this.ambienceFilter) {
        try { this.ambienceFilter.disconnect(); } catch (_) {}
        this.ambienceFilter = null;
      }
      this.isAmbiencePlaying = false;
    }, fadeDurationSec * 1000 + 40);
  }
}

export const audio = new AudioManager();
