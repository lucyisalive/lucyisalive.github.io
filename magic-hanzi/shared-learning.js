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

  function projectBankItem(item) {
    return {
      ...pick(item, BANK_FIELDS),
      history: (item.history || []).map(entry => pick(entry, ['day', 'outcome'])),
      passedDays: [...(item.passedDays || [])],
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

  return { mergeLearning, learningRecord, storyRecord, assemble };
});
