// Battle with Ideas: the always-wobbly active ragdoll (Rapier bodies + PD muscles) and the puppet that draws it.

import * as THREE from 'three';
import RAPIER from 'rapier';
import { GR } from '../engine/physics.js';
import { buildModel, animateModel, disposeModel } from '../engine/prims.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const PART_NAMES = ['pelvis', 'chest', 'head', 'uarmL', 'farmL', 'uarmR', 'farmR', 'thighL', 'shinL', 'thighR', 'shinR'];

const DEF = {
  pelvis: { kind: 'box', s: [0.17, 0.1, 0.11], p: [0, 0.98, 0], m: 9 },
  chest: { kind: 'box', s: [0.2, 0.22, 0.13], p: [0, 1.32, 0], m: 11 },
  head: { kind: 'ball', s: [0.17], p: [0, 1.74, 0], m: 3.5 },
  uarmL: { kind: 'cap', s: [0.08, 0.06], p: [-0.28, 1.37, 0], m: 1.8 },
  farmL: { kind: 'cap', s: [0.08, 0.055], p: [-0.28, 1.11, 0], m: 1.5 },
  uarmR: { kind: 'cap', s: [0.08, 0.06], p: [0.28, 1.37, 0], m: 1.8 },
  farmR: { kind: 'cap', s: [0.08, 0.055], p: [0.28, 1.11, 0], m: 1.5 },
  thighL: { kind: 'cap', s: [0.12, 0.075], p: [-0.1, 0.7, 0], m: 4.2 },
  shinL: { kind: 'cap', s: [0.12, 0.065], p: [-0.1, 0.3, 0], m: 3.2 },
  thighR: { kind: 'cap', s: [0.12, 0.075], p: [0.1, 0.7, 0], m: 4.2 },
  shinR: { kind: 'cap', s: [0.12, 0.065], p: [0.1, 0.3, 0], m: 3.2 },
};

const JOINTS = [
  { a: 'pelvis', b: 'chest', at: [0, 1.09, 0], type: 'ball', k: 1.0 },
  { a: 'chest', b: 'head', at: [0, 1.56, 0], type: 'ball', k: 0.55 },
  { a: 'chest', b: 'uarmL', at: [-0.28, 1.5, 0], type: 'ball', k: 0.5 },
  { a: 'chest', b: 'uarmR', at: [0.28, 1.5, 0], type: 'ball', k: 0.5 },
  { a: 'uarmL', b: 'farmL', at: [-0.28, 1.24, 0], type: 'hinge', lim: [-2.5, 0.05] },
  { a: 'uarmR', b: 'farmR', at: [0.28, 1.24, 0], type: 'hinge', lim: [-2.5, 0.05] },
  { a: 'pelvis', b: 'thighL', at: [-0.1, 0.9, 0], type: 'ball', k: 0.9 },
  { a: 'pelvis', b: 'thighR', at: [0.1, 0.9, 0], type: 'ball', k: 0.9 },
  { a: 'thighL', b: 'shinL', at: [-0.1, 0.5, 0], type: 'hinge', lim: [-0.05, 2.5] },
  { a: 'thighR', b: 'shinR', at: [0.1, 0.5, 0], type: 'hinge', lim: [-0.05, 2.5] },
];

const LEGS = new Set(['thighL', 'shinL', 'thighR', 'shinR']);
const STAND = 0.98;

const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _q4 = new THREE.Quaternion();
const _e = new THREE.Euler();
const UP = new THREE.Vector3(0, 1, 0);

const REST = {
  pelvis: [0, 0.98, 0], chest: [0, 1.32, 0], head: [0, 1.74, 0], uarmL: [-0.28, 1.37, 0], farmL: [-0.28, 1.11, 0],
  uarmR: [0.28, 1.37, 0], farmR: [0.28, 1.11, 0], thighL: [-0.1, 0.7, 0], shinL: [-0.1, 0.3, 0], thighR: [0.1, 0.7, 0], shinR: [0.1, 0.3, 0],
};
const BI = Object.fromEntries(PART_NAMES.map((n, i) => [n, i]));
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function skinPart(geo, weightFn) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const pos = g.attributes.position, n = pos.count;
  const idx = new Uint16Array(n * 4), wt = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const w = weightFn(pos.getX(i), pos.getY(i), pos.getZ(i));
    let k = 0;
    for (const [bone, val] of w) { if (k < 4) { idx[i * 4 + k] = BI[bone]; wt[i * 4 + k] = val; k++; } }
  }
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(idx, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(wt, 4));
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'skinIndex', 'skinWeight'].includes(k)) g.deleteAttribute(k);
  return g;
}

function blend(a, b, lo, hi, y) { const t = smooth(lo, hi, y); return [[a, 1 - t], [b, t]]; }

function bodyGeometry() {
  const parts = [];
  const torso = new THREE.CapsuleGeometry(0.215, 0.34, 8, 20, 12);
  torso.scale(1.15, 1, 0.84);
  torso.translate(0, 1.19, 0);
  parts.push(skinPart(torso, (x, y) => blend('pelvis', 'chest', 1.03, 1.2, y)));
  const neck = new THREE.CylinderGeometry(0.075, 0.085, 0.14, 12, 3);
  neck.translate(0, 1.58, 0);
  parts.push(skinPart(neck, (x, y) => blend('chest', 'head', 1.55, 1.63, y)));
  for (const s of [-1, 1]) {
    const side = s < 0 ? 'L' : 'R';
    const arm = new THREE.CapsuleGeometry(0.07, 0.47, 6, 12, 14);
    arm.translate(s * 0.29, 1.255, 0);
    parts.push(skinPart(arm, (x, y) => blend('farm' + side, 'uarm' + side, 1.19, 1.29, y)));
    const leg = new THREE.CapsuleGeometry(0.092, 0.72, 6, 12, 18);
    leg.translate(s * 0.1, 0.52, 0);
    parts.push(skinPart(leg, (x, y) => y > 0.9 ? [['pelvis', smooth(0.9, 1.0, y)], ['thigh' + side, 1 - smooth(0.9, 1.0, y)]] : blend('shin' + side, 'thigh' + side, 0.45, 0.56, y)));
  }
  return mergeGeometries(parts);
}

function extremityGeometry() {
  const parts = [];
  for (const s of [-1, 1]) {
    const side = s < 0 ? 'L' : 'R';
    const hand = new THREE.SphereGeometry(0.083, 14, 10);
    hand.scale(1, 1.05, 0.9);
    hand.translate(s * 0.29, 0.94, 0.01);
    parts.push(skinPart(hand, () => [['farm' + side, 1]]));
    const thumb = new THREE.SphereGeometry(0.036, 10, 8);
    thumb.translate(s * 0.25, 0.97, 0.06);
    parts.push(skinPart(thumb, () => [['farm' + side, 1]]));
    const foot = new RoundedBoxGeometry(0.16, 0.1, 0.27, 3, 0.045);
    foot.translate(s * 0.1, 0.05, 0.045);
    parts.push(skinPart(foot, () => [['shin' + side, 1]]));
  }
  return mergeGeometries(parts);
}

let BODY_GEO = null, EXT_GEO = null;

export class Puppet {
  constructor(scene, color = '#4c8dff', opt = {}) {
    this.group = new THREE.Group();
    scene.add(this.group);
    this.mat = new THREE.MeshStandardMaterial({ color, roughness: 0.42, metalness: 0.0 });
    this.limbMat = new THREE.MeshStandardMaterial({ color: '#f7f5ef', roughness: 0.55 });
    this.ghostMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.35, depthWrite: false });
    if (!BODY_GEO) { BODY_GEO = bodyGeometry(); EXT_GEO = extremityGeometry(); }
    this.meshes = {};
    const bones = [];
    for (const n of PART_NAMES) {
      const b = new THREE.Bone();
      b.position.set(...REST[n]);
      this.group.add(b);
      this.meshes[n] = b;
      bones.push(b);
    }
    this.group.updateMatrixWorld(true);
    const skeleton = new THREE.Skeleton(bones);
    this.body = new THREE.SkinnedMesh(BODY_GEO, this.mat);
    this.ext = new THREE.SkinnedMesh(EXT_GEO, this.limbMat);
    for (const m of [this.body, this.ext]) {
      m.frustumCulled = false;
      m.castShadow = true;
      this.group.add(m);
      m.bind(skeleton, new THREE.Matrix4());
    }
    this.headSlot = new THREE.Group();
    this.headSlot.position.y = -0.11;
    this.meshes.head.add(this.headSlot);
    this.headModel = null;
    this.headPieces = null;
    this.eyes = null;
    this.ownHead = opt.head || null;
    this.outfit = null;
    this.pieces = [];
    this.ghost = false;
    this.t = Math.random() * 10;
    this.refreshHead();
  }

  setColor(c) { this.mat.color.set(c); }

  bodyColor(base, teams = false) { return this.outfit && !teams ? this.outfit.suit : base; }

  setHead(recipe) {
    this.ownHead = recipe || null;
    this.refreshHead();
  }

  refreshHead() {
    if (this.headModel) { this.headSlot.remove(this.headModel.group); disposeModel(this.headModel); }
    if (this.headPieces) { this.headSlot.remove(this.headPieces.group); disposeModel(this.headPieces); this.headPieces = null; }
    const o = this.outfit;
    const parts = o && o.head ? o.head : this.ownHead && this.ownHead.parts ? this.ownHead.parts : DEFAULT_HEAD.parts;
    const model = buildModel(parts, 0.58, {});
    this.headSlot.add(model.group);
    this.headModel = model;
    if (this.eyes) this.headSlot.remove(this.eyes);
    this.eyes = makeEyes(model);
    this.headSlot.add(this.eyes);
    const hp = o ? o.pieces.filter((p) => p.b === 'head') : [];
    if (hp.length) {
      this.headPieces = buildModel(hp, 1, { origin: [0, 1.63 + Math.max(-0.3, model.height - 0.57), 0] });
      this.headSlot.add(this.headPieces.group);
    }
    this._ghostSet = undefined;
    this.setGhost(this.ghost);
  }

  setOutfit(outfit) {
    for (const m of this.pieces) { m.group.parent && m.group.parent.remove(m.group); disposeModel(m); }
    this.pieces = [];
    this.outfit = outfit && outfit.pieces ? outfit : null;
    const o = this.outfit;
    this.limbMat.color.set(o ? o.trim : '#f7f5ef');
    const look = SUIT_LOOK[o ? o.mat : 'none'] || SUIT_LOOK.none;
    this.mat.roughness = look[0]; this.mat.metalness = look[1];
    this.limbMat.roughness = Math.max(0.3, look[0]); this.limbMat.metalness = look[1] * 0.6;
    if (o) {
      const byBone = {};
      const put = (bone, p) => (byBone[bone] = byBone[bone] || []).push(p);
      for (const p0 of o.pieces) {
        if (p0.b === 'head') continue;
        const limb = LIMB[p0.b];
        if (!limb) { put(p0.b, p0); continue; }
        const p = fitLimb(p0, limb);
        put(limb + 'R', p);
        put(limb + 'L', { ...p, p: [-p.p[0], p.p[1], p.p[2]], r: [p.r[0], -p.r[1], -p.r[2]] });
      }
      for (const bone in byBone) {
        const m = buildModel(byBone[bone], 1, { origin: REST[bone] });
        this.meshes[bone].add(m.group);
        this.pieces.push(m);
      }
    }
    this.refreshHead();
  }

  setGhost(on) {
    if (this._ghostSet === on) return;
    this._ghostSet = on;
    this.ghost = on;
    this.group.traverse((o) => {
      if (!o.isMesh) return;
      if (!o.userData.mat0) o.userData.mat0 = o.material;
      o.material = on ? this.ghostMat : o.userData.mat0;
      o.castShadow = !on;
    });
  }

  setVisible(v) { this.group.visible = v; }

  fromBodies(bodies) {
    for (const n of PART_NAMES) {
      const b = bodies[n];
      const t = b.translation(), r = b.rotation();
      const g = this.meshes[n];
      g.position.set(t.x, t.y, t.z);
      g.quaternion.set(r.x, r.y, r.z, r.w);
    }
  }

  fromPose(pose) {
    for (let i = 0; i < PART_NAMES.length; i++) {
      const g = this.meshes[PART_NAMES[i]];
      const o = i * 7;
      g.position.set(pose[o], pose[o + 1], pose[o + 2]);
      g.quaternion.set(pose[o + 3], pose[o + 4], pose[o + 5], pose[o + 6]);
    }
  }

  tick(dt, speed = 0) {
    this.t += dt;
    if (this.headModel) animateModel(this.headModel, this.t, speed, dt);
    if (this.headPieces && this.headPieces.anims.length) animateModel(this.headPieces, this.t, speed, dt);
    for (const m of this.pieces) if (m.anims.length) animateModel(m, this.t, speed, dt);
    if (this.eyes) {
      for (const p of this.eyes.userData.pupils) {
        p.userData.v.x += (-p.position.x * 60 + (Math.random() - 0.5) * speed * 40) * dt;
        p.userData.v.y += (-(p.position.y + 0.004) * 60 - 9 * 0.004) * dt;
        p.userData.v.multiplyScalar(Math.exp(-dt * 5));
        p.position.x = THREE.MathUtils.clamp(p.position.x + p.userData.v.x * dt, -0.012, 0.012);
        p.position.y = THREE.MathUtils.clamp(p.position.y + p.userData.v.y * dt, -0.012, 0.012);
      }
    }
  }

  headTop() { const h = this.meshes.head; return _v.copy(h.position).add(_v2.set(0, 0.5, 0)); }
  handPos(side = 'R', out = new THREE.Vector3()) { const g = this.meshes['farm' + side]; return out.set(0, -0.18, 0).applyQuaternion(g.quaternion).add(g.position); }

  dispose(scene) { scene.remove(this.group); this.mat.dispose(); }
}

const LIMB = { upper_arm: 'uarm', forearm: 'farm', thigh: 'thigh', shin: 'shin' };
const SUIT_LOOK = { none: [0.42, 0], matte: [0.62, 0], shiny: [0.22, 0.02], metal: [0.3, 0.75], glow: [0.35, 0], glass: [0.12, 0.05] };

function fitLimb(p, limb) {
  const c = REST[limb + 'R'];
  let x = p.p[0], y = p.p[1], z = p.p[2];
  const near = Math.abs(Math.abs(x) - c[0]) < 0.3 && y > c[1] - 0.45 && y < c[1] + 0.4;
  if (!near) { x = c[0] + x; y = c[1] + y; z = c[2] + z; }
  else if (x < 0) x = -x;
  return { ...p, p: [x, y, z] };
}

export const DEFAULT_HEAD = {
  key: 'light-bulb', name: 'Light Bulb', en: 'Light Bulb',
  parts: [
    { s: 'sphere', p: [0, 1.25, 0], d: [1.5, 1.5, 1.5], r: [0, 0, 0], c: '#ffe066', m: 'glow', a: 'none' },
    { s: 'cylinder', p: [0, 0.35, 0], d: [0.75, 0.5, 0.75], r: [0, 0, 0], c: '#b9bcc4', m: 'metal', a: 'none' },
    { s: 'torus', p: [0, 0.45, 0], d: [0.85, 0.85, 0.16], r: [90, 0, 0], c: '#9da1aa', m: 'metal', a: 'none' },
    { s: 'cylinder', p: [0, 0.06, 0], d: [0.4, 0.12, 0.4], r: [0, 0, 0], c: '#3a3a40', m: 'matte', a: 'none' },
  ],
};

function makeEyes(model) {
  const g = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.3 });
  const black = new THREE.MeshBasicMaterial({ color: '#141418' });
  const r = 0.055;
  const z = model.dims[2] / 2 + 0.005, y = Math.min(model.height * 0.62, model.height - r);
  const pupils = [];
  for (const sx of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), white);
    e.position.set(sx * Math.min(0.075, model.dims[0] * 0.25 + 0.02), y, z);
    const p = new THREE.Mesh(new THREE.SphereGeometry(r * 0.48, 10, 6), black);
    p.position.set(0, 0, 0);
    p.userData.v = new THREE.Vector2();
    const holder = new THREE.Group();
    holder.position.set(0, 0, r * 0.82);
    holder.add(p);
    e.add(holder);
    pupils.push(p);
    g.add(e);
  }
  g.userData.pupils = pupils;
  return g;
}

export class Ragdoll {
  constructor(physics, pos, yaw = 0, scale = 1) {
    this.P = physics;
    this.W = physics.world;
    this.bodies = {};
    this.colliders = {};
    this.joints = [];
    this.inertia = {};
    this.mass = 0;
    this.scale = scale;
    this.masses = {};
    const S = scale;
    const q = new THREE.Quaternion().setFromAxisAngle(UP, yaw);
    for (const n of PART_NAMES) {
      const d = DEF[n];
      const p = new THREE.Vector3(...d.p).sub(new THREE.Vector3(0, STAND, 0)).multiplyScalar(S).applyQuaternion(q).add(pos).add(new THREE.Vector3(0, STAND * S, 0));
      const bd = RAPIER.RigidBodyDesc.dynamic().setTranslation(p.x, p.y, p.z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
        .setLinearDamping(0.05).setAngularDamping(n === 'pelvis' || n === 'chest' ? 1.5 : 0.8).setCanSleep(false);
      const body = this.W.createRigidBody(bd);
      let cd;
      if (d.kind === 'box') cd = RAPIER.ColliderDesc.cuboid(d.s[0] * S, d.s[1] * S, d.s[2] * S);
      else if (d.kind === 'ball') cd = RAPIER.ColliderDesc.ball(d.s[0] * S);
      else cd = RAPIER.ColliderDesc.capsule(d.s[0] * S, d.s[1] * S);
      cd.setFriction(n.startsWith('shin') ? 1.1 : 0.6).setRestitution(0.1).setCollisionGroups(LEGS.has(n) ? GR.legsUp : GR.self);
      const col = this.W.createCollider(cd, body);
      const mm = d.m * S * S * S;
      col.setMass(mm);
      this.masses[n] = mm;
      this.bodies[n] = body;
      this.colliders[n] = col;
      this.mass += mm;
      let I;
      if (d.kind === 'box') { const a = d.s[0] * 2 * S, b = d.s[1] * 2 * S, c = d.s[2] * 2 * S; I = mm * ((b * b + c * c) + (a * a + c * c) + (a * a + b * b)) / 36; }
      else if (d.kind === 'ball') I = 0.4 * mm * (d.s[0] * S) ** 2;
      else { const r = d.s[1] * S, h = (d.s[0] * 2 + d.s[1] * 2) * S; I = (mm * (3 * r * r + h * h) / 12 * 2 + 0.5 * mm * r * r) / 3; }
      this.inertia[n] = I;
    }
    for (const j of JOINTS) {
      const A = this.bodies[j.a], B = this.bodies[j.b];
      const da = DEF[j.a].p, db = DEF[j.b].p;
      const a1 = { x: (j.at[0] - da[0]) * S, y: (j.at[1] - da[1]) * S, z: (j.at[2] - da[2]) * S };
      const a2 = { x: (j.at[0] - db[0]) * S, y: (j.at[1] - db[1]) * S, z: (j.at[2] - db[2]) * S };
      let data;
      if (j.type === 'hinge') {
        data = RAPIER.JointData.revolute(a1, a2, { x: 1, y: 0, z: 0 });
        data.limitsEnabled = true;
        data.limits = j.lim;
      } else data = RAPIER.JointData.spherical(a1, a2);
      const joint = this.W.createImpulseJoint(data, A, B, true);
      joint.setContactsEnabled(false);
      this.joints.push({ ...j, joint });
    }
    this.parentOf = {};
    this.anchorP = {};
    this.anchorC = {};
    for (const j of JOINTS) {
      this.parentOf[j.b] = j.a;
      this.anchorP[j.b] = new THREE.Vector3(...j.at).sub(new THREE.Vector3(...DEF[j.a].p)).multiplyScalar(S);
      this.anchorC[j.b] = new THREE.Vector3(...j.at).sub(new THREE.Vector3(...DEF[j.b].p)).multiplyScalar(S);
      const p = DEF[j.b].p;
      const d2 = ((j.at[0] - p[0]) ** 2 + (j.at[1] - p[1]) ** 2 + (j.at[2] - p[2]) ** 2) * S * S;
      this.inertia[j.b] += this.masses[j.b] * d2;
    }
    this.targets = {};
    for (const j of JOINTS) this.targets[j.b] = j.type === 'hinge' ? 0 : new THREE.Quaternion();
    this.strength = 1;
    this.floppy = 0;
    this.grounded = false;
    this.groundY = 0;
    this.groundCollider = null;
    this.air = 0;
    this.phase = 0;
    this.yaw = yaw;
    this.move = new THREE.Vector3();
    this.speed = 5;
    this.accel = 38;
    this.jumpReq = false;
    this.arms = 'idle';
    this.aim = new THREE.Vector3(0, 0, 1);
    this.legsDown = false;
    this.wobble = 1;
    this.gravityMul = 1;
    this.lowFriction = false;
    this.bounce = false;
    this.frozen = false;
    this.landed = 0;
    this.jumpMul = 1;
  }

  get pelvis() { return this.bodies.pelvis; }
  get chest() { return this.bodies.chest; }

  pos(out = new THREE.Vector3()) { const t = this.bodies.pelvis.translation(); return out.set(t.x, t.y, t.z); }
  chestPos(out = new THREE.Vector3()) { const t = this.bodies.chest.translation(); return out.set(t.x, t.y, t.z); }
  vel(out = new THREE.Vector3()) { const v = this.bodies.pelvis.linvel(); return out.set(v.x, v.y, v.z); }

  knock(seconds) { this.floppy = Math.max(this.floppy, seconds); this.strength = 0; }

  impulse(v, where = 'all') {
    if (where === 'all') {
      for (const n of PART_NAMES) { const b = this.bodies[n]; const m = this.masses[n]; b.applyImpulse({ x: v.x * m, y: v.y * m, z: v.z * m }, true); }
    } else {
      const b = this.bodies[where]; const m = this.mass * 0.5; b.applyImpulse({ x: v.x * m, y: v.y * m, z: v.z * m }, true);
    }
  }

  teleport(p, yaw = this.yaw) {
    const q = new THREE.Quaternion().setFromAxisAngle(UP, yaw);
    for (const n of PART_NAMES) {
      const d = DEF[n];
      const t = new THREE.Vector3(...d.p).sub(new THREE.Vector3(0, STAND, 0)).multiplyScalar(this.scale).applyQuaternion(q).add(p).add(new THREE.Vector3(0, STAND * this.scale, 0));
      const b = this.bodies[n];
      b.setTranslation({ x: t.x, y: t.y, z: t.z }, true);
      b.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
      b.setLinvel({ x: 0, y: 0, z: 0 }, true);
      b.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }
    this.yaw = yaw;
  }

  setEnabled(on) {
    for (const n of PART_NAMES) { this.bodies[n].setEnabled(on); }
  }

  setLegs(down) {
    if (down === this.legsDown) return;
    this.legsDown = down;
    for (const n of LEGS) this.colliders[n].setCollisionGroups(down ? GR.legsDown : GR.legsUp);
  }

  setGhostCollision(on) {
    for (const n of PART_NAMES) this.colliders[n].setEnabled(!on);
  }

  pd(name, parentQ, targetLocal, gain, parentBody, boost = 1, ff = 0) {
    const b = this.bodies[name];
    const r = b.rotation();
    _q.set(r.x, r.y, r.z, r.w);
    _q2.copy(parentQ).multiply(targetLocal);
    _q3.copy(_q2).multiply(_q.invert());
    if (_q3.w < 0) { _q3.x = -_q3.x; _q3.y = -_q3.y; _q3.z = -_q3.z; _q3.w = -_q3.w; }
    const ang = 2 * Math.acos(Math.min(1, _q3.w));
    const s = Math.sqrt(1 - _q3.w * _q3.w);
    if (s > 1e-4) _v.set(_q3.x / s, _q3.y / s, _q3.z / s).multiplyScalar(ang); else _v.set(0, 0, 0);
    const w = b.angvel();
    if (parentBody) {
      const pw = parentBody.angvel();
      const k = 11 * gain;
      _v2.set(pw.x + _v.x * k, pw.y + _v.y * k, pw.z + _v.z * k);
      if (ff) { _v3.set(ff, 0, 0).applyQuaternion(parentQ); _v2.add(_v3); }
      const L = _v2.length();
      if (L > 30) _v2.multiplyScalar(30 / L);
      const bl = Math.min(0.65, 0.65 * gain);
      _v2.set(w.x + (_v2.x - w.x) * bl, w.y + (_v2.y - w.y) * bl, w.z + (_v2.z - w.z) * bl);
      b.setAngvel(_v2, true);
      const pt = parentBody.translation(), pr = parentBody.rotation(), pv = parentBody.linvel();
      _a.copy(this.anchorP[name]).applyQuaternion(_q4.set(pr.x, pr.y, pr.z, pr.w));
      _b.set(pw.x, pw.y, pw.z).cross(_a).add(_c.set(pv.x, pv.y, pv.z));
      _a.copy(this.anchorC[name]).applyQuaternion(_q4.set(r.x, r.y, r.z, r.w));
      _b.sub(_c.copy(_v2).cross(_a));
      const cv = b.linvel();
      b.setLinvel({ x: cv.x + (_b.x - cv.x) * bl, y: cv.y + (_b.y - cv.y) * bl, z: cv.z + (_b.z - cv.z) * bl }, true);
      return;
    }
    const k = 14 * gain;
    _v2.set(_v.x * k - w.x, _v.y * k - w.y, _v.z * k - w.z).multiplyScalar(Math.min(0.55, 0.5 * gain + 0.05));
    const L = _v2.length();
    if (L > 14) _v2.multiplyScalar(14 / L);
    const I = this.inertia[name] * boost;
    b.applyTorqueImpulse({ x: _v2.x * I, y: _v2.y * I, z: _v2.z * I }, true);
  }

  step(dt) {
    const B = this.bodies;
    if (this.floppy > 0) { this.floppy -= dt; this.strength = 0; }
    else this.strength = Math.min(1, this.strength + dt * 1.6);
    if (this.frozen) this.strength = Math.min(this.strength, 0.0);
    const s = this.strength;
    this.setLegs(s < 0.55);
    const pt = B.pelvis.translation();
    const hit = this.P.ray(pt.x, pt.y, pt.z, 0, -1, 0, 2.2, GR.rayGround);
    const standH = STAND * this.scale;
    const wasGrounded = this.grounded;
    this.grounded = !!hit && hit.t < standH + 0.32 && this.air <= 0;
    this.groundY = hit ? hit.y : -99;
    this.groundCollider = hit ? hit.collider : null;
    if (this.air > 0) this.air -= dt;
    if (this.grounded && !wasGrounded) this.landed = 0.2;
    if (this.landed > 0) this.landed -= dt;
    const lv = B.pelvis.linvel();
    const M = this.mass;
    const g = 18 * this.gravityMul;
    if (this.gravityMul !== 1) {
      const extra = (1 - this.gravityMul) * 18 * dt;
      for (const n of PART_NAMES) { const m = this.masses[n]; B[n].applyImpulse({ x: 0, y: extra * m, z: 0 }, true); }
    }
    if (this.grounded && s > 0.05) {
      const swing = 0.55 * Math.min(1, Math.hypot(lv.x, lv.z) / 4.5) * Math.sin(this.phase);
      const bob = 0.9 * this.scale * (1 - Math.cos(swing));
      const err = this.groundY + standH - bob - pt.y;
      const k = 220 * this.wobble, c = 19;
      let vy = 0;
      for (const n of PART_NAMES) vy += B[n].linvel().y * this.masses[n];
      vy /= M;
      let acc = g + k * err - c * vy;
      acc = Math.max(g - 30, Math.min(g + 30, acc)) * s;
      const J = acc * M * dt;
      B.pelvis.applyImpulse({ x: 0, y: J * 0.62, z: 0 }, true);
      B.chest.applyImpulse({ x: 0, y: J * 0.38, z: 0 }, true);
    }
    const spd = this.speed;
    const dvx = this.move.x * spd - lv.x, dvz = this.move.z * spd - lv.z;
    let accel = this.grounded ? this.accel : 9;
    if (this.lowFriction && this.grounded) accel = 4.5;
    const maxDv = accel * dt * s;
    const dl = Math.hypot(dvx, dvz);
    if (dl > 1e-4 && s > 0.1 && (this.move.lengthSq() > 0.01 || (this.grounded && !this.lowFriction))) {
      const f = Math.min(1, maxDv / dl);
      const ix = dvx * f, iz = dvz * f;
      for (const n of PART_NAMES) { const m = this.masses[n]; B[n].applyImpulse({ x: ix * m, y: 0, z: iz * m }, true); }
    }
    if (this.jumpReq) {
      this.jumpReq = false;
      if (this.grounded && s > 0.6) {
        const v = 8.6 * Math.sqrt(Math.max(0.3, this.gravityMul)) * (this.bounce ? 1.45 : 1) * this.jumpMul;
        for (const n of PART_NAMES) { const m = this.masses[n]; B[n].applyImpulse({ x: 0, y: v * m * 0.9, z: 0 }, true); }
        this.air = 0.28;
        this.grounded = false;
      }
    }
    if (this.bounce && this.grounded && s > 0.6 && this.landed > 0.15) {
      for (const n of PART_NAMES) { const m = this.masses[n]; B[n].applyImpulse({ x: 0, y: 6 * m, z: 0 }, true); }
      this.air = 0.25;
    }
    const hspeed = Math.hypot(lv.x, lv.z);
    const phRate = hspeed * 3.1 / this.scale + (hspeed > 0.4 ? 1.2 : 0);
    this.phase += dt * phRate;
    const yawQ = _q2.setFromAxisAngle(UP, this.yaw).clone();
    const lean = new THREE.Quaternion().setFromEuler(_e.set(THREE.MathUtils.clamp(dvz * 0.02, -0.25, 0.25), 0, THREE.MathUtils.clamp(-dvx * 0.02, -0.25, 0.25)));
    const torsoGain = s * 0.9 * this.wobble;
    const worldQ = new THREE.Quaternion();
    this.pd('pelvis', worldQ, yawQ, torsoGain, null);
    const chestT = lean.clone().multiply(yawQ);
    this.pd('chest', worldQ, chestT, torsoGain, null);
    if (s > 0.05) {
      const ct = B.chest.translation(), cv = B.chest.linvel(), pv = lv;
      const lx = THREE.MathUtils.clamp(dvx * 0.012, -0.08, 0.08), lz = THREE.MathUtils.clamp(dvz * 0.012, -0.08, 0.08);
      const ex = pt.x + lx - ct.x, ez = pt.z + lz - ct.z;
      const mu = this.masses.chest + this.masses.head + this.masses.uarmL + this.masses.uarmR + this.masses.farmL + this.masses.farmR;
      const kb = 150 * s * this.wobble, cb = 16 * s;
      const jx = (ex * kb - (cv.x - pv.x) * cb) * mu * dt, jz = (ez * kb - (cv.z - pv.z) * cb) * mu * dt;
      B.chest.applyImpulse({ x: jx, y: 0, z: jz }, true);
      B.pelvis.applyImpulse({ x: -jx, y: 0, z: -jz }, true);
      const ht = B.head.translation(), hv = B.head.linvel();
      const hx = ct.x - ht.x, hz = ct.z - ht.z;
      const mh = this.masses.head;
      const hjx = (hx * 160 * s - (hv.x - cv.x) * 14 * s) * mh * dt, hjz = (hz * 160 * s - (hv.z - cv.z) * 14 * s) * mh * dt;
      B.head.applyImpulse({ x: hjx, y: 0, z: hjz }, true);
      B.chest.applyImpulse({ x: -hjx, y: 0, z: -hjz }, true);
    }
    const amp = Math.min(1, hspeed / 4.5);
    const ph = this.phase;
    const pr = B.pelvis.rotation(), cr = B.chest.rotation();
    const pq = new THREE.Quaternion(pr.x, pr.y, pr.z, pr.w), cq = new THREE.Quaternion(cr.x, cr.y, cr.z, cr.w);
    const rot = (x, y, z) => new THREE.Quaternion().setFromEuler(_e.set(x, y, z));
    let hipL, hipR, kneeL, kneeR, ffL = 0, ffR = 0;
    if (this.grounded || s < 0.5) {
      ffL = -Math.cos(ph) * 0.55 * amp * phRate * s; ffR = -ffL;
      hipL = rot(-Math.sin(ph) * 0.55 * amp, 0, 0); hipR = rot(Math.sin(ph) * 0.55 * amp, 0, 0);
      kneeL = Math.max(0, Math.cos(ph)) * 0.75 * amp + 0.08; kneeR = Math.max(0, -Math.cos(ph)) * 0.75 * amp + 0.08;
    } else {
      hipL = rot(-0.6, 0, 0.05); hipR = rot(-0.25, 0, -0.05); kneeL = 1.2; kneeR = 0.7;
    }
    const limbGain = 0.12 + s * 0.88;
    this.pd('thighL', pq, hipL, limbGain * 2.2, B.pelvis, 1, ffL);
    this.pd('thighR', pq, hipR, limbGain * 2.2, B.pelvis, 1, ffR);
    let shL, shR, elL = -0.35, elR = -0.35;
    const armSwing = Math.sin(ph) * 0.55 * amp;
    let ffA = this.grounded ? Math.cos(ph) * 0.55 * amp * phRate * s : 0, ffAL = ffA, ffAR = -ffA;
    shL = rot(armSwing, 0, -0.14 - (this.grounded ? 0 : 0.9));
    shR = rot(-armSwing, 0, 0.14 + (this.grounded ? 0 : 0.9));
    if (this.arms !== 'idle') {
      const inv = cq.clone().invert();
      const dir = this.aim.clone().applyQuaternion(inv).normalize();
      const aimQ = new THREE.Quaternion().setFromUnitVectors(_v3.set(0, -1, 0), dir);
      ffAR = 0;
      if (this.arms === 'reach') ffAL = 0;
      if (this.arms === 'aim' || this.arms === 'hold') { shR = aimQ; elR = this.arms === 'hold' ? -0.25 : -0.05; }
      if (this.arms === 'reach') { shL = aimQ.clone().multiply(rot(0, 0, 0.12)); shR = aimQ.clone().multiply(rot(0, 0, -0.12)); elL = elR = -0.05; }
      if (this.arms === 'throw') { shR = rot(-2.6, 0, 0.2); elR = -1.2; }
      if (this.arms === 'swing') { shR = aimQ.clone().multiply(rot(0.9, 0, 0)); elR = -0.2; }
    }
    this.pd('uarmL', cq, shL, limbGain * 1.1, B.chest, 1, ffAL);
    this.pd('uarmR', cq, shR, limbGain * 1.1, B.chest, 1, ffAR);
    const look = rot(THREE.MathUtils.clamp(-this.aim.y * 0.6, -0.5, 0.5), 0, 0);
    this.pd('head', cq, look, limbGain * 0.8, B.chest);
    for (const j of this.joints) {
      if (j.type !== 'hinge') continue;
      let target = 0;
      if (j.b === 'shinL') target = kneeL; else if (j.b === 'shinR') target = kneeR;
      else if (j.b === 'farmL') target = elL; else if (j.b === 'farmR') target = elR;
      j.joint.configureMotorPosition(target, 260 * limbGain, 14 * limbGain + 1);
    }
    for (const n of PART_NAMES) {
      const v = B[n].linvel();
      const sp = v.x * v.x + v.y * v.y + v.z * v.z;
      if (sp > 1600) { const f = 40 / Math.sqrt(sp); B[n].setLinvel({ x: v.x * f, y: v.y * f, z: v.z * f }, true); }
    }
  }

  pose(out) {
    const o = out || new Float32Array(PART_NAMES.length * 7);
    for (let i = 0; i < PART_NAMES.length; i++) {
      const b = this.bodies[PART_NAMES[i]];
      const t = b.translation(), r = b.rotation();
      o[i * 7] = t.x; o[i * 7 + 1] = t.y; o[i * 7 + 2] = t.z;
      o[i * 7 + 3] = r.x; o[i * 7 + 4] = r.y; o[i * 7 + 5] = r.z; o[i * 7 + 6] = r.w;
    }
    return o;
  }

  destroy() {
    for (const n of PART_NAMES) this.P.removeBody(this.bodies[n]);
    this.bodies = {};
  }
}
