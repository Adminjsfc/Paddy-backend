# SFC Paddy Procurement & CMR Service

Standalone Node.js 24 + MySQL 8 service for:

1. Farmer-wise procurement at LAMPS/PACS when farmer data is available; PACS/LAMPS stock receipts may also omit a farmer.
2. Paddy lifting from tagged LAMPS/PACS to a miller.
3. Milling, rice production and recovery obligations.
4. CMR rice lifting from the miller to an SFC godown or FCI central-pool destination.
5. Miller-owned transporters, vehicles, GPS devices and movement tracking.

This is a backend API project, with a runnable Postman collection, SQL schema, tests and deployment files. It does not include a web/mobile UI. It is independent of the existing JSFC trip services and does not modify their tables.

## Quantity interpretation

The default is **68 kg rice per 100 kg paddy**, i.e. **68% recovery**. Therefore:

| Paddy received | Recovery | Rice obligation |
|---|---:|---|
| 100 QTL = 10,000 kg | 68% | 68 QTL = 6,800 kg |
| 100 QTL = 10,000 kg | 67% | 67 QTL = 6,700 kg |

The user's phrase “100 QTL paddy and 68 KG rice” has been interpreted as a 68% ratio, not 68 kg output for the entire 100-QTL input. This is a configurable business setting, not a claim about a statutory milling ratio.

Use `seasons.recovery_percent` for a season default and `facilities.recovery_percent` for a miller override. A null override uses the season default. A paddy shipment freezes its ratio at allocation; accepted paddy at receipt creates its rice obligation. Changing the configuration cannot rewrite prior obligations. A milling batch separately snapshots its production ratio. Quantities use integer grams internally to avoid floating-point stock drift; request units support `KG`, `QTL` and `MT`, with up to three decimal places. Response fields ending `_g` are grams; reconciliation also includes `_kg` values.

## Included modules

| Module | Implemented behavior |
|---|---|
| Users | Admin, SFC operator, miller and transporter accounts; login, logout, password change, deactivation |
| Farmers | Registration, code mapping, list, details, profile editing, deactivation |
| Facilities | PACS, LAMPS, miller, SFC godown and FCI; coordinates, geofence radius, storage capacity, contacts |
| Millers | Storage capacity, optional daily paddy milling capacity, recovery override |
| Route tagging | Season-wise LAMPS/PACS → miller and miller → SFC/FCI assignment |
| Miller store assignments | Assign one miller to multiple SFC godowns/FCI stores, across districts, by season; CMR orders and shipments require an active assignment |
| Transport | Miller-owned transporter records, vehicle capacity/driver, GPS IMEI/provider/model/SIM |
| e-uparjan integration | Authenticated inbound procurement and CMR push batches; master creation endpoints |
| Procurement | Farmer/site/season quantities, moisture and receipt references, duplicate detection, lot balances |
| Paddy lifting | Explicit lot allocation or FIFO, source stock reservation, dispatch and miller acceptance |
| Milling | Consume received paddy, calculate or record actual rice output, production variance |
| CMR | SFC/FCI order import, allocation limits, amendments, unused-order cancellation, accepted deliveries |
| GPS | JSON HTTP pushes, chronological batch processing, optional normalized MQTT adapter, live/history APIs |
| Reconciliation | Procurement lots, stock ledger, obligation balance, production, transit quantities and shortages |
| Operations | Health endpoints, transactions, idempotency, audit records, pagination, systemd/Docker/Nginx examples |

## Quick start

Read [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for database accounts and server setup.

```bash
cd sfc-cmr-service
cp .env.example .env
chmod 600 .env
# Edit .env: database credentials, two API keys and bootstrap administrator.
npm ci
# Apply schema using the separate migration account described in the guide.
node --env-file=.env.migration scripts/migrate.js
npm run admin:create
# Remove ADMIN_PASSWORD from .env after account creation.
npm start
```

Local API: `http://127.0.0.1:3015/api/v1`.

```bash
curl http://127.0.0.1:3015/health/ready
```

Import these two files into Postman:

- `postman/SFC_CMR.postman_collection.json`
- `postman/SFC_CMR.postman_environment.json`

Fill `admin_email`, `admin_password`, `euparjan_api_key`, `gps_api_key` and a unique `demo_password` (minimum 12 characters). Run the collection against a test database. It creates uniquely named demonstration records, processes 100 QTL of paddy into 68 QTL of rice, accepts the rice at SFC, then demonstrates FCI order import/amendment/cancellation. It automatically stores IDs and tokens. Individual requests can be reused with real values after the initial demonstration. Do not treat sample GPS coordinates as real facility data.

## Documentation

- [API reference and permissions](docs/API.md)
- [Workflow, inventory and GPS rules](docs/WORKFLOW.md)
- [e-uparjan push integration contract](docs/EUPARJAN_CONTRACT.md)
- [Deployment, configuration and restart commands](docs/DEPLOYMENT.md)
- [Validation results and rerun instructions](docs/VALIDATION.md)

## Integration boundaries

The e-uparjan URLs, payload specification and credentials were not supplied. The project provides a defined **inbound push contract** and Postman examples, not an already-connected e-uparjan client. Its sender must map official farmer/facility/season codes and procurement/order fields to that contract. There is no polling job against an invented endpoint.

GPS HTTP ingestion is ready for normalized packets. The optional MQTT worker maps common `imei_no`, `latitude`, `longitude`, `gps_timestamp`, `date_time`, `gps_fix`, `speed` and `packet_header` fields. Device-specific raw TCP/serial parsing belongs to the GPS provider/ingestion gateway. No existing production passwords, tokens or IP addresses have been embedded.

IMEI registration is separate from GPS assignment. ADMIN/OPERATOR users manage `POST/GET /api/v1/imeis`, `PATCH /api/v1/imeis/:id` and `PATCH /api/v1/imeis/:id/status`. The master body contains `imei`, `provider`, `district_id` and `block_id`. IMEI list responses include read-only `mapping_status` and `status_updated_at` (UTC). Both are null on creation and remain unchanged on ordinary master edits. First mapping sets `MAPPED` and a timestamp; unmapping sets `AVAILABLE`. Migration 026 makes the initial mapping fields nullable. GPS mapping creation/reactivation sets `MAPPED`; deactivation sets `AVAILABLE`. Only an actual status transition changes the timestamp. IMEI and GPS location edits keep the linked active assignment location synchronized. Migration 025 adds and backfills these fields. Create a GPS device with `imei_id`, `vehicle_id`, `district_id` and `block_id`; live packets populate `last_gps_at`, `latitude`, `longitude` and `speed_kph`. GPS list responses include the linked IMEI/provider and accept vehicle, IMEI, district and block ID filters. GPS updates allow district/block and optional model/SIM metadata; IMEI/vehicle links remain fixed to preserve packet history. Deactivate the linked GPS device before deleting an IMEI. Core DM vehicle registration also accepts an existing `imei_id` and derives GPS district/block from its Miller. Migration 024 preserves device IDs, packet history and readings while moving existing IMEI/provider values into the new master; existing rows without a known Miller location retain null district/block until corrected.

This release treats shortages as recorded differences at the receiving weighbridge. It does not create financial recovery claims, return consignments, quality-rejection workflows, payments, or opening-stock adjustments. Use accepted weight for a completed consignment; a smaller accepted amount is recorded as a shortage. Later CMR trips can satisfy the remaining order quantity. Procurement import retries do not overwrite records. Explicit reference/quantity corrections use PATCH /procurements/:id (or its integration endpoint), with stock reconciliation and correction history. Live server deployment and live e-uparjan/GPS broker connectivity must be verified in your environment.

## Backend organization

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the route ? controller ? service ? repository flow, shared transaction/stock rules and where to add new features.

Vehicle mapping status (migration 027): `vehicles.mapping_status` and `status_updated_at` start as null. Creating/reactivating the GPS assignment sets both vehicle and IMEI to MAPPED; deactivating it sets both to AVAILABLE. Ordinary vehicle edits leave mapping status and its timestamp unchanged. These fields appear in vehicle list responses and are read-only.

Timestamp precision (migration 029): all application database datetime columns store whole seconds. Incoming API timestamps and SQL Date parameters are truncated to seconds, and API JSON timestamps omit fractional seconds (for example 2026-10-21T18:30:39Z). Timezone remains UTC. GPS packet uniqueness is per device and second; distinct packets in the same second can produce a GPS_TIMESTAMP_CONFLICT. The migration checks for existing same-second GPS collisions before making changes.

Scheme and commodity masters (migration 030): `/api/v1/schemes` uses `code`, `scheme_name` and optional `description`; `/api/v1/commodities` uses `code`, `commodity_name` and optional `description`. Both expose Add/List, PATCH by ID for name/description, and PATCH by ID/status for soft deletion. Code is immutable. ADMIN/OPERATOR manage records; authenticated users can list them. Active and audit fields are managed by the backend. Existing SCMR, CCMR, RICE and PADDY codes are seeded. CMR submission options include active supported master records, and submissions check that their scheme and commodity are active. Adding a custom master does not extend the existing SCMR/CCMR rice processing flow.
