(function (window) {
  'use strict';

  const ENDING_MS=8800;
  // One source literal per image keeps offline packages small. All repeated
  // costumes and atlas poses share the same cached short Blob URL.
  const ASSETS=Object.freeze({
    workshop:'assets/story/elves-tailor-workshop-v1.webp',
    base:'assets/story/elves-base-v1.webp',
    dressed:'assets/story/elves-dressed-v1.webp',
    awake:'assets/story/elves-awake-v1.webp',
    sneak:'assets/story/elves-sneak-atlas-v1.webp'
  });
  const blobUrls=new Map();
  let instances=0;

  function imageUrl(source,doc) {
    const src=String(source),comma=src.indexOf(',');
    const header=comma<0?'':src.slice(0,comma);
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
      blobUrls.set(src,url);
      return url;
    } catch (_) { return src; }
  }

  // Two five-piece outfits, alternated between the figures. Coordinates are
  // in the common full-size artwork, so dressing never moves either body.
  const ITEMS=[
    {elf:'left',piece:'hat',label:'第一位的帽子',origin:'31.5% 32%',mask:'polygon(23% 27.5%,40% 27.5%,40% 31.8%,37% 32.3%,33.4% 32.9%,30.6% 34%,28.7% 34.2%,26.6% 34%,27.2% 35%,28.6% 35.8%,30.1% 36.4%,28.5% 37%,27.5% 39.2%,23% 39.2%)'},
    {elf:'right',piece:'hat',label:'第二位的帽子',origin:'64% 35%',mask:'polygon(55.8% 30.5%,72% 30.5%,72% 34.8%,68.4% 35%,65.6% 35.5%,63.4% 36.1%,61.5% 36.1%,59.6% 35.7%,60.1% 36.7%,61.5% 37.7%,63% 38.2%,60.6% 39.3%,59.4% 41.8%,55.8% 41.8%)'},
    {elf:'left',piece:'jacket',label:'第一位的短上衣',origin:'33% 49%',mask:'polygon(28.5% 38.5%,37.7% 38.5%,43.5% 41.5%,48.2% 57.5%,46.8% 59%,43.4% 59.3%,40.8% 54.5%,38.7% 56.3%,25.4% 56.3%,23.5% 53.8%,22.8% 59.3%,18% 58.2%,22.8% 42%)'},
    {elf:'right',piece:'jacket',label:'第二位的短上衣',origin:'65.5% 50.5%',mask:'polygon(61.8% 42.3%,57.1% 43.5%,52.2% 58.6%,57.3% 59.6%,57.9% 54%,59% 57.2%,72.8% 57.2%,73.9% 55.2%,75.8% 59.5%,79.5% 59.5%,79.8% 57.1%,74.6% 43%,69.4% 41%,64.9% 42.1%,64.5% 44.2%,64.9% 46.7%,64.4% 48%,63.7% 47.7%,63.1% 45.7%,62.7% 43.7%)'},
    {elf:'left',piece:'trousers',label:'第一位的下装',origin:'33% 68%',mask:'polygon(23% 54.6%,43.6% 54.6%,43.6% 68%,41.6% 80.4%,36% 80.4%,33.4% 67.6%,29.2% 80.4%,22.8% 80.4%,23% 66%)'},
    {elf:'right',piece:'trousers',label:'第二位的下装',origin:'65.5% 69%',mask:'polygon(56% 56.1%,76% 56.1%,76% 68%,74.5% 80.4%,69.2% 80.4%,65.7% 68.4%,61.8% 80.4%,56% 80.4%)'},
    {elf:'left',piece:'left-shoe',label:'第一位的左鞋',origin:'25.5% 85%',mask:'polygon(21% 80.4%,30% 80.4%,30% 88%,21% 88%)'},
    {elf:'right',piece:'left-shoe',label:'第二位的左鞋',origin:'58.2% 85%',mask:'polygon(54.4% 80.4%,62% 80.4%,62% 88%,54.4% 88%)'},
    {elf:'left',piece:'right-shoe',label:'第一位的右鞋',origin:'40.5% 85%',mask:'polygon(36.3% 80.4%,46.2% 80.4%,46.2% 88%,36.3% 88%)'},
    {elf:'right',piece:'right-shoe',label:'第二位的右鞋',origin:'73.5% 85%',mask:'polygon(69% 80.4%,77.8% 80.4%,77.8% 88%,69% 88%)'}
  ];
  // Matched crops preserve each full hat, hand and shoe. Normalized coordinates
  // are measured from the final 1536x1024, two-step-per-person atlas.
  const SNEAK_FRAMES=[
    {elf:'left',box:[150/1536,10/1024,400/1536,490/1024],ground:496/1024},
    {elf:'left',box:[918/1536,10/1024,400/1536,490/1024],ground:493/1024},
    {elf:'right',box:[155/1536,528/1024,400/1536,486/1024],ground:1009/1024},
    {elf:'right',box:[923/1536,528/1024,400/1536,486/1024],ground:1007/1024}
  ];

  function fallbackFigure(elf,dressed=false) {
    const x=elf==='left'?204:396;
    const coat=elf==='left'?'#465b43':'#754637',cap=elf==='left'?'#803b33':'#3f5964';
    return `<svg class="${dressed?'el-dress-fallback':'el-base-fallback'}" viewBox="0 0 600 800" preserveAspectRatio="none" aria-hidden="true"><g transform="translate(${x} -184) scale(1 1.417)">
      ${dressed?`<path fill="${cap}" stroke="#d1aa6c" stroke-width="1.2" d="M-42 326Q-33 284 22 263L10 306 42 322 35 335-35 335Z"/>`:''}
      <path fill="#b69a78" d="M-24 323L-45 310-32 346-22 350M24 323L45 310 32 346 22 350"/>
      <path fill="#b49a79" d="M-23 318Q-18 297 0 299Q21 300 25 321L21 351Q14 369 0 370Q-15 367-21 352Z"/>
      <path fill="#8d8c80" d="M-25 317Q-19 294 1 296Q27 298 27 328L18 310-8 314-23 337Z"/>
      <path d="M-15 338Q-8 342-3 338M5 338Q11 342 17 338" fill="none" stroke="#473d37" stroke-width="1.5"/>
      <path fill="${dressed?coat:'#b5aa90'}" stroke="#3f3b32" stroke-width="1.5" d="M-17 368L-36 375-60 442-45 455-24 411-21 487H24L23 410 47 455 61 440 37 375 17 368Z"/>
      <path fill="${dressed?'#4a4435':'#817b69'}" stroke="#33372e" stroke-width="1.2" d="M-21 484H24L31 581 9 584 0 520-8 585-31 582Z"/>
      <path fill="${dressed?'#473125':'#a28f74'}" d="M-31 578L-10 580-9 617-43 621-47 614-29 605Z M10 578L31 579 33 606 49 614 43 621 9 617Z"/>
      ${dressed?'<path d="M0 376V484M-17 480H20" fill="none" stroke="#b69a63" stroke-width="2"/><path d="M-4 397H4M-4 420H4M-4 443H4" stroke="#d5bb79" stroke-width="4"/>':''}
    </g></svg>`;
  }

  function actorMarkup(elf,art) {
    const clip=elf==='left'?'inset(0 50% 0 0)':'inset(0 0 0 50%)';
    return `<div class="el-actor el-actor-${elf}" data-elf="${elf}">
      <div class="el-still-figure">
        ${fallbackFigure(elf)}<img class="el-full-art el-base-art" style="clip-path:${clip}" src="${art.base}" alt="" draggable="false">
        ${ITEMS.map((item,index)=>item.elf!==elf?'':`<div class="el-garment" data-item-index="${index}" data-piece="${item.piece}" data-item-label="${item.label}" style="--el-piece-mask:${item.mask};--el-piece-origin:${item.origin};--el-flight-x:${elf==='left'?'-46%':'46%'};--el-flight-turn:${elf==='left'?'-18deg':'18deg'}">${fallbackFigure(elf,true)}<img class="el-full-art el-clothing-art" src="${art.dressed}" alt="" draggable="false"></div>`).join('')}
        <img class="el-full-art el-awake-art" style="clip-path:${clip}" src="${art.awake}" alt="" draggable="false">
      </div>
    </div>`;
  }

  function runnerFallback(elf) {
    return fallbackFigure(elf,true).replace('class="el-dress-fallback"','class="el-run-fallback"')
      .replace('viewBox="0 0 600 800"',`viewBox="${elf==='left'?124:316} 160 160 550"`);
  }
  function poseMarkup(elf) {
    return SNEAK_FRAMES.map((frame,index)=> {
      if(frame.elf!==elf)return '';
      const [x,y,w,h]=frame.box;
      return `<span class="el-step-pose ${index%2?'el-step-b':'el-step-a'}" data-step-index="${index}" style="--el-step-size:${100/w}% ${100/h}%;--el-step-x:${x/(1-w)*100}%;--el-step-y:${y/(1-h)*100}%;--el-foot-offset:${(y+h-frame.ground)/h*100}%"></span>`;
    }).join('');
  }

  function create({document:doc}) {
    const art=Object.fromEntries(Object.entries(ASSETS).map(([name,path])=>[name,imageUrl(path,doc)]));
    const scene=doc.createElement('div');
    scene.className='story-elves';scene.hidden=true;scene.setAttribute('aria-hidden','true');
    scene.dataset.instance=String(++instances);
    scene.style.setProperty('--el-atlas-image',`url("${art.sneak}")`);
    scene.innerHTML=`<div class="elves-frame"><div class="el-world">
      <div class="el-room-fallback"></div><img class="el-full-art el-workshop-art" src="${art.workshop}" alt="" draggable="false">
      <div class="el-table-shadows"><i class="el-shadow-left"></i><i class="el-shadow-right"></i></div>
      ${actorMarkup('left',art)}${actorMarkup('right',art)}
      <div class="el-runner el-runner-left" data-runner="left"><i class="el-walk-shadow"></i>${runnerFallback('left')}${poseMarkup('left')}</div>
      <div class="el-runner el-runner-right" data-runner="right"><i class="el-walk-shadow"></i>${runnerFallback('right')}${poseMarkup('right')}</div>
      <div class="el-awakening-light"></div><div class="el-frame-shade"></div>
    </div></div>`;
    doc.body.insertBefore(scene,doc.body.firstChild);
    const garments=Array.from(scene.querySelectorAll('.el-garment'));
    const timers=new Set();
    let stage,count=0,generation=0;
    const motion=window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const reduced=()=>Boolean(motion?.matches);
    const phases=['is-ending','is-awake','is-sneaking','is-finished','is-rewinding'];

    function cancelTimers() {
      generation++;timers.forEach(timer=>window.clearTimeout(timer));timers.clear();
    }
    function later(delay,callback) {
      const token=generation;
      const timer=window.setTimeout(()=>{timers.delete(timer);if(token===generation)callback();},delay);
      timers.add(timer);
    }
    function finalPose() {
      scene.classList.remove(...phases);
      if(count===10)scene.classList.add('is-awake','is-sneaking','is-finished');
    }
    function resetExit() {
      cancelTimers();garments.forEach(item=>item.classList.remove('is-arriving'));finalPose();
    }
    function beginEnding() {
      cancelTimers();
      if(reduced()||doc.hidden){finalPose();return 0;}
      scene.classList.remove(...phases);scene.classList.add('is-rewinding');
      void scene.offsetWidth;scene.classList.remove('is-rewinding');scene.classList.add('is-ending');
      later(1000,()=>scene.classList.add('is-awake'));
      later(2600,()=>scene.classList.add('is-sneaking'));
      later(ENDING_MS,()=>scene.classList.add('is-finished'));
      return ENDING_MS;
    }

    function watch(img,className) {
      const ready=()=>scene.classList.toggle(className,Boolean(img.complete&&img.naturalWidth));
      img.addEventListener('load',ready);img.addEventListener('error',()=>{img.hidden=true;ready();});ready();
    }
    watch(scene.querySelector('.el-base-art'),'has-base-art');
    watch(scene.querySelector('.el-clothing-art'),'has-clothing-art');
    watch(scene.querySelector('.el-awake-art'),'has-awake-art');
    const atlas=doc.createElement('img');watch(atlas,'has-sneak-art');
    atlas.addEventListener('load',()=>{
      scene.querySelectorAll('.el-runner').forEach(runner=>{
        const frame=SNEAK_FRAMES.find(part=>part.elf===runner.dataset.runner);
        const [, ,w,h]=frame.box;
        runner.style.setProperty('--el-step-aspect',String(atlas.naturalWidth*w/(atlas.naturalHeight*h)));
      });
    });
    atlas.src=art.sneak;
    scene.querySelectorAll('img').forEach(img=>img.addEventListener('error',()=>{img.hidden=true;}));
    garments.forEach(item=>item.addEventListener('animationend',event=>{
      if(event.target===item&&event.animationName==='el-garment-arrives')item.classList.remove('is-arriving');
    }));

    function render(nextStage,nextCount,animate=false) {
      const switched=stage!==nextStage;
      scene.hidden=nextStage!=='elves';
      if(nextStage!=='elves'){resetExit();stage=nextStage;return;}
      const next=Math.max(0,Math.min(10,Math.floor(Number(nextCount)||0)));
      const previous=count,changed=Boolean(animate&&!switched&&next>previous);
      if(switched||next<previous)resetExit();
      garments.forEach(item=>{
        const index=Number(item.dataset.itemIndex);
        item.classList.toggle('is-worn',index<next);
        if(switched||next!==previous)item.classList.remove('is-arriving');
        if(changed&&index===next-1&&!reduced()&&!doc.hidden){void item.offsetWidth;item.classList.add('is-arriving');}
      });
      count=next;stage=nextStage;scene.dataset.count=String(count);
      scene.classList.toggle('is-complete',count===10);
      if(count===10){
        if(changed)beginEnding();
        else if(switched||previous!==count)finalPose();
      }else if(switched||previous!==count)scene.classList.remove(...phases);
    }
    function playExit(nextStage) {
      if(nextStage!=='elves'||stage!=='elves'||count!==10)return 0;
      return beginEnding();
    }
    doc.addEventListener('visibilitychange',()=>{if(doc.hidden)resetExit();});
    const reduceNow=()=>{if(reduced())resetExit();};
    if(typeof motion?.addEventListener==='function')motion.addEventListener('change',reduceNow);
    else motion?.addListener?.(reduceNow);
    return {render,playExit,resetExit,arrivalTime:(nextStage='elves')=>nextStage==='elves'&&!reduced()&&!doc.hidden?ENDING_MS:0};
  }

  window.HanziElvesStory=Object.freeze({create});
})(window);
