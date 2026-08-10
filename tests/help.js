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
  const st = () => p.evaluate(() => window.J2.G.state);
  const sel = () => p.evaluate(() => window.J2.G.player.sel);

  await p.screenshot({ path: path.join(SHOTS, 'help-title.png') });

  // ? from the title (real "?" = Shift + Slash)
  await p.keyboard.down('Shift'); await p.keyboard.press('Slash'); await p.keyboard.up('Shift');
  await p.waitForTimeout(300);
  console.log('title + "?" ->', await st(), '| helpFrom:', await p.evaluate(() => window.J2.G.helpFrom));
  await p.screenshot({ path: path.join(SHOTS, 'help-page.png') });

  await p.keyboard.press('Escape'); await p.waitForTimeout(250);
  console.log('ESC ->', await st());

  await p.keyboard.press('Space'); await p.waitForTimeout(400);
  console.log('SPACE ->', await st());

  // give powers so the cycle test is meaningful
  await p.evaluate(() => {
    const G = window.J2.G;
    ['earth','water','electric','lava','wind'].forEach((k,i)=>G.player.inv[i]=k);
    G.player.sel = -1; G.runes = [];
  });

  // ? during gameplay must NOT also cycle the inventory
  const before = await sel();
  await p.keyboard.down('Shift'); await p.keyboard.press('Slash'); await p.keyboard.up('Shift');
  await p.waitForTimeout(300);
  console.log('play + "?" ->', await st(), '| slot', before, '->', await sel(),
    (await sel()) === before ? 'unchanged ✓' : '*** SHIFT LEAKED ***');
  await p.screenshot({ path: path.join(SHOTS, 'help-ingame.png') });

  await p.keyboard.down('Shift'); await p.keyboard.press('Slash'); await p.keyboard.up('Shift');
  await p.waitForTimeout(250);
  console.log('"?" again ->', await st());

  // a plain Shift tap must still cycle
  const s0 = await sel();
  await p.keyboard.press('ShiftLeft'); await p.waitForTimeout(200);
  const s1 = await sel();
  console.log('plain SHIFT tap: slot', s0, '->', s1, s1 !== s0 ? 'cycled ✓' : '*** NO CYCLE ***');

  // help from pause, and H as an alias
  await p.keyboard.press('KeyP'); await p.waitForTimeout(200);
  console.log('P ->', await st());
  await p.keyboard.press('KeyH'); await p.waitForTimeout(250);
  console.log('H from pause ->', await st());
  await p.keyboard.press('KeyH'); await p.waitForTimeout(250);
  console.log('H closes ->', await st());
  // overflow audit: does any help text spill out of its lane?
  const over = await p.evaluate(() => {
    window.J2.G.helpFrom = 'play'; window.J2.G.state = 'help';
    const hud = document.getElementById('hud').getContext('2d');
    const UI = '"Trebuchet MS", system-ui, sans-serif';
    const x = 14, w = 480 - 28, keyW = 64;
    const colW = w / 2 - 22;
    const bad = [];
    for (const col of window.J2.HELP_COLUMNS) for (const r of col) {
      if (!r.d) continue;
      hud.font = 'normal 7.5px ' + UI;
      const dw = hud.measureText(r.d).width;
      if (dw > colW - keyW + 4) bad.push('desc too wide: "' + r.d + '" ' + dw.toFixed(1) + '>' + (colW - keyW + 4).toFixed(1));
    }
    const cellW = (w - 26) / 5;
    for (const k of window.J2.POWER_ORDER) {
      const d = window.J2.POWERS[k];
      hud.font = 'normal 6.5px ' + UI;
      const bw = hud.measureText('Q ' + d.qd + '  \u00b7  E ' + d.ed).width;
      if (bw > cellW - 2) bad.push('plant blurb overflows: ' + k + ' ' + bw.toFixed(1) + '>' + (cellW - 2).toFixed(1));
      hud.font = 'bold 7.5px ' + UI;
      const nw = hud.measureText(d.name.replace(' Plant','').replace(' Mushroom','')).width + 15;
      if (nw > cellW - 2) bad.push('plant name overflows: ' + k);
    }
    return bad;
  });
  console.log('layout overflow:', over.length ? over.join('\n  ') : 'none ✓');
  await p.screenshot({ path: path.join(SHOTS, 'help-page.png') });
  console.log('errors:', errs.length ? errs.join('|') : 'none');
  await b.close();
})();
