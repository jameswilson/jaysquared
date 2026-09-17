/* ==========================================================================
   JAY'S MATHEMATICS — perfect-square milestones, math runes, progression
   ========================================================================== */

const ABILITIES = {
  swift:   { get name() { return TR('Swift Feet'); },   get desc() { return TR('Jay runs faster'); } },
  magnet:  { get name() { return TR('Gem Magnet'); },   get desc() { return TR('gems come to you'); } },
  heart:   { get name() { return TR('Extra Heart'); },  get desc() { return TR('one more heart'); } },
  square:  { get name() { return TR('Squared Mind'); }, get desc() { return TR('TAB doubles E as well as Q'); } },
  feather: { get name() { return TR('Feather Fall'); }, get desc() { return TR('you fall gently'); } },
};

function grantAbility(key) {
  if (!key) {
    const pool = Object.keys(ABILITIES).filter(k => !G.abilities.has(k));
    if (!pool.length) { G.lives++; say(TR('1-UP'), TR('all abilities already found'), '#9ff0c0', 4.5, HUD_HOME.lives()); SFX.oneUp(); return; }
    key = pool[Math.floor(Math.random() * pool.length)];
  }
  G.abilities.add(key);
  if (key === 'heart') { G.player.maxHp++; G.player.heal(2); }
  // collapses into the row this ability now occupies in the bottom-left list
  say(TRF('abilityLabel', ABILITIES[key].name), ABILITIES[key].desc, '#c7a8ff', 4.5,
    HUD_HOME.ability(G.abilities.size - 1));
  SFX.oneUp();
}

/* ---------------------- perfect-square milestones ------------------------ */
function collectGem(x, y) {
  G.gems++;
  G.score += 25;
  SFX.gem();
  for (let i = 0; i < 6; i++)
    spawnParticle(x, y, (Math.random() - .5) * 120, (Math.random() - .5) * 120 - 40, '#59e6a0', 0.4);

  const n = G.gems;
  if (n > 1 && isPerfectSquare(n)) {
    const r = Math.round(Math.sqrt(n));
    G.score += n * 10;
    G.pops.push({ x, y: y - 12, t: 1.6, text: n + ' = ' + r + '²', color: '#9ff0c0' });
    SFX.square();
    G.flash = Math.max(G.flash, 0.12);
    if (!G.squaresFound.has(n)) {
      G.squaresFound.add(n);
      if (r % 5 === 0) { G.lives++; say(TR('1-UP!'), TRF('gemsSquared', n, r), '#9ff0c0', 4.5, HUD_HOME.lives()); SFX.oneUp(); }
      else if (r % 3 === 0) { G.player.heal(1); say(TRF('perfectSquareHeart', r), TR('a heart returns'), '#9ff0c0', 3.2, HUD_HOME.hearts()); }
      else if (r === 4) { grantAbility('magnet'); }
      else say(TR('perfect square'), n + ' = ' + r + ' × ' + r, '#9ff0c0', 2);
    }
  }
}

/* ------------------------------ runes ------------------------------------ */
function makeProblem(tier) {
  const R = (n) => 1 + Math.floor(Math.random() * n);
  let a, b, text, ans;
  switch (clamp(tier, 0, 4)) {
    case 0:
      if (Math.random() < 0.5) { a = R(12); b = R(12); text = a + ' + ' + b; ans = a + b; }
      else { a = R(9) + 6; b = R(a - 1); text = a + ' − ' + b; ans = a - b; }
      break;
    case 1:
      a = R(10); b = [2, 5, 10][Math.floor(Math.random() * 3)];
      text = a + ' × ' + b; ans = a * b;
      break;
    case 2:
      if (Math.random() < 0.5) { a = R(6); b = R(6); text = a + ' × ' + b; ans = a * b; }
      else { a = R(40) + 20; b = R(30); text = a + ' + ' + b; ans = a + b; }
      break;
    case 3:
      if (Math.random() < 0.6) { a = R(10); b = R(10); text = a + ' × ' + b; ans = a * b; }
      else { a = R(6); text = a + '²'; ans = a * a; }
      break;
    default:
      if (Math.random() < 0.5) { a = R(10); text = a + '²'; ans = a * a; }
      else { a = R(9) + 1; b = R(9) + 1; text = a + ' × ' + b + ' + ' + a; ans = a * b + a; }
      break;
  }
  return { text, ans };
}

function openRune(rune) {
  const p = makeProblem(G.level);
  G.rune = { rune, q: p.text, ans: p.ans, input: '', msg: '', t: 0, done: false, kind: rune.kind };
  G.state = 'rune';
  Audio2.arp([523, 698, 880], 0.07, 'triangle');
}

function updateRune(dt) {
  const R = G.rune;
  R.t += dt;
  if (R.done) {
    R.doneT -= dt;
    if (R.doneT <= 0) { G.rune = null; G.state = 'play'; }
    return;
  }
  /* Read key CODES, so the number pad answers runes too (Num Lock either way). */
  for (const code of Keys.pressed) {
    if (R.done || !G.rune) break;
    const d = digitFromCode(code);
    if (d !== null) {
      if (R.input.length < 4) R.input += String(d);
      Audio2.blip(700, 0.03, 'square', 0.3);
      continue;
    }
    if (code === 'Backspace' || code === 'Delete') {
      R.input = R.input.slice(0, -1);
      Audio2.blip(300, 0.03, 'square', 0.3);
    } else if (code === 'Enter' || code === 'NumpadEnter') {
      submitRune();
    } else if (code === 'Escape') {
      R.rune.cool = 2.5; G.rune = null; G.state = 'play';
    }
  }
}

function submitRune() {
  const R = G.rune;
  if (R.input === '') return;
  const val = parseInt(R.input, 10);
  if (val === R.ans) {
    R.done = true; R.doneT = 1.5; R.msg = 'CORRECT'; R.msgKind = 'correct';
    R.rune.used = true; R.rune.dead = true;
    G.score += 500;
    for (let i = 0; i < 30; i++)
      spawnParticle(R.rune.cx, R.rune.cy, (Math.random() - .5) * 240, (Math.random() - .5) * 240, '#c7a8ff', 0.8);
    setTimeout(() => {
      if (R.kind === 'oneup') { G.lives++; say(TR('1-UP!'), TR('the rune rewards a sharp mind'), '#9ff0c0', 4.5, HUD_HOME.lives()); SFX.oneUp(); }
      else if (R.kind === 'ability') grantAbility(null);
      else { for (let i = 0; i < 9; i++) setTimeout(() => collectGem(G.player.cx, G.player.cy - 8), i * 90); }
    }, 500);
  } else {
    R.done = true; R.doneT = 1.4; R.msg = 'NOT QUITE — it was ' + R.ans; R.msgKind = 'wrong';
    R.rune.cool = 3.5;
    Audio2.blip(160, 0.25, 'sawtooth', 0.6, -60);
  }
}

/* --------------------------- progression -------------------------------- */
function buildLevel(index) {
  G.level = index;
  const W = generateLevel(index);
  G.world = W;
  G.mobs = []; G.items = []; G.gemEnts = []; G.runes = [];
  G.shots = []; G.hazards = []; G.parts = []; G.pops = [];

  for (const s of W.itemSpots) G.items.push(new ItemPickup(s.x, s.y - 13, s.kind));
  for (const s of W.gemSpots) G.gemEnts.push(new Gem(s.x, s.y));
  for (const s of W.runeSpots) G.runes.push(new Rune(s.x, s.y, s.kind));
  for (const s of W.mobSpots) G.mobs.push(new Mob(s.x, s.y, s.type));

  const keepInv = G.player ? G.player.inv.slice() : [null, null, null, null, null];
  const keepHp = G.player ? G.player.hp : 3;
  const keepMax = G.player ? G.player.maxHp : 3;
  const keepSel = G.player ? G.player.sel : -1;
  G.player = new Player(W.spawn.x, W.spawn.y);
  G.player.inv = keepInv;
  G.player.maxHp = keepMax;
  G.player.hp = Math.max(1, keepHp);
  G.player.sel = keepInv[keepSel] ? keepSel : -1;
  G.spawnSafe = { x: W.spawn.x, y: W.spawn.y };
  G.cam.x = clamp(G.player.cx - VIEW_W / 2, 0, W.w * TILE - VIEW_W);
  G.cam.y = clamp(G.player.cy - VIEW_H / 2, 0, W.h * TILE - VIEW_H);
  G.levelTime = 0;
  G.glitchUsedHere = false;      // the tear can be found once per level
  say(W.name, TRF('levelOfTotal', index + 1, LEVELS.length), '#ffe9a8', 3);
}

function startRun() {
  G.gems = 0; G.lives = 3; G.score = 0; G.kills = 0;
  G.abilities = new Set();
  G.squaresFound = new Set();
  G.player = null;
  G.langPickT = 0;
  resetPhysics();
  buildLevel(0);
  G.state = 'play';
}

function completeLevel() {
  G.state = 'levelclear';
  G.clearT = 2.6;
  G.score += 1000 + G.player.hp * 250;
  SFX.door();
  say(TR('LEVEL CLEAR'), G.world.name, '#ffe9a8', 2.6);
}

/* ======================= THE 144 CODE (12²) ==============================
   Type 1-4-4 on the title, the pause screen or the game-over screen. Death is
   then replaced by a rescue: Jay still takes hits and still gets knocked about,
   but he is put back on the last solid ground he stood on instead of dying, and
   the life count never falls. ======================================== */
function toggleImmortal() {
  G.immortal = !G.immortal;
  G.codeBuf = '';
  if (G.immortal) {
    Audio2.arp([392, 523, 659, 784, 1046, 1318], 0.06, 'triangle');
    say(TR('EXPLORER MODE ON'), TR('144 = 12²  •  Jay cannot die'), '#9ff0c0', 4.5);
  } else {
    Audio2.arp([784, 587, 392], 0.07, 'square');
    say(TR('explorer mode off'), TR('back to five lives'), '#ff9d6b', 3);
  }
  G.flash = 0.3;
}

/* Watches for the code. Only called in states where digits do nothing else, so
   it can never collide with picking an inventory slot. */
function checkCheatCode() {
  for (const code of Keys.pressed) {
    const d = digitFromCode(code);
    if (d === null) continue;
    G.codeBuf = (G.codeBuf + d).slice(-6);
    if (G.codeBuf.endsWith('144')) toggleImmortal();
    if (G.codeBuf.endsWith('169')) {
      G.codeBuf = '';
      openGlitchMenu('cheat');
    }
  }
}

function rescue(reason) {
  const W = G.world, p = G.player;
  const sp = G.spawnSafe || W.spawn;
  p.x = sp.x; p.y = sp.y - 4;
  p.vx = 0; p.vy = 0;
  p.hp = p.maxHp;
  p.invuln = 2;
  p.jumpChain = 0;
  G.shots = [];
  G.flash = 0.22;
  SFX.oneUp();
  say(TR('rescued'), reason, '#9ff0c0', 2.2);
  for (let i = 0; i < 26; i++)
    spawnParticle(p.cx, p.cy, (Math.random() - .5) * 220, (Math.random() - .5) * 220, '#9ff0c0', 0.7);
}

function playerDied(cause) {
  if (G.state !== 'play') return;
  if (G.immortal) {
    rescue(cause === 'the void' ? TR('the void gave you back') : TR('that would have hurt'));
    return;
  }
  G.state = 'dead';
  G.deadT = 2.0;
  G.lives--;
  SFX.death();
  const p = G.player;
  for (let i = 0; i < 26; i++)
    spawnParticle(p.cx, p.cy, (Math.random() - .5) * 260, (Math.random() - .9) * 300, '#8fb8ff', 0.9);
}

function respawn() {
  const W = G.world;
  if (G.lives < 0) { G.state = 'gameover'; G.overT = 4; return; }
  const inv = G.player.inv.slice();
  const maxHp = G.player.maxHp;
  const sel = G.player.sel;
  const sp = G.spawnSafe || W.spawn;
  G.player = new Player(sp.x, sp.y - 4);
  G.player.inv = inv;
  G.player.maxHp = maxHp;
  G.player.sel = inv[sel] ? sel : -1;
  G.player.hp = maxHp;
  G.player.invuln = 1.5;
  G.shots = []; G.hazards = [];
  G.state = 'play';
}

/* ------------------------------ help ------------------------------------ */
function openHelp() {
  if (G.state === 'help') return;
  G.helpFrom = G.state;
  G.state = 'help';
  Audio2.arp([523, 659, 784], 0.05, 'triangle');
}
function closeHelp() {
  G.state = G.helpFrom === 'title' ? 'title' : 'play';
  SFX.menu();
}
/* Are we looking at the title screen, directly or behind the help page? */
function atTitle() {
  return G.state === 'title' || (G.state === 'help' && G.helpFrom === 'title');
}

/* L cycles English → Español → Deutsch → English. On the title screen the
   language hint itself confirms the choice; everywhere else a small banner
   announces it and collapses into a corner badge (see HUD_HOME.lang). */
function cycleLang() {
  const i = LANGS.indexOf(G.lang);
  G.lang = LANGS[(i + 1) % LANGS.length];
  saveLang(G.lang);
  syncLangURL(G.lang);
  SFX.menu();
  if (G.state === 'title') {
    G.langPickT = 2;
  } else {
    G.langShown = true;
    say(LANG_NAME[G.lang], '', '#8fd3ff', 1.3, HUD_HOME.lang());
  }
}

/* ==========================================================================
   THE GLITCH — fall into the void while a magma ball is in flight
   ========================================================================== */
const GLITCH_ROOT = [
  { label: 'PHYSICS.HACK', sub: [
    { label: 'LOW GRAVITY', run: () => { PHYS.gravity = 620; PHYS.maxFall = 360; } },
    { label: 'MOON JUMP', run: () => { PHYS.jumpV = -510; PHYS.maxJumpChain = 9; } },
    { label: 'SUPER SPEED', run: () => { PHYS.speedMul = 1.9; } },
    { label: 'BOUNCY WORLD', run: () => { PHYS.bounce = 0.6; } },
    { label: 'NOCLIP  [toggle]', run: () => { PHYS.noclip = !PHYS.noclip; } },
    { label: 'RESTORE DEFAULTS', run: () => resetPhysics() },
  ]},
  { label: 'MOB.SPAWN', sub: [
    { label: 'FRIENDLY  pig',       run: () => spawnNear('pig', 3, true) },
    { label: 'FRIENDLY  sheep',     run: () => spawnNear('sheep', 3, true) },
    { label: 'FRIENDLY  chicken',   run: () => spawnNear('chicken', 4, true) },
    { label: 'EVIL      slime',     run: () => spawnNear('slime', 3, false) },
    { label: 'EVIL      spikeling', run: () => spawnNear('spikeling', 2, false) },
    { label: 'EVIL      guardian',  run: () => spawnNear('guardian', 1, false) },
    { label: 'PACIFY EVERYTHING',   run: () => G.mobs.forEach(m => { m.tamed = true; m.hostile = false; }) },
  ]},
  { label: 'STRUCTURE.GEN', sub: [
    { label: 'BRIDGE',     run: () => struct('bridge') },
    { label: 'TOWER',      run: () => struct('tower') },
    { label: 'SAFE HOUSE', run: () => struct('house') },
    { label: 'STAIRWAY',   run: () => struct('stairs') },
    { label: 'GEM SHOWER', run: () => struct('gems') },
  ]},
  { label: 'LEVEL.SKIP', sub: LEVELS.map((level, index) => ({
    get label() { return TRF('levelLabel', index + 1, TR(level.name)); },
    run: () => skipToLevel(index),
  }))},
  { label: 'DUPLICATE', sub: [
    { label: 'ALL FIVE POWERS', run: () => { POWER_ORDER.forEach((k, i) => G.player.inv[i] = k); } },
    { label: 'DUPLICATE MOBS',  run: () => {
      const copy = G.mobs.filter(m => !m.dead).slice(0, 40);
      copy.forEach(m => G.mobs.push(new Mob(m.x + 10, m.y - 12, m.type, m.tamed)));
    }},
    { label: 'DOUBLE THE GEMS', run: () => { const before = G.gems; for (let i = 0; i < before; i++) G.gems++; say(TR('gems ×2'), before + ' → ' + G.gems, '#9ff0c0'); } },
    { label: 'DOUBLE THE LIVES', run: () => { G.lives = Math.min(99, G.lives * 2 + 1); } },
  ]},
  { label: '>> RESUME GAME', run: () => closeGlitch() },
];

/* The shell can contain arbitrarily long submenus (for example LEVEL.SKIP).
   Keep the selected command inside this fixed viewport rather than letting
   keyboard focus travel below the overlay. */
const GLITCH_MENU_Y = 64;
const GLITCH_MENU_ROW_H = 13;
const GLITCH_MENU_ROWS = Math.floor((VIEW_H - 128) / GLITCH_MENU_ROW_H);

function keepGlitchSelectionVisible(items) {
  const gl = G.glitch;
  const maxScroll = Math.max(0, items.length - GLITCH_MENU_ROWS);
  gl.scroll = clamp(gl.scroll || 0, 0, maxScroll);
  if (gl.sel < gl.scroll) gl.scroll = gl.sel;
  if (gl.sel >= gl.scroll + GLITCH_MENU_ROWS) gl.scroll = gl.sel - GLITCH_MENU_ROWS + 1;
}

function moveGlitchSelection(items, delta) {
  G.glitch.sel = (G.glitch.sel + delta + items.length) % items.length;
  keepGlitchSelectionVisible(items);
  SFX.menu();
}

function skipToLevel(index) {
  if (!Number.isInteger(index) || index < 0 || index >= LEVELS.length) return false;
  buildLevel(index);
  G.state = 'play';
  return true;
}

function spawnNear(type, n, friendly) {
  const p = G.player, W = G.world;
  for (let i = 0; i < n; i++) {
    const x = p.cx + (Math.random() - 0.5) * 120;
    const tx = clamp(Math.floor(x / TILE), 1, W.w - 2);
    const gy = W.groundBelow(tx, Math.floor(p.cy / TILE) - 3);
    const y = (gy >= W.h ? Math.floor(p.cy / TILE) : gy - 2) * TILE;
    G.mobs.push(new Mob(tx * TILE, y, type, friendly));
  }
}

function struct(kind) {
  const p = G.player, W = G.world;
  const px = Math.floor(p.cx / TILE), py = Math.floor((p.y + p.h) / TILE);
  switch (kind) {
    case 'bridge':
      for (let i = -8; i <= 8; i++) W.set(px + i, py, T.PLATFORM);
      break;
    case 'tower':
      for (let i = 1; i <= 18; i++) {
        W.set(px, py - i, T.LADDER);
        if (i % 6 === 0) for (let d = -2; d <= 2; d++) W.set(px + d, py - i, d === 0 ? T.LADDER : T.PLATFORM);
      }
      break;
    case 'house':
      W.fill(px - 4, py - 6, px + 4, py, T.PLANK);
      W.fill(px - 3, py - 5, px + 3, py - 1, T.AIR);
      W.set(px - 3, py - 4, T.GLASS); W.set(px + 3, py - 4, T.GLASS);
      W.set(px, py - 6, T.GLOWSTONE);
      break;
    case 'stairs':
      for (let i = 0; i < 10; i++) W.fill(px + i * 2, py - i, px + i * 2 + 1, py - i, T.BRICK);
      break;
    case 'gems':
      for (let i = 0; i < 16; i++)
        G.gemEnts.push(new Gem(p.cx - 60 + i * 8, p.y - 40 - Math.random() * 40));
      break;
  }
}

function openGlitchMenu(viaKind) {
  G.state = 'glitch';
  G.glitch = { path: [], sel: 0, scroll: 0, t: 0, log: [], boot: 1.1, via: viaKind || 'magma' };
  SFX.glitch();
  G.flash = 0.5;
}

function glitchItems() {
  let list = GLITCH_ROOT;
  for (const i of G.glitch.path) list = list[i].sub;
  return list;
}

function updateGlitch(dt) {
  const gl = G.glitch;
  gl.t += dt;
  if (gl.boot > 0) { gl.boot -= dt; return; }
  const items = glitchItems();
  if (Keys.justPressed('ArrowDown', 'KeyS')) moveGlitchSelection(items, 1);
  if (Keys.justPressed('ArrowUp', 'KeyW')) moveGlitchSelection(items, -1);
  if (Keys.justPressed('Escape', 'Backspace') || (Keys.justPressed('ArrowLeft', 'KeyA') && gl.path.length)) {
    if (gl.path.length) {
      gl.sel = gl.path.pop();
      keepGlitchSelectionVisible(glitchItems());
      Audio2.blip(280, 0.05, 'square', 0.4);
    }
    else closeGlitch();
    return;
  }
  if (Keys.justPressed('Enter', 'Space', 'KeyE', 'ArrowRight', 'KeyD')) {
    const it = items[gl.sel];
    if (it.sub) { gl.path.push(gl.sel); gl.sel = 0; gl.scroll = 0; Audio2.blip(620, 0.05, 'square', 0.5); }
    else {
      it.run();
      gl.log.unshift('> ' + TR(it.label) + '  ...OK');
      gl.log = gl.log.slice(0, 5);
      Audio2.blip(880, 0.07, 'square', 0.6, -200);
      Audio2.noise(0.08, 0.25);
    }
  }
}

function closeGlitch() {
  const W = G.world;
  const sp = G.spawnSafe || W.spawn;
  G.player.x = sp.x; G.player.y = sp.y - 6;
  G.player.vx = 0; G.player.vy = 0;
  G.player.hp = Math.max(1, G.player.hp);
  G.player.invuln = 1.5;
  G.shots = [];
  G.state = 'play';
  say(TR('reality restored'), TR('mostly'), '#a0ffd0', 2);
}
