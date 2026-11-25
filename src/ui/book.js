// Battle with Ideas: the Idea Book (every idea discovered in the world, signed by its first Thinker, plus your own).

import * as THREE from 'three';
import { buildModel, animateModel } from '../engine/prims.js';
import { sanitizeIdea } from '../shared/recipe.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const KINDS = ['all', 'creature', 'vehicle', 'weapon', 'structure', 'disaster', 'projectile', 'spell', 'trap'];

export function rememberMine(rec) {
  let list = [];
  try { list = JSON.parse(localStorage.getItem('bwi.mine') || '[]'); } catch (e) { list = []; }
  if (list.some((r) => r.key === rec.key)) return;
  list.unshift({ ...rec, t: Date.now() });
  localStorage.setItem('bwi.mine', JSON.stringify(list.slice(0, 300)));
}

export class BookScreen {
  constructor(app) {
    this.app = app;
    this.open = false;
    this.tab = 'world';
    this.kind = 'all';
    this.q = '';
    this.thumbR = null;
  }

  renderer() {
    if (this.thumbR) return this.thumbR;
    const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    r.setSize(200, 200, false);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NeutralToneMapping;
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight('#ffffff', '#b9b4aa', 1.6));
    const d = new THREE.DirectionalLight('#fff8ee', 2.2); d.position.set(3, 5, 4); scene.add(d);
    const cam = new THREE.PerspectiveCamera(32, 1, 0.05, 100);
    this.thumbR = { r, scene, cam };
    return this.thumbR;
  }

  snap(rec, canvas, yaw = 0.6) {
    const { r, scene, cam } = this.renderer();
    const m = buildModel(rec.parts, 2, { noShadow: true });
    scene.add(m.group);
    m.group.rotation.y = yaw;
    animateModel(m, 1.3, 1, 0.016);
    const h = m.height;
    cam.position.set(0, h * 0.55 + 1.2, 4.6);
    cam.lookAt(0, h * 0.45, 0);
    r.render(scene, cam);
    const g = canvas.getContext('2d');
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.drawImage(r.domElement, 0, 0, canvas.width, canvas.height);
    scene.remove(m.group);
  }

  show() {
    this.open = true;
    this.app.E.input.unlock();
    this.el = document.createElement('div');
    this.el.className = 'book';
    this.el.innerHTML = `<div class="head"><h2>Idea Book</h2>
      <button class="btn slim" data-tab="world">The world</button><button class="btn slim" data-tab="mine">My discoveries</button>
      <select class="btn slim" id="b-kind">${KINDS.map((k) => `<option>${k}</option>`).join('')}</select>
      <input class="btn slim" id="b-q" placeholder="search..." style="width:200px">
      <span class="muted" id="b-n"></span><span style="flex:1"></span><button class="btn slim" id="b-close">Close</button></div>
      <div class="grid" id="b-grid"></div>`;
    this.app.root.append(this.el);
    this.el.querySelectorAll('[data-tab]').forEach((b) => b.onclick = () => { this.tab = b.dataset.tab; this.load(); });
    this.el.querySelector('#b-kind').onchange = (e) => { this.kind = e.target.value; this.load(); };
    let t;
    this.el.querySelector('#b-q').oninput = (e) => { clearTimeout(t); t = setTimeout(() => { this.q = e.target.value.trim(); this.load(); }, 250); };
    this.el.querySelector('#b-close').onclick = () => this.close();
    this.load();
  }

  async load() {
    const grid = this.el.querySelector('#b-grid');
    this.el.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('sel', b.dataset.tab === this.tab));
    grid.innerHTML = '<div class="muted">Flipping pages...</div>';
    let items;
    if (this.tab === 'mine') {
      let list = [];
      try { list = JSON.parse(localStorage.getItem('bwi.mine') || '[]'); } catch (e) { list = []; }
      items = list.map((rec) => ({ key: rec.key, name: rec.name, en: rec.en, blurb: rec.blurb, kind: rec.kind, by: 'you', rec }));
    } else {
      const res = await this.app.api.book({ q: this.q, kind: this.kind === 'all' ? '' : this.kind, limit: 72 });
      items = res.items || [];
    }
    if (this.kind !== 'all') items = items.filter((x) => x.kind === this.kind);
    if (this.q) items = items.filter((x) => (x.name + ' ' + x.en).toLowerCase().includes(this.q.toLowerCase()));
    this.el.querySelector('#b-n').textContent = `${items.length} ideas`;
    if (!items.length) { grid.innerHTML = `<div class="muted">${this.tab === 'mine' ? 'You have not discovered anything new yet. Type something nobody has thought of!' : 'Nothing here yet.'}</div>`; return; }
    grid.innerHTML = '';
    for (const it of items) {
      const c = document.createElement('div');
      c.className = 'card-i';
      c.innerHTML = `<canvas width="200" height="200"></canvas><b>${esc(it.name)}</b><small>${esc(it.kind)}${it.en && it.en !== it.name ? ' · ' + esc(it.en) : ''}</small><small>${esc(it.blurb || '')}</small><small>first thought of by <b>${esc(it.by || 'someone')}</b></small>`;
      grid.append(c);
      const rec = sanitizeIdea(it.rec || it.recipe || {}, it.name);
      requestAnimationFrame(() => { try { this.snap(rec, c.querySelector('canvas')); } catch (e) { /* bad recipe */ } });
      let spin = null;
      c.onmouseenter = () => { let a = 0.6; spin = setInterval(() => { a += 0.12; try { this.snap(rec, c.querySelector('canvas'), a); } catch (e) { clearInterval(spin); } }, 50); };
      c.onmouseleave = () => clearInterval(spin);
    }
  }

  close() {
    this.open = false;
    if (this.el) this.el.remove();
    if (this.thumbR) { this.thumbR.r.dispose(); this.thumbR.r.forceContextLoss(); this.thumbR = null; }
    if (this.app.inMatch() && !this.app.pauseOpen) this.app.lockSoon();
  }
}
