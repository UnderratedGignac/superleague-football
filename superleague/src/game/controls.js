// ============================================================================
//  Input: floating touch stick + action cluster (landscape phone), keyboard
// ============================================================================
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

export class Controls {
  constructor(root) {
    this.root = root;
    this.stick = { active: false, id: -1, ox: 0, oy: 0, x: 0, y: 0 };
    this.move = { x: 0, z: 0 };
    this.raw = { x: 0, y: 0 };
    this.sprint = false;
    this.shootHeld = false; this.shootCharge = 0;
    this.edges = { pass: false, through: false, tackle: false, slide: false, switch: false, skill: false, shoot: false };
    this.keys = new Set();
    this.enabled = true;
    this.haptics = true;
    this.onAction = null;
    this._bindStick();
    this._bindButtons();
    this._bindKeys();
  }

  buzz(ms) { if (this.haptics && navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) { void e; } } }

  _bindStick() {
    const zone = this.root.querySelector('#stickZone');
    const base = this.root.querySelector('#stickBase');
    const knob = this.root.querySelector('#stickKnob');
    this.base = base; this.knob = knob;
    const R = 52;
    const start = (e) => {
      if (!this.enabled) return;
      const t = e.changedTouches ? e.changedTouches[0] : e;
      if (this.stick.active) return;
      this.stick.active = true; this.stick.id = t.identifier ?? 'mouse';
      const r = zone.getBoundingClientRect();
      this.stick.ox = t.clientX; this.stick.oy = t.clientY;
      base.style.left = (t.clientX - r.left) + 'px';
      base.style.top = (t.clientY - r.top) + 'px';
      base.classList.add('on');
      knob.style.transform = 'translate(-50%,-50%)';
      e.preventDefault();
    };
    const move = (e) => {
      if (!this.stick.active || !this.enabled) return;
      let t = null;
      if (e.changedTouches) { for (const c of e.changedTouches) if (c.identifier === this.stick.id) t = c; }
      else t = e;
      if (!t) return;
      let dx = t.clientX - this.stick.ox, dy = t.clientY - this.stick.oy;
      const d = Math.hypot(dx, dy);
      if (d > R) { dx = dx / d * R; dy = dy / d * R; }
      knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      this.raw.x = dx / R; this.raw.y = dy / R;
      e.preventDefault();
    };
    const end = (e) => {
      if (!this.stick.active) return;
      if (e.changedTouches) {
        let found = false;
        for (const c of e.changedTouches) if (c.identifier === this.stick.id) found = true;
        if (!found) return;
      }
      this.stick.active = false; this.stick.id = -1;
      this.raw.x = 0; this.raw.y = 0;
      base.classList.remove('on');
      knob.style.transform = 'translate(-50%,-50%)';
    };
    zone.addEventListener('touchstart', start, { passive: false });
    zone.addEventListener('touchmove', move, { passive: false });
    zone.addEventListener('touchend', end);
    zone.addEventListener('touchcancel', end);
    zone.addEventListener('mousedown', start);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', end);
  }

  _bindButtons() {
    const map = { btnA: 'pass', btnB: 'shoot', btnC: 'through', btnD: 'sprint', btnE: 'skill' };
    this.btnEls = {};
    for (const [id, act] of Object.entries(map)) {
      const el = this.root.querySelector('#' + id);
      if (!el) continue;
      this.btnEls[id] = el;
      const down = (e) => {
        if (!this.enabled) return;
        el.classList.add('down');
        this.buzz(12);
        if (act === 'sprint') this.sprint = true;
        else if (act === 'shoot') { this.shootHeld = true; this.shootCharge = 0; }
        else this._fire(act);
        e.preventDefault(); e.stopPropagation();
      };
      const up = (e) => {
        el.classList.remove('down');
        if (act === 'sprint') this.sprint = false;
        else if (act === 'shoot') {
          if (this.shootHeld) { this.edges.shoot = true; this.shootHeld = false; }
        }
        e.preventDefault(); e.stopPropagation();
      };
      el.addEventListener('touchstart', down, { passive: false });
      el.addEventListener('touchend', up);
      el.addEventListener('touchcancel', up);
      el.addEventListener('mousedown', down);
      el.addEventListener('mouseup', up);
      el.addEventListener('mouseleave', (e) => { if (el.classList.contains('down')) up(e); });
    }
  }

  _fire(act) {
    // contextual remap when out of possession
    const defending = this.defending;
    if (act === 'pass') this.edges[defending ? 'switch' : 'pass'] = true;
    else if (act === 'through') this.edges[defending ? 'slide' : 'through'] = true;
    else if (act === 'skill') this.edges.skill = true;
    if (this.onAction) this.onAction(act);
  }

  _bindKeys() {
    const down = (e) => {
      const k = e.key.toLowerCase();
      if (this.keys.has(k)) return;
      this.keys.add(k);
      if (!this.enabled) return;
      if (k === 'shift') this.sprint = true;
      if (k === 'k') { this.shootHeld = true; this.shootCharge = 0; }
      if (k === 'j') this._fire('pass');
      if (k === 'l') this._fire('through');
      if (k === 'e') this._fire('skill');
      if (k === ' ') { this.edges[this.defending ? 'slide' : 'tackle'] = true; e.preventDefault(); }
      if (k === 'q') this.edges.switch = true;
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
    };
    const up = (e) => {
      const k = e.key.toLowerCase();
      this.keys.delete(k);
      if (k === 'shift') this.sprint = false;
      if (k === 'k' && this.shootHeld) { this.edges.shoot = true; this.shootHeld = false; }
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', () => { this.keys.clear(); this.sprint = false; this.shootHeld = false; this.raw.x = this.raw.y = 0; });
  }

  // camera-relative movement mapping
  update(dt, cam, defending, canCharge) {
    this.defending = defending;
    let kx = 0, ky = 0;
    const K = this.keys;
    if (K.has('a') || K.has('arrowleft')) kx -= 1;
    if (K.has('d') || K.has('arrowright')) kx += 1;
    if (K.has('w') || K.has('arrowup')) ky -= 1;
    if (K.has('s') || K.has('arrowdown')) ky += 1;
    let jx = this.raw.x, jy = this.raw.y;
    if (kx || ky) { const l = Math.hypot(kx, ky); jx = kx / l; jy = ky / l; }
    const dead = 0.14;
    const mag = Math.hypot(jx, jy);
    if (mag < dead) { jx = 0; jy = 0; }
    else { const s = Math.min(1, (mag - dead) / (1 - dead)) / mag; jx *= s; jy *= s; }

    // camera basis on the XZ plane
    const dir = new (cam.position.constructor)();
    cam.getWorldDirection(dir);
    let fx = dir.x, fz = dir.z;
    const fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl;
    const rx = -fz, rz = fx;
    this.move.x = rx * jx - fx * jy;
    this.move.z = rz * jx - fz * jy;

    if (this.shootHeld && canCharge) this.shootCharge = clamp(this.shootCharge + dt / 0.85, 0, 1);
    else if (!this.shootHeld) this.shootCharge = Math.max(0, this.shootCharge - dt * 4);

    // update button labels
    if (this._lastDef !== defending) {
      this._lastDef = defending;
      const a = this.btnEls.btnA, b = this.btnEls.btnB, c = this.btnEls.btnC;
      if (a) a.querySelector('.bl').textContent = defending ? 'SWITCH' : 'PASS';
      if (b) b.querySelector('.bl').textContent = defending ? 'TACKLE' : 'SHOOT';
      if (c) c.querySelector('.bl').textContent = defending ? 'SLIDE' : 'THRU';
      if (b) b.classList.toggle('def', defending);
    }
  }

  // consume one-frame edges
  take(name) { const v = this.edges[name]; this.edges[name] = false; return v; }
  clearEdges() { for (const k in this.edges) this.edges[k] = false; }

  // shoot button doubles as tackle when defending
  resolveShoot() {
    if (this.defending) { this.edges.shoot = false; this.edges.tackle = true; }
  }
}
