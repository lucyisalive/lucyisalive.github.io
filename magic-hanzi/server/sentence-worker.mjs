import { createSentenceService } from './sentence-service.mjs';
import { createD1SentenceStorage, SENTENCE_STORAGE_SCHEMA } from './sentence-storage.mjs';
import { readOpenAiKey, writeWrappedKeyOnce, KEY_VAULT_SCHEMA } from './sentence-key-vault.mjs';

/** Sites supplies trusted identity headers. Do not expose this Worker through a
 * proxy that allows callers to forge oai-authenticated-user-* headers.
 * Apply SENTENCE_WORKER_SCHEMA as a deployment migration, never inside fetch.
 * Bootstrap is for a CONFIRMED OWNER-PRIVATE Site only. Turn its flag off before
 * changing the Site audience to public; the public handler must have it disabled.
 * Native secret: HANZI_KEY_WRAPPING_SECRET. Plain OpenAI keys stay in request
 * memory only; D1 stores the authenticated AES envelope and family token hash.
 */
export const PAIRING_SCHEMA = Object.freeze([
  `CREATE TABLE IF NOT EXISTS hanzi_sentence_pairing (
    id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
    owner_uid TEXT,
    family_hash TEXT CHECK (family_hash IS NULL OR length(family_hash) = 64)
  )`
]);
export const SENTENCE_WORKER_SCHEMA = Object.freeze([...SENTENCE_STORAGE_SCHEMA, ...KEY_VAULT_SCHEMA, ...PAIRING_SCHEMA]);

const GAME_ORIGIN = 'https://lucyisalive.github.io';
const SELECT_PAIRING = 'SELECT owner_uid, family_hash FROM hanzi_sentence_pairing WHERE id = 1';
const PIN_OWNER = `INSERT INTO hanzi_sentence_pairing (id, owner_uid, family_hash) VALUES (1, ?, NULL)
  ON CONFLICT (id) DO UPDATE SET owner_uid = excluded.owner_uid WHERE hanzi_sentence_pairing.owner_uid IS NULL`;
const PAIR_FAMILY = 'UPDATE hanzi_sentence_pairing SET family_hash = ? WHERE id = 1 AND owner_uid = ?';
const HEX_64 = /^[a-f0-9]{64}$/i;

class WorkerError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}
function failure(status, code) { throw new WorkerError(status, code); }
function headers(extra = {}) {
  return { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', ...extra };
}
function json(status, body, origin) {
  return new Response(JSON.stringify(body), { status, headers: headers({
    'Content-Type': 'application/json; charset=utf-8', Vary: 'Origin', ...(origin ? { 'Access-Control-Allow-Origin': origin } : {})
  }) });
}
function sameOrigin(request) {
  if (request.headers.get('Origin') !== new URL(request.url).origin) failure(403, 'origin_forbidden');
}
function gameOrigin(request, env) {
  const origin = request.headers.get('Origin');
  if (origin === GAME_ORIGIN) return origin;
  if (env.HANZI_SENTENCE_ALLOW_LOCALHOST === 'true' && origin) {
    try {
      const url = new URL(origin);
      if (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && url.origin === origin) return origin;
    } catch (_) { /* Reject malformed development origins. */ }
  }
  return null;
}
function dbOf(env) {
  if (!env.DB || typeof env.DB.prepare !== 'function') failure(503, 'storage_unavailable');
  return env.DB;
}
async function pairing(db) {
  try { return await db.prepare(SELECT_PAIRING).first(); }
  catch (_) { failure(503, 'storage_unavailable'); }
}
function oneWrite(result, allowZero = false) {
  if (result?.success !== true || !(allowZero ? [0, 1] : [1]).includes(result.meta?.changes)) failure(503, 'storage_unavailable');
}
async function bodyJson(request, maxBytes) {
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('Content-Type') || '')) failure(415, 'unsupported_media_type');
  const declared = request.headers.get('Content-Length');
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > maxBytes)) failure(413, 'request_too_large');
  if (!request.body) failure(400, 'invalid_json');
  const reader = request.body.getReader(), chunks = [];
  let length = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      length += next.value.byteLength;
      if (length > maxBytes) { await reader.cancel().catch(() => {}); failure(413, 'request_too_large'); }
      chunks.push(next.value);
    }
  } catch (error) {
    if (error instanceof WorkerError) throw error;
    failure(400, 'invalid_json');
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch (_) { failure(400, 'invalid_json'); }
}
function exactKeys(value, keys) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === keys.length &&
    keys.every(key => Object.hasOwn(value, key));
}
function pairHtml(nonce) {
  // No token, email, UID, key, or environment value is interpolated into this page.
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>连接汉字例句</title><style nonce="${nonce}">body{font:18px/1.7 system-ui,sans-serif;background:#10121b;color:#eee;padding:32px;max-width:600px;margin:auto}h1{font-size:26px}p{white-space:pre-wrap}</style>
<h1>连接自动例句</h1><p id="status">已确认家长身份，正在连接当前家庭。</p>
<script nonce="${nonce}">(() => {
  'use strict';
  const target = 'https://lucyisalive.github.io', parentWindow = window.opener;
  const status = document.getElementById('status');
  if (!parentWindow) { status.textContent = '请回到汉字魔法门，从家长设置打开连接窗口。'; return; }
  let busy = false, done = false;
  window.addEventListener('message', async event => {
    const data = event.data;
    if (event.origin !== target || event.source !== parentWindow || !data || typeof data !== 'object' ||
        Object.keys(data).length !== 2 || data.type !== 'hanzi-sentence-pair-token' ||
        typeof data.token !== 'string' || !/^[a-f0-9]{64}$/i.test(data.token) || busy || done) return;
    busy = true;
    try {
      const response = await fetch('/admin/pair', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: data.token }), credentials: 'same-origin', cache: 'no-store', redirect: 'error' });
      if (!response.ok) throw new Error('pair_failed');
      done = true;
      status.textContent = '自动例句已连接。可以关闭本窗口，回到游戏继续练习。';
      parentWindow.postMessage({ type: 'hanzi-sentence-paired' }, target);
    } catch (_) { status.textContent = '这次未能连接，请回到游戏重新打开连接窗口。'; }
    finally { busy = false; }
  });
  parentWindow.postMessage({ type: 'hanzi-sentence-pair-request' }, target);
})();</script></html>`;
}

export function createSentenceWorker({ fetchImpl = globalThis.fetch, cryptoImpl = globalThis.crypto, now = () => Date.now(), timeoutMs = 12000 } = {}) {
  const service = createSentenceService({ fetchImpl, cryptoImpl, now, timeoutMs });
  async function digest(text) {
    if (!cryptoImpl?.subtle) failure(503, 'service_unconfigured');
    try {
      return Array.from(new Uint8Array(await cryptoImpl.subtle.digest('SHA-256', new TextEncoder().encode(text))), byte => byte.toString(16).padStart(2, '0')).join('');
    } catch (_) { failure(503, 'service_unconfigured'); }
  }
  async function owner(request, env, allowRedirect) {
    const uid = request.headers.get('oai-authenticated-user-id');
    if (!uid) {
      if (allowRedirect) return null;
      failure(401, 'identity_required');
    }
    if (uid.length > 256 || /[\x00-\x1f\x7f]/.test(uid)) failure(403, 'owner_forbidden');
    const db = dbOf(env), current = await pairing(db);
    if (current?.owner_uid !== null && current?.owner_uid !== undefined) {
      if (current.owner_uid !== uid) failure(403, 'owner_forbidden');
      return uid;
    }
    const email = request.headers.get('oai-authenticated-user-email');
    if (typeof env.HANZI_OWNER_EMAIL !== 'string' || !env.HANZI_OWNER_EMAIL) failure(503, 'service_unconfigured');
    if (email !== env.HANZI_OWNER_EMAIL) failure(403, 'owner_forbidden');
    try { oneWrite(await db.prepare(PIN_OWNER).bind(uid).run(), true); }
    catch (_) { failure(503, 'storage_unavailable'); }
    // Read after the atomic pin: a concurrent different UID can never take over.
    if ((await pairing(db))?.owner_uid !== uid) failure(403, 'owner_forbidden');
    return uid;
  }
  function wrappingConfigured(env) {
    if (typeof env.HANZI_KEY_WRAPPING_SECRET !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(env.HANZI_KEY_WRAPPING_SECRET)) failure(503, 'service_unconfigured');
  }
  async function openKey(db, env) {
    wrappingConfigured(env);
    try { return await readOpenAiKey(db, env.HANZI_KEY_WRAPPING_SECRET); }
    catch (error) { failure(503, error?.code === 'key_vault_unavailable' ? 'storage_unavailable' : 'service_unconfigured'); }
  }

  return {
    async fetch(request, env = {}) {
      const url = new URL(request.url), path = url.pathname;
      const api = path === '/health' || path === '/v1/sentences';
      const cors = api ? gameOrigin(request, env) : null;
      try {
        if (path === '/admin/bootstrap') {
          if (env.HANZI_BOOTSTRAP_ENABLED !== 'true') failure(404, 'not_found');
          if (request.method !== 'POST') failure(405, 'method_not_allowed');
          sameOrigin(request);
          wrappingConfigured(env);
          const envelope = await bodyJson(request, 2048);
          if (!exactKeys(envelope, ['version', 'iv', 'ciphertext'])) failure(400, 'invalid_envelope');
          // Validate the envelope against the native secret before its one-time
          // write; otherwise a mismatched upload could permanently brick setup.
          try { await readOpenAiKey({ prepare: () => ({ first: async () => envelope }) }, env.HANZI_KEY_WRAPPING_SECRET); }
          catch (_) { failure(400, 'invalid_envelope'); }
          try { await writeWrappedKeyOnce(dbOf(env), envelope); }
          catch (error) {
            if (error?.code === 'key_already_initialized') failure(409, 'key_already_initialized');
            if (error?.code === 'invalid_envelope') failure(400, 'invalid_envelope');
            failure(503, 'storage_unavailable');
          }
          return json(201, { initialized: true });
        }
        if (path === '/pair') {
          if (request.method !== 'GET') failure(405, 'method_not_allowed');
          if (!await owner(request, env, true)) {
            return new Response(null, { status: 302, headers: headers({ Location: '/signin-with-chatgpt?return_to=%2Fpair' }) });
          }
          if (!cryptoImpl?.getRandomValues) failure(503, 'service_unconfigured');
          const nonce = Array.from(cryptoImpl.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
          return new Response(pairHtml(nonce), { headers: headers({
            'Content-Type': 'text/html; charset=utf-8', 'X-Frame-Options': 'DENY',
            'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`
          }) });
        }
        if (path === '/admin/pair') {
          if (request.method !== 'POST') failure(405, 'method_not_allowed');
          sameOrigin(request);
          const uid = await owner(request, env, false);
          // A native configured fingerprint takes priority. Do not report a
          // successful DB re-pair that could not change the active credential.
          if (env.HANZI_FAMILY_HASH !== undefined) failure(409, 'pairing_managed');
          const body = await bodyJson(request, 256);
          if (!exactKeys(body, ['token']) || typeof body.token !== 'string' || !HEX_64.test(body.token)) failure(400, 'invalid_pairing_token');
          const familyHash = await digest(body.token);
          try { oneWrite(await dbOf(env).prepare(PAIR_FAMILY).bind(familyHash, uid).run()); }
          catch (_) { failure(503, 'storage_unavailable'); }
          return json(200, { paired: true });
        }
        if (api) {
          // Browser preflight must neither query D1 nor decrypt the API key.
          if (request.method === 'OPTIONS') return service.fetch(request, { HANZI_SENTENCE_ALLOW_LOCALHOST: env.HANZI_SENTENCE_ALLOW_LOCALHOST });
          if (!cors) failure(403, 'origin_forbidden');
          if (request.method !== (path === '/health' ? 'GET' : 'POST')) failure(405, 'method_not_allowed');
          const match = /^Bearer ([a-f0-9]{64})$/i.exec(request.headers.get('Authorization') || '');
          if (!match) failure(401, 'unauthorized');
          const token = match[1], db = dbOf(env);
          const configuredHash = env.HANZI_FAMILY_HASH;
          let expected;
          if (configuredHash !== undefined) {
            if (typeof configuredHash !== 'string' || !HEX_64.test(configuredHash)) failure(503, 'service_unconfigured');
            expected = configuredHash.toLowerCase();
          } else {
            expected = (await pairing(db))?.family_hash;
            if (!expected) failure(401, 'unauthorized');
            if (typeof expected !== 'string' || !/^[a-f0-9]{64}$/.test(expected)) failure(503, 'storage_unavailable');
          }
          const actual = await digest(token);
          let difference = 0;
          for (let index = 0; index < 64; index++) difference |= actual.charCodeAt(index) ^ expected.charCodeAt(index);
          if (difference !== 0) failure(401, 'unauthorized');
          if (typeof env.HANZI_SITE_ID !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(env.HANZI_SITE_ID)) failure(503, 'service_unconfigured');
          const siteHash = await digest(`hanzi-site-budget-v1:${env.HANZI_SITE_ID}`);
          const storage = createD1SentenceStorage(db, { now });
          const apiKey = await openKey(db, env);
          return service.fetch(request, {
            OPENAI_API_KEY: apiKey,
            HANZI_SENTENCE_ACCESS_TOKEN: token,
            HANZI_UPSTREAM_DIAGNOSTICS: env.HANZI_BOOTSTRAP_ENABLED === 'true' && env.HANZI_UPSTREAM_DIAGNOSTICS === 'true' ? 'true' : undefined,
            HANZI_SENTENCE_ALLOW_LOCALHOST: env.HANZI_SENTENCE_ALLOW_LOCALHOST,
            HANZI_SENTENCE_REQUESTS_PER_MINUTE: '20',
            HANZI_SENTENCE_SENTENCES_PER_DAY: '120',
            HANZI_SENTENCE_CACHE: storage.cache,
            HANZI_SENTENCE_LIMITER: {
              consume(reservation) {
                const parsed = /^hanzi-sentences-v(\d+):(requests|generation):[a-f0-9]{64}:(\d+)$/.exec(reservation.key);
                if (!parsed) throw new Error('storage_unavailable');
                return storage.limiter.consume({ ...reservation, key: `hanzi-sentences-v${parsed[1]}:${parsed[2]}:${siteHash}:${parsed[3]}` });
              }
            }
          });
        }
        if (path === '/' && request.method === 'GET') {
          return new Response('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>汉字例句服务</title><p>汉字魔法门自动例句服务。</p><p>请从游戏的家长设置打开连接窗口。</p></html>', { headers: headers({
            'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"
          }) });
        }
        failure(404, 'not_found');
      } catch (error) {
        return json(error instanceof WorkerError ? error.status : 503,
          { error: { code: error instanceof WorkerError ? error.code : 'storage_unavailable' } }, cors);
      }
    }
  };
}

export default createSentenceWorker();
