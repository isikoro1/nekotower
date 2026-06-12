const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");

const hudScoreEl = document.querySelector("#hudScore");
const hudBestEl = document.querySelector("#hudBest");
const hudTurnEl = document.querySelector("#hudTurn");
const titleScreen = document.querySelector("#titleScreen");
const gameOverScreen = document.querySelector("#gameOverScreen");
const gameOverMessageEl = document.querySelector("#gameOverMessage");
const titleSoloBtn = document.querySelector("#titleSoloBtn");
const titleVersusBtn = document.querySelector("#titleVersusBtn");
const retryBtn = document.querySelector("#retryBtn");
const toTitleBtn = document.querySelector("#toTitleBtn");

const { Bodies, Body, Common, Composite, Engine, Events, Sleeping, Vertices, Vector } = window.Matter;

const W = canvas.width;
const H = canvas.height;
const HIT_SCALE = 0.9;
const CAT_SCALE = 1.3;
const SMALL_CAT_SCALE = 1.5;
const SMALL_CONTOUR_AREA = 0.13;

if (window.decomp) {
  Common.setDecomp(window.decomp);
}

const bowl = {
  leftTop: { x: 185, y: 850 },
  rightTop: { x: 715, y: 850 },
  leftBottom: { x: 275, y: 1065 },
  rightBottom: { x: 625, y: 1065 },
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
  best: Number(localStorage.getItem("cat-bowl-best") || 0),
  mode: "solo",
  screen: "title",
  player: 1,
  gameOver: false,
  lastDropAt: 0,
  cameraY: 0,
  targetCameraY: 0,
  pointerX: null,
  keys: new Set(),
};

hudBestEl.textContent = state.best;

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
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

  Composite.add(physics.engine.world, [
    wallFromSegment(bowl.leftTop, bowl.leftBottom, 34),
    wallFromSegment(bowl.leftBottom, bowl.rightBottom, 38),
    wallFromSegment(bowl.rightBottom, bowl.rightTop, 34),
  ]);

  Events.on(physics.engine, "collisionStart", (event) => {
    for (const pair of event.pairs) {
      const a = pair.bodyA.plugin.cat;
      const b = pair.bodyB.plugin.cat;
      if (a) a.stableFrames = 0;
      if (b) b.stableFrames = 0;
    }
  });
}

function reset(mode = state.mode) {
  if (physics.engine) Events.off(physics.engine);
  buildWorld();
  state.cats = [];
  state.active = null;
  state.aiming = true;
  state.score = 0;
  state.mode = mode;
  state.screen = "playing";
  state.player = 1;
  state.gameOver = false;
  state.lastDropAt = 0;
  state.cameraY = 0;
  state.targetCameraY = 0;
  titleScreen.hidden = true;
  gameOverScreen.hidden = true;
  spawn();
  updateHud();
}

function spawn() {
  state.active = makeCat();
  state.cats.push(state.active);
  state.aiming = true;
}

function updateHud() {
  hudScoreEl.textContent = state.score;
  hudBestEl.textContent = state.best;
  hudTurnEl.textContent = state.mode === "solo" ? "Solo" : `P${state.player}`;
}

function dropActive() {
  if (state.screen !== "playing" || !state.active || state.gameOver || !state.aiming) return;
  const body = state.active.body;
  Body.setStatic(body, false);
  Sleeping.set(body, false);
  Body.setVelocity(body, { x: 0, y: 1.1 });
  Body.setAngularVelocity(body, rand(-0.018, 0.018));
  Body.setPosition(body, { x: body.position.x, y: body.position.y + 1 });
  state.active.dropped = true;
  state.active.stableFrames = 0;
  state.aiming = false;
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
      localStorage.setItem("cat-bowl-best", String(state.best));
    }
  }
  if (state.mode === "versus") state.player = state.player === 1 ? 2 : 1;
  spawn();
  updateHud();
}

function lose(cat) {
  state.gameOver = true;
  state.aiming = false;
  state.screen = "gameover";
  const message =
    state.mode === "solo"
      ? `終了。${state.score}匹入りました。Retryでもう一回。`
      : `Player ${state.player} の負け。${cat?.name || "猫"} が器から出ました。`;
  gameOverMessageEl.textContent = message;
  gameOverScreen.hidden = false;
  updateHud();
}

function showTitle() {
  state.screen = "title";
  state.gameOver = false;
  state.aiming = false;
  titleScreen.hidden = false;
  gameOverScreen.hidden = true;
  updateHud();
}

function aimActive(dt) {
  if (state.screen !== "playing" || !state.aiming || !state.active) return;
  const body = state.active.body;
  const move = (state.keys.has("ArrowRight") ? 1 : 0) - (state.keys.has("ArrowLeft") ? 1 : 0);
  const rot = (state.keys.has("d") || state.keys.has("D") ? 1 : 0) - (state.keys.has("a") || state.keys.has("A") ? 1 : 0);
  const x = clamp(body.position.x + move * 420 * dt, 205, 695);
  const targetX = state.pointerX !== null ? clamp(state.pointerX, 205, 695) : x;
  Body.setPosition(body, { x: targetX, y: state.targetCameraY + 150 });
  Body.setAngle(body, body.angle + rot * 2.7 * dt);
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
    Engine.update(physics.engine, fixed);
    physics.accumulator -= fixed;
  }
  updateStability();
  updateCamera();

  for (const cat of state.cats) {
    const pos = cat.body.position;
    if (cat.dropped && (pos.y > bowl.leftBottom.y + 190 || pos.x < -190 || pos.x > W + 190)) {
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

function drawBowl() {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#5a8fa6";
  ctx.lineWidth = 28;
  ctx.beginPath();
  ctx.moveTo(bowl.leftTop.x, bowl.leftTop.y);
  ctx.lineTo(bowl.leftBottom.x, bowl.leftBottom.y);
  ctx.lineTo(bowl.rightBottom.x, bowl.rightBottom.y);
  ctx.lineTo(bowl.rightTop.x, bowl.rightTop.y);
  ctx.stroke();

  ctx.strokeStyle = "rgba(255,255,255,0.72)";
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.moveTo(bowl.leftTop.x + 18, bowl.leftTop.y + 22);
  ctx.lineTo(bowl.leftBottom.x + 14, bowl.leftBottom.y - 22);
  ctx.lineTo(bowl.rightBottom.x - 14, bowl.rightBottom.y - 22);
  ctx.lineTo(bowl.rightTop.x - 18, bowl.rightTop.y + 22);
  ctx.stroke();
  ctx.restore();
}

function drawCat(cat) {
  const body = cat.body;
  ctx.save();
  ctx.translate(body.position.x, body.position.y);
  ctx.rotate(body.angle);
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
  ctx.lineTo(x, Math.min(H - 90, bowl.leftBottom.y - state.cameraY - 70));
  ctx.stroke();
  ctx.restore();
}

function render() {
  ctx.clearRect(0, 0, W, H);

  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#d7f0f8";
  ctx.beginPath();
  ctx.arc(450, 1150, 620, Math.PI, 0);
  ctx.fill();

  drawAimGuide();
  ctx.save();
  ctx.translate(0, -state.cameraY);
  for (const cat of state.cats) {
    drawCat(cat);
    if (location.search.includes("debugHit=1")) drawHitShape(cat);
  }
  drawBowl();
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

canvas.addEventListener("pointermove", (event) => {
  const rect = canvas.getBoundingClientRect();
  state.pointerX = ((event.clientX - rect.left) / rect.width) * W;
});

canvas.addEventListener("click", (event) => {
  if (event.button !== 0) return;
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

function holdButton(button, onFrame) {
  let frame = 0;
  const start = (event) => {
    event.preventDefault();
    const tick = () => {
      onFrame();
      frame = requestAnimationFrame(tick);
    };
    tick();
  };
  const stop = () => cancelAnimationFrame(frame);
  button.addEventListener("pointerdown", start);
  button.addEventListener("pointerup", stop);
  button.addEventListener("pointercancel", stop);
  button.addEventListener("pointerleave", stop);
}

holdButton(document.querySelector("#leftBtn"), () => {
  if (state.aiming && state.active) {
    const pos = state.active.body.position;
    Body.setPosition(state.active.body, { x: clamp(pos.x - 7, 205, 695), y: state.targetCameraY + 150 });
  }
});
holdButton(document.querySelector("#rightBtn"), () => {
  if (state.aiming && state.active) {
    const pos = state.active.body.position;
    Body.setPosition(state.active.body, { x: clamp(pos.x + 7, 205, 695), y: state.targetCameraY + 150 });
  }
});
holdButton(document.querySelector("#rotLeftBtn"), () => {
  if (state.aiming && state.active) Body.rotate(state.active.body, -0.045);
});
holdButton(document.querySelector("#rotRightBtn"), () => {
  if (state.aiming && state.active) Body.rotate(state.active.body, 0.045);
});
document.querySelector("#dropBtn").addEventListener("click", dropActive);

titleSoloBtn.addEventListener("click", () => reset("solo"));
titleVersusBtn.addEventListener("click", () => reset("versus"));
retryBtn.addEventListener("click", () => reset(state.mode));
toTitleBtn.addEventListener("click", showTitle);

loadImages().then((images) => {
  state.loadedCats = images;
  buildWorld();
  if (images.length === 0) {
    gameOverMessageEl.textContent = "猫画像が読み込めませんでした。";
    gameOverScreen.hidden = false;
    return;
  }
  reset("solo");
  showTitle();
  requestAnimationFrame(loop);
});

