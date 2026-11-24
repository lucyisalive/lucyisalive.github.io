'use strict';

// Real source functions with standard reference geometry only. Private reviewed
// handwriting is replayed separately on the parent's computer, never in this repo.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'game-source.html'),'utf8');
const context=vm.createContext({window:{},console:{log(){}},setTimeout,clearTimeout});
for(const name of ['hanzi-data.js','curriculum-hanzi-data.js']){
  vm.runInContext(fs.readFileSync(path.join(root,name),'utf8'),context);
}
const fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/reviewed-component-medians.json'),'utf8'));
Object.assign(context.window.HANZI_LOCAL_DATA,fixture.glyphs);
const start=html.indexOf('function medianToCanvasPoints('),end=html.indexOf('const progressPath =',start);
assert.ok(start>0 && end>start,'The grading source boundaries changed');
const size=html.match(/const CANVAS_SIZE\s*=\s*(\d+)/)[1];
const padding=html.match(/const CANVAS_PADDING\s*=\s*(\d+)/)[1];
vm.runInContext(`const CANVAS_SIZE=${size},CANVAS_PADDING=${padding};
  let strokesPoints=[];
  async function getCharData(char){return window.HANZI_LOCAL_DATA[char];}
  function recordInk(){}
`,context);
vm.runInContext(html.slice(start,end),context);
const copy=value=>JSON.parse(JSON.stringify(value));
function reference(char){context.character=char;return copy(vm.runInContext(
  'window.HANZI_LOCAL_DATA[character].medians.map(medianToCanvasPoints)',context));}
async function grade(char,ink){context.character=char;context.input=copy(ink);return vm.runInContext(
  'strokesPoints=input;gradeDrawing(character)',context);}
const transform=(ink,ids,scaleX,scaleY)=>{
  const next=copy(ink),points=ids.flatMap(i=>next[i]);
  const cx=(Math.min(...points.map(p=>p.x))+Math.max(...points.map(p=>p.x)))/2;
  const cy=(Math.min(...points.map(p=>p.y))+Math.max(...points.map(p=>p.y)))/2;
  for(const index of ids)for(const point of next[index]){
    point.x=cx+(point.x-cx)*scaleX;point.y=cy+(point.y-cy)*scaleY;
  }
  return next;
};

(async()=>{
  let checks=0;
  const check=async(char,ink,expected,label)=>{assert.equal(await grade(char,ink),expected,label);checks++;};
  for(const char of ['类','耸','念','麻','悄']){
    const ink=reference(char);
    await check(char,ink,true,char+' standard form');
    await check(char,ink.slice().reverse(),true,char+' independent writing order');
    await check(char,ink.map(s=>s.map(p=>({x:p.x*.73+33,y:p.y*.73+27}))),true,char+' whole-character scale/position');
  }
  // Uneven but complete components can still be read. The tests alter standard
  // geometry rather than copying an exact child's path or its recorded verdict.
  await check('类',transform(reference('类'),[0,1,2,3,4,5],.65,1),true,'narrow but complete 米');
  await check('念',transform(reference('念'),[0,1,2,3],.64,.64),true,'smaller 今 above intact 心');
  const shao=reference('悄');
  shao[5]=transform([shao[5]],[0],.35,.35)[0];
  await check('悄',shao,true,'short but present upper-right mark');
  // Missing strokes cannot be explained by the new point or proportion options.
  for(const [char,role] of [['类',0],['类',1],['耸',3],['耸',8],['念',3],['念',5],['麻',9],['悄',5],['悄',8]]){
    const ink=reference(char);ink.splice(role,1);
    await check(char,ink,false,char+' missing distinct role '+role);
  }
  const extra=reference('类');extra.push(copy(extra[0]).map(p=>({x:p.x+40,y:p.y-12})));
  await check('类',extra,false,'an extra separate point is not a retrace');
  const wrongWood=reference('麻');
  const origin=wrongWood[6][0];
  wrongWood[6]=wrongWood[6].map(p=>({x:origin.x-(p.x-origin.x)*3,y:origin.y+(p.y-origin.y)*3}));
  await check('麻',wrongWood,false,'a long left-going branch is not the reviewed right sweep');
  console.log('Reviewed component roles: '+checks+' synthetic positive/negative checks passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
