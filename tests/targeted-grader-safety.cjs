'use strict';
// Real grading functions are extracted by the harness; only reference mutations
// live here. Frozen old errors remain visible and never become expected answers.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {createGrader,root}=require('../tools/grader-harness.cjs');
const clone=x=>JSON.parse(JSON.stringify(x));

function densify(stroke,n=97){
 const pts=stroke.map(p=>[p.x,p.y]),lengths=[0];
 for(let i=1;i<pts.length;i++)lengths[i]=lengths[i-1]+Math.hypot(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1]);
 const total=lengths.at(-1),out=[];
 for(let i=0;i<n;i++){
  const distance=total*i/(n-1);let j=1;while(j<pts.length-1&&lengths[j]<distance)j++;
  const f=(distance-lengths[j-1])/Math.max(lengths[j]-lengths[j-1],1e-9);
  out.push([pts[j-1][0]+f*(pts[j][0]-pts[j-1][0]),pts[j-1][1]+f*(pts[j][1]-pts[j-1][1])]);
 }
 return {pts:out,length:total};
}
function buildControls(grader){
 const cases=[];
 for(const char of ['辩','历','收']){
  const ref=grader.reference(char).map(s=>s.map(p=>({x:p.x,y:p.y})));
  const ink=ref.map(s=>s.map(p=>[p.x,p.y]));
  cases.push({id:'standard-'+char,target:char,s:ink,expect:'pass',kind:'standard'});
  cases.push({id:'small-shifted-'+char,target:char,s:ink.map(s=>s.map(p=>[50+p[0]*.65,35+p[1]*.65])),expect:'pass',kind:'standard'});
  for(let index=0;index<ink.length;index++)cases.push({id:'delete-'+char+'-'+(index+1),target:char,s:ink.filter((_,i)=>i!==index),expect:'fail',kind:'deletion'});
  const extra=[[[30,12],[130,12]],[[12,50],[12,150]],[[288,50],[288,150]],[[100,289],[200,289]]];
  extra.forEach((stroke,index)=>cases.push({id:'extra-'+char+'-'+index,target:char,s:[...ink,stroke],expect:'fail',kind:'extra'}));
  const straight={辩:[1,4,5,6,10,13,14,15],历:[0,1,3],收:[1,3,4,5]}[char];
  for(const index of straight){
   const changed=clone(ink),stroke=changed[index],cx=stroke.reduce((a,p)=>a+p[0],0)/stroke.length,cy=stroke.reduce((a,p)=>a+p[1],0)/stroke.length;
   changed[index]=stroke.map(([x,y])=>[cx-(y-cy),cy+(x-cx)]);
   cases.push({id:'rotate90-'+char+'-'+(index+1),target:char,s:changed,expect:'fail',kind:'rotation'});
  }
  ref.forEach((stroke,index)=>{
   const dense=densify(stroke);if(dense.length<60)return;
   const cuts=[24,48,72];
   // A sharp reference corner is a meaningful extra pen-lift location, even
   // when it is far from the middle of the original stroke.
   let best=-1,bestTurn=0,acc=0;
   for(let j=1;j+1<stroke.length;j++){
    acc+=Math.hypot(stroke[j].x-stroke[j-1].x,stroke[j].y-stroke[j-1].y);
    const a=Math.atan2(stroke[j].y-stroke[j-1].y,stroke[j].x-stroke[j-1].x),b=Math.atan2(stroke[j+1].y-stroke[j].y,stroke[j+1].x-stroke[j].x);
    const turn=Math.abs(Math.atan2(Math.sin(b-a),Math.cos(b-a)))*180/Math.PI;
    if(turn>bestTurn){bestTurn=turn;best=Math.round(acc/dense.length*96);}
   }
   if(bestTurn>60&&best>6&&best<90)cuts.push(best);
   for(const cut of [...new Set(cuts)])for(const gap of [0,1]){
    const changed=clone(ink);
    changed.splice(index,1,dense.pts.slice(0,cut+1-gap),dense.pts.slice(cut+gap));
    cases.push({id:'penlift-'+char+'-'+(index+1)+'-'+cut+'-gap'+gap,target:char,s:changed,expect:'pass',kind:'penlift',
      atSharpCorner:cut===best&&bestTurn>60});
   }
  });
 }
 return cases;
}

async function main(){
 const input=process.argv[2]||'index.html';
 const baseline=JSON.parse(fs.readFileSync(path.join(root,'data/targeted-grader-baseline.json'),'utf8'));
 const grader=createGrader({html:fs.readFileSync(path.resolve(root,input),'utf8')});
 const cases=buildControls(grader);
 assert.equal(cases.length,baseline.caseCount,'Reference mutation count changed; review the fixture specification');
 assert.equal(crypto.createHash('sha256').update(JSON.stringify(cases)).digest('hex'),baseline.controlsSha256,'Reference geometry/mutation specification changed');
 const rows=[];
 for(const c of cases){
  assert.ok(Object.hasOwn(baseline.verdicts,c.id),'Missing frozen baseline '+c.id);
  const result=await grader.grade(c.target,c.s),actual=result.pass?'pass':'fail',before=baseline.verdicts[c.id];
  rows.push({id:c.id,kind:c.kind,expect:c.expect,baseline:before,actual,
    regression:before===c.expect&&actual!==c.expect,improvement:before!==c.expect&&actual===c.expect,
    diagnostics:actual!==c.expect?result.diagnostics:undefined});
 }
 const summary={total:rows.length,correct:rows.filter(r=>r.actual===r.expect).length,
  regressions:rows.filter(r=>r.regression).map(r=>r.id),improvements:rows.filter(r=>r.improvement).map(r=>r.id),
  inheritedErrors:rows.filter(r=>r.actual!==r.expect&&!r.regression).map(r=>r.id),byKind:{}};
 for(const kind of ['standard','deletion','extra','rotation','penlift']){
  const subset=rows.filter(r=>r.kind===kind);
  summary.byKind[kind]={total:subset.length,correct:subset.filter(r=>r.actual===r.expect).length,
    regressions:subset.filter(r=>r.regression).map(r=>r.id)};
 }
 if(process.argv[3])fs.writeFileSync(path.resolve(root,process.argv[3]),JSON.stringify({summary,rows},null,2)+'\n');
 console.log(JSON.stringify(summary,null,2));
 process.exitCode=summary.regressions.length?1:0;
}
module.exports={buildControls};
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
