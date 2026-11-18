'use client';

import {useCallback,useEffect,useState} from 'react';
import {api} from '@/lib/api';

type Operator={id:string;name:string;email:string;active:boolean;assigned:number};
type Data={operators:Operator[];hasMore:boolean};

export default function OperatorAccess(){
  const [page,setPage]=useState(1);
  const [data,setData]=useState<Data|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const load=useCallback(async(signal?:AbortSignal)=>{
    const result=await api<Data>('/staff/operators?page='+page,{signal});
    if(!signal?.aborted)setData(result);
  },[page]);
  useEffect(()=>{
    const controller=new AbortController();
    load(controller.signal).catch(error=>{if(!controller.signal.aborted)setError(error.message);});
    return ()=>controller.abort();
  },[load]);

  async function toggle(operator:Operator){
    if(operator.active&&!window.confirm('Deactivate this operator and end their sessions? Their existing assignments must be reassigned.'))return;
    setBusy(true);setError('');setNotice('');
    try{
      await api('/staff/operators/'+operator.id+'/access',{
        method:'POST',body:JSON.stringify({active:!operator.active})
      });
      setNotice(operator.active?'Operator access removed.':'Operator access restored.');
      await load();
    }catch(error){setError(error instanceof Error?error.message:'Could not change access.');}
    finally{setBusy(false);}
  }

  return <section className="panel organization-panel">
    <h2>Operator workload</h2>
    {error&&<p className="message error" role="alert">{error} <button onClick={()=>{setError('');void load().catch(error=>setError(error.message));}}>Refresh</button></p>}
    {notice&&<p role="status">{notice}</p>}
    {!data&&!error&&<p role="status">Loading operators…</p>}
    {data&&!data.operators.length&&<p>No operator accounts yet.</p>}
    {data&&<ul className="workspace-list">{data.operators.map(operator=><li key={operator.id}>
      <div><strong>{operator.name}</strong><p>{operator.email}</p>
        <p>{operator.active?'Active':'Inactive'} · {operator.assigned} active {operator.assigned===1?'case':'cases'}</p></div>
      <button className="button button-outline" disabled={busy} onClick={()=>void toggle(operator)}>
        {operator.active?'Deactivate':'Restore access'}
      </button>
    </li>)}</ul>}
    {data&&(page>1||data.hasMore)&&<div className="form-actions">
      <button className="button button-outline" disabled={page===1||busy} onClick={()=>{setData(null);setPage(n=>n-1);}}>Previous</button>
      <span>Page {page}</span>
      <button className="button button-outline" disabled={!data.hasMore||busy} onClick={()=>{setData(null);setPage(n=>n+1);}}>Next</button>
    </div>}
  </section>;
}
