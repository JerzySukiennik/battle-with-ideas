// Battle with Ideas: third-person shoulder camera with wall avoidance and scripted cinematic shots.

import * as THREE from 'three';
import { GR } from '../engine/physics.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();

export class CameraRig {
  constructor(E) {
    this.E = E;
    this.cam = E.renderer.camera;
    this.yaw = Math.PI;
    this.pitch = -0.18;
    this.dist = 5.4;
    this.want = 5.4;
    this.focus = new THREE.Vector3(0, 2, 0);
    this.shoulder = 0.62;
    this.cine = null;
    this.fovBase = 62;
    this.fovKick = 0;
  }

  look(dx, dy) {
    this.yaw -= dx * 0.0024;
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy * 0.0021, -1.25, 0.95);
  }

  zoom(w) { this.want = THREE.MathUtils.clamp(this.want + w * 0.6, 2.6, 11); }

  forward(out = new THREE.Vector3()) { return out.set(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch)).normalize(); }
  flatForward(out = new THREE.Vector3()) { return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }
  right(out = new THREE.Vector3()) { return out.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw)); }

  aimPoint(maxD = 80) {
    const c = this.cam.position, f = this.forward(_v2);
    const h = this.E.physics.ray(c.x, c.y, c.z, f.x, f.y, f.z, maxD, GR.rayWorld);
    return h ? new THREE.Vector3(h.x, h.y, h.z) : c.clone().addScaledVector(f, maxD);
  }

  play(shot) { this.cine = { t: 0, ...shot }; }
  stop() { this.cine = null; }

  update(dt, target, extra = 0) {
    if (this.cine) {
      const c = this.cine;
      c.t += dt;
      const k = Math.min(1, c.t / c.dur);
      c.fn(k, this.cam, dt);
      if (k >= 1 && !c.hold) { const done = c.done; this.cine = null; if (done) done(); }
      this.cam.fov += (this.fovBase - this.cam.fov) * Math.min(1, dt * 3);
      this.cam.updateProjectionMatrix();
      return;
    }
    this.focus.lerp(target, 1 - Math.exp(-dt * 14));
    this.dist += (this.want + extra - this.dist) * Math.min(1, dt * 5);
    const f = this.forward(_v);
    const r = this.right(_v2);
    const pivot = this.focus.clone().addScaledVector(r, this.shoulder);
    const back = f.clone().multiplyScalar(-1);
    const h = this.E.physics.ray(pivot.x, pivot.y, pivot.z, back.x, back.y, back.z, this.dist + 0.3, GR.rayStatic);
    const d = h ? Math.max(0.6, h.t - 0.3) : this.dist;
    this.cam.position.copy(pivot).addScaledVector(back, d);
    if (this.cam.position.y < -30) this.cam.position.y = -30;
    this.cam.lookAt(pivot.addScaledVector(f, 4));
    this.fovKick *= Math.exp(-dt * 4);
    const fov = this.fovBase + this.fovKick;
    if (Math.abs(this.cam.fov - fov) > 0.01) { this.cam.fov = fov; this.cam.updateProjectionMatrix(); }
  }
}
