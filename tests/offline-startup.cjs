'use strict';

// Execute the real built page in browser order. Glyph requests read local frozen
// fixtures, never the internet; optional parent dictionary loading is also observed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const fromSource = process.argv.includes('--source');
const html = fromSource ? require('../tools/build-page.cjs').buildPage().html
  : fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)]
  .map(match => ({attributes: match[1], source: match[2]}));
const mainIndex = scripts.findIndex(script => script.source.includes('function newBankItem(') && script.source.includes('function onTap('));
const modules = ['curriculum-data.js', 'practice-selector.js', 'sentence-hints.js',
  'game-feedback.js', 'glyph-catalog.js', 'glyph-loader.js', 'learning-timing.js', 'parent-validation.js', 'progress-sync.js'];
assert.ok(scripts.every(script => !/\bsrc\s*=/i.test(script.attributes)), 'Critical scripts must be embedded');
for(const file of modules) assert.equal(scripts.filter(script => script.attributes.includes('data-source="'+file+'"')).length,1,'Embed exactly one '+file);
for(const file of ['hanzi-data.js','curriculum-hanzi-data.js','pinyin-data.js']) {
  assert.ok(!scripts.some(script => script.attributes.includes('data-source="'+file+'"')), 'Do not preload '+file);
}
assert.ok(mainIndex>=modules.length, 'Load the small behavior modules and catalog before main');
assert.ok(!html.includes('bundledGlyphsLoaded')&&!html.includes('resolveBundledGlyphs'),'No bulk-ready gate');
assert.ok(!/<link\b[^>]*\brel\s*=\s*["']stylesheet["']/i.test(html), 'No separate startup stylesheet');
assert.ok(!/<link\b[^>]*\bhref\s*=\s*["'][^"']*fonts\.(?:googleapis|gstatic)\.com/i.test(html), 'No remote fonts');
assert.ok(/<style\b[^>]*data-source=["']game-feedback\.css["'][^>]*>/i.test(html), 'Embed feedback CSS');
assert.ok(/\.startup-notice\[hidden\]\s*\{[^}]*display\s*:\s*none/i.test(html), 'Hidden cover must not intercept buttons');
if(!fromSource) assert.equal(fs.readFileSync(path.join(root,'汉字魔法门_4.html'),'utf8'),html);
function seeded(seed){let n=seed>>>0;return()=>((n=(Math.imul(n,1664525)+1013904223)>>>0)/4294967296);}
const fixtureContext=vm.createContext({window:{}});
for(const file of ['hanzi-data.js','curriculum-hanzi-data.js','glyph-catalog.js']) vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),fixtureContext);
const frozenGlyphs=fixtureContext.window.HANZI_LOCAL_DATA;
const catalog=fixtureContext.window.HANZI_GLYPH_CATALOG;
function dependencyGroup(char){const out=new Set();function visit(c){if(out.has(c))return;catalog.glyphs[c].deps.forEach(visit);out.add(c);}visit(char);return out;}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
class Element {
  constructor(tagName, id = '') {
    this.tagName = tagName.toUpperCase(); this.id = id; this.children = []; this.parentNode = null;
    this.attributes = {}; this.listeners = new Map(); this.dataset = {};
    this.style = { setProperty(key, value) { this[key] = value; } };
    this.className = ''; this.innerHTML = ''; this.textContent = ''; this.value = '';
    this.disabled = false; this.hidden = false; this.files = [];
    this.classList = {
      add: (...names) => { this.className = [...new Set([...this.classes(), ...names])].join(' '); },
      remove: (...names) => { this.className = this.classes().filter(name => !names.includes(name)).join(' '); },
      contains: name => this.classes().includes(name),
      toggle: (name, force) => {
        const enable = force === undefined ? !this.classList.contains(name) : force;
        if (enable) this.classList.add(name); else this.classList.remove(name);
        return enable;
      },
    };
  }
  classes() { return this.className.split(/\s+/).filter(Boolean); }
  get firstChild() { return this.children[0] || null; }
  get isConnected() { return this.tagName === 'BODY' || Boolean(this.parentNode && this.parentNode.isConnected); }
  appendChild(child) { child.parentNode = this; this.children.push(child); if(this.onAppend) this.onAppend(child); return child; }
  removeChild(child) { this.children = this.children.filter(item => item !== child); child.parentNode = null; return child; }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  setAttribute(key, value) { this.attributes[key] = String(value); if (key === 'class') this.className = String(value); }
  getAttribute(key) { return this.attributes[key] ?? null; }
  addEventListener(type, handler) { if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push(handler); }
  dispatch(type, data = {}) {
    const event = { target: this, currentTarget: this, type, pointerType: 'touch', cancelable: true,
      preventDefault() {}, stopPropagation() {}, ...data };
    for (const handler of this.listeners.get(type) || []) handler(event);
  }
  querySelectorAll(selector) {
    // Dynamic queue markup is still retained as text; these startup checks do
    // not interact with its individual edit/delete buttons.
    const result = [];
    const visit = node => { for (const child of node.children) {
      if (selector.startsWith('.') && child.classList.contains(selector.slice(1))) result.push(child);
      visit(child);
    } };
    visit(this); return result;
  }
  getBoundingClientRect() { return { left: 20, top: 80, width: 300, height: 300 }; }
  setPointerCapture() {} releasePointerCapture() {} focus() {} select() {} click() { this.dispatch('click'); }
  closest(selector) { return selector.split(',').some(part => part.trim().startsWith('.') && this.classList.contains(part.trim().slice(1))) ? this : null; }
}

function environment({initialSave=null,initialStorage=null,mode='online'}={}) {
  const ids=new Map(),body=new Element('body'),documentElement=new Element('html');
  for(const match of html.matchAll(/<([a-z][\w:-]*)\b([^>]*\bid=["']([^"']+)["'][^>]*)>/gi)) {
    const node=new Element(match[1],match[3]);const cls=match[2].match(/\bclass=["']([^"']*)["']/i);if(cls)node.className=cls[1];
    const value=match[2].match(/\bvalue=["']([^"']*)["']/i);if(value)node.value=value[1];
    node.hidden=/\bhidden(?:\s|=|$)/i.test(match[2]);ids.set(node.id,node);body.appendChild(node);
  }
  const document={body,documentElement,hidden:false,readyState:'complete',getElementById:id=>ids.get(id)||null,
    createElement:tag=>new Element(tag),createElementNS:(_,tag)=>new Element(tag),addEventListener(){}};
  const network=[],storage=new Map(initialStorage||[]),timers=new Map(),spoken=[];
  if(initialSave)storage.set('hanzi-magic-door-state-v1',JSON.stringify(initialSave));
  let now=new Date(2026,10,3,12).getTime(),nextTimer=0,networkMode=mode;
  const schedule=(fn,ms=0)=>{timers.set(++nextTimer,{fn,at:now+ms});return nextTimer;};
  class ClockDate extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
  const unexpected=url=>{network.push({kind:'unexpected',url:String(url)});throw Error('Unexpected network: '+url);};
  function fixtureFetch(url,init={}) {
    const parsed=new URL(String(url),'https://lucyisalive.github.io/');
    if(parsed.origin!=='https://lucyisalive.github.io'||!parsed.pathname.startsWith('/glyphs/'))return unexpected(url);
    const filename=decodeURIComponent(parsed.pathname.slice('/glyphs/'.length));
    assert.ok(/^[^/]+\.json$/.test(filename),'Only a single local glyph file is allowed');
    const char=filename.slice(0,-5);
    network.push({kind:'glyph',url:String(url),char,mode:networkMode});
    if(networkMode==='offline')return Promise.reject(Error('Offline'));
    if(networkMode==='hang')return new Promise((resolve,reject)=>{
      if(init.signal)init.signal.addEventListener('abort',()=>reject(Error('Aborted')),{once:true});
    });
    const glyph=JSON.parse(fs.readFileSync(path.join(root,'glyphs',filename),'utf8'));
    assert.equal(JSON.stringify(glyph),JSON.stringify(frozenGlyphs[char]),'Frozen geometry: '+char);
    return Promise.resolve({ok:true,json:()=>Promise.resolve(glyph)});
  }
  const math=Object.create(Math);math.random=seeded(19);
  const window={document,innerWidth:400,innerHeight:800,addEventListener(){},matchMedia:()=>({matches:true}),
    setTimeout:schedule,clearTimeout:id=>timers.delete(id),fetch:fixtureFetch,
    speechSynthesis:{cancel(){},getVoices:()=>[],speak:u=>spoken.push(u.text)}};
  const context=vm.createContext({window,document,Date:ClockDate,Math:math,console:{log(){},warn(){},error(){}},
    fetch:fixtureFetch,AbortController,
    XMLHttpRequest:class{constructor(){unexpected('XMLHttpRequest');}},WebSocket:class{constructor(){unexpected('WebSocket');}},
    navigator:{sendBeacon:unexpected},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
    setTimeout:schedule,clearTimeout:id=>timers.delete(id),setInterval:schedule,clearInterval:id=>timers.delete(id),
    SpeechSynthesisUtterance:class{constructor(text){this.text=text;}},alert(){},prompt:()=>null});
  // An explicit parent action may load the separate full pinyin dictionary.
  body.onAppend=element=>{
    if(element.tagName!=='SCRIPT'||!element.src)return;
    network.push({kind:'script',url:element.src,mode:networkMode});
    assert.equal(element.src,'pinyin-data.js','Only the parent dictionary may be loaded dynamically');
    Promise.resolve().then(()=>{
      if(networkMode==='online') {vm.runInContext(fs.readFileSync(path.join(root,'pinyin-data.js'),'utf8'),context);if(element.onload)element.onload();}
      else if(element.onerror)element.onerror();
    });
  };
  for(let i=0;i<scripts.length;i++)vm.runInContext(scripts[i].source,context,{timeout:10000,filename:'built-inline-'+i+'.js'});
  const run=source=>vm.runInContext(source,context);
  const tap=id=>{now+=500;const node=ids.get(id);assert.ok(node,'Missing button: '+id);node.dispatch('pointerup');};
  return {ids,context,network,storage,spoken,timers,run,tap,setMode:value=>{networkMode=value;},
    advance(ms){const until=now+ms;let fired=0;for(;;){const due=[...timers].filter(([,t])=>t.at<=until).sort((a,b)=>a[1].at-b[1].at);if(!due.length)break;
      assert.ok(++fired<1000,'Timer loop');const[id,t]=due[0];timers.delete(id);now=t.at;t.fn();}now=until;}};
}
function assertBootAndSettings(e,expectedBankCount=92){
  assert.equal(e.ids.get('startupNotice').hidden,true,'Core initialization must finish before glyph download');
  assert.ok(e.run('currentItem&&currentItem.char'));
  assert.equal(e.run('state.bank.length'),expectedBankCount);
  assert.equal(e.ids.get('writeSlot').style.display,'flex');
  e.tap('settingsBtn');assert.equal(e.ids.get('panelOverlay').classList.contains('show'),true);
  e.tap('closePanelBtn');assert.equal(e.ids.get('panelOverlay').classList.contains('show'),false);
}
function assertOnlyRequestedGroup(e,char){
  assert.ok(e.network.every(call=>call.kind==='glyph'),'No bulk/pinyin/third-party startup request');
  assert.deepEqual(new Set(e.network.map(call=>call.char)),dependencyGroup(char));
  assert.equal(e.network.length,dependencyGroup(char).size,'Deduplicate requests');
  assert.deepEqual(new Set(Object.keys(e.context.window.HANZI_LOCAL_DATA||{})),dependencyGroup(char));
}
function inkFor(e,char){e.context.testMedians=frozenGlyphs[char].medians;e.run('strokesPoints=testMedians.map(medianToCanvasPoints);');}

(async()=>{
  // Cold boot binds controls immediately and downloads exactly one target group.
  const first=environment();assertBootAndSettings(first);
  assert.equal(Object.keys(first.context.window.HANZI_LOCAL_DATA||{}).length,0,'No bulk geometry is parsed at startup');
  const firstChar=first.run('currentItem.char');await flush();assertOnlyRequestedGroup(first,firstChar);
  const warmedStorage=new Map(first.storage);
  const cached=environment({initialStorage:warmedStorage,mode:'offline'});assertBootAndSettings(cached);await flush();
  assert.equal(cached.run('currentItem.char'),firstChar);assert.deepEqual(cached.network,[],'Warm target loads from persistent cache offline');
  inkFor(cached,firstChar);cached.tap('submitBtn');await flush();
  assert.equal(cached.ids.get('submitBtn').disabled,false);assert.equal(cached.run('passedCount'),1);assert.equal(cached.run('inkLog.length'),1);
  assert.deepEqual(cached.network,[],'Grading a cached target must stay offline');

  // Old progress and its requested decomposition dependencies must survive too.
  const old={bankVersion:4,dailyCount:5,scenesUnlocked:3,bank:[{char:'理',pinyin:'lǐ',word:'道理',box:3,interval:14,
    lastSeen:'2026-10-01',history:[{day:'2026-10-01',outcome:'first-try'}],passedDays:['2026-09-01','2026-10-01'],wrongToday:2,wrongDay:'2026-11-02'}],
    priorityQueue:[{char:'理',pinyin:'lǐ',word:'道理'}]};
  const restored=environment({initialSave:old});assertBootAndSettings(restored,93);await flush();assertOnlyRequestedGroup(restored,'理');
  assert.deepEqual(new Set(Object.keys(restored.context.window.HANZI_LOCAL_DATA)),new Set(['王','里','理']));
  assert.equal(restored.run("state.bank.find(it=>it.char==='理').history.length"),1);
  assert.equal(restored.run("state.bank.find(it=>it.char==='理').wrongToday"),2);
  assert.equal(restored.run('state.scenesUnlocked'),3);

  // Hanging first-use data cannot cover settings or spend a wrong-answer strike.
  const delayed=environment({mode:'hang'});assertBootAndSettings(delayed);await flush();
  const char=delayed.run('currentItem.char');inkFor(delayed,char);
  const originalInk=delayed.run('JSON.stringify(strokesPoints)'),wrongBefore=delayed.run('wrongCountToday(currentItem)');
  delayed.tap('submitBtn');assert.equal(delayed.ids.get('submitBtn').disabled,true);assert.equal(delayed.ids.get('clearBtn').disabled,true);
  delayed.tap('clearBtn');assert.equal(delayed.run('JSON.stringify(strokesPoints)'),originalInk);
  delayed.tap('settingsBtn');assert.equal(delayed.ids.get('panelOverlay').classList.contains('show'),true);
  delayed.tap('closePanelBtn');assert.equal(delayed.run('JSON.stringify(strokesPoints)'),originalInk);
  delayed.advance(6000);await flush();
  assert.equal(delayed.ids.get('submitBtn').disabled,false,'Six-second timeout must release submit');
  assert.equal(delayed.ids.get('clearBtn').disabled,false,'Timeout must release erase');
  assert.equal(delayed.run('JSON.stringify(strokesPoints)'),originalInk);
  assert.equal(delayed.run('wrongCountToday(currentItem)'),wrongBefore);
  assert.equal(delayed.run('currentItem.history.length'),0);assert.equal(delayed.run('passedCount'),0);
  assert.ok(delayed.ids.get('statusLine').textContent.includes('不算写错'));
  delayed.setMode('online');delayed.tap('submitBtn');await flush();
  assert.equal(delayed.ids.get('submitBtn').disabled,false);assert.equal(delayed.run('passedCount'),1,'Retained ink retries after recovery');
  assert.equal(delayed.run('wrongCountToday(currentItem)'),wrongBefore);
  assert.ok(delayed.network.every(call=>call.kind==='glyph'&&dependencyGroup(char).has(call.char)));

  // Settings alone never loads the full dictionary; explicit parent focus does.
  const parent=environment();await flush();assert.equal(parent.context.window.PINYIN_MAP,undefined);
  parent.tap('settingsBtn');assert.equal(parent.network.some(c=>c.kind==='script'),false);
  parent.ids.get('charInput').value='乙';parent.ids.get('pinyinInput').value='';
  assert.equal(parent.run("pinyinAlts('乙')[0]"),'yǐ','Reviewed small reading is immediately usable');
  parent.ids.get('charInput').dispatch('focus');await flush();
  assert.equal(parent.network.filter(c=>c.kind==='script').length,1);
  assert.ok(parent.context.window.PINYIN_MAP);assert.equal(parent.ids.get('pinyinInput').value,'yǐ');
  console.log('offline-startup: lightweight controls, same-origin per-target/dependency fixtures, cached offline grading, preserved old progress, hung-network timeout/retained-ink retry, and parent-only pinyin passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
