'use client';
import {useEffect,useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import {ArrowLeft,ArrowRight,Info,FileText,CheckCircle2} from 'lucide-react';
import Link from 'next/link';
import {api,User,parsePaise} from '@/lib/api';
const emptyForm = {debtorName:'',invoiceNo:'',issueDate:'',dueDate:'',amount:'',description:'',evidenceLabel:'',disputed:false};
export default function CaseIntake({user,onCancel,onSavingChange}:{user:User;onCancel?:()=>void;onSavingChange?:(busy:boolean)=>void}){
  const router=useRouter();
  const formRef=useRef<HTMLFormElement|null>(null);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  const [form,setForm]=useState(emptyForm);
  const [restored,setRestored]=useState(false);
  const storageKey='collectdesk-intake:'+user.id;
  useEffect(()=>{
    try {
      const saved=JSON.parse(sessionStorage.getItem(storageKey) || 'null');
      if (saved && Object.entries(emptyForm).every(([key,value])=>typeof saved[key]===typeof value)) {
        setForm(saved);
        setRestored(true);
      }
    } catch { /* Browser storage can be unavailable in private sessions. */ }
  },[storageKey]);
  function clearLocal(){
    try { sessionStorage.removeItem(storageKey); } catch {}
  }
function indiaToday(){
  const parts=new Intl.DateTimeFormat('en-US',{
    timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'
  }).formatToParts(new Date());
  const values=Object.fromEntries(parts.map(p=>[p.type,p.value]));
  return values.year+'-'+values.month+'-'+values.day;
}
function change(e:React.ChangeEvent<HTMLInputElement|HTMLTextAreaElement>){const target=e.target;const next={...form,[target.name]:target.type==='checkbox'?(target as HTMLInputElement).checked:target.value};
  setForm(next);
  try {sessionStorage.setItem(storageKey,JSON.stringify(next));}
  catch {setError('Tab recovery is unavailable. Save a draft before leaving this page.');}
}
async function save(submit:boolean){setError('');setSaving(true);onSavingChange?.(true);try{if(form.dueDate<form.issueDate)throw new Error('Due date cannot be earlier than the invoice issue date.');if(submit&&form.dueDate>=indiaToday())throw new Error('Only overdue invoices can be submitted. Save this case as a draft until the due date has passed.');const rupees=Number(form.amount);if(!Number.isFinite(rupees)||rupees<1||!/^\d+(\.\d{1,2})?$/.test(form.amount))throw new Error('Enter an amount of at least ₹1, with at most two decimal places.');const body={debtorName:form.debtorName,invoiceNo:form.invoiceNo,issueDate:form.issueDate,dueDate:form.dueDate,principalPaise:parsePaise(form.amount,100),description:form.description,evidenceLabel:form.evidenceLabel,disputed:form.disputed};const created=await api<{id:string}>('/cases',{method:'POST',body:JSON.stringify(body)});clearLocal();if(submit){try{await api(`/cases/${created.id}/submit`,{method:'POST'});}catch{router.push(`/cases/${created.id}?submission=retry`);return;}}router.push(`/cases/${created.id}`);}catch(e:any){setError(e.message)}finally{setSaving(false);onSavingChange?.(false)}}
return <>{!onCancel&&<Link href="/cases" className="back-link"><ArrowLeft size={16}/> Back to cases</Link>}{restored&&<div className="message" role="status">Recovered your unfinished invoice from this tab.</div>}<div className="form-layout"><form ref={formRef} className="panel new-case-form" onSubmit={e=>{e.preventDefault();save(true)}}><div className="form-section-title"><div><h3>Invoice & debtor details</h3><p>Information about the business and unpaid invoice</p></div></div><div className="input-grid"><label className="field">Debtor business name <span>*</span><input required name="debtorName" value={form.debtorName} onChange={change} minLength={2} maxLength={160} placeholder="e.g. Horizon Machinery Ltd"/></label><label className="field">Invoice number <span>*</span><input required name="invoiceNo" value={form.invoiceNo} onChange={change} minLength={2} maxLength={70} placeholder="e.g. INV-2026-0042"/></label><label className="field">Issue date <span>*</span><input required type="date" name="issueDate" value={form.issueDate} onChange={change}/></label><label className="field">Due date <span>*</span><input required type="date" name="dueDate" min={form.issueDate} value={form.dueDate} onChange={change}/><small>Invoices can be saved as drafts before the due date, but can only be submitted after it has passed.</small></label><label className="field full">Invoice amount (INR) <span>*</span><div className="currency-input"><span>₹</span><input required type="number" min="1" max="1000000000" step="0.01" name="amount" value={form.amount} onChange={change} placeholder="0.00"/></div></label></div><div className="form-divider"/><div className="form-section-title"><div><h3>Supporting details</h3><p>Provide context to help the team review this case</p></div></div><label className="field">Case description <span className="optional">OPTIONAL</span><textarea rows={4} name="description" value={form.description} onChange={change} maxLength={1200} placeholder="Describe the invoice and any existing dispute…"/></label><label className="field">Evidence reference <span className="optional">TEXT ONLY</span><input name="evidenceLabel" value={form.evidenceLabel} onChange={change} maxLength={120} placeholder="e.g. Invoice reference or document name"/><small>Only a text reference is saved. This form does not upload or store documents.</small></label><label className="checkbox-field"><input type="checkbox" checked={form.disputed} name="disputed" onChange={change}/><span>This invoice is currently disputed</span></label>{error&&<div className="message error" role="alert">{error}</div>}<div className="form-actions"><button type="button" className="button button-muted" disabled={saving} onClick={()=>{if(Object.keys(emptyForm).some(k=>form[k as keyof typeof form]!==emptyForm[k as keyof typeof form])&&!window.confirm("Discard the invoice details entered in this tab?"))return;clearLocal();if(onCancel)onCancel();else router.push("/cases");}}>Cancel</button><button type="button" disabled={saving} className="button button-outline" onClick={()=>{if(formRef.current?.reportValidity())save(false);}}>Save draft</button><button type="submit" disabled={saving} className="button button-primary">{saving?'Saving…':'Submit for review'}<ArrowRight size={16}/></button></div></form>{!onCancel&&<aside className="form-help"><div className="help-card"><div className="help-symbol"><Info size={20}/></div><h3>Before you submit</h3><p>Make sure your invoice details are accurate. Once submitted, an administrator can review the case and request changes.</p><ul><li><CheckCircle2 size={16}/> Use sample information only</li><li><CheckCircle2 size={16}/> One case per invoice number</li><li><CheckCircle2 size={16}/> Review status is visible in the case timeline</li></ul></div><div className="help-card subtle"><FileText size={22}/><h4>Working with drafts</h4><p>You can save a draft before submitting. Drafts are private to your company account.</p></div></aside>}</div></>;
}
