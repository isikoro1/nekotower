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
    startMatchmaking() {
      if (!this.isEnabled()) {
        return Promise.reject(new Error(this.reason || "Online battle is disabled."));
      }
      return this.initialize().then((client) => startMatchmaking(client, this));
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

  async function startMatchmaking(client, online) {
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
    const [queueSnapshot, roomsSnapshot] = await Promise.all([get(queueRef), get(roomsRef)]);
    const queue = queueSnapshot.val() || {};
    const rooms = roomsSnapshot.val() || {};
    const waitingPlayers = Object.entries(queue)
      .filter(([, entry]) => entry?.status === "waiting" && now - Number(entry.lastSeenAt || 0) < MATCH_LIMITS.staleMs)
      .sort(([, a], [, b]) => Number(a.createdAt || 0) - Number(b.createdAt || 0));
    const activeRooms = Object.values(rooms).filter(
      (room) => room && (room.status === "matching" || room.status === "playing") && now - Number(room.updatedAt || 0) < MATCH_LIMITS.staleMs,
    );

    if (activeRooms.length >= MATCH_LIMITS.maxActiveRooms || waitingPlayers.length >= MATCH_LIMITS.maxWaitingPlayers) {
      const position = waitingPlayers.findIndex(([waitingUid]) => waitingUid === uid);
      online.match = {
        status: "full",
        roomId: "",
        queuePosition: position >= 0 ? position + 1 : waitingPlayers.length + 1,
        estimatedWaitMs: estimateWaitMs(waitingPlayers.length + 1, activeRooms.length),
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
        stage: "bowl",
        hostUid: opponentUid,
        turnUid: opponentUid,
        turnNo: 1,
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
    onDisconnect(ownQueueRef).remove();

    return new Promise((resolve) => {
      const timeoutId = window.setTimeout(() => {
        unsubscribe();
        remove(ownQueueRef).catch(() => {});
        online.match = {
          status: "timeout",
          roomId: "",
          estimatedWaitMs: MATCH_LIMITS.waitTimeoutMs,
        };
        resolve(online.match);
      }, MATCH_LIMITS.waitTimeoutMs);

      const unsubscribe = onValue(ownQueueRef, (snapshot) => {
        const entry = snapshot.val();
        if (!entry || entry.status !== "matched" || !entry.roomId) return;
        window.clearTimeout(timeoutId);
        unsubscribe();
        online.match = {
          status: "matched",
          roomId: entry.roomId,
          role: "host",
        };
        resolve(online.match);
      });

      online.match = {
        status: "waiting",
        roomId: "",
        queuePosition: waitingPlayers.length + 1,
        estimatedWaitMs: estimateWaitMs(waitingPlayers.length + 1, activeRooms.length),
      };
    });
  }

  function estimateWaitMs(queuePosition, activeRoomCount) {
    const roomTurnoverMs = 90 * 1000;
    const activeSlots = Math.max(1, MATCH_LIMITS.maxActiveRooms - activeRoomCount);
    return Math.ceil(queuePosition / activeSlots) * roomTurnoverMs;
  }
})();
