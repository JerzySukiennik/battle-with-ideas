// Battle with Ideas: boot (renderer, physics, input, audio, particles, Book), main loop and debug handle.

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Renderer } from './engine/renderer.js';
import { Physics } from './engine/physics.js';
import { Input } from './engine/input.js';
import { Audio } from './engine/audio.js';
import { FX } from './engine/fx.js';
import { Music } from './engine/music.js';
import { initMaterials } from './engine/prims.js';
import { IdeaAPI } from './ai/api.js';
import { Game } from './game/game.js';
import { Island } from './game/world.js';
import { HUD } from './ui/hud.js';
import { App } from './ui/menu.js';
import { rememberMine } from './ui/book.js';

const bootS = document.getElementById('boot-s');
const bootErr = document.getElementById('boot-err');
const say = (t) => { bootS.textContent = t; };

async function boot() {
  const canvas = document.getElementById('c');
  say('sharpening pencils');
  const renderer = new Renderer(canvas);
  const pm = new THREE.PMREMGenerator(renderer.r);
  renderer.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  renderer.scene.environmentIntensity = 0.35;
  initMaterials();
  say('waking up physics');
  const physics = await Physics.create();
  const input = new Input(canvas);
  const E = { renderer, physics, input };
  E.audio = new Audio(E);
  E.fx = new FX(E);
  E.music = new Music();
  say('opening the Idea Book');
  const api = new IdeaAPI();
  await Promise.all([api.loadSeed(), E.audio.load(), E.music.init(), Island.loadAssets()]);
  E.audio.preload();
  const game = new Game(E, api);
  game.onDiscover = rememberMine;
  game.hud = new HUD(document.getElementById('hud'), game);
  const app = new App(E, game, api);
  window.BWI = { E, game, app, api, THREE };
  app.start();
  say('compiling shaders');
  await renderer.compile();
  document.getElementById('boot').classList.add('off');
  addEventListener('pointerdown', () => E.audio.resume(), { once: false });
  if (!localStorage.getItem('bwi.storySeen') && !new URLSearchParams(location.search).has('test')) {
    localStorage.setItem('bwi.storySeen', '1');
    app.playStory();
  }
  let last = performance.now();
  let fpsAcc = 0, fpsN = 0;
  const frame = (now) => {
    requestAnimationFrame(frame);
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.1) dt = 0.1;
    fpsAcc += dt; fpsN++;
    if (fpsAcc > 1) { window.BWI.fps = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; }
    try {
      game.update(dt);
      game.hud.update(dt);
      renderer.render(dt);
    } catch (e) {
      console.error(e);
      if (!window.BWI.err) window.BWI.err = e.stack || String(e);
    }
    input.endFrame();
  };
  requestAnimationFrame(frame);
}

boot().catch((e) => {
  console.error(e);
  bootErr.textContent = 'Something broke while starting: ' + (e && e.message ? e.message : e);
});
