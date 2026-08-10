const { chromium } = require('playwright');
const path = require('path');
const GAME = 'file://' + path.join(__dirname, '..', 'jay-squared.html');
const SHOTS = path.join(__dirname, 'shots');
require('fs').mkdirSync(SHOTS, { recursive: true });
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 1400, height: 800 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(GAME);
  await p.waitForTimeout(650);
  await p.evaluate(() => { window.J2.G.helpFrom = 'title'; window.J2.G.state = 'help'; });
  await p.waitForTimeout(300);

  const rows = await p.evaluate(() => {
    const c = document.getElementById('hud'), g = c.getContext('2d');
    const W = c.width, HS = 3;
    const d = g.getImageData(0, 0, W, c.height).data;
    const ink = (x0, x1, y0, y1, test) => {
      let min = 1e9, max = -1, n = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const i = (y * W + x) * 4;
        if (test(d[i], d[i + 1], d[i + 2])) { n++; if (y < min) min = y; if (y > max) max = y; }
      }
      return n < 8 ? null : { c: (min + max) / 2, n };
    };
    // warm amber ink (keycap glyphs) vs cool pale ink (descriptions)
    const capText = (r, gg, bb) => r > 212 && gg > 196 && bb > 150 && bb < 226;   // #ffeec0 glyph only, not the dimmer border
    const pale    = (r, gg, bb) => bb > 175 && (bb - r) > 8 && gg > 150;
    return window.J2.G.helpRows.map(r => {
      const y0 = Math.round((r.cy - 6) * HS), y1 = Math.round((r.cy + 6) * HS);
      const k = r.hasKey ? ink(Math.round((r.keyX + 1) * HS), Math.round((r.descX - 6) * HS), y0, y1, capText) : null;
      const t = ink(Math.round(r.descX * HS), Math.round((r.descX + 130) * HS), y0, y1, pale);
      return {
        text: r.text.slice(0, 28), hasKey: r.hasKey,
        glyphInCap: (k && r.capCentre !== null) ? +((k.c / HS) - r.capCentre).toFixed(2) : null,
        capVsRow: r.capCentre !== null ? +(r.capCentre - r.cy).toFixed(2) : null,
        textVsRowCentre: t ? +((t.c / HS) - r.cy).toFixed(2) : null,
      };
    });
  });
  let wGlyph = 0, wCap = 0, wText = 0;
  for (const r of rows) {
    if (r.glyphInCap !== null) wGlyph = Math.max(wGlyph, Math.abs(r.glyphInCap));
    if (r.capVsRow !== null) wCap = Math.max(wCap, Math.abs(r.capVsRow));
    if (r.textVsRowCentre !== null) wText = Math.max(wText, Math.abs(r.textVsRowCentre));
    console.log('  ' + (r.hasKey ? 'key ' : '    ') + r.text.padEnd(30),
      'glyph off-centre in cap:', String(r.glyphInCap).padStart(6),
      '| cap vs row:', String(r.capVsRow).padStart(5),
      '| text vs row:', r.textVsRowCentre);
  }
  console.log('worst glyph off-centre in cap :', wGlyph.toFixed(2), 'view px', wGlyph <= 0.7 ? '\u2713' : '*** BAD ***');
  console.log('worst cap off row centre      :', wCap.toFixed(2), 'view px', wCap <= 0.7 ? '\u2713' : '*** BAD ***');
  console.log('worst text off row centre     :', wText.toFixed(2), 'view px', wText <= 1.0 ? '\u2713' : '*** BAD ***');
  await p.screenshot({ path: path.join(SHOTS, 'align-help.png') });
  console.log('errors:', errs.length ? errs.join('|') : 'none');
  await b.close();
})();
