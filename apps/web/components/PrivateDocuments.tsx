'use client';

import {useEffect,useRef,useState,type FormEvent} from 'react';
import {api,date,label} from '@/lib/api';

type Document={id:string;name:string;category:string;status:string;size:number;expiresAt:string};
type Listing={enabled:boolean;documents:Document[]};

export default function PrivateDocuments({caseId,editable}:{caseId:string;editable:boolean}){
  const [data,setData]=useState<Listing|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [revision,setRevision]=useState(0);
  const fileInput=useRef<HTMLInputElement>(null);
  const path='/cases/'+caseId+'/documents';
  useEffect(()=>{
    const controller=new AbortController();
    api<Listing>(path,{signal:controller.signal}).then(setData).catch(error=>{
      if(!controller.signal.aborted)setError(error.message);
    });
    return ()=>controller.abort();
  },[path,revision]);

  async function upload(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    const pdf=fileInput.current?.files?.[0];
    if(!pdf)return;
    const category=String(new FormData(event.currentTarget).get('category'));
    setError('');setNotice('');setBusy(true);
    try{
      await api(path,{method:'POST',body:pdf,headers:{'Content-Type':'application/pdf',
        'X-File-Name':encodeURIComponent(pdf.name),'X-Document-Category':category}});
      if(fileInput.current)fileInput.current.value='';
      setNotice('Scanned PDF added.');
    }catch(error){setError(error instanceof Error?error.message:'Could not upload the PDF.');}
    finally{setBusy(false);setRevision(n=>n+1);}
  }

  if(!data?.enabled&&!error)return null;
  return <section className="panel organization-panel">
    <h2>Private documents</h2>
    {error&&<p className="message error" role="alert">{error} <button onClick={()=>{setError('');setRevision(n=>n+1);}}>Refresh</button></p>}
    {notice&&<p role="status">{notice}</p>}
    {data?.enabled&&<>
      {!data.documents.length&&<p>No documents attached.</p>}
      <ul className="workspace-list">{data.documents.map(document=><li key={document.id}>
        <div><strong>{document.name}</strong><p>{label(document.category)} · {Math.ceil(document.size/1024)} KB</p>
          <p>{label(document.status)} · Expires {date(document.expiresAt)}</p></div>
        {document.status==='clean'&&<a className="button button-outline" href={'/api/v1'+path+'/'+document.id}>Download PDF</a>}
      </li>)}</ul>
      {editable&&<form className="action-form" onSubmit={upload}>
        <label className="field">Document category
          <select name="category"><option value="invoice">Invoice</option><option value="contract">Contract</option>
            <option value="correspondence">Correspondence</option><option value="other">Other</option></select>
        </label>
        <label className="field">PDF (up to 5 MiB)<input ref={fileInput} type="file" accept="application/pdf,.pdf" required disabled={busy}/></label>
        <button className="button button-primary" disabled={busy}>{busy?'Scanning PDF…':'Upload PDF'}</button>
      </form>}
    </>}
  </section>;
}
