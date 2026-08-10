/* ==========================================================================
   WORLD — biomes, seeded generation, the Cobalt Castle
   ========================================================================== */

const LEVELS = [
  {
    name: 'Emerald Plains', biome: 'plains', w: 210, h: 46, seed: 10501,
    item: 'earth', itemHint: 'behind the waterfall',
    sky: ['#6fb7f0', '#a9dcf7', '#d8f0fb'], fog: '#cfeafc', ambient: 1.0,
    mobs: ['slime', 'spikeling', 'pig', 'sheep', 'chicken'],
  },
  {
    name: 'Dripstone Deep', biome: 'cave', w: 210, h: 46, seed: 22711,
    item: 'water', itemHint: 'past the underground lake',
    sky: ['#101827', '#16202f', '#1b2736'], fog: '#0e1520', ambient: 0.52,
    mobs: ['slime', 'batty', 'spikeling', 'batty'],
  },
  {
    name: 'Sunburn Dunes', biome: 'desert', w: 210, h: 46, seed: 33377,
    item: 'electric', itemHint: 'atop the tallest dune',
    sky: ['#4fa3dd', '#9fcdea', '#f0dca8'], fog: '#f6e2b4', ambient: 1.0,
    mobs: ['spikeling', 'slime', 'batty'],
  },
  {
    name: 'Cinder Hollow', biome: 'volcanic', w: 210, h: 46, seed: 44909,
    item: 'lava', itemHint: 'over the magma sea',
    sky: ['#2a1016', '#48161a', '#6e2226'], fog: '#3a1418', ambient: 0.72,
    mobs: ['slime', 'batty', 'spikeling', 'spikeling'],
  },
  {
    name: 'The Cobalt Castle', biome: 'castle', w: 230, h: 46, seed: 55127,
    item: 'wind', itemHint: 'sealed in the heart of the keep',
    sky: ['#1d2547', '#2c3766', '#4a5590'], fog: '#232c52', ambient: 0.85,
    mobs: ['guardian', 'spikeling', 'batty', 'guardian'],
  },
];

class World {
  constructor(cfg, index) {
    this.cfg = cfg;
    this.index = index;
    this.w = cfg.w; this.h = cfg.h;
    this.biome = cfg.biome;
    this.tiles = new Uint8Array(this.w * this.h);
    this.surface = new Int16Array(this.w).fill(cfg.h - 12);
    this.spawn = { x: 6 * TILE, y: 10 * TILE };
    this.exit = { x: 0, y: 0 };
    this.itemSpots = [];
    this.gemSpots = [];
    this.runeSpots = [];
    this.mobSpots = [];
    this.hints = [];
    this.decor = [];
  }
  /* a live lookup rather than a copied field, so the HUD relabels itself the
     instant the language changes instead of waiting for the next level build */
  get name() { return TR(this.cfg.name); }
  idx(x, y) { return y * this.w + x; }
  get(x, y) {
    if (x < 0 || x >= this.w) return T.BEDROCK;
    if (y < 0) return T.AIR;
    if (y >= this.h) return T.AIR;         // below the world = the void
    return this.tiles[y * this.w + x];
  }
  set(x, y, t) {
    if (x < 0 || x >= this.w || y < 0 || y >= this.h) return;
    this.tiles[y * this.w + x] = t;
  }
  solidAt(x, y) { return isSolid(this.get(x, y)); }
  fill(x0, y0, x1, y1, t) {
    for (let y = Math.max(0, y0); y <= Math.min(this.h - 1, y1); y++)
      for (let x = Math.max(0, x0); x <= Math.min(this.w - 1, x1); x++)
        this.tiles[y * this.w + x] = t;
  }
  /* first solid tile at or below y, returns tile-y of the surface */
  groundBelow(x, y) {
    for (let yy = Math.max(0, y | 0); yy < this.h; yy++) if (this.solidAt(x, yy)) return yy;
    return this.h;
  }
}

/* ------------------------------------------------------------------------ */
function generateLevel(index) {
  const cfg = LEVELS[index];
  const w = new World(cfg, index);
  const rnd = mulberry32(cfg.seed);
  switch (cfg.biome) {
    case 'plains': genPlains(w, rnd); break;
    case 'cave': genCave(w, rnd); break;
    case 'desert': genDesert(w, rnd); break;
    case 'volcanic': genVolcanic(w, rnd); break;
    case 'castle': genCastle(w, rnd); break;
  }
  scatterGems(w, rnd);
  placeRunes(w, rnd);
  placeMobs(w, rnd);
  return w;
}

/* Terrain helper: builds a rolling surface with safe pits. */
function buildSurface(w, rnd, opts) {
  const { base, amp, roughness, top, sub, deep, pitChance, maxPit, safeStart } = opts;
  let hgt = base;
  const heights = new Array(w.w);
  let phase = rnd() * 10;
  for (let x = 0; x < w.w; x++) {
    phase += 0.08 + rnd() * 0.02;
    const wave = Math.sin(phase) * amp + Math.sin(phase * 0.37) * amp * 0.6;
    let target = Math.round(base + wave);
    // step limiter keeps every ledge jumpable
    hgt = clamp(target, hgt - 2, hgt + 2);
    heights[x] = clamp(hgt, 8, w.h - 6);
  }
  // carve pits straight through to the void
  const pits = [];
  for (let x = safeStart; x < w.w - 22;) {
    if (rnd() < pitChance) {
      const pw = 2 + Math.floor(rnd() * (maxPit - 1));
      pits.push([x, x + pw - 1]);
      x += pw + 10 + Math.floor(rnd() * 12);
    } else x += 3;
  }
  for (let x = 0; x < w.w; x++) {
    const gy = heights[x];
    w.surface[x] = gy;
    const inPit = pits.some(p => x >= p[0] && x <= p[1]);
    if (inPit) { w.surface[x] = w.h + 4; continue; }
    w.set(x, gy, top);
    for (let y = gy + 1; y < gy + 5; y++) w.set(x, y, sub);
    for (let y = gy + 5; y < w.h - 1; y++) w.set(x, y, deep);
    w.set(x, w.h - 1, T.BEDROCK);
  }
  // a mid-air stepping stone in every pit wider than 3
  for (const [a, b] of pits) {
    if (b - a >= 3) {
      const mx = Math.floor((a + b) / 2);
      const my = heights[a] - 2;
      for (let x = mx - 1; x <= mx + 1; x++) w.set(x, my, T.PLATFORM);
    }
  }
  return { heights, pits };
}

function makeTree(w, x, gy, rnd) {
  const th = 4 + Math.floor(rnd() * 3);
  for (let i = 1; i <= th; i++) w.set(x, gy - i, T.LOG);
  const cy = gy - th - 1;
  // canopy: narrow at the crown, wide in the middle, narrow underneath
  const rows = [[-2, 1], [-1, 2], [0, 2], [1, 1]];
  for (const [dy, rad] of rows) {
    for (let dx = -rad; dx <= rad; dx++) {
      if (rad === 2 && Math.abs(dx) === 2 && rnd() < 0.35) continue;  // ragged edges
      if (w.get(x + dx, cy + dy) === T.AIR) w.set(x + dx, cy + dy, T.LEAVES);
    }
  }
  if (rnd() < 0.5) w.set(x - 2, cy, T.VINE), w.set(x - 2, cy + 1, T.VINE);
}

/* Sinks a ladder shaft from `top` down to the ground, so tall places are climbable. */
function ladderTo(w, x, topY, bottomY) {
  for (let y = topY; y <= bottomY; y++) if (w.get(x, y) === T.AIR) w.set(x, y, T.LADDER);
}

/* Finds an x near startX where the surface is unbroken across [left..right],
   so secret rooms never get carved into a pit and left hanging in mid-air. */
function findFlat(w, startX, left, right) {
  for (let d = 0; d < w.w; d++) {
    for (const x of [startX + d, startX - d]) {
      if (x < 14 || x > w.w - 22) continue;
      let ok = true;
      for (let i = left; i <= right && ok; i++) if (w.surface[x + i] > w.h) ok = false;
      if (ok) return x;
    }
  }
  return startX;
}

/* Places a hint sign near tile x, nudging clear of any pit. */
function hintAt(w, x, up, text) {
  let tx = clamp(x, 3, w.w - 6);
  for (let d = 0; d < 30 && w.surface[tx] > w.h; d++) tx = clamp(x + d, 3, w.w - 6);
  if (w.surface[tx] > w.h) return;
  w.hints.push({ x: tx * TILE + 8, y: (w.surface[tx] - up) * TILE, text });
}

/* A hidden alcove holding a power item. */
function stashItem(w, x, y, kind, hint) {
  w.itemSpots.push({ x: x * TILE + 2, y: y * TILE, kind });
  if (hint) w.hints.push({ x: x * TILE, y: (y - 3) * TILE, text: hint });
}

/* ---------------------------- PLAINS ------------------------------------ */
function genPlains(w, rnd) {
  const { heights } = buildSurface(w, rnd, {
    base: 30, amp: 3.2, roughness: 1, top: T.GRASS, sub: T.DIRT, deep: T.STONE,
    pitChance: 0.055, maxPit: 4, safeStart: 26,
  });
  w.spawn = { x: 5 * TILE, y: (heights[5] - 3) * TILE };

  for (let x = 8; x < w.w - 14; x++) {
    const gy = w.surface[x];
    if (gy > w.h) continue;
    if (rnd() < 0.10 && w.get(x, gy - 1) === T.AIR) makeTree(w, x, gy, rnd);
    else if (rnd() < 0.12) w.set(x, gy - 1, T.SHRUB);
  }
  // ponds
  for (let i = 0; i < 4; i++) {
    const x = 30 + Math.floor(rnd() * (w.w - 70));
    const gy = w.surface[x];
    if (gy > w.h) continue;
    const r = 3 + Math.floor(rnd() * 3);
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = 0; dy < 3; dy++) {
        if (Math.abs(dx) + dy < r + 1) w.set(x + dx, gy + dy, T.WATER);
      }
    }
  }
  // floating islands with ladders back down
  for (let i = 0; i < 7; i++) {
    const x = 24 + Math.floor(rnd() * (w.w - 60));
    const gy = w.surface[x];
    if (gy > w.h) continue;
    const py = gy - 6 - Math.floor(rnd() * 4);
    const len = 4 + Math.floor(rnd() * 4);
    for (let dx = 0; dx < len; dx++) {
      w.set(x + dx, py, T.GRASS);
      w.set(x + dx, py + 1, T.DIRT);
    }
    if (rnd() < 0.6) ladderTo(w, x + len - 1, py + 2, gy - 1);
    w.gemSpots.push({ x: (x + 1) * TILE, y: (py - 1) * TILE });
    w.gemSpots.push({ x: (x + 2) * TILE, y: (py - 1) * TILE });
  }

  /* --- the earth plant: a spring pours into a cave under the hill ------- */
  const sx = findFlat(w, Math.floor(w.w * 0.62), -10, 3);
  const gy = w.surface[sx];
  w.fill(sx, gy, sx + 1, gy + 7, T.AIR);              // the shaft
  for (let y = gy; y <= gy + 7; y++) w.set(sx + 1, y, T.WATER);   // the waterfall
  ladderTo(w, sx, gy, gy + 7);
  w.fill(sx - 8, gy + 5, sx + 1, gy + 8, T.AIR);      // the chamber
  w.fill(sx - 9, gy + 9, sx + 2, gy + 9, T.STONE);
  w.fill(sx - 9, gy + 4, sx - 9, gy + 8, T.STONE);
  w.set(sx - 8, gy + 4, T.GLOWSTONE);
  w.set(sx - 2, gy + 4, T.GLOWSTONE);
  for (let y = gy + 5; y <= gy + 8; y++) w.set(sx + 1, y, T.WATER);
  stashItem(w, sx - 6, gy + 8, 'earth', null);
  w.gemSpots.push({ x: (sx - 4) * TILE, y: (gy + 7) * TILE });
  w.hints.push({ x: (sx - 1) * TILE, y: (gy - 2) * TILE, text: 'a hole. of course you are going in' });
  w.hints.push({ x: (sx - 6) * TILE, y: (gy + 5) * TILE, text: 'Q = spikes   E = big spike' });

  /* Spaced far enough apart that two signs are never legible at once, and
     staggered in height so they don't sit inside the same tree canopy. */
  hintAt(w, 7, 5, 'Arrows or WASD to move');
  hintAt(w, 19, 7, 'SPACE again in mid-air jumps higher');
  hintAt(w, 32, 5, 'Walk through things to pick them up');
  hintAt(w, 45, 7, 'Hold Q to punch blocks apart');
  hintAt(w, 58, 5, 'Trunks are climbable — press UP');

  placeExit(w);
}

/* ----------------------------- CAVE ------------------------------------- */
function genCave(w, rnd) {
  w.fill(0, 0, w.w - 1, w.h - 1, T.STONE);
  let floor = 34, ceil = 12;
  const floors = new Array(w.w), ceils = new Array(w.w);
  let p1 = rnd() * 6, p2 = rnd() * 6;
  for (let x = 0; x < w.w; x++) {
    p1 += 0.07; p2 += 0.05;
    floor = clamp(Math.round(34 + Math.sin(p1) * 4 + Math.sin(p1 * 0.4) * 2), 24, 40);
    ceil = clamp(Math.round(13 + Math.sin(p2) * 3), 6, 20);
    floors[x] = floor; ceils[x] = ceil;
    w.fill(x, ceil, x, floor - 1, T.AIR);
    w.set(x, floor, T.MOSS);
    w.surface[x] = floor;
    if (rnd() < 0.045) w.set(x, ceil, T.GLOWSTONE);
    if (rnd() < 0.03) w.set(x, ceil + 1, T.VINE), w.set(x, ceil + 2, T.VINE);
    if (rnd() < 0.02) w.set(x, floor - 1, T.COAL);
  }
  w.spawn = { x: 5 * TILE, y: (floors[5] - 3) * TILE };

  // chasms down into the void
  for (let i = 0; i < 5; i++) {
    const x = 34 + Math.floor(rnd() * (w.w - 70));
    const pw = 2 + Math.floor(rnd() * 3);
    for (let dx = 0; dx < pw; dx++) {
      for (let y = floors[x + dx]; y < w.h; y++) w.set(x + dx, y, T.AIR);
      w.surface[x + dx] = w.h + 4;
    }
    if (pw >= 3) {
      const mx = x + (pw >> 1);
      w.fill(mx - 1, floors[x] - 3, mx + 1, floors[x] - 3, T.PLATFORM);
    }
  }
  // stalactite/stalagmite pairs + ledges
  for (let i = 0; i < 40; i++) {
    const x = 12 + Math.floor(rnd() * (w.w - 30));
    if (w.surface[x] > w.h) continue;
    const c = ceils[x];
    const len = 1 + Math.floor(rnd() * 3);
    for (let d = 0; d < len; d++) w.set(x, c + 1 + d, T.STONE);
    if (rnd() < 0.3) w.set(x, w.surface[x] - 1, T.SPIKES);
  }
  for (let i = 0; i < 14; i++) {
    const x = 20 + Math.floor(rnd() * (w.w - 50));
    const y = clamp(ceils[x] + 4 + Math.floor(rnd() * 6), 8, 30);
    const len = 3 + Math.floor(rnd() * 4);
    w.fill(x, y, x + len, y, T.PLATFORM);
    w.gemSpots.push({ x: (x + 1) * TILE, y: (y - 1) * TILE });
  }
  // lava at the bottom of a few dips
  for (let i = 0; i < 5; i++) {
    const x = 30 + Math.floor(rnd() * (w.w - 70));
    if (w.surface[x] > w.h) continue;
    const r = 2 + Math.floor(rnd() * 3);
    for (let dx = -r; dx <= r; dx++) {
      const gx = x + dx;
      if (w.surface[gx] > w.h) continue;
      w.set(gx, w.surface[gx], T.LAVA);
    }
  }

  /* --- water mushroom: past a flooded chamber --------------------------- */
  const sx = findFlat(w, Math.floor(w.w * 0.55), -9, 9);
  const fy = w.surface[sx] > w.h ? 34 : w.surface[sx];
  w.fill(sx - 8, fy - 8, sx + 8, fy + 4, T.AIR);
  w.fill(sx - 8, fy + 5, sx + 8, fy + 5, T.STONE);
  w.fill(sx - 6, fy - 1, sx + 6, fy + 4, T.WATER);
  w.fill(sx + 7, fy - 8, sx + 8, fy - 3, T.STONE);
  w.set(sx - 9, fy - 9, T.GLOWSTONE);
  ladderTo(w, sx + 6, fy - 8, fy + 3);
  stashItem(w, sx + 5, fy - 8, 'water', null);
  w.hints.push({ x: (sx + 2) * TILE, y: (fy - 11) * TILE, text: 'Q = blind   E = freeze' });

  placeExit(w);
}

/* ---------------------------- DESERT ------------------------------------ */
function genDesert(w, rnd) {
  const { heights } = buildSurface(w, rnd, {
    base: 31, amp: 4.5, roughness: 1, top: T.SAND, sub: T.SAND, deep: T.SANDSTONE,
    pitChance: 0.06, maxPit: 4, safeStart: 24,
  });
  w.spawn = { x: 5 * TILE, y: (heights[5] - 3) * TILE };

  for (let x = 8; x < w.w - 12; x++) {
    const gy = w.surface[x];
    if (gy > w.h) continue;
    if (rnd() < 0.05) {
      const ch = 2 + Math.floor(rnd() * 2);
      for (let i = 1; i <= ch; i++) w.set(x, gy - i, T.CACTUS);
    }
  }
  // buried sandstone ruins
  for (let i = 0; i < 6; i++) {
    const x = 22 + Math.floor(rnd() * (w.w - 55));
    const gy = w.surface[x];
    if (gy > w.h) continue;
    const hgt = 4 + Math.floor(rnd() * 4), wid = 5 + Math.floor(rnd() * 4);
    w.fill(x, gy - hgt, x + wid, gy - hgt, T.SANDSTONE);
    w.fill(x, gy - hgt + 1, x, gy - 1, T.SANDSTONE);
    w.fill(x + wid, gy - hgt + 1, x + wid, gy - 1, T.SANDSTONE);
    w.fill(x + 1, gy - hgt + 1, x + wid - 1, gy - 1, T.AIR);
    // doorways both sides — a ruin is scenery to walk through, not a dead end.
    // Carve relative to each wall column's own ground, since the dunes slope.
    for (const dx of [0, wid]) {
      const cx = x + dx, cgy = w.surface[cx];
      if (cgy > w.h) continue;
      w.fill(cx, cgy - 3, cx, cgy - 1, T.AIR);
    }
    ladderTo(w, x + wid - 1, gy - hgt + 1, gy - 1);
    w.gemSpots.push({ x: (x + 2) * TILE, y: (gy - hgt - 1) * TILE });
    if (rnd() < 0.5) w.set(x + 2, gy - 1, T.SPIKES);
  }
  // quicksand-looking pools (water tinted by biome render)
  for (let i = 0; i < 3; i++) {
    const x = 30 + Math.floor(rnd() * (w.w - 70));
    const gy = w.surface[x];
    if (gy > w.h) continue;
    for (let dx = -3; dx <= 3; dx++) for (let dy = 0; dy < 3; dy++) w.set(x + dx, gy + dy, T.WATER);
  }

  /* --- electric plant: top of the tallest dune -------------------------- */
  let best = 20, bestY = 99;
  for (let x = 40; x < w.w - 30; x++) if (w.surface[x] < bestY) { bestY = w.surface[x]; best = x; }
  const ty = bestY - 9;
  w.fill(best - 3, ty, best + 3, ty, T.SANDSTONE);
  w.fill(best - 3, ty + 1, best - 3, ty + 3, T.SANDSTONE);
  w.fill(best + 3, ty + 1, best + 3, ty + 3, T.SANDSTONE);
  ladderTo(w, best + 2, ty + 1, bestY - 1);
  ladderTo(w, best + 2, bestY - 1, bestY - 1);
  stashItem(w, best, ty - 1, 'electric', null);
  w.hints.push({ x: (best - 4) * TILE, y: (ty - 4) * TILE, text: 'Q = zap   E = sky boost' });

  placeExit(w);
}

/* --------------------------- VOLCANIC ----------------------------------- */
function genVolcanic(w, rnd) {
  const { heights } = buildSurface(w, rnd, {
    base: 30, amp: 3.6, roughness: 1, top: T.NETHERROCK, sub: T.NETHERROCK, deep: T.OBSIDIAN,
    pitChance: 0.05, maxPit: 4, safeStart: 24,
  });
  w.spawn = { x: 5 * TILE, y: (heights[5] - 3) * TILE };

  for (let x = 10; x < w.w - 12; x++) {
    const gy = w.surface[x];
    if (gy > w.h) continue;
    if (rnd() < 0.05) w.set(x, gy, T.GLOWSTONE);
    if (rnd() < 0.04) w.set(x, gy - 1, T.SPIKES);
  }
  // magma seas: shallow basins you hop across on obsidian stepping stones
  for (let i = 0; i < 8; i++) {
    const x = 26 + Math.floor(rnd() * (w.w - 60));
    if (w.surface[x] > w.h) continue;
    const r = 2 + Math.floor(rnd() * 3);
    for (let dx = -r; dx <= r; dx++) {
      const gx = x + dx;
      if (gx < 1 || gx >= w.w - 1 || w.surface[gx] > w.h) continue;
      w.set(gx, w.surface[gx], T.LAVA);
    }
    for (let dx = -r + 1; dx < r; dx += 2) {
      const gx = x + dx;
      if (w.surface[gx] > w.h) continue;
      w.set(gx, w.surface[gx] - 2, T.OBSIDIAN);
    }
  }
  // basalt columns + platforms above the lava
  for (let i = 0; i < 16; i++) {
    const x = 20 + Math.floor(rnd() * (w.w - 45));
    if (w.surface[x] > w.h) continue;
    const y = w.surface[x] - 5 - Math.floor(rnd() * 5);
    const len = 3 + Math.floor(rnd() * 3);
    w.fill(x, y, x + len, y, T.PLATFORM);
    w.gemSpots.push({ x: (x + 1) * TILE, y: (y - 1) * TILE });
  }

  /* --- lava mushroom: an obsidian island over the magma sea ------------- */
  const sx = findFlat(w, Math.floor(w.w * 0.58), -8, 8);
  const gy = w.surface[sx];
  w.fill(sx - 7, gy - 6, sx + 7, gy - 1, T.AIR);
  w.fill(sx - 7, gy, sx + 7, gy + 1, T.LAVA);
  w.fill(sx - 2, gy - 3, sx + 2, gy - 3, T.OBSIDIAN);
  w.fill(sx - 7, gy - 5, sx - 5, gy - 5, T.PLATFORM);
  w.fill(sx + 5, gy - 5, sx + 7, gy - 5, T.PLATFORM);
  stashItem(w, sx, gy - 4, 'lava', null);
  w.gemSpots.push({ x: (sx - 1) * TILE, y: (gy - 5) * TILE });
  w.hints.push({ x: (sx - 3) * TILE, y: (gy - 8) * TILE, text: 'Q = magma ball   E = eruption' });

  placeExit(w);
}

/* ---------------------------- CASTLE ------------------------------------ */
function genCastle(w, rnd) {
  const { heights } = buildSurface(w, rnd, {
    base: 32, amp: 2.0, roughness: 1, top: T.STONE, sub: T.STONE, deep: T.DARKBRICK,
    pitChance: 0.05, maxPit: 4, safeStart: 22,
  });
  w.spawn = { x: 5 * TILE, y: (heights[5] - 3) * TILE };

  for (let x = 10; x < w.w - 90; x++) {
    const gy = w.surface[x];
    if (gy > w.h) continue;
    if (rnd() < 0.08) w.set(x, gy - 1, T.SHRUB);
    if (rnd() < 0.03) w.set(x, gy - 1, T.SPIKES);
  }
  for (let i = 0; i < 8; i++) {
    const x = 18 + Math.floor(rnd() * (w.w - 120));
    if (w.surface[x] > w.h) continue;
    const y = w.surface[x] - 5 - Math.floor(rnd() * 4);
    w.fill(x, y, x + 3, y, T.PLATFORM);
    w.gemSpots.push({ x: (x + 1) * TILE, y: (y - 1) * TILE });
  }

  /* ---- THE KEEP ---- */
  const x0 = w.w - 78, x1 = w.w - 12;
  let g = 0;
  for (let x = x0; x <= x1; x++) g = Math.max(g, w.surface[x] > w.h ? 32 : w.surface[x]);
  // level the ground under the keep, and pave a clear approach so no pit can
  // strand you outside the walls
  for (let x = x0 - 12; x <= x1 + 4; x++) {
    for (let y = g; y < w.h - 1; y++) w.set(x, y, T.DARKBRICK);
    for (let y = 6; y < g; y++) w.set(x, y, T.AIR);
    w.surface[x] = g;
    w.set(x, g, T.BRICK);
  }
  const topY = g - 26;
  // outer walls
  w.fill(x0, topY, x0 + 1, g - 1, T.BRICK);
  w.fill(x1 - 1, topY, x1, g - 1, T.BRICK);
  // battlements
  for (let x = x0; x <= x1; x += 2) w.set(x, topY - 1, T.BRICK);
  w.fill(x0, topY, x1, topY, T.BRICK);
  // towers
  for (const tx of [x0 - 3, x1 + 1]) {
    w.fill(tx, topY - 5, tx + 2, g - 1, T.BRICK);
    w.fill(tx + 1, topY - 4, tx + 1, g - 2, T.AIR);
    ladderTo(w, tx + 1, topY - 4, g - 2);
    for (let x = tx; x <= tx + 2; x += 2) w.set(x, topY - 6, T.BRICK);
  }
  // the gate — without this the keep is simply unenterable
  w.fill(x0 - 3, g - 3, x0 + 1, g - 1, T.AIR);
  w.set(x0 - 4, g - 3, T.TORCHWALL);
  w.hints.push({ x: (x0 - 6) * TILE, y: (g - 5) * TILE, text: 'the gate stands open' });

  // interior floors
  const f1 = g - 8, f2 = g - 17;
  w.fill(x0 + 2, f1, x1 - 2, f1, T.BRICK);
  w.fill(x0 + 2, f2, x1 - 2, f2, T.BRICK);
  // stairwell gaps + ladders
  w.fill(x0 + 5, f1, x0 + 7, f1, T.AIR);
  ladderTo(w, x0 + 6, f1 - 7, g - 1);
  w.fill(x1 - 7, f2, x1 - 5, f2, T.AIR);
  ladderTo(w, x1 - 6, f2 - 8, f1 - 1);
  // torches + windows
  for (let x = x0 + 3; x < x1 - 2; x += 6) {
    w.set(x, f1 - 3, T.TORCHWALL); w.set(x, f2 - 3, T.TORCHWALL);
  }
  w.set(x0, f1 - 4, T.GLASS); w.set(x0, f2 - 4, T.GLASS);
  w.set(x1, f1 - 4, T.GLASS); w.set(x1, f2 - 4, T.GLASS);
  // guards' furniture
  for (let i = 0; i < 6; i++) {
    const x = x0 + 4 + Math.floor(rnd() * (x1 - x0 - 8));
    w.set(x, f1 - 1, T.PLANK);
    if (rnd() < 0.5) w.set(x + 1, f2 - 1, T.PLANK);
  }

  /* ---- THE SEALED HEART: wind plant ----
     A windowless box standing on the top floor. No door. The only way in is the
     single wooden plank in its roof: stand on top, hold DOWN and press SPACE. */
  const cx = Math.floor((x0 + x1) / 2);
  const cy = f2 - 1;                        // chamber floor sits on the top floor slab
  w.fill(cx - 4, cy - 4, cx + 4, cy, T.DARKBRICK);
  w.fill(cx - 3, cy - 3, cx + 3, cy - 1, T.AIR);
  w.set(cx - 4, cy - 4, T.GLOWSTONE);
  w.set(cx + 4, cy - 4, T.GLOWSTONE);
  w.set(cx, cy - 4, T.PLATFORM);            // <- the way in, and the way out
  ladderTo(w, cx, cy - 3, cy - 1);
  // a fair way up onto the roof of the box
  w.fill(cx - 7, cy - 2, cx - 6, cy - 2, T.PLATFORM);
  w.fill(cx + 6, cy - 2, cx + 7, cy - 2, T.PLATFORM);
  stashItem(w, cx, cy - 1, 'wind', null);
  w.hints.push({ x: (cx - 6) * TILE, y: (cy - 6) * TILE, text: 'DOWN + SPACE drops through wood' });
  w.hints.push({ x: (cx + 7) * TILE, y: (cy - 6) * TILE, text: 'something is sealed in there' });
  w.gemSpots.push({ x: (cx - 2) * TILE, y: (cy - 2) * TILE });
  w.gemSpots.push({ x: (cx + 2) * TILE, y: (cy - 2) * TILE });

  // exit: golden door on the roof, reached by a ladder punched through the ceiling
  w.exit = { x: (x1 - 4) * TILE, y: (topY - 3) * TILE };
  w.fill(x1 - 6, topY - 1, x1 - 2, topY - 1, T.GOLD);
  w.set(x1 - 4, topY - 2, T.DOOR); w.set(x1 - 4, topY - 3, T.DOOR);
  for (let y = f2 - 1; y >= topY - 1; y--) w.set(x1 - 3, y, T.LADDER);
  w.hints.push({ x: (x1 - 3) * TILE, y: (f2 - 4) * TILE, text: 'UP to climb' });
}

/* ------------------------------------------------------------------------ */
function placeExit(w) {
  let x = w.w - 8;
  while (x > 10 && w.surface[x] > w.h) x--;
  const gy = w.surface[x];
  w.exit = { x: x * TILE, y: (gy - 2) * TILE };
  w.fill(x - 2, gy - 1, x + 2, gy - 1, T.GOLD);
  w.set(x, gy - 2, T.DOOR); w.set(x, gy - 3, T.DOOR);
  for (let i = 0; i < 3; i++) w.gemSpots.push({ x: (x - 3 + i) * TILE, y: (gy - 3) * TILE });
}

function scatterGems(w, rnd) {
  // gems trace the walkable path — collecting them drives the perfect-square bonuses
  for (let x = 12; x < w.w - 10; x += 3) {
    if (w.surface[x] > w.h) continue;
    if (rnd() < 0.42) {
      const gy = w.surface[x];
      w.gemSpots.push({ x: x * TILE + 2, y: (gy - 1) * TILE - 4 });
    }
  }
  // arcs of gems over pits, Mario-style
  for (let x = 14; x < w.w - 14; x++) {
    if (w.surface[x] <= w.h || w.surface[x - 1] > w.h) continue;
    const gy = w.surface[x - 1];
    for (let i = 0; i < 5; i++) {
      w.gemSpots.push({ x: (x + i) * TILE + 2, y: (gy - 3 - Math.round(Math.sin(i / 4 * Math.PI) * 2)) * TILE });
    }
  }
}

const RUNE_KINDS = ['oneup', 'ability', 'gems'];
function placeRunes(w, rnd) {
  const count = 3;
  for (let i = 0; i < count; i++) {
    const frac = 0.22 + i * 0.26;
    let x = Math.floor(w.w * frac);
    let tries = 0;
    while ((w.surface[x] > w.h || w.get(x, w.surface[x] - 1) !== T.AIR) && tries++ < 40) x++;
    if (w.surface[x] > w.h) continue;
    const y = w.surface[x] - 4;
    w.runeSpots.push({ x: x * TILE + 2, y: y * TILE, kind: RUNE_KINDS[i % RUNE_KINDS.length] });
  }
}

function placeMobs(w, rnd) {
  const kinds = w.cfg.mobs;
  const spacing = w.biome === 'castle' ? 9 : 11;
  for (let x = 26; x < w.w - 16; x += spacing) {
    const jitter = Math.floor(rnd() * 5) - 2;
    const gx = clamp(x + jitter, 12, w.w - 14);
    const gy = w.surface[gx];
    if (gy > w.h) continue;
    if (!isSolid(w.get(gx, gy))) continue;
    const type = kinds[Math.floor(rnd() * kinds.length)];
    const y = type === 'batty' ? (gy - 7) * TILE : (gy - 2) * TILE;
    w.mobSpots.push({ x: gx * TILE, y, type });
  }
}
