'use strict';

// Synthetic secrets only, with real SQLite persistence and WebCrypto encryption.
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { webcrypto, randomBytes } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');

function d1(database, trace = []) {
  return {
    prepare(sql) {
      let params = [];
      const statement = {
        bind(...values) { params = values; return statement; },
        async first() {
          trace.push({ sql, params });
          return database.prepare(sql).get(...params) || null;
        },
        async run() {
          await Promise.resolve();
          trace.push({ sql, params });
          const result = database.prepare(sql).run(...params);
          return { success: true, meta: { changes: Number(result.changes) } };
        }
      };
      return statement;
    }
  };
}

async function wrap(apiKey, secret, aad = 'hanzi-sentence-openai-key-v1') {
  const iv = randomBytes(12);
  const key = await webcrypto.subtle.importKey('raw', Buffer.from(secret, 'base64url'), 'AES-GCM', false, ['encrypt']);
  const ciphertext = await webcrypto.subtle.encrypt({ name: 'AES-GCM', iv,
    additionalData: new TextEncoder().encode(aad), tagLength: 128 }, key, new TextEncoder().encode(apiKey));
  return { version: 1, iv: iv.toString('base64url'), ciphertext: Buffer.from(ciphertext).toString('base64url') };
}

async function expectCode(operation, code) {
  await assert.rejects(operation, error => {
    assert.equal(error.code, code);
    assert.equal(error.message, code);
    assert.equal(error.cause, undefined);
    return true;
  });
}

(async () => {
  const { KEY_VAULT_SCHEMA, writeWrappedKeyOnce, readOpenAiKey } =
    await import(pathToFileURL(path.join(__dirname, '../server/sentence-key-vault.mjs')));
  const folder = mkdtempSync(path.join(tmpdir(), 'sentence-key-vault-'));
  const file = path.join(folder, 'vault.sqlite');
  const secret = randomBytes(32).toString('base64url');
  const apiKey = 'sk-synthetic-' + randomBytes(32).toString('base64url');
  const envelope = await wrap(apiKey, secret);
  let database;
  try {
    database = new DatabaseSync(file);
    for (const sql of KEY_VAULT_SCHEMA) database.exec(sql);
    const trace = [];
    const binding = d1(database, trace);
    await expectCode(readOpenAiKey(binding, secret), 'key_not_initialized');
    assert.equal(await writeWrappedKeyOnce(binding, envelope), true);
    assert.equal(await readOpenAiKey(binding, secret), apiKey);
    const initialRow = database.prepare('SELECT * FROM hanzi_sentence_credentials').get();
    assert.deepEqual(Object.keys(initialRow), ['id', 'version', 'iv', 'ciphertext']);
    assert(!JSON.stringify(initialRow).includes(secret));
    assert(!JSON.stringify(initialRow).includes(apiKey));
    assert(trace.every(entry => !/CREATE|ALTER|DROP/.test(entry.sql)));

    await expectCode(writeWrappedKeyOnce(binding, envelope), 'key_already_initialized');
    const different = await wrap('sk-synthetic-' + randomBytes(24).toString('base64url'), secret);
    await expectCode(writeWrappedKeyOnce(binding, different), 'key_already_initialized');
    assert.deepEqual(database.prepare('SELECT * FROM hanzi_sentence_credentials').get(), initialRow);

    database.close();
    database = new DatabaseSync(file);
    const reopened = d1(database);
    assert.equal(await readOpenAiKey(reopened, secret), apiKey);
    await expectCode(readOpenAiKey(reopened, randomBytes(32).toString('base64url')), 'key_decryption_failed');

    for (const malformed of [null, {}, { ...envelope, version: 2 }, { ...envelope, version: '1' },
      { ...envelope, iv: randomBytes(11).toString('base64url') }, { ...envelope, iv: envelope.iv + '=' },
      { ...envelope, ciphertext: randomBytes(1025).toString('base64url') },
      { ...envelope, ciphertext: randomBytes(15).toString('base64url') },
      { ...envelope, ciphertext: 'A' }, { ...envelope, plaintext: apiKey }]) {
      await expectCode(writeWrappedKeyOnce(reopened, malformed), 'invalid_envelope');
    }
    for (const malformed of [null, '', secret + '=', secret.slice(1), ' '.repeat(43),
      randomBytes(33).toString('base64url'), secret.slice(0, -1) + 'B']) {
      await expectCode(readOpenAiKey(reopened, malformed), 'invalid_wrapping_secret');
    }

    const corrupted = Buffer.from(envelope.ciphertext, 'base64url');
    corrupted[0] ^= 1;
    database.prepare('UPDATE hanzi_sentence_credentials SET ciphertext = ? WHERE id = 1').run(corrupted.toString('base64url'));
    await expectCode(readOpenAiKey(reopened, secret), 'key_decryption_failed');
    const incorrectAad = await wrap(apiKey, secret, 'synthetic-other-purpose');
    database.prepare('UPDATE hanzi_sentence_credentials SET iv = ?, ciphertext = ? WHERE id = 1').run(incorrectAad.iv, incorrectAad.ciphertext);
    await expectCode(readOpenAiKey(reopened, secret), 'key_decryption_failed');
    const invalidApiKey = await wrap('synthetic-non-key', secret);
    database.prepare('UPDATE hanzi_sentence_credentials SET iv = ?, ciphertext = ? WHERE id = 1').run(invalidApiKey.iv, invalidApiKey.ciphertext);
    await expectCode(readOpenAiKey(reopened, secret), 'key_decryption_failed');

    database.exec('DELETE FROM hanzi_sentence_credentials');
    const writes = await Promise.allSettled(Array.from({ length: 20 }, () => writeWrappedKeyOnce(reopened, envelope)));
    assert.equal(writes.filter(result => result.status === 'fulfilled').length, 1);
    assert(writes.filter(result => result.status === 'rejected').every(result => result.reason.code === 'key_already_initialized'));
    assert.equal(await readOpenAiKey(reopened, secret), apiKey);

    const unavailable = { prepare() { throw new Error('synthetic private database error'); } };
    await expectCode(readOpenAiKey(unavailable, secret), 'key_vault_unavailable');
    await expectCode(writeWrappedKeyOnce(unavailable, envelope), 'key_vault_unavailable');
    await expectCode(readOpenAiKey(null, secret), 'key_vault_unavailable');
    await expectCode(writeWrappedKeyOnce(null, envelope), 'key_vault_unavailable');
    const badWrite = { prepare: () => ({ bind() { return this; }, run: async () => ({ success: true, meta: { changes: 2 } }) }) };
    await expectCode(writeWrappedKeyOnce(badWrite, envelope), 'key_vault_unavailable');
    const missingTable = new DatabaseSync(':memory:');
    await expectCode(readOpenAiKey(d1(missingTable), secret), 'key_vault_unavailable');
    await expectCode(writeWrappedKeyOnce(d1(missingTable), envelope), 'key_vault_unavailable');
    missingTable.close();
    assert(Object.isFrozen(KEY_VAULT_SCHEMA));
  } finally {
    database?.close();
    rmSync(folder, { recursive: true, force: true });
  }
  console.log('Sentence key vault: synthetic AES-GCM, durable SQLite, malformed input, authentication failures, and atomic no-overwrite passed.');
})().catch(error => { console.error(error.code || error.message); process.exitCode = 1; });
