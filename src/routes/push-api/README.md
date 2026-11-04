Push API routes use `/api/v1/integrations/euparjan` as their base.

All requests require `X-API-Key` (EUPARJAN_API_KEY) and `Idempotency-Key`.
No user login is required. Retry with the same key and unchanged payload.

| POST path | Purpose |
| --- | --- |
| /procurements | Push 1–100 procurement RO records in `records` |
| /cmr-orders | Push 1–100 CMR orders in `records` |
| /masters/seasons | Push one season |
| /masters/route-tags | Tag PACS/LAMPS source_id to Miller destination_id for season_id |
| /miller-store-assignments | Assign Miller miller_id to depot store_id for season_id |

Push imports do not require existing master rows or assignments. Master foreign
keys were removed from procurement, cmr_orders, route_tags and
miller_store_assignments. Numeric ID fields and quantity/date formats still apply.
Procurement keeps submitted codes and resolves existing master IDs when available.
CMR orders accept season_id, miller_id and destination_id directly as numeric
values. CMR season_code, miller_code and destination_code are not accepted or stored.
Unlinked procurement does not create stock until operationally reconciled.
Depot store_id represents a facility identifier, not a core store location ID.
Both existing Postman collections contain a `Push APIs` folder with all five
requests and ten-record procurement/CMR examples. Change external references,
RO/order numbers and values for new records. Existing local integration keys
in these collections must remain private.
