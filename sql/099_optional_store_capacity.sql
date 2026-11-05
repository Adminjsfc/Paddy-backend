-- Store master capacity may be unspecified. Preserve this as NULL, not an invented capacity.
ALTER TABLE facilities
  MODIFY COLUMN capacity_value DECIMAL(23,6) UNSIGNED NULL,
  MODIFY COLUMN capacity_unit ENUM('KG','QTL','MT') NULL;
