'use strict';

// The baseline's known mistakes remain mistakes. This comparison gate rejects
// newly wrong verdicts while reporting inherited errors separately.
const fs=require('node:fs');
const path=require('node:path');
const {createGrader,root}=require('../tools/grader-harness.cjs');

async function main(){
  const input=process.argv[2]||'index.html';
  const fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'structural-safety.json'),'utf8'));
  const grader=createGrader({html:fs.readFileSync(path.resolve(root,input),'utf8')});
  const rows=[];
  for(const c of fixture.cases){
    if(!c.observed?.baseline)throw new Error('Missing frozen baseline: '+c.id);
    const result=await grader.grade(c.target,c.s),actual=result.pass?'pass':'fail';
    rows.push({id:c.id,expected:c.expect,baseline:c.observed.baseline,actual,
      regression:c.observed.baseline===c.expect&&actual!==c.expect,
      improvement:c.observed.baseline!==c.expect&&actual===c.expect,
      diagnostics:actual!==c.expect?result.diagnostics:undefined});
  }
  const summary={total:rows.length,correct:rows.filter(r=>r.actual===r.expected).length,
    improved:rows.filter(r=>r.improvement).map(r=>r.id),
    regressions:rows.filter(r=>r.regression).map(r=>r.id),
    inheritedErrors:rows.filter(r=>r.actual!==r.expected&&!r.regression).map(r=>r.id)};
  if(process.argv[3])fs.writeFileSync(path.resolve(root,process.argv[3]),JSON.stringify({summary,rows},null,2)+'\n');
  console.log(JSON.stringify(summary,null,2));
  process.exitCode=summary.regressions.length?1:0;
}
main().catch(e=>{console.error(e);process.exitCode=1;});
