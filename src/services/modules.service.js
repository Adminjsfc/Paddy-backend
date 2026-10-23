import * as repository from "../repositories/modules.repository.js";
import { moduleCatalog } from "../config/modules.js";
export async function listAssignedModules(context) {
  const effects = {
    headers: []
  };
  const permissions = await repository.listAssignedModulesListModulePermissions(context);
  return {
    body: {
      ok: true,
      data: moduleCatalog.map(module => {
        const permission = permissions.find(row => row.module_key === module.key);
        const admin = context.user.role === 'ADMIN';
        return {
          ...module,
          can_view: admin || Boolean(Number(permission?.can_view)),
          can_add: admin || Boolean(Number(permission?.can_add)),
          can_edit: admin || Boolean(Number(permission?.can_edit))
        };
      })
    },
    status: 200,
    ...effects
  };
}
export async function listModulePermissions(context) {
  const effects = {
    headers: []
  };
  return {
    body: {
      ok: true,
      data: await repository.listModulePermissionsListModulePermissions()
    },
    status: 200,
    ...effects
  };
}
export async function updateModulePermissions(connection, data, context) {
  for (const module of data.modules) await repository.updateModulePermissionsExecuteModulePermissions(connection, data, module, context);
  return {
    role: data.role
  };
}
export async function getProfile(context) {
  const effects = {
    headers: []
  };
  const user = context.user;
  const facility = user.miller_id ? await repository.getProfileFindFacilities(user) : null;
  return {
    body: {
      ok: true,
      data: {
        user,
        facility
      }
    },
    status: 200,
    ...effects
  };
}
export async function updateProfile(connection, data, context) {
  const fields = Object.keys(data);
  await repository.updateProfileUpdateUsers(connection, fields, data, context);
  return {
    id: context.user.id,
    ...data
  };
}
export async function listMillerMasterOptions(context) {
  const effects = {
    headers: []
  };
  const districts = await repository.listMillerMasterOptionsListTblDistrictMaster();
  const blocks = context.query.district_id ? await repository.listMillerMasterOptionsListTblBlockMaster(context) : [];
  const vehicleTypes = await repository.listMillerMasterOptionsListVehicleTypes();
  const transporters = await repository.listMillerMasterOptionsListTransporters(context);
  const vehicles = await repository.listMillerMasterOptionsListVehicles(context);
  return {
    body: {
      ok: true,
      data: {
        districts,
        blocks,
        vehicle_types: vehicleTypes,
        transporters,
        vehicles
      }
    },
    status: 200,
    ...effects
  };
}
