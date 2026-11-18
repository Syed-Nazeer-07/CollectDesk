'use client';
import {useEffect,useState} from 'react';
import {useRouter} from 'next/navigation';
import Link from 'next/link';
import {Building2,CheckCircle2} from 'lucide-react';
import BrandLockup from '@/components/BrandLockup';
import {api,User} from '@/lib/api';
import {useWorkspaceSession} from '@/components/WorkspaceSessionProvider';

export default function Onboarding(){
  const [company,setCompany]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const router=useRouter();
  const {user,ready,error:sessionError,ensureSession,retrySession,acceptUser}=useWorkspaceSession();
  useEffect(()=>{ensureSession();},[ensureSession]);
  useEffect(()=>{
    if(ready && user && (user.role!=='creditor'||user.organizationId))router.replace('/dashboard');
  },[ready,user,router]);
  async function submit(e:React.FormEvent){
    e.preventDefault();setBusy(true);setError('');
    try{
      const {user}=await api<{user:User}>('/auth/organization',{method:'POST',body:JSON.stringify({organizationName:company})});
      acceptUser(user);
      router.replace('/dashboard');
    }catch(e){setError(e instanceof Error?e.message:'Could not create your workspace.');}
    finally{setBusy(false);}
  }
  return <main className="auth-page"><section className="auth-card">
    <BrandLockup/>
    <span className="auth-mark"><Building2 size={22}/></span>
    <div className="eyebrow">COMPANY SETUP</div>
    <h1>Set up your company</h1>
    {sessionError?<p role="alert" className="auth-error">{sessionError} <button onClick={retrySession}>Retry</button></p>:!ready||!user||user.organizationId?
      <p className="auth-note" role="status">Checking your session…</p>:<>
      <p className="auth-lead">Welcome{user?.name?', '+user.name:''}. Your account is ready. Add a company name before entering your creditor workspace.</p>
      <form onSubmit={submit} className="auth-form">
        <label>Company name<input value={company} onChange={e=>setCompany(e.target.value)} required minLength={3} maxLength={140} autoComplete="organization" placeholder="Your business name"/></label>
        {error&&<p role="alert" className="auth-error">{error}</p>}
        <button type="submit" disabled={busy} className="button button-primary">{busy?'Creating workspace…':'Create company workspace'}<CheckCircle2 size={17}/></button>
      </form>
      <p className="auth-legal">New public accounts receive Creditor access. Staff permissions are provisioned separately. Use sample data only. Need help? <Link href="/support">Contact support</Link>.</p>
    </>}
  </section></main>;
}
