const assert = require('node:assert/strict');
const { plan } = require('../src/cpu-player.js');
for (const stage of ['bowl','platform','tower','bottle']) {
  const move = plan([], stage, 1000, () => .5);
  assert.equal(move.x, stage === 'tower' ? 400 : 450);
  assert.equal(move.angle, 0);
  assert.equal(move.dropAt, 3400);
}
const cat = (x,y,dropped=true) => ({dropped,body:{position:{x},bounds:{min:{y},max:{y:y+30}}}});
assert.equal(plan([cat(300,800),cat(550,500),cat(450,100,false)],'bowl',0,()=>.5).x,550);
for(const random of [()=>0,()=>.999]) {
  const move = plan([cat(850,500)],'bowl',0,random);
  assert.ok(move.x >= 280 && move.x <= 620);
  assert.ok(move.dropAt >= 1800 && move.dropAt <= 3000);
}
console.log('CPU planning tests passed');
