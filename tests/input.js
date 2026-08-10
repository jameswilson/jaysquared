const { chromium } = require('playwright');
const path = require('path');
const GAME = 'file://' + path.join(__dirname, '..', 'jay-squared.html');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 1200, height: 720 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(GAME);
  await p.waitForTimeout(700);
  await p.keyboard.press('Space');
  await p.waitForTimeout(300);
  const sel = () => p.evaluate(() => window.J2.G.player.sel);
  const give = (...ks) => p.evaluate((kk) => {
    const G = window.J2.G;
    G.player.inv = [null, null, null, null, null];
    kk.forEach((k, i) => { if (k) G.player.inv[i] = k; });
    G.player.sel = -1;
    G.runes = [];
  }, ks);

  // --- numpad slot keys ---
  await give('earth', 'water', 'electric', 'lava', 'wind');
  const npad = [];
  for (const k of ['Numpad3', 'Numpad1', 'Numpad5', 'Numpad0', 'Numpad2']) {
    await p.keyboard.press(k); await p.waitForTimeout(120);
    npad.push(k + '->' + await sel());
  }
  console.log('numpad slots:', npad.join('  '));

  const trow = [];
  for (const k of ['Digit4', 'Digit0', 'Digit2']) {
    await p.keyboard.press(k); await p.waitForTimeout(120);
    trow.push(k + '->' + await sel());
  }
  console.log('top row    :', trow.join('  '));

  // --- shift cycling, full inventory ---
  await give('earth', 'water', 'electric', 'lava', 'wind');
  let ring = [await sel()];
  for (let i = 0; i < 7; i++) { await p.keyboard.press('ShiftLeft'); await p.waitForTimeout(110); ring.push(await sel()); }
  console.log('shift (5 items):', ring.join(' → '));

  // --- shift cycling skips empty slots ---
  await give(null, 'water', null, null, 'wind');
  ring = [await sel()];
  for (let i = 0; i < 5; i++) { await p.keyboard.press('ShiftRight'); await p.waitForTimeout(110); ring.push(await sel()); }
  console.log('shift (slots 2+5 only):', ring.join(' → '));

  // --- shift with nothing held ---
  await give();
  ring = [await sel()];
  for (let i = 0; i < 3; i++) { await p.keyboard.press('ShiftLeft'); await p.waitForTimeout(110); ring.push(await sel()); }
  console.log('shift (empty bag):', ring.join(' → '));

  // --- numpad answers a rune ---
  await p.evaluate(() => {
    const G = window.J2.G;
    window.J2.buildLevel(0);
    G.state = 'play';
    G.player.x = G.runes[0].x; G.player.y = G.runes[0].y;
  });
  await p.waitForTimeout(500);
  const ans = await p.evaluate(() => window.J2.G.state === 'rune' ? window.J2.G.rune.ans : null);
  console.log('rune opened, answer is', ans);
  for (const ch of String(ans)) { await p.keyboard.press('Numpad' + ch); await p.waitForTimeout(90); }
  const typed = await p.evaluate(() => window.J2.G.rune && window.J2.G.rune.input);
  await p.keyboard.press('NumpadEnter');
  await p.waitForTimeout(300);
  const res = await p.evaluate(() => window.J2.G.rune ? window.J2.G.rune.msg : 'closed');
  console.log('numpad typed "' + typed + '", NumpadEnter ->', res);
  console.log('errors:', errs.length ? errs.join('|') : 'none');
  await b.close();
})();
