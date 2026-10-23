import * as controller from "../controllers/masters.controller.js";
import { configs, profilePatches } from "../config/masters.js";
import { Router } from 'express';
import { roles } from "../middlewares/auth.js";
export const masters = Router();
masters.get('/route-tag-assignment-options', roles('ADMIN', 'OPERATOR'), controller.listRouteTagAssignmentOptions);
masters.get('/location-options', roles('ADMIN', 'OPERATOR'), controller.listLocationOptions);
for (const [type, config] of Object.entries(configs)) {
  const table = type.replaceAll('-', '_');
  masters.post('/' + type, roles(...config.roles), controller.createMasterRecord(config, type));
  masters.get('/' + type, controller.listMasterRecords(type, table));
  masters.get('/' + type + '/:id', controller.getMasterRecord(type, table));
}
masters.patch('/facilities/:id', roles('ADMIN', 'OPERATOR'), controller.updateFacility);
masters.patch('/seasons/:id', roles('ADMIN', 'OPERATOR'), controller.updateSeason);
for (const type of ['facilities', 'seasons', 'schemes', 'commodities']) {
  masters.patch(`/${type}/:id/status`, roles('ADMIN', 'OPERATOR'), controller.setFacilityOrSeasonStatus(type));
}
for (const type of ['farmers', 'transporters', 'vehicles', 'gps-devices', 'route-tags', 'vehicle-types', 'imeis']) {
  masters.patch(`/${type}/:id/status`, roles(...(['route-tags', 'farmers', 'vehicle-types', 'imeis'].includes(type) ? ['ADMIN', 'OPERATOR'] : ['ADMIN', 'OPERATOR', 'MILLER'])), controller.setMasterStatus(type));
}
export const masterPush = Router();
for (const type of ['farmers', 'facilities', 'route-tags']) {
  masterPush.post('/' + type, controller.importMasterRecord(type));
}
for (const [type, schema] of Object.entries(profilePatches)) {
  masters.patch(`/${type}/:id`, roles(...configs[type].roles), controller.updateMasterProfile(schema, type));
}
