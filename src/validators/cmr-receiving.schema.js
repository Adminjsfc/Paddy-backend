import { z } from 'zod';
import { pastTimestamp } from "../utils/core.js";
export const decimal = places => z.string().regex(new RegExp(`^\\d{1,9}(\\.\\d{1,${places}})?$`));
export const quality = z.number().min(0).max(100).refine(value => Math.abs(value * 100 - Math.round(value * 100)) < 1e-7, 'At most two decimal places');
export const receivingSchema = z.object({
  decision: z.enum(['ACCEPTED', 'REJECTED']),
  receipt_no: z.string().trim().min(1).max(100),
  received_at: pastTimestamp,
  stacks: z.array(z.object({
    stack_no: z.string().trim().min(1).max(100),
    received_quantity_qtl: decimal(5),
    bags: z.number().int().positive().max(1000000)
  }).strict()).min(1).max(100),
  gross_weight_kg: decimal(3),
  empty_bag_weight_kg: decimal(3),
  red_grains_percent: quality,
  chalky_grains_percent: quality,
  moisture_percent: quality,
  broken_rice_percent: quality,
  other_standards: z.string().trim().min(1).max(1000),
  compliance_confirmed: z.boolean(),
  remarks: z.string().trim().max(500).default(''),
  gps_override_reason: z.string().trim().min(10).max(500).nullable().default(null)
}).strict();
