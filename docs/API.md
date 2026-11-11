# API reference

GET /api/v1/cmr/orders uses season_id, destination_id and optional district_id, scoped to the logged-in Miller and active assignments. It has no scheme filter; legacy scheme_type/scheme_code inputs are ignored. All eligible scheme orders are returned with each row's scheme_code, and rice_stock aggregates balances across schemes for that Miller/season. Store dropdowns and shipment submission retain their scheme behavior. Postman's Order Number Dropdown omits scheme_type.

POST /api/v1/shipments/:id/deliver no longer requires the client to send Idempotency-Key. It still requires a valid authenticated session and the normal ARRIVED/receiving checks. Server-side transaction locking prevents double delivery. If an existing client sends a valid Idempotency-Key, identical retries retain the previous replay behavior. Other mutation endpoints still require their keys. Both Postman collections omit the header from delivery requests.

GET /api/v1/shipments includes explicit `lifted_quantity_kg` (dispatched quantity, null before dispatch) and `received_quantity_kg` (actual accepted quantity, null before delivery/receipt) on each list item. Both are numeric KG values when available, and a received quantity of zero remains 0. Existing quantity_kg and accepted_kg fields remain available for existing clients.

Driver mobile reports (Paddy DRIVER login, no integration key/Idempotency-Key):

| POST path under /api/v1 | Body | Response |
| --- | --- | --- |
| /driver_detailsList | {} | Driver profile and non-cancelled Paddy total_trips. Unstored document/profile fields are null. |
| /active_tripList | {} | Most recently started own Paddy trip with trip_status=1, excluding CANCELLED, or data:null. |
| /getTripDetailsForDriver | {"page":1,"limit":20} | Own non-cancelled Paddy trips with count and pagination. Optional trip_id selects one; an unavailable/other-driver trip returns 404. |
| /alert_report_for_driver | {"page":1,"limit":20} | Own persisted GPS Offline and ETA Delayed alerts with count/pagination. |

All four accept optional driver_id only when it matches the authenticated user. Reports support optional from_date/to_date (YYYY-MM-DD, inclusive UTC dates) and trip_id. Trip history dates filter trip_started_at, falling back to dispatch/creation. Quantities use KG, distances KM, route durations minutes, timestamps ISO UTC. No subtrips, gatepass or invented core IDs are returned. Receiving fields remain null until actual receipt, and zero receipts remain zero. When one shipment has several procurement lots, procurement_lots preserves them; active response ro_id/ro_sio_number are only populated for a single lot.

The backend scans active, assigned Paddy shipments once per minute and stores alerts in the existing shipment_events table, with one event per stale-GPS/ETA episode and driver. GPS_STALE_MINUTES defaults to 15. Alert report requests also scan that driver's current trips before reading history. History starts when monitoring is enabled and remains after trip completion. Past outages before monitoring cannot be reconstructed. Ignition ON/OFF is not supported because normalized ignition data is unavailable. escalation_role is null because no escalation assignment exists. Driver phone/document values are never fabricated; generated @drivers.invalid login addresses are returned as null email.

Driver Paddy summary: `POST /api/v1/tripsummary_for_driver` with a Paddy DRIVER session and `{}` returns `{ "ok": true, "data": { "total_trips": 3, "active_trips": 1, "completed_trips": 2 } }`. Counts use the authenticated user's shipments (`driver_user_id`), `leg='PADDY'`, excluding CANCELLED. Active means trip_status=1, completed means trip_status=2. Pending trip_status=0 contributes to total only. No trips returns numeric zeros. Optional driver_id must equal the logged-in driver ID or returns 403. The existing BackendApiJSFC endpoint is unchanged.

Both Postman collections contain a Driver folder: set driver_phone/driver_password and send Driver Login to save driver_token/driver_id. Then run summary, assigned Paddy trips, active/completed lists or trip details. GET /shipments supports exclude_cancelled=true|false with the existing leg/trip_status filters. The summary is read-only and requires no Idempotency-Key or integration key.

CMR push `POST /api/v1/integrations/euparjan/cmr-orders` now takes numeric `season_id`, `miller_id` and `destination_id` directly in each record. They are saved as supplied without linked-master checks. `season_code`, `miller_code` and `destination_code` were removed from the CMR input and cmr_orders table by migration 090. Procurement retains its separate code-based input. IDs are required for new CMR records. Older unresolved non-sample rows, if any, can retain NULL IDs until explicitly corrected.

Push APIs at `/api/v1/integrations/euparjan` insert into the original tables without requiring existing Season, PACS/LAMPS, Miller, farmer or depot masters. Migrations 088–089 remove master foreign keys from procurement, cmr_orders, route_tags and miller_store_assignments and preserve submitted codes directly on procurement/CMR rows. Unknown code references leave local IDs NULL. Existing matching masters can resolve IDs. Missing assignments, season date ranges and mismatched master districts no longer block push imports. Operational shipment/stock workflows still need valid local masters and mappings. Unlinked procurement does not credit stock automatically or automatically relink when a master is created later.

POST `/masters/route-tags` and `/miller-store-assignments` in the integration namespace accept numeric IDs without parent lookups and reject duplicate mapping combinations. Normal admin master/assignment routes retain their validation. Procurement RO numbers, CMR order numbers and external references remain unique. Same-reference identical procurement/CMR imports are acknowledged as duplicates without inserting again, and Idempotency-Key retries replay. Basic payload types, numeric IDs, dates and kg quantity validation remain required. There is no testing mode or separate testing table. The existing Postman Push APIs folder includes standalone sample values and does not require loading saved setup.

expected_completion_at is server controlled for Paddy and CMR. Shipment creation, CMR submission and dispatch reject this input. ETA stays NULL while PLANNED/DISPATCHED (trip_status=0), and is calculated from actual trip_started_at plus shipment_routes.duration_minutes when GPS/trip processing starts the trip. The database/response field remains available for tracking after start. Migration 085 clears historical pre-start estimates without changing started trips.

GET /cmr/districts is independent: no season_id or scheme_type is required or used. It returns all active tbl_district_master rows as data.districts (id/district_name), including districts with no Miller-depot mapping. Authentication remains required. Store/order eligibility is validated separately in subsequent requests. The dedicated district dropdown and only=districts mode share this behavior.

CMR dropdowns can use GET /cmr/submission-options with `only=base` (seasons/schemes/commodities), `only=districts&season_id=...`, `only=stores&season_id=...&district_id=...&scheme_type=SCMR`, or `only=orders&season_id=...&destination_id=...&scheme_type=SCMR`. Order-only responses contain orders/rice_stock and do not access core stores. Orders are scoped to the logged-in Miller and selected destination; optional district_id further filters them. Omitting only preserves the existing combined response. Season is required for specific dropdowns; district is required for stores and destination for orders.

POST /shipments/:id/deliver accepts only the flat body `{"value":1000,"unit":"KG","received_bags":10}`. delivered_at is generated by the server inside the idempotent transaction and returned in the response. receipt_no, gps_override_reason, delivered_at and remarks are rejected as client inputs. Shipment must already be ARRIVED; quantity cannot exceed dispatch, and shortage is calculated without requiring a remarks input. Existing shipment remarks are preserved. The separate quality/stack CMR receiving API retains its own receipt workflow.

PACS/LAMPS mapping report: GET /pacs-mappings (PACS/LAMPS login) returns the authenticated centre's mapped Millers. Optional season_id, page and limit filters mirror /miller-mappings pagination. Each row includes mapping_id, source_id/name/kind, miller_id/name/code, season, district, contact details and mapped_at. Source is derived from the user's facility_id; another facility_id is forbidden. Active route-tag mappings are listed; the Miller's active flag is returned so inactive facilities can be identified. GET /paddy/lifting-millers?season_id=... remains the lightweight dropdown of active mapped Millers. Postman has a PACS LAMPS Mappings folder for the detailed report.

Migration 084 adds CMR order district_id, lot_count and stenciling_code. Source full LotNo is stored in existing order_no; no lot_no, submitted_on or source transaction/record ID columns are added to cmr_orders. district_id is derived from the mapped destination and any explicit value must match (DESTINATION_DISTRICT_MISMATCH). The other two fields are optional for legacy imports. Order lists/submission options return the fields; the existing order PATCH accepts lot_count/stenciling_code changes with its required reason/idempotency key. Order listing accepts order_no/district_id filters.

GET /setup/postman (ADMIN/OPERATOR) is a read-only helper for saving Postman references. Optional selectors: season_code, miller_code, destination_code, source_code, vehicle_no. It returns matching contexts, free/busy GPS-mapped vehicles, selected context/vehicle only when unambiguous, readiness flags and missing prerequisites. It does not create masters or select an arbitrary combination. See postman/README.md for the saved setup workflow. FK failures return REFERENCE_NOT_FOUND with the reference field; deleting a referenced record returns RECORD_IN_USE.

Migration 083 removes receipt_no from procurement storage, procurement import bodies and procurement/lot responses. RO identity uses ro_no/ro_date and source transaction identity uses external_ref. Shipment dispatch and CMR receiving receipt numbers belong to their separate workflows.

Procurement balances are kg: quantity_kg is the RO total; available_kg is the quantity not yet dispatched, including reservations; reserved_kg is the portion allocated to pending lifting shipments. Free quantity is available_kg - reserved_kg (returned as unreserved_kg). Planning reserves without reducing available; dispatch reduces available and reserved together; cancellation releases the reservation. For quantity=10000, available=10000, reserved=2000, free quantity is 8000 kg. Dispatching those 2000 kg leaves quantity=10000, available=8000, reserved=0.

Migration 082 adds allotted `procurement.miller_id` (FK to facilities). New procurement imports require an active MILLER facility ID. Source facility_id and destination miller_id are distinct. Importer mappings must resolve upstream MillerId to the local miller ID. Procurement/lot APIs expose miller_id; GET /procurements supports its filter. Available lots are restricted to the logged-in Miller; source accounts can supply miller_id to filter their dropdown.

Paddy allocation (automatic or explicit) and dispatch require the RO's miller_id to match shipment.miller_id/destination. NULL legacy allocations block lifting. Migration backfills only ROs linked to non-cancelled dispatched shipments with a single recorded miller, and leaves other legacy rows NULL. Route tags alone are not allocation evidence.

An authorized operator/integration can resolve a legacy RO through the existing PATCH /procurements/:id or /integrations/euparjan/procurements/:id endpoint with `{"miller_id":123,"reason":"Verified RO allotment"}` and an Idempotency-Key. Corrections record old/new miller IDs. Already assigned ROs with reserved or lifted quantity cannot be reassigned; incompatible non-cancelled shipment links also block correction. Quantity corrections preserve the allotted miller. Mapped-source available/reserved/procured totals now use only that miller's allotted ROs; on_hand_kg is the physical shared source stock. Source summary mapped_millers lists only the RO's allotted miller when its route tag is active.

Migration 081 adds `procurement.district_id`, backfilled from each MSP facility. New imports snapshot the mapped facility district. Optional import district_id must match that facility (DISTRICT_MISMATCH on conflict); use local district master IDs after mapping any upstream source IDs. GET /procurements accepts district_id filtering and procurement/lot responses include the saved district. Existing facilities with no district remain NULL until authoritative data is available.

Migration 080 adds optional `procurement.ro_no` (RO number) and `ro_date` (DATE). Import records accept these fields; date input is YYYY-MM-DD. Procurement lists, Paddy source reports, available lots and shipment lot details expose both. GET /procurements supports an exact ro_no filter. Existing rows remain NULL; no RO is inferred from receipt_no/external_ref. RO number is indexed but not unique: external_ref remains the source transaction identity. Changed RO metadata on an already imported reference is rejected as a conflicting re-import.

Weights: migration 078 stores transactional quantities in kg with three decimal places; all current quantity response fields end in `_kg`. Unspecified input units default to KG. Dispatched bags (`total_bags`) and actual receiving bags (`received_bags`) are separate.

Base URL: `http://127.0.0.1:3015/api/v1`. All request/response bodies are JSON. Postman contains complete runnable request bodies. This document lists the complete exposed route families and important rules.

## Manual trip correction

`POST /shipments/:id/trip-correction` is restricted to ADMIN/OPERATOR and requires authentication plus an `Idempotency-Key`. Use this instead of changing only `trip_status` in SQL. Supply verified actual timestamps with explicit timezone offsets:

```json
{
  "trip_status": 1,
  "dispatched_at": "2026-11-03T17:00:00+05:30",
  "trip_started_at": "2026-11-03T17:05:00+05:30",
  "reason": "Corrected from verified dispatch records"
}
```

For completion, send `trip_status: 2` and include `trip_completed_at` strictly after start. Start must be strictly after dispatch. Times cannot be in the future beyond the standard API tolerance. Examples are illustrative; use the shipment's actual times.

The endpoint locks the shipment and atomically updates status (IN_TRANSIT/ARRIVED), trip_status, actual timestamps, ETA and geofence flags, with a TRIP_STATUS_CORRECTED event and the standard mutation audit. It preserves the GPS watermark, does not manufacture GPS packets or deliver stock, and rejects planned/terminal shipments and backwards trip transitions. Dispatch PLANNED shipments through the dispatch API first. The trip workers pick up changes on their next refresh. Existing Redis intents with conflicting state remain protected by TRIP_INTENT_CONFLICT and require review; this endpoint does not clear Redis journals or queues.

## Authentication and retry headers

Application APIs accept the HttpOnly `accessToken` cookie or `Authorization: Bearer <token>` after login. An explicitly supplied Authorization header takes precedence. Tokens are random, expiring server-side sessions; only their hashes are stored. Passwords use salted scrypt. User deactivation takes effect on the next authenticated request. Password changes invalidate all current sessions, including refresh credentials.

Protected routes use the service's separate `src/middlewares/verifyJWT.js` middleware, exported as `auth` for existing routes. Despite the shared middleware name with the core backend, CMR tokens remain opaque session tokens, not JWTs. This middleware fetches the active CMR user on every request and sets `req.user` with `id`, `user_id`, `name`, `email`, `role`, `miller_id` and `facility_id`; `req.tokenHash` identifies the current session. Mobile clients can send `Device: mobile` (or an okhttp User-Agent) with `X-Auth-Token: <CMR token>` instead of a cookie. Core-backend JWTs and users are not accepted. Refresh still requires the CMR refresh cookie.

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
| GET `/miller-master-options?district_id=...` | Miller dropdowns for districts, vehicle types and the shared vehicle fleet |

Module keys are `dashboard`, `vehicles`, `gps-devices`, `stocks`, `ledger`, and `reconciliation`. Seeded MILLER assignments enable views and master creation/editing; report/dashboard assignments are read-only. CMR ADMIN users can change them in the portal's Module assignment tab. Assignments apply to the MILLER role across all millers. Missing or disabled permissions deny mapped operational API actions with HTTP 403 `MODULE_FORBIDDEN`; add/edit also require view access. Existing ownership and business checks still apply. Profile, password and logout remain account capabilities independent of these operational module assignments. There are no hard-delete permissions or endpoints.

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
| POST | `/users` | Admin: `{name,email,password,role,miller_id?,facility_id?}` |
| GET | `/users` | Admin; up to 200 users |
| PATCH | `/users/:id/status` | Admin: `{active:false}`; cannot deactivate self |

Minimum password length is 12. `ADMIN`/`OPERATOR` accounts have null entity scopes; `MILLER` requires `miller_id`; `TRANSPORTER` is an independent login role with null facility/Miller scope.

## Registration and master data

### Current DM setup and direct vehicles

Core DM users open **Masters → CMR setup** in the shared frontend. The page reuses the existing core login, with server-side DM district validation. CMR setup provides depot assignment, CMR order creation, independent vehicle/GPS registration, and an optional test-rice entry tab. It uses the core Users module's existing Add-page permission for frontend routing; CMR independently verifies the active DM and district scope.

All following routes use `/api/v1/core/dm` and a verified core access bearer token:

| Method/path | Body/purpose |
|---|---|
| GET `/options` | Scoped millers, receiving depots, assignments, orders, rice balances, vehicles and vehicle types |
| POST `/assignments` | `{miller_id,season_id,store_id}` |
| POST `/orders` | `{miller_id,season_id,destination_id,order_no,rice_quantity,due_date}`; requires an active assignment |
| POST `/vehicles` | `{transporter_name,transporter_contact_no,district_id,vehicle_type_id,registration_no,capacity,imei_id}`; creates a direct vehicle and GPS device atomically |
| POST `/test-rice` | `{miller_id,season_id,reference,quantity}`; enabled only by `ENABLE_CMR_TEST_SETUP=true` |

POST requests require `Idempotency-Key`. Source millers and receiving depots must be within the DM's assigned districts. Test rice uses a unique reference, `test_stock_entries` and a `TEST_RICE` ledger entry; it does not pretend to be procurement or milling production. The environment example defaults this feature to disabled. It is enabled in the local testing configuration for the requested interim workflow.

Migration `019_direct_miller_vehicles.sql` adds `vehicles.miller_id`, backfills existing ownership, and makes `transporter_id` nullable. Current UI registration uses `miller_id` directly; GPS, shipment and vehicle ownership queries support this path. Transporter code and legacy payloads remain supported but are hidden from the current Miller portal. Vehicle ownership cannot be changed through profile edits.

`npm run db:seed-cmr-test` creates the requested local sample for Miller `m001`: an assignment, `SAMPLE-CMR-M001` order for 50 QTL, a one-time 100-QTL rice test entry, direct 10-MT vehicle `JH01CMR0001`, and a test-only GPS record. It uses the latest active season and a valid imported SCMR depot in the Miller's district. Reruns do not duplicate the sample order, stock or vehicle. The GPS record is not live hardware, and the seed does not dispatch anything.

### Combined Miller registration

`POST /millers/register` requires a CMR ADMIN session and `Idempotency-Key`. Send `{facility: {...}, user: {name,email}}` without a facility `code`. The backend generates a unique `MILL-<UUID>` code and returns it as `miller_code`; client-supplied codes are rejected. Existing codes remain unchanged. The remaining `facility` fields follow the facility creation schema with `kind: "MILLER"`, numeric `district_id`, and explicit capacity units. The backend sets the initial Miller password to `123456789` and stores its salted hash; the registration request must not include a password. Facility creation, login creation, and idempotency recording share one transaction; either all succeed or none do. The response contains `id` (user ID), `facility_id`, `miller_id`, `miller_code`, `email`, and `role`.

The frontend Add User page switches to the CMR registration form when Miller is selected. Other user types continue through the core service. The Miller form reuses the district objects already loaded on the Add User page (`{id,district_name}`), preselects the DM's district, and immediately requests location options using `district_id` to retrieve the matching blocks. A single assigned district is read-only. Multiple assigned districts remain selectable; backend authorization always checks the current core assignments.

Core DMs can retrieve district-scoped setup data using `GET /core/dm/options` with the same core access JWT used by the other core DM endpoints. Its response includes millers, depots, seasons, assignments, orders, stocks, vehicles, and vehicle types.

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
| GET `/procurements/available-lots` | Dropdown: season_id required; source from PACS/LAMPS login, facility_id required for Miller/Admin; all available Paddy lots across schemes, no pagination |
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

Submission body: `season_id`, `order_id`, `destination_id`, `district_id`, `store_location_id` (core store ID), `scheme_type` (`SCMR`/`CCMR`), `vehicle_id`, `quantity:{value,unit}`, `submitted_on` (YYYY-MM-DD), `lot_count`, `stenciling_code`, `gunny_bag_year`, `gunny_bag_type`, `total_bags`, `driver_name`, `driver_phone`, and optional `remarks`. The frontend sends quantity in `KG`. Explicit legacy QTL/MT inputs are still normalized to kg. CMR continues to consume rice stock internally; scheme type selects a separate RICE balance. Submission dates cannot be in the future. The backend derives the miller/source identity, generates the consignment number, derives receiving agency from the SFC/FCI destination, and snapshots the vehicle type. Gunny-bag type is a validated text value until an authoritative type master is supplied. Lot count is submission metadata, not incoming procurement-lot allocation.

Migration `016_cmr_submission.sql` adds submission and packaging columns to `shipments`, and seeds the MILLER `cmr` module. Existing consignments retain null values in the new columns. CMR ADMIN can assign View/Add permissions through module assignment. No dispatch happens on submission: status is `PLANNED`, physical stock is unchanged, `reserved_kg` and the CMR order commitment increase. The existing cancellation workflow releases these reservations. GPS-based dispatch from PLANNED is deferred; this change does not implement or alter dispatch/geofence transitions. Existing manual dispatch APIs remain available to their existing authorized roles.

| Method/path | Required body or filters |
|---|---|
| POST `/shipments` | shipment_no, leg, season_id, miller_id, source_id, destination_id, vehicle_id, quantity; CMR requires order_id; paddy may include lots; optional remarks |
| POST `/shipments/:id/dispatch` | dispatched_at, receipt_no |
| POST `/shipments/:id/deliver` | value, unit (KG by default), received_bags (whole number); server sets delivered_at; shipment must be ARRIVED |
| POST `/shipments/:id/cancel` | reason; PLANNED only |
| GET `/shipments` | Filters: season_id, miller_id, vehicle_id, status, leg, order_id, page, limit |
| GET `/shipments/:id` | Consignment, all event records and procurement-lot links |

`leg` is `PADDY` or `CMR`. Lot format:

```json
[{"procurement_id":1,"quantity":{"value":100,"unit":"QTL"}}]
```

Receipt accepts the entire consignment once. An accepted quantity below dispatch weight is a shortage, not a still-open partial unloading. `accepted_quantity` may be zero; the missing cargo is not automatically returned to source stock. Quantities above dispatch are rejected.

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

Migration `017_cmr_scheme_stores.sql` adds `core_store_location_id` to shipments and nullable `facilities.core_store_id`. Its original shipment `scheme_type` column was replaced by `scheme_id` in migration 039, then by direct `scheme_code` storage in migration 071. Core store IDs are independent of CMR facility IDs. An active core store must match the order destination by explicit `core_store_id`, or by an unambiguous exact store code plus district and facility kind. ADMIN/OPERATOR can link a receiving facility using `PATCH /facilities/:id` with `{core_store_id:<core store ID>}` and an idempotency key; the backend validates the active core store district/type. A store without a matching CMR facility/order remains visible but cannot submit until provisioned and assigned. No receiving facilities, capacities or geofences are guessed or created from source store metadata. Migration `018_store_location_master.sql` creates the local `tbl_store_location_master` table if missing, matching the imported source schema and preserving existing records. Store dropdowns and validation use the CMR database pool; store lookup no longer requires a core database connection. Import authoritative records separately, preserving source IDs.

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
  "stacks": [{"stack_no":"A1","received_quantity_kg":"28943.740","bags":580}],
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
The example is illustrative; it must fit the selected shipment's dispatched quantity and transport dates. Stack quantities and weights are kg with up to three decimal places. Server uses integer gram arithmetic during calculation and stores/returns kg. Stack rice must equal net rice. Net rice cannot exceed dispatched quantity; shortage needs remarks. GPS arrival is required unless an assigned officer supplies a reason of at least ten characters. Accepted receipts also save their bag count in shipments.received_bags, independently of dispatched total_bags.

Quality percentages are recorded (0�100, up to two decimal places). No automatic thresholds are invented. An officer must explicitly confirm compliance before acceptance. Acceptance records stacks and quality, marks the shipment DELIVERED, credits only net rice to the receiving stock, releases the full order commitment and credits the accepted amount to delivered quantity, atomically. Duplicate reviews are blocked and idempotency replay cannot double-credit stock.

Rejection requires a reason of at least ten characters, records all measurements, and adds no rice to stock. The existing transport status and vehicle allocation remain pending return resolution; a return workflow is not implemented by this receiving screen. Generic delivery also refuses rejected shipments. Rejected stacks are excluded from received stock. Existing delivery records without this analysis remain visible as DELIVERED but do not acquire invented stack records.

Migration: `020_cmr_receiving.sql`. Rollback-only database validation: `node --env-file-if-exists=.env scripts/validate-cmr-receiving.js`.

LAMPS/PACS registration now requires `email` in the existing `POST /api/v1/core/dm/paddy/facilities` payload. It creates the facility and its linked user atomically. The account uses the facility name (or contact person), matching PACS/LAMPS role, and `facility_id`. Default password is `123456789`, stored as a salted scrypt hash. Duplicate login emails fail the transaction. The response additionally includes `user_id`, `email`, and `role`. Existing facility-only records do not gain login accounts automatically.

Paddy lifting uses eUparjan procurement stock and an active season-specific PACS/LAMPS-to-Miller route mapping. No Paddy release order is required or accepted. Only PACS/LAMPS users may create PADDY shipments, and only from their own facility. Miller users cannot create PADDY shipments; only Miller users may create CMR shipments. Available procurement lots are reserved automatically (oldest first) unless explicit lots are supplied; dispatch deducts stock and lots. CMR continues to require its existing CMR order and matching scheme rice stock.

PACS/LAMPS source_id comes from login data.user.facility_id; no source lookup endpoint is needed. GET /api/v1/paddy/lifting-millers?season_id=... lists active mapped millers; GET /api/v1/paddy/lifting-vehicles?miller_id=...&season_id=... returns shared active vehicles after validating the selected Miller mapping. The former /paddy/release-orders endpoint and RO seed command have been removed. Migration 036 removes paddy_release_orders and shipments.release_order_id. Nonempty historical RO records and links are moved to archive tables before removal.

Paddy mapped-source and lifting-summary responses report procured_kg, on_hand_kg, reserved_kg, available_kg and lifted_kg; liftable_kg and remaining_kg use unreserved stock. Source stock is shared across mapped millers, not a separate allotment per miller. CMR summary fields retain their existing meaning.

Scheme/commodity update: procurement imports require scheme_code and commodity_code=PADDY; CMR order imports require scheme_code and commodity_code=RICE. Common shipment creation and milling require scheme_code. DM CMR order creation and test-rice entry also require scheme_code. CMR submission keeps scheme_type and derives its balance scheme from it. All use active master codes.

Stock and ledger reports accept scheme_code and commodity filters. PACS/LAMPS can read only their own facility balances/ledger; Miller remains scoped to its own facility. Paddy mapped sources, available lots and lifting summaries return scheme_code and optionally filter it; CMR summaries group by scheme as well. CMR submission options return orders and rice_stock for the selected scheme_type.

Migration 035 replaces procurement.scheme_code and procurement.commodity with required scheme_id and commodity_id foreign keys referencing schemes(id) and commodities(id). Sync payloads continue to use scheme_code/commodity_code; the API resolves them to master IDs. Procurement listing and available-lot responses include IDs and joined codes; filters support scheme_id and commodity_id.

Migration 037 normalizes stocks and stock_ledger to scheme_id/commodity_id foreign keys. stocks now has an auto-increment id and unique (facility_id,season_id,scheme_id,commodity_id) balance key. Both tables expose created_at, created_by, updated_at, updated_by and status (1 active, 0 inactive), with created_by_actor/updated_by_actor identifying integration, local user, core user or system actors. Local user IDs reference users; non-local actors have NULL local IDs. Stock mutations update modified audit fields; ledger entries remain append-only, so their updated fields stay NULL. Inactive stock rejects movements. No manual balance/ledger edit or status-toggle API is introduced.

Historical stocks derive creation/update times from the earliest/latest matching ledger timestamp when available; missing historical actors/times remain NULL. Existing ledger IDs/timestamps and stock quantities/reservations are preserved. Stock/ledger reports still expose joined scheme_code/commodity names for clients and support scheme_id, commodity_id and status filters.

Migration 039 normalizes shipments to required `scheme_id`/`commodity_id` foreign keys and a nullable `vehicle_type_id` snapshot. It removes `scheme_code`, `scheme_type`, `commodity_type` and `submitted_vehicle_type` from storage after validating and backfilling existing rows. The vehicle type snapshot preserves the submitted type when a vehicle master is subsequently edited. Conflicting historical schemes, commodities or ambiguous vehicle-type names stop the migration without dropping labels. Requests keep their existing code fields; shipment responses include master IDs and joined `scheme_code`, `commodity_code`, `vehicle_type` labels. Shipment lists support `scheme_id` and `commodity_id` filters as well as `scheme_code`. `submitted_on` is the CMR submission date and `cmr_lot_count` is the submitted lot count; both remain CMR metadata and are nullable for Paddy lifting. There is no `submitted_count` column.

Procurement/CMR import errors name only the failed field and supplied value. Missing/inactive masters and lifting mappings return specific codes (SCHEME_NOT_FOUND, COMMODITY_NOT_FOUND, SEASON_NOT_FOUND, PADDY_SOURCE_NOT_FOUND, PADDY_MAPPING_NOT_FOUND, CMR_MAPPING_NOT_FOUND, VEHICLE_NOT_FOUND, GPS_DEVICE_NOT_FOUND). Messages include the supplied field/reference; insufficient stock includes the facility/season/scheme and available/requested kg. Procurement quantity conflicts report stored/received kg.

Procurement correction: PATCH /api/v1/procurements/:id (ADMIN/OPERATOR), or PATCH /api/v1/integrations/euparjan/procurements/:id (integration key). Body: optional external_ref, optional quantity, required reason (3-500 characters); at least one editable field is required. quantity is the corrected total. Both routes require Idempotency-Key. Response includes stable id, external_ref, quantity_kg, available_kg, reserved_kg, updated and (for a change) correction_id. Migration 038 adds persistent reference history and correction audit. Quantity below dispatched+reserved fails with PROCUREMENT_QUANTITY_IN_USE; another record's reference fails with EXTERNAL_REF_CONFLICT. Stock/ledger adjust by the difference within the same transaction.

Driver details: POST /shipments accepts optional driver_name and driver_phone together and saves them immediately on the PLANNED shipment. Creation response includes both fields. Dispatch reuses saved values if omitted, or accepts replacement values; both are required by dispatch time. Existing PLANNED shipments without driver details can supply them in the dispatch request. The contact API field is driver_phone. No schema migration is required.

Migration 040 adds `shipments.trip_status` (0 not started, 1 started, 2 completed), `trip_started_at`, `trip_completed_at` and `expected_completion_at`. GPS departure sets status 1 and the actual start time; GPS destination arrival sets status 2 and the first completion time. Dispatch keeps trip status 0 until departure. Trip completion records physical arrival; shipment delivery/stock acceptance remains a separate action. Actual times use the GPS event timestamp and are preserved across later packets and delivery. An authorized delivery with a missing-GPS override sets trip status 2 and uses delivery time only if an arrival/completion time is unavailable; an unknown start remains NULL. Existing trips are backfilled from departure/arrival/delivery evidence without inventing actual or expected times. Cancelled planned shipments retain trip status 0; shipment status still distinguishes cancellation.

Shipment creation, CMR submission and dispatch do not accept expected_completion_at. It remains NULL before trip start and is generated from the actual GPS trip start plus route duration. Tracking/list APIs continue to expose the server-calculated ETA.


### PACS/LAMPS procurement and shipment reports

GET /api/v1/paddy/lifting-summary?page=1&limit=50

Requires PACS/LAMPS login. season_id and scheme_code are optional. Source is always the logged-in facility; a caller cannot select another source.

The endpoint returns procurement records, despite the retained lifting-summary URL. Each data row corresponds to exactly one procurement.id. Fields include id, procurement_ids:[id], external_ref, receipt_no, source_id, source_name, source_code, season_id, season_name, scheme_code, commodity_code, farmer_id, procured_at, quantity_kg, available_kg, reserved_kg and unreserved_kg. Farmer IDs are preserved.

mapped_millers contains active route-tag Miller mappings for the source and record season. has_route_tag is true when that array is non-empty. A receipt is returned only once even if several Millers are mapped. Receipts without a route tag remain visible. No shipment table/view is queried, and no shipment status or lifted/pending summary is returned.

Response: {ok:true, quantity_scope:"SOURCE_PROCUREMENT", data:[...], totals:{procurement_count,quantity_kg,available_kg,reserved_kg,unreserved_kg}, pagination:{page,limit,total}}. Pagination counts procurement receipts; totals cover all receipts matching the filters, not just the current page. All quantities are kilograms (kg).

For the Lifting tab use GET /api/v1/shipments?leg=PADDY&season_id=1&page=1&limit=20, with optional scheme_code, miller_id and status filters. Render shipment_no, scheme_code, quantity_kg, source_name, destination_name, registration_no, display_status and status_at. GET /api/v1/shipments/:id returns details, events and lots. Move individual shipments off the Paddy summary tab. Frontend must reload both tabs after lifting actions and season/scheme changes.


Location fields after migration 068: block_id and block dropdowns are removed from the API. Use district_id for facilities, Miller/PACS registration, farmers, transporters, IMEIs and GPS devices. Shipment location is copied from its source district. Requests containing block_id are rejected by strict schemas. Migration 069 removes the unused tbl_block_master, and migration 070 removes the temporary retired_block_locations archive and its historical values. The district master and store location source data remain intact.


Migration 071 removes the schemes and commodities master tables and all /schemes and /commodities CRUD endpoints. Earlier master-ID storage descriptions above are historical and superseded. Procurement, stocks, stock_ledger and shipments now store scheme_code and commodity_code directly; no scheme_id or commodity_id is returned. List filters use scheme_code and commodity_code (commodity remains a supported alias on stock/ledger/procurement reports). Existing balances remain unique by facility_id, season_id, scheme_code and commodity_code. CMR options return code/name entries without numeric master IDs. Scheme code syntax is validated directly; commodity is PADDY or RICE.


Migration 072 removes procurement_references while retaining procurement_corrections. Current references remain unique in procurement.external_ref. Import retry detection, reference ownership checks and procurement searches also match old_external_ref/new_external_ref in correction history, so corrected references cannot create duplicate stock. Corrections and their stock-ledger links remain unchanged. Migration stops if a legacy reference is not covered by the current record or correction history.


Vehicle registration after migration 073: the transporters master table and /transporters CRUD endpoints are removed. POST /vehicles requires transporter_name, transporter_contact_no, district_id, vehicle_type_id, registration_no and capacity. miller_id and transporter_id are not accepted or stored on vehicles. ADMIN, OPERATOR, MILLER, PACS, LAMPS and TRANSPORTER accounts can register vehicles. Active registered vehicles are shared for lifting/CMR selection; shipment Miller/facility scopes remain enforced. Vehicle/GPS edits by ordinary accounts are creator-scoped, while Core DM management is district-scoped. GPS tracking requires vehicle creation or participation in an associated shipment. Transporter login accounts remain available without master IDs. Legacy vehicle contacts that were never recorded remain NULL until corrected.

Core DM POST /core/dm/vehicles accepts {vehicle_id,imei_id} to map a selected vehicle, or the independent POST /vehicles fields plus imei_id to create and map a new one. Both the vehicle district and selected IMEI must be within assigned DM districts.


PACS/LAMPS procurement visibility: GET /procurements and GET /procurements/available-lots now accept PACS/LAMPS sessions. Their source facility is always taken from the account facility_id; requesting another facility returns 403. They only see PADDY rows. List responses include unreserved_kg; available-lots returns rows with available_kg > reserved_kg and includes external_ref/receipt_no for selection. These read permissions do not grant correction access. ADMIN/OPERATOR access and Miller route-mapping checks remain in place.


Paddy/CMR lifting report filters: season_id and scheme_code are optional on GET /paddy/lifting-summary and GET /reports/lifting-summary, and on shipment report GET /shipments. Omitting them includes all seasons and schemes within account scope; either filter may be supplied independently. Paddy totals remain source-scoped and are calculated from matching procurement records. Postman report Params keep these filters disabled by default. Shipment submit/dropdown prerequisites are unchanged.


GET /paddy/lifting-summary now returns one receipt per row. Its actual primary key is id, and procurement_ids is the corresponding singleton array [id]. Active mapped Millers are provided separately in mapped_millers.

### Report date display

Only `/reports/*`, `/paddy/lifting-summary` and `GET /shipments` (Paddy/CMR shipment reports) format response dates for display. Timestamps display Indian Standard Time (UTC+05:30) as `DD-MM-YYYY hh:mm:ss AM/PM`, for example `02-11-2026 03:25:40 PM`. Date-only strings display as `DD-MM-YYYY`; null dates remain null. Login, master data, dropdowns, shipment detail and mutation responses retain their existing ISO format. Request formats and database storage are unchanged. Parse report display dates explicitly before converting them to ISO for requests.

### User mobile uniqueness

`POST /users` accepts an optional `phone` (null or omitted remains supported). Local and Core DM Miller registration store `facility.phone` on the Miller user account as well. Registration rejects an existing user mobile, including inactive accounts, with HTTP 409 and `MOBILE_ALREADY_EXISTS`: `Mobile number already registered.` The existing `uq_users_phone` constraint also prevents simultaneous duplicate inserts. Driver contact reuse continues to link the existing driver account instead of creating a duplicate. Shared transporter contacts on vehicles are unchanged.

### Capacity value and unit

Migration 076 stores capacity as `capacity_value` and `capacity_unit`; daily milling capacity uses `milling_capacity_value_per_day` and `milling_capacity_unit`. Input bodies retain `capacity: {value, unit}` and `milling_capacity_per_day: {value, unit}`. The submitted KG/QTL/MT value and unit are preserved: 20 MT stores value 20 and unit MT. API responses expose the value and unit columns. Existing normalized capacity records are represented in MT without changing their physical weight. Internal capacity checks normalize to kilograms to compare against stock and shipment weights; they do not change the stored capacity unit. Postman capacity examples retain their original MT inputs.

### Shipment driver input fields

Paddy and CMR shipment forms use typed driver_name and driver_phone inputs, not a driver dropdown or driver ID. No prior GET /drivers call is required. The backend saves the submitted contact details and links/creates the driver account by mobile as part of the existing shipment flow. Driver account management remains a separate API. SFC_CMR Postman shipment dropdown folders omit driver lookup requests; shipment submit bodies contain the manual driver inputs.

Available-lot dropdown: `GET /procurements/available-lots?season_id=...` returns all eligible PADDY lots across schemes without pagination. Do not send scheme_code, page or limit. Miller/Admin requests also supply facility_id. Rows retain scheme_code so the selected lot and eventual shipment use the same scheme; one shipment cannot mix schemes.

### Postman receiving sections

SFC_CMR collection groups receiving separately from shipment creation/dispatch. `Paddy Receiving - Miller` has pending ARRIVED Paddy list, shipment detail, POST /shipments/:id/deliver and DELIVERED Paddy report; use miller_token. `CMR Receiving - SFC FCI` has scoped receiver shipment list, detail, POST /core/receiving/shipments/:id/receive and received stock/stack report; use core_receiver_token for an assigned AGM/Lifting Incharge (core user_type 4/8). Set cmr_receiving_decision to ACCEPTED or REJECTED. A rejection requires its reason in remarks. The shipment list status filter can show ARRIVED, ACCEPTED or REJECTED.

Shipment creation roles are enforced before business database queries: POST /shipments allows only PACS/LAMPS for leg=PADDY and only MILLER for leg=CMR. POST /cmr/submissions remains Miller-only. Other roles receive 403. Paddy receiving by Miller and CMR receiving by assigned Core receiver are separate operations.

### Driver initial password column

Migration 077 adds nullable users.password for the initial password of newly created drivers, as requested. Driver creation writes both that readable initial password and the separate password_hash used by login. Existing drivers are reused without resetting credentials. Old user rows keep password=NULL because their passwords cannot be recovered from hashes. Changing a password clears the stored initial password to prevent showing a stale credential. Login, user lists and driver lists do not expose users.password; initial_password remains available on the creation response. Database readers can see this column, so backups and database access also contain readable initial credentials.

### Local Postman integration credentials

Run `npm run postman:sync` after changing local EUPARJAN_API_KEY/GPS_API_KEY. The command updates only SFC_CMR collection/environment and logs no credentials. Local integration requests use the synced collection fallback at local_api_origin, including when no environment is selected or an old environment key is present. Remote targets use only environment credentials; local fallback keys are never applied to remote origins or another port. The procurement request also contains its own header script so it does not depend solely on the collection script. Exports now contain local integration credentials and must remain private. Authentication was verified against the local server using an empty payload, without creating procurement data.

New drivers now receive the fixed initial password `1234567890`. It remains a string in API credentials and users.password. All newly created drivers use this same default unless an explicit password is supplied via POST /drivers. Newly created drivers store the initial value in users.password and return it in driver_account.initial_password; login still verifies password_hash. Existing driver passwords are unchanged. Explicitly supplied passwords on POST /drivers are preserved.

### Login district metadata

POST /auth/login returns data.user.district_id and data.user.district_name for PACS/LAMPS/Miller users, resolved from their linked facility (facility_id, or miller_id as fallback). GET /auth/me returns the same district metadata from the current database link. Accounts without that facility scope return null; this is metadata and does not assign a district permission to Admin/Operator/Driver/Transporter roles. Core DM/receiver assignments are separate. SFC_CMR login response scripts save a non-null linked district into collection district_id/district_name without adding environment variables.

CMR order gunny bags (migration 100): push CMR order records and order PATCH accept optional gunny_bag_year (1900?2100) and gunny_bag_type (1?80 characters). Existing orders remain NULL. GET /cmr-orders and order dropdowns return both fields. CMR submissions derive these fields from the selected order and snapshot them on the shipment; submission clients need not send them. Shipment and CMR receiving reports return these snapshots.

Document-based inventory: procurement is Paddy IN at its PACS/LAMPS source; CMR order is Rice IN at its Miller. Shipment creation reserves, dispatch posts OUT, and cancellation before dispatch releases the reservation. Receipt updates actual accepted quantity, bags and shortage without posting a second IN. Milling is informational and does not change inventory in this model. Existing manual/test entries remain explicit adjustments. Order PATCH posts only the quantity difference; order cancellation reverses unused credit; the order cannot be reduced below reserved/dispatched quantity. Shortage never restores already dispatched rice. Unresolved master IDs can still be pushed, but no stock is credited until a real Miller/season exists; retry or stock:reconcile applies outstanding credits idempotently.
GET /reports/stocks returns total_in_kg and total_out_kg alongside on_hand/reserved/available KG. GET /reports/ledger returns movement, in_quantity_kg, out_quantity_kg, balance_kg, reserved_balance_kg and reference_no. All balances are scoped by facility, season, scheme and commodity. Ledger IDs define posting order; reservation rows do not count as physical IN/OUT. Preview legacy order credits and stale planned reservations using npm run stock:reconcile; apply with npm run stock:reconcile -- --apply. Existing ledger entries are retained.

Migration 103 links every stock_ledger row directly to stocks.id using required stock_id and a restrictive foreign key. Existing rows are backfilled by facility/season/scheme/commodity without changing quantities. Ledger reports return stock_id; stock totals and running balances use this link. A stock row with ledger history cannot be deleted.
