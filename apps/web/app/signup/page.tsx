'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {ArrowLeft,ArrowRight,CheckCircle2,LockKeyhole} from 'lucide-react';
import {api} from '@/lib/api';

type Options={emailSignupEnabled:boolean;googleEnabled:boolean;googleClientId:string|null};
export default function Signup(){
  const [available,setAvailable]=useState<boolean|null>(null);
  const [name,setName]=useState('');
  const [organizationName,setOrganizationName]=useState('');
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [confirm,setConfirm]=useState('');
  const [busy,setBusy]=useState(false);
  const [success,setSuccess]=useState(false);
  const [error,setError]=useState('');
  useEffect(()=>{let active=true;api<Options>('/auth/options').then(x=>{if(active)setAvailable(x.emailSignupEnabled)}).catch(()=>{if(active)setAvailable(false)});return()=>{active=false}},[]);
  async function submit(e:React.FormEvent){
    e.preventDefault();setError('');
    if(password!==confirm){setError('Passwords do not match.');return;}
    setBusy(true);
    try{
      await api('/auth/register',{method:'POST',body:JSON.stringify({name,organizationName,email,password})});
      setSuccess(true);setPassword('');setConfirm('');
    }catch(e){setError(e instanceof Error?e.message:'Registration failed. Please try again.');}
    finally{setBusy(false);}
  }
  return <main className="auth-page">
    <section className="auth-card">
      <Link href="/login" className="auth-back"><ArrowLeft size={16}/> Back to sign in</Link>
      <div className="eyebrow">NEW BUSINESS WORKSPACE</div>
      <h1>Create a creditor account</h1>
      <p className="auth-lead">Register your company to submit and track fictional overdue invoices in CollectDesk.</p>
      {available===null?<p className="auth-note">Checking registration availability…</p>:
        !available?<div className="auth-unavailable"><LockKeyhole size={20}/><div><strong>Self-registration is not enabled yet</strong><p>The workspace owner must configure verified email delivery. Existing demo accounts are still available on the sign-in page.</p></div></div>:
        success?<div className="auth-success"><CheckCircle2 size={25}/><div><strong>Check your email</strong><p>If this email can be registered, we sent a link to verify it. It expires in 30 minutes. Check your spam folder too.</p></div></div>:
        <form onSubmit={submit} className="auth-form">
          <label>Full name<input autoComplete="name" required minLength={2} maxLength={90} placeholder="Your full name" value={name} onChange={e=>setName(e.target.value)}/></label>
          <label>Company name<input autoComplete="organization" required minLength={3} maxLength={140} placeholder="Your business name" value={organizationName} onChange={e=>setOrganizationName(e.target.value)}/></label>
          <label>Business email<input autoComplete="email" type="email" required placeholder="name@business.com" value={email} onChange={e=>setEmail(e.target.value)}/></label>
          <label>Password<input autoComplete="new-password" type="password" required minLength={12} maxLength={128} value={password} onChange={e=>setPassword(e.target.value)} placeholder="At least 12 characters"/></label>
          <p className="auth-hint">Use 12+ characters, with uppercase, lowercase and a number.</p>
          <label>Confirm password<input autoComplete="new-password" type="password" required minLength={12} maxLength={128} value={confirm} onChange={e=>setConfirm(e.target.value)} placeholder="Repeat your password"/></label>
          {error&&<p role="alert" className="auth-error">{error}</p>}
          <button className="button button-primary" type="submit" disabled={busy}>{busy?'Sending verification…':'Send verification email'}<ArrowRight size={17}/></button>
        </form>}
      <p className="auth-legal">New accounts receive <b>Creditor</b> access only. Internal roles are not available through public signup. Demo data only; do not enter real invoice details.</p>
    </section>
  </main>;
}
