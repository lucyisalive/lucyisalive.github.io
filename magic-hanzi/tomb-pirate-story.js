(function (window) {
  'use strict';

  // The caller owns all answers, progress, rewards, and persistence.
  const ENDINGS = Object.freeze({ laser: 8000, arrows: 6500, map: 9000, pirate: 12000 });
  const STEP_TIME = 1800;
  const ASSETS = Object.freeze({
    corridor: 'assets/story/tomb-depth-corridor-v1.webp',
    chest: 'assets/story/tomb-treasure-chest-v1.webp',
    sword: 'assets/story/tomb-sword-hand-v1.webp',
    blankMap: 'assets/story/pirate-map-blank-v1.webp',
    completeMap: 'assets/story/pirate-map-complete-v2.webp',
    deck: 'assets/story/pirate-moon-deck-v1.webp',
    sail: 'assets/story/pirate-sail-v1.webp',
    skeleton: 'assets/story/pirate-bone-parts-v2.webp',
    coat: 'assets/story/pirate-empty-coat-v1.webp',
    captain: 'assets/story/pirate-human-captain-v2.webp'
  });
  const imageCache = new Map();
  let instance = 0;

  function acquireImage(source, doc) {
    const src = String(source), cached = imageCache.get(src);
    if (cached) { cached.users++; return cached.url; }
    if (!/^data:image\/[^,]+;base64,/i.test(src)) return src;
    try {
      const view = doc.defaultView || window;
      const decode = view.atob || window.atob, BlobType = view.Blob || window.Blob, urls = view.URL || window.URL;
      if (typeof decode !== 'function' || typeof BlobType !== 'function' || typeof urls?.createObjectURL !== 'function') return src;
      const comma = src.indexOf(','), binary = decode.call(view, src.slice(comma + 1)), bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const url = urls.createObjectURL(new BlobType([bytes], { type: src.slice(5, comma).split(';')[0] }));
      if (typeof url !== 'string' || !url) throw new Error('Artwork URL unavailable');
      imageCache.set(src, { url, users: 1, urls });
      return url;
    } catch (_) { return src; }
  }
  function releaseImage(source) {
    const cached = imageCache.get(String(source));
    if (!cached || --cached.users > 0) return;
    try { cached.urls.revokeObjectURL?.(cached.url); } catch (_) {}
    imageCache.delete(String(source));
  }

  // The metal tip faces the camera; the short shaft/fletching recedes behind it.
  const ARROWS = [[16,28,-23],[84,31,20],[23,67,-17],[78,68,22],[36,20,-8],[65,22,13],[10,49,-29],[90,50,26],[40,78,-11],[61,77,9]];
  const LASERS = [
    { y:35,angle:-6,action:'duck',x:0,dy:-14,roll:2,pitch:7 },
    { y:74,angle:8,action:'step-over',x:0,dy:14,roll:-2,pitch:-6 },
    { y:49,angle:63,action:'side-left',x:17,dy:0,roll:-9,pitch:0 },
    { y:29,angle:12,action:'duck',x:-2,dy:-16,roll:-3,pitch:8 },
    { y:77,angle:-13,action:'step-over',x:2,dy:15,roll:3,pitch:-7 },
    { y:53,angle:-66,action:'side-right',x:-18,dy:-1,roll:9,pitch:0 },
    { y:39,angle:-19,action:'duck',x:3,dy:-13,roll:4,pitch:7 },
    { y:69,angle:17,action:'step-over',x:-3,dy:13,roll:-4,pitch:-6 },
    { y:48,angle:72,action:'side-left',x:19,dy:1,roll:-10,pitch:1 },
    { y:31,angle:4,action:'duck',x:0,dy:-16,roll:2,pitch:8 }
  ];
  const BONES = [
    // Independent alpha components in the atlas; no piece is cut from a whole person.
    { name:'骨盆', crop:[35,48,340,293],box:[35.5,43,29,18],z:3 },
    { name:'脊柱',crop:[550,5,100,380],box:[44,14,12,36],z:1 },
    { name:'胸肋肩骨',crop:[815,42,355,315],box:[31,17,38,27],z:4 },
    { name:'左上臂',crop:[1327,8,110,365],box:[24.5,21,10,27],z:3 },
    { name:'右上臂',crop:[1734,8,110,365],box:[65.5,21,10,27],z:3 },
    { name:'左前臂和手',crop:[125,397,132,386],box:[20.5,45,13,28],z:4 },
    { name:'右前臂和手',crop:[540,397,133,386],box:[64.5,45,13,28],z:4 },
    { name:'左腿和脚',crop:[944,392,84,401],box:[36.5,58,13,42],z:2 },
    { name:'右腿和脚',crop:[1350,392,85,401],box:[50.5,58,13,42],z:2 },
    { name:'头骨',crop:[1660,414,242,334],box:[41.5,0,17,18],z:5 }
  ];
  const MAP_MIDDLE = [51, 48, 53, 47, 52, 50];
  function mapPolygon(row, column) {
    const x0 = column * 20, x1 = (column + 1) * 20;
    const left = row === 0 ? [[x0, 0], [x0 - (column ? 2 : 0), 18], [x0 + (column ? 2 : 0), 30], [x0, MAP_MIDDLE[column]]]
      : [[x0, MAP_MIDDLE[column]], [x0 + (column ? 2 : 0), 69], [x0 - (column ? 2 : 0), 82], [x0, 100]];
    const right = row === 0 ? [[x1, 0], [x1 - (column < 4 ? 2 : 0), 18], [x1 + (column < 4 ? 2 : 0), 30], [x1, MAP_MIDDLE[column + 1]]]
      : [[x1, MAP_MIDDLE[column + 1]], [x1 + (column < 4 ? 2 : 0), 69], [x1 - (column < 4 ? 2 : 0), 82], [x1, 100]];
    return [left[0], ...right, ...left.slice(1).reverse()].map(([x, y]) => x + '% ' + y + '%').join(',');
  }
  function laserMarkup(id, index) {
    const beam = LASERS[index];
    const colors = ['#ee873d', '#e2623d', '#eba64a', '#d96640'];
    return `<div class="tp-laser-plane" data-laser-index="${index}" data-dodge="${beam.action}" style="--tp-beam:${colors[index%colors.length]}"><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><g transform="rotate(${beam.angle} 50 ${beam.y})"><line class="tp-beam-aura" x1="-70" y1="${beam.y}" x2="170" y2="${beam.y}"/><line class="tp-beam-halo" x1="-70" y1="${beam.y}" x2="170" y2="${beam.y}"/><line class="tp-beam-core" x1="-70" y1="${beam.y}" x2="170" y2="${beam.y}"/></g></svg></div>`;
  }
  function arrowMarkup(index, id) {
    const [x,y,turn]=ARROWS[index];
    const svg=`<svg viewBox="0 0 120 160" aria-hidden="true"><path class="tp-arrow-fletching" d="M54 10L35 4 43 26 58 31 70 23 79 5 63 12Z"/><path class="tp-arrow-feather" d="M39 9L55 24M76 10L63 25"/><path class="tp-arrow-wood" d="M55 21L64 21 70 104 49 104Z"/><path class="tp-arrow-shaft-light" d="M59 27L60 87"/><path class="tp-arrow-head-dark" d="M20 65L60 152L104 65 72 80 60 71 49 80Z"/><path class="tp-arrow-head" d="M18 61L60 148L102 61 71 76 60 66 49 76Z"/><path class="tp-arrow-head-light" d="M18 61L60 96 60 148 49 76Z"/><path class="tp-arrow-head-dark" d="M102 61L60 96 60 148 71 76Z"/><path class="tp-arrow-ridge" d="M18 61L60 96 102 61M60 96L60 148M49 76L60 66 71 76"/></svg>`;
    return `<div class="tp-arrow" data-arrow-index="${index}" style="left:${x}%;top:${y}%;--tp-arrow-x:${x}%;--tp-arrow-y:${y}%;--tp-arrow-turn:${turn}deg;--tp-arrow-delay:${index*45}ms"><div class="tp-arrow-motion"><div class="tp-arrow-intact">${svg}</div><div class="tp-arrow-half tp-arrow-half-head">${svg}</div><div class="tp-arrow-half tp-arrow-half-tail">${svg}</div></div></div>`;
  }

  function create({ document: doc }) {
    const view = doc.defaultView || window, id = 'tp-story-' + (++instance);
    const art = Object.fromEntries(Object.entries(ASSETS).map(([key, source]) => [key, acquireImage(source, doc)]));
    const scene = doc.createElement('div');
    scene.className = 'story-scene story-tomb-pirate';
    scene.hidden = true;
    scene.setAttribute('aria-hidden', 'true');
    scene.innerHTML = `<div class="tp-frame"><div class="tp-cave-stage">
      <div class="tp-corridor-world"><div class="tp-corridor-fallback"></div><img class="tp-corridor-art" src="${art.corridor}" alt="" draggable="false"><div class="tp-torch-light"></div></div>
      <div class="tp-chest-anchor"><div class="tp-chest-frame tp-chest-closed"><img src="${art.chest}" alt="" draggable="false"></div><div class="tp-chest-frame tp-chest-open"><img src="${art.chest}" alt="" draggable="false"></div><i class="tp-chest-light"></i></div>
      <div class="tp-chest-lip"><div class="tp-chest-frame"><img src="${art.chest}" alt="" draggable="false"></div></div>
      <div class="tp-laser-volume">${Array.from({ length: 10 }, (_, index) => laserMarkup(id, index)).join('')}</div>
      <div class="tp-tomb-dust">${Array.from({ length: 15 }, (_, i) => `<i style="--tp-dust-x:${(i * 43 + 7) % 100}%;--tp-dust-delay:${i * 37}ms"></i>`).join('')}</div>
    </div><div class="tp-deck-stage"><div class="tp-deck-world"><div class="tp-deck-fallback"></div><img class="tp-deck-art" src="${art.deck}" alt="" draggable="false">
      <div class="tp-sea-drift"></div><div class="tp-sail"><img src="${art.sail}" alt="" draggable="false"></div>
      <div class="tp-empty-coat"><img src="${art.coat}" alt="" draggable="false"></div><div class="tp-loose-hat"><img src="${art.coat}" alt="" draggable="false"></div>
      <div class="tp-skeleton-assembly">${BONES.map((bone,index)=>`<div class="tp-bone-part" data-bone-index="${index}" data-bone-name="${bone.name}" style="left:${bone.box[0]}%;top:${bone.box[1]}%;width:${bone.box[2]}%;height:${bone.box[3]}%;z-index:${bone.z};--tp-bone-from-x:${index%2?190:-190}%;--tp-bone-from-y:${index%3*80-80}%;--tp-bone-turn:${index%2?-115:115}deg"><svg viewBox="${bone.crop.join(' ')}" aria-hidden="true"><image href="${art.skeleton}" x="0" y="0" width="1983" height="793"/></svg></div>`).join('')}<i class="tp-soul-light"></i></div><div class="tp-rebirth-light"><i></i><b></b><em></em></div>
      <div class="tp-captain"><div class="tp-captain-frame tp-captain-shirt"><img src="${art.captain}" alt="" draggable="false"></div><div class="tp-captain-frame tp-captain-front"><img src="${art.captain}" alt="" draggable="false"></div><div class="tp-captain-frame tp-captain-steering"><img src="${art.captain}" alt="" draggable="false"></div></div>
      <div class="tp-rigging-light"></div>
    </div></div><div class="tp-map-object" style="--tp-paper-mask:url('${art.blankMap}')"><img class="tp-map-blank" src="${art.blankMap}" alt="" draggable="false">${Array.from({ length: 10 }, (_, index) => `<div class="tp-map-piece" data-map-index="${index}" style="clip-path:polygon(${mapPolygon(Math.floor(index / 5), index % 5)})"><img src="${art.completeMap}" alt="" draggable="false"></div>`).join('')}<div class="tp-map-ink-glow"></div></div>
    <div class="tp-sea-gate"><svg viewBox="0 0 600 800" preserveAspectRatio="none" aria-hidden="true">${Array.from({ length: 12 }, (_, i) => `<path style="--tp-wave-delay:${i * -330}ms;--tp-wave-opacity:${.12 + i % 3 * .05}" d="M-90 ${200 + i * 57}Q60 ${175 + i * 57} 210 ${202 + i * 57}T510 ${201 + i * 57}T810 ${205 + i * 57}"/>`).join('')}</svg></div>
    <div class="tp-arrow-field">${ARROWS.map((_, index) => arrowMarkup(index, id)).join('')}</div><div class="tp-sword-hand"><img src="${art.sword}" alt="" draggable="false"></div>
    <div class="tp-parry-impact"><i></i>${Array.from({ length: 9 }, (_, i) => `<b style="--tp-spark-angle:${i * 40}deg;--tp-spark-length:${8 + i % 3 * 5}px"></b>`).join('')}</div><div class="tp-frame-shade"></div></div>`;
    doc.body.insertBefore(scene, doc.body.firstChild);
    const planes = Array.from(scene.querySelectorAll('.tp-laser-plane'));
    const arrows = Array.from(scene.querySelectorAll('.tp-arrow'));
    const pieces = Array.from(scene.querySelectorAll('.tp-map-piece'));
    const bones = Array.from(scene.querySelectorAll('.tp-bone-part'));
    const timers = new Set(), media = view.matchMedia?.('(prefers-reduced-motion: reduce)');
    const now = () => view.performance?.now?.() ?? Date.now();
    const reduced = () => Boolean(media?.matches);
    const requestFrame = fn => view.requestAnimationFrame ? view.requestAnimationFrame(fn) : view.setTimeout(() => fn(now()), 16);
    const cancelFrame = handle => view.cancelAnimationFrame ? view.cancelAnimationFrame(handle) : view.clearTimeout(handle);
    let currentStage, currentCount = -1, frame, generation = 0, endingUntil = 0, destroyed = false;
    const phases = ['is-ending', 'is-chest-open', 'is-quaking', 'is-volley', 'has-arrows', 'has-sword', 'is-parrying', 'is-paper-inside', 'is-paper-held', 'is-lifting-paper', 'is-map-glowing', 'is-map-diving', 'is-sea-crossing', 'is-deck-arriving', 'is-on-deck', 'has-all-bones', 'is-inhabiting', 'is-rebirth-glowing', 'is-human-reborn', 'is-coat-filling', 'is-hat-dropping', 'is-captain-awake', 'is-captain-turning', 'is-captain-steering', 'is-sail-open', 'is-sailing', 'is-finished'];

    function cancelMotion() {
      generation++;
      timers.forEach(handle => view.clearTimeout(handle));
      timers.clear();
      if (frame != null) cancelFrame(frame);
      frame = undefined;
      endingUntil = 0;
      scene.style.setProperty('--tp-step-bob', '0%');
      setCameraPose();
    }
    function later(delay, callback) {
      const ticket = generation;
      const handle = view.setTimeout(() => {
        timers.delete(handle);
        if (!destroyed && ticket === generation) callback();
      }, delay);
      timers.add(handle);
    }
    function clearPhases() {
      scene.classList.remove(...phases);
      arrows.forEach(arrow => arrow.classList.remove('is-targeted', 'is-deflected'));
      pieces.forEach(piece => piece.classList.remove('is-new'));
      bones.forEach(bone => bone.classList.remove('is-new'));
    }
    function setCameraPose(beam, amount=0) {
      scene.style.setProperty('--tp-pose-x', ((beam?.x||0)*amount).toFixed(3)+'%');
      scene.style.setProperty('--tp-pose-y', ((beam?.dy||0)*amount).toFixed(3)+'%');
      scene.style.setProperty('--tp-pose-roll', ((beam?.roll||0)*amount).toFixed(3)+'deg');
      scene.style.setProperty('--tp-pose-pitch', ((beam?.pitch||0)*amount).toFixed(3)+'deg');
      // Only the back wall is enlarged: the chest and individual beam depths
      // retain their continuous world positions during a duck or side lean.
      scene.style.setProperty('--tp-camera-cover', (1+.8*amount).toFixed(4));
      scene.dataset.dodge = amount ? beam.action : 'steady';
    }
    function setLaserDepth(camera, passed) {
      scene.style.setProperty('--tp-cave-zoom', String(1 + 2.1 * Math.pow(camera / 10, 1.7)));
      scene.style.setProperty('--tp-chest-size', (7.5 + 44.5 * Math.pow(camera / 10, 2.2)).toFixed(3) + '%');
      scene.style.setProperty('--tp-chest-foot', (52 + 25 * Math.pow(camera / 10, 1.4)).toFixed(3) + '%');
      scene.dataset.cameraDepth = camera.toFixed(4);
      planes.forEach((plane, index) => {
        const z = (camera - index) * 900 - 120;
        // The body has already ducked/stepped aside at this depth. Cull the
        // passed single beam before its offscreen SVG becomes excessively big.
        plane.hidden = index < passed || z > 400;
        plane.style.transform = 'translateZ(' + z.toFixed(2) + 'px)';
      });
    }
    function walkThrough(from, to, after) {
      const start = now(), ticket = generation, gate = to - 1;
      function tick(time) {
        if (ticket !== generation || destroyed) return;
        const progress = Math.max(0, Math.min(1, (time - start) / STEP_TIME));
        const travel = Math.max(0, Math.min(1, (progress - .09) / .91));
        const ease = travel * travel * (3 - 2 * travel);
        setLaserDepth(from + (to - from) * ease, from);
        // Anticipate the obstacle, pass it while close to the lens, then settle
        // completely before handwriting continues. No motion runs at rest.
        const posture=Math.pow(Math.sin(Math.PI*Math.min(1,travel*1.12)),.8);
        setCameraPose(LASERS[gate],posture);
        scene.style.setProperty('--tp-step-bob', (Math.sin(travel * Math.PI * 4) * .45 * Math.sin(travel * Math.PI)).toFixed(3) + '%');
        if (progress < 1) frame = requestFrame(tick);
        else { frame = undefined; setLaserDepth(to, to); scene.style.setProperty('--tp-step-bob', '0%'); setCameraPose(); after?.(); }
      }
      frame = requestFrame(tick);
    }
    function setArrowCount(count, shooting = -1) {
      arrows.forEach((arrow, index) => { arrow.hidden = index < count && index !== shooting; });
    }
    function alignParryImpact() {
      try {
        const sword = scene.querySelector('.tp-sword-hand');
        const style = view.getComputedStyle(sword);
        const parsed = /^matrix\(([^)]+)\)$/.exec(style.transform);
        if (!parsed) return;
        const [a, b, c, d, tx, ty] = parsed[1].split(',').map(Number);
        const [ox, oy] = style.transformOrigin.split(' ').map(parseFloat);
        // The measured steel point (600,400) in the 1536×1024 photograph,
        // including object-fit's vertical letterboxing in the square holder.
        const dx = sword.offsetWidth * .390625 - ox;
        const dy = sword.offsetHeight * .4270833333 - oy;
        const x = sword.offsetLeft + ox + a * dx + c * dy + tx;
        const y = sword.offsetTop + oy + b * dx + d * dy + ty;
        const frameBox = scene.querySelector('.tp-frame');
        if (!frameBox.clientWidth || !frameBox.clientHeight || !Number.isFinite(x + y)) return;
        scene.style.setProperty('--tp-parry-x', (x / frameBox.clientWidth * 100).toFixed(3) + '%');
        scene.style.setProperty('--tp-parry-y', (y / frameBox.clientHeight * 100).toFixed(3) + '%');
      } catch (_) { /* Keep the bounded default contact if layout is unavailable. */ }
    }
    function parry(index) {
      setArrowCount(index + 1, index);
      scene.classList.add('is-parrying');
      arrows[index].classList.add('is-targeted');
      later(470, alignParryImpact);
      later(500, () => arrows[index].classList.add('is-deflected'));
      later(1220, () => { arrows[index].hidden = true; arrows[index].classList.remove('is-targeted', 'is-deflected'); scene.classList.remove('is-parrying'); });
    }
    function setParts(count) {
      bones.forEach((bone, index) => bone.classList.toggle('is-assembled', index < count));
      scene.classList.toggle('has-all-bones', count === 10);
    }
    function basePose(stage, count) {
      scene.dataset.stage = stage;
      scene.dataset.count = String(count);
      scene.dataset.phase = 'progress';
      scene.classList.remove('story-laser', 'story-arrows', 'story-map', 'story-pirate');
      scene.classList.add('story-' + stage);
      pieces.forEach((piece, index) => piece.classList.toggle('is-revealed', stage === 'map' && index < count));
      setParts(stage === 'pirate' ? count : 0);
      setLaserDepth(stage === 'laser' ? count : 10, stage === 'laser' ? count : 10);
      setArrowCount(stage === 'arrows' ? count : 10);
      if (stage === 'arrows') scene.classList.add('is-chest-open', 'has-arrows', 'has-sword');
      if (stage === 'map') scene.classList.add('is-chest-open', 'is-paper-held');
      if (stage === 'pirate') scene.classList.add('is-on-deck');
    }
    function terminalPose(stage) {
      clearPhases();
      basePose(stage, 10);
      scene.classList.add('is-finished');
      if (stage === 'laser') {
        scene.classList.add('is-chest-open', 'has-arrows', 'has-sword');
        setArrowCount(0);
        scene.dataset.phase = 'arrows-suspended';
      } else if (stage === 'arrows') {
        scene.classList.remove('has-arrows', 'has-sword');
        scene.classList.add('is-paper-held');
        scene.dataset.phase = 'blank-map-open';
      } else if (stage === 'map') {
        scene.classList.remove('is-paper-held');
        scene.classList.add('is-on-deck');
        setParts(0);
        scene.dataset.phase = 'empty-pirate-deck';
      } else {
        scene.classList.add('is-human-reborn', 'is-coat-filling', 'is-captain-awake', 'is-captain-steering', 'is-sail-open', 'is-sailing');
        scene.dataset.phase = 'sailing';
      }
    }
    function beginEnding(stage, previous) {
      endingUntil = now() + ENDINGS[stage];
      scene.classList.add('is-ending');
      if (stage === 'laser') {
        walkThrough(previous, 10);
        later(3000, () => { scene.classList.add('is-chest-open'); scene.dataset.phase = 'chest-opens'; });
        later(4300, () => { scene.classList.add('is-quaking'); scene.dataset.phase = 'tomb-quake'; });
        later(5200, () => { scene.classList.add('has-arrows', 'is-volley'); setArrowCount(0); scene.dataset.phase = 'arrow-volley'; });
        later(6500, () => { scene.classList.add('has-sword'); scene.classList.remove('is-quaking'); });
      } else if (stage === 'arrows') {
        parry(9);
        later(1300, () => { scene.classList.remove('has-sword', 'has-arrows'); scene.classList.add('is-paper-inside'); scene.dataset.phase = 'map-in-chest'; });
        later(3300, () => { scene.classList.add('is-paper-held', 'is-lifting-paper'); scene.classList.remove('is-paper-inside'); scene.dataset.phase = 'take-and-unfold-map'; });
      } else if (stage === 'map') {
        pieces[9].classList.add('is-new');
        later(1400, () => { scene.classList.add('is-map-glowing'); scene.dataset.phase = 'complete-map-glows'; });
        later(2800, () => { scene.classList.add('is-map-diving'); scene.dataset.phase = 'enter-map-sea'; });
        later(5700, () => { scene.classList.add('is-sea-crossing'); scene.dataset.phase = 'cross-the-sea'; });
        later(7000, () => { scene.classList.add('is-deck-arriving'); setParts(0); scene.dataset.phase = 'arrive-on-pirate-deck'; });
      } else {
        scene.classList.remove('has-all-bones');
        bones[9].classList.add('is-new');
        later(1150, () => { scene.classList.add('has-all-bones'); scene.dataset.phase = 'skeleton-complete'; });
        later(2200, () => { scene.classList.add('is-inhabiting'); scene.dataset.phase = 'skeleton-enters-coat'; });
        later(2600, () => { scene.classList.add('is-rebirth-glowing'); scene.dataset.phase = 'magic-envelops-skeleton'; });
        later(3600, () => { scene.classList.add('is-human-reborn'); scene.dataset.phase = 'human-captain-reborn'; });
        later(4300, () => { scene.classList.add('is-coat-filling'); scene.dataset.phase = 'coat-fills'; });
        later(4700, () => { scene.classList.add('is-hat-dropping'); scene.dataset.phase = 'captain-puts-on-hat'; });
        later(5800, () => { scene.classList.add('is-captain-awake'); scene.dataset.phase = 'captain-awakens'; });
        later(7200, () => { scene.classList.add('is-captain-turning'); scene.dataset.phase = 'captain-takes-the-helm'; });
        later(8200, () => scene.classList.add('is-captain-steering'));
        later(8600, () => { scene.classList.add('is-sail-open'); scene.dataset.phase = 'sail-unfurls'; });
        later(9700, () => { scene.classList.add('is-sailing'); scene.dataset.phase = 'ship-gets-underway'; });
      }
      later(ENDINGS[stage], () => { endingUntil = 0; terminalPose(stage); });
    }

    function render(stage, count, animate = false) {
      if (destroyed) return;
      if (!Object.hasOwn(ENDINGS, stage)) {
        cancelMotion(); clearPhases(); scene.hidden = true; currentStage = undefined; currentCount = -1;
        return;
      }
      const next = Math.max(0, Math.min(10, Math.floor(Number(count) || 0)));
      const entered = currentStage !== stage || scene.hidden;
      if (!entered && currentCount === next) return;
      const previous = entered ? next : currentCount;
      const moving = !entered && animate && next > previous && !reduced() && !doc.hidden;
      cancelMotion(); clearPhases();
      currentStage = stage; currentCount = next; scene.hidden = false;
      scene.classList.toggle('is-instant', !moving);
      basePose(stage, next);
      if (moving && stage === 'laser') setLaserDepth(previous, previous);
      if (next === 10) {
        if (moving) beginEnding(stage, previous);
        else terminalPose(stage);
      } else if (moving) {
        if (stage === 'laser') walkThrough(previous, next);
        else if (stage === 'arrows') parry(next - 1);
        else if (stage === 'map') { pieces[next - 1].classList.add('is-new'); later(1300, () => pieces[next - 1].classList.remove('is-new')); }
        else { bones[next - 1].classList.add('is-new'); later(1200, () => bones[next - 1].classList.remove('is-new')); }
      }
    }
    function playExit(stage = currentStage) {
      if (destroyed || stage !== currentStage || currentCount !== 10) return 0;
      return Math.max(0, endingUntil - now());
    }
    function resetExit() {
      cancelMotion(); scene.classList.add('is-instant');
      if (currentStage) {
        if (currentCount === 10) terminalPose(currentStage);
        else { clearPhases(); basePose(currentStage, currentCount); }
      }
    }
    function onVisibility() {
      scene.classList.toggle('is-suspended', Boolean(doc.hidden));
      if (doc.hidden) resetExit();
    }
    function onPageHide() { scene.classList.add('is-suspended'); resetExit(); }
    function onMotionChange() { if (reduced()) resetExit(); }
    doc.addEventListener?.('visibilitychange', onVisibility);
    view.addEventListener?.('pagehide', onPageHide);
    view.addEventListener?.('pageshow', onVisibility);
    media?.addEventListener?.('change', onMotionChange);
    scene.querySelectorAll('img').forEach(img => img.addEventListener('error', () => { img.hidden = true; }));
    function destroy() {
      if (destroyed) return;
      cancelMotion(); destroyed = true;
      doc.removeEventListener?.('visibilitychange', onVisibility);
      view.removeEventListener?.('pagehide', onPageHide);
      view.removeEventListener?.('pageshow', onVisibility);
      media?.removeEventListener?.('change', onMotionChange);
      scene.remove(); Object.values(ASSETS).forEach(releaseImage);
    }
    return { render, playExit, resetExit, destroy, arrivalTime: (stage = currentStage) => reduced() || doc.hidden ? 0 : ENDINGS[stage] || 0, endingTimes: ENDINGS };
  }

  window.HanziTombPirateStory = Object.freeze({ create });
})(window);
