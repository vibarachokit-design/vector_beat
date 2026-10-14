'use strict';
// ============================================================================
// VECTOR BEAT v4 — juego de saltos sincronizado con la música
// El nivel se lee de level.js (mapa hecho a mano sobre los acentos de la canción).
// Secciones: configuración · arte · audio y reloj · estado · nivel · ritmo y
//            puntaje · física · efectos · dibujo · interfaz · práctica ·
//            calibración · colores del cubo · eventos
// ============================================================================

// ---------------------------------------------------------------- configuración
const canvas = document.getElementById('game'), ctx = canvas.getContext('2d');
const $ = id => document.getElementById(id);
const LEVEL = window.LEVEL;

const BPM = LEVEL.bpm, BEAT = 60 / BPM, OFFSET = LEVEL.offset, END_BEAT = LEVEL.endBeat;
const PLAYER_X = 270, FLOOR = 480, CEIL = 200, RADIUS = 32, MID_Y = (FLOOR + CEIL) / 2;
const SECTION_BEATS = 32, DISTANCES = LEVEL.speeds;
const CHECKPOINTS = [0, 32, 62.5, 95.5];   // dónde reapareces en el modo normal (suelo seguro)

// Física
const JUMP_SPEED = 480, DOUBLE_SPEED = 425, SPRING_SPEED = 650, RING_SPEED = 560;
const GRAVITY_HELD = 1100, GRAVITY = 1450;
const FLY_UP = 1700, FLY_DOWN = 1300, FLY_MAX = 400;
const JUMP_BUFFER = .12;   // s: un toque poco antes de aterrizar igual cuenta
const COYOTE_TIME = .08;   // s: aún puedes saltar justo después de salir de un borde
const HIT_RADIUS = 26;     // radio de choque del personaje (el dibujo mide 32)
const SPRING_BOOST = .55;  // s de impulso alto tras el trampolín
const RING_REACH = 46;     // distancia para activar un anillo
const RESPAWN_DELAY = .45, PRACTICE_DELAY = .3;

// Ventanas de calificación (segundos respecto al pulso marcado)
const WIN_PERFECT = .065, WIN_GOOD = .12, WIN_OK = .2;
const JUDGE = {
  perfect: {label: '¡Perfecto!', color: '#3f9d86', points: 100, weight: 1,   freq: 988},
  good:    {label: 'Bien',       color: '#6f8fc9', points: 60,  weight: .7,  freq: 784},
  early:   {label: 'Temprano',   color: '#c08a3e', points: 25,  weight: .35, freq: 587},
  late:    {label: 'Tarde',      color: '#c08a3e', points: 25,  weight: .35, freq: 587},
  miss:    {label: 'Fallo',      color: '#b0548a', points: 0,   weight: 0,   freq: 0},
  bounce:  {label: '¡Boing!',    color: '#c09a48', points: 50,  weight: 1,   freq: 0},
  skip:    {label: '',           color: '#c9a6dd', points: 0,   weight: 0,   freq: 0},  // señal bajo la ruta alta: neutra
};

// ------------------------------------------------------------------ almacenamiento
function load(key, fallback) {
  try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); } catch { return fallback; }
}
function save(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} }
let calib = load('vectorbeat.calib', 0);   // segundos; positivo = el jugador toca tarde
let best = {stars: 0, score: 0, progress: 0, crystals: [false, false, false], attempts: 0, ...load('vectorbeat.best4', {})};
let skinId = load('vectorbeat.skin', 'menta');

// --------------------------------------------------------------------------- arte
const ART_BOUNDS = {platform: [16, 206, 2141, 394], character: [112, 98, 1059, 1058]};
// Cortes del suelo para repetirlo sin deformarlo: tapa izquierda + módulo central + tapa derecha.
const PLATFORM = {top: 206, height: 394, left: [16, 788], mid: [788, 1378], right: [1378, 2157], drawH: 102, drawOffset: 16};
// Hojas animadas de 4 cuadros (coordenadas de sprites.json)
const SHEETS = {
  'cone-sprites': [[84, 167, 377, 417], [627, 167, 377, 417], [1170, 167, 377, 417], [1713, 167, 377, 417]],
  'trampoline-sprites': [[26, 232, 499, 296], [569, 232, 499, 296], [1112, 232, 499, 296], [1655, 232, 499, 296]],
  'fire-sprites': [[59, 65, 455, 571], [602, 65, 455, 571], [1145, 65, 455, 571], [1688, 65, 455, 571]],
  'floating-platform-sprites': [[20, 242, 503, 271], [563, 242, 503, 271], [1106, 242, 503, 271], [1649, 242, 503, 271]],
};
const art = {};
for (const name of ['platform', 'character', 'expressions', ...Object.keys(SHEETS)]) {
  const image = new Image();
  art[name] = {image, ready: false, bounds: ART_BOUNDS[name]};
  image.onload = () => { art[name].ready = true; art[name].bounds ??= [0, 0, image.width, image.height]; };
  image.src = name + '.png';
}
function sprite(name, x, y, w, h) {
  const a = art[name]; if (!a.ready) return false;
  ctx.drawImage(a.image, ...a.bounds, x, y, w, h); return true;
}
function frameOf(name, index, x, y, w, h) {
  const a = art[name]; if (!a.ready) return false;
  const f = SHEETS[name][((Math.floor(index) % 4) + 4) % 4];
  ctx.drawImage(a.image, ...f, x, y, w, h); return true;
}
// Dibuja un cuadro respetando su proporción, apoyado en (cx, bottom)
function frameAt(name, index, cx, bottom, h) {
  const f = SHEETS[name][0], w = h * f[2] / f[3];
  return frameOf(name, index, cx - w / 2, bottom - h, w, h);
}
function face(which, x = -39, y = -39, w = 78, h = 78) {
  const a = art.expressions; if (!a.ready) return sprite('character', x, y, w, h);
  const cell = a.image.width / 3;
  ctx.drawImage(a.image, cell * which, 0, cell, a.image.height, x, y, w, h); return true;
}

// ---------------------------------------------------------------- audio y reloj
const song = new Audio('music.mp3');
song.preload = 'auto'; song.volume = .65;
let audioContext;
function audio() {
  try { audioContext ??= new (window.AudioContext || window.webkitAudioContext)(); if (audioContext.state === 'suspended') audioContext.resume(); return audioContext; } catch { return null; }
}
function tone(freq, duration = .13, volume = .025, when = 0) {
  if (!sound || !freq) return;
  const ac = audio(); if (!ac) return;
  try {
    const start = when || ac.currentTime;
    const osc = ac.createOscillator(), gain = ac.createGain();
    osc.frequency.value = freq; osc.connect(gain); gain.connect(ac.destination);
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(.001, start + duration);
    osc.start(start); osc.stop(start + duration);
  } catch {}
}

// song.currentTime se actualiza a saltos en algunos navegadores (Firefox, móviles).
// Interpolamos con el reloj del sistema entre actualizaciones para un movimiento suave.
let rawLast = -1, rawPerf = 0;
function syncClock() { rawLast = song.currentTime; rawPerf = performance.now(); }
function songClock(now = performance.now()) {
  const raw = song.currentTime;
  if (raw !== rawLast) { rawLast = raw; rawPerf = now; }
  if (song.paused) return raw;
  return raw + Math.min(.25, Math.max(0, (now - rawPerf) / 1000) * song.playbackRate);
}

function beatAt(t) { return Math.max(0, (t - OFFSET) / BEAT); }
function timeAt(b) { return OFFSET + b * BEAT; }
function distanceAt(b) {
  b = Math.max(0, b); let distance = 0;
  for (let i = 0; i < 4; i++) distance += Math.max(0, Math.min(SECTION_BEATS, b - i * SECTION_BEATS)) * DISTANCES[i];
  return distance;
}
function sectionAt(b) { return Math.min(3, Math.floor(Math.max(0, b) / SECTION_BEATS)); }
const at = b => PLAYER_X + distanceAt(b);

// -------------------------------------------------------------------------- estado
let state = 'menu', sound = true, held = false, practice = false;
let y = FLOOR - RADIUS, vy = 0, grounded = true, world = 0;
let mode = 'run', grav = 1;   // mode: 'run' o 'fly' · grav: 1 normal, -1 corriendo por el techo
let lives = 3, notes = 0, bonusNotes = 0, musicTime = 0, animTime = 0, lastFrame = 0;
let reaction = 0, reactionKind = '', inv = 0, landing = 0, celebrate = 0, springBoost = 0;
let seekPending = false, checkpointBeat = 0, errorText = '', winning = false, maxReachedBeat = 0;
let jumpQueued = null, lastGroundT = 0, jumpsUsed = 0, route = null;  // route: {from, to} en pulsos tras un trampolín
let particles = [], floaters = [], trail = [];
let platforms = [], gems = [], obstacles = [], jumpCues = [], trampolines = [], rings = [], portals = [], crystals = [], flyZones = [];
let score = 0, combo = 0, stats = newStats(), checkpoint = null, attempts = 0, runCrystals = [false, false, false];
let practicePoints = [];  // puntos de control del modo práctica

function newStats() { return {perfect: 0, good: 0, early: 0, late: 0, miss: 0, bounce: 0, maxCombo: 0, hurts: 0}; }

// --------------------------------------------------------------------------- nivel
function flyPath(b, zone) {  // altura ideal del vuelo (las notas siguen esta curva)
  return MID_Y - 80 * Math.sin(Math.PI * (b - zone.from) / 2);
}
function inZone(b, kindOn, kindOff) {
  let on = false;
  for (const p of portals) { if (p.b > b) break; if (p.kind === kindOn) on = true; if (p.kind === kindOff) on = false; }
  return on;
}

function makeLevel() {
  platforms = []; obstacles = []; gems = []; jumpCues = []; trampolines = []; rings = []; portals = []; crystals = []; flyZones = [];
  const gaps = [], cgaps = [];
  const sec = b => sectionAt(b);
  const cue = (beat, extra = {}) => jumpCues.push({beat, x: at(beat), result: null, ...extra});
  const spike = (beat, height, extra = {}) => obstacles.push({x: at(beat), y: FLOOR, height, ...extra});
  const shard = (beat, height) => obstacles.push({x: at(beat), y: CEIL, height, kind: 'shard', ceil: true});
  const gem = (beat, gy, extra = {}) => gems.push({x: at(beat), y: gy, taken: false, ...extra});
  const mirror = gy => FLOOR + CEIL - gy;  // altura equivalente cuando corres por el techo

  for (const p of LEVEL.events.filter(e => e.t === 'portal')) portals.push({b: p.b, x: at(p.b), kind: p.kind, done: false});
  portals.sort((a, b) => a.b - b.b);

  for (const e of LEVEL.events) {
    const b = e.b;
    switch (e.t) {
      case 'jump':
        cue(b, {double: e.obs === 'three'});
        if (e.obs === 'gap') gaps.push({start: at(b + .4), end: at(b + .94)});
        else {
          spike(b + .5, sec(b) === 0 ? 42 : 50);
          if (e.obs === 'two' || e.obs === 'three') spike(b + .76, 42);
          if (e.obs === 'three') { spike(b + 1.02, 56); cue(b + .5, {air: true, double: true}); }
        }
        gem(b + .66, FLOOR - 147);
        break;
      case 'double':
        cue(b, {double: true}); cue(b + .5, {air: true, double: true});
        gaps.push({start: at(b + .4), end: at(b + 1.65)});
        platforms.push({x: at(b + 1.2), w: distanceAt(b + 1.96) - distanceAt(b + 1.2), y: 420, floating: true});
        gem(b + 1.1, 295);
        break;
      case 'ring':
        cue(b); cue(b + .5, {ring: true});
        rings.push({b: b + .5, x: at(b + .5), y: 360, used: false});
        gaps.push({start: at(b + .4), end: at(b + 1.75)});
        gem(b + 1.15, 250);
        break;
      case 'spring': {
        trampolines.push({x: at(b), y: FLOOR, usedAt: -10, beat: b});
        cue(b, {spring: true});
        platforms.push(
          {x: at(b + .83), w: distanceAt(b + 1.58) - distanceAt(b + .83), y: 340, floating: true, route: true},
          {x: at(b + 1.63), w: distanceAt(b + 2.48) - distanceAt(b + 1.63), y: 370, floating: true, route: true},
          {x: at(b + 2.52), w: distanceAt(b + 3.1) - distanceAt(b + 2.52), y: 395, floating: true, route: true},
        );
        for (const q of [.96, 1.3, 1.93, 2.28, 2.83]) gem(b + q, q < 1.6 ? 282 : q < 2.5 ? 312 : 340, {bonus: true});
        break;
      }
      case 'cjump':
        cue(b, {ceil: true});
        shard(b + .5, 48); if (e.obs === 'two') shard(b + .76, 42);
        gem(b + .66, mirror(FLOOR - 147));
        break;
      case 'cring':
        cue(b, {ceil: true}); cue(b + .5, {ring: true, ceil: true});
        rings.push({b: b + .5, x: at(b + .5), y: mirror(360), used: false, ceil: true});
        cgaps.push({start: at(b + .4), end: at(b + 1.75)});
        gem(b + 1.15, mirror(250));
        break;
      case 'fly': {
        const zone = {from: e.from, to: e.to}; flyZones.push(zone);
        // Columnas alternadas: suelo cuando la ruta va arriba, techo cuando va abajo
        for (let k = 1, i = 0; e.from + k < e.to; k += 2, i++) {
          const pb = e.from + k, top = i % 2 === 0;
          obstacles.push({x: at(pb), y: top ? FLOOR : CEIL, height: 140, kind: 'pillar', ceil: !top});
        }
        for (let q = e.from + .5; q < e.to; q += 1) gem(q, flyPath(q, zone));
        break;
      }
      case 'secretRing':
        rings.push({b, x: at(b), y: inZone(b, 'flip', 'unflip') ? CEIL + RADIUS : FLOOR - RADIUS, used: false, secret: true});
        break;
      case 'crystal':
        crystals.push({x: at(b), y: e.y, i: crystals.length, taken: false});
        break;
    }
  }
  // Notas bajas en los pulsos tranquilos (fuera de los tramos especiales)
  for (let b = 4; b < END_BEAT - 2; b += 4) {
    if (jumpCues.some(c => Math.abs(c.beat - b) < 1.2) || inZone(b, 'fly', 'land') || inZone(b, 'flip', 'unflip')) continue;
    gem(b + .5, FLOOR - 55);
  }

  // Suelo continuo con huecos reales
  gaps.sort((a, b) => a.start - b.start);
  let start = 0;
  for (const gap of gaps) { platforms.push({x: start, w: gap.start - start, y: FLOOR}); start = gap.end; }
  platforms.push({x: start, w: at(END_BEAT) + 1100 - start, y: FLOOR});
  // Techo en los tramos de vuelo y de gravedad invertida
  const ceilSpans = [];
  for (const [on, off] of [['flip', 'unflip'], ['fly', 'land']]) {
    for (const p of portals.filter(p => p.kind === on)) {
      const end = portals.find(q => q.kind === off && q.b > p.b);
      if (end) ceilSpans.push([at(p.b - .6), at(end.b + .3)]);
    }
  }
  for (const [s, e] of ceilSpans) {
    let x = s;
    for (const g of cgaps.filter(g => g.start > s && g.end < e).sort((a, b) => a.start - b.start)) { platforms.push({x, w: g.start - x, y: CEIL, ceil: true}); x = g.end; }
    platforms.push({x, w: e - x, y: CEIL, ceil: true});
  }
  platforms.sort((a, b) => a.y - b.y);  // primero las más altas: se aterriza en la de arriba

  // Tipos de obstáculo del suelo y su forma de choque
  obstacles.sort((a, b) => a.x - b.x);
  let n = 0;
  for (const o of obstacles) {
    if (!o.kind) {
      o.kind = ['cone', 'rock', 'cone', 'fire'][n++ % 4];
      if (o.kind === 'rock') o.height = Math.min(o.height, 46);
      if (o.kind === 'fire') o.height = 52;
    }
    o.hull = hullFor(o);
  }
  gems.sort((a, b) => a.x - b.x); jumpCues.sort((a, b) => a.beat - b.beat); rings.sort((a, b) => a.b - b.b);
}

function hullFor(o) {  // contorno en puntos relativos a la base (dy negativo = hacia arriba)
  const pts = [], h = o.height;
  if (o.kind === 'rock') {
    for (let i = 0; i <= 12; i++) { const a = Math.PI * i / 12; pts.push([Math.cos(a) * 22, -Math.sin(a) * h]); }
  } else if (o.kind === 'pillar') {
    for (let i = 0; i <= 10; i++) { const f = i / 10; pts.push([-22, -h * f], [22, -h * f], [-22 + 44 * f, -h]); }
  } else {
    const half = o.kind === 'fire' ? 17 : o.kind === 'shard' ? 16 : 18, top = o.kind === 'fire' ? h - 6 : h;
    for (let i = 0; i <= 8; i++) { const f = i / 8; pts.push([-half * f, -top * (1 - f)], [half * f, -top * (1 - f)]); }
  }
  return o.ceil ? pts.map(([dx, dy]) => [dx, -dy]) : pts;
}

// --------------------------------------------------------------- ritmo y puntaje
function multiplier() { return 1 + Math.min(3, Math.floor(combo / 8)); }
function addCombo() { combo++; stats.maxCombo = Math.max(stats.maxCombo, combo); if (combo % 8 === 0 && multiplier() > 1) floatText(`×${multiplier()}`, '#754e95', .9, -34); }

// kind: 'ground' (salto normal), 'air' (doble salto), 'ring' (anillo)
function cueKind(c) { return c.ring ? 'ring' : c.air ? 'air' : 'ground'; }
function judgeJump(pressT, kind) {
  const p = pressT - calib;
  let cue = null, d = Infinity;
  for (const c of jumpCues) {
    if (c.result || cueKind(c) !== kind) continue;
    const delta = p - timeAt(c.beat);
    if (Math.abs(delta) < Math.abs(d)) { d = delta; cue = c; }
    if (delta < -WIN_OK) break;
  }
  if (!cue || Math.abs(d) > WIN_OK) return;  // salto libre: ni premia ni castiga
  const res = Math.abs(d) <= WIN_PERFECT ? 'perfect' : Math.abs(d) <= WIN_GOOD ? 'good' : d < 0 ? 'early' : 'late';
  cue.result = res; cue.offset = d;
  stats[res]++; addCombo();
  score += JUDGE[res].points * multiplier();
  const label = res === 'perfect' && kind === 'air' ? '¡Doble perfecto!' : res === 'perfect' && kind === 'ring' ? '¡Anillo perfecto!' : JUDGE[res].label;
  floatText(label, JUDGE[res].color, res === 'perfect' ? 1.15 : 1);
  tone(JUDGE[res].freq, .07, .012);
}

function checkMisses(t) {
  for (const c of jumpCues) {
    if (c.result) continue;
    const ct = timeAt(c.beat);
    if (ct > t) break;
    if (t - calib > ct + WIN_OK && route && c.beat > route.from && c.beat < route.to && y < FLOOR - RADIUS - 30) { c.result = 'skip'; continue; }
    if (t - calib > ct + WIN_OK) { c.result = 'miss'; stats.miss++; combo = 0; floatText(JUDGE.miss.label, JUDGE.miss.color, .9); }
  }
}

function takeSnapshot() { checkpoint = {beat: checkpointBeat, score, stats: {...stats}}; }

// Precisión: señales acertadas ponderadas / señales jugadas (un rebote en trampolín cuenta como acierto)
function accuracy() {
  let sum = 0, total = 0;
  for (const c of jumpCues) {
    if (!c.result || c.result === 'skip') continue;
    total++; sum += JUDGE[c.result].weight;
  }
  return total ? sum / total : 0;
}
function starRating(win) {
  if (!win || practice) return 0;
  const noteFrac = gems.length ? notes / gems.length : 0, acc = accuracy();
  if (noteFrac >= .85 && acc >= .8 && lives >= 2) return 3;
  if (noteFrac >= .6 && acc >= .6) return 2;
  return 1;
}

// --------------------------------------------------------------------------- física
function hitsObstacle(o) {
  const ox = o.x - world;
  if (Math.abs(ox - PLAYER_X) > HIT_RADIUS + 24) return false;
  const r2 = HIT_RADIUS * HIT_RADIUS;
  for (const [dx, dy] of o.hull) if ((ox + dx - PLAYER_X) ** 2 + (o.y + dy - y) ** 2 < r2) return true;
  return false;
}
const overX = p => PLAYER_X + world >= p.x && PLAYER_X + world <= p.x + p.w;

// Distancia hasta la superficie hacia donde te lleva la gravedad (Infinity si no hay)
function distToSurface() {
  let d = Infinity;
  for (const p of platforms) {
    if (!overX(p)) continue;
    if (grav > 0 && !p.ceil && p.y >= y + RADIUS - 2) d = Math.min(d, p.y - (y + RADIUS));
    if (grav < 0 && p.ceil && p.y <= y - RADIUS + 2) d = Math.min(d, (y - RADIUS) - p.y);
  }
  return d;
}

function ringInReach() {
  for (const r of rings) {
    if (r.used) continue;
    const dx = r.x - world - PLAYER_X;
    if (dx > 120) break;
    if (Math.hypot(dx, r.y - y) < RING_REACH) return r;
  }
  return null;
}
function ringAhead(t) {  // un anillo a punto de alcanzarse: espera en lugar de gastar el doble salto
  const speed = DISTANCES[sectionAt(beatAt(t))] / BEAT;
  for (const r of rings) {
    if (r.used) continue;
    const dx = r.x - world - PLAYER_X;
    if (dx > 0 && dx < speed * .09 + RING_REACH && Math.abs(r.y - y) < RING_REACH * 1.6) return true;
  }
  return false;
}

function tryJump(t) {
  if (jumpQueued === null || t < jumpQueued) return;
  if (mode === 'fly') { jumpQueued = null; return; }
  const pressT = jumpQueued;
  const coyote = jumpsUsed === 0 && t - lastGroundT <= COYOTE_TIME && vy * grav >= 0;
  if (grounded || coyote) {                       // salto desde el suelo (o el techo)
    jumpQueued = null; vy = -JUMP_SPEED * grav; grounded = false; jumpsUsed = 1; springBoost = 0;
    tone(440, .09, .012);
    judgeJump(pressT, 'ground');
    return;
  }
  const ring = ringInReach();
  if (ring) {                                     // anillo de ritmo: impulso sin gastar el doble salto
    ring.used = true; jumpQueued = null; vy = -RING_SPEED * grav; springBoost = .25;
    tone(1046, .12, .02); burst(ring.x, ring.y, 16);
    if (ring.secret) floatText('¡Anillo secreto!', '#9a6fc0', 1);
    else judgeJump(pressT, 'ring');
    return;
  }
  // Si está a punto de aterrizar o de tocar un anillo, guardamos el toque.
  const landingSoon = vy * grav > 0 && distToSurface() / Math.abs(vy) <= JUMP_BUFFER;
  if (!landingSoon && !ringAhead(t) && jumpsUsed < 2) {   // doble salto
    const second = jumpsUsed === 1;
    jumpQueued = null; vy = -(second ? DOUBLE_SPEED : JUMP_SPEED) * grav; jumpsUsed = 2; springBoost = 0;
    tone(659, .09, .018); burst(world + PLAYER_X, y, 9);
    judgeJump(pressT, second ? 'air' : 'ground');
    return;
  }
  if (t - pressT > JUMP_BUFFER) jumpQueued = null;
}

function applyPortal(p, silent = false) {
  p.done = true;
  if (p.kind === 'flip') { grav = -1; grounded = false; jumpsUsed = 1; }
  if (p.kind === 'unflip') { grav = 1; grounded = false; jumpsUsed = 1; }
  if (p.kind === 'fly') { mode = 'fly'; grounded = false; vy *= .4; jumpQueued = null; }
  if (p.kind === 'land') { mode = 'run'; grounded = false; jumpsUsed = 1; }
  if (silent) return;
  const label = {speed: '¡Más rápido!', flip: '¡Gravedad invertida!', unflip: 'Gravedad normal', fly: '¡A volar! Mantén para subir', land: 'De vuelta al suelo'}[p.kind];
  floatText(label, '#754e95', .9, -34); tone(p.kind === 'speed' ? 1175 : 523, .2, .02);
}

function physics(dt, t) {
  musicTime = t;
  const beat = beatAt(t);
  world = distanceAt(beat); maxReachedBeat = Math.max(maxReachedBeat, beat);
  if (!practice) {
    const cp = CHECKPOINTS.filter(c => c <= beat).pop();
    if (cp > checkpointBeat) { checkpointBeat = cp; takeSnapshot(); }
  }
  inv = Math.max(0, inv - dt); landing = Math.max(0, landing - dt); springBoost = Math.max(0, springBoost - dt);
  for (const p of portals) { if (p.b > beat) break; if (!p.done) applyPortal(p); }

  const old = y, wasGrounded = grounded;
  if (mode === 'fly') {
    jumpQueued = null;
    vy = Math.max(-FLY_MAX, Math.min(FLY_MAX, vy + (held ? -FLY_UP : FLY_DOWN) * dt));
    y += vy * dt; grounded = false;
    if (y + RADIUS > FLOOR) { y = FLOOR - RADIUS; vy = Math.min(0, vy); }
    if (y - RADIUS < CEIL) { y = CEIL + RADIUS; vy = Math.max(0, vy); }
  } else {
    tryJump(t);
    const against = vy * grav < 0;  // subiendo contra la gravedad
    vy += ((held || springBoost > 0) && against ? GRAVITY_HELD : GRAVITY) * grav * dt;
    y += vy * dt; grounded = false;
    for (const p of platforms) {
      if (!overX(p)) continue;
      const land = grav > 0
        ? !p.ceil && vy >= 0 && old + RADIUS <= p.y + 2 && y + RADIUS >= p.y
        : p.ceil && vy <= 0 && old - RADIUS >= p.y - 2 && y - RADIUS <= p.y;
      if (land) {
        y = p.y - RADIUS * grav; if (!wasGrounded) landing = .17;
        vy = 0; grounded = true; lastGroundT = t; jumpsUsed = 0; break;
      }
    }
    if (grounded) tryJump(t);  // un toque guardado justo antes de aterrizar salta en el mismo instante
  }

  for (const o of obstacles) { if (o.x - world > PLAYER_X + 60) break; if (hitsObstacle(o)) { hurt('ouch'); break; } }
  if (state !== 'playing') return;

  if (mode === 'run' && grav > 0) for (const pad of trampolines) {
    if (grounded && t - pad.usedAt > 1.2 && Math.abs(pad.x - world - PLAYER_X) < 26) {
      pad.usedAt = t; route = {from: pad.beat, to: pad.beat + 3.1}; vy = -SPRING_SPEED; grounded = false; jumpsUsed = 1; springBoost = SPRING_BOOST;
      const c = jumpCues.find(c => c.beat === pad.beat);
      if (c && !c.result) { c.result = 'bounce'; stats.bounce++; addCombo(); score += JUDGE.bounce.points * multiplier(); }
      floatText('¡Boing! Ruta alta', '#c09a48', 1);
      tone(880, .18, .025); burst(pad.x, pad.y - 10, 14);
      break;
    }
  }
  if (y > 565 || y < CEIL - 160) { hurt('fall'); return; }

  for (const n of gems) if (!n.taken && Math.abs(n.x - world - PLAYER_X) < 39 && Math.abs(n.y - y) < 45) {
    n.taken = true; notes++; if (n.bonus) bonusNotes++;
    burst(n.x, n.y); tone([659, 784, 880, 987][notes % 4], .08, .009);
  }
  for (const c of crystals) if (!c.taken && Math.abs(c.x - world - PLAYER_X) < 40 && Math.abs(c.y - y) < 42) {
    c.taken = true; if (!practice) runCrystals[c.i] = true;
    burst(c.x, c.y, 30); tone(1318, .3, .03); tone(1760, .3, .02, (audioContext?.currentTime ?? 0) + .1);
    floatText(practice ? 'Cristal (en práctica no se guarda)' : `¡Cristal secreto ${c.i + 1}/3!`, '#5b7fd6', 1.1);
  }
  trail.push({x: world + PLAYER_X, y, life: .3});
  for (const p of trail) p.life -= dt;
  trail = trail.filter(p => p.life > 0);
  checkMisses(t);
  animateParticles(dt);
  if (practice) autoPracticePoint(beat);  // al final del paso, con el estado ya resuelto
  if (beat >= END_BEAT) victory();
}

function updateFromMusic(now) {
  if (seekPending || song.paused) return;
  const target = songClock(now);
  if (target < musicTime - .12) { musicTime = target; world = distanceAt(beatAt(target)); return; }
  const elapsed = target - musicTime;
  if (elapsed <= 0) return;
  const steps = Math.max(1, Math.ceil(elapsed / (1 / 120))), step = elapsed / steps;
  for (let i = 0; i < steps && state === 'playing'; i++) physics(step, musicTime + step);
}

// ----------------------------------------------------------------------- efectos
function burst(x, y, amount = 12, confetti = false) {
  for (let i = 0; i < amount; i++) particles.push({
    x: x + (confetti ? (Math.random() - .5) * 700 : 0), y: y + (confetti ? Math.random() * 150 : 0),
    vx: (Math.random() - .5) * (confetti ? 180 : 120), vy: confetti ? 90 + Math.random() * 130 : (Math.random() - .5) * 120,
    life: confetti ? 3 : 1, r: 3 + Math.random() * 4,
    color: confetti ? ['#f2a7bf', '#8ed3bd', '#ffe29a', '#bda5df'][i % 4] : '#fff3ac', confetti,
  });
}
function animateParticles(dt) {
  for (const p of particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
  particles = particles.filter(p => p.life > 0);
}
function floatText(text, color, size = 1, dy = 0) {
  floaters = floaters.filter(f => f.dy !== dy);  // un texto reemplaza al anterior en su línea
  floaters.push({text, color, size, dy, life: .75});
}

// Intensidad de los acentos de la canción en este instante (0 a ~1)
function accentAt(beat) {
  let v = 0;
  for (const [b, power] of LEVEL.accents) { const d = beat - b; if (d >= 0 && d < 1) v = Math.max(v, power * Math.exp(-d * 6)); }
  return v;
}
// Paleta del tramo, con transición suave durante el primer pulso
function hexMix(a, b, f) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = s => Math.round(((pa >> s) & 255) * (1 - f) + ((pb >> s) & 255) * f);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}
function paletteAt(beat) {
  const s = sectionAt(beat), cur = LEVEL.sections[s], prev = LEVEL.sections[Math.max(0, s - 1)];
  const f = Math.min(1, (beat - s * SECTION_BEATS) / 1.2);
  return {sky: cur.sky.map((c, i) => hexMix(prev.sky[i], c, f)), aurora: cur.aurora.map((c, i) => hexMix(prev.aurora[i], c, f))};
}

// -------------------------------------------------------------------------- dibujo
function roundRect(x, y, w, h, r, color) { ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill(); }

function drawGround(left, w, top) {
  if (left + w < -10 || left > 1290) return;
  const a = art.platform;
  if (!a.ready) { roundRect(left, top, w, 32, 10, '#ffecd9'); roundRect(left, top + 4, w, 5, 3, '#83cdbd'); return; }
  const P = PLATFORM, s = P.drawH / P.height, dy = top - P.drawOffset, img = a.image;
  const slice = (src, sw, dx, dw) => ctx.drawImage(img, src, P.top, sw, P.height, dx, dy, dw, P.drawH);
  const lw = (P.left[1] - P.left[0]) * s, rw = (P.right[1] - P.right[0]) * s, mw = (P.mid[1] - P.mid[0]) * s;
  if (w < lw + rw) {  // tramo corto: mitad de cada tapa, recortada (no aplastada)
    const half = w / 2;
    slice(P.left[0], half / s, left, half);
    slice(P.right[1] - half / s, half / s, left + half, half);
    return;
  }
  slice(P.left[0], P.left[1] - P.left[0], left, lw);
  slice(P.right[0], P.right[1] - P.right[0], left + w - rw, rw);
  const span = w - lw - rw; if (span <= 0) return;
  const n = Math.max(1, Math.round(span / mw)), dw = span / n, x0 = left + lw;
  for (let j = Math.max(0, Math.floor(-x0 / dw) - 1); j < n; j++) {
    const x = x0 + j * dw; if (x > 1290) break;
    slice(P.mid[0], P.mid[1] - P.mid[0], x - .5, dw + 1);
  }
}
function drawCeiling(left, w) {  // el mismo suelo, reflejado
  if (left + w < -10 || left > 1290) return;
  ctx.save(); ctx.translate(0, 2 * CEIL); ctx.scale(1, -1); drawGround(left, w, CEIL); ctx.restore();
}

function drawFloating(p, left, beat) {
  if (left + p.w < -10 || left > 1290) return;
  const f = SHEETS['floating-platform-sprites'][0], h = p.w * f[3] / f[2];
  if (!frameOf('floating-platform-sprites', beat * 2 + (p.route ? 2 : 0), left, p.y - h * .06, p.w, h)) {
    roundRect(left, p.y, p.w, 26, 10, '#ffecd9'); roundRect(left, p.y + 4, p.w, 5, 3, '#c9a6dd');
  }
}

function drawShard(x, base, h, dir) {  // cristal colgante (dir 1 hacia abajo desde el techo)
  const g = ctx.createLinearGradient(x - 16, base, x + 16, base + h * dir);
  g.addColorStop(0, '#d9e4ff'); g.addColorStop(.5, '#a9b8f0'); g.addColorStop(1, '#c6a3e6');
  ctx.fillStyle = g; ctx.beginPath();
  ctx.moveTo(x - 17, base); ctx.lineTo(x - 6, base + h * .55 * dir); ctx.lineTo(x, base + h * dir); ctx.lineTo(x + 7, base + h * .5 * dir); ctx.lineTo(x + 17, base);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#ffffffaa'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - 4, base + 4 * dir); ctx.lineTo(x, base + h * .8 * dir); ctx.stroke();
}
function drawPillar(o, x) {
  const top = o.ceil ? o.y : o.y - o.height, g = ctx.createLinearGradient(x - 22, 0, x + 22, 0);
  g.addColorStop(0, '#c9d3fb'); g.addColorStop(.5, '#e8eeff'); g.addColorStop(1, '#a7b4ea');
  ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(x - 22, top, 44, o.height, 12); ctx.fill();
  ctx.fillStyle = '#ffffff99'; ctx.fillRect(x - 12, top + 10, 5, o.height - 20);
  drawShard(x, o.ceil ? o.y + o.height - 2 : o.y - o.height + 2, 18, o.ceil ? 1 : -1);
}

function drawObstacle(o, x, beat) {
  const base = o.y, h = o.height, phase = beat % 1;
  if (o.kind === 'shard') return drawShard(x, base, h, 1);
  if (o.kind === 'pillar') return drawPillar(o, x);
  if (o.kind === 'cone') {
    // Los conos «bailan» todos juntos: se aplastan en el pulso y se estiran después
    const index = [1, 2, 3, 0][Math.floor(phase * 4)];
    if (frameAt('cone-sprites', index, x, base + 3, h * 1.12)) return;
  }
  if (o.kind === 'fire' && frameAt('fire-sprites', beat * 8 + (o.x % 4), x, base + 4, h * 1.18)) return;
  if (o.kind === 'cone') {
    ctx.fillStyle = '#e38dac'; ctx.beginPath(); ctx.moveTo(x - 20, base); ctx.lineTo(x, base - h); ctx.lineTo(x + 20, base); ctx.closePath(); ctx.fill();
    roundRect(x - 25, base - 5, 50, 9, 5, '#bb7c9d');
  } else if (o.kind === 'rock') {
    const color = ctx.createLinearGradient(x - 23, base - h, x + 23, base);
    color.addColorStop(0, '#c1b1c8'); color.addColorStop(1, '#837a96');
    ctx.fillStyle = color; ctx.beginPath();
    ctx.moveTo(x - 24, base - 4);
    ctx.quadraticCurveTo(x - 29, base - h * .5, x - 13, base - h + 6);
    ctx.quadraticCurveTo(x + 3, base - h - 6, x + 20, base - h * .65);
    ctx.quadraticCurveTo(x + 29, base - 12, x + 22, base - 2);
    ctx.quadraticCurveTo(x, base + 5, x - 24, base - 4);
    ctx.fill();
    ctx.strokeStyle = '#d9cfde'; ctx.lineWidth = 2; ctx.beginPath();
    ctx.moveTo(x - 16, base - h * .55); ctx.lineTo(x - 1, base - h * .78); ctx.lineTo(x + 11, base - h * .55); ctx.stroke();
  } else {
    const flicker = Math.sin(beat * Math.PI * 4 + o.x) * 3;
    ctx.fillStyle = '#e89675'; ctx.beginPath();
    ctx.moveTo(x - 18, base - 8);
    ctx.bezierCurveTo(x - 25, base - 26, x - 8, base - 33, x - 3, base - h + flicker);
    ctx.bezierCurveTo(x + 9, base - 39, x + 10, base - 24, x + 18, base - 14);
    ctx.quadraticCurveTo(x + 16, base, x - 18, base - 8); ctx.fill();
  }
}

function drawTrampoline(pad, x, beat) {
  const age = musicTime - pad.usedAt;
  const index = age >= 0 && age < .08 ? 1 : age >= .08 && age < .25 ? 2 : age >= .25 && age < .43 ? 3 : 0;
  ctx.textAlign = 'center';
  if (frameAt('trampoline-sprites', index, x, pad.y + 4, 44)) {
    ctx.fillStyle = '#8b659c'; ctx.font = 'bold 18px Trebuchet MS';
    ctx.fillText('↟', x, pad.y - 48 - Math.sin(beat * Math.PI * 2) * 2);
  } else {
    ctx.fillStyle = '#e4bf75'; ctx.beginPath(); ctx.ellipse(x, pad.y - 10, 30, 8, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#8b659c'; ctx.font = 'bold 17px Trebuchet MS'; ctx.fillText('↟', x, pad.y - 24);
  }
  ctx.textAlign = 'start';
}

function drawRing(r, x, beat, pulse) {
  ctx.save(); ctx.translate(x, r.y);
  const s = r.used ? 1 + Math.min(1, (musicTime - timeAt(r.b)) * 3) : 1 + pulse * .12;
  ctx.globalAlpha = r.used ? Math.max(0, 1 - (musicTime - timeAt(r.b)) * 3) : r.secret ? .55 + .2 * Math.sin(beat * Math.PI) : 1;
  ctx.scale(s, s);
  ctx.lineWidth = 7; ctx.strokeStyle = r.secret ? '#c9a6dd' : '#f2c46b'; ctx.beginPath(); ctx.arc(0, 0, 26, 0, 7); ctx.stroke();
  ctx.lineWidth = 3; ctx.strokeStyle = '#fff8e6'; ctx.beginPath(); ctx.arc(0, 0, 26, 0, 7); ctx.stroke();
  ctx.fillStyle = r.secret ? '#c9a6dd55' : '#ffe9b055'; ctx.beginPath(); ctx.arc(0, 0, 20, 0, 7); ctx.fill();
  ctx.restore(); ctx.globalAlpha = 1;
}

function drawPortal(p, x, pulse) {
  const style = {speed: ['#7fd0bd', '»'], flip: ['#b08ac6', '⇅'], unflip: ['#b08ac6', '⇅'], fly: ['#8fb4f0', '≋'], land: ['#e9a77f', '▁']}[p.kind];
  ctx.save(); ctx.translate(x, MID_Y + 20);
  ctx.globalAlpha = .9;
  ctx.strokeStyle = '#fff6e0'; ctx.lineWidth = 14; ctx.beginPath(); ctx.ellipse(0, 0, 30 + pulse * 2, 120 + pulse * 3, 0, 0, 7); ctx.stroke();
  ctx.strokeStyle = style[0]; ctx.lineWidth = 7; ctx.stroke();
  ctx.fillStyle = style[0] + '40'; ctx.fill();
  ctx.fillStyle = '#5f4470'; ctx.font = 'bold 30px Trebuchet MS'; ctx.textAlign = 'center'; ctx.fillText(style[1], 0, 10);
  ctx.restore();
}

function drawCrystal(c, x, beat) {
  const found = best.crystals[c.i];
  ctx.save(); ctx.translate(x, c.y + Math.sin(beat * Math.PI) * 4); ctx.rotate(Math.sin(beat * Math.PI * .5) * .15);
  ctx.globalAlpha = found ? .45 : 1;
  ctx.shadowColor = '#bcd0ff'; ctx.shadowBlur = 16;
  const g = ctx.createLinearGradient(-14, -20, 14, 20); g.addColorStop(0, '#e9f0ff'); g.addColorStop(.5, '#8fa8f0'); g.addColorStop(1, '#b98ee0');
  ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, -22); ctx.lineTo(15, -4); ctx.lineTo(0, 22); ctx.lineTo(-15, -4); ctx.closePath(); ctx.fill();
  ctx.shadowBlur = 0; ctx.strokeStyle = '#ffffffcc'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-15, -4); ctx.lineTo(15, -4); ctx.moveTo(0, -22); ctx.lineTo(-5, -4); ctx.lineTo(0, 22); ctx.stroke();
  ctx.restore(); ctx.globalAlpha = 1;
}

function drawAurora(beat, colors) {
  if (combo < 6) return;
  const strength = Math.min(.2, .06 + combo * .003);
  for (let band = 0; band < 3; band++) {
    ctx.globalAlpha = strength; ctx.fillStyle = colors[band]; ctx.beginPath();
    for (let x = 0; x <= 1280; x += 32) { const yy = 110 + band * 35 + Math.sin(x * .005 + beat * .12 + band) * 25; x ? ctx.lineTo(x, yy) : ctx.moveTo(x, yy); }
    for (let x = 1280; x >= 0; x -= 32) ctx.lineTo(x, 170 + band * 35 + Math.sin(x * .005 + beat * .12 + band) * 25);
    ctx.closePath(); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawGlider() {  // nube-planeador del modo vuelo
  ctx.fillStyle = '#ffffffee';
  ctx.beginPath(); ctx.ellipse(-6, 34, 40, 11, 0, 0, 7); ctx.ellipse(-26, 30, 18, 12, 0, 0, 7); ctx.ellipse(12, 28, 20, 13, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#c9b4e8'; ctx.beginPath(); ctx.ellipse(-6, 40, 34, 4, 0, 0, 7); ctx.fill();
}

function draw(t) {
  const beat = beatAt(musicTime), pulse = Math.exp(-(beat % 1) * 8), pal = paletteAt(beat);
  const hit = state === 'playing' ? accentAt(beat) : 0;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, 1280, 720);
  const bg = ctx.createLinearGradient(0, 0, 0, 720);
  bg.addColorStop(0, pal.sky[0]); bg.addColorStop(.55, pal.sky[1]); bg.addColorStop(1, pal.sky[2]);
  ctx.fillStyle = bg; ctx.fillRect(0, 0, 1280, 720);
  // Golpe de cámara en los acentos fuertes de la canción
  const zoom = 1 + hit * .018, shake = hit > .6 ? (Math.random() - .5) * 6 * hit : 0;
  ctx.setTransform(zoom, 0, 0, zoom, 640 * (1 - zoom) + shake, 360 * (1 - zoom) + shake);

  drawAurora(beat, pal.aurora);
  ctx.fillStyle = '#fff0c4'; ctx.beginPath(); ctx.arc(1090, 135, 57 + pulse * 3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff5';
  for (let i = 0; i < 4; i++) {
    const x = ((i * 410 - world * .04) % 1700 + 1700) % 1700 - 160, cy = 145 + (i % 2) * 30;
    ctx.beginPath(); ctx.ellipse(x, cy, 90, 18, 0, 0, 7); ctx.ellipse(x + 25, cy - 10, 43, 24, 0, 0, 7); ctx.fill();
  }
  ctx.fillStyle = '#fff4'; ctx.beginPath(); ctx.ellipse(200, 700, 350, 65, 0, 0, 7); ctx.ellipse(960, 720, 460, 80, 0, 0, 7); ctx.fill();

  // Líneas de velocidad tras un portal »
  for (const p of portals) if (p.kind === 'speed' && beat >= p.b && beat < p.b + 2) {
    ctx.globalAlpha = .35 * (1 - (beat - p.b) / 2); ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 14; i++) { const ly = 60 + ((i * 97) % 600), lx = ((i * 211 - animTime * 2400) % 1500 + 1500) % 1500 - 100; ctx.fillRect(lx, ly, 120, 3); }
    ctx.globalAlpha = 1;
  }

  for (const p of platforms) if (!p.floating && !p.ceil) drawGround(p.x - world, p.w, p.y);
  for (const p of platforms) if (p.ceil) drawCeiling(p.x - world, p.w);
  for (const p of platforms) if (p.floating) drawFloating(p, p.x - world, beat);
  if (practice) for (const cp of practicePoints) {
    const x = at(cp.beat) - world; if (x < -20 || x > 1300) continue;
    ctx.fillStyle = '#5fbf9f'; ctx.save(); ctx.translate(x, cp.y); ctx.rotate(Math.PI / 4); ctx.fillRect(-8, -8, 16, 16); ctx.restore();
  }

  // Señales: ↑ salto, ↑↑ doble salto, ◎ anillo, ↟ trampolín. Se colorean según cómo las jugaste.
  ctx.textAlign = 'center'; ctx.font = 'bold 20px Trebuchet MS';
  for (const c of jumpCues) {
    const x = c.x - world; if (x < PLAYER_X - 60 || x > 1300) continue;
    if (c.ring) continue;  // el anillo es su propia señal
    const cy = c.air ? (c.ceil ? CEIL + 160 : FLOOR - 160) : c.ceil ? CEIL - 18 : FLOOR + 18;
    if (c.result === 'skip') continue;
    if (c.result) {
      ctx.globalAlpha = Math.max(0, 1 - (PLAYER_X - x) / 60);
      ctx.fillStyle = JUDGE[c.result].color; ctx.beginPath(); ctx.arc(x, cy, 12, 0, 7); ctx.fill();
      continue;
    }
    if (x < PLAYER_X - 35) continue;
    ctx.globalAlpha = x < PLAYER_X + 280 ? .9 : .42;
    ctx.strokeStyle = c.spring ? '#c09a48' : c.double ? '#ae7aba' : '#519f98'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x, cy, 11 + pulse * 3, 0, 7); ctx.stroke();
    ctx.fillStyle = c.spring ? '#a07a2c' : c.double ? '#92639e' : '#478b86';
    ctx.fillText(c.spring ? '↟' : c.double ? '↑↑' : c.ceil ? '↓' : '↑', x, cy + 7);
  }
  ctx.globalAlpha = 1; ctx.textAlign = 'start';

  for (const p of portals) { const x = p.x - world; if (x > -60 && x < 1340) drawPortal(p, x, pulse); }
  for (const o of obstacles) { const x = o.x - world; if (x > -60 && x < 1340) drawObstacle(o, x, beat); }
  for (const pad of trampolines) { const x = pad.x - world; if (x > -80 && x < 1360) drawTrampoline(pad, x, beat); }
  for (const r of rings) { const x = r.x - world; if (x > -60 && x < 1340) drawRing(r, x, beat, pulse); }
  for (const n of gems) if (!n.taken) {
    const x = n.x - world; if (x < -40 || x > 1320) continue;
    ctx.shadowColor = '#fff3bc'; ctx.shadowBlur = 9; ctx.fillStyle = n.bonus ? '#8a559d' : '#b98726'; ctx.font = 'bold 38px Georgia';
    ctx.fillText('♪', x - 12, n.y + 13 + Math.sin(beat * Math.PI * 2) * 2); ctx.shadowBlur = 0;
  }
  for (const c of crystals) if (!c.taken) { const x = c.x - world; if (x > -40 && x < 1320) drawCrystal(c, x, beat); }

  const portalX = PLAYER_X + distanceAt(END_BEAT) - world;
  if (portalX < 1400) {
    ctx.save(); ctx.translate(portalX, 385);
    ctx.strokeStyle = '#fff2c4'; ctx.lineWidth = 18; ctx.beginPath(); ctx.ellipse(0, 0, 64 + pulse * 2, 98 + pulse * 2, 0, 0, 7); ctx.stroke();
    ctx.strokeStyle = '#b08ac6'; ctx.lineWidth = 8; ctx.stroke(); ctx.fillStyle = '#d4b1df50'; ctx.fill();
    ctx.fillStyle = '#785284'; ctx.font = 'bold 19px Trebuchet MS'; ctx.textAlign = 'center'; ctx.fillText('PORTAL', 0, 137);
    ctx.restore();
  }

  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life)); ctx.fillStyle = p.color;
    if (p.confetti) { ctx.save(); ctx.translate(p.x - world, p.y); ctx.rotate(t * 3 + p.x); ctx.fillRect(-p.r, -p.r, p.r * 2, p.r); ctx.restore(); }
    else { ctx.beginPath(); ctx.arc(p.x - world, p.y, p.r, 0, 7); ctx.fill(); }
  }
  // Estela musical (toma el color del cubo)
  ctx.fillStyle = skin().trail;
  for (let i = 0; i < trail.length; i += 3) {
    const p = trail[i]; ctx.globalAlpha = p.life / .3 * .23;
    ctx.beginPath(); ctx.arc(p.x - world, p.y, 8 + p.life * 24, 0, 7); ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Personaje
  const win = state === 'celebrating' || (state === 'end' && winning);
  const bounce = win ? -Math.abs(Math.sin(celebrate * 5)) * 65 : 0;
  ctx.save();
  ctx.translate(PLAYER_X + (state === 'hurt' && reactionKind === 'ouch' ? Math.sin(t * 65) * 7 : 0), y + bounce);
  if (mode === 'fly' && !win) { ctx.rotate(Math.max(-.35, Math.min(.35, vy * .0009))); drawGlider(); }
  else ctx.rotate(win ? Math.min(1, celebrate / 1.1) * Math.PI * 2 : grounded ? Math.sin(beat * Math.PI * 2) * .025 : Math.max(-.22, Math.min(.22, vy * grav * .0004)));
  if (grav < 0 && !win) ctx.scale(1, -1);
  const squash = landing > 0 ? 1 + landing * .6 : 1; ctx.scale(squash, 1 / squash);
  ctx.globalAlpha = inv > 0 ? .6 + .4 * Math.sin(t * 24) : 1;
  ctx.filter = skinFilter();
  const falling = mode === 'run' && !grounded && vy * grav > 100 && distToSurface() === Infinity;
  if (win) face(2);
  else if (state === 'hurt') face(reactionKind === 'fall' ? 0 : 1);
  else if (falling) face(0);
  else if (!sprite('character', -37, -37, 74, 74)) {
    ctx.fillStyle = '#80cfbb'; ctx.beginPath(); ctx.moveTo(0, -32); ctx.lineTo(32, 0); ctx.lineTo(0, 32); ctx.lineTo(-32, 0); ctx.fill();
  }
  ctx.filter = 'none';
  ctx.restore();

  ctx.textAlign = 'center';
  if (state === 'hurt') { ctx.fillStyle = '#674259'; ctx.font = 'bold 23px Trebuchet MS'; ctx.fillText(reactionKind === 'fall' ? '¡Oooh!' : '¡Auch!', PLAYER_X, y - 62 * grav); }
  // Calificación flotante: sigue al personaje, sin taparlo
  const textY = grav > 0 ? Math.min(352, y - 70) : Math.max(330, y + 90);
  for (const f of floaters) {
    const rise = (1 - f.life / .75) * 26, pop = 1 + Math.max(0, f.life - .6) * 2;
    ctx.globalAlpha = Math.min(1, f.life / .3);
    ctx.font = `900 ${Math.round(26 * f.size * pop)}px Trebuchet MS`;
    ctx.lineWidth = 6; ctx.strokeStyle = '#fff8f0'; ctx.strokeText(f.text, PLAYER_X + 40, textY - rise + f.dy);
    ctx.fillStyle = f.color; ctx.fillText(f.text, PLAYER_X + 40, textY - rise + f.dy);
  }
  ctx.globalAlpha = 1; ctx.textAlign = 'start';
  // Destello en los golpes fuertes
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (hit > .05) { ctx.globalAlpha = hit * .14; ctx.fillStyle = '#fffaf0'; ctx.fillRect(0, 0, 1280, 720); ctx.globalAlpha = 1; }
}

// ------------------------------------------------------------------------ interfaz
function formatScore(n) { return n.toLocaleString('es-CL'); }
const starText = n => '★'.repeat(n) + '☆'.repeat(3 - n);
const crystalText = arr => arr.map(f => f ? '◆' : '◇').join('');
function updateHUD() {
  const b = beatAt(musicTime);
  $('hearts').textContent = practice ? '∞ Práctica' : '♥'.repeat(Math.max(0, lives)) + '♡'.repeat(3 - Math.max(0, lives));
  $('notes').textContent = `♪ ${notes} / ${gems.length}`;
  $('score').textContent = `★ ${formatScore(score)}`;
  $('attempt').textContent = `Intento ${attempts}`;
  $('combo').textContent = combo > 1 ? `×${multiplier()} · ${combo}` : mode === 'fly' ? '≋ vuelo' : `↑ ${2 - jumpsUsed}/2`;
  $('bar').style.width = Math.min(100, b / END_BEAT * 100) + '%';
  const pulse = Math.exp(-(b % 1) * 9);
  $('pulse').style.transform = `scale(${1 + pulse * .18})`;
  $('pulse').style.background = `rgba(128,203,187,${.45 + pulse * .5})`;
  if (state === 'playing') {
    const s = sectionAt(b);
    let label = b < 4 ? `Intento ${attempts} · Prepárate… ${4 - Math.floor(b)}` : `${s + 1} / 4 · ${LEVEL.sections[s].name}`;
    if (practice && b < 4) label = 'Práctica · «◆ Punto» (o C) guarda tu posición';
    else if (b >= 4 && b < 8) label = 'Salta justo cuando la señal ↑ llegue a ti';
    if (b >= 17 && b < 20) label = 'No saltes en ↟: pisa el trampolín y sube a la ruta alta';
    if (b >= 22 && b < 24) label = 'Hueco largo: ↑ en el pulso y ↑↑ medio pulso después';
    if (b >= 28 && b < 30.5) label = 'Anillo ◎: toca justo cuando pases por él';
    if (b >= 46 && b < 48) label = 'Portal ≋: mantén para subir, suelta para bajar';
    if (b >= 48 && b < 50) label = 'Sigue las notas en el aire';
    if (b >= 74 && b < 76.5) label = 'Portal ⇅: vas a correr por el techo';
    if (b >= 76.5 && b < 78) label = 'En el techo, ↓ salta hacia abajo';
    $('beatHint').textContent = errorText || label;
  }
}
function showError(text) { errorText = text; $('beatHint').textContent = text; $('beatHint').style.display = 'block'; }
function showCard(which) {
  $('overlay').style.display = 'flex';
  $('card').style.display = which === 'card' ? 'block' : 'none';
  $('calibCard').style.display = which === 'calib' ? 'block' : 'none';
}
function hideOverlay() { $('overlay').style.display = 'none'; }
function renderBest() {
  $('best').textContent = best.stars ? `MEJOR: ${starText(best.stars)} · ★ ${formatScore(best.score)} · ${crystalText(best.crystals)}`
    : best.progress ? `MEJOR AVANCE: ${best.progress} % · ${crystalText(best.crystals)}` : 'EXPLORA LAS RUTAS ALTAS';
  renderSkins();
}

async function playMusic() {
  try { await song.play(); syncClock(); errorText = ''; return true; }
  catch { showError('Toca Continuar para activar la música.'); state = 'paused'; showPause(); return false; }
}
function waitForSong(timeout = 8000) {
  if (song.readyState >= 3) return Promise.resolve();
  return new Promise(resolve => {
    const done = () => { clearTimeout(timer); song.removeEventListener('canplay', done); resolve(); };
    const timer = setTimeout(done, timeout);
    song.addEventListener('canplay', done);
  });
}

function resetPlayerAt(b, py = FLOOR - RADIUS, g = 1, m = 'run') {
  musicTime = timeAt(b); world = distanceAt(b);
  y = py; vy = 0; grav = g; mode = m; grounded = m === 'run'; lastGroundT = musicTime;
  held = false; jumpQueued = null; jumpsUsed = 0; springBoost = 0; route = null; trail = [];
  for (const p of portals) p.done = p.b <= b;
  for (const r of rings) if (r.b >= b) r.used = false;
  for (const c of jumpCues) if (c.beat >= b) { c.result = null; c.offset = undefined; }
  for (const pad of trampolines) pad.usedAt = -10;
}

async function reset(asPractice = practice) {
  if (state === 'loading') return;
  song.pause(); state = 'loading'; winning = false; practice = asPractice;
  attempts++; best.attempts++; save('vectorbeat.best4', best);
  lives = 3; notes = 0; bonusNotes = 0; inv = 0; landing = 0; reaction = 0; celebrate = 0; reactionKind = '';
  particles = []; floaters = []; maxReachedBeat = 0; runCrystals = [false, false, false]; practicePoints = [];
  score = 0; combo = 0; stats = newStats(); checkpointBeat = 0; takeSnapshot();
  makeLevel(); resetPlayerAt(0);
  $('menu').style.display = 'none'; hideOverlay(); $('hud').style.display = 'flex'; $('hud').classList.toggle('practice', practice);
  $('beatHint').style.display = 'block'; $('mascot').style.display = 'none'; $('pause').textContent = 'Pausa';
  song.volume = .65; song.muted = !sound; seekPending = false;
  if (song.readyState < 3) { $('beatHint').textContent = 'Cargando música…'; await waitForSong(); }
  if (state !== 'loading') return;  // el jugador volvió al inicio mientras cargaba
  song.currentTime = 0; syncClock(); state = 'playing'; updateHUD();
  await playMusic();
}

function jump() {
  if (state !== 'playing' || seekPending) return;
  held = true; jumpQueued = songClock();
}
function release() { held = false; }

function showPause() {
  showCard('card'); $('mascot').style.display = 'none'; $('results').style.display = 'none'; $('record').style.display = 'none'; $('stars').style.display = 'none';
  $('message').textContent = 'Un pequeño descanso';
  $('detail').textContent = 'La música y el camino continúan juntos cuando tú quieras.';
  $('again').textContent = 'Continuar'; $('pause').textContent = 'Continuar';
}
function pause() {
  if (state === 'playing') { state = 'paused'; song.pause(); held = false; jumpQueued = null; showPause(); }
  else if (state === 'paused') { state = 'playing'; hideOverlay(); $('pause').textContent = 'Pausa'; playMusic(); }
}
function hurt(kind = 'ouch') {
  if (inv > 0 || state !== 'playing') return;
  if (!practice) lives--;
  attempts++; best.attempts++; save('vectorbeat.best4', best);
  reactionKind = kind; reaction = practice ? PRACTICE_DELAY : RESPAWN_DELAY; held = false; jumpQueued = null; springBoost = 0; state = 'hurt';
  stats.hurts++; combo = 0; trail = []; song.pause(); tone(kind === 'fall' ? 150 : 180, .22, .04);
  burst(world + PLAYER_X, y, 18); updateHUD();
}
async function respawn() {
  if (!practice && lives <= 0) { finish(false); return; }
  let b;
  if (practice) {
    const cp = practicePoints[practicePoints.length - 1] ?? {beat: 0, y: FLOOR - RADIUS, grav: 1, mode: 'run'};
    b = cp.beat; resetPlayerAt(b, cp.y, cp.grav, cp.mode);
    inv = .6;
  } else {
    score = checkpoint.score; combo = 0; stats = {...checkpoint.stats, hurts: stats.hurts};
    b = checkpointBeat; resetPlayerAt(b);
    inv = 1.2;
  }
  seekPending = true; state = 'playing';
  $('beatHint').textContent = `Intento ${attempts} · ¡Tú puedes!`;
  song.currentTime = timeAt(b); updateHUD();
  if (document.hidden) { pause(); return; }
  await playMusic();
}
song.addEventListener('seeked', () => { seekPending = false; musicTime = song.currentTime; syncClock(); world = distanceAt(beatAt(musicTime)); });
song.addEventListener('playing', syncClock);
song.addEventListener('error', () => {
  enableStart();
  if (state === 'playing') {
    song.pause(); state = 'paused'; showPause();
    $('detail').textContent = 'No se pudo cargar la música. Comprueba que music.mp3 esté en la misma carpeta que el juego.';
  }
});

function victory() {
  if (state !== 'playing') return;
  state = 'celebrating'; winning = true; held = false; celebrate = 0; reactionKind = 'happy'; grav = 1; mode = 'run';
  y = FLOOR - RADIUS; vy = 0; burst(world + PLAYER_X, 100, 100, true); tone(784, .25, .02);
  $('beatHint').textContent = '¡Lo lograste! El portal ya es tuyo.';
}
function finish(win) {
  state = 'end'; held = false; winning = win; song.pause();
  showCard('card');
  const stars = starRating(win), acc = accuracy(), progress = Math.min(100, Math.floor(maxReachedBeat / END_BEAT * 100));
  $('mascot').style.display = win ? 'block' : 'none';
  $('stars').style.display = win && !practice ? 'block' : 'none';
  $('stars').textContent = starText(stars); $('stars').setAttribute('aria-label', `${stars} de 3 estrellas`);
  $('results').style.display = 'flex';
  const newCrystals = !practice ? runCrystals.filter((f, i) => f && !best.crystals[i]).length : 0;
  $('stats').innerHTML = [
    ['Puntaje', `★ ${formatScore(score)}`], ['Precisión', `${Math.round(acc * 100)} %`],
    ['Perfecto', stats.perfect], ['Bien', stats.good], ['Temprano / Tarde', stats.early + stats.late],
    ['Fallos', stats.miss], ['Mejor combo', stats.maxCombo],
    ['Notas', `${notes} / ${gems.length}`], ['Notas de la ruta alta', bonusNotes],
    ['Cristales secretos', practice ? '—' : crystalText(runCrystals)], ['Intentos', attempts],
  ].map(([k, v]) => `<span>${k}</span><b>${v}</b>`).join('');
  let record = false;
  if (!practice) {
    if (win) runCrystals.forEach((f, i) => { if (f) best.crystals[i] = true; });  // los cristales cuentan al terminar el nivel
    record = win && (stars > best.stars || (stars === best.stars && score > best.score));
    if (record) { best.stars = stars; best.score = score; }
    best.progress = Math.max(best.progress, progress);
    save('vectorbeat.best4', best); renderBest();
  }
  $('record').style.display = record ? 'block' : 'none';
  $('message').textContent = practice ? (win ? '¡Práctica completada!' : 'Práctica') : win ? '¡El cielo suena contigo!' : 'Ya conoces un poco más el ritmo';
  const noteFrac = gems.length ? notes / gems.length : 0;
  let next = '';
  if (practice) next = 'Ahora inténtalo en el modo normal para ganar estrellas y guardar cristales.';
  else if (win && stars === 1) next = 'Para ★★: 60 % de las notas y 60 % de precisión.';
  else if (win && stars === 2) next = `Para ★★★: 85 % de las notas (${Math.round(noteFrac * 100)} % ahora; busca las violetas en la ruta alta), 80 % de precisión y 2 corazones.`;
  else if (win && stars === 3) next = '¡Tres estrellas!';
  if (newCrystals) next += ` ¡Nuevo cristal secreto! ${unlockedMessage()}`;
  const bias = averageOffset();
  const tip = Math.abs(bias) > .045 && stats.perfect + stats.good + stats.early + stats.late >= 8
    ? ` Tiendes a saltar ${Math.round(Math.abs(bias) * 1000)} ms ${bias > 0 ? 'tarde' : 'antes'}: prueba «Calibrar».` : '';
  $('detail').textContent = (win || practice ? next : `Llegaste al ${progress} %. Mejor avance: ${best.progress} %. Prueba el modo práctica para ensayar las partes difíciles.`) + tip;
  $('again').textContent = 'Volver a jugar (Espacio)'; $('beatHint').style.display = 'none';
}
function averageOffset() {
  const offs = jumpCues.filter(c => c.offset !== undefined).map(c => c.offset);
  return offs.length ? offs.reduce((a, b) => a + b, 0) / offs.length : 0;
}

function goHome() {
  song.pause(); state = 'menu'; held = false; winning = false; jumpQueued = null; stopCalibration(); grav = 1; mode = 'run';
  $('menu').style.display = 'block'; hideOverlay(); $('hud').style.display = 'none'; $('beatHint').style.display = 'none';
  renderBest();
}

// ------------------------------------------------------------------------ práctica
// Puntos de control propios: con C o el botón «◆ Punto», y uno automático cada 4 pulsos en terreno seguro.
function safeHere() {
  const b = beatAt(musicTime);
  if (portals.some(p => p.kind !== 'speed' && Math.abs(p.b - b) < 1)) return false;  // nunca justo en un portal
  if (mode === 'fly') return !obstacles.some(o => Math.abs(o.x - world - PLAYER_X) < 140);
  return grounded && !obstacles.some(o => { const d = o.x - world - PLAYER_X; return d > -40 && d < 160; }) && !rings.some(r => !r.used && Math.abs(r.x - world - PLAYER_X) < 200);
}
function placePracticePoint(manual) {
  if (!practice || state !== 'playing') return;
  if (!safeHere()) { if (manual) floatText('Aquí no: busca suelo firme', '#b0548a', .8, -34); return; }
  const b = beatAt(musicTime);
  practicePoints.push({beat: b, y, grav, mode});
  if (manual) { floatText('◆ Punto guardado', '#3f9d86', .9, -34); tone(1568, .08, .015); }
}
function autoPracticePoint(beat) {
  const last = practicePoints[practicePoints.length - 1];
  if (Math.floor(beat / 4) > Math.floor((last?.beat ?? 0) / 4) && beat - (last?.beat ?? 0) > 2) placePracticePoint(false);
}
function removePracticePoint() {
  if (practice && practicePoints.length) { practicePoints.pop(); floatText('Punto quitado', '#987488', .8, -34); }
}

// --------------------------------------------------------------------- calibración
// Suena un clic cada 0,6 s; el jugador toca al ritmo y medimos el desfase promedio.
const CALIB_CLICKS = 12, CALIB_INTERVAL = .6, CALIB_SKIP = 2;
let calibRun = null, stateBeforeCalib = null;
function calibLabel(v) { const ms = Math.round(v * 1000); return `${ms > 0 ? '+' : ''}${ms} ms`; }
function openCalibration() {
  if (state === 'playing') pause();
  if (state === 'loading' || state === 'hurt' || state === 'celebrating' || state === 'calibrating') return;
  stateBeforeCalib = state; state = 'calibrating';
  $('calibDots').innerHTML = '<i></i>'.repeat(CALIB_CLICKS);
  $('calibText').textContent = `Pulsa Espacio o el botón grande en cada clic. Así el juego compensa el retraso de tu pantalla, parlantes o audífonos. Ajuste actual: ${calibLabel(calib)}.`;
  $('calibStart').textContent = 'Empezar';
  showCard('calib');
}
function startCalibration() {
  const ac = audio(); if (!ac) { $('calibText').textContent = 'Tu navegador no permite la calibración de audio.'; return; }
  $('calibDots').innerHTML = '<i></i>'.repeat(CALIB_CLICKS);
  const t0 = ac.currentTime + .8, clicks = [];
  for (let i = 0; i < CALIB_CLICKS; i++) { const when = t0 + i * CALIB_INTERVAL; clicks.push(when); tone(i % 4 === 0 ? 1320 : 880, .05, .06, when); }
  calibRun = {clicks, taps: [], end: t0 + CALIB_CLICKS * CALIB_INTERVAL + .3};
  $('calibText').textContent = sound ? 'Escucha y toca en cada clic…' : 'Activa el sonido para escuchar los clics.';
  $('calibStart').textContent = 'Repetir';
}
function calibTap() {
  if (!calibRun || !audioContext) return;
  const now = audioContext.currentTime; calibRun.taps.push(now);
  let i = 0; for (let k = 1; k < calibRun.clicks.length; k++) if (Math.abs(calibRun.clicks[k] - now) < Math.abs(calibRun.clicks[i] - now)) i = k;
  $('calibDots').children[i]?.classList.add('tap');
}
function finishCalibration() {
  const {clicks, taps} = calibRun; calibRun = null;
  const offsets = [];
  for (const tap of taps) {
    let bestD = null; for (let i = CALIB_SKIP; i < clicks.length; i++) { const d = tap - clicks[i]; if (bestD === null || Math.abs(d) < Math.abs(bestD)) bestD = d; }
    if (bestD !== null && Math.abs(bestD) < .3) offsets.push(bestD);
  }
  if (offsets.length < 5) { $('calibText').textContent = 'No detecté suficientes toques. Pulsa «Repetir» y toca en cada clic.'; return; }
  offsets.sort((a, b) => a - b);
  calib = Math.max(-.25, Math.min(.3, offsets[Math.floor(offsets.length / 2)]));
  save('vectorbeat.calib', calib);
  $('calibText').textContent = `¡Listo! Ajuste guardado: ${calibLabel(calib)}. ${calib > .03 ? 'Tu equipo tiene algo de retraso; ya lo compensamos.' : calib < -.03 ? 'Sueles adelantarte un poco; ya lo compensamos.' : 'Tu equipo está bien sincronizado.'}`;
}
function updateCalibration() {
  if (!calibRun || !audioContext) return;
  const now = audioContext.currentTime;
  [...$('calibDots').children].forEach((dot, i) => dot.classList.toggle('on', now >= calibRun.clicks[i] && now < calibRun.clicks[i] + .15));
  if (now > calibRun.end) finishCalibration();
}
function stopCalibration() { calibRun = null; }
function closeCalibration() {
  stopCalibration();
  if (state !== 'calibrating') return;
  state = stateBeforeCalib;
  if (state === 'paused') showPause();
  else if (state === 'end') showCard('card');
  else hideOverlay();
}

// ------------------------------------------------------------------- colores del cubo
// Se desbloquean con estrellas + cristales secretos (máximo 3 + 3).
const SKINS = [
  {id: 'menta',    name: 'Menta',    need: 0, hue: 0,    trail: '#78c8b5', dot: '#80cfbb'},
  {id: 'cielo',    name: 'Cielo',    need: 1, hue: 40,   trail: '#7fb2e5', dot: '#86b9ee'},
  {id: 'lavanda',  name: 'Lavanda',  need: 2, hue: 105,  trail: '#b39ae0', dot: '#b9a0e8'},
  {id: 'coral',    name: 'Coral',    need: 3, hue: 185,  trail: '#f19aa8', dot: '#f4a0ae'},
  {id: 'limon',    name: 'Limón',    need: 4, hue: -95,  trail: '#c9d77a', dot: '#cfdc7f'},
  {id: 'ocaso',    name: 'Ocaso',    need: 5, hue: 205,  trail: '#f2b07a', dot: '#f4b47c', sat: 1.3},
  {id: 'arcoiris', name: 'Arcoíris', need: 6, hue: null, trail: '#d6a6e8', dot: 'conic-gradient(#f4a0ae,#f4d47c,#80cfbb,#86b9ee,#b9a0e8,#f4a0ae)'},
];
function unlockedPoints() { return best.stars + best.crystals.filter(Boolean).length; }
function skin() { return SKINS.find(s => s.id === skinId && s.need <= unlockedPoints()) ?? SKINS[0]; }
function skinFilter() {
  const s = skin();
  if (s.hue === 0) return 'none';
  const hue = s.hue === null ? (animTime * 120) % 360 : s.hue;
  return `hue-rotate(${hue}deg)${s.sat ? ` saturate(${s.sat})` : ''}`;
}
function unlockedMessage() {
  const next = SKINS.find(s => s.need > unlockedPoints());
  return next ? `Siguiente color: ${next.name} (${next.need} ★/◆).` : 'Desbloqueaste todos los colores.';
}
function renderSkins() {
  const pts = unlockedPoints();
  $('skins').innerHTML = SKINS.map(s => {
    const locked = s.need > pts, active = skin().id === s.id;
    return `<button class="skin${active ? ' on' : ''}" data-skin="${s.id}" ${locked ? 'disabled' : ''} aria-pressed="${active}" title="${locked ? `Necesitas ${s.need} entre estrellas y cristales` : s.name}"><i style="background:${s.dot}"></i>${locked ? `🔒 ${s.need}` : s.name}</button>`;
  }).join('');
  $('crystalsFound').textContent = `Cristales secretos ${crystalText(best.crystals)} · Estrellas ${starText(best.stars)}`;
}

// ------------------------------------------------------------------------ bucle
function frame(ms) {
  const dt = Math.min((ms - lastFrame) / 1000, .04); lastFrame = ms; animTime += dt;
  if (state === 'playing') { updateFromMusic(ms); updateHUD(); }
  else if (state === 'hurt') { reaction -= dt; animateParticles(dt); if (reactionKind === 'fall') y += 90 * dt * grav; if (reaction <= 0) respawn(); }
  else if (state === 'celebrating') { celebrate += dt; animateParticles(dt); song.volume = .65 * Math.max(0, 1 - celebrate / 2.8); if (celebrate > 2.8) finish(true); }
  else if (state === 'calibrating') updateCalibration();
  for (const f of floaters) f.life -= dt;
  floaters = floaters.filter(f => f.life > 0);
  draw(animTime);
  requestAnimationFrame(frame);
}

// ----------------------------------------------------------------------- eventos
function enableStart() { $('start').disabled = false; $('start').textContent = 'Jugar'; $('practiceBtn').disabled = false; }
if (song.readyState < 3) {
  $('start').disabled = true; $('practiceBtn').disabled = true; $('start').textContent = 'Cargando…';
  song.addEventListener('canplay', enableStart, {once: true});
  setTimeout(enableStart, 3000);  // algunos móviles no precargan audio sin un toque
}
$('start').onclick = () => reset(false);
$('practiceBtn').onclick = () => reset(true);
$('again').onclick = () => state === 'paused' ? pause() : reset();
$('pause').onclick = pause;
$('home').onclick = goHome;
$('checkpoint').onclick = () => placePracticePoint(true);
$('sound').onclick = () => { sound = !sound; song.muted = !sound; $('sound').textContent = 'Sonido: ' + (sound ? 'sí' : 'no'); };
$('calibrate').onclick = openCalibration;
$('calibStart').onclick = startCalibration;
$('calibReset').onclick = () => { calib = 0; save('vectorbeat.calib', 0); $('calibText').textContent = 'Ajuste restablecido a 0 ms.'; };
$('calibClose').onclick = closeCalibration;
$('calibPad').onpointerdown = e => { e.preventDefault(); calibTap(); };
$('skins').onclick = e => { const b = e.target.closest('[data-skin]'); if (!b || b.disabled) return; skinId = b.dataset.skin; save('vectorbeat.skin', skinId); renderSkins(); };

canvas.onpointerdown = e => { e.preventDefault(); jump(); };
$('jump').onpointerdown = e => { e.preventDefault(); jump(); };
window.addEventListener('pointerup', release);
window.addEventListener('pointercancel', release);
window.addEventListener('keydown', e => {
  if (['Space', 'ArrowUp', 'Enter'].includes(e.code) && state === 'end') { e.preventDefault(); if (!e.repeat) reset(); return; }
  if (['Space', 'ArrowUp'].includes(e.code)) {
    e.preventDefault();
    if (e.repeat) return;
    if (state === 'calibrating') { calibTap(); return; }
    jump();
  }
  if (e.code === 'KeyP' && state !== 'calibrating') pause();
  if (e.code === 'KeyR' && (state === 'playing' || state === 'paused' || state === 'hurt')) reset();
  if (e.code === 'KeyC') placePracticePoint(true);
  if (e.code === 'KeyX') removePracticePoint();
  if (e.code === 'Escape' && state === 'calibrating') closeCalibration();
});
window.addEventListener('keyup', e => { if (['Space', 'ArrowUp'].includes(e.code)) release(); });
window.addEventListener('blur', () => { if (state === 'playing') pause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'playing') pause(); });

makeLevel(); renderBest(); requestAnimationFrame(frame);
