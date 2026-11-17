'use client';

import {useEffect,useState} from 'react';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {Bell} from 'lucide-react';
import {api} from '@/lib/api';
import styles from './NotificationBell.module.css';

export default function NotificationBell(){
  const pathname=usePathname();
  const [unread,setUnread]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();
    let revision=0;
    async function refresh(){
      const current=++revision;
      try{
        const data=await api<{unreadCount:number}>('/notifications/count',{signal:controller.signal});
        if(current===revision)setUnread(data.unreadCount);
      }catch{/* Optional badge must never prevent workspace navigation. */}
    }
    void refresh();
    // Refresh when the user returns to the tab, without background polling
    // that repeatedly wakes free hosting when the workspace is idle.
    window.addEventListener('focus',refresh);
    window.addEventListener('collectdesk:notifications-read',refresh);
    return()=>{revision++;controller.abort();window.removeEventListener('focus',refresh);window.removeEventListener('collectdesk:notifications-read',refresh);};
  },[pathname]);
  return <Link href="/notifications" className={styles.link+(pathname==='/notifications'?' '+styles.active:'')}
    aria-label={unread>0?'Activity updates, '+(unread>=100?'99 or more':unread)+' unread':'Activity updates'}
    title="Activity updates">
    <Bell size={18} aria-hidden="true"/>
    {unread>0&&<span className={styles.badge} aria-hidden="true">{unread>=100?'99+':unread}</span>}
  </Link>;
}
