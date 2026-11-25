// Battle with Ideas: another Thinker seen over the network (interpolated ragdoll pose, physics proxy, held weapon, ride).

import * as THREE from 'three';
import RAPIER from 'rapier';
import { Puppet, PART_NAMES } from './ragdoll.js';
import { GR } from '../engine/physics.js';

const DELAY = 110;
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion();

export class RemotePlayer {
  constructor(game, info) {
    this.game = game;
    this.E = game.E;
    this.remote = true;
    this.id = info.id;
    this.name = info.name || 'Thinker';
    this.color = info.color || '#9b5de5';
    this.team = info.team ?? 0;
    this.head = info.head || null;
    this.puppet = new Puppet(this.E.renderer.scene, this.color, { head: this.head });
    this.snaps = [];
    this.pose = new Float32Array(77);
    this.hasPose = false;
    this.hp = 100;
    this.alive = true;
    this.ghost = false;
    this.floppy = false;
    this.invisible = false;
    this.held = null;
    this.vehicleId = null;
    this.seat = 0;
    this.typing = '';
    this.vel = new THREE.Vector3();
    this.center = new THREE.Vector3(0, -50, 0);
    this.scale = 1;
    const W = this.E.physics.world;
    this.body = W.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0, -60, 0).setGravityScale(0).lockRotations().setLinearDamping(0).setCanSleep(false));
    this.collider = W.createCollider(RAPIER.ColliderDesc.capsule(0.55, 0.32).setCollisionGroups(GR.proxy).setFriction(0.4), this.body);
    this.collider.setMass(55);
  }

  get radius() { return 0.45 * this.scale; }
  get vehicle() { return this.vehicleId ? this.game.ideas.get(this.vehicleId) : null; }

  applyState(st, now = performance.now()) {
    if (st.pose) {
      this.snaps.push({ t: now, pose: st.pose });
      if (this.snaps.length > 10) this.snaps.shift();
    }
    if (st.hp !== undefined) this.hp = st.hp;
    const f = st.f || 0;
    this.ghost = !!(f & 1); this.floppy = !!(f & 2); this.invisible = !!(f & 4); this.bighead = !!(f & 8); this.frozen = !!(f & 16);
    this.scale = st.s || 1;
    this.alive = !this.ghost && this.hp > 0;
  }

  setHead(rec) { this.head = rec; this.puppet.setHead(rec); }

  pos(out = new THREE.Vector3()) { return out.copy(this.center); }
  handPos(out = new THREE.Vector3()) { return this.puppet.handPos('R', out); }

  interpolate() {
    const now = performance.now() - DELAY;
    const S = this.snaps;
    if (!S.length) return false;
    let a = S[0], b = S[S.length - 1], k = 1;
    if (now <= a.t) { b = a; k = 0; }
    else {
      for (let i = 0; i < S.length - 1; i++) if (S[i].t <= now && S[i + 1].t >= now) { a = S[i]; b = S[i + 1]; break; }
      k = b.t > a.t ? Math.min(1, (now - a.t) / (b.t - a.t)) : 1;
    }
    const P = this.pose, A = a.pose, B = b.pose;
    for (let i = 0; i < PART_NAMES.length; i++) {
      const o = i * 7;
      P[o] = A[o] + (B[o] - A[o]) * k; P[o + 1] = A[o + 1] + (B[o + 1] - A[o + 1]) * k; P[o + 2] = A[o + 2] + (B[o + 2] - A[o + 2]) * k;
      _qa.set(A[o + 3], A[o + 4], A[o + 5], A[o + 6]); _qb.set(B[o + 3], B[o + 4], B[o + 5], B[o + 6]);
      _qa.slerp(_qb, k);
      P[o + 3] = _qa.x; P[o + 4] = _qa.y; P[o + 5] = _qa.z; P[o + 6] = _qa.w;
    }
    while (S.length > 2 && S[1].t < now - 200) S.shift();
    return true;
  }

  update(dt) {
    if (this.interpolate()) {
      this.hasPose = true;
      const prev = this.center.clone();
      this.center.set(this.pose[7], this.pose[8], this.pose[9]);
      this.vel.copy(this.center).sub(prev).divideScalar(Math.max(dt, 1e-3));
      this.puppet.fromPose(this.pose);
    }
    const t = this.body.translation();
    const want = this.ghost || !this.hasPose || this.vehicleId ? { x: 0, y: -60, z: 0 } : { x: this.pose[0], y: this.pose[1] + 0.05, z: this.pose[2] };
    const dx = want.x - t.x, dy = want.y - t.y, dz = want.z - t.z;
    if (dx * dx + dy * dy + dz * dz > 9) { this.body.setTranslation(want, true); this.body.setLinvel({ x: 0, y: 0, z: 0 }, true); }
    else this.body.setLinvel({ x: dx * 18, y: dy * 18, z: dz * 18 }, true);
    this.puppet.group.visible = !this.invisible && this.hasPose;
    this.puppet.setGhost(this.ghost);
    this.puppet.headSlot.scale.setScalar(this.bighead ? 2.3 : 1);
    for (const n of PART_NAMES) this.puppet.meshes[n].scale.setScalar(this.scale);
    this.puppet.mat.color.set(this.frozen ? '#9fd8ff' : this.color);
    this.puppet.tick(dt, Math.hypot(this.vel.x, this.vel.z));
    if (this.held) this.game.weapons.tick(this, dt);
  }

  destroy() {
    this.E.physics.removeBody(this.body);
    this.puppet.dispose(this.E.renderer.scene);
  }
}
