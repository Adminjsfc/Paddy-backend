# Deployment guide

## Prerequisites

- Node.js 24.x and npm.
- MySQL 8.0.16+ for enforced CHECK constraints; this delivery was exercised against MySQL 8.0.46.
- A new database, e.g. `sfc_cmr`; do not apply this schema to the existing trip-service database without an explicit migration plan.
- Nginx/another TLS reverse proxy for public access. The API defaults to localhost.

Dependencies are pinned in `package-lock.json`. Use `npm ci` to reproduce the validated install. The package is ESM (`"type":"module"`). All SQL uses MySQL placeholders; no database password is embedded in source.

## 1. Extract and configure

```bash
unzip SFC_Paddy_CMR_NodeJS_MySQL.zip
cd sfc-cmr-service
cp .env.example .env
chmod 600 .env
npm ci
```

Edit `.env` with your values. Generate two independent integration keys, for example by running `openssl rand -hex 32` twice. Set a unique bootstrap administrator password of at least 12 characters. The server rejects unconfigured/example keys and equal integration/GPS keys.

## 2. Create database accounts

Edit `deploy/bootstrap-database.sql`, replacing both passwords. Run it as a DBA. It creates a runtime account limited to DML and a separate migration account. Change `'localhost'` to the application host or appropriately restricted network host when connecting remotely. Do not grant the runtime account access to unrelated databases.

Create `.env.migration` as a private copy of `.env`, with `DB_USER` and `DB_PASSWORD` set to the migration account:

```bash
cp .env .env.migration
chmod 600 .env.migration
# Edit migration account credentials in .env.migration.
node --env-file=.env.migration scripts/migrate.js
```

The SQL runner applies the versioned file once, guarded by a MySQL advisory lock and `schema_migrations`. MySQL DDL commits implicitly. If a first deployment fails mid-DDL, inspect the error and partial schema before re-running; the migration is not a transactionally reversible schema change. Keep backups before future version upgrades.

### Location master prerequisites

Migration `008a_location_masters.sql` creates `tbl_district_master` and `tbl_block_master` if missing, before migration `009` references them. It also runs on existing installations and preserves imported tables and data using `CREATE TABLE IF NOT EXISTS`. It does not alter incompatible existing tables or seed district/block records. Import authoritative district and block data using the original source IDs before registering facilities or using core DM district assignments. Do not invent replacement IDs.

Both tables must use InnoDB and have an indexed, signed `INT` column named `id`, matching the foreign key columns in migrations `009` and `012`. If the source uses a different type or signedness, review and align the referencing column definitions before migration. The API also expects district fields `id_old`, `district_name`, `status`, and block fields `district_id`, `block_name`, `rgi_block_code`.

The runner checks the referenced table, engine, ID type, and index before migrations `009` and `012`. A missing or incompatible master table otherwise appears as MySQL/MariaDB error 150, "Foreign key constraint is incorrectly formed". Run `npm run db:migrate` to create any missing tables, then import and verify authoritative master data. Do not manually mark migration `009` as applied.

If using your existing three-node InnoDB Cluster, connect this service to the Router's **write/primary endpoint**, commonly port `6446` if unchanged. Do not point it at the read-only endpoint. All stock decisions and transactions must use the primary. Keep any existing Router settings and node credentials separate from this project's examples. For remote DB TLS, set `DB_SSL_CA_FILE` to the CA PEM path; verification stays enabled.

## 3. Create the first administrator

### Import receiving facilities from the local store catalog

After loading authoritative district, block and store data and applying migrations, preview the import:

```bash
npm run db:import-stores -- --capacity-unit=MT --radius-unit=KM
```

Apply it with:

```bash
npm run db:import-stores -- --capacity-unit=MT --radius-unit=KM --apply
```

The source units were confirmed as metric tonnes for capacity and kilometres for radius. The script converts them to grams/metres, maps `store_type=1` to `FCI` and `store_type=2` to `SFC_GODOWN`, and saves `core_store_id`. It matches block source codes within their districts; missing or ambiguous block matches remain NULL and are reported. The source has no street-address field, so the facility address is a location label composed of store, block and district names. Imported creator IDs remain NULL rather than reusing unrelated source user IDs. Inactive source records remain inactive.

Missing/invalid coordinates, capacity, radius, names or district references cause the record to be skipped; no operational values are invented. The JSON report is written to `docs/store-facility-import-report.json` (override with `--report=...`). Existing linked facilities are preserved; compatible existing codes are linked without overwriting their operational settings. Repeated imports do not duplicate facilities. Correct skipped source records and rerun the same command. This imports receiving facilities only; season assignments, CMR orders and rice inventory are separate workflows.

For shared core DM access, configure `CORE_DM_ENABLED=true`, the same access-token verification secret as the core backend in `CORE_JWT_ACCESS_SECRET`, and `CORE_DB_HOST`, `CORE_DB_PORT`, `CORE_DB_NAME`, `CORE_DB_USER`, `CORE_DB_PASSWORD`. Use `CORE_DB_SSL_CA_FILE` for a remote database requiring TLS. Provision read access to `tbl_user_master` and `tbl_user_districtwise_store_assignment` on the authoritative core database. Requests check current core account status and district assignments. These settings are server-only; never put the JWT signing secret or core DB credentials in the frontend. Core and CMR district IDs must be aligned. Core DMs can retrieve setup options through `/api/v1/core/dm/options`; this and other core DM endpoints require the same verified access token and configuration.

```bash
npm run admin:create
```

The script refuses to overwrite an existing account. After successful creation, remove `ADMIN_PASSWORD` from `.env` and restrict access to `.env.migration`. Other application accounts are created through `POST /users`.

## 4. Start and verify

Apply migration `013_cookie_sessions.sql` before running the cookie/refresh authentication version. Existing bearer sessions remain valid until their original expiry, but require a fresh login to obtain refresh cookies.

For the local Vite frontend, set `FRONTEND_ORIGINS=http://localhost:5173,http://127.0.0.1:5173`, `COOKIE_SECURE=false`, `COOKIE_SAME_SITE=lax`, `COOKIE_PATH=/api/v1`, `ACCESS_TOKEN_MINUTES=15`, and `REFRESH_SESSION_DAYS=7`. Set its API base to `http://localhost:3015/api/v1/` when the frontend uses localhost (or use 127.0.0.1 consistently for both). The trailing slash is required by the legacy Axios client. Replace these origins with the exact deployed UI origins and set `COOKIE_SECURE=true` for production HTTPS. If a reverse proxy exposes the API under a different external path (for example `/paddyapi/`), set `COOKIE_PATH` to that external path (for example `/paddyapi`) so the browser sends session and refresh cookies to it. Cross-site deployments require `COOKIE_SAME_SITE=none` with `COOKIE_SECURE=true`, and browser requests must include credentials; third-party-cookie restrictions may still apply. Prefer serving the frontend and API on the same site. `SESSION_HOURS` is superseded by `ACCESS_TOKEN_MINUTES` for new sessions.

```bash
npm start
```

In another terminal:

```bash
curl http://127.0.0.1:3015/health/live
curl http://127.0.0.1:3015/health/ready
```

Both should return HTTP 200. Import the Postman collection/environment; use a test database for the full demonstration because it creates stock and movements. Set the environment base URL to `http://127.0.0.1:3015/api/v1`. A new complete collection run uses unique codes; re-running only one action with a changed body requires a new idempotency key.

## 5. Run with systemd on Ubuntu

The supplied units assume project files at `/opt/sfc-cmr-service`, user/group `ubuntu`, and Node at `/usr/bin/node`. Check `command -v node` and adjust `ExecStart` if needed. With `ProtectHome=true`, an nvm binary under `/home/ubuntu` will not be accessible; use a system-installed Node binary or adjust the unit to your approved setup.

After copying the project to the configured directory and setting file ownership:

```bash
sudo cp deploy/sfc-cmr.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now sfc-cmr
sudo systemctl status sfc-cmr --no-pager
journalctl -u sfc-cmr -n 100 --no-pager
```

Restart after updating code/config:

```bash
sudo systemctl restart sfc-cmr
```

The process drains HTTP connections on shutdown and closes the MySQL pool. HTTP errors include `X-Request-Id`; server logs retain this ID and a failure code, without request bodies or passwords.

## 6. Reverse proxy

Copy the location block from `deploy/nginx.conf` into an existing HTTPS server configuration. With the `/sfc-cmr/` prefix, the external API base becomes:

```text
https://YOUR-DOMAIN/sfc-cmr/api/v1
```

Set `TRUST_PROXY_HOPS=1` when exactly one trusted Nginx instance forwards to the localhost-bound API. Validate and reload:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

The package does not provision a certificate or change your DNS. Cross-origin browser access requires the exact UI origin in `FRONTEND_ORIGINS`; same-origin browser access works without it. Do not open MySQL publicly to make this API reachable.

## 7. Optional MQTT GPS worker

HTTP GPS ingestion works without this worker. For normalized MQTT packets, set `MQTT_URL`, credentials, topic and a stable unique `MQTT_CLIENT_ID` in `.env`. Use TLS (`mqtts://` or `wss://`) for remote brokers. `MQTT_CA_FILE` supports a private CA. TLS verification is never disabled.

```bash
npm run gps:mqtt
```

Or install the separate unit:

```bash
sudo cp deploy/sfc-cmr-gps.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now sfc-cmr-gps
journalctl -u sfc-cmr-gps -n 100 --no-pager
```

Default topic: `gps/+/data`. Register devices before sending their packets. Configure the broker/publisher for QoS 1 and a durable session; QoS 0 cannot provide redelivery during an outage. Use only one worker with the configured client ID. Broker routing, retention and ACL configuration belong to the actual GPS provider deployment.

## 8. Docker alternative

Add a strong `MYSQL_ROOT_PASSWORD` to `.env` for Compose. It is required only by the Docker database container. Set `DB_USER` to a non-root application user. Then:

```bash
docker compose up -d db
docker compose build api
docker compose run --rm api npm run db:migrate
docker compose run --rm api npm run admin:create
docker compose up -d api
docker compose logs --tail=100 api
```

The simple Compose setup gives its application user database-local privileges for initial migration. For a stricter deployment, bootstrap separate migration/runtime users as above and restrict runtime grants after schema installation. The DB is not published on a host port. API port 3015 is published only to host loopback. `.env`, tests and dependencies from your machine are not copied into the Docker image. Compose uses a persistent volume; do not use `down -v` on production data.

The Docker/systemd configurations are supplied examples; they were not deployed to the user's server during this delivery.

## 9. Automated validation

```bash
npm run check
npm test
```

For MySQL integration tests, create a dedicated database/user and copy `.env.test.example` to `.env.test`. `DB_NAME` must end in `_test`; the suite refuses other database names. Apply migrations to that test DB first:

```bash
node --env-file=.env.test scripts/migrate.js
npm run test:integration
```

The suite creates uniquely named records and does not truncate/drop tables. Do not use production credentials. After test review, have the DBA retire the dedicated test database when appropriate.

## Operations

- Keep MySQL backups and binary logs according to your organization's recovery policy. A successful HTTP response follows database commit; a lost HTTP response can be retried with the same idempotency key.
- MySQL is the source of truth; Redis is not required.
- Default pool limit is 10 per API/worker process. Budget combined connection usage before adding processes.
- Rate limiting is process-local. Coordinate limits at the reverse proxy if deploying multiple API instances.
- GPS history and audit/idempotency tables grow over time. Agree retention, archive and backup policies before introducing scheduled cleanup; this package does not silently delete records.
- `gps_packets(device_id,gps_at)` supports bounded history scans. Keep API history windows bounded and paginate exports.
- If a request returns 503 `TRANSACTION_BUSY`, retry with the same key/body. Do not submit new shipment numbers to bypass a conflict.
- Check stock ledger reconciliation, shortages and open CMR obligations regularly; a GPS arrival alone is not proof of received quantity.

Technical references consulted: [Express error handling](https://expressjs.com/en/5x/guide/error-handling/), [MySQL2 documentation](https://sidorares.github.io/node-mysql2/docs/documentation), [MySQL locking reads](https://dev.mysql.com/doc/refman/8.0/en/innodb-locking-reads.html).

Local store catalog: migration `018_store_location_master.sql` creates `tbl_store_location_master` if missing. It preserves an already imported table and does not seed or overwrite store data. CMR uses this local catalog for SCMR/CCMR dropdowns and submission validation. Import store records separately with their original IDs; core DM identity verification still uses its separate core database connection.
