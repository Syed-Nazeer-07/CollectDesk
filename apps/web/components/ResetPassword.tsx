'use client';

import {useEffect,useState} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {ArrowLeft,ArrowRight,CheckCircle2,Eye,EyeOff,KeyRound} from 'lucide-react';
import BrandLockup from '@/components/BrandLockup';
import {api} from '@/lib/api';

export default function ResetPassword({token}:{token:string}){
  const router=useRouter();
  const [password,setPassword]=useState('');
  const [confirm,setConfirm]=useState('');
  const [show,setShow]=useState(false);
  const [busy,setBusy]=useState(false);
  const [complete,setComplete]=useState(false);
  const [error,setError]=useState('');

  // Keep the token only in component memory after the initial page load.
  useEffect(()=>{
    if(token && window.location.search){
      window.history.replaceState(null,'','/reset-password');
    }
  },[token]);

  async function submit(e:React.FormEvent<HTMLFormElement>){
    e.preventDefault();setError('');
    if(password!==confirm){setError('Passwords do not match.');return;}
    if(password.length<12||!/[a-z]/.test(password)||!/[A-Z]/.test(password)||!/[0-9]/.test(password)){
      setError('Use 12+ characters with uppercase and lowercase letters and a number.');return;
    }
    setBusy(true);
    try{
      await api('/auth/password/reset',{method:'POST',body:JSON.stringify({token,password})});
      setComplete(true);setPassword('');setConfirm('');
    }catch(e){setError(e instanceof Error?e.message:'Could not reset your password.');}
    finally{setBusy(false);}
  }
  return <main className="auth-page"><section className="auth-card">
    <BrandLockup/>
    <Link className="auth-back" href="/login"><ArrowLeft size={16}/> Back to sign in</Link>
    <span className="auth-mark"><KeyRound size={22}/></span>
    <div className="eyebrow">ACCOUNT RECOVERY</div>
    <h1>Set a new password</h1>
    {complete?<div className="auth-success" role="status"><CheckCircle2 size={23}/><div>
      <strong>Password updated</strong><p>For your security, previous sessions have been signed out. Use your new password to sign in.</p>
      <button type="button" className="auth-recovery-link" onClick={()=>router.replace('/login')}>
        Sign in again <ArrowRight size={15}/>
      </button>
    </div></div>:
    !token?<div className="auth-unavailable" role="alert"><KeyRound size={21}/><div>
      <strong>Invalid recovery link</strong><p>Request a new link from the sign-in page.</p>
      <Link className="auth-recovery-link" href="/forgot-password">Request a reset link <ArrowRight size={15}/></Link>
    </div></div>:
    <>
      <p className="auth-lead">Choose a strong password. This link expires after 30 minutes and can be used only once.</p>
      <form className="auth-form" onSubmit={submit}>
        <label>New password
          <div className="password-wrap">
            <input type={show?'text':'password'} autoComplete="new-password" required minLength={12} maxLength={128}
              placeholder="At least 12 characters" value={password} onChange={e=>setPassword(e.target.value)}/>
            <button type="button" aria-label={show?'Hide passwords':'Show passwords'} onClick={()=>setShow(v=>!v)}>
              {show?<EyeOff size={18}/>:<Eye size={18}/>}
            </button>
          </div>
        </label>
        <p className="auth-hint">Include uppercase and lowercase letters and a number.</p>
        <label>Confirm new password<input autoComplete="new-password" type={show?'text':'password'}
          required minLength={12} maxLength={128} value={confirm} onChange={e=>setConfirm(e.target.value)}
          placeholder="Repeat your new password"/></label>
        {error&&<p className="auth-error" role="alert">{error}</p>}
        <button type="submit" className="button button-primary" disabled={busy}>
          {busy?'Updating password…':'Update password'} <ArrowRight size={17}/>
        </button>
      </form>
    </>}
    <p className="auth-legal">CollectDesk is a sample-data preview. Do not share this link.</p>
  </section></main>;
}
