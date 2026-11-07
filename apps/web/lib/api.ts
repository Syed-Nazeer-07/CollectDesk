export type Role='creditor'|'operator'|'admin';
export type User={id:string; name:string; email:string; role:Role; organizationId:string|null};
export type CaseStatus='draft'|'submitted'|'needs_info'|'rejected'|'accepted'|'in_progress'|'on_hold'|'closed';
export type CaseRow={id:string;caseCode:string;debtorName:string;invoiceNo:string;principalPaise:number;status:CaseStatus;dueDate:string;updatedAt:string;createdAt:string;assignedTo?:string|null};
export type Activity={id:string;kind:string;text:string;visibility:'creditor'|'internal';actor:string;createdAt:string};
export type Receipt={id:string;amountPaise:number;status:'recorded'|'verified'|'rejected';kind:'receipt'|'reversal';reference:string;createdAt:string};
export type Detail={case:CaseRow&{issueDate:string;description:string;disputed:boolean;decisionReason:string;feeRateBps:number;evidenceLabel:string};financials:{outstandingPaise:number;recoveredPaise:number;feePaise:number};activities:Activity[];receipts:Receipt[]};
export type Dashboard={summary:{totalCases:number;activeCases:number;awaitingReview:number;totalOutstandingPaise:number;verifiedRecoveredPaise:number;estimatedFeesPaise:number};recentCases:CaseRow[];statusBreakdown:{status:CaseStatus;count:number}[]};
const API='/api/v1'; // Next.js proxies to Express (same-origin cookies).
export class ApiError extends Error {status:number;issues?:{field:string;message:string}[];constructor(message:string,status:number,issues?:{field:string;message:string}[]){super(message);this.name='ApiError';this.status=status;this.issues=issues;}}
export async function api<T>(path:string,options:RequestInit={}):Promise<T>{
  let response:Response;
  try{response=await fetch(`${API}${path}`,{credentials:'include',headers:{...(options.body?{'Content-Type':'application/json'}:{}),...options.headers},cache:'no-store',...options});}
  catch{throw new ApiError('Cannot connect to the server. Check that the API and MongoDB are running.',0);}
  let data:unknown;try{data=await response.json();}catch{data={};}
  const parsed=data as {error?:string;issues?:{field:string;message:string}[]};
  if(!response.ok)throw new ApiError(parsed?.error||`Request failed (${response.status})`,response.status,parsed?.issues);
  return data as T;
}
export function money(paise:number){return new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(paise/100);}
export function shortMoney(paise:number){const n=paise/100;if(n>=10000000)return `₹${(n/10000000).toFixed(2)}Cr`;if(n>=100000)return `₹${(n/100000).toFixed(2)}L`;return money(paise);}
export function date(value?:string){if(!value)return '—';return new Intl.DateTimeFormat('en-IN',{day:'2-digit',month:'short',year:'numeric'}).format(new Date(value));}
export function label(status:string){return status.split('_').map(w=>w.charAt(0).toUpperCase()+w.slice(1)).join(' ');}
