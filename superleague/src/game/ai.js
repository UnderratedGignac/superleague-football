// ============================================================================
//  Team + player AI: positional shape, pressing, off-ball runs, decisions,
//  goalkeeper behaviour.
// ============================================================================
import * as THREE from 'three';
import { FIELD } from '../engine/stadium.js';
import { BALL_R, predictAt } from './physics.js';

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.z - b.z) ** 2;
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export function goalX(side) { return side === 0 ? -FIELD.halfL : FIELD.halfL; }
export function attackDir(side) { return side === 0 ? 1 : -1; }

// ---------------------------------------------------------------------------
//  Team shape
// ---------------------------------------------------------------------------
export function updateShape(m, team) {
  const ad = team.attackDir;
  const ball = m.ball.pos;
  const prog = clamp((ball.x * ad) / FIELD.halfL, -1, 1);
  const attacking = m.possessionSide === team.side;
  const loose = m.possessionSide === -1;
  const push = attacking ? 10 + prog * 16 : (loose ? 2 + prog * 12 : -8 + prog * 13);
  const bz = ball.z;
  for (const p of team.players) {
    if (!p.onPitch || p.sentOff) continue;
    if (p.isGK) { p.homeX = m.ownGoal(team.side) + ad * 2.0; p.homeZ = clamp(bz * 0.18, -3, 3); continue; }
    const n = p.formNorm;
    let hx = n[1] * FIELD.halfL * ad + push * ad;
    let hz = n[2] * FIELD.halfW * 0.92 * (team.side === 0 ? 1 : -1);
    hz = hz * 0.74 + bz * 0.32;
    // defenders never ahead of the ball by much when defending
    if (!attacking && (p.role === 'CB' || p.role === 'LB' || p.role === 'RB')) {
      hx = Math.min(hx * ad, ball.x * ad - 4) * ad;
    }
    // attackers stay onside when their team has the ball
    if (attacking && (p.role === 'ST' || p.role === 'LW' || p.role === 'RW' || p.role === 'CAM')) {
      const line = m.offsideLine(team.side);
      hx = Math.min(hx * ad, line - 0.7) * ad;
    }
    p.homeX = clamp(hx, -FIELD.halfL + 1.5, FIELD.halfL - 1.5);
    p.homeZ = clamp(hz, -FIELD.halfW + 1.6, FIELD.halfW - 1.6);
  }
}

// ---------------------------------------------------------------------------
//  Passing evaluation
// ---------------------------------------------------------------------------
export function laneScore(m, from, to, side) {
  const opp = m.teams[1 - side];
  const dx = to.x - from.x, dz = to.z - from.z;
  const len = Math.hypot(dx, dz) || 1;
  let worst = 99;
  for (const o of opp.players) {
    if (!o.onPitch || o.sentOff) continue;
    const t = ((o.pos.x - from.x) * dx + (o.pos.z - from.z) * dz) / (len * len);
    if (t < 0.05 || t > 0.98) continue;
    const px = from.x + dx * t, pz = from.z + dz * t;
    const d = Math.hypot(o.pos.x - px, o.pos.z - pz);
    if (d < worst) worst = d;
  }
  return worst;
}

export function nearestOpponentDist(m, p) {
  const opp = m.teams[1 - p.side];
  let best = 999;
  for (const o of opp.players) {
    if (!o.onPitch || o.sentOff) continue;
    const d = dist(o.pos, p.pos);
    if (d < best) best = d;
  }
  return best;
}

export function bestPass(m, p, mode = 'normal', aimDir = null) {
  const team = m.teams[p.side];
  const ad = m.dir(p.side);
  let best = null, bestScore = -1e9;
  for (const t of team.players) {
    if (t === p || !t.onPitch || t.sentOff || t.busy) continue;
    const d = dist(t.pos, p.pos);
    if (d < 3.5 || d > 52) continue;
    if (t.isGK && mode !== 'safe') continue;
    const lane = laneScore(m, p.pos, t.pos, p.side);
    if (lane < 1.1 && mode !== 'safe') continue;
    const forward = (t.pos.x - p.pos.x) * ad;
    const open = nearestOpponentDist(m, t);
    let s = 0;
    s += forward * (mode === 'through' ? 1.5 : 0.85);
    s += Math.min(open, 12) * 1.5;
    s += Math.min(lane, 8) * 2.0;
    s -= Math.abs(d - (mode === 'long' ? 32 : mode === 'through' ? 22 : 16)) * 0.55;
    // aim preference (user stick direction)
    if (aimDir) {
      const dx = (t.pos.x - p.pos.x) / d, dz = (t.pos.z - p.pos.z) / d;
      const dot = dx * aimDir.x + dz * aimDir.z;
      s += dot * 34;
      if (dot < -0.1) continue;
    }
    // danger of being offside
    if (mode === 'through' || forward > 6) {
      const line = m.offsideLine(p.side);
      if (t.pos.x * ad > line - 0.3 && t.pos.x * ad > 0) s -= 60;
    }
    // prefer not to pass backwards into own third under pressure
    if (forward < -12 && p.pos.x * ad < 0) s -= 8;
    if (t.isGK) s -= 25;
    if (s > bestScore) { bestScore = s; best = t; }
  }
  return best;
}

// ---------------------------------------------------------------------------
//  Shot evaluation
// ---------------------------------------------------------------------------
export function shotQuality(m, p) {
  const ad = m.dir(p.side);
  const gx = m.oppGoal(p.side);
  const d = Math.hypot(gx - p.pos.x, p.pos.z);
  if (d > 34) return 0;
  const angle = Math.abs(Math.atan2(p.pos.z, Math.abs(gx - p.pos.x)));
  let s = clamp(1 - (d - 8) / 26, 0, 1) * clamp(1 - angle / 1.15, 0, 1);
  // blockers
  const opp = m.teams[1 - p.side];
  for (const o of opp.players) {
    if (!o.onPitch || o.sentOff || o.isGK) continue;
    const dx = gx - p.pos.x, dz = -p.pos.z;
    const len2 = dx * dx + dz * dz || 1;
    const t = ((o.pos.x - p.pos.x) * dx + (o.pos.z - p.pos.z) * dz) / len2;
    if (t < 0.03 || t > 0.95) continue;
    const px = p.pos.x + dx * t, pz = p.pos.z + dz * t;
    const dd = Math.hypot(o.pos.x - px, o.pos.z - pz);
    if (dd < 1.3) s *= 0.45;
    else if (dd < 2.6) s *= 0.78;
  }
  if (Math.abs(p.pos.x) < FIELD.halfL - FIELD.penDepth && Math.abs(p.pos.z) < FIELD.penHalfW) s *= 1.15;
  return clamp(s, 0, 1) * (0.55 + p.data.shoot / 220);
}

// ---------------------------------------------------------------------------
//  Goalkeeper
// ---------------------------------------------------------------------------
function keeperAI(m, p, dt) {
  const team = m.teams[p.side];
  const ad = m.dir(p.side);
  const gx = m.ownGoal(p.side);
  const ball = m.ball;
  const bp = ball.pos;
  const skill = m.diff.gkSkill * (0.7 + p.ovr / 300);

  if (m.owner === p) {
    // distribute after a short hold
    p.aiTimer -= dt;
    p.desired.set(0, 0, 0);
    p.targetFacing = ad > 0 ? Math.PI / 2 : -Math.PI / 2;
    if (p.aiTimer <= 0 && m.state === 'play') {
      const t = bestPass(m, p, 'long', null) || bestPass(m, p, 'safe', null);
      if (t) m.doPass(p, t, dist(t.pos, p.pos) > 26 ? 'long' : 'normal');
      else m.doClear(p);
      p.aiTimer = 1.2;
    }
    return;
  }

  const distToGoal = Math.hypot(bp.x - gx, bp.z);
  const towardGoal = (ball.vel.x * -ad) > 3.5;
  const inBox = Math.abs(bp.x - gx) < FIELD.penDepth + 2 && Math.abs(bp.z) < FIELD.penHalfW + 2;

  // shot interception
  if (towardGoal && ball.vel.length() > 7) {
    const pr = predictAt(ball, gx + ad * 0.35, 1.6);
    if (pr && Math.abs(pr.z) < 6.5 && pr.y < 3.4) {
      const targetZ = clamp(pr.z, -FIELD.goalW / 2 - 0.9, FIELD.goalW / 2 + 0.9);
      const targetX = gx + ad * clamp(0.6 + (1 - clamp(pr.t, 0, 1)) * 1.0, 0.5, 2.2);
      const dz = targetZ - p.pos.z;
      const need = Math.abs(dz);
      p.desired.set((targetX - p.pos.x) * 0.6, 0, dz * 1.4);
      const dl = Math.hypot(p.desired.x, p.desired.z);
      if (dl > 1) { p.desired.x /= dl; p.desired.z /= dl; }
      p.sprint = true;
      p.animState = 'jockey';
      p.targetFacing = Math.atan2(bp.x - p.pos.x, bp.z - p.pos.z);
      // dive decision
      const eta = pr.t;
      if (!p.action && eta < 0.42 * skill + 0.10 && (need > 0.85 || pr.y > 1.7 || pr.y < 0.5)) {
        const dir = Math.sign(dz) || 1;
        const power = clamp(need / 2.2, 0.45, 1);
        p.startAction('dive', 0.72, {
          dir: -dir * ad, vx: 0, vz: dir * 7.4 * power * skill,
        });
        p.diveDir = dir;
        m.onKeeperDive(p);
      }
      return;
    }
  }

  // rush out for loose balls in the box
  if (inBox && m.possessionSide !== p.side && !m.owner) {
    let nearestAtt = 999;
    for (const o of m.teams[1 - p.side].players) {
      if (!o.onPitch || o.sentOff) continue;
      nearestAtt = Math.min(nearestAtt, dist(o.pos, bp));
    }
    if (dist(p.pos, bp) < nearestAtt + 1.5 && distToGoal < 17) {
      const d = dist(p.pos, bp) || 1;
      p.desired.set((bp.x - p.pos.x) / d, 0, (bp.z - p.pos.z) / d);
      p.sprint = true;
      p.animState = 'run';
      return;
    }
  }

  // default positioning: on the arc between ball and goal centre
  const depth = clamp(1.0 + (1 - clamp(distToGoal / 45, 0, 1)) * 5.0, 0.7, 7.5);
  const dx = bp.x - gx, dz = bp.z;
  const dl = Math.hypot(dx, dz) || 1;
  let tx = gx + (dx / dl) * depth;
  let tz = clamp((dz / dl) * depth, -FIELD.goalW / 2 - 1.2, FIELD.goalW / 2 + 1.2);
  // stay inside the six-yard-ish area
  tx = clamp(tx * ad, gx * ad - 0.4, gx * ad + 12) * ad;
  const ddx = tx - p.pos.x, ddz = tz - p.pos.z;
  const dd = Math.hypot(ddx, ddz);
  if (dd > 0.28) { p.desired.set(ddx / dd, 0, ddz / dd); p.speedScale = clamp(dd / 2.2, 0.35, 1); }
  else { p.desired.set(0, 0, 0); p.speedScale = 1; }
  p.sprint = dd > 4;
  p.animState = dd > 2.6 ? 'run' : 'jockey';
  p.targetFacing = Math.atan2(bp.x - p.pos.x, bp.z - p.pos.z);
  void team;
}

// ---------------------------------------------------------------------------
//  Outfield AI
// ---------------------------------------------------------------------------
function outfieldAI(m, p, dt) {
  const team = m.teams[p.side];
  const ad = m.dir(p.side);
  const ball = m.ball;
  const bp = ball.pos;
  const opp = m.teams[1 - p.side];
  const isUser = m.controlled === p && m.userTeam === p.side;

  if (isUser) return;

  p.aiTimer -= dt;
  const decide = p.aiTimer <= 0;
  if (decide) p.aiTimer = 0.09 + Math.random() * 0.09 + (1 - m.diff.reaction) * 0.16;

  // ---- carrying the ball ----
  if (m.owner === p) {
    const gx = m.oppGoal(p.side);
    const dGoal = Math.hypot(gx - p.pos.x, p.pos.z);
    const pressure = nearestOpponentDist(m, p);
    if (decide) {
      const sq = shotQuality(m, p);
      const shootUrge = sq * (0.75 + m.diff.accuracy * 0.5);
      if (dGoal < 30 && shootUrge > 0.42 && (Math.random() < 0.55 || pressure < 2.4)) {
        m.doShoot(p, clamp(0.55 + dGoal / 40, 0.5, 1), (Math.random() - 0.5) * 0.5);
        return;
      }
      const passTarget = bestPass(m, p, 'normal', null);
      const throughTarget = bestPass(m, p, 'through', null);
      const wantPass = pressure < 4.2 || Math.random() < 0.30;
      if (passTarget && wantPass) {
        const fwd = (passTarget.pos.x - p.pos.x) * ad;
        if (throughTarget && fwd > 8 && dGoal < 46 && Math.random() < 0.32) {
          m.doPass(p, throughTarget, 'through'); return;
        }
        if (pressure < 3.0 || fwd > 4 || Math.random() < 0.42) {
          m.doPass(p, passTarget, dist(passTarget.pos, p.pos) > 30 ? 'long' : 'normal'); return;
        }
      }
      if (pressure < 2.2 && p.pos.x * ad < -18) { m.doClear(p); return; }
      // cross from wide areas
      if (Math.abs(p.pos.z) > 20 && p.pos.x * ad > 22 && Math.random() < 0.5) { m.doCross(p); return; }
    }
    // dribble: head for goal, steer around opponents
    let tx = gx, tz = clamp(p.pos.z * 0.55, -12, 12);
    if (dGoal > 40) { tx = p.pos.x + ad * 18; tz = p.pos.z * 0.85; }
    let dx = tx - p.pos.x, dz = tz - p.pos.z;
    const dl = Math.hypot(dx, dz) || 1;
    dx /= dl; dz /= dl;
    // avoidance
    for (const o of opp.players) {
      if (!o.onPitch || o.sentOff) continue;
      const ox = o.pos.x - p.pos.x, oz = o.pos.z - p.pos.z;
      const od = Math.hypot(ox, oz);
      if (od < 6.5 && od > 0.05) {
        const ahead = (ox * dx + oz * dz) / od;
        if (ahead > 0.25) {
          const w = (6.5 - od) / 6.5 * 1.5 * ahead;
          const perpX = -dz, perpZ = dx;
          const sideSign = (ox * perpX + oz * perpZ) > 0 ? -1 : 1;
          dx += perpX * w * sideSign; dz += perpZ * w * sideSign;
        }
      }
    }
    const nl = Math.hypot(dx, dz) || 1;
    p.desired.set(dx / nl, 0, dz / nl);
    p.sprint = pressure > 3.5 || dGoal < 30;
    p.speedScale = 0.92;
    p.animState = 'run';
    return;
  }

  // ---- defending: designated presser ----
  const defending = m.possessionSide !== p.side;
  if (defending && p === team.presser) {
    const target = m.owner ? m.owner.pos : bp;
    // aim slightly goal-side of the carrier
    const ownGoal = m.ownGoal(p.side);
    let tx = target.x, tz = target.z;
    const gdx = ownGoal - target.x, gdz = -target.z;
    const gl = Math.hypot(gdx, gdz) || 1;
    tx += (gdx / gl) * 0.9; tz += (gdz / gl) * 0.9;
    if (!m.owner) { tx = bp.x + ball.vel.x * 0.22; tz = bp.z + ball.vel.z * 0.22; }
    const dx = tx - p.pos.x, dz = tz - p.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    p.desired.set(dx / d, 0, dz / d);
    p.sprint = d > 3;
    p.speedScale = 1;
    p.animState = d < 2.4 ? 'jockey' : 'run';
    // tackle
    if (m.owner && m.owner.side !== p.side && p.tackleCd <= 0 && p.canAct) {
      const d2 = dist(p.pos, m.owner.pos);
      if (d2 < 1.75 && Math.random() < m.diff.aggression * 0.55) {
        const slide = d2 > 1.25 && Math.random() < 0.22 * m.diff.aggression;
        m.doTackle(p, slide);
      }
    }
    return;
  }
  if (defending && p === team.cover) {
    // cover the space goal-side of the presser
    const ownGoal = m.ownGoal(p.side);
    const target = m.owner ? m.owner.pos : bp;
    const gdx = ownGoal - target.x, gdz = -target.z;
    const gl = Math.hypot(gdx, gdz) || 1;
    const tx = target.x + (gdx / gl) * 6.5, tz = target.z + (gdz / gl) * 6.5 + (p.homeZ - target.z) * 0.3;
    const dx = tx - p.pos.x, dz = tz - p.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    if (d > 0.7) { p.desired.set(dx / d, 0, dz / d); p.speedScale = clamp(d / 4, 0.4, 1); }
    else p.desired.set(0, 0, 0);
    p.sprint = d > 8;
    p.animState = d < 3 ? 'jockey' : 'run';
    return;
  }

  // ---- off-ball: hold shape, mark, or make runs ----
  let tx = p.homeX, tz = p.homeZ;

  if (defending) {
    // mark the most dangerous nearby opponent
    let mark = null, best = 1e9;
    for (const o of opp.players) {
      if (!o.onPitch || o.sentOff || o.isGK || o === m.owner) continue;
      const dHome = Math.hypot(o.pos.x - p.homeX, o.pos.z - p.homeZ);
      if (dHome > 13) continue;
      const threat = dHome - (o.pos.x * ad < 0 ? 4 : 0);
      if (threat < best) { best = threat; mark = o; }
    }
    if (mark) {
      const ownGoal = m.ownGoal(p.side);
      const gdx = ownGoal - mark.pos.x, gdz = -mark.pos.z;
      const gl = Math.hypot(gdx, gdz) || 1;
      tx = mark.pos.x + (gdx / gl) * 2.1;
      tz = mark.pos.z + (gdz / gl) * 2.1;
      tx = tx * 0.55 + p.homeX * 0.45;
      tz = tz * 0.65 + p.homeZ * 0.35;
    }
  } else {
    // attacking runs
    const advanced = bp.x * ad > 8;
    if (advanced && (p.role === 'ST' || p.role === 'LW' || p.role === 'RW') && m.owner && m.owner !== p) {
      const line = m.offsideLine(p.side);
      const runX = Math.min(line - 0.6, FIELD.halfL - 5) * ad;
      if (p.pos.x * ad < runX * ad - 2) tx = runX;
      tz = p.homeZ * 0.85 + (p.role === 'ST' ? 0 : Math.sign(p.homeZ) * 4);
    }
    // fullbacks overlap
    if (advanced && (p.role === 'LB' || p.role === 'RB') && bp.x * ad > 22) {
      tx = Math.min(bp.x * ad + 8, FIELD.halfL - 8) * ad;
      tz = Math.sign(p.homeZ) * 27;
    }
    // get open: drift away from a close marker
    const nd = nearestOpponentDist(m, p);
    if (nd < 3.2) {
      let ax = 0, az = 0;
      for (const o of opp.players) {
        if (!o.onPitch || o.sentOff) continue;
        const dx = p.pos.x - o.pos.x, dz = p.pos.z - o.pos.z;
        const d = Math.hypot(dx, dz);
        if (d < 4 && d > 0.05) { ax += dx / d; az += dz / d; }
      }
      tx += ax * 1.8; tz += az * 1.8;
    }
  }

  tx = clamp(tx, -FIELD.halfL + 1.2, FIELD.halfL - 1.2);
  tz = clamp(tz, -FIELD.halfW + 1.2, FIELD.halfW - 1.2);
  const dx = tx - p.pos.x, dz = tz - p.pos.z;
  const d = Math.hypot(dx, dz);
  if (d > 0.55) {
    p.desired.set(dx / d, 0, dz / d);
    p.speedScale = clamp(d / 5, 0.32, 1);
    p.sprint = d > 11 && defending;
    p.animState = d < 2.2 && defending ? 'jockey' : 'run';
  } else {
    p.desired.set(0, 0, 0);
    p.speedScale = 1;
    p.animState = defending ? 'jockey' : 'idle';
  }
  // face the ball
  const bdx = bp.x - p.pos.x, bdz = bp.z - p.pos.z;
  if (Math.hypot(bdx, bdz) > 1.5 && p.speed < 1.2) p.targetFacing = Math.atan2(bdx, bdz);
}

// ---------------------------------------------------------------------------
export function updateAI(m, dt) {
  for (const team of m.teams) {
    updateShape(m, team);
    // choose presser + cover (closest two to the ball, excluding keeper)
    const bp = m.owner ? m.owner.pos : m.ball.pos;
    let a = null, b = null, da = 1e9, db = 1e9;
    for (const p of team.players) {
      if (!p.onPitch || p.sentOff || p.isGK || p.busy) continue;
      if (m.controlled === p && m.userTeam === p.side && m.possessionSide !== p.side) continue;
      const d = dist(p.pos, bp);
      if (d < da) { b = a; db = da; a = p; da = d; }
      else if (d < db) { b = p; db = d; }
    }
    team.presser = a; team.cover = b;
    for (const p of team.players) {
      if (!p.onPitch || p.sentOff) continue;
      if (m.state === 'setpiece' || m.state === 'goal' || m.state === 'replay' || m.state === 'halftime' || m.state === 'fulltime') {
        if (m.state === 'goal' || m.state === 'replay') continue;
      }
      if (p.isGK) keeperAI(m, p, dt);
      else outfieldAI(m, p, dt);
    }
  }
}

export { clamp, dist };
