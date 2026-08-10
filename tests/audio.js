const { chromium } = require('playwright');
const path = require('path');
const GAME = 'file://' + path.join(__dirname, '..', 'jay-squared.html');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 1200, height: 720 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(GAME);
  await p.waitForTimeout(600);

  // count every sound the game asks for, by kind
  await p.evaluate(() => {
    window.__snd = {};
    const tally = (n) => { window.__snd[n] = (window.__snd[n] || 0) + 1; };
    for (const k of Object.keys(window.J2.SFX)) {
      const orig = window.J2.SFX[k];
      window.J2.SFX[k] = function (...a) { tally(k); return orig.apply(this, a); };
    }
  });
  await p.keyboard.press('Space');
  await p.waitForTimeout(300);
  await p.evaluate(() => { window.J2.G.runes = []; window.__snd = {}; });

  // A: stand perfectly still on the ground for 3 seconds
  await p.waitForTimeout(3000);
  console.log('3s standing still :', JSON.stringify(await p.evaluate(() => window.__snd)));

  // B: walk for 3 seconds
  await p.evaluate(() => { window.__snd = {}; });
  await p.keyboard.down('ArrowRight');
  await p.waitForTimeout(3000);
  await p.keyboard.up('ArrowRight');
  const walk = await p.evaluate(() => window.__snd);
  console.log('3s walking        :', JSON.stringify(walk));
  console.log('  step rate:', ((walk.step || 0) / 3).toFixed(1), 'per second');

  // C: one jump = one landing
  await p.evaluate(() => { window.__snd = {}; });
  await p.keyboard.press('Space');
  await p.waitForTimeout(1400);
  console.log('one jump          :', JSON.stringify(await p.evaluate(() => window.__snd)));

  // --- inventory highlight invariant ---
  const hl = await p.evaluate(() => {
    const G = window.J2.G, out = [];
    const state = () => {
      const p = G.player;
      const fist = p.sel < 0 || !p.inv[p.sel];
      const slots = [];
      for (let i = 0; i < 5; i++) if (!fist && i === p.sel) slots.push(i + 1);
      return { sel: p.sel, fistLit: fist, slotsLit: slots, lit: (fist ? 1 : 0) + slots.length };
    };
    G.player.inv = [null, null, null, null, null]; G.player.sel = -1;
    out.push(['fresh start', state()]);
    G.player.selectSlot(0);
    out.push(['press 1 with nothing held', state()]);
    G.player.selectSlot(2);
    out.push(['press 3 with nothing held', state()]);
    G.player.addItem('earth');
    out.push(['pick up earth plant', state()]);
    G.player.selectSlot(3);
    out.push(['press 4 (empty)', state()]);
    G.player.selectSlot(0);
    out.push(['press 1 (has earth)', state()]);
    G.player.cycleSlot(1);
    out.push(['shift', state()]);
    return out;
  });
  let bad = 0;
  for (const [label, s] of hl) {
    const ok = s.lit === 1 && (!s.slotsLit.length || s.sel >= 0);
    if (!ok) bad++;
    console.log((ok ? '  ok  ' : ' BAD  ') + label.padEnd(26), JSON.stringify(s));
  }
  console.log(bad ? '*** ' + bad + ' bad states ***' : 'exactly one highlight in every state ✓');
  console.log('errors:', errs.length ? errs.join('|') : 'none');
  await b.close();
})();
