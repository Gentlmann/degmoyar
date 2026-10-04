(() => {
'use strict';
const W = 480, H = 720, RL = 70, RR = 410, LW = 85, NL = 4, PY = 545, PW = 44, PH = 80;
const CYC = 100;   // seconds for a full day/night cycle
const $ = id => document.getElementById(id);
const cv = $('game'), ctx = cv.getContext('2d'), wrap = $('wrap');
const lc = document.createElement('canvas'); lc.width = W; lc.height = H;
const lx = lc.getContext('2d');
const COLORS = ['#2ecc71','#f1c40f','#3498db','#9b59b6','#e67e22','#1abc9c','#ecf0f1','#ff9ff3'];
const rnd = (a, b) => a + Math.random() * (b - a);
const pad = n => String(Math.floor(n)).padStart(4, '0');
const laneX = l => RL + LW * (l + 0.5);
const laneOf = x => Math.max(0, Math.min(NL - 1, Math.floor((x - RL) / LW)));
const grp = l => (l < 2 ? 0 : 1);

let state = 'menu', t = 0, score = 0, best = 0, roadSpeed = 220, roadOff = 0, spawnT = 0, itemT = 0;
let shake = 0, crashT = 0, reason = '', overTimer = 0;
let nitro = 100, boosting = false, wasB = false, bm = 1, slip = 0, combo = 0, comboT = 0;
let fuel = 100, stalled = false, dist = 0, toys = 0, rain = 0, idleT = 0, wasK = false, lowT = 0, braking = false;
let isNight = false, nightNow = 0;
let player, enemies = [], parts = [], scenery = [], items = [], pops = [], skids = [], warns = [];
const keys = { l: false, r: false, b: false, k: false };
try { best = parseInt(localStorage.getItem('degmoyar_best')) || 0; } catch (e) {}

const baseSpd = () => 300 + Math.min(t * 5, 380);
const laneV = l => baseSpd() * [0.3, 0.2, 0.55, 0.35][l];   // lanes 0-1 oncoming, 2-3 same direction
const sunS = () => Math.sin(((t + 12) % CYC) / CYC * 6.2832);               // sun height: 1 noon, -1 midnight
const nightAmt = () => Math.max(0, Math.min(1, (0.15 - sunS()) / 0.5));     // 0 day ... 1 full night

/* ---------- responsive ---------- */
function resize() {
  const s = Math.min(innerWidth / W, innerHeight / H);
  wrap.style.width = W * s + 'px'; wrap.style.height = H * s + 'px'; wrap.style.fontSize = 16 * s + 'px';
}
addEventListener('resize', resize); addEventListener('orientationchange', resize); resize();

/* ---------- audio ---------- */
let ac = null, master = null, eng = null;
function initAudio() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
  try {
    const A = window.AudioContext || window.webkitAudioContext; if (!A) return;
    ac = new A(); master = ac.createGain(); master.gain.value = 0.5; master.connect(ac.destination);
  } catch (e) { ac = null; }
}
function tone(f1, f2, d, type, v, delay) {
  if (!ac) return;
  try {
    const s = ac.currentTime + (delay || 0), o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f1, s); o.frequency.exponentialRampToValueAtTime(Math.max(f2, 1), s + d);
    g.gain.setValueAtTime(v, s); g.gain.exponentialRampToValueAtTime(0.001, s + d);
    o.connect(g); g.connect(master); o.start(s); o.stop(s + d);
  } catch (e) {}
}
function noise(d, v) {
  if (!ac) return;
  try {
    const n = (ac.sampleRate * d) | 0, b = ac.createBuffer(1, n, ac.sampleRate), c = b.getChannelData(0);
    for (let i = 0; i < n; i++) c[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = ac.createBufferSource(), g = ac.createGain(), f = ac.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 1200; g.gain.value = v;
    s.buffer = b; s.connect(f); f.connect(g); g.connect(master); s.start();
  } catch (e) {}
}
function engineStart() {
  if (!ac || eng) return;
  try {
    const o = ac.createOscillator(), f = ac.createBiquadFilter(), g = ac.createGain();
    o.type = 'sawtooth'; o.frequency.value = 70; f.type = 'lowpass'; f.frequency.value = 500; g.gain.value = 0.07;
    o.connect(f); f.connect(g); g.connect(master); o.start(); eng = { o, g };
  } catch (e) { eng = null; }
}
function engineStop() {
  if (!eng) return;
  try { eng.g.gain.setTargetAtTime(0, ac.currentTime, 0.05); eng.o.stop(ac.currentTime + 0.3); } catch (e) {}
  eng = null;
}
function engineUpdate() {
  if (eng) try { eng.o.frequency.setTargetAtTime(stalled ? 30 : 55 + roadSpeed * 0.2, ac.currentTime, 0.1); } catch (e) {}
}
const clickSnd = () => tone(600, 950, 0.09, 'square', 0.12);

/* ---------- background music ---------- */
const TRACKS = ['song1.mp3', 'song2.mp3'];
let music = null, lastTrack = -1, muted = false;
function pickTrack() {
  let i; do { i = Math.floor(Math.random() * TRACKS.length); } while (TRACKS.length > 1 && i === lastTrack);
  lastTrack = i; return TRACKS[i];
}
function playMusic() {
  try {
    if (music) { music.onended = null; music.pause(); }
    music = new Audio(pickTrack()); music.volume = 0.5; music.muted = muted; music.onended = playMusic;
    const p = music.play(); if (p && p.catch) p.catch(() => {});
  } catch (e) {}
}

/* ---------- world ---------- */
function mkScenery(y) {
  const side = Math.random() < 0.5 ? -1 : 1, r = Math.random();
  return { y, side, type: r < 0.4 ? 0 : (r < 0.62 ? 1 : (r < 0.78 ? 2 : 3)), s: rnd(0.8, 1.2),
    x: side < 0 ? rnd(10, 38) : rnd(W - 38, W - 10) };
}
function initScenery() { scenery = []; for (let i = 0; i < 14; i++) scenery.push(mkScenery(i * 60 - 40)); }
function moveScenery(dt) {
  for (const s of scenery) { s.y += roadSpeed * dt; if (s.y > H + 50) Object.assign(s, mkScenery(-rnd(40, 120))); }
}
function reset() {
  player = { x: laneX(2), vx: 0, rot: 0, spin: 0 };
  enemies = []; parts = []; items = []; pops = []; skids = []; warns = [];
  t = 0; score = 0; roadSpeed = 250; spawnT = 0.9; itemT = 3; shake = 0; crashT = 0;
  nitro = 100; boosting = false; wasB = false; bm = 1; slip = 0; combo = 0; comboT = 0;
  fuel = 100; stalled = false; dist = 0; toys = 0; rain = 0; idleT = 0; wasK = false; lowT = 0; braking = false;
  isNight = false;
  initScenery();
}
function addEnemy(lane, kind) {
  const st = kind !== undefined ? kind : Math.floor(Math.random() * 3), truck = st === 2, cop = st === 3;
  enemies.push({ lane, tl: lane, x: laneX(lane), y: -100, w: truck ? 50 : 44, h: truck ? 116 : 80,
    col: cop ? '#f4f4f4' : COLORS[Math.floor(Math.random() * COLORS.length)], st, passed: false,
    sw: (t > 35 && !cop && Math.random() < 0.3) ? 1 : 0, warn: 0, tg: false });
  if (cop) tone(800, 1000, 0.3, 'square', 0.06);
}
function spawn() {
  const free = [0, 1, 2, 3].filter(l =>
    !enemies.some(e => e.lane === l && e.y < 330 && e.y > -300) && (l < 2 || roadSpeed > laneV(l) + 40));
  if (free.length < 2) return;
  const lane = free.splice(Math.floor(Math.random() * free.length), 1)[0];
  addEnemy(lane, (t > 20 && Math.random() < 0.14) ? 3 : undefined);
  if (t > 15 && free.length >= 3 && Math.random() < Math.min(0.6, 0.3 + t / 300)) addEnemy(free[Math.floor(Math.random() * free.length)]);
}
function spawnItem() {
  const lane = Math.floor(Math.random() * NL), r = Math.random();
  if (r < 0.18) items.push({ k: 't', x: laneX(lane), y: -40, ty: Math.floor(Math.random() * 3) });
  else if (r < (fuel < 55 ? 0.42 : 0.26)) items.push({ k: 'f', x: laneX(lane), y: -40 });
  else if (t > 10 && r < 0.55) {
    if (enemies.some(e => e.lane === lane && e.y < 260)) return;
    items.push({ k: 'o', x: laneX(lane), y: -40, hit: false });
  } else for (let i = 0; i < 3; i++) items.push({ k: 'c', x: laneX(lane), y: -30 - i * 45 });
}
function pop(x, y, text) { pops.push({ x, y, text, life: 0 }); }

/* ---------- particles ---------- */
function addPart(x, y, kind, i) {
  const a = rnd(0, 6.283), sp = kind === 'd' ? rnd(80, 420) : rnd(10, 90);
  parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (kind === 's' ? 30 : 0), life: 0,
    max: rnd(0.5, kind === 'd' ? 1.3 : 1.8), size: rnd(2, kind === 'd' ? 6 : 12), kind, c: ['#ff2d55', '#ffd400', '#999', '#fff'][i % 4] });
}
function updateParts(dt) {
  for (const p of parts) { p.life += dt; p.x += p.vx * dt; p.y += p.vy * dt; const f = Math.pow(0.25, dt); p.vx *= f; p.vy *= f; }
  parts = parts.filter(p => p.life < p.max);
}
function drawParts() {
  for (const p of parts) {
    const a = 1 - p.life / p.max;
    if (p.kind === 's') {
      ctx.fillStyle = 'rgba(70,70,70,' + (a * 0.55) + ')';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1 + p.life * 2), 0, 6.283); ctx.fill();
    } else {
      ctx.save(); ctx.globalAlpha = a; ctx.translate(p.x, p.y); ctx.rotate(p.life * 12);
      ctx.fillStyle = p.c; ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6); ctx.restore();
    }
  }
}

/* ---------- game flow ---------- */
function hud() {
  $('score').textContent = pad(score); $('best').textContent = pad(best);
  $('speed').textContent = String(Math.round(roadSpeed * 0.32)).padStart(3, '0') + ' km/h';
}
function startGame() {
  initAudio(); playMusic(); clickSnd(); clearTimeout(overTimer);
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  reset(); state = 'playing';
  $('start').classList.add('hidden'); $('over').classList.add('hidden'); $('crashText').classList.remove('show');
  engineStart(); hud();
}
function pause() {
  if (state === 'playing') { state = 'paused'; engineStop(); if (music) music.pause(); }
  else if (state === 'paused') {
    state = 'playing'; engineStart();
    if (music) { try { const p = music.play(); if (p && p.catch) p.catch(() => {}); } catch (e) {} }
  }
}
function retrigger(el, cls) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }
function crash(r, soft) {
  state = 'crashed'; reason = r; crashT = 0; shake = soft ? 0.25 : 1; boosting = false; braking = false;
  engineStop();
  if (music) music.volume = 0.15;
  const s = Math.floor(score);
  if (s > best) { best = s; try { localStorage.setItem('degmoyar_best', best); } catch (e) {} }
  hud();
  if (!soft) {
    noise(0.8, 0.6); tone(180, 30, 0.7, 'sawtooth', 0.35);
    player.spin = (player.vx < 0 ? -1 : 1) * rnd(3, 5);
    for (let i = 0; i < 45; i++) addPart(player.x, PY, 'd', i);
    retrigger($('flash'), 'go');
  }
  for (let i = 0; i < (soft ? 10 : 22); i++) addPart(player.x, PY, 's', i);
  const ct = $('crashText'); ct.textContent = r; retrigger(ct, 'show');
  overTimer = setTimeout(showOver, 1300);
}
function showOver() {
  if (state !== 'crashed') return;
  $('reason').textContent = reason; $('fs').textContent = pad(score); $('fh').textContent = pad(best);
  $('crashText').classList.remove('show'); $('over').classList.remove('hidden');
  tone(400, 300, 0.3, 'triangle', 0.2, 0); tone(300, 220, 0.3, 'triangle', 0.2, 0.3); tone(220, 110, 0.6, 'triangle', 0.22, 0.6);
}

/* ---------- update ---------- */
function update(dt) {
  t += dt;
  const base = baseSpd();
  rain += (((t > 25 && Math.sin(t / 22) > 0.35) ? 1 : 0) - rain) * Math.min(1, dt * 0.5);

  /* day / night change announcement */
  const nn = nightAmt() > 0.5;
  if (nn !== isNight) {
    isNight = nn;
    pop(W / 2, 200, nn ? 'NIGHT FALLS' : 'SUNRISE');
    if (nn) tone(500, 250, 0.5, 'triangle', 0.12); else tone(300, 700, 0.5, 'triangle', 0.12);
  }

  boosting = keys.b && nitro > 0 && !stalled;
  nitro = boosting ? Math.max(0, nitro - 32 * dt) : Math.min(100, nitro + 7 * dt);
  if (boosting && !wasB) noise(0.35, 0.2);
  wasB = boosting;
  bm += ((boosting ? 1.4 : 1) - bm) * Math.min(1, dt * 4);

  /* speed: throttle, brake, stall */
  const brk = keys.k;
  braking = brk;
  if (brk && !wasK && roadSpeed > 250) noise(0.3, 0.1);
  wasK = brk;
  if (stalled) roadSpeed = Math.max(0, roadSpeed - (brk ? 520 : 200) * dt);
  else if (brk) roadSpeed = Math.max(0, roadSpeed - 520 * (1 - 0.35 * rain) * dt);
  else { const d = base * bm - roadSpeed; roadSpeed += Math.sign(d) * Math.min(Math.abs(d), (Math.abs(d) * 1.6 + 90) * dt); }

  if (brk && roadSpeed > 120) skids.push({ x: player.x - 14, y: PY + 30 }, { x: player.x + 14, y: PY + 30 });
  for (const s of skids) s.y += roadSpeed * dt;
  skids = skids.filter(s => s.y < H + 10);
  if (skids.length > 500) skids.splice(0, skids.length - 500);

  /* fuel */
  if (!stalled) {
    fuel -= (0.9 + roadSpeed / 700 * 1.1 + (boosting ? 1.5 : 0)) * dt;
    if (fuel <= 0) { fuel = 0; stalled = true; pop(player.x, PY - 60, 'OUT OF FUEL!'); tone(300, 60, 0.6, 'sawtooth', 0.2); }
  }
  lowT -= dt;
  if (fuel < 25 && !stalled && lowT <= 0) { lowT = 1.2; tone(900, 900, 0.12, 'square', 0.08); }

  /* steering */
  const dir = slip > 0 ? 0 : (keys.l ? -1 : 0) + (keys.r ? 1 : 0);
  const mv = (120 + Math.min(roadSpeed, 700) * 0.28) * Math.min(1, roadSpeed / 60 + 0.3);
  player.vx += (dir * mv - player.vx) * Math.min(1, dt * (slip > 0 ? 1.5 : 10 * (1 - 0.4 * rain)));
  player.x += player.vx * dt;
  player.rot = player.vx / 2200 + (slip > 0 ? Math.sin(t * 30) * 0.15 : 0);
  slip = Math.max(0, slip - dt);
  roadOff += roadSpeed * dt; dist += roadSpeed * 0.32 * dt / 3600;
  score += roadSpeed * dt * 0.02 * (boosting ? 2 : 1) * (isNight ? 1.25 : 1);
  comboT -= dt; if (comboT <= 0) combo = 0;

  /* tailgater when parked in the same-direction lanes */
  if (roadSpeed < 140 && !stalled) idleT += dt; else idleT = 0;
  if (idleT > 2.5) {
    idleT = -3;
    const l = laneOf(player.x);
    if (l >= 2) { warns.push({ lane: l, t: 1.5 }); pop(player.x, PY + 70, 'TAILGATER!'); tone(420, 380, 0.3, 'sawtooth', 0.15); }
  }
  for (const w of warns) {
    w.t -= dt;
    if (w.t <= 0) {
      w.done = true;
      enemies.push({ lane: w.lane, tl: w.lane, x: laneX(w.lane), y: H + 160, w: 44, h: 80,
        col: COLORS[Math.floor(Math.random() * COLORS.length)], st: Math.floor(Math.random() * 2),
        passed: false, sw: 0, warn: 0, tg: true, tv: roadSpeed + 320 });
      tone(380, 340, 0.4, 'sawtooth', 0.18);
    }
  }
  warns = warns.filter(w => !w.done);

  /* spawning */
  spawnT -= dt * (0.45 + 0.55 * Math.min(1.4, roadSpeed / base));
  if (spawnT <= 0) { spawnT = Math.max(0.4, 1.05 - t * 0.01) * rnd(0.85, 1.15); spawn(); }
  itemT -= dt;
  if (itemT <= 0) { itemT = rnd(2.5, 5); spawnItem(); }

  /* traffic */
  for (const e of enemies) {
    const v = e.tg ? e.tv : laneV(e.lane);
    const rel = (e.lane < 2 && !e.tg) ? roadSpeed + v : roadSpeed - v;
    e.y += rel * (e.st === 3 && rel > 0 ? 1.3 : 1) * dt;
    if (e.sw === 1 && e.y > 60 && e.y < 400) {
      const opts = [e.lane - 1, e.lane + 1].filter(l => l >= 0 && l < NL && grp(l) === grp(e.lane) &&
        !enemies.some(o => o !== e && (o.lane === l || o.tl === l) && Math.abs(o.y - e.y) < 220));
      if (opts.length) { e.tl = opts[Math.floor(Math.random() * opts.length)]; e.warn = 0.7; e.sw = 2; } else e.sw = 3;
    } else if (e.sw === 2) { e.warn -= dt; if (e.warn <= 0) { e.lane = e.tl; e.sw = 3; } }
    e.x += (laneX(e.lane) - e.x) * Math.min(1, dt * 4);
  }
  enemies = enemies.filter(e => e.y < H + 260 && e.y > -450);

  /* items */
  for (const it of items) {
    it.y += roadSpeed * dt;
    if (it.got || it.hit) continue;
    const dx = Math.abs(it.x - player.x), dy = Math.abs(it.y - PY);
    if (it.k === 'c' && dx < 30 && dy < 44) {
      it.got = true; score += 50; tone(1200, 1800, 0.1, 'sine', 0.15); pop(it.x, PY - 30, '+50');
    } else if (it.k === 'o' && dx < 36 && dy < 34) {
      it.hit = true; slip = 0.9 + rain * 0.4; player.vx += (Math.random() < 0.5 ? -1 : 1) * 420;
      tone(200, 80, 0.4, 'sawtooth', 0.2); pop(player.x, PY - 50, 'SLIPPING!');
    } else if (it.k === 't' && dx < 32 && dy < 46) {
      it.got = true; toys++; score += 200; nitro = Math.min(100, nitro + 30);
      tone(700, 1400, 0.08, 'triangle', 0.18); tone(1000, 2000, 0.12, 'triangle', 0.18, 0.08);
      pop(it.x, PY - 30, 'TOY! +200');
    } else if (it.k === 'f' && dx < 32 && dy < 46) {
      it.got = true; fuel = Math.min(100, fuel + 35); score += 30; if (fuel > 0) stalled = false;
      tone(500, 900, 0.15, 'triangle', 0.2); pop(it.x, PY - 30, 'FUEL +35');
    }
  }
  items = items.filter(i => i.y < H + 60 && !i.got);
  for (const p of pops) { p.life += dt; p.y -= 40 * dt; }
  pops = pops.filter(p => p.life < 1.2);
  moveScenery(dt);

  /* collisions */
  if (player.x - PW / 2 < RL || player.x + PW / 2 > RR) { crash('YOU LEFT THE ROAD!'); return; }
  for (const e of enemies) {
    if (Math.abs(e.x - player.x) < (e.w + PW) / 2 - 4 && Math.abs(e.y - PY) < (e.h + PH) / 2 - 4) { crash('CRASH!'); return; }
    const gone = e.tg ? e.y + e.h / 2 < PY - PH / 2 : e.y - e.h / 2 > PY + PH / 2;
    if (!e.passed && gone) {
      e.passed = true;
      if (Math.abs(e.x - player.x) < (e.w + PW) / 2 + 28) {
        combo++; comboT = 4; const b = 25 * combo; score += b;
        pop(player.x, PY - 70, 'NEAR MISS +' + b); tone(900, 1400, 0.12, 'square', 0.1);
      }
    }
  }
  if (stalled && roadSpeed <= 1) { crash('OUT OF FUEL!', true); return; }
  engineUpdate(); hud();
}
function updateCrash(dt) {
  crashT += dt; shake = Math.max(0, shake - dt * 1.4);
  player.x += player.vx * dt; player.vx *= Math.pow(0.08, dt);
  player.rot += player.spin * dt; player.spin *= Math.pow(0.15, dt);
  if (crashT < 2.2 && Math.random() < 0.5) addPart(player.x + rnd(-10, 10), PY, 's', 0);
  for (const p of pops) { p.life += dt; p.y -= 40 * dt; }
  updateParts(dt);
}

/* ---------- drawing ---------- */
function rr(x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function glow(x, y, r, c) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, c); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.fill();
}
function drawRoad() {
  ctx.fillStyle = '#2f8f3f'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#37a049';
  for (let y = -120 + (roadOff % 120); y < H; y += 120) ctx.fillRect(0, y, W, 60);
  for (let y = -60 + (roadOff % 60); y < H; y += 60) {
    ctx.fillStyle = '#e63946'; ctx.fillRect(RL - 12, y, 12, 30); ctx.fillRect(RR, y, 12, 30);
    ctx.fillStyle = '#fff'; ctx.fillRect(RL - 12, y + 30, 12, 30); ctx.fillRect(RR, y + 30, 12, 30);
  }
  ctx.fillStyle = '#2b2e37'; ctx.fillRect(RL, 0, RR - RL, H);
  ctx.fillStyle = 'rgba(255,255,255,.03)';
  for (let y = -200 + (roadOff % 200); y < H; y += 200) ctx.fillRect(RL, y, RR - RL, 100);
  if (rain > 0.02) {
    ctx.fillStyle = 'rgba(20,45,95,' + (0.38 * rain) + ')'; ctx.fillRect(RL, 0, RR - RL, H);
    ctx.fillStyle = 'rgba(170,200,255,' + (0.07 * rain) + ')';
    for (let y = -160 + (roadOff % 160); y < H; y += 160) ctx.fillRect(RL, y, RR - RL, 22);
  }
  ctx.fillStyle = '#fff'; ctx.fillRect(RL + 4, 0, 4, H); ctx.fillRect(RR - 8, 0, 4, H);
  const c = RL + 2 * LW;
  ctx.fillStyle = '#ffc400'; ctx.fillRect(c - 4, 0, 3, H); ctx.fillRect(c + 1, 0, 3, H);
  ctx.fillStyle = '#fff';
  for (const lx2 of [RL + LW, RL + 3 * LW])
    for (let y = -100 + (roadOff % 100); y < H; y += 100) ctx.fillRect(lx2 - 2, y, 4, 55);
  const g = ctx.createLinearGradient(0, 0, 0, 260);
  g.addColorStop(0, 'rgba(0,0,0,.5)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, 260);
}
function drawScenery(s) {
  const x = s.x, y = s.y, k = s.s;
  if (s.type === 0) {
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.arc(x + 8, y + 9, 24 * k, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#1e6b2c'; ctx.beginPath(); ctx.arc(x, y, 24 * k, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#2b8a3c'; ctx.beginPath(); ctx.arc(x - 3, y - 3, 17 * k, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#3fae52'; ctx.beginPath(); ctx.arc(x - 6, y - 6, 8 * k, 0, 6.283); ctx.fill();
  } else if (s.type === 1) {
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.arc(x + 4, y + 5, 12 * k, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#2a7d36'; ctx.beginPath(); ctx.arc(x, y, 12 * k, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#e84393'; ctx.beginPath(); ctx.arc(x - 3, y - 3, 3, 0, 6.283); ctx.arc(x + 4, y + 2, 3, 0, 6.283); ctx.fill();
  } else if (s.type === 2) {
    ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(x - 14, y - 6, 34, 22);
    ctx.fillStyle = '#6b4a2b'; ctx.fillRect(x - 2, y + 4, 4, 14);
    ctx.fillStyle = '#1f6feb'; rr(x - 17, y - 11, 34, 22, 3); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 10px Arial'; ctx.textAlign = 'center'; ctx.fillText('DEG', x, y + 4);
  } else {
    const hx = x - s.side * 18;                       // lamp arm reaches toward the road
    ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(Math.min(x, hx) + 3, y, 18, 5);
    ctx.fillStyle = '#666'; ctx.fillRect(Math.min(x, hx), y - 2, 18, 4);
    ctx.fillStyle = '#333'; ctx.beginPath(); ctx.arc(x, y, 5, 0, 6.283); ctx.fill();
    ctx.fillStyle = nightNow > 0.2 ? '#fff0b0' : '#bbb'; ctx.beginPath(); ctx.arc(hx, y, 6, 0, 6.283); ctx.fill();
  }
}
function drawToy(it) {
  const x = it.x, y = it.y + Math.sin(performance.now() / 150) * 3;
  ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(x + 4, y + 16, 14, 6, 0, 0, 6.283); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.beginPath(); ctx.arc(x, y, 24, 0, 6.283); ctx.fill();
  if (it.ty === 0) {
    ctx.fillStyle = '#a0642f';
    ctx.beginPath(); ctx.arc(x - 9, y - 11, 5, 0, 6.283); ctx.arc(x + 9, y - 11, 5, 0, 6.283); ctx.fill();
    ctx.beginPath(); ctx.arc(x, y + 6, 11, 0, 6.283); ctx.fill();
    ctx.beginPath(); ctx.arc(x, y - 4, 10, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#e8c39a'; ctx.beginPath(); ctx.arc(x, y - 1, 4, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#000'; ctx.fillRect(x - 5, y - 7, 2, 2); ctx.fillRect(x + 3, y - 7, 2, 2);
  } else if (it.ty === 1) {
    ctx.fillStyle = '#ffd400'; ctx.beginPath(); ctx.ellipse(x, y + 5, 13, 9, 0, 0, 6.283); ctx.fill();
    ctx.beginPath(); ctx.arc(x + 4, y - 6, 8, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#ff7a00'; ctx.fillRect(x + 10, y - 7, 7, 4);
    ctx.fillStyle = '#000'; ctx.fillRect(x + 4, y - 9, 2, 2);
  } else {
    ctx.fillStyle = '#3aa0ff'; rr(x - 10, y - 6, 20, 18, 3); ctx.fill();
    ctx.fillStyle = '#8fd0ff'; rr(x - 8, y - 16, 16, 10, 3); ctx.fill();
    ctx.fillStyle = '#000'; ctx.fillRect(x - 5, y - 13, 3, 3); ctx.fillRect(x + 2, y - 13, 3, 3);
    ctx.fillStyle = '#ff2d55'; ctx.fillRect(x - 1, y - 20, 2, 5); ctx.fillRect(x - 4, y + 1, 8, 4);
  }
}
function drawItem(it) {
  if (it.k === 't') { drawToy(it); return; }
  if (it.k === 'f') {
    ctx.fillStyle = 'rgba(255,60,60,.18)'; ctx.beginPath(); ctx.arc(it.x, it.y, 26, 0, 6.283); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(it.x - 10, it.y - 8, 26, 28);
    ctx.fillStyle = '#e02020'; rr(it.x - 13, it.y - 16, 26, 30, 4); ctx.fill();
    ctx.fillStyle = '#a01010'; ctx.fillRect(it.x - 5, it.y - 21, 10, 6);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 16px Arial'; ctx.textAlign = 'center'; ctx.fillText('F', it.x, it.y + 6);
    return;
  }
  if (it.k === 'c') {
    const rx = Math.max(2, 11 * Math.abs(Math.cos(performance.now() / 200 + it.y / 40)));
    ctx.fillStyle = '#ffb300'; ctx.beginPath(); ctx.ellipse(it.x, it.y, rx, 11, 0, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#ffe14d'; ctx.beginPath(); ctx.ellipse(it.x, it.y, rx * 0.6, 7, 0, 0, 6.283); ctx.fill();
  } else {
    ctx.fillStyle = 'rgba(8,8,14,.85)'; ctx.beginPath(); ctx.ellipse(it.x, it.y, 34, 22, 0.3, 0, 6.283); ctx.fill();
    ctx.fillStyle = 'rgba(120,80,200,.35)'; ctx.beginPath(); ctx.ellipse(it.x - 6, it.y - 4, 16, 8, 0.3, 0, 6.283); ctx.fill();
  }
}
function drawCar(x, y, w, h, col, st, rot, flip, beam, brk) {
  const a = rot + (flip ? Math.PI : 0);
  ctx.save(); ctx.translate(x + 7, y + 9); ctx.rotate(a); ctx.fillStyle = 'rgba(0,0,0,.32)'; rr(-w / 2, -h / 2, w, h, 10); ctx.fill(); ctx.restore();
  ctx.save(); ctx.translate(x, y); ctx.rotate(a);
  if (beam && state !== 'crashed') {
    const g = ctx.createLinearGradient(0, -h / 2, 0, -h / 2 - 100);
    g.addColorStop(0, 'rgba(255,250,190,.3)'); g.addColorStop(1, 'rgba(255,250,190,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-w / 2 + 5, -h / 2); ctx.lineTo(-w / 2 - 12, -h / 2 - 100);
    ctx.lineTo(w / 2 + 12, -h / 2 - 100); ctx.lineTo(w / 2 - 5, -h / 2); ctx.fill();
  }
  ctx.fillStyle = '#111';
  for (const fy of [-0.3, 0.3]) { rr(-w / 2 - 5, h * fy - 9, 7, 18, 2); ctx.fill(); rr(w / 2 - 2, h * fy - 9, 7, 18, 2); ctx.fill(); }
  ctx.fillStyle = col; rr(-w / 2, -h / 2, w, h, st === 2 ? 6 : 11); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.16)'; rr(-w / 2 + 3, -h / 2 + 3, w / 2 - 4, h - 6, 8); ctx.fill();
  if (st === 1) { ctx.fillStyle = '#fff'; ctx.fillRect(-6, -h / 2 + 3, 4, h - 6); ctx.fillRect(2, -h / 2 + 3, 4, h - 6); }
  if (st === 2) {
    ctx.fillStyle = '#dfe6ee'; rr(-w / 2 + 3, -h / 2 + 38, w - 6, h - 44, 4); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,.15)'; ctx.fillRect(-1, -h / 2 + 40, 2, h - 48);
    ctx.fillStyle = '#132a44'; rr(-w / 2 + 5, -h / 2 + 12, w - 10, 16, 4); ctx.fill();
  } else {
    ctx.fillStyle = '#132a44'; rr(-w / 2 + 5, -h * 0.2, w - 10, h * 0.17, 4); ctx.fill();
    rr(-w / 2 + 6, h * 0.17, w - 12, h * 0.12, 3); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,.22)'; rr(-w / 2 + 5, -h * 0.03, w - 10, h * 0.2, 4); ctx.fill();
  }
  if (st === 3) {
    const b = (performance.now() % 400) < 200;
    ctx.fillStyle = '#111'; rr(-w / 2 + 3, h * 0.31, w - 6, h * 0.1, 3); ctx.fill();
    ctx.fillStyle = b ? '#ff2030' : '#2050ff'; ctx.fillRect(-w / 2 + 6, -h * 0.02, w / 2 - 6, 6);
    ctx.fillStyle = b ? '#2050ff' : '#ff2030'; ctx.fillRect(0, -h * 0.02, w / 2 - 6, 6);
  }
  ctx.fillStyle = '#fff7b0'; rr(-w / 2 + 3, -h / 2 + 1, 9, 5, 2); ctx.fill(); rr(w / 2 - 12, -h / 2 + 1, 9, 5, 2); ctx.fill();
  if (brk) { ctx.shadowColor = '#ff0000'; ctx.shadowBlur = 16; }
  ctx.fillStyle = brk ? '#ff0a1f' : '#ff1f3d';
  rr(-w / 2 + 3, h / 2 - 6, 9, 4, 2); ctx.fill(); rr(w / 2 - 12, h / 2 - 6, 9, 4, 2); ctx.fill();
  ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';
  ctx.restore();
}

/* night lighting: dark mask with holes cut for every light source */
function drawLighting() {
  const n = nightAmt(), s = sunS();
  const dusk = Math.max(0, 1 - Math.abs(s) / 0.4);
  if (dusk > 0.02) { ctx.fillStyle = 'rgba(255,110,30,' + (dusk * 0.2) + ')'; ctx.fillRect(0, 0, W, H); }
  const a = n * 0.7 + 0.1 * rain;
  if (a < 0.02) return;
  const cut = (x, y, r, al) => {
    const g = lx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(0,0,0,' + al + ')'); g.addColorStop(1, 'rgba(0,0,0,0)');
    lx.fillStyle = g; lx.beginPath(); lx.arc(x, y, r, 0, 6.283); lx.fill();
  };
  lx.globalCompositeOperation = 'source-over';
  lx.clearRect(0, 0, W, H);
  lx.fillStyle = 'rgba(4,8,30,' + a + ')'; lx.fillRect(0, 0, W, H);
  lx.globalCompositeOperation = 'destination-out';
  if (!stalled && state !== 'crashed') {
    const g = lx.createLinearGradient(0, PY - 40, 0, PY - 330);
    g.addColorStop(0, 'rgba(0,0,0,.95)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    lx.fillStyle = g; lx.beginPath();
    lx.moveTo(player.x - 14, PY - 40); lx.lineTo(player.x - 75, PY - 330);
    lx.lineTo(player.x + 75, PY - 330); lx.lineTo(player.x + 14, PY - 40); lx.fill();
  }
  cut(player.x, PY, 85, 0.75);
  for (const e of enemies) {
    cut(e.x, e.y, 72, 0.75);
    const onc = e.lane < 2 && !e.tg;
    cut(e.x, e.y + (onc ? 1 : -1) * (e.h / 2 + 40), 55, 0.6);
  }
  for (const it of items) cut(it.x, it.y, 38, 0.6);
  for (const sc of scenery) if (sc.type === 3) cut(sc.x - sc.side * 18, sc.y, 125, 0.9);
  lx.globalCompositeOperation = 'source-over';
  ctx.drawImage(lc, 0, 0);

  /* additive glows on top of the darkness */
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (const sc of scenery) if (sc.type === 3) glow(sc.x - sc.side * 18, sc.y, 110, 'rgba(255,205,120,' + (0.32 * n) + ')');
  if (!stalled && state !== 'crashed') {
    const g = ctx.createLinearGradient(0, PY - 40, 0, PY - 330);
    g.addColorStop(0, 'rgba(255,240,170,' + (0.22 * n) + ')'); g.addColorStop(1, 'rgba(255,240,170,0)');
    ctx.fillStyle = g; ctx.beginPath();
    ctx.moveTo(player.x - 14, PY - 40); ctx.lineTo(player.x - 75, PY - 330);
    ctx.lineTo(player.x + 75, PY - 330); ctx.lineTo(player.x + 14, PY - 40); ctx.fill();
  }
  if (braking || stalled) { glow(player.x - 12, PY + PH / 2, 30, 'rgba(255,30,30,.7)'); glow(player.x + 12, PY + PH / 2, 30, 'rgba(255,30,30,.7)'); }
  for (const e of enemies) {
    const onc = e.lane < 2 && !e.tg;
    glow(e.x, e.y + e.h / 2, 30, onc ? 'rgba(255,250,200,' + (0.5 * n) + ')' : 'rgba(255,40,40,' + (0.5 * n) + ')');
    glow(e.x, e.y - e.h / 2, 30, onc ? 'rgba(255,40,40,' + (0.5 * n) + ')' : 'rgba(255,250,200,' + (0.5 * n) + ')');
  }
  ctx.restore();
}
function drawHud() {
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(12, 46, 130, 12); ctx.fillRect(12, 62, 130, 12);
  ctx.fillStyle = boosting ? '#ff8a00' : '#00c8ff'; ctx.fillRect(12, 46, 1.3 * nitro, 12);
  const lowF = fuel < 25 && (performance.now() % 500) < 250;
  ctx.fillStyle = lowF ? '#ff2030' : (fuel < 25 ? '#ff7a00' : '#4cd964'); ctx.fillRect(12, 62, 1.3 * fuel, 12);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 10px Arial';
  ctx.fillText('NITRO', 16, 56); ctx.fillText('FUEL', 16, 72);
  ctx.font = 'bold 12px Arial';
  ctx.fillText('TOYS: ' + toys, 12, 92);
  ctx.fillText('DIST: ' + dist.toFixed(2) + ' km', 12, 108);
  if (rain > 0.3) { ctx.fillStyle = '#9fc4ff'; ctx.fillText('RAIN - SLIPPERY', 12, 124); }
  if (combo > 1) { ctx.font = 'italic bold 22px Arial'; ctx.textAlign = 'right'; ctx.fillStyle = '#ffd400'; ctx.fillText('COMBO x' + combo, W - 12, 60); }

  /* day / night panel */
  const n = nightAmt(), s = sunS(), tod = ((t + 12) % CYC) / CYC;
  const label = n > 0.6 ? 'NIGHT' : ((n > 0.05 || Math.abs(s) < 0.25) ? (tod < 0.75 ? 'DUSK' : 'DAWN') : 'DAY');
  ctx.fillStyle = 'rgba(0,0,0,.5)'; rr(W - 100, 70, 88, 34, 8); ctx.fill();
  const ix = W - 80, iy = 87;
  if (n < 0.5) {
    ctx.fillStyle = '#ffd400'; ctx.strokeStyle = '#ffd400'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(ix, iy, 7, 0, 6.283); ctx.fill();
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const an = i * Math.PI / 4;
      ctx.moveTo(ix + Math.cos(an) * 10, iy + Math.sin(an) * 10); ctx.lineTo(ix + Math.cos(an) * 14, iy + Math.sin(an) * 14);
    }
    ctx.stroke();
  } else {
    ctx.save(); ctx.beginPath(); ctx.arc(ix, iy, 9, 0, 6.283); ctx.clip();
    ctx.fillStyle = '#e8eeff'; ctx.fillRect(ix - 10, iy - 10, 20, 20);
    ctx.fillStyle = '#1b2140'; ctx.beginPath(); ctx.arc(ix + 5, iy - 3, 8, 0, 6.283); ctx.fill();
    ctx.restore();
  }
  ctx.font = 'bold 14px Arial'; ctx.textAlign = 'left';
  ctx.fillStyle = n > 0.6 ? '#9fb4ff' : (label === 'DAY' ? '#ffd400' : '#ff9a4d');
  ctx.fillText(label, W - 62, 92);

  if (fuel < 25 && !stalled && (performance.now() % 600) < 400) {
    ctx.font = 'italic 900 22px Arial'; ctx.textAlign = 'center'; ctx.fillStyle = '#ff4040'; ctx.fillText('LOW FUEL!', W / 2, 150);
  }
  if (stalled) { ctx.font = 'italic 900 26px Arial'; ctx.textAlign = 'center'; ctx.fillStyle = '#ff4040'; ctx.fillText('ENGINE DEAD', W / 2, 150); }
  ctx.textAlign = 'left';
}
function draw() {
  nightNow = nightAmt();
  const lights = nightNow > 0.2 || rain > 0.3;
  ctx.save();
  if (shake > 0) { const m = shake * 14; ctx.translate(rnd(-m, m), rnd(-m, m)); }
  drawRoad();
  ctx.fillStyle = 'rgba(8,8,8,.45)';
  for (const s of skids) ctx.fillRect(s.x - 2, s.y, 4, 9);
  scenery.forEach(drawScenery);
  items.forEach(drawItem);
  for (const e of enemies) {
    drawCar(e.x, e.y, e.w, e.h, e.col, e.st, 0, e.lane < 2 && !e.tg, lights, false);
    if (e.sw === 2 && (performance.now() % 300) < 150) {
      const sd = e.tl > e.lane ? 1 : -1;
      ctx.fillStyle = '#ffa500';
      for (const yy of [-e.h / 2 + 4, e.h / 2 - 4]) { ctx.beginPath(); ctx.arc(e.x + sd * (e.w / 2 + 2), e.y + yy, 5, 0, 6.283); ctx.fill(); }
    }
  }
  if (boosting) {
    const f = rnd(22, 40);
    for (const dx of [-12, 12]) {
      ctx.fillStyle = '#ff8a00'; ctx.beginPath(); ctx.moveTo(player.x + dx - 6, PY + PH / 2); ctx.lineTo(player.x + dx, PY + PH / 2 + f); ctx.lineTo(player.x + dx + 6, PY + PH / 2); ctx.fill();
      ctx.fillStyle = '#ffee88'; ctx.beginPath(); ctx.moveTo(player.x + dx - 3, PY + PH / 2); ctx.lineTo(player.x + dx, PY + PH / 2 + f * 0.6); ctx.lineTo(player.x + dx + 3, PY + PH / 2); ctx.fill();
    }
  }
  const bob = state === 'menu' ? Math.sin(performance.now() / 200) * 1.5 : 0;
  drawCar(player.x, PY + bob, PW, PH, '#ff2d55', 1, player.rot, false, !stalled, braking || stalled);
  drawParts();
  drawLighting();
  for (const w of warns) {
    if ((performance.now() % 300) < 170) {
      const x = laneX(w.lane);
      ctx.fillStyle = '#ff2030'; ctx.beginPath(); ctx.moveTo(x, H - 62); ctx.lineTo(x - 20, H - 24); ctx.lineTo(x + 20, H - 24); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 22px Arial'; ctx.textAlign = 'center'; ctx.fillText('!', x, H - 30);
    }
  }
  if (rain > 0.05) {
    ctx.strokeStyle = 'rgba(200,220,255,' + (0.45 * rain) + ')'; ctx.lineWidth = 1.5; ctx.beginPath();
    for (let i = 0, n = Math.floor(110 * rain); i < n; i++) { const x = Math.random() * (W + 20), y = Math.random() * H; ctx.moveTo(x, y); ctx.lineTo(x - 4, y + 18); }
    ctx.stroke();
  }
  if (roadSpeed > 420 && (state === 'playing' || state === 'paused')) {
    ctx.strokeStyle = 'rgba(255,255,255,.22)'; ctx.lineWidth = 2; ctx.beginPath();
    for (let i = 0, n = (roadSpeed - 420) / 30; i < n; i++) { const x = Math.random() * W, y = Math.random() * H; ctx.moveTo(x, y); ctx.lineTo(x, y + roadSpeed * 0.05); }
    ctx.stroke();
  }
  ctx.textAlign = 'center'; ctx.font = 'bold 20px Arial';
  for (const p of pops) {
    ctx.globalAlpha = Math.max(0, 1 - p.life / 1.2); ctx.fillStyle = '#000'; ctx.fillText(p.text, p.x + 2, p.y + 2);
    ctx.fillStyle = '#ffd400'; ctx.fillText(p.text, p.x, p.y);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
  if (state === 'playing' || state === 'paused') drawHud();
  if (state === 'paused') {
    ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = 'italic 900 48px Arial'; ctx.fillText('PAUSED', W / 2, H / 2);
    ctx.font = 'bold 16px Arial'; ctx.fillText('Press P to resume', W / 2, H / 2 + 34);
  }
}

/* ---------- input ---------- */
const isL = k => k === 'ArrowLeft' || k === 'a' || k === 'A';
const isR = k => k === 'ArrowRight' || k === 'd' || k === 'D';
const isB = k => k === 'ArrowUp' || k === 'w' || k === 'W';
const isK = k => k === 'ArrowDown' || k === 's' || k === 'S';
addEventListener('keydown', e => {
  const k = e.key;
  if (isL(k)) keys.l = true;
  else if (isR(k)) keys.r = true;
  else if (isB(k)) keys.b = true;
  else if (isK(k)) keys.k = true;
  else if (k === ' ' || e.code === 'Space') {
    e.preventDefault();
    if (e.repeat) return;
    if (state === 'paused') pause(); else if (state !== 'playing') startGame();
    return;
  }
  else if (k === 'p' || k === 'P' || k === 'Escape') { if (!e.repeat) pause(); return; }
  else if (k === 'm' || k === 'M') { muted = !muted; if (music) music.muted = muted; return; }
  else return;
  e.preventDefault();
});
addEventListener('keyup', e => {
  const k = e.key;
  if (isL(k)) keys.l = false; else if (isR(k)) keys.r = false; else if (isB(k)) keys.b = false; else if (isK(k)) keys.k = false;
});
addEventListener('blur', () => { keys.l = keys.r = keys.b = keys.k = false; if (state === 'playing') pause(); });
function hold(id, k) {
  const b = $(id);
  b.addEventListener('pointerdown', e => {
    e.preventDefault(); keys[k] = true; b.classList.add('down');
    try { b.setPointerCapture(e.pointerId); } catch (err) {}
  });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(n =>
    b.addEventListener(n, () => { keys[k] = false; b.classList.remove('down'); }));
}
hold('btnL', 'l'); hold('btnR', 'r'); hold('btnB', 'b'); hold('btnK', 'k');
$('startBtn').addEventListener('click', startGame);
$('again').addEventListener('click', startGame);
document.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
document.addEventListener('contextmenu', e => e.preventDefault());

/* ---------- main loop ---------- */
let last = performance.now();
function loop(ts) {
  const dt = Math.min(0.033, Math.max(0, (ts - last) / 1000)); last = ts;
  if (state === 'playing') update(dt);
  else if (state === 'crashed') updateCrash(dt);
  else if (state === 'menu') { roadSpeed = 220; roadOff += roadSpeed * dt; moveScenery(dt); }
  draw();
  requestAnimationFrame(loop);
}
reset(); hud(); roadSpeed = 220;
requestAnimationFrame(loop);
})();