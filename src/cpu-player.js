/* Search uses disposable copies. The live Matter world and online data are never mutated. */
(function (root) {
  function plan(cats, stage, now) {
    const supports = cats.filter(cat => cat.dropped && cat.body.bounds.max.y < 1200);
    const highest = supports.sort((a, b) => a.body.bounds.min.y - b.body.bounds.min.y)[0];
    const center = highest ? highest.body.position.x : stage === 'tower' ? 400 : 450;
    return { x: Math.max(280, Math.min(620, center)), angle: 0, dropAt: now + 1800 };
  }

  function describe(body) {
    const parts = body.parts.length > 1 ? body.parts.slice(1) : [body];
    return {
      x: body.position.x, y: body.position.y, angle: body.angle,
      vx: body.velocity.x, vy: body.velocity.y, angularVelocity: body.angularVelocity,
      isStatic: body.isStatic,
      friction: body._original?.friction ?? body.friction,
      frictionStatic: body.frictionStatic, frictionAir: body.frictionAir,
      restitution: body._original?.restitution ?? body.restitution, slop: body.slop,
      parts: parts.map(part => ({
        vertices: part.vertices.map(v => ({ x: v.x, y: v.y })),
        x: part.position.x, y: part.position.y,
        friction: part._original?.friction ?? part.friction, frictionStatic: part.frictionStatic,
        frictionAir: part.frictionAir, restitution: part._original?.restitution ?? part.restitution, slop: part.slop,
        density: part._original?.density || part.density,
      })),
    };
  }

  function clone(body, Matter) {
    const parts = body.parts.map(part => Matter.Body.create({
      ...part, position: { x: part.x, y: part.y },
      vertices: part.vertices.map(v => ({ ...v })),
      density: Number.isFinite(part.density) ? part.density : .0018,
      isStatic: false,
    }));
    const copy = parts.length === 1 ? parts[0] : Matter.Body.create({
      parts, friction: body.friction, frictionStatic: body.frictionStatic,
      frictionAir: body.frictionAir, restitution: body.restitution, slop: body.slop,
    });
    // Vertices are already in world orientation; set the reference angle without rotating twice.
    copy.angle = body.angle;
    copy.anglePrev = body.angle;
    Matter.Body.setStatic(copy, body.isStatic);
    if (!body.isStatic) {
      Matter.Body.setVelocity(copy, { x: body.vx, y: body.vy });
      Matter.Body.setAngularVelocity(copy, body.angularVelocity);
    }
    return copy;
  }

  function evaluate(snapshot, candidate, Matter) {
    const engine = Matter.Engine.create({
      gravity: { ...snapshot.gravity }, positionIterations: 10,
      velocityIterations: 8, constraintIterations: 4, enableSleeping: true,
    });
    const bodies = snapshot.bodies.map(body => clone(body, Matter));
    const active = bodies[snapshot.activeIndex];
    Matter.Body.setStatic(active, false);
    Matter.Body.setPosition(active, { x: candidate.x, y: snapshot.aimY + 3 });
    Matter.Body.setAngle(active, candidate.angle);
    Matter.Body.setVelocity(active, { x: 0, y: 1.8 });
    Matter.Body.setAngularVelocity(active, 0);
    Matter.Composite.add(engine.world, bodies);
    let failed = false;
    for (let frame = 0; frame < 480; frame += 1) {
      Matter.Engine.update(engine, 1000 / 120);
      if (bodies.some(body => !body.isStatic && (
        body.position.y > snapshot.failY || body.position.x < -190 || body.position.x > 1090
      ))) { failed = true; break; }
    }
    const dynamic = bodies.filter(body => !body.isStatic);
    const motion = dynamic.reduce((sum, body) => sum + Math.hypot(body.velocity.x, body.velocity.y) + Math.abs(body.angularVelocity) * 80, 0);
    const displacement = bodies.reduce((sum, body, index) => {
      if (index === snapshot.activeIndex || body.isStatic) return sum;
      return sum + Math.hypot(body.position.x - snapshot.bodies[index].x, body.position.y - snapshot.bodies[index].y);
    }, 0);
    const height = Math.max(0, 1100 - Math.min(...dynamic.map(body => body.bounds.min.y)));
    const score = (failed ? -1e9 : 0) - motion * 800 - displacement * .7 - height * .08 - Math.abs(active.position.x - 450) * .12;
    Matter.Engine.clear(engine);
    return { ...candidate, score, failed, motion };
  }

  function createSearch(snapshot, Matter) {
    const positions = [...new Set([450, snapshot.center, snapshot.center - 60, snapshot.center + 60, 300, 375, 525, 600].map(x => Math.round(Math.max(220, Math.min(680, x)))))];
    const candidates = positions.flatMap(x => [0, Math.PI / 2, -Math.PI / 2, Math.PI, Math.PI / 4, -Math.PI / 4].map(angle => ({ x, angle })));
    return {
      index: 0, best: null, total: candidates.length,
      next() {
        if (this.index >= candidates.length) return null;
        const result = evaluate(snapshot, candidates[this.index++], Matter);
        if (!this.best || result.score > this.best.score) this.best = result;
        return { best: this.best, evaluated: this.index, total: this.total, done: this.index === this.total };
      },
    };
  }

  function startSearch(base, world, active, aimY, failY, gravity) {
    if (typeof root.Worker !== 'function') return base;
    const activeIndex = world.indexOf(active);
    if (activeIndex < 0) return base;
    try {
      const worker = new root.Worker('./src/cpu-worker.js?v=20261124-search-1');
      base.cancel = () => worker.terminate();
      worker.onmessage = ({ data }) => {
        base.x = data.best.x;
        base.angle = data.best.angle;
        base.evaluated = data.evaluated;
        base.ready = data.done;
        if (data.done) worker.terminate();
      };
      worker.onerror = () => { base.ready = true; worker.terminate(); };
      worker.postMessage({
        bodies: world.map(describe), activeIndex, aimY, failY, center: base.x,
        gravity: { x: gravity.x, y: gravity.y, scale: gravity.scale },
      });
    } catch { base.ready = true; }
    return base;
  }

  root.NekoTowerCpu = { plan, describe, evaluate, createSearch, startSearch };
  if (typeof module !== 'undefined') module.exports = root.NekoTowerCpu;
})(typeof window !== 'undefined' ? window : globalThis);
