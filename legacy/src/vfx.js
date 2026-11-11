import * as THREE from 'three';
const MAX=2400;
export class VFX {
  constructor(scene){
    this.scene=scene; this.parts=[]; this.rings=[]; this.beams=[]; this.ghosts=[];
    const pos=new Float32Array(MAX*3), col=new Float32Array(MAX*3), size=new Float32Array(MAX), alpha=new Float32Array(MAX);
    this.geo=new THREE.BufferGeometry();
    this.geo.setAttribute('position',new THREE.BufferAttribute(pos,3));
    this.geo.setAttribute('color',new THREE.BufferAttribute(col,3));
    this.geo.setAttribute('size',new THREE.BufferAttribute(size,1));
    this.geo.setAttribute('alpha',new THREE.BufferAttribute(alpha,1));
    this.mat=new THREE.ShaderMaterial({
      transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, vertexColors:true,
      vertexShader:`attribute float size; attribute float alpha; varying vec3 vC; varying float vA;
        void main(){ vC=color; vA=alpha; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=size*(260.0/-mv.z); gl_Position=projectionMatrix*mv; }`,
      fragmentShader:`varying vec3 vC; varying float vA; void main(){ float d=length(gl_PointCoord-0.5); float a=smoothstep(0.5,0.05,d)*vA; gl_FragColor=vec4(vC*1.6,a); }`
    });
    this.points=new THREE.Points(this.geo,this.mat); this.points.frustumCulled=false; scene.add(this.points);
    for(let i=0;i<MAX;i++) this.parts.push({life:0,max:1,x:0,y:0,z:0,vx:0,vy:0,vz:0,g:0,s:1});
    this.ringGeo=new THREE.RingGeometry(0.86,1,64);
    this.beamGeo=new THREE.CylinderGeometry(1,1,1,8,1,true);
    this.ghostGeo=new THREE.CapsuleGeometry(0.28,1.0,4,8);
    this.ghostHead=new THREE.SphereGeometry(0.14,10,8);
  }
  emit(x,y,z,color,count=12,speed=4,life=0.6,size=0.5,gravity=-4,spread=1){
    const c=new THREE.Color(color);
    for(let n=0;n<count;n++){
      const p=this.parts.find(q=>q.life<=0); if(!p) return;
      const a=Math.random()*Math.PI*2, e=(Math.random()-0.3)*Math.PI*spread;
      const sp=speed*(0.4+Math.random()*0.8);
      p.x=x; p.y=y; p.z=z; p.vx=Math.cos(a)*Math.cos(e)*sp; p.vy=Math.sin(e)*sp+speed*0.3; p.vz=Math.sin(a)*Math.cos(e)*sp;
      p.g=gravity; p.life=p.max=life*(0.6+Math.random()*0.6); p.s=size*(0.6+Math.random()*0.8);
      const i=this.parts.indexOf(p);
      this.geo.attributes.color.setXYZ(i,c.r,c.g,c.b);
    }
  }
  trail(x,y,z,color,size=0.4){ this.emit(x,y,z,color,2,0.6,0.35,size,0,0.2); }
  burst(pos,color,count=30,speed=7,life=0.8,size=0.6){ this.emit(pos.x,pos.y,pos.z,color,count,speed,life,size,-5,1); }
  ring(pos,color,radius=3,life=0.6,vertical=false){
    const m=new THREE.Mesh(this.ringGeo,new THREE.MeshBasicMaterial({color,transparent:true,opacity:0.9,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide}));
    m.position.copy(pos); if(!vertical) m.rotation.x=-Math.PI/2; m.position.y=Math.max(0.05,pos.y);
    this.scene.add(m); this.rings.push({m,life,max:life,r:radius});
  }
  beam(a,b,color,life=0.25,width=0.08){
    const m=new THREE.Mesh(this.beamGeo,new THREE.MeshBasicMaterial({color,transparent:true,opacity:0.9,blending:THREE.AdditiveBlending,depthWrite:false}));
    const dir=new THREE.Vector3().subVectors(b,a); const len=dir.length();
    m.position.copy(a).addScaledVector(dir,0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),dir.normalize()); m.scale.set(width,len,width);
    this.scene.add(m); this.beams.push({m,life,max:life});
  }
  lightning(a,b,color,segments=6){
    let prev=a.clone();
    for(let i=1;i<=segments;i++){
      const p=a.clone().lerp(b,i/segments); p.x+=(Math.random()-0.5)*0.8; p.y+=(Math.random()-0.5)*0.8; p.z+=(Math.random()-0.5)*0.8;
      this.beam(prev,p,color,0.18,0.035); prev=p;
    }
  }
  ghost(pos,facing,color){
    const g=new THREE.Group();
    const mat=new THREE.MeshBasicMaterial({color,transparent:true,opacity:0.35,blending:THREE.AdditiveBlending,depthWrite:false});
    const body=new THREE.Mesh(this.ghostGeo,mat); body.position.y=0.95; g.add(body);
    const head=new THREE.Mesh(this.ghostHead,mat); head.position.y=1.7; g.add(head);
    g.position.copy(pos); g.rotation.y=facing; this.scene.add(g); this.ghosts.push({g,mat,life:0.4,max:0.4});
  }
  confetti(pos,colors,count=160){
    for(let i=0;i<count;i++){ const c=colors[i%colors.length]; this.emit(pos.x+(Math.random()-0.5)*10,pos.y+4+Math.random()*6,pos.z+(Math.random()-0.5)*10,c,1,5,2.5,0.35,-3,1); }
  }
  update(dt){
    const pos=this.geo.attributes.position, size=this.geo.attributes.size, alpha=this.geo.attributes.alpha;
    for(let i=0;i<MAX;i++){
      const p=this.parts[i];
      if(p.life>0){ p.life-=dt; p.vy+=p.g*dt; p.x+=p.vx*dt; p.y+=p.vy*dt; p.z+=p.vz*dt;
        if(p.y<0.03){ p.y=0.03; p.vy*=-0.3; p.vx*=0.8; p.vz*=0.8; }
        const k=Math.max(0,p.life/p.max); pos.setXYZ(i,p.x,p.y,p.z); size.setX(i,p.s*(0.5+k*0.5)); alpha.setX(i,k);
      } else { alpha.setX(i,0); size.setX(i,0); }
    }
    pos.needsUpdate=true; size.needsUpdate=true; alpha.needsUpdate=true;
    for(let i=this.rings.length-1;i>=0;i--){ const r=this.rings[i]; r.life-=dt; const k=1-r.life/r.max; r.m.scale.setScalar(0.2+k*r.r); r.m.material.opacity=(1-k)*0.9; if(r.life<=0){ this.scene.remove(r.m); r.m.material.dispose(); this.rings.splice(i,1); } }
    for(let i=this.beams.length-1;i>=0;i--){ const b=this.beams[i]; b.life-=dt; b.m.material.opacity=Math.max(0,b.life/b.max); if(b.life<=0){ this.scene.remove(b.m); b.m.material.dispose(); this.beams.splice(i,1); } }
    for(let i=this.ghosts.length-1;i>=0;i--){ const g=this.ghosts[i]; g.life-=dt; g.mat.opacity=0.35*g.life/g.max; g.g.scale.multiplyScalar(1+dt*0.5); if(g.life<=0){ this.scene.remove(g.g); g.mat.dispose(); this.ghosts.splice(i,1); } }
  }
  clear(){
    this.parts.forEach(p=>p.life=0);
    [...this.rings,...this.beams].forEach(o=>{ this.scene.remove(o.m); o.m.material.dispose(); });
    this.ghosts.forEach(o=>{ this.scene.remove(o.g); o.mat.dispose(); });
    this.rings=[]; this.beams=[]; this.ghosts=[];
  }
}
