// Battle with Ideas: headless Chrome (real GPU via ANGLE/Metal) screenshot + console harness.
// node shot.mjs <out.png> [setupJS] [waitMs] [width] [height]
import { createRequire } from 'node:module';
const require = createRequire('/Users/jurek/openclaw/node_modules/');
const { chromium } = require('playwright-core');

const [out = 'shot.png', setup = '', wait = '3000', w = '1280', h = '720'] = process.argv.slice(2);
const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack || ''}`));
await page.goto(process.env.URL || 'http://127.0.0.1:8963/?test=1', { waitUntil: 'load' });
try { await page.waitForFunction(() => window.BWI && document.getElementById('boot').classList.contains('off') || document.getElementById('boot-err').textContent, null, { timeout: 60000 }); }
catch (e) { logs.push('[harness] boot timeout'); }
const err = await page.evaluate(() => document.getElementById('boot-err').textContent);
if (err) logs.push('[boot-err] ' + err);
if (setup) {
  for (const step of setup.split('|||')) {
    try { const r = await page.evaluate(step); if (r !== undefined) logs.push('[setup] ' + JSON.stringify(r).slice(0, 1500)); } catch (e) { logs.push('[setup error] ' + e.message); }
    await page.waitForTimeout(+(process.env.STEP || 400));
  }
}
await page.waitForTimeout(+wait);
const info = await page.evaluate(() => ({ fps: window.BWI && window.BWI.fps, err: window.BWI && window.BWI.err, calls: window.BWI && window.BWI.E.renderer.r.info.render.calls, tris: window.BWI && window.BWI.E.renderer.r.info.render.triangles }));
logs.push('[info] ' + JSON.stringify(info));
await page.screenshot({ path: out });
console.log(logs.slice(-60).join('\n'));
await browser.close();
