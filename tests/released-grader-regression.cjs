'use strict';

// Protect every correct verdict in the released .5 grader. Earlier baselines
// remain useful evidence, but cannot protect fixes made after they were frozen.
// Expected answers still come from reviewed fixtures, never from the grader.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createGrader, root } = require('../tools/grader-harness.cjs');
const { buildControls: targetedControls } = require('./targeted-grader-safety.cjs');
const { buildControls: round4Controls } = require('./round4-grader-safety.cjs');
const { buildControls: realInkControls } = require('./round4-real-ink-safety.cjs');

const metadataFile = path.join(root, 'data/released-grader-baseline-2026.11.03.5.json');
const verdicts = new Set(['pass', 'fail']);
const inkHash = ink => crypto.createHash('sha256').update(JSON.stringify(ink)).digest('hex');

function buildCases(grader) {
  const cases = [];
  const ids = new Set();
  function addSuite(suite, entries, labelledOnly = false) {
    assert.ok(Array.isArray(entries), 'Missing cases in suite ' + suite);
    for (const item of entries) {
      // A device verdict or an unconfirmed user comment is not a human label.
      if (labelledOnly && (item.expect === null || item.expect === undefined)) continue;
      assert.ok(typeof item.id === 'string' && item.id, 'Missing case id in ' + suite);
      assert.ok(typeof item.target === 'string' && item.target, 'Missing target: ' + item.id);
      assert.ok(verdicts.has(item.expect), 'Invalid expected answer: ' + item.id);
      const id = suite + '/' + item.id;
      assert.ok(!ids.has(id), 'Duplicate case id: ' + id);
      ids.add(id);
      // rawS retains the exact points submitted on the iPad. The shorter s
      // recording can change a borderline verdict and must not replace rawS.
      const ink = item.rawS || item.s || item.ink;
      assert.ok(Array.isArray(ink), 'Missing ink: ' + id);
      cases.push({ id, target: item.target, expect: item.expect, ink });
    }
  }
  const humanSuites = [
    ['real-ink', 'real-ink-cases.json'],
    ['ipad-2026-11-02', 'tests/ipad-2026-11-02.json'],
    ['ipad-2026-11-02-round2', 'tests/ipad-2026-11-02-round2.json'],
    ['ipad-2026-11-03-round3', 'tests/ipad-2026-11-03-round3.json'],
    ['ipad-2026-11-03-round4', 'tests/ipad-2026-11-03-round4.json'],
  ];
  for (const [suite, file] of humanSuites) {
    addSuite(suite, JSON.parse(fs.readFileSync(path.join(root, file), 'utf8')).cases, true);
  }
  addSuite('structural-safety', JSON.parse(fs.readFileSync(path.join(root, 'tests/structural-safety.json'), 'utf8')).cases);
  addSuite('targeted', targetedControls(grader));
  addSuite('round4', round4Controls(grader));
  addSuite('round4-real-ink', realInkControls(grader));
  return cases;
}

async function evaluateCases(grader, cases) {
  assert.ok(Array.isArray(cases), 'Cases must be an array');
  const ids = new Set();
  const rows = [];
  for (const item of cases) {
    assert.ok(item && typeof item.id === 'string' && item.id, 'Missing case id');
    assert.ok(!ids.has(item.id), 'Duplicate case id: ' + item.id);
    ids.add(item.id);
    assert.ok(typeof item.target === 'string' && item.target, 'Missing target: ' + item.id);
    assert.ok(verdicts.has(item.expect), 'Invalid expected answer: ' + item.id);
    assert.ok(Array.isArray(item.ink), 'Missing ink: ' + item.id);
    const inkSha256 = inkHash(item.ink);
    const result = await grader.grade(item.target, item.ink);
    assert.equal(typeof result.pass, 'boolean', 'Invalid grader verdict: ' + item.id);
    rows.push({ id: item.id, target: item.target, expect: item.expect,
      inkSha256, actual: result.pass ? 'pass' : 'fail' });
  }
  return rows;
}

function compareRows(rows, metadata) {
  const validationErrors = [];
  if (!metadata || metadata.schemaVersion !== 1) validationErrors.push('Expected baseline schemaVersion 1');

  // Collect all structural errors in the report, without changing either input
  // or treating a changed fixture as an improvement. These errors fail the CLI.
  function indexRows(entries, name) {
    const map = new Map(), invalid = new Set();
    if (!Array.isArray(entries)) {
      validationErrors.push(name + ' rows must be an array');
      return { map, invalid };
    }
    for (const [index, row] of entries.entries()) {
      if (!row || typeof row.id !== 'string' || !row.id) {
        validationErrors.push(name + ' row ' + index + ' has no valid id');
        continue;
      }
      if (map.has(row.id)) {
        validationErrors.push(name + ' duplicate id: ' + row.id);
        invalid.add(row.id);
        continue;
      }
      map.set(row.id, row);
      for (const field of ['target', 'inkSha256']) {
        if (typeof row[field] !== 'string' || !row[field]) {
          validationErrors.push(name + ' ' + row.id + ' has invalid ' + field);
          invalid.add(row.id);
        }
      }
      for (const field of ['expect', 'actual']) {
        if (!verdicts.has(row[field])) {
          validationErrors.push(name + ' ' + row.id + ' has invalid ' + field);
          invalid.add(row.id);
        }
      }
    }
    return { map, invalid };
  }
  const current = indexRows(rows, 'Current');
  const baseline = indexRows(metadata?.rows, 'Baseline');
  const regressions = [], inheritedErrors = [], improvements = [], newFailures = [], newCorrect = [];

  for (const id of baseline.map.keys()) {
    if (!current.map.has(id)) validationErrors.push('Missing frozen case: ' + id);
  }
  for (const [id, row] of current.map) {
    if (current.invalid.has(id) || baseline.invalid.has(id)) continue;
    const before = baseline.map.get(id);
    if (!before) {
      (row.actual === row.expect ? newCorrect : newFailures).push(id);
      continue;
    }
    let unchanged = true;
    for (const field of ['target', 'expect', 'inkSha256']) {
      if (row[field] !== before[field]) {
        validationErrors.push('Frozen case ' + id + ' changed ' + field);
        unchanged = false;
      }
    }
    if (!unchanged) continue;
    if (before.actual === before.expect) {
      if (row.actual !== row.expect) regressions.push(id);
    } else {
      (row.actual === row.expect ? improvements : inheritedErrors).push(id);
    }
  }
  const validCurrent = [...current.map.values()].filter(row => !current.invalid.has(row.id));
  const validBaseline = [...baseline.map.values()].filter(row => !baseline.invalid.has(row.id));
  return {
    total: Array.isArray(rows) ? rows.length : 0,
    correct: validCurrent.filter(row => row.actual === row.expect).length,
    baselineTotal: Array.isArray(metadata?.rows) ? metadata.rows.length : 0,
    protected: validBaseline.filter(row => row.actual === row.expect).length,
    baselineErrors: validBaseline.filter(row => row.actual !== row.expect).length,
    regressions, inheritedErrors, improvements, newFailures, newCorrect, validationErrors,
    ok: !regressions.length && !newFailures.length && !validationErrors.length,
  };
}

async function main(args = process.argv.slice(2)) {
  assert.ok(args.length <= 2 && args.every(arg => !arg.startsWith('-')),
    'Usage: node tests/released-grader-regression.cjs [input.html] [report.json]; no baseline-writing options are supported');
  const input = args[0] || 'index.html';
  const metadata = JSON.parse(fs.readFileSync(metadataFile, 'utf8'));
  const reportFile = args[1] ? path.resolve(root, args[1]) : null;
  if (reportFile) {
    const reportTarget = fs.existsSync(reportFile) ? fs.realpathSync(reportFile) : reportFile;
    assert.notEqual(reportTarget, fs.realpathSync(metadataFile), 'A report must not overwrite the frozen baseline');
  }
  assert.equal(metadata.sourceVersion, '2026.11.03.5', 'Unexpected frozen release version');
  assert.match(metadata.sourceCommit, /^[a-f0-9]{40}$/, 'Missing frozen release commit');
  assert.match(metadata.sourceHtmlSha256, /^[a-f0-9]{64}$/, 'Missing frozen release HTML hash');
  assert.ok(Array.isArray(metadata.rows) && metadata.rows.length, 'Frozen baseline has no cases');
  const grader = createGrader({ html: fs.readFileSync(path.resolve(root, input), 'utf8') });
  const rows = await evaluateCases(grader, buildCases(grader));
  const summary = compareRows(rows, metadata);
  if (reportFile) fs.writeFileSync(reportFile, JSON.stringify({ summary, rows }, null, 2) + '\n');
  console.log(JSON.stringify(summary, null, 2));
  process.exitCode = summary.ok ? 0 : 1;
  return { summary, rows };
}

module.exports = { buildCases, evaluateCases, compareRows, main };
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
