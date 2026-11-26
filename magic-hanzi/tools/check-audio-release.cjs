'use strict';

const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const checks = [
  ['tools/build-page.cjs', '--check'],
  ['tests/glyph-files.cjs'],
  ['tests/offline-startup.cjs'],
  ['tests/feedback-module.cjs'],
  ['tests/feedback-integration.cjs'],
  ['tests/ipad-audio-integration.cjs'],
  ['tests/herbalist-room-integration.cjs'],
  ['tests/magic-shop-catalog.cjs'],
  ['tests/magic-shop-ledger.cjs'],
  ['tests/magic-shop-room-input.cjs', '--browser-required'],
];

for (const [file, ...args] of checks) {
  const result = spawnSync(process.execPath, [file, ...args], { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log('The iPad audio release checks passed.');
