'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {RefreshCw,ArrowUpRight} from 'lucide-react';
import AppShell from '@/components/AppShell';
import {api,money,date} from '@/lib/api';
type Control={asOf:string;workload:{id:string;name:string;active:number;onHold:number;due:number;scheduled:number}[];unassigned:number;inactiveAssignments:number;pending:{count:number;amountPaise:number;items:{caseId:string;caseCode:string;debtorName:string;amountPaise:number;createdAt:string}[]}};
type Health={startedAt:string;asOf:string;windowMinutes:number;sampleLimit:number;sampleCount:number;success:number;clientError:number;serverError:number;p50Ms:number|null;p95Ms:number|null};
export default function Operations(){return <AppShell title="Operations control" subtitle="Review the work that needs a decision, and inspect service health." action={false}>{user=>user.role==='admin'?<ControlRoom/>:<div className="message error" role="alert">Administrator access required.</div>}</AppShell>;}
function ControlRoom(){
 const [data,setData]=useState<Control|null>(null),[health,setHealth]=useState<Health|null>(null),[error,setError]=useState(''),[healthError,setHealthError]=useState(''),[reload,setReload]=useState(0);
 useEffect(()=>{const c=new AbortController();setError('');setHealthError('');setData(null);setHealth(null);
 api<Control>('/operations/control',{signal:c.signal}).then(x=>{if(!c.signal.aborted)setData(x);}).catch(e=>{if(!c.signal.aborted)setError(e.message);});
 api<Health>('/operations/health',{signal:c.signal}).then(x=>{if(!c.signal.aborted)setHealth(x);}).catch(e=>{if(!c.signal.aborted)setHealthError(e.message);});
 return()=>c.abort();},[reload]);
 return <div className="ops-stack">
 <section className="workspace-brief"><div><span className="workspace-context">Administrator · current snapshot</span><h2>Work requiring attention</h2><p>Review receipts, balance assignments and investigate service issues without leaving your workspace.</p></div><button className="button button-outline" onClick={()=>setReload(n=>n+1)}><RefreshCw size={16}/> Refresh</button></section>
 {error?<div className="message error" role="alert">{error}</div>:!data?<div className="loading-panel" role="status">Loading operations…</div>:<>
 <div className="ops-metrics"><div className="metric-card"><span>Pending verification</span><div className="metric-value">{data.pending.count}</div><p>{money(data.pending.amountPaise)} not counted in recovery</p></div><div className="metric-card"><span>Unassigned active cases</span><div className="metric-value">{data.unassigned}</div><p>Awaiting a named operator</p></div><div className="metric-card"><span>Inactive or missing assignee</span><div className="metric-value">{data.inactiveAssignments}</div><p>Active cases requiring reassignment</p></div></div>
 <section className="panel section-panel"><div className="panel-head"><div><h3>Receipt verification queue</h3><p>Oldest 25 pending entries · inspect evidence and approve or reject in the case.</p></div></div>
 {data.pending.items.length?<div className="ops-queue">{data.pending.items.map((x,i)=><Link key={x.caseId+'-'+i} href={'/cases/'+x.caseId} className="ops-task"><div><strong>{x.caseCode} · {x.debtorName}</strong><small>Recorded {date(x.createdAt)}</small></div><span className="ops-due">{money(x.amountPaise)} <ArrowUpRight size={14}/></span></Link>)}</div>:<p>No receipts awaiting verification.</p>}</section>
 <section className="panel section-panel"><div className="panel-head"><div><h3>Current operator workload</h3><p>Active assignments as of {data.asOf}. Counts are not historic performance scores.</p></div><Link href="/follow-ups" className="text-link">Follow-up queue <ArrowUpRight size={14}/></Link></div>
 {data.workload.length?<div className="table-overflow"><table className="cases-table report-table"><thead><tr><th>Operator</th><th>Active cases</th><th>On hold</th><th>Scheduled</th><th>Due</th></tr></thead><tbody>{data.workload.map(x=><tr key={x.id}><td data-label="Operator">{x.name}</td><td data-label="Active cases">{x.active}</td><td data-label="On hold">{x.onHold}</td><td data-label="Scheduled">{x.scheduled}</td><td data-label="Due">{x.due}</td></tr>)}</tbody></table></div>:<p>No active operator accounts.</p>}</section></>}
 <section className="panel section-panel"><div className="panel-head"><div><h3>API service health</h3><p>Recent completed API requests, sampled in this process. Resets on restart; not external uptime monitoring.</p></div></div>
 {healthError?<div className="message error" role="alert">{healthError}</div>:!health?<p role="status">Loading service metrics…</p>:<><div className="health-grid">{[{label:'Requests',value:health.sampleCount},{label:'Server errors',value:health.serverError},{label:'Median latency',value:health.p50Ms===null?'—':health.p50Ms+' ms'},{label:'95th percentile',value:health.p95Ms===null?'—':health.p95Ms+' ms'}].map(x=><div key={x.label}><span>{x.label}</span><strong>{x.value}</strong></div>)}</div><p className="ops-note">Last {health.windowMinutes} minutes · at most {health.sampleLimit} requests · {health.clientError} client errors. No request payloads or user identifiers are collected.</p></>}</section>
 </div>;
}
