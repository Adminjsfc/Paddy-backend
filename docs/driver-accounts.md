Driver accounts
===============

Run `npm run db:migrate` before deploying this code. Migration 041 adds the DRIVER
role, unique user phone, driver ownership associations and shipments.driver_user_id.
Existing historical shipments are unchanged; create/dispatch operations link accounts.
Migration 042 stores the original owner's facility in users.facility_id for drivers
and backfills existing accounts from the creator or ownership associations.
Additional owners do not overwrite this original facility; driver_owners retains
all facility associations. Create/list/login responses include facility_id.

PACS, LAMPS and MILLER users can create drivers with `POST /api/v1/drivers`:

```json
{"name":"Driver One","phone":"9999999999"}
```

Send the existing authentication cookie/Bearer token and an `Idempotency-Key` header
(8–120 characters). An optional `password` must contain 12–128 characters.
The server determines ownership from the logged-in user's facility or miller scope;
clients cannot select another owner. `GET /api/v1/drivers` lists drivers associated
with that facility. A driver may work for multiple facilities using the same login.

The creation response's `data` contains `id`, `name`, `phone`, `created`, and, only
for a newly created account, `initial_password`. Deliver these credentials to the
driver securely. Reusing a driver does not change their password. Inactive accounts
and phone numbers belonging to non-driver users return HTTP 409.

Shipment creation (PADDY and CMR), CMR submissions and dispatch automatically reuse
or create the account from `driver_name` and `driver_phone`. `driver_contact` is also
accepted as an alias for `driver_phone`; conflicting fields are rejected. The
shipment mutation response includes `driver_user_id` and `driver_account`, with
`initial_password` inside `driver_account` only when an account was created.
Account creation and shipment changes share a transaction and roll back together.
At dispatch, details already saved on the shipment are used if omitted.

Driver login uses `POST /api/v1/auth/login` (or `/api/v1/multilogin`):

```json
{"phone":"9999999999","password":"<initial_password>"}
```

For existing clients, the mobile number may instead be supplied in `email`.
Email login for existing roles is unchanged. Use the same contact format at creation
and login (including any country prefix). Existing password change, refresh, logout
and `/auth/me` endpoints work for drivers. Change the initial password through
`POST /api/v1/auth/password` using `current_password` and `new_password`.

Drivers may read only their assigned shipments through `GET /api/v1/shipments`
and `GET /api/v1/shipments/:id`; other operational routes are denied.
