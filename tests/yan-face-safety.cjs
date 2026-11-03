'use strict';

// 颜 only. Expected answers describe the written content independently of the
// grader. The .5 verdicts protect its already-correct answers; old mistakes stay
// visible. Reference and recorded ink are generated/read, not duplicated here.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const {createGrader,root}=require('../tools/grader-harness.cjs');
const metadataFile=path.join(root,'data/yan-face-baseline.json');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');

// BEGIN FROZEN YAN FACE RULES
const RULES={version:1,target:'颜',parts:{彦:[0,9],产:[0,6],彡:[6,9],页:[9,15]},
 expected:'Only the final 15-stroke raw iPad trace is human-confirmed pass. The first 12-stroke trace remains null. Delete a complete stroke or a whole part, add an isolated long mark, or remove a real arm of 页横折: fail.',
 pointBoundary:'The small left point (#3) may be doubled or 2.5x and may be a short vertical mark within its original horizontal bounds. Extreme 8x/12x marks crossing the whole 产 region, or superposing the two marks on the same reference location, are deliberate errors. Do not classify a slight point-angle change as wrong.',
 pageCorner:'页 #13 is 横折 with midTurn about88deg, hookTurn about23deg. It has no independent hook; negatives remove a horizontal/vertical arm, never an invented hook.',
 penlift:'Only reference strokes >=60px. Preserve knots; interpolate <=2px; split at25/50/75% plus an interior sharp corner, no gap or2px path gap; remaining pieces >=12px. These are pass.'};
const clone=value=>JSON.parse(JSON.stringify(value));
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const length=stroke=>stroke.slice(1).reduce((sum,p,i)=>sum+distance(stroke[i],p),0);
const center=stroke=>stroke.reduce((sum,p)=>[sum[0]+p[0]/stroke.length,sum[1]+p[1]/stroke.length],[0,0]);
function line(a,b){return Array.from({length:17},(_,i)=>[a[0]+(b[0]-a[0])*i/16,a[1]+(b[1]-a[1])*i/16]);}
function stretch(stroke,factor){const [cx,cy]=center(stroke);return stroke.map(([x,y])=>[cx+(x-cx)*factor,cy+(y-cy)*factor]);}
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
  const a=stroke[i-1],b=stroke[i],step=distance(a,b);
  if(travelled+step>=wanted){
   const f=step?(wanted-travelled)/step:0,p=[a[0]+(b[0]-a[0])*f,a[1]+(b[1]-a[1])*f];
   return [[...stroke.slice(0,i),p],[p.slice(),...stroke.slice(i)]];
  }
  travelled+=step;
 }
 throw new Error('Invalid cut');
}
function sharpCorner(stroke){
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
function realCases(){
 const data=JSON.parse(fs.readFileSync(path.join(root,'tests/ipad-2026-11-03-round5.json'),'utf8'));
 const first=data.cases.find(c=>c.id==='ipad-2026-11-03-r5-01'),last=data.cases.find(c=>c.id==='ipad-2026-11-03-r5-02');
 assert.ok(first?.target==='颜'&&first.expect===null&&first.rawS?.length===12,'The first 颜 must remain unlabelled');
 assert.ok(last?.target==='颜'&&last.expect==='pass'&&last.rawS?.length===15&&last.timestamp===1793713893163,'Use only the confirmed final 颜');
 return {first,last};
}
function buildControls(grader){
 const ink=grader.reference('颜').map(s=>s.map(p=>[p.x,p.y])),cases=[];
 assert.equal(ink.length,15,'Reviewed 颜 reference changed');
 const add=(id,s,expect,kind,extra={})=>cases.push({id,target:'颜',s,expect,kind,...extra});
 add('standard',ink,'pass','standard');
 add('small-shifted',ink.map(s=>s.map(([x,y])=>[50+.65*x,35+.65*y])),'pass','standard');
 add('reordered',ink.slice().reverse(),'pass','standard');
 const {first,last}=realCases();
 add('human-final-15',last.rawS,'pass','human',{sourceCase:last.id});
 add('unlabelled-first-12',first.rawS,null,'unlabelled',{sourceCase:first.id});
 ink.forEach((_,index)=>{
  const missing=ink.filter((_,i)=>i!==index);
  add('delete-reference-'+(index+1),missing,'fail','reference-deletion');
  add('delete-reference-'+(index+1)+'-reversed',missing.slice().reverse(),'fail','reference-deletion');
 });
 last.rawS.forEach((_,index)=>add('delete-human-final-'+(index+1),last.rawS.filter((_,i)=>i!==index),'fail','real-ink-deletion',{sourceCase:last.id}));
 const extras=[[[20,6],[280,6]],[[20,294],[280,294]],[[6,20],[6,280]],[[294,20],[294,280]],
  [[12,3],[112,3]],[[188,297],[288,297]],[[3,188],[3,288]],[[297,12],[297,112]]];
 extras.forEach((s,i)=>add('extra-reference-'+i,[...ink,s],'fail','extra'));
 extras.slice(0,4).forEach((s,i)=>add('extra-human-final-'+i,[...last.rawS,s],'fail','extra',{sourceCase:last.id}));
 for(const index of [1,4,5,6,7,8,9,11,13]){
  const [cx,cy]=center(ink[index]);
  for(const sign of [-1,1]){
   const changed=clone(ink);changed[index]=ink[index].map(([x,y])=>[cx-sign*(y-cy),cy+sign*(x-cx)]);
   add('rotate-main-'+(index+1)+'-'+sign,changed,'fail','rotation');
  }
 }
 const frame=ink[12],xs=frame.map(p=>p[0]),ys=frame.map(p=>p[1]);
 for(const [name,replacement]of [
  ['missing-vertical-arm',line(frame[0],[Math.max(...xs),frame[0][1]])],
  ['missing-horizontal-arm',line([Math.max(...xs),Math.min(...ys)],[Math.max(...xs),Math.max(...ys)])],
 ]){const changed=clone(ink);changed[12]=replacement;add('page-fold-'+name,changed,'fail','shape-error');}
 for(const [name,[a,b]]of Object.entries(RULES.parts))add('missing-part-'+name,ink.filter((_,i)=>i<a||i>=b),'fail','part-deletion');
 add('written-as-顾',grader.reference('顾').map(s=>s.map(p=>[p.x,p.y])),'fail','wrong-character');
 const leftCenter=center(ink.slice(0,9).flat()),rightCenter=center(ink.slice(9).flat());
 add('swapped-彦-页',ink.map((s,i)=>s.map(([x,y])=>[x+(i<9?1:-1)*(rightCenter[0]-leftCenter[0]),y])),'fail','layout');
 for(const factor of [8,12]){const changed=clone(ink);changed[2]=stretch(ink[2],factor);add('left-point-extreme-'+factor,changed,'fail','point-error');}
 for(const [name,moving,destination]of [['both-at-right',2,3],['both-at-left',3,2]]){
  const changed=clone(ink),from=center(ink[moving]),to=center(ink[destination]);
  changed[moving]=ink[moving].map(([x,y])=>[x-from[0]+to[0],y-from[1]+to[1]]);
  add('points-'+name,changed,'fail','point-error');
 }
 {
  const [cx,cy]=center(ink[3]);
  const changed=clone(ink);changed[3]=line([cx-45,cy],[cx+45,cy]);
  add('right-short-fall-as-long-horizontal',changed,'fail','shape-error');
  const rotated=clone(ink);rotated[3]=ink[3].map(([x,y])=>[cx-(y-cy),cy+(x-cx)]);
  add('right-short-fall-rotate90',rotated,'fail','shape-error');
 }
 for(const factor of [2,2.5]){const changed=clone(ink);changed[2]=stretch(ink[2],factor);add('left-point-local-'+factor,changed,'pass','local-proportion');}
 {
  const changed=clone(ink),[cx,cy]=center(ink[2]),half=length(ink[2]);
  changed[2]=line([cx,cy-half],[cx,cy+half]);
  add('left-point-local-vertical',changed,'pass','local-proportion');
 }
 ink.forEach((stroke,index)=>{
  const size=length(stroke);if(size<60)return;
  const cuts=[{name:'25',distance:size*.25},{name:'50',distance:size*.5},{name:'75',distance:size*.75}],corner=sharpCorner(stroke);
  if(corner.turn>60&&!cuts.some(c=>Math.abs(c.distance-corner.distance)<1e-6))cuts.push({name:'corner',distance:corner.distance});
  for(const cut of cuts)for(const gap of [0,2]){
   if(cut.distance-gap/2<12||size-cut.distance-gap/2<12)continue;
   const interpolated=dense(stroke),a=splitAt(interpolated,cut.distance-gap/2)[0],b=splitAt(interpolated,cut.distance+gap/2)[1];
   const changed=ink.slice();changed.splice(index,1,a,b);
   add('penlift-'+(index+1)+'-'+cut.name+'-gap'+gap,changed,'pass','penlift',{atSharpCorner:cut.name==='corner',gapPixels:gap});
  }
 });
 return cases;
}
// END FROZEN YAN FACE RULES

function generatorSha(){const source=fs.readFileSync(__filename,'utf8');return hash(source.slice(source.indexOf('// BEGIN FROZEN YAN FACE RULES'),source.indexOf('// END FROZEN YAN FACE RULES')));}
async function evaluate(grader,cases,baseline){
 const rows=[];
 for(const c of cases){
  assert.ok(c.expect===null||c.expect==='pass'||c.expect==='fail');
  const before=baseline?.rows.find(row=>row.id===c.id);
  const result=await grader.grade(c.target,c.s),actual=result.pass?'pass':'fail';
  const inkSha256=hash(JSON.stringify(c.s));
  if(baseline){assert.ok(before,'Missing baseline '+c.id);for(const field of ['target','expect','inkSha256'])assert.equal({target:c.target,expect:c.expect,inkSha256}[field],before[field],'Changed '+field+': '+c.id);}
  rows.push({id:c.id,target:c.target,expect:c.expect,kind:c.kind,inkSha256,actual,baseline:before?.actual,
   regression:c.expect!==null&&before?.actual===c.expect&&actual!==c.expect,
   improvement:c.expect!==null&&before!==undefined&&before.actual!==c.expect&&actual===c.expect,
   unlabelledChanged:c.expect===null&&before!==undefined&&before.actual!==actual,
   diagnostics:c.expect!==null&&actual!==c.expect?result.diagnostics:undefined});
 }
 return rows;
}
function summarize(rows){return {total:rows.length,labelled:rows.filter(r=>r.expect!==null).length,
 correct:rows.filter(r=>r.expect!==null&&r.actual===r.expect).length,
 regressions:rows.filter(r=>r.regression).map(r=>r.id),improvements:rows.filter(r=>r.improvement).map(r=>r.id),
 inheritedErrors:rows.filter(r=>r.expect!==null&&r.actual!==r.expect&&!r.regression).map(r=>r.id),
 unlabelled:rows.filter(r=>r.expect===null).map(r=>({id:r.id,actual:r.actual,baseline:r.baseline,changed:r.unlabelledChanged}))};}
async function main(){
 if(process.argv.includes('--freeze')){
  assert.equal(fs.existsSync(metadataFile),false,'Refuse to replace frozen .5 data');
  const commit=cp.execFileSync('git',['rev-parse','17c1d00'],{cwd:root,encoding:'utf8'}).trim();
  const html=cp.execFileSync('git',['show',commit+':index.html'],{cwd:root,encoding:'utf8',maxBuffer:4*1024*1024});
  const grader=createGrader({html}),cases=buildControls(grader),rows=await evaluate(grader,cases),summary=summarize(rows);
  const baseline={schemaVersion:1,sourceVersion:'2026.11.03.5',sourceCommit:commit,sourceHtmlSha256:hash(html),
   generatorSha256:generatorSha(),controlsSha256:hash(JSON.stringify(cases)),caseCount:cases.length,generationRules:RULES,
   glyphSourcesSha256:Object.fromEntries(['hanzi-data.js','curriculum-hanzi-data.js'].map(file=>[file,hash(fs.readFileSync(path.join(root,file)))])),
   baselineSummary:summary,rows:rows.map(({id,target,expect,inkSha256,actual})=>({id,target,expect,inkSha256,actual}))};
  fs.writeFileSync(metadataFile,JSON.stringify(baseline,null,2)+'\n');
  const directory=path.join(root,'work/yan-face-safety');fs.mkdirSync(directory,{recursive:true});
  fs.writeFileSync(path.join(directory,'baseline-report.json'),JSON.stringify({summary,rows},null,2)+'\n');
  console.log(JSON.stringify(summary,null,2));return;
 }
 const baseline=JSON.parse(fs.readFileSync(metadataFile,'utf8'));
 assert.equal(baseline.schemaVersion,1);assert.equal(baseline.sourceVersion,'2026.11.03.5');assert.equal(generatorSha(),baseline.generatorSha256);
 for(const[file,sha]of Object.entries(baseline.glyphSourcesSha256))assert.equal(hash(fs.readFileSync(path.join(root,file))),sha,'Reference data changed');
 const input=process.argv[2]||'index.html',grader=createGrader({html:fs.readFileSync(path.resolve(root,input),'utf8')}),cases=buildControls(grader);
 assert.equal(cases.length,baseline.caseCount);assert.equal(hash(JSON.stringify(cases)),baseline.controlsSha256,'Control rules, labels, or ink changed');
 const rows=await evaluate(grader,cases,baseline),summary=summarize(rows);
 if(process.argv[3]){
  const output=path.resolve(root,process.argv[3]);
  assert.notEqual(fs.existsSync(output)?fs.realpathSync(output):output,fs.realpathSync(metadataFile),'Do not overwrite frozen data with a report');
  fs.writeFileSync(output,JSON.stringify({summary,rows},null,2)+'\n');
 }
 console.log(JSON.stringify(summary,null,2));process.exitCode=summary.regressions.length?1:0;
}
module.exports={buildControls,RULES};
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
