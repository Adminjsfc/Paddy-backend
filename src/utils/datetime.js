export function secondPrecision(value) {
  return new Date(Math.floor(value.getTime() / 1000) * 1000);
}

export function secondsJsonReplacer(key, value) {
  return typeof value === 'string'
    ? value.replace(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})\.\d+(Z|[+-]\d{2}:\d{2})$/, '$1$2')
    : value;
}

// Display dates only in reports; database values and other APIs stay ISO/UTC.
// Express converts Date objects to ISO strings before invoking this replacer.
export function dateJsonReplacer(key, value) {
  if (typeof value !== 'string') return value;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = new Date(`${value}T00:00:00Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return value;
    return value.split('-').reverse().join('-');
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return value;
  const instant = new Date(value);
  if (!Number.isFinite(instant.getTime())) return value;
  const ist = new Date(instant.getTime() + 19800000);
  const pad = number => String(number).padStart(2, '0');
  const hour = ist.getUTCHours();
  return `${pad(ist.getUTCDate())}-${pad(ist.getUTCMonth() + 1)}-${ist.getUTCFullYear()} ${pad(hour % 12 || 12)}:${pad(ist.getUTCMinutes())}:${pad(ist.getUTCSeconds())} ${hour < 12 ? 'AM' : 'PM'}`;
}
