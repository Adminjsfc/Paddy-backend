import {z} from 'zod';
import {id,dateOnly} from '../utils/core.js';
export const driverRequest=z.object({driver_id:id.optional()}).strict();
export const driverReport=driverRequest.extend({trip_id:id.optional(),from_date:dateOnly.optional(),to_date:dateOnly.optional(),
  page:z.number().int().positive().max(100000).default(1),limit:z.number().int().positive().max(200).default(20)
}).refine(v=>!v.from_date||!v.to_date||v.from_date<=v.to_date,'from_date must not exceed to_date');
