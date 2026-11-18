'use client';

import {useCallback,useEffect,useState,type FormEvent} from 'react';
import AppShell from '@/components/AppShell';
import {api,date,label} from '@/lib/api';

type Organization={id:string;name:string;country:string};
type Member={id:string;name:string;email:string;organizationRole:string;active:boolean};
type Invitation={id:string;email:string;status:string;expiresAt:string};
type Workspace={
  organization:Organization;owner:boolean;canInvite:boolean;members:Member[];invitations:Invitation[];
  history:{_id:string;kind:string;createdAt:string;detail:string}[];
};

export default function OrganizationPage(){
  return <AppShell title="Organization" subtitle="Company profile and workspace access." action={false}>
    {user=>user.role==='creditor' ? <CompanyWorkspace key={user.id}/> :
      user.role==='admin' ? <OrganizationDirectory/> :
      <p className="message error" role="alert">Organization management requires creditor or administrator access.</p>}
  </AppShell>;
}

function OrganizationDirectory(){
  const [page,setPage]=useState(1);
  const [data,setData]=useState<{organizations:Organization[];hasMore:boolean}|null>(null);
  const [error,setError]=useState('');
  const [reload,setReload]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();
    api<typeof data>('/organizations?page='+page,{signal:controller.signal}).then(setData).catch(error=>{
      if(!controller.signal.aborted)setError(error.message);
    });
    return ()=>controller.abort();
  },[page,reload]);
  if(error)return <div className="message error" role="alert">{error} <button onClick={()=>{setError('');setReload(n=>n+1);}}>Retry</button></div>;
  if(!data)return <p className="loading-panel" role="status">Loading organizations…</p>;
  return <section className="panel organization-panel">
    <h2>Creditor organizations</h2>
    {data.organizations.length ? <ul className="workspace-list">{data.organizations.map(org=>
      <li key={org.id}><strong>{org.name}</strong><span>{org.country}</span></li>)}</ul> :
      <p>No creditor organizations yet.</p>}
    {(page>1||data.hasMore)&&<div className="form-actions">
      <button className="button button-outline" disabled={page===1} onClick={()=>{setData(null);setPage(n=>n-1);}}>Previous</button>
      <span>Page {page}</span>
      <button className="button button-outline" disabled={!data.hasMore} onClick={()=>{setData(null);setPage(n=>n+1);}}>Next</button>
    </div>}
  </section>;
}

function CompanyWorkspace(){
  const [data,setData]=useState<Workspace|null>(null);
  const [name,setName]=useState('');
  const [inviteEmail,setInviteEmail]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [revision,setRevision]=useState(0);
  const load=useCallback(async (signal?:AbortSignal)=>{
    const result=await api<Workspace>('/organization',{signal});
    if(signal?.aborted)return;
    setData(result);
    setName(result.organization.name);
  },[]);
  useEffect(()=>{
    const controller=new AbortController();
    load(controller.signal).catch(error=>{if(!controller.signal.aborted)setError(error.message);});
    return ()=>controller.abort();
  },[load,revision]);

  async function mutate(path:string,method:string,message:string,body?:Record<string,string>){
    setBusy(true);
    setError('');
    setNotice('');
    try{
      await api(path,{method,body:body ? JSON.stringify(body) : undefined});
      setNotice(message);
      if(body?.email)setInviteEmail('');
      await load();
    }catch(error){setError(error instanceof Error ? error.message : 'Could not save changes.');}
    finally{setBusy(false);}
  }

  if(!data)return error ? <div className="message error" role="alert">{error} <button onClick={()=>{setError('');setRevision(n=>n+1);}}>Retry</button></div>
    : <p className="loading-panel" role="status">Loading organization…</p>;

  function sendInvite(event:FormEvent){
    event.preventDefault();
    void mutate('/organization/invitations','POST','Invitation sent.',{email:inviteEmail});
  }

  return <div className="organization-grid">
    <section className="panel organization-panel">
      <h2>Company profile</h2>
      <form className="action-form" onSubmit={event=>{event.preventDefault();void mutate('/organization','PATCH','Company name updated.',{name});}}>
        <label className="field">Company name
          <input value={name} onChange={event=>setName(event.target.value)} required minLength={3} maxLength={120} disabled={!data.owner||busy}/>
        </label>
        <p>Country {data.organization.country}</p>
        {data.owner&&<button className="button button-primary" disabled={busy||name.trim()===data.organization.name}>Save profile</button>}
      </form>
      {error&&<p className="message error" role="alert">{error}</p>}
      {notice&&<p role="status">{notice}</p>}
    </section>
    {data.owner&&<>
      <section className="panel organization-panel">
        <h2>Invite a member</h2>
        <p>Members can work on cases in this organization. Invitation links expire after 24 hours.</p>
        {data.canInvite?<form className="action-form" onSubmit={sendInvite}>
          <label className="field">Work email
            <input type="email" required maxLength={254} value={inviteEmail} onChange={event=>setInviteEmail(event.target.value)} disabled={busy}/>
          </label>
          <button className="button button-primary" disabled={busy}>Send invitation</button>
        </form>:<p>Invitations are unavailable until transactional storage and email delivery are configured.</p>}
        {!!data.invitations.length&&<ul className="workspace-list">{data.invitations.map(invite=>
          <li key={invite.id}><div><strong>{invite.email}</strong><p>{label(invite.status)} · {date(invite.expiresAt)}</p></div>
            {invite.status==='pending'&&<button className="button button-outline" disabled={busy}
              onClick={()=>void mutate('/organization/invitations/'+invite.id+'/revoke','POST','Invitation revoked.')}>Revoke</button>}
          </li>)}</ul>}
      </section>
      <section className="panel organization-panel">
        <h2>Members</h2>
        <ul className="workspace-list">{data.members.map(member=><li key={member.id}>
          <div><strong>{member.name}</strong><p>{member.email}</p><p>{label(member.organizationRole)} · {member.active?'Active':'Inactive'}</p></div>
          {member.active&&member.organizationRole!=='owner'&&<button className="button button-outline" disabled={busy}
            onClick={()=>{if(window.confirm('Deactivate this member and end their workspace sessions?'))
              void mutate('/organization/members/'+member.id+'/deactivate','POST','Member deactivated.');}}>Deactivate</button>}
        </li>)}</ul>
      </section>
      {!!data.history.length&&<section className="panel organization-panel">
        <h2>Recent membership activity</h2>
        <ul className="workspace-list">{data.history.map(event=><li key={event._id}>
          <div><strong>{label(event.kind)}</strong><p>{event.detail}</p></div><span>{date(event.createdAt)}</span>
        </li>)}</ul>
      </section>}
    </>}
  </div>;
}
