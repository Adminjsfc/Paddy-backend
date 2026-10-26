import { grams } from "./core.js";
export function storeFacilityData(store, {
  districts,
  blocks,
  code,
  capacityUnit,
  radiusUnit
}) {
  const problems = [],
    warnings = [];
  const district = districts.get(Number(store.district_id));
  if (!district) problems.push('District is not present in the local district master');
  const blockMatches = blocks.get(`${store.district_id}:${store.rgi_block_code}`) || [];
  const block = blockMatches.length === 1 ? blockMatches[0] : null;
  if (!block) warnings.push('Block is missing or ambiguous; block_id left NULL');
  const name = String(store.store_name || '').trim();
  if (!name || name.length > 180) problems.push('Store name missing or longer than 180 characters');
  const coordinates = [store.lat, store.lng];
  const latitude = Number(store.lat),
    longitude = Number(store.lng);
  if (coordinates.some(value => value == null || String(value).trim() === '') || !Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180 || latitude === 0 && longitude === 0) problems.push('Coordinates missing or invalid');
  let capacity;
  try {
    capacity = grams({
      value: String(store.capacity ?? '').trim(),
      unit: capacityUnit
    });
  } catch {
    problems.push('Capacity missing or invalid');
  }
  const radius = Number(store.radius) * (radiusUnit === 'KM' ? 1000 : 1);
  if (store.radius == null || String(store.radius).trim() === '' || !Number.isFinite(radius) || Math.abs(radius - Math.round(radius)) > 0.000001 || radius < 10 || radius > 10000) problems.push('Radius missing or outside 10–10000 metres');
  if (![1, 2].includes(Number(store.store_type))) problems.push('Unsupported store type');
  if (![0, 1].includes(Number(store.status))) problems.push('Status is not 0 or 1');
  if (problems.length) return {
    problems,
    warnings
  };
  return {
    problems,
    warnings,
    data: {
      code,
      kind: Number(store.store_type) === 1 ? 'FCI' : 'SFC_GODOWN',
      name,
      // The source has no street-address field. Use its location names as a label.
      address: [name, block?.block_name, district.district_name].filter(Boolean).join(', ').slice(0, 500),
      district_id: Number(store.district_id),
      block_id: block ? Number(block.id) : null,
      latitude: Number(latitude.toFixed(7)),
      longitude: Number(longitude.toFixed(7)),
      radius_m: Math.round(radius),
      capacity_g: capacity,
      active: Number(store.status),
      core_store_id: Number(store.id),
      created_by: null
    }
  };
}
