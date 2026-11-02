import { id, name, phone, quantity } from "../utils/core.js";
import { z } from 'zod';
import * as S from "../validators/schemas.js";
export const configs = {
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
  vehicles: {
    schema: S.vehicle,
    roles: ['ADMIN', 'OPERATOR', 'MILLER', 'TRANSPORTER', 'PACS', 'LAMPS']
  },
  'vehicle-types': {
    schema: S.vehicleType,
    roles: ['ADMIN', 'OPERATOR']
  },
  'gps-devices': {
    schema: S.device,
    roles: ['ADMIN', 'OPERATOR', 'MILLER', 'TRANSPORTER', 'PACS', 'LAMPS']
  },
  'route-tags': {
    schema: S.tag,
    roles: ['ADMIN', 'OPERATOR']
  }
};
export const profilePatches = {
  imeis: S.imeiMaster.partial(),
  'vehicle-types': S.vehicleType.partial(),
  farmers: z.object({
    name: name.optional(),
    phone: phone.nullable().optional(),
    village: name.optional(),
    district_id: id.optional(),
  }).strict(),
  vehicles: z.object({
    transporter_name: name.optional(),
    transporter_contact_no: phone.optional(),
    district_id: id.optional(),
    capacity: quantity.optional(),
    vehicle_type_id: id.optional()
  }).strict(),
  'gps-devices': z.object({
    district_id: id.optional(),
    model: z.string().max(100).nullable().optional(),
    sim_no: z.string().regex(/^\+?\d{10,22}$/).nullable().optional()
  }).strict()
};
