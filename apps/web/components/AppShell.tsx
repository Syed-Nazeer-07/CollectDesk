'use client';
import Link from 'next/link';
import {usePathname,useRouter} from 'next/navigation';
import {useCallback,useEffect,useRef,useState} from 'react';
import {LayoutDashboard,FolderKanban,Plus,UserRound,LogOut,Menu,X,BriefcaseBusiness,Globe,LifeBuoy} from 'lucide-react';
import {api,User} from '@/lib/api';
import {ThemeToggle} from '@/components/ThemeProvider';
import BrandMark from '@/components/BrandMark';

type Props={children:(user:User)=>React.ReactNode;title:string;subtitle?:string;action?:boolean};

const roleName:Record<User['role'],string>={admin:'Administrator',creditor:'Creditor',operator:'Case operator'};

export default function AppShell({children,title,subtitle,action=true}:Props){
  const [user,setUser]=useState<User|null>(null);
  const [ready,setReady]=useState(false);
  const [menu,setMenu]=useState(false);
  const [authError,setAuthError]=useState('');
  const [takingLong,setTakingLong]=useState(false);
  const pathname=usePathname();
  const router=useRouter();
  const requestRef=useRef<AbortController|null>(null);
  const load=useCallback(()=>{
    // Cancel stale /auth/me fetches before retrying. Do not let an old response
    // overwrite a newer session check.
    requestRef.current?.abort();
    const controller=new AbortController();
    requestRef.current=controller;
    setReady(false);setTakingLong(false);setAuthError('');
    api<{user:User}>('/auth/me',{signal:controller.signal})
      .then(r=>{if(controller.signal.aborted)return;
        if(r.user.role==='creditor'&&!r.user.organizationId&&pathname!=='/support'){router.replace('/onboarding');return;}
        setUser(r.user);
      })
      .catch(e=>{
        if(controller.signal.aborted)return;
        if(e.status===401)router.replace('/login');
        else setAuthError(e.message);
      })
      .finally(()=>{if(requestRef.current===controller && !controller.signal.aborted)setReady(true);});
  },[router,pathname]);
  useEffect(()=>{load();return()=>{requestRef.current?.abort();};},[load]);
  useEffect(()=>{setMenu(false);},[pathname]);
  useEffect(()=>{
    if(ready)return;
    const timeout=setTimeout(()=>setTakingLong(true),8000);
    return()=>clearTimeout(timeout);
  },[ready]);
  async function logout(){
    try{await api('/auth/logout',{method:'POST'});router.replace('/login');}
    catch(e:any){setAuthError(e.message);}
  }
  const initials=user?.name?.split(' ').map(part=>part[0]).slice(0,2).join('')||'CD';
  const displayRole=user?roleName[user.role]:'Workspace user';
  return <div className="app-root">
    {menu&&<button className="mobile-overlay" type="button" aria-label="Close navigation" onClick={()=>setMenu(false)}/>}
    <aside className={`sidebar ${menu?'open':''}`}>
      <div className="sidebar-top">
        <Link href="/dashboard" className="brand" onClick={()=>setMenu(false)} aria-label="CollectDesk overview">
          <BrandMark className="brand-mark"/>
          <span className="brand-word">collect<span>Desk</span><small>CASE MANAGEMENT</small></span>
        </Link>
        <button type="button" className="icon-button hide-desktop" onClick={()=>setMenu(false)} aria-label="Close navigation"><X size={20}/></button>
      </div>
      <div className="workspace-identity" aria-label="Current workspace">
        <span className="workspace-avatar">CD</span>
        <span className="workspace-name"><strong>collectDesk</strong><small>{displayRole} workspace</small></span>
        <span className="workspace-indicator" aria-hidden="true"/>
      </div>
      <nav className="sidebar-nav" aria-label="Main navigation">
        <span className="nav-caption">WORKSPACE</span>
        <Link onClick={()=>setMenu(false)} className={`nav-link ${pathname==='/dashboard'?'active':''}`} aria-current={pathname==='/dashboard'?'page':undefined} href="/dashboard"><LayoutDashboard size={18}/> Overview</Link>
        <Link onClick={()=>setMenu(false)} className={`nav-link ${pathname.startsWith('/cases')&&pathname!=='/cases/new'?'active':''}`} aria-current={pathname.startsWith('/cases')&&pathname!=='/cases/new'?'page':undefined} href="/cases"><FolderKanban size={18}/> All cases</Link>
        {user?.role==='creditor'&&<Link onClick={()=>setMenu(false)} className={`nav-link ${pathname==='/cases/new'?'active':''}`} aria-current={pathname==='/cases/new'?'page':undefined} href="/cases/new"><Plus size={18}/> Create case</Link>}
        <span className="nav-caption nav-caption-second">ACCOUNT</span>
        <Link onClick={()=>setMenu(false)} className={`nav-link ${pathname==='/account'?'active':''}`} aria-current={pathname==='/account'?'page':undefined} href="/account"><UserRound size={18}/> Account & access</Link>
        <Link onClick={()=>setMenu(false)} className={`nav-link ${pathname==='/support'?'active':''}`} aria-current={pathname==='/support'?'page':undefined} href="/support"><LifeBuoy size={18}/> Help & support</Link>
      </nav>
      <div className="sidebar-bottom">
        <p className="sidebar-data-note">Sample records only · No payments processed</p>
        <div className="sidebar-account"><span className="user-avatar">{initials}</span><span className="user-meta"><strong>{user?.name||'Your account'}</strong><small>{displayRole}</small></span></div>
        <button className="sidebar-signout" type="button" onClick={logout}><LogOut size={16}/> Sign out</button>
      </div>
    </aside>
    <main className="main">
      <header className="topbar">
        <div className="topbar-left"><button type="button" className="icon-button hide-desktop" aria-label="Open menu" onClick={()=>setMenu(true)}><Menu size={21}/></button><span className="breadcrumb">Workspace <span>/</span> <b>{title}</b></span></div>
        <div className="topbar-right">
          <Link href="/" className="button button-muted button-small" title="View landing page">
            <Globe size={14} /> Site
          </Link>
          <ThemeToggle />
          <Link href="/account" className="top-avatar-link" aria-label="View account and permissions" title="Account & access">
            <span className="top-avatar">{initials}</span>
          </Link>
        </div>
      </header>
      <div className="main-content">
        <div className="page-heading"><div><div className="eyebrow">COLLECTDESK / WORKSPACE</div><h1>{title}</h1>{subtitle&&<p>{subtitle}</p>}</div>{action&&user?.role==='creditor'&&<Link href="/cases/new" className="button button-primary"><Plus size={18}/> New case</Link>}</div>
        {authError?<div className="message error" role="alert">{authError} <button type="button" onClick={load}>Try again</button></div>:!ready||!user?<div className="loading-panel" role="status"><div className="spinner"/> <div>Loading your workspace…{takingLong&&<div className="slow-session-notice"><p className="muted">The server is taking longer than expected. Free hosting can take about a minute to wake after inactivity.</p><button className="button button-outline" type="button" onClick={load}>Retry connection</button></div>}</div></div>:children(user)}
        <footer className="app-footer"><span>CollectDesk · Case management</span><span>Sample records only · No real payments</span></footer>
      </div>
    </main>
  </div>;
}
