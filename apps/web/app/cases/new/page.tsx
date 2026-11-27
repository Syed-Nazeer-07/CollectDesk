'use client';
import AppShell from '@/components/AppShell';
import CaseIntake from '@/components/CaseIntake';
export default function NewCasePage(){
  return <AppShell title="Create a case" subtitle="Start with the invoice details. You can save as a draft." action={false}>
    {user=>user.role==='creditor' ? <CaseIntake key={user.id} user={user}/> : <div className="message error">Only a creditor can create cases.</div>}
  </AppShell>;
}
