const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const Matter = require(path.join(root, "vendor", "matter.min.js"));
const decomp = require(path.join(root, "vendor", "decomp.min.js"));

const elements = new Map();
const storage = new Map();
function element(id) {
  if (!elements.has(id)) {
    elements.set(id, {
      id,
      textContent: "",
      addEventListener() {},
      getContext() {
        return ctx;
      },
      getBoundingClientRect() {
        return { left: 0, top: 0, width: 900, height: 1200 };
      },
      width: 900,
      height: 1200,
    });
  }
  return elements.get(id);
}

const ctx = new Proxy(
  {},
  {
    get(_target, prop) {
      if (prop === "canvas") return element("game");
      return () => {};
    },
    set() {
      return true;
    },
  },
);

const context = {
  console,
  setTimeout,
  clearTimeout,
  performance: {
    now: () => context.__now,
  },
  localStorage: {
    getItem: (key) => storage.get(key) || null,
    setItem: (key, value) => storage.set(key, value),
  },
  document: {
    querySelector(selector) {
      if (selector === "#game") return element("game");
      return element(selector.replace("#", ""));
    },
    scripts: [],
    body: { innerText: "" },
  },
  window: null,
  Matter,
  decomp,
  __now: 0,
};
context.window = context;
context.requestAnimationFrame = (callback) => {
  context.__raf = callback;
  return 1;
};
context.cancelAnimationFrame = () => {};
context.addEventListener = () => {};

context.Image = class FakeImage {
  constructor() {
    this.naturalWidth = 280;
    this.naturalHeight = 180;
  }
  set src(value) {
    this._src = value;
    setTimeout(() => this.onload && this.onload(), 0);
  }
  get src() {
    return this._src;
  }
};

vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root, "src", "cats.js"), "utf8"), context, {
  filename: "cats.js",
});
vm.runInContext(fs.readFileSync(path.join(root, "src", "cat-shapes.js"), "utf8"), context, {
  filename: "cat-shapes.js",
});
vm.runInContext(fs.readFileSync(path.join(root, "src", "cat-contours.js"), "utf8"), context, {
  filename: "cat-contours.js",
});
vm.runInContext(fs.readFileSync(path.join(root, "src", "cat-hitboxes.js"), "utf8"), context, {
  filename: "cat-hitboxes.js",
});
vm.runInContext(
  `${fs.readFileSync(path.join(root, "src", "game.js"), "utf8")}
setTimeout(() => {
  window.__test = {
    state,
    physics,
    dropActive,
    reset,
    showTitle,
    step,
    getStatus: () => document.querySelector("#gameOverMessage").textContent,
    getScore: () => document.querySelector("#hudScore").textContent,
  };
}, 0);`,
  context,
  { filename: "game.js" },
);

function advance(frames) {
  for (let i = 0; i < frames; i += 1) {
    context.__now += 1000 / 60;
    context.__test.step(1 / 60);
  }
}

function dropAndSettle() {
  const beforeY = context.__test.state.active.body.position.y;
  context.__test.dropActive();
  advance(12);
  const afterY = context.__test.state.active.body.position.y;
  const velocityY = context.__test.state.active.body.velocity.y;
  if (context.__test.state.active.body.isStatic || (afterY <= beforeY + 0.2 && velocityY <= 0.05)) {
    throw new Error(`cat did not start falling after drop; beforeY=${beforeY}; afterY=${afterY}; velocityY=${velocityY}`);
  }
  for (let i = 0; i < 420; i += 1) {
    context.__now += 1000 / 60;
    context.__test.step(1 / 60);
    if (context.__test.state.aiming || context.__test.state.gameOver) break;
  }
}

setTimeout(() => {
  if (!context.__test) throw new Error("game did not initialize");
  for (const stage of ["bowl", "platform", "tower", "bottle"]) {
    context.__test.reset(stage);
    const staticBodies = Matter.Composite.allBodies(context.__test.physics.engine.world).filter((body) => body.isStatic);
    if (context.__test.state.stage !== stage) throw new Error(`stage did not switch to ${stage}`);
    if (staticBodies.length < 2) throw new Error(`stage ${stage} did not create enough static bodies`);
  }
  storage.set("cat-bowl-best:bowl", "7");
  storage.set("cat-bowl-best:tower", "3");
  context.__test.reset("bowl");
  if (context.__test.state.best !== 7) throw new Error(`bowl best did not load; best=${context.__test.state.best}`);
  context.__test.reset("tower");
  if (context.__test.state.best !== 3) throw new Error(`tower best did not load; best=${context.__test.state.best}`);
  context.__test.reset("bowl");
  if (!context.__test.state.active) throw new Error("no active cat after init");
  if (context.__test.state.active.body.plugin.hitType !== "contour") {
    throw new Error(`active cat is not using contour hitbox; hitType=${context.__test.state.active.body.plugin.hitType}`);
  }
  context.__test.state.keys.add("D");
  advance(20);
  const heldSpin = context.__test.state.spinVelocity;
  context.__test.state.keys.delete("D");
  const angleBeforeRelease = context.__test.state.active.body.angle;
  advance(12);
  const angleAfterRelease = context.__test.state.active.body.angle;
  if (heldSpin <= 0.005) throw new Error(`spin did not accelerate; spin=${heldSpin}`);
  if (angleAfterRelease <= angleBeforeRelease) throw new Error("spin did not continue after release");
  context.__test.dropActive();
  advance(20);
  if (context.__test.state.cats[0].body.angularVelocity <= 0.004) {
    throw new Error(`drop did not inherit spin; angular=${context.__test.state.cats[0].body.angularVelocity}`);
  }
  if (context.__test.state.cats[0].body.velocity.x <= 0.02) {
    throw new Error(`spin curve did not add rightward velocity; vx=${context.__test.state.cats[0].body.velocity.x}`);
  }
  context.__test.reset("bowl");
  const initialBodies = Matter.Composite.allBodies(context.__test.physics.engine.world);
  const bodySummary = initialBodies.map((body) => ({
    label: body.label,
    static: body.isStatic,
    x: Math.round(body.position.x),
    y: Math.round(body.position.y),
    parts: body.parts.length,
    filter: body.collisionFilter,
  }));
  const firstBeforeY = context.__test.state.active.body.position.y;
  context.__test.dropActive();
  advance(12);
  const firstAfterY = context.__test.state.cats[0].body.position.y;
  if (firstAfterY <= firstBeforeY + 2) {
    throw new Error(`first cat did not start falling; beforeY=${firstBeforeY}; afterY=${firstAfterY}`);
  }
  const samples = [];
  for (let i = 0; i < 420; i += 1) {
    context.__now += 1000 / 60;
    context.__test.step(1 / 60);
    if (i % 30 === 0 && context.__test.state.cats[0]) {
      const body = context.__test.state.cats[0].body;
      samples.push({
        frame: i,
        x: Math.round(body.position.x),
        y: Math.round(body.position.y),
        vx: Number(body.velocity.x.toFixed(2)),
        vy: Number(body.velocity.y.toFixed(2)),
        sleeping: body.isSleeping,
      });
    }
  }
  const active = context.__test.state.active;
  const cats = context.__test.state.cats.length;
  const status = context.__test.getStatus();
  const worldBodies = Matter.Composite.allBodies(context.__test.physics.engine.world);
  if (cats < 2) throw new Error(`next cat did not spawn; cats=${cats}; status=${status}; bodies=${JSON.stringify(bodySummary)}; initialBodies=${initialBodies.length}; worldBodies=${worldBodies.length}; samples=${JSON.stringify(samples)}`);
  if (active.dropped) throw new Error("new active cat is already dropped");
  for (let i = 0; i < 4; i += 1) dropAndSettle();
  if (context.__test.state.gameOver) {
    throw new Error(`unexpected game over during multi-drop; cats=${context.__test.state.cats.length}; status=${context.__test.getStatus()}`);
  }
  console.log(
    JSON.stringify({
      ok: true,
      cats: context.__test.state.cats.length,
      score: context.__test.getScore(),
      status,
      matter: Matter.version,
    }),
  );
}, 50);
