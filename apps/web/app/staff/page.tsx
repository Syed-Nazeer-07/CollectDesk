'use client';

import {useEffect,useState} from 'react';
import {UserPlus,Mail,RefreshCw,ShieldCheck} from 'lucide-react';
import AppShell from '@/components/AppShell';
import {api,User,date} from '@/lib/api';

type Invitation={
  id:string;email:string;role:'operator';status:'pending'|'consumed'|'revoked';
  createdAt:string;expiresAt:string;consumedAt:string|null
};
type Response={invitations:Invitation[]};

export default function StaffPage(){
  return <AppShell title="Staff invitations" subtitle="Invite authorized case operators to the sample workspace." action={false}>
    {user=>user.role==='admin'?<InvitationManager/>:
      <div className="message error" role="alert">You do not have permission to manage staff invitations.</div>}
  </AppShell>;
}

function InvitationManager(){
  const [email,setEmail]=useState('');
  const [items,setItems]=useState<Invitation[]>([]);
  const [busy,setBusy]=useState(false);
  const [senderReady,setSenderReady]=useState<boolean|null>(null);
  const [refresh,setRefresh]=useState(0);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  useEffect(()=>{
    let active=true;
    api<{enabled:boolean}>('/auth/password/options')
      .then(r=>{if(active)setSenderReady(r.enabled);})
      .catch(()=>{if(active)setSenderReady(false);});
    return()=>{active=false;};
  },[]);
  useEffect(()=>{
    let active=true;
    setLoading(true);
    api<Response>('/staff/invitations')
      .then(r=>{if(active){setItems(r.invitations);setError('');}})
      .catch(e=>{if(active)setError(e instanceof Error?e.message:'Could not load invitations.')})
      .finally(()=>{if(active)setLoading(false)});
    return()=>{active=false};
  },[refresh]);
  async function invite(event:React.FormEvent){
    event.preventDefault();
    if(senderReady!==true){setError('Email delivery is not configured for staff invitations.');return;}
    setBusy(true);setError('');setNotice('');
    try{
      await api('/staff/invitations',{method:'POST',body:JSON.stringify({
        email:email.trim().toLowerCase(),role:'operator'
      })});
      setNotice('Invitation sent. The operator has 24 hours to activate their account.');
      setEmail('');setRefresh(v=>v+1);
    }catch(e){setError(e instanceof Error?e.message:'Could not send the invitation.');}
    finally{setBusy(false);}
  }
  async function revoke(id:string){
    setError('');setNotice('');
    try{
      await api('/staff/invitations/'+encodeURIComponent(id)+'/revoke',{method:'POST'});
      setNotice('Invitation revoked. Its activation link is now invalid.');
      setRefresh(v=>v+1);
    }catch(e){setError(e instanceof Error?e.message:'Could not revoke invitation.');}
  }
  const pending=items.filter(x=>x.status==='pending'&&new Date(x.expiresAt)>new Date());
  return <div className="staff-grid">
    <section className="panel staff-panel">
      <div className="panel-head"><div><h3><UserPlus size={19}/> Invite an operator</h3>
        <p>Only administrators can invite staff. The invitee receives a one-time secure link.</p></div></div>
      <form onSubmit={invite} className="staff-form">
        <label className="field">Operator's email address
          <input type="email" required autoComplete="email" value={email}
            maxLength={254} placeholder="operator@example.com"
            onChange={e=>setEmail(e.target.value)}/>
        </label>
        <div className="staff-role-preview"><ShieldCheck size={18}/>
          <div><strong>Case operator</strong>
            <span>Can view assigned cases and record progress. Cannot self-assign admin access.</span>
          </div></div>
        <button className="button button-primary" type="submit" disabled={busy||senderReady!==true}>
          <Mail size={16}/>{busy?'Sending invitation…':'Send operator invitation'}
        </button>
        {senderReady===false&&<p className="message error" role="status">Staff invitations are unavailable until a verified transactional email sender is configured.</p>}
        <p className="muted staff-note">Requires a configured transactional email sender. Existing user accounts cannot be invited again. No passwords are shared by email.</p>
      </form>
    </section>
    <section className="panel staff-panel">
      <div className="panel-head"><div><h3>Invitation history</h3>
        <p>{pending.length} active invitation{pending.length===1?'':'s'} · Latest 100 invites</p></div>
        <button className="button button-muted button-small" type="button" onClick={()=>setRefresh(v=>v+1)} aria-label="Refresh invitations"><RefreshCw size={16}/></button>
      </div>
      {notice&&<p className="message success staff-feedback" role="status">{notice}</p>}
      {error&&<p className="message error staff-feedback" role="alert">{error}</p>}
      {loading?<p className="staff-list-empty">Loading invitation history…</p>:
        items.length===0?<p className="staff-list-empty">No invitations yet. Invite your first operator using the form.</p>:
        <ul className="staff-list">{items.map(item=>{
          const expired=item.status==='pending'&&new Date(item.expiresAt)<=new Date();
          const display=expired?'Expired':item.status==='pending'?'Pending':item.status==='consumed'?'Activated':'Revoked';
          return <li key={item.id}>
            <div><strong>{item.email}</strong>
              <span>Invited {date(item.createdAt)} · Expires {date(item.expiresAt)}</span></div>
            <div className="staff-list-actions">
              <span className={'support-pill support-pill-'+(item.status==='consumed'?'resolved':'open')}>{display}</span>
              {item.status==='pending'&&!expired&&
                <button type="button" className="button button-outline button-small"
                  onClick={()=>revoke(item.id)}>Revoke</button>}
            </div>
          </li>;
        })}</ul>}
    </section>
  </div>;
}
