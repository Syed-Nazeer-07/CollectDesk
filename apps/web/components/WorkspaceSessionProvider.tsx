'use client';

import {createContext,useCallback,useContext,useEffect,useRef,useState,type ReactNode} from 'react';
import {useRouter} from 'next/navigation';
import {api,ApiError,type User} from '@/lib/api';

type WorkspaceSession = {
  user:User|null;
  ready:boolean;
  error:string;
  ensureSession:()=>void;
  retrySession:()=>void;
  acceptUser:(user:User)=>void;
  forgetSession:()=>void;
};

// Keep the session in the persistent root layout, not in each route's AppShell.
// Every API still validates the signed cookie and checks roles on the server.
const SessionContext=createContext<WorkspaceSession|null>(null);
const REVALIDATE_AFTER_MS=60_000;

export function WorkspaceSessionProvider({children}:{children:ReactNode}){
  const router=useRouter();
  const [user,setUser]=useState<User|null>(null);
  const [ready,setReady]=useState(false);
  const [error,setError]=useState('');
  const current=useRef<User|null>(null);
  const lastVerified=useRef(0);
  const controller=useRef<AbortController|null>(null);
  const inFlight=useRef<Promise<void>|null>(null);
  const version=useRef(0);

  const acceptUser=useCallback((next:User)=>{
    ++version.current;
    controller.current?.abort();
    inFlight.current=null;
    current.current=next;
    lastVerified.current=Date.now();
    setUser(next);
    setError('');
    setReady(true);
  },[]);

  const forgetSession=useCallback(()=>{
    ++version.current;
    controller.current?.abort();
    inFlight.current=null;
    current.current=null;
    lastVerified.current=0;
    setUser(null);
    setError('');
    setReady(false);
  },[]);

  const load=useCallback((force:boolean)=>{
    // A remounted route reuses the known user immediately. Recheck periodically
    // in the background, without blanking the workspace on each navigation.
    if(inFlight.current)return;
    if(!force && current.current && Date.now()-lastVerified.current<REVALIDATE_AFTER_MS)return;
    const requestId=++version.current;
    const abort=new AbortController();
    controller.current=abort;
    if(!current.current)setReady(false);
    setError('');
    const task:Promise<void>=api<{user:User}>('/auth/me',{signal:abort.signal})
      .then(({user:next})=>{
        if(requestId!==version.current || abort.signal.aborted)return;
        current.current=next;
        lastVerified.current=Date.now();
        setUser(next);
        setReady(true);
      })
      .catch((cause:unknown)=>{
        if(requestId!==version.current || abort.signal.aborted)return;
        if(cause instanceof ApiError && cause.status===401){
          // Never retain a previous account when its server-side session expires.
          current.current=null;
          lastVerified.current=0;
          setUser(null);
          setError('');
          setReady(true);
          router.replace('/login');
        }else if(!current.current){
          setError(cause instanceof Error?cause.message:'Could not verify your session.');
          setReady(true);
        }
        // An intermittent revalidation failure must not erase a valid-looking
        // workspace; each protected API request still enforces permissions.
      })
      .finally(()=>{
        if(controller.current===abort)controller.current=null;
        if(inFlight.current===task)inFlight.current=null;
      });
    inFlight.current=task;
  },[router]);

  const ensureSession=useCallback(()=>load(false),[load]);
  const retrySession=useCallback(()=>load(true),[load]);

  useEffect(()=>{
    function recheckOnFocus(){
      if(document.visibilityState==='visible' && current.current)load(false);
    }
    const recheckRejectedSession=()=>{if(current.current)load(true);};
    window.addEventListener('collectdesk:session-rejected',recheckRejectedSession);
    window.addEventListener('focus',recheckOnFocus);
    document.addEventListener('visibilitychange',recheckOnFocus);
    return()=>{
      window.removeEventListener('collectdesk:session-rejected',recheckRejectedSession);
      window.removeEventListener('focus',recheckOnFocus);
      document.removeEventListener('visibilitychange',recheckOnFocus);
      controller.current?.abort();
    };
  },[load]);

  return <SessionContext.Provider value={{user,ready,error,ensureSession,retrySession,acceptUser,forgetSession}}>
    {children}
  </SessionContext.Provider>;
}

export function useWorkspaceSession(){
  const session=useContext(SessionContext);
  if(!session)throw new Error('WorkspaceSessionProvider is missing');
  return session;
}
