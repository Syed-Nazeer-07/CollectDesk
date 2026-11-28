'use client';
import Link from 'next/link';
import {ArrowUpRight} from 'lucide-react';
import {CaseRow,CaseStatus,date,label,money} from '@/lib/api';
export function Status({status}:{status:string}){return <span className={`status status-${status}`}><span className="status-dot"/>{label(status)}</span>;}
export function CaseTable({cases}:{cases:CaseRow[]}){
 if(!cases.length)return <div className="empty"><h3>No cases found</h3><p>Your cases will appear here when they are created.</p></div>;
 return <div className="table-overflow"><table className="cases-table"><thead><tr><th scope="col">Case / invoice</th><th scope="col">Debtor</th><th scope="col">Amount</th><th scope="col">Status</th><th scope="col">Last updated</th><th scope="col">Action</th></tr></thead><tbody>{cases.map(item=><tr key={item.id}><td data-label="Case / invoice"><Link className="table-case" href={`/cases/${item.id}`}>{item.caseCode}</Link><small className="table-muted">{item.invoiceNo}</small></td><td data-label="Debtor"><Link className="debtor-name debtor-link" href={`/cases/${item.id}`} aria-label={`View ${item.debtorName} case`}>{item.debtorName}</Link></td><td data-label="Amount" className="money-cell">{money(item.principalPaise)}</td><td data-label="Status"><Status status={item.status}/></td><td data-label="Last updated" className="table-date">{date(item.updatedAt)}</td><td data-label="Action"><Link className="table-view" href={`/cases/${item.id}`} aria-label={`View case ${item.caseCode}`}>View <ArrowUpRight size={15}/></Link></td></tr>)}</tbody></table></div>;
}
export function EmptyInfo({heading,description}:{heading:string;description:string}){return <div className="empty"><h3>{heading}</h3><p>{description}</p></div>;}
