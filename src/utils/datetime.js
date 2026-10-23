export function secondPrecision(value) {
  return new Date(Math.floor(value.getTime() / 1000) * 1000);
}

// Express passes Date values through toJSON before invoking its JSON replacer.
export function secondsJsonReplacer(key, value) {
  return typeof value === 'string'
    ? value.replace(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})\.\d+(Z|[+-]\d{2}:\d{2})$/, '$1$2')
    : value;
}
