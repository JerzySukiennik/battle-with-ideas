// Battle with Ideas: turns recipe parts into smooth, rounded, softly shaded sculptures (merged static parts plus animated pivots).

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const D2R = Math.PI / 180;
const UNIT = {};
const LATHE = 28;

function finish(g) {
  const n = g.index ? g.toNonIndexed() : g;
  if (!n.attributes.uv) n.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2));
  for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'uv'].includes(k)) n.deleteAttribute(k);
  n.computeVertexNormals();
  return n;
}

function center(g) {
  g.computeBoundingBox();
  const c = new THREE.Vector3();
  g.boundingBox.getCenter(c);
  g.translate(-c.x, -c.y, -c.z);
  return g;
}

function fitTo(g, dx, dy, dz) {
  g.computeBoundingBox();
  const s = new THREE.Vector3();
  g.boundingBox.getSize(s);
  g.scale(dx / Math.max(s.x, 1e-4), dy / Math.max(s.y, 1e-4), dz / Math.max(s.z, 1e-4));
  return g;
}

function arc(pts, cx, cy, r, a0, a1, n = 5) {
  for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * (i / n); pts.push(new THREE.Vector2(cx + Math.cos(a) * r, cy + Math.sin(a) * r)); }
}

function lathe(profile, dx, dy, dz) {
  const g = new THREE.LatheGeometry(profile, LATHE);
  center(g);
  return fitTo(g, dx, dy, dz);
}

function roundedCylinder(dx, dy, dz, top = 1) {
  const R = 0.5, h = dy / Math.max(dx, dz);
  const f = Math.min(R * 0.28, h * 0.25);
  const rt = R * top;
  const pts = [new THREE.Vector2(0, -h / 2)];
  arc(pts, R - f, -h / 2 + f, f, -Math.PI / 2, 0);
  if (top < 0.08) { pts.push(new THREE.Vector2(rt + 0.04, h / 2 - 0.05)); arc(pts, 0, h / 2 - 0.05, 0.05, 0, Math.PI / 2, 3); }
  else { const ft = Math.min(rt * 0.28, f); arc(pts, rt - ft, h / 2 - ft, ft, 0, Math.PI / 2); }
  pts.push(new THREE.Vector2(0, h / 2));
  return lathe(pts, dx, dy, dz);
}

function teardrop(dx, dy, dz) {
  const pts = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16, a = t * Math.PI;
    const r = Math.sin(a) * (1 - t * 0.55) * 0.5;
    pts.push(new THREE.Vector2(Math.max(0, r), -Math.cos(a) * 0.5 + t * 0.35));
  }
  pts[pts.length - 1].x = 0;
  return lathe(pts, dx, dy, dz);
}

function dome(dx, dy, dz) {
  const pts = [new THREE.Vector2(0, 0)];
  const f = 0.06;
  arc(pts, 0.5 - f, f, f, -Math.PI / 2, 0, 3);
  for (let i = 1; i <= 12; i++) { const a = (i / 12) * Math.PI / 2; pts.push(new THREE.Vector2(Math.cos(a) * 0.5, f + Math.sin(a) * 0.5)); }
  return lathe(pts, dx, dy, dz);
}

function shape2D(kind) {
  const s = new THREE.Shape();
  if (kind === 'star') {
    for (let i = 0; i < 10; i++) { const a = Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 0.42 : 1; const x = Math.cos(a) * r, y = Math.sin(a) * r; i ? s.lineTo(x, y) : s.moveTo(x, y); }
  } else if (kind === 'heart') {
    s.moveTo(0, -0.9);
    s.bezierCurveTo(-0.3, -0.55, -1, -0.2, -1, 0.3);
    s.bezierCurveTo(-1, 0.75, -0.5, 1, 0, 0.62);
    s.bezierCurveTo(0.5, 1, 1, 0.75, 1, 0.3);
    s.bezierCurveTo(1, -0.2, 0.3, -0.55, 0, -0.9);
  } else {
    s.moveTo(-0.5, -0.5); s.lineTo(0.5, -0.5); s.lineTo(-0.5, 0.5);
  }
  s.closePath();
  return s;
}

function extruded(kind, dx, dy, dz) {
  const thick = kind === 'wedge' ? 1 : 0.42;
  const bev = kind === 'wedge' ? 0.05 : 0.12;
  const g = new THREE.ExtrudeGeometry(shape2D(kind), { depth: thick, bevelEnabled: true, bevelThickness: bev, bevelSize: bev * (kind === 'wedge' ? 1 : 0.8), bevelSegments: 3, curveSegments: 10 });
  if (kind === 'wedge') g.rotateY(Math.PI / 2);
  center(g);
  return fitTo(g, dx, dy, dz);
}

function blob(dx, dy, dz, seed = 1) {
  const g = new THREE.IcosahedronGeometry(0.5, 3);
  const p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = Math.sin(v.x * 9 + seed) * Math.cos(v.y * 8 + seed * 1.7) * Math.sin(v.z * 7 + seed * 0.3);
    v.multiplyScalar(1 + n * 0.12 + Math.sin(Math.atan2(v.z, v.x) * 5 + seed) * 0.05);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  return fitTo(g, dx, dy, dz);
}

export function partGeometry(shape, dx, dy, dz, seed = 1) {
  dx = Math.max(dx, 0.004); dy = Math.max(dy, 0.004); dz = Math.max(dz, 0.004);
  let g;
  switch (shape) {
    case 'box': { const r = Math.min(dx, dy, dz) * 0.2; g = new RoundedBoxGeometry(dx, dy, dz, 3, Math.max(0.0005, Math.min(r, Math.min(dx, dy, dz) * 0.49))); break; }
    case 'sphere': g = new THREE.SphereGeometry(0.5, 28, 18); g.scale(dx, dy, dz); break;
    case 'dome': g = dome(dx, dy, dz); break;
    case 'cylinder': g = roundedCylinder(dx, dy, dz, 1); break;
    case 'frustum': g = roundedCylinder(dx, dy, dz, 0.55); break;
    case 'cone': g = roundedCylinder(dx, dy, dz, 0); break;
    case 'capsule': { const r = Math.min(dx, dz) / 2; g = new THREE.CapsuleGeometry(r, Math.max(0.001, dy - 2 * r), 8, 20); g.scale(dx / (2 * r), 1, dz / (2 * r)); break; }
    case 'torus': g = new THREE.TorusGeometry(0.35, 0.15, 14, 36); fitTo(g, dx, dy, dz); break;
    case 'pyramid': g = new THREE.ConeGeometry(0.7071, 1, 4); g.rotateY(Math.PI / 4); fitTo(g, dx, dy, dz); break;
    case 'wedge': g = extruded('wedge', dx, dy, dz); break;
    case 'star': g = extruded('star', dx, dy, dz); break;
    case 'heart': g = extruded('heart', dx, dy, dz); break;
    case 'teardrop': g = teardrop(dx, dy, dz); break;
    case 'blob': g = blob(dx, dy, dz, seed); break;
    default: g = new RoundedBoxGeometry(dx, dy, dz, 2, Math.min(dx, dy, dz) * 0.15);
  }
  return finish(g);
}

export function unitGeo(shape) {
  if (!UNIT[shape]) UNIT[shape] = partGeometry(shape, 1, 1, 1, 3);
  return UNIT[shape];
}

export const MATERIALS = {};
const MAT_CACHE = new Map();

export function initMaterials() {
  MATERIALS.matte = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0, envMapIntensity: 0.7 });
  MATERIALS.shiny = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.2, metalness: 0.02, envMapIntensity: 1.3 });
  MATERIALS.metal = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.28, metalness: 0.9, envMapIntensity: 1.6 });
  MATERIALS.glow = new THREE.MeshBasicMaterial({ vertexColors: true });
  MATERIALS.glass = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.42, depthWrite: false, envMapIntensity: 1.6 });
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
const _s = new THREE.Vector3(1, 1, 1);

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

function shade(g, col, minY, h) {
  const pos = g.attributes.position, nor = g.attributes.normal, n = pos.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const t = h > 1e-4 ? Math.min(1, Math.max(0, (pos.getY(i) - minY) / h)) : 1;
    let k = 0.72 + 0.28 * Math.sqrt(t);
    if (nor.getY(i) < -0.3) k *= 0.86;
    arr[i * 3] = col.r * k; arr[i * 3 + 1] = col.g * k; arr[i * 3 + 2] = col.b * k;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
}

export function buildModel(parts, size, opt = {}) {
  const desat = opt.desat || 0;
  const b = partsBounds(parts);
  const longest = Math.max(b.size[0], b.size[1], b.size[2], 1e-3);
  const k = opt.origin ? 1 : size / longest;
  const ox = opt.origin ? opt.origin[0] : (b.min[0] + b.max[0]) / 2, oz = opt.origin ? opt.origin[2] : (b.min[2] + b.max[2]) / 2;
  const oy = opt.origin ? opt.origin[1] : opt.center ? (b.min[1] + b.max[1]) / 2 : b.min[1];
  const minY = (b.min[1] - oy) * k, H = b.size[1] * k;
  const group = new THREE.Group();
  const byMat = {};
  const anims = [];
  parts.forEach((p, idx) => {
    _e.set(p.r[0] * D2R, p.r[1] * D2R, p.r[2] * D2R);
    _q.setFromEuler(_e);
    const px = (p.p[0] - ox) * k, py = (p.p[1] - oy) * k, pz = (p.p[2] - oz) * k;
    const dx = p.d[0] * k, dy = p.d[1] * k, dz = p.d[2] * k;
    const geo = partGeometry(p.s, dx, dy, dz, idx + 1);
    if (p.a === 'none' || opt.static) {
      _m.compose(_v.set(px, py, pz), _q, _s);
      geo.applyMatrix4(_m);
      shade(geo, partColor(p.c, desat), minY, H);
      (byMat[p.m] = byMat[p.m] || []).push(geo);
    } else {
      const mesh = new THREE.Mesh(geo, solidMat(p.m, '#' + partColor(p.c, desat).getHexString()));
      mesh.quaternion.copy(_q);
      mesh.castShadow = !opt.noShadow;
      const pivot = new THREE.Object3D();
      let pv = [px, py, pz], off = [0, 0, 0];
      if (p.a === 'swing') { pv = [px, py + dy * 0.45, pz]; off = [0, -dy * 0.45, 0]; }
      if (p.a === 'flap') { const sx = Math.sign(px) || 1; pv = [px - sx * dx * 0.45, py, pz]; off = [sx * dx * 0.45, 0, 0]; }
      pivot.position.set(pv[0], pv[1], pv[2]);
      mesh.position.set(off[0], off[1], off[2]);
      pivot.add(mesh);
      group.add(pivot);
      anims.push({ pivot, mesh, type: p.a, base: pivot.position.clone(), side: Math.sign(px) || 1, phase: (px * 3.1 + pz * 1.7) % 6.28, r: Math.max(dy, dz) * 0.5, baseScale: mesh.scale.clone() });
    }
  });
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
  const units = new Set(Object.values(UNIT));
  model.group.traverse((o) => { if (o.isMesh && o.geometry && !units.has(o.geometry)) o.geometry.dispose(); });
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
