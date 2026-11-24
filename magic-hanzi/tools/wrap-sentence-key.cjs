'use strict';

// Run only inside the secure orchestration cell. Never forward this command's
// wrapping-secret result into chat. The encrypted envelope is written separately
// to private local work, and the raw OpenAI key never leaves process memory.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const target = process.argv[2];
const key = process.env.OPENAI_API_KEY;
if (!target || !path.isAbsolute(target) || !/^sk-[A-Za-z0-9_-]{16,}$/.test(key || '')) throw Error('Secure key wrapping is not configured');
const wrappingKey = crypto.randomBytes(32), iv = crypto.randomBytes(12);
const cipher = crypto.createCipheriv('aes-256-gcm', wrappingKey, iv);
cipher.setAAD(Buffer.from('hanzi-sentence-openai-key-v1'));
const ciphertext = Buffer.concat([cipher.update(key, 'utf8'), cipher.final(), cipher.getAuthTag()]);
fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
fs.writeFileSync(target, JSON.stringify({ version: 1, iv: iv.toString('base64url'), ciphertext: ciphertext.toString('base64url') }), { flag: 'wx', mode: 0o600 });
process.stdout.write(JSON.stringify({ wrappingSecret: wrappingKey.toString('base64url') }));
wrappingKey.fill(0);
