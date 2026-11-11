import { chromium } from 'playwright';
import { writeFileSync } from 'fs';
const errors=[];
const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox']});
const page=await browser.newPage({viewport:{width:960,height:600},deviceScaleFactor:1});
page.setDefaultTimeout(60000);
page.on('pageerror',e=>errors.push('PAGEERROR: '+e.message));
page.on('console',m=>{ if(m.type()==='error') errors.push('CONSOLE: '+m.text()); });
await page.goto('http://localhost:3000',{waitUntil:'domcontentloaded'});
await page.waitForFunction(()=>window.__game&&window.__game.state==='menu',null,{timeout:90000,polling:200});
// speed up software renderer for testing
await page.evaluate(()=>{ __game.headless=true; __game.setQuality('performance'); __game.renderer.setPixelRatio(0.35); __game.resize(); });
async function shot(name){
  await page.evaluate(()=>{ __game.headless=true; __game.renderer.setSize(480,300,false); __game.composer.setSize(480,300); __game.composer.render(); __game.renderer.setSize(__game.canvas.clientWidth,__game.canvas.clientHeight,false); __game.composer.setSize(__game.canvas.clientWidth,__game.canvas.clientHeight); });
  await page.waitForTimeout(150);
  try{ await page.screenshot({path:'tests/'+name+'.png',timeout:30000}); }catch(e){ console.log('screenshot skip',name,e.message.split('\n')[0]); }
}
await page.waitForTimeout(800);
await shot('menu');
console.log('menu',await page.evaluate(()=>({players:__game.players.length,stadium:__game.world.stadium.name,quality:__game.quality})));
await page.click('#kickoffBtn');
await page.waitForFunction(()=>__game.state==='playing',null,{timeout:30000,polling:100});
console.log('playing');
await shot('gameplay');
// simulate input by driving game directly for deterministic logic
const act=await page.evaluate(()=>{
  const g=__game; g.input.mx=1; g.input.sprint=true;
  for(let i=0;i<90;i++) g.tick(1/60);
  g.input.mx=0; g.input.sprint=false;
  const before=g.controlled.power; g.queueAction('power');
  const after=g.controlled.power;
  g.shootStart(); for(let i=0;i<40;i++) g.tick(1/60); g.shootRelease();
  for(let i=0;i<60;i++) g.tick(1/60);
  return {state:g.state,clock:g.clock.toFixed(1),controlled:g.controlled?.name,powerBefore:before,powerAfter:after,ballOwner:g.ball.owner?.name,shots:g.stats[0].shots};
});
console.log('actions',act);
// pause + subs
await page.evaluate(()=>__game.pause());
await page.waitForTimeout(150);
await page.click('[data-tab="subs"]');
const subOk=await page.evaluate(()=>{ const t=__game.teams[0]; const out=t.players.find(p=>p.active); const inn=t.players.find(p=>!p.active); return __game.substitute(out,inn); });
console.log('substitution',subOk);
await shot('pause');
await page.click('[data-tab="resume"]'); await page.click('#resumeBtn');
// force goal
await page.evaluate(()=>{ __game.headless=true; const g=__game; g.ball.pos.set(37.5,1,0); g.ball.vel.set(10,0,0); g.ball.lastTouch=g.teams[0].players.find(p=>p.active&&p.team===0); g.goal(1); });
await page.waitForTimeout(400); await shot('goal');
await page.waitForFunction(()=>__game.state==='kickoff'||__game.state==='playing',null,{timeout:30000,polling:100});
console.log('after goal',await page.evaluate(()=>({state:__game.state,score:__game.score})));
// halftime
await page.evaluate(()=>{ __game.clock=__game.totalTime()/2+0.1; });
await page.waitForFunction(()=>__game.state==='halftime',null,{timeout:15000,polling:100});
await shot('halftime');
await page.click('#secondHalfBtn');
await page.waitForFunction(()=>__game.state==='playing',null,{timeout:15000,polling:100});
// fulltime
await page.evaluate(()=>{ __game.clock=__game.totalTime()+0.1; });
await page.waitForFunction(()=>__game.state==='fulltime',null,{timeout:15000,polling:100});
await shot('fulltime');
await page.click('#rematchBtn');
await page.waitForFunction(()=>__game.state==='playing',null,{timeout:15000,polling:100});
console.log('rematch ok');
// mobile layout
await page.setViewportSize({width:390,height:844});
await page.waitForTimeout(300);
const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);
console.log('mobile overflow',overflow);
await shot('mobile');
console.log('ERRORS',errors.length?errors:'none');
await browser.close();
if(errors.length) process.exit(1);
