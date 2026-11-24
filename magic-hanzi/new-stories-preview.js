(function (window) {
  'use strict';
  const doc = window.document;
  const stories = {
    dunes: {
      title: '沙丘寻龙', unit: '个脚印', interval: 1200,
      description: '每通过一个字，沙子扬起，露出一个脚印。沿着弯曲的足迹，第十步会唤起沙丘中的龙。',
      initial: '沙丘上还没有脚印。', progress: '沙子扬起，留下了一个新的脚印。',
      complete: '龙落在了你面前，伏下身子，邀请你骑上去。',
      arriving: '沙丘隆起，龙掀起沙浪，破沙腾起。',
      entering: '你登上龙背，双翼展开，脚下的沙丘渐渐远去。',
      ending: '骑上龙背', after: '龙颈和双翼就在眼前。你骑在龙背上，随它飞向沙丘上空。', arrival: 5400
    },
    library: {
      title: '高塔禁书', unit: '级书阶', interval: 1200,
      description: '高书架的最顶层，一本禁书被绿色魔咒封住。每通过一个字，一本厚书飞来，搭成一级向上的台阶。',
      initial: '禁书放在书架顶端，绿色魔咒在周围流动。', progress: '书脊和书页落稳，又一级书阶搭好了。',
      complete: '十级书阶通向架顶，绿色结界解开了。走上去，打开禁书。',
      entering: '沿书阶登上架顶，打开禁书，念出书中的咒语。',
      ending: '登上书阶，打开禁书', after: '书中的咒语化成绿光。幽灵武士苏醒，向你伸出了手。', arrival: 900
    },
    ice: {
      title: '冰雪庭院', unit: '道裂缝', interval: 1200,
      description: '庭院中央，一位美丽女神被冰封。每通过一个字，冰上多一道裂缝，再融化一点。',
      initial: '女神静静沉睡在寒冰中。', progress: '冰层裂开，融水顺着裂纹流下。',
      complete: '最后一层冰化尽，女神醒来，向你伸出了手。',
      entering: '你握住女神的手，她牵着你轻轻飞起。',
      ending: '牵住女神的手，飞起来', after: '你握着女神的手升入夜空，冰雪庭院渐渐落在脚下。', arrival: 2200
    },
    armor: {
      title: '沉睡的盔甲', unit: '根断链', interval: 1200,
      description: '十根铁链从墙上伸来，缠绕肩臂、胸腰和小腿，将盔甲牢牢绑住。每通过一个字，就断开一根。',
      initial: '十根铁链绕过盔甲的身体和四肢，将它牢牢缠绑。', progress: '一根缠着盔甲的铁链绷断，滑落下去。',
      complete: '最后一根铁链断开，盔甲向你单膝跪地，发出光芒。',
      entering: '盔甲走到你面前，单膝跪地，光从胸甲与甲缝中亮起。',
      ending: '重看单膝跪地与光芒', after: '盔甲在你面前单膝跪地，温暖的光从甲缝中流出。', arrival: 6500
    }
  };
  const get = id => doc.getElementById(id);
  const modules = [
    window.HanziDuneStory.create({document:doc}),
    window.HanziLibraryStory.create({document:doc}),
    window.HanziIceArmorStory.create({document:doc})
  ];
  const beads = Array.from({length:10}, () => {
    const bead = doc.createElement('i');
    get('previewBeads').appendChild(bead);
    return bead;
  });
  let stage = 'dunes', count = 0, auto = false, timer, endingTimer;
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function stop() {
    window.clearTimeout(timer);
    window.clearTimeout(endingTimer);
    auto = false;
  }
  function update() {
    const story = stories[stage];
    get('previewCount').textContent = count + ' / 10 ' + story.unit;
    beads.forEach((bead,index) => bead.classList.toggle('is-lit',index<count));
    get('previewStep').hidden = count===10;
    get('previewAuto').hidden = count===10;
    get('previewEnding').hidden = count<10;
    get('previewEnding').textContent = story.ending;
    get('previewStep').disabled = auto;
    get('previewAuto').disabled = auto;
    get('previewEnding').disabled = false;
    get('previewStatus').textContent = count===10 ? story.complete : count ? story.progress : story.initial;
  }
  function render(animate) {
    modules.forEach(module => module.render(stage,count,animate));
    update();
    if(count===10 && animate && !reduced()){
      get('previewEnding').disabled = true;
      get('previewStatus').textContent = stories[stage].arriving || stories[stage].complete;
      endingTimer = window.setTimeout(() => {
        get('previewEnding').disabled = false;
        get('previewStatus').textContent = stories[stage].complete;
      },stories[stage].arrival);
    }
  }
  function select(next) {
    stop();
    modules.forEach(module => module.resetExit());
    stage = next;
    count = 0;
    doc.body.dataset.previewStage = stage;
    doc.querySelectorAll('[data-stage]').forEach(button =>
      button.setAttribute('aria-pressed',String(button.dataset.stage===stage)));
    get('previewTitle').textContent = stories[stage].title;
    get('previewDescription').textContent = stories[stage].description;
    render(false);
  }
  function next() {
    if(count>=10)return;
    count++;
    if(count===10)auto=false;
    render(true);
  }
  doc.querySelectorAll('[data-stage]').forEach(button =>
    button.addEventListener('click',() => select(button.dataset.stage)));
  get('previewStep').addEventListener('click',next);
  get('previewReset').addEventListener('click',() => select(stage));
  get('previewAuto').addEventListener('click',() => {
    auto=true;
    function advance() {
      next();
      if(count<10)timer=window.setTimeout(advance,stories[stage].interval);
    }
    advance();
  });
  get('previewEnding').addEventListener('click',() => {
    stop();
    get('previewEnding').disabled=true;
    get('previewStatus').textContent=stories[stage].entering || stories[stage].complete;
    let duration=0;
    modules.forEach(module => { duration=Math.max(duration,module.playExit(stage)||0); });
    endingTimer=window.setTimeout(() => {
      get('previewStatus').textContent=stories[stage].after;
      get('previewEnding').disabled=false;
      get('previewEnding').textContent='再看一次结尾';
    },reduced()?0:duration);
  });
  doc.addEventListener('visibilitychange',() => {
    if(doc.hidden){ stop(); modules.forEach(module=>module.resetExit()); update(); }
  });
  select(stage);
})(window);
