(function (window) {
  'use strict';
  const doc=window.document, get=id=>doc.getElementById(id);
  const stories={
    goose:{title:'金鹅黏黏队',unit:'位同行者',duration:9000,description:'每正式通过一个字，一位好奇的人黏到金鹅的队伍后面。十人长队绕过庭院，逗笑阳台上的公主，魔法解开，众人散开庆祝。',initial:'金鹅独自在宫廷庭院里摇摇摆摆。',progress:'又一个人黏到了队尾，长队弯弯曲曲。',ending:'十人长队走过阳台，公主笑起来了。',complete:'黏黏魔法解开，大家高高兴兴地散开。'},
    clockbird:{title:'钟表夜莺',unit:'件部件',duration:11000,description:'每正式通过一个字，机械夜莺装好一件部件。十件装齐后唱起歌，窗外九只真夜莺回应。机械夜莺加入鸟群，大家一起冲向晨光。',initial:'夜莺的骨架与零件等待装配。',progress:'装上一件部件，齿轮开始运转。',ending:'机械夜莺唱起歌，窗外鸟群回应，准备一起起飞。',complete:'十只夜莺一起飞向晨光，桌面安静下来。'},
    elves:{title:'小精灵的午夜舞台',unit:'件衣物',duration:8800,description:'两个静止的小精灵各需帽子、外衣、裤子和两只鞋，共十件。每正式通过一个字，穿好一件。前九次保持静止，全穿好后才苏醒，沿桌面踮脚溜走。',initial:'两个小精灵闭着眼睛，静静站在裁缝桌上。',progress:'一件衣物穿好了，它们还没有苏醒。',ending:'十件衣物齐了，小精灵睁眼相望，踮脚走向窗边。',complete:'两个小精灵已从窗边悄悄溜走，留下一张空桌。'}
  };
  const modules=[window.HanziGooseStory.create({document:doc}),window.HanziClockbirdStory.create({document:doc}),window.HanziElvesStory.create({document:doc})];
  const beads=Array.from({length:10},()=>{const b=doc.createElement('i');get('previewBeads').appendChild(b);return b;});
  let stage='goose',count=0,auto=false,timer=null,endTimer=null,ending=false;
  const motion=window.matchMedia('(prefers-reduced-motion: reduce)');
  const reduce=()=>motion.matches;
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
    stop();window.HanziGameFeedback?.reset();modules.forEach(m=>m.resetExit());stage=next;count=0;doc.body.dataset.previewStage=stage;
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
    stop();window.HanziGameFeedback?.reset();modules.forEach(m=>m.resetExit());
    // A hidden complete scene restores directly to its terminal picture.
    // Reset the visual-only count first so no previous animated frame survives.
    if(count===10)modules.forEach(m=>{m.render(stage,9,false);m.render(stage,10,false);});
    update();
  }
  const onMotionChange=()=>{if(reduce())finishHidden();};
  if(motion.addEventListener)motion.addEventListener('change',onMotionChange);
  else motion.addListener?.(onMotionChange);
  doc.addEventListener('visibilitychange',()=>{if(doc.hidden)finishHidden();});
  window.addEventListener('pagehide',finishHidden);
  select(stage);
})(window);
