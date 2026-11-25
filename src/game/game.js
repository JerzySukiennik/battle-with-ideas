// Battle with Ideas: one match in progress (players, ideas, hits, events, casting, painting, network glue).

import * as THREE from 'three';
import { Island } from './world.js';
import { CameraRig } from './camera.js';
import { Ideas } from './ideas.js';
import { Projectiles } from './projectiles.js';
import { Weapons } from './weapons.js';
import { Vehicles } from './vehicles.js';
import { LocalPlayer } from './player.js';
import { RemotePlayer } from './remote.js';
import { ideaCost, PAINT_COST } from '../shared/recipe.js';
import { buildModel, animateModel } from '../engine/prims.js';

const _v = new THREE.Vector3();
const NPC = new Set(['nuda', 'dummy', 'spark']);

export class Game {
  constructor(E, api) {
    this.E = E;
    this.api = api;
    this.fx = E.fx;
    this.island = new Island(E);
    this.cam = new CameraRig(E);
    this.ideas = new Ideas(this);
    this.proj = new Projectiles(this);
    this.weapons = new Weapons(this);
    this.vehicles = new Vehicles(this);
    this.players = new Map();
    this.me = null;
    this.net = null;
    this.mode = null;
    this.hud = null;
    this.uses = new Map();
    this.recent = [];
    this.thinking = new Map();
    this.frameTargets = null;
    this.netAcc = 0;
    this.time = 0;
    this.running = false;
    this.ghostWena = 40;
    this.spellShows = [];
    E.physics.beforeStep.push((dt) => {
      const me = this.me;
      if (me && me.rag && !me.vehicle && !me.flight) me.rag.step(dt);
    });
  }

  get isHost() { return !this.net || this.net.isHost; }
  get myId() { return this.me ? this.me.id : 'me'; }

  addLocal(info) {
    this.me = new LocalPlayer(this, info);
    this.players.set(info.id, this.me);
    return this.me;
  }

  addRemote(info) {
    if (this.players.has(info.id)) { const p = this.players.get(info.id); Object.assign(p, { name: info.name, team: info.team ?? p.team }); if (info.color) { p.color = info.color; p.puppet.setColor(info.color); } return p; }
    const p = new RemotePlayer(this, info);
    this.players.set(info.id, p);
    return p;
  }

  setMyId(id) {
    const me = this.me;
    if (!me || me.id === id) return;
    this.players.delete(me.id);
    me.id = id;
    this.players.set(id, me);
  }

  onPeerJoined(peerId) {
    const net = this.net, me = this.me;
    if (!net || !me) return;
    const to = (ev) => { ev.from = this.myId; net.sendTo(peerId, ev); };
    if (this.isHost && this.mode && this.mode.syncFor) for (const ev of this.mode.syncFor(peerId)) to(ev);
    if (this.isHost && this.island.recipe) to({ k: 'paint', by: 'sync', rec: this.island.recipe, origin: [0, 0, 0], seed: this.island.paintSeed || 1 });
    for (const i of this.ideas.map.values()) {
      if (!i.isOwner || !i.alive) continue;
      if (i.owner !== me.id && !(this.isHost && NPC.has(i.owner))) continue;
      to({ k: 'spawn', id: i.id, owner: i.owner, rec: { ...i.rec, count: 1 }, at: [i.pos.x, i.burrowed ? i.pos.y : i.pos.y, i.pos.z], aim: i.aim.toArray(), yaw: 2 * Math.atan2(i.quat.y, i.quat.w), seed: 1, uses: i.uses, sync: true });
    }
    if (me.held) to({ k: 'equip', id: me.id, rec: me.held.rec });
    if (me.vehicle) to({ k: 'ride', id: me.id, v: me.vehicle.id, seat: me.seat || 0 });
    const head = me.puppet.headModel ? this.headRec : null;
    if (head) to({ k: 'head', rec: head });
  }

  adoptNPC() {
    for (const i of this.ideas.map.values()) {
      if (!NPC.has(i.owner) || i.isOwner || !i.alive) continue;
      if (i.body) this.E.physics.removeBody(i.body);
      i.body = null; i.proxy = false; i.isOwner = true;
      if (i.kind !== 'structure') i.buildBody();
      if (i.hpPct != null) i.hp = i.maxHp * i.hpPct / 100;
    }
    this.hud && this.hud.toast('You are the host now.', 'dim');
  }

  deliverMode(ev, mine) {
    if (this.mode && this.mode.onEvent && this.mode.kind !== 'menu' && this.mode.kind !== 'story') this.mode.onEvent(ev, mine);
    else if (ev.k === 'round' || ev.k === 'coop') { this.pendingMode = this.pendingMode || []; this.pendingMode.push(ev); }
  }

  flushMode() {
    const list = this.pendingMode || [];
    this.pendingMode = [];
    for (const ev of list) this.deliverMode(ev, false);
  }

  removePlayer(id) {
    const p = this.players.get(id);
    if (!p || p === this.me) return;
    p.destroy();
    this.players.delete(id);
    this.hud && this.hud.removeTag(id);
    this.ideas.clear((i) => i.owner === id && !i.isOwner);
  }

  teamOf(id) {
    if (NPC.has(id)) return id;
    const p = this.players.get(id);
    return p ? p.team : -1;
  }

  faction(id) { return NPC.has(id) ? id : 'player'; }

  isEnemy(a, b) {
    if (a === b) return false;
    const fa = this.faction(a), fb = this.faction(b);
    if (fa === 'nuda' || fb === 'nuda') return fa !== fb;
    if (fa === 'dummy' || fb === 'dummy') return fa !== fb && (fa === 'player' || fb === 'player');
    if (fa === 'spark' || fb === 'spark') return false;
    const m = this.mode ? this.mode.kind : 'ffa';
    if (m === 'coop' || m === 'practice') return false;
    if (m === 'teams') return this.teamOf(a) !== this.teamOf(b);
    return true;
  }

  sparkTarget() {
    for (const i of this.ideas.map.values()) if (i.owner === 'spark' && i.alive) return { id: i.id, owner: 'spark', kind: 'idea', pos: i.center(new THREE.Vector3()), radius: i.radius, vel: i.vel, ref: i };
    return null;
  }

  entities() {
    if (this.frameTargets) return this.frameTargets;
    const out = [];
    for (const p of this.players.values()) {
      if (!p.alive || p.ghost) continue;
      if (p.remote && !p.hasPose) continue;
      if (p.vehicle && p.vehicle.alive && p.seat === 0) continue;
      out.push({ id: p.id, owner: p.id, kind: 'player', pos: p.pos(new THREE.Vector3()), radius: p.radius || 0.45, vel: p.remote ? p.vel : (p.rag ? p.rag.vel(new THREE.Vector3()) : new THREE.Vector3()), ref: p });
    }
    for (const i of this.ideas.map.values()) {
      if (!i.targetable) continue;
      out.push({ id: i.id, owner: i.owner, kind: 'idea', pos: i.center(new THREE.Vector3()), radius: i.radius, vel: i.vel, ref: i });
    }
    this.frameTargets = out;
    return out;
  }

  targetsFor(owner) {
    const key = '_t_' + owner;
    if (this.frameTargets && this.frameTargets[key]) return this.frameTargets[key];
    const list = this.entities().filter((e) => e.id !== owner && this.isEnemy(owner, e.owner));
    this.frameTargets[key] = list;
    return list;
  }

  everyone() { return this.entities(); }

  nearestEnemy(owner, pos, maxD = 60) {
    let best = null, bd = maxD;
    for (const t of this.targetsFor(owner)) { const d = t.pos.distanceTo(pos); if (d < bd) { bd = d; best = t; } }
    return best;
  }

  entityPos(id) {
    const p = this.players.get(id);
    if (p) return p.pos(new THREE.Vector3());
    const i = this.ideas.get(id);
    return i ? i.center(new THREE.Vector3()) : null;
  }

  forwardOf(id) {
    if (this.me && id === this.me.id) return this.cam.flatForward(new THREE.Vector3());
    const p = this.players.get(id);
    if (p && p.puppet) return new THREE.Vector3(0, 0, 1).applyQuaternion(p.puppet.meshes.chest.quaternion).setY(0).normalize();
    return new THREE.Vector3(0, 0, 1);
  }

  isLocalOwner(owner) { return (this.me && owner === this.me.id) || (NPC.has(owner) && this.isHost); }

  emit(ev) {
    ev.from = this.myId;
    this.onEvent(ev, true);
    if (this.net) this.net.send(ev);
  }

  send(ev) { ev.from = this.myId; if (this.net) this.net.send(ev); }

  onEvent(ev, mine = false) {
    const me = this.me;
    switch (ev.k) {
      case 'spawn': {
        if (this.ideas.get(ev.id) || this.ideas.get(ev.id + '.0')) break;
        const th = this.thinking.get(ev.think);
        if (th) { this.stopThinking(ev.think); }
        const list = this.ideas.spawn(ev, this.isLocalOwner(ev.owner));
        if (ev.ride && me && ev.owner === me.id && list[0]) setTimeout(() => this.vehicles.enter(me, list[0], 0), 250);
        break;
      }
      case 'despawn': { const i = this.ideas.get(ev.id); if (i && !i.isOwner) this.ideas.remove(ev.id, ev.why); this.deliverMode(ev, mine); break; }
      case 'proj': this.proj.spawn(ev, this.isLocalOwner(ev.owner)); break;
      case 'hit': {
        if (me && ev.to === me.id) {
          if (ev.friendly || this.isEnemy(ev.by, me.id) || ev.by === me.id || !ev.by) me.onHit(ev);
        } else {
          const i = this.ideas.get(ev.to);
          if (i && i.isOwner) i.damage(ev);
        }
        break;
      }
      case 'think': this.startThinking(ev); break;
      case 'unthink': this.stopThinking(ev.id); break;
      case 'fx': this.playFx(ev); break;
      case 'equip': { if (mine) break; const p = this.players.get(ev.id); if (p) { if (ev.rec) this.weapons.attach(p, ev.rec); else this.weapons.detach(p); } break; }
      case 'ride': { if (mine) break; const p = this.players.get(ev.id); if (p) { p.vehicleId = ev.v; p.seat = ev.seat || 0; const i = ev.v && this.ideas.get(ev.v); if (i && (ev.seat || 0) === 0) i.driver = ev.id; } break; }
      case 'grab': {
        if (ev.to && me && ev.to === me.id) me.grabbedBy = { by: ev.from, t: 3.2 };
        if (ev.id) { const i = this.ideas.get(ev.id); if (i && i.isOwner) i.grabbedBy = ev.from; }
        break;
      }
      case 'throw': {
        if (ev.to && me && ev.to === me.id) { me.grabbedBy = null; if (me.rag) { me.rag.impulse(new THREE.Vector3(...ev.v)); me.rag.knock(1.6); } me.lastHitBy = { id: ev.from, t: performance.now() }; }
        if (ev.id) { const i = this.ideas.get(ev.id); if (i && i.isOwner) i.throwFrom(ev.from, ev.v); }
        break;
      }
      case 'paint': this.applyPaint(ev); break;
      case 'typing': { const p = this.players.get(ev.from); if (p && !mine) p.typing = ev.text || ''; break; }
      case 'head': { const p = this.players.get(ev.from); if (p && !mine && ev.rec) p.setHead(ev.rec); break; }
      case 'spellshow': this.showSpell(ev); break;
      case 'chat': this.hud && this.hud.feed(ev.text, ev.color); break;
      default: this.deliverMode(ev, mine);
    }
  }

  dealHit(id, h) {
    const me = this.me;
    const ev = { k: 'hit', to: id, dmg: h.dmg || 0, kb: h.kb || null, fx: h.fx || null, by: h.by || null, friendly: !!h.friendly };
    if (me && id === me.id) { me.onHit(ev); return; }
    const i = this.ideas.get(id);
    if (i && i.isOwner) { i.damage(ev); return; }
    this.send(ev);
  }

  areaHit(owner, at, r, o, includeIdeas = true, excludeId = null) {
    for (const t of this.targetsFor(owner)) {
      if (t.id === excludeId) continue;
      if (!includeIdeas && t.kind === 'idea') continue;
      const d = t.pos.distanceTo(at);
      if (d > r + t.radius) continue;
      const fall = 1 - Math.min(1, d / (r + t.radius)) * 0.55;
      const dir = o.kbDir ? o.kbDir.clone() : t.pos.clone().sub(at).setY(0);
      if (dir.lengthSq() < 1e-4) dir.set(Math.random() - 0.5, 0, Math.random() - 0.5);
      dir.normalize();
      const kb = dir.multiplyScalar((o.kb || 0) * fall).add(new THREE.Vector3(0, (o.up ?? (o.kb || 0) * 0.4) * fall, 0));
      this.dealHit(t.id, { dmg: (o.dmg || 0) * fall, kb: kb.toArray(), fx: o.fx || null, by: owner });
    }
  }

  shoot(p) {
    p.k = 'proj';
    p.id = this.ideas.newId(p.owner);
    this.emit(p);
  }

  startThinking(ev) {
    if (this.thinking.has(ev.id)) return;
    const g = new THREE.Group();
    const geo = new THREE.TorusGeometry(0.45, 0.04, 6, 24);
    const mat = new THREE.MeshBasicMaterial({ color: '#25252b' });
    for (let i = 0; i < 3; i++) { const m = new THREE.Mesh(geo, mat); m.rotation.set(i * 1.1, i * 0.7, 0); g.add(m); }
    g.position.set(ev.at[0], ev.at[1] + 1, ev.at[2]);
    this.E.renderer.scene.add(g);
    this.thinking.set(ev.id, { g, t: 0, ttl: 16, text: ev.text });
  }

  stopThinking(id) {
    const t = this.thinking.get(id);
    if (!t) return;
    this.E.renderer.scene.remove(t.g);
    this.thinking.delete(id);
  }

  playFx(ev) {
    const fx = this.fx;
    const at = ev.at ? new THREE.Vector3(...ev.at) : null;
    switch (ev.t) {
      case 'boom': fx.explosion(at, ev.r || 3, ev.c); this.E.audio.play('explosion', at, Math.min(1, 0.5 + (ev.r || 3) * 0.1)); break;
      case 'ring': fx.ring(at, ev.r || 3, ev.c || '#25252b'); fx.burst(at, 'dust', 10, null, 1.5); this.E.audio.play('rumble', at, 0.5); break;
      case 'beam': fx.beam(new THREE.Vector3(...ev.a), new THREE.Vector3(...ev.b), ev.c, ev.w || 0.1); break;
      case 'warn': fx.ring(at, ev.r || 2, '#ffd23f', 0.65); break;
      case 'bolt': { const top = at.clone().add(new THREE.Vector3(0, 30, 0)); fx.beam(top, at, '#e8f2ff', 0.35, 0.25); fx.burst(at, 'electric', 18, null, 2); this.E.renderer.flash('#ffffff', 0.25); this.E.audio.play('thunder', at, 1); break; }
      case 'flame': { if (ev.from === this.myId) break; const a = new THREE.Vector3(...ev.a), d = new THREE.Vector3(...ev.d); for (let i = 0; i < 10; i++) fx.emit('fire', a.x, a.y, a.z, d.x * 11 + (Math.random() - 0.5) * 2, d.y * 11 + (Math.random() - 0.5) * 2, d.z * 11 + (Math.random() - 0.5) * 2); break; }
      case 'honk': this.E.audio.play('horn', at, 0.8); fx.burst(at.clone().add(new THREE.Vector3(0, 2, 0)), 'stars', 5); break;
      case 'spark': fx.burst(at, ev.p || 'sparkle', ev.n || 12); break;
      default: break;
    }
  }

  showSpell(ev) {
    const m = buildModel(ev.parts, 0.9, { center: true, noShadow: true });
    const p = this.players.get(ev.from);
    this.E.renderer.scene.add(m.group);
    this.spellShows.push({ m, p, t: 0 });
    this.fx.burst(p ? p.pos(_v) : new THREE.Vector3(...ev.at), 'sparkle', 26, null, 1.6);
    this.E.audio.play('magic', p ? p.pos(_v) : null, 0.8);
  }

  async cast(text) {
    const me = this.me;
    if (!me || !text.trim()) return;
    const ghost = me.ghost;
    const tid = this.ideas.newId(me.id);
    const aimP = this.cam.aimPoint(70);
    const fromP = me.pos(new THREE.Vector3());
    if (aimP.distanceTo(fromP) > 45) aimP.copy(fromP).add(aimP.sub(fromP).setLength(45));
    this.emit({ k: 'think', id: tid, at: aimP.toArray(), text });
    let res;
    try { res = await this.api.resolve(text, 'idea', me.name); }
    catch (e) { this.emit({ k: 'unthink', id: tid }); this.hud && this.hud.toast(e.message, 'err'); return; }
    if (!this.running) return;
    const rec = res.rec;
    const uses = this.uses.get(rec.key) || 0;
    let cost = res.fresh ? 0 : ideaCost(rec, uses);
    if (ghost) {
      if (rec.power > 3) { this.emit({ k: 'unthink', id: tid }); this.hud.toast(`${rec.name} is too big for a ghost (power ${rec.power}). Ghosts can cast ideas up to power 3.`, 'err'); return; }
      cost = Math.round(cost * 0.6);
      if (this.ghostWena < cost) { this.emit({ k: 'unthink', id: tid }); this.hud.toast('Not enough ghost Wena yet.', 'err'); return; }
      this.ghostWena -= cost;
    } else {
      if (me.wena < cost) { this.emit({ k: 'unthink', id: tid }); this.hud.toast(`Not enough Wena for ${rec.name} (${cost}). Wait a moment.`, 'err'); this.hud.shakeWena(); return; }
      me.wena -= cost;
    }
    this.uses.set(rec.key, uses + 1);
    this.recent = [rec, ...this.recent.filter((r) => r.key !== rec.key)].slice(0, 5);
    this.hud && this.hud.setRecent(this.recent);
    if (res.fresh) { this.hud && this.hud.discovery(rec); this.onDiscover && this.onDiscover(rec); }
    else if (res.source === 'approx') this.hud && this.hud.toast(`Closest idea in the Book: ${rec.name}${res.note ? '. ' + res.note : ''}`);
    else if (uses >= 1) this.hud && this.hud.toast(`${rec.name} again? It is getting boring (${cost} Wena).`, 'dim');
    this.mode && this.mode.onCast && this.mode.onCast(me, rec);
    this.release(rec, tid, aimP, uses + 1);
  }

  release(rec, tid, aimP, uses) {
    const me = this.me;
    const yaw = Math.atan2(this.cam.flatForward(_v).x, _v.z) + Math.PI;
    if (rec.kind === 'weapon') { this.emit({ k: 'unthink', id: tid }); if (me.ghost) return; this.weapons.equip(me, rec); this.E.audio.play(rec.sound, me.pos(_v), 0.7); return; }
    if (rec.kind === 'spell') { this.emit({ k: 'unthink', id: tid }); this.castSpell(rec, aimP); return; }
    if (rec.kind === 'projectile') {
      this.emit({ k: 'unthink', id: tid });
      const hand = me.ghost ? me.pos(new THREE.Vector3()) : me.handPos(new THREE.Vector3());
      const dir = aimP.clone().sub(hand).normalize();
      const a = rec.attacks.find((x) => x.dmg > 0) || { dmg: 8 + rec.power * 3, radius: 0, kb: 6, type: 'contact' };
      const radius = rec.attacks.some((x) => x.type === 'explode') ? Math.max(2, rec.attacks.find((x) => x.type === 'explode').radius || 3) : (a.radius > 0.8 ? a.radius : 0);
      for (let k = 0; k < Math.min(rec.count, 6); k++) {
        const d = dir.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.08 * k, (Math.random() - 0.5) * 0.05 * k, (Math.random() - 0.5) * 0.08 * k)).normalize();
        this.shoot({ owner: me.id, o: hand.toArray(), d: d.toArray(), spd: THREE.MathUtils.clamp(rec.move.speed, 14, 40), grav: rec.move.type === 'projectile' ? 3 : 8, size: Math.min(3, rec.size), parts: rec.parts, color: rec.parts[0].c, dmg: a.dmg, kb: Math.max(5, a.kb), radius, fx: { freeze: { type: 'freeze', dur: 2 }, burn: { type: 'burn', dur: 3, amt: 5 }, launch: { type: 'launch' }, stun: { type: 'stun', dur: 1.2 } }[a.type] || null, life: 4, tumble: true, trail: rec.particles !== 'none' ? rec.particles : null });
      }
      this.E.audio.play(rec.sound !== 'none' ? rec.sound : 'whoosh', hand, 0.7);
      if (me.rag) me.rag.arms = 'throw';
      return;
    }
    let at = aimP.clone();
    if (rec.kind === 'vehicle') {
      const f = this.cam.flatForward(new THREE.Vector3());
      at = me.pos(new THREE.Vector3()).addScaledVector(f, 2.5 + rec.size * 0.5);
      at.y += 1;
      if (me.ghost) { this.emit({ k: 'unthink', id: tid }); this.hud.toast('Ghosts cannot drive.', 'err'); return; }
    }
    if (rec.kind === 'structure' || rec.kind === 'trap') {
      const d = at.distanceTo(me.pos(_v));
      if (d < 1.8 + rec.size * 0.4) at.copy(me.pos(_v)).addScaledVector(this.cam.flatForward(new THREE.Vector3()), 2 + rec.size * 0.5);
    }
    const ev = { k: 'spawn', id: tid, think: tid, owner: me.id, rec, at: at.toArray(), aim: aimP.toArray(), yaw: rec.kind === 'vehicle' ? yaw + Math.PI : yaw, seed: (Math.random() * 1e6) | 0, uses: uses - 1, ride: rec.kind === 'vehicle' };
    this.emit(ev);
  }

  castSpell(rec, aimP) {
    const me = this.me;
    const all = this.entities().filter((e) => e.kind === 'player');
    const enemies = all.filter((e) => this.isEnemy(me.id, e.owner));
    const npc = this.entities().filter((e) => e.kind === 'idea' && this.isEnemy(me.id, e.owner));
    const myPos = me.pos(new THREE.Vector3());
    const nearest = [...enemies, ...npc].sort((a, b) => a.pos.distanceTo(myPos) - b.pos.distanceTo(myPos))[0];
    this.emit({ k: 'spellshow', parts: rec.parts, at: myPos.toArray(), name: rec.name });
    for (const fx of rec.spell.effects) {
      let list;
      if (fx.who === 'self') list = me.ghost ? [] : [{ id: me.id, pos: myPos }];
      else if (fx.who === 'enemies') list = [...enemies, ...npc];
      else if (fx.who === 'all') list = [...all, ...npc];
      else if (fx.who === 'nearest') list = nearest ? [nearest] : [];
      else list = all.filter((e) => !this.isEnemy(me.id, e.owner));
      const dur = fx.dur || 5;
      for (const t of list) {
        let f = { type: fx.type, dur, amt: fx.amt };
        const dir = t.pos.clone().sub(myPos).setY(0);
        const L = dir.length() || 1;
        dir.divideScalar(L);
        if (fx.type === 'swap' && t.id !== me.id) {
          const tp = t.pos.clone(), mp = myPos.clone();
          this.dealHit(t.id, { fx: { type: 'teleport', to: [mp.x, Math.max(0, mp.y - 1), mp.z] }, by: me.id, friendly: true });
          me.applyEffect({ type: 'teleport', to: [tp.x, Math.max(0, tp.y - 1), tp.z] });
          continue;
        }
        if (fx.type === 'teleport') { if (t.id === me.id) me.applyEffect({ type: 'teleport', to: [aimP.x, aimP.y + 0.3, aimP.z] }); continue; }
        if (fx.type === 'magnet') f = { type: 'push', v: [-dir.x * Math.min(18, 6 + Math.abs(fx.amt)), 4, -dir.z * Math.min(18, 6 + Math.abs(fx.amt))] };
        if (fx.type === 'repel') f = { type: 'push', v: [dir.x * Math.min(22, 8 + Math.abs(fx.amt)), 7, dir.z * Math.min(22, 8 + Math.abs(fx.amt))] };
        if (fx.type === 'wind') { const w = this.cam.flatForward(new THREE.Vector3()); f = { type: 'push', v: [w.x * Math.min(20, 8 + Math.abs(fx.amt)), 3, w.z * Math.min(20, 8 + Math.abs(fx.amt))] }; }
        if (fx.type === 'gravity') f = { type: 'gravity', dur, amt: fx.amt };
        if (fx.type === 'freeze' || fx.type === 'slow') f = { type: fx.type, dur: Math.min(dur, fx.type === 'freeze' ? 3 : 6), amt: 0.4 };
        this.dealHit(t.id, { dmg: 0, fx: f, by: me.id, friendly: true });
      }
    }
  }

  async spawnChild(parent, name) {
    try {
      const res = await this.api.resolve(name, 'idea', 'the Book', { free: true, timeout: 9000 });
      const rec = { ...res.rec, count: 1, life: Math.min(res.rec.life || 15, 15), kind: res.rec.kind === 'creature' || res.rec.kind === 'trap' ? res.rec.kind : 'creature' };
      rec.size = Math.min(rec.size, Math.max(0.6, parent.rec.size * 0.5));
      rec.power = Math.min(rec.power, Math.max(1, parent.rec.power - 2));
      if (rec.move.type === 'none') rec.move = { type: 'walk', speed: 4, target: 'nearest_enemy' };
      if (!parent.alive) return null;
      const id = this.ideas.newId(parent.owner);
      const at = parent.center(new THREE.Vector3()).add(new THREE.Vector3((Math.random() - 0.5) * 3, 0, (Math.random() - 0.5) * 3));
      this.emit({ k: 'spawn', id, owner: parent.owner, rec, at: at.toArray(), aim: at.toArray(), yaw: Math.random() * 6.28, seed: (Math.random() * 1e6) | 0, uses: 0 });
      return id;
    } catch (e) { return null; }
  }

  interact(player) {
    if (player.vehicle) { this.vehicles.exit(player); return; }
    if (player.holding) { this.throwHeld(player); return; }
    const p = player.pos(new THREE.Vector3());
    let best = null, bd = 99;
    for (const i of this.ideas.map.values()) {
      if (!i.alive || i.kind !== 'vehicle') continue;
      const mine = i.owner === player.id, mate = !this.isEnemy(i.owner, player.id) && !NPC.has(i.owner);
      if (!mine && !mate) continue;
      const d = i.center(_v).distanceTo(p) - i.radius;
      if (d < 2.4 && d < bd) { bd = d; best = i; }
    }
    if (best) {
      if (best.owner === player.id && !best.driver) { this.vehicles.enter(player, best, 0); return; }
      const riders = [...this.players.values()].filter((q) => q.vehicle === best || q.vehicleId === best.id).length;
      if (riders < best.rec.vehicle.seats) { this.vehicles.enter(player, best, riders); return; }
    }
    const hand = player.handPos(new THREE.Vector3());
    let grab = null, gd = 2.2;
    for (const i of this.ideas.map.values()) {
      if (!i.alive || !['creature', 'trap'].includes(i.kind) || i.rec.size > 2.4 || i.burrowed) continue;
      const d = i.center(_v).distanceTo(hand) - i.radius;
      if (d < gd) { gd = d; grab = { type: 'idea', id: i.id }; }
    }
    for (const q of this.players.values()) {
      if (q === player || !q.remote || !q.alive || !q.floppy) continue;
      const d = q.pos(_v).distanceTo(hand);
      if (d < gd + 0.3) { gd = d; grab = { type: 'player', id: q.id }; }
    }
    if (!grab) return;
    player.holding = grab;
    if (grab.type === 'idea') { const i = this.ideas.get(grab.id); if (i && i.isOwner) i.grabbedBy = player.id; else this.send({ k: 'grab', id: grab.id }); }
    else this.send({ k: 'grab', to: grab.id });
    this.E.audio.play('grab', hand, 0.5);
  }

  throwHeld(player) {
    const h = player.holding;
    player.holding = null;
    if (!h) return;
    const v = this.cam.forward(new THREE.Vector3()).multiplyScalar(19).add(new THREE.Vector3(0, 5, 0)).toArray();
    if (h.type === 'idea') { const i = this.ideas.get(h.id); if (i && i.isOwner) i.throwFrom(player.id, v); else this.send({ k: 'throw', id: h.id, v }); }
    else this.send({ k: 'throw', to: h.id, v });
    if (player.rag) player.rag.arms = 'throw';
    this.E.audio.play('whoosh', player.pos(_v), 0.6);
  }

  async paintWorld(text) {
    const me = this.me;
    if (!me || me.ghost || !me.alive) { this.hud && this.hud.toast('Only living Thinkers can paint the world.', 'err'); return; }
    if (me.wena < PAINT_COST) { this.hud.toast(`Painting the whole island needs ${PAINT_COST} Wena.`, 'err'); this.hud.shakeWena(); return; }
    this.hud && this.hud.toast(`Imagining ${text}...`, 'dim');
    let res;
    try { res = await this.api.resolve(text, 'paint', me.name); }
    catch (e) { this.hud.toast(e.message, 'err'); return; }
    if (!this.running || !me.alive) return;
    if (me.wena < PAINT_COST) { this.hud.toast(`Painting needs ${PAINT_COST} Wena.`, 'err'); return; }
    me.wena -= PAINT_COST;
    if (res.fresh) this.hud.discovery(res.rec, 'world');
    const o = me.pos(new THREE.Vector3());
    this.emit({ k: 'paint', by: me.id, rec: res.rec, origin: o.toArray(), seed: (Math.random() * 1e6) | 0 });
  }

  applyPaint(ev) {
    const o = new THREE.Vector3(...ev.origin);
    const dur = ev.by === 'sync' ? 0.3 : 3.4;
    this.island.paint(ev.rec, o, ev.seed, dur);
    this.island.paintSeed = ev.seed;
    if (ev.by === 'sync') return;
    const painter = this.players.get(ev.by);
    this.hud && this.hud.feed(`${painter ? painter.name : 'Someone'} painted the world: ${ev.rec.name}`, painter ? painter.color : null);
    this.E.audio.play('magic', o, 1);
    if (this.me && ev.by === this.me.id) {
      const R = this.island.shape.R;
      const start = o.clone();
      const ang0 = Math.atan2(o.z, o.x);
      const path = (k) => {
        const a = ang0 + k * Math.PI * 1.6;
        const r = THREE.MathUtils.lerp(Math.hypot(o.x, o.z), R * 0.55, Math.sin(k * Math.PI));
        const p = new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
        if (k > 0.85) p.lerp(start, (k - 0.85) / 0.15);
        p.y = THREE.MathUtils.lerp(o.y, 16, Math.sin(Math.min(1, k * 1.1) * Math.PI)) + 1;
        return p;
      };
      const colors = ev.rec.ground;
      const me = this.me;
      me.startFlight(path, dur, () => this.hud && this.hud.toast(`${ev.rec.name}! The floor is now: ${ev.rec.surface}.`));
      this.cam.play({
        dur, fn: (k, cam) => {
          const p = path(Math.min(1, k + 0.02));
          const back = path(Math.max(0, k - 0.12));
          const camPos = back.clone().add(new THREE.Vector3(0, 6 + Math.sin(k * Math.PI) * 6, 0)).lerp(new THREE.Vector3(0, 34, 0), Math.sin(k * Math.PI) * 0.45);
          cam.position.lerp(camPos, k < 0.05 ? 0.2 : 0.12);
          cam.lookAt(p);
          if (Math.random() < 0.9) this.fx.emit('paint', p.x, p.y - 0.5, p.z, (Math.random() - 0.5) * 2, -3, (Math.random() - 0.5) * 2, undefined, colors[(Math.random() * 2) | 0]);
        },
        done: () => {},
      });
    }
  }

  onLocalKO(killer) {
    const me = this.me;
    this.emit({ k: 'ko', id: me.id, by: killer || null, at: me.pos(new THREE.Vector3()).toArray() });
  }

  onIdeaRemoved(i) { if (this.me && this.me.holding && this.me.holding.id === i.id) this.me.holding = null; if (this.me && this.me.vehicle === i) this.vehicles.exit(this.me, true); }

  resetArena(seed) {
    this.proj.clear();
    this.ideas.clear();
    for (const p of this.players.values()) { this.weapons.detach(p); p.holding = null; if (p.vehicleId) p.vehicleId = null; }
    if (this.me) { this.me.vehicle = null; this.me.flight = null; this.me.painting = 0; }
    this.cam.stop();
    for (const [id] of this.thinking) this.stopThinking(id);
    this.island.build(seed);
    this.island.setZone(99);
    this.uses.clear();
  }

  spawnMe(i = 0) {
    const sp = this.island.spawns[i % this.island.spawns.length];
    const at = new THREE.Vector3(sp.x, 0.02, sp.z);
    this.me.spawn(at, Math.atan2(-sp.x, -sp.z));
    this.cam.yaw = Math.atan2(sp.x, sp.z);
    this.cam.pitch = -0.2;
    this.me.wena = 100;
    this.ghostWena = 40;
  }

  update(dt) {
    this.time += dt;
    this.frameTargets = null;
    const E = this.E, me = this.me, input = E.input;
    if (me) {
      if (!input.typing && input.locked) this.cam.look(input.mouse.dx, input.mouse.dy);
      if (input.mouse.wheel) this.cam.zoom(input.mouse.wheel);
      const canAct = this.mode ? this.mode.canAct(me) : true;
      if (canAct) me.update(dt, input);
      if (me.alive) me.wena = Math.min(100, me.wena + dt * (this.mode && this.mode.kind === 'practice' ? 14 : 6.5));
      if (me.ghost) this.ghostWena = Math.min(40, this.ghostWena + dt * 2.5);
    }
    E.physics.step(dt);
    this.frameTargets = null;
    this.ideas.update(dt);
    this.frameTargets = null;
    this.proj.update(dt);
    for (const p of this.players.values()) if (p.remote) p.update(dt);
    if (this.mode) this.mode.update(dt);
    for (const [id, t] of this.thinking) {
      t.t += dt;
      t.g.rotation.x += dt * 5; t.g.rotation.y += dt * 7;
      t.g.scale.setScalar(0.8 + Math.sin(t.t * 9) * 0.15);
      if (Math.random() < 0.4) this.fx.trail(t.g.position.clone().add(new THREE.Vector3((Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5))), 'ink');
      if (t.t > t.ttl) this.stopThinking(id);
    }
    for (let i = this.spellShows.length - 1; i >= 0; i--) {
      const s = this.spellShows[i];
      s.t += dt;
      const p = s.p ? s.p.pos(_v) : s.m.group.position;
      s.m.group.position.set(p.x, p.y + 1.6 + s.t * 0.8, p.z);
      s.m.group.rotation.y += dt * 4;
      s.m.group.scale.setScalar(Math.min(1, s.t * 4) * (s.t > 1.2 ? Math.max(0.001, 1 - (s.t - 1.2) * 3) : 1));
      animateModel(s.m, s.t, 0, dt);
      if (s.t > 1.55) { this.E.renderer.scene.remove(s.m.group); this.spellShows.splice(i, 1); }
    }
    this.island.update(dt);
    if (me) {
      me.render(dt);
      if (me.held) this.weapons.tick(me, dt);
      const tgt = me.vehicle ? me.vehicle.center(new THREE.Vector3()).add(new THREE.Vector3(0, 1 + me.vehicle.model.height * 0.4, 0)) : me.pos(new THREE.Vector3()).add(new THREE.Vector3(0, 0.55, 0));
      this.cam.update(dt, tgt, me.vehicle ? me.vehicle.radius * 1.6 + 2 : 0);
    }
    E.fx.update(dt);
    if (this.net) {
      this.netAcc += dt;
      if (this.netAcc >= 1 / 20) { this.netAcc = 0; this.net.sendState(this.netState()); }
    }
  }

  netState() {
    const me = this.me;
    const st = me.status;
    const f = (me.ghost ? 1 : 0) | (me.rag && me.rag.strength < 0.4 ? 2 : 0) | (st.invisible ? 4 : 0) | (st.bighead ? 8 : 0) | (st.freeze ? 16 : 0);
    const pose = me.netPose();
    const ideas = this.isHost ? this.ideas.netStatesWhere((i) => i.owner === me.id || NPC.has(i.owner)) : this.ideas.netStates(me.id);
    return { pose: pose ? Array.from(pose, (x) => Math.round(x * 1000) / 1000) : null, hp: Math.max(0, Math.round(me.hp)), f, s: me.scale, ideas };
  }

  onState(from, st, now) {
    const p = this.players.get(from);
    if (p && p.remote) p.applyState(st, now);
    if (st.ideas) this.ideas.applyStates(st.ideas, now);
  }
}
