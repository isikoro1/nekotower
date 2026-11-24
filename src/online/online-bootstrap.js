(function () {
  const FIREBASE_VERSION = "12.15.0";
  const FIREBASE_BASE_URL = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}`;
  const MATCH_LIMITS = {
    maxWaitingPlayers: 100,
    maxActiveRooms: 20,
    waitTimeoutMs: 5 * 60 * 1000,
    staleMs: 3 * 60 * 1000,
  };

  const STATUS = {
    DISABLED: "disabled",
    CONFIGURED: "configured",
    READY: "ready",
    ERROR: "error",
  };

  const ONLINE_STAGES = ["bowl", "platform", "tower", "bottle"];

  function hasFirebaseConfig() {
    const config = window.NEKO_TOWER_FIREBASE_CONFIG;
    return Boolean(
      config &&
        config.apiKey &&
        config.authDomain &&
        config.databaseURL &&
        config.projectId &&
        config.appId &&
        !String(config.apiKey).includes("YOUR_"),
    );
  }

  const online = {
    status: hasFirebaseConfig() ? STATUS.CONFIGURED : STATUS.DISABLED,
    reason: hasFirebaseConfig() ? "" : "Firebase config is not loaded.",
    client: null,
    initPromise: null,
    isEnabled() {
      return this.status === STATUS.CONFIGURED || this.status === STATUS.READY;
    },
    getStatus() {
      return {
        status: this.status,
        reason: this.reason,
        uid: this.client?.user?.uid || "",
        roomId: this.match?.roomId || "",
        matchStatus: this.match?.status || "",
        queuePosition: Number(this.match?.queuePosition || 0),
        estimatedWaitMs: Number(this.match?.estimatedWaitMs || 0),
      };
    },
    async initialize() {
      if (!this.isEnabled()) {
        throw new Error(this.reason || "Online battle is disabled.");
      }
      if (this.client) return this.client;
      if (this.initPromise) return this.initPromise;

      this.initPromise = initializeFirebaseClient()
        .then((client) => {
          this.client = client;
          this.status = STATUS.READY;
          this.reason = "";
          return client;
        })
        .catch((error) => {
          this.status = STATUS.ERROR;
          this.reason = error?.message || "Firebase initialization failed.";
          this.initPromise = null;
          throw error;
        });
      return this.initPromise;
    },
    matchGeneration: 0,
    cancelMatchmaking() {
      this.matchGeneration += 1;
      this.cancelWait?.();
      this.cancelWait = null;
    },
    startMatchmaking() {
      if (!this.isEnabled()) {
        return Promise.reject(new Error(this.reason || "Online battle is disabled."));
      }
      const generation = ++this.matchGeneration;
      return this.initialize().then((client) => {
        if (generation !== this.matchGeneration) return { status: "cancelled" };
        return startMatchmaking(client, this, generation);
      });
    },
    getMatchmakingSummary() {
      if (!this.isEnabled()) {
        return Promise.reject(new Error(this.reason || "Online battle is disabled."));
      }
      return this.initialize().then((client) => readMatchmakingSummary(client));
    },
    watchRoom(roomId, onChange) {
      return this.initialize().then((client) => {
        const { onValue, ref } = client.databaseModule;
        return onValue(ref(client.database, `rooms/${roomId}`), (snapshot) => onChange(snapshot.val()));
      });
    },
    watchInputs(roomId, onChange) {
      return this.initialize().then((client) => {
        const { onValue, ref } = client.databaseModule;
        return onValue(ref(client.database, `rooms/${roomId}/input`), (snapshot) => onChange(snapshot.val() || {}));
      });
    },
    updateRoom(roomId, values) {
      return this.initialize().then((client) => {
        const { ref, update } = client.databaseModule;
        return update(ref(client.database, `rooms/${roomId}`), values);
      });
    },
    updateInput(roomId, uid, values) {
      return this.initialize().then((client) => {
        const { ref, set } = client.databaseModule;
        return set(ref(client.database, `rooms/${roomId}/input/${uid}`), values);
      });
    },
  };

  window.NekoTowerOnline = online;

  async function initializeFirebaseClient() {
    const config = window.NEKO_TOWER_FIREBASE_CONFIG;
    const [{ initializeApp }, { getAuth, signInAnonymously }, databaseModule] = await Promise.all([
      import(`${FIREBASE_BASE_URL}/firebase-app.js`),
      import(`${FIREBASE_BASE_URL}/firebase-auth.js`),
      import(`${FIREBASE_BASE_URL}/firebase-database.js`),
    ]);
    const { getDatabase } = databaseModule;
    const app = initializeApp(config);
    const auth = getAuth(app);
    const credential = await signInAnonymously(auth);
    const database = getDatabase(app);
    return {
      app,
      auth,
      database,
      databaseModule,
      user: credential.user,
    };
  }

  async function startMatchmaking(client, online, generation) {
    const db = client.database;
    const uid = client.user.uid;
    const {
      child,
      get,
      onDisconnect,
      onValue,
      push,
      ref,
      remove,
      serverTimestamp,
      set,
      update,
    } = client.databaseModule;
    const now = Date.now();
    const queueRef = ref(db, "matchmaking/queue");
    const roomsRef = ref(db, "rooms");
    const queueSnapshot = await get(queueRef);
    if (generation !== online.matchGeneration) return { status: "cancelled" };
    const queue = queueSnapshot.val() || {};
    const waitingPlayers = waitingPlayersFromQueue(queue, now);

    if (waitingPlayers.length >= MATCH_LIMITS.maxWaitingPlayers) {
      const position = waitingPlayers.findIndex(([waitingUid]) => waitingUid === uid);
      online.match = {
        status: "full",
        roomId: "",
        queuePosition: position >= 0 ? position + 1 : waitingPlayers.length + 1,
        estimatedWaitMs: estimateWaitMs(waitingPlayers.length + 1),
      };
      return online.match;
    }

    const opponent = waitingPlayers.find(([waitingUid]) => waitingUid !== uid);
    if (opponent) {
      const [opponentUid] = opponent;
      const roomRef = push(roomsRef);
      const roomId = roomRef.key;
      const updates = {};
      updates[`rooms/${roomId}`] = {
        status: "matching",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        stage: ONLINE_STAGES[Math.floor(Math.random() * ONLINE_STAGES.length)],
        hostUid: opponentUid,
        turnUid: opponentUid,
        turnNo: 1,
        turnStartedAt: serverTimestamp(),
        players: {
          [opponentUid]: {
            joinedAt: serverTimestamp(),
            lastSeenAt: serverTimestamp(),
            connected: true,
            displayName: "Player 1",
          },
          [uid]: {
            joinedAt: serverTimestamp(),
            lastSeenAt: serverTimestamp(),
            connected: true,
            displayName: "Player 2",
          },
        },
      };
      updates[`matchmaking/queue/${opponentUid}`] = {
        status: "matched",
        roomId,
        matchedAt: serverTimestamp(),
        lastSeenAt: now,
      };
      updates[`matchmaking/queue/${uid}`] = {
        status: "matched",
        roomId,
        matchedAt: serverTimestamp(),
        lastSeenAt: now,
      };
      await update(ref(db), updates);
      online.match = { status: "matched", roomId, role: "guest", opponentUid };
      return online.match;
    }

    const ownQueueRef = child(queueRef, uid);
    await set(ownQueueRef, {
      status: "waiting",
      createdAt: now,
      lastSeenAt: now,
    });
    if (generation !== online.matchGeneration) {
      await remove(ownQueueRef);
      return { status: "cancelled" };
    }
    onDisconnect(ownQueueRef).remove();

    return new Promise((resolve) => {
      let unsubscribe = null;
      let finished = false;
      let heartbeatId;
      const finish = (result) => {
        if (finished) return;
        finished = true;
        window.clearTimeout(timeoutId);
        window.clearInterval(heartbeatId);
        unsubscribe?.();
        if (online.cancelWait === cancel) online.cancelWait = null;
        online.match = result;
        resolve(result);
      };
      const cancel = () => {
        remove(ownQueueRef).catch(() => {});
        finish({ status: "cancelled", roomId: "" });
      };
      const timeoutId = window.setTimeout(() => {
        remove(ownQueueRef).catch(() => {});
        finish({ status: "timeout", roomId: "", estimatedWaitMs: MATCH_LIMITS.waitTimeoutMs });
      }, MATCH_LIMITS.waitTimeoutMs);
      online.cancelWait = cancel;
      online.match = {
        status: "waiting", roomId: "", queuePosition: waitingPlayers.length + 1,
        estimatedWaitMs: estimateWaitMs(waitingPlayers.length + 1),
      };
      // Keep a five-minute queue entry alive beyond the three-minute stale threshold.
      heartbeatId = window.setInterval(() => {
        if (!finished) update(ownQueueRef, { lastSeenAt: Date.now() }).catch(() => {});
      }, 30000);
      unsubscribe = onValue(ownQueueRef, (snapshot) => {
        const entry = snapshot.val();
        if (entry?.status !== "matched" || !entry.roomId) return;
        finish({ status: "matched", roomId: entry.roomId, role: "host" });
      }, () => {
        remove(ownQueueRef).catch(() => {});
        finish({ status: "error", roomId: "" });
      });
      // Some adapters deliver the initial value synchronously.
      if (finished) unsubscribe?.();
    });
  }

  function estimateWaitMs(queuePosition) {
    const roomTurnoverMs = 90 * 1000;
    const activeSlots = Math.max(1, MATCH_LIMITS.maxActiveRooms);
    return Math.ceil(queuePosition / activeSlots) * roomTurnoverMs;
  }

  async function readMatchmakingSummary(client) {
    const { get, ref } = client.databaseModule;
    const now = Date.now();
    const queueSnapshot = await get(ref(client.database, "matchmaking/queue"));
    const queue = queueSnapshot.val() || {};
    const waitingPlayers = waitingPlayersFromQueue(queue, now).filter(([waitingUid]) => waitingUid !== client.user.uid);
    return {
      waitingCount: waitingPlayers.length,
      canMatchNow: waitingPlayers.length > 0,
      checkedAt: now,
    };
  }

  function waitingPlayersFromQueue(queue, now) {
    return Object.entries(queue)
      .filter(([, entry]) => entry?.status === "waiting" && now - Number(entry.lastSeenAt || 0) < MATCH_LIMITS.staleMs)
      .sort(([, a], [, b]) => Number(a.createdAt || 0) - Number(b.createdAt || 0));
  }
})();
