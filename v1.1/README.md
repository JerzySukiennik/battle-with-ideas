# Battle with Ideas

The world went grey: the Great Boredom erased every idea. You are a Thinker, one of the last people with Wena (the spark of ideas). Type anything, in Polish or English, and it becomes real in the arena: a shark, a flying car you can drive, a tornado full of sharks, a frying pan, gravity flipped upside down. Then use it to knock your friends off a floating paper island, or defend the last Spark from ten waves of Boredom together.

## Modes
- **Defend the Spark** (co-op, 1-6 players): ten waves of the Great Boredom (Yawnlings, Paperwork, Rubber Stamps, Concrete Brutes) with bosses Monday, The Pop Quiz, The Endless Queue and The Great Boredom itself.
- **Thinkers' Tournament** (online, 2-6 players): free for all or two teams, last one standing, first to 3 rounds. Knocked-out players become ghosts who can still cast tiny ideas. After 95 s grey fog eats the island.
- **Practice**: training dummies that never hit back.

## How ideas work
Press `Enter` and type. The text goes to the Idea Engine (Claude Haiku 5.5 behind a Cloudflare Worker), which answers with a recipe: a sculpture made of primitives, what kind of thing it is (creature, vehicle, weapon, structure, disaster, projectile, spell, trap), how it moves and attacks, its power and sound. The game builds and runs it on the spot. Every recipe is stored in the world Idea Book (Cloudflare D1), so the same idea typed again, in any language or spelling, appears instantly, and the first Thinker to imagine it is credited. Combinations are written as words ("tornado z rekinami"). `P` paints the whole island with a new world (lava, ice, candy land...) that changes how the floor behaves.

Wena (mana) refills by itself; ideas cost Wena by power, an idea nobody in the world has thought of yet is free the first time, and repeating the same idea in a match gets more expensive and greyer.

## Controls
`WASD` run, `Shift` sprint, `Space` jump, click pencil or weapon, right click shove, `E` grab, throw or ride, `F` drop weapon, `Enter` idea, `P` paint the world, `1-5` recent ideas, `H` help, `Esc` menu.

## Tech
- three.js + Rapier (ES modules from CDN, no build). Always-wobbly active ragdolls (PD muscles, balance springs).
- Multiplayer: Firebase RTDB (shared `gzowos-games`, blocks `battleIdeas` and `battleIdeasTest`) for lobby, presence and WebRTC signalling; game state over a WebRTC mesh, with an RTDB relay when peer-to-peer fails. Each player simulates their own body and ideas; the room host runs rounds, waves and the Boredom.
- AI: `worker/` (Cloudflare Worker + D1), Anthropic SDK, structured outputs with the schemas in `src/shared/recipe.js`. The key lives only in the Worker secret. Daily budget 5 USD, 150 new ideas per connection per day.
- Starting Idea Book: `data/seed.json`, made by parallel Haiku agents (`worker/seed.mjs`).

## Run locally
```
python3 Niepotrzebne/devserver.py 8963
cd worker && npx wrangler dev --port 8964 --local --persist-to ../Niepotrzebne/.wrangler-state
```
The Worker reads `ANTHROPIC_API_KEY(S)` from `worker/.dev.vars` (not in git). Open `http://127.0.0.1:8963/`. Add `?realm=test` to use the test database block.

## Deploy
1. `cd worker && npx wrangler d1 create bwi-book`, put the id in `wrangler.toml`.
2. `npx wrangler secret put ANTHROPIC_API_KEYS` and `npx wrangler secret put ADMIN_TOKEN`, then `npx wrangler deploy`.
3. Import the starting Book: `POST /api/import` with `Authorization: Bearer <ADMIN_TOKEN>` and `data/seed.json` as the body.
4. GitHub Pages serves the root; `CNAME` is `battle-with-ideas.gzowo.fun`.

## Sounds
`assets/sfx/` was rendered with earshot: new takes of public-domain recordings and a few recipes built from them, free to use without credit.
