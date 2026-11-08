'use client';
import Link from 'next/link';
import {ArrowRight,CheckCircle2,FileText,LockKeyhole,ShieldCheck,UserRound,Wallet,ExternalLink} from 'lucide-react';
import AppShell from '@/components/AppShell';
import type {User} from '@/lib/api';

const permissions=[
  {name:'Creditor',subtitle:'Submission & visibility',details:'Creates invoice cases, submits drafts, follows public case activity, and views verified recoveries only.'},
  {name:'Administrator',subtitle:'Review & reconciliation',details:'Reviews submitted invoices, assigns operators, records test receipts, and verifies or reverses them.'},
  {name:'Case operator',subtitle:'Assigned case updates',details:'Views assigned cases and posts public or internal progress notes. Cannot verify receipts.'}
];

export default function DemoPage(){
  return <AppShell title="Demo & access" subtitle="Understand roles, privacy and the boundaries of this demonstration." action={false}>
    {(user:User)=><div className="demo-layout">
      <section className="panel demo-intro">
        <div className="demo-intro-heading"><span className="demo-intro-icon"><ShieldCheck size={21}/></span><div><span className="eyebrow">CURRENT SESSION</span><h2>{user.name}</h2><p>{user.email} · {user.role==='admin'?'Administrator':user.role==='operator'?'Case operator':'Creditor'}</p></div></div>
        <div className="demo-callout"><LockKeyhole size={18}/><p>This is a fictional, isolated preview. No actual invoices, client identities, payment processing, or recovery actions belong here.</p></div>
        <div className="demo-actions">
          <Link className="button button-primary" href="/cases">Open case register <ArrowRight size={17}/></Link>
          {user.role==='creditor'&&<Link className="button button-outline" href="/cases/new">Create a demo case</Link>}
        </div>
      </section>
      <section className="panel demo-section"><div className="panel-head"><div><h3>Access by role</h3><p>What each demo account can do</p></div></div>
        <div className="demo-role-grid">{permissions.map(p=><div className="demo-role" key={p.name}><div className="demo-role-top"><span className="demo-role-icon"><UserRound size={18}/></span><div><strong>{p.name}</strong><small>{p.subtitle}</small></div></div><p>{p.details}</p></div>)}</div>
      </section>
      <section className="demo-info-grid">
        <div className="panel demo-info-card"><FileText size={21}/><h3>Invoice workflow</h3><p>Submit a fictional overdue invoice. An administrator can review and assign it. The assigned operator can record progress.</p><Link href="/cases">View your cases <ArrowRight size={15}/></Link></div>
        <div className="panel demo-info-card"><Wallet size={21}/><h3>Verified recovery only</h3><p>Pending test receipts never count as recovered. Only verified receipts affect the figures, net of reversals.</p><Link href="/dashboard">Explore dashboard <ArrowRight size={15}/></Link></div>
      </section>
      <div className="demo-disclaimer"><CheckCircle2 size={17}/><p>Access is limited to your account and, for creditors, your organization. This preview is not a production financial system.</p></div>
    </div>}
  </AppShell>;
}
