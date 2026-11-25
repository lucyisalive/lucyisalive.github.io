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
  const VINES = [
    {side:'left', path:'M116 782 C82 690 193 647 144 558 S98 367 176 268', flower:[176,268], leaves:[[126,702,-48],[145,647,30],[145,565,-32],[119,486,-58],[127,410,22],[148,335,-48]]},
    {side:'right',path:'M505 774 C534 686 418 626 464 548 S504 362 423 254',flower:[423,254],leaves:[[484,702,44],[462,636,-35],[469,562,32],[479,478,52],[473,395,-25],[448,324,48]]},
    {side:'left', path:'M91 726 C182 680 86 554 155 493 S202 401 161 369',flower:[161,369],leaves:[[123,686,50],[131,624,-45],[121,561,-50],[153,497,30],[182,441,-20],[175,390,-48]]},
    {side:'right',path:'M517 726 C433 655 516 562 449 495 S412 428 446 388',flower:[446,388],leaves:[[488,683,-45],[478,614,48],[485,552,40],[446,495,-28],[423,445,25],[436,410,45]]},
    {side:'left', path:'M128 792 C202 728 95 673 180 612 S225 533 169 498',flower:[169,498],leaves:[[157,756,48],[173,712,-25],[151,670,-55],[183,609,42],[208,563,-25],[193,526,-45]]},
    {side:'right',path:'M487 791 C418 725 511 668 431 603 S398 541 443 508',flower:[443,508],leaves:[[459,751,-38],[447,704,38],[464,655,45],[429,602,-38],[413,559,25],[429,529,48]]},
    {side:'left', path:'M89 787 C149 748 174 769 197 710 S202 668 215 645',flower:[215,645],leaves:[[139,759,-32],[173,747,34],[190,717,-35],[199,682,40]]},
    {side:'right',path:'M512 790 C461 742 427 780 401 717 S407 682 388 655',flower:[388,655],leaves:[[467,761,42],[435,750,-42],[408,721,35],[401,685,-42]]},
    {side:'left', path:'M96 639 C92 528 161 535 173 435 S203 341 237 333',flower:[237,333],leaves:[[109,569,-45],[152,517,35],[172,449,-40],[181,392,30],[210,346,-30]]},
    {side:'right',path:'M516 652 C510 551 445 536 436 445 S404 369 368 366',flower:[368,366],leaves:[[494,582,43],[454,526,-40],[437,458,38],[425,404,-35],[395,374,38]]}
  ];

  const FACE_BRANCHES = {
    left:[
      'M-18 152C2 111 42 148 75 106S144 80 152 37',
      'M-12 45C34 17 47 76 91 58S137 74 177 106',
      'M17 176C14 128 67 127 82 84S106 19 137 12',
      'M-19 93C25 84 21 47 66 30S92 59 116 45'
    ],
    right:[
      'M256 146C219 126 229 79 185 88S125 132 103 95',
      'M254 37C218 62 202 27 167 48S130 66 93 41',
      'M217 180C225 143 178 159 171 119S146 62 113 20',
      'M255 102C211 113 202 69 187 42S145 22 145 7'
    ]
  };

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

  function vineMarkup(id,side,art) {
    return VINES.map((vine,index)=> {
      if(vine.side!==side)return '';
      const [x,y]=vine.flower;
      return `<g class="rb-vine" data-vine-index="${index}">
        <path class="rb-vine-shadow" d="${vine.path}"/><path class="rb-vine-stem" d="${vine.path}"/>
        ${vine.leaves.map(([lx,ly,a],i)=>leaf(art,lx,ly,a,.72+i%3*.12)).join('')}
        ${vine.leaves.filter((_,i)=>i%2===0).map(([lx,ly],i)=>`<path class="rb-thorn" d="M${lx} ${ly}l${i%2?-10:10}-16 2 20Z"/>`).join('')}
        <g class="rb-flower" data-rose-index="${index}" transform="translate(${x} ${y}) rotate(${index%2?14:-13})">
          <g class="rb-rose-bud"><path d="M-9 9C-20-5-14-23-5-26C6-33 18-18 13-7L7 10Z"/><path d="M-12 5L-20-10-6-4 0 14 8-4 20-11 11 9 0 19Z"/><path class="rb-bud-crease" d="M-4-20Q7-13 2 9M-10-13Q-2-9-3 6"/></g>
          <g class="rb-rose-open"><use class="rb-rose-vector" href="#${id}-rose"/><image class="rb-rose-real" href="${art.bloom}" x="-49" y="-49" width="98" height="98" preserveAspectRatio="xMidYMid meet"/></g>
        </g>
      </g>`;
    }).join('');
  }

  function faceVines(side,art) {
    // Dense interlaced dead leaves cover the face until the tenth flower has
    // opened. They stay in place while individual branches regain their green.
    const left=side==='left';
    return Array.from({length:5},(_,i)=> {
      const x=left?28+i*22:212-i*22,y=25+i*27,index=i*2+(left?0:1);
      const curtain=Array.from({length:6},(_,j)=> {
        const offset=Math.sin(i*2.7+j*1.8)*12,drift=Math.cos(i*3+j*1.9)*9;
        return leaf(art,(left?15+j*22:225-j*22)+drift,36+i*25+offset,(left?65:-65)+Math.cos(i+j*2)*24,.92+(i+j)%3*.12);
      }).join('');
      const path=FACE_BRANCHES[side][i];
      return `<g class="rb-face-branch" data-vine-index="${index}">${curtain}${path?`<path class="rb-vine-shadow" d="${path}"/><path class="rb-vine-stem" d="${path}"/>`:''}${leaf(art,x,y+24,left?65:-65,1.1)}${leaf(art,x+(left?34:-34),y+26,left?115:-115,.95)}${leaf(art,x+(left?60:-60),y+20,left?65:-65,.8)}</g>`;
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
      <svg class="rb-vines" viewBox="0 0 600 800" preserveAspectRatio="none" aria-hidden="true">${roseDefinitions(id)}<g class="rb-vines-left">${vineMarkup(id,'left',art)}</g><g class="rb-vines-right">${vineMarkup(id,'right',art)}</g></svg>
      <svg class="rb-face-vines" viewBox="0 0 240 170" preserveAspectRatio="none" aria-hidden="true"><g class="rb-face-left">${faceVines('left',art)}</g><g class="rb-face-right">${faceVines('right',art)}</g></svg>
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
