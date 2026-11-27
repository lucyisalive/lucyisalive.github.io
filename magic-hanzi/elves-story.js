(function (window) {
  'use strict';

  const ENDING_MS=8800;
  // One source literal per image keeps offline packages small. All repeated
  // costumes and atlas poses share the same cached short Blob URL.
  const ASSETS=Object.freeze({
    workshop:'assets/story/elves-tailor-workshop-v1.webp',
    base:'assets/story/elves-puppet-base-v2.webp',
    dressed:'assets/story/elves-puppet-dressed-v2.webp',
    awake:'assets/story/elves-puppet-awake-v2.webp',
    sneak:'assets/story/elves-puppet-sneak-atlas-v2.webp'
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
    {elf:'left',piece:'hat',label:'男木偶的帽子',origin:'32% 24%',mask:'polygon(17% 17%,47% 17%,47% 30%,40% 30%,39% 26%,25% 26%,24% 30%,17% 30%)'},
    {elf:'right',piece:'hat',label:'女木偶的帽子',origin:'68% 25%',mask:'polygon(53% 18%,83% 18%,83% 35%,78% 36%,76% 31%,75% 27%,61% 27%,59% 35%,53% 35%)'},
    {elf:'left',piece:'jacket',label:'男木偶的外衣',origin:'32% 50%',mask:'polygon(19% 39.5%,44% 39.5%,49% 57%,46% 59%,42% 57%,42% 59.5%,23% 59.5%,22% 56%,18% 59%,14% 57%)'},
    {elf:'right',piece:'jacket',label:'女木偶的外衣',origin:'68% 50%',mask:'polygon(54% 40%,81% 40%,85% 58%,82% 59%,78% 58%,76% 52%,78% 59.5%,57% 59.5%,58% 53%,54% 59%,51% 58%)'},
    {elf:'left',piece:'trousers',label:'男木偶的裤子',origin:'32% 67%',mask:'polygon(20% 58%,44% 58%,44% 74%,20% 74%)'},
    {elf:'right',piece:'trousers',label:'女木偶的裤子',origin:'68% 67%',mask:'polygon(56% 58%,80% 58%,80% 74%,56% 74%)'},
    {elf:'left',piece:'left-shoe',label:'男木偶的左鞋',origin:'25% 90%',mask:'polygon(20% 85.5%,30.8% 85.5%,30.8% 94%,20% 94%)'},
    {elf:'right',piece:'left-shoe',label:'女木偶的左鞋',origin:'61% 90%',mask:'polygon(56.5% 85.5%,66.6% 85.5%,66.6% 94%,56.5% 94%)'},
    {elf:'left',piece:'right-shoe',label:'男木偶的右鞋',origin:'39% 90%',mask:'polygon(32% 85.5%,44% 85.5%,44% 94%,32% 94%)'},
    {elf:'right',piece:'right-shoe',label:'女木偶的右鞋',origin:'74% 90%',mask:'polygon(68% 85.5%,80% 85.5%,80% 94%,68% 94%)'}
  ];
  // Four complete wood-puppet poses, measured from the final native atlas.
  // Ground offsets keep the planted toe at the same table perspective point.
  const SNEAK_FRAMES=[
    {elf:'left',box:[180/1536,0,400/1536,496/1024],ground:489/1024},
    {elf:'left',box:[920/1536,0,400/1536,496/1024],ground:484/1024},
    {elf:'right',box:[180/1536,512/1024,400/1536,500/1024],ground:1003/1024},
    {elf:'right',box:[924/1536,512/1024,400/1536,500/1024],ground:1003/1024}
  ];

  function fallbackFigure(elf,dressed=false) {
    const x=elf==='left'?204:396,wood='#c19459';
    const coat=elf==='left'?'#38523b':'#813e43',cap=elf==='left'?'#415a3d':'#8b3e4a';
    return `<svg class="${dressed?'el-dress-fallback':'el-base-fallback'}" viewBox="0 0 600 800" preserveAspectRatio="none" aria-hidden="true"><g transform="translate(${x} 0)">
      <path d="M-23 591L-26 701M23 591L26 701M-35 447L-66 551M35 447L66 551" fill="none" stroke="${wood}" stroke-width="22" stroke-linecap="round"/>
      ${[-1,1].map(side=>`<circle cx="${side*25}" cy="602" r="14" fill="${wood}" stroke="#7a562f"/><circle cx="${side*55}" cy="511" r="12" fill="${wood}" stroke="#7a562f"/>`).join('')}
      <path d="M-42 430Q0 407 42 430L35 542H-35Z" fill="${dressed?coat:'#d7cbb2'}" stroke="#705c3d"/>
      <path d="M-35 540H35L39 589H8L0 559-8 589H-39Z" fill="${dressed?(elf==='left'?'#9a582f':'#56716b'):'#d7cbb2'}"/>
      <path d="M-38 695Q-55 705-48 713H-11V695M11 695V713H48Q55 705 38 695" fill="${dressed?'#51352c':wood}"/>
      <path d="M-44 350L-61 334-50 374M44 350L61 334 50 374" fill="${wood}" stroke="#805d36"/>
      <ellipse cx="0" cy="355" rx="46" ry="50" fill="${wood}" stroke="#805d36"/>
      <path d="M-41 337Q-42 297 0 301Q46 304 43 340L17 323-10 332-28 322Z" fill="#7c502a"/>
      <path d="M-25 357Q-16 363-7 357M7 357Q16 363 25 357M-15 379Q0 389 15 379" fill="none" stroke="#55372b" stroke-width="2.3"/>
      ${elf==='right'?'<path d="M38 343Q66 390 38 439" stroke="#7c502a" stroke-width="13" fill="none"/>':''}
      ${dressed?`<path d="M-44 325Q-21 282 28 286L45 329Z" fill="${cap}"/>`:''}
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
