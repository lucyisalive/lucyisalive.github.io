'use strict';

// Expected answers describe known correct transformations or deliberate mistakes.
// The frozen old verdict is evidence of an inherited bug, never a replacement
// for that expected answer. This generator does not change the older 167 cases.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {createGrader,root}=require('../tools/grader-harness.cjs');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const metadataFile=path.join(root,'data/round4-grader-baseline.json');

// BEGIN FROZEN GENERATION RULES
const GENERATION_RULES={
  version:1,targets:['燕','逃','类'],
  standard:'Original, translated 65% scale, and reversed stroke order; all pass.',
  deletion:'Delete each original stroke, once in normal and once in reversed remaining order; all fail.',
  extra:'Eight isolated long lines at the writing-square edges; all fail.',
  rotation:'Rotate strokes at least 60px long with chord/path >=.9, plus the reviewed non-dot main strokes #3..9 of 类, by +90/-90 degrees about their point centroid; all fail. The two short top dots are excluded.',
  penlift:'Preserve original reference knots, interpolate to <=2px steps, split at 25/50/75% arc length and strongest interior turn >60 degrees. Shared endpoint or 2px omitted path; each remaining piece >=max(12px,.04*glyph diagonal); all pass.',
  classStructure:'类: move both top dots to the same side (fail), triple either dot length (fail), shorten only 大 crossbar to .4/.6/.8 at its original center (pass).',
  componentDeletion:'Delete 燕 four bottom dots, or 逃 walking radical; fail.',
};
const copy=value=>JSON.parse(JSON.stringify(value));
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
function pathLength(stroke){return stroke.slice(1).reduce((sum,p,i)=>sum+distance(stroke[i],p),0);}
function center(stroke){return stroke.reduce((p,q)=>[p[0]+q[0]/stroke.length,p[1]+q[1]/stroke.length],[0,0]);}
function diagonal(strokes){const points=strokes.flat(),xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);return Math.hypot(Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys));}
function dense(stroke){
 const out=[stroke[0].slice()];
 for(let i=1;i<stroke.length;i++){
  const a=stroke[i-1],b=stroke[i],n=Math.max(1,Math.ceil(distance(a,b)/2));
  for(let j=1;j<=n;j++)out.push([a[0]+(b[0]-a[0])*j/n,a[1]+(b[1]-a[1])*j/n]);
 }
 return out;
}
function splitAt(stroke,wanted){
 let travelled=0;
 for(let i=1;i<stroke.length;i++){
  const a=stroke[i-1],b=stroke[i],length=distance(a,b);
  if(travelled+length>=wanted){
   const f=length?(wanted-travelled)/length:0,p=[a[0]+(b[0]-a[0])*f,a[1]+(b[1]-a[1])*f];
   return [[...stroke.slice(0,i),p],[p.slice(),...stroke.slice(i)]];
  }
  travelled+=length;
 }
 throw new Error('Invalid pen-lift split');
}
function strongestCorner(stroke){
 let travelled=0,best={turn:0,distance:0};
 for(let i=1;i+1<stroke.length;i++){
  travelled+=distance(stroke[i-1],stroke[i]);
  const a=Math.atan2(stroke[i][1]-stroke[i-1][1],stroke[i][0]-stroke[i-1][0]);
  const b=Math.atan2(stroke[i+1][1]-stroke[i][1],stroke[i+1][0]-stroke[i][0]);
  const turn=Math.abs(Math.atan2(Math.sin(b-a),Math.cos(b-a)))*180/Math.PI;
  if(turn>best.turn)best={turn,distance:travelled};
 }
 return best;
}
function buildControls(grader){
 const cases=[];
 const add=(id,target,s,expect,kind,extra={})=>cases.push({id,target,s,expect,kind,...extra});
 for(const char of GENERATION_RULES.targets){
  const ink=grader.reference(char).map(stroke=>stroke.map(p=>[p.x,p.y]));
  add('standard-'+char,char,ink,'pass','standard');
  add('small-shifted-'+char,char,ink.map(s=>s.map(([x,y])=>[50+x*.65,35+y*.65])),'pass','standard');
  add('reordered-'+char,char,ink.slice().reverse(),'pass','standard');
  for(let index=0;index<ink.length;index++)for(const reversed of [false,true]){
   let changed=ink.filter((_,i)=>i!==index);if(reversed)changed=changed.slice().reverse();
   add('delete-'+char+'-'+(index+1)+(reversed?'-reversed':''),char,changed,'fail','deletion',{strokeOneBased:index+1});
  }
  const extra=[[[20,6],[280,6]],[[20,294],[280,294]],[[6,20],[6,280]],[[294,20],[294,280]],
   [[12,3],[112,3]],[[188,297],[288,297]],[[3,188],[3,288]],[[297,12],[297,112]]];
  extra.forEach((stroke,index)=>add('extra-'+char+'-'+index,char,[...ink,stroke],'fail','extra'));
  ink.forEach((stroke,index)=>{
   const length=pathLength(stroke);
   if((length>=60&&distance(stroke[0],stroke.at(-1))/length>=.9)||(char==='类'&&index>=2)){
    const [cx,cy]=center(stroke);
    for(const sign of [-1,1]){
     const changed=copy(ink);
     changed[index]=stroke.map(([x,y])=>[cx-sign*(y-cy),cy+sign*(x-cx)]);
     add('rotate90-'+char+'-'+(index+1)+'-'+sign,char,changed,'fail','rotation',{strokeOneBased:index+1});
    }
   }
   const minPiece=Math.max(12,diagonal(ink)*.04),corner=strongestCorner(stroke);
   const cuts=[{name:'25',distance:length*.25},{name:'50',distance:length*.5},{name:'75',distance:length*.75}];
   if(corner.turn>60&&!cuts.some(c=>Math.abs(c.distance-corner.distance)<1e-6))cuts.push({name:'corner',distance:corner.distance});
   for(const cut of cuts)for(const gap of [0,2]){
    if(cut.distance-gap/2<minPiece||length-cut.distance-gap/2<minPiece)continue;
    const interpolated=dense(stroke),left=splitAt(interpolated,cut.distance-gap/2)[0],right=splitAt(interpolated,cut.distance+gap/2)[1];
    const changed=ink.slice();changed.splice(index,1,left,right);
    add('penlift-'+char+'-'+(index+1)+'-'+cut.name+'-gap'+gap,char,changed,'pass','penlift',
      {strokeOneBased:index+1,atSharpCorner:cut.name==='corner',gapPixels:gap});
   }
  });
  if(char==='类'){
   const top=ink.slice(0,6).flat(),middle=(Math.min(...top.map(p=>p[0]))+Math.max(...top.map(p=>p[0])))/2;
   const left=center(ink[0])[0],right=center(ink[1])[0];
   assert.ok(left<middle&&right>middle,'Reviewed 类 dot indexes changed');
   for(const [name,x]of [['left',left],['right',right]]){
    const changed=copy(ink);
    for(const index of [0,1]){const cx=center(ink[index])[0];changed[index]=ink[index].map(([px,py])=>[px-cx+x,py]);}
    add('both-dots-'+name+'-类',char,changed,'fail','structure');
   }
   for(const index of [0,1]){
    const changed=copy(ink),[cx,cy]=center(ink[index]);
    changed[index]=ink[index].map(([x,y])=>[cx+(x-cx)*3,cy+(y-cy)*3]);
    add('overlong-dot-类-'+(index+1),char,changed,'fail','structure');
   }
   const [cx,cy]=center(ink[6]);
   for(const scale of [.4,.6,.8]){
    const changed=copy(ink);changed[6]=ink[6].map(([x,y])=>[cx+(x-cx)*scale,cy+(y-cy)*scale]);
    add('short-crossbar-类-'+scale,char,changed,'pass','proportion');
   }
  }
  if(char==='燕')add('missing-bottom-dots-燕',char,ink.slice(0,12),'fail','structure');
  if(char==='逃')add('missing-walking-radical-逃',char,ink.slice(0,6),'fail','structure');
 }
 return cases;
}
// END FROZEN GENERATION RULES

function generatorSha(){const source=fs.readFileSync(__filename,'utf8');return hash(source.slice(source.indexOf('// BEGIN FROZEN GENERATION RULES'),source.indexOf('// END FROZEN GENERATION RULES')));}
async function evaluate(grader,cases,baseline){
 const rows=[];
 for(const c of cases){
  if(baseline)assert.ok(Object.hasOwn(baseline.verdicts,c.id),'Missing baseline '+c.id);
  const result=await grader.grade(c.target,c.s),actual=result.pass?'pass':'fail',before=baseline?.verdicts[c.id];
  rows.push({id:c.id,target:c.target,kind:c.kind,expect:c.expect,baseline:before,actual,
   regression:before===c.expect&&actual!==c.expect,improvement:before!==undefined&&before!==c.expect&&actual===c.expect,
   diagnostics:actual!==c.expect?result.diagnostics:undefined});
 }
 return rows;
}
function summarize(rows){
 const result={total:rows.length,correct:rows.filter(r=>r.actual===r.expect).length,
  regressions:rows.filter(r=>r.regression).map(r=>r.id),improvements:rows.filter(r=>r.improvement).map(r=>r.id),
  inheritedErrors:rows.filter(r=>r.actual!==r.expect&&!r.regression).map(r=>r.id),byKind:{}};
 for(const kind of [...new Set(rows.map(r=>r.kind))]){
  const subset=rows.filter(r=>r.kind===kind);result.byKind[kind]={total:subset.length,correct:subset.filter(r=>r.actual===r.expect).length,
   regressions:subset.filter(r=>r.regression).map(r=>r.id)};
 }
 return result;
}
async function freeze(){
 assert.equal(fs.existsSync(metadataFile),false,'Refuse to replace the frozen baseline');
 const html=fs.readFileSync(path.join(root,'work/round4/baseline.html'),'utf8');
 const source=fs.readFileSync(path.join(root,'work/round4/baseline-game-source.html'),'utf8');
 const cases=buildControls(createGrader({html}));
 assert.ok(cases.length>=250&&cases.length<=400,'Keep the reviewed safety set between 250 and 400 cases: '+cases.length);
 const rows=await evaluate(createGrader({html}),cases),summary=summarize(rows);
 const baseline={schemaVersion:1,description:'Frozen 2026.11.03.3 controls before round-4 grading changes. Explicit expected answers remain in the generator; inherited errors are reported, never accepted as correct.',
  sourceHtmlSha256:hash(html),sourceTemplateSha256:hash(source),sourceVersion:'2026.11.03.3',generatorSha256:generatorSha(),
  glyphSourcesSha256:Object.fromEntries(['hanzi-data.js','curriculum-hanzi-data.js'].map(file=>[file,hash(fs.readFileSync(path.join(root,file)))])),
  caseCount:cases.length,controlsSha256:hash(JSON.stringify(cases)),generationRules:GENERATION_RULES,
  baselineSummary:summary,verdicts:Object.fromEntries(rows.map(r=>[r.id,r.actual]))};
 fs.writeFileSync(metadataFile,JSON.stringify(baseline,null,2)+'\n');
 fs.writeFileSync(path.join(root,'work/round4/safety-baseline-report.json'),JSON.stringify({summary,rows},null,2)+'\n');
 console.log(JSON.stringify(summary,null,2));
}
async function main(){
 if(process.argv.includes('--freeze'))return freeze();
 const baseline=JSON.parse(fs.readFileSync(metadataFile,'utf8'));
 assert.equal(generatorSha(),baseline.generatorSha256,'Generation rules changed; review the frozen specification');
 for(const[file,sha]of Object.entries(baseline.glyphSourcesSha256))assert.equal(hash(fs.readFileSync(path.join(root,file))),sha,'Reference data changed: '+file);
 const input=process.argv[2]||'index.html',grader=createGrader({html:fs.readFileSync(path.resolve(root,input),'utf8')}),cases=buildControls(grader);
 assert.equal(cases.length,baseline.caseCount);assert.equal(hash(JSON.stringify(cases)),baseline.controlsSha256,'Reference geometry or mutations changed');
 const rows=await evaluate(grader,cases,baseline),summary=summarize(rows);
 if(process.argv[3])fs.writeFileSync(path.resolve(root,process.argv[3]),JSON.stringify({summary,rows},null,2)+'\n');
 console.log(JSON.stringify(summary,null,2));process.exitCode=summary.regressions.length?1:0;
}
module.exports={buildControls,GENERATION_RULES};
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
