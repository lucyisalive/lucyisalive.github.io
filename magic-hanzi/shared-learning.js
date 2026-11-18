(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HanziSharedLearning = factory();
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const SCHEDULE_FIELDS = ['lastSeen', 'box', 'interval'];
  const RETRY_FIELDS = ['wrongDay', 'wrongToday', 'stuck', 'stuckDay'];
  const PARENT_FIELDS = ['fromParent', 'pinyin', 'word', 'sentence', 'retired'];
  const BANK_FIELDS = ['char', ...SCHEDULE_FIELDS, ...RETRY_FIELDS, ...PARENT_FIELDS,
    'structure', 'strokeCount', 'curriculumId', 'unit', 'lesson'];
  const REQUEST_FIELDS = ['char', 'pinyin', 'word', 'sentence', 'requestId', 'addedDay', 'completedDay'];
  const SESSION_FIELDS = ['version', 'day', 'roundId', 'passedCount', 'completed', 'sceneAwarded'];

  function pick(record, fields) {
    return Object.fromEntries(fields.filter(field => Object.hasOwn(record, field))
      .map(field => [field, record[field]]));
  }

  function masteryMark(value) {
    if (!value || typeof value.day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.day) ||
        !Number.isSafeInteger(value.at) || value.at < 0) return null;
    const date = new Date(value.day + 'T00:00:00.000Z');
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value.day) return null;
    return { day: value.day, at: value.at };
  }

  function mergeMastery(oldItem, newItem) {
    const result = {};
    const oldReset = masteryMark(oldItem?.masteryReset);
    const newReset = masteryMark(newItem?.masteryReset);
    const reset = !oldReset || (newReset &&
      (newReset.day > oldReset.day || (newReset.day === oldReset.day && newReset.at > oldReset.at)))
      ? newReset : oldReset;
    if (reset) result.masteryReset = reset;

    const oldPasses = oldItem?.masteryPassTimes;
    const newPasses = newItem?.masteryPassTimes;
    if (Array.isArray(oldPasses) || Array.isArray(newPasses)) {
      const byDay = new Map();
      for (const value of [...(Array.isArray(oldPasses) ? oldPasses : []), ...(Array.isArray(newPasses) ? newPasses : [])]) {
        const mark = masteryMark(value);
        if (mark && (!byDay.has(mark.day) || mark.at > byDay.get(mark.day).at)) byDay.set(mark.day, mark);
      }
      result.masteryPassTimes = [...byDay.values()].sort((left, right) => left.day.localeCompare(right.day));
    }
    return result;
  }

  function projectBankItem(item) {
    return {
      ...pick(item, BANK_FIELDS),
      history: (item.history || []).map(entry => pick(entry, ['day', 'outcome'])),
      passedDays: [...(item.passedDays || [])],
      ...mergeMastery(item),
    };
  }

  function projectRequest(request) {
    const projected = pick(request, REQUEST_FIELDS);
    if (Array.isArray(request.alts)) projected.alts = [...request.alts];
    return projected;
  }

  function learningRecord(state, legacy) {
    const record = {
      bank: state.bank.map(projectBankItem),
      bankVersion: state.bankVersion,
      priorityQueue: (state.priorityQueue || []).map(projectRequest),
      dailyCount: state.dailyCount,
      scenesUnlocked: legacy?.scenesUnlocked ?? 0,
    };
    if (legacy?.sessionProgress) record.sessionProgress = pick(legacy.sessionProgress, SESSION_FIELDS);
    return record;
  }

  function storyRecord(state) {
    const record = { herbalistStage: state.herbalistStage, scenesUnlocked: state.scenesUnlocked ?? 0 };
    if (state.sessionProgress) record.sessionProgress = pick(state.sessionProgress, SESSION_FIELDS);
    return record;
  }

  function assemble(learning, story) {
    return { ...learningRecord(learning), ...storyRecord(story || {}) };
  }

  function mergeHistory(oldHistory, newHistory) {
    // Identical day/outcome pairs have no event ID. Keep the greater count of
    // each pair to carry evidence without replaying entries present in both saves.
    const remaining = new Map();
    const keyFor = ({ day, outcome }) => JSON.stringify({ day, outcome });
    for (const entry of oldHistory) {
      const key = keyFor(entry);
      remaining.set(key, (remaining.get(key) || 0) + 1);
    }
    const additional = newHistory.filter(entry => {
      const key = keyFor(entry);
      const count = remaining.get(key) || 0;
      if (!count) return true;
      remaining.set(key, count - 1);
      return false;
    });
    return [...oldHistory, ...additional].sort((a, b) => a.day.localeCompare(b.day));
  }

  function retryDate(item) {
    const wrongDay = item.wrongDay || '';
    const stuckDay = item.stuckDay || '';
    return stuckDay > wrongDay ? stuckDay : wrongDay;
  }

  function mergeBankItem(oldItem, newItem, oldRequest, newRequest) {
    const schedule = (newItem.lastSeen || '') > (oldItem.lastSeen || '') ? newItem : oldItem;
    const retries = retryDate(newItem) > retryDate(oldItem) ? newItem : oldItem;
    const newerRequest = (newRequest?.addedDay || '') > (oldRequest?.addedDay || '');
    const parent = newItem.fromParent && (!oldItem.fromParent || newerRequest) ? newItem : oldItem;
    return {
      ...pick({ ...newItem, ...oldItem }, ['char', 'structure', 'strokeCount', 'curriculumId', 'unit', 'lesson']),
      ...pick(schedule, SCHEDULE_FIELDS),
      ...pick(retries, RETRY_FIELDS),
      ...pick(parent, PARENT_FIELDS),
      history: mergeHistory(oldItem.history || [], newItem.history || []),
      passedDays: [...new Set([...(oldItem.passedDays || []), ...(newItem.passedDays || [])])].sort(),
      ...mergeMastery(oldItem, newItem),
    };
  }

  function mergeRequests(oldQueue, newQueue) {
    const byChar = new Map();
    // Stable sorting gives the old queue priority on the same date, retaining
    // each source's order within its batch.
    const ordered = [...oldQueue, ...newQueue].sort((a, b) => (b.addedDay || '').localeCompare(a.addedDay || ''));
    for (const request of ordered) {
      const selected = byChar.get(request.char);
      if (!selected) byChar.set(request.char, request);
      else if (request.requestId && request.requestId === selected.requestId &&
          (request.completedDay || '') > (selected.completedDay || '')) {
        byChar.set(request.char, { ...selected, completedDay: request.completedDay });
      }
    }
    return [...byChar.values()];
  }

  function mergeLearning(oldState, independentNewState) {
    const oldQueue = oldState.priorityQueue || [];
    const newQueue = independentNewState.priorityQueue || [];
    const oldRequests = new Map(oldQueue.map(request => [request.char, request]));
    const newRequests = new Map(newQueue.map(request => [request.char, request]));
    const remaining = new Map(independentNewState.bank.map(item => [item.char, item]));
    const bank = oldState.bank.map(item => {
      const other = remaining.get(item.char);
      if (!other) return item;
      remaining.delete(item.char);
      return mergeBankItem(item, other, oldRequests.get(item.char), newRequests.get(item.char));
    });
    bank.push(...remaining.values());
    return learningRecord({ ...oldState, bank, priorityQueue: mergeRequests(oldQueue, newQueue) }, oldState);
  }

  function validRevision(value) {
    return typeof value === 'string' ? value.length > 0 && value.length <= 128
      : Number.isSafeInteger(value) && value > 0;
  }

  function checkedProgress(value) {
    if (!value || value.version !== 1 || !validRevision(value.revision)) {
      throw new Error('浏览器存档的版本或修订号无效。');
    }
    const {version, revision, learning, story, primaryLearning, primaryStory, restoreBackup} = value;
    if (typeof learning !== 'string' || typeof story !== 'string' ||
        (primaryLearning !== null && typeof primaryLearning !== 'string') ||
        (primaryStory !== null && typeof primaryStory !== 'string') ||
        (restoreBackup !== undefined && typeof restoreBackup !== 'string')) {
      throw new Error('浏览器存档的内容无效。');
    }
    const progress = {version, revision, learning, story, primaryLearning, primaryStory};
    if (restoreBackup !== undefined) progress.restoreBackup = restoreBackup;
    return progress;
  }

  function createProgressStore(indexedDB, later = globalThis.setTimeout, cancelTimer = globalThis.clearTimeout) {
    const databaseName = 'hanzi-magic-herbalist-shared-progress-v1';
    const storeName = 'progress';
    const recordKey = 'active';

    function transact(mode, operation) {
      return new Promise((resolve, reject) => {
        if (!indexedDB || typeof indexedDB.open !== 'function') {
          reject(new Error('浏览器数据库暂不可用。'));
          return;
        }
        let db, transaction, value, timer, settled = false;
        function finish(error) {
          if (settled) return;
          settled = true;
          cancelTimer(timer);
          if (db) db.close();
          if (error) reject(error);
          else resolve(value);
        }
        function fail(error) {
          if (transaction) {
            try { transaction.abort(); } catch (_) { /* The transaction may already be closed. */ }
          }
          finish(error);
        }
        timer = later(() => fail(new Error('浏览器数据库操作超时。')), 6000);
        let open;
        try { open = indexedDB.open(databaseName, 1); }
        catch (error) { finish(error); return; }
        open.onerror = () => finish(open.error || new Error('无法打开浏览器数据库。'));
        open.onblocked = () => finish(new Error('浏览器数据库正在被另一页占用。'));
        open.onupgradeneeded = () => {
          try {
            if (settled) open.transaction.abort();
            else open.result.createObjectStore(storeName);
          } catch (error) {
            try { open.transaction.abort(); } catch (_) { /* Preserve the creation error. */ }
            finish(error);
          }
        };
        open.onsuccess = () => {
          db = open.result;
          if (settled) { db.close(); return; }
          db.onversionchange = () => db.close();
          try {
            transaction = db.transaction(storeName, mode);
            transaction.onabort = () => finish(transaction.error || new Error('浏览器数据库保存中断。'));
            transaction.oncomplete = () => finish();
            operation(transaction.objectStore(storeName), result => { value = result; }, fail);
          } catch (error) { fail(error); }
        };
      });
    }

    function read() {
      return transact('readonly', (store, result, fail) => {
        const request = store.get(recordKey);
        request.onsuccess = () => {
          try {
            result(request.result === undefined ? null : checkedProgress(request.result));
          } catch (error) { fail(error); }
        };
      });
    }

    async function save(expectedRevision, record) {
      const next = checkedProgress(record);
      if ((expectedRevision !== null && !validRevision(expectedRevision)) || expectedRevision === next.revision ||
          (typeof next.revision === 'number' && next.revision !== (expectedRevision ?? 0) + 1)) {
        throw new Error('浏览器存档的下一修订号无效。');
      }
      return transact('readwrite', (store, result, fail) => {
        const request = store.get(recordKey);
        request.onsuccess = () => {
          try {
            const previous = request.result === undefined ? null : checkedProgress(request.result);
            if ((previous?.revision ?? null) !== expectedRevision) { result(false); return; }
            if (next.restoreBackup === undefined && previous?.restoreBackup !== undefined) {
              next.restoreBackup = previous.restoreBackup;
            }
            store.put(next, recordKey);
            result(true);
          } catch (error) { fail(error); }
        };
      });
    }
    return { read, save };
  }

  return { mergeLearning, mergeMastery, learningRecord, storyRecord, assemble, createProgressStore };
});
