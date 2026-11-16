(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HanziGlyphLoader = factory();
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  const CACHE_PREFIX = 'hanzi-glyph-v1:';
  const owns = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

  // Keep the complete original object; validation must not reshape the geometry
  // or discard labels used by the existing grader.
  function validGlyph(data) {
    return data && typeof data === 'object' && !Array.isArray(data) &&
      Array.isArray(data.strokes) && data.strokes.length > 0 &&
      data.strokes.every(stroke => typeof stroke === 'string' && stroke.trim().length > 0) &&
      Array.isArray(data.medians) && data.medians.length === data.strokes.length &&
      data.medians.every(stroke => Array.isArray(stroke) && stroke.length >= 2 &&
        stroke.every(point => Array.isArray(point) && point.length >= 2 &&
          typeof point[0] === 'number' && Number.isFinite(point[0]) &&
          typeof point[1] === 'number' && Number.isFinite(point[1])));
  }

  function create(options) {
    const settings = options || {};
    const catalog = settings.catalog;
    if (!catalog || typeof catalog.version !== 'string' || !catalog.version ||
        !catalog.glyphs || typeof catalog.glyphs !== 'object') {
      throw new TypeError('A versioned glyph catalog is required');
    }
    const localData = settings.localData || {};
    const storage = settings.storage;
    const fetchGlyph = settings.fetch;
    const timeoutMs = settings.timeoutMs === undefined ? 6000 : settings.timeoutMs;
    if (typeof timeoutMs !== 'number' || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      throw new TypeError('timeoutMs must be a positive number');
    }
    const resources = new Map();
    const requests = new Map();

    function cacheKey(char) {
      return CACHE_PREFIX + catalog.version + ':' + char;
    }

    function readCache(char) {
      if (!storage) return null;
      const key = cacheKey(char);
      try {
        const raw = storage.getItem(key);
        if (!raw) return null;
        const cached = JSON.parse(raw);
        if (cached && cached.version === catalog.version && cached.char === char &&
            validGlyph(cached.data)) return cached.data;
      } catch (_) { /* Storage may be blocked, full, or contain damaged JSON. */ }
      try { storage.removeItem(key); } catch (_) { /* Only our own cache key. */ }
      return null;
    }

    function writeCache(char, data) {
      if (!storage) return;
      try {
        storage.setItem(cacheKey(char), JSON.stringify({ version: catalog.version, char, data }));
      } catch (_) { /* A storage quota must not prevent a completed download. */ }
    }

    function dependencyGroup(char) {
      const group = [], visiting = new Set(), visited = new Set();
      function visit(part) {
        if (visiting.has(part)) throw new Error('Cyclic glyph dependency: ' + part);
        if (visited.has(part)) return;
        if (!owns(catalog.glyphs, part)) throw new Error('Missing glyph dependency: ' + part);
        const entry = catalog.glyphs[part];
        const prefix = 'glyphs/' + encodeURIComponent(part) + '.json?';
        if (!entry || typeof entry.url !== 'string' || entry.url.indexOf(prefix) !== 0 ||
            entry.url.length === prefix.length || /[#\r\n]/.test(entry.url) ||
            !Array.isArray(entry.deps) || entry.deps.some(dep => typeof dep !== 'string' || !dep)) {
          throw new Error('Invalid glyph catalog entry: ' + part);
        }
        visiting.add(part);
        entry.deps.forEach(visit);
        visiting.delete(part);
        visited.add(part);
        group.push(part);
      }
      visit(char);
      return group;
    }

    function download(char) {
      return new Promise((resolve, reject) => {
        let settled = false;
        const controller = typeof AbortController === 'function' ? new AbortController() : null;
        function finish(error, data) {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (error) reject(error);
          else resolve(data);
        }
        const timer = setTimeout(() => {
          // Reject first: an abort callback cannot replace the timeout reason.
          finish(new Error('Glyph download timed out: ' + char));
          if (controller) controller.abort();
        }, timeoutMs);
        Promise.resolve().then(() => {
          if (typeof fetchGlyph !== 'function') throw new Error('Glyph download unavailable');
          const init = { credentials: 'same-origin' };
          if (controller) init.signal = controller.signal;
          return fetchGlyph(catalog.glyphs[char].url, init);
        }).then(response => {
          if (!response || !response.ok || typeof response.json !== 'function') {
            throw new Error('Glyph download failed: ' + char);
          }
          return response.json();
        }).then(data => {
          if (!validGlyph(data)) throw new Error('Invalid glyph data: ' + char);
          finish(null, data);
        }).catch(error => finish(error));
      });
    }

    function resource(char) {
      if (validGlyph(localData[char])) return Promise.resolve(localData[char]);
      if (resources.has(char)) return resources.get(char);
      const cached = readCache(char);
      const pending = cached ? Promise.resolve(cached) : download(char);
      resources.set(char, pending);
      // Both success and failure leave room for a subsequent complete request.
      pending.then(() => resources.delete(char), () => resources.delete(char));
      return pending;
    }

    function load(char) {
      if (typeof char !== 'string' || !owns(catalog.glyphs, char)) return Promise.resolve(null);
      if (requests.has(char)) return requests.get(char);
      let group;
      try { group = dependencyGroup(char); } catch (error) { return Promise.reject(error); }
      const pending = Promise.all(group.map(resource)).then(data => {
        // The grader reads component data synchronously. Publish the target and
        // all original dependencies together, never a partial scoring context.
        group.forEach((part, index) => { localData[part] = data[index]; });
        group.forEach((part, index) => writeCache(part, data[index]));
        return localData[char];
      });
      requests.set(char, pending);
      pending.then(() => requests.delete(char), () => requests.delete(char));
      return pending;
    }

    return { load };
  }

  return { create };
});
