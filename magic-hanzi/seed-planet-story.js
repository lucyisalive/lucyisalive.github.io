(function (window) {
  'use strict';

  const OPEN_MS=1300,TRAVEL_MS=10500;
  const ASSETS=Object.freeze({
    bench:'assets/story/seed-workbench-v1.webp',
    walnut:'assets/story/seed-walnut-v1.webp',
    halves:'assets/story/seed-walnut-halves-v1.webp',
    planet:'assets/story/seed-sand-planet-v1.webp',
    ground:'assets/story/seed-sand-rose-arrival-v1.webp'
  });
  const blobUrls=new Map();
  let instances=0;

  function imageUrl(source,doc) {
    const src=String(source),comma=src.indexOf(','),header=comma<0?'':src.slice(0,comma);
    if(!/^data:image\/[^,]+;base64$/i.test(header))return src;
    if(blobUrls.has(src))return blobUrls.get(src);
    try {
      const view=doc.defaultView||window,decode=view.atob||window.atob;
      const BlobType=view.Blob||window.Blob,urls=view.URL||window.URL;
      if(typeof decode!=='function'||typeof BlobType!=='function'||typeof urls?.createObjectURL!=='function')return src;
      const binary=decode.call(view,src.slice(comma+1)),bytes=new Uint8Array(binary.length);
      for(let index=0;index<binary.length;index++)bytes[index]=binary.charCodeAt(index);
      const url=urls.createObjectURL(new BlobType([bytes],{type:header.slice(5).split(';')[0]}));
      if(typeof url!=='string'||!url)return src;
      blobUrls.set(src,url);return url;
    } catch (_) { return src; }
  }

  function kernelMarkup(art,index) {
    return `<div class="sp-layer" data-layer-index="${index}" style="--sp-depth:${index};z-index:${20-index}">
      <div class="sp-whole"><div class="sp-walnut-fallback"></div><img class="sp-object-art sp-walnut-art" src="${art.walnut}" alt="" draggable="false"></div>
      <div class="sp-halves"><i class="sp-half sp-half-left"><span class="sp-half-fallback"></span><span class="sp-half-art"></span></i><i class="sp-half sp-half-right"><span class="sp-half-fallback"></span><span class="sp-half-art"></span></i></div>
    </div>`;
  }

  function create({document:doc,onActionRequest}={}) {
    const art=Object.fromEntries(Object.entries(ASSETS).map(([key,path])=>[key,imageUrl(path,doc)]));
    const scene=doc.createElement('div');
    scene.className='story-seed';scene.hidden=true;scene.setAttribute('aria-hidden','true');
    scene.dataset.instance=String(++instances);
    scene.style.setProperty('--sp-halves-art',`url("${art.halves}")`);
    scene.innerHTML=`<div class="seed-frame">
      <div class="sp-workbench"><div class="sp-bench-fallback"></div><img class="sp-scene-art sp-bench-art" src="${art.bench}" alt="" draggable="false"><div class="sp-focus-shade"></div></div>
      <div class="sp-kernels">${Array.from({length:10},(_,index)=>kernelMarkup(art,index)).join('')}</div>
      <div class="sp-grain"><i class="sp-grain-core"></i><i class="sp-grain-glow"></i></div>
      <div class="sp-space"><div class="sp-space-fallback"><i></i></div><img class="sp-scene-art sp-planet-art" src="${art.planet}" alt="" draggable="false"></div>
      <div class="sp-descent-haze"></div>
      <div class="sp-ground"><div class="sp-ground-fallback"><div class="sp-rose-fallback"><i></i><b></b></div></div><img class="sp-scene-art sp-ground-art" src="${art.ground}" alt="" draggable="false"></div>
      <div class="sp-frame-shade"></div>
    </div>`;
    doc.body.insertBefore(scene,doc.body.firstChild);

    const grainButton=doc.createElement('button');
    grainButton.type='button';grainButton.className='seed-grain-action';grainButton.hidden=true;
    grainButton.setAttribute('aria-label','轻点这粒沙子，看看它藏着什么');
    grainButton.title='轻点这粒沙子';
    doc.body.appendChild(grainButton);
    const layers=Array.from(scene.querySelectorAll('.sp-layer'));
    const grain=scene.querySelector('.sp-grain');
    const timers=new Set();
    const motion=window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const reduced=()=>Boolean(motion?.matches);
    const now=()=>window.performance?.now?.()??Date.now();
    let stage,count=0,generation=0,phase='layers',ready=false,travelStart=0;

    function cancelTimers() {
      generation++;timers.forEach(timer=>window.clearTimeout(timer));timers.clear();
    }
    function later(delay,callback) {
      const token=generation;
      const timer=window.setTimeout(()=>{timers.delete(timer);if(token===generation)callback();},delay);
      timers.add(timer);
    }
    function writingIsActive() {
      return doc.body.dataset.herbMode==='playing'&&doc.body.classList.contains('herb-writing');
    }
    function positionButton() {
      if(grainButton.hidden)return;
      const box=grain.getBoundingClientRect();
      grainButton.style.left=(box.left+box.width/2)+'px';
      grainButton.style.top=(box.top+box.height/2)+'px';
    }
    function updateButton() {
      const enabled=stage==='seed'&&count===10&&phase==='waiting'&&ready&&!doc.hidden&&!writingIsActive();
      grainButton.hidden=!enabled;grainButton.disabled=!enabled;
      positionButton();
    }
    function clearTravel() { scene.classList.remove('is-travelling','is-arrived'); }
    function arrive() {
      cancelTimers();phase='arrived';ready=false;
      scene.classList.remove('is-travelling','is-awaiting','is-changing');
      scene.classList.add('is-arrived');
      layers.forEach(layer=>layer.classList.remove('is-opening'));
      updateButton();
    }
    function resetExit() {
      cancelTimers();
      if(count===10)arrive();
      else {phase='layers';ready=false;clearTravel();scene.classList.remove('is-awaiting','is-changing');paintLayers(count,false,false);updateButton();}
    }

    function paintLayers(next,animate,changed) {
      if(!animate)scene.classList.add('is-setting');
      const camera=Math.pow(1.5,next);
      scene.style.setProperty('--sp-camera-count',String(next));
      scene.style.setProperty('--sp-bench-zoom',String(1+next*.065));
      scene.style.setProperty('--sp-bench-blur',(next*.13)+'px');
      layers.forEach((layer,index)=>{
        const width=34*Math.pow(.58,index)*camera;
        layer.style.setProperty('--sp-width',Math.min(250,width).toFixed(5)+'%');
        layer.classList.toggle('is-opened',index<next);
        layer.classList.toggle('is-current',index===next);
        layer.classList.toggle('is-unseen',index>next||index<next-3);
        if(changed||!animate)layer.classList.remove('is-opening');
        if(changed&&index===next-1)layer.classList.add('is-opening');
      });
      if(!animate){void scene.offsetWidth;scene.classList.remove('is-setting');}
    }

    function render(nextStage,nextCount,animate=false) {
      const switched=stage!==nextStage;
      scene.hidden=nextStage!=='seed';
      if(nextStage!=='seed'){resetExit();stage=nextStage;updateButton();return;}
      const next=Math.max(0,Math.min(10,Math.floor(Number(nextCount)||0)));
      const previous=count,changed=Boolean(animate&&!switched&&next>previous);
      if(switched||next<previous)resetExit();
      if(next!==previous||switched)cancelTimers();
      count=next;stage=nextStage;scene.dataset.count=String(next);
      paintLayers(next,Boolean(animate&&!switched&&!reduced()),changed&&!reduced());
      scene.classList.toggle('is-complete',next===10);
      if(next<10){
        phase='layers';ready=false;clearTravel();scene.classList.remove('is-awaiting');
        if(changed&&!reduced()){scene.classList.add('is-changing');later(OPEN_MS,()=>scene.classList.remove('is-changing'));}
      }else if(reduced()||doc.hidden){arrive();}
      else if(changed){
        phase='waiting';ready=false;clearTravel();scene.classList.add('is-awaiting','is-changing');
        later(OPEN_MS,()=>{scene.classList.remove('is-changing');ready=true;updateButton();});
      }else if(switched||previous!==next){arrive();}
      updateButton();
    }

    function performAction(nextStage='seed') {
      if(nextStage!=='seed'||stage!=='seed'||count!==10)return 0;
      if(reduced()||doc.hidden){arrive();return 0;}
      if(phase==='arrived')return 0;
      if(phase==='travel')return Math.max(0,Math.ceil(TRAVEL_MS-(now()-travelStart)));
      cancelTimers();phase='travel';ready=false;travelStart=now();
      scene.classList.remove('is-awaiting','is-arrived','is-changing');
      scene.classList.add('is-setting');void scene.offsetWidth;scene.classList.remove('is-setting');
      scene.classList.add('is-travelling');updateButton();
      later(TRAVEL_MS,arrive);
      return TRAVEL_MS;
    }
    function playExit(nextStage) { return performAction(nextStage); }
    function isEndingComplete(nextStage='seed') { return nextStage==='seed'&&count===10&&phase==='arrived'; }
    function getAction(nextStage='seed') {
      if(nextStage!=='seed')return null;
      const finished=isEndingComplete();
      return {awaiting:count===10&&phase==='waiting',disabled:count<10||phase==='travel'||doc.hidden||writingIsActive()||(phase==='waiting'&&!ready),finished,label:finished?'回到草药房':'轻点这粒沙子',duration:TRAVEL_MS};
    }
    grainButton.addEventListener('click',()=>{
      if(grainButton.disabled||phase!=='waiting')return;
      if(typeof onActionRequest==='function'){
        try { onActionRequest('seed'); } catch (_) { /* Keep the enabled action available to retry. */ }
      }else performAction('seed');
    });

    function watch(img,className) {
      const update=()=>scene.classList.toggle(className,Boolean(img.complete&&img.naturalWidth));
      img.addEventListener('load',update);img.addEventListener('error',()=>{img.hidden=true;update();});update();
    }
    watch(scene.querySelector('.sp-walnut-art'),'has-walnut-art');
    watch(scene.querySelector('.sp-planet-art'),'has-planet-art');
    watch(scene.querySelector('.sp-ground-art'),'has-ground-art');
    const halves=doc.createElement('img');watch(halves,'has-halves-art');halves.src=art.halves;
    scene.querySelectorAll('img').forEach(img=>img.addEventListener('error',()=>{img.hidden=true;}));
    window.addEventListener?.('resize',positionButton);
    if(typeof window.MutationObserver==='function'){
      const observer=new window.MutationObserver(updateButton);
      observer.observe(doc.body,{attributes:true,attributeFilter:['class','data-herb-mode','data-herb-stage']});
    }
    doc.addEventListener('visibilitychange',()=>{if(doc.hidden)resetExit();else updateButton();});
    const reduceNow=()=>{if(reduced())resetExit();};
    if(typeof motion?.addEventListener==='function')motion.addEventListener('change',reduceNow);
    else motion?.addListener?.(reduceNow);
    paintLayers(0,false,false);
    return {render,playExit,performAction,resetExit,getAction,isEndingComplete,arrivalTime:(nextStage='seed')=>nextStage==='seed'&&!reduced()&&!doc.hidden?OPEN_MS:0};
  }

  window.HanziSeedPlanetStory=Object.freeze({create});
})(window);
