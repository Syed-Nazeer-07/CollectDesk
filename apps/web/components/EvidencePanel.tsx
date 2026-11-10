'use client';
import {useEffect,useState} from 'react';
import {FileText,Upload,Download,Trash2,RefreshCw} from 'lucide-react';
import {api,CaseStatus,Role,date} from '@/lib/api';

type Evidence={id:string;name:string;size:number;createdAt:string};
type Payload={enabled:boolean;files:Evidence[];maxFiles:number;maxBytes:number};
export default function EvidencePanel({caseId,role,status}:{caseId:string;role:Role;status:CaseStatus}){
  const [data,setData]=useState<Payload|null>(null);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [file,setFile]=useState<File|null>(null);
  const [busy,setBusy]=useState(false);
  const [refresh,setRefresh]=useState(0);
  useEffect(()=>{
    let active=true;
    api<Payload>('/cases/'+encodeURIComponent(caseId)+'/evidence')
      .then(r=>{if(active){setData(r);setError('');}})
      .catch(e=>{if(active)setError(e instanceof Error?e.message:'Cannot load sample files.')});
    return()=>{active=false;};
  },[caseId,refresh]);
  if(!data?.enabled)return null;
  const editable=role==='creditor'&&(status==='draft'||status==='needs_info');
  async function upload(e:React.FormEvent){
    e.preventDefault();setError('');setNotice('');
    if(!file)return;
    if(file.size>data!.maxBytes){setError('PDF exceeds the 1 MB limit.');return;}
    if(file.type!=='application/pdf'&&!file.name.toLowerCase().endsWith('.pdf')){
      setError('Only synthetic PDF documents are supported.');return;
    }
    setBusy(true);
    try{
      const result=await fetch('/api/v1/cases/'+encodeURIComponent(caseId)+'/evidence',{
        method:'POST',credentials:'include',cache:'no-store',
        headers:{'Content-Type':'application/pdf','X-File-Name':encodeURIComponent(file.name)},
        body:file,signal:AbortSignal.timeout(45_000)
      });
      if(!result.ok){
        const body=await result.json().catch(()=>({error:'Could not upload file.'}));
        throw new Error(body.error||'Could not upload file.');
      }
      setNotice('Synthetic PDF added to this case.');setFile(null);setRefresh(n=>n+1);
      const input=document.getElementById('sample-evidence-file') as HTMLInputElement|null;
      if(input)input.value='';
    }catch(e){setError(e instanceof Error?e.message:'Could not upload file.');}
    finally{setBusy(false);}
  }
  async function remove(id:string){
    setBusy(true);setError('');setNotice('');
    try{
      await api('/cases/'+encodeURIComponent(caseId)+'/evidence/'+encodeURIComponent(id),{method:'DELETE'});
      setNotice('Synthetic PDF removed.');setRefresh(n=>n+1);
    }catch(e){setError(e instanceof Error?e.message:'Could not remove sample PDF.');}
    finally{setBusy(false);}
  }
  return <section className="panel section-panel evidence-panel">
    <div className="panel-head"><div>
      <h3>Sample documents</h3>
      <p>Private PDFs linked to this case. Authorized users only.</p>
    </div><FileText size={19} aria-hidden="true"/></div>
    <div className="evidence-content">
      <p className="evidence-warning">Fictional data only. Do not upload real invoices, personal information, or financial evidence. Malware scanning and production retention are not enabled.</p>
      {error&&<p className="message error" role="alert">{error}</p>}
      {notice&&<p className="message success" role="status">{notice}</p>}
      {data.files.length===0?<p className="evidence-empty">No sample PDF documents attached.</p>:
        <ul className="evidence-list">{data.files.map(x=><li key={x.id}>
          <span className="evidence-item-icon"><FileText size={18}/></span>
          <div className="evidence-item-info"><strong>{x.name}</strong>
            <span>{Math.ceil(x.size/1024)} KB · {date(x.createdAt)}</span></div>
          <a className="button button-outline button-small" href={'/api/v1/cases/'+encodeURIComponent(caseId)+'/evidence/'+encodeURIComponent(x.id)}
            aria-label={'Download '+x.name}><Download size={16}/>Download</a>
          {editable&&<button type="button" className="button button-muted button-small"
            disabled={busy} onClick={()=>remove(x.id)} aria-label={'Delete '+x.name}><Trash2 size={16}/></button>}
        </li>)}</ul>}
      {editable&&data.files.length<data.maxFiles&&
        <form className="evidence-upload" onSubmit={upload}>
          <label htmlFor="sample-evidence-file">Add a sample PDF (max 1 MB, up to {data.maxFiles} documents)</label>
          <input id="sample-evidence-file" type="file" accept=".pdf,application/pdf" required
            onChange={e=>setFile(e.target.files?.[0]||null)}/>
          <button className="button button-primary button-small" disabled={!file||busy} type="submit">
            <Upload size={16}/>{busy?'Uploading…':'Upload sample'}
          </button>
        </form>}
      <button className="evidence-refresh" type="button" onClick={()=>setRefresh(x=>x+1)}>
        <RefreshCw size={14}/> Refresh documents
      </button>
    </div>
  </section>;
}
