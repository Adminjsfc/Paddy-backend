# e-uparjan inbound integration contract

## What must be agreed with the source system

This project exposes receiver APIs. No live e-uparjan endpoint, credentials, source payload schema or signing method was supplied. Before production, agree the source-code mappings, quantity units, order revision process, sequence of pushes, network connectivity and API-key delivery with the e-uparjan team. Do not assume that field names in this proposed receiver contract are the official source field names.

The sender calls HTTPS, with JSON and two headers:

```http
X-API-Key: <receiver integration key>
Idempotency-Key: <stable delivery/batch identifier>
```

`external_ref` identifies a business record. `Idempotency-Key` identifies a delivery attempt/batch. Both are required for safe retries. Keep the same key and body when a response is lost. This receiver stores the completed response and replays it after a committed transaction.

## Push sequence

1. SFC creates a season and supplies its `code`.
2. Push/register farmers, LAMPS/PACS, millers and SFC/FCI facilities.
3. Create season-specific route tags using receiver IDs returned by registration.
4. Push farmer-wise procurement receipts.
5. Push CMR orders for registered/tagged millers and destinations.

Master endpoints are create-only. Existing master corrections use the authenticated SFC operator APIs. Operator lists can filter `code` to resolve an existing record. A sender must keep the ID returned from each successful create; no guessed numeric IDs should be used.

## Farmer procurement batch

`POST /api/v1/integrations/euparjan/procurements`

```json
{
  "records":[{
    "external_ref":"EUP/KMS2026/PACS001/PURCHASE0001",
    "scheme_code":"SCMR",
    "commodity_code":"PADDY",
    "season_code":"KMS2026",
    "farmer_code":"FARMER0001",
    "facility_code":"PACS001",
    "procured_at":"2026-10-09T10:30:00+05:30",
    "quantity":{"value":100,"unit":"QTL"},
    "moisture_percent":14.5,
    "receipt_no":"PURCHASE0001"
  }]
}
```

| Field | Meaning |
|---|---|
| external_ref | Stable globally unique procurement reference, including year/season if needed |
| scheme_code | Required active receiver scheme code; preserved through lifting and milling |
| commodity_code | Required PADDY for procurement; CMR orders require RICE |
| season_code | Registered receiver season code |
| farmer_code | Optional registered farmer source code. Omit it when a PACS/LAMPS stock receipt is not farmer-wise. |
| facility_code | Registered PACS/LAMPS code |
| procured_at | Actual purchase/receipt time with explicit timezone |
| quantity | Paddy actually procured; unit explicitly KG/QTL/MT |
| moisture_percent | Optional observation; it does not automatically change accepted weight |
| receipt_no | Source purchase receipt/reference |

One batch contains 1–100 records and is transactional. Any unknown code or business-rule conflict rolls back the entire batch. Return record order matches input order. A schema error also rejects the full batch.

## CMR order batch

`POST /api/v1/integrations/euparjan/cmr-orders`

```json
{
  "records":[{
    "external_ref":"EUP/KMS2026/CMR/0001",
    "scheme_code":"SCMR",
    "commodity_code":"RICE",
    "season_code":"KMS2026",
    "miller_code":"MILLER001",
    "destination_code":"SFC001",
    "order_no":"CMR-0001",
    "ordered_at":"2026-10-09T11:00:00+05:30",
    "due_date":"2026-11-09",
    "rice_quantity":{"value":68,"unit":"QTL"}
  }]
}
```

For central-pool deliveries, set `destination_code` to the code of a registered `FCI` facility. The same quantity/allocation rules apply. The registered season-specific miller→destination tag is mandatory.

`rice_quantity` is the order's required rice quantity. Do not pass a paddy quantity under this field. If the source system expresses orders as a paddy entitlement, its adapter must explicitly convert to rice with the agreed recovery rule. The service's miller reconciliation independently compares accepted paddy obligations with rice deliveries.

## Response and retries

```json
{
  "ok":true,
  "replayed":false,
  "data":{"records":[{"id":101,"quantity_g":10000000,"duplicate":false}]},
  "request_id":"server-generated-uuid"
}
```

The CMR response uses `rice_quantity_g` instead of `quantity_g`. Same-key replay returns the original response. A later identical record under a different batch key returns `duplicate:true` and its original ID without increasing stock/order quantity. A conflicting reference returns `409 EXTERNAL_REF_CONFLICT`. Keep the original body for retries, including consistent units and value types.

Recommended sender behavior:

- Store the business reference, delivery key, exact outgoing JSON, attempt count and receiver result in the sender's outbox.
- Retry timeouts, connection failures, 429 and 503 with backoff and the same key/body.
- Resolve 400/401/403/404/409 errors before resending. Send corrected new data under a new delivery key only after resolving the underlying business reference.
- Do not create a fresh business reference merely to bypass a quantity conflict; that would create a second procurement/CMR record.

Procurement corrections are explicit: PATCH /api/v1/integrations/euparjan/procurements/:id with external_ref and/or quantity plus reason. A repeated POST does not silently correct stock. Cancellation is not automatically imported. An SFC operator may amend a CMR order quantity/due date using its API, with a reason, subject to existing allocations and accepted deliveries. The original import hash remains the identity of the original source payload.

## GPS provider contract

Use the separate `POST /api/v1/gps/packets` API and GPS key, not the e-uparjan key. Send real GPS acquisition time, not server receive time. `gps_fix` must be true. A batch has 1–500 packets and the whole request must pass structural validation first. Then valid-shaped packets are processed individually; unknown-device/future-time/conflict errors return HTTP 207 with per-packet outcomes. Retry transient server errors safely, as device/timestamp deduplication protects previously committed packets.

If using MQTT, agree topic pattern, TLS, authentication, normalized fields and publisher QoS 1. Run one worker with a stable client ID and a durable broker session. The worker acknowledges valid packets only after SQL processing. Malformed/unknown-device business errors are logged and acknowledged; a database failure exits without acknowledging that packet so the supervisor/broker can retry. This optional adapter has no live-broker acceptance test in this delivery.

## Scheme and commodity balances

Procurement and CMR imports require scheme_code and commodity_code. Codes are validated against active schemes and commodities masters; unknown/inactive codes are rejected. These fields are included in the import payload hash, so the same external_ref with a changed scheme/commodity is a conflict, not a correction. Existing imports retain their original hash; do not replay old records with newly added fields without agreeing a reconciliation process.

Stock uses one shared stocks table, keyed by facility_id, season_id, scheme_code and commodity. PACS/LAMPS, Miller and godown balances are separate rows. No separate stock table per facility type is needed. The stock_ledger includes the same dimensions. Paddy lifting requires scheme_code, allocates only matching procurement lots and preserves the scheme on dispatch and receipt. Milling requires scheme_code, consumes that scheme's PADDY and produces that scheme's RICE. CMR shipment scheme must match its CMR order and the selected stock. CMR submissions derive scheme_code from scheme_type. An order alone does not create rice stock.

Apply migration 034_scheme_commodity_stock.sql before deploying this API change. Historical records and balances are marked LEGACY_UNSPECIFIED (an inactive internal scheme), with quantities and ledger history preserved. This prevents assigning historical stock to SCMR/CCMR without evidence. Existing trips can still dispatch, cancel and deliver their legacy balance; new allocations require an active, known scheme. Reclassification needs a separate, reviewed reconciliation of lots, reservations, balances and ledger.

## Procurement master IDs

Migration 035 normalizes procurement storage to scheme_id and commodity_id. Incoming scheme_code and commodity_code remain the integration identifiers and resolve to active local master records before insertion. Returned procurement/available-lot records expose the IDs plus joined codes. Migration 036 removes the unused paddy_release_orders table and shipments.release_order_id, archiving nonempty historical data first.

Migration 037 stores scheme_id and commodity_id in stocks and stock_ledger as well as procurement. Inbound payloads continue to use source codes. Procurement stock/ledger entries record created_by_actor=integration; local created_by remains NULL because the integration API key is not a local user account. Subsequent local stock movements record the authenticated user's ID and actor.

## Procurement reference/quantity correction

PATCH /api/v1/integrations/euparjan/procurements/:id uses the integration key. ADMIN/OPERATOR may use PATCH /api/v1/procurements/:id. Body example: {"external_ref":"CORRECTED-PURCHASE-001","quantity":{"value":200,"unit":"QTL"},"reason":"Correct source purchase reference and weight"}. The number is the new total quantity, not an increment. Either editable field may be omitted. A reason and an Idempotency-Key are required.

The procurement ID and shipment-lot links stay stable. Quantity changes adjust available_g and source stock by the difference, preserve reservations, enforce capacity and append a PROCUREMENT_CORRECTION ledger entry. New quantity must cover already dispatched plus reserved quantities. External references are unique across current and historical references; renaming cannot reuse another procurement's former reference. Former references remain attached to the same procurement, so an original source retry cannot add a duplicate stock receipt. Matching current receipt payloads also return duplicate:true; the original import hash remains unchanged.

Migration 038 backfills procurement_references for existing records and creates procurement_corrections with old/new references and quantities, reason, actor and request ID. Repeating the same correction/key returns the stored response; sending current values with a new key has no additional stock movement. Failed corrections roll back the reference binding, history and stock changes together. GET /procurements?external_ref=... resolves a current or former reference.
