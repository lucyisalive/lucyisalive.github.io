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
  const PENDING_COINS_KEY = 'hanzi-magic-shop-pending-rewards-v1';
  const PENDING_COINS_PREFIX = PENDING_COINS_KEY + ':';
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
      reward: '加入一种草药。', completion: '十种草药都加齐了，穿墙药水调好啦！喝下它，穿过石墙去星象台。',
      next: '喝下药水，去星象台', nextStage: 'stars', interval: 1110,
    },
    stars: {
      number: '第二关', title: '星象台', unit: '颗星星',
      intro: '你穿过了石墙，沿着山路来到星象台。这里的望远镜正对着夜空。',
      task: '每通过一个字，天上就亮起一颗星。十颗星连在一起，会变成什么？',
      start: '开始观星', step: '点亮一颗星', auto: '播放到十颗星', retry: '重新点星',
      demoHint: '点「点亮一颗星」，看看夜空会变成什么样。',
      demoFinished: '十颗星连成一只鸟。瞧，它展开翅膀飞起来了！',
      reward: '天上亮起了一颗星。', completion: '十颗星连成了星座，变成一只会飞的鸟！跟着它去山脚下。',
      next: '跟上星鸟', nextStage: 'giant', interval: 520,
    },
    giant: {
      number: '第三关', title: '巨人厨房', unit: '样食材',
      intro: '星鸟飞到山脚下。屋里有一位巨人，正在守着一口大锅。',
      task: '每通过一个字，巨人就把一样食材扔进锅里。',
      start: '帮巨人煮汤', step: '扔一样食材', auto: '播放到汤煮好', retry: '重新煮汤',
      demoHint: '看看巨人的手，再看看旁边那扇门。',
      demoFinished: '巨人汤煮好了。喝一口，看看窗台会变到哪里。',
      reward: '巨人往锅里扔了一样食材。', completion: '十样食材煮成了巨人汤。喝下它，就有力气打碎挡路的山。',
      next: '喝汤，打碎大山', nextStage: 'bridge', interval: 1150,
    },
    bridge: {
      number: '第四关', title: '深渊断桥', unit: '块桥板',
      intro: '山尘散开。你变回了原来的大小，脚下是一道深渊。',
      task: '每通过一个字，就有一块木板飞回来，扣在绳索上。',
      start: '修好断桥', step: '接回一块桥板', auto: '播放到桥修好', retry: '重新铺桥',
      demoHint: '桥对面有一盏灯。先把木板一块块接回来。',
      demoFinished: '十块木板都扣牢了。可以走到对岸了。',
      reward: '一块桥板扣上了绳索。', completion: '桥接起来了。对岸的灯，原来是一座小车站。',
      next: '走过断桥', nextStage: 'train', interval: 780,
    },
    train: {
      number: '第五关', title: '气球火车', unit: '个气球',
      intro: '一辆铜皮火车停在月台旁。车顶挂着十个瘪气球，铁轨到崖边就断了。',
      task: '每通过一个字，车顶就鼓起一个气球。',
      start: '给火车吹气球', step: '鼓起一个气球', auto: '播放到气球充满', retry: '重新吹气球',
      demoHint: '先从月台看车顶，等十个气球都鼓起来。',
      demoFinished: '十个气球充满了。上车，我们从车窗看它飞过云层。',
      reward: '车顶鼓起了一个气球。', completion: '十个气球都鼓起来了。火车已经能离开铁轨。',
      next: '上火车，飞过云层', nextStage: 'tomb', interval: 740,
    },
    tomb: {
      number: '第六关', title: '墓穴大厅', unit: '只石化守卫',
      intro: '火车停在山壁的石门前。墓穴深处，动物守卫围着另一扇门。',
      task: '每通过一个字，一只守卫就会变成石像。',
      start: '穿过墓穴大厅', step: '石化一只守卫', auto: '播放到守卫全石化', retry: '重新演示石化',
      demoHint: '看看动物从眨眼、呼吸，到变成一尊石像。',
      demoFinished: '守卫都变成了石像。现在可以从它们中间走过去。',
      reward: '一只动物守卫变成了石像。', completion: '十只守卫都石化了。走到尽头，推开那扇石门。',
      next: '推开石门', nextStage: 'sea', interval: 800,
    },
    sea: {
      number: '第七关', title: '水底人鱼', unit: '个音符',
      intro: '门后的石阶没入水中。四周只有幽蓝的水光。',
      task: '每通过一个字，就出现并奏响一个音符。十个音连成曲子，人鱼会循声而来。',
      start: '奏响水底音符', step: '奏响一个音符', auto: '播放到十音成曲', retry: '重新奏响',
      demoHint: '点亮第一个音符，听它在水底响起来。',
      demoFinished: '人鱼游来了。跟上她，一起浮出海面。',
      reward: '一个水底音符亮了起来。', completion: '十个音符连成了曲子。人鱼循着歌声游来了。',
      next: '跟人鱼浮出海面', nextStage: 'dunes', interval: 590,
      endingNext: '前往沙丘寻龙', endingDetail: '你和人鱼一起浮出了海面。',
    },
    dunes: {
      number: '第八关', title: '沙丘寻龙', unit: '个脚印',
      intro: '眼前是一望无际的沙丘，沙面上还没有脚印。',
      task: '每通过一个字，沙子扬起，露出一个脚印。第十枚脚印会唤起沙丘中的龙。',
      start: '寻找龙的足迹', step: '留下一枚脚印', auto: '播放到龙出现', retry: '重新寻找脚印',
      demoHint: '沿着弯曲的足迹，看看沙丘中藏着什么。',
      demoFinished: '龙掀起沙浪、破沙腾起，落在你面前，伏下身子。',
      reward: '沙子扬起，留下了一枚新的龙脚印。', completion: '十枚脚印唤醒了沙丘中的龙。它伏下身子，邀请你骑上去。',
      next: '骑上龙背', nextStage: 'library', interval: 1200, arrival: 5400,
      endingNext: '前往高塔禁书', endingDetail: '你骑在龙背上，龙颈和双翼就在眼前，沙丘渐渐远去。',
    },
    library: {
      number: '第九关', title: '高塔禁书', unit: '级书阶',
      intro: '高书架的最顶层，一本禁书被绿色发光的魔咒封住。',
      task: '每通过一个字，一本普通藏书飞来，搭成一级向上的台阶。',
      start: '搭起藏书阶梯', step: '搭一级书阶', auto: '播放到书阶搭好', retry: '重新搭书阶',
      demoHint: '普通藏书搭出阶梯，红金装帧的禁书就在架顶。',
      demoFinished: '十级书阶搭好了，绿色结界解开。走上去，打开禁书。',
      reward: '一本厚书落稳，又一级书阶搭好了。', completion: '十级书阶通向架顶，绿色结界解开了。打开禁书，念出咒语。',
      next: '登上书阶，打开禁书', nextStage: 'ice', interval: 1200, arrival: 900,
      endingNext: '前往冰雪庭院', endingDetail: '书中的咒语化成绿光，幽灵武士苏醒了。',
    },
    ice: {
      number: '第十关', title: '冰雪庭院', unit: '道裂缝',
      intro: '冰冻的庭院中央，女神本人被一层贴身的冰壳封住。',
      task: '每通过一个字，冰上多一道裂缝，再融化一点。',
      start: '唤醒冰封女神', step: '化开一道裂缝', auto: '播放到女神苏醒', retry: '重新融冰',
      demoHint: '看女神身上的冰壳沿着裂纹一点点化开。',
      demoFinished: '最后一层冰化尽，女神醒来，向你伸出了手。',
      reward: '冰层裂开，融水顺着裂纹流下。', completion: '最后一层冰化尽，女神醒来，向你伸出了手。',
      next: '牵住女神的手，飞起来', nextStage: 'armor', interval: 1200, arrival: 2200,
      endingNext: '前往沉睡的盔甲', endingDetail: '你握住女神的手升入夜空，冰雪庭院渐渐落在脚下。',
    },
    armor: {
      number: '第十一关', title: '沉睡的盔甲', unit: '根断链',
      intro: '古堡里，一副盔甲被十根从墙上伸来的铁链牢牢缠绑。',
      task: '每通过一个字，绕住身体和四肢的一根铁链就会绷断。',
      start: '解开盔甲的束缚', step: '断开一根铁链', auto: '播放到铁链全断', retry: '重新解开锁链',
      demoHint: '锁链绕过肩臂、胸腰和小腿，紧紧绑住盔甲。',
      demoFinished: '最后一根铁链断开，盔甲向你单膝跪地，胸甲与甲缝发出光芒。',
      reward: '一根缠着盔甲的铁链绷断，滑落下去。', completion: '十根铁链全部断开，盔甲向你单膝跪地，发出光芒。',
      next: '前往魔豆云梯', nextStage: 'beans', interval: 1200, arrival: 6500, automaticEnding: true,
    },
    beans: {
      number: '第十二关', title: '魔豆云梯与天堂火车站', unit: '截豆藤',
      intro: '眼前的魔豆正在生长，云层遮住了高处。',
      task: '每通过一个字，豆藤就向上长高一截。',
      start: '让魔豆生长', step: '长高一截豆藤', auto: '播放到列车发车', retry: '重新种下魔豆',
      demoHint: '看看豆藤怎样向云层高处伸展。',
      demoFinished: '十截豆藤长成，天堂火车站从云中露出，整列火车缓缓发车。',
      reward: '豆藤向上长高了一截。', completion: '豆藤长到云层高处，天堂火车站露出来，整列梦幻火车发车了。',
      next: '前往玫瑰棺', nextStage: 'rose', interval: 1200, arrival: 13700, automaticEnding: true,
    },
    rose: {
      number: '第十三关', title: '玫瑰棺中的沉睡美人', unit: '朵玫瑰',
      intro: '敞口的棺材里睡着一位女子，枯萎的玫瑰藤遮住了她的脸。',
      task: '每通过一个字，一朵玫瑰开放，相应的藤蔓恢复绿色。',
      start: '唤醒玫瑰', step: '绽放一朵玫瑰', auto: '播放到美人醒来', retry: '重新绽放玫瑰',
      demoHint: '让十朵玫瑰一朵一朵开放。',
      demoFinished: '十朵玫瑰开放，花藤向两旁让开，女子睁开了眼睛。',
      reward: '一朵玫瑰开放，藤蔓恢复了绿色。', completion: '十朵玫瑰开满棺材，花藤向两旁让开，露出美人的脸，她睁开了眼睛。',
      next: '前往八卦石门', nextStage: 'bagua', interval: 1200, arrival: 3800, automaticEnding: true,
    },
    bagua: {
      number: '第十四关', title: '八卦封印石门', unit: '处封印',
      intro: '厚重的石门上，八卦与中央的太极阴阳还没有亮起。',
      task: '前八次通过点亮外圈八卦，最后两次分别点亮中央太极的阴阳两半。',
      start: '点亮八卦封印', step: '点亮一处封印', auto: '播放到石门打开', retry: '重新点亮封印',
      demoHint: '先点亮外圈八卦，再点亮中央的阴阳两半。',
      demoFinished: '十处封印全部亮起，厚重石门轰隆一声向左右平移打开。',
      reward: '石门上的一处封印亮了起来。', completion: '外圈八卦和中央太极全部亮起，厚重石门向左右两边平移打开。',
      next: '回到草药房', nextStage: 'herbs', interval: 1200, arrival: 5200, automaticEnding: true,
    },
  };

  function create({ document: doc, onTap, rewardEvent }) {
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
    function createVisual(module) {
      try { return module?.create({ document: doc }); }
      catch (_) { return undefined; }
    }
    const observatory = createVisual(doc.defaultView?.HanziObservatory);
    const giant = createVisual(doc.defaultView?.HanziGiantKitchen);
    const sky = createVisual(doc.defaultView?.HanziBridgeTrain);
    const deep = createVisual(doc.defaultView?.HanziTombMermaid);
    const visuals = { giant, bridge: sky, train: sky, tomb: deep, sea: deep };
    // Keep the new artwork off the startup path. Each scene is created only
    // when first visited; created modules still all receive render to hide it.
    const additions = [
      { stages: ['dunes'], name: 'HanziDuneStory' },
      { stages: ['library'], name: 'HanziLibraryStory' },
      { stages: ['ice', 'armor'], name: 'HanziIceArmorStory' },
      { stages: ['beans'], name: 'HanziBeanTrainStory' },
      { stages: ['rose', 'bagua'], name: 'HanziRoseBaguaStory' },
    ];

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
          <button class="herb-secondary" id="herbShowDemo" type="button">观看关卡演示</button>
        </div>
      </section>
      <section class="herb-card" id="herbDemo" hidden>
        <label class="herb-demo-select">选择关卡
          <select id="herbDemoStage">${Object.entries(STAGES).map(([key, story]) =>
            `<option value="${key}">${story.number} · ${story.title}</option>`).join('')}</select>
        </label>
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
      <p id="herbCoinSaveStatus" class="herb-coin-save-status" role="status" hidden></p>
      <button type="button" id="herbCoinRetry" class="herb-secondary" hidden>重试保存银币</button>
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
    const demoStage = get('herbDemoStage');
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
    let activeExit;
    let endingShown = false;
    let arrivalUntil = 0;
    let autoPlaying = false;
    let writing = true;
    let storage;
    let shopLedger;
    let shop;
    let savingCoins = false;
    let coinJournalError = false;
    let walletInfoOpen = false;
    const pendingCoins = new Map();
    const settledCoins = new Set();

    try {
      storage = doc.defaultView?.localStorage;
      const saved = Number(storage?.getItem(WALLET_KEY));
      if (Number.isSafeInteger(saved) && saved >= 0) coins = saved;
    } catch (_) { /* Preview remains playable. */ }

    try { shopLedger = doc.defaultView?.HanziMagicShopLedger?.create({ window: doc.defaultView }); }
    catch (_) { /* Optional room features cannot stop the lesson. */ }

    function readPendingCoins() {
      if (!storage) throw new Error('storage-unavailable');
      const valid = entry => entry && typeof entry.id === 'string' && entry.id.length > 0 && entry.id.length <= 500
        && [PASS_COIN, LEVEL_COIN].includes(entry.amount);
      const merged = new Map();
      // Read the initial aggregate format, but write each new event separately.
      // Two tabs can then never overwrite one another's uncommitted reward.
      const raw = storage.getItem(PENDING_COINS_KEY);
      if (raw != null) {
        const saved = JSON.parse(raw);
        if (saved?.version !== 1 || !Array.isArray(saved.events) || saved.events.length > 5000
          || !saved.events.every(valid)) throw new Error('invalid-pending-coins');
        saved.events.forEach(entry => merged.set(entry.id, entry));
      }
      const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index))
        .filter(key => typeof key === 'string' && key.startsWith(PENDING_COINS_PREFIX));
      if (keys.length > 5000) throw new Error('invalid-pending-coins');
      keys.forEach(key => {
        const value = storage.getItem(key);
        if (value == null) return; // Another tab may have just committed it.
        const entry = JSON.parse(value);
        if (entry.version !== 1 || !valid(entry) || key !== PENDING_COINS_PREFIX + encodeURIComponent(entry.id)) {
          throw new Error('invalid-pending-coins');
        }
        merged.set(entry.id, { id: entry.id, amount: entry.amount });
      });
      return [...merged.values()];
    }

    function persistPendingCoins() {
      try {
        if (!storage) throw new Error('storage-unavailable');
        pendingCoins.forEach((amount, id) => {
          if (!settledCoins.has(id)) storage.setItem(PENDING_COINS_PREFIX + encodeURIComponent(id), JSON.stringify({ version: 1, id, amount }));
        });
        settledCoins.forEach(id => storage.removeItem(PENDING_COINS_PREFIX + encodeURIComponent(id)));
        const legacy = storage.getItem(PENDING_COINS_KEY);
        if (legacy != null) {
          const saved = JSON.parse(legacy);
          if (saved?.version === 1 && Array.isArray(saved.events)
            && saved.events.every(entry => settledCoins.has(entry.id))) storage.removeItem(PENDING_COINS_KEY);
        }
        coinJournalError = false;
      } catch (_) { coinJournalError = pendingCoins.size > 0; }
    }

    try { readPendingCoins().forEach(entry => pendingCoins.set(entry.id, entry.amount)); }
    catch (_) { coinJournalError = true; }

    function renderCoins() {
      get('herbCoins').textContent = String(coins);
      hudWallet.setAttribute('aria-label', '古银币 ' + coins + ' 枚');
      const snapshot = shopLedger?.snapshot();
      const failed = Boolean(snapshot?.error);
      const pending = [...pendingCoins.values()].reduce((total, amount) => total + amount, 0);
      hudWallet.classList.toggle('herb-coins-unsaved', failed || pending > 0 || coinJournalError);
      hudWallet.title = failed ? '银币账本暂未保存，点此查看并重试'
        : coinJournalError ? '待保存的银币记录暂未读取成功，点此重试'
          : pending ? '有 ' + pending + ' 枚古银币正在保存' : '查看古银币';
      if (walletInfoOpen && info.open) {
        get('herbInfoTitle').textContent = '古银币 · ' + coins + ' 枚';
        const status = get('herbCoinSaveStatus');
        status.hidden = !failed && !pending && !coinJournalError;
        status.textContent = failed ? '银币暂未保存成功。学习可以继续，点下面的按钮重试。'
          : pending ? '还有 ' + pending + ' 枚古银币' + (coinJournalError ? '暂未保存，请保留此页面并点重试。' : '正在保存。')
            : coinJournalError ? '银币待保存记录暂不可读，请保留此页面再重试。' : '';
        get('herbCoinRetry').hidden = !failed && !pending && !coinJournalError;
        get('herbCoinRetry').disabled = savingCoins;
      }
    }

    async function savePendingCoins(retry = false) {
      if (!shopLedger || savingCoins) return;
      savingCoins = true;
      renderCoins();
      try {
        try {
          readPendingCoins().forEach(entry => { if (!settledCoins.has(entry.id)) pendingCoins.set(entry.id, entry.amount); });
          coinJournalError = false;
        } catch (_) { coinJournalError = true; }
        if (retry) await shopLedger.retry?.();
        await shopLedger.ready();
        coins = shopLedger.snapshot().balance;
        for (const [id, amount] of pendingCoins) {
          const result = await shopLedger.credit(amount, id);
          if (!result.ok) break;
          settledCoins.add(id);
          pendingCoins.delete(id);
          coins = result.snapshot.balance;
          persistPendingCoins();
        }
      } catch (_) { /* The uncommitted reward stays queued for a safe retry. */ }
      finally { savingCoins = false; renderCoins(); }
    }

    function updateCoins(increase, eventId) {
      if (!shopLedger) {
        coins += increase;
        if (increase) {
          try { storage?.setItem(WALLET_KEY, String(coins)); }
          catch (_) { /* The lesson remains independent of the optional shop. */ }
        }
      } else if (increase) {
        const id = eventId || 'local:' + Date.now().toString(36) + ':' + Math.random().toString(36).slice(2);
        if (!settledCoins.has(id)) pendingCoins.set(id, increase);
        persistPendingCoins();
        void savePendingCoins();
      }
      renderCoins();
    }

    shopLedger?.subscribe(snapshot => { coins = snapshot.balance; renderCoins(); });
    if (shopLedger) {
      shopLedger.ready().then(snapshot => { coins = snapshot.balance; renderCoins(); void savePendingCoins(); }).catch(() => {});
      doc.defaultView?.addEventListener?.('focus', () => { void savePendingCoins(true); });
      doc.defaultView?.addEventListener?.('storage', event => {
        if (event.key !== PENDING_COINS_KEY && !event.key?.startsWith(PENDING_COINS_PREFIX)) return;
        try { readPendingCoins().forEach(entry => { if (!settledCoins.has(entry.id)) pendingCoins.set(entry.id, entry.amount); }); }
        catch (_) { coinJournalError = true; }
        void savePendingCoins();
      });
      doc.addEventListener?.('visibilitychange', () => {
        if (!doc.hidden) void savePendingCoins(true);
      });
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
      if (renderedStage !== displayStage || count < ROOM_SIZE) arrivalUntil = 0;
      renderedStage = displayStage;
      renderedCount = count;
      if (animate && count === ROOM_SIZE && !reducedMotion()) {
        arrivalUntil = Date.now() + (STAGES[displayStage].arrival || 0);
      }
      meter.textContent = count + ' / ' + ROOM_SIZE + ' ' + STAGES[displayStage].unit;
      if (displayStage === 'herbs') renderFill(count, animate);
      else {
        try {
          if (displayStage === 'stars') observatory?.render(count, animate);
          else visuals[displayStage]?.render(displayStage, count, animate);
        }
        catch (_) { /* The progress display is independent of the animation. */ }
      }
      additions.forEach(entry => {
        if (!entry.attempted && entry.stages.includes(displayStage)) {
          entry.attempted = true;
          entry.visual = createVisual(doc.defaultView?.[entry.name]);
        }
        try { entry.visual?.render(displayStage, count, animate); }
        catch (_) { /* A missing scene must not interrupt a question or saving. */ }
      });
    }

    function display(next) {
      displayStage = next;
      body.dataset.herbStage = next;
      demoStage.value = next;
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
      demoNext.textContent = endingShown ? story.endingNext : story.next;
      demoStatus.textContent = endingShown ? story.endingDetail
        : finished ? story.demoFinished : story.demoHint;
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
      walletInfoOpen = false;
      get('herbCoinSaveStatus').hidden = true;
      get('herbCoinRetry').hidden = true;
      get('herbInfoTitle').textContent = title;
      get('herbInfoCopy').textContent = message;
      if (!info.open) info.showModal();
    }

    function resetCurtain(keepExit = false) {
      clearTimeout(fadeTimer);
      curtain.classList.remove('herb-fade', 'herb-crossing');
      if (!keepExit) resetExit();
    }

    function resetExit() {
      activeExit?.resetExit?.();
      activeExit = undefined;
    }

    function playExit() {
      activeExit = displayStage === 'stars' ? observatory : visuals[displayStage]
        || additions.find(entry => entry.stages.includes(displayStage))?.visual;
      try { return activeExit?.playExit(displayStage) || 0; }
      catch (_) { return 0; }
    }

    function reducedMotion() {
      return doc.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    }

    function transition(nextStage, nextMode, animateExit = true) {
      const watched = endingShown;
      resetCurtain(watched);
      endingShown = false;
      function reveal() {
        display(nextStage);
        resetExit();
        setMode(nextMode);
        renderProgress(nextMode === 'demo' ? demoFill : actualFill);
        if (nextMode === 'demo') updateDemoControls();
        (nextMode === 'demo' ? demoDrop : get('herbStart')).focus({ preventScroll: true });
      }
      if (reducedMotion()) {
        reveal();
        return;
      }
      const crossingWall = displayStage === 'herbs' && nextStage === 'stars';
      setMode('travel');
      function beginFade() {
        curtain.getBoundingClientRect();
        curtain.classList.add(crossingWall && animateExit ? 'herb-crossing' : 'herb-fade');
        fadeTimer = setTimeout(reveal, crossingWall && animateExit ? 704 : 245);
      }
      function depart() {
        const duration = animateExit && !watched && !STAGES[displayStage].automaticEnding ? playExit() : 0;
        if (duration) fadeTimer = setTimeout(beginFade, duration);
        else beginFade();
      }
      // Only scenery waits. The pass and next-round record are already saved.
      const remainingArrival = animateExit ? Math.max(0, arrivalUntil - Date.now()) : 0;
      if (remainingArrival) fadeTimer = setTimeout(depart, remainingArrival);
      else depart();
    }

    function finishEnding() {
      const story = STAGES[displayStage];
      if (!story.endingNext) return false;
      if (mode === 'travel') return true;
      if (endingShown) return false;
      endingShown = true;
      const previousMode = mode;
      setMode('travel');
      function finish() {
        setMode(previousMode);
        if (previousMode === 'demo') {
          updateDemoControls();
          demoNext.focus({ preventScroll: true });
        } else {
          const restart = get('restartBtn');
          const detail = get('finaleDetail');
          detail.textContent = [story.endingDetail, ...detail.textContent.split('\n').slice(1)].join('\n');
          restart.textContent = story.endingNext;
          restart.focus({ preventScroll: true });
        }
      }
      function begin() {
        const duration = playExit();
        if (duration && !reducedMotion()) fadeTimer = setTimeout(finish, duration);
        else finish();
      }
      const remainingArrival = reducedMotion() ? 0 : Math.max(0, arrivalUntil - Date.now());
      if (remainingArrival) fadeTimer = setTimeout(begin, remainingArrival);
      else begin();
      return true;
    }

    function surface() { return displayStage === 'sea' && finishEnding(); }

    setupButton('herbStart', () => {
      setMode('playing');
      const focus = writing ? get('submitBtn') : get('restartBtn');
      focus.focus({ preventScroll: true });
    });
    setupButton('herbShowDemo', () => {
      stopDemo();
      resetCurtain();
      endingShown = false;
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
        resetCurtain();
        endingShown = false;
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
      resetCurtain();
      endingShown = false;
      setMode('intro');
      renderProgress(actualFill);
      get('herbShowDemo').focus({ preventScroll: true });
    });
    setupButton('herbDemoNext', () => {
      if (mode !== 'demo' || demoFill !== ROOM_SIZE) return;
      stopDemo();
      if (finishEnding()) return;
      demoFill = 0;
      transition(STAGES[displayStage].nextStage, 'demo');
    });
    demoStage.addEventListener('change', () => {
      if (mode !== 'demo' || !Object.hasOwn(STAGES, demoStage.value)) return;
      stopDemo();
      demoFill = 0;
      transition(demoStage.value, 'demo', false);
    });
    setupButton('herbHome', () => {
      if (!shop && shopLedger) {
        try {
          shop = doc.defaultView?.HanziMagicShop?.create({ document: doc, onTap, cottage,
            ledger: shopLedger, catalog: doc.defaultView?.HanziMagicShopCatalog });
        } catch (_) { /* Keep the original room and its exit usable. */ }
      }
      shop?.openRoom?.();
      if (!cottage.open) cottage.showModal();
    });
    setupButton('herbCottageExit', () => cottage.close());
    setupButton('herbInfoExit', () => info.close());
    setupButton('herbWallet', () => {
      showInfo('古银币 · ' + coins + ' 枚', '每正式通过一个字得 1 枚，每完成一关再得 5 枚。可以在巫师房间的午夜奇物铺兑换藏品。');
      walletInfoOpen = true;
      renderCoins();
    });
    setupButton('herbCoinRetry', () => { void savePendingCoins(true); });
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
      updateCoins(PASS_COIN, rewardEvent?.('pass', count));
      if (mode === 'playing') renderProgress(actualFill, true);
    }

    function finale(bankEmpty, count, masteredCount, newlyAwarded) {
      updateMastered(masteredCount);
      actualFill = count;
      const actualFinished = !bankEmpty && count >= ROOM_SIZE;
      get('restartBtn').textContent = actualFinished ? STAGES[stage].next : '继续练这一关';
      if (actualFinished && newlyAwarded) updateCoins(LEVEL_COIN, rewardEvent?.('complete', count));
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
      endingShown = false;
      arrivalUntil = 0;
      stage = savedStage;
      actualFill = count;
      display(stage);
      renderProgress(actualFill);
      setMode(resume ? 'playing' : 'intro');
    }

    updateCoins(0);
    restoreStage('herbs', 0, false);
    body.classList.add('has-herbalist');
    return { showWriting, arrive, pass, finale, nextLevel, restoreStage, updateMastered, finishEnding, surface,
      shopLedger, get shop() { return shop; }, retryCoins: () => savePendingCoins(true) };
  }

  window.HanziStoryStages = STAGES;
  window.HanziHerbalist = { create };
}());
