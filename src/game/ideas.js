// Battle with Ideas: living ideas in the arena (sculpture, owner-simulated behaviour and attacks, remote interpolation).

import * as THREE from 'three';
import RAPIER from 'rapier';
import { GR } from '../engine/physics.js';
import { buildModel, animateModel, disposeModel, modelColliderBoxes } from '../engine/prims.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);
const LOOPS = new Set(['engine', 'jet', 'helicopter', 'wind', 'buzz', 'rumble', 'sizzle']);

export const ATTACK_FX = {
  freeze: { type: 'freeze', dur: 2.2 }, burn: { type: 'burn', dur: 3, amt: 5 }, stun: { type: 'stun', dur: 1.3 },
  shrink: { type: 'shrink', dur: 7 }, grow: { type: 'grow', dur: 7 }, sticky: { type: 'slow', dur: 3 }, launch: { type: 'launch', amt: 4 },
  zap: { type: 'stun', dur: 0.45 },
};

function expoOut(k) { return k >= 1 ? 1 : 1 - Math.pow(2, -10 * k); }
function elastic(k) { if (k >= 1) return 1; return Math.pow(2, -9 * k) * Math.sin((k * 10 - 0.75) * (2 * Math.PI) / 3) + 1; }

export class Idea {
  constructor(mgr, ev, k, isOwner) {
    this.mgr = mgr;
    this.game = mgr.game;
    const game = this.game;
    this.id = k ? `${ev.id}.${k}` : ev.id;
    this.owner = ev.owner;
    this.rec = ev.rec;
    this.kind = ev.rec.kind;
    this.isOwner = isOwner;
    this.t = 0;
    this.born = 0;
    this.hp = this.maxHp = ev.rec.hp;
    this.life = ev.rec.life;
    this.alive = true;
    this.uses = ev.uses || 0;
    this.status = {};
    this.cd = ev.rec.attacks.map((a, i) => 0.6 + i * 0.3);
    this.model = buildModel(ev.rec.parts, ev.rec.size, { desat: Math.min(0.85, this.uses * 0.22), receive: this.kind === 'structure' });
    this.group = new THREE.Group();
    this.group.add(this.model.group);
    game.E.renderer.scene.add(this.group);
    this.radius = Math.max(0.35, this.model.radius * 0.9);
    this.height = this.model.height;
    this.pos = new THREE.Vector3();
    this.quat = new THREE.Quaternion();
    this.vel = new THREE.Vector3();
    this.aim = new THREE.Vector3(...(ev.aim || [0, 0, 0]));
    this.home = new THREE.Vector3();
    this.target = null;
    this.retarget = 0;
    this.wander = new THREE.Vector3();
    this.hidden = false;
    this.grabbedBy = null;
    this.snaps = [];
    this.fixed = [];
    this.body = null;
    this.speedNow = 0;
    this.contactCd = new Map();
    this.particleAcc = 0;
    this.spawnedKids = [];
    this.burrowed = false;
    this.phase = Math.random() * 10;
    this.place(ev, k);
    if (this.kind === 'structure') this.buildFixed();
    else if (isOwner) this.buildBody();
    else this.buildProxy();
    this.group.scale.setScalar(0.001);
    if (ev.rec.sound !== 'none' && !LOOPS.has(ev.rec.sound) && k === 0) game.E.audio.play(ev.rec.sound, this.pos, 0.8);
    if (k === 0) { game.fx.burst(this.pos.clone().add(_v.set(0, this.height * 0.5, 0)), 'ink', 14, null, Math.max(1, this.radius)); game.fx.burst(this.pos, 'sparkle', 10, null, Math.max(1, this.radius)); }
  }

  get team() { return this.game.teamOf(this.owner); }
  get targetable() { return this.alive && !this.burrowed && (['creature', 'structure', 'vehicle'].includes(this.kind) || this.owner === 'spark'); }

  place(ev, k) {
    const game = this.game;
    const at = new THREE.Vector3(...ev.at);
    const n = this.rec.count;
    if (n > 1) {
      const a = (k / n) * Math.PI * 2 + (ev.seed % 7), r = 0.6 + Math.sqrt(n) * this.radius * 0.9;
      at.x += Math.cos(a) * r; at.z += Math.sin(a) * r;
    }
    let y = at.y;
    const h = game.E.physics.ray(at.x, at.y + 4, at.z, 0, -1, 0, 30, GR.rayStatic);
    if (h) y = h.y;
    else if (this.kind !== 'disaster') y = Math.max(0, at.y);
    const flying = ['fly', 'swim', 'rain'].includes(this.rec.move.type) && this.kind === 'creature';
    this.pos.set(at.x, y + (flying ? 2.2 + this.height * 0.3 : 0.02), at.z);
    if (this.rec.move.type === 'rain') this.pos.y = y + 15;
    this.home.copy(this.pos);
    const yaw = ev.yaw || 0;
    this.quat.setFromAxisAngle(UP, yaw);
    this.group.position.copy(this.pos);
    this.group.quaternion.copy(this.quat);
  }

  colliderDesc() {
    const d = this.model.dims;
    const big = Math.max(d[0], d[1], d[2]);
    if (this.rec.move.type === 'roll') return RAPIER.ColliderDesc.ball(Math.max(0.2, big * 0.45)).setTranslation(0, big * 0.45, 0);
    const hx = Math.max(0.12, d[0] * 0.42), hy = Math.max(0.12, d[1] * 0.48), hz = Math.max(0.12, d[2] * 0.42);
    return RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(0, hy, 0);
  }

  buildBody() {
    if (this.kind === 'disaster' || this.rec.move.type === 'rain' || this.rec.move.type === 'orbit_owner') return;
    const W = this.game.E.physics.world;
    const flying = ['fly', 'swim'].includes(this.rec.move.type);
    const bd = RAPIER.RigidBodyDesc.dynamic().setTranslation(this.pos.x, this.pos.y, this.pos.z).setRotation(this.quat).setLinearDamping(flying ? 2 : 0.3).setAngularDamping(3).setCanSleep(false).setGravityScale(flying ? 0 : 1);
    this.body = W.createRigidBody(bd);
    if (this.kind !== 'vehicle') this.body.setEnabledRotations(false, true, false, true);
    const cd = this.colliderDesc().setFriction(0.6).setRestitution(0.15).setCollisionGroups(GR.idea);
    const d = this.model.dims;
    const vol = Math.max(0.02, d[0] * d[1] * d[2]);
    const col = W.createCollider(cd, this.body);
    col.setMass(THREE.MathUtils.clamp(vol * 140, 4, 900));
    this.collider = col;
  }

  buildProxy() {
    if (this.kind === 'disaster' || this.rec.move.type === 'rain') return;
    const W = this.game.E.physics.world;
    const bd = RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(this.pos.x, this.pos.y, this.pos.z).setRotation(this.quat);
    this.body = W.createRigidBody(bd);
    this.collider = W.createCollider(this.colliderDesc().setCollisionGroups(GR.idea), this.body);
    this.proxy = true;
  }

  buildFixed() {
    const P = this.game.E.physics;
    for (const b of modelColliderBoxes(this.rec.parts, this.rec.size, 8)) {
      const p = new THREE.Vector3(b.x, b.y, b.z).applyQuaternion(this.quat).add(this.pos);
      const q = this.quat.clone().multiply(b.q);
      P.addStaticBox(p.x, p.y, p.z, b.hx, b.hy, b.hz, q, 0.7, this.fixed);
    }
  }

  readBody() {
    if (!this.body) return;
    const t = this.body.translation(), r = this.body.rotation(), v = this.body.linvel();
    this.pos.set(t.x, t.y, t.z);
    this.quat.set(r.x, r.y, r.z, r.w);
    this.vel.set(v.x, v.y, v.z);
  }

  center(out = new THREE.Vector3()) { return out.copy(this.pos).add(_v2.set(0, this.burrowed ? 0 : this.height * 0.5, 0)); }

  damage(h) {
    if (!this.alive || !this.isOwner) return;
    if (this.kind === 'disaster') return;
    this.hp -= h.dmg || 0;
    this.game.fx.burst(this.center(_v), 'ink', 5);
    if (h.kb && this.body && !this.proxy) {
      const m = this.body.mass();
      const s = this.kind === 'vehicle' ? 0.35 : 0.8;
      this.body.applyImpulse({ x: h.kb[0] * m * s, y: h.kb[1] * m * s, z: h.kb[2] * m * s }, true);
    }
    if (h.fx && h.fx.type) {
      const f = h.fx;
      if (f.type === 'freeze') this.status.freeze = f.dur || 2;
      if (f.type === 'stun') this.status.freeze = Math.max(this.status.freeze || 0, f.dur || 1);
      if (f.type === 'slow') this.status.slow = f.dur || 3;
      if (f.type === 'burn' || f.type === 'poison') this.status.burn = f.dur || 3;
      if (f.type === 'launch' && this.body && !this.proxy) { const m = this.body.mass(); this.body.applyImpulse({ x: 0, y: 12 * m, z: 0 }, true); }
      if (f.type === 'push' && f.v && this.body && !this.proxy) { const m = this.body.mass(); this.body.applyImpulse({ x: f.v[0] * m * 0.6, y: f.v[1] * m * 0.6, z: f.v[2] * m * 0.6 }, true); }
    }
    if (this.hp <= 0) this.die('killed', h.by);
  }

  die(reason = 'expired', by = null) {
    if (!this.alive) return;
    this.alive = false;
    if (this.isOwner) {
      const boom = this.rec.attacks.find((a) => a.type === 'explode');
      if (boom && reason !== 'cleared') this.explode(boom);
      this.game.emit({ k: 'despawn', id: this.id, why: reason, by });
    }
    this.mgr.remove(this.id, reason);
  }

  explode(a) {
    const c = this.center(new THREE.Vector3());
    this.game.areaHit(this.owner, c, Math.max(1.5, a.radius || 3), { dmg: a.dmg, kb: Math.max(6, a.kb), up: Math.max(4, a.kb * 0.6), fx: ATTACK_FX[a.type] }, true, this.id);
    this.game.emit({ k: 'fx', t: 'boom', at: c.toArray(), r: Math.max(1.5, a.radius || 3), c: this.rec.parts[0].c });
  }

  vanish(reason) {
    const c = this.center(_v);
    if (reason === 'killed') { this.game.fx.burst(c, 'ink', 22, null, Math.max(1, this.radius)); this.game.fx.burst(c, 'dust', 10, null, Math.max(1, this.radius)); }
    else if (reason !== 'cleared') this.game.fx.burst(c, 'sparkle', 14, null, Math.max(1, this.radius));
    if (reason === 'killed' && this.kind === 'structure') this.game.E.audio.play('crash', c, 0.8);
    this.game.E.audio.stopLoop('idea:' + this.id);
    this.game.E.renderer.scene.remove(this.group);
    disposeModel(this.model);
    if (this.body) this.game.E.physics.removeBody(this.body);
    this.game.E.physics.removeColliders(this.fixed);
    this.body = null;
  }

  pickTarget() {
    const g = this.game, mv = this.rec.move;
    if (this.rec.goal === 'spark') {
      const e = g.nearestEnemy(this.owner, this.pos, this.rec.aggro || 7);
      if (e) return e;
      const s = g.sparkTarget();
      if (s) return s;
    }
    if (mv.target === 'owner' || mv.type === 'follow_owner' || mv.type === 'orbit_owner') {
      const e = g.nearestEnemy(this.owner, this.pos, 12);
      return e || { id: this.owner, pos: g.entityPos(this.owner) || this.home, friendly: true };
    }
    if (mv.target === 'aim_point' && this.t < 4) return { id: 'aim', pos: this.aim, point: true };
    if (mv.target === 'random') {
      if (!this.wanderT || this.t > this.wanderT) { this.wanderT = this.t + 3; this.wander.copy(g.island.randomPoint(Math.random, 3)); }
      const e = g.nearestEnemy(this.owner, this.pos, 6);
      return e || { id: 'wander', pos: this.wander, point: true };
    }
    return g.nearestEnemy(this.owner, this.pos, 70) || { id: 'aim', pos: this.aim, point: true };
  }

  update(dt) {
    this.t += dt;
    this.born = Math.min(1, this.born + dt * 2.2);
    const s = this.kind === 'structure' ? expoOut(this.born) : elastic(this.born);
    this.group.scale.setScalar(Math.max(0.001, s));
    if (!this.isOwner) return this.updateRemote(dt);
    if (this.life > 0 && this.t > this.life) { this.die('expired'); return; }
    for (const k in this.status) { this.status[k] -= dt; if (this.status[k] <= 0) delete this.status[k]; }
    if (this.status.burn) { this.burnAcc = (this.burnAcc || 0) + dt; if (this.burnAcc > 0.5) { this.burnAcc = 0; this.damage({ dmg: 3 }); this.game.fx.burst(this.center(_v), 'fire', 3); if (!this.alive) return; } }
    this.readBody();
    if (this.kind === 'vehicle') { this.game.vehicles.updateIdea(this, dt); this.afterMove(dt); return; }
    this.retarget -= dt;
    if (this.retarget <= 0 || (this.target && this.target.dead)) { this.retarget = 0.45; this.target = this.pickTarget(); }
    if (this.target && this.target.ref && this.target.ref.alive === false) this.target = this.pickTarget();
    if (this.grabbedBy) this.followHand(dt);
    else if (!this.status.freeze) this.move(dt);
    this.attack(dt);
    this.physicsDamage(dt);
    this.afterMove(dt);
  }

  afterMove(dt) {
    if (this.body && !this.proxy) this.readBody();
    if (this.pos.y < -30) { this.die('fell'); return; }
    this.group.position.copy(this.pos);
    if (this.burrowed) this.group.position.y -= this.height * 0.95;
    this.group.quaternion.copy(this.quat);
    this.speedNow = Math.hypot(this.vel.x, this.vel.z);
    animateModel(this.model, this.t + this.phase, this.speedNow, dt);
    this.emitParticles(dt);
    if (LOOPS.has(this.rec.sound)) this.game.E.audio.loop('idea:' + this.id, this.rec.sound, this.pos, 0.5);
  }

  emitParticles(dt) {
    const p = this.rec.particles;
    if (p === 'none' && !this.burrowed) return;
    this.particleAcc += dt * (this.kind === 'disaster' ? 40 : 10);
    while (this.particleAcc > 1) {
      this.particleAcc -= 1;
      const r = this.radius;
      const at = _v.set(this.pos.x + (Math.random() - 0.5) * r * 2, this.pos.y + Math.random() * Math.max(0.3, this.height), this.pos.z + (Math.random() - 0.5) * r * 2);
      this.game.fx.burst(at, this.burrowed ? 'dust' : p, 1, null, 0.6);
    }
  }

  setVel(x, y, z) { if (this.body && !this.proxy) this.body.setLinvel({ x, y, z }, true); }

  face(dx, dz, dt, rate = 8) {
    if (Math.abs(dx) + Math.abs(dz) < 1e-3) return;
    const want = _q.setFromAxisAngle(UP, Math.atan2(dx, dz));
    const q = this.quat.clone().slerp(want, Math.min(1, dt * rate));
    if (this.body && !this.proxy) this.body.setRotation(q, true);
    else this.quat.copy(q);
  }

  move(dt) {
    const mv = this.rec.move, T = this.target;
    let speed = mv.speed * (this.status.slow ? 0.4 : 1);
    const tp = T ? T.pos : this.aim;
    const dx = tp.x - this.pos.x, dz = tp.z - this.pos.z;
    const dist = Math.hypot(dx, dz) || 1e-3;
    const nx = dx / dist, nz = dz / dist;
    const reach = this.attackRange() * 0.7 + (T && !T.point ? T.radius || 0.4 : 0);
    const go = T && !T.friendly ? dist > reach : dist > 2.5;
    const v = this.body ? this.body.linvel() : { x: 0, y: 0, z: 0 };
    const groundY = this.groundBelow();
    switch (mv.type) {
      case 'walk': case 'roll': case 'slither': case 'follow_owner': {
        let sx = go ? nx * speed : 0, sz = go ? nz * speed : 0;
        if (mv.type === 'slither') { const w = Math.sin(this.t * 6) * 0.6; sx += -nz * w * speed; sz += nx * w * speed; }
        this.setVel(sx, v.y, sz);
        this.face(sx, sz, dt);
        if (go && this.blocked(nx, nz) && this.onGround(groundY)) this.setVel(sx, 7, sz);
        break;
      }
      case 'hop': {
        this.hopT = (this.hopT || 0) - dt;
        if (this.hopT <= 0 && this.onGround(groundY)) { this.hopT = 0.75; const h = go ? speed : 0; this.setVel(nx * h * 1.1, 7.5, nz * h * 1.1); }
        this.face(nx, nz, dt);
        break;
      }
      case 'fly': case 'swim': {
        const alt = mv.type === 'swim' ? 0.5 + this.height * 0.2 : 2.4 + this.height * 0.35;
        const ty = Math.max(groundY, (T && !T.point ? T.pos.y - 0.6 : groundY)) + alt + Math.sin(this.t * 2) * 0.3;
        let sx = go ? nx * speed : Math.sin(this.t) * 0.6, sz = go ? nz * speed : Math.cos(this.t) * 0.6;
        if (mv.type === 'swim') { const w = Math.sin(this.t * 4) * 0.5; sx += -nz * w * speed * 0.4; sz += nx * w * speed * 0.4; }
        this.setVel(sx, THREE.MathUtils.clamp((ty - this.pos.y) * 3, -speed, speed), sz);
        this.face(sx, sz, dt);
        break;
      }
      case 'vortex': {
        const w = 0.55;
        this.pos.x += (nx * speed * w + Math.sin(this.t * 1.3) * 1.5) * dt;
        this.pos.z += (nz * speed * w + Math.cos(this.t * 1.1) * 1.5) * dt;
        const g = this.groundBelow();
        this.pos.y = g > -50 ? g : this.pos.y;
        this.quat.setFromAxisAngle(UP, this.t * 3);
        this.vel.set(nx * speed * w, 0, nz * speed * w);
        break;
      }
      case 'orbit_owner': {
        const o = this.game.entityPos(this.owner) || this.home;
        const a = this.t * 2.2 + this.phase;
        const r = 2.2 + this.radius;
        this.pos.set(o.x + Math.cos(a) * r, o.y + 0.2, o.z + Math.sin(a) * r);
        this.quat.setFromAxisAngle(UP, -a);
        break;
      }
      case 'rain': this.rain(dt); break;
      case 'burrow': {
        const near = T && !T.point && dist < 2.2;
        this.burrowT = (this.burrowT || 0) - dt;
        if (this.burrowed && near && this.burrowT <= 0) { this.burrowed = false; this.burrowT = 1.8; this.game.fx.burst(this.pos, 'dust', 16, null, 1.5); this.game.E.audio.play('rumble', this.pos, 0.7); }
        else if (!this.burrowed && this.burrowT <= 0) { this.burrowed = true; this.burrowT = 0.6; }
        if (this.burrowed) { this.setVel(go ? nx * speed * 1.3 : 0, v.y, go ? nz * speed * 1.3 : 0); if (this.collider) this.collider.setEnabled(false); }
        else { this.setVel(0, v.y, 0); if (this.collider) this.collider.setEnabled(true); }
        this.face(nx, nz, dt);
        break;
      }
      case 'teleport': {
        this.tpT = (this.tpT || 1.5) - dt;
        if (this.tpT <= 0 && T && !T.point) {
          this.tpT = 2.6;
          this.game.fx.burst(this.center(_v), 'sparkle', 12);
          const a = Math.random() * 6.28;
          const p = { x: T.pos.x + Math.cos(a) * 2, y: Math.max(groundY, 0) + 0.5, z: T.pos.z + Math.sin(a) * 2 };
          if (this.body) this.body.setTranslation(p, true);
          this.game.fx.burst(new THREE.Vector3(p.x, p.y + 0.5, p.z), 'sparkle', 12);
        }
        this.face(nx, nz, dt);
        break;
      }
      case 'dash': {
        this.dashT = (this.dashT || 0) - dt;
        if (this.dashT <= 0 && go && dist < 14) { this.dashT = 2.2; this.dashing = 0.7; this.dashDir = new THREE.Vector3(nx, 0, nz); this.game.E.audio.play('whoosh', this.pos, 0.6); }
        if (this.dashing > 0) { this.dashing -= dt; this.setVel(this.dashDir.x * speed * 2.6, v.y, this.dashDir.z * speed * 2.6); }
        else this.setVel(go ? nx * speed * 0.6 : 0, v.y, go ? nz * speed * 0.6 : 0);
        this.face(nx, nz, dt);
        break;
      }
      case 'projectile': {
        const d3 = _v.copy(tp).sub(this.pos);
        const L = d3.length() || 1;
        this.setVel(d3.x / L * Math.max(speed, 12), d3.y / L * Math.max(speed, 12), d3.z / L * Math.max(speed, 12));
        if (this.body) this.body.setGravityScale(0, true);
        this.face(d3.x, d3.z, dt, 20);
        if (L < 1.2 + this.radius) this.die('impact');
        break;
      }
      default: {
        if (this.kind === 'disaster') { this.quat.setFromAxisAngle(UP, this.t * 2); }
        else if (this.body && this.kind !== 'structure') this.setVel(v.x * 0.9, v.y, v.z * 0.9);
        if (T && !T.point && this.kind !== 'structure' && this.kind !== 'disaster') this.face(nx, nz, dt, 3);
      }
    }
    if (this.kind === 'disaster' && mv.type !== 'vortex' && mv.type !== 'rain') {
      if (mv.speed > 0.5) { this.pos.x += nx * Math.min(mv.speed, 4) * 0.4 * dt; this.pos.z += nz * Math.min(mv.speed, 4) * 0.4 * dt; }
      this.quat.setFromAxisAngle(UP, this.t * 1.5);
    }
  }

  groundBelow() {
    const h = this.game.E.physics.ray(this.pos.x, this.pos.y + 1, this.pos.z, 0, -1, 0, 40, GR.rayStatic);
    return h ? h.y : -99;
  }

  onGround(g) { return this.pos.y - g < 0.25; }

  blocked(nx, nz) {
    const h = this.game.E.physics.ray(this.pos.x, this.pos.y + 0.3, this.pos.z, nx, 0, nz, this.radius + 0.6, GR.rayStatic);
    return !!h;
  }

  attackRange() {
    let r = 1.5 + this.radius;
    for (const a of this.rec.attacks) r = Math.max(r, ['shoot', 'lob', 'beam', 'zap', 'lightning', 'meteor'].includes(a.type) ? Math.min(a.range, 28) : (a.radius || 0) + this.radius + 0.8);
    return r;
  }

  rain(dt) {
    this.rainT = (this.rainT || 0.3) - dt;
    const n = Math.max(4, this.rec.count * 4);
    const every = Math.max(0.18, (this.life || 10) / n);
    const T = this.target && !this.target.point ? this.target.pos : this.aim;
    this.pos.x += (T.x - this.pos.x) * dt * 0.4;
    this.pos.z += (T.z - this.pos.z) * dt * 0.4;
    if (this.rainT <= 0) {
      this.rainT = every;
      const a = this.rec.attacks[0] || { dmg: 10, radius: 0, kb: 6, type: 'contact' };
      const r = 6;
      const o = [this.pos.x + (Math.random() - 0.5) * r * 2, this.pos.y - 1, this.pos.z + (Math.random() - 0.5) * r * 2];
      this.game.shoot({ owner: this.owner, o, d: [0, -1, 0], spd: 16, grav: 12, size: Math.min(2.5, this.rec.size), parts: this.rec.parts, dmg: a.dmg || 10, kb: a.kb || 6, radius: a.type === 'explode' || a.type === 'meteor' ? Math.max(1.5, a.radius) : 0, fx: ATTACK_FX[a.type] || null, life: 4, tumble: true, color: this.rec.parts[0].c });
    }
  }

  followHand(dt) {
    const g = this.game.players.get(this.grabbedBy);
    if (!g || !g.handPos) { this.grabbedBy = null; return; }
    const hand = g.handPos(new THREE.Vector3());
    const target = hand.add(this.game.forwardOf(this.grabbedBy).multiplyScalar(0.3 + this.radius)).sub(_v2.set(0, this.height * 0.5, 0));
    if (this.body) {
      const p = this.body.translation();
      this.body.setLinvel({ x: (target.x - p.x) * 14, y: (target.y - p.y) * 14, z: (target.z - p.z) * 14 }, true);
    }
  }

  throwFrom(by, v) {
    this.grabbedBy = null;
    this.thrownBy = by;
    this.thrownT = 2;
    if (this.body) this.body.setLinvel({ x: v[0], y: v[1], z: v[2] }, true);
  }

  physicsDamage(dt) {
    if (!this.body || this.proxy) return;
    if (this.thrownT > 0) this.thrownT -= dt;
    const sp = this.vel.length();
    if (sp < 8.5) return;
    const owner = this.thrownT > 0 && this.thrownBy ? this.thrownBy : this.owner;
    for (const t of this.game.targetsFor(owner)) {
      if (t.id === this.id) continue;
      if (t.pos.distanceTo(this.center(_v)) > t.radius + this.radius + 0.3) continue;
      const last = this.contactCd.get(t.id) || 0;
      if (this.t - last < 0.6) continue;
      this.contactCd.set(t.id, this.t);
      const kb = this.vel.clone().normalize().multiplyScalar(Math.min(22, sp * 0.8)).add(new THREE.Vector3(0, 4, 0));
      this.game.dealHit(t.id, { dmg: Math.min(40, sp * (this.kind === 'vehicle' ? 1.6 : 0.9)), kb: kb.toArray(), by: owner });
      this.game.E.audio.play('bonk', t.pos, 0.7);
    }
  }

  attack(dt) {
    const g = this.game, recA = this.rec.attacks;
    if (!recA.length) {
      if (this.kind === 'disaster') this.disasterDefault(dt);
      if (this.kind === 'trap') this.trapTrigger(dt, { type: 'launch', dmg: 0, radius: Math.max(1, this.radius + 0.4), kb: 14, rate: 0.6 });
      return;
    }
    const c = this.center(new THREE.Vector3());
    for (let i = 0; i < recA.length; i++) {
      this.cd[i] -= dt * (this.status.slow ? 0.5 : 1);
      if (this.cd[i] > 0 || this.status.freeze) continue;
      const a = recA[i];
      if (this.kind === 'trap') { this.trapTrigger(dt, a, i); continue; }
      const T = this.target && !this.target.point && !this.target.friendly ? this.target : null;
      const dist = T ? T.pos.distanceTo(c) : 99;
      const melee = (a.radius || 0) + this.radius + (T ? T.radius : 0.4) + 0.6;
      const fx = ATTACK_FX[a.type] || null;
      const kbTo = (p, k = a.kb) => p.clone().sub(c).setY(0).normalize().multiplyScalar(k).add(new THREE.Vector3(0, k * 0.45 + 1, 0)).toArray();
      switch (a.type) {
        case 'contact': case 'bite': case 'freeze': case 'burn': case 'stun': case 'shrink': case 'grow': case 'sticky': case 'launch': {
          if (a.radius > 1.5 && this.kind === 'disaster') { this.cd[i] = a.rate; this.game.areaHit(this.owner, c, a.radius, { dmg: a.dmg, kb: a.kb, fx }, true, this.id); break; }
          if (!T || dist > Math.max(melee, a.range * 0.6)) break;
          this.cd[i] = a.rate;
          g.dealHit(T.id, { dmg: a.dmg, kb: kbTo(T.pos), fx, by: this.owner });
          if (a.type === 'bite') { g.E.audio.play('chomp', c, 0.7); this.lunge(T.pos); }
          if (this.burrowed) { this.burrowed = false; this.burrowT = 1.6; }
          break;
        }
        case 'slam': case 'shockwave': {
          const r = Math.max(2, a.radius || 3);
          if (a.type === 'slam' && (!T || dist > r + 0.5)) break;
          if (a.type === 'shockwave' && (!T || dist > r + 3)) break;
          this.cd[i] = a.rate;
          g.areaHit(this.owner, this.pos, r, { dmg: a.dmg, kb: a.kb, up: a.kb * 0.6, fx }, true, this.id);
          g.emit({ k: 'fx', t: 'ring', at: this.pos.toArray(), r, c: this.rec.parts[0].c });
          if (this.body && a.type === 'slam') this.setVel(0, 5, 0);
          break;
        }
        case 'explode': {
          if (!T || dist > Math.max(melee, 1.5)) break;
          this.die('exploded');
          return;
        }
        case 'shoot': case 'lob': {
          if (!T || dist > a.range) break;
          this.cd[i] = a.rate;
          const from = c.clone().add(_v.set(0, this.height * 0.25, 0));
          const lead = T.vel ? T.pos.clone().addScaledVector(T.vel, dist / 30) : T.pos.clone();
          const dir = lead.sub(from);
          const spd = a.type === 'lob' ? Math.max(10, Math.sqrt(dir.length() * 15)) : 30;
          if (a.type === 'lob') dir.y += dir.length() * 0.6;
          g.shoot({ owner: this.owner, o: from.toArray(), d: dir.normalize().toArray(), spd, grav: a.type === 'lob' ? 15 : 1, size: a.proj_size, shape: a.proj === 'none' ? 'sphere' : a.proj, color: a.proj_color, dmg: a.dmg, kb: a.kb, radius: a.type === 'lob' ? Math.max(1.5, a.radius) : a.radius > 0.5 ? a.radius : 0, fx, life: 3, glow: true });
          g.E.audio.play(this.rec.sound === 'laser' ? 'laser' : 'shoot', from, 0.5);
          break;
        }
        case 'beam': case 'zap': {
          if (!T || dist > a.range) break;
          this.cd[i] = a.rate;
          g.dealHit(T.id, { dmg: a.dmg, kb: kbTo(T.pos, a.kb * 0.6), fx: fx || ATTACK_FX.zap, by: this.owner });
          g.emit({ k: 'fx', t: 'beam', a: c.toArray(), b: T.pos.toArray(), c: a.proj_color || '#9fd8ff', w: a.type === 'zap' ? 0.06 : 0.14 });
          if (a.type === 'zap') {
            let last = T.pos, n = 0;
            for (const o of g.targetsFor(this.owner)) {
              if (o.id === T.id || n >= 2 || o.pos.distanceTo(last) > 6) continue;
              g.dealHit(o.id, { dmg: a.dmg * 0.6, kb: [0, 2, 0], fx: ATTACK_FX.zap, by: this.owner });
              g.emit({ k: 'fx', t: 'beam', a: last.toArray(), b: o.pos.toArray(), c: '#c5a3ff', w: 0.05 });
              last = o.pos; n++;
            }
          }
          g.E.audio.play('zap', c, 0.6);
          break;
        }
        case 'suck': case 'blow': {
          const r = Math.max(3, a.radius || 6);
          this.cd[i] = Math.min(a.rate, 0.35);
          for (const t of g.targetsFor(this.owner)) {
            const d = t.pos.distanceTo(this.pos);
            if (d > r || t.id === this.id) continue;
            const dir = t.pos.clone().sub(this.pos).setY(0).normalize();
            const f = (1 - d / r) * Math.max(4, a.kb);
            const push = a.type === 'suck' ? dir.multiplyScalar(-f).add(new THREE.Vector3(-dir.z * f * 0.6, f * 0.45, dir.x * f * 0.6)) : dir.multiplyScalar(f).add(new THREE.Vector3(0, f * 0.3, 0));
            g.dealHit(t.id, { dmg: d < r * 0.35 ? a.dmg * 0.3 : 0, kb: null, fx: { type: 'push', v: push.toArray() }, by: this.owner });
          }
          break;
        }
        case 'lightning': case 'meteor': {
          if (!T || dist > Math.max(a.range, 25)) break;
          this.cd[i] = a.rate;
          const at = T.pos.clone();
          if (a.type === 'lightning') {
            g.emit({ k: 'fx', t: 'warn', at: at.toArray(), r: Math.max(1.5, a.radius) });
            setTimeout(() => {
              if (!this.game) return;
              g.areaHit(this.owner, at, Math.max(1.5, a.radius), { dmg: a.dmg, kb: a.kb, up: 6, fx: ATTACK_FX.zap }, true, this.id);
              g.emit({ k: 'fx', t: 'bolt', at: at.toArray() });
            }, 650);
          } else {
            const o = [at.x + (Math.random() - 0.5) * 4, at.y + 20, at.z + (Math.random() - 0.5) * 4];
            g.shoot({ owner: this.owner, o, d: [(at.x - o[0]) / 20, -1, (at.z - o[2]) / 20], spd: 24, grav: 8, size: Math.max(0.6, a.proj_size * 2), shape: a.proj === 'none' ? 'sphere' : a.proj, color: a.proj_color || '#ff7a00', dmg: a.dmg, kb: a.kb, radius: Math.max(2, a.radius), fx: { type: 'burn', dur: 2, amt: 3 }, life: 4, glow: true, trail: 'fire' });
          }
          break;
        }
        case 'heal_owner': case 'shield_owner': {
          const o = g.entityPos(this.owner);
          if (!o || o.distanceTo(this.pos) > Math.max(6, a.range)) break;
          this.cd[i] = Math.max(1.5, a.rate);
          g.dealHit(this.owner, { dmg: 0, fx: a.type === 'heal_owner' ? { type: 'heal', amt: Math.max(4, a.dmg) } : { type: 'shield', amt: Math.max(8, a.dmg) }, by: this.owner, friendly: true });
          g.emit({ k: 'fx', t: 'beam', a: c.toArray(), b: o.toArray(), c: a.type === 'heal_owner' ? '#9be37a' : '#9fd8ff', w: 0.08 });
          break;
        }
        case 'spawn': {
          this.cd[i] = Math.max(2.5, a.rate);
          this.spawnedKids = this.spawnedKids.filter((id) => this.mgr.get(id));
          if (this.spawnedKids.length >= 3 || !a.spawn) break;
          g.spawnChild(this, a.spawn).then((id) => { if (id) this.spawnedKids.push(id); });
          break;
        }
        default: break;
      }
    }
  }

  lunge(p) {
    if (!this.body || this.proxy) return;
    const d = p.clone().sub(this.pos).setY(0).normalize();
    const v = this.body.linvel();
    this.body.setLinvel({ x: v.x + d.x * 5, y: v.y + 2, z: v.z + d.z * 5 }, true);
  }

  trapTrigger(dt, a, i = -1) {
    const g = this.game;
    const harmless = !a.dmg;
    const list = harmless ? g.everyone() : g.targetsFor(this.owner);
    const r = Math.max(1, this.radius + 0.5, a.radius || 0);
    for (const t of list) {
      if (t.kind === 'idea' && t.ref === this) continue;
      if (t.pos.distanceTo(this.pos) > r + t.radius) continue;
      if (i >= 0) this.cd[i] = Math.max(0.4, a.rate);
      if (a.type === 'explode') { this.die('exploded'); return; }
      const fx = ATTACK_FX[a.type] || (a.type === 'contact' && a.kb > 8 ? ATTACK_FX.launch : null);
      g.dealHit(t.id, { dmg: a.dmg, kb: [0, Math.max(6, a.kb) * (a.type === 'launch' ? 1.6 : 0.8), 0], fx, by: this.owner });
      g.E.audio.play(harmless ? 'boing' : 'crunch', this.pos, 0.7);
      this.trapUses = (this.trapUses || 0) + 1;
      if (!harmless && this.trapUses >= 3) { this.die('used'); return; }
      break;
    }
  }

  disasterDefault(dt) {
    this.ddT = (this.ddT || 0) - dt;
    if (this.ddT > 0) return;
    this.ddT = 0.35;
    const r = Math.max(3, this.radius * 1.4 + 2);
    for (const t of this.game.targetsFor(this.owner)) {
      const d = t.pos.distanceTo(this.pos);
      if (d > r) continue;
      const dir = t.pos.clone().sub(this.pos).setY(0).normalize();
      const f = (1 - d / r) * 7;
      this.game.dealHit(t.id, { dmg: d < r * 0.4 ? 2 + this.rec.power * 0.6 : 0, fx: { type: 'push', v: [-dir.x * f - dir.z * f, f * 0.7, -dir.z * f + dir.x * f] }, by: this.owner });
    }
  }

  netState() {
    return [this.id, +this.pos.x.toFixed(2), +this.pos.y.toFixed(2), +this.pos.z.toFixed(2), +this.quat.x.toFixed(3), +this.quat.y.toFixed(3), +this.quat.z.toFixed(3), +this.quat.w.toFixed(3), Math.round((this.hp / this.maxHp) * 100), this.burrowed ? 1 : 0];
  }

  applyNet(s, now) {
    this.snaps.push({ t: now, p: new THREE.Vector3(s[1], s[2], s[3]), q: new THREE.Quaternion(s[4], s[5], s[6], s[7]) });
    if (this.snaps.length > 8) this.snaps.shift();
    this.hpPct = s[8];
    this.burrowed = !!s[9];
  }

  updateRemote(dt) {
    const now = performance.now() - 110;
    const S = this.snaps;
    if (S.length) {
      let a = S[0], b = S[S.length - 1];
      for (let i = 0; i < S.length - 1; i++) if (S[i].t <= now && S[i + 1].t >= now) { a = S[i]; b = S[i + 1]; break; }
      const k = b.t > a.t ? THREE.MathUtils.clamp((now - a.t) / (b.t - a.t), 0, 1) : 1;
      const prev = this.pos.clone();
      this.pos.copy(a.p).lerp(b.p, k);
      this.quat.copy(a.q).slerp(b.q, k);
      this.vel.copy(this.pos).sub(prev).divideScalar(Math.max(dt, 1e-3));
      if (this.body) { this.body.setNextKinematicTranslation(this.pos); this.body.setNextKinematicRotation(this.quat); }
    }
    if (this.collider && this.kind === 'creature') this.collider.setEnabled(!this.burrowed);
    this.group.position.copy(this.pos);
    if (this.burrowed) this.group.position.y -= this.height * 0.95;
    this.group.quaternion.copy(this.quat);
    this.speedNow = Math.hypot(this.vel.x, this.vel.z);
    animateModel(this.model, this.t + this.phase, this.speedNow, dt);
    if (this.kind === 'disaster') this.emitParticles(dt);
    else if (this.rec.particles !== 'none') this.emitParticles(dt);
    if (LOOPS.has(this.rec.sound)) this.game.E.audio.loop('idea:' + this.id, this.rec.sound, this.pos, 0.5);
  }
}

export class Ideas {
  constructor(game) {
    this.game = game;
    this.map = new Map();
    this.seq = 0;
  }

  newId(owner) { this.seq++; return `${String(owner).slice(-5)}${this.seq.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`; }

  spawn(ev, isOwner) {
    const n = Math.max(1, Math.min(12, ev.rec.count || 1));
    const out = [];
    for (let k = 0; k < n; k++) {
      const idea = new Idea(this, ev, k, isOwner);
      this.map.set(idea.id, idea);
      out.push(idea);
    }
    return out;
  }

  get(id) { return this.map.get(id); }

  remove(id, reason) {
    const i = this.map.get(id);
    if (!i) return;
    i.alive = false;
    i.vanish(reason);
    this.map.delete(id);
    this.game.onIdeaRemoved && this.game.onIdeaRemoved(i, reason);
  }

  owned(owner) { return [...this.map.values()].filter((i) => i.owner === owner && i.alive); }

  update(dt) { for (const i of [...this.map.values()]) if (i.alive) i.update(dt); }

  netStates(owner) {
    const out = [];
    for (const i of this.map.values()) if (i.isOwner && i.owner === owner && i.alive && i.kind !== 'structure') out.push(i.netState());
    return out;
  }

  netStatesWhere(fn) {
    const out = [];
    for (const i of this.map.values()) if (i.isOwner && i.alive && i.kind !== 'structure' && fn(i)) out.push(i.netState());
    return out;
  }

  applyStates(list, now = performance.now()) {
    for (const s of list) { const i = this.map.get(s[0]); if (i && !i.isOwner) i.applyNet(s, now); }
  }

  clear(filter = null) {
    for (const [id, i] of [...this.map.entries()]) if (!filter || filter(i)) { i.alive = false; i.vanish('cleared'); this.map.delete(id); }
  }
}
