/* ==========================================================================
   POWERS — five plants & mushrooms.  Q = primary,  E = secondary,
   TAB+Q = squared (does the Q power twice).
   ========================================================================== */

const POWERS = {
  wind: {
    get name() { return TR('Wind Plant'); }, short: 'WIND', color: '#bfe6ff', color2: '#7fc4ee',
    get blurb() { return TR('Q gust · E twin orbs'); },
    get qd() { return TR('gust'); }, get ed() { return TR('twin orbs'); },
    cd: 0.42,
    q(p, doubled) {
      const f = p.facing;
      const fire = (dy) => {
        const s = new Shot(p.cx + f * 10, p.cy + dy, f * 430, 0, 'wind', doubled);
        s.w = 20; s.h = 16; G.shots.push(s);
        for (let i = 0; i < 14; i++)
          spawnParticle(p.cx + f * 12, p.cy + dy, f * (60 + Math.random() * 260),
            (Math.random() - 0.5) * 90, '#e8f6ff', 0.4);
      };
      fire(0);
      if (doubled) setTimeout(() => { if (!p.dead) fire(-7); }, 110);
      // gusts shove Jay back a little — every action has a reaction
      p.vx -= f * 40;
      SFX.wind();
    },
    e(p) {
      const f = p.facing;
      for (const dy of [-26, 26]) {
        const s = new Shot(p.cx + f * 10, p.cy, f * 240, dy * 2.6, 'windorb');
        s.w = 11; s.h = 11; G.shots.push(s);
      }
      SFX.wind();
    },
  },

  electric: {
    get name() { return TR('Electric Plant'); }, short: 'ZAP', color: '#ffe680', color2: '#ffbe2e',
    get blurb() { return TR('Q zap ray · E blast off'); },
    get qd() { return TR('zap'); }, get ed() { return TR('blast off'); },
    cd: 0.5,
    q(p, doubled) {
      const f = p.facing;
      const len = doubled ? 150 : 110;
      G.hazards.push(new Ray(p.cx + f * 8, p.cy - 1, f, len, doubled));
      if (doubled) G.hazards.push(new Ray(p.cx + f * 8, p.cy - 9, f, len, doubled));
      G.flash = 0.1;
      for (let i = 0; i < 18; i++)
        spawnParticle(p.cx + f * (10 + Math.random() * len), p.cy - Math.random() * 10,
          (Math.random() - 0.5) * 120, (Math.random() - 0.5) * 120, '#fff3a8', 0.35);
      SFX.zap();
    },
    e(p, doubled) {
      /* The launch earths itself through Jay's feet: anything underneath him or
         pressed right up against him is fried before he leaves the ground. */
      const reach = doubled ? 38 : 26;
      const box = { x: p.cx - reach, y: p.y - 2, w: reach * 2, h: p.h + 22 };
      let n = 0;
      for (const m of G.mobs) {
        if (m.dead || m.tamed || !m.hostile) continue;
        if (rectHit(box, m)) { m.damage(99); n++; }
      }
      // arcs crawling along the ground either side of him
      const footY = p.y + p.h - 2;
      G.hazards.push(new Ray(p.cx, footY, 1, reach, false));
      G.hazards.push(new Ray(p.cx, footY, -1, reach, false));
      for (let i = 0; i < 22; i++) {
        const a = Math.PI * (0.1 + Math.random() * 0.8);
        spawnParticle(p.cx, footY, Math.cos(a) * (60 + Math.random() * 190) * (Math.random() < .5 ? -1 : 1),
          Math.sin(a) * 90, '#fff3a8', 0.45);
      }

      p.vy = -430;
      p.jumpChain = Math.max(0, PHYS.maxJumpChain - 2);
      p.boostTimer = 0.6;
      for (let i = 0; i < 26; i++)
        spawnParticle(p.cx, p.y + p.h, (Math.random() - 0.5) * 140, Math.random() * 220, '#ffe680', 0.6);
      G.flash = Math.max(G.flash, 0.14);
      G.cam.shake = Math.max(G.cam.shake, 5);
      SFX.zap();
      G.pops.push({
        x: p.cx, y: p.y - 8, t: 1,
        text: n ? TRF('blastN', n) : TR('BLAST OFF'),
        color: '#ffe680',
      });
    },
  },

  lava: {
    get name() { return TR('Lava Mushroom'); }, short: 'MAGMA', color: '#ff9a4d', color2: '#e0491a',
    get blurb() { return TR('Q magma ball · E eruption'); },
    get qd() { return TR('magma'); }, get ed() { return TR('eruption'); },
    cd: 0.4,
    q(p, doubled) {
      const f = p.facing;
      const fire = (vy) => {
        const s = new Shot(p.cx + f * 8, p.cy - 2, f * 250, vy, 'magma');
        G.shots.push(s);
      };
      fire(-150);
      if (doubled) fire(-260);
      SFX.shoot();
    },
    e(p) {
      const f = p.facing;
      const s = new Shot(p.cx + f * 8, p.cy - 4, f * 200, -230, 'eruption');
      s.w = 10; s.h = 10;
      G.shots.push(s);
      SFX.shoot();
    },
  },

  earth: {
    get name() { return TR('Earth Plant'); }, short: 'EARTH', color: '#a9d86a', color2: '#6f9c39',
    get blurb() { return TR('Q spike row · E spike nova'); },
    get qd() { return TR('spikes'); }, get ed() { return TR('nova'); },
    cd: 0.55,
    q(p, doubled) {
      const f = p.facing;
      const count = doubled ? 8 : 4;
      for (let i = 1; i <= count; i++) {
        const wx = p.cx + f * (16 * i);
        const tx = Math.floor(wx / TILE);
        const gy = G.world.groundBelow(tx, Math.floor(p.cy / TILE));
        if (gy >= G.world.h) continue;
        setTimeout(((wxx, gyy, delay) => () => {
          if (G.state !== 'play') return;
          G.hazards.push(new EarthSpike(wxx, gyy * TILE, false));
          SFX.rumble();
        })(wx, gy, i), i * 55);
      }
      G.cam.shake = 4;
      SFX.rumble();
    },
    e(p) {
      const gy = G.world.groundBelow(Math.floor(p.cx / TILE), Math.floor(p.cy / TILE));
      G.hazards.push(new EarthSpike(p.cx, Math.min(gy * TILE, p.y + p.h), true));
      // the nova: everything nearby is impaled
      const box = { x: p.cx - 70, y: p.cy - 60, w: 140, h: 110 };
      let n = 0;
      for (const m of G.mobs) {
        if (m.dead || m.tamed || !m.hostile) continue;
        if (rectHit(box, m)) { m.damage(99); n++; }
      }
      for (let i = 0; i < 30; i++)
        spawnParticle(p.cx + (Math.random() - .5) * 140, p.cy + (Math.random() - .5) * 60,
          (Math.random() - .5) * 90, -Math.random() * 260, '#8f6a3f', 0.7);
      G.cam.shake = 9;
      SFX.rumble();
      if (n) G.pops.push({ x: p.cx, y: p.y - 10, t: 1, text: TRF('mobsDown', n), color: '#a9d86a' });
    },
  },

  water: {
    get name() { return TR('Water Mushroom'); }, short: 'WATER', color: '#8fd3ff', color2: '#3f8fd6',
    get blurb() { return TR('Q blinding squirt · E freeze'); },
    get qd() { return TR('blind'); }, get ed() { return TR('freeze'); },
    cd: 0.35,
    q(p, doubled) {
      const f = p.facing;
      const fire = (vy) => G.shots.push(new Shot(p.cx + f * 8, p.cy - 2, f * 300, vy, 'water'));
      fire(-60);
      if (doubled) fire(-150);
      Audio2.blip(600, 0.09, 'sine', 0.5, -240);
    },
    e(p) {
      const f = p.facing;
      const s = new Shot(p.cx + f * 8, p.cy - 2, f * 230, -70, 'ice');
      s.w = 12; s.h = 12; s.pierce = true;
      G.shots.push(s);
      SFX.freeze();
    },
  },
};

const POWER_ORDER = ['earth', 'water', 'electric', 'lava', 'wind'];

/* Jay always has his hands. Press 0 to put a plant away, or just use an empty
   slot — either way Q punches blocks apart and E throws an uppercut. */
const FIST = {
  name: 'Bare Hands', short: 'FIST', color: '#f2c79c', color2: '#d6a377',
  blurb: 'Q punch · E uppercut',
  cd: 0.16,
  q(p, doubled) {
    p.punchT = 0.18;
    const hits = meleeHit(p, doubled ? 22 : 16, false);
    // the swing that lands the last blow also finishes the block
    if (p.mineTarget && p.mineProgress >= 0.999) breakBlock(p.mineTarget.x, p.mineTarget.y);
    for (let i = 0; i < 5; i++)
      spawnParticle(p.cx + p.facing * 12, p.cy, p.facing * Math.random() * 90,
        (Math.random() - 0.5) * 70, '#ffffff', 0.18);
    Audio2.blip(hits ? 320 : 220, 0.05, 'square', hits ? 0.6 : 0.3, hits ? -120 : -40);
  },
  e(p) {
    p.punchT = 0.24;
    meleeHit(p, 16, true);
    const ux = Math.floor(p.cx / TILE), uy = Math.floor((p.y - 3) / TILE);
    if (!breakBlock(ux, uy)) breakBlock(ux, uy - 1);
    if (p.onGround) p.vy = -170;
    for (let i = 0; i < 8; i++)
      spawnParticle(p.cx, p.y - 4, (Math.random() - 0.5) * 110, -Math.random() * 120, '#ffe9a8', 0.3);
    Audio2.blip(420, 0.08, 'square', 0.5, 200);
  },
};

function usePower(p, which, doubled) {
  if (G.state !== 'play') return;
  const kind = p.inv[p.sel];
  if (!kind) {
    if (p.cooldown > 0) return;
    p.cooldown = FIST.cd;
    if (which === 'Q') FIST.q(p, doubled); else FIST.e(p);
    return;
  }
  if (p.cooldown > 0) return;
  const def = POWERS[kind];
  // remembered so that falling into the void just after firing tears the world
  p.powerFiredAt = G.time;
  p.powerFiredKind = kind;
  // the "square" ability makes TAB double the secondary too
  const dbl = which === 'Q' ? doubled : (doubled && G.abilities.has('square'));
  p.cooldown = def.cd * (dbl ? 1.55 : 1);
  if (which === 'Q') def.q(p, dbl);
  else { def.e(p, dbl); if (dbl) setTimeout(() => { if (G.state === 'play') def.e(p, dbl); }, 130); }
  if (dbl) {
    G.pops.push({ x: p.cx, y: p.y - 6, t: 0.8, text: '²', color: def.color });
    G.flash = Math.max(G.flash, 0.06);
  }
}

/* --- drawing the plants / mushrooms (also used for HUD icons) ----------- */
function drawPowerIcon(g, kind, x, y, s, t) {
  const d = POWERS[kind] || FIST;
  g.save();
  g.translate(x, y);
  g.scale(s, s);
  const bob = Math.sin((t || 0) * 3) * 0.6;
  switch (kind) {
    case 'fist':
      g.fillStyle = '#f2c79c'; g.fillRect(3, 3 + bob, 8, 7);          // the fist
      g.fillStyle = '#d6a377';                                        // knuckles notched into the top
      g.fillRect(4, 3 + bob, 1, 1); g.fillRect(6, 3 + bob, 1, 1); g.fillRect(8, 3 + bob, 1, 1);
      g.fillStyle = '#f2c79c'; g.fillRect(1, 6 + bob, 2, 3);          // thumb
      g.fillStyle = '#d6a377'; g.fillRect(3, 9 + bob, 8, 1);
      g.fillStyle = '#3f7fd6'; g.fillRect(2, 10 + bob, 9, 3);         // sleeve
      break;
    case 'wind':
      g.fillStyle = '#4d7a3a';
      g.fillRect(5, 6 + bob, 2, 7);
      g.fillRect(1, 9 + bob, 4, 2); g.fillRect(7, 11 + bob, 4, 2);   // leaves
      g.fillStyle = d.color2;
      g.beginPath(); g.moveTo(6, 0 + bob); g.lineTo(10, 6 + bob); g.lineTo(2, 6 + bob); g.closePath(); g.fill();
      g.fillStyle = '#f2fbff';                                        // gusts blowing off it
      g.fillRect(7, 1 + bob, 6, 1); g.fillRect(9, 3 + bob, 4, 1); g.fillRect(8, 5 + bob, 5, 1);
      break;
    case 'electric':
      g.fillStyle = '#4d7a3a'; g.fillRect(5, 7 + bob, 2, 6);
      g.fillStyle = d.color2;
      g.beginPath(); g.arc(6, 4 + bob, 4, 0, 7); g.fill();
      g.fillStyle = '#fffbe0';
      g.beginPath();
      g.moveTo(7, 1 + bob); g.lineTo(4, 5 + bob); g.lineTo(6, 5 + bob);
      g.lineTo(5, 8 + bob); g.lineTo(9, 4 + bob); g.lineTo(7, 4 + bob);
      g.closePath(); g.fill();
      break;
    case 'lava':
      g.fillStyle = '#f0e4d0'; g.fillRect(4, 6 + bob, 4, 7);
      g.fillStyle = d.color2;
      g.beginPath(); g.ellipse(6, 5 + bob, 6, 4, 0, 0, 7); g.fill();
      g.fillStyle = '#ffd08a';
      g.fillRect(2, 4 + bob, 2, 2); g.fillRect(7, 3 + bob, 2, 2); g.fillRect(5, 6 + bob, 2, 1);
      break;
    case 'earth':
      g.fillStyle = '#6f9c39'; g.fillRect(5, 6 + bob, 2, 7);
      g.fillStyle = d.color;
      g.beginPath(); g.moveTo(6, 0 + bob); g.lineTo(10, 6 + bob); g.lineTo(2, 6 + bob); g.closePath(); g.fill();
      g.fillStyle = '#6f9c39';
      g.fillRect(1, 8 + bob, 4, 2); g.fillRect(7, 9 + bob, 4, 2);
      break;
    case 'water':
      g.fillStyle = '#dfeef7'; g.fillRect(4, 6 + bob, 4, 7);
      g.fillStyle = d.color2;
      g.beginPath(); g.ellipse(6, 5 + bob, 6, 4, 0, 0, 7); g.fill();
      g.fillStyle = '#d7f0ff';
      g.fillRect(2, 4 + bob, 2, 2); g.fillRect(8, 4 + bob, 2, 2); g.fillRect(5, 2 + bob, 2, 2);
      break;
  }
  g.restore();
}
