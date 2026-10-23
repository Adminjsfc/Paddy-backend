# Validation record

Validated on 9 October 2026 using Node.js 24.19.0 and MySQL 8.0.46. All tests used isolated local test data. No user production database or live e-uparjan system was accessed.

| Check | Result |
|---|---|
| JavaScript syntax and Postman JSON | Passed |
| Unit tests | 9 passed, 0 failed |
| MySQL-backed integration tests | 11 passed, 0 failed |
| Postman collection executed with Newman | 47 requests passed |
| Postman assertions | 98 passed, 0 failed |
| Production dependency audit | 0 reported vulnerabilities at validation time |

The dependency audit is a point-in-time registry result, not a guarantee about future advisories.

## Verified behaviors

- 100 QTL paddy converts to a 68-QTL rice obligation at 68%; configurable ratios and precise unit conversions.
- Salted password verification and miller/transporter ownership rules.
- MySQL schema creation and constraints.
- Registration of farmers, PACS, LAMPS, millers, SFC/FCI facilities, transporters, vehicles and GPS devices.
- Route-kind validation and scope restrictions.
- Concurrent identical push retries create procurement once.
- Repeated business references do not duplicate stock; changed payloads conflict.
- A partly invalid procurement batch rolls back entirely.
- Reservation/dispatch/receipt stock movements and double-consumption protection.
- Competing concurrent reservations cannot spend the same stock twice.
- Consignment cancellation releases reservations and order commitments.
- GPS source/departure/destination processing, sorted historical batches, duplicate suppression and older-packet rejection for trip advancement.
- Frozen recovery ratio on paddy receipts after a later settings change.
- Milling consumes paddy, generates rice and preserves a consistent ledger.
- CMR order imports support SFC and FCI destinations.
- SFC-only rice acceptance, required GPS arrival or an audited operator override.
- Rice shortage leaves an open order balance and appears in reconciliation.
- The full Postman happy path produces and accepts 6,800 kg rice from 10,000 kg paddy; obligation balance becomes zero.
- Postman FCI order import, amendment and unused-order cancellation.
- Capacity reduction below stock, future GPS and out-of-scope vehicle access are rejected.

## Scope of validation

The SQL/API suite used a real MySQL 8.0.46 instance, not an in-memory substitute. The Postman collection was executed against the running HTTP application. Generated IDs/tokens were passed between requests automatically.

Live e-uparjan connectivity, production GPS hardware/broker connectivity, the optional MQTT worker's broker redelivery behavior, Docker deployment, systemd installation, TLS certificates, production performance/load and disaster recovery were not exercised. They require the deployment team's environment and approved integration details. The HTTP GPS path, core transition logic and stock workflows were exercised. The included tests can be rerun on a dedicated `_test` database using the deployment guide.
