// Battle with Ideas: the always-wobbly active ragdoll (Rapier bodies + PD muscles) and the puppet that draws it.

import * as THREE from 'three';
import RAPIER from 'rapier';
import { GR } from '../engine/physics.js';
import { buildModel, animateModel } from '../engine/prims.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

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
const _e = new THREE.Euler();
const UP = new THREE.Vector3(0, 1, 0);

export class Puppet {
  constructor(scene, color = '#4c8dff', opt = {}) {
    this.group = new THREE.Group();
    scene.add(this.group);
    this.mat = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.02 });
    this.limbMat = new THREE.MeshStandardMaterial({ color: '#f4f2ec', roughness: 0.7 });
    this.ghostMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.35, depthWrite: false });
    this.meshes = {};
    const geo = {
      box: new RoundedBoxGeometry(1, 1, 1, 3, 0.22),
      cap: new THREE.CapsuleGeometry(1, 1, 4, 10),
      ball: new THREE.SphereGeometry(1, 14, 10),
    };
    for (const n of PART_NAMES) {
      const d = DEF[n];
      const g = new THREE.Group();
      let m;
      if (d.kind === 'box') { m = new THREE.Mesh(geo.box, this.mat); m.scale.set(d.s[0] * 2, d.s[1] * 2, d.s[2] * 2); if (n === 'pelvis') m.scale.y *= 1.4; }
      else if (d.kind === 'cap') { m = new THREE.Mesh(geo.cap, LEGS.has(n) || n.startsWith('u') ? this.mat : this.limbMat); m.scale.set(d.s[1], d.s[0], d.s[1]); }
      else { m = new THREE.Object3D(); }
      if (m.isMesh) { m.castShadow = true; m.receiveShadow = false; }
      g.add(m);
      if (n === 'farmL' || n === 'farmR') { const h = new THREE.Mesh(geo.ball, this.limbMat); h.scale.setScalar(0.085); h.position.y = -0.18; h.castShadow = true; g.add(h); g.userData.hand = h; }
      if (n === 'shinL' || n === 'shinR') { const f = new THREE.Mesh(geo.box, this.limbMat); f.scale.set(0.15, 0.1, 0.27); f.position.set(0, -0.2, 0.05); f.castShadow = true; g.add(f); }
      g.userData.inner = m;
      this.group.add(g);
      this.meshes[n] = g;
    }
    this.headSlot = new THREE.Group();
    this.headSlot.position.y = -0.14;
    this.meshes.head.add(this.headSlot);
    this.headModel = null;
    this.eyes = null;
    this.ghost = false;
    this.t = Math.random() * 10;
    this.label = null;
    if (opt.head) this.setHead(opt.head);
  }

  setColor(c) { this.mat.color.set(c); }

  setHead(recipe) {
    if (this.headModel) { this.headSlot.remove(this.headModel.group); }
    const parts = recipe && recipe.parts ? recipe.parts : DEFAULT_HEAD.parts;
    const model = buildModel(parts, 0.56, {});
    model.group.position.y = 0;
    this.headSlot.add(model.group);
    this.headModel = model;
    if (this.eyes) this.headSlot.remove(this.eyes);
    this.eyes = makeEyes(model);
    this.headSlot.add(this.eyes);
    this._ghostSet = undefined;
    this.setGhost(this.ghost);
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
  handPos(side = 'R', out = new THREE.Vector3()) { const g = this.meshes['farm' + side]; return out.set(0, -0.2, 0).applyQuaternion(g.quaternion).add(g.position); }

  dispose(scene) { scene.remove(this.group); this.mat.dispose(); }
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
    for (const j of JOINTS) this.parentOf[j.b] = j.a;
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

  pd(name, parentQ, targetLocal, gain, parentBody, boost = 1) {
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
    const pw = parentBody ? parentBody.angvel() : { x: 0, y: 0, z: 0 };
    const k = 14 * gain;
    _v2.set(_v.x * k - (w.x - pw.x), _v.y * k - (w.y - pw.y), _v.z * k - (w.z - pw.z)).multiplyScalar(Math.min(0.55, 0.5 * gain + 0.05));
    const L = _v2.length();
    if (L > 25) _v2.multiplyScalar(25 / L);
    const Ic = this.inertia[name] * boost;
    let I = Ic;
    if (parentBody) { const Ip = this.inertia[this.parentOf[name]]; I = (Ic * Ip) / (Ic + Ip); }
    b.applyTorqueImpulse({ x: _v2.x * I, y: _v2.y * I, z: _v2.z * I }, true);
    if (parentBody) parentBody.applyTorqueImpulse({ x: -_v2.x * I, y: -_v2.y * I, z: -_v2.z * I }, true);
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
      const err = this.groundY + standH - pt.y;
      const k = 220 * this.wobble, c = 19;
      let acc = g + k * err - c * lv.y;
      if (this.bounce) acc += 0;
      acc = Math.max(-10, Math.min(60, acc)) * s;
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
      const up = M * 0.72;
      B.pelvis.applyImpulse({ x: ix * up * 0.55, y: 0, z: iz * up * 0.55 }, true);
      B.chest.applyImpulse({ x: ix * up * 0.45, y: 0, z: iz * up * 0.45 }, true);
    }
    if (this.jumpReq) {
      this.jumpReq = false;
      if (this.grounded && s > 0.6) {
        const v = 8.6 * Math.sqrt(Math.max(0.3, this.gravityMul)) * (this.bounce ? 1.45 : 1);
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
    this.phase += dt * (hspeed * 2.1 + (hspeed > 0.3 ? 2 : 0));
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
      const hjx = (hx * 90 * s - (hv.x - cv.x) * 10 * s) * mh * dt, hjz = (hz * 90 * s - (hv.z - cv.z) * 10 * s) * mh * dt;
      B.head.applyImpulse({ x: hjx, y: 0, z: hjz }, true);
      B.chest.applyImpulse({ x: -hjx, y: 0, z: -hjz }, true);
    }
    const amp = Math.min(1, hspeed / 4.5);
    const ph = this.phase;
    const pr = B.pelvis.rotation(), cr = B.chest.rotation();
    const pq = new THREE.Quaternion(pr.x, pr.y, pr.z, pr.w), cq = new THREE.Quaternion(cr.x, cr.y, cr.z, cr.w);
    const rot = (x, y, z) => new THREE.Quaternion().setFromEuler(_e.set(x, y, z));
    let hipL, hipR, kneeL, kneeR;
    if (this.grounded || s < 0.5) {
      hipL = rot(-Math.sin(ph) * 0.75 * amp, 0, 0); hipR = rot(Math.sin(ph) * 0.75 * amp, 0, 0);
      kneeL = Math.max(0, Math.cos(ph)) * 1.1 * amp + 0.12; kneeR = Math.max(0, -Math.cos(ph)) * 1.1 * amp + 0.12;
    } else {
      hipL = rot(-0.6, 0, 0.05); hipR = rot(-0.25, 0, -0.05); kneeL = 1.2; kneeR = 0.7;
    }
    const limbGain = 0.12 + s * 0.88;
    this.pd('thighL', pq, hipL, limbGain * 0.9, B.pelvis);
    this.pd('thighR', pq, hipR, limbGain * 0.9, B.pelvis);
    let shL, shR, elL = -0.35, elR = -0.35;
    const armSwing = Math.sin(ph) * 0.55 * amp;
    shL = rot(armSwing, 0, -0.14 - (this.grounded ? 0 : 0.9));
    shR = rot(-armSwing, 0, 0.14 + (this.grounded ? 0 : 0.9));
    if (this.arms !== 'idle') {
      const inv = cq.clone().invert();
      const dir = this.aim.clone().applyQuaternion(inv).normalize();
      const aimQ = new THREE.Quaternion().setFromUnitVectors(_v3.set(0, -1, 0), dir);
      if (this.arms === 'aim' || this.arms === 'hold') { shR = aimQ; elR = this.arms === 'hold' ? -0.25 : -0.05; }
      if (this.arms === 'reach') { shL = aimQ.clone().multiply(rot(0, 0, 0.12)); shR = aimQ.clone().multiply(rot(0, 0, -0.12)); elL = elR = -0.05; }
      if (this.arms === 'throw') { shR = rot(-2.6, 0, 0.2); elR = -1.2; }
      if (this.arms === 'swing') { shR = aimQ.clone().multiply(rot(0.9, 0, 0)); elR = -0.2; }
    }
    this.pd('uarmL', cq, shL, limbGain * 0.6, B.chest);
    this.pd('uarmR', cq, shR, limbGain * 0.6, B.chest);
    const look = rot(THREE.MathUtils.clamp(-this.aim.y * 0.6, -0.5, 0.5), 0, 0);
    this.pd('head', cq, look, limbGain * 0.55, B.chest);
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
