import fs from 'node:fs/promises';
import {savedDefaults,saveResponseReferences,saveCmrDropdownReferences} from './postman-saved-runtime.js';
import {ensureTenRecords} from './push-api-examples.js';
const preMarker='// SAVED_SETUP_DEFAULTS_V1';
const testMarker='// SAVED_SETUP_RESPONSES_V1';
for(const file of ['postman/SFC_CMR.postman_collection.json','postman/Paddy_Service_Live_API.postman_collection.json']){
  const collection=JSON.parse(await fs.readFile(file,'utf8'));
  collection.variable??=[];collection.event??=[];
  collection.variable=collection.variable.filter(v=>v.key!=='expected_completion_at');
  const variables=['setup_season_code','setup_miller_code','setup_destination_code','setup_source_code','setup_vehicle_no',
    'miller_code','pacs_code','destination_code','fci_code','lamps_code','cmr_order_no','fci_order_no',
    'cmr_quantity_kg','fci_quantity_kg','cmr_lot_count','stenciling_code'];
  variables.push('driver_phone','driver_password','driver_token','driver_id','driver_shipment_id');
  for(const key of variables)if(!collection.variable.some(v=>v.key===key))collection.variable.push({key,value:''});
  let pre=collection.event.find(e=>e.listen==='prerequest');
  if(!pre){pre={listen:'prerequest',script:{type:'text/javascript',exec:[]}};collection.event.push(pre);}
  let code=pre.script.exec.join('\n');
  code=code.replace(/\/\/ SAVED_SETUP_DEFAULTS_V1\n\(function savedDefaults[\s\S]*?\n\}\)\(\);\n?/,'');
  code=`${preMarker}\n(${savedDefaults.toString()})();\n`+code;
  const etaStart=code.indexOf('// Optional expected completion time for shipment creation and dispatch.');
  const headersStart=code.indexOf('(function fillRequestHeaders()',etaStart);
  if(etaStart!==-1&&headersStart>etaStart)code=code.slice(0,etaStart)+code.slice(headersStart);
  pre.script.exec=code.split('\n');
  let tests=collection.event.find(e=>e.listen==='test');
  if(!tests){tests={listen:'test',script:{type:'text/javascript',exec:[]}};collection.event.push(tests);}
  const previous=tests.script.exec.indexOf(testMarker);
  if(previous!==-1)tests.script.exec.splice(previous,2);
  tests.script.exec.push(testMarker,`(${saveResponseReferences.toString()})();`);
  const dropMarker='// CMR_DROPDOWN_STATE_V1';
  const previousDropdown=tests.script.exec.indexOf(dropMarker);
  if(previousDropdown!==-1)tests.script.exec.splice(previousDropdown,2);
  tests.script.exec.push(dropMarker,`(${saveCmrDropdownReferences.toString()})();`);
  let orderRequest,procurementRequest;
  function visit(items){for(const item of items||[]){
    if(item.item){visit(item.item);continue;}
    if(/Login administrator/.test(item.name))for(const event of item.event||[])if(event.listen==='prerequest'&&!event.script.exec.join('\n').includes('function saveOnce')){
      const old=event.script.exec.join('\n').replaceAll('pm.collectionVariables.set(','saveOnce(');
      event.script.exec=["function saveOnce(key,value){if(!String(pm.variables.get(key)??'').trim()){pm.collectionVariables.set(key,value);if(pm.environment.has(key))pm.environment.set(key,value);}}",...old.split('\n')];
    }
    const raw=item.request?.body?.raw;
    if(raw){try{
      const safe=raw.replace(/(:\s*)(\{\{[^}]+\}\})/g,(_,prefix,t)=>prefix+JSON.stringify('__BARE__'+t));
      const body=JSON.parse(safe);let changed=false;
      for(const r of body.records||[]){
        if(r.miller_code?.includes('{{run_id}}')){r.miller_code='{{miller_code}}';changed=true;}
        if(r.facility_code?.includes('{{run_id}}')){r.facility_code='{{pacs_code}}';changed=true;}
        if(r.destination_code?.includes('{{run_id}}')){r.destination_code=r.destination_code.startsWith('FCI')?'{{fci_code}}':'{{destination_code}}';changed=true;}
        if(r.rice_quantity){
          const fci=r.destination_code==='{{fci_code}}'||r.destination_id==='__BARE__{{fci_id}}';
          r.season_id='__BARE__{{season_id}}';r.miller_id='__BARE__{{miller_id}}';r.destination_id='__BARE__{{'+(fci?'fci_id':'destination_id')+'}}';
          delete r.season_code;delete r.miller_code;delete r.destination_code;
          r.rice_quantity={value:'__BARE__{{'+(fci?'fci_quantity_kg':'cmr_quantity_kg')+'}}',unit:'KG'};
          r.district_id='__BARE__{{district_id}}';r.lot_count='__BARE__{{cmr_lot_count}}';r.stenciling_code='{{stenciling_code}}';
          if(r.order_no?.includes('{{run_id}}')||r.order_no==='{{cmr_order_no}}')r.order_no=fci?'{{fci_order_no}}':'{{cmr_order_no}}';
          if(r.external_ref?.includes('{{run_id}}')||r.external_ref==='CMR:{{cmr_order_no}}')r.external_ref=fci?'CMR:{{fci_order_no}}':'CMR:{{cmr_order_no}}';changed=true;
        }
      }
      if(body.records?.[0]?.facility_code&&body.records[0].quantity){
        body.records=ensureTenRecords(body.records,'procurement');changed=true;
        item.name='19 Push 10 Paddy RO records';
      }
      if(body.records?.[0]?.rice_quantity){
        body.records=ensureTenRecords(body.records,'cmr');changed=true;
        item.name='26 Push 10 CMR order records';
      }
      if(changed)item.request.body.raw=JSON.stringify(body,null,2).replace(/"__BARE__(\{\{[^}]+\}\})"/g,'$1');
    }catch{}}
    const url=typeof item.request?.url==='string'?item.request.url:item.request?.url?.raw||'';
    if(item.request?.method==='POST'&&/\/integrations\/euparjan\/cmr-orders$/.test(url))orderRequest=item;
    if(item.request?.method==='POST'&&/\/integrations\/euparjan\/procurements$/.test(url))procurementRequest=item;
  }}
  collection.item=collection.item.filter(i=>!['00 Quick CMR - saved setup','Push APIs'].includes(i.name));visit(collection.item);
  const pushRequest=(name,path,body,description)=>({name,request:{method:'POST',auth:{type:'noauth'},
    header:[{key:'Content-Type',value:'application/json'},{key:'X-API-Key',value:'{{euparjan_api_key}}'},{key:'Idempotency-Key',value:'{{operation_key}}'}],
    url:'{{base_url}}/integrations/euparjan/'+path,body:{mode:'raw',raw:body,options:{raw:{language:'json'}}},description}});
  const pushItems=[];
  for(const [source,name] of [[procurementRequest,'01 Procurement - Push 10 RO records'],[orderRequest,'02 CMR - Push 10 orders']]){
    if(source){const copy=structuredClone(source);copy.name=name;copy.request.auth={type:'noauth'};pushItems.push(copy);}
  }
  pushItems.push(
    pushRequest('03 Season - Push season','masters/seasons',JSON.stringify({code:'{{season_code}}',name:'KMS {{season_code}}',start_date:'2026-01-01',end_date:'2026-12-31',recovery_percent:68},null,2),'Create a season first; response saves season_id. Use a new season code for a new season.'),
    pushRequest('04 PACS LAMPS to Miller - Push tagging','masters/route-tags','{\n  "season_id": {{season_id}},\n  "source_id": {{pacs_id}},\n  "destination_id": {{miller_id}}\n}','source_id is the existing PACS or LAMPS facility ID. For LAMPS replace pacs_id with lamps_id. destination_id is the Miller facility ID.'),
    pushRequest('05 Miller to Depot - Push tagging','miller-store-assignments','{\n  "season_id": {{season_id}},\n  "miller_id": {{miller_id}},\n  "store_id": {{destination_id}}\n}','store_id is the existing SFC_GODOWN or FCI facility ID (destination_id), not the core store location ID.')
  );
  const pushExamples=[
    {records:Array.from({length:10},(_,i)=>({external_ref:`PUSH-PROC-${i+1}`,ro_no:`PUSH-RO-${i+1}`,ro_date:'2026-11-01',
      season_code:'PUSH-SEASON',facility_code:'PUSH-PACS',miller_id:999001,district_id:999002,
      scheme_code:'SCMR',commodity_code:'PADDY',procured_at:'2026-11-01T10:00:00Z',quantity:{value:1000,unit:'KG'}}))},
    {records:Array.from({length:10},(_,i)=>({external_ref:`PUSH-CMR-${i+1}`,order_no:`PUSH-ORDER-${i+1}`,
      season_id:1,miller_id:3,destination_id:4,scheme_code:'SCMR',commodity_code:'RICE',
      ordered_at:'2026-11-01T10:00:00Z',due_date:'2026-12-31',rice_quantity:{value:1000,unit:'KG'}}))},
    {code:'PUSH-SEASON',name:'Push sample season',start_date:'2026-01-01',end_date:'2026-12-31',recovery_percent:68},
    {season_id:999001,source_id:999002,destination_id:999003},
    {season_id:999001,miller_id:999003,store_id:999004}
  ];
  pushItems.forEach((item,index)=>{
    item.request.body.raw=JSON.stringify(pushExamples[index],null,2);item.event=[];
    item.request.description='Inserts directly into the original table. Related masters and mappings need not exist. Keep valid JSON, field types and quantity/date formats. For a new record change external_ref and RO/order number, season code or mapping IDs. Idempotent retries reuse the same key and body.';
  });
  collection.item.push({name:'Push APIs',description:'X-API-Key and Idempotency-Key required. Direct original-table inserts without required master links. Procurement/CMR samples contain 10 records. No separate testing table or mode. Master IDs remain numeric. Duplicate references and mapping combinations are protected.',item:pushItems});
  collection.item=collection.item.filter(item=>item.name!=='Driver');
  const driverRequest=(name,method,path,description,body)=>({name,request:{method,
    header:[{key:'Authorization',value:'Bearer {{driver_token}}'},...(body?[{key:'Content-Type',value:'application/json'}]:[])],
    url:'{{base_url}}'+path,description,...(body?{body:{mode:'raw',raw:JSON.stringify(body,null,2),options:{raw:{language:'json'}}}}:{})}});
  const driverLogin=driverRequest('01 Driver Login','POST','/auth/login','Set driver_phone and driver_password once. Use the Paddy driver account. Response saves driver_token and driver_id.',{phone:'{{driver_phone}}',password:'{{driver_password}}'});
  driverLogin.request.header=driverLogin.request.header.filter(header=>header.key!=='Authorization');driverLogin.request.auth={type:'noauth'};
  driverLogin.event=[{listen:'test',script:{type:'text/javascript',exec:[
    "pm.test('Driver login succeeded',()=>pm.expect(pm.response.code).to.eql(200));",
    "if(pm.response.code===200){const data=pm.response.json().data;pm.test('Driver account',()=>pm.expect(data.user.role).to.eql('DRIVER'));if(data.user.role==='DRIVER'){for(const [key,value] of Object.entries({driver_token:data.token,driver_id:data.user.id})){pm.collectionVariables.set(key,value);if(pm.environment.has(key))pm.environment.set(key,value);}}}"]}}];
  const driverTrips=driverRequest('03 My Paddy Trips','GET','/shipments?leg=PADDY&page=1&limit=20','Only shipments assigned to this driver. Cancelled rows can appear here; summary excludes them. First result saves driver_shipment_id.');
  driverTrips.event=[{listen:'test',script:{type:'text/javascript',exec:[
    "if(pm.response.code===200){const row=pm.response.json().data?.[0];if(row){pm.collectionVariables.set('driver_shipment_id',row.id);if(pm.environment.has('driver_shipment_id'))pm.environment.set('driver_shipment_id',row.id);}else{pm.collectionVariables.unset('driver_shipment_id');if(pm.environment.has('driver_shipment_id'))pm.environment.unset('driver_shipment_id');}}"]}}];
  const driverHistory=driverRequest('05 Trip Details and History','POST','/getTripDetailsForDriver','Own non-cancelled Paddy trips. Optional trip_id selects one assigned shipment. Optional from_date/to_date use YYYY-MM-DD (UTC date bounds). Page/limit supported. KG, KM and minutes. No subtrips.',{page:1,limit:20});
  driverHistory.event=structuredClone(driverTrips.event);
  const activeTrip=driverRequest('04 Active Trip','POST','/active_tripList','Most recently started active Paddy trip for this login, or data:null. No subtrips.',{});
  activeTrip.event=[{listen:'test',script:{type:'text/javascript',exec:["if(pm.response.code===200){const row=pm.response.json().data;if(row){pm.collectionVariables.set('driver_shipment_id',row.id);if(pm.environment.has('driver_shipment_id'))pm.environment.set('driver_shipment_id',row.id);}}"]}}];
  collection.item.push({name:'Driver',description:'Driver login and assigned Paddy trips. Login saves driver_token automatically. All endpoints use session identity; optional driver_id must match it. No integration key or Idempotency-Key needed. Alerts are persisted GPS Offline/ETA Delayed events from monitoring onward; ignition is not currently supported.',item:[
    driverLogin,
    driverRequest('02 Driver Details','POST','/driver_detailsList','Profile and non-cancelled Paddy total_trips. Unavailable identity/document fields are null.',{}),
    driverRequest('03 Paddy Trip Summary','POST','/tripsummary_for_driver','Returns data: total_trips, active_trips, completed_trips. Empty body uses logged-in driver; optional driver_id must match login.',{}),
    activeTrip,driverHistory,
    driverRequest('06 Alert Report','POST','/alert_report_for_driver','Own persisted GPS Offline and ETA Delayed alerts. Optional trip_id, from_date/to_date (UTC dates). No historical ignition alerts are fabricated.',{page:1,limit:20}),
    {name:'07 Other Shipment Views',item:[driverTrips,
      driverRequest('My Active Paddy Trips','GET','/shipments?leg=PADDY&trip_status=1&exclude_cancelled=true&page=1&limit=20','Own Paddy shipments with trip_status=1.'),
      driverRequest('My Completed Paddy Trips','GET','/shipments?leg=PADDY&trip_status=2&exclude_cancelled=true&page=1&limit=20','Own Paddy shipments with trip_status=2.'),
      driverRequest('Selected Paddy Trip Details','GET','/shipments/{{driver_shipment_id}}','Run Trip Details and History first or set driver_shipment_id to an assigned shipment.')]
    }
  ]});
  const setup={name:'01 Load existing setup (save IDs once)',request:{method:'GET',header:[{key:'Authorization',value:'Bearer {{token}}'}],
    url:{raw:'{{base_url}}/setup/postman',host:['{{base_url}}'],path:['setup','postman'],query:[]},
    description:'Login as Admin/Operator first. Read-only: returns valid season/Miller/depot mappings and free GPS vehicles. A single matching setup is saved automatically. If several match, set setup_season_code, setup_miller_code, setup_destination_code and setup_source_code once; set setup_vehicle_no if needed. IDs from an old database are replaced. No master records are created.'},
    event:[{listen:'prerequest',script:{type:'text/javascript',exec:[
      "for(const key of ['season_code','miller_code','destination_code','source_code','vehicle_no']){",
      " const value=String(pm.variables.get('setup_'+key)||'').trim();",
      " if(value)pm.request.url.query.upsert({key,value});else pm.request.url.query.remove(key);",
      '}']}},{listen:'test',script:{type:'text/javascript',exec:[
      "pm.test('Setup request succeeded',()=>pm.expect(pm.response.code).to.eql(200));",
      "const result=pm.response.json();if(result.data)pm.test('One valid setup selected',()=>pm.expect(result.data.ready_for_orders,(result.data.missing||[]).join(' ')).to.eql(true));"]}}]};
  const folder={name:'00 Quick CMR - saved setup',description:'After Admin login, load setup once, then import an order. Set cmr_order_no to the source full LotNo. Keep it and the payload unchanged on retry; change it for a new order. Tokens, codes and IDs persist across logins. Selectors choose existing mapped records; setup does not create records.',item:[setup]};
  if(orderRequest){const order=structuredClone(orderRequest);order.name='02 Import 10 CMR orders (source LotNo = order_no)';folder.item.push(order);}
  collection.item.splice(1,0,folder);
  const sourceFolder={name:'PACS LAMPS Mappings',description:'Login as PACS or LAMPS. The backend derives the source facility from the login and lists its mapped Millers.',item:[{
    name:'01 My mapped Millers - mapping report',request:{method:'GET',
      header:[{key:'Authorization',value:'Bearer {{pacs_token}}'}],
      url:{raw:'{{base_url}}/pacs-mappings?page=1&limit=50',host:['{{base_url}}'],path:['pacs-mappings'],
        query:[{key:'page',value:'1'},{key:'limit',value:'50'},{key:'season_id',value:'{{season_id}}',disabled:true}]},
      description:'Returns mapping_id, source_id/name/kind, miller_id/name/code, season, district, contact/address and mapped_at. Enable season_id to filter; disabled means all seasons. Source facility is always taken from the authenticated PACS/LAMPS user.'},
    event:[{listen:'test',script:{type:'text/javascript',exec:[
      "pm.test('Mapping report succeeded',()=>pm.expect(pm.response.code).to.eql(200));",
      "const result=pm.response.json();pm.test('Own mapped Millers returned',()=>pm.expect(result.ok).to.eql(true));"]}}]
  }]};
  const oldSource=collection.item.findIndex(i=>i.name===sourceFolder.name);
  if(oldSource!==-1)collection.item.splice(oldSource,1);
  const millerFolder=collection.item.findIndex(i=>i.name==='Miller Mappings');
  collection.item.splice(millerFolder<0?collection.item.length:millerFolder+1,0,sourceFolder);
  const cmr=collection.item.find(i=>i.name==='CMR Shipment'||/CMR Orders and Submissions$/.test(i.name));
  let dropdown=cmr?.item?.find(i=>/^01 - Dropdowns/.test(i.name));
  if(cmr&&!dropdown){
    const old=cmr.item.find(i=>{const url=typeof i.request?.url==='string'?i.request.url:i.request?.url?.raw||'';return /\/cmr\/submission-options/.test(url);});
    dropdown={name:'01 - Dropdowns',item:old?[structuredClone(old)]:[]};
    cmr.item=cmr.item.filter(i=>{const url=typeof i.request?.url==='string'?i.request.url:i.request?.url?.raw||'';return !/\/cmr\/(?:submission-options|vehicles|vehicle)(?:\?|$)/.test(url);});
    cmr.item.unshift(dropdown);
  }
  if(dropdown){
    const template=dropdown.item.find(i=>i.request&&!/^00 /.test(i.name))||{};
    const make=(name,url,description)=>({name,request:{...structuredClone(template.request),method:'GET',url,description},event:structuredClone(template.event||[])});
    const root='{{base_url}}/cmr';
    const season='season_id={{season_id}}&scheme_type={{scheme_code}}';
    const reset=make('00 Reset CMR selections',root+'/seasons','Clears district/store/order/vehicle selections in collection and environment. Keeps season/scheme. No backend data is changed.');
    reset.event.unshift({listen:'prerequest',script:{type:'text/javascript',exec:[
      "for(const key of ['district_id','destination_id','store_location_id','order_id','cmr_order_id','selected_cmr_order_no','vehicle_id','vehicle_no','cmr_dropdown_context']){pm.collectionVariables.unset(key);if(pm.environment.has(key))pm.environment.unset(key);}",
      "pm.collectionVariables.set('cmr_dropdown_ready','false');if(pm.environment.has('cmr_dropdown_ready'))pm.environment.set('cmr_dropdown_ready','false');"]}});
    dropdown.description='Miller login. Run the separate Season, District, Destination Depot, CMR Order Number and Vehicle dropdowns in order. Scheme/commodity have no dropdown requests; existing scheme_code configuration and RICE payload remain available.';
    dropdown.item=[reset,
      make('01 Season Dropdown',root+'/seasons','data.seasons: select season_id=id.'),
      make('02 District Dropdown',root+'/districts','All active districts. No season, scheme or Miller-depot mapping filter. Select district_id=id.'),
      make('03 Destination Depot Dropdown',root+'/stores?'+season+'&district_id={{district_id}}','data.stores: choose store_location_id=row.id (core store ID); destination_id=row.facility_id is saved with it.'),
      make('04 CMR Order Number Dropdown',root+'/orders?'+season+'&district_id={{district_id}}&destination_id={{destination_id}}','data.orders: display order_no and save order_id=id. Only eligible orders for the selected depot are returned.'),
      make('05 Vehicle Dropdown',root+'/vehicles','Select vehicle_id=id. A single free vehicle is saved automatically.'),
      make('06 Selected Vehicle Details (optional)','{{base_url}}/cmr/vehicle?registration_no={{vehicle_no}}','Checks GPS mapping/busy state for the selected registration.')];
    for(const child of cmr.item||[])for(const item of child.item||[])if(item.request?.method==='POST'&&item.request.body?.raw){
      item.request.body.raw=item.request.body.raw.replace('"destination_id": "{{sfc_id}}"','"destination_id": "{{destination_id}}"');
    }
  }
  function simplifyReceiving(value){
    if(!value||typeof value!=='object')return;
    if(value.request?.method==='POST'){
      const url=typeof value.request.url==='string'?value.request.url:value.request.url?.raw||'';
      if(/\/shipments\/[^/?]+\/deliver$/.test(url))value.request.header=(value.request.header||[]).filter(header=>header.key.toLowerCase()!=='idempotency-key');
    }
    if(value.body?.raw){try{
      const raw=value.body.raw.replace(/(:\s*)(\{\{[^}]+\}\})/g,(_,prefix,t)=>prefix+JSON.stringify('__BARE__'+t));
      const body=JSON.parse(raw);
      if(Object.hasOwn(body,'expected_completion_at')){
        delete body.expected_completion_at;
        value.body.raw=JSON.stringify(body,null,2).replace(/"__BARE__(\{\{[^}]+\}\})"/g,'$1');
      }
      if(body.accepted_quantity||Object.hasOwn(body,'value')&&Object.hasOwn(body,'received_bags')){
        const quantity=body.accepted_quantity??{value:body.value,unit:body.unit??'KG'};
        value.body.raw=JSON.stringify({...quantity,received_bags:body.received_bags??10},null,2)
          .replace(/"__BARE__(\{\{[^}]+\}\})"/g,'$1');
        value.description='Send flat value, unit (KG) and received_bags. Backend sets delivered_at and calculates shortage. Shipment must be ARRIVED before receiving. Idempotency-Key is not required. Authorization with a valid Miller/operator token is still required.';
      }
    }catch{}}
    for(const child of Object.values(value))if(child&&typeof child==='object')Array.isArray(child)?child.forEach(simplifyReceiving):simplifyReceiving(child);
  }
  simplifyReceiving(collection);
  await fs.writeFile(file,JSON.stringify(collection,null,2)+'\n');
}
console.log('Both Postman collections updated: saved setup, stable login variables, reference capture and CMR order fields.');
