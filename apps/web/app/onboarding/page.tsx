'use client';
import {useEffect,useState} from 'react';
import {useRouter} from 'next/navigation';
import {Building2,CheckCircle2} from 'lucide-react';
import {api,User} from '@/lib/api';

export default function Onboarding(){
  const [company,setCompany]=useState('');
  const [user,setUser]=useState<User|null>(null);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const router=useRouter();
  useEffect(()=>{let active=true;api<{user:User}>('/auth/me').then(({user})=>{
    if(!active)return;
    if(user.role!=='creditor'||user.organizationId)router.replace('/dashboard');
    else setUser(user);
  }).catch(()=>{if(active)router.replace('/login')}).finally(()=>{if(active)setLoading(false)});
  return()=>{active=false}},[router]);
  async function submit(e:React.FormEvent){
    e.preventDefault();setBusy(true);setError('');
    try{
      await api('/auth/organization',{method:'POST',body:JSON.stringify({organizationName:company})});
      router.replace('/dashboard');
    }catch(e){setError(e instanceof Error?e.message:'Could not create your workspace.');}
    finally{setBusy(false);}
  }
  return <main className="auth-page"><section className="auth-card">
    <span className="auth-mark"><Building2 size={22}/></span>
    <div className="eyebrow">COMPANY SETUP</div>
    <h1>Set up your company</h1>
    {loading?<p className="auth-note">Checking your session…</p>:<>
      <p className="auth-lead">Welcome{user?.name?', '+user.name:''}. Your account is ready. Add a company name before entering your creditor workspace.</p>
      <form onSubmit={submit} className="auth-form">
        <label>Company name<input value={company} onChange={e=>setCompany(e.target.value)} required minLength={3} maxLength={140} autoComplete="organization" placeholder="Your business name"/></label>
        {error&&<p role="alert" className="auth-error">{error}</p>}
        <button type="submit" disabled={busy} className="button button-primary">{busy?'Creating workspace…':'Create company workspace'}<CheckCircle2 size={17}/></button>
      </form>
      <p className="auth-legal">New public accounts receive Creditor access. Staff permissions are provisioned separately. Use sample data only.</p>
    </>}
  </section></main>;
}
