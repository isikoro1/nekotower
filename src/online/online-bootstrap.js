(function () {
  const STATUS = {
    DISABLED: "disabled",
    CONFIGURED: "configured",
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
    isEnabled() {
      return this.status === STATUS.CONFIGURED;
    },
    getStatus() {
      return {
        status: this.status,
        reason: this.reason,
      };
    },
    startMatchmaking() {
      if (!this.isEnabled()) {
        return Promise.reject(new Error(this.reason || "Online battle is disabled."));
      }
      return Promise.reject(new Error("Online battle implementation is not ready yet."));
    },
  };

  window.NekoTowerOnline = online;
})();

