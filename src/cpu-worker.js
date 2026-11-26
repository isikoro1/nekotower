/* Keep physics lookahead off the rendering thread, especially on mobile. */
importScripts('../vendor/matter.min.js', './cpu-player.js?v=20261126-search-2');
self.onmessage = ({ data }) => {
  const search = self.NekoTowerCpu.createSearch(data, self.Matter);
  const deadline = performance.now() + 4200;
  let result;
  while ((result = search.next())) {
    result.done ||= performance.now() >= deadline;
    self.postMessage(result);
    if (result.done) break;
  }
  self.close();
};
