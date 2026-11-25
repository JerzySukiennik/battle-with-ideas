// Battle with Ideas: the in-engine story intro (a world of ideas, the Great Boredom, the last Spark, the Thinkers).

import * as THREE from 'three';

const P = (s, p, d, c, a = 'none', r = [0, 0, 0], m = 'matte') => ({ s, p, d, r, c, m, a });
const MOVE = (type, speed) => ({ type, speed, target: 'random' });
const demo = (o) => ({ v: 1, blurb: '', power: 3, particles: 'none', life: 0, count: 1, hp: 999, attacks: [], vehicle: null, weapon: null, spell: null, sound: 'none', kind: 'creature', ...o });

const DEMOS = [
  demo({ key: 'sky-whale', name: 'Sky Whale', en: 'Sky Whale', size: 7, move: MOVE('fly', 2.5), particles: 'bubbles', parts: [P('sphere', [0, 1, 0], [1.4, 1.1, 2.4], '#4c8dff'), P('sphere', [0, 0.8, 0.2], [1.1, 0.7, 2], '#bfe3ff'), P('cone', [0, 1.1, -1.5], [0.4, 0.9, 0.3], '#4c8dff', 'swing', [90, 0, 0]), P('wedge', [-0.75, 0.8, 0.2], [0.7, 0.12, 0.6], '#3d7dff', 'flap'), P('wedge', [0.75, 0.8, 0.2], [0.7, 0.12, 0.6], '#3d7dff', 'flap'), P('sphere', [-0.45, 1.15, 0.95], [0.16, 0.16, 0.16], '#ffffff'), P('sphere', [0.45, 1.15, 0.95], [0.16, 0.16, 0.16], '#ffffff')] }),
  demo({ key: 'flying-car', name: 'Flying Car', en: 'Flying Car', size: 3.6, move: MOVE('fly', 5), parts: [P('box', [0, 0.7, 0], [1.4, 0.5, 2.4], '#ff9f1c', 'none', [0, 0, 0], 'shiny'), P('box', [0, 1.1, -0.1], [1.2, 0.45, 1.2], '#bfe3ff', 'none', [0, 0, 0], 'glass'), P('cylinder', [-0.8, 0.5, 0.8], [0.4, 0.15, 0.4], '#2b2b30', 'spin_fast', [0, 0, 90]), P('cylinder', [0.8, 0.5, 0.8], [0.4, 0.15, 0.4], '#2b2b30', 'spin_fast', [0, 0, 90]), P('cylinder', [-0.8, 0.5, -0.8], [0.4, 0.15, 0.4], '#2b2b30', 'spin_fast', [0, 0, 90]), P('cylinder', [0.8, 0.5, -0.8], [0.4, 0.15, 0.4], '#2b2b30', 'spin_fast', [0, 0, 90]), P('cone', [0, 0.35, -1.3], [0.4, 0.5, 0.4], '#ffd23f', 'pulse', [-90, 0, 0], 'glow')] }),
  demo({ key: 'giant-rubber-duck', name: 'Giant Rubber Duck', en: 'Giant Rubber Duck', size: 4, move: MOVE('walk', 1.6), parts: [P('sphere', [0, 0.7, 0], [1.6, 1.2, 1.9], '#ffd23f', 'none', [0, 0, 0], 'shiny'), P('sphere', [0, 1.6, 0.45], [0.95, 0.95, 0.95], '#ffd23f', 'bob', [0, 0, 0], 'shiny'), P('wedge', [0, 1.5, 1.05], [0.5, 0.25, 0.45], '#ff9f1c'), P('sphere', [-0.25, 1.8, 0.85], [0.14, 0.14, 0.14], '#25252b'), P('sphere', [0.25, 1.8, 0.85], [0.14, 0.14, 0.14], '#25252b'), P('wedge', [0, 1, -0.95], [0.6, 0.5, 0.5], '#ffd23f', 'wiggle')] }),
  demo({ key: 'candy-castle', name: 'Candy Castle', en: 'Candy Castle', kind: 'structure', size: 8, move: MOVE('none', 0), parts: [P('box', [0, 0.5, 0], [1.6, 1, 1.6], '#f15bb5'), P('cylinder', [-0.8, 0.8, -0.8], [0.45, 1.6, 0.45], '#9b5de5'), P('cylinder', [0.8, 0.8, -0.8], [0.45, 1.6, 0.45], '#9b5de5'), P('cylinder', [-0.8, 0.8, 0.8], [0.45, 1.6, 0.45], '#9b5de5'), P('cylinder', [0.8, 0.8, 0.8], [0.45, 1.6, 0.45], '#9b5de5'), P('cone', [-0.8, 1.85, -0.8], [0.55, 0.5, 0.55], '#ffd23f'), P('cone', [0.8, 1.85, -0.8], [0.55, 0.5, 0.55], '#ffd23f'), P('cone', [-0.8, 1.85, 0.8], [0.55, 0.5, 0.55], '#2ec4b6'), P('cone', [0.8, 1.85, 0.8], [0.55, 0.5, 0.55], '#2ec4b6'), P('box', [0, 0.35, 0.82], [0.5, 0.7, 0.05], '#ffffff')] }),
  demo({ key: 'robot-dino', name: 'Robot Dino', en: 'Robot Dino', size: 3.5, move: MOVE('walk', 2.4), parts: [P('box', [0, 0.9, 0], [0.9, 0.8, 1.5], '#2ec4b6', 'none', [0, 0, 0], 'metal'), P('box', [0, 1.5, 0.85], [0.6, 0.5, 0.8], '#2ec4b6', 'bob', [0, 0, 0], 'metal'), P('sphere', [0.18, 1.6, 1.22], [0.12, 0.12, 0.12], '#ffd23f', 'none', [0, 0, 0], 'glow'), P('cone', [0, 0.9, -1.2], [0.35, 1, 0.35], '#2ec4b6', 'swing', [-80, 0, 0], 'metal'), P('box', [-0.3, 0.3, 0], [0.25, 0.6, 0.3], '#3a3a40', 'swing'), P('box', [0.3, 0.3, 0], [0.25, 0.6, 0.3], '#3a3a40', 'swing')] }),
];

const BLOOM = { v: 1, key: 'world-of-ideas', name: 'World of Ideas', en: 'World of Ideas', blurb: '', ground: ['#b8e986', '#ffd9f2'], pattern: 'grass', surface: 'normal', cliff: '#c58b52', obstacles: '#9b5de5', sky: '#a9dcff', fog: '#d9f1ff', light: '#fff1d0', particles: 'leaves', props: [{ parts: [P('cylinder', [0, 0.5, 0], [0.25, 1, 0.25], '#8a5a3c'), P('sphere', [0, 1.4, 0], [1.3, 1.1, 1.3], '#2ec4b6'), P('sphere', [0.3, 1.8, 0.2], [0.8, 0.7, 0.8], '#9be37a')], size: 3.4, count: 18, collide: false }, { parts: [P('cylinder', [0, 0.35, 0], [0.18, 0.7, 0.18], '#f4f2ec'), P('dome', [0, 0.75, 0], [0.9, 0.5, 0.9], '#ff9f1c'), P('sphere', [0.2, 0.85, 0.3], [0.15, 0.1, 0.15], '#ffffff')], size: 1.2, count: 30, collide: false }], landmark: null };

const SPARK = demo({ key: 'the-last-spark', name: 'The Last Spark', en: 'The Last Spark', kind: 'structure', size: 2.6, move: MOVE('none', 0), particles: 'sparkle', parts: [P('star', [0, 1.6, 0], [1.6, 1.6, 0.4], '#ffd23f', 'spin', [0, 0, 0], 'glow'), P('sphere', [0, 1.6, 0], [0.9, 0.9, 0.9], '#fff3b0', 'pulse', [0, 0, 0], 'glow'), P('cylinder', [0, 0.25, 0], [1.4, 0.5, 1.4], '#d8d3c6')] });

const LINES = [
  [0.5, 'Once, anything you imagined came true.'],
  [7.5, 'Then people got bored. They stopped imagining.'],
  [12.5, 'And the Great Boredom came.'],
  [18, 'It turned everything grey. The world became a blank page.'],
  [24, 'Only one Spark of imagination was left...'],
  [30, '...and a few odd people who still had Wena.'],
  [35.5, 'They are the Thinkers. Type an idea, and it becomes real.'],
];
const END = 46;

export class Story {
  constructor(app, done) {
    this.app = app;
    this.game = app.game;
    this.kind = 'story';
    this.done = done;
    this.t = 0;
    this.li = -1;
    this.ended = false;
  }

  start() {
    const g = this.game;
    g.resetArena(777);
    g.spawnMe(0);
    g.me.puppet.setVisible(false);
    if (g.me.rag) g.me.rag.teleport(new THREE.Vector3(0, 0, 22), Math.PI);
    g.island.paint(BLOOM, new THREE.Vector3(0, 0, 0), 5, 0.05);
    this.ids = [];
    const spots = [[-8, 6], [9, -5], [6, 9], [-12, -9], [-4, -13]];
    DEMOS.forEach((rec, i) => {
      const id = g.ideas.newId('spark');
      this.ids.push(id);
      g.onEvent({ k: 'spawn', id, owner: 'spark', rec, at: [spots[i][0], 0, spots[i][1]], aim: [0, 0, 0], yaw: i, seed: i, uses: 0 }, true);
    });
    this.ui = document.createElement('div');
    this.ui.className = 'story';
    this.ui.innerHTML = '<div class="title">Battle with Ideas</div><div class="line"></div><button class="btn slim skip">Skip</button>';
    this.app.root.append(this.ui);
    this.ui.querySelector('.skip').onclick = () => this.finish();
    this.lineEl = this.ui.querySelector('.line');
    this.titleEl = this.ui.querySelector('.title');
    this.skipKey = (e) => { if (e.code === 'Escape' || e.code === 'Enter' || e.code === 'Space') this.finish(); };
    addEventListener('keydown', this.skipKey);
    const cam = g.cam;
    cam.play({ dur: 1e9, hold: true, fn: (k, c, dt) => this.shot(c, dt) });
    g.E.audio.resume();
  }

  shot(c, dt) {
    const g = this.game, t = this.t;
    const R = g.E.renderer;
    const gray = t < 9.5 ? 0 : t < 13.5 ? (t - 9.5) / 4 : t < 18 ? 1 : Math.max(0, 1 - (t - 18) / 4);
    R.post.uniforms.gray.value = gray;
    const fogK = t < 10 ? 0 : t < 16 ? (t - 10) / 6 : t < 18 ? 1 : Math.max(0, 1 - (t - 18) / 6);
    R.scene.fog.near = THREE.MathUtils.lerp(55, 6, fogK);
    R.scene.fog.far = THREE.MathUtils.lerp(190, 60, fogK);
    for (let i = 0; i < this.ids.length; i++) {
      if (t > 11 + i * 1.1 && this.ids[i]) { const idea = g.ideas.get(this.ids[i]); if (idea) { g.fx.burst(idea.center(new THREE.Vector3()), 'grey', 30, null, 2.5); g.ideas.remove(idea.id, 'cleared'); } this.ids[i] = null; }
    }
    if (t > 16.5 && !this.blanked) { this.blanked = true; g.island.resetLook(); }
    if (t < 8) {
      const a = t * 0.12;
      c.position.set(Math.cos(a) * 30, 14 - t * 0.4, Math.sin(a) * 30);
      c.lookAt(0, 2, 0);
    } else if (t < 18) {
      const k = (t - 8) / 10;
      c.position.set(Math.cos(1 + k * 0.4) * (26 - k * 6), 12, Math.sin(1 + k * 0.4) * (26 - k * 6));
      c.lookAt(0, 1.5, 0);
    } else if (t < 24) {
      const k = (t - 18) / 6;
      c.position.set(0, 40 - k * 10, 0.1 + k * 14);
      c.lookAt(0, 0, 0);
    } else if (t < 31) {
      if (!this.spark) { this.spark = true; g.onEvent({ k: 'spawn', id: g.ideas.newId('spark'), owner: 'spark', rec: SPARK, at: [0, 0, 0], aim: [0, 0, 0], yaw: 0, seed: 1, uses: 0 }, true); R.glow.position.set(0, 2.2, 0); g.E.audio.play('magic', null, 0.9); }
      R.glow.intensity = Math.min(8, (t - 24) * 3);
      const k = (t - 24) / 7;
      c.position.set(Math.sin(k * 1.2) * 6, 2.6 + k, Math.cos(k * 1.2) * 6);
      c.lookAt(0, 1.6, 0);
    } else if (t < 40) {
      const me = g.me;
      if (!this.walking) {
        this.walking = true;
        me.puppet.setVisible(true);
        if (me.rag) me.rag.teleport(new THREE.Vector3(0, 0, 9), Math.PI);
      }
      if (me.rag) { me.rag.move.set(0, 0, -1).multiplyScalar(t < 37 ? 0.6 : 0); me.rag.speed = 3; me.rag.yaw = Math.PI; me.rag.aim.set(0, 0.2, -1); me.rag.arms = t > 37.5 ? 'reach' : 'idle'; }
      const p = me.pos(new THREE.Vector3());
      c.position.lerp(new THREE.Vector3(p.x + 2.2, p.y + 0.9, p.z + 3.2), 0.08);
      c.lookAt(p.x, p.y + 0.4, p.z - 1);
    } else {
      const k = Math.min(1, (t - 40) / 6);
      c.position.lerp(new THREE.Vector3(0, 7 + k * 6, 14 + k * 8), 0.03);
      c.lookAt(0, 1.5, 0);
      this.titleEl.classList.add('on');
    }
  }

  canAct() { return false; }
  invulnerable() { return true; }

  update(dt) {
    if (this.ended) return;
    this.t += dt;
    let li = -1;
    for (let i = 0; i < LINES.length; i++) if (this.t >= LINES[i][0]) li = i;
    if (li !== this.li) {
      this.li = li;
      this.lineEl.classList.remove('on');
      setTimeout(() => { if (li >= 0) { this.lineEl.textContent = LINES[li][1]; this.lineEl.classList.add('on'); } }, 350);
    }
    if (this.t > 39.5) this.lineEl.classList.remove('on');
    const me = this.game.me;
    if (me && me.rag && this.t < 31) { me.rag.move.set(0, 0, 0); }
    if (this.t > END) this.finish();
  }

  hudInfo() { return { title: '', sub: '' }; }

  finish() {
    if (this.ended) return;
    this.ended = true;
    removeEventListener('keydown', this.skipKey);
    this.ui.remove();
    const R = this.game.E.renderer;
    R.post.uniforms.gray.value = 0;
    R.scene.fog.near = 55; R.scene.fog.far = 190;
    R.glow.intensity = 0;
    this.game.me.puppet.setVisible(true);
    this.game.cam.stop();
    this.done();
  }

  stop() {}
}
