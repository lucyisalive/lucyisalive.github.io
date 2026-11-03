'use strict';

// Distinct pen marks cannot replace a missing stroke merely by restoring the
// count. Keep the separate 22-case and 145-case frozen specifications intact.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {createGrader,root}=require('../tools/grader-harness.cjs');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const metadataFile=path.join(root,'data/yan-face-distinct-baseline.json');

// BEGIN FROZEN DISTINCT-STROKE RULES
function labelledSource(){
  const fixture=JSON.parse(fs.readFileSync(path.join(root,'tests/ipad-2026-11-03-round5.json'),'utf8'));
  const sample=fixture.cases.find(c=>c.id==='ipad-2026-11-03-r5-02');
  assert.ok(sample?.target==='颜'&&sample.expect==='pass'&&sample.rawS?.length===15,
    'Use the explicitly correct final 15-stroke 颜 with exact original ink');
  return sample;
}
function buildControls(){
  const sample=labelledSource(),ink=sample.rawS,cases=[];
  const copy=value=>JSON.parse(JSON.stringify(value));
  function add(missing,duplicate,variant='exact'){
    let repeated=copy(ink[duplicate]);
    if(variant==='offset-3px')repeated=repeated.map(([x,y])=>[x+3,y]);
    else if(variant==='reverse-direction')repeated.reverse();
    else if(variant==='dense-midpoints'){
      const dense=[repeated[0]];
      for(let i=1;i<repeated.length;i++){
        dense.push([(repeated[i-1][0]+repeated[i][0])/2,(repeated[i-1][1]+repeated[i][1])/2],repeated[i]);
      }
      repeated=dense;
    }else assert.equal(variant,'exact');
    cases.push({id:'raw-delete-'+(missing+1)+'-duplicate-'+(duplicate+1)+(variant==='exact'?'':'-'+variant),
      target:'颜',expect:'fail',kind:variant==='exact'?'exact-compensation':'near-compensation',
      variant,missingIndex:missing,duplicateIndex:duplicate,sourceCase:sample.id,
      s:[...copy(ink.filter((_,i)=>i!==missing)),repeated]});
  }
  // All 15*14 omissions paired with a different original stroke. Appending the
  // duplicate preserves the order and every point of all surviving strokes.
  for(let missing=0;missing<15;missing++)for(let duplicate=0;duplicate<15;duplicate++){
    if(missing!==duplicate)add(missing,duplicate);
  }
  // Three representative regressions found by the independent 210-case audit:
  // right-side internal stroke, left-side long stroke, and repeated crossbar.
  // Reverse direction reverses points within only the appended stroke. Density
  // inserts exact segment midpoints, preserving its entire original geometry.
  const representatives=[[13,12],[4,5],[4,1]];
  for(const[missing,duplicate]of representatives){
    for(const variant of ['offset-3px','reverse-direction','dense-midpoints'])add(missing,duplicate,variant);
  }
  return cases;
}
// END FROZEN DISTINCT-STROKE RULES

function generatorSha(){
  const source=fs.readFileSync(__filename,'utf8');
  return hash(source.slice(source.indexOf('// BEGIN FROZEN DISTINCT-STROKE RULES'),source.indexOf('// END FROZEN DISTINCT-STROKE RULES')));
}
async function main(args=process.argv.slice(2)){
  assert.ok(args.length<=2&&args.every(arg=>!arg.startsWith('-')),
    'Usage: node tests/yan-face-distinct-strokes.cjs [candidate.html] [report.json]; the baseline is read-only');
  const baseline=JSON.parse(fs.readFileSync(metadataFile,'utf8'));
  assert.equal(baseline.schemaVersion,1);
  assert.equal(baseline.sourceVersion,'2026.11.03.5');
  assert.equal(generatorSha(),baseline.generatorSha256,'Frozen distinct-stroke rules changed');
  assert.equal(hash(JSON.stringify(labelledSource().rawS)),baseline.sourceInkSha256,'Source original ink changed');
  const cases=buildControls();
  assert.equal(cases.length,baseline.caseCount);
  assert.equal(hash(JSON.stringify(cases)),baseline.controlsSha256,'Frozen compensation geometry changed');
  assert.deepEqual(Object.keys(baseline.verdicts).sort(),cases.map(c=>c.id).sort(),'Frozen verdict ids changed');
  const reportFile=args[1]?path.resolve(root,args[1]):null;
  if(reportFile){
    const target=fs.existsSync(reportFile)?fs.realpathSync(reportFile):reportFile;
    assert.notEqual(target,fs.realpathSync(metadataFile),'A report cannot overwrite the frozen baseline');
  }
  const html=fs.readFileSync(path.resolve(root,args[0]||'index.html'),'utf8');
  const grader=createGrader({html}),rows=[];
  for(const c of cases){
    const result=await grader.grade(c.target,c.s),actual=result.pass?'pass':'fail',before=baseline.verdicts[c.id];
    assert.ok(before==='pass'||before==='fail','Invalid frozen verdict '+c.id);
    rows.push({id:c.id,target:c.target,expect:c.expect,kind:c.kind,variant:c.variant,
      missingIndex:c.missingIndex,duplicateIndex:c.duplicateIndex,inkSha256:hash(JSON.stringify(c.s)),
      baseline:before,actual,regression:before===c.expect&&actual!==c.expect,
      improvement:before!==c.expect&&actual===c.expect,
      filtering:result.recordedInk.at(-1)?.payload?.filtering,
      diagnostics:actual!==c.expect?result.diagnostics:undefined});
  }
  const summary={total:rows.length,correct:rows.filter(r=>r.actual===r.expect).length,
    regressions:rows.filter(r=>r.regression).map(r=>r.id),
    inheritedErrors:rows.filter(r=>r.actual!==r.expect&&!r.regression).map(r=>r.id),
    improvements:rows.filter(r=>r.improvement).map(r=>r.id),byKind:{}};
  for(const kind of ['exact-compensation','near-compensation']){
    const subset=rows.filter(r=>r.kind===kind);
    summary.byKind[kind]={total:subset.length,correct:subset.filter(r=>r.actual===r.expect).length,
      regressions:subset.filter(r=>r.regression).map(r=>r.id)};
  }
  if(reportFile)fs.writeFileSync(reportFile,JSON.stringify({summary,sourceHtmlSha256:hash(html),rows},null,2)+'\n');
  console.log(JSON.stringify(summary,null,2));
  process.exitCode=summary.regressions.length?1:0;
  return{summary,rows};
}
module.exports={buildControls};
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
