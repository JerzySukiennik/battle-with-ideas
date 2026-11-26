// Battle with Ideas: the local Thinker (movement, pencil, shove, grab, status effects, surfaces, KO).

import * as THREE from 'three';
import { Ragdoll, Puppet, PART_NAMES } from './ragdoll.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();

export const STATUS_TINT = { freeze: '#9fd8ff', burn: '#ffb347', poison: '#9be37a', sticky: '#d6c27a' };

export class LocalPlayer {
  constructor(game, info) {
    this.game = game;
    this.E = game.E;
    this.id = info.id;
    this.name = info.name;
    this.color = info.color;
    this.team = info.team ?? 0;
    this.head = info.head || null;
    this.puppet = new Puppet(this.E.renderer.scene, this.color, { head: this.head });
    this.outfit = null;
    this.buffs = {};
    if (info.outfit) this.wear(info.outfit);
    this.rag = null;
    this.scale = 1;
    this.hp = 100;
    this.maxHp = 100;
    this.wena = 100;
    this.alive = true;
    this.ghost = false;
    this.status = {};
    this.shield = 0;
    this.held = null;
    this.vehicle = null;
    this.holding = null;
    this.grabbedBy = null;
    this.cool = { pencil: 0, shove: 0, use: 0, grab: 0 };
    this.lastHitBy = null;
    this.ghostPos = new THREE.Vector3();
    this.ghostVel = new THREE.Vector3();
    this.typing = '';
    this.dotTimer = 0;
    this.surfaceTimer = 0;
    this.spawned = false;
    this.knockFrom = new THREE.Vector3();
  }

  spawn(at, yaw = 0) {
    if (this.rag) this.rag.destroy();
    this.scale = 1;
    this.rag = new Ragdoll(this.E.physics, at, yaw, 1);
    this.rag.yaw = yaw;
    this.game.cam.yaw = yaw + Math.PI;
    this.hp = this.maxHp;
    this.alive = true;
    this.ghost = false;
    this.status = {};
    this.shield = 0;
    this.puppet.setGhost(false);
    this.puppet.setVisible(true);
    this.applyScale(1);
    this.spawned = true;
    this.vehicle = null;
    this.holding = null;
  }

  becomeGhost() {
    this.ghost = true;
    this.alive = false;
    if (this.vehicle) this.game.vehicles.exit(this, true);
    this.dropHeld();
    if (this.rag) { this.ghostPos.copy(this.rag.chestPos()); this.ghostPos.y = Math.max(this.ghostPos.y, 3); this.rag.destroy(); this.rag = null; }
    else this.ghostPos.set(0, 6, 0);
    this.puppet.setGhost(true);
    this.status = {};
  }

  pos(out = new THREE.Vector3()) {
    if (this.flight) return out.copy(this.ghostPos);
    if (this.vehicle) return out.copy(this.vehicle.pos);
    if (!this.rag) return out.copy(this.ghostPos);
    return this.rag.chestPos(out);
  }

  get radius() { return 0.45 * this.scale; }

  applyScale(s) {
    if (Math.abs(s - this.scale) < 0.01 && this.rag && this.rag.scale === s) return;
    this.scale = s;
    if (this.rag && Math.abs(this.rag.scale - s) > 0.01) {
      const p = this.rag.pos(); p.y = this.rag.groundY > -50 ? this.rag.groundY : p.y - 0.98;
      const yaw = this.rag.yaw;
      const st = this.rag.strength, fl = this.rag.floppy;
      this.rag.destroy();
      this.rag = new Ragdoll(this.E.physics, p, yaw, s);
      this.rag.strength = st; this.rag.floppy = fl;
    }
    for (const n of PART_NAMES) this.puppet.meshes[n].scale.setScalar(s);
  }

  has(k) { return !!this.status[k]; }

  wear(outfit, withBuffs = false) {
    this.outfit = outfit && outfit.pieces ? outfit : null;
    this.puppet.setOutfit(this.outfit);
    this.buffs = {};
    if (withBuffs && this.outfit) for (const b of this.outfit.buffs) this.buffs[b.type] = b.amt;
  }

  addStatus(type, dur, amt = 1) {
    const cur = this.status[type];
    this.status[type] = { t: Math.max(cur ? cur.t : 0, dur), amt };
    if (type === 'freeze' && this.rag) this.rag.knock(dur);
    if (type === 'stun' && this.rag) this.rag.knock(dur);
  }

  onHit(h) {
    if (!this.alive || this.ghost) return;
    if (this.game.mode && this.game.mode.invulnerable && this.game.mode.invulnerable(this)) return;
    let dmg = h.dmg || 0;
    if (this.shieldUp > 0) dmg *= 0.25;
    if (this.buffs.armor) dmg *= 1 - this.buffs.armor;
    if (this.painting > 0) return;
    if (this.shield > 0) { const a = Math.min(this.shield, dmg); this.shield -= a; dmg -= a; }
    if (dmg > 0) {
      this.hp -= dmg;
      this.game.hud && this.game.hud.hurt(Math.min(1, dmg / 30));
      this.game.fx.burst(this.pos(_v), 'ink', Math.min(24, 4 + dmg));
    }
    if (h.by) this.lastHitBy = { id: h.by, t: performance.now() };
    const kb = h.kb ? _v2.set(h.kb[0], h.kb[1], h.kb[2]) : null;
    if (kb && this.buffs.heavy) kb.multiplyScalar(1 - this.buffs.heavy);
    if (kb && this.vehicle && kb.length() > 9) this.game.vehicles.exit(this, true);
    if (kb && this.rag) {
      const L = kb.length();
      this.rag.impulse(kb);
      if (L > 5.5) { this.rag.knock(0.45 + Math.min(2.2, L * 0.07)); this.E.audio.play('bonk', this.pos(_v), 0.6); }
    }
    if (h.fx && h.fx.type && h.fx.type !== 'none') this.applyEffect(h.fx);
    if (this.hp <= 0) this.ko(h.by);
  }

  applyEffect(fx) {
    const dur = fx.dur || 3, amt = fx.amt ?? 1;
    switch (fx.type) {
      case 'burn': case 'poison': if (fx.type === 'burn' && this.buffs.fireproof) break; this.addStatus(fx.type, dur, amt || 4); break;
      case 'freeze': if (this.buffs.iceproof) break; this.addStatus('freeze', Math.min(dur, 3.5)); break;
      case 'stun': this.addStatus('stun', Math.min(dur, 2.5)); break;
      case 'launch': if (this.rag) { this.rag.impulse(new THREE.Vector3((Math.random() - 0.5) * 3, 14 + amt * 0.5, (Math.random() - 0.5) * 3)); this.rag.knock(1.5); } break;
      case 'shrink': this.addStatus('scale', dur, 0.5); break;
      case 'grow': this.addStatus('scale', dur, 1.8); break;
      case 'scale': this.addStatus('scale', dur, THREE.MathUtils.clamp(amt, 0.35, 2.4)); break;
      case 'sticky': case 'slow': this.addStatus('slow', dur, 0.4); break;
      case 'speed': this.addStatus('speed', dur, THREE.MathUtils.clamp(amt, 0.3, 2.6)); break;
      case 'gravity': this.addStatus('gravity', dur, THREE.MathUtils.clamp(amt, -0.6, 3)); break;
      case 'lowgrav': this.addStatus('gravity', dur, 0.35); break;
      case 'reverse': this.addStatus('reverse', dur); break;
      case 'invisible': this.addStatus('invisible', dur); break;
      case 'slippery': this.addStatus('slippery', dur); break;
      case 'dark': this.addStatus('dark', dur); break;
      case 'bighead': this.addStatus('bighead', dur); break;
      case 'levitate': this.addStatus('levitate', dur, amt); break;
      case 'heal': this.hp = Math.min(this.maxHp, this.hp + Math.abs(amt || 20)); this.game.fx.burst(this.pos(_v), 'hearts', 14); break;
      case 'shield': this.shield = Math.min(150, this.shield + Math.abs(amt || 30)); break;
      case 'confetti': this.game.fx.burst(this.pos(_v), 'confetti', 30); break;
      case 'teleport': if (fx.to && this.rag) this.rag.teleport(new THREE.Vector3(fx.to[0], fx.to[1], fx.to[2]), this.rag.yaw); break;
      case 'push': if (fx.v && this.rag) this.rag.impulse(new THREE.Vector3(fx.v[0], fx.v[1], fx.v[2])); break;
      default: break;
    }
  }

  ko(by) {
    if (!this.alive) return;
    this.alive = false;
    this.buffs = {};
    const killer = by || (this.lastHitBy && performance.now() - this.lastHitBy.t < 8000 ? this.lastHitBy.id : null);
    this.game.onLocalKO(killer);
  }

  dropHeld() { if (this.held) { this.game.weapons.drop(this); } }

  update(dt, input) {
    const game = this.game, cam = game.cam;
    for (const k in this.cool) this.cool[k] = Math.max(0, this.cool[k] - dt);
    if (this.shieldUp > 0) this.shieldUp -= dt;
    if (this.flight) return this.updateFlight(dt);
    for (const k in this.status) { this.status[k].t -= dt; if (this.status[k].t <= 0) delete this.status[k]; }
    const st = this.status;
    if (this.ghost) return this.updateGhost(dt, input);
    if (!this.rag) return;
    const wantScale = st.scale ? st.scale.amt : 1;
    if (Math.abs(wantScale - this.scale) > 0.01) this.applyScale(wantScale);
    if (this.vehicle) { game.vehicles.drive(this, dt, input); this.updateActions(dt, input, true); return; }
    const rag = this.rag;
    const mv = input.move();
    let mx = mv.x, mz = mv.z;
    if (st.reverse) { mx = -mx; mz = -mz; }
    const f = cam.flatForward(_v), r = cam.right(_v2);
    const dir = new THREE.Vector3().addScaledVector(f, mz).addScaledVector(r, mx);
    if (dir.lengthSq() > 1) dir.normalize();
    rag.move.copy(dir);
    let speed = 5.2 * (mv.sprint ? 1.38 : 1);
    if (st.speed) speed *= st.speed.amt;
    const bf = this.buffs;
    if (bf.speed) speed *= bf.speed;
    if (st.slow) speed *= st.slow.amt;
    if (st.freeze) speed = 0;
    rag.gravityMul = st.gravity ? st.gravity.amt : 1;
    rag.lowFriction = !!st.slippery;
    rag.bounce = false;
    this.applySurface(dt, rag);
    if (bf.lowgrav) rag.gravityMul *= bf.lowgrav;
    rag.jumpMul = bf.jump || 1;
    rag.speed = speed * (this.surfaceSpeed || 1);
    if (bf.glide || bf.fly) this.updateWings(dt, input, rag, bf);
    if (bf.regen && this.hp < this.maxHp) this.hp = Math.min(this.maxHp, this.hp + bf.regen * dt);
    if (input.hit('Space') || (input.typing && false)) rag.jumpReq = true;
    const aimDir = cam.forward(new THREE.Vector3());
    rag.aim.copy(aimDir);
    const wantYaw = Math.atan2(aimDir.x, aimDir.z);
    rag.yaw = wantYaw;
    if (st.levitate) { for (const n of ['pelvis', 'chest']) rag.bodies[n].applyImpulse({ x: 0, y: rag.mass * (18 + 6) * dt * 0.5, z: 0 }, true); }
    if (this.grabbedBy) this.updateGrabbed(dt);
    rag.arms = this.holding ? 'reach' : this.held ? (this.held.def.type === 'melee' || this.held.def.type === 'whip' ? (this.cool.use > 0.1 ? 'swing' : 'hold') : 'aim') : (this.cool.pencil > 0.2 ? 'aim' : (input.down('KeyE') ? 'reach' : 'idle'));
    this.updateActions(dt, input, false);
    const p = rag.pos(_v);
    if (p.y < -22) this.ko(null);
    if (game.island.zone.r < 98 && Math.hypot(p.x, p.z) > game.island.zone.r) {
      this.dotTimer += dt;
      if (this.dotTimer > 0.5) { this.dotTimer = 0; this.onHit({ dmg: 5 }); }
    }
    const dot = (st.burn ? st.burn.amt : 0) + (st.poison ? st.poison.amt : 0);
    if (dot > 0) { this.dotAcc = (this.dotAcc || 0) + dt; if (this.dotAcc > 0.5) { this.dotAcc = 0; this.onHit({ dmg: Math.min(12, dot) * 0.5 }); game.fx.burst(this.pos(_v), st.burn ? 'fire' : 'bubbles', 3); } }
  }

  updateWings(dt, input, rag, bf) {
    const vy = rag.bodies.pelvis.linvel().y;
    if (bf.fly && !input.typing && input.down('Space') && !rag.jumpReq) {
      const up = vy < 6 ? (18 * rag.gravityMul + 9 + 14 * bf.fly) * dt : 18 * rag.gravityMul * dt;
      rag.impulse(_v.set(0, up, 0));
      rag.air = Math.max(rag.air, 0.1);
      this.flyFx = (this.flyFx || 0) + dt;
      if (this.flyFx > 0.08) { this.flyFx = 0; this.game.fx.burst(rag.pos(_v).setY(rag.pos(_v).y - 0.6), 'smoke', 2); }
    } else if (bf.glide && !rag.grounded && vy < -1.2) {
      const cap = -1.2 - (1 - bf.glide) * 3;
      if (vy < cap) rag.impulse(_v.set(0, (cap - vy) * 0.35, 0));
    }
  }

  applySurface(dt, rag) {
    this.surfaceSpeed = 1;
    const isl = this.game.island;
    if (!rag.grounded || !isl.recipe) return;
    const s = isl.surface;
    this.surfaceTimer += dt;
    if (s === 'ice') rag.lowFriction = true;
    else if (s === 'lava') { if (this.surfaceTimer > 0.4 && !this.buffs.fireproof) { this.surfaceTimer = 0; this.onHit({ dmg: 3 }); this.game.fx.burst(this.pos(_v), 'embers', 4); } rag.bounce = true; }
    else if (s === 'toxic') { if (this.surfaceTimer > 0.5) { this.surfaceTimer = 0; this.onHit({ dmg: 2 }); this.game.fx.burst(this.pos(_v), 'bubbles', 3); } }
    else if (s === 'bouncy') rag.bounce = true;
    else if (s === 'mud') this.surfaceSpeed = 0.55;
    else if (s === 'water') { this.surfaceSpeed = 0.7; if (this.surfaceTimer > 0.3 && rag.move.lengthSq() > 0.1) { this.surfaceTimer = 0; this.game.fx.burst(rag.pos(_v), 'water', 3); } }
    else if (s === 'sand') this.surfaceSpeed = 0.8;
    else if (s === 'speed') this.surfaceSpeed = 1.55;
    else if (s === 'lowgrav') rag.gravityMul = Math.min(rag.gravityMul, 0.42);
    else if (s === 'cloud') { rag.gravityMul = Math.min(rag.gravityMul, 0.7); rag.bounce = rag.move.lengthSq() > 0.2; }
    else if (s === 'conveyor') { const c = isl.conveyor; for (const n of ['pelvis', 'chest']) rag.bodies[n].applyImpulse({ x: c.x * 2.4 * rag.mass * dt, y: 0, z: c.y * 2.4 * rag.mass * dt }, true); }
  }

  updateActions(dt, input, inVehicle) {
    const game = this.game;
    if (input.typing) return;
    if (input.hit('KeyE') && this.cool.grab <= 0) { this.cool.grab = 0.25; game.interact(this); }
    if (inVehicle) { if (input.mouse.l && this.cool.use <= 0) game.vehicles.fire(this); return; }
    if (this.holding && (input.mouse.lp || input.hit('KeyQ'))) { game.throwHeld(this); return; }
    if (input.mouse.l) {
      if (this.held) { if (this.cool.use <= 0) game.weapons.use(this); }
      else if (this.cool.pencil <= 0) this.pencil();
    }
    if (input.mouse.rp && this.cool.shove <= 0) this.shove();
    if (input.hit('KeyF') && this.held) this.dropHeld();
  }

  pencil() {
    this.cool.pencil = 0.33;
    const game = this.game;
    const from = this.puppet.handPos('R', new THREE.Vector3());
    const to = game.cam.aimPoint();
    const d = to.sub(from).normalize();
    game.shoot({ owner: this.id, o: [from.x, from.y, from.z], d: [d.x, d.y, d.z], spd: 44, grav: 2, size: 0.32, shape: 'pencil', color: '#ffd23f', dmg: 6, kb: 3.2, fx: null, life: 1.6 });
    this.E.audio.play('pencil', from, 0.5);
    game.cam.fovKick = -0.6;
  }

  shove() {
    this.cool.shove = 0.62;
    const game = this.game;
    const c = this.pos(new THREE.Vector3());
    const f = game.cam.flatForward(new THREE.Vector3());
    const at = c.clone().addScaledVector(f, 1.0);
    if (this.rag) this.rag.impulse(f.clone().multiplyScalar(1.6), 'chest');
    game.areaHit(this.id, at, 1.6, { dmg: 4, kbDir: f, kb: 9.5, up: 3.5 }, true);
    this.E.audio.play('whoosh', c, 0.4);
  }

  updateGrabbed(dt) {
    const g = this.grabbedBy;
    g.t -= dt;
    const grabber = this.game.players.get(g.by);
    if (!grabber || g.t <= 0 || !grabber.handPos) { this.grabbedBy = null; return; }
    const hand = grabber.handPos(new THREE.Vector3());
    const ch = this.rag.bodies.chest;
    const p = ch.translation(), v = ch.linvel();
    const k = 40, c = 7;
    const m = this.rag.mass * 0.6;
    ch.applyImpulse({ x: ((hand.x - p.x) * k - v.x * c) * m * dt, y: ((hand.y - 0.2 - p.y) * k - v.y * c + 18) * m * dt, z: ((hand.z - p.z) * k - v.z * c) * m * dt }, true);
    this.rag.knock(0.3);
  }

  updateGhost(dt, input) {
    const cam = this.game.cam;
    const mv = input.move();
    const f = cam.forward(_v), r = cam.right(_v2);
    const acc = new THREE.Vector3().addScaledVector(f, mv.z).addScaledVector(r, mv.x);
    if (input.down('Space')) acc.y += 1;
    if (input.down('ControlLeft') || input.down('KeyC')) acc.y -= 1;
    this.ghostVel.addScaledVector(acc, dt * 30).multiplyScalar(Math.exp(-dt * 3));
    this.ghostPos.addScaledVector(this.ghostVel, dt);
    this.ghostPos.y = THREE.MathUtils.clamp(this.ghostPos.y, 0.6, 40);
    const R = 45;
    const h = Math.hypot(this.ghostPos.x, this.ghostPos.z);
    if (h > R) this.ghostPos.multiplyScalar(R / h);
    this.ghostPhase = (this.ghostPhase || 0) + dt;
    this.ghostPose = ghostPose(this.ghostPos, Math.atan2(f.x, f.z), this.ghostPhase);
  }

  startFlight(path, dur, onLand) {
    this.flight = { t: 0, dur, path, onLand };
    this.painting = dur + 0.6;
    if (this.vehicle) this.game.vehicles.exit(this, false);
    if (this.rag) this.rag.setEnabled(false);
  }

  updateFlight(dt) {
    const f = this.flight;
    f.t += dt;
    this.painting -= dt;
    const k = Math.min(1, f.t / f.dur);
    const p = f.path(k);
    const p2 = f.path(Math.min(1, k + 0.02));
    const dir = p2.clone().sub(p);
    const yaw = Math.atan2(dir.x, dir.z);
    const pitch = k < 0.08 || k > 0.92 ? 0.2 : 1.25;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, Math.sin(f.t * 3) * 0.2, 'YXZ'));
    const m = new THREE.Matrix4().compose(p, q, new THREE.Vector3(1, 1, 1));
    this.flightPose = restPose(m, { arms: true, float: true, wave: f.t * 6 });
    this.ghostPos.copy(p);
    if (k >= 1) {
      this.flight = null;
      if (this.rag) { this.rag.setEnabled(true); const land = f.path(1); const h = this.E.physics.ray(land.x, land.y + 2, land.z, 0, -1, 0, 40); this.rag.teleport(new THREE.Vector3(land.x, h ? h.y : 0, land.z), yaw); }
      if (f.onLand) f.onLand();
    }
  }

  render(dt) {
    const p = this.puppet;
    if (this.flight && this.flightPose) p.fromPose(this.flightPose);
    else if (this.ghost) { if (this.ghostPose) p.fromPose(this.ghostPose); }
    else if (this.vehicle) { const pose = this.game.vehicles.seatPose(this); if (pose) p.fromPose(pose); }
    else if (this.rag) p.fromBodies(this.rag.bodies);
    p.headSlot.scale.setScalar(this.status.bighead ? 2.3 : 1);
    const inv = !!this.status.invisible;
    p.group.visible = true;
    p.mat.opacity = inv ? 0.25 : 1; p.mat.transparent = inv;
    const tint = this.status.freeze ? STATUS_TINT.freeze : null;
    p.mat.color.set(tint || p.bodyColor(this.color, !!(this.game.mode && this.game.mode.teams)));
    const speed = this.rag ? Math.hypot(this.rag.vel(_v).x, _v.z) : 0;
    p.tick(dt, speed);
    this.E.renderer.post.uniforms.dark.value += ((this.status.dark ? 1 : 0) - this.E.renderer.post.uniforms.dark.value) * Math.min(1, dt * 4);
  }

  netPose() {
    if (this.flight) return this.flightPose;
    if (this.ghost) return this.ghostPose;
    if (this.vehicle) return this.game.vehicles.seatPose(this);
    return this.rag ? this.rag.pose(this._pose || (this._pose = new Float32Array(77))) : null;
  }

  handPos(out = new THREE.Vector3()) { return this.puppet.handPos('R', out); }

  destroy() { if (this.rag) this.rag.destroy(); this.puppet.dispose(this.E.renderer.scene); }
}

const REST = {
  pelvis: [0, 0.98, 0], chest: [0, 1.32, 0], head: [0, 1.74, 0], uarmL: [-0.28, 1.37, 0], farmL: [-0.28, 1.11, 0],
  uarmR: [0.28, 1.37, 0], farmR: [0.28, 1.11, 0], thighL: [-0.1, 0.7, 0], shinL: [-0.1, 0.3, 0], thighR: [0.1, 0.7, 0], shinR: [0.1, 0.3, 0],
};

export function restPose(matrix, opt = {}) {
  const out = new Float32Array(77);
  const pos = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  matrix.decompose(pos, q, s);
  const sit = opt.sit, wave = opt.wave || 0, float = opt.float || 0;
  for (let i = 0; i < PART_NAMES.length; i++) {
    const n = PART_NAMES[i];
    const lp = new THREE.Vector3(...REST[n]).sub(new THREE.Vector3(0, 0.98, 0));
    const lq = new THREE.Quaternion();
    if (sit && n.startsWith('thigh')) { lp.set(n.endsWith('L') ? -0.1 : 0.1, -0.08, 0.2); lq.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2); }
    if (sit && n.startsWith('shin')) { lp.set(n.endsWith('L') ? -0.1 : 0.1, -0.28, 0.42); }
    if ((sit || opt.arms) && n.startsWith('uarm')) { lp.z += 0.12; lp.y -= 0.02; lq.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.9); }
    if ((sit || opt.arms) && n.startsWith('farm')) { lp.z += 0.32; lp.y += 0.12; lq.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -1.4); }
    if (float && (n.startsWith('thigh') || n.startsWith('shin'))) { lp.y += Math.sin(wave + (n.endsWith('L') ? 0 : 1.5)) * 0.04; lq.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.sin(wave + (n.endsWith('L') ? 0 : 2)) * 0.3); }
    if (float && n.startsWith('uarm')) { lq.setFromAxisAngle(new THREE.Vector3(0, 0, 1), (n.endsWith('L') ? -1 : 1) * (0.5 + Math.sin(wave * 1.3) * 0.2)); lp.x *= 1.15; }
    lp.applyQuaternion(q).add(pos);
    const wq = q.clone().multiply(lq);
    out.set([lp.x, lp.y, lp.z, wq.x, wq.y, wq.z, wq.w], i * 7);
  }
  return out;
}

function ghostPose(p, yaw, t) {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(p.x, p.y + Math.sin(t * 2) * 0.15, p.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(1, 1, 1));
  return restPose(m, { float: true, wave: t * 2 });
}
