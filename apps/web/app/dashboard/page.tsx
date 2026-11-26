'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {ArrowRight,ArrowUpRight,FolderKanban,Wallet,Clock3,CheckCircle2,TrendingUp} from 'lucide-react';
import AppShell from '@/components/AppShell';
import {CaseTable} from '@/components/Widgets';
import {api,Dashboard,money,User,label} from '@/lib/api';

const statusColors:Record<string,string>={
  draft:'#94a3b8',submitted:'#d8a558',needs_info:'#bf8167',accepted:'#6d90bc',
  in_progress:'#208879',on_hold:'#a18d69',rejected:'#ba7373',closed:'#687e9b'
};

export default function DashboardPage(){
  const [data,setData]=useState<Dashboard|null>(null);
  const [error,setError]=useState('');
  const [refresh,setRefresh]=useState(0);
  useEffect(()=>{
    let active=true;
    const controller=new AbortController();
    setError('');
    api<Dashboard>('/dashboard/summary',{signal:controller.signal})
      .then(d=>{if(active)setData(d);})
      .catch(e=>{if(active&&!controller.signal.aborted)setError(e.message);});
    return()=>{active=false;controller.abort();};
  },[refresh]);
  return <AppShell title="Overview" subtitle="Case status, outstanding balances and verified recoveries.">
    {(user:User)=><div className="dashboard-content">
      {error?<div className="message error" role="alert">{error} <button type="button" onClick={()=>setRefresh(v=>v+1)}>Retry</button></div>:!data?
        <div className="loading-panel" role="status"><div className="spinner"/> Loading dashboard…</div>:<>
        {user.role==='creditor'&&<GettingStarted user={user} dashboard={data}/>}
        <section className="metrics-grid" aria-label="Key metrics">
          <Stat name="Outstanding balance" value={money(data.summary.totalOutstandingPaise)} icon={<Wallet size={19}/>} priority sub="Excludes drafts and rejected cases"/>
          <Stat name="Verified recovered" value={money(data.summary.verifiedRecoveredPaise)} icon={<CheckCircle2 size={19}/>} priority sub="Verified receipts less reversals"/>
          <Stat name="Active cases" value={String(data.summary.activeCases)} icon={<TrendingUp size={19}/>} sub="Accepted, in progress or on hold"/>
          <Stat name="Total cases" value={String(data.summary.totalCases)} icon={<FolderKanban size={19}/>} sub="Cases you can access"/>
        </section>
        <div className="middle-grid">
          <section className="panel status-panel">
            <div className="panel-head"><div><h3>Case status</h3><p>Choose a status to filter the register</p></div><Link href="/cases" className="text-link">All cases <ArrowRight size={15}/></Link></div>
            <div className="status-breakdown">
              {data.statusBreakdown.filter(s=>s.count>0).length>0
                ? data.statusBreakdown.filter(s=>s.count>0).map(s=>{
                    const percent=Math.round((s.count/Math.max(data.summary.totalCases,1))*100);
                    return <Link key={s.status} className="status-breakdown-row" href={`/cases?status=${s.status}`}>
                      <span className="status-breakdown-name"><i style={{background:statusColors[s.status]}}/>{label(s.status)}</span>
                      <span className="status-breakdown-meter"><span style={{width:`${percent}%`,background:statusColors[s.status]}}/></span>
                      <strong>{s.count}</strong><ArrowUpRight size={15} aria-hidden="true"/>
                    </Link>;
                  })
                : <div className="dashboard-empty">No case activity yet. <Link href="/cases">Open the case register</Link>.</div>}
            </div>
          </section>
          <section className="panel focus-panel">
            <div className="panel-head"><div><h3>{user.role==='creditor'?'Your next actions':user.role==='admin'?'Operations queues':'Assigned work'}</h3></div></div>
            <Link href={user.role==='creditor'?'/cases/new':user.role==='admin'?'/cases?status=submitted':'/cases'} className="action-row">
              <span className="action-row-symbol"><Clock3 size={19}/></span>
              <span><strong>{user.role==='creditor'?'Submit an invoice':user.role==='admin'?`${data.summary.awaitingReview} case${data.summary.awaitingReview===1?'':'s'} awaiting review`:'Open assigned cases'}</strong><small>{user.role==='creditor'?'Prepare a sample overdue invoice for review':user.role==='admin'?'Open the submitted case queue':'See all cases assigned to your operator account'}</small></span>
              <ArrowUpRight size={18} aria-hidden="true"/>
            </Link>
            {(user.role==='creditor' ? ['needs_info','draft'] : user.role==='admin' ? ['accepted','on_hold'] : ['in_progress','on_hold']).map(status=>{
              const count=data.statusBreakdown.find(row=>row.status===status)?.count || 0;
              if (!count) return null;
              return <Link key={status} href={'/cases?status='+status} className="queue-link">
                <span>{label(status)}</span><strong>{count}</strong><ArrowUpRight size={16}/>
              </Link>;
            })}
            <div className="finance-totals">
              <span>Estimated service fees</span>
              <strong>{money(data.summary.estimatedFeesPaise)}</strong>
              <p>Illustrative fees on verified recoveries only. No real funds are handled.</p>
            </div>
          </section>
        </div>
        {data.attention&&<AttentionPanel attention={data.attention} role={user.role}/>}
        <section className="panel cases-panel">
          <div className="panel-head"><div><h3>Recent cases</h3><p>Latest updates across your accessible cases</p></div><Link href="/cases" className="text-link">View all cases <ArrowRight size={15}/></Link></div>
          <CaseTable cases={data.recentCases}/>
        </section>
      </>}
    </div>}
  </AppShell>;
}

function Stat({name,value,sub,icon,priority=false}:{name:string;value:string;sub:string;icon:React.ReactNode;priority?:boolean}){
  return <div className={priority?"metric-card metric-financial":"metric-card"}><div className="metric-top"><span>{name}</span><span className="metric-icon">{icon}</span></div><div className="metric-value">{value}</div><p>{sub}</p></div>;
}


/** Source-driven onboarding: progress is calculated from real scoped case data,
 * not localStorage or fabricated completion flags. */
function GettingStarted({user,dashboard}:{user:User;dashboard:Dashboard}){
  const statuses=dashboard.statusBreakdown;
  const hasSubmitted=statuses.some(s=>s.count>0&&s.status!=='draft');
  const hasDecision=statuses.some(s=>s.count>0&&
    ['needs_info','rejected','accepted','in_progress','on_hold','closed'].includes(s.status));
  const steps=[
    {title:'Company workspace',detail:'Your account is connected to its company.',done:Boolean(user.organizationId),href:'/account'},
    {title:'Create your first case',detail:'Save a fictional invoice as a draft.',done:dashboard.summary.totalCases>0,href:'/cases/new'},
    {title:'Submit for review',detail:'Send an overdue sample invoice.',done:hasSubmitted,href:'/cases?status=draft'},
    {title:'Follow the decision',detail:'See review updates and the case timeline.',done:hasDecision,href:'/cases'}
  ];
  const done=steps.filter(s=>s.done).length;
  if(done===steps.length)return null;
  return <section className="onboarding-panel" aria-labelledby="onboarding-title">
    <div className="onboarding-panel-top">
      <div><div className="eyebrow">GETTING STARTED</div>
        <h3 id="onboarding-title">Set up your collection workflow</h3>
        <p>Follow these steps using sample records. Need help? <Link href="/support" className="text-link">Contact support <ArrowUpRight size={13}/></Link></p>
      </div>
      <span className="onboarding-progress">{done} of {steps.length} completed</span>
    </div>
    <div className="onboarding-progress-track" role="progressbar"
      aria-label="Getting started progress" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={done}>
      <span style={{width:`${done/steps.length*100}%`}}/>
    </div>
    <div className="onboarding-steps">
      {steps.map((step,i)=>{
        const inner=<><CheckCircle2 size={19} aria-hidden="true"/>
          <strong>{i+1}. {step.title}</strong><span>{step.detail}</span></>;
        return step.done?
          <div key={step.title} className="onboarding-step onboarding-step-done" aria-label={step.title+' completed'}>{inner}</div>:
          <Link key={step.title} className="onboarding-step" href={step.href} aria-label={step.title}>{inner}</Link>;
      })}
    </div>
  </section>;
}

/** Backend-scoped, deterministic attention queue; never estimates collection probability. */
function AttentionPanel({attention,role}:{attention:NonNullable<Dashboard['attention']>;role:User['role']}){
  return <section className="panel cases-panel" aria-labelledby="attention-heading">
    <div className="panel-head">
      <div><h3 id="attention-heading">{role==='operator'?'Assigned cases requiring attention':'Overdue collection exposure'}</h3>
        <p>Active unpaid cases only · As of {attention.asOf} (India)</p></div>
      <Link href="/cases?sort=due" className="text-link">Open register <ArrowRight size={15}/></Link>
    </div>
    <div className="middle-grid">
      <div className="focus-panel">
        <div className="finance-totals"><span>{attention.overdueCount} overdue active cases</span><strong>{money(attention.overdueOutstandingPaise)}</strong><p>Remaining principal after verified receipts and reversals.</p></div>
        <div className="status-breakdown" aria-label="Outstanding balance by days overdue">
          {attention.aging.map(bucket=>{
            const percentage=attention.overdueOutstandingPaise?100*bucket.outstandingPaise/attention.overdueOutstandingPaise:0;
            return <div className="status-breakdown-row" key={bucket.band}>
              <span className="status-breakdown-name">{bucket.band} days ({bucket.count})</span>
              <span className="status-breakdown-meter" aria-hidden="true"><span style={{width:percentage+'%',background:statusColors.in_progress}}/></span>
              <strong>{money(bucket.outstandingPaise)}</strong>
            </div>;
          })}
        </div>
      </div>
      <div className="focus-panel">
        <div className="panel-head"><div><h3>Oldest unpaid cases</h3><p>Up to five, ordered by age then outstanding balance</p></div></div>
        {attention.priorityCases.length?attention.priorityCases.map(item=>
          <Link key={item.id} href={'/cases/'+item.id} className="action-row">
            <span className="action-row-symbol"><Clock3 size={19}/></span>
            <span><strong>{item.caseCode} · {item.debtorName}</strong><small>{item.overdueDays} days overdue · {label(item.status)} · {money(item.outstandingPaise)} outstanding</small></span>
            <ArrowUpRight size={18} aria-hidden="true"/>
          </Link>):<div className="dashboard-empty">No active unpaid overdue cases in your workspace.</div>}
      </div>
    </div>
  </section>;
}
