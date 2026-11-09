'use client';

import {Suspense,useEffect,useState} from 'react';
import {useRouter,useSearchParams} from 'next/navigation';
import {Search,SlidersHorizontal,RefreshCw,ChevronLeft,ChevronRight,X} from 'lucide-react';
import AppShell from '@/components/AppShell';
import {CaseTable} from '@/components/Widgets';
import {api,CaseRow,label} from '@/lib/api';

type Pagination={page:number;pageSize:number;total:number;totalPages:number};
const PAGE_SIZE=25;
const STATUSES=['all','draft','submitted','needs_info','accepted','in_progress','on_hold','rejected','closed'] as const;
type StatusFilter=typeof STATUSES[number];

export default function CasesPage(){
  return <AppShell title="All cases" subtitle="Track, review, and manage your collection cases.">
    {()=> <Suspense fallback={<div className="loading-panel" role="status"><div className="spinner"/> Loading case register…</div>}>
      <CaseRegister/>
    </Suspense>}
  </AppShell>;
}

function CaseRegister(){
  const router=useRouter();
  const searchParams=useSearchParams();
  // The URL owns the filter, keeping dashboard links and browser history in sync.
  const requestedStatus=searchParams.get('status');
  const status:StatusFilter=STATUSES.includes(requestedStatus as StatusFilter)
    ?requestedStatus as StatusFilter:'all';
  const [cases,setCases]=useState<CaseRow[]>([]);
  const [pagination,setPagination]=useState<Pagination>({page:1,pageSize:PAGE_SIZE,total:0,totalPages:1});
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [q,setQ]=useState('');
  const [debouncedQ,setDebouncedQ]=useState('');
  const [page,setPage]=useState(1);
  const [reload,setReload]=useState(0);

  useEffect(()=>{setPage(1);},[status]);
  useEffect(()=>{
    const timeout=setTimeout(()=>setDebouncedQ(q.trim()),300);
    return()=>clearTimeout(timeout);
  },[q]);
  useEffect(()=>{
    let cancelled=false;
    setLoading(true);setError('');
    const query=new URLSearchParams({page:String(page),limit:String(PAGE_SIZE)});
    if(status!=='all')query.set('status',status);
    if(debouncedQ)query.set('q',debouncedQ);
    api<{cases:CaseRow[];pagination:Pagination}>('/cases?'+query.toString())
      .then(result=>{
        if(cancelled)return;
        setCases(result.cases);setPagination(result.pagination);
      })
      .catch(e=>{if(!cancelled){setError(e.message);setCases([]);}})
      .finally(()=>{if(!cancelled)setLoading(false);});
    return()=>{cancelled=true};
  },[page,status,debouncedQ,reload]);

  function setFilter(next:StatusFilter){
    setPage(1);
    router.replace(next==='all'?'/cases':'/cases?status='+next,{scroll:false});
  }
  function resetFilters(){
    setQ('');setDebouncedQ('');setPage(1);
    setFilter('all');
  }
  const filtered=status!=='all'||q.trim().length>0;
  const first=pagination.total===0?0:(pagination.page-1)*pagination.pageSize+1;
  const last=Math.min(pagination.page*pagination.pageSize,pagination.total);
  return <section className="panel cases-full">
    <div className="case-tools">
      <div className="search-field"><Search size={18}/><input type="search" aria-label="Search cases"
        placeholder="Search by case, debtor, invoice…" value={q}
        onChange={e=>{setQ(e.target.value);setPage(1);}}/></div>
      <div className="select-wrap"><SlidersHorizontal size={17}/><select aria-label="Filter by status"
        value={status} onChange={e=>setFilter(e.target.value as StatusFilter)}>
        {STATUSES.map(s=><option key={s} value={s}>{s==='all'?'All statuses':label(s)}</option>)}
      </select></div>
      {filtered&&<button className="button button-muted case-reset-filters" type="button" onClick={resetFilters}>
        <X size={15}/> Clear filters
      </button>}
      <button className="button button-muted" type="button" onClick={()=>setReload(v=>v+1)}
        disabled={loading} aria-label="Refresh cases"><RefreshCw size={16}/><span className="refresh-label">Refresh</span></button>
    </div>
    <div className="case-list-title">
      <h3>Case register <span>{loading?'…':pagination.total}</span></h3>
      <p>{status==='all'?'All accessible cases':label(status)+' cases'}{debouncedQ?' matching “'+debouncedQ+'”':''}</p>
    </div>
    {error&&<div className="message error" role="alert">{error} <button type="button" onClick={()=>setReload(v=>v+1)}>Try again</button></div>}
    {loading?<div className="loading-panel" role="status"><div className="spinner"/> Loading cases…</div>:
      !error&&cases.length===0&&filtered?
        <div className="cases-empty-filter">
          <span className="cases-empty-icon"><Search size={20}/></span>
          <strong>No matching cases</strong>
          <p>Try another search or reset the status filter.</p>
          <button className="button button-outline" type="button" onClick={resetFilters}>Clear filters</button>
        </div>:
      !error?<CaseTable cases={cases}/>:null}
    <div className="table-bottom">
      <span aria-live="polite">{error?'Unable to load cases':loading?'Updating results…':
        pagination.total===0?'No cases to display':
        'Showing '+first+'–'+last+' of '+pagination.total+' cases · Page '+pagination.page+' of '+pagination.totalPages}</span>
      <div className="pagination-actions">
        <button type="button" className="button button-muted" aria-label="Previous page"
          disabled={loading||page<=1} onClick={()=>setPage(v=>Math.max(1,v-1))}>
          <ChevronLeft size={17}/> Previous
        </button>
        <button type="button" className="button button-muted" aria-label="Next page"
          disabled={loading||page>=pagination.totalPages} onClick={()=>setPage(v=>v+1)}>
          Next <ChevronRight size={17}/>
        </button>
      </div>
    </div>
  </section>;
}
