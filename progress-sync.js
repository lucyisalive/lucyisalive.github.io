(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory(root);
  else root.HanziProgressSync = factory(root);
}(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function (root) {
  'use strict';

  // This module only projects learning state. Handwriting, grades awaiting review,
  // and every unknown field are deliberately never read or copied into a payload.
  var META_KEY = 'hanzi-magic-door-sync-v1';
  var BACKUP_KEY = 'hanzi-magic-door-sync-backups-v1';
  var APP = 'hanzi-magic-door';
  var MAX_BYTES = 600 * 1024;
  var DEBOUNCE_MS = 800;
  var TIMEOUT_MS = 6000;
  var own = Function.call.bind(Object.prototype.hasOwnProperty);

  function problem(message, kind) {
    var error = new Error(message);
    error.syncKind = kind || 'error';
    return error;
  }
  function object(value) { return value && typeof value === 'object' && !Array.isArray(value); }
  function string(value, max, label) {
    if (typeof value !== 'string' || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) {
      throw problem('进度中的' + label + '格式不正确');
    }
    return value;
  }
  function integer(value, min, max, label) {
    if (!Number.isSafeInteger(value) || value < min || value > max) throw problem('进度中的' + label + '数值不正确');
    return value;
  }
  function bool(value, label) {
    if (typeof value !== 'boolean') throw problem('进度中的' + label + '格式不正确');
    return value;
  }
  function day(value, label, nullable) {
    if (nullable && value === null) return null;
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw problem('进度中的' + label + '日期不正确');
    var date = new Date(value + 'T00:00:00.000Z');
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw problem('进度中的' + label + '日期不正确');
    return value;
  }
  function char(value) {
    string(value, 2, '汉字');
    var point = value.codePointAt(0);
    if (Array.from(value).length !== 1 || !((point >= 0x3400 && point <= 0x9fff) ||
        (point >= 0xf900 && point <= 0xfaff) || (point >= 0x20000 && point <= 0x323af))) {
      throw problem('进度中有无效的汉字');
    }
    return value;
  }
  function textFields(input, result, fields) {
    fields.forEach(function (pair) {
      if (own(input, pair[0])) result[pair[0]] = string(input[pair[0]], pair[1], pair[0]);
    });
  }
  function bankItem(input) {
    if (!object(input)) throw problem('字库记录格式不正确');
    var result = { char: char(input.char) };
    textFields(input, result, [['pinyin', 120], ['word', 300], ['sentence', 2000], ['structure', 100], ['curriculumId', 200]]);
    [['box', 0, 6], ['interval', 0, 36500], ['wrongToday', 0, 1000], ['strokeCount', 1, 100]].forEach(function (rule) {
      if (own(input, rule[0])) result[rule[0]] = integer(input[rule[0]], rule[1], rule[2], rule[0]);
    });
    ['lastSeen', 'wrongDay', 'stuckDay'].forEach(function (key) {
      if (own(input, key)) result[key] = day(input[key], key, true);
    });
    ['stuck', 'fromParent', 'retired'].forEach(function (key) {
      if (own(input, key)) result[key] = bool(input[key], key);
    });
    ['unit', 'lesson'].forEach(function (key) {
      if (own(input, key)) result[key] = input[key] === null ? null : (typeof input[key] === 'number'
        ? integer(input[key], 0, 10000, key) : string(input[key], 100, key));
    });
    if (own(input, 'history')) {
      if (!Array.isArray(input.history) || input.history.length > 5000) throw problem('学习历史过长或格式不正确');
      result.history = input.history.map(function (entry) {
        if (!object(entry) || ['first-try', 'retest-pass', 'abandoned'].indexOf(entry.outcome) < 0) throw problem('学习历史结果不正确');
        return { day: day(entry.day, 'history'), outcome: entry.outcome };
      });
    }
    if (own(input, 'passedDays')) {
      if (!Array.isArray(input.passedDays) || input.passedDays.length > 5000) throw problem('掌握日期格式不正确');
      result.passedDays = input.passedDays.map(function (entry) { return day(entry, 'passedDays'); });
    }
    return result;
  }
  function priorityItem(input) {
    if (!object(input)) throw problem('家长选字记录格式不正确');
    var result = { char: char(input.char) };
    textFields(input, result, [['pinyin', 120], ['word', 300], ['sentence', 2000], ['requestId', 200]]);
    if (own(input, 'alts')) {
      if (!Array.isArray(input.alts) || input.alts.length > 30) throw problem('读音记录格式不正确');
      result.alts = input.alts.map(function (value) { return string(value, 120, 'alts'); });
    }
    ['addedDay', 'completedDay'].forEach(function (key) {
      if (own(input, key)) result[key] = day(input[key], key, true);
    });
    return result;
  }
  function uniqueList(input, label, project) {
    if (!Array.isArray(input) || input.length > 2000) throw problem(label + '格式不正确或数量过多');
    var seen = Object.create(null);
    return input.map(function (value) {
      var result = project(value);
      if (seen[result.char]) throw problem(label + '含重复汉字');
      seen[result.char] = true;
      return result;
    });
  }
  function project(input) {
    if (!object(input)) throw problem('学习进度格式不正确');
    var result = {
      bank: uniqueList(input.bank, '字库', bankItem),
      bankVersion: own(input, 'bankVersion') ? integer(input.bankVersion, 0, 1000000, 'bankVersion') : 0,
      priorityQueue: uniqueList(own(input, 'priorityQueue') ? input.priorityQueue : [], '家长选字', priorityItem),
      dailyCount: own(input, 'dailyCount') ? integer(input.dailyCount, 1, 30, 'dailyCount') : 5,
      scenesUnlocked: own(input, 'scenesUnlocked') ? integer(input.scenesUnlocked, 0, 1000000, 'scenesUnlocked') : 0
    };
    if (own(input, 'sessionProgress')) {
      var session = input.sessionProgress;
      if (!object(session) || session.version !== 1) throw problem('本轮进度格式不正确');
      result.sessionProgress = {
        version: 1, day: day(session.day, 'sessionProgress'),
        roundId: string(session.roundId, 100, 'roundId'),
        passedCount: integer(session.passedCount, 0, 1000, 'passedCount'),
        completed: bool(session.completed, 'completed'),
        sceneAwarded: bool(session.sceneAwarded, 'sceneAwarded')
      };
      if (!result.sessionProgress.roundId) throw problem('本轮编号不能为空');
    }
    return result;
  }
  function normalizeCode(value) {
    if (typeof value !== 'string') throw problem('请输入完整的汉字游戏同步码');
    var normalized = value.replace(/[\s-]/g, '').toLowerCase();
    if (!/^[0-9a-f]{32}$/.test(normalized)) throw problem('同步码应为四组、每组八位的字母和数字');
    return normalized;
  }
  function displayCode(value) { return value ? value.match(/.{8}/g).join('-') : ''; }
  function hex(bytes) {
    return Array.prototype.map.call(new Uint8Array(bytes), function (b) { return b.toString(16).padStart(2, '0'); }).join('');
  }
  function base64(bytes) {
    var alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    var out = '';
    for (var i = 0; i < bytes.length; i += 3) {
      var a = bytes[i], b = bytes[i + 1], c = bytes[i + 2];
      out += alphabet[a >> 2] + alphabet[((a & 3) << 4) | ((b || 0) >> 4)] +
        (i + 1 < bytes.length ? alphabet[((b & 15) << 2) | ((c || 0) >> 6)] : '=') +
        (i + 2 < bytes.length ? alphabet[c & 63] : '=');
    }
    return out;
  }
  function unbase64(value, max) {
    if (typeof value !== 'string' || value.length > Math.ceil(max / 3) * 4 ||
        !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) throw problem('云端加密数据格式不正确');
    var alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    var output = [];
    for (var i = 0; i < value.length; i += 4) {
      var a = alphabet.indexOf(value[i]), b = alphabet.indexOf(value[i + 1]);
      var c = alphabet.indexOf(value[i + 2]), d = alphabet.indexOf(value[i + 3]);
      output.push((a << 2) | (b >> 4));
      if (c >= 0) output.push(((b & 15) << 4) | (c >> 2));
      if (d >= 0) output.push(((c & 3) << 6) | d);
    }
    if (output.length > max) throw problem('云端进度超过大小限制');
    return new Uint8Array(output);
  }

  function create(options) {
    options = options || {};
    var environment = typeof globalThis !== 'undefined' ? globalThis : root;
    var fetcher = options.fetch || (root.fetch && root.fetch.bind(root)) || (environment.fetch && environment.fetch.bind(environment));
    var crypt = own(options, 'crypto') ? options.crypto : (root.crypto || environment.crypto);
    var Encoder = root.TextEncoder || environment.TextEncoder;
    var Decoder = root.TextDecoder || environment.TextDecoder;
    var Abort = root.AbortController || environment.AbortController;
    var storage;
    try { storage = own(options, 'storage') ? options.storage : root.localStorage; } catch (_) { storage = null; }
    var later = options.setTimeout || (root.setTimeout && root.setTimeout.bind(root)) || (environment.setTimeout && environment.setTimeout.bind(environment));
    var cancelTimer = options.clearTimeout || (root.clearTimeout && root.clearTimeout.bind(root)) || (environment.clearTimeout && environment.clearTimeout.bind(environment));
    var now = options.now || Date.now;
    var meta = null, started = false, epoch = 0, revision = 0, observedJSON = null;
    var debounce = null, inFlight = null, keysCache = null, applying = false;
    var controllers = [], conflictRemote = null;
    var view = { kind: 'off', message: '尚未开启跨设备同步', connected: false, lastSyncedAt: null };

    function status() { return Object.assign({}, view); }
    function emit(kind, message) {
      view = { kind: kind, message: message, connected: !!(meta && meta.code),
        lastSyncedAt: meta && meta.lastSyncedAt !== null ? meta.lastSyncedAt : null };
      if (meta && meta.code) view.code = displayCode(meta.code);
      try { if (typeof options.onStatus === 'function') options.onStatus(status()); } catch (_) { /* UI callbacks cannot break saving. */ }
      return status();
    }
    function requireStorage() {
      if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') throw problem('本机存储不可用，进度仍保留在当前页面，暂不能同步');
    }
    function persist(candidate) {
      requireStorage();
      try { storage.setItem(META_KEY, JSON.stringify(candidate)); }
      catch (_) { throw problem('本机同步设置未能保存，请保留此页面并检查存储空间'); }
    }
    function saveMeta() { if (meta) persist(meta); }
    function snapshot() {
      if (typeof options.getState !== 'function') throw problem('无法读取本机学习进度');
      var value = project(options.getState());
      var json = JSON.stringify(value);
      if (typeof Encoder !== 'function') throw problem('此浏览器不支持安全同步，请更新浏览器', 'unsupported');
      if (new Encoder().encode(json).length > MAX_BYTES) throw problem('学习进度超过600KB，暂不能同步；本机进度仍保留');
      return { state: value, json: json };
    }
    function refreshLocal() {
      var current = snapshot();
      if (observedJSON !== null && observedJSON !== current.json) {
        revision += 1;
        if (meta) { meta.dirty = true; saveMeta(); }
      }
      observedJSON = current.json;
      return current;
    }
    function ensureEpoch(token) { if (token !== epoch) throw problem('同步操作已取消', 'cancelled'); }
    function ensureUnchanged(token, localRevision) {
      ensureEpoch(token);
      refreshLocal();
      if (revision !== localRevision) throw problem('同步期间本机进度又有变化，两份进度都已保留，请选择保留哪份', 'conflict');
    }
    function capable() {
      if (!crypt || !crypt.subtle || typeof crypt.getRandomValues !== 'function' ||
          typeof crypt.subtle.digest !== 'function' || typeof crypt.subtle.importKey !== 'function' ||
          typeof crypt.subtle.encrypt !== 'function' || typeof crypt.subtle.decrypt !== 'function' ||
          typeof Encoder !== 'function' || typeof Decoder !== 'function' || typeof Abort !== 'function' ||
          typeof later !== 'function' || typeof cancelTimer !== 'function') throw problem('此浏览器不支持安全同步；本机游戏仍可使用', 'unsupported');
      if (typeof fetcher !== 'function') throw problem('此浏览器暂不能连接同步服务', 'unsupported');
      if (typeof options.projectId !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9-]{2,99}$/.test(options.projectId)) throw problem('同步服务尚未配置');
    }
    async function hash(json) { return hex(await crypt.subtle.digest('SHA-256', new Encoder().encode(json))); }
    async function keys(code, token) {
      capable();
      if (!keysCache || keysCache.code !== code) {
        keysCache = { code: code, promise: (async function () {
          var encoder = new Encoder();
          var digests = await Promise.all([
            crypt.subtle.digest('SHA-256', encoder.encode('hanzi-magic-door:document:v1:' + code)),
            crypt.subtle.digest('SHA-256', encoder.encode('hanzi-magic-door:key:v1:' + code))
          ]);
          return {
            id: 'hanzi-v1-' + hex(digests[0]),
            key: await crypt.subtle.importKey('raw', digests[1], { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
          };
        }()) };
      }
      var result = await keysCache.promise;
      ensureEpoch(token);
      return result;
    }
    function address(derived) {
      return 'https://firestore.googleapis.com/v1/projects/' + encodeURIComponent(options.projectId) +
        '/databases/(default)/documents/families/' + derived.id;
    }
    async function request(url, init, token) {
      ensureEpoch(token);
      var controller = new Abort();
      controllers.push(controller);
      var timer, timedOut = false;
      try {
        return await Promise.race([
          (async function () {
            ensureEpoch(token);
            var response = await fetcher(url, Object.assign({ cache: 'no-store', credentials: 'omit', signal: controller.signal }, init));
            ensureEpoch(token);
            if (response.status === 404 && (!init || init.method === 'GET')) return null;
            if (!response.ok) {
              if (response.status === 409 || response.status === 412) throw problem('云端进度刚刚发生变化，两份进度都已保留，请重新选择', 'conflict');
              // Firestore may encode a CAS failure as HTTP 400. Read only its
              // status identifier, within the same request/body timeout; never
              // surface backend messages or project configuration to the UI.
              var errorBody = null;
              try {
                if (typeof response.text === 'function') {
                  var errorText = await response.text();
                  if (errorText.length <= 16384) errorBody = JSON.parse(errorText);
                } else errorBody = await response.json();
              } catch (_) { /* An unreadable error still receives a safe HTTP classification. */ }
              ensureEpoch(token);
              if (errorBody && object(errorBody.error) &&
                  ['FAILED_PRECONDITION', 'ABORTED', 'ALREADY_EXISTS'].indexOf(errorBody.error.status) >= 0) {
                throw problem('云端进度刚刚发生变化，两份进度都已保留，请重新选择', 'conflict');
              }
              if (response.status >= 500 || response.status === 429) throw problem('暂时连接不上同步服务；本机进度和待同步改动仍保留', 'offline');
              throw problem('同步服务拒绝了请求（' + response.status + '）；本机进度仍保留');
            }
            var data;
            if (typeof response.text === 'function') {
              var text = await response.text();
              if (text.length > MAX_BYTES * 2) throw problem('云端数据超过大小限制');
              try { data = JSON.parse(text); } catch (_) { throw problem('云端数据不是有效的进度文件'); }
            } else data = await response.json();
            ensureEpoch(token);
            return data;
          }()),
          new Promise(function (_, reject) {
            timer = later(function () {
              timedOut = true;
              controller.abort();
              reject(problem('同步连接超时；本机进度和待同步改动仍保留', 'offline'));
            }, TIMEOUT_MS);
          })
        ]);
      } catch (error) {
        ensureEpoch(token);
        if (error.syncKind) throw error;
        throw problem(timedOut ? '同步连接超时；本机进度仍保留' : '当前无法联网；本机进度和待同步改动仍保留', 'offline');
      } finally {
        if (timer !== undefined) cancelTimer(timer);
        var index = controllers.indexOf(controller);
        if (index >= 0) controllers.splice(index, 1);
      }
    }
    async function readRemote(derived, token) {
      var doc = await request(address(derived), { method: 'GET' }, token);
      if (doc === null) return null;
      if (!object(doc) || typeof doc.updateTime !== 'string' || !doc.updateTime || doc.updateTime.length > 100 || !object(doc.fields)) throw problem('云端进度缺少版本信息');
      var fields = doc.fields;
      if (!fields.app || fields.app.stringValue !== APP || !fields.formatVersion || String(fields.formatVersion.integerValue) !== '1' ||
          !fields.iv || !fields.payload) throw problem('这不是汉字游戏的同步进度，未读取其他应用的数据');
      var iv = unbase64(fields.iv.stringValue, 12);
      if (iv.length !== 12) throw problem('云端加密参数不正确');
      var encrypted = unbase64(fields.payload.stringValue, MAX_BYTES + 16);
      if (encrypted.length < 16) throw problem('云端加密内容不完整');
      var plaintext;
      try { plaintext = await crypt.subtle.decrypt({ name: 'AES-GCM', iv: iv }, derived.key, encrypted); }
      catch (_) { throw problem('同步码不匹配或云端进度已损坏，本机进度未被替换'); }
      ensureEpoch(token);
      if (plaintext.byteLength > MAX_BYTES) throw problem('云端进度超过600KB');
      var decoded;
      try { decoded = JSON.parse(new Decoder('utf-8', { fatal: true }).decode(plaintext)); }
      catch (_) { throw problem('云端进度内容无法读取，本机进度未被替换'); }
      var state = project(decoded);
      var json = JSON.stringify(state);
      var fingerprint = await hash(json);
      ensureEpoch(token);
      return { state: state, json: json, hash: fingerprint, updateTime: doc.updateTime };
    }
    async function encrypt(current, derived, token) {
      var iv = crypt.getRandomValues(new Uint8Array(12));
      var payload = await crypt.subtle.encrypt({ name: 'AES-GCM', iv: iv }, derived.key, new Encoder().encode(current.json));
      ensureEpoch(token);
      return { fields: {
        formatVersion: { integerValue: '1' }, app: { stringValue: APP },
        iv: { stringValue: base64(iv) }, payload: { stringValue: base64(new Uint8Array(payload)) }
      } };
    }
    function backup(local, remote, reason) {
      requireStorage();
      try {
        var previous = storage.getItem(BACKUP_KEY);
        var groups = previous ? JSON.parse(previous) : [];
        if (!Array.isArray(groups)) throw new Error('Invalid backup');
        // Existing records are from this module, but project them again so a
        // malformed local backup can never smuggle handwriting into a new one.
        groups = groups.slice(-2).map(function (group) {
          if (!object(group)) throw new Error('Invalid backup');
          return {
            timestamp: integer(group.timestamp, 0, Number.MAX_SAFE_INTEGER, 'backup time'),
            reason: string(group.reason, 100, 'backup reason'),
            local: project(group.local), remote: group.remote === null ? null : project(group.remote),
            remoteUpdateTime: group.remoteUpdateTime === null ? null : string(group.remoteUpdateTime, 100, 'backup version')
          };
        });
        groups.push({ timestamp: now(), reason: reason, local: local.state,
          remote: remote ? remote.state : null, remoteUpdateTime: remote ? remote.updateTime : null });
        storage.setItem(BACKUP_KEY, JSON.stringify(groups));
      } catch (_) { throw problem('未能在本机备份两份进度，尚未替换任何进度；请检查存储空间'); }
    }
    function mayApply() {
      try { return typeof options.canApply !== 'function' || options.canApply() === true; }
      catch (_) { return false; }
    }
    async function adopt(remote, token, localRevision, reason, candidateMeta) {
      ensureUnchanged(token, localRevision);
      if (!mayApply()) return emit('pending', '云端有更新，等这一题结束后再同步');
      var before = snapshot();
      backup(before, remote, reason);
      ensureUnchanged(token, localRevision);
      if (!mayApply()) return emit('pending', '云端有更新，等这一题结束后再同步');
      if (typeof options.applyState !== 'function') throw problem('当前页面暂不能恢复同步进度');
      var stagedMeta = Object.assign({}, candidateMeta || meta, { dirty: true, requireConflict: true });
      // Adoption is a two-step local transaction. Keep the previous baseline
      // until the page has actually accepted the remote state. The durable
      // barrier also protects a reload/crash between identity and primary save.
      persist(stagedMeta);
      meta = stagedMeta;
      applying = true;
      var result;
      try { result = options.applyState(remote.state); }
      catch (error) {
        ensureEpoch(token);
        throw problem('恢复进度未完成；两份进度已在本机备份，请重新选择保留哪份', 'conflict');
      }
      finally { applying = false; }
      try {
        if (result && typeof result.then === 'function') result = await result;
        if (result === false) throw new Error('Page refused progress');
      } catch (_) {
        ensureEpoch(token);
        throw problem('当前页面未接受云端进度；两份进度已在本机备份，请重新选择保留哪份', 'conflict');
      }
      ensureEpoch(token);
      var actual = snapshot();
      observedJSON = actual.json;
      var nextMeta = Object.assign({}, stagedMeta, {
        baseUpdateTime: remote.updateTime, baseHash: remote.hash,
        dirty: actual.json !== remote.json, requireConflict: false, lastSyncedAt: now()
      });
      // If this commit fails, keep the in-memory and on-disk barrier in place.
      persist(nextMeta);
      meta = nextMeta;
      conflictRemote = null;
      if (meta.dirty) return emit('pending', '进度已读取，但本机还有新的改动；请再次同步');
      return emit('synced', '两台设备的学习进度已同步');
    }
    async function write(current, derived, remote, token, localRevision) {
      var body = await encrypt(current, derived, token);
      ensureUnchanged(token, localRevision);
      var precondition = remote ? 'currentDocument.updateTime=' + encodeURIComponent(remote.updateTime) : 'currentDocument.exists=false';
      var response = await request(address(derived) + '?' + precondition, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      }, token);
      if (!response || typeof response.updateTime !== 'string' || !response.updateTime || response.updateTime.length > 100) throw problem('服务器未确认保存版本；本机改动仍保留为待同步');
      var fingerprint = await hash(current.json);
      ensureEpoch(token);
      var actual = snapshot();
      observedJSON = actual.json;
      var nextMeta = Object.assign({}, meta, { baseUpdateTime: response.updateTime, baseHash: fingerprint,
        dirty: actual.json !== current.json, requireConflict: false, lastSyncedAt: now() });
      persist(nextMeta);
      meta = nextMeta;
      conflictRemote = null;
      if (meta.dirty) { schedule(); return emit('idle', '上一份进度已同步，新改动正在等待同步'); }
      return emit('synced', '学习进度已安全同步');
    }
    function beginEpoch() {
      epoch += 1;
      if (debounce !== null) { cancelTimer(debounce); debounce = null; }
      controllers.slice().forEach(function (controller) { try { controller.abort(); } catch (_) {} });
      controllers = [];
      inFlight = null;
      return epoch;
    }
    function failure(error, token) {
      if (token !== epoch || error.syncKind === 'cancelled') return status();
      if (error.syncKind === 'conflict') {
        if (meta) { meta.dirty = true; try { saveMeta(); } catch (storageError) { return emit('error', storageError.message); } }
        return emit('conflict', error.message);
      }
      return emit(error.syncKind === 'offline' || error.syncKind === 'unsupported' ? error.syncKind : 'error', error.message || '同步未完成；本机进度仍保留');
    }
    function run(token, action) {
      var job = Promise.resolve().then(function () {
        // Cancellation may happen before this very first microtask starts.
        // In particular, a queued create must not restore its code afterwards.
        ensureEpoch(token);
        return action();
      }).catch(function (error) { return failure(error, token); });
      inFlight = job;
      job.then(function () { if (inFlight === job) inFlight = null; });
      return job;
    }
    function schedule() {
      if (!meta || !meta.code || !meta.dirty || meta.requireConflict || view.kind === 'conflict') return;
      if (debounce !== null) cancelTimer(debounce);
      debounce = later(function () { debounce = null; sync(); }, DEBOUNCE_MS);
    }
    function changed() {
      // An ordinary save on a device that never enabled sync needs neither
      // serialization nor any cryptography/browser synchronization APIs.
      if (!started || !meta || !meta.code) return status();
      try {
        var current = snapshot();
        if (applying) { observedJSON = current.json; return status(); }
        if (observedJSON === current.json) return status();
        observedJSON = current.json;
        revision += 1;
        if (!meta || !meta.code) return status();
        meta.dirty = true;
        saveMeta();
        if (view.kind !== 'conflict' && view.kind !== 'syncing') emit('idle', '新进度已在本机，等待同步');
        schedule();
        return status();
      } catch (error) { return failure(error, epoch); }
    }
    function loadMeta() {
      requireStorage();
      var saved;
      try { saved = storage.getItem(META_KEY); }
      catch (_) { throw problem('无法读取本机同步设置；本机学习仍可继续'); }
      if (!saved) return null;
      var input;
      try { input = JSON.parse(saved); } catch (_) { throw problem('本机同步设置损坏，尚未连接云端'); }
      if (!object(input) || input.version !== 1) throw problem('本机同步设置版本不受支持');
      var result = { version: 1, code: normalizeCode(input.code),
        baseUpdateTime: input.baseUpdateTime === null ? null : string(input.baseUpdateTime, 100, 'baseUpdateTime'),
        baseHash: input.baseHash === null ? null : string(input.baseHash, 64, 'baseHash'),
        dirty: bool(input.dirty, 'dirty'), requireConflict: own(input, 'requireConflict') ? bool(input.requireConflict, 'requireConflict') : false,
        lastSyncedAt: input.lastSyncedAt === null ? null : integer(input.lastSyncedAt, 0, Number.MAX_SAFE_INTEGER, 'lastSyncedAt') };
      if (result.baseHash !== null && !/^[0-9a-f]{64}$/.test(result.baseHash)) throw problem('本机同步摘要不正确');
      return result;
    }
    function start() {
      if (started) return meta ? sync() : Promise.resolve(status());
      started = true;
      try {
        meta = loadMeta();
        if (!meta) return Promise.resolve(emit('off', '尚未开启跨设备同步'));
        observedJSON = snapshot().json;
        if (meta.requireConflict) return Promise.resolve(emit('conflict', '上次采用进度未确认完成；两份进度仍保留，请选择保留哪份'));
      } catch (error) { return Promise.resolve(failure(error, epoch)); }
      return sync();
    }
    function sync() {
      if (!started) return start();
      if (!meta || !meta.code) return Promise.resolve(emit('off', '尚未开启跨设备同步'));
      if (inFlight) return inFlight;
      if (meta.requireConflict) return Promise.resolve(emit('conflict', '上次采用进度未确认完成；两份进度仍保留，请选择保留哪份'));
      if (view.kind === 'conflict') return Promise.resolve(status());
      var token = epoch;
      return run(token, async function () {
        var local = refreshLocal();
        var localRevision = revision;
        var derived = await keys(meta.code, token);
        var fingerprint = await hash(local.json);
        ensureUnchanged(token, localRevision);
        if (!meta.baseHash || fingerprint !== meta.baseHash) meta.dirty = true;
        saveMeta();
        emit('syncing', '正在同步学习进度');
        var remote = await readRemote(derived, token);
        conflictRemote = remote;
        ensureUnchanged(token, localRevision);
        if (!remote) {
          // A fresh create may be retried offline. A deleted established family
          // never gets recreated automatically using possibly outdated progress.
          if (meta.baseUpdateTime !== null) throw problem('云端进度已被移除，本机进度仍保留；请重新建立同步', 'conflict');
          meta.dirty = true;
          saveMeta();
          return write(local, derived, null, token, localRevision);
        }
        // A PATCH can commit successfully even when its response times out.
        // Identical authenticated progress is already synchronized, regardless
        // of which device wrote it or which updateTime we last received.
        if (remote.hash === fingerprint) {
          meta.baseUpdateTime = remote.updateTime;
          meta.baseHash = remote.hash;
          meta.dirty = false;
          meta.lastSyncedAt = now();
          saveMeta();
          conflictRemote = null;
          return emit('synced', '两台设备的学习进度已同步');
        }
        if (remote.updateTime !== meta.baseUpdateTime) {
          if (meta.dirty) throw problem('两台设备都更新过学习进度，请选择保留哪份；两份都还在', 'conflict');
          return adopt(remote, token, localRevision, 'remote-update');
        }
        if (remote.hash !== meta.baseHash) throw problem('云端版本与本机摘要不一致，两份进度均已保留', 'conflict');
        if (fingerprint === meta.baseHash) {
          meta.dirty = false;
          meta.lastSyncedAt = now();
          saveMeta();
          return emit('synced', '两台设备的学习进度已同步');
        }
        return write(local, derived, remote, token, localRevision);
      });
    }
    function createFamily() {
      var token = beginEpoch();
      started = true;
      return run(token, async function () {
        capable();
        var current = refreshLocal();
        var code = hex(crypt.getRandomValues(new Uint8Array(16)));
        var candidate = { version: 1, code: code, baseUpdateTime: null, baseHash: null, dirty: true, lastSyncedAt: null };
        persist(candidate);
        meta = candidate;
        conflictRemote = null;
        var localRevision = revision;
        emit('syncing', '正在建立汉字游戏同步');
        var derived = await keys(code, token);
        var remote = await readRemote(derived, token);
        conflictRemote = remote;
        ensureUnchanged(token, localRevision);
        if (remote) throw problem('此同步位置已存在，未覆盖任何进度；请重新生成同步码', 'conflict');
        return write(current, derived, null, token, localRevision);
      });
    }
    function joinFamily(value) {
      var normalized;
      try {
        normalized = normalizeCode(value);
        if (!mayApply()) return Promise.resolve(emit('pending', '请先结束当前书写，再连接另一台设备的进度'));
      } catch (error) { return Promise.resolve(failure(error, epoch)); }
      var token = beginEpoch();
      started = true;
      return run(token, async function () {
        refreshLocal();
        var localRevision = revision;
        emit('syncing', '正在验证同步码和云端进度');
        var derived = await keys(normalized, token);
        var remote = await readRemote(derived, token);
        ensureUnchanged(token, localRevision);
        if (!remote) throw problem('没有找到这个汉字游戏同步码；本机进度未被替换');
        if (!mayApply()) return emit('pending', '当前正在书写，尚未连接或替换进度；结束后请重试');
        // adopt() re-reads and backs up the *current* local state, rather than
        // relying on a stale snapshot captured before the network request.
        return adopt(remote, token, localRevision, 'join-family', {
          version: 1, code: normalized, baseUpdateTime: null, baseHash: null, dirty: true, lastSyncedAt: null
        });
      });
    }
    function resolveConflict(choice) {
      if (choice !== 'local' && choice !== 'remote') return Promise.resolve(emit('error', '请选择保留本机或云端进度'));
      if (!meta || view.kind !== 'conflict') return Promise.resolve(status());
      var token = beginEpoch();
      return run(token, async function () {
        var current = refreshLocal();
        var localRevision = revision;
        emit('syncing', '正在备份并处理两份学习进度');
        var derived = await keys(meta.code, token);
        var remote = await readRemote(derived, token);
        conflictRemote = remote;
        ensureUnchanged(token, localRevision);
        if (choice === 'remote') {
          if (!remote) throw problem('云端已没有这份进度，本机进度仍保留', 'conflict');
          if (!mayApply()) return emit('conflict', '请先结束当前书写，再选择采用云端进度');
          return adopt(remote, token, localRevision, 'conflict-remote');
        }
        backup(current, remote, 'conflict-local');
        ensureUnchanged(token, localRevision);
        meta.dirty = true;
        saveMeta();
        return write(current, derived, remote, token, localRevision);
      });
    }
    function disconnect() {
      beginEpoch();
      meta = null;
      conflictRemote = null;
      keysCache = null;
      started = true;
      try {
        requireStorage();
        if (typeof storage.removeItem !== 'function') throw new Error('Storage cannot remove settings');
        storage.removeItem(META_KEY);
      } catch (_) { return emit('error', '本次同步已停止，但未能清除本机连接设置；请保留页面并检查存储空间'); }
      return emit('off', '已断开同步；本机学习进度和备份仍保留');
    }
    // Reading this module's tiny connection record is synchronous and offline.
    // The page can restore its saved session before calling asynchronous start().
    try {
      meta = loadMeta();
      if (meta) view = { kind: meta.requireConflict ? 'conflict' : 'idle',
        message: meta.requireConflict ? '上次采用进度未确认完成；两份进度仍保留，请选择保留哪份' : '已保存同步连接，等待同步', connected: true,
        lastSyncedAt: meta.lastSyncedAt, code: displayCode(meta.code) };
    } catch (error) {
      view = { kind: 'error', message: error.message, connected: false, lastSyncedAt: null };
    }
    return { start: start, createFamily: createFamily, joinFamily: joinFamily, sync: sync, changed: changed,
      resolveConflict: resolveConflict, disconnect: disconnect, status: status, code: function () { return displayCode(meta && meta.code); } };
  }

  return { create: create };
}));
