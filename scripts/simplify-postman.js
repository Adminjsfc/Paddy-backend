import fs from 'node:fs/promises';
import {savedDefaults,saveResponseReferences,saveCmrDropdownReferences} from './postman-saved-runtime.js';
const preMarker='// SAVED_SETUP_DEFAULTS_V1';
const testMarker='// SAVED_SETUP_RESPONSES_V1';
for(const file of ['postman/SFC_CMR.postman_collection.json','postman/Paddy_Service_Live_API.postman_collection.json']){
  const collection=JSON.parse(await fs.readFile(file,'utf8'));
  collection.variable??=[];collection.event??=[];
  collection.variable=collection.variable.filter(v=>v.key!=='expected_completion_at');
  const variables=['setup_season_code','setup_miller_code','setup_destination_code','setup_source_code','setup_vehicle_no',
    'miller_code','pacs_code','destination_code','fci_code','lamps_code','cmr_order_no','fci_order_no',
    'cmr_quantity_kg','fci_quantity_kg','cmr_lot_count','stenciling_code'];
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
  let orderRequest;
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
          const fci=r.destination_code==='{{fci_code}}';
          r.rice_quantity={value:'__BARE__{{'+(fci?'fci_quantity_kg':'cmr_quantity_kg')+'}}',unit:'KG'};
          r.district_id='__BARE__{{district_id}}';r.lot_count='__BARE__{{cmr_lot_count}}';r.stenciling_code='{{stenciling_code}}';
          if(r.order_no?.includes('{{run_id}}')||r.order_no==='{{cmr_order_no}}')r.order_no=fci?'{{fci_order_no}}':'{{cmr_order_no}}';
          if(r.external_ref?.includes('{{run_id}}')||r.external_ref==='CMR:{{cmr_order_no}}')r.external_ref=fci?'CMR:{{fci_order_no}}':'CMR:{{cmr_order_no}}';changed=true;
        }
      }
      if(changed)item.request.body.raw=JSON.stringify(body,null,2).replace(/"__BARE__(\{\{[^}]+\}\})"/g,'$1');
    }catch{}}
    const url=typeof item.request?.url==='string'?item.request.url:item.request?.url?.raw||'';
    if(item.request?.method==='POST'&&/\/integrations\/euparjan\/cmr-orders$/.test(url))orderRequest=item;
  }}
  collection.item=collection.item.filter(i=>i.name!=='00 Quick CMR - saved setup');visit(collection.item);
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
  if(orderRequest){const order=structuredClone(orderRequest);order.name='02 Import CMR order (source LotNo = order_no)';folder.item.push(order);}
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
        value.description='Send flat value, unit (KG) and received_bags. Backend sets delivered_at and calculates shortage. Shipment must be ARRIVED before receiving. Reuse the same Idempotency-Key and body for a retry.';
      }
    }catch{}}
    for(const child of Object.values(value))if(child&&typeof child==='object')Array.isArray(child)?child.forEach(simplifyReceiving):simplifyReceiving(child);
  }
  simplifyReceiving(collection);
  await fs.writeFile(file,JSON.stringify(collection,null,2)+'\n');
}
console.log('Both Postman collections updated: saved setup, stable login variables, reference capture and CMR order fields.');
