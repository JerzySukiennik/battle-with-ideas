// Battle with Ideas: the idea recipe format shared by the game, the Worker and the seed script (schemas, sanitizer, costs).

export const SHAPES = ['box', 'sphere', 'dome', 'cylinder', 'cone', 'capsule', 'torus', 'pyramid', 'wedge', 'star'];
export const MATS = ['matte', 'shiny', 'metal', 'glow', 'glass'];
export const ANIMS = ['none', 'spin', 'spin_fast', 'bob', 'flap', 'wiggle', 'pulse', 'swing', 'wheel', 'orbit'];
export const KINDS = ['creature', 'vehicle', 'weapon', 'structure', 'disaster', 'projectile', 'spell', 'trap'];
export const MOVES = ['none', 'walk', 'hop', 'fly', 'swim', 'roll', 'slither', 'vortex', 'follow_owner', 'orbit_owner', 'rain', 'burrow', 'projectile', 'teleport', 'dash'];
export const TARGETS = ['nearest_enemy', 'aim_point', 'random', 'owner'];
export const ATTACKS = ['contact', 'bite', 'slam', 'explode', 'shoot', 'lob', 'beam', 'shockwave', 'suck', 'blow', 'freeze', 'burn', 'zap', 'lightning', 'meteor', 'launch', 'stun', 'shrink', 'grow', 'sticky', 'heal_owner', 'shield_owner', 'spawn'];
export const VEHICLES = ['car', 'plane', 'helicopter', 'boat', 'mech', 'mount', 'hover', 'rocket', 'ufo', 'bike', 'board', 'balloon'];
export const WEAPONS = ['melee', 'gun', 'throw', 'beam', 'launcher', 'shield', 'whip', 'wand', 'boomerang', 'flamethrower'];
export const EFFECTS = ['none', 'burn', 'freeze', 'stun', 'launch', 'shrink', 'grow', 'poison', 'sticky', 'slow'];
export const SPELLS = ['gravity', 'scale', 'speed', 'swap', 'teleport', 'slow', 'reverse', 'invisible', 'heal', 'shield', 'slippery', 'dark', 'magnet', 'levitate', 'bighead', 'confetti', 'freeze', 'wind', 'repel', 'lowgrav'];
export const WHO = ['self', 'enemies', 'all', 'nearest', 'team'];
export const PARTICLES = ['none', 'fire', 'smoke', 'sparkle', 'bubbles', 'leaves', 'snow', 'electric', 'water', 'hearts', 'ink', 'stars', 'dust', 'confetti', 'embers', 'rain', 'ash'];
export const SOUNDS = ['none', 'roar', 'growl', 'bark', 'meow', 'chirp', 'buzz', 'moo', 'quack', 'oink', 'neigh', 'hiss', 'engine', 'jet', 'helicopter', 'whoosh', 'wind', 'thunder', 'explosion', 'splash', 'zap', 'laser', 'magic', 'bonk', 'squeak', 'crash', 'bell', 'horn', 'fart', 'pop', 'crunch', 'sizzle', 'rumble', 'boing', 'slurp', 'chomp', 'whistle', 'gunshot', 'sword', 'ghost'];
export const PATTERNS = ['noise', 'stripes', 'checker', 'spots', 'cracks', 'waves', 'grass', 'tiles', 'swirl', 'hex', 'dots', 'marble'];
export const SURFACES = ['normal', 'ice', 'lava', 'bouncy', 'mud', 'water', 'sand', 'conveyor', 'toxic', 'lowgrav', 'speed', 'cloud'];

const PART = {
  type: 'object', additionalProperties: false,
  required: ['s', 'p', 'd', 'r', 'c', 'm', 'a'],
  properties: {
    s: { type: 'string', enum: SHAPES, description: 'primitive shape; dome = half sphere, wedge = triangular prism (ramps, fins, beaks), star = flat 5-point star' },
    p: { type: 'array', items: { type: 'number' }, description: 'center [x,y,z] in model units' },
    d: { type: 'array', items: { type: 'number' }, description: 'full size [width x, height y, depth z] in model units' },
    r: { type: 'array', items: { type: 'number' }, description: 'rotation [x,y,z] in degrees' },
    c: { type: 'string', description: 'color #rrggbb, bold and saturated' },
    m: { type: 'string', enum: MATS },
    a: { type: 'string', enum: ANIMS, description: 'part animation: spin (around its y), spin_fast, bob, flap (wings), wiggle, pulse, swing (legs, tails, arms), wheel (rolls with movement), orbit (circles the model center)' },
  },
};

const ATTACK = {
  type: 'object', additionalProperties: false,
  required: ['type', 'dmg', 'radius', 'range', 'rate', 'kb', 'proj', 'proj_color', 'proj_size', 'spawn'],
  properties: {
    type: { type: 'string', enum: ATTACKS },
    dmg: { type: 'number', description: 'damage per hit, players have 100 hp' },
    radius: { type: 'number', description: 'area radius in meters (0 for single target)' },
    range: { type: 'number', description: 'max distance to target in meters' },
    rate: { type: 'number', description: 'seconds between uses' },
    kb: { type: 'number', description: 'knockback strength 0-30, big numbers send ragdolls flying' },
    proj: { type: 'string', enum: ['none', ...SHAPES], description: 'projectile shape for shoot/lob/meteor' },
    proj_color: { type: 'string' },
    proj_size: { type: 'number', description: 'projectile size in meters' },
    spawn: { type: 'string', description: 'for spawn attacks: english name of the small thing it spawns, else empty' },
  },
};

const SPELL_FX = {
  type: 'object', additionalProperties: false,
  required: ['type', 'who', 'amt', 'dur'],
  properties: {
    type: { type: 'string', enum: SPELLS },
    who: { type: 'string', enum: WHO },
    amt: { type: 'number', description: 'strength: multiplier for gravity/scale/speed/slow (e.g. 0.3 or 2.5), hp for heal/shield, force for wind/magnet/repel/levitate' },
    dur: { type: 'number', description: 'seconds' },
  },
};

export const IDEA_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['key', 'name', 'en', 'blurb', 'kind', 'power', 'size', 'parts', 'particles', 'move', 'hp', 'life', 'count', 'attacks', 'vehicle', 'weapon', 'spell', 'sound'],
  properties: {
    key: { type: 'string', description: "canonical english slug of the concept, lowercase words joined by '-', the same for every language and spelling: 'shark', 'flying-car', 'sharknado'" },
    name: { type: 'string', description: 'display name in the SAME language the player typed (Polish stays Polish), max 28 chars' },
    en: { type: 'string', description: 'english display name, max 28 chars' },
    blurb: { type: 'string', description: 'one short funny english sentence about what it does, max 70 chars' },
    kind: { type: 'string', enum: KINDS },
    power: { type: 'integer', description: '1-10, how game-changing it is. A banana is 1, a shark 4, a tank 7, a black hole 10' },
    size: { type: 'number', description: 'real size of the longest side in meters (player is 1.7 m)' },
    parts: { type: 'array', items: PART, description: '4-16 primitives forming a recognisable, characterful sculpture' },
    particles: { type: 'string', enum: PARTICLES },
    move: {
      type: 'object', additionalProperties: false, required: ['type', 'speed', 'target'],
      properties: { type: { type: 'string', enum: MOVES }, speed: { type: 'number', description: 'm/s, player runs 5' }, target: { type: 'string', enum: TARGETS } },
    },
    hp: { type: 'number', description: 'hit points (pencil shot does 6)' },
    life: { type: 'number', description: 'seconds it lasts, 0 = until destroyed' },
    count: { type: 'integer', description: 'how many appear (a swarm of bees = 8)' },
    attacks: { type: 'array', items: ATTACK, description: '0-3 attacks' },
    vehicle: { anyOf: [{ type: 'object', additionalProperties: false, required: ['type', 'speed', 'fly', 'seats', 'gun'], properties: { type: { type: 'string', enum: VEHICLES }, speed: { type: 'number' }, fly: { type: 'boolean' }, seats: { type: 'integer' }, gun: { type: 'boolean' } } }, { type: 'null' }] },
    weapon: { anyOf: [{ type: 'object', additionalProperties: false, required: ['type', 'dmg', 'rate', 'range', 'kb', 'proj', 'proj_color', 'proj_size', 'effect'], properties: { type: { type: 'string', enum: WEAPONS }, dmg: { type: 'number' }, rate: { type: 'number' }, range: { type: 'number' }, kb: { type: 'number' }, proj: { type: 'string', enum: ['none', ...SHAPES] }, proj_color: { type: 'string' }, proj_size: { type: 'number' }, effect: { type: 'string', enum: EFFECTS } } }, { type: 'null' }] },
    spell: { anyOf: [{ type: 'object', additionalProperties: false, required: ['effects'], properties: { effects: { type: 'array', items: SPELL_FX } } }, { type: 'null' }] },
    sound: { type: 'string', enum: SOUNDS },
  },
};

export const HEAD_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['key', 'name', 'en', 'parts'],
  properties: {
    key: IDEA_SCHEMA.properties.key,
    name: IDEA_SCHEMA.properties.name,
    en: IDEA_SCHEMA.properties.en,
    parts: { type: 'array', items: PART, description: '3-14 primitives forming the head object' },
  },
};

const PROP = {
  type: 'object', additionalProperties: false, required: ['parts', 'size', 'count', 'collide'],
  properties: { parts: { type: 'array', items: PART }, size: { type: 'number' }, count: { type: 'integer' }, collide: { type: 'boolean' } },
};

export const PAINT_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['key', 'name', 'en', 'blurb', 'ground', 'pattern', 'surface', 'cliff', 'obstacles', 'sky', 'fog', 'light', 'particles', 'props', 'landmark'],
  properties: {
    key: IDEA_SCHEMA.properties.key,
    name: IDEA_SCHEMA.properties.name,
    en: IDEA_SCHEMA.properties.en,
    blurb: IDEA_SCHEMA.properties.blurb,
    ground: { type: 'array', items: { type: 'string' }, description: 'two ground colors #rrggbb for the pattern' },
    pattern: { type: 'string', enum: PATTERNS },
    surface: { type: 'string', enum: SURFACES, description: 'how the floor behaves for players' },
    cliff: { type: 'string', description: 'color of the island sides' },
    obstacles: { type: 'string', description: 'color of the blocks and walls' },
    sky: { type: 'string' },
    fog: { type: 'string' },
    light: { type: 'string', description: 'sunlight color' },
    particles: { type: 'string', enum: PARTICLES },
    props: { type: 'array', items: PROP, description: '1-3 kinds of scattered decorations (trees, mushrooms, crystals...)' },
    landmark: { anyOf: [{ type: 'object', additionalProperties: false, required: ['parts', 'size'], properties: { parts: { type: 'array', items: PART }, size: { type: 'number' } } }, { type: 'null' }] },
  },
};

const num = (v, lo, hi, d) => { v = Number(v); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };
const int = (v, lo, hi, d) => Math.round(num(v, lo, hi, d));
const pick = (v, list, d) => (list.includes(v) ? v : d);
const str = (v, n, d = '') => (typeof v === 'string' ? v.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n) : d) || d;
export const hex = (v, d = '#888888') => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v.trim()) ? v.trim().toLowerCase() : (typeof v === 'string' && /^#[0-9a-fA-F]{3}$/.test(v.trim()) ? '#' + v.trim().slice(1).split('').map((c) => c + c).join('').toLowerCase() : d));
const vec = (v, lo, hi, d) => { const a = Array.isArray(v) ? v : []; return [0, 1, 2].map((i) => num(a[i], lo, hi, d[i])); };
export const slug = (v) => String(v || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'thing';

export function normText(t) {
  return String(t || '').toLowerCase().replace(/ł/g, 'l').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
}

function parts(list, max = 16) {
  const out = [];
  for (const p of Array.isArray(list) ? list : []) {
    if (out.length >= max) break;
    if (!p || typeof p !== 'object') continue;
    const d = vec(p.d, 0.02, 2.4, [0.5, 0.5, 0.5]);
    out.push({ s: pick(p.s, SHAPES, 'box'), p: vec(p.p, -1.4, 2.6, [0, 1, 0]), d, r: vec(p.r, -360, 360, [0, 0, 0]), c: hex(p.c, '#9a9a9a'), m: pick(p.m, MATS, 'matte'), a: pick(p.a, ANIMS, 'none') });
  }
  if (!out.length) out.push({ s: 'sphere', p: [0, 1, 0], d: [1.6, 1.6, 1.6], r: [0, 0, 0], c: '#ffd23f', m: 'shiny', a: 'bob' });
  return out;
}

const KIND_SIZE = { creature: [0.2, 12], vehicle: [1.2, 12], weapon: [0.3, 3], structure: [0.6, 14], disaster: [2, 18], projectile: [0.2, 4], spell: [0.3, 3], trap: [0.3, 5] };

export function sanitizeIdea(raw, text = '') {
  const r = raw && typeof raw === 'object' ? raw : {};
  const kind = pick(r.kind, KINDS, 'creature');
  const power = int(r.power, 1, 10, 4);
  const [smin, smax] = KIND_SIZE[kind];
  const out = {
    v: 1,
    key: slug(r.key || r.en || text),
    name: str(r.name, 28, str(text, 28, 'Idea')),
    en: str(r.en, 28, str(r.name, 28, 'Idea')),
    blurb: str(r.blurb, 90, ''),
    kind, power,
    size: num(r.size, smin, smax, Math.min(smax, Math.max(smin, 1.5))),
    parts: parts(r.parts),
    particles: pick(r.particles, PARTICLES, 'none'),
    move: { type: pick(r.move && r.move.type, MOVES, 'none'), speed: num(r.move && r.move.speed, 0, 26, 3), target: pick(r.move && r.move.target, TARGETS, 'nearest_enemy') },
    hp: num(r.hp, 1, 20 + power * 40, 30),
    life: num(r.life, 0, 60, 0),
    count: int(r.count, 1, 12, 1),
    attacks: [],
    vehicle: null, weapon: null, spell: null,
    sound: pick(r.sound, SOUNDS, 'none'),
  };
  const dmgCap = 6 + power * 7, radCap = 2 + power * 1.2, kbCap = 4 + power * 2.2;
  for (const a of (Array.isArray(r.attacks) ? r.attacks : []).slice(0, 3)) {
    if (!a || typeof a !== 'object') continue;
    out.attacks.push({
      type: pick(a.type, ATTACKS, 'contact'),
      dmg: num(a.dmg, 0, dmgCap, Math.min(dmgCap, 10)),
      radius: num(a.radius, 0, radCap, 0),
      range: num(a.range, 0.5, 60, 3),
      rate: num(a.rate, 0.25, 12, 1.5),
      kb: num(a.kb, 0, kbCap, 4),
      proj: pick(a.proj, ['none', ...SHAPES], 'sphere'),
      proj_color: hex(a.proj_color, '#ffd23f'),
      proj_size: num(a.proj_size, 0.08, 2.5, 0.3),
      spawn: str(a.spawn, 32, ''),
    });
  }
  if (r.vehicle && typeof r.vehicle === 'object') {
    const v = r.vehicle;
    out.vehicle = { type: pick(v.type, VEHICLES, 'car'), speed: num(v.speed, 4, 48, 18), fly: !!v.fly, seats: int(v.seats, 1, 4, 2), gun: !!v.gun };
    if (['plane', 'helicopter', 'rocket', 'ufo', 'balloon'].includes(out.vehicle.type)) out.vehicle.fly = true;
  }
  if (r.weapon && typeof r.weapon === 'object') {
    const w = r.weapon;
    out.weapon = { type: pick(w.type, WEAPONS, 'melee'), dmg: num(w.dmg, 1, 8 + power * 4, 10), rate: num(w.rate, 0.15, 4, 0.6), range: num(w.range, 1, 50, 3), kb: num(w.kb, 0, kbCap, 5), proj: pick(w.proj, ['none', ...SHAPES], 'sphere'), proj_color: hex(w.proj_color, '#ffd23f'), proj_size: num(w.proj_size, 0.06, 1.5, 0.2), effect: pick(w.effect, EFFECTS, 'none') };
  }
  if (r.spell && typeof r.spell === 'object') {
    const fx = [];
    for (const e of (Array.isArray(r.spell.effects) ? r.spell.effects : []).slice(0, 3)) {
      if (!e || typeof e !== 'object') continue;
      fx.push({ type: pick(e.type, SPELLS, 'confetti'), who: pick(e.who, WHO, 'enemies'), amt: num(e.amt, -6, 60, 1), dur: num(e.dur, 0, 4 + power * 1.6, 6) });
    }
    out.spell = { effects: fx.length ? fx : [{ type: 'confetti', who: 'all', amt: 1, dur: 3 }] };
  }
  if (kind === 'vehicle' && !out.vehicle) out.vehicle = { type: 'car', speed: 18, fly: false, seats: 2, gun: false };
  if (kind === 'weapon' && !out.weapon) out.weapon = { type: 'melee', dmg: 10, rate: 0.6, range: 2.5, kb: 6, proj: 'none', proj_color: '#ffd23f', proj_size: 0.2, effect: 'none' };
  if (kind === 'spell' && !out.spell) out.spell = { effects: [{ type: 'confetti', who: 'all', amt: 1, dur: 3 }] };
  if (kind === 'disaster') out.life = num(out.life || 10, 3, 4 + power * 1.3, 10);
  if (kind === 'projectile') { out.life = num(out.life || 5, 1, 8, 5); if (out.move.type === 'none') out.move.type = 'projectile'; out.move.speed = Math.max(out.move.speed, 10); }
  if (kind === 'weapon' || kind === 'structure' || kind === 'vehicle') out.life = 0;
  if (kind === 'creature' && !out.life) out.life = 45;
  if (kind === 'trap' && !out.life) out.life = 60;
  if (out.count > 1) out.hp = Math.max(1, out.hp / Math.sqrt(out.count));
  return out;
}

export function sanitizeHead(raw, text = '') {
  const r = raw && typeof raw === 'object' ? raw : {};
  return { v: 1, key: slug(r.key || r.en || text), name: str(r.name, 28, str(text, 28, 'Head')), en: str(r.en, 28, 'Head'), parts: parts(r.parts, 14) };
}

export function sanitizePaint(raw, text = '') {
  const r = raw && typeof raw === 'object' ? raw : {};
  const g = Array.isArray(r.ground) ? r.ground : [];
  const props = [];
  for (const p of (Array.isArray(r.props) ? r.props : []).slice(0, 3)) {
    if (!p || typeof p !== 'object') continue;
    props.push({ parts: parts(p.parts, 10), size: num(p.size, 0.3, 9, 2), count: int(p.count, 0, 36, 12), collide: !!p.collide });
  }
  const lm = r.landmark && typeof r.landmark === 'object' ? { parts: parts(r.landmark.parts, 16), size: num(r.landmark.size, 3, 22, 10) } : null;
  return {
    v: 1, key: slug(r.key || r.en || text), name: str(r.name, 28, str(text, 28, 'World')), en: str(r.en, 28, 'World'), blurb: str(r.blurb, 90, ''),
    ground: [hex(g[0], '#c8e6a0'), hex(g[1], '#9fd17a')], pattern: pick(r.pattern, PATTERNS, 'noise'), surface: pick(r.surface, SURFACES, 'normal'),
    cliff: hex(r.cliff, '#a08060'), obstacles: hex(r.obstacles, '#b8b8b8'), sky: hex(r.sky, '#bfe3ff'), fog: hex(r.fog, '#dfeefa'), light: hex(r.light, '#fff4e0'),
    particles: pick(r.particles, PARTICLES, 'none'), props, landmark: lm,
  };
}

export function ideaCost(rec, uses = 0) {
  if (!rec) return 0;
  let c = 8 + rec.power * 8;
  if (rec.kind === 'weapon') c += 8;
  if (rec.kind === 'structure') c -= 6;
  if (rec.kind === 'spell') c -= 2;
  c = Math.round(c * (1 + 0.45 * uses));
  return Math.max(6, Math.min(100, c));
}

export const PAINT_COST = 70;
