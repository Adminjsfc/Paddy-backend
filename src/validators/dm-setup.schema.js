import { z } from 'zod';
import { id } from "../utils/core.js";
import * as S from "./schemas.js";
export const millerSeason = {
  miller_id: id,
  season_id: id
};
export const paddyFacilitySchema = z.object(S.facility.shape).omit({
  code: true
}).extend({
  email: S.user.shape.email,
  kind: z.enum(['PACS', 'LAMPS']),
  milling_capacity_per_day: z.null().default(null),
  recovery_percent: z.null().default(null)
}).strict();
