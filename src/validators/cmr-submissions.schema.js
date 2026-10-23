import { z } from 'zod';
import { id, quantity, dateOnly, name, phone, timestamp } from "../utils/core.js";
export const cmrSubmissionSchema = z.object({
  season_id: id,
  order_id: id,
  destination_id: id,
  district_id: id,
  store_location_id: id,
  vehicle_id: id,
  expected_completion_at: timestamp.nullable().default(null),
  quantity,
  submitted_on: dateOnly.refine(value => value <= new Date(Date.now() + 19800000).toISOString().slice(0, 10), 'Submission date cannot be in the future'),
  scheme_type: z.enum(['SCMR', 'CCMR']),
  commodity_type: z.literal('RICE').default('RICE'),
  lot_count: z.number().int().min(1).max(10000),
  stenciling_code: z.string().trim().min(1).max(100),
  gunny_bag_year: z.number().int().min(1900).max(2100),
  gunny_bag_type: z.string().trim().min(1).max(80),
  total_bags: z.number().int().positive().max(10000000),
  driver_name: name,
  driver_phone: phone,
  remarks: z.string().max(500).nullable().default(null)
}).strict();
