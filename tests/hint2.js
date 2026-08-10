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
  await p.evaluate(() => { window.J2.G.runes = []; });
  // stand at the second tutorial sign the way a player arrives at it
  await p.evaluate(() => {
    const G = window.J2.G, W = G.world;
    const h = W.hints.find(h => h.text.indexOf('SPACE') === 0);
    let tx = Math.floor(h.x / 16);
    G.player.x = h.x; G.player.y = (W.surface[tx] - 3) * 16;
    G.banner = null;
  });
  await p.waitForTimeout(700);
  await p.evaluate(() => { window.J2.G.banner = null; });
  await p.waitForTimeout(100);
  await p.screenshot({ path: path.join(SHOTS, 'hint-live.png') });
  console.log('errors:', errs.length ? errs.join('|') : 'none');
  await b.close();
})();
