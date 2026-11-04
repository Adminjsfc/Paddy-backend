CMR dropdowns: Season, District, Destination Depot, CMR Order Number and Vehicle. Scheme and Commodity are not separate Postman dropdowns; existing request configuration remains in place.

# Saved Postman setup

Do not enter expected_completion_at in Paddy shipment, CMR submission or dispatch requests. ETA is generated only when the trip actually starts; route duration determines it. The server returns it for tracking. The Postman input variable and request fields have been removed.

District Dropdown URL is simply `{{base_url}}/cmr/districts`: no season or scheme filters. It lists all active districts. Selected district is retained when season/scheme changes; dependent store/order selections are refreshed separately.

CMR Shipment / 01 - Dropdowns contains separate requests with matching APIs: Season (/cmr/dropdowns/seasons), Scheme (/schemes), Commodity (/commodities), District (/districts), Destination Depot (/stores), CMR Order Number (/orders) and Vehicle (/vehicles). All paths after the first share the /cmr/dropdowns prefix. Run the numbered steps in order using Miller login. Re-import the updated collection to replace the old combined dropdown requests.

CMR Shipment / 01 - Dropdowns now has a numbered sequence: 01 season/scheme, 02 district, 03 destination store, 04 order number, 05 free vehicle. Each options call uses `only=base|districts|stores|orders` and returns only the relevant arrays. Keep the same Miller login. A single valid option is saved automatically; for multiple options set the indicated variable and rerun that step. For stores, row.id is store_location_id (core ID), while row.facility_id is destination_id (local ID). The submission body uses destination_id, including FCI destinations. Changing season/scheme/district and fetching the next dropdown clears dependent store/order selections across collection/environment scopes. Empty lists clear old IDs. Request 00 resets dependent selections without changing database data.

Paddy/shipment receiving (`POST /shipments/:id/deliver`) sends flat value, unit (KG) and received_bags. Server sets receiving time. No date, receipt number, override reason or remarks are entered. Wait for ARRIVED before receiving; shortages are calculated automatically. Retry with the same body and idempotency key to retain the original receiving time.

Import either updated collection (SFC_CMR or Paddy_Service_Live_API) and select the matching backend URL/environment. Existing environment IDs are updated along with collection IDs, so an old environment does not silently override freshly loaded IDs.

1. Run **Login / 01 Login administrator** with the correct account. Login now preserves run_id, reference IDs, vehicle and existing dates instead of generating a new demo setup each time.
2. Open **00 Quick CMR - saved setup / 01 Load existing setup**. This read-only request loads active season/Miller/depot assignments from this database. It saves their IDs and business codes. With multiple matches, select setup_season_code, setup_miller_code, setup_destination_code and setup_source_code from the response once, then reload. If several free GPS vehicles exist, select setup_vehicle_no. A busy vehicle is reported, never reassigned automatically.
3. Set cmr_order_no to the source's full LotNo, cmr_quantity_kg to the quantity in kg, cmr_lot_count to the lot count, and stenciling_code to the real code. Verify order_at and due_date against source dates/season. These are business inputs; the setup request supplies foreign-key IDs/codes.
4. Send **02 Import CMR order**. The source LotNo goes to order_no; no separate lot_no is sent. The successful response saves cmr_order_id/order_id automatically. Master registration and procurement responses also save relevant references. Use the appropriate Miller/PACS login for later role-restricted operations.

For a new order change cmr_order_no and its business inputs. For a retry keep the same body; set retry_key if retrying the same idempotent request. Re-running Admin login does not erase the saved setup. The setup loader is read-only and does not create, delete or overwrite master records.

If setup reports no matching assignment, create/activate the season, Miller, depot and Miller-store assignment through the existing Masters and mapping requests once. Paddy imports also need a PACS/LAMPS source; lifting needs its route tag to the allotted Miller. CMR submissions need a linked core store and a free active GPS-mapped vehicle. Each setup response explains missing prerequisites.

Use IDs returned by the selected backend, after mapping source-system MillerId/Depo/district codes. Source numeric IDs are not automatically local foreign-key IDs. REFERENCE_NOT_FOUND errors name the missing reference; RECORD_IN_USE identifies a referenced record that cannot be deleted. Correct the parent/reference instead of disabling foreign-key checks.

`npm run postman:simplify` regenerates saved-setup scripts and examples in both collections without resetting their stored variable values.
