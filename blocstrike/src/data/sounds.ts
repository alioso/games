// 🔊 SOUND EFFECTS, made by the synth (no audio files needed).

import { synth } from '@engine/audio';

export const SFX = {
  throw() {
    synth.noise({ dur: 0.22, freq: 900, to: 3000, q: 1.5, vol: 0.35 });
  },
  hit() {
    synth.tone({ freq: 220, to: 60, dur: 0.25, type: 'square', vol: 0.25 });
    synth.noise({ dur: 0.15, freq: 1800, q: 0.8, vol: 0.3 });
  },
  pop() {
    synth.tone({ freq: 600, to: 120, dur: 0.18, type: 'triangle', vol: 0.3 });
  },
  thunk() {
    synth.tone({ freq: 140, to: 70, dur: 0.12, type: 'triangle', vol: 0.35 });
    synth.noise({ dur: 0.06, freq: 2500, q: 2, vol: 0.15 });
  },
  pickup() {
    synth.tone({ freq: 520, dur: 0.08, type: 'square', vol: 0.12 });
    synth.tone({ freq: 780, dur: 0.1, type: 'square', vol: 0.12, delay: 0.06 });
  },
  dash() {
    synth.noise({ dur: 0.18, freq: 400, to: 1600, q: 2, vol: 0.25 });
  },
  splash() {
    synth.noise({ dur: 0.5, freq: 700, to: 200, q: 0.7, vol: 0.45 });
  },
  chomp() {
    for (let i = 0; i < 6; i++) {
      synth.tone({ freq: 320 + Math.random() * 160, to: 90, dur: 0.07, type: 'square', vol: 0.18, delay: i * 0.11 });
    }
  },
  bunnyHit() {
    // A little squeak.
    synth.tone({ freq: 1400, to: 2100, dur: 0.09, type: 'sine', vol: 0.25 });
    synth.tone({ freq: 1800, to: 1200, dur: 0.12, type: 'sine', vol: 0.2, delay: 0.08 });
  },
  bunnyPoof() {
    synth.noise({ dur: 0.5, freq: 2500, to: 600, q: 0.6, vol: 0.35 });
    [1047, 1319, 1568, 2093].forEach((f, i) => synth.tone({ freq: f, dur: 0.25, type: 'sine', vol: 0.12, delay: 0.1 + i * 0.06 }));
  },
  rocket() {
    synth.noise({ dur: 0.45, freq: 300, to: 1200, q: 0.8, vol: 0.4 });
    synth.tone({ freq: 90, to: 50, dur: 0.2, type: 'square', vol: 0.2 });
  },
  boom(big = false) {
    synth.noise({ dur: big ? 1.1 : 0.8, freq: 500, to: 50, q: 0.4, vol: big ? 0.8 : 0.6 });
    synth.tone({ freq: big ? 90 : 120, to: 30, dur: big ? 0.8 : 0.5, type: 'sine', vol: 0.6 });
  },
  lob() {
    synth.tone({ freq: 300, to: 600, dur: 0.15, type: 'triangle', vol: 0.15 });
  },
  bounce() {
    synth.tone({ freq: 220, to: 180, dur: 0.06, type: 'triangle', vol: 0.15 });
  },
  fizzle() {
    synth.noise({ dur: 0.7, freq: 3000, to: 800, q: 1, vol: 0.25 });
  },
  flame() {
    synth.noise({ dur: 0.12, freq: 700, q: 0.5, vol: 0.18 });
  },
  punch() {
    synth.noise({ dur: 0.08, freq: 1200, to: 400, q: 1, vol: 0.3 });
    synth.tone({ freq: 180, to: 90, dur: 0.1, type: 'square', vol: 0.2 });
  },
  whiff() {
    synth.noise({ dur: 0.1, freq: 2000, to: 3500, q: 2, vol: 0.12 });
  },
  empty() {
    synth.tone({ freq: 160, dur: 0.06, type: 'square', vol: 0.12 });
  },
  buy() {
    [784, 988, 1175, 1568].forEach((f, i) => synth.tone({ freq: f, dur: 0.12, type: 'square', vol: 0.12, delay: i * 0.05 }));
  },
  nope() {
    synth.tone({ freq: 200, to: 150, dur: 0.2, type: 'square', vol: 0.15 });
  },
  revive() {
    [523, 659, 784, 1047].forEach((f, i) => synth.tone({ freq: f, dur: 0.18, type: 'triangle', vol: 0.2, delay: i * 0.07 }));
  },
  double() {
    [392, 523, 659, 784].forEach((f, i) => synth.tone({ freq: f, dur: 0.14, type: 'square', vol: 0.14, delay: i * 0.05 }));
  },
  beep(high = false) {
    synth.tone({ freq: high ? 880 : 440, dur: high ? 0.4 : 0.15, type: 'square', vol: 0.15 });
  },
  win() {
    [523, 659, 784, 1047, 784, 1047].forEach((f, i) => synth.tone({ freq: f, dur: 0.22, type: 'triangle', vol: 0.22, delay: i * 0.12 }));
  },
  lose() {
    [392, 330, 262, 196].forEach((f, i) => synth.tone({ freq: f, dur: 0.3, type: 'triangle', vol: 0.2, delay: i * 0.18 }));
  },
  ui() {
    synth.tone({ freq: 660, dur: 0.05, type: 'square', vol: 0.08 });
  },
};
