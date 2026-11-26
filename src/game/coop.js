// Battle with Ideas: co-op story mode, ten waves of the Great Boredom against the last Spark, with bosses and a finale.

import * as THREE from 'three';

const G1 = '#8d8c88', G2 = '#a7a6a1', G3 = '#6f6e6a', G4 = '#c2c1bb', INK = '#2b2b30';
const P = (s, p, d, c, a = 'none', r = [0, 0, 0], m = 'matte') => ({ s, p, d, r, c, m, a });
const ATK = (type, dmg, radius, range, rate, kb, extra = {}) => ({ type, dmg, radius, range, rate, kb, proj: 'none', proj_color: G3, proj_size: 0.3, spawn: '', ...extra });
const MOVE = (type, speed) => ({ type, speed, target: 'nearest_enemy' });
const unit = (o) => ({ v: 1, blurb: '', power: 3, particles: 'none', life: 0, count: 1, vehicle: null, weapon: null, spell: null, sound: 'none', goal: 'spark', kind: 'creature', ...o });

export const NUDA = {
  yawnling: unit({
    key: 'yawnling', name: 'Yawnling', en: 'Yawnling', size: 1.3, hp: 34, move: MOVE('walk', 3.1), sound: 'yawn',
    attacks: [ATK('bite', 9, 0, 1.6, 1.3, 6)],
    parts: [P('sphere', [0, 0.85, 0], [1.6, 1.5, 1.4], G2, 'wiggle'), P('dome', [0, 0.1, 0], [1.4, 0.3, 1.2], G1), P('box', [-0.35, 1.15, 0.66], [0.38, 0.06, 0.05], INK), P('box', [0.35, 1.15, 0.66], [0.38, 0.06, 0.05], INK), P('sphere', [0, 0.65, 0.62], [0.55, 0.45, 0.2], G3, 'pulse'), P('capsule', [-0.45, 0.15, 0.2], [0.3, 0.4, 0.3], G1, 'swing'), P('capsule', [0.45, 0.15, 0.2], [0.3, 0.4, 0.3], G1, 'swing')],
  }),
  paperwork: unit({
    key: 'paperwork', name: 'Paperwork', en: 'Paperwork', size: 0.9, hp: 12, move: MOVE('fly', 5.6), count: 3, sound: 'paper', power: 2,
    attacks: [ATK('sticky', 5, 0, 1.4, 1.2, 2)],
    parts: [P('box', [0, 1, 0], [1.4, 0.04, 1.9], '#e4e2dc', 'flap'), P('box', [0, 1.03, 0.4], [1, 0.02, 0.06], G1), P('box', [0, 1.03, 0.1], [1, 0.02, 0.06], G1), P('box', [0, 1.03, -0.2], [0.7, 0.02, 0.06], G1), P('cylinder', [0.45, 1.04, -0.65], [0.3, 0.03, 0.3], G3)],
  }),
  stamp: unit({
    key: 'rubber-stamp', name: 'Rubber Stamp', en: 'Rubber Stamp', size: 1.6, hp: 55, move: MOVE('hop', 4.2), sound: 'stamp', power: 4,
    attacks: [ATK('slam', 13, 2.6, 3, 2.2, 10), ATK('stun', 0, 0, 1.8, 3.5, 3)],
    parts: [P('box', [0, 0.25, 0], [1.6, 0.5, 1.6], G3), P('box', [0, 0.6, 0], [1.2, 0.25, 1.2], G1), P('cylinder', [0, 1.2, 0], [0.4, 1, 0.4], G2), P('sphere', [0, 1.85, 0], [0.8, 0.6, 0.8], G1)],
  }),
  brute: unit({
    key: 'concrete-brute', name: 'Concrete Brute', en: 'Concrete Brute', size: 2.8, hp: 170, move: MOVE('walk', 2.1), sound: 'rumble', power: 6,
    attacks: [ATK('slam', 20, 3.2, 3.6, 2.6, 13)],
    parts: [P('box', [0, 1.1, 0], [1.5, 1.3, 1], G2), P('box', [0, 1.95, 0], [0.9, 0.5, 0.8], G1), P('box', [-0.6, 2.0, 0.42], [0.25, 0.06, 0.04], INK), P('box', [0.1, 2.0, 0.42], [0.25, 0.06, 0.04], INK), P('box', [-1.05, 1.1, 0], [0.55, 1.2, 0.6], G1, 'swing'), P('box', [1.05, 1.1, 0], [0.55, 1.2, 0.6], G1, 'swing'), P('box', [-0.4, 0.25, 0], [0.55, 0.5, 0.6], G3, 'swing'), P('box', [0.4, 0.25, 0], [0.55, 0.5, 0.6], G3, 'swing')],
  }),
};

export const BOSSES = {
  3: unit({
    key: 'monday', name: 'MONDAY', en: 'Monday', size: 5, hp: 900, move: MOVE('walk', 1.9), sound: 'bell', power: 8, boss: true, goal: 'spark', aggro: 14,
    attacks: [ATK('shockwave', 14, 7, 9, 3.6, 14), ATK('spawn', 0, 0, 30, 6, 0, { spawn: 'yawnling' })],
    parts: [P('cylinder', [0, 1.2, 0], [2, 2, 0.8], G2, 'none', [90, 0, 0]), P('cylinder', [0, 1.2, 0.42], [1.7, 1.7, 0.05], '#e4e2dc', 'none', [90, 0, 0]), P('box', [0, 1.45, 0.47], [0.1, 0.55, 0.04], INK, 'spin'), P('box', [0.2, 1.2, 0.47], [0.45, 0.08, 0.04], INK), P('dome', [-0.65, 2.25, 0], [0.75, 0.45, 0.75], G1, 'wiggle', [0, 0, 25]), P('dome', [0.65, 2.25, 0], [0.75, 0.45, 0.75], G1, 'wiggle', [0, 0, -25]), P('cylinder', [-0.6, 0.12, 0], [0.25, 0.3, 0.25], G3, 'swing'), P('cylinder', [0.6, 0.12, 0], [0.25, 0.3, 0.25], G3, 'swing')],
  }),
  6: unit({
    key: 'pop-quiz', name: 'THE POP QUIZ', en: 'The Pop Quiz', size: 6, hp: 1200, move: MOVE('fly', 3.2), sound: 'paper', power: 9, boss: true, goal: 'spark', aggro: 18,
    attacks: [ATK('shoot', 10, 0, 32, 0.8, 6, { proj: 'torus', proj_color: INK, proj_size: 0.5 }), ATK('beam', 6, 0, 22, 4, 4, { proj_color: '#e4e2dc' }), ATK('stun', 0, 0, 22, 5, 0)],
    parts: [P('box', [0, 1.2, 0], [2, 0.08, 2.6], '#e4e2dc', 'flap'), P('box', [0, 1.25, 0.9], [1.4, 0.04, 0.12], INK), P('box', [0, 1.25, 0.5], [1.4, 0.04, 0.1], G1), P('box', [0, 1.25, 0.1], [1.4, 0.04, 0.1], G1), P('box', [0, 1.25, -0.3], [1.4, 0.04, 0.1], G1), P('torus', [0.55, 1.3, -0.8], [0.5, 0.5, 0.08], INK, 'spin', [90, 0, 0]), P('sphere', [-0.5, 1.3, -0.85], [0.18, 0.06, 0.18], INK)],
  }),
  9: unit({
    key: 'endless-queue', name: 'THE ENDLESS QUEUE', en: 'The Endless Queue', size: 9, hp: 1600, move: MOVE('slither', 3.1), sound: 'rumble', power: 9, boss: true, goal: 'spark', aggro: 16,
    attacks: [ATK('contact', 18, 0, 3, 1, 16), ATK('spawn', 0, 0, 30, 5, 0, { spawn: 'paperwork' })],
    parts: [0, 1, 2, 3, 4, 5].map((i) => P('capsule', [0, 0.6, 0.9 - i * 0.36], [0.32, 1.1, 0.32], i % 2 ? G1 : G2, 'bob')).concat([P('box', [0, 1.35, 0.95], [0.5, 0.35, 0.3], G3), P('sphere', [0, 1.62, 0.95], [0.18, 0.18, 0.18], '#e4e2dc', 'pulse')]),
  }),
  10: unit({
    key: 'great-boredom', name: 'THE GREAT BOREDOM', en: 'The Great Boredom', size: 13, hp: 3200, move: MOVE('fly', 1.6), sound: 'wind', power: 10, boss: true, goal: 'spark', aggro: 22, particles: 'smoke',
    attacks: [ATK('lightning', 16, 2.4, 40, 2.2, 10), ATK('shockwave', 16, 9, 12, 5, 16), ATK('suck', 2, 12, 12, 0.35, 7), ATK('spawn', 0, 0, 40, 7, 0, { spawn: 'concrete-brute' })],
    parts: [P('sphere', [0, 1, 0], [2, 1.7, 1.6], G2, 'pulse'), P('sphere', [-0.8, 0.9, -0.2], [1.2, 1.2, 1.2], G1, 'wiggle'), P('sphere', [0.85, 0.95, -0.2], [1.2, 1.1, 1.2], G1, 'wiggle'), P('box', [-0.4, 1.25, 0.78], [0.42, 0.06, 0.05], INK), P('box', [0.4, 1.25, 0.78], [0.42, 0.06, 0.05], INK), P('box', [0, 0.75, 0.8], [0.6, 0.05, 0.05], INK), P('sphere', [0, 0.35, -0.1], [1.4, 0.6, 1.2], G3, 'bob')],
  }),
};

const SPARK = {
  v: 1, key: 'the-last-spark', name: 'The Last Spark', en: 'The Last Spark', blurb: 'The last bit of imagination left in the world.', kind: 'structure', power: 1, size: 2.6,
  parts: [P('star', [0, 1.6, 0], [1.6, 1.6, 0.4], '#ffd23f', 'spin', [0, 0, 0], 'glow'), P('sphere', [0, 1.6, 0], [0.9, 0.9, 0.9], '#fff3b0', 'pulse', [0, 0, 0], 'glow'), P('cylinder', [0, 0.25, 0], [1.4, 0.5, 1.4], '#d8d3c6'), P('cylinder', [0, 0.55, 0], [0.9, 0.2, 0.9], '#c9c3b5')],
  particles: 'sparkle', move: { type: 'none', speed: 0, target: 'nearest_enemy' }, hp: 1000, life: 0, count: 1, attacks: [], vehicle: null, weapon: null, spell: null, sound: 'none',
};

const TAUNTS = [
  'Ideas are tiring. Why not just sit down?',
  'Every world ends grey. I just help it along.',
  'You call that imagination?',
  'Fill out form 27B before having another idea.',
  'I have seen screensavers with more energy.',
  'One more wave and you will want a nap.',
  'Colors are a phase. Grey is forever.',
  'Your Spark is flickering. I can hear it.',
  'Fine. FINE. I will come myself.',
];

export const VICTORY = {
  v: 1, key: 'imagination-restored', name: 'Imagination Restored', en: 'Imagination Restored', blurb: '', ground: ['#a8e06a', '#ffd23f'], pattern: 'grass', surface: 'normal', cliff: '#c58b52', obstacles: '#ff9f1c', sky: '#9fd8ff', fog: '#d6f0ff', light: '#fff1d0', particles: 'confetti',
  props: [
    { parts: [P('cylinder', [0, 0.5, 0], [0.25, 1, 0.25], '#8a5a3c'), P('sphere', [0, 1.4, 0], [1.3, 1.1, 1.3], '#2ec4b6'), P('sphere', [0.3, 1.8, 0.2], [0.8, 0.7, 0.8], '#9be37a')], size: 3.2, count: 14, collide: true },
    { parts: [P('cylinder', [0, 0.35, 0], [0.18, 0.7, 0.18], '#f4f2ec'), P('dome', [0, 0.75, 0], [0.9, 0.5, 0.9], '#f15bb5'), P('sphere', [0.2, 0.85, 0.3], [0.15, 0.1, 0.15], '#ffffff')], size: 1.1, count: 30, collide: false },
  ],
  landmark: null,
};

export class Coop {
  constructor(game) {
    this.game = game;
    this.kind = 'coop';
    this.wave = 0;
    this.st = 'intro';
    this.timer = 0;
    this.queue = [];
    this.spawnT = 0;
    this.sparkId = null;
    this.sparkHp = 1;
    this.down = new Set();
    this.bossId = null;
  }

  now() { return this.game.net ? this.game.net.now() : Date.now(); }
  players() { return [...this.game.players.values()]; }
  scale() { return 0.6 + 0.4 * Math.max(1, this.players().length); }

  start() {
    const g = this.game;
    g.resetArena(20261125);
    g.spawnMe(Math.max(0, [...g.players.keys()].sort().indexOf(g.myId)));
    if (g.isHost) {
      setTimeout(() => {
        if (g.mode !== this) return;
        this.sparkId = g.ideas.newId('spark');
        const rec = { ...SPARK, hp: Math.round(SPARK.hp * this.scale()) };
        g.emit({ k: 'spawn', id: this.sparkId, owner: 'spark', rec, at: [0, 0, 0], aim: [0, 0, 0], yaw: 0, seed: 1, uses: 0 });
        g.emit({ k: 'coop', st: 'break', wave: 0, t: this.now() + 6000, line: 'So you found the last Spark. How... cute. Protect it, if you can.' });
      }, g.net ? 1600 : 100);
    }
    g.E.renderer.glow.position.set(0, 2.2, 0);
    g.E.renderer.glow.intensity = 6;
  }

  onEvent(ev) {
    const g = this.game;
    if (ev.k === 'coop') {
      this.st = ev.st;
      this.wave = ev.wave;
      this.until = ev.t;
      if (ev.sync) return;
      if (ev.line) g.hud.nuda(ev.line);
      if (ev.st === 'wave') {
        g.hud.banner(ev.boss ? ev.boss : `Wave ${ev.wave}`, ev.boss ? 'A boss of Boredom approaches!' : 'Defend the Spark!');
        g.E.audio.play(ev.boss ? 'bossHorn' : 'bell', null, 0.8);
        if (g.me.ghost) g.spawnMe((Math.random() * 6) | 0);
      }
      if (ev.st === 'break' && ev.wave > 0) {
        g.hud.banner(`Wave ${ev.wave} cleared`, 'Catch your breath. The Boredom is regrouping.');
        if (g.me.ghost || !g.me.alive) g.spawnMe((Math.random() * 6) | 0);
        g.me.wena = 100;
        g.me.hp = Math.min(g.me.maxHp, g.me.hp + 40);
      }
      if (ev.st === 'lost') {
        g.hud.banner('The world turned grey', 'The Spark went out. Press Enter on the menu to try again.', 6000);
        g.island.resetLook();
        g.E.renderer.post.uniforms.gray.value = 1;
        g.E.renderer.glow.intensity = 0;
      }
      if (ev.st === 'won') {
        g.hud.banner('Imagination restored!', 'Ten waves of Boredom, beaten. The world has its colors back.', 8000);
        g.island.paint(VICTORY, new THREE.Vector3(0, 0, 0), 99, 5);
        g.fx.burst(new THREE.Vector3(0, 4, 0), 'confetti', 160, null, 4);
        g.E.audio.play('fanfare', null, 1);
        g.E.music.play(0);
      }
      return;
    }
    if (ev.k === 'ko') {
      const p = g.players.get(ev.id);
      g.hud.feed(`${p ? p.name : '?'} got bored to sleep`, p ? p.color : null);
      if (ev.id === g.myId) { g.me.becomeGhost(); g.hud.toast('You fell asleep. You come back after this wave. Tiny ghost ideas still help!', 'dim'); }
      this.down.add(ev.id);
    }
    if (ev.k === 'despawn' && ev.id === this.sparkId && g.isHost && this.st !== 'lost') this.lose();
  }

  onCast(me, rec) { this.lastIdea = rec.name; }

  syncFor() { return [{ k: 'coop', st: this.st, wave: this.wave, t: this.until, sync: true }]; }

  waveList(n) {
    const s = this.scale();
    const q = [];
    const add = (k, c) => { for (let i = 0; i < Math.round(c * s); i++) q.push(k); };
    add('yawnling', 3 + n * 1.4);
    if (n >= 2) add('paperwork', 1 + n * 0.5);
    if (n >= 4) add('stamp', n * 0.5);
    if (n >= 5) add('brute', (n - 3) * 0.45);
    for (let i = q.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [q[i], q[j]] = [q[j], q[i]]; }
    return q;
  }

  hostWave(n) {
    const g = this.game;
    this.queue = this.waveList(n);
    this.spawnT = 1;
    const boss = BOSSES[n];
    if (boss) this.queue.unshift('boss:' + n);
    g.emit({ k: 'coop', st: 'wave', wave: n, boss: boss ? boss.name : null });
  }

  spawnUnit(key) {
    const g = this.game;
    let rec;
    if (key.startsWith('boss:')) { const b = BOSSES[+key.slice(5)]; rec = { ...b, hp: Math.round(b.hp * this.scale()) }; }
    else rec = NUDA[key];
    const a = Math.random() * Math.PI * 2;
    const R = g.island.radiusAt(a) - 2.5;
    const at = new THREE.Vector3(Math.cos(a) * R, 0, Math.sin(a) * R);
    const id = g.ideas.newId('nuda');
    if (rec.boss) this.bossId = id;
    g.emit({ k: 'spawn', id, owner: 'nuda', rec, at: at.toArray(), aim: [0, 0, 0], yaw: Math.atan2(-at.x, -at.z), seed: (Math.random() * 1e6) | 0, uses: 0 });
    g.emit({ k: 'fx', t: 'spark', at: at.toArray(), p: 'grey', n: rec.boss ? 50 : 14 });
  }

  lose() {
    this.game.emit({ k: 'coop', st: 'lost', wave: this.wave, line: 'Shhh. Everything is grey now. Isn\'t it peaceful?' });
  }

  canAct(me) { return true; }
  invulnerable() { return this.st === 'lost' || this.st === 'won'; }

  update(dt) {
    const g = this.game;
    const spark = this.sparkId && g.ideas.get(this.sparkId);
    if (!this.sparkId) { for (const i of g.ideas.map.values()) if (i.owner === 'spark') { this.sparkId = i.id; break; } }
    if (spark) this.sparkHp = spark.isOwner ? spark.hp / spark.maxHp : (spark.hpPct ?? 100) / 100;
    g.E.renderer.glow.intensity = spark && spark.alive ? 3 + this.sparkHp * 5 : 0;
    g.E.renderer.post.uniforms.gray.value += ((this.st === 'lost' ? 1 : (1 - this.sparkHp) * 0.55) - g.E.renderer.post.uniforms.gray.value) * Math.min(1, dt);
    if (!g.isHost) return;
    const now = this.now();
    if (this.st === 'break' && now >= this.until) this.hostWave(this.wave + 1);
    if (this.st === 'wave') {
      this.spawnT -= dt;
      if (this.queue.length && this.spawnT <= 0) { this.spawnT = 0.9 + Math.random() * 0.8; this.spawnUnit(this.queue.shift()); }
      const left = [...g.ideas.map.values()].filter((i) => i.owner === 'nuda' && i.alive).length;
      if (!this.queue.length && left === 0) {
        if (this.wave >= 10) g.emit({ k: 'coop', st: 'won', wave: 10, line: 'No... the colors... they are so loud...' });
        else {
          const line = this.lastIdea && Math.random() < 0.5 ? `${this.lastIdea}? That is your big idea? How original.` : TAUNTS[(this.wave - 1) % TAUNTS.length];
          g.emit({ k: 'coop', st: 'break', wave: this.wave, t: now + 9000, line });
        }
      }
      const living = this.players().filter((p) => p.alive && !p.ghost).length;
      if (living === 0 && this.players().length) this.lose();
    }
  }

  hudInfo() {
    const left = [...this.game.ideas.map.values()].filter((i) => i.owner === 'nuda' && i.alive).length + this.queue.length;
    const boss = this.bossId && this.game.ideas.get(this.bossId);
    let sub = this.st === 'break' ? `Next wave in ${Math.max(0, Math.ceil((this.until - this.now()) / 1000))}s` : this.st === 'wave' ? `Boredom left: ${left}` : '';
    return { title: this.st === 'won' ? 'Victory' : `Wave ${Math.max(1, this.wave)} / 10`, sub, spark: this.sparkHp, boss: boss && boss.alive ? { name: boss.rec.name, hp: boss.isOwner ? boss.hp / boss.maxHp : (boss.hpPct ?? 100) / 100 } : null };
  }

  stop() { this.game.E.renderer.glow.intensity = 0; this.game.E.renderer.post.uniforms.gray.value = 0; }
}
