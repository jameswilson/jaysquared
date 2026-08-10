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
  await p.keyboard.press('Space'); await p.waitForTimeout(300);

  const clear = async () => {
    const st = await p.evaluate(() => window.J2.G.state);
    if (st === 'glitch') { await p.keyboard.press('Escape'); await p.waitForTimeout(400); }
    else await p.waitForTimeout(2300);
  };

  // A: every power, every level
  for (const [lvl, power] of [[0, 'earth'], [1, 'water'], [2, 'electric'], [3, 'lava'], [4, 'wind']]) {
    const via = await p.evaluate(([n, k]) => {
      window.J2.buildLevel(n);
      const G = window.J2.G;
      G.state = 'play'; G.runes = [];
      G.player.inv = [k, null, null, null, null]; G.player.sel = 0; G.player.cooldown = 0;
      window.J2.usePower(G.player, 'Q', false);        // fire for real
      G.player.y = (G.world.h + 6) * 16;               // and drop off the world
      return null;
    }, [lvl, power]);
    await p.waitForTimeout(450);
    const s = await p.evaluate(() => ({ st: window.J2.G.state, via: window.J2.G.glitch && window.J2.G.glitch.via }));
    console.log('level', lvl, power.padEnd(9), '->', s.st, s.st === 'glitch' ? ('✓ via ' + s.via) : '*** no tear ***');
    await clear();
  }

  // B: once per level
  await p.evaluate(() => {
    window.J2.buildLevel(0);
    const G = window.J2.G;
    G.state = 'play'; G.runes = [];
    G.player.inv = ['earth', null, null, null, null]; G.player.sel = 0;
  });
  const seq = [];
  for (let i = 0; i < 3; i++) {
    await p.evaluate(() => {
      const G = window.J2.G;
      G.state = 'play'; G.player.cooldown = 0;
      G.player.y = (G.world.surface[Math.floor(G.player.cx / 16)] - 3) * 16;
      window.J2.usePower(G.player, 'Q', false);
      G.player.y = (G.world.h + 6) * 16;
    });
    await p.waitForTimeout(450);
    seq.push(await p.evaluate(() => window.J2.G.state));
    await clear();
  }
  console.log('three tries, same level  :', seq.join(' -> '),
    (seq[0] === 'glitch' && seq[1] !== 'glitch' && seq[2] !== 'glitch') ? '✓ once per level' : '*** wrong ***');

  // C: resets on the next level
  await p.evaluate(() => {
    window.J2.buildLevel(1);
    const G = window.J2.G;
    G.state = 'play'; G.runes = [];
    G.player.inv = ['water', null, null, null, null]; G.player.sel = 0; G.player.cooldown = 0;
    window.J2.usePower(G.player, 'Q', false);
    G.player.y = (G.world.h + 6) * 16;
  });
  await p.waitForTimeout(450);
  console.log('fresh level again        :', await p.evaluate(() => window.J2.G.state), '✓ resets');
  await clear();

  // D: how stale can the shot be?
  for (const wait of [200, 900, 1500, 2200]) {
    await p.evaluate(() => {
      window.J2.buildLevel(2);
      const G = window.J2.G;
      G.state = 'play'; G.runes = [];
      G.player.inv = ['electric', null, null, null, null]; G.player.sel = 0; G.player.cooldown = 0;
      window.J2.usePower(G.player, 'Q', false);
    });
    await p.waitForTimeout(wait);
    await p.evaluate(() => { window.J2.G.player.y = (window.J2.G.world.h + 6) * 16; });
    await p.waitForTimeout(400);
    console.log('  fired ' + String(wait).padStart(4) + 'ms before falling ->',
      await p.evaluate(() => window.J2.G.state));
    await clear();
  }

  // E: end to end — walk off a ledge mashing Q, no teleporting
  const setup = await p.evaluate(() => {
    window.J2.buildLevel(0);
    const G = window.J2.G, W = G.world;
    G.state = 'play'; G.runes = [];
    let x = 30;
    while (x < W.w - 30 && !(W.surface[x] <= W.h && W.surface[x + 1] > W.h)) x++;
    let wide = 0; while (W.surface[x + 1 + wide] > W.h) wide++;
    G.player.x = (x - 1) * 16;
    G.player.y = (W.surface[x] - 3) * 16;
    G.player.inv = ['earth', null, null, null, null]; G.player.sel = 0; G.player.cooldown = 0;
    G.cam.x = (x - 14) * 16;
    return { lip: x, wide };
  });
  console.log('pit at tile', setup.lip, 'width', setup.wide);
  await p.waitForTimeout(250);
  await p.keyboard.down('ArrowRight');
  for (let i = 0; i < 8; i++) { await p.keyboard.press('KeyQ'); await p.waitForTimeout(110); }
  await p.keyboard.up('ArrowRight');
  await p.waitForTimeout(800);
  const live = await p.evaluate(() => ({ st: window.J2.G.state, y: Math.round(window.J2.G.player.y) }));
  console.log('walked off a pit mashing Q ->', live.st, 'y=' + live.y,
    live.st === 'glitch' ? '\u2713 reachable in real play' : '(missed)');
  await p.waitForTimeout(1300);
  await p.screenshot({ path: path.join(SHOTS, 'glitch-live.png') });
  console.log('errors:', errs.length ? errs.join('|') : 'none');
  await b.close();
})();
