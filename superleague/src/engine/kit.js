// ============================================================================
//  Kit atlas + per-player name/number textures + fabric material
// ============================================================================
import * as THREE from 'three';
import { UV_BAND, NUM_RECT } from './humanoid.js';

const W = 1024, H = 512;
const hex = (n) => '#' + n.toString(16).padStart(6, '0');
// atlas v -> canvas y  (CanvasTexture flipY = true)
const cy = (v) => (1 - v) * H;

function bandRect(band) {
  const y0 = cy(band[1]), y1 = cy(band[0]);
  return { y: y0, h: y1 - y0 };
}

function noise(ctx, x, y, w, h, amount, size = 2) {
  for (let i = 0; i < amount; i++) {
    const a = Math.random() * 0.05;
    ctx.fillStyle = Math.random() > 0.5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`;
    ctx.fillRect(x + Math.random() * w, y + Math.random() * h, size, size);
  }
}

function weave(ctx, x, y, w, h) {
  ctx.save();
  ctx.globalAlpha = 0.05;
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1;
  for (let i = 0; i < w; i += 4) { ctx.beginPath(); ctx.moveTo(x + i, y); ctx.lineTo(x + i, y + h); ctx.stroke(); }
  for (let j = 0; j < h; j += 4) { ctx.beginPath(); ctx.moveTo(x, y + j); ctx.lineTo(x + w, y + j); ctx.stroke(); }
  ctx.restore();
}

function textWrap(ctx, str, cxPos, y, font, fill, spacing = 0) {
  ctx.font = font; ctx.fillStyle = fill; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (!spacing) { ctx.fillText(str, cxPos, y); return; }
  const chars = [...str];
  let total = 0;
  for (const c of chars) total += ctx.measureText(c).width + spacing;
  let x = cxPos - total / 2;
  ctx.textAlign = 'left';
  for (const c of chars) { ctx.fillText(c, x, y); x += ctx.measureText(c).width + spacing; }
}

export function makeKitAtlas(kit, pattern, short) {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);

  const shirt = hex(kit.shirt), shirt2 = hex(kit.shirt2), trim = hex(kit.trim);
  const S = bandRect(UV_BAND.shirt);

  // ---------- shirt base ----------
  ctx.fillStyle = shirt; ctx.fillRect(0, S.y, W, S.h);

  if (pattern === 'stripes') {
    ctx.fillStyle = shirt2;
    const n = 10, sw = W / n;
    for (let i = 0; i < n; i += 2) ctx.fillRect(i * sw, S.y, sw, S.h);
  } else if (pattern === 'hoops') {
    ctx.fillStyle = shirt2;
    const n = 6, bh = S.h / n;
    for (let i = 0; i < n; i += 2) ctx.fillRect(0, S.y + i * bh, W, bh);
  } else if (pattern === 'halves') {
    ctx.fillStyle = shirt2;
    ctx.fillRect(W * 0.25, S.y, W * 0.5, S.h);
  } else if (pattern === 'sash') {
    ctx.save();
    ctx.beginPath(); ctx.rect(0, S.y, W, S.h); ctx.clip();
    ctx.fillStyle = shirt2;
    // diagonal sash across the front (u ~ 0 and ~1)
    for (const off of [-W, 0, W]) {
      ctx.beginPath();
      ctx.moveTo(off - 60, S.y);
      ctx.lineTo(off + 70, S.y);
      ctx.lineTo(off + 250, S.y + S.h);
      ctx.lineTo(off + 120, S.y + S.h);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  // shoulder / sleeve trim
  ctx.fillStyle = trim;
  ctx.fillRect(0, S.y, W, S.h * 0.035);
  // collar: trim band with a V at the front centre
  ctx.fillStyle = shirt2;
  ctx.fillRect(0, S.y + S.h * 0.035, W, S.h * 0.055);
  ctx.fillStyle = trim;
  for (const off of [0, W]) {
    ctx.beginPath();
    ctx.moveTo(off - 46, S.y + S.h * 0.03);
    ctx.lineTo(off + 46, S.y + S.h * 0.03);
    ctx.lineTo(off, S.y + S.h * 0.20);
    ctx.closePath(); ctx.fill();
  }
  // hem trim
  ctx.fillStyle = trim;
  ctx.fillRect(0, S.y + S.h * 0.965, W, S.h * 0.035);

  // side seams (u = .25 / .75)
  ctx.save(); ctx.globalAlpha = 0.16; ctx.fillStyle = '#000';
  ctx.fillRect(W * 0.25 - 2, S.y, 4, S.h); ctx.fillRect(W * 0.75 - 2, S.y, 4, S.h);
  ctx.restore();

  // sponsor across the chest (front centre = u 0 and 1)
  const sponsorY = S.y + S.h * 0.46;
  for (const off of [0, W]) {
    textWrap(ctx, 'SUPERLEAGUE', off, sponsorY, '700 30px "Barlow Condensed", Impact, sans-serif', trim, 3);
    textWrap(ctx, short, off, S.y + S.h * 0.28, '800 22px "Barlow Condensed", Impact, sans-serif', shirt2 === shirt ? trim : shirt2, 5);
  }
  // small maker mark on the right chest
  ctx.fillStyle = trim;
  ctx.beginPath(); ctx.arc(W * 0.10, S.y + S.h * 0.24, 9, 0, 7); ctx.fill();

  weave(ctx, 0, S.y, W, S.h);
  noise(ctx, 0, S.y, W, S.h, 5000);

  // ---------- shorts ----------
  const P = bandRect(UV_BAND.shorts);
  ctx.fillStyle = hex(kit.shorts); ctx.fillRect(0, P.y, W, P.h);
  ctx.fillStyle = trim;
  ctx.fillRect(W * 0.25 - 9, P.y, 18, P.h);
  ctx.fillRect(W * 0.75 - 9, P.y, 18, P.h);
  ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.fillRect(0, P.y, W, P.h * 0.12);
  ctx.fillStyle = trim;
  ctx.beginPath(); ctx.arc(W * 0.13, P.y + P.h * 0.62, 11, 0, 7); ctx.fill();
  weave(ctx, 0, P.y, W, P.h); noise(ctx, 0, P.y, W, P.h, 2200);

  // ---------- socks ----------
  const K = bandRect(UV_BAND.socks);
  ctx.fillStyle = hex(kit.socks); ctx.fillRect(0, K.y, W, K.h);
  ctx.fillStyle = shirt2;
  ctx.fillRect(0, K.y + K.h * 0.06, W, K.h * 0.10);
  ctx.fillRect(0, K.y + K.h * 0.22, W, K.h * 0.06);
  ctx.fillStyle = trim;
  ctx.fillRect(0, K.y + K.h * 0.36, W, K.h * 0.04);
  ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(0, K.y + K.h * 0.80, W, K.h * 0.20);
  weave(ctx, 0, K.y, W, K.h); noise(ctx, 0, K.y, W, K.h, 1600);

  // ---------- white strip (skin / hair / boots use this) ----------
  const Wr = bandRect(UV_BAND.white);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, Wr.y - 2, W, Wr.h + 4);

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// name + number for the back of the shirt.  Canvas aspect matches the on-body
// aspect of NUM_RECT so the stretched atlas sampling looks undistorted.
export function makeNumberTexture(name, num, colorHex, outlineHex) {
  const w = 256, h = 312;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  const col = hex(colorHex), out = hex(outlineHex);
  const surname = name.split('.').pop().trim().toUpperCase();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  // name
  ctx.font = '700 34px "Barlow Condensed", Impact, sans-serif';
  ctx.lineWidth = 5; ctx.strokeStyle = out; ctx.fillStyle = col;
  ctx.save();
  const nm = surname.length > 11 ? surname.slice(0, 11) : surname;
  ctx.translate(w / 2, 34);
  const sc = Math.min(1, 220 / Math.max(1, ctx.measureText(nm).width));
  ctx.scale(sc, 1);
  ctx.strokeText(nm, 0, 0); ctx.fillText(nm, 0, 0);
  ctx.restore();
  // number
  ctx.font = '800 210px "Barlow Condensed", Impact, sans-serif';
  ctx.lineWidth = 10; ctx.strokeStyle = out; ctx.fillStyle = col;
  ctx.strokeText(String(num), w / 2, 175);
  ctx.fillText(String(num), w / 2, 175);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

let fabricNormal = null;
export function getFabricNormal() {
  if (fabricNormal) return fabricNormal;
  const s = 256;
  const c = document.createElement('canvas'); c.width = s; c.height = s;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(s, s);
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const i = (y * s + x) * 4;
    const wv = Math.sin(x * 1.6) * 0.5 + Math.sin(y * 1.6) * 0.5;
    const n = (Math.random() - 0.5) * 0.6;
    img.data[i] = 128 + (wv + n) * 16;
    img.data[i + 1] = 128 + (wv - n) * 16;
    img.data[i + 2] = 255;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  fabricNormal = new THREE.CanvasTexture(c);
  fabricNormal.wrapS = fabricNormal.wrapT = THREE.RepeatWrapping;
  return fabricNormal;
}

const NR = new THREE.Vector4(NUM_RECT[0], NUM_RECT[1], NUM_RECT[2], NUM_RECT[3]);

export function makePlayerMaterial(atlas, numTex) {
  const m = new THREE.MeshStandardMaterial({
    map: atlas,
    vertexColors: true,
    roughness: 1.0,
    metalness: 0.0,
    normalMap: getFabricNormal(),
    normalScale: new THREE.Vector2(0.22, 0.22),
    envMapIntensity: 0.75,
  });
  m.userData.uNumTex = { value: numTex };
  m.userData.uNumRect = { value: NR };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uNumTex = m.userData.uNumTex;
    sh.uniforms.uNumRect = m.userData.uNumRect;
    sh.vertexShader = 'varying vec2 vKitUv;\nvarying float vRough;\nattribute float aRough;\n' + sh.vertexShader;
    sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vKitUv = uv;\n vRough = aRough;');
    sh.fragmentShader = 'uniform sampler2D uNumTex;\nuniform vec4 uNumRect;\nvarying vec2 vKitUv;\nvarying float vRough;\n' + sh.fragmentShader;
    sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      if (vKitUv.x > uNumRect.x && vKitUv.x < uNumRect.z && vKitUv.y > uNumRect.y && vKitUv.y < uNumRect.w) {
        vec2 nuv = (vKitUv - uNumRect.xy) / (uNumRect.zw - uNumRect.xy);
        vec4 nt = texture2D(uNumTex, vec2(1.0 - nuv.x, nuv.y));
        diffuseColor.rgb = mix(diffuseColor.rgb, nt.rgb, nt.a);
      }`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = clamp(roughnessFactor * vRough, 0.05, 1.0);');
  };
  m.customProgramCacheKey = () => 'superleague-player';
  return m;
}
