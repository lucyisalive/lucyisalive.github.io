'use strict';

// Exercise the browser's actual grading functions, with the bundled glyph data.
// No network, browser storage, DOM, or copied implementation is involved.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function createGrader({ html = fs.readFileSync(path.join(root, 'index.html'), 'utf8'), extraGlyphs = {} } = {}) {
  const start = html.indexOf('function medianToCanvasPoints(');
  const end = html.indexOf('const progressPath =', start);
  if (start < 0 || end < 0) throw new Error('Grading source boundaries were not found');
  let logs = [], recordedInk = [];
  const context = vm.createContext({
    window: {},
    console: { log: (...args) => logs.push(args.join(' ')) },
    setTimeout,
    clearTimeout,
    captureInk: (payload, verdict) => recordedInk.push({ payload, verdict }),
  });
  vm.runInContext(fs.readFileSync(path.join(root, 'hanzi-data.js'), 'utf8'), context);
  const curriculumGlyphs = path.join(root, 'curriculum-hanzi-data.js');
  if (fs.existsSync(curriculumGlyphs)) {
    vm.runInContext(fs.readFileSync(curriculumGlyphs, 'utf8'), context);
  }
  for (const [char, data] of Object.entries(extraGlyphs)) {
    context.window.HANZI_LOCAL_DATA[char] ??= data;
  }
  const size = html.match(/const CANVAS_SIZE\s*=\s*(\d+)/)?.[1];
  const padding = html.match(/const CANVAS_PADDING\s*=\s*(\d+)/)?.[1];
  if (!size || !padding) throw new Error('Canvas constants were not found');
  vm.runInContext(`
    const CANVAS_SIZE = ${size}, CANVAS_PADDING = ${padding};
    let strokesPoints = [];
    async function getCharData(char) {
      const data = window.HANZI_LOCAL_DATA[char];
      if (!data) throw new Error('No bundled data for ' + char);
      return data;
    }
    function recordInk(payload, verdict) { captureInk(payload, verdict); }
  `, context);
  vm.runInContext(html.slice(start, end), context);

  return {
    async grade(char, strokes) {
      logs = [];
      recordedInk = [];
      context.testChar = char;
      context.testInk = strokes.map(s => s.map(p =>
        Array.isArray(p) ? { x: p[0], y: p[1] } : { x: p.x, y: p.y }
      ));
      vm.runInContext('strokesPoints = testInk;', context);
      const pass = await vm.runInContext('gradeDrawing(testChar)', context);
      return { pass, diagnostics: logs.filter(s => s.startsWith('[diag-grade]')).join('\n'),
        recordedInk: JSON.parse(JSON.stringify(recordedInk)) };
    },
    reference(char) {
      context.testChar = char;
      return vm.runInContext('window.HANZI_LOCAL_DATA[testChar].medians.map(medianToCanvasPoints)', context);
    },
    glyphs: Object.keys(context.window.HANZI_LOCAL_DATA),
  };
}

module.exports = { createGrader, root };
