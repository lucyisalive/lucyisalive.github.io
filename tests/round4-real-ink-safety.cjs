'use strict';

// Keep the 277 reference controls frozen. This complementary set removes one
// complete stroke from the user's explicitly correct merged-stroke 燕. An extra
// rescue must not invent further merges to hide those known missing strokes.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {createGrader,root}=require('../tools/grader-harness.cjs');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const metadataFile=path.join(root,'data/round4-real-ink-baseline.json');
// BEGIN FROZEN REAL-INK RULES
function labelledSource(){
 const fixture=JSON.parse(fs.readFileSync(path.join(root,'tests/ipad-2026-11-03-round4.json'),'utf8'));
 const sample=fixture.cases.find(c=>c.id==='ipad-2026-11-03-r4-05');
 assert.ok(sample?.target==='燕'&&sample.expect==='pass'&&sample.formatVersion===2&&sample.rawS?.length===14,
  'Use only the explicitly correct final 燕 with full original ink');
 return sample;
}
function buildControls(){
 const sample=labelledSource();
 return sample.rawS.map((_,index)=>({id:'raw-delete-燕-'+(index+1),target:'燕',
  s:sample.rawS.filter((_,i)=>i!==index),expect:'fail',kind:'real-ink-deletion',sourceCase:sample.id,strokeOneBased:index+1}));
}
// END FROZEN REAL-INK RULES
function generatorSha(){const source=fs.readFileSync(__filename,'utf8');return hash(source.slice(source.indexOf('// BEGIN FROZEN REAL-INK RULES'),source.indexOf('// END FROZEN REAL-INK RULES')));}
async function evaluate(grader,cases,baseline){
 const rows=[];
 for(const c of cases){
  if(baseline)assert.ok(Object.hasOwn(baseline.verdicts,c.id));
  const result=await grader.grade(c.target,c.s),actual=result.pass?'pass':'fail',before=baseline?.verdicts[c.id];
  rows.push({id:c.id,expect:c.expect,actual,baseline:before,regression:before===c.expect&&actual!==c.expect,
   improvement:before!==undefined&&before!==c.expect&&actual===c.expect,diagnostics:actual!==c.expect?result.diagnostics:undefined});
 }
 return rows;
}
function summary(rows){return {total:rows.length,correct:rows.filter(r=>r.actual===r.expect).length,
 regressions:rows.filter(r=>r.regression).map(r=>r.id),improvements:rows.filter(r=>r.improvement).map(r=>r.id),
 inheritedErrors:rows.filter(r=>r.actual!==r.expect&&!r.regression).map(r=>r.id)};}
async function main(){
 const cases=buildControls(),source=labelledSource(),geometrySha=hash(JSON.stringify(source.rawS));
 if(process.argv.includes('--freeze')){
  assert.equal(fs.existsSync(metadataFile),false,'Refuse to replace frozen real-ink verdicts');
  const html=fs.readFileSync(path.join(root,'work/round4/baseline.html'),'utf8');
  const rows=await evaluate(createGrader({html}),cases);
  const metadata={schemaVersion:1,description:'Each complete pen stroke deleted from the explicitly correct final 14-stroke 燕. All are deliberately incomplete and must fail; old incorrect acceptances remain inherited errors.',
   sourceHtmlSha256:hash(html),sourceCase:source.id,sourceGeometrySha256:geometrySha,sourceVersion:'2026.11.03.3',
   generatorSha256:generatorSha(),caseCount:cases.length,controlsSha256:hash(JSON.stringify(cases)),
   baselineSummary:summary(rows),verdicts:Object.fromEntries(rows.map(r=>[r.id,r.actual]))};
  fs.writeFileSync(metadataFile,JSON.stringify(metadata,null,2)+'\n');
  fs.writeFileSync(path.join(root,'work/round4/real-ink-safety-baseline-report.json'),JSON.stringify({summary:summary(rows),rows},null,2)+'\n');
  console.log(JSON.stringify(summary(rows),null,2));return;
 }
 const metadata=JSON.parse(fs.readFileSync(metadataFile,'utf8'));
 assert.equal(generatorSha(),metadata.generatorSha256);assert.equal(geometrySha,metadata.sourceGeometrySha256);
 assert.equal(cases.length,metadata.caseCount);assert.equal(hash(JSON.stringify(cases)),metadata.controlsSha256);
 const html=fs.readFileSync(path.resolve(root,process.argv[2]||'index.html'),'utf8');
 const rows=await evaluate(createGrader({html}),cases,metadata),result=summary(rows);
 if(process.argv[3])fs.writeFileSync(path.resolve(root,process.argv[3]),JSON.stringify({summary:result,rows},null,2)+'\n');
 console.log(JSON.stringify(result,null,2));process.exitCode=result.regressions.length?1:0;
}
module.exports={buildControls};
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
