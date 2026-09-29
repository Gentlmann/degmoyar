(() => {
'use strict';
const W = 480, H = 720, RL = 90, RR = 390, LW = 100, PY = 545, PW = 44, PH = 80;
const $ = id => document.getElementById(id);
const cv = $('game'), ctx = cv.getContext('2d'), wrap = $('wrap');
const COLORS = ['#2ecc71','#f1c40f','#3498db','#9b59b6','#e67e22','#1abc9c','#ecf0f1','#ff9ff3'];
const rnd = (a, b) => a + Math.random() * (b - a);
const pad = n => String(Math.floor(n)).padStart(4, '0');

let state = 'menu', t = 0, score = 0, best = 0, roadSpeed = 220, roadOff = 0, spawnT = 0;
let shake = 0, crashT = 0, reason = '', overTimer = 0;
let player, enemies = [], parts = [], scenery = [];
const keys = { l: false, r: false };
try { best = parseInt(localStorage.getItem('degmoyar_best')) || 0; } catch (e) {}

/* ---------- responsive ---------- */
function resize() {
  const s = Math.min(innerWidth / W, innerHeight / H);
  wrap.style.width = W * s + 'px';
  wrap.style.height = H * s + 'px';
  wrap.style.fontSize = 16 * s + 'px';
}
addEventListener('resize', resize);
addEventListener('orientationchange', resize);
resize();

/* ---------- audio (Web Audio, optional) ---------- */
let ac = null, master = null, eng = null;
function initAudio() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
  try {
    const A = window.AudioContext || window.webkitAudioContext;
    if (!A) return;
    ac = new A(); master = ac.createGain(); master.gain.value = 0.5; master.connect(ac.destination);
  } catch (e) { ac = null; }
}
function tone(f1, f2, d, type, v, delay) {
  if (!ac) return;
  try {
    const s = ac.currentTime + (delay || 0), o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f1, s);
    o.frequency.exponentialRampToValueAtTime(Math.max(f2, 1), s + d);
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
  if (eng) try { eng.o.frequency.setTargetAtTime(60 + roadSpeed * 0.2, ac.currentTime, 0.1); } catch (e) {}
}
const clickSnd = () => tone(600, 950, 0.09, 'square', 0.12);

/* ---------- background music (song1.mp3 / song2.mp3) ---------- */
const TRACKS = ['song1.mp3', 'song2.mp3'];
let music = null, lastTrack = -1, muted = false;
function pickTrack() {
  let i;
  do { i = Math.floor(Math.random() * TRACKS.length); } while (TRACKS.length > 1 && i === lastTrack);
  lastTrack = i;
  return TRACKS[i];
}
function playMusic() {
  try {
    if (music) { music.onended = null; music.pause(); }
    music = new Audio(pickTrack());
    music.volume = 0.5;
    music.muted = muted;
    music.onended = playMusic;            // when a song ends, pick another one at random
    const p = music.play();
    if (p && p.catch) p.catch(() => {});  // ignore autoplay/missing-file errors
  } catch (e) {}
}

/* ---------- world ---------- */
function mkScenery(y) {
  const side = Math.random() < 0.5 ? -1 : 1, r = Math.random();
  return { y, side, type: r < 0.5 ? 0 : (r < 0.8 ? 1 : 2), s: rnd(0.8, 1.2),
    x: side < 0 ? rnd(20, 62) : rnd(W - 62, W - 20) };
}
function initScenery() { scenery = []; for (let i = 0; i < 14; i++) scenery.push(mkScenery(i * 60 - 40)); }
function moveScenery(dt) {
  for (const s of scenery) {
    s.y += roadSpeed * dt;
    if (s.y > H + 50) Object.assign(s, mkScenery(-rnd(40, 120)));
  }
}
function reset() {
  player = { x: (RL + RR) / 2, vx: 0, rot: 0, spin: 0 };
  enemies = []; parts = []; t = 0; score = 0; roadSpeed = 300; spawnT = 0.9; shake = 0; crashT = 0;
  initScenery();
}
function addEnemy(lane) {
  const st = Math.floor(Math.random() * 3), truck = st === 2;
  enemies.push({ lane, x: RL + LW * (lane + 0.5), y: -90, w: truck ? 50 : 44, h: truck ? 116 : 80,
    col: COLORS[Math.floor(Math.random() * COLORS.length)], st, k: rnd(0.75, 1.15) });
}
function spawn() {
  const busy = new Set(enemies.filter(e => e.y < 330).map(e => e.lane));
  const free = [0, 1, 2].filter(l => !busy.has(l));
  if (free.length < 2) return;                       // always leave a gap to drive through
  const lane = free.splice(Math.floor(Math.random() * free.length), 1)[0];
  addEnemy(lane);
  if (t > 25 && free.length === 2 && Math.random() < 0.35) addEnemy(free[Math.floor(Math.random() * 2)]);
}

/* ---------- particles ---------- */
function addPart(x, y, kind, i) {
  const a = rnd(0, 6.283), sp = kind === 'd' ? rnd(80, 420) : rnd(10, 90);
  parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (kind === 's' ? 30 : 0), life: 0,
    max: rnd(0.5, kind === 'd' ? 1.3 : 1.8), size: rnd(2, kind === 'd' ? 6 : 12), kind,
    c: ['#ff2d55', '#ffd400', '#999', '#fff'][i % 4] });
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
  $('score').textContent = pad(score);
  $('best').textContent = pad(best);
  $('speed').textContent = String(Math.round(roadSpeed * 0.32)).padStart(3, '0') + ' km/h';
}
function startGame() {
  initAudio(); playMusic(); clickSnd(); clearTimeout(overTimer);
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  reset(); state = 'playing';
  $('start').classList.add('hidden'); $('over').classList.add('hidden');
  $('crashText').classList.remove('show');
  engineStart(); hud();
}
function retrigger(el, cls) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }
function crash(r) {
  state = 'crashed'; reason = r; crashT = 0; shake = 1;
  engineStop();
  if (music) music.volume = 0.15;
  const s = Math.floor(score);
  if (s > best) { best = s; try { localStorage.setItem('degmoyar_best', best); } catch (e) {} }
  hud();
  noise(0.8, 0.6); tone(180, 30, 0.7, 'sawtooth', 0.35);
  player.spin = (player.vx < 0 ? -1 : 1) * rnd(3, 5);
  for (let i = 0; i < 45; i++) addPart(player.x, PY, 'd', i);
  for (let i = 0; i < 22; i++) addPart(player.x, PY, 's', i);
  retrigger($('flash'), 'go');
  const ct = $('crashText'); ct.textContent = r; retrigger(ct, 'show');
  overTimer = setTimeout(showOver, 1300);
}
function showOver() {
  if (state !== 'crashed') return;
  $('reason').textContent = reason;
  $('fs').textContent = pad(score); $('fh').textContent = pad(best);
  $('crashText').classList.remove('show');
  $('over').classList.remove('hidden');
  tone(400, 300, 0.3, 'triangle', 0.2, 0); tone(300, 220, 0.3, 'triangle', 0.2, 0.3); tone(220, 110, 0.6, 'triangle', 0.22, 0.6);
}

/* ---------- update ---------- */
function update(dt) {
  t += dt;
  roadSpeed = 300 + Math.min(t * 6, 400);
  const dir = (keys.l ? -1 : 0) + (keys.r ? 1 : 0);
  player.vx += (dir * (250 + roadSpeed * 0.16) - player.vx) * Math.min(1, dt * 10);
  player.x += player.vx * dt;
  player.rot = player.vx / 2200;
  roadOff += roadSpeed * dt; score += roadSpeed * dt * 0.02;

  spawnT -= dt;
  if (spawnT <= 0) { spawnT = Math.max(0.42, 1.15 - t * 0.011) * rnd(0.85, 1.15); spawn(); }
  for (const e of enemies) e.y += roadSpeed * e.k * dt;
  for (const e of enemies) for (const o of enemies) {   // keep same-lane cars from overlapping
    if (o !== e && o.lane === e.lane && o.y > e.y && o.y - e.y < (o.h + e.h) / 2 + 24) {
      e.y = o.y - (o.h + e.h) / 2 - 24; e.k = Math.min(e.k, o.k);
    }
  }
  enemies = enemies.filter(e => e.y < H + 150);
  moveScenery(dt);

  if (player.x - PW / 2 < RL || player.x + PW / 2 > RR) { crash('YOU LEFT THE ROAD!'); return; }
  for (const e of enemies) {
    if (Math.abs(e.x - player.x) < (e.w + PW) / 2 - 4 && Math.abs(e.y - PY) < (e.h + PH) / 2 - 4) { crash('CRASH!'); return; }
  }
  engineUpdate(); hud();
}
function updateCrash(dt) {
  crashT += dt; shake = Math.max(0, shake - dt * 1.4);
  player.x += player.vx * dt; player.vx *= Math.pow(0.08, dt);
  player.rot += player.spin * dt; player.spin *= Math.pow(0.15, dt);
  if (crashT < 2.2 && Math.random() < 0.5) addPart(player.x + rnd(-10, 10), PY, 's', 0);
  updateParts(dt);
}

/* ---------- drawing ---------- */
function rr(x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
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
  ctx.fillStyle = '#fff'; ctx.fillRect(RL + 4, 0, 4, H); ctx.fillRect(RR - 8, 0, 4, H);
  for (let i = 1; i < 3; i++)
    for (let y = -100 + (roadOff % 100); y < H; y += 100) ctx.fillRect(RL + LW * i - 2, y, 4, 55);
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
  } else {
    ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(x - 14, y - 6, 34, 22);
    ctx.fillStyle = '#6b4a2b'; ctx.fillRect(x - 2, y + 4, 4, 14);
    ctx.fillStyle = '#1f6feb'; rr(x - 17, y - 11, 34, 22, 3); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 10px Arial'; ctx.textAlign = 'center'; ctx.fillText('DEG', x, y + 4);
  }
}
function drawCar(x, y, w, h, col, st, rot, flip) {
  const a = rot + (flip ? Math.PI : 0);
  ctx.save(); ctx.translate(x + 7, y + 9); ctx.rotate(a); ctx.fillStyle = 'rgba(0,0,0,.32)'; rr(-w / 2, -h / 2, w, h, 10); ctx.fill(); ctx.restore();
  ctx.save(); ctx.translate(x, y); ctx.rotate(a);
  if (state !== 'crashed') {
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
  ctx.fillStyle = '#fff7b0'; rr(-w / 2 + 3, -h / 2 + 1, 9, 5, 2); ctx.fill(); rr(w / 2 - 12, -h / 2 + 1, 9, 5, 2); ctx.fill();
  ctx.fillStyle = '#ff1f3d'; rr(-w / 2 + 3, h / 2 - 6, 9, 4, 2); ctx.fill(); rr(w / 2 - 12, h / 2 - 6, 9, 4, 2); ctx.fill();
  ctx.restore();
}
function draw() {
  ctx.save();
  if (shake > 0) { const m = shake * 14; ctx.translate(rnd(-m, m), rnd(-m, m)); }
  drawRoad();
  scenery.forEach(drawScenery);
  enemies.forEach(e => drawCar(e.x, e.y, e.w, e.h, e.col, e.st, 0, true));
  const bob = state === 'menu' ? Math.sin(performance.now() / 200) * 1.5 : 0;
  drawCar(player.x, PY + bob, PW, PH, '#ff2d55', 1, player.rot, false);
  drawParts();
  ctx.restore();
}

/* ---------- input ---------- */
addEventListener('keydown', e => {
  const k = e.key;
  if (k === 'ArrowLeft' || k === 'a' || k === 'A') keys.l = true;
  else if (k === 'ArrowRight' || k === 'd' || k === 'D') keys.r = true;
  else if (k === ' ' || e.code === 'Space') {
    e.preventDefault();
    if (state !== 'playing' && !e.repeat) startGame();
    return;
  }
  else if (k === 'm' || k === 'M') { muted = !muted; if (music) music.muted = muted; return; }
  else return;
  e.preventDefault();
});
addEventListener('keyup', e => {
  const k = e.key;
  if (k === 'ArrowLeft' || k === 'a' || k === 'A') keys.l = false;
  else if (k === 'ArrowRight' || k === 'd' || k === 'D') keys.r = false;
});
addEventListener('blur', () => { keys.l = keys.r = false; });
function hold(id, k) {
  const b = $(id);
  b.addEventListener('pointerdown', e => {
    e.preventDefault(); keys[k] = true; b.classList.add('down');
    try { b.setPointerCapture(e.pointerId); } catch (err) {}
  });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(n =>
    b.addEventListener(n, () => { keys[k] = false; b.classList.remove('down'); }));
}
hold('btnL', 'l'); hold('btnR', 'r');
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
  else { roadSpeed = 220; roadOff += roadSpeed * dt; moveScenery(dt); }
  draw();
  requestAnimationFrame(loop);
}
reset(); hud(); roadSpeed = 220;
requestAnimationFrame(loop);
})();