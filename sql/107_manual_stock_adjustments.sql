CREATE TABLE stock_adjustments (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  stock_id BIGINT UNSIGNED NOT NULL,
  old_quantity_kg DECIMAL(20,3) NOT NULL,
  new_quantity_kg DECIMAL(20,3) NOT NULL,
  delta_kg DECIMAL(20,3) NOT NULL,
  remarks VARCHAR(500) NOT NULL,
  created_by INT UNSIGNED NULL,
  created_by_actor VARCHAR(160) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_stock_adjustments_stock FOREIGN KEY(stock_id) REFERENCES stocks(id) ON DELETE RESTRICT,
  CONSTRAINT fk_stock_adjustments_user FOREIGN KEY(created_by) REFERENCES users(id),
  INDEX ix_stock_adjustments_stock(stock_id,id)
) ENGINE=InnoDB;
