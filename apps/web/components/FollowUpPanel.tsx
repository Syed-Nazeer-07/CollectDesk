'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {api,FollowUp,indiaDay} from '@/lib/api';
export default function FollowUpPanel({caseId}:{caseId:string}){
  const [value,setValue]=useState<FollowUp|null>(null),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[day,setDay]=useState(indiaDay()),[note,setNote]=useState(''),[outcome,setOutcome]=useState(''),[reload,setReload]=useState(0);
  function apply(f:FollowUp|null){setValue(f);setDay(f?.dueDate||indiaDay());setNote(f?.note||'');setReady(true);}
  useEffect(()=>{const controller=new AbortController();setReady(false);setError('');api<{followUp:FollowUp|null}>(`/cases/${caseId}/follow-up`,{signal:controller.signal}).then(r=>{if(!controller.signal.aborted)apply(r.followUp);}).catch(e=>{if(!controller.signal.aborted)setError(e.message);});return()=>controller.abort();},[caseId,reload]);
  async function save(complete:boolean){setBusy(true);setError('');setNotice('');try{const result=await api<{followUp:FollowUp|null}>(`/cases/${caseId}/follow-up${complete?'/complete':''}`,{method:'POST',body:JSON.stringify(complete?{revision:value?.revision,outcome}:{dueDate:day,note,revision:value?.revision??null})});apply(result.followUp);setOutcome('');setNotice(complete?'Follow-up completed.':'Follow-up scheduled.');}catch(e){setError(e instanceof Error?e.message:'Could not save follow-up.');}finally{setBusy(false);}}
  return <section className="panel section-panel followup-panel" id="case-followup"><div className="panel-head"><div><h3>Next follow-up</h3><p>Internal task only. No message is sent to the debtor.</p></div><Link href="/follow-ups" className="text-link">View queue</Link></div>
    {error&&<div className="message error" role="alert">{error} <button type="button" onClick={()=>setReload(v=>v+1)} disabled={busy}>Refresh</button></div>}
    {notice&&<p className="message success" role="status">{notice}</p>}
    {!ready&&!error&&<p role="status">Loading follow-up…</p>}
    {ready&&<>{value&&<div className="followup-current" role="status"><strong>{value.dueDate<indiaDay()?'Overdue':value.dueDate===indiaDay()?'Due today':'Upcoming'}</strong><span>{value.dueDate} · {value.note}</span></div>}<form className="ops-form" onSubmit={e=>{e.preventDefault();void save(false);}}><label className="field">Follow-up date<input type="date" required min={indiaDay()} value={day} onChange={e=>setDay(e.target.value)}/></label><label className="field">Internal next action<textarea required minLength={3} maxLength={400} rows={2} value={note} onChange={e=>setNote(e.target.value)}/></label><button className="button button-outline" disabled={busy} type="submit">{value?'Reschedule follow-up':'Schedule follow-up'}</button></form>
    {value&&<form className="ops-form ops-complete" onSubmit={e=>{e.preventDefault();void save(true);}}><label className="field">Follow-up outcome<textarea required minLength={3} maxLength={400} rows={2} value={outcome} onChange={e=>setOutcome(e.target.value)}/></label><button className="button button-primary" disabled={busy} type="submit">Complete follow-up</button></form>}</>}
  </section>;
}
