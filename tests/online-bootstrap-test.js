const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "src", "online", "online-bootstrap.js"), "utf8");

function runWithConfig(config) {
  const context = {
    window: {},
    Error,
    Promise,
  };
  if (config) context.window.NEKO_TOWER_FIREBASE_CONFIG = config;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "online-bootstrap.js" });
  return context.window.NekoTowerOnline;
}

const disabled = runWithConfig(null);
if (!disabled) throw new Error("online bootstrap did not create window.NekoTowerOnline");
if (disabled.isEnabled()) throw new Error("online bootstrap should be disabled without config");
if (disabled.getStatus().status !== "disabled") throw new Error("missing config should report disabled");

const placeholder = runWithConfig({
  apiKey: "YOUR_API_KEY",
  authDomain: "x.firebaseapp.com",
  databaseURL: "https://x.firebaseio.com",
  projectId: "x",
  appId: "x",
});
if (placeholder.isEnabled()) throw new Error("placeholder config should not enable online battle");

const configured = runWithConfig({
  apiKey: "abc",
  authDomain: "x.firebaseapp.com",
  databaseURL: "https://x.firebaseio.com",
  projectId: "x",
  appId: "x",
});
if (!configured.isEnabled()) throw new Error("valid-looking config should enable online bootstrap");
if (configured.getStatus().status !== "configured") throw new Error("valid-looking config should report configured");

console.log(JSON.stringify({ ok: true, disabled: disabled.getStatus(), configured: configured.getStatus() }));

