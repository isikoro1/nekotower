const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");

const gameHudEl = document.querySelector(".game-hud");
const hudScoreEl = document.querySelector("#hudScore");
const hudTurnEl = document.querySelector("#hudTurn");
const hudStreakEl = document.createElement("span");
const titleCatsEl = document.querySelector("#titleCats");
const titleMenuEl = document.querySelector("#titleMenu");
const playerNameRowEl = document.createElement("label");
const playerNameInputEl = document.createElement("input");
const howToPanelEl = document.querySelector("#howToPanel");
const titleScreen = document.querySelector("#titleScreen");
const gameOverScreen = document.querySelector("#gameOverScreen");
const gameOverTitleEl = document.querySelector("#gameOverTitle");
const gameOverMessageEl = document.querySelector("#gameOverMessage");
const shareBestStreakBtn = document.createElement("button");
const stageBowlBtn = document.querySelector("#stageBowlBtn");
const stagePlatformBtn = document.querySelector("#stagePlatformBtn");
const stageTowerBtn = document.querySelector("#stageTowerBtn");
const stageBottleBtn = document.querySelector("#stageBottleBtn");
const onlineBattleBtn = document.querySelector("#onlineBattleBtn");
const onlineStatusEl = document.querySelector("#onlineStatus");
const howToBtn = document.querySelector("#howToBtn");
const howToBackBtn = document.querySelector("#howToBackBtn");
const retryBtn = document.querySelector("#retryBtn");
const toTitleBtn = document.querySelector("#toTitleBtn");

hudStreakEl.id = "hudStreak";
if (typeof gameHudEl?.insertBefore === "function") {
  gameHudEl.insertBefore(hudStreakEl, hudTurnEl);
} else {
  gameHudEl?.appendChild?.(hudStreakEl);
}
shareBestStreakBtn.id = "shareBestStreakBtn";
shareBestStreakBtn.type = "button";
shareBestStreakBtn.textContent = "Xで共有";
shareBestStreakBtn.hidden = true;
gameOverScreen?.appendChild?.(shareBestStreakBtn);
playerNameRowEl.id = "playerNameRow";
playerNameRowEl.textContent = "Player Name";
playerNameInputEl.id = "playerNameInput";
playerNameInputEl.type = "text";
playerNameInputEl.inputMode = "latin";
playerNameInputEl.maxLength = 12;
playerNameInputEl.autocomplete = "nickname";
playerNameInputEl.value = getPlayerName();
playerNameRowEl.appendChild?.(playerNameInputEl);
titleMenuEl?.insertBefore?.(playerNameRowEl, onlineBattleBtn);

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
const ONLINE_AIM_SYNC_MS = 90;
const ONLINE_SNAPSHOT_MS = 40;
const CAT_RECENT_LIMIT = 18;
const ONLINE_TURN_LIMIT_MS = 15000;
const ONLINE_HEARTBEAT_MS = 3000;
const ONLINE_DISCONNECT_MS = 9000;

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
  matchmakingActive: false,
  lastDropAt: 0,
  cameraY: 0,
  targetCameraY: 0,
  pointerX: null,
  spinVelocity: 0,
  spinInput: 0,
  lastCatName: "",
  recentCatNames: [],
  catBag: [],
  onlineWinStreak: 0,
  onlineResultStreak: 0,
  keys: new Set(),
  online: {
    active: false,
    roomId: "",
    uid: "",
    hostUid: "",
    turnUid: "",
    turnNo: 1,
    turnStartedAt: 0,
    players: {},
    lastInputs: {},
    roomUnsubscribe: null,
    inputUnsubscribe: null,
    remoteDropActive: false,
    finished: false,
    resultRecorded: false,
    turnNoticeText: "",
    turnNoticeAt: 0,
    lastAimSyncAt: 0,
    lastSnapshotAt: 0,
    localTurnSetupPublished: 0,
    lastSnapshotKey: "",
    pendingDropTurnNo: 0,
    lastHeartbeatAt: 0,
    comAi: null,
  },
};

const MEOW_SOUNDS = [
  "./assets/audio/cat-meow-1.mp3",
  "./assets/audio/cat-meow-2.mp3",
  "./assets/audio/cat-meow-3.mp3",
];

const meowPlayers = MEOW_SOUNDS.map((src) => {
  const player = new Audio(src);
  player.preload = "auto";
  player.volume = 0.72;
  return player;
});
let lastMeowIndex = -1;

function bestKey(stage) {
  return `cat-bowl-best:${stage}`;
}

function getBest(stage) {
  return Number(localStorage.getItem(bestKey(stage)) || 0);
}

function playerNameKey() {
  return "cat-bowl-player-name";
}

function sanitizePlayerName(name = "") {
  return String(name).replace(/[^a-zA-Z0-9]/g, "").slice(0, 12);
}

function getPlayerName() {
  return sanitizePlayerName(localStorage.getItem(playerNameKey()) || "") || "Player";
}

function savePlayerName(name) {
  const cleaned = sanitizePlayerName(name) || "Player";
  localStorage.setItem(playerNameKey(), cleaned);
  playerNameInputEl.value = cleaned;
  return cleaned;
}

state.best = getBest(state.stage);

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function timeValue(value, fallback = Date.now()) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function easeOutCubic(value) {
  return 1 - Math.pow(1 - value, 3);
}

function setResultTone(tone = "") {
  gameOverScreen.classList?.toggle("win", tone === "win");
  gameOverScreen.classList?.toggle("lose", tone === "lose");
}

function hasResultTone(tone) {
  return Boolean(gameOverScreen.classList?.contains(tone));
}

function clearResultTone() {
  setResultTone("");
}

function currentCatNumber() {
  return state.score + 1;
}

function playMeow() {
  let index = Math.floor(Math.random() * meowPlayers.length);
  if (meowPlayers.length > 1 && index === lastMeowIndex) {
    index = (index + 1 + Math.floor(Math.random() * (meowPlayers.length - 1))) % meowPlayers.length;
  }
  lastMeowIndex = index;
  const basePlayer = meowPlayers[index];
  if (!basePlayer) return;
  const player = basePlayer.cloneNode();
  player.volume = basePlayer.volume;
  player.play().catch(() => {});
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

function findCatAsset(name) {
  return state.loadedCats.find((asset) => asset.name === name) || null;
}

function refillCatBag() {
  const recent = new Set(state.recentCatNames);
  const current = new Set(state.cats.map((cat) => cat.name));
  state.catBag = state.loadedCats
    .filter((asset) => asset.name !== state.lastCatName && !recent.has(asset.name) && !current.has(asset.name))
    .sort(() => Math.random() - 0.5)
    .map((asset) => asset.name);
  if (state.catBag.length === 0) {
    state.recentCatNames = state.lastCatName ? [state.lastCatName] : [];
    state.catBag = state.loadedCats
      .filter((asset) => asset.name !== state.lastCatName && !current.has(asset.name))
      .sort(() => Math.random() - 0.5)
      .map((asset) => asset.name);
  }
  if (state.catBag.length === 0) {
    state.catBag = state.loadedCats
      .filter((asset) => asset.name !== state.lastCatName)
      .sort(() => Math.random() - 0.5)
      .map((asset) => asset.name);
  }
}

function chooseCatAsset() {
  if (state.catBag.length === 0) refillCatBag();
  const name = state.catBag.shift();
  return findCatAsset(name) || state.loadedCats[Math.floor(Math.random() * state.loadedCats.length)];
}

function chooseCatName() {
  return chooseCatAsset()?.name || state.loadedCats[0]?.name || "";
}

function makeCat(assetName = "") {
  const asset = findCatAsset(assetName) || findCatAsset(chooseCatName()) || state.loadedCats[0];
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
    aimSpinVelocity: 0,
    curveSpin: 0,
    droppedAt: 0,
    spawnedAt: performance.now(),
    onlineTurnNo: state.online.turnNo,
    renderFrom: null,
    renderTo: null,
    renderSyncAt: 0,
  };
  cat.body = makeCatBody(cat);
  Body.setStatic(cat.body, true);
  Composite.add(physics.engine.world, cat.body);
  return cat;
}

function rememberCatName(name) {
  if (!name) return;
  state.lastCatName = name;
  state.recentCatNames = [name, ...state.recentCatNames.filter((recentName) => recentName !== name)].slice(0, CAT_RECENT_LIMIT);
  state.catBag = state.catBag.filter((queuedName) => queuedName !== name);
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
      wallFromSegment({ x: 300, y: 1015 }, { x: 225, y: 740 }, 34),
      wallFromSegment({ x: 600, y: 1015 }, { x: 675, y: 740 }, 34),
      wallFromSegment({ x: 300, y: 1015 }, { x: 600, y: 1015 }, 36),
      wallFromSegment({ x: 225, y: 740 }, { x: 330, y: 610 }, 30),
      wallFromSegment({ x: 675, y: 740 }, { x: 570, y: 610 }, 30),
    ];
  }

  return [
    wallFromSegment({ x: 185, y: 930 }, { x: 275, y: 1065 }, 34),
    wallFromSegment({ x: 275, y: 1065 }, { x: 625, y: 1065 }, 38),
    wallFromSegment({ x: 625, y: 1065 }, { x: 715, y: 930 }, 34),
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

function clearOnlineSession(resetStatus = true) {
  state.online.roomUnsubscribe?.();
  state.online.inputUnsubscribe?.();
  state.online = {
    active: false,
    roomId: "",
    uid: "",
    hostUid: "",
    turnUid: "",
    turnNo: 1,
    turnStartedAt: 0,
    players: {},
    lastInputs: {},
    roomUnsubscribe: null,
    inputUnsubscribe: null,
    remoteDropActive: false,
    finished: false,
    resultRecorded: false,
    turnNoticeText: "",
    turnNoticeAt: 0,
    lastAimSyncAt: 0,
    lastSnapshotAt: 0,
    localTurnSetupPublished: 0,
    lastSnapshotKey: "",
    pendingDropTurnNo: 0,
    lastHeartbeatAt: 0,
    comAi: null,
  };
  if (resetStatus) updateOnlineEntry();
}

function reset(stage = state.stage, options = {}) {
  if (physics.engine) Events.off(physics.engine);
  if (!options.keepOnline) clearOnlineSession(false);
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
  state.lastCatName = "";
  state.recentCatNames = [];
  state.catBag = [];
  titleScreen.hidden = true;
  gameOverScreen.hidden = true;
  updateShareBestStreakButton(false);
  spawn();
  updateHud();
}

function spawn(assetName = "") {
  resetAimSpin();
  state.active = makeCat(assetName);
  rememberCatName(state.active.name);
  state.cats.push(state.active);
  state.aiming = true;
  playMeow();
}

function resetAimSpin() {
  state.spinInput = 0;
  state.spinVelocity = 0;
  if (state.active) state.active.aimSpinVelocity = 0;
}

function updateHud() {
  hudScoreEl.textContent = currentCatNumber();
  hudStreakEl.textContent = state.onlineWinStreak > 0 ? `${state.onlineWinStreak}連勝中` : "連勝 0";
  if (state.online.active) {
    if (state.online.finished) {
      hudTurnEl.textContent = "Online";
    } else {
      hudTurnEl.textContent = state.online.turnUid === state.online.uid ? "あなたの番" : `${opponentName()}の番`;
    }
  } else if (state.matchmakingActive) {
    hudTurnEl.textContent = "マッチ待ち";
  } else {
    hudTurnEl.textContent = STAGES[state.stage]?.label || "Stage";
  }
}

function recordOnlineResult(didLose) {
  if (!state.online.active || state.online.resultRecorded) return;
  state.online.resultRecorded = true;
  if (didLose) {
    state.onlineResultStreak = state.onlineWinStreak;
    state.onlineWinStreak = 0;
  } else {
    state.onlineWinStreak += 1;
    state.onlineResultStreak = state.onlineWinStreak;
  }
}

function streakMessage(didLose = false) {
  return didLose ? `${state.onlineResultStreak}連勝` : `${state.onlineResultStreak}連勝中`;
}

function shareBestStreakUrl() {
  const streak = state.onlineResultStreak;
  const text =
    state.onlineWinStreak > 0
      ? `ねこタワーのオンライン対戦で${streak}連勝中！ #ねこタワー`
      : `ねこタワーのオンライン対戦で${streak}連勝しました！ #ねこタワー`;
  const url = window.location?.origin && window.location.origin !== "null" ? window.location.origin : "https://nekotower.isikoro.dev/";
  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
}

function updateShareBestStreakButton(visible = false) {
  shareBestStreakBtn.hidden = !visible || state.onlineResultStreak <= 0;
}

function updateOnlineEntry() {
  const online = window.NekoTowerOnline;
  if (!onlineBattleBtn || !onlineStatusEl) return;
  if (!online?.isEnabled?.()) {
    onlineBattleBtn.disabled = true;
    onlineStatusEl.textContent = "オンライン対戦は準備中です";
    return;
  }
  onlineBattleBtn.disabled = false;
  onlineStatusEl.textContent = "オンライン接続を確認できます";
}

async function startOnlineBattle() {
  const online = window.NekoTowerOnline;
  if (!online?.isEnabled?.()) {
    updateOnlineEntry();
    return;
  }
  if (state.matchmakingActive || state.online.active) return;
  const playerName = savePlayerName(playerNameInputEl.value);
  reset("bowl");
  state.matchmakingActive = true;
  updateHud();
  onlineStatusEl.textContent = "対戦相手を待っています...";
  online.startMatchmaking({ displayName: playerName }).catch(() => {
    state.matchmakingActive = false;
    updateHud();
    onlineStatusEl.textContent = "オンライン接続に失敗しました";
  }).then((result) => {
    if (!result) return;
    state.matchmakingActive = false;
    updateHud();
    if (result.status === "matched") {
      startOnlineSession(result).catch(() => {
        onlineStatusEl.textContent = "オンライン対戦の開始に失敗しました";
      });
    } else if (result.status === "waiting") {
      onlineStatusEl.textContent = "対戦相手を待っています";
    } else if (result.status === "full") {
      onlineStatusEl.textContent = "ただいま混雑中です。少し待ってください";
    } else if (result.status === "timeout") {
      onlineStatusEl.textContent = "マッチングがタイムアウトしました";
    } else {
      onlineStatusEl.textContent = "接続OK。マッチングを確認しました";
    }
  });
}

async function startOnlineSession(match) {
  const online = window.NekoTowerOnline;
  const client = await online.initialize();
  state.online.active = true;
  state.online.roomId = match.roomId;
  state.online.uid = client.user.uid;
  state.online.lastInputs = {};
  state.online.finished = false;
  state.online.resultRecorded = false;
  onlineStatusEl.textContent = "マッチしました。対戦開始";
  reset("bowl", { keepOnline: true });

  state.online.roomUnsubscribe = await online.watchRoom(match.roomId, (room) => {
    if (!room) return;
    const previousTurnUid = state.online.turnUid;
    state.online.hostUid = room.hostUid || "";
    state.online.turnUid = room.turnUid || "";
    state.online.turnNo = Number(room.turnNo || 1);
    state.online.turnStartedAt = timeValue(room.turnStartedAt);
    state.online.players = room.players || {};
    const matchedOpponentName = opponentName();
    if (matchedOpponentName !== "Opponent" && !state.online.finished) {
      onlineStatusEl.textContent = `${matchedOpponentName} とマッチしました`;
    }
    if (room.stage && room.stage !== state.stage && STAGES[room.stage]) {
      reset(room.stage, { keepOnline: true });
    }
    if (state.online.turnUid && state.online.turnUid !== previousTurnUid) {
      state.online.pendingDropTurnNo = 0;
      resetComAi();
      showTurnNotice(state.online.turnUid === state.online.uid ? "あなたの番" : `${opponentName()}の番`);
    }
    syncOnlineTurnSetup(room);
    if (room.status === "finished") {
      showOnlineResult(room);
      return;
    }
    applyOnlineSnapshot(room.snapshot);
    if (room.status === "matching") {
      online.updateRoom(match.roomId, {
        status: "playing",
        updatedAt: Date.now(),
      }).catch(() => {});
    }
    updateHud();
  });

  state.online.inputUnsubscribe = await online.watchInputs(match.roomId, (inputs) => {
    handleOnlineInputs(inputs);
  });
}

function onlinePlayerUids() {
  return Object.keys(state.online.players || {}).sort((a, b) => {
    if (a === state.online.hostUid) return -1;
    if (b === state.online.hostUid) return 1;
    return a.localeCompare(b);
  });
}

function nextOnlineTurnUid() {
  const players = onlinePlayerUids();
  if (players.length < 2) return state.online.uid;
  const index = players.indexOf(state.online.turnUid);
  return players[(index + 1 + players.length) % players.length];
}

function isOnlineMyTurn() {
  return !state.online.active || state.online.turnUid === state.online.uid;
}

function isOnlineHost() {
  return state.online.active && state.online.hostUid === state.online.uid;
}

function isPlayerDisconnected(uid) {
  if (!uid || uid === state.online.uid) return false;
  const player = state.online.players?.[uid];
  return Date.now() - timeValue(player?.lastSeenAt, 0) > ONLINE_DISCONNECT_MS;
}

function isOnlineAuthority() {
  return isOnlineHost() || (state.online.active && isPlayerDisconnected(state.online.hostUid));
}

function onlineName(uid) {
  if (!state.online.active) return "";
  if (uid === state.online.uid) return getPlayerName();
  return sanitizePlayerName(state.online.players?.[uid]?.displayName || "") || "Opponent";
}

function opponentUid() {
  return onlinePlayerUids().find((uid) => uid !== state.online.uid) || "";
}

function opponentName() {
  return onlineName(opponentUid()) || "Opponent";
}

function showTurnNotice(text) {
  state.online.turnNoticeText = text;
  state.online.turnNoticeAt = performance.now();
}

function handleOnlineInputs(inputs) {
  if (!state.online.active || state.gameOver) return;
  for (const [uid, input] of Object.entries(inputs || {})) {
    if (uid === state.online.uid) continue;
    const inputTurnNo = Number(input?.turnNo || 0);
    if (inputTurnNo !== state.online.turnNo) continue;
    if (state.aiming && state.online.turnUid === uid && state.active && !state.active.dropped) {
      applyRemoteAim(input);
    }
    const dropRequestedAt = Number(input?.dropRequestedAt || 0);
    if (!dropRequestedAt || state.online.lastInputs[uid] === dropRequestedAt) continue;
    state.online.lastInputs[uid] = dropRequestedAt;
    if (state.aiming && state.online.turnUid === uid) {
      applyRemoteAim(input);
      state.online.remoteDropActive = true;
      dropActive("remote");
    }
  }
}

function syncOnlineTurnSetup(room) {
  if (!state.online.active || !state.active || state.gameOver) return;
  const turnNo = Number(room.turnNo || 1);
  const currentCatName = room.currentCatName || "";
  if (currentCatName && (state.active.name !== currentCatName || state.active.onlineTurnNo !== turnNo)) {
    replaceActiveCat(currentCatName, turnNo);
    applyRemoteAim({
      aimX: Number(room.currentAimX || W / 2),
      angle: Number(room.currentAngle || 0),
      spinVelocity: 0,
    });
    return;
  }
  if (!currentCatName && state.online.turnUid === state.online.uid && state.online.localTurnSetupPublished !== turnNo) {
    state.online.localTurnSetupPublished = turnNo;
    publishOnlineTurnSetup();
  }
}

function replaceActiveCat(catName, turnNo) {
  if (!state.active || state.active.dropped) return;
  resetAimSpin();
  Composite.remove(physics.engine.world, state.active.body);
  const index = state.cats.indexOf(state.active);
  if (index >= 0) state.cats.splice(index, 1);
  state.active = makeCat(catName);
  state.active.onlineTurnNo = turnNo;
  rememberCatName(state.active.name);
  state.cats.push(state.active);
}

function publishOnlineTurnSetup() {
  if (!state.online.active || !state.active) return;
  window.NekoTowerOnline?.updateRoom?.(state.online.roomId, {
    currentCatName: state.active.name,
    currentAimX: state.active.body.position.x,
    currentAngle: state.active.body.angle,
    updatedAt: Date.now(),
  }).catch(() => {});
}

function applyRemoteAim(input = {}) {
  if (!state.active || state.active.dropped) return;
  const x = clamp(Number(input.aimX || W / 2), AIM_MIN_X, AIM_MAX_X);
  const angle = Number.isFinite(Number(input.angle)) ? Number(input.angle) : state.active.body.angle;
  Body.setPosition(state.active.body, { x, y: state.targetCameraY + 150 });
  Body.setAngle(state.active.body, angle);
  state.active.aimSpinVelocity = clamp(Number(input.spinVelocity || 0), -ROT_MAX, ROT_MAX);
}

function catSnapshot(cat) {
  return {
    name: cat.name,
    x: Math.round(cat.body.position.x * 10) / 10,
    y: Math.round(cat.body.position.y * 10) / 10,
    angle: Math.round(cat.body.angle * 10000) / 10000,
    vx: Math.round(cat.body.velocity.x * 1000) / 1000,
    vy: Math.round(cat.body.velocity.y * 1000) / 1000,
    angularVelocity: Math.round(cat.body.angularVelocity * 10000) / 10000,
    dropped: Boolean(cat.dropped),
    counted: Boolean(cat.counted),
    stableFrames: cat.stableFrames,
  };
}

function publishOnlineSnapshot(force = false) {
  if (!isOnlineAuthority() || state.screen !== "playing") return;
  const now = performance.now();
  if (!force && now - state.online.lastSnapshotAt < ONLINE_SNAPSHOT_MS) return;
  state.online.lastSnapshotAt = now;
  window.NekoTowerOnline?.updateRoom?.(state.online.roomId, {
    snapshot: {
      updatedAt: Date.now(),
      turnNo: state.online.turnNo,
      turnUid: state.online.turnUid,
      score: state.score,
      aiming: state.aiming,
      cameraY: Math.round(state.cameraY * 10) / 10,
      targetCameraY: Math.round(state.targetCameraY * 10) / 10,
      activeIndex: Math.max(0, state.cats.indexOf(state.active)),
      cats: state.cats.map(catSnapshot),
    },
    updatedAt: Date.now(),
  }).catch(() => {});
}

function applyOnlineSnapshot(snapshot) {
  if (!state.online.active || isOnlineAuthority() || !snapshot?.cats?.length) return;
  if (state.online.turnUid === state.online.uid && state.aiming && state.active && !state.active.dropped) return;
  if (
    state.online.pendingDropTurnNo &&
    Number(snapshot.turnNo || 0) === state.online.pendingDropTurnNo &&
    snapshot.aiming &&
    !snapshot.cats[Number(snapshot.activeIndex || 0)]?.dropped
  ) {
    return;
  }
  const key = `${snapshot.updatedAt || ""}:${snapshot.cats.length}:${snapshot.activeIndex}`;
  if (key === state.online.lastSnapshotKey) return;
  state.online.lastSnapshotKey = key;

  while (state.cats.length > snapshot.cats.length) {
    const cat = state.cats.pop();
    if (cat?.body) Composite.remove(physics.engine.world, cat.body);
  }

  for (let i = 0; i < snapshot.cats.length; i += 1) {
    const data = snapshot.cats[i];
    let cat = state.cats[i];
    if (!cat || cat.name !== data.name) {
      if (cat?.body) Composite.remove(physics.engine.world, cat.body);
      cat = makeCat(data.name);
      state.cats[i] = cat;
      rememberCatName(cat.name);
    }
    const previousX = cat.renderTo?.x ?? cat.body.position.x;
    const previousY = cat.renderTo?.y ?? cat.body.position.y;
    const previousAngle = cat.renderTo?.angle ?? cat.body.angle;
    Body.setStatic(cat.body, !data.dropped);
    Body.setPosition(cat.body, { x: Number(data.x || W / 2), y: Number(data.y || state.targetCameraY + 150) });
    Body.setAngle(cat.body, Number(data.angle || 0));
    Body.setVelocity(cat.body, { x: Number(data.vx || 0), y: Number(data.vy || 0) });
    Body.setAngularVelocity(cat.body, Number(data.angularVelocity || 0));
    cat.renderFrom = { x: previousX, y: previousY, angle: previousAngle };
    cat.renderTo = { x: cat.body.position.x, y: cat.body.position.y, angle: cat.body.angle };
    cat.renderSyncAt = performance.now();
    cat.dropped = Boolean(data.dropped);
    cat.counted = Boolean(data.counted);
    cat.stableFrames = Number(data.stableFrames || 0);
  }

  state.active = state.cats[Number(snapshot.activeIndex || 0)] || state.cats[state.cats.length - 1] || null;
  state.score = Number(snapshot.score || 0);
  state.aiming = Boolean(snapshot.aiming);
  const activeData = snapshot.cats[Number(snapshot.activeIndex || 0)];
  if (!state.aiming || activeData?.dropped || Number(snapshot.turnNo || 0) !== state.online.pendingDropTurnNo) {
    state.online.pendingDropTurnNo = 0;
  }
  state.cameraY = Number(snapshot.cameraY || 0);
  state.targetCameraY = Number(snapshot.targetCameraY || 0);
  updateHud();
}

function syncOnlineAim(force = false) {
  if (!state.online.active || state.online.turnUid !== state.online.uid || !state.active || !state.aiming) return;
  const now = performance.now();
  if (!force && now - state.online.lastAimSyncAt < ONLINE_AIM_SYNC_MS) return;
  state.online.lastAimSyncAt = now;
  window.NekoTowerOnline?.updateInput?.(state.online.roomId, state.online.uid, {
    turnNo: state.online.turnNo,
    aimX: state.active.body.position.x,
    angle: state.active.body.angle,
    spinVelocity: state.spinVelocity,
    updatedAt: Date.now(),
  }).catch(() => {});
}

function syncOnlineHeartbeat() {
  if (!state.online.active || state.online.finished) return;
  const now = Date.now();
  if (now - state.online.lastHeartbeatAt < ONLINE_HEARTBEAT_MS) return;
  state.online.lastHeartbeatAt = now;
  window.NekoTowerOnline?.updateRoom?.(state.online.roomId, {
    [`players/${state.online.uid}/lastSeenAt`]: now,
    [`players/${state.online.uid}/connected`]: true,
    updatedAt: now,
  }).catch(() => {});
}

function autoAimForTurn() {
  if (!state.active || !state.aiming) return;
  const direction = Math.sin((state.online.turnNo + 1) * 2.17);
  const x = clamp(W / 2 + direction * 220, AIM_MIN_X, AIM_MAX_X);
  const spin = clamp(Math.cos((state.online.turnNo + 3) * 1.73) * 0.08, -ROT_MAX, ROT_MAX);
  Body.setPosition(state.active.body, { x, y: state.targetCameraY + 150 });
  Body.setAngle(state.active.body, state.active.body.angle + spin);
  state.spinVelocity = spin;
  state.active.aimSpinVelocity = spin;
}

function resetComAi() {
  state.online.comAi = null;
}

function ensureComAi(now) {
  if (state.online.comAi?.turnNo === state.online.turnNo) return state.online.comAi;
  state.online.comAi = {
    turnNo: state.online.turnNo,
    startedAt: now,
    dropAt: now + rand(1000, 4000),
    nextActionAt: now,
    move: 0,
    spin: 0,
  };
  return state.online.comAi;
}

function chooseComAction(ai, now) {
  if (now < ai.nextActionAt) return;
  ai.nextActionAt = now + rand(220, 780);
  ai.move = Math.random() < 0.38 ? 0 : Math.random() < 0.5 ? -1 : 1;
  ai.spin = Math.random() < 0.36 ? 0 : Math.random() < 0.5 ? -1 : 1;
}

function updateComAiForTurn(dt) {
  if (!state.active || !state.aiming) return false;
  const now = Date.now();
  const ai = ensureComAi(now);
  chooseComAction(ai, now);

  const body = state.active.body;
  const x = clamp(body.position.x + ai.move * 270 * dt, AIM_MIN_X, AIM_MAX_X);
  const currentSpin = Number(state.active.aimSpinVelocity || 0);
  const spinVelocity = ai.spin
    ? clamp(currentSpin + ai.spin * ROT_ACCEL * 60 * dt, -ROT_MAX, ROT_MAX)
    : currentSpin * 0.985;

  Body.setPosition(body, { x, y: state.targetCameraY + 150 });
  Body.setAngle(body, body.angle + spinVelocity);
  state.active.aimSpinVelocity = Math.abs(spinVelocity) < 0.0007 ? 0 : spinVelocity;

  return now >= ai.dropAt;
}

function updateOnlineTurnTimer(dt) {
  if (!state.online.active || state.online.finished || !isOnlineAuthority() || !state.aiming || !state.active) return;
  const elapsed = Date.now() - state.online.turnStartedAt;
  const disconnected = isPlayerDisconnected(state.online.turnUid);
  if (state.online.turnUid === state.online.uid || !disconnected) resetComAi();
  if (state.online.turnUid !== state.online.uid && disconnected) {
    if (!updateComAiForTurn(dt)) return;
    state.online.remoteDropActive = true;
    dropActive("remote");
    resetComAi();
    return;
  }
  if (elapsed < ONLINE_TURN_LIMIT_MS && !disconnected) return;
  if (state.online.turnUid !== state.online.uid) {
    autoAimForTurn();
    state.online.remoteDropActive = true;
    dropActive("remote");
  } else {
    dropActive("local");
  }
}

function showOnlineResult(room) {
  state.online.finished = true;
  state.gameOver = true;
  state.aiming = false;
  state.screen = "gameover";
  const didLose = room.loserUid === state.online.uid;
  recordOnlineResult(didLose);
  const title = didLose ? "YOU LOSE" : "YOU WIN!!";
  const finalScore = Number(room.finalScore || room.snapshot?.score + 1 || currentCatNumber());
  const message = didLose
    ? `${finalScore}匹目で負け。${streakMessage(true)}`
    : `相手が${finalScore}匹目で落としました。${streakMessage(false)}`;
  setResultTone(didLose ? "lose" : "win");
  gameOverTitleEl.textContent = title;
  gameOverMessageEl.textContent = message;
  updateShareBestStreakButton(true);
  gameOverScreen.hidden = false;
  updateHud();
}

function finishOnlineLoss(loserUid = state.online.turnUid || state.online.uid) {
  if (!state.online.active || state.online.finished) return;
  const players = onlinePlayerUids();
  const winnerUid = players.find((uid) => uid !== loserUid) || nextOnlineTurnUid();
  window.NekoTowerOnline?.updateRoom?.(state.online.roomId, {
    status: "finished",
    updatedAt: Date.now(),
    loserUid,
    winnerUid,
    finalScore: currentCatNumber(),
    reason: "fell",
  }).catch(() => {});
}

function dropActive(source = "local") {
  if (state.screen !== "playing" || !state.active || state.gameOver || !state.aiming) return;
  if (source === "local" && !isOnlineMyTurn()) return;
  if (source === "local" && state.online.active) syncOnlineAim(true);
  const body = state.active.body;
  Body.setStatic(body, false);
  Sleeping.set(body, false);
  Body.setVelocity(body, { x: 0, y: 1.8 });
  const aimSpin = source === "local" ? state.spinVelocity : Number(state.active.aimSpinVelocity || 0);
  const hasCurveSpin = Math.abs(aimSpin) > 0.004;
  const spin = hasCurveSpin ? aimSpin * DROP_SPIN_MULTIPLIER : rand(-0.012, 0.012);
  Body.setAngularVelocity(body, spin);
  state.active.curveSpin = hasCurveSpin ? spin : 0;
  Body.setPosition(body, { x: body.position.x, y: body.position.y + 3 });
  state.active.dropped = true;
  state.active.droppedAt = performance.now();
  state.active.stableFrames = 0;
  state.aiming = false;
  state.spinInput = 0;
  state.spinVelocity = 0;
  state.lastDropAt = performance.now();
  updateHud();
  if (state.online.active) {
    if (source === "local") state.online.pendingDropTurnNo = state.online.turnNo;
    if (isOnlineHost()) publishOnlineSnapshot(true);
  }
  if (source === "local" && state.online.active) {
    window.NekoTowerOnline?.updateInput?.(state.online.roomId, state.online.uid, {
      turnNo: state.online.turnNo,
      aimX: body.position.x,
      angle: body.angle,
      spinVelocity: spin,
      dropRequestedAt: Date.now(),
      updatedAt: Date.now(),
    }).catch(() => {});
  }
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
  if (state.online.active) {
    if (isOnlineAuthority()) {
      const nextCatName = chooseCatName();
      window.NekoTowerOnline?.updateRoom?.(state.online.roomId, {
        turnUid: nextOnlineTurnUid(),
        turnNo: state.online.turnNo + 1,
        turnStartedAt: Date.now(),
        currentCatName: nextCatName,
        currentAimX: W / 2,
        currentAngle: 0,
        updatedAt: Date.now(),
      }).catch(() => {});
      spawn(nextCatName);
    } else {
      spawn();
    }
    state.online.remoteDropActive = false;
    updateHud();
    return;
  }
  spawn();
  updateHud();
}

function lose(cat) {
  if (state.online.active) finishOnlineLoss(state.online.turnUid || state.online.uid);
  state.gameOver = true;
  state.aiming = false;
  state.screen = "gameover";
  const didLose = !state.online.active || state.online.turnUid === state.online.uid;
  if (state.online.active) recordOnlineResult(didLose);
  setResultTone(state.online.active ? (didLose ? "lose" : "win") : "");
  gameOverTitleEl.textContent = state.online.active ? (didLose ? "YOU LOSE" : "YOU WIN!!") : "GAME OVER";
  const message = state.online.active
    ? (didLose
        ? `${currentCatNumber()}匹目で負け。${streakMessage(true)}`
        : `相手が${currentCatNumber()}匹目で落としました。${streakMessage(false)}`)
    : `終了。${state.score}匹入りました。Retryでもう一回。`;
  gameOverMessageEl.textContent = message;
  updateShareBestStreakButton(state.online.active);
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
  clearOnlineSession();
  state.matchmakingActive = false;
  gameOverTitleEl.textContent = "GAME OVER";
  clearResultTone();
  state.screen = "title";
  state.gameOver = false;
  state.aiming = false;
  titleScreen.hidden = false;
  gameOverScreen.hidden = true;
  updateShareBestStreakButton(false);
  showTitleMenu();
  updateHud();
}

function retryGame() {
  if (!state.online.active) {
    state.matchmakingActive = false;
    reset(state.stage);
    return;
  }
  clearOnlineSession(false);
  state.matchmakingActive = false;
  state.screen = "title";
  state.gameOver = false;
  state.aiming = false;
  gameOverTitleEl.textContent = "GAME OVER";
  clearResultTone();
  gameOverScreen.hidden = true;
  updateShareBestStreakButton(false);
  titleScreen.hidden = false;
  showTitleMenu();
  updateOnlineEntry();
  startOnlineBattle();
}

function aimActive(dt) {
  if (state.screen !== "playing" || !state.aiming || !state.active) return;
  if (state.online.active && state.online.turnUid !== state.online.uid) return;
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
  state.active.aimSpinVelocity = state.spinVelocity;
  syncOnlineAim();
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

  syncOnlineHeartbeat();
  updateOnlineTurnTimer(dt);
  if (state.online.active) updateHud();

  aimActive(dt);

  if (state.online.active && !isOnlineAuthority()) {
    if (state.online.pendingDropTurnNo && state.active?.dropped) {
      const fixed = 1000 / 120;
      physics.accumulator = Math.min(physics.accumulator + dt * 1000, 80);
      while (physics.accumulator >= fixed) {
        applySpinCurveForces();
        Engine.update(physics.engine, fixed);
        physics.accumulator -= fixed;
      }
      updateStability();
      updateCamera();
    }
    return;
  }

  const fixed = 1000 / 120;
  physics.accumulator = Math.min(physics.accumulator + dt * 1000, 80);
  while (physics.accumulator >= fixed) {
    applySpinCurveForces();
    Engine.update(physics.engine, fixed);
    physics.accumulator -= fixed;
  }
  updateStability();
  updateCamera();
  publishOnlineSnapshot();

  if (!state.online.active || isOnlineAuthority()) {
    for (const cat of state.cats) {
      const pos = cat.body.position;
      if (cat.dropped && (pos.y > STAGES[state.stage].failY || pos.x < -190 || pos.x > W + 190)) {
        lose(cat);
        publishOnlineSnapshot(true);
        return;
      }
    }
  }

  if ((!state.online.active || isOnlineAuthority()) && !state.aiming && state.active && performance.now() - state.lastDropAt > 900) {
    const activeDropped = state.active.dropped && !state.active.body.isStatic;
    const activeMoved = state.active.body.position.y > state.targetCameraY + 190 || performance.now() - state.lastDropAt > 2600;
    const allSlow = state.cats.every((cat) => !cat.dropped || cat.stableFrames > 18 || cat.body.isSleeping);
    if (activeDropped && activeMoved && allSlow) {
      nextTurn();
      publishOnlineSnapshot(true);
    }
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
    ctx.moveTo(300, 1015);
    ctx.lineTo(225, 740);
    ctx.lineTo(330, 610);
    ctx.moveTo(600, 1015);
    ctx.lineTo(675, 740);
    ctx.lineTo(570, 610);
    ctx.moveTo(300, 1015);
    ctx.lineTo(600, 1015);
    ctx.stroke();
    ctx.fillStyle = "rgba(180, 230, 245, 0.18)";
    ctx.beginPath();
    ctx.moveTo(305, 1005);
    ctx.lineTo(245, 750);
    ctx.lineTo(345, 635);
    ctx.lineTo(555, 635);
    ctx.lineTo(655, 750);
    ctx.lineTo(595, 1005);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(185, 930);
    ctx.lineTo(275, 1065);
    ctx.lineTo(625, 1065);
    ctx.lineTo(715, 930);
    ctx.stroke();

    ctx.strokeStyle = "rgba(255,255,255,0.72)";
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(203, 948);
    ctx.lineTo(289, 1043);
    ctx.lineTo(611, 1043);
    ctx.lineTo(697, 948);
    ctx.stroke();
  }
  ctx.restore();
}

function drawCat(cat) {
  const body = cat.body;
  let x = body.position.x;
  let y = body.position.y;
  let angle = body.angle;
  let scale = 1;
  if (
    state.online.active &&
    !isOnlineAuthority() &&
    cat.renderFrom &&
    cat.renderTo &&
    !(cat === state.active && state.aiming && state.online.turnUid === state.online.uid)
  ) {
    const t = easeOutCubic(clamp((performance.now() - cat.renderSyncAt) / Math.max(70, ONLINE_SNAPSHOT_MS * 2.8), 0, 1));
    x = cat.renderFrom.x + (cat.renderTo.x - cat.renderFrom.x) * t;
    y = cat.renderFrom.y + (cat.renderTo.y - cat.renderFrom.y) * t;
    angle = cat.renderFrom.angle + (cat.renderTo.angle - cat.renderFrom.angle) * t;
  }
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
  ctx.rotate(angle);
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
  const spinVelocity = Number(cat.aimSpinVelocity || 0);
  const charge = clamp((Math.abs(spinVelocity) - ROT_FAST_THRESHOLD) / (ROT_MAX - ROT_FAST_THRESHOLD), 0, 1);
  if (charge <= 0) return;

  const body = cat.body;
  const time = performance.now() / 1000;
  const direction = spinVelocity >= 0 ? 1 : -1;
  const radius = Math.max(cat.drawW, cat.drawH) * (0.48 + charge * 0.2);
  const flameCount = 9 + Math.round(charge * 10);
  const spin = time * direction * (4.4 + charge * 8.2);
  ctx.save();
  ctx.translate(body.position.x, body.position.y);
  ctx.rotate(body.angle);
  ctx.globalCompositeOperation = "lighter";

  ctx.globalAlpha = 0.2 + charge * 0.42;
  ctx.strokeStyle = `rgba(255, 68, 18, ${0.32 + charge * 0.36})`;
  ctx.lineWidth = 8 + charge * 14;
  ctx.beginPath();
  ctx.arc(0, 0, radius * (0.78 + charge * 0.16), spin, spin + Math.PI * 1.65 * direction, direction < 0);
  ctx.stroke();

  for (let i = 0; i < flameCount; i += 1) {
    const angle = spin + (Math.PI * 2 * i) / flameCount;
    const wave = 0.5 + 0.5 * Math.sin(time * 12 + i * 1.9);
    const base = radius * (0.72 + wave * 0.14);
    const length = (22 + wave * 28) * charge;
    const width = 10 + charge * 16;
    const bx = Math.cos(angle) * base;
    const by = Math.sin(angle) * base;
    const tx = Math.cos(angle + direction * (0.45 + charge * 0.35)) * (base + length);
    const ty = Math.sin(angle + direction * (0.45 + charge * 0.35)) * (base + length);
    const lx = bx + Math.cos(angle + Math.PI / 2) * width;
    const ly = by + Math.sin(angle + Math.PI / 2) * width;
    const rx = bx + Math.cos(angle - Math.PI / 2) * width;
    const ry = by + Math.sin(angle - Math.PI / 2) * width;

    ctx.globalAlpha = 0.18 + charge * 0.38;
    ctx.fillStyle = "rgba(255, 45, 12, 0.78)";
    ctx.beginPath();
    ctx.moveTo(lx, ly);
    ctx.quadraticCurveTo(tx, ty, rx, ry);
    ctx.quadraticCurveTo(bx, by, lx, ly);
    ctx.fill();

    ctx.globalAlpha = 0.24 + charge * 0.5;
    ctx.fillStyle = "rgba(255, 152, 28, 0.82)";
    ctx.beginPath();
    ctx.moveTo((lx + bx) * 0.5, (ly + by) * 0.5);
    ctx.quadraticCurveTo(tx * 0.94, ty * 0.94, (rx + bx) * 0.5, (ry + by) * 0.5);
    ctx.quadraticCurveTo(bx, by, (lx + bx) * 0.5, (ly + by) * 0.5);
    ctx.fill();
  }

  const sparkCount = 8 + Math.round(charge * 18);
  for (let i = 0; i < sparkCount; i += 1) {
    const angle = spin * 0.8 + (Math.PI * 2 * i) / sparkCount;
    const pulse = 0.5 + 0.5 * Math.sin(time * 9 + i * 1.7);
    const sparkRadius = radius + 14 + pulse * (22 + charge * 22);
    const x = Math.cos(angle) * sparkRadius;
    const y = Math.sin(angle) * sparkRadius;
    ctx.globalAlpha = 0.18 + charge * 0.7;
    ctx.fillStyle = i % 3 === 0 ? "rgba(255, 255, 210, 0.95)" : "rgba(255, 172, 28, 0.9)";
    ctx.beginPath();
    ctx.arc(x, y, 1.5 + pulse * 2 + charge * 2.8, 0, Math.PI * 2);
    ctx.fill();
  }

  if (charge > 0.92) {
    const flash = 0.55 + 0.45 * Math.sin(time * 22);
    ctx.globalAlpha = flash;
    ctx.strokeStyle = "rgba(255, 246, 188, 0.96)";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(0, 0, radius * 1.08, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = flash * 0.9;
    ctx.fillStyle = "rgba(255, 255, 220, 0.92)";
    ctx.beginPath();
    ctx.arc(radius * 0.72, -radius * 0.72, 4 + charge * 5, 0, Math.PI * 2);
    ctx.fill();
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

function drawTurnNotice() {
  if (!state.online.active || state.screen !== "playing" || !state.online.turnNoticeText) return;
  const elapsed = performance.now() - state.online.turnNoticeAt;
  const duration = 1450;
  if (elapsed > duration) return;
  const progress = clamp(elapsed / duration, 0, 1);
  const alpha = progress < 0.12 ? progress / 0.12 : 1 - easeOutCubic(clamp((progress - 0.68) / 0.32, 0, 1));
  const scale = 0.92 + 0.08 * easeOutCubic(clamp(progress / 0.22, 0, 1));
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(W / 2, H * 0.34);
  ctx.scale(scale, scale);
  ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
  ctx.strokeStyle = "rgba(74, 146, 176, 0.78)";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.roundRect(-190, -48, 380, 96, 18);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#17313d";
  ctx.font = "800 44px system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(state.online.turnNoticeText, 0, 0);
  ctx.restore();
}

function drawOnlineTimer() {
  if (!state.online.active || state.online.finished || state.screen !== "playing" || state.gameOver) return;
  const elapsed = Date.now() - timeValue(state.online.turnStartedAt);
  const remaining = Math.max(0, Math.ceil((ONLINE_TURN_LIMIT_MS - elapsed) / 1000));
  const urgency = clamp((5 - remaining) / 5, 0, 1);
  ctx.save();
  ctx.globalAlpha = 0.5 + urgency * 0.25;
  ctx.fillStyle = "rgba(255, 132, 24, 0.72)";
  ctx.font = "900 86px system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.shadowColor = "rgba(255, 115, 0, 0.18)";
  ctx.shadowBlur = 18;
  ctx.fillText(String(remaining), W / 2, 82);
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

  drawTurnNotice();
  drawOnlineTimer();
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

function preventGameGestureMenu(event) {
  if (event.target.closest?.(".game-shell")) event.preventDefault();
}

document.addEventListener("contextmenu", preventGameGestureMenu, { capture: true });
document.addEventListener("selectstart", preventGameGestureMenu, { capture: true });

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
    button.setPointerCapture?.(event.pointerId);
    onStart();
  };
  const stop = (event) => {
    event.preventDefault();
    button.releasePointerCapture?.(event.pointerId);
    onStop();
  };
  button.addEventListener("pointerdown", start);
  button.addEventListener("pointerup", stop);
  button.addEventListener("pointercancel", stop);
  button.addEventListener("pointerleave", stop);
  button.addEventListener("contextmenu", (event) => event.preventDefault());
  button.addEventListener("touchstart", (event) => event.preventDefault(), { passive: false });
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
document.querySelector("#dropBtn").addEventListener("click", () => dropActive());

stageBowlBtn.addEventListener("click", () => reset("bowl"));
stagePlatformBtn.addEventListener("click", () => reset("platform"));
stageTowerBtn.addEventListener("click", () => reset("tower"));
stageBottleBtn.addEventListener("click", () => reset("bottle"));
onlineBattleBtn.addEventListener("click", startOnlineBattle);
howToBtn.addEventListener("click", showHowTo);
howToBackBtn.addEventListener("click", showTitleMenu);
retryBtn.addEventListener("click", retryGame);
toTitleBtn.addEventListener("click", showTitle);
shareBestStreakBtn.addEventListener?.("click", () => {
  const shareUrl = shareBestStreakUrl();
  const opened = window.open?.(shareUrl, "_blank", "noopener,noreferrer");
  if (!opened) window.location.href = shareUrl;
});
playerNameInputEl.addEventListener?.("input", () => {
  const cleaned = sanitizePlayerName(playerNameInputEl.value);
  if (playerNameInputEl.value !== cleaned) playerNameInputEl.value = cleaned;
});
playerNameInputEl.addEventListener?.("change", () => savePlayerName(playerNameInputEl.value));
playerNameInputEl.addEventListener?.("blur", () => savePlayerName(playerNameInputEl.value));

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
  updateOnlineEntry();
  requestAnimationFrame(loop);
});

