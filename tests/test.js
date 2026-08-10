const { chromium } = require('playwright');
const path = require('path');
const GAME = 'file://' + path.join(__dirname, '..', 'jay-squared.html');
const SHOTS = path.join(__dirname, 'shots');
require('fs').mkdirSync(SHOTS, { recursive: true });

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 1200, height: 720 } });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

  await page.goto(GAME);
  await page.waitForTimeout(900);

  const boot = await page.evaluate(() => ({
    hasJ2: !!window.J2,
    state: window.J2 && window.J2.G.state,
    level: window.J2 && window.J2.G.world && window.J2.G.world.name,
  }));
  console.log('boot:', JSON.stringify(boot));
  await page.screenshot({ path: path.join(SHOTS, 'shot-title.png') });

  // start
  await page.keyboard.press('Space');
  await page.waitForTimeout(600);
  console.log('state after start:', await page.evaluate(() => window.J2.G.state));

  // run right for a while, jumping
  const startX = await page.evaluate(() => window.J2.G.player.x);
  await page.keyboard.down('ArrowRight');
  for (let i = 0; i < 26; i++) {
    await page.waitForTimeout(180);
    await page.keyboard.press('Space');
    if (i % 5 === 0) await page.keyboard.press('Space');
  }
  await page.keyboard.up('ArrowRight');
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => ({
    x: window.J2.G.player.x, y: window.J2.G.player.y, hp: window.J2.G.player.hp,
    gems: window.J2.G.gems, lives: window.J2.G.lives, state: window.J2.G.state,
    mobs: window.J2.G.mobs.length, parts: window.J2.G.parts.length,
  }));
  console.log('travelled:', Math.round(after.x - startX), 'px ->', JSON.stringify(after));
  await page.screenshot({ path: path.join(SHOTS, 'shot-play.png') });

  // give all powers, fire each Q, E, TAB+Q
  await page.evaluate(() => {
    const G = window.J2.G;
    ['earth', 'water', 'electric', 'lava', 'wind'].forEach((k, i) => G.player.inv[i] = k);
  });
  for (let slot = 1; slot <= 5; slot++) {
    await page.keyboard.press('Digit' + slot);
    await page.waitForTimeout(120);
    await page.keyboard.press('KeyQ');
    await page.waitForTimeout(300);
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(300);
    await page.keyboard.down('Tab');
    await page.keyboard.press('KeyQ');
    await page.keyboard.up('Tab');
    await page.waitForTimeout(350);
  }
  console.log('after powers:', JSON.stringify(await page.evaluate(() => ({
    state: window.J2.G.state, shots: window.J2.G.shots.length,
    hazards: window.J2.G.hazards.length, err: null,
  }))));
  await page.screenshot({ path: path.join(SHOTS, 'shot-powers.png') });

  // rune modal
  await page.evaluate(() => {
    const G = window.J2.G;
    if (G.runes.length) { G.player.x = G.runes[0].x; G.player.y = G.runes[0].y; }
  });
  await page.waitForTimeout(400);
  const runeState = await page.evaluate(() => window.J2.G.state);
  console.log('rune state:', runeState);
  if (runeState === 'rune') {
    await page.screenshot({ path: path.join(SHOTS, 'shot-rune.png') });
    const ans = await page.evaluate(() => window.J2.G.rune.ans);
    for (const ch of String(ans)) await page.keyboard.press('Digit' + ch);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1800);
    console.log('after rune:', JSON.stringify(await page.evaluate(() => ({
      state: window.J2.G.state, score: window.J2.G.score, lives: window.J2.G.lives,
      abilities: [...window.J2.G.abilities],
    }))));
  }

  // the glitch: magma ball in flight + void
  await page.evaluate(() => {
    const G = window.J2.G;
    G.state = 'play';
    G.player.inv[0] = 'lava'; G.player.sel = 0; G.player.cooldown = 0;
  });
  await page.keyboard.press('KeyQ');
  await page.waitForTimeout(60);
  await page.evaluate(() => { window.J2.G.player.y = (window.J2.G.world.h + 5) * 16; });
  await page.waitForTimeout(500);
  console.log('glitch state:', await page.evaluate(() => window.J2.G.state));
  await page.waitForTimeout(1300);
  await page.screenshot({ path: path.join(SHOTS, 'shot-glitch.png') });
  await page.keyboard.press('Enter');   // into PHYSICS.HACK
  await page.waitForTimeout(250);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');   // moon jump
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(SHOTS, 'shot-glitch2.png') });
  console.log('physics after hack:', JSON.stringify(await page.evaluate(() => ({
    jumpV: window.J2.PHYS.jumpV, chain: window.J2.PHYS.maxJumpChain,
  }))));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  console.log('after glitch close:', await page.evaluate(() => window.J2.G.state));

  // tour every level
  for (let i = 0; i < 5; i++) {
    await page.evaluate((n) => {
      window.J2.buildLevel(n);
      window.J2.G.state = 'play';
      const G = window.J2.G;
      const W = G.world;
      if (n === 4) {
        const it = W.itemSpots[0];       // frame the sealed chamber in the keep
        G.player.x = it.x; G.player.y = it.y - 56;
        G.cam.x = it.x - 240; G.cam.y = it.y - 150;
      } else {
        G.cam.x = Math.max(0, W.w * 16 * 0.5);
        G.player.x = G.cam.x + 200;
        G.player.y = (W.surface[Math.floor(G.player.x / 16)] - 4) * 16;
      }
      G.player.hp = G.player.maxHp;
      G.player.invuln = 99;
      ['earth', 'water', 'electric', 'lava', 'wind'].forEach((k, s) => G.player.inv[s] = k);
    }, i);
    await page.waitForTimeout(700);
    const info = await page.evaluate(() => ({
      name: window.J2.G.world.name,
      mobs: window.J2.G.mobs.length,
      gems: window.J2.G.gemEnts.length,
      items: window.J2.G.items.length,
      runes: window.J2.G.runes.length,
      state: window.J2.G.state,
    }));
    console.log('level', i, JSON.stringify(info));
    await page.screenshot({ path: path.join(SHOTS, `shot-level${i}.png`) });
  }

  // reachability probe: can Jay walk the whole of level 1?
  const reach = await page.evaluate(() => {
    window.J2.buildLevel(0);
    const W = window.J2.G.world;
    let gaps = [], run = 0;
    for (let x = 0; x < W.w; x++) {
      if (W.surface[x] > W.h) { run++; }
      else { if (run > 0) gaps.push(run); run = 0; }
    }
    return { maxGap: Math.max(0, ...gaps), gaps: gaps.length, width: W.w };
  });
  console.log('level 1 pit widths:', JSON.stringify(reach));

  // can Jay actually get into the sealed chamber? stand on the roof, DOWN+SPACE
  const sealed = await page.evaluate(() => {
    window.J2.buildLevel(4);
    window.J2.G.state = 'play';
    const G = window.J2.G, it = G.world.itemSpots[0];
    G.player.inv = [null, null, null, null, null];
    G.player.x = it.x - 2;                // centred on the plank in the roof
    G.player.y = it.y - 69;               // item row is 3 tiles under the roof
    G.player.vy = 0;
    G.cam.x = it.x - 240; G.cam.y = it.y - 150;
    return { itemY: it.y, startY: G.player.y, kind: it.kind };
  });
  await page.waitForTimeout(500);
  await page.keyboard.down('ArrowDown');
  await page.waitForTimeout(120);
  await page.keyboard.press('Space');
  await page.waitForTimeout(700);
  await page.keyboard.up('ArrowDown');
  await page.waitForTimeout(600);
  const gotWind = await page.evaluate(() => ({
    y: Math.round(window.J2.G.player.y),
    inv: window.J2.G.player.inv,
  }));
  console.log('sealed chamber:', JSON.stringify(sealed), '->', JSON.stringify(gotWind));
  await page.screenshot({ path: path.join(SHOTS, 'shot-chamber.png') });

  // does reaching the exit door clear the level?
  await page.evaluate(() => {
    window.J2.buildLevel(0);
    const G = window.J2.G;
    G.state = 'play';
    G.player.x = G.world.exit.x; G.player.y = G.world.exit.y;
  });
  await page.waitForTimeout(600);
  console.log('at exit door:', await page.evaluate(() => window.J2.G.state));
  await page.waitForTimeout(2600);
  console.log('after clear:', await page.evaluate(() => ({
    state: window.J2.G.state, level: window.J2.G.world.name,
  })));

  // REGRESSION: a tree must not be a wall
  const treeSetup = await page.evaluate(() => {
    window.J2.buildLevel(0);
    const G = window.J2.G, W = G.world, T = { LOG: 9 };
    let tx = -1;
    for (let x = 20; x < W.w - 20; x++) {
      if (W.surface[x] > W.h) continue;
      if (W.get(x, W.surface[x] - 1) === T.LOG) { tx = x; break; }
    }
    G.state = 'play';
    G.player.x = (tx - 4) * 16;
    G.player.y = (W.surface[tx] - 3) * 16;
    G.player.inv = [null, null, null, null, null];
    G.player.invuln = 999;
    G.cam.x = (tx - 14) * 16; G.cam.y = (W.surface[tx] - 10) * 16;
    return { trunkX: tx, startX: G.player.x };
  });
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(1500);
  await page.keyboard.up('ArrowRight');
  const passed = await page.evaluate(() => window.J2.G.player.x);
  console.log('tree walkthrough: trunk at px', treeSetup.trunkX * 16,
    '| from', Math.round(treeSetup.startX), '-> ', Math.round(passed),
    passed > treeSetup.trunkX * 16 + 16 ? 'PASSED IT ✓' : '*** STILL BLOCKED ***');
  await page.screenshot({ path: path.join(SHOTS, 'shot-tree.png') });

  // punching a block out of the world: drop a dirt block exactly where the fist lands
  await page.evaluate(() => {
    const G = window.J2.G, W = G.world;
    let x = 30;
    while (x < W.w - 30 && (W.surface[x] > W.h || W.surface[x] !== W.surface[x + 3])) x++;
    G.player.x = x * 16; G.player.y = (W.surface[x] - 2) * 16;
    G.player.vx = 0; G.player.vy = 0; G.player.facing = 1; G.player.sel = -1;
    G.cam.x = (x - 14) * 16; G.cam.y = (W.surface[x] - 10) * 16;
  });
  await page.waitForTimeout(400);
  const dig = await page.evaluate(() => {
    const G = window.J2.G, W = G.world, p = G.player;
    const x = Math.floor((p.cx + p.w / 2 + 5) / 16);
    const y = Math.floor(p.cy / 16);
    W.set(x, y, 2);                       // dirt, right where his fist reaches
    return { x, y, before: W.get(x, y) };
  });
  await page.keyboard.down('KeyQ');
  await page.waitForTimeout(900);
  await page.keyboard.up('KeyQ');
  const after2 = await page.evaluate((t) => window.J2.G.world.get(t.x, t.y), dig);
  console.log('punch block: tile', dig.before, '->', after2, after2 === 0 ? 'BROKEN ✓' : '*** NOT BROKEN ***');
  await page.screenshot({ path: path.join(SHOTS, 'shot-punch.png') });

  // static sweep: is there any solid wall on the walking surface that a plain
  // jump can't clear? (this is the class of bug the tree was)
  const walls = await page.evaluate(() => {
    const out = [];
    for (let n = 0; n < 5; n++) {
      window.J2.buildLevel(n);
      const W = window.J2.G.world;
      const solid = (t) => {
        const d = window.J2.G.world.constructor && null;
        return t !== 0 && !!(window.TILEDEF_SOLID || {})[t];
      };
      const spots = [];
      for (let x = 2; x < W.w - 2; x++) {
        if (W.surface[x] > W.h) continue;
        let stack = 0;
        for (let d = 1; d <= 8; d++) {
          const t = W.get(x, W.surface[x] - d);
          if (window.J2.isSolidTile(t)) stack++; else break;
        }
        if (stack >= 2) spots.push(x + ':' + stack);
      }
      out.push({ level: W.name, width: W.w, blockers: spots });
    }
    return out;
  });
  walls.forEach(w => console.log('walls:', JSON.stringify(w)));

  console.log('--- errors ---');
  console.log(errors.length ? errors.slice(0, 25).join('\n') : 'none');
  await browser.close();
})();
