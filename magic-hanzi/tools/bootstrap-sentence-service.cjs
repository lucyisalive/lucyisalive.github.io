'use strict';
// Reads only the encrypted envelope, not an API key. The site's service-access
// credential is accepted once through hidden stdin and never printed.
const fs = require('node:fs');
const origin = process.argv[2], envelopePath = process.argv[3];
const expected = new URL(origin);
if (expected.protocol !== 'https:' || expected.origin !== origin) throw Error('Expected exact HTTPS site origin');
let input = '';
if (process.stdin.isTTY) process.stdin.setRawMode(true);
process.stdin.setEncoding('utf8');
process.stderr.write('Ready for service access JSON on stdin (input is hidden).\n');
process.stdin.on('data', async chunk => {
  input += chunk;
  if (!input.includes('\n')) return;
  process.stdin.pause();
  if (process.stdin.isTTY) process.stdin.setRawMode(false);
  try {
    const {serviceToken} = JSON.parse(input.trim()); input = '';
    if (typeof serviceToken !== 'string' || !serviceToken || /[\r\n]/.test(serviceToken)) throw Error('Invalid service access');
    const envelope = JSON.parse(fs.readFileSync(envelopePath, 'utf8'));
    const access = {'OAI-Sites-Authorization':'Bearer '+serviceToken};
    const initialized = await fetch(origin+'/admin/bootstrap', { method:'POST', headers:{...access,Origin:origin,'Content-Type':'application/json'},
      body:JSON.stringify(envelope),redirect:'error',signal:AbortSignal.timeout(30000)});
    console.log(JSON.stringify({step:'bootstrap',status:initialized.status,result:await initialized.json()}));
    if (![201,409].includes(initialized.status)) {process.exitCode=1;return;}
    const headers={...access,Origin:'https://lucyisalive.github.io',Authorization:'Bearer '+'a'.repeat(64),'Content-Type':'application/json'};
    const health=await fetch(origin+'/health',{headers,redirect:'error',signal:AbortSignal.timeout(30000)});
    console.log(JSON.stringify({step:'health',status:health.status,revision:health.headers.get('X-Hanzi-Service-Revision'),result:await health.json()}));
    if(health.status!==200){process.exitCode=1;return;}
    const body=JSON.stringify({items:[{char:'悄',word:'悄悄',pinyin:'qiāo'}]});
    for(let attempt=0;attempt<2;attempt++){
      const response=await fetch(origin+'/v1/sentences',{method:'POST',headers,body,redirect:'error',signal:AbortSignal.timeout(30000)});
      console.log(JSON.stringify({step:attempt?'cached_generation':'live_generation',status:response.status,result:await response.json()}));
      if(response.status!==200){process.exitCode=1;return;}
    }
  }catch(_){console.error('Sentence service bootstrap or verification did not complete');process.exitCode=1;}
});
