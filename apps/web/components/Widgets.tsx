'use client';
import Link from 'next/link';
import {ArrowUpRight,ArrowRight,Clock3,FolderKanban} from 'lucide-react';
import {CaseRow,CaseStatus,date,label,money} from '@/lib/api';
export function Status({status}:{status:string}){return <span className={`status status-${status}`}><span className="status-dot"/>{label(status)}</span>;}
export function CaseTable({cases}:{cases:CaseRow[]}){
 if(!cases.length)return <div className="empty"><div className="empty-icon"><FolderKanban size={23}/></div><h3>No cases found</h3><p>Your cases will appear here when they are created.</p></div>;
 return <div className="table-overflow"><table className="cases-table"><thead><tr><th>CASE / INVOICE</th><th>DEBTOR</th><th>AMOUNT</th><th>STATUS</th><th>LAST UPDATED</th><th aria-label="Open case"/></tr></thead><tbody>{cases.map(item=><tr key={item.id}><td><Link className="table-case" href={`/cases/${item.id}`}>{item.caseCode}</Link><small className="table-muted">{item.invoiceNo}</small></td><td><div className="debtor-name">{item.debtorName}</div></td><td className="money-cell">{money(item.principalPaise)}</td><td><Status status={item.status}/></td><td className="table-date">{date(item.updatedAt)}</td><td><Link className="table-arrow" href={`/cases/${item.id}`} aria-label={`Open ${item.caseCode}`}><ArrowUpRight size={17}/></Link></td></tr>)}</tbody></table></div>;
}
export function EmptyInfo({heading,description}:{heading:string;description:string}){return <div className="empty"><div className="empty-icon"><Clock3 size={22}/></div><h3>{heading}</h3><p>{description}</p></div>;}
