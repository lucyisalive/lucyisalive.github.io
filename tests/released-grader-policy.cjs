'use strict';

// Pure policy checks: no handwriting grading, browser, files, or baseline writes.
// The released comparison must protect every already-correct explicit answer,
// while keeping an unresolved mistake visible as an error rather than blessing it.
const assert=require('node:assert/strict');
const {compareRows}=require('./released-grader-regression.cjs');
const SHA_A='a'.repeat(64),SHA_B='b'.repeat(64);
const row=(id,{expect='pass',actual=expect,target='类',inkSha256=SHA_A}={})=>({id,target,expect,inkSha256,actual});
const metadata=rows=>({schemaVersion:1,rows});
const clone=value=>JSON.parse(JSON.stringify(value));
const sorted=value=>[...value].sort();
const ids=(summary,key,expected)=>assert.deepEqual(sorted(summary[key]),sorted(expected),key);
function accepted(summary){
 assert.equal(summary.ok,true);
 ids(summary,'regressions',[]);ids(summary,'newFailures',[]);ids(summary,'validationErrors',[]);
}
function rejected(summary){assert.equal(summary.ok,false);}
function invalid(summary){rejected(summary);assert.ok(summary.validationErrors.length>0,'Invalid case identity/schema must be rejected');}
let passed=0;
function scenario(name,check){
 try{check();passed++;}catch(error){error.message=name+': '+error.message;throw error;}
}

scenario('unchanged correct pass and fail answers remain protected',()=>{
 const rows=[row('correct-writing'),row('known-missing-stroke',{expect:'fail'})];
 const s=compareRows(clone(rows),metadata(rows));accepted(s);
 assert.equal(s.total,2);assert.equal(s.baselineTotal,2);assert.equal(s.correct,2);
 ids(s,'inheritedErrors',[]);ids(s,'improvements',[]);
});

scenario('correct pass to fail is a new false rejection',()=>{
 const s=compareRows([row('positive',{actual:'fail'})],metadata([row('positive')]));
 rejected(s);ids(s,'regressions',['positive']);ids(s,'inheritedErrors',[]);ids(s,'newFailures',[]);
});

scenario('correct fail to pass is a new false acceptance',()=>{
 const before=row('negative',{expect:'fail'});
 const s=compareRows([{...before,actual:'pass'}],metadata([before]));
 rejected(s);ids(s,'regressions',['negative']);ids(s,'inheritedErrors',[]);ids(s,'newFailures',[]);
});

scenario('a later repaired false rejection cannot return to the earliest bug',()=>{
 const earliest=row('repaired-positive',{actual:'fail'});
 const released={...earliest,actual:'pass'};
 assert.notEqual(earliest.actual,earliest.expect);
 const s=compareRows([earliest],metadata([released]));
 rejected(s);ids(s,'regressions',['repaired-positive']);ids(s,'inheritedErrors',[]);
});

scenario('a later repaired false acceptance cannot return to the earliest bug',()=>{
 const earliest=row('repaired-negative',{expect:'fail',actual:'pass'});
 const released={...earliest,actual:'fail'};
 const s=compareRows([earliest],metadata([released]));
 rejected(s);ids(s,'regressions',['repaired-negative']);ids(s,'inheritedErrors',[]);
});

scenario('unresolved errors remain errors with their original expected labels',()=>{
 const unresolved=[row('still-rejected-correct',{actual:'fail'}),row('still-accepted-wrong',{expect:'fail',actual:'pass'})];
 const s=compareRows(clone(unresolved),metadata(unresolved));accepted(s);
 ids(s,'inheritedErrors',unresolved.map(r=>r.id));ids(s,'improvements',[]);
 assert.equal(s.correct,0,'An inherited wrong verdict must not be counted as correct');
});

scenario('repairing unresolved errors is an improvement in either direction',()=>{
 const before=[row('repair-fn',{actual:'fail'}),row('repair-fp',{expect:'fail',actual:'pass'})];
 const s=compareRows(before.map(r=>({...r,actual:r.expect})),metadata(before));accepted(s);
 ids(s,'improvements',['repair-fn','repair-fp']);ids(s,'inheritedErrors',[]);assert.equal(s.correct,2);
});

scenario('an improved aggregate score cannot offset a newly broken old answer',()=>{
 const before=[row('must-stay-correct'),row('improves-one',{actual:'fail'}),row('improves-two',{expect:'fail',actual:'pass'})];
 const current=[{...before[0],actual:'fail'},...before.slice(1).map(r=>({...r,actual:r.expect}))];
 const s=compareRows(current,metadata(before));rejected(s);
 ids(s,'regressions',['must-stay-correct']);ids(s,'improvements',['improves-one','improves-two']);
 assert.equal(s.correct,2,'The candidate has more correct answers overall and must still fail the gate');
});

scenario('new cases with incorrect explicit answers are new failures',()=>{
 const before=[row('existing')];
 const current=[...before,row('new-fn',{actual:'fail'}),row('new-fp',{expect:'fail',actual:'pass'})];
 const s=compareRows(current,metadata(before));rejected(s);
 ids(s,'newFailures',['new-fn','new-fp']);ids(s,'regressions',[]);ids(s,'inheritedErrors',[]);
});

scenario('new correct cases are reported without modifying the released set',()=>{
 const before=[row('existing')],current=[...before,row('new-correct-positive'),row('new-correct-negative',{expect:'fail'})];
 const s=compareRows(current,metadata(before));accepted(s);
 ids(s,'newCorrect',['new-correct-positive','new-correct-negative']);assert.equal(s.baselineTotal,1);assert.equal(s.total,3);
});

scenario('deleting a released case is rejected',()=>{
 const before=[row('keep'),row('removed')];
 const s=compareRows([before[0]],metadata(before));invalid(s);
 assert.ok(s.validationErrors.some(message=>message.includes('removed')),'Missing-case error should identify the deleted case');
});

for(const [field,value]of [['target','燕'],['expect','fail'],['inkSha256',SHA_B]]){
 scenario('changing the released '+field+' cannot relabel or replace old evidence',()=>{
  const before=row('immutable-evidence'),changed={...before,[field]:value};
  if(field==='expect')changed.actual=value;
  const s=compareRows([changed],metadata([before]));invalid(s);
  ids(s,'regressions',[]);ids(s,'inheritedErrors',[]);ids(s,'improvements',[]);ids(s,'newCorrect',[]);ids(s,'newFailures',[]);
 });
}

scenario('duplicate current IDs cannot overwrite a passing or failing row',()=>{
 const before=row('duplicate');
 invalid(compareRows([before,{...before,actual:'fail'}],metadata([before])));
});

scenario('duplicate released IDs cannot create an ambiguous protection rule',()=>{
 const before=row('duplicate-release');
 invalid(compareRows([before],metadata([before,{...before,actual:'fail'}])));
});

scenario('duplicate IDs among new cases are also rejected',()=>{
 const before=row('existing'),fresh=row('duplicate-new');
 invalid(compareRows([before,fresh,{...fresh,actual:'fail'}],metadata([before])));
});

scenario('unsupported schema versions are rejected',()=>{
 invalid(compareRows([row('a')],{schemaVersion:2,rows:[row('a')]}));
});

scenario('metadata must contain an explicit version and row array',()=>{
 invalid(compareRows([row('a')],{rows:[row('a')]}));
 invalid(compareRows([row('a')],{schemaVersion:1,rows:{}}));
});

scenario('current rows must be an array',()=>{
 invalid(compareRows(null,metadata([row('a')])));
});

for(const [field,value]of [['id',''],['target',''],['expect',null],['expect','unknown'],['actual',null],['actual',true],['inkSha256','']]){
 scenario('malformed current field '+field+'='+String(value)+' is rejected',()=>{
  invalid(compareRows([{...row('a'),[field]:value}],metadata([row('a')])));
 });
}

scenario('a malformed released verdict cannot be treated as an inherited error',()=>{
 invalid(compareRows([row('a')],metadata([row('a',{actual:null})])));
});

scenario('a null row cannot bypass case identity validation',()=>{
 invalid(compareRows([null],metadata([row('a')])));
 invalid(compareRows([row('a')],metadata([null])));
});

scenario('comparison never updates or mutates the frozen release or current rows',()=>{
 const before=metadata([row('protected'),row('inherited',{actual:'fail'})]);
 const current=[row('inherited'),row('protected'),row('new')];
 const originalMetadata=JSON.stringify(before),originalRows=JSON.stringify(current);
 function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
 const s=compareRows(freeze(current),freeze(before));accepted(s);
 assert.equal(JSON.stringify(before),originalMetadata);assert.equal(JSON.stringify(current),originalRows);
 ids(s,'improvements',['inherited']);ids(s,'newCorrect',['new']);
});

console.log('Released grader policy: '+passed+' scenarios passed; repaired answers remain protected, both regression directions fail, unresolved errors stay explicit, and evidence identities are immutable.');
