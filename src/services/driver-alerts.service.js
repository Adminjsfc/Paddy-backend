import * as repository from '../repositories/driver-alerts.repository.js';
import {event} from '../repositories/events.repository.js';
import {transaction} from '../utils/transaction.js';

export function pendingAlerts(row,now,staleMinutes){
  const data=[];
  if(row.gps_reference&&now-new Date(row.gps_reference).getTime()>staleMinutes*60000){
    data.push({type:'GPS_OFFLINE',episode:new Date(row.gps_reference).toISOString(),
      message:`GPS update unavailable for more than ${staleMinutes} minutes. Vehicle: ${row.registration_no}. Trip: ${row.shipment_no}.`});
  }
  if(row.expected_completion_at&&now>new Date(row.expected_completion_at).getTime()){
    data.push({type:'ETA_DELAYED',episode:new Date(row.expected_completion_at).toISOString(),
      message:`Expected arrival time exceeded. Vehicle: ${row.registration_no}. Trip: ${row.shipment_no}.`});
  }
  return data;
}
export async function captureDriverAlerts({driverId,now=Date.now(),staleMinutes=Number(process.env.GPS_STALE_MINUTES||15)}={}){
  if(!Number.isFinite(staleMinutes)||staleMinutes<=0)throw new Error('GPS_STALE_MINUTES must be positive');
  const shipments=await repository.candidates(driverId);
  for(const shipment of shipments)await transaction(async connection=>{
    const row=await repository.current(connection,shipment.id);
    if(!row||driverId&&Number(row.driver_user_id)!==Number(driverId))return;
    for(const alert of pendingAlerts(row,now,staleMinutes)){
      if(await repository.existing(connection,row.id,alert.type,alert.episode,row.driver_user_id))continue;
      await event(connection,row.id,alert.type,new Date(now),{episode:alert.episode,driver_id:row.driver_user_id,message:alert.message,
        location:row.latitude!=null&&row.longitude!=null?{latitude:Number(row.latitude),longitude:Number(row.longitude)}:null});
    }
  });
}
export function startDriverAlertMonitor(){
  let running,stopped=false;
  const tick=()=>{
    if(stopped||running)return;
    running=captureDriverAlerts().catch(error=>console.error(JSON.stringify({event:'DRIVER_ALERT_SCAN_FAILED',code:error.code||'ALERT_SCAN_FAILED'}))).finally(()=>{running=null;});
  };
  const timer=setInterval(tick,60000);timer.unref();tick();
  return async()=>{stopped=true;clearInterval(timer);await running;};
}
