const assert = require('node:assert/strict');
const Matter = require('../vendor/matter.min.js');
const Cpu = require('../src/cpu-player.js');

function snapshot(x, width) {
  const platform = Matter.Bodies.rectangle(x,930,width,30,{isStatic:true,friction:1});
  const cat = Matter.Bodies.rectangle(450,150,45,100,{friction:.94,frictionAir:.012,restitution:.01});
  Matter.Body.setStatic(cat,true);
  return {bodies:[Cpu.describe(platform),Cpu.describe(cat)],activeIndex:1,center:Math.min(620,x),aimY:150,failY:1260,gravity:{x:0,y:.8,scale:.001}};
}
// Previous release's exact fixed position/angle grid, evaluated with the same physics.
function previousSearch(board) {
  const xs=[...new Set([450,board.center,board.center-60,board.center+60,300,375,525,600].map(x=>Math.round(Math.max(220,Math.min(680,x)))))];
  let best;
  for(const x of xs)for(const angle of [0,Math.PI/2,-Math.PI/2,Math.PI,Math.PI/4,-Math.PI/4]) {
    const candidate=Cpu.evaluate(board,{x,angle},Matter);
    if(!best || candidate.score>best.score)best=candidate;
  }
  return best;
}
const results=[];
for(const [name,x,width] of [['center',450,130],['right-perch',760,50],['left-perch',140,50]]) {
  const board=snapshot(x,width);
  const previous=previousSearch(board);
  const search=Cpu.createSearch(board,Matter);
  const started=performance.now();
  let result;
  while((result=search.next()))if(result.done)break;
  assert.equal(search.best.failed,false,name+' must find a safe move');
  assert.equal(search.best.robust,true,name+' must finish robustness checks');
  results.push({name,previousSurvived:!previous.failed,newSurvived:!search.best.failed,candidates:search.index,ms:Math.round(performance.now()-started)});
}
assert.equal(results.filter(row=>row.previousSurvived).length,1);
assert.equal(results.filter(row=>row.newSurvived).length,3);
console.log(JSON.stringify(results));
