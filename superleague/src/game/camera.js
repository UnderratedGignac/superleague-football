// ============================================================================
//  Camera rig: broadcast, tele, dynamic, player-pro, cinematic replay
// ============================================================================
import * as THREE from 'three';
import { FIELD } from '../engine/stadium.js';

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;

export const CAM_MODES = ['broadcast', 'tele', 'dynamic', 'pro'];
export const CAM_LABELS = { broadcast: 'BROADCAST', tele: 'TELE', dynamic: 'DYNAMIC', pro: 'PLAYER' };

export class CameraRig {
  constructor(camera) {
    this.cam = camera;
    this.mode = 'broadcast';
    this.pos = new THREE.Vector3(0, 20, 48);
    this.look = new THREE.Vector3(0, 1, 0);
    this.fov = 34;
    this.shakeAmt = 0;
    this._t = 0;
    this.cinematic = null;
    this.side = 1;
    this._tmp = new THREE.Vector3();
    this._tmp2 = new THREE.Vector3();
  }

  cycle() {
    const i = CAM_MODES.indexOf(this.mode);
    this.mode = CAM_MODES[(i + 1) % CAM_MODES.length];
    return this.mode;
  }

  shake(a) { this.shakeAmt = Math.min(1.4, this.shakeAmt + a); }

  setCinematic(kind, focus, side) {
    this.cinematic = { kind, focus: focus.clone(), side, t: 0 };
  }
  clearCinematic() { this.cinematic = null; }

  update(dt, m) {
    this._t += dt;
    const cam = this.cam;
    const ball = m.ball.pos;
    const focusPlayer = m.controlled;
    let tp = this._tmp, tl = this._tmp2;
    let tfov = 34;
    let responsiveness = 3.0;

    if (this.cinematic) {
      const c = this.cinematic;
      c.t += dt;
      const f = c.focus;
      if (c.kind === 'orbit') {
        const a = c.t * 0.42 + 1.1;
        const r = 15 - Math.min(5, c.t * 0.7);
        tp.set(f.x + Math.cos(a) * r, 3.4 + Math.sin(c.t * 0.3) * 1.6, f.z + Math.sin(a) * r);
        tl.set(f.x, 1.3, f.z);
        tfov = 40; responsiveness = 4.5;
      } else if (c.kind === 'behindgoal') {
        const gx = c.side * (FIELD.halfL + 9);
        tp.set(gx, 4.2 + Math.sin(c.t * 0.4) * 0.6, f.z * 0.35 + Math.sin(c.t * 0.25) * 5);
        tl.set(f.x, 1.4, f.z);
        tfov = 42; responsiveness = 3.2;
      } else if (c.kind === 'low') {
        tp.set(f.x - c.side * 12, 1.05, f.z + 13);
        tl.set(f.x, 1.5, f.z);
        tfov = 36; responsiveness = 3.6;
      } else { // aerial
        tp.set(f.x * 0.6, 34, f.z + 26);
        tl.set(f.x, 0.8, f.z);
        tfov = 40; responsiveness = 2.6;
      }
    } else if (this.mode === 'pro' && focusPlayer) {
      const ad = m.teams[focusPlayer.side].attackDir;
      const fx = Math.sin(focusPlayer.facing), fz = Math.cos(focusPlayer.facing);
      const dx = lerp(ad, fx, 0.35), dz = lerp(0, fz, 0.35);
      const dl = Math.hypot(dx, dz) || 1;
      const px = focusPlayer.pos.x, pz = focusPlayer.pos.z;
      tp.set(px - (dx / dl) * 8.4, 4.6, pz - (dz / dl) * 8.4);
      tl.set(px + (dx / dl) * 9 + (ball.x - px) * 0.22, 1.5, pz + (dz / dl) * 9 + (ball.z - pz) * 0.22);
      tfov = 46; responsiveness = 5.0;
    } else if (this.mode === 'tele') {
      tp.set(clamp(ball.x * 0.55, -32, 32), 27 + Math.abs(ball.x) * 0.05, 52 + ball.z * 0.22);
      tl.set(ball.x * 0.9, 1.0, ball.z * 0.72);
      tfov = 30; responsiveness = 2.4;
    } else if (this.mode === 'dynamic') {
      const lead = clamp(m.ball.vel.x * 0.30, -7, 7);
      tp.set(clamp(ball.x * 0.86 + lead * 0.4, -44, 44), 12.5, 30 + ball.z * 0.42);
      tl.set(ball.x * 0.96 + lead, 1.3, ball.z * 0.80);
      tfov = 42; responsiveness = 4.2;
    } else {
      // broadcast
      const lead = clamp(m.ball.vel.x * 0.34, -8, 8);
      tp.set(clamp(ball.x * 0.66 + lead * 0.35, -40, 40), 17.5 + Math.abs(ball.x) * 0.05, 41 + ball.z * 0.36);
      tl.set(ball.x * 0.94 + lead, 1.35, ball.z * 0.66);
      tfov = 34; responsiveness = 3.0;
    }

    const k = Math.min(1, dt * responsiveness);
    this.pos.lerp(tp, k);
    this.look.lerp(tl, Math.min(1, dt * (responsiveness + 1.4)));
    this.fov = lerp(this.fov, tfov, Math.min(1, dt * 3));

    // shake
    let sx = 0, sy = 0;
    if (this.shakeAmt > 0.001) {
      const a = this.shakeAmt;
      sx = (Math.sin(this._t * 47.3) + Math.sin(this._t * 31.7)) * 0.10 * a;
      sy = (Math.sin(this._t * 53.1) + Math.sin(this._t * 27.3)) * 0.08 * a;
      this.shakeAmt *= Math.max(0, 1 - dt * 4.2);
    }
    cam.position.set(this.pos.x + sx, Math.max(0.7, this.pos.y + sy), this.pos.z);
    cam.lookAt(this.look);
    if (Math.abs(cam.fov - this.fov) > 0.01) { cam.fov = this.fov; cam.updateProjectionMatrix(); }
  }

  snap(m) {
    this.pos.set(0, 20, 48);
    this.look.set(m.ball.pos.x, 1, m.ball.pos.z);
  }
}
