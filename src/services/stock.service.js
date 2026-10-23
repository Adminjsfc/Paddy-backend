import { ensure, actor } from "../utils/core.js";
import * as repository from '../repositories/stock.repository.js';
export async function stock(connection, facilityId, seasonId, commodity, dh, dr, type, ref, schemeCode, user) {
  ensure(schemeCode,'Stock scheme is required','VALIDATION',400);
  // The owning facility is locked by the workflow before checking aggregate capacity.
  const masters=await repository.balanceMasters(connection,commodity,schemeCode);
  const audit={userId:user?.id??null,actor:actor(user)};
  await repository.ensureBalance(connection, facilityId, seasonId, masters, audit);
  const s = await repository.lockBalance(connection, facilityId, seasonId, masters);
  ensure(Number(s.status)===1,'Stock balance is inactive','STOCK_INACTIVE',409);
  ensure(s.on_hand_g + dh >= 0 && s.reserved_g + dr >= 0 && s.on_hand_g + dh >= s.reserved_g + dr,
    `Insufficient stock for facility_id=${facilityId}, season_id=${seasonId}, scheme_code="${schemeCode}", commodity="${commodity}". Available=${(s.on_hand_g-s.reserved_g)/100000} QTL; requested=${Math.max(dr,-dh,0)/100000} QTL. Check the facility, season, scheme and synced procurement quantity.`, 'INSUFFICIENT_STOCK');
  if (dh > 0) {
    const f = await repository.findCapacity(connection, facilityId);
    const total = await repository.totalOnHand(connection, facilityId);
    ensure(Number(total.amount) + dh <= f.capacity_g, 'Facility storage capacity exceeded', 'CAPACITY_EXCEEDED');
  }
  await repository.updateBalance(connection, s.id, dh, dr, audit);
  await repository.insertLedger(connection, {
    facility_id: facilityId,
    season_id: seasonId,
    ...masters,
    created_by:audit.userId,
    created_by_actor:audit.actor,
    on_hand_delta_g: dh,
    reserved_delta_g: dr,
    reference_type: type,
    reference_id: ref
  });
}
