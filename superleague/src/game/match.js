// ============================================================================
//  Match engine: rules, possession, set pieces, clock, stats, replay
// ============================================================================
import * as THREE from 'three';
import { TEAMS, STADIUMS, DIFFICULTIES, FORMATIONS, MATCH_LENGTHS, COMMENTARY, pick, overall } from '../data.js';
import { FIELD, buildStadium, makeSky } from '../engine/stadium.js';
import { Ball, BALL_R } from '../engine/ball.js';
import { Particles } from '../engine/vfx.js';
import { makeKitAtlas } from '../engine/kit.js';
import { Player } from './player.js';
import { stepBall, predictAt } from './physics.js';
import { updateAI, bestPass, shotQuality, nearestOpponentDist } from './ai.js';
import { posePlayer } from '../engine/animate.js';

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const dst = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

const ROLE_COMPAT = {
  GK: ['GK'], CB: ['CB', 'LB', 'RB', 'CDM'], LB: ['LB', 'RB', 'CB', 'LW'], RB: ['RB', 'LB', 'CB', 'RW'],
  CDM: ['CDM', 'CM', 'CB'], CM: ['CM', 'CDM', 'CAM'], CAM: ['CAM', 'CM', 'LW', 'RW'],
  LW: ['LW', 'RW', 'ST', 'CAM'], RW: ['RW', 'LW', 'ST', 'CAM'], ST: ['ST', 'LW', 'RW', 'CAM'],
};
const STATE_CODE = { idle: 0, run: 1, jockey: 2, slide: 3 };
const CODE_STATE = ['idle', 'run', 'jockey', 'slide'];
const ACT_CODE = { none: 0, kick: 1, pass: 2, cross: 3, clear: 4, header: 5, slide: 6, dive: 7, catch: 8, celebrate: 9, stumble: 10, skill: 11, tackle: 12 };
const CODE_ACT = ['none', 'kick', 'pass', 'cross', 'clear', 'header', 'slide', 'dive', 'catch', 'celebrate', 'stumble', 'skill', 'tackle'];

function pickXI(teamData) {
  const form = FORMATIONS[teamData.formation] || FORMATIONS['4-3-3'];
  const pool = [...teamData.players];
  const xi = [];
  for (const slot of form) {
    const role = slot[0];
    let idx = pool.findIndex(p => p.role === role);
    if (idx < 0) {
      const compat = ROLE_COMPAT[role] || [role];
      for (const r of compat) { idx = pool.findIndex(p => p.role === r); if (idx >= 0) break; }
    }
    if (idx < 0) {
      let best = 0, bv = -1;
      pool.forEach((p, i) => { const v = overall(p); if (v > bv) { bv = v; best = i; } });
      idx = best;
    }
    xi.push({ data: pool[idx], norm: slot });
    pool.splice(idx, 1);
  }
  return { xi, bench: pool, form };
}

function colorDist(a, b) {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return Math.hypot(ar - br, ag - bg, ab - bb);
}
function luminance(c) { return (0.2126 * ((c >> 16) & 255) + 0.7152 * ((c >> 8) & 255) + 0.0722 * (c & 255)) / 255; }

export class Match {
  constructor(scene, renderer, audio, cfg) {
    this.scene = scene;
    this.renderer = renderer;
    this.audio = audio;
    this.cfg = cfg;
    this.quality = cfg.quality || 'high';
    this.diff = DIFFICULTIES[cfg.difficulty] || DIFFICULTIES.pro;
    this.lengthCfg = MATCH_LENGTHS.find(l => l.id === cfg.length) || MATCH_LENGTHS[1];
    this.st = STADIUMS.find(s => s.id === cfg.stadium) || STADIUMS[0];
    this.userTeam = cfg.userTeam ?? 0;
    this.replaysEnabled = cfg.replays !== false;

    this.events = [];
    this.listeners = {};
    this.state = 'idle';
    this.prevState = 'idle';
    this.clock = 0;            // match minutes
    this.half = 1;
    this.addedTime = 0;
    this.score = [0, 0];
    this.excitement = 0.15;
    this.time = 0;
    this.ballFreeTimer = 0;
    this.owner = null;
    this.lastTouch = null;
    this.lastTouchSide = -1;
    this.possessionSide = -1;
    this.controlled = null;
    this.setPiece = null;
    this.goalInfo = null;
    this.commentary = '';
    this.commentaryT = 0;
    this.matchOver = false;
    this.stats = [this._blankStats(), this._blankStats()];
    this.scorers = [];
    this.cards = [];
    this._eventsBuf = [];
    this._acc = 0;

    this._buildWorld();
    this._buildTeams();
    this.ball = new Ball(scene);
    this.particles = new Particles(scene, this.quality === 'low' ? 260 : 620);
    this._initReplay();
    this.resetMatch();
  }

  _blankStats() { return { shots: 0, onTarget: 0, passes: 0, passesOk: 0, tackles: 0, fouls: 0, corners: 0, saves: 0, possession: 0, xg: 0, offsides: 0 }; }
  on(ev, fn) { (this.listeners[ev] ||= []).push(fn); }
  emit(ev, data) { (this.listeners[ev] || []).forEach(f => f(data)); }

  // ---------------------------------------------------------------- world
  _buildWorld() {
    const st = this.st;
    this.sky = makeSky(st);
    this.scene.add(this.sky);
    this.scene.fog = new THREE.FogExp2(st.fog, st.fogDensity);

    this.stadium = buildStadium(this.scene, st, this.quality, null);

    // key light
    const sunDir = new THREE.Vector3(Math.cos(st.sunAz) * Math.cos(st.sunEl), Math.sin(st.sunEl), Math.sin(st.sunAz) * Math.cos(st.sunEl)).normalize();
    this.sunDir = sunDir;
    const key = new THREE.DirectionalLight(st.sun, st.sunI);
    key.position.copy(sunDir).multiplyScalar(80);
    this.key = key;
    this.scene.add(key);
    this.scene.add(key.target);
    const q = this.renderer.q;
    if (q.shadow > 0) {
      key.castShadow = true;
      key.shadow.mapSize.set(q.shadow, q.shadow);
      const S = 30;
      key.shadow.camera.left = -S; key.shadow.camera.right = S;
      key.shadow.camera.top = S; key.shadow.camera.bottom = -S;
      key.shadow.camera.near = 1; key.shadow.camera.far = 190;
      key.shadow.bias = -0.0009;
      key.shadow.normalBias = 0.035;
      key.shadow.radius = q.shadow >= 2048 ? 2.4 : 1.4;
    }
    const hemi = new THREE.HemisphereLight(st.skyHorizon, new THREE.Color(st.grassDark).multiplyScalar(0.6), st.ambientI);
    this.scene.add(hemi);
    this.hemi = hemi;
    const amb = new THREE.AmbientLight(st.ambient, st.ambientI * 0.45);
    this.scene.add(amb);
    // floodlight fill (opposite side, no shadows)
    const fill = new THREE.DirectionalLight(st.night ? 0xbcd4ff : 0xffe8cc, st.sunI * 0.42);
    fill.position.set(-sunDir.x * 60, 55, -sunDir.z * 60 - 20);
    this.scene.add(fill);
    const rim = new THREE.DirectionalLight(st.night ? 0x88b0ff : 0xffd8b0, st.sunI * 0.30);
    rim.position.set(0, 30, -70);
    this.scene.add(rim);

    // environment from the sky (baked once)
    try {
      const pmrem = new THREE.PMREMGenerator(this.renderer.renderer);
      pmrem.compileEquirectangularShader();
      const envScene = new THREE.Scene();
      const skyClone = makeSky(st);
      envScene.add(skyClone);
      const rt = pmrem.fromScene(envScene, 0.04);
      this.scene.environment = rt.texture;
      this.envRT = rt;
      pmrem.dispose();
      skyClone.geometry.dispose(); skyClone.material.dispose();
    } catch (e) { console.warn('env bake failed', e); }
    this.renderer.setExposure(st.exposure);
  }

  // ---------------------------------------------------------------- teams
  _buildTeams() {
    const home = TEAMS[this.cfg.home], away = TEAMS[this.cfg.away];
    let awayKit = away.kit;
    if (colorDist(home.kit.shirt, away.kit.shirt) < 150) awayKit = away.away;
    if (colorDist(home.kit.shirt, awayKit.shirt) < 110) awayKit = away.away;
    this.teams = [];
    const defs = [
      { data: home, kit: home.kit, side: 0 },
      { data: away, kit: awayKit, side: 1 },
    ];
    for (const d of defs) {
      const atlas = makeKitAtlas(d.kit, d.data.pattern, d.data.short);
      const gkAtlas = makeKitAtlas(d.data.gk, 'plain', d.data.short);
      const numCol = luminance(d.kit.shirt) > 0.55 ? 0x14181c : 0xffffff;
      const numOut = luminance(d.kit.shirt) > 0.55 ? 0xffffff : 0x101418;
      const gkNumCol = luminance(d.data.gk.shirt) > 0.55 ? 0x14181c : 0xffffff;
      const { xi, bench, form } = pickXI(d.data);
      const team = {
        side: d.side, data: d.data, kit: d.kit, atlas, gkAtlas,
        attackDir: d.side === 0 ? 1 : -1,
        players: [], bench: [], form, presser: null, cover: null, subsUsed: 0,
      };
      xi.forEach((s, i) => {
        const isGK = s.norm[0] === 'GK';
        const p = new Player(this.scene, d.side, i, s.data, isGK ? gkAtlas : atlas, isGK,
          { number: isGK ? gkNumCol : numCol, numberOutline: isGK ? 0x101418 : numOut });
        p.formNorm = s.norm;
        p.slotRole = s.norm[0];
        team.players.push(p);
      });
      bench.forEach((bd, i) => {
        const isGK = bd.role === 'GK';
        const p = new Player(this.scene, d.side, 11 + i, bd, isGK ? gkAtlas : atlas, isGK,
          { number: isGK ? gkNumCol : numCol, numberOutline: isGK ? 0x101418 : numOut });
        p.formNorm = ['CM', 0, 0];
        p.slotRole = bd.role;
        p.onPitch = false;
        p.mesh.visible = false; p.shadow.visible = false;
        team.bench.push(p);
      });
      team.all = [...team.players, ...team.bench];
      this.teams.push(team);
    }
    this.allPlayers = [...this.teams[0].all, ...this.teams[1].all];
    this.onPitch = () => this.allPlayers.filter(p => p.onPitch && !p.sentOff);
  }

  dir(side) { return this.teams[side].attackDir; }
  ownGoal(side) { return -this.teams[side].attackDir * FIELD.halfL; }
  oppGoal(side) { return this.teams[side].attackDir * FIELD.halfL; }

  offsideLine(side) {
    const ad = this.dir(side);
    const opp = this.teams[1 - side].players.filter(p => p.onPitch && !p.sentOff);
    const xs = opp.map(p => p.pos.x * ad).sort((a, b) => b - a);
    const second = xs.length > 1 ? xs[1] : xs[0] ?? FIELD.halfL;
    return Math.max(second, 0);
  }

  // ---------------------------------------------------------------- reset
  resetMatch() {
    this.clock = 0; this.half = 1; this.score = [0, 0]; this.matchOver = false;
    this.stats = [this._blankStats(), this._blankStats()];
    this.scorers = []; this.cards = [];
    this.teams[0].attackDir = 1; this.teams[1].attackDir = -1;
    for (const p of this.allPlayers) { p.yellow = 0; p.sentOff = false; p.stamina = 100; p.action = null; p.downT = 0; }
    this.addedTime = 1 + Math.floor(Math.random() * 2);
    this.kickoff(0);
    this.say(pick(COMMENTARY.kickoff).replace('{stadium}', this.st.name).replace('{home}', this.teams[0].data.name));
  }

  kickoff(side) {
    this.state = 'kickoff';
    this.owner = null; this.lastTouch = null; this.possessionSide = side;
    this.ball.reset(0, 0);
    this.setPiece = null;
    for (const t of this.teams) {
      const ad = t.attackDir;
      for (const p of t.players) {
        if (!p.onPitch) continue;
        const n = p.formNorm;
        let x = n[1] * FIELD.halfL * 0.86 * ad;
        let z = n[2] * FIELD.halfW * 0.86 * (t.side === 0 ? 1 : -1);
        // both teams in their own half
        x = clamp(x * ad, -FIELD.halfL + 3, -1.6) * ad;
        if (p.isGK) x = this.ownGoal(t.side) + ad * 2.2;
        p.setPos(x, z, ad > 0 ? Math.PI / 2 : -Math.PI / 2);
        p.animState = 'idle'; p.action = null; p.downT = 0;
        p.stamina = Math.min(100, p.stamina + 12);
      }
    }
    // kicking team: two players at the centre
    const kt = this.teams[side];
    const taker = kt.players.find(p => p.slotRole === 'ST') || kt.players[9];
    const helper = kt.players.find(p => p.slotRole === 'CAM' || p.slotRole === 'CM') || kt.players[7];
    taker.setPos(-kt.attackDir * 0.7, 0.35, kt.attackDir > 0 ? Math.PI / 2 : -Math.PI / 2);
    helper.setPos(-kt.attackDir * 3.2, -2.6, kt.attackDir > 0 ? Math.PI / 2 : -Math.PI / 2);
    this.setPiece = { kind: 'kickoff', side, taker, timer: 1.5, taken: false, x: 0, z: 0 };
    this.state = 'setpiece';
    this.autoPickControlled();
    this.emit('kickoff', { side });
  }

  // ---------------------------------------------------------------- commentary
  say(text) { this.commentary = text; this.commentaryT = 4.2; this.emit('commentary', text); }
  fmt(tpl, o) {
    return tpl.replace(/\{(\w+)\}/g, (_, k) => o[k] ?? '');
  }

  // ---------------------------------------------------------------- actions
  canTouch(p) {
    return p.onPitch && !p.sentOff && p.downT <= 0 && !p.busy && p.touchCd <= 0;
  }

  releaseBall(p, vel, spin, heightBoost = 0) {
    this.owner = null;
    this.ball.vel.copy(vel);
    this.ball.spin.copy(spin || new THREE.Vector3());
    if (heightBoost) this.ball.pos.y = Math.max(this.ball.pos.y, BALL_R + heightBoost);
    this.ballFreeTimer = 0.16;
    this.lastTouch = p; this.lastTouchSide = p.side;
    p.touchCd = 0.30;
    p.lastTouch = this.time;
    for (const q of this.onPitch()) if (q !== p && q.side === p.side) q.touchCd = Math.max(q.touchCd, 0.06);
  }

  kickTo(p, target, speed, loft = 0, curl = 0) {
    const from = this.ball.pos;
    const dx = target.x - from.x, dz = target.z - from.z;
    const d = Math.hypot(dx, dz) || 1;
    const v = new THREE.Vector3();
    if (loft > 0) {
      const t = d / Math.max(6, speed);
      v.set(dx / t, 0.5 * 9.81 * t + loft, dz / t);
      const hs = Math.hypot(v.x, v.z);
      const scale = speed / Math.max(1, hs);
      v.x *= scale; v.z *= scale;
    } else {
      v.set(dx / d * speed, 0, dz / d * speed);
    }
    const spin = new THREE.Vector3(0, curl, 0);
    this.releaseBall(p, v, spin, loft > 0 ? 0.04 : 0);
    return v;
  }

  doPass(p, target, mode = 'normal') {
    if (!p.canAct || this.owner !== p) return false;
    const lead = mode === 'through' ? 1.0 : 0.42;
    const tp = new THREE.Vector3(
      target.pos.x + target.vel.x * lead, 0,
      target.pos.z + target.vel.z * lead
    );
    if (mode === 'through') {
      const ad = this.dir(p.side);
      tp.x += ad * 7.5;
      tp.x = clamp(tp.x, -FIELD.halfL + 2, FIELD.halfL - 2);
    }
    const d = dst(this.ball.pos, tp);
    const acc = (0.55 + p.data.pass / 200) * (this.controlled === p ? 1 : this.diff.accuracy);
    const err = (1 - acc) * d * 0.10;
    tp.x += (Math.random() - 0.5) * err;
    tp.z += (Math.random() - 0.5) * err * 1.4;
    const long = mode === 'long' || mode === 'cross' || d > 26;
    const speed = long ? clamp(d * 0.95, 14, 27) : clamp(d * 1.5, 8, 23);
    const curl = (Math.random() - 0.5) * (long ? 14 : 5);
    this.kickTo(p, tp, speed, long ? clamp(d * 0.10, 1.2, 5.5) : 0, curl);
    p.startAction(long ? 'cross' : 'pass', long ? 0.48 : 0.34, { foot: Math.random() < 0.5 ? 'R' : 'L' });
    this.audio.pass();
    this.particles.turf(this.ball.pos.x, 0, this.ball.pos.z, this.ball.vel.x * 0.05, this.ball.vel.z * 0.05, 0.4);
    this.stats[p.side].passes++;
    this.pendingPass = { from: p, to: target, t: this.time };
    this.checkOffside(p, target);
    this.emit('pass', { p, target, mode });
    return true;
  }

  doCross(p) {
    if (!p.canAct || this.owner !== p) return false;
    const ad = this.dir(p.side);
    const gx = this.oppGoal(p.side);
    // aim at the far-post area / a teammate in the box
    let target = new THREE.Vector3(gx - ad * 9, 0, -Math.sign(p.pos.z || 1) * 3.5);
    let best = null, bv = -1;
    for (const t of this.teams[p.side].players) {
      if (t === p || !t.onPitch || t.sentOff) continue;
      if (Math.abs(t.pos.x - gx) > 18) continue;
      const v = 10 - Math.abs(t.pos.z) * 0.3 - dst(t.pos, p.pos) * 0.05;
      if (v > bv) { bv = v; best = t; }
    }
    if (best) target.set(best.pos.x + best.vel.x * 0.6, 0, best.pos.z + best.vel.z * 0.6);
    const d = dst(this.ball.pos, target);
    this.kickTo(p, target, clamp(d * 0.92, 15, 26), clamp(d * 0.13, 2, 6), -Math.sign(p.pos.z || 1) * 16);
    p.startAction('cross', 0.5, { foot: 'R' });
    this.audio.kick(0.8);
    this.particles.turf(this.ball.pos.x, 0, this.ball.pos.z, 0, 0, 0.7);
    this.stats[p.side].passes++;
    this.emit('cross', { p });
    return true;
  }

  doClear(p) {
    if (!p.canAct || this.owner !== p) return false;
    const ad = this.dir(p.side);
    const target = new THREE.Vector3(clamp(p.pos.x + ad * 42, -FIELD.halfL + 6, FIELD.halfL - 6), 0, clamp(p.pos.z * 1.6 + (Math.random() - 0.5) * 20, -FIELD.halfW + 3, FIELD.halfW - 3));
    this.kickTo(p, target, 24, 5.5, (Math.random() - 0.5) * 10);
    p.startAction('clear', 0.5, { foot: 'R' });
    this.audio.kick(0.95);
    this.particles.turf(this.ball.pos.x, 0, this.ball.pos.z, 0, 0, 0.9);
    this.stats[p.side].passes++;
    return true;
  }

  doShoot(p, power = 0.8, aim = 0) {
    if (!p.canAct || this.owner !== p) return false;
    const gx = this.oppGoal(p.side);
    const gk = this.teams[1 - p.side].players.find(q => q.isGK && q.onPitch);
    // aim away from the keeper
    let zTarget = aim * (FIELD.goalW / 2 - 0.5);
    if (gk && Math.abs(aim) < 0.15) zTarget = -Math.sign(gk.pos.z || (Math.random() - 0.5)) * (FIELD.goalW / 2 - 1.1);
    const d = Math.hypot(gx - this.ball.pos.x, zTarget - this.ball.pos.z);
    const pressure = clamp(3.2 - nearestOpponentDist(this, p), 0, 3) / 3;
    const skill = p.data.shoot / 100;
    const acc = clamp(skill * (this.controlled === p ? 0.94 : this.diff.accuracy) - pressure * 0.30, 0.12, 0.99);
    const sigma = (1 - acc) * (0.9 + d / 26);
    zTarget += (Math.random() - 0.5) * sigma * 3.4;
    let yTarget = 0.35 + power * 0.85 + (Math.random() - 0.5) * sigma * 1.5;
    yTarget = clamp(yTarget, 0.12, 3.4);
    const speed = 17 + power * 15 + skill * 3;
    const target = new THREE.Vector3(gx, yTarget, zTarget);
    const dx = target.x - this.ball.pos.x, dz = target.z - this.ball.pos.z;
    const dh = Math.hypot(dx, dz) || 1;
    const t = dh / speed;
    const vy = (yTarget - this.ball.pos.y + 0.5 * 9.81 * t * t) / t * 1.10;
    const v = new THREE.Vector3(dx / t, vy, dz / t);
    const hs = Math.hypot(v.x, v.z);
    v.x *= speed / hs; v.z *= speed / hs;
    const curl = aim * 26 + (Math.random() - 0.5) * 8;
    this.releaseBall(p, v, new THREE.Vector3(0, curl, 0), 0.02);
    p.startAction('kick', 0.52, { foot: 'R' });
    this.audio.kick(clamp(power + 0.3, 0.4, 1));
    this.particles.turf(this.ball.pos.x, 0, this.ball.pos.z, v.x * 0.04, v.z * 0.04, 1.0);
    this.renderer.flash(0.04);
    this.stats[p.side].shots++;
    this.stats[p.side].xg += clamp(shotQuality(this, p) * 0.55, 0.02, 0.6);
    this.shotInfo = { p, t: this.time, onTarget: Math.abs(zTarget) < FIELD.goalW / 2 && yTarget < FIELD.goalH };
    if (this.shotInfo.onTarget) this.stats[p.side].onTarget++;
    this.excitement = Math.max(this.excitement, 0.62);
    this.emit('shot', { p, power });
    return true;
  }

  doSkill(p) {
    if (!p.canAct || this.owner !== p) return false;
    p.startAction('skill', 0.55, {});
    p.skillBoost = 0.9;
    this.audio.touch();
    this.emit('skill', { p });
    return true;
  }

  doTackle(p, slide = false) {
    if (!p.canAct || p.tackleCd > 0) return false;
    const carrier = this.owner;
    p.tackleCd = slide ? 1.5 : 0.65;
    if (slide) {
      p.startAction('slide', 0.85, {});
      this.audio.tackle();
      this.particles.dust(p.pos.x, 0, p.pos.z, 1.1);
      this.particles.turf(p.pos.x, 0, p.pos.z, Math.sin(p.facing), Math.cos(p.facing), 0.9);
    } else {
      p.startAction('tackle', 0.34, { foot: 'R' });
      this.audio.touch();
    }
    if (!carrier || carrier.side === p.side) return true;
    const d = dst(p.pos, carrier.pos);
    const reach = slide ? 2.7 : 1.85;
    if (d > reach) { if (slide) p.downT = 0.2; return true; }
    // resolve
    const defSkill = p.data.def / 100;
    const attSkill = carrier.data.dribble / 100;
    const facingOk = Math.abs(Math.cos(p.facing - Math.atan2(carrier.pos.x - p.pos.x, carrier.pos.z - p.pos.z)));
    let chance = clamp(0.34 + defSkill * 0.55 - attSkill * 0.34 + facingOk * 0.16 - (slide ? 0.06 : 0), 0.08, 0.94);
    if (carrier.skillBoost > 0) chance *= 0.35;
    if (Math.random() < chance) {
      this.owner = null;
      this.ballFreeTimer = 0.10;
      const dir = new THREE.Vector3(Math.sin(p.facing), 0, Math.cos(p.facing));
      this.ball.vel.set(dir.x * 5 + (Math.random() - 0.5) * 3, 0.8, dir.z * 5 + (Math.random() - 0.5) * 3);
      this.ball.pos.y = BALL_R + 0.03;
      carrier.touchCd = 0.55;
      carrier.startAction('stumble', 0.45, {});
      p.touchCd = 0.10;
      this.lastTouch = p; this.lastTouchSide = p.side;
      this.stats[p.side].tackles++;
      this.audio.tackle();
      this.particles.turf(this.ball.pos.x, 0, this.ball.pos.z, dir.x, dir.z, 0.7);
      this.say(pick(COMMENTARY.tackle));
      this.emit('tackle', { p, carrier, clean: true });
    } else {
      // foul
      const foulChance = slide ? 0.72 : 0.24;
      if (Math.random() < foulChance) {
        this.foul(p, carrier, slide);
      } else {
        carrier.skillBoost = 0.4;
      }
    }
    return true;
  }

  foul(offender, victim, slide) {
    const side = victim.side;
    const x = victim.pos.x, z = victim.pos.z;
    this.stats[offender.side].fouls++;
    victim.startAction('stumble', 0.7, {});
    victim.downT = 0.5;
    this.audio.whistle();
    this.excitement = Math.max(this.excitement, 0.45);
    let card = null;
    const inBox = Math.abs(x - this.ownGoal(side)) < FIELD.penDepth && Math.abs(z) < FIELD.penHalfW;
    const risky = slide && dst(offender.pos, victim.pos) > 1.6;
    if ((risky && Math.random() < 0.55) || (offender.yellow === 0 && Math.random() < 0.12)) {
      offender.yellow++;
      card = 'yellow';
      this.cards.push({ side: offender.side, name: offender.name, minute: Math.floor(this.clock), type: 'yellow' });
      if (offender.yellow >= 2) {
        offender.sentOff = true; offender.onPitch = false;
        offender.mesh.visible = false; offender.shadow.visible = false;
        this.cards.push({ side: offender.side, name: offender.name, minute: Math.floor(this.clock), type: 'red' });
        this.say(`${offender.name} is sent off! Second booking.`);
      } else this.say(pick(COMMENTARY.yellow));
    } else this.say(pick(COMMENTARY.foul));
    this.emit('foul', { offender, victim, card });
    if (inBox && !this.isSetPieceKind('penalty')) {
      this.penalty(side);
    } else {
      this.startSetPiece('free', side, x, z);
    }
  }

  isSetPieceKind(k) { return this.setPiece && this.setPiece.kind === k; }

  checkOffside(p, target) {
    const ad = this.dir(p.side);
    const line = this.offsideLine(p.side);
    const tx = target.pos.x * ad;
    if (tx > line + 0.35 && tx > this.ball.pos.x * ad + 0.2 && tx > 0) {
      this.stats[p.side].offsides++;
      this.pendingOffside = { t: this.time + 0.75, side: p.side, x: target.pos.x, z: target.pos.z, player: target };
    }
  }

  // ---------------------------------------------------------------- set pieces
  startSetPiece(kind, side, x, z) {
    this.state = 'setpiece';
    this.owner = null;
    this.ball.reset(x, z);
    this.ball.vel.set(0, 0, 0);
    const team = this.teams[side];
    let taker = null, bd = 1e9;
    for (const p of team.players) {
      if (!p.onPitch || p.sentOff) continue;
      if (kind === 'goalkick' && !p.isGK) continue;
      if (kind !== 'goalkick' && p.isGK) continue;
      const d = Math.hypot(p.pos.x - x, p.pos.z - z);
      if (d < bd) { bd = d; taker = p; }
    }
    if (!taker) taker = team.players.find(p => p.onPitch && !p.sentOff && !p.isGK) || team.players[0];
    const ad = this.dir(side);
    // place taker behind the ball
    let bx = x - ad * 1.4, bz = z;
    if (kind === 'throwin') { bx = x; bz = z + Math.sign(z) * 0.9; }
    if (kind === 'corner') { bx = x - ad * 1.1; bz = z - Math.sign(z) * 1.1; }
    taker.setPos(clamp(bx, -FIELD.halfL - 1.5, FIELD.halfL + 1.5), clamp(bz, -FIELD.halfW - 1.5, FIELD.halfW + 1.5), Math.atan2(x - bx, z - bz));
    taker.action = null; taker.downT = 0;
    this.setPiece = { kind, side, taker, timer: kind === 'penalty' ? 2.4 : 1.9, taken: false, x, z, maxWait: 5.0 };

    // arrange the rest
    const opp = this.teams[1 - side];
    const gx = this.oppGoal(side);
    if (kind === 'corner' || (kind === 'free' && Math.abs(x - gx) < 34)) {
      // attackers into the box, defenders mark
      const att = team.players.filter(p => p.onPitch && !p.sentOff && p !== taker && !p.isGK);
      att.forEach((p, i) => {
        if (i < 5) {
          const px = gx - ad * (5 + (i % 3) * 3.4);
          const pz = -7 + i * 3.4;
          p.setPos(px, pz, Math.atan2(x - px, z - pz));
        }
      });
      opp.players.filter(p => p.onPitch && !p.sentOff && !p.isGK).forEach((p, i) => {
        if (i < 5) {
          const px = gx - ad * (4 + (i % 3) * 3.2);
          const pz = -6.2 + i * 3.3;
          p.setPos(px, pz, Math.atan2(x - px, z - pz));
        }
      });
      // wall for a dangerous free kick
      if (kind === 'free' && Math.abs(x - gx) < 27 && Math.abs(z) < 16) {
        const wall = opp.players.filter(p => p.onPitch && !p.sentOff && !p.isGK).slice(5, 9);
        const dx = gx - x, dz = -z;
        const dl = Math.hypot(dx, dz) || 1;
        const nx = dx / dl, nz = dz / dl;
        wall.forEach((p, i) => {
          const off = (i - (wall.length - 1) / 2) * 0.72;
          p.setPos(x + nx * 9.15 - nz * off, z + nz * 9.15 + nx * off, Math.atan2(x - p.pos.x, z - p.pos.z));
          p.animState = 'idle';
        });
        this.setPiece.wall = wall;
      }
    } else if (kind === 'throwin') {
      team.players.filter(p => p.onPitch && !p.sentOff && p !== taker).forEach((p, i) => {
        if (i < 3) p.setPos(clamp(x + (i - 1) * 6, -48, 48), z * 0.72 - Math.sign(z) * 5, 0);
      });
    }
    if (kind === 'penalty') {
      const gk = opp.players.find(p => p.isGK && p.onPitch);
      if (gk) gk.setPos(gx, 0, Math.atan2(x - gx, z));
      for (const p of [...team.players, ...opp.players]) {
        if (!p.onPitch || p.sentOff || p === taker || p.isGK) continue;
        const px = gx - ad * (19 + Math.random() * 5);
        p.setPos(px, -12 + Math.random() * 24, 0);
      }
    }
    this.autoPickControlled();
    this.emit('setpiece', { kind, side });
  }

  penalty(side) {
    const gx = this.oppGoal(side);
    const ad = this.dir(side);
    this.startSetPiece('penalty', side, gx - ad * FIELD.penSpot, 0);
    this.say('Penalty! A huge chance.');
    this.excitement = 0.9;
    this.audio.crowdSwell(0.7, 2.2);
  }

  executeSetPiece(userAction = null) {
    const sp = this.setPiece;
    if (!sp || sp.taken) return;
    sp.taken = true;
    const p = sp.taker;
    this.owner = p;
    this.ball.pos.set(sp.x, BALL_R, sp.z);
    this.lastTouch = p; this.lastTouchSide = p.side;
    const kind = sp.kind;
    if (kind === 'kickoff') {
      const t = bestPass(this, p, 'safe', null) || this.teams[p.side].players.find(q => q !== p && q.onPitch && !q.isGK);
      this.state = 'play';
      this.setPiece = null;
      this.audio.whistle();
      if (t) this.doPass(p, t, 'normal');
      return;
    }
    this.state = 'play';
    this.setPiece = null;
    if (userAction === 'shoot' && (kind === 'free' || kind === 'penalty')) {
      this.doShoot(p, userAction.power ?? 0.85, userAction.aim ?? 0);
      return;
    }
    if (userAction === 'pass') {
      const t = bestPass(this, p, 'normal', userAction.aim ?? null);
      if (t) { this.doPass(p, t, 'normal'); return; }
    }
    if (kind === 'penalty') { this.doShoot(p, 0.88, (Math.random() - 0.5) * 1.4); return; }
    if (kind === 'corner') { this.doCross(p); this.stats[p.side].corners++; return; }
    if (kind === 'goalkick') {
      const t = bestPass(this, p, 'long', null);
      if (t) this.doPass(p, t, 'long'); else this.doClear(p);
      return;
    }
    if (kind === 'throwin') {
      const t = bestPass(this, p, 'normal', null) || bestPass(this, p, 'safe', null);
      p.startAction('catch', 0.4, {});
      if (t) this.doPass(p, t, dst(t.pos, p.pos) > 16 ? 'long' : 'normal');
      else this.doClear(p);
      return;
    }
    // free kick
    const gx = this.oppGoal(p.side);
    const d = Math.hypot(gx - sp.x, sp.z);
    if (d < 28 && Math.abs(sp.z) < 18) { this.doShoot(p, clamp(0.6 + d / 50, 0.6, 1), (Math.random() - 0.5) * 1.2); return; }
    const t = bestPass(this, p, 'long', null) || bestPass(this, p, 'normal', null);
    if (t) this.doPass(p, t, 'long'); else this.doClear(p);
  }

  // ---------------------------------------------------------------- possession
  tryGainPossession() {
    if (this.ballFreeTimer > 0 || this.owner) return;
    const b = this.ball;
    if (b.pos.y > 1.85) return;
    const speed = b.vel.length();
    let best = null, bestD = 1e9;
    for (const p of this.onPitch()) {
      if (!this.canTouch(p)) continue;
      const d = dst(p.pos, b.pos);
      const reach = p.isGK ? 1.35 : (1.02 + p.control * 0.28);
      const heightOk = b.pos.y < (p.isGK ? 2.3 : 1.35);
      if (d < reach && heightOk && d < bestD) { bestD = d; best = p; }
    }
    if (!best) return;
    // first touch quality
    const skill = best.data.dribble / 100;
    const hard = clamp((speed - 9) / 16, 0, 1) * (1 - skill * 0.7);
    if (Math.random() < hard * 0.7) {
      // heavy touch — ball squirts away
      const a = Math.random() * Math.PI * 2;
      b.vel.set(Math.cos(a) * speed * 0.35, 1.2, Math.sin(a) * speed * 0.35);
      best.touchCd = 0.28;
      this.ballFreeTimer = 0.10;
      this.lastTouch = best; this.lastTouchSide = best.side;
      this.audio.touch();
      return;
    }
    this.owner = best;
    this.possessionSide = best.side;
    this.lastTouch = best; this.lastTouchSide = best.side;
    best.touchCd = 0.05;
    b.vel.multiplyScalar(0.2);
    b.spin.multiplyScalar(0.2);
    this.audio.touch();
    if (this.pendingPass && this.pendingPass.from.side === best.side && best !== this.pendingPass.from) {
      this.stats[best.side].passesOk++;
      this.pendingPass = null;
    }
    if (best.isGK) {
      best.startAction('catch', 0.5, {});
      best.aiTimer = 1.1 + Math.random() * 0.7;
      if (this.shotInfo && this.shotInfo.p.side !== best.side) {
        this.stats[best.side].saves++;
        this.say(this.fmt(pick(COMMENTARY.save), { keeper: best.name }));
        this.emit('save', { keeper: best });
        this.excitement = Math.max(this.excitement, 0.6);
      }
    }
    if (best.side === this.userTeam) this.controlled = best;
    this.emit('possession', { p: best });
  }

  dribble(dt) {
    const p = this.owner;
    if (!p) return;
    const b = this.ball;
    const fx = Math.sin(p.facing), fz = Math.cos(p.facing);
    const ahead = 0.52 + clamp(p.speed / 9, 0, 1) * 0.55;
    const tx = p.pos.x + fx * ahead, tz = p.pos.z + fz * ahead;
    const k = 11;
    b.vel.x = (tx - b.pos.x) * k + p.vel.x * 0.35;
    b.vel.z = (tz - b.pos.z) * k + p.vel.z * 0.35;
    b.pos.x += b.vel.x * dt;
    b.pos.z += b.vel.z * dt;
    b.pos.y = BALL_R + Math.abs(Math.sin(p.runPhase * Math.PI * 2)) * 0.012;
    b.spin.set(b.vel.z / BALL_R * 0.4, 0, -b.vel.x / BALL_R * 0.4);
    // touch sound synced with gait
    const ph = p.runPhase % 0.5;
    if (p.speed > 2.5 && ph < 0.045 && this.time - (p._lastTouchSfx || 0) > 0.22) {
      p._lastTouchSfx = this.time;
      this.audio.touch();
    }
    if (p.skillBoost > 0) p.skillBoost -= dt;
    // keeper holds the ball
    if (p.isGK) { b.pos.set(p.pos.x + fx * 0.42, 1.05, p.pos.z + fz * 0.42); }
  }

  // ---------------------------------------------------------------- keeper saves
  keeperContact() {
    const b = this.ball;
    if (this.owner || this.ballFreeTimer > 0) return;
    for (const t of this.teams) {
      const gk = t.players.find(p => p.isGK && p.onPitch && !p.sentOff);
      if (!gk || gk.touchCd > 0) continue;
      const diving = gk.action && gk.action.type === 'dive';
      const reach = diving ? 1.55 : 1.05;
      const hy = diving ? 0.95 : 1.15;
      const d = Math.hypot(b.pos.x - gk.pos.x, b.pos.z - gk.pos.z);
      const dy = Math.abs(b.pos.y - hy);
      if (d < reach + BALL_R && dy < (diving ? 1.25 : 1.35)) {
        const speed = b.vel.length();
        const skill = this.diff.gkSkill * (0.65 + gk.ovr / 260);
        const catchChance = clamp(skill * (1 - clamp((speed - 10) / 26, 0, 0.8)) * (diving ? 0.72 : 1.0), 0.05, 0.96);
        if (speed < 26 && Math.random() < catchChance) {
          this.owner = gk; this.possessionSide = gk.side;
          this.lastTouch = gk; this.lastTouchSide = gk.side;
          gk.startAction('catch', 0.55, {});
          gk.aiTimer = 1.2 + Math.random() * 0.8;
          b.vel.set(0, 0, 0);
          this.audio.save();
          if (this.shotInfo && this.shotInfo.p.side !== gk.side) {
            this.stats[gk.side].saves++;
            this.say(this.fmt(pick(COMMENTARY.save), { keeper: gk.name }));
            this.emit('save', { keeper: gk });
          }
          this.excitement = Math.max(this.excitement, 0.62);
          this.shotInfo = null;
        } else {
          // parry
          const ad = this.dir(gk.side);
          const away = new THREE.Vector3(ad * 0.6 + (Math.random() - 0.5) * 0.8, 0.55 + Math.random() * 0.5, (Math.sign(b.pos.z - gk.pos.z) || (Math.random() - 0.5)) * (0.7 + Math.random() * 0.7));
          away.normalize().multiplyScalar(Math.max(7, speed * 0.48));
          b.vel.copy(away);
          b.spin.set((Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20, 0);
          gk.touchCd = 0.30;
          this.ballFreeTimer = 0.10;
          this.lastTouch = gk; this.lastTouchSide = gk.side;
          this.audio.save();
          this.particles.spray(b.pos.x, b.pos.y, b.pos.z, 7);
          if (this.shotInfo && this.shotInfo.p.side !== gk.side) {
            this.stats[gk.side].saves++;
            this.emit('save', { keeper: gk, parry: true });
            this.say(this.fmt(pick(COMMENTARY.save), { keeper: gk.name }));
          }
          this.excitement = Math.max(this.excitement, 0.7);
          this.renderer.shake?.(0.2);
        }
        return;
      }
    }
  }

  onKeeperDive(p) { this.emit('dive', { p }); }

  // ---------------------------------------------------------------- goals
  scoreGoal(side, z, y) {
    if (this.state === 'goal' || this.state === 'replay') return;
    // side = goal line side; the scoring team attacks that direction
    const scoring = this.teams[0].attackDir === Math.sign(side) ? 0 : 1;
    this.score[scoring]++;
    const scorer = this.lastTouch && this.lastTouch.side === scoring ? this.lastTouch : null;
    const ownGoal = this.lastTouch && this.lastTouch.side !== scoring;
    this.state = 'goal';
    this.goalInfo = { side: scoring, scorer, ownGoal, minute: Math.floor(this.clock), z, y, t: 0 };
    this.scorers.push({ side: scoring, name: scorer ? scorer.name : 'Unknown', minute: Math.floor(this.clock), own: !!ownGoal });
    this.owner = null;
    this.audio.goal();
    this.excitement = 1.0;
    this.renderer.flash(0.16);
    this.emit('goal', this.goalInfo);
    this.say(ownGoal ? `An own goal! ${this.teams[scoring].data.name} lead the celebrations.` :
      this.fmt(pick(COMMENTARY.goal), { scorer: scorer ? scorer.name : 'The striker', team: this.teams[scoring].data.name }));
    // celebration
    const team = this.teams[scoring];
    const cx = this.oppGoal(scoring) - this.dir(scoring) * 6;
    if (scorer) {
      scorer.startAction('celebrate', 5.5, { style: (Math.random() * 3) | 0 });
      scorer.celebrateTarget = { x: cx, z: Math.sign(z || 1) * 24 };
    }
    let i = 0;
    for (const p of team.players) {
      if (!p.onPitch || p === scorer || p.isGK) continue;
      if (i++ < 6) {
        p.startAction('celebrate', 4.6 + Math.random(), { style: (Math.random() * 3) | 0 });
        p.celebrateTarget = { x: cx + (Math.random() - 0.5) * 8, z: Math.sign(z || 1) * (20 + Math.random() * 6) };
      }
    }
    for (const p of this.teams[1 - scoring].players) {
      if (!p.onPitch) continue;
      p.animState = 'idle'; p.desired.set(0, 0, 0);
      if (Math.random() < 0.4) p.startAction('stumble', 1.2, {});
    }
    this.particles.confetti(cx, 3, Math.sign(z || 1) * 22, [team.kit.shirt, team.kit.trim, 0xffffff, team.kit.shirt2], this.quality === 'low' ? 40 : 110);
    this._replayPending = this.replaysEnabled;
    this.goalTimer = 0;
    this.audio.chant();
  }

  // ---------------------------------------------------------------- replay
  _initReplay() {
    this.REC_HZ = 20;
    this.REC_LEN = 130;   // 6.5 s
    this.PF = 12;
    this.recN = this.onPitch().length;
    this.recBuf = new Float32Array(this.REC_LEN * (7 + 22 * this.PF));
    this.recHead = 0; this.recCount = 0; this.recAcc = 0;
    this.replay = null;
  }

  record(dt) {
    this.recAcc += dt;
    const step = 1 / this.REC_HZ;
    if (this.recAcc < step) return;
    this.recAcc -= step;
    const players = this.onPitch();
    const stride = 7 + 22 * this.PF;
    const base = this.recHead * stride;
    const B = this.recBuf;
    B[base] = this.ball.pos.x; B[base + 1] = this.ball.pos.y; B[base + 2] = this.ball.pos.z;
    B[base + 3] = this.ball.quat.x; B[base + 4] = this.ball.quat.y; B[base + 5] = this.ball.quat.z; B[base + 6] = this.ball.quat.w;
    for (let i = 0; i < 22; i++) {
      const o = base + 7 + i * this.PF;
      const p = players[i];
      if (!p) { B[o] = 9999; continue; }
      B[o] = p.pos.x; B[o + 1] = p.pos.z; B[o + 2] = p.facing; B[o + 3] = p.runPhase;
      B[o + 4] = p.speed; B[o + 5] = STATE_CODE[p.animState] ?? 0;
      B[o + 6] = p.action ? (ACT_CODE[p.action.type] ?? 0) : 0;
      B[o + 7] = p.action ? p.action.t : 0;
      B[o + 8] = p.action ? p.action.dur : 1;
      B[o + 9] = p.action && p.action.foot === 'L' ? 1 : 0;
      B[o + 10] = p.action ? (p.action.dir ?? 1) : 1;
      B[o + 11] = p.action ? (p.action.style ?? 0) : 0;
    }
    this.recPlayers = players;
    this.recHead = (this.recHead + 1) % this.REC_LEN;
    this.recCount = Math.min(this.REC_LEN, this.recCount + 1);
  }

  startReplay() {
    if (this.recCount < 20) { this._replayPending = false; return; }
    const stride = 7 + 22 * this.PF;
    const frames = [];
    const start = (this.recHead - this.recCount + this.REC_LEN) % this.REC_LEN;
    const use = Math.min(this.recCount, 110);
    const from = (this.recHead - use + this.REC_LEN) % this.REC_LEN;
    for (let i = 0; i < use; i++) {
      const idx = ((from + i) % this.REC_LEN) * stride;
      frames.push(this.recBuf.subarray(idx, idx + stride));
    }
    this.replay = { frames, t: 0, players: this.recPlayers ? [...this.recPlayers] : this.onPitch(), speed: 0.55 };
    this.state = 'replay';
    const gx = this.goalInfo ? Math.sign(this.goalInfo.z || 1) : 1;
    this.emit('replayStart', {});
    void gx; void start;
  }

  updateReplay(dt) {
    const r = this.replay;
    if (!r) return false;
    r.t += dt * r.speed * 20;   // frames
    const i = Math.floor(r.t);
    if (i >= r.frames.length - 1) { this.endReplay(); return false; }
    const f = r.frames[i], f2 = r.frames[Math.min(r.frames.length - 1, i + 1)];
    const a = r.t - i;
    this.ball.pos.set(f[0] + (f2[0] - f[0]) * a, f[1] + (f2[1] - f[1]) * a, f[2] + (f2[2] - f[2]) * a);
    this.ball.quat.set(f[3], f[4], f[5], f[6]);
    this.ball.mesh.quaternion.copy(this.ball.quat);
    this.ball.mesh.position.copy(this.ball.pos);
    this.ball.shadow.position.set(this.ball.pos.x, 0.008, this.ball.pos.z);
    for (let k = 0; k < 22; k++) {
      const o = 7 + k * this.PF;
      const p = r.players[k];
      if (!p || f[o] === 9999) continue;
      p.pos.x = f[o] + (f2[o] - f[o]) * a;
      p.pos.z = f[o + 1] + (f2[o + 1] - f[o + 1]) * a;
      let df = f2[o + 2] - f[o + 2];
      while (df > Math.PI) df -= Math.PI * 2;
      while (df < -Math.PI) df += Math.PI * 2;
      p.facing = f[o + 2] + df * a;
      p.runPhase = f[o + 3];
      p.speed = f[o + 4];
      p.animState = CODE_STATE[f[o + 5]] || 'idle';
      const ac = CODE_ACT[f[o + 6]];
      p.action = ac === 'none' ? null : { type: ac, t: f[o + 7], dur: f[o + 8] || 1, foot: f[o + 9] ? 'L' : 'R', dir: f[o + 10], style: f[o + 11] };
      p.mesh.position.set(p.pos.x, 0, p.pos.z);
      p.mesh.rotation.y = p.facing;
      p.shadow.position.set(p.pos.x, 0.010, p.pos.z);
      posePlayer(p.bones, p, dt, this.time);
    }
    return true;
  }

  endReplay() {
    this.replay = null;
    this._replayPending = false;
    this.emit('replayEnd', {});
    const conceded = 1 - this.goalInfo.side;
    this.goalInfo = null;
    this.kickoff(conceded);
  }

  // ---------------------------------------------------------------- out of play
  handleEvents(evts) {
    for (const e of evts) {
      if (e.type === 'bounce') { this.audio.bounce(e.v); if (e.v > 0.35) this.particles.dust(e.x, 0, e.z, e.v * 0.5); }
      else if (e.type === 'post') {
        this.audio.post(); this.renderer.flash(0.05);
        this.say(pick(COMMENTARY.post));
        this.excitement = Math.max(this.excitement, 0.85);
        this.emit('post', {});
        this.shotInfo = null;
      } else if (e.type === 'net') { this.audio.net(); }
      else if (e.type === 'goal') {
        if (this.state === 'play') this.scoreGoal(e.side, e.z, e.y);
      } else if (e.type === 'sideline') {
        if (this.state !== 'play') continue;
        const side = 1 - this.lastTouchSide;
        const s = side < 0 ? 0 : side;
        this.audio.whistle();
        this.startSetPiece('throwin', s, clamp(e.x, -FIELD.halfL + 2, FIELD.halfL - 2), Math.sign(e.z) * (FIELD.halfW + 0.15));
        this.say('Throw-in.');
      } else if (e.type === 'byline') {
        if (this.state !== 'play') continue;
        const goalSide = e.side;                    // which goal line
        const defSide = this.teams[0].attackDir === -goalSide ? 0 : 1;
        this.audio.whistle();
        if (this.lastTouchSide === defSide) {
          // corner for the attackers
          const att = 1 - defSide;
          const ad = this.dir(att);
          const cx = this.oppGoal(att);
          const cz = Math.sign(e.z || 1) * (FIELD.halfW - 0.15);
          this.stats[att].corners++;
          this.startSetPiece('corner', att, cx - ad * 0.2, cz);
          this.say(pick(COMMENTARY.corner));
          void ad;
        } else {
          const gx = this.ownGoal(defSide);
          const ad = this.dir(defSide);
          this.startSetPiece('goalkick', defSide, gx + ad * 5.5, Math.sign(e.z || 1) * 6);
          this.say('Goal kick.');
        }
      }
    }
  }

  // ---------------------------------------------------------------- control
  autoPickControlled() {
    if (this.userTeam < 0) { this.controlled = null; return; }
    const t = this.teams[this.userTeam];
    if (this.owner && this.owner.side === this.userTeam) { this.controlled = this.owner; return; }
    if (this.setPiece && this.setPiece.side === this.userTeam) { this.controlled = this.setPiece.taker; return; }
    const bp = this.ball.pos;
    let best = null, bd = 1e9;
    for (const p of t.players) {
      if (!p.onPitch || p.sentOff || p.isGK) continue;
      const d = dst(p.pos, bp);
      if (d < bd) { bd = d; best = p; }
    }
    this.controlled = best || t.players[0];
  }

  manualSwitch() {
    if (this.userTeam < 0) return;
    const t = this.teams[this.userTeam];
    const bp = this.ball.pos;
    const list = t.players.filter(p => p.onPitch && !p.sentOff && !p.isGK).sort((a, b) => dst(a.pos, bp) - dst(b.pos, bp));
    if (!list.length) return;
    const i = list.indexOf(this.controlled);
    this.controlled = list[(i + 1) % Math.min(4, list.length)];
    this.emit('switch', { p: this.controlled });
  }

  applyInput(input, dt) {
    const p = this.controlled;
    if (!p || this.userTeam < 0) return;
    if (!p.onPitch || p.sentOff) { this.autoPickControlled(); return; }

    if (this.state === 'setpiece') {
      const sp = this.setPiece;
      if (sp && sp.side === this.userTeam && sp.taker === p) {
        if (input.take('shoot')) { this.executeSetPiece({ shoot: true, power: clamp(input.shootCharge || 0.7, 0.4, 1), aim: clamp(input.move.x * 1.2, -1, 1) }); return; }
        if (input.take('pass')) { this.executeSetPiece({ pass: true, aim: { x: input.move.x, z: input.move.z } }); return; }
      }
      input.clearEdges();
      return;
    }
    if (this.state !== 'play') { input.clearEdges(); return; }

    p.desired.set(input.move.x, 0, input.move.z);
    p.sprint = input.sprint;
    p.speedScale = 1;
    const haveBall = this.owner === p;
    if (haveBall) {
      if (input.take('shoot')) this.doShoot(p, clamp(input.shootCharge || 0.55, 0.32, 1), clamp(input.move.x * 0.9 + (Math.random() - 0.5) * 0.1, -1, 1));
      else if (input.take('pass')) {
        const aim = (input.move.x || input.move.z) ? { x: input.move.x, z: input.move.z } : null;
        const t = bestPass(this, p, 'normal', aim);
        if (t) this.doPass(p, t, dst(t.pos, p.pos) > 30 ? 'long' : 'normal');
        else this.doClear(p);
      } else if (input.take('through')) {
        const aim = (input.move.x || input.move.z) ? { x: input.move.x, z: input.move.z } : null;
        const t = bestPass(this, p, 'through', aim) || bestPass(this, p, 'normal', aim);
        if (t) this.doPass(p, t, 'through');
      } else if (input.take('skill')) this.doSkill(p);
      input.take('tackle'); input.take('slide'); input.take('switch');
    } else {
      if (input.take('tackle')) this.doTackle(p, false);
      else if (input.take('slide')) this.doTackle(p, true);
      else if (input.take('switch')) this.manualSwitch();
      input.take('shoot'); input.take('pass'); input.take('through'); input.take('skill');
      // pressing assist: chase the ball if no stick input
      if (!input.move.x && !input.move.z && this.owner && this.owner.side !== p.side) {
        const d = dst(p.pos, this.owner.pos);
        if (d > 1.2 && d < 16) {
          const dx = this.owner.pos.x - p.pos.x, dz = this.owner.pos.z - p.pos.z;
          p.desired.set(dx / d, 0, dz / d);
          p.speedScale = 0.92;
        }
      }
    }
  }

  // ---------------------------------------------------------------- halves
  halftime() {
    this.state = 'halftime';
    this.audio.whistle(true);
    this.say(this.fmt(pick(COMMENTARY.halftime), { stadium: this.st.name }));
    this.emit('halftime', {});
  }

  resumeSecondHalf() {
    this.half = 2;
    this.clock = 45;
    this.addedTime = 1 + Math.floor(Math.random() * 3);
    for (const t of this.teams) t.attackDir *= -1;
    for (const p of this.allPlayers) { p.stamina = Math.min(100, p.stamina + 30); p.action = null; p.downT = 0; }
    this.kickoff(1);
    this.emit('secondhalf', {});
  }

  fulltime() {
    this.state = 'fulltime';
    this.matchOver = true;
    this.audio.whistle(true);
    this.say(pick(COMMENTARY.fulltime));
    this.excitement = this.score[this.userTeam] > this.score[1 - this.userTeam] ? 1 : 0.3;
    if (this.userTeam >= 0 && this.score[this.userTeam] > this.score[1 - this.userTeam]) {
      const t = this.teams[this.userTeam];
      this.particles.confetti(0, 4, 0, [t.kit.shirt, t.kit.trim, 0xffffff], 130);
      this.audio.chant();
      for (const p of t.players) if (p.onPitch) p.startAction('celebrate', 6, { style: (Math.random() * 3) | 0 });
    }
    this.emit('fulltime', { score: this.score });
  }

  substitute(teamIdx, outP, inP) {
    const t = this.teams[teamIdx];
    if (t.subsUsed >= 5 || !outP.onPitch || inP.onPitch) return false;
    outP.onPitch = false; outP.mesh.visible = false; outP.shadow.visible = false;
    inP.onPitch = true; inP.mesh.visible = true; inP.shadow.visible = true;
    inP.formNorm = outP.formNorm;
    inP.slotRole = outP.slotRole;
    inP.setPos(outP.pos.x, outP.pos.z, outP.facing);
    inP.stamina = 100;
    // keep XI list order stable: swap references
    const oi = t.players.indexOf(outP), bi = t.bench.indexOf(inP);
    if (oi >= 0 && bi >= 0) { t.players[oi] = inP; t.bench[bi] = outP; }
    t.subsUsed++;
    if (this.controlled === outP) this.controlled = inP;
    this.emit('sub', { team: teamIdx, out: outP, in: inP });
    return true;
  }

  // ---------------------------------------------------------------- main tick
  update(dt, input, camRig) {
    this.time += dt;
    if (this.commentaryT > 0) this.commentaryT -= dt;
    if (this.ballFreeTimer > 0) this.ballFreeTimer -= dt;

    const paused = this.state === 'halftime' || this.state === 'fulltime' || this.state === 'paused';

    // ---- clock ----
    if (this.state === 'play' || this.state === 'setpiece') {
      const minsPerSec = 90 / (this.lengthCfg.minutes * 60);
      this.clock += dt * minsPerSec;
      const limit = this.half === 1 ? 45 : 90;
      if (this.clock >= limit + (this.half === 1 ? Math.min(this.addedTime, 1) : this.addedTime)) {
        if (this.half === 1) this.halftime();
        else this.fulltime();
      } else if (this.half === 1 && this.clock >= 45) {
        this.halftime();
      }
    }

    // ---- possession stats ----
    if (this.state === 'play' && this.possessionSide >= 0) this.stats[this.possessionSide].possession += dt;

    // ---- state machines ----
    if (this.state === 'goal') {
      this.goalTimer += dt;
      // celebration run
      for (const p of this.onPitch()) {
        if (p.action && p.action.type === 'celebrate' && p.celebrateTarget) {
          const dx = p.celebrateTarget.x - p.pos.x, dz = p.celebrateTarget.z - p.pos.z;
          const d = Math.hypot(dx, dz);
          if (d > 1.5) { p.desired.set(dx / d, 0, dz / d); p.speedScale = 0.72; p.sprint = false; }
          else { p.desired.set(0, 0, 0); p.celebrateTarget = null; }
        } else if (!p.action) { p.desired.set(0, 0, 0); }
      }
      this._eventsBuf.length = 0;
      stepBall(this.ball, dt, this._eventsBuf);
      for (const e of this._eventsBuf) if (e.type === 'net') this.audio.net();
      if (this.goalTimer > 4.2) {
        if (this._replayPending) {
          const f = this.goalInfo;
          this.startReplay();
          if (this.state === 'replay') {
            camRig.setCinematic('behindgoal', new THREE.Vector3(Math.sign(f.z || 1) * 0 + this.oppGoal(f.side), 1.2, f.z), Math.sign(this.oppGoal(f.side)));
            this._replayCamT = 0;
          } else this.endReplayFallback();
        } else this.endReplayFallback();
      }
    } else if (this.state === 'replay') {
      this._replayCamT = (this._replayCamT || 0) + dt;
      const f = this.goalInfo;
      if (f) {
        const focus = new THREE.Vector3(this.ball.pos.x, 1.2, this.ball.pos.z);
        if (this._replayCamT > 2.6 && this._replayCamKind !== 'low') { this._replayCamKind = 'low'; camRig.setCinematic('low', focus, Math.sign(this.oppGoal(f.side))); }
        else if (this._replayCamT > 5.0 && this._replayCamKind !== 'orbit') { this._replayCamKind = 'orbit'; camRig.setCinematic('orbit', focus, 1); }
        else if (this._replayCamKind === 'low' || this._replayCamKind === 'orbit') camRig.cinematic.focus.lerp(focus, Math.min(1, dt * 2));
      }
      if (!this.updateReplay(dt)) { camRig.clearCinematic(); this._replayCamKind = null; }
      this.particles.update(dt);
      this.stadium.update(dt, this.time, this.excitement);
      return;
    } else if (this.state === 'setpiece') {
      const sp = this.setPiece;
      sp.timer -= dt;
      sp.maxWait -= dt;
      updateAI(this, dt);
      // taker stays put
      if (sp.taker) { sp.taker.desired.set(0, 0, 0); sp.taker.speedScale = 1; }
      if (sp.wall) for (const w of sp.wall) w.desired.set(0, 0, 0);
      const userTaker = sp.side === this.userTeam && this.controlled === sp.taker;
      if ((!userTaker && sp.timer <= 0) || sp.maxWait <= 0) this.executeSetPiece();
      this.ball.pos.set(sp.x, BALL_R, sp.z);
      this.ball.vel.set(0, 0, 0);
    } else if (this.state === 'play') {
      updateAI(this, dt);
      if (this.owner) this.dribble(dt);
      else {
        this._eventsBuf.length = 0;
        stepBall(this.ball, dt, this._eventsBuf);
        this.handleEvents(this._eventsBuf);
        this.keeperContact();
        this.tryGainPossession();
      }
      // offside flag
      if (this.pendingOffside && this.time > this.pendingOffside.t) {
        const o = this.pendingOffside; this.pendingOffside = null;
        this.audio.whistle();
        this.say(pick(COMMENTARY.offside));
        this.startSetPiece('free', 1 - o.side, o.x, o.z);
      }
      // shot outcome commentary
      if (this.shotInfo && this.time - this.shotInfo.t > 2.6) {
        if (!this.shotInfo.onTarget) this.say(this.fmt(pick(COMMENTARY.miss), { scorer: this.shotInfo.p.name }));
        this.shotInfo = null;
      }
      // auto switch when possession changes
      if (this.userTeam >= 0) {
        if (this.owner && this.owner.side === this.userTeam && this.controlled !== this.owner) this.controlled = this.owner;
        else if ((!this.owner || this.owner.side !== this.userTeam) && this.controlled && this.controlled.isGK) this.autoPickControlled();
      }
      this.record(dt);
    }

    // ---- players ----
    const camPos = camRig ? camRig.pos : null;
    for (const p of this.allPlayers) {
      if (!p.onPitch || p.sentOff) continue;
      if (paused) { p.desired.set(0, 0, 0); }
      // separation
      p.update(dt, this.time, camPos, this.quality);
    }
    if (!paused) this.separate(dt);

    // ---- ball visuals ----
    if (this.state !== 'replay') this.ball.syncVisual(dt);

    // ---- excitement decay ----
    const targetExc = this.state === 'play' ? clamp(0.14 + (this.owner ? 0.12 : 0) + Math.max(0, 1 - Math.abs(this.ball.pos.x) / FIELD.halfL) * 0.22, 0, 0.6) : 0.2;
    this.excitement += (targetExc - this.excitement) * Math.min(1, dt * 0.55);

    this.particles.update(dt);
    this.stadium.update(dt, this.time, this.excitement);
    this.sky.material.uniforms.uTime.value = this.time;

    // ---- shadow camera follows play ----
    if (this.key.castShadow) {
      const cx = clamp(this.ball.pos.x, -FIELD.halfL + 8, FIELD.halfL - 8);
      const cz = clamp(this.ball.pos.z, -FIELD.halfW + 6, FIELD.halfW - 6);
      const texel = 60 / this.key.shadow.mapSize.x;
      const sx = Math.round(cx / texel) * texel, sz = Math.round(cz / texel) * texel;
      this.key.target.position.set(sx, 0, sz);
      this.key.position.set(sx + this.sunDir.x * 80, this.sunDir.y * 80 + 10, sz + this.sunDir.z * 80);
      this.key.target.updateMatrixWorld();
    }
    this.audio.update(dt, this.excitement);
    this.renderer.decayFlash(dt);
  }

  endReplayFallback() {
    const conceded = this.goalInfo ? 1 - this.goalInfo.side : 0;
    this.goalInfo = null;
    this._replayPending = false;
    this.kickoff(conceded);
  }

  separate(dt) {
    const list = this.onPitch();
    const R = 0.62;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
        const d2 = dx * dx + dz * dz;
        const min = (a.busy || b.busy) ? R * 0.8 : R * 1.55;
        if (d2 > min * min || d2 < 1e-6) continue;
        const d = Math.sqrt(d2);
        const push = (min - d) * 0.5;
        const nx = dx / d, nz = dz / d;
        const aw = a.busy ? 0.15 : 1, bw = b.busy ? 0.15 : 1;
        a.pos.x -= nx * push * aw; a.pos.z -= nz * push * aw;
        b.pos.x += nx * push * bw; b.pos.z += nz * push * bw;
      }
    }
    for (const p of list) {
      p.pos.x = clamp(p.pos.x, -FIELD.halfL - 3.5, FIELD.halfL + 3.5);
      p.pos.z = clamp(p.pos.z, -FIELD.halfW - 3.5, FIELD.halfW + 3.5);
    }
    void dt;
  }

  possessionPct() {
    const a = this.stats[0].possession, b = this.stats[1].possession;
    const t = a + b;
    if (t < 0.5) return [50, 50];
    const pa = Math.round(a / t * 100);
    return [pa, 100 - pa];
  }

  dispose() {
    for (const p of this.allPlayers) p.dispose(this.scene);
    for (const t of this.teams) { t.atlas.dispose(); t.gkAtlas.dispose(); }
    this.stadium.dispose();
    this.scene.remove(this.sky);
    this.sky.geometry.dispose(); this.sky.material.dispose();
    if (this.envRT) this.envRT.dispose();
  }
}
