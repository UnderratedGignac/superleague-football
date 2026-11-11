// ============================================================================
//  Player entity: skinned visual + locomotion + state
// ============================================================================
import * as THREE from 'three';
import { buildPlayerGeometry, makeSkeleton, BONE } from '../engine/humanoid.js';
import { buildPlayerGeometry as _bpg } from '../engine/humanoid.js';
import { makePlayerMaterial, makeNumberTexture } from '../engine/kit.js';
import { posePlayer, advanceGait } from '../engine/animate.js';
import { makeBlobTexture } from '../engine/ball.js';
import { SKIN, HAIRC, overall } from '../data.js';

void _bpg;

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const TAU = Math.PI * 2;
function angDiff(a, b) { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; }

let shadowMat = null;
function getShadowMat() {
  if (!shadowMat) shadowMat = new THREE.MeshBasicMaterial({ map: makeBlobTexture(), transparent: true, opacity: 0.42, depthWrite: false, color: 0x000000 });
  return shadowMat;
}
let shadowGeo = null;
function getShadowGeo() { if (!shadowGeo) shadowGeo = new THREE.PlaneGeometry(1.25, 1.25); return shadowGeo; }

export class Player {
  constructor(scene, teamSide, slot, data, kitAtlas, isGK, kitColors) {
    this.side = teamSide;         // 0 = home (attacks +x), 1 = away
    this.slot = slot;             // index in starting XI
    this.data = data;
    this.isGK = isGK;
    this.ovr = overall(data);

    const o = {
      skin: SKIN[data.skin % SKIN.length],
      hairColor: HAIRC[data.hair % HAIRC.length],
      hairStyle: (data.hair * 3 + data.num) % 8,
      boot: [0x14161a, 0xf2f4f8, 0xff3b47, 0xc6ff3d, 0x22e0ff, 0xffb020][(data.num + slot) % 6],
      glove: 0xf4f6f8,
      eye: [0x3a2a1c, 0x2a3a4a, 0x4a3a20][data.num % 3],
      isGK,
    };
    const geo = buildPlayerGeometry(o);
    const numTex = makeNumberTexture(data.name, data.num, kitColors.number ?? 0xffffff, kitColors.numberOutline ?? 0x101418);
    const mat = makePlayerMaterial(kitAtlas, numTex);
    this.mesh = new THREE.SkinnedMesh(geo, mat);
    const { bones, skeleton, root } = makeSkeleton();
    this.bones = bones; this.skeleton = skeleton;
    this.mesh.add(root);
    this.mesh.bind(skeleton, new THREE.Matrix4());
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = false;
    this.heightScale = data.height / 182;
    this.mesh.scale.setScalar(this.heightScale);
    scene.add(this.mesh);
    this.numTex = numTex; this.mat = mat;

    this.shadow = new THREE.Mesh(getShadowGeo(), getShadowMat());
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.010;
    this.shadow.renderOrder = 1;
    scene.add(this.shadow);

    // ---- state ----
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.desired = new THREE.Vector3();
    this.facing = 0;
    this.targetFacing = 0;
    this.speed = 0;
    this.sprint = false;
    this.speedScale = 1;
    this.runPhase = Math.random();
    this.animState = 'idle';
    this.action = null;
    this.seed = Math.random() * 10;
    this.stamina = 100;
    this.yellow = 0; this.sentOff = false;
    this.tackleCd = 0; this.touchCd = 0; this.aiTimer = Math.random() * 0.3;
    this.slideT = 0; this.downT = 0;
    this.homeX = 0; this.homeZ = 0;
    this.role = data.role;
    this.lastTouch = -99;
    this.lookYaw = 0; this.lookPitch = 0;
    this._poseSkip = 0;
    this.divePose = 0; this.slidePose = 0;
    this.onPitch = true;
    this.maxSpeed = 5.5 + data.pace * 0.029;
    this.accel = 8.5 + data.phys * 0.055;
    this.control = 0.55 + data.dribble / 260;
    this.reach = 0.95 * this.heightScale;
  }

  get name() { return this.data.name; }

  setPos(x, z, facing) {
    this.pos.set(x, 0, z);
    this.vel.set(0, 0, 0);
    this.speed = 0;
    if (facing !== undefined) { this.facing = facing; this.targetFacing = facing; }
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = this.facing;
    this.shadow.position.set(x, 0.010, z);
  }

  startAction(type, dur, extra = {}) {
    this.action = { type, t: 0, dur, ...extra };
  }

  get busy() {
    if (!this.action) return false;
    const t = this.action.type;
    return (t === 'slide' || t === 'dive' || t === 'stumble' || t === 'header') && this.action.t < this.action.dur;
  }

  get canAct() {
    return !this.sentOff && this.downT <= 0 && !this.busy &&
      !(this.action && (this.action.type === 'kick' || this.action.type === 'pass' || this.action.type === 'cross' || this.action.type === 'clear') && this.action.t < this.action.dur * 0.55);
  }

  update(dt, clock, camPos, quality) {
    // ---- timers ----
    if (this.tackleCd > 0) this.tackleCd -= dt;
    if (this.touchCd > 0) this.touchCd -= dt;
    if (this.downT > 0) this.downT -= dt;
    if (this.action) {
      this.action.t += dt;
      if (this.action.t >= this.action.dur) {
        if (this.action.type === 'slide') this.downT = Math.max(this.downT, 0.35);
        this.action = null;
      }
    }

    // ---- locomotion ----
    const d = this.desired;
    let dl = Math.hypot(d.x, d.z);
    if (dl > 1) { d.x /= dl; d.z /= dl; dl = 1; }
    const locked = this.busy || this.downT > 0;
    const stamFactor = 0.72 + 0.28 * clamp(this.stamina / 100, 0, 1);
    const maxS = this.maxSpeed * (this.sprint ? 1 : 0.74) * this.speedScale * stamFactor;
    let tvx = 0, tvz = 0;
    if (!locked && dl > 0.02) { tvx = d.x * maxS * dl; tvz = d.z * maxS * dl; }
    else if (this.action && this.action.type === 'slide') {
      // slide keeps momentum along the slide direction
      const f = Math.max(0, 1 - this.action.t / this.action.dur);
      tvx = Math.sin(this.facing) * 7.2 * f;
      tvz = Math.cos(this.facing) * 7.2 * f;
    } else if (this.action && this.action.type === 'dive') {
      const f = Math.max(0, 1 - this.action.t / this.action.dur);
      tvx = (this.action.vx || 0) * f; tvz = (this.action.vz || 0) * f;
    }
    const ax = (tvx - this.vel.x), az = (tvz - this.vel.z);
    const al = Math.hypot(ax, az);
    const rate = (locked ? 5.5 : (al > 0.1 ? this.accel : this.accel * 1.5)) * dt;
    if (al > 1e-4) {
      const k = Math.min(1, rate / al);
      this.vel.x += ax * k; this.vel.z += az * k;
    }
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.speed = Math.hypot(this.vel.x, this.vel.z);

    // stamina
    if (this.speed > 6.2) this.stamina = Math.max(0, this.stamina - dt * (2.4 + (this.speed - 6.2) * 1.5));
    else if (this.speed > 3) this.stamina = Math.max(0, this.stamina - dt * 0.35);
    else this.stamina = Math.min(100, this.stamina + dt * 2.6);

    // facing
    if (!locked && this.speed > 0.5) this.targetFacing = Math.atan2(this.vel.x, this.vel.z);
    const turnRate = locked ? 1.6 : (7.5 - Math.min(4, this.speed * 0.42));
    this.facing += angDiff(this.facing, this.targetFacing) * Math.min(1, dt * turnRate);

    // animation state
    if (this.action && this.action.type === 'slide') this.animState = 'slide';
    else if (this.animState !== 'jockey' || this.speed > 3.4) this.animState = this.speed > 0.4 ? 'run' : 'idle';

    advanceGait(this, dt);

    // ---- visuals ----
    this.mesh.position.set(this.pos.x, 0, this.pos.z);
    this.mesh.rotation.y = this.facing;
    this.shadow.position.set(this.pos.x, 0.010, this.pos.z);
    const airborne = this.action && (this.action.type === 'header' || this.action.type === 'dive');
    this.shadow.material.opacity = 0.42;
    this.shadow.scale.setScalar(airborne ? 1.15 : 1);

    // pose LOD
    let skip = 0;
    if (camPos && quality !== 'high') {
      const dist = Math.hypot(this.pos.x - camPos.x, this.pos.z - camPos.z);
      skip = dist > 75 ? 2 : dist > 45 ? 1 : 0;
    }
    this._poseSkip = (this._poseSkip + 1) % (skip + 1);
    if (this._poseSkip === 0) posePlayer(this.bones, this, dt, clock);
  }

  dispose(scene) {
    scene.remove(this.mesh); scene.remove(this.shadow);
    this.mesh.geometry.dispose();
    this.mat.dispose(); this.numTex.dispose();
  }
}

export { BONE, clamp, angDiff };
