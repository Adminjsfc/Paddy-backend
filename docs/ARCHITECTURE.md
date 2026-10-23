# Backend structure

The public API paths and payloads remain the same. The frontend and core backend do not need changes for this refactor. SQL migrations and command entrypoints are unchanged.

```text
src/
  app.js                     Express middleware and application composition
  server.js                  Startup checks, HTTP listener and shutdown
  mqtt-worker.js             MQTT process entrypoint
  config/                    CMR/core database pools and module/master registries
  routes/                    Paths, HTTP methods, access middleware and controllers
  controllers/               HTTP request/response adapters and mutation handlers
  services/                  Business rules and workflow orchestration
  repositories/              SQL, record persistence and row locks
  validators/                Shared and feature-specific Zod payload schemas
  middlewares/               Authentication, authorization, CORS, errors and idempotency
  utils/                     Quantities, hashing, GPS calculations, pagination and transactions
scripts/                     Migrations, import/seed commands and database validation
sql/                         Existing versioned migrations
test/                        Unit, HTTP, architecture and integration tests
```

## Following a request

`app.js` installs common middleware and calls `routes/index.js`. The route registry preserves the original authentication and middleware order. Feature route files select role guards and a controller; they do not execute queries.

A controller adapts the Express request with `utils/http.js`. Services receive a context containing the user, body, params, query and request ID, and never write to an Express response. Read services return the existing response body with HTTP metadata for the controller. Cookie effects are applied by the response adapter.

Mutation controllers use `middlewares/mutation.js`. It validates the payload and idempotency key, starts a transaction, and passes the same connection into the service. Repositories use that connection for reads, locks and writes; they never start an independent transaction. The idempotency response and audit record commit with the business operation.

Repositories own SQL execution. Services make business decisions such as stock availability, facility ownership, eligible assignments, acceptance and shortages. Query filters use validated fields and existing visibility rules. Repositories must not import services, controllers, routes or Express.

## Feature files

Each feature uses a common basename across its layers. Start with the route file and follow its controller into the service and repository.

| Feature | Basename |
|---|---|
| Login, cookies, users and refresh | `auth` |
| Generic facility/vehicle/GPS masters | `masters` |
| Miller registration | `millers` |
| DM CMR and Paddy setup | `dm-setup` |
| Miller submission options and CMR creation | `cmr-submissions` |
| AGM/Lifting Incharge receiving | `cmr-receiving` |
| Shipment allocation, dispatch, delivery and cancellation | `shipments` |
| Procurement, orders and milling | `procurement` |
| GPS ingestion and tracking | `gps` |
| Module permissions and profiles | `modules` |
| Seasonal Miller/store mappings | `store-assignments` |
| Source store lookup and matching | `store-locations` (service/repository only) |
| Stock, ledger and reconciliation reports | `reports` |

For example, receiving follows `routes/cmr-receiving.routes.js` → `controllers/cmr-receiving.controller.js` → `services/cmr-receiving.service.js` → `repositories/cmr-receiving.repository.js`. Accepted receipts call the shared shipment delivery service and stock service within the original transaction.

## Shared components

- `config/database.js`: local CMR connection pool. `config/core-database.js`: lazily created core pool used for existing read-only identity/assignment checks.
- `repositories/database.js`: parameterized `rows`, `one` and `insert` helpers.
- `utils/transaction.js`: transaction lifecycle and deadlock retries.
- `middlewares/mutation.js` and `repositories/request-keys.repository.js`: idempotency, replay and audit persistence.
- `services/stock.service.js`: balance/capacity rules. `repositories/stock.repository.js`: locked balances and ledger writes.
- `repositories/facilities.repository.js`: consistent facility lock ordering. `repositories/events.repository.js`: shipment events.
- `middlewares/verifyJWT.js`, `verifyCoreDM.js`, `verifyCoreReceiver.js`: separate native, DM and receiving identities. Their queries live in matching repositories.
- `middlewares/errors.js`: request IDs, 404 responses and centralized error mapping.
- `validators/schemas.js`: common payloads; feature schema files contain Miller registration, DM facility and CMR receiving/submission validation.

## Adding a feature

1. Define its payload schema in `validators/`.
2. Add queries to its repository with parameterized values and an explicit transaction connection for writes.
3. Implement its business rules in the service, reusing stock and shipment services where appropriate.
4. Add a controller that adapts the HTTP context; use `mutation()` for transactional writes.
5. Register the endpoint and access middleware in its route file, then mount any new router in `routes/index.js`.
6. Update API documentation and run the relevant tests.

`npm test` includes an architecture guard for layer boundaries and relative imports. `npm run check` validates JavaScript syntax and Postman JSON. Integration tests require a migrated dedicated database whose name ends in `_test`; never point them at the working CMR database. The existing integration fixtures now use current district/block IDs, vehicle types, dispatch driver details and seasonal store assignments.
