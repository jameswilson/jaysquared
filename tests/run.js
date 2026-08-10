const { chromium } = require('playwright');
const path = require('path');
const GAME = 'file://' + path.join(__dirname, '..', 'jay-squared.html');
const SHOTS = path.join(__dirname, 'shots');
require('fs').mkdirSync(SHOTS, { recursive: true });
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 1200, height: 720 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(GAME);
  await p.waitForTimeout(700);
  await p.keyboard.press('Space');
  await p.waitForTimeout(400);
  await p.evaluate(() => { window.J2.G.runes = []; });   // runes pause the game; skip for the bot
  // 14 seconds of "hold right, mash jump" — the way a kid actually plays
  await p.keyboard.down('ArrowRight');
  for (let i = 0; i < 70; i++) {
    await p.waitForTimeout(200);
    await p.keyboard.press('Space');
    if (i % 3 === 0) await p.keyboard.press('Space');
  }
  await p.keyboard.up('ArrowRight');
  const r = await p.evaluate(() => ({
    x: Math.round(window.J2.G.player.x), worldPx: window.J2.G.world.w * 16,
    state: window.J2.G.state, level: window.J2.G.world.name,
    gems: window.J2.G.gems, lives: window.J2.G.lives, hp: window.J2.G.player.hp,
  }));
  console.log('auto-run:', JSON.stringify(r), '=>', Math.round(r.x / r.worldPx * 100) + '% across');
  await p.screenshot({ path: path.join(SHOTS, 'shot-run.png') });

  // castle gate visual
  await p.evaluate(() => {
    window.J2.buildLevel(4);
    const G = window.J2.G, W = G.world;
    const gx = (W.w - 78 - 3) * 16;
    G.player.x = gx - 90; G.player.y = (W.surface[Math.floor((gx - 90) / 16)] - 3) * 16;
    G.cam.x = gx - 250; G.cam.y = (W.surface[Math.floor(gx / 16)] - 13) * 16;
    G.state = 'play'; G.player.invuln = 999;
  });
  await p.waitForTimeout(700);
  await p.screenshot({ path: path.join(SHOTS, 'shot-gate.png') });

  // fists + punching visual
  await p.evaluate(() => {
    window.J2.buildLevel(0);
    const G = window.J2.G, W = G.world;
    let x = 40; while (W.surface[x] > W.h) x++;
    G.player.x = x * 16; G.player.y = (W.surface[x] - 3) * 16;
    G.player.sel = -1; G.state = 'play';
    G.cam.x = (x - 14) * 16; G.cam.y = (W.surface[x] - 10) * 16;
  });
  await p.waitForTimeout(400);
  await p.keyboard.down('KeyQ');
  await p.waitForTimeout(200);
  await p.screenshot({ path: path.join(SHOTS, 'shot-fist.png') });
  await p.keyboard.up('KeyQ');
  console.log('errors:', errs.length ? errs.join('|') : 'none');
  await b.close();
})();
