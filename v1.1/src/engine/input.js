// Battle with Ideas: keyboard, mouse and pointer lock, with a typing mode that keeps the last movement.

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();
    this.mouse = { dx: 0, dy: 0, l: false, r: false, lp: false, rp: false, wheel: 0 };
    this.locked = false;
    this.typing = false;
    this.latched = { x: 0, z: 0, sprint: false };
    this.sens = parseFloat(localStorage.getItem('bwi.sens') || '1');
    this.enabled = true;
    this.onKey = null;
    addEventListener('keydown', (e) => {
      if (this.onKey && this.onKey(e)) return;
      if (this.typing || !this.enabled) return;
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if (!e.repeat) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (['Space', 'Tab', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => { this.keys.delete(e.code); });
    addEventListener('blur', () => { this.keys.clear(); this.mouse.l = this.mouse.r = false; });
    canvas.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      if (!this.locked && !this.typing) { this.lock(); return; }
      if (e.button === 0) { this.mouse.l = true; this.mouse.lp = true; }
      if (e.button === 2) { this.mouse.r = true; this.mouse.rp = true; }
    });
    addEventListener('mouseup', (e) => { if (e.button === 0) this.mouse.l = false; if (e.button === 2) this.mouse.r = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouse.dx += e.movementX * this.sens;
      this.mouse.dy += e.movementY * this.sens;
    });
    addEventListener('wheel', (e) => { this.mouse.wheel += Math.sign(e.deltaY); }, { passive: true });
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === this.canvas; });
  }

  lock() {
    const plain = () => { try { const q = this.canvas.requestPointerLock(); if (q && q.catch) q.catch(() => {}); } catch (e) { } };
    try { const p = this.canvas.requestPointerLock({ unadjustedMovement: true }); if (p && p.catch) p.catch(plain); } catch (e) { plain(); }
  }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }

  down(code) { return this.keys.has(code); }
  hit(code) { return this.pressed.has(code); }

  move() {
    if (this.typing) return this.latched;
    const x = (this.down('KeyD') ? 1 : 0) - (this.down('KeyA') ? 1 : 0);
    const z = (this.down('KeyW') ? 1 : 0) - (this.down('KeyS') ? 1 : 0);
    const sprint = this.down('ShiftLeft') || this.down('ShiftRight');
    this.latched = { x, z, sprint };
    return this.latched;
  }

  startTyping() {
    this.move();
    this.typing = true;
    this.keys.clear();
    this.mouse.l = this.mouse.r = false;
  }

  stopTyping() { this.typing = false; }

  endFrame() {
    this.pressed.clear();
    this.mouse.dx = 0; this.mouse.dy = 0; this.mouse.lp = false; this.mouse.rp = false; this.mouse.wheel = 0;
  }
}
