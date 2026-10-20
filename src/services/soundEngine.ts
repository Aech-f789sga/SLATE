/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

interface SoundProfile {
  freq: number;
  q: number;
  gain: number;
  type: BiquadFilterType;
}

const SOUND_PROFILES: Record<string, SoundProfile> = {
  ball: { freq: 5200, q: 0.9, gain: 0.1, type: 'bandpass' },
  fountain: { freq: 3000, q: 0.7, gain: 0.08, type: 'bandpass' },
  brush: { freq: 900, q: 0.5, gain: 0.24, type: 'lowpass' },
  pencil: { freq: 3800, q: 0.6, gain: 0.3, type: 'bandpass' },
  crayon: { freq: 1900, q: 0.5, gain: 0.34, type: 'bandpass' },
  marker: { freq: 2700, q: 2.5, gain: 0.2, type: 'bandpass' },
  hl: { freq: 2200, q: 2.0, gain: 0.16, type: 'bandpass' },
  er: { freq: 1000, q: 0.5, gain: 0.24, type: 'bandpass' },
};

class SlateSoundEngine {
  private ctx: AudioContext | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private activeSound: {
    source: AudioBufferSourceNode;
    filter: BiquadFilterNode;
    gain: GainNode;
    profile: SoundProfile;
  } | null = null;
  private idleTimeout: ReturnType<typeof setTimeout> | null = null;
  public enabled: boolean = true;

  private initContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      try {
        this.ctx = new AudioCtx();
        const sampleRate = this.ctx.sampleRate;
        const length = sampleRate * 2;
        this.noiseBuffer = this.ctx.createBuffer(1, length, sampleRate);
        const data = this.noiseBuffer.getChannelData(0);
        for (let i = 0; i < length; i++) {
          data[i] = Math.random() * 2 - 1;
        }
      } catch {
        this.ctx = null;
      }
    }
    return this.ctx;
  }

  public start(toolKey: string): void {
    if (!this.enabled) return;
    const ctx = this.initContext();
    if (!ctx || !this.noiseBuffer) return;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    this.stop(true);

    const key = toolKey.startsWith('pb')
      ? 'crayon'
      : toolKey.startsWith('dd')
        ? 'marker'
        : toolKey.startsWith('cs')
          ? 'ball'
          : toolKey;
    const profile = SOUND_PROFILES[key] || SOUND_PROFILES.ball;

    // Continuous friction noise
    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    source.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = profile.type;
    filter.frequency.value = profile.freq;
    filter.Q.value = profile.q;

    const gain = ctx.createGain();
    gain.gain.value = 0;

    source.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    source.start(0, Math.random() * 1.5);

    this.activeSound = { source, filter, gain, profile };

    // Initial paper tap impulse
    try {
      const tapSource = ctx.createBufferSource();
      tapSource.buffer = this.noiseBuffer;
      const tapFilter = ctx.createBiquadFilter();
      tapFilter.type = 'lowpass';
      tapFilter.frequency.value = 1800;

      const tapGain = ctx.createGain();
      const t = ctx.currentTime;
      tapGain.gain.setValueAtTime(0.12 + profile.gain * 0.3, t);
      tapGain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);

      tapSource.connect(tapFilter);
      tapFilter.connect(tapGain);
      tapGain.connect(ctx.destination);
      tapSource.start(t, Math.random(), 0.06);
    } catch {
      // ignore
    }
  }

  public move(speed: number): void {
    if (!this.activeSound || !this.ctx) return;
    const t = this.ctx.currentTime;
    const sp = Math.min(1, speed / 1.5);
    const { gain, filter, profile } = this.activeSound;

    gain.gain.setTargetAtTime(profile.gain * sp * (0.8 + Math.random() * 0.4), t, 0.02);
    filter.frequency.setTargetAtTime(profile.freq * (0.75 + sp * 0.6), t, 0.03);

    if (this.idleTimeout) clearTimeout(this.idleTimeout);
    this.idleTimeout = setTimeout(() => {
      if (this.activeSound && this.ctx) {
        this.activeSound.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.03);
      }
    }, 70);
  }

  public stop(immediate = false): void {
    if (this.idleTimeout) {
      clearTimeout(this.idleTimeout);
      this.idleTimeout = null;
    }
    if (!this.activeSound || !this.ctx) return;
    const { source, gain } = this.activeSound;
    const t = this.ctx.currentTime;
    gain.gain.setTargetAtTime(0, t, immediate ? 0.005 : 0.04);
    try {
      source.stop(t + (immediate ? 0.05 : 0.3));
    } catch {
      // ignore
    }
    this.activeSound = null;
  }
}

export const soundEngine = new SlateSoundEngine();
