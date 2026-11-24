/* Local opponent: plans from visible stack bounds, never runs physics or writes online data. */
(function (root) {
  function plan(cats, stage, now, random = Math.random) {
    const supports = cats.filter(cat => cat.dropped && cat.body.bounds.max.y < 1200);
    const highest = supports.sort((a, b) => a.body.bounds.min.y - b.body.bounds.min.y)[0];
    const center = highest ? highest.body.position.x : stage === 'tower' ? 400 : 450;
    const spread = stage === 'bottle' ? 24 : 55;
    return {
      x: Math.max(280, Math.min(620, center + (random() - .5) * spread * 2)),
      angle: (random() - .5) * .45,
      dropAt: now + 1800 + random() * 1200,
    };
  }
  root.NekoTowerCpu = { plan };
  if (typeof module !== 'undefined') module.exports = root.NekoTowerCpu;
})(typeof window !== 'undefined' ? window : globalThis);
