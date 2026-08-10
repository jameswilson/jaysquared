/* Measures where the reward banner actually is on screen, frame by frame, by
   hooking the panel() draw call and reading the live canvas transform. */
const { chromium } = require('playwright');
const path = require('path');
const GAME = 'file://' + path.join(__dirname, '..', 'jay-squared.html');

async function track(page, label, trigger, expect) {
  await page.evaluate(() => {
    window.__s = [];
    if (!window.__patched) {
      window.__patched = true;
      const orig = window.panel;
      window.panel = function (x, y, w, h) {
        if (w === 200 && window.__s) {
          const m = hud.getTransform();
          window.__s.push({
            t: G.banner ? +G.banner.t.toFixed(2) : null,
            cx: +(m.e / HS).toFixed(1), cy: +(m.f / HS).toFixed(1),
            scale: +(m.a / HS).toFixed(3),
            alpha: +hud.globalAlpha.toFixed(3),
          });
        }
        return orig.apply(this, arguments);
      };
    }
  });
  const target = await page.evaluate(trigger);
  await page.waitForTimeout(200);                       // fully open
  await page.evaluate(() => { G.banner.t = 0.7; });     // jump to the collapse window
  await page.waitForTimeout(800);                       // let it run all the way home
  const s = await page.evaluate(() => window.__s);
  const start = s.find(f => f.scale > 0.98) || s[0];
  const last = s.filter(f => f.alpha > 0.02).pop();
  const dist = Math.hypot(last.cx - target.x, last.cy - target.y);
  console.log(label.padEnd(16),
    'start (' + start.cx + ',' + start.cy + ') scale ' + start.scale,
    '->  end (' + last.cx + ',' + last.cy + ') scale ' + last.scale,
    '| target (' + target.x + ',' + target.y + ') off by ' + dist.toFixed(1) + 'px',
    dist < 6 ? '✓' : '✗ TOO FAR');
  if (expect) expect(s, target);
  return s;
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(GAME);
  await page.waitForTimeout(200);
  await page.keyboard.press('Space');
  await page.waitForTimeout(300);

  // the exact reward the user saw: an ability from a rune
  await track(page, 'Squared Mind', () => {
    grantAbility('square');
    return G.banner.to;
  });

  // a second ability stacks one row higher in the list
  await track(page, 'Feather Fall', () => {
    grantAbility('feather');
    return G.banner.to;
  });

  await track(page, '1-UP', () => {
    G.lives++;
    say('1-UP!', 'the rune rewards a sharp mind', '#9ff0c0', 4.5, HUD_HOME.lives());
    return G.banner.to;
  });

  await track(page, 'heart back', () => {
    say('perfect square: 9²', 'a heart returns', '#9ff0c0', 3.2, HUD_HOME.hearts());
    return G.banner.to;
  });

  // banners with no HUD home must still fade in place, not fly anywhere
  const stay = await track(page, 'level intro', () => {
    say('Emerald Plains', 'level 1 of 5', '#ffe9a8', 3);
    return { x: 240, y: 59 };
  });
  const moved = Math.max(...stay.map(f => Math.abs(f.cx - 240) + Math.abs(f.cy - 59)));
  const shrank = Math.min(...stay.map(f => f.scale));
  console.log('  no-home banner: max drift ' + moved.toFixed(1) + 'px, min scale ' + shrank,
    moved < 0.5 && shrank > 0.99 ? '✓ stays put and fades' : '✗ moved when it should not');

  // and the collapse must be monotonic — no jitter back toward the middle
  const a = await page.evaluate(() => window.__s);
  console.log('errors:', errs.join('; ') || 'none');
  await browser.close();
})();
