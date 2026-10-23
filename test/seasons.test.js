import test from 'node:test';
import assert from 'node:assert/strict';
import { createMaster } from '../src/services/masters.service.js';

const data = { code: '2026-27', name: 'Season 2026-27', start_date: '2026-10-01', end_date: '2027-09-30', recovery_percent: 68 };

test('creating a deleted season restores its ID and updates details without replacing creation audit', async () => {
  const calls = [];
  const connection = { execute: async (sql, args) => {
    calls.push({ sql, args });
    return sql.startsWith('SELECT') ? [[{ id: 7, active: 0 }]] : [{ affectedRows: 1 }];
  } };
  const result = await createMaster(connection, 'seasons', data, { id: 12 });
  assert.equal(result.id, 7);
  assert.equal(result.active, true);
  assert.equal(result.updated_by, 12);
  assert.equal(result.name, data.name);
  assert.match(calls[0].sql, /FOR UPDATE/);
  assert.match(calls[1].sql, /^UPDATE seasons SET/);
  assert.doesNotMatch(calls[1].sql, /created_by|created_at/);
  assert.equal(calls[1].args.at(-1), 7);
});

test('a new season is inserted normally', async () => {
  const connection = { execute: async sql => sql.startsWith('SELECT') ? [[]] : [{ insertId: 8 }] };
  const result = await createMaster(connection, 'seasons', data, { id: 12 });
  assert.equal(result.id, 8);
  assert.equal(result.created_by, 12);
});

test('an active season with the same code still rejects duplicate creation', async () => {
  const duplicate = Object.assign(new Error('Duplicate code'), { code: 'ER_DUP_ENTRY' });
  const connection = { execute: async sql => {
    if (sql.startsWith('SELECT')) return [[{ id: 7, active: 1 }]];
    assert.match(sql, /^INSERT INTO seasons/);
    throw duplicate;
  } };
  await assert.rejects(createMaster(connection, 'seasons', data, { id: 12 }), error => error === duplicate);
});
