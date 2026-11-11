export class AudioEngine {
  constructor(){ this.ctx=null; this.enabled=true; this.started=false; this.crowdGain=null; this.master=null; this.exc=0.25; }
  init(){
    if(this.ctx) { if(this.ctx.state==='suspended') this.ctx.resume(); return; }
    const AC=window.AudioContext||window.webkitAudioContext; if(!AC) return;
    this.ctx=new AC();
    this.master=this.ctx.createGain(); this.master.gain.value=this.enabled?0.8:0; this.master.connect(this.ctx.destination);
    // crowd bed
    const len=this.ctx.sampleRate*2, buf=this.ctx.createBuffer(1,len,this.ctx.sampleRate), d=buf.getChannelData(0);
    let last=0; for(let i=0;i<len;i++){ const w=Math.random()*2-1; last=(last+0.02*w)/1.02; d[i]=last*3.5; }
    const src=this.ctx.createBufferSource(); src.buffer=buf; src.loop=true;
    const bp=this.ctx.createBiquadFilter(); bp.type='bandpass'; bp.frequency.value=500; bp.Q.value=0.6;
    this.crowdGain=this.ctx.createGain(); this.crowdGain.gain.value=0.12;
    src.connect(bp); bp.connect(this.crowdGain); this.crowdGain.connect(this.master); src.start();
    this.started=true;
  }
  setEnabled(v){ this.enabled=v; if(this.master) this.master.gain.setTargetAtTime(v?0.8:0,this.ctx.currentTime,0.05); }
  update(dt,exc){ this.exc+=(exc-this.exc)*Math.min(1,dt*2); if(this.crowdGain) this.crowdGain.gain.setTargetAtTime(0.08+this.exc*0.22,this.ctx.currentTime,0.2); }
  tone(freq,dur,type='sine',vol=0.3,slide=0){
    if(!this.ctx||!this.enabled) return; const t=this.ctx.currentTime;
    const o=this.ctx.createOscillator(), g=this.ctx.createGain();
    o.type=type; o.frequency.setValueAtTime(freq,t); if(slide) o.frequency.exponentialRampToValueAtTime(Math.max(20,freq+slide),t+dur);
    g.gain.setValueAtTime(vol,t); g.gain.exponentialRampToValueAtTime(0.001,t+dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t+dur+0.02);
  }
  noise(dur,vol=0.3,filter=800){
    if(!this.ctx||!this.enabled) return; const t=this.ctx.currentTime;
    const len=this.ctx.sampleRate*dur, buf=this.ctx.createBuffer(1,len,this.ctx.sampleRate), d=buf.getChannelData(0);
    for(let i=0;i<len;i++) d[i]=(Math.random()*2-1)*(1-i/len);
    const s=this.ctx.createBufferSource(); s.buffer=buf;
    const f=this.ctx.createBiquadFilter(); f.type='lowpass'; f.frequency.value=filter;
    const g=this.ctx.createGain(); g.gain.value=vol;
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t);
  }
  kick(power=1){ this.noise(0.08,0.35*power,1200); this.tone(120,0.12,'sine',0.4*power,-60); }
  pass(){ this.kick(0.6); }
  tackle(){ this.noise(0.18,0.4,500); this.tone(70,0.2,'sawtooth',0.2,-30); }
  whistle(){ this.tone(2200,0.35,'square',0.12,300); setTimeout(()=>this.tone(2400,0.25,'square',0.1,200),180); }
  power(type){
    const map={shot:[80,0.5,'sawtooth',0.4,700],speed:[300,0.4,'square',0.2,900],teleport:[900,0.35,'sine',0.3,-700],tackle:[60,0.4,'sawtooth',0.4,120],aerial:[400,0.5,'triangle',0.3,600],pass:[500,0.3,'sine',0.25,400],curve:[200,0.5,'sawtooth',0.3,800],save:[700,0.4,'triangle',0.25,-200],pull:[150,0.5,'sine',0.3,-100],shield:[200,0.4,'square',0.2,100]};
    const m=map[type]||map.shot; this.tone(m[0],m[1],m[2],m[3],m[4]); this.noise(0.25,0.2,2000);
  }
  goal(){ this.tone(440,0.8,'sawtooth',0.2,220); this.tone(554,0.8,'sawtooth',0.18,220); this.tone(659,1.0,'sawtooth',0.18,330); this.noise(1.2,0.5,3000); if(this.crowdGain) this.crowdGain.gain.setTargetAtTime(0.6,this.ctx.currentTime,0.1); }
  save(){ this.tone(300,0.2,'triangle',0.3,-100); this.noise(0.1,0.25,1500); }
  card(){ this.tone(1800,0.15,'square',0.15); this.tone(1400,0.2,'square',0.12); }
  click(){ this.tone(700,0.06,'sine',0.12,200); }
  countdown(n){ this.tone(n===0?880:440,0.15,'sine',0.2); }
}
