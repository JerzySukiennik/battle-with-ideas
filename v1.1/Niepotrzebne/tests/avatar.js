(async () => {
  const g = BWI.game, I = BWI.E.input;
  BWI.app.startLocal('practice');
  await new Promise(r => setTimeout(r, 900));
  g.cam.dist = g.cam.want = 3.2; g.cam.pitch = -0.12; g.cam.yaw += 2.6;
  I.keys.add('KeyW');
  await new Promise(r => setTimeout(r, 450));
  I.keys.delete('KeyW');
  return 1;
})()
