// ============================================================================
//  Ball physics: drag, Magnus, bounce, rolling, woodwork, goal / out detection
// ============================================================================
import * as THREE from 'three';
import { FIELD } from '../engine/stadium.js';
import { BALL_R } from '../engine/ball.js';

const G = -9.81;
const DRAG = 0.0132;
const MAGNUS = 0.0021;
const RESTITUTION = 0.56;
const ROLL_FRICTION = 0.62;

const _tmp = new THREE.Vector3();
const _acc = new THREE.Vector3();
const _mag = new THREE.Vector3();

export function stepBall(ball, dt, events) {
  const speed = ball.vel.length();
  const steps = Math.min(6, Math.max(1, Math.ceil(speed * dt / 0.18)));
  const h = dt / steps;
  for (let s = 0; s < steps; s++) {
    const px = ball.pos.x, py = ball.pos.y, pz = ball.pos.z;
    const v = ball.vel;
    const sp = v.length();

    // forces
    _acc.set(0, G, 0);
    if (sp > 0.01) {
      _acc.addScaledVector(v, -DRAG * sp);
      _mag.crossVectors(ball.spin, v).multiplyScalar(MAGNUS);
      _acc.add(_mag);
    }
    v.addScaledVector(_acc, h);
    ball.pos.addScaledVector(v, h);
    ball.spin.multiplyScalar(Math.max(0, 1 - 0.35 * h));

    // ---- ground ----
    if (ball.pos.y <= BALL_R) {
      ball.pos.y = BALL_R;
      if (v.y < -0.55) {
        const impact = -v.y;
        v.y = impact * RESTITUTION;
        // tangential friction + spin transfer
        v.x *= 0.86; v.z *= 0.86;
        ball.spin.x += v.z * 1.2; ball.spin.z -= v.x * 1.2;
        ball.spin.multiplyScalar(0.7);
        events.push({ type: 'bounce', v: Math.min(1, impact / 9), x: ball.pos.x, z: ball.pos.z });
      } else {
        v.y = 0;
        // rolling resistance
        const hs = Math.hypot(v.x, v.z);
        if (hs > 0.001) {
          const dec = Math.min(hs, ROLL_FRICTION * h + hs * 0.22 * h);
          v.x -= (v.x / hs) * dec; v.z -= (v.z / hs) * dec;
        }
        // roll spin matches travel
        ball.spin.set(v.z / BALL_R * 0.55, ball.spin.y * 0.9, -v.x / BALL_R * 0.55);
      }
    }

    // ---- woodwork ----
    for (const side of [-1, 1]) {
      const gx = side * FIELD.halfL;
      if (Math.abs(ball.pos.x - gx) > 1.2) continue;
      const hw = FIELD.goalW / 2;
      // posts (vertical cylinders)
      for (const pz2 of [-hw, hw]) {
        const dx = ball.pos.x - gx, dz = ball.pos.z - pz2;
        const d = Math.hypot(dx, dz);
        const rr = BALL_R + 0.06;
        if (d < rr && ball.pos.y < FIELD.goalH + 0.1) {
          const nx = dx / (d || 1), nz = dz / (d || 1);
          ball.pos.x = gx + nx * rr; ball.pos.z = pz2 + nz * rr;
          const vn = v.x * nx + v.z * nz;
          v.x -= 1.65 * vn * nx; v.z -= 1.65 * vn * nz;
          v.multiplyScalar(0.78);
          events.push({ type: 'post', x: ball.pos.x, y: ball.pos.y, z: ball.pos.z });
        }
      }
      // crossbar (horizontal cylinder along z)
      if (Math.abs(ball.pos.z) < hw + 0.1) {
        const dx = ball.pos.x - gx, dy = ball.pos.y - FIELD.goalH;
        const d = Math.hypot(dx, dy);
        const rr = BALL_R + 0.06;
        if (d < rr) {
          const nx = dx / (d || 1), ny = dy / (d || 1);
          ball.pos.x = gx + nx * rr; ball.pos.y = FIELD.goalH + ny * rr;
          const vn = v.x * nx + v.y * ny;
          v.x -= 1.6 * vn * nx; v.y -= 1.6 * vn * ny;
          v.multiplyScalar(0.76);
          events.push({ type: 'post', x: ball.pos.x, y: ball.pos.y, z: ball.pos.z });
        }
      }
      // net behind the goal: absorb energy
      if (Math.abs(ball.pos.x) > FIELD.halfL + 0.15 && Math.abs(ball.pos.x) < FIELD.halfL + FIELD.goalDepth + 0.4 &&
          Math.abs(ball.pos.z) < hw && ball.pos.y < FIELD.goalH) {
        const backX = side * (FIELD.halfL + FIELD.goalDepth - BALL_R);
        if (side > 0 ? ball.pos.x > backX : ball.pos.x < backX) {
          ball.pos.x = backX; v.x *= -0.16; v.y *= 0.4; v.z *= 0.4;
          events.push({ type: 'net', side });
        }
        if (Math.abs(ball.pos.z) > hw - BALL_R) { ball.pos.z = Math.sign(ball.pos.z) * (hw - BALL_R); v.z *= -0.2; }
        if (ball.pos.y > FIELD.goalH - BALL_R) { ball.pos.y = FIELD.goalH - BALL_R; v.y *= -0.2; }
      }
    }

    // ---- goal line crossing ----
    for (const side of [-1, 1]) {
      const line = side * (FIELD.halfL + BALL_R * 0.7);
      const crossed = side > 0 ? (px < line && ball.pos.x >= line) : (px > line && ball.pos.x <= line);
      if (crossed) {
        const t = (line - px) / ((ball.pos.x - px) || 1);
        const zc = pz + (ball.pos.z - pz) * t;
        const yc = py + (ball.pos.y - py) * t;
        if (Math.abs(zc) < FIELD.goalW / 2 - 0.02 && yc < FIELD.goalH - 0.02) {
          events.push({ type: 'goal', side, z: zc, y: yc });
        }
      }
    }

    // ---- out of play ----
    if (Math.abs(ball.pos.z) > FIELD.halfW + BALL_R && Math.abs(ball.pos.x) < FIELD.halfL + 0.5) {
      events.push({ type: 'sideline', z: Math.sign(ball.pos.z), x: ball.pos.x });
      ball.pos.z = Math.sign(ball.pos.z) * (FIELD.halfW + BALL_R);
      ball.vel.multiplyScalar(0.2);
      return;
    }
    if (Math.abs(ball.pos.x) > FIELD.halfL + BALL_R + 0.05) {
      const side = Math.sign(ball.pos.x);
      const insideGoalMouth = Math.abs(ball.pos.z) < FIELD.goalW / 2 && ball.pos.y < FIELD.goalH;
      if (!insideGoalMouth) {
        events.push({ type: 'byline', side, z: ball.pos.z });
        ball.vel.multiplyScalar(0.15);
        ball.pos.x = side * (FIELD.halfL + BALL_R + 0.05);
        return;
      }
    }
  }
}

// Predict where the ball crosses a given x plane (used by keepers & AI)
export function predictAt(ball, planeX, maxT = 2.4) {
  const p = ball.pos.clone(), v = ball.vel.clone();
  const h = 1 / 60;
  let t = 0;
  const prev = p.clone();
  while (t < maxT) {
    prev.copy(p);
    const sp = v.length();
    _tmp.set(0, G, 0);
    if (sp > 0.01) {
      _tmp.addScaledVector(v, -DRAG * sp);
      _tmp.add(_mag.crossVectors(ball.spin, v).multiplyScalar(MAGNUS));
    }
    v.addScaledVector(_tmp, h);
    p.addScaledVector(v, h);
    if (p.y < BALL_R) { p.y = BALL_R; v.y = Math.abs(v.y) * RESTITUTION; v.x *= 0.86; v.z *= 0.86; }
    t += h;
    if ((prev.x < planeX && p.x >= planeX) || (prev.x > planeX && p.x <= planeX)) {
      const f = (planeX - prev.x) / ((p.x - prev.x) || 1);
      return { t, y: prev.y + (p.y - prev.y) * f, z: prev.z + (p.z - prev.z) * f, pos: p.clone(), vel: v.clone() };
    }
  }
  return null;
}

// Where will the ball be after t seconds (rough)
export function predictTime(ball, t) {
  const p = ball.pos.clone(), v = ball.vel.clone();
  const h = 1 / 40;
  let e = 0;
  while (e < t) {
    const sp = v.length();
    _tmp.set(0, G, 0);
    if (sp > 0.01) _tmp.addScaledVector(v, -DRAG * sp);
    v.addScaledVector(_tmp, h);
    p.addScaledVector(v, h);
    if (p.y < BALL_R) { p.y = BALL_R; v.y = Math.abs(v.y) * RESTITUTION; v.x *= 0.86; v.z *= 0.86; }
    e += h;
  }
  return p;
}

export { BALL_R, G, DRAG, MAGNUS };
