(function (global) {
  'use strict';

  // This module only presents the room and purchases. The ledger owns persistence;
  // it never reads or changes lessons, handwriting, teaching or cloud progress.
  const EFFECTS = ['runes', 'chair', 'cushion', 'moon', 'books', 'cupboard',
    'rug', 'bedding', 'curtains', 'tapestry', 'mirror', 'hearth',
    'candle', 'quill', 'bottles', 'tea', 'atlas', 'cauldron',
    'crystal', 'portrait', 'broom', 'trunk', 'bird', 'cat'];
  const GROUPS = [
    { id: 'furniture', name: '家具' },
    { id: 'room', name: '房间布置' },
    { id: 'curios', name: '神奇物件' },
    { id: 'companions', name: '小伙伴' }
  ];
  const POSITIONS = [
    [30, 54, 34, 30], [40, 63, 19, 34], [69, 76, 29, 43], [47, 76, 23, 42],
    [56, 40, 28, 18], [65, 52, 15, 28], [45, 86, 59, 3], [85, 44, 32, 12],
    [24, 30, 38, 8], [51, 22, 24, 7], [74, 24, 17, 9], [85, 66, 25, 24]
  ];
  const PLACES = [
    { id: 'window', name: '窗台', x: 30, y: 39, width: 11 },
    { id: 'crate', name: '旧木箱', x: 15, y: 66, width: 16 },
    { id: 'shelf', name: '墙边架', x: 51, y: 50, width: 11 }
  ];
  const ART = ['furniture-atlas.webp', 'room-atlas.webp', 'curios-atlas.webp', 'companions-atlas.webp'];
  const SVG_START = '<svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">';
  const STAR = '<path d="m50 8 9 29 30 1-24 18 8 29-23-17-24 17 9-29-24-18 30-1Z"/>';

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, char =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  }

  function magicMarkup(effect) {
    const sparks = '<span class="magic-sparks"><i></i><i></i><i></i><i></i><i></i><i></i></span>';
    const forms = {
      runes: '<span class="magic-rune-line">ᛁ ᚷ ᛉ ᚨ</span><span class="magic-drawer-glow"></span>',
      chair: SVG_START + '<path class="magic-star-mark" d="m50 20 6 18 19 1-15 12 5 18-15-11-15 11 5-18-15-12 19-1Z"/></svg>',
      cushion: '<span class="magic-cushion-glow"></span>',
      moon: SVG_START + '<circle class="magic-moon" cx="50" cy="49" r="19"/><circle class="magic-moon-shadow" cx="61" cy="43" r="19"/></svg>',
      books: '<span class="magic-book-spines"><i></i><i></i><i></i><i></i><i></i></span>',
      cupboard: SVG_START + '<circle class="magic-turning-handle" cx="50" cy="46" r="8" fill="none" stroke="currentColor" stroke-width="3"/><path class="magic-drawer-seam" d="M23 58h54"/></svg>' + sparks,
      rug: SVG_START + '<path class="magic-constellation" d="m17 62 19-25 20 19 24-23M36 37l15-15" fill="none" stroke="currentColor" stroke-width="1.6"/><g class="magic-rug-stars"><circle cx="17" cy="62" r="2"/><circle cx="36" cy="37" r="2"/><circle cx="56" cy="56" r="2"/><circle cx="80" cy="33" r="2"/><circle cx="51" cy="22" r="2"/></g></svg>',
      bedding: '<span class="magic-bed-stars"><i></i><i></i><i></i><i></i><i></i></span>',
      curtains: '<span class="magic-curtain-silver"></span>',
      tapestry: SVG_START + '<path class="magic-tapestry-bird" d="M15 54q18-27 35 0 17-27 35 0-18-9-35 12-17-21-35-12Z"/></svg>' + sparks,
      mirror: SVG_START + '<ellipse class="magic-mirror-forest" cx="50" cy="45" rx="22" ry="30"/><g class="magic-forest-trees"><path d="m31 63 8-24 8 24Zm13 1 9-34 10 34Zm14 1 8-22 7 22Z"/><circle cx="58" cy="25" r="6"/></g></svg>',
      hearth: SVG_START + '<path class="magic-fire-dragon" d="M19 70q8-26 32-20l9-16 15 3-9 8 15 12-18-3q-9 29-29 14 12 2 14-7-17-5-29 9Z"/></svg>' + sparks,
      candle: '<span class="magic-candle-flame"></span>',
      quill: SVG_START + '<path class="magic-written-runes" d="m19 69 10-22 10 22m-15-8h11m13 8V46l17 23V46m9 1h12L74 69h12" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
      bottles: '<span class="magic-bubbles"><i></i><i></i><i></i><i></i></span>',
      tea: SVG_START + '<path class="magic-tea-stream" d="M23 31q-3 16-1 33" fill="none" stroke="#edc783" stroke-width="1.2"/><path class="magic-tea-steam" d="M23 61q-5-6 0-11m6 11q-4-5 0-9" fill="none" stroke="#fff1c8" stroke-width="1"/></svg>',
      atlas: SVG_START + '<path class="magic-turning-page" d="M48 31q21-9 32 1v39q-15-6-32 0Z" fill="#d5c099" stroke="#997445"/><path class="magic-atlas-lines" d="m25 50 15-9 20 18 15-11m-35-7 7 23" fill="none" stroke="#fff0b6" stroke-width="2"/></svg>',
      cauldron: '<span class="magic-cauldron-moon"></span>' + '<span class="magic-star-rise">' + SVG_START + STAR + '</svg></span>' + '<span class="magic-bubbles"><i></i><i></i><i></i><i></i></span>',
      crystal: SVG_START + '<circle class="magic-crystal-nebula" cx="50" cy="43" r="25"/><path class="magic-crystal-castle" d="M33 62V40h7v-8h8v13h8V35h7v27Zm-2-22 6-10 5 10m12-5 6-11 6 11" fill="#d5d9e8"/></svg>',
      portrait: sparks,
      broom: '<span class="magic-broom-trail"></span>' + sparks,
      trunk: SVG_START + '<ellipse class="magic-trunk-sky" cx="50" cy="38" rx="43" ry="11"/><g class="magic-trunk-stars"><circle cx="29" cy="36" r="1.1"/><circle cx="45" cy="31" r="1.5"/><circle cx="67" cy="38" r="1.2"/><path d="m56 35 1 3 3 1-3 1-1 3-1-3-3-1 3-1Z"/></g><path class="magic-trunk-cloud" d="M19 43q6-5 13-2 7-6 16-1 9-3 16 3Z"/></svg>',
      bird: '<span class="magic-bird-feather"></span>' + sparks,
      cat: SVG_START + '<g class="magic-cat-sleep"><path d="m21 20 8-4-4 11 9-3m3-16 8-4-4 11 9-3" fill="none" stroke="#e3d4b2" stroke-width="1.4"/></g></svg>'
    };
    return '<span class="magic-effect magic-effect-' + effect + '" aria-hidden="true">' +
      (forms[effect] || sparks) + '</span><span class="magic-item-aura" aria-hidden="true"></span>';
  }

  function create(options) {
    const doc = options && options.document;
    const cottage = options && options.cottage;
    const ledger = options && options.ledger;
    const sourceCatalog = options && options.catalog;
    if (!doc || !cottage || !ledger || !sourceCatalog) return {};
    const source = Array.isArray(sourceCatalog) ? sourceCatalog : sourceCatalog.items;
    if (!Array.isArray(source) || !source.length) return {};
    const items = source.map((item, index) => ({ ...item, _index: index,
      _effect: EFFECTS[index] || item.effect || 'runes',
      _group: ({ '家具': 'furniture', '布置': 'room', '奇物': 'curios', '伙伴': 'companions' })[item.category] ||
        (index < 6 ? 'furniture' : index < 12 ? 'room' : index < 22 ? 'curios' : 'companions') }));
    const byId = new Map(items.map(item => [String(item.id), item]));
    const exit = cottage.querySelector('#herbCottageExit');
    let panel = 'room';
    let category = 'all';
    let selected = null;
    let inspected = null;
    let buying = false;
    let recovering = false;
    let ready = false;
    let destroyed = false;
    let successful = null;
    let detailNotice = null;
    let placing = false;
    let placementNotice = null;
    let displayIsAuthoritative = false;
    let state = { balance: 0, owned: [] };
    let unsubscribe;
    let openCollection = false;
    let animationTimers = [];
    const displayed = Object.create(null);
    const artBlobUrls = new Map();
    const view = doc.defaultView || global;
    const objectUrls = view.URL || global.URL;

    function artUrl(source) {
      const src = String(source);
      const comma = src.indexOf(',');
      const header = comma < 0 ? '' : src.slice(0, comma);
      if (!/^data:image\/[^,]+;base64$/i.test(header)) return src;
      if (artBlobUrls.has(src)) return artBlobUrls.get(src);
      try {
        const decode = view.atob || global.atob;
        const BlobType = view.Blob || global.Blob;
        if (typeof decode !== 'function' || typeof BlobType !== 'function' || typeof objectUrls?.createObjectURL !== 'function') return src;
        const binary = decode.call(view, src.slice(comma + 1));
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
        const blob = new BlobType([bytes], { type: header.slice(5).split(';')[0] });
        const url = objectUrls.createObjectURL(blob);
        artBlobUrls.set(src, url);
        return url;
      } catch (_) { return src; }
    }

    const motionArtUrl = artUrl('assets/shop/special-motion-atlas.webp');

    cottage.classList.add('magic-shop-enabled');
    cottage.dataset.shopReady = 'false';
    const motionPreload = doc.createElement('img');
    motionPreload.addEventListener('load', () => { if (!destroyed) cottage.classList.add('magic-motion-ready'); });
    motionPreload.src = motionArtUrl;
    cottage.innerHTML = `
      <div class="magic-house-shell">
        <header class="magic-house-header">
          <div><p class="magic-eyebrow" id="magicShopEyebrow">旅途中的归处</p>
            <h2 id="herbCottageName">我的巫师房间</h2></div>
          <div class="magic-wallet"><span class="magic-coin" aria-hidden="true"></span>
            <span><strong id="magicShopBalance">—</strong><small>古银币</small></span></div>
        </header>
        <div class="magic-storage-alert" id="magicShopStorageAlert" hidden><p id="magicShopStorageCopy">藏品账本暂时无法保存。你的学习可以继续。</p><button type="button" class="magic-button magic-button-small" id="magicShopRetryStorage">重新读取账本</button></div>
        <div class="magic-house-content">
          <section class="magic-panel magic-room-panel" data-shop-panel="room" aria-label="我的巫师房间">
            <div class="magic-room-toolbar"><span id="magicShopOwnedCount">已收藏 0 / ${items.length}</span>
              <button id="magicShopEntry" class="magic-button magic-button-primary" type="button">去商店选购 <span aria-hidden="true">→</span></button></div>
            <div class="magic-room-stage" id="magicRoomStage" aria-label="可点按藏品的巫师房间">
              <div class="magic-room-background" aria-hidden="true"></div>
              <div class="magic-old-crate" aria-hidden="true"></div>
              <div class="magic-wall-shelf" aria-hidden="true"></div>
              <div class="magic-room-objects" id="magicRoomObjects"></div>
              <div class="magic-room-empty" id="magicRoomEmpty"><strong>小屋等着你的第一件藏品</strong><span>攒下古银币，挑一件喜欢的奇物。<br>小物可以直接摆在窗台或旧木箱上。</span></div>
              <p class="magic-room-hint" id="magicRoomHint" hidden>点一下藏品，看看它的小魔法</p>
            </div>
            <p class="magic-live-message" id="magicRoomMagicStatus" aria-live="polite">这里是你的房间，原来的床、木凳和窗户一直都在。</p>
            <div class="magic-collection">
              <button class="magic-collection-toggle" id="magicCollectionToggle" type="button" aria-expanded="false" aria-controls="magicCollectionBody">我的藏品 <span id="magicCollectionCount">0 件</span><span class="magic-chevron" aria-hidden="true">⌄</span></button>
              <div id="magicCollectionBody" hidden>
                <p class="magic-collection-note">选一件查看、点按施展魔法。桌上小物可以换个陈列位置。</p>
                <div class="magic-collection-list" id="magicCollectionList"></div>
                <div id="magicRoomInspector" class="magic-room-inspector" hidden></div>
              </div>
            </div>
          </section>
          <section class="magic-panel magic-store-panel" data-shop-panel="shop" aria-label="午夜奇物铺" hidden>
            <div class="magic-store-intro"><button id="magicShopBackRoom" class="magic-text-button" type="button">← 回房间</button><p>旧木架上，每件奇物都藏着一点小魔法。</p></div>
            <nav class="magic-categories" aria-label="商品分类"><button type="button" data-shop-category="all" aria-pressed="true">全部 ${items.length} 件</button>${GROUPS.map(group => '<button type="button" data-shop-category="' + group.id + '" aria-pressed="false">' + group.name + '</button>').join('')}</nav>
            <p id="magicShopStoreStatus" class="magic-store-status" aria-live="polite">每件只收藏一次，买下就会摆进房间。</p>
            <div class="magic-product-grid" id="magicShopProducts"></div>
          </section>
          <section class="magic-panel magic-detail-panel" data-shop-panel="detail" aria-label="查看一件商品" hidden>
            <button id="magicShopBackStore" class="magic-text-button" type="button">← 继续逛商店</button>
            <div id="magicShopDetail"></div>
          </section>
        </div>
        <footer class="magic-house-footer"><span>古银币来自每一次正式通过</span><span id="magicShopExitSlot"></span></footer>
      </div>`;
    if (exit) {
      cottage.querySelector('#magicShopExitSlot').appendChild(exit);
      exit.classList.add('magic-button', 'magic-exit');
    }

    const el = id => cottage.querySelector('#' + id);
    const tap = (element, handler) => {
      if (!element) return;
      if (typeof options.onTap === 'function') options.onTap(element, handler);
      else element.addEventListener('click', handler);
    };
    const ownedIds = () => new Set((Array.isArray(state.owned) ? state.owned : []).map(record =>
      String(typeof record === 'string' ? record : record.itemId || record.id)));
    const owns = item => ownedIds().has(String(item.id));
    const balance = () => Math.max(0, Number(state.balance) || 0);
    const healthy = () => ready && state.ready !== false && !state.error;
    const smallItem = item => item._index >= 12 && item._index <= 21;
    const format = number => Number(number).toLocaleString('zh-CN');

    function artStyle(item) {
      const art = item.art || {};
      const src = artUrl(art.src || 'assets/shop/' + ART[Math.floor(item._index / 6)]).replace(/["\\\n\r]/g, '');
      const col = Number.isFinite(art.col) ? art.col : item._index % 2;
      const row = Number.isFinite(art.row) ? art.row : Math.floor(item._index % 6 / 2);
      return '--shop-art:url(&quot;' + escapeHtml(src) + '&quot;);--shop-col:' + col + ';--shop-row:' + row;
    }

    function artMarkup(item, interactive) {
      const style = artStyle(item);
      const motionStyle = (col, row) => {
        // The action painting uses complete, uneven-height rows. Crop only the
        // transparent atlas windows; never cut into a kettle, frame or wing.
        const crop = [{ y: 0, height: 448 }, { y: 452, height: 524 }, { y: 976, height: 560 }][row];
        return '--shop-art:url(&quot;' + escapeHtml(motionArtUrl) + '&quot;);--shop-col:' + col +
          ';--shop-row:' + row + ';--shop-motion-sy:' + (1536 / crop.height * 100) +
          '%;--shop-motion-y:' + (crop.y / (1536 - crop.height) * 100) + '%';
      };
      let parts = '';
      if (interactive && item._effect === 'tea') parts = '<span class="magic-item-part magic-tea-pot-art" style="' + motionStyle(0, 0) + '" aria-hidden="true"></span><span class="magic-item-part magic-tea-cup-art" style="' + motionStyle(1, 0) + '" aria-hidden="true"></span>';
      if (interactive && item._effect === 'portrait') parts = '<span class="magic-item-part magic-portrait-nod-art" style="' + motionStyle(1, 1) + '" aria-hidden="true"></span><span class="magic-item-part magic-portrait-sip-art" style="' + motionStyle(0, 1) + '" aria-hidden="true"></span>';
      if (interactive && item._effect === 'trunk') parts = '<span class="magic-item-part magic-trunk-lid-art" style="' + style + '" aria-hidden="true"></span>';
      if (interactive && item._effect === 'bird') parts = '<span class="magic-item-part magic-bird-flight-art" style="' + motionStyle(0, 2) + '" aria-hidden="true"></span>';
      if (interactive && item._effect === 'cat') parts = '<span class="magic-item-part magic-cat-stretch-art" style="' + motionStyle(1, 2) + '" aria-hidden="true"></span>';
      return '<span class="magic-item-art" style="' + style + '" aria-hidden="true"></span>' +
        (interactive ? magicMarkup(item._effect) + parts : '');
    }

    function takeSnapshot(snapshot) {
      try {
        state = snapshot && typeof snapshot === 'object' && 'balance' in snapshot ? snapshot : ledger.snapshot();
      } catch (_) { /* Keep the last known state so the current lesson is untouched. */ }
      if (!state || typeof state !== 'object') state = { balance: 0, owned: [] };
      const savedPlaces = state.displayPlaces;
      displayIsAuthoritative = Boolean(savedPlaces && typeof savedPlaces === 'object' && Object.keys(savedPlaces).length);
      Object.keys(displayed).forEach(key => { delete displayed[key]; });
      if (displayIsAuthoritative) PLACES.forEach(place => {
        const id = savedPlaces[place.id];
        const item = byId.get(String(id));
        if (item && smallItem(item) && owns(item)) displayed[place.id] = String(id);
      });
    }

    function syncHeader() {
      const count = items.filter(owns).length;
      el('magicShopBalance').textContent = ready ? format(balance()) : '—';
      el('magicShopOwnedCount').textContent = '已收藏 ' + count + ' / ' + items.length;
      el('magicCollectionCount').textContent = count + ' 件';
      el('magicShopStorageAlert').hidden = !ready || healthy();
      el('magicShopStorageCopy').textContent = recovering ? '正在重新读取藏品账本……' : '藏品账本暂时无法保存。重新读取后，还需再次确认兑换。';
      el('magicShopRetryStorage').disabled = recovering;
      if (typeof options.onBalance === 'function') options.onBalance(balance(), state);
    }

    function playMagic(target, item) {
      if (!target || !item) return;
      target.classList.remove('is-playing');
      // Restart even if the child taps an item twice in succession.
      void target.offsetWidth;
      target.classList.add('is-playing');
      target.dataset.magicPlayed = String(Date.now());
      el('magicRoomMagicStatus').textContent = item.name + '：' + (item.magic || item.description || '小魔法在柔光中醒来。');
      const message = cottage.querySelector('#magicDetailMagicStatus');
      if (message) message.textContent = item.magic || item.description || '小魔法在柔光中醒来。';
      animationTimers.push(setTimeout(() => target.classList.remove('is-playing'), item._effect === 'bird' ? 5400 : 4200));
    }

    function chooseDisplayDefaults() {
      if (displayIsAuthoritative) return;
      const owned = items.filter(item => owns(item) && smallItem(item));
      PLACES.forEach(place => { if (displayed[place.id] && !owns(byId.get(displayed[place.id]) || {})) delete displayed[place.id]; });
      const shown = new Set(Object.values(displayed));
      PLACES.forEach(place => {
        if (displayed[place.id]) return;
        const next = owned.find(item => !shown.has(String(item.id)));
        if (next) { displayed[place.id] = String(next.id); shown.add(String(next.id)); }
      });
    }

    function roomButton(item, position, place) {
      return '<button type="button" class="magic-room-item magic-room-' + item._effect + '" data-item-id="' + escapeHtml(item.id) + '" data-effect="' + item._effect + '"' +
        (place ? ' data-display-place="' + place + '"' : '') +
        ' aria-label="' + escapeHtml(item.name) + '，点按施展魔法" style="--room-x:' + position[0] + ';--room-y:' + position[1] + ';--room-w:' + position[2] + ';--room-z:' + position[3] + '">' +
        artMarkup(item, true) + '<span class="magic-room-item-name">' + escapeHtml(item.name) + '</span></button>';
    }

    function renderRoom() {
      chooseDisplayDefaults();
      const owned = items.filter(owns);
      const room = owned.filter(item => item._index < 12 || item._index >= 22).map(item => {
        const position = POSITIONS[item._index] || (item._effect === 'bird' ? [17, 36, 12, 50] : [67, 88, 21, 55]);
        return roomButton(item, position);
      });
      PLACES.forEach(place => {
        const item = byId.get(displayed[place.id]);
        if (item && owns(item)) room.push(roomButton(item, [place.x, place.y, place.width, 60], place.id));
      });
      el('magicRoomObjects').innerHTML = room.join('');
      cottage.querySelectorAll('.magic-room-item').forEach(button => tap(button, () => playMagic(button, byId.get(button.dataset.itemId))));
      el('magicRoomEmpty').hidden = owned.length > 0;
      el('magicRoomHint').hidden = owned.length === 0;
      el('magicCollectionList').innerHTML = owned.map(item => '<button type="button" class="magic-collection-item" data-item-id="' + escapeHtml(item.id) + '" aria-pressed="' + (inspected === String(item.id)) + '">' + artMarkup(item, false) + '<span>' + escapeHtml(item.name) + '</span></button>').join('') || '<p class="magic-no-collection">还没有藏品。去商店看看，15 枚就能挑第一件奇物。</p>';
      cottage.querySelectorAll('.magic-collection-item').forEach(button => tap(button, () => {
        inspected = button.dataset.itemId;
        placementNotice = null;
        renderInspector();
        cottage.querySelectorAll('.magic-collection-item').forEach(candidate => candidate.setAttribute('aria-pressed', String(candidate === button)));
        const reduced = doc.defaultView && typeof doc.defaultView.matchMedia === 'function' && doc.defaultView.matchMedia('(prefers-reduced-motion: reduce)').matches;
        el('magicRoomInspector').scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
      }));
      renderInspector();
    }

    function renderInspector() {
      const item = byId.get(inspected);
      const inspector = el('magicRoomInspector');
      inspector.hidden = !item || !owns(item);
      if (inspector.hidden) { inspector.innerHTML = ''; return; }
      const place = PLACES.find(place => displayed[place.id] === String(item.id));
      const notice = placementNotice && placementNotice.itemId === String(item.id) ? placementNotice : null;
      inspector.innerHTML = '<div class="magic-inspector-main"><button type="button" class="magic-inspector-preview magic-interactive-preview" data-item-id="' + escapeHtml(item.id) + '" data-effect="' + item._effect + '" aria-label="点按' + escapeHtml(item.name) + '施展魔法">' + artMarkup(item, true) + '</button><div><h3>' + escapeHtml(item.name) + '</h3><p>' + escapeHtml(item.magic || item.description || '点按藏品，唤醒它的小魔法。') + '</p><button type="button" class="magic-button magic-button-small" id="magicInspectorPlay">看看小魔法</button></div></div>' +
        (smallItem(item) ? '<div class="magic-place-options" aria-label="选择陈列位置"><span>摆在' + (place ? '（现在：' + place.name + '）' : '房间里') + '</span>' + PLACES.map(target => '<button type="button" class="magic-place-button" data-place="' + target.id + '" aria-pressed="' + (place && place.id === target.id ? 'true' : 'false') + '"' + (placing || !healthy() ? ' disabled' : '') + '>' + target.name + '</button>').join('') + '</div><p class="magic-place-note' + (notice && notice.error ? ' is-error' : '') + '" id="magicPlacementStatus" aria-live="polite">' + escapeHtml(notice && notice.message || '换位置会保存到房间，并把原来那件收回藏品柜；随时可以再拿出来。') + '</p>' : '<p class="magic-place-note">已经摆在房间的固定位置，点它就会回应你。</p>');
      const preview = inspector.querySelector('.magic-inspector-preview');
      tap(preview, () => playMagic(preview, item));
      tap(el('magicInspectorPlay'), () => playMagic(preview, item));
      inspector.querySelectorAll('[data-place]').forEach(button => tap(button, async () => {
        if (placing || !healthy()) return;
        const destination = PLACES.find(place => place.id === button.dataset.place);
        placing = true;
        placementNotice = { itemId: String(item.id), message: '正在保存陈列位置……', error: false };
        renderInspector();
        try {
          const result = typeof ledger.setDisplayPlace === 'function' ? await ledger.setDisplayPlace(destination.id, item.id) : null;
          if (destroyed) return;
          placing = false;
          takeSnapshot(result && result.snapshot);
          placementNotice = { itemId: String(item.id), message: result && result.ok ? '位置已保存。' + item.name + '摆在' + destination.name + '。' : '摆放没有保存，原位置保留。可以重新读取账本后重试，不会扣币。', error: !(result && result.ok) };
          syncHeader();
          renderRoom();
          if (result && result.ok) el('magicRoomMagicStatus').textContent = item.name + '已经摆在' + destination.name + '，位置已保存。';
        } catch (_) {
          if (destroyed) return;
          placing = false;
          takeSnapshot();
          placementNotice = { itemId: String(item.id), message: '摆放没有保存，原位置保留。可以重新读取账本后重试，不会扣币。', error: true };
          syncHeader();
          renderRoom();
        }
      }));
    }

    function renderStore() {
      const filtered = items.filter(item => category === 'all' || item._group === category);
      cottage.querySelectorAll('[data-shop-category]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.shopCategory === category)));
      el('magicShopProducts').innerHTML = filtered.map(item => {
        const owned = owns(item);
        return '<button type="button" class="magic-product' + (owned ? ' is-owned' : '') + '" data-item-id="' + escapeHtml(item.id) + '" aria-label="' + escapeHtml(item.name) + '，' + (owned ? '已拥有' : item.price + '枚古银币，查看详情') + '"><span class="magic-product-art">' + artMarkup(item, false) + '</span><span class="magic-product-copy"><strong>' + escapeHtml(item.name) + '</strong><span class="magic-product-bottom"><span class="magic-price"><i class="magic-coin" aria-hidden="true"></i>' + format(item.price) + '</span><span class="magic-product-state">' + (owned ? '已拥有' : '看看 →') + '</span></span></span></button>';
      }).join('');
      cottage.querySelectorAll('.magic-product').forEach(button => tap(button, () => openDetail(button.dataset.itemId)));
      el('magicShopStoreStatus').textContent = !ready ? '正在打开藏品账本……' : state.error ? '暂时读不到本机藏品账本。已有学习仍可继续，稍后可重试购买。' :
        (category === 'all' ? '共 ' + items.length + ' 件奇物。' : '本架 ' + filtered.length + ' 件奇物。') + '每件只收藏一次，买下就会摆进房间。';
    }

    function purchaseCopy(item) {
      if (!ready) return '正在打开账本……';
      if (!healthy()) return '请先重新读取账本';
      if (owns(item)) return '已拥有';
      if (balance() < Number(item.price)) return '还差 ' + format(Number(item.price) - balance()) + ' 枚古银币';
      return '用 ' + format(item.price) + ' 枚古银币兑换';
    }

    function renderDetail(message, error) {
      const item = byId.get(selected);
      if (!item) return;
      const owned = owns(item);
      const isSuccess = successful === String(item.id);
      if (message) detailNotice = { message, error: Boolean(error) };
      const notice = detailNotice;
      const disabled = buying || !healthy() || owned || balance() < Number(item.price);
      el('magicShopDetail').innerHTML = '<p class="magic-detail-kicker">' + GROUPS.find(group => group.id === item._group).name + ' · 第 ' + (item._index + 1) + ' 件奇物</p><h3 id="magicShopItemTitle">' + escapeHtml(item.name) + '</h3>' +
        '<button type="button" class="magic-detail-art magic-interactive-preview" data-item-id="' + escapeHtml(item.id) + '" data-effect="' + item._effect + '" aria-label="点按预览' + escapeHtml(item.name) + '的小魔法">' + artMarkup(item, true) + '<span class="magic-preview-label">点一下，看看小魔法</span></button>' +
        '<p class="magic-detail-description">' + escapeHtml(item.description || item.magic || '') + '</p><p id="magicDetailMagicStatus" class="magic-detail-magic" aria-live="polite">' + escapeHtml(item.magic || '每一件藏品都有自己的小魔法。') + '</p>' +
        '<div class="magic-detail-price"><span><i class="magic-coin" aria-hidden="true"></i>' + format(item.price) + '<small> 古银币</small></span><span>你有 ' + format(balance()) + ' 枚</span></div>' +
        '<div class="magic-purchase-message' + (notice && notice.error ? ' is-error' : '') + '" id="magicShopPurchaseStatus" role="status" aria-live="polite">' + escapeHtml(notice && notice.message || (isSuccess ? '已摆进你的房间。点它，就有小魔法回应你。' : owned ? '这件奇物已经属于你，可以回房间找它。' : '兑换后会保存到这台设备的房间里。')) + '</div>' +
        '<div class="magic-detail-actions">' + (isSuccess || owned ? '<button type="button" class="magic-button magic-button-primary" id="magicShopViewRoom">回房间看看</button><button type="button" class="magic-button" id="magicShopKeepShopping">留在商店继续选</button>' : '<button type="button" class="magic-button magic-button-primary" id="magicShopPurchase"' + (disabled ? ' disabled' : '') + '>' + (buying ? '正在记入藏品账本……' : purchaseCopy(item)) + '</button>') +
        '<button type="button" class="magic-text-button" id="magicShopCancel"' + (buying ? ' disabled' : '') + '>' + (isSuccess || owned ? '返回商品列表' : '先不兑换，继续逛') + '</button></div>' +
        (!owned && balance() < Number(item.price) ? '<p class="magic-earning-note">每正式通过一个字得 1 枚，完整走完一关再得 5 枚。攒够再来，奇物会等你。</p>' : '');
      const preview = el('magicShopDetail').querySelector('.magic-detail-art');
      tap(preview, () => playMagic(preview, item));
      tap(el('magicShopPurchase'), buySelected);
      tap(el('magicShopCancel'), () => showPanel('shop', '#magicShopBackRoom'));
      tap(el('magicShopViewRoom'), () => { inspected = String(item.id); openRoom(); });
      tap(el('magicShopKeepShopping'), () => showPanel('shop', '#magicShopBackRoom'));
    }

    async function buySelected() {
      const item = byId.get(selected);
      if (!item || buying || !healthy()) return;
      takeSnapshot();
      if (owns(item)) { renderDetail('你已经拥有这件奇物，不会再次扣币。'); return; }
      if (balance() < Number(item.price)) { renderDetail('古银币还没攒够，先去继续探险吧。'); return; }
      buying = true;
      detailNotice = null;
      renderDetail();
      try {
        const result = await ledger.purchase(item.id);
        takeSnapshot(result && (result.snapshot || result.state));
        if (destroyed) return;
        buying = false;
        syncHeader();
        if (result && result.ok) {
          successful = String(item.id);
          renderRoom();
          renderStore();
          renderDetail('已摆进你的房间。点它，就有小魔法回应你。');
          el('magicShopViewRoom').focus({ preventScroll: true });
        } else if (result && result.reason === 'already-owned') {
          renderDetail('你已经拥有这件奇物，不会再次扣币。');
        } else if (result && result.reason === 'insufficient-balance') {
          renderDetail('古银币还不够，账本没有扣币。');
        } else {
          renderDetail('这次没能保存，古银币没有扣除。请先点上方「重新读取账本」，再确认兑换。', true);
        }
      } catch (_) {
        if (destroyed) return;
        buying = false;
        takeSnapshot();
        syncHeader();
        renderDetail('这次没能保存，请先点上方「重新读取账本」。账本会核对这件藏品，避免重复扣币。', true);
      }
    }

    function showPanel(next, focusSelector) {
      if (buying && next !== panel) return;
      panel = next;
      cottage.dataset.shopPanel = next;
      cottage.querySelectorAll('[data-shop-panel]').forEach(section => { section.hidden = section.dataset.shopPanel !== next; });
      el('herbCottageName').textContent = next === 'room' ? '我的巫师房间' : '午夜奇物铺';
      el('magicShopEyebrow').textContent = next === 'room' ? '旅途中的归处' : '为你的小屋挑一件奇物';
      if (next === 'room') renderRoom();
      if (next === 'shop') renderStore();
      const content = cottage.querySelector('.magic-house-content');
      if (content) content.scrollTop = 0;
      if (focusSelector) {
        const focusTarget = cottage.querySelector(focusSelector);
        if (focusTarget) focusTarget.focus({ preventScroll: true });
      }
    }

    function openDetail(id) {
      if (!byId.has(String(id))) return;
      selected = String(id);
      successful = null;
      detailNotice = null;
      renderDetail();
      showPanel('detail', '#magicShopBackStore');
    }

    function openRoom() {
      refresh();
      showPanel('room', '#magicShopEntry');
      if (!cottage.open && typeof cottage.showModal === 'function') cottage.showModal();
    }

    function openShop() {
      refresh();
      showPanel('shop', '#magicShopBackRoom');
      if (!cottage.open && typeof cottage.showModal === 'function') cottage.showModal();
    }

    function refresh(snapshot) {
      if (destroyed) return;
      takeSnapshot(snapshot);
      syncHeader();
      renderRoom();
      renderStore();
      if (selected && panel === 'detail') renderDetail();
    }

    function onCancel(event) {
      if (buying) { event.preventDefault(); return; }
      if (panel !== 'room') {
        event.preventDefault();
        showPanel(panel === 'detail' ? 'shop' : 'room', panel === 'detail' ? '#magicShopBackRoom' : '#magicShopEntry');
      }
    }

    tap(el('magicShopEntry'), openShop);
    tap(el('magicShopBackRoom'), openRoom);
    tap(el('magicShopBackStore'), () => showPanel('shop', '#magicShopBackRoom'));
    tap(el('magicShopRetryStorage'), async () => {
      if (recovering || buying) return;
      recovering = true;
      syncHeader();
      try {
        const snapshot = await (typeof ledger.retry === 'function' ? ledger.retry() : ledger.ready());
        if (destroyed) return;
        recovering = false;
        takeSnapshot(snapshot);
        detailNotice = { message: healthy() ? '账本已重新读取。看看余额，再确认是否兑换这件奇物。' : '账本还没有恢复。可以继续探险，稍后再来重新读取。', error: !healthy() };
        refresh();
      } catch (_) {
        if (destroyed) return;
        recovering = false;
        syncHeader();
        el('magicShopStorageCopy').textContent = '账本还没有恢复。可以继续探险，稍后再来重新读取。';
      }
    });
    tap(el('magicCollectionToggle'), () => {
      openCollection = !openCollection;
      el('magicCollectionBody').hidden = !openCollection;
      el('magicCollectionToggle').setAttribute('aria-expanded', String(openCollection));
    });
    cottage.querySelectorAll('[data-shop-category]').forEach(button => tap(button, () => {
      category = button.dataset.shopCategory;
      renderStore();
    }));
    cottage.addEventListener('cancel', onCancel);
    takeSnapshot();
    refresh();
    showPanel('room');
    if (typeof ledger.subscribe === 'function') unsubscribe = ledger.subscribe(snapshot => refresh(snapshot));
    Promise.resolve(typeof ledger.ready === 'function' ? ledger.ready() : null).then(snapshot => {
      if (destroyed) return;
      ready = true;
      cottage.dataset.shopReady = 'true';
      refresh(snapshot);
    }).catch(() => {
      if (destroyed) return;
      ready = true;
      cottage.dataset.shopReady = 'true';
      refresh();
      el('magicShopStoreStatus').textContent = '藏品账本暂时没有打开。你可以继续探险，稍后再来重试。';
    });

    return {
      openRoom, openShop, refresh,
      getPanel: () => panel,
      destroy() {
        destroyed = true;
        animationTimers.forEach(timer => clearTimeout(timer));
        animationTimers = [];
        if (typeof unsubscribe === 'function') unsubscribe();
        cottage.removeEventListener('cancel', onCancel);
        artBlobUrls.forEach(url => { try { objectUrls.revokeObjectURL(url); } catch (_) {} });
        artBlobUrls.clear();
      }
    };
  }

  global.HanziMagicShop = Object.freeze({ create });
})(typeof window !== 'undefined' ? window : globalThis);
