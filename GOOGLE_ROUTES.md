# Shipment driving routes

Configure `GOOGLE_API_KEY` in `.env`, enable Google Directions API for its project,
and apply `npm run db:migrate`. The key stays on the server.

Lifting/shipment creation generates a driving route using the source/destination
facility coordinates only if that ordered source/destination pair has no saved
route. `shipment_routes` reuses each pair without automatic expiry or regeneration,
including across seasons. Assignment alone does not call Google. The estimate
uses driving directions without live traffic. A reverse journey is a different pair.

Lifting finds or creates the shared route in `shipment_routes` by source/destination
and saves its auto-increment ID in `shipments.route_id` (foreign key). Backend
details and GPS alerts read the route through that ID. Its GeoJSON
LineString uses `[longitude, latitude]`, matching the GPS alert service's
off-route reader. The encoded polyline is available for map display.

Assignment and shipment creation responses include `route`. Shipment details
(`GET /shipments/:id`) also include `route`, with `encoded_polyline`, `geometry`,
`distance_km`, integer `duration_minutes`.
Existing shipments without a saved source/destination route return `route: null`.

Routes have `created_at`, `updated_at`, `created_by`, `updated_by`, and `status`.
Creation records the logged-in user. Existing routes preserve their original
creator. Dates update automatically on changes. Status 1 is active and 0 is
inactive; an inactive saved pair blocks lifting rather than regenerating a route.
GPS off-route checks use active routes. Migration backfills shipment route IDs
where matching saved source/destination routes already exist.

Dispatch uses the saved duration to populate `expected_completion_at` from
`dispatched_at` when neither the request nor shipment supplies an ETA.
An explicitly supplied ETA is preserved, including an explicit null.

Invalid coordinates, no driving route, or Google failures reject the mutation;
its database changes roll back. No straight-line fallback is saved as a road
route. Google failures return `GOOGLE_ROUTES_REJECTED` or
`GOOGLE_ROUTES_UNAVAILABLE` without exposing the API key.

Shipment endpoint normalization (migration 063):

- shipments stores mandatory route_id; source_id and destination_id live only in shipment_routes.
- shipment_details is a MERGE SQL view joining shipments to shipment_routes with explicit columns. API reads use it to retain derived source/destination fields for stock, receiving, access checks and reports.
- Both backends use this shared view. GPS workers continue using the shipment geofence coordinate snapshots.
- Legacy shipments without a generated polyline receive an endpoint-only route record with null geometry/distance/duration. This does not invent a road route. The next lifting for that pair completes the route through Google.
- Database triggers reject changes to route endpoints and reassignment of a shipment's route. Status, geometry and audit updates are still allowed.
- When adding shipment columns in future migrations, rebuild shipment_details to expose new fields.

Actual-start ETA (migration 065): dispatch may set a provisional ETA, but the GPS trip-start update recalculates expected_completion_at as trip_started_at + shipment_routes.duration_minutes. Both the trip worker and backend GPS path use the actual GPS start time. Missing duration leaves ETA null. Existing active trip ETAs are backfilled by migration 065.
