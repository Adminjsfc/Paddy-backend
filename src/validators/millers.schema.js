import { z } from 'zod';
import * as S from "./schemas.js";
export const millerRegistrationSchema = z.object({
  facility: z.object(S.facility.shape).omit({
    code: true
  }).extend({
    kind: z.literal('MILLER')
  }).strict(),
  user: S.user.pick({
    name: true,
    email: true
  }).strict()
}).strict();
