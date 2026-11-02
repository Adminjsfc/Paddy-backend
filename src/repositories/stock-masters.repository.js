import {code,ensure} from '../utils/core.js';

export async function requireStockMasters(connection,schemeCode,commodity) {
  const scheme=code.parse(schemeCode);
  ensure(['PADDY','RICE'].includes(commodity),'commodity_code must be PADDY or RICE','VALIDATION',400);
  return {scheme_code:scheme,commodity_code:commodity};
}
