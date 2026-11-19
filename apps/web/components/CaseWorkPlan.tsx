'use client';

import {useState,type FormEvent} from 'react';
import {label,type WorkPlan} from '@/lib/api';

function localDate(value?:string|null){
  if(!value)return '';
  const date=new Date(value);
  return new Date(date.getTime()-date.getTimezoneOffset()*60_000).toISOString().slice(0,16);
}

export default function CaseWorkPlan({plan,admin,busy,onSave}:{
  plan:WorkPlan;admin:boolean;busy:boolean;
  onSave:(value:{priority?:string;followUpAt:string|null;followUpNote:string})=>Promise<boolean>;
}){
  const [priority,setPriority]=useState(plan.priority);
  const [time,setTime]=useState(localDate(plan.followUpAt));
  const [note,setNote]=useState(plan.followUpNote||'');
  function save(event:FormEvent){
    event.preventDefault();
    void onSave({...(admin?{priority}:{}),followUpAt:time?new Date(time).toISOString():null,followUpNote:note});
  }
  return <form className="action-form action-separator" onSubmit={save}>
    <h4>Internal work plan</h4>
    {admin?<label className="field">Case priority<select value={priority} onChange={event=>setPriority(event.target.value)}>
      <option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option>
    </select></label>:<p>{label(plan.priority)} priority</p>}
    <label className="field">Follow-up (local time)<input type="datetime-local" value={time} onChange={event=>setTime(event.target.value)}/></label>
    {time&&<label className="field">Follow-up note<textarea rows={2} maxLength={400} value={note} onChange={event=>setNote(event.target.value)}/></label>}
    <button className="button button-outline full-button" disabled={busy}>Save work plan</button>
  </form>;
}
