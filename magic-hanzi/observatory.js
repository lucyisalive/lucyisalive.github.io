(function () {
  'use strict';

  const WIDTH = 420;
  const HEIGHT = 236;
  const STARS = [
    [43, 48], [102, 80], [158, 118], [148, 195], [174, 202],
    [194, 153], [229, 128], [299, 83], [365, 41], [229, 104],
  ];
  const CONNECTIONS = [
    [0, 1, 2, 5, 3, 4, 5, 6, 7, 8],
    [2, 9, 6],
  ];

  function drawingContext(canvas) {
    canvas.width = WIDTH * 2;
    canvas.height = HEIGHT * 2;
    const context = canvas.getContext('2d');
    context?.scale(2, 2);
    return context;
  }

  function drawConstellation(canvas) {
    const context = drawingContext(canvas);
    if (!context) return;
    context.beginPath();
    for (const connection of CONNECTIONS) {
      const [first, ...rest] = connection;
      context.moveTo(...STARS[first]);
      for (const index of rest) context.lineTo(...STARS[index]);
    }
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.strokeStyle = '#abc9ff55';
    context.lineWidth = 4;
    context.stroke();
    context.strokeStyle = '#e2f1ff';
    context.lineWidth = 1.2;
    context.stroke();
  }

  function drawBird(bird) {
    const farWing = drawingContext(bird.querySelector('.observatory-wing-right'));
    const nearWing = drawingContext(bird.querySelector('.observatory-wing-left'));
    const body = drawingContext(bird.querySelector('.observatory-bird-body'));
    if (!farWing || !nearWing || !body || typeof Path2D === 'undefined') return;

    function paint(context, outline, feathers, top, middle, edge) {
      const gradient = context.createLinearGradient(0, 38, 0, 191);
      gradient.addColorStop(0, top);
      gradient.addColorStop(.58, middle);
      gradient.addColorStop(1, edge);
      const silhouette = new Path2D(outline);
      context.fillStyle = gradient;
      context.fill(silhouette);
      context.lineWidth = 1.55;
      context.lineJoin = 'round';
      context.lineCap = 'round';
      context.strokeStyle = '#e9f9ffed';
      context.stroke(silhouette);
      context.lineWidth = .95;
      context.strokeStyle = '#e9f9ff8c';
      context.stroke(new Path2D(feathers));
    }

    paint(farWing,
      'M212 122 C248 84 308 94 371 31 C367 60 342 86 312 104 ' +
      'C332 97 350 85 362 77 C345 114 306 129 274 134 C291 135 310 130 326 124 ' +
      'C309 146 277 153 246 151 C255 156 269 156 282 152 C259 169 230 167 213 151 Z',
      'M221 123 C262 111 327 89 359 48 M228 133 C269 127 325 111 350 93 ' +
      'M229 143 C250 144 293 137 310 133 M233 151 C247 155 268 155 275 153',
      '#d9faff', '#729ed9', '#4f5bae');
    paint(nearWing,
      'M203 132 C146 118 99 63 34 39 C43 66 66 91 95 110 C70 101 54 88 43 82 ' +
      'C62 119 93 140 127 146 C104 143 85 133 69 125 C94 157 129 167 153 165 ' +
      'C138 168 121 168 106 163 C132 184 166 184 184 169 L210 154 Z',
      'M195 135 C142 120 94 79 49 52 M187 145 C135 135 81 110 56 94 ' +
      'M187 152 C156 152 114 143 88 134 M182 162 C160 171 137 169 119 166',
      '#e1faff', '#8ab6ec', '#5d66b8');
    paint(body,
      'M196 135 C202 126 204 120 209 112 C217 96 231 91 243 97 ' +
      'C248 99 250 102 254 104 L269 107 L254 113 C248 126 237 132 232 144 ' +
      'C225 164 211 169 195 176 L176 204 L172 189 L148 209 L157 189 L136 194 ' +
      'C150 181 171 168 178 151 C181 144 187 139 196 135 Z',
      'M194 146 C205 146 212 141 218 130 M185 163 C198 158 213 156 223 144 ' +
      'M150 187 C173 179 183 171 190 164 M158 198 L175 180 M176 193 L186 176',
      '#ffffff', '#c7effe', '#628ac9');
    body.fillStyle = '#172d55';
    body.beginPath();
    body.arc(235, 104, 2.5, 0, Math.PI * 2);
    body.fill();
    body.fillStyle = '#ffffff';
    body.beginPath();
    body.arc(235.7, 103.3, .85, 0, Math.PI * 2);
    body.fill();
  }

  function create({ document: doc }) {
    const backdrop = doc.createElement('div');
    backdrop.id = 'observatoryBackdrop';
    backdrop.setAttribute('aria-hidden', 'true');
    backdrop.dataset.stars = '0';
    backdrop.innerHTML = `
      <div class="observatory-art"></div>
      <div class="observatory-scene">
        <div class="observatory-sky">
          <div class="observatory-halo"></div>
          <canvas class="observatory-lines"></canvas>
          <div class="observatory-points">${STARS.map(([x, y]) => `
            <i class="observatory-star" style="--star-x:${x * 100 / WIDTH}%;--star-y:${y * 100 / HEIGHT}%"></i>
          `).join('')}</div>
          <div class="observatory-bird">
            <canvas class="observatory-wing-right"></canvas>
            <canvas class="observatory-wing-left"></canvas>
            <canvas class="observatory-bird-body"></canvas>
          </div>
        </div>
      </div>`;
    doc.body.insertBefore(backdrop, doc.body.firstChild);
    const points = Array.from(backdrop.querySelectorAll('.observatory-star'));
    drawConstellation(backdrop.querySelector('.observatory-lines'));
    drawBird(backdrop.querySelector('.observatory-bird'));
    let previous = 0;
    let newestStar = null;

    function render(count, animate = false) {
      const next = Math.min(STARS.length, Math.max(0, Math.trunc(count) || 0));
      // Leaving the answer feedback can keep the same count. Let the visual finish.
      if (next === previous) return;
      const light = animate && next > previous;
      const complete = next === STARS.length;
      backdrop.dataset.stars = String(next);
      newestStar?.classList.remove('is-lighting');
      newestStar = light ? points[next - 1] : null;
      for (const [index, star] of points.entries()) star.classList.toggle('is-lit', index < next);
      newestStar?.classList.add('is-lighting');
      backdrop.classList.toggle('observatory-complete', complete);
      backdrop.classList.toggle('observatory-transforming', complete && light);
      previous = next;
    }

    return { render };
  }

  window.HanziObservatory = { create };
}());
