'use client';

import {useEffect,useRef,useState,type FormEvent} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import BrandMark from '@/components/BrandMark';
import {useWorkspaceSession} from '@/components/WorkspaceSessionProvider';
import {api,type User} from '@/lib/api';

export default function JoinOrganizationPage(){
  const router=useRouter();
  const {acceptUser}=useWorkspaceSession();
  const tokenRef=useRef('');
  const [ready,setReady]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  useEffect(()=>{
    const token=new URLSearchParams(window.location.hash.slice(1)).get('token');
    if(token){
      tokenRef.current=token;
      window.history.replaceState(window.history.state,'','/organization/join');
    }
    setReady(Boolean(tokenRef.current));
  },[]);

  async function join(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    const fields=new FormData(event.currentTarget);
    const password=String(fields.get('password'));
    if(password!==fields.get('confirm')){
      setError('Enter the same password twice.');
      return;
    }
    setBusy(true);
    setError('');
    try{
      const {user}=await api<{user:User}>('/auth/organization-invite/accept',{
        method:'POST',body:JSON.stringify({token:tokenRef.current,name:fields.get('name'),password})
      });
      acceptUser(user);
      router.replace('/organization');
    }catch(error){setError(error instanceof Error?error.message:'Could not join this organization.');}
    finally{setBusy(false);}
  }

  return <main className="staff-activation-wrap">
    <section className="staff-activation-card panel">
      <Link className="staff-activation-brand" href="/"><BrandMark className="brand-mark"/><strong>CollectDesk</strong></Link>
      <h1>Join your organization</h1>
      {ready?<form className="staff-activation-form" onSubmit={join}>
        <label className="field">Full name<input name="name" autoComplete="name" required minLength={2} maxLength={90}/></label>
        <label className="field">Password<input name="password" autoComplete="new-password" required type="password" minLength={12} maxLength={72}/>
          <small>Use at least 12 characters, including uppercase, lowercase and a number.</small>
        </label>
        <label className="field">Confirm password<input name="confirm" autoComplete="new-password" required type="password"/></label>
        {error&&<p className="message error" role="alert">{error}</p>}
        <button type="submit" className="button button-primary" disabled={busy}>{busy?'Joining…':'Join organization'}</button>
      </form>:<p>Open the invitation sent to your work email to join.</p>}
      <Link href="/login">Sign in to an existing account</Link>
    </section>
  </main>;
}
