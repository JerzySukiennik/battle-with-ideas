// Battle with Ideas: turns recipe parts (primitives in model units) into merged, animated three.js sculptures.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const D2R = Math.PI / 180;
const UNIT = {};

function norm(g) {
  g.computeBoundingBox();
  const b = g.boundingBox, s = new THREE.Vector3(), c = new THREE.Vector3();
  b.getSize(s); b.getCenter(c);
  g.translate(-c.x, -c.y, -c.z);
  g.scale(1 / Math.max(s.x, 1e-3), 1 / Math.max(s.y, 1e-3), 1 / Math.max(s.z, 1e-3));
  const n = g.index ? g.toNonIndexed() : g;
  if (!n.attributes.uv) n.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2));
  n.computeVertexNormals();
  return n;
}

function starShape() {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 0.4 : 1;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    i ? s.lineTo(x, y) : s.moveTo(x, y);
  }
  s.closePath();
  return s;
}

function wedge() {
  const s = new THREE.Shape();
  s.moveTo(-0.5, -0.5); s.lineTo(0.5, -0.5); s.lineTo(-0.5, 0.5); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false });
  g.rotateY(Math.PI / 2);
  return g;
}

export function unitGeo(shape) {
  if (UNIT[shape]) return UNIT[shape];
  let g;
  switch (shape) {
    case 'sphere': g = new THREE.SphereGeometry(0.5, 18, 12); break;
    case 'dome': {
      const top = new THREE.SphereGeometry(0.5, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2);
      const cap = new THREE.CircleGeometry(0.5, 18); cap.rotateX(Math.PI / 2);
      g = mergeGeometries([top.toNonIndexed(), cap.toNonIndexed()]);
      break;
    }
    case 'cylinder': g = new THREE.CylinderGeometry(0.5, 0.5, 1, 18); break;
    case 'cone': g = new THREE.ConeGeometry(0.5, 1, 18); break;
    case 'capsule': g = new THREE.CapsuleGeometry(0.25, 0.5, 6, 14); break;
    case 'torus': g = new THREE.TorusGeometry(0.35, 0.15, 10, 22); break;
    case 'pyramid': g = new THREE.ConeGeometry(0.7071, 1, 4); g.rotateY(Math.PI / 4); break;
    case 'wedge': g = wedge(); break;
    case 'star': g = new THREE.ExtrudeGeometry(starShape(), { depth: 0.4, bevelEnabled: false }); break;
    default: g = new THREE.BoxGeometry(1, 1, 1);
  }
  UNIT[shape] = norm(g);
  return UNIT[shape];
}

export const MATERIALS = {};
const MAT_CACHE = new Map();

export function initMaterials() {
  MATERIALS.matte = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0 });
  MATERIALS.shiny = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.26, metalness: 0.04 });
  MATERIALS.metal = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.85 });
  MATERIALS.glow = new THREE.MeshBasicMaterial({ vertexColors: true });
  MATERIALS.glass = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.08, metalness: 0, transparent: true, opacity: 0.45, depthWrite: false });
  return MATERIALS;
}

export function solidMat(mat, color) {
  const k = mat + color;
  let m = MAT_CACHE.get(k);
  if (m) return m;
  const base = MATERIALS[mat] || MATERIALS.matte;
  m = base.clone();
  m.vertexColors = false;
  m.color = new THREE.Color(color);
  MAT_CACHE.set(k, m);
  return m;
}

const _c = new THREE.Color();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();

function partColor(hexc, desat) {
  _c.set(hexc);
  if (desat > 0) {
    const l = _c.r * 0.3 + _c.g * 0.59 + _c.b * 0.11;
    _c.r += (l - _c.r) * desat; _c.g += (l - _c.g) * desat; _c.b += (l - _c.b) * desat;
  }
  return _c;
}

export function partsBounds(parts) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const p of parts) {
    _e.set(p.r[0] * D2R, p.r[1] * D2R, p.r[2] * D2R);
    _q.setFromEuler(_e);
    for (let i = 0; i < 8; i++) {
      _v.set((i & 1 ? 0.5 : -0.5) * p.d[0], (i & 2 ? 0.5 : -0.5) * p.d[1], (i & 4 ? 0.5 : -0.5) * p.d[2]).applyQuaternion(_q);
      for (let k = 0; k < 3; k++) {
        const val = _v.getComponent(k) + p.p[k];
        if (val < min[k]) min[k] = val;
        if (val > max[k]) max[k] = val;
      }
    }
  }
  return { min, max, size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]] };
}

export function buildModel(parts, size, opt = {}) {
  const desat = opt.desat || 0;
  const b = partsBounds(parts);
  const longest = Math.max(b.size[0], b.size[1], b.size[2], 1e-3);
  const k = size / longest;
  const ox = (b.min[0] + b.max[0]) / 2, oz = (b.min[2] + b.max[2]) / 2;
  const oy = opt.center ? (b.min[1] + b.max[1]) / 2 : b.min[1];
  const group = new THREE.Group();
  const byMat = {};
  const anims = [];
  for (const p of parts) {
    const geo = unitGeo(p.s);
    _e.set(p.r[0] * D2R, p.r[1] * D2R, p.r[2] * D2R);
    _q.setFromEuler(_e);
    const px = (p.p[0] - ox) * k, py = (p.p[1] - oy) * k, pz = (p.p[2] - oz) * k;
    _s.set(Math.max(p.d[0] * k, 0.004), Math.max(p.d[1] * k, 0.004), Math.max(p.d[2] * k, 0.004));
    if (p.a === 'none' || opt.static) {
      const g = geo.clone();
      _m.compose(_v.set(px, py, pz), _q, _s);
      g.applyMatrix4(_m);
      const col = partColor(p.c, desat);
      const n = g.attributes.position.count;
      const arr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { arr[i * 3] = col.r; arr[i * 3 + 1] = col.g; arr[i * 3 + 2] = col.b; }
      g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
      (byMat[p.m] = byMat[p.m] || []).push(g);
    } else {
      const mesh = new THREE.Mesh(geo, solidMat(p.m, '#' + partColor(p.c, desat).getHexString()));
      mesh.scale.copy(_s);
      mesh.quaternion.copy(_q);
      mesh.castShadow = !opt.noShadow;
      const pivot = new THREE.Object3D();
      let pv = [px, py, pz], off = [0, 0, 0];
      if (p.a === 'swing') { pv = [px, py + _s.y * 0.45, pz]; off = [0, -_s.y * 0.45, 0]; }
      if (p.a === 'flap') { const sx = Math.sign(px) || 1; pv = [px - sx * _s.x * 0.45, py, pz]; off = [sx * _s.x * 0.45, 0, 0]; }
      pivot.position.set(pv[0], pv[1], pv[2]);
      mesh.position.set(off[0], off[1], off[2]);
      pivot.add(mesh);
      group.add(pivot);
      anims.push({ pivot, mesh, type: p.a, base: pivot.position.clone(), side: Math.sign(px) || 1, phase: (px * 3.1 + pz * 1.7) % 6.28, r: Math.max(_s.y, _s.z) * 0.5, baseScale: mesh.scale.clone() });
    }
  }
  for (const m in byMat) {
    const g = byMat[m].length === 1 ? byMat[m][0] : mergeGeometries(byMat[m]);
    const mesh = new THREE.Mesh(g, MATERIALS[m] || MATERIALS.matte);
    mesh.castShadow = !opt.noShadow;
    mesh.receiveShadow = !!opt.receive;
    group.add(mesh);
  }
  const dims = [b.size[0] * k, b.size[1] * k, b.size[2] * k];
  return { group, anims, dims, height: dims[1], radius: Math.max(dims[0], dims[2]) / 2, scale: k };
}

export function animateModel(model, t, speed = 0, dt = 0.016) {
  for (const a of model.anims) {
    const pv = a.pivot;
    switch (a.type) {
      case 'spin': pv.rotation.y = t * 2.4; break;
      case 'spin_fast': pv.rotation.y = t * 11; break;
      case 'bob': pv.position.y = a.base.y + Math.sin(t * 2.6 + a.phase) * a.r * 0.35; break;
      case 'flap': pv.rotation.z = Math.sin(t * 13 + a.phase) * 0.7 * a.side; break;
      case 'wiggle': pv.rotation.set(Math.sin(t * 9 + a.phase) * 0.18, Math.sin(t * 7.3 + a.phase) * 0.25, Math.sin(t * 8.1) * 0.15); break;
      case 'pulse': { const s = 1 + Math.sin(t * 5 + a.phase) * 0.12; a.mesh.scale.copy(a.baseScale).multiplyScalar(s); break; }
      case 'swing': pv.rotation.x = Math.sin(t * (4 + speed * 1.4) + a.phase + (a.side > 0 ? 0 : Math.PI)) * (0.25 + Math.min(0.5, speed * 0.08)); break;
      case 'wheel': pv.rotation.x += (speed / Math.max(a.r, 0.05)) * dt; break;
      case 'orbit': { const ang = t * 2; const r = Math.hypot(a.base.x, a.base.z); const a0 = Math.atan2(a.base.z, a.base.x); pv.position.set(Math.cos(a0 + ang) * r, a.base.y, Math.sin(a0 + ang) * r); break; }
      default: break;
    }
  }
}

export function disposeModel(model) {
  model.group.traverse((o) => { if (o.isMesh && o.geometry && !Object.values(UNIT).includes(o.geometry)) o.geometry.dispose(); });
}

export function modelColliderBoxes(parts, size, maxBoxes = 6) {
  const b = partsBounds(parts);
  const longest = Math.max(b.size[0], b.size[1], b.size[2], 1e-3);
  const k = size / longest;
  const ox = (b.min[0] + b.max[0]) / 2, oz = (b.min[2] + b.max[2]) / 2, oy = b.min[1];
  const big = parts.map((p) => ({ p, vol: p.d[0] * p.d[1] * p.d[2] })).sort((a, c) => c.vol - a.vol).slice(0, maxBoxes);
  return big.map(({ p }) => {
    _e.set(p.r[0] * D2R, p.r[1] * D2R, p.r[2] * D2R);
    const q = new THREE.Quaternion().setFromEuler(_e);
    return { x: (p.p[0] - ox) * k, y: (p.p[1] - oy) * k, z: (p.p[2] - oz) * k, hx: Math.max(0.05, p.d[0] * k / 2), hy: Math.max(0.05, p.d[1] * k / 2), hz: Math.max(0.05, p.d[2] * k / 2), q };
  });
}
