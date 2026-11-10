'use client';

import {useEffect,useState} from 'react';
import {CheckCircle2,Headphones,LifeBuoy,MessageCircle,RefreshCw,Send} from 'lucide-react';
import AppShell from '@/components/AppShell';
import {api,User} from '@/lib/api';

type TicketStatus='open'|'in_progress'|'resolved';
type Category='onboarding'|'case'|'account'|'technical'|'other';
type Ticket={
  id:string;category:Category;subject:string;message:string;status:TicketStatus;
  resolutionNote:string;createdAt:string;updatedAt:string;
  history:{status:TicketStatus;note:string;at:string}[];
  reporter:{name:string;email:string}|null
};
type ListResponse={requests:Ticket[];pagination:{page:number;pageSize:number;total:number;hasMore:boolean}};
const categories:{value:Category;label:string}[]=[
  {value:'onboarding',label:'Getting started'},
  {value:'case',label:'Case workflow'},
  {value:'account',label:'Account & access'},
  {value:'technical',label:'Technical issue'},
  {value:'other',label:'Other question'}
];
const statuses:{value:TicketStatus;label:string}[]=[
  {value:'open',label:'Open'},
  {value:'in_progress',label:'In progress'},
  {value:'resolved',label:'Resolved'}
];
function labelStatus(s:TicketStatus){return statuses.find(x=>x.value===s)?.label||s;}
function safeDate(v:string){
  return new Intl.DateTimeFormat('en-IN',{dateStyle:'medium',timeZone:'Asia/Kolkata'}).format(new Date(v));
}
export default function SupportPage(){
  return <AppShell title="Help & support" subtitle="Get assistance with your workspace and report problems." action={false}>
    {user=><SupportWorkspace user={user}/>}
  </AppShell>;
}
function SupportWorkspace({user}:{user:User}){
  const [category,setCategory]=useState<Category>('case');
  const [subject,setSubject]=useState('');
  const [message,setMessage]=useState('');
  const [tickets,setTickets]=useState<Ticket[]>([]);
  const [filter,setFilter]=useState<'all'|TicketStatus>('all');
  const [page,setPage]=useState(1);
  const [total,setTotal]=useState(0);
  const [hasMore,setHasMore]=useState(false);
  const [revision,setRevision]=useState(0);
  const [loading,setLoading]=useState(true);
  const [submitting,setSubmitting]=useState(false);
  const [error,setError]=useState('');
  const [formError,setFormError]=useState('');
  const [notice,setNotice]=useState('');

  useEffect(()=>{
    let active=true;
    const controller=new AbortController();
    setLoading(true);setError('');
    api<ListResponse>(`/support/requests?page=${page}${filter==='all'?'':`&status=${filter}`}`,{signal:controller.signal})
      .then(r=>{if(active){setTickets(r.requests);setTotal(r.pagination.total);setHasMore(r.pagination.hasMore);}})
      .catch(e=>{if(active&&!controller.signal.aborted)setError(e.message);})
      .finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;controller.abort();};
  },[filter,page,revision]);

  async function send(e:React.FormEvent<HTMLFormElement>){
    e.preventDefault();setSubmitting(true);setFormError('');setNotice('');
    try{
      await api('/support/requests',{method:'POST',body:JSON.stringify({category,subject,message})});
      setSubject('');setMessage('');setCategory('case');
      setNotice('Request submitted. You can follow its status in the list below.');
      setFilter('all');setPage(1);setRevision(v=>v+1);
    }catch(e){setFormError(e instanceof Error?e.message:'Could not submit request.');}
    finally{setSubmitting(false);}
  }
  async function update(id:string,status:TicketStatus,resolutionNote:string){
    await api(`/support/requests/${id}`,{method:'PATCH',body:JSON.stringify({status,resolutionNote})});
    setNotice('Support request status saved.');
    setRevision(v=>v+1);
  }
  return <div className="support-layout">
    <section className="panel support-form-panel">
      <div className="panel-head">
        <div><h2><LifeBuoy size={20}/> Contact the team</h2>
          <p>Report a problem without sharing confidential financial data.</p></div>
      </div>
      <form className="support-form" onSubmit={send}>
        <label className="field">Topic
          <select value={category} onChange={e=>setCategory(e.target.value as Category)}>
            {categories.map(x=><option key={x.value} value={x.value}>{x.label}</option>)}
          </select>
        </label>
        <label className="field">Subject
          <input required minLength={5} maxLength={120} value={subject}
            onChange={e=>setSubject(e.target.value)} placeholder="What do you need help with?"/>
        </label>
        <label className="field">Describe the issue
          <textarea required minLength={15} maxLength={2000} rows={5} value={message}
            onChange={e=>setMessage(e.target.value)}
            placeholder="Describe what happened and what you expected to happen."/>
        </label>
        <p className="support-privacy">This is a sample-data workspace. Do not include passwords, real invoices, or personal debtor information. Requests are visible to administrators.</p>
        {formError&&<p className="message error" role="alert">{formError}</p>}
        <button className="button button-primary" type="submit" disabled={submitting}>
          <Send size={16}/>{submitting?'Submitting…':'Send support request'}
        </button>
      </form>
    </section>
    <section className="panel support-tickets-panel">
      <div className="panel-head">
        <div><h2><MessageCircle size={20}/>{user.role==='admin'?'Support queue':'Your requests'}</h2>
          <p>{user.role==='admin'?'Review and resolve workspace support requests.':'Track updates and resolutions here.'}</p>
        </div>
        <button className="button button-muted button-small" type="button" onClick={()=>setRevision(x=>x+1)} aria-label="Refresh support requests"><RefreshCw size={15}/></button>
      </div>
      <div className="support-filter-row">
        <label htmlFor="support-status-filter">Status</label>
        <select id="support-status-filter" value={filter} onChange={e=>{setFilter(e.target.value as typeof filter);setPage(1);}}>
          <option value="all">All requests</option>
          {statuses.map(s=><option value={s.value} key={s.value}>{s.label}</option>)}
        </select>
        <span>{total} request{total===1?'':'s'}</span>
      </div>
      {notice&&<p className="support-notice" role="status"><CheckCircle2 size={16}/>{notice}</p>}
      {error&&<div className="message error" role="alert">{error}<button type="button" onClick={()=>setRevision(v=>v+1)}>Retry</button></div>}
      {loading?<p className="support-list-state" role="status">Loading requests…</p>:
        !error&&tickets.length===0?<div className="support-list-state">
          <Headphones size={25}/><strong>No requests found</strong>
          <span>{user.role==='admin'?'There are no requests in this queue.':'You can submit your first request using the form.'}</span>
        </div>:!error&&<div className="support-ticket-list">
          {tickets.map(t=><TicketCard key={t.id} ticket={t} admin={user.role==='admin'} onUpdate={update}/>)}
        </div>}
      {!error&&!loading&&(page>1||hasMore)&&<div className="support-pagination">
        <button className="button button-muted button-small" type="button" disabled={page===1} onClick={()=>setPage(v=>v-1)}>Previous</button>
        <span>Page {page}</span>
        <button className="button button-muted button-small" type="button" disabled={!hasMore} onClick={()=>setPage(v=>v+1)}>Next</button>
      </div>}
    </section>
  </div>;
}
function TicketCard({ticket,admin,onUpdate}:{ticket:Ticket;admin:boolean;onUpdate:(id:string,status:TicketStatus,resolutionNote:string)=>Promise<void>}){
  const [status,setStatus]=useState<TicketStatus>(ticket.status);
  const [note,setNote]=useState(ticket.resolutionNote);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  async function save(){
    setSaving(true);setError('');
    try{await onUpdate(ticket.id,status,note);}catch(e){setError(e instanceof Error?e.message:'Unable to update request.');}
    finally{setSaving(false);}
  }
  return <article className="support-ticket">
    <div className="support-ticket-top">
      <span className={`support-pill support-pill-${ticket.status}`}>{labelStatus(ticket.status)}</span>
      <span className="support-ticket-meta">{safeDate(ticket.createdAt)}</span>
    </div>
    <h3>{ticket.subject}</h3>
    <p className="support-ticket-category">{categories.find(c=>c.value===ticket.category)?.label}</p>
    <p className="support-ticket-message">{ticket.message}</p>
    {admin&&ticket.reporter&&<p className="support-ticket-reporter">From {ticket.reporter.name} · {ticket.reporter.email}</p>}
    {ticket.status==='resolved'&&ticket.resolutionNote&&
      <div className="support-resolution"><strong>Resolution</strong><p>{ticket.resolutionNote}</p></div>}
    {ticket.history?.length>0&&<details className="support-history">
      <summary>Decision history ({ticket.history.length})</summary>
      <ol>{ticket.history.map((event,i)=><li key={i}>
        <span>{labelStatus(event.status)} · {safeDate(event.at)}</span>
        {event.note&&<p>{event.note}</p>}
      </li>)}</ol>
    </details>}
    {admin&&<div className="support-admin-actions">
      <label className="field">Update status
        <select value={status} onChange={e=>setStatus(e.target.value as TicketStatus)}>
          {statuses.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </label>
      <label className="field">Resolution note {status==='resolved'?'(required)':'(optional)'}
        <textarea rows={2} value={note} maxLength={2000}
          onChange={e=>setNote(e.target.value)} placeholder="Explain the action taken."/>
      </label>
      {error&&<p className="message error" role="alert">{error}</p>}
      <button className="button button-outline button-small" type="button" disabled={saving || (status===ticket.status&&note===ticket.resolutionNote)}
        onClick={save}>{saving?'Saving…':'Save update'}</button>
    </div>}
  </article>;
}
