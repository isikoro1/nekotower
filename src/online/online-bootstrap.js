(function () {
  const FIREBASE_VERSION = "12.15.0";
  const FIREBASE_BASE_URL = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}`;

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
      return this.initialize().then((client) => ({
        status: "ready",
        uid: client.user.uid,
      }));
    },
  };

  window.NekoTowerOnline = online;

  async function initializeFirebaseClient() {
    const config = window.NEKO_TOWER_FIREBASE_CONFIG;
    const [{ initializeApp }, { getAuth, signInAnonymously }, { getDatabase }] = await Promise.all([
      import(`${FIREBASE_BASE_URL}/firebase-app.js`),
      import(`${FIREBASE_BASE_URL}/firebase-auth.js`),
      import(`${FIREBASE_BASE_URL}/firebase-database.js`),
    ]);
    const app = initializeApp(config);
    const auth = getAuth(app);
    const credential = await signInAnonymously(auth);
    const database = getDatabase(app);
    return {
      app,
      auth,
      database,
      user: credential.user,
    };
  }
})();
