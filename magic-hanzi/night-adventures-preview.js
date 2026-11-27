(function(window){
'use strict';
const doc=window.document,get=id=>doc.getElementById(id),motion=window.matchMedia('(prefers-reduced-motion: reduce)');
const stories={
 goose:{title:'金鹅黏黏队',unit:'位同行者',duration:9000,next:'clockbird',description:'宫廷庭院里，十位同行者黏成金鹅的长队，走过阳台。公主从栏杆后看见游行，终于笑起来。',initial:'公主在宫廷阳台上看着庭院，金鹅正摇摇摆摆。',progress:'又一个人黏到了队尾，长队弯弯曲曲。',ending:'十人长队走过阳台，公主笑起来了。',complete:'黏黏魔法解开，大家高高兴兴地散开。'},
 clockbird:{title:'钟表夜莺',unit:'件部件',duration:11000,next:'elves',description:'保留已经确认的钟表夜莺：十件部件齐后唱歌，九只真夜莺在窗外回应，再一起冲向晨光。',initial:'机械夜莺等待装好部件。',progress:'又一件部件安装好了。',ending:'机械夜莺唱响，窗外的夜莺一起回应。',complete:'十只夜莺一起飞向晨光。'},
 elves:{title:'木偶小精灵的午夜舞台',unit:'件衣物',duration:8800,next:'zoo',description:'一男一女两个木偶玩具，各需帽子、外衣、裤子和两只鞋。十件穿齐后才活过来，互看、踮脚溜走。',initial:'两个木质关节玩具静静等在裁缝桌上。',progress:'一件衣物穿好了，木偶还没有苏醒。',ending:'两只木偶活过来，互相看看，踮脚走向窗边。',complete:'两个木偶从窗边悄悄溜走，留下一张空桌。'},
 zoo:{title:'午夜猛兽动物园',unit:'个笼子',duration:6400,next:'butterfly',description:'十次正式通过，十把锁逐个打开，猛兽跑出后留在园里。最后灯串点亮，午夜派对开始。',initial:'十个笼子还锁着，午夜的园区静悄悄。',progress:'钥匙打开一笼，又一只猛兽跑到了园里。',ending:'灯串正在亮起，十只猛兽聚在午夜舞台前。',complete:'十只猛兽开始午夜派对！'},
 butterfly:{title:'梦中的蝴蝶仙子',unit:'层迷障',arrival:2400,duration:4200,next:'laser',action:'抓住装成花的小精灵',description:'仙子先现身，转身逃进弯曲绿篱迷宫。追过十个转角，找到侧面灌木上那朵装成花的仙子。',initial:'仙子回头看见你，扑闪翅膀逃进迷宫。',progress:'又一层灌木、篱笆或雾幕退去了。',waiting:'这朵花一动不动。抓住这只装成花朵的小精灵吧！',ending:'仙子扑闪翅膀，笑着向你现身。',complete:'哈哈哈，你找到我啦！'},
 laser:{title:'古墓激光机关',unit:'根激光',duration:8000,next:'arrows',description:'十根激光不规律地横在通道中。每次通过，视角降低、抬高或侧倾穿过一根，随后停稳。到箱前开盖，巨震与箭阵出现。',initial:'高低不一的激光挡在眼前，藏宝箱还在通道深处。',progress:'换个姿势穿过一根激光，停稳后继续前进。',ending:'来到箱前、箱盖打开，墓穴巨震，箭阵齐射！',complete:'箭阵就在眼前。下一关举剑格挡，开场会接住这一刻。'},
 arrows:{title:'古墓挥剑挡箭',unit:'支挡开的箭',duration:6500,next:'map',description:'箭阵在写字时悬停。每次通过挥剑挡开一箭。十箭之后，看清箱中地图，取出摊开却是空白。',initial:'刚才打开的箱子仍在眼前，十支箭悬在半空。',progress:'箭头迎面逼近，剑在眼前截住，断箭飞向镜头两侧。',ending:'箭阵结束，从同一个宝箱里取出地图，摊开。',complete:'地图展开了，却一片空白。下一关从这张纸接着开始。'},
 map:{title:'十片藏宝图',unit:'块海图',duration:9000,next:'pirate',description:'从古墓取出的同一张空白纸上，岛屿、港口、灯塔和沉船等十块海图逐块显现。全图发光，纸上的海面化为真实海面，进入海盗甲板。',initial:'刚摊开的空白羊皮纸，仍保留宝箱里的折痕。',progress:'一块拼图般的海岸与航线显现在纸上。',ending:'全图发光，海面流动，镜头穿进地图中的航线。',complete:'你已经站在真实的海盗船甲板上，舵轮前还没有船长。'},
 pirate:{title:'海盗船长的复生',unit:'组骨架',duration:12000,next:'seed',description:'按真实骨骼部位拼接十组，头骨最后归位，魔法光中恢复活人船长。他穿衣戴帽、转身掌舵，展帆启航。',initial:'舵轮前的外套空空地垂着，骨架等待归位。',progress:'一组骨架飞来接上，船长渐渐完整。',ending:'骨架变回活人船长，穿衣戴帽，转身掌舵，船帆展开。',complete:'船长带你驶入月色里的海面。'},
 seed:{title:'套娃里的沙粒星球',unit:'层套娃',arrival:1300,duration:10500,action:'轻点这粒沙子',description:'十只经典俄罗斯套娃沿腰间接缝打开，里面的一只越来越小，最后只剩一粒沙。点击沙粒，显出星球，镜头进入同一沙星地面，抵达等待照料的玫瑰花苞。',initial:'一只花卉彩绘俄罗斯套娃，放在古老的工作台上。',progress:'套娃上半只抬起，露出里面更小的一只。',waiting:'只剩一粒极小的沙子。轻点它，看看里面的世界。',ending:'沙粒显成星球，镜头正在接近沙星、落向地面。',complete:'沙星上有一株等待照料的玫瑰花苞。玫瑰的故事待续。'}
};
let stage='zoo',count=0,phase='progress',auto=false,chain=false,deadline=0,progressTimer=null,uiTimer=null,chainTimer=null;
const request=which=>{if(which===stage)performAction();};
const wild=window.HanziWildGardenStory.create({document:doc,onActionRequest:request});
const tomb=window.HanziTombPirateStory.create({document:doc});
const seed=window.HanziSeedPlanetStory.create({document:doc,onActionRequest:request});
const goose=window.HanziGooseStory.create({document:doc});
const clockbird=window.HanziClockbirdStory.create({document:doc});
const elves=window.HanziElvesStory.create({document:doc});
const modules=[wild,tomb,seed,goose,clockbird,elves],beads=Array.from({length:10},()=>{const b=doc.createElement('i');get('previewBeads').appendChild(b);return b;});
const current=()=>({seed,goose,clockbird,elves})[stage]||(['zoo','butterfly'].includes(stage)?wild:tomb);
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
function playAll(){if(auto||count>=10)return;auto=true;function advance(){next();if(count<10)progressTimer=window.setTimeout(advance,['zoo','laser','arrows'].includes(stage)?2100:stage==='butterfly'?1700:1500);}advance();}
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
