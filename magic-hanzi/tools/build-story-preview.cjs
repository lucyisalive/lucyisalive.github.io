'use strict';

const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname,'..');
const read = file => fs.readFileSync(path.join(root,file),'utf8');
const output = process.argv[2];
if(!output)throw new Error('Supply an output HTML path.');

const entry=process.argv[3] || 'new-stories-preview.html';
if(!['new-stories-preview.html','three-stories-preview.html','fairytale-stories-preview.html','night-adventures-preview.html'].includes(entry))throw new Error('Unknown story preview entry.');
let html = read(entry);
html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g,
  (_,file) => '<style>\n'+read(file)+'\n</style>');
html = html.replace(/<script src="([^"]+)"><\/script>/g,
  (_,file) => '<script>\n'+read(file).replace(/<\/script/gi,'<\\/script')+'\n</script>');
const assets = new Set([...html.matchAll(/assets\/story\/[a-z0-9-]+\.(?:webp|wav)/g)].map(match=>match[0]));
for(const file of assets){
  html = html.replaceAll(file,'data:'+(file.endsWith('.wav')?'audio/wav':'image/webp')+';base64,'+
    fs.readFileSync(path.join(root,file)).toString('base64'));
}
fs.writeFileSync(output,html);
console.log('Built '+entry+' with '+assets.size+' embedded assets.');
