// Every sound in the game, as named actions (Kenney CC0 samples + small synth sounds).
import { synth } from '@engine/audio';

const SAMPLES = [
  'creak', 'latch', 'wood0', 'wood1', 'wood2', 'woodBreak', 'step0', 'step1', 'step2', 'soft0', 'soft1', 'soft2',
  'metalClick', 'metalHit', 'powerUp', 'powerUp2', 'coins', 'error', 'pep', 'pep2', 'pluck', 'drop', 'confirm', 'select',
  'click', 'rockBreak', 'rockBreak2', 'threeUp', 'phaserDown', 'lowDown', 'chop', 'slime',
  'slice', 'slice2', 'punch0', 'punch1', 'punch2', 'punchHeavy0', 'punchHeavy1', 'punchHeavy2', 'shield',
  'metalLight0', 'metalLight1', 'boomLow', 'boom1', 'draw', 'phaseJump',
];

export function initSounds() {
  synth.useSamples(`${import.meta.env.BASE_URL}sfx`, SAMPLES);
}

export const SFX = {
  step: () => synth.play(['step0', 'step1', 'step2'], { vol: 0.12, rate: 1.1, jitter: 0.1, wet: 0.15 }),
  door: () => synth.play('creak', { vol: 0.45, rate: 0.8, jitter: 0.12, wet: 0.4 }),
  locked: () => { synth.play('metalClick', { vol: 0.5, rate: 0.8 }); synth.play('metalClick', { vol: 0.4, rate: 0.7, delay: 0.12 }); },
  unlock: () => { synth.play('latch', { vol: 0.7 }); synth.play('metalHit', { vol: 0.3, rate: 0.7, delay: 0.25 }); },
  openWood: () => synth.play(['wood0', 'wood1', 'wood2'], { vol: 0.45, rate: 0.9, jitter: 0.1 }),
  rummage: () => synth.play(['soft0', 'soft1', 'soft2'], { vol: 0.35, rate: 0.9, jitter: 0.2 }),
  smash: () => { synth.play('woodBreak', { vol: 0.75, jitter: 0.1 }); synth.play('chop', { vol: 0.4, rate: 0.7 }); },
  smashGlass: () => { synth.play('rockBreak2', { vol: 0.6, rate: 1.7 }); synth.play('metalClick', { vol: 0.3, rate: 2.2, delay: 0.05 }); },
  scrape: () => synth.noise({ dur: 0.9, freq: 260, to: 180, q: 3, vol: 0.25, attack: 0.08, wet: 0.2 }),
  key: () => { synth.play('powerUp', { vol: 0.6 }); synth.play('coins', { vol: 0.45, delay: 0.15 }); },
  heal: () => synth.play('pep2', { vol: 0.5 }),
  junk: () => synth.play('pluck', { vol: 0.45, jitter: 0.15 }),
  empty: () => synth.play('soft1', { vol: 0.2, rate: 0.6 }),
  stairs: () => synth.play('threeUp', { vol: 0.5 }),
  ui: () => synth.play('select', { vol: 0.35 }),
  uiConfirm: () => synth.play('confirm', { vol: 0.45 }),
  squeak: () => {
    synth.tone({ freq: 2600, to: 3400, dur: 0.07, type: 'sine', vol: 0.12 });
    synth.tone({ freq: 2800, to: 3600, dur: 0.06, type: 'sine', vol: 0.1, delay: 0.1 });
  },
  bat: () => {
    for (let i = 0; i < 4; i++) synth.tone({ freq: 3800 + Math.random() * 1200, to: 2600, dur: 0.05, type: 'triangle', vol: 0.06, delay: i * 0.09 });
    for (let i = 0; i < 6; i++) synth.noise({ dur: 0.06, freq: 900, q: 1, vol: 0.12, delay: i * 0.07 });
  },
  scream: () => synth.tone({ freq: 700, to: 1100, dur: 0.35, type: 'sawtooth', vol: 0.05 }),
  wind: (vol: number) => synth.noise({ dur: 2.4, freq: 380, to: 520, q: 0.8, vol: 0.12 * vol, attack: 0.9, wet: 0.5 }),
  crackle: (vol: number) => synth.noise({ dur: 0.04, freq: 2400, q: 2, vol: 0.12 * vol }),
  houseCreak: () => synth.play('creak', { vol: 0.12, rate: 0.5, jitter: 0.2, wet: 0.8 }),
  // ---- fighting ----
  whoosh: (heavy: boolean) => synth.play(heavy ? 'slice2' : 'slice', { vol: heavy ? 0.5 : 0.35, rate: heavy ? 0.7 : 1, jitter: 0.12 }),
  hit: (heavy: boolean) => {
    synth.play(heavy ? ['punchHeavy0', 'punchHeavy1', 'punchHeavy2'] : ['punch0', 'punch1', 'punch2'], { vol: heavy ? 0.75 : 0.55, jitter: 0.12 });
    synth.play('slime', { vol: heavy ? 0.35 : 0.2, rate: 1.3, jitter: 0.2 });
  },
  block: () => synth.play('metalHit', { vol: 0.5, rate: 0.9, jitter: 0.1 }),
  parry: () => { synth.play('metalLight0', { vol: 0.7, rate: 1.2 }); synth.play('shield', { vol: 0.4, delay: 0.05 }); },
  hurt: () => { synth.play(['punch0', 'punch1'], { vol: 0.6, rate: 0.8 }); synth.tone({ freq: 420, to: 260, dur: 0.18, type: 'square', vol: 0.05 }); },
  dodge: () => synth.noise({ dur: 0.18, freq: 1200, to: 500, q: 1.2, vol: 0.18 }),
  bolt: () => { synth.play('draw', { vol: 0.4, rate: 1.4 }); synth.play('pluck', { vol: 0.4, rate: 0.7 }); },
  blast: () => synth.play('phaseJump', { vol: 0.5, jitter: 0.08 }),
  slam: () => { synth.play('boomLow', { vol: 0.8 }); synth.play('rockBreak', { vol: 0.5, rate: 0.8 }); },
  smoke: () => synth.noise({ dur: 0.6, freq: 600, to: 200, q: 0.7, vol: 0.3, attack: 0.02 }),
  flush: () => synth.noise({ dur: 1.3, freq: 500, to: 200, q: 0.6, vol: 0.35, attack: 0.05, wet: 0.4 }),
  plonk: () => [220, 262, 311].forEach((f, i) => synth.tone({ freq: f, dur: 0.9, type: 'triangle', vol: 0.12, delay: i * 0.02, wet: 0.5 })),
  cuckoo: () => { synth.tone({ freq: 880, to: 870, dur: 0.18, type: 'sine', vol: 0.2 }); synth.tone({ freq: 700, to: 690, dur: 0.25, type: 'sine', vol: 0.2, delay: 0.22 }); },
  hiss: () => synth.noise({ dur: 0.6, freq: 4000, to: 2500, q: 1.2, vol: 0.25, attack: 0.03 }),
  purr: () => { for (let i = 0; i < 12; i++) synth.noise({ dur: 0.12, freq: 140, q: 3, vol: 0.25, delay: i * 0.15 }); },
  meow: () => synth.tone({ freq: 700, to: 500, dur: 0.4, type: 'triangle', vol: 0.12, wet: 0.3 }),
  joy: () => [523, 659, 784, 1046].forEach((f, i) => synth.tone({ freq: f, dur: 0.35, type: 'triangle', vol: 0.15, delay: i * 0.12, wet: 0.4 })),
  acid: () => synth.noise({ dur: 0.35, freq: 3000, to: 1500, q: 1.5, vol: 0.18 }),
  monster: (name: 'growl' | 'swipe' | 'bite' | 'squeal' | 'poof' | 'whistle' | 'land' | 'clang', vol: number, small: boolean) => {
    const r = small ? 2 : 1;
    switch (name) {
      case 'growl':
        synth.tone({ freq: 110 * r, to: 80 * r, dur: 0.6, type: 'sawtooth', vol: 0.07 * vol, wet: 0.4 });
        synth.noise({ dur: 0.6, freq: 300 * r, q: 2, vol: 0.15 * vol, attack: 0.1 });
        break;
      case 'swipe': synth.play('slice', { vol: 0.45 * vol, rate: 0.8 * r }); break;
      case 'bite': synth.play('chop', { vol: 0.5 * vol, rate: 1.2 * r }); break;
      case 'squeal': synth.tone({ freq: 700 * r, to: 1300 * r, dur: 0.16, type: 'square', vol: 0.06 * vol }); break;
      case 'poof': synth.noise({ dur: 0.5, freq: 900, to: 300, q: 0.8, vol: 0.3 * vol }); break;
      case 'whistle': synth.tone({ freq: 1500, to: 2400, dur: 0.35, type: 'sine', vol: 0.12 * vol }); synth.tone({ freq: 1800, to: 2800, dur: 0.3, type: 'sine', vol: 0.12 * vol, delay: 0.4 }); break;
      case 'land': synth.play('boom1', { vol: 0.5 * vol, rate: 1.4 }); break;
      case 'clang': synth.play('metalHit', { vol: 0.6 * vol, rate: 1.1, jitter: 0.1 }); break;
    }
  },
  /** One blip of speech: pitch wobbles per letter so it sounds like mumbling. */
  voice: (pitch: number, ch: string) => {
    const k = (ch.toLowerCase().charCodeAt(0) % 7) / 7;
    synth.tone({ freq: pitch * (0.85 + k * 0.4), dur: 0.05, type: 'square', vol: 0.035, wet: 0.1 });
  },
};
