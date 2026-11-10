// The sound reel: plays every Animal Soccer sound in turn and records it from the real audio output
// to tools/shots/soccer/sounds.wav (listen to it), with a list of what's when (sounds.txt). Also a spectrogram
// picture (sounds.png) if ffmpeg is installed.
// Usage: node tools/soccer-sounds.mjs
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
const out = new URL('./shots/soccer/', import.meta.url).pathname;
const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.stack ?? e.message));
await page.goto('http://localhost:5175/');
await page.waitForTimeout(1200);
await page.keyboard.press('KeyZ'); // unlocks audio
await page.waitForTimeout(1500); // samples load
const reel = [
  ['crowd murmur (calm)', 'calm', 4],
  ['short pass', 'sfx.kick(8, 0)', 1],
  ['dribble touches', 'for (let i = 0; i < 4; i++) setTimeout(() => sfx.touch(0), i * 260)', 1.4],
  ['firm pass', 'sfx.kick(13, -10)', 1],
  ['big shot', 'sfx.kick(19, 10)', 1.5],
  ['header', 'sfx.kick(8, 0, true)', 1],
  ['bounces', 'sfx.bounce(7, 0); setTimeout(() => sfx.bounce(4, 0), 400); setTimeout(() => sfx.bounce(2, 0), 700)', 1.3],
  ['tackle', 'sfx.tackle(true, 0)', 1],
  ['whistle: short', 'sfx.whistle(0)', 1],
  ['whistle: kick-off', 'sfx.whistle(1)', 1.4],
  ['whistle: half time', 'sfx.whistle(2)', 2],
  ['whistle: full time', 'sfx.whistle(3)', 2.6],
  ['post!', 'sfx.post(15)', 2.2],
  ['save (catch)', 'sfx.save(true, 15)', 2.8],
  ['shot wide', 'sfx.miss()', 2.2],
  ['crowd excited (near goal)', 'excited', 4],
  ['goal (ours) + net', 'sfx.kick(17, 15); setTimeout(() => sfx.net(14, 20), 350); setTimeout(() => sfx.goal(true), 400)', 6.5],
  ['goal against', 'sfx.goal(false)', 3.5],
  ['foul (boo)', 'sfx.whistle(0); sfx.foul(false)', 2.2],
  ['penalty given', 'sfx.whistle(0); sfx.foul(true)', 3],
  ['penalty hush', 'hush', 3],
  ['yellow card', 'sfx.card(false)', 2],
  ['red card', 'sfx.card(true)', 2.5],
  ['offside', 'sfx.whistle(0); sfx.offside()', 1.8],
  ['chant', 'sfx["chant"]()', 7.5],
];
const info = await page.evaluate(async (reel) => {
  const sfx = window.soccer.sfx;
  const stream = sfx.record();
  const rec = new MediaRecorder(stream, { mimeType: 'audio/webm' });
  const chunks = [];
  rec.ondataavailable = (e) => chunks.push(e.data);
  rec.start();
  const t0 = performance.now();
  const marks = [];
  let mode = 'calm';
  const tick = setInterval(() => sfx.crowd(0.05, mode === 'excited' ? 0.9 : 0.15, mode === 'hush'), 50);
  for (const [label, code, secs] of reel) {
    marks.push([((performance.now() - t0) / 1000).toFixed(1), label]);
    if (code === 'calm' || code === 'excited' || code === 'hush') mode = code;
    else { mode = 'calm'; new Function('sfx', code)(sfx); }
    await new Promise((r) => setTimeout(r, secs * 1000));
  }
  clearInterval(tick);
  rec.stop();
  await new Promise((r) => (rec.onstop = r));
  const blob = new Blob(chunks, { type: 'audio/webm' });
  const buf = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return { b64: btoa(s), marks };
}, reel);
writeFileSync(`${out}sounds.webm`, Buffer.from(info.b64, 'base64'));
try {
  execSync(`ffmpeg -y -loglevel error -i ${out}sounds.webm ${out}sounds.wav`);
  execSync(`ffmpeg -y -loglevel error -i ${out}sounds.wav -lavfi showspectrumpic=s=1800x500:legend=1:scale=log ${out}sounds.png`);
} catch (e) { console.log('(ffmpeg step failed)', e.message); }
const list = info.marks.map(([t, l]) => `${t.padStart(5)} s  ${l}`).join('\n');
writeFileSync(`${out}sounds.txt`, list + '\n');
console.log(list);
console.log(errors.length ? errors.join('\n') : 'no page errors');
await browser.close();
