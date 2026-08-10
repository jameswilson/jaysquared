const { chromium } = require('playwright');
const path = require('path');
const GAME = 'file://' + path.join(__dirname, '..', 'jay-squared.html');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 1200, height: 720 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(GAME);
  await p.waitForTimeout(650);
  await p.keyboard.press('Space'); await p.waitForTimeout(400);

  // place mobs at known offsets from Jay and fire E
  const run = (cases, doubled) => p.evaluate(([cs, dbl]) => {
    const G = window.J2.G, W = G.world;
    G.runes = []; G.state = 'play';
    let x = 40; while (x < W.w - 40 && W.surface[x] > W.h) x++;
    const gx = x * 16, gy = (W.surface[x] - 2) * 16;
    G.player.x = gx; G.player.y = gy; G.player.vx = 0; G.player.vy = 0;
    G.player.inv = ['electric', null, null, null, null]; G.player.sel = 0; G.player.cooldown = 0;
    if (dbl) G.abilities.add('square');   // doubled E needs Squared Mind
    G.mobs = [];
    const made = cs.map(c => {
      const m = new (G.player.constructor === Object ? Object : window.J2.MobClass || Object)();
      return null;
    });
    // build mobs via the exported class list on G by cloning an existing spawn path
    G.mobs = cs.map(c => {
      const mob = window.J2.makeMob(gx + c.dx, gy + c.dy, c.type, c.friendly);
      return mob;
    });
    const before = G.mobs.map(m => m.hp);
    const vyBefore = G.player.vy;
    window.J2.usePower(G.player, 'E', dbl);
    return {
      vyBefore, vyAfter: Math.round(G.player.vy),
      results: cs.map((c, i) => ({
        label: c.label, type: c.type,
        dead: G.mobs[i].dead === true, hpBefore: before[i], hpAfter: G.mobs[i].hp,
      })),
    };
  }, [cases, doubled]);

  const cases = [
    { label: 'directly under his feet ', dx: 0,  dy: 24, type: 'slime' },
    { label: 'touching his left side  ', dx: -14, dy: 6, type: 'spikeling' },
    { label: 'touching his right side ', dx: 14, dy: 6, type: 'spikeling' },
    { label: 'one tile to the right   ', dx: 22, dy: 6, type: 'slime' },
    { label: 'three tiles away        ', dx: 60, dy: 6, type: 'slime' },
    { label: 'friendly pig underfoot  ', dx: 0,  dy: 22, type: 'pig' },
    { label: 'armoured guardian near  ', dx: -18, dy: 0, type: 'guardian' },
  ];
  const r = await run(cases, false);
  console.log('boost launched Jay: vy', r.vyBefore, '->', r.vyAfter, r.vyAfter < -300 ? '✓' : '*** no launch ***');
  for (const x of r.results)
    console.log('  ' + x.label, x.type.padEnd(10), 'hp', x.hpBefore, '->', String(x.hpAfter).padStart(3),
      x.dead ? 'KILLED' : 'survived');

  const r2 = await run([
    { label: 'far mob, normal reach   ', dx: 34, dy: 6, type: 'slime' },
  ], false);
  const r3 = await run([
    { label: 'far mob, TAB doubled    ', dx: 34, dy: 6, type: 'slime' },
  ], true);
  console.log('  ' + r2.results[0].label, r2.results[0].dead ? 'KILLED' : 'survived');
  console.log('  ' + r3.results[0].label, r3.results[0].dead ? 'KILLED' : 'survived', '(wider reach)');
  console.log('errors:', errs.length ? errs.join('|') : 'none');
  await b.close();
})();
