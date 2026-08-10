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
  await p.waitForTimeout(700);
  await p.keyboard.press('Space');
  await p.waitForTimeout(400);
  await p.evaluate(() => {
    const G = window.J2.G;
    G.player.x = G.runes[0].x; G.player.y = G.runes[0].y;
  });
  await p.waitForTimeout(500);
  console.log('state:', await p.evaluate(() => window.J2.G.state));

  // empty field, caret at centre
  await p.screenshot({ path: path.join(SHOTS, 'rune-0.png'), clip: { x: 300, y: 180, width: 600, height: 300 } });
  // measure horizontal drift of the digits across a full caret cycle
  const drift = [];
  await p.keyboard.press('Digit4'); await p.keyboard.press('Digit2');
  for (let i = 0; i < 10; i++) {
    await p.waitForTimeout(110);
    drift.push(await p.evaluate(() => {
      // sample the pixel columns of the digit row to find the text bounding box
      const c = document.getElementById('hud');
      const g = c.getContext('2d');
      const H = c.height, W = c.width;
      const rowY = Math.round(H * 0.53);
      const d = g.getImageData(0, rowY, W, 26).data;
      let min = 1e9, max = -1;
      for (let y = 0; y < 26; y++) for (let x = 0; x < W; x++) {
        const i2 = (y * W + x) * 4;
        // the amber digit colour, ignoring the thin caret bar
        if (d[i2] > 220 && d[i2 + 1] > 200 && d[i2 + 2] < 190) { if (x < min) min = x; if (x > max) max = x; }
      }
      return min > max ? null : [min, max];
    }));
  }
  const lefts = drift.filter(Boolean).map(d => d[0]);
  console.log('digit left edge over 10 frames:', JSON.stringify(lefts));
  console.log('drift px (hud space):', Math.max(...lefts) - Math.min(...lefts));
  await p.screenshot({ path: path.join(SHOTS, 'rune-2.png'), clip: { x: 300, y: 180, width: 600, height: 300 } });
  console.log('errors:', errs.length ? errs.join('|') : 'none');
  await b.close();
})();
