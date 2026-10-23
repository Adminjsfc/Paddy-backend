INSERT INTO schemes (code,scheme_name,description,active)
VALUES ('LEGACY_UNSPECIFIED','Legacy unspecified','Historical balances without an authoritative scheme. Reconcile before new allocation.',0);

ALTER TABLE stocks ADD COLUMN scheme_code VARCHAR(80) NULL;
UPDATE stocks SET scheme_code='LEGACY_UNSPECIFIED';
ALTER TABLE stocks
 MODIFY scheme_code VARCHAR(80) NOT NULL,
 MODIFY commodity VARCHAR(80) NOT NULL,
 DROP PRIMARY KEY,
 ADD PRIMARY KEY(facility_id,season_id,scheme_code,commodity),
 ADD FOREIGN KEY(scheme_code) REFERENCES schemes(code),
 ADD FOREIGN KEY(commodity) REFERENCES commodities(code);

ALTER TABLE stock_ledger ADD COLUMN scheme_code VARCHAR(80) NULL;
UPDATE stock_ledger SET scheme_code='LEGACY_UNSPECIFIED';
ALTER TABLE stock_ledger
 MODIFY scheme_code VARCHAR(80) NOT NULL,
 MODIFY commodity VARCHAR(80) NOT NULL,
 ADD FOREIGN KEY(scheme_code) REFERENCES schemes(code),
 ADD FOREIGN KEY(commodity) REFERENCES commodities(code),
 ADD INDEX idx_ledger_scheme(facility_id,season_id,scheme_code,commodity,id);

ALTER TABLE procurement
 ADD COLUMN scheme_code VARCHAR(80) NULL,
 ADD COLUMN commodity VARCHAR(80) NOT NULL DEFAULT 'PADDY';
UPDATE procurement SET scheme_code='LEGACY_UNSPECIFIED';
ALTER TABLE procurement
 MODIFY scheme_code VARCHAR(80) NOT NULL,
 ADD FOREIGN KEY(scheme_code) REFERENCES schemes(code),
 ADD FOREIGN KEY(commodity) REFERENCES commodities(code),
 ADD CHECK(commodity='PADDY'),
 ADD INDEX idx_procurement_scheme(facility_id,season_id,scheme_code,procured_at,id);

ALTER TABLE cmr_orders
 ADD COLUMN scheme_code VARCHAR(80) NULL,
 ADD COLUMN commodity VARCHAR(80) NOT NULL DEFAULT 'RICE';
UPDATE cmr_orders SET scheme_code='LEGACY_UNSPECIFIED';
ALTER TABLE cmr_orders
 MODIFY scheme_code VARCHAR(80) NOT NULL,
 ADD FOREIGN KEY(scheme_code) REFERENCES schemes(code),
 ADD FOREIGN KEY(commodity) REFERENCES commodities(code),
 ADD CHECK(commodity='RICE');

ALTER TABLE shipments ADD COLUMN scheme_code VARCHAR(80) NULL;
UPDATE shipments SET scheme_code='LEGACY_UNSPECIFIED';
ALTER TABLE shipments
 MODIFY scheme_code VARCHAR(80) NOT NULL,
 ADD FOREIGN KEY(scheme_code) REFERENCES schemes(code);

ALTER TABLE milling_batches ADD COLUMN scheme_code VARCHAR(80) NULL;
UPDATE milling_batches SET scheme_code='LEGACY_UNSPECIFIED';
ALTER TABLE milling_batches
 MODIFY scheme_code VARCHAR(80) NOT NULL,
 ADD FOREIGN KEY(scheme_code) REFERENCES schemes(code);

ALTER TABLE test_stock_entries ADD COLUMN scheme_code VARCHAR(80) NULL;
UPDATE test_stock_entries SET scheme_code='LEGACY_UNSPECIFIED';
ALTER TABLE test_stock_entries
 MODIFY scheme_code VARCHAR(80) NOT NULL,
 ADD FOREIGN KEY(scheme_code) REFERENCES schemes(code);
