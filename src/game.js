const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");

const hudScoreEl = document.querySelector("#hudScore");
const hudBestEl = document.querySelector("#hudBest");
const hudTurnEl = document.querySelector("#hudTurn");
const titleCatsEl = document.querySelector("#titleCats");
const titleMenuEl = document.querySelector("#titleMenu");
const howToPanelEl = document.querySelector("#howToPanel");
const titleScreen = document.querySelector("#titleScreen");
const gameOverScreen = document.querySelector("#gameOverScreen");
const gameOverMessageEl = document.querySelector("#gameOverMessage");
const stageBowlBtn = document.querySelector("#stageBowlBtn");
const stagePlatformBtn = document.querySelector("#stagePlatformBtn");
const stageTowerBtn = document.querySelector("#stageTowerBtn");
const stageBottleBtn = document.querySelector("#stageBottleBtn");
const howToBtn = document.querySelector("#howToBtn");
const howToBackBtn = document.querySelector("#howToBackBtn");
const retryBtn = document.querySelector("#retryBtn");
const toTitleBtn = document.querySelector("#toTitleBtn");

const { Bodies, Body, Common, Composite, Engine, Events, Sleeping, Vertices, Vector } = window.Matter;

const W = canvas.width;
const H = canvas.height;
const HIT_SCALE = 0.9;
const CAT_SCALE = 1.3;
const SMALL_CAT_SCALE = 1.5;
const SMALL_CONTOUR_AREA = 0.13;
const ROT_ACCEL = 0.0003;
const ROT_MAX = 0.195;
const ROT_FAST_DECAY = 0.999;
const ROT_SLOW_DECAY = 0.94;
const ROT_FAST_THRESHOLD = 0.04;
const AIM_MIN_X = 45;
const AIM_MAX_X = 855;
const DROP_SPIN_MULTIPLIER = 1.8;
const SPIN_CURVE_FORCE = 0.364;
const SPIN_CURVE_MAX = 0.0715;
const SPIN_CURVE_MIN = 0.045;
const SPIN_CURVE_STOP_MIN = 0.012;
const SPIN_CURVE_RAMP_MS = 1200;
const SPAWN_ZOOM_HOLD_MS = 700;
const SPAWN_ZOOM_SHRINK_MS = 620;
const SPAWN_ZOOM_SCALE = 3.4;

if (window.decomp) {
  Common.setDecomp(window.decomp);
}

const STAGES = {
  bowl: { label: "お椀", aimY: 850, failY: 1255 },
  platform: { label: "平台", aimY: 900, failY: 1260 },
  tower: { label: "タワー", aimY: 560, failY: 1260 },
  bottle: { label: "猫瓶", aimY: 500, failY: 1260 },
};

const physics = {
  engine: null,
  accumulator: 0,
};

const state = {
  cats: [],
  loadedCats: [],
  active: null,
  aiming: true,
  score: 0,
  best: 0,
  stage: "bowl",
  screen: "title",
  gameOver: false,
  lastDropAt: 0,
  cameraY: 0,
  targetCameraY: 0,
  pointerX: null,
  spinVelocity: 0,
  spinInput: 0,
  keys: new Set(),
};

const audio = {
  context: null,
};

function bestKey(stage) {
  return `cat-bowl-best:${stage}`;
}

function getBest(stage) {
  return Number(localStorage.getItem(bestKey(stage)) || 0);
}

state.best = getBest(state.stage);
hudBestEl.textContent = state.best;

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function easeOutCubic(value) {
  return 1 - Math.pow(1 - value, 3);
}

function playMeow() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;
  if (!audio.context) audio.context = new AudioContextClass();
  const context = audio.context;
  if (context.state === "suspended") context.resume();

  const now = context.currentTime;
  const gain = context.createGain();
  const osc = context.createOscillator();
  const tremolo = context.createOscillator();
  const tremoloGain = context.createGain();

  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(rand(610, 720), now);
  osc.frequency.exponentialRampToValueAtTime(rand(410, 480), now + 0.16);
  osc.frequency.exponentialRampToValueAtTime(rand(660, 760), now + 0.34);

  tremolo.type = "sine";
  tremolo.frequency.setValueAtTime(rand(18, 24), now);
  tremoloGain.gain.setValueAtTime(28, now);
  tremolo.connect(tremoloGain);
  tremoloGain.connect(osc.frequency);

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.075, now + 0.035);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);

  osc.connect(gain);
  gain.connect(context.destination);
  osc.start(now);
  tremolo.start(now);
  osc.stop(now + 0.44);
  tremolo.stop(now + 0.44);
}

function loadImages() {
  const names = window.CAT_ASSETS || [];
  return Promise.all(
    names.map(
      (name) =>
        new Promise((resolve) => {
          const img = new Image();
          img.onload = () => resolve({ name, img });
          img.onerror = () => resolve(null);
          img.src = `./assets/trimcats/${encodeURIComponent(name)}`;
        }),
    ),
  ).then((images) => images.filter(Boolean));
}

function populateTitleCats(images) {
  if (!titleCatsEl) return;
  titleCatsEl.replaceChildren();
  const shuffled = [...images].sort(() => Math.random() - 0.5).slice(0, 18);
  for (const asset of shuffled) {
    const img = document.createElement("img");
    img.src = `./assets/trimcats/${encodeURIComponent(asset.name)}`;
    img.alt = "";
    const size = Math.round(rand(46, 72));
    img.style.setProperty("--cat-size", `${size}px`);
    img.style.setProperty("--cat-size-mobile", `${Math.round(size * 0.78)}px`);
    img.style.setProperty("--cat-rot", `${Math.round(rand(-18, 18))}deg`);
    titleCatsEl.appendChild(img);
  }
}

function makeFallbackCircleParts(drawW, drawH) {
  const minSide = Math.min(drawW, drawH);
  const wide = drawW >= drawH * 1.18;
  const tall = drawH >= drawW * 1.18;

  if (wide) {
    return [
      { x: -drawW * 0.34, y: 0, r: minSide * 0.34 },
      { x: -drawW * 0.11, y: 0, r: minSide * 0.38 },
      { x: drawW * 0.13, y: 0, r: minSide * 0.36 },
      { x: drawW * 0.35, y: 0, r: minSide * 0.31 },
    ];
  }

  if (tall) {
    return [
      { x: 0, y: -drawH * 0.35, r: minSide * 0.32 },
      { x: 0, y: -drawH * 0.12, r: minSide * 0.37 },
      { x: 0, y: drawH * 0.12, r: minSide * 0.36 },
      { x: 0, y: drawH * 0.35, r: minSide * 0.31 },
    ];
  }

  return [
    { x: -drawW * 0.22, y: -drawH * 0.08, r: minSide * 0.35 },
    { x: drawW * 0.18, y: -drawH * 0.05, r: minSide * 0.36 },
    { x: 0, y: drawH * 0.21, r: minSide * 0.32 },
  ];
}

function verticesForCat(name, drawW, drawH) {
  const shape = window.CAT_SHAPES?.[name];
  if (!shape?.vertices?.length) return null;
  return shape.vertices.map(([x, y]) => ({
    x: x * drawW,
    y: y * drawH,
  }));
}

function contourBoundsArea(name) {
  const vertices = window.CAT_CONTOURS?.[name]?.vertices;
  if (!vertices?.length) return 0;
  const xs = vertices.map(([x]) => x);
  const ys = vertices.map(([, y]) => y);
  return (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
}

function makeCatBody(cat) {
  const contour = window.CAT_CONTOURS?.[cat.name];
  if (contour?.vertices?.length >= 3 && window.decomp) {
    const rawVertices = contour.vertices.map(([x, y]) => ({
      x: x * cat.drawW,
      y: y * cat.drawH,
    }));
    const centroid = Vertices.centre(rawVertices);
    const shifted = rawVertices.map((vertex) => ({
      x: cat.x + (vertex.x - centroid.x) * HIT_SCALE,
      y: cat.y + (vertex.y - centroid.y) * HIT_SCALE,
    }));
    cat.renderOffsetX = -centroid.x;
    cat.renderOffsetY = -centroid.y;
    const body = Bodies.fromVertices(
      cat.x,
      cat.y,
      [shifted],
      {
        friction: 0.94,
        frictionStatic: 1.6,
        frictionAir: 0.012,
        restitution: 0.01,
        density: 0.0018,
        slop: 0.004,
      },
      true,
      0.01,
      8,
      0.01,
    );
    Body.setAngle(body, cat.angle);
    body.plugin.cat = cat;
    body.plugin.hitType = "contour";
    return body;
  }

  const hitbox = window.CAT_HITBOXES?.[cat.name];
  if (hitbox?.parts?.length) {
    cat.renderOffsetX = 0;
    cat.renderOffsetY = 0;
    const parts = hitbox.parts.map((part) =>
      Bodies.rectangle(
        cat.x + part.x * cat.drawW,
        cat.y + part.y * cat.drawH,
        Math.max(8, part.w * cat.drawW),
        Math.max(8, part.h * cat.drawH),
        {
          friction: 0.94,
          frictionStatic: 1.55,
          frictionAir: 0.012,
          restitution: 0.012,
          density: 0.0018,
        },
      ),
    );
    const body = Body.create({
      parts,
      friction: 0.94,
      frictionStatic: 1.55,
      frictionAir: 0.012,
      restitution: 0.012,
      density: 0.0018,
      slop: 0.005,
    });
    Body.setPosition(body, { x: cat.x, y: cat.y });
    Body.setAngle(body, cat.angle);
    body.plugin.cat = cat;
    body.plugin.hitType = "grid";
    return body;
  }

  const shapeVertices = verticesForCat(cat.name, cat.drawW, cat.drawH);
  if (shapeVertices && shapeVertices.length >= 3) {
    const centroid = Vertices.centre(shapeVertices);
    const shifted = shapeVertices.map((vertex) => ({
      x: cat.x + vertex.x - centroid.x,
      y: cat.y + vertex.y - centroid.y,
    }));
    cat.renderOffsetX = -centroid.x;
    cat.renderOffsetY = -centroid.y;
    const body = Body.create({
      vertices: shifted,
      position: { x: cat.x, y: cat.y },
      friction: 0.92,
      frictionStatic: 1.45,
      frictionAir: 0.012,
      restitution: 0.018,
      density: 0.0018,
      slop: 0.01,
    });
    Body.setAngle(body, cat.angle);
    body.plugin.cat = cat;
    body.plugin.hitType = "hull";
    return body;
  }

  const parts = cat.circles.map((circle) =>
    Bodies.circle(cat.x + circle.x, cat.y + circle.y, circle.r, {
      friction: 0.92,
      frictionStatic: 1.35,
      frictionAir: 0.012,
      restitution: 0.02,
      density: 0.0017,
    }),
  );
  const body = Body.create({
    parts,
    friction: 0.92,
    frictionStatic: 1.35,
    frictionAir: 0.012,
    restitution: 0.02,
    density: 0.0017,
    slop: 0.01,
  });
  Body.setPosition(body, { x: cat.x, y: cat.y });
  Body.setAngle(body, cat.angle);
  cat.renderOffsetX = 0;
  cat.renderOffsetY = 0;
  body.plugin.cat = cat;
  body.plugin.hitType = "circles";
  return body;
}

function makeCat() {
  const asset = state.loadedCats[Math.floor(Math.random() * state.loadedCats.length)];
  const targetArea = rand(36000, 43000);
  const aspect = clamp(asset.img.naturalWidth / asset.img.naturalHeight, 0.62, 1.65);
  const contourArea = contourBoundsArea(asset.name);
  const sizeScale = contourArea > 0 && contourArea < SMALL_CONTOUR_AREA ? SMALL_CAT_SCALE : CAT_SCALE;
  const baseW = Math.sqrt(targetArea * aspect);
  const baseH = targetArea / baseW;
  const drawW = baseW * sizeScale;
  const drawH = baseH * sizeScale;
  const cat = {
    img: asset.img,
    name: asset.name,
    x: W / 2,
    y: state.targetCameraY + 150,
    angle: rand(-0.45, 0.45),
    drawW,
    drawH,
    renderOffsetX: 0,
    renderOffsetY: 0,
    circles: makeFallbackCircleParts(drawW, drawH),
    body: null,
    dropped: false,
    counted: false,
    stableFrames: 0,
    curveSpin: 0,
    droppedAt: 0,
    spawnedAt: performance.now(),
  };
  cat.body = makeCatBody(cat);
  Body.setStatic(cat.body, true);
  Composite.add(physics.engine.world, cat.body);
  return cat;
}

function makeWall(x, y, width, height, angle) {
  return Bodies.rectangle(x, y, width, height, {
    isStatic: true,
    angle,
    friction: 1.0,
    frictionStatic: 2.0,
    restitution: 0,
  });
}

function midpoint(a, b) {
  return { x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5 };
}

function wallFromSegment(a, b, thickness) {
  const mid = midpoint(a, b);
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  const angle = Math.atan2(b.y - a.y, b.x - a.x);
  return makeWall(mid.x, mid.y, length, thickness, angle);
}

function stageBodies(stage) {
  if (stage === "platform") {
    return [makeWall(450, 930, 500, 34, 0)];
  }

  if (stage === "tower") {
    return [
      makeWall(450, 1040, 516, 34, 0),
      makeWall(450, 762, 34, 546, 0),
      wallFromSegment({ x: 220, y: 840 }, { x: 260, y: 910 }, 24),
      wallFromSegment({ x: 260, y: 910 }, { x: 420, y: 910 }, 24),
      wallFromSegment({ x: 420, y: 910 }, { x: 460, y: 840 }, 24),
      makeWall(560, 750, 189, 30, -0.04),
      makeWall(392, 585, 116, 30, 0.03),
    ];
  }

  if (stage === "bottle") {
    return [
      wallFromSegment({ x: 310, y: 1050 }, { x: 252, y: 710 }, 34),
      wallFromSegment({ x: 590, y: 1050 }, { x: 648, y: 710 }, 34),
      wallFromSegment({ x: 310, y: 1050 }, { x: 590, y: 1050 }, 36),
      wallFromSegment({ x: 252, y: 710 }, { x: 368, y: 505 }, 30),
      wallFromSegment({ x: 648, y: 710 }, { x: 532, y: 505 }, 30),
    ];
  }

  return [
    wallFromSegment({ x: 185, y: 850 }, { x: 275, y: 1065 }, 34),
    wallFromSegment({ x: 275, y: 1065 }, { x: 625, y: 1065 }, 38),
    wallFromSegment({ x: 625, y: 1065 }, { x: 715, y: 850 }, 34),
  ];
}

function buildWorld() {
  physics.engine = Engine.create({
    gravity: { x: 0, y: 0.8, scale: 0.001 },
    positionIterations: 10,
    velocityIterations: 8,
    constraintIterations: 4,
    enableSleeping: true,
  });
  physics.engine.timing.timeScale = 1;
  physics.accumulator = 0;

  Composite.add(physics.engine.world, stageBodies(state.stage));

  Events.on(physics.engine, "collisionStart", (event) => {
    for (const pair of event.pairs) {
      const a = pair.bodyA.plugin.cat;
      const b = pair.bodyB.plugin.cat;
      if (a) a.stableFrames = 0;
      if (b) b.stableFrames = 0;
    }
  });
}

function reset(stage = state.stage) {
  if (physics.engine) Events.off(physics.engine);
  state.stage = stage;
  state.best = getBest(stage);
  buildWorld();
  state.cats = [];
  state.active = null;
  state.aiming = true;
  state.score = 0;
  state.screen = "playing";
  state.gameOver = false;
  state.lastDropAt = 0;
  state.cameraY = 0;
  state.targetCameraY = 0;
  state.spinVelocity = 0;
  state.spinInput = 0;
  titleScreen.hidden = true;
  gameOverScreen.hidden = true;
  spawn();
  updateHud();
}

function spawn() {
  state.active = makeCat();
  state.cats.push(state.active);
  state.aiming = true;
  playMeow();
}

function updateHud() {
  hudScoreEl.textContent = state.score;
  hudBestEl.textContent = state.best;
  hudTurnEl.textContent = STAGES[state.stage]?.label || "Stage";
}

function dropActive() {
  if (state.screen !== "playing" || !state.active || state.gameOver || !state.aiming) return;
  const body = state.active.body;
  Body.setStatic(body, false);
  Sleeping.set(body, false);
  Body.setVelocity(body, { x: 0, y: 1.1 });
  const hasCurveSpin = Math.abs(state.spinVelocity) > 0.004;
  const spin = hasCurveSpin ? state.spinVelocity * DROP_SPIN_MULTIPLIER : rand(-0.012, 0.012);
  Body.setAngularVelocity(body, spin);
  state.active.curveSpin = hasCurveSpin ? spin : 0;
  Body.setPosition(body, { x: body.position.x, y: body.position.y + 1 });
  state.active.dropped = true;
  state.active.droppedAt = performance.now();
  state.active.stableFrames = 0;
  state.aiming = false;
  state.spinInput = 0;
  state.spinVelocity = 0;
  state.lastDropAt = performance.now();
  updateHud();
}

function nextTurn() {
  const cat = state.active;
  if (cat && !cat.counted) {
    cat.counted = true;
    state.score += 1;
    if (state.score > state.best) {
      state.best = state.score;
      localStorage.setItem(bestKey(state.stage), String(state.best));
    }
  }
  spawn();
  updateHud();
}

function lose(cat) {
  state.gameOver = true;
  state.aiming = false;
  state.screen = "gameover";
  const message = `終了。${state.score}匹入りました。Retryでもう一回。`;
  gameOverMessageEl.textContent = message;
  gameOverScreen.hidden = false;
  updateHud();
}

function showTitleMenu() {
  titleMenuEl.hidden = false;
  howToPanelEl.hidden = true;
}

function showHowTo() {
  titleMenuEl.hidden = true;
  howToPanelEl.hidden = false;
}

function showTitle() {
  state.screen = "title";
  state.gameOver = false;
  state.aiming = false;
  titleScreen.hidden = false;
  gameOverScreen.hidden = true;
  showTitleMenu();
  updateHud();
}

function aimActive(dt) {
  if (state.screen !== "playing" || !state.aiming || !state.active) return;
  const body = state.active.body;
  const move = (state.keys.has("d") || state.keys.has("D") ? 1 : 0) - (state.keys.has("a") || state.keys.has("A") ? 1 : 0);
  const rot =
    (state.keys.has("e") || state.keys.has("E") || state.keys.has("ArrowRight") ? 1 : 0) -
    (state.keys.has("q") || state.keys.has("Q") || state.keys.has("ArrowLeft") ? 1 : 0);
  const x = clamp(body.position.x + move * 480 * dt, AIM_MIN_X, AIM_MAX_X);
  if (move) state.pointerX = null;
  const targetX = state.pointerX !== null ? clamp(state.pointerX, AIM_MIN_X, AIM_MAX_X) : x;
  const input = state.spinInput || rot;
  if (input) {
    state.spinVelocity = clamp(state.spinVelocity + input * ROT_ACCEL, -ROT_MAX, ROT_MAX);
  } else {
    const decay = Math.abs(state.spinVelocity) >= ROT_FAST_THRESHOLD ? ROT_FAST_DECAY : ROT_SLOW_DECAY;
    state.spinVelocity *= decay;
    if (Math.abs(state.spinVelocity) < 0.0007) state.spinVelocity = 0;
  }
  Body.setPosition(body, { x: targetX, y: state.targetCameraY + 150 });
  Body.setAngle(body, body.angle + state.spinVelocity);
}

function applySpinCurveForces() {
  for (const cat of state.cats) {
    if (!cat.dropped || cat.body.isStatic || cat.body.isSleeping) continue;
    const initialSpin = cat.curveSpin;
    if (Math.abs(initialSpin) < SPIN_CURVE_MIN) continue;
    const liveSpin = cat.body.angularVelocity;
    if (Math.abs(liveSpin) < SPIN_CURVE_STOP_MIN || Math.sign(liveSpin) !== Math.sign(initialSpin)) {
      cat.curveSpin = 0;
      continue;
    }
    const spinRatio = clamp((Math.abs(liveSpin) - SPIN_CURVE_MIN) / (ROT_MAX * DROP_SPIN_MULTIPLIER - SPIN_CURVE_MIN), 0, 1);
    if (spinRatio <= 0) continue;
    const elapsed = Math.max(0, performance.now() - cat.droppedAt);
    const ramp = Math.min(1, elapsed / SPIN_CURVE_RAMP_MS);
    const curveRamp = ramp * ramp;
    const curveStrength = spinRatio * spinRatio;
    const falling = Math.max(0.3, Math.min(4, cat.body.velocity.y + 0.8));
    const curveVelocity = clamp(
      Math.sign(initialSpin) * falling * SPIN_CURVE_FORCE * curveRamp * curveStrength,
      -SPIN_CURVE_MAX,
      SPIN_CURVE_MAX,
    );
    Body.setVelocity(cat.body, {
      x: cat.body.velocity.x + curveVelocity,
      y: cat.body.velocity.y,
    });
  }
}

function updateStability() {
  for (const cat of state.cats) {
    if (!cat.dropped) continue;
    const speed = Vector.magnitude(cat.body.velocity);
    const angular = Math.abs(cat.body.angularVelocity);
    if (speed < 0.18 && angular < 0.004) {
      cat.stableFrames += 1;
      Body.setVelocity(cat.body, { x: 0, y: 0 });
      Body.setAngularVelocity(cat.body, 0);
      cat.curveSpin = 0;
    } else {
      cat.stableFrames = 0;
    }
  }
}

function updateCamera() {
  const dropped = state.cats.filter((cat) => cat.dropped && !cat.body.isStatic);
  if (dropped.length === 0) {
    state.targetCameraY = 0;
  } else {
    const highest = Math.min(...dropped.map((cat) => cat.body.bounds.min.y));
    state.targetCameraY = Math.min(0, highest - 260);
  }
  state.cameraY += (state.targetCameraY - state.cameraY) * 0.08;
}

function step(dt) {
  if (state.screen !== "playing" || state.gameOver) return;

  aimActive(dt);

  const fixed = 1000 / 120;
  physics.accumulator = Math.min(physics.accumulator + dt * 1000, 80);
  while (physics.accumulator >= fixed) {
    applySpinCurveForces();
    Engine.update(physics.engine, fixed);
    physics.accumulator -= fixed;
  }
  updateStability();
  updateCamera();

  for (const cat of state.cats) {
    const pos = cat.body.position;
    if (cat.dropped && (pos.y > STAGES[state.stage].failY || pos.x < -190 || pos.x > W + 190)) {
      lose(cat);
      return;
    }
  }

  if (!state.aiming && state.active && performance.now() - state.lastDropAt > 900) {
    const activeDropped = state.active.dropped && !state.active.body.isStatic;
    const activeMoved = state.active.body.position.y > state.targetCameraY + 190 || performance.now() - state.lastDropAt > 2600;
    const allSlow = state.cats.every((cat) => !cat.dropped || cat.stableFrames > 18 || cat.body.isSleeping);
    if (activeDropped && activeMoved && allSlow) nextTurn();
  }
}

function drawStage() {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#5a8fa6";
  ctx.lineWidth = 28;

  if (state.stage === "platform") {
    ctx.beginPath();
    ctx.moveTo(200, 930);
    ctx.lineTo(700, 930);
    ctx.stroke();
  } else if (state.stage === "tower") {
    ctx.strokeStyle = "#8b6b4f";
    ctx.lineWidth = 30;
    ctx.beginPath();
    ctx.moveTo(192, 1040);
    ctx.lineTo(708, 1040);
    ctx.moveTo(450, 1038);
    ctx.lineTo(450, 494);
    ctx.moveTo(466, 753);
    ctx.lineTo(654, 747);
    ctx.moveTo(334, 583);
    ctx.lineTo(450, 587);
    ctx.stroke();
    ctx.strokeStyle = "#9c7655";
    ctx.lineWidth = 24;
    ctx.beginPath();
    ctx.moveTo(220, 840);
    ctx.lineTo(260, 910);
    ctx.lineTo(420, 910);
    ctx.lineTo(460, 840);
    ctx.stroke();
  } else if (state.stage === "bottle") {
    ctx.strokeStyle = "rgba(82, 143, 164, 0.66)";
    ctx.lineWidth = 26;
    ctx.beginPath();
    ctx.moveTo(310, 1050);
    ctx.lineTo(252, 710);
    ctx.lineTo(368, 505);
    ctx.moveTo(590, 1050);
    ctx.lineTo(648, 710);
    ctx.lineTo(532, 505);
    ctx.moveTo(310, 1050);
    ctx.lineTo(590, 1050);
    ctx.stroke();
    ctx.fillStyle = "rgba(180, 230, 245, 0.18)";
    ctx.beginPath();
    ctx.moveTo(315, 1040);
    ctx.lineTo(270, 720);
    ctx.lineTo(383, 535);
    ctx.lineTo(517, 535);
    ctx.lineTo(630, 720);
    ctx.lineTo(585, 1040);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(185, 850);
    ctx.lineTo(275, 1065);
    ctx.lineTo(625, 1065);
    ctx.lineTo(715, 850);
    ctx.stroke();

    ctx.strokeStyle = "rgba(255,255,255,0.72)";
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(203, 872);
    ctx.lineTo(289, 1043);
    ctx.lineTo(611, 1043);
    ctx.lineTo(697, 872);
    ctx.stroke();
  }
  ctx.restore();
}

function drawCat(cat) {
  const body = cat.body;
  let x = body.position.x;
  let y = body.position.y;
  let scale = 1;
  if (cat === state.active && state.aiming && !cat.dropped) {
    const progress = clamp((performance.now() - cat.spawnedAt - SPAWN_ZOOM_HOLD_MS) / SPAWN_ZOOM_SHRINK_MS, 0, 1);
    const eased = easeOutCubic(progress);
    const startX = W / 2;
    const startY = state.cameraY + H * 0.43;
    x = startX + (body.position.x - startX) * eased;
    y = startY + (body.position.y - startY) * eased;
    scale = SPAWN_ZOOM_SCALE + (1 - SPAWN_ZOOM_SCALE) * eased;
  }
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(body.angle);
  ctx.scale(scale, scale);
  ctx.shadowColor = "rgba(30, 55, 65, 0.22)";
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 6;
  ctx.drawImage(
    cat.img,
    -cat.drawW / 2 + cat.renderOffsetX,
    -cat.drawH / 2 + cat.renderOffsetY,
    cat.drawW,
    cat.drawH,
  );
  ctx.restore();
}

function drawSpinChargeEffect(cat) {
  if (cat !== state.active || !state.aiming || state.gameOver) return;
  const charge = clamp((Math.abs(state.spinVelocity) - ROT_FAST_THRESHOLD) / (ROT_MAX - ROT_FAST_THRESHOLD), 0, 1);
  if (charge <= 0) return;

  const body = cat.body;
  const time = performance.now() / 1000;
  const radius = Math.max(cat.drawW, cat.drawH) * (0.52 + charge * 0.18);
  ctx.save();
  ctx.translate(body.position.x, body.position.y);
  ctx.rotate(time * (state.spinVelocity >= 0 ? 1 : -1) * (2.2 + charge * 5));
  ctx.globalAlpha = 0.28 + charge * 0.52;
  ctx.strokeStyle = `rgba(78, 183, 232, ${0.35 + charge * 0.45})`;
  ctx.lineWidth = 3 + charge * 5;
  ctx.setLineDash([16, 18]);
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  const sparkCount = 6 + Math.round(charge * 8);
  for (let i = 0; i < sparkCount; i += 1) {
    const angle = (Math.PI * 2 * i) / sparkCount + time * (1.4 + charge * 2);
    const pulse = 0.5 + 0.5 * Math.sin(time * 9 + i * 1.7);
    const sparkRadius = radius + 8 + pulse * 12;
    const x = Math.cos(angle) * sparkRadius;
    const y = Math.sin(angle) * sparkRadius;
    ctx.fillStyle = `rgba(255, 233, 116, ${0.25 + charge * 0.65})`;
    ctx.beginPath();
    ctx.arc(x, y, 2 + charge * 3, 0, Math.PI * 2);
    ctx.fill();
  }

  if (charge > 0.92) {
    const shine = 0.65 + 0.35 * Math.sin(time * 18);
    ctx.globalAlpha = shine;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(radius * 0.45, -radius * 0.7);
    ctx.lineTo(radius * 0.45, -radius * 1.05);
    ctx.moveTo(radius * 0.27, -radius * 0.87);
    ctx.lineTo(radius * 0.63, -radius * 0.87);
    ctx.stroke();
  }
  ctx.restore();
}

function drawHitShape(cat) {
  const parts = cat.body.parts.length > 1 ? cat.body.parts.slice(1) : [cat.body];
  ctx.save();
  ctx.strokeStyle = "rgba(255, 62, 48, 0.36)";
  ctx.lineWidth = 3;
  for (const part of parts) {
    const vertices = part.vertices;
    if (!vertices?.length) continue;
    ctx.beginPath();
    ctx.moveTo(vertices[0].x, vertices[0].y);
    for (let i = 1; i < vertices.length; i += 1) ctx.lineTo(vertices[i].x, vertices[i].y);
    ctx.closePath();
    ctx.stroke();
  }
  ctx.restore();
}

function drawAimGuide() {
  if (!state.active || !state.aiming || state.gameOver) return;
  ctx.save();
  ctx.strokeStyle = "rgba(30, 80, 100, 0.25)";
  ctx.setLineDash([12, 12]);
  ctx.lineWidth = 4;
  ctx.beginPath();
  const x = state.active.body.position.x;
  ctx.moveTo(x, 210);
  ctx.lineTo(x, Math.min(H - 90, STAGES[state.stage].aimY - state.cameraY - 70));
  ctx.stroke();
  ctx.restore();
}

function render() {
  ctx.clearRect(0, 0, W, H);

  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#d7f0f8";
  if (state.stage === "bowl") {
    ctx.beginPath();
    ctx.arc(450, 1150, 620, Math.PI, 0);
    ctx.fill();
  } else {
    ctx.fillRect(0, 915, W, 285);
  }

  drawAimGuide();
  ctx.save();
  ctx.translate(0, -state.cameraY);
  for (const cat of state.cats) {
    drawCat(cat);
    drawSpinChargeEffect(cat);
    if (location.search.includes("debugHit=1")) drawHitShape(cat);
  }
  drawStage();
  ctx.restore();

  if (state.gameOver) {
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.86)";
    ctx.fillRect(180, 450, 540, 170);
    ctx.fillStyle = "#19252c";
    ctx.font = "700 46px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("GAME OVER", W / 2, 525);
    ctx.font = "24px system-ui";
    ctx.fillText("Retryで再挑戦", W / 2, 570);
    ctx.restore();
  }
}

let lastTime = performance.now();
function loop(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.034);
  lastTime = now;
  step(dt);
  render();
  requestAnimationFrame(loop);
}

window.addEventListener("keydown", (event) => {
  state.keys.add(event.key);
  if (event.code === "Space") {
    event.preventDefault();
    dropActive();
  }
});

window.addEventListener("keyup", (event) => {
  state.keys.delete(event.key);
});

let lastPointerType = "mouse";

canvas.addEventListener("pointermove", (event) => {
  const rect = canvas.getBoundingClientRect();
  state.pointerX = ((event.clientX - rect.left) / rect.width) * W;
});

canvas.addEventListener("pointerdown", (event) => {
  lastPointerType = event.pointerType || "mouse";
  const rect = canvas.getBoundingClientRect();
  state.pointerX = ((event.clientX - rect.left) / rect.width) * W;
});

canvas.addEventListener("click", (event) => {
  if (event.button !== 0) return;
  if (lastPointerType !== "mouse") return;
  dropActive();
});

canvas.addEventListener(
  "wheel",
  (event) => {
    if (!state.aiming || !state.active) return;
    event.preventDefault();
    const direction = Math.sign(event.deltaY);
    Body.rotate(state.active.body, direction * 0.16);
  },
  { passive: false },
);

canvas.addEventListener("pointerleave", () => {
  state.pointerX = null;
});

function holdButton(button, onStart, onStop) {
  const start = (event) => {
    event.preventDefault();
    onStart();
  };
  const stop = () => onStop();
  button.addEventListener("pointerdown", start);
  button.addEventListener("pointerup", stop);
  button.addEventListener("pointercancel", stop);
  button.addEventListener("pointerleave", stop);
}

holdButton(
  document.querySelector("#rotLeftBtn"),
  () => {
    if (state.aiming && state.active) state.spinInput = -1;
  },
  () => {
    if (state.spinInput < 0) state.spinInput = 0;
  },
);
holdButton(
  document.querySelector("#rotRightBtn"),
  () => {
    if (state.aiming && state.active) state.spinInput = 1;
  },
  () => {
    if (state.spinInput > 0) state.spinInput = 0;
  },
);
document.querySelector("#dropBtn").addEventListener("click", dropActive);

stageBowlBtn.addEventListener("click", () => reset("bowl"));
stagePlatformBtn.addEventListener("click", () => reset("platform"));
stageTowerBtn.addEventListener("click", () => reset("tower"));
stageBottleBtn.addEventListener("click", () => reset("bottle"));
howToBtn.addEventListener("click", showHowTo);
howToBackBtn.addEventListener("click", showTitleMenu);
retryBtn.addEventListener("click", () => reset(state.stage));
toTitleBtn.addEventListener("click", showTitle);

loadImages().then((images) => {
  state.loadedCats = images;
  buildWorld();
  if (images.length === 0) {
    gameOverMessageEl.textContent = "猫画像が読み込めませんでした。";
    gameOverScreen.hidden = false;
    return;
  }
  populateTitleCats(images);
  reset("bowl");
  showTitle();
  requestAnimationFrame(loop);
});

