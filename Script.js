/* ===== Canvas & Globals ===== */
const canvas = document.getElementById('game');
const c = canvas.getContext('2d');
const W = canvas.width, H = canvas.height;

let input = { left:false, right:false, up:false };
let deaths = 0, levelIndex = 0;
let totalLevels = 320; // 320 hard levels

// Difficulty (default HARD)
let difficulty = localStorage.getItem('difficulty') || 'hard';
const diffTag = document.getElementById('diffTag');
const setDiffTag = ()=>{ diffTag.textContent = (difficulty==='hard'?'HARD':'EASY'); diffTag.classList.toggle('hard', difficulty==='hard'); };

// Progress (unlocked)
let unlockedLevels = Number(localStorage.getItem('unlockedLevelsV2') || 1);
if (unlockedLevels < 1) unlockedLevels = 1;

const camera = { x:0, y:0 };

// Player
const playerBase = { x:80, y:H-260, w:40, h:52, vx:0, vy:0, onGround:false, alive:true, spawn:{x:80,y:H-260} };
let player = JSON.parse(JSON.stringify(playerBase));

// Physics tuned for smooth touch
const GRAV=0.66, FRICTION=0.86, MOVE=0.72, JUMP=12.2, MAXVX=5.4, MAXVY=18.5;
const EPS=8;

// Colors
const COL = { bg:'#0a0d1e', solid:'#6ea2ff', spike:'#ff3b6b', fake:'#ffd166', move:'#b38cff', door:'#8bffc0', haz:'#ff9f1c', wall:'#ff5858', checkpoint:'#ff1d5e', grass:'#00ff8c' };

// Sounds
const sndJump = new Audio('https://actions.google.com/sounds/v1/cartoon/wood_plank_flicks.ogg');
const sndDeath = new Audio('https://actions.google.com/sounds/v1/alarms/beep_short.ogg');
const sndDoor  = new Audio('https://actions.google.com/sounds/v1/cartoon/pop.ogg');
const sndDing  = new Audio('https://actions.google.com/sounds/v1/cartoon/clang_and_wobble.ogg');

/* ===== Entities ===== */
class Rect { constructor(x,y,w,h,type='solid'){ this.x=x; this.y=y; this.w=w; this.h=h; this.type=type; this.vx=0; this.vy=0; this.range=0; this.t=0; this.dir=1; this.fall=false; this.remove=false; } }
class Spike { constructor(x,y,w,h,hidden=false){ this.x=x; this.y=y; this.w=w; this.h=h; this.hidden=hidden; } }
class Door { constructor(x,y,fake=false){ this.x=x; this.y=y; this.w=38; this.h=56; this.open=false; this.fake=fake; } }
class Hazard { constructor(x,y,r,axis='x',speed=3.6,range=170){ this.x=x; this.y=y; this.r=r; this.axis=axis; this.speed=speed; this.range=range; this.t=0; this.dir=1; } }
class CrusherWall { constructor(x,y,w,h,axis='x',speed=3.1,range=650){ this.x=x; this.y=y; this.w=w; this.h=h; this.axis=axis; this.speed=speed; this.range=range; this.t=0; this.dir=1; } }
class MovingSpike { constructor(x,y,w,h,axis='y',speed=3.5,range=150){ this.x=x; this.y=y; this.w=w; this.h=h; this.axis=axis; this.speed=speed; this.range=range; this.t=0; this.dir=1; } }
class Checkpoint { constructor(x,y){ this.x=x; this.y=y; this.r=16; this.active=false; } }

/* ===== Helpers ===== */
function aabb(a,b){ return a.x<b.x+b.w && a.x+a.w>b.x && a.y<b.y+b.h && a.y+a.h>b.y; }
function aabbCircle(px,py,pw,ph, cx,cy,cr){ const rx=Math.max(px, Math.min(cx, px+pw)); const ry=Math.max(py, Math.min(cy, py+ph)); const dx = cx - rx, dy = cy - ry; return dx*dx + dy*dy <= cr*cr; }
function makeSpawnPad(spawn, solids){ solids.push(new Rect(spawn.x-10, spawn.y+playerBase.h+2, 70, 10, 'solid')); }

// Deterministic PRNG for procedural levels
function rng(seed){ let s = seed|0; return ()=>{ s = (s*1664525 + 1013904223)>>>0; return s/4294967296; } }

/* ===== Procedural Levels (320) ===== */
function makeLevel(index){
  const S=[], sp=[], doors=[], hz=[], walls=[], msp=[], cps=[];
  const r = rng(1000 + index*7 + (difficulty==='hard'?99999:0));
  const width = 2000 + Math.floor(r()*700); // level length
  S.push(new Rect(0, H-60, width+400, 60)); // base floor

  // spawn
  const spawn = { x: 80, y: H-260 };
  makeSpawnPad(spawn, S);

  // platforms
  const platCount = 8 + Math.floor(r()*6) + (difficulty==='hard'?4:0);
  let x = 260;
  for(let i=0;i<platCount;i++){
    const y = H - (160 + Math.floor(r()*140)) - ((difficulty==='hard' && r()<0.35)?Math.floor(r()*80):0);
    const w = 80 + Math.floor(r()*120);
    const tRoll = r();
    let type = 'solid';
    if(tRoll<0.18) type='fake'; else if(tRoll<0.36) type='move';
    const p = new Rect(x,y,w,(difficulty==='hard'?16:18),type);
    if(type==='move'){
      if(r()<0.5){ p.vx = 2.2 + r()*2.6; p.range = 150 + r()*180; }
      else       { p.vy = 2.0 + r()*2.6; p.range = 130 + r()*180; }
    }
    if(r()<0.24) p.fall = true;
    S.push(p); x += w + 110 + Math.floor(r()*140);
  }

  // spikes
  const spikeBands = 6 + Math.floor(r()*6) + (difficulty==='hard'?4:0);
  for(let i=0;i<spikeBands;i++){
    const sx = 420 + Math.floor(r()*(width-600));
    const sw = 30 + Math.floor(r()*60);
    const hidden = r()<0.25; // some hidden
    sp.push(new Spike(sx, H-78, sw, 18, hidden));
  }

  // moving saws
  const saws = 3 + Math.floor(r()*3) + (difficulty==='hard'?2:0);
  for(let i=0;i<saws;i++){
    const ax = r()<0.5?'x':'y';
    const cx = 400 + Math.floor(r()*(width-500));
    const cy = H- (160 + Math.floor(r()*240));
    const spd = (difficulty==='hard'?4.1:3.4) + r()*1.8;
    const rnge = 160 + r()*240;
    hz.push(new Hazard(cx,cy, 16+(r()*6), ax, spd, rnge));
  }

  // moving spike bars
  const bars = 2 + Math.floor(r()*3) + (difficulty==='hard'?2:0);
  for(let i=0;i<bars;i++){
    const ax = r()<0.5?'x':'y';
    const bx = 600 + Math.floor(r()*(width-700));
    const by = H - (140 + Math.floor(r()*260));
    const w = 40 + Math.floor(r()*40);
    const h = 18;
    const spd = (difficulty==='hard'?3.8:3.0) + r()*1.6;
    const rnge = 130 + r()*180;
    const ms = new MovingSpike(bx,by,w,h,ax,spd,rnge); msp.push(ms);
  }

  // crushers & walls
  if(r()<0.75){ const c1 = new Rect(1100, 60, 120, 20, 'move'); c1.vy = (difficulty==='hard'?4.0:3.2); c1.range = 240 + r()*100; S.push(c1); }
  if(r()<0.65){ const wall = new CrusherWall(300 + r()*500, H-280, 24, 320, 'x', (difficulty==='hard'?3.4:2.6), 740 + r()*600); walls.push(wall); }

  // door (some fake)
  const doorX = width - 120; const doorY = H-220; const fake = r()<0.22; doors.push(new Door(doorX, doorY, fake));

  // checkpoints 1–2
  const cpCount = 1 + (r()<0.5?1:0);
  for(let i=0;i<cpCount;i++){
    const cx = 450 + Math.floor(r()*(width-700));
    const cy = H - (220 + Math.floor(r()*160));
    cps.push(new Checkpoint(cx,cy));
  }

  S.push(new Rect(doorX-60, H-140, 120, 18, 'solid')); // near-door safety

  return { solids:S, spikes:sp, doors, hazards:hz, walls, mspikes:msp, checkpoints:cps, spawn, width };
}

/* ===== World State ===== */
let world = makeLevel(0);
let currentCheckpoint = null; // {x,y}
player.spawn = { ...world.spawn };
player.x = player.spawn.x; player.y = player.spawn.y;

/* ===== UI Wiring ===== */
document.getElementById('restart').onclick = () => doRestart();
document.getElementById('openLevelSelect').onclick = () => openLevelSelect();

const startMenu = document.getElementById('startMenu');
const btnPlay = document.getElementById('btnPlay');
const diffEasy = document.getElementById('diffEasy');
const diffHard = document.getElementById('diffHard');

function setDifficulty(d){ difficulty = d; localStorage.setItem('difficulty', d); diffEasy.classList.toggle('active', d==='easy'); diffHard.classList.toggle('active', d==='hard'); setDiffTag(); }
diffEasy.onclick = ()=> setDifficulty('easy');
diffHard.onclick = ()=> setDifficulty('hard');
setDiffTag();

btnPlay.onclick = ()=>{ startMenu.style.display='none'; say("Let's go!"); };

window.addEventListener('keydown', e=>{
  if(['ArrowLeft','a','A'].includes(e.key)) input.left = true;
  if(['ArrowRight','d','D'].includes(e.key)) input.right = true;
  if(['ArrowUp','w','W',' '].includes(e.key)) input.up = true;
  if(['r','R'].includes(e.key)) doRestart();
  if(e.key==='Escape') startMenu.style.display='flex';
});
window.addEventListener('keyup', e=>{
  if(['ArrowLeft','a','A'].includes(e.key)) input.left = false;
  if(['ArrowRight','d','D'].includes(e.key)) input.right = false;
  if(['ArrowUp','w','W',' '].includes(e.key)) input.up = false;
});

/* ===== FAST Touch Controls (pointer-first) ===== */
function bindPressImmediate(id, onDown, onUp){
  const el = document.getElementById(id);
  const down = ev=>{ ev.preventDefault(); onDown(); };
  const up   = ev=>{ ev.preventDefault(); onUp(); };
  ['pointerdown','touchstart','mousedown'].forEach(t=> el.addEventListener(t,down,{passive:false}));
  ['pointerup','pointercancel','touchend','touchcancel','mouseup','mouseleave'].forEach(t=> el.addEventListener(t,up,{passive:false}));
}
bindPressImmediate('btnLeft', ()=>input.left=true,  ()=>input.left=false);
bindPressImmediate('btnRight',()=>input.right=true, ()=>input.right=false);
bindPressImmediate('btnJump', ()=>input.up=true,     ()=>input.up=false);

/* ===== HUD ===== */
function updateHUD(){
  document.getElementById('deaths').textContent = `Deaths: ${deaths}`;
  document.getElementById('level').textContent  = `Level: ${levelIndex+1} / ${totalLevels}`;
  setDiffTag();
}

/* ===== Core Systems ===== */
function resetToSpawn(){
  player = JSON.parse(JSON.stringify(playerBase));
  if(currentCheckpoint) player.spawn = { x:currentCheckpoint.x-20, y:currentCheckpoint.y-playerBase.h-6 };
  else player.spawn = { ...world.spawn };
  player.x = player.spawn.x; player.y = player.spawn.y; player.alive = true;
  blinkNow = true; // reset blink
}

function doRestart(){ deaths++; resetToSpawn(); updateHUD(); document.getElementById('overlay').style.display='none'; say("Try again!"); }

function nextLevel(){
  levelIndex++;
  if(levelIndex >= totalLevels) levelIndex = 0;
  world = makeLevel(levelIndex);
  currentCheckpoint = null;
  resetToSpawn();
  updateHUD();
  const need = levelIndex+1; if(unlockedLevels < need){ unlockedLevels = need; localStorage.setItem('unlockedLevelsV2', String(unlockedLevels)); }
  say('Next level!');
}

function kill(){ if(!player.alive) return; player.alive=false; sndDeath.play(); document.getElementById('overlayText').textContent='💀 You Died!'; document.getElementById('overlay').style.display='flex'; say('Oof! That hurt.'); }

/* ===== Player Speech & Eye Blink (meme-ish) ===== */
const speech = document.getElementById('speech');
const linesIdle = [
  "Let's move!","Focus.","You got this!","Speed run time!","Trust no tile.",
  "Pro gamer moment.","EZ clap?","Sheeeesh.","No cap, we win.","Touch grass—neon grass.",
];
const linesDanger = [
  "Nope!","Too close!","Trap spotted!","Not today.","Bruh.","Skill issue?","Outplayed myself.","Sus tile.","Hold my web.",
];
let lastSay = 0;
function say(text){ speech.textContent=text; speech.style.display='block'; lastSay=performance.now(); setTimeout(()=>{ if(performance.now()-lastSay>=1200) speech.style.display='none'; },1300); }

// Eye blink timer
let blinkTimer = 0, blinkNow = false;

/* ===== Tick ===== */
function tick(){
  requestAnimationFrame(tick);

  if(player.alive){
    if(input.left)  player.vx -= MOVE;
    if(input.right) player.vx += MOVE;
    if(input.up && player.onGround){ player.vy = -JUMP; player.onGround=false; sndJump.play(); }
  }

  // Cap horizontal speed
  if(player.vx >  MAXVX) player.vx =  MAXVX;
  if(player.vx < -MAXVX) player.vx = -MAXVX;

  // physics
  player.vy += GRAV; if(player.vy > MAXVY) player.vy = MAXVY;
  player.x  += player.vx; player.y += player.vy;
  if(player.onGround) player.vx *= FRICTION; player.onGround=false;

  // solids
  for(const r of world.solids){
    if(r.type==='move'){
      if(r.vx){ r.t += r.vx*r.dir; if(Math.abs(r.t)>r.range) r.dir*=-1; r.x += r.vx*r.dir; }
      if(r.vy){ r.t += r.vy*r.dir; if(Math.abs(r.t)>r.range) r.dir*=-1; r.y += r.vy*r.dir; }
    }
    if(r.fall && aabb(player,r)) r.vy = 3.4;
    r.y += r.vy;
    if(r.remove) continue;
    if(aabb(player,r)){
      if(r.type==='fake'){ r.remove=true; player.vy = 7.4; say('It was fake!'); }
      else if(player.y + player.h <= r.y + EPS){ player.y = r.y - player.h; player.vy=0; player.onGround=true; }
      else if(player.y >= r.y + r.h - EPS){ player.y = r.y + r.h; player.vy=0; }
      else if(player.x + player.w/2 < r.x + r.w/2){ player.x = r.x - player.w; player.vx=0; }
      else { player.x = r.x + r.w; player.vx=0; }
    }
  }

  // moving spike bars
  for(const ms of world.mspikes){
    if(ms.axis==='x'){ ms.t+=ms.speed*ms.dir; if(Math.abs(ms.t)>ms.range) ms.dir*=-1; ms.x += ms.speed*ms.dir; }
    else             { ms.t+=ms.speed*ms.dir; if(Math.abs(ms.t)>ms.range) ms.dir*=-1; ms.y += ms.speed*ms.dir; }
    if(aabb(player,ms)) kill();
  }

  // hazards saws
  for(const h of world.hazards){
    if(h.axis==='x'){ h.t+=h.speed*h.dir; if(Math.abs(h.t)>h.range) h.dir*=-1; h.x += h.speed*h.dir; }
    else             { h.t+=h.speed*h.dir; if(Math.abs(h.t)>h.range) h.dir*=-1; h.y += h.speed*h.dir; }
    if(aabbCircle(player.x,player.y,player.w,player.h, h.x,h.y,h.r)) kill();
    if(Math.abs((player.x+player.w/2)-h.x)<70 && Math.abs((player.y+player.h/2)-h.y)<70 && Math.random()<0.002) say(linesDanger[Math.floor(Math.random()*linesDanger.length)]);
  }

  // crusher walls
  for(const w of world.walls){
    if(w.axis==='x'){ w.t+=w.speed*w.dir; if(Math.abs(w.t)>w.range) w.dir*=-1; w.x += w.speed*w.dir; }
    else             { w.t+=w.speed*w.dir; if(Math.abs(w.t)>w.range) w.dir*=-1; w.y += w.speed*w.dir; }
    if(aabb(player,w)) kill();
  }

  // spikes
  for(const s of world.spikes){ if(aabb(player,s)) kill(); }

  // doors
  for(const d of world.doors){ const rect={x:d.x,y:d.y-d.h,w:d.w,h:d.h}; if(aabb(player,rect)){ if(d.fake) kill(); else { d.open=true; sndDoor.play(); nextLevel(); } } }

  // checkpoints
  for(const cp of world.checkpoints){ if(aabbCircle(player.x,player.y,player.w,player.h, cp.x,cp.y, cp.r+6) && !cp.active){ cp.active = true; currentCheckpoint = {x:cp.x,y:cp.y}; sndDing.play(); say('Checkpoint!'); } }

  // safe neon grass floor (no falling out of world)
  if(player.y > H-36){ player.y = H-36 - player.h; player.vy = 0; player.onGround = true; if(Math.random()<0.003) say(linesIdle[Math.floor(Math.random()*linesIdle.length)]); }

  // camera
  camera.x = Math.max(0, Math.min(player.x - W*0.4, (world.width||2200)));

  // eye blink
  blinkTimer += 1; if(blinkTimer>110 || blinkNow){ blinkNow=false; blinkTimer = 0; }

  draw();
}

/* ===== Rendering ===== */
function neonShadow(glowColor, blur=18){ c.shadowColor=glowColor; c.shadowBlur=blur; c.shadowOffsetX=0; c.shadowOffsetY=0; }
function clearShadow(){ c.shadowColor='transparent'; c.shadowBlur=0; }

function drawSpiderman(px,py,w,h){
  // body
  neonShadow('#ff355e',14); c.fillStyle='#d32f2f'; c.fillRect(px,py,w,h);
  neonShadow('#2aa8ff',10); c.fillStyle='#1976d2'; c.fillRect(px,py+h*0.58,w,h*0.42); clearShadow();
  // eyes (blink)
  const blinking = (blinkTimer<6);
  neonShadow('#ffffff',8); c.fillStyle='#fff';
  if(!blinking){ c.beginPath(); c.ellipse(px+w*0.32,py+h*0.22,w*0.16,h*0.12,0,0,Math.PI*2); c.fill(); c.beginPath(); c.ellipse(px+w*0.68,py+h*0.22,w*0.16,h*0.12,0,0,Math.PI*2); c.fill(); }
  else { c.fillRect(px+w*0.22,py+h*0.22,w*0.2,3); c.fillRect(px+w*0.58,py+h*0.22,w*0.2,3); }
  clearShadow();
}

function draw(){
  // sky
  c.fillStyle = COL.bg; c.fillRect(0,0,W,H);
  c.save(); c.translate(-camera.x,0);

  // neon grass ground strip
  neonShadow('#00ffae',16); c.fillStyle = COL.grass; c.fillRect(-400, H-30, (world.width||2600)+800, 30); clearShadow();

  // solids
  for(const r of world.solids){ if(r.remove) continue; const color = r.type==='fake'?COL.fake:(r.type==='move'?COL.move:COL.solid); neonShadow('#2aa8ff',12); c.fillStyle=color; c.fillRect(r.x,r.y,r.w,r.h); clearShadow(); }

  // spikes
  for(const s of world.spikes){ if(!s.hidden){ neonShadow(COL.danger,14); c.fillStyle=COL.spike; } else { c.fillStyle='rgba(255,59,107,0.07)'; } c.fillRect(s.x,s.y,s.w,s.h); clearShadow(); }

  // moving spike bars
  for(const ms of world.mspikes){ neonShadow(COL.danger,14); c.fillStyle=COL.spike; c.fillRect(ms.x,ms.y,ms.w,ms.h); clearShadow(); }

  // saws
  for(const h of world.hazards){ c.save(); c.translate(h.x,h.y); neonShadow('#ffb347',14); c.beginPath(); c.arc(0,0,h.r,0,Math.PI*2); c.fillStyle=COL.haz; c.fill(); clearShadow(); neonShadow('#ffd27f',10); for(let i=0;i<8;i++){ const a=(i/8)*Math.PI*2; c.beginPath(); c.moveTo(Math.cos(a)*h.r, Math.sin(a)*h.r); c.lineTo(Math.cos(a+0.2)*(h.r+6), Math.sin(a+0.2)*(h.r+6)); c.lineTo(Math.cos(a+0.4)*h.r, Math.sin(a+0.4)*h.r); c.fillStyle='#ffd27f'; c.fill(); } clearShadow(); c.restore(); }

  // crusher walls
  for(const w of world.walls){ neonShadow('#ff5858',18); c.fillStyle=COL.wall; c.fillRect(w.x,w.y,w.w,w.h); clearShadow(); }

  // doors
  for(const d of world.doors){ neonShadow(d.fake?'#ff355e':'#66ff99',14); c.fillStyle = d.open? '#66ff99' : (d.fake? '#ff355e' : COL.door); c.fillRect(d.x, d.y-d.h, d.w, d.h); clearShadow(); }

  // checkpoints
  for(const cp of world.checkpoints){ neonShadow(cp.active?'#66ff99':'#ff2c65',18); c.beginPath(); c.arc(cp.x,cp.y,cp.r,0,Math.PI*2); c.fillStyle = cp.active? '#6bff95' : COL.checkpoint; c.fill(); clearShadow(); }

  // player
  drawSpiderman(player.x,player.y,player.w,player.h);

  c.restore();
}

/* ===== Level Select (Paged) ===== */
let page = 0; const pageSize = 24;
function openLevelSelect(){
  const box = document.getElementById('levelSelect');
  const cont = document.getElementById('levelButtons');
  const render = ()=>{
    cont.innerHTML='';
    const start = page*pageSize;
    for(let i=start;i<Math.min(start+pageSize,totalLevels);i++){
      const b = document.createElement('button');
      const isUnlocked = (i < unlockedLevels);
      b.textContent = `Level ${i+1}`;
      if(!isUnlocked){ b.classList.add('locked'); b.textContent += ' 🔒'; }
      b.onclick = ()=>{ if(!isUnlocked) return; levelIndex=i; world=makeLevel(levelIndex); currentCheckpoint=null; resetToSpawn(); updateHUD(); closeLevelSelect(); };
      cont.appendChild(b);
    }
  };
  render();
  document.getElementById('prevPage').onclick = ()=>{ if(page>0){ page--; render(); } };
  document.getElementById('nextPage').onclick = ()=>{ if((page+1)*pageSize < totalLevels){ page++; render(); } };
  box.style.display='flex';
}
function closeLevelSelect(){ document.getElementById('levelSelect').style.display='none'; }

/* ===== Start ===== */
function init(){
  updateHUD();
  requestAnimationFrame(tick);
}
init();
// --- TOUCH CONTROLS (FAST RESPONSE) ---
const leftBtn = document.getElementById("btnLeft");
const rightBtn = document.getElementById("btnRight");
const jumpBtn = document.getElementById("btnJump");

// Left button
leftBtn.addEventListener("touchstart", e => {
  e.preventDefault();
  input.left = true;
});
leftBtn.addEventListener("touchend", e => {
  e.preventDefault();
  input.left = false;
});

// Right button
rightBtn.addEventListener("touchstart", e => {
  e.preventDefault();
  input.right = true;
});
rightBtn.addEventListener("touchend", e => {
  e.preventDefault();
  input.right = false;
});

// Jump button - fast trigger
jumpBtn.addEventListener("touchstart", e => {
  e.preventDefault();
  if (player.onGround && player.alive) {
    player.vy = -JUMP;  // instant jump
    player.onGround = false;
    sndJump.play();
  }
});
jumpBtn.addEventListener("touchend", e => {
  e.preventDefault();
  // no reset here - ensures instant jump works smoothly
});