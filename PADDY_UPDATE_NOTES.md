# Paddy and CMR lifting

Paddy: eUparjan procurement ? PACS/LAMPS stock ? mapped Miller lifting.
CMR: Miller rice stock ? mapped godown lifting, with the existing CMR order.

POST /api/v1/shipments accepts PADDY without release_order_id. The removed field is rejected by the strict schema. PACS/LAMPS can lift only from their own facility; season, mapping, stock, procurement lots, vehicle capacity and GPS checks still apply. Dispatch, cancellation and delivery continue through common shipment APIs.

For PACS/LAMPS, select a Miller using GET /api/v1/paddy/lifting-millers?season_id=... and a vehicle using GET /api/v1/paddy/lifting-vehicles?miller_id=...&season_id=... . Procurement sync must populate real stock before lifting.

The release-order API and sample RO seed command are removed. Migration 036 removes the old RO table and shipment column; nonempty records and links are archived for audit history.

Paddy summaries use procured_g and unreserved available_g instead of RO planned/pending quantities. Shared source stock is not a Miller allotment. Update clients using the former RO API, release_order_id, planned_g or pending_g. Updated requests are in the Postman collection.

Scheme and commodity: apply 034_scheme_commodity_stock.sql before deployment. Imports now require scheme_code and commodity_code (PADDY procurement / RICE CMR). Shipments and milling require scheme_code. Balances share one stocks table with facility + season + scheme + commodity as the key; lot allocation, reservations, dispatch, receipt and milling preserve the scheme. Historical stock remains in LEGACY_UNSPECIFIED until authoritative reconciliation.

Procurement stores scheme_id and commodity_id foreign keys after migration 035; source codes are resolved during sync. Apply both 035 and 036 through npm run db:migrate.

Apply 037_stock_ids_and_audit.sql using npm run db:migrate. Stock balances and ledger use master IDs; stocks has its own auto-increment primary ID plus a unique facility/season/scheme/commodity combination. Audit fields and numeric status are present on both tables. Integration and core actors are recorded separately from nullable local user IDs; historical provenance is not fabricated.
