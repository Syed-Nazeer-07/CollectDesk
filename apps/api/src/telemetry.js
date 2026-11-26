import {randomUUID} from 'node:crypto';
const LIMIT=2048,WINDOW_MS=30*60*1000;
const samples=[];
const startedAt=new Date().toISOString();
export function summarizeRequests(records,now=Date.now()){
  const recent=records.filter(x=>x.at>=now-WINDOW_MS&&x.at<=now);
  const sorted=recent.map(x=>x.ms).sort((a,b)=>a-b);
  const percentile=p=>sorted.length?Math.round(sorted[Math.ceil(sorted.length*p)-1]):null;
  const counts={success:0,clientError:0,serverError:0,other:0};
  for(const x of recent)counts[x.status>=500?'serverError':x.status>=400?'clientError':x.status>=200&&x.status<400?'success':'other']++;
  return {sampleCount:recent.length,...counts,p50Ms:percentile(.5),p95Ms:percentile(.95)};
}
export function observeRequest(req,res,next){
  const requestId=randomUUID(),start=performance.now();
  req.requestId=requestId;res.set('X-Request-Id',requestId);
  res.once('finish',()=>{
    const ms=performance.now()-start,status=res.statusCode;
    samples.push({at:Date.now(),ms,status});
    if(samples.length>LIMIT)samples.shift();
    // Never log paths, query strings, body, cookies, headers, user or tenant IDs.
    if(status>=500||ms>=1500)console.warn(JSON.stringify({event:'api_request',requestId,status,durationMs:Math.round(ms)}));
  });
  next();
}
export function telemetrySnapshot(){
  return {startedAt,asOf:new Date().toISOString(),windowMinutes:30,sampleLimit:LIMIT,...summarizeRequests(samples)};
}
