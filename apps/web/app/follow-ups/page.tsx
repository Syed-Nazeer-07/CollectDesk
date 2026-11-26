'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import {api,FollowUp,CaseStatus,label} from '@/lib/api';
type Queue={asOf:string;total:number;due:number;page:number;items:(FollowUp&{id:string;caseCode:string;debtorName:string;status:CaseStatus})[]};
export default function FollowUps(){return <AppShell title="Follow-up queue" subtitle="Plan internal next actions and keep collection work moving." action={false}>{user=>user.role==='creditor'?<p className="message error">This queue is for authorized staff.</p>:<QueueView/>}</AppShell>;}
function QueueView(){
  const [data,setData]=useState<Queue|null>(null),[error,setError]=useState(''),[page,setPage]=useState(1),[reload,setReload]=useState(0);
  useEffect(()=>{const c=new AbortController();setData(null);setError('');api<Queue>('/follow-ups?page='+page,{signal:c.signal}).then(r=>{if(!c.signal.aborted)setData(r);}).catch(e=>{if(!c.signal.aborted)setError(e.message);});return()=>c.abort();},[page,reload]);
  return <div className="ops-stack">{error?<div className="message error" role="alert">{error} <button onClick={()=>setReload(x=>x+1)}>Retry</button></div>:!data?<div className="loading-panel" role="status">Loading queue…</div>:<>
    <div className="ops-metrics"><div className="metric-card"><span>Due or overdue</span><div className="metric-value">{data.due}</div><p>As of {data.asOf} (India)</p></div><div className="metric-card"><span>Scheduled</span><div className="metric-value">{data.total}</div><p>Active accessible cases</p></div><div className="metric-card"><span>Upcoming</span><div className="metric-value">{data.total-data.due}</div><p>After today's business date</p></div></div>
    <section className="panel section-panel"><div className="panel-head"><div><h3>Scheduled next actions</h3><p>Earliest date first. Assignments and case status are checked by the server.</p></div><Link href="/cases" className="button button-outline">Open cases</Link></div>
      {data.items.length===0?<div className="ops-empty"><span className="workspace-context">All clear</span><h4>No scheduled actions on this page</h4><p>Open an active case to plan an internal follow-up. Scheduled work appears here, ordered by due date.</p><Link href="/cases?sort=due" className="button button-outline">Review cases by due date</Link></div>:<div className="ops-queue">{data.items.map(item=><Link className="ops-task" key={item.id} href={'/cases/'+item.id}><div><strong>{item.caseCode} · {item.debtorName}</strong><small>{label(item.status)}</small><p>{item.note}</p></div><span className={item.dueDate<data.asOf?'ops-due overdue':'ops-due'}>{item.dueDate<data.asOf?'Overdue':item.dueDate===data.asOf?'Due today':'Upcoming'}<small>{item.dueDate}</small></span></Link>)}</div>}
      <div className="ops-pagination"><button className="button button-outline" disabled={page===1} onClick={()=>setPage(x=>x-1)}>Previous</button><span>Page {page} of {Math.max(1,Math.ceil(data.total/25))}</span><button className="button button-outline" disabled={page*25>=data.total} onClick={()=>setPage(x=>x+1)}>Next</button></div>
    </section></>}</div>;
}
