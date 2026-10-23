# API reference

Base URL: `http://127.0.0.1:3015/api/v1`. All request/response bodies are JSON. Postman contains complete runnable request bodies. This document lists the complete exposed route families and important rules.

## Authentication and retry headers

Application APIs accept the HttpOnly `accessToken` cookie or `Authorization: Bearer <token>` after login. An explicitly supplied Authorization header takes precedence. Tokens are random, expiring server-side sessions; only their hashes are stored. Passwords use salted scrypt. User deactivation takes effect on the next authenticated request. Password changes invalidate all current sessions, including refresh credentials.

Protected routes use the service's separate `src/middlewares/verifyJWT.js` middleware, exported as `auth` for existing routes. Despite the shared middleware name with the core backend, CMR tokens remain opaque session tokens, not JWTs. This middleware fetches the active CMR user on every request and sets `req.user` with `id`, `user_id`, `name`, `email`, `role`, `miller_id`, `transporter_id`, and `facility_id`; `req.tokenHash` identifies the current session. Mobile clients can send `Device: mobile` (or an okhttp User-Agent) with `X-Auth-Token: <CMR token>` instead of a cookie. Core-backend JWTs and users are not accepted. Refresh still requires the CMR refresh cookie.

Login sets HttpOnly `accessToken` and `refreshToken` cookies scoped to `/api/v1`, and retains the existing `data.token` response for Postman. Access defaults to 15 minutes (`ACCESS_TOKEN_MINUTES`); refresh defaults to an absolute seven days (`REFRESH_SESSION_DAYS`). Browser cookie storage lasts until refresh expiry, while SQL independently enforces the shorter access expiry. `POST /refresh-token` or `/auth/refresh` renews access using the refresh cookie and returns `{ok:true,status:200,token,data:{token,expires_at}}`. Refresh credentials remain stable until absolute expiry or revocation, allowing concurrent refresh retries; a matching access cookie also retains its token identity. Refresh does not extend the absolute refresh lifetime. Only a refresh cookie can renew access; a bearer token alone cannot.

Frontend-compatible aliases are `POST /multilogin` (email/password login), `/all_userlogout` (logout), and `/changePassword` (same fields as `/auth/password`). Login also returns `status:200`. Logout revokes the current session using either cookie or bearer credentials, including after access expiry, and clears both cookies. Login, refresh, logout and password responses disable caching. Legacy phone/user-ID login, numeric module permissions, OTP endpoints and legacy password field names are not supplied by these aliases.

Browsers must send credentials and use an origin listed in `FRONTEND_ORIGINS` unless served from the API origin. Unlisted origins are rejected, and credentialed CORS preflight is supported. Cookies default to Secure in production and SameSite=Lax; use `COOKIE_SECURE=false` only for local HTTP. SameSite=None requires Secure cookies. Integration/GPS keys remain server-to-server credentials.

Integration endpoints use `X-API-Key: <EUPARJAN_API_KEY>`. GPS push uses the separate `GPS_API_KEY`. These keys must be different and at least 32 characters. Do not put either key in browser/frontend code; they are server-to-server credentials.

All business POST/PATCH mutations require `Idempotency-Key` of 8–120 characters from letters, numbers, `_`, `.`, `:`, `-`. Keep this key and body unchanged when retrying a timed-out operation. Keys are scoped to actor and URL path. Login, logout, password change and GPS ingestion do not require this header; GPS uses its device/timestamp identity. Successful new mutations return HTTP 201; an exact key replay returns HTTP 200 with `replayed: true`. The project intentionally uses the same envelope for create, patch and action mutations.

```http
Content-Type: application/json
Authorization: Bearer <login_token>
Idempotency-Key: 2026-paddy-consignment-0001
```

```json
{"ok":true,"replayed":false,"data":{"id":1},"request_id":"generated-uuid"}
```

Do not automatically reuse the same key for unrelated operations. Idempotency records are retained; any retention policy must be longer than the sender's maximum retry period.

## Role permissions

### Miller portal and module assignment

The frontend CMR entry `/auth/cmr` presents Dashboard, Masters, Reports and Profile using the logged-in CMR session. Masters include scoped transporter, vehicle and GPS-device creation, editing, activation and deactivation. Reports include stock balances, ledger and season-based miller reconciliation. The profile menu includes account editing, change password and logout. A successful password change revokes all sessions and returns the user to login.

The core system's existing module workflow was used as a reference: role assignments control menu visibility and action permissions. CMR stores its own assignments in `module_permissions`, installed by migration `015_miller_modules.sql`; it does not reuse core module IDs or modify the core backend.

| Method/path | Purpose |
|---|---|
| GET `/auth/modules` | Current role's module catalog, groups and `can_view`, `can_add`, `can_edit` flags |
| GET `/module-permissions` | CMR ADMIN: current MILLER assignments |
| PATCH `/module-permissions` | CMR ADMIN: `{role:"MILLER",modules:[{key,can_view,can_add,can_edit}]}`; requires idempotency key |
| GET `/profile` | Current CMR account and its mill details |
| PATCH `/profile` | Update own `name` and/or `email`; requires idempotency key |
| GET `/miller-master-options?district_id=...` | Miller dropdowns for districts, blocks, vehicle types, own transporters and own vehicles |

Module keys are `dashboard`, `transporters`, `vehicles`, `gps-devices`, `stocks`, `ledger`, and `reconciliation`. Seeded MILLER assignments enable views and master creation/editing; report/dashboard assignments are read-only. CMR ADMIN users can change them in the portal's Module assignment tab. Assignments apply to the MILLER role across all millers. Missing or disabled permissions deny mapped operational API actions with HTTP 403 `MODULE_FORBIDDEN`; add/edit also require view access. Existing ownership and business checks still apply. Profile, password and logout remain account capabilities independent of these operational module assignments. There are no hard-delete permissions or endpoints.

| Action | Admin | SFC operator | Miller | Transporter |
|---|---|---|---|---|
| Create/deactivate users | Yes | No | No | No |
| Create/edit seasons, farmers, sites and tags | Yes | Yes | No | No |
| Register transporter | Yes | Yes | Own miller | No |
| Register/edit vehicle and GPS profile | Yes | Yes | Own miller | Own transporter |
| Allocate/cancel a shipment | Yes | Yes | Own miller | No |
| Dispatch | Yes | Yes | Own miller | Own vehicles |
| Accept paddy | Yes | Yes | Own miller after GPS arrival | No |
| Record milling | Yes | Yes | Own miller | No |
| Accept SFC/FCI rice | Yes | Yes | No | No |
| Manual GPS override | Yes, reason required | Yes, reason required | No | No |
| View vehicle/trip tracking | All | All | Own miller | Own vehicles |
| View stock/reconciliation | All | All | Own miller | No |
| View complete farmer/receipt details | Yes | Yes | No | No |

`OPERATOR` is an SFC-wide role in this version; it is not restricted to a district or godown. Miller/transporter restrictions are enforced on server-side queries, not just on UI visibility.

## Users and health

| Method | Path | Notes |
|---|---|---|
| GET | `/health/live` | Outside `/api/v1`; process liveness |
| GET | `/health/ready` | Outside `/api/v1`; DB and migration readiness |
| POST | `/auth/login` | `{email,password}` → token and expiry |
| GET | `/auth/me` | Current identity |
| POST | `/auth/logout` | Revoke current token |
| POST | `/auth/password` | `{current_password,new_password}`; log in again afterwards |
| POST | `/users` | Admin: `{name,email,password,role,miller_id?,transporter_id?}` |
| GET | `/users` | Admin; up to 200 users |
| PATCH | `/users/:id/status` | Admin: `{active:false}`; cannot deactivate self |

Minimum password length is 12. `ADMIN`/`OPERATOR` accounts have null entity scopes; `MILLER` requires `miller_id`; `TRANSPORTER` requires both a matching miller and transporter.

## Registration and master data

### Current DM setup and direct vehicles

Core DM users open **Masters → CMR setup** in the shared frontend. The page reuses the existing core login, with server-side DM district validation. CMR setup provides depot assignment, CMR order creation, direct Miller vehicle/GPS registration, and an optional test-rice entry tab. It uses the core Users module's existing Add-page permission for frontend routing; CMR independently verifies the active DM and district scope.

All following routes use `/api/v1/core/dm` and a verified core access bearer token:

| Method/path | Body/purpose |
|---|---|
| GET `/options` | Scoped millers, receiving depots, assignments, orders, rice balances, vehicles and vehicle types |
| POST `/assignments` | `{miller_id,season_id,store_id}` |
| POST `/orders` | `{miller_id,season_id,destination_id,order_no,rice_quantity,due_date}`; requires an active assignment |
| POST `/vehicles` | `{miller_id,vehicle_type_id,registration_no,capacity,imei,provider}`; creates a direct vehicle and GPS device atomically |
| POST `/test-rice` | `{miller_id,season_id,reference,quantity}`; enabled only by `ENABLE_CMR_TEST_SETUP=true` |

POST requests require `Idempotency-Key`. Source millers and receiving depots must be within the DM's assigned districts. Test rice uses a unique reference, `test_stock_entries` and a `TEST_RICE` ledger entry; it does not pretend to be procurement or milling production. The environment example defaults this feature to disabled. It is enabled in the local testing configuration for the requested interim workflow.

Migration `019_direct_miller_vehicles.sql` adds `vehicles.miller_id`, backfills existing ownership, and makes `transporter_id` nullable. Current UI registration uses `miller_id` directly; GPS, shipment and vehicle ownership queries support this path. Transporter code and legacy payloads remain supported but are hidden from the current Miller portal. Vehicle ownership cannot be changed through profile edits.

`npm run db:seed-cmr-test` creates the requested local sample for Miller `m001`: an assignment, `SAMPLE-CMR-M001` order for 50 QTL, a one-time 100-QTL rice test entry, direct 10-MT vehicle `JH01CMR0001`, and a test-only GPS record. It uses the latest active season and a valid imported SCMR depot in the Miller's district. Reruns do not duplicate the sample order, stock or vehicle. The GPS record is not live hardware, and the seed does not dispatch anything.

### Combined Miller registration

`POST /millers/register` requires a CMR ADMIN session and `Idempotency-Key`. Send `{facility: {...}, user: {name,email}}` without a facility `code`. The backend generates a unique `MILL-<UUID>` code and returns it as `miller_code`; client-supplied codes are rejected. Existing codes remain unchanged. The remaining `facility` fields follow the facility creation schema with `kind: "MILLER"`, numeric `district_id` and `block_id`, and explicit capacity units. The backend sets the initial Miller password to `123456789` and stores its salted hash; the registration request must not include a password. Facility creation, login creation, and idempotency recording share one transaction; either all succeed or none do. The response contains `id` (user ID), `facility_id`, `miller_id`, `miller_code`, `email`, and `role`.

The frontend Add User page switches to the CMR registration form when Miller is selected. Other user types continue through the core service. The Miller form reuses the district objects already loaded on the Add User page (`{id,district_name}`), preselects the DM's district, and immediately requests location options using `district_id` to retrieve the matching blocks. A single assigned district is read-only. Multiple assigned districts remain selectable; backend authorization always checks the current core assignments.

Core DMs use `POST /core/millers/register` and `GET /core/location-options?district_id=...` with their core access JWT in `Authorization: Bearer ...`. Enable this integration using `CORE_DM_ENABLED=true`, `CORE_JWT_ACCESS_SECRET`, and the separate `CORE_DB_*` connection settings. Only HS256 access JWTs with an expiry are accepted. The service fetches the active core user, requires `user_type=3`, and reads active assignments from `tbl_user_districtwise_store_assignment`. The dropdown returns assigned districts only; both location queries and registration reject a district outside that scope with HTTP 403. Core and CMR location master IDs must represent the same districts. Unknown/inactive users and expired/invalid tokens are rejected. This does not grant core users access to other CMR APIs.

The RTK client refreshes an expired core token through the existing core backend's `refresh-token` endpoint, then retries the CMR registration request with the same idempotency key. CMR sessions continue to use CMR refresh. The core token is not exchanged for a local ADMIN account. Audit entries use `core-dm:<core user ID>`. For facilities created by a core DM, `created_by_core_user_id` stores the verified core user ID and `created_by_user_type` stores the database-verified user type (`3` for DM). The local `created_by` foreign key remains null for external actors. These creator fields are assigned by the backend and cannot be supplied in the registration payload. Existing records retain null values in the new columns. No core user ID is stored as a CMR user ID. Core superadmin/operator types are not implicitly authorized by the DM endpoint.

Each of the following supports `POST /resource`, `GET /resource`, `GET /resource/:id`:

| Resource | Required create fields; optional fields follow semicolon |
|---|---|
| `/seasons` | `code,name,start_date,end_date`; `recovery_percent` defaults 68 |
| `/farmers` | `code,name,village,district`; `phone` |
| `/facilities` | `code,kind,name,address,district,block,latitude,longitude,capacity`; `radius_m=200,contact_name,phone,milling_capacity_per_day,recovery_percent` |
| `/route-tags` | `season_id,source_id,destination_id`; creator user and creation date are recorded |
| `/transporters` | `miller_id,code,name,contact_name,phone,address` |
| `/vehicles` | `transporter_id,registration_no,capacity,driver_name,driver_phone` |
| `/gps-devices` | `vehicle_id,imei,provider`; `model,sim_no` |

Master lists use `page=1&limit=50` (maximum 200). `code` filters apply to seasons/farmers/facilities/transporters; facilities also accept `kind`. Foreign key fields are JSON numbers, not strings. Phone and IMEI fields are strings. `capacity`, `milling_capacity_per_day`, transaction `quantity`, `rice_quantity`, `paddy_quantity`, and `accepted_quantity` share this structure:

`GET /route-tags` is the UI assignment-list API. It returns PACS/LAMPS, Miller/store, season, district, active state, `created_by`, `created_at`, `unassigned_by`, and `unassigned_at`. It accepts `season_id`, `source_id`, `destination_id`, `active`, `page`, and `limit` filters.

`GET /route-tag-assignment-options` returns UI dropdown data for active seasons, PACS/LAMPS facilities and Millers. Unassign a PACS/LAMPS-to-Miller mapping through `PATCH /route-tags/:id/status` with `{ "active": false }`.

General master records carry audit fields. New records store `created_by` and `created_at`; profile updates and activation/deactivation store `updated_by` and `updated_at`. Route and Miller-store assignments use `created_by`, `created_at`, `unassigned_by`, and `unassigned_at` instead. The actor fields refer to the authenticated session user. Existing records retain null actor fields when their original creator is unavailable.

```json
{"value":"100.000","unit":"QTL"}
```

`kind` values: `PACS`, `LAMPS`, `MILLER`, `SFC_GODOWN`, `FCI`. Coordinates must be JSON numbers and fall in their valid geographical ranges. Radius is an integer, 10–10,000 metres. Daily milling capacity and recovery override are allowed only for millers. `capacity` is storage capacity, not a procurement target.

### Editing

| Method/path | Fields |
|---|---|
| PATCH `/facilities/:id` | name, address, district, block, latitude, longitude, radius_m, capacity, milling_capacity_per_day, recovery_percent, contact_name, phone, active |
| PATCH `/seasons/:id` | recovery_percent, active |
| PATCH `/farmers/:id` | name, phone, village, district |
| PATCH `/transporters/:id` | name, contact_name, phone, address |
| PATCH `/vehicles/:id` | driver_name, driver_phone, capacity |
| PATCH `/gps-devices/:id` | provider, model, sim_no |
| PATCH `/{farmers,transporters,vehicles,gps-devices,route-tags}/:id/status` | active boolean |

Codes, facility kinds, historical ownership links and GPS IMEI/vehicle links are immutable through these profile APIs. There are no hard-delete endpoints. Do not deactivate a transporter/vehicle/GPS device with an active shipment. Capacity cannot be reduced below current stock or the vehicle's active load. Existing shipment geofences remain unchanged when a facility location is corrected.

### Miller-to-store assignments

An admin/operator can assign the same miller to multiple stores, including stores in different districts. Each assignment is for one season and one `SFC_GODOWN` or `FCI` facility; its district comes from the store's `facilities.district` value.

| Method/path | Body or filters |
|---|---|
| POST `/miller-store-assignments` | `{season_id,miller_id,store_id}`; records the authenticated creator and assignment date |
| GET `/miller-store-assignments` | UI list with optional `season_id,miller_id,store_id,district,active,page,limit` filters |
| GET `/miller-store-assignment-options` | UI dropdown data: active seasons, Millers and SFC Godown/FCI stores |
| PATCH `/miller-store-assignments/:id/status` | `{active:false}` records the authenticated unassigner and date; `true` reactivates it |
| GET `/reports/store-assignments` | Assignment report with optional `season_id,miller_id,store_id,district,active,page,limit` filters |

CMR order imports and CMR shipment creation require an active assignment for the order's season, miller and destination store. Each assignment carries `created_by`, `created_at`, `unassigned_by` and `unassigned_at`. Existing assignments based on Miller-to-store route tags are copied by migration `002_miller_store_assignments.sql`. Deactivating an assignment does not cancel orders or shipments already created.

## Push integration

| Method/path | Authentication | Body |
|---|---|---|
| POST `/integrations/euparjan/procurements` | Integration key | `{records:[procurement_record]}` |
| POST `/integrations/euparjan/cmr-orders` | Integration key | `{records:[cmr_order_record]}` |
| POST `/integrations/euparjan/masters/farmers` | Integration key | Same as farmer registration |
| POST `/integrations/euparjan/masters/facilities` | Integration key | Same as facility registration |
| POST `/integrations/euparjan/masters/route-tags` | Integration key | Same as tag registration |

Master push creates records; it does not silently upsert or overwrite existing coordinates. Create the season first through an operator/admin. See [EUPARJAN_CONTRACT.md](EUPARJAN_CONTRACT.md).

## Procurement, milling and CMR

| Method/path | Body or filters |
|---|---|
| GET `/procurements` | Filters: season_id, facility_id, farmer_id, external_ref, page, limit; SFC roles only. Farmer data is optional. |
| GET `/procurements/available-lots` | Required facility_id and season_id; returns IDs/available quantities without farmer PII; tagged millers allowed |
| GET `/cmr-orders` | Filters: season_id, miller_id, status, external_ref, page, limit |
| PATCH `/cmr-orders/:id` | rice_quantity and/or due_date, plus reason; admin/operator |
| POST `/cmr-orders/:id/cancel` | reason; only with zero commitments and deliveries |
| POST `/milling-batches` | miller_id, season_id, batch_no, paddy_quantity, milled_at; optional rice_quantity, remarks |
| GET `/milling-batches` | Filters: miller_id, season_id, page, limit |

## Shipment APIs

### Single-vehicle CMR submission

The Miller portal's CMR tab includes a submission form. Select a season, destination district, Scheme type, depot, open order and registered vehicle. Scheme type is the second field: SCMR selects active core stores with `store_type=2`; CCMR selects `store_type=1`. Stores are filtered by `district_id` from the locally imported `tbl_store_location_master` catalog in the CMR database. Vehicle lookup runs automatically after typing. Quantity is entered in quintals; vehicle type, capacity and net weight are not shown as form fields. Rice stock, order balance and vehicle capacity are validated again inside the reservation transaction. A GPS device must be registered and active. One vehicle may have only one active consignment.

| Method/path | Purpose |
|---|---|
| GET `/cmr/submission-options?season_id=...&district_id=...&scheme_type=SCMR` | MILLER: active seasons/districts, core stores filtered by district and scheme, own eligible orders, and own available rice stock |
| GET `/cmr/vehicle?registration_no=...` | MILLER: own active vehicle, vehicle type, capacity, transporter, active-GPS and busy flags |
| POST `/cmr/submissions` | MILLER: save and reserve one CMR consignment; requires idempotency key and CMR module add permission |

Submission body: `season_id`, `order_id`, `destination_id`, `district_id`, `store_location_id` (core store ID), `scheme_type` (`SCMR`/`CCMR`), `vehicle_id`, `quantity:{value,unit}`, `submitted_on` (YYYY-MM-DD), `lot_count`, `stenciling_code`, `gunny_bag_year`, `gunny_bag_type`, `total_bags`, `driver_name`, `driver_phone`, and optional `remarks`. The frontend sends quantity in `QTL`. CMR continues to consume rice stock internally; scheme type selects a separate RICE balance. Submission dates cannot be in the future. The backend derives the miller/source identity, generates the consignment number, derives receiving agency from the SFC/FCI destination, and snapshots the vehicle type. Gunny-bag type is a validated text value until an authoritative type master is supplied. Lot count is submission metadata, not incoming procurement-lot allocation.

Migration `016_cmr_submission.sql` adds submission and packaging columns to `shipments`, and seeds the MILLER `cmr` module. Existing consignments retain null values in the new columns. CMR ADMIN can assign View/Add permissions through module assignment. No dispatch happens on submission: status is `PLANNED`, physical stock is unchanged, `reserved_g` and the CMR order commitment increase. The existing cancellation workflow releases these reservations. GPS-based dispatch from PLANNED is deferred; this change does not implement or alter dispatch/geofence transitions. Existing manual dispatch APIs remain available to their existing authorized roles.

| Method/path | Required body or filters |
|---|---|
| POST `/shipments` | shipment_no, leg, season_id, miller_id, source_id, destination_id, vehicle_id, quantity; CMR requires order_id; paddy may include lots; optional remarks |
| POST `/shipments/:id/dispatch` | dispatched_at, receipt_no |
| POST `/shipments/:id/deliver` | delivered_at, accepted_quantity, receipt_no; remarks required for shortage; gps_override_reason required for operator acceptance without ARRIVED state |
| POST `/shipments/:id/cancel` | reason; PLANNED only |
| GET `/shipments` | Filters: season_id, miller_id, vehicle_id, status, leg, order_id, page, limit |
| GET `/shipments/:id` | Consignment, all event records and procurement-lot links |

`leg` is `PADDY` or `CMR`. Lot format:

```json
[{"procurement_id":1,"quantity":{"value":100,"unit":"QTL"}}]
```

Receipt accepts the entire consignment once. An accepted quantity below dispatch weight is a shortage, not a still-open partial unloading. `accepted_quantity` may be zero with shortage remarks; the missing cargo is not automatically returned to source stock. Quantities above dispatch are rejected.

## GPS and reports

| Method/path | Behavior |
|---|---|
| POST `/gps/packets` | GPS key; `{packets:[...]}`; 1–500 packets, strict fixed coordinates/time, HTTP 207 for partial failures |
| GET `/vehicles/:id/location` | Last device position, GPS timestamp, active/stale flags |
| GET `/vehicles/:id/history?from=...&to=...` | At most seven-day window; page/limit; includes raw packet payload |
| GET `/reports/stocks` | Filters: season_id, facility_id, commodity, page, limit |
| GET `/reports/ledger` | Same filters; immutable stock movement rows |
| GET `/reports/millers/:id/reconciliation?season_id=...` | Paddy receipts, rice obligations, actual production, delivery, shortages, stock and order balances |
| GET `/reports/dashboard` | Optional season_id; counts/quantities by leg/status and up to 200 stale GPS trip alerts |
| GET `/reports/audit` | Admin only; mutation metadata with actor, action and request ID; page/limit |

```json
{
  "packets":[{
    "imei":"860000000000001",
    "gps_at":"2026-10-09T10:00:00Z",
    "latitude":23.40,
    "longitude":85.40,
    "speed_kph":0,
    "gps_fix":true,
    "packet_type":"PVT",
    "raw":{"provider_packet":"optional original data"}
  }]
}
```

## Errors and pagination

Errors use `{ok:false,error:{code,message},request_id}`. Common statuses:

- 400: invalid fields, units, time format, missing idempotency key.
- 401: bad token or integration key.
- 403: role/ownership denied.
- 404: unknown or out-of-scope entity.
- 409: duplicate/conflicting reference, insufficient stock, overloaded capacity, order over-allocation, invalid state, missing GPS arrival.
- 413: body over 2 MB.
- 429: HTTP request rate exceeded; respect retry headers.
- 503 `TRANSACTION_BUSY`: lock retry limit reached; retry with the same body/key.

Lists return `{page,limit,total}` under `pagination`. Fetch pages until all records are retrieved; do not assume the first page is a full export. Unknown JSON body fields are rejected to expose mapping mistakes. Date-only fields use `YYYY-MM-DD`; timestamps require a timezone. Backdated records update current inventory, not a reconstructed historic balance.

Migration `017_cmr_scheme_stores.sql` adds `core_store_location_id` to shipments and nullable `facilities.core_store_id`. Its original shipment `scheme_type` column is replaced by `scheme_id` in migration 039. Core store IDs are independent of CMR facility IDs. An active core store must match the order destination by explicit `core_store_id`, or by an unambiguous exact store code plus district and facility kind. ADMIN/OPERATOR can link a receiving facility using `PATCH /facilities/:id` with `{core_store_id:<core store ID>}` and an idempotency key; the backend validates the active core store district/type. A store without a matching CMR facility/order remains visible but cannot submit until provisioned and assigned. No receiving facilities, capacities or geofences are guessed or created from source store metadata. Migration `018_store_location_master.sql` creates the local `tbl_store_location_master` table if missing, matching the imported source schema and preserving existing records. Store dropdowns and validation use the CMR database pool; store lookup no longer requires a core database connection. Import authoritative records separately, preserving source IDs.

DM Paddy setup uses the existing core DM session and district restrictions:
- `GET /api/v1/core/dm/paddy/options`: active PACS/LAMPS, Millers, seasons and the latest 200 mappings within the DM districts.
- `POST /api/v1/core/dm/paddy/facilities`: create a PACS/LAMPS facility. Uses the facilities payload without `code`; only `PACS` and `LAMPS` kinds are accepted. Codes are generated on the backend. Capacity uses the standard quantity object. District/block and operational location fields are validated. This creates a facility, not a login account.
- `POST /api/v1/core/dm/paddy/assignments`: `{season_id, source_id, destination_id}` where source is PACS/LAMPS and destination is Miller. Both facilities must be active and within the DM districts. Uses existing season-based `route_tags`; saving an existing mapping reactivates it. Multiple mappings follow existing route-tag rules.

In DM login, open Paddy ? Add LAMPS / PACS or Map to Miller. Existing farmer integration remains optional; this setup does not add procurement stock or dispatch vehicles.

CMR receiving for core AGM (user_type 4) and Lifting Incharge (user_type 8)

These endpoints use the existing core bearer session, independently of CMR Miller sessions. CMR verifies the active user and active district/store assignment pairs against the core database with read-only queries. Receiving is restricted to facilities explicitly linked by `core_store_id` to those assigned stores; district access alone grants no receiving access. The core backend is unchanged.

- `GET /api/v1/core/receiving/shipments?page=1&limit=20&status=ARRIVED`: planned and shipped CMR with receipt decisions. Cancelled shipments are excluded. Status filter is optional.
- `GET /api/v1/core/receiving/shipments/:id`: shipment, recorded receipt and stacks.
- `POST /api/v1/core/receiving/shipments/:id/receive`: final acceptance or rejection; requires Idempotency-Key.
- `GET /api/v1/core/receiving/stock?page=1&limit=20`: accepted stack records, cumulative accepted quantity and current rice stock balances for the assigned stores.

Receiving payload example:
```json
{
  "decision": "ACCEPTED",
  "receipt_no": "CMR-RCV-001",
  "received_at": "2026-10-20T10:00:00+05:30",
  "stacks": [{"stack_no":"A1","received_quantity_qtl":"289.43740","bags":580}],
  "gross_weight_kg": "29280.140",
  "empty_bag_weight_kg": "0.580",
  "red_grains_percent": 0,
  "chalky_grains_percent": 1,
  "moisture_percent": 12,
  "broken_rice_percent": 5,
  "other_standards": "Officer verified applicable prescribed specifications",
  "compliance_confirmed": true,
  "remarks": "",
  "gps_override_reason": null
}
```
The example is illustrative; it must fit the selected shipment's dispatched quantity and transport dates. Stack quantities support five decimal places in QTL (one gram); weights support three decimal places in kg. Server calculates total bags, total tare, net rice and shortage with integer grams. Stack rice must equal net rice. Net rice cannot exceed dispatched quantity; shortage needs remarks. GPS arrival is required unless an assigned officer supplies a reason of at least ten characters.

Quality percentages are recorded (0�100, up to two decimal places). No automatic thresholds are invented. An officer must explicitly confirm compliance before acceptance. Acceptance records stacks and quality, marks the shipment DELIVERED, credits only net rice to the receiving stock, releases the full order commitment and credits the accepted amount to delivered quantity, atomically. Duplicate reviews are blocked and idempotency replay cannot double-credit stock.

Rejection requires a reason of at least ten characters, records all measurements, and adds no rice to stock. The existing transport status and vehicle allocation remain pending return resolution; a return workflow is not implemented by this receiving screen. Generic delivery also refuses rejected shipments. Rejected stacks are excluded from received stock. Existing delivery records without this analysis remain visible as DELIVERED but do not acquire invented stack records.

Migration: `020_cmr_receiving.sql`. Rollback-only database validation: `node --env-file-if-exists=.env scripts/validate-cmr-receiving.js`.

LAMPS/PACS registration now requires `email` in the existing `POST /api/v1/core/dm/paddy/facilities` payload. It creates the facility and its linked user atomically. The account uses the facility name (or contact person), matching PACS/LAMPS role, and `facility_id`. Default password is `123456789`, stored as a salted scrypt hash. Duplicate login emails fail the transaction. The response additionally includes `user_id`, `email`, and `role`. Existing facility-only records do not gain login accounts automatically.

Paddy lifting uses eUparjan procurement stock and an active season-specific PACS/LAMPS-to-Miller route mapping. No Paddy release order is required or accepted. PACS/LAMPS users may create PADDY shipments only from their own facility. Available procurement lots are reserved automatically (oldest first) unless explicit lots are supplied; dispatch deducts stock and lots. CMR continues to require its existing CMR order and matching scheme rice stock.

PACS/LAMPS lookups: GET /api/v1/paddy/lifting-facility returns the logged-in source; GET /api/v1/paddy/lifting-millers?season_id=... lists active mapped millers; GET /api/v1/paddy/lifting-vehicles?miller_id=...&season_id=... returns that mapped miller's active vehicles. The former /paddy/release-orders endpoint and RO seed command have been removed. Migration 036 removes paddy_release_orders and shipments.release_order_id. Nonempty historical RO records and links are moved to archive tables before removal.

Paddy mapped-source and lifting-summary responses report procured_g, on_hand_g, reserved_g, available_g and lifted_g; liftable_g and remaining_g use unreserved stock. Source stock is shared across mapped millers, not a separate allotment per miller. CMR summary fields retain their existing meaning.

Scheme/commodity update: procurement imports require scheme_code and commodity_code=PADDY; CMR order imports require scheme_code and commodity_code=RICE. Common shipment creation and milling require scheme_code. DM CMR order creation and test-rice entry also require scheme_code. CMR submission keeps scheme_type and derives its balance scheme from it. All use active master codes.

Stock and ledger reports accept scheme_code and commodity filters. PACS/LAMPS can read only their own facility balances/ledger; Miller remains scoped to its own facility. Paddy mapped sources, available lots and lifting summaries return scheme_code and optionally filter it; CMR summaries group by scheme as well. CMR submission options return orders and rice_stock for the selected scheme_type.

Migration 035 replaces procurement.scheme_code and procurement.commodity with required scheme_id and commodity_id foreign keys referencing schemes(id) and commodities(id). Sync payloads continue to use scheme_code/commodity_code; the API resolves them to master IDs. Procurement listing and available-lot responses include IDs and joined codes; filters support scheme_id and commodity_id.

Migration 037 normalizes stocks and stock_ledger to scheme_id/commodity_id foreign keys. stocks now has an auto-increment id and unique (facility_id,season_id,scheme_id,commodity_id) balance key. Both tables expose created_at, created_by, updated_at, updated_by and status (1 active, 0 inactive), with created_by_actor/updated_by_actor identifying integration, local user, core user or system actors. Local user IDs reference users; non-local actors have NULL local IDs. Stock mutations update modified audit fields; ledger entries remain append-only, so their updated fields stay NULL. Inactive stock rejects movements. No manual balance/ledger edit or status-toggle API is introduced.

Historical stocks derive creation/update times from the earliest/latest matching ledger timestamp when available; missing historical actors/times remain NULL. Existing ledger IDs/timestamps and stock quantities/reservations are preserved. Stock/ledger reports still expose joined scheme_code/commodity names for clients and support scheme_id, commodity_id and status filters.

Migration 039 normalizes shipments to required `scheme_id`/`commodity_id` foreign keys and a nullable `vehicle_type_id` snapshot. It removes `scheme_code`, `scheme_type`, `commodity_type` and `submitted_vehicle_type` from storage after validating and backfilling existing rows. The vehicle type snapshot preserves the submitted type when a vehicle master is subsequently edited. Conflicting historical schemes, commodities or ambiguous vehicle-type names stop the migration without dropping labels. Requests keep their existing code fields; shipment responses include master IDs and joined `scheme_code`, `commodity_code`, `vehicle_type` labels. Shipment lists support `scheme_id` and `commodity_id` filters as well as `scheme_code`. `submitted_on` is the CMR submission date and `cmr_lot_count` is the submitted lot count; both remain CMR metadata and are nullable for Paddy lifting. There is no `submitted_count` column.

Procurement/CMR import errors name only the failed field and supplied value. Missing/inactive masters and lifting mappings return specific codes (SCHEME_NOT_FOUND, COMMODITY_NOT_FOUND, SEASON_NOT_FOUND, PADDY_SOURCE_NOT_FOUND, PADDY_MAPPING_NOT_FOUND, CMR_MAPPING_NOT_FOUND, VEHICLE_NOT_FOUND, GPS_DEVICE_NOT_FOUND). Messages include the supplied field/reference; insufficient stock includes the facility/season/scheme and available/requested QTL. Procurement quantity conflicts report stored/received QTL.

Procurement correction: PATCH /api/v1/procurements/:id (ADMIN/OPERATOR), or PATCH /api/v1/integrations/euparjan/procurements/:id (integration key). Body: optional external_ref, optional quantity, required reason (3-500 characters); at least one editable field is required. quantity is the corrected total. Both routes require Idempotency-Key. Response includes stable id, external_ref, quantity_g, available_g, reserved_g, updated and (for a change) correction_id. Migration 038 adds persistent reference history and correction audit. Quantity below dispatched+reserved fails with PROCUREMENT_QUANTITY_IN_USE; another record's reference fails with EXTERNAL_REF_CONFLICT. Stock/ledger adjust by the difference within the same transaction.

Driver details: POST /shipments accepts optional driver_name and driver_phone together and saves them immediately on the PLANNED shipment. Creation response includes both fields. Dispatch reuses saved values if omitted, or accepts replacement values; both are required by dispatch time. Existing PLANNED shipments without driver details can supply them in the dispatch request. The contact API field is driver_phone. No schema migration is required.

Migration 040 adds `shipments.trip_status` (0 not started, 1 started, 2 completed), `trip_started_at`, `trip_completed_at` and `expected_completion_at`. GPS departure sets status 1 and the actual start time; GPS destination arrival sets status 2 and the first completion time. Dispatch keeps trip status 0 until departure. Trip completion records physical arrival; shipment delivery/stock acceptance remains a separate action. Actual times use the GPS event timestamp and are preserved across later packets and delivery. An authorized delivery with a missing-GPS override sets trip status 2 and uses delivery time only if an arrival/completion time is unavailable; an unknown start remains NULL. Existing trips are backfilled from departure/arrival/delivery evidence without inventing actual or expected times. Cancelled planned shipments retain trip status 0; shipment status still distinguishes cancellation.

Common shipment creation and the CMR submission form accept optional `expected_completion_at` as an ISO datetime with an explicit timezone offset (for example `2026-10-22T18:30:00+05:30`), or NULL. Dispatch can set/replace it; omission retains the stored estimate and explicit NULL clears it. At dispatch the estimate cannot precede `dispatched_at`. It is a supplied estimate; no travel duration is inferred from coordinates. All timestamps are stored in UTC to seconds. Clients cannot set `trip_status`, `trip_started_at` or `trip_completed_at` directly. Shipment detail/list, CMR receiving lists and vehicle dashboard expose these trip fields. `GET /shipments?trip_status=0` filters not-started trips; allowed values are 0, 1 and 2.
