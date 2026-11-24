(function (window) {
  'use strict';

  const EXIT_TIME = 6000;
  const STEP_ARRIVAL_TIME = 900;
  const STEPS = Array.from({ length: 10 }, (_, index) => ({
    x: 28 + index * 39 / 9,
    y: 83 - index * 53 / 9,
    width: 24 - index * 12 / 9
  }));
  const RUNES = [
    'M0 12 7 0 14 12M3 8H11M7 12V21',
    'M1 3H13L2 18H14M7 1V21',
    'M2 4 12 14 2 21M2 4V21M12 1V11',
    'M7 0V21M1 6 7 1 13 6M1 16 7 21 13 16',
    'M1 5H13M1 15H13M7 0V21M1 5 13 15',
    'M7 0 14 10 7 21 0 10ZM7 5V16'
  ];

  function pageRunes(offset) {
    return Array.from({ length: 4 }, (_, row) =>
      `<g transform="translate(${offset} ${121 + row * 33})">${RUNES.map((path, index) =>
        `<path d="${path}" transform="translate(${index * 25} 0)"/>`).join('')}</g>`).join('');
  }

  function create({ document: doc }) {
    const scene = doc.createElement('div');
    scene.className = 'story-scene story-library';
    scene.hidden = true;
    scene.setAttribute('aria-hidden', 'true');
    scene.innerHTML = `
      <div class="library-frame">
        <div class="library-world">
          <div class="library-art"></div>
          <div class="library-steps">${STEPS.map(({ x, y, width }, index) => `
            <div class="library-step" style="--step-x:${x}%;--step-y:${y}%;--step-size:${width}%;--step-i:${index}">
              <i class="library-step-shadow"></i><i class="library-step-tome"></i>
            </div>`).join('')}
          </div>
          <div class="library-forbidden-book"></div>
          <div class="library-seal"><i></i><i></i><i></i><i></i><b></b></div>
          <div class="library-shelf-glow"></div>
          <div class="library-motes">${Array.from({ length: 14 }, (_, index) =>
            `<i style="--mote-i:${index};--mote-x:${18 + (index * 23) % 67}%"></i>`).join('')}</div>
        </div>
        <div class="library-reading-book">
          <div class="library-reading-cover"></div>
          <svg class="library-reading-pages" viewBox="0 0 600 350">
            <defs>
              <linearGradient id="libraryPaperLeft" x1="0" x2="1">
                <stop stop-color="#b59c69"/><stop offset=".16" stop-color="#ead9a7"/>
                <stop offset=".74" stop-color="#f0e2b9"/><stop offset="1" stop-color="#9b8155"/>
              </linearGradient>
              <linearGradient id="libraryPaperRight" x1="0" x2="1">
                <stop stop-color="#917447"/><stop offset=".2" stop-color="#e9d6a6"/>
                <stop offset=".8" stop-color="#eee2b9"/><stop offset="1" stop-color="#b89c69"/>
              </linearGradient>
            </defs>
            <path class="library-page-edge" d="M300 87Q173 46 43 83L20 286Q153 253 300 305Q445 253 580 286L558 83Q426 46 300 87Z"/>
            <path class="library-page-left" d="M300 77Q179 37 51 73L29 272Q155 241 300 291Z"/>
            <path class="library-page-right" d="M300 77Q422 37 549 73L571 272Q446 241 300 291Z"/>
            <path class="library-page-gutter" d="M300 77V291"/>
            <g class="library-page-ornament">
              <path d="M70 98Q173 69 279 103M321 103Q428 69 530 98"/>
              <path d="M61 255Q173 227 279 266M321 266Q428 227 539 255"/>
              ${pageRunes(91)}${pageRunes(344)}
            </g>
          </svg>
        </div>
        <div class="library-rising-runes">${RUNES.map((path, index) =>
          `<svg viewBox="-2 -2 19 26" style="--rune-i:${index}"><path d="${path}"/></svg>`).join('')}</div>
        <div class="library-ghost-mist"><i></i><i></i><i></i></div>
        <div class="library-ghost-knight"></div>
      </div>`;
    doc.body.insertBefore(scene, doc.body.firstChild);
    const steps = Array.from(scene.querySelectorAll('.library-step'));
    let shownCount = 0;

    function resetExit() {
      scene.classList.remove('library-exiting');
    }

    function render(stage, count, animate = false) {
      scene.hidden = stage !== 'library';
      if (scene.hidden) {
        resetExit();
        return;
      }
      const next = Math.max(0, Math.min(STEPS.length, Math.floor(Number(count) || 0)));
      const arriving = animate && next > shownCount;
      resetExit();
      scene.classList.remove('library-releasing');
      steps.forEach((step, index) => {
        step.classList.toggle('is-visible', index < next);
        step.classList.remove('is-arriving');
      });
      scene.dataset.count = String(next);
      scene.classList.toggle('library-ready', next === STEPS.length);
      if (arriving) {
        scene.getBoundingClientRect();
        steps[next - 1].classList.add('is-arriving');
        if (next === STEPS.length) scene.classList.add('library-releasing');
      }
      shownCount = next;
    }

    function playExit(stage) {
      if (stage !== 'library' || shownCount !== STEPS.length) return 0;
      resetExit();
      scene.getBoundingClientRect();
      scene.classList.add('library-exiting');
      return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ? 0 : EXIT_TIME;
    }

    return { render, playExit, resetExit, arrivalTime: STEP_ARRIVAL_TIME };
  }

  window.HanziLibraryStory = { create };
})(window);
