'use client';
import Script from 'next/script';
import {useEffect,useRef,useState} from 'react';
import {api,User} from '@/lib/api';

type Options={emailSignupEnabled:boolean;googleEnabled:boolean;googleClientId:string|null};
type GoogleResponse={credential:string};
declare global {
  interface Window {
    google?:{accounts:{id:{
      initialize:(configuration:{client_id:string;nonce:string;callback:(r:GoogleResponse)=>void;ux_mode:'popup'})=>void;
      renderButton:(container:HTMLElement,options:{type:string;theme:string;size:string;text:string;shape:string;width:number})=>void;
    }}};
  }
}

export default function GoogleSignIn({onAuthenticated}:{onAuthenticated:(user:User)=>void}){
  const [options,setOptions]=useState<Options|null>(null);
  const [scriptReady,setScriptReady]=useState(false);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [attempt,setAttempt]=useState(0);
  const target=useRef<HTMLDivElement|null>(null);
  const callback=useRef(onAuthenticated);
  useEffect(()=>{callback.current=onAuthenticated;},[onAuthenticated]);
  useEffect(()=>{
    let alive=true;
    api<Options>('/auth/options').then(d=>{if(alive)setOptions(d)}).catch(()=>{if(alive)setOptions({emailSignupEnabled:false,googleEnabled:false,googleClientId:null})});
    return()=>{alive=false};
  },[]);
  useEffect(()=>{
    if(!options?.googleEnabled||!options.googleClientId||!scriptReady||!window.google||!target.current)return;
    let cancelled=false;
    async function setup(){
      try{
        const {nonce}=await api<{nonce:string}>('/auth/google/nonce');
        if(cancelled||!target.current||!window.google)return;
        window.google.accounts.id.initialize({
          client_id:options!.googleClientId!,
          nonce,ux_mode:'popup',
          callback:async (response:GoogleResponse)=>{
            if(cancelled)return;
            setBusy(true);setError('');
            try{
              const result=await api<{user:User}>('/auth/google',{method:'POST',body:JSON.stringify({credential:response.credential})});
              callback.current(result.user);
            }catch(e){setError(e instanceof Error?e.message:'Google sign-in failed. Please try again.');}
            finally{if(!cancelled)setBusy(false);}
          }
        });
        target.current.replaceChildren();
        window.google.accounts.id.renderButton(target.current,{type:'standard',theme:'outline',size:'large',text:'continue_with',shape:'rectangular',width:340});
      }catch(e){if(!cancelled)setError(e instanceof Error?e.message:'Google is unavailable.');}
    }
    setup();
    return()=>{cancelled=true;};
  },[options,scriptReady,attempt]);
  if(!options?.googleEnabled)return null;
  return <div className="auth-google">
    <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" onReady={()=>setScriptReady(true)}/>
    <div ref={target} className="auth-google-button" aria-label="Google sign-in"/>
    {busy&&<p className="auth-note">Verifying Google account…</p>}
    {error&&<div role="alert" className="auth-error">{error} <button type="button" className="auth-retry-link" onClick={()=>{setError('');setAttempt(n=>n+1)}}>Try Google again</button></div>}
    <div className="auth-divider"><span>or continue with email</span></div>
  </div>;
}
