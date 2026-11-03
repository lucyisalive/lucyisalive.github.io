(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HanziPracticeSelector = factory();
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  // The caller owns review dates, parent priority, and delayed retests. This module
  // chooses only among the supplied items and never changes those items.
  const privateSessions = new WeakMap();
  const UNKNOWN_STRUCTURE = '未分类';
  const QUOTA = ['simple', 'simple', 'medium', 'medium', 'complex'];

  function counts() {
    return { simple: 0, medium: 0, complex: 0, unknown: 0 };
  }

  function difficulty(item) {
    const n = item.strokeCount;
    if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return 'unknown';
    return n <= 6 ? 'simple' : n <= 12 ? 'medium' : 'complex';
  }

  function structure(item) {
    return typeof item.structure === 'string' && item.structure.trim()
      ? item.structure.trim() : UNKNOWN_STRUCTURE;
  }

  function validItem(item) {
    return item && typeof item === 'object' &&
      typeof item.char === 'string' && item.char.trim().length > 0;
  }

  function randomIndex(random, length) {
    const value = Number(random());
    const unit = Number.isFinite(value) ? Math.max(0, Math.min(1 - Number.EPSILON, value)) : 0;
    return Math.floor(unit * length);
  }

  function shuffle(values, random) {
    const out = values.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = randomIndex(random, i + 1);
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  function freshBlock() {
    return { total: 0, byStructure: Object.create(null), byDifficulty: counts() };
  }

  // Statistics are public plain data. The injected random source and remaining
  // quota stay private, so the statistics can also be inspected/serialized.
  function createSession(random = Math.random) {
    if (typeof random !== 'function') throw new TypeError('random must be a function');
    const session = {
      total: 0,
      byChar: Object.create(null),
      byStructure: Object.create(null),
      byDifficulty: counts(),
      block: freshBlock(),
    };
    privateSessions.set(session, { random, remaining: shuffle(QUOTA, random) });
    return session;
  }

  function sessionData(session) {
    const data = privateSessions.get(session);
    if (!data) throw new TypeError('Use createSession() to create a selection session');
    if (session.block.total >= QUOTA.length) {
      session.block = freshBlock();
      data.remaining = shuffle(QUOTA, data.random);
    }
    return data;
  }

  function increment(map, key) {
    map[key] = (map[key] || 0) + 1;
  }

  // Call for a parent-priority item too: it has occupied a free-practice slot and
  // should affect the following balance. Teaching attempts/retests are not slots.
  function record(session, item) {
    if (!validItem(item)) return null;
    const data = sessionData(session);
    const level = difficulty(item), kind = structure(item);
    session.total += 1;
    session.block.total += 1;
    increment(session.byChar, item.char);
    increment(session.byStructure, kind);
    increment(session.byDifficulty, level);
    increment(session.block.byStructure, kind);
    increment(session.block.byDifficulty, level);
    const index = data.remaining.indexOf(level);
    if (index !== -1) data.remaining.splice(index, 1);
    return item;
  }

  function minimumBy(items, score) {
    let minimum = Infinity, out = [];
    for (const item of items) {
      const value = score(item);
      if (value < minimum) { minimum = value; out = [item]; }
      else if (value === minimum) out.push(item);
    }
    return out;
  }

  function choose(candidates, session) {
    // Group repeated occurrences of a character so a common word-list character
    // does not receive extra lottery tickets. Keep the original input identities.
    const groups = new Map();
    if (Array.isArray(candidates)) for (const item of candidates) {
      if (!validItem(item)) continue;
      if (!groups.has(item.char)) groups.set(item.char, { item, variants: [] });
      groups.get(item.char).variants.push(item);
    }
    if (!groups.size) return null;

    const data = sessionData(session);
    let pool = minimumBy([...groups.values()], group => session.byChar[group.item.char] || 0);
    const available = new Set(pool.map(group => difficulty(group.item)));
    const desired = data.remaining.find(level => available.has(level));
    if (desired) pool = pool.filter(group => difficulty(group.item) === desired);
    else {
      // A quota unavailable in this pool must not stall the game. Keep the
      // available levels as even as possible, including unclassified custom ink.
      pool = minimumBy(pool, group => session.block.byDifficulty[difficulty(group.item)] || 0);
    }

    // Prefer a known structure, then one absent/rarer in the current five slots.
    // Whole-session counts break ties without overriding fresh-character fairness.
    pool = minimumBy(pool, group => structure(group.item) === UNKNOWN_STRUCTURE ? 1 : 0);
    pool = minimumBy(pool, group => session.block.byStructure[structure(group.item)] || 0);
    pool = minimumBy(pool, group => session.byStructure[structure(group.item)] || 0);

    // Preserve scarce structure opportunities: if 独体 only occurs among simple
    // candidates, use that slot before the broadly available 左右 structure.
    const flexibility = new Map();
    for (const group of groups.values()) {
      const kind = structure(group.item);
      if (!flexibility.has(kind)) flexibility.set(kind, new Set());
      flexibility.get(kind).add(difficulty(group.item));
    }
    pool = minimumBy(pool, group => flexibility.get(structure(group.item)).size);
    const selected = pool[randomIndex(data.random, pool.length)];
    const item = selected.variants.length === 1 ? selected.item
      : selected.variants[randomIndex(data.random, selected.variants.length)];
    record(session, item);
    return item;
  }

  return { createSession, choose, record };
});
