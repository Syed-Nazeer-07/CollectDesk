'use client';
import {useEffect,useState} from 'react';
import AppShell from '@/components/AppShell';
import {api,indiaDay,money} from '@/lib/api';
type Movement={grossPaise:number;reversedPaise:number;netPaise:number;count:number};
type Report={from:string;to:string;totals:Movement;months:(Movement&{month:string})[]};
export default function Reports(){return <AppShell title="Recovery reports" subtitle="Understand verified collection movements across your accessible portfolio." action={false}>{()=> <ReportView/>}</AppShell>;}
function ReportView(){
  const today=indiaDay();
  const [from,setFrom]=useState(today.slice(0,4)+'-01-01'),[to,setTo]=useState(today),[query,setQuery]=useState({from:today.slice(0,4)+'-01-01',to:today}),[data,setData]=useState<Report|null>(null),[error,setError]=useState(''),[reload,setReload]=useState(0);
  useEffect(()=>{const c=new AbortController();setData(null);setError('');api<Report>('/reports/recoveries?'+new URLSearchParams(query),{signal:c.signal}).then(r=>{if(!c.signal.aborted)setData(r);}).catch(e=>{if(!c.signal.aborted)setError(e.message);});return()=>c.abort();},[query,reload]);
  const max=Math.max(1,...(data?.months.map(m=>Math.max(m.grossPaise,m.reversedPaise))??[]));
  function download(){if(!data)return;const rows=['Month,Gross verified (paise),Reversed (paise),Net (paise),Movements',...data.months.map(m=>[m.month,m.grossPaise,m.reversedPaise,m.netPaise,m.count].join(','))];const url=URL.createObjectURL(new Blob([rows.join('\r\n')],{type:'text/csv'}));const a=document.createElement('a');a.href=url;a.download='collectdesk-recoveries.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  return <div className="ops-stack"><section className="panel section-panel"><form className="report-filters" onSubmit={e=>{e.preventDefault();setQuery({from,to});}}><label className="field">From<input type="date" required value={from} max={to} onChange={e=>setFrom(e.target.value)}/></label><label className="field">To<input type="date" required value={to} min={from} onChange={e=>setTo(e.target.value)}/></label><button className="button button-primary">Apply dates</button><button type="button" className="button button-outline" disabled={!data} onClick={download}>Export report CSV</button></form><p className="ops-note">Up to 366 days, inclusive, by verification date in India. Net is gross receipts less reversals; it may be negative. Current assignment and tenant access determine scope.</p></section>
    {error?<div className="message error" role="alert">{error} <button onClick={()=>setReload(x=>x+1)}>Retry</button></div>:!data?<div className="loading-panel" role="status">Loading report…</div>:<>
    <div className="ops-metrics">{[{name:'Gross verified',amount:data.totals.grossPaise},{name:'Reversals',amount:data.totals.reversedPaise},{name:'Net movement',amount:data.totals.netPaise}].map(x=><div className="metric-card" key={x.name}><span>{x.name}</span><div className="metric-value">{money(x.amount)}</div><p>{data.from} – {data.to}</p></div>)}</div>
    <section className="panel section-panel"><div className="panel-head"><div><h3>Monthly recovery movements</h3><p>{data.totals.count} verified ledger entries in the selected range</p></div></div>
    {!data.totals.count&&<p role="status">No verified movements for these dates.</p>}
    <div className="report-legend"><span>Verified receipts</span><span>Reversals</span></div>
    <div className="report-bars" aria-hidden="true">{data.months.map(m=><div className="report-month" key={m.month}><span>{m.month}</span><div><i style={{width:100*m.grossPaise/max+'%'}}/><i style={{width:100*m.reversedPaise/max+'%'}}/></div></div>)}</div>
    <div className="table-overflow"><table className="cases-table report-table"><thead><tr><th>Month</th><th>Gross verified</th><th>Reversals</th><th>Net movement</th></tr></thead><tbody>{data.months.map(m=><tr key={m.month}><td data-label="Month">{m.month}</td><td data-label="Gross verified">{money(m.grossPaise)}</td><td data-label="Reversals">{money(m.reversedPaise)}</td><td data-label="Net movement">{money(m.netPaise)}</td></tr>)}</tbody></table></div></section></>}
  </div>;
}
