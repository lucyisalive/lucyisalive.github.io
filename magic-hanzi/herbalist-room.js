(function () {
  'use strict';

  const ROOM_SIZE = 10;
  const PASS_COIN = 1;
  const LEVEL_COIN = 5;
  const RANKS = [
    { threshold: 0, title: '黑袍', icon: 'assets/robes/black.svg' },
    { threshold: 300, title: '紫袍', icon: 'assets/robes/purple.svg' },
    { threshold: 600, title: '绿袍', icon: 'assets/robes/green.svg' },
    { threshold: 1000, title: '蓝袍', icon: 'assets/robes/blue.svg' },
    { threshold: 2000, title: '银袍', icon: 'assets/robes/silver.svg' },
    { threshold: 3000, title: '血袍', icon: 'assets/robes/blood.svg' },
  ];
  const WALLET_KEY = 'hanzi-herbalist-wallet-v1';
  const HERB_COLORS = [
    '#a7d971', '#c69cf0', '#f0b758', '#63ccc8', '#ed938a',
    '#78cfa1', '#88a9ee', '#f3d478', '#dc9ecc', '#d9a773',
  ];
  const BOTTLE_SHAPES = ['45% 45% 38% 38%', '22% 22% 18% 18%', '50% 50% 25% 25%'];
  const STAGES = {
    herbs: {
      number: '第一关', title: '草药房', unit: '种草药',
      intro: '石墙挡住了去路。穿墙药水需要十种不同的草药。调好后喝下它，你就能穿越一切障碍。',
      task: '每通过一个字，就加一种草药。',
      start: '开始配药', step: '滴一滴', auto: '播放到调成', retry: '重新调配',
      demoHint: '点「滴一滴」，看草药瓶从架上飞起来。',
      demoFinished: '十种草药都加进去了。穿墙药水调好啦！',
      next: '喝下药水，去星象台', interval: 1110,
    },
    stars: {
      number: '第二关', title: '星象台', unit: '颗星星',
      intro: '你穿过了石墙，沿着山路来到星象台。这里的望远镜正对着夜空。',
      task: '每通过一个字，天上就亮起一颗星。十颗星连在一起，会变成什么？',
      start: '开始观星', step: '点亮一颗星', auto: '播放到十颗星', retry: '重新点星',
      demoHint: '点「点亮一颗星」，看看夜空会变成什么样。',
      demoFinished: '十颗星连成一只鸟。瞧，它展开翅膀飞起来了！',
      next: '回草药房', interval: 520,
    },
  };

  function create({ document: doc, onTap }) {
    const body = doc.body;
    const page = doc.querySelector('.topbar');
    if (!page) return {};
    const backdrop = doc.createElement('div');
    backdrop.id = 'herbalistBackdrop';
    backdrop.setAttribute('aria-hidden', 'true');
    backdrop.innerHTML = `
      <div class="herb-set"><div class="herb-light"></div></div>
      <div class="herb-bench">
        <div class="herb-shelf">${HERB_COLORS.map((color, index) => `
          <span class="herb-bottle" style="--herb-index:${index};--herb-color:${color};--herb-shape:${BOTTLE_SHAPES[index % BOTTLE_SHAPES.length]}">
            <i class="herb-bottle-body"></i>
          </span>`).join('')}
        </div>
        <div class="herb-apparatus">
          <div class="herb-shadow"></div>
          <div class="herb-flame"><i></i><i></i><i></i></div>
          <div class="herb-glass">
            <div class="herb-liquid"><i></i><i></i><i></i></div>
            <div class="herb-ticks"></div>
          </div>
          <div class="herb-rim"></div>
          <div class="herb-drop"></div>
          <div class="herb-splash"></div>
        </div>
      </div>`;
    body.insertBefore(backdrop, body.firstChild);
    let observatory;
    try { observatory = doc.defaultView?.HanziObservatory?.create({ document: doc }); }
    catch (_) { /* An optional scene must leave the lesson playable. */ }

    const hud = doc.createElement('div');
    hud.className = 'herb-hud';
    hud.innerHTML = `
      <button type="button" class="herb-pill" id="herbHome"><span aria-hidden="true" class="herb-home-icon"></span>巫师小屋</button>
      <div class="herb-hud-spacer"></div>
      <button type="button" class="herb-pill" id="herbWallet" aria-label="古银币 0 枚"><span class="herb-coin-icon" aria-hidden="true">✧</span><span id="herbCoins">0</span></button>
      <button type="button" class="herb-pill" id="herbRank"><img class="herb-rank-icon" id="herbRankIcon" src="${RANKS[0].icon}" width="24" height="24" alt=""><span id="herbRankLabel">${RANKS[0].title}</span></button>`;
    page.insertBefore(hud, page.lastElementChild);

    const controls = doc.createElement('div');
    controls.className = 'herb-controls';
    controls.innerHTML = `
      <header class="herb-caption"><span id="herbChapter"></span><h1 id="herbTitle"></h1></header>
      <div class="herb-meter" aria-live="polite"><span class="herb-meter-gem" aria-hidden="true"></span><span id="herbMeasure">0 / 10 种草药</span></div>
      <section class="herb-card" id="herbIntro">
        <p id="herbIntroStory"></p>
        <p id="herbIntroTask"></p>
        <div class="herb-actions">
          <button class="herb-primary" id="herbStart" type="button"><span id="herbStartText"></span><span aria-hidden="true">→</span></button>
          <button class="herb-secondary" id="herbShowDemo" type="button">观看两关演示</button>
        </div>
      </section>
      <section class="herb-card" id="herbDemo" hidden>
        <p id="herbDemoStatus" aria-live="polite">点「滴一滴」，看草药瓶从架上飞起来。</p>
        <div class="herb-actions">
          <button class="herb-primary" id="herbDemoNext" type="button" hidden></button>
          <button class="herb-primary" id="herbDemoDrop" type="button"></button>
          <button class="herb-secondary" id="herbDemoPlay" type="button"></button>
          <button class="herb-secondary" id="herbDemoExit" type="button">退出演示</button>
        </div>
      </section>
    `;
    body.appendChild(controls);

    const cottage = doc.createElement('dialog');
    cottage.className = 'herb-cottage';
    cottage.setAttribute('aria-labelledby', 'herbCottageName');
    cottage.innerHTML = `
      <div class="herb-cottage-card">
        <h2 id="herbCottageName">我的巫师小屋</h2>
        <p>这里可以安放旅途中收集的法器、家具和小伙伴。</p>
        <button class="herb-primary" type="button" id="herbCottageExit">继续探险 <span aria-hidden="true">→</span></button>
      </div>`;
    body.appendChild(cottage);

    const info = doc.createElement('dialog');
    info.className = 'herb-info';
    info.setAttribute('aria-labelledby', 'herbInfoTitle');
    info.innerHTML = `
      <h2 id="herbInfoTitle"></h2><p id="herbInfoCopy"></p>
      <button type="button" id="herbInfoExit" class="herb-primary">好</button>`;
    body.appendChild(info);

    const curtain = doc.createElement('div');
    curtain.className = 'herb-curtain';
    curtain.setAttribute('aria-hidden', 'true');
    curtain.innerHTML = '<div class="herb-passage"></div>';
    body.appendChild(curtain);

    const get = id => doc.getElementById(id);
    const setupButton = (id, handler) => onTap(get(id), handler);
    const meter = get('herbMeasure');
    const glass = backdrop.querySelector('.herb-glass');
    const bottles = Array.from(backdrop.querySelectorAll('.herb-bottle'));
    const demoStatus = get('herbDemoStatus');
    const demoDrop = get('herbDemoDrop');
    const demoPlay = get('herbDemoPlay');
    const demoNext = get('herbDemoNext');
    const hudWallet = get('herbWallet');
    const rankIcon = get('herbRankIcon');
    const rankLabel = get('herbRankLabel');
    rankIcon.addEventListener('error', () => { rankIcon.hidden = true; });

    let mode = 'intro';
    let stage = 'herbs';
    let displayStage = stage;
    let renderedStage;
    let renderedCount;
    let actualFill = 0;
    let demoFill = 0;
    let mastered = 0;
    let coins = 0;
    let pouringBottle;
    let demoTimer;
    let fadeTimer;
    let autoPlaying = false;
    let writing = true;
    let storage;

    try {
      storage = doc.defaultView?.localStorage;
      const saved = Number(storage?.getItem(WALLET_KEY));
      if (Number.isSafeInteger(saved) && saved >= 0) coins = saved;
    } catch (_) { /* Preview remains playable. */ }

    function updateCoins(increase) {
      coins += increase;
      if (increase) {
        try { storage?.setItem(WALLET_KEY, String(coins)); }
        catch (_) { /* Visual rewards stay available for this session. */ }
      }
      get('herbCoins').textContent = String(coins);
      hudWallet.setAttribute('aria-label', '古银币 ' + coins + ' 枚');
    }

    function rank() {
      return RANKS.findLast ? RANKS.findLast(entry => mastered >= entry.threshold)
        : RANKS.slice().reverse().find(entry => mastered >= entry.threshold);
    }

    function updateMastered(count) {
      if (Number.isSafeInteger(count) && count >= 0) mastered = count;
      const current = rank();
      rankLabel.textContent = current.title;
      if (rankIcon.getAttribute('src') !== current.icon) {
        rankIcon.hidden = false;
        rankIcon.setAttribute('src', current.icon);
      }
    }

    function renderFill(value, animate = false) {
      const fill = Math.min(ROOM_SIZE, Math.max(0, value));
      const previous = Number(backdrop.dataset.fill || 0);
      const shouldPour = animate && fill > previous;
      backdrop.classList.remove('herb-pouring');
      pouringBottle?.classList.remove('is-pouring');
      pouringBottle = null;
      backdrop.classList.toggle('herb-instant', !shouldPour);
      bottles.forEach((bottle, index) => bottle.classList.toggle('is-used', index < fill));
      if (shouldPour) {
        pouringBottle = bottles[fill - 1];
        backdrop.style.setProperty('--herb-drop-color', HERB_COLORS[fill - 1]);
        // Allow repeated demo pours to restart the shared droplet and splash.
        glass.getBoundingClientRect();
        backdrop.classList.add('herb-pouring');
        pouringBottle.classList.add('is-pouring');
      }
      backdrop.style.setProperty('--herb-liquid', String(fill * 0.079));
      backdrop.dataset.fill = String(fill);
      backdrop.classList.toggle('herb-complete', fill === ROOM_SIZE);
    }

    function renderProgress(value, animate = false) {
      const count = Math.min(ROOM_SIZE, Math.max(0, value));
      if (renderedStage === displayStage && renderedCount === count) return;
      renderedStage = displayStage;
      renderedCount = count;
      meter.textContent = count + ' / ' + ROOM_SIZE + ' ' + STAGES[displayStage].unit;
      if (displayStage === 'herbs') renderFill(count, animate);
      else {
        try { observatory?.render(count, animate); }
        catch (_) { /* The progress display is independent of the animation. */ }
      }
    }

    function display(next) {
      displayStage = next;
      body.dataset.herbStage = next;
      const story = STAGES[next];
      get('herbChapter').textContent = story.number;
      get('herbTitle').textContent = story.title;
      get('herbIntroStory').textContent = story.intro;
      get('herbIntroTask').textContent = story.task;
      get('herbStartText').textContent = story.start;
    }

    function setMode(next) {
      mode = next;
      body.dataset.herbMode = next;
      get('herbIntro').hidden = next !== 'intro';
      get('herbDemo').hidden = next !== 'demo';
    }

    function updateDemoControls() {
      const story = STAGES[displayStage];
      const finished = demoFill === ROOM_SIZE;
      demoDrop.disabled = autoPlaying;
      demoPlay.disabled = autoPlaying;
      demoPlay.hidden = finished;
      demoPlay.textContent = story.auto;
      demoDrop.textContent = finished ? story.retry : story.step;
      demoDrop.classList.toggle('herb-primary', !finished);
      demoDrop.classList.toggle('herb-secondary', finished);
      demoNext.hidden = !finished;
      demoNext.textContent = displayStage === 'herbs' ? story.next : '再看一次两关演示';
      demoStatus.textContent = finished ? story.demoFinished : story.demoHint;
    }

    function stopDemo() {
      clearTimeout(demoTimer);
      autoPlaying = false;
    }

    function addDemoDrop() {
      demoFill += 1;
      renderProgress(demoFill, true);
      updateDemoControls();
    }

    function showInfo(title, message) {
      get('herbInfoTitle').textContent = title;
      get('herbInfoCopy').textContent = message;
      if (!info.open) info.showModal();
    }

    function resetCurtain() {
      clearTimeout(fadeTimer);
      curtain.classList.remove('herb-fade', 'herb-crossing');
    }

    function transition(nextStage, nextMode) {
      resetCurtain();
      function reveal() {
        display(nextStage);
        setMode(nextMode);
        renderProgress(nextMode === 'demo' ? demoFill : actualFill);
        if (nextMode === 'demo') updateDemoControls();
        (nextMode === 'demo' ? demoDrop : get('herbStart')).focus({ preventScroll: true });
      }
      if (doc.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) {
        reveal();
        return;
      }
      curtain.getBoundingClientRect();
      const crossingWall = displayStage === 'herbs' && nextStage === 'stars';
      curtain.classList.add(crossingWall ? 'herb-crossing' : 'herb-fade');
      setMode('travel');
      fadeTimer = setTimeout(reveal, crossingWall ? 704 : 245);
    }

    setupButton('herbStart', () => {
      setMode('playing');
      const focus = writing ? get('submitBtn') : get('restartBtn');
      focus.focus({ preventScroll: true });
    });
    setupButton('herbShowDemo', () => {
      stopDemo();
      demoFill = 0;
      display('herbs');
      setMode('demo');
      renderProgress(0);
      updateDemoControls();
      demoDrop.focus({ preventScroll: true });
    });
    setupButton('herbDemoDrop', () => {
      if (autoPlaying) return;
      if (demoFill === ROOM_SIZE) {
        demoFill = 0;
        renderProgress(0);
        updateDemoControls();
      } else addDemoDrop();
    });
    setupButton('herbDemoPlay', () => {
      if (autoPlaying || demoFill === ROOM_SIZE) return;
      autoPlaying = true;
      function playDrop() {
        if (mode !== 'demo') return;
        addDemoDrop();
        if (demoFill === ROOM_SIZE) {
          stopDemo();
          updateDemoControls();
        } else demoTimer = setTimeout(playDrop, STAGES[displayStage].interval);
      }
      playDrop();
    });
    setupButton('herbDemoExit', () => {
      stopDemo();
      display(stage);
      setMode('intro');
      renderProgress(actualFill);
      get('herbShowDemo').focus({ preventScroll: true });
    });
    setupButton('herbDemoNext', () => {
      if (mode !== 'demo' || demoFill !== ROOM_SIZE) return;
      stopDemo();
      demoFill = 0;
      transition(displayStage === 'herbs' ? 'stars' : 'herbs', 'demo');
    });
    setupButton('herbHome', () => {
      if (!cottage.open) cottage.showModal();
    });
    setupButton('herbCottageExit', () => cottage.close());
    setupButton('herbInfoExit', () => info.close());
    setupButton('herbWallet', () => showInfo('古银币 · ' + coins + ' 枚',
      '每正式通过一个字得 1 枚，每完成一关再得 5 枚。'));
    setupButton('herbRank', () => {
      const next = RANKS.find(entry => entry.threshold > mastered);
      showInfo(rank().title, '已掌握 ' + mastered + ' 个字。' + (next
        ? '累计掌握 ' + next.threshold + ' 个字可升为「' + next.title + '」。' : '你已升到最高阶。'));
    });

    function showWriting(on) {
      writing = Boolean(on);
      body.classList.toggle('herb-writing', writing);
    }

    function arrive(count, masteredCount) {
      updateMastered(masteredCount);
      actualFill = count;
      if (mode === 'playing' || mode === 'intro') renderProgress(actualFill);
    }

    function pass(count, masteredCount) {
      updateMastered(masteredCount);
      actualFill = count;
      updateCoins(PASS_COIN);
      if (mode === 'playing') renderProgress(actualFill, true);
    }

    function finale(bankEmpty, count, masteredCount, newlyAwarded) {
      updateMastered(masteredCount);
      actualFill = count;
      const actualFinished = !bankEmpty && count >= ROOM_SIZE;
      get('restartBtn').textContent = actualFinished ? STAGES[stage].next : '继续练这一关';
      if (actualFinished && newlyAwarded) updateCoins(LEVEL_COIN);
      if (mode === 'playing' || mode === 'intro') renderProgress(actualFill);
    }

    function nextLevel(nextStage) {
      stage = nextStage;
      actualFill = 0;
      transition(stage, 'intro');
    }

    function restoreStage(savedStage, count, resume) {
      stopDemo();
      resetCurtain();
      stage = savedStage;
      actualFill = count;
      display(stage);
      renderProgress(actualFill);
      setMode(resume ? 'playing' : 'intro');
    }

    updateCoins(0);
    restoreStage('herbs', 0, false);
    body.classList.add('has-herbalist');
    return { showWriting, arrive, pass, finale, nextLevel, restoreStage, updateMastered };
  }

  window.HanziHerbalist = { create };
}());
