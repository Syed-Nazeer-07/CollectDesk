'use client';
import {useEffect,useState} from 'react';
import {useRouter} from 'next/navigation';
import {ArrowRight,BriefcaseBusiness,LockKeyhole,Eye,EyeOff,Check} from 'lucide-react';
import {api,User} from '@/lib/api';

const accounts=[
  {role:'Creditor',email:'creditor@demo.collectdesk.test',desc:'Submit & track invoices'},
  {role:'Administrator',email:'admin@demo.collectdesk.test',desc:'Review and assign'},
  {role:'Case operator',email:'operator@demo.collectdesk.test',desc:'Manage assigned cases'}
];

export default function Login(){
  const [email,setEmail]=useState(accounts[0].email);
  const [password,setPassword]=useState('');
  const [show,setShow]=useState(false);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const router=useRouter();
  useEffect(()=>{api<{user:User}>('/auth/me').then(()=>router.replace('/dashboard')).catch(()=>{});},[router]);
  async function login(e:React.FormEvent){
    e.preventDefault();setError('');setLoading(true);
    try{
      await api('/auth/login',{method:'POST',body:JSON.stringify({email,password})});
      router.push('/dashboard');router.refresh();
    }catch(err:any){setError(err.message);}
    finally{setLoading(false);}
  }
  return <div className="login-layout">
    <section className="login-story" aria-label="CollectDesk introduction">
      <div className="story-content">
        <div className="story-brand"><span className="brand-mark light"><BriefcaseBusiness size={22}/></span><span>collect<span>desk</span></span></div>
        <div className="story-tag">COMMERCIAL COLLECTIONS · DEMO WORKSPACE</div>
        <h2>From overdue invoice<br/>to <em>clear resolution.</em></h2>
        <p>One focused place to review cases, coordinate next steps, and track verified recoveries.</p>
        <div className="story-process" aria-label="How the demo works">
          <div><span>01</span><div><strong>Submit</strong><small>A creditor submits a fictional invoice</small></div></div>
          <div><span>02</span><div><strong>Review</strong><small>An administrator assigns and tracks the case</small></div></div>
          <div><span>03</span><div><strong>Verify</strong><small>Only verified receipts count as recovered</small></div></div>
        </div>
      </div>
      <div className="story-footer"><span>FICTIONAL DATA ONLY · NO REAL PAYMENTS</span></div>
    </section>
    <section className="login-panel">
      <div className="login-card">
        <span className="eyebrow">COLLECTDESK ACCESS</span>
        <h1>Sign in to your workspace</h1>
        <p>Choose a demo role, then enter the password provided for this workspace.</p>
        <div className="login-modes"><div className="login-modes-title">Demo account</div>
          <div className="account-picker">{accounts.map(acc=><button type="button" key={acc.role} aria-pressed={email===acc.email} className={`account-option ${email===acc.email?'selected':''}`} onClick={()=>{setEmail(acc.email);setError('');}}>
            <span className="account-check" aria-hidden="true">{email===acc.email&&<Check size={13}/>}</span>
            <span><strong>{acc.role}</strong><small>{acc.desc}</small></span>
          </button>)}</div>
        </div>
        <form className="form login-form" onSubmit={login}>
          <label>Email address<input type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@example.com"/></label>
          <label>Demo password<div className="password-wrap"><input type={show?'text':'password'} autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)} placeholder="Enter your workspace password"/><button type="button" onClick={()=>setShow(v=>!v)} aria-label={show?'Hide password':'Show password'}>{show?<EyeOff size={18}/>:<Eye size={18}/>}</button></div></label>
          {error&&<div className="message error" role="alert">{error}</div>}
          <button className="button button-primary login-submit" disabled={loading}>{loading?'Signing in…':'Sign in to workspace'}<ArrowRight size={18}/></button>
        </form>
        <div className="login-security"><LockKeyhole size={16}/> A fictional demonstration. Your workspace owner manages the demo password.</div>
      </div>
      <div className="login-copyright">© 2026 CollectDesk · Demonstration preview</div>
    </section>
  </div>;
}
