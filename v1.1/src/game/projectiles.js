// Battle with Ideas: deterministic projectiles (pencils, bullets, bombs, thrown ideas); only the owner deals damage.

import * as THREE from 'three';
import { GR } from '../engine/physics.js';
import { unitGeo, solidMat, buildModel, animateModel } from '../engine/prims.js';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
const FWD = new THREE.Vector3(0, 0, 1);

function pencilMesh() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.42, 6), solidMat('matte', '#ffd23f'));
  body.rotation.x = Math.PI / 2;
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.12, 6), solidMat('matte', '#e9c9a0'));
  tip.rotation.x = Math.PI / 2; tip.position.z = 0.27;
  const lead = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.045, 6), solidMat('matte', '#2a2a30'));
  lead.rotation.x = Math.PI / 2; lead.position.z = 0.33;
  const eraser = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.07, 10), solidMat('matte', '#ff9ec4'));
  eraser.rotation.x = Math.PI / 2; eraser.position.z = -0.245;
  g.add(body, tip, lead, eraser);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

let PENCIL = null;

export function segSphere(a, b, c, r) {
  _a.subVectors(b, a);
  const L2 = _a.lengthSq();
  let t = L2 > 1e-9 ? _b.subVectors(c, a).dot(_a) / L2 : 0;
  t = Math.max(0, Math.min(1, t));
  _c.copy(a).addScaledVector(_a, t);
  return _c.distanceToSquared(c) <= r * r ? t : -1;
}

export class Projectiles {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.scene = game.E.renderer.scene;
  }

  spawn(p, isOwner) {
    let mesh, model = null;
    if (p.shape === 'pencil') { if (!PENCIL) PENCIL = pencilMesh(); mesh = PENCIL.clone(); mesh.scale.setScalar(p.size / 0.32); }
    else if (p.parts) { model = buildModel(p.parts, p.size, { center: true }); mesh = model.group; }
    else { mesh = new THREE.Mesh(unitGeo(p.shape === 'none' ? 'sphere' : p.shape), solidMat(p.glow ? 'glow' : 'shiny', p.color || '#ffd23f')); mesh.scale.setScalar(p.size); mesh.castShadow = true; }
    mesh.position.set(p.o[0], p.o[1], p.o[2]);
    this.scene.add(mesh);
    const pr = {
      ...p, mesh, model, isOwner,
      pos: new THREE.Vector3(p.o[0], p.o[1], p.o[2]),
      vel: new THREE.Vector3(p.d[0], p.d[1], p.d[2]).normalize().multiplyScalar(p.spd),
      t: 0, life: p.life || 3, hits: new Set(), spin: p.shape !== 'pencil' && !p.parts ? 0 : (p.tumble ? 9 : 0),
      bounces: p.bounce || 0,
    };
    this.list.push(pr);
    return pr;
  }

  update(dt) {
    const game = this.game;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.t += dt;
      const prev = _a.copy(p.pos).clone();
      if (p.boomerang && p.t > p.life * 0.42) {
        const owner = game.entityPos(p.owner);
        if (owner) { const back = owner.clone().sub(p.pos); const d = back.length(); p.vel.lerp(back.normalize().multiplyScalar(p.spd), Math.min(1, dt * 4)); if (d < 1.2 && p.t > p.life * 0.5) { this.kill(i, false); continue; } }
      } else p.vel.y -= (p.grav || 0) * dt;
      if (p.homing) {
        const tg = game.nearestEnemy(p.owner, p.pos, 30);
        if (tg) { const want = tg.pos.clone().sub(p.pos).normalize().multiplyScalar(p.spd); p.vel.lerp(want, Math.min(1, dt * p.homing)); }
      }
      p.pos.addScaledVector(p.vel, dt);
      const seg = p.pos.clone().sub(prev);
      const len = seg.length();
      let ended = false;
      if (len > 1e-5) {
        const h = game.E.physics.ray(prev.x, prev.y, prev.z, seg.x / len, seg.y / len, seg.z / len, len + p.size * 0.3, GR.rayStatic);
        if (h) {
          p.pos.set(h.x, h.y, h.z);
          if (p.bounces > 0) {
            p.bounces--;
            const n = game.E.physics.rayNormal(prev.x, prev.y, prev.z, seg.x / len, seg.y / len, seg.z / len, len + 0.5, GR.rayStatic);
            if (n) { const nv = new THREE.Vector3(n.n.x, n.n.y, n.n.z); p.vel.reflect(nv).multiplyScalar(0.7); p.pos.addScaledVector(nv, 0.05); }
            game.E.audio.play('boing', p.pos, 0.4);
          } else { this.impact(p, null); ended = true; }
        }
      }
      if (!ended) {
        for (const t of game.targetsFor(p.owner)) {
          if (p.hits.has(t.id)) continue;
          if (segSphere(prev, p.pos, t.pos, t.radius + p.size * 0.5) >= 0) {
            p.hits.add(t.id);
            if (p.isOwner && !p.radius) game.dealHit(t.id, { dmg: p.dmg, kb: p.vel.clone().normalize().multiplyScalar(p.kb).add(new THREE.Vector3(0, p.kb * 0.35, 0)).toArray(), fx: p.fx, by: p.owner });
            if (!p.pierce) { this.impact(p, t); ended = true; break; }
          }
        }
      }
      if (ended || p.t > p.life || p.pos.y < -40) { if (!ended && p.radius && p.t > p.life) this.impact(p, null); this.kill(i, false); continue; }
      p.mesh.position.copy(p.pos);
      if (p.vel.lengthSq() > 0.01) p.mesh.quaternion.setFromUnitVectors(FWD, _b.copy(p.vel).normalize());
      if (p.spin) p.mesh.rotateX(p.t * p.spin);
      if (p.model) animateModel(p.model, p.t, 3, dt);
      if (p.trail && Math.random() < 0.7) game.fx.trail(p.pos, p.trail, p.trailColor);
      else if (p.shape === 'pencil' && Math.random() < 0.5) game.fx.trail(p.pos, 'ink');
    }
  }

  impact(p, target) {
    const game = this.game;
    if (p.radius > 0) {
      if (p.isOwner) game.areaHit(p.owner, p.pos, p.radius, { dmg: p.dmg, kb: p.kb, up: p.kb * 0.5, fx: p.fx }, true);
      game.fx.explosion(p.pos, p.radius, p.color);
      game.E.audio.play('explosion', p.pos, Math.min(1, 0.4 + p.radius * 0.12));
    } else {
      game.fx.burst(p.pos, p.shape === 'pencil' ? 'ink' : 'dust', 6);
      if (p.shape === 'pencil') game.E.audio.play('tap', p.pos, 0.35);
      if (p.fx && p.fx.type === 'freeze') game.fx.burst(p.pos, 'snow', 10);
      if (p.fx && p.fx.type === 'burn') game.fx.burst(p.pos, 'fire', 8);
    }
    if (p.onImpact) p.onImpact(p, target);
  }

  kill(i) {
    const p = this.list[i];
    this.scene.remove(p.mesh);
    this.list.splice(i, 1);
  }

  clear() { while (this.list.length) this.kill(this.list.length - 1); }
}
