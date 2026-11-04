// Existing idempotency responses are historical JSON. Normalize their quantity
// fields at the API boundary without rewriting the original audit data.
export function kilogramResponse(value) {
  if (Array.isArray(value)) return value.map(kilogramResponse);
  if (!value || typeof value !== 'object' || value instanceof Date) return value;
  return Object.fromEntries(Object.entries(value).map(([key, field]) => {
    if (/_g$/.test(key)) return [key.replace(/_g$/, '_kg'), field == null ? null : Number((Number(field) / 1000).toFixed(3))];
    return [key, kilogramResponse(field)];
  }));
}
