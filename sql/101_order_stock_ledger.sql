ALTER TABLE cmr_orders ADD COLUMN stock_credited_kg DECIMAL(20,3) UNSIGNED NOT NULL DEFAULT 0;
CREATE INDEX ix_ledger_balance_scope ON stock_ledger(facility_id,season_id,scheme_code,commodity_code,id);
