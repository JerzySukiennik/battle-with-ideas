// Battle with Ideas: Rapier world, collision groups, fixed-step stepping and query helpers.

import RAPIER from 'rapier';

export const G = { STATIC: 1, SELF: 2, PROXY: 4, IDEA: 8, DEBRIS: 16, LEGS: 32, ALL: 0xffff };
export const groups = (member, filter) => ((member & 0xffff) << 16) | (filter & 0xffff);

export const GR = {
  static: groups(G.STATIC, G.ALL),
  self: groups(G.SELF, G.STATIC | G.PROXY | G.IDEA | G.DEBRIS),
  legsUp: groups(G.LEGS, G.PROXY | G.IDEA | G.DEBRIS),
  legsDown: groups(G.LEGS, G.STATIC | G.PROXY | G.IDEA | G.DEBRIS),
  proxy: groups(G.PROXY, G.SELF | G.LEGS | G.IDEA),
  idea: groups(G.IDEA, G.STATIC | G.SELF | G.LEGS | G.PROXY | G.IDEA | G.DEBRIS),
  ideaGhost: groups(G.IDEA, G.STATIC),
  debris: groups(G.DEBRIS, G.STATIC | G.SELF | G.LEGS | G.IDEA | G.DEBRIS),
  rayGround: groups(G.ALL, G.STATIC | G.IDEA | G.PROXY),
  rayStatic: groups(G.ALL, G.STATIC),
  rayWorld: groups(G.ALL, G.STATIC | G.IDEA),
};

export class Physics {
  static async create() {
    await RAPIER.init();
    return new Physics();
  }

  constructor() {
    this.R = RAPIER;
    this.world = new RAPIER.World({ x: 0, y: -18, z: 0 });
    this.world.timestep = 1 / 60;
    this.world.numSolverIterations = 6;
    this.dt = 1 / 60;
    this.acc = 0;
    this.statics = [];
    this.beforeStep = [];
    this._ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
  }

  addStaticBox(x, y, z, hx, hy, hz, q = null, friction = 0.8, list = this.statics) {
    const d = RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z).setFriction(friction).setRestitution(0.05).setCollisionGroups(GR.static);
    if (q) d.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
    const c = this.world.createCollider(d);
    list.push(c);
    return c;
  }

  removeColliders(list) {
    for (const c of list) { try { this.world.removeCollider(c, true); } catch (e) { /* already gone */ } }
    list.length = 0;
  }

  removeBody(b) { if (b) { try { this.world.removeRigidBody(b); } catch (e) { /* already gone */ } } }

  ray(ox, oy, oz, dx, dy, dz, max, grp = GR.rayGround, excludeBody = null) {
    this._ray.origin = { x: ox, y: oy, z: oz };
    this._ray.dir = { x: dx, y: dy, z: dz };
    const h = this.world.castRay(this._ray, max, true, undefined, grp, undefined, excludeBody || undefined);
    if (!h) return null;
    const t = h.timeOfImpact ?? h.toi;
    return { t, x: ox + dx * t, y: oy + dy * t, z: oz + dz * t, collider: h.collider };
  }

  rayNormal(ox, oy, oz, dx, dy, dz, max, grp = GR.rayGround) {
    this._ray.origin = { x: ox, y: oy, z: oz };
    this._ray.dir = { x: dx, y: dy, z: dz };
    const h = this.world.castRayAndGetNormal(this._ray, max, true, undefined, grp);
    if (!h) return null;
    const t = h.timeOfImpact ?? h.toi;
    return { t, x: ox + dx * t, y: oy + dy * t, z: oz + dz * t, n: h.normal, collider: h.collider };
  }

  step(dt, maxSteps = 3) {
    this.acc = Math.min(this.acc + dt, this.dt * maxSteps);
    let n = 0;
    while (this.acc >= this.dt - 1e-6) {
      for (const f of this.beforeStep) f(this.dt);
      this.world.step();
      this.acc -= this.dt;
      n++;
    }
    return n;
  }
}
