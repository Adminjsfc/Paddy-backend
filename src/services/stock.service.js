import {addKg} from '../utils/core.js';
import {capacityKg} from '../utils/core.js';
import { ensure, actor } from "../utils/core.js";
import * as repository from '../repositories/stock.repository.js';
export async function stock(connection, facilityId, seasonId, commodity, dh, dr, type, ref, schemeCode, user, details = {}) {
  ensure(schemeCode,'Stock scheme is required','VALIDATION',400);
  // The owning facility is locked by the workflow before checking aggregate capacity.
  const masters=await repository.balanceMasters(connection,commodity,schemeCode);
  const audit={userId:user?.id??null,actor:actor(user)};
  await repository.ensureBalance(connection, facilityId, seasonId, masters, audit);
  const s = await repository.lockBalance(connection, facilityId, seasonId, masters);
  ensure(Number(s.status)===1,'Stock balance is inactive','STOCK_INACTIVE',409);
  ensure(addKg(s.on_hand_kg,dh) >= 0 && addKg(s.reserved_kg,dr) >= 0 && addKg(s.on_hand_kg,dh) >= addKg(s.reserved_kg,dr),
    `Only ${addKg(s.on_hand_kg,-s.reserved_kg)} KG of ${commodity==='PADDY'?'Paddy':'Rice'} stock is available. You requested ${Math.max(dr,-dh,0)} KG.`, 'INSUFFICIENT_STOCK');
  if (dh > 0) {
    const f = await repository.findCapacity(connection, facilityId);
    const total = await repository.totalOnHand(connection, facilityId);
    const capacity=capacityKg(f);
    ensure(capacity==null || addKg(total.amount,dh) <= capacity, 'Facility storage capacity exceeded', 'CAPACITY_EXCEEDED');
  }
  await repository.updateBalance(connection, s.id, dh, dr, audit);
  return repository.insertLedger(connection, {
    stock_id: s.id,
    remarks: details.remarks ?? null,
    facility_id: facilityId,
    season_id: seasonId,
    ...masters,
    created_by:audit.userId,
    created_by_actor:audit.actor,
    on_hand_delta_kg: dh,
    reserved_delta_kg: dr,
    reference_type: type,
    reference_id: ref
  });
}
