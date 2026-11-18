/* Tomb Hall and Underwater Mermaid are independent visual scenes. */
(function (window) {
  'use strict';

  const GUARDIANS = [
    {
      name: 'lion', colors: ['#d4b16d', '#a26d37', '#48301c'],
      body: 'M13 59Q3 48 9 32Q11 27 16 26L21 31 17 38 13 36Q8 48 20 52Q28 38 55 41L60 32 60 20 66 18 70 15 78 18 82 25 90 26 94 33 92 39 82 41 77 48 70 50 67 71 75 77 59 77 55 56 33 55 29 69 36 76 20 76 19 62Z',
      detail: 'M63 27Q58 41 70 48 M68 24Q68 34 77 38 M28 46Q42 41 57 48 M81 39 89 35',
      eye: [81, 29]
    },
    {
      name: 'tiger', colors: ['#efaf60', '#98501e', '#35241d'],
      body: 'M6 41Q6 56 19 52Q26 34 57 39L67 37 69 25 76 23 82 27 89 25 90 31 98 36 95 43 82 47 74 53 69 71 77 77 62 77 55 56 36 55 26 70 32 77 17 77 19 61Q3 61 3 47Z',
      detail: 'M29 43 33 51 M39 40 41 52 M49 41 50 53 M60 42 60 54 M70 38 75 43 M83 36 87 39',
      eye: [87, 33]
    },
    {
      name: 'wolf', colors: ['#c8cfcd', '#656b6e', '#313132'],
      body: 'M13 63Q4 54 5 41Q11 47 19 49C26 38 44 37 59 38L66 26 72 15 79 22 87 20 87 27 96 32 92 39 81 42 73 50 71 72 77 77 59 77 56 56 36 54 29 69 34 77 19 77 18 63Z',
      detail: 'M22 51Q44 42 62 45L70 49 M63 39 71 32 77 34 M21 62 30 55 M81 41 89 37',
      eye: [83, 29]
    },
    {
      name: 'bear', colors: ['#ba8d63', '#634735', '#33271f'],
      body: 'M13 74 13 61Q7 54 12 42 17 25 39 25 50 25 63 35L68 28 69 22 74 19 79 24 86 24 91 31 98 35 97 44 85 49 77 53 73 71 80 76 61 77 57 59 39 56 33 66 37 76 17 76Z',
      detail: 'M24 31Q40 25 57 39 M63 42 66 54 M85 46 95 42 M33 53 25 62',
      eye: [85, 32]
    },
    {
      name: 'panther', colors: ['#a1b3bf', '#536679', '#212834'],
      body: 'M5 57Q3 45 9 37L14 37Q8 48 15 51L22 49Q28 36 50 36L66 40Q73 29 76 29L77 23 84 25 86 29 93 31 96 38 90 44 83 45 75 52 72 67 79 76 63 76 59 55 39 56 30 70 37 77 22 77 21 58 13 61Z',
      detail: 'M27 46Q41 40 57 42 M79 34 88 35 M76 46 65 49 M24 59 34 53',
      eye: [86, 34]
    },
    {
      name: 'hyena', colors: ['#ddb384', '#875739', '#432c22'],
      body: 'M9 57 16 54Q24 49 35 44L46 32 61 30 66 21 73 18 77 27 82 24 86 25 87 34 98 39 94 47 78 49 68 55 66 71 74 77 57 77 53 56 34 60 28 71 33 76 16 76 18 62Z',
      detail: 'M31 53 32 55 M36 46 38 48 M42 45 44 47 M49 38 51 40 M52 47 55 49 M58 39 60 41 M60 51 62 53',
      eye: [87, 35]
    },
    {
      name: 'crocodile', colors: ['#b4a973', '#6a6d43', '#2b322b'],
      body: 'M3 63Q15 67 26 60L32 53 39 50 43 45 48 49 54 45 60 50 68 48 75 44 83 50 98 50 100 55 91 58 98 60 94 65 77 67 65 64 62 74 67 77 53 77 50 67 40 66 34 76 20 76 27 68Q11 73 2 67Z',
      detail: 'M40 56 46 53 51 56 56 52 62 56 68 55 M77 58 84 60 89 57 92 59 96 57',
      eye: [77, 51]
    },
    {
      name: 'boar', colors: ['#bc8f7a', '#735145', '#332422'],
      body: 'M13 62Q7 56 9 47L12 44 16 50 21 48 25 38 34 29 40 29 45 24 54 26 58 24 69 33 74 26 80 30 81 39 88 42 98 44 98 53 91 57 82 57 74 61 72 75 61 77 60 62 41 61 33 74 23 76 26 61Z M84 52Q94 56 96 47Q98 58 88 61Z',
      detail: 'M30 40Q47 31 65 40 M69 43 77 47 M82 54 91 52',
      eye: [81, 43]
    },
    {
      name: 'rhinoceros', colors: ['#bcb9aa', '#78776d', '#383b34'],
      body: 'M12 65Q9 51 15 40Q22 28 43 30 56 27 67 39L74 37 80 45 85 46 95 24 97 25 95 48 99 54 95 62 77 66 74 77 60 77 57 61 39 61 35 76 22 76 23 62 17 57 15 66Z',
      detail: 'M30 36 27 46 33 57 M57 36 62 47 58 57 M72 45 79 48 81 56 M87 60 96 56',
      eye: [80, 49]
    },
    {
      name: 'eagle', colors: ['#d3a46b', '#81623f', '#3a2d24'],
      body: 'M32 75 43 63Q33 45 40 33L25 20 16 2 43 13 57 27 62 28Q66 16 78 19L86 25 96 27 93 33 84 34 76 44 70 59 61 67 74 73 70 77 58 75 51 78 43 75Z',
      detail: 'M29 14 40 26 49 30 M40 39Q47 33 58 40L62 46 53 61 M43 46 52 50 M41 53 49 58 M78 28 88 31',
      eye: [82, 26]
    }
  ];

  const NOTE_POSITIONS = [
    [12, 59], [20, 47], [29, 56], [38, 42], [46, 49],
    [54, 36], [62, 43], [71, 30], [80, 36], [88, 25]
  ];
  // Left rank centers and floor positions, from the entrance toward the door.
  // The right rank mirrors these coordinates. Each row has its own depth clearance.
  const GUARD_ROWS = [
    [13, 79.2, 13.5, .065], [19.5, 71.7, 11.6, .053],
    [24.8, 65.6, 10.1, .042], [29, 60.7, 8.8, .034],
    [32.4, 56.7, 7.7, .033]
  ];
  const GUARD_SPREAD = [9, 5, 7, 8, 5, 7, 10, 7, 4, 8];
  const GUARD_ATLASES = [
    { url: 'assets/story/fierce-guards-a.webp', width: 1536, height: 1024 },
    { url: 'assets/story/fierce-guards-b.webp', width: 1536, height: 1024 }
  ];
  // Each entry is the bounds of one animal and the position of its eye in the crop.
  const GUARD_SPRITES = [
    [0, 26, 505, 454, 86.3, 23.4], [513, 129, 504, 332, 85.5, 44.6],
    [1045, 27, 491, 436, 86.6, 20], [4, 549, 500, 459, 83.6, 25.3],
    [512, 582, 518, 400, 85.7, 41.8],
    [25, 75, 483, 372, 87.8, 25.5], [510, 162, 514, 248, 78.2, 13.3],
    [1038, 66, 492, 368, 77.6, 37.8], [3, 579, 510, 380, 76.1, 45.8],
    [517, 552, 506, 429, 88.1, 28.2]
  ];
  const NOTES = [293.66, 349.23, 392, 440, 523.25, 587.33, 523.25, 440, 392, 440];
  const TOMB_EXIT_MS = 3040;
  const SEA_EXIT_MS = 3160;

  function drawGuardian(canvas, guardian, facingRight) {
    if (!window.Path2D) return;
    const ctx = canvas?.getContext?.('2d');
    if (!ctx) return;
    ctx.scale(2, 2);
    if (!facingRight) {
      ctx.translate(108, 0);
      ctx.scale(-1, 1);
    }
    ctx.translate(4, 9);
    const [light, middle, dark] = guardian.colors;
    const color = ctx.createLinearGradient(18, 8, 66, 74);
    color.addColorStop(0, light);
    color.addColorStop(0.48, middle);
    color.addColorStop(1, dark);
    const shape = new window.Path2D(guardian.body);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.fillStyle = color;
    ctx.fill(shape);
    ctx.strokeStyle = light;
    ctx.globalAlpha = 0.82;
    ctx.lineWidth = 1;
    ctx.stroke(shape);
    ctx.globalAlpha = 0.72;
    ctx.lineWidth = 1.3;
    ctx.stroke(new window.Path2D(guardian.detail));
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#fff0b1';
    ctx.shadowColor = light;
    ctx.shadowBlur = 4;
    ctx.beginPath();
    ctx.arc(guardian.eye[0], guardian.eye[1], 1.45, 0, 2 * Math.PI);
    ctx.fill();
  }

  function guardianMarkup(guardian, index) {
    const row = Math.floor(index / 2);
    const [x, y, size, clearance] = GUARD_ROWS[row];
    const [spriteX, spriteY, spriteWidth, spriteHeight, eyeX, eyeY] = GUARD_SPRITES[index];
    const atlas = GUARD_ATLASES[Math.floor(index / 5)];
    const onRight = index % 2 === 1;
    const style = `
      --guard-x:${onRight ? 100 - x : x}%;
      --guard-y:${y}%;
      --guard-size:${size}%;
      --guard-clearance:${clearance};
      --guard-depth:${GUARD_ROWS.length - row};
      --guard-phase:${(index * -.71).toFixed(2)}s;
      --guard-pace:${(4.1 + index * .17).toFixed(2)}s;
      --guard-lurch:${GUARD_SPREAD[index] * (onRight ? -1 : 1)}%;
      --sprite-x:${spriteX / (atlas.width - spriteWidth) * 100}%;
      --sprite-y:${spriteY / (atlas.height - spriteHeight) * 100}%;
      --sprite-size:${atlas.width / spriteWidth * 100}% ${atlas.height / spriteHeight * 100}%;
      --sprite-ratio:${spriteWidth} / ${spriteHeight};
      --sprite-aspect:${(spriteWidth / spriteHeight).toFixed(4)};
      --sprite-facing:${onRight ? -1 : 1};
      --sprite-eye-x:${eyeX}%;
      --sprite-eye-y:${eyeY}%`;
    return `<div class="deep-guard" data-species="${guardian.name}" data-atlas="${Math.floor(index / 5)}" style="${style}"><i></i><div class="deep-guard-shape"><canvas width="216" height="176"></canvas><span></span></div><b></b></div>`;
  }

  function create({ document: doc }) {
    const tomb = doc.createElement('div');
    tomb.className = 'story-scene story-tomb';
    tomb.setAttribute('aria-hidden', 'true');
    tomb.innerHTML = `
      <div class="deep-frame deep-tomb-frame">
        <div class="deep-tomb-world">
          <div class="deep-tomb-set">
            <div class="deep-tomb-art"></div>
            <div class="deep-door">
              <div class="deep-flooded-stair"></div>
              <i class="deep-door-leaf"></i><i class="deep-door-leaf"></i>
            </div>
          </div>
          <div class="deep-guards">${GUARDIANS.map(guardianMarkup).join('')}</div>
        </div>
        <div class="deep-tomb-dive"></div>
      </div>`;
    doc.body.insertBefore(tomb, doc.body.firstChild);
    const guards = Array.from(tomb.querySelectorAll('.deep-guard'));
    guards.forEach((guard, index) => drawGuardian(guard.querySelector('canvas'), GUARDIANS[index], index % 2 === 0));
    if (typeof window.Image === 'function') {
      GUARD_ATLASES.forEach(({ url }, index) => {
        const sprite = new window.Image();
        sprite.onload = () => {
          tomb.style.setProperty('--deep-guardian-sprite-' + index, 'url("' + url + '")');
          tomb.classList.add('has-guardian-art-' + index);
        };
        sprite.src = url;
      });
    }

    const sea = doc.createElement('div');
    sea.className = 'story-scene story-sea';
    sea.setAttribute('aria-hidden', 'true');
    sea.innerHTML = `
      <div class="deep-frame deep-sea-frame">
        <div class="deep-sea-world">
          <div class="deep-sea-art"></div>
          <div class="deep-caustics"></div>
          <div class="deep-sea-bubbles">${Array.from({ length: 9 }, (_, i) =>
            `<i style="--bubble-x:${9 + i * 10}%;--bubble-size:${4 + i % 4 * 2}px;--bubble-delay:${i * -.73}s"></i>`
          ).join('')}</div>
          <div class="deep-notes">${NOTE_POSITIONS.map(([x, y], index) =>
            `<i class="deep-note" hidden style="--note-x:${x}%;--note-y:${y}%;--note-delay:${(index * .18 + .4).toFixed(2)}s">♪</i>`
          ).join('')}</div>
          <div class="deep-mermaid"><img src="assets/story/mermaid.webp" alt="" draggable="false"></div>
        </div>
        <div class="deep-surface"><div class="deep-surface-reflection"></div></div>
        <div class="deep-waterline"></div>
      </div>`;
    doc.body.insertBefore(sea, doc.body.firstChild);
    const notes = Array.from(sea.querySelectorAll('.deep-note'));
    const counts = { tomb: 0, sea: 0 };
    let audio;
    let master;
    const voices = new Set();

    function unlock(event) {
      if (doc.hidden || event?.isTrusted === false || event?.target?.closest?.('#speakBtn, #sentenceBtn')) return;
      if (!['tomb', 'sea'].includes(doc.body.dataset.herbStage)) return;
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        if (!audio || audio.state === 'closed') {
          audio = new AudioContext();
          master = audio.createGain();
          master.gain.value = 0.24;
          master.connect(audio.destination);
        }
        if (audio.state !== 'running') {
          try {
            const silent = audio.createBufferSource();
            silent.buffer = audio.createBuffer(1, 1, audio.sampleRate);
            silent.connect(master);
            silent.onended = () => { try { silent.disconnect(); } catch (_) {} };
            silent.start(0);
          } catch (_) { /* Still try to resume when a browser refuses the silent source. */ }
          Promise.resolve(audio.resume()).catch(() => {});
        }
      } catch (_) { /* Audio is optional. */ }
    }
    doc.addEventListener('pointerdown', unlock, { capture: true, passive: true });
    doc.addEventListener('pointerup', event => {
      if (event.pointerType !== 'mouse') unlock(event);
    }, { capture: true, passive: true });
    doc.addEventListener('touchend', unlock, { capture: true, passive: true });
    doc.addEventListener('keydown', unlock, { capture: true });

    function voice(frequency, start, duration, sung) {
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = sung ? 'triangle' : 'sine';
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.exponentialRampToValueAtTime(sung ? 0.36 : 0.31, start + (sung ? .10 : .025));
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
      let vowel;
      let vibrato;
      let depth;
      if (sung) {
        // A filtered, gently vibrating voice for the mermaid's wordless call.
        vowel = audio.createBiquadFilter();
        vowel.type = 'lowpass';
        vowel.frequency.value = 1050;
        vowel.Q.value = 1.9;
        oscillator.connect(vowel);
        vowel.connect(gain);
        vibrato = audio.createOscillator();
        depth = audio.createGain();
        vibrato.frequency.value = 5.3;
        depth.gain.value = 3.4;
        vibrato.connect(depth);
        depth.connect(oscillator.frequency);
        vibrato.start(start);
        vibrato.stop(start + duration);
      } else oscillator.connect(gain);
      gain.connect(master);
      voices.add(oscillator);
      oscillator.onended = () => {
        voices.delete(oscillator);
        [oscillator, gain, vowel, vibrato, depth].forEach(node => node?.disconnect());
      };
      oscillator.start(start);
      oscillator.stop(start + duration);
    }

    function playNote(index) {
      if (!audio || audio.state !== 'running' || doc.hidden) return;
      try {
        const now = audio.currentTime + .02;
        voice(NOTES[index], now, .38, false);
        voice(NOTES[index] * 2, now + .05, .19, false);
        if (index === NOTES.length - 1) {
          const melody = [392, 440, 523.25, 587.33, 523.25, 440, 392, 349.23, 392, 293.66];
          melody.forEach((frequency, note) => voice(frequency, now + .40 + note * .18, note === 9 ? .95 : .32, true));
        }
      } catch (_) { /* Muting or suspending audio never blocks progress. */ }
    }

    function playGrowl() {
      if (!audio || audio.state !== 'running' || doc.hidden) return;
      try {
        const now = audio.currentTime + .012;
        const oscillator = audio.createOscillator();
        const filter = audio.createBiquadFilter();
        const gain = audio.createGain();
        oscillator.type = 'sawtooth';
        oscillator.frequency.setValueAtTime(92, now);
        oscillator.frequency.linearRampToValueAtTime(71, now + .18);
        oscillator.frequency.exponentialRampToValueAtTime(43, now + .66);
        filter.type = 'lowpass';
        filter.frequency.value = 245;
        filter.Q.value = 1.6;
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.exponentialRampToValueAtTime(0.26, now + .15);
        gain.gain.exponentialRampToValueAtTime(0.001, now + .69);
        oscillator.connect(filter);
        filter.connect(gain);
        gain.connect(master);
        voices.add(oscillator);
        oscillator.onended = () => {
          voices.delete(oscillator);
          [oscillator, filter, gain].forEach(node => node.disconnect());
        };
        oscillator.start(now);
        oscillator.stop(now + .70);
      } catch (_) { /* Sound is optional. */ }
    }

    function stopSounds() {
      for (const oscillator of voices) {
        try { oscillator.stop(); }
        catch (_) { /* An ended source may still be awaiting cleanup. */ }
      }
    }
    function releaseAudio() {
      stopSounds();
      voices.clear();
      const previous = audio;
      audio = master = null;
      if (previous && previous.state !== 'closed') {
        try { Promise.resolve(previous.close?.()).catch(() => {}); }
        catch (_) { /* A later gesture can open a fresh context. */ }
      }
    }
    doc.addEventListener('visibilitychange', () => { if (doc.hidden) releaseAudio(); });
    window.addEventListener('pagehide', releaseAudio);

    function mark(items, count, changed, completeClass) {
      items.forEach((item, index) => {
        const completed = index < count;
        item.classList.toggle(completeClass, completed);
        if (completeClass === 'is-lit') item.hidden = !completed;
        item.classList.remove('is-changing');
        if (index === changed) {
          void item.offsetWidth;
          item.classList.add('is-changing');
        }
      });
    }

    function render(stage, count, animate) {
      const previous = counts[stage];
      const added = Boolean(animate && count > previous);
      counts[stage] = count;
      const changed = added ? count - 1 : -1;
      if (stage === 'tomb') {
        tomb.dataset.count = String(count);
        mark(guards, count, changed, 'is-stone');
        if (count < previous) stopSounds();
        if (changed === 0 || changed === 3) playGrowl();
      } else if (stage === 'sea') {
        sea.dataset.count = String(count);
        mark(notes, count, changed, 'is-lit');
        sea.classList.toggle('is-found', count === NOTES.length);
        sea.classList.remove('is-arriving');
        if (count === NOTES.length && added) sea.classList.add('is-arriving');
        if (count < previous) stopSounds();
        if (added) playNote(changed);
      }
    }

    function resetExit() {
      tomb.classList.remove('is-leaving');
      sea.classList.remove('is-leaving');
      stopSounds();
    }

    function playExit(stage) {
      if (stage !== 'tomb' && stage !== 'sea') return 0;
      const scene = stage === 'sea' ? sea : tomb;
      scene.classList.remove('is-leaving');
      void scene.offsetWidth;
      scene.classList.add('is-leaving');
      if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return 0;
      return stage === 'sea' ? SEA_EXIT_MS : TOMB_EXIT_MS;
    }

    return { render, playExit, resetExit };
  }

  window.HanziTombMermaid = Object.freeze({ create });
})(window);
