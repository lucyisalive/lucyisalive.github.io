'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {webcrypto, createHash} = require('node:crypto');

const startup = fs.readFileSync(path.join(__dirname, 'offline-startup.cjs'), 'utf8');
const boundary = startup.indexOf('\n(async()=>{');
const loop = "for(let i=0;i<scripts.length;i++)vm.runInContext(scripts[i].source,context,{timeout:10000,filename:'built-inline-'+i+'.js'});";
assert.ok(boundary > 0 && startup.includes(loop));
const prelude = startup.slice(0, boundary).replace(loop, `for(let i=0;i<scripts.length;i++){
  if(i===mainIndex) host.beforeMain(context);
  vm.runInContext(scripts[i].source,context,{timeout:10000,filename:'built-inline-'+i+'.js'});
}`);
const setup = new Function('require', '__dirname', 'process', 'host', prelude + '\nreturn {environment,flush};');
const SERVICE = 'https://synthetic-sentences.invalid';
const TOKEN_A = 'a'.repeat(64), TOKEN_B = 'b'.repeat(64);
const target = {char: '栏', word: '栏杆牌', pinyin: 'lán'};
const sentence = '管理员把新的栏杆牌装在了入口。';

async function pageFixture({paired = false, connected = true, blockPopup = false} = {}){
  const listeners = new Map(), popups = [], calls = [];
  let token = TOKEN_A, derive = () => Promise.resolve(token), onStatus;
  let changed = 0, generationGate = null, healthGate = null;
  const controller = {
    status: () => ({connected, kind: 'idle', credentialMode: 'password', message: '合成家庭连接'}),
    code: () => '',
    sentenceAccessToken: () => derive(),
    start(){ onStatus(); return Promise.resolve(this.status()); },
    sync: () => Promise.resolve(controller.status()),
    changed(){ changed++; },
    listBackups: async () => [],
    disconnect(){ connected = false; onStatus(); return Promise.resolve(this.status()); },
    joinPasswordFamily(){ token = TOKEN_B; connected = true; onStatus(); return Promise.resolve(this.status()); },
  };
  const host = {
    beforeMain(context){
      const win = context.window;
      context.URL = URL;
      context.TextEncoder = TextEncoder;
      win.URL = URL; win.AbortController = AbortController; win.localStorage = context.localStorage; win.crypto = webcrypto;
      win.HanziSentenceServiceConfig = {endpoint: SERVICE};
      win.HanziProgressSync = {create(options){ onStatus = options.onStatus; return controller; }};
      win.addEventListener = (name, callback) => {
        if(!listeners.has(name)) listeners.set(name, []);
        listeners.get(name).push(callback);
      };
      win.open = (url, name, features) => {
        assert.equal(url, SERVICE + '/pair', 'A pairing URL carries no token, family code, or password');
        assert.ok(!features.includes('noopener'), 'The owner pairing flow requires a live opener');
        if(blockPopup) return null;
        const popup = {closed: false, messages: [], focused: 0,
          focus(){ this.focused++; }, close(){ this.closed = true; },
          postMessage(data, origin){ this.messages.push({data: JSON.parse(JSON.stringify(data)), origin}); },
        };
        popups.push(popup); return popup;
      };
      const originalFetch = win.fetch;
      win.fetch = async (url, init = {}) => {
        if(!String(url).startsWith(SERVICE)) return originalFetch(url, init);
        calls.push({url, init});
        assert.equal(init.headers.Authorization, 'Bearer ' + token);
        assert.equal(init.credentials, 'omit');
        assert.equal(init.referrerPolicy, 'no-referrer');
        if(url.endsWith('/health')){
          if(healthGate) return healthGate(init);
          return {ok: paired, status: paired ? 200 : 401,
            text: async () => JSON.stringify(paired ? {ready: true} : {error: {code: 'unauthorized'}})};
        }
        assert.equal(url, SERVICE + '/v1/sentences');
        if(generationGate) return generationGate(init);
        assert.deepEqual(JSON.parse(init.body), {items: [target]});
        return {ok: true, status: 200, text: async () => JSON.stringify({sentences: [{...target, sentence}]})};
      };
    },
  };
  const {environment, flush} = setup(require, __dirname, {argv: [...process.argv, '--source']}, host);
  const page = environment({location: new URL('https://lucyisalive.github.io/magic-hanzi/')});
  await flush();
  const emit = async (type, event) => {
    await Promise.all((listeners.get(type) || []).map(callback => callback(event)));
    await flush();
  };
  const message = (popup, type, origin = SERVICE) => emit('message', {source: popup, origin, data: {type}});
  const addTarget = () => { page.context.sentenceFixture = target; page.run('enqueueParentItems([sentenceFixture])'); };
  const hints = () => JSON.parse(page.run("JSON.stringify({bank:state.bank.find(item=>item.char==='栏')?.sentence,queue:state.priorityQueue.find(item=>item.char==='栏')?.sentence})"));
  return {page, calls, popups, controller, flush, emit, message, addTarget, hints,
    setPaired(value){ paired = value; }, setTokenDeriver(value){ derive = value; },
    setHealthGate(value){ healthGate = value; }, setGenerationGate(value){ generationGate = value; },
    notify: () => onStatus(), changed: () => changed};
}

async function safeOwnerPairing(){
  const game = await pageFixture();
  game.addTarget();
  const before = game.page.run('JSON.stringify({char:currentItem.char,passedCount,bank:state.bank.map(({sentence,...item})=>item)})');
  assert.equal(game.calls.length, 1, 'A remembered family first checks its existing server authorization');
  assert.match(game.page.ids.get('aiSentenceStatus').textContent, /家庭连接未通过验证/u);
  game.page.tap('aiSentencePairBtn');
  const popup = game.popups[0];
  game.page.tap('aiSentencePairBtn');
  assert.equal(game.popups.length, 1, 'Repeated taps focus the current pairing window');
  assert.equal(popup.focused, 1);
  await game.message(popup, 'hanzi-sentence-paired');
  assert.equal(game.calls.length, 1, 'Success without a token handshake is ignored');
  await game.message({}, 'hanzi-sentence-pair-request');
  await game.message(popup, 'hanzi-sentence-pair-request', 'https://untrusted.invalid');
  assert.deepEqual(popup.messages, [], 'Both the exact source and exact origin are required');
  await game.message(popup, 'hanzi-sentence-pair-request');
  assert.deepEqual(popup.messages, [{data: {type: 'hanzi-sentence-pair-token', token: TOKEN_A}, origin: SERVICE}]);
  assert.equal(game.calls.length, 1, 'Providing the pairing token alone does not start paid work');
  game.setPaired(true);
  await game.message(popup, 'hanzi-sentence-paired');
  assert.equal(popup.closed, true);
  assert.equal(game.calls.filter(call => call.url.endsWith('/health')).length, 2);
  assert.equal(game.calls.filter(call => call.url.endsWith('/v1/sentences')).length, 1);
  assert.deepEqual(game.hints(), {bank: sentence, queue: sentence});
  assert.ok(game.changed() > 0, 'Generated hints use the existing learning-save and sync notification path');
  assert.equal(game.page.run('JSON.stringify({char:currentItem.char,passedCount,bank:state.bank.map(({sentence,...item})=>item)})'), before,
    'Pairing and generation leave the current question and learning evidence intact');
  assert.equal(game.page.ids.get('aiSentenceConnectBtn').hidden, true);
  assert.ok([...game.page.storage.values()].every(value => !String(value).includes(TOKEN_A)), 'The bearer token never enters browser saves');
}

async function savedFamilyAndBlockedPopup(){
  const resumed = await pageFixture({paired: true});
  assert.equal(resumed.page.context.window.hanziAiSentenceClient.status().connected, true);
  assert.equal(resumed.popups.length, 0, 'An already registered family reconnects without any popup, OAuth, or password prompt');
  assert.equal(resumed.page.ids.get('panelOverlay').classList.contains('show'), false, 'Automatic reconnect does not open parent settings');
  const fingerprint = resumed.page.ids.get('aiSentenceFamilyFingerprint');
  assert.equal(fingerprint.textContent, '');
  assert.equal(fingerprint.hidden, true, 'No family fingerprint is displayed without the explicit maintenance action');
  await resumed.page.run('showAiSentenceFamilyFingerprint()');
  assert.equal(fingerprint.textContent, createHash('sha256').update(TOKEN_A).digest('hex'));
  assert.notEqual(fingerprint.textContent, TOKEN_A, 'The visible fingerprint cannot be replayed as the bearer token');
  resumed.page.tap('cloudSyncDisconnectBtn');
  await resumed.flush();
  assert.equal(fingerprint.textContent, '');
  assert.equal(fingerprint.hidden, true, 'Disconnect immediately removes the previous family fingerprint');
  const absent = await pageFixture({connected: false});
  assert.equal(absent.calls.length, 0);
  assert.equal(absent.page.ids.get('aiSentenceConnectBtn').disabled, true);
  assert.match(absent.page.ids.get('aiSentenceStatus').textContent, /先接入.*家庭同步/u);
  const blocked = await pageFixture({blockPopup: true});
  blocked.page.tap('aiSentencePairBtn');
  assert.match(blocked.page.ids.get('aiSentenceStatus').textContent, /窗口未打开/u);
  assert.equal(blocked.page.context.window.hanziAiSentenceClient.status().busy, false);
}

async function disconnectedHandshake(){
  const game = await pageFixture();
  game.page.tap('aiSentencePairBtn');
  const popup = game.popups[0];
  let finishToken;
  game.setTokenDeriver(() => new Promise(resolve => { finishToken = resolve; }));
  const pending = game.message(popup, 'hanzi-sentence-pair-request');
  game.page.tap('cloudSyncDisconnectBtn');
  finishToken(TOKEN_A);
  await pending;
  assert.equal(popup.closed, true);
  assert.deepEqual(popup.messages, [], 'A delayed token must not be sent after the family disconnects');
  await game.message(popup, 'hanzi-sentence-paired');
  assert.equal(game.calls.length, 1, 'A late success from a previous popup is ignored');
  assert.equal(game.page.context.window.hanziAiSentenceClient.status().connected, false);
}

async function switchedFamilyCancelsGeneration(){
  const game = await pageFixture({paired: true});
  let finish;
  game.setGenerationGate(() => new Promise(resolve => { finish = resolve; }));
  game.addTarget();
  await game.flush();
  assert.equal(typeof finish, 'function');
  game.page.ids.get('cloudSyncPassword').value = 'synthetic replacement family password';
  await game.page.run("syncWithCredential('joinPasswordFamily','cloudSyncPassword',false)");
  finish({ok: true, status: 200, text: async () => JSON.stringify({sentences: [{...target, sentence}]})});
  await game.flush();
  assert.deepEqual(game.hints(), {}, 'An old generation cannot write into the replacement family');
  assert.equal(game.calls.find(call => call.url.endsWith('/v1/sentences')).init.signal.aborted, true);
  assert.equal(game.page.context.window.hanziAiSentenceClient.status().connected, true, 'The new family can check its own authorization');
}

async function routineRetryNeverOpensLogin(){
  const game = await pageFixture();
  assert.equal(game.page.ids.get('aiSentenceConnectBtn').textContent, '重试自动造句');
  game.page.tap('aiSentenceConnectBtn');
  await game.flush();
  assert.equal(game.calls.length, 2, 'The main button retries the existing family health check');
  assert.equal(game.popups.length, 0, 'An authorization failure does not send the parent to another login');
  game.setHealthGate(async () => { throw Error('Synthetic temporary network failure'); });
  game.page.tap('aiSentenceConnectBtn');
  await game.flush();
  assert.equal(game.page.context.window.hanziAiSentenceClient.status().connected, false);
  assert.equal(game.popups.length, 0, 'A temporary network failure opens no login window');
  game.setHealthGate(null);
  game.setPaired(true);
  game.page.tap('aiSentenceConnectBtn');
  await game.flush();
  assert.equal(game.page.context.window.hanziAiSentenceClient.status().connected, true);
  game.page.tap('aiSentenceDisconnectBtn');
  assert.equal(game.page.ids.get('aiSentenceConnectBtn').textContent, '恢复自动造句');
  game.page.tap('aiSentenceConnectBtn');
  await game.flush();
  assert.equal(game.page.context.window.hanziAiSentenceClient.status().connected, true);
  await game.emit('online');
  assert.equal(game.popups.length, 0, 'Manual resume and online recovery only reuse the existing family connection');
  assert.ok(game.calls.every(call => call.url === SERVICE + '/health'), 'Routine connection retry has no pairing or paid-generation request');
}

Promise.resolve().then(safeOwnerPairing).then(savedFamilyAndBlockedPopup).then(disconnectedHandshake)
  .then(switchedFamilyCancelsGeneration).then(routineRetryNeverOpensLogin).then(() => {
    console.log('Sentence pairing: advanced owner handshake, automatic family reuse, login-free routine retry, blocked popup, disconnect and replacement-family races passed.');
  }).catch(error => { console.error(error); process.exitCode = 1; });
