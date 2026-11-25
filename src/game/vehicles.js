// Battle with Ideas: drivable ideas (cars, mounts, mechs, boats, planes, helicopters, rockets, UFOs, balloons) and seats.

import * as THREE from 'three';
import { GR } from '../engine/physics.js';
import { restPose } from './player.js';

const FLYERS = new Set(['plane', 'helicopter', 'rocket', 'ufo', 'balloon']);
const UP = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();

export class Vehicles {
  constructor(game) {
    this.game = game;
    this.drivers = new Map();
  }

  flies(idea) { const v = idea.rec.vehicle; return v.fly || FLYERS.has(v.type); }

  seatOffset(idea, seat = 0) {
    const h = idea.model.height, d = idea.model.dims;
    const y = THREE.MathUtils.clamp(h * (['bike', 'mount', 'board', 'balloon'].includes(idea.rec.vehicle.type) ? 0.78 : 0.42), 0.3, 4.5);
    const x = seat === 0 ? (idea.rec.vehicle.seats > 1 ? -Math.min(0.35, d[0] * 0.2) : 0) : (seat % 2 ? Math.min(0.35, d[0] * 0.2) : -Math.min(0.35, d[0] * 0.2));
    const z = seat < 2 ? Math.min(0.2, d[2] * 0.1) : -Math.min(0.9, d[2] * 0.25);
    return new THREE.Vector3(x, y, z);
  }

  enter(player, idea, seat = 0) {
    if (!idea || !idea.alive) return false;
    player.vehicle = idea;
    player.seat = seat;
    if (player.rag) { player.rag.setEnabled(false); }
    if (seat === 0) { idea.driver = player.id; this.drivers.set(idea.id, player.id); }
    this.game.emit({ k: 'ride', id: player.id, v: idea.id, seat });
    this.game.hud && this.game.hud.toast(seat === 0 ? (this.flies(idea) ? 'W fly where you look, Space up, Ctrl down, click to shoot, E to exit' : 'W/S drive, A/D steer, Space jump, click to shoot or honk, E to exit') : 'Riding along. E to hop off.');
    this.game.E.audio.play(idea.rec.sound === 'none' ? 'engine' : idea.rec.sound, idea.pos, 0.6);
    return true;
  }

  exit(player, forced = false) {
    const idea = player.vehicle;
    player.vehicle = null;
    if (idea) {
      if (idea.driver === player.id) { idea.driver = null; this.drivers.delete(idea.id); }
      const side = new THREE.Vector3(1.4 + idea.radius, 0, 0).applyQuaternion(idea.quat);
      const at = idea.pos.clone().add(side);
      const h = this.game.E.physics.ray(at.x, at.y + 3, at.z, 0, -1, 0, 30, GR.rayStatic);
      at.y = h ? h.y : Math.max(at.y, 0);
      if (player.rag) {
        player.rag.setEnabled(true);
        player.rag.teleport(at, Math.atan2(this.game.cam.flatForward(_v).x, _v.z));
        if (forced) player.rag.knock(1.2);
        const v = idea.vel;
        if (v && forced) player.rag.impulse(new THREE.Vector3(v.x * 0.6, 5, v.z * 0.6));
      }
    }
    this.game.emit({ k: 'ride', id: player.id, v: null });
  }

  seatPose(view) {
    const idea = view.vehicle;
    if (!idea) return null;
    const off = this.seatOffset(idea, view.seat || 0);
    const p = off.applyQuaternion(idea.group.quaternion).add(idea.group.position);
    p.y -= 0.1;
    _m.compose(p, idea.group.quaternion, new THREE.Vector3(1, 1, 1));
    return restPose(_m, { sit: true });
  }

  drive(player, dt, input) {
    const idea = player.vehicle;
    if (!idea || !idea.alive) { this.exit(player, true); return; }
    if (idea.driver !== player.id) return;
    idea.input = { mv: input.typing ? { x: 0, z: 0 } : input.move(), up: !input.typing && input.down('Space'), down: !input.typing && (input.down('ControlLeft') || input.down('KeyC')), boost: !input.typing && input.down('ShiftLeft'), jump: !input.typing && input.hit('Space') };
  }

  updateIdea(idea, dt) {
    const body = idea.body;
    if (!body || idea.proxy) return;
    const v = idea.rec.vehicle;
    const inp = idea.driver ? idea.input || { mv: { x: 0, z: 0 } } : { mv: { x: 0, z: 0 } };
    const cam = this.game.cam;
    const lv = body.linvel();
    const max = v.speed * (inp.boost ? 1.35 : 1);
    if (this.flies(idea)) {
      body.setGravityScale(idea.driver ? 0 : 0.35, true);
      if (!idea.driver) { body.setLinvel({ x: lv.x * 0.98, y: Math.max(lv.y, -4), z: lv.z * 0.98 }, true); return; }
      const f = cam.forward(new THREE.Vector3()), r = cam.right(new THREE.Vector3());
      const want = new THREE.Vector3();
      want.addScaledVector(f, inp.mv.z * max).addScaledVector(r, inp.mv.x * max * 0.6);
      if (inp.up) want.y += max * 0.5;
      if (inp.down) want.y -= max * 0.5;
      if (v.type === 'plane' || v.type === 'rocket') { const fwd = Math.max(inp.mv.z, 0.35); want.copy(f).multiplyScalar(fwd * max).addScaledVector(r, inp.mv.x * max * 0.3); if (inp.up) want.y += max * 0.3; if (inp.down) want.y -= max * 0.3; }
      if (v.type === 'balloon') want.multiplyScalar(0.5);
      const ground = idea.groundBelow();
      if (idea.pos.y < ground + 0.6 && want.y < 0) want.y = 0;
      if (idea.pos.y > 45 && want.y > 0) want.y = 0;
      const k = Math.min(1, dt * 2.5);
      body.setLinvel({ x: lv.x + (want.x - lv.x) * k, y: lv.y + (want.y - lv.y) * k, z: lv.z + (want.z - lv.z) * k }, true);
      const yaw = Math.atan2(f.x, f.z);
      const bank = THREE.MathUtils.clamp(-inp.mv.x * 0.45, -0.6, 0.6);
      const pitch = v.type === 'helicopter' || v.type === 'ufo' || v.type === 'balloon' ? inp.mv.z * 0.18 : -Math.asin(THREE.MathUtils.clamp(f.y, -0.9, 0.9)) * 0.8;
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, bank, 'YXZ'));
      const cur = body.rotation();
      _q.set(cur.x, cur.y, cur.z, cur.w).slerp(q, Math.min(1, dt * 5));
      body.setRotation(_q, true);
      body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      return;
    }
    body.setGravityScale(1, true);
    const g = idea.groundBelow();
    const grounded = idea.pos.y - g < 0.45;
    const r = body.rotation();
    _q.set(r.x, r.y, r.z, r.w);
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(_q).setY(0).normalize();
    idea.steer = idea.steer || 0;
    const speedF = lv.x * fwd.x + lv.z * fwd.z;
    if (idea.driver) {
      const steerIn = -inp.mv.x;
      idea.steer += (steerIn - idea.steer) * Math.min(1, dt * 6);
      const yawRate = idea.steer * (1.2 + Math.min(1.6, Math.abs(speedF) * 0.12)) * Math.sign(speedF || 1) * (v.type === 'mech' ? 0.6 : 1);
      const yaw = Math.atan2(fwd.x, fwd.z) + yawRate * dt;
      const tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, idea.steer * Math.min(0.15, Math.abs(speedF) * 0.01), 'YXZ'));
      body.setRotation(tilt, true);
      body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      const target = inp.mv.z * max * (inp.mv.z < 0 ? 0.5 : 1);
      const accel = (grounded ? (v.type === 'mech' ? 8 : 16) : 3) * dt;
      const ns = speedF + THREE.MathUtils.clamp(target - speedF, -accel * 2, accel);
      const nf = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
      const side = new THREE.Vector3(lv.x, 0, lv.z).addScaledVector(fwd, -speedF).multiplyScalar(grounded ? 0.8 : 0.98);
      let vy = lv.y;
      if (inp.jump && grounded) { vy = v.type === 'mount' || v.type === 'mech' ? 9 : 7; this.game.E.audio.play('boing', idea.pos, 0.4); }
      if (v.type === 'hover' || v.type === 'boat' || v.type === 'board') { const want = g + 0.6; vy = idea.pos.y < want ? Math.max(vy, (want - idea.pos.y) * 6) : vy; }
      body.setLinvel({ x: nf.x * ns + side.x, y: vy, z: nf.z * ns + side.z }, true);
      if (v.type === 'mount' && grounded && Math.abs(ns) > 2) { idea.hopT = (idea.hopT || 0) - dt; if (idea.hopT <= 0) { idea.hopT = 0.45; body.setLinvel({ x: nf.x * ns, y: 3.5, z: nf.z * ns }, true); } }
      if (v.type === 'mech' && grounded && Math.abs(ns) > 1.5) { idea.stompT = (idea.stompT || 0) - dt; if (idea.stompT <= 0) { idea.stompT = 0.7; this.game.areaHit(idea.owner, idea.pos, 2.2 + idea.radius, { dmg: 6, kb: 8, up: 5 }, true, idea.id); this.game.emit({ k: 'fx', t: 'ring', at: idea.pos.toArray(), r: 2.5 + idea.radius, c: '#25252b' }); this.game.E.renderer.addShake(0.15); } }
    } else {
      body.setLinvel({ x: lv.x * (grounded ? 0.95 : 0.995), y: lv.y, z: lv.z * (grounded ? 0.95 : 0.995) }, true);
      const yaw = Math.atan2(fwd.x, fwd.z);
      body.setRotation(new THREE.Quaternion().setFromAxisAngle(UP, yaw), true);
      body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }
  }

  fire(player) {
    const idea = player.vehicle;
    if (!idea) return;
    const game = this.game;
    if (idea.driver !== player.id) { if (player.cool.pencil <= 0) player.pencil(); return; }
    const v = idea.rec.vehicle;
    const shoot = idea.rec.attacks.find((a) => ['shoot', 'lob', 'beam', 'explode'].includes(a.type));
    player.cool.use = shoot ? Math.max(0.2, Math.min(1.2, shoot.rate)) : 0.5;
    if (!v.gun && !shoot) { game.E.audio.play('horn', idea.pos, 0.8); game.emit({ k: 'fx', t: 'honk', at: idea.pos.toArray() }); return; }
    const front = new THREE.Vector3(0, idea.model.height * 0.5, idea.model.dims[2] * 0.55 + 0.4).applyQuaternion(idea.quat).add(idea.pos);
    const aim = game.cam.aimPoint(60);
    const dir = aim.sub(front).normalize();
    const a = shoot || { dmg: 8 + idea.rec.power * 1.5, kb: 6, radius: 0, proj: 'sphere', proj_color: '#ffd23f', proj_size: 0.22, type: 'shoot' };
    game.shoot({ owner: player.id, o: front.toArray(), d: dir.toArray(), spd: a.type === 'lob' ? 30 : 48, grav: a.type === 'lob' ? 10 : 1, size: a.proj_size || 0.22, shape: a.proj === 'none' ? 'sphere' : a.proj || 'sphere', color: a.proj_color || '#ffd23f', glow: true, dmg: a.dmg, kb: a.kb, radius: a.type === 'lob' || a.type === 'explode' ? Math.max(2, a.radius || 2.5) : 0, life: 2.5, trail: 'smoke' });
    game.E.audio.play(idea.rec.sound === 'laser' ? 'laser' : 'gunshot', front, 0.6);
  }
}
