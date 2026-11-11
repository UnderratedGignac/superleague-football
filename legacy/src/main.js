import { Game } from './game.js';
import { AudioEngine } from './audio.js';
import { TEAMS, STADIUMS, DIFFICULTIES, POWERS } from './data.js';

const $=s=>document.querySelector(s);
const audio=new AudioEngine();
const canvas=$('#game');
let game;
const cfg={home:0,away:1,stadium:'solaris',duration:4,difficulty:'pro',speed:1};
const keys=new Set();
let joy={x:0,y:0,active:false};
let orbiting=false,lastPX=0,lastPY=0;
let bannerTimer=null,toastTimer=null;

function crest(team,size=34){
  const c=team.css, a=team.css2;
  const shapes={
    phoenix:`<path d="M16 4 C10 10 8 16 12 24 C13 18 16 16 16 16 C16 16 19 18 20 24 C24 16 22 10 16 4 Z" fill="${a}"/><path d="M16 12 L18 20 L16 26 L14 20 Z" fill="${c}"/>`,
    bolt:`<path d="M18 3 L9 18 L15 18 L13 29 L23 13 L17 13 Z" fill="${a}"/>`,
    leaf:`<path d="M16 4 C8 10 7 20 16 28 C25 20 24 10 16 4 Z" fill="${a}"/><path d="M16 8 L16 26" stroke="${c}" stroke-width="2"/>`,
    star:`<path d="M16 3 L19 12 L29 12 L21 18 L24 28 L16 22 L8 28 L11 18 L3 12 L13 12 Z" fill="${a}"/><circle cx="16" cy="16" r="3" fill="${c}"/>`
  };
  return `<svg class="crest" width="${size}" height="${size}" viewBox="0 0 32 32"><defs><linearGradient id="g${team.id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c}"/><stop offset="1" stop-color="${a}"/></linearGradient></defs><path d="M16 1 L29 6 V16 C29 24 23 29 16 31 C9 29 3 24 3 16 V6 Z" fill="url(#g${team.id})" opacity=".28" stroke="${c}" stroke-width="1.5"/>${shapes[team.crest]}</svg>`;
}

function toast(msg){ const t=$('#toast'); t.textContent=msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>t.classList.remove('show'),2200); }

function renderMenu(){
  const grid=$('#teamGrid'); grid.innerHTML='';
  TEAMS.forEach((t,i)=>{
    const b=document.createElement('button'); b.className='team-card'+(i===cfg.home?' sel':''); b.style.setProperty('--tc',t.css);
    b.innerHTML=`${crest(t)}<div><b>${t.name}</b><small>${t.city} · ${t.style}</small></div>`;
    b.onclick=()=>{ cfg.home=i; if(cfg.away===i) cfg.away=(i+1)%TEAMS.length; audio.click(); renderMenu(); syncPreview(); };
    grid.appendChild(b);
  });
  const opp=$('#oppSelect'); opp.innerHTML='';
  TEAMS.forEach((t,i)=>{ if(i===cfg.home) return; const o=document.createElement('option'); o.value=i; o.textContent=`${t.name} — ${t.style}`; o.selected=i===cfg.away; opp.appendChild(o); });
  opp.onchange=()=>{ cfg.away=+opp.value; audio.click(); syncPreview(); };
  const sc=$('#stadiumChips'); sc.innerHTML='';
  STADIUMS.forEach(s=>{ const b=document.createElement('button'); b.className='chip'+(s.id===cfg.stadium?' sel':''); b.innerHTML=`${s.name}<small>${s.tag} · ${s.capacity}</small>`; b.onclick=()=>{ cfg.stadium=s.id; audio.click(); renderMenu(); game.setStadium(s.id); }; sc.appendChild(b); });
  const dc=$('#durationChips'); dc.innerHTML='';
  [3,4,6].forEach(d=>{ const b=document.createElement('button'); b.className='chip'+(d===cfg.duration?' sel':''); b.textContent=`${d} MIN`; b.onclick=()=>{ cfg.duration=d; audio.click(); renderMenu(); }; dc.appendChild(b); });
  const df=$('#diffChips'); df.innerHTML='';
  Object.entries(DIFFICULTIES).forEach(([k,v])=>{ const b=document.createElement('button'); b.className='chip'+(k===cfg.difficulty?' sel':''); b.textContent=v.label.toUpperCase(); b.onclick=()=>{ cfg.difficulty=k; audio.click(); renderMenu(); }; df.appendChild(b); });
  renderRoster();
}
function renderRoster(){
  const t=TEAMS[cfg.home]; const r=$('#rosterPanel');
  r.innerHTML=`<div class="roster-head">${crest(t,44)}<div><b>${t.name}</b><small>${t.city} · ${t.formation} · ${t.style}</small></div></div><h3 style="font-size:11px;letter-spacing:.25em;color:var(--muted);margin:0 0 8px">STARTING V</h3>`;
  t.players.forEach((p,i)=>{
    const pw=POWERS[p.power];
    const row=document.createElement('div'); row.className='pl-row'+(i>=5?' pl-bench':'');
    row.innerHTML=`<div class="pl-num">${p.num}</div><div class="pl-info"><b>${p.name}</b><small>${p.role} · ${i>=5?'BENCH':'STARTER'}</small></div><div class="pl-pw" style="color:${pw.css}">${pw.icon} ${p.powerName}</div>`;
    r.appendChild(row);
    if(i===4){ const d=document.createElement('div'); d.className='divider'; r.appendChild(d); const h=document.createElement('h3'); h.style.cssText='font-size:11px;letter-spacing:.25em;color:var(--muted);margin:0 0 8px'; h.textContent='BENCH'; r.appendChild(h); }
  });
}
function syncPreview(){ game.buildTeams(cfg.home,cfg.away); game.resetPositions(0); game.state='menu'; }

function statsTable(g){
  const s=g.stats, t=g.teams;
  const poss=Math.round(s[0].possession/Math.max(1,s[0].possession+s[1].possession)*100);
  const rows=[['Shots',s[0].shots,s[1].shots],['On target',s[0].onTarget,s[1].onTarget],['Passes',s[0].passes,s[1].passes],['Tackles',s[0].tackles,s[1].tackles],['Powers used',s[0].powers,s[1].powers],['Saves',s[0].saves,s[1].saves],['Fouls',s[0].fouls,s[1].fouls],['Yellow cards',s[0].yellow,s[1].yellow],['Possession',poss+'%',(100-poss)+'%']];
  return `<table class="stats-table"><tr><td>${t[0].short}</td><td></td><td>STAT</td><td></td><td>${t[1].short}</td></tr>${rows.map(r=>`<tr><td>${r[1]}</td><td></td><td>${r[0]}</td><td></td><td>${r[2]}</td></tr>`).join('')}</table>`;
}
// Wait: table layout above is wrong; build simpler 3-col
function statsTable2(g){
  const s=g.stats,t=g.teams; const tot=Math.max(1,s[0].possession+s[1].possession);
  const poss=Math.round(s[0].possession/tot*100);
  const rows=[['Shots',s[0].shots,s[1].shots],['On target',s[0].onTarget,s[1].onTarget],['Passes',s[0].passes,s[1].passes],['Tackles',s[0].tackles,s[1].tackles],['Powers',s[0].powers,s[1].powers],['Saves',s[0].saves,s[1].saves],['Fouls',s[0].fouls,s[1].fouls],['Yellows',s[0].yellow,s[1].yellow],['Possession',poss+'%',(100-poss)+'%']];
  return `<table class="stats-table"><tr><td style="color:${t[0].css};font-family:var(--display);font-size:20px">${t[0].short}</td><td style="text-align:center;color:var(--muted)">VS</td><td style="color:${t[1].css};font-family:var(--display);font-size:20px">${t[1].short}</td></tr>${rows.map(r=>`<tr><td>${r[1]}</td><td>${r[0]}</td><td>${r[2]}</td></tr>`).join('')}</table>`;
}

let subOut=null;
function renderSubs(container,teamIdx=0){
  const team=game.teams[teamIdx]; if(!team){container.innerHTML='';return;}
  const active=team.players.filter(p=>p.active&&!p.sentOff);
  const bench=team.players.filter(p=>!p.active&&!p.sentOff);
  container.innerHTML=`<div class="sub-grid"><div class="sub-col"><h4>ON PITCH (${active.length}) · SUBS ${team.subsUsed||0}/5</h4><div id="subActive"></div></div><div class="sub-col"><h4>BENCH (${bench.length})</h4><div id="subBench"></div></div></div>`;
  const a=container.querySelector('#subActive'), b=container.querySelector('#subBench');
  active.forEach(p=>{ const row=document.createElement('div'); row.className='sub-row'+(subOut===p?' sel':''); row.innerHTML=`<div class="pl-num">${p.num}</div><div class="pl-info"><b>${p.name}</b><small>${p.role} · ${POWERS[p.powerType].icon} ${p.powerName}</small></div><div class="stam"><div class="bar stamina"><i style="width:${p.stamina}%"></i></div></div>`; row.onclick=()=>{ subOut=p; renderSubs(container,teamIdx); }; a.appendChild(row); });
  bench.forEach(p=>{ const row=document.createElement('div'); row.className='sub-row'+(!subOut?' dis':''); row.innerHTML=`<div class="pl-num">${p.num}</div><div class="pl-info"><b>${p.name}</b><small>${p.role} · ${POWERS[p.powerType].icon} ${p.powerName}</small></div><div class="pl-pw" style="color:${POWERS[p.powerType].css}">ON ▶</div>`; row.onclick=()=>{ if(!subOut){toast('Select a player on the pitch first.');return;} if(game.substitute(subOut,p)){ subOut=null; renderSubs(container,teamIdx); toast(`${p.name} comes on!`); } else toast('Substitution not available.'); }; b.appendChild(row); });
  if(!bench.length) b.innerHTML='<div class="sub" style="padding:10px">No substitutes remaining.</div>';
}

function renderPauseTab(tab){
  document.querySelectorAll('#pauseTabs .tab').forEach(t=>t.classList.toggle('sel',t.dataset.tab===tab));
  const c=$('#pauseContent');
  if(tab==='resume'){ c.innerHTML=`<div class="btn-row"><button class="btn primary" id="resumeBtn">RESUME ▶</button><button class="btn" id="restartBtn2">Restart match</button><button class="btn ghost" id="quitBtn2">Quit to menu</button></div><div class="divider"></div>${statsTable2(game)}`; $('#resumeBtn').onclick=()=>game.resume(); $('#restartBtn2').onclick=()=>startMatch(); $('#quitBtn2').onclick=quitToMenu; }
  else if(tab==='subs'){ c.innerHTML='<div id="subsWrap"></div>'; subOut=null; renderSubs($('#subsWrap'),0); }
  else if(tab==='controls'){ c.innerHTML=`<div class="controls-grid">${[['Move','W A S D / Arrows'],['Sprint','SHIFT'],['Pass / switch','J'],['Shoot (hold to charge)','K'],['Slide tackle','L'],['Superpower','SPACE'],['Switch player','Q'],['Pause / tactics','ESC'],['Camera','C'],['Mute','M'],['Orbit camera','Right-drag'],['Zoom','Mouse wheel']].map(r=>`<div class="ctrl"><span>${r[0]}</span><kbd>${r[1]}</kbd></div>`).join('')}</div><div class="btn-row"><button class="btn primary" id="resumeBtn3">RESUME ▶</button></div>`; $('#resumeBtn3').onclick=()=>game.resume(); }
  else if(tab==='settings'){ c.innerHTML=`<div class="settings-row"><label>Difficulty</label><select id="setDiff">${Object.entries(DIFFICULTIES).map(([k,v])=>`<option value="${k}" ${k===game.config.difficulty?'selected':''}>${v.label}</option>`).join('')}</select></div><div class="settings-row"><label>Game speed</label><select id="setSpeed">${[1,1.25,1.5].map(v=>`<option value="${v}" ${v===game.config.speed?'selected':''}>${v}×</option>`).join('')}</select></div><div class="settings-row"><label>Graphics quality</label><select id="setQuality">${['high','balanced','performance'].map(v=>`<option value="${v}" ${v===game.quality?'selected':''}>${v[0].toUpperCase()+v.slice(1)}</option>`).join('')}</select></div><div class="settings-row"><label>Sound</label><button class="btn" id="setSound">${audio.enabled?'ON 🔊':'OFF 🔇'}</button></div><div class="settings-row"><label>Camera</label><button class="btn" id="setCam">${game.camMode===0?'Broadcast':'Tactical'}</button></div><div class="btn-row"><button class="btn primary" id="resumeBtn4">RESUME ▶</button><button class="btn" id="restartBtn3">Restart</button><button class="btn ghost" id="quitBtn3">Quit</button></div>`;
    $('#setDiff').onchange=e=>{game.config.difficulty=e.target.value;toast('Difficulty: '+DIFFICULTIES[e.target.value].label);};
    $('#setSpeed').onchange=e=>{game.config.speed=+e.target.value;toast('Speed '+e.target.value+'×');};
    $('#setQuality').onchange=e=>{game.setQuality(e.target.value);toast('Quality: '+e.target.value);};
    $('#setSound').onclick=()=>{toggleSound();renderPauseTab('settings');};
    $('#setCam').onclick=()=>{game.camMode=1-game.camMode;renderPauseTab('settings');};
    $('#resumeBtn4').onclick=()=>game.resume(); $('#restartBtn3').onclick=()=>startMatch(); $('#quitBtn3').onclick=quitToMenu;
  }
}

function onState(state){
  $('#menu').classList.toggle('hidden',state!=='menu');
  $('#scoreboard').classList.toggle('hidden',state==='menu');
  $('#hud').classList.toggle('hidden',state==='menu');
  $('#pauseOverlay').classList.toggle('hidden',state!=='paused');
  $('#halfOverlay').classList.toggle('hidden',state!=='halftime');
  $('#fullOverlay').classList.toggle('hidden',state!=='fulltime');
  $('#pauseBtn').style.visibility=state==='menu'?'hidden':'visible';
  if(state==='paused') renderPauseTab('resume');
  if(state==='halftime'){ $('#halfSub').textContent=`${game.teams[0].name} ${game.score[0]} – ${game.score[1]} ${game.teams[1].name}`; $('#halfStats').innerHTML=statsTable2(game); subOut=null; renderSubs($('#halfSubs'),0); }
  if(state==='fulltime'){
    const w=game.score[0]===game.score[1]?-1:(game.score[0]>game.score[1]?0:1);
    $('#winnerText').textContent=w<0?'HONOURS EVEN':`${game.teams[w].name} WIN!`;
    $('#winnerText').style.color=w<0?'var(--text)':game.teams[w].css;
    $('#finalScore').textContent=`${game.score[0]} – ${game.score[1]}`;
    $('#fullSub').textContent=`${game.teams[0].name} vs ${game.teams[1].name} · ${game.world.stadium.name}`;
    $('#fullStats').innerHTML=statsTable2(game);
  }
  if(state==='playing'||state==='kickoff'||state==='deadball') canvas.focus();
}
function addEvent(ev){
  const feed=$('#eventFeed'); const d=document.createElement('div'); d.className='ev '+ev.type; d.innerHTML=`<span class="ic">${ev.icon}</span><span>${ev.text}</span>`;
  feed.prepend(d); while(feed.children.length>4) feed.lastChild.remove();
  setTimeout(()=>{ d.style.opacity='0'; d.style.transition='opacity .5s'; setTimeout(()=>d.remove(),500); },6000);
}
function showBanner(b){
  const el=$('#powerBanner'); $('#pbTitle').textContent=b.text; $('#pbSub').textContent=b.sub; el.style.color=b.color; el.classList.add('show');
  clearTimeout(bannerTimer); bannerTimer=setTimeout(()=>el.classList.remove('show'),2100);
}

let lastHud={};
function updateHUD(){
  const g=game; if(g.state==='menu') return;
  const t=g.teams;
  if(lastHud.teams!==t){ $('#sbHome').innerHTML=`${crest(t[0],26)}<span>${t[0].short}</span>`; $('#sbAway').innerHTML=`<span>${t[1].short}</span>${crest(t[1],26)}`; lastHud.teams=t; }
  $('#sbScore').textContent=`${g.score[0]} – ${g.score[1]}`;
  $('#sbClock').textContent=g.clockLabel(); $('#sbHalf').textContent=g.half===1?'1ST HALF':'2ND HALF';
  const p=g.controlled;
  if(p){ const pw=POWERS[p.powerType];
    $('#pcNum').textContent=p.num; $('#pcNum').style.color=t[0].css; $('#pcName').textContent=p.name; $('#pcRole').textContent=`${p.role} · ${t[0].name}`;
    $('#pcPwIcon').textContent=pw.icon; $('#pcPwIcon').style.color=pw.css; $('#pcPwName').textContent=p.powerName;
    const ready=p.power>=100&&p.cooldown<=0; $('#pcPwState').textContent=ready?'READY — SPACE':(p.empowered>0?'EMPOWERED':`CHARGING ${Math.floor(p.power)}%`);
    $('#pcEnergy').style.width=p.power+'%'; $('#pcEnergyPct').textContent=Math.floor(p.power)+'%';
    $('#pcStam').style.width=p.stamina+'%'; $('#pcStamPct').textContent=Math.floor(p.stamina)+'%';
    $('#playerCard').style.borderLeftColor=t[0].css;
  }
  $('#chargeBar').style.opacity=g.input.shootHeld?1:0; $('#chargeFill').style.width=(g.charge*100)+'%';
  // center state
  const cs=$('#centerState'), title=$('#csTitle'), sub=$('#csSub');
  if(g.state==='kickoff'){ cs.style.display='block'; title.textContent=Math.ceil(g.kickoffTimer); sub.textContent='KICK OFF'; }
  else if(g.state==='deadball'){ cs.style.display='block'; title.textContent=(g.deadType||'RESTART').toUpperCase(); sub.textContent=g.teams[g.restartTeam].name; }
  else if(g.state==='goal'&&g.goalPhase==='celebrate'){ cs.style.display='block'; title.textContent='GOAL!'; sub.textContent=g.goalData?.scorer?.name||''; }
  else cs.style.display='none';
  $('#replayTag').classList.toggle('hidden',!(g.state==='goal'&&g.goalPhase==='replay'));
  $('#skipBtn').classList.toggle('hidden',!(g.state==='goal'&&g.goalPhase==='replay'));
  // mobile power button cooldown
  const pb=document.querySelector('.act.power'); if(pb&&p){ const pct=p.power; pb.style.background=pct>=100?'rgba(255,63,164,.25)':`conic-gradient(rgba(255,63,164,.35) ${pct*3.6}deg, rgba(13,20,36,.75) 0deg)`; }
  drawMinimap();
}
function drawMinimap(){
  const c=$('#minimapCanvas'),ctx=c.getContext('2d'),w=c.width,h=c.height;
  ctx.clearRect(0,0,w,h); ctx.fillStyle='rgba(20,60,35,.9)'; ctx.fillRect(0,0,w,h);
  const mx=x=>8+(x+38)/76*(w-16), mz=z=>8+(z+24)/48*(h-16);
  ctx.strokeStyle='rgba(255,255,255,.35)'; ctx.lineWidth=1; ctx.strokeRect(8,8,w-16,h-16);
  ctx.beginPath(); ctx.moveTo(w/2,8); ctx.lineTo(w/2,h-8); ctx.stroke();
  ctx.beginPath(); ctx.arc(w/2,h/2,12,0,Math.PI*2); ctx.stroke();
  for(const p of game.players){ if(!p.active||p.sentOff) continue; ctx.fillStyle=game.teams[p.team].css; ctx.beginPath(); ctx.arc(mx(p.pos.x),mz(p.pos.z),p.role==='GK'?3:3.5,0,Math.PI*2); ctx.fill(); if(p===game.controlled){ ctx.strokeStyle='#fff'; ctx.lineWidth=1.5; ctx.beginPath(); ctx.arc(mx(p.pos.x),mz(p.pos.z),6,0,Math.PI*2); ctx.stroke(); } }
  ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(mx(game.ball.pos.x),mz(game.ball.pos.z),2.5,0,Math.PI*2); ctx.fill();
}

function startMatch(){ audio.init(); game.startMatch(cfg); $('#eventFeed').innerHTML=''; onState(game.state); }
function quitToMenu(){ game.state='menu'; game.preview(); $('#eventFeed').innerHTML=''; onState('menu'); renderMenu(); }
function toggleSound(){ audio.setEnabled(!audio.enabled); $('#soundBtn').textContent=audio.enabled?'🔊':'🔇'; $('#soundBtn').classList.toggle('off',!audio.enabled); }

function updateInput(){
  if(joy.active){ game.input.mx=joy.x; game.input.mz=joy.y; }
  else { let x=0,z=0; if(keys.has('KeyA')||keys.has('ArrowLeft'))x-=1; if(keys.has('KeyD')||keys.has('ArrowRight'))x+=1; if(keys.has('KeyW')||keys.has('ArrowUp'))z-=1; if(keys.has('KeyS')||keys.has('ArrowDown'))z+=1; game.input.mx=x; game.input.mz=z; }
  game.input.sprint=keys.has('ShiftLeft')||keys.has('ShiftRight')||sprintHeld;
}
let sprintHeld=false;

window.addEventListener('keydown',e=>{
  if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Tab'].includes(e.code)) e.preventDefault();
  if(e.repeat) { keys.add(e.code); return; }
  keys.add(e.code);
  if(e.code==='KeyM'){ toggleSound(); return; }
  if(e.code==='KeyC'){ game.camMode=1-game.camMode; toast(game.camMode===0?'Broadcast camera':'Tactical camera'); return; }
  if(e.code==='Escape'){ if(game.state==='paused') game.resume(); else if(game.state!=='menu'&&game.state!=='fulltime'&&game.state!=='halftime') game.pause(); return; }
  if(game.state==='menu'){ if(e.code==='Enter') startMatch(); return; }
  if(game.state==='paused') return;
  if(e.code==='KeyJ') game.queueAction('pass');
  if(e.code==='KeyK') game.shootStart();
  if(e.code==='KeyL') game.queueAction('tackle');
  if(e.code==='Space') game.queueAction('power');
  if(e.code==='KeyQ') game.queueAction('switch');
});
window.addEventListener('keyup',e=>{ keys.delete(e.code); if(e.code==='KeyK') game.shootRelease(); });
window.addEventListener('blur',()=>{ keys.clear(); joy.active=false; sprintHeld=false; game.input.shootHeld=false; });

canvas.addEventListener('contextmenu',e=>e.preventDefault());
canvas.addEventListener('pointerdown',e=>{ if(e.button===2){ orbiting=true; lastPX=e.clientX; lastPY=e.clientY; canvas.setPointerCapture(e.pointerId); } canvas.focus(); });
canvas.addEventListener('pointermove',e=>{ if(orbiting){ game.orbit(e.clientX-lastPX,e.clientY-lastPY); lastPX=e.clientX; lastPY=e.clientY; } });
canvas.addEventListener('pointerup',e=>{ orbiting=false; });
canvas.addEventListener('wheel',e=>{ e.preventDefault(); game.zoom(e.deltaY); },{passive:false});

// mobile
const joystick=$('#joystick'), knob=$('#joystickKnob');
function joyMove(e){ const r=joystick.getBoundingClientRect(); const cx=r.left+r.width/2, cy=r.top+r.height/2; let dx=e.clientX-cx, dy=e.clientY-cy; const m=Math.hypot(dx,dy), max=r.width/2-20; if(m>max){dx=dx/m*max;dy=dy/m*max;} knob.style.transform=`translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px))`; joy.x=dx/max; joy.y=dy/max; joy.active=true; }
joystick.addEventListener('pointerdown',e=>{ joystick.setPointerCapture(e.pointerId); joyMove(e); });
joystick.addEventListener('pointermove',e=>{ if(joy.active) joyMove(e); });
joystick.addEventListener('pointerup',()=>{ joy.active=false; joy.x=joy.y=0; knob.style.transform='translate(-50%,-50%)'; });
joystick.addEventListener('pointercancel',()=>{ joy.active=false; joy.x=joy.y=0; knob.style.transform='translate(-50%,-50%)'; });
document.querySelectorAll('.act').forEach(b=>{
  const act=b.dataset.act;
  b.addEventListener('pointerdown',e=>{ e.preventDefault(); b.setPointerCapture(e.pointerId); audio.init();
    if(act==='shoot') game.shootStart(); else if(act==='sprint') sprintHeld=true; else game.queueAction(act);
  });
  b.addEventListener('pointerup',e=>{ if(act==='shoot') game.shootRelease(); if(act==='sprint') sprintHeld=false; });
  b.addEventListener('pointercancel',()=>{ if(act==='shoot') game.shootRelease(); sprintHeld=false; });
});

$('#soundBtn').onclick=toggleSound;
$('#camBtn').onclick=()=>{ game.camMode=1-game.camMode; toast(game.camMode===0?'Broadcast camera':'Tactical camera'); };
$('#fsBtn').onclick=()=>{ if(document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.(); };
$('#pauseBtn').onclick=()=>{ if(game.state==='paused') game.resume(); else game.pause(); };
$('#kickoffBtn').onclick=startMatch;
$('#pauseTabs').addEventListener('click',e=>{ const t=e.target.closest('.tab'); if(t) renderPauseTab(t.dataset.tab); });
$('#secondHalfBtn').onclick=()=>{ game.resumeSecondHalf(); onState(game.state); };
$('#halfQuitBtn').onclick=quitToMenu;
$('#rematchBtn').onclick=startMatch;
$('#changeTeamsBtn').onclick=quitToMenu;
$('#skipBtn').onclick=()=>{ if(game.state==='goal'){ game.goalPhase='celebrate'; game.goalTimer=0; for(const p of game.activePlayers(game.goalData.team)) p.celebrate=2.6; } };
window.addEventListener('resize',()=>game.resize());

// boot
try {
  game=new Game(canvas,audio,{ state:onState, event:addEvent, banner:showBanner, toast, frame:updateHUD });
} catch(err){
  document.body.innerHTML=`<div style="padding:40px;font-family:sans-serif;color:#fff"><h2>WebGL unavailable</h2><p>${err.message}</p><p>Please use a modern browser with hardware acceleration enabled.</p></div>`;
  throw err;
}
window.__game=game; window.__audio=audio;
renderMenu();
onState('menu');
let last=performance.now();
function loop(t){ const dt=(t-last)/1000; last=t; updateInput(); game.tick(dt); requestAnimationFrame(loop); }
requestAnimationFrame(loop);
