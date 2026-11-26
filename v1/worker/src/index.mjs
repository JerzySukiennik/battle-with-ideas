// Battle with Ideas API: Haiku turns typed ideas into recipes, the world Idea Book lives in D1, the key never leaves the Worker.

import Anthropic from '@anthropic-ai/sdk';
import { IDEA_SCHEMA, PAINT_SCHEMA, HEAD_SCHEMA, OUTFIT_SCHEMA, sanitizeIdea, sanitizePaint, sanitizeHead, sanitizeOutfitLook, normText } from '../../src/shared/recipe.js';
import { IDEA_SYSTEM, PAINT_SYSTEM, HEAD_SYSTEM, OUTFIT_SYSTEM } from './prompt.mjs';

const MODEL = 'claude-haiku-5-5';
const PRICE_IN = 0.10, PRICE_OUT = 0.50, PRICE_CACHE = 0.01;
const ORIGINS = [/^https:\/\/([a-z0-9-]+\.)?gzowo\.fun$/, /^https:\/\/[a-z0-9-]+\.github\.io$/, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/];
const MODES = {
  idea: { system: IDEA_SYSTEM, schema: IDEA_SCHEMA, clean: sanitizeIdea, max: 3500 },
  paint: { system: PAINT_SYSTEM, schema: PAINT_SCHEMA, clean: sanitizePaint, max: 4000 },
  head: { system: HEAD_SYSTEM, schema: HEAD_SCHEMA, clean: sanitizeHead, max: 2000 },
  outfit: { system: OUTFIT_SYSTEM, schema: OUTFIT_SCHEMA, clean: sanitizeOutfitLook, max: 6000 },
};

const SCHEMA_SQL = [
  'CREATE TABLE IF NOT EXISTS ideas (mode TEXT NOT NULL, key TEXT NOT NULL, name TEXT, en TEXT, kind TEXT, blurb TEXT, recipe TEXT NOT NULL, by TEXT, created INTEGER, uses INTEGER DEFAULT 0, PRIMARY KEY (mode, key))',
  'CREATE TABLE IF NOT EXISTS aliases (mode TEXT NOT NULL, norm TEXT NOT NULL, key TEXT NOT NULL, name TEXT, PRIMARY KEY (mode, norm))',
  'CREATE TABLE IF NOT EXISTS spend (day TEXT PRIMARY KEY, usd REAL DEFAULT 0, calls INTEGER DEFAULT 0)',
  'CREATE TABLE IF NOT EXISTS ipday (ip TEXT NOT NULL, day TEXT NOT NULL, fresh INTEGER DEFAULT 0, calls INTEGER DEFAULT 0, PRIMARY KEY (ip, day))',
  'CREATE INDEX IF NOT EXISTS ideas_created ON ideas (mode, created)',
  'CREATE INDEX IF NOT EXISTS ideas_uses ON ideas (mode, uses)',
];
let ready = null;
function init(env) {
  if (!ready) ready = env.DB.batch(SCHEMA_SQL.map((q) => env.DB.prepare(q))).catch((e) => { ready = null; throw e; });
  return ready;
}

const day = () => new Date().toISOString().slice(0, 10);

function cors(req) {
  const o = req.headers.get('origin') || '';
  return {
    'access-control-allow-origin': ORIGINS.some((r) => r.test(o)) ? o : 'https://battle-with-ideas.gzowo.fun',
    'access-control-allow-headers': 'content-type',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    vary: 'origin',
  };
}

function json(req, obj, status = 200, extra = {}) {
  return new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', ...cors(req), ...extra } });
}

function keysOf(env) {
  return String(env.ANTHROPIC_API_KEYS || env.ANTHROPIC_API_KEY || '').split(',').map((k) => k.trim()).filter(Boolean);
}

async function haiku(env, mode, text) {
  const M = MODES[mode];
  const keys = keysOf(env);
  let last;
  for (let round = 0; round < 2; round++) {
    for (let i = 0; i < keys.length; i++) {
      const client = new Anthropic({ apiKey: keys[i], maxRetries: 1, timeout: 40000 });
      try {
        const res = await client.messages.create({
          model: MODEL,
          max_tokens: M.max,
          system: [{ type: 'text', text: M.system, cache_control: { type: 'ephemeral' } }],
          messages: [{ role: 'user', content: `The player typed: ${JSON.stringify(String(text).slice(0, 120))}` }],
          thinking: { type: 'disabled' },
          output_config: { effort: 'low', format: { type: 'json_schema', schema: M.schema } },
        });
        if (res.stop_reason === 'refusal') throw Object.assign(new Error('The Idea Engine refused that one. Try something else.'), { code: 'refused' });
        if (res.stop_reason === 'max_tokens') throw Object.assign(new Error('That idea was too big to sculpt. Try a simpler one.'), { code: 'too_big' });
        const txt = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
        const u = res.usage || {};
        const usd = ((u.input_tokens || 0) * PRICE_IN + (u.output_tokens || 0) * PRICE_OUT + (u.cache_read_input_tokens || 0) * PRICE_CACHE + (u.cache_creation_input_tokens || 0) * PRICE_IN * 1.25) / 1e6;
        return { raw: JSON.parse(txt), usd };
      } catch (e) {
        last = e;
        if (e.code) throw e;
        if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError || e instanceof Anthropic.RateLimitError) continue;
        if (e instanceof Anthropic.APIError && e.status >= 500) continue;
        if (e instanceof SyntaxError) throw Object.assign(new Error('The idea came out scrambled. Try again.'), { code: 'parse' });
        throw e;
      }
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw last || new Error('AI unavailable');
}

async function lookup(env, mode, norm) {
  const a = await env.DB.prepare('SELECT key, name FROM aliases WHERE mode = ? AND norm = ?').bind(mode, norm).first();
  if (!a) return null;
  const row = await env.DB.prepare('SELECT recipe, by FROM ideas WHERE mode = ? AND key = ?').bind(mode, a.key).first();
  if (!row) return null;
  const rec = JSON.parse(row.recipe);
  if (a.name) rec.name = a.name;
  return { rec, by: row.by };
}

async function make(req, env) {
  let p;
  try { p = await req.json(); } catch (e) { return json(req, { error: 'bad json' }, 400); }
  const mode = MODES[p.mode] ? p.mode : 'idea';
  const text = String(p.text || '').slice(0, 120).trim();
  const norm = normText(text);
  if (!norm) return json(req, { error: 'Type an idea first.' }, 400);
  const by = String(p.by || 'Thinker').replace(/[<>]/g, '').slice(0, 16) || 'Thinker';
  const ip = req.headers.get('cf-connecting-ip') || 'local';
  const d = day();
  await init(env);
  const hit = await lookup(env, mode, norm);
  if (hit) {
    await env.DB.prepare('UPDATE ideas SET uses = uses + 1 WHERE mode = ? AND key = ?').bind(mode, hit.rec.key).run();
    return json(req, { rec: hit.rec, fresh: false, by: hit.by, source: 'book' });
  }
  if (!keysOf(env).length) return json(req, { error: 'The AI is asleep (no key on the server).', code: 'nokey' }, 503);
  const spent = await env.DB.prepare('SELECT usd FROM spend WHERE day = ?').bind(d).first();
  if (spent && spent.usd >= parseFloat(env.DAILY_USD || '5')) return json(req, { error: 'The world ran out of imagination for today. Ideas from the Book still work!', code: 'budget' }, 429);
  const mine = await env.DB.prepare('SELECT fresh, calls FROM ipday WHERE ip = ? AND day = ?').bind(ip, d).first();
  if (mine && mine.fresh >= parseInt(env.FRESH_PER_IP || '150', 10) && !p.free) return json(req, { error: 'You invented a lot today! New ideas pause until tomorrow, the Book still works.', code: 'ip' }, 429);
  if (mine && mine.calls >= parseInt(env.CALLS_PER_IP || '1500', 10)) return json(req, { error: 'Too many requests today.', code: 'ip' }, 429);
  let out;
  try {
    out = await haiku(env, mode, text);
    if (mode === 'idea' && out.raw && out.raw.kind === 'outfit') {
      const o = await haiku(env, 'outfit', text);
      out.raw.outfit = o.raw.outfit;
      if (Array.isArray(o.raw.parts) && o.raw.parts.length) out.raw.parts = o.raw.parts;
      if (o.raw.blurb) out.raw.blurb = o.raw.blurb;
      out.usd += o.usd;
    }
  }
  catch (e) { console.error('make failed', mode, e.status || '', String(e.message || e).slice(0, 600)); return json(req, { error: e.code ? e.message : 'The Idea Engine hiccuped. Try again.', code: e.code || 'ai' }, 502); }
  const rec = MODES[mode].clean(out.raw, text);
  await env.DB.batch([
    env.DB.prepare('INSERT INTO spend (day, usd, calls) VALUES (?, ?, 1) ON CONFLICT(day) DO UPDATE SET usd = usd + excluded.usd, calls = calls + 1').bind(d, out.usd),
    env.DB.prepare('INSERT INTO ipday (ip, day, fresh, calls) VALUES (?, ?, 1, 1) ON CONFLICT(ip, day) DO UPDATE SET fresh = fresh + 1, calls = calls + 1').bind(ip, d),
  ]);
  const existing = await env.DB.prepare('SELECT recipe, by FROM ideas WHERE mode = ? AND key = ?').bind(mode, rec.key).first();
  if (existing) {
    const old = JSON.parse(existing.recipe);
    old.name = rec.name;
    await env.DB.prepare('INSERT OR IGNORE INTO aliases (mode, norm, key, name) VALUES (?, ?, ?, ?)').bind(mode, norm, rec.key, rec.name).run();
    await env.DB.prepare('UPDATE ideas SET uses = uses + 1 WHERE mode = ? AND key = ?').bind(mode, rec.key).run();
    return json(req, { rec: old, fresh: false, by: existing.by, source: 'world', usd: +out.usd.toFixed(5) });
  }
  await env.DB.batch([
    env.DB.prepare('INSERT OR IGNORE INTO ideas (mode, key, name, en, kind, blurb, recipe, by, created, uses) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)').bind(mode, rec.key, rec.name, rec.en, rec.kind || mode, rec.blurb || '', JSON.stringify(rec), by, Date.now()),
    env.DB.prepare('INSERT OR IGNORE INTO aliases (mode, norm, key, name) VALUES (?, ?, ?, ?)').bind(mode, norm, rec.key, rec.name),
    env.DB.prepare('INSERT OR IGNORE INTO aliases (mode, norm, key, name) VALUES (?, ?, ?, ?)').bind(mode, normText(rec.en), rec.key, rec.en),
  ]);
  return json(req, { rec, fresh: true, by, source: 'ai', usd: +out.usd.toFixed(5) });
}

async function book(req, env, url) {
  await init(env);
  const mode = MODES[url.searchParams.get('mode')] ? url.searchParams.get('mode') : 'idea';
  const q = normText(url.searchParams.get('q') || '');
  const kind = url.searchParams.get('kind') || '';
  const sort = url.searchParams.get('sort') === 'top' ? 'uses DESC' : 'created DESC';
  const limit = Math.min(120, Math.max(1, parseInt(url.searchParams.get('limit') || '60', 10)));
  const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10));
  let sql = 'SELECT key, name, en, kind, blurb, by, created, uses, recipe FROM ideas WHERE mode = ?';
  const args = [mode];
  if (kind) { sql += ' AND kind = ?'; args.push(kind); }
  if (q) { sql += ' AND (lower(name) LIKE ? OR lower(en) LIKE ? OR key LIKE ?)'; args.push(`%${q}%`, `%${q}%`, `%${q.replace(/ /g, '-')}%`); }
  sql += ` ORDER BY ${sort} LIMIT ? OFFSET ?`;
  args.push(limit, offset);
  const { results } = await env.DB.prepare(sql).bind(...args).all();
  const total = await env.DB.prepare('SELECT COUNT(*) AS n FROM ideas WHERE mode = ?').bind(mode).first();
  return json(req, { items: results.map((r) => ({ key: r.key, name: r.name, en: r.en, kind: r.kind, blurb: r.blurb, by: r.by, created: r.created, uses: r.uses, rec: JSON.parse(r.recipe) })), total: total ? total.n : 0 }, 200, { 'cache-control': 'public, max-age=30' });
}

async function names(req, env) {
  await init(env);
  const { results } = await env.DB.prepare("SELECT key, name, en, kind FROM ideas WHERE mode = 'idea' ORDER BY uses DESC LIMIT 3000").all();
  return json(req, { names: results }, 200, { 'cache-control': 'public, max-age=300' });
}

async function importSeed(req, env) {
  if (!env.ADMIN_TOKEN || req.headers.get('authorization') !== 'Bearer ' + env.ADMIN_TOKEN) return json(req, { error: 'no' }, 403);
  await init(env);
  const s = await req.json();
  let n = 0;
  for (const mode of ['idea', 'paint', 'head']) {
    const stmts = [];
    for (const r0 of s[mode] || []) {
      const rec = MODES[mode].clean(r0, r0.name);
      stmts.push(env.DB.prepare('INSERT OR IGNORE INTO ideas (mode, key, name, en, kind, blurb, recipe, by, created, uses) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)').bind(mode, rec.key, rec.name, rec.en, rec.kind || mode, rec.blurb || '', JSON.stringify(rec), r0.by || 'the Book', Date.now()));
      for (const a of new Set([rec.name, rec.en, ...(r0.alias || [])])) stmts.push(env.DB.prepare('INSERT OR IGNORE INTO aliases (mode, norm, key, name) VALUES (?, ?, ?, ?)').bind(mode, normText(a), rec.key, a));
      n++;
    }
    for (let i = 0; i < stmts.length; i += 80) await env.DB.batch(stmts.slice(i, i + 80));
  }
  return json(req, { ok: true, n });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) });
    const path = url.pathname.replace(/\/+$/, '');
    const origin = req.headers.get('origin');
    if (origin && !ORIGINS.some((r) => r.test(origin))) return json(req, { error: 'origin not allowed' }, 403);
    try {
      if (path === '/api/health') {
        await init(env);
        const s = await env.DB.prepare('SELECT usd, calls FROM spend WHERE day = ?').bind(day()).first();
        const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM ideas WHERE mode = 'idea'").first();
        return json(req, { ok: true, haveKey: keysOf(env).length > 0, spent: s ? +s.usd.toFixed(4) : 0, calls: s ? s.calls : 0, budget: parseFloat(env.DAILY_USD || '5'), ideas: n ? n.n : 0 });
      }
      if (path === '/api/make' && req.method === 'POST') return await make(req, env);
      if (path === '/api/book') return await book(req, env, url);
      if (path === '/api/names') return await names(req, env);
      if (path === '/api/import' && req.method === 'POST') return await importSeed(req, env);
      return json(req, { error: 'not found' }, 404);
    } catch (e) {
      return json(req, { error: 'server error: ' + String(e.message || e).slice(0, 200) }, 500);
    }
  },
};
