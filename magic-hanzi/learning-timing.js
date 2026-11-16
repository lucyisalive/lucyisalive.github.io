(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HanziLearningTiming = factory();
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  const ORIGINAL_STEPS = [5, 3, 1, 0];

  // Presentation seconds only. The caller supplies the existing stroke count
  // and starts the clock after the character is actually ready to be shown.
  function steps(strokeCount) {
    if (!Number.isSafeInteger(strokeCount) || strokeCount <= 0) return ORIGINAL_STEPS.slice();
    const first = Math.max(5, Math.min(12,
      Math.round(5 + Math.max(0, strokeCount - 6) * 0.4)));
    return [first, Math.round(first * 0.6), Math.round(first * 0.2), 0];
  }

  return Object.freeze({ steps });
});
