'use strict';
// ============================================================================
// VECTOR BEAT v6.1 — móvil horizontal — juego de saltos sincronizado con la música
// Secciones: configuración · arte · audio y reloj · estado · nivel · ritmo y
//            puntaje · física · efectos · dibujo · interfaz · calibración · eventos
// ============================================================================

// ---------------------------------------------------------------- configuración
const canvas = document.getElementById('game'), ctx = canvas.getContext('2d');
const $ = id => document.getElementById(id);

const BPM=window.VECTOR_LEVEL.bpm,BEAT=60/BPM,OFFSET=window.VECTOR_LEVEL.offset,END_BEAT=window.VECTOR_LEVEL.endBeat;
const PLAYER_X = 160, FLOOR = 480, RADIUS = 32;
let LEVEL = structuredClone(window.VECTOR_LEVEL);
const CEILING = 180;
let finaleTier=0,finalePops=0;let enemies=[];
let mode='normal', playerRule='run', gravityDir=1, attempt=0, lastAttemptProgress=0, personalCheckpoints=[], rings=[], portals=[], secrets=[], accentIndex=0, cameraKick=0, flash=0;
let collection=load('vectorbeat.collection4',[]), selectedSkin=load('vectorbeat.skin4','mint'), selectedFace=load('vectorbeat.face4','classic');
const SKINS=[{id:'mint',name:'Menta',stars:0,color:'#80cfbb',filter:'none'},{id:'lavender',name:'Lavanda',stars:1,color:'#bc9fdf',filter:'hue-rotate(65deg)'},{id:'peach',name:'Durazno',stars:2,color:'#edb399',filter:'hue-rotate(175deg)'},{id:'gold',name:'Dorado',stars:3,color:'#e3c477',filter:'hue-rotate(230deg) saturate(.8)'}];
const reducedMotion=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches||false;

// Física
const JUMP_SPEED = 480, DOUBLE_SPEED = 425, SPRING_SPEED = 650;
const GRAVITY_HELD = 1100, GRAVITY = 1450;
const JUMP_BUFFER = .12;   // s: un toque poco antes de aterrizar igual cuenta
const COYOTE_TIME = .08;   // s: aún puedes saltar justo después de salir de un borde
const HIT_RADIUS = 26;     // radio de choque del personaje (el dibujo mide 32)
const SPRING_BOOST = .55;  // s de impulso alto tras el trampolín

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
let best=load('vectorbeat.bestMobile6',{stars:0,score:0,progress:0});let unlockedStars=load('vectorbeat.unlockedStars5',load('vectorbeat.best4',{stars:0}).stars||0);

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
// The media clock is authoritative: never advance from wall time while buffering or paused.
function songClock(){return song.currentTime}
function songEndTime(){return Number.isFinite(song.duration)&&song.duration>0?song.duration:LEVEL.durationSeconds}
function progressPercent(time=musicTime){return Math.floor(Math.max(0,Math.min(100,time/songEndTime()*100)))}
function completeSong(){if(state!=='playing')return;const end=songEndTime();if(end>musicTime){const n=Math.max(1,Math.ceil((end-musicTime)/(1/120))),dt=(end-musicTime)/n;for(let i=0;i<n&&state==='playing';i++)physics(dt,musicTime+dt)}if(state==='playing'){musicTime=end;world=distanceAt(END_BEAT);maxReachedBeat=Math.max(maxReachedBeat,END_BEAT);victory();updateHUD()}}

function beatAt(t) { return Math.max(0, (t - OFFSET) / BEAT); }
function timeAt(b) { return OFFSET + b * BEAT; }
function speedAt(b){let multiplier=1;for(const p of LEVEL.portals){if(beatAt(p.time)>b)break;if(p.kind==='speed')multiplier*=2;else if(p.kind==='reset'||!p.kind)multiplier=1}return multiplier}
let speedSegments=[];function rebuildSpeedSegments(){const cuts=[0,END_BEAT,...LEVEL.sections.map(s=>s.startBeat),...LEVEL.portals.map(p=>beatAt(p.time))].sort((a,b)=>a-b);speedSegments=[];let distance=0;for(let i=1;i<cuts.length;i++){const start=cuts[i-1],end=cuts[i],mid=(start+end)/2,rate=LEVEL.sections[sectionAt(mid)].pixelsPerBeat*1.18*speedAt(mid);if(end>start)speedSegments.push({start,end,distance,rate});distance+=(end-start)*rate}}function distanceAt(b){b=Math.max(0,b);if(!speedSegments.length)rebuildSpeedSegments();for(const s of speedSegments)if(b<=s.end)return s.distance+Math.max(0,b-s.start)*s.rate;const s=speedSegments.at(-1);return s.distance+(b-s.start)*s.rate}
function sectionAt(b){let i=0;for(let k=0;k<LEVEL.sections.length;k++)if(b>=LEVEL.sections[k].startBeat)i=k;return i}
function ruleAt(t){let rule='run';for(const p of LEVEL.portals)if(t>=p.time&&!p.kind)rule=p.rule;return rule}
function setRule(rule,snap=false){playerRule=rule;gravityDir=rule==='invert'?-1:1;if(snap){y=rule==='invert'?CEILING+RADIUS:rule==='fly'?FLOOR-RADIUS:FLOOR-RADIUS;vy=0;grounded=rule!=='fly';jumpsUsed=0;held=false;springBoost=0;lastGroundT=musicTime}}
function resetPortals(t){for(const p of portals)p.entered=p.time<=t;setRule(ruleAt(t));accentIndex=LEVEL.accents.findIndex(a=>a.time>t);if(accentIndex<0)accentIndex=LEVEL.accents.length}


const at = b => PLAYER_X + distanceAt(b);

// -------------------------------------------------------------------------- estado
let state = 'menu', sound = true, held = false;
let y = FLOOR - RADIUS, vy = 0, grounded = true, world = 0;
let lives = 3, notes = 0, bonusNotes = 0, musicTime = 0, animTime = 0, lastFrame = 0;
let reaction = 0, reactionKind = '', inv = 0, landing = 0, celebrate = 0, springBoost = 0;
let seekPending = false, checkpointBeat = 0, errorText = '', winning = false, maxReachedBeat = 0;
let jumpQueued = null, lastGroundT = 0, jumpsUsed = 0, route = null;  // route: {from, to} en pulsos tras un trampolín
let particles = [], floaters = [], trail = [];
let platforms = [], gems = [], obstacles = [], jumpCues = [], trampolines = [];
let score = 0, combo = 0, stats = newStats(), checkpoint = null;

function newStats() { return {perfect: 0, good: 0, early: 0, late: 0, miss: 0, bounce: 0, maxCombo: 0, hurts: 0}; }

// --------------------------------------------------------------------------- nivel
function makeLevel(){rebuildSpeedSegments();enemies=(LEVEL.enemies||[]).map(e=>({...e,x:at(e.beat)}));platforms=[];obstacles=[];gems=[];jumpCues=[];trampolines=[];rings=[];secrets=[];portals=LEVEL.portals.map(p=>({...p,x:at(beatAt(p.time)),entered:false}));const gaps=[];
 const cue=(time,extra={})=>{const beat=beatAt(time);jumpCues.push({id:extra.id||'cue-'+jumpCues.length,time,beat,x:at(beat),result:null,...extra})};
 const note=(beat,y,extra={})=>gems.push({id:'note-'+gems.length,x:at(beat),y,taken:false,...extra});
 const spike=(beat,kind,height,dir)=>obstacles.push({x:at(beat),y:dir===-1?CEILING:FLOOR,height,kind,gravity:dir});
 for(const phrase of LEVEL.phrases){const b=beatAt(phrase.time),dir=phrase.surface==='ceiling'?-1:1,base=dir===-1?CEILING:FLOOR,high=d=>base-dir*d;cue(phrase.time,{id:phrase.id,double:['ring-gap','triple'].includes(phrase.pattern),spring:phrase.pattern==='spring'});
  if(phrase.pattern==='gap'||phrase.pattern==='ring-gap'){const long=phrase.pattern==='ring-gap';gaps.push({start:at(b+.4),end:at(b+(long?1.65:.94)),gravity:dir});if(long){platforms.push({x:at(b+1.2),w:distanceAt(b+1.96)-distanceAt(b+1.2),y:high(60),gravity:dir,floating:true});const time=phrase.time+BEAT*.5,id='ring-'+phrase.id;const ring={id,time,beat:b+.5,x:at(b+.5),y:high(RADIUS+92),used:false,optional:false,gravity:dir};rings.push(ring);cue(time,{id:id+'-cue',air:true,ringId:id,double:true});note(b+1.2,high(215),{bonus:true})}}
  else if(phrase.pattern==='spring'){trampolines.push({x:at(b),y:base,gravity:dir,beat:b,usedAt:-10});for(const [from,to,h]of [[.83,1.58,140],[1.63,2.48,110],[2.52,3.1,85]])platforms.push({x:at(b+from),w:distanceAt(b+to)-distanceAt(b+from),y:high(h),gravity:dir,floating:true,route:true});for(const q of [.96,1.3,1.93,2.28,2.83])note(b+q,high(q<1.6?198:q<2.5?168:140),{bonus:true})}
  else {const count=phrase.pattern==='triple'?3:phrase.pattern==='pair'?2:1;for(let i=0;i<count;i++)spike(b+.5+i*.26,phrase.obstacle,i?42:50,dir);if(count===3)cue(phrase.time+BEAT*.5,{air:true,double:true,id:phrase.id+'-double'})}
  note(b+.66,high(147));
 }
 const addSurface=(dir,a,b)=>{const cut=gaps.filter(g=>g.gravity===dir&&g.end>a&&g.start<b).sort((a,b)=>a.start-b.start);let start=a;for(const gap of cut){const gs=Math.max(a,gap.start),ge=Math.min(b,gap.end);if(gs>start)platforms.push({x:start,w:gs-start,y:dir===-1?CEILING:FLOOR,gravity:dir});start=Math.max(start,ge)}if(start<b)platforms.push({x:start,w:b-start,y:dir===-1?CEILING:FLOOR,gravity:dir})};
 addSurface(1,0,at(END_BEAT)+1100);for(let i=0;i<LEVEL.portals.length;i++)if(!LEVEL.portals[i].kind&&LEVEL.portals[i].rule==='invert'){const from=beatAt(LEVEL.portals[i].time),to=beatAt(LEVEL.portals.slice(i+1).find(p=>!p.kind)?.time??songEndTime());addSurface(-1,at(from)-250,at(to)+80)}
 for(const o of LEVEL.flightObstacles){const dir=o.surface==='ceiling'?-1:1;obstacles.push({x:at(beatAt(o.time)),y:dir===-1?120:FLOOR,height:o.height,kind:o.kind,gravity:dir,flight:true})}
 for(const n of LEVEL.flightNotes)note(n.beat,n.y,{flight:true});for(const n of LEVEL.outroNotes||[])note(n.beat,n.y,{outro:true});
 for(const item of LEVEL.rings){const r={...item,beat:beatAt(item.time),x:at(beatAt(item.time)),used:false,gravity:1};rings.push(r);cue(item.time,{id:item.id+'-cue',air:true,ringId:item.id,optional:item.optional})}
 secrets=LEVEL.secrets.map(c=>({...c,x:at(c.beat),taken:false}));
 platforms.sort((a,b)=>a.gravity*a.y-b.gravity*b.y);obstacles.sort((a,b)=>a.x-b.x);for(const o of obstacles)o.hull=hullFor(o);gems.sort((a,b)=>a.x-b.x);jumpCues.sort((a,b)=>a.time-b.time);rings.sort((a,b)=>a.time-b.time);
}


function hullFor(o) {
  const pts = [], h = o.height;
  if (o.kind === 'rock') {  // joroba redondeada
    for (let i = 0; i <= 12; i++) { const a = Math.PI * i / 12; pts.push([Math.cos(a) * 22, -Math.sin(a) * h]); }
  } else {  // cono y llama: triángulo (la base ancha del cono es casi plana)
    const half = o.kind === 'fire' ? 17 : 18, top = o.kind === 'fire' ? h - 6 : h;
    for (let i = 0; i <= 8; i++) { const f = i / 8; pts.push([-half * f, -top * (1 - f)], [half * f, -top * (1 - f)]); }
  }
  return pts;
}

// --------------------------------------------------------------- ritmo y puntaje
function multiplier() { return 1 + Math.min(3, Math.floor(combo / 8)); }

function addCombo() { combo++; stats.maxCombo = Math.max(stats.maxCombo, combo); if (combo % 8 === 0 && multiplier() > 1) floatText(`×${multiplier()}`, '#754e95', .9, -34); }

function judgeJump(pressT, air) {
  const p = pressT - calib;
  let cue = null, d = Infinity;
  for (const c of jumpCues) {
    if (c.result || Boolean(c.air) !== air) continue;
    if(c.ringId)continue;
    const delta = p - c.time;
    if (Math.abs(delta) < Math.abs(d)) { d = delta; cue = c; }
    if (delta < -WIN_OK) break;
  }
  if (!cue || Math.abs(d) > WIN_OK) return;  // salto libre: ni premia ni castiga
  const kind = Math.abs(d) <= WIN_PERFECT ? 'perfect' : Math.abs(d) <= WIN_GOOD ? 'good' : d < 0 ? 'early' : 'late';
  cue.result = kind; cue.offset = d;
  stats[kind]++; addCombo();
  score += JUDGE[kind].points * multiplier();
  floatText(air && kind === 'perfect' ? '¡Doble perfecto!' : JUDGE[kind].label, JUDGE[kind].color, kind === 'perfect' ? 1.15 : 1);
  tone(JUDGE[kind].freq, .07, .012);
}

function checkMisses(t) {
  for (const c of jumpCues) {
    if (c.result) continue;
    const ct = c.time;
    if(c.optional && t>ct+WIN_OK){c.result='skip';continue;}
    if (ct > t) break;
    if (t - calib > ct + WIN_OK && route && c.beat > route.from && c.beat < route.to && y < FLOOR - RADIUS - 30) { c.result = 'skip'; continue; }
    if (t - calib > ct + WIN_OK) { c.result = 'miss'; stats.miss++; combo = 0; floatText(JUDGE.miss.label, JUDGE.miss.color, .9); }
  }
}

function takeSnapshot(){return {time:musicTime,beat:beatAt(musicTime),y,vy,grounded,jumpsUsed,lastGroundT,playerRule,gravityDir,springBoost,score,notes,bonusNotes,combo,stats:{...stats},route:route?{...route}:null,cues:jumpCues.map(c=>({result:c.result,offset:c.offset})),gems:gems.map(n=>n.taken),secrets:secrets.map(n=>n.taken),rings:rings.map(r=>r.used),pads:trampolines.map(p=>p.usedAt)}}
function placeCheckpoint(){if(mode!=='practice'||state!=='playing'||seekPending)return;const cp=takeSnapshot();personalCheckpoints.push(cp);if(personalCheckpoints.length>20)personalCheckpoints.shift();checkpoint=cp;floatText('Checkpoint '+Math.floor(cp.beat/END_BEAT*100)+' %','#6b86b2');updateHUD()}
function removeCheckpoint(){if(mode!=='practice')return;personalCheckpoints.pop();checkpoint=personalCheckpoints.at(-1)||null;floatText(checkpoint?'Checkpoint anterior':'Sin checkpoint','#6b86b2');updateHUD()}
function restoreSnapshot(cp){musicTime=cp.time;world=distanceAt(cp.beat);y=cp.y;vy=cp.vy;grounded=cp.grounded;jumpsUsed=cp.jumpsUsed;lastGroundT=cp.lastGroundT;playerRule=cp.playerRule;gravityDir=cp.gravityDir;springBoost=cp.springBoost;score=cp.score;notes=cp.notes;bonusNotes=cp.bonusNotes;combo=cp.combo;stats={...cp.stats};route=cp.route?{...cp.route}:null;cp.cues.forEach((v,i)=>Object.assign(jumpCues[i],v));cp.gems.forEach((v,i)=>gems[i].taken=v);cp.secrets.forEach((v,i)=>secrets[i].taken=v);cp.rings.forEach((v,i)=>rings[i].used=v);cp.pads.forEach((v,i)=>trampolines[i].usedAt=v);resetPortals(cp.time)}


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
  if (!win || mode==='practice') return 0;
  const noteFrac = gems.length ? notes / gems.length : 0, acc = accuracy();
  if (noteFrac >= .85 && acc >= .8) return 3;
  if (noteFrac >= .6 && acc >= .6) return 2;
  return 1;
}

// --------------------------------------------------------------------------- física
function hitsObstacle(o) {
  const ox = o.x - world;
  if (Math.abs(ox - PLAYER_X) > HIT_RADIUS + 24) return false;
  const r2 = HIT_RADIUS * HIT_RADIUS;
  for (const [dx, dy] of o.hull) if ((ox + dx - PLAYER_X) ** 2 + (o.y + dy * (o.gravity||1) - y) ** 2 < r2) return true;
  return false;
}

function platformBelow(){let top=Infinity;for(const p of platforms)if(p.gravity===gravityDir&&PLAYER_X+world>=p.x&&PLAYER_X+world<=p.x+p.w&&gravityDir*p.y>=gravityDir*y+RADIUS-2)top=Math.min(top,gravityDir*p.y);return top}
function triggerRing(pressT){const ring=rings.find(r=>!r.used&&Math.abs(r.x-world-PLAYER_X)<72&&Math.abs(r.y-y)<72&&Math.abs(pressT-calib-r.time)<=WIN_GOOD);if(!ring)return false;const delta=pressT-calib-ring.time,kind=Math.abs(delta)<=WIN_PERFECT?'perfect':'good';ring.used=true;const c=jumpCues.find(c=>c.ringId===ring.id);if(c){c.result=kind;c.offset=delta}stats[kind]++;addCombo();score+=JUDGE[kind].points*multiplier();vy=playerRule==='fly'?-300:-560*gravityDir;grounded=false;jumpsUsed=1;springBoost=.48;route={from:ring.beat,to:ring.beat+3};floatText(kind==='perfect'?'¡Anillo perfecto!':'Anillo · Bien',JUDGE[kind].color,1.15);burst(ring.x,ring.y,22);tone(JUDGE[kind].freq,.1,.02);return true}
function tryJump(t){if(jumpQueued===null||t<jumpQueued)return;const pressT=jumpQueued;if(triggerRing(pressT)){jumpQueued=null;return}if(playerRule==='fly'){jumpQueued=null;return}const coyote=jumpsUsed===0&&t-lastGroundT<=COYOTE_TIME&&vy*gravityDir>=0;
 if(grounded||coyote){jumpQueued=null;vy=-JUMP_SPEED*gravityDir;grounded=false;jumpsUsed=1;springBoost=0;tone(440,.09,.012);judgeJump(pressT,false);return}
 const landingSoon=vy*gravityDir>0&&(platformBelow()-(gravityDir*y+RADIUS))/(vy*gravityDir)<=JUMP_BUFFER;
 if(!landingSoon&&jumpsUsed<2){const second=jumpsUsed===1;jumpQueued=null;vy=-(second?DOUBLE_SPEED:JUMP_SPEED)*gravityDir;jumpsUsed=2;springBoost=0;tone(659,.09,.018);burst(world+PLAYER_X,y,9);judgeJump(pressT,second);return}if(t-pressT>JUMP_BUFFER)jumpQueued=null;
}


function physics(dt,t){musicTime=t;const beat=beatAt(t);world=distanceAt(beat);maxReachedBeat=Math.max(maxReachedBeat,beat);inv=Math.max(0,inv-dt);landing=Math.max(0,landing-dt);springBoost=Math.max(0,springBoost-dt);cameraKick=Math.max(0,cameraKick-dt);flash=Math.max(0,flash-dt);
 for(const p of portals)if(!p.entered&&t>=p.time){p.entered=true;if(!p.kind)setRule(p.rule,true);cameraKick=.25;flash=.1;floatText(p.kind==='speed'?'VELOCIDAD ×2':p.kind==='reset'?'RITMO BASE':p.rule==='fly'?'VUELO':p.rule==='invert'?'GRAVEDAD ↓':'SALTO ↑','#755788',.8)}
 while(accentIndex<LEVEL.accents.length&&t>=LEVEL.accents[accentIndex].time){const a=LEVEL.accents[accentIndex++];if(a.strength>.45){cameraKick=Math.max(cameraKick,.12+a.strength*.16);flash=.08}}
 tryJump(t);const wasGrounded=grounded,old=y;
 if(playerRule==='fly'){vy=Math.max(-300,Math.min(300,vy+(held?-1000:800)*dt));y+=vy*dt;if(y<RADIUS+105){y=RADIUS+105;vy=Math.max(0,vy)}if(y>FLOOR-RADIUS){y=FLOOR-RADIUS;vy=Math.min(0,vy)}grounded=false}
 else{vy+=((held||springBoost>0)&&vy*gravityDir<0?GRAVITY_HELD:GRAVITY)*gravityDir*dt;y+=vy*dt;grounded=false;for(const p of platforms){if(p.gravity!==gravityDir)continue;const py=p.y*gravityDir;if(PLAYER_X+world>=p.x&&PLAYER_X+world<=p.x+p.w&&vy*gravityDir>=0&&old*gravityDir+RADIUS<=py+2&&y*gravityDir+RADIUS>=py){y=p.y-RADIUS*gravityDir;if(!wasGrounded)landing=.17;vy=0;grounded=true;lastGroundT=t;jumpsUsed=0;break}}if(grounded)tryJump(t)}
 for(const o of obstacles){if(o.x-world>PLAYER_X+60)break;if(hitsObstacle(o)){hurt('ouch');break}}if(state!=='playing')return;
 for(const e of enemies){const ey=enemyY(e,t);if(Math.hypot(e.x-world-PLAYER_X,ey-y)<HIT_RADIUS+e.radius){hurt('ouch');return}}
 if(playerRule!=='fly')for(const pad of trampolines)if(pad.gravity===gravityDir&&grounded&&t-pad.usedAt>1.2&&Math.abs(pad.x-world-PLAYER_X)<26){pad.usedAt=t;route={from:pad.beat,to:pad.beat+3.1};vy=-SPRING_SPEED*gravityDir;grounded=false;jumpsUsed=1;springBoost=SPRING_BOOST;const c=jumpCues.find(c=>c.spring&&Math.abs(c.beat-pad.beat)<.02);if(c&&!c.result){c.result='bounce';stats.bounce++;addCombo();score+=JUDGE.bounce.points*multiplier()}floatText('¡Boing! Ruta secreta','#c09a48');tone(880,.18,.025);burst(pad.x,pad.y-10*gravityDir,14);break}
 if(playerRule==='run'&&y>580||playerRule==='invert'&&y<75){hurt('fall');return}
 for(const n of gems)if(!n.taken&&Math.abs(n.x-world-PLAYER_X)<39*1.18*speedAt(beat)&&Math.abs(n.y-y)<45){n.taken=true;notes++;if(n.bonus)bonusNotes++;burst(n.x,n.y);tone([659,784,880,987][notes%4],.08,.009)}
 for(const c of secrets)if(!c.taken&&Math.abs(c.x-world-PLAYER_X)<34*1.18*speedAt(beat)&&Math.abs(c.y-y)<34){c.taken=true;floatText('¡Cristal secreto!','#975dba');burst(c.x,c.y,24);tone(1175,.2,.02)}
 trail.push({x:world+PLAYER_X,y,life:.3});for(const p of trail)p.life-=dt;trail=trail.filter(p=>p.life>0);checkMisses(t);animateParticles(dt);
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
  floaters = floaters.filter(f => f.dy !== dy);  // una calificación reemplaza a la anterior
  floaters.push({text, color, size, dy, life: .75});
}

// -------------------------------------------------------------------------- dibujo
function roundRect(x, y, w, h, r, color) { ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill(); }

function drawGround(left, w, top) {
  if (left + w < -10 || left >(viewRight+100)) return;
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
    const x = x0 + j * dw; if (x >(viewRight+100)) break;
    slice(P.mid[0], P.mid[1] - P.mid[0], x - .5, dw + 1);
  }
}

function drawFloating(p, left, beat) {
  if (left + p.w < -10 || left >(viewRight+100)) return;
  const f = SHEETS['floating-platform-sprites'][0], h = p.w * f[3] / f[2];
  // Cuadro según el pulso: se mecen todas juntas, las de la ruta alta medio pulso desfasadas
  if (!frameOf('floating-platform-sprites', beat * 2 + (p.route ? 2 : 0), left, p.y - h * .06, p.w, h)) {
    roundRect(left, p.y, p.w, 26, 10, '#ffecd9'); roundRect(left, p.y + 4, p.w, 5, 3, '#c9a6dd');
  }
}

function drawObstacle(o, x, beat) {
  const base = o.y, h = o.height, phase = beat % 1;
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

function drawAurora(beat) {
  if (combo < 6) return;
  const strength = Math.min(.2, .06 + combo * .003), colors = ['#72cdb7', '#bb9bd5', '#edb4cb'];
  for (let band = 0; band < 3; band++) {
    ctx.globalAlpha = strength; ctx.fillStyle = colors[band]; ctx.beginPath();
    for (let x = 0; x <= viewRight+32; x += 32) { const yy = 110 + band * 35 + Math.sin(x * .005 + beat * .12 + band) * 25; x ? ctx.lineTo(x, yy) : ctx.moveTo(x, yy); }
    for (let x = Math.ceil(viewRight/32)*32; x >= 0; x -= 32) ctx.lineTo(x, 170 + band * 35 + Math.sin(x * .005 + beat * .12 + band) * 25);
    ctx.closePath(); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function blendHex(a,b,f){const out=[1,3,5].map(i=>Math.round(parseInt(a.slice(i,i+2),16)*(1-f)+parseInt(b.slice(i,i+2),16)*f).toString(16).padStart(2,'0'));return '#'+out.join('')}
function paletteAt(beat){const i=sectionAt(beat),current=LEVEL.sections[i];if(i===0)return current.palette;const f=Math.max(0,Math.min(1,(beat-current.startBeat)/2));return current.palette.map((c,k)=>blendHex(LEVEL.sections[i-1].palette[k],c,f))}
function drawLevelPlatform(p,beat){if(p.x-world>(viewRight+100)||p.x+p.w-world<0)return;ctx.save();if(p.gravity===-1){ctx.translate(0,p.y*2);ctx.scale(1,-1)}if(p.floating)drawFloating(p,p.x-world,beat);else drawGround(p.x-world,p.w,p.y);ctx.globalAlpha=.30;roundRect(p.x-world,p.y+2,p.w,5,2,LEVEL.sections[sectionAt(beat)].groundTint);ctx.restore()}
function drawInteractive(beat){for(const r of rings){const x=r.x-world;if(x<-90||x>(viewRight+100))continue;ctx.save();ctx.translate(x,r.y);ctx.globalAlpha=r.used?.25:1;ctx.strokeStyle='#edbf6c';ctx.lineWidth=7;ctx.beginPath();ctx.arc(0,0,29+Math.sin(beat*Math.PI*2)*2,0,7);ctx.stroke();ctx.strokeStyle='#fff3c4';ctx.lineWidth=2;ctx.stroke();ctx.fillStyle='#8c609e';ctx.font='bold 19px Trebuchet MS';ctx.textAlign='center';ctx.fillText(r.used?'✓':'TOCA',0,7);ctx.restore()}
 for(const p of portals){const x=p.x-world;if(x<-100||x>(viewRight+100))continue;ctx.save();ctx.translate(x,310);ctx.strokeStyle=p.kind==='speed'?'#ed9b79':p.kind==='reset'?'#82c8b5':p.rule==='fly'?'#8bbad5':p.rule==='invert'?'#b59ad6':'#e7b875';ctx.lineWidth=12;ctx.beginPath();ctx.ellipse(0,0,45,145,0,0,7);ctx.stroke();ctx.fillStyle='#fff7';ctx.font='bold 16px Trebuchet MS';ctx.textAlign='center';ctx.fillText(p.kind==='speed'?'×2':p.kind==='reset'?'×1':p.rule==='fly'?'VUELO':p.rule==='invert'?'GRAVEDAD':'SALTO',0,-163);ctx.restore()}
 for(const c of secrets)if(!c.taken){const x=c.x-world;if(x<-60||x>(viewRight+100))continue;ctx.save();ctx.translate(x,c.y+Math.sin(beat*Math.PI*2)*3);ctx.rotate(Math.PI/4);ctx.shadowColor='#ba8fd8';ctx.shadowBlur=18;roundRect(-13,-13,26,26,5,'#bd8dda');ctx.shadowBlur=0;ctx.strokeStyle='#fff2ff';ctx.lineWidth=2;ctx.strokeRect(-9,-9,18,18);ctx.restore()}}
// Final cinematográfico: luces decorativas; la física del camino permanece en su superficie habitual.
function finaleDuration(tier=finaleTier){return tier===3?4.6:tier===2?3.9:3.2}
function finalePose(t,tier){const duration=finaleDuration(tier),entry=Math.max(0,Math.min(1,(t-duration+.8)/.8)),ease=entry*entry*(3-2*entry);const bounce=reducedMotion?0:Math.abs(Math.sin(t*(tier===3?4.5:tier===2?5:3.8)))*(tier===3?125:tier===2?80:42);const spin=reducedMotion?0:tier===3?Math.min(1,t/1.6)*Math.PI*4:tier===2?Math.min(1,t/1.15)*Math.PI*2:Math.sin(t*3)*.12;return {rise:-bounce*(1-ease)-63*ease,turn:spin*(1-ease),scale:1-.72*ease,alpha:1-.40*ease}}
function drawFinalBridge(beat){if(beat<END_BEAT-16)return;const reveal=Math.min(1,(beat-(END_BEAT-16))/16),fraction=gems.length?notes/gems.length:0,from=at(END_BEAT-8),to=at(END_BEAT),step=(to-from)/16;for(let i=0;i<16;i++){const x=from+i*step-world;if(x+step<0||x>(viewRight+100)||i/16>reveal)continue;const charged=i<Math.round(fraction*16);ctx.save();ctx.globalAlpha=charged?.82:.24;const color=charged?fraction>=.85?'#f2d48b':'#9addc8':'#c5b6d0';ctx.shadowColor=color;ctx.shadowBlur=charged&&!reducedMotion?10:0;roundRect(x+5,FLOOR+5,step-10,7,4,color);ctx.shadowBlur=0;ctx.fillStyle=charged?'#9c7b45':'#988b9f';ctx.font='bold 19px Georgia';ctx.textAlign='center';ctx.fillText(charged?'♪':'◇',x+step/2,FLOOR+40);ctx.restore()}}
function drawAwakeningPortal(beat,t){const x=at(END_BEAT)-world;if(x>(viewRight+100))return;const wake=Math.max(0,Math.min(1,(beat-(END_BEAT-16))/16)),pulse=Math.exp(-(beat%1)*8);ctx.save();ctx.translate(x,385);if(wake>0){ctx.fillStyle='rgba(255,224,158,'+(wake*.09)+')';ctx.beginPath();ctx.ellipse(0,0,96+wake*35,150+wake*20,0,0,7);ctx.fill();ctx.strokeStyle='rgba(216,185,232,'+(wake*.4)+')';ctx.lineWidth=3;ctx.setLineDash([9,14]);ctx.beginPath();ctx.ellipse(0,0,85,125,reducedMotion?0:t*.08,0,7);ctx.stroke();ctx.setLineDash([])}ctx.shadowColor=wake>.7?'#ffe2a0':'#bda0d6';ctx.shadowBlur=reducedMotion?0:12+wake*22;ctx.strokeStyle=wake>.7?'#f5d88d':'#ead7ef';ctx.lineWidth=18;ctx.beginPath();ctx.ellipse(0,0,64+pulse*2,98+pulse*2,0,0,7);ctx.stroke();ctx.shadowBlur=0;ctx.strokeStyle='#b08ac6';ctx.lineWidth=6;ctx.stroke();ctx.fillStyle='rgba(211,178,225,'+(.18+wake*.20)+')';ctx.fill();for(let i=0;i<12;i++){const a=i*Math.PI/6+(reducedMotion?0:t*.18),r=80+wake*12;ctx.globalAlpha=.3+wake*.7;ctx.fillStyle=i%2?'#fff2c1':'#d4b8e5';ctx.beginPath();ctx.arc(Math.cos(a)*r,Math.sin(a)*r*1.35,2+wake,0,7);ctx.fill()}ctx.globalAlpha=1;ctx.fillStyle='#785284';ctx.font='bold 18px Trebuchet MS';ctx.textAlign='center';ctx.fillText(wake>.9?'TU MELODÍA ABRIÓ EL PORTAL':'PORTAL',0,147);ctx.restore()}
function drawFinaleBanner(){if(state!=='celebrating')return;const alpha=Math.min(1,celebrate/.4);ctx.save();ctx.globalAlpha=alpha;ctx.textAlign='center';ctx.fillStyle=finaleTier===3?'#967443':'#73577e';ctx.font='bold 30px Trebuchet MS';const title=mode==='practice'?'¡Tu práctica abrió el portal!':finaleTier===3?'¡El cielo entero celebra contigo!':finaleTier===2?'¡Tu melodía iluminó el cielo!':'¡Abriste el portal!';ctx.font='bold 22px Trebuchet MS';ctx.fillText(finaleTier===3?'¡El cielo celebra contigo!':'¡Abriste el portal!',420,245);if(mode==='normal'){const visible=Math.min(finaleTier,Math.floor(celebrate/.45)+1);ctx.font='52px Trebuchet MS';ctx.fillStyle='#bf9751';ctx.fillText('★'.repeat(visible)+'☆'.repeat(3-visible),420,311)}ctx.font='17px Trebuchet MS';ctx.fillStyle='#896d7d';ctx.fillText(notes+' notas iluminaron el camino',420,346);ctx.restore()}
function updateFinale(dt){celebrate+=dt;cameraKick=Math.max(0,cameraKick-dt);flash=Math.max(0,flash-dt);animateParticles(dt);const count=mode==='practice'?0:Math.min(finaleTier,Math.floor(celebrate/.45)+1);while(finalePops<count){finalePops++;tone([659,784,988][finalePops-1],.2,.025);if(finaleTier===3&&!reducedMotion)burst(world+PLAYER_X+180+finalePops*140,100+finalePops%2*55,22,true)}song.volume=.65*Math.max(0,Math.min(1,(finaleDuration()-celebrate)/1.2));if(celebrate>=finaleDuration())finish(true)}

function enemyY(e,t){return e.y+Math.sin((t-timeAt(e.beat))*Math.PI*2/BEAT)*e.amplitude}
function drawEnemies(t){for(const e of enemies){const x=e.x-world;if(x< -70||x>(viewRight+100))continue;const yy=enemyY(e,musicTime);ctx.save();ctx.translate(x,yy);const flap=Math.sin(t*16+e.beat)*.6;ctx.fillStyle=e.color;for(const side of [-1,1]){ctx.save();ctx.scale(side,1);ctx.rotate(flap);ctx.beginPath();ctx.ellipse(27,-4,25,12,-.45,0,7);ctx.fill();ctx.restore()}ctx.fillStyle='#665477';ctx.beginPath();ctx.ellipse(0,0,e.radius+4,e.radius+1,0,0,7);ctx.fill();ctx.fillStyle=e.color;ctx.beginPath();ctx.ellipse(0,2,e.radius-2,e.radius-2,0,0,7);ctx.fill();ctx.fillStyle='#49374f';for(const side of [-1,1]){ctx.beginPath();ctx.ellipse(side*7,-1,3,5,0,0,7);ctx.fill()}ctx.strokeStyle='#49374f';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,7,5,Math.PI,Math.PI*2);ctx.stroke();ctx.restore()}}
let viewW=1280,viewH=720,viewScale=1,viewTop=96,viewLeft=205,viewRight=1235;
function resizeGame(){const box=canvas.getBoundingClientRect?.();const ratio=box?.width&&box?.height?box.width/box.height:16/9;viewH=720;viewW=720*ratio;canvas.width=Math.round(viewW);canvas.height=viewH;viewScale=1;viewTop=96;viewLeft=Math.min(300,viewW*.16);viewRight=viewW-viewLeft+PLAYER_X;if(ratio<1&&state==='playing')pause()}
window.addEventListener('resize',resizeGame);resizeGame();
async function mobileFullscreen(){try{await document.documentElement?.requestFullscreen?.();await screen.orientation?.lock?.('landscape')}catch{}resizeGame()}
function draw(t) {
  const beat = beatAt(musicTime), pulse = Math.exp(-(beat % 1) * 8);
  ctx.clearRect(0,0,viewW,viewH);ctx.save();
  const bg = ctx.createLinearGradient(0, 0, 0, 720);
  const palette=paletteAt(beat);bg.addColorStop(0,palette[0]);bg.addColorStop(.55,palette[1]);bg.addColorStop(1,palette[2]);
  ctx.fillStyle=bg;ctx.fillRect(0,0,viewW,viewH);ctx.translate(viewLeft-PLAYER_X*viewScale,viewTop);ctx.scale(viewScale,viewScale);ctx.fillStyle=palette[2];ctx.fillRect(-600,FLOOR,viewRight+800,2000);ctx.save();if(!reducedMotion&&cameraKick>0)ctx.translate(Math.sin(t*57)*cameraKick*8,Math.cos(t*43)*cameraKick*5);
  drawAurora(beat);
  ctx.fillStyle = '#fff0c4'; ctx.beginPath(); ctx.arc(650, 135, 57, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff5';
  for (let i = 0; i < 4; i++) {
    const x = ((i * 410 - world * .04) % 1700 + 1700) % 1700 - 160, cy = 145 + (i % 2) * 30;
    ctx.beginPath(); ctx.ellipse(x, cy, 90, 18, 0, 0, 7); ctx.ellipse(x + 25, cy - 10, 43, 24, 0, 0, 7); ctx.fill();
  }
  ctx.fillStyle = '#fff4'; ctx.beginPath(); ctx.ellipse(200, 700, 350, 65, 0, 0, 7); ctx.ellipse(960, 720, 460, 80, 0, 0, 7); ctx.fill();

  for(const p of platforms)drawLevelPlatform(p,beat);

  // Señales: ↑ salto, ↑↑ doble salto (en el aire), ↟ trampolín. Se colorean según cómo las jugaste.
  ctx.textAlign = 'center'; ctx.font = 'bold 20px Trebuchet MS';
  for (const c of jumpCues) {
    const x = c.x - world; if (x < PLAYER_X - 60 || x >(viewRight+100)) continue;
    const dir=ruleAt(c.time)==='invert'?-1:1,base=dir===-1?CEILING:FLOOR;const cy=c.air?base-dir*160:base+dir*18;
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
    ctx.fillText(c.spring ? '↟' : c.double ? '↑↑' : '↑', x, cy + 7);
  }
  ctx.globalAlpha = 1; ctx.textAlign = 'start';

  for (const o of obstacles) { const x=o.x-world;if(x>-160&&x<(viewRight+100)){ctx.save();if(o.gravity===-1){ctx.translate(0,o.y*2);ctx.scale(1,-1)}drawObstacle(o,x,beat);ctx.restore()}}
  for (const pad of trampolines){const x=pad.x-world;if(x>-80&&x<(viewRight+100)){ctx.save();if(pad.gravity===-1){ctx.translate(0,pad.y*2);ctx.scale(1,-1)}drawTrampoline(pad,x,beat);ctx.restore()}}drawInteractive(beat);
  for (const n of gems) if (!n.taken) {
    const x = n.x - world; if (x < -40 || x >(viewRight+100)) continue;
    ctx.shadowColor = '#fff3bc'; ctx.shadowBlur = 9; ctx.fillStyle = n.bonus ? '#8a559d' : '#b98726'; ctx.font = 'bold 38px Georgia';
    ctx.fillText('♪', x - 12, n.y + 5 + Math.sin(beat * Math.PI * 2) * 2); ctx.shadowBlur = 0;
  }

  drawFinalBridge(beat);drawAwakeningPortal(beat,t);

  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life)); ctx.fillStyle = p.color;
    if (p.confetti) { ctx.save(); ctx.translate(p.x - world, p.y); ctx.rotate(t*3+p.x);if(state==='celebrating'&&finaleTier>=2){ctx.font=(finaleTier===3?'17px':'20px')+' Georgia';ctx.fillText(finaleTier===3?'✦':'♪',-p.r,p.r)}else ctx.fillRect(-p.r,-p.r,p.r*2,p.r);ctx.restore(); }
    else { ctx.beginPath(); ctx.arc(p.x - world, p.y, p.r, 0, 7); ctx.fill(); }
  }
  // Estela musical
  ctx.fillStyle = '#78c8b5';
  for (let i = 0; i < trail.length; i += 3) {
    const p = trail[i]; ctx.globalAlpha = p.life / .3 * .23;
    ctx.beginPath(); ctx.arc(p.x - world, p.y, 8 + p.life * 24, 0, 7); ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Personaje
  const win = state === 'celebrating' || (state === 'end' && winning);
  const pose=win?finalePose(celebrate,finaleTier):{rise:0,turn:0,scale:1,alpha:1};const bounce=win?pose.rise:0;
  ctx.save();
  ctx.filter=(SKINS.find(s=>s.id===selectedSkin)||SKINS[0]).filter;if(playerRule==='fly'){ctx.fillStyle='#fff9';ctx.beginPath();ctx.ellipse(PLAYER_X-42,y+8,22,9,-.4,0,7);ctx.ellipse(PLAYER_X+42,y+8,22,9,.4,0,7);ctx.fill()}
  ctx.translate(PLAYER_X + (state === 'hurt' && reactionKind === 'ouch' ? Math.sin(t * 65) * 7 : 0), y + bounce);
  ctx.rotate(win ? pose.turn : grounded ? Math.sin(beat * Math.PI * 2) * .025 : Math.max(-.22, vy * .0004));
  if(gravityDir===-1)ctx.scale(1,-1);
  const squash=landing>0?1+landing*.6:1;ctx.scale(squash*pose.scale,pose.scale/squash);
  ctx.globalAlpha=(inv>0?.6+.4*Math.sin(t*24):1)*pose.alpha;
  const falling = !grounded && vy > 100 && platformBelow() === Infinity;
  if (win) face(2);
  else if (state === 'hurt') face(reactionKind === 'fall' ? 0 : 1);
  else if (falling) face(0);
  else if(selectedFace==='smile')face(2);
  else if (!sprite('character', -37, -37, 74, 74)) {
    ctx.fillStyle = '#80cfbb'; ctx.beginPath(); ctx.moveTo(0, -32); ctx.lineTo(32, 0); ctx.lineTo(0, 32); ctx.lineTo(-32, 0); ctx.fill();
  }
  ctx.restore();if(collection.length===3){ctx.fillStyle='#fff2b8';ctx.beginPath();ctx.arc(PLAYER_X+Math.sin(beat*2)*44,y+Math.cos(beat*2)*44,3,0,7);ctx.fill()}

  ctx.textAlign = 'center';
  if (state === 'hurt') { ctx.fillStyle = '#674259'; ctx.font = 'bold 23px Trebuchet MS'; ctx.fillText(reactionKind === 'fall' ? '¡Oooh!' : '¡Auch!', PLAYER_X, y - 62); }
  // Calificación flotante: sigue al personaje, sin taparlo
  const textY = Math.min(352, y - 70);
  for (const f of floaters) {
    const rise = (1 - f.life / .75) * 26, pop = 1 + Math.max(0, f.life - .6) * 2;
    ctx.globalAlpha = Math.min(1, f.life / .3);
    ctx.font = `900 ${Math.round(26 * f.size * pop)}px Trebuchet MS`;
    ctx.lineWidth = 6; ctx.strokeStyle = '#fff8f0'; ctx.strokeText(f.text, PLAYER_X+100, textY - rise + f.dy);
    ctx.fillStyle = f.color; ctx.fillText(f.text, PLAYER_X+100, textY - rise + f.dy);
  }
  drawEnemies(t);drawFinaleBanner();ctx.globalAlpha=1;ctx.textAlign='start';ctx.restore();if(!reducedMotion&&flash>0){ctx.fillStyle='rgba(255,246,220,'+Math.min(.16,flash)+')';ctx.fillRect(-600,-1000,viewRight+800,3000)}ctx.restore();
}

// ------------------------------------------------------------------------ interfaz
function formatScore(n) { return n.toLocaleString('es-CL'); }
const starText = n => '★'.repeat(n) + '☆'.repeat(3 - n);
function updateHUD() {
  const b = beatAt(musicTime);
  $('hearts').textContent=mode==='practice'?'PRÁCTICA':'NORMAL';$('attempt').textContent='Intento '+attempt;$('percent').textContent=progressPercent()+' %';$('checkpointBtn').style.display=mode==='practice'?'block':'none';$('deleteCheckpoint').style.display=mode==='practice'?'block':'none';$('checkpointBtn').textContent='＋ '+personalCheckpoints.length;$('modeHint').textContent=mode==='practice'?'Sin estrellas · C: checkpoint · Z: quitar':'Anterior '+lastAttemptProgress+' % · Mejor '+best.progress+' %';
  $('notes').textContent = `♪ ${notes} / ${gems.length}`;
  $('score').textContent = `★ ${formatScore(score)}`;
  $('combo').textContent = speedAt(b)===2?'⚡ ×2':'↑ '+(2-jumpsUsed)+'/2';
  $('bar').style.width = Math.min(100,musicTime/songEndTime()*100)+'%';
  const pulse = Math.exp(-(b % 1) * 9);
  $('pulse').style.transform = `scale(${1 + pulse * .18})`;
  $('pulse').style.background = `rgba(128,203,187,${.45 + pulse * .5})`;
  if (state === 'playing') {
    const label=b<4?'Toca para saltar':b<8?'Otro toque: doble salto':playerRule==='fly'?'Mantén para volar':playerRule==='invert'?'Salta hacia abajo':'';
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
  $('best').textContent = best.stars ? `MEJOR: ${starText(best.stars)} · ★ ${formatScore(best.score)}`
    : best.progress ? `MEJOR AVANCE: ${best.progress} %` : 'EXPLORA LAS RUTAS ALTAS';
}

async function playMusic() {
  try { if(song.ended&&state==='playing'){completeSong();return true}await song.play();syncClock();errorText='';return true; }
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

function clearAttempt(){finaleTier=0;finalePops=0;lives=3;notes=0;bonusNotes=0;held=false;score=0;combo=0;stats=newStats();particles=[];floaters=[];trail=[];jumpQueued=null;lastGroundT=0;jumpsUsed=0;maxReachedBeat=0;route=null;inv=0;landing=0;reaction=0;celebrate=0;springBoost=0;reactionKind='';winning=false;musicTime=0;world=0;setRule('run',true);makeLevel();resetPortals(0)}
async function reset(){if(state==='loading')return;song.pause();state='loading';attempt++;save('vectorbeat.attempts4.'+mode,attempt);personalCheckpoints=[];checkpoint=null;clearAttempt();$('menu').style.display='none';hideOverlay();$('hud').style.display='flex';$('beatHint').style.display='block';$('mascot').style.display='none';$('pause').textContent='Ⅱ';song.volume=.65;song.muted=!sound;seekPending=false;if(song.readyState<3){$('beatHint').textContent='Cargando música…';await waitForSong()}if(state!=='loading')return;song.currentTime=0;syncClock();state='playing';updateHUD();await playMusic()}
function manualRetry(){if(state!=='playing')return;lastAttemptProgress=Math.floor(Math.min(100,maxReachedBeat/END_BEAT*100));if(mode==='normal'){best.progress=Math.max(best.progress,lastAttemptProgress);save('vectorbeat.bestMobile6',best)}song.pause();respawn()}
function startMode(next){mobileFullscreen();mode=next;attempt=load('vectorbeat.attempts4.'+mode,0);lastAttemptProgress=0;reset()}


function jump() {
  if (state !== 'playing' || seekPending) return;
  held = true; jumpQueued = songClock();
}
function release() { held = false; }

function showPause() {
  showCard('card'); $('mascot').style.display = 'none'; $('results').style.display = 'none'; $('record').style.display = 'none'; $('stars').style.display = 'none';
  $('message').textContent = 'Un pequeño descanso';
  $('detail').textContent = 'La música y el camino continúan juntos cuando tú quieras.';
  $('again').textContent = 'Continuar'; $('pause').textContent = 'Ⅱ';
}
function pause() {
  if (state === 'playing') { state = 'paused'; song.pause(); held = false; jumpQueued = null; showPause(); }
  else if (state === 'paused') { state = 'playing'; hideOverlay(); $('pause').textContent = 'Ⅱ'; playMusic(); }
}
function hurt(kind='ouch'){if(inv>0||state!=='playing')return;reactionKind=kind;reaction=.12;held=false;jumpQueued=null;stats.hurts++;combo=0;trail=[];song.pause();state='hurt';lastAttemptProgress=Math.floor(Math.min(100,maxReachedBeat/END_BEAT*100));if(mode==='normal'){best.progress=Math.max(best.progress,lastAttemptProgress);save('vectorbeat.bestMobile6',best)}tone(kind==='fall'?150:180,.08,.02);updateHUD()}
async function respawn(){attempt++;save('vectorbeat.attempts4.'+mode,attempt);if(mode==='practice'&&checkpoint){restoreSnapshot(checkpoint);held=false;jumpQueued=null;particles=[];floaters=[];trail=[];inv=.15}else clearAttempt();const t=musicTime;seekPending=Math.abs(song.currentTime-t)>.01;state='playing';song.currentTime=t;syncClock();song.volume=.65;hideOverlay();updateHUD();if(document.hidden){pause();return}await playMusic();if(!song.seeking)seekPending=false}


song.addEventListener('seeked', () => { seekPending = false; musicTime = song.currentTime; syncClock(); world = distanceAt(beatAt(musicTime)); });
song.addEventListener('playing',syncClock);song.addEventListener('ended',completeSong);
song.addEventListener('error', () => {
  enableStart();
  if (state === 'playing') {
    song.pause(); state = 'paused'; showPause();
    $('detail').textContent = 'No se pudo cargar la música. Comprueba que music.mp3 esté en la misma carpeta que el juego.';
  }
});

function victory(){if(state!=='playing')return;finaleTier=mode==='normal'?starRating(true):0;finalePops=0;state='celebrating';winning=true;held=false;celebrate=0;reactionKind='happy';setRule('run',true);y=FLOOR-RADIUS;vy=0;floaters=[];burst(world+PLAYER_X,140,finaleTier===3?70:finaleTier===2?40:20,true);tone(784,.2,.015);$('beatHint').textContent=mode==='practice'?'¡Práctica completada!':'Tu melodía está despertando el portal…'}
function finish(win) {
  state = 'end'; held = false; winning = win; song.pause();
  showCard('card');$('card').setAttribute('data-finale',String(win?finaleTier:0));
  const stars = starRating(win), acc = accuracy(), progress = Math.min(100, Math.floor(maxReachedBeat / END_BEAT * 100));
  $('mascot').style.display = win ? 'block' : 'none';
  $('stars').style.display=win&&mode==='normal'?'block':'none';
  $('stars').textContent = starText(stars); $('stars').setAttribute('aria-label', `${stars} de 3 estrellas`);
  $('results').style.display = 'flex';
  $('stats').innerHTML = [
    ['Puntaje', `★ ${formatScore(score)}`], ['Precisión', `${Math.round(acc * 100)} %`],
    ['Perfecto', stats.perfect], ['Bien', stats.good], ['Temprano / Tarde', stats.early + stats.late],
    ['Fallos', stats.miss], ['Mejor combo', stats.maxCombo],
    ['Notas', `${notes} / ${gems.length}`], ['Notas de la ruta alta',bonusNotes],['Cristales secretos',secrets.filter(c=>c.taken).length+' / 3'],['Intento',attempt],
  ].map(([k, v]) => `<span>${k}</span><b>${v}</b>`).join('');
  const record = mode==='normal' && win && (stars > best.stars || (stars === best.stars && score > best.score));
  if (record) { best.stars = stars; best.score = score; }
  if(mode==='normal'){best.progress=Math.max(best.progress,progress);unlockedStars=Math.max(unlockedStars,best.stars);save('vectorbeat.unlockedStars5',unlockedStars);save('vectorbeat.bestMobile6',best);if(win){collection=[...new Set([...collection,...secrets.filter(c=>c.taken).map(c=>c.id)])];save('vectorbeat.collection4',collection)}}renderBest();renderWardrobe();
  $('record').style.display = record ? 'block' : 'none';
  $('message').textContent = win ? mode==='practice'?'¡Práctica completada!':finaleTier===3?'¡El cielo entero celebra contigo!':finaleTier===2?'¡Tu melodía iluminó el cielo!':'¡Abriste el portal!' : 'Ya conoces un poco más el ritmo';
  const noteFrac = gems.length ? notes / gems.length : 0;
  let next=mode==='practice'?'La práctica no entrega estrellas ni desbloqueos. Prueba el modo normal.':'';
  if (win && mode==='normal' && stars === 1) next = 'Para ★★: 60 % de las notas y 60 % de precisión.';
  if (win && mode==='normal' && stars === 2) next = `Para ★★★: 85 % de las notas (${Math.round(noteFrac * 100)} % ahora; busca las violetas en la ruta alta), 80 % de precisión.`;
  if (win && mode==='normal' && stars === 3) next = '¡Tres estrellas!';
  const bias = averageOffset();
  const tip = Math.abs(bias) > .045 && stats.perfect + stats.good + stats.early + stats.late >= 8
    ? ` Tiendes a saltar ${Math.round(Math.abs(bias) * 1000)} ms ${bias > 0 ? 'tarde' : 'antes'}: prueba «Calibrar».` : '';
  $('detail').textContent = (win ? next : `Llegaste al ${progress} %. Mejor avance: ${best.progress} %. Cada intento te acerca al portal.`) + tip;
  $('again').textContent = 'Volver a jugar'; $('beatHint').style.display = 'none';
}
function averageOffset() {
  const offs = jumpCues.filter(c => c.offset !== undefined).map(c => c.offset);
  return offs.length ? offs.reduce((a, b) => a + b, 0) / offs.length : 0;
}

function goHome() {
  song.pause(); state = 'menu'; held = false; winning = false; jumpQueued = null; stopCalibration();
  $('menu').style.display = 'block'; hideOverlay(); $('hud').style.display = 'none'; $('beatHint').style.display = 'none';
  renderBest();
}

function renderWardrobe(){const current=SKINS.find(s=>s.id===selectedSkin);if(!current||Math.max(best.stars,unlockedStars)<current.stars)selectedSkin='mint';if(selectedFace==='smile'&&Math.max(best.stars,unlockedStars)<2)selectedFace='classic';$('skinChoices').innerHTML='';for(const skin of SKINS){const button=document.createElement('button');button.type='button';button.textContent=skin.name+(Math.max(best.stars,unlockedStars)<skin.stars?' · '+skin.stars+' ★':'');button.disabled=Math.max(best.stars,unlockedStars)<skin.stars;button.style.background=skin.color;button.setAttribute('aria-pressed',String(selectedSkin===skin.id));button.onclick=()=>{selectedSkin=skin.id;save('vectorbeat.skin4',selectedSkin);renderWardrobe()};$('skinChoices').appendChild(button)}$('faceChoice').value=selectedFace;$('smileOption').disabled=Math.max(best.stars,unlockedStars)<2;$('faceChoice').onchange=()=>{selectedFace=$('faceChoice').value;save('vectorbeat.face4',selectedFace)};$('secretRecord').textContent='Cristales descubiertos: '+collection.length+' / 3 · '+(collection.length===3?'Efecto festivo desbloqueado':'Encuéntralos en modo normal');}
function validLevel(map){if(map.enemies!==undefined&&(!Array.isArray(map.enemies)||map.enemies.length>100||map.enemies.some(e=>!Number.isFinite(e.beat)||e.beat<0||e.beat>END_BEAT||!Number.isFinite(e.y)||e.y<120||e.y>450||!Number.isFinite(e.radius)||e.radius<8||e.radius>24||!Number.isFinite(e.amplitude)||e.amplitude<0||e.amplitude>25||!/^#[0-9a-f]{6}$/i.test(e.color))))throw Error('Enemigo inválido');if(map.portals?.some(p=>p.kind&&!['speed','reset'].includes(p.kind)))throw Error('Portal inválido');if(!map||!Number.isFinite(map.durationSeconds)||Math.abs(map.durationSeconds-192.048)>.2||map.version!==5||map.bpm!==BPM||map.endBeat!==END_BEAT)throw Error('Usa un mapa v5 de la canción completa: 92,5 BPM y 296 pulsos');for(const key of ['sections','portals','phrases','flightObstacles','flightNotes','rings','secrets','accents'])if(!Array.isArray(map[key])||map[key].length>2000)throw Error('Falta o es demasiado grande: '+key);if(map.sections.length<4||map.sections.length>16||map.secrets.length!==3)throw Error('El mapa necesita entre 4 y 16 tramos y 3 secretos');let last=-1;for(const v of map.sections){if(!Number.isFinite(v.startBeat)||v.startBeat<=last||!Number.isFinite(v.pixelsPerBeat)||v.pixelsPerBeat<80||v.pixelsPerBeat>400||!Array.isArray(v.palette)||v.palette.length!==3||v.palette.some(c=>!/^#[0-9a-f]{6}$/i.test(c))||!/^#[0-9a-f]{6}$/i.test(v.groundTint))throw Error('Tramo inválido');last=v.startBeat}for(const list of [map.portals,map.phrases,map.flightObstacles,map.rings,map.accents])for(const v of list)if(!Number.isFinite(v.time)||v.time<0||v.time>map.durationSeconds)throw Error('Tiempo inválido');if(map.sections[0].startBeat!==0||map.sections.at(-1).startBeat>=END_BEAT)throw Error('Los tramos deben comenzar en 0 y terminar antes del portal');if(map.portals.some((p,i)=>i&&p.time<=map.portals[i-1].time))throw Error('Ordena los portales por tiempo');for(const o of map.flightObstacles)if(!['cone','rock','fire'].includes(o.kind)||!['floor','ceiling'].includes(o.surface)||!Number.isFinite(o.height)||o.height<20||o.height>220)throw Error('Obstáculo de vuelo inválido');for(const r of map.rings)if(!Number.isFinite(r.y)||r.y<80||r.y>520)throw Error('Anillo inválido');if(new Set(map.secrets.map(c=>c.id)).size!==3)throw Error('Los cristales necesitan IDs únicos');if(map.portals.some(p=>!['run','invert','fly'].includes(p.rule)))throw Error('Regla de portal inválida');if(map.phrases.some(p=>!['single','pair','triple','gap','ring-gap','spring'].includes(p.pattern)||!['cone','rock','fire'].includes(p.obstacle)||!['floor','ceiling'].includes(p.surface)))throw Error('Frase inválida');for(const n of [...map.flightNotes,...map.secrets])if(!Number.isFinite(n.beat)||n.beat<0||n.beat>END_BEAT||!Number.isFinite(n.y)||n.y<80||n.y>520)throw Error('Coleccionable inválido');return true}
async function importMap(e){const file=e.target.files?.[0];if(!file)return;try{if(file.size>150000)throw Error('El mapa es demasiado grande');const map=JSON.parse(await file.text());validLevel(map);LEVEL=map;goHome();makeLevel();$('mapStatus').textContent='Mapa cargado: '+map.title}catch(err){$('mapStatus').textContent='No se cargó: '+err.message}e.target.value=''}

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

// ------------------------------------------------------------------------ bucle
function frame(ms) {
  const dt = Math.min((ms - lastFrame) / 1000, .04); lastFrame = ms; animTime += dt;
  if(state==='playing'){if(song.ended&&!seekPending)completeSong();else updateFromMusic(ms);updateHUD()}
  else if (state === 'hurt') { reaction -= dt; if (reactionKind === 'fall') y = Math.min(635, y + 90 * dt * gravityDir); if (reaction <= 0) respawn(); }
  else if(state==='celebrating')updateFinale(dt);
  else if (state === 'calibrating') updateCalibration();
  for (const f of floaters) f.life -= dt;
  floaters = floaters.filter(f => f.life > 0);
  draw(animTime);
  requestAnimationFrame(frame);
}

// ----------------------------------------------------------------------- eventos
function enableStart() { $('start').disabled = false; $('start').textContent = 'Jugar'; }
if (song.readyState < 3) {
  $('start').disabled = true; $('start').textContent = 'Cargando…';
  song.addEventListener('canplay', enableStart, {once: true});
  setTimeout(enableStart, 3000);  // algunos móviles no precargan audio sin un toque
}
$('settingsOpen').onclick=()=>{$('settings').hidden=false};$('settingsClose').onclick=()=>{$('settings').hidden=true};$('exitToMenu').onclick=()=>{$('settings').hidden=true;goHome()};
$('start').onclick=()=>startMode('normal');$('practiceStart').onclick=()=>startMode('practice');$('checkpointBtn').onclick=placeCheckpoint;$('deleteCheckpoint').onclick=removeCheckpoint;$('wardrobeOpen').onclick=()=>{$('wardrobe').hidden=!$('wardrobe').hidden;renderWardrobe()};$('mapInput').onchange=importMap;
$('again').onclick=()=>state==='paused'?pause():reset();
$('pause').onclick = pause;
$('home').onclick = goHome;
$('sound').onclick = () => { sound = !sound; song.muted = !sound; $('sound').textContent = sound?'♫':'♩';$('sound').setAttribute('aria-pressed',String(sound)); };
$('calibrate').onclick = ()=>{$('settings').hidden=true;openCalibration()};
$('calibStart').onclick = startCalibration;
$('calibReset').onclick = () => { calib = 0; save('vectorbeat.calib', 0); $('calibText').textContent = 'Ajuste restablecido a 0 ms.'; };
$('calibClose').onclick = closeCalibration;
$('calibPad').onpointerdown = e => { e.preventDefault(); calibTap(); };

canvas.onpointerdown = e => { e.preventDefault(); jump(); };
$('jump').onpointerdown = e => { e.preventDefault(); jump(); };
window.addEventListener('pointerup', release);
window.addEventListener('pointercancel', release);
window.addEventListener('keydown', e => {
  if (['Space', 'ArrowUp'].includes(e.code)) {
    e.preventDefault();
    if (e.repeat) return;
    if (state === 'calibrating') { calibTap(); return; }
    jump();
  }
  if(e.code==='KeyC'){e.preventDefault();placeCheckpoint()}if(e.code==='KeyZ'){e.preventDefault();removeCheckpoint()}if(e.code==='KeyR'&&state==='playing'){e.preventDefault();manualRetry()}
  if (e.code === 'KeyP' && state !== 'calibrating') pause();
  if (e.code === 'Escape' && state === 'calibrating') closeCalibration();
});
window.addEventListener('keyup', e => { if (['Space', 'ArrowUp'].includes(e.code)) release(); });
window.addEventListener('blur', () => { if (state === 'playing') pause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'playing') pause(); });

validLevel(LEVEL);makeLevel();renderBest();renderWardrobe();requestAnimationFrame(frame);
