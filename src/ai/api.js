// Battle with Ideas: turns typed text into recipes (memory and local cache, the shipped Book, the Haiku Worker, fuzzy fallback).

import { CFG } from '../config.js';
import { normText, sanitizeIdea, sanitizePaint, sanitizeHead, sanitizeOutfitLook } from '../shared/recipe.js';

const LS = 'bwi.cache.v2';
const SAN = { idea: sanitizeIdea, paint: sanitizePaint, head: sanitizeHead, outfit: sanitizeOutfitLook };
const MODES = Object.keys(SAN);

function stem(w) {
  return w.replace(/(ami|ach|owie|ow|om|em|ie|ego|emu|ymi|ych|owa|owy|owe|ka|ki|ek|y|i|a|e|o|u|s|es)$/,'');
}
function tokens(t) { return normText(t).split(' ').filter((w) => w.length > 1).map(stem).filter(Boolean); }

export class IdeaAPI {
  constructor() {
    this.mem = Object.fromEntries(MODES.map((m) => [m, new Map()]));
    this.index = Object.fromEntries(MODES.map((m) => [m, []]));
    this.online = true;
    this.status = 'unknown';
    this.names = [];
    try {
      const c = JSON.parse(localStorage.getItem(LS) || '{}');
      for (const mode of MODES) for (const [k, v] of Object.entries(c[mode] || {})) this.mem[mode].set(k, v);
    } catch (e) { /* corrupt cache */ }
  }

  persist() {
    const out = {};
    for (const mode of MODES) {
      const ent = [...this.mem[mode].entries()].slice(-400);
      out[mode] = Object.fromEntries(ent);
    }
    try { localStorage.setItem(LS, JSON.stringify(out)); } catch (e) { /* quota */ }
  }

  async loadSeed(url = 'data/seed.json') {
    try {
      const r = await fetch(url);
      if (!r.ok) return 0;
      const s = await r.json();
      let n = 0;
      for (const mode of MODES) {
        for (const rec0 of s[mode] || []) {
          const rec = SAN[mode](rec0);
          rec.by = rec0.by || 'the Book';
          this.addIndex(mode, rec, rec0.alias || []);
          n++;
        }
      }
      this.rebuildNames();
      return n;
    } catch (e) { return 0; }
  }

  addIndex(mode, rec, aliases = []) {
    const keys = new Set([normText(rec.name), normText(rec.en), normText(rec.key.replace(/-/g, ' ')), ...aliases.map(normText)]);
    for (const k of keys) if (k && !this.mem[mode].has(k)) this.mem[mode].set(k, rec);
    this.index[mode].push({ rec, toks: new Set([...tokens(rec.name), ...tokens(rec.en), ...tokens(rec.key.replace(/-/g, ' '))]) });
  }

  rebuildNames() {
    const seen = new Set();
    this.names = [];
    for (const { rec } of this.index.idea) { if (seen.has(rec.key)) continue; seen.add(rec.key); this.names.push({ name: rec.name, en: rec.en, key: rec.key, kind: rec.kind }); }
  }

  suggest(prefix, n = 5) {
    const p = normText(prefix);
    if (p.length < 2) return [];
    const out = [];
    const seen = new Set();
    for (const it of this.names) {
      if (seen.has(it.key)) continue;
      const a = normText(it.name), b = normText(it.en);
      if (a.startsWith(p) || b.startsWith(p) || a.includes(' ' + p) || b.includes(' ' + p)) { out.push(it); seen.add(it.key); if (out.length >= n) break; }
    }
    return out;
  }

  fuzzy(mode, text) {
    const q = tokens(text);
    if (!q.length) return null;
    let best = null, bestS = 0;
    for (const it of this.index[mode]) {
      let hit = 0;
      for (const t of q) { if (it.toks.has(t)) hit++; else for (const u of it.toks) if (u.length > 3 && t.length > 3 && (u.startsWith(t) || t.startsWith(u))) { hit += 0.7; break; } }
      const s = hit / Math.max(q.length, it.toks.size * 0.75);
      if (s > bestS) { bestS = s; best = it.rec; }
    }
    return bestS >= 0.34 ? best : null;
  }

  async resolve(text, mode = 'idea', by = 'Thinker', opt = {}) {
    const norm = normText(text);
    if (!norm) throw new Error('Type an idea first.');
    const hit = this.mem[mode].get(norm);
    if (hit) return { rec: { ...hit, name: opt.keepName ? hit.name : niceName(text, hit) }, fresh: false, source: 'book' };
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), opt.timeout || 32000);
      const r = await fetch(CFG.api + '/api/make', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: String(text).slice(0, 120), mode, by: String(by).slice(0, 16), free: !!opt.free }), signal: ctl.signal });
      clearTimeout(timer);
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.rec) {
        const rec = SAN[mode](j.rec, text);
        rec.by = j.by || by;
        this.mem[mode].set(norm, rec);
        if (j.fresh) this.addIndex(mode, rec);
        if (mode === 'idea') this.rebuildNames();
        this.persist();
        this.status = 'ok';
        return { rec, fresh: !!j.fresh, source: j.fresh ? 'ai' : 'world', by: j.by };
      }
      this.status = j.code || 'error';
      const fb = this.fuzzy(mode, text);
      if (fb) return { rec: fb, fresh: false, source: 'approx', note: j.error };
      throw new Error(j.error || 'The idea fizzled. Try other words.');
    } catch (e) {
      if (e.name === 'AbortError' || e instanceof TypeError) {
        this.status = 'offline';
        const fb = this.fuzzy(mode, text);
        if (fb) return { rec: fb, fresh: false, source: 'approx', note: 'AI unreachable, picked the closest idea from the Book.' };
        throw new Error('The AI is unreachable and the Book has nothing like that.');
      }
      throw e;
    }
  }

  async book(params = {}) {
    const q = new URLSearchParams(params);
    try {
      const r = await fetch(CFG.api + '/api/book?' + q.toString());
      if (r.ok) return await r.json();
    } catch (e) { /* offline */ }
    const list = this.index.idea.map((x) => x.rec);
    const seen = new Set();
    const items = list.filter((r) => (seen.has(r.key) ? false : seen.add(r.key))).filter((r) => !params.q || normText(r.name + ' ' + r.en).includes(normText(params.q)));
    return { items: items.slice(0, 60).map((rec) => ({ key: rec.key, name: rec.name, en: rec.en, blurb: rec.blurb, kind: rec.kind, by: rec.by || 'the Book', rec })), offline: true };
  }

  async health() {
    try {
      const r = await fetch(CFG.api + '/api/health', { cache: 'no-store' });
      const j = await r.json();
      this.status = j.haveKey ? 'ok' : 'nokey';
      return j;
    } catch (e) { this.status = 'offline'; return null; }
  }
}

function niceName(text, rec) {
  const t = String(text).trim();
  const n = normText(t);
  if (n === normText(rec.name)) return rec.name;
  if (n === normText(rec.en)) return rec.en;
  return t.length <= 28 ? t.charAt(0).toUpperCase() + t.slice(1) : rec.name;
}
