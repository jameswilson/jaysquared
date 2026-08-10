const { chromium } = require('playwright');
const path = require('path');
const GAME = 'file://' + path.join(__dirname, '..', 'jay-squared.html');
const SHOTS = path.join(__dirname, 'shots');
require('fs').mkdirSync(SHOTS, { recursive: true });
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 1200, height: 720 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(GAME);
  await p.waitForTimeout(650);
  await p.keyboard.press('Space'); await p.waitForTimeout(500);
  await p.evaluate(() => { window.J2.G.runes = []; window.J2.G.banner = null; });

  // overlap check: can two hints ever be near-opaque at the same x range?
  const clash = await p.evaluate(() => {
    const W = window.J2.G.world, hud = document.getElementById('hud').getContext('2d');
    const UI = '"Trebuchet MS", system-ui, sans-serif';
    hud.font = 'bold 8.5px ' + UI;
    const boxes = W.hints.map(h => {
      const w2 = hud.measureText(h.text).width + 15;
      return { text: h.text, x0: h.x - w2 / 2, x1: h.x + w2 / 2, y: h.y };
    }).sort((a, b) => a.x0 - b.x0);
    const bad = [];
    for (let i = 1; i < boxes.length; i++) {
      const a = boxes[i - 1], c = boxes[i];
      if (c.x0 < a.x1 && Math.abs(a.y - c.y) < 14)
        bad.push('"' + a.text + '" overlaps "' + c.text + '"');
    }
    return bad;
  });
  console.log('hint overlap:', clash.length ? clash.join('\n  ') : 'none ✓');

  // walk to each of the first two signs and shoot them
  for (let i = 0; i < 4; i++) {
    await p.evaluate((n) => {
      const G = window.J2.G, h = G.world.hints[n];
      if (!h) return;
      G.player.x = h.x - 5; G.player.y = h.y + 40;
      G.cam.x = h.x - 240; G.cam.y = h.y - 90;
      G.banner = null;
    }, i);
    await p.waitForTimeout(450);
    await p.evaluate(() => { window.J2.G.banner = null; });
    await p.waitForTimeout(80);
    await p.screenshot({ path: path.join(SHOTS, `hint-${i}.png`), clip: { x: 240, y: 130, width: 720, height: 240 } });
  }
  console.log('errors:', errs.length ? errs.join('|') : 'none');
  await b.close();
})();
