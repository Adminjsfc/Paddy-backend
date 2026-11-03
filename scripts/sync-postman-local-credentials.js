import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

// Keys stay in the local export. Runtime guards never use them for a remote URL.
const runtime = [
  '(function fillRequestHeaders() {',
  " if (pm.request.body?.mode === 'raw') pm.request.headers.upsert({key:'Content-Type',value:'application/json'});",
  " const operationKey = pm.variables.get('retry_key') || pm.variables.get('operation_key') || 'operation-' + pm.variables.replaceIn('{{$guid}}');",
  " pm.variables.set('operation_key', operationKey);",
  " const idempotencyHeader = pm.request.headers.get('Idempotency-Key');",
  " if (idempotencyHeader && idempotencyHeader.includes('{{operation_key}}')) pm.request.headers.upsert({key:'Idempotency-Key',value:pm.variables.replaceIn(idempotencyHeader)});",
  " const authorizationHeader = pm.request.headers.get('Authorization');",
  ' if (authorizationHeader) {',
  '  const authorization = pm.variables.replaceIn(authorizationHeader);',
  "  if (authorization.includes('{{') || /^Bearer\\s*$/.test(authorization)) console.warn('Run the matching Login request first. Its response script saves the token automatically. Core DM/receiver requests require their own core token.');",
  "  pm.request.headers.upsert({key:'Authorization',value:authorization});",
  ' }',
  ' const requestUrl = pm.variables.replaceIn(pm.request.url.toString());',
  " const apiName = /\\/integrations\\/euparjan(?:\\/|$)/.test(requestUrl) ? 'euparjan_api_key' : /\\/gps\\//.test(requestUrl) ? 'gps_api_key' : null;",
  ' if (!apiName) return;',
  " const origin = (requestUrl.match(/^(https?:\\/\\/[^/?#]+)/i)?.[1] || '').toLowerCase().replace('://localhost', '://127.0.0.1');",
  " const localOrigin = String(pm.collectionVariables.get('local_api_origin') || '').toLowerCase().replace('://localhost', '://127.0.0.1');",
  ' const localTarget = Boolean(origin && localOrigin && origin === localOrigin);',
  " const apiValue = String(localTarget ? pm.collectionVariables.get('local_' + apiName) || pm.environment.get(apiName) || '' : pm.environment.get(apiName) || '').trim();",
  " if (apiValue.length < 32 || apiValue.includes('{{') || apiValue.startsWith('replace_')) console.warn('Configure ' + apiName + ' for the selected backend. Local fallback credentials are only used for the configured local origin.');",
  " pm.request.headers.upsert({key:'X-API-Key', value:apiValue});",
  '})();'
];

const directory = new URL('../postman/', import.meta.url);
const collectionPath = new URL('SFC_CMR.postman_collection.json', directory);
const environmentPath = new URL('SFC_CMR.postman_environment.json', directory);
const collection = JSON.parse(await fs.readFile(collectionPath, 'utf8'));
const environment = JSON.parse(await fs.readFile(environmentPath, 'utf8'));
const port = Number(process.env.PORT || 3015);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid local API port');

function setVariable(key, value, description) {
  collection.variable ??= [];
  let variable = collection.variable.find(item => item.key === key);
  if (!variable) collection.variable.push(variable = {key, type:'string'});
  Object.assign(variable, {value, description});
}
setVariable('local_api_origin', `http://127.0.0.1:${port}`, 'Only this local origin may use the bundled local integration credentials.');
for (const [variable, backendName] of [['euparjan_api_key','EUPARJAN_API_KEY'],['gps_api_key','GPS_API_KEY']]) {
  const value = process.env[backendName];
  if (!value || value.length < 32 || value.startsWith('replace_')) throw new Error(`Configure ${backendName} in .env`);
  setVariable(`local_${variable}`, value, 'Local backend credential. Keep this export private. Never used automatically for a remote backend.');
  const entry = environment.values.find(item => item.key === variable);
  if (!entry) throw new Error(`Environment variable ${variable} is missing`);
  Object.assign(entry, {value, type:'secret', enabled:true});
}

const root = collection.event.find(event => event.listen === 'prerequest').script;
const legacyStart = root.exec.findIndex(line => line === '// Resolve integration credentials from the selected environment at send time.');
const runtimeStart = root.exec.findIndex(line => line === runtime[0] || line === '(function fillLocalIntegrationHeaders() {');
const cutoff = legacyStart >= 0 ? legacyStart : runtimeStart;
if (cutoff < 0) throw new Error('Collection integration pre-request script was not found');
root.exec = [...root.exec.slice(0, cutoff), ...runtime];

function updateRequests(items) {
  for (const item of items || []) {
    if (item.item) updateRequests(item.item);
    const url = typeof item.request?.url === 'string' ? item.request.url : item.request?.url?.raw;
    if (item.request?.method !== 'POST' || url !== '{{base_url}}/integrations/euparjan/procurements') continue;
    let event = item.event.find(entry => entry.listen === 'prerequest');
    event.script.exec = [...runtime, "if (pm.request.body?.mode === 'raw') pm.request.body.update(pm.variables.replaceIn(pm.request.body.raw));"];
    item.request.description = (item.request.description || '').replace(/\n\nLocal automatic credentials:[\s\S]*$/, '') + '\n\nLocal automatic credentials: this request fills X-API-Key from the bundled local backend key and generates Idempotency-Key at send time. Selecting an environment is not required for the configured local origin. Remote backends require their own environment credentials. The local export contains credentials; keep it private.';
  }
}
updateRequests(collection.item);
collection.info.description = collection.info.description
  .replace('credentials remain in the environment.', 'login credentials remain in the environment; local integration keys have a collection fallback.')
  .replace('Credentials remain in the environment.', 'Local integration credentials have a collection fallback; remote credentials come from the selected environment.')
  .replace(/\n\nLocal credential fallback:[\s\S]*$/, '') + '\n\nLocal credential fallback: local e-Uparjan/GPS request headers are filled from bundled local credentials for local_api_origin. No environment selection is required for local integration keys. Remote URLs use only their selected environment keys. This export contains local credentials; keep it private.';
await fs.writeFile(collectionPath, JSON.stringify(collection, null, 2) + '\n');
await fs.writeFile(environmentPath, JSON.stringify(environment, null, 2) + '\n');
console.log(`Updated local collection and environment: ${fileURLToPath(directory)}. Credential values are not logged.`);
