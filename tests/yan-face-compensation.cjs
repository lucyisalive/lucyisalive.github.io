'use strict';

// Missing a stroke stays wrong when a repeated dot restores the stroke count.
// The released .5 false acceptances stay visible; they are never expected pass.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {createGrader,root}=require('../tools/grader-harness.cjs');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const metadataFile=path.join(root,'data/yan-face-compensation-baseline.json');

// BEGIN FROZEN COMPENSATION RULES
function labelledSource(){
  const fixture=JSON.parse(fs.readFileSync(path.join(root,'tests/ipad-2026-11-03-round5.json'),'utf8'));
  const sample=fixture.cases.find(c=>c.id==='ipad-2026-11-03-r5-02');
  assert.ok(sample?.target==='颜'&&sample.expect==='pass'&&sample.rawS?.length===15,
    'Use the explicitly correct final 15-stroke 颜 with full original ink');
  return sample;
}
function buildControls(){
  const sample=labelledSource(),ink=sample.rawS,cases=[];
  const copy=value=>JSON.parse(JSON.stringify(value));
  for(let missing=0;missing<ink.length;missing++){
    if(missing===2)continue;
    cases.push({id:'raw-delete-'+(missing+1)+'-duplicate-dot-3',target:'颜',expect:'fail',
      kind:'missing-stroke-compensated-by-duplicate-dot',missingIndex:missing,sourceCase:sample.id,
      s:[...copy(ink.filter((_,i)=>i!==missing)),copy(ink[2])]});
  }
  const corners=[['top-left',20,20],['top-right',280,20],['bottom-left',20,280],['bottom-right',280,280]];
  for(const[name,x,y]of corners){
    for(const[kind,stroke]of [
      ['short-dot',[[x-5,y-5],[x,y],[x+5,y+5]]],
      ['short-line',[[x-12,y],[x,y],[x+12,y]]],
    ])cases.push({id:'raw-delete-dot-3-'+kind+'-'+name,target:'颜',expect:'fail',
      kind:'missing-dot-compensated-at-corner',missingIndex:2,sourceCase:sample.id,
      s:[...copy(ink.filter((_,i)=>i!==2)),stroke]});
  }
  return cases;
}
// END FROZEN COMPENSATION RULES

function generatorSha(){
  const source=fs.readFileSync(__filename,'utf8');
  return hash(source.slice(source.indexOf('// BEGIN FROZEN COMPENSATION RULES'),source.indexOf('// END FROZEN COMPENSATION RULES')));
}
async function main(args=process.argv.slice(2)){
  assert.ok(args.length<=2&&args.every(arg=>!arg.startsWith('-')),
    'Usage: node tests/yan-face-compensation.cjs [candidate.html] [report.json]; the baseline is read-only');
  const baseline=JSON.parse(fs.readFileSync(metadataFile,'utf8'));
  assert.equal(baseline.schemaVersion,1);
  assert.equal(baseline.sourceVersion,'2026.11.03.5');
  assert.equal(generatorSha(),baseline.generatorSha256,'Frozen compensation rules changed');
  const cases=buildControls();
  assert.equal(hash(JSON.stringify(labelledSource().rawS)),baseline.sourceInkSha256,'Source raw ink changed');
  assert.equal(cases.length,baseline.caseCount);
  assert.equal(hash(JSON.stringify(cases)),baseline.controlsSha256,'Frozen compensation geometry changed');
  assert.deepEqual(Object.keys(baseline.verdicts).sort(),cases.map(c=>c.id).sort(),'Frozen verdict ids changed');
  const reportFile=args[1]?path.resolve(root,args[1]):null;
  if(reportFile){
    const target=fs.existsSync(reportFile)?fs.realpathSync(reportFile):reportFile;
    assert.notEqual(target,fs.realpathSync(metadataFile),'A report cannot overwrite the frozen baseline');
  }
  const grader=createGrader({html:fs.readFileSync(path.resolve(root,args[0]||'index.html'),'utf8')});
  const rows=[];
  for(const c of cases){
    const result=await grader.grade(c.target,c.s),actual=result.pass?'pass':'fail',before=baseline.verdicts[c.id];
    assert.ok(before==='pass'||before==='fail','Invalid frozen verdict '+c.id);
    rows.push({id:c.id,target:c.target,expect:c.expect,kind:c.kind,baseline:before,actual,
      inkSha256:hash(JSON.stringify(c.s)),regression:before===c.expect&&actual!==c.expect,
      improvement:before!==c.expect&&actual===c.expect,
      baselineFiltering:baseline.filtering?.[c.id],
      filtering:result.recordedInk.at(-1)?.payload?.filtering,
      diagnostics:actual!==c.expect?result.diagnostics:undefined});
  }
  const summary={total:rows.length,correct:rows.filter(r=>r.actual===r.expect).length,
    regressions:rows.filter(r=>r.regression).map(r=>r.id),
    inheritedErrors:rows.filter(r=>r.actual!==r.expect&&!r.regression).map(r=>r.id),
    improvements:rows.filter(r=>r.improvement).map(r=>r.id)};
  if(reportFile)fs.writeFileSync(reportFile,JSON.stringify({summary,rows},null,2)+'\n');
  console.log(JSON.stringify(summary,null,2));
  process.exitCode=summary.regressions.length?1:0;
  return{summary,rows};
}
module.exports={buildControls};
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
