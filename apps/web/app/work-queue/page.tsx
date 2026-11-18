'use client';

import {useEffect,useState} from 'react';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import {api,label} from '@/lib/api';
import OperatorAccess from '@/components/OperatorAccess';

type WorkItem={id:string;caseCode:string;debtorName:string;status:string;priority:string;
  followUpAt?:string;followUpNote?:string;overdue:boolean};
type Queue={items:WorkItem[];hasMore:boolean};
const dayTime=new Intl.DateTimeFormat('en-IN',{dateStyle:'medium',timeStyle:'short'});

export default function WorkQueuePage(){
  return <AppShell title="Work queue" subtitle="Upcoming follow-ups, handoffs, and operator workload." action={false}>
    {user=>user.role==='creditor' ? <p className="message error" role="alert">This queue is available to operations staff.</p>
      : <QueueWorkspace key={user.id} admin={user.role==='admin'}/>}
  </AppShell>;
}

function QueueWorkspace({admin}:{admin:boolean}){
  const [view,setView]=useState<'followups'|'unassigned'>('followups');
  const [page,setPage]=useState(1);
  const [data,setData]=useState<Queue|null>(null);
  const [error,setError]=useState('');
  const [revision,setRevision]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();
    api<Queue>('/work-queue?view='+view+'&page='+page,{signal:controller.signal}).then(setData).catch(error=>{
      if(!controller.signal.aborted)setError(error.message);
    });
    return ()=>controller.abort();
  },[view,page,revision]);

  return <div className="organization-grid">
    <section className="panel organization-panel">
      <h2>Case queue</h2>
      {admin&&<label className="field">Queue
        <select value={view} onChange={event=>{
          setView(event.target.value==='unassigned'?'unassigned':'followups');
          setPage(1);setData(null);setError('');
        }}><option value="followups">Scheduled follow-ups</option><option value="unassigned">Unassigned cases</option></select>
      </label>}
      {error?<p className="message error" role="alert">{error} <button onClick={()=>{setError('');setRevision(n=>n+1);}}>Retry</button></p>
        :!data?<p role="status">Loading queue…</p>
        :!data.items.length?<p>{view==='followups'?'No follow-ups scheduled. Open an active case to add one.':'All active cases have an assignment.'}</p>
        :<ul className="workspace-list">{data.items.map(item=><li key={item.id}>
          <div><Link className="text-link" href={'/cases/'+item.id}>{item.caseCode} · {item.debtorName}</Link>
            <p>{label(item.priority)} priority · {label(item.status)}</p>
            {item.followUpAt&&<p><time dateTime={item.followUpAt}>{dayTime.format(new Date(item.followUpAt))}</time>{item.overdue?' · Overdue':''}</p>}
            {item.followUpNote&&<p>{item.followUpNote}</p>}
          </div>
        </li>)}</ul>}
      {data&&(page>1||data.hasMore)&&<div className="form-actions">
        <button className="button button-outline" disabled={page===1||!data} onClick={()=>{setData(null);setPage(n=>n-1);}}>Previous</button>
        <span>Page {page}</span>
        <button className="button button-outline" disabled={!data?.hasMore} onClick={()=>{setData(null);setPage(n=>n+1);}}>Next</button>
      </div>}
    </section>
    {admin&&<OperatorAccess/>}
  </div>;
}
