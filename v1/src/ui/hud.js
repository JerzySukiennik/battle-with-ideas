// Battle with Ideas: in-game HUD (idea and paint input with Book suggestions, Wena, health, hotbar, tags, bubbles, feed, banners).

import * as THREE from 'three';
import { ideaCost, PAINT_COST, normText } from '../shared/recipe.js';

const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const _v = new THREE.Vector3();

const KIND_ICON = { creature: '🦈', vehicle: '🚗', weapon: '🗡️', structure: '🧱', disaster: '🌪️', projectile: '☄️', spell: '✨', trap: '🍌' };

export class HUD {
  constructor(root, game) {
    this.root = root;
    this.game = game;
    root.innerHTML = '';
    root.className = 'hud';
    this.top = el('div', 'h-top');
    this.title = el('div', 'h-title');
    this.sub = el('div', 'h-sub');
    this.score = el('div', 'h-score');
    this.top.append(this.title, this.sub, this.score);
    this.bars = el('div', 'h-bars');
    this.spark = el('div', 'h-spark', '<span>The Last Spark</span><i></i>');
    this.boss = el('div', 'h-boss', '<span></span><i></i>');
    this.bars.append(this.spark, this.boss);
    this.nudaLine = el('div', 'h-nuda');
    this.feedBox = el('div', 'h-feed');
    this.roster = el('div', 'h-roster');
    this.cross = el('div', 'h-cross');
    this.banner_ = el('div', 'h-banner', '<b></b><span></span>');
    this.toasts = el('div', 'h-toasts');
    this.disc = el('div', 'h-disc');
    this.tags = el('div', 'h-tags');
    this.hurtV = el('div', 'h-hurt');
    this.bottom = el('div', 'h-bottom');
    this.hp = el('div', 'h-hp', '<label>Health</label><div class="bar"><i></i><s></s></div><em></em>');
    this.status = el('div', 'h-status');
    this.held = el('div', 'h-held');
    this.wena = el('div', 'h-wena', '<label>Wena</label><div class="bar"><i></i><u></u></div><em></em>');
    this.box = el('div', 'h-input');
    this.box.innerHTML = '<div class="h-mode"></div><input type="text" maxlength="90" spellcheck="false" autocomplete="off"><div class="h-cost"></div><div class="h-sugg"></div>';
    this.input = this.box.querySelector('input');
    this.modeTag = this.box.querySelector('.h-mode');
    this.costTag = this.box.querySelector('.h-cost');
    this.sugg = this.box.querySelector('.h-sugg');
    this.hint = el('div', 'h-hint', 'Press <kbd>Enter</kbd> and type any idea · <kbd>P</kbd> paint the world');
    this.hot = el('div', 'h-hot');
    this.center = el('div', 'h-center');
    this.center.append(this.wena, this.box, this.hint, this.hot);
    this.left = el('div', 'h-left');
    this.left.append(this.hp, this.status, this.held);
    this.bottom.append(this.left, this.center);
    this.help = el('div', 'h-help', `<b>Controls</b><span><kbd>WASD</kbd> run · <kbd>Shift</kbd> sprint · <kbd>Space</kbd> jump</span><span><kbd>Click</kbd> pencil or weapon · <kbd>Right click</kbd> shove</span><span><kbd>E</kbd> grab, throw, ride · <kbd>F</kbd> drop weapon</span><span><kbd>Enter</kbd> idea · <kbd>P</kbd> paint world · <kbd>1-5</kbd> recent</span><span><kbd>H</kbd> hide help · <kbd>Esc</kbd> menu</span>`);
    root.append(this.hurtV, this.tags, this.top, this.bars, this.nudaLine, this.feedBox, this.roster, this.cross, this.banner_, this.disc, this.toasts, this.bottom, this.help);
    this.mode = null;
    this.typingSent = '';
    this.typingT = 0;
    this.tagEls = new Map();
    this.suggIdx = -1;
    this.items = [];
    this.recent = [];
    this.bannerT = 0;
    this.input.addEventListener('input', () => this.onInput());
    this.input.addEventListener('keydown', (e) => this.onInputKey(e));
    if (localStorage.getItem('bwi.help') === '0') this.help.classList.add('off');
    this.setRecent([]);
  }

  open(mode = 'idea') {
    const g = this.game;
    if (this.mode) return;
    this.mode = mode;
    g.E.input.startTyping();
    this.box.classList.add('on', mode);
    this.modeTag.textContent = mode === 'paint' ? 'Paint the whole world' : g.me && g.me.ghost ? 'Ghost idea (power 3 max)' : 'Your idea';
    this.input.placeholder = mode === 'paint' ? 'lava world, candy land, frozen moon...' : 'a shark, flying car, rekin z laserami...';
    this.input.value = '';
    this.costTag.textContent = mode === 'paint' ? `${PAINT_COST} Wena` : '';
    this.sugg.innerHTML = '';
    setTimeout(() => this.input.focus(), 0);
  }

  close(send = false) {
    if (!this.mode) return;
    const text = this.input.value.trim();
    const mode = this.mode;
    this.mode = null;
    this.box.classList.remove('on', 'idea', 'paint');
    this.input.blur();
    this.sugg.innerHTML = '';
    this.game.E.input.stopTyping();
    this.sendTyping('');
    if (send && text) { if (mode === 'paint') this.game.paintWorld(text); else this.game.cast(text); }
  }

  onInput() {
    const v = this.input.value;
    this.sendTyping(v);
    if (this.mode !== 'idea') return;
    const s = this.game.api.suggest(v, 5);
    this.items = s;
    this.suggIdx = -1;
    this.sugg.innerHTML = s.map((it, i) => `<div data-i="${i}">${KIND_ICON[it.kind] || '•'} ${esc(it.name)}${it.en && it.en !== it.name ? ` <small>${esc(it.en)}</small>` : ''}</div>`).join('');
    for (const d of this.sugg.children) d.onmousedown = (e) => { e.preventDefault(); this.input.value = this.items[+d.dataset.i].name; this.close(true); };
    const hit = this.game.api.mem.idea.get(normText(v));
    this.costTag.textContent = hit ? `${ideaCost(hit, this.game.uses.get(hit.key) || 0)} Wena` : v.trim() ? 'new idea?' : '';
  }

  onInputKey(e) {
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); this.close(false); }
    else if (e.key === 'Enter') { e.preventDefault(); if (this.suggIdx >= 0 && this.items[this.suggIdx]) this.input.value = this.items[this.suggIdx].name; this.close(true); }
    else if (e.key === 'ArrowDown' || e.key === 'Tab') { e.preventDefault(); this.moveSugg(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); this.moveSugg(-1); }
  }

  moveSugg(d) {
    if (!this.items.length) return;
    this.suggIdx = (this.suggIdx + d + this.items.length) % this.items.length;
    [...this.sugg.children].forEach((c, i) => c.classList.toggle('sel', i === this.suggIdx));
  }

  sendTyping(text) {
    const now = performance.now();
    if (text === this.typingSent) return;
    if (text && now - this.typingT < 220) return;
    this.typingT = now;
    this.typingSent = text;
    this.game.send({ k: 'typing', text: text.slice(0, 60) });
    if (this.game.me) this.game.me.typing = text;
  }

  setRecent(list) {
    this.recent = list;
    const g = this.game;
    let html = '';
    for (let i = 0; i < 5; i++) {
      const r = list[i];
      html += r ? `<div class="slot" data-i="${i}"><kbd>${i + 1}</kbd><b>${KIND_ICON[r.kind] || '•'}</b><span>${esc(r.name)}</span><em>${ideaCost(r, g.uses.get(r.key) || 0)}</em></div>` : `<div class="slot empty"><kbd>${i + 1}</kbd></div>`;
    }
    this.hot.innerHTML = html;
  }

  recast(i) { const r = this.recent[i]; if (r) this.game.cast(r.name); }

  toast(text, kind = '') {
    const t = el('div', 'toast ' + kind, esc(text));
    this.toasts.prepend(t);
    while (this.toasts.children.length > 3) this.toasts.lastChild.remove();
    setTimeout(() => t.classList.add('out'), 3200);
    setTimeout(() => t.remove(), 3800);
  }

  feed(text, color) {
    const t = el('div', 'item', esc(text));
    if (color) t.style.setProperty('--c', color);
    this.feedBox.prepend(t);
    while (this.feedBox.children.length > 5) this.feedBox.lastChild.remove();
    setTimeout(() => t.classList.add('out'), 6000);
    setTimeout(() => t.remove(), 6600);
  }

  banner(title, sub = '', ms = 2600) {
    this.banner_.querySelector('b').textContent = title;
    this.banner_.querySelector('span').textContent = sub;
    this.banner_.classList.remove('on');
    void this.banner_.offsetWidth;
    this.banner_.classList.add('on');
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => this.banner_.classList.remove('on'), ms);
  }

  nuda(line) {
    this.nudaLine.innerHTML = `<span>THE GREAT BOREDOM</span>${esc(line)}`;
    this.nudaLine.classList.remove('on'); void this.nudaLine.offsetWidth; this.nudaLine.classList.add('on');
    clearTimeout(this.nudaTimer);
    this.nudaTimer = setTimeout(() => this.nudaLine.classList.remove('on'), 6500);
  }

  discovery(rec, what = 'idea') {
    this.disc.innerHTML = `<small>First in the world!</small><b>${esc(rec.name)}</b><span>${what === 'world' ? 'You imagined a brand new world.' : 'Nobody ever thought of this before. It is free and signed with your name in the Book.'}</span>${rec.blurb ? `<em>${esc(rec.blurb)}</em>` : ''}`;
    this.disc.classList.remove('on'); void this.disc.offsetWidth; this.disc.classList.add('on');
    clearTimeout(this.discT);
    this.discT = setTimeout(() => this.disc.classList.remove('on'), 4200);
    this.game.E.audio.play('discover', null, 0.8);
  }

  hurt(a) { this.hurtV.style.opacity = String(Math.min(0.9, a + 0.25)); clearTimeout(this.hurtT); this.hurtT = setTimeout(() => { this.hurtV.style.opacity = '0'; }, 160); }
  shakeWena() { this.wena.classList.remove('shake'); void this.wena.offsetWidth; this.wena.classList.add('shake'); }
  toggleHelp() { this.help.classList.toggle('off'); localStorage.setItem('bwi.help', this.help.classList.contains('off') ? '0' : '1'); }
  removeTag(id) { const t = this.tagEls.get(id); if (t) { t.remove(); this.tagEls.delete(id); } }

  update(dt) {
    const g = this.game, me = g.me;
    if (!me) return;
    const info = g.mode ? g.mode.hudInfo() : { title: '', sub: '' };
    if (this.title.textContent !== info.title) this.title.textContent = info.title;
    if (this.sub.textContent !== (info.sub || '')) this.sub.textContent = info.sub || '';
    if (this.score.textContent !== (info.score || '')) this.score.textContent = info.score || '';
    this.spark.classList.toggle('on', info.spark != null);
    if (info.spark != null) this.spark.querySelector('i').style.width = `${Math.max(0, info.spark) * 100}%`;
    this.boss.classList.toggle('on', !!info.boss);
    if (info.boss) { this.boss.querySelector('span').textContent = info.boss.name; this.boss.querySelector('i').style.width = `${Math.max(0, info.boss.hp) * 100}%`; }
    const hpk = Math.max(0, me.hp / me.maxHp);
    this.hp.querySelector('i').style.width = `${hpk * 100}%`;
    this.hp.querySelector('s').style.width = `${Math.min(1, me.shield / 100) * 100}%`;
    this.hp.querySelector('em').textContent = me.ghost ? 'ghost' : Math.ceil(Math.max(0, me.hp));
    this.hp.classList.toggle('low', hpk < 0.3 && !me.ghost);
    const w = me.ghost ? g.ghostWena / 40 : me.wena / 100;
    this.wena.querySelector('i').style.width = `${w * 100}%`;
    this.wena.querySelector('em').textContent = me.ghost ? `${Math.floor(g.ghostWena)} ghost` : Math.floor(me.wena);
    this.wena.classList.toggle('ghost', me.ghost);
    const want = this.mode === 'paint' ? PAINT_COST : 0;
    this.wena.querySelector('u').style.left = `${Math.min(100, want)}%`;
    this.wena.querySelector('u').style.opacity = want ? '1' : '0';
    const sts = Object.keys(me.status).filter((k) => !['scale'].includes(k) || me.status.scale.amt !== 1);
    const stHtml = sts.map((k) => `<span>${k === 'scale' ? (me.status.scale.amt < 1 ? 'tiny' : 'giant') : k} ${Math.ceil(me.status[k].t)}s</span>`).join('');
    if (this.status.innerHTML !== stHtml) this.status.innerHTML = stHtml;
    const heldHtml = me.held ? `<b>${esc(me.held.rec.name)}</b> in hand <kbd>F</kbd> drop` : me.vehicle ? `<b>${esc(me.vehicle.rec.name)}</b> <kbd>E</kbd> get out` : '';
    if (this.held.innerHTML !== heldHtml) this.held.innerHTML = heldHtml;
    this.cross.classList.toggle('off', !!this.mode || !g.E.input.locked);
    this.hint.classList.toggle('off', !!this.mode);
    this.updateTags();
    this.updateRoster();
  }

  updateTags() {
    const g = this.game, cam = g.E.renderer.camera;
    const W = innerWidth, H = innerHeight;
    const seen = new Set();
    for (const p of g.players.values()) {
      if (p === g.me) continue;
      if (p.remote && !p.hasPose) continue;
      seen.add(p.id);
      let t = this.tagEls.get(p.id);
      if (!t) { t = el('div', 'tag', '<div class="bub"></div><b></b><i><u></u></i>'); this.tags.append(t); this.tagEls.set(p.id, t); }
      const head = p.puppet.meshes.head.position;
      _v.set(head.x, head.y + 0.75 * (p.scale || 1), head.z).project(cam);
      const vis = _v.z < 1 && _v.z > -1 && !(p.remote && p.invisible);
      t.style.display = vis ? '' : 'none';
      if (!vis) continue;
      t.style.transform = `translate(${(_v.x * 0.5 + 0.5) * W}px, ${(-_v.y * 0.5 + 0.5) * H}px)`;
      const name = p === g.me ? '' : p.name + (p.ghost ? ' 👻' : '');
      const b = t.querySelector('b');
      if (b.textContent !== name) b.textContent = name;
      t.style.setProperty('--c', p.color);
      const bub = t.querySelector('.bub');
      const txt = p.typing || '';
      if (bub.textContent !== txt) { bub.textContent = txt; bub.classList.toggle('on', !!txt); }
      t.querySelector('u').style.width = `${Math.max(0, Math.min(1, (p.hp ?? 100) / 100)) * 100}%`;
      t.querySelector('i').style.display = p === g.me || p.ghost ? 'none' : '';
    }
    for (const [id, t] of this.tagEls) if (!seen.has(id)) { t.remove(); this.tagEls.delete(id); }
  }

  updateRoster() {
    const g = this.game;
    this.rosterT = (this.rosterT || 0) + 1;
    if (this.rosterT % 15) return;
    const html = [...g.players.values()].map((p) => `<div class="${p.ghost || p.alive === false ? 'out' : ''}" style="--c:${p.color}"><i></i>${esc(p.name)}${p === g.me ? ' (you)' : ''}</div>`).join('');
    if (this.roster.innerHTML !== html) this.roster.innerHTML = html;
  }
}
