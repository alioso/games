// 🔊 SOUND EFFECTS. Recorded samples (Kenney, CC0 — see public/sfx/LICENSE-kenney.txt) mixed with a little synth.
// To change a sound, swap the sample name or tweak vol / rate (pitch).

import { synth } from '@engine/audio';

const S = (base: string, n: number) => Array.from({ length: n }, (_, i) => `${base}${i}`);

synth.useSamples(`${import.meta.env.BASE_URL}sfx`, [
  ...S('punchHeavy', 3), ...S('punch', 3), ...S('wood', 3), ...S('metalLight', 3), ...S('boom', 3), ...S('soft', 3), ...S('step', 3),
  'woodBreak', 'rockBreak', 'rockBreak2', 'metalHit', 'drop', 'boomLow', 'thruster', 'flame', 'slime', 'shield',
  'slice', 'slice2', 'chop', 'coins', 'coins2', 'latch', 'metalClick', 'creak', 'draw',
  'select', 'click', 'error', 'confirm', 'tick', 'pluck', 'uiDrop',
  'powerUp', 'powerUp2', 'pep', 'pep2', 'threeUp', 'lowDown', 'phaserDown', 'phaseJump',
]);

/** Air whoosh: filtered noise sweeping up, with a soft attack. */
const whoosh = (vol = 0.25, from = 500, to = 2200, dur = 0.22) =>
  synth.noise({ dur, freq: from, to, q: 1.2, vol, attack: dur * 0.4, wet: 0.15 });

export const SFX = {
  throw() {
    whoosh(0.28, 600, 2600, 0.2);
    synth.play(S('step', 3), { vol: 0.25, rate: 1.4 });
  },
  hit() {
    synth.play(S('punchHeavy', 3), { vol: 0.8 });
    synth.play(S('soft', 3), { vol: 0.5, rate: 0.8 });
  },
  thunk() {
    synth.play(S('wood', 3), { vol: 0.7 });
  },
  pickup() {
    synth.play('pluck', { vol: 0.5, rate: 1.2 });
  },
  jumpCrouch() {
    synth.play('creak', { vol: 0.25, rate: 1.6 });
  },
  jump() {
    whoosh(0.3, 300, 1400, 0.3);
    synth.play(S('step', 3), { vol: 0.5, rate: 0.8 });
  },
  land() {
    synth.play(S('step', 3), { vol: 0.6, rate: 0.7 });
    synth.play(S('soft', 3), { vol: 0.25 });
  },
  dash() {
    whoosh(0.2, 400, 1600, 0.16);
  },
  splash() {
    synth.noise({ dur: 0.6, freq: 900, to: 250, q: 0.6, vol: 0.5, wet: 0.4 });
    synth.noise({ dur: 0.25, freq: 2500, to: 1200, q: 1, vol: 0.2, delay: 0.05, wet: 0.4 });
    synth.play('slime', { vol: 0.35, rate: 1.3 });
  },
  chomp() {
    for (let i = 0; i < 5; i++) synth.play(['chop', ...S('punch', 3)], { vol: 0.35, rate: 1.5, jitter: 0.15, delay: i * 0.12 });
  },
  snap() {
    // Crocodile jaws.
    synth.play('chop', { vol: 0.8, rate: 0.8 });
    synth.play(S('wood', 3), { vol: 0.6, rate: 0.7, delay: 0.25 });
  },
  shark() {
    synth.noise({ dur: 0.8, freq: 500, to: 150, q: 0.5, vol: 0.5, wet: 0.5 });
    synth.play('chop', { vol: 0.8, rate: 0.6, delay: 0.3 });
  },
  sizzle() {
    synth.play('flame', { vol: 0.5, rate: 0.8 });
    synth.noise({ dur: 1.2, freq: 4000, to: 2500, q: 0.8, vol: 0.25, attack: 0.05, wet: 0.2 });
  },
  bunnyHit() {
    synth.play(['pep', 'pep2'], { vol: 0.45, rate: 1.3 });
    synth.play(S('soft', 3), { vol: 0.35, rate: 1.4 });
  },
  bunnyPoof() {
    synth.noise({ dur: 0.6, freq: 2500, to: 600, q: 0.6, vol: 0.3, wet: 0.5 });
    synth.play('phaseJump', { vol: 0.4 });
  },
  rocket() {
    synth.play('thruster', { vol: 0.6, rate: 1.2 });
    synth.play('metalClick', { vol: 0.4 });
  },
  boom(big = false) {
    synth.play(S('boom', 3), { vol: big ? 0.9 : 0.75, rate: big ? 0.8 : 1, wet: 0.35 });
    if (big) synth.play('boomLow', { vol: 0.7, wet: 0.3 });
  },
  lob() {
    whoosh(0.18, 400, 1200, 0.25);
  },
  bounce() {
    synth.play(S('metalLight', 3), { vol: 0.35, rate: 0.8 });
  },
  fizzle() {
    synth.play('slime', { vol: 0.5 });
    synth.noise({ dur: 0.7, freq: 3000, to: 800, q: 1, vol: 0.2 });
  },
  flame() {
    synth.play('flame', { vol: 0.3, rate: 1.1, jitter: 0.1 });
  },
  slash() {
    synth.play(['slice', 'slice2'], { vol: 0.5, rate: 1.1 });
    whoosh(0.22, 900, 3000, 0.14);
  },
  swordHit() {
    synth.play('metalHit', { vol: 0.6 });
    synth.play(S('punchHeavy', 3), { vol: 0.6 });
  },
  gunshot() {
    synth.noise({ dur: 0.07, freq: 1800, to: 600, q: 0.7, vol: 0.35, wet: 0.25 });
    synth.tone({ freq: 140, to: 60, dur: 0.06, type: 'triangle', vol: 0.25, wet: 0.1 });
  },
  reload() {
    synth.play('latch', { vol: 0.6 });
    synth.play('metalClick', { vol: 0.5, delay: 0.35 });
  },
  punch() {
    synth.play(S('punch', 3), { vol: 0.7 });
  },
  whiff() {
    whoosh(0.15, 1200, 3200, 0.1);
  },
  empty() {
    synth.play('click', { vol: 0.4 });
  },
  treeBreak() {
    synth.play('woodBreak', { vol: 0.8 });
    synth.play('creak', { vol: 0.4, rate: 0.7 });
  },
  rockBreak() {
    synth.play(['rockBreak', 'rockBreak2'], { vol: 0.8 });
  },
  gate() {
    synth.play(['rockBreak', 'rockBreak2'], { vol: 0.35, rate: 0.6 });
    synth.noise({ dur: 1.2, freq: 120, to: 90, q: 0.5, vol: 0.35, attack: 0.3, wet: 0.3 });
  },
  bridge() {
    synth.play('creak', { vol: 0.5, rate: 0.8 });
  },
  buy() {
    synth.play(['coins', 'coins2'], { vol: 0.7 });
    synth.play('confirm', { vol: 0.4, delay: 0.1 });
  },
  nope() {
    synth.play('error', { vol: 0.5 });
  },
  revive() {
    synth.play('powerUp', { vol: 0.5 });
  },
  double() {
    synth.play('threeUp', { vol: 0.5 });
  },
  beep(high = false) {
    synth.play(high ? 'confirm' : 'tick', { vol: high ? 0.6 : 0.5, jitter: 0 });
  },
  win() {
    synth.play('powerUp2', { vol: 0.6 });
    synth.play(['coins', 'coins2'], { vol: 0.5, delay: 0.4 });
  },
  lose() {
    synth.play('lowDown', { vol: 0.5 });
  },
  ui() {
    synth.play('select', { vol: 0.35, jitter: 0.03 });
  },
};
