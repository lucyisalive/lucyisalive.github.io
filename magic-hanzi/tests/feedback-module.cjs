const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'game-feedback.js'),'utf8');
function environment({audio=true,reduced=false,resumeReject=false,resumeLater=false,primeReject=false}={}){
 let now=0,nextTimer=0;const timers=new Map(),oscillators=[],contexts=[];
 class Element{
  constructor(tag){this.tagName=tag;this.children=[];this.parentNode=null;this.hidden=false;this.attrs={};this.textContent='';this.className='';this.style={setProperty(k,v){this[k]=v;}};this.listeners={};const self=this;this.classList={add(...names){self.className=[...new Set(self.className.split(/\s+/).filter(Boolean).concat(names))].join(' ')},remove(...names){self.className=self.className.split(/\s+/).filter(x=>!names.includes(x)).join(' ')},contains(name){return self.className.split(/\s+/).includes(name)}};}
  get isConnected(){return this===body || Boolean(this.parentNode&&this.parentNode.isConnected)}
  appendChild(child){child.parentNode=this;this.children.push(child);return child}
  removeChild(child){this.children=this.children.filter(x=>x!==child);child.parentNode=null;return child}
  setAttribute(k,v){this.attrs[k]=v}
  addEventListener(k,fn){(this.listeners[k]||(this.listeners[k]=[])).push(fn)}
  getBoundingClientRect(){return this.rect||{left:0,top:0,width:0,height:0}}
 }
 const body=new Element('body'),tile=new Element('div');tile.id='writeTile';tile.rect={left:50,top:180,width:300,height:300};body.appendChild(tile);
 const door=new Element('div');door.id='doorpanel';door.rect={left:70,top:160,width:250,height:300};body.appendChild(door);
 function findId(node,id){if(node.id===id)return node;for(const c of node.children){const x=findId(c,id);if(x)return x;}return null}
 const document={body,hidden:false,createElement:tag=>new Element(tag),getElementById:id=>findId(body,id),listeners:{},addEventListener(k,fn){(this.listeners[k]||(this.listeners[k]=[])).push(fn)}};
 const window={innerWidth:400,innerHeight:800,performance:{now:()=>now},listeners:{},
  addEventListener(k,fn){(this.listeners[k]||(this.listeners[k]=[])).push(fn)},
  setTimeout(fn,ms){timers.set(++nextTimer,{fn,at:now+ms});return nextTimer},
  clearTimeout(id){timers.delete(id)},matchMedia:()=>({matches:reduced})};
 class Param{constructor(){this.value=1;}setValueAtTime(v,t){this.value=v;}linearRampToValueAtTime(v,t){}exponentialRampToValueAtTime(v,t){}cancelScheduledValues(t){}}
 class AudioContext{
  constructor(){
   this.state='suspended';this.sampleRate=44100;this.destination={};
   this.resumeCalls=0;this.closeCalls=0;this.resumeCallbacks=[];
   contexts.push(this);
  }
  get currentTime(){return now/1000}
  createGain(){return {gain:new Param(),connect(){},disconnect(){}}}
  createBufferSource(){return {connect(){},disconnect(){},start(){}}}
  createBuffer(){
   if(primeReject)throw Error('Silent source unavailable');
   return {};
  }
  resume(){
   this.resumeCalls++;
   if(resumeReject)return Promise.reject(Error('blocked'));
   if(resumeLater)return new Promise(resolve=>this.resumeCallbacks.push(resolve));
   this.state='running';
   return Promise.resolve();
  }
  finishResume(){
   if(this.state!=='closed')this.state='running';
   this.resumeCallbacks.splice(0).forEach(resolve=>resolve());
  }
  close(){this.closeCalls++;this.state='closed';return Promise.resolve();}
  createOscillator(){
   const oscillator={frequency:new Param(),stops:[],connect(){},disconnect(){},
    start(at){this.began=at;},stop(at){this.stops.push(at)}};
   oscillators.push(oscillator);
   return oscillator;
  }
 }
 if(audio)window.AudioContext=AudioContext;
 vm.runInNewContext(source,{window,document,Promise,Set,Math,Array,Object,Boolean});
 return {api:window.HanziGameFeedback,window,document,body,tile,door,timers,oscillators,contexts,findClass(cls){let found=[];function walk(n){if(n.classList.contains(cls))found.push(n);n.children.forEach(walk)}walk(body);return found},advance(ms){const until=now+ms;for(;;){const entries=[...timers].filter(([,x])=>x.at<=until).sort((a,b)=>a[1].at-b[1].at);if(!entries.length)break;const[id,x]=entries[0];timers.delete(id);now=x.at;x.fn()}now=until}};
}
(async()=>{
 const basic=environment({audio:false});assert.equal(await basic.api.unlock(),false);basic.api.playCorrect();assert.equal(basic.findClass('hg-feedback-star').length,12);assert.equal(basic.findClass('hg-feedback-ring').length,1);basic.api.playWrong();assert.equal(basic.api.celebrate('慧'),2400);assert.equal(basic.findClass('hg-feedback-message')[0].textContent,'今天这个字学会啦，改天再考。');assert.equal(basic.findClass('hg-feedback-character')[0].textContent,'慧');assert.equal(basic.findClass('hg-feedback-banner')[0].hidden,false);basic.advance(2390);assert.equal(basic.findClass('hg-feedback-banner')[0].hidden,true);assert.equal(basic.findClass('hg-feedback-star').length,0);assert.equal(basic.timers.size,0);
 basic.api.celebrate('警');basic.advance(2240);basic.api.celebrate('藏');basic.advance(200);assert.equal(basic.findClass('hg-feedback-banner')[0].hidden,false);assert.equal(basic.findClass('hg-feedback-character')[0].textContent,'藏');basic.api.reset();assert.equal(basic.timers.size,0);assert.equal(basic.findClass('hg-feedback-banner')[0].hidden,true);assert.equal(basic.findClass('hg-feedback-ring').length,0);
 const still=environment({audio:false,reduced:true});still.api.playCorrect();assert.equal(still.findClass('hg-feedback-star').length,0);assert.equal(still.findClass('hg-feedback-ring').length,1);still.advance(360);assert.equal(still.findClass('hg-feedback-ring').length,0);
 const sounds=environment();assert.equal(await sounds.api.unlock(),true);sounds.api.playCorrect();const correctNodes=sounds.oscillators.slice();const correctEnd=Math.max(...correctNodes.map(n=>n.stops[0]));assert(correctEnd<.5);sounds.api.celebrate('慧');const victoryNodes=sounds.oscillators.slice(correctNodes.length);assert(Math.min(...victoryNodes.map(n=>n.began))>=.32);assert(Math.max(...victoryNodes.map(n=>n.stops[0]))<1.5);assert(correctNodes.every(n=>n.stops.length===1),'celebration must preserve the just-played correct chime');sounds.api.reset();assert(sounds.oscillators.every(n=>n.stops.length>=2));const prior=sounds.oscillators.length;sounds.api.setMuted(true);sounds.api.playCorrect();assert.equal(sounds.oscillators.length,prior);sounds.api.setMuted(false);sounds.api.playWrong();const wrongNodes=sounds.oscillators.slice(prior);assert(Math.max(...wrongNodes.map(n=>n.stops[0]))<.6);sounds.document.hidden=true;const hiddenCount=sounds.oscillators.length;sounds.api.playWrong();assert.equal(sounds.oscillators.length,hiddenCount);
 assert.equal(sounds.contexts.length,1);await sounds.api.unlock();assert.equal(sounds.contexts.length,1,'reuse one AudioContext');
 const blocked=environment({resumeReject:true});assert.equal(await blocked.api.unlock(),false);blocked.api.playCorrect();assert.equal(blocked.oscillators.length,0);

 const noPrime=environment({primeReject:true});
 assert.equal(await noPrime.api.unlock(),true,'A failed silent buffer still calls resume');
 assert.equal(noPrime.contexts[0].resumeCalls,1);
 noPrime.api.playCorrect();
 assert.equal(noPrime.oscillators.length,6);

 const pending=environment({resumeLater:true});
 const pendingUnlock=pending.api.unlock();
 pending.api.playWrong();
 pending.api.playCorrect();
 pending.api.celebrate('慧');
 assert.equal(pending.oscillators.length,0);
 pending.advance(120);
 pending.contexts[0].finishResume();
 assert.equal(await pendingUnlock,true);
 assert.equal(pending.oscillators.length,20,'Only the newer correct and victory patterns survive');
 assert.ok(pending.oscillators.slice(0,6).every(node=>node.stops.length===1),'Keep the correct chime when victory follows');
 assert.ok(Math.min(...pending.oscillators.slice(6).map(node=>node.began))>=.44,'Victory starts after the correct chime');

 const expired=environment({resumeLater:true});
 const expiredUnlock=expired.api.unlock();
 expired.api.playWrong();
 expired.advance(500);
 expired.contexts[0].finishResume();
 await expiredUnlock;
 assert.equal(expired.oscillators.length,0,'Do not replay a chime after 500 ms');

 const switched=environment({resumeLater:true});
 const switchedUnlock=switched.api.unlock();
 switched.api.playWrong();
 switched.api.reset();
 switched.contexts[0].finishResume();
 await switchedUnlock;
 assert.equal(switched.oscillators.length,0,'Question reset clears a chime waiting for resume');
 switched.api.playWrong();
 assert.equal(switched.oscillators.length,3,'A later result still sounds normally');

 const lifecycle=environment({resumeLater:true});
 const trigger=lifecycle.document.listeners.pointerup[0];
 const speechTarget={closest:selector=>selector.includes('#speakBtn')};
 trigger({isTrusted:true,target:speechTarget});
 trigger({isTrusted:false,target:{}});
 assert.equal(lifecycle.contexts.length,0,'Speech and synthetic events must not prime effect audio');
 trigger({isTrusted:true,pointerType:'pen',target:{}});
 lifecycle.api.playWrong();
 lifecycle.document.hidden=true;
 lifecycle.document.listeners.visibilitychange[0]();
 assert.equal(lifecycle.contexts[0].closeCalls,1);
 lifecycle.contexts[0].finishResume();
 await Promise.resolve();
 assert.equal(lifecycle.oscillators.length,0);
 lifecycle.document.hidden=false;
 trigger({isTrusted:true,pointerType:'pen',target:{}});
 assert.equal(lifecycle.contexts.length,2,'Next visible Pencil gesture opens a fresh context');
 lifecycle.contexts[1].finishResume();
 await Promise.resolve();
 lifecycle.api.playCorrect();
 assert.equal(lifecycle.oscillators.length,6);
 lifecycle.window.listeners.pagehide[0]();
 assert.equal(lifecycle.contexts[1].closeCalls,1,'Page cache navigation also closes the context');

 const late=environment();
 const createElement=late.document.createElement;
 late.document.createElement=tag=>Object.assign(createElement(tag),{querySelectorAll:()=>[]});
 late.body.dataset={herbStage:'sea'};
 late.body.insertBefore=child=>late.body.appendChild(child);
 const lateScene=fs.readFileSync(path.join(root,'tomb-mermaid.js'),'utf8');
 vm.runInNewContext(lateScene,{window:late.window});
 late.window.HanziTombMermaid.create({document:late.document});
 const captureSea=(type,event)=>late.document.listeners[type].at(-1)(event);
 for(const id of ['speakBtn','sentenceBtn']){
  const speechButton={closest:selector=>selector.includes('#'+id)};
  for(const type of ['pointerdown','pointerup','touchend','keydown']){
   captureSea(type,{isTrusted:true,pointerType:'pen',target:speechButton});
  }
 }
 captureSea('touchend',{isTrusted:false,target:{}});
 late.document.hidden=true;
 captureSea('pointerup',{isTrusted:true,pointerType:'pen',target:{}});
 assert.equal(late.contexts.length,0,'The late-room context excludes speech, synthetic events, and hidden pages');
 late.document.hidden=false;
 captureSea('pointerup',{isTrusted:true,pointerType:'pen',target:{}});
 assert.equal(late.contexts.length,1,'A real Pencil gesture still unlocks the late-room effects');
 assert.equal(late.contexts[0].state,'running');

 const fallback=environment({audio:false});fallback.tile.rect={left:0,top:0,width:0,height:0};fallback.api.playCorrect();assert.equal(fallback.findClass('hg-feedback-ring')[0].style.left,'65px');
 const results={checks:'unsupported audio, priming failure, rejected and delayed resume, bounded chimes, Pencil unlock and speech exclusion, background recreation, schedules, handoff, muted/hidden audio, visual cleanup, repeated celebration, reduced motion, door fallback',correctAudioEndSeconds:correctEnd,victoryAudioEndSeconds:Math.max(...victoryNodes.map(n=>n.stops[0])),wrongAudioEndSeconds:Math.max(...wrongNodes.map(n=>n.stops[0])),status:'passed'};
 fs.mkdirSync(path.join(root,'work/feedback'),{recursive:true});fs.writeFileSync(path.join(root,'work/feedback/check-results.json'),JSON.stringify(results,null,2)+'\n');console.log(JSON.stringify(results,null,2));
})().catch(e=>{console.error(e);process.exit(1)});
