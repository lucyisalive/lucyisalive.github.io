'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('game-source.html','utf8');
const start=html.indexOf('const LOCAL_HANZI_CACHE_PREFIX');
const end=html.indexOf('function medianToCanvasPoints(',start);
assert.ok(start>0&&end>start);
const code=html.slice(start,end);
function env(fetcher){
  const saved=new Map(),timers=new Map();let next=0;
  const c=vm.createContext({window:{},fetch:fetcher,AbortController,localStorage:{getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v)},
    setTimeout(fn){const id=++next;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id)});
  for(const file of ['hanzi-data.js','curriculum-hanzi-data.js'])vm.runInContext(fs.readFileSync(file,'utf8'),c);
  vm.runInContext(code,c);
  return{c,saved,timers,run:s=>vm.runInContext(s,c),expire(){for(const fn of [...timers.values()])fn();}};
}
(async()=>{
  let networkCalls=0;
  const local=env(()=>{networkCalls++;throw Error('Network forbidden');});
  const glyphs=vm.runInContext('Object.keys(window.HANZI_LOCAL_DATA)',local.c);
  for(const char of glyphs){local.c.target=char;const data=await local.run('getCharData(target)');assert.equal(data.medians.length,data.strokes.length);}
  assert.equal(glyphs.length,167);assert.equal(networkCalls,0);
  const glyph={strokes:['M 0 0 L 1 1'],medians:[[[0,0],[1,1]]]};
  let calls=0,url;
  const fresh=env(async u=>{calls++;url=u;return{ok:true,json:async()=>glyph};});
  await fresh.run("getCharData('龘')");await fresh.run("getCharData('龘')");
  assert.equal(calls,1);assert.ok(url.includes(encodeURIComponent('龘')));assert.ok(url.includes('@2.0.1/'));
  assert.equal(fresh.saved.size,1);
  for(const response of [{ok:false},{ok:true,json:async()=>({strokes:[],medians:[]})}]){
    const bad=env(async()=>response);await assert.rejects(bad.run("getCharData('龘')"));assert.equal(bad.saved.size,0);
  }
  // Both stalled headers and a stalled response body must reach the six-second timeout.
  for(const fetcher of [()=>new Promise(()=>{}),async()=>({ok:true,json:()=>new Promise(()=>{})})]){
    const slow=env(fetcher);const pending=slow.run("getCharData('龘')");await Promise.resolve();await Promise.resolve();slow.expire();
    await assert.rejects(pending,/超时/);assert.equal(slow.saved.size,0);
  }
  console.log('167 offline glyphs need no network; new glyph success/cache/404/invalid/body+header timeout passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
