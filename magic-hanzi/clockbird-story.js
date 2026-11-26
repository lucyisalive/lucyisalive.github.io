(function (window) {
  'use strict';

  const STAGE = 'clockbird';
  const ENDING_TIME = 11000;
  const INSTALL_TIME = 900;
  const SONG_TIME = 900;
  const ASSETS = Object.freeze({
    workshop: 'assets/story/clockwork-workshop-v1.webp',
    machine: 'assets/story/clockwork-nightingale-v1.webp',
    wild: 'assets/story/nightingale-flock-v1.webp'
  });
  const imageUrls = new Map();
  let instance = 0;
  const clamp = value => Math.max(0, Math.min(1, value));
  const smooth = value => { const v = clamp(value); return v * v * (3 - 2 * v); };
  const between = (time, start, end) => smooth((time - start) / (end - start));
  const lerp = (start, end, progress) => start + (end - start) * progress;

  function acquireImage(source, doc) {
    if (!/^data:image\/[^,]+;base64,/i.test(source)) return source;
    const existing = imageUrls.get(source);
    if (existing) { existing.references++; return existing.url; }
    try {
      const view = doc.defaultView || window;
      const comma = source.indexOf(',');
      const binary = view.atob(source.slice(comma + 1));
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new view.Blob([bytes], { type: source.slice(5, comma).split(';')[0] });
      const url = view.URL.createObjectURL(blob);
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

  function gearPath(radius, teeth) {
    const points = [];
    for (let tooth = 0; tooth < teeth; tooth++) {
      for (let corner = 0; corner < 4; corner++) {
        const angle = (tooth + corner / 4) * Math.PI * 2 / teeth;
        const r = radius * (corner === 0 || corner === 3 ? .84 : 1);
        points.push(`${(Math.cos(angle) * r).toFixed(2)} ${(Math.sin(angle) * r).toFixed(2)}`);
      }
    }
    return `M${points.join('L')}Z`;
  }

  function gear(id, x, y, radius, teeth, reverse = false) {
    return `<g transform="translate(${x} ${y})"><g class="clockbird-rotor${reverse ? ' clockbird-rotor-reverse' : ''}" style="--gear-period:${7 * teeth / 18}s">
      <path class="clockbird-gear-rim" d="${gearPath(radius, teeth)}" fill="url(#${id}-brass)"/>
      <circle r="${radius * .68}" class="clockbird-gear-well"/>
      ${Array.from({ length: 5 }, (_, index) => `<path class="clockbird-gear-spoke" d="M0 ${-radius * .65}V${radius * .65}" transform="rotate(${index * 36})"/>`).join('')}
      <circle r="${radius * .2}" fill="url(#${id}-brass)"/><circle r="${radius * .075}" class="clockbird-pin"/>
    </g></g>`;
  }

  const PARTS = [
    { name: '承轴骨架', x: -920, y: 180, turn: -22 },
    { name: '卷簧', x: 650, y: -560, turn: 120 },
    { name: '主齿轮', x: -850, y: -160, turn: -145 },
    { name: '传动齿轮组', x: 650, y: 340, turn: 110 },
    { name: '共鸣管', x: 750, y: -330, turn: 32 },
    { name: '胸甲', x: -500, y: -600, turn: -30 },
    { name: '尾羽', x: -1050, y: 110, turn: -24 },
    { name: '远翼', x: 230, y: -820, turn: 28 },
    { name: '近翼', x: -630, y: -530, turn: -40 },
    { name: '头颈与宝石眼', x: 800, y: -490, turn: 20 }
  ];

  // The five artwork regions are anatomical components, not rectangular tiles.
  // Their final contours are calibrated against the actual transparent bird art.
  const MACHINE_CLIPS = {
    chest: '550,330 900,220 1160,250 1320,345 1370,560 1250,690 1070,770 1140,870 1260,910 1260,1024 650,1024 615,900 720,730 560,650',
    tail: '0,720 510,510 690,530 680,660 360,960 0,1024',
    farwing: '340,500 450,380 590,240 830,130 1060,150 1090,290 865,400 640,490',
    nearwing: '410,810 445,660 530,570 675,500 790,510 825,575 845,680 735,750 570,810',
    head: '1025,265 1070,195 1110,120 1130,0 1536,0 1536,270 1390,400 1360,520 1265,500 1225,390 1130,315'
  };
  const REGION_ORDER = ['head', 'nearwing', 'farwing', 'tail', 'chest'];
  const WILD_REGIONS = {
    near: '130,0 620,0 710,300 790,440 760,610 600,660 380,600 180,410',
    far: '850,480 1190,450 1480,390 1536,820 1100,900 760,750 800,610',
    body: '170,1024 600,1024 700,800 930,670 1000,460 1120,370 1130,270 850,240 720,350 590,500 450,730'
  };
  const FLOCK = [
    { x: .67, y: .29, width: .09, arc: -.04 },
    { x: .78, y: .21, width: .08, arc: .03 },
    { x: .88, y: .27, width: .095, arc: -.025 },
    { x: .73, y: .36, width: .105, arc: .035 },
    { x: .86, y: .38, width: .085, arc: -.045 },
    { x: .62, y: .22, width: .072, arc: .02 },
    { x: .83, y: .16, width: .07, arc: -.02 },
    { x: .885, y: .33, width: .078, arc: .03 },
    { x: .76, y: .29, width: .09, arc: -.03 }
  ];

  function create({ document: doc }) {
    const id = `clockbird-${++instance}`;
    const art = Object.fromEntries(Object.entries(ASSETS).map(([key, src]) => [key, acquireImage(src, doc)]));
    const scene = doc.createElement('div');
    scene.className = 'story-scene story-clockbird';
    scene.hidden = true;
    scene.setAttribute('aria-hidden', 'true');
    scene.style.setProperty('--clockbird-workshop', `url("${art.workshop}")`);
    const image = (clip, className = '') => `<image class="clockbird-machine-art ${className}" href="${art.machine}" width="1536" height="1024" preserveAspectRatio="xMidYMid meet" mask="url(#${id}-${clip})"/>`;
    const part = (number, content, className = '') => {
      const spec = PARTS[number - 1];
      return `<g class="clockbird-part ${className}" data-part="${number}" data-name="${spec.name}" style="--part-x:${spec.x}px;--part-y:${spec.y}px;--part-turn:${spec.turn}deg"><g class="clockbird-install-motion">${content}</g></g>`;
    };
    const wild = index => `<div class="clockbird-wild-bird" data-wild-bird="${index}" style="--wild-delay:${-index * .137}s">
      <svg viewBox="0 0 1536 1024" class="clockbird-wild-sprite">
        <image href="${art.wild}" width="1536" height="1024" mask="url(#${id}-wild-body)"/>
        <g class="clockbird-wild-far-wing"><image href="${art.wild}" width="1536" height="1024" mask="url(#${id}-wild-far)"/></g>
        <g class="clockbird-wild-near-wing"><image href="${art.wild}" width="1536" height="1024" mask="url(#${id}-wild-near)"/></g>
      </svg></div>`;
    scene.innerHTML = `
      <div class="clockbird-frame">
        <div class="clockbird-ambience"></div>
        <div class="clockbird-world-position"><div class="clockbird-world">
          <div class="clockbird-workshop-art"></div>
          <div class="clockbird-window-dawn"><i></i></div>
          <svg class="clockbird-shared-defs" width="0" height="0"><defs>
            ${['near', 'far', 'body'].map((key, index) => `<mask id="${id}-wild-${key}" maskUnits="userSpaceOnUse" x="0" y="0" width="1536" height="1024" style="mask-type:luminance"><polygon points="${WILD_REGIONS[key]}" fill="white"/>${['near', 'far'].slice(0, index).map(other => `<polygon points="${WILD_REGIONS[other]}" fill="black"/>`).join('')}</mask>`).join('')}
          </defs></svg>
          <div class="clockbird-flock-window">${FLOCK.map((_, index) => wild(index)).join('')}</div>
          <div class="clockbird-table-shadow"></div>
          <div class="clockbird-machine">
            <svg class="clockbird-machine-sprite" viewBox="0 0 1536 1024">
              <defs>
                <linearGradient id="${id}-brass" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#68421d"/><stop offset=".22" stop-color="#d9b76d"/><stop offset=".43" stop-color="#f0d59a"/><stop offset=".57" stop-color="#a06a2f"/><stop offset=".79" stop-color="#d4ae60"/><stop offset="1" stop-color="#50351b"/></linearGradient>
                <linearGradient id="${id}-pipe" x1="0" x2="1"><stop stop-color="#573618"/><stop offset=".38" stop-color="#e9cc8a"/><stop offset=".62" stop-color="#b58c43"/><stop offset="1" stop-color="#4a311b"/></linearGradient>
                <radialGradient id="${id}-cavity"><stop stop-color="#172020"/><stop offset="1" stop-color="#071112"/></radialGradient>
                <mask id="${id}-carrier" maskUnits="userSpaceOnUse" x="0" y="0" width="1536" height="1024" style="mask-type:luminance"><ellipse cx="1034" cy="466" rx="248" ry="164" fill="white"/><ellipse cx="1034" cy="466" rx="225" ry="143" fill="black"/><polygon points="750,748 803,744 854,892 970,935 1005,1024 680,1024 685,927 792,901" fill="white"/><polygon points="920,735 983,735 1046,878 1215,912 1240,1004 950,1004 930,918 979,880" fill="white"/></mask>
                ${REGION_ORDER.map((key, regionIndex) => `<mask id="${id}-${key}" maskUnits="userSpaceOnUse" x="0" y="0" width="1536" height="1024" style="mask-type:luminance"><polygon points="${MACHINE_CLIPS[key]}" fill="white"/>${REGION_ORDER.slice(0, regionIndex).map(other => `<polygon points="${MACHINE_CLIPS[other]}" fill="black"/>`).join('')}</mask>`).join('')}
              </defs>
              ${part(1, `<g class="clockbird-bearing-frame"><path class="clockbird-frame-cavity" d="M1030 319C902 316 806 367 804 466C801 552 889 607 1029 606C1164 605 1253 548 1252 465C1251 383 1164 321 1030 319Z" fill="url(#${id}-cavity)"/><path class="clockbird-frame-rim" d="M1030 319C902 316 806 367 804 466C801 552 889 607 1029 606C1164 605 1253 548 1252 465C1251 383 1164 321 1030 319Z" stroke="url(#${id}-brass)"/><path class="clockbird-frame-rib" d="M824 466H1225M919 340L1130 582M835 532L1168 357"/><path class="clockbird-leg" style="stroke:url(#${id}-brass)" d="M900 600L785 774L835 920L754 950M835 920L902 966M1120 598L953 760L1032 914L973 939M1032 914L1155 949"/>${[0, 1, 2, 3, 4, 5].map(i => `<circle cx="${850 + i * 67}" cy="${i % 2 ? 565 : 365}" r="5" class="clockbird-frame-rivet"/>`).join('')}</g>${image('carrier', 'clockbird-carrier-art')}`)}
              ${part(2, `<g class="clockbird-spring-group" transform="translate(911 405) scale(.64)"><circle r="58" class="clockbird-spring-drum"/><path class="clockbird-spring" d="M0 0C-11-17 17-28 28-11C45 14 12 44-17 29C-60 8-44-56 7-62C77-70 109 21 55 69C-10 124-116 61-110-22"/><path class="clockbird-spring-pin" d="M-16 0H16M0-16V16"/></g>`)}
              ${part(3, gear(id, 1035, 507, 73, 18))}
              ${part(4, gear(id, 1044, 390, 45, 14, true) + gear(id, 934, 499, 30, 11, true) + '<path class="clockbird-link-arm" d="M934 499L1035 507L1044 390"/>')}
              ${part(5, `<g class="clockbird-resonators">${[0, 1, 2].map(i => `<g class="clockbird-resonator" style="--pipe-i:${i}" transform="translate(${1147 + i * 25} ${365 + i * 20})"><rect class="clockbird-pipe" x="-8" width="16" height="${170 - i * 29}" rx="7" fill="url(#${id}-pipe)"/><ellipse cy="8" rx="7" ry="4" class="clockbird-pipe-mouth"/><path class="clockbird-pipe-ring" d="M-9 29H9M-9 42H9"/></g>`).join('')}<path class="clockbird-air-link" d="M1148 529Q1103 577 1040 563"/></g>`)}
              ${part(6, image('chest'))}
              ${part(7, image('tail'))}
              ${part(8, `<g class="clockbird-metal-far-wing">${image('farwing')}</g>`)}
              ${part(9, `<g class="clockbird-metal-near-wing">${image('nearwing')}</g>`)}
              ${part(10, `<g class="clockbird-head-hinge">${image('head')}</g>`)}
            </svg>
          </div>
          <svg class="clockbird-song-lines" viewBox="0 0 1000 1400" preserveAspectRatio="none">
            <path d="M787 503Q824 480 853 496T924 476"/><path d="M790 517Q840 496 877 511T951 493"/><path d="M793 530Q833 529 881 535T963 513"/>
          </svg>
          <div class="clockbird-dust">${Array.from({ length: 8 }, (_, index) => `<i style="--dust-i:${index};--dust-x:${12 + index * 11}%"></i>`).join('')}</div>
        </div></div>
        <div class="clockbird-frame-shade"></div>
      </div>`;
    doc.body.insertBefore(scene, doc.body.firstChild);
    const parts = Array.from(scene.querySelectorAll('.clockbird-part'));
    const machine = scene.querySelector('.clockbird-machine');
    const birds = Array.from(scene.querySelectorAll('.clockbird-wild-bird'));
    const world = scene.querySelector('.clockbird-world');
    const shadow = scene.querySelector('.clockbird-table-shadow');
    const dawn = scene.querySelector('.clockbird-window-dawn');
    const preference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const reduced = () => Boolean(preference?.matches);
    let active = false;
    let shownCount = -1;
    let frameRequest = null;
    let soundPlayed = false;
    let destroyed = false;
    let phase = '';

    function setPhase(next) {
      if (phase === next) return;
      phase = next;
      scene.dataset.phase = next;
    }

    function cancelEnding() {
      try { window.HanziGameFeedback?.stopClockbirdChorus?.(); } catch (_) {}
      if (frameRequest !== null) window.cancelAnimationFrame(frameRequest);
      frameRequest = null;
    }

    function positionEnding(progress) {
      const p = clamp(progress), time = p * ENDING_TIME;
      const lift = between(time, 4300, 6900);
      const flight = between(time, 4300, ENDING_TIME);
      scene.dataset.endingProgress = p.toFixed(4);
      scene.classList.toggle('clockbird-singing', time >= SONG_TIME && time < 5000 && p < 1);
      scene.classList.toggle('clockbird-flapping', time >= 4250 && p < 1);
      scene.classList.toggle('clockbird-finished', p === 1);
      setPhase(p === 1 ? 'finished' : time < SONG_TIME ? 'last-part' : time < 2600 ? 'singing' : time < 4300 ? 'chorus' : time < 6900 ? 'taking-flight' : 'toward-dawn');
      const travel = between(time, 4300, ENDING_TIME);
      const v = 1 - travel;
      const x = .46 * v ** 3 + 3 * .55 * v * v * travel + 3 * .79 * v * travel * travel + .824 * travel ** 3;
      const y = .505 * v ** 3 + 3 * .27 * v * v * travel + 3 * .31 * v * travel * travel + .345 * travel ** 3;
      const scale = lerp(1, .2, lift) * lerp(1, .4, between(time, 6900, ENDING_TIME));
      machine.style.left = `${x * 100}%`;
      machine.style.top = `${y * 100}%`;
      machine.style.transform = `translate(-50%, -50%) scale(${scale})`;
      machine.style.filter = `drop-shadow(0 ${7 * (1 - lift)}px ${5 * (1 - lift)}px #090b0b80) brightness(${1 + .18 * flight})`;
      shadow.style.opacity = String(.45 * (1 - lift));
      shadow.style.transform = `translateX(-50%) scale(${1 - lift * .65})`;
      world.style.transform = `scale(${1 + .14 * between(time, 6000, ENDING_TIME)})`;
      dawn.style.opacity = String(.08 + .56 * between(time, 2800, ENDING_TIME));
      birds.forEach((bird, index) => {
        const spec = FLOCK[index];
        const arrival = between(time, 2600 + index * 65, 3500 + index * 65);
        const onward = p === 1 ? 1 : between(time, 4700 + index * 70, ENDING_TIME);
        const targetX = .82 + (spec.x - .79) * .32;
        const targetY = .344 + (spec.y - .27) * .17;
        const bx = lerp(lerp(.46 - index * .015, spec.x, arrival), targetX, onward) + Math.sin(onward * Math.PI) * spec.arc;
        const by = lerp(lerp(spec.y + .035, spec.y, arrival), targetY, onward) - Math.sin(onward * Math.PI) * (.022 + index % 3 * .012);
        bird.style.left = `${bx * 100}%`;
        bird.style.top = `${by * 100}%`;
        bird.style.width = `${spec.width * (1 - .65 * onward) * 100}%`;
        bird.style.opacity = String(arrival * (1 - .12 * onward));
        bird.style.transform = `translate(-50%, -50%) rotate(${-4 - onward * 9 + index % 3 * 3}deg)`;
      });
    }

    function resetExit() {
      cancelEnding();
      soundPlayed = false;
      scene.classList.remove('clockbird-singing', 'clockbird-flapping', 'clockbird-finished');
      parts.forEach(part => part.classList.remove('is-arriving'));
      positionEnding(0);
      setPhase('assembling');
      if (doc.hidden && shownCount === 10) positionEnding(1);
    }

    function startEnding() {
      cancelEnding();
      soundPlayed = false;
      if (reduced() || doc.hidden || scene.hidden) { positionEnding(1); return 0; }
      positionEnding(0);
      const started = window.performance?.now?.() ?? Date.now();
      function animate(time) {
        if (!active || doc.hidden || scene.hidden) {
          frameRequest = null;
          positionEnding(1);
          return;
        }
        const elapsed = Math.max(0, time - started);
        positionEnding(elapsed / ENDING_TIME);
        if (elapsed >= SONG_TIME && elapsed < 5000 && !soundPlayed) {
          soundPlayed = true;
          try {
            const playback = window.HanziGameFeedback?.playClockbirdChorus?.();
            playback?.catch?.(() => {});
          } catch (_) {}
        }
        if (elapsed >= 5000) soundPlayed = true;
        if (elapsed < ENDING_TIME) frameRequest = window.requestAnimationFrame(animate);
        else frameRequest = null;
      }
      frameRequest = window.requestAnimationFrame(animate);
      return ENDING_TIME;
    }

    function playExit(stage) {
      if (stage !== STAGE || !active || shownCount !== 10) return 0;
      resetExit();
      return startEnding();
    }

    function render(stage, count, animate = false) {
      if (stage !== STAGE) {
        if (active) resetExit();
        active = false;
        shownCount = -1;
        scene.hidden = true;
        return;
      }
      const next = Math.max(0, Math.min(10, Math.floor(Number(count) || 0)));
      if (active && shownCount === next) return;
      const previous = shownCount;
      active = true;
      scene.hidden = false;
      shownCount = next;
      resetExit();
      scene.dataset.count = String(next);
      scene.classList.toggle('clockbird-running', next >= 2);
      scene.classList.toggle('clockbird-armored', next >= 6);
      scene.classList.toggle('clockbird-still', reduced() || doc.hidden);
      const arriving = animate && next > Math.max(0, previous) && !reduced() && !doc.hidden;
      parts.forEach((part, index) => {
        part.classList.toggle('is-installed', index < next);
        if (arriving && index === next - 1) part.classList.add('is-arriving');
      });
      if (next === 10) {
        if (arriving) startEnding();
        else positionEnding(1);
      }
    }

    function settle() {
      if (!active) return;
      cancelEnding();
      parts.forEach(part => part.classList.remove('is-arriving'));
      scene.classList.toggle('clockbird-still', reduced() || doc.hidden);
      if (shownCount === 10) positionEnding(1);
    }
    function onVisibility() { if (doc.hidden) settle(); else if (active) scene.classList.toggle('clockbird-still', reduced()); }
    function onPreference() { if (reduced()) settle(); else scene.classList.toggle('clockbird-still', doc.hidden); }
    doc.addEventListener('visibilitychange', onVisibility);
    preference?.addEventListener?.('change', onPreference);
    positionEnding(0);
    setPhase('assembling');

    return {
      render, playExit, resetExit,
      arrivalTime: ENDING_TIME,
      totalEndingTime: ENDING_TIME,
      growthTime: INSTALL_TIME,
      automaticEnding: true,
      destroy() {
        if (destroyed) return;
        destroyed = true;
        cancelEnding();
        doc.removeEventListener('visibilitychange', onVisibility);
        preference?.removeEventListener?.('change', onPreference);
        Object.values(ASSETS).forEach(releaseImage);
        scene.remove();
      }
    };
  }

  window.HanziClockbirdStory = { create };
})(window);
