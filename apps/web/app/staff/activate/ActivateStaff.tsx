'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {ShieldCheck,ArrowRight} from 'lucide-react';
import {api,User} from '@/lib/api';
import BrandMark from '@/components/BrandMark';

type InvitationInfo={email:string;role:'operator';expiresAt:string};
export default function ActivateStaff(){
  const router=useRouter();
  const [token,setToken]=useState('');
  const [invitation,setInvitation]=useState<InvitationInfo|null>(null);
  const [name,setName]=useState('');
  const [password,setPassword]=useState('');
  const [confirm,setConfirm]=useState('');
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  useEffect(()=>{
    const fragment=window.location.hash.startsWith('#token=')?window.location.hash.slice(7):'';
    let value='';
    try{value=decodeURIComponent(fragment);}catch{}
    // Keep compatibility with older query-string invitations.
    if(!value)value=new URLSearchParams(window.location.search).get('token')||'';
    // Remove the one-time token from browser history immediately.
    window.history.replaceState(window.history.state,'','/staff/activate');
    if(!value){setError('An invitation link is required. Ask your administrator to send a new one.');setLoading(false);return;}
    setToken(value);
    api<InvitationInfo>('/auth/staff-invite/inspect',{method:'POST',body:JSON.stringify({token:value})})
      .then(r=>setInvitation(r))
      .catch(e=>setError(e instanceof Error?e.message:'This invitation is no longer valid.'))
      .finally(()=>setLoading(false));
  },[]);
  async function activate(e:React.FormEvent){
    e.preventDefault();
    if(password!==confirm){setError('Passwords do not match.');return;}
    setBusy(true);setError('');
    try{
      const result=await api<{user:User}>('/auth/staff-invite/accept',{
        method:'POST',body:JSON.stringify({token,name,password})
      });
      if(result.user.role!=='operator')throw new Error('Unexpected account role.');
      router.replace('/dashboard');
    }catch(e){setError(e instanceof Error?e.message:'Could not activate your account.');}
    finally{setBusy(false);}
  }
  return <main className="staff-activation-wrap">
    <div className="staff-activation-card panel">
      <Link className="staff-activation-brand" href="/">
        <BrandMark className="brand-mark"/><strong>collect<span>Desk</span></strong>
      </Link>
      <span className="staff-activation-icon"><ShieldCheck size={23}/></span>
      <div className="eyebrow">INVITATION ONLY · SAMPLE WORKSPACE</div>
      <h1>Join your operations team.</h1>
      <p className="staff-activation-intro">A CollectDesk administrator can invite you as a case operator. Create a password to access only the cases assigned to you.</p>
      {loading?<p role="status">Checking invitation…</p>:invitation?
        <form className="staff-activation-form" onSubmit={activate}>
          <div className="staff-invite-email"><span>Invitation for</span><strong>{invitation.email}</strong>
            <span>Role: Case operator · Expires {new Date(invitation.expiresAt).toLocaleDateString('en-IN')}</span></div>
          <label className="field">Your full name
            <input required minLength={2} maxLength={90} value={name}
              autoComplete="name" placeholder="Your name" onChange={e=>setName(e.target.value)}/>
          </label>
          <label className="field">Set password
            <input required type="password" minLength={12} maxLength={128}
              autoComplete="new-password" placeholder="At least 12 characters"
              value={password} onChange={e=>setPassword(e.target.value)}/>
            <small>Use uppercase, lowercase and a number.</small>
          </label>
          <label className="field">Confirm password
            <input required type="password" minLength={12} maxLength={128}
              autoComplete="new-password" placeholder="Repeat your password"
              value={confirm} onChange={e=>setConfirm(e.target.value)}/>
          </label>
          {error&&<p className="message error" role="alert">{error}</p>}
          <button className="button button-primary" type="submit" disabled={busy}>
            {busy?'Creating operator account…':'Activate operator account'} <ArrowRight size={17}/>
          </button>
        </form>:
        <p className="message error" role="alert">{error}</p>}
      <p className="staff-activation-footer">Already have an account? <Link href="/login">Sign in</Link> · Never enter real invoices into this preview.</p>
    </div>
  </main>;
}
