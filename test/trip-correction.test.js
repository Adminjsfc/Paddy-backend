import test from 'node:test';
import assert from 'node:assert/strict';
import { tripCorrection } from '../src/validators/trip-correction.schema.js';
import { correctTripStatus } from '../src/services/shipments.service.js';

const input = { trip_status: 1, dispatched_at: '2026-01-01T10:00:00Z',
  trip_started_at: '2026-01-01T10:01:00Z', reason: 'Verified operator correction' };
const context = { user: { id: 1, role: 'ADMIN' }, params: { id: 2 } };
function database(status = 'IN_TRANSIT', trip_status = 1) {
  const calls = [];
  return { calls, execute: async (sql, args) => {
    calls.push({ sql, args });
    if (sql.startsWith('SELECT')) return [[{ id: 2, route_id: 3, status, trip_status }]];
    return [{ affectedRows: 1, insertId: 1 }];
  } };
}

test('correction requires actual chronological timestamps', () => {
  assert.equal(tripCorrection.safeParse({ ...input, trip_status: 2 }).success, false);
  assert.equal(tripCorrection.safeParse({ ...input, trip_started_at: input.dispatched_at }).success, false);
  assert.equal(tripCorrection.safeParse({ ...input, trip_completed_at: '2026-01-01T10:02:00Z' }).success, false);
  assert.equal(tripCorrection.safeParse({ ...input, trip_status: 2,
    trip_completed_at: '2026-01-01T10:02:00Z' }).success, true);
});

test('correction repairs related shipment fields under row lock and records an audit event', async () => {
  const db = database();
  const result = await correctTripStatus(db, tripCorrection.parse(input), context);
  assert.equal(result.status, 'IN_TRANSIT');
  assert.match(db.calls[0].sql, /FOR UPDATE/);
  assert.match(db.calls[1].sql, /UPDATE shipments SET status=\?,trip_status=\?,dispatched_at=\?/);
  assert.deepEqual(db.calls[1].args.slice(0, 2), ['IN_TRANSIT', 1]);
  assert.equal(db.calls[2].args[1], 'TRIP_STATUS_CORRECTED');
  assert.match(db.calls[2].args[3], /Verified operator correction/);
});

test('completion sets ARRIVED without delivering stock', async () => {
  const db = database();
  const result = await correctTripStatus(db, tripCorrection.parse({ ...input, trip_status: 2,
    trip_completed_at: '2026-01-01T10:02:00Z' }), context);
  assert.equal(result.status, 'ARRIVED');
  assert.deepEqual(db.calls[1].args.slice(0, 2), ['ARRIVED', 2]);
  assert.equal(db.calls.length, 3);
});

test('correction forbids ordinary users, terminal shipments and reverse transitions', async () => {
  await assert.rejects(correctTripStatus(database(), tripCorrection.parse(input), {
    ...context, user: { id: 1, role: 'MILLER' }
  }), e => e.status === 403);
  for (const status of ['PLANNED', 'ARRIVED', 'DELIVERED', 'CANCELLED']) {
    const db = database(status);
    await assert.rejects(correctTripStatus(db, tripCorrection.parse(input), context), /Only dispatched or running/);
    assert.equal(db.calls.length, 1);
  }
  await assert.rejects(correctTripStatus(database('IN_TRANSIT', 2), tripCorrection.parse(input), context), /cannot move backwards/);
});
