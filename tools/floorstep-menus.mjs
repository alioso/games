// Drives the menus with the keyboard: new game → pause → save & quit → continue.
import { chromium } from 'playwright';
const out = new URL('./shots/floorstep/', import.meta.url).pathname;
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const wait = (ms) => page.waitForTimeout(ms);
const key = async (k, ms = 350) => { await page.keyboard.press(k); await wait(ms); };
await page.goto('http://localhost:5174/');
await page.evaluate(() => localStorage.clear());
await page.reload();
await wait(2000);
await key('Enter');            // New game
await key('ArrowDown');        // Medium
await key('Enter');
// Hero creator: up to the class row, switch to the knight, make her a she, then down to start.
for (let i = 0; i < 7; i++) await key('ArrowUp', 120);
await key('ArrowRight');       // knight
await key('ArrowDown', 120);
await key('ArrowDown', 120);
await key('ArrowRight');       // she
await key('ArrowDown', 120);
await key('ArrowRight');       // costume colour
await page.screenshot({ path: out + 'menu-creator.png' });
for (let i = 0; i < 4; i++) await key("ArrowDown", 120);
await key('Enter', 3500);
const s1 = await page.evaluate(() => ({ run: window.floorstep.run && { d: window.floorstep.run.difficulty, cls: window.floorstep.run.look.cls, sex: window.floorstep.run.look.sex, name: window.floorstep.run.look.name }, phase: window.floorstep.floor.phase }));
await key('Escape', 500);
await page.screenshot({ path: out + 'menu-pause.png' });
await key('ArrowDown');
await key('ArrowDown');
await key('ArrowDown');
await key('Enter', 800);       // Save & quit (after Resume, Controls, Full screen)
await page.screenshot({ path: out + 'menu-continue.png' });
const title = await page.evaluate(() => [...document.querySelectorAll('.menu-btn .menu-label')].map((e) => e.textContent));
await key('Enter', 2500);      // Continue
const s2 = await page.evaluate(() => ({ run: window.floorstep.run && { d: window.floorstep.run.difficulty, cls: window.floorstep.run.look.cls, floor: window.floorstep.run.floor }, phase: window.floorstep.floor.phase }));
console.log({ s1, title, s2 });
console.log(errors.length ? errors.join('\n') : 'no page errors');
await browser.close();
