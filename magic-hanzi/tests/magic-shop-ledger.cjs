'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const vm = require('node:vm');
const os = require('node:os');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { setTimeout: delay } = require('node:timers/promises');
const catalogSource = fs.readFileSync(path.join(__dirname, '../magic-shop-catalog.js'), 'utf8');
const ledgerSource = fs.readFileSync(path.join(__dirname, '../magic-shop-ledger.js'), 'utf8');
const KEY = 'hanzi-magic-shop-ledger-v1', LEGACY = 'hanzi-herbalist-wallet-v1';

function sharedStorage(initial = {}) {
  const data = new Map(Object.entries(initial)), windows = new Set(), pending = new Map();
  const locks = { request(key, action) {
    const task = (pending.get(key) || Promise.resolve()).then(action);
    pending.set(key, task.catch(() => {}));
    return task;
  } };
  return { data, windows, locks, failWrites: false };
}

function environment(shared, options = {}) {
  const events = new Map();
  const win = {
    localStorage: {
      getItem: key => shared.data.get(key) ?? null,
      setItem(key, value) {
        if (shared.failWrites) throw new DOMException('full', 'QuotaExceededError');
        shared.data.set(key, value);
        for (const other of shared.windows) if (other !== win) other.dispatch('storage', { key });
      },
    },
    navigator: { locks: options.noLocks ? undefined : shared.locks },
    addEventListener(type, fn) { if (!events.has(type)) events.set(type, new Set()); events.get(type).add(fn); },
    removeEventListener(type, fn) { events.get(type)?.delete(fn); },
    dispatch(type, event = {}) { events.get(type)?.forEach(fn => fn(event)); },
  };
  if (options.indexedDB) win.indexedDB = options.indexedDB;
  shared.windows.add(win);
  vm.runInNewContext(catalogSource + '\n' + ledgerSource, { window: win });
  const ledger = win.HanziMagicShopLedger.create({ window: win });
  return { win, ledger };
}

async function fallbackTests() {
  const shared = sharedStorage({ [LEGACY]: '42', 'unrelated-learning-record': 'keep' });
  const first = environment(shared).ledger;
  assert.equal(first.snapshot().balance, 42, 'The HUD can read old coins before ready');
  assert.equal((await first.ready()).ready, true);
  assert.equal(first.snapshot().storage, 'localstorage');
  assert.equal((await first.purchase('brass-candlestick')).snapshot.balance, 27);
  assert.equal((await first.purchase('brass-candlestick')).reason, 'already-owned');
  assert.equal((await first.purchase('wizard-cat')).reason, 'insufficient-balance');
  assert.equal((await first.purchase('no-item')).reason, 'invalid-item');
  assert.equal((await first.credit(3, 'round:pass:1')).snapshot.balance, 30);
  assert.equal((await first.credit(3, 'round:pass:1')).credited, 0);
  assert.equal((await first.credit(-3)).reason, 'invalid-credit');
  assert.equal(shared.data.get(LEGACY), '42', 'Migration leaves the original balance intact');
  assert.equal(shared.data.get('unrelated-learning-record'), 'keep');
  shared.data.set(LEGACY, '9999');
  const secondPage = environment(shared), second = secondPage.ledger;
  await second.ready();
  assert.equal(second.snapshot().balance, 30, 'Reload never reimports the legacy wallet');
  assert.equal(second.snapshot().owned.length, 1);
  const sameItem = await Promise.all([first.purchase('rune-quill'), second.purchase('rune-quill')]);
  assert.equal(sameItem.filter(result => result.ok).length, 1, 'Two documents buy the same item only once');
  const reopened = environment(shared).ledger;
  await reopened.ready();
  assert.equal(reopened.snapshot().balance, 15);
  assert.equal(reopened.snapshot().owned.length, 2);
  assert.equal((await reopened.credit(3, 'round:pass:1')).credited, 0, 'Event dedupe survives reload');

  const contested = sharedStorage({ [LEGACY]: '30' });
  const a = environment(contested).ledger, b = environment(contested).ledger;
  await Promise.all([a.ready(), b.ready()]);
  const differentItems = await Promise.all([a.purchase('star-chair'), b.purchase('glowing-potions')]);
  assert.equal(differentItems.filter(result => result.ok).length, 1, 'Two tabs cannot spend the same last coins');
  assert.equal(JSON.parse(contested.data.get(KEY)).balance, 0);
  assert.equal(JSON.parse(contested.data.get(KEY)).owned.length, 1);
  const credits = await Promise.all([a.credit(5, 'round:finale'), b.credit(5, 'round:finale')]);
  assert.equal(credits.reduce((sum, result) => sum + result.credited, 0), 5);
  await Promise.all([a.credit(1, 'different:1'), b.credit(1, 'different:2')]);
  assert.equal(JSON.parse(contested.data.get(KEY)).balance, 7, 'Distinct rewards from both tabs are preserved');
  let observed;
  const unsubscribe = b.subscribe(value => { observed = value; });
  await a.credit(1, 'visible-in-other-tab');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(observed.balance, 8, 'Storage events refresh a subscribed view in another document');
  unsubscribe();

  const failureStore = sharedStorage({ [LEGACY]: '60' });
  const failure = environment(failureStore).ledger;
  await failure.ready();
  const before = failureStore.data.get(KEY);
  failureStore.failWrites = true;
  const failedPurchase = await failure.purchase('oak-desk');
  assert.equal(failedPurchase.ok, false);
  assert.equal(failedPurchase.reason, 'storage-unavailable');
  assert.equal(failedPurchase.snapshot.balance, 60);
  assert.equal(failedPurchase.snapshot.owned.length, 0);
  assert.equal(failureStore.data.get(KEY), before);
  assert.equal((await failure.credit(5, 'retry-reward')).ok, false);
  failureStore.failWrites = false;
  assert.equal((await failure.credit(5, 'retry-reward')).credited, 5, 'Failed writes do not consume event IDs');
  assert.equal((await failure.purchase('oak-desk')).snapshot.balance, 5, 'A failed purchase can be retried');
  assert.equal((await failure.purchase('oak-desk')).reason, 'already-owned');

  const queued = environment(sharedStorage({ [LEGACY]: '14' })).ledger;
  const reward = queued.credit(1, 'pending-pass');
  const purchase = queued.purchase('brass-candlestick');
  assert.equal((await reward).ok, true);
  assert.equal((await purchase).snapshot.balance, 0, 'Purchase waits for preceding rewards and initialization');
  const clone = queued.snapshot();
  clone.owned.length = 0;
  clone.balance = 10000;
  assert.equal(queued.snapshot().owned.length, 1, 'Caller cannot mutate wallet snapshots');

  for (const bad of ['bad-json', JSON.stringify({ schema: 1, balance: -1, owned: [], events: [], revision: 0 })]) {
    const corruptStore = sharedStorage({ [KEY]: bad, [LEGACY]: '9000' });
    const corrupt = environment(corruptStore).ledger;
    assert.equal((await corrupt.ready()).error, 'corrupt-record');
    assert.equal((await corrupt.purchase('wizard-cat')).ok, false);
    assert.equal((await corrupt.retry()).error, 'corrupt-record', 'Retry does not reset a corrupt authoritative record');
    assert.equal(corruptStore.data.get(KEY), bad, 'Corruption is preserved, never reset or replaced with free coins');
  }
  const badLegacy = sharedStorage({ [LEGACY]: '-1' });
  assert.equal((await environment(badLegacy).ledger.ready()).error, 'corrupt-legacy-wallet');
  assert.equal(badLegacy.data.has(KEY), false);
  const retryStore = sharedStorage({ [LEGACY]: '42' });
  retryStore.failWrites = true;
  const initialFailure = environment(retryStore).ledger;
  assert.equal((await initialFailure.ready()).error, 'storage-unavailable');
  assert.equal(retryStore.data.has(KEY), false);
  retryStore.failWrites = false;
  assert.equal((await initialFailure.retry()).balance, 42, 'Initial migration failures can retry after storage recovers');
  assert.equal((await initialFailure.ready()).ready, true, 'ready() reflects recovery');
  const committed = retryStore.data.get(KEY);
  retryStore.data.delete(KEY);
  retryStore.data.set(LEGACY, '9999');
  assert.equal((await initialFailure.retry()).error, 'missing-record', 'Recovery never remigrates old money after a committed record disappears');
  assert.equal(retryStore.data.has(KEY), false);
  retryStore.data.set(KEY, committed);
  assert.equal((await initialFailure.retry()).balance, 42, 'Restoring the authoritative record allows recovery');
  const unavailable = sharedStorage({ [LEGACY]: '42' });
  assert.equal((await environment(unavailable, { noLocks: true }).ledger.ready()).error, 'storage-lock-unavailable');
  assert.equal(unavailable.data.has(KEY), false, 'Without a safe transaction mechanism no write is attempted');
  const idbUnavailable = sharedStorage({ [LEGACY]: '9000' });
  const unavailableIDB = environment(idbUnavailable, { indexedDB: { open() { throw new Error('denied'); } } }).ledger;
  assert.equal((await unavailableIDB.ready()).error, 'storage-unavailable');
  assert.equal((await unavailableIDB.purchase('wizard-cat')).ok, false);
  assert.equal(idbUnavailable.data.has(KEY), false, 'An inaccessible IndexedDB wallet never falls back to legacy coins');
  console.log('PASS magic-shop-ledger: migration, reload, rewards, concurrent spending, quota/retry recovery, corrupt data');
}

async function displayTests() {
  const shared = sharedStorage({ [LEGACY]: '150' });
  const a = environment(shared).ledger;
  await a.ready();
  for (const id of ['brass-candlestick', 'rune-quill', 'glowing-potions', 'floating-tea-set']) {
    assert.equal((await a.purchase(id)).ok, true);
  }
  assert.equal(a.snapshot().balance, 45);
  assert.equal(a.snapshot().owned.length, 4);
  assert.deepEqual(JSON.parse(JSON.stringify(a.snapshot().displayPlaces)), {
    window: 'brass-candlestick', crate: 'floating-tea-set', shelf: 'glowing-potions',
  }, 'Small purchases fill empty places, then replace the old trunk display without removing ownership');
  assert.equal((await a.setDisplayPlace('window', 'floating-tea-set')).ok, true);
  assert.deepEqual(JSON.parse(JSON.stringify(a.snapshot().displayPlaces)), {
    window: 'floating-tea-set', shelf: 'glowing-potions',
  }, 'Moving an item clears its previous place and replaces the destination');
  const b = environment(shared).ledger;
  await b.ready();
  assert.deepEqual(JSON.parse(JSON.stringify(b.snapshot().displayPlaces)), {
    window: 'floating-tea-set', shelf: 'glowing-potions',
  }, 'Reload keeps the selected places');
  const together = await Promise.all([a.setDisplayPlace('shelf', 'brass-candlestick'), b.purchase('blue-star-atlas')]);
  assert.ok(together.every(result => result.ok));
  const reopened = environment(shared).ledger;
  await reopened.ready();
  assert.equal(reopened.snapshot().balance, 0, 'A display write cannot restore a stale coin balance');
  assert.equal(reopened.snapshot().owned.length, 5, 'A concurrent display write preserves the new purchase');
  assert.equal(reopened.snapshot().displayPlaces.shelf, 'brass-candlestick');
  assert.equal(reopened.snapshot().displayPlaces.crate, 'blue-star-atlas');
  const before = shared.data.get(KEY);
  shared.failWrites = true;
  const failure = await reopened.setDisplayPlace('crate', 'glowing-potions');
  assert.equal(failure.ok, false);
  assert.equal(failure.snapshot.displayPlaces.crate, 'blue-star-atlas', 'A failed display save keeps the old selection');
  assert.equal(shared.data.get(KEY), before);
  shared.failWrites = false;
  assert.equal((await reopened.setDisplayPlace('crate', 'glowing-potions')).ok, true);
  assert.equal((await reopened.setDisplayPlace('bed', 'glowing-potions')).reason, 'invalid-display-place');
  assert.equal((await reopened.setDisplayPlace('crate', 'star-chair')).reason, 'invalid-display-item');
  assert.equal((await reopened.setDisplayPlace('crate', 'crystal-ball')).reason, 'not-owned');
  assert.equal(reopened.snapshot().balance, 0);
  assert.equal(reopened.snapshot().owned.length, 5);
  const historical = JSON.parse(shared.data.get(KEY));
  delete historical.displayPlaces;
  shared.data.set(KEY, JSON.stringify(historical));
  const olderRecord = environment(shared).ledger;
  assert.deepEqual(JSON.parse(JSON.stringify((await olderRecord.ready()).displayPlaces)), {}, 'Schema 1 records without displayPlaces remain readable');
  assert.equal(olderRecord.snapshot().owned.length, 5);
  console.log('PASS magic-shop-ledger: display choices persist atomically with purchases, cross-document edits, failed writes, and old-record compatibility');
}

async function browserTests() {
  const chrome = [process.env.CHROME_BIN, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find(file => file && fs.existsSync(file));
  if (!chrome) {
    assert.ok(!process.argv.includes('--browser-required'), 'A Chromium browser is required for IndexedDB tests');
    console.log('SKIP real IndexedDB tests: no Chromium executable (set CHROME_BIN)');
    return;
  }
  const profile = await fsp.mkdtemp(path.join(os.tmpdir(), 'magic-shop-ledger-test-'));
  const server = http.createServer((req, res) => { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><title>Synthetic ledger test</title>'); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = 'http://127.0.0.1:' + server.address().port;
  const browser = spawn(chrome, ['--headless=new', '--no-sandbox', '--disable-background-networking', '--disable-extensions',
    '--no-first-run', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], { stdio: 'ignore' });
  let socket;
  try {
    let port;
    for (let attempt = 0; attempt < 150; attempt += 1) {
      try { port = (await fsp.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; break; }
      catch (_) { await delay(40); }
    }
    assert.ok(port, 'Fresh isolated browser starts');
    const targets = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
    socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
    let sequence = 0;
    const pending = new Map();
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data), action = pending.get(message.id);
      if (!action) return;
      pending.delete(message.id);
      if (message.error) action.reject(new Error(message.error.message)); else action.resolve(message.result);
    });
    const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); });
    const evaluate = async expression => {
      const response = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
      return response.result.value;
    };
    await send('Page.navigate', { url });
    for (let attempt = 0; attempt < 100; attempt += 1) { if (await evaluate('location.origin === ' + JSON.stringify(url))) break; await delay(20); }
    await evaluate(catalogSource + '\n' + ledgerSource);
    const result = await evaluate(`(async () => {
      const check = (condition, name) => { if (!condition) throw new Error(name); };
      localStorage.setItem(${JSON.stringify(LEGACY)}, '42');
      const originalSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function () { throw new DOMException('full', 'QuotaExceededError'); };
      const originalOpen = IDBFactory.prototype.open;
      IDBFactory.prototype.open = function () { throw new DOMException('temporarily denied', 'UnknownError'); };
      window.first = HanziMagicShopLedger.create({window});
      check((await first.ready()).error === 'storage-unavailable', 'Initial IndexedDB open failure is visible');
      check(!localStorage.getItem(${JSON.stringify(KEY)}), 'Initial IDB failure never creates a fallback wallet');
      IDBFactory.prototype.open = originalOpen;
      check((await first.retry()).ready, 'Retry reconnects after an initial IndexedDB open failure');
      check(first.snapshot().storage === 'indexeddb', 'IndexedDB is used when localStorage is full');
      check(first.snapshot().balance === 42, 'Exact old balance migrates despite localStorage quota');
      check((await first.purchase('brass-candlestick')).snapshot.balance === 27, 'First atomic purchase');
      Storage.prototype.setItem = originalSetItem;
      localStorage.setItem(${JSON.stringify(LEGACY)}, '9000');
      const frame = document.createElement('iframe'); frame.src = '/'; document.body.append(frame);
      await new Promise(resolve => frame.onload = resolve);
      frame.contentWindow.eval(${JSON.stringify(catalogSource + '\n' + ledgerSource)});
      window.second = frame.contentWindow.HanziMagicShopLedger.create({window:frame.contentWindow});
      await second.ready();
      check(second.snapshot().balance === 27, 'Second document does not reimport legacy balance');
      const purchases = await Promise.all([first.purchase('rune-quill'), second.purchase('rune-quill')]);
      check(purchases.filter(result => result.ok).length === 1, 'Independent documents race one purchase');
      const duplicateRewards = await Promise.all([first.credit(5, 'same:finale'), second.credit(5, 'same:finale')]);
      check(duplicateRewards.reduce((sum, result) => sum + result.credited, 0) === 5, 'Atomic event dedupe across documents');
      const before = first.snapshot();
      const transact = IDBDatabase.prototype.transaction;
      IDBDatabase.prototype.transaction = function () { throw new DOMException('full', 'QuotaExceededError'); };
      const failed = await first.purchase('star-chair');
      check(!failed.ok && failed.reason === 'storage-unavailable', 'IDB storage failure does not report purchase success');
      check(first.snapshot().balance === before.balance && first.snapshot().owned.length === before.owned.length, 'Failed IDB write leaves snapshot unchanged');
      IDBDatabase.prototype.transaction = transact;
      check((await first.credit(30, 'recovery:credit')).ok, 'A transient IDB failure can recover');
      const originalPut = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (...args) { const request = originalPut.apply(this, args); this.transaction.abort(); return request; };
      const aborted = await first.purchase('glowing-potions');
      check(!aborted.ok && aborted.snapshot.balance === 47 && aborted.snapshot.owned.length === 2, 'An aborted IDB transaction never publishes its uncommitted purchase');
      IDBObjectStore.prototype.put = originalPut;
      const purchaseAndDisplay = await Promise.all([first.purchase('star-chair'), second.setDisplayPlace('shelf', 'rune-quill')]);
      check(purchaseAndDisplay.every(result => result.ok), 'Different documents can buy and move a display without losing either transaction');
      await new Promise((resolve, reject) => {
        const upgrade = indexedDB.open('hanzi-magic-shop-v1', 2);
        upgrade.onupgradeneeded = () => upgrade.transaction.abort();
        upgrade.onerror = event => { event.preventDefault(); resolve(); };
        upgrade.onsuccess = () => { upgrade.result.close(); reject(new Error('Expected upgrade abort')); };
      });
      check(first.snapshot().error === 'storage-unavailable', 'Version changes signal a closed connection');
      check((await first.retry()).balance === 17 && first.snapshot().owned.length === 3, 'Retry reopens after versionchange without remigrating legacy');
      check(first.snapshot().displayPlaces.shelf === 'rune-quill' && !first.snapshot().displayPlaces.crate, 'The moved display survives versionchange reconnect');
      const saved = first.snapshot();
      first.dispose(); second.dispose(); frame.remove();
      return saved;
    })()`);
    assert.equal(result.balance, 17);
    assert.equal(result.owned.length, 3);
    await send('Page.reload');
    await delay(100);
    await evaluate(catalogSource + '\n' + ledgerSource);
    const reload = await evaluate('(async()=>{window.reopened=HanziMagicShopLedger.create({window});await reopened.ready();const result=reopened.snapshot();reopened.dispose();return result;})()');
    assert.equal(reload.balance, 17);
    assert.equal(reload.owned.length, 3);
    assert.equal(reload.displayPlaces.shelf, 'rune-quill');
    assert.equal(reload.displayPlaces.window, 'brass-candlestick');
    console.log('PASS magic-shop-ledger: real IndexedDB quota, independent documents, dedupe, abort, open/versionchange retry, page reload');
  } finally {
    socket?.close(); browser.kill('SIGTERM');
    await new Promise(resolve => { if (browser.exitCode !== null) resolve(); else { browser.once('exit', resolve); setTimeout(resolve, 2000).unref(); } });
    await new Promise(resolve => server.close(resolve));
    await fsp.rm(profile, { recursive: true, force: true });
  }
}

(async () => { await fallbackTests(); await displayTests(); await browserTests(); })().catch(error => { console.error(error); process.exitCode = 1; });
