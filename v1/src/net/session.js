// Battle with Ideas: online rooms (Firebase lobby, presence and signalling in the shared RTDB block, WebRTC mesh with an RTDB relay fallback).

import { CFG } from '../config.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.12.5';
const ROOT = CFG.realm;
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const STALE = 30000;
const ICE = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }, { urls: 'stun:stun.cloudflare.com:3478' }];
const P2P_TIMEOUT = 7000;

const F = { app: null, db: null, m: null, uid: null, offset: 0, ready: null };

async function connect() {
  if (F.ready) return F.ready;
  F.ready = (async () => {
    const limit = (p, ms = 12000) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
    const [appM, authM, dbM] = await limit(Promise.all([import(`${SDK}/firebase-app.js`), import(`${SDK}/firebase-auth.js`), import(`${SDK}/firebase-database.js`)]));
    F.m = dbM;
    F.app = appM.getApps().length ? appM.getApp() : appM.initializeApp(CFG.firebase);
    const auth = authM.getAuth(F.app);
    await limit(auth.authStateReady ? auth.authStateReady() : Promise.resolve());
    const user = auth.currentUser || (await limit(authM.signInAnonymously(auth))).user;
    F.uid = user.uid;
    F.db = dbM.getDatabase(F.app);
    dbM.onValue(dbM.ref(F.db, '.info/serverTimeOffset'), (s) => { F.offset = s.val() || 0; });
    return F;
  })().catch((e) => { F.ready = null; throw e; });
  return F.ready;
}

const ref = (p) => F.m.ref(F.db, p);
const now = () => Date.now() + F.offset;

export const Lobby = {
  async connect() { await connect(); return F.uid; },
  watch(cb) {
    const m = F.m;
    const q = m.query(ref(`${ROOT}/index`), m.orderByChild('u'), m.startAt(now() - STALE));
    return m.onValue(q, (s) => {
      const rooms = [];
      s.forEach((c) => { const v = c.val(); if (v && !v.pv && v.c > 0 && v.c < CFG.maxPlayers) rooms.push({ code: c.key, ...v }); });
      rooms.sort((a, b) => b.u - a.u);
      cb(rooms);
    });
  },
};

function code() { let s = ''; for (let i = 0; i < 4; i++) s += LETTERS[(Math.random() * LETTERS.length) | 0]; return s; }

class Peer {
  constructor(session, id) {
    this.s = session;
    this.id = id;
    this.pc = null;
    this.r = null;
    this.u = null;
    this.open = false;
    this.relay = false;
    this.started = performance.now();
    this.pendingIce = [];
  }

  get initiator() { return this.s.myId < this.id; }

  start() {
    const pc = new RTCPeerConnection({ iceServers: ICE });
    this.pc = pc;
    pc.onicecandidate = (e) => { if (e.candidate) { this.iceOut = (this.iceOut || 0) + 1; this.s.signal(this.id, 'ice', JSON.stringify(e.candidate)); } };
    pc.onconnectionstatechange = () => {
      if (['failed', 'closed'].includes(pc.connectionState)) this.toRelay('p2p ' + pc.connectionState);
    };
    if (this.initiator) {
      this.bind(pc.createDataChannel('r', { ordered: true }));
      this.bind(pc.createDataChannel('u', { ordered: false, maxRetransmits: 0 }));
      pc.createOffer().then((o) => pc.setLocalDescription(o)).then(() => this.s.signal(this.id, 'offer', JSON.stringify(pc.localDescription))).catch(() => this.toRelay('offer'));
    } else {
      pc.ondatachannel = (e) => this.bind(e.channel);
    }
    this.timer = setTimeout(() => { if (!this.open) this.toRelay('timeout'); }, P2P_TIMEOUT);
  }

  bind(ch) {
    if (ch.label === 'r') this.r = ch; else this.u = ch;
    ch.onopen = () => {
      if (this.r && this.u && this.r.readyState === 'open' && this.u.readyState === 'open' && !this.open) {
        this.open = true;
        this.relay = false;
        clearTimeout(this.timer);
        this.s.onPeerOpen(this);
      }
    };
    ch.onmessage = (e) => this.s.onData(this.id, e.data);
    ch.onclose = () => { if (this.open) { this.open = false; this.toRelay('closed'); } };
  }

  async onSignal(k, d) {
    try {
      if (!this.pc) this.start();
      const pc = this.pc;
      if (k === 'offer') {
        await pc.setRemoteDescription(JSON.parse(d));
        const a = await pc.createAnswer();
        await pc.setLocalDescription(a);
        this.s.signal(this.id, 'answer', JSON.stringify(pc.localDescription));
        for (const c of this.pendingIce.splice(0)) await pc.addIceCandidate(c).catch(() => {});
      } else if (k === 'answer') {
        await pc.setRemoteDescription(JSON.parse(d));
        for (const c of this.pendingIce.splice(0)) await pc.addIceCandidate(c).catch(() => {});
      } else if (k === 'ice') {
        this.iceIn = (this.iceIn || 0) + 1;
        const c = JSON.parse(d);
        if (pc.remoteDescription) await pc.addIceCandidate(c).catch(() => {}); else this.pendingIce.push(c);
      }
    } catch (e) { this.toRelay('signal ' + e.message); }
  }

  toRelay(why) {
    if (this.relay) return;
    this.relay = true;
    this.relayWhy = why;
    if (!this.wasOpened) { this.wasOpened = true; this.s.onPeerOpen(this); }
    this.s.ensureRelay();
  }

  sendR(str) {
    if (this.open && this.r && this.r.readyState === 'open') { try { this.r.send(str); return; } catch (e) { /* fall through */ } }
    if (this.relay) this.s.relayEvent(this.id, str);
  }

  sendU(str) {
    if (this.open && this.u && this.u.readyState === 'open' && this.u.bufferedAmount < 64000) { try { this.u.send(str); } catch (e) { /* drop */ } }
  }

  close() {
    clearTimeout(this.timer);
    try { this.pc && this.pc.close(); } catch (e) { /* closed */ }
  }
}

export class Session {
  static async create(me, game, { mode = 'ffa', priv = false } = {}) {
    await connect();
    for (let i = 0; i < 12; i++) {
      const c = code();
      const s = await F.m.get(ref(`${ROOT}/rooms/${c}/players`));
      if (s.exists()) continue;
      const ses = new Session(c, me, game);
      await ses.enter({ create: true, mode, priv });
      return ses;
    }
    throw new Error('Could not find a free room code. Try again.');
  }

  static async join(c, me, game) {
    await connect();
    c = c.toUpperCase();
    const s = await F.m.get(ref(`${ROOT}/rooms/${c}/players`));
    const n = s.exists() ? Object.keys(s.val()).filter((k) => k !== F.uid).length : 0;
    if (!n) throw new Error(`No room with code ${c}.`);
    if (n >= CFG.maxPlayers) throw new Error('That room is full.');
    const ses = new Session(c, me, game);
    await ses.enter({});
    return ses;
  }

  static async quick(me, game) {
    await connect();
    const m = F.m;
    const s = await m.get(m.query(ref(`${ROOT}/index`), m.orderByChild('u'), m.startAt(now() - STALE)));
    const list = [];
    s.forEach((c) => { const v = c.val(); if (v && !v.pv && v.c > 0 && v.c < CFG.maxPlayers && v.m !== 'coop') list.push([c.key, v]); });
    list.sort((a, b) => b[1].c - a[1].c);
    for (const [c] of list) { try { return await Session.join(c, me, game); } catch (e) { /* next */ } }
    return Session.create(me, game, { mode: 'ffa', priv: false });
  }

  constructor(c, me, game) {
    this.code = c;
    this.me = me;
    this.game = game;
    this.myId = F.uid;
    this.players = new Map();
    this.peers = new Map();
    this.subs = [];
    this.hostId = null;
    this.mode = 'ffa';
    this.priv = false;
    this.state = 'lobby';
    this.relayOn = false;
    this.relayAcc = 0;
    this.lastState = null;
    this.onRoster = () => {};
    this.onStart = () => {};
    this.onKicked = () => {};
    this.left = false;
  }

  get isHost() { return this.hostId === this.myId; }
  sp(p = '') { return `${ROOT}/rooms/${this.code}${p ? '/' + p : ''}`; }
  now() { return now(); }

  async enter({ create, mode, priv }) {
    const m = F.m;
    const me = this.me;
    const head = JSON.stringify(me.head || null);
    this.my = { n: me.name.slice(0, 14), c: me.color | 0, t: 0, h: head.length < 6000 ? head : 'null', j: m.serverTimestamp() };
    const up = { [`players/${this.myId}`]: this.my };
    if (create) { up.meta = { host: this.myId, mode, st: 'lobby', priv: !!priv, c: m.serverTimestamp() }; }
    await m.update(ref(this.sp()), up);
    this.arm();
    this.game.setMyId(this.myId);
    this.game.net = this;
    await this.listen();
    if (create) this.writeIndex();
  }

  arm() {
    const m = F.m;
    m.onDisconnect(ref(this.sp(`players/${this.myId}`))).remove();
    m.onDisconnect(ref(this.sp(`sig/${this.myId}`))).remove();
    m.onDisconnect(ref(this.sp(`relay/${this.myId}`))).remove();
    m.onDisconnect(ref(this.sp(`rev/${this.myId}`))).remove();
  }

  listen() {
    const m = F.m;
    const add = (u) => this.subs.push(u);
    let firstMeta = null;
    let firstMetaDone = false;
    const metaReady = new Promise((r) => { firstMeta = r; });
    add(m.onValue(ref(this.sp('meta')), (s) => {
      const v = s.val() || {};
      const prevHost = this.hostId, prevSt = this.state;
      this.hostId = v.host || null;
      this.mode = v.mode || 'ffa';
      this.priv = !!v.priv;
      this.state = v.st || 'lobby';
      if (prevHost && prevHost !== this.hostId && this.isHost) this.game.adoptNPC && this.game.adoptNPC();
      if (prevSt !== this.state && this.state === 'play' && firstMetaDone) this.onStart(this.mode);
      if (prevSt === 'play' && this.state === 'lobby') this.onRoster();
      this.onRoster();
      this.checkHost();
      firstMeta();
    }));
    metaReady.then(() => { firstMetaDone = true; });
    add(m.onChildAdded(ref(this.sp('players')), (c) => this.upsert(c.key, c.val())));
    add(m.onChildChanged(ref(this.sp('players')), (c) => this.upsert(c.key, c.val())));
    add(m.onChildRemoved(ref(this.sp('players')), (c) => this.drop(c.key)));
    add(m.onChildAdded(ref(this.sp(`sig/${this.myId}`)), (c) => {
      const from = c.key;
      add(m.onChildAdded(ref(this.sp(`sig/${this.myId}/${from}`)), (x) => {
        const v = x.val();
        m.remove(x.ref).catch(() => {});
        if (!v) return;
        let p = this.peers.get(from);
        if (!p) { p = new Peer(this, from); this.peers.set(from, p); }
        p.onSignal(v.k, v.d);
      }));
    }));
    add(m.onChildAdded(ref(this.sp(`rev/${this.myId}`)), (c) => {
      const v = c.val();
      m.remove(c.ref).catch(() => {});
      if (v && v.f && v.d) this.onData(v.f, v.d, true);
    }));
    return metaReady;
  }

  upsert(id, v) {
    if (!v) return;
    const had = this.players.has(id);
    let head = null;
    try { head = JSON.parse(v.h || 'null'); } catch (e) { head = null; }
    this.players.set(id, { id, n: v.n, c: v.c || 0, t: v.t || 0, j: v.j || 0, head, hn: head && head.name });
    if (id !== this.myId) {
      const g = this.game;
      const color = this.mode === 'teams' ? CFG.teamColors[v.t || 0] : CFG.colors[(v.c || 0) % CFG.colors.length];
      const rp = g.addRemote({ id, name: v.n, color, team: v.t || 0, head });
      if (head && rp.head !== head && JSON.stringify(rp.head) !== JSON.stringify(head)) rp.setHead(head);
      if (!had) {
        const p = new Peer(this, id);
        if (!this.peers.has(id)) this.peers.set(id, p);
        if (p.initiator && !p.pc) p.start();
        if (!had && this.state === 'play') g.hud && g.hud.feed(`${v.n} joined`, color);
      }
    }
    this.checkHost();
    this.onRoster();
    if (this.isHost) this.writeIndex();
  }

  drop(id) {
    const p = this.players.get(id);
    this.players.delete(id);
    const peer = this.peers.get(id);
    if (peer) { peer.close(); this.peers.delete(id); }
    if (id !== this.myId) { this.game.removePlayer(id); if (p) this.game.hud && this.game.hud.feed(`${p.n} left`); }
    else if (!this.left) this.onKicked('You were disconnected from the room.');
    this.checkHost();
    this.onRoster();
    if (this.isHost) this.writeIndex();
  }

  async checkHost() {
    if (this.left || !this.players.size) return;
    if (this.hostId && this.players.has(this.hostId)) return;
    const order = [...this.players.values()].sort((a, b) => (a.j || 0) - (b.j || 0) || (a.id < b.id ? -1 : 1));
    if (!order.length || order[0].id !== this.myId) return;
    try {
      await F.m.runTransaction(ref(this.sp('meta/host')), (cur) => (cur && cur !== this.myId && this.players.has(cur) ? undefined : this.myId), { applyLocally: false });
      this.writeIndex();
    } catch (e) { /* lost the race */ }
  }

  writeIndex() {
    if (!this.isHost || this.left) return;
    const m = F.m;
    const r = ref(`${ROOT}/index/${this.code}`);
    const host = this.players.get(this.myId);
    m.set(r, { n: (host ? host.n : 'Thinker').slice(0, 14), c: this.players.size, m: this.mode, s: this.state, pv: this.priv, u: m.serverTimestamp() }).catch(() => {});
    m.onDisconnect(r).remove();
    clearInterval(this.indexTimer);
    this.indexTimer = setInterval(() => this.isHost && !this.left && m.update(r, { u: m.serverTimestamp(), c: this.players.size, s: this.state, m: this.mode }).catch(() => {}), 10000);
  }

  roster() { return [...this.players.values()].sort((a, b) => (a.j || 0) - (b.j || 0)); }
  info(id) { return this.players.get(id); }
  myTeam() { const p = this.players.get(this.myId); return p ? p.t || 0 : 0; }

  setMode(mode) { if (this.isHost) F.m.update(ref(this.sp('meta')), { mode }).then(() => this.writeIndex()); }
  setTeam(t) { F.m.update(ref(this.sp(`players/${this.myId}`)), { t }); }
  balance() {
    if (!this.isHost) return;
    const ids = this.roster().map((p) => p.id).sort(() => Math.random() - 0.5);
    const up = {};
    ids.forEach((id, i) => { up[`players/${id}/t`] = i % 2; });
    F.m.update(ref(this.sp()), up);
  }

  start() { if (this.isHost) F.m.update(ref(this.sp('meta')), { st: 'play', at: F.m.serverTimestamp() }).then(() => this.writeIndex()); }
  backToLobby() { if (this.isHost) F.m.update(ref(this.sp('meta')), { st: 'lobby' }).then(() => this.writeIndex()); }

  signal(to, k, d) { F.m.push(ref(this.sp(`sig/${to}/${this.myId}`)), { k, d: String(d).slice(0, 9000) }).catch(() => {}); }

  onPeerOpen(peer) {
    if (this.game.onPeerJoined) this.game.onPeerJoined(peer.id);
  }

  ensureRelay() {
    if (this.relayOn) return;
    this.relayOn = true;
    const m = F.m;
    this.subs.push(m.onChildChanged(ref(this.sp('relay')), (c) => this.onRelayState(c.key, c.val())));
    this.subs.push(m.onChildAdded(ref(this.sp('relay')), (c) => this.onRelayState(c.key, c.val())));
  }

  onRelayState(from, v) {
    if (from === this.myId || !v || !v.s) return;
    const p = this.peers.get(from);
    if (p && p.open) return;
    this.onData(from, v.s, true);
  }

  relayEvent(to, str) { F.m.push(ref(this.sp(`rev/${to}`)), { f: this.myId, d: str.slice(0, 20000) }).catch(() => {}); }

  onData(from, str, viaRelay = false) {
    let msg;
    try { msg = JSON.parse(str); } catch (e) { return; }
    if (msg.t === 'e') this.game.onEvent(msg.e, false);
    else if (msg.t === 's') this.game.onState(from, msg.s, performance.now());
  }

  send(ev) {
    const str = JSON.stringify({ t: 'e', e: ev });
    for (const p of this.peers.values()) p.sendR(str);
  }

  sendTo(id, ev) {
    const p = this.peers.get(id);
    if (p) p.sendR(JSON.stringify({ t: 'e', e: ev }));
  }

  sendState(st) {
    const str = JSON.stringify({ t: 's', s: st });
    let anyRelay = false;
    for (const p of this.peers.values()) { if (p.open) p.sendU(str); else if (p.relay) anyRelay = true; }
    if (anyRelay) {
      const t = performance.now();
      if (t - this.relayAcc > 125) { this.relayAcc = t; F.m.set(ref(this.sp(`relay/${this.myId}`)), { s: str.slice(0, 30000), t: F.m.serverTimestamp() }).catch(() => {}); }
    }
  }

  stats() { return [...this.peers.values()].map((p) => ({ id: p.id, open: p.open, relay: p.relay, why: p.relayWhy, iceOut: p.iceOut || 0, iceIn: p.iceIn || 0 })); }

  async leave() {
    if (this.left) return;
    this.left = true;
    const m = F.m;
    clearInterval(this.indexTimer);
    for (const u of this.subs) { try { u(); } catch (e) { /* gone */ } }
    for (const p of this.peers.values()) p.close();
    const last = this.players.size <= 1;
    try {
      await m.remove(ref(this.sp(`players/${this.myId}`)));
      await m.remove(ref(this.sp(`sig/${this.myId}`)));
      await m.remove(ref(this.sp(`relay/${this.myId}`)));
      await m.remove(ref(this.sp(`rev/${this.myId}`)));
      if (last) { await m.remove(ref(this.sp())); await m.remove(ref(`${ROOT}/index/${this.code}`)); }
      else if (this.isHost) { await m.remove(ref(`${ROOT}/index/${this.code}`)); await m.update(ref(this.sp('meta')), { host: null }); }
    } catch (e) { /* offline */ }
    this.game.net = null;
  }
}
