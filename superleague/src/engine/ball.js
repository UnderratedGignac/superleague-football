// ============================================================================
//  Match ball — true truncated-icosahedron panel construction, rolling physics
// ============================================================================
import * as THREE from 'three';

export const BALL_R = 0.111;

function icosahedron() {
  const t = (1 + Math.sqrt(5)) / 2;
  const v = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ].map(a => new THREE.Vector3(...a).normalize());
  const f = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];
  return { v, f };
}

function buildBallGeometry(R) {
  const { v, f } = icosahedron();
  const key = (a, b) => a < b ? `${a}_${b}` : `${b}_${a}`;
  const edgePt = new Map();
  const tp = (a, b) => {
    const k = key(a, b) + (a < b ? 'a' : 'b');
    if (!edgePt.has(k)) {
      const from = a < b ? a : b, to = a < b ? b : a;
      edgePt.set(k, v[from].clone().lerp(v[to], 1 / 3).normalize());
    }
    return edgePt.get(k);
  };
  const neighbours = v.map(() => new Set());
  for (const [a, b, c] of f) { neighbours[a].add(b).add(c); neighbours[b].add(a).add(c); neighbours[c].add(a).add(b); }

  const pos = [], nor = [], uv = [], idx = [], groups = [];
  const addPanel = (points, isPent) => {
    const centre = new THREE.Vector3();
    points.forEach(p => centre.add(p));
    centre.divideScalar(points.length).normalize();
    // inset toward the centre to open a seam, then bulge slightly
    const inset = points.map(p => p.clone().lerp(centre, 0.075).normalize());
    const start = pos.length / 3;
    const push = (p, r) => {
      const q = p.clone().multiplyScalar(r);
      pos.push(q.x, q.y, q.z);
      nor.push(p.x, p.y, p.z);
      uv.push(0.5 + p.x * 0.5, 0.5 + p.z * 0.5);
    };
    push(centre, R * 1.012);
    // rim (slightly lower so seams read)
    for (const p of inset) push(p, R * 0.995);
    // bevel ring outward
    const outerStart = pos.length / 3;
    for (const p of points) push(p, R * 0.955);
    const n = points.length;
    for (let i = 0; i < n; i++) {
      const a = start + 1 + i, b = start + 1 + ((i + 1) % n);
      idx.push(start, a, b);
    }
    for (let i = 0; i < n; i++) {
      const a = start + 1 + i, b = start + 1 + ((i + 1) % n);
      const c = outerStart + i, d = outerStart + ((i + 1) % n);
      idx.push(a, c, b, b, c, d);
    }
    groups.push({ start: start * 0 + 0, count: 0, isPent });
    return { indexStart: 0, isPent };
  };

  // build separately per material so we can use two groups
  const pentIdx = [], hexIdx = [];
  const collect = (points, isPent) => {
    const before = idx.length;
    addPanel(points, isPent);
    const target = isPent ? pentIdx : hexIdx;
    for (let i = before; i < idx.length; i++) target.push(idx[i]);
  };

  for (const [a, b, c] of f) {
    collect([tp(a, b), tp(b, a), tp(b, c), tp(c, b), tp(c, a), tp(a, c)], false);
  }
  for (let i = 0; i < v.length; i++) {
    const n = [...neighbours[i]];
    const axis = v[i].clone();
    const ref = Math.abs(axis.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    const ex = new THREE.Vector3().crossVectors(ref, axis).normalize();
    const ey = new THREE.Vector3().crossVectors(axis, ex).normalize();
    const pts = n.map(j => tp(i, j));
    pts.sort((p, q) => Math.atan2(p.dot(ey), p.dot(ex)) - Math.atan2(q.dot(ey), q.dot(ex)));
    collect(pts, true);
  }

  const ordered = [...hexIdx, ...pentIdx];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(ordered);
  g.addGroup(0, hexIdx.length, 0);
  g.addGroup(hexIdx.length, pentIdx.length, 1);
  g.computeBoundingSphere();
  return g;
}

let grainTex = null;
function leatherNormal() {
  if (grainTex) return grainTex;
  const s = 128;
  const c = document.createElement('canvas'); c.width = s; c.height = s;
  const x = c.getContext('2d');
  const img = x.createImageData(s, s);
  for (let i = 0; i < s * s; i++) {
    const k = i * 4;
    const n = (Math.random() - 0.5);
    img.data[k] = 128 + n * 40; img.data[k + 1] = 128 + n * 40; img.data[k + 2] = 255; img.data[k + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  grainTex = new THREE.CanvasTexture(c);
  grainTex.wrapS = grainTex.wrapT = THREE.RepeatWrapping;
  grainTex.repeat.set(4, 4);
  return grainTex;
}

export class Ball {
  constructor(scene) {
    const geo = buildBallGeometry(BALL_R);
    const white = new THREE.MeshStandardMaterial({
      color: 0xf7f9fb, roughness: 0.36, metalness: 0.02, envMapIntensity: 1.1,
      normalMap: leatherNormal(), normalScale: new THREE.Vector2(0.14, 0.14),
    });
    const black = new THREE.MeshStandardMaterial({
      color: 0x15181d, roughness: 0.42, metalness: 0.02, envMapIntensity: 0.9,
      normalMap: leatherNormal(), normalScale: new THREE.Vector2(0.14, 0.14),
    });
    this.mesh = new THREE.Mesh(geo, [white, black]);
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);

    // seam core
    const core = new THREE.Mesh(new THREE.SphereGeometry(BALL_R * 0.962, 18, 12), new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.8 }));
    this.mesh.add(core);

    // ground contact shadow
    const shTex = makeBlobTexture();
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), new THREE.MeshBasicMaterial({ map: shTex, transparent: true, opacity: 0.5, depthWrite: false, color: 0x000000 }));
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.008;
    this.shadow.renderOrder = 1;
    scene.add(this.shadow);

    // speed trail
    const N = 14;
    const tg = new THREE.BufferGeometry();
    this.trailPos = new Float32Array(N * 3);
    this.trailAge = new Float32Array(N);
    tg.setAttribute('position', new THREE.Float32BufferAttribute(this.trailPos, 3));
    tg.setAttribute('aAge', new THREE.Float32BufferAttribute(this.trailAge, 1));
    this.trailMat = new THREE.ShaderMaterial({
      uniforms: { uOpacity: { value: 0 }, uSize: { value: 90 } },
      vertexShader: `attribute float aAge; uniform float uSize; varying float vA;
        void main(){ vA = 1.0-aAge; vec4 mv = modelViewMatrix*vec4(position,1.0);
        gl_PointSize = uSize/max(1.0,-mv.z)*(0.35+0.65*vA); gl_Position = projectionMatrix*mv; }`,
      fragmentShader: `uniform float uOpacity; varying float vA;
        void main(){ vec2 d=gl_PointCoord-0.5; float r=length(d);
        float a=(1.0-smoothstep(0.0,0.5,r))*vA*vA*uOpacity; if(a<0.01) discard;
        gl_FragColor=vec4(vec3(1.0,0.99,0.95)*a,a); }`,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.trail = new THREE.Points(tg, this.trailMat);
    this.trail.frustumCulled = false;
    scene.add(this.trail);
    this.trailN = N;
    this._trailTimer = 0;

    this.pos = new THREE.Vector3(0, BALL_R, 0);
    this.vel = new THREE.Vector3();
    this.spin = new THREE.Vector3();
    this.quat = new THREE.Quaternion();
  }

  syncVisual(dt) {
    this.mesh.position.copy(this.pos);
    // rolling / spinning
    const v = this.vel;
    const onGround = this.pos.y <= BALL_R + 0.02;
    const ax = new THREE.Vector3();
    if (onGround) ax.set(v.z, 0, -v.x).divideScalar(BALL_R);
    else ax.copy(this.spin);
    const mag = ax.length();
    if (mag > 1e-4) {
      ax.divideScalar(mag);
      const q = new THREE.Quaternion().setFromAxisAngle(ax, mag * dt);
      this.quat.premultiply(q);
      this.mesh.quaternion.copy(this.quat);
    }
    // shadow scale/opacity by height
    const hgt = Math.max(0, this.pos.y - BALL_R);
    const s = 0.42 + hgt * 0.16;
    this.shadow.position.set(this.pos.x, 0.008, this.pos.z);
    this.shadow.scale.setScalar(s / 0.5);
    this.shadow.material.opacity = Math.max(0.06, 0.5 - hgt * 0.055);

    // trail
    this._trailTimer += dt;
    const speed = v.length();
    this.trailMat.uniforms.uOpacity.value += ((speed > 14 ? 0.55 : 0) - this.trailMat.uniforms.uOpacity.value) * Math.min(1, dt * 8);
    if (this._trailTimer > 0.016) {
      this._trailTimer = 0;
      for (let i = this.trailN - 1; i > 0; i--) {
        this.trailPos[i * 3] = this.trailPos[(i - 1) * 3];
        this.trailPos[i * 3 + 1] = this.trailPos[(i - 1) * 3 + 1];
        this.trailPos[i * 3 + 2] = this.trailPos[(i - 1) * 3 + 2];
        this.trailAge[i] = Math.min(1, this.trailAge[i - 1] + 1 / this.trailN);
      }
      this.trailPos[0] = this.pos.x; this.trailPos[1] = this.pos.y; this.trailPos[2] = this.pos.z;
      this.trailAge[0] = 0;
      this.trail.geometry.attributes.position.needsUpdate = true;
      this.trail.geometry.attributes.aAge.needsUpdate = true;
    }
  }

  reset(x = 0, z = 0) {
    this.pos.set(x, BALL_R, z); this.vel.set(0, 0, 0); this.spin.set(0, 0, 0);
    for (let i = 0; i < this.trailN; i++) { this.trailPos[i * 3] = x; this.trailPos[i * 3 + 1] = BALL_R; this.trailPos[i * 3 + 2] = z; this.trailAge[i] = 1; }
  }
}

let blobTex = null;
export function makeBlobTexture() {
  if (blobTex) return blobTex;
  const s = 128;
  const c = document.createElement('canvas'); c.width = s; c.height = s;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(0,0,0,0.85)');
  g.addColorStop(0.45, 'rgba(0,0,0,0.42)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, s, s);
  blobTex = new THREE.CanvasTexture(c);
  return blobTex;
}
