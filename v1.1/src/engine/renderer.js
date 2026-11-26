// Battle with Ideas: WebGL renderer, fixed lights, ink-outline paper composite, pixel budget.

import * as THREE from 'three';

const MAX_PIXELS = 2.4e6;

const COMPOSITE_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const COMPOSITE_FS = `
uniform sampler2D tColor; uniform sampler2D tDepth; uniform vec2 res; uniform float near; uniform float far;
uniform float ink; uniform vec3 inkColor; uniform float grain; uniform float gray; uniform float flash; uniform vec3 flashColor; uniform float dark;
varying vec2 vUv;
float lin(float d){ float z = d * 2.0 - 1.0; return (2.0 * near * far) / (far + near - z * (far - near)); }
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
void main(){
  vec3 c = texture2D(tColor, vUv).rgb;
  float d0 = lin(texture2D(tDepth, vUv).x);
  vec2 px = 1.0 / res;
  float d1 = lin(texture2D(tDepth, vUv + vec2(px.x, 0.0)).x);
  float d2 = lin(texture2D(tDepth, vUv - vec2(px.x, 0.0)).x);
  float d3 = lin(texture2D(tDepth, vUv + vec2(0.0, px.y)).x);
  float d4 = lin(texture2D(tDepth, vUv - vec2(0.0, px.y)).x);
  float e = (abs(d1 - d0) + abs(d2 - d0) + abs(d3 - d0) + abs(d4 - d0)) / max(d0, 0.5);
  float edge = smoothstep(0.035, 0.11, e) * (1.0 - smoothstep(70.0, 190.0, d0));
  c = mix(c, inkColor, edge * ink);
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(c, vec3(l) * vec3(0.96, 0.96, 0.98), gray);
  float g = hash(floor(vUv * res * 0.5));
  c *= 1.0 - grain * (g - 0.5);
  vec2 q = vUv - 0.5;
  c *= 1.0 - dot(q, q) * (0.32 + dark * 2.6);
  c = mix(c, flashColor, flash);
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.r = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
    this.r.outputColorSpace = THREE.SRGBColorSpace;
    this.r.toneMapping = THREE.NeutralToneMapping;
    this.r.toneMappingExposure = 1.0;
    this.r.shadowMap.enabled = true;
    this.r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.bg = new THREE.Color('#e9e7e1');
    this.scene.background = this.bg;
    this.scene.fog = new THREE.Fog('#e4e2dc', 55, 190);
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.08, 600);
    this.camera.position.set(0, 8, 18);

    this.hemi = new THREE.HemisphereLight('#ffffff', '#b9b4aa', 1.35);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#fff8ee', 2.1);
    this.sun.position.set(22, 40, 14);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -42; sc.right = 42; sc.top = 42; sc.bottom = -42; sc.near = 2; sc.far = 120;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    this.glow = new THREE.PointLight('#ffd23f', 0, 18, 2);
    this.scene.add(this.glow);

    this.rt = null;
    this.post = new THREE.ShaderMaterial({
      vertexShader: COMPOSITE_VS, fragmentShader: COMPOSITE_FS, depthTest: false, depthWrite: false,
      uniforms: {
        tColor: { value: null }, tDepth: { value: null }, res: { value: new THREE.Vector2(1, 1) },
        near: { value: this.camera.near }, far: { value: this.camera.far },
        ink: { value: 0.78 }, inkColor: { value: new THREE.Color('#25252b') }, grain: { value: 0.035 },
        gray: { value: 0 }, flash: { value: 0 }, flashColor: { value: new THREE.Color('#ffffff') }, dark: { value: 0 },
      },
    });
    this.postScene = new THREE.Scene();
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.post);
    quad.frustumCulled = false;
    this.postScene.add(quad);
    this.postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.shake = 0;
    this._shakeOff = new THREE.Vector3();
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    const dpr = Math.min(devicePixelRatio || 1, Math.sqrt(MAX_PIXELS / (w * h)), 2);
    this.r.setPixelRatio(dpr);
    this.r.setSize(w, h, false);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const pw = Math.floor(w * dpr), ph = Math.floor(h * dpr);
    if (this.rt) { this.rt.dispose(); this.rt.depthTexture.dispose(); }
    const depth = new THREE.DepthTexture(pw, ph);
    depth.type = THREE.UnsignedIntType;
    this.rt = new THREE.WebGLRenderTarget(pw, ph, { type: THREE.HalfFloatType, samples: 4, depthTexture: depth });
    this.post.uniforms.tColor.value = this.rt.texture;
    this.post.uniforms.tDepth.value = this.rt.depthTexture;
    this.post.uniforms.res.value.set(pw, ph);
  }

  setLook({ sky, fog, light, hemiGround } = {}) {
    if (sky) this.bg.set(sky);
    if (fog) this.scene.fog.color.set(fog);
    if (light) this.sun.color.set(light);
    if (hemiGround) this.hemi.groundColor.set(hemiGround);
  }

  addShake(a) { this.shake = Math.min(1.2, this.shake + a); }

  render(dt) {
    const cam = this.camera;
    if (this.shake > 0.001) {
      this._shakeOff.set((Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5)).multiplyScalar(this.shake * 0.35);
      cam.position.add(this._shakeOff);
      this.shake *= Math.exp(-dt * 7);
    } else this._shakeOff.set(0, 0, 0);
    const u = this.post.uniforms;
    u.near.value = cam.near; u.far.value = cam.far;
    if (u.flash.value > 0) u.flash.value = Math.max(0, u.flash.value - dt * 2.2);
    this.r.setRenderTarget(this.rt);
    this.r.render(this.scene, cam);
    this.r.setRenderTarget(null);
    this.r.render(this.postScene, this.postCam);
    cam.position.sub(this._shakeOff);
  }

  flash(color = '#ffffff', a = 0.6) { this.post.uniforms.flashColor.value.set(color); this.post.uniforms.flash.value = a; }

  async compile() {
    const wait = new Promise((r) => setTimeout(r, 3500));
    try { await Promise.race([this.r.compileAsync(this.scene, this.camera), wait]); } catch (e) { this.r.compile(this.scene, this.camera); }
  }
}
