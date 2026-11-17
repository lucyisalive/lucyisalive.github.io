(function () {
  'use strict';

  const INGREDIENTS = [
    'pumpkin', 'onion', 'carrot', 'mushroom', 'turnip',
    'leek', 'corn', 'potato', 'tomato', 'cabbage',
  ];
  const EXIT_TIME = 3450;
  const SPLASH = [[-43, -38], [-24, -52], [-8, -67], [18, -65], [31, -46], [48, -34]];
  const RUBBLE = [
    [-230, 165, -135, 128], [-166, 194, -93, 78], [-131, 103, 80, 61], [-90, 238, -74, 38],
    [114, 180, 134, 106], [169, 219, 90, 72], [217, 139, -80, 46], [74, 243, 112, 51],
  ];

  function create({ document: doc }) {
    const scene = doc.createElement('div');
    scene.className = 'story-scene story-giant';
    scene.setAttribute('aria-hidden', 'true');
    scene.innerHTML = `
      <div class="story-giant-viewport">
        <div class="story-giant-room">
          <div class="story-giant-pot-glow"></div>
          <div class="story-giant-steam"><i></i><i></i><i></i></div>
          <div class="story-giant-food"><i></i></div>
          <div class="story-giant-splash">${SPLASH.map(([x, y], index) =>
            `<i style="--splash-x:${x}px;--splash-y:${y}px;--splash-delay:${index * 18}ms"></i>`).join('')}</div>
        </div>
        <div class="story-giant-bowl"><i></i></div>
        <div class="story-giant-mountain">
          <div class="story-giant-ravine"></div>
          <div class="story-giant-rock-face story-giant-rock-left"></div>
          <div class="story-giant-rock-face story-giant-rock-right"></div>
          <div class="story-giant-crack"></div>
          <div class="story-giant-rubble">${RUBBLE.map(([x, y, angle, size], index) =>
            `<i style="--rock-x:${x}px;--rock-y:${y}px;--rock-angle:${angle}deg;--rock-size:${size}px;--rock-delay:${index * 27}ms"></i>`).join('')}</div>
          <div class="story-giant-fist"><i></i><b></b></div>
          <div class="story-giant-dust"></div>
        </div>
      </div>`;
    doc.body.insertBefore(scene, doc.body.firstChild);
    const food = scene.querySelector('.story-giant-food');
    let shownCount = 0;

    function render(stage, count, animate = false) {
      if (stage !== 'giant') return;
      const nextCount = Math.max(0, Math.min(INGREDIENTS.length, count));
      const toss = animate && nextCount > shownCount;
      shownCount = nextCount;
      scene.dataset.count = String(nextCount);
      scene.style.setProperty('--story-giant-fill', String(nextCount / INGREDIENTS.length));
      scene.classList.remove('story-giant-tossing');
      if (toss) {
        scene.dataset.ingredient = INGREDIENTS[nextCount - 1];
        food.getBoundingClientRect();
        scene.classList.add('story-giant-tossing');
      }
    }

    function resetExit() {
      scene.classList.remove('story-giant-exiting');
    }

    function playExit(stage) {
      if (stage !== 'giant') return 0;
      resetExit();
      scene.classList.remove('story-giant-tossing');
      scene.getBoundingClientRect();
      scene.classList.add('story-giant-exiting');
      return EXIT_TIME;
    }

    return { render, playExit, resetExit };
  }

  window.HanziGiantKitchen = { create };
})();
