/**
 * Cloudflare D1 storage for sentence-service.mjs, with no credentials or API calls.
 *
 * Deploy the schema with a schema-only Sites migration BEFORE serving requests:
 *   SENTENCE_STORAGE_SCHEMA.join(';\n') + ';\n'
 * initializeD1SentenceStorage is an explicit local/admin setup helper, not a
 * request handler. Do not call it from fetch(). Missing/broken tables fail closed.
 *
 * Runtime wiring (the raw D1 binding is normally env.DB):
 *   const storage = createD1SentenceStorage(env.DB);
 *   return service.fetch(request, {
 *     ...env,
 *     HANZI_SENTENCE_CACHE: storage.cache,
 *     HANZI_SENTENCE_LIMITER: storage.limiter
 *   });
 *
 * Consumption uses ONE conditional UPSERT, never a read-then-write sequence.
 * Each key already contains its UTC bucket and hashed family identity, supplied
 * by the service. Denials and database errors never permit a provider request.
 * Attempts are not refunded, including ambiguous network/database failures.
 * This limits attempted sentence generations, not exact dollars or tokens.
 * Keep provider-side project budgets as an additional spending control.
 */

export const SENTENCE_STORAGE_SCHEMA = Object.freeze([
  `CREATE TABLE IF NOT EXISTS hanzi_sentence_cache (
    cache_key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL CHECK (length(value) <= 512),
    expires_at INTEGER NOT NULL CHECK (expires_at >= 0)
  )`,
  'CREATE INDEX IF NOT EXISTS hanzi_sentence_cache_expiry ON hanzi_sentence_cache (expires_at)',
  `CREATE TABLE IF NOT EXISTS hanzi_sentence_limits (
    limit_key TEXT PRIMARY KEY NOT NULL,
    units INTEGER NOT NULL CHECK (units >= 0),
    expires_at INTEGER NOT NULL CHECK (expires_at >= 0)
  )`,
  'CREATE INDEX IF NOT EXISTS hanzi_sentence_limits_expiry ON hanzi_sentence_limits (expires_at)'
]);

const CACHE_GET = 'SELECT value FROM hanzi_sentence_cache WHERE cache_key = ? AND expires_at > ?';
const CACHE_PUT = `INSERT INTO hanzi_sentence_cache (cache_key, value, expires_at) VALUES (?, ?, ?)
  ON CONFLICT (cache_key) DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at`;
const CONSUME = `INSERT INTO hanzi_sentence_limits (limit_key, units, expires_at)
  SELECT ?, ?, ? WHERE ? <= ?
  ON CONFLICT (limit_key) DO UPDATE SET units = hanzi_sentence_limits.units + excluded.units
  WHERE hanzi_sentence_limits.expires_at = excluded.expires_at
    AND hanzi_sentence_limits.units <= ? - excluded.units`;
const PRUNE_CACHE = `DELETE FROM hanzi_sentence_cache WHERE cache_key IN (
  SELECT cache_key FROM hanzi_sentence_cache WHERE expires_at <= ? ORDER BY expires_at LIMIT ?
)`;
const PRUNE_LIMITS = `DELETE FROM hanzi_sentence_limits WHERE limit_key IN (
  SELECT limit_key FROM hanzi_sentence_limits WHERE expires_at <= ? ORDER BY expires_at LIMIT ?
)`;
const CACHE_KEY = /^hanzi-sentences-v\d+:[a-f0-9]{64}$/;
const LIMIT_KEY = /^hanzi-sentences-v\d+:(requests|generation):[a-f0-9]{64}:(0|[1-9]\d{0,12})$/;
const MAX_TTL = 30 * 86400;

function unavailable() { return new Error('sentence_storage_unavailable'); }
function validDatabase(db) { return db && typeof db.prepare === 'function'; }
function validClock(now) {
  const value = now();
  if (!Number.isSafeInteger(value) || value < 0) throw unavailable();
  return value;
}
function assertSuccess(result, changesRequired = false) {
  if (!result || result.success !== true) throw unavailable();
  if (changesRequired && (!Number.isSafeInteger(result.meta?.changes) || result.meta.changes < 0)) throw unavailable();
  return result;
}
function cacheValue(value) {
  if (typeof value !== 'string' || value.length > 512) return false;
  try {
    const row = JSON.parse(value);
    return row !== null && typeof row === 'object' && !Array.isArray(row) && Object.keys(row).length === 4 &&
      ['char', 'word', 'pinyin', 'sentence'].every(key => Object.hasOwn(row, key) && typeof row[key] === 'string') &&
      /^[\p{Script=Han}〇]$/u.test(row.char) && /^[\p{Script=Han}〇]{2,12}$/u.test(row.word) && row.word.includes(row.char) &&
      /^[a-züêāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜńňǹḿ]{1,16}[1-5]?$/u.test(row.pinyin) && row.sentence.length <= 80;
  } catch (_) { return false; }
}

/** Run during local/admin setup only; hosted deployments should use migrations. */
export async function initializeD1SentenceStorage(db) {
  if (!validDatabase(db) || typeof db.batch !== 'function') throw unavailable();
  try {
    const results = await db.batch(SENTENCE_STORAGE_SCHEMA.map(sql => db.prepare(sql)));
    if (!Array.isArray(results) || results.length !== SENTENCE_STORAGE_SCHEMA.length) throw unavailable();
    results.forEach(result => assertSuccess(result));
  } catch (_) { throw unavailable(); }
}

export function createD1SentenceStorage(db, { now = () => Date.now() } = {}) {
  if (!validDatabase(db) || typeof now !== 'function') throw unavailable();
  return {
    cache: {
      async get(key, type = 'text') {
        if (typeof key !== 'string' || !CACHE_KEY.test(key) || type !== 'text') throw unavailable();
        try {
          const row = await db.prepare(CACHE_GET).bind(key, validClock(now)).first();
          // Revalidate stored values and let the service check sentence quality.
          return row && cacheValue(row.value) ? row.value : null;
        } catch (_) { throw unavailable(); }
      },
      async put(key, value, options = {}) {
        const ttl = options.expirationTtl;
        if (typeof key !== 'string' || !CACHE_KEY.test(key) || !cacheValue(value) ||
            !Number.isSafeInteger(ttl) || ttl < 1 || ttl > MAX_TTL) throw unavailable();
        try {
          const expiresAt = validClock(now) + ttl * 1000;
          if (!Number.isSafeInteger(expiresAt)) throw unavailable();
          const result = assertSuccess(await db.prepare(CACHE_PUT).bind(key, value, expiresAt).run(), true);
          if (result.meta.changes !== 1) throw unavailable();
        } catch (_) { throw unavailable(); }
      }
    },
    limiter: {
      async consume({ key, units, limit, windowSeconds } = {}) {
        const match = typeof key === 'string' && LIMIT_KEY.exec(key);
        if (!match || !Number.isSafeInteger(units) || units < 1 || units > 1000 ||
            !Number.isSafeInteger(limit) || limit < 1 || limit > 1000 ||
            windowSeconds !== (match[1] === 'requests' ? 60 : 86400)) throw unavailable();
        const timestamp = validClock(now), bucket = Number(match[2]);
        const currentBucket = Math.floor(timestamp / (windowSeconds * 1000));
        // A request crossing the boundary may retry; never use a stale bucket.
        if (bucket < currentBucket) return { allowed: false, retryAfter: 1 };
        if (bucket > currentBucket) throw unavailable();
        const expiresAt = (bucket + 1) * windowSeconds * 1000;
        const retryAfter = Math.max(1, Math.ceil((expiresAt - timestamp) / 1000));
        if (units > limit) return { allowed: false, retryAfter };
        try {
          const result = assertSuccess(await db.prepare(CONSUME).bind(key, units, expiresAt, units, limit, limit).run(), true);
          if (![0, 1].includes(result.meta.changes)) throw unavailable();
          return result.meta.changes === 1 ? { allowed: true } : { allowed: false, retryAfter };
        } catch (_) { throw unavailable(); }
      }
    },
    /** Explicit bounded maintenance; call from a scheduled/admin path, not DDL. */
    async pruneExpired({ batchSize = 100 } = {}) {
      if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 1000 || typeof db.batch !== 'function') throw unavailable();
      try {
        const timestamp = validClock(now);
        const results = await db.batch([
          db.prepare(PRUNE_CACHE).bind(timestamp, batchSize),
          db.prepare(PRUNE_LIMITS).bind(timestamp, batchSize)
        ]);
        if (!Array.isArray(results) || results.length !== 2) throw unavailable();
        results.forEach(result => assertSuccess(result, true));
        return { cache: results[0].meta.changes, limits: results[1].meta.changes };
      } catch (_) { throw unavailable(); }
    }
  };
}
