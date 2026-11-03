'use strict';

// Controlled mutations describe known mistakes. They are separate from real
// handwriting: an unlabelled submission never becomes a positive by assumption.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createGrader } = require('../tools/grader-harness.cjs');

const parts = {
  '澡': [['氵', 0, 3], ['上口', 3, 6], ['左口', 6, 9], ['右口', 9, 12], ['木', 12, 16]],
  '警': [['艹', 0, 3], ['句', 3, 8], ['攵', 8, 12], ['言', 12, 19]],
  '薄': [['艹', 0, 3], ['氵', 3, 6], ['甫', 6, 13], ['寸', 13, 16]],
  '慧': [['左丰', 0, 4], ['右丰', 4, 8], ['彐', 8, 11], ['心', 11, 15]],
};
const clone = strokes => strokes.map(s => s.map(p =>
  Array.isArray(p) ? { x: p[0], y: p[1] } : { ...p }
));
const center = stroke => ({
  x: stroke.reduce((a, p) => a + p.x, 0) / stroke.length,
  y: stroke.reduce((a, p) => a + p.y, 0) / stroke.length,
});
function bounds(strokes) {
  const p = strokes.flat();
  const minX = Math.min(...p.map(p => p.x)), maxX = Math.max(...p.map(p => p.x));
  const minY = Math.min(...p.map(p => p.y)), maxY = Math.max(...p.map(p => p.y));
  return { w: maxX - minX, diag: Math.hypot(maxX - minX, maxY - minY) };
}
const line = (x, y, dx, dy) => Array.from({ length: 16 }, (_, i) =>
  ({ x: x + dx * i / 15, y: y + dy * i / 15 })
);

function structuralCases(grader) {
  const cases = [];
  const add = (id, target, s, expect = false) => cases.push({ id, target, s, expect });
  for (const [target, regions] of Object.entries(parts)) {
    const ref = clone(grader.reference(target));
    add(target + '-complete-reference', target, ref, true);
    for (const [name, start, end] of regions) {
      add(target + '-missing-' + name, target, ref.filter((_, i) => i < start || i >= end));
    }
    const wrong = { '澡': ['薄', '器'], '薄': ['澡', '藏'], '警': ['薄', '藏'], '慧': ['器', '燃'] };
    for (const source of wrong[target]) add(target + '-written-as-' + source, target, grader.reference(source));
    for (const shift of [3, 5]) {
      const centers = ref.map(center);
      add(target + '-relocated-' + shift, target, ref.map((s, i) => s.map(p => ({
        x: p.x - centers[i].x + centers[(i + shift) % ref.length].x,
        y: p.y - centers[i].y + centers[(i + shift) % ref.length].y,
      }))));
    }
    let seed = 0x4214 + target.charCodeAt(0);
    const random = () => {
      seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
      return (seed >>> 0) / 4294967296;
    };
    for (let n = 0; n < 2; n++) {
      const ink = Array.from({ length: ref.length }, () => {
        let x = 40 + random() * 220, y = 40 + random() * 220;
        return Array.from({ length: 16 }, () => {
          x += 40 * (random() - 0.5); y += 40 * (random() - 0.5);
          return { x, y };
        });
      });
      add(target + '-scribble-' + n, target, ink);
    }
  }
  const today = require('./ipad-2026-11-02.json').cases;
  const samples = [
    ['澡-standard', '澡', grader.reference('澡'), [0, 1, 2]],
    ['薄-standard', '薄', grader.reference('薄'), [3, 4, 5]],
    ['澡-confirmed-N04', '澡', today.find(c => c.id === 'ipad-2026-11-02-04').s, [0, 1, 2]],
    ['澡-confirmed-N05', '澡', today.find(c => c.id === 'ipad-2026-11-02-05').s, [0, 1, 2]],
  ];
  for (const [name, target, ink, ids] of samples) {
    const ref = clone(ink), radical = ids.map(i => ref[i]);
    const b = bounds(radical), a = center(radical[0]), z = center(radical[1]);
    add(name + '-no-water', target, ref.filter((_, i) => !ids.includes(i)));
    const extra = clone(ref);
    extra.push(line(Math.min(a.x, z.x) - b.w * 0.06, (a.y + z.y) / 2, b.diag * 0.16, b.diag * 0.04));
    add(name + '-fourth-water-mark', target, extra);
    for (const i of ids.slice(0, 2)) {
      const mutant = clone(ref), c = center(mutant[i]);
      mutant[i] = line(c.x - b.diag * 0.4, c.y, b.diag * 0.8, 0);
      add(name + '-elongated-dot-' + i, target, mutant);
    }
  }
  return cases;
}

async function main() {
  const htmlPath = process.argv[2];
  const grader = createGrader(htmlPath ? { html: fs.readFileSync(htmlPath, 'utf8') } : {});
  let positives = 0, errors = 0;
  for (const target of grader.glyphs) {
    const reference = grader.reference(target);
    const variations = [
      reference,
      reference.map(s => s.map(p => ({ x: p.x * 0.67 + 21, y: p.y * 0.67 + 39 }))),
      reference.slice().reverse(),
    ];
    for (const [i, s] of variations.entries()) {
      const r = await grader.grade(target, s);
      if (!r.pass) { errors++; console.error('FAIL reference', target, i, r.diagnostics); }
      else positives++;
    }
  }
  const cases = structuralCases(grader);
  assert.equal(cases.length, 61);
  let matched = 0;
  for (const c of cases) {
    const r = await grader.grade(c.target, c.s);
    if (r.pass === c.expect) matched++;
    else { errors++; console.error('FAIL mutation', c.id, r.diagnostics); }
  }
  // Discarded taps must stay available for diagnosis without entering scoring.
  // Otherwise a genuinely drawn tiny dot can disappear from both the grade and
  // the evidence, making a collection problem look like a writing mistake.
  const original = grader.reference('澡');
  const tinyMarks = [[{x: 250, y: 250}], [{x: 250, y: 250}, {x: 251, y: 251}]];
  for (const mark of tinyMarks) {
    const result = await grader.grade('澡', [...original, mark]);
    assert.equal(result.pass, true, 'A discarded tap must not change the grade');
    const record = result.recordedInk[0].payload;
    assert.equal(record.s.length, original.length);
    assert.equal(record.filtering.inputStrokeCount, original.length + 1);
    assert.equal(record.filtering.ignoredStrokes.length, 1);
    assert.deepEqual(record.filtering.ignoredStrokes[0].s, mark.map(p => [p.x, p.y]));
  }
  const tapOnly = await grader.grade('澡', [tinyMarks[0]]);
  assert.equal(tapOnly.pass, false);
  assert.equal(tapOnly.recordedInk[0].payload.s.length, 0);
  assert.equal(tapOnly.recordedInk[0].payload.filtering.ignoredStrokes[0].reason, 'single-point');
  const empty = await grader.grade('澡', []);
  assert.equal(empty.pass, false);
  assert.equal(empty.recordedInk.length, 0);
  console.log(JSON.stringify({ referenceChecks: positives, structuralChecks: matched, inputLoggingChecks: tinyMarks.length + 2, errors }));
  process.exitCode = errors ? 1 : 0;
}

module.exports = { structuralCases };
if (require.main === module) main().catch(e => { console.error(e); process.exitCode = 1; });
