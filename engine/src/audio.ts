// Game audio: recorded samples plus a small synth, all through a shared reverb for some room.
// Browsers only allow audio after a user gesture; unlock() runs on the first key/click/pad press.

export interface ToneOpts {
  freq: number;
  to?: number;
  dur: number;
  type?: OscillatorType;
  vol?: number;
  delay?: number;
  /** 0..1 how much goes to the reverb. */
  wet?: number;
}

export interface NoiseOpts {
  dur: number;
  /** Band-pass centre frequency, optionally sweeping to `to`. */
  freq: number;
  to?: number;
  q?: number;
  vol?: number;
  delay?: number;
  wet?: number;
  /** Attack time in seconds (default very short). */
  attack?: number;
}

export interface PlayOpts {
  vol?: number;
  /** Playback speed / pitch (1 = normal). */
  rate?: number;
  /** Random ± variation added to rate, so repeats don't sound identical. */
  jitter?: number;
  delay?: number;
  wet?: number;
}

export class Synth {
  /** For tests: how many samples are decoded and ready. */
  get loaded() {
    return this.buffers.size;
  }

  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private reverb: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private volume = 0.8;
  private buffers = new Map<string, AudioBuffer>();
  private wanted: { base: string; names: string[] } | null = null;

  /** Register sample files (`<base>/<name>.ogg`); they load once audio is unlocked. */
  useSamples(base: string, names: string[]) {
    this.wanted = { base, names };
    if (this.ctx) this.loadSamples();
  }

  private loadSamples() {
    const ctx = this.ctx;
    if (!ctx || !this.wanted) return;
    const { base, names } = this.wanted;
    for (const n of names) {
      if (this.buffers.has(n)) continue;
      fetch(`${base}/${n}.ogg`)
        .then((r) => r.arrayBuffer())
        .then((a) => ctx.decodeAudioData(a))
        .then((b) => this.buffers.set(n, b))
        .catch(() => {});
    }
  }

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
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    this.master.connect(comp).connect(ctx.destination);

    // A short, bright room: generated impulse response, no files needed.
    const len = Math.floor(ctx.sampleRate * 1.1);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    const conv = ctx.createConvolver();
    conv.buffer = ir;
    this.reverb = ctx.createGain();
    this.reverb.gain.value = 0.35;
    this.reverb.connect(conv).connect(this.master);

    const nlen = ctx.sampleRate;
    this.noiseBuf = ctx.createBuffer(1, nlen, ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < nlen; i++) data[i] = Math.random() * 2 - 1;
    this.loadSamples();
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  /** Dry + reverb outputs for one sound. */
  private out(wet: number) {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.connect(this.master!);
    if (wet > 0 && this.reverb) {
      const w = ctx.createGain();
      w.gain.value = wet;
      g.connect(w).connect(this.reverb);
    }
    return g;
  }

  /** Play a sample; with a list, one is picked at random. Silently skipped if not loaded yet. */
  play(name: string | string[], o: PlayOpts = {}) {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const n = Array.isArray(name) ? name[Math.floor(Math.random() * name.length)] : name;
    const buf = this.buffers.get(n);
    if (!buf) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = (o.rate ?? 1) * (1 + (Math.random() * 2 - 1) * (o.jitter ?? 0.06));
    const g = this.out(o.wet ?? 0.25);
    g.gain.value = o.vol ?? 0.6;
    src.connect(g);
    src.start(ctx.currentTime + (o.delay ?? 0));
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
    osc.connect(g).connect(this.out(o.wet ?? 0.2));
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
    g.gain.linearRampToValueAtTime(o.vol ?? 0.3, t + (o.attack ?? 0.01));
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    src.connect(f).connect(g).connect(this.out(o.wet ?? 0.2));
    src.start(t, Math.random());
    src.stop(t + o.dur + 0.05);
  }
}

export const synth = new Synth();

for (const ev of ['keydown', 'pointerdown']) {
  window.addEventListener(ev, () => synth.unlock());
}
window.addEventListener('gamepadconnected', () => synth.unlock());
