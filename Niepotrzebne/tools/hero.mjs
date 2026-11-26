// Battle with Ideas: hero still for Gzowo Labs (spacesuit Thinker, a painted patch of the island, ideas from the Book).
import { createRequire } from 'node:module';
const require = createRequire('/Users/jurek/openclaw/node_modules/');
const { chromium } = require('playwright-core');
const URL = process.env.URL || 'https://battle-with-ideas.gzowo.fun/?test=1';
const OUT = process.argv[2] || '/tmp/hero';
const IDEAS = (process.env.IDEAS || 'smok:-5:9|jednorozec:3.5:6|maluch:6:11|robot z laserami:-2.5:4').split('|').map((s) => s.split(':'));
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 2 });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(URL, { waitUntil: 'load' });
await page.waitForFunction(() => window.BWI && document.getElementById('boot').classList.contains('off'), null, { timeout: 90000 });
const r = await page.evaluate(async ([IDEAS, process_paint, R]) => {
  const g = BWI.game, api = BWI.app.api, T = BWI.THREE;
  BWI.app.startLocal('practice');
  await new Promise((r) => setTimeout(r, 2500));
  const sk = await import('/src/engine/sketch.js');
  const fit = await api.resolve('skafander', 'outfit', 'x');
  g.wearOutfit(fit.rec.outfit, null, false);
  const me = g.me, p = me.pos(new T.Vector3());
  if (process_paint) {
    const pr = await api.resolve(process_paint, 'paint', 'x');
    g.applyPaint({ by: 'sync', rec: pr.rec, origin: [p.x, p.y, p.z], seed: 7 });
    await new Promise((r) => setTimeout(r, 900));
    g.island.surface = 'normal';
  }
  me.painting = 1e9;
  const f = g.cam.flatForward(new T.Vector3()), rt = new T.Vector3(-f.z, 0, f.x);
  const got = [];
  for (const [name, dx, dz] of IDEAS) {
    try {
      const res = await api.resolve(name, 'idea', 'x');
      const at = p.clone().addScaledVector(f, -dz).addScaledVector(rt, +dx);
      at.y = g.island.heightAt(at.x, at.z) + 0.2;
      g.release(res.rec, g.ideas.newId(me.id), at, 1);
      got.push(res.rec.name);
    } catch (e) { got.push('ERR ' + name); }
  }
  const cpos = p.clone().addScaledVector(f, 4.3).addScaledVector(rt, -1.6); cpos.y = p.y + 0.9;
  const look = p.clone().addScaledVector(f, -2).addScaledVector(rt, 1.2); look.y = p.y + 0.75;
  g.cam.play({ dur: 1e9, hold: true, fn: (k, cam) => {
    cam.position.copy(cpos); cam.lookAt(look);
    if (R > 0) { sk.SKETCH.uOrigin.value.set(p.x - f.x * 3, p.z - f.z * 3); sk.SKETCH.uRadius.value = R; }
  } });
  const canvas = BWI.E.renderer.r.domElement;
  for (const el of document.body.children) if (!el.contains(canvas)) el.style.display = 'none';
  return got;
}, [IDEAS, process.env.PAINT || '', +(process.env.R || 13)]);
console.log('ideas', r.join(', '));
for (let i = 0; i < 4; i++) {
  await page.waitForTimeout(i ? 1800 : 2500);
  await page.screenshot({ path: `${OUT}-${i}.png`, timeout: 90000 });
}
console.log('errors', errs.slice(0, 4));
await browser.close();
