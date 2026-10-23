import { id } from "../utils/core.js";
import { z } from 'zod';
export const createSchema = z.object({
  season_id: id,
  miller_id: id,
  store_id: id
}).strict();
export const statusSchema = z.object({
  active: z.boolean()
}).strict();
