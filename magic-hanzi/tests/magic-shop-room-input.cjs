'use strict';
// A fresh, local-only Chrome profile. Real CDP touch gestures exercise the page's
// document touchmove lock; programmatic scrollTop/wheel cannot prove this path.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { setTimeout: pause } = require('node:timers/promises');
const ROOT = path.resolve(__dirname, '..');
const output = process.env.SHOP_ROOM_TEST_OUTPUT;
const checks = [];
const chrome = [process.env.CHROME_BIN, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find(file => file && fs.existsSync(file));
const fixture = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/magic-shop.css"><style>*{box-sizing:border-box}html,body{height:100%;margin:0;overflow:hidden;touch-action:none;overscroll-behavior:none;background:#171e1b;color:#eee;font-family:Arial,sans-serif}body{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;padding:20px 10px}dialog{margin:auto}button{font:inherit}dialog::backdrop{background:#080e0bdd}</style></head><body><dialog class="herb-cottage"><h2 id="herbCottageName">巫师房间</h2><button id="herbCottageExit">继续探险</button></dialog><script src="/magic-shop-catalog.js"></script><script src="/magic-shop-ledger.js"></script><script src="/magic-shop.js"></script><script>
window.blockedTouchMoves=0;document.addEventListener('touchmove',e=>{if(e.target.closest('.panel,.queue-list'))return;blockedTouchMoves++;e.preventDefault()},{passive:false});
function onTap(el,fn){let last=-Infinity;function fire(e){if(el.disabled||Date.now()-last<400)return;last=Date.now();fn(e)}el.addEventListener('pointerup',fire);el.addEventListener('click',fire)}
window.fixtureReady=(async()=>{localStorage.setItem('hanzi-herbalist-wallet-v1','2000');window.fixtureLedger=HanziMagicShopLedger.create({window});await fixtureLedger.ready();for(const id of ['little-fireplace','brass-candlestick','star-chair','wizard-cat'])if(!fixtureLedger.snapshot().owned.some(x=>x.itemId===id))await fixtureLedger.purchase(id);const cottage=document.querySelector('dialog');document.getElementById('herbCottageExit').onclick=()=>cottage.close();window.fixtureShop=HanziMagicShop.create({document,cottage,ledger:fixtureLedger,catalog:HanziMagicShopCatalog,onTap});fixtureShop.openRoom();return true})()</script></body></html>`;

function check(value, name, detail) { assert.ok(value, name + (detail ? ': ' + JSON.stringify(detail) : '')); checks.push({ name, detail }); console.log('PASS', name); }
async function until(action, name, timeout = 10000, interval = 35) { const stop = Date.now() + timeout; let last; while (Date.now() < stop) { last = await action(); if (last) return last; await pause(interval); } throw Error('Timeout: ' + name + ' ' + JSON.stringify(last)); }

async function run() {
  if (!chrome) { assert.ok(!process.argv.includes('--browser-required'), 'Chrome is required for touch tests'); console.log('SKIP magic-shop-room-input: no Chrome'); return; }
  if (output) await fsp.mkdir(output, { recursive: true });
  const profile = await fsp.mkdtemp(path.join(os.tmpdir(), 'magic-shop-input-'));
  const server = http.createServer(async (req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname === '/') { res.setHeader('Content-Type', 'text/html;charset=utf-8'); res.end(fixture); return; }
    if (pathname === '/peer') { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><title>Independent synthetic ledger</title>'); return; }
    const target = path.resolve(ROOT, '.' + pathname);
    if (!target.startsWith(ROOT + path.sep)) { res.writeHead(403); res.end(); return; }
    try { const data = await fsp.readFile(target); res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp' })[path.extname(target)] || 'application/octet-stream'); res.end(data); }
    catch (_) { res.writeHead(404); res.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const browser = spawn(chrome, ['--headless=new', '--no-sandbox', '--disable-background-networking', '--disable-extensions', '--no-first-run', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderrTail = Buffer.alloc(0), spawnError;
  browser.stderr.on('data', chunk => { stderrTail = Buffer.from(Buffer.concat([stderrTail, chunk]).subarray(-4096)); });
  browser.once('error', cause => { spawnError = cause; });
  const startupDiagnostic = () => 'exit=' + browser.exitCode + ', signal=' + browser.signalCode
    + (spawnError ? ', spawn error=' + spawnError.message : '') + '\nChrome stderr tail (max 4096 bytes):\n' + stderrTail.toString('utf8');
  let socket;
  try {
    let port;
    try {
      port = await until(async () => {
        if (spawnError || browser.exitCode !== null || browser.signalCode !== null) throw Error('Fresh isolated Chrome exited before ready');
        try { return (await fsp.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; }
        catch (_) { return null; }
      }, 'fresh isolated Chrome within 30 seconds', 30000, 40);
    } catch (cause) { assert.fail(cause.message + '\n' + startupDiagnostic()); }
    const targets = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
    socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
    let sequence = 0;
    const pending = new Map(), errors = [];
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
      const action = pending.get(message.id); if (!action) return;
      pending.delete(message.id); if (message.error) action.reject(Error(message.error.message)); else action.resolve(message.result);
    });
    const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); });
    const evaluate = async expression => { const response = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true }); if (response.exceptionDetails) throw Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text); return response.result.value; };
    const viewport = async (width, height) => { await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: true }); await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }); await pause(70); };
    const rect = selector => evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing '+${JSON.stringify(selector)});const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,cx:r.x+r.width/2,cy:r.y+r.height/2}})()`);
    const touch = (type, x, y) => send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' || type === 'touchCancel' ? [] : [{ x, y, id: 1, radiusX: 2, radiusY: 2, force: 1 }] });
    const tap = async selector => { const r = await rect(selector); check(await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});return e.contains(document.elementFromPoint(${r.cx},${r.cy}))})()`), 'touch reaches ' + selector); await touch('touchStart', r.cx, r.cy); await touch('touchEnd'); await pause(450); };
    const swipe = async (x, fromY, toY) => { await touch('touchStart', x, fromY); for (let step = 1; step <= 16; step++) { await touch('touchMove', x, fromY + (toY - fromY) * step / 16); await pause(15); } await touch('touchEnd'); await pause(240); };
    const scrollStore = async bottom => { for (let n = 0; n < 24; n++) { const s = await evaluate('(()=>{const e=document.querySelector(".magic-house-content"),r=e.getBoundingClientRect();return{top:e.scrollTop,max:e.scrollHeight-e.clientHeight,x:r.x+r.width/2,from:r.bottom-65,to:r.top+65}})()'); if (bottom ? s.top >= s.max - 4 : s.top <= 4) { await pause(450); return s; } await swipe(s.x, bottom ? s.from : s.to, bottom ? s.to : s.from); } throw Error('Native touch scrolling did not reach ' + (bottom ? 'bottom' : 'top')); };
    const screenshot = async name => { if (!output) return; const image = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); await fsp.writeFile(path.join(output, name + '.png'), Buffer.from(image.data, 'base64')); };
    await send('Page.enable'); await send('Runtime.enable');
    await viewport(820, 1180);
    await send('Page.navigate', { url: origin });
    await until(() => evaluate('window.fixtureReady ? Promise.resolve(fixtureReady).then(()=>document.querySelector("dialog").dataset.shopReady==="true") : false'), 'shop initialized');
    check(await evaluate('!document.querySelector(".magic-old-crate,.magic-wall-shelf")'), 'Unowned crate and shelf placeholders are absent');
    const originalBalance = await evaluate('fixtureLedger.snapshot().balance');
    const originalPurchases = await evaluate('JSON.stringify(fixtureLedger.snapshot().owned)');
    await tap('#magicShopEntry');
    const first = await rect('.magic-product');
    const beforeSwipe = await evaluate('document.querySelector(".magic-house-content").scrollTop');
    await swipe(first.cx, first.cy, Math.max(220, first.cy - 280));
    check(await evaluate('fixtureShop.getPanel()==="shop"&&document.querySelector(".magic-house-content").scrollTop>' + (beforeSwipe + 30)), 'Swiping from a product button scrolls the store without opening detail');
    const gap = await evaluate('(()=>{const c=document.querySelector(".magic-house-content"),r=c.getBoundingClientRect(),rows=[];for(const e of document.querySelectorAll(".magic-product")){const b=e.getBoundingClientRect();if(!rows.some(a=>Math.abs(a.top-b.top)<1))rows.push({top:b.top,bottom:b.bottom,x:b.x+b.width/2})}for(let i=0;i<rows.length-1;i++){const y=(rows[i].bottom+rows[i+1].top)/2;if(rows[i+1].top-rows[i].bottom>3&&y>r.top+150&&y<r.bottom-30)return{x:rows[i].x,y,to:r.top+40,scroll:c.scrollTop,hit:document.elementFromPoint(rows[i].x,y)?.className}}return null})()');
    check(Boolean(gap), 'Store exposes a visible row gap for a separate scroll gesture', gap);
    await swipe(gap.x, gap.y, gap.to);
    check(await evaluate('document.querySelector(".magic-house-content").scrollTop>' + (gap.scroll + 30)), 'Swiping from the empty gap between product rows also scrolls');
    await scrollStore(true);
    check(await evaluate('(()=>{const e=document.querySelector(".magic-house-content");return e.scrollTop+e.clientHeight>=e.scrollHeight-5})()'), 'Actual touch swipes reach the bottom of all 24 products');
    await screenshot('房间拖放_商店触控到底');
    await tap('.magic-product[data-item-id="wizard-cat"]');
    check(await evaluate('fixtureShop.getPanel()==="detail"'), 'Bottom product is reachable by touch');
    await scrollStore(true);
    await tap('#magicShopCancel');
    await until(() => evaluate('fixtureShop.getPanel()==="shop"'), 'cancel returns to shop');
    check(true, 'Touch cancellation stays in the store after the compatibility click');
    await scrollStore(false); await tap('#magicShopBackRoom');
    await tap('#magicRoomArrange');
    await screenshot('房间拖放_布置模式');
    const stage = await rect('#magicRoomStage');
    let source = await rect('.magic-room-item[data-item-id="little-fireplace"]');
    await evaluate('window.dragOriginalNode=document.querySelector(".magic-room-item[data-item-id=little-fireplace]")');
    const scrollBeforeDrag = await evaluate('document.querySelector(".magic-house-content").scrollTop');
    await touch('touchStart', source.cx, source.cy);
    const target = { x: stage.x + stage.width * .54, y: stage.y + stage.height * .70 };
    for (let n = 1; n <= 12; n++) { await touch('touchMove', source.cx + (target.x - source.cx) * n / 12, source.cy + (target.y - source.cy) * n / 12); await pause(18); }
    const peerSource = await fsp.readFile(path.join(ROOT, 'magic-shop-catalog.js'), 'utf8') + '\n' + await fsp.readFile(path.join(ROOT, 'magic-shop-ledger.js'), 'utf8');
    await evaluate(`(async()=>{const f=document.createElement('iframe');f.style.display='none';f.src='/peer';document.body.append(f);await new Promise(r=>f.onload=r);f.contentWindow.eval(${JSON.stringify(peerSource)});window.peerLedger=f.contentWindow.HanziMagicShopLedger.create({window:f.contentWindow});await peerLedger.ready();await peerLedger.credit(3,'drag:remote:reward');await peerLedger.purchase('oak-desk');})()`);
    await pause(100);
    check(await evaluate('dragOriginalNode===document.querySelector(".magic-room-item[data-item-id=little-fireplace]")&&dragOriginalNode.classList.contains("is-dragging")'), 'A remote purchase and reward preserve the current drag capture node');
    await touch('touchEnd');
    await until(() => evaluate('fixtureLedger.snapshot().roomPositions["little-fireplace"]?.x===.54'), 'touch position committed');
    check(await evaluate('Math.abs(document.querySelector(".magic-house-content").scrollTop-' + scrollBeforeDrag + ')<2'), 'Dragging an object does not scroll the room');
    check(await evaluate('!document.querySelector(".magic-room-item[data-item-id=little-fireplace]").classList.contains("is-playing")'), 'Finishing a drag does not trigger its magic');
    check(await evaluate('fixtureLedger.snapshot().balance===' + (originalBalance + 3 - 60) + '&&fixtureLedger.snapshot().owned.length===5'), 'Position write preserves the concurrent reward and purchase');
    // Mouse drag of a small object through actual input events.
    source = await rect('.magic-room-item[data-item-id="brass-candlestick"]');
    const targetMouse = { x: stage.x + stage.width * .36, y: stage.y + stage.height * .47 };
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: source.cx, y: source.cy, button: 'left', clickCount: 1 });
    for (let n = 1; n <= 10; n++) await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: source.cx + (targetMouse.x - source.cx) * n / 10, y: source.cy + (targetMouse.y - source.cy) * n / 10, button: 'left', buttons: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: targetMouse.x, y: targetMouse.y, button: 'left', clickCount: 1 });
    await until(() => evaluate('fixtureLedger.snapshot().roomPositions["brass-candlestick"]?.x===.36'), 'mouse candle position');
    check(true, 'Mouse drag saves a small object as normalized coordinates');
    source = await rect('.magic-room-item[data-item-id="wizard-cat"]');
    const petTarget = { x: stage.x + stage.width * .76, y: stage.y + stage.height * .83 };
    await touch('touchStart', source.cx, source.cy);
    for (let n = 1; n <= 8; n++) { await touch('touchMove', source.cx + (petTarget.x - source.cx) * n / 8, source.cy + (petTarget.y - source.cy) * n / 8); await pause(18); }
    await touch('touchEnd');
    await until(() => evaluate('fixtureLedger.snapshot().roomPositions["wizard-cat"]?.x===.76'), 'pet position');
    check(true, 'A purchased pet can also be dragged and saved');
    // A canceled pointer returns without writing.
    const saved = await evaluate('JSON.stringify(fixtureLedger.snapshot().roomPositions)');
    source = await rect('.magic-room-item[data-item-id="brass-candlestick"]');
    await touch('touchStart', source.cx, source.cy); await touch('touchMove', source.cx + 35, source.cy + 40); await touch('touchCancel'); await pause(80);
    check(await evaluate('JSON.stringify(fixtureLedger.snapshot().roomPositions)===' + JSON.stringify(saved)), 'Canceled touch drag leaves committed positions intact');
    // Force a transaction failure, then retry through the offered UI.
    await evaluate('window.originalTransaction=IDBDatabase.prototype.transaction;IDBDatabase.prototype.transaction=function(){throw new DOMException("synthetic quota","QuotaExceededError")}');
    source = await rect('.magic-room-item[data-item-id="brass-candlestick"]');
    await touch('touchStart', source.cx, source.cy); await touch('touchMove', source.cx + 35, source.cy + 40); await touch('touchEnd');
    await until(() => evaluate('document.getElementById("magicRoomPositionStatus").classList.contains("is-error")'), 'visible failed position save');
    check(await evaluate('JSON.stringify(fixtureLedger.snapshot().roomPositions)===' + JSON.stringify(saved)), 'A failed placement restores the previous committed position');
    await evaluate('IDBDatabase.prototype.transaction=originalTransaction');
    await tap('#magicRoomPositionRetry');
    await until(() => evaluate('!document.getElementById("magicRoomPositionStatus").classList.contains("is-error")'), 'position retry succeeds');
    check(await evaluate('fixtureLedger.snapshot().balance===' + (originalBalance + 3 - 60)), 'Position retry never spends or creates coins');
    const blank = await rect('#magicRoomStage');
    const beforeBlank = await evaluate('document.querySelector(".magic-house-content").scrollTop');
    await swipe(blank.x + blank.width * .93, blank.y + blank.height * .42, blank.y + blank.height * .15);
    check(await evaluate('document.querySelector(".magic-house-content").scrollTop>' + (beforeBlank + 10)), 'Blank room space still scrolls while arrangement mode is on');
    await evaluate('document.getElementById("magicRoomArrange").scrollIntoView({block:"nearest"})');
    await tap('#magicRoomArrange');
    await tap('.magic-room-item[data-item-id="little-fireplace"]');
    check(await evaluate('document.querySelector(".magic-room-item[data-item-id=little-fireplace]").classList.contains("is-playing")'), 'After finishing arrangement, a touch tap still plays magic');
    const persisted = await evaluate('JSON.stringify(fixtureLedger.snapshot().roomPositions)');
    await send('Page.reload'); await until(() => evaluate('window.fixtureReady ? Promise.resolve(fixtureReady).then(()=>document.querySelector("dialog").dataset.shopReady==="true") : false'), 'reload');
    check(await evaluate('JSON.stringify(fixtureLedger.snapshot().roomPositions)===' + JSON.stringify(persisted)), 'Refresh preserves freely arranged positions');
    for (const [name, width, height] of [['iPad竖屏', 820, 1180], ['iPad横屏', 1180, 820], ['手机', 390, 844]]) {
      await viewport(width, height);
      const position = await evaluate('(()=>{const e=document.querySelector(".magic-room-item[data-item-id=little-fireplace]"),r=e.getBoundingClientRect(),s=document.getElementById("magicRoomStage").getBoundingClientRect();return{x:(r.x+r.width/2-s.x)/s.width,y:(r.y+r.height/2-s.y)/s.height}})()');
      check(Math.abs(position.x - .54) < .001 && Math.abs(position.y - .70) < .001, name + ' keeps the same normalized furniture position', position);
      await screenshot('房间拖放_' + name);
    }
    check(await evaluate('blockedTouchMoves===0'), 'Native dialog touch moves never reach the writing page scroll blocker');
    check(errors.length === 0, 'No browser exceptions', errors);
    if (output) await fsp.writeFile(path.join(output, 'room-input-report.json'), JSON.stringify({ passed: true, checks, originalBalance, originalPurchases, persisted: JSON.parse(persisted) }, null, 2));
  } finally {
    socket?.close(); browser.kill('SIGTERM');
    await new Promise(resolve => { if (browser.exitCode !== null || browser.signalCode !== null) resolve(); else { browser.once('exit', resolve); setTimeout(resolve, 2000).unref(); } });
    await new Promise(resolve => server.close(resolve));
    await fsp.rm(profile, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 });
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
