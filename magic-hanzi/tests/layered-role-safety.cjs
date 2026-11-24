'use strict';

// Public reference geometry only. Reviewed private handwriting is tested locally
// in a separate archive and must never be copied into this repository.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(process.argv[3]||path.join(__dirname,'..'));
const html=fs.readFileSync(process.argv[2]||path.join(root,'game-source.html'),'utf8');
const context=vm.createContext({window:{},console:{log(){}},setTimeout,clearTimeout});
for(const file of ['hanzi-data.js','curriculum-hanzi-data.js'])
  vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context);
const start=html.indexOf('function medianToCanvasPoints('),end=html.indexOf('const progressPath =',start);
assert.ok(start>0&&end>start,'The grading source boundaries changed');
const size=html.match(/const CANVAS_SIZE\s*=\s*(\d+)/)[1];
const padding=html.match(/const CANVAS_PADDING\s*=\s*(\d+)/)[1];
vm.runInContext(`const CANVAS_SIZE=${size},CANVAS_PADDING=${padding};let strokesPoints=[];
 async function getCharData(char){return window.HANZI_LOCAL_DATA[char];}function recordInk(){}`,context);
vm.runInContext(html.slice(start,end),context);
const copy=value=>JSON.parse(JSON.stringify(value));
function reference(char){context.char=char;return copy(vm.runInContext(
  'window.HANZI_LOCAL_DATA[char].medians.map(medianToCanvasPoints)',context));}
async function grade(char,ink){context.char=char;context.ink=copy(ink);
  return vm.runInContext('strokesPoints=ink;gradeDrawing(char)',context);}
const centre=stroke=>stroke.reduce((a,p)=>({x:a.x+p.x/stroke.length,y:a.y+p.y/stroke.length}),{x:0,y:0});
function scaleStroke(stroke,factor){const c=centre(stroke);
  return stroke.map(p=>({x:c.x+(p.x-c.x)*factor,y:c.y+(p.y-c.y)*factor}));}
function splitHalf(stroke){
  const length=stroke.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p.x-stroke[i].x,p.y-stroke[i].y),0);
  let covered=0;
  for(let i=1;i<stroke.length;i++){
    const a=stroke[i-1],b=stroke[i],segment=Math.hypot(b.x-a.x,b.y-a.y);
    if(covered+segment>=length/2){
      const t=(length/2-covered)/segment,cut={x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};
      return [[...stroke.slice(0,i),cut],[cut,...stroke.slice(i)]];
    }
    covered+=segment;
  }
  throw new Error('No midpoint');
}

(async()=>{
  let checks=0;
  async function check(char,ink,expected,label){
    assert.equal(await grade(char,ink),expected,char+': '+label);checks++;
  }
  for(const char of ['善','融','建']){
    const ink=reference(char);
    await check(char,ink,true,'complete standard form');
    await check(char,ink.slice().reverse(),true,'independent stroke order');
    await check(char,ink.map(s=>s.map(p=>({x:p.x*.7+30,y:p.y*.7+20}))),true,'whole-character scale and position');
  }

  const short=reference('善');short[4]=scaleStroke(short[4],.2);
  await check('善',short,true,'a short third horizontal still occupies its own layer');
  await check('善',short.slice().reverse(),true,'short horizontal with independent stroke order');
  const lifted=copy(short);lifted.splice(5,1,...splitHalf(lifted[5]));
  await check('善',lifted,true,'the same central stem written in two lifts');
  const missing=copy(short);missing.splice(3,1);missing.push(short[2].map(p=>({x:p.x+16,y:p.y})));
  await check('善',missing,false,'a nearby repeated upper bar cannot replace the missing second layer');
  const rotated=copy(short),mid=centre(rotated[4]);
  rotated[4]=rotated[4].map(p=>({x:mid.x-(p.y-mid.y),y:mid.y+(p.x-mid.x)}));
  await check('善',rotated,false,'a vertical cannot replace the short horizontal');
  const moved=copy(short),head=centre(moved[0]);
  moved[0]=moved[0].map(p=>({x:p.x-head.x+20,y:p.y-head.y+20}));
  await check('善',moved,false,'a distant head mark does not fill its original slot');
  await check('善',[...short,[{x:270,y:265},{x:280,y:275}]],false,'an extra isolated point is still extra');

  const compact=reference('建'),axis=centre(compact[5]).x;
  compact[0]=compact[0].map(p=>({x:axis+(p.x-axis)*.55,y:p.y}));
  for(const role of [1,2,3,4])compact[role]=compact[role].map(p=>({x:axis+(p.x-axis)*.4,y:p.y}));
  await check('建',compact,true,'compact top fold and four complete crossing layers');
  await check('建',compact.slice().reverse(),true,'compact layers with independent stroke order');
  // Counting four horizontal strokes is insufficient: moving a complete bar
  // above its proper fold/stem layer must not be repaired by re-sorting roles.
  for(const role of [1,2,3,4]){
    const wrongLayer=copy(compact);
    wrongLayer[role]=wrongLayer[role].map(p=>({x:p.x,y:p.y-62}));
    await check('建',wrongLayer,false,'a whole horizontal moved into the wrong layer '+role);
    await check('建',wrongLayer.slice().reverse(),false,'wrong horizontal layer with independent stroke order '+role);
  }
  const absent=copy(compact);absent.splice(3,1);
  await check('建',absent,false,'a missing horizontal layer is not compact handwriting');
  const wrongFold=copy(compact),fold=centre(wrongFold[0]);
  wrongFold[0]=wrongFold[0].map(p=>({x:fold.x-(p.y-fold.y),y:fold.y+(p.x-fold.x)}));
  await check('建',wrongFold,false,'a rotated top fold cannot anchor the structure');

  const rong=reference('融'),dot=centre(rong[7]);
  rong[7]=[{x:dot.x-1,y:dot.y-6},{x:dot.x+1,y:dot.y+6}];
  await check('融',rong,true,'a distinct short descending inner mark');
  await check('融',rong.slice().reverse(),true,'short inner mark with independent stroke order');
  // Inherited false accepts for absent inner marks remain explicitly recorded
  // by the private baseline audit; this repair does not claim to resolve them.
  console.log('Layered handwriting: '+checks+' synthetic positive/negative checks passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
