// Examples stay stable on regeneration/retry. The API still accepts 1..100 rows.
export function ensureTenRecords(records,type){
  if(!records?.length||records.length>=10)return records;
  const template=records[0],out=structuredClone(records);
  for(let index=out.length;index<10;index++){
    const row=structuredClone(template),suffix=String(index+1).padStart(2,'0');
    row.external_ref=`${template.external_ref}-${suffix}`;
    if(type==='procurement'&&template.ro_no)row.ro_no=`${template.ro_no}-${suffix}`;
    if(type==='cmr'&&template.order_no)row.order_no=`${template.order_no}-${suffix}`;
    out.push(row);
  }
  return out;
}
