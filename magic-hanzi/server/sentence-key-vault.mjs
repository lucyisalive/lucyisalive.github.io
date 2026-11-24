/**
 * Stores an AES-GCM envelope in D1. The separate wrapping secret belongs in a
 * Sites secret environment variable. This module never logs or stores plaintext.
 * Apply KEY_VAULT_SCHEMA through deployment migrations before serving requests.
 * The caller authorizes the initial write through the owner-private Site.
 */

export const KEY_VAULT_SCHEMA = Object.freeze([
  `CREATE TABLE IF NOT EXISTS hanzi_sentence_credentials (
    id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
    version INTEGER NOT NULL CHECK (version = 1),
    iv TEXT NOT NULL CHECK (length(iv) = 16),
    ciphertext TEXT NOT NULL CHECK (length(ciphertext) BETWEEN 22 AND 1366)
  )`
]);

const INSERT_KEY = `INSERT INTO hanzi_sentence_credentials (id, version, iv, ciphertext)
  VALUES (1, ?, ?, ?) ON CONFLICT (id) DO NOTHING`;
const SELECT_KEY = 'SELECT version, iv, ciphertext FROM hanzi_sentence_credentials WHERE id = 1';
const AAD = new TextEncoder().encode('hanzi-sentence-openai-key-v1');
const BASE64URL = /^[A-Za-z0-9_-]+$/;

function failure(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function decodeBase64url(value, maxBytes, code) {
  if (typeof value !== 'string' || !BASE64URL.test(value) || value.length % 4 === 1 ||
      value.length > Math.ceil(maxBytes * 4 / 3)) throw failure(code);
  try {
    const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(base64 + '='.repeat((4 - base64.length % 4) % 4));
    const canonical = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    if (canonical !== value || binary.length > maxBytes) throw failure(code);
    return Uint8Array.from(binary, char => char.charCodeAt(0));
  } catch (_) { throw failure(code); }
}

function decodeEnvelope(envelope) {
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope) ||
      Object.keys(envelope).length !== 3 || !['version', 'iv', 'ciphertext'].every(key => Object.hasOwn(envelope, key)) ||
      envelope.version !== 1) throw failure('invalid_envelope');
  const iv = decodeBase64url(envelope.iv, 12, 'invalid_envelope');
  const ciphertext = decodeBase64url(envelope.ciphertext, 1024, 'invalid_envelope');
  if (iv.byteLength !== 12 || ciphertext.byteLength < 16) throw failure('invalid_envelope');
  return { iv, ciphertext };
}

function validDatabase(db) {
  if (!db || typeof db.prepare !== 'function') throw failure('key_vault_unavailable');
}

/** Atomically writes the first envelope. A retry can never replace that envelope. */
export async function writeWrappedKeyOnce(db, envelope) {
  decodeEnvelope(envelope);
  validDatabase(db);
  let result;
  try {
    result = await db.prepare(INSERT_KEY).bind(envelope.version, envelope.iv, envelope.ciphertext).run();
  } catch (_) { throw failure('key_vault_unavailable'); }
  if (result?.success !== true || ![0, 1].includes(result.meta?.changes)) throw failure('key_vault_unavailable');
  if (result.meta.changes === 0) throw failure('key_already_initialized');
  return true;
}

/** Returns plaintext only to server code in memory. Database/crypto errors are redacted. */
export async function readOpenAiKey(db, wrappingSecret) {
  const secret = decodeBase64url(wrappingSecret, 32, 'invalid_wrapping_secret');
  if (wrappingSecret.length !== 43 || secret.byteLength !== 32) throw failure('invalid_wrapping_secret');
  validDatabase(db);
  let envelope;
  try { envelope = await db.prepare(SELECT_KEY).first(); }
  catch (_) { throw failure('key_vault_unavailable'); }
  if (!envelope) throw failure('key_not_initialized');
  const { iv, ciphertext } = decodeEnvelope(envelope);
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw failure('key_vault_unavailable');
  let plaintext;
  try {
    const key = await subtle.importKey('raw', secret, 'AES-GCM', false, ['decrypt']);
    plaintext = new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv, additionalData: AAD, tagLength: 128 }, key, ciphertext));
    const apiKey = new TextDecoder('utf-8', { fatal: true }).decode(plaintext);
    if (!/^sk-[A-Za-z0-9_-]{13,509}$/.test(apiKey)) throw failure('key_decryption_failed');
    return apiKey;
  } catch (_) { throw failure('key_decryption_failed'); }
  finally {
    secret.fill(0);
    plaintext?.fill(0);
  }
}
