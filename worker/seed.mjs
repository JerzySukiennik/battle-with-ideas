// Battle with Ideas: Haiku agents brainstorm hundreds of ideas in parallel and sculpt each one into the starting Idea Book (data/seed.json).
// Run: keys run anthropic -- node worker/seed.mjs [count]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import { IDEA_SCHEMA, PAINT_SCHEMA, HEAD_SCHEMA, sanitizeIdea, sanitizePaint, sanitizeHead, normText } from '../src/shared/recipe.js';
import { IDEA_SYSTEM, PAINT_SYSTEM, HEAD_SYSTEM, SEED_LIST_SYSTEM } from './src/prompt.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, '..', 'data', 'seed.json');
const MODEL = 'claude-haiku-5-5';
const WANT = parseInt(process.argv[2] || '500', 10);
const KEYS = (process.env.ANTHROPIC_API_KEYS || process.env.ANTHROPIC_API_KEY || '').split(',').filter(Boolean);
if (!KEYS.length) { console.error('No ANTHROPIC key in env. Use: keys run anthropic -- node worker/seed.mjs'); process.exit(1); }
const clients = KEYS.map((k) => new Anthropic({ apiKey: k, maxRetries: 3, timeout: 60000 }));
let usd = 0, calls = 0;

const CATEGORIES = [
  'animals and monsters (real and mythical)', 'vehicles of every kind, including silly ones', 'weapons, and silly everyday objects used as weapons',
  'buildings, walls, towers, turrets and traps', 'natural disasters and crazy weather', 'food that fights or explodes',
  'magic spells, curses and wizard tricks', 'space, robots and science fiction', 'everyday household objects and school things',
  'internet humour and absurd memes (no real people, no brands)', 'Polish things: food, cars, animals, places, school life (in Polish)',
  'COMBINATIONS of two very different things, like "tornado z rekinami" or "latający maluch"', 'MORE combinations: animal + weapon, food + vehicle, disaster + animal',
];

async function call(system, user, schema, max = 3500, tries = 3) {
  for (let t = 0; t < tries; t++) {
    const client = clients[(calls + t) % clients.length];
    try {
      calls++;
      const res = await client.messages.create({
        model: MODEL, max_tokens: max,
        system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: user }],
        thinking: { type: 'disabled' },
        output_config: { effort: 'low', format: { type: 'json_schema', schema } },
      });
      const u = res.usage || {};
      usd += ((u.input_tokens || 0) * 0.10 + (u.output_tokens || 0) * 0.50 + (u.cache_read_input_tokens || 0) * 0.01 + (u.cache_creation_input_tokens || 0) * 0.125) / 1e6;
      if (res.stop_reason === 'refusal' || res.stop_reason === 'max_tokens') continue;
      return JSON.parse(res.content.filter((b) => b.type === 'text').map((b) => b.text).join(''));
    } catch (e) {
      if (e instanceof Anthropic.RateLimitError) { await new Promise((r) => setTimeout(r, 4000 * (t + 1))); continue; }
      if (e instanceof Anthropic.APIError && e.status >= 500) { await new Promise((r) => setTimeout(r, 2000)); continue; }
      if (e instanceof SyntaxError) continue;
      throw e;
    }
  }
  return null;
}

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0, done = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) {
      const k = i++;
      try { out[k] = await fn(items[k], k); } catch (e) { out[k] = null; }
      done++;
      if (done % 25 === 0) process.stdout.write(`  ${done}/${items.length} ($${usd.toFixed(3)})\n`);
    }
  }));
  return out;
}

const LIST_SCHEMA = { type: 'object', additionalProperties: false, required: ['ideas'], properties: { ideas: { type: 'array', items: { type: 'string' } } } };

console.log(`Brainstorm: ${CATEGORIES.length} agents...`);
const per = Math.ceil((WANT * 1.15) / CATEGORIES.length);
const lists = await pool(CATEGORIES, CATEGORIES.length, (cat) => call(SEED_LIST_SYSTEM, `Category: ${cat}. Give ${per} entries.`, LIST_SCHEMA, 4000));
const seen = new Set();
const phrases = [];
for (const l of lists) for (const t of (l && l.ideas) || []) { const n = normText(t); if (n && !seen.has(n) && t.length <= 40) { seen.add(n); phrases.push(t.trim()); } }
for (const must of ['rekin', 'shark', 'tornado z rekinami', 'latający samochód', 'flying car', 'smok', 'dragon', 'banan', 'czarna dziura', 'meteor', 'kot z laserami', 'pierogi', 'maluch', 'ściana', 'trampolina', 'miecz', 'patelnia', 'tornado', 'wulkan', 'pszczoły']) if (!seen.has(normText(must))) { seen.add(normText(must)); phrases.unshift(must); }
const pick = phrases.slice(0, WANT);
console.log(`${phrases.length} unique ideas brainstormed, sculpting ${pick.length} with 10 parallel agents...`);

const recs = await pool(pick, 10, async (t) => {
  const raw = await call(IDEA_SYSTEM, `The player typed: ${JSON.stringify(t)}`, IDEA_SCHEMA);
  return raw ? { text: t, rec: sanitizeIdea(raw, t) } : null;
});
const byKey = new Map();
for (const r of recs) {
  if (!r) continue;
  const cur = byKey.get(r.rec.key);
  if (cur) { cur.alias.push(r.text); continue; }
  byKey.set(r.rec.key, { ...r.rec, by: 'the Book', alias: [r.text] });
}

const PAINTS = ['lava world', 'zimowa kraina', 'candy land', 'dżungla', 'moon base', 'pustynia', 'underwater city', 'bouncy castle', 'toxic swamp', 'cloud kingdom', 'szkoła', 'rainbow road'];
const HEADS = ['pizza', 'kaktus', 'old TV', 'pumpkin', 'kalafior', 'lightbulb', 'rubber duck', 'donut', 'rocket', 'cube', 'kapusta', 'goldfish bowl', 'traffic cone', 'cupcake', 'robot head', 'disco ball', 'jajko', 'cheese', 'cloud', 'skull'];
console.log('Painting worlds and heads...');
const paints = (await pool(PAINTS, 6, async (t) => { const raw = await call(PAINT_SYSTEM, `The player typed: ${JSON.stringify(t)}`, PAINT_SCHEMA, 4000); return raw ? { ...sanitizePaint(raw, t), by: 'the Book', alias: [t] } : null; })).filter(Boolean);
const heads = (await pool(HEADS, 8, async (t) => { const raw = await call(HEAD_SYSTEM, `The player typed: ${JSON.stringify(t)}`, HEAD_SCHEMA, 2000); return raw ? { ...sanitizeHead(raw, t), by: 'the Book', alias: [t] } : null; })).filter(Boolean);

const out = { made: new Date().toISOString(), idea: [...byKey.values()], paint: paints, head: heads };
fs.writeFileSync(OUT, JSON.stringify(out));
const kinds = {};
for (const r of out.idea) kinds[r.kind] = (kinds[r.kind] || 0) + 1;
console.log(`Done: ${out.idea.length} ideas, ${paints.length} worlds, ${heads.length} heads, ${calls} calls, $${usd.toFixed(3)}. Kinds: ${JSON.stringify(kinds)}`);
console.log(`Wrote ${OUT} (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB)`);
