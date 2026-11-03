'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, process.argv.includes('--source') ? 'game-source.html' : 'index.html'), 'utf8');
function section(start, end) {
  const a = html.indexOf(start), b = html.indexOf(end, a);
  assert.ok(a >= 0 && b > a, 'Missing production section: ' + start);
  return html.slice(a, b);
}
const fixture = require('./ipad-2026-11-03-round3.json').cases.find(c => c.target === '收' && c.raw_to_recorded_verified);
assert.ok(fixture, 'Use the verified full-resolution final iPad 收');
const rawInput = fixture.rawS || fixture.s;
const compactInput = fixture.recorded_s || fixture.s;

function environment({maxCount = 200, maxBytes = 2 * 1024 * 1024, failQuota = false, initialLog = null} = {}) {
  const storage = new Map(), messages = {textContent: ''}, logs = [];
  let quotaUnavailable = failQuota, settingsHandler = null;
  let storageWrites = 0, inkButtons = [], inkMarkup = '';
  const inkList = {
    get innerHTML() { return inkMarkup; },
    set innerHTML(value) {
      inkMarkup = String(value);
      inkButtons = [...inkMarkup.matchAll(/class="ink-mark"\s+data-i="(\d+)"/g)]
        .map(match => ({dataset: {i: match[1]}}));
    },
    querySelectorAll() { return inkButtons; },
  };
  if (initialLog) storage.set('hanzi-magic-door-ink-v1', JSON.stringify(initialLog));
  const context = vm.createContext({ window: {}, console: {log: (...args) => logs.push(args.join(' '))},
    setTimeout, clearTimeout,
    localStorage: {
      getItem: key => storage.get(key) || null,
      setItem(key, value) {
        storageWrites++;
        if (quotaUnavailable) { const error = new Error('full'); error.name = 'QuotaExceededError'; throw error; }
        storage.set(key, value);
      },
    }, inkMsg: messages, inkList, inkCount: {},
  });
  const run = source => vm.runInContext(source, context);
  run(`const GAME_VERSION='test';const CANVAS_SIZE=300,CANVAS_PADDING=28;
    let strokesPoints=[];function todayStr(){return '2026-11-03';}
    async function getCharData(char){return window.HANZI_LOCAL_DATA[char];}`);
  for (const file of ['hanzi-data.js', 'curriculum-hanzi-data.js']) run(fs.readFileSync(path.join(root,file),'utf8'));
  const recordSource = section('const INK_LOG_KEY =', '// ---------- automatic save ----------')
    .replace(/const MAX_INK = 200;/, 'const MAX_INK = ' + maxCount + ';')
    .replace(/const MAX_INK_BYTES = 2 \* 1024 \* 1024;/, 'const MAX_INK_BYTES = ' + maxBytes + ';');
  run(recordSource);
  run(section('function medianToCanvasPoints(', 'const progressPath ='));
  run(section('function renderInkList(){', 'function inkPayloadText(only){'));
  run(section('function inkPayloadText(only){', '// ---------- batch paste ----------'));
  // Run the actual settings-opening handler; a hidden warning is useful only if
  // opening the panel preserves it instead of clearing the message element.
  context.settingsBtn = {};
  context.panelOverlay = {classList: {add() {}}};
  for (const name of ['stopPromptSpeech', 'renderQueueList', 'renderMasteredList', 'renderStuckList']) {
    context[name] = () => {};
  }
  context.onTap = (element, handler) => {
    element.fire = handler;
    if (element === context.settingsBtn) settingsHandler = handler;
  };
  const settingsRegistration = html.match(/onTap\(settingsBtn,\s*\(\)\s*=>\s*\{[^\n]*\}\);/);
  assert.ok(settingsRegistration, 'Production settings-opening handler missing');
  run(settingsRegistration[0]);
  assert.equal(typeof settingsHandler, 'function');
  const read = source => JSON.parse(JSON.stringify(run(source)));
  return { context, storage, messages, logs, run, read,
    buttons: () => inkButtons,
    writeCount: () => storageWrites,
    setQuota(value) { quotaUnavailable = value; },
    openSettings() { settingsHandler(); },
    assignLog(records) { context.testRecords = records;run('inkLog=JSON.parse(JSON.stringify(testRecords));'); },
    async grade(char, strokes) {
      context.testChar = char;
      context.testInk = strokes.map(s => s.map(p => Array.isArray(p) ? {x:p[0],y:p[1]} : {x:p.x,y:p.y}));
      run('strokesPoints=testInk;');
      return await run('gradeDrawing(testChar)');
    },
  };
}
const entry = (id, disputed = false, pointCount = 2) => ({
  c: id, s: [[[0,0],[1,1]]], rawS: [Array.from({length:pointCount},(_,i)=>[i+0.125,i+0.375])],
  formatVersion:2, v:'fail', d:'2026-11-03', disputed,
});

(async () => {
  const direct = environment();
  const directVerdict = await direct.grade('收', rawInput);
  const exact = direct.read('inkLog[0]');
  assert.equal(exact.formatVersion, 2);
  assert.deepEqual(exact.rawS, rawInput, 'Keep all 328 original points, without rounding or resampling');
  assert.deepEqual(exact.s, compactInput, 'Existing compact readers keep their old shape');
  assert.ok(direct.logs.filter(s=>s.startsWith('[strokes]')).every(s=>!s.includes('rawS')),
    'Console messages must not duplicate the large original arrays');
  direct.run('strokesPoints[0][0].x=999;');
  assert.deepEqual(direct.read('inkLog[0].rawS'), rawInput, 'Later drawing changes cannot change saved evidence');

  const exported = JSON.parse(direct.run('inkPayloadText(false)')).cases[0];
  assert.equal(exported.formatVersion,2);assert.deepEqual(exported.rawS,rawInput);
  const recovered = environment({initialLog:JSON.parse(direct.storage.get('hanzi-magic-door-ink-v1'))});
  recovered.run('loadInkLog();');
  const recoveredInk = recovered.read('inkLog[0].rawS');
  assert.equal(await recovered.grade('收', recoveredInk),directVerdict,
    'Production JSON persistence and full-precision replay must keep the same grade');
  assert.deepEqual(recovered.logs.filter(s=>s.startsWith('[diag-grade]')),direct.logs.filter(s=>s.startsWith('[diag-grade]')),
    'Exact replay must keep the same diagnostic explanation');
  assert.deepEqual(recovered.read('inkLog[0].filtering'),exact.filtering);
  const compact = environment();
  const compactVerdict = await compact.grade('收', compactInput);
  // The historical old-grader flip is proven in the frozen work prototype.
  // This release check must permit a fix to that false positive: only exact
  // persistence, not the old verdict, is the permanent expected behavior.

  const allInput = [...rawInput,[[1000.25,1000.125]],[[70.125,60.375],[70.25,60.5]]];
  const filtered = environment();const filterVerdict = await filtered.grade('收',allInput);
  const filterRecord = filtered.read('inkLog[0]');
  assert.deepEqual(filterRecord.rawS,allInput,'Include every input mark before filtering');
  assert.equal(filterRecord.filtering.inputStrokeCount,9);
  assert.equal(filterRecord.filtering.ignoredStrokes.length,2);
  const filteredReplay = environment();
  assert.equal(await filteredReplay.grade('收',JSON.parse(JSON.stringify(filterRecord.rawS))),filterVerdict);
  assert.deepEqual(filteredReplay.read('inkLog[0].filtering'),filterRecord.filtering);

  const old = [{c:'旧',s:[[[0,0],[1,1]]],v:'pass',d:'2026-01-01',disputed:true}];
  const legacy = environment({initialLog:old});legacy.run('loadInkLog();');
  assert.deepEqual(legacy.read('inkLog'),old,'Do not invent precision or replace old saved ink');
  const oldExport = JSON.parse(legacy.run('inkPayloadText(false)')).cases[0];
  assert.equal(oldExport.formatVersion,1);assert.deepEqual(oldExport.s,old[0].s);
  assert.equal(Object.hasOwn(oldExport,'rawS'),false);

  const bounded = environment({maxCount:3,maxBytes:1024*1024});
  bounded.assignLog([entry('新'),entry('标',true),entry('次'),entry('老'),entry('最老')]);
  bounded.run(`let serializedEntries=0,serializedArrays=0;
    const nativeStringify=JSON.stringify;
    JSON.stringify=function(value,...args){
      if(Array.isArray(value))serializedArrays++;else serializedEntries++;
      return nativeStringify(value,...args);
    };`);
  bounded.run('saveInkLog();');
  assert.equal(bounded.run('serializedEntries'),5,'Serialize each entry once even while removing several old entries');
  assert.equal(bounded.run('serializedArrays'),0,'Do not re-serialize the whole backlog after each removal');
  bounded.run('JSON.stringify=nativeStringify;');
  assert.deepEqual(bounded.read('inkLog.map(r=>r.c)'),['新','标','次'],'Count limit removes oldest unmarked entries first');
  const bytes = environment({maxBytes:600});
  const largeNewest=entry('新',false,50),largeMarked=entry('标',true,50);
  bytes.assignLog([largeNewest,largeMarked,entry('老')]);bytes.run('saveInkLog();');
  assert.deepEqual(bytes.read('inkLog.map(r=>r.c)'),['新','标']);
  assert.deepEqual(bytes.read('inkLog[0].rawS'),largeNewest.rawS,'Budget trims whole records, never coordinates');
  assert.ok((bytes.storage.get('hanzi-magic-door-ink-v1').length+'hanzi-magic-door-ink-v1'.length)*2>600,
    'Keep marked evidence and the latest record even above the soft budget');
  const markedOnly = environment({maxCount:2,maxBytes:1});
  markedOnly.assignLog([entry('甲',true),entry('乙',true),entry('丙',true)]);markedOnly.run('saveInkLog();');
  assert.equal(markedOnly.run('inkLog.length'),3);

  const quota = environment({failQuota:true});
  assert.equal(await quota.grade('收',rawInput),directVerdict,'A quota failure must not become a grading failure');
  assert.deepEqual(quota.read('inkLog[0].rawS'),rawInput,'Current in-memory exact data stays exportable');
  assert.ok(quota.messages.textContent.includes('下载笔迹'));
  assert.deepEqual(JSON.parse(quota.run('inkPayloadText(false)')).cases[0].rawS,rawInput);
  quota.messages.textContent = '';
  quota.openSettings();
  assert.ok(quota.messages.textContent.includes('下载笔迹'),
    'Opening settings after an ordinary grading save fails must show the retained warning');
  quota.setQuota(false);
  assert.equal(quota.run('saveInkLog();'),true);
  quota.messages.textContent = 'old panel message';
  quota.openSettings();
  assert.equal(quota.messages.textContent,'',
    'Only a successful later save clears the warning on the next settings opening');

  const shifted = environment();
  shifted.assignLog([entry('旧')]);shifted.openSettings();
  const displayedOld = shifted.buttons()[0];
  await shifted.grade('收',rawInput);
  displayedOld.fire();
  assert.deepEqual(shifted.read('inkLog.map(record=>({char:record.c,marked:record.disputed}))'),
    [{char:'收',marked:false},{char:'旧',marked:true}],
    'A grading result inserted while settings is open must not redirect an old visible mark button');
  const removed = environment({maxCount:1});
  removed.assignLog([entry('旧')]);removed.openSettings();
  const obsoleteButton = removed.buttons()[0];
  await removed.grade('收',rawInput);
  const writesBeforeStaleClick = removed.writeCount();
  obsoleteButton.fire();
  assert.deepEqual(removed.read('inkLog.map(record=>({char:record.c,marked:record.disputed}))'),
    [{char:'收',marked:false}]);
  assert.equal(removed.writeCount(),writesBeforeStaleClick,
    'A visible row already trimmed from memory must safely return without saving or marking another record');
  console.log(JSON.stringify({
    exactJsonRoundtrip:true, originalVerdict:directVerdict, compactVerdict,
    historicCompressionFlipConfirmed:directVerdict&&!compactVerdict,
    allInputAndFiltering:true, legacyCompatibility:true, byteAndCountBudget:true,
    markedAndNewestProtection:true, quotaDoesNotBlockGrade:true, quotaWarningSurvivesSettings:true,
    visibleMarkIdentityPreserved:true,
  }));
})().catch(error=>{console.error(error);process.exitCode=1;});
