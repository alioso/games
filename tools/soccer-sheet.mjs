// A picture of all eight teams (home kits), for choosing and tweaking the animals.
// Saves tools/shots/soccer/teams.png
import { chromium } from 'playwright';
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.goto('http://localhost:5175/');
await page.waitForTimeout(1500);
await page.evaluate(async () => {
  const { TEAMS } = await import('/src/data/teams.ts');
  const div = document.createElement('div');
  div.style.cssText = 'position:fixed;inset:0;z-index:99;background:linear-gradient(#bfe3ff,#eef8ff);display:grid;grid-template-columns:repeat(4,1fr);gap:4px;padding:10px;font:700 22px Fredoka,sans-serif;text-align:center';
  for (const t of TEAMS) {
    const cell = document.createElement('div');
    cell.innerHTML = `<img src="${window.soccer.teamPic(t)}" style="width:330px;height:330px"><div>${t.name}</div>`;
    div.appendChild(cell);
  }
  document.body.appendChild(div);
});
await page.waitForTimeout(500);
await page.screenshot({ path: 'tools/shots/soccer/teams.png' });
await browser.close();
