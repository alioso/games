// Every sound in Animal Soccer, synthesised on the shared audio output (plus a few recorded thuds):
//
// - The ball: a leather "pock" on top of a low boot thump, harder kicks louder and deeper with a
//   whoosh after; headers, dribbling taps, bounces, a ringing post, the net's rope swish.
// - The referee's pea whistle: a bright tone with the fast rattle of the pea and a breath of air,
//   in the real patterns (short peep, long start, two for half time, three for full time).
// - The crowd: a murmur of thousands (babbling voices and noise in a big stadium echo) that swells as
//   play gets near a goal, and reacts: "ooh", "yeah!", "aww", boos, applause, a hush before a
//   penalty, and now and then a chant with claps.
// - The animals: each team's own call (quack, oink, woof, meow, squeak, roar, chitter, and the owl
//   referee's hoot), happy when they score, hurt when fouled, sad when they let one in.
//
// Sounds are panned by where they happen relative to the camera. Nothing here plays until the
// first key / click / pad press (browsers need that).
import { synth } from '@engine/audio';

const SAMPLES = ['metalHit', 'punch0', 'punch1', 'punch2', 'punchHeavy0', 'punchHeavy1', 'punchHeavy2', 'soft0', 'soft1', 'select', 'confirm'];

export function initSounds() {
  synth.useSamples(`${import.meta.env.BASE_URL}sfx`, SAMPLES);
}

/** Vowel formants (Hz) for crowd voices. */
const VOWELS = {
  oo: [300, 870, 2240],
  oh: [430, 820, 2600],
  aw: [570, 840, 2410],
  aa: [730, 1090, 2440],
  eh: [530, 1840, 2480],
  ee: [290, 2200, 3000],
} as const;
type Vowel = keyof typeof VOWELS;

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

/** A team's fans: their animal and what they sing. */
export interface Chanter {
  animal: string;
  chant?: [Vowel, Vowel];
}

class SoccerAudio {
  private ctx: AudioContext | null = null;
  /** Ball, whistle and bodies; the crowd; a big stadium echo both feed. */
  private sfx!: GainNode;
  private crowdBus!: GainNode;
  private hall!: GainNode;
  private white!: AudioBuffer;
  private pink!: AudioBuffer;
  private bedGain!: GainNode;
  private bedFilter!: BiquadFilterNode;
  private listenX = 0;
  private babbleT = 0;
  private chantT = 25;
  private excitement = 0;
  private hush = 0;
  /** Recording tap (tools). */
  tap: MediaStreamAudioDestinationNode | null = null;

  /** Build the graph once audio's unlocked; false until then. */
  private ready() {
    if (this.ctx) return true;
    const ctx = synth.context, out = synth.output;
    if (!ctx || !out) return false;
    this.ctx = ctx;
    this.sfx = ctx.createGain();
    this.sfx.gain.value = 0.9;
    this.sfx.connect(out);
    this.crowdBus = ctx.createGain();
    this.crowdBus.gain.value = 1.1;
    this.crowdBus.connect(out);
    this.crowdVoices = ctx.createGain();
    this.crowdVoices.gain.value = 1;
    this.crowdVoices.connect(this.crowdBus);
    // The stadium echo: a long, dark, spacious tail.
    const len = Math.floor(ctx.sampleRate * 2.8);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / ctx.sampleRate;
        lp += ((Math.random() * 2 - 1) - lp) * 0.35;
        d[i] = t < 0.03 ? 0 : lp * Math.pow(1 - i / len, 2.6) * 1.6;
      }
    }
    const conv = ctx.createConvolver();
    conv.buffer = ir;
    this.hall = ctx.createGain();
    this.hall.gain.value = 0.5;
    this.hall.connect(conv).connect(out);
    // Noise: white (sharp things) and pink (crowd, air).
    const n = ctx.sampleRate * 3;
    this.white = ctx.createBuffer(1, n, ctx.sampleRate);
    const w = this.white.getChannelData(0);
    for (let i = 0; i < n; i++) w[i] = Math.random() * 2 - 1;
    this.pink = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const p = this.pink.getChannelData(ch);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0;
      for (let i = 0; i < n; i++) {
        const x = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + x * 0.0555179; b1 = 0.99332 * b1 + x * 0.0750759; b2 = 0.969 * b2 + x * 0.153852;
        b3 = 0.8665 * b3 + x * 0.3104856; b4 = 0.55 * b4 + x * 0.5329522; b5 = -0.7616 * b5 - x * 0.016898;
        p[i] = (b0 + b1 + b2 + b3 + b4 + b5 + x * 0.5362) * 0.11;
      }
    }
    // The crowd's bed: pink noise, filtered like a distant roar, always on.
    const bed = ctx.createBufferSource();
    bed.buffer = this.pink;
    bed.loop = true;
    this.bedFilter = ctx.createBiquadFilter();
    this.bedFilter.type = 'lowpass';
    this.bedFilter.frequency.value = 700;
    this.bedFilter.Q.value = 0.5;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 160;
    this.bedGain = ctx.createGain();
    this.bedGain.gain.value = 0;
    bed.connect(hp).connect(this.bedFilter).connect(this.bedGain);
    this.bedGain.connect(this.crowdBus);
    this.bedGain.connect(this.hall);
    bed.start();
    return true;
  }

  // ---------- building blocks ----------

  private get now() {
    return this.ctx!.currentTime;
  }

  /** A gain with a quick attack and exponential decay, into a destination (and the echo). */
  private env(t: number, peak: number, attack: number, decay: number, dest: AudioNode, echo = 0) {
    const g = this.ctx!.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    g.connect(dest);
    if (echo > 0) {
      const e = this.ctx!.createGain();
      e.gain.value = echo;
      g.connect(e).connect(this.hall);
    }
    return g;
  }

  /** Where on screen (relative to the camera) → stereo, and a little quieter far away. */
  private place(x: number | undefined, dest: AudioNode = this.sfx) {
    const ctx = this.ctx!;
    if (x === undefined) return dest;
    const p = ctx.createStereoPanner();
    const dx = x - this.listenX;
    p.pan.value = Math.max(-0.75, Math.min(0.75, dx / 20));
    const g = ctx.createGain();
    g.gain.value = 1 / (1 + Math.abs(dx) / 35);
    p.connect(g).connect(dest);
    return p;
  }

  private osc(type: OscillatorType, f: number, t: number, dur: number, to?: number) {
    const o = this.ctx!.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    o.start(t);
    o.stop(t + dur + 0.05);
    return o;
  }

  private noise(t: number, dur: number, pink = false) {
    const s = this.ctx!.createBufferSource();
    s.buffer = pink ? this.pink : this.white;
    s.loop = true;
    s.start(t, Math.random() * 2);
    s.stop(t + dur + 0.05);
    return s;
  }

  private filter(type: BiquadFilterType, f: number, q = 1, t?: number, to?: number, dur?: number) {
    const b = this.ctx!.createBiquadFilter();
    b.type = type;
    b.Q.value = q;
    b.frequency.value = f;
    if (t !== undefined && to && dur) {
      b.frequency.setValueAtTime(f, t);
      b.frequency.exponentialRampToValueAtTime(to, t + dur);
    }
    return b;
  }

  /** A low thump: a sine dropping in pitch (feet, bodies, the ball landing). */
  private thump(t: number, from: number, to: number, dur: number, vol: number, dest: AudioNode) {
    this.osc('sine', from, t, dur, to).connect(this.env(t, vol, 0.003, dur, dest));
  }

  /** A burst of filtered noise (clicks, slaps, swishes). */
  private burst(t: number, f: number, q: number, dur: number, vol: number, dest: AudioNode, to?: number, type: BiquadFilterType = 'bandpass', attack = 0.002, echo = 0) {
    this.noise(t, dur + attack).connect(this.filter(type, f, q, t, to, dur)).connect(this.env(t, vol, attack, dur, dest, echo));
  }

  /**
   * A crowd shouting a vowel together: lots of voices at different pitches (all gliding the same
   * way) plus breath, through shared vowel filters (which can morph, e.g. "yeah" = ee → aa).
   */
  private shout(o: { t?: number; vowel: Vowel; to?: Vowel; voices?: number; pitch?: [number, number]; glide?: number; attack?: number; hold?: number; release?: number; vol?: number }) {
    const ctx = this.ctx!;
    const t = o.t ?? this.now;
    const attack = o.attack ?? 0.15, hold = o.hold ?? 0.6, release = o.release ?? 0.8;
    const total = attack + hold + release;
    const mix = ctx.createGain();
    mix.gain.value = 1;
    const [lo, hi] = o.pitch ?? [140, 300];
    const n = o.voices ?? 14;
    for (let i = 0; i < n; i++) {
      const f = rnd(lo, hi);
      const v = this.osc('sawtooth', f, t, total, f * (o.glide ?? 1) * rnd(0.97, 1.03));
      // Each voice wobbles a little and comes in a moment apart.
      const lfo = this.osc('sine', rnd(4, 7), t, total);
      const depth = ctx.createGain();
      depth.gain.value = f * 0.015;
      lfo.connect(depth).connect(v.frequency);
      const g = ctx.createGain();
      const start = t + rnd(0, attack * 0.8);
      g.gain.setValueAtTime(0, t);
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(1 / n, start + attack * 0.6);
      v.connect(g).connect(mix);
    }
    const breath = ctx.createGain();
    breath.gain.value = 0.35;
    this.noise(t, total, true).connect(breath).connect(mix);
    // Vowel filters in parallel, then the shape over time.
    const shape = ctx.createGain();
    shape.gain.setValueAtTime(0, t);
    shape.gain.linearRampToValueAtTime(o.vol ?? 0.5, t + attack);
    shape.gain.setValueAtTime(o.vol ?? 0.5, t + attack + hold);
    shape.gain.exponentialRampToValueAtTime(0.0001, t + total);
    const from = VOWELS[o.vowel], to = VOWELS[o.to ?? o.vowel];
    [1, 0.5, 0.18].forEach((amp, k) => {
      const f = this.filter('bandpass', from[k], 3 + k * 1.5);
      if (o.to) { f.frequency.setValueAtTime(from[k], t + attack * 0.5); f.frequency.linearRampToValueAtTime(to[k], t + attack + hold * 0.8); }
      const a = ctx.createGain();
      a.gain.value = amp * 2.2;
      mix.connect(f).connect(a).connect(shape);
    });
    shape.connect(this.crowdBus);
    const e = ctx.createGain();
    e.gain.value = 0.9;
    shape.connect(e).connect(this.hall);
  }

  /** Hands clapping: many little bursts, thinning out. */
  private applause(t: number, dur: number, vol: number, rate = 45) {
    const count = Math.floor(dur * rate);
    for (let i = 0; i < count; i++) {
      const at = t + Math.pow(Math.random(), 1.6) * dur;
      this.burst(at, rnd(900, 2600), 1.2, rnd(0.008, 0.02), vol * rnd(0.4, 1), this.crowdBus, undefined, 'bandpass', 0.001, 0.6);
    }
  }

  // ---------- the ball ----------

  kick(power: number, x?: number, header = false) {
    if (!this.ready()) return;
    const t = this.now, dest = this.place(x);
    const v = Math.min(1, power / 19);
    if (header) {
      this.thump(t, 230, 110, 0.07, 0.5, dest);
      this.burst(t, 750, 1.5, 0.03, 0.25, dest);
      synth.play(['soft0', 'soft1'], { vol: 0.35, rate: 0.75 });
      return;
    }
    // Boot thump, leather pock, a little click of the laces.
    this.thump(t, 150 + v * 50, 55, 0.09 + v * 0.06, 0.25 + v * 0.7, dest);
    this.burst(t, 1100 + v * 900, 1.6, 0.016 + v * 0.008, 0.2 + v * 0.6, dest, undefined, 'bandpass', 0.001, 0.15);
    this.burst(t, 4200, 0.8, 0.005, 0.12 + v * 0.12, dest, undefined, 'highpass', 0.0005);
    synth.play(['punch0', 'punch1', 'punch2'], { vol: 0.12 + v * 0.18, rate: 0.85 - v * 0.15, jitter: 0.05, wet: 0.1 });
    // A proper strike: a deep whump and the ball whooshing away.
    if (v > 0.55) {
      this.thump(t, 85, 45, 0.22, (v - 0.4) * 0.6, dest);
      this.burst(t + 0.03, 900, 0.9, 0.35, (v - 0.5) * 0.12, dest, 350, 'bandpass', 0.06);
    }
  }

  /** A dribbling tap: a soft thud and a brush of grass. */
  touch(x?: number) {
    if (!this.ready()) return;
    const t = this.now, dest = this.place(x);
    this.thump(t, 125, 70, 0.05, 0.16, dest);
    this.burst(t, 2600, 0.7, 0.045, 0.035, dest, undefined, 'lowpass');
  }

  bounce(speed: number, x?: number) {
    if (!this.ready()) return;
    const t = this.now, dest = this.place(x);
    const v = Math.min(1, speed / 10);
    this.thump(t, 105, 55, 0.08, 0.1 + v * 0.35, dest);
    this.burst(t, 900, 1, 0.02, 0.05 + v * 0.1, dest);
  }

  /** The woodwork: a clang that rings (inharmonic, like a metal tube). */
  post(x?: number) {
    if (!this.ready()) return;
    const t = this.now, dest = this.place(x);
    const f = 480;
    [[1, 1, 1.3], [2.76, 0.5, 0.9], [5.4, 0.28, 0.55], [8.93, 0.14, 0.3]].forEach(([k, a, d]) => {
      this.osc('sine', f * k, t, d).connect(this.env(t, a * 0.35, 0.002, d, dest, 0.3));
    });
    this.thump(t, 160, 70, 0.08, 0.5, dest);
    synth.play('metalHit', { vol: 0.35, rate: 0.8, wet: 0.3 });
    this.ooh(0.15);
  }

  /** The net: a rope swish and a soft bulge. */
  net(speed: number, x?: number) {
    if (!this.ready()) return;
    const t = this.now, dest = this.place(x);
    const v = Math.min(1, speed / 12);
    this.burst(t, 2600, 0.6, 0.4, 0.1 + v * 0.2, dest, 800, 'bandpass', 0.02);
    this.thump(t, 95, 60, 0.12, 0.15 + v * 0.2, dest);
    for (let i = 0; i < 5; i++) this.burst(t + 0.03 + i * 0.045, rnd(1500, 3000), 3, 0.02, 0.04 * v, dest);
  }

  // ---------- bodies ----------

  tackle(won: boolean, x?: number) {
    if (!this.ready()) return;
    const t = this.now, dest = this.place(x);
    this.thump(t, 110, 50, 0.14, 0.4, dest);
    this.burst(t, 1800, 0.6, 0.12, 0.08, dest, 600, 'bandpass', 0.01);
    synth.play(['punchHeavy0', 'punchHeavy1', 'punchHeavy2'], { vol: won ? 0.35 : 0.25, rate: 0.75, jitter: 0.08, wet: 0.15 });
    if (won) this.burst(t + 0.02, 1300, 1.6, 0.02, 0.35, dest);
  }

  /** A keeper: a gloved catch (thwap) or a parry (a pock and the crowd going ooh). */
  save(caught: boolean, x?: number) {
    if (!this.ready()) return;
    const t = this.now, dest = this.place(x);
    if (caught) {
      this.thump(t, 170, 80, 0.07, 0.45, dest);
      this.burst(t, 950, 1.3, 0.05, 0.35, dest);
      synth.play(['soft0', 'soft1'], { vol: 0.4, rate: 0.85 });
    } else {
      this.burst(t, 1300, 1.5, 0.02, 0.45, dest);
      this.thump(t, 140, 70, 0.08, 0.35, dest);
    }
    this.ooh(0.25);
    this.applause(t + 0.6, 1.8, 0.1, 30);
  }

  // ---------- the weather ----------

  private weatherNodes: AudioNode[] = [];
  private pendingWeather: string | null = null;

  /** A steady bed for the weather: rain hissing on the stands, or wind gusting. Silent otherwise. */
  weather(w: string) {
    if (!this.ready()) { this.pendingWeather = w; return; }
    this.pendingWeather = null;
    for (const n of this.weatherNodes) { try { (n as AudioScheduledSourceNode).stop?.(); } catch { /* already stopped */ } n.disconnect(); }
    this.weatherNodes = [];
    const ctx = this.ctx!;
    if (w !== 'rain' && w !== 'windy') return;
    const src = ctx.createBufferSource();
    src.buffer = w === 'rain' ? this.white : this.pink;
    src.loop = true;
    const g = ctx.createGain();
    const nodes: AudioNode[] = [src, g];
    if (w === 'rain') {
      // A soft hiss, with a lower patter.
      const hp = this.filter('highpass', 1800, 0.5), lp = this.filter('lowpass', 7000, 0.5);
      g.gain.value = 0.035;
      src.connect(hp).connect(lp).connect(g);
      nodes.push(hp, lp);
    } else {
      // Wind: low rumble swelling and fading in gusts.
      const lp = this.filter('lowpass', 420, 0.8);
      g.gain.value = 0.11;
      const gust = ctx.createOscillator(), depth = ctx.createGain();
      gust.frequency.value = 0.13;
      depth.gain.value = 0.08;
      gust.connect(depth).connect(g.gain);
      const sweep = ctx.createOscillator(), sd = ctx.createGain();
      sweep.frequency.value = 0.09;
      sd.gain.value = 180;
      sweep.connect(sd).connect(lp.frequency);
      gust.start(); sweep.start();
      src.connect(lp).connect(g);
      nodes.push(lp, gust, depth, sweep, sd);
    }
    g.connect(this.sfx);
    src.start();
    this.weatherNodes = nodes;
  }

  // ---------- the animals ----------

  /** Loudness of the calls being made (lower for each of a crowd's many voices). */
  private callScale = 1;
  /** Where the crowd's animal noises go (the crowd bus, in the stadium echo). */
  private crowdVoices!: GainNode;

  /**
   * One animal call: a buzzy (or pure) tone bending through a pitch contour (points spread evenly
   * over the call), through mouth/nose resonances that can move, plus breath, a fast flutter (a
   * growl's rattle, a chitter) and vibrato as wanted.
   */
  private call(o: {
    t: number; dest: AudioNode; dur: number; vol: number; pitch: number[];
    wave?: OscillatorType; formants?: { f: number[]; q: number; amp?: number }[]; lowpass?: number;
    noise?: number; flutter?: [number, number]; vibrato?: [number, number]; attack?: number;
  }) {
    const ctx = this.ctx!;
    const { t, dur } = o;
    const src = ctx.createOscillator();
    src.type = o.wave ?? 'sawtooth';
    src.frequency.setValueAtTime(o.pitch[0], t);
    const steps = o.pitch.length - 1;
    o.pitch.slice(1).forEach((f, i) => src.frequency.exponentialRampToValueAtTime(f, t + (dur * (i + 1)) / steps));
    if (o.vibrato) {
      const d = ctx.createGain();
      d.gain.value = o.pitch[0] * o.vibrato[1];
      this.osc('sine', o.vibrato[0], t, dur).connect(d).connect(src.frequency);
    }
    src.start(t);
    src.stop(t + dur + 0.05);
    const mix = ctx.createGain();
    src.connect(mix);
    if (o.noise) {
      const n = ctx.createGain();
      n.gain.value = o.noise;
      this.noise(t, dur).connect(n).connect(mix);
    }
    let body: AudioNode = mix;
    if (o.flutter) {
      const am = ctx.createGain();
      am.gain.value = 1 - o.flutter[1] / 2;
      const d = ctx.createGain();
      d.gain.value = o.flutter[1] / 2;
      this.osc('sine', o.flutter[0], t, dur).connect(d).connect(am.gain);
      mix.connect(am);
      body = am;
    }
    const env = ctx.createGain();
    const a = Math.min(o.attack ?? 0.012, dur * 0.4);
    env.gain.setValueAtTime(0.0001, t);
    const vol = o.vol * this.callScale;
    env.gain.exponentialRampToValueAtTime(vol, t + a);
    env.gain.setValueAtTime(vol, t + Math.max(a, dur * 0.65));
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    if (o.formants) {
      for (const fm of o.formants) {
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.Q.value = fm.q;
        bp.frequency.setValueAtTime(fm.f[0], t);
        const n = fm.f.length - 1;
        fm.f.slice(1).forEach((f, i) => bp.frequency.linearRampToValueAtTime(f, t + (dur * (i + 1)) / n));
        const g = ctx.createGain();
        // Narrow filters pass less: make up for it so the call keeps its loudness.
        g.gain.value = (fm.amp ?? 1) * Math.sqrt(fm.q) * 1.3;
        body.connect(bp).connect(g).connect(env);
      }
    } else {
      body.connect(this.filter('lowpass', o.lowpass ?? 4000, 0.7)).connect(env);
    }
    env.connect(o.dest);
    const e = ctx.createGain();
    e.gain.value = 0.25;
    env.connect(e).connect(this.hall);
  }

  /** A player's own noise, in a mood: happy (scored, saved), ouch (fouled), sad (let one in), card (the referee). */
  voice(animal: string, mood: 'happy' | 'sad' | 'ouch' | 'card', x?: number, crowd?: { at: number; vol: number }) {
    if (!this.ready()) return;
    // From the stands (one call each, quieter, many of them), or a player on the pitch.
    const t0 = crowd ? crowd.at : this.now + 0.02, dest = crowd ? this.crowdVoices : this.place(x);
    this.callScale = crowd ? crowd.vol : 1;
    const happy = mood === 'happy', sad = mood === 'sad', ouch = mood === 'ouch';
    // Excited calls come higher and in bunches; sad ones lower, slower and alone.
    const up = (happy ? 1.1 : sad ? 0.8 : 1) * rnd(0.94, 1.06);
    const slow = sad ? 1.7 : 1;
    const rep = (count: number, gap: number, fn: (at: number, i: number) => void) => {
      for (let i = 0; i < count; i++) fn(t0 + i * gap * rnd(0.92, 1.08), i);
    };
    const n = happy && !crowd ? 3 : 1;
    const P = (...fs: number[]) => fs.map((f) => f * up);
    switch (animal) {
      case 'duck':
        if (ouch) { this.call({ t: t0, dest, dur: 0.22, vol: 0.5, pitch: P(650, 820, 420), formants: [{ f: [1300], q: 4 }, { f: [2700], q: 6, amp: 0.5 }], noise: 0.1 }); break; }
        rep(n, 0.19 * slow, (at, i) => this.call({
          t: at, dest, dur: 0.15 * slow, vol: 0.45, pitch: sad ? P(420, 360, 250) : P(500 + i * 25, 420, 320), attack: 0.008, noise: 0.08,
          formants: [{ f: [1150, 850], q: 5 }, { f: [2500], q: 7, amp: 0.6 }, { f: [330], q: 3, amp: 0.4 }],
        }));
        break;
      case 'pig':
        if (ouch) { this.call({ t: t0, dest, dur: 0.4, vol: 0.32, pitch: P(700, 1150, 800), formants: [{ f: [1250], q: 3 }, { f: [2800], q: 6, amp: 0.4 }], noise: 0.1 }); break; }
        rep(n, 0.27 * slow, (at) => this.call({
          t: at, dest, dur: (sad ? 0.5 : 0.21), vol: sad ? 0.65 : 0.5, pitch: sad ? P(180, 150, 100) : P(190, 240, 150), noise: 0.3, flutter: [34, 0.55], attack: 0.01,
          formants: [{ f: [480], q: 4 }, { f: [1050], q: 5, amp: 0.6 }],
        }));
        break;
      case 'dog':
        if (ouch) { this.call({ t: t0, dest, dur: 0.25, vol: 0.27, pitch: P(1000, 1350, 700), formants: [{ f: [1300], q: 3 }, { f: [2600], q: 5, amp: 0.4 }] }); break; }
        if (sad) { this.call({ t: t0, dest, dur: 0.75, vol: 0.3, wave: 'triangle', pitch: P(850, 1050, 700), vibrato: [6, 0.03], lowpass: 2200, attack: 0.08 }); break; }
        rep(n, 0.24, (at) => this.call({
          t: at, dest, dur: 0.16, vol: 0.55, pitch: P(380, 310, 190), attack: 0.006, noise: 0.3,
          formants: [{ f: [700, 480], q: 3 }, { f: [1400], q: 4, amp: 0.5 }],
        }));
        break;
      case 'cat':
        if (ouch) {
          this.burst(t0, 4500, 0.8, 0.3, 0.18, dest);
          this.call({ t: t0 + 0.05, dest, dur: 0.3, vol: 0.3, pitch: P(900, 1300, 1000), formants: [{ f: [1200], q: 3 }, { f: [3000], q: 5, amp: 0.5 }] });
          break;
        }
        rep(happy && !crowd ? 2 : 1, 0.5, (at) => this.call({
          t: at, dest, dur: (happy ? 0.42 : 0.55) * slow, vol: happy ? 0.26 : 0.32, pitch: sad ? P(480, 520, 300) : P(520, 780, 720, 480), attack: 0.03,
          formants: [{ f: [350, 850, 800, 450], q: 4 }, { f: [2600, 1500, 1200, 900], q: 6, amp: 0.7 }],
        }));
        break;
      case 'bunny':
        rep(happy && !crowd ? 3 : 1, 0.13, (at) => this.call({
          t: at, dest, dur: ouch ? 0.18 : sad ? 0.3 : 0.09, vol: 0.3, wave: 'sine', lowpass: 6000, attack: 0.005,
          pitch: ouch ? P(1800, 2400, 1300) : sad ? P(1300, 1000) : P(1400, 1900, 1500),
        }));
        break;
      case 'mouse':
        rep(happy && !crowd ? 4 : 1, 0.09, (at) => this.call({
          t: at, dest, dur: ouch ? 0.14 : sad ? 0.25 : 0.06, vol: 0.36, wave: 'triangle', lowpass: 8000, attack: 0.004,
          pitch: ouch ? P(3200, 4200, 2600) : sad ? P(2600, 2000) : P(2800, 3500, 3000),
        }));
        break;
      case 'bear':
        if (ouch) { this.call({ t: t0, dest, dur: 0.22, vol: 0.75, pitch: P(170, 100), noise: 0.3, flutter: [26, 0.6], formants: [{ f: [450], q: 2.5 }, { f: [1000], q: 3, amp: 0.4 }] }); break; }
        this.call({
          t: t0, dest, dur: (happy ? 0.9 : 1.0) * (sad ? 1.1 : 1), vol: 0.75, pitch: sad ? P(100, 80, 70) : P(110, 155, 95), noise: 0.4, flutter: [30, 0.6], attack: 0.07,
          formants: [{ f: sad ? [380, 330] : [420, 720, 500], q: 2.5 }, { f: [1100], q: 3, amp: 0.5 }],
        });
        break;
      case 'raccoon':
        rep(happy && !crowd ? 2 : 1, 0.45, (at) => this.call({
          t: at, dest, dur: ouch ? 0.25 : sad ? 0.5 : 0.35, vol: sad ? 0.45 : ouch ? 0.27 : 0.21, wave: 'square', flutter: [sad ? 14 : 28, 1],
          pitch: ouch ? P(1500, 2200, 1400) : sad ? P(1000, 780) : P(1300, 1100),
          formants: [{ f: [1600], q: 3 }, { f: [3000], q: 5, amp: 0.4 }],
        }));
        break;
      case 'owl':
        // The referee: hoo-hoo.
        rep(2, 0.38, (at) => this.call({ t: at, dest, dur: 0.28, vol: 0.3, wave: 'sine', pitch: [410, 375], lowpass: 900, noise: 0.04, attack: 0.06 }));
        break;
    }
  }

  // ---------- the referee ----------

  /** The pea whistle. 0 = short peep, 1 = long (kick-off), 2 = half time (two), 3 = full time (three). */
  whistle(long: number) {
    if (!this.ready()) return;
    const blasts = long >= 3 ? [0.28, 0.28, 1.05] : long === 2 ? [0.4, 0.9] : long === 1 ? [0.8] : [0.24];
    let at = this.now;
    for (const len of blasts) {
      this.blast(at, len);
      at += len + 0.13;
    }
  }

  private blast(t: number, len: number) {
    const ctx = this.ctx!;
    const f = rnd(2850, 3050);
    // The tone, warbled fast by the pea rattling around.
    const tone = this.osc('sine', f, t, len);
    tone.frequency.setValueAtTime(f - 60, t);
    tone.frequency.linearRampToValueAtTime(f, t + 0.04);
    const pea = this.osc('sine', rnd(34, 42), t, len);
    const fm = ctx.createGain();
    fm.gain.value = 170;
    pea.connect(fm).connect(tone.frequency);
    const am = ctx.createGain();
    am.gain.value = 0.75;
    const amDepth = ctx.createGain();
    amDepth.gain.value = 0.25;
    pea.connect(amDepth).connect(am.gain);
    const shape = ctx.createGain();
    shape.gain.setValueAtTime(0, t);
    shape.gain.linearRampToValueAtTime(0.24, t + 0.012);
    shape.gain.setValueAtTime(0.24, t + len - 0.04);
    shape.gain.linearRampToValueAtTime(0, t + len);
    tone.connect(am).connect(shape);
    // Breath through the whistle.
    const air = ctx.createGain();
    air.gain.value = 0.05;
    this.noise(t, len).connect(this.filter('bandpass', f, 3)).connect(air).connect(shape);
    shape.connect(this.sfx);
    const e = ctx.createGain();
    e.gain.value = 0.35;
    shape.connect(e).connect(this.hall);
  }

  // ---------- the crowd ----------

  /** Where the camera is (for panning). */
  listen(x: number) {
    this.listenX = x;
  }

  /** "Ooooh!" (a near miss, a save, the post). */
  ooh(delay = 0, vol = 0.5) {
    if (!this.ready()) return;
    this.shout({ t: this.now + delay, vowel: 'oo', to: 'oh', voices: 16, pitch: [150, 320], glide: 0.88, attack: 0.18, hold: 0.55, release: 0.9, vol });
  }

  /** A shot that's gone wide: ooh, then aww. */
  miss() {
    if (!this.ready()) return;
    this.shout({ vowel: 'oo', to: 'aw', voices: 14, pitch: [160, 320], glide: 0.75, attack: 0.15, hold: 0.7, release: 1, vol: 0.45 });
  }

  /** A goal. Ours: an explosion of "YEAH!", a horn, applause, then a chant. Theirs: a groan (and their few fans). */
  goal(ours: boolean) {
    if (!this.ready()) return;
    const t = this.now;
    if (ours) {
      this.shout({ t, vowel: 'ee', to: 'aa', voices: 24, pitch: [180, 380], glide: 1.12, attack: 0.12, hold: 2.2, release: 2, vol: 1.1 });
      this.shout({ t: t + 0.05, vowel: 'aa', voices: 12, pitch: [110, 190], glide: 1.05, attack: 0.15, hold: 2, release: 2, vol: 0.5 });
      this.bedGain.gain.cancelScheduledValues(t);
      this.bedGain.gain.setTargetAtTime(1, t, 0.1);
      this.horn(t + 0.2);
      this.applause(t + 1.5, 3.5, 0.16, 60);
    } else {
      this.shout({ t, vowel: 'aw', to: 'oo', voices: 18, pitch: [120, 260], glide: 0.7, attack: 0.2, hold: 0.8, release: 1.4, vol: 0.5 });
      this.shout({ t: t + 0.1, vowel: 'ee', to: 'aa', voices: 8, pitch: [200, 360], glide: 1.1, attack: 0.15, hold: 1.2, release: 1.2, vol: 0.18 });
      this.applause(t + 0.6, 1.5, 0.05, 20);
    }
  }

  /** A stadium goal horn: a big brassy chord. */
  private horn(t: number) {
    const dest = this.place(undefined);
    const lp = this.filter('lowpass', 1400, 0.7);
    const g = this.env(t, 0.13, 0.05, 1.4, dest, 0.6);
    lp.connect(g);
    for (const f of [233, 294, 349, 466]) {
      for (const d of [-2, 2]) this.osc('sawtooth', f + d, t, 1.5).connect(lp);
    }
  }

  /** A foul: boos (worse for a penalty: a gasp, then a roar of anticipation). */
  foul(penalty: boolean) {
    if (!this.ready()) return;
    if (penalty) {
      this.shout({ vowel: 'oo', to: 'oh', voices: 18, pitch: [160, 330], glide: 0.95, attack: 0.1, hold: 0.6, release: 1, vol: 0.5 });
      this.shout({ t: this.now + 0.6, vowel: 'eh', to: 'aa', voices: 14, pitch: [180, 340], glide: 1.05, attack: 0.3, hold: 0.8, release: 1.2, vol: 0.35 });
    } else this.boo(0.3);
  }

  boo(vol = 0.35) {
    if (!this.ready()) return;
    this.shout({ vowel: 'oo', voices: 16, pitch: [95, 170], glide: 0.94, attack: 0.25, hold: 0.9, release: 0.9, vol });
  }

  /** A card: a big "ooh" (and boos for a red). */
  card(red: boolean) {
    if (!this.ready()) return;
    this.ooh(0.1, red ? 0.6 : 0.4);
    if (red) this.boo(0.4);
  }

  offside() {
    if (!this.ready()) return;
    this.shout({ vowel: 'aw', voices: 10, pitch: [130, 260], glide: 0.8, attack: 0.15, hold: 0.4, release: 0.7, vol: 0.25 });
  }

  /** A chant: clap-clap, clap-clap-clap, and everyone singing "oh-oh-oh". Twice. */
  private chant(t0 = this.now + 0.1) {
    const beat = 0.42;
    const melody: [number, number, number][] = [[0, 0.8, 392], [1, 0.4, 392], [1.5, 0.4, 440], [2, 1.2, 392]];
    for (let rep = 0; rep < 2; rep++) {
      const t = t0 + rep * beat * 8;
      for (const b of [4, 5, 6, 6.5, 7]) this.applause(t + b * beat, 0.05, 0.12, 900);
      for (const [b, d, f] of melody) {
        this.shout({ t: t + b * beat, vowel: 'oh', voices: 12, pitch: [f / 2 * 0.98, f / 2 * 1.02], attack: 0.06, hold: d * beat, release: 0.25, vol: 0.32 });
      }
    }
  }

  /**
   * Every frame: the murmur follows the excitement (louder and brighter as play nears a goal),
   * individual voices babble on top, everyone goes quiet for a penalty, and chants now and then.
   */
  crowd(dt: number, excitement: number, hush = false) {
    if (!this.ready()) return;
    if (this.pendingWeather) this.weather(this.pendingWeather);
    const t = this.now;
    this.excitement += (excitement - this.excitement) * Math.min(1, dt * 2);
    this.hush += ((hush ? 1 : 0) - this.hush) * Math.min(1, dt * 3);
    const e = this.excitement, quiet = 1 - this.hush * 0.8;
    this.bedGain.gain.setTargetAtTime((0.3 + e * 0.45) * quiet, t, 0.3);
    this.bedFilter.frequency.setTargetAtTime(650 + e * 900, t, 0.3);
    // Babble: single voices saying something (a random vowel, a random pitch), more when it's lively.
    this.babbleT -= dt;
    while (this.babbleT <= 0) {
      this.babbleT += 1 / ((7 + e * 16) * quiet);
      this.babble(t + Math.random() * 0.05, 0.6 + e);
    }
    // A chant when things are calm.
    this.chantT -= dt;
    if (this.chantT <= 0) {
      this.chantT = rnd(28, 45);
      if (e < 0.45 && !hush) {
        if (this.teams) this.chantFor(!!this.teams.away && Math.random() < 0.35);
        else this.chant();
      }
    }
  }

  // ---------- the fans' songs ----------

  private teams: { home: Chanter; away: Chanter | null } | null = null;
  /** Told when an end starts singing (so the stadium can make them bounce): which end, how long, when, the beat. */
  onChant: ((away: boolean, secs: number, delay: number, beat: number) => void) | null = null;

  /** Who's in the ground: the home fans, and the away end (none in training). */
  setTeams(home: Chanter, away: Chanter | null) {
    this.teams = { home, away };
    this.chantT = rnd(12, 20);
  }

  /** One end sings: their team's name with claps, a chorus of their animal noise, or the old clap-along. */
  chantFor(away: boolean, delay = 0) {
    const fans = away ? this.teams?.away : this.teams?.home;
    if (!this.ready() || !fans) return;
    this.chantT = rnd(28, 45);
    const t0 = this.now + delay, beat = 0.45;
    const r = Math.random();
    let secs: number;
    if (r < 0.5 && fans.chant) secs = this.nameChant(t0, beat, fans.chant);
    else if (r < 0.88) secs = this.animalChorus(t0, beat, fans.animal);
    else { this.chant(t0); secs = 6.7; }
    this.onChant?.(away, secs, delay, beat);
  }

  /** "BUN-NIES! (clap clap clap)" three times. */
  private nameChant(t0: number, beat: number, [v1, v2]: [Vowel, Vowel]) {
    for (let bar = 0; bar < 3; bar++) {
      const t = t0 + bar * beat * 4;
      this.shout({ t, vowel: v1, voices: 16, pitch: [210, 330], attack: 0.04, hold: 0.16, release: 0.14, vol: 0.5 });
      this.shout({ t: t + beat, vowel: v2, voices: 16, pitch: [170, 270], glide: 0.86, attack: 0.04, hold: 0.32, release: 0.28, vol: 0.5 });
      for (const b of [2, 2.5, 3]) this.applause(t + b * beat, 0.05, 0.14, 900);
    }
    return beat * 12;
  }

  /** A whole end making their animal noise in time: QUACK! QUACK! QUACK! (clap) */
  private animalChorus(t0: number, beat: number, animal: string) {
    const beats = animal === 'bear' ? [0, 2] : [0, 1, 2];
    for (let bar = 0; bar < 3; bar++) {
      const t = t0 + bar * beat * 4;
      for (const b of beats) {
        for (let v = 0; v < 7; v++) this.voice(animal, 'card', undefined, { at: t + b * beat + rnd(-0.03, 0.04), vol: 0.15 });
      }
      this.applause(t + 3 * beat, 0.05, 0.14, 900);
    }
    return beat * 12;
  }

  private babble(t: number, level: number) {
    const ctx = this.ctx!;
    const keys = Object.keys(VOWELS) as Vowel[];
    const v = VOWELS[keys[Math.floor(Math.random() * keys.length)]];
    const f = rnd(110, 280), dur = rnd(0.12, 0.35);
    const o = this.osc('sawtooth', f, t, dur, f * rnd(0.85, 1.15));
    const g = this.env(t, 0.035 * level, 0.03, dur, this.crowdBus, 1.2);
    const f1 = this.filter('bandpass', v[0], 3), f2 = this.filter('bandpass', v[1], 4);
    const p = ctx.createStereoPanner();
    p.pan.value = rnd(-0.9, 0.9);
    o.connect(f1).connect(p);
    o.connect(f2).connect(p);
    p.connect(g);
  }

  // ---------- menus ----------

  ui() {
    synth.play('select', { vol: 0.35 });
  }
  uiConfirm() {
    synth.play('confirm', { vol: 0.45 });
  }

  /** For tools: send everything to a recordable stream too. */
  record() {
    if (!this.ready()) return null;
    if (!this.tap) {
      this.tap = this.ctx!.createMediaStreamDestination();
      synth.output!.connect(this.tap);
    }
    return this.tap.stream;
  }
}

export const SFX = new SoccerAudio();
