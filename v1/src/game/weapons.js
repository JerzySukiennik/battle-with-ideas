// Battle with Ideas: held weapons (swing, shoot, beam, launch, throw, boomerang, flame, shield) for any Thinker.

import * as THREE from 'three';
import { buildModel, animateModel } from '../engine/prims.js';
import { GR } from '../engine/physics.js';

export const WEAPON_FX = {
  burn: { type: 'burn', dur: 3, amt: 5 }, freeze: { type: 'freeze', dur: 2 }, stun: { type: 'stun', dur: 1.1 }, launch: { type: 'launch', amt: 4 },
  shrink: { type: 'shrink', dur: 6 }, grow: { type: 'grow', dur: 6 }, poison: { type: 'poison', dur: 4, amt: 4 }, sticky: { type: 'slow', dur: 3 }, slow: { type: 'slow', dur: 3 },
};

export class Weapons {
  constructor(game) { this.game = game; }

  attach(view, rec) {
    this.detach(view);
    const size = THREE.MathUtils.clamp(rec.size, 0.35, 2.2);
    const model = buildModel(rec.parts, size, { center: true });
    const L = Math.max(model.dims[2], model.dims[1], model.dims[0]);
    const holder = new THREE.Group();
    holder.rotation.x = Math.PI / 2;
    holder.position.y = -0.2;
    const inner = model.group;
    if (model.dims[1] > model.dims[2] * 1.3) inner.rotation.x = Math.PI / 2;
    inner.position.z = L * 0.3;
    holder.add(inner);
    view.puppet.meshes.farmR.add(holder);
    view.held = { rec, def: rec.weapon, model, holder, t: 0 };
  }

  detach(view) {
    if (view.held) { view.held.holder.parent && view.held.holder.parent.remove(view.held.holder); view.held = null; }
  }

  equip(player, rec) {
    this.attach(player, rec);
    this.game.emit({ k: 'equip', id: player.id, rec });
    this.game.hud && this.game.hud.toast(`${rec.name} equipped. Click to use, F to drop.`);
  }

  drop(player) {
    this.detach(player);
    this.game.emit({ k: 'equip', id: player.id, rec: null });
  }

  tick(view, dt) {
    if (!view.held) return;
    view.held.t += dt;
    animateModel(view.held.model, view.held.t, 0, dt);
  }

  use(player) {
    const game = this.game, h = player.held, w = h.def;
    player.cool.use = Math.max(0.12, w.rate);
    const cam = game.cam;
    const hand = player.handPos(new THREE.Vector3());
    const aim = cam.aimPoint(Math.max(20, w.range + 10));
    const dir = aim.clone().sub(hand).normalize();
    const fx = WEAPON_FX[w.effect] || null;
    const color = w.proj_color;
    switch (w.type) {
      case 'melee': case 'whip': {
        const range = w.type === 'whip' ? Math.max(3, w.range) : Math.max(1.6, Math.min(w.range, 4)) + h.model.radius;
        const flat = cam.flatForward(new THREE.Vector3());
        const c = player.pos(new THREE.Vector3());
        for (const t of game.targetsFor(player.id)) {
          const to = t.pos.clone().sub(c);
          const d = to.length();
          if (d > range + t.radius) continue;
          to.y = 0; to.normalize();
          if (to.dot(flat) < 0.25 && d > 1.2) continue;
          game.dealHit(t.id, { dmg: w.dmg, kb: flat.clone().multiplyScalar(w.kb).add(new THREE.Vector3(0, w.kb * 0.45 + 1.5, 0)).toArray(), fx, by: player.id });
          game.E.audio.play('sword', t.pos, 0.7);
        }
        if (w.type === 'whip') game.emit({ k: 'fx', t: 'beam', a: hand.toArray(), b: hand.clone().addScaledVector(dir, range).toArray(), c: h.rec.parts[0].c, w: 0.04 });
        game.E.audio.play('whoosh', hand, 0.5);
        if (player.rag) player.rag.impulse(flat.clone().multiplyScalar(1.2), 'chest');
        break;
      }
      case 'gun': case 'wand': {
        game.shoot({ owner: player.id, o: hand.toArray(), d: dir.toArray(), spd: w.type === 'wand' ? 26 : 52, grav: w.type === 'wand' ? 0 : 1, size: w.proj_size, shape: w.proj === 'none' ? 'sphere' : w.proj, color, glow: true, dmg: w.dmg, kb: w.kb, fx, life: Math.max(0.6, w.range / 30), homing: w.type === 'wand' ? 2.5 : 0, trail: w.type === 'wand' ? 'sparkle' : null });
        game.E.audio.play(w.type === 'wand' ? 'magic' : 'gunshot', hand, 0.55);
        cam.fovKick = -1.2;
        if (player.rag) player.rag.impulse(dir.clone().multiplyScalar(-0.6), 'chest');
        break;
      }
      case 'flamethrower': {
        player.cool.use = 0.09;
        const p = hand.clone().addScaledVector(dir, 0.4);
        for (let i = 0; i < 4; i++) game.fx.emit('fire', p.x, p.y, p.z, dir.x * 11 + (Math.random() - 0.5) * 2, dir.y * 11 + (Math.random() - 0.5) * 2, dir.z * 11 + (Math.random() - 0.5) * 2);
        this.flameAcc = (this.flameAcc || 0) + 1;
        if (this.flameAcc % 3 === 0) {
          for (const t of game.targetsFor(player.id)) {
            const to = t.pos.clone().sub(hand); const d = to.length();
            if (d > Math.min(8, w.range + 2) || to.normalize().dot(dir) < 0.82) continue;
            game.dealHit(t.id, { dmg: w.dmg * 0.35, kb: dir.clone().multiplyScalar(2).toArray(), fx: fx || WEAPON_FX.burn, by: player.id });
          }
          game.emit({ k: 'fx', t: 'flame', a: hand.toArray(), d: dir.toArray() });
        }
        game.E.audio.loop('flame:' + player.id, 'sizzle', hand, 0.4);
        clearTimeout(this.flameStop);
        this.flameStop = setTimeout(() => game.E.audio.stopLoop('flame:' + player.id), 200);
        break;
      }
      case 'beam': {
        const c = cam.cam.position, f = cam.forward(new THREE.Vector3());
        let best = null, bestT = Math.max(8, w.range);
        for (const t of game.targetsFor(player.id)) {
          const to = t.pos.clone().sub(c);
          const along = to.dot(f);
          if (along < 0 || along > bestT) continue;
          const perp = to.clone().addScaledVector(f, -along).length();
          if (perp < t.radius + 0.35) { best = t; bestT = along; }
        }
        const wall = game.E.physics.ray(c.x, c.y, c.z, f.x, f.y, f.z, bestT, GR.rayStatic);
        const end = wall ? new THREE.Vector3(wall.x, wall.y, wall.z) : c.clone().addScaledVector(f, bestT);
        if (best && !wall) game.dealHit(best.id, { dmg: w.dmg, kb: f.clone().multiplyScalar(w.kb).toArray(), fx, by: player.id });
        game.emit({ k: 'fx', t: 'beam', a: hand.toArray(), b: end.toArray(), c: color, w: 0.11 });
        game.E.audio.play('laser', hand, 0.6);
        break;
      }
      case 'launcher': {
        const d = dir.clone(); d.y += 0.18;
        game.shoot({ owner: player.id, o: hand.toArray(), d: d.normalize().toArray(), spd: 28, grav: 12, size: Math.max(0.25, w.proj_size), shape: w.proj === 'none' ? 'sphere' : w.proj, color, dmg: w.dmg, kb: Math.max(8, w.kb), radius: 3.2, fx, life: 4, trail: 'smoke' });
        game.E.audio.play('whoosh', hand, 0.7);
        cam.fovKick = -2;
        break;
      }
      case 'throw': case 'boomerang': {
        const d = dir.clone(); if (w.type === 'throw') d.y += 0.12;
        game.shoot({ owner: player.id, o: hand.toArray(), d: d.normalize().toArray(), spd: w.type === 'boomerang' ? 22 : 24, grav: w.type === 'boomerang' ? 0 : 11, size: Math.min(1.4, h.rec.size), parts: h.rec.parts, color: h.rec.parts[0].c, dmg: w.dmg, kb: w.kb, fx, life: w.type === 'boomerang' ? 2.4 : 3, tumble: true, boomerang: w.type === 'boomerang', pierce: w.type === 'boomerang', radius: w.effect === 'launch' ? 2.5 : 0 });
        player.cool.use = Math.max(0.55, w.rate);
        game.E.audio.play('whoosh', hand, 0.6);
        if (player.rag) player.rag.arms = 'throw';
        break;
      }
      case 'shield': {
        player.shieldUp = 0.9;
        player.cool.use = 1.1;
        game.areaHit(player.id, player.pos(new THREE.Vector3()).addScaledVector(cam.flatForward(new THREE.Vector3()), 1), 1.8, { dmg: w.dmg * 0.5, kbDir: cam.flatForward(new THREE.Vector3()), kb: Math.max(10, w.kb), up: 4, fx }, true);
        game.E.audio.play('bonk', hand, 0.6);
        break;
      }
      default: break;
    }
  }
}
