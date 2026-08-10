/* ==========================================================================
   RENDER — world, sprites, lighting, HUD, screens
   ========================================================================== */

const gameCanvas = document.getElementById('game');
const hudCanvas = document.getElementById('hud');
const ctx = gameCanvas.getContext('2d');
const hud = hudCanvas.getContext('2d');
const HS = 3;                                  // hud supersample
let darkCanvas = null, darkCtx = null;

function initCanvases() {
  gameCanvas.width = VIEW_W; gameCanvas.height = VIEW_H;
  hudCanvas.width = VIEW_W * HS; hudCanvas.height = VIEW_H * HS;
  ctx.imageSmoothingEnabled = false;
  darkCanvas = document.createElement('canvas');
  darkCanvas.width = VIEW_W; darkCanvas.height = VIEW_H;
  darkCtx = darkCanvas.getContext('2d');
  resizeStage();
}

function resizeStage() {
  const stage = document.getElementById('stage');
  const pad = 24;
  const availW = innerWidth - pad, availH = innerHeight - pad;
  const scale = Math.max(1, Math.min(availW / VIEW_W, availH / VIEW_H));
  stage.style.width = Math.floor(VIEW_W * scale) + 'px';
  stage.style.height = Math.floor(VIEW_H * scale) + 'px';
}
addEventListener('resize', resizeStage);

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen();
}

/* ------------------------------ world ----------------------------------- */
function drawBackground(W, camX, camY) {
  const sky = W.cfg.sky;
  const grd = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  grd.addColorStop(0, sky[0]); grd.addColorStop(0.55, sky[1]); grd.addColorStop(1, sky[2]);
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  if (W.biome === 'plains' || W.biome === 'desert') {
    // sun + clouds
    ctx.fillStyle = W.biome === 'desert' ? '#fff3c0' : '#fffbe8';
    ctx.fillRect(392, 26, 22, 22);
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    for (let i = 0; i < 9; i++) {
      const cx = ((i * 137 + 40) - camX * 0.15) % (VIEW_W + 130) - 60;
      const cy = 18 + (i * 53) % 60;
      ctx.fillRect(cx, cy, 26, 7); ctx.fillRect(cx + 6, cy - 5, 15, 6); ctx.fillRect(cx + 12, cy + 6, 18, 5);
    }
  }
  if (W.biome === 'castle') {
    ctx.fillStyle = 'rgba(255,255,255,.75)';
    for (let i = 0; i < 60; i++) {
      const sx = (i * 79) % VIEW_W, sy = (i * 43) % 120;
      if ((i * 7919) % 5 === 0) ctx.fillRect(sx, sy, 2, 2); else ctx.fillRect(sx, sy, 1, 1);
    }
    ctx.fillStyle = '#e8eeff';
    ctx.beginPath(); ctx.arc(400, 44, 16, 0, 7); ctx.fill();
    ctx.fillStyle = W.cfg.sky[0];
    ctx.beginPath(); ctx.arc(393, 40, 14, 0, 7); ctx.fill();
  }

  if (W.biome === 'cave') {
    // no horizon underground — just a darker wall of stone behind everything
    ctx.fillStyle = '#141b27';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.fillStyle = 'rgba(255,255,255,.028)';
    for (let i = 0; i < 150; i++) {
      const wx = Math.floor((i * 977 + camX * 0.35) / 1) % (VIEW_W + 40) - 20;
      ctx.fillRect(wx, (i * 613) % VIEW_H, 3, 3);
    }
    return;
  }

  /* rolling parallax ridges — smooth, hazy, sits behind the terrain */
  const ridge = (speed, baseY, amp, color, alpha, cw) => {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    const off = camX * speed;
    const first = Math.floor(off / cw) - 1;
    const cols = Math.ceil(VIEW_W / cw) + 3;
    for (let i = 0; i < cols; i++) {
      const wx = first + i;
      const n = Math.sin(wx * 0.21) * 0.5 + Math.sin(wx * 0.077 + 2.1) * 0.34 + Math.sin(wx * 0.53) * 0.16;
      const top = Math.round(baseY - n * amp);
      ctx.fillRect(Math.round(wx * cw - off), top, cw, VIEW_H - top);
    }
    ctx.globalAlpha = 1;
  };
  ridge(0.16, 168, 24, shadeOf(W.biome, 0), 0.50, 20);
  ridge(0.36, 196, 17, shadeOf(W.biome, 1), 0.72, 14);
}

function shadeOf(biome, i) {
  const map = {
    plains: ['#4f7f5a', '#3b6247'],
    cave: ['#0d131d', '#0a0f18'],
    desert: ['#b8945a', '#997643'],
    volcanic: ['#3f151a', '#2b0e12'],
    castle: ['#161c37', '#0f1428'],
  };
  return (map[biome] || map.plains)[i];
}

function drawWorld(W, camX, camY) {
  const x0 = Math.max(0, Math.floor(camX / TILE));
  const x1 = Math.min(W.w - 1, Math.ceil((camX + VIEW_W) / TILE));
  const y0 = Math.max(0, Math.floor(camY / TILE));
  const y1 = Math.min(W.h - 1, Math.ceil((camY + VIEW_H) / TILE));
  const t = G.time;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const id = W.tiles[y * W.w + x];
      if (id === T.AIR) continue;
      const tex = TEX[id];
      if (!tex) continue;
      const v = Math.floor(hash2(x, y) * 4);
      const sx = Math.round(x * TILE - camX), sy = Math.round(y * TILE - camY);
      if (id === T.WATER) {
        const surface = W.get(x, y - 1) !== T.WATER;
        ctx.globalAlpha = 0.72;
        ctx.drawImage(tex[v], sx, sy + (surface ? Math.round(Math.sin(t * 2 + x * 0.6) * 0.8) : 0));
        ctx.globalAlpha = 1;
        if (surface) {
          ctx.fillStyle = 'rgba(190,225,255,.45)';
          ctx.fillRect(sx, sy + Math.round(Math.sin(t * 2 + x * 0.6) * 0.8), TILE, 1);
        }
        continue;
      }
      if (id === T.LAVA) {
        ctx.drawImage(tex[v], sx, sy);
        ctx.fillStyle = 'rgba(255,190,90,' + (0.16 + Math.sin(t * 3 + x) * 0.10) + ')';
        ctx.fillRect(sx, sy, TILE, TILE);
        if (W.get(x, y - 1) !== T.LAVA) {
          ctx.fillStyle = 'rgba(255,236,170,' + (0.55 + Math.sin(t * 5 + x * 0.8) * 0.25) + ')';
          ctx.fillRect(sx, sy, TILE, 2);
        }
        continue;
      }
      ctx.drawImage(tex[v], sx, sy);
    }
  }
}

/* ------------------------------ Jay -------------------------------------- */
const SKIN = '#f2c79c', SKIN_D = '#d6a377', HAIR = '#6b4226', HAIR_L = '#835532';
const SHIRT = '#3f7fd6', SHIRT_D = '#2d5fa5', PANTS = '#39406b', SHOE = '#4a3a2a';

function drawJay(p, camX, camY) {
  const sx = Math.round(p.x - camX), sy = Math.round(p.y - camY);
  if (p.invuln > 0 && Math.floor(G.time * 20) % 2 === 0) return;

  ctx.save();
  ctx.translate(sx + (p.facing < 0 ? p.w : 0), sy);
  ctx.scale(p.facing < 0 ? -1 : 1, 1);
  if (p.crouch) { ctx.translate(0, 0); ctx.scale(1, p.h / 21); }

  const moving = Math.abs(p.vx) > 8 && p.onGround;
  const sw = moving ? Math.sin(p.walkPhase) : 0;
  const air = !p.onGround && !p.climbing;
  const climbSw = p.climbing ? Math.sin(p.anim * 2) : 0;

  // legs
  const legA = air ? 2 : Math.round(sw * 3);
  const legB = air ? -2 : Math.round(-sw * 3);
  ctx.fillStyle = PANTS;
  ctx.fillRect(2, 15, 3, 5 + (legA > 0 ? 0 : 1));
  ctx.fillRect(6, 15, 3, 5 + (legB > 0 ? 0 : 1));
  ctx.fillStyle = SHOE;
  ctx.fillRect(2 + Math.max(0, legA), 20, 4, 1);
  ctx.fillRect(6 + Math.max(0, legB), 20, 4, 1);

  // back arm
  ctx.fillStyle = SHIRT_D;
  const armB = air ? -4 : Math.round(-sw * 3) + (p.climbing ? Math.round(climbSw * 3) : 0);
  ctx.fillRect(0, 8 + Math.max(0, armB * 0.4), 2, 6);
  ctx.fillStyle = SKIN_D; ctx.fillRect(0, 13 + Math.max(0, armB * 0.4), 2, 2);

  // torso
  ctx.fillStyle = SHIRT; ctx.fillRect(2, 8, 7, 7);
  ctx.fillStyle = SHIRT_D; ctx.fillRect(2, 13, 7, 2);
  // a small "²" on his shirt
  ctx.fillStyle = '#ffe98f';
  ctx.fillRect(5, 10, 2, 1); ctx.fillRect(6, 11, 1, 1); ctx.fillRect(5, 11, 1, 1);

  // head
  ctx.fillStyle = SKIN; ctx.fillRect(1, 0, 9, 8);
  ctx.fillStyle = HAIR; ctx.fillRect(1, 0, 9, 3); ctx.fillRect(1, 3, 2, 2); ctx.fillRect(9, 3, 1, 3);
  ctx.fillStyle = HAIR_L; ctx.fillRect(3, 0, 4, 1);
  const blink = p.blinkTimer < 0;
  ctx.fillStyle = '#ffffff';
  if (!blink) { ctx.fillRect(4, 4, 2, 2); ctx.fillRect(7, 4, 2, 2); }
  ctx.fillStyle = '#25334d';
  if (!blink) { ctx.fillRect(5, 4, 1, 2); ctx.fillRect(8, 4, 1, 2); }
  else { ctx.fillRect(4, 5, 2, 1); ctx.fillRect(7, 5, 2, 1); }
  ctx.fillStyle = SKIN_D; ctx.fillRect(5, 7, 3, 1);

  // front arm — thrown straight out when he's punching
  if (p.punchT > 0) {
    const ext = Math.round(3 + p.punchT * 14);
    ctx.fillStyle = SHIRT; ctx.fillRect(9, 9, ext, 3);
    ctx.fillStyle = SKIN; ctx.fillRect(9 + ext, 8, 3, 4);
  } else {
    ctx.fillStyle = SHIRT;
    const armF = air ? -5 : Math.round(sw * 3) + (p.climbing ? Math.round(-climbSw * 3) : 0);
    ctx.fillRect(9, 8 + Math.max(0, armF * 0.4), 2, 6);
    ctx.fillStyle = SKIN; ctx.fillRect(9, 13 + Math.max(0, armF * 0.4), 2, 2);
  }

  ctx.restore();

  // held power glow
  const kind = p.inv[p.sel];
  if (kind) {
    ctx.save();
    ctx.globalAlpha = 0.9;
    drawPowerIcon(ctx, kind, sx + (p.facing > 0 ? 11 : -12), sy + 9, 0.62, G.time);
    ctx.restore();
  }
  if (IN.doubler()) {
    ctx.fillStyle = '#ffe98f';
    ctx.font = 'bold 9px monospace';
    ctx.fillText('²', sx + 12, sy - 2);
  }
  if (p.boostTimer > 0) {
    ctx.strokeStyle = 'rgba(255,230,128,.7)'; ctx.lineWidth = 1;
    ctx.strokeRect(sx - 2, sy - 2, p.w + 4, p.h + 4);
  }
}

/* ------------------------------ mobs ------------------------------------- */
function drawMob(m, camX, camY) {
  const sx = Math.round(m.x - camX), sy = Math.round(m.y - camY);
  const d = m.d;
  const wob = Math.sin(m.phase * 5) * 1;
  ctx.save();
  ctx.translate(sx, sy);
  if (m.flash > 0) ctx.globalAlpha = 0.6;

  const eye = (ex, ey) => {
    ctx.fillStyle = '#ffffff'; ctx.fillRect(ex, ey, 2, 2);
    ctx.fillStyle = m.blind > 0 ? '#9fd7ee' : '#1b1b24';
    ctx.fillRect(ex + (m.facing > 0 ? 1 : 0), ey, 1, 2);
  };

  switch (m.type) {
    case 'slime': {
      const sq = m.onGround ? 1 + Math.max(0, -m.vy) * 0.0004 : 1;
      const hh = m.h / sq, ww = m.w * sq;
      ctx.fillStyle = d.dark; ctx.fillRect(0, m.h - hh, ww, hh);
      ctx.fillStyle = d.color; ctx.fillRect(1, m.h - hh + 1, ww - 2, hh - 2);
      ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(2, m.h - hh + 2, 3, 2);
      eye(3, m.h - hh + 4); eye(8, m.h - hh + 4);
      break;
    }
    case 'spikeling': {
      ctx.fillStyle = d.dark; ctx.fillRect(0, 4, 14, 10);
      ctx.fillStyle = d.color; ctx.fillRect(1, 5, 12, 8);
      ctx.fillStyle = '#f0e6ff';
      for (let i = 0; i < 5; i++) { ctx.fillRect(1 + i * 3, 2, 2, 3); ctx.fillRect(2 + i * 3, 0, 1, 2); }
      eye(3, 7); eye(9, 7);
      ctx.fillStyle = d.dark;
      ctx.fillRect(2, 13, 3, 2); ctx.fillRect(9, 13, 3, 2);
      break;
    }
    case 'batty': {
      const flap = Math.sin(m.phase * 14) * 3;
      ctx.fillStyle = d.dark;
      ctx.beginPath(); ctx.moveTo(2, 5); ctx.lineTo(-5, 2 + flap); ctx.lineTo(-3, 8 + flap); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(12, 5); ctx.lineTo(19, 2 + flap); ctx.lineTo(17, 8 + flap); ctx.closePath(); ctx.fill();
      ctx.fillStyle = d.color; ctx.fillRect(2, 2, 10, 8);
      ctx.fillStyle = d.dark; ctx.fillRect(2, 0, 2, 3); ctx.fillRect(10, 0, 2, 3);
      eye(4, 4); eye(8, 4);
      break;
    }
    case 'guardian': {
      ctx.fillStyle = d.dark; ctx.fillRect(0, 0, 14, 20);
      ctx.fillStyle = d.color; ctx.fillRect(1, 1, 12, 18);
      ctx.fillStyle = '#5a6070'; ctx.fillRect(1, 6, 12, 2);
      ctx.fillStyle = '#2a2f3d'; ctx.fillRect(2, 3, 10, 3);
      ctx.fillStyle = m.blind > 0 ? '#9fd7ee' : '#ff7a5a';
      ctx.fillRect(m.facing > 0 ? 7 : 3, 4, 4, 1);
      ctx.fillStyle = d.dark; ctx.fillRect(2, 19, 4, 1); ctx.fillRect(8, 19, 4, 1);
      ctx.fillStyle = '#8e94a3'; ctx.fillRect(m.facing > 0 ? 13 : -1, 9, 2, 7);
      break;
    }
    case 'pig': {
      ctx.fillStyle = d.dark; ctx.fillRect(0, 2, 16, 8);
      ctx.fillStyle = d.color; ctx.fillRect(1, 3, 14, 6);
      const hx = m.facing > 0 ? 12 : 0;
      ctx.fillStyle = d.color; ctx.fillRect(hx, 1, 5, 6);
      ctx.fillStyle = '#e08a8f'; ctx.fillRect(m.facing > 0 ? 16 : -1, 3, 1, 3);
      ctx.fillStyle = '#1b1b24'; ctx.fillRect(hx + (m.facing > 0 ? 3 : 1), 3, 1, 1);
      ctx.fillStyle = d.dark;
      ctx.fillRect(2, 10 + wob * 0.3, 3, 2); ctx.fillRect(10, 10 - wob * 0.3, 3, 2);
      break;
    }
    case 'sheep': {
      ctx.fillStyle = '#d8d8d2'; ctx.fillRect(0, 2, 16, 9);
      ctx.fillStyle = d.color; ctx.fillRect(1, 1, 14, 9);
      ctx.fillStyle = '#e6e6e0';
      for (let i = 0; i < 5; i++) ctx.fillRect(1 + i * 3, 0, 2, 2);
      const hx = m.facing > 0 ? 12 : -1;
      ctx.fillStyle = '#c9b7a6'; ctx.fillRect(hx, 4, 5, 5);
      ctx.fillStyle = '#1b1b24'; ctx.fillRect(hx + (m.facing > 0 ? 3 : 1), 6, 1, 1);
      ctx.fillStyle = '#b9b9b2';
      ctx.fillRect(2, 11 + wob * 0.3, 3, 3); ctx.fillRect(10, 11 - wob * 0.3, 3, 3);
      break;
    }
    case 'chicken': {
      ctx.fillStyle = d.dark; ctx.fillRect(1, 3, 9, 6);
      ctx.fillStyle = d.color; ctx.fillRect(2, 3, 8, 5);
      const hx = m.facing > 0 ? 7 : 1;
      ctx.fillStyle = d.color; ctx.fillRect(hx, 0, 4, 4);
      ctx.fillStyle = '#e05a4a'; ctx.fillRect(hx + 1, -1, 2, 1);
      ctx.fillStyle = '#f0b03a'; ctx.fillRect(m.facing > 0 ? 11 : -1, 2, 1, 1);
      ctx.fillStyle = '#1b1b24'; ctx.fillRect(hx + (m.facing > 0 ? 2 : 1), 1, 1, 1);
      ctx.fillStyle = '#f0b03a';
      ctx.fillRect(3, 9 + wob * 0.4, 1, 2); ctx.fillRect(7, 9 - wob * 0.4, 1, 2);
      break;
    }
  }
  ctx.restore();

  if (m.frozen > 0) {
    ctx.fillStyle = 'rgba(150,220,250,.5)';
    ctx.fillRect(sx - 2, sy - 3, m.w + 4, m.h + 4);
    ctx.strokeStyle = 'rgba(230,250,255,.9)'; ctx.lineWidth = 1;
    ctx.strokeRect(sx - 1.5, sy - 2.5, m.w + 3, m.h + 3);
  }
  if (m.burn > 0) {
    ctx.fillStyle = 'rgba(255,140,50,' + (0.25 + Math.sin(G.time * 22) * 0.12) + ')';
    ctx.fillRect(sx - 1, sy - 2, m.w + 2, m.h + 2);
  }
  if (m.tamed) {
    ctx.fillStyle = '#7dffb0';
    ctx.fillRect(sx + m.w / 2 - 1, sy - 5, 3, 1); ctx.fillRect(sx + m.w / 2, sy - 6, 1, 3);
  }
}

/* --------------------------- pickups & fx -------------------------------- */
function drawGem(gem, camX, camY) {
  const sx = Math.round(gem.x - camX), sy = Math.round(gem.y - camY + Math.sin(gem.t * 3) * 1.5);
  const wobble = Math.abs(Math.cos(gem.t * 2.4));
  const w = 2 + wobble * 6;
  ctx.fillStyle = '#1f8f5a';
  ctx.fillRect(sx + 4 - w / 2, sy, w, 9);
  ctx.fillStyle = '#3fe08a';
  ctx.fillRect(sx + 4 - w / 2 + 1, sy + 1, Math.max(1, w - 2), 7);
  ctx.fillStyle = '#bdffdc';
  ctx.fillRect(sx + 4 - w / 2 + 1, sy + 2, Math.max(1, w / 3), 2);
}

function drawRune(r, camX, camY) {
  const sx = Math.round(r.x - camX), sy = Math.round(r.y - camY + Math.sin(r.t * 2.2) * 2);
  const glow = 0.5 + Math.sin(r.t * 4) * 0.25;
  ctx.fillStyle = 'rgba(170,130,255,' + glow * 0.4 + ')';
  ctx.fillRect(sx - 4, sy - 4, 21, 21);
  ctx.fillStyle = '#2b2247'; ctx.fillRect(sx, sy, 13, 13);
  ctx.fillStyle = '#6a4fb0'; ctx.fillRect(sx + 1, sy + 1, 11, 11);
  ctx.fillStyle = '#e8dcff';
  ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center';
  ctx.fillText(r.kind === 'oneup' ? '1' : r.kind === 'ability' ? '√' : '?', sx + 6.5, sy + 10);
  ctx.textAlign = 'left';
}

function drawShot(s, camX, camY) {
  const sx = Math.round(s.cx - camX), sy = Math.round(s.cy - camY);
  switch (s.kind) {
    case 'wind': {
      ctx.strokeStyle = 'rgba(226,244,255,.85)'; ctx.lineWidth = 1.5;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        const yy = sy - 5 + i * 5;
        ctx.moveTo(sx - 10, yy + Math.sin(s.t * 30 + i) * 2);
        ctx.lineTo(sx + 10, yy + Math.sin(s.t * 30 + i + 1) * 2);
        ctx.stroke();
      }
      break;
    }
    case 'windorb': {
      ctx.fillStyle = 'rgba(210,235,255,.9)';
      ctx.beginPath(); ctx.arc(sx, sy, 5, 0, 7); ctx.fill();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(sx, sy, 5 + Math.sin(s.t * 18) * 1.4, 0, 7); ctx.stroke();
      break;
    }
    case 'magma': case 'eruption': {
      const r = s.kind === 'eruption' ? 6 : 4;
      ctx.fillStyle = '#ffd88a';
      ctx.beginPath(); ctx.arc(sx, sy, r, 0, 7); ctx.fill();
      ctx.fillStyle = s.kind === 'eruption' ? '#ff5a1a' : '#ff8a3a';
      ctx.beginPath(); ctx.arc(sx, sy, r - 1.4, 0, 7); ctx.fill();
      break;
    }
    case 'water': {
      ctx.fillStyle = '#6fb2ff';
      ctx.beginPath(); ctx.arc(sx, sy, 3.4, 0, 7); ctx.fill();
      ctx.fillStyle = '#cfe8ff'; ctx.fillRect(sx - 1, sy - 2, 1, 2);
      break;
    }
    case 'ice': {
      ctx.fillStyle = '#cdf2ff';
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(s.t * 8);
      ctx.fillRect(-5, -1, 10, 2); ctx.fillRect(-1, -5, 2, 10);
      ctx.fillRect(-3.5, -3.5, 7, 7);
      ctx.restore();
      break;
    }
    case 'orb': {
      ctx.fillStyle = '#ffc27a';
      ctx.beginPath(); ctx.arc(sx, sy, 4, 0, 7); ctx.fill();
      ctx.fillStyle = '#ff8a4a';
      ctx.beginPath(); ctx.arc(sx, sy, 2, 0, 7); ctx.fill();
      break;
    }
  }
}

function drawHazard(h, camX, camY) {
  if (h instanceof EarthSpike) {
    const sx = Math.round(h.x - camX), sy = Math.round(h.y - camY);
    const w = h.big ? 9 : 5;
    ctx.fillStyle = '#7a5a38';
    ctx.beginPath();
    ctx.moveTo(sx - w, sy); ctx.lineTo(sx, sy - h.h); ctx.lineTo(sx + w, sy);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#a9d86a';
    ctx.beginPath();
    ctx.moveTo(sx - w * 0.5, sy); ctx.lineTo(sx, sy - h.h * 0.85); ctx.lineTo(sx + w * 0.2, sy);
    ctx.closePath(); ctx.fill();
  } else if (h instanceof LavaPool) {
    const sx = Math.round(h.x - camX), sy = Math.round(h.y - camY);
    ctx.fillStyle = 'rgba(255,110,40,.85)';
    ctx.fillRect(sx, sy + Math.sin(G.time * 6) * 0.6, h.w, h.h);
    ctx.fillStyle = 'rgba(255,205,110,.9)';
    ctx.fillRect(sx, sy, h.w, 2);
  } else if (h instanceof Ray) {
    const sx = Math.round(h.x - camX), sy = Math.round(h.y - camY);
    const seg = 9, len = h.len;
    ctx.strokeStyle = '#fffbd0'; ctx.lineWidth = h.doubled ? 3 : 2;
    ctx.beginPath(); ctx.moveTo(sx, sy);
    for (let i = 1; i <= seg; i++)
      ctx.lineTo(sx + h.dir * (len / seg) * i, sy + (Math.random() - 0.5) * 9);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,230,120,.45)'; ctx.lineWidth = h.doubled ? 7 : 5;
    ctx.stroke();
  }
}

function drawItem(it, camX, camY) {
  const sx = Math.round(it.x - camX), sy = Math.round(it.y - camY + Math.sin(it.t * 2.5) * 2);
  const d = POWERS[it.kind];
  ctx.fillStyle = 'rgba(255,255,255,.10)';
  ctx.beginPath(); ctx.arc(sx + 6, sy + 6, 11 + Math.sin(it.t * 3) * 1.5, 0, 7); ctx.fill();
  ctx.fillStyle = d.color; ctx.globalAlpha = 0.25;
  ctx.beginPath(); ctx.arc(sx + 6, sy + 6, 8, 0, 7); ctx.fill();
  ctx.globalAlpha = 1;
  drawPowerIcon(ctx, it.kind, sx, sy, 1.1, it.t);
}

/* World-anchored hint signs. These live on the HUD canvas, not the game canvas:
   the game canvas is upscaled with nearest-neighbour for the chunky block look,
   which turns small text into unreadable mush. */
function drawHintsHud(W, camX, camY) {
  const size = 9.5;
  const font = 'bold ' + size + 'px ' + SERIF_FONT;
  for (const h of W.hints) {
    const sx = Math.round(h.x - camX);
    // keep signs clear of the HUD chrome top and bottom, whatever the camera does
    const sy = clamp(h.y - camY, 52, VIEW_H - 50);
    if (sx < -180 || sx > VIEW_W + 180 || h.y - camY < -70 || h.y - camY > VIEW_H + 70) continue;
    const dx = Math.abs(sx - VIEW_W / 2);
    const a = dx <= 100 ? 1 : clamp(1 - (dx - 100) / 70, 0, 1);
    if (a <= 0.03) continue;

    // translated live, not baked in at level-build time, so L relabels signs too
    const text = TR(h.text);
    hud.font = font;
    const tw = hud.measureText(text).width;
    const bw = Math.round(tw + 16), bh = Math.round(size + 11);
    const bx = Math.round(sx - bw / 2), by = Math.round(sy - bh);

    hud.globalAlpha = a;
    hud.fillStyle = 'rgba(10,14,26,.50)';          // semi-transparent, world shows through
    hud.fillRect(bx, by, bw, bh);
    hud.strokeStyle = 'rgba(255,233,168,.55)'; hud.lineWidth = 1;
    hud.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);

    const base = inkBaseline(by + bh / 2, font, 'MHXWgy');
    hud.font = font; hud.textAlign = 'center';
    hud.fillStyle = 'rgba(0,0,0,.8)';              // shadow keeps it legible on bright sky
    hud.fillText(text, sx + 1, base + 1);
    hud.fillStyle = '#ffeec0';
    hud.fillText(text, sx, base);
    hud.globalAlpha = 1;
  }
}

/* Floating score / maths callouts — same canvas, same serif. */
function drawPopsHud(camX, camY) {
  const font = 'bold 10px ' + SERIF_FONT;
  for (const p of G.pops) {
    const px = Math.round(p.x - camX), py = Math.round(p.y - camY);
    hud.globalAlpha = clamp(p.t, 0, 1);
    hud.font = font; hud.textAlign = 'center';
    hud.fillStyle = 'rgba(0,0,0,.65)';
    hud.fillText(p.text, px + 1, py + 1);
    hud.fillStyle = p.color;
    hud.fillText(p.text, px, py);
    hud.globalAlpha = 1;
  }
}

/* Crack overlay on the block Jay is currently punching. */
function drawCracks(p, camX, camY) {
  if (!p || !p.mineTarget || p.mineProgress <= 0) return;
  const { x, y } = p.mineTarget;
  const sx = x * TILE - camX, sy = y * TILE - camY;
  const stage = Math.min(4, Math.floor(p.mineProgress * 5));
  ctx.strokeStyle = 'rgba(20,16,12,.75)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= stage; i++) {
    const h = hash2(x * 7 + i, y * 13 + i);
    ctx.beginPath();
    ctx.moveTo(sx + 8, sy + 8);
    ctx.lineTo(sx + 1 + h * 14, sy + 1 + hash2(i, x + y) * 14);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255,255,255,.10)';
  ctx.fillRect(sx, sy, TILE, TILE);
}

/* ------------------------------ lighting --------------------------------- */
function drawLighting(W, camX, camY) {
  const amb = W.cfg.ambient;
  if (amb >= 1) return;
  darkCtx.globalCompositeOperation = 'source-over';
  darkCtx.clearRect(0, 0, VIEW_W, VIEW_H);      // without this the dark layer stacks to solid black
  darkCtx.fillStyle = 'rgba(6,9,20,' + (1 - amb) + ')';
  darkCtx.fillRect(0, 0, VIEW_W, VIEW_H);
  darkCtx.globalCompositeOperation = 'destination-out';

  const light = (x, y, r, strength) => {
    const g = darkCtx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(0,0,0,' + strength + ')');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    darkCtx.fillStyle = g;
    darkCtx.beginPath(); darkCtx.arc(x, y, r, 0, 7); darkCtx.fill();
  };

  const x0 = Math.max(0, Math.floor(camX / TILE)), x1 = Math.min(W.w - 1, Math.ceil((camX + VIEW_W) / TILE));
  const y0 = Math.max(0, Math.floor(camY / TILE)), y1 = Math.min(W.h - 1, Math.ceil((camY + VIEW_H) / TILE));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = TILEDEF[W.tiles[y * W.w + x]];
      if (!d || !d.light) continue;
      light(x * TILE + 8 - camX, y * TILE + 8 - camY, 46 * d.light, 0.95);
    }
  }
  if (G.player) light(G.player.cx - camX, G.player.cy - camY, 108, 0.92);
  for (const s of G.shots) if (s.kind === 'magma' || s.kind === 'eruption') light(s.cx - camX, s.cy - camY, 40, 0.85);
  darkCtx.globalCompositeOperation = 'source-over';
  ctx.drawImage(darkCanvas, 0, 0);
}

/* -------------------------------- HUD ------------------------------------ */
const UI_FONT = '"Trebuchet MS", system-ui, sans-serif';
/* Courier New is a light typewriter face — at 7px its Q loses its tail and the
   whole column goes mushy. These are the sturdiest monos actually installed on
   each platform, ordered by how well they hold up small. */
const MONO_FONT = '"DejaVu Sans Mono", "Liberation Mono", Consolas, ' +
                  '"SF Mono", Menlo, "Roboto Mono", "Ubuntu Mono", monospace';
/* In-world signs use a slab-ish serif — it reads as carved/printed rather than
   as chrome, and at the HUD's 3× it renders cleanly. */
const SERIF_FONT = '"Rockwell", "Bookman Old Style", Georgia, ' +
                   '"DejaVu Serif", "Liberation Serif", "Times New Roman", serif';

function hudText(t, x, y, size, color, align = 'left', weight = 'bold') {
  hud.font = weight + ' ' + size + 'px ' + UI_FONT;
  hud.textAlign = align;
  hud.fillStyle = color;
  hud.fillText(t, x, y);
}
function hudMono(t, x, y, size, color, align = 'left') {
  hud.font = 'bold ' + size + 'px ' + MONO_FONT;
  hud.textAlign = align;
  hud.fillStyle = color;
  hud.fillText(t, x, y);
}

/* Canvas text is positioned by baseline, which sits at different places inside a
   glyph depending on whether it has ascenders, descenders or is an arrow. To get
   things truly centred in a row we measure the actual ink and centre that. */
function inkBaseline(cy, font, sample) {
  hud.font = font;
  const m = hud.measureText(sample);
  const a = m.actualBoundingBoxAscent, d = m.actualBoundingBoxDescent;
  if (!isFinite(a) || !isFinite(d)) return cy + 3;      // very old engines
  return cy + (a - d) / 2;
}

/* Keys drawn as keycaps. Every cap in a column is the same height (measured from
   a reference string) while each glyph is optically centred inside its own cap,
   so an arrow and the word SPACE sit at the same height. Square corners. */
const GLUE = new Set(['+', '–', '-', '/', 'or', 'then']);
function drawKeyCaps(spec, x, cy, size = 7.5) {
  const tokens = String(spec).split(' ').filter(Boolean);
  const font = 'bold ' + size + 'px ' + UI_FONT;
  hud.font = font;
  const ref = hud.measureText('MHXW');
  const refAsc = isFinite(ref.actualBoundingBoxAscent) ? ref.actualBoundingBoxAscent : size * 0.72;
  const padY = 3.2, capH = Math.round(refAsc + padY * 2);
  const top = Math.round(cy - capH / 2);

  let cx = x;
  for (const tk of tokens) {
    if (GLUE.has(tk)) {
      const gf = 'normal ' + (size - 0.5) + 'px ' + UI_FONT;
      const gb = inkBaseline(cy, gf, tk);
      hud.font = gf; hud.textAlign = 'left';
      hud.fillStyle = 'rgba(200,215,255,.55)';
      hud.fillText(tk, cx, gb);
      cx += hud.measureText(tk).width + 3;
      continue;
    }
    hud.font = font;
    const tw = hud.measureText(tk).width;
    const padX = 3.5, capW = Math.round(tw + padX * 2);
    hud.fillStyle = 'rgba(255,233,168,.13)';
    hud.fillRect(cx, top, capW, capH);
    hud.strokeStyle = 'rgba(255,233,168,.48)'; hud.lineWidth = 1;
    hud.strokeRect(cx + 0.5, top + 0.5, capW - 1, capH - 1);
    const gb = inkBaseline(top + capH / 2, font, tk);
    hud.font = font; hud.textAlign = 'left';
    hud.fillStyle = '#ffeec0';
    hud.fillText(tk, cx + padX, gb);
    cx += capW + 3;
  }
  return { width: cx - x, top, height: capH, centre: top + capH / 2 };
}
function panel(x, y, w, h, fill = 'rgba(10,14,26,.72)', stroke = 'rgba(150,180,255,.30)') {
  hud.fillStyle = fill;
  hud.fillRect(x, y, w, h);
  hud.strokeStyle = stroke; hud.lineWidth = 1;
  hud.strokeRect(x + .5, y + .5, w - 1, h - 1);
}

function drawHUD() {
  hud.setTransform(1, 0, 0, 1, 0, 0);
  hud.clearRect(0, 0, hudCanvas.width, hudCanvas.height);
  hud.setTransform(HS, 0, 0, HS, 0, 0);
  hud.textBaseline = 'alphabetic';

  if (G.state === 'help') { drawHelp(); return; }
  if (G.state === 'title') { drawTitle(); return; }

  const p = G.player;
  if (!p) return;

  /* scrims — keep the HUD legible over bright biomes */
  let sc = hud.createLinearGradient(0, 0, 0, 44);
  sc.addColorStop(0, 'rgba(6,9,18,.55)'); sc.addColorStop(1, 'rgba(6,9,18,0)');
  hud.fillStyle = sc; hud.fillRect(0, 0, VIEW_W, 44);
  sc = hud.createLinearGradient(0, VIEW_H - 44, 0, VIEW_H);
  sc.addColorStop(0, 'rgba(6,9,18,0)'); sc.addColorStop(1, 'rgba(6,9,18,.62)');
  hud.fillStyle = sc; hud.fillRect(0, VIEW_H - 44, VIEW_W, 44);

  /* world text sits above the scrims but under the HUD chrome */
  if (G.camDraw) {
    drawHintsHud(G.world, G.camDraw.x, G.camDraw.y);
    drawPopsHud(G.camDraw.x, G.camDraw.y);
  }

  /* hearts */
  for (let i = 0; i < p.maxHp; i++) {
    const x = 8 + i * 11, y = 8;
    const full = i < p.hp;
    hud.fillStyle = full ? '#ff5a6e' : 'rgba(255,90,110,.22)';
    hud.fillRect(x + 1, y + 1, 3, 3); hud.fillRect(x + 5, y + 1, 3, 3);
    hud.fillRect(x, y + 3, 9, 3); hud.fillRect(x + 1, y + 6, 7, 2); hud.fillRect(x + 3, y + 8, 3, 2);
    if (full) { hud.fillStyle = 'rgba(255,255,255,.55)'; hud.fillRect(x + 1, y + 2, 2, 1); }
  }
  /* lives + gems + score */
  if (G.immortal) hudText('∞', 8 + p.maxHp * 11 + 4, 18, 13, '#9ff0c0');
  else hudText('×' + Math.max(0, G.lives), 8 + p.maxHp * 11 + 4, 17, 9, '#dfe8ff');
  hud.fillStyle = '#3fe08a';
  hud.fillRect(8, 22, 6, 8);
  hud.fillStyle = '#bdffdc'; hud.fillRect(9, 23, 2, 3);
  hudText(String(G.gems), 18, 30, 9, '#9ff0c0');
  const nextSq = (Math.floor(Math.sqrt(G.gems)) + 1) ** 2;
  hudText(TRF('nextSquareAt', nextSq), 40, 30, 7.5, 'rgba(159,240,192,.6)');
  hudText(String(G.score).padStart(6, '0'), VIEW_W - 8, 17, 10, '#ffe9a8', 'right');
  hudText(TRF('levelLabel', G.level + 1, G.world.name.toUpperCase()), VIEW_W - 8, 29, 7.5, 'rgba(223,232,255,.55)', 'right');

  /* inventory — slot 0 is Jay's own hands, then the five carry slots */
  const slotW = 22, gap = 3, fistGap = 9;
  const totalW = slotW * 6 + gap * 4 + fistGap;
  const fx = (VIEW_W - totalW) / 2;
  const ix = fx + slotW + fistGap, iy = VIEW_H - 34;

  // exactly one of these is ever true: fists, or one slot holding a plant
  const fistSel = p.sel < 0 || !p.inv[p.sel];
  panel(fx, iy, slotW, slotW,
    fistSel ? 'rgba(30,44,80,.9)' : 'rgba(10,14,26,.66)',
    fistSel ? '#ffe9a8' : 'rgba(150,180,255,.25)');
  hud.save();
  hud.translate(fx + 4, iy + 4);
  drawPowerIcon(hud, 'fist', 0, 0, 1.25, G.time);
  hud.restore();
  hudMono('0', fx + 2, iy + slotW - 2, 7, fistSel ? '#ffe9a8' : 'rgba(200,215,255,.45)');

  for (let i = 0; i < 5; i++) {
    const x = ix + i * (slotW + gap);
    const sel = !fistSel && i === p.sel;
    panel(x, iy, slotW, slotW,
      sel ? 'rgba(30,44,80,.9)' : 'rgba(10,14,26,.66)',
      sel ? '#ffe9a8' : 'rgba(150,180,255,.25)');
    const kind = p.inv[i];
    if (kind) {
      hud.save();
      hud.translate(x + 4, iy + 3);
      drawPowerIcon(hud, kind, 0, 0, 1.25, G.time + i);
      hud.restore();
    }
    hudMono(String(i + 1), x + 2, iy + slotW - 2, 7, sel ? '#ffe9a8' : 'rgba(200,215,255,.45)');
  }

  /* cooldown bar */
  if (p.cooldown > 0 && p.inv[p.sel]) {
    const x = ix + p.sel * (slotW + gap);
    const def = POWERS[p.inv[p.sel]];
    hud.fillStyle = 'rgba(0,0,0,.55)';
    hud.fillRect(x, iy, slotW, slotW * (p.cooldown / def.cd));
  }

  /* control legend */
  const legend = IN.doubler() ? TR('TAB + Q  =  DOUBLE POWER')
    : TR(fistSel ? 'Q punch blocks    E uppercut    SHIFT / 1-5 to hold a plant'
               : 'Q power    E alt    TAB+Q ²    SHIFT cycles    0 fists');
  hudText(legend, VIEW_W / 2, VIEW_H - 4, 7,
    IN.doubler() ? '#ffe98f' : 'rgba(200,215,255,.45)', 'center');

  /* abilities */
  let ax = 8, ay = VIEW_H - 40;
  for (const a of G.abilities) {
    hudText('✦ ' + ABILITIES[a].name, ax, ay, 7, 'rgba(199,168,255,.8)');
    ay -= 9;
  }

  if (G.state === 'rune') drawRuneModal();
  if (G.state === 'glitch') drawGlitchScreen();
  if (G.state === 'dead') {
    hud.fillStyle = 'rgba(6,8,16,.55)'; hud.fillRect(0, 0, VIEW_W, VIEW_H);
    hudText(TR('OOF'), VIEW_W / 2, VIEW_H / 2 - 4, 22, '#ff8a9a', 'center');
    hudText(TRF('livesLeft', G.lives), VIEW_W / 2, VIEW_H / 2 + 10, 9, '#dfe8ff', 'center');
  }
  if (G.state === 'levelclear') {
    hud.fillStyle = 'rgba(6,8,16,.5)'; hud.fillRect(0, 0, VIEW_W, VIEW_H);
    hudText(TR('LEVEL CLEAR'), VIEW_W / 2, VIEW_H / 2 - 6, 20, '#ffe9a8', 'center');
    hudText(G.world.name + '   ·   ' + TRF('gemsCount', G.gems), VIEW_W / 2, VIEW_H / 2 + 10, 9, '#dfe8ff', 'center');
  }
  if (G.state === 'gameover') drawGameOver();
  if (G.state === 'win') drawWin();

  /* persistent top-right language badge — earned the first time L is pressed
     in-game (or restored from a previous session), stays up from then on */
  if (G.langShown) hudMono(LANG_CODE[G.lang], VIEW_W - 8, 8, 6.5, 'rgba(200,215,255,.5)', 'right');

  /* banner — drawn dead last so it always reads on top of the rune box,
     the glitch screen, or any other overlay live at the moment. */
  if (G.banner) {
    const b = G.banner;
    const COLLAPSE = 0.7;             // seconds spent shrinking into its HUD home
    const collapsing = b.to && b.t <= COLLAPSE;
    const fadeIn = clamp((b.max - b.t) / 0.25, 0, 1);
    const w = 200, h = b.sub ? 30 : 20;
    const cx0 = VIEW_W / 2, cy0 = 44 + h / 2;
    let cx = cx0, cy = cy0, scale = 1, alpha = fadeIn;

    if (collapsing) {
      // smoothstep: holds its size for a beat, travels, then settles gently
      const u = clamp(1 - b.t / COLLAPSE, 0, 1);
      const k = u * u * (3 - 2 * u);
      cx = lerp(cx0, b.to.x, k);
      cy = lerp(cy0, b.to.y, k);
      scale = lerp(1, 0.08, k);
      alpha = fadeIn * clamp(1 - (k - 0.72) / 0.28, 0, 1);  // only fades once it is tiny and home
    } else {
      alpha *= clamp(b.t / 0.6, 0, 1);
    }

    hud.globalAlpha = alpha;
    hud.save();
    hud.translate(cx, cy);
    hud.scale(scale, scale);
    panel(-w / 2, -h / 2, w, h, 'rgba(8,12,22,.8)', 'rgba(255,233,168,.35)');
    hudText(b.text, 0, -h / 2 + 13, 10.5, b.color, 'center');
    if (b.sub) hudText(b.sub, 0, -h / 2 + 24, 7.5, 'rgba(223,232,255,.7)', 'center');
    hud.restore();
    hud.globalAlpha = 1;
  }
}

/* The HUD spots a reward banner can collapse into. Kept next to the code that
   draws each one, so the two cannot drift apart. */
const HUD_HOME = {
  // the "×N" life count, just right of the hearts
  lives: () => ({ x: 8 + G.player.maxHp * 11 + 10, y: 14 }),
  // the row of hearts themselves
  hearts: () => ({ x: 8 + (G.player.maxHp * 11) / 2, y: 13 }),
  // the purple ability list, bottom left — newest entry sits `row` up from the base
  ability: (row) => ({ x: 32, y: VIEW_H - 42 - 9 * row }),
  // the persistent 2-letter language code, top right
  lang: () => ({ x: VIEW_W - 12, y: 8 }),
};

function drawRuneModal() {
  const R = G.rune;
  hud.fillStyle = 'rgba(6,8,18,.72)'; hud.fillRect(0, 0, VIEW_W, VIEW_H);
  const w = 210, h = 96, x = (VIEW_W - w) / 2, y = (VIEW_H - h) / 2;
  panel(x, y, w, h, 'rgba(22,16,44,.96)', '#a98cff');
  hudText(TR('MATH RUNE'), VIEW_W / 2, y + 16, 9, '#c7a8ff', 'center');
  hudText(R.q + ' =', VIEW_W / 2, y + 44, 22, '#ffffff', 'center');

  /* Answer field. The caret is drawn as its own bar to the right of the digits —
     never concatenated into the string, or every blink would shove the centred
     number sideways. */
  const bw = 74, bx = (VIEW_W - bw) / 2, by = y + 52;
  panel(bx, by, bw, 20, 'rgba(10,8,22,.9)', R.done ? (R.msgKind === 'correct' ? '#7dffb0' : '#ff8a9a') : '#c7a8ff');

  const digits = R.input;
  hud.font = 'bold 14px "Trebuchet MS", system-ui, sans-serif';
  const tw = digits ? hud.measureText(digits).width : 0;
  hudText(digits, VIEW_W / 2, by + 15, 14, '#ffe9a8', 'center');

  if (!R.done) {
    // soft pulse rather than a hard on/off, so nothing flickers
    const pulse = 0.30 + 0.70 * (0.5 + 0.5 * Math.sin(R.t * 7));
    hud.globalAlpha = pulse;
    hud.fillStyle = '#ffe9a8';
    hud.fillRect(VIEW_W / 2 + tw / 2 + (digits ? 2.5 : 0), by + 4.5, 1.5, 11);
    hud.globalAlpha = 1;
  }
  // no underline here — the field already has its own outline

  if (R.done) {
    const msg = R.msgKind === 'correct' ? TR('CORRECT') : TRF('notQuite', R.ans);
    hudText(msg, VIEW_W / 2, y + h - 8, 8.5, R.msgKind === 'correct' ? '#7dffb0' : '#ff8a9a', 'center');
  }
  else hudText(TR('type the number · ENTER to answer · ESC to walk away'), VIEW_W / 2, y + h - 8, 7, 'rgba(223,232,255,.55)', 'center');
}

function drawGlitchScreen() {
  const gl = G.glitch;
  const t = gl.t;
  hud.fillStyle = 'rgba(2,6,4,.93)'; hud.fillRect(0, 0, VIEW_W, VIEW_H);

  // corruption bars
  for (let i = 0; i < 26; i++) {
    const y = (i * 37 + Math.floor(t * 140)) % VIEW_H;
    hud.fillStyle = 'rgba(90,255,160,' + (0.02 + (i % 5) * 0.012) + ')';
    hud.fillRect(0, y, VIEW_W, 2 + (i % 3));
  }
  if (Math.random() < 0.25) {
    hud.fillStyle = 'rgba(255,90,140,.10)';
    hud.fillRect(0, Math.random() * VIEW_H, VIEW_W, 2 + Math.random() * 8);
  }

  if (gl.boot > 0) {
    hudMono(TR('SEGMENTATION FAULT AT 0x5Q4RE'), VIEW_W / 2, VIEW_H / 2 - 8, 11, '#7dffb0', 'center');
    const via = (POWERS[gl.via] ? POWERS[gl.via].short : 'MAGMA').toLowerCase();
    hudMono(via + ' ' + TR('vector escaped world bounds'), VIEW_W / 2, VIEW_H / 2 + 6, 8, 'rgba(125,255,176,.6)', 'center');
    return;
  }

  hudMono(TR('J².SYS  //  DEVELOPER SHELL'), 14, 22, 10, '#7dffb0');
  hudMono(TR('you were not supposed to find this'), 14, 32, 7.5, 'rgba(125,255,176,.45)');
  hud.strokeStyle = 'rgba(125,255,176,.35)';
  hud.beginPath(); hud.moveTo(14, 38); hud.lineTo(VIEW_W - 14, 38); hud.stroke();

  const items = glitchItems();
  const crumb = [TR('ROOT')].concat(G.glitch.path.map((i, n) => {
    let list = GLITCH_ROOT;
    for (let k = 0; k < n; k++) list = list[G.glitch.path[k]].sub;
    return TR(list[i].label);
  })).join(' / ');
  hudMono(crumb, 14, 48, 7.5, 'rgba(125,255,176,.55)');

  items.forEach((it, i) => {
    const y = 64 + i * 13;
    const sel = i === gl.sel;
    if (sel) {
      hud.fillStyle = 'rgba(125,255,176,.16)';
      hud.fillRect(12, y - 9, VIEW_W - 24, 12);
    }
    hudMono((sel ? '> ' : '  ') + TR(it.label) + (it.sub ? '  ▸' : ''), 18, y, 9.5,
      sel ? '#c9ffe2' : 'rgba(125,255,176,.72)');
  });

  gl.log.forEach((line, i) => {
    hudMono(line, 14, VIEW_H - 30 + i * 9 - gl.log.length * 9 + 30, 7.5, 'rgba(125,255,176,.5)');
  });
  hudMono(TR('↑↓ select   ENTER apply   ESC back / resume'), VIEW_W / 2, VIEW_H - 8, 7.5, 'rgba(125,255,176,.55)', 'center');
}

/* ------------------------------- help ------------------------------------ */
/* Two left-aligned key/description columns so the whole control scheme can be
   scanned at a glance. {h} = section heading, {} = spacer, {d} alone = a
   continuation line under the row above. */
const HELP_COLUMNS = [
  [
    { h: 'MOVING' },
    { k: '← →', d: 'walk  (A and D work too)' },
    { k: '↑', d: 'jump · climb a ladder, vine or trunk' },
    { k: '↓', d: 'crouch · climb down' },
    { k: 'SPACE', d: 'jump — press again in mid-air to' },
    { d: 'go higher, up to five times' },
    { k: '↓ + SPACE', d: 'drop through wooden planks' },
    {},
    { h: 'POWERS' },
    { k: 'Q', d: 'use power · hold it to punch' },
    { d: 'blocks apart with bare hands' },
    { k: 'E', d: 'second power · uppercut' },
    { k: 'TAB + Q', d: 'squared — the Q power, twice' },
  ],
  [
    { h: 'WHAT YOU CARRY' },
    { k: '0', d: 'bare hands' },
    { k: '1 – 5', d: 'choose a slot (number pad too)' },
    { k: 'SHIFT', d: 'cycle through what you hold' },
    {},
    { h: 'THE GAME' },
    { k: 'P', d: 'pause  (ESC also works)' },
    { k: 'F', d: 'fullscreen  (ESC also exits)' },
    { k: '?', d: 'this page, any time' },
    {},
    { h: "JAY'S MATHEMATICS" },
    { m: '√', d: 'gem totals that land on a perfect' },
    { d: 'square — 4, 9, 16, 25 — pay out' },
    { m: '?', d: 'purple runes set a sum. Answer it' },
    { d: 'for 1-UPs and new abilities' },
  ],
];

function drawHelp() {
  hud.fillStyle = 'rgba(5,7,16,.90)';
  hud.fillRect(0, 0, VIEW_W, VIEW_H);

  const x = 14, y = 10, w = VIEW_W - 28, h = VIEW_H - 20;
  panel(x, y, w, h, 'rgba(14,18,36,.96)', 'rgba(255,233,168,.45)');

  hudText(TR('HOW TO PLAY'), VIEW_W / 2, y + 16, 12, '#ffe9a8', 'center');
  hudText(TR('Jay Squared  ·  J²  ·  and some things are not on this list'),
    VIEW_W / 2, y + 26, 7.5, 'rgba(200,215,255,.55)', 'center', 'normal');
  hud.fillStyle = 'rgba(255,233,168,.22)';
  hud.fillRect(x + 18, y + 31, w - 36, 1);

  const colX = [x + 16, x + w / 2 + 6];
  const keyW = 64, rowH = 11, top = y + 43;

  /* ry tracks the vertical CENTRE of each row. Keycaps, markers and descriptions
     are all centred on it, so nothing sits high or low against its neighbours. */
  const descFont = 'normal 7.5px ' + UI_FONT;
  const headFont = 'bold 7.5px ' + UI_FONT;
  G.helpRows = [];        // layout probe, used by the alignment test
  colX.forEach((cx, ci) => {
    let ry = top;
    for (const row of HELP_COLUMNS[ci]) {
      if (row.h) {
        const hb = inkBaseline(ry, headFont, 'MHXW');
        hud.font = headFont; hud.textAlign = 'left'; hud.fillStyle = '#9ff0c0';
        hud.fillText(TR(row.h), cx, hb);
        hud.fillStyle = 'rgba(159,240,192,.25)';
        hud.fillRect(cx, Math.round(ry + 5), w / 2 - 40, 1);
        ry += rowH + 2;
        continue;
      }
      if (!row.d) { ry += rowH * 0.5; continue; }
      let capGeom = null;
      if (row.k) capGeom = drawKeyCaps(row.k, cx, ry, 7.5);
      else if (row.m) {
        const mf = 'bold 9.5px ' + UI_FONT;
        hud.font = mf; hud.textAlign = 'left'; hud.fillStyle = '#c7a8ff';
        hud.fillText(row.m, cx + 2, inkBaseline(ry, mf, row.m));
      }
      const db = inkBaseline(ry, descFont, 'MHXWgy');
      hud.font = descFont; hud.textAlign = 'left';
      hud.fillStyle = 'rgba(223,232,255,.88)';
      hud.fillText(TR(row.d), cx + keyW, db);
      G.helpRows.push({
        cx, cy: ry, keyX: cx, descX: cx + keyW, hasKey: !!row.k, text: row.d,
        capCentre: capGeom ? capGeom.centre : null,
        capTop: capGeom ? capGeom.top : null,
        capH: capGeom ? capGeom.height : null,
      });
      ry += rowH;
    }
  });

  /* the five plants, across the bottom — icon, name, then Q and E on own lines
     so nothing has to fit a long string into a narrow cell */
  const sy = y + h - 56;
  hud.fillStyle = 'rgba(255,233,168,.16)';
  hud.fillRect(x + 18, sy, w - 36, 1);
  hudText(TR('THE FIVE PLANTS  —  one hides in each biome'), x + 16, sy + 11, 7.5, '#9ff0c0', 'left');
  const cellW = (w - 26) / 5;
  POWER_ORDER.forEach((kind, i) => {
    const cx = x + 13 + i * cellW;
    const d = POWERS[kind];
    hud.save();
    hud.translate(cx, sy + 17);
    drawPowerIcon(hud, kind, 0, 0, 1.0, G.time + i);
    hud.restore();
    hudText(d.name.replace(' Plant', '').replace(' Mushroom', ''), cx + 15, sy + 25, 7.5, d.color, 'left');
    hudText('Q ' + d.qd + '  ·  E ' + d.ed, cx, sy + 36, 6.5, 'rgba(223,232,255,.66)', 'left', 'normal');
  });

  hudText(TR(G.helpFrom === 'title' ? '? or ESC to go back   ·   SPACE to play'
                                : '? or ESC to get back to the game'),
    VIEW_W / 2, y + h - 6, 7.5, 'rgba(255,233,168,.75)', 'center');
}

function drawTitle() {
  hud.fillStyle = 'rgba(4,7,16,.55)'; hud.fillRect(0, 0, VIEW_W, VIEW_H);

  const t = G.time;
  const bob = Math.sin(t * 1.6) * 2;
  hud.save();
  hud.translate(VIEW_W / 2, 78 + bob);

  /* blocky "J" logo mark, matching the favicon design */
  const logoParts = [
    [0, -50, 15, 45, '#7ee787'],    // stem
    [-25, -50, 40, 10, '#7ee787'],  // top bar
    [-30, -20, 10, 20, '#7ee787'],  // hook curl
    [-20, -10, 35, 10, '#7ee787'],  // hook foot
    // pixel "2" superscript, in place of the favicon's plain accent block
    [18, -55, 9, 3, '#ffd166'],
    [15, -52, 3, 3, '#ffd166'],
    [27, -52, 3, 3, '#ffd166'],
    [27, -49, 3, 3, '#ffd166'],
    [24, -46, 3, 3, '#ffd166'],
    [21, -43, 3, 3, '#ffd166'],
    [18, -40, 3, 3, '#ffd166'],
    [15, -37, 15, 3, '#ffd166'],
  ];
  hud.save();
  hud.translate(1.6, 2.2);
  hud.fillStyle = '#0b1020';
  for (const [x, y, w, h] of logoParts) hud.fillRect(x, y, w, h);
  hud.restore();
  for (const [x, y, w, h, fill] of logoParts) {
    hud.fillStyle = fill;
    hud.fillRect(x, y, w, h);
  }
  hud.restore();

  hudText(TR('JAY  SQUARED'), VIEW_W / 2, 112, 15, '#dfe8ff', 'center');
  hudText(TR('a blocky adventure in five biomes'), VIEW_W / 2, 126, 8.5, 'rgba(200,215,255,.6)', 'center');

  const pulse = 0.55 + Math.sin(t * 4) * 0.35;
  hud.globalAlpha = pulse;
  hudText(TR('PRESS SPACE TO PLAY'), VIEW_W / 2, 162, 12, '#ffe9a8', 'center');
  hud.globalAlpha = 1;
  hudText(TR('PRESS  ?  FOR HELP'), VIEW_W / 2, 184, 10, 'rgba(159,240,192,.85)', 'center');
  hudText(TR('the controls live in there, and you can open it mid-game'),
    VIEW_W / 2, 198, 7.5, 'rgba(200,215,255,.5)', 'center', 'normal');

  /* auto-cycling language hint; a fresh L press interrupts it for a beat to
     confirm the choice, in the language just picked, before resuming */
  const langLine = G.langPickT > 0
    ? LANG_SELECTED[G.lang](LANG_NAME[G.lang])
    : LANG_HINT[LANGS[Math.floor(G.time / 2) % LANGS.length]];
  hudText(langLine, VIEW_W / 2, 210, 7, 'rgba(200,215,255,.5)', 'center', 'normal');

  if (G.immortal)
    hudText(TR('∞   EXPLORER MODE IS ON   ∞'), VIEW_W / 2, 226, 9, '#9ff0c0', 'center');

  hudText(TR('Jay is almost 8. He is very good at maths. That turns out to matter.'),
    VIEW_W / 2, VIEW_H - 14, 8, 'rgba(159,240,192,.75)', 'center', 'normal');
}

function drawGameOver() {
  hud.fillStyle = 'rgba(6,8,16,.8)'; hud.fillRect(0, 0, VIEW_W, VIEW_H);
  hudText(TR('GAME OVER'), VIEW_W / 2, VIEW_H / 2 - 14, 26, '#ff8a9a', 'center');
  hudText(TRF('gameOverStats', G.gems, G.score), VIEW_W / 2, VIEW_H / 2 + 6, 10, '#dfe8ff', 'center');
  const r = Math.floor(Math.sqrt(G.gems));
  hudText(TRF('leftOver', r, G.gems - r * r), VIEW_W / 2, VIEW_H / 2 + 20, 8.5, 'rgba(159,240,192,.8)', 'center');
  hudText(TR('press SPACE to try again'), VIEW_W / 2, VIEW_H / 2 + 42, 9, 'rgba(223,232,255,.7)', 'center');
}

function drawWin() {
  hud.fillStyle = 'rgba(6,10,26,.82)'; hud.fillRect(0, 0, VIEW_W, VIEW_H);
  hudText(TR('THE CASTLE IS YOURS'), VIEW_W / 2, 76, 20, '#ffe9a8', 'center');
  hudText(TRF('winStats', G.gems, G.score), VIEW_W / 2, 100, 10, '#dfe8ff', 'center');
  const r = Math.floor(Math.sqrt(G.gems));
  hudText(TRF('winAbilities', G.gems, r, G.abilities.size),
    VIEW_W / 2, 116, 9, 'rgba(159,240,192,.85)', 'center');
  hudText(TR('press SPACE to play again'), VIEW_W / 2, 156, 9.5, 'rgba(223,232,255,.7)', 'center');
}
