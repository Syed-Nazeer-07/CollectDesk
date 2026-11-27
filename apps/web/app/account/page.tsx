'use client';

import {useState, type FormEvent} from 'react';
import Link from 'next/link';
import {ArrowRight,BriefcaseBusiness,CheckCircle2,FileText,LockKeyhole,ShieldCheck,UserRound} from 'lucide-react';
import AppShell from '@/components/AppShell';
import {ThemeToggle} from '@/components/ThemeProvider';
import {api, type User} from '@/lib/api';

const roleInfo:Record<User['role'],{name:string;summary:string;permissions:string[]}> = {
  creditor:{
    name:'Creditor',
    summary:'Submit and follow invoice cases for your company.',
    permissions:['Create and update draft cases','Submit overdue invoices for review','View company case activity and verified recoveries']
  },
  admin:{
    name:'Administrator',
    summary:'Review, assign and reconcile cases across the workspace.',
    permissions:['Review submitted cases and request information','Assign active case operators','Record, verify, reject and reverse receipt entries']
  },
  operator:{
    name:'Case operator',
    summary:'Manage the cases assigned to your account.',
    permissions:['View cases assigned to you','Post progress updates and internal notes','Track case status and verified receipt information']
  }
};

export default function AccountPage(){
  return <AppShell title="Account & access" subtitle="Your account information and assigned permissions." action={false}>
    {(user,onProfileSaved)=>{
      const role=roleInfo[user.role];
      return <div className="demo-layout">
        <section className="panel demo-intro">
          <div className="demo-intro-heading">
            <span className="demo-intro-icon"><UserRound size={22}/></span>
            <div><h2>{user.name}</h2><p>{user.email}</p></div>
          </div>
          <div className="account-role-panel">
            <span className="account-role-icon"><ShieldCheck size={21}/></span>
            <div><strong>{role.name}</strong><p>{role.summary}</p></div>
          </div>
          <ProfileForm user={user} onSaved={onProfileSaved}/>
        </section>
        <section className="panel demo-section">
          <div className="panel-head"><div><h3>What you can do</h3><p>Your permissions are set by authorized workspace administrators.</p></div></div>
          <div className="account-permissions">
            {role.permissions.map(p=><div key={p}><CheckCircle2 size={17}/><span>{p}</span></div>)}
          </div>
          <div className="account-permission-note"><LockKeyhole size={17}/><p>Roles cannot be switched or self-assigned during sign-in. Contact a workspace administrator if your access needs to change.</p></div>
        </section>
        <section className="panel demo-section"><div className="panel-head"><div><h3>Appearance</h3><p>Choose the workspace theme.</p></div><ThemeToggle /></div></section>
        <section className="demo-info-grid">
          <div className="panel demo-info-card"><BriefcaseBusiness size={21}/><h3>Workspace</h3>
            <p>{user.organizationId?'Your creditor access is scoped to your assigned organization.':'Your access is controlled by your assigned staff role.'}</p>
            <Link href="/dashboard">Go to overview <ArrowRight size={15}/></Link>
          </div>
          <div className="panel demo-info-card"><FileText size={21}/><h3>Data and payments</h3>
            <p>This preview is for sample data only. It cannot be used to process actual payments or real collection cases.</p>
          </div>
        </section>
      </div>;
    }}
  </AppShell>;
}

function ProfileForm({user,onSaved}:{user:User;onSaved:(user:User)=>void}){
  const [name,setName]=useState(user.name);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  async function save(event:FormEvent){
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const result=await api<{user:User}>('/auth/me',{method:'PATCH',body:JSON.stringify({name})});
      onSaved(result.user);
      setName(result.user.name);
      setNotice('Display name saved.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save profile.');
    } finally {
      setSaving(false);
    }
  }
  return <form className="profile-form" onSubmit={save}>
    <label className="field">Display name
      <input required minLength={2} maxLength={90} autoComplete="name" value={name} disabled={saving}
        onChange={e=>{setName(e.target.value);setNotice('');setError('');}}/>
    </label>
    <button className="button button-outline" disabled={saving || name.trim()===user.name}>
      {saving?'Saving…':'Save display name'}
    </button>
    {error && <p className="message error" role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
  </form>;
}
