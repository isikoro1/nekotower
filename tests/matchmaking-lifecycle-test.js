const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const code = fs.readFileSync(path.join(__dirname,'../src/online/online-bootstrap.js'),'utf8');
function setup({syncMatch=false,holdSet=false,readError=false}={}) {
  let listener, releaseSet;
  const timeouts = new Map(), intervals = new Map(), removed = [], writes=[];
  let nextId = 0, unsubscribed = 0;
  const context = {console, Date, Promise, setTimeout:(fn)=>{timeouts.set(++nextId,fn);return nextId;},clearTimeout:id=>timeouts.delete(id),setInterval:fn=>{intervals.set(++nextId,fn);return nextId;},clearInterval:id=>intervals.delete(id)};
  context.window=context;
  vm.createContext(context);vm.runInContext(code,context);
  const online=context.NekoTowerOnline;
  online.status='configured';
  online.initialize=async()=>({user:{uid:'me'},database:{},databaseModule:{
    ref:(_,p='')=>p,child:(r,p)=>r+'/'+p,
    get:async()=>{if(readError)throw Error('offline');return {val:()=>({})};},
    set:async()=>{if(holdSet)await new Promise(r=>{releaseSet=r;});},
    update:async(r,v)=>writes.push({r,v}),remove:async r=>removed.push(r),
    onDisconnect:()=>({remove(){}}),serverTimestamp:()=>0,
    onValue:(r,callback)=>{listener=callback;if(syncMatch)callback({val:()=>({status:'matched',roomId:'room'})});return ()=>unsubscribed++;},
  }});
  return {online,timeouts,intervals,removed,writes,listen:entry=>listener({val:()=>entry}),release:()=>releaseSet(),get unsubscribed(){return unsubscribed;}};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
(async()=>{
  let f=setup();let promise=f.online.startMatchmaking();await tick();
  assert.equal(f.online.match.status,'waiting');
  for(const heartbeat of f.intervals.values())heartbeat();
  await tick();assert.equal(f.writes.length,1);
  f.online.cancelMatchmaking();assert.equal((await promise).status,'cancelled');
  assert.equal(f.timeouts.size,0);assert.equal(f.intervals.size,0);assert.equal(f.unsubscribed,1);
  assert.ok(f.removed.includes('matchmaking/queue/me'));
  f=setup();promise=f.online.startMatchmaking();await tick();
  f.listen({status:'matched',roomId:'room'});
  assert.equal((await promise).status,'matched');assert.equal(f.intervals.size,0);
  f=setup({syncMatch:true});assert.equal((await f.online.startMatchmaking()).status,'matched');assert.equal(f.unsubscribed,1);
  f=setup({holdSet:true});promise=f.online.startMatchmaking();await tick();f.online.cancelMatchmaking();f.release();
  assert.equal((await promise).status,'cancelled');assert.equal(f.intervals.size,0);
  f=setup();promise=f.online.startMatchmaking();await tick();for(const timeout of f.timeouts.values())timeout();
  assert.equal((await promise).status,'timeout');assert.equal(f.intervals.size,0);
  f=setup({readError:true});await assert.rejects(f.online.startMatchmaking());
  console.log('Matchmaking lifecycle tests passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
