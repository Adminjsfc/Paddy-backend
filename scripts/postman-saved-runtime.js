// These functions are embedded into the collection and executed by Postman.
export function savedDefaults() {
  function set(key,value){pm.collectionVariables.set(key,value);if(pm.environment.has(key))pm.environment.set(key,value);}
  function once(key,value){if(!String(pm.variables.get(key)??'').trim())set(key,value);}
  once('run_id',String(Date.now()));
  const run=pm.variables.get('run_id');
  for(const [key,value] of Object.entries({pacs_code:'PACS-'+run,miller_code:'MILLER-'+run,
    destination_code:'SFC-'+run,fci_code:'FCI-'+run,lamps_code:'LAMPS-'+run,
    cmr_order_no:'CMR-ORDER-'+run,fci_order_no:'FCI-ORDER-'+run,cmr_quantity_kg:6800,fci_quantity_kg:100,
    cmr_lot_count:2,stenciling_code:'CMR-STENCIL-'+run}))once(key,value);
  const url=pm.variables.replaceIn(pm.request.url.toString());
  const cmrDropdownReady=/\/cmr\/submissions(?:\?|$)/.test(url)&&pm.variables.get('cmr_dropdown_ready')==='true';
  if(pm.variables.get('setup_attempted')==='true'&&pm.request.method==='POST'&&!cmrDropdownReady){
    const shipment=/\/(?:cmr\/submissions|shipments)(?:\?|$)/.test(url);
    if(shipment&&pm.variables.get('setup_ready')!=='true'){
      pm.execution.skipRequest();throw new Error('Load saved setup first: '+(pm.variables.get('setup_missing')||'select a valid mapped setup'));
    }
    if(shipment&&pm.variables.get('setup_shipments_ready')!=='true'){
      pm.execution.skipRequest();throw new Error('Load saved setup with one free mapped vehicle before creating a shipment.');
    }
    if(/\/cmr\/submissions(?:\?|$)/.test(url)&&pm.variables.get('setup_cmr_ready')!=='true'){
      pm.execution.skipRequest();throw new Error('Selected CMR destination needs a linked core store and a free vehicle. Reload saved setup.');
    }
  }
}

export function saveResponseReferences() {
  if(pm.response.code<200||pm.response.code>=300)return;
  let response;try{response=pm.response.json();}catch{return;}
  if(!response.ok)return;
  function set(key,value){
    if(value==null)return;
    pm.collectionVariables.set(key,value);
    if(pm.environment.has(key))pm.environment.set(key,value);
  }
  function unset(key){pm.collectionVariables.unset(key);if(pm.environment.has(key))pm.environment.unset(key);}
  const url=pm.variables.replaceIn(pm.request.url.toString()).split('?')[0];
  const data=response.data;
  if(/\/setup\/postman$/.test(url)){
    set('setup_attempted','true');set('setup_ready',String(Boolean(data.ready_for_orders)));
    set('setup_shipments_ready',String(Boolean(data.ready_for_shipments)));
    set('setup_cmr_ready',String(Boolean(data.ready_for_cmr_submissions)));
    set('setup_source_ready',String(Boolean(data.context?.pacs_id)));
    set('setup_missing',(data.missing||[]).join(' '));
    if(!data.ready_for_orders){console.warn(data.missing, data.contexts);return;}
    const c=data.context;
    if(pm.variables.get('miller_id')&&Number(pm.variables.get('miller_id'))!==Number(c.miller_id))unset('miller_token');
    if(pm.variables.get('pacs_id')&&Number(pm.variables.get('pacs_id'))!==Number(c.pacs_id)){
      for(const key of ['pacs_token','paddy_token'])unset(key);
    }
    for(const key of ['season_id','season_code','miller_id','miller_code','destination_id','destination_code','district_id','district_name','store_location_id','source_district_id']){if(c[key]==null)unset(key);else set(key,c[key]);}
    if(c.pacs_id){set('pacs_id',c.pacs_id);set('pacs_facility_id',c.pacs_id);set('pacs_code',c.pacs_code);}
    else{for(const key of ['pacs_id','pacs_facility_id','pacs_code'])unset(key);}
    if(c.source_kind==='LAMPS'){set('lamps_id',c.pacs_id);set('lamps_code',c.pacs_code);}
    if(c.destination_kind==='FCI'){set('fci_id',c.destination_id);set('fci_code',c.destination_code);}
    else{set('sfc_id',c.destination_id);set('godown_id',c.destination_id);}
    for(const [key,value] of Object.entries({setup_season_code:c.season_code,setup_miller_code:c.miller_code,
      setup_destination_code:c.destination_code,setup_source_code:c.pacs_code}))set(key,value);
    if(data.vehicle){for(const [key,value] of Object.entries(data.vehicle))if(key!=='busy')set(key,value);set('setup_vehicle_no',data.vehicle.vehicle_no);}
    else{for(const key of ['vehicle_id','vehicle_no','device_id','imei_id','imei'])unset(key);}
    return;
  }
  if(pm.request.method!=='POST')return;
  let body={};try{body=JSON.parse(pm.variables.replaceIn(pm.request.body?.raw||'{}'));}catch{}
  if(/\/(?:auth\/login|login)$/.test(url)&&data?.token&&data?.user?.role){
    set('token',data.token);
    const keys={MILLER:['miller_token','driver_owner_token'],PACS:['pacs_token','paddy_token','driver_owner_token'],LAMPS:['lamps_token','paddy_token','driver_owner_token'],DRIVER:['driver_token'],TRANSPORTER:['transporter_token']};
    for(const key of keys[data.user.role]||[])set(key,data.token);
  }
  if(/\/(?:auth\/login|login)$/.test(url)&&data?.user?.role==='MILLER'){
    if(Number(pm.variables.get('miller_id'))!==Number(data.user.miller_id)){
      for(const key of ['district_id','destination_id','store_location_id','order_id','cmr_order_id','selected_cmr_order_no','cmr_dropdown_context'])unset(key);
      set('cmr_dropdown_ready','false');
    }
    set('miller_id',data.user.miller_id);
  }
  if(/\/seasons$/.test(url)&&data?.id){set('season_id',data.id);set('season_code',data.code||body.code);}
  if(/\/facilities$/.test(url)&&data?.id){
    const kind=data.kind||body.kind,code=data.code||body.code;
    if(['PACS','LAMPS'].includes(kind)){set('pacs_id',data.id);set('pacs_code',code);}
    if(kind==='LAMPS'){set('lamps_id',data.id);set('lamps_code',code);}
    if(kind==='MILLER'){set('miller_id',data.id);set('miller_code',code);}
    if(['SFC_GODOWN','FCI'].includes(kind)){
      set('destination_id',data.id);set('destination_code',code);set('district_id',data.district_id||body.district_id);
      set(kind==='FCI'?'fci_id':'sfc_id',data.id);if(kind==='FCI')set('fci_code',code);else set('godown_id',data.id);
    }
  }
  if(/\/vehicles$/.test(url)&&data?.id){set('vehicle_id',data.id);set('vehicle_no',data.registration_no||body.registration_no);}
  if(/\/integrations\/euparjan\/cmr-orders$/.test(url)&&data?.records?.[0]?.id){
    set('cmr_order_id',data.records[0].id);set('order_id',data.records[0].id);
    if(body.records?.[0]?.destination_code===pm.variables.get('fci_code'))set('fci_order_id',data.records[0].id);
  }
  if(/\/integrations\/euparjan\/procurements$/.test(url)&&data?.records?.[0]?.id)set('procurement_id',data.records[0].id);
}

export function saveCmrDropdownReferences(){
  const url=pm.variables.replaceIn(pm.request.url.toString());
  if(!/\/cmr\/(?:submission-options|vehicles|vehicle|(?:dropdowns\/)?(?:seasons|schemes|commodities|districts|stores|orders|vehicles))(?:\?|$)/.test(url))return;
  const query=key=>{const match=url.match(new RegExp('[?&]'+key+'=([^&]*)'));return match?decodeURIComponent(match[1]):undefined;};
  const only=url.match(/\/cmr\/(?:dropdowns\/)?(seasons|schemes|commodities|districts|stores|orders|vehicles)(?:\?|$)/)?.[1]||query('only')||'all';
  function set(key,value){pm.collectionVariables.set(key,value);if(pm.environment.has(key))pm.environment.set(key,value);}
  function clear(keys){for(const key of keys){pm.collectionVariables.unset(key);if(pm.environment.has(key))pm.environment.unset(key);}}
  const orderKeys=['order_id','cmr_order_id','selected_cmr_order_no'];
  const storeKeys=['destination_id','store_location_id',...orderKeys];
  let response;try{response=pm.response.json();}catch{return;}
  if(pm.response.code>=300||!response.ok){
    clear(only==='orders'?orderKeys:only==='stores'?storeKeys:['district_id',...storeKeys]);
    set('cmr_dropdown_ready','false');return;
  }
  const d=response.data||{};
  let previous={};try{previous=JSON.parse(pm.variables.get('cmr_dropdown_context')||'{}');}catch{}
  const season=query('season_id')??pm.variables.get('season_id');
  const scheme=query('scheme_type')??pm.variables.get('scheme_code');
  const district=query('district_id')??pm.variables.get('district_id');
  const destination=query('destination_id')??pm.variables.get('destination_id');
  if(previous.season_id!=null&&(String(previous.season_id)!==String(season)||previous.scheme_code!==scheme))clear(storeKeys);
  else if(previous.district_id!=null&&String(previous.district_id)!==String(district))clear(storeKeys);
  else if(previous.destination_id!=null&&String(previous.destination_id)!==String(destination))clear(['store_location_id',...orderKeys]);
  if(query('season_id'))set('season_id',Number(season));
  if(query('scheme_type'))set('scheme_code',scheme);
  if(query('district_id'))set('district_id',Number(district));
  if(query('destination_id'))set('destination_id',Number(destination));
  const choose=(rows,key,current)=>rows.find(row=>String(row[key])===String(current))||(rows.length===1?rows[0]:null);
  if(d.seasons){const selected=choose(d.seasons,'id',pm.variables.get('season_id'));if(selected){set('season_id',selected.id);set('season_code',selected.code);}else clear(['season_id',...storeKeys]);}
  if(d.schemes){const selected=choose(d.schemes,'code',pm.variables.get('scheme_code'));if(selected)set('scheme_code',selected.code);else{clear(['scheme_code',...storeKeys]);console.warn('Select scheme_code: SCMR or CCMR.');}}
  if(d.commodities){const selected=choose(d.commodities,'code',pm.variables.get('commodity_type'));if(selected)set('commodity_type',selected.code);else clear(['commodity_type']);}
  if(d.districts){const selected=choose(d.districts,'id',pm.variables.get('district_id'));if(selected)set('district_id',selected.id);else clear(['district_id',...storeKeys]);}
  if(d.stores){
    const candidates=d.stores.filter(s=>!pm.variables.get('destination_id')||Number(s.facility_id)===Number(pm.variables.get('destination_id')));
    const selected=d.stores.find(s=>String(s.id)===String(pm.variables.get('store_location_id')))||choose(candidates,'id',undefined)||(!candidates.length&&d.stores.length===1?d.stores[0]:null);
    if(selected){set('store_location_id',selected.id);set('destination_id',selected.facility_id);}
    else clear(storeKeys);
  }
  if(d.orders){const selected=choose(d.orders,'id',pm.variables.get('order_id'));
    if(selected){set('order_id',selected.id);set('cmr_order_id',selected.id);set('selected_cmr_order_no',selected.order_no);}
    else clear(orderKeys);
  }
  if(/\/cmr\/(?:dropdowns\/)?vehicles(?:\?|$)/.test(url)&&Array.isArray(d)){
    const selected=choose(d,'id',pm.variables.get('vehicle_id'));
    if(selected){set('vehicle_id',selected.id);set('vehicle_no',selected.registration_no);}else clear(['vehicle_id','vehicle_no']);
  }
  if(/\/cmr\/vehicle\?/.test(url)&&d.id){if(Number(d.busy)===0&&Number(d.gps_active)===1){set('vehicle_id',d.id);set('vehicle_no',d.registration_no);}else clear(['vehicle_id']);}
  const context={};for(const key of ['miller_id','season_id','scheme_code','district_id','destination_id'])context[key]=pm.variables.get(key)??null;
  set('cmr_dropdown_context',JSON.stringify(context));
  const needed=['season_id','scheme_code','district_id','destination_id','store_location_id','order_id','vehicle_id'];
  set('cmr_dropdown_ready',String(needed.every(key=>Boolean(pm.variables.get(key)))));
  console.info('CMR selection',Object.fromEntries(needed.map(key=>[key,pm.variables.get(key)||'select next'])));
}
