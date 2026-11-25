// Battle with Ideas: Practice (training dummies) and the Thinkers' Tournament (free-for-all or two teams, last one standing).

import * as THREE from 'three';
import { CFG } from '../config.js';

export const DUMMY = {
  v: 1, key: 'training-dummy', name: 'Training Dummy', en: 'Training Dummy', blurb: 'Stands still and takes it. A true professional.', kind: 'creature', power: 1, size: 1.9,
  parts: [
    { s: 'cylinder', p: [0, 0.06, 0], d: [1.1, 0.12, 1.1], r: [0, 0, 0], c: '#8d8c88', m: 'matte', a: 'none' },
    { s: 'cylinder', p: [0, 0.6, 0], d: [0.14, 1.1, 0.14], r: [0, 0, 0], c: '#b08a5a', m: 'matte', a: 'none' },
    { s: 'capsule', p: [0, 1.25, 0], d: [0.75, 0.95, 0.55], r: [0, 0, 0], c: '#e8dcc4', m: 'matte', a: 'none' },
    { s: 'cylinder', p: [0, 1.4, 0], d: [0.12, 1.3, 0.12], r: [0, 0, 90], c: '#b08a5a', m: 'matte', a: 'none' },
    { s: 'sphere', p: [0, 1.9, 0], d: [0.48, 0.48, 0.48], r: [0, 0, 0], c: '#e8dcc4', m: 'matte', a: 'none' },
    { s: 'torus', p: [0, 1.25, 0.29], d: [0.42, 0.42, 0.06], r: [0, 0, 0], c: '#4c8dff', m: 'shiny', a: 'none' },
    { s: 'sphere', p: [0, 1.25, 0.29], d: [0.12, 0.12, 0.05], r: [0, 0, 0], c: '#ffd23f', m: 'glow', a: 'none' },
  ],
  particles: 'none', move: { type: 'none', speed: 0, target: 'nearest_enemy' }, hp: 150, life: 0, count: 1, attacks: [], vehicle: null, weapon: null, spell: null, sound: 'none',
};

export class Practice {
  constructor(game) {
    this.game = game;
    this.kind = 'practice';
    this.respawn = 0;
    this.dummyT = 0;
  }

  start(seed = (Math.random() * 1e6) | 0) {
    const g = this.game;
    g.resetArena(seed);
    g.spawnMe(0);
    this.placeDummies();
    g.hud.banner('Practice', 'Type anything with Enter. Paint the world with P. The dummies never hit back.');
  }

  placeDummies() {
    const g = this.game;
    const me = g.me.pos(new THREE.Vector3());
    for (let k = 0; k < 5; k++) {
      const a = Math.atan2(-me.z, -me.x) + (k - 2) * 0.42;
      const d = 9 + (k % 2) * 3;
      let p = me.clone().add(new THREE.Vector3(Math.cos(a) * d, 0, Math.sin(a) * d));
      if (!g.island.inside(p.x, p.z, 1.5)) p = g.island.randomPoint(Math.random, 3);
      const yaw = Math.atan2(me.x - p.x, me.z - p.z);
      g.emit({ k: 'spawn', id: g.ideas.newId('dummy'), owner: 'dummy', rec: DUMMY, at: p.toArray(), aim: p.toArray(), yaw, seed: k, uses: 0 });
    }
  }

  canAct() { return true; }
  invulnerable() { return false; }

  onEvent(ev) {
    if (ev.k === 'ko' && ev.id === this.game.myId) { this.respawn = 1.6; this.game.hud.toast('Oops. Back in a second.'); }
  }

  update(dt) {
    const g = this.game;
    if (this.respawn > 0) { this.respawn -= dt; if (this.respawn <= 0) { g.spawnMe((Math.random() * 8) | 0); } }
    this.dummyT -= dt;
    if (this.dummyT <= 0) {
      this.dummyT = 4;
      const n = [...g.ideas.map.values()].filter((i) => i.owner === 'dummy').length;
      if (n < 3) this.placeDummies();
    }
  }

  hudInfo() { return { title: 'Practice', sub: 'Dummies left: ' + [...this.game.ideas.map.values()].filter((i) => i.owner === 'dummy').length }; }
  stop() {}
}

const ROUND_WINS = 3;
const SUDDEN = 95;

export class Battle {
  constructor(game, teams = false) {
    this.game = game;
    this.kind = teams ? 'teams' : 'ffa';
    this.teams = teams;
    this.st = 'wait';
    this.n = 0;
    this.wins = {};
    this.alive = new Set();
    this.t = 0;
    this.endAt = 0;
    this.lastWinner = null;
    this.order = [];
  }

  get net() { return this.game.net; }
  now() { return this.net ? this.net.now() : Date.now(); }

  start() {
    const g = this.game;
    g.resetArena(1);
    g.spawnMe(0);
    this.st = 'solo';
    if (g.isHost) this.hostT = 1.5;
    else g.hud.banner(this.teams ? 'Team Battle' : 'Free for All', 'Waiting for the round to start...');
  }

  syncFor() {
    if (this.st === 'solo' || this.st === 'wait') return [];
    return [{ k: 'round', st: 'sync', real: this.st, n: this.n, seed: this.seed, ids: this.order, alive: [...this.alive], wins: this.wins, t0: this.t0, playStart: this.playStart, endAt: this.endAt }];
  }

  roster() { return [...this.game.players.keys()].sort(); }

  hostNext(first = false) {
    const g = this.game;
    this.n = first ? 1 : this.n + 1;
    const ids = this.roster();
    const seed = (Math.random() * 1e9) | 0;
    const teams = {};
    for (const id of ids) teams[id] = g.players.get(id).team;
    g.emit({ k: 'round', st: 'count', n: this.n, seed, t0: this.now() + 3500, ids, wins: this.wins, teams });
  }

  onEvent(ev, mine) {
    const g = this.game;
    if (ev.k === 'round') {
      this.st = ev.st;
      this.n = ev.n;
      this.wins = ev.wins || {};
      if (ev.st === 'sync') {
        if (this.seed === ev.seed && this.n === ev.n) return;
        this.st = ev.real; this.seed = ev.seed; this.order = ev.ids; this.alive = new Set(ev.alive); this.t0 = ev.t0; this.playStart = ev.playStart; this.endAt = ev.endAt;
        g.resetArena(ev.seed);
        if (ev.alive.includes(g.myId)) g.spawnMe(Math.max(0, ev.ids.indexOf(g.myId)));
        else { g.me.becomeGhost(); g.me.ghostPos.set(0, 8, 12); g.hud.banner(`Round ${ev.n} in progress`, 'You join as a ghost. You play from the next round.'); }
        return;
      }
      if (ev.st === 'count') {
        this.seed = ev.seed;
        g.resetArena(ev.seed);
        this.order = ev.ids;
        this.alive = new Set(ev.ids);
        this.t0 = ev.t0;
        const i = Math.max(0, ev.ids.indexOf(g.myId));
        if (ev.ids.includes(g.myId)) g.spawnMe(i); else { g.me.becomeGhost(); g.me.ghostPos.set(0, 8, 12); }
        g.hud.banner(`Round ${ev.n}`, this.teams ? 'Knock the other team off the island!' : 'Last Thinker standing wins!');
        g.E.audio.play('bell', null, 0.7);
      }
      if (ev.st === 'end') {
        this.endAt = this.now() + 4200;
        const w = ev.winner;
        const name = w == null ? 'Nobody' : this.teams ? CFG.teamNames[w] + ' team' : (g.players.get(w) ? g.players.get(w).name : 'Someone');
        g.hud.banner(w == null ? 'Draw!' : `${name} wins round ${ev.n}`, this.scoreLine());
        g.fx.burst(g.cam.cam.position.clone().add(g.cam.forward(new THREE.Vector3()).multiplyScalar(6)), 'confetti', 60, null, 2);
        g.E.audio.play('fanfare', null, 0.8);
      }
      if (ev.st === 'match') {
        const w = ev.winner;
        const name = this.teams ? CFG.teamNames[w] + ' team' : (g.players.get(w) ? g.players.get(w).name : 'Someone');
        g.hud.banner(`${name} wins the Tournament!`, 'Their imagination rebuilt the world. New match in a few seconds.');
        g.fx.burst(g.cam.cam.position.clone().add(g.cam.forward(new THREE.Vector3()).multiplyScalar(6)), 'confetti', 120, null, 3);
        g.E.audio.play('fanfare', null, 1);
        this.endAt = this.now() + 9000;
        this.matchOver = true;
      }
      return;
    }
    if (ev.k === 'ko' && this.st === 'solo') { return; }
    if (ev.k === 'ko') {
      const p = g.players.get(ev.id);
      const by = ev.by && g.players.get(ev.by);
      g.hud.feed(by && ev.by !== ev.id ? `${by.name} knocked out ${p ? p.name : '?'}` : `${p ? p.name : '?'} fell out of imagination`, by ? by.color : null);
      if (ev.id === g.myId) { g.me.becomeGhost(); g.hud.toast('You are a ghost now. You can still cast tiny ideas (power 3 or less) to bother the living.', 'dim'); }
      this.alive.delete(ev.id);
      if (g.isHost && this.st === 'play') this.checkEnd();
    }
  }

  checkEnd() {
    const g = this.game;
    const alive = [...this.alive].filter((id) => g.players.has(id));
    let winner;
    if (this.teams) {
      const ts = new Set(alive.map((id) => g.players.get(id).team));
      if (ts.size > 1) return;
      winner = ts.size ? [...ts][0] : null;
    } else {
      if (alive.length > 1) return;
      winner = alive.length ? alive[0] : null;
    }
    if (winner != null) this.wins[winner] = (this.wins[winner] || 0) + 1;
    const champion = winner != null && this.wins[winner] >= ROUND_WINS;
    g.emit({ k: 'round', st: champion ? 'match' : 'end', n: this.n, winner, wins: this.wins });
  }

  scoreLine() {
    const g = this.game;
    if (this.teams) return CFG.teamNames.map((n, i) => `${n} ${this.wins[i] || 0}`).join('  ·  ') + `  (first to ${ROUND_WINS})`;
    return [...g.players.values()].map((p) => `${p.name} ${this.wins[p.id] || 0}`).join('  ·  ') + `  (first to ${ROUND_WINS})`;
  }

  canAct(me) { return this.st === 'play' || this.st === 'solo' || me.ghost; }
  invulnerable() { return this.st !== 'play' && this.st !== 'solo'; }

  update(dt) {
    const g = this.game;
    const now = this.now();
    if (this.st === 'solo') {
      if (g.isHost) {
        this.hostT -= dt;
        if (this.hostT <= 0) { this.hostT = 1; if (this.roster().length >= 2) this.hostNext(true); }
      }
      if (g.me && !g.me.alive && !this.respawnT) this.respawnT = 1.5;
      if (this.respawnT > 0) { this.respawnT -= dt; if (this.respawnT <= 0) { this.respawnT = 0; g.spawnMe((Math.random() * 8) | 0); } }
      return;
    }
    if (this.st === 'count' && now >= this.t0) {
      this.st = 'play';
      this.playStart = now;
      g.hud.banner('GO!', '', 900);
    }
    if (this.st === 'play') {
      const el = (now - this.playStart) / 1000;
      if (el > SUDDEN) {
        const k = Math.min(1, (el - SUDDEN) / 60);
        g.island.setZone(THREE.MathUtils.lerp(g.island.shape.R + 2, 5, k));
        if (!this.warned) { this.warned = true; g.hud.banner('The Boredom closes in', 'Grey fog is eating the island. Stay inside!', 2500); }
      }
      if (g.isHost) {
        for (const id of [...this.alive]) if (!g.players.has(id)) { this.alive.delete(id); this.checkEnd(); }
      }
    }
    if ((this.st === 'end' || this.st === 'match') && g.isHost && now > this.endAt) {
      if (this.st === 'match') { this.wins = {}; this.matchOver = false; this.warned = false; this.hostNext(true); }
      else { this.warned = false; this.hostNext(); }
    }
  }

  hudInfo() {
    const g = this.game;
    if (this.st === 'solo') return { title: this.teams ? 'Team Battle' : 'Free for All', sub: 'Waiting for at least 2 Thinkers. Warm up!' };
    const alive = [...this.alive].filter((id) => g.players.has(id)).length;
    let sub = this.st === 'play' ? `${alive} standing` : this.st === 'count' ? 'Get ready' : '';
    if (this.st === 'play' && this.playStart) {
      const el = (this.now() - this.playStart) / 1000;
      const left = Math.max(0, SUDDEN - el);
      if (left > 0) sub += `  ·  fog in ${Math.ceil(left)}s`;
    }
    return { title: `${this.teams ? 'Team Battle' : 'Free for All'} · Round ${this.n}`, sub, score: this.scoreLine() };
  }

  stop() { this.game.island.setZone(99); }
}
