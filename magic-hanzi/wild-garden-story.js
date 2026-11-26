(function (window) {
  'use strict';

  const TIMES = Object.freeze({ release: 1900, zoo: 6400, barrier: 1500, flower: 2400, fairy: 4200, dream: 1800 });
  // One literal per image lets the offline builder embed each source once.
  const ASSETS = Object.freeze({
    zoo: 'assets/story/midnight-menagerie-v1.webp',
    beastsA: 'assets/story/fierce-guards-a.webp',
    beastsB: 'assets/story/fierce-guards-b.webp',
    garden: 'assets/story/butterfly-secret-garden-v1.webp',
    hedge: 'assets/story/garden-hedge-screen-v1.webp',
    flower: 'assets/story/fairy-disguise-flower-v1.webp',
    fairy: 'assets/story/butterfly-fairy-laugh-v1.webp'
  });
  const imageUrls = new Map();
  let instance = 0;
  const clamp = value => Math.max(0, Math.min(1, value));
  const ease = value => { const n = clamp(value); return n * n * (3 - 2 * n); };
  const lerp = (a, b, n) => a + (b - a) * n;
  const CAGE_ROWS = [[13, 90, 23], [18, 80, 19], [23, 71, 16], [29, 64, 13], [34, 58, 10]];
  const BEASTS = [
    { name: 'lion', title: '狮子', crop: [0, 26, 505, 454], free: [34, 86, 18.5], party: [31, 86, 17] },
    { name: 'tiger', title: '老虎', crop: [513, 129, 504, 332], free: [66, 85, 18], party: [74, 82, 15] },
    { name: 'wolf', title: '灰狼', crop: [1045, 27, 491, 436], free: [43, 91, 16], party: [42, 87, 15] },
    { name: 'bear', title: '棕熊', crop: [4, 549, 500, 459], free: [59, 90, 18], party: [59, 87, 16] },
    { name: 'panther', title: '黑豹', crop: [512, 582, 518, 400], free: [35, 76, 16], party: [35, 76, 15] },
    { name: 'hyena', title: '鬣狗', crop: [25, 75, 483, 372], free: [66, 74, 15], party: [65, 76, 14] },
    { name: 'crocodile', title: '鳄鱼', crop: [510, 162, 514, 248], free: [50, 81, 18], party: [50, 95, 20] },
    { name: 'boar', title: '野猪', crop: [1038, 66, 492, 368], free: [53, 72, 15], party: [51, 76, 14] },
    { name: 'rhinoceros', title: '犀牛', crop: [3, 579, 510, 380], free: [45, 62, 15], party: [45, 65, 14] },
    { name: 'eagle', title: '鹰', crop: [517, 552, 506, 429], free: [56, 56, 12], party: [54, 52, 10] }
  ];
  const FAERY_REGIONS = {
    left: '0,0 500,0 500,650 0,650',
    right: '500,0 1000,0 1000,650 500,650',
    body: '340,0 610,0 620,160 590,250 625,285 705,345 820,400 870,405 870,470 800,470 640,395 610,390 650,580 655,760 580,1000 350,1000 280,940 225,880 195,760 195,650 230,550 340,450 390,390 380,250 350,160'
  };

  function acquireImage(source, doc) {
    if (!/^data:image\/[^,]+;base64,/i.test(source)) return source;
    const cached = imageUrls.get(source);
    if (cached) { cached.references++; return cached.url; }
    try {
      const view = doc.defaultView || window;
      const comma = source.indexOf(',');
      const binary = view.atob(source.slice(comma + 1));
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
      const url = view.URL.createObjectURL(new view.Blob([bytes], { type: source.slice(5, comma).split(';')[0] }));
      imageUrls.set(source, { url, objectUrls: view.URL, references: 1 });
      return url;
    } catch (_) { return source; }
  }
  function releaseImage(source) {
    const cached = imageUrls.get(source);
    if (!cached || --cached.references > 0) return;
    try { cached.objectUrls.revokeObjectURL(cached.url); } catch (_) {}
    imageUrls.delete(source);
  }
  function cageMarkup(index) {
    const [x, y, size] = CAGE_ROWS[Math.floor(index / 2)];
    return `<div class="wg-cage" data-cage="${index}" style="left:${index % 2 ? 100 - x : x}%;top:${y}%;width:${size}%;z-index:${Math.round(y * 10) + 5};--wg-cage-facing:${index % 2 ? -1 : 1}">
      <svg class="wg-cage-shell" viewBox="0 0 220 200"><path class="wg-cage-roof" d="M14 35L52 8H207L174 35Z"/><path class="wg-cage-side" d="M174 35L207 8V169L174 194Z"/>
        <path class="wg-cage-back" d="M52 8V169H207M77 11V169M106 11V169M135 11V169M164 11V169M192 11V169M53 54H206M53 113H206"/>
        <path class="wg-cage-frame" d="M14 35H174V194H14ZM14 35L52 8H207V169L174 194M14 194H174M20 29H173"/></svg>
      <div class="wg-cage-door"><svg viewBox="0 0 180 180"><path class="wg-cage-frame" d="M5 5H174V174H5Z"/>
        <path class="wg-cage-bars" d="M26 8V171M51 8V171M76 8V171M101 8V171M126 8V171M151 8V171M8 58H171M8 121H171"/>
        <g class="wg-cage-lock"><path class="wg-lock-shackle" d="M131 85V78C131 62 154 62 154 78V85"/><rect x="127" y="84" width="31" height="27" rx="3"/><path class="wg-lock-keyhole" d="M143 93v10"/></g></svg></div>
    </div>`;
  }
  function beastMarkup(beast, index) {
    const [x, y, width, height] = beast.crop;
    const atlas = index < 5 ? 'A' : 'B';
    return `<div class="wg-zoo-animal wg-animal-${beast.name}" data-beast="${index}" data-species="${beast.name}" data-species-title="${beast.title}" style="--wg-animal-ratio:${width / height};--wg-sprite-size:${1536 / width * 100}% ${1024 / height * 100}%;--wg-sprite-position:${x / (1536 - width) * 100}% ${y / (1024 - height) * 100}%;--wg-animal-atlas:var(--wg-beasts${atlas});--wg-beast-phase:${-index * .43}s;--wg-beast-pace:${5.4 + index * .27}s">
      <i class="wg-animal-ground"></i><div class="wg-animal-pose"><div class="wg-animal-body wg-animal-skin"></div><div class="wg-animal-hind wg-animal-skin"></div><div class="wg-animal-front wg-animal-skin"></div></div></div>`;
  }
  function barrierMarkup(index) {
    return `<div class="wg-garden-barrier wg-barrier-kind-${index % 3}" data-barrier="${index}" style="z-index:${110 - index};--wg-hedge-flip:${index % 2 ? -1 : 1};--wg-hedge-hue:${index * 2 - 8}deg">
      <i class="wg-hedge-shadow"></i>${['left', 'right'].map(side => `<div class="wg-hedge-piece wg-hedge-${side}"><div class="wg-hedge-texture"></div><svg class="wg-hedge-fence" viewBox="0 0 1000 600"><path class="wg-fence-rail" d="M-40 515Q500 450 1040 515M-40 567Q500 507 1040 567"/>
        ${Array.from({ length: 15 }, (_, n) => `<path class="wg-fence-picket" d="M${n * 74 - 18} 600V${360 + n % 3 * 24}l-9-17 9-17 9 17-9 17"/>`).join('')}</svg></div>`).join('')}</div>`;
  }
  function lightStringMarkup(index) {
    const row = Math.floor(index / 4);
    const segment = index % 4;
    const sections = row === 2 ? 2 : 4;
    const from = 100 + row * 40;
    const to = 925 - row * 35;
    const x0 = lerp(from, to, segment / sections);
    const x1 = lerp(from, to, (segment + 1) / sections);
    const y = x => 165 + row * 103 + Math.sin(x / 1000 * Math.PI) * (115 - row * 12);
    return `<g class="wg-light-string" data-light-string="${index}"><path d="M${x0} ${y(x0)}Q${(x0 + x1) / 2} ${y((x0 + x1) / 2)} ${x1} ${y(x1)}"/>${[.13, .45, .78].map(part => { const x = lerp(x0, x1, part); return `<circle cx="${x}" cy="${y(x) + 7}" r="${4.3 + row * .5}"/>`; }).join('')}</g>`;
  }

  function create({ document: doc, onActionRequest } = {}) {
    const id = `wild-garden-${++instance}`;
    const art = Object.fromEntries(Object.entries(ASSETS).map(([key, source]) => [key, acquireImage(source, doc)]));
    const zoo = doc.createElement('div');
    const garden = doc.createElement('div');
    zoo.className = 'story-scene story-zoo';
    garden.className = 'story-scene story-butterfly';
    [zoo, garden].forEach(scene => { scene.hidden = true; scene.setAttribute('aria-hidden', 'true'); });
    zoo.style.setProperty('--wg-zoo-art', `url("${art.zoo}")`);
    zoo.style.setProperty('--wg-beastsA', `url("${art.beastsA}")`);
    zoo.style.setProperty('--wg-beastsB', `url("${art.beastsB}")`);
    garden.style.setProperty('--wg-garden-art', `url("${art.garden}")`);
    garden.style.setProperty('--wg-hedge-art', `url("${art.hedge}")`);
    zoo.innerHTML = `<div class="wg-frame wg-zoo-frame"><div class="wg-ambience wg-zoo-ambience"></div><div class="wg-world-position"><div class="wg-zoo-world">
      <div class="wg-zoo-art"></div><div class="wg-zoo-stage-glow"></div>
      <svg class="wg-zoo-lights" viewBox="0 0 1000 1400" preserveAspectRatio="none">${Array.from({ length: 10 }, (_, index) => lightStringMarkup(index)).join('')}</svg>
      <div class="wg-zoo-cages">${BEASTS.map((_, index) => cageMarkup(index)).join('')}</div>
      <div class="wg-zoo-animals">${BEASTS.map(beastMarkup).join('')}</div>
      <div class="wg-zoo-key"><svg viewBox="0 0 180 85"><defs><linearGradient id="${id}-key" x1="0" x2="0" y2="1"><stop stop-color="#f3d799"/><stop offset=".42" stop-color="#b8893c"/><stop offset=".63" stop-color="#e1bf71"/><stop offset="1" stop-color="#725021"/></linearGradient></defs><path fill="url(#${id}-key)" stroke="#4b351b" stroke-width="2" d="M51 10a31 31 0 1 0 0 62a31 31 0 0 0 29-20h42v16h15V52h14V40h19V29H80A31 31 0 0 0 51 10Zm0 15a16 16 0 1 1 0 32a16 16 0 0 1 0-32Z"/></svg></div>
      <div class="wg-zoo-sparks">${Array.from({ length: 12 }, (_, index) => `<i style="--spark-i:${index};left:${13 + index * 6.7}%;top:${30 + index % 3 * 5}%"></i>`).join('')}</div>
    </div></div><div class="wg-frame-shade"></div></div>`;
    garden.innerHTML = `<div class="wg-frame wg-garden-frame"><div class="wg-ambience wg-garden-ambience"></div><div class="wg-world-position"><div class="wg-garden-world">
      <div class="wg-garden-art"></div><div class="wg-garden-atmosphere"></div>
      <div class="wg-flower"><img src="${art.flower}" alt="" draggable="false"></div>
      <div class="wg-barrier-field">${Array.from({ length: 10 }, (_, index) => barrierMarkup(index)).join('')}</div>
      <div class="wg-fairy"><svg class="wg-fairy-sprite" viewBox="0 0 1000 1000"><defs>${Object.entries(FAERY_REGIONS).map(([key, points]) => `<mask id="${id}-fairy-${key}" maskUnits="userSpaceOnUse" x="0" y="0" width="1000" height="1000" style="mask-type:luminance"><polygon points="${points}" fill="white"/>${key === 'body' ? '' : `<polygon points="${FAERY_REGIONS.body}" fill="black"/>`}</mask>`).join('')}<mask id="${id}-dream-wing" maskUnits="userSpaceOnUse" x="0" y="0" width="1000" height="1000" style="mask-type:luminance"><polygon points="120,0 340,55 430,190 470,320 420,370 365,450 295,530 170,545 140,450 170,335 140,250" fill="white"/><polygon points="${FAERY_REGIONS.body}" fill="black"/></mask></defs>
        <g class="wg-fairy-wing wg-fairy-left-wing"><image href="${art.fairy}" width="1000" height="1000" preserveAspectRatio="xMidYMid meet" mask="url(#${id}-fairy-left)"/></g>
        <g class="wg-fairy-wing wg-fairy-right-wing"><image href="${art.fairy}" width="1000" height="1000" preserveAspectRatio="xMidYMid meet" mask="url(#${id}-fairy-right)"/></g>
        <image href="${art.fairy}" width="1000" height="1000" preserveAspectRatio="xMidYMid meet" mask="url(#${id}-fairy-body)"/></svg></div>
      <div class="wg-fairy-speech">你找到我啦！</div>
      <div class="wg-dream"><div class="wg-dream-butterfly"><svg viewBox="0 0 1000 1000"><g class="wg-dream-wing wg-dream-left"><g transform="translate(35 0)"><image href="${art.fairy}" width="1000" height="1000" preserveAspectRatio="xMidYMid meet" mask="url(#${id}-dream-wing)"/></g></g><g class="wg-dream-wing wg-dream-right"><g transform="translate(1000 0) scale(-1 1)"><g transform="translate(35 0)"><image href="${art.fairy}" width="1000" height="1000" preserveAspectRatio="xMidYMid meet" mask="url(#${id}-dream-wing)"/></g></g></g><path class="wg-dream-body" d="M500 252C484 340 483 470 500 607C517 470 515 340 500 252Z"/><circle class="wg-dream-head" cx="500" cy="263" r="11"/><path class="wg-dream-antennae" d="M496 267Q479 229 466 218M504 267Q521 229 534 218"/></svg></div><i class="wg-dream-eyelid wg-dream-eyelid-top"></i><i class="wg-dream-eyelid wg-dream-eyelid-bottom"></i></div>
    </div></div><div class="wg-frame-shade"></div></div>`;
    doc.body.insertBefore(zoo, doc.body.firstChild);
    doc.body.insertBefore(garden, doc.body.firstChild);
    const hitTarget = doc.createElement('button');
    hitTarget.type = 'button';
    hitTarget.className = 'wg-flower-hit';
    hitTarget.hidden = true;
    hitTarget.setAttribute('aria-label', '抓住装成花的小精灵');
    hitTarget.title = '抓住装成花的小精灵';
    doc.body.appendChild(hitTarget);
    const cages = Array.from(zoo.querySelectorAll('.wg-cage'));
    const animals = Array.from(zoo.querySelectorAll('.wg-zoo-animal'));
    const strings = Array.from(zoo.querySelectorAll('.wg-light-string'));
    const key = zoo.querySelector('.wg-zoo-key');
    const barriers = Array.from(garden.querySelectorAll('.wg-garden-barrier'));
    const flower = garden.querySelector('.wg-flower');
    const fairy = garden.querySelector('.wg-fairy');
    const speech = garden.querySelector('.wg-fairy-speech');
    const dream = garden.querySelector('.wg-dream');
    const gardenArt = garden.querySelector('.wg-garden-art');
    const preference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const reduced = () => Boolean(preference?.matches);
    const clock = () => window.performance?.now?.() ?? Date.now();
    const counts = { zoo: 0, butterfly: 0 };
    const releaseStarts = Array(10).fill(null);
    const unlockedSound = Array(10).fill(false);
    let currentStage = '';
    let frameRequest = null;
    let zooPartyStart = null;
    let gardenMove = null;
    let camera = 0;
    let flowerStart = null;
    let fairyStart = null;
    let dreamStart = null;
    let fairyCaught = false;
    let partySound = false;
    let destroyed = false;
    const phases = { zoo: 'cages', butterfly: 'garden' };

    function sound(method, ...args) {
      try { const result = window.HanziGameFeedback?.[method]?.(...args); result?.catch?.(() => {}); } catch (_) {}
    }
    function setPhase(stage, phase) {
      phases[stage] = phase;
      (stage === 'zoo' ? zoo : garden).dataset.phase = phase;
      if (stage === 'butterfly') syncHit();
    }
    function clearMotion() {
      if (frameRequest !== null) window.cancelAnimationFrame(frameRequest);
      frameRequest = null;
      zooPartyStart = null;
      gardenMove = null;
      flowerStart = null;
      fairyStart = null;
      dreamStart = null;
      releaseStarts.fill(null);
      animals.forEach(animal => animal.classList.remove('is-running'));
    }
    function syncHit() {
      const awaiting = currentStage === 'butterfly' && counts.butterfly === 10 && phases.butterfly === 'flower-await' && !doc.hidden;
      hitTarget.hidden = !awaiting;
      hitTarget.disabled = !awaiting;
      if (!awaiting) return;
      const box = flower.getBoundingClientRect();
      const width = Math.max(64, Math.min(120, box.width));
      const height = Math.max(80, Math.min(155, box.height));
      hitTarget.style.left = `${box.left + box.width / 2 - width / 2}px`;
      hitTarget.style.top = `${box.top + box.height / 2 - height / 2}px`;
      hitTarget.style.width = `${width}px`;
      hitTarget.style.height = `${height}px`;
    }
    function cagePosition(index) {
      const [x, y, size] = CAGE_ROWS[Math.floor(index / 2)];
      return [index % 2 ? 100 - x : x, y - size * .035, size * .79];
    }
    function drawZoo(time = clock(), settled = false) {
      const partyElapsed = zooPartyStart === null ? counts.zoo === 10 ? TIMES.zoo : -1 : Math.max(0, time - zooPartyStart);
      const party = counts.zoo === 10 && partyElapsed >= 0;
      const joining = party ? ease((partyElapsed - 2800) / 2700) : 0;
      let moving = false;
      animals.forEach((animal, index) => {
        const beast = BEASTS[index];
        const released = index < counts.zoo;
        const elapsed = released && releaseStarts[index] !== null && !settled ? time - releaseStarts[index] : released ? TIMES.release : 0;
        const door = released ? ease((elapsed - 720) / 600) : 0;
        const running = released && elapsed < TIMES.release && !settled;
        const run = released ? ease((elapsed - 1050) / (TIMES.release - 1050)) : 0;
        const caged = cagePosition(index);
        const free = beast.free;
        let x = lerp(caged[0], free[0], run) + Math.sin(run * Math.PI) * (index % 2 ? -3 : 3);
        let y = lerp(caged[1], free[1], run) - Math.sin(run * Math.PI) * 1.5;
        let size = lerp(caged[2], free[2], run);
        if (party && released) { x = lerp(x, beast.party[0], joining); y = lerp(y, beast.party[1], joining); size = lerp(size, beast.party[2], joining); }
        animal.style.left = `${x}%`;
        animal.style.top = `${y}%`;
        animal.style.width = `${size}%`;
        animal.style.zIndex = String(Math.round(y * 10) + (running || released ? 9 : 2));
        animal.style.setProperty('--wg-facing', String(x < 50 ? 1 : -1));
        animal.classList.toggle('is-freed', released);
        animal.classList.toggle('is-running', running && elapsed > 1000);
        animal.classList.toggle('is-partying', party && partyElapsed > 2900);
        cages[index].style.setProperty('--wg-door-angle', `${-107 * door}deg`);
        cages[index].classList.toggle('is-open', released && door > .9);
        cages[index].classList.toggle('is-unlocked', released && elapsed >= 680);
        if (running) moving = true;
        if (running && elapsed >= 680 && !unlockedSound[index]) { unlockedSound[index] = true; sound('playZooUnlock', index); }
      });
      const newest = counts.zoo - 1;
      const keyElapsed = newest >= 0 && releaseStarts[newest] !== null && !settled ? time - releaseStarts[newest] : TIMES.release;
      key.hidden = newest < 0 || keyElapsed > 1000;
      if (!key.hidden) {
        const [rowX, cageY, size] = CAGE_ROWS[Math.floor(newest / 2)];
        const cx = newest % 2 ? 100 - rowX : rowX;
        // The key's tip, not its centre, lands on the closed door's keyhole.
        // Turning completes before the door starts moving away on its hinge.
        const holeX = cx + size * .141 * (newest % 2 ? -1 : 1);
        const holeY = cageY - size * .269;
        const flying = ease(keyElapsed / 430);
        key.style.left = `${lerp(50, holeX, flying)}%`;
        key.style.top = `${lerp(83, holeY, flying) - Math.sin(flying * Math.PI) * 8}%`;
        key.style.width = `${lerp(10, size * .30, flying)}%`;
        key.style.opacity = String(1 - ease((keyElapsed - 730) / 270));
        key.style.transform = `translate(-94.444%, -40.588%) rotate(${lerp(-25, 0, flying) + 90 * ease((keyElapsed - 430) / 240)}deg)`;
      }
      strings.forEach((string, index) => {
        const light = party ? ease((partyElapsed - 1900 - index * 75) / 650) : 0;
        string.style.setProperty('--wg-string-light', String(light));
      });
      zoo.style.setProperty('--wg-party-glow', String(party ? ease((partyElapsed - 2100) / 1300) : 0));
      zoo.classList.toggle('wg-party-ready', party && partyElapsed >= 2900);
      if (party && partyElapsed >= 2200 && !partySound && zooPartyStart !== null && !settled) { partySound = true; sound('playZooParty'); }
      if (party && partyElapsed < TIMES.zoo && !settled) { moving = true; setPhase('zoo', partyElapsed < 2000 ? 'last-release' : partyElapsed < 3800 ? 'lights-on' : 'party'); }
      else setPhase('zoo', party ? 'finished' : 'cages');
      return moving;
    }
    function drawGardenCamera(progress) {
      camera = progress;
      garden.dataset.camera = progress.toFixed(3);
      gardenArt.style.transform = `translateY(${progress * .45}%) scale(${1 + progress * .018})`;
      barriers.forEach((barrier, index) => {
        const distance = Math.max(.22, (index - progress) * 1.6 + 1.1);
        const scale = Math.min(3, 1.45 / (.68 * distance + .6));
        const base = .4 + .55 / (.5 * distance + .6);
        const opened = ease(progress - index);
        const opacity = 1 - ease((opened - .36) / .64);
        barrier.hidden = opened >= .999;
        barrier.style.width = `${123 * scale}%`;
        barrier.style.left = `${50 + (index % 2 ? 1 : -1) * 1.2 / distance}%`;
        barrier.style.top = `${base * 100}%`;
        barrier.style.opacity = String(opacity);
        barrier.style.transform = `translate(-50%, -100%) rotate(${(index % 3 - 1) * 1.3}deg)`;
        barrier.style.setProperty('--wg-hedge-opening', String(opened));
      });
    }
    function flowerPose(progress) {
      const p = ease(progress);
      flower.style.opacity = String(p);
      flower.style.transform = 'translate(-50%, -100%)';
    }
    function fairyPose(progress) {
      const p = clamp(progress);
      const reveal = ease(p * TIMES.fairy / 1250);
      flower.style.opacity = String(1 - ease(p * TIMES.fairy / 750));
      fairy.style.opacity = String(reveal);
      fairy.style.transform = `translate(-50%, -100%) translateY(${(1 - reveal) * 18}%) scale(${.34 + .66 * reveal})`;
      speech.style.opacity = String(ease((p * TIMES.fairy - 700) / 750));
      garden.classList.toggle('wg-fairy-alive', reveal > .1);
      garden.classList.toggle('wg-fairy-finished', p === 1);
      setPhase('butterfly', p === 1 ? 'finished' : 'fairy-reveal');
    }
    function waitingFlower() {
      drawGardenCamera(10);
      flowerPose(1);
      fairy.style.opacity = '0';
      speech.style.opacity = '0';
      garden.classList.remove('wg-fairy-alive', 'wg-fairy-finished');
      setPhase('butterfly', 'flower-await');
    }
    function settle() {
      const revealing = fairyStart !== null || phases.butterfly === 'fairy-reveal';
      clearMotion();
      sound('stopFairyFound');
      zoo.classList.toggle('wg-reduced', reduced() || doc.hidden);
      garden.classList.toggle('wg-reduced', reduced() || doc.hidden);
      drawZoo(clock(), true);
      dream.style.opacity = '0';
      if (revealing) fairyCaught = true;
      if (counts.butterfly === 10) { if (fairyCaught) { drawGardenCamera(10); fairyPose(1); } else waitingFlower(); }
      else {
        drawGardenCamera(counts.butterfly);
        flower.style.opacity = '0';
        fairy.style.opacity = '0';
        speech.style.opacity = '0';
        garden.classList.remove('wg-fairy-alive', 'wg-fairy-finished');
        setPhase('butterfly', 'garden');
      }
      syncHit();
    }
    function tick(time) {
      frameRequest = null;
      if (doc.hidden || (currentStage !== 'zoo' && currentStage !== 'butterfly')) { settle(); return; }
      let moving = false;
      if (currentStage === 'zoo') moving = drawZoo(time);
      else {
        if (dreamStart !== null) {
          const p = clamp((time - dreamStart) / TIMES.dream);
          dream.style.opacity = String(1 - ease((p - .58) / .42));
          dream.style.setProperty('--wg-waking', String(ease((p - .3) / .7)));
          if (p < 1) moving = true;
          else { dreamStart = null; setPhase('butterfly', 'garden'); }
        }
        if (gardenMove) {
          const p = ease((time - gardenMove.start) / gardenMove.duration);
          drawGardenCamera(lerp(gardenMove.from, gardenMove.to, p));
          if (p < 1) moving = true;
          else gardenMove = null;
        }
        if (flowerStart !== null) {
          const p = clamp((time - flowerStart) / TIMES.flower);
          flowerPose(ease((p - .46) / .54));
          if (p < 1) moving = true;
          else { flowerStart = null; waitingFlower(); }
        }
        if (fairyStart !== null) {
          const p = clamp((time - fairyStart) / TIMES.fairy);
          fairyPose(p);
          if (p < 1) moving = true;
          else { fairyStart = null; fairyCaught = true; fairyPose(1); }
        }
      }
      if (moving) frameRequest = window.requestAnimationFrame(tick);
    }
    function run() { if (frameRequest === null) frameRequest = window.requestAnimationFrame(tick); }
    function resetExit() { settle(); }

    function render(stage, count, animate = false) {
      if (stage === 'butterfly') sound('prepareFairyFound');
      const valid = stage === 'zoo' || stage === 'butterfly';
      const switching = currentStage !== stage;
      if (!valid) {
        if (currentStage === 'zoo' || currentStage === 'butterfly') settle();
        currentStage = stage;
        zoo.hidden = true;
        garden.hidden = true;
        syncHit();
        return;
      }
      const next = Math.max(0, Math.min(10, Math.floor(Number(count) || 0)));
      const previous = counts[stage];
      if (!switching && next === previous) { syncHit(); return; }
      if (switching || next < previous || (stage === 'butterfly' && fairyStart !== null)) sound('stopFairyFound');
      if (switching || next < previous || !animate || reduced() || stage === 'butterfly') clearMotion();
      currentStage = stage;
      zoo.hidden = stage !== 'zoo';
      garden.hidden = stage !== 'butterfly';
      counts[stage] = next;
      (stage === 'zoo' ? zoo : garden).dataset.count = String(next);
      zoo.classList.toggle('wg-reduced', reduced() || doc.hidden);
      garden.classList.toggle('wg-reduced', reduced() || doc.hidden);
      const changing = animate && next > previous && !reduced() && !doc.hidden;
      if (stage === 'zoo') {
        if (next < 10) zooPartyStart = null;
        if (!changing || switching) { releaseStarts.fill(null); unlockedSound.fill(false); }
        if (changing) {
          const now = clock();
          for (let index = previous; index < next; index++) { releaseStarts[index] = now; unlockedSound[index] = false; }
          if (next === 10) { zooPartyStart = now; partySound = false; }
          drawZoo(now);
          run();
        } else drawZoo(clock(), true);
      } else {
        if (next < 10) fairyCaught = false;
        garden.classList.remove('wg-fairy-alive', 'wg-fairy-finished');
        fairy.style.opacity = '0';
        speech.style.opacity = '0';
        flower.style.opacity = '0';
        dream.style.opacity = '0';
        if (next === 10 && fairyCaught) { drawGardenCamera(10); fairyPose(1); }
        else if (next === 10 && !changing) waitingFlower();
        else {
          const now = clock();
          if (changing) {
            if (switching) camera = Math.max(0, next - 1);
            gardenMove = { from: camera, to: next, start: now, duration: next === 10 ? TIMES.flower : TIMES.barrier };
            if (next === 10) { flowerStart = now; setPhase('butterfly', 'flower-arriving'); }
            else setPhase('butterfly', 'garden');
          } else drawGardenCamera(next);
          if (switching && next === 0 && !reduced() && !doc.hidden) {
            dreamStart = now;
            dream.style.opacity = '1';
            dream.style.setProperty('--wg-waking', '0');
            setPhase('butterfly', 'dream');
          } else if (next < 10) setPhase('butterfly', 'garden');
          if (changing || dreamStart !== null) run();
        }
      }
      syncHit();
    }
    function playExit(stage) {
      if (stage === 'zoo' && currentStage === 'zoo' && counts.zoo === 10) {
        if (phases.zoo === 'finished') return 0;
        return Math.max(0, TIMES.zoo - (clock() - (zooPartyStart ?? clock())));
      }
      if (stage !== 'butterfly' || currentStage !== 'butterfly' || counts.butterfly !== 10 || fairyCaught || phases.butterfly === 'finished') return 0;
      if (fairyStart !== null) return Math.max(0, TIMES.fairy - (clock() - fairyStart));
      clearMotion();
      drawGardenCamera(10);
      flowerPose(1);
      if (doc.hidden) { fairyCaught = true; fairyPose(1); return 0; }
      sound('playFairyFound');
      setPhase('butterfly', 'fairy-reveal');
      if (reduced()) { fairyCaught = true; fairyPose(1); return 0; }
      fairyStart = clock();
      fairyPose(0);
      run();
      return TIMES.fairy;
    }
    function handleFlower(event) {
      if (!isAwaitingAction('butterfly') || doc.hidden || doc.body.classList.contains('herb-writing')) return;
      event.preventDefault();
      event.stopPropagation();
      if (typeof onActionRequest === 'function') { try { onActionRequest('butterfly'); } catch (_) {} }
      else playExit('butterfly');
    }
    function isAwaitingAction(stage) { return stage === 'butterfly' && currentStage === stage && counts.butterfly === 10 && phases.butterfly === 'flower-await'; }
    function isEndingComplete(stage) { return (stage === 'zoo' || stage === 'butterfly') && counts[stage] === 10 && phases[stage] === 'finished'; }
    function onVisibility() { if (doc.hidden) settle(); else { zoo.classList.toggle('wg-reduced', reduced()); garden.classList.toggle('wg-reduced', reduced()); syncHit(); } }
    function onPreference() { if (reduced()) settle(); else { zoo.classList.remove('wg-reduced'); garden.classList.remove('wg-reduced'); } }
    hitTarget.addEventListener('click', handleFlower);
    doc.addEventListener('visibilitychange', onVisibility);
    preference?.addEventListener?.('change', onPreference);
    window.addEventListener('resize', syncHit);
    const flowerImage = flower.querySelector('img');
    flowerImage.addEventListener('load', syncHit);
    flowerImage.addEventListener('error', () => { flowerImage.hidden = true; syncHit(); });
    drawZoo(clock(), true);
    drawGardenCamera(0);
    return {
      render, playExit, resetExit, isAwaitingAction, isEndingComplete,
      getHint(stage) { return stage === 'butterfly' && counts.butterfly === 10 ? fairyCaught ? '你找到我啦！' : '这朵花一动不动……抓住装成花的小精灵。' : ''; },
      arrivalTime(stage) { return stage === 'zoo' ? TIMES.zoo : stage === 'butterfly' ? TIMES.flower : 0; },
      actionTime(stage) { return stage === 'butterfly' ? TIMES.fairy : 0; },
      automaticEnding(stage) { return stage === 'zoo'; },
      get flowerHitTarget() { return hitTarget; },
      destroy() {
        if (destroyed) return;
        destroyed = true;
        clearMotion();
        sound('stopFairyFound');
        hitTarget.removeEventListener('click', handleFlower);
        doc.removeEventListener('visibilitychange', onVisibility);
        preference?.removeEventListener?.('change', onPreference);
        window.removeEventListener('resize', syncHit);
        Object.values(ASSETS).forEach(releaseImage);
        zoo.remove(); garden.remove(); hitTarget.remove();
      }
    };
  }

  window.HanziWildGardenStory = { create };
})(window);
