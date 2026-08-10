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
  await p.waitForTimeout(650);
  const imm = () => p.evaluate(() => window.J2.G.immortal);
  const type = async (s, pad = 'Digit') => {
    for (const c of s) { await p.keyboard.press(pad + c); await p.waitForTimeout(70); }
  };

  console.log('at boot                 :', await imm());
  await type('144');
  await p.waitForTimeout(200);
  console.log('typed 144 on title      :', await imm());
  await p.screenshot({ path: path.join(SHOTS, 'cheat-title.png') });

  // toggles off, and back on via the number pad
  await type('144');  await p.waitForTimeout(150);
  console.log('typed 144 again (toggle):', await imm());
  await type('144', 'Numpad'); await p.waitForTimeout(150);
  console.log('numpad 144              :', await imm());

  // noise before the code must not block it
  await type('144'); await p.waitForTimeout(120);   // off
  await type('90271442');  await p.waitForTimeout(150);
  console.log('embedded in "90271442"  :', await imm(), '(should be true)');
  await type('144'); await p.waitForTimeout(120);
  console.log('back off                :', await imm());

  // now play, and confirm it survives starting a run
  await type('144'); await p.waitForTimeout(150);
  await p.keyboard.press('Space'); await p.waitForTimeout(600);
  await p.evaluate(() => { window.J2.G.runes = []; });
  console.log('survives startRun()     :', await imm(), '| lives', await p.evaluate(() => window.J2.G.lives));

  // kill him repeatedly: void, then hazard
  const before = await p.evaluate(() => ({ lives: window.J2.G.lives }));
  for (let i = 0; i < 4; i++) {
    await p.evaluate(() => { window.J2.G.player.y = (window.J2.G.world.h + 6) * 16; });
    await p.waitForTimeout(280);
  }
  const afterVoid = await p.evaluate(() => ({
    lives: window.J2.G.lives, state: window.J2.G.state,
    hp: window.J2.G.player.hp, y: Math.round(window.J2.G.player.y),
  }));
  console.log('4 void falls            :', JSON.stringify(afterVoid), '| lives', before.lives, '->', afterVoid.lives);

  for (let i = 0; i < 6; i++) {
    await p.evaluate(() => { const p2 = window.J2.G.player; p2.invuln = 0; p2.hurt(3, 0); });
    await p.waitForTimeout(200);
  }
  console.log('6 fatal hits            :', JSON.stringify(await p.evaluate(() => ({
    lives: window.J2.G.lives, state: window.J2.G.state, hp: window.J2.G.player.hp,
  }))));
  await p.screenshot({ path: path.join(SHOTS, 'cheat-hud.png') });

  // and with it OFF, dying still works
  await p.evaluate(() => { window.J2.G.immortal = false; window.J2.G.lives = 1; });
  await p.evaluate(() => { window.J2.G.player.y = (window.J2.G.world.h + 6) * 16; });
  await p.waitForTimeout(400);
  console.log('with cheat off, void    :', JSON.stringify(await p.evaluate(() => ({
    lives: window.J2.G.lives, state: window.J2.G.state,
  }))), '(should be state=dead)');

  // digits during play must still pick slots, not trip the code
  await p.evaluate(() => {
    const G = window.J2.G, W = G.world;
    G.immortal = false; G.lives = 3; G.codeBuf = '';
    let x = 30; while (x < W.w - 30 && W.surface[x] > W.h) x++;
    G.player.x = x * 16; G.player.y = (W.surface[x] - 3) * 16;   // back on solid ground
    G.player.vy = 0; G.player.hp = 3; G.player.sel = -1;
    ['earth','water','electric','lava','wind'].forEach((k,i)=>G.player.inv[i]=k);
    G.state = 'play';
  });
  await p.waitForTimeout(300);
  await type('144'); await p.waitForTimeout(200);
  console.log('typing 144 mid-play     : immortal =', await imm(),
    '(should be false) | slot =', await p.evaluate(() => window.J2.G.player.sel));
  console.log('errors:', errs.length ? errs.join('|') : 'none');
  await b.close();
})();
