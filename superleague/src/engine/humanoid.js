// ============================================================================
//  Procedural skinned humanoid — anatomical proportions, kit atlas UVs,
//  auto skin-weighting, facial features, hair variants.
//  One draw call per player. ~2.9k triangles.
// ============================================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const BONE = {
  hips: 0, spine: 1, chest: 2, neck: 3, head: 4,
  clavL: 5, armL: 6, foreL: 7, handL: 8,
  clavR: 9, armR: 10, foreR: 11, handR: 12,
  thighL: 13, shinL: 14, footL: 15,
  thighR: 16, shinR: 17, footR: 18,
};
export const NBONES = 19;

// rest-pose world positions (metres, y-up, facing +Z)
const REST = [
  [0, 0.955, 0],        // hips
  [0, 1.100, 0],        // spine
  [0, 1.300, 0],        // chest
  [0, 1.495, 0],        // neck
  [0, 1.600, 0],        // head
  [0.050, 1.440, 0],    // clavL
  [0.185, 1.435, 0],    // armL
  [0.295, 1.175, 0],    // foreL
  [0.362, 0.955, 0],    // handL
  [-0.050, 1.440, 0],   // clavR
  [-0.185, 1.435, 0],   // armR
  [-0.295, 1.175, 0],   // foreR
  [-0.362, 0.955, 0],   // handR
  [0.098, 0.925, 0],    // thighL
  [0.104, 0.505, 0.005],// shinL
  [0.108, 0.105, -0.010],// footL
  [-0.098, 0.925, 0],   // thighR
  [-0.104, 0.505, 0.005],// shinR
  [-0.108, 0.105, -0.010],// footR
];
const PARENT = [-1, 0, 1, 2, 3, 2, 5, 6, 7, 2, 9, 10, 11, 0, 13, 14, 0, 16, 17];

// ---- UV atlas bands (v ranges) -------------------------------------------
export const UV_BAND = {
  white: [0.000, 0.035],
  socks: [0.045, 0.255],
  shorts: [0.265, 0.495],
  shirt: [0.505, 0.995],
};
export const NUM_RECT = [0.395, 0.655, 0.605, 0.905]; // u0,v0,u1,v1 on shirt band

const V3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);

// ---------------------------------------------------------------------------
// geometry accumulator
// ---------------------------------------------------------------------------
class Mesh {
  constructor() { this.pos = []; this.uv = []; this.col = []; this.mat = []; this.si = []; this.sw = []; this.idx = []; }
  get n() { return this.pos.length / 3; }
  vert(p, u, v, c, rough, bones, weights) {
    this.pos.push(p.x, p.y, p.z);
    this.uv.push(u, v);
    this.col.push(c[0], c[1], c[2]);
    this.mat.push(rough);
    for (let i = 0; i < 4; i++) { this.si.push(bones[i] || 0); this.sw.push(weights[i] || 0); }
    return this.n - 1;
  }
  tri(a, b, c) { this.idx.push(a, b, c); }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aRough', new THREE.Float32BufferAttribute(this.mat, 1));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.sw, 4));
    g.setIndex(this.idx);
    return g;
  }
}

const WHITE = [1, 1, 1];
function lin(hex, mul = 1) {
  // sRGB hex -> linear rgb (three works in linear when vertexColors used with SRGBColorSpace output)
  const c = new THREE.Color(hex);
  c.convertSRGBToLinear();
  return [c.r * mul, c.g * mul, c.b * mul];
}

// blend weights along a chain: given a list of {bone, at} sorted by parameter t
function chainWeights(t, stops) {
  // returns [bones[4], weights[4]]
  let i = 0;
  while (i < stops.length - 1 && t > stops[i + 1].at) i++;
  const a = stops[i], b = stops[Math.min(i + 1, stops.length - 1)];
  if (a === b || b.at === a.at) return [[a.bone, 0, 0, 0], [1, 0, 0, 0]];
  let f = (t - a.at) / (b.at - a.at);
  f = Math.max(0, Math.min(1, f));
  f = f * f * (3 - 2 * f); // smoothstep for organic deformation
  return [[a.bone, b.bone, 0, 0], [1 - f, f, 0, 0]];
}

// ---------------------------------------------------------------------------
// tube builder: rings along a path, elliptical cross-section
//   rings: [{ p:[x,y,z], rx, rz, t, shape?(a)->mul, uv:[u,v] or fn(s)->[u,v], col, rough }]
//   stops: skin-weight chain over ring.t
// ---------------------------------------------------------------------------
function tube(mesh, rings, seg, stops, opts = {}) {
  const N = rings.length;
  const base = mesh.n;
  const tan = [];
  for (let i = 0; i < N; i++) {
    const prev = V3(rings[Math.max(0, i - 1)].p), next = V3(rings[Math.min(N - 1, i + 1)].p);
    const t = next.clone().sub(prev);
    if (t.lengthSq() < 1e-9) t.set(0, 1, 0);
    tan.push(t.normalize());
  }
  for (let i = 0; i < N; i++) {
    const r = rings[i];
    const T = tan[i];
    const H = Math.abs(T.z) > 0.92 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
    const R = new THREE.Vector3().crossVectors(H, T).normalize();
    const U = new THREE.Vector3().crossVectors(T, R).normalize();
    const C = V3(r.p);
    const [bones, w] = chainWeights(r.t, stops);
    for (let j = 0; j <= seg; j++) {
      const s = j / seg;
      const a = Math.PI / 2 + s * Math.PI * 2;
      const sh = r.shape ? r.shape(a, s) : 1;
      const shz = r.shapeZ ? r.shapeZ(a, s) : 1;
      const px = Math.cos(a) * r.rx * sh, pz = Math.sin(a) * r.rz * sh * shz;
      const p = C.clone().addScaledVector(R, px).addScaledVector(U, pz);
      let uv = r.uv;
      if (typeof uv === 'function') uv = uv(s);
      const col = r.colFn ? r.colFn(s, a) : (r.col || WHITE);
      mesh.vert(p, uv[0], uv[1], col, r.rough ?? 0.75, bones, w);
    }
  }
  const stride = seg + 1;
  for (let i = 0; i < N - 1; i++) {
    for (let j = 0; j < seg; j++) {
      const a = base + i * stride + j, b = a + 1, c = a + stride, d = c + 1;
      mesh.tri(a, c, b); mesh.tri(b, c, d);
    }
  }
  if (opts.capStart) capFan(mesh, rings[0], base, seg, true, stops);
  if (opts.capEnd) capFan(mesh, rings[N - 1], base + (N - 1) * stride, seg, false, stops);
  return mesh;
}

function capFan(mesh, ring, ringBase, seg, flip, stops) {
  const [bones, w] = chainWeights(ring.t, stops);
  const c = mesh.vert(V3(ring.p), 0.5, UV_BAND.white[0] + 0.015, ring.col || WHITE, ring.rough ?? 0.75, bones, w);
  for (let j = 0; j < seg; j++) {
    const a = ringBase + j, b = a + 1;
    if (flip) mesh.tri(c, b, a); else mesh.tri(c, a, b);
  }
}

// small ellipsoid blob (eyes, ears, hair puffs) fully weighted to one bone
function blob(mesh, cx, cy, cz, rx, ry, rz, col, rough, bone, seg = 8, rings = 6) {
  const base = mesh.n;
  const [bones, w] = [[bone, 0, 0, 0], [1, 0, 0, 0]];
  for (let i = 0; i <= rings; i++) {
    const phi = (i / rings) * Math.PI;
    const y = Math.cos(phi) * ry, r = Math.sin(phi);
    for (let j = 0; j <= seg; j++) {
      const th = (j / seg) * Math.PI * 2;
      const p = new THREE.Vector3(cx + Math.cos(th) * rx * r, cy + y, cz + Math.sin(th) * rz * r);
      mesh.vert(p, 0.5, UV_BAND.white[0] + 0.015, col, rough, bones, w);
    }
  }
  const stride = seg + 1;
  for (let i = 0; i < rings; i++) for (let j = 0; j < seg; j++) {
    const a = base + i * stride + j, b = a + 1, c = a + stride, d = c + 1;
    if (i > 0) mesh.tri(a, c, b);
    if (i < rings - 1) mesh.tri(b, c, d);
  }
  return mesh;
}

function boxPart(mesh, cx, cy, cz, sx, sy, sz, col, rough, bone, rot) {
  const g = new THREE.BoxGeometry(sx, sy, sz);
  if (rot) g.rotateX(rot);
  g.translate(cx, cy, cz);
  const p = g.attributes.position, n = g.attributes.normal;
  const base = mesh.n;
  const [bones, w] = [[bone, 0, 0, 0], [1, 0, 0, 0]];
  for (let i = 0; i < p.count; i++) {
    mesh.vert(new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i)), 0.5, UV_BAND.white[0] + 0.015, col, rough, bones, w);
  }
  const idx = g.index.array;
  for (let i = 0; i < idx.length; i += 3) mesh.tri(base + idx[i], base + idx[i + 1], base + idx[i + 2]);
  g.dispose();
  void n;
  return mesh;
}

// v mapper helper inside a band
const bandV = (band, f) => band[0] + (band[1] - band[0]) * f;
const whiteUV = [0.5, UV_BAND.white[0] + 0.015];

// ---------------------------------------------------------------------------
// BODY
// ---------------------------------------------------------------------------
function buildBody(o) {
  const m = new Mesh();
  const skin = lin(o.skin), skinD = lin(o.skin, 0.82);
  const boot = lin(o.boot), bootD = lin(o.boot, 0.45);
  const glove = lin(o.glove);
  const SEG = 16;

  // ---- torso (shirt) ----
  const torso = [
    { p: [0, 0.955, 0], rx: 0.181, rz: 0.128, t: 0.00, uv: (s) => [s, bandV(UV_BAND.shirt, 0.02)] },
    { p: [0, 1.000, 0], rx: 0.178, rz: 0.126, t: 0.08, uv: (s) => [s, bandV(UV_BAND.shirt, 0.10)] },
    { p: [0, 1.060, 0], rx: 0.166, rz: 0.117, t: 0.20, uv: (s) => [s, bandV(UV_BAND.shirt, 0.22)] },
    { p: [0, 1.120, 0], rx: 0.152, rz: 0.108, t: 0.32, uv: (s) => [s, bandV(UV_BAND.shirt, 0.35)] },
    { p: [0, 1.200, 0], rx: 0.166, rz: 0.115, t: 0.48, uv: (s) => [s, bandV(UV_BAND.shirt, 0.51)] },
    { p: [0, 1.290, 0], rx: 0.191, rz: 0.126, t: 0.64, uv: (s) => [s, bandV(UV_BAND.shirt, 0.69)] },
    { p: [0, 1.370, 0], rx: 0.205, rz: 0.124, t: 0.78, uv: (s) => [s, bandV(UV_BAND.shirt, 0.85)] },
    { p: [0, 1.440, 0], rx: 0.196, rz: 0.115, t: 0.88, uv: (s) => [s, bandV(UV_BAND.shirt, 0.95)] },
    { p: [0, 1.492, 0], rx: 0.098, rz: 0.086, t: 0.95, uv: () => whiteUV, col: skinD },
    { p: [0, 1.545, 0], rx: 0.058, rz: 0.058, t: 1.00, uv: () => whiteUV, col: skinD },
  ];
  torso.forEach(r => { if (!r.col) r.col = WHITE; r.rough = r.col === WHITE ? 0.86 : 0.58; });
  tube(m, torso, SEG, [
    { bone: BONE.hips, at: 0 }, { bone: BONE.spine, at: 0.30 },
    { bone: BONE.chest, at: 0.70 }, { bone: BONE.neck, at: 0.97 },
  ], { capStart: true });

  // ---- pelvis / shorts ----
  const shorts = [
    { p: [0, 0.845, 0], rx: 0.176, rz: 0.128, t: 0.0, uv: (s) => [s, bandV(UV_BAND.shorts, 0.05)], col: WHITE, rough: 0.85 },
    { p: [0, 0.900, 0], rx: 0.180, rz: 0.130, t: 0.35, uv: (s) => [s, bandV(UV_BAND.shorts, 0.35)], col: WHITE, rough: 0.85 },
    { p: [0, 0.960, 0], rx: 0.176, rz: 0.126, t: 0.7, uv: (s) => [s, bandV(UV_BAND.shorts, 0.70)], col: WHITE, rough: 0.85 },
    { p: [0, 1.015, 0], rx: 0.166, rz: 0.118, t: 1.0, uv: (s) => [s, bandV(UV_BAND.shorts, 0.97)], col: WHITE, rough: 0.85 },
  ];
  tube(m, shorts, SEG, [{ bone: BONE.hips, at: 0 }, { bone: BONE.spine, at: 1.2 }], {});

  for (const side of [1, -1]) {
    const L = side > 0;
    const TH = L ? BONE.thighL : BONE.thighR, SH = L ? BONE.shinL : BONE.shinR, FT = L ? BONE.footL : BONE.footR;
    const UA = L ? BONE.armL : BONE.armR, FA = L ? BONE.foreL : BONE.foreR, HA = L ? BONE.handL : BONE.handR;
    const CL = L ? BONE.clavL : BONE.clavR;
    const x = side;

    // short leg
    tube(m, [
      { p: [x * 0.098, 0.700, 0], rx: 0.113, rz: 0.115, t: 1.0, uv: (s) => [s, bandV(UV_BAND.shorts, 0.03)], col: WHITE, rough: 0.85 },
      { p: [x * 0.098, 0.790, 0], rx: 0.122, rz: 0.122, t: 0.6, uv: (s) => [s, bandV(UV_BAND.shorts, 0.35)], col: WHITE, rough: 0.85 },
      { p: [x * 0.096, 0.880, 0], rx: 0.124, rz: 0.124, t: 0.2, uv: (s) => [s, bandV(UV_BAND.shorts, 0.75)], col: WHITE, rough: 0.85 },
      { p: [x * 0.094, 0.930, 0], rx: 0.118, rz: 0.118, t: 0.0, uv: (s) => [s, bandV(UV_BAND.shorts, 0.95)], col: WHITE, rough: 0.85 },
    ], 12, [{ bone: BONE.hips, at: 0 }, { bone: TH, at: 0.85 }], {});

    // leg: thigh -> calf -> ankle
    const leg = [
      { p: [x * 0.098, 0.930, 0], rx: 0.101, rz: 0.104, t: 0.00, uv: () => whiteUV, col: skin, rough: 0.56 },
      { p: [x * 0.100, 0.820, 0.004], rx: 0.098, rz: 0.101, t: 0.14, uv: () => whiteUV, col: skin, rough: 0.56 },
      { p: [x * 0.102, 0.700, 0.006], rx: 0.086, rz: 0.090, t: 0.30, uv: () => whiteUV, col: skin, rough: 0.56 },
      { p: [x * 0.104, 0.560, 0.008], rx: 0.073, rz: 0.076, t: 0.46, uv: () => whiteUV, col: skin, rough: 0.56 },
      { p: [x * 0.104, 0.505, 0.005], rx: 0.070, rz: 0.073, t: 0.52, uv: (s) => [s, bandV(UV_BAND.socks, 0.97)], col: WHITE, rough: 0.88 },
      { p: [x * 0.104, 0.420, 0.000], rx: 0.076, rz: 0.081, t: 0.62, uv: (s) => [s, bandV(UV_BAND.socks, 0.80)], col: WHITE, rough: 0.88 },
      { p: [x * 0.106, 0.300, -0.006], rx: 0.062, rz: 0.066, t: 0.78, uv: (s) => [s, bandV(UV_BAND.socks, 0.45)], col: WHITE, rough: 0.88 },
      { p: [x * 0.108, 0.150, -0.010], rx: 0.046, rz: 0.048, t: 0.94, uv: (s) => [s, bandV(UV_BAND.socks, 0.10)], col: WHITE, rough: 0.88 },
      { p: [x * 0.108, 0.105, -0.010], rx: 0.044, rz: 0.046, t: 1.00, uv: (s) => [s, bandV(UV_BAND.socks, 0.02)], col: WHITE, rough: 0.88 },
    ];
    tube(m, leg, 12, [
      { bone: BONE.hips, at: 0 }, { bone: TH, at: 0.16 },
      { bone: SH, at: 0.52 }, { bone: FT, at: 0.99 },
    ], {});

    // boot
    tube(m, [
      { p: [x * 0.108, 0.130, -0.055], rx: 0.043, rz: 0.038, t: 0.0, uv: () => whiteUV, col: boot, rough: 0.34 },
      { p: [x * 0.108, 0.075, -0.040], rx: 0.050, rz: 0.055, t: 0.2, uv: () => whiteUV, col: boot, rough: 0.34 },
      { p: [x * 0.108, 0.045, 0.010], rx: 0.052, rz: 0.048, t: 0.5, uv: () => whiteUV, col: boot, rough: 0.34 },
      { p: [x * 0.107, 0.038, 0.085], rx: 0.048, rz: 0.036, t: 0.8, uv: () => whiteUV, col: boot, rough: 0.34 },
      { p: [x * 0.106, 0.036, 0.150], rx: 0.033, rz: 0.024, t: 1.0, uv: () => whiteUV, col: boot, rough: 0.34 },
    ], 10, [{ bone: FT, at: 0 }, { bone: FT, at: 1 }], { capStart: true, capEnd: true });
    // sole
    tube(m, [
      { p: [x * 0.108, 0.030, -0.045], rx: 0.048, rz: 0.014, t: 0, uv: () => whiteUV, col: bootD, rough: 0.5 },
      { p: [x * 0.107, 0.022, 0.030], rx: 0.050, rz: 0.012, t: 0.5, uv: () => whiteUV, col: bootD, rough: 0.5 },
      { p: [x * 0.106, 0.024, 0.140], rx: 0.032, rz: 0.010, t: 1, uv: () => whiteUV, col: bootD, rough: 0.5 },
    ], 8, [{ bone: FT, at: 0 }, { bone: FT, at: 1 }], { capStart: true, capEnd: true });

    // arm
    tube(m, [
      { p: [x * 0.180, 1.442, 0], rx: 0.064, rz: 0.064, t: 0.00, uv: () => whiteUV, col: skin, rough: 0.56 },
      { p: [x * 0.222, 1.360, 0], rx: 0.058, rz: 0.058, t: 0.16, uv: () => whiteUV, col: skin, rough: 0.56 },
      { p: [x * 0.262, 1.265, 0], rx: 0.052, rz: 0.052, t: 0.34, uv: () => whiteUV, col: skin, rough: 0.56 },
      { p: [x * 0.295, 1.175, 0], rx: 0.046, rz: 0.046, t: 0.50, uv: () => whiteUV, col: skin, rough: 0.56 },
      { p: [x * 0.322, 1.080, 0.004], rx: 0.049, rz: 0.049, t: 0.66, uv: () => whiteUV, col: skin, rough: 0.56 },
      { p: [x * 0.348, 0.995, 0.006], rx: 0.038, rz: 0.038, t: 0.86, uv: () => whiteUV, col: skin, rough: 0.56 },
      { p: [x * 0.362, 0.955, 0.006], rx: 0.034, rz: 0.032, t: 1.00, uv: () => whiteUV, col: skin, rough: 0.56 },
    ], 10, [
      { bone: CL, at: 0 }, { bone: UA, at: 0.10 }, { bone: FA, at: 0.50 }, { bone: HA, at: 0.95 },
    ], { capStart: true });

    // sleeve over upper arm
    tube(m, [
      { p: [x * 0.268, 1.245, 0], rx: 0.070, rz: 0.070, t: 1.0, uv: (s) => [s, bandV(UV_BAND.shirt, 0.80)], col: WHITE, rough: 0.86 },
      { p: [x * 0.240, 1.320, 0], rx: 0.077, rz: 0.077, t: 0.55, uv: (s) => [s, bandV(UV_BAND.shirt, 0.88)], col: WHITE, rough: 0.86 },
      { p: [x * 0.196, 1.412, 0], rx: 0.084, rz: 0.084, t: 0.15, uv: (s) => [s, bandV(UV_BAND.shirt, 0.96)], col: WHITE, rough: 0.86 },
      { p: [x * 0.150, 1.452, 0], rx: 0.070, rz: 0.082, t: 0.0, uv: (s) => [s, bandV(UV_BAND.shirt, 0.99)], col: WHITE, rough: 0.86 },
    ], 10, [{ bone: BONE.chest, at: 0 }, { bone: UA, at: 0.72 }], {});

    // hand / glove
    const hc = o.isGK ? glove : skin;
    blob(m, x * 0.377, 0.905, 0.008, 0.036, 0.055, 0.024, hc, o.isGK ? 0.6 : 0.56, HA, 8, 5);
  }

  // ---- head ----
  const headRings = [
    { p: [0, 1.552, 0.000], rx: 0.055, rz: 0.056, t: 0.0 },
    { p: [0, 1.590, 0.004], rx: 0.066, rz: 0.072, t: 0.15, shapeZ: (a) => 1 + 0.16 * Math.max(0, Math.sin(a)) },
    { p: [0, 1.630, 0.004], rx: 0.079, rz: 0.086, t: 0.35, shapeZ: (a) => 1 + 0.13 * Math.max(0, Math.sin(a)) },
    { p: [0, 1.672, 0.002], rx: 0.086, rz: 0.093, t: 0.55, shapeZ: (a) => 1 + 0.05 * Math.max(0, Math.sin(a)) },
    { p: [0, 1.715, 0.000], rx: 0.087, rz: 0.094, t: 0.72 },
    { p: [0, 1.760, -0.002], rx: 0.079, rz: 0.086, t: 0.86 },
    { p: [0, 1.795, -0.004], rx: 0.056, rz: 0.062, t: 0.95 },
    { p: [0, 1.818, -0.004], rx: 0.022, rz: 0.026, t: 1.0 },
  ];
  headRings.forEach(r => { r.uv = () => whiteUV; r.col = skin; r.rough = 0.55; });
  tube(m, headRings, 16, [{ bone: BONE.neck, at: 0 }, { bone: BONE.head, at: 0.28 }], { capEnd: true });

  // face
  const dark = lin(0x1a1210), lip = lin(o.skin, 0.62), eyeW = lin(0xf2f0ee), iris = lin(o.eye || 0x3a2a1c);
  blob(m, 0, 1.664, 0.094, 0.014, 0.020, 0.020, skin, 0.55, BONE.head, 6, 4);       // nose
  boxPart(m, 0, 1.700, 0.081, 0.070, 0.010, 0.020, skin, 0.55, BONE.head);            // brow
  for (const s of [1, -1]) {
    blob(m, s * 0.032, 1.681, 0.076, 0.0145, 0.011, 0.010, eyeW, 0.28, BONE.head, 6, 4);
    blob(m, s * 0.033, 1.680, 0.084, 0.0072, 0.0072, 0.006, iris, 0.22, BONE.head, 6, 4);
    boxPart(m, s * 0.033, 1.699, 0.082, 0.026, 0.0055, 0.012, dark, 0.7, BONE.head);   // eyebrow
    blob(m, s * 0.086, 1.672, 0.004, 0.010, 0.022, 0.016, skin, 0.55, BONE.head, 6, 4); // ear
  }
  boxPart(m, 0, 1.628, 0.086, 0.026, 0.0055, 0.010, lip, 0.5, BONE.head);             // mouth

  return m.geometry();
}

// ---------------------------------------------------------------------------
// HAIR — variants weighted to head bone
// ---------------------------------------------------------------------------
function buildHair(style, colorHex) {
  const m = new Mesh();
  const c = lin(colorHex), cd = lin(colorHex, 0.75);
  if (style === 5) return m.geometry(); // bald
  const R = 1.055;
  const capRings = (from, to, mul, noise = 0) => {
    const rings = [];
    const steps = 6;
    for (let i = 0; i <= steps; i++) {
      const f = i / steps;
      const y = from + (to - from) * f;
      // skull radius at height y (approx ellipse)
      const t = Math.max(0, Math.min(1, (y - 1.60) / 0.222));
      const rr = Math.sqrt(Math.max(0.02, 1 - Math.pow((t - 0.42) / 0.72, 2)));
      const rx = 0.090 * rr * mul, rz = 0.098 * rr * mul;
      rings.push({
        p: [0, y, -0.004], rx, rz, t: f, uv: () => whiteUV, col: c, rough: 0.72,
        shape: noise ? (a) => 1 + noise * (Math.sin(a * 7 + y * 40) * 0.5 + Math.sin(a * 11 - y * 25) * 0.5) : undefined,
      });
    }
    return rings;
  };
  const stops = [{ bone: BONE.head, at: 0 }, { bone: BONE.head, at: 1 }];
  switch (style) {
    case 0: // crop
      tube(m, capRings(1.665, 1.826, R * 1.02), 14, stops, { capEnd: true }); break;
    case 1: // fade
      tube(m, capRings(1.712, 1.826, R * 1.0), 14, stops, { capEnd: true }); break;
    case 2: // curls
      tube(m, capRings(1.660, 1.834, R * 1.09, 0.075), 16, stops, { capEnd: true }); break;
    case 3: // afro
      blob(m, 0, 1.752, -0.006, 0.118, 0.112, 0.120, c, 0.8, BONE.head, 14, 9); break;
    case 4: // long
      tube(m, capRings(1.655, 1.826, R * 1.05), 14, stops, { capEnd: true });
      tube(m, [
        { p: [0, 1.700, -0.070], rx: 0.082, rz: 0.040, t: 0, uv: () => whiteUV, col: c, rough: 0.72 },
        { p: [0, 1.620, -0.078], rx: 0.076, rz: 0.038, t: 0.5, uv: () => whiteUV, col: c, rough: 0.72 },
        { p: [0, 1.545, -0.070], rx: 0.060, rz: 0.032, t: 1, uv: () => whiteUV, col: cd, rough: 0.72 },
      ], 10, stops, { capEnd: true });
      break;
    case 6: // bun
      tube(m, capRings(1.690, 1.826, R * 1.0), 14, stops, { capEnd: true });
      blob(m, 0, 1.800, -0.086, 0.042, 0.040, 0.040, c, 0.75, BONE.head, 8, 6); break;
    case 7: // mohawk
      tube(m, [
        { p: [0, 1.700, 0.060], rx: 0.016, rz: 0.030, t: 0, uv: () => whiteUV, col: c, rough: 0.7 },
        { p: [0, 1.790, 0.020], rx: 0.018, rz: 0.045, t: 0.4, uv: () => whiteUV, col: c, rough: 0.7 },
        { p: [0, 1.800, -0.040], rx: 0.017, rz: 0.042, t: 0.7, uv: () => whiteUV, col: c, rough: 0.7 },
        { p: [0, 1.740, -0.080], rx: 0.014, rz: 0.026, t: 1, uv: () => whiteUV, col: c, rough: 0.7 },
      ], 8, stops, { capStart: true, capEnd: true });
      tube(m, capRings(1.735, 1.822, R * 0.99), 12, stops, { capEnd: true });
      break;
    default:
      tube(m, capRings(1.670, 1.826, R * 1.02), 14, stops, { capEnd: true });
  }
  return m.geometry();
}

// ---------------------------------------------------------------------------
// normal smoothing across duplicated seam vertices
// ---------------------------------------------------------------------------
function smoothNormals(g) {
  g.computeVertexNormals();
  const p = g.attributes.position.array, n = g.attributes.normal.array;
  const map = new Map();
  for (let i = 0; i < p.length; i += 3) {
    const k = `${Math.round(p[i] * 3000)},${Math.round(p[i + 1] * 3000)},${Math.round(p[i + 2] * 3000)}`;
    let e = map.get(k);
    if (!e) { e = []; map.set(k, e); }
    e.push(i);
  }
  for (const e of map.values()) {
    if (e.length < 2) continue;
    let x = 0, y = 0, z = 0;
    for (const i of e) { x += n[i]; y += n[i + 1]; z += n[i + 2]; }
    const l = Math.hypot(x, y, z) || 1;
    x /= l; y /= l; z /= l;
    for (const i of e) { n[i] = x; n[i + 1] = y; n[i + 2] = z; }
  }
  g.attributes.normal.needsUpdate = true;
  return g;
}

const hairCache = new Map();
let bodyCache = new Map();

export function buildPlayerGeometry(o) {
  const bkey = `${o.skin}|${o.boot}|${o.glove}|${o.eye}|${o.isGK}`;
  let body = bodyCache.get(bkey);
  if (!body) { body = buildBody(o); bodyCache.set(bkey, body); }
  const hkey = `${o.hairStyle}|${o.hairColor}`;
  let hair = hairCache.get(hkey);
  if (!hair) { hair = buildHair(o.hairStyle, o.hairColor); hairCache.set(hkey, hair); }
  const parts = hair.attributes.position.count ? [body, hair] : [body];
  const g = parts.length > 1 ? mergeGeometries(parts, false) : body.clone();
  smoothNormals(g);
  g.computeBoundingSphere();
  g.boundingSphere.radius = 1.6;
  g.boundingSphere.center.set(0, 1, 0);
  return g;
}

export function clearGeometryCache() { bodyCache.clear(); hairCache.clear(); }

// ---------------------------------------------------------------------------
// skeleton
// ---------------------------------------------------------------------------
export function makeSkeleton() {
  const bones = [];
  for (let i = 0; i < NBONES; i++) {
    const b = new THREE.Bone();
    b.name = Object.keys(BONE)[i];
    const par = PARENT[i];
    const w = REST[i], pw = par >= 0 ? REST[par] : [0, 0, 0];
    b.position.set(w[0] - pw[0], w[1] - pw[1], w[2] - pw[2]);
    bones.push(b);
    if (par >= 0) bones[par].add(b);
  }
  const sk = new THREE.Skeleton(bones);
  return { bones, skeleton: sk, root: bones[0] };
}

export const REST_POS = REST;
