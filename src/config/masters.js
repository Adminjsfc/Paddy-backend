import { id, name, phone, quantity } from "../utils/core.js";
import { z } from 'zod';
import * as S from "../validators/schemas.js";
export const configs = {
  schemes: { schema: S.schemeMaster, roles: ['ADMIN', 'OPERATOR'] },
  commodities: { schema: S.commodityMaster, roles: ['ADMIN', 'OPERATOR'] },
  imeis: {
    schema: S.imeiMaster,
    roles: ['ADMIN', 'OPERATOR']
  },
  seasons: {
    schema: S.season,
    roles: ['ADMIN', 'OPERATOR']
  },
  facilities: {
    schema: S.facility,
    roles: ['ADMIN', 'OPERATOR']
  },
  farmers: {
    schema: S.farmer,
    roles: ['ADMIN', 'OPERATOR']
  },
  transporters: {
    schema: S.transporter,
    roles: ['ADMIN', 'OPERATOR', 'MILLER']
  },
  vehicles: {
    schema: S.vehicle,
    roles: ['ADMIN', 'OPERATOR', 'MILLER', 'TRANSPORTER']
  },
  'vehicle-types': {
    schema: S.vehicleType,
    roles: ['ADMIN', 'OPERATOR']
  },
  'gps-devices': {
    schema: S.device,
    roles: ['ADMIN', 'OPERATOR', 'MILLER', 'TRANSPORTER']
  },
  'route-tags': {
    schema: S.tag,
    roles: ['ADMIN', 'OPERATOR']
  }
};
export const profilePatches = {
  schemes: S.schemeMaster.omit({ code: true }).partial(),
  commodities: S.commodityMaster.omit({ code: true }).partial(),
  imeis: S.imeiMaster.partial(),
  'vehicle-types': S.vehicleType.partial(),
  farmers: z.object({
    name: name.optional(),
    phone: phone.nullable().optional(),
    village: name.optional(),
    district_id: id.optional(),
    block_id: id.optional()
  }).strict(),
  transporters: z.object({
    name: name.optional(),
    contact_name: name.optional(),
    phone: phone.optional(),
    address: z.string().min(1).max(500).optional(),
    district_id: id.optional(),
    block_id: id.optional()
  }).strict(),
  vehicles: z.object({
    capacity: quantity.optional(),
    vehicle_type_id: id.optional()
  }).strict(),
  'gps-devices': z.object({
    district_id: id.optional(),
    block_id: id.optional(),
    model: z.string().max(100).nullable().optional(),
    sim_no: z.string().regex(/^\+?\d{10,22}$/).nullable().optional()
  }).strict()
};
