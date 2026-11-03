'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createGrader, root } = require('../tools/grader-harness.cjs');

async function main() {
  const files = process.argv.slice(2);
  if (!files.length) files.push('real-ink-cases.json', 'tests/ipad-2026-11-02.json',
    'tests/ipad-2026-11-02-round2.json', 'tests/ipad-2026-11-03-round3.json',
    'tests/ipad-2026-11-03-round4.json');
  const grader = createGrader();
  let matched = 0, failed = 0, unlabelled = 0;
  for (const file of files) {
    const data = JSON.parse(fs.readFileSync(path.resolve(root, file), 'utf8'));
    for (const c of data.cases) {
      if (c.expect === null || c.expect === undefined) {
        unlabelled++;
        continue;
      }
      assert.ok(c.expect === 'pass' || c.expect === 'fail', 'Invalid human label: ' + c.id);
      // New records preserve the exact submitted points. Older s-only records
      // are lossy evidence: re-sampling and rounding can flip borderline grades.
      const result = await grader.grade(c.target, c.rawS || c.s);
      const actual = result.pass ? 'pass' : 'fail';
      if (actual === c.expect) {
        matched++;
        console.log('OK ' + c.id);
      } else {
        failed++;
        console.log(`FAIL ${c.id}: expected=${c.expect} actual=${actual}${c.known_fail ? ' (previously known)' : ''}`);
        console.log(result.diagnostics);
      }
    }
  }
  console.log(JSON.stringify({ matched, failed, unlabelled }));
  // Known failures remain visible failures; adding a fixture must not bless a bug.
  process.exitCode = failed ? 1 : 0;
}

main().catch(e => { console.error(e); process.exitCode = 1; });
