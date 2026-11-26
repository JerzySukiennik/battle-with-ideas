// Battle with Ideas: pooled sprite particles, ambient weather, shockwave rings and beams.

import * as THREE from 'three';

const MAX = 3200;
const CELLS = { soft: 0, blot: 1, star: 2, heart: 3, square: 4, leaf: 5, flake: 6, bolt: 7, ring: 8, drop: 9, spark: 10, puff: 11 };

const TYPES = {
  fire: { cell: 'soft', colors: ['#ffb000', '#ff7a00', '#ffd23f'], size: [0.5, 1.1], life: [0.4, 0.8], vel: 2.2, up: 3.5, grav: -2, drag: 1.5, add: 1 },
  embers: { cell: 'spark', colors: ['#ffb347', '#ffd23f'], size: [0.12, 0.25], life: [0.6, 1.4], vel: 3, up: 3, grav: -1, drag: 0.8, add: 1 },
  smoke: { cell: 'puff', colors: ['#d4d3cf', '#e2e1dc', '#c4c3bf'], size: [0.5, 1.1], life: [0.7, 1.2], vel: 1.2, up: 1.6, grav: -0.4, drag: 1.2, grow: 1.4 },
  dust: { cell: 'puff', colors: ['#d9d4c8', '#c9c3b5'], size: [0.5, 1.1], life: [0.5, 1], vel: 3, up: 1, grav: 1, drag: 2.5, grow: 1.2 },
  sparkle: { cell: 'star', colors: ['#ffffff', '#ffe066', '#9fd8ff'], size: [0.2, 0.45], life: [0.5, 1.1], vel: 4, up: 2, grav: 2, drag: 1.5, add: 1, spin: 1 },
  stars: { cell: 'star', colors: ['#ffd23f', '#ffffff', '#9b5de5'], size: [0.25, 0.55], life: [0.6, 1.2], vel: 5, up: 3, grav: 4, drag: 1, add: 1, spin: 1 },
  bubbles: { cell: 'ring', colors: ['#bdf2ff', '#d8ffd0', '#ffffff'], size: [0.2, 0.5], life: [0.8, 1.6], vel: 1.2, up: 1.5, grav: -1.5, drag: 1 },
  leaves: { cell: 'leaf', colors: ['#6abf4b', '#a3d65c', '#e0a43a'], size: [0.25, 0.45], life: [1.5, 3], vel: 2, up: 1, grav: 1.2, drag: 1.8, spin: 1 },
  snow: { cell: 'flake', colors: ['#ffffff', '#eef7ff'], size: [0.15, 0.32], life: [2, 4], vel: 0.6, up: 0, grav: 0.8, drag: 1.5, spin: 1 },
  rain: { cell: 'drop', colors: ['#9fc8ff', '#c6defa'], size: [0.18, 0.28], life: [0.8, 1.4], vel: 0.2, up: 0, grav: 22, drag: 0 },
  ash: { cell: 'soft', colors: ['#6d6d72', '#9a9a9e'], size: [0.08, 0.18], life: [2, 4], vel: 0.5, up: 0, grav: 0.4, drag: 1 },
  electric: { cell: 'bolt', colors: ['#9fd8ff', '#ffffff', '#c5a3ff'], size: [0.3, 0.6], life: [0.15, 0.35], vel: 6, up: 0, grav: 0, drag: 3, add: 1, spin: 1 },
  water: { cell: 'drop', colors: ['#5fb3ff', '#9fd8ff', '#ffffff'], size: [0.15, 0.32], life: [0.5, 0.9], vel: 3.5, up: 4, grav: 14, drag: 0.5 },
  hearts: { cell: 'heart', colors: ['#ff7eb6', '#ffb3d1', '#ffffff'], size: [0.25, 0.45], life: [0.8, 1.4], vel: 2, up: 3, grav: -0.8, drag: 1.2 },
  ink: { cell: 'blot', colors: ['#25252b', '#3a3a44'], size: [0.12, 0.3], life: [0.35, 0.7], vel: 4.5, up: 2.5, grav: 12, drag: 1 },
  confetti: { cell: 'square', colors: ['#ffd23f', '#4c8dff', '#2ec4b6', '#9b5de5', '#f15bb5', '#ff9f1c'], size: [0.14, 0.26], life: [1.2, 2.2], vel: 7, up: 7, grav: 7, drag: 2.2, spin: 1 },
  paint: { cell: 'blot', colors: ['#ffd23f'], size: [0.4, 0.9], life: [0.6, 1.2], vel: 2, up: 1, grav: 8, drag: 1 },
  grey: { cell: 'puff', colors: ['#8d8c88', '#a7a6a1', '#6f6e6a'], size: [0.8, 1.6], life: [1, 2], vel: 1.2, up: 0.6, grav: -0.2, drag: 1, grow: 1.4 },
};

function atlas() {
  const n = 64, cv = document.createElement('canvas');
  cv.width = cv.height = n * 4;
  const g = cv.getContext('2d');
  const cell = (i, fn) => { g.save(); g.translate((i % 4) * n + n / 2, Math.floor(i / 4) * n + n / 2); fn(); g.restore(); };
  g.fillStyle = '#fff'; g.strokeStyle = '#fff';
  cell(0, () => { const r = g.createRadialGradient(0, 0, 0, 0, 0, 30); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(-32, -32, 64, 64); });
  cell(1, () => { g.beginPath(); for (let i = 0; i < 12; i++) { const a = i / 12 * 6.283, r = 18 + (i % 3) * 6; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.fill(); });
  cell(2, () => { g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 11 : 28; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.fill(); });
  cell(3, () => { g.beginPath(); g.moveTo(0, 22); g.bezierCurveTo(-34, -2, -16, -30, 0, -12); g.bezierCurveTo(16, -30, 34, -2, 0, 22); g.fill(); });
  cell(4, () => { g.fillRect(-20, -12, 40, 24); });
  cell(5, () => { g.beginPath(); g.ellipse(0, 0, 26, 12, 0.6, 0, 6.283); g.fill(); });
  cell(6, () => { g.lineWidth = 5; for (let i = 0; i < 3; i++) { g.rotate(Math.PI / 3); g.beginPath(); g.moveTo(-26, 0); g.lineTo(26, 0); g.stroke(); } });
  cell(7, () => { g.lineWidth = 6; g.beginPath(); g.moveTo(-6, -28); g.lineTo(8, -4); g.lineTo(-8, 4); g.lineTo(6, 28); g.stroke(); });
  cell(8, () => { g.lineWidth = 5; g.beginPath(); g.arc(0, 0, 22, 0, 6.283); g.stroke(); g.beginPath(); g.arc(-8, -8, 5, 0, 6.283); g.fill(); });
  cell(9, () => { g.beginPath(); g.moveTo(0, -28); g.quadraticCurveTo(16, 6, 0, 18); g.quadraticCurveTo(-16, 6, 0, -28); g.fill(); });
  cell(10, () => { g.lineWidth = 7; g.beginPath(); g.moveTo(-26, 0); g.lineTo(26, 0); g.moveTo(0, -26); g.lineTo(0, 26); g.stroke(); });
  cell(11, () => { for (const [x, y, r] of [[-10, 4, 16], [10, 4, 16], [0, -8, 18]]) { const rg = g.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, 'rgba(255,255,255,0.9)'); rg.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = rg; g.beginPath(); g.arc(x, y, r, 0, 6.283); g.fill(); } });
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const VS = `
attribute float size; attribute float cell; attribute float alpha; attribute float rot; attribute vec3 color;
varying vec3 vColor; varying float vCell; varying float vAlpha; varying float vRot;
uniform float scale;
void main(){
  vColor = color; vCell = cell; vAlpha = alpha; vRot = rot;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * scale / max(0.1, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const FS = `
uniform sampler2D map; varying vec3 vColor; varying float vCell; varying float vAlpha; varying float vRot;
void main(){
  vec2 p = gl_PointCoord - 0.5; float c = cos(vRot), s = sin(vRot);
  p = clamp(vec2(c * p.x - s * p.y, s * p.x + c * p.y) + 0.5, 0.01, 0.99);
  vec2 uv = vec2((mod(vCell, 4.0) + p.x) / 4.0, 1.0 - (floor(vCell / 4.0) + p.y) / 4.0);
  vec4 t = texture2D(map, uv);
  if (t.a * vAlpha < 0.03) discard;
  gl_FragColor = vec4(vColor * t.rgb, t.a * vAlpha);
  #include <colorspace_fragment>
}`;

export class FX {
  constructor(E) {
    this.E = E;
    const scene = E.renderer.scene;
    this.n = 0;
    this.pos = new Float32Array(MAX * 3);
    this.vel = new Float32Array(MAX * 3);
    this.col = new Float32Array(MAX * 3);
    this.size = new Float32Array(MAX);
    this.size0 = new Float32Array(MAX);
    this.cell = new Float32Array(MAX);
    this.alpha = new Float32Array(MAX);
    this.rot = new Float32Array(MAX);
    this.spin = new Float32Array(MAX);
    this.life = new Float32Array(MAX);
    this.life0 = new Float32Array(MAX);
    this.grav = new Float32Array(MAX);
    this.drag = new Float32Array(MAX);
    this.grow = new Float32Array(MAX);
    this.add = new Uint8Array(MAX);
    const tex = atlas();
    const mk = (blending) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX * 3), 3).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAX * 3), 3).setUsage(THREE.DynamicDrawUsage));
      for (const k of ['size', 'cell', 'alpha', 'rot']) g.setAttribute(k, new THREE.BufferAttribute(new Float32Array(MAX), 1).setUsage(THREE.DynamicDrawUsage));
      const m = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, uniforms: { map: { value: tex }, scale: { value: 600 } }, transparent: true, depthWrite: false, blending });
      const p = new THREE.Points(g, m);
      p.frustumCulled = false;
      p.renderOrder = 5;
      scene.add(p);
      return p;
    };
    this.normal = mk(THREE.NormalBlending);
    this.additive = mk(THREE.AdditiveBlending);
    this.ambient = 'none';
    this.ambAcc = 0;
    this.rings = [];
    this.ringGeo = new THREE.RingGeometry(0.85, 1, 48);
    this.ringGeo.rotateX(-Math.PI / 2);
    this.beams = [];
    this.beamGeo = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true);
    this.beamGeo.translate(0, 0.5, 0);
    this.beamGeo.rotateX(Math.PI / 2);
    this._c = new THREE.Color();
  }

  emit(type, x, y, z, vx, vy, vz, tp = TYPES[type] || TYPES.dust, color = null) {
    if (this.n >= MAX) return;
    const i = this.n++;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this._c.set(color || tp.colors[(Math.random() * tp.colors.length) | 0]);
    this.col[i * 3] = this._c.r; this.col[i * 3 + 1] = this._c.g; this.col[i * 3 + 2] = this._c.b;
    const s = tp.size[0] + Math.random() * (tp.size[1] - tp.size[0]);
    this.size[i] = this.size0[i] = s;
    this.cell[i] = CELLS[tp.cell];
    this.alpha[i] = 1;
    this.rot[i] = Math.random() * 6.28;
    this.spin[i] = tp.spin ? (Math.random() - 0.5) * 8 : 0;
    const l = tp.life[0] + Math.random() * (tp.life[1] - tp.life[0]);
    this.life[i] = this.life0[i] = l;
    this.grav[i] = tp.grav; this.drag[i] = tp.drag; this.grow[i] = tp.grow || 0; this.add[i] = tp.add ? 1 : 0;
  }

  burst(at, type, count = 12, color = null, spread = 1) {
    const tp = TYPES[type];
    if (!tp) return;
    for (let k = 0; k < count; k++) {
      const a = Math.random() * 6.283, e = Math.random() * 2 - 1, v = tp.vel * (0.4 + Math.random() * 0.8) * spread;
      const r = Math.sqrt(1 - e * e);
      this.emit(type, at.x + (Math.random() - 0.5) * 0.3 * spread, at.y + (Math.random() - 0.5) * 0.3 * spread, at.z + (Math.random() - 0.5) * 0.3 * spread, Math.cos(a) * r * v, Math.abs(e) * v * 0.5 + tp.up * (0.5 + Math.random() * 0.5), Math.sin(a) * r * v, tp, color);
    }
  }

  trail(at, type = 'ink', color = null) {
    const tp = TYPES[type] || TYPES.ink;
    this.emit(type, at.x, at.y, at.z, (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5, { ...tp, life: [0.2, 0.4], size: [tp.size[0] * 0.7, tp.size[1] * 0.7], grav: 0, up: 0 }, color);
  }

  ring(at, radius, color = '#25252b', dur = 0.45) {
    const m = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }));
    m.position.set(at.x, Math.max(at.y, 0.06), at.z);
    m.scale.setScalar(0.1);
    this.E.renderer.scene.add(m);
    this.rings.push({ m, t: 0, dur, r: radius });
  }

  beam(a, b, color = '#9fd8ff', width = 0.12, dur = 0.2) {
    const m = new THREE.Mesh(this.beamGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthWrite: false }));
    m.position.copy(a);
    m.lookAt(b);
    m.scale.set(width, width, a.distanceTo(b));
    this.E.renderer.scene.add(m);
    this.beams.push({ m, t: 0, dur, w: width });
  }

  explosion(at, radius, color = '#ffb000') {
    this.burst(at, 'fire', Math.min(60, 12 + radius * 6), null, Math.max(1, radius * 0.5));
    this.burst(at, 'smoke', Math.min(30, 6 + radius * 3), null, Math.max(1, radius * 0.4));
    this.burst(at, 'ink', 10);
    this.ring(at, radius, color, 0.4);
    const d = this.E.renderer.camera.position.distanceTo(at);
    this.E.renderer.addShake(Math.min(0.9, radius * 2.5 / Math.max(4, d)));
  }

  setAmbient(type) { this.ambient = TYPES[type] ? type : 'none'; }

  update(dt) {
    const cam = this.E.renderer.camera;
    if (this.ambient !== 'none') {
      const tp = TYPES[this.ambient];
      this.ambAcc += dt * (this.ambient === 'rain' ? 160 : this.ambient === 'snow' ? 70 : 30);
      while (this.ambAcc > 1) {
        this.ambAcc -= 1;
        const x = cam.position.x + (Math.random() - 0.5) * 50, z = cam.position.z + (Math.random() - 0.5) * 50;
        const y = this.ambient === 'embers' || this.ambient === 'bubbles' ? Math.random() * 2 : 10 + Math.random() * 8;
        this.emit(this.ambient, x, y, z, (Math.random() - 0.5) * tp.vel, tp.up * Math.random(), (Math.random() - 0.5) * tp.vel, { ...tp, life: [tp.life[0] * 1.5, tp.life[1] * 1.5] });
      }
    }
    let n = this.n;
    for (let i = 0; i < n; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        n--;
        if (i !== n) this.copy(n, i);
        i--;
        continue;
      }
      const d = Math.exp(-this.drag[i] * dt);
      this.vel[i * 3] *= d; this.vel[i * 3 + 2] *= d;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * d - this.grav[i] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const k = this.life[i] / this.life0[i];
      this.alpha[i] = Math.min(1, k * 2.5);
      this.size[i] = this.size0[i] * (1 + this.grow[i] * (1 - k));
      this.rot[i] += this.spin[i] * dt;
    }
    this.n = n;
    this.upload();
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i]; r.t += dt;
      const k = r.t / r.dur;
      r.m.scale.setScalar(Math.max(0.1, r.r * (1 - Math.pow(1 - Math.min(1, k), 3))));
      r.m.material.opacity = 0.9 * (1 - k);
      if (k >= 1) { this.E.renderer.scene.remove(r.m); r.m.material.dispose(); this.rings.splice(i, 1); }
    }
    for (let i = this.beams.length - 1; i >= 0; i--) {
      const b = this.beams[i]; b.t += dt;
      const k = b.t / b.dur;
      b.m.scale.x = b.m.scale.y = b.w * (1 - k * 0.7);
      b.m.material.opacity = 0.95 * (1 - k);
      if (k >= 1) { this.E.renderer.scene.remove(b.m); b.m.material.dispose(); this.beams.splice(i, 1); }
    }
    this.normal.material.uniforms.scale.value = this.E.renderer.r.domElement.height * 0.9;
    this.additive.material.uniforms.scale.value = this.E.renderer.r.domElement.height * 0.9;
  }

  copy(from, to) {
    for (let k = 0; k < 3; k++) { this.pos[to * 3 + k] = this.pos[from * 3 + k]; this.vel[to * 3 + k] = this.vel[from * 3 + k]; this.col[to * 3 + k] = this.col[from * 3 + k]; }
    this.size[to] = this.size[from]; this.size0[to] = this.size0[from]; this.cell[to] = this.cell[from]; this.alpha[to] = this.alpha[from];
    this.rot[to] = this.rot[from]; this.spin[to] = this.spin[from]; this.life[to] = this.life[from]; this.life0[to] = this.life0[from];
    this.grav[to] = this.grav[from]; this.drag[to] = this.drag[from]; this.grow[to] = this.grow[from]; this.add[to] = this.add[from];
  }

  upload() {
    let a = 0, b = 0;
    const NA = this.normal.geometry.attributes, AA = this.additive.geometry.attributes;
    for (let i = 0; i < this.n; i++) {
      const T = this.add[i] ? AA : NA;
      const j = this.add[i] ? b++ : a++;
      T.position.array[j * 3] = this.pos[i * 3]; T.position.array[j * 3 + 1] = this.pos[i * 3 + 1]; T.position.array[j * 3 + 2] = this.pos[i * 3 + 2];
      T.color.array[j * 3] = this.col[i * 3]; T.color.array[j * 3 + 1] = this.col[i * 3 + 1]; T.color.array[j * 3 + 2] = this.col[i * 3 + 2];
      T.size.array[j] = this.size[i]; T.cell.array[j] = this.cell[i]; T.alpha.array[j] = this.alpha[i]; T.rot.array[j] = this.rot[i];
    }
    for (const [T, cnt, P] of [[NA, a, this.normal], [AA, b, this.additive]]) {
      P.geometry.setDrawRange(0, cnt);
      for (const k of ['position', 'color', 'size', 'cell', 'alpha', 'rot']) { T[k].needsUpdate = true; T[k].clearUpdateRanges && T[k].clearUpdateRanges(); T[k].addUpdateRange && T[k].addUpdateRange(0, cnt * T[k].itemSize); }
    }
  }
}
