const { chromium } = require('playwright');
const path = require('path');
const assert = require('assert');
const GAME = 'file://' + path.join(__dirname, '..', 'jay-squared.html');
const CHROMIUM = process.env.J2_CHROMIUM || (process.platform === 'darwin'
  ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  : '/opt/pw-browsers/chromium');

(async () => {
  const b = await chromium.launch({ executablePath: CHROMIUM });
  const p = await b.newPage({ viewport: { width: 1200, height: 720 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));

  try {
    await p.goto(GAME);
    await p.waitForTimeout(650);
    await p.keyboard.press('Space');
    await p.waitForTimeout(250);

    await p.evaluate(() => {
      const G = window.J2.G;
      G.player.inv[0] = 'earth';
      G.player.sel = 0;
      window.J2.openGlitchMenu('cheat');
    });
    await p.waitForTimeout(1300);

    const invalid = await p.evaluate(() => {
      const before = window.J2.G.world;
      return {
        below: window.skipToLevel(-1),
        above: window.skipToLevel(window.J2.LEVELS.length),
        unchanged: window.J2.G.world === before && window.J2.G.state === 'glitch',
      };
    });
    assert.deepStrictEqual(invalid, { below: false, above: false, unchanged: true });

    const press = async key => {
      await p.keyboard.press(key);
      await p.waitForTimeout(60);
    };

    const levelCount = await p.evaluate(() => window.J2.LEVELS.length);
    for (let target = 0; target < levelCount; target++) {
      if (target > 0) {
        await p.evaluate(() => {
          window.J2.openGlitchMenu('cheat');
          window.J2.G.glitch.boot = 0;
        });
        await p.waitForTimeout(60);
      }

      // LEVEL.SKIP is the fourth root command. For the last target, ArrowUp
      // wraps from the first submenu entry to the final level.
      for (let i = 0; i < 3; i++) await press('ArrowDown');
      await press('Enter');
      if (target === levelCount - 1) await press('ArrowUp');
      else for (let i = 0; i < target; i++) await press('ArrowDown');
      await press('Enter');
      await p.waitForTimeout(120);

      const result = await p.evaluate(() => ({
        state: window.J2.G.state,
        level: window.J2.G.level,
        worldIndex: window.J2.G.world.index,
        inventory: window.J2.G.player.inv.slice(),
      }));
      assert.deepStrictEqual(result, {
        state: 'play',
        level: target,
        worldIndex: target,
        inventory: ['earth', null, null, null, null],
      });
    }
    assert.deepStrictEqual(errs, []);
    console.log('LEVEL.SKIP -> all five levels, resumed play, inventory preserved ✓');
    console.log('errors: none');
  } finally {
    await b.close();
  }
})().catch(err => {
  console.error(err);
  process.exit(1);
});
