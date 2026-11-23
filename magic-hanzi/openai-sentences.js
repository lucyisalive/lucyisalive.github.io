(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HanziOpenAiSentences = factory();
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  // A family-only service credential is provided by the host integration.
  // OpenAI API keys belong exclusively in the server's secret store.
  const CACHE_KEY = 'hanzi-ai-sentences-cache-v1';
  const MAX_CACHE = 512, BATCH_SIZE = 6, MAX_PENDING = 24;
  const HAN = /^[\p{Script=Han}〇]$/u;
  const WORD = /^[\p{Script=Han}〇]{2,12}$/u;
  const PINYIN = /^[a-züêāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜńňǹḿ]{1,16}[1-5]?$/u;

  function tuple(value) {
    if (!value || typeof value !== 'object') return null;
    const { char, word, pinyin } = value;
    if (typeof char !== 'string' || typeof word !== 'string' || typeof pinyin !== 'string') return null;
    const result = { char: char.trim().normalize('NFC'), word: word.trim().normalize('NFC'),
      pinyin: pinyin.trim().normalize('NFC').toLowerCase() };
    return HAN.test(result.char) && WORD.test(result.word) && result.word.includes(result.char) &&
      PINYIN.test(result.pinyin) ? result : null;
  }
  function id(item) { return JSON.stringify([item.char, item.word, item.pinyin]); }
  function sentence(value, word) {
    if (typeof value !== 'string' || value.length > 80) return null;
    const text = value.trim().normalize('NFC'), length = Array.from(text).length;
    if (length < 8 || length > 36 || !text.includes(word) ||
        !/^[\p{Script=Han}〇0-9，、；：]+[。！？]$/u.test(text) ||
        /(这个(?:词|字)|词语本|用.{1,12}造句|例句[：是]|拼音[：是]|笔画[：是])/.test(text)) return null;
    return text;
  }
  function credential(value) {
    return typeof value === 'string' && /^[A-Za-z0-9_-]{32,256}$/.test(value) && !/^sk-/i.test(value) ? value : null;
  }
  function errorMessage(error) {
    if (['unconfigured', 'not_configured', 'service_unconfigured'].includes(error?.code))
      return 'OpenAI 自动造句尚未配置；已有例句仍可用';
    if (error?.status === 401 || error?.status === 403)
      return '自动造句的家庭连接未通过验证；已有例句仍可用';
    if (['quota_exceeded', 'insufficient_quota', 'upstream_quota'].includes(error?.code))
      return 'OpenAI 接口额度不足；已有例句仍可用';
    if (error?.status === 429) return '自动造句暂时达到请求限额，请稍后再试；已有例句仍可用';
    if (error?.code === 'upstream_auth') return 'OpenAI 服务端授权需要更新；已有例句仍可用';
    if (['timeout', 'upstream_timeout'].includes(error?.code) || error?.status === 504) return 'OpenAI 造句超时；已有例句仍可用';
    return 'OpenAI 造句暂时未完成；已有例句仍可用';
  }

  function create(win, onChange, options) {
    win = win || {}; options = options || {};
    const Url = win.URL || globalThis.URL;
    const Abort = win.AbortController || globalThis.AbortController;
    const later = (win.setTimeout || globalThis.setTimeout).bind(win);
    const clearLater = (win.clearTimeout || globalThis.clearTimeout).bind(win);
    const cache = new Map(), queue = new Map(), attempted = new Set();
    let base = null, allowedPage = false, ready = false, enabled = true, epoch = 0;
    let connecting = null, pump = null, message = 'OpenAI 自动造句尚未配置；已有例句仍可用';
    const controllers = new Set();
    try {
      const page = new Url(win.location.href);
      allowedPage = page.origin === 'https://lucyisalive.github.io' && page.pathname.startsWith('/magic-hanzi/');
      if (options.development === true && ['localhost', '127.0.0.1'].includes(page.hostname)) allowedPage = true;
      if (typeof options.endpoint === 'string' && options.endpoint) {
        const url = new Url(options.endpoint);
        if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw Error();
        base = url.href.replace(/\/$/, '');
      }
    } catch (_) { base = null; }
    function status() { return { connected: ready && enabled, busy: !!connecting || !!pump, message }; }
    function notify(text) {
      message = text;
      try { onChange?.(status()); } catch (_) { /* UI cannot interrupt learning. */ }
    }
    function saved() {
      while (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value);
      try { win.localStorage.setItem(CACHE_KEY, JSON.stringify([...cache.values()])); } catch (_) { /* Durable host write-back is separate. */ }
    }
    if (allowedPage) {
      try {
        const raw = win.localStorage.getItem(CACHE_KEY);
        if (raw && raw.length <= 128000) {
          const rows = JSON.parse(raw);
          if (Array.isArray(rows)) for (const row of rows.slice(-MAX_CACHE)) {
            const item = tuple(row), text = item && sentence(row.sentence, item.word);
            if (text) cache.set(id(item), { ...item, sentence: text });
          }
        }
      } catch (_) { /* A broken or unavailable cache cannot block the game. */ }
    }
    async function request(path, body, token) {
      if (!allowedPage || !base || typeof options.getAccessToken !== 'function' ||
          typeof win.fetch !== 'function' || typeof Abort !== 'function') throw { code: 'unconfigured' };
      const access = credential(await options.getAccessToken());
      if (token !== epoch) throw { code: 'cancelled' };
      if (!access) throw { status: 401 };
      const controller = new Abort();
      controllers.add(controller);
      let timeout;
      const interrupted = new Promise((_, reject) => {
        timeout = later(() => { controller.abort(); reject({ code: 'timeout' }); }, 25000);
      });
      try {
        return await Promise.race([interrupted, (async () => {
          const res = await win.fetch(base + path, {
            method: body ? 'POST' : 'GET',
            headers: { Authorization: 'Bearer ' + access, ...(body ? { 'Content-Type': 'application/json' } : {}) },
            ...(body ? { body: JSON.stringify(body) } : {}),
            credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer', cache: 'no-store', signal: controller.signal,
          });
          const raw = await res.text();
          if (raw.length > 32000) throw { code: 'format' };
          let data;
          try { data = JSON.parse(raw); } catch (_) { throw { code: 'format' }; }
          if (!res.ok) throw { status: res.status, code: data?.error?.code };
          return data;
        })()]);
      } finally { clearLater(timeout); controllers.delete(controller); }
    }
    function begin() {
      if (connecting) return connecting;
      if (pump) return Promise.resolve(ready);
      enabled = true;
      attempted.clear();
      if (!allowedPage || !base) { notify(errorMessage({ code: 'unconfigured' })); return Promise.resolve(false); }
      const token = epoch;
      connecting = Promise.resolve().then(async () => {
        try {
          const result = await request('/health', null, token);
          if (token !== epoch) return false;
          if (result?.ready !== true) throw { code: 'unconfigured' };
          ready = true;
          notify('OpenAI 自动造句已连接');
          return true;
        } catch (error) {
          if (token === epoch) { ready = false; notify(errorMessage(error)); }
          return false;
        } finally {
          if (token === epoch) { connecting = null; notify(message); }
        }
      });
      notify('正在检查 OpenAI 自动造句');
      return connecting;
    }
    function disconnect() {
      epoch++; enabled = false; ready = false; connecting = null; pump = null; queue.clear();
      for (const controller of controllers) controller.abort();
      notify('自动造句已暂停；已有例句仍可用');
    }
    function get(item) {
      if (typeof item?.sentence === 'string' && item.sentence.trim()) return null;
      const value = tuple(item);
      return value ? cache.get(id(value))?.sentence || null : null;
    }
    function generate(items) {
      if (!ready || !enabled || !Array.isArray(items)) return Promise.resolve([]);
      for (const item of items.slice(0, MAX_PENDING * 2)) {
        if (queue.size >= MAX_PENDING) break;
        const value = tuple(item);
        if (!value || typeof item.sentence === 'string' && item.sentence.trim()) continue;
        const key = id(value);
        if (!cache.has(key) && !attempted.has(key)) queue.set(key, value);
      }
      if (pump) return pump;
      if (!queue.size) return Promise.resolve([]);
      const token = epoch;
      pump = Promise.resolve().then(async () => {
        const generated = [];
        try {
          while (token === epoch && queue.size) {
            const batch = [...queue.values()].slice(0, BATCH_SIZE), expected = new Map(batch.map(value => [id(value), value]));
            for (const key of expected.keys()) { queue.delete(key); attempted.add(key); }
            const result = await request('/v1/sentences', { items: batch }, token);
            if (token !== epoch) return [];
            if (!Array.isArray(result?.sentences) || result.sentences.length > BATCH_SIZE) throw { code: 'format' };
            const accepted = new Map(), seen = new Set();
            for (const row of result.sentences) {
              const value = tuple(row), key = value && id(value), text = value && sentence(row.sentence, value.word);
              if (!expected.has(key)) continue;
              if (seen.has(key)) { accepted.delete(key); continue; }
              seen.add(key);
              if (text) accepted.set(key, { ...value, sentence: text });
            }
            for (const [key, row] of accepted) { cache.set(key, row); generated.push(row); }
            if (accepted.size) saved();
          }
          notify(generated.length ? '已生成 ' + generated.length + ' 条 OpenAI 例句' : '本次未生成合适的例句；已有例句仍可用');
          return generated;
        } catch (error) {
          if (token === epoch) {
            if (error?.status === 401 || error?.status === 403) ready = false;
            notify(errorMessage(error));
          }
          return generated;
        } finally { if (token === epoch) { queue.clear(); pump = null; notify(message); } }
      });
      notify('正在准备 OpenAI 例句');
      return pump;
    }
    return Object.freeze({ status, begin, complete: begin, disconnect, get, generate });
  }
  return Object.freeze({ create });
});
