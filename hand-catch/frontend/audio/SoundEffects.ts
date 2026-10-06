/**
 * SoundEffects.ts - Procedural Web Audio API Sound Synthesizer
 * Generates all arcade sound effects on-the-fly without any external audio files.
 */

export class SoundEffects {
  public static playCatch(ctx: AudioContext, bus: GainNode, combo: number = 1, handSpeed: number = 0): void {
    const now = ctx.currentTime;
    const semitones = Math.min(combo, 16);
    // Pitch rises with combo streak (Section 37)
    const baseFreq = 440 * Math.pow(2, semitones / 12);

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = combo > 8 ? 'sawtooth' : 'triangle';
    osc.frequency.setValueAtTime(baseFreq * 1.3, now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq, now + 0.035);

    // Fast catch has punchier transient volume
    const peakVolume = Math.min(0.65, 0.42 + (handSpeed / 1200) * 0.2);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(peakVolume, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (handSpeed > 400 ? 0.14 : 0.09));

    osc.connect(gain);
    gain.connect(bus);

    osc.start(now);
    osc.stop(now + 0.15);

    // Extra punch transient on high-velocity swipes
    if (handSpeed > 400) {
      const punchOsc = ctx.createOscillator();
      const punchGain = ctx.createGain();
      punchOsc.type = 'sine';
      punchOsc.frequency.setValueAtTime(140, now);
      punchOsc.frequency.exponentialRampToValueAtTime(45, now + 0.05);

      punchGain.gain.setValueAtTime(0.3, now);
      punchGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

      punchOsc.connect(punchGain);
      punchGain.connect(bus);
      punchOsc.start(now);
      punchOsc.stop(now + 0.06);
    }
  }

  public static playGold(ctx: AudioContext, bus: GainNode): void {
    const now = ctx.currentTime;
    const freqs = [880, 1108.73, 1318.51, 1760]; // Sparkling A major chord + high octave

    freqs.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.025);

      gain.gain.setValueAtTime(0.001, now + idx * 0.025);
      gain.gain.linearRampToValueAtTime(0.36, now + idx * 0.025 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.025 + 0.35);

      osc.connect(gain);
      gain.connect(bus);
      osc.start(now + idx * 0.025);
      osc.stop(now + idx * 0.025 + 0.38);
    });
  }

  public static playHeart(ctx: AudioContext, bus: GainNode): void {
    const now = ctx.currentTime;
    const freqs = [587.33, 880, 1174.66]; // D5 -> A5 -> D6 uplifting chime

    freqs.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.055);

      gain.gain.setValueAtTime(0.001, now + idx * 0.055);
      gain.gain.linearRampToValueAtTime(0.38, now + idx * 0.055 + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.055 + 0.32);

      osc.connect(gain);
      gain.connect(bus);
      osc.start(now + idx * 0.055);
      osc.stop(now + idx * 0.055 + 0.35);
    });
  }

  public static playMultiplier(ctx: AudioContext, bus: GainNode): void {
    const now = ctx.currentTime;
    const notes = [659.25, 830.61, 987.77]; // E major triad
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.035);

      gain.gain.setValueAtTime(0.001, now + idx * 0.035);
      gain.gain.linearRampToValueAtTime(0.4, now + idx * 0.035 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.035 + 0.28);

      osc.connect(gain);
      gain.connect(bus);
      osc.start(now + idx * 0.035);
      osc.stop(now + idx * 0.035 + 0.3);
    });
  }

  public static playFast(ctx: AudioContext, bus: GainNode): void {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(1480, now + 0.08);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.42, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    osc.connect(gain);
    gain.connect(bus);
    osc.start(now);
    osc.stop(now + 0.13);
  }

  public static playComboMilestone(ctx: AudioContext, bus: GainNode, combo: number): void {
    const now = ctx.currentTime;
    const baseFreq = combo >= 20 ? 880 : combo >= 10 ? 659.25 : 523.25;
    // Harmonic fanfare
    const intervals = [1, 1.2599, 1.4983, 2.0];

    intervals.forEach((ratio, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(baseFreq * ratio, now + i * 0.045);

      gain.gain.setValueAtTime(0.001, now + i * 0.045);
      gain.gain.linearRampToValueAtTime(0.42, now + i * 0.045 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.045 + 0.35);

      osc.connect(gain);
      gain.connect(bus);
      osc.start(now + i * 0.045);
      osc.stop(now + i * 0.045 + 0.38);
    });
  }

  public static playMiss(ctx: AudioContext, bus: GainNode): void {
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

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
    gain.connect(bus);

    osc.start(now);
    osc.stop(now + 0.25);

    // Filtered noise thud
    const bufferSize = Math.floor(ctx.sampleRate * 0.12);
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.35));
    }

    const whiteNoise = ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;

    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.setValueAtTime(260, now);
    noiseFilter.Q.setValueAtTime(1.5, now);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.35, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    whiteNoise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(bus);
    whiteNoise.start(now);
  }

  public static playTick(ctx: AudioContext, bus: GainNode, isGo: boolean = false): void {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    if (isGo) {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1046.5, now);
      osc.frequency.exponentialRampToValueAtTime(1318.5, now + 0.15);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.6, now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    } else {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(784, now);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.4, now + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    }

    osc.connect(gain);
    gain.connect(bus);
    osc.start(now);
    osc.stop(now + (isGo ? 0.25 : 0.07));
  }

  public static playGameOver(ctx: AudioContext, bus: GainNode): void {
    const now = ctx.currentTime;
    const notes = [523.25, 466.16, 392.00, 311.13];

    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now + idx * 0.12);

      gain.gain.setValueAtTime(0.001, now + idx * 0.12);
      gain.gain.linearRampToValueAtTime(0.42, now + idx * 0.12 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.12 + 0.45);

      osc.connect(gain);
      gain.connect(bus);
      osc.start(now + idx * 0.12);
      osc.stop(now + idx * 0.12 + 0.48);
    });
  }

  public static playDwellTick(ctx: AudioContext, bus: GainNode): void {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(1200, now);
    osc.frequency.exponentialRampToValueAtTime(800, now + 0.02);

    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.025);

    osc.connect(gain);
    gain.connect(bus);
    osc.start(now);
    osc.stop(now + 0.03);
  }

  public static playDwellTrigger(ctx: AudioContext, bus: GainNode): void {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(1760, now + 0.1);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.45, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    osc.connect(gain);
    gain.connect(bus);
    osc.start(now);
    osc.stop(now + 0.16);
  }
}
