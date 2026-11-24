(function (window) {
  'use strict';

  const CRACKS = [
    [[305,27],[285,75],[312,119],[296,170],[322,204]],
    [[224,142],[242,211],[207,257],[180,304],[146,325]],
    [[377,172],[396,235],[381,290],[414,354],[436,424]],
    [[309,197],[283,267],[309,329],[286,393],[317,438]],
    [[371,354],[350,428],[380,491],[355,563],[389,621]],
    [[210,390],[230,469],[199,529],[224,593],[194,653]],
    [[302,443],[284,519],[311,583],[282,651],[306,711]],
    [[425,584],[398,650],[424,712],[391,779],[408,847]],
    [[183,626],[207,692],[181,750],[208,813],[190,872]],
    [[310,704],[282,756],[308,809],[286,857],[311,890]],
  ];

  // The artwork supplies the frozen human figure. This canvas removes patches
  // of that actual shell and clips it to the original person's alpha silhouette;
  // it never constructs an ice block around the person.
  function drawIce(canvas, count, shell, silhouette) {
    const ctx = canvas.getContext?.('2d');
    if (!ctx) return;
    const width = canvas.width = shell?.naturalWidth || 1024;
    const height = canvas.height = shell?.naturalHeight || 1536;
    ctx.clearRect(0, 0, width, height);
    if (!shell?.naturalWidth || shell.complete === false ||
        !silhouette?.naturalWidth || silhouette.complete === false) return;
    ctx.drawImage(shell,0,0,width,height);
    if (count) {
      ctx.save();
      ctx.scale(width/600,height/900);
      // Expose the matching, closed-eye human underneath a little at each pass.
      ctx.globalCompositeOperation = 'destination-out';
      for (let index=0; index<count; index++) {
        const [x,y]=CRACKS[index][2];
        const radius = 36+count*5;
        const melt=ctx.createRadialGradient(x,y,0,x,y,radius);
        melt.addColorStop(0,'#000000ee');
        melt.addColorStop(.5,'#000000b0');
        melt.addColorStop(1,'#00000000');
        ctx.fillStyle=melt;
        ctx.fillRect(x-radius,y-radius,radius*2,radius*2);
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (let index=0; index<count; index++) {
        ctx.beginPath();
        const path=CRACKS[index];
        path.forEach(([x,y], i) => i ? ctx.lineTo(x,y) : ctx.moveTo(x,y));
        ctx.lineWidth=3.4;
        ctx.strokeStyle='#163b4cb0';
        ctx.stroke();
        ctx.lineWidth=1.1;
        ctx.strokeStyle='#e7ffffe6';
        ctx.stroke();
        for (let branch=1; branch<path.length-1; branch++) {
          const [x,y]=path[branch];
          const side=(branch+index)%2 ? 1 : -1;
          ctx.beginPath();
          ctx.moveTo(x,y);
          ctx.lineTo(x+side*26,y+16);
          ctx.lineTo(x+side*42,y+45);
          ctx.lineWidth=.7;
          ctx.strokeStyle='#d8f8fac0';
          ctx.stroke();
        }
      }
      ctx.restore();
    }
    // Use the original person as the silhouette even at zero progress. The
    // generated frost material may include a faint glow outside that outline.
    ctx.save();
    ctx.globalCompositeOperation='destination-in';
    ctx.drawImage(silhouette,0,0,width,height);
    ctx.restore();
  }

// Insert inside the ice/armor scene IIFE. Coordinates are the existing 900x1200
// armor stage. One binding is one learning-progress unit, although it has
// independently layered wall, rear-loop, and front-loop canvases.
const ARMOR_BINDINGS = [
  {id:'left-upper-arm', wall:[-28,193], centre:[365,423], radius:[31,12], turn:-.18},
  {id:'right-upper-arm',wall:[928,193], centre:[535,423], radius:[31,12], turn:.18},
  {id:'left-forearm',  wall:[-25,425], centre:[351,570], radius:[22,9], turn:-.12},
  {id:'right-forearm', wall:[925,425], centre:[549,570], radius:[22,9], turn:.12},
  {id:'upper-waist',   wall:[-25,705], centre:[450,536], radius:[67,14],turn:.11},
  {id:'lower-waist',   wall:[925,705], centre:[450,570], radius:[65,14],turn:-.11},
  {id:'chest-diagonal-left', wall:[144,-25],centre:[450,472],radius:[84,17],turn:.73},
  {id:'chest-diagonal-right',wall:[756,-25],centre:[450,472],radius:[84,17],turn:-.73},
  {id:'left-shin',     wall:[84,1225], centre:[411,803], radius:[25,10],turn:-.08},
  {id:'right-shin',    wall:[816,1225],centre:[489,803], radius:[25,10],turn:.08},
];

function armorBindingMarkup() {
  return ARMOR_BINDINGS.map((binding,index)=>
    `<div class="ia-chain" data-binding="${binding.id}" data-binding-index="${index}" style="--chain-direction:${index%2?-1:1};--chain-turn:${index%2?-24:24}deg">`+
      '<canvas class="ia-chain-wall"></canvas><canvas class="ia-chain-back"></canvas>'+
      '<canvas class="ia-chain-front"></canvas><i class="ia-chain-spark"></i></div>'
  ).join('');
}

function armorEllipsePoint(binding,t) {
  const [cx,cy]=binding.centre,[rx,ry]=binding.radius;
  const c=Math.cos(binding.turn),s=Math.sin(binding.turn);
  const x=rx*Math.cos(t),y=ry*Math.sin(t);
  return [cx+x*c-y*s,cy+x*s+y*c];
}

function armorLoopPath(binding,front) {
  const from=front?0:Math.PI,to=front?Math.PI:Math.PI*2;
  return Array.from({length:61},(_,i)=>armorEllipsePoint(binding,from+(to-from)*i/60));
}

function armorTailPath(binding) {
  let end=armorEllipsePoint(binding,0),distance=Infinity;
  for(let i=0;i<120;i++){
    const p=armorEllipsePoint(binding,Math.PI*2*i/120);
    const d=Math.hypot(p[0]-binding.wall[0],p[1]-binding.wall[1]);
    if(d<distance){distance=d;end=p;}
  }
  const [x0,y0]=binding.wall,[x1,y1]=end;
  // A sagging tether approaches the loop rather than ending at a point on the
  // suit. The rear loop continues behind the body and the front returns over it.
  const sag=Math.min(38,Math.hypot(x1-x0,y1-y0)*.06);
  return Array.from({length:81},(_,i)=>{
    const t=i/80;
    return [x0+(x1-x0)*t,y0+(y1-y0)*t+Math.sin(Math.PI*t)*sag];
  });
}

function armorChainSamples(points,spacing=11) {
  const lengths=[0];
  for(let i=1;i<points.length;i++)lengths.push(lengths.at(-1)+Math.hypot(points[i][0]-points[i-1][0],points[i][1]-points[i-1][1]));
  const total=lengths.at(-1),links=Math.max(2,Math.ceil(total/spacing));
  let cursor=1;
  return Array.from({length:links+1},(_,index)=>{
    const d=total*index/links;
    while(cursor<points.length-1&&lengths[cursor]<d)cursor++;
    const a=points[cursor-1],b=points[cursor],part=(d-lengths[cursor-1])/Math.max(.001,lengths[cursor]-lengths[cursor-1]);
    return {x:a[0]+(b[0]-a[0])*part,y:a[1]+(b[1]-a[1])*part,angle:Math.atan2(b[1]-a[1],b[0]-a[0])};
  });
}

function drawArmorChainPath(canvas,points,{rear=false,anchor}={}) {
  const context=canvas.getContext?.('2d');if(!context)return;
  const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),pad=14;
  const left=Math.min(...xs)-pad,top=Math.min(...ys)-pad;
  const width=Math.max(...xs)-left+pad,height=Math.max(...ys)-top+pad;
  canvas.width=Math.ceil(width);canvas.height=Math.ceil(height);
  canvas.style.left=left/9+'%';canvas.style.top=top/12+'%';
  canvas.style.width=width/9+'%';canvas.style.height=height/12+'%';
  canvas.style.transformOrigin=((anchor?.[0]??points[0][0])-left)/width*100+'% '+((anchor?.[1]??points[0][1])-top)/height*100+'%';
  const links=armorChainSamples(points);
  context.lineCap='round';context.globalAlpha=rear?.76:1;
  links.forEach((link,index)=>{
    context.save();context.translate(link.x-left,link.y-top);context.rotate(link.angle);
    context.shadowColor='#020309';context.shadowBlur=3;context.shadowOffsetY=2;
    context.beginPath();context.ellipse(0,0,7.8,index%2?2.8:4.7,0,0,Math.PI*2);
    context.strokeStyle='#0b1119';context.lineWidth=4.3;context.stroke();
    context.shadowBlur=0;context.shadowOffsetY=0;
    context.strokeStyle=index%2?'#626d7a':'#aaa594';context.lineWidth=2.2;context.stroke();
    // A short upper rim highlight makes each link a metal ring, not a bead.
    context.beginPath();context.ellipse(0,-.3,7.1,index%2?2.3:4.1,0,Math.PI*1.10,Math.PI*1.82);
    context.strokeStyle=rear?'#9b9d93':'#d6cbb6';context.lineWidth=.75;context.stroke();
    context.restore();
  });
}

function installArmorBindings(armor) {
  const chains=Array.from(armor.querySelectorAll('.ia-chain'));
  ARMOR_BINDINGS.forEach((binding,index)=>{
    const chain=chains[index];if(!chain)return;
    drawArmorChainPath(chain.querySelector('.ia-chain-wall'),armorTailPath(binding),{anchor:binding.wall});
    drawArmorChainPath(chain.querySelector('.ia-chain-back'),armorLoopPath(binding,false),{rear:true,anchor:binding.centre});
    drawArmorChainPath(chain.querySelector('.ia-chain-front'),armorLoopPath(binding,true),{anchor:binding.centre});
    const spark=armorEllipsePoint(binding,Math.PI*.52);
    chain.style.setProperty('--spark-x',spark[0]/9+'%');
    chain.style.setProperty('--spark-y',spark[1]/12+'%');
  });
  return chains;
}

function updateArmorBindings(chains,count,changed) {
  const next=Math.max(0,Math.min(10,Math.floor(Number(count)||0)));
  chains.forEach((chain,index)=>{
    chain.classList.toggle('is-broken',index<next);
    chain.classList.remove('is-snapping');
    if(changed&&index===next-1){void chain.offsetWidth;chain.classList.add('is-snapping');}
  });
}




  function create({document: doc}) {
    const ice=doc.createElement('div');
    ice.className='story-ice';
    ice.hidden=true;
    ice.setAttribute('aria-hidden','true');
    ice.innerHTML=`
      <div class="ia-frame ia-ice-frame">
        <div class="ia-flight-vista"></div>
        <div class="ia-world ia-ice-world">
          <div class="ia-ice-light"></div>
          <div class="ia-goddess-shadow"></div>
          <div class="ia-goddess"><img class="ia-goddess-sleeping" src="assets/story/ice-goddess.webp" alt="" draggable="false"><img class="ia-goddess-awake" src="assets/story/ice-goddess-awake.webp" alt="" draggable="false"><canvas class="ia-body-ice"></canvas></div>
          <div class="ia-melt-water"></div>
          <div class="ia-ice-release"></div>
          <div class="ia-snow">${Array.from({length:15},(_,index)=>
            `<i style="--flake-x:${index*37%100}%;--flake-delay:${-index*.71}s;--flake-duration:${9+index%5}s"></i>`).join('')}</div>
        </div>
        <div class="ia-flight-guide" aria-hidden="true">
          <img class="ia-flight-fallback" src="assets/story/ice-goddess-awake.webp" alt="" draggable="false">
          <img class="ia-flight-handhold" src="assets/story/goddess-handhold-flight-v3.webp" alt="" draggable="false">
        </div>
        <div class="ia-handhold-glimmer"></div>
        <div class="ia-flight-cloud ia-flight-cloud-far"></div>
        <div class="ia-flight-cloud ia-flight-cloud-near"></div>
        <div class="ia-flight-streaks">${Array.from({length:7},(_,index)=>
          `<i style="--flight-x:${8+index*14}%;--flight-delay:${index*.19}s"></i>`).join('')}</div>
        <div class="ia-frame-shade"></div>
      </div>`;
    const armor=doc.createElement('div');
    armor.className='story-armor';
    armor.hidden=true;
    armor.setAttribute('aria-hidden','true');
    armor.innerHTML=`
<div class="ia-frame ia-armor-frame">
  <div class="ia-world ia-armor-world">
    <div class="ia-armor-aura"></div>
    <div class="ia-armor-shadow"></div>
    <div class="ia-armor-radiance"></div>
    <div class="ia-armor-figure">
      <img class="ia-armor-standing" src="assets/story/castle-armor-standing-v2.webp" alt="" draggable="false">
      <div class="ia-armor-kneeling">
        <img src="assets/story/castle-armor-kneeling-v3.webp" alt="" draggable="false">
        <div class="ia-armor-seam-light"></div>
        <div class="ia-armor-chest-light"></div>
      </div>
    </div>
    <div class="ia-chains">${armorBindingMarkup()}</div>
    <div class="ia-armor-dust"></div>
    <div class="ia-armor-floor-light"></div>
  </div>
  <div class="ia-frame-shade"></div>
</div>`;
    doc.body.insertBefore(ice,doc.body.firstChild);
    doc.body.insertBefore(armor,doc.body.firstChild);
    const crystal=ice.querySelector('.ia-body-ice');
    const counts={ice:0,armor:0};
    const sleeping=ice.querySelector('.ia-goddess-sleeping');
    const handhold=ice.querySelector('.ia-flight-handhold');
    const updateFlightArtwork=()=>ice.classList.toggle('has-flight-guide',Boolean(handhold?.complete && handhold.naturalWidth));
    handhold.addEventListener('load',updateFlightArtwork);
    handhold.addEventListener('error',updateFlightArtwork);
    updateFlightArtwork();
    const shell=doc.createElement('img');
    const redrawIce=()=>drawIce(crystal,counts.ice,shell,sleeping);
    shell.addEventListener('load',redrawIce);
    sleeping.addEventListener('load',redrawIce);
    shell.src='assets/story/ice-goddess-shell-v2.webp';
    const chains=installArmorBindings(armor);
    const kneelingArt=armor.querySelector('.ia-armor-kneeling img');
    const updateArmorArtwork=()=>armor.classList.toggle('has-kneel-art',Boolean(kneelingArt?.complete && kneelingArt.naturalWidth));
    kneelingArt?.addEventListener('load',updateArmorArtwork);
    kneelingArt?.addEventListener('error',updateArmorArtwork);
    updateArmorArtwork();

    let currentStage;
    drawIce(crystal,0,shell,sleeping);

    function playArmorEnding() {
      armor.classList.remove('is-armor-ending');
      void armor.offsetWidth;
      armor.classList.add('is-armor-ending');
      return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches?0:6200;
    }

    function resetExit() {
      ice.classList.remove('is-leaving');
      armor.classList.remove('is-leaving','is-armor-ending');
    }

    function render(stage,count,animate=false) {
      ice.hidden=stage!=='ice';
      armor.hidden=stage!=='armor';
      if(stage!=='ice' && stage!=='armor') {
        resetExit();
        currentStage=stage;
        return;
      }
      const scene=stage==='ice'?ice:armor;
      const next=Math.max(0,Math.min(10,Math.floor(Number(count)||0)));
      const changed=Boolean(animate && currentStage===stage && next>counts[stage]);
      if(currentStage!==stage || next<counts[stage])resetExit();
      scene.dataset.count=String(next);
      scene.style.setProperty('--ia-progress',String(next/10));
      scene.classList.toggle('is-complete',next===10);
      scene.classList.remove('is-changing','is-awakening');
      if(stage==='ice') {
        drawIce(crystal,next,shell,sleeping);
      } else {
        updateArmorBindings(chains,next,changed);
      }
      if(changed) {
        void scene.offsetWidth;
        scene.classList.add('is-changing');
        if(next===10)scene.classList.add('is-awakening');
        if(stage==='armor'&&next===10)playArmorEnding();
      }
      counts[stage]=next;
      currentStage=stage;
    }

    function playExit(stage) {
      if(stage==='armor') {
        if(counts.armor!==10)return 0;
        resetExit();
        return playArmorEnding();
      }
      if((stage!=='ice' && stage!=='armor') || counts[stage]!==10)return 0;
      const scene=stage==='ice'?ice:armor;
      resetExit();
      void scene.offsetWidth;
      scene.classList.add('is-leaving');
      return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches?0:stage==='ice'?7200:3200;
    }

    return {render,playExit,resetExit};
  }

  window.HanziIceArmorStory=Object.freeze({create});
})(window);
