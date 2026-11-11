// ============================================================================
//  GPU-instanced particle pool: turf divots, dust, confetti, sweat spray
// ============================================================================
import * as THREE from 'three';

function particleTexture() {
  const s = 64;
  const c = document.createElement('canvas'); c.width = s; c.height = s;
  const x = c.getContext('2d');
  // left half: soft blob, right half: hard rect (selected by aShape)
  x.clearRect(0, 0, s, s);
  const g = x.createRadialGradient(s * 0.25, s * 0.5, 0, s * 0.25, s * 0.5, s * 0.25);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, s * 0.5, s);
  x.fillStyle = '#fff';
  x.fillRect(s * 0.56, s * 0.18, s * 0.38, s * 0.64);
  const t = new THREE.CanvasTexture(c);
  return t;
}

export class Particles {
  constructor(scene, max = 620) {
    this.max = max;
    this.n = 0;
    const geo = new THREE.PlaneGeometry(1, 1);
    this.aColor = new Float32Array(max * 3);
    this.aAlpha = new Float32Array(max);
    this.aShape = new Float32Array(max);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: particleTexture() } },
      vertexShader: `
        attribute vec3 aColor; attribute float aAlpha; attribute float aShape;
        varying vec2 vUv; varying vec3 vCol; varying float vA; varying float vS;
        void main(){
          vUv = uv; vCol = aColor; vA = aAlpha; vS = aShape;
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position,1.0);
        }`,
      fragmentShader: `
        uniform sampler2D uTex;
        varying vec2 vUv; varying vec3 vCol; varying float vA; varying float vS;
        void main(){
          vec2 uv = vec2(vUv.x*0.5 + vS*0.5, vUv.y);
          float a = texture2D(uTex, uv).a * vA;
          if(a < 0.02) discard;
          gl_FragColor = vec4(vCol, a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.renderOrder = 3;
    geo.setAttribute('aColor', new THREE.InstancedBufferAttribute(this.aColor, 3));
    geo.setAttribute('aAlpha', new THREE.InstancedBufferAttribute(this.aAlpha, 1));
    geo.setAttribute('aShape', new THREE.InstancedBufferAttribute(this.aShape, 1));
    scene.add(this.mesh);
    this.pool = [];
    for (let i = 0; i < max; i++) this.pool.push({ alive: false, p: new THREE.Vector3(), v: new THREE.Vector3(), life: 0, maxLife: 1, size: 0.1, rot: 0, spin: 0, shape: 0, col: new THREE.Color(), grav: -9.8, drag: 0.6, bounce: 0.2, flat: false });
    this._d = new THREE.Object3D();
    this._q = new THREE.Quaternion();
  }

  spawn(o) {
    for (let i = 0; i < this.max; i++) {
      const p = this.pool[i];
      if (p.alive) continue;
      p.alive = true;
      p.p.copy(o.p);
      p.v.copy(o.v);
      p.life = 0; p.maxLife = o.life ?? 0.8;
      p.size = o.size ?? 0.08;
      p.rot = Math.random() * 6.28; p.spin = o.spin ?? (Math.random() - 0.5) * 12;
      p.shape = o.shape ?? 0;
      p.col.setHex(o.color ?? 0xffffff); p.col.convertSRGBToLinear();
      p.grav = o.grav ?? -9.8; p.drag = o.drag ?? 0.7; p.bounce = o.bounce ?? 0.25;
      p.flat = !!o.flat;
      p.fade = o.fade ?? 1;
      return p;
    }
    return null;
  }

  turf(x, y, z, dirX, dirZ, power = 1, color = 0x3d6b32) {
    const n = Math.min(16, 4 + Math.round(power * 9));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (1.4 + Math.random() * 3.4) * power;
      this.spawn({
        p: new THREE.Vector3(x + (Math.random() - 0.5) * 0.2, y + 0.03, z + (Math.random() - 0.5) * 0.2),
        v: new THREE.Vector3(Math.cos(a) * sp * 0.5 + dirX * sp * 0.5, 1.6 + Math.random() * 3.2 * power, Math.sin(a) * sp * 0.5 + dirZ * sp * 0.5),
        life: 0.5 + Math.random() * 0.5, size: 0.035 + Math.random() * 0.05,
        color: Math.random() < 0.35 ? 0x6b5a34 : color, shape: 1, grav: -13, drag: 0.5, bounce: 0.15,
      });
    }
  }

  dust(x, y, z, power = 1) {
    const n = Math.min(14, 3 + Math.round(power * 8));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      this.spawn({
        p: new THREE.Vector3(x + (Math.random() - 0.5) * 0.5, y + 0.06, z + (Math.random() - 0.5) * 0.5),
        v: new THREE.Vector3(Math.cos(a) * 1.2 * power, 0.5 + Math.random() * 1.1, Math.sin(a) * 1.2 * power),
        life: 0.7 + Math.random() * 0.7, size: 0.22 + Math.random() * 0.34,
        color: 0xbfae8a, shape: 0, grav: -0.6, drag: 1.7, bounce: 0, fade: 0.55,
      });
    }
  }

  confetti(x, y, z, colors, count = 90) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 3 + Math.random() * 9;
      this.spawn({
        p: new THREE.Vector3(x + (Math.random() - 0.5) * 14, y + Math.random() * 5, z + (Math.random() - 0.5) * 10),
        v: new THREE.Vector3(Math.cos(a) * sp, 5 + Math.random() * 9, Math.sin(a) * sp),
        life: 3.2 + Math.random() * 2.4, size: 0.10 + Math.random() * 0.13,
        color: colors[(Math.random() * colors.length) | 0], shape: 1, grav: -3.4, drag: 1.25, bounce: 0, spin: (Math.random() - 0.5) * 16,
      });
    }
  }

  spray(x, y, z, n = 6, color = 0xdfefff) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      this.spawn({
        p: new THREE.Vector3(x, y, z),
        v: new THREE.Vector3(Math.cos(a) * 2.4, 1.2 + Math.random() * 2.4, Math.sin(a) * 2.4),
        life: 0.3 + Math.random() * 0.3, size: 0.03 + Math.random() * 0.04,
        color, shape: 0, grav: -11, drag: 0.4, bounce: 0,
      });
    }
  }

  update(dt) {
    let n = 0;
    const d = this._d;
    for (let i = 0; i < this.max; i++) {
      const p = this.pool[i];
      if (!p.alive) continue;
      p.life += dt;
      if (p.life >= p.maxLife) { p.alive = false; continue; }
      p.v.y += p.grav * dt;
      const dg = Math.max(0, 1 - p.drag * dt);
      p.v.multiplyScalar(dg);
      p.p.addScaledVector(p.v, dt);
      if (p.p.y < 0.012) {
        p.p.y = 0.012;
        if (p.bounce > 0 && Math.abs(p.v.y) > 0.4) { p.v.y = -p.v.y * p.bounce; p.v.x *= 0.6; p.v.z *= 0.6; }
        else { p.v.set(0, 0, 0); p.grav = 0; }
      }
      p.rot += p.spin * dt;
      const t = p.life / p.maxLife;
      const alpha = (1 - t * t) * (p.fade ?? 1);
      d.position.copy(p.p);
      if (p.shape === 1) d.rotation.set(p.rot * 0.7, p.rot, p.rot * 0.4);
      else d.rotation.set(-Math.PI / 2, 0, p.rot);
      const s = p.size * (p.shape === 0 ? (1 + t * 1.5) : 1);
      d.scale.set(s, s, s);
      d.updateMatrix();
      this.mesh.setMatrixAt(n, d.matrix);
      this.aColor[n * 3] = p.col.r; this.aColor[n * 3 + 1] = p.col.g; this.aColor[n * 3 + 2] = p.col.b;
      this.aAlpha[n] = alpha;
      this.aShape[n] = p.shape;
      n++;
    }
    this.mesh.count = n;
    if (n) {
      this.mesh.instanceMatrix.needsUpdate = true;
      this.mesh.geometry.attributes.aColor.needsUpdate = true;
      this.mesh.geometry.attributes.aAlpha.needsUpdate = true;
      this.mesh.geometry.attributes.aShape.needsUpdate = true;
    }
  }

  clear() { for (const p of this.pool) p.alive = false; this.mesh.count = 0; }
}
