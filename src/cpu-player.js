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

  function evaluate(snapshot, candidate, Matter, frames = 480) {
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
    for (let frame = 0; frame < frames; frame += 1) {
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
    const clampX = x => Math.round(Math.max(45, Math.min(855, x)));
    // Scan the whole usable board, not just the center. Also sample real support centers.
    const supports = snapshot.bodies.filter((body, index) => index !== snapshot.activeIndex)
      .sort((a, b) => a.y - b.y).slice(0, 3);
    const positions = [...new Set([
      snapshot.center, ...supports.map(body => body.x), 450,
      snapshot.center - 90, snapshot.center + 90, 240, 330, 570, 660,
    ].map(clampX))];
    const candidates = positions.flatMap(x => [0, Math.PI / 2, -Math.PI / 2, Math.PI,
      Math.PI / 4, -Math.PI / 4, Math.PI * 3 / 4, -Math.PI * 3 / 4].map(angle => ({ x, angle })));
    const seen = new Set(candidates.map(move => `${move.x}:${move.angle.toFixed(4)}`));
    const ranked = [];
    const verified = [];
    let phase = 'coarse';
    let finalist = 0;
    let variant = 0;
    let worst = Infinity;
    let failed = false;
    let best = null;
    let finalists = [];
    const stress = [{ dx: -6, da: 0 }, { dx: 6, da: 0 }, { dx: 0, da: -.035 }, { dx: 0, da: .035 }];
    const search = {
      index: 0, total: candidates.length, best: null,
      next() {
        if (phase === 'done') return null;
        if (phase === 'verify') {
          const move = finalists[finalist];
          const offset = stress[variant];
          // Retest slight aiming errors for longer: reject knife-edge balances.
          const trial = evaluate(snapshot, { x: clampX(move.x + offset.dx), angle: move.angle + offset.da }, Matter, 720);
          worst = Math.min(worst, trial.score);
          failed ||= trial.failed;
          variant += 1;
          if (variant === stress.length) {
            verified.push({ ...move, score: Math.min(move.score, worst), failed: failed || move.failed, robust: true });
            verified.sort((a, b) => a.failed - b.failed || b.score - a.score);
            best = verified[0];
            finalist += 1;
            variant = 0;
            worst = Infinity;
            failed = false;
            if (finalist === finalists.length) phase = 'done';
          }
        } else {
          const result = evaluate(snapshot, candidates[this.index], Matter);
          ranked.push(result);
          ranked.sort((a, b) => a.failed - b.failed || b.score - a.score);
          best = ranked[0];
        }
        this.index += 1;
        if (this.index === candidates.length && phase === 'coarse') {
          phase = 'refine';
          for (const seed of ranked.slice(0, 4)) {
            for (const dx of [-30, 0, 30]) for (const da of [-Math.PI / 16, 0, Math.PI / 16]) {
              const move = { x: clampX(seed.x + dx), angle: seed.angle + da };
              const key = `${move.x}:${move.angle.toFixed(4)}`;
              if (!seen.has(key)) { seen.add(key); candidates.push(move); }
            }
          }
          this.total = candidates.length;
        }
        if (this.index === candidates.length && phase === 'refine') {
          // Diverse finalists avoid spending all robustness checks on one landing spot.
          finalists = ranked.filter((move, index, all) => !all.slice(0, index).some(other =>
            Math.abs(other.x - move.x) < 12 && Math.abs(other.angle - move.angle) < .1)).slice(0, 3);
          phase = 'verify';
          this.total += finalists.length * stress.length;
        }
        this.best = best;
        return { best, evaluated: this.index, total: this.total, phase, done: phase === 'done' };
      },
    };
    return search;
  }

  function startSearch(base, world, active, aimY, failY, gravity) {
    if (typeof root.Worker !== 'function') return base;
    const activeIndex = world.indexOf(active);
    if (activeIndex < 0) return base;
    try {
      const worker = new root.Worker('./src/cpu-worker.js?v=20261126-search-2');
      base.cancel = () => {
        worker.onmessage = null;
        worker.onerror = null;
        worker.terminate();
      };
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
