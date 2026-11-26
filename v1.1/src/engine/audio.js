// Battle with Ideas: WebAudio sound bank with distance falloff, stereo pan and loops.

import * as THREE from 'three';

const _v = new THREE.Vector3(), _r = new THREE.Vector3();

export class Audio {
  constructor(E) {
    this.E = E;
    this.ctx = null;
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { this.ctx = null; }
    this.master = null;
    this.bank = {};
    this.buffers = new Map();
    this.loading = new Map();
    this.loops = new Map();
    this.volume = parseFloat(localStorage.getItem('bwi.vol') || '0.8');
    this.last = {};
    if (this.ctx) {
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
    }
  }

  async load(url = 'assets/sfx/manifest.json') {
    try {
      const r = await fetch(url, { cache: 'no-cache' });
      if (!r.ok) return;
      const m = await r.json();
      const ok = {};
      await Promise.all(Object.entries(m.sounds || {}).map(async ([k, files]) => {
        const good = [];
        for (const f of files) {
          try { const h = await fetch('assets/sfx/' + f, { method: 'HEAD' }); if (h.ok) good.push('assets/sfx/' + f); } catch (e) { /* missing */ }
        }
        if (good.length) ok[k] = good;
      }));
      for (const [a, b] of Object.entries(m.alias || {})) if (!ok[a] && ok[b]) ok[a] = ok[b];
      this.bank = ok;
      this.loopCfg = m.loops || {};
    } catch (e) { this.bank = {}; }
  }

  resume() { if (this.ctx && this.ctx.state !== 'running') this.ctx.resume().catch(() => {}); }

  setVolume(v) { this.volume = v; localStorage.setItem('bwi.vol', String(v)); if (this.master) this.master.gain.value = v; }

  async buffer(url) {
    if (this.buffers.has(url)) return this.buffers.get(url);
    if (this.loading.has(url)) return this.loading.get(url);
    const p = fetch(url).then((r) => r.arrayBuffer()).then((a) => this.ctx.decodeAudioData(a)).then((b) => { this.buffers.set(url, b); return b; }).catch(() => null);
    this.loading.set(url, p);
    return p;
  }

  seamless(buf, from = 0, to = 0) {
    const sr = buf.sampleRate;
    const a = Math.floor(Math.max(0, from) * sr), b = Math.floor((to > 0 ? Math.min(to, buf.duration) : buf.duration) * sr);
    const len = b - a;
    const fade = Math.min(Math.floor(0.25 * sr), Math.floor(len / 3));
    if (len < sr * 0.3) return buf;
    const out = this.ctx.createBuffer(buf.numberOfChannels, len - fade, sr);
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const src = buf.getChannelData(c), dst = out.getChannelData(c);
      for (let i = 0; i < len - fade; i++) dst[i] = src[a + i];
      for (let i = 0; i < fade; i++) {
        const k = i / fade;
        dst[i] = src[a + i] * Math.sqrt(k) + src[a + len - fade + i] * Math.sqrt(1 - k);
      }
    }
    return out;
  }

  preload() { for (const k in this.bank) for (const u of this.bank[k]) this.buffer(u); }

  spatial(pos) {
    if (!pos) return { gain: 1, pan: 0 };
    const cam = this.E.renderer.camera;
    const d = cam.position.distanceTo(pos);
    const gain = 1 / (1 + Math.max(0, d - 3) * 0.09);
    _r.set(1, 0, 0).applyQuaternion(cam.quaternion);
    _v.copy(pos).sub(cam.position).normalize();
    return { gain, pan: THREE.MathUtils.clamp(_v.dot(_r) * 0.8, -1, 1) };
  }

  play(name, pos = null, vol = 1, rate = 1) {
    if (!this.ctx || !this.bank[name]) return;
    const now = performance.now();
    if (this.last[name] && now - this.last[name] < 45) return;
    this.last[name] = now;
    const list = this.bank[name];
    const url = list[(Math.random() * list.length) | 0];
    const sp = this.spatial(pos);
    if (sp.gain * vol < 0.03) return;
    this.buffer(url).then((buf) => {
      if (!buf) return;
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = rate * (0.94 + Math.random() * 0.12);
      const g = this.ctx.createGain();
      g.gain.value = Math.min(1.2, sp.gain * vol);
      const pan = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;
      if (pan) { pan.pan.value = sp.pan; src.connect(g).connect(pan).connect(this.master); } else src.connect(g).connect(this.master);
      src.start();
    });
  }

  loop(key, name, pos, vol = 0.6) {
    if (!this.ctx || !this.bank[name]) return;
    let L = this.loops.get(key);
    if (!L) {
      L = { name, gain: this.ctx.createGain(), pan: this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null, src: null, vol };
      L.gain.gain.value = 0;
      if (L.pan) L.gain.connect(L.pan).connect(this.master); else L.gain.connect(this.master);
      this.loops.set(key, L);
      this.buffer(this.bank[name][0]).then((buf) => {
        if (!buf || !this.loops.has(key)) return;
        const cfg = (this.loopCfg || {})[name];
        const lk = 'loop:' + name;
        if (!this.buffers.has(lk)) this.buffers.set(lk, cfg ? this.seamless(buf, cfg.from || 0, cfg.to || 0) : buf);
        L.src = this.ctx.createBufferSource();
        L.src.buffer = this.buffers.get(lk); L.src.loop = true;
        L.src.connect(L.gain);
        L.src.start();
      });
    }
    const sp = this.spatial(pos);
    L.gain.gain.setTargetAtTime(Math.min(1, sp.gain * vol), this.ctx.currentTime, 0.08);
    if (L.pan) L.pan.pan.setTargetAtTime(sp.pan, this.ctx.currentTime, 0.08);
  }

  stopLoop(key) {
    const L = this.loops.get(key);
    if (!L) return;
    this.loops.delete(key);
    L.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
    setTimeout(() => { try { L.src && L.src.stop(); } catch (e) { /* stopped */ } }, 500);
  }

  stopAll() { for (const k of [...this.loops.keys()]) this.stopLoop(k); }
}
