(async () => {
  const g = BWI.game, T = BWI.THREE;
  BWI.app.startLocal('practice');
  await new Promise(r => setTimeout(r, 600));
  for (const i of [...g.ideas.map.values()]) g.ideas.remove(i.id, 'cleared');
  const names = window.GALLERY;
  const recs = [];
  for (const n of names) { try { recs.push((await g.api.resolve(n, 'idea', 'test')).rec); } catch (e) { } }
  const { buildModel } = await import('/src/engine/prims.js');
  const me = g.me.pos();
  const base = new T.Vector3(me.x, 0, me.z);
  const cols = 3, gap = 4.2;
  const center = new T.Vector3();
  recs.forEach((rec, i) => {
    const m = buildModel(rec.parts, Math.min(3.2, Math.max(1.6, rec.size)), {});
    const x = base.x + ((i % cols) - 1) * gap, z = base.z - 5 - Math.floor(i / cols) * gap;
    m.group.position.set(x, g.island.heightAt(x, z), z);
    m.group.rotation.y = 0.5;
    g.E.renderer.scene.add(m.group);
    center.add(m.group.position);
  });
  center.divideScalar(recs.length);
  g.me.puppet.setVisible(false);
  g.cam.play({ dur: 1e9, hold: true, fn: (k, cam) => { cam.position.set(center.x + 1, center.y + 6.5, center.z + 10.5); cam.lookAt(center.x, center.y + 0.8, center.z - 0.5); } });
  return recs.map(r => r.name + ':' + r.parts.length);
})()
