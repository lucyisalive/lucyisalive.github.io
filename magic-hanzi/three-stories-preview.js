(function (window) {
  'use strict';
  const doc=window.document, get=id=>doc.getElementById(id);
  const stories={
    beans:{title:'魔豆云梯',unit:'截豆藤',duration:13700,description:'每正式通过一个字，魔豆长高一截。十截穿过云层，露出天堂火车站，列车沿着云轨驶向远方。',initial:'一颗魔豆落在夜色中的泥土里。',progress:'豆藤长高，叶片展开，视线随它上升。',ending:'云层散开，天堂火车站出现，列车准备启程。',complete:'列车沿云轨驶远，消失在未知的云海中。'},
    rose:{title:'玫瑰美人',unit:'朵玫瑰',duration:3800,description:'无盖棺材上爬满枯萎藤蔓。每正式通过一个字，一朵玫瑰开放，藤蔓转绿。十朵开齐，花藤让开，美人睁眼。',initial:'枯藤遮住沉睡美人的脸。',progress:'又一朵玫瑰绽放，枯枝恢复绿色。',ending:'最后一朵开放，花藤正向两侧让开。',complete:'美人睁开眼睛，仍安静地躺在原处。'},
    bagua:{title:'八卦石门',unit:'处封印',duration:5200,description:'前八次点亮外圈八卦，最后两次点亮中央阴阳两部分。十处全部亮起后，厚重双门伴随轰隆声向左右滑开。',initial:'八卦封印沉寂，石门紧闭。',progress:'一处封印亮起，金色光芒沿石面流动。',ending:'封印全亮，厚重石门正在向两侧平移。',complete:'双门打开，门后是一条雾中的通道。'}
  };
  const modules=[window.HanziBeanTrainStory.create({document:doc}),window.HanziRoseBaguaStory.create({document:doc})];
  const beads=Array.from({length:10},()=>{const b=doc.createElement('i');get('previewBeads').appendChild(b);return b;});
  let stage='beans',count=0,auto=false,timer=null,endTimer=null,ending=false;
  const reduce=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function stop(){window.clearTimeout(timer);window.clearTimeout(endTimer);auto=false;ending=false;}
  function update(){
    const s=stories[stage];get('previewCount').textContent=count+' / 10 '+s.unit;
    beads.forEach((b,i)=>b.classList.toggle('is-lit',i<count));
    get('previewStep').hidden=get('previewAuto').hidden=count===10;
    get('previewStep').disabled=get('previewAuto').disabled=auto;
    get('previewEnding').hidden=count<10;get('previewEnding').disabled=ending;
    get('previewStatus').textContent=count===10?(ending?s.ending:s.complete):count?s.progress:s.initial;
  }
  function render(animate){
    modules.forEach(m=>m.render(stage,count,animate));
    if(count===10&&animate&&!reduce()){
      ending=true;window.clearTimeout(endTimer);
      endTimer=window.setTimeout(()=>{ending=false;update();},stories[stage].duration);
    }
    update();
  }
  function select(next){
    stop();modules.forEach(m=>m.resetExit());stage=next;count=0;doc.body.dataset.previewStage=stage;
    doc.querySelectorAll('[data-stage]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.stage===stage)));
    get('previewTitle').textContent=stories[stage].title;get('previewDescription').textContent=stories[stage].description;render(false);
  }
  function next(){if(count>=10)return;count++;if(count===10)auto=false;render(true);}
  doc.querySelectorAll('[data-stage]').forEach(b=>b.addEventListener('click',()=>select(b.dataset.stage)));
  get('previewStep').addEventListener('click',next);
  get('previewReset').addEventListener('click',()=>select(stage));
  get('previewAuto').addEventListener('click',()=>{if(auto)return;auto=true;function advance(){next();if(count<10)timer=window.setTimeout(advance,1600);}advance();});
  get('previewEnding').addEventListener('click',()=>{stop();modules.forEach(m=>m.render(stage,9,false));count=10;render(true);});
  function finishHidden(){
    stop();modules.forEach(m=>m.resetExit());
    // A hidden complete scene restores directly to its terminal picture.
    // Reset the visual-only count first so no previous animated frame survives.
    if(count===10)modules.forEach(m=>{m.render(stage,9,false);m.render(stage,10,false);});
    update();
  }
  doc.addEventListener('visibilitychange',()=>{if(doc.hidden)finishHidden();});
  window.addEventListener('pagehide',finishHidden);
  select(stage);
})(window);
