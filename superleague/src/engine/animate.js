// ============================================================================
//  Procedural skeletal animation: gait, idle, jockey, kicks, slides, dives,
//  headers, celebrations.  No external animation assets.
// ============================================================================
import { BONE } from './humanoid.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);

// keyframe table for one leg over a gait cycle
// [phase, thighSwing(+fwd), kneeFlex, ankle(+plantar)]
const GAIT = [
  [0.00, 0.55, 0.22, -0.10],
  [0.12, 0.32, 0.34, 0.00],
  [0.25, 0.05, 0.30, 0.06],
  [0.40, -0.26, 0.34, 0.16],
  [0.50, -0.46, 0.55, 0.48],
  [0.62, -0.18, 1.32, 0.22],
  [0.75, 0.26, 1.42, -0.06],
  [0.88, 0.60, 0.72, -0.16],
  [1.00, 0.55, 0.22, -0.10],
];
function gait(ph) {
  ph = ph - Math.floor(ph);
  let i = 0;
  while (i < GAIT.length - 2 && ph > GAIT[i + 1][0]) i++;
  const a = GAIT[i], b = GAIT[i + 1];
  const t = smooth((ph - a[0]) / (b[0] - a[0] || 1));
  return [lerp(a[1], b[1], t), lerp(a[2], b[2], t), lerp(a[3], b[3], t)];
}

function resetBones(bones) {
  for (let i = 0; i < bones.length; i++) bones[i].rotation.set(0, 0, 0);
}
function put(b, x, y, z) { b.rotation.set(x, y, z); }
function blend(b, x, y, z, w) {
  b.rotation.x += (x - b.rotation.x) * w;
  b.rotation.y += (y - b.rotation.y) * w;
  b.rotation.z += (z - b.rotation.z) * w;
}

// envelope: 0 -> 1 -> 0 over normalised action time with a hold plateau
function env(t, rise = 0.22, fall = 0.30) {
  if (t < rise) return smooth(t / rise);
  if (t > 1 - fall) return smooth((1 - t) / fall);
  return 1;
}

const HIP_Y = 0.955;

export function posePlayer(bones, p, dt, clock) {
  resetBones(bones);
  const b = bones;
  const spd = p.speed || 0;
  const sn = clamp(spd / 7.6, 0, 1.25);            // sprint normalisation
  const moving = spd > 0.35;
  const ph = p.runPhase || 0;
  const st = p.animState || 'idle';

  // ---------------------------------------------------------------- locomotion
  let crouch = 0, lean = 0.05 + 0.24 * sn, hipBob = 0, hipX = 0, pelvisY = 0, pelvisZ = 0;

  if (moving) {
    const [tl, kl, al] = gait(ph);
    const [tr, kr, ar] = gait(ph + 0.5);
    const amp = 0.42 + 0.62 * sn;
    const kamp = 0.40 + 0.62 * sn;
    put(b[BONE.thighL], -tl * amp, 0, 0.03);
    put(b[BONE.shinL], kl * kamp, 0, 0);
    put(b[BONE.footL], al * 0.7 - tl * amp * 0.25, 0, 0);
    put(b[BONE.thighR], -tr * amp, 0, -0.03);
    put(b[BONE.shinR], kr * kamp, 0, 0);
    put(b[BONE.footR], ar * 0.7 - tr * amp * 0.25, 0, 0);

    hipBob = (0.030 * Math.sin(ph * TAU * 2 + 0.7) - 0.020) * (0.4 + sn);
    hipX = 0.018 * Math.sin(ph * TAU) * (0.4 + sn);
    pelvisY = 0.13 * Math.sin(ph * TAU) * (0.3 + sn);
    pelvisZ = 0.055 * Math.sin(ph * TAU + 1.2) * sn;
    crouch = 0.012 + 0.030 * sn;

    // arms counter-swing
    const aA = (0.30 + 0.62 * sn);
    const sw = Math.sin(ph * TAU);
    const elbow = -(0.45 + 0.95 * sn);
    put(b[BONE.armL], sw * aA, 0, 0.10 + 0.06 * sn);
    put(b[BONE.foreL], elbow - 0.25 * Math.max(0, -sw), 0, 0);
    put(b[BONE.armR], -sw * aA, 0, -0.10 - 0.06 * sn);
    put(b[BONE.foreR], elbow - 0.25 * Math.max(0, sw), 0, 0);
    put(b[BONE.clavL], 0, -0.10 * sw, 0);
    put(b[BONE.clavR], 0, 0.10 * sw, 0);
    put(b[BONE.chest], lean * 0.45, -0.17 * Math.sin(ph * TAU) * (0.3 + sn), 0);
    put(b[BONE.spine], lean * 0.55, 0.06 * Math.sin(ph * TAU), 0);
  } else {
    // idle / ready stance
    const br = Math.sin(clock * 1.7 + (p.seed || 0)) * 0.018;
    const sway = Math.sin(clock * 0.8 + (p.seed || 0) * 2) * 0.03;
    put(b[BONE.thighL], -0.06, 0, 0.055);
    put(b[BONE.shinL], 0.14, 0, 0);
    put(b[BONE.footL], -0.06, 0, 0);
    put(b[BONE.thighR], -0.06, 0, -0.055);
    put(b[BONE.shinR], 0.14, 0, 0);
    put(b[BONE.footR], -0.06, 0, 0);
    put(b[BONE.armL], 0.04, 0, 0.17 + br);
    put(b[BONE.foreL], -0.30, 0, 0);
    put(b[BONE.armR], 0.04, 0, -0.17 - br);
    put(b[BONE.foreR], -0.30, 0, 0);
    put(b[BONE.spine], 0.03 + br, sway * 0.4, 0);
    put(b[BONE.chest], 0.02, sway * 0.5, 0);
    hipBob = br * 0.35 - 0.012;
    hipX = sway * 0.25;
    crouch = 0.012;
  }

  if (st === 'jockey') {
    const w = 0.85;
    const shuffle = Math.sin(ph * TAU);
    blend(b[BONE.thighL], -0.22, 0, 0.30, w);
    blend(b[BONE.shinL], 0.62, 0, 0, w);
    blend(b[BONE.thighR], -0.22, 0, -0.30, w);
    blend(b[BONE.shinR], 0.62, 0, 0, w);
    blend(b[BONE.armL], -0.15, 0, 0.62 + 0.1 * shuffle, w);
    blend(b[BONE.armR], -0.15, 0, -0.62 + 0.1 * shuffle, w);
    blend(b[BONE.foreL], -0.75, 0, 0, w);
    blend(b[BONE.foreR], -0.75, 0, 0, w);
    blend(b[BONE.spine], 0.16, 0, 0, w);
    crouch += 0.075;
    lean += 0.08;
  }

  // ---------------------------------------------------------------- actions
  const a = p.action;
  if (a && a.t < a.dur) {
    const t = a.t / a.dur;
    const side = a.foot === 'L' ? 1 : -1;
    const TH = side > 0 ? BONE.thighL : BONE.thighR;
    const SH = side > 0 ? BONE.shinL : BONE.shinR;
    const FT = side > 0 ? BONE.footL : BONE.footR;
    const PTH = side > 0 ? BONE.thighR : BONE.thighL;
    const PSH = side > 0 ? BONE.shinR : BONE.shinL;

    if (a.type === 'kick' || a.type === 'pass' || a.type === 'cross' || a.type === 'clear') {
      const power = a.type === 'pass' ? 0.62 : a.type === 'clear' ? 1.1 : 1.0;
      const w = env(t, 0.16, 0.34);
      // keyframed swing
      let sw, kn, ak;
      if (t < 0.34) { const u = t / 0.34; sw = lerp(0.1, -0.78, smooth(u)) * power; kn = lerp(0.3, 1.55, smooth(u)) * power; ak = -0.1; }
      else if (t < 0.52) { const u = (t - 0.34) / 0.18; sw = lerp(-0.78, 0.95, u * u) * power; kn = lerp(1.55, 0.10, u) * power; ak = lerp(-0.1, 0.42, u); }
      else { const u = (t - 0.52) / 0.48; sw = lerp(0.95, 0.35, smooth(u)) * power; kn = lerp(0.10, 0.85, smooth(u)) * power; ak = lerp(0.42, 0.05, u); }
      blend(b[TH], -sw, 0, side * 0.06, w);
      blend(b[SH], kn, 0, 0, w);
      blend(b[FT], ak, 0, 0, w);
      // plant leg
      blend(b[PTH], 0.12, 0, -side * 0.10, w * 0.8);
      blend(b[PSH], 0.34, 0, 0, w * 0.8);
      // torso: coil then uncoil
      const twist = (t < 0.4 ? -0.34 : 0.30) * power;
      blend(b[BONE.chest], (a.type === 'cross' ? -0.16 : 0.10) * power, side * twist, 0, w);
      blend(b[BONE.spine], (a.type === 'cross' ? -0.12 : 0.06) * power, side * twist * 0.5, 0, w);
      // arms out for balance
      blend(b[BONE.armL], -0.35, 0, 0.72, w * 0.85);
      blend(b[BONE.armR], -0.35, 0, -0.72, w * 0.85);
      blend(b[BONE.foreL], -0.55, 0, 0, w * 0.7);
      blend(b[BONE.foreR], -0.55, 0, 0, w * 0.7);
      crouch += 0.02 * w;
    } else if (a.type === 'header') {
      const w = env(t, 0.2, 0.3);
      const arch = t < 0.5 ? -0.34 : 0.42;
      blend(b[BONE.spine], arch * 0.6, 0, 0, w);
      blend(b[BONE.chest], arch * 0.5, 0, 0, w);
      blend(b[BONE.neck], t < 0.5 ? -0.3 : 0.55, 0, 0, w);
      blend(b[BONE.armL], -0.9, 0, 0.85, w);
      blend(b[BONE.armR], -0.9, 0, -0.85, w);
      blend(b[BONE.thighL], 0.45, 0, 0.1, w * 0.8);
      blend(b[BONE.shinL], 0.95, 0, 0, w * 0.8);
      blend(b[BONE.thighR], 0.25, 0, -0.1, w * 0.8);
      blend(b[BONE.shinR], 1.15, 0, 0, w * 0.8);
    } else if (a.type === 'slide') {
      const w = env(t, 0.14, 0.26);
      // lay out sideways, leading leg extended
      blend(b[BONE.thighL], -1.05, 0, 0.18, w);
      blend(b[BONE.shinL], 0.12, 0, 0, w);
      blend(b[BONE.footL], 0.35, 0, 0, w);
      blend(b[BONE.thighR], -0.35, 0, -0.45, w);
      blend(b[BONE.shinR], 1.55, 0, 0, w);
      blend(b[BONE.spine], -0.22, 0.2, 0, w);
      blend(b[BONE.chest], -0.12, 0.25, 0, w);
      blend(b[BONE.armL], 0.6, 0, 1.25, w);
      blend(b[BONE.armR], -0.5, 0, -0.9, w);
      blend(b[BONE.foreL], -0.4, 0, 0, w);
      p.slidePose = w;
    } else if (a.type === 'dive') {
      const w = env(t, 0.12, 0.22);
      const dir = a.dir || 1;
      blend(b[BONE.armL], -0.2, 0, 2.35, w);
      blend(b[BONE.armR], -0.2, 0, -2.35, w);
      blend(b[BONE.foreL], -0.12, 0, 0.1, w);
      blend(b[BONE.foreR], -0.12, 0, -0.1, w);
      blend(b[BONE.spine], 0.05, 0, dir * 0.22, w);
      blend(b[BONE.thighL], -0.30, 0, 0.14, w);
      blend(b[BONE.shinL], 0.55, 0, 0, w);
      blend(b[BONE.thighR], -0.12, 0, -0.14, w);
      blend(b[BONE.shinR], 0.35, 0, 0, w);
      blend(b[BONE.neck], -0.15, 0, 0, w);
      p.divePose = w;
    } else if (a.type === 'catch') {
      const w = env(t, 0.15, 0.3);
      blend(b[BONE.armL], -1.45, 0, 0.35, w);
      blend(b[BONE.armR], -1.45, 0, -0.35, w);
      blend(b[BONE.foreL], -0.55, 0, 0, w);
      blend(b[BONE.foreR], -0.55, 0, 0, w);
      blend(b[BONE.spine], 0.12, 0, 0, w);
      blend(b[BONE.thighL], -0.25, 0, 0.14, w);
      blend(b[BONE.shinL], 0.45, 0, 0, w);
      blend(b[BONE.thighR], -0.25, 0, -0.14, w);
      blend(b[BONE.shinR], 0.45, 0, 0, w);
    } else if (a.type === 'celebrate') {
      const w = env(t, 0.12, 0.2);
      const pump = Math.sin(a.t * 9);
      if (a.style === 1) { // knee slide
        blend(b[BONE.thighL], -1.25, 0, 0.2, w);
        blend(b[BONE.shinL], 1.85, 0, 0, w);
        blend(b[BONE.thighR], -1.05, 0, -0.2, w);
        blend(b[BONE.shinR], 1.95, 0, 0, w);
        blend(b[BONE.spine], -0.25, 0, 0, w);
        blend(b[BONE.armL], -0.2, 0, 1.45, w);
        blend(b[BONE.armR], -0.2, 0, -1.45, w);
      } else if (a.style === 2) { // arms spread, running
        blend(b[BONE.armL], -0.1, 0, 1.62 + pump * 0.06, w);
        blend(b[BONE.armR], -0.1, 0, -1.62 - pump * 0.06, w);
        blend(b[BONE.foreL], -0.15, 0, 0, w);
        blend(b[BONE.foreR], -0.15, 0, 0, w);
        blend(b[BONE.spine], -0.12, 0, 0, w);
      } else { // fists up
        blend(b[BONE.armL], -0.3, 0, 2.55 + pump * 0.12, w);
        blend(b[BONE.armR], -0.3, 0, -2.55 - pump * 0.12, w);
        blend(b[BONE.foreL], -0.5, 0, 0, w);
        blend(b[BONE.foreR], -0.5, 0, 0, w);
        blend(b[BONE.spine], -0.14, 0, 0, w);
        blend(b[BONE.neck], -0.22, 0, 0, w);
      }
    } else if (a.type === 'stumble') {
      const w = env(t, 0.1, 0.35);
      blend(b[BONE.spine], 0.55, 0.2, 0.15, w);
      blend(b[BONE.chest], 0.3, 0.15, 0, w);
      blend(b[BONE.armL], -0.9, 0, 0.9, w);
      blend(b[BONE.armR], -0.9, 0, -0.9, w);
      blend(b[BONE.thighL], -0.7, 0, 0.2, w * 0.7);
      blend(b[BONE.shinL], 0.9, 0, 0, w * 0.7);
    } else if (a.type === 'tackle') {
      const w = env(t, 0.12, 0.34);
      const lunge = t < 0.4 ? t / 0.4 : 1 - (t - 0.4) / 0.6;
      blend(b[TH], -0.95 * lunge, 0, side * 0.18, w);
      blend(b[SH], 0.10, 0, 0, w);
      blend(b[FT], 0.30, 0, 0, w);
      blend(b[PTH], 0.30, 0, -side * 0.22, w * 0.85);
      blend(b[PSH], 0.80, 0, 0, w * 0.85);
      blend(b[BONE.spine], 0.28, side * 0.16, 0, w);
      blend(b[BONE.armL], -0.4, 0, 0.85, w * 0.8);
      blend(b[BONE.armR], -0.4, 0, -0.85, w * 0.8);
      crouch += 0.10 * w;
    } else if (a.type === 'skill') {
      const w = env(t, 0.15, 0.25);
      const s = Math.sin(t * Math.PI * 2);
      blend(b[BONE.thighR], -0.5 - 0.4 * s, 0.5 * s, -0.4, w);
      blend(b[BONE.shinR], 0.9, 0, 0, w);
      blend(b[BONE.spine], 0.1, -0.3 * s, 0, w);
      blend(b[BONE.armL], -0.2, 0, 0.8, w);
      blend(b[BONE.armR], -0.2, 0, -0.8, w);
    }
  }

  // ---------------------------------------------------------------- head aim
  if (p.lookYaw !== undefined) {
    const hy = clamp(p.lookYaw, -0.7, 0.7);
    b[BONE.neck].rotation.y += hy * 0.4;
    b[BONE.head].rotation.y += hy * 0.6;
    b[BONE.head].rotation.x += -lean * 0.55 + clamp(p.lookPitch || 0, -0.4, 0.4);
  } else {
    b[BONE.head].rotation.x += -lean * 0.55;
  }

  // ---------------------------------------------------------------- root
  const hips = b[BONE.hips];
  let rootY = HIP_Y + hipBob - crouch;
  let rootRotZ = 0, rootRotX = 0, rootRotY = pelvisY;

  if (a && a.t < a.dur) {
    const t = a.t / a.dur;
    if (a.type === 'slide') {
      const w = env(t, 0.16, 0.28);
      rootY = lerp(rootY, 0.34, w);
      rootRotZ = lerp(0, 1.15, w);
      rootRotX = lerp(0, -0.30, w);
    } else if (a.type === 'dive') {
      const w = env(t, 0.14, 0.24);
      const arc = Math.sin(clamp(t, 0, 1) * Math.PI);
      rootY = lerp(rootY, 0.55 + arc * 0.42, w);
      rootRotZ = lerp(0, (a.dir || 1) * 1.32, w);
      rootRotX = lerp(0, -0.12, w);
    } else if (a.type === 'header') {
      const arc = Math.sin(clamp(t / 0.85, 0, 1) * Math.PI);
      rootY += arc * (a.jump || 0.42);
    } else if (a.type === 'celebrate' && a.style !== 1) {
      rootY += Math.abs(Math.sin(a.t * 7)) * 0.12;
    } else if (a.type === 'celebrate' && a.style === 1) {
      const w = env(t, 0.14, 0.3);
      rootY = lerp(rootY, 0.52, w);
      rootRotX = lerp(0, -0.18, w);
    }
  }
  hips.position.set(hipX, rootY, 0);
  hips.rotation.set(rootRotX, rootRotY, rootRotZ + pelvisZ);
}

// advance the gait phase from travelled distance
export function advanceGait(p, dt) {
  const spd = p.speed || 0;
  if (spd > 0.3) {
    const strideLen = 2.15 + spd * 0.17;
    p.runPhase = (p.runPhase + (spd / strideLen) * dt) % 1;
  } else {
    // settle towards a neutral stance
    const target = Math.round(p.runPhase * 2) / 2;
    p.runPhase += (target - p.runPhase) * Math.min(1, dt * 6);
  }
}
