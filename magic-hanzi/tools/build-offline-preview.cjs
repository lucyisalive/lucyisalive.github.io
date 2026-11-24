'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { buildPage } = require('./build-page.cjs');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file));
const assets = [
  'assets/herbalist/apothecary.webp',
  'assets/herbalist/cottage.webp',
  'assets/herbalist/stone-wall.webp',
  'assets/observatory/observatory.webp',
  'assets/story/giant-kitchen.webp',
  'assets/story/mountain-face.webp',
  'assets/story/bridge.webp',
  'assets/story/train.webp',
  'assets/story/tomb.webp',
  'assets/story/underwater.webp',
  'assets/story/mermaid.webp',
  'assets/story/cloud-flight.webp',
  'assets/story/sea-surface.webp',
  'assets/story/fierce-guards-a.webp',
  'assets/story/fierce-guards-b.webp',
  'assets/story/dunes.webp',
  'assets/story/dune-dragon-hornless-v2.webp',
  'assets/story/dragon-riding-hornless-v2.webp',
  'assets/story/forbidden-library-v2.webp',
  'assets/story/book-step-plain-v2.webp',
  'assets/story/forbidden-book.webp',
  'assets/story/ghost-knight.webp',
  'assets/story/frozen-courtyard.webp',
  'assets/story/ice-goddess.webp',
  'assets/story/ice-goddess-awake.webp',
  'assets/story/ice-goddess-shell-v2.webp',
  'assets/story/goddess-handhold-flight-v3.webp',
  'assets/story/ice-flight-sky-v3.webp',
  'assets/story/armor-chamber.webp',
  'assets/story/castle-armor-standing-v2.webp',
  'assets/story/castle-armor-kneeling-v3.webp',
  'assets/mountain-journey/forest-trail.webp',
  'assets/mountain-journey/gate-frame.webp',
  'assets/mountain-journey/gate-doors.webp',
  'assets/robes/black.svg',
  'assets/robes/purple.svg',
  'assets/robes/green.svg',
  'assets/robes/blue.svg',
  'assets/robes/silver.svg',
  'assets/robes/blood.svg',
];
const glyphs = ['hanzi-data.js', 'curriculum-hanzi-data.js', 'pinyin-data.js'];
const destination = process.argv[2];
if (!destination) throw new Error('Usage: node tools/build-offline-preview.cjs <output.html>');

let { html } = buildPage(root);
for (const file of assets) {
  const mimeType = file.endsWith('.svg') ? 'image/svg+xml' : 'image/webp';
  html = html.replaceAll(file, 'data:' + mimeType + ';base64,' + read(file).toString('base64'));
}
const inlineGlyphs = glyphs.map(file => {
  const code = read(file).toString('utf8').replace(/<\/script/gi, '<\\/script');
  return '<script data-source="' + file + '">\n' + code + '\n</script>';
}).join('\n');
html = html.replace('<script data-source="herbalist-room.js">', inlineGlyphs + '\n<script data-source="herbalist-room.js">');
fs.writeFileSync(destination, html);
