ALTER TABLE cmr_receipts
  MODIFY COLUMN gross_kg DECIMAL(20,3) NULL,
  MODIFY COLUMN tare_per_bag_kg DECIMAL(20,3) NULL,
  MODIFY COLUMN tare_kg DECIMAL(20,3) NULL,
  MODIFY COLUMN red_grains_percent DECIMAL(5,2) NULL,
  MODIFY COLUMN chalky_grains_percent DECIMAL(5,2) NULL,
  MODIFY COLUMN compliance_confirmed BOOLEAN NULL;
