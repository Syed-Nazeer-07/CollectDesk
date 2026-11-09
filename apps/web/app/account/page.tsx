'use client';

import Link from 'next/link';
import {ArrowRight,BriefcaseBusiness,CheckCircle2,FileText,LockKeyhole,ShieldCheck,UserRound} from 'lucide-react';
import AppShell from '@/components/AppShell';
import type {User} from '@/lib/api';

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
    {(user:User)=>{
      const role=roleInfo[user.role];
      return <div className="demo-layout">
        <section className="panel demo-intro">
          <div className="demo-intro-heading">
            <span className="demo-intro-icon"><UserRound size={22}/></span>
            <div><span className="eyebrow">SIGNED IN ACCOUNT</span><h2>{user.name}</h2><p>{user.email}</p></div>
          </div>
          <div className="account-role-panel">
            <span className="account-role-icon"><ShieldCheck size={21}/></span>
            <div><strong>{role.name}</strong><p>{role.summary}</p></div>
          </div>
          <div className="demo-actions">
            <Link href="/cases" className="button button-primary">Open case register <ArrowRight size={17}/></Link>
            {user.role==='creditor'&&<Link href="/cases/new" className="button button-outline">Create a case</Link>}
          </div>
        </section>
        <section className="panel demo-section">
          <div className="panel-head"><div><h3>What you can do</h3><p>Your permissions are set by authorized workspace administrators.</p></div></div>
          <div className="account-permissions">
            {role.permissions.map(p=><div key={p}><CheckCircle2 size={17}/><span>{p}</span></div>)}
          </div>
          <div className="account-permission-note"><LockKeyhole size={17}/><p>Roles cannot be switched or self-assigned during sign-in. Contact a workspace administrator if your access needs to change.</p></div>
        </section>
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
