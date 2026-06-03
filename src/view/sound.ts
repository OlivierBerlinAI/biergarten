// 🔊 Procedural beer-garden sound engine (Web Audio API).
// No external assets — everything is synthesised, so it works offline.

import type { SfxName } from '../sim/sound.js';
export type { SfxName };

interface ToneOptions {
  freq: number;
  freqEnd?: number;
  type?: OscillatorType;
  dur?: number;
  gain?: number;
  when?: number;
  attack?: number;
  dest?: AudioNode;
}

interface NoiseOptions {
  dur?: number;
  gain?: number;
  type?: BiquadFilterType;
  freq?: number;
  freqEnd?: number;
  q?: number;
  when?: number;
  dest?: AudioNode;
}

interface AmbientNodes {
  out: GainNode;
  murmur: AudioBufferSourceNode;
  voices: AudioBufferSourceNode;
  lfo: OscillatorNode;
}

export class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private muted = false;
  private baseVolume = 0.6;
  private ambient: AmbientNodes | null = null;
  private cachedNoise: AudioBuffer | null = null;

  private readonly sfx: Record<SfxName, () => void> = {
    pour: () => this.sfxPour(),
    sip: () => this.sfxSip(),
    bark: () => this.sfxBark(),
    toilet: () => this.sfxToilet(),
    cheers: () => this.sfxCheers(),
    footstep: () => this.sfxFootstep(),
  };

  // --- public API ----------------------------------------------------------

  /** Call on the first user gesture (click) to start the AudioContext. */
  init(): void {
    if (!this.ctx) {
      const AC: typeof AudioContext | undefined =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return; // no Web Audio support
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.baseVolume;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  /** Play a named effect. No-op if uninitialised or muted. */
  play(name: SfxName): void {
    if (!this.ctx || this.muted) return;
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    this.sfx[name]?.();
  }

  /** Toggle the background ambience. Returns the new state (true = on). */
  ambientToggle(): boolean {
    if (!this.ctx) return false;
    if (this.ambient) {
      this.ambientStop();
      return false;
    }
    this.ambientStart();
    return true;
  }

  /** Mute / unmute. Ambience keeps running but is silenced via the master gain. */
  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master) {
      const t = this.now();
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setValueAtTime(this.master.gain.value, t);
      this.master.gain.linearRampToValueAtTime(this.muted ? 0 : this.baseVolume, t + 0.1);
    }
  }

  isMuted(): boolean {
    return this.muted;
  }

  isAmbientOn(): boolean {
    return this.ambient !== null;
  }

  /** Set the base volume (0..1). */
  setVolume(v: number): void {
    this.baseVolume = Math.max(0, Math.min(1, v));
    if (this.master && !this.muted) this.master.gain.value = this.baseVolume;
  }

  // --- low-level building blocks -------------------------------------------

  private now(): number {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  private noiseBuffer(): AudioBuffer {
    const ctx = this.ctx!;
    if (this.cachedNoise) return this.cachedNoise;
    const len = ctx.sampleRate * 2; // 2s of loopable white noise
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.cachedNoise = buf;
    return buf;
  }

  /** An oscillator "ping" with a soft (click-free) envelope. */
  private tone(opts: ToneOptions): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t = opts.when ?? this.now();
    const dur = opts.dur ?? 0.2;
    const attack = opts.attack ?? 0.008;
    const peak = opts.gain ?? 0.3;

    const osc = ctx.createOscillator();
    osc.type = opts.type ?? 'sine';
    osc.frequency.setValueAtTime(opts.freq, t);
    if (opts.freqEnd != null) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.freqEnd), t + dur);
    }

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    osc.connect(g).connect(opts.dest ?? this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  /** A filtered noise burst with an envelope (hiss / water / footsteps). */
  private noise(opts: NoiseOptions): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t = opts.when ?? this.now();
    const dur = opts.dur ?? 0.3;
    const peak = opts.gain ?? 0.2;

    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer();
    src.loop = true;

    const filt = ctx.createBiquadFilter();
    filt.type = opts.type ?? 'bandpass';
    filt.frequency.setValueAtTime(opts.freq ?? 1000, t);
    if (opts.freqEnd != null) {
      filt.frequency.linearRampToValueAtTime(opts.freqEnd, t + dur);
    }
    if (opts.q != null) filt.Q.value = opts.q;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + Math.min(0.03, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    src.connect(filt).connect(g).connect(opts.dest ?? this.master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  // --- individual effects ---------------------------------------------------

  private sfxPour(): void {
    const t = this.now();
    this.noise({ when: t, dur: 0.9, gain: 0.18, type: 'bandpass', freq: 600, freqEnd: 1400, q: 1.2 });
    for (let i = 0; i < 6; i++) {
      this.tone({
        when: t + 0.1 + i * 0.12,
        type: 'sine',
        freq: 180 + Math.random() * 220 + i * 30,
        dur: 0.08,
        gain: 0.06,
        attack: 0.004,
      });
    }
    this.noise({ when: t + 0.85, dur: 0.5, gain: 0.07, type: 'highpass', freq: 4000 });
  }

  private sfxSip(): void {
    const t = this.now();
    this.tone({ when: t, type: 'sine', freq: 320, freqEnd: 140, dur: 0.18, gain: 0.22 });
    this.tone({ when: t + 0.12, type: 'sine', freq: 260, freqEnd: 110, dur: 0.16, gain: 0.16 });
  }

  private sfxBark(): void {
    const t = this.now();
    const woof = (when: number, base: number): void => {
      this.tone({ when, type: 'sawtooth', freq: base, freqEnd: base * 0.45, dur: 0.16, gain: 0.28, attack: 0.005 });
      this.noise({ when, dur: 0.12, gain: 0.08, type: 'bandpass', freq: 900, q: 0.8 });
    };
    woof(t, 420 + Math.random() * 120);
    if (Math.random() < 0.7) woof(t + 0.22, 360 + Math.random() * 120);
  }

  private sfxToilet(): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t = this.now();
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer();
    src.loop = true;
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.setValueAtTime(800, t);
    filt.frequency.linearRampToValueAtTime(2200, t + 0.6);
    filt.frequency.linearRampToValueAtTime(500, t + 1.6);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + 0.4);
    g.gain.setValueAtTime(0.22, t + 1.0);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
    src.connect(filt).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + 1.9);
    this.tone({ when: t + 1.2, type: 'triangle', freq: 160, freqEnd: 70, dur: 0.6, gain: 0.1 });
  }

  private sfxCheers(): void {
    const t = this.now();
    const base = 1500 + Math.random() * 300;
    this.tone({ when: t, type: 'triangle', freq: base, dur: 0.5, gain: 0.18, attack: 0.003 });
    this.tone({ when: t + 0.005, type: 'triangle', freq: base * 1.01, dur: 0.55, gain: 0.16, attack: 0.003 });
    this.tone({ when: t, type: 'sine', freq: base * 2.7, dur: 0.35, gain: 0.06, attack: 0.002 });
  }

  private sfxFootstep(): void {
    const t = this.now();
    this.noise({ when: t, dur: 0.07, gain: 0.06, type: 'lowpass', freq: 350 });
  }

  // --- ambience -------------------------------------------------------------

  private ambientStart(): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.ambient) return;

    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, this.now());
    out.gain.exponentialRampToValueAtTime(0.12, this.now() + 1.5);
    out.connect(this.master);

    const murmur = ctx.createBufferSource();
    murmur.buffer = this.noiseBuffer();
    murmur.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 700;
    murmur.connect(lp).connect(out);

    const voices = ctx.createBufferSource();
    voices.buffer = this.noiseBuffer();
    voices.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1200;
    bp.Q.value = 4;
    const voicesGain = ctx.createGain();
    voicesGain.gain.value = 0.5;
    voices.connect(bp).connect(voicesGain).connect(out);

    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.13;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 500; // ±500 Hz around 1200 Hz
    lfo.connect(lfoGain).connect(bp.frequency);

    murmur.start();
    voices.start();
    lfo.start();

    this.ambient = { out, murmur, voices, lfo };
  }

  private ambientStop(): void {
    if (!this.ambient) return;
    const a = this.ambient;
    this.ambient = null;
    const t = this.now();
    a.out.gain.cancelScheduledValues(t);
    a.out.gain.setValueAtTime(a.out.gain.value, t);
    a.out.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
    const stopAt = t + 0.9;
    try { a.murmur.stop(stopAt); } catch { /* already stopped */ }
    try { a.voices.stop(stopAt); } catch { /* already stopped */ }
    try { a.lfo.stop(stopAt); } catch { /* already stopped */ }
  }
}
