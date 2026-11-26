(function(window){
'use strict';
const doc=window.document,get=id=>doc.getElementById(id),motion=window.matchMedia('(prefers-reduced-motion: reduce)');
const stories={
 zoo:{title:'午夜猛兽动物园',unit:'个笼子',duration:6400,next:'butterfly',description:'十次正式通过，十把锁逐个打开，猛兽跑出后留在园里。最后灯串点亮，午夜派对开始。',initial:'十个笼子还锁着，午夜的园区静悄悄。',progress:'钥匙打开一笼，又一只猛兽跑到了园里。',ending:'灯串正在亮起，十只猛兽聚在午夜舞台前。',complete:'十只猛兽开始午夜派对！'},
 butterfly:{title:'梦中的蝴蝶仙子',unit:'层迷障',arrival:2400,duration:4200,next:'laser',action:'抓住装成花的小精灵',description:'梦见蝴蝶，醒来进入花园。十层迷障退去后，仙子装成静止的花。点到它，才会扑闪翅膀现身。',initial:'梦里的蝶翼微光，把你引进了花园。',progress:'又一层灌木、篱笆或雾幕退去了。',waiting:'这朵花一动不动。抓住这只装成花朵的小精灵吧！',ending:'仙子扑闪翅膀，笑着向你现身。',complete:'哈哈哈，你找到我啦！'},
 laser:{title:'古墓光网',unit:'道光网',duration:8000,next:'arrows',description:'十道交叉光网沿通道层层排开。每次穿过一道，镜头真正前进。到箱前打开宝箱，巨震和箭阵一起出现。',initial:'交叉光束织成网，藏宝箱还在通道深处。',progress:'本层光网让开，你向古墓深处前进。',ending:'来到箱前、箱盖打开，墓穴巨震，箭阵齐射！',complete:'箭阵就在眼前。下一关举剑格挡，开场会接住这一刻。'},
 arrows:{title:'古墓挥剑挡箭',unit:'支挡开的箭',duration:6500,next:'map',description:'箭阵在写字时悬停。每次通过挥剑挡开一箭。十箭之后，看清箱中地图，取出摊开却是空白。',initial:'刚才打开的箱子仍在眼前，十支箭悬在半空。',progress:'剑锋迎上箭杆，把箭挡向镜头两侧。',ending:'箭阵结束，从同一个宝箱里取出地图，摊开。',complete:'地图展开了，却一片空白。下一关从这张纸接着开始。'},
 map:{title:'十片藏宝图',unit:'块海图',duration:9000,next:'pirate',description:'从古墓取出的同一张空白纸上，十块海图逐块显现。全图发光，纸上的海面化为真实海面，进入海盗甲板。',initial:'刚摊开的空白羊皮纸，仍保留宝箱里的折痕。',progress:'一块拼图般的海岸与航线显现在纸上。',ending:'全图发光，海面流动，镜头穿进地图中的航线。',complete:'你已经站在真实的海盗船甲板上，舵轮前还没有船长。'},
 pirate:{title:'骷髅海盗船长',unit:'组骨架',duration:12000,next:'seed',description:'十步拼好骨架，最后骷髅头归位，船长苏醒。外套撑起、帽子落下，他转身掌舵，展帆启航。',initial:'舵轮前的外套空空地垂着，骨架等待归位。',progress:'一组骨架飞来接上，船长渐渐完整。',ending:'船长苏醒、穿衣戴帽，转身掌舵，船帆展开。',complete:'船长带你驶入月色里的海面。'},
 seed:{title:'果核里的沙粒星球',unit:'层果核',arrival:1300,duration:10500,action:'轻点这粒沙子',description:'十层果核越开越小，最后只剩一粒沙。点击沙粒，显出星球，镜头进入同一沙星地面，抵达等待照料的玫瑰花苞。',initial:'一枚果核放在古老的工作台上。',progress:'外壳打开，里面还有更小的一层。',waiting:'只剩一粒极小的沙子。轻点它，看看里面的世界。',ending:'沙粒显成星球，镜头正在接近沙星、落向地面。',complete:'沙星上有一株等待照料的玫瑰花苞。玫瑰的故事待续。'}
};
let stage='zoo',count=0,phase='progress',auto=false,chain=false,deadline=0,progressTimer=null,uiTimer=null,chainTimer=null;
const request=which=>{if(which===stage)performAction();};
const wild=window.HanziWildGardenStory.create({document:doc,onActionRequest:request});
const tomb=window.HanziTombPirateStory.create({document:doc});
const seed=window.HanziSeedPlanetStory.create({document:doc,onActionRequest:request});
const modules=[wild,tomb,seed],beads=Array.from({length:10},()=>{const b=doc.createElement('i');get('previewBeads').appendChild(b);return b;});
const current=()=>stage==='seed'?seed:['zoo','butterfly'].includes(stage)?wild:tomb;
const now=()=>window.performance.now();
function visualComplete(){try{return current().isEndingComplete?.(stage)===true;}catch(_){return false;}}
function stop(){window.clearTimeout(progressTimer);window.clearTimeout(uiTimer);window.clearTimeout(chainTimer);auto=false;chain=false;}
function update(){
 const s=stories[stage],finished=count===10,complete=phase==='complete';
 get('previewCount').textContent=count+' / 10 '+s.unit;beads.forEach((b,i)=>b.classList.toggle('is-lit',i<count));
 get('previewStep').hidden=get('previewAuto').hidden=finished;
 get('previewStep').disabled=get('previewAuto').disabled=auto;
 get('previewAction').hidden=!(finished&&s.action&&phase!=='complete');
 get('previewAction').disabled=phase!=='await';get('previewAction').textContent=s.action||'';
 get('previewNext').hidden=!(complete&&s.next);get('previewNext').textContent=s.next?'前往'+stories[s.next].title:'';
 get('previewChain').disabled=chain;
 get('previewStatus').textContent=!finished?(count?s.progress:s.initial):phase==='complete'?s.complete:phase==='await'?(s.waiting||s.ending):phase==='arrival'?(s.waiting||s.ending):s.ending;
}
function afterComplete(){
 if(chain&&['laser','arrows','map'].includes(stage)){
  chainTimer=window.setTimeout(()=>{const next=stories[stage].next;select(next,true);playAll();},1100);
 }else if(chain){chain=false;update();}
}
function watch(){
 window.clearTimeout(uiTimer);
 if(count!==10)return;
 if(phase==='arrival'&&now()>=deadline)phase=visualComplete()?'complete':'await';
 if(phase==='ending'&&now()>=deadline){phase='complete';afterComplete();}
 update();
 if(phase==='arrival'||phase==='ending')uiTimer=window.setTimeout(watch,80);
}
function render(animate){
 modules.forEach(m=>m.render(stage,count,animate));
 if(count===10){
  if(stories[stage].action){
   phase=visualComplete()?'complete':motion.matches?'await':'arrival';deadline=now()+(stories[stage].arrival||0);
  }else{phase=animate&&!motion.matches?'ending':'complete';deadline=now()+stories[stage].duration;}
  watch();
 }else{phase='progress';update();}
}
function select(next,keepChain=false){
 stop();chain=keepChain;window.HanziGameFeedback?.reset();modules.forEach(m=>m.resetExit());
 stage=next;count=0;phase='progress';doc.body.dataset.previewStage=stage;
 doc.querySelectorAll('[data-stage]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.stage===stage)));
 get('previewTitle').textContent=stories[stage].title;get('previewDescription').textContent=stories[stage].description;render(false);
}
function next(){if(count>=10)return;count++;if(count===10)auto=false;render(true);}
function playAll(){if(auto||count>=10)return;auto=true;function advance(){next();if(count<10)progressTimer=window.setTimeout(advance,stage==='zoo'?2100:stage==='butterfly'?1700:1500);}advance();}
function performAction(){
 if(count!==10||!stories[stage].action||phase==='ending'||phase==='complete')return;
 if(phase==='arrival'&&now()<deadline)return;
 const duration=current().playExit(stage)||0;
 phase=duration&&!motion.matches?'ending':'complete';deadline=now()+duration;watch();
}
function settle(){
 stop();window.HanziGameFeedback?.reset();modules.forEach(m=>m.resetExit());
 if(count===10)phase=stories[stage].action&&!visualComplete()?'await':'complete';
 update();
}
doc.querySelectorAll('[data-stage]').forEach(b=>b.addEventListener('click',()=>select(b.dataset.stage)));
get('previewStep').addEventListener('click',next);get('previewAuto').addEventListener('click',playAll);
get('previewAction').addEventListener('click',performAction);get('previewReset').addEventListener('click',()=>select(stage));
get('previewNext').addEventListener('click',()=>{if(phase==='complete'&&stories[stage].next)select(stories[stage].next);});
get('previewChain').addEventListener('click',()=>{select('laser',true);playAll();});
doc.addEventListener('visibilitychange',()=>{if(doc.hidden)settle();});window.addEventListener('pagehide',settle);
const onMotion=()=>{if(motion.matches)settle();};if(motion.addEventListener)motion.addEventListener('change',onMotion);else motion.addListener?.(onMotion);
select(stage);
})(window);
