'use client';

import {useEffect,useState} from 'react';
import {useRouter} from 'next/navigation';
import Link from 'next/link';
import GoogleSignIn from '@/components/GoogleSignIn';
import {ArrowRight,BriefcaseBusiness,CheckCircle2,Eye,EyeOff,LockKeyhole} from 'lucide-react';
import {api,User} from '@/lib/api';

type AuthMode='login'|'signup';
type AuthOptions={emailSignupEnabled:boolean;googleEnabled:boolean;googleClientId:string|null};

export default function AuthWorkspace({initialMode}:{initialMode:AuthMode}){
  const router=useRouter();
  const [mode,setMode]=useState<AuthMode>(initialMode);
  const [options,setOptions]=useState<AuthOptions|null>(null);
  const [optionsError,setOptionsError]=useState(false);
  const [retryKey,setRetryKey]=useState(0);
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [showPassword,setShowPassword]=useState(false);
  const [fullName,setFullName]=useState('');
  const [company,setCompany]=useState('');
  const [confirmPassword,setConfirmPassword]=useState('');
  const [signupSuccess,setSignupSuccess]=useState(false);
  const [loading,setLoading]=useState(false);
  const [slow,setSlow]=useState(false);
  const [error,setError]=useState('');

  useEffect(()=>{setMode(initialMode)},[initialMode]);
  useEffect(()=>{
    let active=true;
    setOptionsError(false);
    api<AuthOptions>('/auth/options')
      .then(data=>{if(active)setOptions(data)})
      .catch(()=>{if(active)setOptionsError(true)});
    return()=>{active=false};
  },[retryKey]);
  useEffect(()=>{
    let active=true;
    api<{user:User}>('/auth/me').then(({user})=>{
      if(active)router.replace(user.role==='creditor'&&!user.organizationId?'/onboarding':'/dashboard');
    }).catch(()=>{});
    return()=>{active=false};
  },[router]);
  useEffect(()=>{
    if(!loading){setSlow(false);return;}
    const timer=setTimeout(()=>setSlow(true),9000);
    return()=>clearTimeout(timer);
  },[loading]);

  function switchMode(next:AuthMode){
    if(loading)return;
    setMode(next);
    setError('');
    setSlow(false);
    setPassword('');
    setConfirmPassword('');
    setSignupSuccess(false);
    // Keep both modes on the same page without navigating away.
    window.history.replaceState(null,'',next==='signup'?'/login?mode=signup':'/login');
  }

  function onAuthenticated(user:User){
    router.replace(user.role==='creditor'&&!user.organizationId?'/onboarding':'/dashboard');
  }

  async function signIn(e:React.FormEvent<HTMLFormElement>){
    e.preventDefault();setError('');setLoading(true);
    let authenticated=false;
    try{
      await api('/auth/login',{method:'POST',body:JSON.stringify({email,password})});
      authenticated=true;
      // Confirm that the signed session cookie is present before routing.
      const {user}=await api<{user:User}>('/auth/me');
      onAuthenticated(user);
    }catch(err:unknown){
      const problem=err as {message?:string;status?:number};
      setError(authenticated&&problem?.status===401
        ?'Sign-in succeeded but your browser did not save the session. Allow cookies for this site and try again.'
        :problem?.message||'Sign-in failed. Please try again.');
    }finally{setLoading(false);}
  }

  async function register(e:React.FormEvent<HTMLFormElement>){
    e.preventDefault();setError('');
    if(password!==confirmPassword){setError('Passwords do not match.');return;}
    setLoading(true);
    try{
      await api('/auth/register',{method:'POST',body:JSON.stringify({
        name:fullName,organizationName:company,email,password
      })});
      setSignupSuccess(true);
      setPassword('');setConfirmPassword('');
    }catch(err:unknown){
      setError(err instanceof Error?err.message:'Registration failed. Please try again.');
    }finally{setLoading(false);}
  }

  const emailSignupEnabled=options?.emailSignupEnabled===true;
  const googleEnabled=options?.googleEnabled===true;
  const isSignup=mode==='signup';
  return <div className="login-layout">
    <section className="login-story" aria-label="CollectDesk introduction">
      <div className="story-content">
        <Link className="story-brand" href="/" aria-label="CollectDesk home"><span className="brand-mark light"><BriefcaseBusiness size={22}/></span><span>collect<span>desk</span></span></Link>
        <div className="story-tag">COMMERCIAL COLLECTIONS · CASE MANAGEMENT</div>
        <h2>From overdue invoice<br/>to <em>clear resolution.</em></h2>
        <p>One focused place to review cases, coordinate next steps, and track verified recoveries.</p>
        <div className="story-process" aria-label="How CollectDesk works">
          <div><span>01</span><div><strong>Submit</strong><small>A creditor submits an invoice case</small></div></div>
          <div><span>02</span><div><strong>Review</strong><small>An administrator reviews and assigns the case</small></div></div>
          <div><span>03</span><div><strong>Verify</strong><small>Only verified receipts count as recovered</small></div></div>
        </div>
      </div>
      <div className="story-footer"><span>FICTIONAL DATA ONLY · NO REAL PAYMENTS</span></div>
    </section>
    <main className="login-panel">
      <div className="login-card auth-unified-card">
        <div className="auth-mode-switch" role="tablist" aria-label="Account access">
          <button type="button" role="tab" aria-selected={!isSignup} aria-controls="auth-panel-content"
            className={!isSignup?'active':''} disabled={loading} onClick={()=>switchMode('login')}>Sign in</button>
          <button type="button" role="tab" aria-selected={isSignup} aria-controls="auth-panel-content"
            className={isSignup?'active':''} disabled={loading} onClick={()=>switchMode('signup')}>Create account</button>
        </div>
        <div id="auth-panel-content" role="tabpanel" aria-label={isSignup?'Create account':'Sign in'}>
          <span className="eyebrow">{isSignup?'NEW BUSINESS WORKSPACE':'COLLECTDESK ACCESS'}</span>
          <h1>{isSignup?'Create your account':'Welcome back'}</h1>
          <p className="auth-panel-lead">{isSignup
            ?'Create a creditor workspace to submit and track invoice cases.'
            :'Sign in to access your workspace and track your cases.'}</p>

          {(!isSignup||(!optionsError&&!!options&&!signupSuccess&&googleEnabled))&&
            <GoogleSignIn showDivider={!isSignup||emailSignupEnabled} onAuthenticated={onAuthenticated}/>}

          {!isSignup?
            <form className="form login-form" onSubmit={signIn}>
              <label>Email address<input type="email" autoComplete="username" required
                value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@company.com"/></label>
              <label>Password
                <div className="password-wrap">
                  <input type={showPassword?'text':'password'} autoComplete="current-password" required
                    value={password} onChange={e=>setPassword(e.target.value)} placeholder="Enter your password"/>
                  <button type="button" onClick={()=>setShowPassword(v=>!v)}
                    aria-label={showPassword?'Hide password':'Show password'}>
                    {showPassword?<EyeOff size={18}/>:<Eye size={18}/>}
                  </button>
                </div>
              </label>
              {error&&<div className="message error" role="alert">{error}</div>}
              <button className="button button-primary login-submit" type="submit" disabled={loading}>
                {loading?'Signing in…':'Sign in'}<ArrowRight size={18}/>
              </button>
              {slow&&<p className="login-slow-notice" role="status">
                The server is responding slowly. It may be waking up; the request will time out rather than loading forever.
              </p>}
            </form>:
            optionsError?
              <div className="auth-unavailable" role="alert"><LockKeyhole size={20}/><div>
                <strong>Cannot check registration right now</strong>
                <p>The server may be waking up. <button className="auth-retry-link" type="button"
                  onClick={()=>{setOptions(null);setRetryKey(n=>n+1);}}>Try again</button></p>
              </div></div>:
            !options?
              <p className="auth-note" role="status">Checking registration availability…</p>:
            signupSuccess?
              <div className="auth-success" role="status"><CheckCircle2 size={25}/><div>
                <strong>Check your email</strong>
                <p>If this address can be registered, a verification link has been sent. It expires in 30 minutes. Check your spam folder, too.</p>
                <button type="button" className="auth-retry-link" onClick={()=>switchMode('login')}>Back to sign in</button>
              </div></div>:
            emailSignupEnabled?
              <form className="auth-form auth-inline-form" onSubmit={register}>
                <label>Full name<input autoComplete="name" required minLength={2} maxLength={90}
                  placeholder="Your full name" value={fullName} onChange={e=>setFullName(e.target.value)}/></label>
                <label>Company name<input autoComplete="organization" required minLength={3} maxLength={140}
                  placeholder="Your company name" value={company} onChange={e=>setCompany(e.target.value)}/></label>
                <label>Email address<input autoComplete="email" type="email" required placeholder="you@gmail.com"
                  value={email} onChange={e=>setEmail(e.target.value)}/></label>
                <label>Password<input autoComplete="new-password" type="password" required minLength={12} maxLength={128}
                  placeholder="At least 12 characters" value={password} onChange={e=>setPassword(e.target.value)}/></label>
                <p className="auth-hint">Use uppercase and lowercase letters and a number.</p>
                <label>Confirm password<input autoComplete="new-password" type="password" required minLength={12} maxLength={128}
                  placeholder="Repeat your password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)}/></label>
                {error&&<p role="alert" className="auth-error">{error}</p>}
                <button className="button button-primary" type="submit" disabled={loading}>
                  {loading?'Sending verification…':'Create account'}<ArrowRight size={17}/>
                </button>
                <p className="auth-hint auth-verification-caption">We will email you a link to verify your address before activating your account.</p>
                {slow&&<p className="login-slow-notice" role="status">The server is responding slowly. Please retry if the request times out.</p>}
              </form>:
            googleEnabled?
              <p className="auth-note">Continue with Google to create an account. Email and password registration is not currently available.</p>:
              <div className="auth-unavailable" role="status"><LockKeyhole size={20}/><div>
                <strong>Account registration is not available yet</strong>
                <p>Please contact the workspace administrator for access.</p>
              </div></div>}
        </div>
        <p className="auth-account-toggle">
          {isSignup?<>Already have an account? <button type="button" onClick={()=>switchMode('login')}>Sign in</button></>:
            <>New to CollectDesk? <button type="button" onClick={()=>switchMode('signup')}>Create an account</button></>}
        </p>
        <div className="login-security"><LockKeyhole size={16}/>
          {isSignup?'New accounts receive creditor access only. Staff roles cannot be self-assigned.':
            'Access is determined by your account permissions, not by a selected role.'}
        </div>
      </div>
      <div className="login-copyright">© 2026 CollectDesk</div>
    </main>
  </div>;
}
