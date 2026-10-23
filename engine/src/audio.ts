// Tiny WebAudio synth: every sound is generated, so games need no audio files to start.
// Browsers only allow audio after a user gesture; unlock() is called on the first key/click/pad press.

export interface ToneOpts {
  freq: number;
  to?: number;
  dur: number;
  type?: OscillatorType;
  vol?: number;
  delay?: number;
}

export interface NoiseOpts {
  dur: number;
  /** Band-pass centre frequency, optionally sweeping to `to`. */
  freq: number;
  to?: number;
  q?: number;
  vol?: number;
  delay?: number;
}

export class Synth {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private volume = 0.8;

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    try {
      this.ctx = new AudioContext();
    } catch {
      return;
    }
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    const comp = this.ctx.createDynamicsCompressor();
    this.master.connect(comp).connect(this.ctx.destination);
    const len = this.ctx.sampleRate;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  tone(o: ToneOpts) {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t = ctx.currentTime + (o.delay ?? 0);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(o.freq, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + o.dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(o.vol ?? 0.3, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + o.dur + 0.05);
  }

  noise(o: NoiseOpts) {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noiseBuf) return;
    const t = ctx.currentTime + (o.delay ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = o.q ?? 1;
    f.frequency.setValueAtTime(o.freq, t);
    if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t + o.dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(o.vol ?? 0.3, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random());
    src.stop(t + o.dur + 0.05);
  }
}

export const synth = new Synth();

for (const ev of ['keydown', 'pointerdown']) {
  window.addEventListener(ev, () => synth.unlock());
}
window.addEventListener('gamepadconnected', () => synth.unlock());
