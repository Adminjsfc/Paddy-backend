import {z} from 'zod';

// Accept the form's contact field while retaining driver_phone in stored data.
export function withDriverContact(schema) {
  return z.preprocess(value => {
    if (!value || typeof value !== 'object' || Array.isArray(value) || !Object.hasOwn(value,'driver_contact')) return value;
    const {driver_contact,...rest} = value;
    if (rest.driver_phone != null && rest.driver_phone !== driver_contact) return value;
    return {...rest,driver_phone:driver_contact};
  }, schema);
}
