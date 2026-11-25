// Battle with Ideas: the blank paper island (seeded shape, holes, concrete obstacles) and painting it with a world recipe.

import * as THREE from 'three';
import { mulberry32, noise2 } from '../shared/rng.js';
import { paperTexture, concreteTexture, cardboardTexture, patternTexture } from './textures.js';
import { buildModel, modelColliderBoxes } from '../engine/prims.js';

const CELL = 0.5;
const PAPER = { sky: '#e9e7e1', fog: '#e4e2dc', light: '#fff8ee', cliff: '#d8d3c6', obstacles: '#c9c8c3', surface: 'normal' };

export class Island {
  constructor(E) {
    this.E = E;
    this.group = new THREE.Group();
    E.renderer.scene.add(this.group);
    this.colliders = [];
    this.paintColliders = [];
    this.obstacles = [];
    this.spawns = [];
    this.holes = [];
    this.surface = 'normal';
    this.conveyor = new THREE.Vector2(1, 0);
    this.paperTex = paperTexture();
    this.concreteTex = concreteTexture('#ffffff');
    this.reveal = null;
    this.recipe = null;
    this.zone = { r: 99, target: 99 };
    this.uniforms = { mapB: { value: this.paperTex }, rOrigin: { value: new THREE.Vector2() }, rRadius: { value: -100 }, rScale: { value: 1 / 7 }, aScale: { value: 1 / 8 } };
    this.topMat = new THREE.MeshStandardMaterial({ map: this.paperTex, roughness: 0.92, metalness: 0 });
    this.topMat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.uniforms);
      sh.vertexShader = 'varying vec2 vWxz;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vWxz = (modelMatrix * vec4(position, 1.0)).xz;');
      sh.fragmentShader = 'varying vec2 vWxz;\nuniform sampler2D mapB; uniform vec2 rOrigin; uniform float rRadius; uniform float rScale; uniform float aScale;\n' + sh.fragmentShader.replace('#include <map_fragment>', `
        vec4 texA = texture2D(map, vWxz * aScale);
        vec4 texB = texture2D(mapB, vWxz * rScale);
        float dd = length(vWxz - rOrigin);
        float nn = fract(sin(dot(floor(vWxz * 1.5), vec2(12.9898, 78.233))) * 43758.5453);
        float kk = smoothstep(rRadius + 0.5, rRadius - 2.0, dd + nn * 1.6);
        diffuseColor *= mix(texA, texB, kk);`);
    };
    this.sideMat = new THREE.MeshStandardMaterial({ map: cardboardTexture('#ffffff'), color: PAPER.cliff, roughness: 0.95 });
    this.underMat = new THREE.MeshStandardMaterial({ map: this.sideMat.map, color: PAPER.cliff, roughness: 1, flatShading: true });
    this.obsMat = new THREE.MeshStandardMaterial({ map: this.concreteTex, color: PAPER.obstacles, roughness: 0.9 });
    this.zoneMat = new THREE.MeshBasicMaterial({ color: '#9c9a95', transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false, fog: false });
    this.zoneMesh = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 40, 64, 1, true), this.zoneMat);
    this.zoneMesh.visible = false;
    E.renderer.scene.add(this.zoneMesh);
    this.look = { ...PAPER };
  }

  radiusAt(a) {
    const s = this.shape;
    return s.R * (1 + 0.11 * Math.sin(3 * a + s.p1) + 0.07 * Math.sin(5 * a + s.p2) + 0.04 * Math.sin(8 * a + s.p3) + 0.06 * (noise2(Math.cos(a) * 2 + 9, Math.sin(a) * 2 + 9, s.seed) - 0.5));
  }

  inside(x, z, margin = 0) {
    const r = Math.hypot(x, z);
    if (r > this.radiusAt(Math.atan2(z, x)) - margin) return false;
    for (const h of this.holes) if (Math.hypot(x - h.x, z - h.z) < h.r + margin) return false;
    return true;
  }

  build(seed) {
    this.clear();
    this.seed = seed;
    const rng = mulberry32(seed);
    this.shape = { R: 26 + rng() * 4, p1: rng() * 6.28, p2: rng() * 6.28, p3: rng() * 6.28, seed: seed % 997 };
    this.holes = [];
    const nh = 1 + Math.floor(rng() * 2.2);
    for (let i = 0; i < 40 && this.holes.length < nh; i++) {
      const a = rng() * Math.PI * 2, d = 8 + rng() * 9, r = 2 + rng() * 1.6;
      const h = { x: Math.cos(a) * d, z: Math.sin(a) * d, r };
      if (Math.hypot(h.x, h.z) + r > this.radiusAt(a) - 4) continue;
      if (this.holes.some((o) => Math.hypot(o.x - h.x, o.z - h.z) < o.r + h.r + 5)) continue;
      this.holes.push(h);
    }
    const N = 140;
    const outline = [];
    for (let i = 0; i < N; i++) { const a = (i / N) * Math.PI * 2; const r = this.radiusAt(a); outline.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r)); }
    const shape = new THREE.Shape(outline);
    for (const h of this.holes) {
      const pts = [];
      for (let i = 0; i < 36; i++) { const a = -(i / 36) * Math.PI * 2; const r = h.r * (1 + 0.1 * Math.sin(3 * a + h.x)); pts.push(new THREE.Vector2(h.x + Math.cos(a) * r, h.z + Math.sin(a) * r)); }
      shape.holes.push(new THREE.Path(pts));
    }
    const slab = new THREE.ExtrudeGeometry(shape, { depth: 1.3, bevelEnabled: true, bevelThickness: 0.22, bevelSize: 0.28, bevelSegments: 2, curveSegments: 1 });
    slab.rotateX(Math.PI / 2);
    slab.translate(0, -0.22, 0);
    this.top = new THREE.Mesh(slab, [this.topMat, this.sideMat]);
    this.top.receiveShadow = true;
    this.top.castShadow = true;
    this.group.add(this.top);
    this.under = new THREE.Mesh(this.underside(outline, rng), this.underMat);
    this.group.add(this.under);
    this.buildColliders();
    this.buildObstacles(rng);
    this.buildSpawns();
    this.resetLook();
  }

  underside(outline, rng) {
    const levels = [[-1.1, 1.0], [-3.2, 0.84], [-6.4, 0.6], [-10.2, 0.36], [-14.2, 0.15]];
    const pos = [];
    const ring = (li) => outline.map((p, i) => {
      const [y, s] = levels[li];
      const n = li ? 1 + (noise2(i * 0.35, li * 3.1, this.shape.seed) - 0.5) * 0.32 : 1;
      return [p.x * s * n, y + (li ? (noise2(i * 0.5, li, 5) - 0.5) * 1.6 : 0), p.y * s * n];
    });
    const rings = levels.map((_, i) => ring(i));
    const tip = [0, -18 - rng() * 2, 0];
    const N = outline.length;
    for (let l = 0; l < rings.length - 1; l++) {
      for (let i = 0; i < N; i++) {
        const a = rings[l][i], b = rings[l][(i + 1) % N], c = rings[l + 1][i], d = rings[l + 1][(i + 1) % N];
        pos.push(...a, ...c, ...b, ...b, ...c, ...d);
      }
    }
    const last = rings[rings.length - 1];
    for (let i = 0; i < N; i++) pos.push(...last[i], ...tip, ...last[(i + 1) % N]);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const uv = [];
    for (let i = 0; i < pos.length; i += 3) uv.push(Math.atan2(pos[i + 2], pos[i]) * 6, pos[i + 1] * 0.4);
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    return g;
  }

  buildColliders() {
    const P = this.E.physics;
    const half = 36, n = Math.round((half * 2) / CELL);
    const grid = new Uint8Array(n * n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = -half + (i + 0.5) * CELL, z = -half + (j + 0.5) * CELL;
      grid[j * n + i] = this.inside(x, z) ? 1 : 0;
    }
    const used = new Uint8Array(n * n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      if (!grid[j * n + i] || used[j * n + i]) continue;
      let w = 1;
      while (i + w < n && grid[j * n + i + w] && !used[j * n + i + w]) w++;
      let h = 1;
      outer: while (j + h < n) {
        for (let k = 0; k < w; k++) if (!grid[(j + h) * n + i + k] || used[(j + h) * n + i + k]) break outer;
        h++;
      }
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) used[(j + y) * n + i + x] = 1;
      const cx = -half + (i + w / 2) * CELL, cz = -half + (j + h / 2) * CELL;
      P.addStaticBox(cx, -1, cz, (w * CELL) / 2, 1, (h * CELL) / 2, null, 0.8, this.colliders);
    }
  }

  buildObstacles(rng) {
    const P = this.E.physics;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const want = 11 + Math.floor(rng() * 5);
    const placed = [];
    const kinds = ['block', 'block', 'wall', 'wall', 'ramp', 'pillar', 'stack', 'block', 'ramp', 'wall'];
    for (let tries = 0; tries < 400 && placed.length < want; tries++) {
      const kind = kinds[Math.floor(rng() * kinds.length)];
      const a = rng() * Math.PI * 2, d = 6 + rng() * 18;
      const x = Math.cos(a) * d, z = Math.sin(a) * d, yaw = rng() * Math.PI;
      let pieces = [], foot = 2;
      if (kind === 'block') { const s = 1.6 + rng() * 2; pieces = [[0, s / 2, 0, s * (0.9 + rng() * 0.6), s, s * (0.9 + rng() * 0.5), 0]]; foot = s; }
      if (kind === 'wall') { const L = 5 + rng() * 4; pieces = [[0, 1.15, 0, L, 2.3, 0.6, 0]]; foot = L / 2 + 0.5; }
      if (kind === 'pillar') { pieces = [[0, 2.2, 0, 1.2, 4.4, 1.2, 0]]; foot = 1.2; }
      if (kind === 'stack') { pieces = [[0, 0.8, 0, 3.2, 1.6, 3.2, 0], [0.3, 2.2, -0.2, 2, 1.2, 2, 0]]; foot = 2.4; }
      if (kind === 'ramp') { const L = 6.2, tilt = 0.32 + rng() * 0.1; pieces = [[0, Math.sin(tilt) * L / 2 - 0.12, 0, 3, 0.4, L, tilt], [0, (Math.sin(tilt) * L) / 2, L / 2 * Math.cos(tilt) + 1.1, 3, Math.sin(tilt) * L, 2.2, 0]]; foot = L / 2 + 1.5; }
      if (!this.inside(x, z, foot + 1.5)) continue;
      if (Math.hypot(x, z) < foot + 5) continue;
      if (placed.some((p) => Math.hypot(p.x - x, p.z - z) < p.foot + foot + 1.5)) continue;
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      g.rotation.y = yaw;
      for (const [px, py, pz, sx, sy, sz, tilt] of pieces) {
        const m = new THREE.Mesh(geo, this.obsMat);
        m.position.set(px, py, pz); m.scale.set(sx, sy, sz); m.rotation.x = -tilt;
        m.castShadow = true; m.receiveShadow = true;
        g.add(m);
      }
      this.group.add(g);
      g.updateMatrixWorld(true);
      for (const m of g.children) {
        const wp = new THREE.Vector3(), wq = new THREE.Quaternion(), ws = new THREE.Vector3();
        m.matrixWorld.decompose(wp, wq, ws);
        P.addStaticBox(wp.x, wp.y, wp.z, ws.x / 2, ws.y / 2, ws.z / 2, wq, 0.7, this.colliders);
      }
      placed.push({ x, z, foot, kind, group: g });
    }
    this.obstacles = placed;
  }

  buildSpawns() {
    this.spawns = [];
    for (let i = 0; i < 8; i++) {
      const a0 = (i / 8) * Math.PI * 2 + 0.2;
      for (let k = 0; k < 24; k++) {
        const a = a0 + (k % 2 ? 1 : -1) * Math.floor(k / 2) * 0.09, d = 12.5 - (k % 3);
        const x = Math.cos(a) * d, z = Math.sin(a) * d;
        if (!this.inside(x, z, 2.5)) continue;
        if (this.obstacles.some((o) => Math.hypot(o.x - x, o.z - z) < o.foot + 1.6)) continue;
        this.spawns.push(new THREE.Vector3(x, 1.4, z));
        break;
      }
    }
    if (!this.spawns.length) this.spawns.push(new THREE.Vector3(0, 1.4, 4));
  }

  clear() {
    this.E.physics.removeColliders(this.colliders);
    this.clearPaint();
    for (const c of [...this.group.children]) { this.group.remove(c); if (c.geometry && c !== this.top) c.geometry.dispose(); }
    if (this.top) this.top.geometry.dispose();
    this.obstacles = [];
  }

  clearPaint() {
    this.E.physics.removeColliders(this.paintColliders);
    if (this.paintGroup) { this.group.remove(this.paintGroup); this.paintGroup.traverse((o) => { if (o.isInstancedMesh) o.dispose(); }); }
    this.paintGroup = null;
    this.props = [];
  }

  resetLook() {
    this.clearPaint();
    this.recipe = null;
    this.surface = 'normal';
    this.topMat.map = this.paperTex;
    this.uniforms.rRadius.value = -100;
    this.uniforms.aScale.value = 1 / 8;
    this.look = { ...PAPER };
    this.applyLook(this.look, 1);
    this.reveal = null;
    this.E.fx && this.E.fx.setAmbient('none');
  }

  applyLook(L, t) {
    const R = this.E.renderer;
    const lerp = (target, to) => target.lerp(new THREE.Color(to), t);
    lerp(R.bg, L.sky); lerp(R.scene.fog.color, L.fog); lerp(R.sun.color, L.light);
    lerp(this.sideMat.color, L.cliff); lerp(this.underMat.color, L.cliff); lerp(this.obsMat.color, L.obstacles);
  }

  paint(recipe, origin, seed = 7, dur = 3.2) {
    this.clearPaint();
    this.recipe = recipe;
    const tex = patternTexture(recipe.pattern, recipe.ground[0], recipe.ground[1], seed);
    this.uniforms.mapB.value = tex;
    this.uniforms.rOrigin.value.set(origin.x, origin.z);
    this.uniforms.rRadius.value = 0;
    const rng = mulberry32(seed * 31 + 5);
    this.paintGroup = new THREE.Group();
    this.group.add(this.paintGroup);
    this.props = [];
    const dummy = new THREE.Object3D();
    for (const pr of recipe.props) {
      if (!pr.count) continue;
      const model = buildModel(pr.parts, pr.size, { static: true });
      const spots = [];
      for (let k = 0; k < pr.count * 6 && spots.length < pr.count; k++) {
        const a = rng() * Math.PI * 2, d = Math.sqrt(rng()) * (this.shape.R - 1);
        const x = Math.cos(a) * d, z = Math.sin(a) * d;
        if (!this.inside(x, z, 1) || Math.hypot(x, z) < 4) continue;
        if (this.obstacles.some((o) => Math.hypot(o.x - x, o.z - z) < o.foot + 0.8)) continue;
        spots.push({ x, z, yaw: rng() * Math.PI * 2, s: 0.75 + rng() * 0.5 });
      }
      const meshes = [];
      for (const m of model.group.children) {
        if (!m.isMesh) continue;
        const im = new THREE.InstancedMesh(m.geometry, m.material, spots.length);
        im.castShadow = true;
        im.receiveShadow = false;
        for (let i = 0; i < spots.length; i++) { dummy.position.set(spots[i].x, 0, spots[i].z); dummy.rotation.set(0, spots[i].yaw, 0); dummy.scale.setScalar(0.0001); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); }
        this.paintGroup.add(im);
        meshes.push(im);
      }
      this.props.push({ meshes, spots, dims: model.dims, collide: pr.collide });
      if (pr.collide && model.dims[0] > 0.5) {
        for (const s of spots) this.E.physics.addStaticBox(s.x, model.dims[1] * s.s / 2, s.z, model.dims[0] * s.s * 0.3, model.dims[1] * s.s / 2, model.dims[2] * s.s * 0.3, null, 0.7, this.paintColliders);
      }
    }
    if (recipe.landmark) {
      const lm = buildModel(recipe.landmark.parts, recipe.landmark.size, { receive: true });
      let spot = null;
      for (let k = 0; k < 60 && !spot; k++) {
        const a = rng() * Math.PI * 2, d = 11 + rng() * 9;
        const x = Math.cos(a) * d, z = Math.sin(a) * d;
        if (!this.inside(x, z, lm.radius + 1)) continue;
        if (this.obstacles.some((o) => Math.hypot(o.x - x, o.z - z) < o.foot + lm.radius)) continue;
        if (this.spawns.some((s) => Math.hypot(s.x - x, s.z - z) < lm.radius + 2)) continue;
        spot = { x, z, yaw: rng() * 6.28 };
      }
      if (spot) {
        lm.group.position.set(spot.x, 0, spot.z);
        lm.group.rotation.y = spot.yaw;
        lm.group.scale.setScalar(0.0001);
        this.paintGroup.add(lm.group);
        this.landmark = { model: lm, spot };
        const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), spot.yaw);
        for (const b of modelColliderBoxes(recipe.landmark.parts, recipe.landmark.size, 6)) {
          const p = new THREE.Vector3(b.x, b.y, b.z).applyQuaternion(q);
          this.E.physics.addStaticBox(spot.x + p.x, p.y, spot.z + p.z, b.hx * 0.85, b.hy, b.hz * 0.85, q.clone().multiply(b.q), 0.7, this.paintColliders);
        }
      } else this.landmark = null;
    } else this.landmark = null;
    const from = { ...this.look };
    const to = { sky: recipe.sky, fog: recipe.fog, light: recipe.light, cliff: recipe.cliff, obstacles: recipe.obstacles };
    this.reveal = { t: 0, dur, origin: new THREE.Vector2(origin.x, origin.z), maxR: this.shape.R * 2.2, from, to, tex };
    this.surfaceNext = recipe.surface;
    this.E.fx && this.E.fx.setAmbient(recipe.particles);
  }

  update(dt) {
    if (this.reveal) {
      const rv = this.reveal;
      rv.t += dt;
      const k = Math.min(1, rv.t / rv.dur);
      const e = 1 - Math.pow(1 - k, 2);
      const R = e * rv.maxR;
      this.uniforms.rRadius.value = R;
      this.applyLook(rv.to, Math.min(1, dt * 2.2));
      if (k > 0.35 && this.surfaceNext) { this.surface = this.surfaceNext; this.surfaceNext = null; }
      const dummy = new THREE.Object3D();
      for (const p of this.props) {
        for (let i = 0; i < p.spots.length; i++) {
          const s = p.spots[i];
          const d = Math.hypot(s.x - rv.origin.x, s.z - rv.origin.y);
          const g = Math.min(1, Math.max(0, (R - d) / 3));
          const sc = g <= 0 ? 0.0001 : s.s * (g < 1 ? 1 + Math.sin(g * Math.PI) * 0.25 : 1);
          dummy.position.set(s.x, 0, s.z); dummy.rotation.set(0, s.yaw, 0); dummy.scale.setScalar(sc); dummy.updateMatrix();
          for (const m of p.meshes) m.setMatrixAt(i, dummy.matrix);
        }
        for (const m of p.meshes) m.instanceMatrix.needsUpdate = true;
      }
      if (this.landmark) {
        const s = this.landmark.spot, d = Math.hypot(s.x - rv.origin.x, s.z - rv.origin.y);
        const g = Math.min(1, Math.max(0, (R - d) / 6));
        this.landmark.model.group.scale.setScalar(g <= 0 ? 0.0001 : g < 1 ? g * (1 + Math.sin(g * Math.PI) * 0.15) : 1);
      }
      if (k >= 1) {
        this.topMat.map = rv.tex;
        this.uniforms.aScale.value = 1 / 7;
        this.uniforms.rRadius.value = -100;
        this.look = { ...this.look, ...rv.to };
        this.applyLook(rv.to, 1);
        this.reveal = null;
      }
    }
    const z = this.zone;
    if (z.r < 98) {
      z.r += (z.target - z.r) * Math.min(1, dt * 0.4);
      this.zoneMesh.visible = true;
      this.zoneMesh.scale.set(z.r, 1, z.r);
      this.zoneMesh.position.y = 2;
    } else this.zoneMesh.visible = false;
  }

  setZone(r) { this.zone.target = r; if (r >= 98) { this.zone.r = 99; } else if (this.zone.r >= 98) this.zone.r = this.shape.R + 6; }

  randomPoint(rng = Math.random, margin = 2) {
    for (let i = 0; i < 60; i++) {
      const a = rng() * Math.PI * 2, d = Math.sqrt(rng()) * (this.shape.R - margin);
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (this.inside(x, z, margin)) return new THREE.Vector3(x, 0, z);
    }
    return new THREE.Vector3(0, 0, 0);
  }
}
