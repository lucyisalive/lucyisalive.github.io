'use strict';

// Reversing the drawing order of a complete connected pair must not create
// a false hook error. Removing its actual hook must still be rejected.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createGrader } = require('../tools/grader-harness.cjs');

(async () => {
  const grader = createGrader(process.argv[2] ? {html:fs.readFileSync(process.argv[2],'utf8')} : {});
  const reference = grader.reference('燕').map(s => s.map(p => [p.x,p.y]));
  for (const order of [[10,11],[11,10]]) {
    const complete = reference.slice();
    complete.splice(10,2,[...reference[order[0]],...reference[order[1]]]);
    const result = await grader.grade('燕',complete);
    assert.equal(result.pass,true,'Complete connected pair '+order+': '+result.diagnostics);

    const missingHook = complete.slice();
    missingHook[10] = [...reference[10],reference[11][0],reference[11][4]];
    const wrong = await grader.grade('燕',missingHook);
    assert.equal(wrong.pass,false,'Missing hook must fail: '+wrong.diagnostics);
  }
  console.log('燕 connected pair: both drawing orders accepted; both missing-hook variants rejected.');
})().catch(error => {console.error(error);process.exitCode=1;});
