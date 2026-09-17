const { chromium } = require('playwright');
const path = require('path');
const assert = require('assert');
const GAME = 'file://' + path.join(__dirname, '..', 'jay-squared.html');
const CHROMIUM = process.env.J2_CHROMIUM || (process.platform === 'darwin'
  ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  : '/opt/pw-browsers/chromium');

(async () => {
  const browser = await chromium.launch({ executablePath: CHROMIUM });
  const page = await browser.newPage({ viewport: { width: 1200, height: 720 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));

  try {
    await page.goto(GAME);
    await page.waitForTimeout(650);
    await page.keyboard.press('Space');
    await page.waitForTimeout(250);
    await page.evaluate(() => {
      const items = Array.from({ length: 50 }, (_, i) => ({ label: 'TEST ' + (i + 1), run: () => {} }));
      window.J2.GLITCH_ROOT.splice(0, window.J2.GLITCH_ROOT.length, { label: 'TEST.SUBMENU', sub: items });
      window.J2.openGlitchMenu('cheat');
      window.J2.G.glitch.boot = 0;
    });

    const press = async key => {
      await page.keyboard.press(key);
      await page.waitForTimeout(60);
    };

    // Test a long submenu and a long root list with the real keyboard handlers.
    await press('Enter');
    for (let i = 0; i < 49; i++) await press('ArrowDown');
    const lastSubmenu = await page.evaluate(() => ({ ...window.J2.G.glitch, rows: window.J2.GLITCH_MENU_ROWS }));
    assert.strictEqual(lastSubmenu.sel, 49);
    assert(lastSubmenu.sel >= lastSubmenu.scroll && lastSubmenu.sel < lastSubmenu.scroll + lastSubmenu.rows);

    await press('ArrowDown');
    const wrappedSubmenu = await page.evaluate(() => ({ ...window.J2.G.glitch, rows: window.J2.GLITCH_MENU_ROWS }));
    assert.strictEqual(wrappedSubmenu.sel, 0);
    assert.strictEqual(wrappedSubmenu.scroll, 0);

    await press('Escape');
    await page.evaluate(() => {
      const items = Array.from({ length: 50 }, (_, i) => ({ label: 'ROOT ' + (i + 1), run: () => {} }));
      window.J2.GLITCH_ROOT.splice(0, window.J2.GLITCH_ROOT.length, ...items);
      window.J2.G.glitch.sel = 0;
      window.J2.G.glitch.scroll = 0;
    });
    for (let i = 0; i < 49; i++) await press('ArrowDown');
    const lastRoot = await page.evaluate(() => ({ ...window.J2.G.glitch, rows: window.J2.GLITCH_MENU_ROWS }));
    assert.strictEqual(lastRoot.sel, 49);
    assert(lastRoot.sel >= lastRoot.scroll && lastRoot.sel < lastRoot.scroll + lastRoot.rows);
    assert.deepStrictEqual(errors, []);
    console.log('hack menu scrolling keeps focused commands visible in long root and submenu lists ✓');
    console.log('errors: none');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
