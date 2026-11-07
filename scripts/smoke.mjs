/**
 * Read-only live-stack smoke check. Never creates a case or changes data.
 * Requires running API, Next frontend and MongoDB.
 * Optional SMOKE_EMAIL / SMOKE_PASSWORD check the full cookie/session/API proxy path.
 */
const api=process.env.SMOKE_API_URL||'http://localhost:4000';
const web=process.env.SMOKE_WEB_URL||'http://localhost:3000';
const email=process.env.SMOKE_EMAIL;
const password=process.env.SMOKE_PASSWORD;
let failures=0;
async function check(label,url,expected,{body,headers,method}={}){
  try{
    const res=await fetch(url,{redirect:'manual',method:method||'GET',headers,body,signal:AbortSignal.timeout(8000)});
    const payload=await res.text();
    if(res.status!==expected)throw Error(`HTTP ${res.status} (expected ${expected}): ${payload.slice(0,160)}`);
    console.log(`PASS ${label} (${res.status})`);return {res,payload};
  }catch(e){failures++;console.error(`FAIL ${label}: ${e.message}`);return null;}
}
const health=await check('Express health',`${api}/health`,200);
if(health){try{if(JSON.parse(health.payload).database!=='connected')throw Error('MongoDB not connected');console.log('PASS MongoDB connection');}catch(e){failures++;console.error('FAIL MongoDB connection:',e.message);}}
const home=await check('Next login route',`${web}/login`,200);
if(home&&!home.payload.toLowerCase().includes('collectdesk')){failures++;console.error('FAIL frontend did not contain expected app title');}
await check('Unauthenticated API proxy',`${web}/api/v1/auth/me`,401);
if(Boolean(email)!==Boolean(password)){failures++;console.error('FAIL set both SMOKE_EMAIL and SMOKE_PASSWORD, or neither');}
if(email&&password){
  const logged=await check('Demo login through Next proxy',`${web}/api/v1/auth/login`,200,{method:'POST',headers:{Origin:web,'Content-Type':'application/json'},body:JSON.stringify({email,password})});
  if(logged){
    const session=logged.res.headers.get('set-cookie')?.split(';')[0];
    if(!session){failures++;console.error('FAIL login missing session cookie');}
    else{
      const headers={Cookie:session};
      await check('Authenticated session',`${web}/api/v1/auth/me`,200,{headers});
      await check('Dashboard data',`${web}/api/v1/dashboard/summary`,200,{headers});
      const cases=await check('Case pagination',`${web}/api/v1/cases?page=1&limit=2`,200,{headers});
      if(cases){try{const parsed=JSON.parse(cases.payload);if(!Array.isArray(parsed.cases)||parsed.pagination?.pageSize!==2)throw Error('Unexpected response schema');console.log('PASS case pagination contract');}catch(e){failures++;console.error('FAIL case pagination contract:',e.message);}}
    }
  }
}
console.log(failures?`\n${failures} smoke check(s) failed`:'\nAll selected smoke checks passed');
process.exitCode=failures?1:0;
