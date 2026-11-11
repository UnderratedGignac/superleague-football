import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { SKIN_TONES, HAIR_COLORS, HAIR_STYLES, POWERS } from './data.js';

export const FIELD = { halfL:38, halfW:24, goalW:9, goalH:3, goalDepth:2.2 };
const V = (x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);

// ---------- shared geometry cache ----------
const G = {};
function geo(key, make){ if(!G[key]) G[key]=make(); return G[key]; }
const capsule=(r,l)=>geo(`cap${r}${l}`,()=>new THREE.CapsuleGeometry(r,l,4,10));
const sphere=(r,w=12,h=10)=>geo(`sph${r}${w}${h}`,()=>new THREE.SphereGeometry(r,w,h));
const box=(x,y,z)=>geo(`box${x}${y}${z}`,()=>new THREE.BoxGeometry(x,y,z));
const cyl=(rt,rb,h,s=12)=>geo(`cyl${rt}${rb}${h}${s}`,()=>new THREE.CylinderGeometry(rt,rb,h,s));

function mat(color, opts={}){ return new THREE.MeshStandardMaterial({ color, roughness:0.62, metalness:0.05, ...opts }); }

function canvasTex(w,h,draw){
  const c=document.createElement('canvas'); c.width=w; c.height=h;
  draw(c.getContext('2d'),w,h);
  const t=new THREE.CanvasTexture(c); t.colorSpace=THREE.SRGBColorSpace; t.anisotropy=4; return t;
}

export function makePitchTexture(st){
  return canvasTex(1024,640,(ctx,w,h)=>{
    const stripes=14;
    for(let i=0;i<stripes;i++){
      ctx.fillStyle=i%2? '#'+st.grass.toString(16).padStart(6,'0') : '#'+st.grassDark.toString(16).padStart(6,'0');
      ctx.fillRect(i*w/stripes,0,w/stripes+1,h);
    }
    // mowing noise
    for(let i=0;i<9000;i++){
      ctx.fillStyle=`rgba(${Math.random()>0.5?255:0},${Math.random()>0.5?255:20},0,${Math.random()*0.03})`;
      ctx.fillRect(Math.random()*w,Math.random()*h,2,2);
    }
    // subtle vignette
    const g=ctx.createRadialGradient(w/2,h/2,h*0.2,w/2,h/2,w*0.7);
    g.addColorStop(0,'rgba(255,255,255,0.05)'); g.addColorStop(1,'rgba(0,0,20,0.25)');
    ctx.fillStyle=g; ctx.fillRect(0,0,w,h);
  });
}

function lineMat(){ return new THREE.MeshBasicMaterial({ color:0xf4fff2 }); }
function addLine(group,x,z,w,d){ const m=new THREE.Mesh(box(w,0.02,d),lineMat()); m.position.set(x,0.022,z); group.add(m); return m; }
function addArc(group,cx,cz,r,a0,a1){
  const pts=[]; for(let i=0;i<=32;i++){ const a=a0+(a1-a0)*i/32; pts.push(V(cx+Math.cos(a)*r,0.03,cz+Math.sin(a)*r)); }
  const g=new THREE.BufferGeometry().setFromPoints(pts);
  const l=new THREE.Line(g,new THREE.LineBasicMaterial({color:0xf4fff2})); group.add(l);
}

function buildGoal(side){
  const g=new THREE.Group();
  const postMat=mat(0xffffff,{roughness:0.3,metalness:0.4});
  const x=side*FIELD.halfL;
  const hw=FIELD.goalW/2, h=FIELD.goalH, d=FIELD.goalDepth;
  const post=(z)=>{ const m=new THREE.Mesh(cyl(0.07,0.07,h,10),postMat); m.position.set(x,h/2,z); m.castShadow=true; g.add(m); };
  post(-hw); post(hw);
  const bar=new THREE.Mesh(cyl(0.07,0.07,FIELD.goalW,10),postMat);
  bar.rotation.x=Math.PI/2; bar.position.set(x,h,0); bar.castShadow=true; g.add(bar);
  // net
  const netMat=new THREE.LineBasicMaterial({color:0xdfefff,transparent:true,opacity:0.35});
  const pts=[];
  for(let z=-hw;z<=hw;z+=0.45){ pts.push(V(x,h,z),V(x+side*d,h*0.75,z)); pts.push(V(x+side*d,h*0.75,z),V(x+side*d,0,z)); }
  for(let y=0;y<=h;y+=0.4){ pts.push(V(x+side*d,y, -hw),V(x+side*d,y,hw)); pts.push(V(x,y,-hw),V(x+side*d,y*0.75,-hw)); pts.push(V(x,y,hw),V(x+side*d,y*0.75,hw)); }
  for(let z=-hw;z<=hw;z+=0.45){ pts.push(V(x,0,z),V(x+side*d,0,z)); }
  const ng=new THREE.BufferGeometry().setFromPoints(pts);
  g.add(new THREE.LineSegments(ng,netMat));
  return g;
}

function buildStands(st){
  const g=new THREE.Group();
  const rows=12, seatW=0.9;
  const concrete=mat(0x2a2f3a,{roughness:0.9});
  const seatColors=[st.primary||0x334455, st.roof, 0x223, 0xddd];
  // We'll instance seats + crowd bodies + heads
  const seatGeo=box(0.55,0.5,0.5);
  const bodyGeo=box(0.34,0.5,0.24);
  const headGeo=sphere(0.11,8,6);
  const positions=[];
  const addSide=(len, fixed, axis, sign)=>{
    for(let r=0;r<rows;r++){
      const count=Math.floor(len/seatW);
      const y=1.0+r*0.62, off=fixed+sign*r*1.05;
      // step
      const step=new THREE.Mesh(axis==='x'?box(len,0.6,1.1):box(1.1,0.6,len),concrete);
      step.position.set(axis==='x'?0:off, y-0.35, axis==='x'?off:0);
      step.receiveShadow=true; g.add(step);
      for(let i=0;i<count;i++){
        const t=-len/2+seatW*(i+0.5);
        const x=axis==='x'?t:off, z=axis==='x'?off:t;
        positions.push({x,y,z,ry:axis==='x'?(sign>0?Math.PI:0):(sign>0?-Math.PI/2:Math.PI/2)});
      }
    }
  };
  addSide(88, FIELD.halfW+6, 'x', 1);
  addSide(88, FIELD.halfW+6, 'x', -1);
  addSide(58, FIELD.halfL+6, 'z', 1);
  addSide(58, FIELD.halfL+6, 'z', -1);
  const n=positions.length;
  const seatMat=mat(0xffffff,{roughness:0.8});
  const seats=new THREE.InstancedMesh(seatGeo,seatMat,n);
  const bodies=new THREE.InstancedMesh(bodyGeo,mat(0xffffff,{roughness:0.9}),n);
  const heads=new THREE.InstancedMesh(headGeo,mat(0xffffff,{roughness:0.8}),n);
  const dummy=new THREE.Object3D(); const col=new THREE.Color();
  const palette=[st.roof, st.crowd, 0x223344, 0xdddddd, 0x111111, st.roof];
  for(let i=0;i<n;i++){
    const p=positions[i];
    dummy.position.set(p.x,p.y,p.z); dummy.rotation.set(0,p.ry,0); dummy.scale.set(1,1,1); dummy.updateMatrix();
    seats.setMatrixAt(i,dummy.matrix);
    col.setHex(palette[(Math.random()*palette.length)|0]).multiplyScalar(0.55+Math.random()*0.5); seats.setColorAt(i,col);
    // ~80% occupancy
    if(Math.random()<0.82){
      dummy.position.set(p.x,p.y+0.42,p.z); dummy.rotation.set(0,p.ry+(Math.random()-0.5)*0.4,0); dummy.scale.set(1,0.9+Math.random()*0.3,1); dummy.updateMatrix();
      bodies.setMatrixAt(i,dummy.matrix);
      col.setHex(palette[(Math.random()*palette.length)|0]).multiplyScalar(0.5+Math.random()*0.6); bodies.setColorAt(i,col);
      dummy.position.y+=0.36; dummy.scale.set(1,1,1); dummy.updateMatrix(); heads.setMatrixAt(i,dummy.matrix);
      col.setHex(SKIN_TONES[(Math.random()*SKIN_TONES.length)|0]); heads.setColorAt(i,col);
    } else {
      dummy.scale.set(0,0,0); dummy.updateMatrix(); bodies.setMatrixAt(i,dummy.matrix); heads.setMatrixAt(i,dummy.matrix);
    }
  }
  seats.instanceMatrix.needsUpdate=true; bodies.instanceMatrix.needsUpdate=true; heads.instanceMatrix.needsUpdate=true;
  g.add(seats,bodies,heads);
  // roof ring
  const roofMat=mat(st.roof,{roughness:0.4,metalness:0.5,emissive:st.roof,emissiveIntensity:0.12});
  const roofY=11.5;
  const mkRoof=(w,d,x,z)=>{ const m=new THREE.Mesh(box(w,0.35,d),roofMat); m.position.set(x,roofY,z); m.castShadow=true; g.add(m); };
  mkRoof(96,8,0,FIELD.halfW+13); mkRoof(96,8,0,-FIELD.halfW-13);
  mkRoof(8,66,FIELD.halfL+13,0); mkRoof(8,66,-FIELD.halfL-13,0);
  // columns
  const colMat=mat(0x39414f,{metalness:0.6,roughness:0.4});
  for(let x=-44;x<=44;x+=11){ for(const s of[-1,1]){ const m=new THREE.Mesh(cyl(0.25,0.3,roofY,8),colMat); m.position.set(x,roofY/2,s*(FIELD.halfW+15)); g.add(m); } }
  for(let z=-28;z<=28;z+=11){ for(const s of[-1,1]){ const m=new THREE.Mesh(cyl(0.25,0.3,roofY,8),colMat); m.position.set(s*(FIELD.halfL+15),roofY/2,z); g.add(m); } }
  return g;
}

function buildFloodlights(st){
  const g=new THREE.Group();
  const poleMat=mat(0x2c3442,{metalness:0.7,roughness:0.35});
  const lampMat=new THREE.MeshBasicMaterial({color:st.night?0xeaffff:0xfff2d0});
  const beamMat=new THREE.MeshBasicMaterial({color:st.rim,transparent:true,opacity:st.night?0.05:0.025,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide});
  for(const sx of[-1,1]) for(const sz of[-1,1]){
    const x=sx*(FIELD.halfL+16), z=sz*(FIELD.halfW+16);
    const pole=new THREE.Mesh(cyl(0.3,0.45,24,8),poleMat); pole.position.set(x,12,z); g.add(pole);
    const head=new THREE.Mesh(box(5,2.2,1),poleMat); head.position.set(x,24,z); head.lookAt(0,0,0); g.add(head);
    for(let i=0;i<6;i++){ const l=new THREE.Mesh(box(0.6,0.6,0.1),lampMat); l.position.set(x-2+i*0.8,24,z+(sz>0?-0.55:0.55)); g.add(l); }
    const beam=new THREE.Mesh(new THREE.ConeGeometry(14,30,20,1,true),beamMat);
    beam.position.set(x*0.55,12,z*0.55); beam.lookAt(0,0,0); beam.rotateX(Math.PI/2); g.add(beam);
    const spot=new THREE.SpotLight(st.key, st.night?900:500, 90, 0.6, 0.6, 1.2);
    spot.position.set(x,24,z); spot.target.position.set(0,0,0); g.add(spot,spot.target);
  }
  return g;
}

function adTexture(text,color){
  return canvasTex(512,64,(ctx,w,h)=>{
    ctx.fillStyle='#070b14'; ctx.fillRect(0,0,w,h);
    const g=ctx.createLinearGradient(0,0,w,0); g.addColorStop(0,'#'+color.toString(16).padStart(6,'0')); g.addColorStop(1,'#ffffff');
    ctx.fillStyle=g; ctx.font='900 34px Impact, Arial Black, sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(text,w/2,h/2);
    ctx.fillStyle='rgba(255,255,255,0.15)'; for(let x=0;x<w;x+=8) ctx.fillRect(x,0,1,h);
  });
}

export class World {
  constructor(renderer, scene, stadium){
    this.renderer=renderer; this.scene=scene; this.stadium=stadium;
    this.group=new THREE.Group(); scene.add(this.group);
    this.dynamic=[]; this.screens=[];
    this.build();
  }
  build(){
    const st=this.stadium;
    scene_setup: {
      this.scene.fog=new THREE.FogExp2(st.fog,0.006);
    }
    // environment reflections (baked once)
    const pmrem=new THREE.PMREMGenerator(this.renderer);
    this.env=pmrem.fromScene(new RoomEnvironment(),0.04).texture;
    this.scene.environment=this.env; pmrem.dispose();
    // sky dome
    const skyGeo=new THREE.SphereGeometry(300,32,20);
    const skyMat=new THREE.ShaderMaterial({
      side:THREE.BackSide, depthWrite:false, fog:false,
      uniforms:{ top:{value:new THREE.Color(st.skyTop)}, bottom:{value:new THREE.Color(st.skyBottom)}, offset:{value:20}, exp:{value:0.7} },
      vertexShader:`varying vec3 vP; void main(){ vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader:`uniform vec3 top; uniform vec3 bottom; uniform float offset; uniform float exp; varying vec3 vP;
        void main(){ float h=normalize(vP+vec3(0.0,offset,0.0)).y; float t=pow(max(h,0.0),exp); gl_FragColor=vec4(mix(bottom,top,t),1.0); }`
    });
    this.sky=new THREE.Mesh(skyGeo,skyMat); this.group.add(this.sky);
    if(st.night){
      const starGeo=new THREE.BufferGeometry(); const pos=[];
      for(let i=0;i<900;i++){ const a=Math.random()*Math.PI*2, e=Math.random()*Math.PI*0.45+0.1, r=280;
        pos.push(Math.cos(a)*Math.cos(e)*r, Math.sin(e)*r, Math.sin(a)*Math.cos(e)*r); }
      starGeo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
      this.stars=new THREE.Points(starGeo,new THREE.PointsMaterial({color:0xffffff,size:0.7,sizeAttenuation:true,transparent:true,opacity:0.8,fog:false}));
      this.group.add(this.stars);
    }
    // sun / moon glow
    const glowTex=canvasTex(128,128,(ctx,w,h)=>{ const g=ctx.createRadialGradient(w/2,h/2,0,w/2,h/2,w/2); g.addColorStop(0,'rgba(255,255,255,1)'); g.addColorStop(0.2,'rgba(255,240,200,0.8)'); g.addColorStop(1,'rgba(255,200,120,0)'); ctx.fillStyle=g; ctx.fillRect(0,0,w,h); });
    const sun=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTex,color:st.night?0xbfd8ff:0xffd080,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,fog:false}));
    sun.position.set(-120,st.night?90:35,-160); sun.scale.set(60,60,1); this.group.add(sun);
    // ground apron
    const apron=new THREE.Mesh(new THREE.PlaneGeometry(220,180),mat(0x101820,{roughness:1}));
    apron.rotation.x=-Math.PI/2; apron.position.y=-0.05; apron.receiveShadow=true; this.group.add(apron);
    // pitch
    const pitchTex=makePitchTexture(st);
    const pitch=new THREE.Mesh(new THREE.PlaneGeometry(FIELD.halfL*2+4,FIELD.halfW*2+4),mat(0xffffff,{map:pitchTex,roughness:0.95}));
    pitch.rotation.x=-Math.PI/2; pitch.receiveShadow=true; this.group.add(pitch);
    // lines
    const lines=new THREE.Group();
    const L=FIELD.halfL,W=FIELD.halfW;
    addLine(lines,0,-W,L*2,0.12); addLine(lines,0,W,L*2,0.12);
    addLine(lines,-L,0,0.12,W*2); addLine(lines,L,0,0.12,W*2);
    addLine(lines,0,0,0.12,W*2);
    addArc(lines,0,0,7,0,Math.PI*2);
    const spot=(x)=>{ const m=new THREE.Mesh(cyl(0.12,0.12,0.02,10),lineMat()); m.position.set(x,0.03,0); lines.add(m); };
    spot(0); spot(-28); spot(28);
    // penalty boxes
    for(const s of[-1,1]){
      const x=s*(L-12);
      addLine(lines,s*(L-6),-12,12,0.12); addLine(lines,s*(L-6),12,12,0.12); addLine(lines,x,0,0.12,24);
      addLine(lines,s*(L-2.5),-7,5,0.12); addLine(lines,s*(L-2.5),7,5,0.12); addLine(lines,s*(L-5),0,0.12,14);
      addArc(lines,s*28,0,7, s>0?Math.PI*0.65:-Math.PI*0.35, s>0?Math.PI*1.35:Math.PI*0.35);
    }
    addArc(lines,-L,-W,1.5,0,Math.PI/2); addArc(lines,L,-W,1.5,Math.PI/2,Math.PI);
    addArc(lines,L,W,1.5,Math.PI,Math.PI*1.5); addArc(lines,-L,W,1.5,Math.PI*1.5,Math.PI*2);
    this.group.add(lines);
    // goals
    this.group.add(buildGoal(1),buildGoal(-1));
    // corner flags
    const flagMat=mat(st.roof,{emissive:st.roof,emissiveIntensity:0.3,side:THREE.DoubleSide});
    this.flags=[];
    for(const sx of[-1,1]) for(const sz of[-1,1]){
      const pole=new THREE.Mesh(cyl(0.04,0.04,1.6,6),mat(0xffffff)); pole.position.set(sx*L,0.8,sz*W); this.group.add(pole);
      const flag=new THREE.Mesh(new THREE.PlaneGeometry(0.6,0.4,4,2),flagMat); flag.position.set(sx*L+0.3,1.4,sz*W); this.group.add(flag); this.flags.push(flag);
    }
    // stands, lights, ads
    this.group.add(buildStands(st));
    this.group.add(buildFloodlights(st));
    const ads=['SUPERLEAGUE','BEYOND HUMAN','NOVA ENERGY','AETHER BOOTS','POWER UP','SOLARIS','VOLT','CANOPY'];
    const adMats=ads.map((a,i)=>new THREE.MeshBasicMaterial({map:adTexture(a,i%2?st.roof:st.rim)}));
    const adGeo=new THREE.PlaneGeometry(8,1.1);
    for(let i=0;i<10;i++){
      const x=-36+i*8;
      for(const s of[-1,1]){ const m=new THREE.Mesh(adGeo,adMats[i%adMats.length]); m.position.set(x,0.6,s*(W+2.2)); m.rotation.y=s>0?Math.PI:0; this.group.add(m); }
    }
    for(let i=0;i<6;i++){
      const z=-20+i*8;
      for(const s of[-1,1]){ const m=new THREE.Mesh(adGeo,adMats[(i+3)%adMats.length]); m.position.set(s*(L+2.2),0.6,z); m.rotation.y=s>0?-Math.PI/2:Math.PI/2; this.group.add(m); }
    }
    // big screens
    for(const s of[-1,1]){
      const tex=canvasTex(512,256,(ctx,w,h)=>{ ctx.fillStyle='#05070d'; ctx.fillRect(0,0,w,h); ctx.fillStyle='#'+st.roof.toString(16).padStart(6,'0'); ctx.font='900 60px Impact'; ctx.textAlign='center'; ctx.fillText('SUPERLEAGUE',w/2,80); ctx.fillStyle='#fff'; ctx.font='900 90px Impact'; ctx.fillText('0 – 0',w/2,180); });
      const screen=new THREE.Mesh(new THREE.PlaneGeometry(14,7),new THREE.MeshBasicMaterial({map:tex}));
      screen.position.set(s*(L+18),13,0); screen.rotation.y=s>0?-Math.PI/2:Math.PI/2; this.group.add(screen);
      const frame=new THREE.Mesh(box(15,8,0.5),mat(0x11151f,{metalness:0.6})); frame.position.copy(screen.position); frame.position.x+=s*0.3; frame.rotation.y=screen.rotation.y; this.group.add(frame);
      this.screens.push({mesh:screen,tex,ctx:tex.image.getContext('2d')});
    }
    // lights
    const hemi=new THREE.HemisphereLight(st.night?0x8fb8ff:0xffe0b0, 0x1a2a1a, st.ambient*2); this.group.add(hemi);
    const key=new THREE.DirectionalLight(st.key, st.night?2.2:3.0);
    key.position.set(-30,50,20); key.castShadow=true;
    key.shadow.mapSize.set(2048,2048); key.shadow.camera.left=-60; key.shadow.camera.right=60; key.shadow.camera.top=50; key.shadow.camera.bottom=-50; key.shadow.camera.near=1; key.shadow.camera.far=140; key.shadow.bias=-0.0005;
    this.group.add(key); this.keyLight=key;
    const rim=new THREE.DirectionalLight(st.rim,1.1); rim.position.set(30,20,-40); this.group.add(rim);
    const fill=new THREE.DirectionalLight(0x88aaff,0.5); fill.position.set(0,15,40); this.group.add(fill);
    // tunnel
    const tunnel=new THREE.Mesh(box(8,4,6),mat(0x0a0d14)); tunnel.position.set(0,2,-W-7); this.group.add(tunnel);
    this.renderer.shadowMap.needsUpdate=true;
  }
  updateScreen(score,clock,half){
    for(const s of this.screens){
      const ctx=s.ctx,w=512,h=256;
      ctx.fillStyle='#05070d'; ctx.fillRect(0,0,w,h);
      ctx.fillStyle='#'+this.stadium.roof.toString(16).padStart(6,'0'); ctx.font='900 46px Impact'; ctx.textAlign='center'; ctx.fillText('SUPERLEAGUE',w/2,60);
      ctx.fillStyle='#fff'; ctx.font='900 88px Impact'; ctx.fillText(`${score[0]} – ${score[1]}`,w/2,160);
      ctx.fillStyle='#9fb4d8'; ctx.font='700 30px Arial'; ctx.fillText(`${clock}  •  ${half===1?'1ST':'2ND'} HALF`,w/2,215);
      s.tex.needsUpdate=true;
    }
  }
  update(t,dt){
    for(const f of this.flags){ const p=f.geometry.attributes.position; for(let i=0;i<p.count;i++){ const x=p.getX(i); p.setZ(i,Math.sin(t*4+x*6)*0.08); } p.needsUpdate=true; }
    if(this.stars) this.stars.rotation.y=t*0.003;
  }
  dispose(){
    this.scene.remove(this.group);
    this.group.traverse(o=>{ if(o.geometry && !Object.values(G).includes(o.geometry)) o.geometry.dispose(); if(o.material){ const ms=Array.isArray(o.material)?o.material:[o.material]; ms.forEach(m=>{ if(m.map) m.map.dispose(); m.dispose(); }); } });
    if(this.env) this.env.dispose();
  }
}

// ---------- players ----------
function numberTexture(num,color){
  return canvasTex(64,64,(ctx,w,h)=>{ ctx.clearRect(0,0,w,h); ctx.fillStyle=color; ctx.font='900 44px Impact, Arial Black'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(String(num),w/2,h/2+2); });
}

export function createPlayerMesh(p, team){
  const root=new THREE.Group();
  const body=new THREE.Group(); root.add(body);
  const skin=mat(SKIN_TONES[p.skin],{roughness:0.55});
  const hairMat=mat(HAIR_COLORS[p.hair%HAIR_COLORS.length],{roughness:0.85});
  const jersey=mat(team.primary,{roughness:0.55,emissive:team.primary,emissiveIntensity:0.03});
  const shorts=mat(team.secondary,{roughness:0.7});
  const socks=mat(team.primary,{roughness:0.7});
  const boots=mat(team.accent,{roughness:0.35,metalness:0.2,emissive:team.accent,emissiveIntensity:0.08});
  const white=mat(0xffffff,{roughness:0.4});
  const dark=mat(0x14100c,{roughness:0.6});
  const isGK=p.role==='GK';
  const jerseyMat=isGK?mat(team.accent,{roughness:0.5}):jersey;
  // pelvis + torso
  const pelvis=new THREE.Mesh(box(0.34,0.18,0.2),shorts); pelvis.position.y=0.92; body.add(pelvis);
  const torso=new THREE.Mesh(cyl(0.21,0.17,0.5,12),jerseyMat); torso.position.y=1.22; torso.scale.z=0.72; torso.castShadow=true; body.add(torso);
  const chest=new THREE.Mesh(sphere(0.22,12,10),jerseyMat); chest.position.set(0,1.38,0); chest.scale.set(1.15,0.6,0.75); body.add(chest);
  // number
  const nt=numberTexture(p.num,'#'+team.secondary.toString(16).padStart(6,'0'));
  const numMat=new THREE.MeshBasicMaterial({map:nt,transparent:true,side:THREE.DoubleSide});
  const backNum=new THREE.Mesh(new THREE.PlaneGeometry(0.22,0.22),numMat); backNum.position.set(0,1.25,-0.16); backNum.rotation.y=Math.PI; body.add(backNum);
  const frontNum=new THREE.Mesh(new THREE.PlaneGeometry(0.12,0.12),numMat); frontNum.position.set(0.08,1.3,0.16); body.add(frontNum);
  // neck + head
  const neck=new THREE.Mesh(cyl(0.06,0.07,0.1,8),skin); neck.position.y=1.52; body.add(neck);
  const headG=new THREE.Group(); headG.position.y=1.66; body.add(headG);
  const head=new THREE.Mesh(sphere(0.135,16,14),skin); head.scale.set(0.92,1.12,0.95); head.castShadow=true; headG.add(head);
  // ears
  for(const s of[-1,1]){ const e=new THREE.Mesh(sphere(0.03,8,6),skin); e.position.set(s*0.125,0,0); headG.add(e); }
  // eyes
  const eyes=[];
  for(const s of[-1,1]){
    const ew=new THREE.Mesh(sphere(0.022,8,6),white); ew.position.set(s*0.048,0.02,0.118); ew.scale.set(1,0.7,0.4); headG.add(ew);
    const pupil=new THREE.Mesh(sphere(0.011,6,6),dark); pupil.position.set(s*0.048,0.02,0.135); headG.add(pupil); eyes.push(ew);
    const brow=new THREE.Mesh(box(0.045,0.008,0.01),hairMat); brow.position.set(s*0.048,0.055,0.125); brow.rotation.z=s*-0.15; headG.add(brow);
  }
  const nose=new THREE.Mesh(new THREE.ConeGeometry(0.018,0.05,6),skin); nose.position.set(0,-0.005,0.14); nose.rotation.x=Math.PI/2; headG.add(nose);
  const mouth=new THREE.Mesh(box(0.05,0.008,0.01),mat(0x7a3b30)); mouth.position.set(0,-0.065,0.125); headG.add(mouth);
  // hair
  const style=HAIR_STYLES[p.hair%HAIR_STYLES.length];
  if(style==='crop'){ const h=new THREE.Mesh(sphere(0.14,12,10),hairMat); h.position.y=0.045; h.scale.set(0.95,0.62,0.98); headG.add(h); }
  else if(style==='fade'){ const h=new THREE.Mesh(sphere(0.138,12,10),hairMat); h.position.y=0.06; h.scale.set(0.96,0.5,0.97); headG.add(h); }
  else if(style==='curls'){ for(let i=0;i<10;i++){ const a=i/10*Math.PI*2; const h=new THREE.Mesh(sphere(0.035,6,6),hairMat); h.position.set(Math.cos(a)*0.1,0.08+Math.random()*0.03,Math.sin(a)*0.1); headG.add(h); } }
  else { const h=new THREE.Mesh(sphere(0.14,12,10),hairMat); h.position.set(0,0.02,-0.02); h.scale.set(1,0.9,1.05); headG.add(h); const back=new THREE.Mesh(box(0.2,0.16,0.06),hairMat); back.position.set(0,-0.06,-0.11); headG.add(back); }
  // arms
  const arms=[];
  for(const s of[-1,1]){
    const shoulder=new THREE.Group(); shoulder.position.set(s*0.25,1.42,0); body.add(shoulder);
    const sleeve=new THREE.Mesh(capsule(0.065,0.1),jerseyMat); sleeve.position.y=-0.08; shoulder.add(sleeve);
    const upper=new THREE.Mesh(capsule(0.05,0.16),skin); upper.position.y=-0.2; shoulder.add(upper);
    const elbow=new THREE.Group(); elbow.position.y=-0.3; shoulder.add(elbow);
    const fore=new THREE.Mesh(capsule(0.043,0.16),skin); fore.position.y=-0.12; elbow.add(fore);
    const hand=new THREE.Mesh(sphere(0.05,8,6),isGK?white:skin); hand.position.y=-0.25; elbow.add(hand);
    if(isGK){ hand.scale.set(1.3,1.1,1.3); }
    arms.push({shoulder,elbow,hand});
    // captain armband
    if(p.num===10){ const band=new THREE.Mesh(cyl(0.066,0.066,0.05,8),mat(team.accent)); band.position.y=-0.12; shoulder.add(band); }
  }
  // legs
  const legs=[];
  for(const s of[-1,1]){
    const hip=new THREE.Group(); hip.position.set(s*0.11,0.9,0); body.add(hip);
    const thighShort=new THREE.Mesh(capsule(0.08,0.12),shorts); thighShort.position.y=-0.1; hip.add(thighShort);
    const thigh=new THREE.Mesh(capsule(0.065,0.2),skin); thigh.position.y=-0.26; hip.add(thigh);
    const knee=new THREE.Group(); knee.position.y=-0.4; hip.add(knee);
    const shin=new THREE.Mesh(capsule(0.055,0.22),socks); shin.position.y=-0.16; knee.add(shin);
    const boot=new THREE.Mesh(box(0.11,0.07,0.22),boots); boot.position.set(0,-0.36,0.05); knee.add(boot);
    legs.push({hip,knee,boot});
  }
  // shadow blob
  const shTex=canvasTex(64,64,(ctx,w,h)=>{ const g=ctx.createRadialGradient(w/2,h/2,0,w/2,h/2,w/2); g.addColorStop(0,'rgba(0,0,0,0.5)'); g.addColorStop(1,'rgba(0,0,0,0)'); ctx.fillStyle=g; ctx.fillRect(0,0,w,h); });
  const shadow=new THREE.Mesh(new THREE.PlaneGeometry(1.1,0.7),new THREE.MeshBasicMaterial({map:shTex,transparent:true,depthWrite:false}));
  shadow.rotation.x=-Math.PI/2; shadow.position.y=0.02; root.add(shadow);
  // power aura ring (hidden)
  const aura=new THREE.Mesh(new THREE.RingGeometry(0.55,0.72,32),new THREE.MeshBasicMaterial({color:POWERS[p.powerType].color,transparent:true,opacity:0.0,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide}));
  aura.rotation.x=-Math.PI/2; aura.position.y=0.04; root.add(aura);
  root.traverse(o=>{ if(o.isMesh) o.castShadow=false; });
  root.userData={ body, headG, eyes, mouth, arms, legs, aura, shadow, jerseyMat, boots, skin, p };
  return root;
}

export function animatePlayer(mesh, p, t, dt, controlled){
  const u=mesh.userData;
  const speed=Math.hypot(p.vel.x,p.vel.z);
  const moving=speed>0.4;
  p.runPhase += dt*(moving? speed*1.6 : 1.2);
  const ph=p.runPhase;
  const swing=moving? Math.min(1,speed/7):0;
  // root
  mesh.position.set(p.pos.x, p.y, p.pos.z);
  mesh.rotation.y=p.facing;
  const b=u.body;
  b.position.y=moving? Math.abs(Math.sin(ph))*0.045*swing : Math.sin(t*2+p.idx)*0.01;
  b.rotation.x=moving? 0.12*swing : 0;
  b.rotation.z=0;
  // legs
  for(let i=0;i<2;i++){
    const s=i===0?1:-1;
    const l=u.legs[i];
    l.hip.rotation.x=Math.sin(ph+i*Math.PI)*0.75*swing;
    l.knee.rotation.x=Math.max(0,-Math.sin(ph+i*Math.PI))*1.1*swing + 0.08;
    l.hip.rotation.z=s*0.03;
    l.knee.rotation.y=0;
  }
  // arms
  for(let i=0;i<2;i++){
    const a=u.arms[i]; const s=i===0?1:-1;
    a.shoulder.rotation.x=Math.sin(ph+(i+1)*Math.PI)*0.55*swing;
    a.shoulder.rotation.z=s*0.12;
    a.elbow.rotation.x=-0.35 - Math.max(0,Math.sin(ph+(i+1)*Math.PI))*0.4*swing;
  }
  // idle breathing / look
  u.headG.rotation.y=moving? Math.sin(t*0.7+p.idx)*0.08 : Math.sin(t*0.5+p.idx)*0.18;
  u.headG.rotation.x=moving? -0.05 : Math.sin(t*0.8+p.idx)*0.04;
  // blink
  const blink=(Math.sin(t*1.3+p.idx*2.1)>0.985)?0.1:1;
  u.eyes.forEach(e=>e.scale.y=0.7*blink);
  // expressions
  if(p.celebrate>0){
    const c=t*8;
    b.position.y=Math.abs(Math.sin(c))*0.18;
    u.arms[0].shoulder.rotation.x=-2.6+Math.sin(c)*0.3; u.arms[1].shoulder.rotation.x=-2.6-Math.sin(c)*0.3;
    u.arms[0].shoulder.rotation.z=0.6; u.arms[1].shoulder.rotation.z=-0.6;
    u.legs[0].hip.rotation.x=Math.sin(c)*0.4; u.legs[1].hip.rotation.x=-Math.sin(c)*0.4;
    u.mouth.scale.set(1.6,2.5,1); u.mouth.position.y=-0.058;
    u.headG.rotation.x=-0.2;
    mesh.rotation.y=p.facing+Math.sin(t*3)*0.3;
  } else if(p.dive>0){
    b.rotation.z=p.diveDir*1.2; b.position.y=-0.5;
    u.arms[0].shoulder.rotation.x=-1.8; u.arms[1].shoulder.rotation.x=-1.8;
    u.arms[0].shoulder.rotation.z=1.2; u.arms[1].shoulder.rotation.z=-1.2;
    u.legs[0].hip.rotation.x=0.4; u.legs[1].hip.rotation.x=-0.2;
    u.mouth.scale.set(1.2,2,1);
  } else if(p.slide>0){
    b.rotation.x=-1.15; b.position.y=-0.55;
    u.legs[0].hip.rotation.x=-1.3; u.legs[1].hip.rotation.x=0.3;
    u.arms[0].shoulder.rotation.x=0.8; u.arms[1].shoulder.rotation.x=-0.6;
    u.mouth.scale.set(1.3,1.8,1);
  } else {
    u.mouth.scale.set(1,1,1); u.mouth.position.y=-0.065;
    if(p.shootAnim>0){ u.legs[1].hip.rotation.x=-1.4*(p.shootAnim/0.3); u.legs[1].knee.rotation.x=0.3; u.arms[0].shoulder.rotation.x=0.8; u.arms[1].shoulder.rotation.x=-0.8; }
    if(p.passAnim>0){ u.legs[0].hip.rotation.x=-1.0*(p.passAnim/0.25); u.arms[0].shoulder.rotation.x=0.5; }
    if(p.expression==='strain'){ u.mouth.scale.set(1.3,2,1); u.eyes.forEach(e=>e.scale.y=0.45); }
  }
  // aura
  const pw=POWERS[p.powerType];
  const activePower=(p.speedBoost>0||p.shield>0||p.invuln>0||p.frozen>0);
  u.aura.material.opacity=controlled?0.55:(activePower?0.5:0);
  u.aura.material.color.setHex(controlled?0xffffff:pw.color);
  u.aura.scale.setScalar(1+Math.sin(t*6)*0.06);
  // shadow stays on ground
  u.shadow.position.y=0.02-p.y;
  u.shadow.scale.setScalar(1+p.y*0.3);
  u.shadow.material.opacity=Math.max(0.15,0.5-p.y*0.08);
}

export function createBall(){
  const tex=canvasTex(256,256,(ctx,w,h)=>{
    ctx.fillStyle='#f8f8f2'; ctx.fillRect(0,0,w,h);
    ctx.fillStyle='#151515';
    for(let y=0;y<4;y++) for(let x=0;x<6;x++){
      const cx=x*w/6+(y%2?w/12:0), cy=y*h/4+h/8, r=18;
      ctx.beginPath(); for(let i=0;i<5;i++){ const a=i/5*Math.PI*2-Math.PI/2; const px=cx+Math.cos(a)*r, py=cy+Math.sin(a)*r; i?ctx.lineTo(px,py):ctx.moveTo(px,py); } ctx.closePath(); ctx.fill();
    }
  });
  const m=new THREE.Mesh(new THREE.SphereGeometry(0.22,24,18),mat(0xffffff,{map:tex,roughness:0.4}));
  m.castShadow=true;
  const glow=new THREE.Mesh(new THREE.SphereGeometry(0.3,16,12),new THREE.MeshBasicMaterial({color:0xff5a2a,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false}));
  m.add(glow); m.userData.glow=glow;
  return m;
}
