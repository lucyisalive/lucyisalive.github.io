(function () {
  'use strict';

  // Near-to-far joints read from the two ropes in the portrait artwork.
  const JOINTS = [87.5, 74.7, 65.2, 56.8, 49.3, 42.7, 36.9, 31.8, 27.4, 23.7, 20.7];
  const ropeWidth = y => Math.min(82, 3.4 + (y - 20.7) * 1.29);
  // x and y locate each balloon's knot. Cords run from the knot to the roof.
  const BALLOONS = [
    [22, 40, 12.2, '#b77941', '#52351f'], [36, 42, 13.3, '#8e4849', '#482431'],
    [51, 41, 13.3, '#6d8782', '#2a4950'], [65, 39, 11.8, '#a4864e', '#5d4226'],
    [77, 36, 11.4, '#79658e', '#3b2b53'], [15, 30, 11.6, '#806895', '#453150'],
    [29, 28, 12.0, '#708d74', '#324c3c'], [43, 26, 13.0, '#bb9556', '#654827'],
    [57, 26, 12.7, '#9b5655', '#512f3c'], [70, 25, 10.7, '#678897', '#2f465f'],
  ];

  function create({ document: doc }) {
    function add(parent, className) {
      const el = doc.createElement('div');
      el.className = className;
      parent.appendChild(el);
      return el;
    }

    function scene(stage) {
      const root = doc.createElement('div');
      root.id = 'story-' + stage;
      root.className = 'story-scene sky-scene sky-' + stage;
      root.setAttribute('aria-hidden', 'true');
      const frame = add(root, 'sky-frame');
      const camera = add(frame, 'sky-camera');
      add(camera, 'sky-art');
      const progress = add(root, 'sky-compact');
      doc.body.insertBefore(root, doc.body.firstChild);
      return { root, frame, camera, progress, marks: [], compact: [], count: 0 };
    }

    const bridge = scene('bridge');
    const bridgeDeck = add(bridge.camera, 'sky-bridge-deck');
    JOINTS.slice(0, -1).forEach((bottom, index) => {
      const top = JOINTS[index + 1];
      const width = ropeWidth(bottom);
      const plank = add(bridgeDeck, 'sky-piece sky-plank');
      plank.style.setProperty('--board-y', (top + bottom) / 2 + '%');
      plank.style.setProperty('--board-width', width + '%');
      plank.style.setProperty('--board-depth', (bottom - top - .14) + '%');
      plank.style.setProperty('--board-taper', (1 - ropeWidth(top) / width) * 50 + '%');
      plank.style.setProperty('--board-tone', String((index * 17) % 23 - 9) + 'deg');
      plank.style.setProperty('--board-drift', (index % 2 ? 1 : -1) * (27 + index * 4) + '%');
      bridge.marks.push(plank);
      bridge.compact.push(add(bridge.progress, 'sky-compact-plank'));
    });
    add(bridge.camera, 'sky-bridge-mist');

    const train = scene('train');
    const ropes = add(train.camera, 'sky-balloon-ropes');
    const balloons = add(train.camera, 'sky-balloon-cluster');
    BALLOONS.forEach(([x, y, width, highlight, shade], index) => {
      const cord = add(ropes, 'sky-cord');
      const roofX = 70 + index * 2.1;
      const roofY = 45.2 + Math.abs(index - 5) * .46;
      const dx = (roofX - x) * .75;
      const dy = roofY - y;
      cord.style.setProperty('--cord-x', x + '%');
      cord.style.setProperty('--cord-y', y + '%');
      cord.style.setProperty('--cord-length', Math.hypot(dx, dy) + '%');
      cord.style.setProperty('--cord-angle', -Math.atan2(dx, dy) * 180 / Math.PI + 'deg');

      const balloon = add(balloons, 'sky-piece sky-balloon');
      balloon.style.setProperty('--balloon-x', x + '%');
      balloon.style.setProperty('--balloon-y', y + '%');
      balloon.style.setProperty('--balloon-width', width + '%');
      balloon.style.setProperty('--balloon-light', highlight);
      balloon.style.setProperty('--balloon-shade', shade);
      balloon.style.setProperty('--balloon-delay', (index * -.31) + 's');
      const fabric = add(balloon, 'sky-balloon-fabric');
      add(fabric, 'sky-balloon-seam');
      const compact = add(train.progress, 'sky-compact-balloon');
      compact.style.setProperty('--balloon-light', highlight);
      compact.style.setProperty('--balloon-shade', shade);
      train.marks.push(balloon);
      train.compact.push(compact);
    });

    const cab = add(train.frame, 'sky-train-cab');
    const windshield = add(cab, 'sky-train-window');
    add(windshield, 'sky-train-highland');
    add(windshield, 'sky-train-clouds');
    add(windshield, 'sky-train-cloud-front');
    add(cab, 'sky-train-dashboard');

    const stages = { bridge, train };
    const exitDurations = { bridge: 2350, train: 3550 };

    function render(stage, count, animate = false) {
      const current = stages[stage];
      if (!current) return;
      const total = current.marks.length;
      const next = Math.min(total, Math.max(0, Math.floor(Number(count) || 0)));
      const newIndex = animate && next === current.count + 1 ? next - 1 : -1;
      current.count = next;
      current.root.dataset.count = String(next);
      current.root.classList.toggle('is-complete', next === total);
      current.marks.forEach((mark, index) => {
        mark.classList.remove('is-arriving');
        mark.classList.toggle('is-placed', index < next);
        current.compact[index].classList.toggle('is-placed', index < next);
        if (index === newIndex) {
          // Reusing the same demo item after a restore should replay its arrival.
          mark.getBoundingClientRect();
          mark.classList.add('is-arriving');
        }
      });
      if (stage === 'train') {
        for (let index = 0; index < ropes.children.length; index++) {
          ropes.children[index].classList.toggle('is-taut', index < next);
        }
      }
    }

    function resetExit() {
      for (const { root } of Object.values(stages)) root.classList.remove('is-travelling');
    }

    function playExit(stage) {
      const current = stages[stage];
      if (!current) return 0;
      if (doc.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return 0;
      resetExit();
      current.root.getBoundingClientRect();
      current.root.classList.add('is-travelling');
      return exitDurations[stage];
    }

    return { render, playExit, resetExit };
  }

  window.HanziBridgeTrain = { create };
}());
