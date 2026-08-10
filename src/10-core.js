/* ============================================================================
   JAY SQUARED (J²)  —  a blocky 2D platformer
   Part 1: constants, math helpers, input, audio, tile definitions, textures
   ========================================================================== */

const TILE = 16;
const VIEW_W = 480;
const VIEW_H = 270;
const STEP = 1 / 60;
/* seconds after firing a power in which falling off the world tears it open */
const GLITCH_WINDOW = 1.6;

/* --- physics (tuned to feel "real but fanciful") ------------------------- */
const PHYS = {
  gravity: 1450,
  maxFall: 620,
  runAccel: 1500,
  runMax: 132,
  crouchMax: 52,
  airAccel: 900,
  friction: 1400,
  airFriction: 240,
  jumpV: -352,
  jumpChainGain: 0.155,   // each extra Space press launches HIGHER
  maxJumpChain: 5,        // five presses, like five inventory slots
  jumpCut: 0.42,
  coyote: 0.10,
  buffer: 0.12,
  climbSpeed: 78,
  waterGravity: 320,
  waterMaxFall: 90,
  waterSwim: -130,
  bounce: 0,
  noclip: false,
  speedMul: 1,
};
const PHYS_DEFAULT = JSON.parse(JSON.stringify(PHYS));
function resetPhysics() { Object.assign(PHYS, JSON.parse(JSON.stringify(PHYS_DEFAULT))); }

/* --- tiny math ----------------------------------------------------------- */
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const sign = (v) => v < 0 ? -1 : v > 0 ? 1 : 0;
const approach = (v, t, d) => v < t ? Math.min(v + d, t) : Math.max(v - d, t);

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/* stable per-coordinate hash, used for block texture variety */
function hash2(x, y) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function isPerfectSquare(n) {
  if (n < 0) return false;
  const r = Math.round(Math.sqrt(n));
  return r * r === n;
}

/* --- input --------------------------------------------------------------- */
const Keys = {
  down: new Set(),
  pressed: new Set(),
  released: new Set(),
  anyTyped: [],
  shiftHeld: false,
  shiftUsed: false,   // was Shift part of a combo (like Shift+/ for "?")
  shiftTap: false,    // Shift pressed and released on its own
  isDown(...codes) { return codes.some(c => this.down.has(c)); },
  justPressed(...codes) { return codes.some(c => this.pressed.has(c)); },
  endFrame() {
    this.pressed.clear(); this.released.clear();
    this.anyTyped.length = 0; this.shiftTap = false;
  },
};
const isShift = (c) => c === 'ShiftLeft' || c === 'ShiftRight';

const BLOCKED_KEYS = new Set([
  'Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'KeyQ', 'KeyE', 'KeyW', 'KeyA', 'KeyS', 'KeyD',
  'Digit0', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Slash',
  'Numpad0', 'Numpad1', 'Numpad2', 'Numpad3', 'Numpad4', 'Numpad5',
  'Numpad6', 'Numpad7', 'Numpad8', 'Numpad9', 'NumpadEnter',
  'ShiftLeft', 'ShiftRight',
]);

/* 0-9 from either the top row or the number pad. Reading e.code rather than
   e.key means the pad works whether or not Num Lock is on. */
function digitFromCode(code) {
  if (code.length === 6 && code.startsWith('Digit')) {
    const n = code.charCodeAt(5) - 48;
    return n >= 0 && n <= 9 ? n : null;
  }
  if (code.length === 7 && code.startsWith('Numpad')) {
    const n = code.charCodeAt(6) - 48;
    return n >= 0 && n <= 9 ? n : null;
  }
  return null;
}

addEventListener('keydown', (e) => {
  if (BLOCKED_KEYS.has(e.code)) e.preventDefault();
  if (!e.repeat) {
    Keys.pressed.add(e.code);
    Keys.anyTyped.push(e.key);
    if (isShift(e.code)) { Keys.shiftHeld = true; Keys.shiftUsed = false; }
    else if (Keys.shiftHeld) Keys.shiftUsed = true;   // Shift is modifying, not cycling
  }
  Keys.down.add(e.code);
  Audio2.unlock();
}, { passive: false });

addEventListener('keyup', (e) => {
  if (BLOCKED_KEYS.has(e.code)) e.preventDefault();
  if (isShift(e.code)) {
    // a clean tap cycles the inventory; Shift+"/" for help must not
    if (!Keys.shiftUsed) Keys.shiftTap = true;
    Keys.shiftHeld = false;
  }
  Keys.down.delete(e.code);
  Keys.released.add(e.code);
}, { passive: false });

addEventListener('blur', () => {
  Keys.down.clear();
  Keys.shiftHeld = false; Keys.shiftUsed = false;
});

/* Named controls — arrows AND wasd, per spec. */
const IN = {
  left:   () => Keys.isDown('ArrowLeft', 'KeyA'),
  right:  () => Keys.isDown('ArrowRight', 'KeyD'),
  up:     () => Keys.isDown('ArrowUp', 'KeyW'),
  down:   () => Keys.isDown('ArrowDown', 'KeyS'),
  upTap:  () => Keys.justPressed('ArrowUp', 'KeyW'),
  jump:   () => Keys.justPressed('Space'),
  jumpHeld: () => Keys.isDown('Space'),
  primary: () => Keys.justPressed('KeyQ'),
  secondary: () => Keys.justPressed('KeyE'),
  doubler: () => Keys.isDown('Tab'),
  cycle: () => Keys.shiftTap,
  help: () => Keys.justPressed('Slash', 'KeyH', 'NumpadDivide'),
};

/* --- audio: a very small square-wave blip synth --------------------------- */
const Audio2 = {
  ctx: null, master: null, on: true,
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.16;
      this.master.connect(this.ctx.destination);
    } catch (err) { this.on = false; }
  },
  blip(freq = 440, dur = 0.08, type = 'square', vol = 1, slide = 0) {
    if (!this.on || !this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.9 * vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  },
  noise(dur = 0.14, vol = 0.5) {
    if (!this.on || !this.ctx) return;
    const n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = this.ctx.createBufferSource(); s.buffer = buf;
    const g = this.ctx.createGain(); g.gain.value = vol * 0.5;
    s.connect(g); g.connect(this.master); s.start();
  },
  arp(notes, spacing = 0.06, type = 'square') {
    notes.forEach((f, i) => setTimeout(() => this.blip(f, 0.09, type, 0.8), i * spacing * 1000));
  },
};

const SFX = {
  jump: (chain) => Audio2.blip(300 + chain * 70, 0.09, 'square', 0.7, 180),
  land: (impact = 1) => Audio2.blip(120, 0.05, 'triangle', 0.28 + 0.32 * impact),
  step: () => {
    Audio2.noise(0.045, 0.14);
    Audio2.blip(88 + Math.random() * 26, 0.028, 'triangle', 0.16);
  },
  pickup: () => Audio2.arp([523, 659, 784, 1046], 0.05),
  gem: () => Audio2.blip(880, 0.06, 'square', 0.5, 260),
  square: () => Audio2.arp([659, 880, 1174, 1568], 0.06, 'triangle'),
  hurt: () => Audio2.blip(180, 0.22, 'sawtooth', 0.8, -110),
  stomp: () => Audio2.blip(420, 0.07, 'square', 0.7, -250),
  shoot: () => Audio2.blip(520, 0.06, 'square', 0.5, -180),
  zap: () => { Audio2.blip(1200, 0.09, 'sawtooth', 0.6, -700); Audio2.noise(0.1, 0.35); },
  boom: () => { Audio2.noise(0.3, 0.9); Audio2.blip(90, 0.3, 'sawtooth', 0.8, -50); },
  wind: () => Audio2.noise(0.32, 0.35),
  freeze: () => Audio2.arp([1400, 1100, 900, 700], 0.04, 'sine'),
  rumble: () => { Audio2.noise(0.22, 0.7); Audio2.blip(70, 0.25, 'square', 0.6); },
  door: () => Audio2.arp([392, 523, 659, 784, 1046], 0.07, 'triangle'),
  glitch: () => { Audio2.noise(0.6, 1); Audio2.blip(60, 0.5, 'sawtooth', 0.9, 900); },
  death: () => Audio2.arp([440, 330, 262, 175], 0.11, 'square'),
  oneUp: () => Audio2.arp([523, 659, 784, 1046, 1318], 0.06, 'triangle'),
  menu: () => Audio2.blip(700, 0.04, 'square', 0.4),
};

/* ==========================================================================
   TILES
   ========================================================================== */
const T = {
  AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, SAND: 4, SANDSTONE: 5, SNOW: 6, ICE: 7,
  PLANK: 8, LOG: 9, LEAVES: 10, LADDER: 11, WATER: 12, LAVA: 13, BRICK: 14,
  OBSIDIAN: 15, GLASS: 16, MOSS: 17, SPIKES: 18, CACTUS: 19, NETHERROCK: 20,
  GLOWSTONE: 21, BEDROCK: 22, PLATFORM: 23, GOLD: 24, DOOR: 25, VINE: 26,
  COAL: 27, EMERALD: 28, DARKBRICK: 29, TORCHWALL: 30, SHRUB: 31,
};

const TILEDEF = {};
function deftile(id, name, base, shade, opts = {}) {
  TILEDEF[id] = Object.assign({
    id, name, base, shade,
    solid: true, climb: false, hazard: 0, liquid: false,
    platform: false, light: 0, speckle: 0.5,
  }, opts);
}
deftile(T.AIR, 'air', '#000', '#000', { solid: false });
deftile(T.GRASS, 'grass', '#5aa346', '#3d7a2e', { speckle: 0.7 });
deftile(T.DIRT, 'dirt', '#8a5a3b', '#6b432b');
deftile(T.STONE, 'stone', '#8b8b91', '#6e6e74');
deftile(T.SAND, 'sand', '#dbcb8c', '#bfae6d');
deftile(T.SANDSTONE, 'sandstone', '#c8b26f', '#a99456');
deftile(T.SNOW, 'snow', '#e9f2f7', '#c3d4de');
deftile(T.ICE, 'ice', '#9fd7ee', '#7ab6d3', { speckle: 0.25 });
deftile(T.PLANK, 'plank', '#b98a52', '#96693a');
/* A tree must never be a wall. You walk straight through a trunk (or shimmy up
   it like a ladder), and the canopy is a one-way platform you can land on. */
deftile(T.LOG, 'log', '#7a5734', '#5d4126', { solid: false, climb: true });
deftile(T.LEAVES, 'leaves', '#4c8f3a', '#376b28', { speckle: 0.9, solid: false, platform: true });
deftile(T.LADDER, 'ladder', '#c39a5f', '#8e6c3c', { solid: false, climb: true });
deftile(T.WATER, 'water', '#3b74d6', '#2a58a8', { solid: false, liquid: true, speckle: 0.2 });
deftile(T.LAVA, 'lava', '#e8622a', '#b93f14', { solid: false, liquid: true, hazard: 2, light: 1, speckle: 0.6 });
deftile(T.BRICK, 'brick', '#8f9099', '#70717a');
deftile(T.OBSIDIAN, 'obsidian', '#2a2338', '#1a1526');
deftile(T.GLASS, 'glass', 'rgba(190,225,245,.30)', 'rgba(230,245,255,.55)', { speckle: 0 });
deftile(T.MOSS, 'moss', '#6b8455', '#516640');
deftile(T.SPIKES, 'spikes', '#b6bcc7', '#8d939e', { solid: false, hazard: 1 });
deftile(T.CACTUS, 'cactus', '#3f8b4f', '#2d6a3a', { solid: false, hazard: 1 });
deftile(T.NETHERROCK, 'netherrock', '#6e2f34', '#511f24');
deftile(T.GLOWSTONE, 'glowstone', '#f0c85e', '#c99e35', { light: 1 });
deftile(T.BEDROCK, 'bedrock', '#3a3a42', '#26262c', { speckle: 0.9 });
deftile(T.PLATFORM, 'platform', '#c19b62', '#96723f', { solid: false, platform: true });
deftile(T.GOLD, 'gold', '#e8c04a', '#bd952b', { light: 0.5 });
deftile(T.DOOR, 'door', '#8b5f34', '#674325', { solid: false });
deftile(T.VINE, 'vine', '#3f7f33', '#2e5f25', { solid: false, climb: true });
deftile(T.COAL, 'coal', '#8b8b91', '#6e6e74');
deftile(T.EMERALD, 'emerald', '#8b8b91', '#6e6e74');
deftile(T.DARKBRICK, 'darkbrick', '#5c5f6d', '#464956');
deftile(T.TORCHWALL, 'torchwall', '#8f9099', '#70717a', { light: 1 });
/* Scenery only. Decoration must never be an obstacle. */
deftile(T.SHRUB, 'shrub', '#57a83f', '#3d7a2e', { solid: false, speckle: 0 });

const isSolid = (t) => TILEDEF[t] ? TILEDEF[t].solid : false;
const isClimb = (t) => TILEDEF[t] ? TILEDEF[t].climb : false;
const isPlatform = (t) => TILEDEF[t] ? TILEDEF[t].platform : false;

/* Blocks Jay's fists can knock out. Deliberately excludes stone, brick,
   obsidian, bedrock and gold, so the castle and the level floors survive. */
const SOFT = new Set([
  T.GRASS, T.DIRT, T.SAND, T.SNOW, T.PLANK, T.LOG, T.LEAVES,
  T.MOSS, T.GLASS, T.COAL, T.CACTUS, T.ICE, T.SHRUB,
]);

/* --- baked block textures ------------------------------------------------ */
/* Each block type gets 4 pre-rendered 16x16 variants so a wall of stone
   doesn't look like wallpaper. Minecraft-ish speckle noise. */
const TEX = {};
function bakeTextures() {
  for (const id in TILEDEF) {
    const d = TILEDEF[id];
    if (+id === T.AIR) continue;
    const variants = [];
    for (let v = 0; v < 4; v++) {
      const c = document.createElement('canvas');
      c.width = TILE; c.height = TILE;
      const g = c.getContext('2d');
      g.fillStyle = d.base;
      g.fillRect(0, 0, TILE, TILE);
      const rnd = mulberry32((+id) * 977 + v * 131);
      const n = Math.floor(d.speckle * 46);
      for (let i = 0; i < n; i++) {
        const x = Math.floor(rnd() * TILE), y = Math.floor(rnd() * TILE);
        const s = rnd() < 0.5 ? 1 : 2;
        g.fillStyle = rnd() < 0.55 ? d.shade : 'rgba(255,255,255,.08)';
        g.fillRect(x, y, s, s);
      }
      decorateTile(g, +id, rnd, d);
      variants.push(c);
    }
    TEX[id] = variants;
  }
}

function decorateTile(g, id, rnd, d) {
  switch (id) {
    case T.GRASS: {
      g.fillStyle = '#8a5a3b'; g.fillRect(0, 5, TILE, TILE - 5);
      g.fillStyle = '#6b432b';
      for (let i = 0; i < 18; i++) g.fillRect(Math.floor(rnd() * 16), 5 + Math.floor(rnd() * 11), 2, 1);
      g.fillStyle = d.base; g.fillRect(0, 0, TILE, 5);
      g.fillStyle = '#6ebd55';
      for (let i = 0; i < 10; i++) g.fillRect(Math.floor(rnd() * 16), Math.floor(rnd() * 4), 1, 1);
      g.fillStyle = '#3d7a2e';
      for (let x = 0; x < 16; x += 2) if (rnd() < 0.5) g.fillRect(x, 5, 2, 1);
      break;
    }
    case T.LOG: {
      g.fillStyle = '#5d4126';
      for (let y = 0; y < 16; y += 3) g.fillRect(0, y, 16, 1);
      g.fillStyle = '#8d6740'; g.fillRect(3, 0, 2, 16); g.fillRect(11, 0, 1, 16);
      break;
    }
    case T.LADDER: {
      g.clearRect(0, 0, TILE, TILE);
      g.fillStyle = '#8e6c3c'; g.fillRect(2, 0, 3, 16); g.fillRect(11, 0, 3, 16);
      g.fillStyle = '#c39a5f';
      g.fillRect(2, 0, 1, 16); g.fillRect(11, 0, 1, 16);
      for (let y = 2; y < 16; y += 5) { g.fillStyle = '#c39a5f'; g.fillRect(2, y, 12, 2); }
      break;
    }
    case T.VINE: {
      g.clearRect(0, 0, TILE, TILE);
      g.fillStyle = '#3f7f33';
      for (let y = 0; y < 16; y++) {
        const x = 6 + Math.round(Math.sin(y * 0.6) * 3);
        g.fillRect(x, y, 3, 1);
        if (rnd() < 0.3) g.fillRect(x - 2, y, 2, 1);
      }
      break;
    }
    case T.SPIKES: {
      g.clearRect(0, 0, TILE, TILE);
      for (let i = 0; i < 4; i++) {
        const bx = i * 4;
        g.fillStyle = '#b6bcc7';
        g.fillRect(bx + 1, 12, 3, 4); g.fillRect(bx + 1, 9, 2, 3); g.fillRect(bx + 1, 7, 1, 2);
        g.fillStyle = '#e2e7ee'; g.fillRect(bx + 1, 7, 1, 5);
      }
      break;
    }
    case T.CACTUS: {
      g.fillStyle = '#2d6a3a'; g.fillRect(0, 0, 2, 16); g.fillRect(14, 0, 2, 16);
      g.fillStyle = '#57a866';
      for (let y = 1; y < 16; y += 4) { g.fillRect(3, y, 1, 2); g.fillRect(12, y + 2, 1, 2); }
      break;
    }
    case T.BRICK: case T.DARKBRICK: {
      g.fillStyle = d.shade;
      g.fillRect(0, 7, 16, 1); g.fillRect(0, 15, 16, 1);
      g.fillRect(7, 0, 1, 8); g.fillRect(3, 8, 1, 8); g.fillRect(11, 8, 1, 8);
      break;
    }
    case T.PLANK: {
      g.fillStyle = '#96693a';
      g.fillRect(0, 3, 16, 1); g.fillRect(0, 8, 16, 1); g.fillRect(0, 13, 16, 1);
      g.fillStyle = '#d0a066'; g.fillRect(0, 4, 16, 1);
      break;
    }
    case T.PLATFORM: {
      g.clearRect(0, 0, TILE, TILE);
      g.fillStyle = '#c19b62'; g.fillRect(0, 0, 16, 5);
      g.fillStyle = '#96723f'; g.fillRect(0, 4, 16, 2);
      g.fillStyle = '#e0bd85'; g.fillRect(0, 0, 16, 1);
      break;
    }
    case T.GLASS: {
      g.clearRect(0, 0, TILE, TILE);
      g.fillStyle = 'rgba(180,220,245,.22)'; g.fillRect(0, 0, 16, 16);
      g.strokeStyle = 'rgba(225,245,255,.55)'; g.lineWidth = 1;
      g.strokeRect(0.5, 0.5, 15, 15);
      g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(2, 2, 5, 1); g.fillRect(2, 2, 1, 5);
      break;
    }
    case T.GLOWSTONE: {
      g.fillStyle = '#fff3c0';
      for (let i = 0; i < 10; i++) g.fillRect(Math.floor(rnd() * 14), Math.floor(rnd() * 14), 2, 2);
      break;
    }
    case T.COAL: {
      g.fillStyle = '#23232a';
      for (let i = 0; i < 6; i++) g.fillRect(3 + Math.floor(rnd() * 9), 3 + Math.floor(rnd() * 9), 3, 3);
      break;
    }
    case T.EMERALD: {
      g.fillStyle = '#31c66d';
      for (let i = 0; i < 4; i++) g.fillRect(3 + Math.floor(rnd() * 9), 3 + Math.floor(rnd() * 9), 3, 3);
      break;
    }
    case T.DOOR: {
      g.clearRect(0, 0, TILE, TILE);
      g.fillStyle = '#674325'; g.fillRect(1, 0, 14, 16);
      g.fillStyle = '#8b5f34'; g.fillRect(2, 1, 12, 14);
      g.fillStyle = '#5a3a20'; g.fillRect(2, 7, 12, 1);
      g.fillStyle = '#e8c04a'; g.fillRect(11, 8, 2, 2);
      break;
    }
    case T.TORCHWALL: {
      g.fillStyle = '#5a4526'; g.fillRect(7, 6, 2, 8);
      g.fillStyle = '#ffcf5a'; g.fillRect(6, 3, 4, 4);
      g.fillStyle = '#fff3c0'; g.fillRect(7, 4, 2, 2);
      break;
    }
    case T.ICE: {
      g.fillStyle = 'rgba(255,255,255,.45)';
      g.fillRect(2, 2, 6, 1); g.fillRect(9, 8, 5, 1); g.fillRect(3, 11, 4, 1);
      break;
    }
    case T.LEAVES: {
      g.fillStyle = 'rgba(0,0,0,.16)';
      for (let i = 0; i < 6; i++) g.fillRect(Math.floor(rnd() * 15), Math.floor(rnd() * 15), 2, 2);
      break;
    }
    case T.SHRUB: {
      g.clearRect(0, 0, TILE, TILE);
      g.fillStyle = '#3d7a2e';
      for (let i = 0; i < 7; i++) {
        const bx = 1 + Math.floor(rnd() * 13), bh = 3 + Math.floor(rnd() * 6);
        g.fillRect(bx, 16 - bh, 2, bh);
      }
      g.fillStyle = '#6ebd55';
      for (let i = 0; i < 5; i++) {
        const bx = 2 + Math.floor(rnd() * 12), bh = 3 + Math.floor(rnd() * 5);
        g.fillRect(bx, 16 - bh, 1, bh);
      }
      g.fillStyle = '#8fd86a';
      g.fillRect(4 + Math.floor(rnd() * 6), 8 + Math.floor(rnd() * 3), 2, 2);
      break;
    }
  }
}
