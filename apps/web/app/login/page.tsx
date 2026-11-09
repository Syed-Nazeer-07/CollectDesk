'use client';
import {useEffect,useState} from 'react';
import {useRouter} from 'next/navigation';
import Link from 'next/link';
import GoogleSignIn from '@/components/GoogleSignIn';
import {ArrowRight,BriefcaseBusiness,LockKeyhole,Eye,EyeOff,Check,ChevronDown} from 'lucide-react';
import {api,User} from '@/lib/api';

const accounts=[
  {role:'Creditor',email:'creditor@demo.collectdesk.test',desc:'Submit & track invoices'},
  {role:'Administrator',email:'admin@demo.collectdesk.test',desc:'Review and assign'},
  {role:'Case operator',email:'operator@demo.collectdesk.test',desc:'Manage assigned cases'}
];

export default function Login(){
  const [email,setEmail]=useState('');
  const [selectedDemo,setSelectedDemo]=useState<string|null>(null);
  const [password,setPassword]=useState('');
  const [show,setShow]=useState(false);
  const [loading,setLoading]=useState(false);
  const [slow,setSlow]=useState(false);
  const [error,setError]=useState('');
  const router=useRouter();
  useEffect(()=>{api<{user:User}>('/auth/me').then(r=>router.replace(r.user.role==='creditor'&&!r.user.organizationId?'/onboarding':'/dashboard')).catch(()=>{});},[router]);
  useEffect(()=>{if(!loading){setSlow(false);return;}const timer=setTimeout(()=>setSlow(true),9000);return()=>clearTimeout(timer);},[loading]);
  async function login(e:React.FormEvent){
    e.preventDefault();setError('');setLoading(true);
    let authenticated=false;
    try{
      await api('/auth/login',{method:'POST',body:JSON.stringify({email,password})});
      authenticated=true;
      // Verify the HTTPS browser cookie is present before changing routes.
      // Avoid racing router.refresh() with a pending router transition.
      const {user}=await api<{user:User}>('/auth/me');
      router.replace(user.role==='creditor'&&!user.organizationId?'/onboarding':'/dashboard');
    }catch(err:any){
      setError(authenticated && err?.status===401
        ?'Sign-in succeeded, but your session cookie was not saved. Allow cookies for this site, then try again.'
        :err?.message||'Sign-in failed. Please try again.');
    }finally{setLoading(false);}
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
        <p>Access your workspace securely with your email and password, or continue with Google.</p>
        <GoogleSignIn onAuthenticated={user=>router.replace(user.role==='creditor'&&!user.organizationId?'/onboarding':'/dashboard')}/>
        <form className="form login-form" onSubmit={login}>
          <label>Email address<input type="email" autoComplete="username" required value={email} onChange={e=>{setEmail(e.target.value);setSelectedDemo(null);}} placeholder="name@company.com"/></label>
          <label>Password<div className="password-wrap"><input type={show?'text':'password'} autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)} placeholder="Enter your password"/><button type="button" onClick={()=>setShow(v=>!v)} aria-label={show?'Hide password':'Show password'}>{show?<EyeOff size={18}/>:<Eye size={18}/>}</button></div></label>
          {error&&<div className="message error" role="alert">{error}</div>}
          <button className="button button-primary login-submit" disabled={loading}>{loading?'Signing in…':'Sign in to workspace'}<ArrowRight size={18}/></button>
          {slow&&<p className="login-slow-notice" role="status">The free demo server is responding slowly. It may be waking up; the request will time out rather than loading forever.</p>}
        </form>
        <p className="auth-signup-link">New business? <Link href="/signup">Create an account</Link></p>
        <details className="demo-access">
          <summary>Explore demo workspaces <ChevronDown size={16} aria-hidden="true"/></summary>
          <div className="demo-access-body">
            <p>Preview the different workspaces using a demo account. Choose one to fill its email, then enter the demo password provided to you.</p>
            <div className="account-picker">{accounts.map(acc=><button type="button" key={acc.role}
              aria-pressed={selectedDemo===acc.email}
              className={`account-option ${selectedDemo===acc.email?'selected':''}`}
              onClick={()=>{setEmail(acc.email);setSelectedDemo(acc.email);setPassword('');setError('');}}>
              <span className="account-check" aria-hidden="true">{selectedDemo===acc.email&&<Check size={13}/>}</span>
              <span><strong>{acc.role}</strong><small>{acc.desc}</small></span>
            </button>)}</div>
            <p className="demo-access-note">These are pre-existing demonstration accounts, not selectable permissions. Your access is always determined by your authenticated account.</p>
          </div>
        </details>
        <div className="login-security"><LockKeyhole size={16}/> This is a fictional demonstration. Admin and operator access is invite-only.</div>
      </div>
      <div className="login-copyright">© 2026 CollectDesk · Demonstration preview</div>
    </section>
  </div>;
}
