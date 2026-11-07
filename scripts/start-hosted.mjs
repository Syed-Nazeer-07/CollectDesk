/**
 * Single-container hosted launcher for a fictional demonstration.
 * This process runs the internal Express API and public Next.js server together.
 * Designed for Render free previews, not for production finance operations.
 */
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';

const publicPort=Number(process.env.PORT || 10000);
if(!Number.isInteger(publicPort)||publicPort<1||publicPort>65535||publicPort===4000) {
  console.error('Invalid public PORT for hosted demo (cannot use internal API port 4000).');
  process.exit(1);
}
if (!process.env.MONGODB_URI || !process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error('MONGODB_URI and a strong JWT_SECRET (32+ characters) are required.');
  process.exit(1);
}
if(!process.env.WEB_ORIGIN && !process.env.RENDER_EXTERNAL_URL) {
  console.error('Set WEB_ORIGIN or use Render with RENDER_EXTERNAL_URL before hosting.');
  process.exit(1);
}
const children=[];
let stopping=false;
function stop(signal='SIGTERM') {
  if(stopping)return;
  stopping=true;
  for(const child of children)if(child.exitCode===null)child.kill(signal);
}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>stop(signal));

function run(cmd,args,environment,cwd=process.cwd()) {
  return spawn(cmd,args,{env:environment,stdio:'inherit',cwd});
}

if(process.env.SEED_DEMO_ON_START==='true') {
  if(!process.env.DEMO_SEED_PASSWORD || process.env.DEMO_SEED_PASSWORD.length<12) {
    console.error('DEMO_SEED_PASSWORD (12+ characters) is required when SEED_DEMO_ON_START=true.');
    process.exit(1);
  }
  const seed=run(process.execPath,[resolve('apps/api/src/seed.js')],process.env);
  const code=await new Promise((done,reject)=>{
    seed.once('error',reject);
    seed.once('exit',(exitCode,signal)=>done(exitCode??(signal?1:0)));
  });
  if(code!==0) {
    console.error('Seed failed; refusing to start hosted demo.');
    process.exit(code||1);
  }
}

const api=run(process.execPath,[resolve('apps/api/src/server.js')],{...process.env,PORT:'4000'});
children.push(api);
const web=run(process.execPath,[
  resolve('node_modules/next/dist/bin/next'),
  'start','--hostname','0.0.0.0','--port',String(publicPort)
],process.env,resolve('apps/web'));
children.push(web);

for(const [name,child] of [['api',api],['web',web]]) {
  child.once('error',error=>{
    console.error(name+' process could not start:',error.message);
    stop();
    process.exitCode=1;
  });
  child.once('exit',(code,signal)=>{
    if(stopping)return;
    console.error(name+' exited unexpectedly:',{code,signal});
    stop();
    process.exitCode=code&&code!==0?code:1;
  });
}
