'use strict';

// Independent synthetic multi-device tests. Firestore transport is an in-memory
// REST server; encryption is the real Node Web Crypto implementation. No real
// account, family code, learner state, ink, or network service is used.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {webcrypto,createHash,pbkdf2Sync}=require('node:crypto');
const {create}=require('../progress-sync.js');
const PROJECT='synthetic-hanzi-sync-test';
const META='hanzi-magic-door-sync-v1';
const copy=value=>JSON.parse(JSON.stringify(value));
const turn=()=>new Promise(resolve=>setImmediate(resolve));
const sha=value=>createHash('sha256').update(value).digest('hex');
const normalize=code=>code.replace(/[\s-]/g,'').toLowerCase();
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};}
async function bounded(promise,label){
  let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{
    timer=setTimeout(()=>reject(Error('Timed out waiting for '+label)),3000);
  })]);}finally{clearTimeout(timer);}
}
function memoryStorage(){
  const values=new Map(),writes=[];
  return{values,writes,failWrites:false,
    getItem(key){return values.get(key)||null;},
    setItem(key,value){if(this.failWrites)throw Object.assign(Error('synthetic storage quota'),{name:'QuotaExceededError'});
      writes.push([key,String(value)]);values.set(key,String(value));},
    removeItem(key){if(this.failWrites)throw Error('synthetic storage unavailable');values.delete(key);}};
}
function clock(){
  let time=Date.UTC(2026,10,5,12),id=0;const tasks=new Map();
  return{tasks,now:()=>time,setTimeout(fn,ms=0){tasks.set(++id,{at:time+ms,fn});return id;},
    clearTimeout(key){tasks.delete(key);},advance(ms){const until=time+ms;let fired=0;
      for(;;){const next=[...tasks].filter(([,t])=>t.at<=until).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;
        assert.ok(++fired<1000,'Unexpected unbounded timer/retry loop');tasks.delete(next[0]);time=next[1].at;next[1].fn();}
      time=until;}};
}
function response(status,body){return{ok:status>=200&&status<300,status,json:async()=>copy(body),text:async()=>JSON.stringify(body)};}
function errorResponse(status,label){return response(status,{error:{code:status,status:label,message:'synthetic '+label}});}
function firestore(){
  const docs=new Map(),calls=[],offline=new Set(),gates=[];let revision=0;
  function documentFor(pathname){return docs.get(pathname);}
  function get(call,captured){const doc=captured===undefined?documentFor(call.path):captured;
    return doc?response(200,doc):errorResponse(404,'NOT_FOUND');}
  function patch(call){
    const existing=documentFor(call.path),exists=call.url.searchParams.get('currentDocument.exists');
    const expected=call.url.searchParams.get('currentDocument.updateTime');
    assert.ok(exists==='false'||expected,'Every write needs create-only or updateTime CAS');
    if((exists==='false'&&existing)||(expected&&(!existing||existing.updateTime!==expected)))return errorResponse(409,'FAILED_PRECONDITION');
    assert.deepEqual(Object.keys(call.body.fields).sort(),['app','formatVersion','iv','payload']);
    const doc={name:call.path.replace(/^\/v1\//,''),fields:copy(call.body.fields),
      updateTime:new Date(Date.UTC(2026,10,5)+ ++revision).toISOString()};docs.set(call.path,doc);return response(200,doc);
  }
  return{docs,calls,offline,
    holdNext(predicate){const arrived=deferred(),release=deferred(),gate={predicate,arrived,release};gates.push(gate);
      return{arrived:arrived.promise,release:()=>release.resolve()};},
    fetchFor(client){return async(url,init={})=>{
      const parsed=new URL(String(url)),method=init.method||'GET';
      assert.equal(parsed.origin,'https://firestore.googleapis.com');
      const prefix='/v1/projects/'+PROJECT+'/databases/(default)/documents/families/';
      assert.ok(parsed.pathname.startsWith(prefix)&&/^hanzi-(?:password-)?v1-[0-9a-f]{64}$/.test(parsed.pathname.slice(prefix.length)));
      assert.ok(method==='GET'||method==='PATCH','No destructive or unrelated Firestore operation');
      const call={client,url:parsed,path:parsed.pathname,method,signal:init.signal,body:init.body?JSON.parse(init.body):undefined};calls.push(call);
      if(offline.has(client))throw Error('synthetic offline');
      const index=gates.findIndex(g=>g.predicate(call));
      if(index>=0){const gate=gates.splice(index,1)[0],captured=method==='GET'?copy(documentFor(call.path)||null):undefined;
        gate.arrived.resolve(call);await gate.release.promise;return method==='GET'?get(call,captured):patch(call);}
      return method==='GET'?get(call):patch(call);
    };},
    current(){assert.equal(docs.size,1,'This scenario expects exactly one family document');return[...docs.values()][0];}};
}
function progress(label='first',count=1){
  return{bankVersion:5,dailyCount:5,scenesUnlocked:count,bank:[{
    char:'山',pinyin:'shān',word:'合成山',sentence:'这是合成测试：'+label,fromParent:true,box:2,interval:7,
    lastSeen:'2026-11-05',history:[{day:'2026-11-05',outcome:'first-try'}],passedDays:['2026-11-05'],
    wrongToday:1,wrongDay:'2026-11-05',stuck:false,stuckDay:null,
  }],priorityQueue:[{char:'林',pinyin:'lín',word:'树林',addedDay:'2026-11-05',completedDay:null,requestId:'synthetic-request'}],
  sessionProgress:{version:1,day:'2026-11-05',roundId:'synthetic-round',passedCount:count,completed:false,sceneAwarded:false}};
}
function device(server,name,initial=progress(),options={}){
  const storage=options.storage||memoryStorage(),timers=clock(),statuses=[],applied=[];
  const d={name,storage,timers,statuses,applied,value:copy(initial),busy:false,failApply:false};
  d.client=create({projectId:PROJECT,storage,fetch:server.fetchFor(name),crypto:webcrypto,
    getState:()=>d.value,applyState:state=>{
      if(d.failApply==='throw')throw Error('synthetic progress save failure');
      if(d.failApply==='reject')return Promise.reject(Error('synthetic asynchronous progress save failure'));
      if(d.failApply)return false;
      applied.push(copy(state));d.value=copy(state);return true;
    },canApply:()=>!d.busy,onStatus:status=>statuses.push(copy(status)),
    setTimeout:timers.setTimeout,clearTimeout:timers.clearTimeout,now:timers.now,...options.overrides});
  return d;
}
function kind(d){const s=d.client.status();assert.equal(typeof s.kind,'string');return s.kind;}
function changed(d,label,count){d.value=progress(label,count);d.client.changed();}
function assertNoInk(value){
  if(!value||typeof value!=='object')return;
  for(const[key,child]of Object.entries(value)){
    assert.ok(!['rawS','inkLog','parentTestInkLog','playerReview','privateOnly','medians','strokes'].includes(key),'Private/unrelated field uploaded: '+key);
    assertNoInk(child);
  }
}
async function decrypt(doc,code){
  const raw=createHash('sha256').update('hanzi-magic-door:key:v1:'+normalize(code)).digest();
  const key=await webcrypto.subtle.importKey('raw',raw,'AES-GCM',false,['decrypt']);
  assert.equal(doc.fields.formatVersion.integerValue,'1');
  const iv=Buffer.from(doc.fields.iv.stringValue,'base64');assert.equal(iv.length,12);
  const plain=await webcrypto.subtle.decrypt({name:'AES-GCM',iv},key,Buffer.from(doc.fields.payload.stringValue,'base64'));
  return JSON.parse(Buffer.from(plain).toString('utf8'));
}
function assertFamilyPath(server,code){
  const digest=sha('hanzi-magic-door:document:v1:'+normalize(code));
  assert.ok([...server.docs.keys()][0].endsWith('/families/hanzi-v1-'+digest));
  for(const call of server.calls){assert.ok(!call.url.href.includes(normalize(code)),'Do not use the secret code as public document id');
    if(call.body){assert.ok(!JSON.stringify(call.body).includes('合成山'),'Progress must be encrypted');}}
}
const tests=[];
function test(name,run){tests.push({name,run});}

// Scenarios follow below. Expected behavior is a contract, not copied module
// implementation; each independent scenario gets fresh devices and server.
async function pair(){
  const server=firestore(),a=device(server,'A'),b=device(server,'B',progress('other',0));
  await a.client.createFamily();assert.equal(kind(a),'synced');
  await b.client.joinFamily(a.client.code());assert.equal(kind(b),'synced');
  return{server,a,b};
}
function patchCount(server){return server.calls.filter(c=>c.method==='PATCH').length;}
function unchangedState(d,before){assert.deepEqual(d.value,before,'Learning state was changed unexpectedly');}
function assertNotSynced(d){assert.notEqual(kind(d),'synced','An unsuccessful operation cannot claim to be synced');}

test('fresh unconnected start needs neither network nor Web Crypto',async()=>{
  let calls=0;const server=firestore(),d=device(server,'fresh',progress(),{overrides:{crypto:null,
    fetch:()=>{calls++;throw Error('Fresh local play must not fetch');}}});
  const before=copy(d.value);await bounded(d.client.start(),'fresh start');
  assert.equal(kind(d),'off');assert.equal(d.client.status().connected,false);
  assert.ok(!d.client.code());assert.equal(calls,0);assert.equal(server.calls.length,0);assert.equal(d.applied.length,0);
  assert.equal(d.storage.writes.length,0);unchangedState(d,before);
  await d.client.createFamily();assert.equal(kind(d),'unsupported');unchangedState(d,before);
});

test('UMD browser loading is inert without a connection',async()=>{
  const context={window:{},console,TextEncoder,TextDecoder,Uint8Array,Promise,JSON,Date,Map,Set};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../progress-sync.js'),'utf8'),context,{filename:'progress-sync.js'});
  const exported=context.window.HanziProgressSync||context.HanziProgressSync;
  assert.equal(typeof exported?.create,'function','Browser UMD API must be available without requiring DOM');
  let calls=0;const client=exported.create({projectId:PROJECT,storage:memoryStorage(),crypto:null,
    fetch:()=>{calls++;return new Promise(()=>{});},getState:()=>progress(),applyState:()=>true,
    canApply:()=>true,onStatus:()=>{},setTimeout,clearTimeout,now:Date.now});
  await bounded(client.start(),'UMD fresh start');assert.equal(calls,0);assert.equal(client.status().kind,'off');
});

test('create and join transfer encrypted learning progress but no ink or review data',async()=>{
  const server=firestore(),initial=progress('created',2);
  initial.rawS=[[{x:999,y:999}]];initial.inkLog=[{char:'私'}];initial.playerReview={expected:true};initial.privateOnly='not progress';
  initial.bank[0].rawS=['private'];initial.bank[0].playerReview={expected:false};initial.bank[0].privateOnly='hidden';
  initial.bank[0].history[0].rawS=['private history'];initial.priorityQueue[0].playerReview='private queue';
  const a=device(server,'A',initial),before=copy(a.value);
  await a.client.createFamily();assert.equal(kind(a),'synced');unchangedState(a,before);
  const code=a.client.code();assert.match(code,/^[0-9a-f]{8}(?:-[0-9a-f]{8}){3}$/);
  assert.equal(normalize(code).length,32);assertFamilyPath(server,code);
  const plaintext=await decrypt(server.current(),code);assertNoInk(plaintext);
  assert.equal(plaintext.bankVersion,5);assert.equal(plaintext.scenesUnlocked,2);assert.equal(plaintext.dailyCount,5);
  assert.equal(plaintext.bank[0].word,'合成山');assert.equal(plaintext.bank[0].fromParent,true);
  assert.equal(plaintext.bank[0].box,2);assert.equal(plaintext.bank[0].interval,7);
  assert.deepEqual(plaintext.bank[0].history,[{day:'2026-11-05',outcome:'first-try'}]);
  assert.deepEqual(plaintext.bank[0].passedDays,['2026-11-05']);assert.equal(plaintext.bank[0].wrongToday,1);
  assert.equal(plaintext.bank[0].wrongDay,'2026-11-05');assert.equal(plaintext.bank[0].stuck,false);
  assert.equal(plaintext.priorityQueue[0].requestId,'synthetic-request');
  assert.deepEqual(plaintext.sessionProgress,initial.sessionProgress);
  const b=device(server,'B',progress('before join',0));
  await b.client.joinFamily('  '+code.toUpperCase().replaceAll('-',' ')+'  ');
  assert.equal(kind(b),'synced');assert.equal(b.client.code(),code);assert.deepEqual(b.value,plaintext);
  assert.equal(b.applied.length,1);assert.equal(patchCount(server),1,'Joining must only read the existing family');
  const createCall=server.calls.find(c=>c.method==='PATCH');assert.equal(createCall.url.searchParams.get('currentDocument.exists'),'false');
  assert.ok(a.storage.getItem(META));assert.ok(b.storage.getItem(META));
});

test('the actual 92-character curriculum default bank round-trips including null lesson metadata',async()=>{
  const context=vm.createContext({window:{}}),source=fs.readFileSync(path.join(__dirname,'../game-source.html'),'utf8');
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../curriculum-data.js'),'utf8'),context,{filename:'curriculum-data.js'});
  const from=source.indexOf('function newBankItem('),to=source.indexOf('// Bump whenever',from);
  assert.ok(from>=0&&to>from,'Actual default-bank source boundaries must remain available');
  const bank=copy(vm.runInContext(source.slice(from,to)+'\ndefaultBank()',context,{filename:'game-source-default-bank.js'}));
  assert.equal(bank.length,92);assert.ok(bank.some(item=>item.lesson===null),'The real nullable metadata must be represented');
  const state={bank,bankVersion:5,priorityQueue:[],dailyCount:5,scenesUnlocked:0},server=firestore(),a=device(server,'curriculum A',state);
  await a.client.createFamily();assert.equal(kind(a),'synced','Real default bank must be accepted, including unknown textbook lesson numbers');
  const b=device(server,'curriculum B',progress('before real bank',0));await b.client.joinFamily(a.client.code());
  assert.equal(kind(b),'synced');assert.deepEqual(b.value,state);assert.deepEqual(await decrypt(server.current(),a.client.code()),state);
});

test('independent new families receive distinct secrets and documents',async()=>{
  const server=firestore(),a=device(server,'A'),b=device(server,'B');
  await a.client.createFamily();await b.client.createFamily();
  assert.equal(kind(a),'synced');assert.equal(kind(b),'synced');assert.notEqual(a.client.code(),b.client.code());assert.equal(server.docs.size,2);
});

test('offline changes remain local and can be retried with a fresh encryption IV',async()=>{
  const{server,a}=await pair(),before=copy(server.current()),iv=before.fields.iv.stringValue;
  server.offline.add('A');changed(a,'offline local',3);await a.client.sync();
  assert.equal(kind(a),'offline');assert.equal(a.value.scenesUnlocked,3);assert.deepEqual(server.current(),before);
  server.offline.delete('A');await a.client.sync();assert.equal(kind(a),'synced');
  assert.equal((await decrypt(server.current(),a.client.code())).scenesUnlocked,3);
  assert.notEqual(server.current().fields.iv.stringValue,iv,'AES-GCM writes need a fresh random IV');
});

test('stale dirty device cannot overwrite a newer remote version',async()=>{
  const{server,a,b}=await pair();changed(a,'remote advance',2);await a.client.sync();
  const remote=copy(server.current()),patches=patchCount(server);changed(b,'stale local',3);await b.client.sync();
  assert.equal(kind(b),'conflict');assert.equal(b.value.scenesUnlocked,3);assert.deepEqual(server.current(),remote);
  assert.equal(patchCount(server),patches,'Conflicting state must not be written automatically');
  await b.client.resolveConflict('remote');assert.equal(kind(b),'synced');assert.equal(b.value.scenesUnlocked,2);
});

test('explicit local conflict resolution uses the observed remote updateTime',async()=>{
  const{server,a,b}=await pair();changed(a,'remote version',2);await a.client.sync();changed(b,'chosen local',3);await b.client.sync();
  assert.equal(kind(b),'conflict');const updateTime=server.current().updateTime;
  await b.client.resolveConflict('local');assert.equal(kind(b),'synced');
  assert.equal((await decrypt(server.current(),a.client.code())).scenesUnlocked,3);
  const last=server.calls.filter(c=>c.method==='PATCH').at(-1);assert.equal(last.url.searchParams.get('currentDocument.updateTime'),updateTime);
});

test('compare-and-swap race cannot silently replace the winning device',async()=>{
  const{server,a,b}=await pair();changed(a,'racing A',2);changed(b,'winning B',3);
  const gate=server.holdNext(c=>c.client==='A'&&c.method==='PATCH'),operation=a.client.sync();
  await bounded(gate.arrived,'racing PATCH');await b.client.sync();assert.equal(kind(b),'synced');
  const winner=copy(server.current());gate.release();await bounded(operation,'racing operation');
  assert.equal(kind(a),'conflict');assert.equal(a.value.scenesUnlocked,2);assert.deepEqual(server.current(),winner);
});

test('busy device defers a remote apply until the current writing operation ends',async()=>{
  const{server,a,b}=await pair();changed(a,'remote ready',2);await a.client.sync();
  const before=copy(b.value),applied=b.applied.length;b.busy=true;await b.client.sync();
  assert.equal(kind(b),'pending');unchangedState(b,before);assert.equal(b.applied.length,applied);
  b.busy=false;await b.client.sync();assert.equal(kind(b),'synced');assert.equal(b.value.scenesUnlocked,2);
  assert.equal((await decrypt(server.current(),a.client.code())).scenesUnlocked,2);
});

test('a local change during a delayed remote read cannot be overwritten',async()=>{
  const{server,a,b}=await pair();changed(a,'remote ahead',2);await a.client.sync();
  const gate=server.holdNext(c=>c.client==='B'&&c.method==='GET'),operation=b.client.sync(),applied=b.applied.length;
  await bounded(gate.arrived,'delayed read');changed(b,'new local during read',3);gate.release();await bounded(operation,'delayed local-change read');
  assert.equal(b.value.scenesUnlocked,3);assert.equal(b.applied.length,applied);assertNotSynced(b);
  assert.equal((await decrypt(server.current(),a.client.code())).scenesUnlocked,2);
});

test('becoming busy while a read is in flight also defers remote progress',async()=>{
  const{server,a,b}=await pair();changed(a,'cloud before writing',2);await a.client.sync();
  const gate=server.holdNext(c=>c.client==='B'&&c.method==='GET'),operation=b.client.sync();
  await bounded(gate.arrived,'read before writing');const before=copy(b.value),applied=b.applied.length;b.busy=true;
  gate.release();await bounded(operation,'read finishing during writing');
  assert.equal(kind(b),'pending');unchangedState(b,before);assert.equal(b.applied.length,applied);
  b.busy=false;await b.client.sync();assert.equal(kind(b),'synced');assert.equal(b.value.scenesUnlocked,2);
});

test('pending remote state is not applied after intervening local learning',async()=>{
  const{server,a,b}=await pair();changed(a,'pending cloud',2);await a.client.sync();b.busy=true;await b.client.sync();
  assert.equal(kind(b),'pending');changed(b,'local while busy',3);b.busy=false;const applied=b.applied.length;
  await b.client.sync();assert.equal(kind(b),'conflict');assert.equal(b.value.scenesUnlocked,3);assert.equal(b.applied.length,applied);
  assert.equal((await decrypt(server.current(),a.client.code())).scenesUnlocked,2);
});

test('joining a missing or malformed code never creates a family or changes progress',async()=>{
  const server=firestore(),d=device(server,'new join'),before=copy(d.value);
  await d.client.joinFamily('00112233-44556677-8899aabb-ccddeeff');assertNotSynced(d);unchangedState(d,before);
  assert.equal(server.docs.size,0);assert.equal(patchCount(server),0);assert.equal(d.applied.length,0);assert.ok(!d.client.code());
  const calls=server.calls.length;await d.client.joinFamily('not-a-family-code');assert.equal(server.calls.length,calls);unchangedState(d,before);
});

test('busy join is rejected without replacing the existing connection',async()=>{
  const{server,a,b}=await pair(),c=device(server,'C',progress('another family',4));await c.client.createFamily();
  const oldCode=b.client.code(),before=copy(b.value),calls=server.calls.length;b.busy=true;
  await b.client.joinFamily(c.client.code());assert.equal(b.client.code(),oldCode);unchangedState(b,before);
  assert.equal(server.calls.length,calls,'Busy join should not read or write the proposed family');
});

test('authenticated ciphertext corruption is rejected without applying any progress',async()=>{
  const server=firestore(),a=device(server,'A');await a.client.createFamily();
  const doc=server.current(),cipher=Buffer.from(doc.fields.payload.stringValue,'base64');cipher[0]^=1;doc.fields.payload.stringValue=cipher.toString('base64');
  const b=device(server,'B',progress('untouched',0)),before=copy(b.value);await b.client.joinFamily(a.client.code());
  assertNotSynced(b);assert.equal(b.applied.length,0);unchangedState(b,before);assert.equal(patchCount(server),1);assert.ok(!b.client.code());
});

test('wrong envelope version or app identifier is rejected',async()=>{
  for(const field of ['formatVersion','app']){
    const server=firestore(),a=device(server,'A');await a.client.createFamily();
    server.current().fields[field]=field==='formatVersion'?{integerValue:'99'}:{stringValue:'unrelated-app'};
    const b=device(server,'B'),before=copy(b.value);await b.client.joinFamily(a.client.code());
    assertNotSynced(b);assert.equal(b.applied.length,0);unchangedState(b,before);assert.equal(patchCount(server),1);
  }
});

test('disconnect invalidates delayed reads and prevents connection resurrection',async()=>{
  const{server,a,b}=await pair();changed(a,'remote delayed',2);await a.client.sync();
  const gate=server.holdNext(c=>c.client==='B'&&c.method==='GET'),operation=b.client.sync();
  await bounded(gate.arrived,'disconnect read');const before=copy(b.value),applied=b.applied.length;b.client.disconnect();
  assert.equal(kind(b),'off');assert.ok(!b.client.code());gate.release();await bounded(operation,'read after disconnect');
  unchangedState(b,before);assert.equal(b.applied.length,applied);assert.equal(kind(b),'off');assert.ok(!b.client.code());
  const saved=b.storage.getItem(META);assert.ok(!saved||!JSON.parse(saved).code,'Disconnect must persist removal of the family secret');
});

test('failed state persistence never reports a successful remote apply',async()=>{
  const server=firestore(),a=device(server,'A');await a.client.createFamily();
  const b=device(server,'B',progress('save failure',0)),before=copy(b.value);b.failApply=true;
  await b.client.joinFamily(a.client.code());assertNotSynced(b);unchangedState(b,before);assert.equal(b.applied.length,0);
});

test('failed first join cannot turn the old local state into an automatic remote overwrite',async()=>{
  for(const failure of ['false','throw','reject']){
    const server=firestore(),a=device(server,'A',progress('cloud to preserve',2));await a.client.createFamily();
    const b=device(server,'B',progress('old local to preserve',0)),before=copy(b.value),cloud=copy(server.current());b.failApply=failure;
    const patches=patchCount(server);await b.client.joinFamily(a.client.code());assertNotSynced(b);unchangedState(b,before);
    await b.client.sync();assert.equal(patchCount(server),patches,'Retry after failed join must not upload the unapplied old local state: '+failure);
    assert.deepEqual(server.current(),cloud);unchangedState(b,before);
    const reloaded=device(server,'B-reloaded',before,{storage:b.storage});reloaded.failApply=failure;
    await reloaded.client.start();assert.equal(patchCount(server),patches,'Reload after failed join must not upload the unapplied old local state: '+failure);
    assert.deepEqual(server.current(),cloud);unchangedState(reloaded,before);
  }
});

test('failed remote update adoption cannot upload the old local state on retry or reload',async()=>{
  for(const failure of ['false','throw','reject']){
    const{server,a,b}=await pair();changed(a,'remote advance to preserve',2);await a.client.sync();
    const before=copy(b.value),cloud=copy(server.current()),patches=patchCount(server);b.failApply=failure;
    await b.client.sync();assertNotSynced(b);unchangedState(b,before);
    await b.client.sync();assert.equal(patchCount(server),patches,'Retry after failed adoption must not overwrite newer cloud progress: '+failure);
    assert.deepEqual(server.current(),cloud);unchangedState(b,before);
    const reloaded=device(server,'B-reloaded',before,{storage:b.storage});reloaded.failApply=failure;
    await reloaded.client.start();assert.equal(patchCount(server),patches,'Reload after failed adoption must not overwrite newer cloud progress: '+failure);
    assert.deepEqual(server.current(),cloud);unchangedState(reloaded,before);
  }
});

test('unavailable local storage cannot be reported as a durable synced connection',async()=>{
  const server=firestore(),storage=memoryStorage();storage.failWrites=true;
  const d=device(server,'quota',progress(),{storage});await d.client.createFamily();assertNotSynced(d);
  assert.ok(!d.statuses.some(s=>s.kind==='synced'),'Quota failure must not flash a false synced confirmation');
});

test('metadata save failure after a cloud write is surfaced instead of silently succeeding',async()=>{
  const{server,a}=await pair();a.storage.failWrites=true;changed(a,'local quota failure',3);
  const statusCount=a.statuses.length;await a.client.sync();assertNotSynced(a);
  assert.ok(!a.statuses.slice(statusCount).some(s=>s.kind==='synced'),'A failing durability step cannot confirm synced');
  assert.equal(a.value.scenesUnlocked,3);assert.ok(server.docs.size===1);
});

test('privacy-only local edits do not dirty or upload the progress document',async()=>{
  const{server,a}=await pair(),patches=patchCount(server),version=copy(server.current());
  a.value.rawS=['private'];a.value.inkLog=['private'];a.value.playerReview={correct:true};
  a.value.bank[0].rawS=['private bank'];a.client.changed();a.timers.advance(801);await turn();
  assert.equal(patchCount(server),patches);assert.deepEqual(server.current(),version);assert.equal(kind(a),'synced');
});

test('a saved connection with a hung network does not lock out disconnect or local play',async()=>{
  const{server,a}=await pair(),storage=memoryStorage();storage.values.set(META,a.storage.getItem(META));
  const d=device(server,'reload',progress('current local',4),{storage});
  const gate=server.holdNext(c=>c.client==='reload'&&c.method==='GET'),operation=d.client.start();
  await bounded(gate.arrived,'reload request');assert.equal(d.value.scenesUnlocked,4);
  d.client.disconnect();assert.equal(kind(d),'off');changed(d,'local still works',5);gate.release();
  await bounded(operation,'reload after disconnect');assert.equal(d.value.scenesUnlocked,5);assert.equal(kind(d),'off');assert.ok(!d.client.code());
});

test('a hung request times out, aborts, preserves local state, and remains retryable',async()=>{
  const{server,a,b}=await pair();changed(a,'remote after network recovery',2);await a.client.sync();
  const gate=server.holdNext(c=>c.client==='B'&&c.method==='GET'),before=copy(b.value),applied=b.applied.length;
  const operation=b.client.sync(),call=await bounded(gate.arrived,'hung request');
  b.timers.advance(5999);await turn();assert.equal(kind(b),'syncing');
  b.timers.advance(1);await bounded(operation,'request timeout');assert.equal(kind(b),'offline');
  assert.equal(call.signal.aborted,true);unchangedState(b,before);assert.equal(b.applied.length,applied);
  gate.release();await turn();unchangedState(b,before);assert.equal(kind(b),'offline');
  await b.client.sync();assert.equal(kind(b),'synced');assert.equal(b.value.scenesUnlocked,2);
});

test('the timeout also covers a response body that never finishes',async()=>{
  const server=firestore(),a=device(server,'A');await a.client.createFamily();
  const arrive=deferred(),release=deferred(),transport=server.fetchFor('B');let holdBody=false;
  const b=device(server,'B',progress('before join',0),{overrides:{fetch:async(url,init)=>{
    const result=await transport(url,init);if(!holdBody||init.method!=='GET')return result;
    holdBody=false;const text=result.text;result.text=async()=>{arrive.resolve(init.signal);await release.promise;return text();};return result;
  }}});
  await b.client.joinFamily(a.client.code());assert.equal(kind(b),'synced');changed(a,'remote body pending',2);await a.client.sync();
  holdBody=true;const operation=b.client.sync(),signal=await bounded(arrive.promise,'hung response body'),before=copy(b.value);
  b.timers.advance(6000);await bounded(operation,'body timeout');assert.equal(kind(b),'offline');assert.equal(signal.aborted,true);unchangedState(b,before);
  release.resolve();await turn();unchangedState(b,before);assert.equal(kind(b),'offline');
  await b.client.sync();assert.equal(kind(b),'synced');assert.equal(b.value.scenesUnlocked,2);
});

test('a committed write with a lost reply is confirmed by equal remote content on retry',async()=>{
  const server=firestore(),transport=server.fetchFor('A'),arrive=deferred(),release=deferred();let loseReply=false;
  const a=device(server,'A',progress(),{overrides:{fetch:async(url,init)=>{
    const result=await transport(url,init);if(!loseReply||init.method!=='PATCH')return result;
    loseReply=false;arrive.resolve(init.signal);await release.promise;return result;
  }}});
  await a.client.createFamily();assert.equal(kind(a),'synced');changed(a,'committed without acknowledgement',2);loseReply=true;
  const operation=a.client.sync(),signal=await bounded(arrive.promise,'committed PATCH reply');
  assert.equal((await decrypt(server.current(),a.client.code())).scenesUnlocked,2);
  const committedTime=server.current().updateTime,patches=patchCount(server);
  a.timers.advance(6000);await bounded(operation,'lost PATCH timeout');assert.equal(kind(a),'offline');assert.equal(signal.aborted,true);
  await a.client.sync();assert.equal(kind(a),'synced');assert.equal(patchCount(server),patches,'Retry should confirm rather than rewrite already saved content');
  const saved=JSON.parse(a.storage.getItem(META));assert.equal(saved.baseUpdateTime,committedTime);assert.equal(saved.dirty,false);
  release.resolve();await turn();assert.equal(kind(a),'synced');assert.equal(a.value.scenesUnlocked,2);
});

test('another device saving exactly the same progress is confirmation rather than conflict',async()=>{
  const{server,a,b}=await pair();changed(a,'identical progress',2);changed(b,'identical progress',2);
  await a.client.sync();const savedVersion=server.current().updateTime,patches=patchCount(server),before=copy(b.value);
  await b.client.sync();assert.equal(kind(b),'synced');unchangedState(b,before);assert.equal(patchCount(server),patches);
  const saved=JSON.parse(b.storage.getItem(META));assert.equal(saved.baseUpdateTime,savedVersion);assert.equal(saved.dirty,false);
});

test('Firestore HTTP 400 precondition statuses remain safe conflicts without exposing backend messages',async()=>{
  const privateBackendText='synthetic-backend-secret-never-show';
  for(const backendStatus of ['FAILED_PRECONDITION','ABORTED','ALREADY_EXISTS']){
    const server=firestore(),transport=server.fetchFor('A');let rejectWrite=false;
    const a=device(server,'A',progress(),{overrides:{fetch:(url,init)=>{
      if(rejectWrite&&init.method==='PATCH')return Promise.resolve(response(400,{error:{code:400,status:backendStatus,message:privateBackendText}}));
      return transport(url,init);
    }}});
    await a.client.createFamily();const cloud=copy(server.current());changed(a,'rejected condition',2);rejectWrite=true;
    await a.client.sync();assert.equal(kind(a),'conflict',backendStatus);assert.equal(a.value.scenesUnlocked,2);assert.deepEqual(server.current(),cloud);
    assert.ok(!JSON.stringify(a.statuses).includes(privateBackendText),'Raw backend errors must not leak into UI messages');
    assert.equal(JSON.parse(a.storage.getItem(META)).dirty,true);
  }
});

test('reading an HTTP 400 error body is also bounded by the request timeout',async()=>{
  const server=firestore(),transport=server.fetchFor('A'),arrive=deferred(),release=deferred();let rejectWrite=false;
  const privateBackendText='synthetic-private-error-body';
  const a=device(server,'A',progress(),{overrides:{fetch:(url,init)=>{
    if(rejectWrite&&init.method==='PATCH')return Promise.resolve({ok:false,status:400,text:async()=>{
      arrive.resolve(init.signal);await release.promise;return JSON.stringify({error:{status:'FAILED_PRECONDITION',message:privateBackendText}});
    }});
    return transport(url,init);
  }}});
  await a.client.createFamily();const cloud=copy(server.current());changed(a,'error body timeout',2);rejectWrite=true;
  const operation=a.client.sync(),signal=await bounded(arrive.promise,'HTTP 400 body');a.timers.advance(6000);
  await bounded(operation,'HTTP 400 body timeout');assert.equal(kind(a),'offline');assert.equal(signal.aborted,true);assert.deepEqual(server.current(),cloud);
  assert.equal(a.value.scenesUnlocked,2);assert.ok(!JSON.stringify(a.statuses).includes(privateBackendText));
  release.resolve();await turn();assert.equal(kind(a),'offline');
});

test('disconnect in the same tick cancels family creation before its first microtask',async()=>{
  const server=firestore(),d=device(server,'cancel immediately'),before=copy(d.value);
  const operation=d.client.createFamily();d.client.disconnect();await bounded(operation,'cancelled creation');await turn();
  assert.equal(server.calls.length,0);assert.equal(server.docs.size,0);assert.ok(!d.client.code());assert.equal(kind(d),'off');
  assert.equal(d.storage.getItem(META),null);assert.equal(d.applied.length,0);unchangedState(d,before);
});

// Synthetic phrase, never used against a live service. The accent is tested
// in both canonical encodings to exercise cross-device Unicode input.
const PASSWORD='orchid Cafe\u0301 harbor comet 8';
function passwordDoc(server){
  const entries=[...server.docs.entries()].filter(([url])=>url.includes('/hanzi-password-v1-'));
  assert.equal(entries.length,1);return entries[0];
}
async function passwordPair(){
  const server=firestore(),a=device(server,'A'),b=device(server,'B',progress('other',0));
  await a.client.createPasswordFamily(PASSWORD);assert.equal(kind(a),'synced');
  await b.client.joinPasswordFamily(PASSWORD);assert.equal(kind(b),'synced');
  return {server,a,b};
}

test('password setup uses a separate encrypted document and never stores or exposes the entered password',async()=>{
  const server=firestore(),state=progress('password-source',3);
  state.inkLog=[{rawS:'synthetic-private'}];state.bank[0].playerReview={synthetic:true};
  const a=device(server,'A',state),before=copy(a.value);
  await a.client.createFamily();const oldCode=a.client.code(),[oldPath,oldDoc]=[...server.docs.entries()][0];
  assert.equal(a.client.status().credentialMode,'code');
  await a.client.createPasswordFamily(PASSWORD);assert.equal(kind(a),'synced');unchangedState(a,before);
  assert.equal(a.client.status().credentialMode,'password');assert.equal(a.client.code(),'');
  assert.equal(Object.hasOwn(a.client.status(),'code'),false);
  assert.deepEqual(server.docs.get(oldPath),oldDoc,'Switching credentials never writes the legacy family');
  const [pathname,doc]=passwordDoc(server),stored=JSON.parse(a.storage.getItem(META));
  assert.equal(stored.version,2);assert.match(stored.passwordSeed,/^[0-9a-f]{64}$/);
  // Independently derive the protocol identity and decrypt the wire document.
  const expectedSeed=pbkdf2Sync(PASSWORD.normalize('NFC'),'hanzi-magic-door:password-family:v1:'+PROJECT,600000,32,'sha256').toString('hex');
  assert.equal(stored.passwordSeed,expectedSeed);
  const id=sha('hanzi-magic-door:document:password-v1:'+expectedSeed);
  assert.ok(pathname.endsWith('/families/hanzi-password-v1-'+id));
  const key=await webcrypto.subtle.importKey('raw',Buffer.from(sha('hanzi-magic-door:key:password-v1:'+expectedSeed),'hex'),'AES-GCM',false,['decrypt']);
  const plaintext=JSON.parse(Buffer.from(await webcrypto.subtle.decrypt({name:'AES-GCM',iv:Buffer.from(doc.fields.iv.stringValue,'base64')},
    key,Buffer.from(doc.fields.payload.stringValue,'base64'))).toString('utf8'));
  assertNoInk(plaintext);assert.equal(plaintext.scenesUnlocked,3);
  assert.equal(plaintext.dailyCount,5,'Legacy dailyCount remains a wire-compatible field');
  for(const serialized of [JSON.stringify(a.storage.writes),JSON.stringify(a.statuses),JSON.stringify(server.calls)]){
    assert.ok(!serialized.includes(PASSWORD)&&!serialized.includes(PASSWORD.normalize('NFC')));
  }
  assert.ok(!JSON.stringify(a.statuses).includes(expectedSeed),'UI never exposes the saved derived capability');
  assert.ok(!JSON.stringify(server.calls).includes(expectedSeed),'Cloud only receives an opaque locator and ciphertext');
  const b=device(server,'B',progress('empty device',0)),patches=patchCount(server);
  await b.client.joinPasswordFamily(PASSWORD.normalize('NFC'));
  assert.equal(kind(b),'synced');assert.deepEqual(b.value,plaintext);assert.equal(patchCount(server),patches);
  // Reload reads only the derived local identity, not a stored plaintext or a
  // new slow derivation; loading the old code on another device still works.
  const subtle=Object.create(webcrypto.subtle);
  Object.defineProperty(subtle,'deriveBits',{value(){throw Error('Reload must not derive the password again');}});
  for(const method of ['digest','importKey','encrypt','decrypt'])Object.defineProperty(subtle,method,{value:webcrypto.subtle[method].bind(webcrypto.subtle)});
  const reload=device(server,'reload',b.value,{storage:b.storage,overrides:{crypto:{subtle,getRandomValues:webcrypto.getRandomValues.bind(webcrypto)}}});
  assert.equal(reload.client.status().credentialMode,'password');await reload.client.start();
  assert.equal(kind(reload),'synced');assert.equal(patchCount(server),patches);
  const oldDevice=device(server,'legacy device',progress('legacy join',0));
  await oldDevice.client.joinFamily(oldCode);assert.equal(kind(oldDevice),'synced');assert.equal(oldDevice.client.code(),oldCode);
  assert.equal(oldDevice.value.scenesUnlocked,3);assert.equal(patchCount(server),patches);
});

test('weak, malformed and wrong passwords neither enroll the device nor create remote progress',async()=>{
  const server=firestore(),d=device(server,'password validation'),before=copy(d.value);
  for(const invalid of ['', 'short words', '123456789012', '１２３４５６７８９０１２', 'a'.repeat(12),
    'a-b-c d-e-f!'.repeat(12), 'password\nwith control', '\ud800password-with-bad-unicode']){
    await d.client.createPasswordFamily(invalid);assert.equal(kind(d),'error');
    await d.client.joinPasswordFamily(invalid);assert.equal(kind(d),'error');
  }
  assert.equal(server.calls.length,0,'Invalid input must fail before any cloud call');
  const source=device(server,'source');await source.client.createPasswordFamily(PASSWORD);const doc=copy(server.current());
  await d.client.joinPasswordFamily(PASSWORD.toUpperCase());assert.equal(kind(d),'error');
  assert.equal(d.client.status().connected,false);assert.equal(d.storage.getItem(META),null);unchangedState(d,before);
  assert.equal(patchCount(server),1);assert.deepEqual(server.current(),doc);
});

test('a browser without password derivation can still join and read the original code document',async()=>{
  const server=firestore(),source=device(server,'legacy source',progress('legacy code',3));
  await source.client.createFamily();const code=source.client.code(),oldPath=server.calls[0].path;
  const subtle=Object.fromEntries(['digest','importKey','encrypt','decrypt'].map(method=>[method,webcrypto.subtle[method].bind(webcrypto.subtle)]));
  const d=device(server,'no password derivation',progress('legacy destination',0),{overrides:{crypto:{subtle,getRandomValues:webcrypto.getRandomValues.bind(webcrypto)}}});
  const calls=server.calls.length;
  await d.client.joinPasswordFamily(PASSWORD);assert.equal(kind(d),'error','Do not disable the independent legacy-code UI');
  assert.equal(server.calls.length,calls);
  await d.client.joinFamily(code);assert.equal(kind(d),'synced');assert.equal(d.client.code(),code);
  assert.equal(d.value.scenesUnlocked,3);assert.equal(server.calls.at(-1).path,oldPath);assert.equal(patchCount(server),1);
});

test('duplicate password setup and create-only races never overwrite the first family',async()=>{
  const server=firestore(),first=device(server,'winner',progress('winning family',4)),second=device(server,'race',progress('empty device',0));
  const gate=server.holdNext(call=>call.client==='race'&&call.method==='PATCH');
  const pending=second.client.createPasswordFamily(PASSWORD);
  const create=await bounded(gate.arrived,'competing password setup');
  assert.equal(create.url.searchParams.get('currentDocument.exists'),'false');
  await first.client.createPasswordFamily(PASSWORD);assert.equal(kind(first),'synced');
  const document=copy(server.current());gate.release();await bounded(pending,'lost password setup race');
  assert.equal(kind(second),'error');assert.match(second.client.status().message,/已有云端进度.*接入/);
  assert.equal(second.client.status().connected,false);assert.equal(second.storage.getItem(META),null);
  assert.deepEqual(server.current(),document);assert.equal(second.value.scenesUnlocked,0);
  const count=patchCount(server);await second.client.createPasswordFamily(PASSWORD);
  assert.equal(patchCount(server),count,'Known existing documents never receive a create attempt');
  await second.client.joinPasswordFamily(PASSWORD);assert.equal(kind(second),'synced');assert.equal(second.value.scenesUnlocked,4);
  assert.equal(patchCount(server),count);assert.deepEqual(server.current(),document);
});

test('an existing connection remains unchanged if password setup is offline or its old progress is pending',async()=>{
  const {server,a,b}=await pair(),oldA=a.client.code(),oldB=b.client.code();
  const oldMetaA=a.storage.getItem(META),oldCloud=copy(server.current());
  server.offline.add('A');await a.client.createPasswordFamily(PASSWORD);
  assert.equal(kind(a),'offline');assert.equal(a.client.code(),oldA);assert.equal(a.storage.getItem(META),oldMetaA);
  assert.deepEqual(server.current(),oldCloud);server.offline.delete('A');
  changed(a,'pending legacy save',2);const beforePending=server.calls.length;
  await a.client.createPasswordFamily(PASSWORD);
  assert.equal(kind(a),'pending');assert.equal(a.client.code(),oldA);assert.equal(server.calls.length,beforePending);
  await a.client.sync();assert.equal(kind(a),'synced');
  changed(b,'conflicting legacy save',3);await b.client.sync();assert.equal(kind(b),'conflict');
  const beforeConflict=server.calls.length;await b.client.joinPasswordFamily(PASSWORD);
  assert.equal(kind(b),'conflict');assert.equal(b.client.code(),oldB);assert.equal(server.calls.length,beforeConflict);
  assert.equal(b.value.scenesUnlocked,3);assert.equal(server.docs.size,1);
});

test('password join rechecks active writing after the read and retains the old code until safe',async()=>{
  const server=firestore(),a=device(server,'source',progress('password family',4)),b=device(server,'writing',progress('old local',2));
  await a.client.createPasswordFamily(PASSWORD);await b.client.createFamily();
  const oldCode=b.client.code(),oldMeta=b.storage.getItem(META),before=copy(b.value),patches=patchCount(server);
  const gate=server.holdNext(call=>call.client==='writing'&&call.method==='GET'&&call.path.includes('/hanzi-password-v1-'));
  const join=b.client.joinPasswordFamily(PASSWORD);await bounded(gate.arrived,'pending password read');
  b.busy=true;gate.release();await bounded(join,'password join while handwriting');
  assert.equal(kind(b),'pending');assert.equal(b.client.code(),oldCode);assert.equal(b.storage.getItem(META),oldMeta);
  assert.equal(b.applied.length,0);unchangedState(b,before);assert.equal(patchCount(server),patches);
  b.busy=false;await b.client.joinPasswordFamily(PASSWORD);assert.equal(kind(b),'synced');
  assert.equal(b.client.status().credentialMode,'password');assert.equal(b.value.scenesUnlocked,4);assert.equal(patchCount(server),patches);
});

test('password families preserve offline changes and still require an explicit conflict choice',async()=>{
  const {server,a,b}=await passwordPair();const initial=copy(server.current());
  server.offline.add('B');changed(b,'local offline password family',3);await b.client.sync();
  assert.equal(kind(b),'offline');assert.deepEqual(server.current(),initial);assert.equal(b.value.scenesUnlocked,3);
  changed(a,'newer password family',2);await a.client.sync();assert.equal(kind(a),'synced');
  server.offline.delete('B');const remote=copy(server.current()),patches=patchCount(server);
  await b.client.sync();assert.equal(kind(b),'conflict');assert.deepEqual(server.current(),remote);
  assert.equal(b.value.scenesUnlocked,3);assert.equal(patchCount(server),patches);
  await b.client.resolveConflict('remote');assert.equal(kind(b),'synced');assert.equal(b.value.scenesUnlocked,2);
  assert.equal(patchCount(server),patches);assert.deepEqual(server.current(),remote);
});

test('failed password adoption preserves the durable conflict barrier across reload',async()=>{
  const server=firestore(),a=device(server,'source',progress('cloud survives',2));await a.client.createPasswordFamily(PASSWORD);
  const cloud=copy(server.current()),b=device(server,'failure',progress('local survives',3)),before=copy(b.value);
  b.failApply='throw';await b.client.joinPasswordFamily(PASSWORD);assert.equal(kind(b),'conflict');unchangedState(b,before);
  assert.equal(JSON.parse(b.storage.getItem(META)).requireConflict,true);
  const calls=server.calls.length,reloaded=device(server,'reload after failed adoption',before,{storage:b.storage});
  await reloaded.client.start();await reloaded.client.sync();assert.equal(kind(reloaded),'conflict');
  assert.equal(reloaded.client.status().credentialMode,'password');assert.equal(server.calls.length,calls);
  assert.deepEqual(server.current(),cloud);unchangedState(reloaded,before);
  await reloaded.client.resolveConflict('remote');assert.equal(kind(reloaded),'synced');
  assert.equal(reloaded.value.scenesUnlocked,2);assert.equal(patchCount(server),1);
});

test('disconnect during slow password derivation cannot recreate the connection',async()=>{
  const server=firestore(),arrived=deferred(),release=deferred();
  const subtle=Object.create(webcrypto.subtle);
  for(const method of ['digest','importKey','encrypt','decrypt'])Object.defineProperty(subtle,method,{value:webcrypto.subtle[method].bind(webcrypto.subtle)});
  Object.defineProperty(subtle,'deriveBits',{value:async(...args)=>{arrived.resolve();await release.promise;return webcrypto.subtle.deriveBits(...args);}});
  const d=device(server,'cancel password',progress(),{overrides:{crypto:{subtle,getRandomValues:webcrypto.getRandomValues.bind(webcrypto)}}});
  const before=copy(d.value),operation=d.client.createPasswordFamily(PASSWORD);
  await bounded(arrived.promise,'password derivation');assert.equal(kind(d),'syncing');
  d.client.disconnect();release.resolve();await bounded(operation,'cancelled password derivation');
  assert.equal(kind(d),'off');assert.equal(d.storage.getItem(META),null);assert.equal(server.calls.length,0);unchangedState(d,before);
});

async function main(){
  for(const{name,run}of tests){await run();console.log('OK '+name);}
  console.log('Progress sync: '+tests.length+' synthetic multi-device scenarios passed.');
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
