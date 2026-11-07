'use client';
import {useEffect,useState} from 'react';
import {Search,SlidersHorizontal,RefreshCw,ChevronLeft,ChevronRight} from 'lucide-react';
import AppShell from '@/components/AppShell';
import {CaseTable} from '@/components/Widgets';
import {api,CaseRow} from '@/lib/api';

type Pagination={page:number;pageSize:number;total:number;totalPages:number};
const PAGE_SIZE=25;
const STATUSES=['all','draft','submitted','needs_info','accepted','in_progress','on_hold','rejected','closed'];
export default function CasesPage(){
  const [cases,setCases]=useState<CaseRow[]>([]);
  const [pagination,setPagination]=useState<Pagination>({page:1,pageSize:PAGE_SIZE,total:0,totalPages:1});
  const [loading,setLoading]=useState(true),[error,setError]=useState('');
  const [q,setQ]=useState(''),[debouncedQ,setDebouncedQ]=useState('');
  const [status,setStatus]=useState('all'),[page,setPage]=useState(1),[reload,setReload]=useState(0);
  useEffect(()=>{
    const selected=new URLSearchParams(window.location.search).get('status');
    if(selected&&STATUSES.includes(selected))setStatus(selected);
  },[]);
  useEffect(()=>{
    const timeout=setTimeout(()=>setDebouncedQ(q.trim()),300);
    return ()=>clearTimeout(timeout);
  },[q]);
  useEffect(()=>{
    let cancelled=false;
    setLoading(true);setError('');
    const search=new URLSearchParams({page:String(page),limit:String(PAGE_SIZE)});
    if(status!=='all')search.set('status',status);
    if(debouncedQ)search.set('q',debouncedQ);
    api<{cases:CaseRow[];pagination:Pagination}>(`/cases?${search.toString()}`)
      .then(r=>{if(!cancelled){setCases(r.cases);setPagination(r.pagination);}})
      .catch(e=>{if(!cancelled){setError(e.message);setCases([]);}})
      .finally(()=>{if(!cancelled)setLoading(false);});
    return ()=>{cancelled=true;};
  },[page,status,debouncedQ,reload]);
  return <AppShell title="All cases" subtitle="Track, review, and manage your collection cases.">
    <section className="panel cases-full">
      <div className="case-tools">
        <div className="search-field"><Search size={18}/><input aria-label="Search cases" placeholder="Search by case, debtor, invoice…" value={q} onChange={e=>{setQ(e.target.value);setPage(1);}}/></div>
        <div className="select-wrap"><SlidersHorizontal size={17}/><select aria-label="Filter by status" value={status} onChange={e=>{setStatus(e.target.value);setPage(1);}}>{STATUSES.map(s=><option key={s} value={s}>{s==='all'?'All statuses':s.replace('_',' ')}</option>)}</select></div>
        <button className="button button-muted" type="button" onClick={()=>setReload(v=>v+1)} aria-label="Refresh cases"><RefreshCw size={16}/><span className="refresh-label">Refresh</span></button>
      </div>
      <div className="case-list-title"><h3>Case register <span>{pagination.total}</span></h3><p>Server-side search across all cases accessible to your account</p></div>
      {error&&<div className="message error" role="alert">{error} <button type="button" onClick={()=>setReload(v=>v+1)}>Try again</button></div>}
      {loading?<div className="loading-panel"><div className="spinner"/> Loading cases…</div>:!error?<CaseTable cases={cases}/>:null}
      <div className="table-bottom">
        <span aria-live="polite">{error?'Unable to load cases':`Showing ${cases.length} of ${pagination.total} matching cases · Page ${pagination.page} of ${pagination.totalPages}`}</span>
        <div className="pagination-actions">
          <button type="button" className="button button-muted" aria-label="Previous page" disabled={loading||page<=1} onClick={()=>setPage(v=>Math.max(1,v-1))}><ChevronLeft size={17}/> Previous</button>
          <button type="button" className="button button-muted" aria-label="Next page" disabled={loading||page>=pagination.totalPages} onClick={()=>setPage(v=>v+1)}>Next <ChevronRight size={17}/></button>
        </div>
      </div>
    </section>
  </AppShell>;
}
