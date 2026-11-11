import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { TEAMS, STADIUMS, DIFFICULTIES, POWERS, cloneTeam } from './data.js';
import { World, FIELD, createPlayerMesh, animatePlayer, createBall } from './world.js';
import { VFX } from './vfx.js';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const dist2=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const rand=(a,b)=>a+Math.random()*(b-a);
const L=FIELD.halfL, W=FIELD.halfW, HW=FIELD.goalW/2, GH=FIELD.goalH;

export class Game {
  constructor(canvas, audio, hooks={}){
    this.canvas=canvas; this.audio=audio; this.hooks=hooks;
    this.renderer=new THREE.WebGLRenderer({canvas, antialias:true, powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.6));
    this.renderer.shadowMap.enabled=true; this.renderer.shadowMap.type=THREE.PCFSoftShadowMap; this.renderer.shadowMap.autoUpdate=false;
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure=1.05;
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.quality='high'; this.frameTimes=[]; this.software=false; this.headless=false; this.screenT=0;
    try{ const gl=this.renderer.getContext(); const dbg=gl.getExtension('WEBGL_debug_renderer_info'); if(dbg){ const r=gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)||''; this.software=/swiftshader|software|llvmpipe/i.test(r); } }catch(e){}
    this.scene=new THREE.Scene();
    this.camera=new THREE.PerspectiveCamera(46,1,0.1,600);
    this.composer=new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene,this.camera));
    this.bloom=new UnrealBloomPass(new THREE.Vector2(1,1),0.5,0.55,1.0);
    this.composer.addPass(this.bloom); this.composer.addPass(new OutputPass());
    this.vfx=new VFX(this.scene);
    this.ballMesh=createBall(); this.scene.add(this.ballMesh);
    this.ballShadow=new THREE.Mesh(new THREE.PlaneGeometry(0.8,0.8),new THREE.MeshBasicMaterial({color:0x000000,transparent:true,opacity:0.35,depthWrite:false}));
    this.ballShadow.rotation.x=-Math.PI/2; this.scene.add(this.ballShadow);
    this.playersGroup=new THREE.Group(); this.scene.add(this.playersGroup);
    this.world=null; this.stadiumId='solaris';
    this.teams=[]; this.players=[]; this.meshes=new Map();
    this.ball={pos:new THREE.Vector3(0,0.22,0), vel:new THREE.Vector3(), owner:null, lastTouch:null, kicker:null, kickCd:0, power:null, powerT:0, curve:0, target:null, guided:0, shot:false, shotTeam:null, shotPower:0, saveCd:0};
    this.state='menu'; this.prevState=null; this.clock=0; this.half=1; this.score=[0,0];
    this.config={home:0,away:1,stadium:'solaris',duration:4,difficulty:'pro',speed:1};
    this.stats=this.freshStats();
    this.controlled=null; this.manualSwitch=0; this.autoSwitchT=0;
    this.input={mx:0,mz:0,sprint:false,shootHeld:false};
    this.charge=0; this.kickoffTeam=0; this.kickoffTimer=0;
    this.deadTimer=0; this.deadType=null; this.restartTeam=0; this.restartPos={x:0,z:0}; this.restartTaker=null;
    this.goalData=null; this.replayBuf=[]; this.snapT=0; this.goalTimer=0; this.goalPhase='';
    this.camMode=0; this.camYaw=0; this.camDist=48; this.camHeight=34; this.camTarget=new THREE.Vector3(); this.camPos=new THREE.Vector3(0,34,48);
    this.shake=0; this.hitstop=0; this.banner=null; this.events=[]; this.matchOver=false;
    this.time=0; this.acc=0; this.last=performance.now();
    this.setStadium('solaris');
    this.preview();
    this.resize();
    this.setQuality(this.software?'performance':'high');
  }
  setQuality(q){
    this.quality=q;
    const dpr=window.devicePixelRatio||1;
    if(q==='high'){ this.renderer.setPixelRatio(Math.min(dpr,1.6)); this.bloom.enabled=true; this.bloom.strength=0.5; }
    else if(q==='balanced'){ this.renderer.setPixelRatio(Math.min(dpr,1.15)); this.bloom.enabled=true; this.bloom.strength=0.35; }
    else { this.renderer.setPixelRatio(Math.min(dpr,0.8)); this.bloom.enabled=false; }
    this.resize();
  }
  freshStats(){ return [0,1].map(()=>({shots:0,onTarget:0,passes:0,tackles:0,powers:0,fouls:0,yellow:0,red:0,possession:0,saves:0})); }
  setStadium(id){
    if(this.world) this.world.dispose();
    this.stadiumId=id; const st=STADIUMS.find(s=>s.id===id)||STADIUMS[0];
    this.world=new World(this.renderer,this.scene,st);
    this.renderer.shadowMap.needsUpdate=true;
  }
  resize(){
    const w=this.canvas.clientWidth||window.innerWidth, h=this.canvas.clientHeight||window.innerHeight;
    this.renderer.setSize(w,h,false); this.composer.setSize(w,h);
    this.camera.aspect=w/h; this.camera.updateProjectionMatrix();
  }
  preview(){
    this.buildTeams(0,1);
    this.resetPositions(0);
    this.state='menu';
  }
  buildTeams(hi,ai){
    this.playersGroup.clear(); this.meshes.clear();
    this.teams=[cloneTeam(TEAMS[hi]),cloneTeam(TEAMS[ai])];
    this.teams[0].attackDir=1; this.teams[1].attackDir=-1;
    this.teams.forEach((team,ti)=>{ team.players.forEach(p=>{ p.team=ti; p.mesh=createPlayerMesh(p,team); this.meshes.set(p,p.mesh); this.playersGroup.add(p.mesh); }); });
    this.players=this.teams.flatMap(t=>t.players);
  }
  startMatch(cfg){
    this.config={...this.config,...cfg};
    if(this.config.stadium!==this.stadiumId) this.setStadium(this.config.stadium);
    this.buildTeams(this.config.home,this.config.away);
    this.score=[0,0]; this.clock=0; this.half=1; this.stats=this.freshStats(); this.matchOver=false;
    this.events=[]; this.replayBuf=[]; this.goalData=null; this.charge=0;
    this.kickoffTeam=0; this.controlled=null;
    this.vfx.clear();
    this.resetPositions(0);
    this.state='kickoff'; this.kickoffTimer=2.2;
    this.event('kickoff','🏟️',`${this.teams[0].name} vs ${this.teams[1].name} — ${this.world.stadium.name}`);
    this.audio.init(); this.audio.whistle();
    this.hooks.state&&this.hooks.state(this.state);
  }
  resetPositions(kickTeam){
    const base=[[-L+3,0,'GK'],[-17,0,'DEF'],[-5,-11,'LM'],[-5,11,'RM'],[8,0,'ST']];
    this.teams.forEach((team,ti)=>{
      const d=team.attackDir;
      team.players.forEach((p,i)=>{
        if(p.sentOff||!p.active) { p.pos.x=ti===0?-L-6:L+6; p.pos.z=20; p.vel.x=p.vel.z=0; return; }
        const roleIdx=Math.min(i,4);
        let [bx,bz]=base[roleIdx];
        // mirror for away
        let x=bx*d, z=bz*d;
        if(ti===kickTeam && p.role==='ST'){ x=-d*1.0; z=0; }
        if(ti!==kickTeam && p.role==='ST'){ x=-d*4.5; z=0; }
        p.pos.x=x; p.pos.z=z; p.y=0; p.vy=0; p.vel.x=p.vel.z=0;
        p.facing=Math.atan2(d,0); p.slide=0; p.dive=0; p.celebrate=0; p.shootAnim=0; p.passAnim=0;
        p.speedBoost=0; p.shield=0; p.invuln=0; p.frozen=0; p.empowered=0; p.airTime=0; p.nextShotPower=null;
      });
    });
    this.ball.pos.set(0,0.22,0); this.ball.vel.set(0,0,0); this.ball.owner=null; this.ball.lastTouch=null; this.ball.kicker=null; this.ball.kickCd=0; this.ball.power=null; this.ball.shot=false; this.ball.curve=0; this.ball.guided=0; this.ball.target=null;
    const st=this.teams[kickTeam].players.find(p=>p.role==='ST'&&p.active&&!p.sentOff)||this.teams[kickTeam].players.find(p=>p.active&&!p.sentOff);
    this.ball.owner=st; this.ball.lastTouch=st;
    if(kickTeam===0) this.controlled=st; else this.controlled=this.nearestPlayer(0,this.ball.pos,1);
    this.replayBuf=[];
  }
  activePlayers(team){ return this.teams[team].players.filter(p=>p.active&&!p.sentOff); }
  nearestPlayer(team,pos,excludeGK=0){
    let best=null,bd=1e9;
    for(const p of this.activePlayers(team)){ if(excludeGK&&p.role==='GK') continue; const d=dist2(p.pos,pos); if(d<bd){bd=d;best=p;} }
    return best;
  }
  event(type,icon,text){ this.events.unshift({type,icon,text,t:this.time}); this.events=this.events.slice(0,5); this.hooks.event&&this.hooks.event({type,icon,text}); }
  showBanner(text,sub,color){ this.banner={text,sub,color,t:2.2}; this.hooks.banner&&this.hooks.banner(this.banner); }
  addShake(v){ this.shake=Math.min(1.2,this.shake+v); }
  queueAction(a){
    if(this.state==='playing'||this.state==='deadball'){
      if(a==='power') this.usePower(this.controlled,true);
      else if(a==='pass') this.userPass();
      else if(a==='tackle') this.userTackle();
      else if(a==='switch') this.switchPlayer();
    }
  }
  shootStart(){ if(this.state==='playing'||this.state==='deadball') this.input.shootHeld=true; }
  shootRelease(){
    if(!this.input.shootHeld) return; this.input.shootHeld=false;
    if((this.state==='playing'||this.state==='deadball') && this.controlled && this.ball.owner===this.controlled) this.shoot(this.controlled, this.charge, true);
    this.charge=0;
  }
  switchPlayer(){
    const opts=this.activePlayers(0).filter(p=>p!==this.controlled);
    if(!opts.length) return;
    opts.sort((a,b)=>dist2(a.pos,this.ball.pos)-dist2(b.pos,this.ball.pos));
    this.controlled=opts[0]; this.manualSwitch=1.6; this.audio.click();
  }
  userPass(){
    const p=this.controlled; if(!p) return;
    if(this.ball.owner===p) this.pass(p,null,true);
    else this.switchPlayer();
  }
  userTackle(){
    const p=this.controlled; if(!p||p.tackleCd>0) return;
    if(this.ball.owner===p){ // shoulder shield
      p.shield=Math.max(p.shield,0.6); p.tackleCd=0.8; this.vfx.ring(new THREE.Vector3(p.pos.x,0.1,p.pos.z),0xffffff,2,0.4); return;
    }
    p.slide=0.5; p.tackleCd=1.1; p.tackleHit=false;
    const dir=this.input.mx||this.input.mz? {x:this.input.mx,z:this.input.mz} : {x:Math.sin(p.facing),z:Math.cos(p.facing)};
    const m=Math.hypot(dir.x,dir.z)||1; p.vel.x=dir.x/m*13; p.vel.z=dir.z/m*13;
    this.audio.tackle(); this.vfx.emit(p.pos.x,0.2,p.pos.z,0xc9b48a,10,3,0.5,0.4,-3,0.5);
  }
  // ---------- main loop ----------
  tick(raw){
    this.frameTimes.push(raw); if(this.frameTimes.length>100) this.frameTimes.shift();
    if(this.frameTimes.length===100){ const avg=this.frameTimes.reduce((a,b)=>a+b,0)/100; if(avg>0.06&&this.quality==='high') this.setQuality('balanced'); else if(avg>0.075&&this.quality==='balanced') this.setQuality('performance'); }
    const tDt=Math.min(raw,0.25); this.time+=tDt;
    const speed=this.config.speed||1;
    let simDt=Math.min(raw,0.05)*speed;
    if(this.hitstop>0){ this.hitstop-=tDt; simDt*=0.15; }
    if(this.state==='playing'||this.state==='deadball') this.clock+=tDt*speed;
    if(this.state==='playing'){
      let rem=simDt;
      while(rem>1e-4 && this.state==='playing'){ const step=Math.min(rem,1/30); this.simulate(step); rem-=step; }
    }
    else if(this.state==='kickoff'){ this.kickoffTimer-=tDt; this.updateTimers(simDt); this.updateAnimations(simDt); if(this.kickoffTimer<=0){ this.state='playing'; this.audio.whistle(); this.hooks.state&&this.hooks.state(this.state); } }
    else if(this.state==='deadball'){ this.deadTimer-=tDt; this.updateTimers(simDt); this.updateAnimations(simDt); if(this.deadTimer<=0){ this.state='playing'; this.audio.whistle(); this.hooks.state&&this.hooks.state(this.state); } }
    else if(this.state==='goal'){ this.updateGoal(tDt); }
    else if(this.state==='menu'||this.state==='halftime'||this.state==='fulltime'||this.state==='paused'){ this.updateAnimations(tDt*0.5); }
    if(this.banner){ this.banner.t-=tDt; if(this.banner.t<=0) this.banner=null; }
    if(this.state==='playing'||this.state==='deadball') this.checkHalfFull();
    this.updateCamera(tDt);
    this.world.update(this.time,tDt);
    this.vfx.update(tDt);
    this.renderObjects();
    this.screenT+=tDt; if(this.screenT>0.5){ this.screenT=0; this.world.updateScreen(this.score,this.clockLabel(),this.half); }
    if(!this.headless) this.composer.render();
    this.hooks.frame&&this.hooks.frame(this);
  }
  updateTimers(dt){
    for(const p of this.players){
      p.cooldown=Math.max(0,p.cooldown-dt); p.tackleCd=Math.max(0,p.tackleCd-dt);
      p.invuln=Math.max(0,p.invuln-dt); p.speedBoost=Math.max(0,p.speedBoost-dt);
      p.shield=Math.max(0,p.shield-dt); p.frozen=Math.max(0,p.frozen-dt);
      p.slide=Math.max(0,p.slide-dt); p.dive=Math.max(0,p.dive-dt);
      p.shootAnim=Math.max(0,(p.shootAnim||0)-dt); p.passAnim=Math.max(0,(p.passAnim||0)-dt);
      p.celebrate=Math.max(0,p.celebrate-dt); p.empowered=Math.max(0,(p.empowered||0)-dt);
      p.saveCd=Math.max(0,p.saveCd-dt);
      if(p.active&&!p.sentOff){ p.power=clamp(p.power+dt*7,0,100); p.stamina=clamp(p.stamina+dt*2.2,0,100); }
      if(p.speedBoost>0 && Math.random()<dt*20){ this.vfx.ghost(new THREE.Vector3(p.pos.x,p.y,p.pos.z),p.facing,POWERS[p.powerType].color); this.vfx.trail(p.pos.x,1,p.pos.z,POWERS[p.powerType].color,0.5); }
      if(p.shield>0 && Math.random()<dt*12) this.vfx.emit(p.pos.x,1,p.pos.z,POWERS[p.powerType].color,2,1.5,0.4,0.35,0,0.5);
    }
    this.manualSwitch=Math.max(0,this.manualSwitch-dt);
    this.ball.kickCd=Math.max(0,this.ball.kickCd-dt); this.ball.saveCd=Math.max(0,this.ball.saveCd-dt);
    this.ball.powerT=Math.max(0,this.ball.powerT-dt); if(this.ball.powerT<=0) this.ball.power=null;
    this.ball.guided=Math.max(0,this.ball.guided-guidedDt(dt));
    function guidedDt(x){return x;}
  }
  simulate(dt){
    this.updateTimers(dt);
    if(this.input.shootHeld && this.ball.owner===this.controlled) this.charge=clamp(this.charge+dt/0.85,0,1);
    // possession stats
    if(this.ball.owner) this.stats[this.ball.owner.team].possession+=dt;
    this.updateControlled();
    this.updateAI(dt);
    this.movePlayers(dt);
    this.updateBall(dt);
    this.resolveContacts(dt);
    this.snapshot(dt);
    this.updateAnimations(dt);
    // excitement audio
    const b=this.ball.pos; const exc=clamp(0.25 + (Math.abs(b.x)/L)*0.35 + (this.ball.shot?0.3:0) + (this.ball.power?0.2:0),0,1);
    this.audio.update(dt,exc);
  }
  updateControlled(){
    const b=this.ball;
    if(b.owner && b.owner.team===0){ this.controlled=b.owner; }
    else {
      this.autoSwitchT-=0.016;
      if(this.manualSwitch<=0 && this.autoSwitchT<=0){
        const n=this.nearestPlayer(0,b.pos,1);
        if(n && n!==this.controlled && dist2(n.pos,b.pos) < dist2(this.controlled?.pos||{x:999,z:999},b.pos)-1.5) this.controlled=resetSwitch(n,this);
        function resetSwitch(n,g){ g.autoSwitchT=0.5; return n; }
      }
    }
    if(this.controlled && (this.controlled.sentOff||!this.controlled.active)) this.controlled=this.nearestPlayer(0,b.pos,1);
  }
  updateAI(dt){
    const diff=DIFFICULTIES[this.config.difficulty]||DIFFICULTIES.pro;
    const owner=this.ball.owner;
    for(let ti=0;ti<2;ti++){
      const team=this.teams[ti], d=team.attackDir;
      const hasBall=owner&&owner.team===ti;
      const oppHas=owner&&owner.team!==ti;
      const outfield=this.activePlayers(ti).filter(p=>p.role!=='GK');
      const pressers=outfield.slice().sort((a,b)=>dist2(a.pos,this.ball.pos)-dist2(b.pos,this.ball.pos)).slice(0,2);
      for(const p of this.activePlayers(ti)){
        if(p===this.controlled && ti===0) continue;
        p.aiTimer-=dt;
        if(p.role==='GK'){ this.updateGKAI(p,dt,diff); continue; }
        if(p.aiTimer<=0){
          p.aiTimer=diff.reaction*rand(0.7,1.3);
          this.decideAI(p,ti,d,hasBall,oppHas,pressers,diff);
        }
        // move toward target
        let tx=p.aiTarget?.x??p.pos.x, tz=p.aiTarget?.z??p.pos.z;
        let dx=tx-p.pos.x, dz=tz-p.pos.z, m=Math.hypot(dx,dz);
        if(m>0.4){ dx/=m; dz/=m; } else { dx=0; dz=0; }
        let sp=(5.0+p.stats.speed/100*2.4)*diff.aiSpeed*(ti===0?0.95:1);
        if(p.speedBoost>0) sp*=2.25;
        if(p.frozen>0) sp*=0.25;
        if(p.stamina<25) sp*=0.8;
        if(p.slide>0||p.dive>0) { /* momentum handled in move */ }
        else this.steer(p,dx,dz,sp,dt);
        // AI actions
        if(owner===p){
          const gx=d*L, gz=0; const dg=Math.hypot(gx-p.pos.x,gz-p.pos.z);
          const pressure=this.nearestOppDist(p);
          if(p.aiWantShoot && dg<23){ this.shoot(p,rand(0.45,0.9),false); p.aiWantShoot=false; }
          else if(p.aiWantPass && pressure<3.2){ const t=this.bestPassTarget(p); if(t){ this.pass(p,t,false); p.aiWantPass=false; } }
          else if(p.aiWantPower && p.power>=100){ this.usePower(p,false); p.aiWantPower=false; }
        } else if(oppHas && pressers.includes(p) && dist2(p.pos,owner.pos)<1.6 && p.tackleCd<=0){
          if(Math.random()<diff.accuracy*0.5) this.attemptTackle(p,owner,false);
        }
      }
    }
  }
  updateGKAI(p,dt,diff){
    const d=p.team===0?this.teams[0].attackDir:this.teams[1].attackDir;
    const goalX=-d*(L-2.2);
    let tz=clamp(this.ball.pos.z*0.4,-HW+0.6,HW-0.6);
    let tx=goalX;
    const ballToGoal=Math.abs(this.ball.pos.x-goalX);
    if(!this.ball.owner && ballToGoal<10 && Math.abs(this.ball.pos.z)<10){ tx=goalX+d*4; tz=this.ball.pos.z; }
    if(this.ball.owner===p){
      // distribute quickly
      if(p.aiTimer<=0){ p.aiTimer=0.8; const t=this.bestPassTarget(p); if(t) this.pass(p,t,false); else this.shoot(p,0.7,false); }
    }
    p.aiTarget={x:tx,z:tz};
    let dx=tx-p.pos.x,dz=tz-p.pos.z,m=Math.hypot(dx,dz); if(m>0.3){dx/=m;dz/=m;}else{dx=dz=0;}
    const sp=(4.5+p.stats.speed/100*2)*diff.aiSpeed;
    this.steer(p,dx,dz,sp,dt);
    // dive/save handled in ball update
  }
  decideAI(p,ti,d,hasBall,oppHas,pressers,diff){
    const b=this.ball.pos; const owner=this.ball.owner;
    const base=[[-L+3,0],[-17,0],[-5,-11],[-5,11],[8,0]][Math.min(p.idx,4)];
    let bx=base[0]*d, bz=base[1]*d;
    const shift=hasBall?11:(oppHas?-7:0);
    bx+=d*shift + clamp(b.x*0.22,-7,7);
    bz+=clamp(b.z*0.18,-5,5);
    p.aiTarget={x:clamp(bx,-L+2,L-2),z:clamp(bz,-W+2,W-2)};
    p.aiWantShoot=false; p.aiWantPass=false; p.aiWantPower=false;
    if(owner===p){
      const dg=Math.hypot(d*L-p.pos.x,p.pos.z);
      const pressure=this.nearestOppDist(p);
      p.aiTarget={x:d*(L-3), z:clamp(p.pos.z*0.5 + rand(-4,4),-HW-4,HW+4)};
      if(dg<22 && Math.random()<0.75) p.aiWantShoot=true;
      else if(pressure<3 && Math.random()<0.7) p.aiWantPass=true;
      if(p.power>=100 && Math.random()<0.5*diff.powerRate){
        const kind=POWERS[p.powerType].kind;
        if((kind==='shot'||kind==='curve')&&dg<25) p.aiWantPower=true;
        else if(kind==='speed'&&pressure>2) p.aiWantPower=true;
        else if(kind==='teleport'&&pressure<4) p.aiWantPower=true;
        else if(kind==='pass'&&pressure<4) p.aiWantPower=true;
        else if(kind==='shield'&&pressure<3) p.aiWantPower=true;
        else if(kind==='aerial'&&dg<20) p.aiWantPower=true;
      }
    } else if(hasBall){
      // support runs
      p.aiTarget.x=clamp(p.aiTarget.x+d*6,-L+2,L-2);
      p.aiTarget.z+= (p.idx%2?4:-4);
    } else if(oppHas){
      if(pressers.includes(p)){ p.aiTarget={x:owner.pos.x,z:owner.pos.z}; }
      else { p.aiTarget.x-=d*4; p.aiTarget.z=clamp(p.aiTarget.z + (owner.pos.z-p.pos.z)*0.2,-W+2,W-2); }
      if(p.power>=100 && Math.random()<0.35*diff.powerRate){
        const kind=POWERS[p.powerType].kind;
        if(kind==='tackle'&&dist2(p.pos,owner.pos)<6) p.aiWantPower=true;
        else if(kind==='pull'&&dist2(p.pos,b)<12) p.aiWantPower=true;
      }
    } else {
      // loose ball
      const n=this.nearestPlayer(ti,b,1);
      if(n===p){ p.aiTarget={x:b.x+this.ball.vel.x*0.18,z:b.z+this.ball.vel.z*0.18}; }
      if(p.power>=100 && POWERS[p.powerType].kind==='pull' && dist2(p.pos,b)<12 && Math.random()<0.5) p.aiWantPower=true;
    }
    // stamina sprint
    p.aiSprint = (owner===p || pressers.includes(p) || (!owner&&this.nearestPlayer(ti,b,1)===p));
  }
  nearestOppDist(p){ let m=1e9; for(const q of this.activePlayers(1-p.team)){ const d=dist2(p.pos,q.pos); if(d<m)m=d; } return m; }
  steer(p,dx,dz,speed,dt){
    const accel=12;
    p.vel.x+=(dx*speed-p.vel.x)*Math.min(1,accel*dt);
    p.vel.z+=(dz*speed-p.vel.z)*Math.min(1,accel*dt);
  }
  movePlayers(dt){
    // user controlled
    const c=this.controlled;
    if(c && c.active&&!c.sentOff && c.slide<=0 && c.dive<=0){
      let dx=this.input.mx,dz=this.input.mz; const m=Math.hypot(dx,dz); if(m>1){dx/=m;dz/=m;}
      let sp=5.1+c.stats.speed/100*2.5;
      if(this.input.sprint&&c.stamina>4){ sp*=1.42; c.stamina=clamp(c.stamina-dt*9,0,100); }
      if(c.speedBoost>0) sp*=2.25;
      if(c.frozen>0) sp*=0.25;
      if(c.airTime>0) sp*=1.3;
      this.steer(c,dx,dz,sp,dt);
    }
    for(const p of this.players){
      if(!p.active||p.sentOff) continue;
      if(p.slide>0){ p.vel.x*=Math.pow(0.06,dt); p.vel.z*=Math.pow(0.06,dt); }
      if(p.dive>0){ p.vel.x*=Math.pow(0.02,dt); p.vel.z*=Math.pow(0.02,dt); }
      if(p.y>0||p.vy>0){ p.vy-=18*dt; p.y+=p.vy*dt; if(p.y<=0){ p.y=0; p.vy=0; if(p.airTime>0){ this.vfx.ring(new THREE.Vector3(p.pos.x,0.05,p.pos.z),POWERS[p.powerType].color,3,0.5); this.addShake(0.25); p.airTime=0; } } }
      p.pos.x+=p.vel.x*dt; p.pos.z+=p.vel.z*dt;
      p.pos.x=clamp(p.pos.x,-L-1.2,L+1.2); p.pos.z=clamp(p.pos.z,-W-1.2,W+1.2);
      const sp=Math.hypot(p.vel.x,p.vel.z);
      if(sp>0.3) p.facing=Math.atan2(p.vel.x,p.vel.z);
      if(p.aiSprint && p!==c && p.stamina>10 && p.slide<=0){ /* AI sprint factor already included? apply small */ p.stamina-=dt*3; }
      p.expression = (p.speedBoost>0||p.shield>0||p.empowered>0)?'strain':'focus';
    }
    // simple separation
    for(let i=0;i<this.players.length;i++) for(let j=i+1;j<this.players.length;j++){
      const a=this.players[i],b=this.players[j]; if(!a.active||!b.active||a.sentOff||b.sentOff) continue;
      const dx=b.pos.x-a.pos.x,dz=b.pos.z-a.pos.z,d=Math.hypot(dx,dz);
      if(d<0.75&&d>0.001){ const push=(0.75-d)*0.5; const nx=dx/d,nz=dz/d;
        if(a.shield<=0){ a.pos.x-=nx*push; a.pos.z-=nz*push; }
        if(b.shield<=0){ b.pos.x+=nx*push; b.pos.z+=nz*push; }
      }
    }
  }
  updateBall(dt){
    const b=this.ball;
    if(b.owner){
      const o=b.owner;
      const fx=Math.sin(o.facing), fz=Math.cos(o.facing);
      const dribble=Math.sin(o.runPhase*2)*0.08;
      b.pos.set(o.pos.x+fx*0.68, 0.22+Math.abs(dribble), o.pos.z+fz*0.68);
      b.vel.set(o.vel.x,o.vel.y||0,o.vel.z);
      b.shot=false; b.power=null; b.guided=0;
      return;
    }
    // guided pass / pull
    if(b.guided>0 && b.target){
      const t=b.target; const tx=t.pos.x, tz=t.pos.z;
      const dx=tx-b.pos.x,dz=tz-b.pos.z,m=Math.hypot(dx,dz)||1;
      const sp=Math.hypot(b.vel.x,b.vel.z);
      b.vel.x+=(dx/m*sp-b.vel.x)*Math.min(1,dt*4);
      b.vel.z+=(dz/m*sp-b.vel.z)*Math.min(1,dt*4);
      if(m<1.1){ b.guided=0; b.owner=t; b.lastTouch=t; b.kickCd=0; this.onPossession(t); }
    }
    if(b.curve>0 && b.shot){
      const goalX=b.shotTeam!==null?this.teams[b.shotTeam].attackDir*L:0;
      const dz=(b.curveTarget||0)-b.pos.z;
      b.vel.z+=clamp(dz,-8,8)*dt*2.2;
      if(Math.random()<dt*40) this.vfx.trail(b.pos.x,b.pos.y,b.pos.z,0xff3fa4,0.5);
    }
    if(b.power==='meteor'&&b.powerT>0){ if(Math.random()<dt*70) this.vfx.trail(b.pos.x,b.pos.y,b.pos.z,0xff5a2a,0.7); this.vfx.emit(b.pos.x,b.pos.y,b.pos.z,0xffb020,1,2,0.3,0.4,0,0.3); }
    if(b.power==='thread'&&b.powerT>0 && Math.random()<dt*50) this.vfx.trail(b.pos.x,b.pos.y,b.pos.z,0x7d8cff,0.45);
    if(b.power==='nova'&&b.powerT>0 && Math.random()<dt*50){ this.vfx.trail(b.pos.x,b.pos.y,b.pos.z,0xff3fa4,0.5); this.vfx.emit(b.pos.x,b.pos.y,b.pos.z,0xb477ff,1,1,0.3,0.3,0,0.5); }
    // gravity
    if(b.pos.y>0.22||b.vel.y>0){ b.vel.y-=13.5*dt; }
    b.pos.addScaledVector(b.vel,dt);
    if(b.pos.y<0.22){ b.pos.y=0.22; if(b.vel.y<0){ b.vel.y=-b.vel.y*0.55; if(Math.abs(b.vel.y)<0.8) b.vel.y=0; }
      const fr=Math.pow(0.55,dt); b.vel.x*=fr; b.vel.z*=fr; }
    // post collisions
    if(Math.abs(b.pos.x)>L-0.15 && Math.abs(b.pos.x)<L+0.3 && Math.abs(b.pos.z)<HW+0.25 && b.pos.y<GH+0.25){
      const inGoal=Math.abs(b.pos.z)<HW-0.1 && b.pos.y<GH-0.1;
      if(!inGoal){ b.vel.x*=-0.65; b.vel.z+=Math.sign(b.pos.z||1)*2; this.event('post','🥅','Off the woodwork!'); this.audio.kick(0.8); this.addShake(0.2); }
    }
    // goal / out
    if(Math.abs(b.pos.x)>L+0.1){
      const side=Math.sign(b.pos.x);
      if(Math.abs(b.pos.z)<HW && b.pos.y<GH){ this.goal(side); return; }
      else this.outOfPlay(side);
    } else if(Math.abs(b.pos.z)>W+0.3){ this.outOfPlay(0,Math.sign(b.pos.z)); return; }
    // keeper saves & pickups
    this.checkSaves();
    this.checkPickups();
  }
  checkSaves(){
    const b=this.ball; if(b.owner||b.saveCd>0) return;
    for(const p of this.activePlayers(0).concat(this.activePlayers(1))){
      if(p.role!=='GK') continue;
      const d=dist2(p.pos,b.pos);
      const aegis=p.powerType==='aegis'&&p.shield>0;
      const radius=aegis?4.2:1.75;
      const toward = (p.team===0 && this.teams[0].attackDir===1 && b.vel.x<0) || (p.team===1 && this.teams[1].attackDir===-1 && b.vel.x>0) || (p.team===0 && this.teams[0].attackDir===-1 && b.vel.x>0) || (p.team===1 && this.teams[1].attackDir===1 && b.vel.x<0);
      if(d<radius && b.pos.y<3.2 && toward){
        const sp=Math.hypot(b.vel.x,b.vel.z);
        let chance=clamp(0.78 + p.stats.defense/250 - sp/90,0.15,0.95);
        if(b.power==='meteor') chance*=aegis?0.9:0.35;
        if(b.power==='nova') chance*=aegis?0.85:0.55;
        if(aegis) chance=Math.max(chance,0.92);
        if(Math.random()<chance){
          p.dive=0.6; p.diveDir=Math.sign(b.pos.z-p.pos.z)||1; p.saveCd=0.7; b.saveCd=0.35;
          this.stats[p.team].saves++;
          this.audio.save(); this.vfx.burst(b.pos,0xffffff,16,5,0.5,0.4); this.addShake(0.15);
          if(aegis){ this.vfx.ring(new THREE.Vector3(p.pos.x,1.5,p.pos.z),0x39ffb0,5,0.6,true); this.event('save','🧤',`${p.name} — AEGIS SAVE!`); }
          else this.event('save','🧤',`${p.name} denies ${this.teams[b.shotTeam??(1-p.team)].name}!`);
          if(sp<22 && Math.random()<0.5){ b.owner=p; b.lastTouch=p; b.shot=false; this.onPossession(p); }
          else { const ddir=this.teams[p.team].attackDir; b.vel.set(ddir*rand(8,14),rand(2,5),rand(-6,6)); b.shot=false; b.power=null; b.kicker=p; b.kickCd=0.3; }
        } else {
          b.saveCd=0.4; p.dive=0.5; p.diveDir=Math.sign(b.pos.z-p.pos.z)||1;
          if(b.power) this.event('break','💥','The keeper is beaten by sheer power!');
        }
      }
    }
  }
  checkPickups(){
    const b=this.ball; if(b.owner||b.guided>0) return;
    for(const p of this.players){
      if(!p.active||p.sentOff) continue;
      if(b.kicker===p && b.kickCd>0) continue;
      const d=dist2(p.pos,b.pos);
      const sp=Math.hypot(b.vel.x,b.vel.z);
      const isGK=p.role==='GK';
      const reach=(isGK?1.4:0.95)+p.stats.control/250 + (p.y>0.5?0.4:0);
      if(d<reach && b.pos.y<1.9+p.y){
        if(sp>26 && !isGK){ if(Math.random()<0.12){ b.vel.multiplyScalar(0.55); b.vel.y=2; this.vfx.emit(b.pos.x,b.pos.y,b.pos.z,0xffffff,8,3,0.4,0.3); continue; } else continue; }
        if(sp>17 && !isGK && Math.random()>0.45) continue;
        b.owner=p; b.lastTouch=p; b.shot=false; b.power=null; b.curve=0; b.guided=0; b.kickCd=0;
        this.onPossession(p); break;
      }
    }
  }
  onPossession(p){
    if(p.team===0) this.controlled=p;
    this.vfx.emit(p.pos.x,0.2,p.pos.z,this.teams[p.team].accent,4,1.5,0.3,0.25,-1,0.3);
    p.power=clamp(p.power+4,0,100);
  }
  bestPassTarget(p,dirHint=null){
    const team=this.teams[p.team], d=team.attackDir;
    let best=null,bs=-1e9;
    for(const q of this.activePlayers(p.team)){
      if(q===p||q.role==='GK') continue;
      const forward=(q.pos.x-p.pos.x)*d;
      const dist=dist2(p.pos,q.pos);
      if(dist<2||dist>34) continue;
      let open=20; for(const o of this.activePlayers(1-p.team)){ const od=dist2(q.pos,o.pos); open=Math.min(open,od); }
      let score=forward*1.4 - dist*0.25 + open*1.2;
      if(dirHint){ const vx=q.pos.x-p.pos.x,vz=q.pos.z-p.pos.z,m=Math.hypot(vx,vz)||1; score += ((vx/m)*dirHint.x+(vz/m)*dirHint.z)*14; }
      if(score>bs){bs=score;best=q;}
    }
    return best;
  }
  pass(p,target=null,user=false){
    if(this.ball.owner!==p) return;
    const hint=user&&(this.input.mx||this.input.mz)?{x:this.input.mx,z:this.input.mz}:null;
    const t=target||this.bestPassTarget(p,hint);
    if(!t){ this.clearBall(p); return; }
    const b=this.ball; const dx=t.pos.x-b.pos.x,dz=t.pos.z-b.pos.z,m=Math.hypot(dx,dz)||1;
    const superPass=p.empowered>0&&p.powerType==='thread';
    const sp=superPass?26:clamp(12+m*0.42,13,23);
    b.owner=null; b.kicker=p; b.kickCd=0.32; b.lastTouch=p;
    b.vel.set(dx/m*sp, m>15?2.4:0.6, dz/m*sp);
    b.guided=superPass?1.4:0; b.target=superPass?t:null; b.shot=false;
    if(superPass){ b.power='thread'; b.powerT=1.5; p.empowered=0; this.vfx.beam(new THREE.Vector3(p.pos.x,1,p.pos.z),new THREE.Vector3(t.pos.x,1,t.pos.z),0x7d8cff,0.3,0.06); this.vfx.ring(new THREE.Vector3(t.pos.x,0.1,t.pos.z),0x7d8cff,2.5,0.6); this.event('power','⌁',`${p.name} threads the needle!`); }
    this.stats[p.team].passes++;
    p.passAnim=0.25; p.power=clamp(p.power+3,0,100);
    this.audio.pass(); this.vfx.emit(b.pos.x,0.2,b.pos.z,0xffffff,6,2,0.3,0.25,-2,0.4);
    if(p.team===0) this.controlled=t;
  }
  clearBall(p){
    const b=this.ball, d=this.teams[p.team].attackDir;
    b.owner=null; b.kicker=p; b.kickCd=0.4; b.lastTouch=p;
    b.vel.set(d*18,4,rand(-6,6)); b.shot=false;
    this.audio.kick(0.8); p.shootAnim=0.3;
  }
  shoot(p,charge=0.6,user=false){
    if(this.ball.owner!==p) return;
    const b=this.ball, team=this.teams[p.team], d=team.attackDir;
    const superShot=p.empowered>0&&(p.powerType==='meteor'||p.powerType==='nova');
    const pw=superShot?p.power:null;
    let aimZ=0;
    if(user&&(this.input.mx||this.input.mz)) aimZ=clamp(this.input.mz*HW*0.9,-HW+0.5,HW-0.5);
    else aimZ=(Math.random()<0.5?-1:1)*HW*rand(0.45,0.8);
    const acc=p.stats.shot/100;
    const err=user? (1-acc)*1.6 : (1-acc)*3.2;
    aimZ+=rand(-err,err);
    const gx=d*L, gz=aimZ;
    const dx=gx-b.pos.x,dz=gz-b.pos.z,m=Math.hypot(dx,dz)||1;
    let sp=22+charge*15+acc*4;
    let vy=1.6+charge*3.2 + (m>26?1.5:0);
    if(pw==='meteor'){ sp=43; vy=1.4+charge*1.2; this.addShake(0.55); this.hitstop=0.07; }
    if(pw==='nova'){ sp=36; vy=2.2; b.curve=1; b.curveTarget=-Math.sign(aimZ||1)*HW*0.75; this.addShake(0.35); }
    b.owner=null; b.kicker=p; b.kickCd=0.38; b.lastTouch=p;
    b.vel.set(dx/m*sp,vy,dz/m*sp);
    b.shot=true; b.shotTeam=p.team; b.shotPower=pw?1:charge; b.power=pw; b.powerT=pw?2.5:0;
    if(p.empowered>0) p.empowered=0; p.nextShotPower=null;
    this.stats[p.team].shots++;
    const onTarget=Math.abs(aimZ)<HW && vy<GH+2; if(onTarget) this.stats[p.team].onTarget++;
    p.shootAnim=0.32; p.power=clamp(p.power+2,0,100);
    this.audio.kick(pw?1.4:1); this.vfx.emit(b.pos.x,0.3,b.pos.z,pw?POWERS[pw].color:0xffffff,pw?28:10,pw?8:3,0.5,0.5,-3,0.6);
    if(pw){ this.vfx.ring(new THREE.Vector3(p.pos.x,0.1,p.pos.z),POWERS[pw].color,4,0.5); this.event('power',POWERS[pw].icon,`${p.name} unleashes ${p.powerName}!`); }
    else if(user) this.event('shot','🎯',`${p.name} shoots!`);
    if(user) this.addShake(0.12+charge*0.15);
  }
  attemptTackle(p,owner,power=false){
    if(!owner||owner.team===p.team||p.tackleCd>0) return false;
    p.tackleCd=power?1.4:0.9;
    if(owner.invuln>0||owner.shield>0){ this.vfx.ring(new THREE.Vector3(owner.pos.x,0.1,owner.pos.z),0xffffff,2,0.4); this.event('block','⛨',`${owner.name} shrugs off the challenge!`); return false; }
    const dx=owner.pos.x-p.pos.x,dz=owner.pos.z-p.pos.z,m=Math.hypot(dx,dz)||1;
    const fromBehind = (Math.sin(owner.facing)*dx+Math.cos(owner.facing)*dz) < -0.3;
    let chance=0.5+(p.stats.defense-owner.stats.control)/220;
    if(power) chance=0.92;
    if(fromBehind) chance-=0.15;
    if(Math.random()<chance){
      // foul?
      const foulChance=power? (fromBehind?0.35:0.16) : (fromBehind?0.3:0.1);
      if(Math.random()<foulChance){ this.foul(p,owner,power?1:0.4); return false; }
      this.ball.owner=p; this.ball.lastTouch=p; this.ball.shot=false; this.ball.power=null; this.ball.guided=0;
      this.stats[p.team].tackles++;
      owner.stumble=0.4; p.power=clamp(p.power+6,0,100);
      this.audio.tackle(); this.vfx.emit(owner.pos.x,0.3,owner.pos.z,0xc9b48a,12,3,0.4,0.35,-3,0.5);
      this.event('tackle','🛡️',`${p.name} wins it clean!`);
      this.onPossession(p);
      return true;
    }
    if(fromBehind && Math.random()<0.25){ this.foul(p,owner,0.5); return false; }
    owner.stumble=0.15;
    return false;
  }
  usePower(p,user=false){
    if(!p||!p.active||p.sentOff||p.power<100||p.cooldown>0) { if(user&&p) this.hooks.toast&&this.hooks.toast('Power recharging — keep playing to charge it.'); return; }
    const pw=POWERS[p.powerType], kind=pw.kind;
    const b=this.ball;
    // conditional powers
    if((kind==='shot'||kind==='curve'||kind==='pass') && b.owner!==p){
      p.empowered=4; p.cooldown=0.5; p.power=0; this.stats[p.team].powers++;
      this.showBanner(p.powerName.toUpperCase(),'NEXT '+(kind==='pass'?'PASS':'SHOT')+' EMPOWERED',pw.css);
      this.vfx.ring(new THREE.Vector3(p.pos.x,0.1,p.pos.z),pw.color,3,0.7); this.audio.power(kind);
      this.event('power',pw.icon,`${p.name} empowers the next ${kind==='pass'?'pass':'shot'}!`); return;
    }
    p.power=0; p.cooldown=1.2; this.stats[p.team].powers++;
    const pos=new THREE.Vector3(p.pos.x,p.y,p.pos.z);
    this.showBanner(p.powerName.toUpperCase(),`${p.name} • ${this.teams[p.team].short}`,pw.css);
    this.audio.power(kind);
    if(kind==='shot'||kind==='curve'){
      p.empowered=1; this.shoot(p,0.9,user);
    } else if(kind==='speed'){
      p.speedBoost=2.4; this.vfx.ring(pos, pw.color,3,0.5); this.vfx.burst(pos,pw.color,24,6,0.6,0.5);
      this.event('power',pw.icon,`${p.name} ignites ${p.powerName}!`);
    } else if(kind==='tackle'){
      p.slide=0.55; p.tackleHit=false; p.tackleCd=1.4;
      const dir=this.input.mx||this.input.mz?{x:this.input.mx,z:this.input.mz}:{x:Math.sin(p.facing),z:Math.cos(p.facing)};
      const m=Math.hypot(dir.x,dir.z)||1; p.vel.x=dir.x/m*16; p.vel.z=dir.z/m*16;
      this.vfx.ring(new THREE.Vector3(p.pos.x,0.05,p.pos.z),pw.color,6,0.7); this.vfx.burst(pos,pw.color,40,8,0.8,0.6); this.addShake(0.5); this.hitstop=0.06;
      // instant radius steal
      const owner=b.owner;
      if(owner&&owner.team!==p.team&&dist2(p.pos,owner.pos)<5.2) this.attemptTackle(p,owner,true);
      else if(!owner&&dist2(p.pos,b.pos)<5.2){ b.owner=p; b.lastTouch=p; this.onPossession(p); }
      this.event('power',pw.icon,`${p.name} detonates ${p.powerName}!`);
    } else if(kind==='teleport'){
      const old=pos.clone();
      let dir=(user&&(this.input.mx||this.input.mz))?{x:this.input.mx,z:this.input.mz}:{x:Math.sin(p.facing),z:Math.cos(p.facing)};
      if(!user&&b.owner===p){ dir={x:this.teams[p.team].attackDir,z:0}; }
      const m=Math.hypot(dir.x,dir.z)||1;
      p.pos.x=clamp(p.pos.x+dir.x/m*9,-L+1,L-1); p.pos.z=clamp(p.pos.z+dir.z/m*9,-W+1,W-1);
      p.invuln=0.9;
      this.vfx.ring(old,pw.color,3,0.6,true); this.vfx.ring(new THREE.Vector3(p.pos.x,0.1,p.pos.z),pw.color,3,0.6);
      this.vfx.beam(old,new THREE.Vector3(p.pos.x,1,p.pos.z),pw.color,0.3,0.1); this.vfx.burst(new THREE.Vector3(p.pos.x,1,p.pos.z),pw.color,30,6,0.6,0.5);
      this.event('power',pw.icon,`${p.name} phases through reality!`);
    } else if(kind==='aerial'){
      p.vy=9.5; p.y=0.05; p.airTime=1.1;
      this.vfx.ring(pos,pw.color,4,0.6); this.vfx.burst(pos,pw.color,30,7,0.8,0.5);
      // wings
      const a=new THREE.Vector3(p.pos.x,1.4,p.pos.z);
      this.vfx.beam(a,new THREE.Vector3(p.pos.x-1.6,2.4,p.pos.z-0.4),pw.color,0.5,0.08);
      this.vfx.beam(a,new THREE.Vector3(p.pos.x+1.6,2.4,p.pos.z-0.4),pw.color,0.5,0.08);
      if(dist2(p.pos,b.pos)<3 && b.pos.y<3.5){ b.owner=null; b.lastTouch=p; b.kicker=p; b.kickCd=0.4; const d=this.teams[p.team].attackDir; const m=Math.hypot(d*L-b.pos.x,b.pos.z)||1; b.vel.set((d*L-b.pos.x)/m*30,2,(0-b.pos.z)/m*30); b.shot=true; b.shotTeam=p.team; b.power='sky'; b.powerT=1.2; this.stats[p.team].shots++; this.event('power',pw.icon,`${p.name} rises for a golden header!`); }
      this.event('power',pw.icon,`${p.name} takes to the sky!`);
    } else if(kind==='pass'){
      p.empowered=1; this.pass(p,null,user);
    } else if(kind==='save'){
      p.shield=3; p.aegis=3;
      const gx=-this.teams[p.team].attackDir*(L-0.5);
      this.vfx.ring(new THREE.Vector3(gx,1.6,0),pw.color,6,0.8,true);
      for(let z=-HW;z<=HW;z+=1.5) this.vfx.beam(new THREE.Vector3(gx,0,z),new THREE.Vector3(gx,GH,z),pw.color,0.8,0.04);
      this.event('power',pw.icon,`${p.name} raises the Aegis Wall!`);
    } else if(kind==='shield'){
      p.shield=3; this.vfx.ring(pos,pw.color,3,0.6); this.vfx.burst(pos,pw.color,24,5,0.7,0.5);
      this.event('power',pw.icon,`${p.name} becomes an Iron Colossus!`);
    } else if(kind==='pull'){
      this.vfx.ring(pos,pw.color,8,0.9); this.vfx.ring(pos,pw.color,5,0.7);
      const owner=b.owner;
      if(dist2(p.pos,b.pos)<12 && (!owner||owner.team!==p.team)){
        if(owner){ owner.stumble=0.3; }
        b.owner=null; b.guided=1.0; b.target=p; b.lastTouch=p; b.kicker=null; b.kickCd=0;
        const dx=p.pos.x-b.pos.x,dz=p.pos.z-b.pos.z,m=Math.hypot(dx,dz)||1; b.vel.set(dx/m*16,1.5,dz/m*16);
        b.power='gravity'; b.powerT=1; this.vfx.beam(new THREE.Vector3(b.pos.x,b.pos.y,b.pos.z),new THREE.Vector3(p.pos.x,1,p.pos.z),pw.color,0.4,0.07);
        this.event('power',pw.icon,`${p.name} bends gravity to steal it!`);
      } else this.event('power',pw.icon,`${p.name} pulses a gravity well — ball out of range.`);
    }
  }
  resolveContacts(dt){
    const b=this.ball;
    // slide tackles
    for(const p of this.players){
      if(!p.active||p.sentOff||p.slide<=0||p.tackleHit) continue;
      const owner=b.owner;
      if(owner&&owner.team!==p.team&&dist2(p.pos,owner.pos)<1.7){ p.tackleHit=true; this.attemptTackle(p,owner,p.powerType==='seismic'); }
      else if(!owner&&dist2(p.pos,b.pos)<1.5){ p.tackleHit=true; b.owner=p; b.lastTouch=p; this.onPossession(p); }
    }
    // standing pressure steals (small chance)
    if(b.owner){
      const o=b.owner;
      for(const p of this.activePlayers(1-o.team)){
        if(p===this.controlled) continue;
        const d=dist2(p.pos,o.pos);
        if(d<1.0 && p.tackleCd<=0 && o.invuln<=0 && o.shield<=0){
          p.tackleCd=1.2;
          if(Math.random()<0.10){ this.attemptTackle(p,o,false); }
        }
      }
    }
  }
  foul(p,victim,severity){
    this.audio.whistle(); this.audio.card();
    this.stats[p.team].fouls++;
    let cardText='';
    if(severity>0.45 || Math.random()<0.35){
      p.card++; this.stats[p.team].yellow++;
      if(p.card>=2){ p.sentOff=true; p.active=false; this.stats[p.team].red++; cardText=' — RED CARD!'; this.event('red','🟥',`${p.name} is sent off!`); }
      else { cardText=' — YELLOW CARD'; this.event('yellow','🟨',`${p.name} booked for the challenge.`); }
    }
    this.event('foul','⚠️',`Foul by ${p.name}${cardText}`);
    this.showBanner('FOUL','FREE KICK', '#ffb020');
    // penalty if inside box near victim's attacking goal? victim attacked toward defender goal
    const victimTeam=this.teams[victim.team], d=victimTeam.attackDir;
    const inBox = (d===1 && victim.pos.x>L-12 && Math.abs(victim.pos.z)<12) || (d===-1 && victim.pos.x<-(L-12) && Math.abs(victim.pos.z)<12);
    if(inBox){ this.setRestart('penalty',victim.team,{x:d*(L-11),z:0}); }
    else this.setRestart('freekick',victim.team,{x:victim.pos.x,z:victim.pos.z});
  }
  outOfPlay(sideX,sideZ=0){
    const b=this.ball; const last=b.lastTouch;
    if(sideZ){
      const team=last?1-last.team:0;
      this.setRestart('kickin',team,{x:clamp(b.pos.x,-L+2,L-2),z:sideZ*(W-0.4)});
      this.event('out','↔️','Ball out — kick-in');
    } else {
      const end=sideX; // +L or -L
      const defending = this.teams.findIndex(t=>t.attackDir===-end);
      const attacking = 1-defending;
      if(last && last.team===defending){
        const z=Math.sign(b.pos.z||1)* (W-0.5);
        this.setRestart('corner',attacking,{x:end*(L-0.5),z});
        this.event('corner','⚑','Corner kick!');
      } else {
        this.setRestart('goalkick',defending,{x:end*(L-7),z:0});
        this.event('out','🥅','Goal kick');
      }
    }
  }
  setRestart(type,team,pos){
    this.deadType=type; this.restartTeam=team; this.restartPos=pos;
    this.ball.owner=null; this.ball.vel.set(0,0,0); this.ball.pos.set(pos.x,0.22,pos.z); this.ball.shot=false; this.ball.power=null; this.ball.curve=0; this.ball.guided=0; this.ball.target=null; this.ball.kicker=null; this.ball.kickCd=0;
    // taker
    let taker=this.nearestPlayer(team,pos, type==='goalkick'?0:1);
    if(type==='goalkick') taker=this.teams[team].players.find(p=>p.role==='GK'&&p.active&&!p.sentOff)||this.nearestPlayer(team,pos,1);
    if(type==='penalty') taker=this.teams[team].players.find(p=>p.role==='ST'&&p.active&&!p.sentOff)||this.nearestPlayer(team,pos,1);
    this.restartTaker=taker;
    const d=this.teams[team].attackDir;
    if(taker){ taker.pos.x=pos.x-d*1.0; taker.pos.z=pos.z; taker.vel.x=taker.vel.z=0; taker.facing=Math.atan2(d,0); }
    // push opponents away
    for(const q of this.activePlayers(1-team)){
      if(dist2(q.pos,pos)<5){ const dx=q.pos.x-pos.x,dz=q.pos.z-pos.z,m=Math.hypot(dx,dz)||1; q.pos.x=clamp(pos.x+dx/m*6,-L+1,L-1); q.pos.z=clamp(pos.z+dz/m*6,-W+1,W-1); }
    }
    if(type==='penalty'){
      const gk=this.teams[1-team].players.find(p=>p.role==='GK'&&p.active&&!p.sentOff);
      if(gk){ gk.pos.x=-d*(L-1.2); gk.pos.z=0; gk.vel.x=gk.vel.z=0; }
      for(const q of this.players){ if(q.team!==team&&q.role!=='GK'&&q.active){ q.pos.x=clamp(q.pos.x, -L+1, L-13); } }
    }
    if(team===0) this.controlled=taker; else this.controlled=this.nearestPlayer(0,pos,1);
    this.state='deadball'; this.deadTimer=type==='penalty'?2.0:1.2;
    this.showBanner(type==='penalty'?'PENALTY!':type==='corner'?'CORNER':type==='goalkick'?'GOAL KICK':type==='kickin'?'KICK-IN':'FREE KICK', this.teams[team].name, this.teams[team].css);
    this.hooks.state&&this.hooks.state(this.state);
  }
  goal(side){
    const team=this.teams.findIndex(t=>t.attackDir===side);
    if(team<0) return;
    const scorer=this.ball.lastTouch?.team===team?this.ball.lastTouch:(this.ball.kicker?.team===team?this.ball.kicker:this.nearestPlayer(team,this.ball.pos));
    this.score[team]++;
    this.stats[team].onTarget++;
    this.ball.owner=null; this.ball.vel.multiplyScalar(0.15);
    this.state='goal'; this.goalPhase='replay'; this.goalTimer=0;
    this.goalData={team,scorer,side, snapshots:this.replayBuf.slice(), liveBall:this.ball.pos.clone()};
    this.audio.goal(); this.addShake(0.8);
    this.vfx.confetti(new THREE.Vector3(side*L,2,0),[this.teams[team].primary,this.teams[team].accent,0xffffff],180);
    this.event('goal','⚽',`GOAL! ${scorer?.name||this.teams[team].name} — ${this.score[0]}–${this.score[1]}`);
    this.showBanner('GOAL!',`${scorer?.name||''} • ${this.teams[team].name}`,this.teams[team].css);
    this.hooks.state&&this.hooks.state(this.state);
  }
  updateGoal(dt){
    this.goalTimer+=dt;
    const g=this.goalData;
    if(this.goalPhase==='replay'){
      const snaps=g.snapshots;
      if(snaps.length>2){
        const dur=(snaps[snaps.length-1].t-snaps[0].t);
        const rt=this.goalTimer*0.65;
        const targetT=snaps[0].t + Math.min(dur, rt + Math.max(0,dur-2.2));
        let s=snaps[0]; for(const sn of snaps){ if(sn.t<=targetT) s=sn; else break; }
        for(const snp of s.players){ const p=this.players.find(q=>q.idx===snp.idx&&q.team===snp.team); if(!p) continue; p.pos.x=snp.x; p.pos.z=snp.z; p.y=snp.y; p.facing=snp.f; p.runPhase=snp.ph; p.slide=snp.sl; p.dive=snp.dv; }
        this.ball.pos.set(s.bx,s.by,s.bz);
      }
      if(this.goalTimer>2.8){ this.goalPhase='celebrate'; this.goalTimer=0;
        for(const p of this.activePlayers(g.team)){ p.celebrate=3.2; p.vel.x=p.vel.z=0; }
        if(g.scorer){ g.scorer.celebrate=3.6; }
        this.vfx.confetti(new THREE.Vector3(g.side*(L-4),3,0),[this.teams[g.team].primary,this.teams[g.team].accent,0xffffff,0xffd23f],220);
      }
    } else if(this.goalPhase==='celebrate'){
      this.updateAnimations(dt);
      if(this.goalTimer>2.6){
        if(this.clock>=this.totalTime()){ this.finish(); return; }
        this.kickoffTeam=1-g.team; this.resetPositions(this.kickoffTeam); this.state='kickoff'; this.kickoffTimer=1.8; this.hooks.state&&this.hooks.state(this.state);
      }
    }
  }
  snapshot(dt){
    this.snapT+=dt;
    if(this.snapT<0.05) return; this.snapT=0;
    const s={t:this.clock, players:this.activePlayers(0).concat(this.activePlayers(1)).map(p=>({idx:p.idx,team:p.team,x:p.pos.x,z:p.pos.z,y:p.y,f:p.facing,ph:p.runPhase,sl:p.slide,dv:p.dive})), bx:this.ball.pos.x,by:this.ball.pos.y,bz:this.ball.pos.z};
    this.replayBuf.push(s); if(this.replayBuf.length>70) this.replayBuf.shift();
  }
  totalTime(){ return this.config.duration*60; }
  checkHalfFull(){
    if(this.clock>=this.totalTime()){ this.finish(); return; }
    if(this.half===1 && this.clock>=this.totalTime()/2){
      this.half=2; this.state='halftime'; this.audio.whistle(); this.event('half','⏱️','Half-time — make your substitutions.');
      this.hooks.state&&this.hooks.state(this.state);
    }
  }
  resumeSecondHalf(){
    this.teams.forEach(t=>t.attackDir*=-1);
    this.kickoffTeam=1; this.resetPositions(1);
    this.state='kickoff'; this.kickoffTimer=2.0;
    this.event('half','⏱️','Second half — ends switched.');
    this.hooks.state&&this.hooks.state(this.state);
  }
  finish(){
    this.state='fulltime'; this.matchOver=true; this.audio.whistle();
    const w=this.score[0]===this.score[1]?-1:(this.score[0]>this.score[1]?0:1);
    if(w>=0){ for(const p of this.activePlayers(w)){ p.celebrate=8; } this.vfx.confetti(new THREE.Vector3(0,4,0),[this.teams[w].primary,this.teams[w].accent,0xffffff,0xffd23f],300); this.event('win','🏆',`${this.teams[w].name} win the match!`); }
    else this.event('draw','🤝','Full-time — honours even.');
    this.hooks.state&&this.hooks.state(this.state);
  }
  pause(){ if(this.state==='playing'||this.state==='deadball'||this.state==='kickoff'){ this.prevState=this.state; this.state='paused'; this.hooks.state&&this.hooks.state(this.state); } }
  resume(){ if(this.state==='paused'){ this.state=this.prevState||'playing'; this.input.shootHeld=false; this.charge=0; this.hooks.state&&this.hooks.state(this.state); } }
  substitute(outP,inP){
    if(!outP||!inP||outP.team!==inP.team||outP.active===inP.active) return false;
    if(!outP.active||inP.active||inP.sentOff) return false;
    const team=this.teams[outP.team];
    if(team.subsUsed>=5) return false;
    // preserve role slot by swapping idx? keep idx but active flags; formation uses idx so bench idx>4 clamps to ST. Better swap idx values.
    const oi=outP.idx, ii=inP.idx;
    outP.idx=ii; inP.idx=oi;
    outP.active=false; inP.active=true;
    inP.pos={...outP.pos}; inP.vel={x:0,z:0}; inP.facing=outP.facing; inP.y=0; inP.vy=0;
    inP.stamina=100; inP.power=Math.max(40,inP.power);
    if(this.ball.owner===outP){ this.ball.owner=inP; this.ball.lastTouch=inP; }
    if(this.controlled===outP) this.controlled=inP;
    team.subsUsed=(team.subsUsed||0)+1;
    this.event('sub','🔁',`${this.teams[outP.team].short}: ${inP.name} on for ${outP.name}`);
    this.audio.click();
    return true;
  }
  updateAnimations(dt){
    for(const p of this.players){ if(p.mesh) animatePlayer(p.mesh,p,this.time,dt,this.controlled===p&&this.state!=='menu'); }
  }
  updateCamera(dt){
    const b=this.ball.pos;
    let target=new THREE.Vector3(), pos=new THREE.Vector3();
    if(this.state==='menu'){
      const a=this.time*0.08; pos.set(Math.sin(a)*72,36,Math.cos(a)*72); target.set(0,1,0);
    } else if(this.state==='goal'){
      const g=this.goalData; const gx=g.side*(L-6);
      if(this.goalPhase==='replay'){ pos.set(gx+g.side*8,7,14); target.copy(this.ball.pos); }
      else { const s=g.scorer||this.activePlayers(g.team)[0]; pos.set(s.pos.x+6,4,s.pos.z+8); target.set(s.pos.x,1.2,s.pos.z); }
    } else if(this.state==='fulltime'){
      const a=this.time*0.15; pos.set(Math.sin(a)*30,12,Math.cos(a)*30); target.set(0,1,0);
    } else {
      const zoom=this.camDist;
      target.set(b.x*0.62,0.8,b.z*0.38);
      const yaw=this.camYaw;
      pos.set(target.x+Math.sin(yaw)*zoom*0.35, this.camHeight*(zoom/48), target.z+Math.cos(yaw)*zoom);
      if(this.camMode===1){ pos.set(target.x+Math.sin(yaw)*zoom*0.2, this.camHeight*1.55*(zoom/48), target.z+Math.cos(yaw)*zoom*0.55); target.y=0; }
    }
    const k=1-Math.pow(0.001,dt);
    this.camPos.lerp(pos,k); this.camTarget.lerp(target,k);
    this.camera.position.copy(this.camPos);
    if(this.shake>0){ this.camera.position.x+=(Math.random()-0.5)*this.shake; this.camera.position.y+=(Math.random()-0.5)*this.shake*0.6; this.camera.position.z+=(Math.random()-0.5)*this.shake; this.shake=Math.max(0,this.shake-dt*2.2); }
    this.camera.lookAt(this.camTarget);
  }
  clockLabel(){
    const m=Math.floor(clamp(this.clock/this.totalTime(),0,1)*90);
    return `${String(m).padStart(2,'0')}:${String(Math.floor((this.clock*90/this.totalTime()%1)*60)).padStart(2,'0')}`;
  }
  renderObjects(){
    const b=this.ball;
    this.ballMesh.position.copy(b.pos);
    this.ballMesh.rotation.x+=0.08; this.ballMesh.rotation.z+=0.05;
    const glow=this.ballMesh.userData.glow;
    if(b.power&&POWERS[b.power]){ glow.material.opacity=0.55; glow.material.color.setHex(POWERS[b.power].color); glow.scale.setScalar(1.3+Math.sin(this.time*20)*0.15); }
    else if(b.shot){ glow.material.opacity=0.25; glow.material.color.setHex(0xffffff); glow.scale.setScalar(1.1); }
    else { glow.material.opacity=0; }
    this.ballShadow.position.set(b.pos.x,0.025,b.pos.z); this.ballShadow.scale.setScalar(1+b.pos.y*0.25); this.ballShadow.material.opacity=Math.max(0.08,0.35-b.pos.y*0.04);
  }
  orbit(dx,dy){ this.camYaw=clamp(this.camYaw-dx*0.004,-1.1,1.1); this.camHeight=clamp(this.camHeight+dy*0.05,18,60); }
  zoom(d){ this.camDist=clamp(this.camDist+d*0.03,28,72); }
  get controlledPower(){ return this.controlled?POWERS[this.controlled.power]:null; }
}
