// BB Golf's sounds, made on the fly on the shared audio output: the putter's "tock" (harder =
// louder and brighter), the ball rolling over the carpet (a faint whisper that follows its speed),
// knocks off wooden walls and stumps, the rattle over the cup's lip and the plunk as it drops, a
// little fanfare for holing it (bigger for a hole-in-one), and the countryside: birdsong and a breeze.
import { synth } from '@engine/audio';

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

class GolfAudio {
  private ctx: AudioContext | null = null;
  private out!: GainNode;
  private noiseBuf!: AudioBuffer;
  private rollGain!: GainNode;
  private rollFilter!: BiquadFilterNode;
  private rollHp!: BiquadFilterNode;
  private breeze!: GainNode;
  private birdT = 2;

  private ready() {
    if (this.ctx) return true;
    const ctx = synth.context, master = synth.output;
    if (!ctx || !master) return false;
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 0.9;
    this.out.connect(master);
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    // Pink-ish noise (softer than white).
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.099; b1 = 0.963 * b1 + w * 0.2965; b2 = 0.57 * b2 + w * 1.0527;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
    }
    // The rolling ball: a faint carpet whisper (a band of noise well above any rumble, so it never
    // sounds like wind), whose loudness and brightness follow the ball.
    const roll = this.loop();
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 900;
    this.rollHp = hp;
    this.rollFilter = ctx.createBiquadFilter();
    this.rollFilter.type = 'bandpass';
    this.rollFilter.Q.value = 1.2;
    this.rollFilter.frequency.value = 1800;
    this.rollGain = ctx.createGain();
    this.rollGain.gain.value = 0;
    roll.connect(hp).connect(this.rollFilter).connect(this.rollGain).connect(this.out);
    // A soft breeze, always there.
    const air = this.loop();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 700;
    bp.Q.value = 0.4;
    this.breeze = ctx.createGain();
    this.breeze.gain.value = 0.008;
    air.connect(bp).connect(this.breeze).connect(this.out);
    return true;
  }

  private loop() {
    const s = this.ctx!.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loop = true;
    s.start(0, Math.random());
    return s;
  }

  private get now() {
    return this.ctx!.currentTime;
  }

  /** A tone with a pitch glide and a quick envelope. */
  private tone(type: OscillatorType, f0: number, f1: number, t: number, dur: number, vol: number, attack = 0.003) {
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

  /** A click or knock: a burst of filtered noise. */
  private knock(t: number, f: number, q: number, dur: number, vol: number) {
    const ctx = this.ctx!;
    const s = ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = f;
    bp.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(bp).connect(g).connect(this.out);
    s.start(t, Math.random());
    s.stop(t + dur + 0.05);
  }

  /** The putter meets the ball. power 0..1. */
  putt(power: number) {
    if (!this.ready()) return;
    const t = this.now, v = 0.25 + power * 0.75;
    this.knock(t, 2600 + power * 1400, 4, 0.03, 0.5 * v);
    this.tone('sine', 900 + power * 300, 500, t, 0.05, 0.35 * v);
    this.tone('sine', 220, 120, t, 0.06, 0.25 * v);
  }

  /**
   * The ball knocks against something: a hollow wooden "tock" off planks and stumps, a hard bright
   * "clack" off stone and rocks. Louder and brighter the harder it hits.
   */
  wall(speed: number, what: 'wood' | 'stone' = 'wood') {
    if (!this.ready()) return;
    const t = this.now, v = Math.min(1, speed / 3.5);
    if (v < 0.03) return;
    const k = 0.4 + 0.6 * v;
    if (what === 'stone') {
      this.knock(t, 3200 + v * 1500, 6, 0.025, 0.6 * k);
      this.tone('sine', 1250 + v * 300, 1100, t, 0.035, 0.32 * k);
      this.tone('triangle', 2600, 2400, t, 0.02, 0.12 * k);
      this.knock(t + 0.004, 900, 2, 0.04, 0.2 * k);
    } else {
      // Body of the board, the hollow ring of the box behind it, and the click of the hit.
      this.tone('sine', 240 + v * 90, 150, t, 0.11, 0.55 * k);
      this.tone('triangle', 520 + v * 60, 470, t, 0.06, 0.2 * k);
      this.knock(t, 1400 + v * 800, 4, 0.03, 0.45 * k);
      this.knock(t + 0.01, 420, 3, 0.09, 0.22 * k);
    }
  }

  /** It hopped (over a lip or a bump). */
  bounce(speed: number) {
    if (!this.ready()) return;
    const t = this.now, v = Math.min(1, speed / 3);
    this.tone('sine', 260, 150, t, 0.05, 0.25 * v);
  }

  /** Knocked by something moving (a sail, a bale, a door): a soft, woody thump. */
  thud(speed: number) {
    if (!this.ready()) return;
    const t = this.now, v = Math.min(1, speed / 3);
    this.tone('sine', 180, 90, t, 0.12, 0.45 * v + 0.1);
    this.knock(t, 600, 2, 0.08, 0.25 * v + 0.05);
  }

  /** Into a pipe (a hollow rumble going away) or out of it (a pop). */
  pipe(into: boolean) {
    if (!this.ready()) return;
    const t = this.now;
    if (into) {
      this.tone('sine', 420, 140, t, 0.5, 0.25);
      for (let i = 0; i < 6; i++) this.knock(t + i * 0.08, 500 - i * 40, 5, 0.05, 0.18 - i * 0.025);
    } else {
      this.tone('sine', 300, 700, t, 0.12, 0.35);
      this.knock(t, 1400, 3, 0.04, 0.2);
    }
  }

  /** Off a mushroom: a springy boing. */
  boing(speed: number) {
    if (!this.ready()) return;
    const t = this.now, v = Math.min(1, speed / 3) * 0.7 + 0.3;
    const o = this.ctx!.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(180, t);
    o.frequency.exponentialRampToValueAtTime(520, t + 0.08);
    o.frequency.exponentialRampToValueAtTime(260, t + 0.3);
    const lfo = this.ctx!.createOscillator();
    lfo.frequency.value = 22;
    const lg = this.ctx!.createGain();
    lg.gain.value = 40;
    lfo.connect(lg).connect(o.frequency);
    const g = this.ctx!.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.3 * v, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    o.connect(g).connect(this.out);
    o.start(t); lfo.start(t);
    o.stop(t + 0.4); lfo.stop(t + 0.4);
  }

  /** Round the loop: a rising whizz (and a happy ping if it makes it). */
  loopTrack(made?: boolean) {
    if (!this.ready()) return;
    const t = this.now;
    if (made === undefined) {
      this.tone('sine', 300, 1200, t, 0.5, 0.12, 0.05);
      this.tone('triangle', 450, 1500, t + 0.05, 0.45, 0.05, 0.05);
    } else if (made) {
      this.tone('triangle', 1047, 1047, t, 0.15, 0.12);
      this.tone('triangle', 1568, 1568, t + 0.09, 0.25, 0.12);
    } else this.aww();
  }

  /** Plop into the pond. */
  splash() {
    if (!this.ready()) return;
    const t = this.now;
    this.tone('sine', 900, 200, t, 0.12, 0.3);
    const ctx = this.ctx!;
    const s = ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 0.8;
    bp.frequency.setValueAtTime(2500, t);
    bp.frequency.exponentialRampToValueAtTime(500, t + 0.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    s.connect(bp).connect(g).connect(this.out);
    s.start(t, Math.random());
    s.stop(t + 0.7);
    this.aww();
  }

  /** Rattling over the cup without dropping. */
  lip() {
    if (!this.ready()) return;
    const t = this.now;
    for (let i = 0; i < 3; i++) this.knock(t + i * 0.05, 2400 + i * 300, 8, 0.03, 0.3 - i * 0.07);
    this.tone('triangle', 780, 700, t, 0.08, 0.12);
  }

  /**
   * In! A plastic clonk, a rattle round the bottom, then a jingle: a little "ding-ding" for any ball
   * that drops, a happy run up for par or better, a full fanfare for a hole-in-one.
   */
  cup(how: 'ace' | 'good' | 'ok') {
    if (!this.ready()) return;
    const t = this.now;
    this.tone('sine', 620, 420, t, 0.09, 0.45);
    this.knock(t, 1800, 6, 0.05, 0.35);
    for (let i = 0; i < 5; i++) this.knock(t + 0.1 + i * 0.045 * (1 + i * 0.3), 1500 - i * 80, 9, 0.025, 0.22 - i * 0.03);
    this.tone('sine', 300, 180, t + 0.32, 0.12, 0.35);
    const notes = how === 'ace' ? [523, 659, 784, 1047, 784, 1047, 1319] : how === 'good' ? [523, 659, 784, 1047] : [784, 1047];
    notes.forEach((f, i) => {
      this.tone('triangle', f, f, t + 0.55 + i * 0.11, 0.2 + (i === notes.length - 1 ? 0.5 : 0), 0.16);
      this.tone('sine', f * 2, f * 2, t + 0.55 + i * 0.11, 0.12, 0.05);
    });
  }

  /** A sad little slide down (gave up, or a terrible shot). */
  aww() {
    if (!this.ready()) return;
    const t = this.now;
    this.tone('triangle', 520, 330, t, 0.5, 0.14, 0.05);
    this.tone('triangle', 390, 250, t + 0.25, 0.6, 0.1, 0.05);
  }

  /** A whoosh for a big swing. */
  swoosh(power: number) {
    if (!this.ready() || power < 0.45) return;
    const ctx = this.ctx!, t = this.now;
    const s = ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.5;
    bp.frequency.setValueAtTime(600, t);
    bp.frequency.exponentialRampToValueAtTime(2400, t + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.18 * power, t + 0.06);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    s.connect(bp).connect(g).connect(this.out);
    s.start(t, Math.random());
    s.stop(t + 0.2);
  }

  /** A hero's voice: a few gibberish syllables, happy (rising) or grumpy (falling). */
  voice(pitch: number, happy: boolean) {
    if (!this.ready()) return;
    const t = this.now;
    const n = happy ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const f = pitch * (happy ? 1 + i * 0.15 : 1 - i * 0.12) * rnd(0.95, 1.05);
      this.tone('sawtooth', f, f * (happy ? 1.2 : 0.8), t + i * 0.13, 0.1, 0.05, 0.01);
      this.tone('square', f * 2, f * 2 * (happy ? 1.1 : 0.85), t + i * 0.13, 0.08, 0.015, 0.01);
    }
  }

  private boardRun = 0;
  private sandT = 0;

  /**
   * Every frame: the ball's rolling sound for what it's on. Grass carpet hardly makes a sound; over
   * a plank bridge it rumbles and clicks across every gap between boards; in sand it hisses and
   * crunches; round the loop the track whirrs. Birds sing now and then.
   */
  update(dt: number, rollSpeed: number, on: 'carpet' | 'wood' | 'sand' | 'loop' = 'carpet') {
    if (!this.ready()) return;
    const t = this.now;
    const v = Math.min(1, rollSpeed / 4);
    const moving = v > 0.02;
    const gain = !moving ? 0 : on === 'carpet' ? 0.004 + v * 0.01 : on === 'wood' ? 0.05 + v * 0.14 : on === 'sand' ? 0.04 + v * 0.1 : 0.06 + v * 0.16;
    const freq = on === 'wood' ? 380 + v * 300 : on === 'sand' ? 3800 : on === 'loop' ? 700 + v * 900 : 1400 + v * 1600;
    this.rollGain.gain.setTargetAtTime(gain, t, 0.04);
    this.rollFilter.frequency.setTargetAtTime(freq, t, 0.04);
    this.rollFilter.Q.setTargetAtTime(on === 'loop' ? 4 : on === 'wood' ? 1.5 : 1.2, t, 0.05);
    this.rollHp.frequency.setTargetAtTime(on === 'wood' ? 120 : on === 'loop' ? 300 : 900, t, 0.05);
    if (moving && on === 'wood') {
      // A click at every board edge (they're 20 cm wide).
      this.boardRun += rollSpeed * dt;
      while (this.boardRun > 0.2) {
        this.boardRun -= 0.2;
        this.knock(t + Math.random() * 0.01, 1000 + v * 600, 5, 0.02, 0.1 + v * 0.25);
        this.tone('sine', 180, 120, t, 0.04, 0.06 + v * 0.12);
      }
    }
    if (moving && on === 'sand') {
      // Grains crunching.
      this.sandT -= dt;
      if (this.sandT <= 0) {
        this.sandT = 0.02 + Math.random() * 0.05;
        this.knock(t, 4000 + Math.random() * 3000, 3, 0.012, 0.04 + v * 0.1);
      }
    }
    this.birdT -= dt;
    if (this.birdT <= 0) {
      this.birdT = rnd(2.5, 7);
      this.bird();
    }
  }

  /** A little bird: a few quick chirps or a trill. */
  private bird() {
    const t = this.now + 0.05;
    const base = rnd(2600, 4200);
    const n = Math.floor(rnd(2, 6));
    const trill = Math.random() < 0.4;
    for (let i = 0; i < n; i++) {
      const at = t + i * (trill ? 0.05 : rnd(0.12, 0.2));
      this.tone('sine', base * rnd(0.9, 1.1), base * rnd(1.15, 1.4), at, trill ? 0.035 : 0.06, 0.035, 0.005);
    }
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

export const SFX = new GolfAudio();
