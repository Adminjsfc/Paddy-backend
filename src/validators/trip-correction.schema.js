import { z } from 'zod';
import { pastTimestamp } from '../utils/core.js';

export const tripCorrection = z.object({
  trip_status: z.union([z.literal(1), z.literal(2)]),
  dispatched_at: pastTimestamp,
  trip_started_at: pastTimestamp,
  trip_completed_at: pastTimestamp.optional(),
  reason: z.string().trim().min(5).max(500)
}).strict().superRefine((data, ctx) => {
  const issue = message => ctx.addIssue({ code: 'custom', message });
  if (data.trip_started_at <= data.dispatched_at) issue('Start must be after dispatch');
  if (data.trip_status === 2 && !data.trip_completed_at) issue('Completion time is required');
  if (data.trip_status === 1 && data.trip_completed_at) issue('Active trips cannot have a completion time');
  if (data.trip_completed_at && data.trip_completed_at <= data.trip_started_at) issue('Completion must be after start');
});
