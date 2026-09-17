/* ==========================================================================
   MAIN LOOP
   ========================================================================== */

function updatePlay(dt) {
  const P = G.player, W = G.world;
  G.levelTime += dt;

  P.update(dt);

  // feather fall ability
  if (G.abilities.has('feather') && P.vy > 0 && !P.onGround) P.vy *= 0.986;

  for (const m of G.mobs) if (!m.dead) m.update(dt);
  for (const it of G.items) if (!it.dead) it.update(dt);
  for (const r of G.runes) if (!r.dead) r.update(dt);
  for (const s of G.shots) if (!s.dead) s.update(dt);
  for (const h of G.hazards) if (!h.dead) h.update(dt);

  for (const g of G.gemEnts) {
    if (g.dead) continue;
    if (G.abilities.has('magnet')) {
      const dx = P.cx - g.cx, dy = P.cy - g.cy;
      const d2 = dx * dx + dy * dy;
      if (d2 < 72 * 72) {
        const d = Math.sqrt(d2) || 1;
        g.x += (dx / d) * 190 * dt;
        g.y += (dy / d) * 190 * dt;
      }
    }
    g.update(dt);
  }

  G.mobs = G.mobs.filter(m => !m.dead);
  G.items = G.items.filter(i => !i.dead);
  G.gemEnts = G.gemEnts.filter(g => !g.dead);
  G.runes = G.runes.filter(r => !r.dead);
  G.shots = G.shots.filter(s => !s.dead);
  G.hazards = G.hazards.filter(h => !h.dead);

  updateCamera(dt, P.cx + P.facing * 26, P.cy - 8);
}

function updateCamera(dt, tx, ty) {
  const W = G.world;
  const maxX = Math.max(0, W.w * TILE - VIEW_W);
  const maxY = Math.max(0, W.h * TILE - VIEW_H);
  const gx = clamp(tx - VIEW_W / 2, 0, maxX);
  const gy = clamp(ty - VIEW_H / 2, 0, maxY);
  const k = 1 - Math.pow(0.0016, dt);
  G.cam.x = lerp(G.cam.x, gx, k);
  G.cam.y = lerp(G.cam.y, gy, k);
  if (G.cam.shake > 0) G.cam.shake = Math.max(0, G.cam.shake - dt * 26);
}

function update(dt) {
  G.time += dt;
  if (G.flash > 0) G.flash -= dt;
  if (G.banner) { G.banner.t -= dt; if (G.banner.t <= 0) G.banner = null; }
  if (IN.lang()) cycleLang();
  if (IN.fullscreen()) toggleFullscreen();
  updateParticles(dt);

  switch (G.state) {
    case 'title':
      checkCheatCode();
      if (G.langPickT > 0) G.langPickT = Math.max(0, G.langPickT - dt);
      if (IN.help()) { openHelp(); break; }
      if (Keys.justPressed('Space', 'Enter')) { startRun(); }
      else {
        // slow drift across the plains behind the logo
        G.cam.x = clamp(G.cam.x + 22 * dt, 0, Math.max(0, G.world.w * TILE - VIEW_W));
        if (G.cam.x >= G.world.w * TILE - VIEW_W - 1) G.cam.x = 0;
        G.cam.y = lerp(G.cam.y, (G.world.surface[Math.floor(G.cam.x / TILE) + 15] - 12) * TILE, 0.03);
      }
      break;

    case 'play':
      if (IN.help()) { openHelp(); break; }
      if (Keys.justPressed('KeyP', 'Escape')) { G.state = 'paused'; break; }
      updatePlay(dt);
      break;

    case 'paused':
      checkCheatCode();
      if (IN.help()) { openHelp(); break; }
      if (Keys.justPressed('KeyP', 'Escape', 'Space')) G.state = 'play';
      break;

    case 'help':
      if (IN.help() || Keys.justPressed('Escape', 'Enter', 'KeyP')) { closeHelp(); break; }
      // SPACE starts the game if you opened help from the title screen
      if (Keys.justPressed('Space')) {
        if (G.helpFrom === 'title') startRun(); else closeHelp();
      }
      break;

    case 'rune':
      updateRune(dt);
      break;

    case 'glitch':
      updateGlitch(dt);
      break;

    case 'dead':
      G.deadT -= dt;
      updateCamera(dt, G.player.cx, G.player.cy);
      if (G.deadT <= 0) respawn();
      break;

    case 'levelclear':
      G.clearT -= dt;
      updateCamera(dt, G.player.cx, G.player.cy);
      if (G.clearT <= 0) {
        if (G.level + 1 >= LEVELS.length) { G.state = 'win'; SFX.oneUp(); }
        else { buildLevel(G.level + 1); G.state = 'play'; }
      }
      break;

    case 'gameover':
    case 'win':
      checkCheatCode();
      if (Keys.justPressed('Space', 'Enter')) { G.state = 'title'; buildLevel(0); }
      break;
  }
}

/* ------------------------------- render ---------------------------------- */

function render() {
  const W = G.world;
  if (!W) return;
  let camX = Math.round(G.cam.x), camY = Math.round(G.cam.y);
  if (G.cam.shake > 0) {
    camX += Math.round((Math.random() - 0.5) * G.cam.shake);
    camY += Math.round((Math.random() - 0.5) * G.cam.shake);
  }

  drawBackground(W, camX, camY);
  drawWorld(W, camX, camY);
  if (!atTitle()) drawCracks(G.player, camX, camY);

  for (const it of G.items) drawItem(it, camX, camY);
  for (const g of G.gemEnts) drawGem(g, camX, camY);
  for (const r of G.runes) drawRune(r, camX, camY);
  for (const h of G.hazards) drawHazard(h, camX, camY);
  for (const m of G.mobs) drawMob(m, camX, camY);
  for (const s of G.shots) drawShot(s, camX, camY);
  if (G.player && !atTitle()) drawJay(G.player, camX, camY);

  for (const p of G.parts) {
    ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
    ctx.fillStyle = p.color;
    ctx.fillRect(Math.round(p.x - camX), Math.round(p.y - camY), p.size, p.size);
  }
  ctx.globalAlpha = 1;

  drawLighting(W, camX, camY);
  // hint signs and score pops are drawn on the HUD canvas instead — see drawHUD
  G.camDraw = { x: camX, y: camY };

  // exit door marker
  const ex = W.exit.x - camX, ey = W.exit.y - camY;
  if (ex > -30 && ex < VIEW_W + 30) {
    ctx.fillStyle = 'rgba(255,215,120,' + (0.25 + Math.sin(G.time * 3) * 0.15) + ')';
    ctx.fillRect(ex - 4, ey - 10, 24, 34);
  }

  if (G.flash > 0) {
    ctx.fillStyle = 'rgba(255,255,255,' + clamp(G.flash * 1.6, 0, 0.65) + ')';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }

  drawHUD();

  if (G.state === 'paused') {
    hud.fillStyle = 'rgba(6,8,16,.72)';
    hud.fillRect(0, 0, VIEW_W, VIEW_H);
    hudText(TR('PAUSED'), VIEW_W / 2, VIEW_H / 2 - 10, 20, '#dfe8ff', 'center');
    hudText(TR('P or ESC to keep going'), VIEW_W / 2, VIEW_H / 2 + 8, 9, 'rgba(200,215,255,.65)', 'center');
    if (G.immortal)
      hudText(TR('\u221e  explorer mode is on'), VIEW_W / 2, VIEW_H / 2 + 26, 8.5, '#9ff0c0', 'center');
  }
}

/* -------------------------------- boot ----------------------------------- */
let lastT = 0, acc = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - lastT) / 1000 || 0);
  lastT = now;
  acc += dt;
  let guard = 0;
  while (acc >= STEP && guard++ < 6) {
    update(STEP);
    Keys.endFrame();
    acc -= STEP;
  }
  render();
  requestAnimationFrame(frame);
}

function boot() {
  initCanvases();
  bakeTextures();
  buildLevel(0);
  G.state = 'title';
  G.banner = null;
  const tap = document.getElementById('tapstart');
  tap.textContent = TR('Click to play');
  const kick = () => { Audio2.unlock(); tap.style.display = 'none'; };
  addEventListener('pointerdown', kick);
  addEventListener('keydown', kick, { once: true });
  requestAnimationFrame((t) => { lastT = t; requestAnimationFrame(frame); });
}

if (document.readyState === 'loading') addEventListener('DOMContentLoaded', boot);
else boot();

/* expose a little handle for tinkering in the console */
window.J2 = { G, PHYS, LEVELS, POWERS, GLITCH_ROOT, GLITCH_MENU_ROWS, buildLevel, startRun, openGlitchMenu, isSolidTile: isSolid, T, TILEDEF, SOFT, HELP_COLUMNS, POWER_ORDER, SFX, drawKeyCaps, usePower,
  makeMob: (x, y, type, friendly) => new Mob(x, y, type, friendly) };
