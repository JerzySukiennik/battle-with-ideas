// Battle with Ideas: two real sessions play a free-for-all round to a KO, plus co-op start, on the test realm.
import { createRequire } from 'node:module';
const require = createRequire('/Users/jurek/openclaw/node_modules/');
const { chromium } = require('playwright-core');
const URL = 'http://127.0.0.1:8963/?test=1&realm=test';
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal', '--disable-features=WebRtcHideLocalIpsWithMdns'] });
const mk = async (name) => { const ctx = await browser.newContext({ viewport: { width: 900, height: 520 } }); const p = await ctx.newPage(); p.on('pageerror', (e) => { if (!/pointer lock/.test(e.message)) console.log(`[${name}] ${e.message}`); }); await p.goto(URL); await p.waitForFunction(() => window.BWI && document.getElementById('boot').classList.contains('off'), null, { timeout: 60000 }); await p.evaluate((n) => { BWI.app.profile.name = n; BWI.game.me.name = n; }, name); return p; };
const ok = (c, m) => console.log((c ? 'PASS ' : 'FAIL ') + m);
const A = await mk('Ala'), B = await mk('Bob');
const mode = process.argv[2] || 'ffa';
const code = await A.evaluate(async (m) => { await BWI.app.createRoom(m, true); return BWI.app.session.code; }, mode);
await B.evaluate(async (c) => { await BWI.app.joinRoom(c); }, code);
await A.waitForTimeout(3000);
await A.evaluate(() => BWI.app.session.start());
if (mode !== 'coop') {
  await A.waitForTimeout(8000);
  const s1 = await Promise.all([A, B].map((P) => P.evaluate(() => ({ st: BWI.game.mode.st, n: BWI.game.mode.n, alive: [...BWI.game.mode.alive].length, ghost: BWI.game.me.ghost }))));
  console.log(JSON.stringify(s1));
  ok(s1.every((s) => s.st === 'play' && s.n === 1 && s.alive === 2), 'round 1 playing on both');
  await B.evaluate(() => BWI.game.me.ko(null));
  await A.waitForTimeout(2500);
  const s2 = await Promise.all([A, B].map((P) => P.evaluate(() => ({ st: BWI.game.mode.st, wins: BWI.game.mode.wins, ghost: BWI.game.me.ghost, myId: BWI.game.myId }))));
  console.log(JSON.stringify(s2));
  ok(s2[0].st === 'end' && s2[1].st === 'end' && (s2[0].wins[s2[0].myId] === 1), 'Ala wins round 1, both see end');
  ok(s2[1].ghost === true, 'Bob became a ghost');
  await A.waitForTimeout(9000);
  const s3 = await Promise.all([A, B].map((P) => P.evaluate(() => ({ st: BWI.game.mode.st, n: BWI.game.mode.n, ghost: BWI.game.me.ghost }))));
  console.log(JSON.stringify(s3));
  ok(s3.every((s) => s.n === 2 && !s.ghost), 'round 2 started, both alive again');
} else {
  await A.waitForTimeout(9000);
  const s = await Promise.all([A, B].map((P) => P.evaluate(() => ({ st: BWI.game.mode.st, wave: BWI.game.mode.wave, spark: [...BWI.game.ideas.map.values()].filter((i) => i.owner === 'spark').length, nuda: [...BWI.game.ideas.map.values()].filter((i) => i.owner === 'nuda').length }))));
  console.log(JSON.stringify(s));
  ok(s.every((x) => x.spark === 1), 'both see the Spark');
  await A.evaluate(() => { BWI.game.mode.until = BWI.game.mode.now(); });
  await A.waitForTimeout(6000);
  const t = await Promise.all([A, B].map((P) => P.evaluate(() => ({ st: BWI.game.mode.st, wave: BWI.game.mode.wave, nuda: [...BWI.game.ideas.map.values()].filter((i) => i.owner === 'nuda').length }))));
  console.log(JSON.stringify(t));
  ok(t.every((x) => x.st === 'wave' && x.wave === 1 && x.nuda > 0), 'wave 1 with Boredom on both');
  await B.screenshot({ path: 'Niepotrzebne/tests/out/mp-coop-b.png' });
}
await A.evaluate(() => BWI.app.toMenu()); await B.evaluate(() => BWI.app.toMenu());
await A.waitForTimeout(1500);
await browser.close();
