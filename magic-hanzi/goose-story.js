(function (window) {
  'use strict';

  const ENDING_TIME = 9000;
  const JOIN_TIME = 1300;
  // One literal per artwork keeps the offline builder's asset list explicit.
  const ASSETS = Object.freeze({
    courtyard: 'assets/story/goose-courtyard-v1.webp',
    goose: 'assets/story/golden-goose-v1.webp',
    followersA: 'assets/story/goose-followers-a-v1.webp',
    followersB: 'assets/story/goose-followers-b-v1.webp',
    princess: 'assets/story/goose-princess-v1.webp'
  });
  const PEOPLE = Object.freeze([
    { name: '面包师', prop: '擀面杖', atlas: 'followersA', cell: 0, x: 20.7, y: 81.3, lean: -22, size: 19.2 },
    { name: '挤奶女工', prop: '提桶', atlas: 'followersA', cell: 1, x: 27.7, y: 80.7, lean: 3, size: 19.6 },
    { name: '铁匠', prop: '木槌', atlas: 'followersA', cell: 2, x: 34.8, y: 80.0, lean: -4, size: 19.1 },
    { name: '裁缝', prop: '线卷', atlas: 'followersA', cell: 3, x: 41.8, y: 79.6, lean: 2, size: 19.8 },
    { name: '园丁', prop: '小水壶', atlas: 'followersA', cell: 4, x: 48.9, y: 79.8, lean: -3, size: 19.2 },
    { name: '传令员', prop: '卷纸', atlas: 'followersB', cell: 0, x: 55.9, y: 80.4, lean: 4, size: 19.5 },
    { name: '琴师', prop: '小提琴', atlas: 'followersB', cell: 1, x: 63.0, y: 81.0, lean: -4, size: 19.9 },
    { name: '厨师', prop: '小锅', atlas: 'followersB', cell: 2, x: 70.1, y: 81.7, lean: 3, size: 19.3 },
    { name: '画师', prop: '画具', atlas: 'followersB', cell: 3, x: 77.1, y: 82.4, lean: -2, size: 20.0 },
    { name: '鞋匠', prop: '靴子', atlas: 'followersB', cell: 4, x: 84.2, y: 82.9, lean: 4, size: 19.5 }
  ]);
  const artworkCache = new Map();

  function acquireArtwork(source, doc) {
    const src = String(source);
    const existing = artworkCache.get(src);
    if (existing) { existing.users++; return existing.url; }
    if (!/^data:image\/[^,]+;base64,/i.test(src)) return src;
    try {
      const view = doc.defaultView || window;
      const decode = view.atob || window.atob;
      const BlobType = view.Blob || window.Blob;
      const urls = view.URL || window.URL;
      if (typeof decode !== 'function' || typeof BlobType !== 'function' || typeof urls?.createObjectURL !== 'function') return src;
      const comma = src.indexOf(',');
      const binary = decode.call(view, src.slice(comma + 1));
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const url = urls.createObjectURL(new BlobType([bytes], { type: src.slice(5, comma).split(';')[0] }));
      artworkCache.set(src, { url, users: 1, urls });
      return url;
    } catch (_) { return src; }
  }

  function releaseArtwork(source) {
    const entry = artworkCache.get(String(source));
    if (!entry || --entry.users > 0) return;
    try { entry.urls.revokeObjectURL?.(entry.url); } catch (_) { /* Optional artwork cleanup. */ }
    artworkCache.delete(String(source));
  }

  function personMarkup(person, index, art) {
    const column = person.cell % 3, row = Math.floor(person.cell / 3);
    // Preserve everyone's left-to-right order while giving alternate people
    // a different stopping depth. They separate without crossing or colliding.
    const releaseX = (index - 4.5) * 3.4;
    const releaseY = (index % 2 ? 12 : -10) + index % 3 * 2;
    const fromX = (118 - person.x) / person.size * 100;
    return `<div class="gs-follower" data-person-index="${index}" data-person="${person.name}" data-prop="${person.prop}" hidden style="left:${person.x}%;top:${person.y}%;--gs-person-size:${person.size}%;--gs-lean:${person.lean}deg;--gs-arrive-x:${fromX.toFixed(2)}%;--gs-release-x:${releaseX}%;--gs-release-y:${releaseY}%;--gs-stagger:${index * 65}ms;--gs-step-delay:${index * -135}ms;z-index:${20 + index}">
      <span class="gs-person-shadow"></span><div class="gs-follower-motion"><div class="gs-follower-lean">
        <div class="gs-person-sprite"><img class="gs-person-art" src="${art[person.atlas]}" alt="" draggable="false" style="left:${-column * 100}%;top:${-row * 100}%"></div>
        <span class="gs-sticky-flash"></span>
      </div></div>
    </div>`;
  }

  function create({ document: doc }) {
    const view = doc.defaultView || window;
    const art = Object.fromEntries(Object.entries(ASSETS).map(([key, source]) => [key, acquireArtwork(source, doc)]));
    const scene = doc.createElement('div');
    scene.className = 'story-scene story-goose';
    scene.hidden = true;
    scene.setAttribute('aria-hidden', 'true');
    scene.innerHTML = `<div class="gs-frame"><div class="gs-courtyard-world">
      <div class="gs-courtyard-fallback"></div><img class="gs-courtyard-art" src="${art.courtyard}" alt="" draggable="false">
      <div class="gs-palace-light"></div>
      <div class="gs-princess"><div class="gs-princess-crop gs-princess-calm"><img src="${art.princess}" alt="" draggable="false"></div><div class="gs-princess-crop gs-princess-laugh"><img src="${art.princess}" alt="" draggable="false"></div><i class="gs-laugh-ring"></i><i class="gs-laugh-ring"></i></div>
      <div class="gs-balcony-front"><img src="${art.courtyard}" alt="" draggable="false"></div>
      <div class="gs-queue-world"><div class="gs-goose"><span class="gs-goose-shadow"></span><div class="gs-goose-motion"><img src="${art.goose}" alt="" draggable="false"><div class="gs-goose-sparks">${Array.from({ length: 9 }, (_, i) => `<i style="--gs-spark-x:${15 + i * 23 % 75}%;--gs-spark-y:${10 + i * 17 % 66}%;--gs-spark-delay:${i * 75}ms"></i>`).join('')}</div></div></div>
        ${PEOPLE.map((person, index) => personMarkup(person, index, art)).join('')}
      </div><div class="gs-near-haze"></div><div class="gs-frame-shade"></div>
    </div></div>`;
    doc.body.insertBefore(scene, doc.body.firstChild);

    const people = Array.from(scene.querySelectorAll('.gs-follower'));
    const timers = new Set();
    const media = view.matchMedia?.('(prefers-reduced-motion: reduce)');
    let active = false, shownCount = -1, generation = 0, endingUntil = 0, finished = false, destroyed = false;
    const reduced = () => Boolean(media?.matches);
    const now = () => view.performance?.now?.() ?? Date.now();

    function cancelTimers() {
      generation++;
      timers.forEach(handle => view.clearTimeout(handle));
      timers.clear();
      endingUntil = 0;
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
      scene.classList.remove('is-ending', 'is-procession', 'is-laughing', 'is-released', 'is-goose-cheering', 'is-finished');
      people.forEach(person => person.classList.remove('is-joining'));
      finished = false;
    }
    function finalPose() {
      clearPhases();
      if (shownCount !== 10) return;
      scene.classList.add('is-laughing', 'is-released', 'is-finished');
      scene.dataset.phase = 'celebration';
      finished = true;
    }
    function beginEnding() {
      cancelTimers();
      if (!active || shownCount !== 10) return 0;
      if (reduced() || doc.hidden) { finalPose(); return 0; }
      scene.classList.add('is-ending');
      scene.dataset.phase = 'last-arrival';
      endingUntil = now() + ENDING_TIME;
      later(1400, () => {
        people.forEach(person => person.classList.remove('is-joining'));
        scene.classList.add('is-procession');
        scene.dataset.phase = 'procession';
      });
      later(4300, () => { scene.classList.add('is-laughing'); scene.dataset.phase = 'princess-laughs'; });
      later(6000, () => { scene.classList.remove('is-procession'); scene.classList.add('is-released'); scene.dataset.phase = 'release'; });
      later(7600, () => { scene.classList.add('is-goose-cheering'); scene.dataset.phase = 'goose-cheers'; });
      later(ENDING_TIME, () => { endingUntil = 0; finalPose(); });
      return ENDING_TIME;
    }

    function render(stage, count, animate = false) {
      if (destroyed) return;
      if (stage !== 'goose') {
        cancelTimers();
        clearPhases();
        active = false;
        scene.hidden = true;
        shownCount = -1;
        scene.dataset.phase = 'hidden';
        return;
      }
      const next = Math.max(0, Math.min(10, Math.floor(Number(count) || 0)));
      if (active && next === shownCount) return;
      const previous = shownCount, wasActive = active;
      const joining = animate && wasActive && next > previous && !reduced() && !doc.hidden;
      cancelTimers();
      clearPhases();
      scene.classList.toggle('is-instant', !joining);
      active = true;
      shownCount = next;
      scene.hidden = false;
      scene.dataset.count = String(next);
      scene.dataset.phase = 'queue';
      scene.style.setProperty('--gs-camera-x', (Math.max(0, 10 - next) * 2.75).toFixed(2) + '%');
      people.forEach((person, index) => {
        person.hidden = index >= next;
        person.classList.toggle('is-stuck', index < next);
      });
      if (joining && next > 0) {
        const person = people[next - 1];
        void person.offsetWidth;
        person.classList.add('is-joining');
      }
      if (next === 10) {
        if (joining) beginEnding();
        else finalPose();
      } else if (joining) later(JOIN_TIME + 30, () => people[next - 1].classList.remove('is-joining'));
    }

    function playExit(stage = 'goose') {
      if (destroyed || stage !== 'goose' || !active || shownCount !== 10 || finished) return 0;
      // The tenth pass already starts the complete ending. Travel may inspect
      // its remaining duration, but never starts a second procession.
      return Math.max(0, endingUntil - now());
    }
    function resetExit() {
      cancelTimers();
      scene.classList.add('is-instant');
      if (shownCount === 10) finalPose();
      else { clearPhases(); scene.dataset.phase = active ? 'queue' : 'hidden'; }
    }
    function onVisibility() {
      scene.classList.toggle('is-suspended', Boolean(doc.hidden));
      if (doc.hidden) resetExit();
    }
    function onPageHide() {
      scene.classList.add('is-suspended');
      resetExit();
    }
    function onMotionPreference() { if (reduced()) resetExit(); }
    doc.addEventListener?.('visibilitychange', onVisibility);
    view.addEventListener?.('pagehide', onPageHide);
    view.addEventListener?.('pageshow', onVisibility);
    media?.addEventListener?.('change', onMotionPreference);
    scene.querySelectorAll('img').forEach(img => {
      img.addEventListener('error', () => { img.hidden = true; });
    });

    function destroy() {
      if (destroyed) return;
      resetExit();
      destroyed = true;
      doc.removeEventListener?.('visibilitychange', onVisibility);
      view.removeEventListener?.('pagehide', onPageHide);
      view.removeEventListener?.('pageshow', onVisibility);
      media?.removeEventListener?.('change', onMotionPreference);
      scene.remove();
      Object.values(ASSETS).forEach(releaseArtwork);
    }
    return { render, playExit, resetExit, destroy, arrivalTime: () => reduced() || doc.hidden ? 0 : ENDING_TIME, totalEndingTime: ENDING_TIME };
  }

  window.HanziGooseStory = Object.freeze({ create });
})(window);
