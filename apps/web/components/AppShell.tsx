'use client';
import Link from 'next/link';
import {usePathname,useRouter} from 'next/navigation';
import {useEffect,useRef,useState} from 'react';
import {LayoutDashboard,FolderKanban,Plus,UserRound,LogOut,Menu,X,LifeBuoy,UserPlus,Bell,ChartNoAxesCombined,CalendarClock,Activity} from 'lucide-react';
import {api,User} from '@/lib/api';
import {useWorkspaceSession} from '@/components/WorkspaceSessionProvider';
import {ThemeToggle} from '@/components/ThemeProvider';
import BrandMark from '@/components/BrandMark';
import NotificationBell from '@/components/NotificationBell';

type Props={children:(user:User,onProfileSaved:(user:User)=>void)=>React.ReactNode;title:string;subtitle?:string;action?:boolean};

const roleName:Record<User['role'],string>={admin:'Administrator',creditor:'Creditor',operator:'Case operator'};

export default function AppShell({children,title,subtitle,action=true}:Props){
  const {user,ready,error:sessionError,ensureSession,retrySession,acceptUser,forgetSession}=useWorkspaceSession();
  const [menu,setMenu]=useState(false);
  const [logoutError,setLogoutError]=useState('');
  const [takingLong,setTakingLong]=useState(false);
  const pathname=usePathname();
  const router=useRouter();
  const menuTriggerRef=useRef<HTMLButtonElement|null>(null);
  const authError=sessionError||logoutError;
  const load=()=>{setLogoutError('');retrySession();};
  // The root session provider survives Next.js client-side route transitions.
  // Revalidate only if its last successful check is old, without hiding content.
  useEffect(()=>{ensureSession();},[pathname,ensureSession]);
  useEffect(()=>{
    if(ready && user?.role==='creditor' && !user.organizationId && pathname!=='/support' && pathname!=='/onboarding'){
      router.replace('/onboarding');
    }
  },[ready,user,pathname,router]);
  useEffect(()=>{setMenu(false);},[pathname]);
  useEffect(()=>{
    if(!menu)return;
    function closeOnEscape(event:KeyboardEvent){
      if(event.key==='Escape'){
        setMenu(false);
        menuTriggerRef.current?.focus();
      }
    }
    document.addEventListener('keydown',closeOnEscape);
    return()=>document.removeEventListener('keydown',closeOnEscape);
  },[menu]);
  useEffect(()=>{
    if(ready)return;
    const timeout=setTimeout(()=>setTakingLong(true),8000);
    return()=>clearTimeout(timeout);
  },[ready]);
  async function logout(){
    try{await api('/auth/logout',{method:'POST'});try {if(user)sessionStorage.removeItem('collectdesk-intake:'+user.id);} catch {} forgetSession();router.replace('/login');}
    catch(e:any){setLogoutError(e.message);}
  }
  const initials=user?.name?.split(' ').map(part=>part[0]).slice(0,2).join('')||'CD';
  const displayRole=user?roleName[user.role]:'Workspace user';
  return <div className="app-root" data-workspace-role={user?.role||'guest'}>
    <a className="workspace-skip" href="#workspace-content">Skip to workspace content</a>
    {menu&&<button className="mobile-overlay" type="button" aria-label="Close navigation" onClick={()=>setMenu(false)}/>}
    <aside id="workspace-sidebar" aria-label="Workspace navigation" className={`sidebar ${menu?'open':''}`}>
      <div className="sidebar-top">
        <Link href="/dashboard" className="brand" onClick={()=>setMenu(false)} aria-label="CollectDesk overview">
          <BrandMark className="brand-mark"/>
          <span className="brand-word">collect<span>Desk</span><small>CASE MANAGEMENT</small></span>
        </Link>
        <button type="button" className="icon-button hide-desktop" onClick={()=>setMenu(false)} aria-label="Close navigation"><X size={20}/></button>
      </div>
      <div className="workspace-identity" aria-label="Current workspace">
        <span className="workspace-avatar">{user?.role==='admin'?'OP':user?.role==='operator'?'CO':'CR'}</span>
        <span className="workspace-name"><strong>{user?.role==='admin'?'Operations control':user?.role==='operator'?'Collection workspace':'Creditor workspace'}</strong><small>Sample data only</small></span>

      </div>
      <nav className="sidebar-nav" aria-label="Main navigation">
        <span className="nav-caption">{user?.role==='admin'?'Operations':user?.role==='operator'?'My work':'Portfolio'}</span>
        <Link onClick={()=>setMenu(false)} className={`nav-link ${pathname==='/dashboard'?'active':''}`} aria-current={pathname==='/dashboard'?'page':undefined} href="/dashboard"><LayoutDashboard size={18}/> Overview</Link>
        <Link onClick={()=>setMenu(false)} className={`nav-link ${pathname.startsWith('/cases')?'active':''}`} aria-current={pathname.startsWith('/cases')?'page':undefined} href="/cases"><FolderKanban size={18}/> All cases</Link>
        {user&&<Link onClick={()=>setMenu(false)} className={'nav-link '+(pathname==='/reports'?'active':'')} aria-current={pathname==='/reports'?'page':undefined} href="/reports"><ChartNoAxesCombined size={18}/> Recovery reports</Link>}
        {user&&user.role!=='creditor'&&<Link onClick={()=>setMenu(false)} className={'nav-link '+(pathname==='/follow-ups'?'active':'')} aria-current={pathname==='/follow-ups'?'page':undefined} href="/follow-ups"><CalendarClock size={18}/> Follow-up queue</Link>}
        <Link onClick={()=>setMenu(false)} className={'nav-link '+(pathname==='/notifications'?'active':'')} aria-current={pathname==='/notifications'?'page':undefined} href="/notifications"><Bell size={18}/> Activity updates</Link>
        {user?.role==='admin'&&<Link onClick={()=>setMenu(false)} className={'nav-link '+(pathname==='/operations'?'active':'')} aria-current={pathname==='/operations'?'page':undefined} href="/operations"><Activity size={18}/> Operations control</Link>}
        <span className="nav-caption nav-caption-second">Workspace settings</span>
        <Link onClick={()=>setMenu(false)} className={`nav-link ${pathname==='/account'?'active':''}`} aria-current={pathname==='/account'?'page':undefined} href="/account"><UserRound size={18}/> Account & access</Link>
        <Link onClick={()=>setMenu(false)} className={`nav-link ${pathname==='/support'?'active':''}`} aria-current={pathname==='/support'?'page':undefined} href="/support"><LifeBuoy size={18}/> Help & support</Link>
        {user?.role==='admin'&&<Link onClick={()=>setMenu(false)} className={`nav-link ${pathname==='/staff'?'active':''}`} aria-current={pathname==='/staff'?'page':undefined} href="/staff"><UserPlus size={18}/> Staff invitations</Link>}
      </nav>
      <div className="sidebar-bottom">

        <div className="sidebar-account"><span className="user-avatar">{initials}</span><span className="user-meta"><strong>{user?.name||'Your account'}</strong><small>{displayRole}</small></span></div>
        <button className="sidebar-signout" type="button" onClick={logout}><LogOut size={16}/> Sign out</button>
      </div>
    </aside>
    <main className="main">
      <header className="topbar">
        <div className="topbar-left"><button ref={menuTriggerRef} type="button" className="icon-button hide-desktop" aria-controls="workspace-sidebar" aria-expanded={menu} aria-label="Open menu" onClick={()=>setMenu(true)}><Menu size={21}/></button><span className="breadcrumb"><span className="breadcrumb-root">Workspace</span><span className="breadcrumb-separator">/</span><b>{title}</b></span></div>
        <div className="topbar-right">
          {ready&&user&&<NotificationBell/>}
          <ThemeToggle />
          <Link href="/account" className="top-avatar-link" aria-label="View account and permissions" title="Account & access">
            <span className="top-avatar">{initials}</span>
          </Link>
        </div>
      </header>
      <div className="main-content" id="workspace-content" tabIndex={-1}>
        <div className="page-heading"><div><h1>{title}</h1>{subtitle&&<p>{subtitle}</p>}</div>{action&&user?.role==='creditor'&&(pathname==='/dashboard'||pathname==='/cases')&&<Link href="/cases/new" className="button button-primary"><Plus size={18}/> New case</Link>}</div>
        {authError?<div className="message error" role="alert">{authError} <button type="button" onClick={load}>Try again</button></div>:!ready||!user?<div className="loading-panel" role="status"><div className="spinner"/> <div>Loading your workspace…{takingLong&&<div className="slow-session-notice"><p className="muted">The server is taking longer than expected. Free hosting can take about a minute to wake after inactivity.</p><button className="button button-outline" type="button" onClick={load}>Retry connection</button></div>}</div></div>:children(user,acceptUser)}
        <footer className="app-footer"><Link href="/">CollectDesk website</Link><span>Sample records only · No real payments</span></footer>
      </div>
    </main>
  </div>;
}
