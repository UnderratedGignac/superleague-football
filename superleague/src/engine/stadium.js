// ============================================================================
//  Stadium: pitch, markings, goals+nets, two-tier bowl, instanced crowd,
//  floodlights, LED perimeter boards, roof, sky dome.
// ============================================================================
import * as THREE from 'three';

export const FIELD = {
  halfL: 52.5, halfW: 34, goalW: 7.32, goalH: 2.44, goalDepth: 2.0,
  penDepth: 16.5, penHalfW: 20.16, goalAreaDepth: 5.5, goalAreaHalfW: 9.16,
  penSpot: 11, circleR: 9.15,
};
const hexs = (n) => '#' + n.toString(16).padStart(6, '0');

// ---------------------------------------------------------------------------
//  PITCH TEXTURE
// ---------------------------------------------------------------------------
export function makePitchTexture(st, res = 2048) {
  const L = FIELD.halfL * 2, Wd = FIELD.halfW * 2;
  const w = res, h = Math.round(res * Wd / L);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d');
  const sx = w / L, sy = h / Wd;
  const PX = (m) => (m + FIELD.halfL) * sx;
  const PZ = (m) => (m + FIELD.halfW) * sy;

  // mowing stripes across the length
  const stripes = 20;
  for (let i = 0; i < stripes; i++) {
    x.fillStyle = i % 2 ? hexs(st.grass) : hexs(st.grassDark);
    x.fillRect(Math.floor(i * w / stripes), 0, Math.ceil(w / stripes) + 1, h);
  }
  // cross-mow faint banding
  x.save(); x.globalAlpha = 0.05;
  for (let i = 0; i < 12; i++) { x.fillStyle = i % 2 ? '#fff' : '#000'; x.fillRect(0, i * h / 12, w, h / 12); }
  x.restore();

  // turf grain
  for (let i = 0; i < 42000; i++) {
    const a = Math.random() * 0.055;
    x.fillStyle = Math.random() > 0.5 ? `rgba(255,255,255,${a})` : `rgba(0,20,0,${a})`;
    x.fillRect(Math.random() * w, Math.random() * h, 2, 1 + Math.random() * 2);
  }
  // wear: goal mouths, penalty spots, centre circle, touchline edges
  const wear = (mx, mz, r, alpha) => {
    const g = x.createRadialGradient(PX(mx), PZ(mz), 0, PX(mx), PZ(mz), r * sx);
    g.addColorStop(0, `rgba(120,102,66,${alpha})`);
    g.addColorStop(0.55, `rgba(110,98,60,${alpha * 0.45})`);
    g.addColorStop(1, 'rgba(110,98,60,0)');
    x.fillStyle = g; x.beginPath(); x.arc(PX(mx), PZ(mz), r * sx, 0, 7); x.fill();
  };
  wear(-FIELD.halfL + 3, 0, 8, 0.30); wear(FIELD.halfL - 3, 0, 8, 0.30);
  wear(-FIELD.halfL + FIELD.penSpot, 0, 2.4, 0.24); wear(FIELD.halfL - FIELD.penSpot, 0, 2.4, 0.24);
  wear(0, 0, 5, 0.14);
  for (const s of [-1, 1]) { wear(s * (FIELD.halfL - 1), s * (FIELD.halfW - 1), 2, 0.2); wear(s * (FIELD.halfL - 1), -s * (FIELD.halfW - 1), 2, 0.2); }

  // markings
  const LW = 0.14;
  x.strokeStyle = 'rgba(248,252,246,0.94)';
  x.fillStyle = 'rgba(248,252,246,0.94)';
  x.lineWidth = LW * sx;
  x.lineJoin = 'miter';
  const rect = (x0, z0, x1, z1) => x.strokeRect(PX(x0), PZ(z0), (x1 - x0) * sx, (z1 - z0) * sy);
  const line = (x0, z0, x1, z1) => { x.beginPath(); x.moveTo(PX(x0), PZ(z0)); x.lineTo(PX(x1), PZ(z1)); x.stroke(); };
  const spot = (mx, mz, r = 0.16) => { x.beginPath(); x.arc(PX(mx), PZ(mz), r * sx, 0, 7); x.fill(); };

  rect(-FIELD.halfL + LW / 2, -FIELD.halfW + LW / 2, FIELD.halfL - LW / 2, FIELD.halfW - LW / 2);
  line(0, -FIELD.halfW, 0, FIELD.halfW);
  x.beginPath(); x.arc(PX(0), PZ(0), FIELD.circleR * sx, 0, 7); x.stroke();
  spot(0, 0, 0.18);
  for (const s of [-1, 1]) {
    const gl = s * FIELD.halfL;
    rect(Math.min(gl, gl - s * FIELD.penDepth), -FIELD.penHalfW, Math.max(gl, gl - s * FIELD.penDepth), FIELD.penHalfW);
    rect(Math.min(gl, gl - s * FIELD.goalAreaDepth), -FIELD.goalAreaHalfW, Math.max(gl, gl - s * FIELD.goalAreaDepth), FIELD.goalAreaHalfW);
    const ps = gl - s * FIELD.penSpot;
    spot(ps, 0);
    // penalty arc (only the part outside the box)
    x.save();
    x.beginPath();
    if (s < 0) x.rect(PX(-FIELD.halfL + FIELD.penDepth), 0, w, h);
    else x.rect(0, 0, PX(FIELD.halfL - FIELD.penDepth), h);
    x.clip();
    x.beginPath(); x.arc(PX(ps), PZ(0), FIELD.circleR * sx, 0, 7); x.stroke();
    x.restore();
    // corner arcs
    for (const t of [-1, 1]) {
      x.beginPath(); x.arc(PX(gl), PZ(t * FIELD.halfW), 1 * sx, 0, 7); x.stroke();
    }
  }
  // subtle vignette / light falloff
  const g2 = x.createRadialGradient(w / 2, h / 2, h * 0.15, w / 2, h / 2, w * 0.62);
  g2.addColorStop(0, 'rgba(255,255,255,0.045)');
  g2.addColorStop(1, 'rgba(0,4,10,0.20)');
  x.fillStyle = g2; x.fillRect(0, 0, w, h);

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

let detailTex = null;
function grassDetail() {
  if (detailTex) return detailTex;
  const s = 256;
  const c = document.createElement('canvas'); c.width = s; c.height = s;
  const x = c.getContext('2d');
  const img = x.createImageData(s, s);
  for (let y = 0; y < s; y++) for (let i = 0; i < s; i++) {
    const k = (y * s + i) * 4;
    const blade = Math.sin(i * 0.9 + y * 0.35) * 0.5 + 0.5;
    const v = 140 + blade * 55 + (Math.random() - 0.5) * 90;
    img.data[k] = v * 0.85; img.data[k + 1] = v; img.data[k + 2] = v * 0.8; img.data[k + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  detailTex = new THREE.CanvasTexture(c);
  detailTex.wrapS = detailTex.wrapT = THREE.RepeatWrapping;
  return detailTex;
}

function makePitchMaterial(st, tex) {
  const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.82, metalness: 0.0, envMapIntensity: 0.35 });
  m.userData.uDetail = { value: grassDetail() };
  m.userData.uSheen = { value: new THREE.Color(st.night ? 0x9fd8b0 : 0xd8ffc0) };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uDetail = m.userData.uDetail;
    sh.uniforms.uSheen = m.userData.uSheen;
    sh.vertexShader = 'varying vec3 vWPos;\n' + sh.vertexShader;
    sh.vertexShader = sh.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n vWPos = (modelMatrix * vec4(transformed,1.0)).xyz;');
    sh.fragmentShader = 'uniform sampler2D uDetail;\nuniform vec3 uSheen;\nvarying vec3 vWPos;\n' + sh.fragmentShader;
    sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      float d1 = texture2D(uDetail, vWPos.xz * 0.85).g;
      float d2 = texture2D(uDetail, vWPos.xz * 0.11).g;
      diffuseColor.rgb *= (0.80 + 0.34 * d1) * (0.92 + 0.16 * d2);
      float stripe = step(0.5, fract(vWPos.x / 5.25));
      diffuseColor.rgb *= 0.98 + 0.04 * stripe;`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      float dd = texture2D(uDetail, vWPos.xz * 0.85).g;
      roughnessFactor = clamp(roughnessFactor - 0.16 * dd, 0.25, 1.0);`);
    // grazing-angle grass sheen
    sh.fragmentShader = sh.fragmentShader.replace('#include <output_fragment>', `
      float fres = pow(1.0 - abs(dot(normalize(vNormal), normalize(vViewPosition))), 3.0);
      outgoingLight += uSheen * fres * 0.10;
      #include <output_fragment>`);
  };
  m.customProgramCacheKey = () => 'sl-pitch';
  return m;
}

// ---------------------------------------------------------------------------
//  GOAL + NET
// ---------------------------------------------------------------------------
function buildGoal(side) {
  const g = new THREE.Group();
  const x = side * FIELD.halfL;
  const hw = FIELD.goalW / 2, h = FIELD.goalH, d = FIELD.goalDepth;
  const postMat = new THREE.MeshStandardMaterial({ color: 0xf6f8fa, roughness: 0.32, metalness: 0.15, envMapIntensity: 1.0 });
  const R = 0.06;
  const post = new THREE.CylinderGeometry(R, R, h, 12);
  for (const z of [-hw, hw]) {
    const m = new THREE.Mesh(post, postMat);
    m.position.set(x, h / 2, z); m.castShadow = true; g.add(m);
  }
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(R, R, FIELD.goalW + R * 2, 12), postMat);
  bar.rotation.x = Math.PI / 2; bar.position.set(x, h, 0); bar.castShadow = true; g.add(bar);
  // back stanchions
  for (const z of [-hw, hw]) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, h * 0.72, 8), postMat);
    m.position.set(x + side * d, h * 0.36, z); g.add(m);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, d, 8), postMat);
    top.rotation.z = Math.PI / 2;
    top.position.set(x + side * d / 2, h * 0.86, z);
    top.rotation.x = 0; top.rotation.y = 0;
    top.rotation.set(0, 0, Math.PI / 2);
    top.position.y = h - (h - h * 0.72) / 2;
    g.add(top);
  }
  // net: quad mesh panels with a grid texture (alpha)
  const netTex = makeNetTexture();
  const netMat = new THREE.MeshStandardMaterial({
    map: netTex, transparent: true, alphaTest: 0.28, side: THREE.DoubleSide,
    roughness: 0.9, metalness: 0, color: 0xf0f6ff, depthWrite: false, envMapIntensity: 0.4,
  });
  const panel = (w2, h2, pos, rot, ru, rv) => {
    const geo = new THREE.PlaneGeometry(w2, h2, 1, 1);
    const t = netTex.clone(); t.needsUpdate = true;
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(ru, rv);
    const mm = netMat.clone(); mm.map = t;
    const mesh = new THREE.Mesh(geo, mm);
    mesh.position.copy(pos); mesh.rotation.copy(rot);
    g.add(mesh);
    return mesh;
  };
  const back = panel(FIELD.goalW, h * 0.74, new THREE.Vector3(x + side * d, h * 0.37, 0), new THREE.Euler(0, Math.PI / 2, 0), FIELD.goalW * 3.2, h * 0.74 * 3.2);
  const top = panel(d, FIELD.goalW, new THREE.Vector3(x + side * d / 2, h, 0), new THREE.Euler(-Math.PI / 2, 0, Math.PI / 2), d * 3.2, FIELD.goalW * 3.2);
  const s1 = panel(d, h * 0.86, new THREE.Vector3(x + side * d / 2, h * 0.43, -hw), new THREE.Euler(0, 0, 0), d * 3.2, h * 0.86 * 3.2);
  const s2 = panel(d, h * 0.86, new THREE.Vector3(x + side * d / 2, h * 0.43, hw), new THREE.Euler(0, 0, 0), d * 3.2, h * 0.86 * 3.2);
  g.userData.net = { back, top, s1, s2, side };
  return g;
}

let netTexCache = null;
function makeNetTexture() {
  if (netTexCache) return netTexCache;
  const s = 64;
  const c = document.createElement('canvas'); c.width = s; c.height = s;
  const x = c.getContext('2d');
  x.clearRect(0, 0, s, s);
  x.strokeStyle = 'rgba(255,255,255,0.95)';
  x.lineWidth = 3.2;
  x.beginPath();
  x.moveTo(2, 0); x.lineTo(2, s); x.moveTo(0, 2); x.lineTo(s, 2);
  x.stroke();
  netTexCache = new THREE.CanvasTexture(c);
  netTexCache.wrapS = netTexCache.wrapT = THREE.RepeatWrapping;
  return netTexCache;
}

// ---------------------------------------------------------------------------
//  CROWD (crossed-quad instanced people, custom shader)
// ---------------------------------------------------------------------------
function crowdTexture() {
  const w = 64, h = 128;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d');
  x.clearRect(0, 0, w, h);
  // torso (white -> tinted per instance)
  x.fillStyle = '#ffffff';
  x.beginPath();
  x.moveTo(14, 52); x.lineTo(50, 52); x.lineTo(54, 118); x.lineTo(10, 118); x.closePath(); x.fill();
  // arms
  x.beginPath(); x.moveTo(10, 56); x.lineTo(18, 56); x.lineTo(16, 100); x.lineTo(7, 100); x.closePath(); x.fill();
  x.beginPath(); x.moveTo(46, 56); x.lineTo(54, 56); x.lineTo(57, 100); x.lineTo(48, 100); x.closePath(); x.fill();
  // head + neck (skin, not tinted)
  x.fillStyle = '#c79a72';
  x.fillRect(27, 40, 10, 14);
  x.beginPath(); x.arc(32, 30, 14, 0, 7); x.fill();
  // hair
  x.fillStyle = '#241a12';
  x.beginPath(); x.arc(32, 26, 14, Math.PI * 1.05, Math.PI * 1.95); x.fill();
  // shading
  const g = x.createLinearGradient(0, 40, 0, 120);
  g.addColorStop(0, 'rgba(255,255,255,0.10)');
  g.addColorStop(1, 'rgba(0,0,0,0.35)');
  x.fillStyle = g; x.fillRect(0, 0, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function crossedQuad(w, h) {
  const g = new THREE.BufferGeometry();
  const pos = [], uv = [], idx = [];
  const push = (rot) => {
    const b = pos.length / 3;
    const c = Math.cos(rot), s = Math.sin(rot);
    const pts = [[-w / 2, 0], [w / 2, 0], [w / 2, h], [-w / 2, h]];
    for (const [px, py] of pts) { pos.push(px * c, py, px * s); }
    uv.push(0, 0, 1, 0, 1, 1, 0, 1);
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  };
  push(0); push(Math.PI / 2);
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function buildCrowd(st, placements, tint) {
  const n = placements.length;
  const geo = crossedQuad(0.52, 0.92);
  const shirt = new Float32Array(n * 3), phase = new Float32Array(n);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTex: { value: crowdTexture() },
      uTime: { value: 0 },
      uWave: { value: 0 },
      uAmb: { value: new THREE.Color(tint) },
      uFogColor: { value: new THREE.Color(st.fog) },
      uFogDensity: { value: st.fogDensity },
      uLight: { value: st.night ? 0.95 : 1.05 },
    },
    vertexShader: `
      attribute vec3 aShirt; attribute float aPhase;
      uniform float uTime, uWave;
      varying vec2 vUv; varying vec3 vShirt; varying float vShade; varying float vFog;
      void main(){
        vUv = uv; vShirt = aShirt;
        float w = sin(uTime*2.4 + aPhase)*0.5+0.5;
        vec3 p = position;
        p.y *= 1.0 + uWave*0.26*w;
        p.y += uWave*0.10*w;
        p.x += sin(uTime*1.3 + aPhase*1.7)*0.018*(0.3+uWave);
        vec4 wp = instanceMatrix * vec4(p,1.0);
        vShade = 0.55 + 0.45*clamp(position.y/0.92,0.0,1.0);
        vec4 mv = modelViewMatrix * wp;
        vFog = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform sampler2D uTex; uniform vec3 uAmb; uniform vec3 uFogColor;
      uniform float uFogDensity, uLight;
      varying vec2 vUv; varying vec3 vShirt; varying float vShade; varying float vFog;
      void main(){
        vec4 t = texture2D(uTex, vUv);
        if(t.a < 0.45) discard;
        float white = smoothstep(0.86, 0.99, min(t.r, min(t.g, t.b)));
        vec3 col = mix(t.rgb, t.rgb*vShirt, white);
        col *= vShade * uLight * uAmb;
        float f = 1.0 - exp(-uFogDensity*uFogDensity*vFog*vFog);
        col = mix(col, uFogColor, clamp(f,0.0,1.0));
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const p = placements[i];
    dummy.position.set(p.x, p.y, p.z);
    dummy.rotation.set(0, p.ry + (Math.random() - 0.5) * 0.35, 0);
    const s = 0.9 + Math.random() * 0.22;
    dummy.scale.set(s, s * (0.94 + Math.random() * 0.14), s);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    col.setHex(p.c); col.convertSRGBToLinear();
    shirt[i * 3] = col.r; shirt[i * 3 + 1] = col.g; shirt[i * 3 + 2] = col.b;
    phase[i] = Math.random() * 100;
  }
  geo.setAttribute('aShirt', new THREE.InstancedBufferAttribute(shirt, 3));
  geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false;
  mesh.userData.mat = mat;
  return mesh;
}

// ---------------------------------------------------------------------------
//  BOWL RING — band of quads between two rectangles (handles corners)
// ---------------------------------------------------------------------------
function ringPoints(a, b, step) {
  // perimeter loop of rectangle, clockwise, with roughly uniform spacing
  const pts = [];
  const corners = [[-a, -b], [a, -b], [a, b], [-a, b]];
  for (let e = 0; e < 4; e++) {
    const p0 = corners[e], p1 = corners[(e + 1) % 4];
    const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
    const n = Math.max(1, Math.round(len / step));
    for (let i = 0; i < n; i++) {
      const t = i / n;
      pts.push([p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t, e]);
    }
  }
  return pts;
}

function bowlRing(a0, b0, a1, b1, y0, y1, uRepeat, vRepeat = 1) {
  const inner = ringPoints(a0, b0, 2.0);
  const outer = ringPoints(a1, b1, 2.0);
  const n = Math.min(inner.length, outer.length);
  const pos = [], uv = [], idx = [], nor = [];
  let per = 0;
  for (let i = 0; i <= n; i++) {
    const ii = inner[i % n], oo = outer[i % n];
    if (i > 0) per += Math.hypot(ii[0] - inner[(i - 1) % n][0], ii[1] - inner[(i - 1) % n][1]);
    pos.push(ii[0], y0, ii[1]); uv.push(per / uRepeat, 0); nor.push(0, 1, 0);
    pos.push(oo[0], y1, oo[1]); uv.push(per / uRepeat, vRepeat); nor.push(0, 1, 0);
  }
  for (let i = 0; i < n; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function wallRing(a, b, y0, y1, uRepeat) {
  const pts = ringPoints(a, b, 2.0);
  const n = pts.length;
  const pos = [], uv = [], idx = [];
  let per = 0;
  for (let i = 0; i <= n; i++) {
    const p = pts[i % n];
    if (i > 0) per += Math.hypot(p[0] - pts[(i - 1) % n][0], p[1] - pts[(i - 1) % n][1]);
    pos.push(p[0], y0, p[1]); uv.push(per / uRepeat, 0);
    pos.push(p[0], y1, p[1]); uv.push(per / uRepeat, 1);
  }
  for (let i = 0; i < n; i++) { const a2 = i * 2; idx.push(a2, a2 + 2, a2 + 1, a2 + 1, a2 + 2, a2 + 3); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

// stand rake texture: seats + speckled distant crowd
function rakeTexture(st, seatHex) {
  const w = 512, h = 256;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d');
  x.fillStyle = hexs(st.roof); x.fillRect(0, 0, w, h);
  const rows = 16;
  for (let r = 0; r < rows; r++) {
    const y = (r / rows) * h, rh = h / rows;
    x.fillStyle = r % 2 ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.14)';
    x.fillRect(0, y, w, rh);
    // seats
    const cols = 40;
    for (let i = 0; i < cols; i++) {
      const sx = (i / cols) * w, sw = w / cols;
      x.fillStyle = hexs(seatHex);
      x.globalAlpha = 0.55 + Math.random() * 0.35;
      x.fillRect(sx + 1, y + rh * 0.35, sw - 2, rh * 0.55);
      x.globalAlpha = 1;
      // spectator blob
      if (Math.random() < 0.80) {
        const pal = [0x1c2230, 0x30363f, 0x8a2b2b, 0x2b4d8a, 0xd8d2c4, 0x1f6b4a, 0x6b4a8a, 0xb08040];
        x.fillStyle = hexs(pal[(Math.random() * pal.length) | 0]);
        x.fillRect(sx + sw * 0.22, y + rh * 0.18, sw * 0.56, rh * 0.62);
        x.fillStyle = hexs([0xc79a72, 0x8a5f3c, 0xe0b48c, 0x5c3a22][(Math.random() * 4) | 0]);
        x.beginPath(); x.arc(sx + sw * 0.5, y + rh * 0.20, sw * 0.20, 0, 7); x.fill();
      }
    }
    x.fillStyle = 'rgba(0,0,0,0.30)'; x.fillRect(0, y, w, 1.5);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

// LED perimeter board texture
export function makeAdTexture(texts) {
  const w = 2048, h = 128;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d');
  const palette = [['#0b1220', '#c6ff3d'], ['#c0182b', '#ffffff'], ['#0fb5c9', '#04222a'], ['#f2c018', '#171204'], ['#6d28d9', '#ffe9a8']];
  const seg = w / texts.length;
  texts.forEach((t, i) => {
    const [bg, fg] = palette[i % palette.length];
    x.fillStyle = bg; x.fillRect(i * seg, 0, seg, h);
    x.fillStyle = fg;
    x.font = '800 62px "Barlow Condensed", Impact, sans-serif';
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(t.toUpperCase(), i * seg + seg / 2, h / 2 + 2);
    x.fillStyle = 'rgba(255,255,255,.10)';
    x.fillRect(i * seg, 0, 3, h);
  });
  // LED scanlines
  x.fillStyle = 'rgba(0,0,0,0.20)';
  for (let y = 0; y < h; y += 4) x.fillRect(0, y, w, 1.4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
  t.anisotropy = 4;
  return t;
}

// ---------------------------------------------------------------------------
//  SKY
// ---------------------------------------------------------------------------
export function makeSky(st) {
  const geo = new THREE.SphereGeometry(600, 32, 20);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTop: { value: new THREE.Color(st.skyTop) },
      uHor: { value: new THREE.Color(st.skyHorizon) },
      uGnd: { value: new THREE.Color(st.skyGround) },
      uSunDir: { value: new THREE.Vector3(Math.cos(st.sunAz) * Math.cos(st.sunEl), Math.sin(st.sunEl), Math.sin(st.sunAz) * Math.cos(st.sunEl)).normalize() },
      uSunCol: { value: new THREE.Color(st.sun) },
      uNight: { value: st.night ? 1 : 0 },
      uTime: { value: 0 },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      uniform vec3 uTop,uHor,uGnd,uSunCol,uSunDir; uniform float uNight,uTime;
      varying vec3 vDir;
      float hash(vec3 p){ return fract(sin(dot(p,vec3(12.9898,78.233,45.164)))*43758.5453); }
      void main(){
        vec3 d = normalize(vDir);
        float y = d.y;
        vec3 col;
        if(y > 0.0){
          float t = pow(clamp(y,0.0,1.0), 0.55);
          col = mix(uHor, uTop, t);
        } else {
          col = mix(uHor, uGnd, clamp(-y*3.0,0.0,1.0));
        }
        float sd = max(dot(d, normalize(uSunDir)), 0.0);
        col += uSunCol * pow(sd, 220.0) * 2.2;
        col += uSunCol * pow(sd, 8.0) * 0.16;
        if(uNight > 0.5 && y > 0.02){
          vec3 g = floor(d*260.0);
          float s = hash(g);
          float star = smoothstep(0.9975, 1.0, s) * smoothstep(0.02,0.35,y);
          col += vec3(0.9,0.95,1.0) * star * (0.6+0.4*sin(uTime*2.0+s*40.0));
        }
        gl_FragColor = vec4(col,1.0);
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide, depthWrite: false, fog: false,
  });
  const m = new THREE.Mesh(geo, mat);
  m.frustumCulled = false;
  return m;
}

// ---------------------------------------------------------------------------
//  ASSEMBLE
// ---------------------------------------------------------------------------
export function buildStadium(scene, st, quality, teamData) {
  const root = new THREE.Group();
  root.name = 'stadium';
  scene.add(root);

  const pitchRes = quality === 'high' ? 2048 : quality === 'medium' ? 1536 : 1024;
  const pitchTex = makePitchTexture(st, pitchRes);
  const pitchMat = makePitchMaterial(st, pitchTex);
  const pitch = new THREE.Mesh(new THREE.PlaneGeometry(FIELD.halfL * 2, FIELD.halfW * 2, 1, 1), pitchMat);
  pitch.rotation.x = -Math.PI / 2;
  pitch.receiveShadow = true;
  root.add(pitch);

  // surrounding apron
  const apronMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(st.grassDark).multiplyScalar(0.62), roughness: 0.95 });
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(FIELD.halfL * 2 + 22, FIELD.halfW * 2 + 20), apronMat);
  apron.rotation.x = -Math.PI / 2; apron.position.y = -0.012; apron.receiveShadow = true;
  root.add(apron);

  // goals
  const goals = [buildGoal(-1), buildGoal(1)];
  goals.forEach(g => root.add(g));

  // corner flags
  const flagMat = new THREE.MeshStandardMaterial({ color: 0xffd84d, roughness: 0.7, side: THREE.DoubleSide });
  const poleMat = new THREE.MeshStandardMaterial({ color: 0xf0f2f5, roughness: 0.5 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.5, 6), poleMat);
    pole.position.set(sx * FIELD.halfL, 0.75, sz * FIELD.halfW);
    root.add(pole);
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.3), flagMat);
    fl.position.set(sx * FIELD.halfL + sx * 0.21, 1.34, sz * FIELD.halfW);
    fl.rotation.y = Math.PI / 2;
    root.add(fl);
  }

  // ---- bowl geometry ----
  const A0 = FIELD.halfL + 8, B0 = FIELD.halfW + 7;
  const lowRows = 16, lowDepth = 15, lowRise = 8.2;
  const upRows = 14, upDepth = 14, upRise = 9.5;
  const lowY0 = 1.1, lowY1 = lowY0 + lowRise;
  const gap = 4.5;
  const upY0 = lowY1 + 4.0, upY1 = upY0 + upRise;

  const rakeTex = rakeTexture(st, st.seat);
  const rakeMat = new THREE.MeshStandardMaterial({ map: rakeTex, roughness: 0.9, metalness: 0.0, side: THREE.DoubleSide, envMapIntensity: 0.25 });
  const lowRake = new THREE.Mesh(bowlRing(A0, B0, A0 + lowDepth, B0 + lowDepth, lowY0, lowY1, 9.0, lowRows / 16 * 2.0), rakeMat);
  lowRake.receiveShadow = false; root.add(lowRake);
  const upRake = new THREE.Mesh(bowlRing(A0 + lowDepth + gap, B0 + lowDepth + gap, A0 + lowDepth + gap + upDepth, B0 + lowDepth + gap + upDepth, upY0, upY1, 9.0, upRows / 16 * 2.0), rakeMat);
  root.add(upRake);

  // fascia walls
  const concMat = new THREE.MeshStandardMaterial({ color: 0x1a1e26, roughness: 0.85, side: THREE.DoubleSide });
  root.add(new THREE.Mesh(wallRing(A0, B0, -0.4, lowY0, 8), concMat));
  root.add(new THREE.Mesh(wallRing(A0 + lowDepth, B0 + lowDepth, lowY1, upY0 - 0.6, 8), concMat));
  const midTier = new THREE.Mesh(bowlRing(A0 + lowDepth, B0 + lowDepth, A0 + lowDepth + gap, B0 + lowDepth + gap, lowY1, upY0 - 0.6, 8, 1), concMat);
  root.add(midTier);
  // executive box band (glass)
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x0d1622, roughness: 0.12, metalness: 0.5, emissive: 0x2a3f5c, emissiveIntensity: st.night ? 0.7 : 0.18, side: THREE.DoubleSide });
  root.add(new THREE.Mesh(wallRing(A0 + lowDepth + 0.1, B0 + lowDepth + 0.1, lowY1 + 0.4, upY0 - 0.9, 6), glassMat));
  root.add(new THREE.Mesh(wallRing(A0 + lowDepth + gap + upDepth, B0 + lowDepth + gap + upDepth, upY1, upY1 + 2.4, 8), concMat));

  // roof
  const roofMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(st.roof).multiplyScalar(0.8), roughness: 0.7, metalness: 0.25, side: THREE.DoubleSide });
  const rA = A0 + lowDepth + gap + upDepth, rB = B0 + lowDepth + gap + upDepth;
  const roof = new THREE.Mesh(bowlRing(rA - 13, rB - 13, rA + 2.5, rB + 2.5, upY1 + 5.2, upY1 + 2.4, 10, 1), roofMat);
  root.add(roof);
  // roof light strip
  const stripMat = new THREE.MeshBasicMaterial({ color: st.night ? 0xfff4e0 : 0xdfe6ee });
  root.add(new THREE.Mesh(bowlRing(rA - 12.6, rB - 12.6, rA - 11.8, rB - 11.8, upY1 + 5.05, upY1 + 5.0, 10, 1), stripMat));

  // roof support columns
  const colGeo = new THREE.CylinderGeometry(0.34, 0.34, upY1 + 4, 6);
  const colMat = new THREE.MeshStandardMaterial({ color: 0x2a2f38, roughness: 0.6, metalness: 0.4 });
  const colPts = ringPoints(rA + 1.2, rB + 1.2, 12);
  const cols = new THREE.InstancedMesh(colGeo, colMat, colPts.length);
  const dm = new THREE.Object3D();
  colPts.forEach((p, i) => { dm.position.set(p[0], (upY1 + 4) / 2, p[1]); dm.rotation.set(0, 0, 0); dm.scale.set(1, 1, 1); dm.updateMatrix(); cols.setMatrixAt(i, dm.matrix); });
  cols.instanceMatrix.needsUpdate = true;
  root.add(cols);

  // ---- crowd placements ----
  const crowdPal = [
    st.seat, 0x1c2230, 0x2b3038, 0xd8d2c4, 0x8a2b2b, 0x2b4d8a, 0x1f6b4a, 0x6b4a8a,
    teamData ? teamData[0].kit.shirt : 0xffffff, teamData ? teamData[1].kit.shirt : 0xffffff,
    teamData ? teamData[0].kit.shirt : 0xffffff, 0xb08040, 0x30363f,
  ];
  const budget = quality === 'high' ? 13000 : quality === 'medium' ? 7500 : 3600;
  const placements = [];
  const addTier = (a, b, depth, y0, y1, rows, share) => {
    const per = ringPoints(a, b, 0.86);
    const target = Math.floor(budget * share);
    const stride = Math.max(1, Math.round(per.length * rows / target));
    let count = 0;
    for (let r = 0; r < rows; r++) {
      const f = (r + 0.5) / rows;
      const aa = a + depth * f, bb = b + depth * f, y = y0 + (y1 - y0) * f - 0.42;
      const ring = ringPoints(aa, bb, 0.86);
      for (let i = 0; i < ring.length; i += stride) {
        if (count >= target) break;
        if (Math.random() < 0.10) continue; // empty seats
        const p = ring[i];
        const ry = Math.atan2(-p[0], -p[1]);
        placements.push({ x: p[0], y, z: p[1], ry, c: crowdPal[(Math.random() * crowdPal.length) | 0] });
        count++;
      }
    }
  };
  addTier(A0, B0, lowDepth, lowY0, lowY1, lowRows, 0.58);
  addTier(A0 + lowDepth + gap, B0 + lowDepth + gap, upDepth, upY0, upY1, upRows, 0.42);
  const crowd = buildCrowd(st, placements, st.crowdTint);
  root.add(crowd);

  // camera flashes among the crowd
  const flashN = quality === 'low' ? 120 : 340;
  const fpos = new Float32Array(flashN * 3), fph = new Float32Array(flashN);
  for (let i = 0; i < flashN; i++) {
    const p = placements[(Math.random() * placements.length) | 0];
    fpos[i * 3] = p.x; fpos[i * 3 + 1] = p.y + 0.75; fpos[i * 3 + 2] = p.z;
    fph[i] = Math.random() * 100;
  }
  const fgeo = new THREE.BufferGeometry();
  fgeo.setAttribute('position', new THREE.Float32BufferAttribute(fpos, 3));
  fgeo.setAttribute('aPhase', new THREE.Float32BufferAttribute(fph, 1));
  const flashMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uRate: { value: st.night ? 1.0 : 0.35 }, uSize: { value: 170 } },
    vertexShader: `attribute float aPhase; uniform float uTime,uRate,uSize; varying float vI;
      void main(){
        float t = fract(uTime*0.55 + aPhase);
        float pulse = smoothstep(0.0,0.012,t)*(1.0-smoothstep(0.012,0.055,t));
        vI = pulse * step(fract(aPhase*7.13), uRate);
        vec4 mv = modelViewMatrix * vec4(position,1.0);
        gl_PointSize = uSize/max(1.0,-mv.z) * (0.6+vI);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `varying float vI; void main(){
        vec2 d = gl_PointCoord-0.5; float r = length(d);
        float a = (1.0-smoothstep(0.0,0.5,r))*vI;
        if(a<0.01) discard;
        gl_FragColor = vec4(vec3(1.0,0.98,0.92)*a*2.0, a);
      }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const flashes = new THREE.Points(fgeo, flashMat);
  flashes.frustumCulled = false;
  root.add(flashes);

  // ---- LED perimeter boards ----
  const adTexts = ['Superleague', 'Ember City', 'Kick it forward', 'Neon Harbor', 'Matchday', 'Aurelia Gold', 'Play the beautiful game', 'Port Celeste'];
  const adTex = makeAdTexture(adTexts);
  adTex.repeat.set(9, 1);
  const adMat = new THREE.MeshBasicMaterial({ map: adTex, side: THREE.DoubleSide, toneMapped: true });
  const adA = FIELD.halfL + 5.6, adB = FIELD.halfW + 4.6;
  const ad = new THREE.Mesh(wallRing(adA, adB, 0.02, 1.02, 26), adMat);
  root.add(ad);
  const adBack = new THREE.Mesh(wallRing(adA + 0.16, adB + 0.16, 0.0, 1.06, 8), concMat);
  root.add(adBack);

  // ---- floodlights ----
  const floodGroup = new THREE.Group();
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff8e8 });
  const towerMat = new THREE.MeshStandardMaterial({ color: 0x22262e, roughness: 0.55, metalness: 0.5 });
  const coneMat = new THREE.MeshBasicMaterial({ color: st.night ? 0xbcd8ff : 0xfff0d0, transparent: true, opacity: st.night ? 0.055 : 0.02, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const lampPositions = [];
  if (st.id === 'eclipse') {
    // roof ring lights
    const ring = ringPoints(rA - 12, rB - 12, 9);
    ring.forEach(p => lampPositions.push([p[0], upY1 + 4.6, p[1]]));
  } else {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const tx = sx * (rA + 4), tz = sz * (rB + 4), ty = upY1 + 12;
      const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, ty, 8), towerMat);
      tower.position.set(tx, ty / 2, tz); floodGroup.add(tower);
      const rig = new THREE.Mesh(new THREE.BoxGeometry(7, 3.2, 0.7), towerMat);
      rig.position.set(tx, ty + 1.2, tz);
      rig.lookAt(0, ty, 0);
      floodGroup.add(rig);
      for (let i = 0; i < 8; i++) for (let j = 0; j < 3; j++) {
        const lp = new THREE.Vector3(-3 + i * 0.86, -1 + j * 1.0, 0.42);
        lp.applyEuler(rig.rotation).add(rig.position);
        const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.62, 0.16), lampMat);
        lamp.position.copy(lp); lamp.rotation.copy(rig.rotation);
        floodGroup.add(lamp);
      }
      lampPositions.push([tx, ty + 1, tz]);
    }
  }
  // volumetric cones
  lampPositions.forEach(([lx, ly, lz]) => {
    const target = new THREE.Vector3(lx * 0.18, 0, lz * 0.18);
    const dist = new THREE.Vector3(lx, ly, lz).distanceTo(target);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(dist * 0.30, dist, 12, 1, true), coneMat);
    const mid = new THREE.Vector3(lx, ly, lz).add(target).multiplyScalar(0.5);
    cone.position.copy(mid);
    cone.lookAt(target);
    cone.rotateX(-Math.PI / 2);
    floodGroup.add(cone);
    const lampGlow = new THREE.Mesh(new THREE.SphereGeometry(1.6, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfff6e0, transparent: true, opacity: st.night ? 0.30 : 0.10, blending: THREE.AdditiveBlending, depthWrite: false }));
    lampGlow.position.set(lx, ly, lz);
    floodGroup.add(lampGlow);
  });
  root.add(floodGroup);

  // ---- dugouts + tunnel ----
  const dugMat = new THREE.MeshStandardMaterial({ color: 0x14181f, roughness: 0.5, metalness: 0.2 });
  const dugGlass = new THREE.MeshStandardMaterial({ color: 0x0a1420, roughness: 0.08, metalness: 0.3, transparent: true, opacity: 0.55 });
  for (const s of [-1, 1]) {
    const d = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(11, 1.1, 2.4), dugMat);
    base.position.set(s * 15, 0.55, FIELD.halfW + 3.0); d.add(base);
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(11.4, 0.16, 3.0), dugGlass);
    canopy.position.set(s * 15, 2.15, FIELD.halfW + 3.0); canopy.rotation.x = -0.12; d.add(canopy);
    const backW = new THREE.Mesh(new THREE.BoxGeometry(11.4, 2.2, 0.14), dugGlass);
    backW.position.set(s * 15, 1.1, FIELD.halfW + 4.3); d.add(backW);
    root.add(d);
  }
  const tunnel = new THREE.Mesh(new THREE.BoxGeometry(6, 3.2, 4), concMat);
  tunnel.position.set(0, 1.6, FIELD.halfW + 5.6);
  root.add(tunnel);

  return {
    root, pitch, goals, crowd, flashes, adTex, sky: null,
    update(dt, time, excitement) {
      crowd.userData.mat.uniforms.uTime.value = time;
      crowd.userData.mat.uniforms.uWave.value += (excitement - crowd.userData.mat.uniforms.uWave.value) * Math.min(1, dt * 2.2);
      flashMat.uniforms.uTime.value = time;
      flashMat.uniforms.uRate.value = (st.night ? 0.55 : 0.18) + excitement * 0.5;
      adTex.offset.x = (adTex.offset.x + dt * 0.035) % 1;
    },
    dispose() {
      root.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          const ms = Array.isArray(o.material) ? o.material : [o.material];
          ms.forEach(m => { if (m.map) m.map.dispose(); m.dispose(); });
        }
      });
      scene.remove(root);
    },
  };
}
