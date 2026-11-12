'use client';

import {useEffect,useState} from 'react';
import Link from 'next/link';
import {Bell,CheckCheck,ArrowUpRight,Inbox,RefreshCw} from 'lucide-react';
import AppShell from '@/components/AppShell';
import {api,User} from '@/lib/api';
import styles from './page.module.css';

type Update={id:string;caseId:string;caseCode:string;debtorName:string;kind:string;text:string;createdAt:string;unread:boolean};
type Feed={notifications:Update[];page:number;hasMore:boolean;unreadCount:number};

const titles:Record<string,string>={
  submitted:'Case submitted',review:'Review decision',assigned:'Case assigned',
  status:'Case status changed',note:'Case update',verified:'Receipt verified',
  reversal:'Receipt corrected',receipt:'Receipt recorded',
  receipt_rejected:'Receipt rejected',updated:'Case details updated'
};

function activityTime(value:string){
  const parsed=new Date(value);
  if(Number.isNaN(parsed.getTime()))return '—';
  return new Intl.DateTimeFormat('en-IN',{
    day:'2-digit',month:'short',hour:'numeric',minute:'2-digit',hour12:true,timeZone:'Asia/Kolkata'
  }).format(parsed);
}

function ActivityFeed({user}:{user:User}){
  const [items,setItems]=useState<Update[]>([]);
  const [view,setView]=useState<'all'|'unread'>('all');
  const [page,setPage]=useState(1);
  const [hasMore,setHasMore]=useState(false);
  const [unreadCount,setUnreadCount]=useState(0);
  const [busy,setBusy]=useState(true);
  const [marking,setMarking]=useState(false);
  const [error,setError]=useState('');
  const [refresh,setRefresh]=useState(0);

  useEffect(()=>{
    const controller=new AbortController();
    let active=true;
    setBusy(true);setError('');
    api<Feed>('/notifications?page='+page+(view==='unread'?'&unread=1':''),{signal:controller.signal}).then(data=>{
      if(!active)return;
      setItems(previous=>page===1?data.notifications:[...previous,...data.notifications.filter(next=>!previous.some(old=>old.id===next.id))]);
      setHasMore(data.hasMore);
      setUnreadCount(data.unreadCount);
    }).catch(e=>{if(active&&!controller.signal.aborted)setError(e.message);})
      .finally(()=>{if(active)setBusy(false);});
    return()=>{active=false;controller.abort();};
  },[page,refresh,view]);

  function changeView(next:'all'|'unread'){
    if(next===view)return;
    setItems([]);setHasMore(false);setPage(1);setView(next);
  }

  async function markRead(){
    setMarking(true);setError('');
    try{
      const result=await api<{seenAt:string}>('/notifications/read',{method:'POST'});
      const seen=new Date(result.seenAt).getTime();
      setItems(previous=>view==='unread'?[]:previous.map(item=>({...item,unread:new Date(item.createdAt).getTime()>seen})));
      if(view==='unread')setHasMore(false);
      setUnreadCount(0);
      window.dispatchEvent(new Event('collectdesk:notifications-read'));
    }catch(e){setError(e instanceof Error?e.message:'Could not update activity status.');}
    finally{setMarking(false);}
  }
  return <div className={styles.layout}>
    <section className={styles.intro}>
      <div><span className={styles.eyebrow}>ACTIVITY CENTER</span>
        <h2>Stay on top of every decision.</h2>
        <p>{user.role==='admin'?'Reviews, assignments, case changes, and receipt decisions across your workspace.':
          user.role==='operator'?'Updates from your currently assigned cases.':
          'Decisions and case updates from your company, without internal-only notes.'}</p>
      </div>
      <div className={styles.actions}>
        <span className={styles.counter}>{unreadCount>=100?'99+':unreadCount} unread</span>
        <button type="button" className="button button-outline" onClick={markRead}
          disabled={marking||busy||unreadCount===0}><CheckCheck size={16}/>{marking?'Saving…':'Mark all read'}</button>
      </div>
    </section>
    <section className={styles.feed} aria-label="Case activity updates" aria-live="polite">
      <div className={styles.heading}><div><Bell size={17}/><h3>Recent activity</h3></div>
        <button type="button" onClick={()=>{setPage(1);setRefresh(n=>n+1);}}
          className={styles.refresh} disabled={busy} aria-label="Refresh activity"><RefreshCw size={16}/></button>
      </div>
      <div className={styles.filters} role="group" aria-label="Filter activity updates">
        <button type="button" className={view==='all'?styles.selected:''} aria-pressed={view==='all'}
          onClick={()=>changeView('all')}>All updates</button>
        <button type="button" className={view==='unread'?styles.selected:''} aria-pressed={view==='unread'}
          onClick={()=>changeView('unread')}>Unread only</button>
      </div>
      {error&&<div className="message error" role="alert">{error}
        <button type="button" onClick={()=>{setPage(1);setRefresh(n=>n+1);}}>Retry</button></div>}
      {busy&&items.length===0?<div className={styles.empty} role="status">Loading your activity…</div>:
      items.length===0&&!error?<div className={styles.empty}><Inbox size={32}/>
        <strong>{view==='unread'?"You're all caught up":'Nothing to review yet'}</strong>
        <p>{view==='unread'?'New case updates will appear here.':'Relevant updates appear here when your cases move forward.'}</p>
        {view==='unread'?<button type="button" className="button button-outline" onClick={()=>changeView('all')}>View all updates</button>:
          <Link href="/cases" className="button button-outline">View cases <ArrowUpRight size={16}/></Link>}
      </div>:
      <div className={styles.list}>
        {items.map(item=><Link key={item.id} href={'/cases/'+encodeURIComponent(item.caseId)}
          className={styles.entry+(item.unread?' '+styles.unread:'')}>
          <span className={styles.indicator} aria-hidden="true">{item.unread?'•':''}</span>
          <span className={styles.entryBody}>
            <span className={styles.entryTop}><strong>{titles[item.kind]||'Case updated'}</strong><time dateTime={item.createdAt}>{activityTime(item.createdAt)}</time></span>
            <span className={styles.description}>{item.text}</span>
            <span className={styles.caseLabel}>{item.caseCode} <span aria-hidden="true">·</span> {item.debtorName}</span>
          </span>
          <ArrowUpRight className={styles.arrow} size={17} aria-hidden="true"/>
        </Link>)}
      </div>}
      {hasMore&&<div className={styles.more}><button type="button" className="button button-outline"
        disabled={busy} onClick={()=>setPage(n=>n+1)}>{busy?'Loading…':'Load more updates'}</button></div>}
    </section>
    <p className={styles.footnote}>Only updates for cases you can currently access are shown. Activity is drawn from the existing case audit trail.</p>
  </div>;
}
export default function NotificationsPage(){
  return <AppShell title="Activity updates" subtitle="Decisions, assignments and progress across your cases." action={false}>
    {(user:User)=><ActivityFeed user={user}/>}
  </AppShell>;
}
