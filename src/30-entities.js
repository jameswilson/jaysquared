/* ==========================================================================
   ENTITIES — Jay, mobs, pickups, projectiles, particles, tile collision
   ========================================================================== */

const initialLang = loadLang();
const G = {
  world: null, player: null,
  /* gemEnts = the pickups lying in the level.  G.gems = how many Jay has counted. */
  mobs: [], items: [], gemEnts: [], runes: [], shots: [], hazards: [], parts: [], pops: [],
  cam: { x: 0, y: 0, shake: 0 },
  state: 'title',              // title | play | rune | glitch | dead | levelclear | win
  level: 0, gems: 0, lives: 3, score: 0,
  abilities: new Set(),
  squaresFound: new Set(),
  time: 0, levelTime: 0,
  banner: null,                // {text, sub, t, color}
  rune: null,
  glitch: null,
  flash: 0, hitStop: 0,
  spawnPoint: { x: 0, y: 0 },
  runsCompleted: 0,
  immortal: false,   // the 144 code. Deliberately NOT reset by startRun().
  codeBuf: '',
  lang: initialLang,           // en | es | de — cycled with L, persisted to localStorage
  langPickT: 0,                // title screen: seconds left showing "you selected X"
  langShown: initialLang !== 'en',  // has the corner language badge earned its place yet?
};

/* `to` is an optional {x, y} in view space. Given one, the banner does not fade
   where it stands — it shrinks and glides into that point, which is the HUD spot
   the prize it just announced will live at from now on. */
function say(text, sub = '', color = '#ffe9a8', dur = 2.6, to = null) {
  G.banner = { text, sub, t: dur, max: dur, color, to };
}

/* --------------------------- collision ---------------------------------- */
function tileRange(e) {
  return {
    x0: Math.floor(e.x / TILE),
    x1: Math.floor((e.x + e.w - 0.001) / TILE),
    y0: Math.floor(e.y / TILE),
    y1: Math.floor((e.y + e.h - 0.001) / TILE),
  };
}

function moveX(e, dx) {
  e.x += dx;
  if (e.noclip) return;
  const W = G.world, r = tileRange(e);
  for (let y = r.y0; y <= r.y1; y++) {
    for (let x = r.x0; x <= r.x1; x++) {
      if (!isSolid(W.get(x, y))) continue;
      if (dx > 0) { e.x = x * TILE - e.w; e.hitWall = 1; }
      else if (dx < 0) { e.x = (x + 1) * TILE; e.hitWall = -1; }
      e.vx = 0;
      return;
    }
  }
}

function moveY(e, dy) {
  const prevBottom = e.y + e.h;
  e.y += dy;
  if (e.noclip) return;
  const W = G.world, r = tileRange(e);
  for (let y = r.y0; y <= r.y1; y++) {
    for (let x = r.x0; x <= r.x1; x++) {
      const t = W.get(x, y);
      if (isPlatform(t)) {
        if (dy > 0 && !e.dropTimer && prevBottom <= y * TILE + 1.5) {
          e.y = y * TILE - e.h; e.vy = 0; e.onGround = true; e.landed = true;
          return;
        }
        continue;
      }
      if (!isSolid(t)) continue;
      if (dy > 0) { e.y = y * TILE - e.h; e.onGround = true; e.landed = true; }
      else if (dy < 0) { e.y = (y + 1) * TILE; e.bonkedHead = true; }
      e.vy = 0;
      return;
    }
  }
}

/* Any tile of interest overlapping the box. */
function scanTiles(e) {
  const W = G.world, r = tileRange(e);
  let climb = false, liquidWater = false, hazard = 0, onPlatform = false;
  for (let y = r.y0; y <= r.y1; y++) {
    for (let x = r.x0; x <= r.x1; x++) {
      const t = W.get(x, y), d = TILEDEF[t];
      if (!d) continue;
      if (d.climb) climb = true;
      if (t === T.WATER) liquidWater = true;
      if (d.hazard > hazard) hazard = d.hazard;
      if (d.platform) onPlatform = true;
    }
  }
  return { climb, liquidWater, hazard, onPlatform };
}

function groundedOnPlatform(e) {
  const W = G.world;
  const y = Math.floor((e.y + e.h + 1) / TILE);
  const x0 = Math.floor(e.x / TILE), x1 = Math.floor((e.x + e.w - 0.001) / TILE);
  for (let x = x0; x <= x1; x++) if (isPlatform(W.get(x, y))) return true;
  return false;
}

/* ------------------------------ base ------------------------------------ */
class Entity {
  constructor(x, y, w, h) {
    this.x = x; this.y = y; this.w = w; this.h = h;
    this.vx = 0; this.vy = 0;
    this.onGround = false; this.dead = false;
    this.facing = 1; this.anim = 0; this.noclip = false;
    this.dropTimer = 0;
  }
  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }
  overlaps(o, pad = 0) {
    return this.x < o.x + o.w + pad && this.x + this.w + pad > o.x &&
           this.y < o.y + o.h + pad && this.y + this.h + pad > o.y;
  }
  physics(dt, gravity, maxFall) {
    this.landed = false; this.hitWall = 0; this.bonkedHead = false;
    this.vy = Math.min(this.vy + gravity * dt, maxFall);
    this.onGround = false;
    moveX(this, this.vx * dt);
    moveY(this, this.vy * dt);
    if (this.dropTimer > 0) this.dropTimer -= dt;
  }
}

/* ============================== JAY ====================================== */
class Player extends Entity {
  constructor(x, y) {
    super(x, y, 11, 21);
    this.hp = 3; this.maxHp = 3;
    this.inv = [null, null, null, null, null];
    this.sel = -1;          // bare hands until he actually picks something up
    this.stepTimer = 0;
    this.jumpChain = 0;
    this.coyote = 0; this.buffer = 0;
    this.invuln = 0;
    this.crouch = false;
    this.climbing = false;
    this.inWater = false;
    this.cooldown = 0;
    this.boostTimer = 0;
    this.walkPhase = 0;
    this.blinkTimer = 2;
    this.squarePower = 0;   // charge from the "square" ability
    this.exiting = 0;
    this.mineTarget = null; // {x,y} tile Jay is currently punching
    this.mineProgress = 0;
    this.punchT = 0;        // swing animation timer
    this.powerFiredAt = -99;   // when a plant power was last let off
    this.powerFiredKind = null;
  }

  get barehanded() { return !this.inv[this.sel]; }

  /* slot === -1 means Jay's own hands.
     Selecting an empty slot lands you on your fists rather than on nothing —
     so `sel` is only ever -1 or a slot that genuinely holds a plant, and the
     HUD can never light up two slots or an empty one. */
  selectSlot(slot) {
    SFX.menu();
    if (slot === -1) {
      this.sel = -1;
      say(TR('bare hands'), TR('Q punches blocks apart • E uppercut'), '#f2c79c', 1.6);
      return;
    }
    const it = this.inv[slot];
    if (!it) {
      this.sel = -1;
      say(TRF('slotEmpty', slot + 1), TR('bare hands it is'), '#8d9bb5', 1.4);
      return;
    }
    this.sel = slot;
    say(POWERS[it].name, POWERS[it].blurb, POWERS[it].color, 1.4);
  }

  /* SHIFT walks the ring: hands → each plant you're actually carrying → hands.
     Empty slots are skipped, so cycling never lands on nothing. */
  cycleSlot(dir) {
    const ring = [-1];
    for (let i = 0; i < 5; i++) if (this.inv[i]) ring.push(i);
    if (ring.length === 1) {
      this.sel = -1;
      say(TR('bare hands'), TR('nothing to cycle to yet'), '#8d9bb5', 1.2);
      SFX.menu();
      return;
    }
    let at = ring.indexOf(this.sel);
    if (at === -1) at = 0;
    this.selectSlot(ring[(at + dir + ring.length) % ring.length]);
  }

  /* Walking into a single-block ledge shouldn't stop you dead. If the thing in
     the way is one tile high and there's headroom above it, step up onto it. */
  tryStepUp(dir) {
    const W = G.world;
    const tx = Math.floor((dir > 0 ? this.x + this.w + 1 : this.x - 1) / TILE);
    const footY = Math.floor((this.y + this.h - 1) / TILE);
    if (!isSolid(W.get(tx, footY))) return;
    const rise = (this.y + this.h) - footY * TILE;
    if (rise <= 0 || rise > TILE + 2) return;
    const test = { x: this.x + dir * 2, y: this.y - rise - 1, w: this.w, h: this.h };
    const r = tileRange(test);
    for (let y = r.y0; y <= r.y1; y++)
      for (let x = r.x0; x <= r.x1; x++)
        if (isSolid(W.get(x, y))) return;
    this.y -= rise + 1;
  }

  /* Which block is Jay's fist actually on? Chest height first, then his feet,
     then the block above his head — whichever is soft enough to break. */
  pickMineTarget() {
    const W = G.world, f = this.facing;
    const fx = Math.floor((this.cx + f * (this.w / 2 + 5)) / TILE);
    const rows = [
      Math.floor(this.cy / TILE),
      Math.floor((this.y + this.h - 3) / TILE),
      Math.floor((this.y + 2) / TILE),
    ];
    for (const ry of rows) if (SOFT.has(W.get(fx, ry))) return { x: fx, y: ry };
    const ux = Math.floor(this.cx / TILE), uy = Math.floor((this.y - 3) / TILE);
    if (SOFT.has(W.get(ux, uy))) return { x: ux, y: uy };
    return null;
  }

  updateMining(dt) {
    if (this.punchT > 0) this.punchT -= dt;
    if (!this.barehanded || !Keys.isDown('KeyQ') || G.state !== 'play') {
      this.mineTarget = null; this.mineProgress = 0;
      return;
    }
    const t = this.pickMineTarget();
    if (!t) { this.mineTarget = null; this.mineProgress = 0; return; }
    if (!this.mineTarget || this.mineTarget.x !== t.x || this.mineTarget.y !== t.y) {
      this.mineTarget = t; this.mineProgress = 0;
    }
    // TAB doubles the fist too: twice the digging speed
    this.mineProgress += dt * (IN.doubler() ? 2.2 : 1) / 0.30;
    const d = TILEDEF[G.world.get(t.x, t.y)];
    if (d && Math.random() < 0.3) {
      spawnParticle(t.x * TILE + Math.random() * TILE, t.y * TILE + Math.random() * TILE,
        (Math.random() - 0.5) * 40, -20, d.base, 0.3);
    }
    if (this.mineProgress >= 1) {
      breakBlock(t.x, t.y);
      this.mineTarget = null; this.mineProgress = 0;
    }
  }

  get standH() { return 21; }
  get crouchH() { return 14; }

  update(dt) {
    const W = G.world;
    if (this.invuln > 0) this.invuln -= dt;
    if (this.cooldown > 0) this.cooldown -= dt;
    if (this.boostTimer > 0) this.boostTimer -= dt;
    this.blinkTimer -= dt;
    if (this.blinkTimer < -0.12) this.blinkTimer = 2 + Math.random() * 2.5;
    this.noclip = PHYS.noclip;

    const wasGrounded = this.onGround;   // last frame's result, before physics resets it
    const env = scanTiles(this);
    this.inWater = env.liquidWater;
    this.climbing = false;

    // a selected slot that holds nothing is really just bare hands
    if (this.sel >= 0 && !this.inv[this.sel]) this.sel = -1;

    /* ---- crouch ---- */
    const wantCrouch = IN.down() && this.onGround && !env.climb;
    if (wantCrouch && !this.crouch) { this.y += this.standH - this.crouchH; this.h = this.crouchH; this.crouch = true; }
    else if (!wantCrouch && this.crouch) {
      // only stand if there's headroom
      const test = { x: this.x, y: this.y - (this.standH - this.crouchH), w: this.w, h: this.standH };
      const r = tileRange(test);
      let blocked = false;
      for (let y = r.y0; y <= r.y1 && !blocked; y++)
        for (let x = r.x0; x <= r.x1; x++) if (isSolid(W.get(x, y))) { blocked = true; break; }
      if (!blocked) { this.y -= this.standH - this.crouchH; this.h = this.standH; this.crouch = false; }
    }

    /* ---- horizontal ---- */
    const maxSpd = (this.crouch ? PHYS.crouchMax : PHYS.runMax) * PHYS.speedMul *
                   (this.inWater ? 0.65 : 1) * (G.abilities.has('swift') ? 1.22 : 1);
    const accel = this.onGround ? PHYS.runAccel : PHYS.airAccel;
    let dir = 0;
    if (IN.left()) dir -= 1;
    if (IN.right()) dir += 1;
    if (dir !== 0) {
      this.vx = approach(this.vx, dir * maxSpd, accel * dt);
      this.facing = dir;
      this.walkPhase += dt * (6 + Math.abs(this.vx) * 0.045);
    } else {
      const fr = this.onGround ? PHYS.friction : PHYS.airFriction;
      this.vx = approach(this.vx, 0, fr * dt);
      this.walkPhase = 0;
    }

    /* ---- ladders & vines: UP climbs, DOWN descends ---- */
    if (env.climb && (IN.up() || IN.down() || this.wasClimbing)) {
      this.climbing = true;
      this.wasClimbing = true;
      this.vy = 0;
      if (IN.up()) this.vy = -PHYS.climbSpeed;
      else if (IN.down()) this.vy = PHYS.climbSpeed;
      this.jumpChain = 0;
      this.anim += dt * 6;
    } else {
      this.wasClimbing = false;
    }
    if (!env.climb) this.wasClimbing = false;

    /* ---- jumping: SPACE (and UP when not on a ladder) ---- */
    if (IN.jump() || (IN.upTap() && !env.climb)) this.buffer = PHYS.buffer;
    if (this.buffer > 0) this.buffer -= dt;
    if (this.onGround) { this.coyote = PHYS.coyote; this.jumpChain = 0; }
    else if (this.coyote > 0) this.coyote -= dt;

    if (this.buffer > 0) {
      const grounded = this.onGround || this.coyote > 0 || this.climbing;
      // DOWN + jump on a one-way platform = drop through it
      if (grounded && IN.down() && groundedOnPlatform(this) && !this.climbing) {
        this.dropTimer = 0.22; this.buffer = 0; this.y += 2; this.vy = 30;
        Audio2.blip(200, 0.05, 'triangle', 0.4);
      } else if (grounded || this.jumpChain < PHYS.maxJumpChain) {
        this.jumpChain++;
        // each press in mid-air throws Jay HIGHER than the last
        const power = PHYS.jumpV * (1 + PHYS.jumpChainGain * (this.jumpChain - 1));
        this.vy = this.inWater ? PHYS.waterSwim : power;
        this.coyote = 0; this.buffer = 0; this.wasClimbing = false;
        SFX.jump(this.jumpChain);
        for (let i = 0; i < 3 + this.jumpChain * 2; i++) {
          spawnParticle(this.cx, this.y + this.h, (Math.random() - 0.5) * 60,
            Math.random() * 40, this.jumpChain > 1 ? '#9fd0ff' : '#dfe7f0', 0.3);
        }
        if (this.jumpChain > 1) {
          G.pops.push({ x: this.cx, y: this.y, t: 0.5, text: this.jumpChain + '×', color: '#9fd0ff' });
        }
      }
    }
    // variable jump height
    if (this.vy < 0 && !IN.jumpHeld() && !this.climbing) this.vy += (-this.vy) * PHYS.jumpCut * dt * 60 * 0.16;

    /* ---- gravity / water ---- */
    if (this.climbing) {
      moveX(this, this.vx * dt);
      moveY(this, this.vy * dt);
      this.onGround = false;
      const still = scanTiles(this);
      if (!still.climb) this.wasClimbing = false;
    } else {
      const grav = this.inWater ? PHYS.waterGravity : PHYS.gravity;
      const mf = this.inWater ? PHYS.waterMaxFall : PHYS.maxFall;
      const fallSpeed = this.vy;
      this.physics(dt, grav, mf);
      /* Standing still, gravity re-collides with the floor every single tick, so
         `landed` is true constantly. Only a genuine air→ground transition is a
         landing — otherwise the thud plays at 60Hz and sounds like an engine. */
      const justLanded = this.onGround && !wasGrounded;
      if (justLanded) {
        SFX.land(clamp(fallSpeed / 420, 0, 1));
        this.jumpChain = 0;
        if (PHYS.bounce > 0) this.vy = PHYS.jumpV * PHYS.bounce;
      }
      if (this.onGround && dir !== 0 && this.hitWall === dir && !this.crouch) this.tryStepUp(dir);
    }
    if (this.inWater && IN.up()) this.vy = Math.min(this.vy, PHYS.waterSwim * 0.75);

    /* ---- powers ---- */
    if (IN.primary()) usePower(this, 'Q', IN.doubler());
    if (IN.secondary()) usePower(this, 'E', IN.doubler());
    this.updateMining(dt);
    /* slot keys: top row or number pad, 0 = bare hands */
    for (let n = 0; n <= 5; n++) {
      if (Keys.justPressed('Digit' + n, 'Numpad' + n)) this.selectSlot(n - 1);
    }
    if (IN.cycle()) this.cycleSlot(1);

    /* ---- footsteps: only while actually walking on the ground ---- */
    if (this.onGround && !this.climbing && Math.abs(this.vx) > 22) {
      // pace scales with how fast he's going, so a crouch-shuffle isn't a sprint
      this.stepTimer -= dt * clamp(Math.abs(this.vx) / PHYS.runMax, 0.35, 1.4);
      if (this.stepTimer <= 0) { this.stepTimer = 0.30; SFX.step(); }
    } else {
      this.stepTimer = Math.min(this.stepTimer, 0.07);
    }

    /* ---- hazards & the void ---- */
    if (env.hazard > 0) this.hurt(env.hazard, 0);
    if (this.y > (W.h + 3) * TILE) this.fellInVoid();

    /* ---- exit door ---- */
    const ex = W.exit;
    if (Math.abs(this.cx - (ex.x + 8)) < 14 && Math.abs(this.cy - (ex.y + 8)) < 22) {
      if (G.state === 'play') completeLevel();
    }

    G.spawnSafe = this.onGround && env.hazard === 0 ? { x: this.x, y: this.y } : G.spawnSafe;
  }

  fellInVoid() {
    /* THE SECRET: drop off the world while a power is still going off and the
       game tears. Timing-based rather than "is a projectile still alive",
       because the projectile always hits something on the way down — the old
       version was impossible to trigger on purpose, let alone by accident.
       Once per level, so it stays a discovery instead of a free pass. */
    const firing = G.time - this.powerFiredAt < GLITCH_WINDOW;
    if (firing && !G.glitchUsedHere) {
      G.glitchUsedHere = true;
      openGlitchMenu(this.powerFiredKind);
      return;
    }
    playerDied('the void');
  }

  hurt(amount, knock = 0) {
    if (this.invuln > 0 || G.state !== 'play') return;
    this.hp -= amount;
    this.invuln = 1.25;
    G.flash = 0.18; G.cam.shake = 6;
    SFX.hurt();
    this.vy = -180;
    if (knock) this.vx = knock * 150;
    for (let i = 0; i < 12; i++)
      spawnParticle(this.cx, this.cy, (Math.random() - 0.5) * 200, (Math.random() - 0.8) * 180, '#ff6b6b', 0.5);
    if (this.hp <= 0) playerDied('hit');
  }

  heal(n) {
    this.hp = Math.min(this.maxHp, this.hp + n);
  }

  addItem(kind) {
    if (this.inv.includes(kind)) {
      say(TRF('recharged', POWERS[kind].name), POWERS[kind].blurb, POWERS[kind].color, 2);
      return true;
    }
    const slot = this.inv.indexOf(null);
    if (slot === -1) { say(TR('inventory full'), TR('five is the limit — press 1-5'), '#ff9d6b', 2); return false; }
    this.inv[slot] = kind;
    this.sel = slot;
    SFX.pickup();
    say(TRF('toSlot', POWERS[kind].name, slot + 1), POWERS[kind].blurb, POWERS[kind].color, 3);
    return true;
  }
}

/* ============================ PICKUPS ==================================== */
class ItemPickup extends Entity {
  constructor(x, y, kind) { super(x, y, 12, 13); this.kind = kind; this.t = Math.random() * 6; }
  update(dt) {
    this.t += dt;
    if (this.overlaps(G.player, 2)) {
      if (G.player.addItem(this.kind)) {
        this.dead = true;
        for (let i = 0; i < 22; i++)
          spawnParticle(this.cx, this.cy, (Math.random() - 0.5) * 220, (Math.random() - 0.5) * 220,
            POWERS[this.kind].color, 0.7);
      }
    }
  }
}

class Gem extends Entity {
  constructor(x, y) { super(x, y, 8, 9); this.t = Math.random() * 6; }
  update(dt) {
    this.t += dt;
    if (this.overlaps(G.player, 3)) {
      this.dead = true;
      collectGem(this.cx, this.cy);
    }
  }
}

class Rune extends Entity {
  constructor(x, y, kind) { super(x, y, 13, 13); this.kind = kind; this.t = Math.random() * 6; this.used = false; this.cool = 0; }
  update(dt) {
    this.t += dt;
    if (this.cool > 0) this.cool -= dt;
    if (!this.used && this.cool <= 0 && this.overlaps(G.player, 2) && G.state === 'play') openRune(this);
  }
}

/* ============================== MOBS ===================================== */
const MOBDEF = {
  slime:     { w: 14, h: 12, hp: 1, hostile: true,  stomp: true,  color: '#5fbf5a', dark: '#3f8f3c', speed: 55 },
  spikeling: { w: 14, h: 14, hp: 2, hostile: true,  stomp: false, color: '#b06fd6', dark: '#7c47a0', speed: 42 },
  batty:     { w: 14, h: 10, hp: 1, hostile: true,  stomp: true,  color: '#7d6a99', dark: '#544667', speed: 66, fly: true },
  guardian:  { w: 14, h: 20, hp: 3, hostile: true,  stomp: false, color: '#c9ced9', dark: '#8e94a3', speed: 30, shoots: true },
  pig:       { w: 16, h: 12, hp: 1, hostile: false, stomp: true,  color: '#f0a5a8', dark: '#c97b80', speed: 26 },
  sheep:     { w: 16, h: 14, hp: 1, hostile: false, stomp: true,  color: '#f2f2f0', dark: '#cfcfcb', speed: 22 },
  chicken:   { w: 11, h: 11, hp: 1, hostile: false, stomp: true,  color: '#fbfbf6', dark: '#d8d8cf', speed: 30 },
};

class Mob extends Entity {
  constructor(x, y, type, friendly) {
    const d = MOBDEF[type];
    super(x, y, d.w, d.h);
    this.type = type; this.d = d;
    this.hp = d.hp;
    this.hostile = friendly === true ? false : d.hostile;
    this.tamed = friendly === true;
    this.dir = Math.random() < 0.5 ? -1 : 1;
    this.timer = Math.random() * 2;
    this.frozen = 0; this.blind = 0; this.burn = 0; this.stun = 0;
    this.baseY = y; this.phase = Math.random() * 7;
    this.shootTimer = 1 + Math.random() * 2;
    this.flash = 0;
  }

  update(dt) {
    const P = G.player;
    if (this.flash > 0) this.flash -= dt;
    if (this.frozen > 0) {
      this.frozen -= dt;
      this.vx = 0;
      if (!this.d.fly) this.physics(dt, PHYS.gravity, PHYS.maxFall);
      return;
    }
    if (this.burn > 0) {
      this.burn -= dt;
      if (Math.random() < 0.4) spawnParticle(this.cx, this.cy, (Math.random() - 0.5) * 40, -40, '#ff9d3a', 0.4);
      this.hurtTick = (this.hurtTick || 0) + dt;
      if (this.hurtTick > 0.5) { this.hurtTick = 0; this.damage(1); }
    }
    if (this.stun > 0) { this.stun -= dt; }
    if (this.blind > 0) this.blind -= dt;

    this.timer -= dt;
    this.phase += dt;
    const distX = P.cx - this.cx, distY = P.cy - this.cy;
    const near = Math.abs(distX) < 190 && Math.abs(distY) < 110;
    const chase = this.hostile && near && this.blind <= 0;

    switch (this.type) {
      case 'slime': {
        if (this.onGround && this.timer <= 0) {
          this.timer = 0.85 + Math.random() * 0.8;
          this.dir = chase ? sign(distX) || 1 : (Math.random() < 0.5 ? -1 : 1);
          this.vy = -215;
          this.vx = this.dir * this.d.speed;
        }
        if (this.onGround) this.vx = approach(this.vx, 0, 400 * dt);
        break;
      }
      case 'spikeling': {
        if (this.stun <= 0) {
          if (chase) this.dir = sign(distX) || this.dir;
          this.vx = this.dir * this.d.speed;
          if (this.hitWall) this.dir *= -1;
          if (this.onGround && !this.groundAhead()) this.dir *= -1;
        }
        break;
      }
      case 'batty': {
        const tx = chase ? P.cx : this.cx + this.dir * 60;
        this.vx = approach(this.vx, sign(tx - this.cx) * this.d.speed, 200 * dt);
        this.vy = Math.sin(this.phase * 3) * 40 + (chase ? sign(P.cy - this.cy) * 26 : 0);
        if (this.hitWall) this.dir *= -1;
        break;
      }
      case 'guardian': {
        if (this.stun <= 0) {
          this.dir = chase ? (sign(distX) || this.dir) : this.dir;
          this.vx = this.dir * this.d.speed * (chase ? 1 : 0.5);
          if (this.hitWall) this.dir *= -1;
          if (this.onGround && !this.groundAhead()) this.dir *= -1;
        }
        this.shootTimer -= dt;
        if (chase && this.shootTimer <= 0) {
          this.shootTimer = 2.0;
          const s = new Shot(this.cx, this.cy - 2, sign(distX) * 105, -20, 'orb', false);
          s.hostile = true; G.shots.push(s);
          Audio2.blip(300, 0.1, 'sawtooth', 0.5, -120);
        }
        break;
      }
      default: { // passive animals
        if (this.timer <= 0) {
          this.timer = 1.2 + Math.random() * 2.4;
          this.dir = Math.random() < 0.5 ? -1 : (Math.random() < 0.5 ? 0 : 1);
          if (this.onGround && Math.random() < 0.25) this.vy = -150;
        }
        this.vx = approach(this.vx, this.dir * this.d.speed, 300 * dt);
        if (this.hitWall) this.dir *= -1;
        if (this.onGround && this.dir !== 0 && !this.groundAhead()) this.dir *= -1;
        break;
      }
    }

    if (this.d.fly) {
      this.landed = false; this.hitWall = 0;
      moveX(this, this.vx * dt);
      moveY(this, this.vy * dt);
    } else {
      this.physics(dt, PHYS.gravity, PHYS.maxFall);
    }
    if (this.vx !== 0) this.facing = sign(this.vx);

    const env = scanTiles(this);
    if (env.hazard > 0 && this.type !== 'slime') this.damage(1);
    if (this.y > (G.world.h + 2) * TILE) this.dead = true;

    /* contact with Jay */
    if (this.overlaps(P, 0) && G.state === 'play') {
      const stomping = P.vy > 40 && (P.y + P.h) - this.y < 12;
      if (stomping && this.d.stomp) {
        this.damage(99, true);
        P.vy = IN.jumpHeld() ? -300 : -210;
        P.jumpChain = Math.max(0, P.jumpChain - 1);
        SFX.stomp();
      } else if (this.hostile) {
        P.hurt(1, sign(P.cx - this.cx));
      }
    }
  }

  groundAhead() {
    const W = G.world;
    const fx = Math.floor((this.cx + this.dir * (this.w * 0.6 + 2)) / TILE);
    const fy = Math.floor((this.y + this.h + 2) / TILE);
    return isSolid(W.get(fx, fy)) || isPlatform(W.get(fx, fy));
  }

  knock(dx, power = 220) {
    this.vx = dx * power;
    this.vy = -140;
    this.stun = 0.5;
  }

  damage(n, stomped) {
    if (this.dead) return;
    this.hp -= n;
    this.flash = 0.12;
    if (this.hp > 0) { Audio2.blip(240, 0.05, 'square', 0.4); return; }
    this.dead = true;
    if (this.hostile) { G.score += 100; }
    for (let i = 0; i < 16; i++)
      spawnParticle(this.cx, this.cy, (Math.random() - 0.5) * 220, (Math.random() - 0.7) * 200,
        this.d.color, 0.6);
    if (!stomped) Audio2.blip(180, 0.1, 'square', 0.5, -100);
    // defeat a square number of foes (1, 4, 9, 16…) and one drops a gem
    G.kills = (G.kills || 0) + 1;
    if (isPerfectSquare(G.kills) && G.kills > 1) {
      const g = new Gem(this.cx - 4, this.cy - 4); g.vy = -60; G.gemEnts.push(g);
      G.pops.push({ x: this.cx, y: this.cy - 10, t: 1.2, text: '√' + G.kills + ' = ' + Math.sqrt(G.kills), color: '#9ff0c0' });
      SFX.square();
    }
  }
}

/* =========================== PROJECTILES ================================= */
class Shot extends Entity {
  constructor(x, y, vx, vy, kind, doubled) {
    super(x - 4, y - 4, 8, 8);
    this.vx = vx; this.vy = vy; this.kind = kind;
    this.life = 2.4; this.doubled = !!doubled;
    this.grav = 0; this.hostile = false; this.pierce = false;
    this.t = 0;
    const k = SHOTDEF[kind] || {};
    Object.assign(this, k);
  }
  update(dt) {
    this.t += dt;
    this.life -= dt;
    if (this.life <= 0) { this.expire(); return; }
    this.hitWall = 0;
    moveX(this, this.vx * dt);
    if (this.hitWall) { this.onImpact(); return; }
    this.vy += this.grav * dt;
    moveY(this, this.vy * dt);
    if (this.onGround || this.bonkedHead) { this.onImpact(); return; }
    if (this.y > (G.world.h + 2) * TILE) { this.dead = true; return; }

    if (this.trail) {
      if (Math.random() < 0.7) spawnParticle(this.cx, this.cy, (Math.random() - 0.5) * 40,
        (Math.random() - 0.5) * 40, this.trail, 0.3);
    }

    if (this.hostile) {
      if (this.overlaps(G.player)) { G.player.hurt(1, sign(this.vx)); this.dead = true; }
      return;
    }
    for (const m of G.mobs) {
      if (m.dead || m.tamed) continue;
      if (!this.overlaps(m)) continue;
      this.hitMob(m);
      if (!this.pierce) { this.onImpact(); return; }
    }
  }
  hitMob(m) {
    switch (this.kind) {
      case 'wind':
        m.knock(sign(this.vx), this.doubled ? 340 : 230);
        m.damage(this.doubled ? 1 : 0.5);
        break;
      case 'windorb':
        m.knock(sign(this.vx), 300); m.damage(1);
        break;
      case 'magma':
        m.burn = 2.2; m.damage(2); break;
      case 'eruption':
        m.burn = 3; m.damage(2); break;
      case 'water':
        m.blind = 4; m.damage(0.5);
        G.pops.push({ x: m.cx, y: m.y - 6, t: 0.8, text: TR('blind!'), color: '#8fd3ff' });
        break;
      case 'ice':
        m.frozen = 4.5; m.vx = 0;
        G.pops.push({ x: m.cx, y: m.y - 6, t: 0.8, text: TR('frozen!'), color: '#bff0ff' });
        break;
      case 'orb':
        break;
      default: m.damage(1);
    }
  }
  onImpact() {
    switch (this.kind) {
      case 'magma':
        boom(this.cx, this.cy, 26, '#ff8a3a', 1);
        break;
      case 'eruption':
        boom(this.cx, this.cy, 44, '#ff6a2a', 2);
        G.hazards.push(new LavaPool(this.cx - 22, this.cy - 4, 44));
        G.cam.shake = 8;
        SFX.boom();
        break;
      case 'ice':
        for (let i = 0; i < 10; i++) spawnParticle(this.cx, this.cy, (Math.random() - .5) * 160, (Math.random() - .5) * 160, '#bff0ff', .5);
        break;
      case 'water':
        for (let i = 0; i < 8; i++) spawnParticle(this.cx, this.cy, (Math.random() - .5) * 120, (Math.random() - .5) * 120, '#6fb2ff', .4);
        break;
      case 'wind': case 'windorb':
        for (let i = 0; i < 6; i++) spawnParticle(this.cx, this.cy, (Math.random() - .5) * 200, (Math.random() - .5) * 60, '#e6f4ff', .35);
        break;
    }
    this.dead = true;
  }
  expire() { this.onImpact(); }
}

const SHOTDEF = {
  wind:     { life: 0.55, grav: 0, trail: '#dff0ff', pierce: true },
  windorb:  { life: 1.5, grav: 220, trail: '#cfe8ff' },
  magma:    { life: 2.6, grav: 520, trail: '#ff9a3a' },
  eruption: { life: 2.6, grav: 480, trail: '#ff7020' },
  water:    { life: 1.4, grav: 380, trail: '#66aaff' },
  ice:      { life: 1.6, grav: 120, trail: '#cdf2ff' },
  orb:      { life: 3.0, grav: 90, trail: '#ffc27a' },
  ray:      { life: 0.16, grav: 0, pierce: true },
};

/* ---- ground hazards / effects ---- */
class LavaPool {
  constructor(x, y, w) { this.x = x; this.y = y; this.w = w; this.h = 6; this.t = 4.5; this.dead = false; }
  update(dt) {
    this.t -= dt;
    if (this.t <= 0) { this.dead = true; return; }
    if (Math.random() < 0.5)
      spawnParticle(this.x + Math.random() * this.w, this.y, (Math.random() - .5) * 30, -50, '#ff9d3a', 0.5);
    const box = { x: this.x, y: this.y, w: this.w, h: this.h };
    for (const m of G.mobs) if (!m.dead && !m.tamed && rectHit(box, m)) { m.burn = 2; m.damage(0.03); }
  }
}

class EarthSpike {
  constructor(x, groundY, big) {
    this.x = x; this.y = groundY; this.big = big;
    this.h = 0; this.maxH = big ? 34 : 20;
    this.t = big ? 1.4 : 0.9; this.dead = false; this.hit = new Set();
  }
  update(dt) {
    this.h = Math.min(this.maxH, this.h + 200 * dt);
    this.t -= dt;
    if (this.t <= 0) { this.dead = true; return; }
    const box = { x: this.x - (this.big ? 9 : 5), y: this.y - this.h, w: this.big ? 18 : 10, h: this.h };
    for (const m of G.mobs) {
      if (m.dead || m.tamed || this.hit.has(m)) continue;
      if (rectHit(box, m)) {
        this.hit.add(m);
        m.damage(this.big ? 99 : 2);
        m.vy = -180;
      }
    }
  }
}

class Ray {
  constructor(x, y, dir, len, doubled) {
    this.x = x; this.y = y; this.dir = dir; this.len = len;
    this.t = 0.22; this.dead = false; this.doubled = doubled;
    const box = { x: dir > 0 ? x : x - len, y: y - 5, w: len, h: 10 };
    this.box = box;
    for (const m of G.mobs) {
      // lightning spares the pigs, sheep and chickens, same as the earth nova
      if (m.dead || m.tamed || !m.hostile) continue;
      if (rectHit(box, m)) { m.damage(doubled ? 4 : 2); m.knock(dir, 140); m.stun = 0.6; }
    }
  }
  update(dt) { this.t -= dt; if (this.t <= 0) this.dead = true; }
}

function rectHit(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function boom(x, y, radius, color, dmg) {
  G.cam.shake = Math.max(G.cam.shake, radius * 0.18);
  for (let i = 0; i < radius; i++) {
    const a = Math.random() * Math.PI * 2, s = Math.random() * radius * 6;
    spawnParticle(x, y, Math.cos(a) * s, Math.sin(a) * s - 40, color, 0.6);
  }
  const box = { x: x - radius, y: y - radius, w: radius * 2, h: radius * 2 };
  for (const m of G.mobs) if (!m.dead && !m.tamed && rectHit(box, m)) { m.damage(dmg); m.knock(sign(m.cx - x), 200); }
  SFX.boom();
}

/* Knock a block out of the world. Only SOFT blocks ever get here. */
function breakBlock(x, y) {
  const W = G.world;
  const id = W.get(x, y);
  if (!SOFT.has(id)) return false;
  const d = TILEDEF[id];
  W.set(x, y, T.AIR);
  for (let i = 0; i < 14; i++) {
    spawnParticle(x * TILE + Math.random() * TILE, y * TILE + Math.random() * TILE,
      (Math.random() - 0.5) * 150, -Math.random() * 160, Math.random() < 0.5 ? d.base : d.shade, 0.55);
  }
  Audio2.blip(150 + Math.random() * 60, 0.07, 'square', 0.45, -60);
  Audio2.noise(0.06, 0.2);
  G.score += 5;
  return true;
}

/* Fist swing: hurt anything in a small box in front of Jay. */
function meleeHit(p, reach, up) {
  const box = up
    ? { x: p.cx - 13, y: p.y - 16, w: 26, h: 20 }
    : { x: p.facing > 0 ? p.cx : p.cx - reach, y: p.y + 2, w: reach, h: p.h - 4 };
  let hits = 0;
  for (const m of G.mobs) {
    if (m.dead || m.tamed || !rectHit(box, m)) continue;
    m.damage(1);
    if (up) { m.vy = -260; m.stun = 0.5; } else m.knock(p.facing, 190);
    hits++;
  }
  return hits;
}

/* ---- particles ---- */
function spawnParticle(x, y, vx, vy, color, life) {
  if (G.parts.length > 620) return;
  G.parts.push({ x, y, vx, vy, color, life, max: life, size: 1 + Math.random() * 2 });
}
function updateParticles(dt) {
  for (let i = G.parts.length - 1; i >= 0; i--) {
    const p = G.parts[i];
    p.life -= dt;
    if (p.life <= 0) { G.parts.splice(i, 1); continue; }
    p.vy += 420 * dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
  }
  for (let i = G.pops.length - 1; i >= 0; i--) {
    const p = G.pops[i];
    p.t -= dt; p.y -= 22 * dt;
    if (p.t <= 0) G.pops.splice(i, 1);
  }
}
