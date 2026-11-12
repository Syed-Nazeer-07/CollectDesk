/**
 * Case register reporting helpers.
 * All queries are scoped by the caller in the route; never use these helpers
 * as a substitute for access control.
 */
const SORTS={
  updated:{updatedAt:-1,_id:-1},
  due:{dueDate:1,_id:1},
  amount:{principalPaise:-1,_id:-1}
};
export function caseSort(key='updated'){
  return SORTS[key]||SORTS.updated;
}
export function caseFilters({status,q},scope,escapeRegex){
  const filter={...scope};
  if(status)filter.status=status;
  if(q)filter.$or=[
    {debtorName:{$regex:escapeRegex(q),$options:'i'}},
    {invoiceNo:{$regex:escapeRegex(q),$options:'i'}},
    {caseCode:{$regex:escapeRegex(q),$options:'i'}}
  ];
  return filter;
}
/** Defensive CSV cell encoding: prevent spreadsheet formula injection. */
export function csvCell(value){
  let v=String(value??'').replace(/[\x00-\x1F\x7F]/g,' ').trim();
  // Leading +, -, @, =, whitespace/invisible characters can trigger formula
  // evaluation in spreadsheet applications. Prefix an apostrophe to force text.
  if(/^[\s\u200B-\u200D\uFEFF]*[=+@\-]/u.test(v))v="'"+v;
  return '"'+v.replace(/"/g,'""')+'"';
}
function day(value){
  if(!value)return '';
  const parsed=new Date(value);
  return Number.isNaN(parsed.getTime())?'':parsed.toISOString().slice(0,10);
}
export function casesCsv(items){
  const lines=[[
    'Case ID','Debtor company','Invoice number','Status',
    'Invoice amount (INR)','Due date','Created date','Last updated'
  ].map(csvCell).join(',')];
  for(const item of items){
    lines.push([
      item.caseCode,item.debtorName,item.invoiceNo,item.status,
      (item.principalPaise/100).toFixed(2),day(item.dueDate),
      day(item.createdAt),day(item.updatedAt)
    ].map(csvCell).join(','));
  }
  return '\uFEFF'+lines.join('\r\n')+'\r\n';
}
