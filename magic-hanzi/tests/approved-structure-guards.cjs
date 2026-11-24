'use strict';

// Only bundled standard medians and derived geometry enter this public test.
// The original handwriting and its human labels stay in the private archive.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(process.argv[2]||path.join(root,'game-source.html'),'utf8');
const data=require('./approved-structure-glyphs.json').glyphs;
const start=html.indexOf('function medianToCanvasPoints(');
const end=html.indexOf('const progressPath =',start);
assert.ok(start>0&&end>start,'The actual grading source boundary changed');
const context=vm.createContext({window:{HANZI_LOCAL_DATA:data},console:{log(){}},setTimeout,clearTimeout});
vm.runInContext(`const CANVAS_SIZE=300,CANVAS_PADDING=28;let strokesPoints=[];
  async function getCharData(char){return window.HANZI_LOCAL_DATA[char];}
  function recordInk(){}
`,context);
vm.runInContext(html.slice(start,end),context);
assert.equal(vm.runInContext('typeof confirmReviewedStructure',context),'function');

const clone=value=>JSON.parse(JSON.stringify(value));
function reference(char){
  context.targetChar=char;
  return clone(vm.runInContext('window.HANZI_LOCAL_DATA[targetChar].medians.map(medianToCanvasPoints)',context));
}
async function grade(char,ink){
  context.targetChar=char;context.fixtureInk=ink;
  vm.runInContext('strokesPoints=fixtureInk',context);
  return vm.runInContext('gradeDrawing(targetChar)',context);
}
function confirm(char,ink){
  context.targetChar=char;context.fixtureInk=ink;
  return clone(vm.runInContext(`(()=>{
    const official=window.HANZI_LOCAL_DATA[targetChar].medians.map(medianToCanvasPoints);
    const rows=official.map((_,i)=>({o:String(i),u:'u'+i}));
    return confirmReviewedStructure(targetChar,official,fixtureInk,bboxOf(official).diag,rows);
  })()`,context));
}
function transform(strokes,fn){return strokes.map(s=>s.map(fn));}
function box(strokes){
  const points=strokes.flat();const xs=points.map(p=>p.x),ys=points.map(p=>p.y);
  return {minX:Math.min(...xs),minY:Math.min(...ys),maxX:Math.max(...xs),maxY:Math.max(...ys)};
}

(async()=>{
  let positive=0,negative=0;
  async function rejectVariants(char,ink,label){
    const variants={original:ink,reordered:ink.slice().reverse(),
      scaled:transform(ink,p=>({x:p.x*.7+32,y:p.y*.7+27})),
      slanted:transform(ink,p=>({x:p.x+.08*(p.y-150),y:p.y}))};
    for(const [name,variant] of Object.entries(variants)){
      assert.equal(await grade(char,variant),false,char+' accepted '+label+' ('+name+')');
      negative++;
    }
  }
  for(const char of ['确','鼓','悄']){
    const original=reference(char);
    const folded=original.flatMap((stroke,i)=>{
      if(i!==3)return [stroke];
      const cut=Math.max(1,Math.ceil(stroke.length/2)-1);
      return [stroke.slice(0,cut+1),stroke.slice(cut)];
    });
    const joined=original.flatMap((stroke,i)=>i===3?[[...stroke,...original[4]]]:i===4?[]:[stroke]);
    const variants={reference:original,
      'different stroke order':original.slice().reverse(),
      'small and shifted':transform(original,p=>({x:p.x*.65+40,y:p.y*.65+18})),
      'large and shifted':transform(original,p=>({x:p.x*1.15-30,y:p.y*1.15-20})),
      'slanted':transform(original,p=>({x:p.x+.08*(p.y-150),y:p.y})),
      'brief pen lift':folded,'connected neighbouring strokes':joined};
    for(const [name,ink] of Object.entries(variants)){
      assert.equal(await grade(char,ink),true,char+' rejected '+name);
      positive++;
    }
    assert.equal(confirm(char,original).pass,true,char+' guard rejects its own reference');
  }

  const moon=reference('悄');
  const frameBottom=Math.min(box([moon[6]]).maxY,box([moon[7]]).maxY);
  const frameTop=Math.max(box([moon[6]]).minY,box([moon[7]]).minY);
  const barBox=box([moon[9]]);
  moon[9]=moon[9].map(p=>({x:p.x,y:p.y+frameBottom+(frameBottom-frameTop)*.16-(barBox.minY+barBox.maxY)/2}));
  assert.equal(confirm('悄',moon).pass,false,'A second horizontal below 月 is not an interior bar');
  await rejectVariants('悄',moon,'a bar below the 月 frame');

  const swapped=reference('确');
  const left=box(swapped.slice(0,5)),right=box(swapped.slice(5));
  const displacement=(right.minX+right.maxX-left.minX-left.maxX)/2;
  for(let i=0;i<swapped.length;i++)swapped[i]=swapped[i].map(p=>({x:p.x+(i<5?displacement:-displacement),y:p.y}));
  assert.equal(confirm('确',swapped).pass,false,'石 and 角 cannot exchange sides');
  await rejectVariants('确',swapped,'exchanged 石 and 角');

  const extraMouth=reference('鼓');
  const drum=box(extraMouth.slice(0,9)),w=(drum.maxX-drum.minX)*.35;
  const x=(drum.minX+drum.maxX-w)/2,y=drum.maxY+15,h=w*.75;
  extraMouth.push([{x,y},{x,y:y+h}],
    [{x,y},{x:x+w,y},{x:x+w,y:y+h}],
    [{x,y:y+h},{x:x+w,y:y+h}]);
  assert.equal(confirm('鼓',extraMouth).pass,false,'A second lower 口 is not a retrace or a pen lift');
  await rejectVariants('鼓',extraMouth,'an extra lower 口');

  console.log(JSON.stringify({positive,negative,scope:'standard geometry; no private ink'}));
})().catch(error=>{console.error(error);process.exitCode=1;});
