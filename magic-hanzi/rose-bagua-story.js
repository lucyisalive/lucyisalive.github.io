(function (window) {
  'use strict';

  const DURATION = Object.freeze({rose: 3800, bagua: 5200});
  // Keep one discoverable literal per asset for the offline page builder.
  const ASSETS = Object.freeze({
    sleeping: 'assets/story/rose-crypt-v1.webp',
    awake: 'assets/story/rose-awake-face-v1.webp',
    bloom: 'assets/story/rose-bloom-v1.webp',
    leaf: 'assets/story/rose-leaf-v1.webp',
    doorClosed: 'assets/story/bagua-door-closed-v1.webp',
    doorOpen: 'assets/story/bagua-door-open-v1.webp'
  });
  const imageBlobUrls = new Map();

  function imageUrl(source,doc) {
    const src=String(source),comma=src.indexOf(',');
    const header=comma<0?'':src.slice(0,comma);
    if(!/^data:image\/[^,]+;base64$/i.test(header))return src;
    if(imageBlobUrls.has(src))return imageBlobUrls.get(src);
    try {
      const view=doc.defaultView||window;
      const decode=view.atob||window.atob;
      const BlobType=view.Blob||window.Blob;
      const objectUrls=view.URL||window.URL;
      if(typeof decode!=='function'||typeof BlobType!=='function'||typeof objectUrls?.createObjectURL!=='function')return src;
      const binary=decode.call(view,src.slice(comma+1));
      const bytes=new Uint8Array(binary.length);
      for(let index=0;index<binary.length;index++)bytes[index]=binary.charCodeAt(index);
      const blob=new BlobType([bytes],{type:header.slice(5).split(';')[0]});
      const url=objectUrls.createObjectURL(blob);
      // These URLs serve the page-long scene instances. Sharing one short URL
      // prevents every leaf, flower and door strip from copying a data URI.
      imageBlobUrls.set(src,url);
      return url;
    } catch (_) { return src; }
  }

  let instance = 0;
  // Every one of the ten long stems travels across the open coffin and the
  // sleeper. There is one shared tangle over the whole body, no face overlay.
  const VINES = [
    {side:'left',start:[92,758],curves:[[110,637,460,604,391,489],[322,374,156,342,400,258]]},
    {side:'right',start:[505,774],curves:[[487,636,138,629,215,498],[291,368,449,345,204,270]]},
    {side:'left',start:[76,642],curves:[[229,738,459,661,373,547],[287,433,107,388,421,365]]},
    {side:'right',start:[517,647],curves:[[369,730,126,672,224,557],[322,442,484,399,183,376]]},
    {side:'left',start:[115,512],curves:[[300,417,492,487,372,609],[252,731,126,743,409,697]]},
    {side:'right',start:[490,515],curves:[[310,425,104,477,223,607],[342,737,480,741,191,700]]},
    {side:'left',start:[135,248],curves:[[245,290,388,220,442,291],[485,460,130,486,416,540]]},
    {side:'right',start:[468,230],curves:[[355,312,190,228,154,302],[105,467,487,495,183,547]]},
    {side:'left',start:[140,365],curves:[[405,389,150,203,425,245],[506,377,188,588,391,445]]},
    {side:'right',start:[463,362],curves:[[206,393,459,209,177,251],[100,384,419,593,209,448]]}
  ].map((vine,index)=> {
    const leaves=[];
    let start=vine.start;
    for(const curve of vine.curves) {
      const [x1,y1,x2,y2,x3,y3]=curve;
      const estimate=(Math.hypot(x1-start[0],y1-start[1])+Math.hypot(x2-x1,y2-y1)+Math.hypot(x3-x2,y3-y2))*.72;
      const steps=Math.max(6,Math.round(estimate/27));
      for(let step=1;step<=steps;step++) {
        const t=step/(steps+1),u=1-t;
        const x=u*u*u*start[0]+3*u*u*t*x1+3*u*t*t*x2+t*t*t*x3;
        const y=u*u*u*start[1]+3*u*u*t*y1+3*u*t*t*y2+t*t*t*y3;
        const dx=3*u*u*(x1-start[0])+6*u*t*(x2-x1)+3*t*t*(x3-x2);
        const dy=3*u*u*(y1-start[1])+6*u*t*(y2-y1)+3*t*t*(y3-y2);
        const angle=Math.atan2(dy,dx)*180/Math.PI+((step+index)%2?140:-30);
        leaves.push([x.toFixed(2),y.toFixed(2),angle.toFixed(2),.65+(step+index)%4*.07]);
      }
      start=[x3,y3];
    }
    return {...vine,path:'M'+vine.start.join(' ')+vine.curves.map(curve=>'C'+curve.join(' ')).join(' '),flower:start,leaves};
  });

  // Lines are stored from the outside/top line to the inside/bottom line.
  // Each of the eight standard trigrams occurs exactly once. Their lighting
  // order is a visual progress sequence, with no divination interpretation.
  const TRIGRAMS = [
    {name:'乾',lines:[1,1,1]}, {name:'兑',lines:[0,1,1]},
    {name:'离',lines:[1,0,1]}, {name:'震',lines:[0,0,1]},
    {name:'坤',lines:[0,0,0]}, {name:'艮',lines:[1,0,0]},
    {name:'坎',lines:[0,1,0]}, {name:'巽',lines:[1,1,0]}
  ];

  function leaf(art,x,y,angle,scale=1) {
    return `<g class="rb-leaf" transform="translate(${x} ${y}) rotate(${angle}) scale(${scale})"><g class="rb-leaf-vector"><path d="M0 0C-8-1-16-6-20-14L-23-15-21-19-24-21-21-25-23-28-20-30-21-33-17-40-13-36-9-36-8-32-4-31-4-27 0-25-2-21 2-18-1-14 2-12 0-8 2-5Z"/><path class="rb-leaf-sheen" d="M0 0Q-12-19-17-39Q-3-29-2-18T0 0Z"/><path class="rb-leaf-vein" d="M0 0Q-12-19-17-37M-6-11L-18-14M-9-18L-3-25M-13-27L-21-29"/></g><image class="rb-leaf-real" href="${art.leaf}" x="-26" y="-55" width="52" height="55" transform="rotate(-23)" preserveAspectRatio="xMidYMid meet"/></g>`;
  }

  function roseDefinitions(id) {
    return `<defs>
      <radialGradient id="${id}-petal" cx="35%" cy="24%" r="83%"><stop stop-color="#e8a1a1"/><stop offset=".34" stop-color="#bc4157"/><stop offset=".77" stop-color="#741a33"/><stop offset="1" stop-color="#2d0e20"/></radialGradient>
      <linearGradient id="${id}-inner" x2=".8" y2="1"><stop stop-color="#e78e94"/><stop offset=".4" stop-color="#b42a45"/><stop offset="1" stop-color="#4b1229"/></linearGradient>
      <filter id="${id}-rose-shadow" x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="1" dy="4" stdDeviation="3" flood-color="#100c11" flood-opacity=".8"/></filter>
      <g id="${id}-rose" filter="url(#${id}-rose-shadow)">
        ${Array.from({length:7},(_,i)=>`<path transform="rotate(${i*51.43})" fill="url(#${id}-petal)" stroke="#d1747c" stroke-opacity=".3" stroke-width=".8" d="M-9 8C-35 7-48-10-41-27C-36-39-21-45-12-39C-8-52 14-46 23-34C39-18 19 4-9 8Z"/>`).join('')}
        ${Array.from({length:5},(_,i)=>`<path transform="rotate(${i*72+24})" fill="url(#${id}-inner)" stroke="#eb9a9b" stroke-opacity=".34" stroke-width=".65" d="M-11 9C-31-1-30-22-17-30C-9-35 4-24 9-29C24-32 29-9 15 1Q5 11-11 9Z"/>`).join('')}
        <path fill="#68142c" d="M-9 15C-23 7-18-14-7-18C5-24 21-9 17 4C12 16 2 21-9 15Z"/>
        <path fill="url(#${id}-inner)" stroke="#ec9a9c" stroke-width="1" d="M-12 9C-22-3-5-18 8-10C15-6 7 0 0-1C-8-3-11 6-5 10C1 15 12 6 10 0C21 10 7 23-5 17Z"/>
        <path d="M-4 6Q3-3 8 3Q12 9 3 12" fill="none" stroke="#e78c95" stroke-width="1.6" stroke-linecap="round"/>
      </g>
    </defs>`;
  }

  function vineMarkup(side,art) {
    return VINES.map((vine,index)=> {
      if(vine.side!==side)return '';
      return `<g class="rb-vine" data-vine-index="${index}">
        <path class="rb-vine-shadow" d="${vine.path}"/><path class="rb-vine-stem" d="${vine.path}"/>
        ${vine.leaves.map(([lx,ly,a,scale])=>leaf(art,lx,ly,a,scale)).join('')}
        ${vine.leaves.filter((_,i)=>i%3===0).map(([lx,ly],i)=>`<path class="rb-thorn" d="M${lx} ${ly}l${i%2?-3:3}-5 1 7Z"/>`).join('')}
      </g>`;
    }).join('');
  }

  function flowerMarkup(id,side,art) {
    return VINES.map((vine,index)=> {
      if(vine.side!==side)return '';
      const [x,y]=vine.flower;
      return `<g class="rb-flower" data-rose-index="${index}" transform="translate(${x} ${y}) rotate(${index%2?14:-13})">
        <g class="rb-rose-bud"><path d="M-9 9C-20-5-14-23-5-26C6-33 18-18 13-7L7 10Z"/><path d="M-12 5L-20-10-6-4 0 14 8-4 20-11 11 9 0 19Z"/><path class="rb-bud-crease" d="M-4-20Q7-13 2 9M-10-13Q-2-9-3 6"/></g>
        <g class="rb-rose-open"><use class="rb-rose-vector" href="#${id}-rose"/><image class="rb-rose-real" href="${art.bloom}" x="-49" y="-49" width="98" height="98" preserveAspectRatio="xMidYMid meet"/></g>
      </g>`;
    }).join('');
  }

  function sealMarkup(id) {
    const lineMarkup = (solid,y) => solid
      ? `<path d="M-39 ${y}H39"/>`
      : `<path d="M-39 ${y}H-10M10 ${y}H39"/>`;
    return `<svg class="rb-seal" viewBox="0 0 600 600" aria-hidden="true" style="--rb-yang-fill:url(#${id}-yang);--rb-yin-fill:url(#${id}-yin)">
      <defs><radialGradient id="${id}-yang"><stop stop-color="#fff4c6"/><stop offset="1" stop-color="#bd9e53"/></radialGradient><radialGradient id="${id}-yin"><stop stop-color="#455752"/><stop offset="1" stop-color="#122c2d"/></radialGradient></defs>
      <circle class="rb-seal-rim rb-seal-rim-outer" cx="300" cy="300" r="284"/>
      <circle class="rb-seal-rim" cx="300" cy="300" r="270"/>
      <path class="rb-seal-octagon" d="M188 29H412L571 188V412L412 571H188L29 412V188Z"/>
      <circle class="rb-seal-rim rb-seal-inner-rim" cx="300" cy="300" r="129"/>
      ${TRIGRAMS.map((trigram,index)=> {
        const angle=index*45,radian=angle*Math.PI/180;
        const x=300+Math.sin(radian)*205,y=300-Math.cos(radian)*205;
        return `<g class="rb-trigram rb-seal-unit" data-seal-index="${index}" data-trigram="${trigram.name}" transform="translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${angle})">${trigram.lines.map((line,i)=>lineMarkup(line,-24+i*24)).join('')}</g>`;
      }).join('')}
      <g class="rb-taiji rb-taiji-yang rb-seal-unit" data-seal-index="8"><path d="M300 206A94 94 0 0 1 300 394A47 47 0 0 1 300 300A47 47 0 0 0 300 206Z"/><circle cx="300" cy="347" r="12"/></g>
      <g class="rb-taiji rb-taiji-yin rb-seal-unit" data-seal-index="9"><path d="M300 206A94 94 0 0 0 300 394A47 47 0 0 1 300 300A47 47 0 0 0 300 206Z"/><circle cx="300" cy="253" r="12"/></g>
      <circle class="rb-seal-centre-rim" cx="300" cy="300" r="96"/>
    </svg>`;
  }

  function create({document: doc}) {
    const id=`rb-story-${++instance}`;
    const art=Object.fromEntries(Object.entries(ASSETS).map(([key,source])=>[key,imageUrl(source,doc)]));
    const rose=doc.createElement('div');
    rose.className='story-rose';
    rose.hidden=true;
    rose.setAttribute('aria-hidden','true');
    rose.innerHTML=`<div class="rb-frame rb-rose-frame"><div class="rb-rose-world">
      <div class="rb-rose-fallback"></div><img class="rb-scene-art rb-rose-sleeping" src="${art.sleeping}" alt="" draggable="false"><img class="rb-scene-art rb-rose-awake" src="${art.awake}" alt="" draggable="false">
      <div class="rb-rose-lantern-light"></div>
      <svg class="rb-vines" viewBox="0 0 600 800" preserveAspectRatio="none" aria-hidden="true">${roseDefinitions(id)}<g class="rb-vines-left">${vineMarkup('left',art)}</g><g class="rb-vines-right">${vineMarkup('right',art)}</g><g class="rb-vines-left rb-flower-layer">${flowerMarkup(id,'left',art)}</g><g class="rb-vines-right rb-flower-layer">${flowerMarkup(id,'right',art)}</g></svg>
      <div class="rb-rose-pollen">${Array.from({length:14},(_,i)=>`<i style="--rb-particle-x:${15+i*37%72}%;--rb-particle-y:${28+i*19%57}%;--rb-particle-delay:${i*.07}s"></i>`).join('')}</div>
      <div class="rb-rose-air"></div><div class="rb-frame-shade"></div>
    </div></div>`;

    const bagua=doc.createElement('div');
    bagua.className='story-bagua';
    bagua.hidden=true;
    bagua.setAttribute('aria-hidden','true');
    // Both leaves are clipped from the same full, closed-door composition.
    // Their symbols share the same coordinate system and move with the stone.
    bagua.innerHTML=`<div class="rb-frame rb-bagua-frame"><div class="rb-bagua-world">
      <div class="rb-bagua-vista"><img class="rb-scene-art" src="${art.doorOpen}" alt="" draggable="false"><div class="rb-bagua-inner-fog"></div></div>
      <div class="rb-door-leaf rb-door-left"><img class="rb-scene-art" src="${art.doorClosed}" alt="" draggable="false">${sealMarkup(id+'-left')}</div>
      <div class="rb-door-leaf rb-door-right"><img class="rb-scene-art" src="${art.doorClosed}" alt="" draggable="false">${sealMarkup(id+'-right')}</div>
      ${['top','bottom','left','right'].map(side=>`<div class="rb-door-surround rb-door-surround-${side}"><img class="rb-scene-art" src="${art.doorClosed}" alt="" draggable="false"></div>`).join('')}
      <div class="rb-door-seam"></div><div class="rb-door-dust"></div><div class="rb-door-floor-light"></div><div class="rb-frame-shade"></div>
    </div></div>`;
    doc.body.insertBefore(rose,doc.body.firstChild);
    doc.body.insertBefore(bagua,doc.body.firstChild);

    const scenes={rose,bagua},counts={rose:0,bagua:0};
    const timers=new Set();
    let currentStage, generation=0;
    const reduced=()=>Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
    const phaseClasses=['is-ending','is-vines-open','is-awake','is-door-opening','is-finished','is-rewinding'];
    const vines=Array.from(rose.querySelectorAll('[data-vine-index]'));
    const flowers=Array.from(rose.querySelectorAll('[data-rose-index]'));
    const sealUnits=Array.from(bagua.querySelectorAll('[data-seal-index]'));

    function cancelTimers() {
      generation++;
      timers.forEach(timer=>window.clearTimeout(timer));
      timers.clear();
    }
    function later(delay,callback) {
      const ticket=generation;
      const timer=window.setTimeout(()=> {
        timers.delete(timer);
        if(ticket===generation)callback();
      },delay);
      timers.add(timer);
    }
    function clearPhases(scene) { scene.classList.remove(...phaseClasses); }
    function finalPose(stage) {
      const scene=scenes[stage];
      clearPhases(scene);
      if(counts[stage]!==10)return;
      scene.classList.add('is-finished');
      if(stage==='rose')scene.classList.add('is-vines-open','is-awake');
      else scene.classList.add('is-door-opening');
    }
    function resetExit() {
      cancelTimers();
      Object.keys(scenes).forEach(finalPose);
    }
    function beginEnding(stage) {
      cancelTimers();
      const scene=scenes[stage];
      if(reduced()) { finalPose(stage);return 0; }
      clearPhases(scene);
      scene.classList.add('is-rewinding');
      // Replays return to the closed/sleeping pose before starting a new ending.
      void scene.offsetWidth;
      scene.classList.remove('is-rewinding');
      scene.classList.add('is-ending');
      if(stage==='rose') {
        later(1300,()=>scene.classList.add('is-vines-open'));
        later(2450,()=>scene.classList.add('is-awake'));
      } else {
        later(1350,()=> {
          scene.classList.add('is-door-opening');
          try { doc.defaultView?.HanziGameFeedback?.playStoneDoor?.(); } catch (_) { /* Decorative audio never delays the door or learning. */ }
        });
      }
      later(DURATION[stage],()=>scene.classList.add('is-finished'));
      return DURATION[stage];
    }

    function artworkState(img,scene,className) {
      const update=()=>scene.classList.toggle(className,Boolean(img.complete && img.naturalWidth));
      img.addEventListener('load',update);
      img.addEventListener('error',()=> {img.hidden=true;update();});
      update();
    }
    artworkState(rose.querySelector('.rb-rose-awake'),rose,'has-awake-art');
    const bloom=doc.createElement('img');
    artworkState(bloom,rose,'has-bloom-art');
    bloom.src=art.bloom;
    const realLeaf=doc.createElement('img');
    artworkState(realLeaf,rose,'has-leaf-art');
    realLeaf.src=art.leaf;
    // Failed artwork is decorative: hide broken-image glyphs and retain all
    // controls, the SVG progress, and the CSS stone/fog fallback underneath.
    [...rose.querySelectorAll('.rb-scene-art'),...bagua.querySelectorAll('.rb-scene-art')].forEach(img=> {
      img.addEventListener('error',()=> {img.hidden=true;});
    });

    function render(stage,count,animate=false) {
      const switching=currentStage!==stage;
      rose.hidden=stage!=='rose';
      bagua.hidden=stage!=='bagua';
      if(!scenes[stage]) { resetExit();currentStage=stage;return; }
      const next=Math.max(0,Math.min(10,Math.floor(Number(count)||0)));
      const previous=counts[stage];
      const changed=Boolean(animate && !switching && next>previous);
      if(switching || next<previous)resetExit();
      const scene=scenes[stage];
      scene.dataset.count=String(next);
      scene.style.setProperty('--rb-progress',String(next/10));
      scene.classList.toggle('is-complete',next===10);
      if(stage==='rose') {
        vines.forEach(vine=>vine.classList.toggle('is-restored',Number(vine.dataset.vineIndex)<next));
        flowers.forEach(flower=> {
          const index=Number(flower.dataset.roseIndex);
          flower.classList.toggle('is-bloomed',index<next);
          if(changed || switching || next!==previous)flower.classList.remove('is-new');
          if(changed && index===next-1) {void flower.getBoundingClientRect();flower.classList.add('is-new');}
        });
      } else {
        sealUnits.forEach(unit=> {
          const index=Number(unit.dataset.sealIndex);
          unit.classList.toggle('is-lit',index<next);
          if(changed || switching || next!==previous)unit.classList.remove('is-new');
          if(changed && index===next-1) {void unit.getBoundingClientRect();unit.classList.add('is-new');}
        });
      }
      counts[stage]=next;
      currentStage=stage;
      if(next===10) {
        if(changed)beginEnding(stage);
        else if(switching || previous!==next)finalPose(stage);
      } else if(switching || next!==previous)clearPhases(scene);
    }

    function playExit(stage) {
      if(!scenes[stage] || currentStage!==stage || counts[stage]!==10)return 0;
      return beginEnding(stage);
    }
    return {render,playExit,resetExit,arrivalTime:stage=>reduced()?0:(DURATION[stage]||0)};
  }

  window.HanziRoseBaguaStory=Object.freeze({create});
})(window);
