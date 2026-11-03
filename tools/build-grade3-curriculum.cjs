'use strict';
// Rebuild the curated practice pool from the verified textbook word table.
// No glyph geometry or grading thresholds are generated or changed here.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const source = JSON.parse(fs.readFileSync(path.join(root, 'data/grade3-word-sources.json'), 'utf8'));
const words = new Map(source.words.map(row => [row.word, row]));
const context = vm.createContext({ window: {} });
for (const file of ['hanzi-data.js', 'curriculum-hanzi-data.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context);
}
const rows = fs.readFileSync(path.join(root, 'data/grade3-targets.tsv'), 'utf8').trim().split(/\r?\n/);
const seen = new Set();
const entries = rows.map(line => {
  const [char, pinyin, word, structure] = line.split('\t');
  if (!words.has(word) || !word.includes(char)) throw new Error('Word not in the verified textbook table: ' + line);
  if ([...char].length !== 1 || seen.has(char)) throw new Error('Duplicate or invalid target: ' + char);
  seen.add(char);
  const glyph = context.window.HANZI_LOCAL_DATA[char];
  if (!glyph?.medians?.length) throw new Error('Missing offline glyph: ' + char);
  const row = words.get(word);
  return { char, pinyin, word, structure, strokeCount: glyph.medians.length,
    unit: row.unit, lesson: row.lesson, printedPage: row.printed_page };
});
const data = {
  id: 'pep-3b-2025-10', name: '统编人教版·三年级下册',
  edition: source.book.edition, isbn: source.book.isbn,
  sourceWordCount: source.word_count, officialUrl: source.provenance.official_reader_url,
  sourcePdfUrl: source.provenance.pdf_url, wordTablePages: source.book.word_table_printed_pages,
  note: '从原教材271词中选取92词、每词一个目标字作为本轮验证池；一格一字，按难度与结构均衡随机。',
  entries,
};
const output = '/* 三下教材词语抽选池。来源和逐页核对记录见 data/grade3-word-sources.json。\n' +
  '   生成：node tools/build-grade3-curriculum.cjs；数据与判分规则分离。 */\n' +
  'window.HANZI_CURRICULUM = ' + JSON.stringify(data, null, 2) + ';\n';
fs.writeFileSync(path.join(root, 'curriculum-data.js'), output);
const summary = { targets: entries.length, structures: {}, difficulty: {}, units: {} };
for (const row of entries) {
  const level = row.strokeCount <= 6 ? 'simple' : row.strokeCount <= 12 ? 'medium' : 'complex';
  for (const [field, key] of [['structures', row.structure], ['difficulty', level], ['units', row.unit]]) {
    summary[field][key] = (summary[field][key] || 0) + 1;
  }
}
console.log(JSON.stringify(summary));
