import fs from 'node:fs/promises';
import { pool } from "../src/config/database.js";
import { rows, insert } from "../src/repositories/database.js";
import { storeFacilityData } from './store-facility-import.js';
const args = process.argv.slice(2);
const value = name => args.find(arg => arg.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const capacityUnit = value('capacity-unit'),
  radiusUnit = value('radius-unit');
const apply = args.includes('--apply');
if (!['MT', 'QTL', 'KG'].includes(capacityUnit) || !['KM', 'M'].includes(radiusUnit)) {
  await pool.end();
  throw Error('Specify --capacity-unit=MT|QTL|KG and --radius-unit=KM|M. Preview is read-only; add --apply to import.');
}
const reportPath = value('report') || 'docs/store-facility-import-report.json';
const c = await pool.getConnection();
let locked = false,
  inTransaction = false;
try {
  if (apply) {
    const [lock] = await c.query("SELECT GET_LOCK('sfc_cmr_store_facility_import',30) acquired");
    if (!lock[0].acquired) throw Error('Another store facility import is running');
    locked = true;
    await c.beginTransaction();
    inTransaction = true;
  }
  const stores = await rows(c, 'SELECT id,store_id,store_name,store_type,district_id,rgi_block_code,lat,lng,radius,capacity,status FROM tbl_store_location_master WHERE store_type IN (1,2) ORDER BY id');
  const districtRows = await rows(c, 'SELECT id,district_name FROM tbl_district_master');
  const blockRows = await rows(c, 'SELECT id,district_id,rgi_block_code,block_name FROM tbl_block_master');
  const facilities = await rows(c, 'SELECT id,code,kind,district_id,core_store_id FROM facilities' + (apply ? ' FOR UPDATE' : ''));
  const districts = new Map(districtRows.map(row => [Number(row.id), row])),
    blocks = new Map();
  for (const block of blockRows) if (block.rgi_block_code != null) {
    const key = `${block.district_id}:${block.rgi_block_code}`;
    blocks.set(key, [...(blocks.get(key) || []), block]);
  }
  const byLink = new Map(facilities.filter(row => row.core_store_id != null).map(row => [Number(row.core_store_id), row]));
  const byCode = new Map(facilities.map(row => [row.code, row]));
  const codeCounts = new Map();
  for (const store of stores) {
    const code = String(store.store_id || '').trim();
    codeCounts.set(code, (codeCounts.get(code) || 0) + 1);
  }
  const results = [];
  for (const store of stores) {
    const entry = {
      store_id: Number(store.id),
      store_code: store.store_id,
      name: store.store_name
    };
    if (byLink.has(Number(store.id))) {
      results.push({
        ...entry,
        result: 'existing',
        facility_id: byLink.get(Number(store.id)).id
      });
      continue;
    }
    const rawCode = String(store.store_id || '').trim();
    const validCode = /^[A-Za-z0-9_.:/-]+$/.test(rawCode);
    const code = validCode && rawCode.length <= 80 && codeCounts.get(rawCode) === 1 ? rawCode : `${validCode ? rawCode.slice(0, 55) : 'STORE'}_STORE_${store.id}`;
    const existing = byCode.get(code);
    if (existing) {
      const expectedKind = Number(store.store_type) === 1 ? 'FCI' : 'SFC_GODOWN';
      if (existing.core_store_id == null && existing.kind === expectedKind && Number(existing.district_id) === Number(store.district_id)) {
        if (apply) await rows(c, 'UPDATE facilities SET core_store_id=?,updated_at=CURRENT_TIMESTAMP() WHERE id=?', [store.id, existing.id]);
        existing.core_store_id = store.id;
        byLink.set(Number(store.id), existing);
        results.push({
          ...entry,
          result: 'linked',
          facility_id: existing.id,
          code
        });
      } else results.push({
        ...entry,
        result: 'skipped',
        problems: ['Facility code conflicts with another facility'],
        code
      });
      continue;
    }
    const normalized = storeFacilityData(store, {
      districts,
      blocks,
      code,
      capacityUnit,
      radiusUnit
    });
    if (normalized.problems.length) {
      results.push({
        ...entry,
        result: 'skipped',
        problems: normalized.problems,
        warnings: normalized.warnings
      });
      continue;
    }
    const id = apply ? await insert(c, 'facilities', normalized.data) : null;
    byCode.set(code, {
      ...normalized.data,
      id
    });
    byLink.set(Number(store.id), {
      id
    });
    results.push({
      ...entry,
      result: 'created',
      facility_id: id,
      code,
      warnings: normalized.warnings
    });
  }
  const summary = results.reduce((counts, row) => ({
    ...counts,
    [row.result]: (counts[row.result] || 0) + 1
  }), {});
  await fs.writeFile(reportPath, JSON.stringify({
    mode: apply ? 'apply' : 'preview',
    capacity_unit: capacityUnit,
    radius_unit: radiusUnit,
    total: stores.length,
    summary,
    results
  }, null, 2) + '\n');
  if (apply) {
    await c.commit();
    inTransaction = false;
  }
  console.log(JSON.stringify({
    mode: apply ? 'apply' : 'preview',
    total: stores.length,
    ...summary,
    report: reportPath
  }));
} finally {
  if (inTransaction) await c.rollback();
  if (locked) await c.query("SELECT RELEASE_LOCK('sfc_cmr_store_facility_import')");
  c.release();
  await pool.end();
}
