'use client';
import {useState} from 'react';
import Link from 'next/link';
import {ArrowLeft,CheckCircle2} from 'lucide-react';
import {useRouter} from 'next/navigation';
import {api,User} from '@/lib/api';
export default function VerifyEmail({token}:{token:string}){
  const router=useRouter();
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [finished,setFinished]=useState(false);
  async function verify(){
    if(!token){setError('Verification link is missing a token. Request a new email.');return}
    setBusy(true);setError('');
    try{
      const result=await api<{user:User}>('/auth/verify-email',{method:'POST',body:JSON.stringify({token})});
      setFinished(true);
      router.replace('/dashboard');
    }catch(e){setError(e instanceof Error?e.message:'Could not verify this email.');}
    finally{setBusy(false);}
  }
  return <main className="auth-page"><section className="auth-card">
    <Link className="auth-back" href="/login"><ArrowLeft size={16}/> Back to sign in</Link>
    <div className="eyebrow">ACCOUNT VERIFICATION</div>
    <h1>Confirm your email</h1>
    <p className="auth-lead">Finish setting up your creditor workspace using sample information. Verification links expire after 30 minutes and work only once.</p>
    {error&&<div role="alert" className="auth-error">{error}</div>}
    {finished?<div className="auth-success"><CheckCircle2 size={24}/> Your email was verified. Opening the workspace…</div>:
      <button type="button" className="button button-primary" onClick={verify} disabled={busy||!token}>{busy?'Verifying…':'Verify email and continue'}</button>}
  </section></main>;
}
