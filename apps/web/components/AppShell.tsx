'use client';
import Link from 'next/link';
import {usePathname,useRouter} from 'next/navigation';
import {useCallback,useEffect,useState} from 'react';
import {LayoutDashboard,FolderKanban,Plus,ShieldCheck,LogOut,Search,ChevronDown,Menu,X,ArrowUpRight,LifeBuoy,BriefcaseBusiness,PanelLeftClose} from 'lucide-react';
import {api,User} from '@/lib/api';

type Props={children:(user:User)=>React.ReactNode; title:string;subtitle?:string; action?:boolean};
export default function AppShell({children,title,subtitle,action=true}:Props){
  const [user,setUser]=useState<User|null>(null);
  const [ready,setReady]=useState(false);
  const [menu,setMenu]=useState(false);
  const [authError,setAuthError]=useState('');
  const pathname=usePathname();const router=useRouter();
  const load=useCallback(()=>{api<{user:User}>('/auth/me').then(r=>setUser(r.user)).catch(e=>{
    if(e.status===401)router.replace('/login'); else setAuthError(e.message);
  }).finally(()=>setReady(true));},[router]);
  useEffect(()=>{load();},[load]);
  async function logout(){try{await api('/auth/logout',{method:'POST'});router.replace('/login');}catch(e:any){setAuthError(e.message);}}
  return <div className="app-root">
    {menu&&<button className="mobile-overlay" aria-label="Close navigation" onClick={()=>setMenu(false)}/>}
    <aside className={`sidebar ${menu?'open':''}`}>
      <div className="sidebar-top"><Link href="/dashboard" className="brand" onClick={()=>setMenu(false)}><span className="brand-mark"><BriefcaseBusiness size={21} strokeWidth={2.2}/></span><span className="brand-word">collect<span>desk</span><small>COLLECTION WORKSPACE</small></span></Link><button className="icon-button hide-desktop" onClick={()=>setMenu(false)} aria-label="Close navigation"><X size={20}/></button></div>
      <div className="workspace-select"><div className="workspace-avatar">CD</div><div className="workspace-name"><strong>Demo workspace</strong><small>Commercial collections</small></div><ChevronDown size={16} color="#94A3B8"/></div>
      <nav className="sidebar-nav" aria-label="Main navigation"><span className="nav-caption">WORKSPACE</span>
        <Link onClick={()=>setMenu(false)} className={`nav-link ${pathname==='/dashboard'?'active':''}`} href="/dashboard"><LayoutDashboard size={18}/> Overview</Link>
        <Link onClick={()=>setMenu(false)} className={`nav-link ${pathname.startsWith('/cases')&&pathname!=='/cases/new'?'active':''}`} href="/cases"><FolderKanban size={18}/> All cases</Link>
        {user?.role==='creditor'&&<Link onClick={()=>setMenu(false)} className={`nav-link ${pathname==='/cases/new'?'active':''}`} href="/cases/new"><Plus size={18}/> Create case</Link>}
        <span className="nav-caption nav-caption-second">WORKSPACE INFO</span><div className="nav-link nav-disabled"><ShieldCheck size={18}/> Demo & access <span className="soon">SAFE</span></div>
      </nav>
      <div className="sidebar-bottom"><div className="safety-note"><span className="safety-dot"/><strong>Demo environment</strong><p>Fictional invoices only. No real collection activity or payment processing.</p></div><button className="user-control" onClick={logout}><span className="user-avatar">{user?.name?.split(' ').map(t=>t[0]).slice(0,2).join('')||'CD'}</span><span className="user-meta"><strong>{user?.name||'Account'}</strong><small>{user?.role||'Loading...'}</small></span><LogOut size={17}/></button></div>
    </aside>
    <main className="main"><header className="topbar"><div className="topbar-left"><button className="icon-button hide-desktop" aria-label="Open menu" onClick={()=>setMenu(true)}><Menu size={21}/></button><span className="breadcrumb">Workspace <span>/</span> <b>{title}</b></span></div><div className="topbar-right"><span className="topbar-demo"><span className="safety-dot"/> Demo mode</span><div className="top-avatar">{user?.name?.[0]||'C'}</div></div></header>
      <div className="main-content"><div className="page-heading"><div><div className="eyebrow">COMMERCIAL COLLECTIONS / WORKSPACE</div><h1>{title}</h1>{subtitle&&<p>{subtitle}</p>}</div>{action&&user?.role==='creditor'&&<Link href="/cases/new" className="button button-primary"><Plus size={18}/> New case</Link>}</div>
        {authError?<div className="message error">{authError} <button onClick={()=>location.reload()}>Retry</button></div>:!ready||!user?<div className="loading-panel"><div className="spinner"/> Loading your secure workspace…</div>:children(user)}
        <footer className="app-footer"><span>CollectDesk v0.2 · Fictional data only</span><span>Built for demonstration · No funds moved</span></footer>
      </div>
    </main>
  </div>;
}
