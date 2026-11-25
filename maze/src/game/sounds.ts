// A Maze In's sounds, made on the fly: footsteps crunching on the gravel (softer when you creep), an
// evening of crickets and a breeze round the hedges, the ruby's hum (louder the nearer you are: a
// warmer/colder clue), the magic when you take it and the wand waking up, and a fanfare at the way out.
import { synth } from '@engine/audio';
import type { Theme } from '../data/mazes';

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

class MazeAudio {
  private ctx: AudioContext | null = null;
  private out!: GainNode;
  private noise!: AudioBuffer;
  private hum!: GainNode;
  private cricketT = 1;
  private buzzG!: GainNode;
  private theme: Theme = 'bushes';
  private ambT = 3;

  /** Which maze we're in (the evening sounds, footsteps, how the walls move). */
  setTheme(t: Theme) {
    this.theme = t;
  }

  private ready() {
    if (this.ctx) return true;
    const ctx = synth.context, master = synth.output;
    if (!ctx || !master) return false;
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 0.9;
    this.out.connect(master);
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // A breeze in the hedges.
    const air = ctx.createBufferSource();
    air.buffer = this.noise;
    air.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 500;
    bp.Q.value = 0.5;
    const ag = ctx.createGain();
    ag.gain.value = 0.012;
    air.connect(bp).connect(ag).connect(this.out);
    air.start();
    // The ruby's hum: two close tones beating slowly.
    this.hum = ctx.createGain();
    this.hum.gain.value = 0;
    for (const f of [220, 221.5, 330]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      o.connect(this.hum);
      o.start();
    }
    this.hum.connect(this.out);
    // Wasps: a buzzing saw, wobbling, as loud as you are near.
    this.buzzG = ctx.createGain();
    this.buzzG.gain.value = 0;
    const bz = ctx.createOscillator();
    bz.type = 'sawtooth';
    bz.frequency.value = 210;
    const wob = ctx.createOscillator();
    wob.frequency.value = 9;
    const wg = ctx.createGain();
    wg.gain.value = 25;
    wob.connect(wg).connect(bz.frequency);
    const bf = ctx.createBiquadFilter();
    bf.type = 'bandpass';
    bf.frequency.value = 900;
    bf.Q.value = 1.5;
    bz.connect(bf).connect(this.buzzG).connect(this.out);
    bz.start();
    wob.start();
    return true;
  }

  private get now() {
    return this.ctx!.currentTime;
  }

  private tone(type: OscillatorType, f0: number, f1: number, t: number, dur: number, vol: number, attack = 0.005) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + dur);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + attack + dur + 0.05);
  }

  private hiss(t: number, f: number, q: number, dur: number, vol: number) {
    const ctx = this.ctx!;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = f;
    bp.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(bp).connect(g).connect(this.out);
    s.start(t, Math.random());
    s.stop(t + dur + 0.05);
  }

  /** A footstep: crunch on gravel, a click on cobbles, a tap echoing off castle stone (quiet when creeping). */
  step(soft: boolean) {
    if (!this.ready()) return;
    const t = this.now, v = soft ? 0.05 : 0.16;
    if (this.theme === 'bushes') {
      this.hiss(t, rnd(1800, 2600), 1.2, 0.07, v);
      this.hiss(t + 0.012, rnd(3500, 5000), 2, 0.04, v * 0.6);
    } else {
      this.tone('sine', rnd(180, 230), 90, t, 0.05, v * 0.9, 0.002);
      this.hiss(t, rnd(2400, 3400), 3, 0.035, v * 0.7);
      if (this.theme === 'castle') { this.tone('sine', 200, 100, t + 0.11, 0.05, v * 0.25, 0.002); this.hiss(t + 0.11, 2800, 3, 0.03, v * 0.2); }
    }
  }

  /** Every frame: crickets now and then, and the ruby's hum by how near it is (0..1). */
  update(dt: number, rubyNear: number) {
    if (!this.ready()) return;
    this.hum.gain.setTargetAtTime(0.05 * rubyNear * rubyNear, this.now, 0.3);
    this.cricketT -= dt;
    if (this.cricketT <= 0 && this.theme !== 'castle') {
      this.cricketT = rnd(0.6, 2.5) * (this.theme === 'city' ? 2.5 : 1);
      const t = this.now, f = rnd(4200, 5200), n = Math.floor(rnd(3, 7));
      for (let i = 0; i < n; i++) this.tone('sine', f, f * 1.02, t + i * 0.055, 0.025, 0.012, 0.004);
    }
    // The town: pigeons cooing, a dog far off, the church bell now and then. The castle: water
    // dripping, the wind gusting round the battlements, an owl.
    this.ambT -= dt;
    if (this.ambT <= 0 && this.theme !== 'bushes') {
      this.ambT = rnd(2.5, 6);
      const t = this.now, r = Math.random();
      if (this.theme === 'city') {
        if (r < 0.5) for (let i = 0; i < 3; i++) this.tone('sine', 420, 340, t + i * 0.32, 0.22, 0.025, 0.05);
        else if (r < 0.75) for (let i = 0; i < 2; i++) { this.tone('sawtooth', 300, 200, t + i * 0.25, 0.1, 0.012, 0.01); this.hiss(t + i * 0.25, 900, 2, 0.08, 0.01); }
        else for (let i = 0; i < 3; i++) { for (const f of [392, 784, 1176, 470]) this.tone('sine', f, f, t + i * 1.1, 2.2, 0.018, 0.005); }
      } else {
        if (r < 0.45) { const f = rnd(1200, 1800); this.tone('sine', f, f * 0.5, t, 0.08, 0.04, 0.002); this.tone('sine', f * 1.1, f * 0.6, t + 0.3, 0.06, 0.012, 0.002); }
        else if (r < 0.8) this.wind(t);
        else { this.tone('sine', 380, 340, t, 0.35, 0.03, 0.08); this.tone('sine', 400, 330, t + 0.55, 0.6, 0.03, 0.08); }
      }
    }
  }

  /** A gust of wind (castle). */
  private wind(t: number) {
    const ctx = this.ctx!;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 3;
    bp.frequency.setValueAtTime(300, t);
    bp.frequency.linearRampToValueAtTime(700, t + 1.2);
    bp.frequency.linearRampToValueAtTime(250, t + 2.6);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05, t + 1.0);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.8);
    s.connect(bp).connect(g).connect(this.out);
    s.start(t, Math.random());
    s.stop(t + 2.9);
  }

  /**
   * A trap's noise (vol 0..1 by how near it is): spikes rattling then SHING; a dragon drawing breath
   * then the WHOOSH of fire; a pot whistling down then smashing; a trapdoor creaking, then crashing
   * open; the clang of falling down a manhole.
   */
  trap(kind: string, vol: number) {
    if (!this.ready()) return;
    const t = this.now, v = vol;
    switch (kind) {
      case 'rattle':
        for (let i = 0; i < 5; i++) this.hiss(t + i * 0.05, 5000, 4, 0.03, 0.05 * v);
        break;
      case 'shing':
        this.tone('sawtooth', 2400, 1800, t, 0.25, 0.04 * v, 0.002);
        this.hiss(t, 6500, 2, 0.2, 0.12 * v);
        this.tone('sine', 120, 60, t, 0.1, 0.15 * v, 0.002);
        break;
      case 'hiss':
        this.hiss(t, 1800, 0.8, 0.6, 0.05 * v);
        this.tone('sine', 90, 140, t, 0.6, 0.06 * v, 0.3);
        break;
      case 'whoosh': {
        const ctx = this.ctx!;
        const s = ctx.createBufferSource();
        s.buffer = this.noise;
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(400, t);
        lp.frequency.exponentialRampToValueAtTime(2200, t + 0.15);
        lp.frequency.exponentialRampToValueAtTime(600, t + 1.2);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.3 * v, t + 0.08);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
        s.connect(lp).connect(g).connect(this.out);
        s.start(t, Math.random());
        s.stop(t + 1.4);
        for (let i = 0; i < 8; i++) this.hiss(t + 0.1 + i * 0.13, rnd(1500, 4000), 3, 0.04, 0.05 * v);
        break;
      }
      case 'whistle':
        this.tone('sine', 1800, 700, t, 0.32, 0.035 * v, 0.02);
        break;
      case 'smash':
        this.tone('sine', 160, 60, t, 0.12, 0.25 * v, 0.002);
        for (let i = 0; i < 6; i++) this.hiss(t + i * 0.03 + Math.random() * 0.02, rnd(2500, 6000), 4, 0.08, 0.12 * v);
        for (let i = 0; i < 4; i++) this.tone('triangle', rnd(1800, 3200), rnd(1500, 2800), t + 0.05 + i * 0.05, 0.08, 0.03 * v, 0.002);
        break;
      case 'creak':
        this.tone('sawtooth', 180, 240, t, 0.35, 0.03 * v, 0.05);
        this.tone('sawtooth', 260, 190, t + 0.3, 0.3, 0.02 * v, 0.05);
        break;
      case 'trapdoor':
        this.tone('sawtooth', 300, 120, t, 0.2, 0.05 * v, 0.01);
        this.tone('sine', 110, 40, t + 0.1, 0.4, 0.3 * v, 0.005);
        this.hiss(t + 0.1, 400, 1, 0.3, 0.2 * v);
        break;
      case 'clang':
        for (const f of [420, 610, 890]) this.tone('triangle', f, f * 0.98, t + 0.25, 0.6, 0.06 * v, 0.002);
        this.tone('sine', 900, 300, t, 0.25, 0.03 * v, 0.01);
        break;
    }
  }

  private moanT = 4;
  private beatT = 0;

  /** The monster's ring tingling as it notices you: a shimmering run of bells. */
  tingle() {
    if (!this.ready()) return;
    const t = this.now;
    for (let i = 0; i < 12; i++) {
      const f = 1800 + Math.sin(i * 1.7) * 500 + i * 60;
      this.tone('sine', f, f * 1.01, t + i * 0.055, 0.25, 0.05, 0.003);
      this.tone('sine', f * 2.01, f * 2.02, t + i * 0.055, 0.15, 0.015, 0.003);
    }
    this.tone('sine', 110, 90, t, 0.8, 0.12, 0.1);
  }

  /** Vanishing in a puff. */
  poof() {
    if (!this.ready()) return;
    const t = this.now;
    this.hiss(t, 900, 0.6, 0.6, 0.35);
    this.tone('sine', 300, 80, t, 0.5, 0.15);
  }

  /**
   * The monster nearby: now and then a low ghostly moan if it's somewhere near (it's out there...);
   * while it's after you, a heartbeat that quickens as it closes in, and its ring's faint tinkle.
   */
  monster(dist: number, hunting: boolean, dt: number) {
    if (!this.ready()) return;
    const t = this.now;
    this.moanT -= dt;
    if (!hunting && dist < 16 && this.moanT <= 0) {
      this.moanT = rnd(5, 10);
      const v = 0.12 * (1 - dist / 16);
      const f = rnd(140, 180);
      const ctx = this.ctx!;
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(f, t);
      o.frequency.linearRampToValueAtTime(f * 0.7, t + 1.6);
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 5;
      const lg = ctx.createGain();
      lg.gain.value = 6;
      lfo.connect(lg).connect(o.frequency);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 600;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(v, t + 0.5);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
      o.connect(lp).connect(g).connect(this.out);
      o.start(t); lfo.start(t);
      o.stop(t + 1.9); lfo.stop(t + 1.9);
    }
    if (hunting) {
      this.beatT -= dt;
      if (this.beatT <= 0) {
        const near = Math.max(0, 1 - dist / 12);
        this.beatT = 0.75 - near * 0.4;
        this.tone('sine', 70, 45, t, 0.12, 0.25 + near * 0.25, 0.005);
        this.tone('sine', 65, 42, t + 0.16, 0.1, 0.18 + near * 0.2, 0.005);
        if (Math.random() < 0.5) this.tone('sine', 2400 + Math.random() * 600, 2400, t, 0.12, 0.015 * (0.4 + near), 0.003);
      }
    }
  }

  // ---------- the fight ----------

  /** FIGHT! A whoosh and a sting of brass. */
  fightStart() {
    if (!this.ready()) return;
    const t = this.now;
    this.hiss(t, 1200, 0.7, 0.4, 0.3);
    [220, 277, 330, 440].forEach((f, i) => this.tone('sawtooth', f, f, t + 0.1 + i * 0.05, 0.35, 0.05, 0.01));
    this.tone('sine', 80, 50, t, 0.5, 0.3);
  }

  jump() {
    if (!this.ready()) return;
    this.tone('sine', 300, 600, this.now, 0.12, 0.06);
  }

  /** The stick or wand going through the air. */
  swish() {
    if (!this.ready()) return;
    const t = this.now;
    const ctx = this.ctx!, s = ctx.createBufferSource();
    s.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.4;
    bp.frequency.setValueAtTime(700, t);
    bp.frequency.exponentialRampToValueAtTime(2600, t + 0.1);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    s.connect(bp).connect(g).connect(this.out);
    s.start(t, Math.random());
    s.stop(t + 0.2);
  }

  /** Stick or wand meets monster: a dry wooden whack, or a crackling magic one. */
  whack(magic: boolean) {
    if (!this.ready()) return;
    const t = this.now;
    this.tone('sine', 260, 120, t, 0.1, 0.35);
    this.hiss(t, 1600, 2, 0.06, 0.3);
    if (magic) { this.tone('square', 1400, 2400, t, 0.12, 0.04); this.hiss(t + 0.02, 5000, 1, 0.2, 0.1); }
  }

  /** A bolt (or a big blast) leaving the wand. */
  zap(big: boolean) {
    if (!this.ready()) return;
    const t = this.now;
    this.tone('sawtooth', big ? 300 : 900, big ? 1200 : 2400, t, big ? 0.35 : 0.15, big ? 0.1 : 0.06);
    this.tone('sine', big ? 600 : 1800, big ? 200 : 900, t, big ? 0.4 : 0.15, 0.08);
  }

  zapHit(big: boolean) {
    if (!this.ready()) return;
    const t = this.now;
    this.hiss(t, big ? 800 : 3000, 0.6, big ? 0.7 : 0.25, big ? 0.45 : 0.2);
    this.tone('sine', big ? 120 : 500, big ? 40 : 200, t, big ? 0.6 : 0.15, big ? 0.4 : 0.15);
  }

  /** The plain stick trying to do magic. */
  fizzle() {
    if (!this.ready()) return;
    const t = this.now;
    this.hiss(t, 2500, 1, 0.3, 0.06);
    this.tone('sine', 500, 250, t + 0.05, 0.3, 0.05);
  }

  /** The monster hit: a papery thump and a screech. */
  monsterHurt() {
    if (!this.ready()) return;
    const t = this.now;
    this.tone('sawtooth', 700, 400, t, 0.18, 0.06);
    this.tone('square', 1400, 900, t, 0.1, 0.02);
    this.hiss(t, 900, 1.5, 0.12, 0.15);
  }

  block() {
    if (!this.ready()) return;
    const t = this.now;
    this.tone('triangle', 1500, 1400, t, 0.15, 0.1);
    this.hiss(t, 3000, 3, 0.06, 0.15);
  }

  /** The warning before an attack. */
  tell(kind: string) {
    if (!this.ready()) return;
    const t = this.now;
    if (kind === 'ring') this.tingle();
    else if (kind === 'swipe') this.tone('sawtooth', 200, 320, t, 0.4, 0.05, 0.05);
    else if (kind === 'slam') this.tone('sine', 100, 300, t, 0.7, 0.15, 0.1);
    else { this.tone('sine', 400, 900, t, 0.7, 0.08, 0.2); this.tone('sine', 403, 905, t, 0.7, 0.06, 0.2); }
  }

  ringThrow() {
    if (!this.ready()) return;
    const t = this.now;
    for (let i = 0; i < 6; i++) this.tone('sine', 2200 + i * 150, 2200 + i * 150, t + i * 0.06, 0.08, 0.04);
    this.hiss(t, 2000, 2, 0.3, 0.08);
  }

  claw() {
    if (!this.ready()) return;
    this.swish();
    this.tone('sawtooth', 500, 200, this.now, 0.2, 0.05);
  }

  slam() {
    if (!this.ready()) return;
    const t = this.now;
    this.tone('sine', 90, 35, t, 0.5, 0.5);
    this.hiss(t, 400, 0.7, 0.4, 0.4);
  }

  orbs() {
    if (!this.ready()) return;
    const t = this.now;
    for (let i = 0; i < 3; i++) this.tone('sine', 300, 180, t + i * 0.55, 0.3, 0.1);
  }

  /** It's beaten: a long dissolving screech. */
  monsterDie() {
    if (!this.ready()) return;
    const t = this.now;
    this.tone('sawtooth', 900, 120, t, 1.2, 0.1);
    this.tone('square', 1800, 200, t, 1.0, 0.03);
    this.hiss(t + 0.2, 1500, 0.5, 1.2, 0.3);
    [523, 659, 784, 1047].forEach((f, i) => this.tone('triangle', f, f, t + 1.0 + i * 0.12, 0.3 + (i === 3 ? 0.5 : 0), 0.12));
  }

  /** The wasps' buzz, by how near the nearest nest is (0..1). */
  buzz(near: number) {
    if (!this.ready()) return;
    this.buzzG.gain.setTargetAtTime(0.06 * near * near, this.now, 0.15);
  }

  /** A boot in the mud (or pulling free of sticky honey). */
  squelch(sticky = false) {
    if (!this.ready()) return;
    const t = this.now;
    if (sticky) {
      this.tone('sine', 220, 480, t, 0.16, 0.12, 0.03);
      this.hiss(t + 0.1, 1400, 3, 0.06, 0.06);
      return;
    }
    this.tone('sine', 140, 60, t, 0.12, 0.2, 0.01);
    this.hiss(t, 700, 2, 0.1, 0.1);
  }

  /** Ouch! A yelp in the hero's voice, and a thump. */
  ouch(pitch: number) {
    if (!this.ready()) return;
    const t = this.now;
    this.tone('sawtooth', pitch * 1.5, pitch * 0.8, t, 0.22, 0.08, 0.01);
    this.tone('square', pitch * 3, pitch * 1.6, t, 0.18, 0.02, 0.01);
    this.tone('sine', 120, 60, t, 0.15, 0.3);
  }

  /** Out of hearts: a sad fall. */
  fail() {
    if (!this.ready()) return;
    const t = this.now;
    [392, 370, 349, 262].forEach((f, i) => this.tone('triangle', f, f * (i === 3 ? 0.8 : 1), t + 0.3 + i * 0.3, 0.3 + (i === 3 ? 0.6 : 0), 0.12, 0.02));
  }

  /** Someone talking: gibberish syllables in their voice. */
  mumble(pitch: number, length: number) {
    if (!this.ready()) return;
    const t = this.now, n = Math.min(10, 3 + Math.floor(length / 10));
    for (let i = 0; i < n; i++) {
      const f = pitch * rnd(0.85, 1.25);
      this.tone('square', f, f * rnd(0.85, 1.15), t + i * 0.09, 0.06, 0.025, 0.01);
    }
  }

  /** Right answer: a bright little "ta-da"; wrong: a dull "bwomp". */
  right() {
    if (!this.ready()) return;
    const t = this.now;
    [659, 784, 1047].forEach((f, i) => this.tone('triangle', f, f, t + i * 0.09, 0.2 + (i === 2 ? 0.4 : 0), 0.12));
  }

  wrong() {
    if (!this.ready()) return;
    const t = this.now;
    this.tone('sawtooth', 220, 180, t, 0.25, 0.08);
    this.tone('sawtooth', 165, 120, t + 0.28, 0.45, 0.08);
  }

  /** The ruby rises and bursts. */
  rubyRise() {
    if (!this.ready()) return;
    const t = this.now;
    this.tone('sine', 300, 1200, t, 1.2, 0.12, 0.3);
    this.tone('triangle', 450, 1800, t + 0.1, 1.1, 0.06, 0.3);
    [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone('sine', f * 2, f * 2, t + 0.2 + i * 0.15, 0.4, 0.05));
  }

  rubyBurst() {
    if (!this.ready()) return;
    const t = this.now;
    this.hiss(t, 3000, 0.5, 0.8, 0.25);
    this.tone('sine', 1600, 400, t, 0.5, 0.2);
  }

  /** The light pours into the wand and it wakes: a rising run and a chord. */
  wandAwake() {
    if (!this.ready()) return;
    const t = this.now;
    [392, 494, 587, 784, 988, 1175].forEach((f, i) => this.tone('triangle', f, f, t + i * 0.07, 0.25, 0.1));
    for (const f of [784, 988, 1175, 1568]) this.tone('sine', f, f, t + 0.45, 1.4, 0.07, 0.05);
    this.hiss(t + 0.4, 6000, 1, 0.6, 0.06);
  }

  /** The maze shifts: a deep rumble, and leaves rustling as the hedges move (or stones grinding). */
  rumble() {
    if (!this.ready()) return;
    const ctx = this.ctx!, t = this.now;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 160;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.6, t + 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
    s.connect(lp).connect(g).connect(this.out);
    s.start(t);
    s.stop(t + 2.3);
    this.tone('sine', 55, 40, t, 2, 0.25, 0.2);
    // Leaves rustling (hedges), or stone grinding on stone.
    if (this.theme === 'bushes') for (let i = 0; i < 14; i++) this.hiss(t + 0.2 + i * 0.12 + Math.random() * 0.05, rnd(2500, 5000), 1.5, 0.12, 0.05);
    else for (let i = 0; i < 22; i++) this.hiss(t + 0.15 + i * 0.08 + Math.random() * 0.04, rnd(300, 900), 4, 0.1, 0.12);
  }

  /** Out with the ruby! */
  fanfare() {
    if (!this.ready()) return;
    const t = this.now;
    [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => {
      this.tone('triangle', f, f, t + i * 0.13, 0.22 + (i === 6 ? 0.7 : 0), 0.14);
      this.tone('sine', f / 2, f / 2, t + i * 0.13, 0.2, 0.06);
    });
  }

  // ---------- heaven ----------

  private musT = 0;
  private musStep = 0;
  /** In heaven: crickets and the rest hush, a soft harp plays round and round. */
  heavenMusic(on: boolean) {
    this.heavenOn = on;
    this.musStep = 0;
    this.musT = 0;
  }
  private heavenOn = false;

  /** Each frame in heaven: schedule the next harp notes a little ahead. */
  heavenUpdate() {
    if (!this.ready() || !this.heavenOn) return;
    const now = this.now;
    if (this.musT < now) this.musT = now + 0.1;
    // F · Dm · B♭ · C, each a bar of eight harp notes, with a bell tune on top every other time round.
    const CHORDS = [[349, 440, 523, 698], [294, 349, 440, 587], [233, 294, 349, 466], [262, 330, 392, 523]];
    const TUNE = [880, 0, 784, 698, 0, 0, 659, 0, 587, 0, 698, 0, 0, 0, 0, 0, 698, 0, 784, 880, 0, 0, 1047, 0, 932, 0, 880, 0, 784, 0, 0, 0];
    const beat = 0.3;
    while (this.musT < now + 0.4) {
      const st = this.musStep, bar = Math.floor(st / 8) % 4, ch = CHORDS[bar], i = st % 8;
      const f = ch[[0, 1, 2, 3, 2, 1, 2, 3][i]] * (i >= 3 && i <= 5 ? 1 : 1);
      this.tone('triangle', f, f, this.musT, 0.9, 0.035, 0.01);
      this.tone('sine', f * 2, f * 2, this.musT, 0.5, 0.012, 0.01);
      if (i === 0) { this.tone('sine', ch[0] / 2, ch[0] / 2, this.musT, 2.3, 0.05, 0.2); this.tone('sine', ch[2] / 2, ch[2] / 2, this.musT, 2.3, 0.025, 0.3); }
      const round = Math.floor(st / 32);
      const m = TUNE[st % 32];
      if (round % 2 === 1 && m) { this.tone('sine', m, m, this.musT, 0.8, 0.05, 0.01); this.tone('sine', m * 3, m * 3, this.musT, 0.25, 0.008, 0.005); }
      this.musT += beat;
      this.musStep++;
    }
  }

  /** A good long slurp of noodles (vol by how near). */
  slurp(vol = 1) {
    if (!this.ready()) return;
    const t = this.now, n = 7 + Math.floor(Math.random() * 5);
    for (let i = 0; i < n; i++) this.hiss(t + i * 0.045, 700 + i * 160 + rnd(-60, 60), 5, 0.05, 0.06 * vol);
    this.tone('sine', 300, 520, t, n * 0.045, 0.02 * vol, 0.02);
  }

  /** Chopsticks on a bowl. */
  clink(vol = 1) {
    if (!this.ready()) return;
    const t = this.now, f = rnd(2200, 2900);
    this.tone('sine', f, f, t, 0.18, 0.03 * vol, 0.001);
    this.tone('sine', f * 1.5, f * 1.5, t, 0.1, 0.012 * vol, 0.001);
  }

  /** Everyone at the table: hooray! */
  hooray() {
    if (!this.ready()) return;
    const t = this.now;
    for (let i = 0; i < 9; i++) {
      const p = rnd(260, 620), d = rnd(0.35, 0.6), s = t + rnd(0, 0.25);
      this.tone('sawtooth', p * 0.9, p * 1.35, s, d * 0.5, 0.012, 0.03);
      this.tone('sawtooth', p * 1.35, p * 1.1, s + d * 0.5, d * 0.5, 0.012, 0.01);
    }
    [523, 659, 784, 1047].forEach((f, i) => this.tone('triangle', f, f, t + 0.1 + i * 0.1, 0.5, 0.08));
  }

  /** A soft choir "aah" (the gates open). */
  aah() {
    if (!this.ready()) return;
    const t = this.now;
    for (const f of [349, 440, 523, 698]) for (const d of [-1.5, 1.5]) this.tone('sine', f + d, f + d, t, 3.2, 0.03, 1.2);
  }

  ui() {
    if (!this.ready()) return;
    this.tone('triangle', 660, 700, this.now, 0.05, 0.08);
  }

  uiConfirm() {
    if (!this.ready()) return;
    const t = this.now;
    this.tone('triangle', 660, 660, t, 0.06, 0.1);
    this.tone('triangle', 990, 990, t + 0.07, 0.1, 0.1);
  }
}

export const SFX = new MazeAudio();
