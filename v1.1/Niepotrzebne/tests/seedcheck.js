(async () => {
  const g = BWI.game, api = BWI.api;
  BWI.app.startLocal('practice');
  await new Promise(r => setTimeout(r, 500));
  const seen = new Set(), recs = [];
  for (const { rec } of api.index.idea) if (!seen.has(rec.key)) { seen.add(rec.key); recs.push(rec); }
  const kinds = {};
  const errs = [];
  let n = 0;
  for (const rec of recs) {
    kinds[rec.kind] = (kinds[rec.kind] || 0) + 1;
    try {
      g.me.wena = 1e9;
      if (g.me.ghost || !g.me.rag) g.spawnMe(0);
      g.cam.yaw += 0.4;
      g.release(rec, g.ideas.newId(g.me.id), g.cam.aimPoint(30), 1);
      if (g.me.vehicle) { await new Promise(r => setTimeout(r, 150)); g.vehicles.exit(g.me); }
      if (g.me.held && g.me.held.def) { g.weapons.use(g.me); }
      n++;
    } catch (e) { errs.push(rec.key + ': ' + e.message); }
    if (n % 25 === 0) { await new Promise(r => setTimeout(r, 1200)); if (BWI.err) { errs.push('loop: ' + BWI.err.split('\n')[0]); BWI.err = null; } g.ideas.clear((i) => i.owner === g.me.id); g.proj.clear(); }
  }
  await new Promise(r => setTimeout(r, 1500));
  if (BWI.err) errs.push('loop: ' + BWI.err.split('\n')[0]);
  return { total: recs.length, spawned: n, kinds, errs: errs.slice(0, 12), fps: BWI.fps };
})()
