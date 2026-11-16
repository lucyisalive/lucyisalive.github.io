(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HanziParentValidation = factory();
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  // This is a small adult recognition check, not a child learning assessment.
  // All expected answers below require the adult's explicit confirmation that
  // the submitted writing followed the instruction. Machine verdicts are never
  // promoted to human labels on their own.
  const ROUNDS = {
    1: [
      ['燕', 'yàn', '燕子', '请按平常的写法，完整、正确地写一个「燕」。', 'pass', null],
      ['燕', 'yàn', '燕子', '请故意少写「燕」四点底中的一个点，其他笔画照常写。', 'fail', 'missing-bottom-dot'],
      ['类', 'lèi', '种类', '请按平常的写法，完整、正确地写一个「类」。', 'pass', null],
      ['类', 'lèi', '种类', '请故意少写「类」上半部「米」左上方的点，其他笔画照常写。', 'fail', 'missing-mi-upper-left-dot'],
      ['逃', 'táo', '逃生', '请按平常的写法，完整、正确地写一个「逃」。', 'pass', null],
      ['逃', 'táo', '逃生', '请故意少写「逃」走之旁最上方的点，其他笔画照常写。', 'fail', 'missing-walking-top-dot'],
    ],
    2: [
      ['辩', 'biàn', '辩论', '请按平常的写法，完整、正确地写一个「辩」。', 'pass', null],
      ['辩', 'biàn', '辩论', '请故意少写「辩」中间「讠」的点，其他笔画照常写。', 'fail', 'missing-middle-speech-dot'],
      ['历', 'lì', '历史', '请按平常的写法，完整、正确地写一个「历」。', 'pass', null],
      ['历', 'lì', '历史', '请故意少写「历」里面「力」的撇，其他笔画照常写。', 'fail', 'missing-inner-li-left-falling'],
      ['收', 'shōu', '收拾', '请按平常的写法，完整、正确地写一个「收」。', 'pass', null],
      ['收', 'shōu', '收拾', '请故意少写「收」右边「攵」最上方的短撇，其他笔画照常写。', 'fail', 'missing-puwen-top-left-falling'],
    ],
  };

  function create(options) {
    if (!options || typeof options !== 'object') throw new TypeError('验收设置必须是对象');
    const round = options.round;
    if (round !== 1 && round !== 2) throw new RangeError('识别验收轮次只能是 1 或 2');
    const now = options.now === undefined ? Date.now : options.now;
    const random = options.random === undefined ? Math.random : options.random;
    if (typeof now !== 'function' || typeof random !== 'function') throw new TypeError('now 和 random 必须是函数');
    function readTime() {
      const value = now();
      if (!Number.isSafeInteger(value) || value < 0) throw new RangeError('now 必须返回有效的毫秒时间');
      return value;
    }
    const startedAt = readTime(), entropy = random();
    if (typeof entropy !== 'number' || !Number.isFinite(entropy) || entropy < 0 || entropy >= 1) {
      throw new RangeError('random 必须返回大于等于 0、小于 1 的数');
    }
    const id = 'pv' + round + '-' + startedAt.toString(36) + '-' + Math.floor(entropy * 4294967296).toString(36).padStart(7, '0');
    const steps = Object.freeze(ROUNDS[round].map((row, index) => Object.freeze({
      id: id + '-step-' + (index + 1), round, position: index + 1,
      char: row[0], pinyin: row[1], word: row[2], instruction: row[3], expected: row[4], fault: row[5],
    })));
    let index = 0;
    const results = [], seenAttempts = new Set();
    const current = () => steps[index] || null;
    const finished = () => index === steps.length;
    function rejected(reason) {
      return { accepted: false, advanced: false, matched: null, reason, finished: finished(), next: current() };
    }

    // Record contract: {id, sessionId, stepId, char, verdict, timestamp?, graderVersion?}.
    // The caller maps its real ink record into these small fields. Never copy raw
    // handwriting into this module; the isolated ink log owns that evidence.
    function confirm(record, followedInstruction) {
      if (typeof followedInstruction !== 'boolean') return rejected('confirmation-required');
      if (!record || typeof record !== 'object') return rejected('invalid-record');
      if (typeof record.id !== 'string' || !record.id.trim() || record.id.length > 160) return rejected('invalid-attempt-id');
      if (seenAttempts.has(record.id)) return rejected('duplicate-attempt');
      if (finished()) return rejected('finished');
      const step = current();
      if (record.sessionId !== id) return rejected('wrong-session');
      if (record.stepId !== step.id) return rejected('wrong-step');
      if (record.char !== step.char) return rejected('wrong-character');
      if (record.verdict !== 'pass' && record.verdict !== 'fail') return rejected('invalid-verdict');
      if (record.timestamp !== undefined && record.timestamp !== null &&
          (!Number.isSafeInteger(record.timestamp) || record.timestamp < 0)) return rejected('invalid-timestamp');
      if (record.graderVersion !== undefined && record.graderVersion !== null &&
          (typeof record.graderVersion !== 'string' || record.graderVersion.length > 80)) return rejected('invalid-version');
      const humanExpected = followedInstruction ? step.expected : null;
      const matched = humanExpected === null ? null : record.verdict === humanExpected;
      const result = Object.freeze({
        attemptId: record.id, sessionId: id, stepId: step.id, stepIndex: index,
        round, char: step.char, word: step.word, fault: step.fault,
        instructionExpected: step.expected, originalVerdict: record.verdict,
        followedInstruction, humanExpected, matched,
        timestamp: record.timestamp === undefined ? null : record.timestamp,
        graderVersion: record.graderVersion === undefined ? null : record.graderVersion,
        confirmedAt: readTime(),
      });
      results.push(result);
      seenAttempts.add(record.id);
      if (followedInstruction) index += 1;
      return { accepted: true, advanced: followedInstruction, matched, result,
        finished: finished(), next: current() };
    }

    function summary() {
      const scored = results.filter(result => result.humanExpected !== null);
      const matched = scored.filter(result => result.matched).length;
      return {
        scope: 'parent-recognition-validation',
        title: '识别验收第' + (round === 1 ? '一' : '二') + '轮',
        boundary: '本轮仅验收识别；完整教学流程另行验收，结果不代表已经适合孩子使用。',
        id, round, totalSteps: steps.length, confirmedSteps: index,
        attempts: results.length, unconfirmedAttempts: results.length - scored.length,
        scored: scored.length, matched, mismatched: scored.length - matched,
        accuracy: scored.length ? matched / scored.length : null,
        finished: finished(),
        allMatched: finished() && scored.length === steps.length && matched === steps.length,
      };
    }
    function serialize() {
      // Return independent JSON-safe data; callers may annotate an exported copy.
      return JSON.parse(JSON.stringify({
        schemaVersion: 1, kind: 'parent-recognition-validation', id, round, startedAt,
        index, steps, results, summary: summary(),
      }));
    }
    return Object.freeze({
      id, round, steps,
      get index() { return index; },
      get results() { return Object.freeze(results.slice()); },
      current, confirm, finished, summary, serialize,
    });
  }

  return Object.freeze({ create });
});
