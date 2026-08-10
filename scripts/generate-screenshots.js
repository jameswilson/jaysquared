/* Regenerates the localised docs/*.png screenshots (title, gameplay, rune,
   glitch, help) in English, Spanish and German.

   Every scene is reached by poking window.J2.G directly (same technique the
   tests/ suite uses) rather than by driving real key presses, so the shots
   are pixel-for-pixel reproducible: the levels are seeded (src/20-world.js),
   so buildLevel(0) always lays out the same Emerald Plains.

   Usage:   node scripts/generate-screenshots.js
   Launches via the `chrome` channel, i.e. your system-installed Google
   Chrome, rather than Playwright's own managed chromium build — this avoids
   Playwright's OS-version gate on chrome-headless-shell (e.g. old macOS).
   Needs Google Chrome installed locally, or run it in CI instead. */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const GAME = 'file://' + path.join(__dirname, '..', 'jay-squared.html');
const DOCS = path.join(__dirname, '..', 'docs');
fs.mkdirSync(DOCS, { recursive: true });

const LANGS = ['en', 'es', 'de'];

async function shootTitle(page, lang) {
  await page.evaluate((lang) => {
    const { G } = window.J2;
    G.lang = lang;
    window.J2.buildLevel(0);
    G.state = 'title';
  }, lang);
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(DOCS, `title.${lang}.png`) });
}

async function shootGameplay(page, lang) {
  await page.evaluate((lang) => {
    const { G } = window.J2;
    G.lang = lang;
    window.J2.buildLevel(0);
    const h = G.world.hints[0];
    G.state = 'play';
    G.player.x = h.x - 5; G.player.y = h.y + 40;
    G.cam.x = h.x - 240; G.cam.y = h.y - 90;
    G.gems = 50; G.lives = 3; G.player.hp = G.player.maxHp;
  }, lang);
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(DOCS, `gameplay.${lang}.png`) });
}

async function shootRune(page, lang) {
  await page.evaluate((lang) => {
    const { G } = window.J2;
    G.lang = lang;
    window.J2.buildLevel(0);
    G.state = 'play';
    const r = G.runes[0];
    G.player.x = r.x; G.player.y = r.y;
    G.cam.x = r.x - 240; G.cam.y = r.y - 135;
  }, lang);
  await page.waitForTimeout(500);
  const state = await page.evaluate(() => window.J2.G.state);
  if (state !== 'rune') throw new Error(`expected rune state, got "${state}"`);
  await page.screenshot({ path: path.join(DOCS, `rune.${lang}.png`) });
}

async function shootGlitch(page, lang) {
  await page.evaluate((lang) => {
    const { G } = window.J2;
    G.lang = lang;
    window.J2.buildLevel(0);
    G.state = 'play'; G.runes = [];
    G.player.inv[0] = 'lava'; G.player.sel = 0; G.player.cooldown = 0;
    window.J2.usePower(G.player, 'Q', false);
  }, lang);
  await page.waitForTimeout(60);
  await page.evaluate(() => { window.J2.G.player.y = (window.J2.G.world.h + 5) * 16; });
  await page.waitForTimeout(1500);
  const state = await page.evaluate(() => window.J2.G.state);
  if (state !== 'glitch') throw new Error(`expected glitch state, got "${state}"`);
  await page.screenshot({ path: path.join(DOCS, `glitch.${lang}.png`) });
}

async function shootHelp(page, lang) {
  await page.evaluate((lang) => {
    const { G } = window.J2;
    G.lang = lang;
    G.helpFrom = 'title';
    G.state = 'help';
  }, lang);
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(DOCS, `help.${lang}.png`) });
}

const SCENES = [
  ['title', shootTitle],
  ['gameplay', shootGameplay],
  ['rune', shootRune],
  ['glitch', shootGlitch],
  ['help', shootHelp],
];

(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

  await page.goto(GAME);
  await page.waitForTimeout(500);

  for (const lang of LANGS) {
    for (const [name, shoot] of SCENES) {
      await shoot(page, lang);
      console.log(`wrote docs/${name}.${lang}.png`);
    }
  }

  console.log(errors.length ? 'errors:\n' + errors.join('\n') : 'errors: none');
  await browser.close();
  if (errors.length) process.exitCode = 1;
})();
