(function (window) {
  'use strict';

  // This module only paints the story. The caller owns all learning and rewards.
  const ARRIVAL_TIME = 3200;
  const EXIT_TIME = 10500;
  const GROW_TIME = 1150;
  const VINE_POINTS = [
    [452, 1470], [412, 1349], [466, 1228], [420, 1107],
    [477, 986], [430, 865], [484, 744], [444, 623],
    [493, 502], [459, 381], [505, 260]
  ];
  // Measured at the narrow couplings in the actual 2172 × 724 transparent art.
  // Each piece displays a full, intact coach, all following the same rail curve.
  const TRAIN_SEGMENTS = [
    { start: 0, end: 698 / 2172, name: 'tail' },
    { start: 698 / 2172, end: 1332 / 2172, name: 'coach' },
    { start: 1332 / 2172, end: 1, name: 'engine' }
  ];
  const TRAIN_WIDTH = .86;
  const RAIL_ANCHOR = 535 / 724 * 100;
  const CLOUD_STEP_TIME = 2350;
  const CLOUD_ARRIVAL_TIME = 2900;
  const CLOUD_STATION_HEIGHT = 11.3;
  // The offline builder embeds this literal once. Every cloud shares one short
  // Blob URL, instead of copying a large data URI into fifteen moving layers.
  const CLOUD_IMAGE_SOURCE = 'assets/story/bean-depth-cloud-v1.webp';
  const cloudImageUrls = new Map();
  const CLOUD_DEPTHS = {
    far: { speed: .16, width: 1.22, opacity: .3, scale: .86, drift: .018, blur: 1.4 },
    middle: { speed: .39, width: 1.3, opacity: .49, scale: .96, drift: .052, blur: .65 },
    near: { speed: 1.1, width: 1.82, opacity: .86, scale: 1.04, drift: .13, blur: .2 }
  };
  // These clouds occupy different heights. They pass the camera once, rather
  // than looping on a screen-bound decorative drift or moving with the backdrop.
  const CLOUD_BANDS = [
    { depth: 'far', height: -1.1, x: .1, turn: -5 },
    { depth: 'far', height: 2.6, x: .91, turn: 4, flip: true },
    { depth: 'far', height: 6.2, x: .12, turn: -3 },
    { depth: 'far', height: 9.8, x: .9, turn: 5, flip: true },
    { depth: 'middle', height: .1, x: -.1, turn: -7, flip: true },
    { depth: 'middle', height: 2.4, x: .98, turn: 6 },
    { depth: 'middle', height: 4.8, x: .08, turn: -3 },
    { depth: 'middle', height: 7.1, x: 1.03, turn: 8, flip: true },
    { depth: 'middle', height: 9.7, x: .15, turn: -5 },
    { depth: 'near', height: .55, x: .17, turn: 4 },
    { depth: 'near', height: 2.55, x: .84, turn: -6, flip: true },
    { depth: 'near', height: 4.55, x: .22, turn: 7 },
    { depth: 'near', height: 6.55, x: .9, turn: -2, flip: true },
    { depth: 'near', height: 8.55, x: .13, turn: 5 },
    { depth: 'near', height: 9.9, x: .5, turn: -3, flip: true }
  ];
  const clamp = value => Math.max(0, Math.min(1, value));

  function cloudImageUrl(doc) {
    const source = CLOUD_IMAGE_SOURCE;
    if (!/^data:image\/[^,]+;base64,/i.test(source)) return source;
    const cached = cloudImageUrls.get(source);
    if (cached) { cached.references++; return cached.url; }
    try {
      const view = doc.defaultView || window;
      const comma = source.indexOf(',');
      const binary = view.atob(source.slice(comma + 1));
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
      const blob = new view.Blob([bytes], { type: source.slice(5, comma).split(';')[0] });
      const url = view.URL.createObjectURL(blob);
      cloudImageUrls.set(source, { url, references: 1, objectUrls: view.URL });
      return url;
    } catch (_) { return source; }
  }

  function releaseCloudImage() {
    const cached = cloudImageUrls.get(CLOUD_IMAGE_SOURCE);
    if (!cached || --cached.references > 0) return;
    try { cached.objectUrls.revokeObjectURL(cached.url); } catch (_) {}
    cloudImageUrls.delete(CLOUD_IMAGE_SOURCE);
  }

  function cloudField(depth) {
    return `<div class="beans-cloud-field beans-cloud-field-${depth}">${CLOUD_BANDS.map((cloud, index) =>
      cloud.depth === depth ? `<div class="beans-cloud-plane" data-cloud="${index}" data-depth="${depth}" data-height="${cloud.height}"></div>` : '').join('')}</div>`;
  }

  function vineSegment(index) {
    const [x0, y0] = VINE_POINTS[index];
    const [x1, y1] = VINE_POINTS[index + 1];
    const bend = index % 2 ? 32 : -32;
    const path = `M${x0} ${y0}C${x0 + bend} ${y0 - 42} ${x1 - bend} ${y1 + 43} ${x1} ${y1}`;
    const leafX = x0 + (x1 - x0) * .72;
    const leafY = y0 + (y1 - y0) * .72;
    const leafScale = 1 - index * .021;
    return `<g class="beans-vine-segment" data-segment="${index + 1}" style="--vine-i:${index}">
      <path class="beans-stem-shadow" pathLength="1" d="${path}"/>
      <path class="beans-stem" pathLength="1" d="${path}"/>
      <path class="beans-stem-light" pathLength="1" d="${path}"/>
      <g transform="translate(${leafX} ${leafY}) rotate(${index % 2 ? 9 : -8}) scale(${leafScale})">
        <g class="beans-leaf beans-leaf-left">
          <path class="beans-leaf-blade" d="M-3 3C-37-49-92-56-135-31C-128 8-81 49-3 3Z"/>
          <path class="beans-leaf-vein" d="M-6 3Q-63-17-123-29M-43-7-49-32M-68-16-87 7M-89-22-101-41"/>
        </g>
        <g class="beans-leaf beans-leaf-right">
          <path class="beans-leaf-blade" d="M0 0C32-48 82-65 128-47C133-7 86 38 0 0Z"/>
          <path class="beans-leaf-vein" d="M4-2Q59-28 117-45M40-19 45-42M63-29 86-11M88-37 91-55"/>
        </g>
        <path class="beans-tendril" pathLength="1" d="M2 8C42 9 53 28 42 41C34 50 17 42 26 33C31 28 38 32 35 37"/>
      </g>
    </g>`;
  }

  function create({ document: doc }) {
    const scene = doc.createElement('div');
    scene.className = 'story-scene story-beans';
    scene.hidden = true;
    scene.setAttribute('aria-hidden', 'true');
    scene.style.setProperty('--beans-cloud-texture', `url("${cloudImageUrl(doc)}")`);
    scene.innerHTML = `
      <div class="beans-frame">
        <div class="beans-world beans-scenery-world">
          <div class="beans-garden-art"></div>
          <div class="beans-height-haze"></div>
        </div>
        ${cloudField('far')}${cloudField('middle')}
        <div class="beans-world beans-vine-world">
          <svg class="beans-vine" viewBox="0 0 900 1600" preserveAspectRatio="none">
            <defs>
              <linearGradient id="beansStem" x1="0" x2="1">
                <stop stop-color="#183629"/><stop offset=".42" stop-color="#55784a"/>
                <stop offset=".67" stop-color="#82955d"/><stop offset="1" stop-color="#264c36"/>
              </linearGradient>
              <linearGradient id="beansLeaf" x1="0" y1="1" x2=".8" y2="0">
                <stop stop-color="#173e30"/><stop offset=".5" stop-color="#52794c"/>
                <stop offset="1" stop-color="#819659"/>
              </linearGradient>
              <radialGradient id="beansSeed"><stop stop-color="#b4ac6b"/><stop offset=".55" stop-color="#62714b"/><stop offset="1" stop-color="#283d2b"/></radialGradient>
            </defs>
            <ellipse class="beans-earth-shadow" cx="452" cy="1483" rx="113" ry="23"/>
            <path class="beans-seed" d="M426 1477C406 1445 428 1419 454 1430C474 1408 503 1431 483 1461C472 1480 445 1489 426 1477Z"/>
            ${Array.from({ length: 10 }, (_, index) => vineSegment(index)).join('')}
            <g class="beans-vine-tip" transform="translate(452 1470)">
              <path d="M0 3C-19-22-15-48 0-57C13-42 17-19 0 3Z"/>
              <path d="M-1-5C-25-7-33-23-29-36C-9-35 1-21-1-5Z"/>
            </g>
          </svg>
        </div>
        <div class="beans-station">
         <div class="beans-station-view">
          <div class="beans-station-art"></div>
          <div class="beans-station-halo"></div>
          <div class="beans-station-name"><i></i><span>天堂火车站</span><i></i></div>
          <svg class="beans-rails" viewBox="0 0 900 1600" preserveAspectRatio="none">
            <defs><linearGradient id="beansRail" x1="0" x2="1"><stop stop-color="#d1b77d" stop-opacity=".16"/><stop offset=".53" stop-color="#d5bd86" stop-opacity=".64"/><stop offset="1" stop-color="#afbec2" stop-opacity="0"/></linearGradient></defs>
            <path class="beans-rail" d="M-20 1430L608 931C882 752 990 688 689 664"/>
          </svg>
          <div class="beans-station-back-mist"></div>
          <div class="beans-train" style="--beans-rail-anchor:${RAIL_ANCHOR}%">
            ${TRAIN_SEGMENTS.map(({ start, end, name }, index) => `<div class="beans-car beans-car-${name}" data-car="${index}" style="width:${TRAIN_WIDTH * (end - start) * 100}%;aspect-ratio:${3 * (end - start)};z-index:${3 - index}"><img class="beans-car-sprite" src="assets/story/heaven-train-v1.webp" alt="" draggable="false" style="left:${-start / (end - start) * 100}%;width:${100 / (end - start)}%"></div>`).join('')}
          </div>
          <div class="beans-track-mist"></div>
         </div>
        </div>
        ${cloudField('near')}
        <div class="beans-foreground-mist"></div>
        <div class="beans-frame-shade"></div>
      </div>`;
    doc.body.insertBefore(scene, doc.body.firstChild);
    const frame = scene.querySelector('.beans-station-view');
    const segments = Array.from(scene.querySelectorAll('.beans-vine-segment'));
    const tip = scene.querySelector('.beans-vine-tip');
    const cars = Array.from(scene.querySelectorAll('.beans-car'));
    const firstSprite = scene.querySelector('.beans-car-sprite');
    const cloudPlanes = Array.from(scene.querySelectorAll('.beans-cloud-plane'));
    const timers = new Set();
    let shownCount = -1;
    let active = false;
    let frameRequest = null;
    let cloudFrameRequest = null;
    let cloudHeight = 0;
    let exitProgress = 0;
    let spriteAspect = 3;
    let frameAspect = 3 / 4;
    const motionPreference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const reduced = () => Boolean(motionPreference?.matches);
    const now = () => window.performance?.now?.() ?? Date.now();
    const requestFrame = callback => window.requestAnimationFrame(callback);

    function later(callback, delay) {
      const id = window.setTimeout(() => {
        timers.delete(id);
        callback();
      }, delay);
      timers.add(id);
      return id;
    }

    function cancelMotion() {
      timers.forEach(id => window.clearTimeout(id));
      timers.clear();
      if (frameRequest !== null) window.cancelAnimationFrame(frameRequest);
      frameRequest = null;
      if (cloudFrameRequest !== null) window.cancelAnimationFrame(cloudFrameRequest);
      cloudFrameRequest = null;
      scene.classList.remove('beans-clouds-moving');
    }

    function placeClouds(height) {
      cloudHeight = height;
      scene.dataset.cloudHeight = height.toFixed(3);
      cloudPlanes.forEach(plane => {
        const band = CLOUD_BANDS[Number(plane.dataset.cloud)];
        const depth = CLOUD_DEPTHS[band.depth];
        const distance = height - band.height;
        const y = .48 + distance * depth.speed;
        const entry = clamp((y + .72) / .45);
        const exit = clamp((1.85 - y) / .55);
        const close = band.depth === 'near';
        const perspective = close ? .72 + .37 * clamp((distance + .65) / 1.25) : .94 + .08 * clamp((distance + 2) / 4);
        const scale = depth.scale * perspective;
        const afterPass = close ? 1 - .48 * clamp((distance - .1) / .8) : 1;
        const opacity = depth.opacity * entry * exit * afterPass;
        plane.hidden = opacity < .002 || y < -1 || y > 2.2;
        plane.style.left = `${(band.x + distance * depth.drift * (band.flip ? -1 : 1)) * 100}%`;
        plane.style.top = `${y * 100}%`;
        plane.style.width = `${depth.width * 100}%`;
        plane.style.opacity = String(opacity);
        plane.style.transform = `translate(-50%, -50%) rotate(${band.turn}deg) scale(${band.flip ? -scale : scale}, ${scale})`;
        plane.style.filter = `blur(${depth.blur + (close ? Math.max(0, distance) * .8 : 0)}px) brightness(${close ? .98 : .86}) saturate(.78)`;
        plane.classList.toggle('is-passing-camera', close && Math.abs(distance) < .4);
      });
    }

    function moveClouds(target, duration) {
      const start = cloudHeight;
      const startedAt = now();
      scene.classList.add('beans-clouds-moving');
      function animate(time) {
        const fraction = clamp((time - startedAt) / duration);
        // Smooth arrival preserves the sense of weight without stopping all
        // layers together. Their depth-specific speeds remain independent.
        const eased = fraction * fraction * (3 - 2 * fraction);
        placeClouds(start + (target - start) * eased);
        if (fraction < 1 && active && !doc.hidden) cloudFrameRequest = requestFrame(animate);
        else {
          cloudFrameRequest = null;
          scene.classList.remove('beans-clouds-moving');
          placeClouds(target);
        }
      }
      cloudFrameRequest = requestFrame(animate);
    }

    function measure() {
      const box = frame.getBoundingClientRect();
      frameAspect = box.width > 0 && box.height > 0 ? box.width / box.height : 3 / 4;
    }

    // Rail distance increases rightwards, then curves into the high cloud bank.
    // Carriages have different distances, so the whole train bends along the track.
    function railPoint(distance) {
      if (distance <= .82) return {
        x: .02 + .8 * distance,
        y: .885 - .37 * distance,
        scale: 1.14 - .39 * distance,
        angle: Math.atan2(-.37, .8 * frameAspect),
        opacity: 1
      };
      const u = Math.max(0, Math.min(1, (distance - .82) / 1.6));
      const v = 1 - u;
      const x = .676 * v ** 3 + 3 * .98 * v * v * u + 3 * 1.1 * v * u * u + .766 * u ** 3;
      const y = .5816 * v ** 3 + 3 * .47 * v * v * u + 3 * .43 * v * u * u + .415 * u ** 3;
      const dx = 3 * (.98 - .676) * v * v + 6 * (1.1 - .98) * v * u + 3 * (.766 - 1.1) * u * u;
      const dy = 3 * (.47 - .5816) * v * v + 6 * (.43 - .47) * v * u + 3 * (.415 - .43) * u * u;
      const angle = Math.atan2(dy, dx * frameAspect);
      return {
        x, y, angle,
        scale: .8202 * (1 - .9 * u) ** 1.5,
        opacity: u < .33 ? 1 : Math.max(0, 1 - (u - .33) / .35)
      };
    }

    function placeTrain(progress) {
      exitProgress = progress;
      // A slow start gives the locomotive weight; the rear follows each bend.
      const travel = 1.73 * (progress < .3 ? progress * progress / .3 : .3 + (progress - .3) * 1.23);
      cars.forEach((car, index) => {
        const section = TRAIN_SEGMENTS[index];
        const center = .07 + TRAIN_WIDTH * (section.start + section.end) / 2;
        const point = railPoint(center + travel);
        const rear = railPoint(.07 + TRAIN_WIDTH * section.start + travel);
        const front = railPoint(.07 + TRAIN_WIDTH * section.end + travel);
        const sectionWidth = TRAIN_WIDTH * (section.end - section.start);
        car.style.left = `${(rear.x + front.x) * 50}%`;
        car.style.top = `${(rear.y + front.y) * 50}%`;
        car.style.opacity = String(point.opacity);
        // The wheels follow the track, while vertical window posts stay upright.
        // Adjacent coaches share exact rail endpoints, keeping couplings together.
        const a = (front.x - rear.x) / sectionWidth;
        const b = (front.y - rear.y) / (sectionWidth * frameAspect);
        car.style.transform = `translate(-50%, -${RAIL_ANCHOR}%) matrix(${a}, ${b}, 0, ${point.scale}, 0, 0)`;
        car.style.filter = `brightness(${1 - progress * .1}) blur(${Math.max(0, 1 - point.scale) * .8}px)`;
      });
    }

    function setDeparted() {
      scene.classList.remove('beans-exiting', 'beans-unveiling');
      scene.classList.add('beans-departed');
      scene.dataset.exit = 'departed';
      placeTrain(1);
    }

    function resetExit(keepCloudPosition = false) {
      cancelMotion();
      scene.classList.remove('beans-exiting', 'beans-departed', 'beans-unveiling', 'beans-camera-moving');
      scene.dataset.exit = 'parked';
      segments.forEach(segment => segment.classList.remove('is-growing'));
      tip.classList.remove('beans-tip-growing');
      measure();
      placeTrain(0);
      if (!keepCloudPosition) placeClouds(shownCount === 10 ? CLOUD_STATION_HEIGHT : Math.max(0, shownCount));
      if (doc.hidden && shownCount === 10) setDeparted();
    }

    function playExit(stage) {
      if (stage !== 'beans' || !active || shownCount !== 10) return 0;
      resetExit(true);
      placeClouds(CLOUD_STATION_HEIGHT);
      if (reduced() || doc.hidden) {
        setDeparted();
        return 0;
      }
      scene.getBoundingClientRect();
      scene.classList.add('beans-exiting');
      scene.dataset.exit = 'departing';
      const startedAt = now();
      function animate(time) {
        const progress = Math.max(0, Math.min(1, (time - startedAt) / EXIT_TIME));
        placeTrain(progress);
        if (progress < 1 && active) frameRequest = requestFrame(animate);
        else {
          frameRequest = null;
          setDeparted();
        }
      }
      frameRequest = requestFrame(animate);
      return EXIT_TIME;
    }

    function render(stage, count, animate = false) {
      if (stage !== 'beans') {
        if (active) resetExit();
        active = false;
        scene.hidden = true;
        shownCount = -1;
        return;
      }
      const next = Math.max(0, Math.min(10, Math.floor(Number(count) || 0)));
      if (active && next === shownCount) return;
      const previous = shownCount;
      const wasActive = active;
      active = true;
      scene.hidden = false;
      resetExit(true);
      const growing = animate && next > Math.max(0, previous) && !reduced() && !doc.hidden;
      scene.dataset.count = String(next);
      scene.style.setProperty('--beans-rise', String(next * 3.8));
      scene.style.setProperty('--beans-sky-rise', String(next * 2.5));
      scene.classList.toggle('beans-ready', next === 10);
      scene.classList.toggle('beans-camera-moving', growing && wasActive);
      segments.forEach((segment, index) => {
        segment.classList.toggle('is-grown', index < next);
        if (growing && index === next - 1) segment.classList.add('is-growing');
      });
      const point = VINE_POINTS[next];
      tip.setAttribute('transform', `translate(${point[0]} ${point[1]})`);
      tip.classList.toggle('beans-tip-hidden', next === 10);
      if (growing && next < 10) tip.classList.add('beans-tip-growing');
      shownCount = next;
      const cloudTarget = next === 10 ? CLOUD_STATION_HEIGHT : next;
      if (growing) {
        if (!wasActive) placeClouds(Math.max(0, next - 1));
        moveClouds(cloudTarget, next === 10 ? CLOUD_ARRIVAL_TIME : CLOUD_STEP_TIME);
      } else placeClouds(cloudTarget);
      if (next === 10) {
        if (growing) {
          scene.classList.add('beans-unveiling');
          later(() => { if (active && shownCount === 10) playExit('beans'); }, ARRIVAL_TIME);
        } else setDeparted();
      }
    }

    function imageReady() {
      if (!firstSprite.naturalWidth || !firstSprite.naturalHeight) return;
      spriteAspect = firstSprite.naturalWidth / firstSprite.naturalHeight;
      cars.forEach((car, index) => {
        car.style.aspectRatio = String(spriteAspect * (TRAIN_SEGMENTS[index].end - TRAIN_SEGMENTS[index].start));
      });
    }
    firstSprite.addEventListener('load', imageReady);
    if (firstSprite.complete) imageReady();
    function onResize() { measure(); placeTrain(exitProgress); }
    window.addEventListener('resize', onResize);
    function settleMotion() {
      if (!active) return;
      cancelMotion();
      scene.classList.remove('beans-camera-moving', 'beans-unveiling');
      segments.forEach(segment => segment.classList.remove('is-growing'));
      tip.classList.remove('beans-tip-growing');
      placeClouds(shownCount === 10 ? CLOUD_STATION_HEIGHT : Math.max(0, shownCount));
      if (shownCount === 10) setDeparted();
    }
    function onVisibility() { if (doc.hidden) settleMotion(); }
    function onMotionPreference() { if (reduced()) settleMotion(); }
    doc.addEventListener('visibilitychange', onVisibility);
    motionPreference?.addEventListener?.('change', onMotionPreference);

    return {
      render, playExit, resetExit,
      arrivalTime: ARRIVAL_TIME,
      exitTime: EXIT_TIME,
      growthTime: GROW_TIME,
      totalEndingTime: ARRIVAL_TIME + EXIT_TIME,
      automaticEnding: true,
      destroy() {
        cancelMotion();
        window.removeEventListener('resize', onResize);
        doc.removeEventListener('visibilitychange', onVisibility);
        motionPreference?.removeEventListener?.('change', onMotionPreference);
        releaseCloudImage();
        scene.remove();
      }
    };
  }

  window.HanziBeanTrainStory = { create };
})(window);
