(function (root) {
  'use strict';

  const DB_NAME = 'hanzi-magic-shop-v1';
  const STORE = 'wallets';
  const KEY = 'hanzi-magic-shop-ledger-v1';
  const LEGACY_KEY = 'hanzi-herbalist-wallet-v1';
  const LOCK = 'hanzi-magic-shop-ledger-write-v1';
  const CHANNEL = 'hanzi-magic-shop-ledger-v1';
  const DISPLAY_PLACES = ['window', 'crate', 'shelf'];
  const clone = value => JSON.parse(JSON.stringify(value));

  function fail(reason) {
    const error = new Error(reason);
    error.reason = reason;
    return error;
  }

  function validate(record) {
    const integer = value => Number.isSafeInteger(value) && value >= 0;
    if (!record || record.schema !== 1 || !integer(record.balance) || !integer(record.revision)
      || !Array.isArray(record.owned) || !Array.isArray(record.events)) throw fail('corrupt-record');
    const ids = new Set();
    record.owned.forEach(entry => {
      if (!entry || typeof entry.itemId !== 'string' || !entry.itemId || ids.has(entry.itemId)
        || !integer(entry.price) || !Number.isFinite(entry.purchasedAt) || entry.purchasedAt <= 0
        || typeof entry.purchaseId !== 'string' || !entry.purchaseId) throw fail('corrupt-record');
      ids.add(entry.itemId);
    });
    const events = new Set();
    record.events.forEach(id => {
      if (typeof id !== 'string' || !id || events.has(id)) throw fail('corrupt-record');
      events.add(id);
    });
    const displayPlaces = record.displayPlaces === undefined ? {} : record.displayPlaces;
    if (!displayPlaces || typeof displayPlaces !== 'object' || Array.isArray(displayPlaces)) throw fail('corrupt-record');
    const displayed = new Set();
    Object.entries(displayPlaces).forEach(([place, id]) => {
      if (!DISPLAY_PLACES.includes(place) || typeof id !== 'string' || !ids.has(id) || displayed.has(id)) throw fail('corrupt-record');
      displayed.add(id);
    });
    return { ...clone(record), displayPlaces: clone(displayPlaces) };
  }

  function create(options) {
    const win = options?.window || root;
    const catalog = win.HanziMagicShopCatalog || root.HanziMagicShopCatalog;
    const listeners = new Set();
    let db, channel, backend, record, error, initialized = false, disposed = false;
    let authoritativeRecordSeen = false;
    let queue = Promise.resolve();
    let refreshQueued = false;

    function legacyBalance() {
      const raw = win.localStorage?.getItem(LEGACY_KEY);
      if (raw == null) return 0;
      if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw))) throw fail('corrupt-legacy-wallet');
      return Number(raw);
    }

    // This read-only preview lets the HUD show saved coins while IndexedDB opens.
    let previewBalance = 0;
    try { previewBalance = legacyBalance(); } catch (_) { /* ready() reports storage failures. */ }

    function snapshot() {
      return {
        balance: record ? record.balance : previewBalance,
        owned: record ? clone(record.owned) : [],
        displayPlaces: record ? clone(record.displayPlaces || {}) : {},
        revision: record ? record.revision : 0,
        storage: backend || null, ready: initialized && !error,
        error: error || null,
      };
    }

    function notify() {
      const current = snapshot();
      listeners.forEach(fn => { try { fn(current); } catch (_) { /* A view must not cancel a committed transaction. */ } });
    }

    function storageError(cause) {
      return cause?.reason || 'storage-unavailable';
    }

    function importRecord() {
      const storage = win.localStorage;
      if (!storage) throw fail('storage-unavailable');
      const saved = storage.getItem(KEY);
      if (saved != null) {
        try { return validate(JSON.parse(saved)); }
        catch (cause) { throw cause.reason ? cause : fail('corrupt-record'); }
      }
      const balance = legacyBalance();
      const now = Date.now();
      return { schema: 1, balance, owned: [], events: [], displayPlaces: {}, revision: 0,
        migratedLegacyBalance: balance, createdAt: now, updatedAt: now };
    }

    function openDatabase() {
      return new Promise((resolve, reject) => {
        let request, ended = false;
        // Opening the current database version also permits reconnecting after
        // another tab upgrades it; record schema validation still protects data.
        try { request = win.indexedDB.open(DB_NAME); }
        catch (cause) { reject(cause); return; }
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
        };
        request.onsuccess = () => {
          if (ended || disposed) { request.result.close(); reject(fail('storage-unavailable')); return; }
          ended = true;
          const connection = request.result;
          connection.onversionchange = () => {
            connection.close();
            if (db === connection) db = null;
            error = 'storage-unavailable';
            notify();
          };
          resolve(connection);
        };
        request.onerror = () => { ended = true; reject(request.error || fail('storage-unavailable')); };
        request.onblocked = () => { ended = true; reject(fail('storage-unavailable')); };
      });
    }

    // All decisions and writes happen in the same read/write transaction. A
    // second tab cannot observe the old balance while the first purchase writes.
    function idbTransaction(change, initializing) {
      return new Promise((resolve, reject) => {
        let tx, result, next, cause;
        try { tx = db.transaction(STORE, 'readwrite'); }
        catch (failure) { reject(failure); return; }
        tx.oncomplete = () => resolve({ record: next, result });
        tx.onerror = () => { cause = cause || tx.error; };
        tx.onabort = () => reject(cause || tx.error || fail('storage-unavailable'));
        const store = tx.objectStore(STORE);
        const request = store.get('main');
        request.onsuccess = () => {
          try {
            const missing = request.result === undefined;
            if (!missing) authoritativeRecordSeen = true;
            if (missing && !initializing) throw fail('missing-record');
            next = missing ? importRecord() : validate(request.result);
            const outcome = change ? change(next) : { changed: false, result: { ok: true } };
            result = outcome.result;
            if (missing || outcome.changed) store.put(next, 'main');
          } catch (failure) { cause = failure; tx.abort(); }
        };
      });
    }

    async function localTransaction(change, initializing) {
      const locks = win.navigator?.locks;
      if (!locks || typeof locks.request !== 'function') throw fail('storage-lock-unavailable');
      return locks.request(LOCK, async () => {
        const storage = win.localStorage;
        if (!storage) throw fail('storage-unavailable');
        const raw = storage.getItem(KEY);
        let next;
        if (raw == null) {
          if (!initializing) throw fail('missing-record');
          next = importRecord();
        } else {
          authoritativeRecordSeen = true;
          try { next = validate(JSON.parse(raw)); }
          catch (cause) { throw cause.reason ? cause : fail('corrupt-record'); }
        }
        const outcome = change ? change(next) : { changed: false, result: { ok: true } };
        // SetItem is atomic; do not publish in-memory success before it returns.
        if (raw == null || outcome.changed) storage.setItem(KEY, JSON.stringify(next));
        return { record: next, result: outcome.result };
      });
    }

    function transaction(change, initializing) {
      return backend === 'indexeddb' ? idbTransaction(change, initializing) : localTransaction(change, initializing);
    }

    function accept(value, broadcast) {
      record = value.record;
      authoritativeRecordSeen = true;
      // A transaction already in flight may finish after versionchange closes
      // this connection. Keep the reconnect notice even though its write saved.
      error = backend === 'indexeddb' && !db ? 'storage-unavailable' : null;
      notify();
      if (broadcast) { try { channel?.postMessage({ revision: record.revision }); } catch (_) { /* Storage remains authoritative. */ } }
      return { ...value.result, snapshot: snapshot() };
    }

    function refresh() {
      if (disposed || refreshQueued) return;
      refreshQueued = true;
      const task = queue.then(async () => {
        refreshQueued = false;
        await readyPromise;
        if (!initialized || !backend || disposed) return;
        try { accept(await transaction(null, false), false); }
        catch (cause) { error = storageError(cause); notify(); }
      });
      queue = task.catch(() => {});
    }

    const onStorage = event => { if (event.key === KEY) refresh(); };
    const onFocus = () => refresh();
    const onVisibility = () => { if (!win.document || win.document.visibilityState === 'visible') refresh(); };
    win.addEventListener?.('storage', onStorage);
    win.addEventListener?.('focus', onFocus);
    win.document?.addEventListener?.('visibilitychange', onVisibility);
    try {
      if (typeof win.BroadcastChannel === 'function') {
        channel = new win.BroadcastChannel(CHANNEL);
        channel.onmessage = () => refresh();
      }
    } catch (_) { /* Focus and storage events still refresh views. */ }

    const readyPromise = (async () => {
      try {
        if (win.indexedDB && typeof win.indexedDB.open === 'function') {
          backend = 'indexeddb';
          db = await openDatabase();
        } else backend = 'localstorage';
        const value = await transaction(null, true);
        initialized = true;
        accept(value, false);
      } catch (cause) { initialized = true; error = storageError(cause); notify(); }
      return snapshot();
    })();

    function enqueue(change) {
      const task = queue.then(async () => {
        await readyPromise;
        if (disposed) return { ok: false, reason: 'storage-unavailable', snapshot: snapshot() };
        // A valid connection can recover from a transient failed write. A failed
        // migration/open is never replaced with a fresh wallet or legacy money.
        if (!record) return { ok: false, reason: error || 'storage-unavailable', snapshot: snapshot() };
        try {
          const value = await transaction(change, false);
          return accept(value, !!value.result.ok);
        } catch (cause) {
          error = storageError(cause);
          notify();
          return { ok: false, reason: error, snapshot: snapshot() };
        }
      });
      queue = task.catch(() => {});
      return task;
    }

    function retry() {
      const task = queue.then(async () => {
        await readyPromise;
        if (disposed) return snapshot();
        try {
          // Stay on the selected authority. An unavailable IndexedDB wallet is
          // never replaced with the old localStorage balance on recovery.
          if (backend === 'indexeddb') {
            db?.close();
            db = null;
            db = await openDatabase();
          }
          const value = await transaction(null, !authoritativeRecordSeen);
          initialized = true;
          accept(value, false);
        } catch (cause) { error = storageError(cause); notify(); }
        return snapshot();
      });
      queue = task.catch(() => {});
      return task;
    }

    function touch(next) {
      if (!Number.isSafeInteger(next.revision + 1)) throw fail('balance-overflow');
      next.revision += 1;
      next.updatedAt = Date.now();
    }

    function credit(amount, eventId) {
      if (!Number.isSafeInteger(amount) || amount <= 0
        || (eventId !== undefined && (typeof eventId !== 'string' || !eventId))) {
        return Promise.resolve({ ok: false, reason: 'invalid-credit', snapshot: snapshot() });
      }
      return enqueue(next => {
        if (eventId !== undefined && next.events.includes(eventId)) {
          return { changed: false, result: { ok: true, reason: 'duplicate-event', credited: 0 } };
        }
        if (!Number.isSafeInteger(next.balance + amount)) throw fail('balance-overflow');
        next.balance += amount;
        if (eventId !== undefined) next.events.push(eventId);
        touch(next);
        return { changed: true, result: { ok: true, credited: amount } };
      });
    }

    function purchase(itemId) {
      const item = catalog?.get ? catalog.get(itemId) : catalog?.byId?.[itemId];
      if (!item || !Number.isSafeInteger(item.price) || item.price <= 0) {
        return Promise.resolve({ ok: false, reason: 'invalid-item', snapshot: snapshot() });
      }
      return enqueue(next => {
        const previous = next.owned.find(entry => entry.itemId === item.id);
        if (previous) return { changed: false, result: { ok: false, reason: 'already-owned', item, purchase: clone(previous) } };
        if (next.balance < item.price) return { changed: false, result: { ok: false, reason: 'insufficient-balance', item } };
        const purchase = { itemId: item.id, price: item.price, purchasedAt: Date.now(),
          purchaseId: typeof win.crypto?.randomUUID === 'function' ? win.crypto.randomUUID() : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2) };
        next.balance -= item.price;
        next.owned.push(purchase);
        if (smallItem(item)) {
          const place = DISPLAY_PLACES.find(id => !next.displayPlaces[id]) || 'crate';
          next.displayPlaces[place] = item.id;
        }
        touch(next);
        return { changed: true, result: { ok: true, item, purchase: clone(purchase) } };
      });
    }

    function smallItem(item) {
      return item && Number.isInteger(item.artIndex) && item.artIndex >= 12 && item.artIndex <= 21;
    }

    function setDisplayPlace(placeId, itemId) {
      if (!DISPLAY_PLACES.includes(placeId)) {
        return Promise.resolve({ ok: false, reason: 'invalid-display-place', snapshot: snapshot() });
      }
      const item = catalog?.get ? catalog.get(itemId) : catalog?.byId?.[itemId];
      if (!smallItem(item)) {
        return Promise.resolve({ ok: false, reason: 'invalid-display-item', snapshot: snapshot() });
      }
      return enqueue(next => {
        if (!next.owned.some(entry => entry.itemId === item.id)) {
          return { changed: false, result: { ok: false, reason: 'not-owned' } };
        }
        if (next.displayPlaces[placeId] === item.id) return { changed: false, result: { ok: true } };
        Object.keys(next.displayPlaces).forEach(place => {
          if (next.displayPlaces[place] === item.id) delete next.displayPlaces[place];
        });
        next.displayPlaces[placeId] = item.id;
        touch(next);
        return { changed: true, result: { ok: true } };
      });
    }

    return Object.freeze({
      ready: () => readyPromise.then(() => snapshot()), retry, snapshot, credit, purchase, setDisplayPlace,
      subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
      dispose() {
        disposed = true;
        channel?.close();
        db?.close();
        listeners.clear();
        win.removeEventListener?.('storage', onStorage);
        win.removeEventListener?.('focus', onFocus);
        win.document?.removeEventListener?.('visibilitychange', onVisibility);
      },
    });
  }

  root.HanziMagicShopLedger = Object.freeze({ create });
})(typeof window !== 'undefined' ? window : globalThis);
