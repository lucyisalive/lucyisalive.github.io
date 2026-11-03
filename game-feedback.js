/* 汉字魔法门：独立声音和星光反馈。无外部音频，无判分或学习进度逻辑。
   Load game-feedback.css and this script, then use window.HanziGameFeedback.
   Web Audio starts only after a user gesture; unavailable or muted audio is optional. */
(function (window, document) {
  'use strict';
  if (window.HanziGameFeedback) return;

  const CELEBRATION_MS = 2400;
  const particles = new Set();
  const timers = new Set();
  const voices = new Set();
  let context = null;
  let master = null;
  let muted = false;
  let layer = null;
  let stage = null;
  let banner = null;
  let bannerText = null;
  let bannerChar = null;
  let announcer = null;
  let celebrationTimer = null;
  let hideTimer = null;

  function later(callback, delay) {
    const handle = window.setTimeout(function () {
      timers.delete(handle);
      callback();
    }, delay);
    timers.add(handle);
    return handle;
  }

  function cancelTimer(handle) {
    if (handle == null) return;
    window.clearTimeout(handle);
    timers.delete(handle);
  }

  function prefersReducedMotion() {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
    catch (error) { return false; }
  }

  function ensureLayer() {
    if (layer && layer.isConnected) return true;
    if (!document.body) return false;
    layer = document.createElement('div');
    layer.id = 'hanzi-game-feedback';
    layer.className = 'hg-feedback';
    // These remain safe even if the optional visual stylesheet cannot be loaded.
    layer.style.pointerEvents = 'none';
    layer.style.position = 'fixed';
    layer.style.inset = '0';
    layer.style.zIndex = '9';
    stage = document.createElement('div');
    stage.className = 'hg-feedback-stage';
    stage.setAttribute('aria-hidden', 'true');
    banner = document.createElement('div');
    banner.className = 'hg-feedback-banner';
    banner.setAttribute('aria-hidden', 'true');
    banner.hidden = true;
    bannerChar = document.createElement('span');
    bannerChar.className = 'hg-feedback-character';
    bannerText = document.createElement('span');
    bannerText.className = 'hg-feedback-message';
    banner.appendChild(bannerChar);
    banner.appendChild(bannerText);
    announcer = document.createElement('span');
    announcer.className = 'hg-feedback-announcer';
    announcer.setAttribute('role', 'status');
    announcer.setAttribute('aria-live', 'polite');
    announcer.setAttribute('aria-atomic', 'true');
    layer.appendChild(stage);
    layer.appendChild(banner);
    layer.appendChild(announcer);
    document.body.appendChild(layer);
    return true;
  }

  function ensureAudio() {
    try {
      if (!context || context.state === 'closed') {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return null;
        context = new AudioContext();
        master = context.createGain();
        master.gain.value = 0.2;
        master.connect(context.destination);
      }
      return context;
    } catch (error) {
      context = null;
      master = null;
      return null;
    }
  }

  function unlock() {
    if (muted) return Promise.resolve(false);
    const audio = ensureAudio();
    if (!audio) return Promise.resolve(false);
    try {
      // A one-frame silent source primes older iPad Safari implementations. It is
      // started synchronously inside the gesture, never after an awaited operation.
      if (audio.state !== 'running') {
        const silent = audio.createBufferSource();
        silent.buffer = audio.createBuffer(1, 1, audio.sampleRate);
        silent.connect(master);
        silent.onended = function () { try { silent.disconnect(); } catch (error) {} };
        silent.start(0);
      }
      const resumed = audio.state === 'running' ? null : audio.resume();
      return Promise.resolve(resumed).then(function () {
        return audio.state === 'running';
      }, function () { return false; });
    } catch (error) { return Promise.resolve(false); }
  }

  function stopSounds() {
    voices.forEach(function (voice) {
      try {
        const now = context ? context.currentTime : 0;
        voice.gain.gain.cancelScheduledValues(now);
        voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
        voice.gain.gain.linearRampToValueAtTime(0, now + 0.012);
        voice.oscillator.stop(now + 0.015);
      } catch (error) {}
    });
    voices.clear();
  }

  function startSound(preserveExisting) {
    // Never queue a sound to replay unexpectedly when a locked/hidden iPad returns.
    if (muted || document.hidden || !context || context.state !== 'running') return null;
    if (!preserveExisting) stopSounds();
    return context.currentTime + 0.008;
  }

  function tone(frequency, start, duration, volume, type, endFrequency) {
    if (!context || !master) return;
    let oscillator = null;
    let gain = null;
    try {
      oscillator = context.createOscillator();
      gain = context.createGain();
      oscillator.type = type || 'sine';
      oscillator.frequency.setValueAtTime(frequency, start);
      if (endFrequency) oscillator.frequency.exponentialRampToValueAtTime(endFrequency, start + duration * 0.75);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(volume, start + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      oscillator.connect(gain);
      gain.connect(master);
      const voice = {oscillator: oscillator, gain: gain};
      voices.add(voice);
      oscillator.onended = function () {
        voices.delete(voice);
        try { oscillator.disconnect(); gain.disconnect(); } catch (error) {}
      };
      oscillator.start(start);
      oscillator.stop(start + duration + 0.012);
    } catch (error) {
      try { if (oscillator) oscillator.disconnect(); if (gain) gain.disconnect(); } catch (ignored) {}
    }
  }

  function bell(frequency, start, duration, volume) {
    tone(frequency, start, duration, volume, 'sine');
    tone(frequency * 2.01, start, duration * 0.58, volume * 0.15, 'sine');
  }

  function correctSound() {
    const start = startSound();
    if (start == null) return;
    bell(1046.50, start, 0.16, 0.38);
    bell(1567.98, start + 0.065, 0.18, 0.32);
    bell(2093.00, start + 0.135, 0.21, 0.30);
  }

  function wrongSound() {
    const start = startSound();
    if (start == null) return;
    // Two soft wooden catches: a door that has not opened, without a harsh buzzer.
    tone(196.00, start, 0.11, 0.38, 'triangle', 123.47);
    tone(130.81, start + 0.095, 0.18, 0.28, 'triangle', 98.00);
    tone(73.42, start + 0.1, 0.15, 0.15, 'sine');
  }

  function victorySound() {
    const base = startSound(true);
    if (base == null) return;
    // markPassed follows playCorrect: retain its small chime and answer it with
    // the victory phrase, rather than cutting it off or playing both at once.
    const start = base + 0.32;
    const notes = [
      [1046.50, 0.00, 0.18], [1318.51, 0.12, 0.18],
      [1567.98, 0.24, 0.21], [2093.00, 0.42, 0.24],
      [2637.02, 0.60, 0.22], [2093.00, 0.78, 0.32]
    ];
    notes.forEach(function (note) { bell(note[0], start + note[1], note[2], 0.28); });
    tone(523.25, start + 0.42, 0.62, 0.09, 'sine');
    tone(783.99, start + 0.42, 0.62, 0.06, 'sine');
  }

  function targetRect() {
    const ids = ['writeTile', 'writeSlot', 'doorpanel'];
    for (let i = 0; i < ids.length; i++) {
      const target = document.getElementById(ids[i]);
      if (!target || !target.getBoundingClientRect) continue;
      const rect = target.getBoundingClientRect();
      if (rect.width > 1 && rect.height > 1) return rect;
    }
    const width = window.innerWidth || 375;
    const height = window.innerHeight || 667;
    return {left: width / 2 - 120, top: height / 2 - 120, width: 240, height: 240};
  }

  function removeParticle(element) {
    particles.delete(element);
    if (element.parentNode) element.parentNode.removeChild(element);
  }

  function addParticle(element, lifetime) {
    particles.add(element);
    stage.appendChild(element);
    element.addEventListener('animationend', function () { removeParticle(element); }, {once: true});
    later(function () { removeParticle(element); }, lifetime);
  }

  function clearStars() {
    particles.forEach(function (element) { if (element.parentNode) element.parentNode.removeChild(element); });
    particles.clear();
  }

  function sparkle(large) {
    if (!ensureLayer()) return;
    clearStars();
    const rect = targetRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const reduced = prefersReducedMotion();
    const ring = document.createElement('span');
    ring.className = 'hg-feedback-ring' + (large ? ' hg-feedback-ring-victory' : '');
    ring.style.left = (rect.left - 5) + 'px';
    ring.style.top = (rect.top - 5) + 'px';
    ring.style.width = (rect.width + 10) + 'px';
    ring.style.height = (rect.height + 10) + 'px';
    addParticle(ring, reduced ? 360 : (large ? 1050 : 650));
    if (reduced) return;
    const count = large ? 24 : 12;
    const colors = ['#fff6b8', '#eac76c', '#adf2d4', '#ffffff'];
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.18;
      const x = Math.cos(angle), y = Math.sin(angle);
      const star = document.createElement('span');
      star.className = 'hg-feedback-star' + (i % 3 === 0 ? ' hg-feedback-star-small' : '');
      star.textContent = '✦';
      star.style.left = (centerX + x * rect.width * 0.37) + 'px';
      star.style.top = (centerY + y * rect.height * 0.37) + 'px';
      star.style.color = colors[i % colors.length];
      star.style.setProperty('--hg-dx', (x * (large ? 75 : 46)) + 'px');
      star.style.setProperty('--hg-dy', (y * (large ? 65 : 42) - (large ? 20 : 8)) + 'px');
      star.style.setProperty('--hg-spin', ((i % 2 ? 1 : -1) * 60) + 'deg');
      star.style.setProperty('--hg-life', (large ? 860 : 440) + 'ms');
      star.style.animationDelay = ((i % 5) * (large ? 35 : 14)) + 'ms';
      addParticle(star, large ? 1250 : 700);
    }
  }

  function hideBanner() {
    if (!banner) return;
    banner.classList.remove('hg-feedback-banner-visible');
    banner.classList.add('hg-feedback-banner-leaving');
    hideTimer = later(function () {
      banner.hidden = true;
      banner.classList.remove('hg-feedback-banner-leaving');
      bannerText.textContent = '';
      bannerChar.textContent = '';
      announcer.textContent = '';
      hideTimer = null;
    }, 180);
  }

  function playCorrect() {
    correctSound();
    sparkle(false);
    return 700;
  }

  function playWrong() {
    wrongSound();
    return 300;
  }

  function celebrate(char) {
    victorySound();
    sparkle(true);
    if (!ensureLayer()) return CELEBRATION_MS;
    cancelTimer(celebrationTimer);
    cancelTimer(hideTimer);
    const rect = targetRect();
    banner.style.top = Math.max(16, Math.min(rect.top - 106, (window.innerHeight || 667) - 120)) + 'px';
    // textContent deliberately treats caller-provided characters as plain text.
    bannerChar.textContent = typeof char === 'string' ? Array.from(char)[0] || '✦' : '✦';
    bannerText.textContent = '今天这个字学会啦，改天再考。';
    announcer.textContent = (typeof char === 'string' && char ? char + '，' : '') + bannerText.textContent;
    banner.classList.remove('hg-feedback-banner-leaving');
    banner.hidden = false;
    banner.classList.add('hg-feedback-banner-visible');
    celebrationTimer = later(function () { celebrationTimer = null; hideBanner(); }, 2200);
    return CELEBRATION_MS;
  }

  function reset() {
    timers.forEach(function (handle) { window.clearTimeout(handle); });
    timers.clear();
    celebrationTimer = hideTimer = null;
    clearStars();
    if (banner) {
      banner.hidden = true;
      banner.classList.remove('hg-feedback-banner-visible', 'hg-feedback-banner-leaving');
      bannerText.textContent = '';
      bannerChar.textContent = '';
      announcer.textContent = '';
    }
    stopSounds();
  }

  function setMuted(value) {
    muted = Boolean(value);
    if (muted) stopSounds();
    return muted;
  }

  window.HanziGameFeedback = Object.freeze({
    unlock: unlock,
    playCorrect: playCorrect,
    playWrong: playWrong,
    celebrate: celebrate,
    reset: reset,
    setMuted: setMuted,
    celebrationMs: CELEBRATION_MS
  });

  // Capturing listeners run before the game's touch handlers. A pencil stroke normally
  // unlocks sound well before asynchronous grading completes. Retrying also recovers
  // after Safari suspends audio while the iPad is locked; no sound is queued meanwhile.
  function unlockFromGesture() { if (!context || context.state !== 'running') unlock(); }
  document.addEventListener('pointerdown', unlockFromGesture, {capture: true, passive: true});
  document.addEventListener('touchend', unlockFromGesture, {capture: true, passive: true});
  document.addEventListener('keydown', unlockFromGesture, {capture: true});
  document.addEventListener('visibilitychange', function () { if (document.hidden) reset(); });
  window.addEventListener('pagehide', reset);
  if (document.body) ensureLayer();
  else document.addEventListener('DOMContentLoaded', ensureLayer, {once: true});
})(window, document);
