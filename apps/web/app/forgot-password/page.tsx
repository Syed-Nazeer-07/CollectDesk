'use client';

import {useEffect,useState} from 'react';
import Link from 'next/link';
import {ArrowLeft,ArrowRight,CheckCircle2,KeyRound,Mail} from 'lucide-react';
import {api} from '@/lib/api';

export default function ForgotPassword(){
  const [email,setEmail]=useState('');
  const [available,setAvailable]=useState<boolean|null>(null);
  const [availabilityError,setAvailabilityError]=useState('');
  const [busy,setBusy]=useState(false);
  const [sent,setSent]=useState(false);
  const [error,setError]=useState('');

  useEffect(()=>{
    let mounted=true;
    api<{enabled:boolean}>('/auth/password/options')
      .then(({enabled})=>{if(mounted)setAvailable(enabled);})
      .catch(()=>{if(mounted)setAvailabilityError('Could not check recovery availability. Reload this page to retry.');});
    return()=>{mounted=false;};
  },[]);

  async function submit(e:React.FormEvent<HTMLFormElement>){
    e.preventDefault();setBusy(true);setError('');
    try{
      await api('/auth/password/forgot',{method:'POST',body:JSON.stringify({email})});
      setSent(true);
    }catch(e){
      setError(e instanceof Error?e.message:'Could not send the recovery request.');
    }finally{setBusy(false);}
  }

  return <main className="auth-page"><section className="auth-card">
    <Link className="auth-back" href="/login"><ArrowLeft size={16}/> Back to sign in</Link>
    <span className="auth-mark"><Mail size={22}/></span>
    <div className="eyebrow">ACCOUNT RECOVERY</div>
    <h1>Forgot your password?</h1>
    <p className="auth-lead">Enter the email address for your CollectDesk account. If it is eligible, we&apos;ll send a secure reset link.</p>
    {sent?
      <div className="auth-success" role="status"><CheckCircle2 size={23}/><div>
        <strong>Check your inbox</strong>
        <p>If an eligible account exists, a reset link has been requested. Links expire after 30 minutes and can be used once. Check your spam folder, too.</p>
        <Link className="auth-recovery-link" href="/login">Return to sign in <ArrowRight size={15}/></Link>
      </div></div>:
      availabilityError?<p className="auth-error" role="alert">{availabilityError}</p>:
      available===null?<p className="auth-note" role="status">Checking recovery availability…</p>:
      !available?<div className="auth-unavailable" role="alert"><KeyRound size={21}/><div>
        <strong>Password recovery is unavailable</strong>
        <p>The workspace administrator must configure verification-email delivery before password recovery can be used.</p>
      </div></div>:
      <form className="auth-form" onSubmit={submit}>
        <label>Email address<input type="email" autoComplete="email" required
          maxLength={254} placeholder="you@company.com" value={email}
          onChange={e=>setEmail(e.target.value)}/></label>
        {error&&<div className="auth-error" role="alert">{error}</div>}
        <button type="submit" className="button button-primary" disabled={busy}>
          {busy?'Sending request…':'Send reset link'} <ArrowRight size={17}/>
        </button>
      </form>}
    <p className="auth-legal">For sample-data accounts only. Never share a recovery link or password with anyone.</p>
  </section></main>;
}
