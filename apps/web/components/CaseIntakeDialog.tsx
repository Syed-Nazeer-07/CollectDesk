'use client';
import {useEffect,useRef,useState} from 'react';
import {X} from 'lucide-react';
import CaseIntake from '@/components/CaseIntake';
import {User} from '@/lib/api';

export default function CaseIntakeDialog({user,onClose}:{user:User;onClose:()=>void}){
  const dialog=useRef<HTMLDialogElement>(null);
  const [busy,setBusy]=useState(false);
  useEffect(()=>{
    const node=dialog.current;
    const previous=document.activeElement instanceof HTMLElement?document.activeElement:null;
    if(node&&!node.open)node.showModal();
    return()=>{if(node?.open)node.close();if(previous?.isConnected)previous.focus();};
  },[]);
  return <dialog ref={dialog} className="case-intake-dialog" aria-labelledby="case-intake-title"
    onCancel={event=>{event.preventDefault();if(!busy)onClose();}}>
    <header className="case-intake-header">
      <div><h2 id="case-intake-title">New case</h2><p>Enter an invoice to save a draft or submit it for review.</p></div>
      <button type="button" className="icon-button" disabled={busy} aria-label="Close and keep unfinished invoice" onClick={onClose}><X size={20}/></button>
    </header>
    <div className="case-intake-body">
      <CaseIntake key={user.id} user={user} onCancel={onClose} onSavingChange={setBusy}/>
    </div>
  </dialog>;
}
