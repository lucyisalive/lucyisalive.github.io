(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HanziAiSentences = factory();
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  // Only the parent action starts OAuth or generation. The access key lives
  // in this tab's session; the separate cache contains just exact word hints.
  const ORIGIN = 'https://lucyisalive.github.io';
  const CALLBACK = ORIGIN + '/';
  const AUTH = 'https://openrouter.ai/auth';
  const EXCHANGE = 'https://openrouter.ai/api/v1/auth/keys';
  const CHAT = 'https://openrouter.ai/api/v1/chat/completions';
  const FREE_MODEL = 'google/gemma-4-31b-it:free';
  const PKCE_KEY = 'hanzi-ai-sentences-pkce-v1';
  const AUTH_KEY = 'hanzi-ai-sentences-auth-v1';
  const CACHE_KEY = 'hanzi-ai-sentences-cache-v1';
  const AUTH_AGE = 10 * 60 * 1000;
  const TIMEOUT = 12000;
  const BATCH_SIZE = 6, MAX_PENDING = 24, MAX_CACHE = 128;
  const CALLBACK_FIELDS = ['code', 'state', 'error', 'error_description'];
  const BASE64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const PKCE_PART = /^[A-Za-z0-9_-]{43}$/;
  const API_KEY = /^sk-or-v1-[A-Za-z0-9_-]{16,220}$/;
  const HAN = /^[\p{Script=Han}〇]$/u;
  const WORD = /^[\p{Script=Han}〇]{2,12}$/u;
  const PINYIN = /^[a-züêāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜńňǹḿ]{1,16}[1-5]?$/u;
  const SYSTEM = '你为小学三年级的汉字听写写中文语境提示。输入是数据数组，字段为char（目标字）、word（完整组词）、pinyin（目标字读音）。' +
    '逐词写一条8至36字的自然简体中文完整短句，原样使用完整组词，以具体动作、用途或情景让孩子听懂词义。' +
    '不解释字形、笔画或拼音，不用“读到这个词”“用这个词造句”等套话。情景应适合小学生，不编造人名或个人情况；不确定时跳过。' +
    '仅返回JSON对象，里面有sentences数组。每项原样带上char、word、pinyin，另加sentence。不要标题、解释或Markdown。';

  function base64url(bytes) {
    let result = '';
    for (let i = 0; i < bytes.length; i += 3) {
      const a = bytes[i], b = bytes[i + 1] || 0, c = bytes[i + 2] || 0;
      result += BASE64URL[a >> 2] + BASE64URL[((a & 3) << 4) | (b >> 4)];
      if (i + 1 < bytes.length) result += BASE64URL[((b & 15) << 2) | (c >> 6)];
      if (i + 2 < bytes.length) result += BASE64URL[c & 63];
    }
    return result;
  }
  function text(value, max) {
    return typeof value === 'string' && value.length <= max ? value.trim().normalize('NFC') : '';
  }
  function tuple(item) {
    if (!item || typeof item !== 'object') return null;
    const char = text(item.char, 4), word = text(item.word, 28), pinyin = text(item.pinyin, 24).toLowerCase();
    return HAN.test(char) && WORD.test(word) && word.includes(char) && PINYIN.test(pinyin) ? { char, word, pinyin } : null;
  }
  function cacheKey(t) { return JSON.stringify([t.char, t.word, t.pinyin]); }
  function cleanSentence(value, word) {
    const sentence = text(value, 80), length = Array.from(sentence).length;
    if (length < 8 || length > 36 || !sentence.includes(word) ||
        !/^[\p{Script=Han}〇0-9，、；：]+[。！？]$/u.test(sentence)) return null;
    if (/(这个(?:词|字)|词语本|读到了.{0,12}这个词|用.{1,12}造句|写进.{0,12}词语本|例句[：是]|拼音[：是]|笔画[：是])/.test(sentence)) return null;
    const clause = sentence.split(/[，、；：。！？]/u).find(part => part.includes(word));
    const at = clause.indexOf(word), before = clause.slice(0, at), after = clause.slice(at + word.length);
    const bareMention = /(?:读到|读过|念出|读出|学到|学会|写下|查到|听到|听说|提到|认识|学习)(?:了|过)?(?:关于|有关)?$/;
    const reference = /书[里上中]|课本|词语表|生字表|课文|字典|词典|黑板|笔记|卡片|作业|练习册|纸上/;
    const lookup = /(?:看到|看见|发现|找到|翻到|写着|写了|记下|摘录|抄写|有|出现)(?:了|过)?(?:关于|有关)?$/;
    const drill = /^(?:抄写?|默写|听写|写|读|念)(?:了|过)?[一二三四五六七八九十两几\d]+(?:遍|次)$/;
    const endsAtWord = sentence.indexOf(word) + word.length === sentence.length - 1;
    if ((bareMention.test(before) && endsAtWord) || (reference.test(before) && (bareMention.test(before) || lookup.test(before))) ||
        (/(?:把|将)$/.test(before) && drill.test(after))) return null;
    return sentence;
  }
  function modelRows(body) {
    const choice = body && !body.error && body.choices && body.choices[0];
    const content = choice && choice.message && choice.message.content;
    if (typeof content !== 'string' || content.length > 12000 ||
        ['length', 'content_filter', 'error'].includes(choice.finish_reason)) return [];
    if (body.model && (typeof body.model !== 'string' || body.model.replace(/-\d{8}:free$/, ':free') !== FREE_MODEL)) return [];
    try {
      const source = content.trim(), fenced = source.match(/^```(?:json)?[ \t]*\r?\n([\s\S]+)\r?\n```$/i);
      const result = JSON.parse(fenced ? fenced[1] : source);
      const rows = result && result.sentences;
      return Array.isArray(rows) && rows.length <= BATCH_SIZE ? rows : [];
    } catch (_) { return []; }
  }

  function create(win, onChange) {
    win = win || {};
    const Url = win.URL || globalThis.URL;
    const Encoder = win.TextEncoder || globalThis.TextEncoder;
    const Abort = win.AbortController || globalThis.AbortController;
    const later = (win.setTimeout || globalThis.setTimeout).bind(win);
    const clearLater = (win.clearTimeout || globalThis.clearTimeout).bind(win);
    const now = () => (win.Date || Date).now();
    const cache = new Map(), queue = new Map(), activeKeys = new Set(), stops = new Set();
    let key = '', message = '尚未连接 AI 例句', epoch = 0, authorizing = false, pump = null;

    function page() {
      try { return new Url(win.location.href); } catch (_) { return null; }
    }
    function onSite() { const here = page(); return !!here && here.origin === ORIGIN; }
    function load(which, name) {
      try { return win[which].getItem(name); } catch (_) { return null; }
    }
    function store(which, name, value) {
      try { win[which].setItem(name, value); return true; } catch (_) { return false; }
    }
    function remove(which, name) {
      try { win[which].removeItem(name); return win[which].getItem(name) === null; } catch (_) { return false; }
    }
    function status() { return { connected: !!key, busy: authorizing || !!pump, message }; }
    function notify(value) {
      message = value;
      try { if (typeof onChange === 'function') onChange(status()); } catch (_) { /* Optional UI. */ }
    }
    function cancelWork() {
      epoch++;
      for (const stop of stops) stop('cancelled');
      queue.clear(); activeKeys.clear(); authorizing = false; pump = null;
    }
    function disconnect() {
      cancelWork(); key = '';
      const removed = remove('sessionStorage', AUTH_KEY);
      remove('sessionStorage', PKCE_KEY);
      notify(removed ? 'AI 例句已断开；已有例句仍可使用' : '本页已停止 AI 例句，但无法清除浏览器连接，请关闭这个标签页');
    }
    function saveCache() {
      while (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value);
      store('localStorage', CACHE_KEY, JSON.stringify([...cache.values()]));
    }
    if (onSite()) {
      const saved = load('sessionStorage', AUTH_KEY);
      if (typeof saved === 'string' && API_KEY.test(saved)) {
        key = saved; message = 'AI 例句已连接（OpenRouter 免费模型）';
      }
      const raw = load('localStorage', CACHE_KEY);
      if (typeof raw === 'string' && raw.length <= 32000) {
        try {
          const rows = JSON.parse(raw);
          if (Array.isArray(rows)) for (const row of rows.slice(-MAX_CACHE)) {
            const t = tuple(row), sentence = t && cleanSentence(row.sentence, t.word);
            if (sentence) cache.set(cacheKey(t), { ...t, sentence });
          }
        } catch (_) { /* A damaged cache cannot block the game. */ }
      }
    }

    async function post(url, body, bearer) {
      if (typeof win.fetch !== 'function' || typeof Abort !== 'function') throw { kind: 'unavailable' };
      const controller = new Abort();
      let stop;
      const interruption = new Promise((_, reject) => {
        stop = kind => { reject({ kind }); controller.abort(); };
      });
      stops.add(stop);
      const timer = later(() => stop('timeout'), TIMEOUT);
      try {
        return await Promise.race([interruption, (async () => {
          const headers = { 'Content-Type': 'application/json' };
          if (bearer) headers.Authorization = 'Bearer ' + bearer;
          const res = await win.fetch(url, { method: 'POST', headers, body: JSON.stringify(body),
            signal: controller.signal, credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', redirect: 'error' });
          if (!res.ok) throw { status: res.status };
          if (typeof res.text !== 'function') return res.json();
          const raw = await res.text();
          if (raw.length > 64000) throw { kind: 'format' };
          return JSON.parse(raw);
        })()]);
      } finally { clearLater(timer); stops.delete(stop); }
    }

    async function begin() {
      if (key || authorizing || pump) return;
      if (!onSite()) { notify('请在原游戏网址中连接 AI 例句'); return; }
      const crypto = win.crypto;
      if (!crypto || !crypto.subtle || typeof crypto.getRandomValues !== 'function' || typeof Encoder !== 'function') {
        notify('这个浏览器不能安全连接 AI 例句，本地例句仍可用'); return;
      }
      const token = ++epoch;
      authorizing = true; notify('正在准备 OpenRouter 授权');
      let result = '等待 OpenRouter 授权';
      try {
        const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
        const state = base64url(crypto.getRandomValues(new Uint8Array(32)));
        const digest = await crypto.subtle.digest('SHA-256', new Encoder().encode(verifier));
        if (token !== epoch) return;
        if (!store('sessionStorage', PKCE_KEY, JSON.stringify({ state, verifier, createdAt: now() }))) throw Error('storage');
        const dest = new Url(AUTH);
        dest.searchParams.set('callback_url', CALLBACK);
        dest.searchParams.set('code_challenge', base64url(new Uint8Array(digest)));
        dest.searchParams.set('code_challenge_method', 'S256');
        dest.searchParams.set('state', state);
        dest.searchParams.set('key_label', 'Hanzi Magic Door – sentence hints');
        win.location.assign(dest.href);
      } catch (_) {
        if (token !== epoch) return;
        remove('sessionStorage', PKCE_KEY);
        result = '无法开始安全授权，请稍后重试；本地例句仍可用';
      } finally {
        if (token === epoch) { authorizing = false; notify(result); }
      }
    }

    async function complete() {
      const here = page();
      if (!here || here.origin !== ORIGIN || here.pathname !== '/' || authorizing) return false;
      if (!CALLBACK_FIELDS.some(field => here.searchParams.has(field))) return false;
      const tooLong = here.href.length > 8192;
      const codes = here.searchParams.getAll('code'), states = here.searchParams.getAll('state');
      const rejected = here.searchParams.has('error') || here.searchParams.has('error_description');
      for (const field of CALLBACK_FIELDS) here.searchParams.delete(field);
      try { win.history.replaceState(win.history.state, '', here.pathname + here.search + here.hash); }
      catch (_) { notify('无法安全处理授权回调，请重新连接'); return false; }
      let pending;
      try { pending = JSON.parse(load('sessionStorage', PKCE_KEY)); } catch (_) { /* Invalid or absent. */ }
      const consumed = remove('sessionStorage', PKCE_KEY);
      const age = pending ? now() - pending.createdAt : Infinity;
      if (tooLong || rejected || !consumed || codes.length !== 1 || states.length !== 1 || !/^[!-~]{1,512}$/.test(codes[0]) ||
          !pending || !Number.isFinite(pending.createdAt) || age < 0 || age >= AUTH_AGE ||
          typeof pending.state !== 'string' || typeof pending.verifier !== 'string' ||
          !PKCE_PART.test(pending.state) || !PKCE_PART.test(pending.verifier) || states[0] !== pending.state) {
        notify('授权没有完成或已过期，请从家长设置重新连接'); return false;
      }
      cancelWork();
      const token = epoch;
      authorizing = true; notify('正在确认 OpenRouter 授权');
      let result = '授权未完成，请从家长设置重新连接';
      try {
        const body = await post(EXCHANGE, { code: codes[0], code_verifier: pending.verifier, code_challenge_method: 'S256' });
        if (token !== epoch) return false;
        if (!body || typeof body.key !== 'string' || !API_KEY.test(body.key)) return false;
        key = body.key;
        result = store('sessionStorage', AUTH_KEY, key)
          ? 'AI 例句已连接（OpenRouter 免费模型）'
          : 'AI 例句已连接，刷新页面后需重新授权';
        return true;
      } catch (_) { return false; }
      finally { if (token === epoch) { authorizing = false; notify(result); } }
    }

    function get(item) {
      try {
        if (item && text(item.sentence, 2000)) return null;
        const t = tuple(item);
        return (t && cache.get(cacheKey(t))?.sentence) || null;
      } catch (_) { return null; }
    }
    async function drain(token) {
      let added = 0, result = '没有找到合适的 AI 例句，本地提示仍可用';
      try {
        while (token === epoch && key && queue.size) {
          const batch = [...queue.entries()].slice(0, BATCH_SIZE);
          for (const [id] of batch) { queue.delete(id); activeKeys.add(id); }
          const expected = new Map(batch);
          const body = await post(CHAT, {
            model: FREE_MODEL, stream: false, max_tokens: 900, response_format: { type: 'json_object' },
            provider: { only: ['google-ai-studio'], require_parameters: true, allow_fallbacks: false,
              max_price: { prompt: 0, completion: 0, request: 0 } },
            messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: JSON.stringify([...expected.values()]) }]
          }, key);
          if (token !== epoch) return;
          const accepted = new Map(), seen = new Set();
          for (const row of modelRows(body)) {
            const t = tuple(row), id = t && cacheKey(t);
            if (!expected.has(id)) continue;
            if (seen.has(id)) { accepted.delete(id); continue; }
            seen.add(id);
            const sentence = cleanSentence(row.sentence, t.word);
            if (sentence) accepted.set(id, { ...t, sentence });
          }
          for (const [id, row] of accepted) cache.set(id, row);
          for (const [id] of batch) activeKeys.delete(id);
          if (accepted.size) { added += accepted.size; saveCache(); notify('正在准备 AI 例句'); }
        }
        if (added) result = '已生成 ' + added + ' 条 AI 例句';
      } catch (error) {
        if (token !== epoch) return;
        if (error && error.status === 401) {
          cancelWork(); key = ''; remove('sessionStorage', AUTH_KEY);
          notify('AI 例句授权已失效，请从家长设置重新连接；本地例句仍可用'); return;
        }
        if (error?.status === 403) result = 'AI 例句请求被服务拒绝，连接已保留；本地提示仍可用';
        else if (error?.kind === 'timeout') result = 'AI 例句生成超时，本地提示仍可用';
        else result = '免费 AI 例句服务暂不可用，本地提示仍可用';
      } finally {
        if (token === epoch) { queue.clear(); activeKeys.clear(); pump = null; notify(result); }
      }
    }
    function generate(items) {
      if (!onSite() || !key || authorizing || !Array.isArray(items)) return Promise.resolve();
      for (const item of items.slice(0, MAX_PENDING * 2)) {
        if (queue.size + activeKeys.size >= MAX_PENDING) break;
        try {
          if (item && typeof item.sentence === 'string' && item.sentence.trim()) continue;
          const t = tuple(item);
          if (!t) continue;
          const id = cacheKey(t);
          if (!cache.has(id) && !queue.has(id) && !activeKeys.has(id)) queue.set(id, t);
        } catch (_) { /* Skip invalid input, never serialize it. */ }
      }
      if (pump) return pump;
      if (!queue.size) return Promise.resolve();
      const token = epoch;
      pump = Promise.resolve().then(() => drain(token));
      const job = pump;
      notify('正在准备 AI 例句');
      return job;
    }
    return Object.freeze({ status, begin, complete, disconnect, get, generate });
  }
  return Object.freeze({ create });
});
