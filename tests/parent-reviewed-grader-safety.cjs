'use strict';

// All controls are generated from public reference medians. The fallback
// medians are from hanzi-writer-data 2.0.1, the same package used by the game,
// under ARPHICPL.TXT. The test runs without requesting glyphs over the network.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createGrader } = require('../tools/grader-harness.cjs');
const extraGlyphs = require('./parent-reviewed-fallback-medians.json');

const reassignmentWarps = {
  '建': [[1, .52, -8, 8, 5], [2, .52, 0, 8, -13], [3, .46, 9, 8, 13], [4, .51, 0, 0, -12]],
  '姿': [[0, 1.7, 8, 0, 50], [1, .42, -9, -8, 34], [2, .8, 12, -20, 0],
    [3, 1, 0, -9, -6], [4, .63, 26, -23, 5], [5, .4, 6, -29, -10]],
};

function mean(stroke) {
  return stroke.reduce(([x, y], [px, py]) => [x + px / stroke.length, y + py / stroke.length], [0, 0]);
}

function warp(stroke, scale, dx, dy, degrees) {
  const [cx, cy] = mean(stroke);
  const radians = degrees * Math.PI / 180;
  const cos = Math.cos(radians), sin = Math.sin(radians);
  return stroke.map(([x, y]) => {
    const u = (x - cx) * scale, v = (y - cy) * scale;
    return [cx + u * cos - v * sin + dx, cy + u * sin + v * cos + dy];
  });
}

function span(ink, axis) {
  const values = ink.flat().map(point => point[axis]);
  return [Math.min(...values), Math.max(...values)];
}

function line([cx, cy], dx, dy) {
  return Array.from({ length: 14 }, (_, i) => [cx + dx * (i / 13 - .5), cy + dy * (i / 13 - .5)]);
}

function replace(ink, role, stroke) {
  return ink.map((original, i) => i === role ? stroke : original);
}

function buildControls(grader) {
  const cases = [];
  const refs = {};
  for (const target of ['建', '姿', '瞧', '当', '舒', '侧']) {
    refs[target] = grader.reference(target).map(stroke => stroke.map(p => [p.x, p.y]));
    cases.push({ target, id: 'reference', expect: true, ink: refs[target] });
  }
  function add(target, id, expect, ink) {
    cases.push({ target, id, expect, ink });
  }
  for (const [char, warps] of Object.entries(reassignmentWarps)) {
    const roleWarps = new Map(warps.map(([role, ...parameters]) => [role, parameters]));
    const ink = refs[char].map((stroke, role) => roleWarps.has(role) ? warp(stroke, ...roleWarps.get(role)) : stroke);
    add(char, 'valid-spatial-reassignment', true, ink);
    add(char, 'valid-reassignment-reordered', true, ink.slice().reverse());
    for (let i = 0; i < ink.length; i++) add(char, 'missing-' + i, false, ink.filter((_, j) => j !== i));
  }

  const qiao = refs['瞧'], [x, y] = qiao[6][0];
  const qiaoCenter = [x + 5, y - 12];
  const qiaoShort = replace(qiao, 5, line(qiaoCenter, -22, 20));
  add('瞧', 'short-left-falling-stroke', true, qiaoShort);
  add('瞧', 'vertical-in-place-of-left-falling-stroke', false, replace(qiao, 5, line(qiaoCenter, 0, 23)));
  add('瞧', 'inner-horizontal-outside-eye-frame', false,
    replace(qiaoShort, 2, qiao[2].map(([x, y]) => [x, y - 45])));
  const [eyeFoldX] = mean(qiao[1]);
  add('瞧', 'mirrored-eye-fold', false,
    replace(qiaoShort, 1, qiao[1].map(([x, y]) => [2 * eyeFoldX - x, y])));
  add('瞧', 'central-vertical-detached-from-horizontal-strokes', false,
    replace(qiaoShort, 11, qiao[11].map(([x, y]) => [x + 45, y])));
  add('瞧', 'last-dot-detached-from-bottom', false,
    replace(qiaoShort, 16, qiao[16].map(([x, y]) => [x + 80, y])));

  const dang = refs['当'], dangCenter = mean(dang[2]);
  const dangUpright = replace(dang, 2, line(dangCenter, -3, 25));
  add('当', 'short-upright-right-stroke', true, dangUpright);
  add('当', 'horizontal-in-place-of-right-stroke', false, replace(dang, 2, line(dangCenter, 25, 0)));
  add('当', 'horizontal-in-place-of-left-mark', false, replace(dangUpright, 1, line(mean(dang[1]), 25, 0)));
  add('当', 'inner-horizontal-outside-lower-fold', false,
    replace(dangUpright, 4, dang[4].map(([x, y]) => [x + 45, y])));

  const ce = refs['侧'], [ceLeft, ceRight] = span(ce, 0);
  const ceWidth = ceRight - ceLeft;
  const sideStem = offset => ce[1].map(([x, y]) => [x + ceWidth * offset, y]);
  add('侧', 'left-stem-moved-into-middle', false, replace(ce, 1, sideStem(.22)));
  const stem = sideStem(.13), half = Math.floor(stem.length / 2);
  add('侧', 'legitimate-split-left-stem', true, [ce[0], stem.slice(0, half + 1), stem.slice(half), ...ce.slice(2)]);

  const shu = refs['舒'], [shuLeft, shuRight] = span(shu, 0);
  const [stemTop, stemBottom] = span([shu[11]], 1), stemMid = (stemTop + stemBottom) / 2;
  const damaged = shu.map((stroke, i) => {
    if (i === 8 || i === 9) return stroke.map(([x, y]) => [x - .42 * (shuRight - shuLeft), y]);
    if (i === 11) return stroke.map(([x, y]) => [x, stemMid + (y - stemMid) * .28]);
    return stroke;
  });
  add('舒', 'right-component-stem-and-position-wrong', false, damaged);
  const [top, bottom] = span(shu.slice(8), 1), mid = (top + bottom) / 2;
  add('舒', 'small-intact-right-component', true,
    shu.map((stroke, i) => i < 8 ? stroke : stroke.map(([x, y]) => [x, mid + (y - mid) * .55])));
  return cases;
}

async function main(input) {
  const html = input ? fs.readFileSync(input, 'utf8') : undefined;
  const grader = createGrader({ html, extraGlyphs });
  const cases = buildControls(grader);
  const failed = [];
  for (const test of cases) {
    if ((await grader.grade(test.target, test.ink)).pass !== test.expect) failed.push(test.target + '/' + test.id);
  }
  assert.deepEqual(failed, []);
  console.log(`Parent-reviewed grader safety: ${cases.length} reference-derived controls passed.`);
}

if (require.main === module) main(process.argv[2]).catch(error => { console.error(error); process.exitCode = 1; });
