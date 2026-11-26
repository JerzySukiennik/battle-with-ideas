// Battle with Ideas: screens (main menu, head maker, online lobby, room, pause, settings) and the match flow around them.

import * as THREE from 'three';
import { CFG } from '../config.js';
import { Practice, Battle } from '../game/modes.js';
import { Coop } from '../game/coop.js';
import { DEFAULT_HEAD } from '../game/ragdoll.js';
import { BookScreen } from './book.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

class MenuMode {
  constructor(game) { this.game = game; this.kind = 'menu'; this.t = 0; }
  start() {
    const g = this.game;
    g.resetArena(424242);
    g.me.spawn(new THREE.Vector3(0, 0.02, 0), 0);
    g.me.wena = 100;
    g.cam.play({ dur: 1e9, hold: true, fn: (k, cam, dt) => {
      this.t += dt;
      const p = g.me.pos(new THREE.Vector3());
      const a = this.t * 0.07 + 0.6;
      const side = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a)).multiplyScalar(-1.3);
      cam.position.lerp(new THREE.Vector3(p.x + Math.cos(a) * 4.2, p.y + 1.1, p.z + Math.sin(a) * 4.2).add(side), 0.06);
      cam.lookAt(p.x + side.x, p.y + 0.35, p.z + side.z);
    } });
  }
  canAct() { return false; }
  invulnerable() { return true; }
  update(dt) { const me = this.game.me; if (me && me.rag) { me.rag.move.set(0, 0, 0); me.rag.yaw += dt * 0.25; me.rag.aim.set(Math.sin(this.t), 0.1, Math.cos(this.t)); } }
  hudInfo() { return { title: '', sub: '' }; }
  stop() { this.game.cam.stop(); }
}

export class App {
  constructor(E, game, api) {
    this.E = E;
    this.game = game;
    this.api = api;
    this.root = document.getElementById('ui');
    this.screen = null;
    this.session = null;
    this.profile = this.loadProfile();
    document.body.className = 'hud-' + this.profile.style;
    this.book = new BookScreen(this);
    E.input.onKey = (e) => this.onKey(e);
    document.addEventListener('click', (e) => { if (e.target.closest && e.target.closest('.btn')) { E.audio.resume(); E.audio.play('uiTap', null, 0.5); } });
    const firstGesture = () => { if (this.game.mode && this.game.mode.kind === 'menu') E.music.play(); removeEventListener('pointerdown', firstGesture); removeEventListener('keydown', firstGesture); };
    addEventListener('pointerdown', firstGesture);
    addEventListener('keydown', firstGesture);
    document.addEventListener('pointerlockchange', () => {
      if (!document.pointerLockElement && this.inMatch() && !this.game.hud.mode && !this.pauseOpen && !this.noPause) this.pause(true);
    });
  }

  loadProfile() {
    let p = {};
    try { p = JSON.parse(localStorage.getItem('bwi.profile') || '{}'); } catch (e) { p = {}; }
    if (!p.id) p.id = 'p' + Math.random().toString(36).slice(2, 10);
    if (!p.name) p.name = ['Doodler', 'Dreamer', 'Sketchy', 'Inky', 'Pencil', 'Brainstorm', 'Noodle'][(Math.random() * 7) | 0] + ((Math.random() * 90 + 10) | 0);
    if (p.color == null) p.color = (Math.random() * CFG.colors.length) | 0;
    if (!p.style) p.style = 'paper';
    if (!p.head) p.head = DEFAULT_HEAD;
    return p;
  }

  saveProfile() { localStorage.setItem('bwi.profile', JSON.stringify(this.profile)); }

  inMatch() { const m = this.game.mode; return m && m.kind !== 'menu'; }

  onKey(e) {
    const g = this.game, hud = g.hud;
    if (e.target && e.target.tagName === 'INPUT') return false;
    if (!this.inMatch() || this.pauseOpen || this.book.open) {
      if (e.code === 'Escape' && this.book.open) { this.book.close(); return true; }
      return false;
    }
    if (hud.mode) return false;
    if (e.code === 'Enter') { e.preventDefault(); hud.open('idea'); return true; }
    if (e.code === 'KeyP') { e.preventDefault(); hud.open('paint'); return true; }
    if (e.code === 'KeyH') { hud.toggleHelp(); return true; }
    if (/^Digit[1-5]$/.test(e.code)) { hud.recast(+e.code.slice(5) - 1); return true; }
    if (e.code === 'Escape') { this.pause(true); return true; }
    return false;
  }

  start() {
    this.showMain();
    this.setMode(new MenuMode(this.game));
  }

  setMode(mode) {
    const g = this.game;
    if (g.mode && g.mode.stop) g.mode.stop();
    g.mode = mode;
    g.running = true;
    g.hud.root.classList.toggle('off', mode.kind === 'menu');
    if (mode.kind === 'menu') { if (navigator.userActivation && navigator.userActivation.hasBeenActive) this.E.music.play(); }
    else this.E.music.pause();
    mode.start();
    g.flushMode();
  }

  ensureMe() {
    const g = this.game, p = this.profile;
    const color = CFG.colors[p.color % CFG.colors.length];
    if (!g.me) { g.addLocal({ id: p.id, name: p.name, color, head: p.head, team: 0 }); g.headRec = p.head; }
    else { g.me.name = p.name; g.me.color = color; g.me.puppet.setColor(color); }
  }

  render(html) {
    this.root.innerHTML = html;
    return this.root;
  }

  showMain() {
    this.screen = 'main';
    this.ensureMe();
    const p = this.profile;
    const r = this.render(`
      <div class="menu"><div class="col">
        <h1 class="logo">Battle<br>with Ideas<span>The world went grey. Your imagination is the only weapon left.</span></h1>
        <div class="field"><label>Your name</label><input id="m-name" maxlength="14" value="${esc(p.name)}"></div>
        <div class="field"><label>What do you have instead of a head? Type anything.</label>
          <div class="row"><input id="m-head" style="flex:1" maxlength="40" placeholder="pizza, cactus, old TV, kalafior..." value="${esc(p.headText || '')}"><button class="btn slim" id="m-headgo">Make it</button></div>
          <div class="muted" id="m-headmsg">Now wearing: ${esc(p.head.name)}</div></div>
        <div class="row" id="m-colors">${CFG.colors.map((c, i) => `<button class="btn slim ${i === p.color ? 'sel' : ''}" data-c="${i}" style="width:38px;height:34px;padding:0;background:${c}"></button>`).join('')}</div>
        <button class="btn big go" id="m-coop">Defend the Spark<small>Story co-op: 10 waves of the Great Boredom, alone or with friends</small></button>
        <button class="btn big" id="m-online">Thinkers' Tournament<small>Online battles: free for all or teams, up to 6 players</small></button>
        <button class="btn big" id="m-practice">Practice<small>Test any idea on dummies that never hit back</small></button>
        <div class="row"><button class="btn slim" id="m-book">Idea Book</button><button class="btn slim" id="m-story">Story</button><button class="btn slim" id="m-style">HUD style: ${esc(p.style)}</button></div>
        <div class="muted" id="m-ai"></div>
      </div><div></div></div>`);
    const name = r.querySelector('#m-name');
    name.oninput = () => { p.name = name.value.trim().slice(0, 14) || p.name; this.saveProfile(); this.game.me.name = p.name; };
    r.querySelectorAll('#m-colors button').forEach((b) => b.onclick = () => { p.color = +b.dataset.c; this.saveProfile(); this.ensureMe(); this.showMain(); });
    const head = r.querySelector('#m-head'), msg = r.querySelector('#m-headmsg');
    const makeHead = async () => {
      const t = head.value.trim();
      if (!t) return;
      msg.textContent = 'Sculpting your head...';
      try {
        const res = await this.api.resolve(t, 'head', p.name, { keepName: false });
        p.head = res.rec; p.headText = t; this.saveProfile();
        this.game.me.puppet.setHead(res.rec);
        this.game.headRec = res.rec;
        msg.textContent = `Now wearing: ${res.rec.name}${res.fresh ? ' (first in the world!)' : ''}`;
        this.E.audio.play('pop', null, 0.6);
      } catch (e) { msg.textContent = e.message; }
    };
    r.querySelector('#m-headgo').onclick = makeHead;
    head.onkeydown = (e) => { if (e.key === 'Enter') makeHead(); };
    r.querySelector('#m-practice').onclick = () => this.startLocal('practice');
    r.querySelector('#m-coop').onclick = () => this.showCoopChoice();
    r.querySelector('#m-online').onclick = () => this.showOnline();
    r.querySelector('#m-book').onclick = () => this.book.show();
    r.querySelector('#m-story').onclick = () => this.playStory();
    r.querySelector('#m-style').onclick = () => { const order = ['paper', 'clean', 'comic']; p.style = order[(order.indexOf(p.style) + 1) % 3]; this.saveProfile(); document.body.className = 'hud-' + p.style; this.showMain(); };
    this.api.health().then((h) => { const el = r.querySelector('#m-ai'); if (!el) return; el.textContent = h ? (h.haveKey ? `AI is awake. ${h.ideas != null ? h.ideas + ' ideas in the world Book.' : ''}` : 'AI is asleep (no key on the server). Ideas come from the Book.') : 'AI unreachable. Ideas come from the Book only.'; });
  }

  showCoopChoice() {
    const r = this.render(`<div class="menu"><div class="col">
      <h1 class="logo" style="font-size:48px">Defend the Spark</h1>
      <div class="muted">The Great Boredom wants to turn the last Spark of imagination grey. Hold it for ten waves.</div>
      <button class="btn big go" id="c-solo">Alone<small>Just you and your ideas</small></button>
      <button class="btn big" id="c-friends">With friends<small>Make a room and share the code</small></button>
      <button class="btn slim" id="c-back">Back</button></div><div></div></div>`);
    r.querySelector('#c-solo').onclick = () => this.startLocal('coop');
    r.querySelector('#c-friends').onclick = () => this.showOnline('coop');
    r.querySelector('#c-back').onclick = () => this.showMain();
  }

  clearUI() { this.root.innerHTML = ''; this.screen = null; }

  startLocal(kind) {
    this.leaveSession();
    this.ensureMe();
    this.clearUI();
    const g = this.game;
    g.me.team = 0;
    this.setMode(kind === 'coop' ? new Coop(g) : new Practice(g));
    this.lockSoon();
  }

  lockSoon() {
    this.noPause = true;
    setTimeout(() => { this.noPause = false; }, 400);
    this.E.input.lock();
    this.E.audio.resume();
  }

  pause(on) {
    if (!on) { this.pauseOpen = false; this.pauseEl && this.pauseEl.remove(); this.pauseEl = null; this.lockSoon(); return; }
    if (this.pauseOpen) return;
    this.pauseOpen = true;
    const p = this.profile;
    const el = document.createElement('div');
    el.className = 'pause';
    const room = this.session ? `<div class="muted">Room <b>${esc(this.session.code)}</b> · share this code with friends</div>` : '';
    el.innerHTML = `<div class="card panel"><h2 style="margin:0;font-weight:normal;font-size:34px">Paused</h2>${room}
      <button class="btn go" id="p-res">Resume</button>
      <div class="field"><label>Mouse sensitivity</label><input type="range" id="p-sens" min="0.3" max="2.5" step="0.05" value="${this.E.input.sens}"></div>
      <div class="field"><label>Sound effects</label><input type="range" id="p-vol" min="0" max="1" step="0.05" value="${this.E.audio.volume}"></div>
      <div class="field"><label>Music (menu and victories)</label><input type="range" id="p-mus" min="0" max="1" step="0.05" value="${this.E.music.vol}"></div>
      <div class="styles">${['paper', 'clean', 'comic'].map((s) => `<button class="btn slim ${p.style === s ? 'sel' : ''}" data-s="${s}">${s}</button>`).join('')}</div>
      <button class="btn" id="p-book">Idea Book</button>
      <button class="btn" id="p-leave">Leave to menu</button></div>`;
    this.root.append(el);
    this.pauseEl = el;
    el.querySelector('#p-res').onclick = () => this.pause(false);
    el.querySelector('#p-sens').oninput = (e) => { this.E.input.sens = +e.target.value; localStorage.setItem('bwi.sens', e.target.value); };
    el.querySelector('#p-vol').oninput = (e) => this.E.audio.setVolume(+e.target.value);
    el.querySelector('#p-mus').oninput = (e) => this.E.music.setVolume(+e.target.value);
    el.querySelectorAll('[data-s]').forEach((b) => b.onclick = () => { p.style = b.dataset.s; this.saveProfile(); document.body.className = 'hud-' + p.style; el.querySelectorAll('[data-s]').forEach((x) => x.classList.toggle('sel', x === b)); });
    el.querySelector('#p-book').onclick = () => this.book.show();
    el.querySelector('#p-leave').onclick = () => { this.pause(false); this.E.input.unlock(); this.toMenu(); };
  }

  toMenu() {
    this.pauseOpen = false;
    if (this.pauseEl) { this.pauseEl.remove(); this.pauseEl = null; }
    this.leaveSession();
    this.game.hud.close(false);
    this.E.input.unlock();
    this.setMode(new MenuMode(this.game));
    this.showMain();
  }

  leaveSession() {
    if (this.session) { this.session.leave(); this.session = null; }
    const g = this.game;
    for (const id of [...g.players.keys()]) if (!g.me || id !== g.me.id) g.removePlayer(id);
    g.net = null;
  }

  async net() {
    if (!this.netMod) this.netMod = await import('../net/session.js');
    return this.netMod;
  }

  async showOnline(prefMode = 'ffa') {
    this.screen = 'online';
    const r = this.render(`<div class="menu"><div class="col">
      <h1 class="logo" style="font-size:48px">${prefMode === 'coop' ? 'Co-op room' : "Thinkers' Tournament"}</h1>
      <button class="btn big go" id="o-quick">Quick play<small>Jump into the first open room</small></button>
      <div class="row"><select id="o-mode" class="btn slim">${[['ffa', 'Free for all'], ['teams', 'Teams'], ['coop', 'Co-op vs Boredom']].map(([v, l]) => `<option value="${v}" ${v === prefMode ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <label class="btn slim"><input type="checkbox" id="o-priv"> private</label><button class="btn slim go" id="o-create">Create room</button></div>
      <div class="row"><input id="o-code" class="btn slim" maxlength="4" placeholder="CODE" style="width:110px;text-transform:uppercase"><button class="btn slim" id="o-join">Join</button></div>
      <div class="muted">Open rooms</div><div class="list" id="o-list"><div class="muted">Connecting...</div></div>
      <div class="err" id="o-err"></div>
      <button class="btn slim" id="o-back">Back</button></div><div></div></div>`);
    const err = r.querySelector('#o-err');
    r.querySelector('#o-back').onclick = () => { this.stopIndex && this.stopIndex(); this.showMain(); };
    let mod;
    try { mod = await this.net(); await mod.Lobby.connect(); }
    catch (e) { err.textContent = 'Could not reach the multiplayer server: ' + e.message; return; }
    if (this.screen !== 'online') return;
    const list = r.querySelector('#o-list');
    this.stopIndex = mod.Lobby.watch((rooms) => {
      if (this.screen !== 'online') return;
      list.innerHTML = rooms.length ? rooms.map((x) => `<button class="btn slim room" data-code="${x.code}"><code>${x.code}</code><span>${esc(x.n)} · ${esc({ ffa: 'Free for all', teams: 'Teams', coop: 'Co-op' }[x.m] || x.m)}</span><em>${x.c}/${CFG.maxPlayers}</em></button>`).join('') : '<div class="muted">No open rooms. Create one!</div>';
      list.querySelectorAll('[data-code]').forEach((b) => b.onclick = () => this.joinRoom(b.dataset.code));
    });
    r.querySelector('#o-quick').onclick = () => this.quick();
    r.querySelector('#o-create').onclick = () => this.createRoom(r.querySelector('#o-mode').value, r.querySelector('#o-priv').checked);
    r.querySelector('#o-join').onclick = () => { const c = r.querySelector('#o-code').value.trim().toUpperCase(); if (/^[A-Z]{4}$/.test(c)) this.joinRoom(c); else err.textContent = 'Codes are 4 letters.'; };
  }

  me() { const p = this.profile; return { id: p.id, name: p.name, color: p.color, head: p.head }; }

  async quick() { try { const mod = await this.net(); this.enterRoom(await mod.Session.quick(this.me(), this.game)); } catch (e) { this.onlineError(e); } }
  async createRoom(mode, priv) { try { const mod = await this.net(); this.enterRoom(await mod.Session.create(this.me(), this.game, { mode, priv })); } catch (e) { this.onlineError(e); } }
  async joinRoom(code) { try { const mod = await this.net(); this.enterRoom(await mod.Session.join(code, this.me(), this.game)); } catch (e) { this.onlineError(e); } }
  onlineError(e) { const el = this.root.querySelector('#o-err'); if (el) el.textContent = e.message; else alert(e.message); }

  enterRoom(session) {
    this.stopIndex && this.stopIndex();
    this.session = session;
    session.onRoster = () => this.screen === 'room' && this.showRoom();
    session.onStart = (mode) => this.beginOnline(mode);
    session.onKicked = (why) => { this.toMenu(); alert(why); };
    if (session.state === 'play') this.beginOnline(session.mode);
    else this.showRoom();
  }

  showRoom() {
    this.screen = 'room';
    const s = this.session;
    const ps = s.roster();
    const host = s.isHost;
    const teams = s.mode === 'teams';
    const r = this.render(`<div class="menu"><div class="col">
      <div class="muted">Room code</div><div class="code-big">${esc(s.code)}</div>
      <div class="muted">${s.priv ? 'Private room. Friends join with the code.' : 'Public room, listed for everyone.'}</div>
      <div class="row">${[['ffa', 'Free for all'], ['teams', 'Teams'], ['coop', 'Co-op']].map(([v, l]) => `<button class="btn slim ${s.mode === v ? 'sel' : ''}" data-m="${v}" ${host ? '' : 'disabled'}>${l}</button>`).join('')}</div>
      <div class="players">${ps.map((p) => `<div class="pl" style="--c:${teams ? CFG.teamColors[p.t || 0] : CFG.colors[p.c % CFG.colors.length]}"><i></i>${esc(p.n)}${p.id === s.hostId ? ' <small class="muted">host</small>' : ''}${p.id === s.myId ? ' <small class="muted">you</small>' : ''}<em>${esc(p.hn || '')}</em></div>`).join('')}</div>
      ${teams ? `<div class="row"><button class="btn slim" data-t="0" style="border-color:${CFG.teamColors[0]}">Join Blue</button><button class="btn slim" data-t="1" style="border-color:${CFG.teamColors[1]}">Join Orange</button>${host ? '<button class="btn slim" id="r-bal">Balance teams</button>' : ''}</div>` : ''}
      ${host ? `<button class="btn big go" id="r-start" ${ps.length < (s.mode === 'coop' ? 1 : 2) ? 'disabled' : ''}>Start<small>${ps.length < 2 && s.mode !== 'coop' ? 'Need at least 2 Thinkers' : 'Everyone in, let\'s go'}</small></button>` : '<div class="muted">Waiting for the host to start...</div>'}
      <button class="btn slim" id="r-leave">Leave room</button></div><div></div></div>`);
    r.querySelectorAll('[data-m]').forEach((b) => b.onclick = () => s.setMode(b.dataset.m));
    r.querySelectorAll('[data-t]').forEach((b) => b.onclick = () => s.setTeam(+b.dataset.t));
    const bal = r.querySelector('#r-bal'); if (bal) bal.onclick = () => s.balance();
    const st = r.querySelector('#r-start'); if (st) st.onclick = () => s.start();
    r.querySelector('#r-leave').onclick = () => this.toMenu();
  }

  beginOnline(mode) {
    const g = this.game;
    this.clearUI();
    this.ensureMe();
    g.me.team = this.session.myTeam();
    for (const p of g.players.values()) if (p.remote) { const info = this.session.info(p.id); if (info) { p.team = info.t || 0; const c = mode === 'teams' ? CFG.teamColors[p.team] : CFG.colors[info.c % CFG.colors.length]; p.color = c; p.puppet.setColor(c); } }
    const myColor = mode === 'teams' ? CFG.teamColors[g.me.team] : CFG.colors[this.profile.color % CFG.colors.length];
    g.me.color = myColor; g.me.puppet.setColor(myColor);
    this.setMode(mode === 'coop' ? new Coop(g) : new Battle(g, mode === 'teams'));
    this.lockSoon();
  }

  async playStory(after = null) {
    const { Story } = await import('../game/story.js');
    const g = this.game;
    this.clearUI();
    const prev = g.mode;
    const story = new Story(this, () => { this.setMode(new MenuMode(g)); if (after) after(); else this.showMain(); });
    if (prev && prev.stop) prev.stop();
    g.mode = story;
    g.hud.root.classList.add('off');
    story.start();
  }
}
