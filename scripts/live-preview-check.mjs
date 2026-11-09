/**
 * Production preview diagnostics from GitHub Actions outside Render's network.
 * Never logs or accepts real credentials. Designed to distinguish cold starts
 * from broken proxy/origin rules and client-side login failures.
 */
import assert from 'node:assert/strict';

// New Render service hostname; override with LIVE_PREVIEW_URL when needed.
const base = (process.env.LIVE_PREVIEW_URL || 'https://collectdesk.onrender.com').replace(/\/+$/, '');
const origin = new URL(base).origin;
const timeoutMs=95_000;
const sleep=(ms)=>new Promise(resolve=>setTimeout(resolve,ms));

async function request(path,{method='GET',body,headers={}}={}){
  const started=Date.now();
  try {
    const result=await fetch(new URL(path,base),{
      method,
      cache:'no-store',
      redirect:'follow',
      headers:{...headers,...(body?{'content-type':'application/json'}:{})},
      ...(body?{body:JSON.stringify(body)}:{}),
      signal:AbortSignal.timeout(timeoutMs),
    });
    const duration=Date.now()-started;
    const contentType=result.headers.get('content-type')||'';
    const text=await result.text();
    console.log(method, path, 'HTTP', result.status, duration+'ms', 'content-type:',contentType);
    return {status:result.status,body:text,contentType,duration,headers:result.headers};
  } catch(error){
    console.error(method,path,'failed after',Date.now()-started+'ms:',error?.message||String(error));
    throw error;
  }
}
let health;
for(let attempt=1;attempt<=3;attempt++){
  try {
    health=await request('/api/health');
    if(health.status===200)break;
    console.error('Health attempt',attempt,'returned',health.status,'body:',health.body.slice(0,240));
  }catch(err){if(attempt===3)throw err;}
  if(attempt<3)await sleep(8_000);
}
assert.equal(health?.status,200,'Public API health did not return HTTP 200');
assert.deepEqual(JSON.parse(health.body),{ok:true},'Public API and database readiness check failed');
const landing=await request('/');
assert.equal(landing.status,200,'Public customer onboarding page failed');
assert.match(landing.body,/Every overdue invoice deserves/i,
  'Public homepage is missing the customer onboarding landing page');
const login=await request('/login');
assert.equal(login.status,200,'Public login page failed');
assert.match(login.body,/(collectdesk|Sign in to your workspace)/i,'Login page content missing');
const auth=await request('/api/v1/auth/me');
assert.equal(auth.status,401,'Unauthenticated public API must return HTTP 401');
const invalid=await request('/api/v1/auth/login',{
  method:'POST',
  headers:{origin},
  body:{email:'admin@demo.collectdesk.test',password:'this-is-intentionally-not-the-password'},
});
assert.equal(invalid.status,401,'Public login proxy must allow same-origin POST and reject wrong credentials with HTTP 401 (not 403/502)');
const signup=await request('/signup');
assert.equal(signup.status,200,'Public registration page should render even when setup is disabled');
const options=await request('/api/v1/auth/options');
assert.equal(options.status,200,'Public authentication configuration should be accessible');
const providers=JSON.parse(options.body);
assert.equal(typeof providers.emailSignupEnabled,'boolean');
assert.equal(typeof providers.googleEnabled,'boolean');
assert.ok(!providers.googleEnabled || typeof providers.googleClientId==='string');
console.log('Auth provider availability:',{emailSignupEnabled:providers.emailSignupEnabled,googleEnabled:providers.googleEnabled});
console.log('PASS public customer landing page, HTTPS frontend, Atlas-backed API, proxy, origin checks, signup and rejected login');
