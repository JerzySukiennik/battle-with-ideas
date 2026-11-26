// Battle with Ideas: the floating nature island (seeded hills and pits, Kenney Nature Kit scenery), drawn as the Boredom's pencil sketch until someone paints it.

import * as THREE from 'three';
import RAPIER from 'rapier';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mulberry32, noise2, fbm } from '../shared/rng.js';
import { paperTexture, patternTexture } from './textures.js';
import { buildModel, modelColliderBoxes } from '../engine/prims.js';
import { GR } from '../engine/physics.js';
import { SKETCH, sketchify, REVEAL_GLSL } from '../engine/sketch.js';

const HALF = 36;
const PAPER = { sky: '#e9e7e1', fog: '#e4e2dc', light: '#fff8ee' };
const MODELS = ['tree_default', 'tree_detailed', 'tree_fat', 'tree_oak', 'tree_simple', 'tree_small', 'tree_tall', 'sv_tree_autumn', 'rock_large_a', 'rock_large_b', 'rock_tall_a', 'sv_rock_a', 'sv_rock_b', 'sv_rock_c', 'sv_rock_flat_grass', 'rock_small_a', 'rock_small_b', 'rock_small_c', 'log', 'log_large', 'sv_tree_log', 'stump_old', 'stump_round', 'plant_bush', 'plant_bush_large', 'plant_bush_small', 'grass', 'grass_large', 'grass_leafs', 'flower_purple_a', 'flower_red_a', 'flower_yellow_a', 'mushroom_tan'];
const ASSETS = {};
const RECOLOR = { grass: '#6fb24b', leafsGreen: '#4c9a3e', woodBark: '#8a5a3b', woodInner: '#e3c79c', dirt: '#8d6e52' };

const SCATTER = [
  { pick: ['rock_large_a', 'rock_large_b', 'rock_tall_a', 'sv_rock_a', 'sv_rock_b', 'sv_rock_c'], n: 11, scale: [2.6, 4.4], collide: 'box', foot: 1.6, shadow: true, cover: true },
  { pick: ['tree_default', 'tree_detailed', 'tree_fat', 'tree_oak', 'tree_simple', 'tree_tall', 'sv_tree_autumn'], n: 18, scale: [2.4, 3.4], collide: 'trunk', foot: 1.1, shadow: true },
  { pick: ['tree_small'], n: 6, scale: [2.2, 2.8], collide: 'trunk', foot: 0.8, shadow: true },
  { pick: ['log_large', 'log', 'sv_tree_log'], n: 5, scale: [2.2, 3], collide: 'box', foot: 1.4, shadow: true, cover: true },
  { pick: ['stump_old', 'stump_round'], n: 5, scale: [2, 2.6], collide: 'box', foot: 0.7, shadow: true },
  { pick: ['sv_rock_flat_grass'], n: 2, scale: [4.5, 5.5], collide: 'box', foot: 2.6, shadow: true, cover: true },
  { pick: ['plant_bush', 'plant_bush_large', 'plant_bush_small'], n: 24, scale: [2, 3], foot: 0.6, shadow: true, decor: true },
  { pick: ['rock_small_a', 'rock_small_b', 'rock_small_c'], n: 22, scale: [1.6, 3], foot: 0.4, shadow: true },
  { pick: ['grass', 'grass_large', 'grass_leafs'], n: 110, scale: [2.2, 3.2], foot: 0.2, decor: true },
  { pick: ['flower_purple_a', 'flower_red_a', 'flower_yellow_a'], n: 46, scale: [2.4, 3.2], foot: 0.2, decor: true },
  { pick: ['mushroom_tan'], n: 14, scale: [2.2, 3.2], foot: 0.2, decor: true },
];

const TERRAIN_MAP = `
  vec4 texA = texture2D(map, vSkW.xz * aScale);
  vec4 texB = texture2D(mapB, vSkW.xz * rScale);
  ${REVEAL_GLSL}
  diffuseColor *= mix(texA, texB, max(uColor, skReveal));
`;

export class Island {
  static async loadAssets() {
    const loader = new GLTFLoader();
    await Promise.all(MODELS.map((name) => new Promise((res) => {
      loader.load(`assets/models/nature/${name}.glb`, (gltf) => {
        const parts = [];
        gltf.scene.updateMatrixWorld(true);
        gltf.scene.traverse((o) => {
          if (!o.isMesh) return;
          const g = o.geometry.clone();
          g.applyMatrix4(o.matrixWorld);
          const m = o.material.clone();
          m.roughness = 0.85; m.metalness = 0;
          if (RECOLOR[m.name]) m.color.set(RECOLOR[m.name]);
          if (m.name === '_defaultMat' && name.startsWith('rock')) m.color.set('#a9a59d');
          if (m.name === 'grass' && name.startsWith('flower')) m.color.set('#5ea543');
          sketchify(m);
          parts.push({ geo: g, mat: m });
        });
        const box = new THREE.Box3();
        for (const p of parts) { p.geo.computeBoundingBox(); box.union(p.geo.boundingBox); }
        ASSETS[name] = { parts, box };
        res();
      }, undefined, () => res());
    })));
  }

  constructor(E) {
    this.E = E;
    this.group = new THREE.Group();
    E.renderer.scene.add(this.group);
    this.colliders = [];
    this.paintColliders = [];
    this.obstacles = [];
    this.spawns = [];
    this.holes = [];
    this.hills = [];
    this.surface = 'normal';
    this.conveyor = new THREE.Vector2(1, 0);
    this.paperTex = paperTexture();
    this.recipe = null;
    this.reveal = null;
    this.zone = { r: 99, target: 99 };
    this.terrainU = { mapB: { value: this.paperTex }, rScale: { value: 1 / 7 }, aScale: { value: 1 / 8 } };
    this.topMat = sketchify(new THREE.MeshStandardMaterial({ map: this.paperTex, vertexColors: true, roughness: 0.95, metalness: 0 }), {
      key: 'terrain', uniforms: this.terrainU, head: 'uniform sampler2D mapB; uniform float rScale; uniform float aScale;\n', map: TERRAIN_MAP,
    });
    this.rockMat = sketchify(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }));
    this.zoneMat = new THREE.MeshBasicMaterial({ color: '#9c9a95', transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false, fog: false });
    this.zoneMesh = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 40, 64, 1, true), this.zoneMat);
    this.zoneMesh.visible = false;
    E.renderer.scene.add(this.zoneMesh);
    this.look = { ...PAPER };
    this.decor = [];
  }

  radiusAt(a) {
    const s = this.shape;
    return s.R * (1 + 0.1 * Math.sin(3 * a + s.p1) + 0.06 * Math.sin(5 * a + s.p2) + 0.035 * Math.sin(9 * a + s.p3) + 0.06 * (noise2(Math.cos(a) * 2 + 9, Math.sin(a) * 2 + 9, s.seed) - 0.5));
  }

  insideOutline(x, z, margin = 0) { return Math.hypot(x, z) < this.radiusAt(Math.atan2(z, x)) - margin; }

  inside(x, z, margin = 0) {
    if (!this.insideOutline(x, z, margin)) return false;
    for (const h of this.holes) if (Math.hypot(x - h.x, z - h.z) < h.r + margin) return false;
    return true;
  }

  heightAt(x, z) {
    const r = Math.hypot(x, z);
    const edge = this.radiusAt(Math.atan2(z, x));
    if (r > edge) return -40;
    const s = this.shape.seed;
    let h = (fbm(x * 0.05 + 3.1, z * 0.05 + 7.7, s, 4) - 0.47) * 3.4;
    for (const k of this.hills) { const d2 = (x - k.x) ** 2 + (z - k.z) ** 2; h += k.h * Math.exp(-d2 / (2 * k.s * k.s)); }
    h *= 0.35 + 0.65 * THREE.MathUtils.smoothstep(r, 3.5, 10);
    const toEdge = edge - r;
    if (toEdge < 3) h -= (1 - toEdge / 3) ** 2 * 1.1;
    for (const p of this.holes) {
      const d = Math.hypot(x - p.x, z - p.z);
      if (d < p.r + 1.6) { let k = Math.min(1, Math.max(0, (p.r + 1.6 - d) / 2)); k = k * k * (3 - 2 * k); h = THREE.MathUtils.lerp(h, -40, k * k); }
    }
    return h;
  }

  build(seed) {
    this.clear();
    this.seed = seed;
    const rng = mulberry32(seed);
    this.shape = { R: 27 + rng() * 3, p1: rng() * 6.28, p2: rng() * 6.28, p3: rng() * 6.28, seed: seed % 997 };
    this.holes = [];
    const nh = 1 + Math.floor(rng() * 2.2);
    for (let i = 0; i < 40 && this.holes.length < nh; i++) {
      const a = rng() * Math.PI * 2, d = 9 + rng() * 8, r = 1.8 + rng() * 1.2;
      const h = { x: Math.cos(a) * d, z: Math.sin(a) * d, r };
      if (d + r > this.radiusAt(a) - 5) continue;
      if (this.holes.some((o) => Math.hypot(o.x - h.x, o.z - h.z) < o.r + h.r + 8)) continue;
      this.holes.push(h);
    }
    this.hills = [];
    for (let i = 0; i < 4; i++) {
      const a = rng() * Math.PI * 2, d = 10 + rng() * 10;
      this.hills.push({ x: Math.cos(a) * d, z: Math.sin(a) * d, h: 1.6 + rng() * 2.2, s: 3.5 + rng() * 3 });
    }
    this.buildTerrain();
    this.buildCollider();
    this.buildSpawns();
    this.buildScenery(rng);
    this.resetLook();
  }

  buildTerrain() {
    const K = 52, N = 220;
    const pos = [], col = [], idx = [];
    const c = new THREE.Color();
    const ringAt = (k) => k / K;
    pos.push(0, this.heightAt(0, 0), 0);
    col.push(1, 1, 1);
    for (let k = 1; k <= K; k++) {
      const t = Math.pow(ringAt(k), 0.9);
      for (let i = 0; i < N; i++) {
        const a = (i / N) * Math.PI * 2;
        const R = this.radiusAt(a) * (k === K ? 1 : t);
        const x = Math.cos(a) * R, z = Math.sin(a) * R;
        const y = k === K ? this.heightAt(x * 0.995, z * 0.995) : this.heightAt(x, z);
        pos.push(x, y, z);
        const v = 0.86 + noise2(x * 0.3, z * 0.3, 3) * 0.14;
        c.setRGB(v, v * 1.0, v * 0.97);
        if (y < -2) c.multiplyScalar(0.55);
        col.push(c.r, c.g, c.b);
      }
    }
    const vid = (k, i) => (k === 0 ? 0 : 1 + (k - 1) * N + (i % N));
    for (let i = 0; i < N; i++) idx.push(0, vid(1, i + 1), vid(1, i));
    for (let k = 1; k < K; k++) for (let i = 0; i < N; i++) {
      const a = vid(k, i), b = vid(k, i + 1), cc = vid(k + 1, i), d = vid(k + 1, i + 1);
      idx.push(a, b, cc, b, d, cc);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    this.top = new THREE.Mesh(g, this.topMat);
    this.top.receiveShadow = true;
    this.group.add(this.top);
    this.under = new THREE.Mesh(this.underside(N), this.rockMat);
    this.under.receiveShadow = true;
    this.group.add(this.under);
  }

  underside(N) {
    const levels = [[0.35, 1.012], [-1.4, 0.99], [-3.6, 0.9], [-6.6, 0.72], [-9.8, 0.5], [-13, 0.3], [-16, 0.13]];
    const rings = [];
    for (let l = 0; l < levels.length; l++) {
      const ring = [];
      for (let i = 0; i < N; i++) {
        const a = (i / N) * Math.PI * 2;
        const R = this.radiusAt(a);
        const n = l < 2 ? 1 : 1 + (noise2(i * 0.18, l * 2.7, this.shape.seed) - 0.5) * 0.36;
        const x = Math.cos(a) * R * levels[l][1] * n, z = Math.sin(a) * R * levels[l][1] * n;
        const top = this.heightAt(Math.cos(a) * R * 0.995, Math.sin(a) * R * 0.995);
        const y = l === 0 ? top - 0.05 : levels[l][0] + Math.min(0, top) * 0.3 + (l > 1 ? (noise2(i * 0.3, l, 5) - 0.5) * 1.8 : 0);
        ring.push([x, y, z]);
      }
      rings.push(ring);
    }
    const tip = [0, -20, 0];
    const pos = [], col = [];
    const c = new THREE.Color();
    const shade = (y) => { const band = 0.5 + 0.5 * Math.sin(y * 2.1); const v = 0.62 + band * 0.12 + (y > -1.5 ? 0.15 : 0); c.setRGB(v, v * 0.97, v * 0.93); return [c.r, c.g, c.b]; };
    const tri = (a, b, d) => { for (const p of [a, b, d]) { pos.push(...p); col.push(...shade(p[1])); } };
    for (let l = 0; l < rings.length - 1; l++) for (let i = 0; i < N; i++) {
      const a = rings[l][i], b = rings[l][(i + 1) % N], cc = rings[l + 1][i], d = rings[l + 1][(i + 1) % N];
      tri(a, cc, b); tri(b, cc, d);
    }
    const last = rings[rings.length - 1];
    for (let i = 0; i < N; i++) tri(last[i], tip, last[(i + 1) % N]);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    return g;
  }

  buildCollider() {
    const n = HALF * 2;
    const h = new Float32Array((n + 1) * (n + 1));
    for (let col = 0; col <= n; col++) for (let row = 0; row <= n; row++) {
      const x = -HALF + col, z = -HALF + row;
      h[row + col * (n + 1)] = this.heightAt(x, z);
    }
    const d = RAPIER.ColliderDesc.heightfield(n, n, h, { x: n, y: 1, z: n }).setFriction(0.85).setRestitution(0.05).setCollisionGroups(GR.static);
    this.colliders.push(this.E.physics.world.createCollider(d));
  }

  buildSpawns() {
    this.spawns = [];
    for (let i = 0; i < 8; i++) {
      const a0 = (i / 8) * Math.PI * 2 + 0.2;
      for (let k = 0; k < 24; k++) {
        const a = a0 + (k % 2 ? 1 : -1) * Math.floor(k / 2) * 0.09, d = 12.5 - (k % 3);
        const x = Math.cos(a) * d, z = Math.sin(a) * d;
        if (!this.inside(x, z, 3)) continue;
        this.spawns.push(new THREE.Vector3(x, this.heightAt(x, z) + 0.1, z));
        break;
      }
    }
    if (!this.spawns.length) this.spawns.push(new THREE.Vector3(0, this.heightAt(0, 4) + 0.1, 4));
  }

  buildScenery(rng) {
    const P = this.E.physics;
    const buckets = new Map();
    const placed = [];
    const ok = (x, z, foot, cover) => {
      if (!this.inside(x, z, foot + 1)) return false;
      if (Math.hypot(x, z) < 5 + foot) return false;
      if (this.spawns.some((s) => Math.hypot(s.x - x, s.z - z) < (cover ? 4 : 2.2) + foot)) return false;
      if (placed.some((p) => p.collide && Math.hypot(p.x - x, p.z - z) < p.foot + foot + (cover ? 2.5 : 0.6))) return false;
      return true;
    };
    for (const S of SCATTER) {
      let made = 0;
      for (let tries = 0; tries < S.n * 12 && made < S.n; tries++) {
        const name = S.pick[Math.floor(rng() * S.pick.length)];
        const A = ASSETS[name];
        if (!A) continue;
        const a = rng() * Math.PI * 2, d = Math.sqrt(rng()) * (this.shape.R - 1.5);
        const x = Math.cos(a) * d, z = Math.sin(a) * d;
        const sc = S.scale[0] + rng() * (S.scale[1] - S.scale[0]);
        const foot = S.foot * sc / 2.5;
        if (!ok(x, z, foot, S.cover)) continue;
        if (S.collide && placed.some((p) => !p.collide && Math.hypot(p.x - x, p.z - z) < foot)) continue;
        const y = this.minHeightAround(x, z, foot * 0.6) - 0.08;
        const yaw = rng() * Math.PI * 2;
        const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(sc, sc, sc));
        if (!buckets.has(name)) buckets.set(name, { list: [], shadow: !!S.shadow, decor: !!S.decor });
        buckets.get(name).list.push(m);
        placed.push({ x, z, foot, collide: !!S.collide });
        if (S.collide) {
          const b = A.box, q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
          if (S.collide === 'trunk') {
            const hgt = (b.max.y - b.min.y) * sc;
            P.addStaticBox(x, y + hgt * 0.3, z, 0.12 * sc, hgt * 0.3, 0.12 * sc, q, 0.6, this.colliders);
          } else {
            const cx = (b.min.x + b.max.x) / 2 * sc, cy = (b.min.y + b.max.y) / 2 * sc, cz = (b.min.z + b.max.z) / 2 * sc;
            const off = new THREE.Vector3(cx, cy, cz).applyQuaternion(q);
            P.addStaticBox(x + off.x, y + off.y, z + off.z, (b.max.x - b.min.x) * sc * 0.42, (b.max.y - b.min.y) * sc * 0.5, (b.max.z - b.min.z) * sc * 0.42, q, 0.7, this.colliders);
          }
          this.obstacles.push({ x, z, foot, kind: name });
        }
        made++;
      }
    }
    for (const [name, B] of buckets) {
      for (const part of ASSETS[name].parts) {
        const im = new THREE.InstancedMesh(part.geo, part.mat, B.list.length);
        B.list.forEach((m, i) => im.setMatrixAt(i, m));
        im.castShadow = B.shadow;
        im.receiveShadow = true;
        im.computeBoundingSphere();
        this.group.add(im);
        if (B.decor) this.decor.push(im);
      }
    }
  }

  minHeightAround(x, z, r) {
    let m = this.heightAt(x, z);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; m = Math.min(m, this.heightAt(x + Math.cos(a) * r, z + Math.sin(a) * r)); }
    return Math.max(m, this.heightAt(x, z) - 0.8);
  }

  clear() {
    this.E.physics.removeColliders(this.colliders);
    this.clearPaint();
    for (const c of [...this.group.children]) { this.group.remove(c); if (c.isInstancedMesh) c.dispose(); else if (c.geometry) c.geometry.dispose(); }
    this.obstacles = [];
    this.decor = [];
  }

  clearPaint() {
    this.E.physics.removeColliders(this.paintColliders);
    if (this.paintGroup) { this.group.remove(this.paintGroup); this.paintGroup.traverse((o) => { if (o.isInstancedMesh) o.dispose(); }); }
    this.paintGroup = null;
    this.props = [];
    this.landmark = null;
  }

  resetLook() {
    this.clearPaint();
    this.recipe = null;
    this.surface = 'normal';
    this.topMat.map = this.paperTex;
    this.terrainU.mapB.value = this.paperTex;
    this.terrainU.aScale.value = 1 / 8;
    SKETCH.uColor.value = 0;
    SKETCH.uRadius.value = -100;
    SKETCH.uTintAmt.value = 0;
    this.look = { ...PAPER };
    this.applyLook(this.look, 1);
    this.reveal = null;
    this.E.fx && this.E.fx.setAmbient('none');
  }

  applyLook(L, t) {
    const R = this.E.renderer;
    const lerp = (target, to) => target.lerp(new THREE.Color(to), t);
    lerp(R.bg, L.sky); lerp(R.scene.fog.color, L.fog); lerp(R.sun.color, L.light);
  }

  paint(recipe, origin, seed = 7, dur = 3.2) {
    this.clearPaint();
    this.recipe = recipe;
    const tex = patternTexture(recipe.pattern, recipe.ground[0], recipe.ground[1], seed);
    this.terrainU.mapB.value = tex;
    SKETCH.uOrigin.value.set(origin.x, origin.z);
    SKETCH.uRadius.value = 0;
    SKETCH.uColor.value = 0;
    SKETCH.uTint.value.set(recipe.light);
    SKETCH.uTintAmt.value = 0.22;
    const rng = mulberry32(seed * 31 + 5);
    this.paintGroup = new THREE.Group();
    this.group.add(this.paintGroup);
    this.props = [];
    const dummy = new THREE.Object3D();
    for (const pr of recipe.props) {
      if (!pr.count) continue;
      const model = buildModel(pr.parts, pr.size, { static: true });
      const spots = [];
      const n = Math.ceil(pr.count * 0.6);
      for (let k = 0; k < n * 6 && spots.length < n; k++) {
        const a = rng() * Math.PI * 2, d = Math.sqrt(rng()) * (this.shape.R - 1.5);
        const x = Math.cos(a) * d, z = Math.sin(a) * d;
        if (!this.inside(x, z, 1) || Math.hypot(x, z) < 5) continue;
        if (this.obstacles.some((o) => Math.hypot(o.x - x, o.z - z) < o.foot + 0.8)) continue;
        if (this.spawns.some((s) => Math.hypot(s.x - x, s.z - z) < 2.2)) continue;
        spots.push({ x, y: this.minHeightAround(x, z, 0.4) - 0.05, z, yaw: rng() * Math.PI * 2, s: 0.75 + rng() * 0.5 });
      }
      const meshes = [];
      for (const m of model.group.children) {
        if (!m.isMesh) continue;
        const im = new THREE.InstancedMesh(m.geometry, m.material, spots.length);
        im.castShadow = true;
        for (let i = 0; i < spots.length; i++) { dummy.position.set(spots[i].x, spots[i].y, spots[i].z); dummy.rotation.set(0, spots[i].yaw, 0); dummy.scale.setScalar(0.0001); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); }
        this.paintGroup.add(im);
        meshes.push(im);
      }
      this.props.push({ meshes, spots });
      if (pr.collide && model.dims[0] > 0.5) {
        for (const s of spots) this.E.physics.addStaticBox(s.x, s.y + model.dims[1] * s.s / 2, s.z, model.dims[0] * s.s * 0.3, model.dims[1] * s.s / 2, model.dims[2] * s.s * 0.3, null, 0.7, this.paintColliders);
      }
    }
    if (recipe.landmark) {
      const lm = buildModel(recipe.landmark.parts, Math.min(recipe.landmark.size, 12), { receive: true });
      let spot = null;
      for (let k = 0; k < 80 && !spot; k++) {
        const a = rng() * Math.PI * 2, d = 11 + rng() * 9;
        const x = Math.cos(a) * d, z = Math.sin(a) * d;
        if (!this.inside(x, z, lm.radius + 1)) continue;
        if (this.obstacles.some((o) => Math.hypot(o.x - x, o.z - z) < o.foot + lm.radius)) continue;
        if (this.spawns.some((s) => Math.hypot(s.x - x, s.z - z) < lm.radius + 2)) continue;
        spot = { x, y: this.minHeightAround(x, z, lm.radius * 0.6) - 0.1, z, yaw: rng() * 6.28 };
      }
      if (spot) {
        lm.group.position.set(spot.x, spot.y, spot.z);
        lm.group.rotation.y = spot.yaw;
        lm.group.scale.setScalar(0.0001);
        this.paintGroup.add(lm.group);
        this.landmark = { model: lm, spot };
        const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), spot.yaw);
        for (const b of modelColliderBoxes(recipe.landmark.parts, Math.min(recipe.landmark.size, 12), 6)) {
          const p = new THREE.Vector3(b.x, b.y, b.z).applyQuaternion(q);
          this.E.physics.addStaticBox(spot.x + p.x, spot.y + p.y, spot.z + p.z, b.hx * 0.85, b.hy, b.hz * 0.85, q.clone().multiply(b.q), 0.7, this.paintColliders);
        }
      }
    }
    const to = { sky: recipe.sky, fog: recipe.fog, light: recipe.light };
    this.reveal = { t: 0, dur, origin: new THREE.Vector2(origin.x, origin.z), maxR: this.shape.R * 2.2, to, tex };
    this.surfaceNext = recipe.surface;
    this.E.fx && this.E.fx.setAmbient(recipe.particles);
  }

  update(dt) {
    if (this.reveal) {
      const rv = this.reveal;
      rv.t += dt;
      const k = Math.min(1, rv.t / rv.dur);
      const R = (1 - Math.pow(1 - k, 2)) * rv.maxR;
      SKETCH.uRadius.value = R;
      this.applyLook(rv.to, Math.min(1, dt * 2.2));
      if (k > 0.35 && this.surfaceNext) { this.surface = this.surfaceNext; this.surfaceNext = null; }
      const dummy = new THREE.Object3D();
      for (const p of this.props) {
        for (let i = 0; i < p.spots.length; i++) {
          const s = p.spots[i];
          const d = Math.hypot(s.x - rv.origin.x, s.z - rv.origin.y);
          const g = Math.min(1, Math.max(0, (R - d) / 3));
          const sc = g <= 0 ? 0.0001 : s.s * (g < 1 ? 1 + Math.sin(g * Math.PI) * 0.25 : 1);
          dummy.position.set(s.x, s.y, s.z); dummy.rotation.set(0, s.yaw, 0); dummy.scale.setScalar(sc); dummy.updateMatrix();
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
        this.terrainU.aScale.value = 1 / 7;
        SKETCH.uColor.value = 1;
        SKETCH.uRadius.value = -100;
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
      if (this.inside(x, z, margin)) return new THREE.Vector3(x, this.heightAt(x, z), z);
    }
    return new THREE.Vector3(0, this.heightAt(0, 0), 0);
  }
}
