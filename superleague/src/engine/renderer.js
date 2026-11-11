// ============================================================================
//  Renderer + post-processing + adaptive resolution / quality manager
// ============================================================================
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uVignette: { value: 0.42 },
    uGrain: { value: 0.030 },
    uAberration: { value: 0.0016 },
    uSat: { value: 1.07 },
    uContrast: { value: 1.045 },
    uLift: { value: new THREE.Vector3(0.004, 0.006, 0.012) },
    uTime: { value: 0 },
    uFlash: { value: 0 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uVignette,uGrain,uAberration,uSat,uContrast,uTime,uFlash;
    uniform vec3 uLift;
    varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
    void main(){
      vec2 uv = vUv;
      vec2 c = uv - 0.5;
      float r2 = dot(c,c);
      // chromatic aberration grows toward the edges
      vec2 off = c * uAberration * (0.4 + r2*3.0);
      vec3 col;
      col.r = texture2D(tDiffuse, uv + off).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - off).b;
      // lift / contrast / saturation
      col += uLift;
      col = (col - 0.5) * uContrast + 0.5;
      float l = dot(col, vec3(0.2126,0.7152,0.0722));
      col = mix(vec3(l), col, uSat);
      // vignette
      float v = 1.0 - uVignette * smoothstep(0.16, 0.82, r2*1.9);
      col *= v;
      // grain
      float g = hash(uv*vec2(1024.0,768.0) + fract(uTime)*97.0) - 0.5;
      col += g * uGrain * (0.35 + 0.65*(1.0-l));
      col += vec3(1.0,0.98,0.94) * uFlash;
      gl_FragColor = vec4(max(col,0.0), 1.0);
    }`,
};

export const QUALITY = {
  low:    { dpr: 1.0,  shadow: 0,    bloom: false, grade: false, fxaa: false, crowd: 'low',    pitchRes: 1024, aniso: 2 },
  medium: { dpr: 1.35, shadow: 1024, bloom: true,  grade: true,  fxaa: true,  crowd: 'medium', pitchRes: 1536, aniso: 4 },
  high:   { dpr: 2.0,  shadow: 2048, bloom: true,  grade: true,  fxaa: true,  crowd: 'high',   pitchRes: 2048, aniso: 8 },
};

export class Renderer {
  constructor(canvas, quality = 'high') {
    this.canvas = canvas;
    this.qualityName = quality;
    this.q = QUALITY[quality];
    this.renderer = new THREE.WebGLRenderer({
      canvas, antialias: false, alpha: false, stencil: false,
      powerPreference: 'high-performance', preserveDrawingBuffer: false,
    });
    this.renderer.setClearColor(0x05070c, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = this.q.shadow > 0;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scale = 1.0;
    this.targetScale = 1.0;
    this.frameEMA = 16;
    this._cool = 0;
    this.fps = 60;
    this._fpsAcc = 0; this._fpsN = 0;
    this.autoQuality = true;
    this._buildComposer();
    this.resize();
  }

  _buildComposer() {
    const r = this.renderer;
    if (this.composer) { this.composer.dispose?.(); this.composer = null; }
    if (!this.q.bloom && !this.q.grade && !this.q.fxaa) return;
    const size = new THREE.Vector2();
    r.getSize(size);
    const rt = new THREE.WebGLRenderTarget(Math.max(2, size.x), Math.max(2, size.y), {
      type: THREE.HalfFloatType, samples: 0, depthBuffer: true, stencilBuffer: false,
    });
    this.composer = new EffectComposer(r, rt);
    this.renderPass = new RenderPass(this.scene || new THREE.Scene(), this.camera || new THREE.PerspectiveCamera());
    this.composer.addPass(this.renderPass);
    if (this.q.bloom) {
      this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x * 0.5, size.y * 0.5), 0.34, 0.72, 0.86);
      this.composer.addPass(this.bloom);
    } else this.bloom = null;
    if (this.q.grade) {
      this.grade = new ShaderPass(GradeShader);
      this.composer.addPass(this.grade);
    } else this.grade = null;
    this.composer.addPass(new OutputPass());
    if (this.q.fxaa) {
      this.fxaa = new ShaderPass(FXAAShader);
      this.composer.addPass(this.fxaa);
    } else this.fxaa = null;
  }

  bind(scene, camera) {
    this.scene = scene; this.camera = camera;
    if (this.renderPass) { this.renderPass.scene = scene; this.renderPass.camera = camera; }
  }

  setQuality(name) {
    if (!QUALITY[name] || name === this.qualityName) return false;
    this.qualityName = name; this.q = QUALITY[name];
    this.renderer.shadowMap.enabled = this.q.shadow > 0;
    this.scale = this.targetScale = 1.0;
    this._buildComposer();
    if (this.scene) this.bind(this.scene, this.camera);
    this.resize();
    return true;
  }

  setExposure(e) { this.renderer.toneMappingExposure = e; }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, this.q.dpr) * this.scale;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    if (this.composer) {
      this.composer.setPixelRatio(dpr);
      this.composer.setSize(w, h);
      if (this.bloom) this.bloom.setSize(w * dpr * 0.5, h * dpr * 0.5);
      if (this.fxaa) this.fxaa.material.uniforms.resolution.value.set(1 / (w * dpr), 1 / (h * dpr));
    }
    if (this.camera) { this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }
    this.cssSize = { w, h };
  }

  // adaptive resolution: keep frame time near the target budget
  tune(dt) {
    const ms = dt * 1000;
    this.frameEMA += (ms - this.frameEMA) * 0.08;
    this._fpsAcc += dt; this._fpsN++;
    if (this._fpsAcc > 0.5) { this.fps = Math.round(this._fpsN / this._fpsAcc); this._fpsAcc = 0; this._fpsN = 0; }
    if (!this.autoQuality) return;
    this._cool -= dt;
    if (this._cool > 0) return;
    const budget = 1000 / 55;
    if (this.frameEMA > budget * 1.30 && this.scale > 0.58) {
      this.scale = Math.max(0.58, this.scale - 0.12); this._cool = 1.1; this.resize();
    } else if (this.frameEMA < budget * 0.80 && this.scale < 1.0) {
      this.scale = Math.min(1.0, this.scale + 0.08); this._cool = 2.2; this.resize();
    }
  }

  render(time) {
    if (this.grade) {
      this.grade.uniforms.uTime.value = time;
    }
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  flash(amount) { if (this.grade) this.grade.uniforms.uFlash.value = amount; }
  decayFlash(dt) { if (this.grade) this.grade.uniforms.uFlash.value *= Math.max(0, 1 - dt * 5.5); }

  get info() { return this.renderer.info; }
}
